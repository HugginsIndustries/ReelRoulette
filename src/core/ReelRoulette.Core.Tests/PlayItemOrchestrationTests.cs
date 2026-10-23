using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class PlayItemOrchestrationTests : IDisposable
{
    private readonly string _appData = Path.Combine(Path.GetTempPath(), "reelroulette-play-orchestration", Guid.NewGuid().ToString("N"));

    public PlayItemOrchestrationTests()
    {
        Directory.CreateDirectory(_appData);
    }

    [Fact]
    public void PlayHandoff_MatchesRecordPlaybackAndPublishPlaybackRecorded()
    {
        var mediaPath = Path.Combine(_appData, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01, 0x02, 0x03]);

        File.WriteAllText(Path.Combine(_appData, "core-settings.json"), """
{
  "backup": {
    "enabled": true,
    "minimumBackupGapMinutes": 360,
    "numberOfBackups": 8
  }
}
""");

        // The catalog lists no source, so the item points at a source id it does not know.
        CatalogSeed.Write(
            _appData,
            items:
            [
                new SeedItem("orch-item", mediaPath)
                {
                    SourceId = "s1"
                }
            ]);

        var catalog = CatalogOpen.Host(_appData);
        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            catalog);
        var operations = new LibraryOperationsService(catalog, NullLogger<LibraryOperationsService>.Instance, _appData);
        var state = new ServerStateService(NullLogger<ServerStateService>.Instance, catalog);

        Assert.True(playback.TryPlayItem("orch-item", false, out var playResponse, out _, out _, out _));
        Assert.NotNull(playResponse);

        var recorded = operations.RecordPlayback(playResponse!.ItemId);
        Assert.True(recorded.Found);

        state.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
        {
            ItemId = recorded.ItemId,
            ClientId = "client-a",
            SessionId = "session-b",
            PlayCount = recorded.PlayCount,
            LastPlayedUtc = recorded.LastPlayedUtc
        });

        var replay = state.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("playbackRecorded", envelope.EventType);
        var payload = Assert.IsType<PlaybackRecordedPayload>(envelope.Payload);
        Assert.Equal("orch-item", payload.ItemId);
        Assert.Equal("client-a", payload.ClientId);
        Assert.Equal("session-b", payload.SessionId);
        Assert.NotNull(payload.PlayCount);
    }

    [Fact]
    public void PlayItem_WithoutRecordPlayback_CountsOnePlayAndPublishesPlaybackRecorded()
    {
        var (host, playback, operations, state) = SeedPlayableItem();
        var request = Request("""{"clientId":"client-a"}""");
        Assert.True(request.RecordPlayback);

        var result = ServerHostComposition.PlayItem("orch-item", request, playback, operations, state, new OperatorTestingService());

        Assert.Equal(StatusCodes.Status200OK, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.False(string.IsNullOrEmpty(Assert.IsType<PlaybackItemResponse>(Assert.IsAssignableFrom<IValueHttpResult>(result).Value).MediaUrl));
        Assert.Equal(1, host.Session.ReadItemState("orch-item")!.PlayCount);
        Assert.Single(state.GetReplayAfter(0).Events, envelope => envelope.EventType == "playbackRecorded");
    }

    // The WebUI sends it only to get a fresh media URL for an item already playing, which counts no second play.
    [Fact]
    public void PlayItem_WithRecordPlaybackFalse_AnswersTheSameWithoutCountingAPlayOrPublishing()
    {
        var (host, playback, operations, state) = SeedPlayableItem();
        var request = Request("""{"clientId":"client-a","recordPlayback":false}""");
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(request), "PlayItemRequest");

        var result = ServerHostComposition.PlayItem("orch-item", request, playback, operations, state, new OperatorTestingService());

        Assert.Equal(StatusCodes.Status200OK, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        var response = Assert.IsType<PlaybackItemResponse>(Assert.IsAssignableFrom<IValueHttpResult>(result).Value);
        Assert.Equal("orch-item", response.ItemId);
        Assert.False(string.IsNullOrEmpty(response.MediaUrl));
        OpenApiSpec.AssertMatchesSchema(OpenApiSpec.SerializeAsServer(response), "PlaybackItemResponse");
        Assert.Equal(0, host.Session.ReadItemState("orch-item")!.PlayCount);
        Assert.Empty(state.GetReplayAfter(0).Events);
    }

    public void Dispose()
    {
        if (Directory.Exists(_appData))
        {
            Directory.Delete(_appData, recursive: true);
        }
    }

    private static PlayItemRequest Request(string json)
    {
        return System.Text.Json.JsonSerializer.Deserialize<PlayItemRequest>(json, OpenApiSpec.ServerJsonOptions)!;
    }

    private (LibraryCatalogHost Host, LibraryPlaybackService Playback, LibraryOperationsService Operations, ServerStateService State) SeedPlayableItem()
    {
        var mediaPath = Path.Combine(_appData, "clip.mp4");
        File.WriteAllBytes(mediaPath, [0x01]);
        CatalogSeed.Write(
            _appData,
            sources: [new SeedSource("s1", _appData)],
            items: [new SeedItem("orch-item", mediaPath) { SourceId = "s1", FileName = "clip.mp4" }]);
        var host = CatalogOpen.Host(_appData);
        return (
            host,
            new LibraryPlaybackService(new ServerMediaTokenStore(), NullLogger<LibraryPlaybackService>.Instance, host),
            new LibraryOperationsService(host, NullLogger<LibraryOperationsService>.Instance, _appData),
            new ServerStateService());
    }
}
