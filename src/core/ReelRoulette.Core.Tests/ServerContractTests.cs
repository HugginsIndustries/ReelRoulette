using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class ServerContractTests
{
    [Fact]
    public void VersionResponse_ShouldContainApiVersion()
    {
        var response = ApiContractMapper.MapVersion("1", assetsVersion: "m3");
        Assert.False(string.IsNullOrWhiteSpace(response.AppVersion));
        Assert.Equal("1", response.ApiVersion);
        Assert.Equal("m3", response.AssetsVersion);
    }

    [Fact]
    public void CreateEnvelope_ShouldProduceMonotonicRevisions()
    {
        var service = new ServerStateService();
        var first = service.CreateEnvelope("testEvent", new { value = 1 });
        var second = service.CreateEnvelope("testEvent", new { value = 2 });

        Assert.True(second.Revision > first.Revision);
        Assert.Equal("testEvent", first.EventType);
        Assert.Equal("testEvent", second.EventType);
    }

    [Fact]
    public void ReplayAfter_ShouldReturnBufferedEventsWithoutGap()
    {
        var service = new ServerStateService();
        service.SetFavorite(new FavoriteRequest { Path = "a.mp4", IsFavorite = true });
        service.SetBlacklist(new BlacklistRequest { Path = "b.mp4", IsBlacklisted = true });

        var replay = service.GetReplayAfter(1);
        Assert.False(replay.GapDetected);
        Assert.Single(replay.Events);
        Assert.True(replay.Events[0].Revision > 1);
    }

    [Fact]
    public void LibraryStates_ShouldEnforceFavoriteBlacklistMutualExclusion()
    {
        var service = new ServerStateService();
        service.SetFavorite(new FavoriteRequest { Path = "movie.mp4", IsFavorite = true });
        service.SetBlacklist(new BlacklistRequest { Path = "movie.mp4", IsBlacklisted = true });

        var states = service.GetLibraryStates(new LibraryStatesRequest { Paths = ["movie.mp4"] });
        var state = Assert.Single(states);
        Assert.Equal("movie.mp4", state.Path);
        Assert.False(state.IsFavorite);
        Assert.True(state.IsBlacklisted);
        Assert.True(state.Revision > 0);
    }
}
