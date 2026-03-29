using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ReelRoulette.LibraryArchive;

/// <summary>
/// Roaming config root, local thumbnails dir, and roaming backups dir (same layout as the core server used historically).
/// Paths match <c>%AppData%\ReelRoulette</c>, <c>%LocalAppData%\ReelRoulette\thumbnails</c>, and roaming <c>backups</c>.
/// </summary>
public readonly record struct LibraryArchiveDataPaths(string RoamingDirectory, string ThumbnailsDirectory, string BackupsDirectory)
{
    public static LibraryArchiveDataPaths CreateDefault()
    {
        var roaming = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        var thumbs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette", "thumbnails");
        return new LibraryArchiveDataPaths(roaming, thumbs, Path.Combine(roaming, "backups"));
    }
}

/// <summary>
/// Desktop-local library export/import (zip layout, manifest, remap, disk I/O under the roaming ReelRoulette folder).
/// </summary>
public static class LibraryArchiveMigration
{
    public const int ExportManifestFormatVersion = 1;

    public static readonly JsonSerializerOptions ManifestJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static string RoamingRoot =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");

    public static string ThumbnailsDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette", "thumbnails");

    public static string BackupsDirectory => Path.Combine(RoamingRoot, "backups");

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

    public static LibraryArchiveRemapResult ApplySourceRemapping(
        JsonObject libraryRoot,
        IReadOnlyDictionary<string, string> remapByOldRoot,
        IReadOnlySet<string> skippedRoots)
    {
        var sources = libraryRoot["sources"] as JsonArray;
        if (sources == null)
        {
            return LibraryArchiveRemapResult.Fail("library.sources is missing or not an array.");
        }

        var items = libraryRoot["items"] as JsonArray;
        if (items == null)
        {
            return LibraryArchiveRemapResult.Fail("library.items is missing or not an array.");
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

            return LibraryArchiveRemapResult.Fail(
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
                return LibraryArchiveRemapResult.Fail($"Item references unknown sourceId '{sourceId}'.");
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
                return LibraryArchiveRemapResult.Fail(
                    $"Item for remapped source '{sourceId}' is missing relativePath.");
            }

            try
            {
                itemNode["fullPath"] = CombineRootAndRelative(newRoot, relativePath);
            }
            catch (ArgumentException ex)
            {
                return LibraryArchiveRemapResult.Fail(ex.Message);
            }
        }

        return LibraryArchiveRemapResult.Ok();
    }

    public static string NormalizeZipEntryName(string entryName)
    {
        var s = (entryName ?? string.Empty).Replace('\\', '/').Trim();
        while (s.StartsWith("./", StringComparison.Ordinal))
        {
            s = s[2..];
        }

        return s;
    }

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

    public static bool LibraryExistsWithContentOnDisk(string roamingDirectory)
    {
        var libraryPath = Path.Combine(roamingDirectory, "library.json");
        if (!File.Exists(libraryPath))
        {
            return false;
        }

        try
        {
            var root = JsonNode.Parse(File.ReadAllText(libraryPath)) as JsonObject;
            if (root == null)
            {
                return false;
            }

            var sources = root["sources"] as JsonArray;
            var items = root["items"] as JsonArray;
            var sourceCount = sources?.Count ?? 0;
            var itemCount = items?.Count ?? 0;
            return sourceCount > 0 || itemCount > 0;
        }
        catch
        {
            return false;
        }
    }

