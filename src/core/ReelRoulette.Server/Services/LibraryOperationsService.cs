using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Fingerprints;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Storage;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public static class LibraryQueryLimits
{
    public const int DefaultLimit = 100;
    public const int MaxLimit = 500;
}

public sealed class LibraryQueryOutcome
{
    public bool Accepted { get; init; }
    public string? Error { get; init; }
    public JsonObject? Body { get; init; }

    public static LibraryQueryOutcome Reject(string error) => new() { Accepted = false, Error = error };

    public static LibraryQueryOutcome Ok(JsonObject body) => new() { Accepted = true, Body = body };
}

public sealed class LibraryOperationsService
{
    private const string UncategorizedCategoryId = "uncategorized";
    private const string UncategorizedCategoryName = "Uncategorized";

    private readonly object _lock = new();
    private readonly string _logPath;
    private readonly ILogger<LibraryOperationsService> _logger;
    private readonly LibraryCatalogHost _catalog;
    private JsonObject? _editBaseline;
    private bool _loggedBackupUnavailable;

    public LibraryOperationsService(
        ILogger<LibraryOperationsService>? logger = null,
        string? appDataPathOverride = null,
        LibraryCatalogHost? catalog = null)
    {
        _logger = logger ?? NullLogger<LibraryOperationsService>.Instance;
        var appData = appDataPathOverride ??
                      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(appData);
        _logPath = Path.Combine(appData, "last.log");
        _catalog = catalog ?? LibraryCatalogHost.Open(appData);
    }

