using System.Threading.Channels;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

// M4 guardrail: keep this service focused on transport-facing state projection/event streaming
// and move business-rule expansion to ReelRoulette.Core services as migrations continue.
public sealed class ServerStateService
{
    private const string UncategorizedCategoryId = "uncategorized";
    private const string UncategorizedCategoryName = "Uncategorized";
    private readonly object _revisionLock = new();
    private readonly object _subscribersLock = new();
    private readonly object _historyLock = new();
    private readonly object _itemStatesLock = new();
    private readonly object _filterSessionLock = new();
    private readonly object _tagLock = new();
    private long _revision;
    private readonly Dictionary<string, ItemStateRecord> _itemStates = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Channel<ServerEventEnvelope>> _subscribers = new();
    private readonly Queue<ServerEventEnvelope> _eventHistory = new();
    private readonly Random _random = new();
    private const int EventHistoryCapacity = 256;
    private FilterSessionSnapshot _filterSession = new();
    private readonly Dictionary<string, HashSet<string>> _itemTags = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<TagCategorySnapshot> _tagCategories = [];
    private readonly List<TagSnapshot> _tags = [];

    private static readonly List<PresetResponse> Presets =
    [
        ApiContractMapper.MapPreset("all-media", "All Media", "Default full library preset"),
        ApiContractMapper.MapPreset("favorites", "Favorites", "Favorite items only")
    ];

    public VersionResponse GetVersion()
    {
        return ApiContractMapper.MapVersion("1", assetsVersion: "m4");
    }

    public IReadOnlyList<PresetResponse> GetPresets()
    {
        return Presets;
    }

    public RandomResponse GetRandom(RandomRequest request)
    {
        var mediaType = request.IncludeVideos && !request.IncludePhotos
            ? "video"
            : request.IncludePhotos && !request.IncludeVideos
                ? "photo"
                : "video";

        var id = $"{request.PresetId}-{_random.Next(1000, 9999)}";
        return ApiContractMapper.MapRandomResult(
            id: id,
            displayName: $"Random Item {id}",
            mediaType: mediaType,
            durationSeconds: mediaType == "video" ? 42 : null,
            mediaUrl: $"/api/media/{id}",
            isFavorite: false,
            isBlacklisted: false);
    }

    public void SetFavorite(FavoriteRequest request)
    {
        var current = GetOrCreateItemState(request.Path);
        current.Payload.IsFavorite = request.IsFavorite;
        if (request.IsFavorite)
        {
            // Favorite/blacklist must remain mutually exclusive.
            current.Payload.IsBlacklisted = false;
        }
        var envelope = Publish("itemStateChanged", current.Payload);
        current.Revision = envelope.Revision;
    }

    public void SetBlacklist(BlacklistRequest request)
    {
        var current = GetOrCreateItemState(request.Path);
        current.Payload.IsBlacklisted = request.IsBlacklisted;
        if (request.IsBlacklisted)
        {
            // Favorite/blacklist must remain mutually exclusive.
            current.Payload.IsFavorite = false;
        }
        var envelope = Publish("itemStateChanged", current.Payload);
        current.Revision = envelope.Revision;
    }

    public void RecordPlayback(RecordPlaybackRequest request)
    {
        var payload = new PlaybackRecordedPayload
        {
            Path = request.Path,
            ClientId = request.ClientId
        };
        Publish("playbackRecorded", payload);
    }

    public ReplayResult GetReplayAfter(long revision)
    {
        var currentRevision = GetCurrentRevision();
        lock (_historyLock)
        {
            if (_eventHistory.Count == 0)
            {
                return new ReplayResult
                {
                    CurrentRevision = currentRevision,
                    GapDetected = revision > 0 && currentRevision > revision,
                    Events = []
                };
            }

            var snapshot = _eventHistory.ToArray();
            var oldestRevision = snapshot[0].Revision;
            var gapDetected = revision > 0 && currentRevision > revision && revision < oldestRevision - 1;
            var replay = snapshot.Where(e => e.Revision > revision).ToList();
            return new ReplayResult
            {
                CurrentRevision = currentRevision,
                GapDetected = gapDetected,
                Events = replay
            };
        }
    }

