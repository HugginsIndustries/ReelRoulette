using System.Reflection;

namespace ReelRoulette.Server.Contracts;

public static class ApiContractMapper
{
    public static VersionResponse MapVersion(string apiVersion, string? assetsVersion = null)
    {
        return new VersionResponse
        {
            AppVersion = Assembly.GetEntryAssembly()?.GetName().Version?.ToString() ?? "dev",
            ApiVersion = apiVersion,
            AssetsVersion = assetsVersion
        };
    }

    public static RandomResponse MapRandomResult(
        string id,
        string displayName,
        string mediaType,
        double? durationSeconds,
        string mediaUrl,
        bool isFavorite,
        bool isBlacklisted)
    {
        return new RandomResponse
        {
            Id = id,
            DisplayName = displayName,
            MediaType = mediaType,
            DurationSeconds = durationSeconds,
            MediaUrl = mediaUrl,
            IsFavorite = isFavorite,
            IsBlacklisted = isBlacklisted
        };
    }

    public static PresetResponse MapPreset(string id, string name, string? summary = null)
    {
        return new PresetResponse
        {
            Id = id,
            Name = name,
            Summary = summary
        };
    }
}
