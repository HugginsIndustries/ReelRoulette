using System.IO;

namespace ReelRoulette.Core.Randomization;

/// <summary>
/// Picks a random file for a device. The filter decides the eligible files, Shuffle leaves out the files picked within
/// its window, Spread by folder leaves out the files of recently used folders, the Favor options and tag spread weigh
/// the rest, and one weighted roll picks.
/// </summary>
public static class RandomSelectionEngineCore
{
    /// <summary>How many recent picks Spread looks at.</summary>
    internal const int RecentPickLimit = 16;

    private const double NewFilesShare = 0.2;
    private const double TagPenaltyScale = 10;
    private static readonly TimeSpan NewFileAge = TimeSpan.FromDays(14);

    /// <summary>
    /// Picks one of the eligible files, which callers pass in ordinal id order, and records the pick in the memory.
    /// Returns null, leaving the memory unchanged, when there are no eligible files.
    /// </summary>
    public static RandomPickResult? SelectItem(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> eligibleItems,
        RandomPickOptions options,
        DateTime nowUtc,
        Random random)
    {
        ArgumentNullException.ThrowIfNull(memory);
        ArgumentNullException.ThrowIfNull(eligibleItems);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(random);
        if (eligibleItems.Count == 0)
        {
            return null;
        }

        DropPicksPastWindow(memory, options, nowUtc);
        var set = GetEligibleSetData(memory, eligibleItems, options);
        var odds = ComputeOdds(memory, eligibleItems, set, options, nowUtc);
        var index = Roll(odds.Odds, random);
        var item = eligibleItems[index];

        var picked = odds.Picked;
        if (odds.StartsNewCycle)
        {
            foreach (var eligible in eligibleItems)
            {
                memory.Picks.Remove(eligible.Id);
            }

            picked = 0;
        }

        if (!memory.Picks.ContainsKey(item.Id))
        {
            picked++;
        }

        memory.Picks[item.Id] = nowUtc;
        memory.LastPickId = item.Id;
        memory.LastPickUtc = nowUtc;
        memory.LastPickWindowDays = options.RememberPlaysForDays;
        memory.AddRecentPick(item.Id, set.FolderKeys[set.FolderIndex[index]]);
        return new RandomPickResult(item, new RandomPickCycle(picked, eligibleItems.Count));
    }

    /// <summary>The cycle numbers for the eligible files, counting only picks within the window. Changes nothing.</summary>
    public static RandomPickCycle GetCycle(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> eligibleItems,
        RandomPickOptions options,
        DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(memory);
        ArgumentNullException.ThrowIfNull(eligibleItems);
        ArgumentNullException.ThrowIfNull(options);

        var cutoff = WindowStart(options.RememberPlaysForDays, nowUtc);
        var picked = 0;
        foreach (var item in eligibleItems)
        {
            if (IsPickedWithinWindow(memory, item.Id, cutoff))
            {
                picked++;
            }
        }

        return new RandomPickCycle(picked, eligibleItems.Count);
    }

    /// <summary>
    /// Clears Shuffle's memory and the last pick. The recent picks Spread looks at stay, and so do the last pick's time
    /// and window, which say when the memory is past its window.
    /// </summary>
    public static void Reset(RandomPickMemory memory)
    {
        ArgumentNullException.ThrowIfNull(memory);
        memory.Picks.Clear();
        memory.LastPickId = null;
    }

    /// <summary>Each eligible file's odds for the next pick, without rolling or changing the picks memory.</summary>
    internal static RandomPickOdds ComputeOdds(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> eligibleItems,
        RandomPickOptions options,
        DateTime nowUtc)
    {
        return ComputeOdds(memory, eligibleItems, GetEligibleSetData(memory, eligibleItems, options), options, nowUtc);
    }

    /// <summary>
    /// Identifies the eligible set's contents by its ids, paths, and tags with their categories, in the order given,
    /// so a moved file or a tag edit gives a new signature. Play counts, dates, and ratings are not part of it.
    /// </summary>
    internal static int ComputeEligibleSignature(IReadOnlyList<RandomizationItem> eligibleItems)
    {
        var hash = new HashCode();
        hash.Add(eligibleItems.Count);
        foreach (var item in eligibleItems)
        {
            hash.Add(item.Id, StringComparer.Ordinal);
            hash.Add(item.FullPath, StringComparer.Ordinal);
            hash.Add(item.Tags.Count);
            foreach (var tag in item.Tags)
            {
                hash.Add(tag.Key, StringComparer.Ordinal);
                hash.Add(tag.CategoryId, StringComparer.OrdinalIgnoreCase);
            }
        }

        return hash.ToHashCode();
    }

