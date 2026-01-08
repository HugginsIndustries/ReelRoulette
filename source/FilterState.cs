using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Represents the current filter configuration. This is the single source of truth for all filtering.
    /// </summary>
    public class FilterState
    {
        /// <summary>
        /// Show only favorite items.
        /// </summary>
        [JsonPropertyName("favoritesOnly")]
        public bool FavoritesOnly { get; set; }

        /// <summary>
        /// Exclude blacklisted items. Default is true.
        /// </summary>
        [JsonPropertyName("excludeBlacklisted")]
        public bool ExcludeBlacklisted { get; set; } = true;

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
        public TimeSpan? MinDuration { get; set; }

        /// <summary>
        /// Maximum duration filter. Null means no maximum.
        /// </summary>
        [JsonPropertyName("maxDuration")]
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
        /// How to match multiple selected tags (AND vs OR).
        /// Legacy property - kept for backward compatibility with old filter presets.
        /// </summary>
        [JsonPropertyName("tagMatchMode")]
        public TagMatchMode TagMatchMode { get; set; } = TagMatchMode.And;

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
    }
}

