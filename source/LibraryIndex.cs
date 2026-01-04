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
        /// All available tags that can be assigned to items.
        /// </summary>
        [JsonPropertyName("availableTags")]
        public List<string> AvailableTags { get; set; } = new List<string>();
    }
}