    public IReadOnlyList<LibraryStateResponse> GetLibraryStates(LibraryStatesRequest? request)
    {
        var requestedPaths = request?.Paths?
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        List<ItemStateRecord> items;
        lock (_itemStatesLock)
        {
            items = _itemStates.Values.ToList();
        }

        if (requestedPaths is { Count: > 0 })
        {
            items = items.Where(record => requestedPaths.Contains(record.Payload.Path)).ToList();
        }

        return items
            .OrderBy(record => record.Payload.Path, StringComparer.OrdinalIgnoreCase)
            .Select(record => new LibraryStateResponse
            {
                ItemId = record.Payload.ItemId,
                Path = record.Payload.Path,
                IsFavorite = record.Payload.IsFavorite,
                IsBlacklisted = record.Payload.IsBlacklisted,
                Revision = record.Revision
            })
            .ToList();
    }

    public FilterSessionSnapshot GetFilterSessionSnapshot()
    {
        lock (_filterSessionLock)
        {
            return CloneFilterSession(_filterSession);
        }
    }

    public void SetFilterSessionSnapshot(FilterSessionSnapshot snapshot)
    {
        lock (_filterSessionLock)
        {
            _filterSession = CloneFilterSession(snapshot);
        }

        Publish("filterSessionChanged", GetFilterSessionSnapshot());
    }

    public TagEditorModelResponse GetTagEditorModel(TagEditorModelRequest? request)
    {
        var itemIds = request?.ItemIds?
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList() ?? [];

        lock (_tagLock)
        {
            EnsureUncategorizedCategoryLocked();
            var items = itemIds
                .Select(id => new ItemTagsSnapshot
                {
                    ItemId = id,
                    Tags = GetOrCreateItemTags(id).OrderBy(t => t, StringComparer.OrdinalIgnoreCase).ToList()
                })
                .ToList();

            return new TagEditorModelResponse
            {
                Categories = _tagCategories
                    .OrderBy(c => c.SortOrder)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(CloneCategory)
                    .ToList(),
                Tags = _tags
                    .OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(CloneTag)
                    .ToList(),
                Items = items
            };
        }
    }

    public void ApplyItemTags(ApplyItemTagsRequest request)
    {
        var itemIds = request.ItemIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var addTags = request.AddTags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var removeTags = request.RemoveTags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (itemIds.Count == 0 || (addTags.Count == 0 && removeTags.Count == 0))
        {
            return;
        }

        lock (_tagLock)
        {
            foreach (var itemId in itemIds)
            {
                var tags = GetOrCreateItemTags(itemId);
                foreach (var removeTag in removeTags)
                {
                    tags.Remove(removeTag);
                }

                foreach (var addTag in addTags)
                {
                    tags.Add(addTag);
                    EnsureTagExists(addTag, UncategorizedCategoryId);
                }
            }
        }

        Publish("itemTagsChanged", new ItemTagsChangedPayload
        {
            ItemIds = itemIds,
            AddedTags = addTags,
            RemovedTags = removeTags
        });
    }

