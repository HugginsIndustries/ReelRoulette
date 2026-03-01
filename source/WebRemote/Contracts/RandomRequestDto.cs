using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    /// <summary>
    /// Request body for POST /api/random.
    /// </summary>
    public class RandomRequestDto
    {
        [JsonPropertyName("presetId")]
        public string PresetId { get; set; } = string.Empty;

        [JsonPropertyName("clientId")]
        public string? ClientId { get; set; }

        [JsonPropertyName("includeVideos")]
        public bool IncludeVideos { get; set; } = true;

        [JsonPropertyName("includePhotos")]
        public bool IncludePhotos { get; set; } = true;

        [JsonPropertyName("randomizationMode")]
        public string? RandomizationMode { get; set; }
    }
}
