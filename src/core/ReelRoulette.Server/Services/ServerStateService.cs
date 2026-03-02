using System.Collections.Concurrent;
using System.Threading.Channels;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class ServerStateService
{
    private readonly object _revisionLock = new();
    private readonly object _subscribersLock = new();
    private long _revision;
    private readonly Dictionary<string, ItemStateChangedPayload> _itemStates = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Channel<ServerEventEnvelope>> _subscribers = new();
    private readonly Random _random = new();

    private static readonly List<PresetResponse> Presets =
    [
        ApiContractMapper.MapPreset("all-media", "All Media", "Default full library preset"),
        ApiContractMapper.MapPreset("favorites", "Favorites", "Favorite items only")
    ];

    public VersionResponse GetVersion()
    {
        return ApiContractMapper.MapVersion("1", assetsVersion: "m3");
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
        current.IsFavorite = request.IsFavorite;
        Publish("itemStateChanged", current);
    }

    public void SetBlacklist(BlacklistRequest request)
    {
        var current = GetOrCreateItemState(request.Path);
        current.IsBlacklisted = request.IsBlacklisted;
        Publish("itemStateChanged", current);
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

    private ItemStateChangedPayload GetOrCreateItemState(string path)
    {
        if (_itemStates.TryGetValue(path, out var existing))
        {
            return existing;
        }

        var created = new ItemStateChangedPayload
        {
            ItemId = Guid.NewGuid().ToString("N"),
            Path = path,
            IsFavorite = false,
            IsBlacklisted = false
        };
        _itemStates[path] = created;
        return created;
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

    private void Publish(string eventType, object payload)
    {
        var envelope = CreateEnvelope(eventType, payload);
        List<Channel<ServerEventEnvelope>> subscribersSnapshot;
        lock (_subscribersLock)
        {
            subscribersSnapshot = _subscribers.ToList();
        }

        foreach (var subscriber in subscribersSnapshot)
        {
            subscriber.Writer.TryWrite(envelope);
        }
    }
}
