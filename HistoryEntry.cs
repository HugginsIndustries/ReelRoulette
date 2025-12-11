using System;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    public class HistoryEntry
    {
        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("fileName")]
        public string FileName { get; set; } = string.Empty;

        [JsonPropertyName("playedAt")]
        public DateTime PlayedAt { get; set; }
    }
}

