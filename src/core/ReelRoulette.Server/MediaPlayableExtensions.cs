namespace ReelRoulette.Server;

/// <summary>
/// Canonical video/photo extension sets for import, refresh, and playback eligibility.
/// </summary>
public static class MediaPlayableExtensions
{
    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".mpg", ".mpeg"
    };

    private static readonly HashSet<string> PhotoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
        ".tiff", ".tif", ".heic", ".heif", ".avif", ".ico", ".svg", ".raw", ".cr2", ".nef", ".orf", ".sr2"
    };

    public static bool IsPlayableFilePath(string filePath)
    {
        var ext = Path.GetExtension(filePath);
        return IsPlayableExtension(ext);
    }

    public static bool IsPlayableExtension(string? extension)
    {
        if (string.IsNullOrEmpty(extension))
        {
            return false;
        }

        var normalized = extension.StartsWith('.') ? extension : "." + extension;
        return VideoExtensions.Contains(normalized) || PhotoExtensions.Contains(normalized);
    }

    public static bool IsVideoExtension(string? extension)
    {
        if (string.IsNullOrEmpty(extension))
        {
            return false;
        }

        var normalized = extension.StartsWith('.') ? extension : "." + extension;
        return VideoExtensions.Contains(normalized);
    }

    public static bool IsPhotoExtension(string? extension)
    {
        if (string.IsNullOrEmpty(extension))
        {
            return false;
        }

        var normalized = extension.StartsWith('.') ? extension : "." + extension;
        return PhotoExtensions.Contains(normalized);
    }
}
