using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Represents a single video file in the library with all its metadata.
    /// </summary>
    public class LibraryItem
    {
        /// <summary>
        /// Reference to the LibrarySource that contains this item.
        /// </summary>
        [JsonPropertyName("sourceId")]
        public string SourceId { get; set; } = string.Empty;

        /// <summary>
        /// Absolute file path.
        /// </summary>
        [JsonPropertyName("fullPath")]
        public string FullPath { get; set; } = string.Empty;

        /// <summary>
        /// Path relative to the source root.
        /// </summary>
        [JsonPropertyName("relativePath")]
        public string RelativePath { get; set; } = string.Empty;

        /// <summary>
        /// File name (without path).
        /// </summary>
        [JsonPropertyName("fileName")]
        public string FileName { get; set; } = string.Empty;

        /// <summary>
        /// Duration of the video. Null if unknown.
        /// </summary>
        [JsonPropertyName("duration")]
        public TimeSpan? Duration { get; set; }

        /// <summary>
        /// Whether the video has audio. Null if unknown.
        /// </summary>
        [JsonPropertyName("hasAudio")]
        public bool? HasAudio { get; set; }

        /// <summary>
        /// Integrated loudness in LUFS, if available.
        /// </summary>
        [JsonPropertyName("integratedLoudness")]
        public double? IntegratedLoudness { get; set; }

        /// <summary>
        /// Peak volume in dB, if available.
        /// </summary>
        [JsonPropertyName("peakDb")]
        public double? PeakDb { get; set; }

        /// <summary>
        /// Whether this item is marked as a favorite.
        /// </summary>
        [JsonPropertyName("isFavorite")]
        public bool IsFavorite { get; set; }

        /// <summary>
        /// Whether this item is blacklisted.
        /// </summary>
        [JsonPropertyName("isBlacklisted")]
        public bool IsBlacklisted { get; set; }

        /// <summary>
        /// Number of times this video has been played.
        /// </summary>
        [JsonPropertyName("playCount")]
        public int PlayCount { get; set; }

        /// <summary>
        /// UTC timestamp of when this video was last played. Null if never played.
        /// </summary>
        [JsonPropertyName("lastPlayedUtc")]
        public DateTime? LastPlayedUtc { get; set; }

        /// <summary>
        /// List of tags assigned to this item.
        /// </summary>
        [JsonPropertyName("tags")]
        public List<string> Tags { get; set; } = new List<string>();

        /// <summary>
        /// Type of media (Video or Photo). Defaults to Video for backward compatibility.
        /// </summary>
        [JsonPropertyName("mediaType")]
        public MediaType MediaType { get; set; } = MediaType.Video;
    }
}

