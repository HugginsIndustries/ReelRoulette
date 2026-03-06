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

public sealed class FilterSource
{
    public string Id { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
}

public sealed class FilterTag
{
    public string Name { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
}

public sealed class FilterItem
{
    public string Key { get; set; } = string.Empty;
    public string SourceId { get; set; } = string.Empty;
    public string FullPath { get; set; } = string.Empty;
    public bool IsBlacklisted { get; set; }
    public bool IsFavorite { get; set; }
    public int PlayCount { get; set; }
    public bool? HasAudio { get; set; }
    public TimeSpan? Duration { get; set; }
    public double? IntegratedLoudness { get; set; }
    public MediaTypeValue MediaType { get; set; } = MediaTypeValue.Video;
    public List<string> Tags { get; set; } = new();
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

public sealed class FilterSetRequest
{
    public List<FilterSource> Sources { get; set; } = new();
    public List<FilterItem> Items { get; set; } = new();
    public List<string>? CategoryIds { get; set; }
    public List<FilterTag>? Tags { get; set; }
}
