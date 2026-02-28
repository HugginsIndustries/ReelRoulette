using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    /// <summary>
    /// Request body for POST /api/pair.
    /// </summary>
    public class PairRequestDto
    {
        [JsonPropertyName("token")]
        public string? Token { get; set; }
    }
}
