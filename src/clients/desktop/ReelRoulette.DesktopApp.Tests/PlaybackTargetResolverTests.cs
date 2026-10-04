using LibVLCSharp.Shared;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class PlaybackTargetResolverTests
{
    private const string BaseUrl = "http://localhost:45123";

    [Theory]
    [InlineData("clip.mp4", "photo", true, true)]
    [InlineData("clip.mp4", "photo", false, true)]
    [InlineData("still.jpg", "video", true, false)]
    [InlineData("still.jpg", "video", false, false)]
    [InlineData("still.jpg", "photo", false, true)]
    [InlineData("clip.mp4", "video", false, false)]
    public void PhotoOrVideo_ComesFromTheServerMediaType_NotTheExtension(string fileName, string mediaType, bool localAccessible, bool expectedPhoto)
    {
        var target = PlaybackTargetResolver.FromServerResponse(
            new CoreRandomResponse { Id = $"/media/{fileName}", MediaType = mediaType, MediaUrl = "/api/media/token-1" },
            localAccessible,
            forceApiPlayback: false,
            BaseUrl);

        Assert.NotNull(target);
        Assert.Equal(expectedPhoto, target!.IsPhoto);
        Assert.Equal(localAccessible ? FromType.FromPath : FromType.FromLocation, target.PlaybackSourceType);
    }

    [Fact]
    public void ApiPlayback_UsesTheResponseMediaUrl_OrBuildsOneFromTheId()
    {
        var fromUrl = PlaybackTargetResolver.FromServerResponse(
            new CoreRandomResponse { Id = "/media/a.mp4", MediaUrl = "/api/media/token-1" },
            localAccessible: true,
            forceApiPlayback: true,
            BaseUrl);
        var built = PlaybackTargetResolver.FromServerResponse(
            new CoreRandomResponse { Id = "/media/a.mp4" },
            localAccessible: false,
            forceApiPlayback: false,
            BaseUrl);

        Assert.Equal("http://localhost:45123/api/media/token-1", fromUrl!.PlaybackSource);
        Assert.True(fromUrl.UsedApiPath);
        Assert.Equal("http://localhost:45123/api/media/%2Fmedia%2Fa.mp4", built!.PlaybackSource);
    }

    [Fact]
    public void AResponseWithoutAnId_HasNoTarget()
    {
        Assert.Null(PlaybackTargetResolver.FromServerResponse(new CoreRandomResponse { Id = " " }, true, false, BaseUrl));
    }
}
