namespace ReelRoulette.Core.Storage;

/// <summary>
/// Normalizes library source root paths and derives folder display names.
/// <see cref="Path.GetFileName(string?)"/> returns empty for paths that end in a directory separator.
/// </summary>
public static class LibrarySourcePath
{
    public static string NormalizeRootPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        var trimmed = path.Trim();
        while (EndsWithDirectorySeparator(trimmed) && !IsPreservedRoot(trimmed))
        {
            trimmed = trimmed[..^1];
        }

        return trimmed;
    }

    private static bool EndsWithDirectorySeparator(string path)
    {
        return path.Length > 0 && (path[^1] == '/' || path[^1] == '\\');
    }

    /// <summary>
    /// Unix <c>/</c>, a lone backslash, or a Windows volume root (<c>C:\</c> / <c>C:/</c>).
    /// Stripping the separator from a volume root yields a drive-relative path (<c>C:</c>),
    /// which <see cref="Directory.Exists(string)"/> can treat as the current directory on that drive.
    /// </summary>
    private static bool IsPreservedRoot(string path)
    {
        if (path == "/" || path == "\\")
        {
            return true;
        }

        return path.Length == 3
            && char.IsAsciiLetter(path[0])
            && path[1] == ':'
            && EndsWithDirectorySeparator(path);
    }

    public static string GetFolderDisplayName(string? path)
    {
        var normalized = NormalizeRootPath(path);
        if (string.IsNullOrEmpty(normalized))
        {
            return string.Empty;
        }

        var lastSlash = Math.Max(normalized.LastIndexOf('/'), normalized.LastIndexOf('\\'));
        if (lastSlash < 0)
        {
            return normalized;
        }

        if (lastSlash < normalized.Length - 1)
        {
            return normalized[(lastSlash + 1)..];
        }

        return string.Empty;
    }

    public static string ResolveDisplayName(string? displayName, string? rootPath)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        return GetFolderDisplayName(rootPath);
    }

    public static bool RootPathsEqual(string? left, string? right)
    {
        return string.Equals(NormalizeRootPath(left), NormalizeRootPath(right), StringComparison.OrdinalIgnoreCase);
    }
}
