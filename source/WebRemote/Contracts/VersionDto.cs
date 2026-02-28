using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    /// <summary>
    /// Response for GET /api/version.
    /// </summary>
    public class VersionDto
    {
        [JsonPropertyName("appVersion")]
        public string AppVersion { get; set; } = string.Empty;

        [JsonPropertyName("apiVersion")]
        public string ApiVersion { get; set; } = "1";

        [JsonPropertyName("assetsVersion")]
        public string? AssetsVersion { get; set; }
    }
}
