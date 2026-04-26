using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Contracts;
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

        var library = new JsonObject
        {
            ["sources"] = new JsonArray
            {
                new JsonObject { ["id"] = "s1", ["isEnabled"] = true }
            },
            ["items"] = new JsonArray
            {
                new JsonObject
                {
                    ["id"] = "orch-item",
                    ["fullPath"] = mediaPath,
                    ["fileName"] = "clip.mp4",
                    ["mediaType"] = 0,
                    ["sourceId"] = "s1",
                    ["isBlacklisted"] = false
                }
            },
            ["tags"] = new JsonArray(),
            ["categories"] = new JsonArray()
        };
        File.WriteAllText(Path.Combine(_appData, "library.json"), library.ToJsonString());

        var playback = new LibraryPlaybackService(
            new ServerMediaTokenStore(),
            NullLogger<LibraryPlaybackService>.Instance,
            _appData);
        var operations = new LibraryOperationsService(NullLogger<LibraryOperationsService>.Instance, _appData);
        var state = new ServerStateService(NullLogger<ServerStateService>.Instance, _appData);

        Assert.True(playback.TryPlayItem("orch-item", false, out var playResponse, out _, out _, out _));
        Assert.NotNull(playResponse);

        var recorded = operations.RecordPlayback(playResponse!.Id);
        Assert.True(recorded.Found);

        state.PublishExternal("playbackRecorded", new PlaybackRecordedPayload
        {
            Path = playResponse.Id,
            ClientId = "client-a",
            SessionId = "session-b",
            PlayCount = recorded.PlayCount,
            LastPlayedUtc = recorded.LastPlayedUtc
        });

        var replay = state.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("playbackRecorded", envelope.EventType);
        var payload = Assert.IsType<PlaybackRecordedPayload>(envelope.Payload);
        Assert.Equal(playResponse.Id, payload.Path);
        Assert.Equal("client-a", payload.ClientId);
        Assert.Equal("session-b", payload.SessionId);
        Assert.NotNull(payload.PlayCount);
    }

    public void Dispose()
    {
        if (Directory.Exists(_appData))
        {
            Directory.Delete(_appData, recursive: true);
        }
    }
}
