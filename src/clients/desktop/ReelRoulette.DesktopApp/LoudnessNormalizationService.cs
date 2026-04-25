using System;
using System.Linq;

namespace ReelRoulette;

/// <summary>
/// Computes and caches the baseline loudness used by desktop playback normalization.
/// </summary>
public sealed class LoudnessNormalizationService
{
    private const double DefaultBaselineLoudnessDb = -18.0;

    private LibraryIndex? _cachedLibraryIndex;
    private double? _cachedBaselineLoudnessDb;

    public void ResetCache()
    {
        _cachedLibraryIndex = null;
        _cachedBaselineLoudnessDb = null;
    }

    public double GetBaselineLoudness(
        LibraryIndex? libraryIndex,
        bool baselineAutoMode,
        double baselineOverrideLufs,
        Action<string>? log = null)
    {
        if (!baselineAutoMode)
        {
            log?.Invoke($"GetLibraryBaselineLoudness: Manual mode - using override baseline: {baselineOverrideLufs:F2} LUFS");
            return baselineOverrideLufs;
        }

        if (_cachedBaselineLoudnessDb.HasValue && ReferenceEquals(_cachedLibraryIndex, libraryIndex))
        {
            return _cachedBaselineLoudnessDb.Value;
        }

        log?.Invoke("GetLibraryBaselineLoudness: Calculating baseline loudness from library");

        if (libraryIndex == null)
        {
            log?.Invoke("GetLibraryBaselineLoudness: Library index is null - using default baseline of -18 dB");
            _cachedLibraryIndex = null;
            _cachedBaselineLoudnessDb = DefaultBaselineLoudnessDb;
            return _cachedBaselineLoudnessDb.Value;
        }

        var videosWithLoudness = libraryIndex.Items
            .Where(item => item.MediaType == MediaType.Video &&
                          item.HasAudio == true &&
                          item.IntegratedLoudness.HasValue)
            .Select(item => item.IntegratedLoudness!.Value)
            .OrderBy(loudness => loudness)
            .ToList();

        if (videosWithLoudness.Count == 0)
        {
            log?.Invoke("GetLibraryBaselineLoudness: No videos with loudness data - using default baseline of -18 dB");
            _cachedLibraryIndex = libraryIndex;
            _cachedBaselineLoudnessDb = DefaultBaselineLoudnessDb;
            return _cachedBaselineLoudnessDb.Value;
        }

        var percentile75Index = (int)Math.Ceiling(videosWithLoudness.Count * 0.75) - 1;
        percentile75Index = Math.Clamp(percentile75Index, 0, videosWithLoudness.Count - 1);
        var baselineLoudness = videosWithLoudness[percentile75Index];

        _cachedLibraryIndex = libraryIndex;
        _cachedBaselineLoudnessDb = baselineLoudness;
        log?.Invoke($"GetLibraryBaselineLoudness: Baseline calculated - 75th percentile: {baselineLoudness:F2} dB from {videosWithLoudness.Count} videos");

        return baselineLoudness;
    }
}
