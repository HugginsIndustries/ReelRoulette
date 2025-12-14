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

            // 6. Audio filter
            if (filterState.AudioFilter == AudioFilterMode.WithAudioOnly)
            {
                eligible = eligible.Where(item => item.HasAudio == true);
            }
            else if (filterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
            {
                eligible = eligible.Where(item => item.HasAudio == false);
            }
            // AudioFilterMode.PlayAll means no filtering

            // 7. Duration filter
            if (filterState.MinDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.Duration.HasValue && item.Duration.Value >= filterState.MinDuration.Value);
            }

            if (filterState.MaxDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.Duration.HasValue && item.Duration.Value <= filterState.MaxDuration.Value);
            }

            // 8. OnlyKnownDuration check
            if (filterState.OnlyKnownDuration)
            {
                eligible = eligible.Where(item => item.Duration.HasValue);
            }

            // 9. OnlyKnownLoudness check
            if (filterState.OnlyKnownLoudness)
            {
                eligible = eligible.Where(item => item.IntegratedLoudness.HasValue);
            }

            // 10. Tag filter
            if (filterState.SelectedTags != null && filterState.SelectedTags.Count > 0)
            {
                if (filterState.TagMatchMode == TagMatchMode.And)
                {
                    // Item must have ALL selected tags
                    eligible = eligible.Where(item =>
                        filterState.SelectedTags.All(tag => item.Tags.Contains(tag)));
                }
                else // TagMatchMode.Or
                {
                    // Item must have ANY of the selected tags
                    eligible = eligible.Where(item =>
                        filterState.SelectedTags.Any(tag => item.Tags.Contains(tag)));
                }
            }

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

            // 6. Audio filter
            if (filterState.AudioFilter == AudioFilterMode.WithAudioOnly)
            {
                eligible = eligible.Where(item => item.HasAudio == true);
            }
            else if (filterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
            {
                eligible = eligible.Where(item => item.HasAudio == false);
            }

            // 7. Duration filter
            if (filterState.MinDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.Duration.HasValue && item.Duration.Value >= filterState.MinDuration.Value);
            }

            if (filterState.MaxDuration.HasValue)
            {
                eligible = eligible.Where(item =>
                    item.Duration.HasValue && item.Duration.Value <= filterState.MaxDuration.Value);
            }

            // 8. OnlyKnownDuration check
            if (filterState.OnlyKnownDuration)
            {
                eligible = eligible.Where(item => item.Duration.HasValue);
            }

            // 9. OnlyKnownLoudness check
            if (filterState.OnlyKnownLoudness)
            {
                eligible = eligible.Where(item => item.IntegratedLoudness.HasValue);
            }

            // 10. Tag filter
            if (filterState.SelectedTags != null && filterState.SelectedTags.Count > 0)
            {
                if (filterState.TagMatchMode == TagMatchMode.And)
                {
                    eligible = eligible.Where(item =>
                        filterState.SelectedTags.All(tag => item.Tags.Contains(tag)));
                }
                else // TagMatchMode.Or
                {
                    eligible = eligible.Where(item =>
                        filterState.SelectedTags.Any(tag => item.Tags.Contains(tag)));
                }
            }

            var eligibleList = eligible.ToList();
            Log($"FilterService.BuildEligibleSetWithoutFileCheck: Completed - {eligibleList.Count} eligible items (without file check)");
            
            return eligibleList;
        }
    }
}

