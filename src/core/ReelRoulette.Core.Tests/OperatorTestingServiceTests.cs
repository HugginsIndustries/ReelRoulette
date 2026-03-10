using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class OperatorTestingServiceTests
{
    [Fact]
    public void Apply_ShouldRequireExplicitTestingModeForFaultFlags()
    {
        var service = new OperatorTestingService();
        var updated = service.Apply(new OperatorTestingUpdateRequest
        {
            TestingModeEnabled = true,
            ForceApiUnavailable = true,
            ForceMediaMissing = true
        });

        Assert.True(updated.TestingModeEnabled);
        Assert.True(updated.ForceApiUnavailable);
        Assert.True(updated.ForceMediaMissing);
    }

    [Fact]
    public void Apply_DisablingTestingMode_ShouldClearFaultFlags()
    {
        var service = new OperatorTestingService();
        service.Apply(new OperatorTestingUpdateRequest
        {
            TestingModeEnabled = true,
            ForceApiVersionMismatch = true,
            ForceCapabilityMismatch = true,
            ForceApiUnavailable = true,
            ForceMediaMissing = true,
            ForceSseDisconnect = true
        });

        var disabled = service.Apply(new OperatorTestingUpdateRequest
        {
            TestingModeEnabled = false
        });

        Assert.False(disabled.TestingModeEnabled);
        Assert.False(disabled.ForceApiVersionMismatch);
        Assert.False(disabled.ForceCapabilityMismatch);
        Assert.False(disabled.ForceApiUnavailable);
        Assert.False(disabled.ForceMediaMissing);
        Assert.False(disabled.ForceSseDisconnect);
    }

    [Fact]
    public void Reset_ShouldKeepTestingModeAndClearFaultFlags()
    {
        var service = new OperatorTestingService();
        service.Apply(new OperatorTestingUpdateRequest
        {
            TestingModeEnabled = true,
            ForceApiUnavailable = true
        });

        var reset = service.Reset();
        Assert.True(reset.TestingModeEnabled);
        Assert.False(reset.ForceApiUnavailable);
    }
}
