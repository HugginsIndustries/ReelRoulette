using System.Text.Json.Serialization;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// Authentication mode for the web remote server.
    /// </summary>
    public enum WebRemoteAuthMode
    {
        /// <summary>No authentication; anyone on the network can access.</summary>
        Off,

        /// <summary>Require shared token or pairing cookie for access.</summary>
        TokenRequired,
    }

    /// <summary>
    /// Settings for the local web remote UI (preset-based streaming webapp).
    /// </summary>
    public class WebRemoteSettings
    {
        /// <summary>Whether the web remote server is enabled.</summary>
        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = false;

        /// <summary>Port to listen on (e.g., 51234).</summary>
        [JsonPropertyName("port")]
        public int Port { get; set; } = 51234;

        /// <summary>Bind on all interfaces (LAN) when true; otherwise localhost only.</summary>
        [JsonPropertyName("bindOnLan")]
        public bool BindOnLan { get; set; } = false;

        /// <summary>LAN hostname label used for .local access (example: "reel" => "reel.local").</summary>
        [JsonPropertyName("lanHostname")]
        public string? LanHostname { get; set; } = "reel";

        /// <summary>Authentication mode: Off or TokenRequired.</summary>
        [JsonPropertyName("authMode")]
        public WebRemoteAuthMode AuthMode { get; set; } = WebRemoteAuthMode.TokenRequired;

        /// <summary>Shared token for authentication when AuthMode is TokenRequired.</summary>
        [JsonPropertyName("sharedToken")]
        public string? SharedToken { get; set; }
    }
}
