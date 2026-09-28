using System;
using System.Collections.Generic;

namespace ReelRoulette;

public enum LibraryPanelBrowseEvent
{
    FavoriteOrBlacklist,
    Playback,
    ItemTags
}

public enum LibraryPanelBrowseEffect
{
    None,
    Patch,
    ReloadLoaded
}

public enum LibraryPanelBrowseUnknownTag
{
    Skip,
    ReloadLoadedAfterBatch
}

public enum LibraryPanelBrowseRequest
{
    Reset,
    ReloadLoaded
}

public enum LibraryCurrentFileSource
{
    None,
    LoadedTile,
    SingleItem
}

public readonly record struct CurrentFileStatsPaint
{
    public bool PaintNow { get; init; }
    public DateTime? ShownPreviousLastPlayedUtc { get; init; }
    public string? PendingPath { get; init; }
    public DateTime? PendingPreviousLastPlayedUtc { get; init; }
}

public readonly record struct CurrentFileStartStats
{
    public DateTime? ShownPreviousLastPlayedUtc { get; init; }
    public bool ClearPending { get; init; }
}

/// <summary>
/// Decides how the desktop library grid fetches and updates a continuous result, without drawing tiles.
/// </summary>
public static class LibraryPanelBrowse
{
    public const int WindowSize = 200;
    public const double OverscanPx = 900d;

    public static bool ShouldFill(int loadedCount, int totalCount, double loadedExtentHeight, double viewportBottom)
    {
        if (loadedCount <= 0 || totalCount <= 0 || loadedCount >= totalCount)
        {
            return false;
        }

        return loadedExtentHeight < viewportBottom + OverscanPx;
    }

    public static (int Offset, int Limit) NextWindow(int loadedCount)
    {
        return (Math.Max(0, loadedCount), WindowSize);
    }

    /// <summary>
    /// A reset stays queued until its result is applied. A reload must not replace it.
    /// </summary>
    public static LibraryPanelBrowseRequest CoalesceRequest(LibraryPanelBrowseRequest? queued, LibraryPanelBrowseRequest incoming)
    {
        if (queued == LibraryPanelBrowseRequest.Reset || incoming == LibraryPanelBrowseRequest.Reset)
        {
            return LibraryPanelBrowseRequest.Reset;
        }

        return incoming;
    }

    /// <summary>
    /// An append page is valid only for the loaded count it was fetched against.
    /// </summary>
    public static bool CanApplyAppend(int loadedCount, int requestedOffset)
    {
        return loadedCount == requestedOffset;
    }

    /// <summary>
    /// A held scrollbar defers a filter, sort, or reload. An append applies during the drag
    /// so releasing the thumb does not replay a reset.
    /// </summary>
    public static bool ShouldDeferBrowseForScroll(bool isScrollInteracting, bool isAppend)
    {
        return isScrollInteracting && !isAppend;
    }

    /// <summary>
    /// The browse query stays open while a filter, sort, or reload is still deferred.
    /// Releasing it would let a scroll drag append the new query onto the old tiles.
    /// A newer generation owns the flag and must not clear it.
    /// </summary>
    public static bool ShouldReleaseBrowseQuery(bool generationMatches, bool refreshStillPending)
    {
        return generationMatches && !refreshStillPending;
    }

    /// <summary>
    /// Further pages wait while a filter, sort, or reload is still open or deferred.
    /// </summary>
    public static bool ShouldSuppressAppend(bool queryOpen, bool refreshStillPending)
    {
        return queryOpen || refreshStillPending;
    }

    /// <summary>
    /// A further page that has not been applied yet is an open browse query.
    /// A tile update must read the window again so that page cannot replace the update.
    /// </summary>
    public static bool IsBrowseQueryOpen(bool resetOrReloadOpen, bool appendInFlight)
    {
        return resetOrReloadOpen || appendInFlight;
    }

    /// <summary>
    /// An open query is read again after a tile update so a page already requested cannot replace that update.
    /// A reload is read again even when no query is open.
    /// </summary>
    public static bool ShouldReplayBrowse(bool queryOpen, LibraryPanelBrowseEffect effect)
    {
        return queryOpen || effect == LibraryPanelBrowseEffect.ReloadLoaded;
    }

    /// <summary>
    /// Clamp a restored scroll offset to the row-model extent. The scroll viewer's extent can still be the previous layout.
    /// </summary>
    public static double ClampScrollOffset(double offsetY, double contentExtent, double viewportHeight)
    {
        var maxY = Math.Max(0, contentExtent - Math.Max(0, viewportHeight));
        return Math.Clamp(offsetY, 0, maxY);
    }

    public static IReadOnlyList<(int Offset, int Limit)> ReloadWindows(int loadedCount)
    {
        if (loadedCount <= 0)
        {
            return [(0, WindowSize)];
        }

        var windows = new List<(int Offset, int Limit)>();
        var offset = 0;
        while (offset < loadedCount)
        {
            var limit = Math.Min(WindowSize, loadedCount - offset);
            windows.Add((offset, limit));
            offset += limit;
        }

        return windows;
    }

    /// <summary>
    /// The last loaded row is provisional until the result is exhausted, so an append rebuilds from that row.
    /// </summary>
    public static int AppendReflowItemIndex(int firstIncomingIndex, int lastRowStartIndex)
    {
        if (lastRowStartIndex < 0)
        {
            return firstIncomingIndex;
        }

        return Math.Min(firstIncomingIndex, lastRowStartIndex);
    }

