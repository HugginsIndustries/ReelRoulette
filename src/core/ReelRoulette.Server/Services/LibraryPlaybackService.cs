using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using ReelRoulette.Core.Filtering;
using ReelRoulette.Core.Randomization;
using ReelRoulette.Server.Contracts;

namespace ReelRoulette.Server.Services;

public sealed class LibraryPlaybackService
{
    private readonly string _libraryPath;
    private readonly ServerMediaTokenStore _tokenStore;
    private readonly ILogger<LibraryPlaybackService> _logger;
    private readonly object _cacheLock = new();
    private readonly object _randomizationLock = new();
    private DateTime _cachedLibraryWriteUtc = DateTime.MinValue;
    private List<LibraryItemRecord> _cachedItems = [];
    private readonly Dictionary<string, RandomizationRuntimeStateCore> _clientRandomizationStates = new(StringComparer.OrdinalIgnoreCase);

    public LibraryPlaybackService(
        ServerMediaTokenStore tokenStore,
        ILogger<LibraryPlaybackService> logger,
        string? appDataPathOverride = null)
    {
        _tokenStore = tokenStore;
        _logger = logger;
        var roamingAppData = appDataPathOverride ??
                             Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");
        Directory.CreateDirectory(roamingAppData);
        _libraryPath = Path.Combine(roamingAppData, "library.json");
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
        IReadOnlyList<TagCategorySnapshot> categories,
        IReadOnlyList<TagSnapshot> tags,
        out RandomResponse? response,
        out int statusCode,
        out string? error)
    {
        response = null;
        error = null;
        statusCode = StatusCodes.Status200OK;

        var items = LoadItems();
        if (items.Count == 0)
        {
            error = "Library not loaded or empty.";
            statusCode = StatusCodes.Status503ServiceUnavailable;
            return false;
        }

        var filterState = ResolveEffectiveFilterState(request, presets, out statusCode, out error);
        if (filterState is null)
        {
            return false;
        }

        var eligible = FilterEligible(items, filterState, categories, tags, request).ToList();
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
        if (string.IsNullOrWhiteSpace(selected.FullPath))
        {
            error = "Selected item not found.";
            statusCode = StatusCodes.Status500InternalServerError;
            return false;
        }
        var token = _tokenStore.CreateToken(selected.FullPath);

        response = ApiContractMapper.MapRandomResult(
            id: selected.FullPath,
            displayName: selected.FileName,
            mediaType: selected.MediaType,
            durationSeconds: selected.DurationSeconds,
            mediaUrl: $"/api/media/{token}",
            isFavorite: selected.IsFavorite,
            isBlacklisted: selected.IsBlacklisted);
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

        var items = LoadItems();
        var match = items.FirstOrDefault(item =>
            string.Equals(item.Id, idOrToken, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(item.FullPath, idOrToken, StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrWhiteSpace(match.FullPath))
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

    private static FilterStateProjection? ResolveEffectiveFilterState(
        RandomRequest request,
        IReadOnlyList<FilterPresetSnapshot> presets,
        out int statusCode,
        out string? error)
    {
        statusCode = StatusCodes.Status200OK;
        error = null;

        if (request.FilterState.HasValue &&
            request.FilterState.Value.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
        {
            return ParseFilterState(request.FilterState.Value);
        }

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
            return null;
        }

        return ParseFilterState(preset?.FilterState);
    }

    private static IEnumerable<LibraryItemRecord> FilterEligible(
        IReadOnlyList<LibraryItemRecord> items,
        FilterStateProjection state,
        IReadOnlyList<TagCategorySnapshot> categories,
        IReadOnlyList<TagSnapshot> tags,
        RandomRequest request)
    {
        if (!request.IncludeVideos && !request.IncludePhotos)
        {
            return [];
        }

        var itemsByKey = new Dictionary<string, LibraryItemRecord>(StringComparer.OrdinalIgnoreCase);
        var filterItems = new List<FilterItem>(items.Count);
        var sourcesById = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        var hasSourceLessItems = false;

        foreach (var item in items)
        {
            itemsByKey[item.FullPath] = item;
            filterItems.Add(new FilterItem
            {
                Key = item.FullPath,
                SourceId = item.SourceId,
                FullPath = item.FullPath,
                IsBlacklisted = item.IsBlacklisted,
                IsFavorite = item.IsFavorite,
                PlayCount = item.PlayCount,
                HasAudio = item.HasAudio,
                Duration = item.DurationSeconds.HasValue ? TimeSpan.FromSeconds(item.DurationSeconds.Value) : null,
                IntegratedLoudness = item.IntegratedLoudness,
                MediaType = ParseMediaTypeValue(item.MediaType),
                Tags = item.Tags.Where(t => !string.IsNullOrWhiteSpace(t)).ToList()
            });

            if (string.IsNullOrWhiteSpace(item.SourceId))
            {
                hasSourceLessItems = true;
                continue;
            }

            if (!sourcesById.TryGetValue(item.SourceId, out var isEnabled))
            {
                sourcesById[item.SourceId] = item.IsSourceEnabled;
            }
            else if (!isEnabled && item.IsSourceEnabled)
            {
                sourcesById[item.SourceId] = true;
            }
        }

        if (hasSourceLessItems && !sourcesById.ContainsKey(string.Empty))
        {
            sourcesById[string.Empty] = true;
        }

        var filterRequest = new FilterSetRequest
        {
            Sources = sourcesById.Select(pair => new FilterSource
            {
                Id = pair.Key,
                IsEnabled = pair.Value
            }).ToList(),
            Items = filterItems,
            CategoryIds = categories.Select(c => c.Id).ToList(),
            Tags = tags.Select(tag => new FilterTag
            {
                Name = tag.Name,
                CategoryId = tag.CategoryId
            }).ToList()
        };

        var filterState = state.ToModel();
        var eligible = new FilterSetBuilder().BuildEligibleSetWithoutFileCheck(filterState, filterRequest);
        var eligibleSet = eligible
            .Select(item => item.Key)
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var query = items.Where(item => eligibleSet.Contains(item.FullPath));
        if (!request.IncludeVideos)
        {
            query = query.Where(item => string.Equals(item.MediaType, "photo", StringComparison.OrdinalIgnoreCase));
        }
        else if (!request.IncludePhotos)
        {
            query = query.Where(item => string.Equals(item.MediaType, "video", StringComparison.OrdinalIgnoreCase));
        }

        return query;
    }

    private List<LibraryItemRecord> LoadItems()
    {
        if (!File.Exists(_libraryPath))
        {
            return [];
        }

        lock (_cacheLock)
        {
            var currentWriteUtc = File.GetLastWriteTimeUtc(_libraryPath);
            if (_cachedItems.Count > 0 && currentWriteUtc == _cachedLibraryWriteUtc)
            {
                return _cachedItems;
            }

            try
            {
                var json = File.ReadAllText(_libraryPath);
                var root = JsonNode.Parse(json) as JsonObject;
                var nodes = root?["items"]?.AsArray() ?? [];
                var enabledSources = (root?["sources"] as JsonArray ?? [])
                    .OfType<JsonObject>()
                    .Where(node =>
                        (node["isEnabled"]?.GetValue<bool?>() ?? true) &&
                        !string.IsNullOrWhiteSpace(node["id"]?.GetValue<string>()))
                    .Select(node => node["id"]!.GetValue<string>())
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var result = new List<LibraryItemRecord>();
                foreach (var node in nodes)
                {
                    if (node is not JsonObject itemNode)
                    {
                        continue;
                    }

                    var fullPath = itemNode["fullPath"]?.GetValue<string>()?.Trim();
                    if (string.IsNullOrWhiteSpace(fullPath))
                    {
                        continue;
                    }

                    var id = itemNode["id"]?.GetValue<string>()?.Trim();
                    var fileName = itemNode["fileName"]?.GetValue<string>()?.Trim();
                    var durationSeconds = ParseDurationSeconds(itemNode["duration"]);
                    var mediaType = ParseMediaType(itemNode["mediaType"]);
                    var sourceId = itemNode["sourceId"]?.GetValue<string>()?.Trim() ?? string.Empty;
                    var isFavorite = itemNode["isFavorite"]?.GetValue<bool?>() ?? false;
                    var isBlacklisted = itemNode["isBlacklisted"]?.GetValue<bool?>() ?? false;
                    var playCount = itemNode["playCount"]?.GetValue<int?>() ?? 0;
                    var lastPlayedUtc = ParseDateTime(itemNode["lastPlayedUtc"]);
                    var hasAudio = itemNode["hasAudio"]?.GetValue<bool?>();
                    var integratedLoudness = itemNode["integratedLoudness"]?.GetValue<double?>();
                    var tags = itemNode["tags"] is JsonArray tagsArray
                        ? tagsArray.Select(x => x?.GetValue<string>()?.Trim())
                            .Where(x => !string.IsNullOrWhiteSpace(x))
                            .Select(x => x!)
                            .ToList()
                        : [];

                    result.Add(new LibraryItemRecord(
                        Id: string.IsNullOrWhiteSpace(id) ? fullPath : id,
                        FullPath: fullPath,
                        SourceId: sourceId,
                        IsSourceEnabled: string.IsNullOrWhiteSpace(sourceId) || enabledSources.Count == 0 || enabledSources.Contains(sourceId),
                        FileName: string.IsNullOrWhiteSpace(fileName) ? Path.GetFileName(fullPath) : fileName,
                        MediaType: mediaType,
                        DurationSeconds: durationSeconds,
                        IsFavorite: isFavorite,
                        IsBlacklisted: isBlacklisted,
                        PlayCount: playCount,
                        LastPlayedUtc: lastPlayedUtc,
                        HasAudio: hasAudio,
                        IntegratedLoudness: integratedLoudness,
                        Tags: tags));
                }

                _cachedItems = result;
                _cachedLibraryWriteUtc = currentWriteUtc;
                return _cachedItems;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not parse library index from '{LibraryPath}'.", _libraryPath);
                return _cachedItems;
            }
        }
    }

    private static double? ParseDurationSeconds(JsonNode? node)
    {
        if (node is null)
        {
            return null;
        }

        if (node is JsonValue value)
        {
            if (value.TryGetValue<string>(out var asString) &&
                TimeSpan.TryParse(asString, CultureInfo.InvariantCulture, out var parsed))
            {
                return parsed.TotalSeconds;
            }

            if (value.TryGetValue<double>(out var asDouble))
            {
                return asDouble;
            }
        }

        return null;
    }

    private static string ParseMediaType(JsonNode? node)
    {
        if (node is JsonValue value)
        {
            if (value.TryGetValue<int>(out var mediaTypeCode))
            {
                return mediaTypeCode == 1 ? "photo" : "video";
            }

            if (value.TryGetValue<string>(out var asString))
            {
                return asString.Equals("photo", StringComparison.OrdinalIgnoreCase) ? "photo" : "video";
            }
        }

        return "video";
    }

    private static MediaTypeValue ParseMediaTypeValue(string? mediaType)
    {
        return string.Equals(mediaType, "photo", StringComparison.OrdinalIgnoreCase)
            ? MediaTypeValue.Photo
            : MediaTypeValue.Video;
    }

    private static DateTime? ParseDateTime(JsonNode? node)
    {
        if (node is not JsonValue value || !value.TryGetValue<string>(out var asString) || string.IsNullOrWhiteSpace(asString))
        {
            return null;
        }

        return DateTime.TryParse(asString, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;
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
            TagMatchMode = NormalizeTagMatchModeToken(TryGetToken(filterState, "tagMatchMode")),
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

    private readonly record struct LibraryItemRecord(
        string Id,
        string FullPath,
        string SourceId,
        bool IsSourceEnabled,
        string FileName,
        string MediaType,
        double? DurationSeconds,
        bool IsFavorite,
        bool IsBlacklisted,
        int PlayCount,
        DateTime? LastPlayedUtc,
        bool? HasAudio,
        double? IntegratedLoudness,
        IReadOnlyList<string> Tags);

    private sealed class FilterStateProjection : IEquatable<FilterStateProjection>
    {
        public bool FavoritesOnly { get; set; }
        public bool ExcludeBlacklisted { get; set; } = true;
        public bool OnlyNeverPlayed { get; set; }
        public bool OnlyKnownDuration { get; set; }
        public bool OnlyKnownLoudness { get; set; }
        public string? AudioFilter { get; set; }
        public string? MediaTypeFilter { get; set; }
        public string? TagMatchMode { get; set; }
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

            if (Enum.TryParse<TagMatchModeValue>(TagMatchMode, ignoreCase: true, out var tagMatchMode))
            {
                model.TagMatchMode = tagMatchMode;
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
                !string.Equals(TagMatchMode ?? string.Empty, other.TagMatchMode ?? string.Empty, StringComparison.OrdinalIgnoreCase) ||
                GlobalMatchMode != other.GlobalMatchMode ||
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
