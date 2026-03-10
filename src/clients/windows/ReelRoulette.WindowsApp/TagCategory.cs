using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Represents a tag category (e.g., Genre, People, Mood).
    /// All tags must belong to a category.
    /// </summary>
    public class TagCategory
    {
        /// <summary>
        /// Unique identifier for the category (GUID).
        /// </summary>
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        /// <summary>
        /// Display name of the category (e.g., "Genre", "People").
        /// </summary>
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Display order in UI (lower numbers appear first).
        /// </summary>
        [JsonPropertyName("sortOrder")]
        public int SortOrder { get; set; }
    }
}