    /// <summary>
    /// -1 means the loaded rows do not need a rebuild. A reset always starts at the first tile.
    /// A layout change on an unchanged id still reflows from that tile.
    /// </summary>
    public static int QueryReflowIndex(bool reset, int firstChangedIndex, int firstLayoutIndex)
    {
        if (reset)
        {
            return 0;
        }

        if (firstChangedIndex < 0 && firstLayoutIndex < 0)
        {
            return -1;
        }

        if (firstChangedIndex < 0)
        {
            return firstLayoutIndex;
        }

        if (firstLayoutIndex < 0)
        {
            return firstChangedIndex;
        }

        return Math.Min(firstChangedIndex, firstLayoutIndex);
    }

    /// <summary>
    /// An id that is neither in the catalog snapshot nor the loaded tiles. A tag filter can change
    /// membership for an item the grid has not loaded, so that case reloads after the rest of the event.
    /// </summary>
    public static LibraryPanelBrowseUnknownTag UnknownTagItem(bool hasTagFilter)
    {
        if (hasTagFilter)
        {
            return LibraryPanelBrowseUnknownTag.ReloadLoadedAfterBatch;
        }

        return LibraryPanelBrowseUnknownTag.Skip;
    }

    public static LibraryPanelBrowseEffect EffectFor(
        LibraryPanelBrowseEvent kind,
        bool favoritesOnly,
        bool excludeBlacklisted,
        bool onlyNeverPlayed,
        bool hasTagFilter,
        string? sortMode)
    {
        switch (kind)
        {
            case LibraryPanelBrowseEvent.FavoriteOrBlacklist:
                return favoritesOnly || excludeBlacklisted
                    ? LibraryPanelBrowseEffect.ReloadLoaded
                    : LibraryPanelBrowseEffect.Patch;
            case LibraryPanelBrowseEvent.Playback:
                return onlyNeverPlayed || IsPlaybackOrderSort(sortMode)
                    ? LibraryPanelBrowseEffect.ReloadLoaded
                    : LibraryPanelBrowseEffect.Patch;
            case LibraryPanelBrowseEvent.ItemTags:
                return hasTagFilter
                    ? LibraryPanelBrowseEffect.ReloadLoaded
                    : LibraryPanelBrowseEffect.Patch;
            default:
                return LibraryPanelBrowseEffect.None;
        }
    }

    /// <summary>
    /// A loaded tile wins. A single-item read supplies now-playing stats when that tile is not loaded.
    /// </summary>
    public static LibraryCurrentFileSource CurrentFileSource(bool loadedHasItem, bool singleItemHasItem)
    {
        if (loadedHasItem)
        {
            return LibraryCurrentFileSource.LoadedTile;
        }

        if (singleItemHasItem)
        {
            return LibraryCurrentFileSource.SingleItem;
        }

        return LibraryCurrentFileSource.None;
    }

    /// <summary>
    /// The current file is not in the loaded window, so now-playing reads that one item.
    /// </summary>
    public static bool NeedsCurrentFileRead(bool loadedHasItem)
    {
        return !loadedHasItem;
    }

    /// <summary>
    /// A playback event paints the current-file section only when that file is already playing.
    /// An earlier event keeps that file's pre-play last-played time until playback starts.
    /// </summary>
    public static CurrentFileStatsPaint PlaybackStatsPaint(
        bool playbackIsCurrentFile,
        DateTime? itemLastPlayedBefore,
        DateTime? shownPreviousLastPlayedUtc,
        string? playbackPath)
    {
        if (playbackIsCurrentFile)
        {
            return new CurrentFileStatsPaint
            {
                PaintNow = true,
                ShownPreviousLastPlayedUtc = itemLastPlayedBefore,
                PendingPath = null,
                PendingPreviousLastPlayedUtc = null
            };
        }

        return new CurrentFileStatsPaint
        {
            PaintNow = false,
            ShownPreviousLastPlayedUtc = shownPreviousLastPlayedUtc,
            PendingPath = playbackPath,
            PendingPreviousLastPlayedUtc = itemLastPlayedBefore
        };
    }

    /// <summary>
    /// Starting a different file takes a matching pending last-played time, or clears the one on screen.
    /// Starting the same file leaves the value a playback event already stored.
    /// </summary>
    public static CurrentFileStartStats PreviousLastPlayedOnStart(
        string? newPath,
        string? previousPath,
        DateTime? shownPreviousLastPlayedUtc,
        string? pendingPath,
        DateTime? pendingPreviousLastPlayedUtc)
    {
        if (string.Equals(newPath, previousPath, StringComparison.OrdinalIgnoreCase))
        {
            return new CurrentFileStartStats
            {
                ShownPreviousLastPlayedUtc = shownPreviousLastPlayedUtc,
                ClearPending = false
            };
        }

        var matchesPending = !string.IsNullOrWhiteSpace(newPath) &&
                             string.Equals(newPath, pendingPath, StringComparison.OrdinalIgnoreCase);
        return new CurrentFileStartStats
        {
            ShownPreviousLastPlayedUtc = matchesPending ? pendingPreviousLastPlayedUtc : null,
            ClearPending = true
        };
    }

    private static bool IsPlaybackOrderSort(string? sortMode)
    {
        return sortMode is "LastPlayed" or "PlayCount";
    }
}

/// <summary>
/// The loaded window a later reload or append may extend. A splice that stops halfway does not change it.
/// </summary>
public sealed class LibraryBrowseSpan
{
    public int CommittedCount { get; private set; }

    public void Commit(int loadedCount)
    {
        CommittedCount = Math.Max(0, loadedCount);
    }

    public IReadOnlyList<(int Offset, int Limit)> ReloadWindows(int liveCount)
    {
        _ = liveCount;
        return LibraryPanelBrowse.ReloadWindows(CommittedCount);
    }

    public (int Offset, int Limit) NextWindow(int liveCount)
    {
        _ = liveCount;
        return LibraryPanelBrowse.NextWindow(CommittedCount);
    }
}
