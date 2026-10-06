using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Fingerprints;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Storage;
using ReelRoulette.Core.Tags;
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
    private readonly ServerLogService _serverLog;
    private readonly ILogger<LibraryOperationsService> _logger;
    private readonly LibraryCatalogHost _catalog;
    private readonly Func<string, IReadOnlyList<string>> _enumerateFiles;

    public LibraryOperationsService(
        LibraryCatalogHost catalog,
        ILogger<LibraryOperationsService>? logger = null,
        string? appDataPathOverride = null,
        Func<string, IReadOnlyList<string>>? enumerateMediaFiles = null)
    {
        _logger = logger ?? NullLogger<LibraryOperationsService>.Instance;
        var appData = appDataPathOverride ?? ServerDataPaths.DataDirectory();
        Directory.CreateDirectory(appData);
        _serverLog = new ServerLogService(appData, _logger);
        _catalog = catalog;
        _enumerateFiles = enumerateMediaFiles ?? EnumerateAllFiles;
        if (_catalog.HasLibrary)
        {
            LibraryCatalogBackup.Attach(_catalog.Session, appData, _logger);
        }
    }

    public void WriteCatalogCheckpoint(string destinationPath)
    {
        try
        {
            LibraryCatalogStore.WriteCheckpoint(_catalog.Session.DatabasePath, destinationPath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Catalog checkpoint failed.");
            _serverLog.Append("error", "Catalog checkpoint failed: " + ex.Message);
            throw;
        }
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

        var files = new List<CatalogSourceImportFile>();
        foreach (var filePath in _enumerateFiles(rootPath))
        {
            if (!MediaPlayableExtensions.IsPlayableExtension(Path.GetExtension(filePath)))
            {
                continue;
            }

            files.Add(new CatalogSourceImportFile(
                filePath,
                GetRelativePath(rootPath, filePath),
                Path.GetFileName(filePath),
                ResolveMediaType(filePath)));
        }

        CatalogSourceImportResult imported;
        lock (_lock)
        {
            imported = _catalog.Session.ImportSourceFolder(rootPath, request.DisplayName, files);
        }

        _serverLog.Append(
            "info",
            $"Source import root={rootPath} imported={imported.ImportedCount} updated={imported.UpdatedCount}.");
        return new SourceImportResponse
        {
            Accepted = true,
            ImportedCount = imported.ImportedCount,
            UpdatedCount = imported.UpdatedCount,
            SourceId = imported.SourceId,
            Message = "Import completed."
        };
    }

    public JsonObject? ReadLibraryItem(string? identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return null;
        }

        LibraryCatalogItem? item;
        lock (_lock)
        {
            item = _catalog.Session.ReadListedItem(identifier);
        }

        return item == null ? null : LibraryCatalogSession.ToItemJson(item);
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
            var node = LibraryCatalogSession.ToItemJson(item);
            if (item.ThumbnailWidth is > 0 && item.ThumbnailHeight is > 0)
            {
                node["thumbnailWidth"] = item.ThumbnailWidth.Value;
                node["thumbnailHeight"] = item.ThumbnailHeight.Value;
            }

            items.Add(node);
        }

        _serverLog.Append(
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
            var stats = _catalog.Session.ReadLibraryStats();
            return new LibraryStatsResponse
            {
                Global = new LibraryGlobalStatsResponse
                {
                    TotalVideos = stats.Global.TotalVideos,
                    TotalPhotos = stats.Global.TotalPhotos,
                    TotalMedia = stats.Global.TotalMedia,
                    Favorites = stats.Global.Favorites,
                    Blacklisted = stats.Global.Blacklisted,
                    UniquePlayedVideos = stats.Global.UniquePlayedVideos,
                    UniquePlayedPhotos = stats.Global.UniquePlayedPhotos,
                    UniquePlayedMedia = stats.Global.UniquePlayedMedia,
                    NeverPlayedVideos = stats.Global.NeverPlayedVideos,
                    NeverPlayedPhotos = stats.Global.NeverPlayedPhotos,
                    NeverPlayedMedia = stats.Global.NeverPlayedMedia,
                    TotalPlays = stats.Global.TotalPlays,
                    VideosWithAudio = stats.Global.VideosWithAudio,
                    VideosWithoutAudio = stats.Global.VideosWithoutAudio,
                    BaselineLoudnessLufs = stats.Global.BaselineLoudnessLufs
                },
                Sources = stats.Sources
                    .Select(source => new SourceStatsResponse
                    {
                        SourceId = source.SourceId,
                        RootPath = source.RootPath,
                        DisplayName = LibrarySourcePath.ResolveDisplayName(source.DisplayName, source.RootPath),
                        IsEnabled = source.IsEnabled,
                        TotalVideos = source.TotalVideos,
                        TotalPhotos = source.TotalPhotos,
                        TotalMedia = source.TotalMedia,
                        VideosWithAudio = source.VideosWithAudio,
                        VideosWithoutAudio = source.VideosWithoutAudio,
                        TotalDurationSeconds = source.TotalDurationSeconds,
                        AverageDurationSeconds = source.AverageDurationSeconds
                    })
                    .ToList()
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
            return _catalog.Session.ReadItemStates(request?.Paths)
                .Select(item => new LibraryStateResponse
                {
                    ItemId = item.Id,
                    Path = item.FullPath,
                    IsFavorite = item.IsFavorite,
                    IsBlacklisted = item.IsBlacklisted,
                    Revision = 0
                })
                .ToList();
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
                    .ThenBy(category => category.Name, TagNameComparer.Instance)
                    .ToList(),
                Tags = read.Tags
                    .Select(tag => new TagSnapshot
                    {
                        Name = tag.Name,
                        CategoryId = NormalizeCategoryId(tag.CategoryId)
                    })
                    .Where(tag => !string.IsNullOrWhiteSpace(tag.Name))
                    .OrderBy(tag => tag.Name, TagNameComparer.Instance)
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
                LastPlayedUtc = recorded.LastPlayedUtc,
                PreviousLastPlayedUtc = recorded.PreviousLastPlayedUtc
            };
        }
    }

    public DuplicateScanResponse ScanDuplicates(DuplicateScanRequest request)
    {
        lock (_lock)
        {
            CatalogDuplicateScanScope scope;
            string? sourceId = null;
            if (request.Scope == "CurrentSource" && !string.IsNullOrWhiteSpace(request.SourceId))
            {
                scope = CatalogDuplicateScanScope.Source;
                sourceId = request.SourceId;
            }
            else if (request.Scope == "AllEnabledSources")
            {
                scope = CatalogDuplicateScanScope.EnabledSources;
            }
            else
            {
                scope = CatalogDuplicateScanScope.All;
            }

            var list = _catalog.Session.ReadDuplicateScanItems(scope, sourceId);
            var readyItems = list.Where(IsReadyFingerprint).ToList();
            var readyById = readyItems.ToDictionary(item => item.Id, StringComparer.OrdinalIgnoreCase);
            var groups = FingerprintDuplicateHelper.BuildExactDuplicateGroups(readyItems.Select(item => new FingerprintDuplicateItem
            {
                ItemId = item.Id,
                Fingerprint = item.Fingerprint ?? string.Empty,
                IsReady = true
            }));

            var responseGroups = groups.Select(group =>
            {
                var responseGroup = new DuplicateGroupResponse
                {
                    Fingerprint = group.Fingerprint
                };

                foreach (var itemId in group.ItemIds)
                {
                    if (!readyById.TryGetValue(itemId, out var item))
                    {
                        continue;
                    }

                    responseGroup.Items.Add(new DuplicateGroupItemResponse
                    {
                        ItemId = item.Id,
                        FullPath = item.FullPath,
                        SourceId = item.SourceId,
                        IsFavorite = item.IsFavorite,
                        IsBlacklisted = item.IsBlacklisted,
                        PlayCount = item.PlayCount,
                        TagCount = item.TagCount
                    });
                }

                return responseGroup;
            }).ToList();

            return new DuplicateScanResponse
            {
                Groups = responseGroups,
                ExcludedPending = list.Count(item => item.FingerprintStatus == 0),
                ExcludedFailed = list.Count(item => item.FingerprintStatus == 2),
                ExcludedStale = list.Count(item => item.FingerprintStatus == 3)
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
            foreach (var selection in request.Selections)
            {
                if (string.IsNullOrWhiteSpace(selection.KeepItemId) || selection.ItemIds.Count == 0)
                {
                    continue;
                }

                var matched = _catalog.Session.ReadItemsByIds(selection.ItemIds);
                if (!matched.Any(item => string.Equals(item.Id, selection.KeepItemId, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                foreach (var item in matched)
                {
                    if (string.Equals(item.Id, selection.KeepItemId, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    try
                    {
                        if (File.Exists(item.FullPath))
                        {
                            File.Delete(item.FullPath);
                            response.DeletedOnDisk++;
                        }
                        else
                        {
                            response.Failures.Add(new DuplicateApplyFailure { FullPath = item.FullPath, Reason = "File not found" });
                            continue;
                        }

                        if (_catalog.Session.DeleteItem(item.Id))
                        {
                            response.RemovedFromLibrary++;
                        }
                    }
                    catch (Exception ex)
                    {
                        response.Failures.Add(new DuplicateApplyFailure { FullPath = item.FullPath, Reason = ex.Message });
                    }
                }
            }
        }

        return response;
    }

    public AutoTagScanResponse ScanAutoTags(AutoTagScanRequest request)
    {
        lock (_lock)
        {
            var tags = _catalog.Session.ReadAutoTagNames()
                .Select(name => name.Trim())
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(name => name, TagNameComparer.Instance)
                .ToList();

            var selectedPaths = (request.ItemIds ?? [])
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .ToList();
            IReadOnlyList<CatalogAutoTagScanItem> scanItems;
            if (request.ScanFullLibrary)
            {
                scanItems = _catalog.Session.ReadAutoTagScanItems(CatalogAutoTagScanScope.All, null);
            }
            else if (selectedPaths.Count == 0)
            {
                scanItems = _catalog.Session.ReadAutoTagScanItems(CatalogAutoTagScanScope.EnabledSources, null);
            }
            else
            {
                scanItems = _catalog.Session.ReadAutoTagScanItems(CatalogAutoTagScanScope.Paths, selectedPaths);
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
                    if (string.IsNullOrWhiteSpace(item.FullPath))
                    {
                        continue;
                    }

                    row.Files.Add(new AutoTagMatchedFileResponse
                    {
                        FullPath = item.FullPath,
                        DisplayPath = item.RelativePath,
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

        _serverLog.Append(source, level, message);
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

    private static IReadOnlyList<string> EnumerateAllFiles(string rootPath) =>
        Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories);

    private static int ResolveMediaType(string filePath) =>
        MediaPlayableExtensions.IsVideoExtension(Path.GetExtension(filePath)) ? 0 : 1;

    private static string GetRelativePath(string rootPath, string fullPath) =>
        ReelRoulette.Core.Storage.LibraryRelativePath.GetRelativePath(rootPath, fullPath);

    private static bool IsReadyFingerprint(CatalogDuplicateScanItem item) =>
        item.FingerprintStatus == 1 && !string.IsNullOrWhiteSpace(item.Fingerprint);

    private static bool ItemMatchesTag(CatalogAutoTagScanItem item, string tagName)
    {
        if (string.IsNullOrWhiteSpace(tagName))
        {
            return false;
        }

        var fileName = item.FileName;
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = Path.GetFileName(item.FullPath);
        }

        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
        if (!string.IsNullOrWhiteSpace(fileNameWithoutExtension) &&
            fileNameWithoutExtension.Contains(tagName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(item.RelativePath) &&
            item.RelativePath.Replace('\\', '/').Contains(tagName, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(item.FullPath) &&
               item.FullPath.Replace('\\', '/').Contains(tagName, StringComparison.OrdinalIgnoreCase);
    }

    private static bool ItemHasTag(CatalogAutoTagScanItem item, string tagName) =>
        item.Tags.Any(tag => string.Equals(tag, tagName, StringComparison.OrdinalIgnoreCase));

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
}
