using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote.Contracts
{
    public class FavoriteRequestDto
    {
        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("isFavorite")]
        public bool IsFavorite { get; set; }
    }
}
