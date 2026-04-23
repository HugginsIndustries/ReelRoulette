using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

// M4 guardrail: keep this service focused on transport-facing state projection/event streaming
// and move business-rule expansion to ReelRoulette.Core services as migrations continue.
public sealed class ServerStateService
{
    private static readonly string[] SupportedApiVersions = ["1", "0"];
    private static readonly string[] Capabilities =
    [
        "auth.sessionCookie",
        "identity.sessionId",
        "events.refreshStatusChanged",
        "events.resyncRequired",
        "api.random.filterState",
        "api.presets.match",
        "api.webRuntime.settings",
        "api.library.projection",
        "api.sources.import",
        "api.duplicates",
        "api.autotag",
        "api.playback.clearStats",
        "api.logs.client",
        "control.status",
        "control.settings",
        "control.lifecycle.stopRestart",
        "control.telemetry.events",
        "control.clients.connected",
        "control.logs.server",
        "control.testing.suite"
    ];

    private const string UncategorizedCategoryId = "uncategorized";
    private const string UncategorizedCategoryName = "Uncategorized";
    private readonly object _revisionLock = new();
    private readonly object _subscribersLock = new();
    private readonly object _historyLock = new();
    private readonly object _itemStatesLock = new();
    private readonly object _filterSessionLock = new();
    private readonly object _tagLock = new();
    private readonly object _sourceLock = new();
    private readonly ILogger<ServerStateService> _logger;
    private readonly string _presetsPath;
    private readonly string _libraryPath;
    private long _revision;
    private readonly Dictionary<string, ItemStateRecord> _itemStates = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Channel<ServerEventEnvelope>> _subscribers = new();
    private readonly Queue<ServerEventEnvelope> _eventHistory = new();
    private const int EventHistoryCapacity = 256;
    private readonly Dictionary<string, HashSet<string>> _itemTags = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<TagCategorySnapshot> _tagCategories = [];
    private readonly List<TagSnapshot> _tags = [];
    private List<FilterPresetSnapshot> _presetCatalog = [];
    private readonly List<SourceRecord> _sources = [];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public ServerStateService(ILogger<ServerStateService>? logger = null, string? appDataPathOverride = null)
    {
        _logger = logger ?? NullLogger<ServerStateService>.Instance;
        var roamingAppData = appDataPathOverride ??
                             Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(roamingAppData);
        _presetsPath = Path.Combine(roamingAppData, "presets.json");
        _libraryPath = Path.Combine(roamingAppData, "library.json");
        if (!string.IsNullOrWhiteSpace(appDataPathOverride))
        {
            BootstrapFromDisk();
        }
    }

    public VersionResponse GetVersion()
    {
        return ApiContractMapper.MapVersion(
            "1",
            assetsVersion: "0.12.0-dev",
            minimumCompatibleApiVersion: "0",
            supportedApiVersions: SupportedApiVersions,
            capabilities: Capabilities);
    }

