using System.Collections.Generic;
using ReelRoulette.Core.Filtering;

namespace ReelRoulette;

/// <summary>
/// Parts of the main-window filter summary.
/// </summary>
public static class FilterSummaryFormat
{
    /// <summary>
    /// The flag filter parts, in order: "Favorites only" or "Favorites excluded", then "Blacklisted only".
    /// Blacklisted excluded, the default, isn't named, and neither is a filter that is off.
    /// </summary>
    public static IReadOnlyList<string> FlagFilters(FilterState filter)
    {
        var parts = new List<string>();
        if (filter.FavoritesMode == FlagFilterModeValue.Only)
        {
            parts.Add("Favorites only");
        }
        else if (filter.FavoritesMode == FlagFilterModeValue.Excluded)
        {
            parts.Add("Favorites excluded");
        }

        if (filter.BlacklistedMode == FlagFilterModeValue.Only)
        {
            parts.Add("Blacklisted only");
        }

        return parts;
    }

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
