using System;

namespace ReelRoulette;

public static class PlaybackMediaUrlResolver
{
    /// <summary>
    /// Resolves server-relative media URLs (e.g. /api/media/{token}) against the core base URL.
    /// Only http/https inputs are treated as already absolute; root-relative paths must not be
    /// passed to <see cref="Uri.TryCreate(string?, UriKind, out Uri?)"/> with Absolute on Unix.
    /// </summary>
    public static string? ResolveAbsoluteMediaUrl(string? mediaUrl, string baseUrl)
    {
        if (string.IsNullOrWhiteSpace(mediaUrl))
        {
            return null;
        }

        if (Uri.TryCreate(mediaUrl, UriKind.Absolute, out var absolute) &&
            (absolute.Scheme == Uri.UriSchemeHttp || absolute.Scheme == Uri.UriSchemeHttps))
        {
            return absolute.ToString();
        }

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            return null;
        }

        var normalizedRelative = mediaUrl.StartsWith("/", StringComparison.Ordinal)
            ? mediaUrl
            : "/" + mediaUrl;
        return new Uri(baseUri, normalizedRelative).ToString();
    }
}
