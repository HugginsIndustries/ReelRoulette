namespace ReelRoulette;

/// <summary>
/// Sort-control defaults and labels for the desktop library panel. The server sorts the list query.
/// </summary>
public static class LibraryPanelSort
{
    public static bool IsDefaultDescendingForSortMode(string sortMode)
    {
        return sortMode is "LastPlayed" or "PlayCount" or "Duration" or "DateAdded";
    }

    public static string GetSortDirectionLabel(string sortMode, bool descending)
    {
        return sortMode switch
        {
            "LastPlayed" => descending ? "Newest -> Oldest" : "Oldest -> Newest",
            "DateAdded" => descending ? "Newest -> Oldest" : "Oldest -> Newest",
            "PlayCount" => descending ? "Most Plays -> Least Plays" : "Least Plays -> Most Plays",
            "Duration" => descending ? "Longest -> Shortest" : "Shortest -> Longest",
            _ => descending ? "Z-A" : "A-Z"
        };
    }
}