    public SourceImportResponse ImportSource(SourceImportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RootPath))
        {
            return new SourceImportResponse { Accepted = false, Message = "rootPath is required." };
        }

        var rootPath = LibrarySourcePath.NormalizeRootPath(request.RootPath);
        if (string.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
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
                    ["displayName"] = LibrarySourcePath.ResolveDisplayName(request.DisplayName, rootPath),
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

    public LibraryQueryOutcome QueryLibrary(LibraryQueryRequest? request)
    {
        request ??= new LibraryQueryRequest();
        if (!TryParseSort(request.SortMode, out var sort, out var sortError))
        {
            return LibraryQueryOutcome.Reject(sortError!);
        }

        var offset = request.Offset ?? 0;
        if (offset < 0)
        {
            return LibraryQueryOutcome.Reject("offset must be zero or greater");
        }

        var limit = request.Limit ?? LibraryQueryLimits.DefaultLimit;
        if (limit < 1 || limit > LibraryQueryLimits.MaxLimit)
        {
            return LibraryQueryOutcome.Reject($"limit must be from 1 through {LibraryQueryLimits.MaxLimit}");
        }

        if (!LibraryListFilterParser.TryParse(request.FilterState, out var filter, out var filterError))
        {
            return LibraryQueryOutcome.Reject(filterError!);
        }

        LibraryListResult page;
        lock (_lock)
        {
            page = _catalog.Session.QueryList(new LibraryListRequest
            {
                Search = request.Search,
                Filter = filter,
                Sort = sort,
                SortDescending = request.SortDescending ?? false,
                Offset = offset,
                Limit = limit
            });
        }

        var items = new JsonArray();
        foreach (var item in page.Items)
        {
            items.Add(LibraryCatalogSession.ToItemJson(item));
        }

        AppendServerLog(
            "info",
            $"Library query offset={offset} limit={limit} sort={sort} descending={request.SortDescending ?? false} total={page.TotalCount} baseline={page.SearchBaselineCount} returned={page.Items.Count}.");
        return LibraryQueryOutcome.Ok(new JsonObject
        {
            ["items"] = items,
            ["totalCount"] = page.TotalCount,
            ["searchBaselineCount"] = page.SearchBaselineCount
        });
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
                    DisplayName = LibrarySourcePath.ResolveDisplayName(
                        GetNodeString(source["displayName"]),
                        GetNodeString(source["rootPath"])),
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
            return UpdateItemFlag(path, () => _catalog.Session.SetFavorite(path, isFavorite));
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
            return UpdateItemFlag(path, () => _catalog.Session.SetBlacklist(path, isBlacklisted));
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
            var requestedIds = (request?.ItemIds ?? [])
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var read = _catalog.Session.ReadTagEditor(requestedIds);
            var categories = read.Categories
                .Select(MapCategory)
                .Where(category => !string.IsNullOrWhiteSpace(category.Name))
                .ToList();
            EnsureUncategorizedSnapshot(categories);
            return new TagEditorModelResponse
            {
                Categories = categories
                    .OrderBy(category => category.SortOrder)
                    .ThenBy(category => category.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                Tags = read.Tags
                    .Select(tag => new TagSnapshot
                    {
                        Name = tag.Name,
                        CategoryId = NormalizeCategoryId(tag.CategoryId)
                    })
                    .Where(tag => !string.IsNullOrWhiteSpace(tag.Name))
                    .OrderBy(tag => tag.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList(),
                Items = read.Items
                    .Select(item => new ItemTagsSnapshot
                    {
                        ItemId = item.ItemId,
                        Tags = item.Tags
                    })
                    .ToList()
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
            return _catalog.Session.ApplyItemTagEdits(itemIds, addTags, removeTags, out catalogChanged);
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
            return _catalog.Session.UpsertCategory(request.Id, request.Name, request.SortOrder);
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
            return _catalog.Session.UpsertTag(request.Name.Trim(), request.CategoryId);
        }
    }

    public bool RenameTag(RenameTagRequest request)
    {
        return RenameTag(request, out _);
    }

    public bool RenameTag(RenameTagRequest request, out List<string> changedItemIds)
    {
        changedItemIds = [];
        if (string.IsNullOrWhiteSpace(request.OldName) || string.IsNullOrWhiteSpace(request.NewName))
        {
            return false;
        }

        lock (_lock)
        {
            return _catalog.Session.RenameTag(request.OldName, request.NewName, request.NewCategoryId, out changedItemIds);
        }
    }

    public bool DeleteTag(DeleteTagRequest request)
    {
        return DeleteTag(request, out _);
    }

    public bool DeleteTag(DeleteTagRequest request, out List<string> changedItemIds)
    {
        changedItemIds = [];
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return false;
        }

        lock (_lock)
        {
            return _catalog.Session.DeleteTag(request.Name, out changedItemIds);
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
            return _catalog.Session.DeleteCategory(request.CategoryId, request.NewCategoryId);
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
            return new ClearPlaybackStatsResponse
            {
                ClearedCount = _catalog.Session.ClearPlaybackStats(request.ItemPaths)
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
            var recorded = _catalog.Session.RecordPlayback(path);
            if (recorded == null)
            {
                return new RecordPlaybackResult { Found = false };
            }

            return new RecordPlaybackResult
            {
                Found = true,
                PlayCount = recorded.PlayCount,
                LastPlayedUtc = recorded.LastPlayedUtc
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
            var excludedPending = list.Count(item => ReadFingerprintStatus(item["fingerprintStatus"]) == 0);
            var excludedFailed = list.Count(item => ReadFingerprintStatus(item["fingerprintStatus"]) == 2);
            var excludedStale = list.Count(item => ReadFingerprintStatus(item["fingerprintStatus"]) == 3);

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
            List<JsonObject> scanItems;
            if (request.ScanFullLibrary)
            {
                scanItems = allItems;
            }
            else if (selectedSet.Count == 0)
            {
                var enabledSourceIds = (root["sources"] as JsonArray)?.OfType<JsonObject>()
                    .Where(source => source["isEnabled"]?.GetValue<bool?>() ?? true)
                    .Select(source => source["id"]?.GetValue<string>() ?? string.Empty)
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
                scanItems = allItems
                    .Where(item => enabledSourceIds.Contains(item["sourceId"]?.GetValue<string>() ?? string.Empty))
                    .ToList();
            }
            else
            {
                scanItems = allItems
                    .Where(item => selectedSet.Contains(item["fullPath"]?.GetValue<string>() ?? string.Empty))
                    .ToList();
            }

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
        return ApplyAutoTags(request, out _);
    }

    public AutoTagApplyResponse ApplyAutoTags(AutoTagApplyRequest request, out List<CatalogAutoTagAppliedAssignment> applied)
    {
        var response = new AutoTagApplyResponse();
        applied = [];
        if (request.Assignments.Count == 0)
        {
            return response;
        }

        lock (_lock)
        {
            var result = _catalog.Session.ApplyAutoTagAssignments(request.Assignments
                .Select(assignment => new CatalogAutoTagAssignment
                {
                    TagName = assignment.TagName,
                    ItemPaths = assignment.ItemPaths
                })
                .ToList());
            response.AssignmentsAdded = result.AssignmentsAdded;
            response.ChangedItemPaths = result.ChangedItemPaths;
            response.Applied = result.Applied
                .Select(row => new AutoTagAppliedAssignment
                {
                    TagName = row.TagName,
                    ChangedItemPaths = row.ChangedItemPaths
                })
                .ToList();
            applied = result.Applied;
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

    private static bool TryParseSort(string? sortMode, out LibraryListSort sort, out string? error)
    {
        if (string.IsNullOrWhiteSpace(sortMode))
        {
            sort = LibraryListSort.Name;
            error = null;
            return true;
        }

        foreach (var name in Enum.GetNames<LibraryListSort>())
        {
            if (string.Equals(name, sortMode.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                sort = Enum.Parse<LibraryListSort>(name);
                error = null;
                return true;
            }
        }

        sort = LibraryListSort.Name;
        error = "sortMode must be Name, LastPlayed, PlayCount, Duration, or DateAdded";
        return false;
    }

    private void AppendServerLog(string level, string message)
    {
        try
        {
            File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [server] [{level}] {message}{Environment.NewLine}");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to append library query log.");
        }
    }

    private JsonObject LoadLibraryRoot()
    {
        var baseline = _catalog.LoadDocument();
        _editBaseline = baseline;
        return baseline.DeepClone() as JsonObject ?? new JsonObject();
    }

    private void SaveLibraryRoot(JsonObject root)
    {
        if (_editBaseline == null)
        {
            throw new InvalidOperationException("Catalog edit has no baseline.");
        }

        _catalog.SaveChanges(_editBaseline, root);
        _editBaseline = null;
        if (!_loggedBackupUnavailable)
        {
            _loggedBackupUnavailable = true;
            _logger.LogInformation("Catalog JSON backups are unavailable. The live catalog is {DatabasePath}.", _catalog.Session.DatabasePath);
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
            .FirstOrDefault(source => LibrarySourcePath.RootPathsEqual(source["rootPath"]?.GetValue<string>(), rootPath));
    }

    private static IEnumerable<string> EnumerateMediaFiles(string rootPath)
    {
        var allFiles = Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories);
        foreach (var file in allFiles)
        {
            var extension = Path.GetExtension(file).ToLowerInvariant();
            if (MediaPlayableExtensions.IsPlayableExtension(extension))
            {
                yield return file;
            }
        }
    }

    private static string ResolveMediaType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        return MediaPlayableExtensions.IsVideoExtension(extension) ? "Video" : "Photo";
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
            if (MediaPlayableExtensions.IsVideoExtension(extension))
            {
                return true;
            }

            if (MediaPlayableExtensions.IsPhotoExtension(extension))
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

    private static int? ReadFingerprintStatus(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        if (node is JsonValue value && value.TryGetValue<int>(out var number))
        {
            return number;
        }

        var text = GetNodeString(node);
        if (text.Equals("Pending", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        if (text.Equals("Ready", StringComparison.OrdinalIgnoreCase))
        {
            return 1;
        }

        if (text.Equals("Failed", StringComparison.OrdinalIgnoreCase))
        {
            return 2;
        }

        if (text.Equals("Stale", StringComparison.OrdinalIgnoreCase))
        {
            return 3;
        }

        return null;
    }

    private static bool IsFingerprintReadyForDuplicateScan(JsonObject item)
    {
        var fingerprint = GetNodeString(item["fingerprint"]);
        if (string.IsNullOrWhiteSpace(fingerprint))
        {
            return false;
        }

        var status = ReadFingerprintStatus(item["fingerprintStatus"]);
        if (status is 0 or 2 or 3)
        {
            return false;
        }

        if (status == 1)
        {
            return true;
        }

        // Backward-compat path for legacy libraries that predate fingerprintStatus.
        var algorithm = GetNodeString(item["fingerprintAlgorithm"]);
        var version = GetNodeInt(item["fingerprintVersion"], defaultValue: 1);
        return string.Equals(algorithm, "SHA-256", StringComparison.OrdinalIgnoreCase) && version == 1;
    }

    private LibraryStateResponse? UpdateItemFlag(string identifier, Action update)
    {
        var before = _catalog.Session.ReadItemState(identifier);
        if (before == null)
        {
            return null;
        }

        update();
        var after = _catalog.Session.ReadItemState(before.Id);
        if (after == null)
        {
            return null;
        }

        return new LibraryStateResponse
        {
            ItemId = after.Id,
            Path = after.FullPath,
            IsFavorite = after.IsFavorite,
            IsBlacklisted = after.IsBlacklisted
        };
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

    private static TagCategorySnapshot MapCategory(LibraryCatalogCategory category)
    {
        var id = NormalizeCategoryId(category.Id);
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
            Name = category.Name,
            SortOrder = category.SortOrder
        };
    }

    private static void EnsureUncategorizedSnapshot(List<TagCategorySnapshot> categories)
    {
        if (categories.Any(category => string.Equals(category.Id, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        categories.Add(new TagCategorySnapshot
        {
            Id = UncategorizedCategoryId,
            Name = UncategorizedCategoryName,
            SortOrder = int.MaxValue
        });
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

}
