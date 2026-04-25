using System;
using System.Collections.Generic;
using System.Linq;

namespace ReelRoulette;

/// <summary>
/// Applies <see cref="FilterState"/> to the in-memory server library projection for desktop UI only.
/// Playback eligibility and random picks are API-authoritative; this mirrors filter rules so the library panel
/// matches user expectations without referencing server-side <c>FilterSetBuilder</c> types.
/// </summary>
public static class LibraryProjectionDisplayFilter
{
    public static bool PassesFilterState(LibraryItem item, LibraryIndex libraryIndex, FilterState filterState)
    {
        ArgumentNullException.ThrowIfNull(item);
        ArgumentNullException.ThrowIfNull(libraryIndex);
        ArgumentNullException.ThrowIfNull(filterState);

        var enabledSourceIds = libraryIndex.Sources
            .Where(s => s.IsEnabled)
            .Select(s => s.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!enabledSourceIds.Contains(item.SourceId))
        {
            return false;
        }

        if (filterState.IncludedSourceIds is { Count: > 0 })
        {
            var included = filterState.IncludedSourceIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (!included.Contains(item.SourceId))
            {
                return false;
            }
        }

        if (filterState.ExcludeBlacklisted && item.IsBlacklisted)
        {
            return false;
        }

        if (filterState.FavoritesOnly && !item.IsFavorite)
        {
            return false;
        }

        if (filterState.OnlyNeverPlayed && item.PlayCount != 0)
        {
            return false;
        }

        if (filterState.AudioFilter == AudioFilterMode.WithAudioOnly)
        {
            if (item.MediaType != MediaType.Photo && item.HasAudio != true)
            {
                return false;
            }
        }
        else if (filterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
        {
            if (item.MediaType != MediaType.Photo && item.HasAudio != false)
            {
                return false;
            }
        }

        if (filterState.MinDuration.HasValue)
        {
            if (item.MediaType != MediaType.Photo &&
                (!item.Duration.HasValue || item.Duration.Value < filterState.MinDuration.Value))
            {
                return false;
            }
        }

        if (filterState.MaxDuration.HasValue)
        {
            if (item.MediaType != MediaType.Photo &&
                (!item.Duration.HasValue || item.Duration.Value > filterState.MaxDuration.Value))
            {
                return false;
            }
        }

        if (filterState.OnlyKnownDuration && item.MediaType != MediaType.Photo && !item.Duration.HasValue)
        {
            return false;
        }

        if (filterState.OnlyKnownLoudness && item.MediaType != MediaType.Photo && !item.IntegratedLoudness.HasValue)
        {
            return false;
        }

        if (filterState.SelectedTags is { Count: > 0 } && !PassesSelectedTags(item, libraryIndex, filterState))
        {
            return false;
        }

        if (filterState.ExcludedTags is { Count: > 0 })
        {
            if (item.Tags != null &&
                filterState.ExcludedTags.Any(ex =>
                    item.Tags.Any(t => string.Equals(t, ex, StringComparison.OrdinalIgnoreCase))))
            {
                return false;
            }
        }

        if (filterState.MediaTypeFilter == MediaTypeFilter.VideosOnly && item.MediaType != MediaType.Video)
        {
            return false;
        }

        if (filterState.MediaTypeFilter == MediaTypeFilter.PhotosOnly && item.MediaType != MediaType.Photo)
        {
            return false;
        }

        return true;
    }

    private static bool PassesSelectedTags(LibraryItem item, LibraryIndex libraryIndex, FilterState filterState)
    {
        var selected = filterState.SelectedTags;
        if (selected == null || selected.Count == 0)
        {
            return true;
        }

        var hasCategories = libraryIndex.Categories is { Count: > 0 };
        if (!hasCategories)
        {
            return PassesLegacyTagFilter(item, filterState);
        }

        var tags = libraryIndex.Tags ?? new List<Tag>();
        var tagsByCategory = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var selectedTag in selected)
        {
            var tag = tags.FirstOrDefault(t => string.Equals(t.Name, selectedTag, StringComparison.OrdinalIgnoreCase));
            if (tag != null)
            {
                if (!tagsByCategory.ContainsKey(tag.CategoryId))
                {
                    tagsByCategory[tag.CategoryId] = new List<string>();
                }

                tagsByCategory[tag.CategoryId].Add(selectedTag);
            }
            else
            {
                const string uncategorizedId = "";
                if (!tagsByCategory.ContainsKey(uncategorizedId))
                {
                    tagsByCategory[uncategorizedId] = new List<string>();
                }

                tagsByCategory[uncategorizedId].Add(selectedTag);
            }
        }

        if (tagsByCategory.Count == 0)
        {
            return true;
        }

        var categoryOutcomes = new List<bool>();
        foreach (var kvp in tagsByCategory)
        {
            var categoryId = kvp.Key;
            var categoryTags = kvp.Value;
            var localMode = filterState.CategoryLocalMatchModes?.TryGetValue(categoryId, out var m) == true
                ? m
                : TagMatchMode.And;

            bool catMatch;
            if (localMode == TagMatchMode.And)
            {
                catMatch = item.Tags != null &&
                           categoryTags.All(tag => item.Tags.Any(it =>
                               string.Equals(it, tag, StringComparison.OrdinalIgnoreCase)));
            }
            else
            {
                catMatch = item.Tags != null &&
                           categoryTags.Any(tag => item.Tags.Any(it =>
                               string.Equals(it, tag, StringComparison.OrdinalIgnoreCase)));
            }

            categoryOutcomes.Add(catMatch);
        }

        if (categoryOutcomes.Count == 0)
        {
            return false;
        }

        var useAndBetweenCategories = filterState.GlobalMatchMode ?? true;
        return useAndBetweenCategories
            ? categoryOutcomes.All(x => x)
            : categoryOutcomes.Any(x => x);
    }

    private static bool PassesLegacyTagFilter(LibraryItem item, FilterState filterState)
    {
        if (item.Tags == null)
        {
            return false;
        }

        if (filterState.TagMatchMode == TagMatchMode.And)
        {
            return filterState.SelectedTags.All(tag =>
                item.Tags!.Any(it => string.Equals(it, tag, StringComparison.OrdinalIgnoreCase)));
        }

        return filterState.SelectedTags.Any(tag =>
            item.Tags!.Any(it => string.Equals(it, tag, StringComparison.OrdinalIgnoreCase)));
    }
}
