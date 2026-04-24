using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Fingerprints;
using ReelRoulette.Core.Storage;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class LibraryOperationsService
{
    private const string UncategorizedCategoryId = "uncategorized";
    private const string UncategorizedCategoryName = "Uncategorized";
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
    private readonly string _coreSettingsPath;
    private readonly string _backupDirectory;
    private readonly string _logPath;
    private readonly ILogger<LibraryOperationsService> _logger;

    public LibraryOperationsService(ILogger<LibraryOperationsService>? logger = null, string? appDataPathOverride = null)
    {
        _logger = logger ?? NullLogger<LibraryOperationsService>.Instance;
        var appData = appDataPathOverride ??
                      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(appData);
        _libraryPath = Path.Combine(appData, "library.json");
        _coreSettingsPath = Path.Combine(appData, "core-settings.json");
        _backupDirectory = Path.Combine(appData, "backups");
        _logPath = Path.Combine(appData, "last.log");
        CreateLibraryBackupIfNeeded();
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

    public LibraryStatsResponse GetLibraryStats()
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var sourceNodes = EnsureArray(root, "sources").OfType<JsonObject>().ToList();
            var itemNodes = EnsureArray(root, "items").OfType<JsonObject>().ToList();

            var totalVideos = 0;
            var totalPhotos = 0;
            var favorites = 0;
            var blacklisted = 0;
            var uniquePlayedVideos = 0;
            var uniquePlayedPhotos = 0;
            var uniquePlayedMedia = 0;
            var totalPlays = 0;
            var videosWithAudio = 0;
            var videosWithoutAudio = 0;

            foreach (var item in itemNodes)
            {
                var isVideo = IsVideoItem(item);
                if (isVideo)
                {
                    totalVideos++;
                    if (item["hasAudio"] is not null)
                    {
                        if (GetNodeBool(item["hasAudio"], defaultValue: false))
                        {
                            videosWithAudio++;
                        }
                        else
                        {
                            videosWithoutAudio++;
                        }
                    }
                }
                else
                {
                    totalPhotos++;
                }

                if (GetNodeBool(item["isFavorite"], defaultValue: false))
                {
                    favorites++;
                }

                if (GetNodeBool(item["isBlacklisted"], defaultValue: false))
                {
                    blacklisted++;
                }

                var playCount = Math.Max(0, GetNodeInt(item["playCount"], defaultValue: 0));
                totalPlays += playCount;
                if (playCount > 0)
                {
                    uniquePlayedMedia++;
                    if (isVideo)
                    {
                        uniquePlayedVideos++;
                    }
                    else
                    {
                        uniquePlayedPhotos++;
                    }
                }
            }

            var sourceStats = new List<SourceStatsResponse>();
            foreach (var source in sourceNodes)
            {
                var sourceId = GetNodeString(source["id"]);
                if (string.IsNullOrWhiteSpace(sourceId))
                {
                    continue;
                }

                var sourceItems = itemNodes
                    .Where(item => ItemBelongsToSource(item, sourceId, GetNodeString(source["rootPath"])))
                    .ToList();
                var sourceVideos = sourceItems
                    .Where(IsVideoItem)
                    .ToList();

                var totalDurationTicks = sourceVideos
                    .Select(video => TryGetNodeTimeSpan(video["duration"]))
                    .Where(duration => duration.HasValue)
                    .Select(duration => duration!.Value.Ticks)
                    .DefaultIfEmpty(0L)
                    .Sum();

                var videosWithDuration = sourceVideos
                    .Select(video => TryGetNodeTimeSpan(video["duration"]))
                    .Where(duration => duration.HasValue)
                    .ToList();

                sourceStats.Add(new SourceStatsResponse
                {
                    SourceId = sourceId,
                    RootPath = GetNodeString(source["rootPath"]),
                    DisplayName = GetNodeString(source["displayName"]),
                    IsEnabled = GetNodeBool(source["isEnabled"], defaultValue: true),
                    TotalVideos = sourceVideos.Count,
                    TotalPhotos = sourceItems.Count - sourceVideos.Count,
                    TotalMedia = sourceItems.Count,
                    VideosWithAudio = sourceVideos.Count(video => video["hasAudio"] is not null && GetNodeBool(video["hasAudio"], defaultValue: false)),
                    VideosWithoutAudio = sourceVideos.Count(video => video["hasAudio"] is not null && !GetNodeBool(video["hasAudio"], defaultValue: true)),
                    TotalDurationSeconds = TimeSpan.FromTicks(Math.Max(0, totalDurationTicks)).TotalSeconds,
                    AverageDurationSeconds = videosWithDuration.Count == 0
                        ? null
                        : TimeSpan.FromTicks((long)videosWithDuration.Average(duration => duration!.Value.Ticks)).TotalSeconds
                });
            }

            return new LibraryStatsResponse
            {
                Global = new LibraryGlobalStatsResponse
                {
                    TotalVideos = totalVideos,
                    TotalPhotos = totalPhotos,
                    TotalMedia = itemNodes.Count,
                    Favorites = favorites,
                    Blacklisted = blacklisted,
                    UniquePlayedVideos = uniquePlayedVideos,
                    UniquePlayedPhotos = uniquePlayedPhotos,
                    UniquePlayedMedia = uniquePlayedMedia,
                    NeverPlayedVideos = Math.Max(0, totalVideos - uniquePlayedVideos),
                    NeverPlayedPhotos = Math.Max(0, totalPhotos - uniquePlayedPhotos),
                    NeverPlayedMedia = Math.Max(0, itemNodes.Count - uniquePlayedMedia),
                    TotalPlays = totalPlays,
                    VideosWithAudio = videosWithAudio,
                    VideosWithoutAudio = videosWithoutAudio
                },
                Sources = sourceStats
            };
        }
    }

    public LibraryStateResponse? SetFavorite(string path, bool isFavorite)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var item = EnsureArray(root, "items")
                .OfType<JsonObject>()
                .FirstOrDefault(candidate =>
                    string.Equals(GetNodeString(candidate["fullPath"]), path, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                return null;
            }

            item["isFavorite"] = isFavorite;
            if (isFavorite)
            {
                item["isBlacklisted"] = false;
            }

            SaveLibraryRoot(root);
            return CreateLibraryStateResponse(item);
        }
    }

    public LibraryStateResponse? SetBlacklist(string path, bool isBlacklisted)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var item = EnsureArray(root, "items")
                .OfType<JsonObject>()
                .FirstOrDefault(candidate =>
                    string.Equals(GetNodeString(candidate["fullPath"]), path, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                return null;
            }

            item["isBlacklisted"] = isBlacklisted;
            if (isBlacklisted)
            {
                item["isFavorite"] = false;
            }

            SaveLibraryRoot(root);
            return CreateLibraryStateResponse(item);
        }
    }

    public IReadOnlyList<LibraryStateResponse> GetLibraryStates(LibraryStatesRequest? request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var requestedPaths = (request?.Paths ?? [])
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var filterByPath = requestedPaths.Count > 0;

            var items = EnsureArray(root, "items")
                .OfType<JsonObject>()
                .Where(item => !filterByPath || requestedPaths.Contains(GetNodeString(item["fullPath"])))
                .OrderBy(item => GetNodeString(item["fullPath"]), StringComparer.OrdinalIgnoreCase)
                .Select(CreateLibraryStateResponse)
                .ToList();
            return items;
        }
    }

    public TagEditorModelResponse GetTagEditorModel(TagEditorModelRequest? request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var categories = EnsureArray(root, "categories").OfType<JsonObject>().ToList();
            var tags = EnsureArray(root, "tags").OfType<JsonObject>().ToList();
            var items = EnsureArray(root, "items").OfType<JsonObject>().ToList();

            EnsureUncategorizedCategory(categories);

            var requestedIds = (request?.ItemIds ?? [])
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var responseItems = new List<ItemTagsSnapshot>();
            foreach (var requestedId in requestedIds)
            {
                var matchedItem = items.FirstOrDefault(item =>
                    string.Equals(GetNodeString(item["id"]), requestedId, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(GetNodeString(item["fullPath"]), requestedId, StringComparison.OrdinalIgnoreCase));
                var tagsForItem = matchedItem == null
                    ? []
                    : EnsureArray(matchedItem, "tags")
                        .Select(node => GetNodeString(node))
                        .Where(tag => !string.IsNullOrWhiteSpace(tag))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .OrderBy(tag => tag, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                responseItems.Add(new ItemTagsSnapshot
                {
                    ItemId = requestedId,
                    Tags = tagsForItem
                });
            }

            return new TagEditorModelResponse
            {
                Categories = categories
                    .Select(MapCategorySnapshot)
                    .Where(category => !string.IsNullOrWhiteSpace(category.Name))
                    .OrderBy(category => category.SortOrder)
                    .ThenBy(category => category.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                Tags = tags
                    .Select(MapTagSnapshot)
                    .Where(tag => !string.IsNullOrWhiteSpace(tag.Name))
                    .OrderBy(tag => tag.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                Items = responseItems
            };
        }
    }

    public bool ApplyItemTags(ApplyItemTagsRequest request)
    {
        return ApplyItemTags(request, out _);
    }

    public bool ApplyItemTags(ApplyItemTagsRequest request, out bool catalogChanged)
    {
        catalogChanged = false;
        var itemIds = request.ItemIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var addTags = request.AddTags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Select(tag => tag.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var removeTags = request.RemoveTags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Select(tag => tag.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (itemIds.Count == 0 || (addTags.Count == 0 && removeTags.Count == 0))
        {
            return false;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var items = EnsureArray(root, "items").OfType<JsonObject>().ToList();
            var categories = EnsureArray(root, "categories").OfType<JsonObject>().ToList();
            EnsureUncategorizedCategory(categories);
            var tags = EnsureArray(root, "tags");
            var changed = false;

            foreach (var itemId in itemIds)
            {
                var item = items.FirstOrDefault(candidate =>
                    string.Equals(GetNodeString(candidate["id"]), itemId, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(GetNodeString(candidate["fullPath"]), itemId, StringComparison.OrdinalIgnoreCase));
                if (item == null)
                {
                    continue;
                }

                var itemTags = EnsureArray(item, "tags");
                changed |= RemoveTagsFromItem(itemTags, removeTags);
                changed |= AddTagsToItem(itemTags, addTags);
            }

            foreach (var addTag in addTags)
            {
                var tagCreatedOrUpdated = EnsureTagExists(tags, addTag, null, preserveExistingCategory: true);
                changed |= tagCreatedOrUpdated;
                catalogChanged |= tagCreatedOrUpdated;
            }

            var normalizedCatalog = NormalizeTagCatalog(tags);
            catalogChanged |= normalizedCatalog;
            changed |= normalizedCatalog;

            if (!changed)
            {
                return false;
            }

            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool UpsertCategory(UpsertCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return false;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var categories = EnsureArray(root, "categories");
            var categoryId = NormalizeCategoryId(request.Id);
            if (string.IsNullOrWhiteSpace(categoryId))
            {
                categoryId = UncategorizedCategoryId;
            }

            if (string.Equals(categoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
            {
                EnsureUncategorizedCategory(categories.OfType<JsonObject>().ToList());
                SaveLibraryRoot(root);
                return true;
            }

            var existing = categories.OfType<JsonObject>()
                .FirstOrDefault(category => string.Equals(GetNodeString(category["id"]), categoryId, StringComparison.OrdinalIgnoreCase));
            if (existing == null)
            {
                categories.Add(new JsonObject
                {
                    ["id"] = categoryId,
                    ["name"] = request.Name.Trim(),
                    ["sortOrder"] = request.SortOrder ?? categories.Count
                });
            }
            else
            {
                existing["name"] = request.Name.Trim();
                if (request.SortOrder.HasValue)
                {
                    existing["sortOrder"] = request.SortOrder.Value;
                }
            }

            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool UpsertTag(UpsertTagRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return false;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var categories = EnsureArray(root, "categories").OfType<JsonObject>().ToList();
            EnsureUncategorizedCategory(categories);
            var tags = EnsureArray(root, "tags");
            var changed = EnsureTagExists(tags, request.Name.Trim(), request.CategoryId);
            _ = NormalizeTagCatalog(tags);
            if (!changed)
            {
                return false;
            }

            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool RenameTag(RenameTagRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OldName) || string.IsNullOrWhiteSpace(request.NewName))
        {
            return false;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var tags = EnsureArray(root, "tags").OfType<JsonObject>().ToList();
            var items = EnsureArray(root, "items").OfType<JsonObject>().ToList();

            var existing = tags.FirstOrDefault(tag =>
                string.Equals(GetNodeString(tag["name"]), request.OldName, StringComparison.OrdinalIgnoreCase));
            if (existing == null)
            {
                return false;
            }

            existing["name"] = request.NewName.Trim();
            if (request.NewCategoryId != null)
            {
                existing["categoryId"] = NormalizeCategoryId(request.NewCategoryId);
            }

            foreach (var item in items)
            {
                var itemTags = EnsureArray(item, "tags");
                RenameTagInItem(itemTags, request.OldName, request.NewName);
                NormalizeItemTags(itemTags);
            }

            _ = NormalizeTagCatalog(EnsureArray(root, "tags"));

            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool DeleteTag(DeleteTagRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return false;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var tags = EnsureArray(root, "tags");
            var removed = RemoveTagFromCatalog(tags, request.Name);
            var items = EnsureArray(root, "items").OfType<JsonObject>().ToList();
            foreach (var item in items)
            {
                var itemTags = EnsureArray(item, "tags");
                removed |= RemoveTagFromItem(itemTags, request.Name);
            }

            if (!removed)
            {
                return false;
            }

            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool DeleteCategory(DeleteCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CategoryId))
        {
            return false;
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var categories = EnsureArray(root, "categories");
            var tags = EnsureArray(root, "tags").OfType<JsonObject>().ToList();
            var sourceCategoryId = NormalizeCategoryId(request.CategoryId);
            if (string.Equals(sourceCategoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            var targetCategoryId = request.NewCategoryId == null
                ? UncategorizedCategoryId
                : NormalizeCategoryId(request.NewCategoryId);
            var changed = RemoveCategory(categories, sourceCategoryId);
            foreach (var tag in tags.Where(tag =>
                         string.Equals(GetNodeString(tag["categoryId"]), sourceCategoryId, StringComparison.OrdinalIgnoreCase)))
            {
                tag["categoryId"] = targetCategoryId;
                changed = true;
            }

            if (!changed)
            {
                return false;
            }

            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool SyncTagCatalog(SyncTagCatalogRequest request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var categories = new JsonArray();
            foreach (var category in request.Categories.Where(category => !string.IsNullOrWhiteSpace(category.Name)))
            {
                categories.Add(new JsonObject
                {
                    ["id"] = NormalizeCategoryId(category.Id),
                    ["name"] = category.Name.Trim(),
                    ["sortOrder"] = category.SortOrder
                });
            }

            var tags = new JsonArray();
            foreach (var tag in request.Tags.Where(tag => !string.IsNullOrWhiteSpace(tag.Name)))
            {
                tags.Add(new JsonObject
                {
                    ["name"] = tag.Name.Trim(),
                    ["categoryId"] = NormalizeCategoryId(tag.CategoryId)
                });
            }

            _ = NormalizeTagCatalog(tags);

            EnsureUncategorizedCategory(categories.OfType<JsonObject>().ToList());
            root["categories"] = categories;
            root["tags"] = tags;
            SaveLibraryRoot(root);
            return true;
        }
    }

    public bool SyncItemTags(SyncItemTagsRequest request)
    {
        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var items = EnsureArray(root, "items").OfType<JsonObject>().ToList();
            var changed = false;
            foreach (var snapshot in request.Items.Where(item => !string.IsNullOrWhiteSpace(item.ItemId)))
            {
                var item = items.FirstOrDefault(candidate =>
                    string.Equals(GetNodeString(candidate["id"]), snapshot.ItemId, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(GetNodeString(candidate["fullPath"]), snapshot.ItemId, StringComparison.OrdinalIgnoreCase));
                if (item == null)
                {
                    continue;
                }

                var itemTags = new JsonArray();
                foreach (var tag in snapshot.Tags.Where(tag => !string.IsNullOrWhiteSpace(tag)).Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    itemTags.Add(tag.Trim());
                }

                item["tags"] = itemTags;
                changed = true;
            }

            if (!changed)
            {
                return false;
            }

            SaveLibraryRoot(root);
            return true;
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

    public RecordPlaybackResult RecordPlayback(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return new RecordPlaybackResult { Found = false };
        }

        lock (_lock)
        {
            var root = LoadLibraryRoot();
            var item = EnsureArray(root, "items")
                .OfType<JsonObject>()
                .FirstOrDefault(candidate =>
                    string.Equals(candidate["fullPath"]?.GetValue<string>(), path, StringComparison.OrdinalIgnoreCase));

            if (item == null)
            {
                return new RecordPlaybackResult { Found = false };
            }

            var nextPlayCount = GetNodeInt(item["playCount"], defaultValue: 0);
            if (nextPlayCount < int.MaxValue)
            {
                nextPlayCount++;
            }

            var nowUtc = DateTime.UtcNow;
            item["playCount"] = nextPlayCount;
            item["lastPlayedUtc"] = nowUtc;
            SaveLibraryRoot(root);

            return new RecordPlaybackResult
            {
                Found = true,
                PlayCount = nextPlayCount,
                LastPlayedUtc = nowUtc
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
                    string.Equals(GetNodeString(item["sourceId"]), request.SourceId, StringComparison.OrdinalIgnoreCase));
            }
            else if (request.Scope == "AllEnabledSources")
            {
                var enabledIds = sources
                    .Where(source => GetNodeBool(source["isEnabled"], defaultValue: true))
                    .Select(source => GetNodeString(source["id"]))
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                scopeItems = scopeItems.Where(item => enabledIds.Contains(GetNodeString(item["sourceId"])));
            }

            var list = scopeItems.ToList();
            var excludedPending = list.Count(item => string.Equals(GetNodeString(item["fingerprintStatus"]), "Pending", StringComparison.OrdinalIgnoreCase));
            var excludedFailed = list.Count(item => string.Equals(GetNodeString(item["fingerprintStatus"]), "Failed", StringComparison.OrdinalIgnoreCase));
            var excludedStale = list.Count(item => string.Equals(GetNodeString(item["fingerprintStatus"]), "Stale", StringComparison.OrdinalIgnoreCase));

            var readyItems = list
                .Where(IsFingerprintReadyForDuplicateScan)
                .ToList();

            var candidateItems = readyItems.Select(item => new FingerprintDuplicateItem
            {
                ItemId = GetNodeString(item["id"]),
                Fingerprint = GetNodeString(item["fingerprint"]),
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
                        string.Equals(GetNodeString(entry["id"]), itemId, StringComparison.OrdinalIgnoreCase));
                    if (item == null)
                    {
                        continue;
                    }

                    responseGroup.Items.Add(new DuplicateGroupItemResponse
                    {
                        ItemId = itemId,
                        FullPath = GetNodeString(item["fullPath"]),
                        SourceId = GetNodeString(item["sourceId"]),
                        IsFavorite = GetNodeBool(item["isFavorite"], defaultValue: false),
                        IsBlacklisted = GetNodeBool(item["isBlacklisted"], defaultValue: false),
                        PlayCount = GetNodeInt(item["playCount"], defaultValue: 0),
                        TagCount = (item["tags"] as JsonArray)?.Count ?? 0
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

                _ = EnsureTagExists(tags, assignment.TagName.Trim(), null, preserveExistingCategory: true);
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
            _ = NormalizeTagCatalog(tags);
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
        CreateLibraryBackupIfNeeded();
        File.WriteAllText(_libraryPath, root.ToJsonString(JsonOptions));
    }

    private void CreateLibraryBackupIfNeeded()
    {
        var policy = ReadBackupPolicy();
        if (!policy.Enabled || !File.Exists(_libraryPath))
        {
            return;
        }

        Directory.CreateDirectory(_backupDirectory);
        var backupFiles = Directory.GetFiles(_backupDirectory, "library.json.backup.*")
            .Select(path => new FileInfo(path))
            .OrderBy(BackupFileNaming.GetFileOrderingUtcTimestamp)
            .ToList();

        var maxBackups = Math.Max(1, policy.NumberOfBackups);
        var minGapMinutes = Math.Max(1, policy.MinimumBackupGapMinutes);
        var nowUtc = DateTime.UtcNow;
        var lastBackupTime = backupFiles.Count > 0 ? BackupFileNaming.GetFileOrderingUtcTimestamp(backupFiles[^1]) : DateTime.MinValue;
        var hasLastBackup = backupFiles.Count > 0;
        var timeSinceLastBackup = hasLastBackup ? nowUtc - lastBackupTime : TimeSpan.MaxValue;

        if (hasLastBackup && timeSinceLastBackup.TotalMinutes < minGapMinutes)
        {
            return;
        }

        var timestamp = BackupFileNaming.FormatNowForBackupSuffix();
        var backupPath = Path.Combine(_backupDirectory, $"library.json.backup.{timestamp}");
        File.Copy(_libraryPath, backupPath, true);

        var filesAfterCreate = Directory.GetFiles(_backupDirectory, "library.json.backup.*")
            .Select(path => new FileInfo(path))
            .OrderBy(BackupFileNaming.GetFileOrderingUtcTimestamp)
            .ToList();

        while (filesAfterCreate.Count > maxBackups)
        {
            filesAfterCreate[0].Delete();
            filesAfterCreate.RemoveAt(0);
        }
    }

    private BackupPolicySnapshot ReadBackupPolicy()
    {
        if (!File.Exists(_coreSettingsPath))
        {
            return BackupPolicySnapshot.Default;
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<CoreSettingsBackupDocument>(File.ReadAllText(_coreSettingsPath), JsonOptions);
            if (parsed?.Backup == null)
            {
                return BackupPolicySnapshot.Default;
            }

            return new BackupPolicySnapshot
            {
                Enabled = parsed.Backup.Enabled,
                MinimumBackupGapMinutes = Math.Clamp(parsed.Backup.MinimumBackupGapMinutes, 1, 10080),
                NumberOfBackups = Math.Clamp(parsed.Backup.NumberOfBackups, 1, 100)
            };
        }
        catch
        {
            return BackupPolicySnapshot.Default;
        }
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

    private static bool ItemBelongsToSource(JsonObject item, string sourceId, string sourceRootPath)
    {
        var itemSourceId = GetNodeString(item["sourceId"]);
        if (!string.IsNullOrWhiteSpace(itemSourceId) && !string.IsNullOrWhiteSpace(sourceId))
        {
            return string.Equals(itemSourceId, sourceId, StringComparison.OrdinalIgnoreCase);
        }

        var fullPath = GetNodeString(item["fullPath"]);
        if (string.IsNullOrWhiteSpace(fullPath) || string.IsNullOrWhiteSpace(sourceRootPath))
        {
            return false;
        }

        return IsPathUnderRoot(fullPath, sourceRootPath);
    }

    private static bool IsVideoItem(JsonObject item)
    {
        if (TryGetMediaTypeIsVideo(item["mediaType"], out var parsedIsVideo))
        {
            return parsedIsVideo;
        }

        var fullPath = GetNodeString(item["fullPath"]);
        if (!string.IsNullOrWhiteSpace(fullPath))
        {
            var extension = Path.GetExtension(fullPath).ToLowerInvariant();
            if (VideoExtensions.Contains(extension))
            {
                return true;
            }

            if (PhotoExtensions.Contains(extension))
            {
                return false;
            }
        }

        return true;
    }

    private static bool TryGetMediaTypeIsVideo(JsonNode? node, out bool isVideo)
    {
        isVideo = true;
        if (node is JsonValue value)
        {
            if (value.TryGetValue<int>(out var intValue))
            {
                if (intValue == 0)
                {
                    isVideo = true;
                    return true;
                }

                if (intValue == 1)
                {
                    isVideo = false;
                    return true;
                }
            }

            if (value.TryGetValue<string>(out var textValue))
            {
                var text = (textValue ?? string.Empty).Trim();
                if (string.Equals(text, "Video", StringComparison.OrdinalIgnoreCase) || text == "0")
                {
                    isVideo = true;
                    return true;
                }

                if (string.Equals(text, "Photo", StringComparison.OrdinalIgnoreCase) || text == "1")
                {
                    isVideo = false;
                    return true;
                }
            }
        }

        return false;
    }

    private static bool IsPathUnderRoot(string fullPath, string rootPath)
    {
        try
        {
            var normalizedPath = NormalizePathForPrefixComparison(fullPath);
            var normalizedRoot = NormalizePathForPrefixComparison(rootPath);
            if (string.IsNullOrWhiteSpace(normalizedPath) || string.IsNullOrWhiteSpace(normalizedRoot))
            {
                return false;
            }

            var rootWithSeparator = normalizedRoot + "/";

            return string.Equals(normalizedPath, normalizedRoot, StringComparison.OrdinalIgnoreCase) ||
                normalizedPath.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizePathForPrefixComparison(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        var full = Path.GetFullPath(path.Trim());
        return full
            .Replace('\\', '/')
            .TrimEnd('/');
    }

    private static string GetRelativePath(string rootPath, string fullPath) =>
        ReelRoulette.Core.Storage.LibraryRelativePath.GetRelativePath(rootPath, fullPath);

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

    private static string GetNodeString(JsonNode? node)
    {
        if (node is null)
        {
            return string.Empty;
        }

        try
        {
            return node.GetValue<string>()?.Trim() ?? string.Empty;
        }
        catch
        {
            var raw = node.ToJsonString().Trim();
            if (raw.Length >= 2 && raw[0] == '"' && raw[^1] == '"')
            {
                raw = raw[1..^1];
            }

            return raw;
        }
    }

    private static bool GetNodeBool(JsonNode? node, bool defaultValue)
    {
        if (node is null)
        {
            return defaultValue;
        }

        try
        {
            return node.GetValue<bool>();
        }
        catch
        {
            var text = GetNodeString(node);
            if (bool.TryParse(text, out var parsed))
            {
                return parsed;
            }

            if (int.TryParse(text, out var numeric))
            {
                return numeric != 0;
            }

            return defaultValue;
        }
    }

    private static TimeSpan? TryGetNodeTimeSpan(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        try
        {
            if (node is JsonValue value)
            {
                if (value.TryGetValue<TimeSpan>(out var timeSpan))
                {
                    return timeSpan;
                }

                if (value.TryGetValue<double>(out var seconds))
                {
                    return TimeSpan.FromSeconds(Math.Max(0, seconds));
                }
            }
        }
        catch
        {
            // Fall through to string parsing.
        }

        var text = GetNodeString(node);
        if (TimeSpan.TryParse(text, out var parsed))
        {
            return parsed;
        }

        if (double.TryParse(text, out var parsedSeconds))
        {
            return TimeSpan.FromSeconds(Math.Max(0, parsedSeconds));
        }

        return null;
    }

    private static int GetNodeInt(JsonNode? node, int defaultValue)
    {
        if (node is null)
        {
            return defaultValue;
        }

        try
        {
            return node.GetValue<int>();
        }
        catch
        {
            var text = GetNodeString(node);
            if (int.TryParse(text, out var parsedInt))
            {
                return parsedInt;
            }

            if (long.TryParse(text, out var parsedLong))
            {
                return (int)Math.Clamp(parsedLong, int.MinValue, int.MaxValue);
            }

            return defaultValue;
        }
    }

    private static bool IsFingerprintReadyForDuplicateScan(JsonObject item)
    {
        var fingerprint = GetNodeString(item["fingerprint"]);
        if (string.IsNullOrWhiteSpace(fingerprint))
        {
            return false;
        }

        var status = GetNodeString(item["fingerprintStatus"]);
        if (string.Equals(status, "Pending", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "Failed", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "Stale", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.Equals(status, "Ready", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Backward-compat path for legacy libraries that predate fingerprintStatus.
        var algorithm = GetNodeString(item["fingerprintAlgorithm"]);
        var version = GetNodeInt(item["fingerprintVersion"], defaultValue: 1);
        return string.Equals(algorithm, "SHA-256", StringComparison.OrdinalIgnoreCase) && version == 1;
    }

    private static LibraryStateResponse CreateLibraryStateResponse(JsonObject item)
    {
        return new LibraryStateResponse
        {
            ItemId = GetNodeString(item["id"]),
            Path = GetNodeString(item["fullPath"]),
            IsFavorite = GetNodeBool(item["isFavorite"], defaultValue: false),
            IsBlacklisted = GetNodeBool(item["isBlacklisted"], defaultValue: false),
            Revision = 0
        };
    }

    private static string NormalizeCategoryId(string? categoryId)
    {
        if (string.IsNullOrWhiteSpace(categoryId))
        {
            return UncategorizedCategoryId;
        }

        return categoryId.Trim();
    }

    private static TagCategorySnapshot MapCategorySnapshot(JsonObject category)
    {
        var id = NormalizeCategoryId(GetNodeString(category["id"]));
        var name = GetNodeString(category["name"]);
        if (string.Equals(id, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
        {
            return new TagCategorySnapshot
            {
                Id = UncategorizedCategoryId,
                Name = UncategorizedCategoryName,
                SortOrder = int.MaxValue
            };
        }

        return new TagCategorySnapshot
        {
            Id = id,
            Name = name,
            SortOrder = GetNodeInt(category["sortOrder"], defaultValue: 0)
        };
    }

    private static TagSnapshot MapTagSnapshot(JsonObject tag)
    {
        return new TagSnapshot
        {
            Name = GetNodeString(tag["name"]),
            CategoryId = NormalizeCategoryId(GetNodeString(tag["categoryId"]))
        };
    }

    private static void EnsureUncategorizedCategory(List<JsonObject> categories)
    {
        var existing = categories.FirstOrDefault(category =>
            string.Equals(GetNodeString(category["id"]), UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase));
        if (existing != null)
        {
            existing["id"] = UncategorizedCategoryId;
            existing["name"] = UncategorizedCategoryName;
            existing["sortOrder"] = int.MaxValue;
            return;
        }

        categories.Add(new JsonObject
        {
            ["id"] = UncategorizedCategoryId,
            ["name"] = UncategorizedCategoryName,
            ["sortOrder"] = int.MaxValue
        });
    }

    private static bool AddTagsToItem(JsonArray itemTags, IEnumerable<string> tagsToAdd)
    {
        var changed = false;
        foreach (var addTag in tagsToAdd)
        {
            if (itemTags.Any(tag => string.Equals(GetNodeString(tag), addTag, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            itemTags.Add(addTag);
            changed = true;
        }

        return changed;
    }

    private static bool RemoveTagsFromItem(JsonArray itemTags, IEnumerable<string> tagsToRemove)
    {
        var changed = false;
        foreach (var removeTag in tagsToRemove)
        {
            changed |= RemoveTagFromItem(itemTags, removeTag);
        }

        return changed;
    }

    private static bool RemoveTagFromItem(JsonArray itemTags, string tagName)
    {
        var changed = false;
        for (var i = itemTags.Count - 1; i >= 0; i--)
        {
            if (!string.Equals(GetNodeString(itemTags[i]), tagName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            itemTags.RemoveAt(i);
            changed = true;
        }

        return changed;
    }

    private static bool RenameTagInItem(JsonArray itemTags, string oldName, string newName)
    {
        var changed = false;
        for (var i = 0; i < itemTags.Count; i++)
        {
            if (!string.Equals(GetNodeString(itemTags[i]), oldName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            itemTags[i] = newName;
            changed = true;
        }

        return changed;
    }

    private static bool RemoveTagFromCatalog(JsonArray tags, string tagName)
    {
        var changed = false;
        for (var i = tags.Count - 1; i >= 0; i--)
        {
            if (tags[i] is not JsonObject tag)
            {
                continue;
            }

            if (!string.Equals(GetNodeString(tag["name"]), tagName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            tags.RemoveAt(i);
            changed = true;
        }

        return changed;
    }

    private static bool RemoveCategory(JsonArray categories, string categoryId)
    {
        var changed = false;
        for (var i = categories.Count - 1; i >= 0; i--)
        {
            if (categories[i] is not JsonObject category)
            {
                continue;
            }

            if (!string.Equals(GetNodeString(category["id"]), categoryId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            categories.RemoveAt(i);
            changed = true;
        }

        return changed;
    }

    private static bool EnsureTagExists(JsonArray tags, string tagName, string? categoryId, bool preserveExistingCategory = false)
    {
        var existing = tags.OfType<JsonObject>().FirstOrDefault(tag =>
            string.Equals(GetNodeString(tag["name"]), tagName, StringComparison.OrdinalIgnoreCase));
        if (existing != null)
        {
            if (preserveExistingCategory || string.IsNullOrWhiteSpace(categoryId))
            {
                return false;
            }

            var normalizedCategoryId = NormalizeCategoryId(categoryId);
            if (!string.IsNullOrWhiteSpace(normalizedCategoryId) &&
                !string.Equals(GetNodeString(existing["categoryId"]), normalizedCategoryId, StringComparison.OrdinalIgnoreCase))
            {
                existing["categoryId"] = normalizedCategoryId;
                return true;
            }

            return false;
        }

        tags.Add(new JsonObject
        {
            ["name"] = tagName,
            ["categoryId"] = NormalizeCategoryId(categoryId)
        });
        return true;
    }

    private static void NormalizeItemTags(JsonArray itemTags)
    {
        var deduped = itemTags
            .Select(tag => GetNodeString(tag))
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        itemTags.Clear();
        foreach (var tag in deduped)
        {
            itemTags.Add(tag);
        }
    }

    private static bool NormalizeTagCatalog(JsonArray tags)
    {
        var before = tags
            .OfType<JsonObject>()
            .Select(tag => (Name: GetNodeString(tag["name"]), CategoryId: NormalizeCategoryId(GetNodeString(tag["categoryId"]))))
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.CategoryId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var canonicalByName = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var tag in tags.OfType<JsonObject>())
        {
            var name = GetNodeString(tag["name"]);
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var categoryId = NormalizeCategoryId(GetNodeString(tag["categoryId"]));
            var candidate = new JsonObject
            {
                ["name"] = name,
                ["categoryId"] = categoryId
            };

            if (!canonicalByName.TryGetValue(name, out var existing))
            {
                canonicalByName[name] = candidate;
                continue;
            }

            var existingCategoryId = NormalizeCategoryId(GetNodeString(existing["categoryId"]));
            var existingUncategorized = string.Equals(existingCategoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
            var candidateUncategorized = string.Equals(categoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase);
            if (existingUncategorized && !candidateUncategorized)
            {
                canonicalByName[name] = candidate;
            }
        }

        tags.Clear();
        foreach (var entry in canonicalByName.OrderBy(entry => entry.Key, StringComparer.OrdinalIgnoreCase))
        {
            tags.Add(entry.Value);
        }

        var after = tags
            .OfType<JsonObject>()
            .Select(tag => (Name: GetNodeString(tag["name"]), CategoryId: NormalizeCategoryId(GetNodeString(tag["categoryId"]))))
            .OrderBy(entry => entry.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(entry => entry.CategoryId, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (before.Count != after.Count)
        {
            return true;
        }

        for (var i = 0; i < before.Count; i++)
        {
            if (!string.Equals(before[i].Name, after[i].Name, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(before[i].CategoryId, after[i].CategoryId, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private sealed class CoreSettingsBackupDocument
    {
        public BackupPolicySnapshot? Backup { get; set; }
    }

    private sealed class BackupPolicySnapshot
    {
        public static BackupPolicySnapshot Default { get; } = new()
        {
            Enabled = true,
            MinimumBackupGapMinutes = 360,
            NumberOfBackups = 8
        };

        public bool Enabled { get; set; } = true;
        public int MinimumBackupGapMinutes { get; set; } = 360;
        public int NumberOfBackups { get; set; } = 8;
    }
}
