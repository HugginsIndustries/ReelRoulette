using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryCatalogStoreTests
{
    [Fact]
    public void Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags()
    {
        using var dir = new TempDirectory();
        var jsonPath = Path.Combine(dir.Path, "library.json");
        File.WriteAllText(jsonPath, """
            {
              "sources": [
                { "id": "source-1", "rootPath": "/Media/Films", "displayName": "Films", "isEnabled": false }
              ],
              "categories": [
                { "id": "cat-1", "name": "Genre", "sortOrder": 2 }
              ],
              "tags": [
                { "name": "Café", "categoryId": "cat-1" }
              ],
              "availableTags": [ "Legacy", "Café" ],
              "fingerprintIndexVersion": 1,
              "fingerprintIndex": {
                "index-only-marker": { "abc": [ "item-1" ] }
              },
              "items": [
                {
                  "id": "item-1",
                  "sourceId": "source-1",
                  "fullPath": "/Media/Films/Café.MP4",
                  "relativePath": "Café.MP4",
                  "fileName": "Café.MP4",
                  "duration": 90.5,
                  "hasAudio": true,
                  "integratedLoudness": -14.25,
                  "peakDb": -1.5,
                  "isFavorite": true,
                  "isBlacklisted": false,
                  "playCount": 4,
                  "lastPlayedUtc": "2024-05-06T07:08:09Z",
                  "tags": [ "Café" ],
                  "mediaType": "Photo",
                  "fingerprint": "abc",
                  "fingerprintAlgorithm": "SHA-256",
                  "fingerprintVersion": 1,
                  "fileSizeBytes": 42,
                  "lastWriteTimeUtc": "2024-01-02T03:04:05Z",
                  "fingerprintLastUtc": "2024-01-02T03:04:06Z",
                  "fingerprintStatus": "Ready"
                },
                {
                  "sourceId": "source-1",
                  "fullPath": "/Media/Films/clip.mp4",
                  "relativePath": "clip.mp4",
                  "fileName": "clip.mp4",
                  "duration": "00:01:30",
                  "mediaType": 0,
                  "fingerprintStatus": 2,
                  "isFavorite": false,
                  "isBlacklisted": true,
                  "playCount": 1
                }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.False(File.Exists(jsonPath));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.json.migrated")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db")));

        var catalog = opened.Catalog!;
        var source = Assert.Single(catalog.Sources);
        Assert.Equal("source-1", source.Id);
        Assert.Equal("/Media/Films", source.RootPath);
        Assert.Equal("/media/films", source.RootPathFold);
        Assert.Equal("Films", source.DisplayName);
        Assert.False(source.IsEnabled);

        Assert.Equal(2, catalog.Categories.Count);
        Assert.Equal("cat-1", catalog.Categories[0].Id);
        Assert.Equal("Genre", catalog.Categories[0].Name);
        Assert.Equal(2, catalog.Categories[0].SortOrder);
        Assert.Equal("uncategorized", catalog.Categories[1].Id);
        Assert.Equal("Uncategorized", catalog.Categories[1].Name);
        Assert.Equal(int.MaxValue, catalog.Categories[1].SortOrder);

        var tag = Assert.Single(catalog.Tags);
        Assert.Equal("Café", tag.Name);
        Assert.Equal("café", tag.NameFold);
        Assert.Equal("cat-1", tag.CategoryId);
        Assert.NotEqual("cafe", tag.NameFold);

        Assert.True(catalog.AvailableTagsPresent);
        Assert.Equal(["Legacy", "Café"], catalog.AvailableTags);

        Assert.Equal(2, catalog.Items.Count);
        var photo = catalog.Items[0];
        Assert.Equal("item-1", photo.Id);
        Assert.Equal("/Media/Films/Café.MP4", photo.FullPath);
        Assert.Equal("/media/films/café.mp4", photo.FullPathFold);
        Assert.Equal("café.mp4", photo.FileNameFold);
        Assert.Equal(TimeSpan.FromSeconds(90.5).Ticks, photo.DurationTicks);
        Assert.True(photo.HasAudio);
        Assert.Equal(-14.25, photo.IntegratedLoudness);
        Assert.Equal(-1.5, photo.PeakDb);
        Assert.True(photo.IsFavorite);
        Assert.False(photo.IsBlacklisted);
        Assert.Equal(4, photo.PlayCount);
        Assert.Equal(new DateTime(2024, 5, 6, 7, 8, 9, DateTimeKind.Utc), photo.LastPlayedUtc);
        Assert.Equal(["Café"], photo.Tags);
        Assert.Equal(1, photo.MediaType);
        Assert.Equal("abc", photo.Fingerprint);
        Assert.Equal(42, photo.FileSizeBytes);
        Assert.Equal(new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc), photo.LastWriteTimeUtc);
        Assert.Equal(1, photo.FingerprintStatus);

        var video = catalog.Items[1];
        Assert.Equal("/Media/Films/clip.mp4", video.Id);
        Assert.Equal(TimeSpan.FromMinutes(1.5).Ticks, video.DurationTicks);
        Assert.Equal(0, video.MediaType);
        Assert.Equal(2, video.FingerprintStatus);
        Assert.True(video.IsBlacklisted);
        Assert.Equal(1, video.PlayCount);

        var databaseText = File.ReadAllText(Path.Combine(dir.Path, "library.db"));
        Assert.DoesNotContain("index-only-marker", databaseText, StringComparison.Ordinal);
        Assert.DoesNotContain("NOCASE", ReadSchema(dir.Path), StringComparison.OrdinalIgnoreCase);
        Assert.Equal("wal", ReadPragma(dir.Path, "journal_mode"));
        Assert.Equal("1", ReadPragma(dir.Path, "user_version"));
    }

    [Fact]
    public void Open_TimeSpanDuration_IsStoredAsTicks()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "items": [
                {
                  "id": "item-1",
                  "fullPath": "/clips/a.mp4",
                  "fileName": "a.mp4",
                  "duration": "00:00:12.5000000"
                }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        var item = Assert.Single(opened.Catalog!.Items);
        Assert.Equal(TimeSpan.Parse("00:00:12.5000000").Ticks, item.DurationTicks);
        Assert.False(opened.Catalog.AvailableTagsPresent);
    }

    [Fact]
    public void Open_BeforePublish_LeavesLibraryJsonUnmoved()
    {
        using var dir = new TempDirectory();
        var jsonPath = Path.Combine(dir.Path, "library.json");
        File.WriteAllText(jsonPath, """{ "items": [ { "id": "item-1", "fullPath": "/a.mp4", "fileName": "a.mp4" } ] }""");
        var original = File.ReadAllBytes(jsonPath);

        var ex = Assert.Throws<InvalidOperationException>(() =>
            LibraryCatalogStore.Open(dir.Path, new LibraryCatalogOpenOptions
            {
                BeforePublish = () => throw new InvalidOperationException("crash before publish")
            }));

        Assert.Equal("crash before publish", ex.Message);
        Assert.Equal(original, File.ReadAllBytes(jsonPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.json.migrated")));
    }

    [Fact]
    public void Open_DirectorySyncFails_LeavesLibraryJsonUnmoved()
    {
        using var dir = new TempDirectory();
        var jsonPath = Path.Combine(dir.Path, "library.json");
        File.WriteAllText(jsonPath, """{ "items": [ { "id": "item-1", "fullPath": "/a.mp4", "fileName": "a.mp4" } ] }""");
        var original = File.ReadAllBytes(jsonPath);

        var ex = Assert.Throws<IOException>(() =>
            LibraryCatalogStore.Open(dir.Path, new LibraryCatalogOpenOptions
            {
                DirectorySync = _ => throw new IOException("directory sync failed")
            }));

        Assert.Equal("directory sync failed", ex.Message);
        Assert.Equal(original, File.ReadAllBytes(jsonPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.json.migrated")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db")));
    }

    [Fact]
    public void Open_HealthyDatabase_DoesNotReadEitherJsonFile()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            { "items": [ { "id": "from-json", "fullPath": "/real.mp4", "fileName": "real.mp4", "playCount": 3 } ] }
            """);
        var first = LibraryCatalogStore.Open(dir.Path);
        Assert.Equal("from-json", Assert.Single(first.Catalog!.Items).Id);

        File.WriteAllText(Path.Combine(dir.Path, "library.json"), "{ not json");
        File.WriteAllText(Path.Combine(dir.Path, "library.json.migrated"), """
            { "items": [ { "id": "from-migrated", "fullPath": "/other.mp4", "fileName": "other.mp4", "playCount": 9 } ] }
            """);

        var second = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, second.Status);
        var item = Assert.Single(second.Catalog!.Items);
        Assert.Equal("from-json", item.Id);
        Assert.Equal(3, item.PlayCount);
    }

    [Fact]
    public void Open_PartialDatabase_QuarantinesAndLaterOpenMigratesPreservedJson()
    {
        using var dir = new TempDirectory();
        var jsonPath = Path.Combine(dir.Path, "library.json");
        File.WriteAllText(jsonPath, """
            { "items": [ { "id": "kept", "fullPath": "/kept.mp4", "fileName": "kept.mp4", "mediaType": "Video" } ] }
            """);
        var original = File.ReadAllBytes(jsonPath);
        File.WriteAllText(Path.Combine(dir.Path, "library.db"), "not a database");

        var refused = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessageJsonPreserved, refused.Message);
        Assert.Null(refused.Catalog);
        Assert.Equal(original, File.ReadAllBytes(jsonPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.refused")));

        var migrated = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, migrated.Status);
        Assert.Equal("kept", Assert.Single(migrated.Catalog!.Items).Id);
        Assert.Equal(0, migrated.Catalog.Items[0].MediaType);
        Assert.False(File.Exists(jsonPath));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db")));
    }

    [Fact]
    public void Open_ExistingSnapshot_DoesNotPublishAndLeavesLibraryJson()
    {
        using var dir = new TempDirectory();
        var jsonPath = Path.Combine(dir.Path, "library.json");
        var migratedPath = Path.Combine(dir.Path, "library.json.migrated");
        File.WriteAllText(jsonPath, """{ "items": [ { "id": "live", "fullPath": "/live.mp4", "fileName": "live.mp4" } ] }""");
        File.WriteAllText(migratedPath, """{ "items": [ { "id": "old", "fullPath": "/old.mp4", "fileName": "old.mp4" } ] }""");
        var jsonBytes = File.ReadAllBytes(jsonPath);
        var migratedBytes = File.ReadAllBytes(migratedPath);

        var ex = Assert.Throws<InvalidOperationException>(() => LibraryCatalogStore.Open(dir.Path));

        Assert.Equal(LibraryCatalogStore.SnapshotAlreadyExistsMessage, ex.Message);
        Assert.Equal(jsonBytes, File.ReadAllBytes(jsonPath));
        Assert.Equal(migratedBytes, File.ReadAllBytes(migratedPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.migrating")));
    }

    [Fact]
    public void Open_UnversionedDatabaseWithoutJson_RefusesAndDoesNotCreateEmptyCatalog()
    {
        using var dir = new TempDirectory();
        var migratedPath = Path.Combine(dir.Path, "library.json.migrated");
        File.WriteAllText(migratedPath, """{ "items": [ { "id": "snapshot", "fullPath": "/snap.mp4" } ] }""");
        CreateEmptyDatabase(Path.Combine(dir.Path, "library.db"));

        var refused = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessageWithSnapshot, refused.Message);
        Assert.Null(refused.Catalog);
        Assert.True(File.Exists(migratedPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.refused")));
        Assert.Equal(1, Directory.GetFiles(dir.Path, "library.db*").Count(path => Path.GetFileName(path) == "library.db.refused"));
    }

    [Fact]
    public void Open_CorruptRowPage_QuarantinesAndLeavesLibraryJson()
    {
        using var dir = new TempDirectory();
        var jsonPath = Path.Combine(dir.Path, "library.json");
        var payload = new string('x', 20_000);
        File.WriteAllText(jsonPath, $$"""
            { "items": [ { "id": "kept", "fullPath": "/kept.mp4", "fileName": "kept.mp4", "fingerprint": "{{payload}}" } ] }
            """);
        var original = File.ReadAllBytes(jsonPath);

        var opened = LibraryCatalogStore.Open(dir.Path);
        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        File.WriteAllBytes(jsonPath, original);
        CorruptPagesAfterHeader(Path.Combine(dir.Path, "library.db"));

        var refused = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessageJsonPreserved, refused.Message);
        Assert.Null(refused.Catalog);
        Assert.Equal(original, File.ReadAllBytes(jsonPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.refused")));
    }

    [Fact]
    public void Open_BadDatabaseWithNoJsonFiles_DoesNotNameMissingSnapshot()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.db"), "not a database");

        var refused = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessage, refused.Message);
        Assert.Null(refused.Catalog);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.json")));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.json.migrated")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.refused")));
    }

    [Fact]
    public void Open_MigratedSnapshotOnly_RefusesWithoutCreatingDatabase()
    {
        using var dir = new TempDirectory();
        var migratedPath = Path.Combine(dir.Path, "library.json.migrated");
        File.WriteAllText(migratedPath, """{ "items": [ { "id": "snapshot", "fullPath": "/snap.mp4" } ] }""");

        var refused = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessageWithSnapshot, refused.Message);
        Assert.True(File.Exists(migratedPath));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.Empty(Directory.GetFiles(dir.Path, "library.db*"));
    }

    [Fact]
    public void SyncFile_ReadOnlyFile_Throws()
    {
        using var dir = new TempDirectory();
        var path = Path.Combine(dir.Path, "library.db");
        File.WriteAllText(path, "x");
        if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead);
        }
        else
        {
            var info = new FileInfo(path);
            info.IsReadOnly = true;
        }

        Assert.Throws<UnauthorizedAccessException>(() => LibraryCatalogStore.SyncFile(path));
    }

    [Fact]
    public void WindowsPublishMoveFlags_IsWriteThrough()
    {
        Assert.Equal(8u, LibraryCatalogStore.WindowsPublishMoveFlags);
    }

    [Fact]
    public void Open_EmptyDirectory_CreatesNothing()
    {
        using var dir = new TempDirectory();

        var result = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Absent, result.Status);
        Assert.Empty(Directory.GetFiles(dir.Path));
    }

    [Fact]
    public void Open_MissingFingerprintStatus_StaysNull_ExplicitPendingStaysZero()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "items": [
                {
                  "id": "legacy",
                  "fullPath": "/clips/legacy.mp4",
                  "fileName": "legacy.mp4",
                  "fingerprint": "abc",
                  "fingerprintAlgorithm": "SHA-256",
                  "fingerprintVersion": 1
                },
                {
                  "id": "pending",
                  "fullPath": "/clips/pending.mp4",
                  "fileName": "pending.mp4",
                  "fingerprint": "def",
                  "fingerprintStatus": 0
                }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        Assert.Null(opened.Catalog!.Items[0].FingerprintStatus);
        Assert.Equal(0, opened.Catalog.Items[1].FingerprintStatus);
    }

    [Fact]
    public void Open_BlankCategoryId_BecomesUncategorizedAndSkipsDuplicate()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "categories": [
                { "name": "Genre" },
                { "id": "", "name": "Ignored duplicate" },
                { "id": "uncategorized", "name": "Also ignored" }
              ],
              "tags": [
                { "name": "Café" },
                { "name": "Named", "categoryId": "cat-1" }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        var category = Assert.Single(opened.Catalog!.Categories);
        Assert.Equal("uncategorized", category.Id);
        Assert.Equal("Uncategorized", category.Name);
        Assert.Equal(int.MaxValue, category.SortOrder);
        Assert.Equal("uncategorized", opened.Catalog.Tags[0].CategoryId);
        Assert.Equal("cat-1", opened.Catalog.Tags[1].CategoryId);
    }

    [Fact]
    public void Open_SourceMissingIdOrRootPath_IsOmitted()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "sources": [
                { "rootPath": "/only-path", "displayName": "No Id" },
                { "id": "has-id", "displayName": "No Path" },
                { "id": "kept", "rootPath": "/kept", "displayName": "Kept", "isEnabled": false }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        var source = Assert.Single(opened.Catalog!.Sources);
        Assert.Equal("kept", source.Id);
        Assert.Equal("/kept", source.RootPath);
        Assert.Equal("Kept", source.DisplayName);
        Assert.False(source.IsEnabled);
    }

    [Fact]
    public void Open_MissingUncategorizedCategory_IsAppended()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "categories": [
                { "id": "cat-1", "name": "Genre", "sortOrder": 2 }
              ],
              "tags": [
                { "name": "Loose" }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        Assert.Equal(2, opened.Catalog!.Categories.Count);
        Assert.Equal("cat-1", opened.Catalog.Categories[0].Id);
        Assert.Equal("Genre", opened.Catalog.Categories[0].Name);
        Assert.Equal(2, opened.Catalog.Categories[0].SortOrder);
        Assert.Equal("uncategorized", opened.Catalog.Categories[1].Id);
        Assert.Equal("Uncategorized", opened.Catalog.Categories[1].Name);
        Assert.Equal(int.MaxValue, opened.Catalog.Categories[1].SortOrder);
        Assert.Equal("uncategorized", Assert.Single(opened.Catalog.Tags).CategoryId);
    }

    [Fact]
    public void Open_ItemWithoutFullPath_IsOmitted()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "items": [
                { "id": "kept", "fullPath": "/kept.mp4", "fileName": "kept.mp4" },
                { "id": "pathless" },
                { },
                { "id": "blank-path", "fullPath": "  " }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        var item = Assert.Single(opened.Catalog!.Items);
        Assert.Equal("kept", item.Id);
        Assert.Equal("/kept.mp4", item.FullPath);
    }

    [Fact]
    public async Task Open_LockedDatabase_FailsWithinASecondAndLeavesFile()
    {
        using var dir = new TempDirectory();
        var databasePath = Path.Combine(dir.Path, "library.db");
        CreateEmptyDatabase(databasePath);

        using var locked = new ManualResetEventSlim(false);
        using var release = new ManualResetEventSlim(false);
        var holder = Task.Run(() =>
        {
            using var connection = new SqliteConnection($"Data Source={databasePath};Pooling=False");
            connection.Open();
            using var begin = connection.CreateCommand();
            begin.CommandText = "BEGIN EXCLUSIVE;";
            begin.ExecuteNonQuery();
            locked.Set();
            release.Wait();
        });
        Assert.True(locked.Wait(TimeSpan.FromSeconds(5)));

        SqliteException ex;
        var started = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            ex = Assert.Throws<SqliteException>(() => LibraryCatalogStore.Open(dir.Path));
        }
        finally
        {
            release.Set();
            await holder;
        }

        started.Stop();
        Assert.Equal(5, ex.SqliteErrorCode);
        Assert.True(started.Elapsed < TimeSpan.FromSeconds(5), $"locked open waited {started.Elapsed.TotalSeconds:0.0}s");
        Assert.True(File.Exists(databasePath));
        Assert.Empty(Directory.GetFiles(dir.Path, "library.db.refused*"));
    }

    [Fact]
    public void Open_DuplicateTagNames_KeepLastCaseInsensitive()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), """
            {
              "tags": [
                { "name": "Cafe", "categoryId": "old" },
                { "name": "Other", "categoryId": "cat-1" },
                { "name": "cafe", "categoryId": "new" }
              ]
            }
            """);

        var opened = LibraryCatalogStore.Open(dir.Path);

        var category = Assert.Single(opened.Catalog!.Categories);
        Assert.Equal("uncategorized", category.Id);
        Assert.Equal("Uncategorized", category.Name);
        Assert.Equal(int.MaxValue, category.SortOrder);
        Assert.Equal(2, opened.Catalog.Tags.Count);
        Assert.Equal("Other", opened.Catalog.Tags[0].Name);
        Assert.Equal("cat-1", opened.Catalog.Tags[0].CategoryId);
        Assert.Equal("cafe", opened.Catalog.Tags[1].Name);
        Assert.Equal("cafe", opened.Catalog.Tags[1].NameFold);
        Assert.Equal("new", opened.Catalog.Tags[1].CategoryId);
    }

    [Fact]
    public void TestConnectionString_DisablesPooling()
    {
        var writable = new SqliteConnectionStringBuilder(TestConnectionString("library.db", readOnly: false));
        var readOnly = new SqliteConnectionStringBuilder(TestConnectionString("library.db", readOnly: true));

        Assert.False(writable.Pooling);
        Assert.False(readOnly.Pooling);
    }

    private static string TestConnectionString(string databasePath, bool readOnly)
    {
        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Pooling = false
        };
        return builder.ToString();
    }

    private static string ReadPragma(string directory, string name)
    {
        using var connection = new SqliteConnection(TestConnectionString(Path.Combine(directory, "library.db"), readOnly: true));
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA {name};";
        return Convert.ToString(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string ReadSchema(string directory)
    {
        using var connection = new SqliteConnection(TestConnectionString(Path.Combine(directory, "library.db"), readOnly: true));
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL;";
        using var reader = command.ExecuteReader();
        var parts = new List<string>();
        while (reader.Read())
        {
            parts.Add(reader.GetString(0));
        }

        return string.Join('\n', parts);
    }

    private static void CorruptPagesAfterHeader(string databasePath)
    {
        var bytes = File.ReadAllBytes(databasePath);
        var pageSize = (bytes[16] << 8) | bytes[17];
        if (pageSize == 1)
        {
            pageSize = 65536;
        }

        Assert.True(bytes.Length > pageSize);
        for (var i = pageSize; i < bytes.Length; i++)
        {
            bytes[i] = 0xFF;
        }

        File.WriteAllBytes(databasePath, bytes);
    }

    private static void CreateEmptyDatabase(string path)
    {
        using var connection = new SqliteConnection(TestConnectionString(path, readOnly: false));
        connection.Open();
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rr-catalog-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(Path))
                {
                    foreach (var file in Directory.EnumerateFiles(Path, "*", SearchOption.AllDirectories))
                    {
                        var attributes = File.GetAttributes(file);
                        if ((attributes & FileAttributes.ReadOnly) != 0)
                        {
                            File.SetAttributes(file, attributes & ~FileAttributes.ReadOnly);
                        }
                    }
                }

                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
            }
        }
    }
}
