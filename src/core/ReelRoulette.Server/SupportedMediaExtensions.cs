namespace ReelRoulette.Server;

/// <summary>
/// The video and photo extensions the server supports: the files import and refresh add to the library, and the play
/// route accepts. Not what a browser can play, which is BrowserPlayableContainers in ReelRoulette.Core.
/// </summary>
public static class SupportedMediaExtensions
{
    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".m4v", ".webm", ".mkv", ".avi", ".mov", ".wmv", ".mpg", ".mpeg"
    };

    private static readonly HashSet<string> PhotoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
        ".tiff", ".tif", ".heic", ".heif", ".avif", ".ico", ".svg", ".raw", ".cr2", ".nef", ".orf", ".sr2"
    };

    public static bool IsSupportedFilePath(string filePath)
    {
        var ext = Path.GetExtension(filePath);
        return IsSupportedExtension(ext);
    }

    public static bool IsSupportedExtension(string? extension)
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
}