    public static async Task WriteExportZipAsync(
        Stream destination,
        bool includeThumbnails,
        bool includeBackups,
        CancellationToken cancellationToken = default,
        LibraryArchiveDataPaths? paths = null)
    {
        var p = paths ?? LibraryArchiveDataPaths.CreateDefault();
        var roamingDir = p.RoamingDirectory;
        var thumbnailsDir = p.ThumbnailsDirectory;
        var backupsDir = p.BackupsDirectory;

        var libraryPath = Path.Combine(roamingDir, "library.json");
        if (!File.Exists(libraryPath))
        {
            throw new InvalidOperationException("No library.json found to export.");
        }

        var libraryText = await File.ReadAllTextAsync(libraryPath, cancellationToken).ConfigureAwait(false);
        var libraryRoot = JsonNode.Parse(libraryText) as JsonObject
                          ?? throw new InvalidOperationException("library.json is not a valid object.");

        var os = RuntimeInformation.OSDescription.Trim();
        var version = typeof(LibraryArchiveMigration).Assembly.GetName().Version?.ToString() ?? "0";
        var manifestJson = BuildExportManifestJson(libraryRoot, os, version);

        await using var archive = new ZipArchive(destination, ZipArchiveMode.Create, leaveOpen: true);

        void AddUtf8Entry(string entryName, string content)
        {
            var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
            using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            writer.Write(content);
        }

        void AddFileEntry(string entryName, string diskPath)
        {
            var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
            using var fs = File.OpenRead(diskPath);
            using var es = entry.Open();
            fs.CopyTo(es);
        }

        AddFileEntry("library.json", libraryPath);

        var corePath = Path.Combine(roamingDir, "core-settings.json");
        if (File.Exists(corePath))
        {
            AddFileEntry("core-settings.json", corePath);
        }
        else
        {
            AddUtf8Entry("core-settings.json", "{}");
        }

        var presetsPath = Path.Combine(roamingDir, "presets.json");
        if (File.Exists(presetsPath))
        {
            AddFileEntry("presets.json", presetsPath);
        }
        else
        {
            AddUtf8Entry("presets.json", "[]");
        }

        var desktopSettingsPath = Path.Combine(roamingDir, "desktop-settings.json");
        if (File.Exists(desktopSettingsPath))
        {
            AddFileEntry("desktop-settings.json", desktopSettingsPath);
        }
        else
        {
            AddUtf8Entry("desktop-settings.json", "{}");
        }

        AddUtf8Entry("export-manifest.json", manifestJson);

        if (includeThumbnails && Directory.Exists(thumbnailsDir))
        {
            foreach (var file in Directory.EnumerateFiles(thumbnailsDir, "*", SearchOption.AllDirectories))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var rel = Path.GetRelativePath(thumbnailsDir, file).Replace('\\', '/');
                var entryName = "thumbnails/" + rel;
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                await using var fs = File.OpenRead(file);
                await using var es = entry.Open();
                await fs.CopyToAsync(es, cancellationToken).ConfigureAwait(false);
            }
        }

