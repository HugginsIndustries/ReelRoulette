using System.Text.Json;
using System.Text.Json.Nodes;

namespace ReelRoulette.Core.Storage;

/// <summary>
/// Pure helpers for cross-platform library export/import (zip layout, manifest, path remapping).
/// </summary>
public static class LibraryMigration
{
    public const int ExportManifestFormatVersion = 1;

    public static readonly JsonSerializerOptions ManifestJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    /// <summary>
    /// Distinct non-empty <c>sources[].rootPath</c> values (trimmed), stable sort for UI.
    /// </summary>
    public static IReadOnlyList<string> CollectUniqueSourceRootPaths(JsonObject libraryRoot)
    {
        var sources = libraryRoot["sources"] as JsonArray;
        if (sources == null)
        {
            return Array.Empty<string>();
        }

        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in sources.OfType<JsonObject>())
        {
            var root = node["rootPath"]?.GetValue<string>()?.Trim();
            if (!string.IsNullOrEmpty(root))
            {
                set.Add(root);
            }
        }

        var list = set.ToList();
        list.Sort(StringComparer.Ordinal);
        return list;
    }

    /// <summary>
    /// Builds <c>export-manifest.json</c> body.
    /// </summary>
    public static string BuildExportManifestJson(JsonObject libraryRoot, string sourceOs, string appVersion)
    {
        var roots = CollectUniqueSourceRootPaths(libraryRoot);
        var manifest = new ExportManifestDto
        {
            FormatVersion = ExportManifestFormatVersion,
            SourceOs = sourceOs,
            AppVersion = appVersion,
            SourceRootPaths = roots.ToList()
        };
        return JsonSerializer.Serialize(manifest, ManifestJsonOptions);
    }

    /// <summary>
    /// Applies remapping in-place. Each source <c>rootPath</c> must appear in <paramref name="skippedRoots"/> or as a key in <paramref name="remapByOldRoot"/>.
    /// </summary>
    public static LibraryMigrationRemapResult ApplySourceRemapping(
        JsonObject libraryRoot,
        IReadOnlyDictionary<string, string> remapByOldRoot,
        IReadOnlySet<string> skippedRoots)
    {
        var sources = libraryRoot["sources"] as JsonArray;
        if (sources == null)
        {
            return LibraryMigrationRemapResult.Fail("library.sources is missing or not an array.");
        }

        var items = libraryRoot["items"] as JsonArray;
        if (items == null)
        {
            return LibraryMigrationRemapResult.Fail("library.items is missing or not an array.");
        }

        var sourceIdToOldRoot = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var sourceIdSkipped = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var sourceIdNewRoot = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var node in sources.OfType<JsonObject>())
        {
            var id = node["id"]?.GetValue<string>()?.Trim();
            var oldRoot = node["rootPath"]?.GetValue<string>()?.Trim();
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(oldRoot))
            {
                continue;
            }

            sourceIdToOldRoot[id] = oldRoot;

            if (skippedRoots.Contains(oldRoot))
            {
                sourceIdSkipped.Add(id);
                continue;
            }

            if (remapByOldRoot.TryGetValue(oldRoot, out var newRoot) && !string.IsNullOrWhiteSpace(newRoot))
            {
                var trimmedNew = newRoot.Trim();
                node["rootPath"] = trimmedNew;
                sourceIdNewRoot[id] = trimmedNew;
                continue;
            }

            return LibraryMigrationRemapResult.Fail(
                $"Source root path is neither skipped nor remapped: '{oldRoot}' (source id '{id}').");
        }

        foreach (var itemNode in items.OfType<JsonObject>())
        {
            var sourceId = itemNode["sourceId"]?.GetValue<string>()?.Trim();
            if (string.IsNullOrWhiteSpace(sourceId))
            {
                continue;
            }

            if (!sourceIdToOldRoot.TryGetValue(sourceId, out _))
            {
                return LibraryMigrationRemapResult.Fail($"Item references unknown sourceId '{sourceId}'.");
            }

            if (sourceIdSkipped.Contains(sourceId))
            {
                continue;
            }

            if (!sourceIdNewRoot.TryGetValue(sourceId, out var newRoot))
            {
                continue;
            }

            var relativePath = itemNode["relativePath"]?.GetValue<string>()?.Trim();
            if (string.IsNullOrWhiteSpace(relativePath))
            {
                return LibraryMigrationRemapResult.Fail(
                    $"Item for remapped source '{sourceId}' is missing relativePath.");
            }

            try
            {
                itemNode["fullPath"] = CombineRootAndRelative(newRoot, relativePath);
            }
            catch (ArgumentException ex)
            {
                return LibraryMigrationRemapResult.Fail(ex.Message);
            }
        }

        return LibraryMigrationRemapResult.Ok();
    }

    /// <summary>
    /// Normalizes zip entry names for comparison (forward slashes, no leading ./).
    /// </summary>
    public static string NormalizeZipEntryName(string entryName)
    {
        var s = (entryName ?? string.Empty).Replace('\\', '/').Trim();
        while (s.StartsWith("./", StringComparison.Ordinal))
        {
            s = s[2..];
        }

        // Do not strip a leading '/' — absolute zip entries must stay rooted for IsPathRooted checks.
        return s;
    }

    /// <summary>
    /// Rejects absolute paths, empty names, and path segments of <c>..</c> (zip-slip).
    /// </summary>
    public static bool IsSafeZipEntryName(string entryName)
    {
        var normalized = NormalizeZipEntryName(entryName);
        if (string.IsNullOrEmpty(normalized))
        {
            return false;
        }

        if (Path.IsPathRooted(normalized))
        {
            return false;
        }

        // Windows: rooted like "C:/x"
        if (normalized.Length >= 2 && char.IsLetter(normalized[0]) && normalized[1] == ':')
        {
            return false;
        }

        foreach (var segment in normalized.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (segment == "..")
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Returns null if the zip contains every required file at the archive root; otherwise an error message.
    /// Root means normalized entry name has no '/' (e.g. exactly <c>library.json</c>).
    /// </summary>
    public static string? ValidateExportZipHasRequiredFiles(IEnumerable<string> rawEntryNames)
    {
        var atRoot = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in rawEntryNames)
        {
            var n = NormalizeZipEntryName(raw);
            if (string.IsNullOrEmpty(n))
            {
                continue;
            }

            if (n.EndsWith('/'))
            {
                continue;
            }

            if (n.Contains("/", StringComparison.Ordinal))
            {
                continue;
            }

            atRoot.Add(n);
        }

        string[] required =
        [
            "library.json",
            "core-settings.json",
            "presets.json",
            "desktop-settings.json",
            "export-manifest.json"
        ];

        foreach (var r in required)
        {
            if (!atRoot.Contains(r))
            {
                return $"Archive is missing required root file '{r}'.";
            }
        }

        return null;
    }

    internal static string CombineRootAndRelative(string newRoot, string relativePath)
    {
        var root = (newRoot ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(root))
        {
            throw new ArgumentException("New root path is empty.", nameof(newRoot));
        }

        var rel = (relativePath ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(rel))
        {
            throw new ArgumentException("Relative path is empty.", nameof(relativePath));
        }

        rel = rel.Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar);
        if (Path.IsPathRooted(rel))
        {
            rel = rel.TrimStart(Path.DirectorySeparatorChar);
            if (Path.VolumeSeparatorChar == ':' && rel.Length >= 2 && rel[1] == ':')
            {
                rel = rel[2..].TrimStart(Path.DirectorySeparatorChar);
            }
        }

        var combined = Path.GetFullPath(Path.Combine(root, rel));
        var rootFull = Path.GetFullPath(root);
        if (!combined.StartsWith(rootFull, PathInternal.StringComparison))
        {
            throw new ArgumentException("Resolved path escapes the destination root.");
        }

        return combined;
    }

    private static class PathInternal
    {
        public static readonly StringComparison StringComparison =
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
    }

    public sealed class ExportManifestDto
    {
        public int FormatVersion { get; set; }
        public string SourceOs { get; set; } = "";
        public string AppVersion { get; set; } = "";
        public List<string> SourceRootPaths { get; set; } = [];
    }
}

public readonly struct LibraryMigrationRemapResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }

    public static LibraryMigrationRemapResult Ok() => new() { Success = true };

    public static LibraryMigrationRemapResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };
}
