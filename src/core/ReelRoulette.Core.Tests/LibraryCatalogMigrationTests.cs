using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// A catalog at an older schema version is upgraded in place when it is opened or imported. Every test that
/// can upgrade is in this class, so the interrupt hook never reaches an upgrade another test runs.
/// </summary>
public sealed class LibraryCatalogMigrationTests
{
    /// <summary>
    /// Every schema version from the oldest shipped one to the one before current. A schema version bump adds
    /// the version it replaces here, so it fails until the seed has that version's tables and the store has
    /// its upgrade step.
    /// </summary>
    public static IEnumerable<object[]> OlderSchemaVersions() =>
        Enumerable.Range(LibraryCatalogStore.OldestUpgradableSchemaVersion, LibraryCatalogStore.SchemaVersion - LibraryCatalogStore.OldestUpgradableSchemaVersion)
            .Select(version => new object[] { version });

    [Theory]
    [MemberData(nameof(OlderSchemaVersions))]
    public void Open_OlderCatalog_UpgradesToTheCurrentSchemaAndKeepsItsItems(int version)
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteSchemaVersion(
            dir.Path,
            version,
            sources: [new SeedSource("on", "/media", "On")],
            items:
            [
                new SeedItem("a", "/media/Beta.mp4") { SourceId = "on", PlayCount = 2, Tags = ["Ann"] },
                new SeedItem("b", "/media/alpha.jpg") { SourceId = "on", MediaType = 1 }
            ],
            tags: [new SeedTag("Ann")],
            presets: [new SeedPreset("Night", """{"favoritesOnly":true}""")]);
        var before = LibraryCatalogStore.Read(Path.Combine(dir.Path, "library.db"));

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(version, opened.MigratedFromSchemaVersion);
        Assert.Equal(DescribeNewCatalog(), CatalogSeedTests.DescribeSchema(opened.Session!.DatabasePath));
        Assert.Equal(
            before.Items.Select(item => (item.Id, item.FileName, item.MediaType, item.PlayCount, string.Join("|", item.Tags))),
            opened.Snapshot()!.Items.Select(item => (item.Id, item.FileName, item.MediaType, item.PlayCount, string.Join("|", item.Tags))));
        Assert.Equal("Night", Assert.Single(opened.Session.ReadPresets()).Name);
    }

    [Theory]
    [MemberData(nameof(OlderSchemaVersions))]
    public void PrepareIncoming_OlderExport_IsUpgradedBeforeItIsPublished(int version)
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        CatalogSeed.Write(dir.Path, items: [new SeedItem("current", "/clips/current.mp4")]);
        var export = CatalogSeed.WriteAtVersion(source.Path, version, items: [new SeedItem("import", "/clips/Import.mp4")], standalone: true);

        LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, export);

        var incoming = Path.Combine(dir.Path, LibraryCatalogStore.IncomingFileName);
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Usable, LibraryCatalogStore.InspectCatalogFile(incoming));
        Assert.Equal(DescribeNewCatalog(), CatalogSeedTests.DescribeSchema(incoming));
        LibraryCatalogStore.PublishIncoming(dir.Path);
        var opened = CatalogOpen.Open(dir.Path);
        Assert.Null(opened.MigratedFromSchemaVersion);
        Assert.Equal("import", Assert.Single(opened.Snapshot()!.Items).Id);
    }

    [Fact]
    public void Open_Schema3Catalog_ClearsEveryPeak_AndMarksVideosAsScannedBeforeThePeak()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteSchemaVersion(
            dir.Path,
            3,
            items:
            [
                new SeedItem("with-audio", "/media/with-audio.mp4") { HasAudio = true, IntegratedLoudness = -20.5, PeakDb = -5.0 },
                new SeedItem("without-audio", "/media/without-audio.mp4") { HasAudio = false },
                new SeedItem("not-scanned", "/media/not-scanned.mp4"),
                new SeedItem("photo", "/media/photo.jpg") { MediaType = 1, PeakDb = -5.0 }
            ]);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        var rows = ReadRows(
            opened.Session!.DatabasePath,
            "SELECT id, peak_db, integrated_loudness, loudness_analysis_version FROM items ORDER BY id;");
        Assert.Equal(
            [
                "not-scanned peak=none loudness=none version=1",
                "photo peak=none loudness=none version=0",
                "with-audio peak=none loudness=-20.5 version=1",
                "without-audio peak=none loudness=none version=1"
            ],
            rows.Select(row => $"{row[0]} peak={row[1] ?? "none"} loudness={row[2] ?? "none"} version={row[3]}"));
    }

    [Fact]
    public void Open_Schema2Catalog_MigratesInPlaceWithEveryKeyFilled()
    {
        using var dir = new TempDirectory();
        SeedSchema2(dir.Path);
        var before = LibraryCatalogStore.Read(Path.Combine(dir.Path, "library.db"));

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(LibraryCatalogStore.OldestUpgradableSchemaVersion, opened.MigratedFromSchemaVersion);
        var databasePath = opened.Session!.DatabasePath;
        Assert.Equal(LibraryCatalogStore.SchemaVersion, ReadUserVersion(databasePath));
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Usable, LibraryCatalogStore.InspectCatalogFile(databasePath));
        foreach (var (fileName, key) in ReadKeys(databasePath))
        {
            Assert.Equal(LibraryCatalogNameSortKey.Compute(fileName), key);
        }

        Assert.Equal("1", ReadMeta(databasePath, "name_sort_key_version"));
        Assert.Equal(0, opened.Session.Revision);
        Assert.Equal(DescribeNewCatalog(), CatalogSeedTests.DescribeSchema(databasePath));
        Assert.DoesNotContain("idx_item_tags_item_id", ReadIndexNames(databasePath));
        Assert.DoesNotContain("idx_items_file_name_fold", ReadIndexNames(databasePath));
        var after = opened.Snapshot()!;
        Assert.Equal(
            before.Items.Select(item => (item.Id, item.FileName, item.PlayCount, string.Join("|", item.Tags))),
            after.Items.Select(item => (item.Id, item.FileName, item.PlayCount, string.Join("|", item.Tags))));
        Assert.Equal("Night", Assert.Single(opened.Session.ReadPresets()).Name);
        Assert.DoesNotContain(Directory.GetFiles(dir.Path).Select(Path.GetFileName), name => name!.StartsWith("library.db.", StringComparison.Ordinal));

        var reopened = CatalogOpen.Open(dir.Path);
        Assert.Equal(LibraryCatalogOpenStatus.Opened, reopened.Status);
        Assert.Null(reopened.MigratedFromSchemaVersion);
    }

    [Fact]
    public void Open_InterruptedMigration_LeavesTheSchema2CatalogAndNeverWritesAPreviousFile()
    {
        using var dir = new TempDirectory();
        SeedSchema2(dir.Path);
        var databasePath = Path.Combine(dir.Path, "library.db");
        string[]? filesDuringMigration = null;
        LibraryCatalogStore.BeforeMigrationCommit = path =>
        {
            if (path == databasePath)
            {
                filesDuringMigration = Directory.GetFiles(dir.Path).Select(file => Path.GetFileName(file)!).ToArray();
                throw new IOException("Interrupted before commit.");
            }
        };
        LibraryCatalogOpenResult interrupted;
        try
        {
            interrupted = CatalogOpen.Open(dir.Path);
        }
        finally
        {
            LibraryCatalogStore.BeforeMigrationCommit = null;
        }

        Assert.Equal(LibraryCatalogOpenStatus.Unreadable, interrupted.Status);
        Assert.Equal(LibraryCatalogStore.UnreadableMessage, interrupted.Message);
        Assert.NotNull(filesDuringMigration);
        Assert.DoesNotContain(filesDuringMigration!, name => name.StartsWith("library.db.", StringComparison.Ordinal));
        Assert.DoesNotContain(Directory.GetFiles(dir.Path).Select(Path.GetFileName), name => name!.StartsWith("library.db.", StringComparison.Ordinal));
        Assert.Equal(LibraryCatalogStore.OldestUpgradableSchemaVersion, ReadUserVersion(databasePath));
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Older, LibraryCatalogStore.InspectCatalogFile(databasePath));
        Assert.DoesNotContain("file_name_sort_key", ReadItemColumns(databasePath));
        Assert.Contains("idx_item_tags_item_id", ReadIndexNames(databasePath));
        Assert.Contains("idx_items_file_name_fold", ReadIndexNames(databasePath));
        Assert.Equal(3, LibraryCatalogStore.Read(databasePath).Items.Count);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(LibraryCatalogStore.OldestUpgradableSchemaVersion, opened.MigratedFromSchemaVersion);
        Assert.Equal(LibraryCatalogStore.SchemaVersion, ReadUserVersion(databasePath));
    }

    [Fact]
    public void Open_Schema2CatalogWithASchema2Previous_RemovesThePreviousBeforeMigrating()
    {
        using var dir = new TempDirectory();
        SeedSchema2(dir.Path);
        CatalogSeed.WriteAtVersion(dir.Path, LibraryCatalogStore.OldestUpgradableSchemaVersion, "library.db.previous", items: [new SeedItem("previous", "/previous.mp4")], standalone: true);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(LibraryCatalogStore.SchemaVersion, ReadUserVersion(opened.Session!.DatabasePath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.previous")));
        Assert.Equal(3, opened.Snapshot()!.Items.Count);
    }

    [Fact]
    public void Open_DamagedCatalogWithASchema2Previous_PutsThePreviousBackAndMigratesIt()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.db"), "not a database");
        CatalogSeed.WriteAtVersion(dir.Path, LibraryCatalogStore.OldestUpgradableSchemaVersion, "library.db.previous", items: [new SeedItem("previous", "/previous.mp4")], standalone: true);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(LibraryCatalogStore.OldestUpgradableSchemaVersion, opened.MigratedFromSchemaVersion);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.previous")));
        Assert.Equal("not a database", File.ReadAllText(Path.Combine(dir.Path, "library.db.refused")));
        Assert.Equal("previous", Assert.Single(opened.Snapshot()!.Items).Id);
    }

    [Fact]
    public void Schema2File_IsAnOlderCatalogWithContent()
    {
        using var dir = new TempDirectory();
        var databasePath = CatalogSeed.WriteAtVersion(dir.Path, LibraryCatalogStore.OldestUpgradableSchemaVersion, "library.db.backup.2026-10-01_10-00-00", items: [new SeedItem("a", "/a.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Older, LibraryCatalogStore.InspectCatalogFile(databasePath));
        Assert.Equal(LibraryCatalogStore.DatabaseContentRead.HasContent, LibraryCatalogStore.ReadDatabaseContent(databasePath));
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void PrepareIncoming_Schema2Export_IsMigratedBeforeItIsPublished()
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        CatalogSeed.Write(dir.Path, items: [new SeedItem("current", "/clips/current.mp4")]);
        var export = CatalogSeed.WriteAtVersion(source.Path, LibraryCatalogStore.OldestUpgradableSchemaVersion, items: [new SeedItem("import", "/clips/Import.mp4")], standalone: true);
        var exportBytes = File.ReadAllBytes(export);

        LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, export);

        var incoming = Path.Combine(dir.Path, LibraryCatalogStore.IncomingFileName);
        Assert.Equal(exportBytes, File.ReadAllBytes(export));
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Usable, LibraryCatalogStore.InspectCatalogFile(incoming));
        Assert.Equal(LibraryCatalogNameSortKey.Compute("Import.mp4"), Assert.Single(ReadKeys(incoming)).Key);
        Assert.False(File.Exists(incoming + "-wal"));

        LibraryCatalogStore.PublishIncoming(dir.Path);
        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Null(opened.MigratedFromSchemaVersion);
        Assert.Equal("import", Assert.Single(opened.Snapshot()!.Items).Id);
    }

    private static void SeedSchema2(string directory)
    {
        CatalogSeed.WriteSchema2(
            directory,
            sources: [new SeedSource("on", "/media", "On")],
            items:
            [
                new SeedItem("a", "/media/Beta.mp4") { SourceId = "on", PlayCount = 2, Tags = ["Ann"] },
                new SeedItem("b", "/media/alpha.mp4") { SourceId = "on" },
                new SeedItem("c", "/media/ſigma.mp4") { SourceId = "on", Tags = ["Ann", "Bo"] }
            ],
            tags: [new SeedTag("Ann"), new SeedTag("Bo")],
            presets: [new SeedPreset("Night", """{"favoritesOnly":true}""")]);
    }

    private static List<string> DescribeNewCatalog()
    {
        using var created = new TempDirectory();
        var opened = CatalogOpen.Open(created.Path);
        return CatalogSeedTests.DescribeSchema(opened.Session!.DatabasePath);
    }

    private static int ReadUserVersion(string databasePath) =>
        Convert.ToInt32(Scalar(databasePath, "PRAGMA user_version;"));

    private static string? ReadMeta(string databasePath, string key) =>
        Scalar(databasePath, $"SELECT value FROM catalog_meta WHERE key = '{key}';") as string;

    private static List<string> ReadItemColumns(string databasePath) =>
        ReadStrings(databasePath, "SELECT name FROM pragma_table_info('items');");

    private static List<string> ReadIndexNames(string databasePath) =>
        ReadStrings(databasePath, "SELECT name FROM sqlite_master WHERE type = 'index';");

    private static List<(string FileName, byte[]? Key)> ReadKeys(string databasePath)
    {
        using var connection = OpenReadOnly(databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT file_name, file_name_sort_key FROM items ORDER BY position;";
        using var reader = command.ExecuteReader();
        var keys = new List<(string, byte[]?)>();
        while (reader.Read())
        {
            keys.Add((reader.GetString(0), reader.IsDBNull(1) ? null : (byte[])reader.GetValue(1)));
        }

        return keys;
    }

    private static List<object?[]> ReadRows(string databasePath, string sql)
    {
        using var connection = OpenReadOnly(databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        using var reader = command.ExecuteReader();
        var rows = new List<object?[]>();
        while (reader.Read())
        {
            var row = new object?[reader.FieldCount];
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[i] = reader.IsDBNull(i) ? null : Convert.ToString(reader.GetValue(i), System.Globalization.CultureInfo.InvariantCulture);
            }

            rows.Add(row);
        }

        return rows;
    }

    private static List<string> ReadStrings(string databasePath, string sql)
    {
        using var connection = OpenReadOnly(databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        using var reader = command.ExecuteReader();
        var values = new List<string>();
        while (reader.Read())
        {
            values.Add(reader.GetString(0));
        }

        return values;
    }

    private static object? Scalar(string databasePath, string sql)
    {
        using var connection = OpenReadOnly(databasePath);
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return command.ExecuteScalar();
    }

    private static SqliteConnection OpenReadOnly(string databasePath)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = false
        }.ToString());
        connection.Open();
        return connection;
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rr-catalog-migration-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, recursive: true);
            }
        }
    }
}
