using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    /// <summary>
    /// Request body for POST /api/record-playback.
    /// </summary>
    public class RecordPlaybackRequestDto
    {
        [JsonPropertyName("clientId")]
        public string? ClientId { get; set; }

        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;
    }
}