        if (includeBackups && Directory.Exists(backupsDir))
        {
            foreach (var file in Directory.EnumerateFiles(backupsDir, "*", SearchOption.AllDirectories))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var rel = Path.GetRelativePath(backupsDir, file).Replace('\\', '/');
                var entryName = "backups/" + rel;
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                await using var fs = File.OpenRead(file);
                await using var es = entry.Open();
                await fs.CopyToAsync(es, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    public static LibraryArchiveImportResult ImportFromZipStream(
        Stream zipStream,
        IReadOnlyDictionary<string, string> remap,
        IReadOnlySet<string> skippedRoots,
        bool force,
        LibraryArchiveDataPaths? paths = null)
    {
        var p = paths ?? LibraryArchiveDataPaths.CreateDefault();
        var roamingDir = p.RoamingDirectory;
        var thumbnailsDir = p.ThumbnailsDirectory;
        var backupsDir = p.BackupsDirectory;

        var remapDict = new Dictionary<string, string>(remap, StringComparer.Ordinal);
        var skipped = new HashSet<string>(skippedRoots, StringComparer.Ordinal);

        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);

        var names = zip.Entries.Select(e => e.FullName).ToList();
        foreach (var name in names)
        {
            if (!IsSafeZipEntryName(name))
            {
                return new LibraryArchiveImportResult
                {
                    Accepted = false,
                    Message = $"Unsafe or invalid zip entry: '{name}'."
                };
            }
        }

        var layoutError = ValidateExportZipHasRequiredFiles(names);
        if (layoutError != null)
        {
            return new LibraryArchiveImportResult { Accepted = false, Message = layoutError };
        }

        if (!force && LibraryExistsWithContentOnDisk(roamingDir))
        {
            return new LibraryArchiveImportResult
            {
                Accepted = false,
                NeedsForceConfirmation = true,
                Message = "A non-empty library already exists. Confirm overwrite to replace it."
            };
        }

        static string ReadEntryText(ZipArchive z, string rootFileName)
        {
            var entry = z.GetEntry(rootFileName) ?? z.GetEntry(rootFileName.Replace('/', '\\'));
            if (entry == null)
            {
                throw new InvalidOperationException($"Missing zip entry '{rootFileName}'.");
            }

            using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
            return reader.ReadToEnd();
        }

        string libraryText;
        string presetsText;
        string coreSettingsText;
        try
        {
            libraryText = ReadEntryText(zip, "library.json");
            presetsText = ReadEntryText(zip, "presets.json");
            coreSettingsText = ReadEntryText(zip, "core-settings.json");
            _ = ReadEntryText(zip, "desktop-settings.json");
        }
        catch (Exception ex)
        {
            return new LibraryArchiveImportResult { Accepted = false, Message = ex.Message };
        }

        var libraryRoot = JsonNode.Parse(libraryText) as JsonObject;
        if (libraryRoot == null)
        {
            return new LibraryArchiveImportResult { Accepted = false, Message = "library.json root must be an object." };
        }

        var remapResult = ApplySourceRemapping(libraryRoot, remapDict, skipped);
        if (!remapResult.Success)
        {
            return new LibraryArchiveImportResult { Accepted = false, Message = remapResult.ErrorMessage };
        }

        var updatedLibraryText = libraryRoot.ToJsonString(WebJson);

        var libraryPath = Path.Combine(roamingDir, "library.json");
        var presetsPath = Path.Combine(roamingDir, "presets.json");
        var corePath = Path.Combine(roamingDir, "core-settings.json");

        try
        {
            WriteAllTextAtomic(libraryPath, updatedLibraryText);
            WriteAllTextAtomic(presetsPath, presetsText);
            WriteAllTextAtomic(corePath, coreSettingsText);

            var hasThumbEntries = zip.Entries.Any(e =>
            {
                var n = NormalizeZipEntryName(e.FullName);
                return n.StartsWith("thumbnails/", StringComparison.OrdinalIgnoreCase) && !n.EndsWith('/');
            });

            if (hasThumbEntries)
            {
                if (Directory.Exists(thumbnailsDir))
                {
                    Directory.Delete(thumbnailsDir, recursive: true);
                }

                Directory.CreateDirectory(thumbnailsDir);
                ExtractZipPrefix(zip, "thumbnails/", thumbnailsDir);
            }

            var hasBackupEntries = zip.Entries.Any(e =>
            {
                var n = NormalizeZipEntryName(e.FullName);
                return n.StartsWith("backups/", StringComparison.OrdinalIgnoreCase) && !n.EndsWith('/');
            });

            if (hasBackupEntries)
            {
                Directory.CreateDirectory(backupsDir);
                foreach (var file in Directory.EnumerateFiles(backupsDir, "*", SearchOption.AllDirectories))
                {
                    File.Delete(file);
                }

                ExtractZipPrefix(zip, "backups/", backupsDir);
            }
        }
        catch (Exception ex)
        {
            return new LibraryArchiveImportResult
            {
                Accepted = false,
                Message = $"Import failed: {ex.Message}"
            };
        }

        return new LibraryArchiveImportResult
        {
            Accepted = true,
            Message =
                "Import completed. Start or restart the ReelRoulette server and resync this app to load the new library.",
            RestartRecommended = true
        };
    }

    public static string CombineRootAndRelative(string newRoot, string relativePath)
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

    private static void WriteAllTextAtomic(string path, string content)
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var temp = path + ".tmp." + Guid.NewGuid().ToString("N");
        File.WriteAllText(temp, content);
        if (File.Exists(path))
        {
            File.Replace(temp, path, destinationBackupFileName: null);
        }
        else
        {
            File.Move(temp, path);
        }
    }

    private static void ExtractZipPrefix(ZipArchive zip, string prefix, string destRoot)
    {
        prefix = prefix.Replace('\\', '/');
        if (!prefix.EndsWith('/'))
        {
            prefix += "/";
        }

        foreach (var entry in zip.Entries)
        {
            var n = NormalizeZipEntryName(entry.FullName);
            if (string.IsNullOrEmpty(n) || n.EndsWith('/'))
            {
                continue;
            }

            if (!n.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var rel = n[prefix.Length..];
            if (string.IsNullOrEmpty(rel))
            {
                continue;
            }

            var destPath = Path.Combine(destRoot, rel.Replace('/', Path.DirectorySeparatorChar));
            var destDir = Path.GetDirectoryName(destPath);
            if (!string.IsNullOrEmpty(destDir))
            {
                Directory.CreateDirectory(destDir);
            }

            using var input = entry.Open();
            using var output = File.Create(destPath);
            input.CopyTo(output);
        }
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

public readonly struct LibraryArchiveRemapResult
{
    public bool Success { get; init; }
    public string? ErrorMessage { get; init; }

    public static LibraryArchiveRemapResult Ok() => new() { Success = true };

    public static LibraryArchiveRemapResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };
}

public sealed class LibraryArchiveImportResult
{
    public bool Accepted { get; set; }
    public string? Message { get; set; }
    public bool RestartRecommended { get; set; }
    public bool NeedsForceConfirmation { get; set; }
}
