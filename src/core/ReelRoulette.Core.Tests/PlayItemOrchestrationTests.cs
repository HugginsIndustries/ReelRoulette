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
        LibraryCatalogBackup.WaitForPending();
        if (Directory.Exists(_appData))
        {
            Directory.Delete(_appData, recursive: true);
        }
    }
}
