using Microsoft.Data.Sqlite;
using ReelRoulette.Core.Library;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// A catalog written by a newer build, or a damaged one, is left with its backups, and an empty
/// catalog is created only on a fresh install.
/// </summary>
public sealed class LibraryCatalogVersionSafetyTests
{
    [Fact]
    public void Open_NewerLiveCatalog_IsLeftUnchangedAndReportedNewer()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, items: [new SeedItem("item-1", "/clips/a.mp4")]);
        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        AssertNewer(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_NewerLiveCatalogWithAnOlderPrevious_LeavesBoth()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, items: [new SeedItem("newer", "/clips/a.mp4")]);
        CatalogSeed.WriteAtVersion(dir.Path, 2, "library.db.previous", items: [new SeedItem("older", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        AssertNewer(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_NewerLiveCatalogWithIncoming_LeavesBoth()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, items: [new SeedItem("newer", "/clips/a.mp4")]);
        CatalogSeed.WriteAtVersion(dir.Path, 2, "library.db.incoming", items: [new SeedItem("incoming", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        AssertNewer(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Theory]
    [InlineData("library.db.incoming")]
    [InlineData("library.db.previous")]
    public void Open_NoLiveCatalogWithANewerReplaceFile_LeavesItAndCreatesNoCatalog(string fileName)
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, fileName, items: [new SeedItem("newer", "/clips/a.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        AssertNewer(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Theory]
    [InlineData("library.db.incoming")]
    [InlineData("library.db.previous")]
    public void Open_CurrentLiveCatalogWithANewerReplaceFile_LeavesBoth(string fileName)
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 2, items: [new SeedItem("current", "/clips/a.mp4")]);
        CatalogSeed.WriteAtVersion(dir.Path, 3, fileName, items: [new SeedItem("newer", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        AssertNewer(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_NewerVersionOnlyInTheWal_IsReportedNewerAndLeavesTheCatalogAndWal()
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        CatalogSeed.Write(source.Path, items: [new SeedItem("item-1", "/clips/a.mp4")]);
        var sourceDatabase = Path.Combine(source.Path, "library.db");
        var database = Path.Combine(dir.Path, "library.db");
        using (var writer = new SqliteConnection($"Data Source={sourceDatabase};Mode=ReadWrite;Pooling=False"))
        {
            writer.Open();
            Execute(writer, "PRAGMA wal_autocheckpoint=0;");
            Execute(writer, "ALTER TABLE items ADD COLUMN file_name_key TEXT NULL;");
            Execute(writer, "PRAGMA user_version = 3;");

            // Copied while the writer is open, as a newer build that stopped without closing leaves them.
            CopyOpenFile(sourceDatabase, database);
            CopyOpenFile(sourceDatabase + "-wal", database + "-wal");
            CopyOpenFile(sourceDatabase + "-shm", database + "-shm");
        }

        var databaseBytes = File.ReadAllBytes(database);
        var walBytes = File.ReadAllBytes(database + "-wal");

        var opened = CatalogOpen.Open(dir.Path);

        AssertNewer(opened);
        Assert.Equal(databaseBytes, File.ReadAllBytes(database));
        Assert.Equal(walBytes, File.ReadAllBytes(database + "-wal"));
        Assert.Equal(
            ["library.db", "library.db-shm", "library.db-wal"],
            Directory.GetFiles(dir.Path).Select(path => Path.GetFileName(path)).Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void Open_NewerCatalogThatCannotBeReadWithAUsablePrevious_LeavesBothAndReportsUnreadable()
    {
        using var dir = new TempDirectory();
        var live = CatalogSeed.WriteAtVersion(dir.Path, 3, items: [new SeedItem("newer", "/clips/a.mp4")]);
        CatalogSeed.WriteAtVersion(dir.Path, 2, "library.db.previous", items: [new SeedItem("older", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        LibraryCatalogOpenResult opened;
        using (CatalogSeed.HoldUnreadable(live))
        {
            opened = CatalogOpen.Open(dir.Path);
        }

        AssertUnreadable(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_CurrentCatalogSqliteCannotReadNow_ReportsUnreadableAndChangesNothing()
    {
        using var dir = new TempDirectory();
        var live = CatalogSeed.WriteAtVersion(dir.Path, 2, items: [new SeedItem("current", "/clips/a.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        LibraryCatalogOpenResult opened;
        using (CatalogSeed.HoldBusy(live))
        {
            opened = CatalogOpen.Open(dir.Path);
        }

        AssertUnreadable(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_CurrentCatalogSqliteCannotReadNowWithAUsablePrevious_LeavesBoth()
    {
        using var dir = new TempDirectory();
        var live = CatalogSeed.WriteAtVersion(dir.Path, 2, items: [new SeedItem("current", "/clips/a.mp4")], standalone: true);
        CatalogSeed.WriteAtVersion(dir.Path, 2, "library.db.previous", items: [new SeedItem("older", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        LibraryCatalogOpenResult opened;
        using (CatalogSeed.HoldBusy(live))
        {
            opened = CatalogOpen.Open(dir.Path);
        }

        AssertUnreadable(opened);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void PrepareIncoming_OverACurrentCatalogSqliteCannotReadNow_IsRefusedAndChangesNothing()
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        var live = CatalogSeed.WriteAtVersion(dir.Path, 2, items: [new SeedItem("current", "/clips/a.mp4")], standalone: true);
        var checkpoint = CatalogSeed.WriteAtVersion(source.Path, 2, items: [new SeedItem("import", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        using (CatalogSeed.HoldBusy(live))
        {
            Assert.Throws<LibraryCatalogUnreadableException>(() => LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, checkpoint));
        }

        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_DamagedCatalogWithBackups_IsQuarantinedAndNoEmptyCatalogIsCreatedThenOrLater()
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, "library.db"), "not a database");
        var backups = Path.Combine(dir.Path, "backups");
        CatalogSeed.WriteAtVersion(backups, 2, "library.db.backup.2026-10-01_10-00-00", standalone: true);

        var first = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, first.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessage, first.Message);
        Assert.Null(first.Session);
        Assert.False(File.Exists(Path.Combine(dir.Path, "library.db")));
        Assert.Equal("not a database", File.ReadAllText(Path.Combine(dir.Path, "library.db.refused")));
        var afterFirst = FolderSnapshot.Take(dir.Path);

        var second = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, second.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessage, second.Message);
        Assert.Null(second.Session);
        Assert.Equal(afterFirst, FolderSnapshot.Take(dir.Path));
    }

    [Theory]
    [InlineData("library.db.refused")]
    [InlineData("library.db.refused.1")]
    public void Open_FolderWithOnlyARefusedFile_CreatesNoCatalog(string refusedName)
    {
        using var dir = new TempDirectory();
        File.WriteAllText(Path.Combine(dir.Path, refusedName), "not a database");
        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Refused, opened.Status);
        Assert.Equal(LibraryCatalogStore.RefusedMessage, opened.Message);
        Assert.Null(opened.Session);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(0)]
    public void Open_FolderWithOnlyACatalogBackup_CreatesNoCatalog(int backupVersion)
    {
        using var dir = new TempDirectory();
        var backups = Path.Combine(dir.Path, "backups");
        if (backupVersion == 0)
        {
            Directory.CreateDirectory(backups);
            File.WriteAllText(Path.Combine(backups, "library.db.backup.partial"), "not a database");
        }
        else
        {
            CatalogSeed.WriteAtVersion(backups, backupVersion, "library.db.backup.2026-10-01_10-00-00", standalone: true);
        }

        var before = FolderSnapshot.Take(dir.Path);

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Missing, opened.Status);
        Assert.Equal(LibraryCatalogStore.MissingMessage, opened.Message);
        Assert.Null(opened.Session);
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void Open_FolderWithOnlySettingsBackups_CreatesAnEmptyCatalog()
    {
        using var dir = new TempDirectory();
        var backups = Path.Combine(dir.Path, "backups");
        Directory.CreateDirectory(backups);
        File.WriteAllText(Path.Combine(backups, "core-settings.json.backup.2026-10-01_10-00-00"), "{}");

        var opened = CatalogOpen.Open(dir.Path);

        Assert.Equal(LibraryCatalogOpenStatus.Opened, opened.Status);
        Assert.Empty(opened.Snapshot()!.Items);
    }

    [Fact]
    public void InspectCatalogFile_NewerCatalog_IsNewerAndLeftUnchanged()
    {
        using var dir = new TempDirectory();
        var path = CatalogSeed.WriteAtVersion(dir.Path, 3);
        var before = FolderSnapshot.Take(dir.Path);

        Assert.Equal(LibraryCatalogStore.CatalogFileInspection.Newer, LibraryCatalogStore.InspectCatalogFile(path));
        Assert.Equal(LibraryCatalogStore.DatabaseContentRead.Unreadable, LibraryCatalogStore.ReadDatabaseContent(path));
        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void PrepareIncoming_OverANewerLiveCatalog_IsRefusedAndChangesNothing()
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, items: [new SeedItem("newer", "/clips/a.mp4")]);
        var checkpoint = CatalogSeed.WriteAtVersion(source.Path, 2, items: [new SeedItem("import", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        Assert.True(LibraryCatalogStore.RecoverAndHasLiveDatabase(dir.Path));
        Assert.Throws<LibraryCatalogNewerException>(() => LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, checkpoint));

        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void PrepareIncoming_BesideANewerIncomingFile_IsRefusedAndChangesNothing()
    {
        using var dir = new TempDirectory();
        using var source = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, "library.db.incoming", items: [new SeedItem("newer", "/clips/a.mp4")], standalone: true);
        var checkpoint = CatalogSeed.WriteAtVersion(source.Path, 2, items: [new SeedItem("import", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        Assert.Throws<LibraryCatalogNewerException>(() => LibraryCatalogStore.PrepareIncomingFromFile(dir.Path, checkpoint));

        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    [Fact]
    public void PublishIncoming_OverANewerLiveCatalog_IsRefusedAndChangesNothing()
    {
        using var dir = new TempDirectory();
        CatalogSeed.WriteAtVersion(dir.Path, 3, items: [new SeedItem("newer", "/clips/a.mp4")]);
        CatalogSeed.WriteAtVersion(dir.Path, 2, "library.db.incoming", items: [new SeedItem("import", "/clips/b.mp4")], standalone: true);
        var before = FolderSnapshot.Take(dir.Path);

        Assert.Throws<LibraryCatalogNewerException>(() => LibraryCatalogStore.PublishIncoming(dir.Path));

        Assert.Equal(before, FolderSnapshot.Take(dir.Path));
    }

    private static void AssertNewer(LibraryCatalogOpenResult opened)
    {
        Assert.Equal(LibraryCatalogOpenStatus.Newer, opened.Status);
        Assert.Equal(LibraryCatalogStore.NewerMessage, opened.Message);
        Assert.Null(opened.Session);
    }

    private static void AssertUnreadable(LibraryCatalogOpenResult opened)
    {
        Assert.Equal(LibraryCatalogOpenStatus.Unreadable, opened.Status);
        Assert.Equal(LibraryCatalogStore.UnreadableMessage, opened.Message);
        Assert.Null(opened.Session);
    }

    /// <summary>
    /// Copies a file SQLite holds open for writing. <see cref="File.Copy(string, string)"/> does not share
    /// write access, so on Windows it cannot open that file.
    /// </summary>
    private static void CopyOpenFile(string source, string destination)
    {
        using var from = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var to = new FileStream(destination, FileMode.CreateNew, FileAccess.Write);
        from.CopyTo(to);
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rr-catalog-version-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
            }
        }
    }
}
