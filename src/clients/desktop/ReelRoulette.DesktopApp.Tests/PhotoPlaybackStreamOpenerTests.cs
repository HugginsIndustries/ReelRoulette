using System.Net;
using System.Text;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class PhotoPlaybackStreamOpenerTests
{
    [Theory]
    [InlineData("http://localhost:45123/api/media/token-1", false, true)]
    [InlineData("https://example.test/api/media/token-1", false, true)]
    [InlineData("/tmp/photo.jpg", true, true)]
    [InlineData("/tmp/photo.jpg", false, false)]
    [InlineData("C:\\media\\photo.jpg", false, false)]
    public void IsRemoteSource_ShouldDetectRemotePlaybackSources(
        string playbackSource,
        bool usedApiPath,
        bool expectedRemote)
    {
        Assert.Equal(expectedRemote, PhotoPlaybackStreamOpener.IsRemoteSource(playbackSource, usedApiPath));
    }

    [Fact]
    public async Task OpenReadStreamAsync_ShouldReturnLocalFileStream_WhenPathExists()
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"reelroulette-photo-{Guid.NewGuid():N}.txt");
        await File.WriteAllTextAsync(tempPath, "local-photo-bytes");

        try
        {
            await using var stream = await PhotoPlaybackStreamOpener.OpenReadStreamAsync(
                new HttpClient(),
                tempPath,
                usedApiPath: false);
            using var reader = new StreamReader(stream, Encoding.UTF8);
            var content = await reader.ReadToEndAsync();
            Assert.Equal("local-photo-bytes", content);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }

    [Fact]
    public async Task OpenReadStreamAsync_ShouldThrowFileNotFound_WhenLocalPathMissing()
    {
        var missingPath = Path.Combine(Path.GetTempPath(), $"reelroulette-missing-{Guid.NewGuid():N}.jpg");

        await Assert.ThrowsAsync<FileNotFoundException>(() =>
            PhotoPlaybackStreamOpener.OpenReadStreamAsync(
                new HttpClient(),
                missingPath,
                usedApiPath: false));
    }

    [Fact]
    public async Task OpenReadStreamAsync_ShouldReturnRemoteBytes_WhenHttpRequestSucceeds()
    {
        var handler = new StubHttpMessageHandler(request =>
        {
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("http://localhost:45123/api/media/token-1", request.RequestUri!.ToString());
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(Encoding.UTF8.GetBytes("remote-photo-bytes"))
            };
        });

        using var httpClient = new HttpClient(handler);
        await using var stream = await PhotoPlaybackStreamOpener.OpenReadStreamAsync(
            httpClient,
            "http://localhost:45123/api/media/token-1",
            usedApiPath: true);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var content = await reader.ReadToEndAsync();
        Assert.Equal("remote-photo-bytes", content);
    }

    [Fact]
    public async Task OpenReadStreamAsync_ShouldThrowFileNotFound_WhenRemoteReturns404()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        using var httpClient = new HttpClient(handler);

        await Assert.ThrowsAsync<FileNotFoundException>(() =>
            PhotoPlaybackStreamOpener.OpenReadStreamAsync(
                httpClient,
                "http://localhost:45123/api/media/missing",
                usedApiPath: true));
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            _responder = responder;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(_responder(request));
        }
    }
}
