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
}
