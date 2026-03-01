using System.Text.RegularExpressions;

namespace ReelRoulette;

internal static class LogSanitizer
{
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
        sanitized = Regex.Replace(sanitized, @"(?i)\bTags:\s*.+$", "Tags: [redacted]");
        sanitized = Regex.Replace(sanitized, @"(?i)\bOld:\s*\[[^\]]*\]", "Old: [redacted]");
        sanitized = Regex.Replace(sanitized, @"(?i)\bNew:\s*\[[^\]]*\]", "New: [redacted]");

        // Redact standalone filename-like tokens.
        sanitized = Regex.Replace(sanitized, @"\b[^\\/\s:]+?\.[A-Za-z0-9]{2,6}\b", "[redacted-file]");

        return sanitized;
    }
}