    public void UpsertCategory(UpsertCategoryRequest request)
    {
        lock (_tagLock)
        {
            var categoryId = NormalizeCategoryId(request.Id);
            if (string.IsNullOrWhiteSpace(categoryId))
            {
                categoryId = UncategorizedCategoryId;
            }

            if (string.Equals(categoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
            {
                EnsureUncategorizedCategoryLocked();
                return;
            }

            var existing = _tagCategories.FirstOrDefault(c => string.Equals(c.Id, categoryId, StringComparison.OrdinalIgnoreCase));
            if (existing == null)
            {
                _tagCategories.Add(new TagCategorySnapshot
                {
                    Id = categoryId,
                    Name = request.Name,
                    SortOrder = request.SortOrder ?? _tagCategories.Count
                });
            }
            else
            {
                existing.Name = request.Name;
                if (request.SortOrder.HasValue)
                {
                    existing.SortOrder = request.SortOrder.Value;
                }
            }
        }

        Publish("tagCatalogChanged", CreateTagCatalogPayload("upsertCategory"));
    }

    public void UpsertTag(UpsertTagRequest request)
    {
        lock (_tagLock)
        {
            EnsureTagExists(request.Name, NormalizeCategoryId(request.CategoryId));
        }

        Publish("tagCatalogChanged", CreateTagCatalogPayload("upsertTag"));
    }

    public void RenameTag(RenameTagRequest request)
    {
        lock (_tagLock)
        {
            var existing = _tags.FirstOrDefault(t => string.Equals(t.Name, request.OldName, StringComparison.OrdinalIgnoreCase));
            if (existing == null)
            {
                return;
            }

            existing.Name = request.NewName;
            if (request.NewCategoryId != null)
            {
                existing.CategoryId = NormalizeCategoryId(request.NewCategoryId);
            }

            foreach (var itemTags in _itemTags.Values)
            {
                if (itemTags.Remove(request.OldName))
                {
                    itemTags.Add(request.NewName);
                }
            }
        }

        Publish("tagCatalogChanged", CreateTagCatalogPayload("renameTag"));
    }

    public void DeleteTag(DeleteTagRequest request)
    {
        lock (_tagLock)
        {
            _tags.RemoveAll(t => string.Equals(t.Name, request.Name, StringComparison.OrdinalIgnoreCase));
            foreach (var itemTags in _itemTags.Values)
            {
                itemTags.Remove(request.Name);
            }
        }

        Publish("tagCatalogChanged", CreateTagCatalogPayload("deleteTag"));
    }

    public void DeleteCategory(DeleteCategoryRequest request)
    {
        lock (_tagLock)
        {
            var sourceCategoryId = NormalizeCategoryId(request.CategoryId);
            if (string.Equals(sourceCategoryId, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var targetCategoryId = request.NewCategoryId == null
                ? UncategorizedCategoryId
                : NormalizeCategoryId(request.NewCategoryId);

            EnsureUncategorizedCategoryLocked();
            _tagCategories.RemoveAll(c => string.Equals(c.Id, sourceCategoryId, StringComparison.OrdinalIgnoreCase));
            foreach (var tag in _tags.Where(t => string.Equals(t.CategoryId, sourceCategoryId, StringComparison.OrdinalIgnoreCase)))
            {
                tag.CategoryId = targetCategoryId;
            }
        }

        Publish("tagCatalogChanged", CreateTagCatalogPayload("deleteCategory"));
    }

    public void SyncTagCatalog(SyncTagCatalogRequest request)
    {
        lock (_tagLock)
        {
            _tagCategories.Clear();
            foreach (var category in request.Categories
                         .Where(c => !string.IsNullOrWhiteSpace(c.Name))
                         .Select(CloneCategory))
            {
                category.Id = NormalizeCategoryId(category.Id);
                if (string.Equals(category.Id, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase))
                {
                    category.Id = UncategorizedCategoryId;
                    category.Name = UncategorizedCategoryName;
                    category.SortOrder = int.MaxValue;
                }

                if (_tagCategories.Any(c => string.Equals(c.Id, category.Id, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                _tagCategories.Add(category);
            }

            _tags.Clear();
            foreach (var tag in request.Tags
                         .Where(t => !string.IsNullOrWhiteSpace(t.Name))
                         .Select(CloneTag))
            {
                tag.CategoryId = NormalizeCategoryId(tag.CategoryId);
                _tags.RemoveAll(t => string.Equals(t.Name, tag.Name, StringComparison.OrdinalIgnoreCase));
                _tags.Add(tag);
            }

            EnsureUncategorizedCategoryLocked();
        }

        Publish("tagCatalogChanged", CreateTagCatalogPayload("syncCatalog"));
    }

    public void SyncItemTags(SyncItemTagsRequest request)
    {
        lock (_tagLock)
        {
            foreach (var item in request.Items.Where(i => !string.IsNullOrWhiteSpace(i.ItemId)))
            {
                var itemId = item.ItemId.Trim();
                _itemTags[itemId] = (item.Tags ?? [])
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .Select(t => t.Trim())
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
            }
        }
    }

    public ChannelReader<ServerEventEnvelope> Subscribe(CancellationToken cancellationToken)
    {
        var channel = Channel.CreateUnbounded<ServerEventEnvelope>();
        lock (_subscribersLock)
        {
            _subscribers.Add(channel);
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(Timeout.Infinite, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // expected on disconnect
            }
            finally
            {
                lock (_subscribersLock)
                {
                    _subscribers.Remove(channel);
                }

                channel.Writer.TryComplete();
            }
        }, CancellationToken.None);

        return channel.Reader;
    }

    private ItemStateRecord GetOrCreateItemState(string path)
    {
        lock (_itemStatesLock)
        {
            if (_itemStates.TryGetValue(path, out var existing))
            {
                return existing;
            }

            var created = new ItemStateRecord
            {
                Payload = new ItemStateChangedPayload
                {
                    ItemId = Guid.NewGuid().ToString("N"),
                    Path = path,
                    IsFavorite = false,
                    IsBlacklisted = false
                },
                Revision = 0
            };
            _itemStates[path] = created;
            return created;
        }
    }

    public ServerEventEnvelope CreateEnvelope(string eventType, object payload)
    {
        long revision;
        lock (_revisionLock)
        {
            revision = ++_revision;
        }

        return new ServerEventEnvelope
        {
            Revision = revision,
            EventType = eventType,
            Timestamp = DateTimeOffset.UtcNow,
            Payload = payload
        };
    }

    public long GetCurrentRevision()
    {
        lock (_revisionLock)
        {
            return _revision;
        }
    }

    private ServerEventEnvelope Publish(string eventType, object payload)
    {
        var envelope = CreateEnvelope(eventType, payload);
        lock (_historyLock)
        {
            _eventHistory.Enqueue(envelope);
            while (_eventHistory.Count > EventHistoryCapacity)
            {
                _eventHistory.Dequeue();
            }
        }

        List<Channel<ServerEventEnvelope>> subscribersSnapshot;
        lock (_subscribersLock)
        {
            subscribersSnapshot = _subscribers.ToList();
        }

        foreach (var subscriber in subscribersSnapshot)
        {
            subscriber.Writer.TryWrite(envelope);
        }

        return envelope;
    }

    private static FilterSessionSnapshot CloneFilterSession(FilterSessionSnapshot source)
    {
        return new FilterSessionSnapshot
        {
            ActivePresetName = source.ActivePresetName,
            CurrentFilterState = source.CurrentFilterState,
            Presets = source.Presets?.Select(p => new FilterPresetSnapshot
            {
                Name = p.Name,
                FilterState = p.FilterState
            }).ToList() ?? []
        };
    }

    private HashSet<string> GetOrCreateItemTags(string itemId)
    {
        if (_itemTags.TryGetValue(itemId, out var existing))
        {
            return existing;
        }

        var created = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        _itemTags[itemId] = created;
        return created;
    }

    private void EnsureTagExists(string tagName, string categoryId)
    {
        var normalizedCategoryId = NormalizeCategoryId(categoryId);
        EnsureUncategorizedCategoryLocked();
        var existing = _tags.FirstOrDefault(t => string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase));
        if (existing == null)
        {
            _tags.Add(new TagSnapshot
            {
                Name = tagName,
                CategoryId = normalizedCategoryId
            });
            return;
        }

        existing.CategoryId = normalizedCategoryId;
    }

    private static string NormalizeCategoryId(string? categoryId)
    {
        return string.IsNullOrWhiteSpace(categoryId)
            ? UncategorizedCategoryId
            : categoryId.Trim();
    }

    private void EnsureUncategorizedCategoryLocked()
    {
        var existing = _tagCategories.FirstOrDefault(c => string.Equals(c.Id, UncategorizedCategoryId, StringComparison.OrdinalIgnoreCase));
        if (existing == null)
        {
            _tagCategories.Add(new TagCategorySnapshot
            {
                Id = UncategorizedCategoryId,
                Name = UncategorizedCategoryName,
                SortOrder = int.MaxValue
            });
            return;
        }

        existing.Id = UncategorizedCategoryId;
        existing.Name = UncategorizedCategoryName;
        existing.SortOrder = int.MaxValue;
    }

    private TagCatalogChangedPayload CreateTagCatalogPayload(string reason)
    {
        lock (_tagLock)
        {
            return new TagCatalogChangedPayload
            {
                Reason = reason,
                Categories = _tagCategories.Select(CloneCategory).ToList(),
                Tags = _tags.Select(CloneTag).ToList()
            };
        }
    }

    private static TagCategorySnapshot CloneCategory(TagCategorySnapshot source)
    {
        return new TagCategorySnapshot
        {
            Id = source.Id,
            Name = source.Name,
            SortOrder = source.SortOrder
        };
    }

    private static TagSnapshot CloneTag(TagSnapshot source)
    {
        return new TagSnapshot
        {
            Name = source.Name,
            CategoryId = source.CategoryId
        };
    }

    private sealed class ItemStateRecord
    {
        public ItemStateChangedPayload Payload { get; init; } = new();
        public long Revision { get; set; }
    }
}

public sealed class ReplayResult
{
    public long CurrentRevision { get; init; }
    public bool GapDetected { get; init; }
    public IReadOnlyList<ServerEventEnvelope> Events { get; init; } = [];
}