    public void SetFavorite(FavoriteRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void SetBlacklist(BlacklistRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void RecordPlayback(RecordPlaybackRequest request, int? playCount = null, DateTime? lastPlayedUtc = null)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
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

    public IReadOnlyList<FilterPresetSnapshot> GetPresetCatalogSnapshot()
    {
        lock (_filterSessionLock)
        {
            return ClonePresetCatalog(_presetCatalog);
        }
    }

    public void SetPresetCatalog(IEnumerable<FilterPresetSnapshot>? presets)
    {
        lock (_filterSessionLock)
        {
            _presetCatalog = ClonePresetCatalog(presets ?? []);
        }

        PersistPresetCatalog();
    }

    public bool RenameTagInPresetCatalogOnly(string oldName, string newName)
    {
        if (string.IsNullOrWhiteSpace(oldName) || string.IsNullOrWhiteSpace(newName))
        {
            return false;
        }

        var changed = RenameTagInPresetCatalog(oldName, newName);
        if (changed)
        {
            PersistPresetCatalog();
        }

        return changed;
    }

    public bool RemoveTagFromPresetCatalogOnly(string tagName)
    {
        if (string.IsNullOrWhiteSpace(tagName))
        {
            return false;
        }

        var changed = RemoveTagFromPresetCatalog(tagName);
        if (changed)
        {
            PersistPresetCatalog();
        }

        return changed;
    }

    public IReadOnlyList<SourceResponse> GetSourcesSnapshot()
    {
        lock (_sourceLock)
        {
            return _sources
                .Select(source => ApiContractMapper.MapSource(source.Id, source.RootPath, source.DisplayName, source.IsEnabled))
                .OrderBy(source => source.DisplayName ?? source.RootPath, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }

    public IReadOnlyList<TagCategorySnapshot> GetTagCategoriesSnapshot()
    {
        lock (_tagLock)
        {
            EnsureUncategorizedCategoryLocked();
            return _tagCategories
                .Select(CloneCategory)
                .OrderBy(category => category.SortOrder)
                .ThenBy(category => category.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }

    public IReadOnlyList<TagSnapshot> GetTagsSnapshot()
    {
        lock (_tagLock)
        {
            return _tags
                .Select(CloneTag)
                .OrderBy(tag => tag.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }

    public bool TrySetSourceEnabled(string sourceId, bool isEnabled, out SourceResponse? source)
    {
        source = null;
        if (string.IsNullOrWhiteSpace(sourceId))
        {
            return false;
        }

        SourceRecord? updated = null;
        var changed = false;
        lock (_sourceLock)
        {
            updated = _sources.FirstOrDefault(s => string.Equals(s.Id, sourceId.Trim(), StringComparison.OrdinalIgnoreCase));
            if (updated == null)
            {
                return false;
            }

            if (updated.IsEnabled != isEnabled)
            {
                updated.IsEnabled = isEnabled;
                changed = true;
            }
        }

        if (updated == null)
        {
            return false;
        }

        if (changed)
        {
            PersistSourceStates();
            Publish("sourceStateChanged", new SourceStateChangedPayload
            {
                SourceId = updated.Id,
                IsEnabled = updated.IsEnabled
            });
        }

        source = ApiContractMapper.MapSource(updated.Id, updated.RootPath, updated.DisplayName, updated.IsEnabled);
        return true;
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
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void UpsertCategory(UpsertCategoryRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void UpsertTag(UpsertTagRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void RenameTag(RenameTagRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void DeleteTag(DeleteTagRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void DeleteCategory(DeleteCategoryRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void SyncTagCatalog(SyncTagCatalogRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
    }

    public void SyncItemTags(SyncItemTagsRequest request)
    {
        throw new NotSupportedException("Mutation authority moved to LibraryOperationsService.");
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

    public int GetSubscriberCount()
    {
        lock (_subscribersLock)
        {
            return _subscribers.Count;
        }
    }

    public ServerEventEnvelope PublishExternal(string eventType, object payload)
    {
        return Publish(eventType, payload);
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
                    ItemId = path,
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

    private static List<FilterPresetSnapshot> ClonePresetCatalog(IEnumerable<FilterPresetSnapshot> source)
    {
        return source
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .Select(p => new FilterPresetSnapshot
            {
                Name = p.Name.Trim(),
                FilterState = p.FilterState
            })
            .GroupBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();
    }

    private bool RenameTagInPresetCatalog(string oldName, string newName)
    {
        var changed = false;
        lock (_filterSessionLock)
        {
            foreach (var preset in _presetCatalog)
            {
                if (!TryMutatePresetFilterState(preset.FilterState, root =>
                    RenameTagInFilterArray(root, "selectedTags", oldName, newName) |
                    RenameTagInFilterArray(root, "excludedTags", oldName, newName),
                    out var updated))
                {
                    continue;
                }

                preset.FilterState = updated;
                changed = true;
            }
        }

        return changed;
    }

    private bool RemoveTagFromPresetCatalog(string tagName)
    {
        var changed = false;
        lock (_filterSessionLock)
        {
            foreach (var preset in _presetCatalog)
            {
                if (!TryMutatePresetFilterState(preset.FilterState, root =>
                    RemoveTagFromFilterArray(root, "selectedTags", tagName) |
                    RemoveTagFromFilterArray(root, "excludedTags", tagName),
                    out var updated))
                {
                    continue;
                }

                preset.FilterState = updated;
                changed = true;
            }
        }

        return changed;
    }

    private static bool TryMutatePresetFilterState(JsonElement source, Func<JsonObject, bool> mutate, out JsonElement updated)
    {
        updated = source;
        JsonObject root;
        try
        {
            root = JsonNode.Parse(source.GetRawText()) as JsonObject ?? new JsonObject();
        }
        catch
        {
            return false;
        }

        if (!mutate(root))
        {
            return false;
        }

        updated = JsonSerializer.SerializeToElement(root, JsonOptions);
        return true;
    }

    private static bool RenameTagInFilterArray(JsonObject root, string arrayName, string oldName, string newName)
    {
        if (root[arrayName] is not JsonArray array)
        {
            return false;
        }

        var changed = false;
        for (var i = 0; i < array.Count; i++)
        {
            var value = array[i]?.GetValue<string>();
            if (!string.Equals(value, oldName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            array[i] = newName;
            changed = true;
        }

        return changed;
    }

    private static bool RemoveTagFromFilterArray(JsonObject root, string arrayName, string tagName)
    {
        if (root[arrayName] is not JsonArray array)
        {
            return false;
        }

        var changed = false;
        for (var i = array.Count - 1; i >= 0; i--)
        {
            var value = array[i]?.GetValue<string>();
            if (!string.Equals(value, tagName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            array.RemoveAt(i);
            changed = true;
        }

        return changed;
    }

    private void PersistPresetCatalog()
    {
        try
        {
            IReadOnlyList<FilterPresetSnapshot> snapshot;
            lock (_filterSessionLock)
            {
                snapshot = ClonePresetCatalog(_presetCatalog);
            }

            var serialized = JsonSerializer.Serialize(snapshot, JsonOptions);
            File.WriteAllText(_presetsPath, serialized);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist preset catalog to '{Path}'.", _presetsPath);
        }
    }

    private void BootstrapFromDisk()
    {
        try
        {
            if (File.Exists(_presetsPath))
            {
                var rawPresets = File.ReadAllText(_presetsPath);
                var parsedPresets = JsonSerializer.Deserialize<List<FilterPresetSnapshot>>(rawPresets, JsonOptions) ?? [];
                lock (_filterSessionLock)
                {
                    _presetCatalog = ClonePresetCatalog(parsedPresets);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to bootstrap preset catalog from '{PresetsPath}'.", _presetsPath);
        }

        try
        {
            if (!File.Exists(_libraryPath))
            {
                return;
            }

            var root = JsonNode.Parse(File.ReadAllText(_libraryPath)) as JsonObject;
            if (root == null)
            {
                return;
            }

            lock (_sourceLock)
            {
                _sources.Clear();
                var sources = root["sources"] as JsonArray;
                if (sources != null)
                {
                    foreach (var node in sources.OfType<JsonObject>())
                    {
                        var id = node["id"]?.GetValue<string>()?.Trim();
                        var rootPath = node["rootPath"]?.GetValue<string>()?.Trim();
                        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(rootPath))
                        {
                            continue;
                        }

                        _sources.Add(new SourceRecord
                        {
                            Id = id,
                            RootPath = rootPath,
                            DisplayName = node["displayName"]?.GetValue<string>()?.Trim(),
                            IsEnabled = node["isEnabled"]?.GetValue<bool?>() ?? true
                        });
                    }
                }
            }

            lock (_tagLock)
            {
                _tagCategories.Clear();
                _tags.Clear();

                var categories = root["categories"] as JsonArray;
                if (categories != null)
                {
                    foreach (var node in categories.OfType<JsonObject>())
                    {
                        var id = NormalizeCategoryId(node["id"]?.GetValue<string>());
                        var name = node["name"]?.GetValue<string>()?.Trim();
                        if (string.IsNullOrWhiteSpace(name))
                        {
                            continue;
                        }

                        if (_tagCategories.Any(category => string.Equals(category.Id, id, StringComparison.OrdinalIgnoreCase)))
                        {
                            continue;
                        }

                        _tagCategories.Add(new TagCategorySnapshot
                        {
                            Id = id,
                            Name = name,
                            SortOrder = node["sortOrder"]?.GetValue<int?>() ?? _tagCategories.Count
                        });
                    }
                }

                var tags = root["tags"] as JsonArray;
                if (tags != null)
                {
                    foreach (var node in tags.OfType<JsonObject>())
                    {
                        var name = node["name"]?.GetValue<string>()?.Trim();
                        if (string.IsNullOrWhiteSpace(name))
                        {
                            continue;
                        }

                        var categoryId = NormalizeCategoryId(node["categoryId"]?.GetValue<string>());
                        _tags.RemoveAll(tag => string.Equals(tag.Name, name, StringComparison.OrdinalIgnoreCase));
                        _tags.Add(new TagSnapshot
                        {
                            Name = name,
                            CategoryId = categoryId
                        });
                    }
                }

                EnsureUncategorizedCategoryLocked();
            }

            lock (_itemStatesLock)
            lock (_tagLock)
            {
                var items = root["items"] as JsonArray;
                if (items == null)
                {
                    return;
                }

                foreach (var node in items.OfType<JsonObject>())
                {
                    var path = node["fullPath"]?.GetValue<string>()?.Trim();
                    if (string.IsNullOrWhiteSpace(path))
                    {
                        continue;
                    }

                    var isFavorite = node["isFavorite"]?.GetValue<bool?>() ?? false;
                    var isBlacklisted = node["isBlacklisted"]?.GetValue<bool?>() ?? false;
                    _itemStates[path] = new ItemStateRecord
                    {
                        Payload = new ItemStateChangedPayload
                        {
                            ItemId = path,
                            Path = path,
                            IsFavorite = isFavorite,
                            IsBlacklisted = isBlacklisted
                        },
                        Revision = 0
                    };

                    var itemTags = node["tags"] as JsonArray;
                    _itemTags[path] = (itemTags ?? new JsonArray())
                        .Select(tag => tag?.GetValue<string>()?.Trim())
                        .Where(tag => !string.IsNullOrWhiteSpace(tag))
                        .Select(tag => tag!)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to bootstrap server state from '{Path}'.", _libraryPath);
        }
    }

    /// <summary>
    /// Clears in-memory library/preset projection and reloads from disk (for example after library migration import).
    /// </summary>
    public void ReloadLibraryAndPresetsFromDisk()
    {
        lock (_filterSessionLock)
        {
            _presetCatalog = [];
        }

        lock (_sourceLock)
        {
            _sources.Clear();
        }

        lock (_tagLock)
        {
            _tagCategories.Clear();
            _tags.Clear();
        }

        lock (_itemStatesLock)
        lock (_tagLock)
        {
            _itemStates.Clear();
            _itemTags.Clear();
        }

        BootstrapFromDisk();
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

    private string ResolveCategoryIdForTag(string tagName)
    {
        var existing = _tags.FirstOrDefault(t => string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase));
        return string.IsNullOrWhiteSpace(existing?.CategoryId)
            ? UncategorizedCategoryId
            : NormalizeCategoryId(existing.CategoryId);
    }

    private void EnsureTagExists(string tagName, string categoryId, bool keepExistingCategory = false)
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

        if (keepExistingCategory)
        {
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

    private void PersistSourceStates()
    {
        try
        {
            if (!File.Exists(_libraryPath))
            {
                return;
            }

            JsonObject? root;
            try
            {
                root = JsonNode.Parse(File.ReadAllText(_libraryPath)) as JsonObject;
            }
            catch
            {
                return;
            }

            if (root == null)
            {
                return;
            }

            var sourceStateById = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            lock (_sourceLock)
            {
                foreach (var source in _sources)
                {
                    sourceStateById[source.Id] = source.IsEnabled;
                }
            }

            var sources = root["sources"] as JsonArray;
            if (sources == null)
            {
                return;
            }

            foreach (var sourceNode in sources.OfType<JsonObject>())
            {
                var id = sourceNode["id"]?.GetValue<string>()?.Trim();
                if (string.IsNullOrWhiteSpace(id))
                {
                    continue;
                }

                if (sourceStateById.TryGetValue(id, out var isEnabled))
                {
                    sourceNode["isEnabled"] = isEnabled;
                }
            }

            File.WriteAllText(_libraryPath, root.ToJsonString(JsonOptions));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist source enabled states to '{Path}'.", _libraryPath);
        }
    }

    private sealed class ItemStateRecord
    {
        public ItemStateChangedPayload Payload { get; init; } = new();
        public long Revision { get; set; }
    }

    private sealed class SourceRecord
    {
        public string Id { get; set; } = string.Empty;
        public string RootPath { get; set; } = string.Empty;
        public string? DisplayName { get; set; }
        public bool IsEnabled { get; set; } = true;
    }
}

public sealed class ReplayResult
{
    public long CurrentRevision { get; init; }
    public bool GapDetected { get; init; }
    public IReadOnlyList<ServerEventEnvelope> Events { get; init; } = [];
}
