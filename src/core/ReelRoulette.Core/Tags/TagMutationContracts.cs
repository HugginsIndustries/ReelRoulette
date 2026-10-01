namespace ReelRoulette.Core.Tags;

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
