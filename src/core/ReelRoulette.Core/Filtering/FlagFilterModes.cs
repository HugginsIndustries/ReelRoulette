namespace ReelRoulette.Core.Filtering;

/// <summary>
/// The Favorites and Blacklisted filter modes as a filter state carries them. Each filter resolves on its own: a
/// known mode decides, and otherwise its older boolean does. Every filter a client writes carries both, the older
/// boolean projected from the mode. The server's parser and the desktop's model call this; the WebUI's copy is in
/// filterStateModel.ts. Locked to shared/fixtures/filter-mode-resolution.json and filter-mode-projection.json.
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

    public static string Name(FlagFilterModeValue mode)
    {
        return mode switch
        {
            FlagFilterModeValue.Only => "only",
            FlagFilterModeValue.Excluded => "excluded",
            _ => "off"
        };
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
    /// The <c>favoritesOnly</c> a reader that knows only the older fields sees, which never narrows the mode's set.
    /// </summary>
    public static bool FavoritesOnly(FlagFilterModeValue favoritesMode)
    {
        return favoritesMode == FlagFilterModeValue.Only;
    }

    /// <summary>
    /// The <c>excludeBlacklisted</c> a reader that knows only the older fields sees, which never narrows the mode's set.
    /// </summary>
    public static bool ExcludeBlacklisted(FlagFilterModeValue blacklistedMode)
    {
        return blacklistedMode == FlagFilterModeValue.Excluded;
    }
}
