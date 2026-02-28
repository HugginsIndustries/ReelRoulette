using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    /// <summary>
    /// DTO for a filter preset in the web API.
    /// </summary>
    public class PresetDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("summary")]
        public string? Summary { get; set; }
    }
}
