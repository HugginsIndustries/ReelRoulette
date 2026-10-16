namespace ReelRoulette.Core.Filtering;

/// <summary>
/// The Favorites and Blacklisted filter modes as a filter state carries them. Each filter resolves on its own: a
/// known mode decides, and otherwise its older boolean does, which only presets stored before the modes carry. The
/// server's parser calls this; the WebUI's copy is in filterStateModel.ts. Locked to
/// shared/fixtures/filter-mode-resolution.json.
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
}
