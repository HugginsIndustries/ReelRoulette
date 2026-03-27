using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Represents a tag with an associated category.
    /// </summary>
    public class Tag
    {
        /// <summary>
        /// Display name of the tag.
        /// </summary>
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// ID of the category this tag belongs to (references TagCategory.Id).
        /// </summary>
        [JsonPropertyName("categoryId")]
        public string CategoryId { get; set; } = string.Empty;
    }
}
