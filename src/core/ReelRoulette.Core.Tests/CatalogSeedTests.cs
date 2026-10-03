using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class CatalogSeedTests
{
    [Theory]
    [InlineData("Clips/Night.MP4")]
    [InlineData("ÄÖÜ Straße İSTANBUL ΣΟΦΙΑ")]
    public void Fold_MatchesTheCatalogStore(string value)
    {
        Assert.Equal(LibraryCatalogStore.Fold(value), CatalogSeed.Fold(value));
    }

    [Fact]
    public void Write_CreatesTheSameSchemaAsTheCatalogStore()
    {
        var root = Path.Combine(Path.GetTempPath(), "rr-catalog-seed-" + Guid.NewGuid().ToString("N"));
        try
        {
            var seeded = Path.Combine(root, "seeded");
            CatalogSeed.Write(seeded);
            var created = Path.Combine(root, "created");
            Assert.Equal(LibraryCatalogOpenStatus.Opened, CatalogOpen.Open(created).Status);

            Assert.Equal(
                DescribeSchema(Path.Combine(created, "library.db")),
                DescribeSchema(Path.Combine(seeded, "library.db")));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void Write_OpensAsAHealthyCatalog_AndReadsBackEveryColumn()
    {
        var directory = Path.Combine(Path.GetTempPath(), "rr-catalog-seed-" + Guid.NewGuid().ToString("N"));
        try
        {
            var played = new DateTime(2024, 3, 4, 5, 6, 7, DateTimeKind.Utc);
            CatalogSeed.Write(
                directory,
                sources: [new SeedSource("src", "/Media", "Clips", IsEnabled: false)],
                categories: [new SeedCategory("people", "People", 1)],
                tags: [new SeedTag("Alice", "people")],
                presets: [new SeedPreset("Night", """{"favoritesOnly":true}""")],
                items:
                [
                    new SeedItem("item-1", "/Media/A.mp4")
                    {
                        SourceId = "src",
                        RelativePath = "A.mp4",
                        Duration = TimeSpan.FromSeconds(12),
                        HasAudio = true,
                        IntegratedLoudness = -14.5,
                        PeakDb = -1.25,
                        LoudnessError = "failed",
                        IsFavorite = true,
                        IsBlacklisted = true,
                        PlayCount = 3,
                        LastPlayedUtc = played,
                        MediaType = 1,
                        Fingerprint = "abc",
                        FingerprintAlgorithm = "MD5",
                        FingerprintVersion = 2,
                        FileSizeBytes = 42,
                        LastWriteTimeUtc = played.AddDays(-1),
                        FingerprintLastUtc = played.AddDays(-2),
                        FingerprintStatus = 3,
                        ThumbnailRevision = "rev",
                        ThumbnailWidth = 320,
                        ThumbnailHeight = 180,
                        Tags = ["Alice", "Extra"]
                    }
                ]);

            var opened = CatalogOpen.Open(directory);

            Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
            var snapshot = opened.Snapshot()!;
            var source = Assert.Single(snapshot.Sources);
            Assert.Equal(("src", "/Media", "/media", "Clips", false), (source.Id, source.RootPath, source.RootPathFold, source.DisplayName, source.IsEnabled));
            Assert.Equal(
                [("people", "People", 1), ("uncategorized", "Uncategorized", int.MaxValue)],
                snapshot.Categories.Select(category => (category.Id, category.Name, category.SortOrder)));
            var tag = Assert.Single(snapshot.Tags);
            Assert.Equal(("Alice", "alice", "people"), (tag.Name, tag.NameFold, tag.CategoryId));

            var item = Assert.Single(snapshot.Items);
            Assert.Equal("item-1", item.Id);
            Assert.Equal("src", item.SourceId);
            Assert.Equal(("/Media/A.mp4", "/media/a.mp4"), (item.FullPath, item.FullPathFold));
            Assert.Equal(("A.mp4", "a.mp4"), (item.RelativePath, item.RelativePathFold));
            Assert.Equal(("A.mp4", "a.mp4"), (item.FileName, item.FileNameFold));
            Assert.Equal(TimeSpan.FromSeconds(12).Ticks, item.DurationTicks);
            Assert.True(item.HasAudio);
            Assert.Equal(-14.5, item.IntegratedLoudness);
            Assert.Equal(-1.25, item.PeakDb);
            Assert.Equal("failed", item.LoudnessError);
            Assert.True(item.IsFavorite);
            Assert.True(item.IsBlacklisted);
            Assert.Equal(3, item.PlayCount);
            Assert.Equal(played, item.LastPlayedUtc);
            Assert.Equal(1, item.MediaType);
            Assert.Equal(("abc", "MD5", 2), (item.Fingerprint, item.FingerprintAlgorithm, item.FingerprintVersion));
            Assert.Equal(42, item.FileSizeBytes);
            Assert.Equal(played.AddDays(-1), item.LastWriteTimeUtc);
            Assert.Equal(played.AddDays(-2), item.FingerprintLastUtc);
            Assert.Equal(3, item.FingerprintStatus);
            Assert.Equal(("rev", 320, 180), (item.ThumbnailRevision, item.ThumbnailWidth, item.ThumbnailHeight));
            Assert.Equal(["Alice", "Extra"], item.Tags);

            var preset = Assert.Single(opened.Session!.ReadPresets());
            Assert.Equal(("Night", """{"favoritesOnly":true}"""), (preset.Name, preset.FilterStateJson));
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }

    /// <summary>
    /// Lists the user version, then each table with its columns (type, nullability, key, default) and its indexes with their columns.
    /// </summary>
    private static List<string> DescribeSchema(string databasePath)
    {
        using var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString());
        connection.Open();

        var lines = new List<string> { $"user_version {Query(connection, "PRAGMA user_version;").Single()[0]}" };
        var tables = Query(connection, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
            .Select(row => (string)row[0]!);
        foreach (var table in tables)
        {
            lines.Add($"table {table}");
            foreach (var column in Query(connection, "SELECT name, type, \"notnull\", pk, dflt_value FROM pragma_table_info($name) ORDER BY cid;", table))
            {
                lines.Add($"  column {column[0]} {column[1]} notnull={column[2]} pk={column[3]} default={column[4] ?? "none"}");
            }

            foreach (var index in Query(connection, "SELECT name, \"unique\", origin, partial FROM pragma_index_list($name) ORDER BY name;", table))
            {
                var columns = Query(connection, "SELECT name FROM pragma_index_info($name) ORDER BY seqno;", (string)index[0]!)
                    .Select(row => row[0]);
                lines.Add($"  index {index[0]} unique={index[1]} origin={index[2]} partial={index[3]} ({string.Join(", ", columns)})");
            }
        }

        return lines;
    }

    private static List<object?[]> Query(SqliteConnection connection, string sql, string? name = null)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        if (name != null)
        {
            command.Parameters.AddWithValue("$name", name);
        }

        using var reader = command.ExecuteReader();
        var rows = new List<object?[]>();
        while (reader.Read())
        {
            var row = new object?[reader.FieldCount];
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }

            rows.Add(row);
        }

        return rows;
    }
}
