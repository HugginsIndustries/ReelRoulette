using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// The stored name sort key orders names as OrdinalIgnoreCase did through the managed collation, and
/// every sort mode returns the same order as the query that used that collation.
/// </summary>
public sealed class LibraryCatalogNameSortKeyTests
{
    /// <summary>
    /// Names that differ only by case, that hold <c>_ [ \ ] ^ `</c> (which sort after letters under
    /// OrdinalIgnoreCase and before them under a lowercase fold), where ToUpperInvariant and
    /// OrdinalIgnoreCase disagree (long s), where only one of a pair has an uppercase (dotless i, Kelvin,
    /// sharp s), emoji against fullwidth and private-use characters (code point order, not UTF-16
    /// order), and supplementary letters with case.
    /// </summary>
    private static readonly string[] Names =
    [
        "same.mp4", "Same.mp4", "SAME.mp4", "same.mp4",
        "a_b.mp4", "a[b.mp4", "a\\b.mp4", "a]b.mp4", "a^b.mp4", "a`b.mp4", "aZb.mp4", "azb.mp4", "a{b.mp4", "a~b.mp4",
        "ſ.mp4", "S.mp4", "s.mp4", "T.mp4",
        "ı.mp4", "I.mp4", "i.mp4", "İ.mp4",
        "K.mp4", "k.mp4", "K.mp4",
        "ß.mp4", "ẞ.mp4", "µ.mp4", "Μ.mp4", "μ.mp4",
        "é.mp4", "É.mp4", "e.mp4", "f.mp4",
        "x\U0001F975.mp4", "x？.mp4", "x.mp4", "x�.mp4", "x\U0001F608.mp4",
        "\U00010428.mp4", "\U00010400.mp4", "\U0001E922.mp4", "\U0001E900.mp4",
        "", "a", "A.mp4", "a.mp4.mp4", "10.mp4", "9.mp4"
    ];

    /// <summary>SQLite stores text as UTF-8, so a lone surrogate cannot be in a stored name; the key still orders it.</summary>
    private static readonly string[] LoneSurrogateNames = ["x\uD800.mp4", "x\uDC00.mp4", "\uDBFF"];

    [Fact]
    public void Compute_OrdersEveryCodePointLikeOrdinalIgnoreCase()
    {
        var strings = new List<string>();
        for (var i = 0; i <= 0xFFFF; i++)
        {
            strings.Add(((char)i).ToString());
        }

        for (var codePoint = 0x10000; codePoint <= 0x10FFFF; codePoint++)
        {
            strings.Add(char.ConvertFromUtf32(codePoint));
        }

        AssertKeyOrderMatches(strings);
    }

    [Fact]
    public void Compute_OrdersTheFixtureNamesAndTheirPairsLikeOrdinalIgnoreCase()
    {
        var names = Names.Concat(LoneSurrogateNames).ToList();
        var strings = names.Concat(
                from left in names
                from right in names
                select left + right)
            .ToList();

        AssertKeyOrderMatches(strings);
    }

    [Theory]
    [InlineData(LibraryListSort.Name)]
    [InlineData(LibraryListSort.LastPlayed)]
    [InlineData(LibraryListSort.PlayCount)]
    [InlineData(LibraryListSort.Duration)]
    [InlineData(LibraryListSort.DateAdded)]
    public void Query_EverySortInBothDirections_MatchesThePreviousOrder(LibraryListSort sort)
    {
        using var dir = new TempDirectory();
        var session = SeedFixture(dir.Path);

        foreach (var descending in new[] { false, true })
        {
            var expected = PreviousOrder(session.DatabasePath, sort, descending);
            var actual = new List<string>();
            for (var offset = 0; offset < expected.Count + 7; offset += 7)
            {
                var page = session.QueryList(new LibraryListRequest
                {
                    Filter = new FilterStateModel(),
                    Sort = sort,
                    SortDescending = descending,
                    Offset = offset,
                    Limit = 7
                });
                Assert.Equal(expected.Count, page.TotalCount);
                actual.AddRange(page.Items.Select(item => item.Id));
            }

            Assert.Equal(expected, actual);
        }
    }

