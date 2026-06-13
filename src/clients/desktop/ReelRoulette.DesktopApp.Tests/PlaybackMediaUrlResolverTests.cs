using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class PlaybackMediaUrlResolverTests
{
    private const string BaseUrl = "http://localhost:45123";

    [Fact]
    public void ResolveAbsoluteMediaUrl_ShouldCombineRootRelativeApiMediaPath_WithBaseUrl()
    {
        var resolved = PlaybackMediaUrlResolver.ResolveAbsoluteMediaUrl(
            "/api/media/f22bf78a4139455d9a26bd0cbdf2a7b3",
            BaseUrl);

        Assert.Equal("http://localhost:45123/api/media/f22bf78a4139455d9a26bd0cbdf2a7b3", resolved);
        Assert.DoesNotContain("file://", resolved, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ResolveAbsoluteMediaUrl_ShouldPreserveHttpAbsoluteUrl()
    {
        const string absolute = "http://127.0.0.1:45123/api/media/token-1";
        var resolved = PlaybackMediaUrlResolver.ResolveAbsoluteMediaUrl(absolute, BaseUrl);
        Assert.Equal(absolute, resolved);
    }

    [Fact]
    public void ResolveAbsoluteMediaUrl_ShouldPreserveHttpsAbsoluteUrl()
    {
        const string absolute = "https://example.test/api/media/token-1";
        var resolved = PlaybackMediaUrlResolver.ResolveAbsoluteMediaUrl(absolute, BaseUrl);
        Assert.Equal(absolute, resolved);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ResolveAbsoluteMediaUrl_ShouldReturnNull_WhenMediaUrlMissing(string? mediaUrl)
    {
        Assert.Null(PlaybackMediaUrlResolver.ResolveAbsoluteMediaUrl(mediaUrl, BaseUrl));
    }

    [Fact]
    public void ResolveAbsoluteMediaUrl_ShouldReturnNull_WhenBaseUrlInvalid()
    {
        Assert.Null(PlaybackMediaUrlResolver.ResolveAbsoluteMediaUrl("/api/media/x", "not-a-uri"));
    }
}