    private static RandomPickOdds ComputeOdds(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> items,
        EligibleSetData set,
        RandomPickOptions options,
        DateTime nowUtc)
    {
        var count = items.Count;
        var cutoff = WindowStart(options.RememberPlaysForDays, nowUtc);
        var inMemory = new bool[count];
        var picked = 0;
        for (var i = 0; i < count; i++)
        {
            if (IsPickedWithinWindow(memory, items[i].Id, cutoff))
            {
                inMemory[i] = true;
                picked++;
            }
        }

        // Once every eligible file has been picked, a new cycle starts, and under Shuffle it leaves out the last pick,
        // unless that is the only file. Otherwise Shuffle leaves out the files already picked.
        var startsNewCycle = picked == count;
        var candidates = new bool[count];
        for (var i = 0; i < count; i++)
        {
            candidates[i] = startsNewCycle
                ? !(options.Shuffle && count > 1 && string.Equals(items[i].Id, memory.LastPickId, StringComparison.Ordinal))
                : !(options.Shuffle && inMemory[i]);
        }

        if (options.SpreadByFolder)
        {
            LeaveOutRecentFolders(memory, set, candidates);
        }

        var tagWeights = options.SpreadByTags == TagSpreadValue.Off ? null : TagPenaltyWeights(memory, items, set.Tags!);
        var weights = new double[count];
        var totalWeight = 0.0;
        for (var i = 0; i < count; i++)
        {
            if (!candidates[i])
            {
                continue;
            }

            var weight = 1.0;
            if (options.FavorLessPlayed)
            {
                weight *= LessPlayedWeight(items[i], nowUtc);
            }

            if (options.FavorHigherRated)
            {
                weight *= RatingWeight(items[i].RatingHalfStars);
            }

            if (tagWeights != null)
            {
                var penalty = 0.0;
                foreach (var tag in set.Tags!.FileTags[i])
                {
                    penalty += tagWeights[tag];
                }

                weight /= 1 + (TagPenaltyScale * penalty);
            }

            weights[i] = weight;
            totalWeight += weight;
        }

        return new RandomPickOdds(ApplyNewFilesShare(items, options, nowUtc, weights, totalWeight), startsNewCycle, picked);
    }

    /// <summary>
    /// Under Favor newly added or newly created, the new files take their share of the odds by weight times newness,
    /// and every file the rest by weight. With no new file left to pick, the odds are by weight alone.
    /// </summary>
    private static double[] ApplyNewFilesShare(
        IReadOnlyList<RandomizationItem> items,
        RandomPickOptions options,
        DateTime nowUtc,
        double[] weights,
        double totalWeight)
    {
        var odds = new double[weights.Length];
        double[]? newness = null;
        var newTotal = 0.0;
        if (options.FavorNewlyAdded || options.FavorNewlyCreated)
        {
            newness = new double[weights.Length];
            for (var i = 0; i < weights.Length; i++)
            {
                if (weights[i] <= 0 || NewFileDate(items[i], options) is not DateTime date)
                {
                    continue;
                }

                var age = nowUtc - date;
                if (age < TimeSpan.Zero || age > NewFileAge)
                {
                    continue;
                }

                newness[i] = 1 - (0.75 * (age / NewFileAge));
                newTotal += weights[i] * newness[i];
            }
        }

        var share = newTotal > 0 ? 1 - NewFilesShare : 1;
        for (var i = 0; i < weights.Length; i++)
        {
            odds[i] = share * weights[i] / totalWeight;
            if (newTotal > 0)
            {
                odds[i] += NewFilesShare * weights[i] * newness![i] / newTotal;
            }
        }

        return odds;
    }

    /// <summary>The date a file's newness counts from: date added, date created, or the later of the two with both on.</summary>
    private static DateTime? NewFileDate(RandomizationItem item, RandomPickOptions options)
    {
        if (!options.FavorNewlyCreated)
        {
            return item.DateAddedUtc;
        }

        if (!options.FavorNewlyAdded)
        {
            return item.DateCreatedUtc;
        }

        if (item.DateAddedUtc is DateTime added && item.DateCreatedUtc is DateTime created)
        {
            return added > created ? added : created;
        }

        return item.DateAddedUtc ?? item.DateCreatedUtc;
    }

