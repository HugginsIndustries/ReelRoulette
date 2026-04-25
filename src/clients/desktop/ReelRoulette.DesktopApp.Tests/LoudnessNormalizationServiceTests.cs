using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LoudnessNormalizationServiceTests
{
    [Fact]
    public void GetBaselineLoudness_UsesManualOverride_WhenAutoModeDisabled()
    {
        var service = new LoudnessNormalizationService();
        var library = BuildLibrary(10.0, -20.0, -30.0);

        var baseline = service.GetBaselineLoudness(
            library,
            baselineAutoMode: false,
            baselineOverrideLufs: -23.0);

        Assert.Equal(-23.0, baseline);
    }

    [Fact]
    public void GetBaselineLoudness_Computes75thPercentile_FromEligibleVideoItems()
    {
        var service = new LoudnessNormalizationService();
        var library = new LibraryIndex
        {
            Items =
            [
                new LibraryItem { MediaType = MediaType.Video, HasAudio = true, IntegratedLoudness = -30.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = true, IntegratedLoudness = -24.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = true, IntegratedLoudness = -20.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = true, IntegratedLoudness = -18.0 },
                new LibraryItem { MediaType = MediaType.Photo, HasAudio = true, IntegratedLoudness = -10.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = false, IntegratedLoudness = -8.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = true, IntegratedLoudness = null }
            ]
        };

        var baseline = service.GetBaselineLoudness(
            library,
            baselineAutoMode: true,
            baselineOverrideLufs: -23.0);

        Assert.Equal(-20.0, baseline);
    }

    [Fact]
    public void GetBaselineLoudness_DefaultsToMinus18_WhenNoEligibleLoudnessData()
    {
        var service = new LoudnessNormalizationService();
        var emptyLibrary = new LibraryIndex
        {
            Items =
            [
                new LibraryItem { MediaType = MediaType.Photo, HasAudio = true, IntegratedLoudness = -11.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = false, IntegratedLoudness = -17.0 },
                new LibraryItem { MediaType = MediaType.Video, HasAudio = true, IntegratedLoudness = null }
            ]
        };

        Assert.Equal(-18.0, service.GetBaselineLoudness(emptyLibrary, true, -23.0));
        Assert.Equal(-18.0, service.GetBaselineLoudness(null, true, -23.0));
    }

    [Fact]
    public void GetBaselineLoudness_CachesByLibraryReference_UntilReset()
    {
        var service = new LoudnessNormalizationService();
        var library = BuildLibrary(-30.0, -24.0, -20.0, -18.0);

        var first = service.GetBaselineLoudness(library, true, -23.0);
        Assert.Equal(-20.0, first);

        library.Items.Add(new LibraryItem
        {
            MediaType = MediaType.Video,
            HasAudio = true,
            IntegratedLoudness = -4.0
        });

        var cached = service.GetBaselineLoudness(library, true, -23.0);
        Assert.Equal(first, cached);

        service.ResetCache();
        var recalculated = service.GetBaselineLoudness(library, true, -23.0);
        Assert.Equal(-18.0, recalculated);
    }

    private static LibraryIndex BuildLibrary(params double[] integratedLoudnessValues)
    {
        return new LibraryIndex
        {
            Items = integratedLoudnessValues
                .Select(value => new LibraryItem
                {
                    MediaType = MediaType.Video,
                    HasAudio = true,
                    IntegratedLoudness = value
                })
                .ToList()
        };
    }
}
