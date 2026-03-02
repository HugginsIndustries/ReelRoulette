namespace ReelRoulette.Core.Filtering;

public sealed class FilterSetBuilder
{
    public IReadOnlyList<FilterItem> BuildEligibleSet(FilterStateModel filterState, FilterSetRequest request, Func<string, bool>? fileExists = null)
    {
        fileExists ??= File.Exists;
        return BuildEligibleSetInternal(filterState, request, fileExists);
    }

    public IReadOnlyList<FilterItem> BuildEligibleSetWithoutFileCheck(FilterStateModel filterState, FilterSetRequest request)
    {
        return BuildEligibleSetInternal(filterState, request, _ => true);
    }

    private static IReadOnlyList<FilterItem> BuildEligibleSetInternal(FilterStateModel filterState, FilterSetRequest request, Func<string, bool> fileExists)
    {
        ArgumentNullException.ThrowIfNull(filterState);
        ArgumentNullException.ThrowIfNull(request);

        var eligible = request.Items.AsEnumerable();

        var enabledSourceIds = request.Sources
            .Where(s => s.IsEnabled)
            .Select(s => s.Id)
            .ToHashSet();
        eligible = eligible.Where(item => enabledSourceIds.Contains(item.SourceId));

        eligible = eligible.Where(item => fileExists(item.FullPath));

        if (filterState.ExcludeBlacklisted)
            eligible = eligible.Where(item => !item.IsBlacklisted);

        if (filterState.FavoritesOnly)
            eligible = eligible.Where(item => item.IsFavorite);

        if (filterState.OnlyNeverPlayed)
            eligible = eligible.Where(item => item.PlayCount == 0);

        if (filterState.AudioFilter == AudioFilterModeValue.WithAudioOnly)
        {
            eligible = eligible.Where(item =>
                item.MediaType == MediaTypeValue.Photo || item.HasAudio == true);
        }
        else if (filterState.AudioFilter == AudioFilterModeValue.WithoutAudioOnly)
        {
            eligible = eligible.Where(item =>
                item.MediaType == MediaTypeValue.Photo || item.HasAudio == false);
        }

        if (filterState.MinDuration.HasValue)
        {
            eligible = eligible.Where(item =>
                item.MediaType == MediaTypeValue.Photo ||
                (item.Duration.HasValue && item.Duration.Value >= filterState.MinDuration.Value));
        }

        if (filterState.MaxDuration.HasValue)
        {
            eligible = eligible.Where(item =>
                item.MediaType == MediaTypeValue.Photo ||
                (item.Duration.HasValue && item.Duration.Value <= filterState.MaxDuration.Value));
        }

        if (filterState.OnlyKnownDuration)
        {
            eligible = eligible.Where(item =>
                item.MediaType == MediaTypeValue.Photo || item.Duration.HasValue);
        }

        if (filterState.OnlyKnownLoudness)
        {
            eligible = eligible.Where(item =>
                item.MediaType == MediaTypeValue.Photo || item.IntegratedLoudness.HasValue);
        }

        if (filterState.SelectedTags.Count > 0)
        {
            eligible = ApplyTagFilterWithCategoryMatchModes(eligible, filterState, request);
        }

        if (filterState.ExcludedTags.Count > 0)
        {
            eligible = eligible.Where(item =>
                item.Tags == null ||
                !filterState.ExcludedTags.Any(tag => item.Tags.Any(itemTag => string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
        }

        if (filterState.MediaTypeFilter == MediaTypeFilterValue.VideosOnly)
            eligible = eligible.Where(item => item.MediaType == MediaTypeValue.Video);
        else if (filterState.MediaTypeFilter == MediaTypeFilterValue.PhotosOnly)
            eligible = eligible.Where(item => item.MediaType == MediaTypeValue.Photo);

        return eligible.ToList();
    }

    private static IEnumerable<FilterItem> ApplyTagFilterWithCategoryMatchModes(
        IEnumerable<FilterItem> items,
        FilterStateModel filterState,
        FilterSetRequest request)
    {
        var hasCategories = request.CategoryIds != null && request.CategoryIds.Count > 0;
        if (!hasCategories)
            return ApplyLegacyTagFilter(items, filterState);

        var tags = request.Tags ?? new List<FilterTag>();
        var tagsByCategory = new Dictionary<string, List<string>>();
        foreach (var selectedTag in filterState.SelectedTags)
        {
            var tag = tags.FirstOrDefault(t => string.Equals(t.Name, selectedTag, StringComparison.OrdinalIgnoreCase));
            if (tag != null)
            {
                if (!tagsByCategory.ContainsKey(tag.CategoryId))
                    tagsByCategory[tag.CategoryId] = new List<string>();
                tagsByCategory[tag.CategoryId].Add(selectedTag);
            }
            else
            {
                const string uncategorizedId = "";
                if (!tagsByCategory.ContainsKey(uncategorizedId))
                    tagsByCategory[uncategorizedId] = new List<string>();
                tagsByCategory[uncategorizedId].Add(selectedTag);
            }
        }

        if (tagsByCategory.Count == 0)
            return items;

        var categoryResults = new List<HashSet<FilterItem>>();
        foreach (var kvp in tagsByCategory)
        {
            var categoryId = kvp.Key;
            var categoryTags = kvp.Value;

            var localMatchMode = (filterState.CategoryLocalMatchModes?.TryGetValue(categoryId, out var mode) == true)
                ? mode
                : TagMatchModeValue.And;

            IEnumerable<FilterItem> categoryItems;
            if (localMatchMode == TagMatchModeValue.And)
            {
                categoryItems = items.Where(item =>
                    item.Tags != null &&
                    categoryTags.All(tag => item.Tags.Any(itemTag =>
                        string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
            }
            else
            {
                categoryItems = items.Where(item =>
                    item.Tags != null &&
                    categoryTags.Any(tag => item.Tags.Any(itemTag =>
                        string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
            }

            categoryResults.Add(new HashSet<FilterItem>(categoryItems));
        }

        if (categoryResults.Count == 0)
            return Enumerable.Empty<FilterItem>();
        if (categoryResults.Count == 1)
            return categoryResults[0];

        var result = new HashSet<FilterItem>(categoryResults[0]);
        var useAndBetweenCategories = filterState.GlobalMatchMode ?? true;
        for (var i = 1; i < categoryResults.Count; i++)
        {
            if (useAndBetweenCategories)
                result.IntersectWith(categoryResults[i]);
            else
                result.UnionWith(categoryResults[i]);
        }

        return result;
    }

    private static IEnumerable<FilterItem> ApplyLegacyTagFilter(IEnumerable<FilterItem> items, FilterStateModel filterState)
    {
        if (filterState.TagMatchMode == TagMatchModeValue.And)
        {
            return items.Where(item =>
                item.Tags != null &&
                filterState.SelectedTags.All(tag => item.Tags.Any(itemTag =>
                    string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
        }

        return items.Where(item =>
            item.Tags != null &&
            filterState.SelectedTags.Any(tag => item.Tags.Any(itemTag =>
                string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
    }
}
