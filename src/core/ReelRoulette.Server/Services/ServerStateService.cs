using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.Extensions.Logging.Abstractions;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

// M4 guardrail: keep this service focused on transport-facing state projection/event streaming
// and move business-rule expansion to ReelRoulette.Core services as migrations continue.
public sealed class ServerStateService
{
    // Version 2 names items only by id on every route that takes an item id, and makes clearing every item's
    // playback stats explicit, so clients written for version 1, such as the retired desktop app, refuse a server
    // that reports it.
    private static readonly string[] SupportedApiVersions = ["2"];
    private static readonly string[] Capabilities =
    [
        "auth.sessionCookie",
        "identity.sessionId",
        "events.refreshStatusChanged",
        "events.resyncRequired",
        "api.random.filterState",
        "api.presets.match",
        "api.webRuntime.settings",
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

    private readonly object _revisionLock = new();
    private readonly object _subscribersLock = new();
    private readonly object _historyLock = new();
    private readonly object _filterSessionLock = new();
    private readonly object _sourceLock = new();
    private readonly ILogger<ServerStateService> _logger;
    private readonly LibraryCatalogHost? _catalog;
    private readonly ServerLogService? _serverLog;
    private long _revision;
    private readonly List<Channel<ServerEventEnvelope>> _subscribers = new();
    private readonly Queue<ServerEventEnvelope> _eventHistory = new();
    private const int EventHistoryCapacity = 256;
    private List<StoredPreset> _presetCatalog = [];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public ServerStateService(
        ILogger<ServerStateService>? logger = null,
        LibraryCatalogHost? catalog = null,
        ServerLogService? serverLog = null)
    {
        _logger = logger ?? NullLogger<ServerStateService>.Instance;
        // Without a catalog, nothing touches disk.
        _catalog = catalog;
        _serverLog = serverLog;

        if (_catalog != null)
        {
            BootstrapFromDisk();
        }
    }

    public VersionResponse GetVersion()
    {
        return ApiContractMapper.MapVersion(
            "2",
            assetsVersion: "0.15.0-dev.1",
            minimumCompatibleApiVersion: "2",
            supportedApiVersions: SupportedApiVersions,
            capabilities: Capabilities);
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
                    GapDetected = currentRevision != revision,
                    Events = []
                };
            }

