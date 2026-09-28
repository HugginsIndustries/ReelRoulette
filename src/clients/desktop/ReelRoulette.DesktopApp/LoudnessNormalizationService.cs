using System;

namespace ReelRoulette;

/// <summary>
/// Chooses the baseline loudness used by desktop playback normalization.
/// Auto mode uses the server aggregate. Manual mode uses the local override.
/// </summary>
public sealed class LoudnessNormalizationService
{
    public double GetBaselineLoudness(
        bool baselineAutoMode,
        double baselineOverrideLufs,
        double serverBaselineLufs,
        Action<string>? log = null)
    {
        if (!baselineAutoMode)
        {
            log?.Invoke($"GetLibraryBaselineLoudness: Manual mode - using override baseline: {baselineOverrideLufs:F2} LUFS");
            return baselineOverrideLufs;
        }

        log?.Invoke($"GetLibraryBaselineLoudness: Using server baseline: {serverBaselineLufs:F2} LUFS");
        return serverBaselineLufs;
    }
}