    /// <summary>
    /// Leaves out the files whose folder is among the folders of the last picks: 16 of them, or half the eligible set's
    /// folder count when that is smaller. When that would leave nothing to pick, nothing is left out.
    /// </summary>
    private static void LeaveOutRecentFolders(RandomPickMemory memory, EligibleSetData set, bool[] candidates)
    {
        var lookBack = Math.Min(RecentPickLimit, set.FolderKeys.Length / 2);
        if (lookBack == 0)
        {
            return;
        }

        var skipped = new bool[set.FolderKeys.Length];
        var recent = memory.RecentPicks;
        for (var r = recent.Count - 1; r >= Math.Max(0, recent.Count - lookBack); r--)
        {
            if (set.FolderIndexByKey.TryGetValue(recent[r].FolderKey, out var folder))
            {
                skipped[folder] = true;
            }
        }

        var anyLeft = false;
        for (var i = 0; i < candidates.Length && !anyLeft; i++)
        {
            anyLeft = candidates[i] && !skipped[set.FolderIndex[i]];
        }

        if (!anyLeft)
        {
            return;
        }

        for (var i = 0; i < candidates.Length; i++)
        {
            if (skipped[set.FolderIndex[i]])
            {
                candidates[i] = false;
            }
        }
    }

    /// <summary>
    /// Each tag's share of a file's penalty: its rarity times its appearances among the recent eligible picks beyond
    /// what its share of the eligible set would bring. Null when no recent pick is eligible.
    /// </summary>
    private static double[]? TagPenaltyWeights(RandomPickMemory memory, IReadOnlyList<RandomizationItem> items, TagSpreadData tags)
    {
        var recentTimes = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var pick in memory.RecentPicks)
        {
            recentTimes[pick.Id] = recentTimes.GetValueOrDefault(pick.Id) + 1;
        }

        var appearances = new int[tags.FileCounts.Length];
        var recentCount = 0;
        for (var i = 0; i < items.Count; i++)
        {
            if (!recentTimes.TryGetValue(items[i].Id, out var times))
            {
                continue;
            }

            recentCount += times;
            foreach (var tag in tags.FileTags[i])
            {
                appearances[tag] += times;
            }
        }

        if (recentCount == 0)
        {
            return null;
        }

        var weights = new double[appearances.Length];
        for (var t = 0; t < weights.Length; t++)
        {
            var share = (double)recentCount * tags.FileCounts[t] / items.Count;
            weights[t] = tags.Rarity[t] * Math.Max(0, appearances[t] - share);
        }

