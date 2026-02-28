using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    public class BlacklistRequestDto
    {
        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("isBlacklisted")]
        public bool IsBlacklisted { get; set; }
    }
}
