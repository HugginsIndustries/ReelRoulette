using System.Text.Json;
using System.Text.Json.Nodes;

namespace ReelRoulette.Core.Filtering;

/// <summary>
/// The Favorites and Blacklisted filter modes as a filter state carries them. Presets stored before the modes carry
/// older booleans instead, which the catalog's schema 5 step rewrites into the modes: each filter resolves on its
/// own, a known mode deciding, and otherwise its older boolean. Locked to
/// src/core/ReelRoulette.Core.Tests/Fixtures/filter-mode-resolution.json.
/// </summary>
public static class FlagFilterModes
{
    /// <summary>
    /// A mode is one of the names <c>off</c>, <c>only</c>, or <c>excluded</c> in any case. Anything else counts as
    /// missing.
    /// </summary>
    public static FlagFilterModeValue? Parse(string? name)
    {
        if (string.Equals(name, "off", StringComparison.OrdinalIgnoreCase))
        {
            return FlagFilterModeValue.Off;
        }

        if (string.Equals(name, "only", StringComparison.OrdinalIgnoreCase))
        {
            return FlagFilterModeValue.Only;
        }

        return string.Equals(name, "excluded", StringComparison.OrdinalIgnoreCase) ? FlagFilterModeValue.Excluded : null;
    }

    /// <summary>Without a known mode, <c>favoritesOnly</c> true is only, and anything else is off.</summary>
    public static FlagFilterModeValue ResolveFavorites(FlagFilterModeValue? mode, bool? favoritesOnly)
    {
        return mode ?? (favoritesOnly == true ? FlagFilterModeValue.Only : FlagFilterModeValue.Off);
    }

    /// <summary>Without a known mode, <c>excludeBlacklisted</c> false is off, and anything else, including none, is excluded.</summary>
    public static FlagFilterModeValue ResolveBlacklisted(FlagFilterModeValue? mode, bool? excludeBlacklisted)
    {
        return mode ?? (excludeBlacklisted == false ? FlagFilterModeValue.Off : FlagFilterModeValue.Excluded);
    }

    /// <summary>
    /// Writes a stored filter state's modes as they resolve, by name, and removes <c>favoritesOnly</c> and
    /// <c>excludeBlacklisted</c>, so it filters as it did and has the shape every client writes. A mode that is not a
    /// string, and an old field that is not a boolean, count as missing.
    /// </summary>
    public static void WriteModes(JsonObject filterState)
    {
        ArgumentNullException.ThrowIfNull(filterState);
        var favorites = ResolveFavorites(ReadMode(filterState["favoritesMode"]), ReadBool(filterState["favoritesOnly"]));
        var blacklisted = ResolveBlacklisted(ReadMode(filterState["blacklistedMode"]), ReadBool(filterState["excludeBlacklisted"]));
        filterState["favoritesMode"] = Name(favorites);
        filterState["blacklistedMode"] = Name(blacklisted);
        filterState.Remove("favoritesOnly");
        filterState.Remove("excludeBlacklisted");
    }

    /// <summary>The mode's name as filter states carry it.</summary>
    public static string Name(FlagFilterModeValue mode) => mode switch
    {
        FlagFilterModeValue.Only => "only",
        FlagFilterModeValue.Excluded => "excluded",
        _ => "off"
    };

    private static FlagFilterModeValue? ReadMode(JsonNode? node)
    {
        return node?.GetValueKind() == JsonValueKind.String ? Parse(node.GetValue<string>()) : null;
    }

    private static bool? ReadBool(JsonNode? node)
    {
        return node?.GetValueKind() switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null
        };
    }
}
