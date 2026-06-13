using System.Net;
using System.Text;
using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class CoreServerApiClientPlayItemTests
{
    [Fact]
    public async Task RequestPlayItemAsync_ShouldReturnSuccess_ForPlayableItem()
    {
        var handler = new StubHttpMessageHandler(request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("http://localhost:45123/api/play/item-1", request.RequestUri!.ToString());
            Assert.NotNull(request.Content);
            var body = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            using var doc = JsonDocument.Parse(body);
            Assert.Equal("desktop-1", doc.RootElement.GetProperty("clientId").GetString());
            Assert.Equal("session-1", doc.RootElement.GetProperty("sessionId").GetString());

            var payload = """
                {
                  "id": "/media/a.mp4",
                  "displayName": "a.mp4",
                  "mediaType": "video",
                  "mediaUrl": "/api/media/token-1",
                  "isFavorite": false,
                  "isBlacklisted": false
                }
                """;
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new CoreServerApiClient(httpClient);

        var result = await client.RequestPlayItemAsync("http://localhost:45123", "item-1", "desktop-1", "session-1");

        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.StatusCode);
        Assert.NotNull(result.Response);
        Assert.Equal("/media/a.mp4", result.Response!.Id);
        Assert.Equal("/api/media/token-1", result.Response.MediaUrl);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, "play_item_not_found", "Item not found")]
    [InlineData(HttpStatusCode.NotFound, "play_media_missing", "Media file not found")]
    [InlineData(HttpStatusCode.Conflict, "play_source_disabled", "Source is disabled for this item")]
    [InlineData(HttpStatusCode.UnsupportedMediaType, "play_unsupported_media", "Unsupported media type")]
    public async Task RequestPlayItemAsync_ShouldReturnFailure_WithErrorAndCode(
        HttpStatusCode statusCode,
        string code,
        string error)
    {
        var handler = new StubHttpMessageHandler(_ =>
        {
            var payload = JsonSerializer.Serialize(new { error, code });
            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new CoreServerApiClient(httpClient);

        var result = await client.RequestPlayItemAsync("http://localhost:45123", "missing-item");

        Assert.False(result.IsSuccess);
        Assert.Equal((int)statusCode, result.StatusCode);
        Assert.Equal(error, result.Error);
        Assert.Equal(code, result.Code);
    }

    [Fact]
    public async Task RequestPlayItemAsync_ShouldEscapeItemId_InRequestPath()
    {
        string? requestPath = null;
        var handler = new StubHttpMessageHandler(request =>
        {
            requestPath = request.RequestUri!.AbsolutePath;
            return new HttpResponseMessage(HttpStatusCode.NotFound)
            {
                Content = new StringContent("""{"error":"Item not found","code":"play_item_not_found"}""", Encoding.UTF8, "application/json")
            };
        });

        using var httpClient = new HttpClient(handler);
        var client = new CoreServerApiClient(httpClient);

        await client.RequestPlayItemAsync("http://localhost:45123", "item/with/slash");

        Assert.Equal("/api/play/item%2Fwith%2Fslash", requestPath);
    }

    [Fact]
    public async Task RequestPlayItemAsync_ShouldFailLocally_WhenItemIdBlank()
    {
        using var httpClient = new HttpClient(new StubHttpMessageHandler(_ =>
            throw new InvalidOperationException("HTTP should not be called for blank item id.")));
        var client = new CoreServerApiClient(httpClient);

        var result = await client.RequestPlayItemAsync("http://localhost:45123", "   ");

        Assert.False(result.IsSuccess);
        Assert.Equal(400, result.StatusCode);
        Assert.Equal("play_item_id_invalid", result.Code);
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
