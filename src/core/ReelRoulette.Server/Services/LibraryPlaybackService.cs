using System.Diagnostics;
using System.Text.Json;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Library;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class LibraryPlaybackService
{
    /// <summary>The memory key of requests that name no device.</summary>
    private const string SharedDeviceKey = "";

    private readonly LibraryCatalogHost _catalog;
    private readonly ServerMediaTokenStore _tokenStore;
    private readonly ILogger<LibraryPlaybackService> _logger;
    private readonly ServerLogService? _serverLog;
    private readonly Random _random;
    private readonly TimeProvider _time;
    private readonly object _randomizationLock = new();
    private readonly Dictionary<string, RandomPickMemory> _deviceRandomPickMemories = new(StringComparer.OrdinalIgnoreCase);

    public LibraryPlaybackService(
        ServerMediaTokenStore tokenStore,
        ILogger<LibraryPlaybackService> logger,
        LibraryCatalogHost catalog,
        ServerLogService? serverLog = null,
        Random? random = null,
        TimeProvider? time = null)
    {
        _tokenStore = tokenStore;
        _logger = logger;
        _catalog = catalog;
        _serverLog = serverLog;
        _random = random ?? Random.Shared;
        _time = time ?? TimeProvider.System;
    }

    /// <summary>How many devices have a random-pick memory.</summary>
    internal int RandomPickDeviceCount
    {
        get
        {
            lock (_randomizationLock)
            {
                return _deviceRandomPickMemories.Count;
            }
        }
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

    /// <summary>
    /// Picks one of the eligible items with the request's options and remembers it for the request's device. On
    /// success the response holds the item, or null when nothing is eligible, and the cycle numbers after the pick.
    /// </summary>
    public bool TrySelectRandom(
        RandomRequest request,
        IReadOnlyList<StoredPreset> presets,
        out RandomPickResponse? response,
        out int statusCode,
        out string? error)
    {
        var stopwatch = Stopwatch.StartNew();
        response = null;
        var options = ReadPickOptions(request.Options);
        if (!TryQueryEligible(request, presets, options, out var eligible, out statusCode, out error))
        {
            return false;
        }

        if (eligible is null || eligible.Count == 0)
        {
            if (eligible is not null)
            {
                LogPick(options, 0, stopwatch);
            }

            response = new RandomPickResponse { Item = null, Cycle = ApiContractMapper.MapRandomPickCycle(default) };
            return true;
        }

        var key = DeviceKey(request.ClientId);
        RandomPickResult picked;
        int dropped;
        lock (_randomizationLock)
        {
            if (!_deviceRandomPickMemories.TryGetValue(key, out var memory))
            {
                memory = new RandomPickMemory();
                _deviceRandomPickMemories[key] = memory;
            }

            var now = _time.GetUtcNow().UtcDateTime;

            // The engine picks nothing only from an empty eligible set, which returned above.
            picked = RandomSelectionEngineCore.SelectItem(memory, eligible, options, now, _random)!;
            dropped = DropDevicesPastWindow(now);
        }

        if (dropped > 0)
        {
            _serverLog?.Append("info", $"Random pick memory dropped devices={dropped}.");
        }

        var selected = _catalog.Session.ReadPlaybackItem(picked.Item.Id);
        if (selected == null || string.IsNullOrWhiteSpace(selected.FullPath))
        {
            error = "Selected item not found.";
            statusCode = StatusCodes.Status500InternalServerError;
            return false;
        }

        response = new RandomPickResponse
        {
            Item = PlaybackResponse(selected),
            Cycle = ApiContractMapper.MapRandomPickCycle(picked.Cycle)
        };
        LogPick(options, eligible.Count, stopwatch);
        return true;
    }

    /// <summary>
    /// The cycle numbers a pick with the same request would start from, for the request's device. Changes nothing, and
    /// a device without a memory has picked nothing.
    /// </summary>
    public bool TryGetRandomCycle(
        RandomRequest request,
        IReadOnlyList<StoredPreset> presets,
        out RandomPickCycleResponse? response,
        out int statusCode,
        out string? error)
    {
        response = null;
        var options = ReadPickOptions(request.Options);
        if (!TryQueryEligible(request, presets, options, out var eligible, out statusCode, out error))
        {
            return false;
        }

        eligible ??= [];
        RandomPickCycle cycle;
        lock (_randomizationLock)
        {
            cycle = _deviceRandomPickMemories.TryGetValue(DeviceKey(request.ClientId), out var memory)
                ? RandomSelectionEngineCore.GetCycle(memory, eligible, options, _time.GetUtcNow().UtcDateTime)
                : new RandomPickCycle(0, eligible.Count);
        }

        response = ApiContractMapper.MapRandomPickCycle(cycle);
        return true;
    }

    /// <summary>Clears the device's Shuffle memory and its last pick. A device without a memory has nothing to clear.</summary>
    public void ResetRandom(string? clientId)
    {
        lock (_randomizationLock)
        {
            if (_deviceRandomPickMemories.TryGetValue(DeviceKey(clientId), out var memory))
            {
                RandomSelectionEngineCore.Reset(memory);
            }
        }

        _serverLog?.Append("info", "Random pick memory reset.");
    }

    /// <summary>
    /// The pick options a request's options stand for. A missing option, an unknown window, and an unknown tag spread
    /// read as the default, and blank category ids are left out.
    /// </summary>
    internal static RandomPickOptions ReadPickOptions(RandomPickOptionsRequest? options)
    {
        if (options is null)
        {
            return RandomPickOptions.Default;
        }

        return new RandomPickOptions
        {
            Shuffle = options.Shuffle,
            RememberPlaysForDays = options.RememberPlaysForDays switch
            {
                null => null,
                1 or 7 or 30 or 90 => options.RememberPlaysForDays,
                _ => RandomPickOptions.Default.RememberPlaysForDays
            },
            SpreadByFolder = options.SpreadByFolder,
            SpreadByTags = ReadTagSpread(options.SpreadByTags),
            SpreadCategoryIds = (options.SpreadCategoryIds ?? [])
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .ToList(),
            FavorLessPlayed = options.FavorLessPlayed,
            FavorNewlyAdded = options.FavorNewlyAdded,
            FavorNewlyCreated = options.FavorNewlyCreated,
            FavorHigherRated = options.FavorHigherRated
        };
    }

    private static TagSpreadValue ReadTagSpread(string? value)
    {
        if (string.Equals(value, "allTags", StringComparison.OrdinalIgnoreCase))
        {
            return TagSpreadValue.AllTags;
        }

        return string.Equals(value, "byCategory", StringComparison.OrdinalIgnoreCase)
            ? TagSpreadValue.ByCategory
            : TagSpreadValue.Off;
    }

    /// <summary>A device's memory key: its trimmed client id, or the shared key for a request that names none.</summary>
    private static string DeviceKey(string? clientId)
    {
        return string.IsNullOrWhiteSpace(clientId) ? SharedDeviceKey : clientId.Trim();
    }

    /// <summary>Drops the memory of every device whose last pick has passed its window. Runs under the lock.</summary>
    private int DropDevicesPastWindow(DateTime nowUtc)
    {
        List<string>? past = null;
        foreach (var (key, memory) in _deviceRandomPickMemories)
        {
            if (memory.IsPastWindow(nowUtc))
            {
                (past ??= []).Add(key);
            }
        }

        foreach (var key in past ?? [])
        {
            _deviceRandomPickMemories.Remove(key);
        }

        return past?.Count ?? 0;
    }

    /// <summary>
    /// The library's eligible items for a pick or a cycle read: the filter's, of the media types asked for, with their
    /// tags only under tag spread. Null when the request asks for neither media type.
    /// </summary>
    private bool TryQueryEligible(
        RandomRequest request,
        IReadOnlyList<StoredPreset> presets,
        RandomPickOptions options,
        out List<RandomizationItem>? eligible,
        out int statusCode,
        out string? error)
    {
        eligible = null;
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

        try
        {
            eligible = _catalog.Session.QueryRandomCandidates(
                filter,
                requiredMediaType,
                includeTags: options.SpreadByTags != TagSpreadValue.Off);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not query eligible library items in '{DatabasePath}'.", _catalog.Session.DatabasePath);
            error = "The server couldn't read the library.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        return true;
    }

    private void LogPick(RandomPickOptions options, int eligibleCount, Stopwatch stopwatch)
    {
        var remember = options.RememberPlaysForDays is int days ? $"{days}d" : "all";
        _serverLog?.Append(
            "info",
            $"Random pick options={DescribeOptions(options)} remember={remember} eligible={eligibleCount} elapsedMs={stopwatch.ElapsedMilliseconds}.");
    }

    /// <summary>The options that are on, such as <c>shuffle,spreadByFolder</c>, or <c>none</c>.</summary>
    private static string DescribeOptions(RandomPickOptions options)
    {
        var on = new List<string>();
        if (options.Shuffle)
        {
            on.Add("shuffle");
        }

        if (options.SpreadByFolder)
        {
            on.Add("spreadByFolder");
        }

        if (options.SpreadByTags == TagSpreadValue.AllTags)
        {
            on.Add("spreadByTags:allTags");
        }
        else if (options.SpreadByTags == TagSpreadValue.ByCategory)
        {
            on.Add("spreadByTags:byCategory");
        }

        if (options.FavorLessPlayed)
        {
            on.Add("favorLessPlayed");
        }

        if (options.FavorNewlyAdded)
        {
            on.Add("favorNewlyAdded");
        }

        if (options.FavorNewlyCreated)
        {
            on.Add("favorNewlyCreated");
        }

        if (options.FavorHigherRated)
        {
            on.Add("favorHigherRated");
        }

        return on.Count == 0 ? "none" : string.Join(',', on);
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
        out PlaybackItemResponse? response,
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
    private PlaybackItemResponse PlaybackResponse(CatalogPlaybackItem item)
    {
        var token = _tokenStore.CreateToken(item.FullPath);
        return ApiContractMapper.MapPlaybackItem(
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
}
