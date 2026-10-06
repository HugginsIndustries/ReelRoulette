using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ThumbnailResponseTests : IDisposable
{
    private readonly string _appData = Path.Combine(Path.GetTempPath(), "reelroulette-thumbnail-response", Guid.NewGuid().ToString("N"));
    private readonly RefreshPipelineService _refresh;

    public ThumbnailResponseTests()
    {
        Directory.CreateDirectory(Path.Combine(_appData, "thumbnails"));
        var coreSettings = new CoreSettingsService(new ServerRuntimeOptions(), _appData);
        _refresh = new RefreshPipelineService(
            new ServerStateService(),
            NullLogger<RefreshPipelineService>.Instance,
            coreSettings,
            CatalogOpen.Host(_appData),
            _appData);
    }

    [Fact]
    public async Task AThumbnailRequestedAtItsListedVersionIsCachedUntilItChanges()
    {
        WriteThumbnail("item-1", [1, 2, 3]);
        var version = ListedVersion("item-1");

        var response = await SendAsync("item-1", version);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal("private, max-age=31536000, immutable", response.Headers.CacheControl.ToString());
        Assert.Equal($"\"{version}\"", response.Headers.ETag.ToString());
        Assert.False(string.IsNullOrEmpty(response.Headers.LastModified.ToString()));
        Assert.Equal("image/jpeg", response.ContentType);
        Assert.Equal(new byte[] { 1, 2, 3 }, Body(response));
    }

    [Fact]
    public async Task AThumbnailRequestedWithoutAVersionIsCheckedWithTheServerBeforeReuse()
    {
        WriteThumbnail("item-1", [1, 2, 3]);
        var version = ListedVersion("item-1");

        var response = await SendAsync("item-1", version: null);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal("no-cache", response.Headers.CacheControl.ToString());
        Assert.Equal($"\"{version}\"", response.Headers.ETag.ToString());
    }

    [Fact]
    public async Task ARegeneratedThumbnailRequestedAtItsOldVersionIsServedNewAndNotCachedForGood()
    {
        WriteThumbnail("item-1", [1, 2, 3]);
        var oldVersion = ListedVersion("item-1");
        WriteThumbnail("item-1", [4, 5, 6, 7], File.GetLastWriteTimeUtc(_refresh.GetThumbnailPath("item-1")).AddSeconds(5));
        var newVersion = ListedVersion("item-1");
        Assert.NotEqual(oldVersion, newVersion);

        var response = await SendAsync("item-1", oldVersion);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal("no-cache", response.Headers.CacheControl.ToString());
        Assert.Equal($"\"{newVersion}\"", response.Headers.ETag.ToString());
        Assert.Equal(new byte[] { 4, 5, 6, 7 }, Body(response));
    }

    [Fact]
    public async Task AnUnchangedThumbnailTheClientAlreadyHasIsNotSentAgain()
    {
        WriteThumbnail("item-1", [1, 2, 3]);
        var version = ListedVersion("item-1");

        var response = await SendAsync("item-1", version: null, ifNoneMatch: $"\"{version}\"");

        Assert.Equal(StatusCodes.Status304NotModified, response.StatusCode);
        Assert.Equal("no-cache", response.Headers.CacheControl.ToString());
        Assert.Empty(Body(response));
    }

    [Fact]
    public async Task AMissingThumbnailIsNotFoundAndHasNoListedVersion()
    {
        Assert.Null(ListedVersion("item-1"));

        var response = await SendAsync("item-1", version: null);

        Assert.Equal(StatusCodes.Status404NotFound, response.StatusCode);
    }

    public void Dispose()
    {
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(_appData))
        {
            Directory.Delete(_appData, recursive: true);
        }
    }

    private void WriteThumbnail(string itemId, byte[] bytes, DateTime? lastWriteUtc = null)
    {
        var path = _refresh.GetThumbnailPath(itemId);
        File.WriteAllBytes(path, bytes);
        if (lastWriteUtc is { } stamp)
        {
            File.SetLastWriteTimeUtc(path, stamp);
        }
    }

    private string? ListedVersion(string itemId)
    {
        var items = new JsonArray { new JsonObject { ["id"] = itemId } };
        _refresh.EnrichListedItems(items);
        return items[0]!["thumbnailVersion"]?.GetValue<string>();
    }

    private async Task<HttpResponse> SendAsync(string itemId, string? version, string? ifNoneMatch = null)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider()
        };
        context.Request.Method = HttpMethods.Get;
        if (version != null)
        {
            context.Request.QueryString = QueryString.Create("v", version);
        }

        if (ifNoneMatch != null)
        {
            context.Request.Headers.IfNoneMatch = ifNoneMatch;
        }

        context.Response.Body = new MemoryStream();
        var result = ServerHostComposition.ServeThumbnail(context, itemId, _refresh);
        await result.ExecuteAsync(context);
        return context.Response;
    }

    private static byte[] Body(HttpResponse response) => ((MemoryStream)response.Body).ToArray();
}
