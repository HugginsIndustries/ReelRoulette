using System.Text.Json;
using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Services;
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
            presets: [NightPreset(version)]);
        var before = LibraryCatalogStore.Read(Path.Combine(dir.Path, "library.db"));

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(version, opened.MigratedFromSchemaVersion);
        Assert.Equal(DescribeNewCatalog(), CatalogSeedTests.DescribeSchema(opened.Session!.DatabasePath));
        Assert.Equal(
            before.Items.Select(item => (item.Id, item.FileName, item.MediaType, item.PlayCount, string.Join("|", item.Tags))),
            opened.Snapshot()!.Items.Select(item => (item.Id, item.FileName, item.MediaType, item.PlayCount, string.Join("|", item.Tags))));
        AssertUpgradedNightPreset(Assert.Single(opened.Session.ReadPresets()));
    }

    [Theory]
    [MemberData(nameof(OlderSchemaVersions))]
    public void PrepareIncoming_OlderExport_IsUpgradedBeforeItIsPublished(int version)
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        CatalogSeed.Write(dir.Path, items: [new SeedItem("current", "/clips/current.mp4")]);
        var export = CatalogSeed.WriteAtVersion(
            source.Path,
            version,
            items: [new SeedItem("import", "/clips/Import.mp4")],
            standalone: true,
            presets: [NightPreset(version)]);

        LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, export);

        var incoming = Path.Combine(dir.Path, LibraryCatalogStore.IncomingFileName);
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Usable, LibraryCatalogStore.InspectCatalogFile(incoming));
        Assert.Equal(DescribeNewCatalog(), CatalogSeedTests.DescribeSchema(incoming));
        LibraryCatalogStore.PublishIncoming(dir.Path);
        var opened = CatalogOpen.Open(dir.Path);
        Assert.Null(opened.MigratedFromSchemaVersion);
        Assert.Equal("import", Assert.Single(opened.Snapshot()!.Items).Id);
        AssertUpgradedNightPreset(Assert.Single(opened.Session!.ReadPresets()));
    }

    // Full filter states in the shapes presets were saved in before the flag modes, with no mode fields, one with modes
    // in mixed case, and one saved as null, which the step leaves as it is.
    [Fact]
    public void Open_Schema4Catalog_GivesEachPresetItsOwnId_AndWritesItsModesInPlaceOfTheOldFields()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteSchemaVersion(
            dir.Path,
            4,
            presets:
            [
                new SeedPreset("Old favorites", """{"favoritesOnly":true,"excludeBlacklisted":false,"onlyNeverPlayed":true,"audioFilter":1,"minDuration":"00:01:30","maxDuration":null,"selectedTags":["Ann"],"excludedTags":["Bob"],"categoryLocalMatchModes":{"people":1},"globalMatchMode":null,"tagMatchMode":0,"onlyKnownDuration":true,"onlyKnownLoudness":false,"mediaTypeFilter":1,"includedSourceIds":["s1"]}"""),
                new SeedPreset("Old plain", """{"favoritesOnly":false,"excludeBlacklisted":true,"onlyNeverPlayed":true,"onlyKnownDuration":true,"onlyKnownLoudness":false,"audioFilter":1,"mediaTypeFilter":1,"globalMatchMode":null,"selectedTags":["Ann"],"excludedTags":["Bob"],"includedSourceIds":["s1"],"categoryLocalMatchModes":{"people":1},"minDuration":"00:01:30"}"""),
                new SeedPreset("Modes", """{"favoritesMode":"Excluded","blacklistedMode":"only","favoritesOnly":true}"""),
                new SeedPreset("Null", "null")
            ]);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        var presets = opened.Session!.ReadPresets();
        Assert.Equal(["Old favorites", "Old plain", "Modes", "Null"], presets.Select(preset => preset.Name));
        Assert.All(presets, preset => Assert.False(string.IsNullOrEmpty(preset.Id)));
        Assert.Equal(presets.Count, presets.Select(preset => preset.Id).Distinct(StringComparer.Ordinal).Count());
        AssertFiltersAsBefore(presets[0].FilterStateJson, FlagFilterModeValue.Only, FlagFilterModeValue.Off);
        AssertFiltersAsBefore(presets[1].FilterStateJson, FlagFilterModeValue.Off, FlagFilterModeValue.Excluded);
        Assert.Equal("""{"favoritesMode":"excluded","blacklistedMode":"only"}""", presets[2].FilterStateJson);
        Assert.Equal("null", presets[3].FilterStateJson);
    }

    // Counted as audio, the digitally silent track would put the baseline, the 75th percentile, at -70. The video
    // scanned before the peak keeps its values until the next refresh scans it again.
    [Fact]
    public void Open_Schema5Catalog_StoresADigitallySilentVideoAsNoAudio_AndKeepsAFaintOneAsAudio()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteSchemaVersion(
            dir.Path,
            5,
            sources: [new SeedSource("on", "/media", "On")],
            items:
            [
                new SeedItem("silent", "/media/silent.mp4") { SourceId = "on", HasAudio = true, IntegratedLoudness = -70.0, LoudnessAnalysisVersion = 2 },
                new SeedItem("faint", "/media/faint.mp4") { SourceId = "on", HasAudio = true, IntegratedLoudness = -70.0, PeakDb = -80.3, LoudnessAnalysisVersion = 2 },
                new SeedItem("before-peak", "/media/before-peak.mp4") { SourceId = "on", HasAudio = true, IntegratedLoudness = -70.0, LoudnessAnalysisVersion = 1 },
                new SeedItem("loud", "/media/loud.mp4") { SourceId = "on", HasAudio = true, IntegratedLoudness = -20.0, PeakDb = -1.5, LoudnessAnalysisVersion = 2 },
                new SeedItem("without-audio", "/media/without-audio.mp4") { SourceId = "on", HasAudio = false, LoudnessAnalysisVersion = 2 },
                new SeedItem("photo", "/media/photo.jpg") { SourceId = "on", MediaType = 1, LoudnessAnalysisVersion = 0 }
            ]);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        var rows = ReadRows(
            opened.Session!.DatabasePath,
            "SELECT id, has_audio, integrated_loudness, peak_db, loudness_analysis_version FROM items ORDER BY id;");
        Assert.Equal(
            [
                "before-peak audio=1 loudness=-70 peak=none version=1",
                "faint audio=1 loudness=-70 peak=-80.3 version=2",
                "loud audio=1 loudness=-20 peak=-1.5 version=2",
                "photo audio=none loudness=none peak=none version=0",
                "silent audio=0 loudness=none peak=none version=2",
                "without-audio audio=0 loudness=none peak=none version=2"
            ],
            rows.Select(row => $"{row[0]} audio={row[1] ?? "none"} loudness={row[2] ?? "none"} peak={row[3] ?? "none"} version={row[4]}"));
        Assert.Equal(
            [
                "with audio: before-peak, faint, loud, photo",
                "without audio: photo, silent, without-audio",
                "videos with audio=3 without audio=2",
                "baseline=-20",
                "silent hasAudio=false loudness=none peak=none",
                "faint hasAudio=true loudness=-70 peak=-80.3"
            ],
            LibraryListQueryTests.DescribeAudioReads(dir.Path, "silent", "faint"));
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
        AssertUpgradedNightPreset(Assert.Single(opened.Session.ReadPresets()));
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

    /// <summary>
    /// A Favorites only preset as <paramref name="schemaVersion"/> stored it: before version 5 with the older
    /// <c>favoritesOnly</c>, and from it with the Favorites and Blacklisted modes.
    /// </summary>
    private static SeedPreset NightPreset(int schemaVersion) => schemaVersion < 5
        ? new SeedPreset("Night", """{"favoritesOnly":true}""")
        : new SeedPreset("Night", """{"favoritesMode":"only","blacklistedMode":"excluded"}""");

    private static void AssertUpgradedNightPreset(LibraryCatalogPreset preset)
    {
        Assert.Equal("Night", preset.Name);
        Assert.False(string.IsNullOrEmpty(preset.Id));
        Assert.Equal("""{"favoritesMode":"only","blacklistedMode":"excluded"}""", preset.FilterStateJson);
    }

    /// <summary>The filter the old-shape presets above held, with its modes written and the old fields gone.</summary>
    private static void AssertFiltersAsBefore(string filterStateJson, FlagFilterModeValue favorites, FlagFilterModeValue blacklisted)
    {
        Assert.DoesNotContain("favoritesOnly", filterStateJson, StringComparison.Ordinal);
        Assert.DoesNotContain("excludeBlacklisted", filterStateJson, StringComparison.Ordinal);
        using var document = JsonDocument.Parse(filterStateJson);
        Assert.True(LibraryListFilterParser.TryParse(document.RootElement, out var filter, out var error), error);
        Assert.Equal((favorites, blacklisted), (filter!.FavoritesMode, filter.BlacklistedMode));
        Assert.True(filter.OnlyNeverPlayed);
        Assert.Equal(AudioFilterModeValue.WithAudioOnly, filter.AudioFilter);
        Assert.Equal(TimeSpan.FromSeconds(90), filter.MinDuration);
        Assert.Null(filter.MaxDuration);
        Assert.Equal(["Ann"], filter.SelectedTags);
        Assert.Equal(["Bob"], filter.ExcludedTags);
        Assert.Equal(TagMatchModeValue.Or, Assert.Single(filter.CategoryLocalMatchModes!, pair => pair.Key == "people").Value);
        Assert.Null(filter.GlobalMatchMode);
        Assert.True(filter.OnlyKnownDuration);
        Assert.False(filter.OnlyKnownLoudness);
        Assert.Equal(MediaTypeFilterValue.VideosOnly, filter.MediaTypeFilter);
        Assert.Equal(["s1"], filter.IncludedSourceIds);
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
