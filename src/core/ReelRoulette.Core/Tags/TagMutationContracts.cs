namespace ReelRoulette.Core.Tags;

public sealed class CoreLibraryIndex
{
    public List<CoreLibraryItem> Items { get; set; } = new();
    public List<CoreTagCategory>? Categories { get; set; }
    public List<CoreTag>? Tags { get; set; }
}

public sealed class CoreLibraryItem
{
    public List<string> Tags { get; set; } = new();
}

public sealed class CoreTagCategory
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

public sealed class CoreTag
{
    public string Name { get; set; } = string.Empty;
    public string CategoryId { get; set; } = string.Empty;
}

public sealed class CoreFilterState
{
    public List<string> SelectedTags { get; set; } = new();
    public List<string> ExcludedTags { get; set; } = new();
}

public sealed class CoreFilterPreset
{
    public string Name { get; set; } = string.Empty;
    public CoreFilterState FilterState { get; set; } = new();
}
