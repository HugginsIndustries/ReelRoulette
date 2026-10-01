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
    private long _revision;
    private readonly List<Channel<ServerEventEnvelope>> _subscribers = new();
    private readonly Queue<ServerEventEnvelope> _eventHistory = new();
    private const int EventHistoryCapacity = 256;
    private List<FilterPresetSnapshot> _presetCatalog = [];
    private readonly List<SourceRecord> _sources = [];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public ServerStateService(
        ILogger<ServerStateService>? logger = null,
        string? appDataPathOverride = null,
        LibraryCatalogHost? catalog = null)
    {
        _logger = logger ?? NullLogger<ServerStateService>.Instance;
        var roamingAppData = appDataPathOverride ??
                             Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(roamingAppData);
        if (catalog != null)
        {
            _catalog = catalog;
        }
        else if (!string.IsNullOrWhiteSpace(appDataPathOverride))
        {
            _catalog = LibraryCatalogHost.Open(roamingAppData, LibraryCatalogHost.LocalThumbnailDirectory(appDataPathOverride));
        }
        else
        {
            _catalog = null;
        }

        if (_catalog != null)
        {
            BootstrapFromDisk();
        }
    }

    public VersionResponse GetVersion()
    {
        return ApiContractMapper.MapVersion(
            "1",
            assetsVersion: "0.13.0-dev.1",
            minimumCompatibleApiVersion: "0",
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
                PersistSourceEnabled(updated.Id, updated.IsEnabled);
            Publish("sourceStateChanged", new SourceStateChangedPayload
            {
                SourceId = updated.Id,
                IsEnabled = updated.IsEnabled
            });
        }

        source = ApiContractMapper.MapSource(updated.Id, updated.RootPath, updated.DisplayName, updated.IsEnabled);
        return true;
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
        if (_catalog == null)
        {
            return;
        }

        try
        {
            IReadOnlyList<FilterPresetSnapshot> snapshot;
            lock (_filterSessionLock)
            {
                snapshot = ClonePresetCatalog(_presetCatalog);
            }

            _catalog.Session.ReplacePresets(snapshot.Select(preset => new ReelRoulette.Core.Library.LibraryCatalogPreset
            {
                Name = preset.Name,
                FilterStateJson = preset.FilterState.ValueKind == JsonValueKind.Undefined ? "{}" : preset.FilterState.GetRawText()
            }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist preset catalog.");
        }
    }

    private void BootstrapFromDisk()
    {
        try
        {
            if (_catalog != null)
            {
                var parsedPresets = _catalog.Session.ReadPresets()
                    .Select(preset => new FilterPresetSnapshot
                    {
                        Name = preset.Name,
                        FilterState = ParsePresetFilter(preset.FilterStateJson)
                    })
                    .ToList();
                lock (_filterSessionLock)
                {
                    _presetCatalog = ClonePresetCatalog(parsedPresets);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to bootstrap preset catalog.");
        }

        try
        {
            if (_catalog == null)
            {
                return;
            }

            var loaded = _catalog.Session.ReadStartupSources();
            lock (_sourceLock)
            {
                _sources.Clear();
                foreach (var source in loaded)
                {
                    var id = source.Id.Trim();
                    var rootPath = source.RootPath.Trim();
                    if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(rootPath))
                    {
                        continue;
                    }

                    _sources.Add(new SourceRecord
                    {
                        Id = id,
                        RootPath = rootPath,
                        DisplayName = string.IsNullOrWhiteSpace(source.DisplayName) ? null : source.DisplayName.Trim(),
                        IsEnabled = source.IsEnabled
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to bootstrap server state from '{Path}'.", _catalog?.Session.DatabasePath);
        }
    }

    private void PersistSourceEnabled(string sourceId, bool isEnabled)
    {
        try
        {
            if (_catalog == null)
            {
                return;
            }

            _catalog.Session.SetSourceEnabled(sourceId, isEnabled);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist source enabled state to '{Path}'.", _catalog?.Session.DatabasePath);
        }
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
