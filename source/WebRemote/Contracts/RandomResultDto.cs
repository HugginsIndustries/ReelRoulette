using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    /// <summary>
    /// Response for POST /api/random.
    /// </summary>
    public class RandomResultDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("mediaType")]
        public string MediaType { get; set; } = "video"; // "video" | "photo"

        [JsonPropertyName("durationSeconds")]
        public double? DurationSeconds { get; set; }

        [JsonPropertyName("mediaUrl")]
        public string MediaUrl { get; set; } = string.Empty;

        [JsonPropertyName("isFavorite")]
        public bool IsFavorite { get; set; }

        [JsonPropertyName("isBlacklisted")]
        public bool IsBlacklisted { get; set; }
    }
}
