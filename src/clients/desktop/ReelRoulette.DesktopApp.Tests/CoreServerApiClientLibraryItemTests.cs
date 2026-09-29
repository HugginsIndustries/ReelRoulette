using System.Net;
using System.Text;
using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class CoreServerApiClientLibraryItemTests
{
    [Fact]
    public async Task GetLibraryItemAsync_NotFoundIsDistinctFromFailure()
    {
        var notFound = await Read(HttpStatusCode.NotFound, """{"error":"item not found"}""");
        var failed = await Read(HttpStatusCode.InternalServerError, """{"error":"unavailable"}""");
        var found = await Read(HttpStatusCode.OK, """{"id":"item-1","fullPath":"/media/a.mp4","playCount":3}""");

        Assert.Equal(CurrentFileReadResult.NotFound, notFound.Result);
        Assert.Equal(CurrentFileReadResult.Failed, failed.Result);
        Assert.Equal(CurrentFileReadResult.Found, found.Result);
        Assert.Equal("item-1", found.Item.GetProperty("id").GetString());
        Assert.Equal(3, found.Item.GetProperty("playCount").GetInt32());
    }

    [Fact]
    public async Task GetLibraryItemAsync_BlankIdDoesNotCallTheServer()
    {
        using var httpClient = new HttpClient(new StubHttpMessageHandler(_ =>
            throw new InvalidOperationException("HTTP should not be called for a blank id.")));
        var client = new CoreServerApiClient(httpClient);

        var result = await client.GetLibraryItemAsync("http://localhost:45123", "  ");

        Assert.Equal(CurrentFileReadResult.Failed, result.Result);
    }

    private static async Task<LibraryItemRead> Read(HttpStatusCode statusCode, string payload)
    {
        var handler = new StubHttpMessageHandler(request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("http://localhost:45123/api/library/item", request.RequestUri!.ToString());
            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
        });
        using var httpClient = new HttpClient(handler);
        var client = new CoreServerApiClient(httpClient);
        return await client.GetLibraryItemAsync("http://localhost:45123", "/media/a.mp4");
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
