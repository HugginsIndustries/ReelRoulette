namespace ReelRoulette.Core.Filtering;

public enum AudioFilterModeValue
{
    PlayAll = 0,
    WithAudioOnly = 1,
    WithoutAudioOnly = 2
}

public enum MediaTypeValue
{
    Video = 0,
    Photo = 1
}

public enum MediaTypeFilterValue
{
    All = 0,
    VideosOnly = 1,
    PhotosOnly = 2
}

public enum TagMatchModeValue
{
    And = 0,
    Or = 1
}

public sealed class FilterStateModel
{
    public bool FavoritesOnly { get; set; }
    public bool ExcludeBlacklisted { get; set; } = true;
    public bool OnlyNeverPlayed { get; set; }
    public AudioFilterModeValue AudioFilter { get; set; } = AudioFilterModeValue.PlayAll;
    public TimeSpan? MinDuration { get; set; }
    public TimeSpan? MaxDuration { get; set; }
    public List<string> SelectedTags { get; set; } = new();
    public List<string> ExcludedTags { get; set; } = new();
    public TagMatchModeValue TagMatchMode { get; set; } = TagMatchModeValue.And;
    public Dictionary<string, TagMatchModeValue>? CategoryLocalMatchModes { get; set; }
    public bool? GlobalMatchMode { get; set; }
    public bool OnlyKnownDuration { get; set; }
    public bool OnlyKnownLoudness { get; set; }
    public MediaTypeFilterValue MediaTypeFilter { get; set; } = MediaTypeFilterValue.All;
    public List<string> IncludedSourceIds { get; set; } = new();
}
