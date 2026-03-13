using System;
using System.Collections.Generic;
using System.Linq;
using ReelRoulette.Core.Filtering;

namespace ReelRoulette
{
    /// <summary>
    /// Desktop adapter over core filter-set building logic.
    /// </summary>
    public class FilterService
    {
        private readonly FilterSetBuilder _coreBuilder = new();

        public IEnumerable<LibraryItem> BuildEligibleSet(FilterState filterState, LibraryIndex libraryIndex)
        {
            var itemMap = BuildItemMap(libraryIndex.Items);
            var result = _coreBuilder.BuildEligibleSet(
                ToCoreState(filterState),
                ToCoreRequest(libraryIndex));
            return result
                .Where(item => itemMap.ContainsKey(item.Key))
                .Select(item => itemMap[item.Key])
                .ToList();
        }

        public IEnumerable<LibraryItem> BuildEligibleSetWithoutFileCheck(FilterState filterState, LibraryIndex libraryIndex)
        {
            var itemMap = BuildItemMap(libraryIndex.Items);
            var result = _coreBuilder.BuildEligibleSetWithoutFileCheck(
                ToCoreState(filterState),
                ToCoreRequest(libraryIndex));
            return result
                .Where(item => itemMap.ContainsKey(item.Key))
                .Select(item => itemMap[item.Key])
                .ToList();
        }

        public bool IsItemEligibleWithoutFileCheck(FilterState filterState, LibraryIndex libraryIndex, LibraryItem item)
        {
            var request = ToCoreRequest(libraryIndex);
            request.Items = new List<FilterItem>
            {
                new()
                {
                    Key = GetItemKey(item),
                    SourceId = item.SourceId,
                    FullPath = item.FullPath,
                    IsBlacklisted = item.IsBlacklisted,
                    IsFavorite = item.IsFavorite,
                    PlayCount = item.PlayCount,
                    HasAudio = item.HasAudio,
                    Duration = item.Duration,
                    IntegratedLoudness = item.IntegratedLoudness,
                    MediaType = (MediaTypeValue)(int)item.MediaType,
                    Tags = item.Tags?.ToList() ?? new List<string>()
                }
            };

            var result = _coreBuilder.BuildEligibleSetWithoutFileCheck(ToCoreState(filterState), request);
            return result.Any();
        }

        private static Dictionary<string, LibraryItem> BuildItemMap(IEnumerable<LibraryItem> items)
        {
            return items.ToDictionary(GetItemKey, item => item, StringComparer.OrdinalIgnoreCase);
        }

        private static FilterSetRequest ToCoreRequest(LibraryIndex libraryIndex)
        {
            return new FilterSetRequest
            {
                Sources = libraryIndex.Sources
                    .Select(source => new FilterSource
                    {
                        Id = source.Id,
                        IsEnabled = source.IsEnabled
                    })
                    .ToList(),
                Items = libraryIndex.Items
                    .Select(item => new FilterItem
                    {
                        Key = GetItemKey(item),
                        SourceId = item.SourceId,
                        FullPath = item.FullPath,
                        IsBlacklisted = item.IsBlacklisted,
                        IsFavorite = item.IsFavorite,
                        PlayCount = item.PlayCount,
                        HasAudio = item.HasAudio,
                        Duration = item.Duration,
                        IntegratedLoudness = item.IntegratedLoudness,
                        MediaType = (MediaTypeValue)(int)item.MediaType,
                        Tags = item.Tags?.ToList() ?? new List<string>()
                    })
                    .ToList(),
                CategoryIds = libraryIndex.Categories?.Select(category => category.Id).ToList(),
                Tags = libraryIndex.Tags?
                    .Select(tag => new FilterTag
                    {
                        Name = tag.Name,
                        CategoryId = tag.CategoryId
                    })
                    .ToList()
            };
        }

        private static FilterStateModel ToCoreState(FilterState filterState)
        {
            return new FilterStateModel
            {
                FavoritesOnly = filterState.FavoritesOnly,
                ExcludeBlacklisted = filterState.ExcludeBlacklisted,
                OnlyNeverPlayed = filterState.OnlyNeverPlayed,
                AudioFilter = (AudioFilterModeValue)(int)filterState.AudioFilter,
                MinDuration = filterState.MinDuration,
                MaxDuration = filterState.MaxDuration,
                SelectedTags = filterState.SelectedTags?.ToList() ?? new List<string>(),
                ExcludedTags = filterState.ExcludedTags?.ToList() ?? new List<string>(),
                TagMatchMode = (TagMatchModeValue)(int)filterState.TagMatchMode,
                CategoryLocalMatchModes = filterState.CategoryLocalMatchModes?
                    .ToDictionary(
                        kvp => kvp.Key,
                        kvp => (TagMatchModeValue)(int)kvp.Value,
                        StringComparer.OrdinalIgnoreCase),
                GlobalMatchMode = filterState.GlobalMatchMode,
                OnlyKnownDuration = filterState.OnlyKnownDuration,
                OnlyKnownLoudness = filterState.OnlyKnownLoudness,
                MediaTypeFilter = (MediaTypeFilterValue)(int)filterState.MediaTypeFilter,
                IncludedSourceIds = filterState.IncludedSourceIds?.ToList() ?? new List<string>()
            };
        }

        private static string GetItemKey(LibraryItem item)
        {
            return !string.IsNullOrWhiteSpace(item.Id) ? item.Id : item.FullPath;
        }
    }
}