    [Fact]
    public void Query_NameOrder_IsNotTheLowercaseFoldOrder()
    {
        using var dir = new TempDirectory();
        var session = SeedFixture(dir.Path);

        // Guards the fixture: a lowercase fold puts "a_b" before "aZb", OrdinalIgnoreCase after it.
        var ids = session.QueryList(new LibraryListRequest { Filter = new FilterStateModel(), Limit = 500 })
            .Items.Select(item => item.FileName).ToList();
        Assert.True(ids.IndexOf("aZb.mp4") < ids.IndexOf("a_b.mp4"));
        Assert.True(ids.IndexOf("x？.mp4") < ids.IndexOf("x\U0001F975.mp4"));
        Assert.True(ids.IndexOf("T.mp4") < ids.IndexOf("ſ.mp4"));
    }

    [Fact]
    public void InsertAndRename_WriteTheKeyWithTheRow()
    {
        using var dir = new TempDirectory();
        var session = CatalogOpen.Open(dir.Path).Session!;
        Assert.True(session.InsertSource("on", "/media", "On", true));
        Assert.True(session.InsertItem(new LibraryCatalogItem
        {
            Id = "item",
            SourceId = "on",
            FullPath = "/media/ſecond.mp4",
            RelativePath = "ſecond.mp4",
            FileName = "ſecond.mp4"
        }));
        Assert.Equal(LibraryCatalogNameSortKey.Compute("ſecond.mp4"), ReadKey(session.DatabasePath, "item"));

        Assert.True(session.UpdateItemIdentity("item", "on", "/media/Renamed.mp4", "Renamed.mp4", "Renamed.mp4", 0));

        Assert.Equal(LibraryCatalogNameSortKey.Compute("Renamed.mp4"), ReadKey(session.DatabasePath, "item"));
    }

    [Fact]
    public void ReadNameSortKeyWork_ListsItemsWithoutAKey_OrEveryItemAfterAKeyVersionChange()
    {
        using var dir = new TempDirectory();
        var session = SeedFixture(dir.Path);
        Assert.Empty(session.ReadNameSortKeyWork().Items);

        Execute(session.DatabasePath, "UPDATE items SET file_name_sort_key = NULL WHERE id = 'n-1';");
        var missing = session.ReadNameSortKeyWork();
        Assert.False(missing.VersionChanged);
        Assert.Equal([new CatalogNameSortKeyItem("n-1", Names[1])], missing.Items);

        Execute(session.DatabasePath, "UPDATE catalog_meta SET value = '0' WHERE key = 'name_sort_key_version';");
        var all = session.ReadNameSortKeyWork();
        Assert.True(all.VersionChanged);
        Assert.Equal(Names.Length, all.Items.Count);
    }

    [Fact]
    public void WriteNameSortKeys_FillsAndCorrectsKeys_AndSkipsAnItemRenamedSinceItWasRead()
    {
        using var dir = new TempDirectory();
        var session = SeedFixture(dir.Path);
        Execute(session.DatabasePath, "UPDATE items SET file_name_sort_key = NULL WHERE id = 'n-0';");
        Execute(session.DatabasePath, "UPDATE items SET file_name_sort_key = x'00' WHERE id = 'n-1';");
        var revision = session.Revision;

        var written = session.WriteNameSortKeys(
        [
            new CatalogNameSortKeyItem("n-0", Names[0]),
            new CatalogNameSortKeyItem("n-1", Names[1]),
            new CatalogNameSortKeyItem("n-2", Names[2]),
            new CatalogNameSortKeyItem("n-3", "an old name.mp4")
        ]);

        Assert.Equal(2, written);
        Assert.Equal(revision + 1, session.Revision);
        Assert.Equal(LibraryCatalogNameSortKey.Compute(Names[0]), ReadKey(session.DatabasePath, "n-0"));
        Assert.Equal(LibraryCatalogNameSortKey.Compute(Names[1]), ReadKey(session.DatabasePath, "n-1"));
        Assert.Equal(LibraryCatalogNameSortKey.Compute(Names[3]), ReadKey(session.DatabasePath, "n-3"));

        Assert.Equal(0, session.WriteNameSortKeys([new CatalogNameSortKeyItem("n-0", Names[0])]));
        Assert.Equal(revision + 1, session.Revision);
    }

