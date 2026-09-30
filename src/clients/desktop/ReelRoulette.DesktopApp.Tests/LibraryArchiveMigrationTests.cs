using ReelRoulette.LibraryArchive;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryArchiveMigrationTests
{
    [Fact]
    public void OverwriteConfirmation_NamesTheCatalog()
    {
        Assert.Contains("library catalog", LibraryArchiveMigration.OverwriteConfirmationMessage, StringComparison.Ordinal);
        Assert.DoesNotContain("presets", LibraryArchiveMigration.OverwriteConfirmationMessage, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("library.json", LibraryArchiveMigration.OverwriteConfirmationMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void LibraryExistsWithContent_IncludesUnmigratedLibraryJson_AndAnUnreadableDatabase()
    {
        var temp = Path.Combine(Path.GetTempPath(), "rr-exists-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        try
        {
            Assert.False(LibraryArchiveMigration.LibraryExistsWithContentOnDisk(temp));
            File.WriteAllText(Path.Combine(temp, "library.json"), """{"sources":[],"items":[]}""");
            Assert.False(LibraryArchiveMigration.LibraryExistsWithContentOnDisk(temp));
            File.WriteAllText(Path.Combine(temp, "library.json"), """{"items":[{"id":"kept"}]}""");
            Assert.True(LibraryArchiveMigration.LibraryExistsWithContentOnDisk(temp));
            File.Delete(Path.Combine(temp, "library.json"));
            File.WriteAllText(Path.Combine(temp, "library.db"), "not a database");
            Assert.True(LibraryArchiveMigration.LibraryExistsWithContentOnDisk(temp));
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public void Import_RejectsAFileThatIsNotADatabase()
    {
        var temp = Path.Combine(Path.GetTempPath(), "rr-not-db-" + Guid.NewGuid().ToString("N"));
        var dest = Path.Combine(temp, "dest");
        var source = Path.Combine(temp, "note.db");
        Directory.CreateDirectory(dest);
        File.WriteAllText(source, "not a database");
        try
        {
            Assert.False(LibraryArchiveMigration.TryReadSourceRootPaths(source, out _, out var error));
            Assert.Contains("not a library database", error, StringComparison.Ordinal);
            var result = LibraryArchiveMigration.ImportDatabase(
                source,
                new Dictionary<string, string>(StringComparer.Ordinal),
                new HashSet<string>(StringComparer.Ordinal),
                force: true,
                dest);
            Assert.False(result.Accepted);
            Assert.Contains("not a library database", result.Message, StringComparison.Ordinal);
            Assert.False(File.Exists(Path.Combine(dest, "library.db")));
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public void Import_RoundTrip_RemapsPaths_AndAllowsAParentSegmentInsideTheFolder()
    {
        var temp = Path.Combine(Path.GetTempPath(), "rr-import-db-" + Guid.NewGuid().ToString("N"));
        var dest = Path.Combine(temp, "dest");
        var source = Path.Combine(temp, "source");
        Directory.CreateDirectory(dest);
        Directory.CreateDirectory(source);
        try
        {
            File.WriteAllText(Path.Combine(source, "library.json"), """
                {"sources":[{"id":"s1","rootPath":"/from","displayName":"x","isEnabled":true}],"items":[{"id":"clip","sourceId":"s1","fullPath":"/from/clip.mp4","relativePath":"nested/../clip.mp4","fileName":"clip.mp4"}]}
                """);
            var opened = OpenCatalog(source);
            var checkpoint = Path.Combine(temp, "checkpoint.db");
            ReelRoulette.Core.Library.LibraryCatalogStore.WriteCheckpoint(opened.Session!.DatabasePath, checkpoint);

            Assert.True(LibraryArchiveMigration.TryReadSourceRootPaths(checkpoint, out var roots, out var error), error);
            Assert.Equal("/from", Assert.Single(roots));

            var remap = new Dictionary<string, string>(StringComparer.Ordinal) { ["/from"] = "/to" };
            var result = LibraryArchiveMigration.ImportDatabase(
                checkpoint,
                remap,
                new HashSet<string>(StringComparer.Ordinal),
                force: true,
                dest);

            Assert.True(result.Accepted, result.Message);
            Assert.False(File.Exists(Path.Combine(dest, "library.db.previous")));
            Assert.False(File.Exists(Path.Combine(dest, "library.db.incoming")));
            var imported = OpenCatalog(dest);
            var item = Assert.Single(imported.Catalog!.Items);
            Assert.Equal("clip", item.Id);
            Assert.EndsWith($"{Path.DirectorySeparatorChar}clip.mp4", item.FullPath, StringComparison.Ordinal);
            Assert.Contains($"{Path.DirectorySeparatorChar}to{Path.DirectorySeparatorChar}", item.FullPath, StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public void Import_UnreadableDatabase_RequiresConfirmation_AndIsNotReplacedUntilForced()
    {
        var temp = Path.Combine(Path.GetTempPath(), "rr-import-unreadable-" + Guid.NewGuid().ToString("N"));
        var dest = Path.Combine(temp, "dest");
        var source = Path.Combine(temp, "source");
        Directory.CreateDirectory(dest);
        Directory.CreateDirectory(source);
        try
        {
            File.WriteAllText(Path.Combine(dest, "library.db"), "not a database");
            var checkpoint = CreateCheckpoint(source, temp);
            var remap = new Dictionary<string, string>(StringComparer.Ordinal) { ["/from"] = "/to" };
            var skipped = new HashSet<string>(StringComparer.Ordinal);
            var blocked = LibraryArchiveMigration.ImportDatabase(checkpoint, remap, skipped, force: false, dest);
            Assert.True(blocked.NeedsForceConfirmation);
            Assert.Equal("not a database", File.ReadAllText(Path.Combine(dest, "library.db")));

            var result = LibraryArchiveMigration.ImportDatabase(checkpoint, remap, skipped, force: true, dest);
            Assert.True(result.Accepted, result.Message);
            var imported = OpenCatalog(dest);
            Assert.Equal("clip", Assert.Single(imported.Catalog!.Items).Id);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public void Import_UnmigratedLibraryJson_RequiresConfirmation_AndIsRetiredOnSuccess()
    {
        var temp = Path.Combine(Path.GetTempPath(), "rr-import-json-" + Guid.NewGuid().ToString("N"));
        var dest = Path.Combine(temp, "dest");
        var source = Path.Combine(temp, "source");
        Directory.CreateDirectory(dest);
        Directory.CreateDirectory(source);
        try
        {
            File.WriteAllText(Path.Combine(dest, "library.json"), """{"items":[{"id":"kept","fullPath":"/clips/kept.mp4","fileName":"kept.mp4"}]}""");
            var checkpoint = CreateCheckpoint(source, temp);
            var remap = new Dictionary<string, string>(StringComparer.Ordinal) { ["/from"] = "/to" };
            var skipped = new HashSet<string>(StringComparer.Ordinal);
            var blocked = LibraryArchiveMigration.ImportDatabase(checkpoint, remap, skipped, force: false, dest);
            Assert.True(blocked.NeedsForceConfirmation);
            Assert.False(File.Exists(Path.Combine(dest, "library.db")));

            var result = LibraryArchiveMigration.ImportDatabase(checkpoint, remap, skipped, force: true, dest);
            Assert.True(result.Accepted, result.Message);
            Assert.False(File.Exists(Path.Combine(dest, "library.json")));
            Assert.Contains("kept", File.ReadAllText(Path.Combine(dest, "library.json.migrated")), StringComparison.Ordinal);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [Fact]
    public void Import_WhenDiscardingPreviousThrows_LeavesTheImportedLibrary()
    {
        var temp = Path.Combine(Path.GetTempPath(), "rr-import-discard-" + Guid.NewGuid().ToString("N"));
        var dest = Path.Combine(temp, "dest");
        var source = Path.Combine(temp, "source");
        Directory.CreateDirectory(dest);
        Directory.CreateDirectory(source);
        try
        {
            File.WriteAllText(Path.Combine(dest, "library.json"), """{"items":[{"id":"kept","fullPath":"/clips/kept.mp4","fileName":"kept.mp4"}]}""");
            Assert.NotNull(OpenCatalog(dest).Session);
            var migrated = Path.Combine(dest, "library.json.migrated");
            if (File.Exists(migrated))
            {
                File.Delete(migrated);
            }

            var checkpoint = CreateCheckpoint(source, temp);
            var remap = new Dictionary<string, string>(StringComparer.Ordinal) { ["/from"] = "/to" };
            LibraryArchiveMigration.BeforeDiscardingPreviousCatalog = _ => throw new IOException("previous catalog is in use");
            LibraryArchiveImportResult result;
            try
            {
                result = LibraryArchiveMigration.ImportDatabase(
                    checkpoint,
                    remap,
                    new HashSet<string>(StringComparer.Ordinal),
                    force: true,
                    dest);
            }
            finally
            {
                LibraryArchiveMigration.BeforeDiscardingPreviousCatalog = null;
            }

            Assert.True(result.Accepted);
            Assert.Contains(LibraryArchiveMigration.ImportAlreadyInPlaceMessage, result.Message, StringComparison.Ordinal);
            var imported = OpenCatalog(dest);
            Assert.Equal("clip", Assert.Single(imported.Catalog!.Items).Id);
        }
        finally
        {
            LibraryArchiveMigration.BeforeDiscardingPreviousCatalog = null;
            Directory.Delete(temp, recursive: true);
        }
    }

    private static string CreateCheckpoint(string sourceDirectory, string temp)
    {
        File.WriteAllText(Path.Combine(sourceDirectory, "library.json"), """
            {"sources":[{"id":"s1","rootPath":"/from","displayName":"x","isEnabled":true}],"items":[{"id":"clip","sourceId":"s1","fullPath":"/from/clip.mp4","relativePath":"clip.mp4","fileName":"clip.mp4"}]}
            """);
        var opened = OpenCatalog(sourceDirectory);
        var checkpoint = Path.Combine(temp, "checkpoint.db");
        ReelRoulette.Core.Library.LibraryCatalogStore.WriteCheckpoint(opened.Session!.DatabasePath, checkpoint);
        return checkpoint;
    }

    private static ReelRoulette.Core.Library.LibraryCatalogOpenResult OpenCatalog(string directory)
    {
        return ReelRoulette.Core.Library.LibraryCatalogStore.Open(directory, new ReelRoulette.Core.Library.LibraryCatalogOpenOptions
        {
            ThumbnailDirectory = Path.Combine(directory, "thumbnails")
        });
    }
}