        return weights;
    }

    private static double LessPlayedWeight(RandomizationItem item, DateTime nowUtc)
    {
        var playScore = 1.0 / (1.0 + Math.Max(0, item.PlayCount));
        return Math.Max(0.05, (playScore * 0.6) + (RecencyScore(item.LastPlayedUtc, nowUtc) * 0.8));
    }

    private static double RecencyScore(DateTime? lastPlayedUtc, DateTime nowUtc)
    {
        if (!lastPlayedUtc.HasValue)
        {
            return 1.0;
        }

        var age = nowUtc - lastPlayedUtc.Value;
        if (age.TotalSeconds <= 0)
        {
            return 0.05;
        }

        return Math.Max(0.05, Math.Min(1.0, age.TotalDays / 30.0));
    }

    /// <summary>The square of the stars over 2.5, with an unrated file as 2.5 stars.</summary>
    private static double RatingWeight(int? ratingHalfStars)
    {
        if (ratingHalfStars is not int halfStars)
        {
            return 1.0;
        }

        var ratio = halfStars / 5.0;
        return ratio * ratio;
    }

    /// <summary>One roll over the odds, falling back to the last file with odds for rounding.</summary>
    private static int Roll(double[] odds, Random random)
    {
        var total = 0.0;
        var last = 0;
        for (var i = 0; i < odds.Length; i++)
        {
            if (odds[i] > 0)
            {
                total += odds[i];
                last = i;
            }
        }

        var target = random.NextDouble() * total;
        var cumulative = 0.0;
        for (var i = 0; i < odds.Length; i++)
        {
            if (odds[i] <= 0)
            {
                continue;
            }

            cumulative += odds[i];
            if (target < cumulative)
            {
                return i;
            }
        }

        return last;
    }

    /// <summary>A pick at or before this time is past the window. Null when the window is until everything has played.</summary>
    internal static DateTime? WindowStart(int? windowDays, DateTime nowUtc)
    {
        return windowDays is int days ? nowUtc.AddDays(-days) : null;
    }

    private static bool IsPickedWithinWindow(RandomPickMemory memory, string id, DateTime? windowStart)
    {
        return memory.Picks.TryGetValue(id, out var pickedAt) && (windowStart is not DateTime start || pickedAt > start);
    }

    private static void DropPicksPastWindow(RandomPickMemory memory, RandomPickOptions options, DateTime nowUtc)
    {
        if (WindowStart(options.RememberPlaysForDays, nowUtc) is not DateTime start)
        {
            return;
        }

        List<string>? expired = null;
        foreach (var (id, pickedAt) in memory.Picks)
        {
            if (pickedAt <= start)
            {
                (expired ??= []).Add(id);
            }
        }

        if (expired == null)
        {
            return;
        }

        foreach (var id in expired)
        {
            memory.Picks.Remove(id);
        }
    }

    /// <summary>The device's cached folders and tags for the eligible set, built again when its contents change.</summary>
    private static EligibleSetData GetEligibleSetData(
        RandomPickMemory memory,
        IReadOnlyList<RandomizationItem> items,
        RandomPickOptions options)
    {
        var signature = ComputeEligibleSignature(items);
        var set = memory.EligibleSet;
        if (set == null || set.Signature != signature || set.Count != items.Count)
        {
            set = BuildFolders(items, signature);
            memory.EligibleSet = set;
        }

        if (options.SpreadByTags != TagSpreadValue.Off && (set.Tags == null || !set.Tags.Matches(options)))
        {
            set.Tags = BuildTags(items, options);
        }

        return set;
    }

    private static EligibleSetData BuildFolders(IReadOnlyList<RandomizationItem> items, int signature)
    {
        var folderIndex = new int[items.Count];
        var folderKeys = new List<string>();
        var byKey = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < items.Count; i++)
        {
            var key = GetFolderKey(items[i].FullPath);
            if (!byKey.TryGetValue(key, out var folder))
            {
                folder = folderKeys.Count;
                byKey[key] = folder;
                folderKeys.Add(key);
            }

            folderIndex[i] = folder;
        }

        return new EligibleSetData
        {
            Signature = signature,
            Count = items.Count,
            FolderIndex = folderIndex,
            FolderKeys = [.. folderKeys],
            FolderIndexByKey = byKey
        };
    }

    /// <summary>
    /// Each file's counted tags: every tag under All tags, or only the chosen categories' tags under By category.
    /// A file with none counts as having "no tags", a tag of its own.
    /// </summary>
    private static TagSpreadData BuildTags(IReadOnlyList<RandomizationItem> items, RandomPickOptions options)
    {
        var categoryIds = new HashSet<string>(options.SpreadCategoryIds, StringComparer.OrdinalIgnoreCase);
        var byCategory = options.SpreadByTags == TagSpreadValue.ByCategory;
        var tagIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        var fileCounts = new List<int> { 0 };
        int[] noTags = [TagSpreadData.NoTags];
        var fileTags = new int[items.Count][];
        var counted = new List<int>();
        for (var i = 0; i < items.Count; i++)
        {
            counted.Clear();
            foreach (var tag in items[i].Tags)
            {
                if (byCategory && !categoryIds.Contains(tag.CategoryId))
                {
                    continue;
                }

                if (!tagIndex.TryGetValue(tag.Key, out var index))
                {
                    index = fileCounts.Count;
                    tagIndex[tag.Key] = index;
                    fileCounts.Add(0);
                }

                if (!counted.Contains(index))
                {
                    counted.Add(index);
                }
            }

            fileTags[i] = counted.Count == 0 ? noTags : [.. counted];
            foreach (var index in fileTags[i])
            {
                fileCounts[index]++;
            }
        }

        // Rarity runs from 0 for a tag on every eligible file to 1 for a tag on one.
        var rarity = new double[fileCounts.Count];
        if (items.Count > 1)
        {
            var logCount = Math.Log(items.Count);
            for (var t = 0; t < rarity.Length; t++)
            {
                rarity[t] = fileCounts[t] == 0 ? 0 : Math.Log((double)items.Count / fileCounts[t]) / logCount;
            }
        }

        return new TagSpreadData
        {
            Mode = options.SpreadByTags,
            CategoryIds = categoryIds,
            FileTags = fileTags,
            FileCounts = [.. fileCounts],
            Rarity = rarity
        };
    }

    /// <summary>A file's folder: its immediate parent, ignoring case.</summary>
    private static string GetFolderKey(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        var directory = Path.GetDirectoryName(path);
        return string.IsNullOrWhiteSpace(directory)
            ? string.Empty
            : directory.Trim().ToLowerInvariant();
    }
}

/// <summary>Each eligible file's odds for the next pick, by index, whether it starts a new cycle, and the files picked before it.</summary>
internal sealed record RandomPickOdds(double[] Odds, bool StartsNewCycle, int Picked);
