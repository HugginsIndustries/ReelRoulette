using ReelRoulette.Core.Storage;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibraryRelativePathTests
{
    [Fact]
    public void GetRelativePath_TrailingSlashRoot_DoesNotStartWithParentNavigation()
    {
        var baseDir = Path.Combine(Path.GetTempPath(), "rr-lib-relpath-" + Guid.NewGuid().ToString("N"));
        try
        {
            var moviesDir = Path.Combine(baseDir, "Movies");
            var filePath = Path.Combine(moviesDir, "Nest", "a.mp4");
            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
            File.WriteAllText(filePath, "");

            var rootWithTrailing = moviesDir + Path.DirectorySeparatorChar;
            var rel = LibraryRelativePath.GetRelativePath(rootWithTrailing, filePath);

            Assert.False(
                LibraryRelativePath.RelativePathStartsWithParentNavigation(rel),
                $"Expected no leading .., got: {rel}");
            var expected = Path.GetRelativePath(Path.GetFullPath(rootWithTrailing), Path.GetFullPath(filePath));
            Assert.Equal(expected, rel);
        }
        finally
        {
            TryDeleteDir(baseDir);
        }
    }

    [Fact]
    public void TryGetLegacyRepairRelativePath_Recomputes_From_OldRoot_And_OldFullPath()
    {
        var baseDir = Path.Combine(Path.GetTempPath(), "rr-lib-legacy-" + Guid.NewGuid().ToString("N"));
        try
        {
            var moviesDir = Path.Combine(baseDir, "Movies");
            var filePath = Path.Combine(moviesDir, "Nest", "a.mp4");
            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
            File.WriteAllText(filePath, "");

            var oldRoot = moviesDir + Path.DirectorySeparatorChar;
            var spuriousStored =
                ".." + Path.DirectorySeparatorChar + "Nest" + Path.DirectorySeparatorChar + "a.mp4";

            Assert.True(
                LibraryRelativePath.RelativePathStartsWithParentNavigation(spuriousStored),
                "fixture should mimic Uri-style bug");

            Assert.True(
                LibraryRelativePath.TryGetLegacyRepairRelativePath(spuriousStored, oldRoot, filePath, out var repaired));

            var expected = LibraryRelativePath.GetRelativePath(oldRoot, filePath);
            Assert.Equal(expected, repaired);
            Assert.False(LibraryRelativePath.RelativePathStartsWithParentNavigation(repaired));
        }
        finally
        {
            TryDeleteDir(baseDir);
        }
    }

    [Fact]
    public void RelativePathStartsWithParentNavigation_Recognizes_Backslash_And_Slash()
    {
        Assert.True(LibraryRelativePath.RelativePathStartsWithParentNavigation(@"..\x\y"));
        Assert.True(LibraryRelativePath.RelativePathStartsWithParentNavigation("../x/y"));
        Assert.True(LibraryRelativePath.RelativePathStartsWithParentNavigation(".."));
        Assert.False(LibraryRelativePath.RelativePathStartsWithParentNavigation("x/../y"));
        Assert.False(LibraryRelativePath.RelativePathStartsWithParentNavigation("..x"));
    }

    [Fact]
    public void TryGetCrossPlatformRelativePath_WindowsDriveAndBackslashes_ProducesRelative()
    {
        Assert.True(
            LibraryRelativePath.TryGetCrossPlatformRelativePath(
                @"Z:\Movies\",
                @"Z:\Movies\Nest\a.mp4",
                out var rel));

        Assert.Equal("Nest/a.mp4", rel.Replace(Path.DirectorySeparatorChar, '/'));
    }

    [Fact]
    public void TryGetCrossPlatformRelativePath_LinuxStyleAbsolute_ProducesRelative()
    {
        Assert.True(
            LibraryRelativePath.TryGetCrossPlatformRelativePath(
                "/home/user/Videos/",
                "/home/user/Videos/Clips/sub/a.mp4",
                out var rel));

        Assert.Equal("Clips/sub/a.mp4", rel.Replace(Path.DirectorySeparatorChar, '/'));
    }

    [Fact]
    public void TryGetLegacyRepairRelativePath_WindowsExportPaths_WorksWithoutHostFilesystem()
    {
        const string wrong = @"..\Nest\a.mp4";
        Assert.True(
            LibraryRelativePath.TryGetLegacyRepairRelativePath(
                wrong,
                @"Z:\Movies\",
                @"Z:\Movies\Nest\a.mp4",
                out var repaired));

        Assert.False(LibraryRelativePath.RelativePathStartsWithParentNavigation(repaired));
        Assert.Equal("Nest/a.mp4", repaired.Replace(Path.DirectorySeparatorChar, '/'));
    }

    [Fact]
    public void TryGetLegacyRepairRelativePath_LinuxExportPaths_WorksWithoutHostFilesystem()
    {
        const string wrong = "../Clips/sub/a.mp4";
        Assert.True(
            LibraryRelativePath.TryGetLegacyRepairRelativePath(
                wrong,
                "/home/user/Videos/",
                "/home/user/Videos/Clips/sub/a.mp4",
                out var repaired));

        Assert.False(LibraryRelativePath.RelativePathStartsWithParentNavigation(repaired));
        Assert.Equal("Clips/sub/a.mp4", repaired.Replace(Path.DirectorySeparatorChar, '/'));
    }

    [Fact]
    public void NormalizeRelativeForDestinationRoot_OnNonWindows_StripsLeadingDriveFromStoredRelative()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var n = LibraryRelativePath.NormalizeRelativeForDestinationRoot(@"Z:\folder\file.mp4");
        Assert.Equal("folder/file.mp4", n.Replace(Path.DirectorySeparatorChar, '/'));
    }

    [Fact]
    public void NormalizeRelativeForDestinationRoot_MapsOppositeSeparatorsToCurrentOs()
    {
        var n = LibraryRelativePath.NormalizeRelativeForDestinationRoot("a/b/c");
        Assert.Equal("a/b/c", n.Replace('\\', '/'));
    }

    private static void TryDeleteDir(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // best-effort cleanup
        }
    }
}
