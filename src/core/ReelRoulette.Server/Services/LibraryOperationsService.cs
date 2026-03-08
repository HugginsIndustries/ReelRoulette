using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Fingerprints;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class LibraryOperationsService
{
    private static readonly string[] VideoExtensions =
    [
        ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".mpg", ".mpeg"
    ];

    private static readonly string[] PhotoExtensions =
    [
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
        ".tiff", ".tif", ".heic", ".heif", ".avif", ".ico", ".svg", ".raw", ".cr2", ".nef", ".orf", ".sr2"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly object _lock = new();
    private readonly string _libraryPath;
    private readonly string _logPath;
    private readonly ILogger<LibraryOperationsService> _logger;

    public LibraryOperationsService(ILogger<LibraryOperationsService>? logger = null, string? appDataPathOverride = null)
    {
        _logger = logger ?? NullLogger<LibraryOperationsService>.Instance;
        var appData = appDataPathOverride ??
                      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(appData);
        _libraryPath = Path.Combine(appData, "library.json");
        _logPath = Path.Combine(appData, "last.log");
    }

    public SourceImportResponse ImportSource(SourceImportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RootPath))
        {
            return new SourceImportResponse { Accepted = false, Message = "rootPath is required." };
        }

        var rootPath = request.RootPath.Trim();
        if (!Directory.Exists(rootPath))
        {
            return new SourceImportResponse { Accepted = false, Message = $"Directory not found: {rootPath}" };
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var sources = EnsureArray(root, "sources");
            var items = EnsureArray(root, "items");

            var source = FindSourceByRootPath(sources, rootPath);
            if (source == null)
            {
                source = new JsonObject
                {
                    ["id"] = Guid.NewGuid().ToString(),
                    ["rootPath"] = rootPath,
                    ["displayName"] = string.IsNullOrWhiteSpace(request.DisplayName)
                        ? Path.GetFileName(rootPath)
                        : request.DisplayName!.Trim(),
                    ["isEnabled"] = true
                };
                sources.Add(source);
            }
            else if (!string.IsNullOrWhiteSpace(request.DisplayName))
            {
                source["displayName"] = request.DisplayName!.Trim();
            }

            var sourceId = source["id"]?.GetValue<string>() ?? string.Empty;
            var allMediaFiles = EnumerateMediaFiles(rootPath).ToList();
            var byPath = items
                .OfType<JsonObject>()
                .Select(item => new
                {
                    Node = item,
                    FullPath = item["fullPath"]?.GetValue<string>()?.Trim()
                })
                .Where(x => !string.IsNullOrWhiteSpace(x.FullPath))
                .ToDictionary(x => x.FullPath!, x => x.Node, StringComparer.OrdinalIgnoreCase);

            var importedCount = 0;
            var updatedCount = 0;
            foreach (var filePath in allMediaFiles)
            {
                if (byPath.TryGetValue(filePath, out var existing))
                {
                    existing["sourceId"] = sourceId;
                    existing["relativePath"] = GetRelativePath(rootPath, filePath);
                    existing["fileName"] = Path.GetFileName(filePath);
                    existing["mediaType"] = ResolveMediaType(filePath);
                    updatedCount++;
                    continue;
                }

                var item = new JsonObject
                {
                    ["id"] = Guid.NewGuid().ToString(),
                    ["sourceId"] = sourceId,
                    ["fullPath"] = filePath,
                    ["relativePath"] = GetRelativePath(rootPath, filePath),
                    ["fileName"] = Path.GetFileName(filePath),
                    ["mediaType"] = ResolveMediaType(filePath),
                    ["isFavorite"] = false,
                    ["isBlacklisted"] = false,
                    ["playCount"] = 0,
                    ["tags"] = new JsonArray(),
                    ["fingerprintAlgorithm"] = "SHA-256",
                    ["fingerprintVersion"] = 1,
                    ["fingerprintStatus"] = "Pending"
                };
                items.Add(item);
                importedCount++;
            }

            SaveLibraryRoot(root);
            return new SourceImportResponse
            {
                Accepted = true,
                ImportedCount = importedCount,
                UpdatedCount = updatedCount,
                SourceId = sourceId,
                Message = "Import completed."
            };
        }
    }

    public JsonObject GetLibraryProjection()
    {
        lock (_lock)
        {
            return LoadLibraryRoot();
        }
    }

    public ClearPlaybackStatsResponse ClearPlaybackStats(ClearPlaybackStatsRequest request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var items = EnsureArray(root, "items").OfType<JsonObject>().ToList();
            var targetPaths = (request.ItemPaths ?? [])
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var clearAll = targetPaths.Count == 0;
            var clearedCount = 0;

            foreach (var item in items)
            {
                var fullPath = item["fullPath"]?.GetValue<string>() ?? string.Empty;
                if (!clearAll && !targetPaths.Contains(fullPath))
                {
                    continue;
                }

                var playCount = item["playCount"]?.GetValue<int?>() ?? 0;
                var hadLastPlayed = item["lastPlayedUtc"] is not null;
                if (playCount == 0 && !hadLastPlayed)
                {
                    continue;
                }

                item["playCount"] = 0;
                item["lastPlayedUtc"] = null;
                clearedCount++;
            }

            if (clearedCount > 0)
            {
                SaveLibraryRoot(root);
            }

            return new ClearPlaybackStatsResponse
            {
                ClearedCount = clearedCount
            };
        }
    }

    public DuplicateScanResponse ScanDuplicates(DuplicateScanRequest request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var items = (root["items"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
            var sources = (root["sources"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];

            IEnumerable<JsonObject> scopeItems = items;
            if (request.Scope == "CurrentSource" && !string.IsNullOrWhiteSpace(request.SourceId))
            {
                scopeItems = scopeItems.Where(item =>
                    string.Equals(item["sourceId"]?.GetValue<string>(), request.SourceId, StringComparison.OrdinalIgnoreCase));
            }
            else if (request.Scope == "AllEnabledSources")
            {
                var enabledIds = sources
                    .Where(source => source["isEnabled"]?.GetValue<bool?>() != false)
                    .Select(source => source["id"]?.GetValue<string>())
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                scopeItems = scopeItems.Where(item => enabledIds.Contains(item["sourceId"]?.GetValue<string>() ?? string.Empty));
            }

            var list = scopeItems.ToList();
            var excludedPending = list.Count(item => string.Equals(item["fingerprintStatus"]?.GetValue<string>(), "Pending", StringComparison.OrdinalIgnoreCase));
            var excludedFailed = list.Count(item => string.Equals(item["fingerprintStatus"]?.GetValue<string>(), "Failed", StringComparison.OrdinalIgnoreCase));
            var excludedStale = list.Count(item => string.Equals(item["fingerprintStatus"]?.GetValue<string>(), "Stale", StringComparison.OrdinalIgnoreCase));

            var readyItems = list
                .Where(item =>
                    string.Equals(item["fingerprintStatus"]?.GetValue<string>(), "Ready", StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(item["fingerprint"]?.GetValue<string>()))
                .ToList();

            var candidateItems = readyItems.Select(item => new FingerprintDuplicateItem
            {
                ItemId = item["id"]?.GetValue<string>() ?? string.Empty,
                Fingerprint = item["fingerprint"]?.GetValue<string>() ?? string.Empty,
                IsReady = true
            });
            var groups = FingerprintDuplicateHelper.BuildExactDuplicateGroups(candidateItems);

            var responseGroups = groups.Select(group =>
            {
                var responseGroup = new DuplicateGroupResponse
                {
                    Fingerprint = group.Fingerprint
                };

                foreach (var itemId in group.ItemIds)
                {
                    var item = readyItems.FirstOrDefault(entry =>
                        string.Equals(entry["id"]?.GetValue<string>(), itemId, StringComparison.OrdinalIgnoreCase));
                    if (item == null)
                    {
                        continue;
                    }

                    responseGroup.Items.Add(new DuplicateGroupItemResponse
                    {
                        ItemId = itemId,
                        FullPath = item["fullPath"]?.GetValue<string>() ?? string.Empty,
                        SourceId = item["sourceId"]?.GetValue<string>() ?? string.Empty,
                        IsFavorite = item["isFavorite"]?.GetValue<bool?>() ?? false,
                        IsBlacklisted = item["isBlacklisted"]?.GetValue<bool?>() ?? false,
                        PlayCount = item["playCount"]?.GetValue<int?>() ?? 0
                    });
                }

                return responseGroup;
            }).ToList();

            return new DuplicateScanResponse
            {
                Groups = responseGroups,
                ExcludedPending = excludedPending,
                ExcludedFailed = excludedFailed,
                ExcludedStale = excludedStale
            };
        }
    }

    public DuplicateApplyResponse ApplyDuplicateSelection(DuplicateApplyRequest request)
    {
        var response = new DuplicateApplyResponse();
        if (request.Selections.Count == 0)
        {
            return response;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var items = EnsureArray(root, "items");
            var itemNodes = items.OfType<JsonObject>().ToList();

            foreach (var selection in request.Selections)
            {
                if (string.IsNullOrWhiteSpace(selection.KeepItemId) || selection.ItemIds.Count == 0)
                {
                    continue;
                }

                var matched = itemNodes.Where(item =>
                    selection.ItemIds.Any(id => string.Equals(id, item["id"]?.GetValue<string>(), StringComparison.OrdinalIgnoreCase)))
                    .ToList();
                var keep = matched.FirstOrDefault(item =>
                    string.Equals(item["id"]?.GetValue<string>(), selection.KeepItemId, StringComparison.OrdinalIgnoreCase));
                if (keep == null)
                {
                    continue;
                }

                foreach (var item in matched)
                {
                    var itemId = item["id"]?.GetValue<string>() ?? string.Empty;
                    if (string.Equals(itemId, selection.KeepItemId, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var fullPath = item["fullPath"]?.GetValue<string>() ?? string.Empty;
                    try
                    {
                        if (File.Exists(fullPath))
                        {
                            File.Delete(fullPath);
                            response.DeletedOnDisk++;
                        }
                        else
                        {
                            response.Failures.Add(new DuplicateApplyFailure { FullPath = fullPath, Reason = "File not found" });
                            continue;
                        }

                        items.Remove(item);
                        response.RemovedFromLibrary++;
                    }
                    catch (Exception ex)
                    {
                        response.Failures.Add(new DuplicateApplyFailure { FullPath = fullPath, Reason = ex.Message });
                    }
                }
            }

            SaveLibraryRoot(root);
        }

        return response;
    }

    public AutoTagScanResponse ScanAutoTags(AutoTagScanRequest request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var tags = (root["tags"] as JsonArray)?.OfType<JsonObject>()
                .Select(tag => tag["name"]?.GetValue<string>()?.Trim())
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                .ToList() ?? [];

            var allItems = (root["items"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
            var selectedSet = (request.ItemIds ?? [])
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var scanItems = request.ScanFullLibrary || selectedSet.Count == 0
                ? allItems
                : allItems.Where(item => selectedSet.Contains(item["fullPath"]?.GetValue<string>() ?? string.Empty)).ToList();

            var response = new AutoTagScanResponse();
            foreach (var tagName in tags)
            {
                var matches = scanItems
                    .Where(item => ItemMatchesTag(item, tagName))
                    .ToList();
                if (matches.Count == 0)
                {
                    continue;
                }

                var row = new AutoTagMatchRowResponse
                {
                    TagName = tagName,
                    TotalMatchedCount = matches.Count,
                    WouldChangeCount = matches.Count(item => !ItemHasTag(item, tagName))
                };

                foreach (var item in matches)
                {
                    var fullPath = item["fullPath"]?.GetValue<string>() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(fullPath))
                    {
                        continue;
                    }

                    row.Files.Add(new AutoTagMatchedFileResponse
                    {
                        FullPath = fullPath,
                        DisplayPath = item["relativePath"]?.GetValue<string>() ?? fullPath,
                        NeedsChange = !ItemHasTag(item, tagName)
                    });
                }

                if (row.Files.Count > 0)
                {
                    response.Rows.Add(row);
                }
            }

            return response;
        }
    }

    public AutoTagApplyResponse ApplyAutoTags(AutoTagApplyRequest request)
    {
        var response = new AutoTagApplyResponse();
        if (request.Assignments.Count == 0)
        {
            return response;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var items = (root["items"] as JsonArray)?.OfType<JsonObject>().ToList() ?? [];
            var tags = EnsureArray(root, "tags");

            foreach (var assignment in request.Assignments)
            {
                if (string.IsNullOrWhiteSpace(assignment.TagName))
                {
                    continue;
                }

                EnsureTagExists(tags, assignment.TagName.Trim());
                foreach (var itemPath in assignment.ItemPaths)
                {
                    var item = items.FirstOrDefault(candidate =>
                        string.Equals(candidate["fullPath"]?.GetValue<string>(), itemPath, StringComparison.OrdinalIgnoreCase));
                    if (item == null)
                    {
                        continue;
                    }

                    var itemTags = EnsureArray(item, "tags");
                    if (itemTags.Any(tag => string.Equals(tag?.GetValue<string>(), assignment.TagName, StringComparison.OrdinalIgnoreCase)))
                    {
                        continue;
                    }

                    itemTags.Add(assignment.TagName);
                    response.AssignmentsAdded++;
                    response.ChangedItemPaths.Add(itemPath);
                }
            }

            response.ChangedItemPaths = response.ChangedItemPaths
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            SaveLibraryRoot(root);
        }

        return response;
    }

    public void AppendClientLog(ClientLogRequest request)
    {
        var source = string.IsNullOrWhiteSpace(request.Source) ? "client" : request.Source.Trim();
        var level = string.IsNullOrWhiteSpace(request.Level) ? "info" : request.Level.Trim().ToLowerInvariant();
        var message = (request.Message ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        try
        {
            File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{source}] [{level}] {message}{Environment.NewLine}");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to append client log.");
        }
    }

    private JsonObject LoadLibraryRoot()
    {
        if (!File.Exists(_libraryPath))
        {
            return new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray(),
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            };
        }

        try
        {
            return JsonNode.Parse(File.ReadAllText(_libraryPath)) as JsonObject ?? new JsonObject();
        }
        catch
        {
            return new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["items"] = new JsonArray(),
                ["tags"] = new JsonArray(),
                ["categories"] = new JsonArray()
            };
        }
    }

    private void SaveLibraryRoot(JsonObject root)
    {
        File.WriteAllText(_libraryPath, root.ToJsonString(JsonOptions));
    }

    private static JsonArray EnsureArray(JsonObject root, string propertyName)
    {
        if (root[propertyName] is JsonArray existing)
        {
            return existing;
        }

        var created = new JsonArray();
        root[propertyName] = created;
        return created;
    }

    private static JsonObject? FindSourceByRootPath(JsonArray sources, string rootPath)
    {
        return sources
            .OfType<JsonObject>()
            .FirstOrDefault(source => string.Equals(source["rootPath"]?.GetValue<string>()?.Trim(), rootPath, StringComparison.OrdinalIgnoreCase));
    }

    private static IEnumerable<string> EnumerateMediaFiles(string rootPath)
    {
        var allFiles = Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories);
        foreach (var file in allFiles)
        {
            var extension = Path.GetExtension(file).ToLowerInvariant();
            if (VideoExtensions.Contains(extension) || PhotoExtensions.Contains(extension))
            {
                yield return file;
            }
        }
    }

    private static string ResolveMediaType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        return VideoExtensions.Contains(extension) ? "Video" : "Photo";
    }

    private static string GetRelativePath(string rootPath, string fullPath)
    {
        var rootUri = new Uri(Path.GetFullPath(rootPath) + Path.DirectorySeparatorChar);
        var fileUri = new Uri(Path.GetFullPath(fullPath));
        var relativeUri = rootUri.MakeRelativeUri(fileUri);
        return Uri.UnescapeDataString(relativeUri.ToString().Replace('/', Path.DirectorySeparatorChar));
    }

    private static bool ItemMatchesTag(JsonObject item, string tagName)
    {
        if (string.IsNullOrWhiteSpace(tagName))
        {
            return false;
        }

        var fileName = item["fileName"]?.GetValue<string>() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = Path.GetFileName(item["fullPath"]?.GetValue<string>() ?? string.Empty);
        }

        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
        if (!string.IsNullOrWhiteSpace(fileNameWithoutExtension) &&
            fileNameWithoutExtension.Contains(tagName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var relativePath = item["relativePath"]?.GetValue<string>() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(relativePath) &&
            relativePath.Replace('\\', '/').Contains(tagName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var fullPath = item["fullPath"]?.GetValue<string>() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(fullPath) &&
               fullPath.Replace('\\', '/').Contains(tagName, StringComparison.OrdinalIgnoreCase);
    }

    private static bool ItemHasTag(JsonObject item, string tagName)
    {
        if (item["tags"] is not JsonArray tags)
        {
            return false;
        }

        return tags.Any(tag => string.Equals(tag?.GetValue<string>(), tagName, StringComparison.OrdinalIgnoreCase));
    }

    private static void EnsureTagExists(JsonArray tags, string tagName)
    {
        if (tags.OfType<JsonObject>().Any(tag =>
                string.Equals(tag["name"]?.GetValue<string>(), tagName, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        tags.Add(new JsonObject
        {
            ["name"] = tagName,
            ["categoryId"] = "uncategorized"
        });
    }
}
