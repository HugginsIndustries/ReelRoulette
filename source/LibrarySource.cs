using System;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Represents a source folder that has been imported into the library.
    /// </summary>
    public class LibrarySource
    {
        /// <summary>
        /// Unique identifier for this source.
        /// </summary>
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        /// <summary>
        /// Absolute path to the source folder root.
        /// </summary>
        [JsonPropertyName("rootPath")]
        public string RootPath { get; set; } = string.Empty;

        /// <summary>
        /// Optional custom display name for this source. If null, use folder name.
        /// </summary>
        [JsonPropertyName("displayName")]
        public string? DisplayName { get; set; }

        /// <summary>
        /// Whether this source is enabled. Disabled sources are excluded from filtering and playback.
        /// </summary>
        [JsonPropertyName("isEnabled")]
        public bool IsEnabled { get; set; } = true;
    }
}

