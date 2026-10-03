using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryCatalogStoreTests
{
    [Fact]
    public void Open_MissingDatabase_CreatesEmptySchema2Catalog()
    {
        using var dir = new TempDirectory();

        var result = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, result.Status);
        Assert.Null(result.Message);
        var snapshot = result.Snapshot()!;
        Assert.Empty(snapshot.Sources);
        Assert.Empty(snapshot.Items);
        Assert.Empty(snapshot.Tags);
        var category = Assert.Single(snapshot.Categories);
        Assert.Equal("uncategorized", category.Id);
        Assert.Equal("Uncategorized", category.Name);
        Assert.Equal(int.MaxValue, category.SortOrder);
        Assert.Empty(result.Session!.ReadPresets());
        Assert.Equal(0, result.Session.Revision);
        Assert.Equal("2", ReadPragma(dir.Path, "user_version"));
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Usable, LibraryCatalogStore.InspectCatalogFile(result.Session.DatabasePath));
        Assert.Equal(["revision"], ReadMetaKeys(dir.Path));
        Assert.DoesNotContain("available_tags", ReadSchema(dir.Path), StringComparison.Ordinal);
        Assert.DoesNotContain(
            Directory.GetFiles(dir.Path).Select(Path.GetFileName),
            name => name!.StartsWith("library.db.", StringComparison.Ordinal));
    }

    [Fact]
    public void Open_HealthyDatabase_OpensUnchanged()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("item-1", "/real.mp4") { PlayCount = 3 }],
            presets: [new SeedPreset("Kept", """{"favoritesOnly":true}""")]);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        var item = Assert.Single(opened.Snapshot()!.Items);
        Assert.Equal("item-1", item.Id);
        Assert.Equal(3, item.PlayCount);
        Assert.Null(item.ThumbnailRevision);
        Assert.Equal("Kept", Assert.Single(opened.Session!.ReadPresets()).Name);
    }

    [Fact]
    public void Open_DatabaseThatIsNotADatabase_IsQuarantinedAndRefused()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.db"), "not a database");

        var refused = CatalogOpen.Open(dir.Path);

        AssertRefusedAndQuarantined(dir.Path, refused);
    }

    [Fact]
    public void Open_CorruptRowPage_IsQuarantinedAndRefused()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("kept", "/kept.mp4") { Fingerprint = new string('x', 20_000) }]);
        CorruptPagesAfterHeader(Path.Combine(dir.Path, "library.db"));

        var refused = CatalogOpen.Open(dir.Path);

        AssertRefusedAndQuarantined(dir.Path, refused);
    }

    [Fact]
    public void Open_UnversionedDatabase_IsQuarantinedAndRefused()
    {
        using var dir = new TempDirectory();
        CreateEmptyDatabase(Path.Combine(dir.Path, "library.db"));

        var refused = CatalogOpen.Open(dir.Path);

        AssertRefusedAndQuarantined(dir.Path, refused);
    }

    [Fact]
    public void Open_UnknownMetaRow_IsKeptAndNotRead()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(dir.Path, items: [new SeedItem("item-1", "/clips/a.mp4")]);
        using (var connection = new SqliteConnection(TestConnectionString(Path.Combine(dir.Path, "library.db"), readOnly: false)))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO catalog_meta (key, value) VALUES ('side_files_copied', '0');";
            command.ExecuteNonQuery();
        }

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Equal(["revision", "side_files_copied"], ReadMetaKeys(dir.Path));
        Assert.Empty(opened.Session!.ReadPresets());
        Assert.Null(Assert.Single(opened.Snapshot()!.Items).ThumbnailRevision);
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
            ex = Assert.Throws<SqliteException>(() => CatalogOpen.Open(dir.Path));
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
    public void OpenWrite_UsesWalWithSynchronousNormal()
    {
        using var dir = new TempDirectory();
        using var connection = LibraryCatalogStore.OpenWrite(Path.Combine(dir.Path, "library.db"));
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA journal_mode;";
        Assert.Equal("wal", command.ExecuteScalar());
        command.CommandText = "PRAGMA synchronous;";
        Assert.Equal(1, Convert.ToInt32(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture));
    }

    [Fact]
    public void TestConnectionString_DisablesPooling()
    {
        var writable = new SqliteConnectionStringBuilder(TestConnectionString("library.db", readOnly: false));
        var readOnly = new SqliteConnectionStringBuilder(TestConnectionString("library.db", readOnly: true));

        Assert.False(writable.Pooling);
        Assert.False(readOnly.Pooling);
    }

    private static void AssertRefusedAndQuarantined(string directory, LibraryCatalogOpenResult refused)
    {
        Assert.Equal(LibraryCatalogOpenStatus.Refused, refused.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessage, refused.Message);
        Assert.Null(refused.Session);
        Assert.False(File.Exists(Path.Combine(directory, "library.db")));
        Assert.True(File.Exists(Path.Combine(directory, "library.db.refused")));
    }

    private static List<string> ReadMetaKeys(string directory)
    {
        using var connection = new SqliteConnection(TestConnectionString(Path.Combine(directory, "library.db"), readOnly: true));
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT key FROM catalog_meta ORDER BY key;";
        using var reader = command.ExecuteReader();
        var keys = new List<string>();
        while (reader.Read())
        {
            keys.Add(reader.GetString(0));
        }

        return keys;
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

    [Fact]
    public void WriteCheckpoint_IncludesCommittedRows_WithoutAWalSidecar()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("item-1", "/clips/a.mp4")]);
        var opened = CatalogOpen.Open(dir.Path);
        Assert.True(opened.Session!.SetFavorite("item-1", true));

        var checkpoint = Path.Combine(dir.Path, "checkpoint.db");
        LibraryCatalogStore.WriteCheckpoint(opened.Session.DatabasePath, checkpoint);

        Assert.False(File.Exists(checkpoint + "-wal"));
        Assert.False(File.Exists(checkpoint + "-shm"));
        var copy = LibraryCatalogStore.Read(checkpoint);
        Assert.True(Assert.Single(copy.Items).IsFavorite);
    }

    [Fact]
    public void Open_AfterInterruptedReplace_RestoresPreviousCatalog()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("kept", "/clips/kept.mp4")]);
        var opened = CatalogOpen.Open(dir.Path);
        Assert.NotNull(opened.Session);

        var incoming = Path.Combine(dir.Path, "incoming");
        CatalogSeed.Write(incoming, items: [new SeedItem("incoming", "/clips/new.mp4")]);
        LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, Path.Combine(incoming, "library.db"));
        LibraryCatalogStore.PublishIncoming(dir.Path, new LibraryCatalogReplaceOptions { StopAfterMovingPrevious = true });

        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.previous")));
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.incoming")));

        var recovered = CatalogOpen.Open(dir.Path);
        Assert.Equal("kept", Assert.Single(recovered.Snapshot()!.Items).Id);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.incoming")));
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.previous")));
    }

    [Fact]
    public void Open_AfterPublishedIncoming_KeepsTheNewCatalog()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("old", "/clips/old.mp4")]);
        _ = CatalogOpen.Open(dir.Path);

        var incoming = Path.Combine(dir.Path, "incoming");
        CatalogSeed.Write(incoming, items: [new SeedItem("landed", "/clips/new.mp4")]);
        LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, Path.Combine(incoming, "library.db"));
        LibraryCatalogStore.PublishIncoming(dir.Path, new LibraryCatalogReplaceOptions { StopAfterPublishingIncoming = true });
        Assert.True(File.Exists(Path.Combine(dir.Path, "library.db.previous")));

        var recovered = CatalogOpen.Open(dir.Path);
        Assert.Equal("landed", Assert.Single(recovered.Snapshot()!.Items).Id);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.previous")));
    }

    [Fact]
    public void Open_PromotesFinishedIncoming_WhenNoPreviousCatalogExists()
    {
        using var dir = new TempDirectory();
        var source = new TempDirectory();
        try
        {
            CatalogSeed.Write(
                source.Path,
                items: [new SeedItem("promoted", "/clips/a.mp4")]);
            var opened = CatalogOpen.Open(source.Path);
            LibraryCatalogStore.WriteCheckpoint(opened.Session!.DatabasePath, Path.Combine(dir.Path, "library.db.incoming"));

            var recovered = CatalogOpen.Open(dir.Path);
            Assert.Equal("promoted", Assert.Single(recovered.Snapshot()!.Items).Id);
            Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.incoming")));
        }
        finally
        {
            source.Dispose();
        }
    }

    [Fact]
    public void Open_IgnoresPartialIncoming_AndKeepsAHealthyCatalog()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("kept", "/clips/a.mp4")]);
        _ = CatalogOpen.Open(dir.Path);
        File.WriteAllText(Path.Combine(dir.Path, "library.db.incoming"), "partial");

        var recovered = CatalogOpen.Open(dir.Path);
        Assert.Equal("kept", Assert.Single(recovered.Snapshot()!.Items).Id);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.incoming")));
    }

    [Fact]
    public void Open_RestoresPrevious_WhenLiveDatabaseIsUnusable()
    {
        using var dir = new TempDirectory();
        var source = new TempDirectory();
        try
        {
            CatalogSeed.Write(
                source.Path,
                items: [new SeedItem("previous", "/clips/a.mp4")]);
            var opened = CatalogOpen.Open(source.Path);
            LibraryCatalogStore.WriteCheckpoint(opened.Session!.DatabasePath, Path.Combine(dir.Path, "library.db.previous"));
            File.WriteAllText(Path.Combine(dir.Path, "library.db"), "partial");

            var recovered = CatalogOpen.Open(dir.Path);
            Assert.Equal("previous", Assert.Single(recovered.Snapshot()!.Items).Id);
            Assert.True(File.Exists(Path.Combine(dir.Path, "library.db")));
            Assert.False(File.Exists(Path.Combine(dir.Path, "library.db.previous")));
        }
        finally
        {
            source.Dispose();
        }
    }

    [Fact]
    public void RemapSources_RejectsItemThatResolvesBesideTheDestinationRoot()
    {
        using var dir = new TempDirectory();
        var root = Path.Combine(dir.Path, "media", "movies");
        var besideRoot = Path.Combine(dir.Path, "media", "movies-extra", "a.mp4");
        CatalogSeed.Write(
            dir.Path,
            sources: [new SeedSource("s1", root, "Movies")],
            items:
            [
                new SeedItem("i1", besideRoot)
                {
                    SourceId = "s1",
                    RelativePath = "../movies-extra/a.mp4"
                }
            ]);
        var opened = CatalogOpen.Open(dir.Path);
        var result = LibraryCatalogStore.RemapSources(
            opened.Session!.DatabasePath,
            new Dictionary<string, string>(StringComparer.Ordinal) { [root] = root },
            new HashSet<string>(StringComparer.Ordinal));

        Assert.False(result.Success);
        Assert.Contains("escapes the destination root", result.ErrorMessage, StringComparison.Ordinal);
        var stored = LibraryCatalogStore.Read(opened.Session.DatabasePath);
        Assert.Equal(besideRoot, Assert.Single(stored.Items).FullPath);
    }

    [Fact]
    public void InspectCatalogFile_RejectsAFileThatIsNotADatabase()
    {
        using var dir = new TempDirectory();
        var path = Path.Combine(dir.Path, "library.db.backup.partial");
        File.WriteAllText(path, "not a database");
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.NotADatabase, LibraryCatalogStore.InspectCatalogFile(path));
    }

    [Fact]
    public void InspectCatalogFile_RejectsAJsonDocument()
    {
        using var dir = new TempDirectory();
        var path = Path.Combine(dir.Path, "export.json");
        File.WriteAllText(path, """{"sources":[{"id":"s1","rootPath":"/from"}],"items":[{"id":"clip","fullPath":"/from/clip.mp4"}]}""");
        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.NotADatabase, LibraryCatalogStore.InspectCatalogFile(path));
        Assert.Equal(LibraryCatalogStore.DatabaseContentRead.Unreadable, LibraryCatalogStore.ReadDatabaseContent(path));
    }

    [Fact]
    public void RemapSources_StoresACaseOnlyRootChange()
    {
        using var dir = new TempDirectory();
        var oldRoot = Path.Combine(dir.Path, "Media");
        var newRoot = Path.Combine(dir.Path, "media");
        var oldFullPath = Path.Combine(oldRoot, "clip.mp4");
        var newFullPath = Path.Combine(newRoot, "clip.mp4");
        CatalogSeed.Write(
            dir.Path,
            sources: [new SeedSource("src-1", oldRoot)],
            items:
            [
                new SeedItem("item-1", oldFullPath)
                {
                    SourceId = "src-1",
                    RelativePath = "clip.mp4",
                    FileName = "clip.mp4"
                }
            ]);
        var opened = CatalogOpen.Open(dir.Path);
        var result = LibraryCatalogStore.RemapSources(
            opened.Session!.DatabasePath,
            new Dictionary<string, string> { [oldRoot] = newRoot },
            new HashSet<string>());

        Assert.True(result.Success);
        var stored = LibraryCatalogStore.Read(opened.Session.DatabasePath);
        Assert.Equal(newRoot, Assert.Single(stored.Sources).RootPath);
        var item = Assert.Single(stored.Items);
        Assert.Equal(newFullPath, item.FullPath);
        Assert.Equal("clip.mp4", item.RelativePath);
    }

    [Fact]
    public void WriteCheckpoint_DeletesDestinationWhenTheCopyFails()
    {
        using var dir = new TempDirectory();
        CatalogSeed.Write(
            dir.Path,
            items: [new SeedItem("item-1", "/clips/a.mp4")]);
        var opened = CatalogOpen.Open(dir.Path);
        var destination = Path.Combine(dir.Path, "checkpoint.db");
        var created = false;
        var ex = Assert.Throws<IOException>(() => LibraryCatalogStore.WriteCheckpoint(
            opened.Session!.DatabasePath,
            destination,
            () =>
            {
                created = File.Exists(destination);
                throw new IOException("disk full");
            }));
        Assert.Contains("disk full", ex.Message, StringComparison.Ordinal);

        Assert.True(created);
        Assert.False(File.Exists(destination));
        Assert.False(File.Exists(destination + "-wal"));
        Assert.False(File.Exists(destination + "-shm"));
        Assert.False(File.Exists(destination + "-journal"));
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
