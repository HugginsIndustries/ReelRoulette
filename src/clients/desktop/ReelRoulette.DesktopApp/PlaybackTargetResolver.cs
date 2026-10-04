using System;
using LibVLCSharp.Shared;

namespace ReelRoulette;

/// <summary>
/// What the desktop plays for one item. <see cref="IsPhoto"/> is the server's media type, never the file extension.
/// </summary>
internal sealed record PlaybackTarget(
    string StatsPath,
    string PlaybackSource,
    FromType PlaybackSourceType,
    bool IsLocallyAccessible,
    bool UsedApiPath,
    bool IsPhoto,
    bool SkipRecordPlayback = false);

internal static class PlaybackTargetResolver
{
    /// <summary>
    /// The server's <c>mediaType</c> on random and play-item responses, compared the same way the WebUI does.
    /// </summary>
    public static bool IsPhoto(string? serverMediaType)
    {
        return string.Equals(serverMediaType, "photo", StringComparison.Ordinal);
    }

    /// <summary>
    /// Builds the target for a random or play-item response. The local file is played when readable,
    /// unless API playback is forced; otherwise the response's media URL, or one built from the item id.
    /// </summary>
    public static PlaybackTarget? FromServerResponse(
        CoreRandomResponse? response,
        bool localAccessible,
        bool forceApiPlayback,
        string baseUrl)
    {
        // RandomResponse.id carries fullPath by current server convention (stats path, not stable item GUID).
        var statsPath = response?.Id?.Trim();
        if (response == null || string.IsNullOrWhiteSpace(statsPath))
        {
            return null;
        }

        var isPhoto = IsPhoto(response.MediaType);
        if (localAccessible && !forceApiPlayback)
        {
            return new PlaybackTarget(
                StatsPath: statsPath,
                PlaybackSource: statsPath,
                PlaybackSourceType: FromType.FromPath,
                IsLocallyAccessible: true,
                UsedApiPath: false,
                IsPhoto: isPhoto);
        }

        var absoluteMediaUrl = PlaybackMediaUrlResolver.ResolveAbsoluteMediaUrl(response.MediaUrl, baseUrl);
        if (string.IsNullOrWhiteSpace(absoluteMediaUrl))
        {
            if (!TryBuildApiMediaUrl(baseUrl, statsPath, out var builtApiMediaUrl))
            {
                return null;
            }

            absoluteMediaUrl = builtApiMediaUrl;
        }

        return new PlaybackTarget(
            StatsPath: statsPath,
            PlaybackSource: absoluteMediaUrl,
            PlaybackSourceType: FromType.FromLocation,
            IsLocallyAccessible: localAccessible,
            UsedApiPath: true,
            IsPhoto: isPhoto);
    }

    public static bool TryBuildApiMediaUrl(string baseUrl, string idOrToken, out string apiMediaUrl)
    {
        apiMediaUrl = string.Empty;
        if (string.IsNullOrWhiteSpace(idOrToken))
        {
            return false;
        }

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            return false;
        }

        var escaped = Uri.EscapeDataString(idOrToken.Trim());
        apiMediaUrl = new Uri(baseUri, $"/api/media/{escaped}").ToString();
        return true;
    }
}
