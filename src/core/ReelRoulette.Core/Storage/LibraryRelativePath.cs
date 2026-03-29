namespace ReelRoulette.Core.Storage;

/// <summary>
/// Computes media paths relative to a library source root using BCL path APIs (not <see cref="Uri.MakeRelativeUri"/>),
/// and detects legacy relative paths that incorrectly started with parent navigation.
/// </summary>
public static class LibraryRelativePath
{
    /// <summary>
    /// Returns <paramref name="fullPath"/> expressed relative to <paramref name="rootPath"/>, or empty when inputs are unusable.
    /// </summary>
    public static string GetRelativePath(string rootPath, string fullPath)
    {
        if (string.IsNullOrWhiteSpace(rootPath) || string.IsNullOrWhiteSpace(fullPath))
        {
            return string.Empty;
        }

        return Path.GetRelativePath(
            Path.GetFullPath(rootPath.Trim()),
            Path.GetFullPath(fullPath.Trim()));
    }

    /// <summary>
    /// True when the stored relative path begins with a <c>..</c> segment (legacy bug from Uri-based relative computation).
    /// </summary>
    public static bool RelativePathStartsWithParentNavigation(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return false;
        }

        var n = relativePath.Trim().Replace('\\', '/');
        while (n.StartsWith("./", StringComparison.Ordinal))
        {
            n = n[2..];
        }

        return n == ".." || n.StartsWith("../", StringComparison.Ordinal);
    }

    /// <summary>
    /// Computes a relative path from <paramref name="rootPath"/> to <paramref name="fullPath"/> using logical segments only,
    /// so it works when importing a library exported on another OS (Windows drive + backslashes vs POSIX roots + slashes).
    /// Output uses <see cref="Path.DirectorySeparatorChar"/> for the current machine (the import host).
    /// </summary>
    public static bool TryGetCrossPlatformRelativePath(string rootPath, string fullPath, out string relativePath)
    {
        relativePath = string.Empty;
        if (string.IsNullOrWhiteSpace(rootPath) || string.IsNullOrWhiteSpace(fullPath))
        {
            return false;
        }

        if (!TrySplitNormalizedPathSegments(rootPath.Trim(), out var rootSegs, out var rootHadWinDrive) ||
            !TrySplitNormalizedPathSegments(fullPath.Trim(), out var fullSegs, out var fullHadWinDrive))
        {
            return false;
        }

        var windowsStyle = rootHadWinDrive || fullHadWinDrive;
        var comparer = windowsStyle ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

        if (fullSegs.Count < rootSegs.Count)
        {
            return false;
        }

        for (var i = 0; i < rootSegs.Count; i++)
        {
            if (!comparer.Equals(rootSegs[i], fullSegs[i]))
            {
                return false;
            }
        }

        var relSegs = fullSegs.Skip(rootSegs.Count).ToList();
        if (relSegs.Count == 0)
        {
            return false;
        }

        relativePath = string.Join(Path.DirectorySeparatorChar, relSegs);
        return true;
    }

    /// <summary>
    /// Normalizes a stored relative path before joining with a destination library root on the current OS:
    /// maps mixed or foreign separators to <see cref="Path.DirectorySeparatorChar"/>, and strips a stray Windows drive
    /// prefix when running on Unix (common in cross-export <c>relativePath</c> values).
    /// </summary>
    public static string NormalizeRelativeForDestinationRoot(string? relativePath)
    {
        var rel = (relativePath ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(rel))
        {
            return rel;
        }

        if (!OperatingSystem.IsWindows())
        {
            if (rel.Length >= 2 && IsAsciiLetter(rel[0]) && rel[1] == ':')
            {
                rel = rel[2..].TrimStart('/', '\\');
            }
        }

        rel = rel.Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar);

        if (Path.IsPathRooted(rel))
        {
            rel = rel.TrimStart(Path.DirectorySeparatorChar);
            if (OperatingSystem.IsWindows() && rel.Length >= 2 && rel[1] == Path.VolumeSeparatorChar)
            {
                rel = rel[2..].TrimStart(Path.DirectorySeparatorChar);
            }
        }

        return rel;
    }

    /// <summary>
    /// When <paramref name="storedRelativePath"/> has a spurious leading <c>..</c>, recomputes the segment from
    /// <paramref name="oldRoot"/> and <paramref name="oldFullPath"/> using cross-platform segment logic so Windows exports
    /// can be repaired while importing on Linux (and vice versa).
    /// </summary>
    public static bool TryGetLegacyRepairRelativePath(
        string? storedRelativePath,
        string oldRoot,
        string? oldFullPath,
        out string repairedRelativePath)
    {
        repairedRelativePath = string.Empty;
        if (string.IsNullOrWhiteSpace(oldRoot) || string.IsNullOrWhiteSpace(oldFullPath))
        {
            return false;
        }

        if (!RelativePathStartsWithParentNavigation(storedRelativePath))
        {
            return false;
        }

        if (!TryGetCrossPlatformRelativePath(oldRoot, oldFullPath, out var candidate))
        {
            return false;
        }

        if (string.IsNullOrEmpty(candidate))
        {
            return false;
        }

        if (RelativePathStartsWithParentNavigation(candidate))
        {
            return false;
        }

        if (Path.IsPathRooted(candidate))
        {
            return false;
        }

        repairedRelativePath = candidate;
        return true;
    }

    private static bool IsAsciiLetter(char c) =>
        (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

    /// <summary>
    /// Strips an optional Windows drive prefix and UNC prefix, normalizes slashes, splits into path segments.
    /// Returns false for UNC paths or paths containing <c>..</c> segments (reject ambiguous escapes).
    /// </summary>
    private static bool TrySplitNormalizedPathSegments(string path, out List<string> segments, out bool hadWindowsDrive)
    {
        segments = new List<string>();
        hadWindowsDrive = false;
        var s = path.Trim();
        if (s.Length == 0)
        {
            return false;
        }

        if (s.StartsWith("\\\\", StringComparison.Ordinal))
        {
            return false;
        }

        if (s.Length >= 2 && IsAsciiLetter(s[0]) && s[1] == ':')
        {
            hadWindowsDrive = true;
            s = s[2..].TrimStart('/', '\\');
        }

        s = s.Replace('\\', '/');
        while (s.StartsWith('/'))
        {
            s = s[1..];
        }

        foreach (var part in s.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (part == ".")
            {
                continue;
            }

            if (part == "..")
            {
                segments.Clear();
                return false;
            }

            segments.Add(part);
        }

        return true;
    }
}
