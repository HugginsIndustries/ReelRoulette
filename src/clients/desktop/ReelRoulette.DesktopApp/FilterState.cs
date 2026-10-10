using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using ReelRoulette.Core.Filtering;

namespace ReelRoulette
{
    /// <summary>
    /// Represents the current filter configuration. This is the single source of truth for all filtering.
    /// </summary>
    public class FilterState : IJsonOnDeserialized
    {
        private FlagFilterModeValue? _readFavoritesMode;
        private bool? _readFavoritesOnly;
        private FlagFilterModeValue? _readBlacklistedMode;
        private bool? _readExcludeBlacklisted;

        /// <summary>
        /// Favorites filter mode. Default is off.
        /// </summary>
        [JsonIgnore]
        public FlagFilterModeValue FavoritesMode { get; set; } = FlagFilterModeValue.Off;

        /// <summary>
        /// Blacklisted filter mode. Default is excluded.
        /// </summary>
        [JsonIgnore]
        public FlagFilterModeValue BlacklistedMode { get; set; } = FlagFilterModeValue.Excluded;

        /// <summary>
        /// Favorites mode on the wire, written as its name. A read value is resolved once the whole filter is read.
        /// </summary>
        [JsonInclude]
        [JsonPropertyName("favoritesMode")]
        [JsonConverter(typeof(FlagFilterModeJsonConverter))]
        private FlagFilterModeValue? FavoritesModeWire
        {
            get => FavoritesMode;
            set => _readFavoritesMode = value;
        }

        /// <summary>
        /// Older favorites field, written as the projection of <see cref="FavoritesMode"/>.
        /// </summary>
        [JsonInclude]
        [JsonPropertyName("favoritesOnly")]
        private bool? FavoritesOnlyWire
        {
            get => FlagFilterModes.FavoritesOnly(FavoritesMode);
            set => _readFavoritesOnly = value;
        }

        /// <summary>
        /// Blacklisted mode on the wire, written as its name. A read value is resolved once the whole filter is read.
        /// </summary>
        [JsonInclude]
        [JsonPropertyName("blacklistedMode")]
        [JsonConverter(typeof(FlagFilterModeJsonConverter))]
        private FlagFilterModeValue? BlacklistedModeWire
        {
            get => BlacklistedMode;
            set => _readBlacklistedMode = value;
        }

        /// <summary>
        /// Older blacklisted field, written as the projection of <see cref="BlacklistedMode"/>.
        /// </summary>
        [JsonInclude]
        [JsonPropertyName("excludeBlacklisted")]
        private bool? ExcludeBlacklistedWire
        {
            get => FlagFilterModes.ExcludeBlacklisted(BlacklistedMode);
            set => _readExcludeBlacklisted = value;
        }

        /// <summary>
        /// Show only items that have never been played (PlayCount == 0).
        /// </summary>
        [JsonPropertyName("onlyNeverPlayed")]
        public bool OnlyNeverPlayed { get; set; }

        /// <summary>
        /// Audio filter mode.
        /// </summary>
        [JsonPropertyName("audioFilter")]
        public AudioFilterMode AudioFilter { get; set; } = AudioFilterMode.PlayAll;

        /// <summary>
        /// Minimum duration filter. Null means no minimum.
        /// </summary>
        [JsonPropertyName("minDuration")]
        [JsonConverter(typeof(FilterDurationJsonConverter))]
        public TimeSpan? MinDuration { get; set; }

        /// <summary>
        /// Maximum duration filter. Null means no maximum.
        /// </summary>
        [JsonPropertyName("maxDuration")]
        [JsonConverter(typeof(FilterDurationJsonConverter))]
        public TimeSpan? MaxDuration { get; set; }

        /// <summary>
        /// List of selected tags to filter by (inclusion).
        /// </summary>
        [JsonPropertyName("selectedTags")]
        public List<string> SelectedTags { get; set; } = new List<string>();

        /// <summary>
        /// List of tags to exclude from results (exclusion).
        /// </summary>
        [JsonPropertyName("excludedTags")]
        public List<string> ExcludedTags { get; set; } = new List<string>();

        /// <summary>
        /// Per-category local match modes (how tags within each category combine).
        /// Key: CategoryId, Value: AND or OR mode for tags within that category.
        /// </summary>
        [JsonPropertyName("categoryLocalMatchModes")]
        public Dictionary<string, TagMatchMode>? CategoryLocalMatchModes { get; set; }

        /// <summary>
        /// Global match mode: how categories combine with each other.
        /// true = AND (all categories must match), false = OR (any category can match).
        /// Defaults to AND (true) if not set.
        /// </summary>
        [JsonPropertyName("globalMatchMode")]
        public bool? GlobalMatchMode { get; set; }

        /// <summary>
        /// Show only items with known duration (Duration != null).
        /// </summary>
        [JsonPropertyName("onlyKnownDuration")]
        public bool OnlyKnownDuration { get; set; }

        /// <summary>
        /// Show only items with known loudness (IntegratedLoudness != null).
        /// </summary>
        [JsonPropertyName("onlyKnownLoudness")]
        public bool OnlyKnownLoudness { get; set; }

        /// <summary>
        /// Media type filter (All, VideosOnly, PhotosOnly). Default is All.
        /// </summary>
        [JsonPropertyName("mediaTypeFilter")]
        public MediaTypeFilter MediaTypeFilter { get; set; } = MediaTypeFilter.All;

        /// <summary>
        /// Optional per-client source filter. Empty means all globally enabled sources.
        /// </summary>
        [JsonPropertyName("includedSourceIds")]
        public List<string> IncludedSourceIds { get; set; } = new List<string>();

        /// <summary>
        /// Resolves each flag filter from what was read, so the result does not depend on property order.
        /// </summary>
        void IJsonOnDeserialized.OnDeserialized()
        {
            FavoritesMode = FlagFilterModes.ResolveFavorites(_readFavoritesMode, _readFavoritesOnly);
            BlacklistedMode = FlagFilterModes.ResolveBlacklisted(_readBlacklistedMode, _readExcludeBlacklisted);
            _readFavoritesMode = null;
            _readFavoritesOnly = null;
            _readBlacklistedMode = null;
            _readExcludeBlacklisted = null;
        }
    }
}

