using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LoudnessNormalizationServiceTests
{
    [Fact]
    public void GetBaselineLoudness_UsesManualOverride_WhenAutoModeDisabled()
    {
        var service = new LoudnessNormalizationService();

        var baseline = service.GetBaselineLoudness(
            baselineAutoMode: false,
            baselineOverrideLufs: -23.0,
            serverBaselineLufs: -16.0);

        Assert.Equal(-23.0, baseline);
    }

    [Fact]
    public void GetBaselineLoudness_UsesTheServerAggregate_WhenAutoModeEnabled()
    {
        var service = new LoudnessNormalizationService();

        var baseline = service.GetBaselineLoudness(
            baselineAutoMode: true,
            baselineOverrideLufs: -23.0,
            serverBaselineLufs: -16.0);

        Assert.Equal(-16.0, baseline);
    }
}
