namespace ReelRoulette.Server.Contracts;

public sealed class VersionResponse
{
    public string AppVersion { get; set; } = "dev";
    public string ApiVersion { get; set; } = "1";
    public string? AssetsVersion { get; set; }
}

public sealed class PresetResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Summary { get; set; }
}

public sealed class RandomRequest
{
    public string PresetId { get; set; } = string.Empty;
    public string? ClientId { get; set; }
    public bool IncludeVideos { get; set; } = true;
    public bool IncludePhotos { get; set; } = true;
    public string? RandomizationMode { get; set; }
}

public sealed class RandomResponse
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string MediaType { get; set; } = "video";
    public double? DurationSeconds { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
}

public sealed class FavoriteRequest
{
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
}

public sealed class BlacklistRequest
{
    public string Path { get; set; } = string.Empty;
    public bool IsBlacklisted { get; set; }
}

public sealed class RecordPlaybackRequest
{
    public string? ClientId { get; set; }
    public string Path { get; set; } = string.Empty;
}

public sealed class LibraryStatesRequest
{
    public List<string>? Paths { get; set; }
}

public sealed class LibraryStateResponse
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
    public long Revision { get; set; }
}

public sealed class ServerEventEnvelope
{
    public long Revision { get; set; }
    public string EventType { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public object Payload { get; set; } = new { };
}

public sealed class ItemStateChangedPayload
{
    public string ItemId { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool IsFavorite { get; set; }
    public bool IsBlacklisted { get; set; }
}

public sealed class PlaybackRecordedPayload
{
    public string Path { get; set; } = string.Empty;
    public string? ClientId { get; set; }
}
