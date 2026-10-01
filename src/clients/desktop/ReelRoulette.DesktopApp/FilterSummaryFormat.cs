namespace ReelRoulette;

/// <summary>
/// Parts of the main-window filter summary.
/// </summary>
public static class FilterSummaryFormat
{
    /// <summary>
    /// The included-tags part, or null when no tag is included.
    /// "all" or "any" follows the global match mode, which treats an unset mode as AND.
    /// </summary>
    public static string? IncludedTags(FilterState filter)
    {
        if (filter.SelectedTags == null || filter.SelectedTags.Count == 0)
        {
            return null;
        }

        var matchMode = (filter.GlobalMatchMode ?? true) ? "all" : "any";
        return $"{filter.SelectedTags.Count} tag(s) included ({matchMode})";
    }
}
