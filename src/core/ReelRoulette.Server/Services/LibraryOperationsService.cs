using System.Diagnostics;
using System.Globalization;
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
    /// <summary>Large enough that a client reloads the window it has loaded in one request.</summary>
    public const int MaxLimit = 10_000;
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
        _serverLog = new ServerLogService(appData, _logger);
        _catalog = catalog;
        _enumerateFiles = enumerateMediaFiles ?? EnumerateAllFiles;
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
            if (!SupportedMediaExtensions.IsSupportedExtension(Path.GetExtension(filePath)))
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

    /// <summary>
    /// One browse page. <paramref name="enrichItems"/> adds the per-request item fields, such as
    /// thumbnails, before the request's one <c>last.log</c> line, so its elapsed time covers them.
    /// </summary>
    public LibraryQueryOutcome QueryLibrary(LibraryQueryRequest? request, Action<JsonArray>? enrichItems = null)
    {
        var stopwatch = Stopwatch.StartNew();
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

        enrichItems?.Invoke(items);
        _serverLog.Append(
            "info",
            $"Library query offset={offset} limit={limit} sort={sort} descending={request.SortDescending ?? false} total={page.TotalCount} baseline={page.SearchBaselineCount} returned={page.Items.Count} elapsedMs={stopwatch.ElapsedMilliseconds}.");
        return LibraryQueryOutcome.Ok(new JsonObject
        {
            ["items"] = items,
            ["totalCount"] = page.TotalCount,
            ["searchBaselineCount"] = page.SearchBaselineCount
        });
    }

    /// <summary>
    /// The id of every item the browse query with the same filter and search matches, for selecting all of them, or
    /// only those of the request's <see cref="LibraryIdsQueryRequest.ItemIds"/> that match, for checking a selection,
    /// or the reason the filter is refused.
    /// </summary>
    public LibraryIdsQueryResponse? QueryLibraryIds(LibraryIdsQueryRequest? request, out string? error)
    {
        var stopwatch = Stopwatch.StartNew();
        request ??= new LibraryIdsQueryRequest();
        if (!LibraryListFilterParser.TryParse(request.FilterState, out var filter, out error))
        {
            return null;
        }

        List<string> ids;
        lock (_lock)
        {
            ids = _catalog.Session.QueryListIds(new LibraryListRequest
            {
                Search = request.Search,
                Filter = filter
            });
        }

        // One full match costs about the same whatever the selection's size, where looking the ids up a chunk at a time
        // costs more than it from a few thousand ids on.
        var requested = request.ItemIds?.ToHashSet(StringComparer.Ordinal);
        if (requested != null)
        {
            ids = ids.Where(requested.Contains).ToList();
        }

        var requestedText = requested == null ? string.Empty : $" requested={requested.Count}";
        _serverLog.Append("info", $"Library ids query{requestedText} total={ids.Count} elapsedMs={stopwatch.ElapsedMilliseconds}.");
        return new LibraryIdsQueryResponse { Ids = ids };
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
                    Rated = stats.Global.Rated,
                    UniquePlayedMedia = stats.Global.UniquePlayedMedia,
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

    public LibraryStateResponse? SetFavorite(string itemId, bool isFavorite)
    {
        return SetFavorite(itemId, isFavorite, out _);
    }

    /// <summary><paramref name="previous"/> is the item's favorite and blacklist before this change.</summary>
    public LibraryStateResponse? SetFavorite(string itemId, bool isFavorite, out LibraryStateResponse? previous)
    {
        return SetItemFlag(itemId, CatalogItemFlag.Favorite, isFavorite, out previous);
    }

    public LibraryStateResponse? SetBlacklist(string itemId, bool isBlacklisted)
    {
        return SetBlacklist(itemId, isBlacklisted, out _);
    }

    /// <summary><paramref name="previous"/> is the item's favorite and blacklist before this change.</summary>
    public LibraryStateResponse? SetBlacklist(string itemId, bool isBlacklisted, out LibraryStateResponse? previous)
    {
        return SetItemFlag(itemId, CatalogItemFlag.Blacklist, isBlacklisted, out previous);
    }

    /// <summary>
    /// Sets or clears favorite or blacklist on every named item in one write, for a bulk request, and returns each
    /// named item in the library with its favorite and blacklist before and after. It writes one <c>last.log</c> line
    /// with the counts and the elapsed time.
    /// </summary>
    public IReadOnlyList<CatalogItemFlagChange> SetItemsFlag(IReadOnlyList<string> itemIds, CatalogItemFlag flag, bool value)
    {
        var stopwatch = Stopwatch.StartNew();
        var changes = WriteItemsFlag(itemIds, flag, value);
        var flagName = flag == CatalogItemFlag.Favorite ? "favorite" : "blacklist";
        _serverLog.Append(
            "info",
            $"Bulk item state flag={flagName} value={(value ? "true" : "false")} count={changes.Count} changed={changes.Count(change => change.Changed)} elapsedMs={stopwatch.ElapsedMilliseconds}.");
        return changes;
    }

    private IReadOnlyList<CatalogItemFlagChange> WriteItemsFlag(IReadOnlyList<string> itemIds, CatalogItemFlag flag, bool value)
    {
        lock (_lock)
        {
            return _catalog.Session.SetItemsFlag(itemIds, flag, value);
        }
    }

    /// <summary>
    /// Sets the item's rating in half stars, or clears it with null, and returns the item with its rating before and
    /// after, so the caller can tell whether it changed, or null for an item not in the library.
    /// </summary>
    public CatalogItemRatingChange? SetRating(string itemId, int? halfStars)
    {
        return string.IsNullOrWhiteSpace(itemId) ? null : WriteItemsRating([itemId], halfStars).FirstOrDefault();
    }

    /// <summary>
    /// Sets one rating in half stars on every named item in one write, or clears it with null, for a bulk request, and
    /// returns each named item in the library with its rating before and after. It writes one <c>last.log</c> line
    /// with the counts and the elapsed time.
    /// </summary>
    public IReadOnlyList<CatalogItemRatingChange> SetItemsRating(IReadOnlyList<string> itemIds, int? halfStars)
    {
        var stopwatch = Stopwatch.StartNew();
        var changes = WriteItemsRating(itemIds, halfStars);
        var rating = ItemRating.ToStars(halfStars)?.ToString(CultureInfo.InvariantCulture) ?? "none";
        _serverLog.Append(
            "info",
            $"Bulk rating rating={rating} count={changes.Count} changed={changes.Count(change => change.Changed)} elapsedMs={stopwatch.ElapsedMilliseconds}.");
        return changes;
    }

    private IReadOnlyList<CatalogItemRatingChange> WriteItemsRating(IReadOnlyList<string> itemIds, int? halfStars)
    {
        lock (_lock)
        {
            return _catalog.Session.SetItemsRating(itemIds, halfStars);
        }
    }

    /// <summary>
    /// Deletes the file of each named item from disk and removes the items whose files it deleted, with their tags, in
    /// one write. <paramref name="removedItemIds"/> is the ids of the items it removed. An item whose file isn't on
    /// disk, or can't be deleted, stays and is listed in the response's failures; an id no item has is skipped.
    /// </summary>
    public DeleteFilesResponse DeleteFiles(IReadOnlyList<string> itemIds, out IReadOnlyList<string> removedItemIds)
    {
        var stopwatch = Stopwatch.StartNew();
        IReadOnlyList<CatalogStoredItem> items;
        lock (_lock)
        {
            items = _catalog.Session.ReadItemsByIds(itemIds);
        }

        var outcome = DeleteFilesAndItems("Delete files", items, stopwatch);
        removedItemIds = outcome.RemovedItemIds;
        return new DeleteFilesResponse
        {
            DeletedCount = outcome.Deleted.Count,
            FailedItemIds = outcome.Failures.Select(failure => failure.Item.Id).ToList()
        };
    }

    public TagEditorModelResponse GetTagEditorModel(TagEditorModelRequest? request)
    {
        lock (_lock)
        {
            var countsOnly = request?.CountsOnly == true;
            var read = _catalog.Session.ReadTagEditor(request?.ItemIds, countsOnly);
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
                    .ToList(),
                TagCounts = read.TagCounts?
                    .Select(tag => new TagItemCount { Name = tag.Name, ItemCount = tag.ItemCount })
                    .OrderBy(tag => tag.Name, TagNameComparer.Instance)
                    .ToList(),
                ItemCount = read.ItemCount
            };
        }
    }

    public bool ApplyItemTags(ApplyItemTagsRequest request)
    {
        return ApplyItemTags(request, out _);
    }

    public bool ApplyItemTags(ApplyItemTagsRequest request, out bool catalogChanged)
    {
        return ApplyItemTags(request, out catalogChanged, out _);
    }

    public bool ApplyItemTags(ApplyItemTagsRequest request, out bool catalogChanged, out List<string> resolvedItemIds)
    {
        lock (_lock)
        {
            return _catalog.Session.ApplyItemTagEdits(request.ItemIds, request.AddTags, request.RemoveTags, out catalogChanged, out resolvedItemIds);
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

    /// <summary>
    /// Clears the playback stats of the named items, or of every item with <c>allItems</c>, and returns how many of
    /// them are in the library and how many had stats to clear. It writes one <c>last.log</c> line with the counts and
    /// the elapsed time.
    /// </summary>
    public CatalogPlaybackStatsClear ClearPlaybackStats(ClearPlaybackStatsRequest request)
    {
        var stopwatch = Stopwatch.StartNew();
        CatalogPlaybackStatsClear cleared;
        lock (_lock)
        {
            cleared = request.AllItems
                ? _catalog.Session.ClearAllPlaybackStats()
                : _catalog.Session.ClearPlaybackStats(request.ItemIds ?? []);
        }

        _serverLog.Append(
            "info",
            $"Clear playback stats allItems={(request.AllItems ? "true" : "false")} count={cleared.Count} changed={cleared.Changed} elapsedMs={stopwatch.ElapsedMilliseconds}.");
        return cleared;
    }

    public RecordPlaybackResult RecordPlayback(string itemId)
    {
        if (string.IsNullOrWhiteSpace(itemId))
        {
            return new RecordPlaybackResult { Found = false };
        }

        lock (_lock)
        {
            var recorded = _catalog.Session.RecordPlayback(itemId);
            if (recorded == null)
            {
                return new RecordPlaybackResult { Found = false };
            }

            return new RecordPlaybackResult
            {
                Found = true,
                ItemId = recorded.Id,
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
            var readyById = readyItems.ToDictionary(item => item.Id, StringComparer.Ordinal);
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

    /// <summary>
    /// Deletes the files of each selection's items but the one it keeps, and removes those items, as delete files
    /// does. <paramref name="removedItemIds"/> is the ids of the items it removed. A selection whose kept item isn't in
    /// the library is skipped.
    /// </summary>
    public DuplicateApplyResponse ApplyDuplicateSelection(DuplicateApplyRequest request, out IReadOnlyList<string> removedItemIds)
    {
        var stopwatch = Stopwatch.StartNew();
        removedItemIds = [];
        var response = new DuplicateApplyResponse();
        if (request.Selections.Count == 0)
        {
            return response;
        }

        var toDelete = new List<CatalogStoredItem>();
        lock (_lock)
        {
            foreach (var selection in request.Selections)
            {
                if (string.IsNullOrWhiteSpace(selection.KeepItemId) || selection.ItemIds.Count == 0)
                {
                    continue;
                }

                var keepItemId = selection.KeepItemId.Trim();
                var matched = _catalog.Session.ReadItemsByIds(selection.ItemIds);
                if (matched.Any(item => item.Id == keepItemId))
                {
                    toDelete.AddRange(matched.Where(item => item.Id != keepItemId));
                }
            }
        }

        var outcome = DeleteFilesAndItems("Duplicate apply", toDelete, stopwatch);
        removedItemIds = outcome.RemovedItemIds;
        response.DeletedOnDisk = outcome.Deleted.Count;
        response.RemovedFromLibrary = outcome.RemovedItemIds.Count;
        response.Failures = outcome.Failures
            .Select(failure => new DuplicateApplyFailure
            {
                ItemId = failure.Item.Id,
                FullPath = failure.Item.FullPath,
                Reason = failure.Error?.Message ?? "File not found"
            })
            .ToList();
        return response;
    }

    /// <summary>
    /// Deletes each item's file from disk outside the operations lock, since a share can be slow, and then removes the
    /// items whose files it deleted in one write. A file that isn't on disk, or whose delete throws, is a failure
    /// with that exception, or none for a missing file, and its item stays. It writes one <c>last.log</c> line, named
    /// <paramref name="action"/>, with the counts and the time since <paramref name="stopwatch"/> started, and when
    /// some files stay, a warning with how many were missing and the errors' types, both without paths.
    /// </summary>
    private FileDeletionOutcome DeleteFilesAndItems(string action, IReadOnlyList<CatalogStoredItem> items, Stopwatch stopwatch)
    {
        var deleted = new List<CatalogStoredItem>();
        var failures = new List<(CatalogStoredItem Item, Exception? Error)>();
        foreach (var item in items)
        {
            try
            {
                if (!File.Exists(item.FullPath))
                {
                    failures.Add((item, null));
                    continue;
                }

                File.Delete(item.FullPath);
                deleted.Add(item);
            }
            catch (Exception ex)
            {
                failures.Add((item, ex));
            }
        }

        IReadOnlyList<string> removed = [];
        if (deleted.Count > 0)
        {
            lock (_lock)
            {
                removed = _catalog.Session.DeleteItems(deleted.Select(item => item.Id).ToList());
            }
        }

        _serverLog.Append(
            "info",
            $"{action} found={items.Count} deleted={deleted.Count} removed={removed.Count} failed={failures.Count} elapsedMs={stopwatch.ElapsedMilliseconds}.");
        if (failures.Count > 0)
        {
            var missing = failures.Count(failure => failure.Error == null);
            var errors = failures
                .Where(failure => failure.Error != null)
                .Select(failure => failure.Error!.GetType().Name)
                .Distinct(StringComparer.Ordinal)
                .ToList();
            _serverLog.Append(
                "warn",
                $"{action} kept {failures.Count} items: missing={missing} errors=[{string.Join(", ", errors)}].");
        }

        return new FileDeletionOutcome(deleted, removed, failures);
    }

    private sealed record FileDeletionOutcome(
        IReadOnlyList<CatalogStoredItem> Deleted,
        IReadOnlyList<string> RemovedItemIds,
        IReadOnlyList<(CatalogStoredItem Item, Exception? Error)> Failures);

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

            var scanItems = _catalog.Session.ReadAutoTagScanItems(request.ScanFullLibrary
                ? CatalogAutoTagScanScope.All
                : CatalogAutoTagScanScope.EnabledSources);

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
                        ItemId = item.Id,
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
            response.Applied = result.Applied
                .Select(row => new AutoTagAppliedAssignment
                {
                    TagName = row.TagName,
                    ChangedItemIds = row.ChangedItemIds
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

        var names = Enum.GetNames<LibraryListSort>();
        foreach (var name in names)
        {
            if (string.Equals(name, sortMode.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                sort = Enum.Parse<LibraryListSort>(name);
                error = null;
                return true;
            }
        }

        sort = LibraryListSort.Name;
        error = $"sortMode must be {string.Join(", ", names[..^1])}, or {names[^1]}";
        return false;
    }

    private static IReadOnlyList<string> EnumerateAllFiles(string rootPath) =>
        Directory.GetFiles(rootPath, "*", SearchOption.AllDirectories);

    private static int ResolveMediaType(string filePath) =>
        SupportedMediaExtensions.IsVideoExtension(Path.GetExtension(filePath)) ? 0 : 1;

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

    /// <summary>
    /// Sets or clears one item's flag, and returns its state after the change, with <paramref name="previous"/> its
    /// state before. Both are null for an item not in the library.
    /// </summary>
    private LibraryStateResponse? SetItemFlag(string itemId, CatalogItemFlag flag, bool value, out LibraryStateResponse? previous)
    {
        previous = null;
        if (string.IsNullOrWhiteSpace(itemId))
        {
            return null;
        }

        var change = WriteItemsFlag([itemId], flag, value).FirstOrDefault();
        if (change == null)
        {
            return null;
        }

        previous = new LibraryStateResponse
        {
            ItemId = change.Id,
            Path = change.FullPath,
            IsFavorite = change.PreviousIsFavorite,
            IsBlacklisted = change.PreviousIsBlacklisted
        };
        return new LibraryStateResponse
        {
            ItemId = change.Id,
            Path = change.FullPath,
            IsFavorite = change.IsFavorite,
            IsBlacklisted = change.IsBlacklisted
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
