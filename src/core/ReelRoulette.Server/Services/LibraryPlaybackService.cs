using System.Diagnostics;
using System.Text.Json;
using ReelRoulette.Core.Filtering;
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
    private readonly Dictionary<string, RandomizationRuntimeStateCore> _clientRandomizationStates = new(StringComparer.OrdinalIgnoreCase);

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

    public IReadOnlyList<PresetResponse> GetPresets(IReadOnlyList<FilterPresetSnapshot> presets)
    {
        return (presets ?? [])
            .Where(p => !string.IsNullOrWhiteSpace(p.Name))
            .GroupBy(p => p.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var preset = group.First();
                var name = preset.Name.Trim();
                return ApiContractMapper.MapPreset(name, name, filterState: preset.FilterState);
            })
            .ToList();
    }

    public bool TrySelectRandom(
        RandomRequest request,
        IReadOnlyList<FilterPresetSnapshot> presets,
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
            error = "Library not loaded or empty.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        if (itemCount == 0)
        {
            error = "Library not loaded or empty.";
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
            error = "Library not loaded or empty.";
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

        RandomizationItem? picked;
        lock (_randomizationLock)
        {
            if (!_clientRandomizationStates.TryGetValue(scopeKey, out var state))
            {
                state = new RandomizationRuntimeStateCore();
                _clientRandomizationStates[scopeKey] = state;
            }

            picked = RandomSelectionEngineCore.SelectItem(
                state,
                randomizationMode,
                eligible,
                Random.Shared);
        }

        if (picked == null)
        {
            error = "No media could be selected.";
            statusCode = StatusCodes.Status500InternalServerError;
            return false;
        }

        var selected = _catalog.Session.ReadPlaybackItemById(picked.Id);
        if (selected == null || string.IsNullOrWhiteSpace(selected.FullPath))
        {
            error = "Selected item not found.";
            statusCode = StatusCodes.Status500InternalServerError;
            return false;
        }

        var token = _tokenStore.CreateToken(selected.FullPath);
        response = ApiContractMapper.MapRandomResult(
            id: selected.FullPath,
            displayName: string.IsNullOrWhiteSpace(selected.FileName) ? Path.GetFileName(selected.FullPath) : selected.FileName,
            mediaType: MediaTypeName(selected.MediaType),
            durationSeconds: DurationSeconds(selected.DurationTicks),
            mediaUrl: $"/api/media/{token}",
            isFavorite: selected.IsFavorite,
            isBlacklisted: selected.IsBlacklisted);
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

        if (forceMediaMissing || !File.Exists(match.FullPath))
        {
            statusCode = StatusCodes.Status404NotFound;
            error = "Media file not found";
            errorCode = PlayItemErrorMediaMissing;
            return false;
        }

        if (!MediaPlayableExtensions.IsPlayableFilePath(match.FullPath))
        {
            statusCode = StatusCodes.Status415UnsupportedMediaType;
            error = "Unsupported media type";
            errorCode = PlayItemErrorUnsupportedMedia;
            return false;
        }

        var token = _tokenStore.CreateToken(match.FullPath);
        response = ApiContractMapper.MapRandomResult(
            id: match.FullPath,
            displayName: string.IsNullOrWhiteSpace(match.FileName) ? Path.GetFileName(match.FullPath) : match.FileName,
            mediaType: MediaTypeName(match.MediaType),
            durationSeconds: DurationSeconds(match.DurationTicks),
            mediaUrl: $"/api/media/{token}",
            isFavorite: match.IsFavorite,
            isBlacklisted: match.IsBlacklisted);
        return true;
    }

    /// <summary>
    /// Isolates shuffle-bag / folder-spread state per browser tab (session) and per desktop process,
    /// while keeping anonymous web clients that omit session on a single shared scope.
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

    public bool TryResolveMediaPath(string idOrToken, out string fullPath)
    {
        if (_tokenStore.TryResolve(idOrToken, out fullPath))
        {
            return true;
        }

        var match = _catalog.Session.ReadPlaybackItem(idOrToken);
        if (match == null || string.IsNullOrWhiteSpace(match.FullPath))
        {
            fullPath = string.Empty;
            return false;
        }

        fullPath = match.FullPath;
        return true;
    }

    private static FilterPresetSnapshot? ResolvePreset(IReadOnlyList<FilterPresetSnapshot> presets, string presetId)
    {
        if (string.IsNullOrWhiteSpace(presetId))
        {
            return null;
        }

        return (presets ?? [])
            .FirstOrDefault(p => string.Equals(p.Name, presetId, StringComparison.OrdinalIgnoreCase));
    }

    private static bool TryResolveFilter(
        RandomRequest request,
        IReadOnlyList<FilterPresetSnapshot> presets,
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

    private static string MediaTypeName(int mediaType)
    {
        return mediaType == (int)MediaTypeValue.Photo ? "photo" : "video";
    }

    private static double? DurationSeconds(long? ticks)
    {
        return ticks is long value ? value / (double)TimeSpan.TicksPerSecond : null;
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
