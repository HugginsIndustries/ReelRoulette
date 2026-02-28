using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// The complete library index containing all sources, items, and available tags.
    /// This is the main data structure persisted to library.json.
    /// </summary>
    public class LibraryIndex
    {
        /// <summary>
        /// All library sources (imported folders).
        /// </summary>
        [JsonPropertyName("sources")]
        public List<LibrarySource> Sources { get; set; } = new List<LibrarySource>();

        /// <summary>
        /// All library items (video files).
        /// </summary>
        [JsonPropertyName("items")]
        public List<LibraryItem> Items { get; set; } = new List<LibraryItem>();

        /// <summary>
        /// All available tag categories (e.g., Genre, People, Mood).
        /// </summary>
        [JsonPropertyName("categories")]
        public List<TagCategory>? Categories { get; set; }

        /// <summary>
        /// All available tags that can be assigned to items (new format with categories).
        /// </summary>
        [JsonPropertyName("tags")]
        public List<Tag>? Tags { get; set; }

        /// <summary>
        /// Legacy: All available tags as strings (deprecated, kept for backward compatibility).
        /// Will be null after migration to new tag system.
        /// </summary>
        [JsonPropertyName("availableTags")]
        public List<string>? AvailableTags { get; set; }

        /// <summary>
        /// Fingerprint index schema version.
        /// </summary>
        [JsonPropertyName("fingerprintIndexVersion")]
        public int FingerprintIndexVersion { get; set; } = 1;

        /// <summary>
        /// Derived index for quick fingerprint lookups:
        /// key = "Algorithm:Version", value = map of fingerprint -> item IDs.
        /// </summary>
        [JsonPropertyName("fingerprintIndex")]
        public Dictionary<string, Dictionary<string, List<string>>> FingerprintIndex { get; set; } =
            new Dictionary<string, Dictionary<string, List<string>>>();
    }
}

