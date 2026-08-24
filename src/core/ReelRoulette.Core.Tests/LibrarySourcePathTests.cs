using ReelRoulette.Core.Storage;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class LibrarySourcePathTests
{
    [Theory]
    [InlineData("/mnt/nas/multimedia/YouTube/", "YouTube")]
    [InlineData("/mnt/nas/multimedia/YouTube", "YouTube")]
    [InlineData("/mnt/nas/multimedia/YouTube\\", "YouTube")]
    [InlineData("C:\\media\\YouTube\\", "YouTube")]
    [InlineData("C:\\media\\YouTube", "YouTube")]
    [InlineData("  /mnt/nas/multimedia/YouTube/  ", "YouTube")]
    public void GetFolderDisplayName_UsesLastSegment_WhenPathHasTrailingSeparator(string path, string expected)
    {
        Assert.Equal(expected, LibrarySourcePath.GetFolderDisplayName(path));
        Assert.False(string.IsNullOrEmpty(LibrarySourcePath.GetFolderDisplayName(path)));
    }

    [Fact]
    public void GetFolderDisplayName_TrailingSlash_IsNotEmptyUnlikePathGetFileName()
    {
        const string path = "/mnt/nas/multimedia/YouTube/";
        Assert.Equal(string.Empty, Path.GetFileName(path));
        Assert.Equal("YouTube", LibrarySourcePath.GetFolderDisplayName(path));
    }

    [Fact]
    public void NormalizeRootPath_RemovesTrailingSeparators_WithoutStrippingRoot()
    {
        Assert.Equal("/mnt/nas/multimedia/YouTube", LibrarySourcePath.NormalizeRootPath("/mnt/nas/multimedia/YouTube/"));
        Assert.Equal("/mnt/nas/multimedia/YouTube", LibrarySourcePath.NormalizeRootPath("/mnt/nas/multimedia/YouTube"));
        Assert.Equal("/", LibrarySourcePath.NormalizeRootPath("/"));
        Assert.Equal("/", LibrarySourcePath.NormalizeRootPath("///"));
        Assert.Equal(string.Empty, LibrarySourcePath.NormalizeRootPath("   "));
    }

    [Fact]
    public void NormalizeRootPath_PreservesWindowsVolumeRoot()
    {
        Assert.Equal(@"C:\", LibrarySourcePath.NormalizeRootPath(@"C:\"));
        Assert.Equal(@"C:\", LibrarySourcePath.NormalizeRootPath(@"C:\\"));
        Assert.Equal("C:/", LibrarySourcePath.NormalizeRootPath("C:/"));
        Assert.Equal(@"D:\media", LibrarySourcePath.NormalizeRootPath(@"D:\media\"));
        Assert.NotEqual("C:", LibrarySourcePath.NormalizeRootPath(@"C:\"));
    }

    [Fact]
    public void RootPathsEqual_IgnoresTrailingSeparators()
    {
        Assert.True(LibrarySourcePath.RootPathsEqual("/mnt/nas/multimedia/YouTube/", "/mnt/nas/multimedia/YouTube"));
        Assert.True(LibrarySourcePath.RootPathsEqual("/a/b\\", "/a/b"));
        Assert.True(LibrarySourcePath.RootPathsEqual(@"C:\", @"C:\\"));
        Assert.False(LibrarySourcePath.RootPathsEqual("/a/b", "/a/c"));
        Assert.False(LibrarySourcePath.RootPathsEqual(@"C:\", @"C:\media"));
    }

    [Fact]
    public void ResolveDisplayName_PrefersExplicitName_ThenFolderSegment()
    {
        Assert.Equal("Custom", LibrarySourcePath.ResolveDisplayName("Custom", "/mnt/nas/multimedia/YouTube/"));
        Assert.Equal("YouTube", LibrarySourcePath.ResolveDisplayName("  ", "/mnt/nas/multimedia/YouTube/"));
        Assert.Equal("YouTube", LibrarySourcePath.ResolveDisplayName(null, "/mnt/nas/multimedia/YouTube/"));
    }
}