            var snapshot = _eventHistory.ToArray();
            var oldestRevision = snapshot[0].Revision;
            // A last event ID ahead of the current revision comes from before a server restart. A last event ID of 0
            // is a client that opened its stream before any event, and replays from the first one.
            var gapDetected = revision > currentRevision || (currentRevision > revision && revision < oldestRevision - 1);
            var replay = snapshot.Where(e => e.Revision > revision).ToList();
            return new ReplayResult
            {
                CurrentRevision = currentRevision,
                GapDetected = gapDetected,
                Events = replay
            };
        }
    }

    public IReadOnlyList<StoredPreset> GetPresetCatalogSnapshot()
    {
        lock (_filterSessionLock)
        {
            return _presetCatalog.Select(ClonePreset).ToList();
        }
    }

    /// <summary>
    /// Replaces every preset with the posted list, keeping each preset's id by its name, ignoring case, and giving a
    /// new name a new id. A preset without a name is left out, and so is one named as an earlier one.
    /// </summary>
    public void SetPresetCatalog(IEnumerable<FilterPresetSnapshot>? presets)
    {
        lock (_filterSessionLock)
        {
            var ids = _presetCatalog.ToDictionary(preset => preset.Name, preset => preset.Id, StringComparer.OrdinalIgnoreCase);
            var replaced = (presets ?? [])
                .Where(preset => !string.IsNullOrWhiteSpace(preset.Name))
                .GroupBy(preset => preset.Name.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(group => new StoredPreset
                {
                    Id = ids.TryGetValue(group.Key, out var id) ? id : NewPresetId(),
                    Name = group.Key,
                    FilterState = group.First().FilterState
                })
                .ToList();
            try
            {
                WriteCatalog(session => session.ReplacePresets(replaced.Select(ToCatalogPreset).ToList()));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist preset catalog.");
            }

            _presetCatalog = replaced;
        }
    }

    /// <summary>
    /// Adds a preset after every other one, with a new id. It is refused for an empty name or another preset's,
    /// ignoring case, for a filter state that is not an object, and for the default filter or another preset's.
    /// </summary>
    public PresetWriteResult CreatePreset(string? name, JsonElement? filterState, string? clientId)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        lock (_filterSessionLock)
        {
            var refused = RefuseName(trimmed, exceptId: null) ?? RefuseFilter(filterState, exceptId: null);
            if (refused != null)
            {
                return refused;
            }

            var preset = new StoredPreset { Id = NewPresetId(), Name = trimmed, FilterState = filterState!.Value.Clone() };
            WriteCatalog(session => session.CreatePreset(ToCatalogPreset(preset)));
            _presetCatalog.Add(preset);
            return Changed(preset.Id, clientId);
        }
    }

    /// <summary>
    /// Replaces a preset's filter state. It is refused, as for a new preset, for the default filter or another
    /// preset's; the preset's own filter is taken.
    /// </summary>
    public PresetWriteResult UpdatePresetFilter(string? id, JsonElement? filterState, string? clientId)
    {
        lock (_filterSessionLock)
        {
            var preset = FindPreset(id);
            if (preset == null)
            {
                return PresetNotFound();
            }

            var refused = RefuseFilter(filterState, preset.Id);
            if (refused != null)
            {
                return refused;
            }

            var stored = filterState!.Value.Clone();
            var unsaved = WritePresetChange($"update of {preset.Id}", session => session.UpdatePresetFilter(preset.Id, stored.GetRawText()));
            if (unsaved != null)
            {
                return unsaved;
            }

            preset.FilterState = stored;
            return Changed(preset.Id, clientId);
        }
    }

    /// <summary>Renames a preset. It is refused for an empty name or another preset's, ignoring case.</summary>
    public PresetWriteResult RenamePreset(string? id, string? name, string? clientId)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        lock (_filterSessionLock)
        {
            var preset = FindPreset(id);
            if (preset == null)
            {
                return PresetNotFound();
            }

            var refused = RefuseName(trimmed, preset.Id);
            if (refused != null)
            {
                return refused;
            }

            var unsaved = WritePresetChange($"rename of {preset.Id}", session => session.RenamePreset(preset.Id, trimmed));
            if (unsaved != null)
            {
                return unsaved;
            }

            preset.Name = trimmed;
            return Changed(preset.Id, clientId);
        }
    }

    /// <summary>Puts the presets in the order of <paramref name="ids"/>, which must name every preset once.</summary>
    public PresetWriteResult ReorderPresets(IReadOnlyList<string>? ids, string? clientId)
    {
        var order = ids ?? [];
        lock (_filterSessionLock)
        {
            var byId = _presetCatalog.ToDictionary(preset => preset.Id, StringComparer.Ordinal);
            if (order.Count != byId.Count ||
                !order.All(id => id != null && byId.ContainsKey(id)) ||
                order.Distinct(StringComparer.Ordinal).Count() != order.Count)
            {
                return PresetRefused(PresetWriteStatus.OrderMismatch, "The order must name every preset once.");
            }

            var unsaved = WritePresetChange("reorder", session => session.ReorderPresets(order));
            if (unsaved != null)
            {
                return unsaved;
            }

            _presetCatalog = order.Select(id => byId[id]).ToList();
            return Changed(presetId: null, clientId);
        }
    }

    public PresetWriteResult DeletePreset(string? id, string? clientId)
    {
        lock (_filterSessionLock)
        {
            var preset = FindPreset(id);
            if (preset == null)
            {
                return PresetNotFound();
            }

            var unsaved = WritePresetChange($"delete of {preset.Id}", session => session.DeletePreset(preset.Id));
            if (unsaved != null)
            {
                return unsaved;
            }

            _presetCatalog.Remove(preset);
            return Changed(preset.Id, clientId);
        }
    }

    /// <summary>Renames the tag in every preset's included and excluded tags. A tag rename is never refused for the filters it leaves.</summary>
    public bool RenameTagInPresetCatalogOnly(string oldName, string newName)
    {
        if (string.IsNullOrWhiteSpace(oldName) || string.IsNullOrWhiteSpace(newName))
        {
            return false;
        }

        return RevisePresetFilters(root =>
            RenameTagInFilterArray(root, "selectedTags", oldName, newName) |
            RenameTagInFilterArray(root, "excludedTags", oldName, newName));
    }

    /// <summary>
    /// Removes the tag from every preset's included and excluded tags. A tag delete is never refused for the filters it
    /// leaves, even the default filter or another preset's.
    /// </summary>
    public bool RemoveTagFromPresetCatalogOnly(string tagName)
    {
        if (string.IsNullOrWhiteSpace(tagName))
        {
            return false;
        }

        return RevisePresetFilters(root =>
            RemoveTagFromFilterArray(root, "selectedTags", tagName) |
            RemoveTagFromFilterArray(root, "excludedTags", tagName));
    }

    public IReadOnlyList<SourceResponse> GetSourcesSnapshot()
    {
        if (_catalog == null)
        {
            return [];
        }

        IReadOnlyList<ReelRoulette.Core.Library.LibraryCatalogSource> stored;
        try
        {
            stored = _catalog.Session.ReadSources();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read sources from '{Path}'.", _catalog.Session.DatabasePath);
            throw;
        }

        return stored
            .Select(MapSource)
            .OfType<SourceResponse>()
            .OrderBy(source => source.DisplayName ?? source.RootPath, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public bool TrySetSourceEnabled(string sourceId, bool isEnabled, out SourceResponse? source)
    {
        source = null;
        if (_catalog == null || string.IsNullOrWhiteSpace(sourceId))
        {
            return false;
        }

        var id = sourceId.Trim();
        SourceResponse updated;
        bool changed;
        lock (_sourceLock)
        {
            try
            {
                var stored = _catalog.Session.ReadSources()
                    .FirstOrDefault(s => string.Equals(s.Id.Trim(), id, StringComparison.OrdinalIgnoreCase));
                var mapped = stored == null ? null : MapSource(stored);
                if (stored == null || mapped == null)
                {
                    return false;
                }

                changed = mapped.IsEnabled != isEnabled;
                if (changed)
                {
                    _catalog.Session.SetSourceEnabled(stored.Id, isEnabled);
                    mapped.IsEnabled = isEnabled;
                }

                updated = mapped;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to set source '{SourceId}' enabled to {IsEnabled} in '{Path}'.", id, isEnabled, _catalog.Session.DatabasePath);
                throw;
            }
        }

        if (changed)
        {
            Publish("sourceStateChanged", new SourceStateChangedPayload
            {
                SourceId = updated.Id,
                IsEnabled = updated.IsEnabled
            });
        }

        source = updated;
        return true;
    }

    private static SourceResponse? MapSource(ReelRoulette.Core.Library.LibraryCatalogSource source)
    {
        var id = source.Id.Trim();
        var rootPath = source.RootPath.Trim();
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(rootPath))
        {
            return null;
        }

        var displayName = string.IsNullOrWhiteSpace(source.DisplayName) ? null : source.DisplayName.Trim();
        return ApiContractMapper.MapSource(id, rootPath, displayName, source.IsEnabled);
    }

    internal int SubscriberCount
    {
        get
        {
            lock (_subscribersLock)
            {
                return _subscribers.Count;
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

    public ServerEventEnvelope PublishExternal(string eventType, object payload)
    {
        return Publish(eventType, payload);
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

    /// <summary>
    /// The first event on a stream opened without a last event ID. It carries the current revision and does not
    /// take a new one, so a client that receives no other event can still resume from it after a reconnect.
    /// </summary>
    public ServerEventEnvelope CreateStreamOpenedEnvelope()
    {
        var revision = GetCurrentRevision();
        return new ServerEventEnvelope
        {
            Revision = revision,
            EventType = "streamOpened",
            Timestamp = DateTimeOffset.UtcNow,
            Payload = new StreamOpenedPayload { CurrentRevision = revision }
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

    private static JsonElement ParsePresetFilter(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return JsonSerializer.SerializeToElement(new { }, JsonOptions);
        }
    }

    private static StoredPreset ClonePreset(StoredPreset preset)
    {
        return new StoredPreset { Id = preset.Id, Name = preset.Name, FilterState = preset.FilterState };
    }

    private static string NewPresetId() => Guid.NewGuid().ToString();

    private static LibraryCatalogPreset ToCatalogPreset(StoredPreset preset)
    {
        return new LibraryCatalogPreset
        {
            Id = preset.Id,
            Name = preset.Name,
            FilterStateJson = preset.FilterState.ValueKind == JsonValueKind.Undefined ? "{}" : preset.FilterState.GetRawText()
        };
    }

    private StoredPreset? FindPreset(string? id)
    {
        return string.IsNullOrWhiteSpace(id)
            ? null
            : _presetCatalog.FirstOrDefault(preset => string.Equals(preset.Id, id, StringComparison.Ordinal));
    }

    /// <summary>Why a preset can't take <paramref name="name"/>: it is empty, or another preset's, ignoring case.</summary>
    private PresetWriteResult? RefuseName(string name, string? exceptId)
    {
        if (name.Length == 0)
        {
            return PresetRefused(PresetWriteStatus.NameMissing, "A preset needs a name.");
        }

        var holder = _presetCatalog.FirstOrDefault(preset =>
            preset.Id != exceptId && string.Equals(preset.Name, name, StringComparison.OrdinalIgnoreCase));
        return holder == null ? null : PresetRefused(PresetWriteStatus.NameTaken, $"Another preset is named \"{holder.Name}\".");
    }

    /// <summary>
    /// Why a preset can't hold <paramref name="filterState"/>: it is not an object, or it is the default filter or
    /// another preset's, as presets compare filters. A missing filter state is the default filter.
    /// </summary>
    private PresetWriteResult? RefuseFilter(JsonElement? filterState, string? exceptId)
    {
        if (!LibraryListFilterParser.TryParse(filterState, out var filter, out var error))
        {
            return PresetRefused(PresetWriteStatus.FilterNotValid, error ?? "filterState is not valid");
        }

        filter ??= new FilterStateModel();
        if (FilterStateComparison.IsDefault(filter))
        {
            return PresetRefused(PresetWriteStatus.DefaultFilter, "A preset can't hold the default filter.");
        }

        var holder = _presetCatalog.FirstOrDefault(preset => preset.Id != exceptId && HoldsFilter(preset, filter));
        return holder == null ? null : PresetRefused(PresetWriteStatus.FilterTaken, $"Preset \"{holder.Name}\" already has this filter.");
    }

    private static bool HoldsFilter(StoredPreset preset, FilterStateModel filter)
    {
        return LibraryListFilterParser.TryParse(preset.FilterState, out var held, out _) &&
            FilterStateComparison.SameFilter(held ?? new FilterStateModel(), filter);
    }

    private static PresetWriteResult PresetNotFound() => PresetRefused(PresetWriteStatus.NotFound, "Preset not found.");

    private static PresetWriteResult PresetRefused(PresetWriteStatus status, string error) => new() { Status = status, Error = error };

    /// <summary>Publishes the change, within the preset lock so events follow the order of the writes.</summary>
    private PresetWriteResult Changed(string? presetId, string? clientId)
    {
        Publish("presetCatalogChanged", new PresetCatalogChangedPayload { PresetId = presetId, ClientId = clientId });
        return new PresetWriteResult { Status = PresetWriteStatus.Done, PresetId = presetId };
    }

    /// <summary>Writes to the catalog when the server has a library. Without a catalog, as in tests, presets live only in memory.</summary>
    private void WriteCatalog(Action<LibraryCatalogSession> write)
    {
        if (_catalog is { HasLibrary: true })
        {
            write(_catalog.Session);
        }
    }

    /// <summary>
    /// Writes one preset change to the catalog, as <see cref="WriteCatalog"/> does. A write that changes no row, as when
    /// the catalog lacks a preset the server holds after a failed write it logged, is not saved: last.log gets a warning,
    /// and the caller changes nothing and publishes nothing. Null when the change was saved.
    /// </summary>
    private PresetWriteResult? WritePresetChange(string change, Func<LibraryCatalogSession, bool> write)
    {
        if (_catalog is not { HasLibrary: true } || write(_catalog.Session))
        {
            return null;
        }

        _serverLog?.Append("warn", $"Preset {change} was not saved: the catalog's presets differ from the server's.");
        return PresetRefused(PresetWriteStatus.NotSaved, "The preset change couldn't be saved.");
    }

    /// <summary>
    /// Changes each preset's filter state that <paramref name="revise"/> changes, in one catalog write, keeping its id.
    /// A failed write is logged, and the presets still change.
    /// </summary>
    private bool RevisePresetFilters(Func<JsonObject, bool> revise)
    {
        lock (_filterSessionLock)
        {
            var revised = new List<(StoredPreset Preset, JsonElement FilterState)>();
            foreach (var preset in _presetCatalog)
            {
                if (TryMutatePresetFilterState(preset.FilterState, revise, out var updated))
                {
                    revised.Add((preset, updated));
                }
            }

            if (revised.Count == 0)
            {
                return false;
            }

            try
            {
                WriteCatalog(session => session.RunInTransaction(() =>
                {
                    foreach (var (preset, filterState) in revised)
                    {
                        session.UpdatePresetFilter(preset.Id, filterState.GetRawText());
                    }
                }));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist preset catalog.");
            }

            foreach (var (preset, filterState) in revised)
            {
                preset.FilterState = filterState;
            }

            return true;
        }
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

    private void BootstrapFromDisk()
    {
        try
        {
            if (_catalog != null)
            {
                var storedPresets = _catalog.Session.ReadPresets()
                    .Where(preset => !string.IsNullOrWhiteSpace(preset.Name))
                    .GroupBy(preset => preset.Name.Trim(), StringComparer.OrdinalIgnoreCase)
                    .Select(group => new StoredPreset
                    {
                        Id = group.First().Id,
                        Name = group.Key,
                        FilterState = ParsePresetFilter(group.First().FilterStateJson)
                    })
                    .ToList();
                lock (_filterSessionLock)
                {
                    _presetCatalog = storedPresets;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to bootstrap preset catalog.");
        }
    }
}

/// <summary>A preset as the server holds it: its own id, kept across renames, its name, and its filter state as posted.</summary>
public sealed class StoredPreset
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public JsonElement FilterState { get; set; }
}

public enum PresetWriteStatus
{
    Done,
    NotFound,
    NameMissing,
    NameTaken,
    FilterNotValid,
    DefaultFilter,
    FilterTaken,
    OrderMismatch,
    NotSaved
}

/// <summary>A preset write's outcome: the preset written, or why it was refused.</summary>
public sealed class PresetWriteResult
{
    public PresetWriteStatus Status { get; init; }

    /// <summary>The preset written, or null for a reorder or a refusal.</summary>
    public string? PresetId { get; init; }

    public string? Error { get; init; }
}

public sealed class ReplayResult
{
    public long CurrentRevision { get; init; }
    public bool GapDetected { get; init; }
    public IReadOnlyList<ServerEventEnvelope> Events { get; init; } = [];
}
