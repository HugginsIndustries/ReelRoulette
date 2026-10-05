using System.Text.RegularExpressions;

namespace ReelRoulette;

internal static class LogSanitizer
{
    // The extensions the app plays, copied from MediaPlayableExtensions.cs in ReelRoulette.Server, which the desktop
    // does not reference. Keep the two lists the same.
    private static readonly string[] MediaExtensions =
    [
        "mp4", "mkv", "avi", "mov", "wmv", "mpg", "mpeg",
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif", "heic", "heif", "avif", "ico", "svg", "raw", "cr2", "nef", "orf", "sr2"
    ];

    // A media file name may hold spaces, dots, commas, brackets, and apostrophes, so it runs back to the nearest path
    // separator, key/value delimiter, or character Windows does not allow in file names.
    private static readonly Regex MediaFileName = new(
        $@"[^\s\\/:*?""<>|=][^\\/:*?""<>|=\r\n]*?\.(?:{string.Join("|", MediaExtensions)})\b",
        RegexOptions.IgnoreCase);

    public static string Sanitize(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return string.Empty;

        var sanitized = message;

        // Redact absolute paths (Windows drive paths and UNC paths).
        sanitized = Regex.Replace(
            sanitized,
            @"([A-Za-z]:\\[^,\r\n]+|\\\\[^\\\s]+\\[^,\r\n]+)",
            "[redacted-path]");

        // Redact absolute Unix paths: a slash that starts a token, but not a URL's "//" or a server route.
        sanitized = Regex.Replace(
            sanitized,
            @"(?<=^|[\s=:(\['""])/(?![/\s])(?!(?:api|control)/)[^,\r\n]+",
            "[redacted-path]");

        // Redact common key/value path fields.
        sanitized = Regex.Replace(
            sanitized,
            @"(?i)\b(currentvideopath|videopath|fullpath|rootpath|oldpath|newpath|missingpath|path)\s*[:=]\s*[^,\r\n]+",
            m => $"{m.Groups[1].Value}: [redacted]");

        // Redact "for: <filename/path>" style payloads.
        sanitized = Regex.Replace(sanitized, @"(?i)\bfor:\s*[^,\r\n]+", "for: [redacted]");
        sanitized = Regex.Replace(sanitized, @"(?i)\b(video|file|photo|item)\s*:\s*[^,\r\n]+", m => $"{m.Groups[1].Value}: [redacted]");

        // Redact tag names and lists.
        sanitized = Regex.Replace(sanitized, @"(?i)\btag\s*'[^']*'", "tag '[redacted]'");
        // Redact tags payloads even when they span multiple lines (e.g. category-per-line output).
        sanitized = Regex.Replace(sanitized, @"(?is)\bTags:\s*.*$", "Tags: [redacted]");
        sanitized = Regex.Replace(sanitized, @"(?i)\bOld:\s*\[[^\]]*\]", "Old: [redacted]");
        sanitized = Regex.Replace(sanitized, @"(?i)\bNew:\s*\[[^\]]*\]", "New: [redacted]");
        // Redact preset names in logs.
        sanitized = Regex.Replace(sanitized, @"(?i)\bpreset\s*'[^']*'", "preset '[redacted]'");
        sanitized = Regex.Replace(sanitized, @"(?i)\bactive preset name\s*:\s*[^,\r\n]+", "active preset name: [redacted]");
        sanitized = Regex.Replace(sanitized, @"(?i)\bactive preset\s*:\s*[^,\r\n]+", "active preset: [redacted]");
        sanitized = Regex.Replace(
            sanitized,
            @"(?i)(\bpresets?[^\r\n]*\bselected:\s*)[^,\r\n]+",
            "$1[redacted]");
        sanitized = Regex.Replace(
            sanitized,
            @"(?i)\b(LibraryPresetComboBox:[^\r\n]*\bpreset\s*)'[^']*'",
            "$1'[redacted]'");
        sanitized = Regex.Replace(
            sanitized,
            @"(?i)\b(LibraryPresetComboBox:\s*Selected\s*)'[^']*'",
            "$1'[redacted]'");

        // Redact media file names left in free text. Numbers, host names, and versions are not file names.
        sanitized = MediaFileName.Replace(sanitized, "[redacted-file]");

        return sanitized;
    }
}
