namespace ReelRoulette.Core.Randomization;

/// <summary>An eligible file as a random pick sees it.</summary>
public sealed class RandomizationItem
{
    public string Id { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public int PlayCount { get; set; }
    public DateTime? LastPlayedUtc { get; set; }
    public DateTime? DateAddedUtc { get; set; }

    /// <summary>The file's modified time.</summary>
    public DateTime? DateCreatedUtc { get; set; }

    /// <summary>The rating in half stars, 1 to 10, or null when unrated.</summary>
    public int? RatingHalfStars { get; set; }

    public IReadOnlyList<RandomizationTag> Tags { get; set; } = [];
}

/// <summary>A file's tag: its folded name, compared ordinally, and its category's id, compared ignoring case.</summary>
public readonly record struct RandomizationTag(string Key, string CategoryId);

public enum TagSpreadValue
{
    Off = 0,
    AllTags = 1,
    ByCategory = 2
}

/// <summary>The options a random pick combines. With every option off, picks are pure random.</summary>
public sealed class RandomPickOptions
{
    public static RandomPickOptions Default { get; } = new();

    public bool Shuffle { get; init; } = true;

    /// <summary>How long Shuffle remembers a pick, in days, or null for until everything has played.</summary>
    public int? RememberPlaysForDays { get; init; } = 30;

    public bool SpreadByFolder { get; init; } = true;
    public TagSpreadValue SpreadByTags { get; init; } = TagSpreadValue.Off;

    /// <summary>The categories whose tags count under By category.</summary>
    public IReadOnlyList<string> SpreadCategoryIds { get; init; } = [];

    public bool FavorLessPlayed { get; init; }
    public bool FavorNewlyAdded { get; init; }
    public bool FavorNewlyCreated { get; init; }
    public bool FavorHigherRated { get; init; }
}

/// <summary>The eligible files picked within the window, and how many are left, which add up to the eligible files.</summary>
public readonly record struct RandomPickCycle(int Picked, int Eligible)
{
    public int Remaining => Eligible - Picked;
}

/// <summary>The picked file, and the cycle numbers after the pick.</summary>
public sealed record RandomPickResult(RandomizationItem Item, RandomPickCycle Cycle);
