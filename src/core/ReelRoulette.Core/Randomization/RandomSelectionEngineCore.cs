using System.IO;

namespace ReelRoulette.Core.Randomization;

public static class RandomSelectionEngineCore
{
    private const int FolderHistoryLimit = 16;

    public static string ComputeEligibleSignature(IReadOnlyList<RandomizationItem> eligibleItems)
    {
        if (eligibleItems == null || eligibleItems.Count == 0)
            return "empty";

        var normalized = eligibleItems
            .Select(i => (i.FullPath ?? string.Empty).Trim().ToLowerInvariant())
            .OrderBy(p => p, StringComparer.Ordinal)
            .ToArray();

        var hash = new HashCode();
        hash.Add(normalized.Length);
        foreach (var path in normalized)
            hash.Add(path, StringComparer.Ordinal);
        return hash.ToHashCode().ToString("X8");
    }

    public static void EnsureStateForEligibleSet(
        RandomizationRuntimeStateCore state,
        RandomizationModeValue mode,
        IReadOnlyList<RandomizationItem> eligibleItems,
        Random rng)
    {
        var signature = ComputeEligibleSignature(eligibleItems);
        if (!string.Equals(state.EligibleSignature, signature, StringComparison.Ordinal) || state.Mode != mode)
        {
            RebuildState(state, mode, eligibleItems, rng);
        }
    }

    public static void RebuildState(
        RandomizationRuntimeStateCore state,
        RandomizationModeValue mode,
        IReadOnlyList<RandomizationItem> eligibleItems,
        Random rng)
    {
        state.Mode = mode;
        state.EligibleSignature = ComputeEligibleSignature(eligibleItems);
        state.ShuffleBag.Clear();
        state.RecentFolders.Clear();
        state.RecentFolderCounts.Clear();

        if (mode == RandomizationModeValue.SmartShuffle)
        {
            foreach (var path in ShufflePaths(eligibleItems.Select(i => i.FullPath).ToList(), rng))
                state.ShuffleBag.Enqueue(path);
        }
    }

    public static string? SelectPath(
        RandomizationRuntimeStateCore state,
        RandomizationModeValue mode,
        IReadOnlyList<RandomizationItem> eligibleItems,
        Random rng)
    {
        if (eligibleItems == null || eligibleItems.Count == 0)
            return null;

        EnsureStateForEligibleSet(state, mode, eligibleItems, rng);

        string? selected = mode switch
        {
            RandomizationModeValue.PureRandom => SelectPureRandom(eligibleItems, rng),
            RandomizationModeValue.WeightedRandom => SelectWeighted(eligibleItems, rng, withSpread: false, state),
            RandomizationModeValue.SmartShuffle => SelectSmartShuffle(state, eligibleItems, rng),
            RandomizationModeValue.SpreadMode => SelectSpread(eligibleItems, rng, state),
            RandomizationModeValue.WeightedWithSpread => SelectWeighted(eligibleItems, rng, withSpread: true, state),
            _ => SelectSmartShuffle(state, eligibleItems, rng)
        };

        if (!string.IsNullOrEmpty(selected))
            PushFolder(state, selected);

        return selected;
    }

    private static string SelectPureRandom(IReadOnlyList<RandomizationItem> eligibleItems, Random rng)
    {
        var idx = rng.Next(eligibleItems.Count);
        return eligibleItems[idx].FullPath;
    }

    private static string SelectSmartShuffle(RandomizationRuntimeStateCore state, IReadOnlyList<RandomizationItem> eligibleItems, Random rng)
    {
        if (state.ShuffleBag.Count == 0)
        {
            foreach (var path in ShufflePaths(eligibleItems.Select(i => i.FullPath).ToList(), rng))
                state.ShuffleBag.Enqueue(path);
        }

        while (state.ShuffleBag.Count > 0)
        {
            var path = state.ShuffleBag.Dequeue();
            if (eligibleItems.Any(i => string.Equals(i.FullPath, path, StringComparison.OrdinalIgnoreCase)))
                return path;
        }

        return SelectPureRandom(eligibleItems, rng);
    }

