using System.Diagnostics;
using System.Text.Json;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class LibraryPlaybackService
{
    private readonly LibraryCatalogHost _catalog;
    private readonly ServerMediaTokenStore _tokenStore;
    private readonly ILogger<LibraryPlaybackService> _logger;
    private readonly ServerLogService? _serverLog;
    private readonly object _randomizationLock = new();
    private readonly Dictionary<string, RandomPickMemory> _clientRandomizationStates = new(StringComparer.OrdinalIgnoreCase);

    public LibraryPlaybackService(
        ServerMediaTokenStore tokenStore,
        ILogger<LibraryPlaybackService> logger,
        LibraryCatalogHost catalog,
        ServerLogService? serverLog = null)
    {
        _tokenStore = tokenStore;
        _logger = logger;
        _catalog = catalog;
        _serverLog = serverLog;
    }

    public IReadOnlyList<PresetResponse> GetPresets(IReadOnlyList<StoredPreset> presets)
    {
        return (presets ?? [])
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .GroupBy(p => p.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var preset = group.First();
                return ApiContractMapper.MapPreset(preset.Id, preset.Name.Trim(), filterState: preset.FilterState);
            })
            .ToList();
    }

    public bool TrySelectRandom(
        RandomRequest request,
        IReadOnlyList<StoredPreset> presets,
        out RandomResponse? response,
        out int statusCode,
        out string? error)
    {
        var stopwatch = Stopwatch.StartNew();
        response = null;
        error = null;
        statusCode = StatusCodes.Status200OK;

        int itemCount;
        try
        {
            itemCount = _catalog.Session.CountItems();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not count library items in '{DatabasePath}'.", _catalog.Session.DatabasePath);
            error = "The server couldn't read the library.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        if (itemCount == 0)
        {
            error = "The library is empty.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        if (!TryResolveFilter(request, presets, out var filter, out statusCode, out error) || filter is null)
        {
            return false;
        }

        if (!request.IncludeVideos && !request.IncludePhotos)
        {
            return true;
        }

        MediaTypeValue? requiredMediaType = null;
        if (!request.IncludeVideos)
        {
            requiredMediaType = MediaTypeValue.Photo;
        }
        else if (!request.IncludePhotos)
        {
            requiredMediaType = MediaTypeValue.Video;
        }

        List<RandomizationItem> eligible;
        try
        {
            eligible = _catalog.Session.QueryRandomCandidates(filter, requiredMediaType);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not query eligible library items in '{DatabasePath}'.", _catalog.Session.DatabasePath);
            error = "The server couldn't read the library.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        var randomizationMode = ParseRandomizationMode(request.RandomizationMode);
        if (eligible.Count == 0)
        {
            LogPick(randomizationMode, eligible.Count, stopwatch);
            return true;
        }

        var scopeKey = BuildRandomizationScopeKey(request.ClientId, request.SessionId);

        RandomPickResult picked;
        lock (_randomizationLock)
        {
            if (!_clientRandomizationStates.TryGetValue(scopeKey, out var memory))
            {
                memory = new RandomPickMemory();
                _clientRandomizationStates[scopeKey] = memory;
            }

            // The engine picks nothing only from an empty eligible set, which returned above.
            picked = RandomSelectionEngineCore.SelectItem(
                memory,
                eligible,
                PickOptionsFor(randomizationMode),
                DateTime.UtcNow,
                Random.Shared)!;
        }

        var selected = _catalog.Session.ReadPlaybackItemById(picked.Item.Id);
        if (selected == null || string.IsNullOrWhiteSpace(selected.FullPath))
        {
            error = "Selected item not found.";
            statusCode = StatusCodes.Status500InternalServerError;
            return false;
        }

        response = PlaybackResponse(selected);
        LogPick(randomizationMode, eligible.Count, stopwatch);
        return true;
    }

    private void LogPick(RandomizationModeValue mode, int eligibleCount, Stopwatch stopwatch)
    {
        _serverLog?.Append(
            "info",
            $"Random pick mode={mode} eligible={eligibleCount} elapsedMs={stopwatch.ElapsedMilliseconds}.");
    }

    public const string PlayItemErrorInvalidId = "play_item_id_invalid";
    public const string PlayItemErrorNotFound = "play_item_not_found";
    public const string PlayItemErrorMediaMissing = "play_media_missing";
    public const string PlayItemErrorSourceDisabled = "play_source_disabled";
    public const string PlayItemErrorUnsupportedMedia = "play_unsupported_media";
    public const string PlayItemErrorMediaUnreadable = "play_media_unreadable";

    public bool TryPlayItem(
        string itemId,
        bool forceMediaMissing,
        out RandomResponse? response,
        out int statusCode,
        out string? error,
        out string? errorCode)
    {
        response = null;
        error = null;
        errorCode = null;
        statusCode = StatusCodes.Status200OK;

        if (string.IsNullOrWhiteSpace(itemId))
        {
            statusCode = StatusCodes.Status400BadRequest;
            error = "itemId is required";
            errorCode = PlayItemErrorInvalidId;
            return false;
        }

        var trimmedId = itemId.Trim();
        var match = _catalog.Session.ReadPlaybackItem(trimmedId);
        if (match == null || string.IsNullOrWhiteSpace(match.FullPath))
        {
            statusCode = StatusCodes.Status404NotFound;
            error = "Item not found";
            errorCode = PlayItemErrorNotFound;
            return false;
        }

        if (!match.IsSourceEnabled)
        {
            statusCode = StatusCodes.Status409Conflict;
            error = "Source is disabled for this item";
            errorCode = PlayItemErrorSourceDisabled;
            return false;
        }

        Exception? readError = null;
        var fileState = forceMediaMissing ? MediaFileState.Missing : MediaFileProbe.Probe(match.FullPath, out readError);
        if (fileState == MediaFileState.Missing)
        {
            statusCode = StatusCodes.Status404NotFound;
            error = "Media file not found";
            errorCode = PlayItemErrorMediaMissing;
            return false;
        }

        if (fileState == MediaFileState.Unreadable)
        {
            _serverLog?.Append("warn", $"Play media read failed item={match.Id} error={readError?.GetType().Name}.");
            statusCode = StatusCodes.Status503ServiceUnavailable;
            error = "Media file can't be read";
            errorCode = PlayItemErrorMediaUnreadable;
            return false;
        }

        if (!SupportedMediaExtensions.IsSupportedFilePath(match.FullPath))
        {
            statusCode = StatusCodes.Status415UnsupportedMediaType;
            error = "Unsupported media type";
            errorCode = PlayItemErrorUnsupportedMedia;
            return false;
        }

        response = PlaybackResponse(match);
        return true;
    }

    /// <summary>
    /// Isolates the random pick memory per browser tab (session), keeping a client that
    /// omits its session on one scope per client id, and anonymous clients that omit their session on a
    /// single shared scope.
    /// </summary>
    internal static string BuildRandomizationScopeKey(string? clientId, string? sessionId)
    {
        var client = string.IsNullOrWhiteSpace(clientId) ? "web-anonymous" : clientId.Trim();
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return client;
        }

        return $"{client}\u001f{sessionId.Trim()}";
    }

    /// <summary>The file a token from the random or play route names. An item id or a full path is not a token.</summary>
    public bool TryResolveMediaPath(string token, out string fullPath)
    {
        return _tokenStore.TryResolve(token, out fullPath);
    }

    /// <summary>The preset whose id is <paramref name="presetId"/>, exactly. A preset's name finds nothing.</summary>
    private static StoredPreset? ResolvePreset(IReadOnlyList<StoredPreset> presets, string presetId)
    {
        if (string.IsNullOrWhiteSpace(presetId))
        {
            return null;
        }

        return (presets ?? [])
            .FirstOrDefault(p => string.Equals(p.Id, presetId, StringComparison.Ordinal));
    }

    private static bool TryResolveFilter(
        RandomRequest request,
        IReadOnlyList<StoredPreset> presets,
        out FilterStateModel? filter,
        out int statusCode,
        out string? error)
    {
        statusCode = StatusCodes.Status200OK;
        error = null;
        filter = null;

        JsonElement? element = null;
        if (request.FilterState.HasValue &&
            request.FilterState.Value.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
        {
            element = request.FilterState.Value;
        }
        else
        {
            var preset = ResolvePreset(presets, request.PresetId);
            var isAllMedia = string.Equals(request.PresetId, "all-media", StringComparison.OrdinalIgnoreCase);
            if (preset is null && !isAllMedia)
            {
                statusCode = string.IsNullOrWhiteSpace(request.PresetId)
                    ? StatusCodes.Status400BadRequest
                    : StatusCodes.Status404NotFound;
                error = string.IsNullOrWhiteSpace(request.PresetId)
                    ? "Either filterState or presetId is required."
                    : $"Preset '{request.PresetId}' not found.";
                return false;
            }

            if (preset != null &&
                preset.FilterState.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
            {
                element = preset.FilterState;
            }
        }

        if (!LibraryListFilterParser.TryParse(element, out filter, out error))
        {
            statusCode = StatusCodes.Status400BadRequest;
            return false;
        }

        filter ??= new FilterStateModel();
        return true;
    }

    /// <summary>A random pick's or a direct play's answer: the item, with a media token for its file.</summary>
    private RandomResponse PlaybackResponse(CatalogPlaybackItem item)
    {
        var token = _tokenStore.CreateToken(item.FullPath);
        return ApiContractMapper.MapRandomResult(
            id: item.FullPath,
            itemId: item.Id,
            displayName: string.IsNullOrWhiteSpace(item.FileName) ? Path.GetFileName(item.FullPath) : item.FileName,
            mediaType: MediaTypeName(item.MediaType),
            durationSeconds: DurationSeconds(item.DurationTicks),
            integratedLoudness: item.IntegratedLoudness,
            peakDb: item.PeakDb,
            mediaUrl: $"/api/media/{token}",
            isFavorite: item.IsFavorite,
            isBlacklisted: item.IsBlacklisted,
            ratingHalfStars: item.RatingHalfStars);
    }

    private static string MediaTypeName(int mediaType)
    {
        return mediaType == (int)MediaTypeValue.Photo ? "photo" : "video";
    }

    private static double? DurationSeconds(long? ticks)
    {
        return ticks is long value ? value / (double)TimeSpan.TicksPerSecond : null;
    }

    private enum RandomizationModeValue
    {
        PureRandom = 0,
        WeightedRandom = 1,
        SmartShuffle = 2,
        SpreadMode = 3,
        WeightedWithSpread = 4
    }

    /// <summary>The random pick options each randomization mode stands for, with the default window.</summary>
    private static RandomPickOptions PickOptionsFor(RandomizationModeValue mode)
    {
        return mode switch
        {
            RandomizationModeValue.PureRandom => new RandomPickOptions { Shuffle = false, SpreadByFolder = false },
            RandomizationModeValue.WeightedRandom => new RandomPickOptions { Shuffle = false, SpreadByFolder = false, FavorLessPlayed = true },
            RandomizationModeValue.SpreadMode => new RandomPickOptions { Shuffle = false, SpreadByFolder = true },
            RandomizationModeValue.WeightedWithSpread => new RandomPickOptions { Shuffle = false, SpreadByFolder = true, FavorLessPlayed = true },
            _ => new RandomPickOptions { Shuffle = true, SpreadByFolder = false }
        };
    }

    private static RandomizationModeValue ParseRandomizationMode(string? mode)
    {
        if (string.IsNullOrWhiteSpace(mode))
        {
            return RandomizationModeValue.SmartShuffle;
        }

        return Enum.TryParse<RandomizationModeValue>(mode.Trim(), ignoreCase: true, out var parsed)
            ? parsed
            : RandomizationModeValue.SmartShuffle;
    }
}
