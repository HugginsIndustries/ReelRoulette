using System.IO;

namespace ReelRoulette.Core.Randomization;

public static class RandomSelectionEngineCore
{
    private const int FolderHistoryLimit = 16;

    /// <summary>
    /// Identifies the eligible set by its item ids, which callers pass in ordinal id order so the same set
    /// always gives the same signature. Paths are not part of it: the shuffle bag holds item ids, so an item
    /// whose path changed is still the same entry.
    /// </summary>
    public static string ComputeEligibleSignature(IReadOnlyList<RandomizationItem> eligibleItems)
    {
        if (eligibleItems == null || eligibleItems.Count == 0)
            return "empty";

        var hash = new HashCode();
        hash.Add(eligibleItems.Count);
        for (var i = 0; i < eligibleItems.Count; i++)
            hash.Add(eligibleItems[i].Id, StringComparer.Ordinal);
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
            RebuildState(state, mode, eligibleItems, signature, rng);
        }
    }

    private static void RebuildState(
        RandomizationRuntimeStateCore state,
        RandomizationModeValue mode,
        IReadOnlyList<RandomizationItem> eligibleItems,
        string signature,
        Random rng)
    {
        state.Mode = mode;
        state.EligibleSignature = signature;
        state.ShuffleBag.Clear();
        state.RecentFolders.Clear();
        state.RecentFolderCounts.Clear();

        if (mode == RandomizationModeValue.SmartShuffle)
        {
            FillShuffleBag(state, eligibleItems, rng);
        }
    }

    /// <summary>Picks one of the eligible items for the mode, or null when there are none.</summary>
    public static RandomizationItem? SelectItem(
        RandomizationRuntimeStateCore state,
        RandomizationModeValue mode,
        IReadOnlyList<RandomizationItem> eligibleItems,
        Random rng)
    {
        if (eligibleItems == null || eligibleItems.Count == 0)
            return null;

        EnsureStateForEligibleSet(state, mode, eligibleItems, rng);

        var selected = mode switch
        {
            RandomizationModeValue.PureRandom => SelectPureRandom(eligibleItems, rng),
            RandomizationModeValue.WeightedRandom => SelectWeighted(eligibleItems, rng, withSpread: false, state),
            RandomizationModeValue.SmartShuffle => SelectSmartShuffle(state, eligibleItems, rng),
            RandomizationModeValue.SpreadMode => SelectSpread(eligibleItems, rng, state),
            RandomizationModeValue.WeightedWithSpread => SelectWeighted(eligibleItems, rng, withSpread: true, state),
            _ => SelectSmartShuffle(state, eligibleItems, rng)
        };

        PushFolder(state, selected.FullPath);
        return selected;
    }

    private static RandomizationItem SelectPureRandom(IReadOnlyList<RandomizationItem> eligibleItems, Random rng)
    {
        var idx = rng.Next(eligibleItems.Count);
        return eligibleItems[idx];
    }

    private static RandomizationItem SelectSmartShuffle(RandomizationRuntimeStateCore state, IReadOnlyList<RandomizationItem> eligibleItems, Random rng)
    {
        if (state.ShuffleBag.Count == 0)
        {
            FillShuffleBag(state, eligibleItems, rng);
        }

        var byId = new Dictionary<string, RandomizationItem>(eligibleItems.Count, StringComparer.Ordinal);
        for (var i = 0; i < eligibleItems.Count; i++)
            byId.TryAdd(eligibleItems[i].Id, eligibleItems[i]);

        while (state.ShuffleBag.Count > 0)
        {
            var id = state.ShuffleBag.Dequeue();
            if (byId.TryGetValue(id, out var item))
                return item;
        }

        return SelectPureRandom(eligibleItems, rng);
    }

    private static RandomizationItem SelectSpread(IReadOnlyList<RandomizationItem> eligibleItems, Random rng, RandomizationRuntimeStateCore state)
    {
        var weights = new double[eligibleItems.Count];
        for (var i = 0; i < weights.Length; i++)
            weights[i] = SpreadWeight(eligibleItems[i].FullPath, state);
        return SelectWeightedItem(eligibleItems, weights, rng) ?? SelectPureRandom(eligibleItems, rng);
    }

    private static RandomizationItem SelectWeighted(
        IReadOnlyList<RandomizationItem> eligibleItems,
        Random rng,
        bool withSpread,
        RandomizationRuntimeStateCore state)
    {
        var now = DateTime.UtcNow;
        var weights = new double[eligibleItems.Count];

        for (var i = 0; i < weights.Length; i++)
        {
            var item = eligibleItems[i];
            var playScore = 1.0 / (1.0 + Math.Max(0, item.PlayCount));
            var recencyScore = ComputeRecencyScore(item.LastPlayedUtc, now);
            var baseWeight = (playScore * 0.6) + (recencyScore * 0.8);
            var spreadWeight = withSpread ? SpreadWeight(item.FullPath, state) : 1.0;
            weights[i] = Math.Max(0.05, baseWeight * spreadWeight);
        }

        return SelectWeightedItem(eligibleItems, weights, rng) ?? SelectPureRandom(eligibleItems, rng);
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

    /// <summary>One roll over the weights, which line up with the items by index.</summary>
    private static RandomizationItem? SelectWeightedItem(IReadOnlyList<RandomizationItem> items, double[] weights, Random rng)
    {
        if (weights.Length == 0)
            return null;

        var total = 0.0;
        foreach (var weight in weights)
            total += weight;
        if (total <= 0)
            return null;

        var roll = rng.NextDouble() * total;
        var cumulative = 0.0;
        for (var i = 0; i < weights.Length; i++)
        {
            cumulative += weights[i];
            if (roll <= cumulative)
                return items[i];
        }

        return items[items.Count - 1];
    }

    private static void FillShuffleBag(RandomizationRuntimeStateCore state, IReadOnlyList<RandomizationItem> eligibleItems, Random rng)
    {
        var ids = new string[eligibleItems.Count];
        for (var i = 0; i < ids.Length; i++)
            ids[i] = eligibleItems[i].Id;

        for (var i = ids.Length - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (ids[i], ids[j]) = (ids[j], ids[i]);
        }

        foreach (var id in ids)
            state.ShuffleBag.Enqueue(id);
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
}
