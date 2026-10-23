using System.Text.Json;

namespace ReelRoulette.Core.Filtering;

/// <summary>
/// Whether two filters are the same filter, as presets compare them: no preset may hold the default filter or
/// another preset's. The WebUI's copy is <c>filterStatesEqualForPresetMatch</c> in filterStateModel.ts. Locked to
/// shared/fixtures/preset-filter-equality.json.
/// </summary>
public static class FilterStateComparison
{
    /// <summary>
    /// Tags compare as sets ignoring case, and source ids as sets with case counting, so a list naming every source
    /// differs from all sources. An unset global match mode is AND, a category's AND match mode counts as no entry,
    /// durations compare in whole seconds, and a date range compares by its choice, so Last 30 days differs from a
    /// custom range of the same days.
    /// </summary>
    public static bool SameFilter(FilterStateModel left, FilterStateModel right)
    {
        ArgumentNullException.ThrowIfNull(left);
        ArgumentNullException.ThrowIfNull(right);
        return string.Equals(Describe(left), Describe(right), StringComparison.Ordinal);
    }

    /// <summary>Whether a filter equals the default filter, which no preset may hold.</summary>
    public static bool IsDefault(FilterStateModel filter)
    {
        return SameFilter(filter, new FilterStateModel());
    }

    /// <summary>The filter's normalized fields as JSON, as the WebUI's comparison writes them, so no name runs into the next.</summary>
    private static string Describe(FilterStateModel filter)
    {
        return JsonSerializer.Serialize(new
        {
            filter.FavoritesMode,
            filter.BlacklistedMode,
            filter.OnlyNeverPlayed,
            filter.OnlyKnownDuration,
            filter.OnlyKnownLoudness,
            filter.OnlyBrowserPlayable,
            filter.OnlyUnrated,
            filter.MinRatingHalfStars,
            filter.AudioFilter,
            filter.MediaTypeFilter,
            GlobalMatchMode = filter.GlobalMatchMode ?? true,
            SelectedTags = Tags(filter.SelectedTags),
            ExcludedTags = Tags(filter.ExcludedTags),
            IncludedSourceIds = filter.IncludedSourceIds.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal),
            CategoryLocalMatchModes = (filter.CategoryLocalMatchModes ?? [])
                .Where(pair => pair.Value != TagMatchModeValue.And)
                .OrderBy(pair => pair.Key, StringComparer.Ordinal),
            MinDuration = WholeSeconds(filter.MinDuration),
            MaxDuration = WholeSeconds(filter.MaxDuration),
            AddedRange = filter.AddedRange?.ComparisonKey,
            CreatedRange = filter.CreatedRange?.ComparisonKey
        });
    }

    private static IEnumerable<string> Tags(IEnumerable<string> tags)
    {
        return tags.Select(tag => tag.ToUpperInvariant()).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal);
    }

    private static double? WholeSeconds(TimeSpan? duration)
    {
        return duration is { } value ? Math.Floor(value.TotalSeconds) : null;
    }
}
