using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Represents a saved filter configuration preset with a user-provided name.
    /// Presets allow users to quickly apply commonly used filter combinations.
    /// </summary>
    public class FilterPreset
    {
        /// <summary>
        /// User-provided name for the preset (e.g., "Favorites - Never Played", "Short Videos").
        /// </summary>
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Complete filter state snapshot saved with this preset.
        /// </summary>
        [JsonPropertyName("filterState")]
        public FilterState FilterState { get; set; } = new FilterState();
    }
}