    private static string SelectSpread(IReadOnlyList<RandomizationItem> eligibleItems, Random rng, RandomizationRuntimeStateCore state)
    {
        var weighted = eligibleItems
            .Select(item => new WeightedCandidate(item.FullPath, SpreadWeight(item.FullPath, state)))
            .ToList();
        return SelectWeightedPath(weighted, rng) ?? SelectPureRandom(eligibleItems, rng);
    }

    private static string SelectWeighted(
        IReadOnlyList<RandomizationItem> eligibleItems,
        Random rng,
        bool withSpread,
        RandomizationRuntimeStateCore state)
    {
        var now = DateTime.UtcNow;
        var weighted = new List<WeightedCandidate>(eligibleItems.Count);

        foreach (var item in eligibleItems)
        {
            var playScore = 1.0 / (1.0 + Math.Max(0, item.PlayCount));
            var recencyScore = ComputeRecencyScore(item.LastPlayedUtc, now);
            var baseWeight = (playScore * 0.6) + (recencyScore * 0.8);
            var spreadWeight = withSpread ? SpreadWeight(item.FullPath, state) : 1.0;
            var finalWeight = Math.Max(0.05, baseWeight * spreadWeight);
            weighted.Add(new WeightedCandidate(item.FullPath, finalWeight));
        }

        return SelectWeightedPath(weighted, rng) ?? SelectPureRandom(eligibleItems, rng);
    }

    private static double ComputeRecencyScore(DateTime? lastPlayedUtc, DateTime nowUtc)
    {
        if (!lastPlayedUtc.HasValue)
            return 1.0;

        var age = nowUtc - lastPlayedUtc.Value;
        if (age.TotalSeconds <= 0)
            return 0.05;

        var normalized = Math.Min(1.0, age.TotalDays / 30.0);
        return Math.Max(0.05, normalized);
    }

    private static double SpreadWeight(string path, RandomizationRuntimeStateCore state)
    {
        var folder = GetFolderKey(path);
        if (string.IsNullOrEmpty(folder))
            return 1.0;

        state.RecentFolderCounts.TryGetValue(folder, out var recentCount);
        return 1.0 / (1.0 + (recentCount * 1.5));
    }

    private static void PushFolder(RandomizationRuntimeStateCore state, string path)
    {
        var folder = GetFolderKey(path);
        if (string.IsNullOrEmpty(folder))
            return;

        state.RecentFolders.Enqueue(folder);
        if (!state.RecentFolderCounts.TryAdd(folder, 1))
            state.RecentFolderCounts[folder]++;

        while (state.RecentFolders.Count > FolderHistoryLimit)
        {
            var removed = state.RecentFolders.Dequeue();
            if (!state.RecentFolderCounts.TryGetValue(removed, out var count))
                continue;

            if (count <= 1)
                state.RecentFolderCounts.Remove(removed);
            else
                state.RecentFolderCounts[removed] = count - 1;
        }
    }

    private static string? SelectWeightedPath(IReadOnlyList<WeightedCandidate> candidates, Random rng)
    {
        if (candidates == null || candidates.Count == 0)
            return null;

        var total = candidates.Sum(c => c.Weight);
        if (total <= 0)
            return null;

        var roll = rng.NextDouble() * total;
        var cumulative = 0.0;
        foreach (var candidate in candidates)
        {
            cumulative += candidate.Weight;
            if (roll <= cumulative)
                return candidate.Path;
        }

        return candidates[candidates.Count - 1].Path;
    }

    private static IEnumerable<string> ShufflePaths(List<string> paths, Random rng)
    {
        for (var i = paths.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (paths[i], paths[j]) = (paths[j], paths[i]);
        }

        return paths;
    }

    private static string GetFolderKey(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return string.Empty;
        var directory = Path.GetDirectoryName(path);
        return string.IsNullOrWhiteSpace(directory)
            ? string.Empty
            : directory.Trim().ToLowerInvariant();
    }

    private readonly record struct WeightedCandidate(string Path, double Weight);
}
