using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ReelRoulette.Core.Storage;

namespace ReelRoulette.Server.Services;

public sealed class LibraryExportRequest
{
    public bool IncludeThumbnails { get; set; }
    public bool IncludeBackups { get; set; }
}

public sealed class LibraryImportPlanDto
{
    public Dictionary<string, string>? Remap { get; set; }
    public List<string>? SkippedRoots { get; set; }
}

public sealed class LibraryMigrationImportResult
{
    public bool Accepted { get; set; }
    public string? Message { get; set; }
    public bool RestartRecommended { get; set; }
    public bool NeedsForceConfirmation { get; set; }
}

public sealed class LibraryMigrationService
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly ILogger<LibraryMigrationService> _logger;
    private readonly string _roamingDir;
    private readonly string _thumbnailsDir;
    private readonly string _backupsDir;

    public LibraryMigrationService(ILogger<LibraryMigrationService> logger, string? appDataPathOverride = null)
    {
        _logger = logger;
        var roaming = appDataPathOverride ??
                      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        _roamingDir = roaming;
        Directory.CreateDirectory(_roamingDir);

        var localRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette");
        Directory.CreateDirectory(localRoot);
        _thumbnailsDir = Path.Combine(localRoot, "thumbnails");
        _backupsDir = Path.Combine(_roamingDir, "backups");
    }

    public async Task WriteExportZipAsync(Stream destination, LibraryExportRequest request, CancellationToken cancellationToken)
    {
        var libraryPath = Path.Combine(_roamingDir, "library.json");
        if (!File.Exists(libraryPath))
        {
            throw new InvalidOperationException("No library.json found to export.");
        }

        var libraryText = await File.ReadAllTextAsync(libraryPath, cancellationToken).ConfigureAwait(false);
        var libraryRoot = JsonNode.Parse(libraryText) as JsonObject
                          ?? throw new InvalidOperationException("library.json is not a valid object.");

        var os = RuntimeInformation.OSDescription.Trim();
        var version = typeof(LibraryMigrationService).Assembly.GetName().Version?.ToString() ?? "0";
        var manifestJson = LibraryMigration.BuildExportManifestJson(libraryRoot, os, version);

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

        var corePath = Path.Combine(_roamingDir, "core-settings.json");
        if (File.Exists(corePath))
        {
            AddFileEntry("core-settings.json", corePath);
        }
        else
        {
            AddUtf8Entry("core-settings.json", "{}");
        }

        var presetsPath = Path.Combine(_roamingDir, "presets.json");
        if (File.Exists(presetsPath))
        {
            AddFileEntry("presets.json", presetsPath);
        }
        else
        {
            AddUtf8Entry("presets.json", "[]");
        }

        var desktopSettingsPath = Path.Combine(_roamingDir, "desktop-settings.json");
        if (File.Exists(desktopSettingsPath))
        {
            AddFileEntry("desktop-settings.json", desktopSettingsPath);
        }
        else
        {
            AddUtf8Entry("desktop-settings.json", "{}");
        }

        AddUtf8Entry("export-manifest.json", manifestJson);

        if (request.IncludeThumbnails && Directory.Exists(_thumbnailsDir))
        {
            foreach (var file in Directory.EnumerateFiles(_thumbnailsDir, "*", SearchOption.AllDirectories))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var rel = Path.GetRelativePath(_thumbnailsDir, file).Replace('\\', '/');
                var entryName = "thumbnails/" + rel;
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                await using var fs = File.OpenRead(file);
                await using var es = entry.Open();
                await fs.CopyToAsync(es, cancellationToken).ConfigureAwait(false);
            }
        }

        if (request.IncludeBackups && Directory.Exists(_backupsDir))
        {
            foreach (var file in Directory.EnumerateFiles(_backupsDir, "*", SearchOption.AllDirectories))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var rel = Path.GetRelativePath(_backupsDir, file).Replace('\\', '/');
                var entryName = "backups/" + rel;
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                await using var fs = File.OpenRead(file);
                await using var es = entry.Open();
                await fs.CopyToAsync(es, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    public LibraryMigrationImportResult ImportFromZipStream(
        Stream zipStream,
        LibraryImportPlanDto plan,
        bool force,
        RefreshPipelineService refreshPipeline,
        ServerStateService serverState,
        CoreSettingsService coreSettings)
    {
        if (refreshPipeline.GetStatus().IsRunning)
        {
            return new LibraryMigrationImportResult
            {
                Accepted = false,
                Message = "Library import is not allowed while the refresh pipeline is running."
            };
        }

        var remap = plan.Remap ?? new Dictionary<string, string>(StringComparer.Ordinal);
        var skipped = new HashSet<string>(plan.SkippedRoots ?? [], StringComparer.Ordinal);

        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);

        var names = zip.Entries.Select(e => e.FullName).ToList();
        foreach (var name in names)
        {
            if (!LibraryMigration.IsSafeZipEntryName(name))
            {
                return new LibraryMigrationImportResult
                {
                    Accepted = false,
                    Message = $"Unsafe or invalid zip entry: '{name}'."
                };
            }
        }

        var layoutError = LibraryMigration.ValidateExportZipHasRequiredFiles(names);
        if (layoutError != null)
        {
            return new LibraryMigrationImportResult { Accepted = false, Message = layoutError };
        }

        if (!force && LibraryExistsWithContentOnDisk())
        {
            return new LibraryMigrationImportResult
            {
                Accepted = false,
                NeedsForceConfirmation = true,
                Message = "A non-empty library already exists. Confirm overwrite and retry with force=true."
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
            return new LibraryMigrationImportResult { Accepted = false, Message = ex.Message };
        }

        var libraryRoot = JsonNode.Parse(libraryText) as JsonObject;
        if (libraryRoot == null)
        {
            return new LibraryMigrationImportResult { Accepted = false, Message = "library.json root must be an object." };
        }

        var remapResult = LibraryMigration.ApplySourceRemapping(libraryRoot, remap, skipped);
        if (!remapResult.Success)
        {
            return new LibraryMigrationImportResult { Accepted = false, Message = remapResult.ErrorMessage };
        }

        var updatedLibraryText = libraryRoot.ToJsonString(WebJson);

        var libraryPath = Path.Combine(_roamingDir, "library.json");
        var presetsPath = Path.Combine(_roamingDir, "presets.json");
        var corePath = Path.Combine(_roamingDir, "core-settings.json");

        try
        {
            WriteAllTextAtomic(libraryPath, updatedLibraryText);
            WriteAllTextAtomic(presetsPath, presetsText);
            WriteAllTextAtomic(corePath, coreSettingsText);

            var hasThumbEntries = zip.Entries.Any(e =>
            {
                var n = LibraryMigration.NormalizeZipEntryName(e.FullName);
                return n.StartsWith("thumbnails/", StringComparison.OrdinalIgnoreCase) && !n.EndsWith('/');
            });

            if (hasThumbEntries)
            {
                if (Directory.Exists(_thumbnailsDir))
                {
                    Directory.Delete(_thumbnailsDir, recursive: true);
                }

                Directory.CreateDirectory(_thumbnailsDir);
                ExtractZipPrefix(zip, "thumbnails/", _thumbnailsDir);
            }

            var hasBackupEntries = zip.Entries.Any(e =>
            {
                var n = LibraryMigration.NormalizeZipEntryName(e.FullName);
                return n.StartsWith("backups/", StringComparison.OrdinalIgnoreCase) && !n.EndsWith('/');
            });

            if (hasBackupEntries)
            {
                Directory.CreateDirectory(_backupsDir);
                foreach (var file in Directory.EnumerateFiles(_backupsDir, "*", SearchOption.AllDirectories))
                {
                    File.Delete(file);
                }

                ExtractZipPrefix(zip, "backups/", _backupsDir);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Library import failed while writing files.");
            return new LibraryMigrationImportResult
            {
                Accepted = false,
                Message = $"Import failed: {ex.Message}"
            };
        }

        serverState.ReloadLibraryAndPresetsFromDisk();
        coreSettings.ReloadFromDisk();

        _logger.LogInformation("Library migration import completed; state reloaded from disk.");

        return new LibraryMigrationImportResult
        {
            Accepted = true,
            Message =
                "Import completed. Clients should resync. If listen URL, auth, or WebUI settings changed, restart the server.",
            RestartRecommended = true
        };
    }

    private bool LibraryExistsWithContentOnDisk()
    {
        var libraryPath = Path.Combine(_roamingDir, "library.json");
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
            var n = LibraryMigration.NormalizeZipEntryName(entry.FullName);
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
}
