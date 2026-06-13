using System;
using System.Collections.Generic;
using System.Linq;

namespace ReelRoulette;

/// <summary>
/// In-memory sort for the desktop library panel projection list.
/// </summary>
public static class LibraryPanelSort
{
    private static readonly StringComparer FileNameComparer = StringComparer.OrdinalIgnoreCase;

    public static List<LibraryItem> Apply(IReadOnlyList<LibraryItem> items, string sortMode, bool descending)
    {
        ArgumentNullException.ThrowIfNull(items);

        IEnumerable<LibraryItem> sorted = sortMode switch
        {
            "LastPlayed" => descending
                ? items.OrderByDescending(item => item.LastPlayedUtc ?? DateTime.MinValue).ThenByFileName()
                : items.OrderBy(item => item.LastPlayedUtc ?? DateTime.MinValue).ThenByFileName(),
            "PlayCount" => descending
                ? items.OrderByDescending(item => item.PlayCount).ThenByFileName()
                : items.OrderBy(item => item.PlayCount).ThenByFileName(),
            "Duration" => descending
                ? items.OrderByDescending(item => item.Duration ?? TimeSpan.Zero).ThenByFileName()
                : items.OrderBy(item => item.Duration ?? TimeSpan.Zero).ThenByFileName(),
            "DateAdded" => descending
                ? items.OrderByDescending(item => item.LastWriteTimeUtc ?? DateTime.MinValue).ThenByFileName()
                : items.OrderBy(item => item.LastWriteTimeUtc ?? DateTime.MinValue).ThenByFileName(),
            _ => descending
                ? items.OrderByDescending(item => item.FileName, FileNameComparer)
                : items.OrderBy(item => item.FileName, FileNameComparer)
        };

        return sorted.ToList();
    }

    private static IOrderedEnumerable<LibraryItem> ThenByFileName(this IOrderedEnumerable<LibraryItem> ordered)
    {
        return ordered.ThenBy(item => item.FileName, FileNameComparer);
    }

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
