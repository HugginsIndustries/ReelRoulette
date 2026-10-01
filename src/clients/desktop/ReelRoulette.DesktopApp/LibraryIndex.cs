using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Desktop shell for the server library: sources, tag categories, and tags.
    /// </summary>
    public class LibraryIndex
    {
        /// <summary>
        /// All library sources (imported folders).
        /// </summary>
        [JsonPropertyName("sources")]
        public List<LibrarySource> Sources { get; set; } = new List<LibrarySource>();

        /// <summary>
        /// All available tag categories (e.g., Genre, People, Mood).
        /// </summary>
        [JsonPropertyName("categories")]
        public List<TagCategory>? Categories { get; set; }

        /// <summary>
        /// All available tags that can be assigned to items.
        /// </summary>
        [JsonPropertyName("tags")]
        public List<Tag>? Tags { get; set; }
    }
}

