using System.Globalization;
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
    private readonly object _randomizationLock = new();
    private readonly Dictionary<string, RandomizationRuntimeStateCore> _clientRandomizationStates = new(StringComparer.OrdinalIgnoreCase);

    public LibraryPlaybackService(
        ServerMediaTokenStore tokenStore,
        ILogger<LibraryPlaybackService> logger,
        string? appDataPathOverride = null,
        LibraryCatalogHost? catalog = null)
    {
        _tokenStore = tokenStore;
        _logger = logger;
        var roamingAppData = appDataPathOverride ??
                             Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(roamingAppData);
        _catalog = catalog ?? LibraryCatalogHost.Open(roamingAppData, LibraryCatalogHost.LocalThumbnailDirectory(appDataPathOverride));
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

    public bool TryMatchPreset(
        PresetMatchRequest request,
        IReadOnlyList<FilterPresetSnapshot> presets,
        out PresetMatchResponse response,
        out int statusCode,
        out string? error)
    {
        response = new PresetMatchResponse();
        statusCode = StatusCodes.Status200OK;
        error = null;

        if (!request.FilterState.HasValue ||
            request.FilterState.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            statusCode = StatusCodes.Status400BadRequest;
            error = "filterState is required";
            return false;
        }

        var match = ResolvePresetByFilterState(presets, request.FilterState.Value);
        if (match is null)
        {
            return true;
        }

        response = new PresetMatchResponse
        {
            Matched = true,
            PresetId = match.Name,
            PresetName = match.Name
        };
        return true;
    }

    public bool TrySelectRandom(
        RandomRequest request,
        IReadOnlyList<FilterPresetSnapshot> presets,
        out RandomResponse? response,
        out int statusCode,
        out string? error)
    {
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

        IReadOnlyList<LibraryCatalogItem> eligible;
        try
        {
            eligible = _catalog.Session.QueryEligible(filter, requiredMediaType);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not query eligible library items in '{DatabasePath}'.", _catalog.Session.DatabasePath);
            error = "Library not loaded or empty.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        if (eligible.Count == 0)
        {
            return true;
        }

        var randomizationItems = eligible.Select(item => new RandomizationItem
        {
            FullPath = item.FullPath,
            PlayCount = item.PlayCount,
            LastPlayedUtc = item.LastPlayedUtc
        }).ToList();
        var randomizationMode = ParseRandomizationMode(request.RandomizationMode);
        var scopeKey = BuildRandomizationScopeKey(request.ClientId, request.SessionId);

        string? selectedPath;
        lock (_randomizationLock)
        {
            if (!_clientRandomizationStates.TryGetValue(scopeKey, out var state))
            {
                state = new RandomizationRuntimeStateCore();
                _clientRandomizationStates[scopeKey] = state;
            }

            selectedPath = RandomSelectionEngineCore.SelectPath(
                state,
                randomizationMode,
                randomizationItems,
                Random.Shared);
        }

        if (string.IsNullOrWhiteSpace(selectedPath))
        {
            error = "No media could be selected.";
            statusCode = StatusCodes.Status500InternalServerError;
            return false;
        }

        var selected = eligible.FirstOrDefault(item =>
            string.Equals(item.FullPath, selectedPath, StringComparison.OrdinalIgnoreCase));
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
        return true;
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

    private static FilterPresetSnapshot? ResolvePresetByFilterState(IReadOnlyList<FilterPresetSnapshot> presets, JsonElement filterState)
    {
        var sourceProjection = ParseFilterState(filterState);
        return (presets ?? []).FirstOrDefault(p =>
        {
            var presetProjection = ParseFilterState(p.FilterState);
            return sourceProjection.Equals(presetProjection);
        });
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

    private static FilterStateProjection ParseFilterState(JsonElement? state)
    {
        if (!state.HasValue ||
            state.Value.ValueKind == JsonValueKind.Undefined ||
            state.Value.ValueKind == JsonValueKind.Null)
        {
            return new FilterStateProjection();
        }

        var filterState = state.Value;
        var projection = new FilterStateProjection
        {
            FavoritesOnly = TryGetBool(filterState, "favoritesOnly", defaultValue: false),
            ExcludeBlacklisted = TryGetBool(filterState, "excludeBlacklisted", defaultValue: true),
            OnlyNeverPlayed = TryGetBool(filterState, "onlyNeverPlayed", defaultValue: false),
            OnlyKnownDuration = TryGetBool(filterState, "onlyKnownDuration", defaultValue: false),
            OnlyKnownLoudness = TryGetBool(filterState, "onlyKnownLoudness", defaultValue: false),
            AudioFilter = NormalizeAudioFilterToken(TryGetToken(filterState, "audioFilter")),
            MediaTypeFilter = NormalizeMediaTypeFilterToken(TryGetToken(filterState, "mediaTypeFilter")),
            GlobalMatchMode = TryGetNullableBool(filterState, "globalMatchMode"),
            MinDurationSeconds = TryGetDurationSeconds(filterState, "minDuration"),
            MaxDurationSeconds = TryGetDurationSeconds(filterState, "maxDuration")
        };

        projection.SelectedTags.AddRange(TryGetStringArray(filterState, "selectedTags"));
        projection.ExcludedTags.AddRange(TryGetStringArray(filterState, "excludedTags"));
        projection.IncludedSourceIds.AddRange(TryGetStringArray(filterState, "includedSourceIds"));
        foreach (var pair in TryGetTokenMap(filterState, "categoryLocalMatchModes"))
        {
            projection.CategoryLocalMatchModes[pair.Key] = NormalizeTagMatchModeToken(pair.Value) ?? TagMatchModeValue.And.ToString();
        }
        return projection;
    }

    private static bool TryGetBool(JsonElement element, string name, bool defaultValue)
    {
        if (element.TryGetProperty(name, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False)
        {
            return property.GetBoolean();
        }

        return defaultValue;
    }

    private static bool? TryGetNullableBool(JsonElement element, string name)
    {
        if (element.TryGetProperty(name, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False)
        {
            return property.GetBoolean();
        }

        return null;
    }

    private static string? TryGetToken(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            var value = property.GetString();
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        if (property.ValueKind == JsonValueKind.Number)
        {
            if (property.TryGetInt32(out var asInt))
            {
                return asInt.ToString(CultureInfo.InvariantCulture);
            }

            if (property.TryGetDouble(out var asDouble))
            {
                return asDouble.ToString(CultureInfo.InvariantCulture);
            }
        }

        return null;
    }

    private static double? TryGetDurationSeconds(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            var raw = property.GetString();
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            if (TimeSpan.TryParse(raw.Trim(), CultureInfo.InvariantCulture, out var span))
            {
                return span.TotalSeconds;
            }

            if (double.TryParse(raw.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var numeric))
            {
                return numeric;
            }
        }
        else if (property.ValueKind == JsonValueKind.Number && property.TryGetDouble(out var asDouble))
        {
            return asDouble;
        }

        return null;
    }

    private static Dictionary<string, string> TryGetTokenMap(JsonElement element, string name)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!element.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var child in property.EnumerateObject())
        {
            var key = child.Name?.Trim();
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var token = child.Value.ValueKind switch
            {
                JsonValueKind.String => child.Value.GetString()?.Trim(),
                JsonValueKind.Number when child.Value.TryGetInt32(out var asInt) => asInt.ToString(CultureInfo.InvariantCulture),
                JsonValueKind.Number when child.Value.TryGetDouble(out var asDouble) => asDouble.ToString(CultureInfo.InvariantCulture),
                _ => null
            };
            if (!string.IsNullOrWhiteSpace(token))
            {
                result[key] = token;
            }
        }

        return result;
    }

    private static string? NormalizeAudioFilterToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        if (Enum.TryParse<AudioFilterModeValue>(token.Trim(), ignoreCase: true, out var parsed))
        {
            return parsed.ToString();
        }

        if (int.TryParse(token, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code) &&
            Enum.IsDefined(typeof(AudioFilterModeValue), code))
        {
            return ((AudioFilterModeValue)code).ToString();
        }

        return token.Trim();
    }

    private static string? NormalizeMediaTypeFilterToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        if (Enum.TryParse<MediaTypeFilterValue>(token.Trim(), ignoreCase: true, out var parsed))
        {
            return parsed.ToString();
        }

        if (int.TryParse(token, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code) &&
            Enum.IsDefined(typeof(MediaTypeFilterValue), code))
        {
            return ((MediaTypeFilterValue)code).ToString();
        }

        return token.Trim();
    }

    private static string? NormalizeTagMatchModeToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        if (Enum.TryParse<TagMatchModeValue>(token.Trim(), ignoreCase: true, out var parsed))
        {
            return parsed.ToString();
        }

        if (int.TryParse(token, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code) &&
            Enum.IsDefined(typeof(TagMatchModeValue), code))
        {
            return ((TagMatchModeValue)code).ToString();
        }

        return token.Trim();
    }

    private static IReadOnlyList<string> TryGetStringArray(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var values = new List<string>();
        foreach (var child in property.EnumerateArray())
        {
            if (child.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var value = child.GetString();
            if (!string.IsNullOrWhiteSpace(value))
            {
                values.Add(value);
            }
        }

        return values;
    }

    private sealed class FilterStateProjection : IEquatable<FilterStateProjection>
    {
        public bool FavoritesOnly { get; set; }
        public bool ExcludeBlacklisted { get; set; } = true;
        public bool OnlyNeverPlayed { get; set; }
        public bool OnlyKnownDuration { get; set; }
        public bool OnlyKnownLoudness { get; set; }
        public string? AudioFilter { get; set; }
        public string? MediaTypeFilter { get; set; }
        public bool? GlobalMatchMode { get; set; }
        public double? MinDurationSeconds { get; set; }
        public double? MaxDurationSeconds { get; set; }
        public List<string> SelectedTags { get; } = [];
        public List<string> ExcludedTags { get; } = [];
        public List<string> IncludedSourceIds { get; } = [];
        public Dictionary<string, string> CategoryLocalMatchModes { get; } = new(StringComparer.OrdinalIgnoreCase);

        public FilterStateModel ToModel()
        {
            var model = new FilterStateModel
            {
                FavoritesOnly = FavoritesOnly,
                ExcludeBlacklisted = ExcludeBlacklisted,
                OnlyNeverPlayed = OnlyNeverPlayed,
                OnlyKnownDuration = OnlyKnownDuration,
                OnlyKnownLoudness = OnlyKnownLoudness,
                GlobalMatchMode = GlobalMatchMode,
                MinDuration = MinDurationSeconds.HasValue ? TimeSpan.FromSeconds(MinDurationSeconds.Value) : null,
                MaxDuration = MaxDurationSeconds.HasValue ? TimeSpan.FromSeconds(MaxDurationSeconds.Value) : null
            };

            if (Enum.TryParse<AudioFilterModeValue>(AudioFilter, ignoreCase: true, out var audioFilter))
            {
                model.AudioFilter = audioFilter;
            }

            if (Enum.TryParse<MediaTypeFilterValue>(MediaTypeFilter, ignoreCase: true, out var mediaTypeFilter))
            {
                model.MediaTypeFilter = mediaTypeFilter;
            }

            model.SelectedTags.AddRange(SelectedTags.Where(v => !string.IsNullOrWhiteSpace(v)));
            model.ExcludedTags.AddRange(ExcludedTags.Where(v => !string.IsNullOrWhiteSpace(v)));
            model.IncludedSourceIds.AddRange(IncludedSourceIds.Where(v => !string.IsNullOrWhiteSpace(v)));

            if (CategoryLocalMatchModes.Count > 0)
            {
                model.CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase);
                foreach (var pair in CategoryLocalMatchModes)
                {
                    if (string.IsNullOrWhiteSpace(pair.Key))
                    {
                        continue;
                    }

                    if (Enum.TryParse<TagMatchModeValue>(pair.Value, ignoreCase: true, out var parsed))
                    {
                        model.CategoryLocalMatchModes[pair.Key] = parsed;
                    }
                }
            }

            return model;
        }

        public bool Equals(FilterStateProjection? other)
        {
            if (other is null)
            {
                return false;
            }

            if (FavoritesOnly != other.FavoritesOnly ||
                ExcludeBlacklisted != other.ExcludeBlacklisted ||
                OnlyNeverPlayed != other.OnlyNeverPlayed ||
                OnlyKnownDuration != other.OnlyKnownDuration ||
                OnlyKnownLoudness != other.OnlyKnownLoudness ||
                !string.Equals(AudioFilter ?? string.Empty, other.AudioFilter ?? string.Empty, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(MediaTypeFilter ?? string.Empty, other.MediaTypeFilter ?? string.Empty, StringComparison.OrdinalIgnoreCase) ||
                (GlobalMatchMode ?? true) != (other.GlobalMatchMode ?? true) ||
                !NullableDoubleEquals(MinDurationSeconds, other.MinDurationSeconds) ||
                !NullableDoubleEquals(MaxDurationSeconds, other.MaxDurationSeconds))
            {
                return false;
            }

            return SetEquals(SelectedTags, other.SelectedTags) &&
                   SetEquals(ExcludedTags, other.ExcludedTags) &&
                   SetEquals(IncludedSourceIds, other.IncludedSourceIds) &&
                   MapEquals(CategoryLocalMatchModes, other.CategoryLocalMatchModes);
        }

        private static bool SetEquals(IReadOnlyCollection<string> left, IReadOnlyCollection<string> right)
        {
            if (left.Count != right.Count)
            {
                return false;
            }

            var leftSet = new HashSet<string>(left.Where(v => !string.IsNullOrWhiteSpace(v)), StringComparer.OrdinalIgnoreCase);
            var rightSet = new HashSet<string>(right.Where(v => !string.IsNullOrWhiteSpace(v)), StringComparer.OrdinalIgnoreCase);
            return leftSet.SetEquals(rightSet);
        }

        private static bool NullableDoubleEquals(double? left, double? right)
        {
            if (!left.HasValue && !right.HasValue)
            {
                return true;
            }

            if (!left.HasValue || !right.HasValue)
            {
                return false;
            }

            return Math.Abs(left.Value - right.Value) < 0.0001;
        }

        private static bool MapEquals(
            IReadOnlyDictionary<string, string> left,
            IReadOnlyDictionary<string, string> right)
        {
            if (left.Count != right.Count)
            {
                return false;
            }

            foreach (var pair in left)
            {
                if (!right.TryGetValue(pair.Key, out var rightValue))
                {
                    return false;
                }

                if (!string.Equals(pair.Value ?? string.Empty, rightValue ?? string.Empty, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }
            }

            return true;
        }
    }
}
