using System.Threading.Channels;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

// M4 guardrail: keep this service focused on transport-facing state projection/event streaming
// and move business-rule expansion to ReelRoulette.Core services as migrations continue.
public sealed class ServerStateService
{
    private readonly object _revisionLock = new();
    private readonly object _subscribersLock = new();
    private readonly object _historyLock = new();
    private readonly object _itemStatesLock = new();
    private long _revision;
    private readonly Dictionary<string, ItemStateRecord> _itemStates = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Channel<ServerEventEnvelope>> _subscribers = new();
    private readonly Queue<ServerEventEnvelope> _eventHistory = new();
    private readonly Random _random = new();
    private const int EventHistoryCapacity = 256;

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
        var envelope = Publish("itemStateChanged", current.Payload);
        current.Revision = envelope.Revision;
    }

    public void SetBlacklist(BlacklistRequest request)
    {
        var current = GetOrCreateItemState(request.Path);
        current.Payload.IsBlacklisted = request.IsBlacklisted;
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