    private static void AssertKeyOrderMatches(List<string> strings)
    {
        var keyed = strings.Select(value => (Value: value, Key: LibraryCatalogNameSortKey.Compute(value))).ToList();
        keyed.Sort((left, right) => left.Key.AsSpan().SequenceCompareTo(right.Key));
        var mismatches = new List<string>();
        for (var i = 1; i < keyed.Count; i++)
        {
            var expected = Math.Sign(StringComparer.OrdinalIgnoreCase.Compare(keyed[i - 1].Value, keyed[i].Value));
            var actual = Math.Sign(keyed[i - 1].Key.AsSpan().SequenceCompareTo(keyed[i].Key));
            if (expected != actual && mismatches.Count < 5)
            {
                mismatches.Add($"{Hex(keyed[i - 1].Value)} vs {Hex(keyed[i].Value)}: OrdinalIgnoreCase {expected}, key {actual}");
            }
        }

        Assert.Empty(mismatches);
    }

    private static string Hex(string value) => string.Join(" ", value.Select(c => ((int)c).ToString("X4")));

    /// <summary>
    /// One item per fixture name, with play counts, last-played times, durations, and write times that
    /// tie often and are null or zero for some, so every sort reaches its name and id tie-breaks.
    /// </summary>
    private static LibraryCatalogSession SeedFixture(string directory)
    {
        var start = new DateTime(2025, 3, 1, 0, 0, 0, DateTimeKind.Utc);
        var items = Names.Select((name, i) => new SeedItem($"n-{i}", $"/media/{i}/{name}")
        {
            SourceId = "on",
            RelativePath = $"{i}/{name}",
            FileName = name,
            PlayCount = i % 3,
            LastPlayedUtc = i % 4 == 0 ? null : start.AddDays(i % 3),
            Duration = (i % 5) switch { 0 => null, 1 => TimeSpan.Zero, _ => TimeSpan.FromSeconds(i % 3) },
            LastWriteTimeUtc = i % 6 == 0 ? null : start.AddDays(i % 2),
            MediaType = i % 5 == 0 ? 1 : 0
        });
        CatalogSeed.Write(directory, sources: [new SeedSource("on", "/media", "On")], items: items);
        return CatalogOpen.Open(directory).Session!;
    }

    /// <summary>The browse order before the stored key: the same keys, with names compared by the managed collation.</summary>
    private static List<string> PreviousOrder(string databasePath, LibraryListSort sort, bool descending)
    {
        var direction = descending ? "DESC" : "ASC";
        const string fileName = "items.file_name COLLATE ORDINAL_IGNORE_CASE";
        var primary = sort switch
        {
            LibraryListSort.LastPlayed => $"COALESCE(items.last_played_utc, 0) {direction}",
            LibraryListSort.PlayCount => $"items.play_count {direction}",
            LibraryListSort.Duration => $"COALESCE(items.duration_ticks, 0) {direction}",
            LibraryListSort.DateAdded => $"COALESCE(items.last_write_time_utc, 0) {direction}",
            _ => $"{fileName} {direction}"
        };
        var orderBy = sort == LibraryListSort.Name
            ? $"ORDER BY {primary}, items.id ASC"
            : $"ORDER BY {primary}, {fileName} ASC, items.id ASC";

        using var connection = new SqliteConnection($"Data Source={databasePath};Mode=ReadOnly;Pooling=False");
        connection.Open();
        connection.CreateCollation("ORDINAL_IGNORE_CASE", (left, right) => StringComparer.OrdinalIgnoreCase.Compare(left, right));
        using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT items.id
            FROM items
            INNER JOIN sources ON sources.id = items.source_id AND sources.is_enabled != 0
            WHERE items.is_blacklisted = 0
            {orderBy};
            """;
        using var reader = command.ExecuteReader();
        var ids = new List<string>();
        while (reader.Read())
        {
            ids.Add(reader.GetString(0));
        }

        return ids;
    }

    private static byte[]? ReadKey(string databasePath, string id)
    {
        using var connection = new SqliteConnection($"Data Source={databasePath};Mode=ReadOnly;Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT file_name_sort_key FROM items WHERE id = $id;";
        command.Parameters.AddWithValue("$id", id);
        return command.ExecuteScalar() as byte[];
    }

    private static void Execute(string databasePath, string sql)
    {
        using var connection = new SqliteConnection($"Data Source={databasePath};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rr-name-sort-key-" + Guid.NewGuid().ToString("N"));
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
