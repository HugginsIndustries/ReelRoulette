using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace ReelRoulette
{
    /// <summary>
    /// Service for filtering library items based on FilterState.
    /// </summary>
    public class FilterService
    {
        private static void Log(string message)
        {
            try
            {
                var logPath = Path.Combine(AppDataManager.AppDataDirectory, "last.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }
        /// <summary>
        /// Builds the set of eligible items based on the filter state and library index.
        /// This is the core filtering logic used by both the Library panel and random playback.
        /// </summary>
        /// <param name="filterState">The filter configuration to apply.</param>
        /// <param name="libraryIndex">The library index containing all sources and items.</param>
        /// <returns>Enumerable of eligible LibraryItems.</returns>
        public IEnumerable<LibraryItem> BuildEligibleSet(FilterState filterState, LibraryIndex libraryIndex)
        {
            Log("FilterService.BuildEligibleSet: Starting...");
            
            if (filterState == null)
            {
                Log("FilterService.BuildEligibleSet: ERROR - filterState is null");
                throw new ArgumentNullException(nameof(filterState));
            }
            if (libraryIndex == null)
            {
                Log("FilterService.BuildEligibleSet: ERROR - libraryIndex is null");
                throw new ArgumentNullException(nameof(libraryIndex));
            }

            Log($"FilterService.BuildEligibleSet: Library has {libraryIndex.Items.Count} items, {libraryIndex.Sources.Count} sources");
            Log($"FilterService.BuildEligibleSet: FilterState - FavoritesOnly: {filterState.FavoritesOnly}, ExcludeBlacklisted: {filterState.ExcludeBlacklisted}, OnlyNeverPlayed: {filterState.OnlyNeverPlayed}, AudioFilter: {filterState.AudioFilter}");

            // Start with all items
            var eligible = libraryIndex.Items.AsEnumerable();

            // 1. Only items from enabled sources
            var enabledSourceIds = libraryIndex.Sources
                .Where(s => s.IsEnabled)
                .Select(s => s.Id)
                .ToHashSet();
            eligible = eligible.Where(item => enabledSourceIds.Contains(item.SourceId));

            // 2. File exists check (deferred - only check when materialized)
            // Note: This will be evaluated when the enumerable is materialized (e.g., ToArray())
            // For better performance with large libraries, consider caching file existence
            eligible = eligible.Where(item => File.Exists(item.FullPath));

            // 3. ExcludeBlacklisted check
            if (filterState.ExcludeBlacklisted)
            {
                eligible = eligible.Where(item => !item.IsBlacklisted);
            }

            // 4. FavoritesOnly check
            if (filterState.FavoritesOnly)
            {
                eligible = eligible.Where(item => item.IsFavorite);
            }

            // 5. OnlyNeverPlayed check
            if (filterState.OnlyNeverPlayed)
            {
                eligible = eligible.Where(item => item.PlayCount == 0);
            }

            // 6. Audio filter (only applies to videos, photos are always included)
            if (filterState.AudioFilter == AudioFilterMode.WithAudioOnly)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.HasAudio == true);
            }
            else if (filterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.HasAudio == false);
            }
            // AudioFilterMode.PlayAll means no filtering

            // 7. Duration filter (only applies to videos, photos are always included)
            if (filterState.MinDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.MediaType == MediaType.Photo ||
                    (item.Duration.HasValue && item.Duration.Value >= filterState.MinDuration.Value));
            }

            if (filterState.MaxDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.MediaType == MediaType.Photo ||
                    (item.Duration.HasValue && item.Duration.Value <= filterState.MaxDuration.Value));
            }

            // 8. OnlyKnownDuration check (only applies to videos, photos are always included)
            if (filterState.OnlyKnownDuration)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.Duration.HasValue);
            }

            // 9. OnlyKnownLoudness check (only applies to videos, photos are always included)
            if (filterState.OnlyKnownLoudness)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.IntegratedLoudness.HasValue);
            }

            // 10. Tag filter (inclusion) - with per-category match modes
            if (filterState.SelectedTags != null && filterState.SelectedTags.Count > 0)
            {
                eligible = ApplyTagFilterWithCategoryMatchModes(eligible, filterState, libraryIndex);
            }

            // 10b. Tag filter (exclusion) - exclude items with any excluded tag (case-insensitive comparison)
            if (filterState.ExcludedTags != null && filterState.ExcludedTags.Count > 0)
            {
                eligible = eligible.Where(item =>
                    item.Tags == null ||
                    !filterState.ExcludedTags.Any(tag => item.Tags.Any(itemTag => string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
            }

            // 11. Media type filter
            if (filterState.MediaTypeFilter == MediaTypeFilter.VideosOnly)
            {
                eligible = eligible.Where(item => item.MediaType == MediaType.Video);
            }
            else if (filterState.MediaTypeFilter == MediaTypeFilter.PhotosOnly)
            {
                eligible = eligible.Where(item => item.MediaType == MediaType.Photo);
            }
            // MediaTypeFilter.All means no filtering

            // Materialize to count results (for logging)
            var eligibleList = eligible.ToList();
            Log($"FilterService.BuildEligibleSet: Completed - {eligibleList.Count} eligible items after filtering");
            
            return eligibleList;
        }

        /// <summary>
        /// Builds the set of eligible items without performing File.Exists checks.
        /// This method is a copy of BuildEligibleSet but skips the File.Exists check
        /// for performance when only a count is needed for UI display or queue building.
        /// File existence will be validated when the video is actually played.
        /// </summary>
        /// <param name="filterState">The filter configuration to apply.</param>
        /// <param name="libraryIndex">The library index containing all sources and items.</param>
        /// <returns>Enumerable of eligible LibraryItems.</returns>
        public IEnumerable<LibraryItem> BuildEligibleSetWithoutFileCheck(FilterState filterState, LibraryIndex libraryIndex)
        {
            Log("FilterService.BuildEligibleSetWithoutFileCheck: Starting (skipping File.Exists check)...");
            
            if (filterState == null)
            {
                Log("FilterService.BuildEligibleSetWithoutFileCheck: ERROR - filterState is null");
                throw new ArgumentNullException(nameof(filterState));
            }
            if (libraryIndex == null)
            {
                Log("FilterService.BuildEligibleSetWithoutFileCheck: ERROR - libraryIndex is null");
                throw new ArgumentNullException(nameof(libraryIndex));
            }

            Log($"FilterService.BuildEligibleSetWithoutFileCheck: Library has {libraryIndex.Items.Count} items, {libraryIndex.Sources.Count} sources");
            Log($"FilterService.BuildEligibleSetWithoutFileCheck: FilterState - FavoritesOnly: {filterState.FavoritesOnly}, ExcludeBlacklisted: {filterState.ExcludeBlacklisted}, OnlyNeverPlayed: {filterState.OnlyNeverPlayed}, AudioFilter: {filterState.AudioFilter}");

            // Start with all items
            var eligible = libraryIndex.Items.AsEnumerable();

            // 1. Only items from enabled sources
            var enabledSourceIds = libraryIndex.Sources
                .Where(s => s.IsEnabled)
                .Select(s => s.Id)
                .ToHashSet();
            eligible = eligible.Where(item => enabledSourceIds.Contains(item.SourceId));

            // Skip File.Exists check here for performance

            // 3. ExcludeBlacklisted check
            if (filterState.ExcludeBlacklisted)
            {
                eligible = eligible.Where(item => !item.IsBlacklisted);
            }

            // 4. FavoritesOnly check
            if (filterState.FavoritesOnly)
            {
                eligible = eligible.Where(item => item.IsFavorite);
            }

            // 5. OnlyNeverPlayed check
            if (filterState.OnlyNeverPlayed)
            {
                eligible = eligible.Where(item => item.PlayCount == 0);
            }

            // 6. Audio filter (only applies to videos, photos are always included)
            if (filterState.AudioFilter == AudioFilterMode.WithAudioOnly)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.HasAudio == true);
            }
            else if (filterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.HasAudio == false);
            }

            // 7. Duration filter (only applies to videos, photos are always included)
            if (filterState.MinDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.MediaType == MediaType.Photo ||
                    (item.Duration.HasValue && item.Duration.Value >= filterState.MinDuration.Value));
            }

            if (filterState.MaxDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.MediaType == MediaType.Photo ||
                    (item.Duration.HasValue && item.Duration.Value <= filterState.MaxDuration.Value));
            }

            // 8. OnlyKnownDuration check (only applies to videos, photos are always included)
            if (filterState.OnlyKnownDuration)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.Duration.HasValue);
            }

            // 9. OnlyKnownLoudness check (only applies to videos, photos are always included)
            if (filterState.OnlyKnownLoudness)
            {
                eligible = eligible.Where(item => 
                    item.MediaType == MediaType.Photo || item.IntegratedLoudness.HasValue);
            }

            // 10. Tag filter (inclusion) - with per-category match modes
            if (filterState.SelectedTags != null && filterState.SelectedTags.Count > 0)
            {
                eligible = ApplyTagFilterWithCategoryMatchModes(eligible, filterState, libraryIndex);
            }

            // 10b. Tag filter (exclusion) - exclude items with any excluded tag (case-insensitive comparison)
            if (filterState.ExcludedTags != null && filterState.ExcludedTags.Count > 0)
            {
                eligible = eligible.Where(item =>
                    item.Tags == null ||
                    !filterState.ExcludedTags.Any(tag => item.Tags.Any(itemTag => string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
            }

            // 11. Media type filter
            if (filterState.MediaTypeFilter == MediaTypeFilter.VideosOnly)
            {
                eligible = eligible.Where(item => item.MediaType == MediaType.Video);
            }
            else if (filterState.MediaTypeFilter == MediaTypeFilter.PhotosOnly)
            {
                eligible = eligible.Where(item => item.MediaType == MediaType.Photo);
            }
            // MediaTypeFilter.All means no filtering

            var eligibleList = eligible.ToList();
            Log($"FilterService.BuildEligibleSetWithoutFileCheck: Completed - {eligibleList.Count} eligible items (without file check)");
            
            return eligibleList;
        }

        /// <summary>
        /// Applies tag filtering with per-category match modes.
        /// Supports both new category-based match modes and legacy flat tag matching.
        /// </summary>
        private IEnumerable<LibraryItem> ApplyTagFilterWithCategoryMatchModes(
            IEnumerable<LibraryItem> items, 
            FilterState filterState, 
            LibraryIndex libraryIndex)
        {
            // Check if we have categories in the library (new system)
            var hasCategories = libraryIndex.Categories != null && libraryIndex.Categories.Count > 0;
            
            if (!hasCategories)
            {
                // Fall back to legacy tag matching if library hasn't been migrated to category system
                Log("FilterService.ApplyTagFilterWithCategoryMatchModes: No categories in library, using legacy tag match mode");
                return ApplyLegacyTagFilter(items, filterState);
            }

            Log("FilterService.ApplyTagFilterWithCategoryMatchModes: Using per-category match modes");

            // Group selected tags by category
            var categories = libraryIndex.Categories ?? new List<TagCategory>();
            var tags = libraryIndex.Tags ?? new List<Tag>();

            var tagsByCategory = new Dictionary<string, List<string>>();
            foreach (var selectedTag in filterState.SelectedTags)
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
                    // Orphaned tag - add to "Uncategorized" category
                    const string uncategorizedId = "";
                    if (!tagsByCategory.ContainsKey(uncategorizedId))
                    {
                        tagsByCategory[uncategorizedId] = new List<string>();
                    }
                    tagsByCategory[uncategorizedId].Add(selectedTag);
                    Log($"FilterService.ApplyTagFilterWithCategoryMatchModes: Orphaned tag '{selectedTag}' added to Uncategorized");
                }
            }

            if (tagsByCategory.Count == 0)
            {
                Log("FilterService.ApplyTagFilterWithCategoryMatchModes: No tags with valid categories, returning all items");
                return items;
            }

            // Apply filtering per category
            var categoryResults = new List<(string CategoryId, HashSet<LibraryItem> Items)>();

            foreach (var kvp in tagsByCategory)
            {
                var categoryId = kvp.Key;
                var categoryTags = kvp.Value;

                // Get local match mode for this category (default to AND if not set)
                var localMatchMode = (filterState.CategoryLocalMatchModes?.TryGetValue(categoryId, out var mode) == true)
                    ? mode 
                    : TagMatchMode.And;

                Log($"FilterService.ApplyTagFilterWithCategoryMatchModes: Category {categoryId} has {categoryTags.Count} tags, local mode: {localMatchMode}");

                // Filter items based on local match mode
                IEnumerable<LibraryItem> categoryItems;
                if (localMatchMode == TagMatchMode.And)
                {
                    // Items must have ALL tags in this category
                    categoryItems = items.Where(item =>
                        item.Tags != null &&
                        categoryTags.All(tag => item.Tags.Any(itemTag => 
                            string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
                }
                else // TagMatchMode.Or
                {
                    // Items must have ANY tag in this category
                    categoryItems = items.Where(item =>
                        item.Tags != null &&
                        categoryTags.Any(tag => item.Tags.Any(itemTag => 
                            string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
                }

                categoryResults.Add((categoryId, new HashSet<LibraryItem>(categoryItems)));
            }

            // Combine category results using global match modes
            if (categoryResults.Count == 0)
            {
                return Enumerable.Empty<LibraryItem>();
            }

            if (categoryResults.Count == 1)
            {
                return categoryResults[0].Items;
            }

            // Start with first category's results
            var result = new HashSet<LibraryItem>(categoryResults[0].Items);

            // Get the global match mode (default to AND if not set)
            var useAndBetweenCategories = filterState.GlobalMatchMode ?? true;
            Log($"FilterService.ApplyTagFilterWithCategoryMatchModes: Using global mode: {(useAndBetweenCategories ? "AND" : "OR")}");

            // Combine remaining categories using the global match mode
            for (int i = 1; i < categoryResults.Count; i++)
            {
                if (useAndBetweenCategories) // AND
                {
                    result.IntersectWith(categoryResults[i].Items);
                    Log($"FilterService.ApplyTagFilterWithCategoryMatchModes: Applied AND with category {categoryResults[i].CategoryId}, {result.Count} items remain");
                }
                else // OR
                {
                    result.UnionWith(categoryResults[i].Items);
                    Log($"FilterService.ApplyTagFilterWithCategoryMatchModes: Applied OR with category {categoryResults[i].CategoryId}, {result.Count} items total");
                }
            }

            Log($"FilterService.ApplyTagFilterWithCategoryMatchModes: Final result: {result.Count} items");
            return result;
        }

        /// <summary>
        /// Legacy tag filter using flat TagMatchMode (for backward compatibility).
        /// </summary>
        private IEnumerable<LibraryItem> ApplyLegacyTagFilter(IEnumerable<LibraryItem> items, FilterState filterState)
        {
            if (filterState.TagMatchMode == TagMatchMode.And)
            {
                // Item must have ALL selected tags (case-insensitive comparison)
                return items.Where(item =>
                    item.Tags != null &&
                    filterState.SelectedTags.All(tag => item.Tags.Any(itemTag => 
                        string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
            }
            else // TagMatchMode.Or
            {
                // Item must have ANY of the selected tags (case-insensitive comparison)
                return items.Where(item =>
                    item.Tags != null &&
                    filterState.SelectedTags.Any(tag => item.Tags.Any(itemTag => 
                        string.Equals(itemTag, tag, StringComparison.OrdinalIgnoreCase))));
            }
        }
    }
}

