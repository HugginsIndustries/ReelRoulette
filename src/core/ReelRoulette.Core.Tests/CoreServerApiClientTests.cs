using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class CoreServerApiClientTests
{
    [Fact]
    public async Task SetFavoriteAsync_ShouldPostExpectedJsonShape()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedRequest = request;
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var client = new CoreServerApiClient(new HttpClient(handler));

        var success = await client.SetFavoriteAsync("http://localhost:51301", @"C:\media\movie.mp4", true);

        Assert.True(success);
        Assert.NotNull(capturedRequest);
        Assert.Equal(HttpMethod.Post, capturedRequest!.Method);
        Assert.Equal("http://localhost:51301/api/favorite", capturedRequest.RequestUri!.ToString());

        Assert.False(string.IsNullOrWhiteSpace(capturedJson));
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.Equal(@"C:\media\movie.mp4", doc.RootElement.GetProperty("path").GetString());
        Assert.True(doc.RootElement.GetProperty("isFavorite").GetBoolean());
    }

    [Fact]
    public async Task SyncPresetsAsync_ShouldPostPresetArrayToApiPresets()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedRequest = request;
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));
        var presets = new List<CoreFilterPresetSnapshot>
        {
            new CoreFilterPresetSnapshot
            {
                Name = "Favorites",
                FilterState = JsonSerializer.SerializeToElement(new { favoritesOnly = true })
            }
        };

        var success = await apiClient.SyncPresetsAsync("http://localhost:51301", presets);

        Assert.True(success);
        Assert.NotNull(capturedRequest);
        Assert.Equal("http://localhost:51301/api/presets", capturedRequest!.RequestUri!.ToString());

        Assert.False(string.IsNullOrWhiteSpace(capturedJson));
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);
        Assert.Equal("Favorites", doc.RootElement[0].GetProperty("name").GetString());
        Assert.True(doc.RootElement[0].GetProperty("filterState").GetProperty("favoritesOnly").GetBoolean());
    }

    [Fact]
    public async Task MatchPresetAsync_ShouldPostFilterStateAndParseMatchResponse()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedRequest = request;
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"matched\":true,\"presetId\":\"Favorites\",\"presetName\":\"Favorites\"}", Encoding.UTF8, "application/json")
            };
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));

        var response = await apiClient.MatchPresetAsync("http://localhost:51301", new CorePresetMatchRequest
        {
            FilterState = JsonSerializer.SerializeToElement(new { favoritesOnly = true })
        });

        Assert.NotNull(capturedRequest);
        Assert.Equal("http://localhost:51301/api/presets/match", capturedRequest!.RequestUri!.ToString());
        Assert.NotNull(response);
        Assert.True(response!.Matched);
        Assert.Equal("Favorites", response.PresetId);
        Assert.Equal("Favorites", response.PresetName);

        Assert.False(string.IsNullOrWhiteSpace(capturedJson));
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.True(doc.RootElement.GetProperty("filterState").GetProperty("favoritesOnly").GetBoolean());
    }

    [Fact]
    public async Task RequestRandomAsync_ShouldPostFilterStateWhenProvided()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedRequest = request;
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"id\":\"x\",\"displayName\":\"x\",\"mediaType\":\"video\",\"mediaUrl\":\"/api/media/t\"}", Encoding.UTF8, "application/json")
            };
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));

        var response = await apiClient.RequestRandomAsync("http://localhost:51301", new CoreRandomRequest
        {
            PresetId = "Favorites",
            FilterState = JsonSerializer.SerializeToElement(new { favoritesOnly = true }),
            ClientId = "desktop",
            SessionId = "session-a"
        });

        Assert.NotNull(capturedRequest);
        Assert.Equal("http://localhost:51301/api/random", capturedRequest!.RequestUri!.ToString());
        Assert.NotNull(response);

        Assert.False(string.IsNullOrWhiteSpace(capturedJson));
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.Equal("Favorites", doc.RootElement.GetProperty("presetId").GetString());
        Assert.Equal("desktop", doc.RootElement.GetProperty("clientId").GetString());
        Assert.Equal("session-a", doc.RootElement.GetProperty("sessionId").GetString());
        Assert.True(doc.RootElement.GetProperty("filterState").GetProperty("favoritesOnly").GetBoolean());
    }

    [Fact]
    public async Task RequestRandomAsync_ShouldPreserveAbsoluteMediaUrl()
    {
        var handler = new DelegatingStubHandler(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    "{\"id\":\"C:/media/movie.mp4\",\"displayName\":\"movie.mp4\",\"mediaType\":\"video\",\"mediaUrl\":\"http://localhost:51301/api/media/token-123\"}",
                    Encoding.UTF8,
                    "application/json")
            };
            return Task.FromResult(response);
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));

        var response = await apiClient.RequestRandomAsync("http://localhost:51301", new CoreRandomRequest
        {
            PresetId = "Any",
            ClientId = "desktop"
        });

        Assert.NotNull(response);
        Assert.Equal("http://localhost:51301/api/media/token-123", response!.MediaUrl);
        Assert.Equal("C:/media/movie.mp4", response.Id);
    }

    [Fact]
    public async Task ApplyItemTagsAsync_ShouldPostBatchItemIdsAndDeltas()
    {
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));
        var request = new CoreApplyItemTagsRequest
        {
            ItemIds = ["a.mp4", "b.mp4"],
            AddTags = ["new"],
            RemoveTags = ["old"]
        };

        var success = await apiClient.ApplyItemTagsAsync("http://localhost:51301", request);

        Assert.True(success);
        Assert.False(string.IsNullOrWhiteSpace(capturedJson));
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.Equal(2, doc.RootElement.GetProperty("itemIds").GetArrayLength());
        Assert.Equal("new", doc.RootElement.GetProperty("addTags")[0].GetString());
        Assert.Equal("old", doc.RootElement.GetProperty("removeTags")[0].GetString());
    }

    [Fact]
    public async Task RenameTagAsync_ShouldPostExpectedJsonShape()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedRequest = request;
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));

        var success = await apiClient.RenameTagAsync("http://localhost:51301", new CoreRenameTagRequest
        {
            OldName = "OldTag",
            NewName = "NewTag",
            NewCategoryId = "cat-2"
        });

        Assert.True(success);
        Assert.Equal("http://localhost:51301/api/tag-editor/rename-tag", capturedRequest!.RequestUri!.ToString());
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.Equal("OldTag", doc.RootElement.GetProperty("oldName").GetString());
        Assert.Equal("NewTag", doc.RootElement.GetProperty("newName").GetString());
        Assert.Equal("cat-2", doc.RootElement.GetProperty("newCategoryId").GetString());
    }

    [Fact]
    public async Task ListenToEventsAsync_ShouldParseSingleSseEnvelope()
    {
        var payloadJson = "{\"revision\":42,\"eventType\":\"itemStateChanged\",\"timestamp\":\"2026-03-01T00:00:00Z\",\"payload\":{\"path\":\"movie.mp4\",\"isFavorite\":true,\"isBlacklisted\":false}}";
        var sseBody = $"data: {payloadJson}\n\n";
        HttpRequestMessage? capturedRequest = null;

        var handler = new DelegatingStubHandler(async request =>
        {
            capturedRequest = request;
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(sseBody, Encoding.UTF8, "text/event-stream")
            };
            return response;
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));
        var received = new List<CoreServerEventEnvelope>();

        await apiClient.ListenToEventsAsync(
            "http://localhost:51301",
            "desktop-client",
            "desktop-session",
            "desktop",
            "MyDesktop",
            42,
            envelope =>
            {
                received.Add(envelope);
                return Task.CompletedTask;
            },
            log: null,
            CancellationToken.None);

        var envelope = Assert.Single(received);
        Assert.Equal(42, envelope.Revision);
        Assert.Equal("itemStateChanged", envelope.EventType);
        Assert.NotNull(capturedRequest);
        Assert.Contains("clientId=desktop-client", capturedRequest!.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Contains("sessionId=desktop-session", capturedRequest.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Contains("clientType=desktop", capturedRequest.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Contains("deviceName=MyDesktop", capturedRequest.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Contains("lastEventId=42", capturedRequest.RequestUri!.ToString(), StringComparison.Ordinal);
        Assert.Equal("42", Assert.Single(capturedRequest.Headers.GetValues("Last-Event-ID")));
    }

    [Fact]
    public async Task ListenToEventsAsync_ShouldHandleMalformedPayloadAndContinue()
    {
        var validPayload = "{\"revision\":2,\"eventType\":\"playbackRecorded\",\"timestamp\":\"2026-03-01T00:00:00Z\",\"payload\":{\"path\":\"movie.mp4\",\"clientId\":\"desktop\"}}";
        var sseBody = "data: {this-is-not-json}\n\n" +
                      $"data: {validPayload}\n\n";

        var handler = new DelegatingStubHandler(async _ =>
        {
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(sseBody, Encoding.UTF8, "text/event-stream")
            };
        });
        var apiClient = new CoreServerApiClient(new HttpClient(handler));
        var logs = new List<string>();
        var received = new List<CoreServerEventEnvelope>();

        await apiClient.ListenToEventsAsync(
            "http://localhost:51301",
            "desktop-client",
            "desktop-session",
            "desktop",
            "MyDesktop",
            0,
            envelope =>
            {
                received.Add(envelope);
                return Task.CompletedTask;
            },
            log: message => logs.Add(message),
            CancellationToken.None);

        var envelope = Assert.Single(received);
        Assert.Equal("playbackRecorded", envelope.EventType);
        Assert.Contains(logs, message => message.Contains("Failed to parse SSE payload", StringComparison.Ordinal));
    }

    [Fact]
    public async Task StartRefreshAsync_ShouldPostManualTrigger()
    {
        string? capturedJson = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            capturedJson = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"accepted\":true,\"message\":\"started\",\"runId\":\"run-1\"}", Encoding.UTF8, "application/json")
            };
        });
        var client = new CoreServerApiClient(new HttpClient(handler));

        var response = await client.StartRefreshAsync("http://localhost:51301");

        Assert.NotNull(response);
        Assert.True(response!.Accepted);
        Assert.Equal("run-1", response.RunId);
        Assert.False(string.IsNullOrWhiteSpace(capturedJson));
        using var doc = JsonDocument.Parse(capturedJson!);
        Assert.Equal("manual", doc.RootElement.GetProperty("trigger").GetString());
    }

    [Fact]
    public async Task GetAndUpdateRefreshSettingsAsync_ShouldRoundTripSnapshot()
    {
        var step = 0;
        string? updatePayload = null;
        var handler = new DelegatingStubHandler(async request =>
        {
            step++;
            if (step == 1)
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"autoRefreshEnabled\":true,\"autoRefreshIntervalMinutes\":15}", Encoding.UTF8, "application/json")
                };
            }

            updatePayload = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(updatePayload, Encoding.UTF8, "application/json")
            };
        });
        var client = new CoreServerApiClient(new HttpClient(handler));

        var existing = await client.GetRefreshSettingsAsync("http://localhost:51301");
        var updated = await client.UpdateRefreshSettingsAsync("http://localhost:51301", new CoreRefreshSettingsSnapshot
        {
            AutoRefreshEnabled = false,
            AutoRefreshIntervalMinutes = 20
        });

        Assert.NotNull(existing);
        Assert.True(existing!.AutoRefreshEnabled);
        Assert.Equal(15, existing.AutoRefreshIntervalMinutes);

        Assert.NotNull(updated);
        Assert.False(updated!.AutoRefreshEnabled);
        Assert.Equal(20, updated.AutoRefreshIntervalMinutes);

        Assert.False(string.IsNullOrWhiteSpace(updatePayload));
        using var doc = JsonDocument.Parse(updatePayload!);
        Assert.False(doc.RootElement.GetProperty("autoRefreshEnabled").GetBoolean());
        Assert.Equal(20, doc.RootElement.GetProperty("autoRefreshIntervalMinutes").GetInt32());
    }

    private sealed class DelegatingStubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _handler;

        public DelegatingStubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return _handler(request);
        }
    }
}
