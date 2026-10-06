namespace ReelRoulette.Core.Randomization;

public enum RandomizationModeValue
{
    PureRandom = 0,
    WeightedRandom = 1,
    SmartShuffle = 2,
    SpreadMode = 3,
    WeightedWithSpread = 4
}

public sealed class RandomizationItem
{
    public string Id { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public int PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
}

public sealed class RandomizationRuntimeStateCore
{
    public RandomizationModeValue Mode { get; set; } = RandomizationModeValue.SmartShuffle;
    public string EligibleSignature { get; set; } = "empty";

    /// <summary>Item ids still to play in this smart shuffle cycle.</summary>
    public Queue<string> ShuffleBag { get; } = new();
    public Queue<string> RecentFolders { get; } = new();
    public Dictionary<string, int> RecentFolderCounts { get; } = new(StringComparer.OrdinalIgnoreCase);
}
