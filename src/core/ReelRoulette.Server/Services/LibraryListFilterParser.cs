using System.Globalization;
using System.Text.Json;
using ReelRoulette.Core.Filtering;

namespace ReelRoulette.Server.Services;

internal static class LibraryListFilterParser
{
    public static bool TryParse(JsonElement? state, out FilterStateModel? filter, out string? error)
    {
        filter = null;
        error = null;
        if (!state.HasValue || state.Value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
        {
            return true;
        }

        if (state.Value.ValueKind != JsonValueKind.Object)
        {
            error = "filterState must be an object";
            return false;
        }

        var element = state.Value;
        // Each mode field with a known value decides. Otherwise its older boolean does, read as before the modes.
        var model = new FilterStateModel
        {
            FavoritesMode = FlagMode(element, "favoritesMode") ??
                            (Bool(element, "favoritesOnly", false) ? FlagFilterModeValue.Only : FlagFilterModeValue.Off),
            BlacklistedMode = FlagMode(element, "blacklistedMode") ??
                              (Bool(element, "excludeBlacklisted", true) ? FlagFilterModeValue.Excluded : FlagFilterModeValue.Off),
            OnlyNeverPlayed = Bool(element, "onlyNeverPlayed", false),
            OnlyKnownDuration = Bool(element, "onlyKnownDuration", false),
            OnlyKnownLoudness = Bool(element, "onlyKnownLoudness", false),
            GlobalMatchMode = NullableBool(element, "globalMatchMode"),
            MinDuration = Duration(element, "minDuration"),
            MaxDuration = Duration(element, "maxDuration")
        };

        if (Enum.TryParse<AudioFilterModeValue>(Token(element, "audioFilter"), ignoreCase: true, out var audio) ||
            TryEnumNumber(Token(element, "audioFilter"), out audio))
        {
            model.AudioFilter = audio;
        }

        if (Enum.TryParse<MediaTypeFilterValue>(Token(element, "mediaTypeFilter"), ignoreCase: true, out var media) ||
            TryEnumNumber(Token(element, "mediaTypeFilter"), out media))
        {
            model.MediaTypeFilter = media;
        }

        model.SelectedTags.AddRange(Strings(element, "selectedTags"));
        model.ExcludedTags.AddRange(Strings(element, "excludedTags"));
        model.IncludedSourceIds.AddRange(Strings(element, "includedSourceIds"));
        var modes = TokenMap(element, "categoryLocalMatchModes");
        if (modes.Count > 0)
        {
            model.CategoryLocalMatchModes = new Dictionary<string, TagMatchModeValue>(StringComparer.OrdinalIgnoreCase);
            foreach (var pair in modes)
            {
                if (Enum.TryParse<TagMatchModeValue>(pair.Value, ignoreCase: true, out var mode) ||
                    TryEnumNumber(pair.Value, out mode))
                {
                    model.CategoryLocalMatchModes[pair.Key] = mode;
                }
            }
        }

        filter = model;
        return true;
    }

    private static bool Bool(JsonElement element, string name, bool defaultValue)
    {
        return element.TryGetProperty(name, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? property.GetBoolean()
            : defaultValue;
    }

    private static bool? NullableBool(JsonElement element, string name)
    {
        return element.TryGetProperty(name, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? property.GetBoolean()
            : null;
    }

    /// <summary>
    /// A mode is one of the names <c>off</c>, <c>only</c>, or <c>excluded</c> in any case. Any other value, including
    /// null or a number, counts as missing. Locked to shared/fixtures/filter-mode-resolution.json.
    /// </summary>
    private static FlagFilterModeValue? FlagMode(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = property.GetString();
        if (string.Equals(value, "off", StringComparison.OrdinalIgnoreCase))
        {
            return FlagFilterModeValue.Off;
        }

        if (string.Equals(value, "only", StringComparison.OrdinalIgnoreCase))
        {
            return FlagFilterModeValue.Only;
        }

        return string.Equals(value, "excluded", StringComparison.OrdinalIgnoreCase) ? FlagFilterModeValue.Excluded : null;
    }

    private static string? Token(JsonElement element, string name)
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

        if (property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var asInt))
        {
            return asInt.ToString(CultureInfo.InvariantCulture);
        }

        return null;
    }

    private static TimeSpan? Duration(JsonElement element, string name)
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
                return span;
            }

            if (double.TryParse(raw.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var numeric))
            {
                return TimeSpan.FromSeconds(numeric);
            }
        }
        else if (property.ValueKind == JsonValueKind.Number && property.TryGetDouble(out var asDouble))
        {
            return TimeSpan.FromSeconds(asDouble);
        }

        return null;
    }

    private static List<string> Strings(JsonElement element, string name)
    {
        var values = new List<string>();
        if (!element.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.Array)
        {
            return values;
        }

        foreach (var child in property.EnumerateArray())
        {
            if (child.ValueKind == JsonValueKind.String)
            {
                var value = child.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    values.Add(value);
                }
            }
        }

        return values;
    }

    private static Dictionary<string, string> TokenMap(JsonElement element, string name)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!element.TryGetProperty(name, out var property) || property.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var child in property.EnumerateObject())
        {
            var key = child.Name.Trim();
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var token = child.Value.ValueKind switch
            {
                JsonValueKind.String => child.Value.GetString()?.Trim(),
                JsonValueKind.Number when child.Value.TryGetInt32(out var asInt) => asInt.ToString(CultureInfo.InvariantCulture),
                _ => null
            };
            if (!string.IsNullOrWhiteSpace(token))
            {
                result[key] = token;
            }
        }

        return result;
    }

    private static bool TryEnumNumber<TEnum>(string? token, out TEnum value)
        where TEnum : struct, Enum
    {
        value = default;
        if (!int.TryParse(token, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code) ||
            !Enum.IsDefined(typeof(TEnum), code))
        {
            return false;
        }

        value = (TEnum)Enum.ToObject(typeof(TEnum), code);
        return true;
    }
}
