namespace ReelRoulette.Core.Randomization;

/// <summary>
/// One device's random picks: each picked file's id and when it was last picked, the last pick, and the last
/// picks Spread looks at. It also keeps the eligible set's folders and tags, so they are worked out once per set.
/// </summary>
public sealed class RandomPickMemory
{
    /// <summary>Each picked file's id and when it was last picked.</summary>
    internal Dictionary<string, DateTime> Picks { get; } = new(StringComparer.Ordinal);

    internal string? LastPickId { get; set; }

    /// <summary>The last picks, oldest first, with each one's folder when it was picked.</summary>
    internal List<RecentPick> RecentPicks { get; } = [];

    internal EligibleSetData? EligibleSet { get; set; }

    internal void AddRecentPick(string id, string folderKey)
    {
        RecentPicks.Add(new RecentPick(id, folderKey));
        if (RecentPicks.Count > RandomSelectionEngineCore.RecentPickLimit)
        {
            RecentPicks.RemoveAt(0);
        }
    }
}

internal readonly record struct RecentPick(string Id, string FolderKey);

/// <summary>Each eligible file's folder, by index in the set, and the tag spread data when tag spread is on.</summary>
internal sealed class EligibleSetData
{
    public required int Signature { get; init; }
    public required int Count { get; init; }
    public required int[] FolderIndex { get; init; }
    public required string[] FolderKeys { get; init; }
    public required Dictionary<string, int> FolderIndexByKey { get; init; }
    public TagSpreadData? Tags { get; set; }
}

/// <summary>
/// Each eligible file's counted tags, as indexes into the set's tags, where index 0 is "no tags", and each tag's
/// file count and rarity.
/// </summary>
internal sealed class TagSpreadData
{
    public const int NoTags = 0;

    public required TagSpreadValue Mode { get; init; }
    public required HashSet<string> CategoryIds { get; init; }
    public required int[][] FileTags { get; init; }
    public required int[] FileCounts { get; init; }
    public required double[] Rarity { get; init; }

    public bool Matches(RandomPickOptions options)
    {
        return Mode == options.SpreadByTags
            && (Mode != TagSpreadValue.ByCategory || CategoryIds.SetEquals(options.SpreadCategoryIds));
    }
}
