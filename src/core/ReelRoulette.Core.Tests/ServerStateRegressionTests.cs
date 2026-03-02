using System.Text.Json;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerStateRegressionTests
{
    [Fact]
    public void SetFilterSessionSnapshot_ShouldPublishFilterSessionChangedEvent()
    {
        var service = new ServerStateService();
        var snapshot = new FilterSessionSnapshot
        {
            ActivePresetName = "Favorites",
            CurrentFilterState = JsonSerializer.SerializeToElement(new { favoritesOnly = true }),
            Presets =
            [
                new FilterPresetSnapshot
                {
                    Name = "Favorites",
                    FilterState = JsonSerializer.SerializeToElement(new { favoritesOnly = true })
                }
            ]
        };

        service.SetFilterSessionSnapshot(snapshot);

        var replay = service.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("filterSessionChanged", envelope.EventType);
        Assert.True(envelope.Revision > 0);
    }

    [Fact]
    public void GetFilterSessionSnapshot_ShouldReturnDefensiveCopy()
    {
        var service = new ServerStateService();
        service.SetFilterSessionSnapshot(new FilterSessionSnapshot
        {
            ActivePresetName = "Original",
            CurrentFilterState = JsonSerializer.SerializeToElement(new { includeVideos = true }),
            Presets =
            [
                new FilterPresetSnapshot
                {
                    Name = "Original",
                    FilterState = JsonSerializer.SerializeToElement(new { includeVideos = true })
                }
            ]
        });

        var firstRead = service.GetFilterSessionSnapshot();
        firstRead.ActivePresetName = "Mutated";
        firstRead.Presets![0].Name = "Mutated";

        var secondRead = service.GetFilterSessionSnapshot();
        Assert.Equal("Original", secondRead.ActivePresetName);
        Assert.Equal("Original", secondRead.Presets![0].Name);
    }

    [Fact]
    public void ReplayAfter_ShouldDetectGapWhenRevisionFallsOutsideBuffer()
    {
        var service = new ServerStateService();

        for (var i = 0; i < 300; i++)
        {
            service.SetFavorite(new FavoriteRequest
            {
                Path = $"clip-{i}.mp4",
                IsFavorite = true
            });
        }

        var replay = service.GetReplayAfter(1);
        Assert.True(replay.GapDetected);
        Assert.NotEmpty(replay.Events);
    }

    [Fact]
    public void RecordPlayback_ShouldPublishPlaybackRecordedPayloadWithClientId()
    {
        var service = new ServerStateService();
        service.RecordPlayback(new RecordPlaybackRequest
        {
            Path = "movie.mp4",
            ClientId = "desktop-client"
        });

        var replay = service.GetReplayAfter(0);
        var envelope = Assert.Single(replay.Events);
        Assert.Equal("playbackRecorded", envelope.EventType);

        var payload = Assert.IsType<PlaybackRecordedPayload>(envelope.Payload);
        Assert.Equal("movie.mp4", payload.Path);
        Assert.Equal("desktop-client", payload.ClientId);
    }

    [Fact]
    public void LibraryStates_WithoutPathFilter_ShouldReturnAllPathsSorted()
    {
        var service = new ServerStateService();
        service.SetFavorite(new FavoriteRequest { Path = "zeta.mp4", IsFavorite = true });
        service.SetFavorite(new FavoriteRequest { Path = "alpha.mp4", IsFavorite = true });

        var allStates = service.GetLibraryStates(new LibraryStatesRequest());
        Assert.Equal(2, allStates.Count);
        Assert.Equal("alpha.mp4", allStates[0].Path);
        Assert.Equal("zeta.mp4", allStates[1].Path);
    }

    [Fact]
    public void SetFavoriteAfterBlacklist_ShouldClearBlacklistForSameItem()
    {
        var service = new ServerStateService();
        service.SetBlacklist(new BlacklistRequest { Path = "movie.mp4", IsBlacklisted = true });
        service.SetFavorite(new FavoriteRequest { Path = "movie.mp4", IsFavorite = true });

        var state = Assert.Single(service.GetLibraryStates(new LibraryStatesRequest { Paths = ["movie.mp4"] }));
        Assert.True(state.IsFavorite);
        Assert.False(state.IsBlacklisted);
    }
}
