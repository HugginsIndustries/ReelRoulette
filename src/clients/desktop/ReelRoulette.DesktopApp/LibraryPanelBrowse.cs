using System;
using System.Collections.Generic;
using System.Linq;

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

/// <summary>
/// One item's change from a favorite, blacklist, playback, or tag event.
/// <see cref="Before"/> is the favorite and blacklist before the event: the loaded tile's, or the event's previous values
/// for an item that is not loaded. The desktop leaves it unknown for an item that is not loaded.
/// </summary>
public sealed class LibraryTileChange
{
    public LibraryPanelBrowseEvent Kind { get; init; }
    public bool Loaded { get; init; }
    public LibraryTileFlags? Before { get; init; }
    public LibraryTileFlags? After { get; init; }
    public IReadOnlyList<string> AddedTags { get; init; } = [];
    public IReadOnlyList<string> RemovedTags { get; init; } = [];
}

public readonly record struct LibraryTileFlags(bool IsFavorite, bool IsBlacklisted);

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

public readonly record struct PlaybackPrevious
{
    public bool Specified { get; init; }
    public DateTime? Utc { get; init; }
}

public readonly record struct CurrentFileStatsPaint
{
    public bool PaintNow { get; init; }
    public bool ShownPreviousKnown { get; init; }
    public DateTime? ShownPreviousLastPlayedUtc { get; init; }
    public string? PendingPath { get; init; }
    public bool PendingPreviousKnown { get; init; }
    public DateTime? PendingPreviousLastPlayedUtc { get; init; }
}

public readonly record struct CurrentFileStartStats
{
    public bool ShownPreviousKnown { get; init; }
    public DateTime? ShownPreviousLastPlayedUtc { get; init; }
    public bool ClearPending { get; init; }
}

public readonly record struct CurrentFileLastPlayed
{
    public bool ShowNever { get; init; }
    public DateTime? Utc { get; init; }
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
    /// Reload the loaded window only when the change can alter what it shows or its order. A loaded tile reloads
    /// when a changed field is in the filter or sort and can take it out or move it. An item that is not loaded
    /// reloads only when the change could bring it into the window. Locked to shared/fixtures/library-tile-effect.json.
    /// </summary>
    public static LibraryPanelBrowseEffect EffectFor(LibraryTileChange change, FilterState? filter, string? sortMode)
    {
        var favoritesOnly = filter?.FavoritesOnly ?? false;
        var excludeBlacklisted = filter?.ExcludeBlacklisted ?? false;
        var reload = change.Kind switch
        {
            LibraryPanelBrowseEvent.FavoriteOrBlacklist => FlagChangeReloads(change, favoritesOnly, excludeBlacklisted),
            LibraryPanelBrowseEvent.Playback => IsPlaybackOrderSort(sortMode) ||
                                                (change.Loaded && (filter?.OnlyNeverPlayed ?? false)),
            LibraryPanelBrowseEvent.ItemTags => TagChangeReloads(change, filter),
            _ => false
        };
        return reload ? LibraryPanelBrowseEffect.ReloadLoaded : LibraryPanelBrowseEffect.Patch;
    }

    /// <summary>
    /// A tag save made here can rename or delete a tag the filter holds, so it reloads under any tag filter.
    /// </summary>
    public static LibraryPanelBrowseEffect TagSaveEffect(bool hasTagFilter)
    {
        return hasTagFilter ? LibraryPanelBrowseEffect.ReloadLoaded : LibraryPanelBrowseEffect.Patch;
    }

    private static bool FlagChangeReloads(LibraryTileChange change, bool favoritesOnly, bool excludeBlacklisted)
    {
        if (!favoritesOnly && !excludeBlacklisted)
        {
            return false;
        }

        if (change.After is not LibraryTileFlags after)
        {
            return true;
        }

        bool Matches(LibraryTileFlags flags) =>
            (!favoritesOnly || flags.IsFavorite) && (!excludeBlacklisted || !flags.IsBlacklisted);

        if (change.Before is LibraryTileFlags before)
        {
            if (change.Loaded)
            {
                return (favoritesOnly && before.IsFavorite != after.IsFavorite) ||
                       (excludeBlacklisted && before.IsBlacklisted != after.IsBlacklisted);
            }

            // With the previous values known, an item that is not loaded reloads only when it enters the filter.
            return !Matches(before) && Matches(after);
        }

        return Matches(after);
    }

    /// <summary>
    /// Adding a selected tag or removing an excluded one can only bring an item in; the reverse can only take it out.
    /// </summary>
    private static bool TagChangeReloads(LibraryTileChange change, FilterState? filter)
    {
        var selected = new HashSet<string>(filter?.SelectedTags ?? [], StringComparer.OrdinalIgnoreCase);
        var excluded = new HashSet<string>(filter?.ExcludedTags ?? [], StringComparer.OrdinalIgnoreCase);
        if (selected.Count == 0 && excluded.Count == 0)
        {
            return false;
        }

        if (change.Loaded)
        {
            return change.RemovedTags.Any(selected.Contains) || change.AddedTags.Any(excluded.Contains);
        }

        return change.AddedTags.Any(selected.Contains) || change.RemovedTags.Any(excluded.Contains);
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
    /// A file that is not a loaded tile is read again. A cached copy of that file does not count.
    /// </summary>
    public static bool NeedsCurrentFileRead(bool loadedHasItem, bool cachedItemMatches)
    {
        _ = cachedItemMatches;
        return !loadedHasItem;
    }

    /// <summary>
    /// A read that is no longer the latest is ignored. A failure keeps a matching cache. Not found clears it.
    /// </summary>
    public static bool ShouldApplyCurrentFileRead(bool readIsLatest, bool cacheMatchesPath, CurrentFileReadResult result)
    {
        if (!readIsLatest)
        {
            return false;
        }

        return result != CurrentFileReadResult.Failed || !cacheMatchesPath;
    }

    /// <summary>
    /// A playback event for the current file reads it again when that file is not a loaded tile.
    /// </summary>
    public static bool ReadCurrentFileAfterPlayback(bool loadedHasItem, bool isCurrentFile)
    {
        return isCurrentFile && !loadedHasItem;
    }

    /// <summary>
    /// An update cancels the in-flight read only when it is for that same file.
    /// </summary>
    public static bool InvalidateCurrentFileRead(string? inFlightPath, string? updatedPath)
    {
        return !string.IsNullOrWhiteSpace(inFlightPath)
            && !string.IsNullOrWhiteSpace(updatedPath)
            && string.Equals(inFlightPath, updatedPath, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// A playback event paints the current-file section only when that file is already playing.
    /// The event's previous last-played time, including null, is kept until that file starts.
    /// A missing previous time leaves the time already on screen.
    /// </summary>
    public static CurrentFileStatsPaint PlaybackStatsPaint(
        bool playbackIsCurrentFile,
        PlaybackPrevious previous,
        bool shownPreviousKnown,
        DateTime? shownPreviousLastPlayedUtc,
        string? pendingPath,
        bool pendingPreviousKnown,
        DateTime? pendingPreviousLastPlayedUtc,
        string? playbackPath)
    {
        if (!previous.Specified)
        {
            return new CurrentFileStatsPaint
            {
                PaintNow = playbackIsCurrentFile,
                ShownPreviousKnown = shownPreviousKnown,
                ShownPreviousLastPlayedUtc = shownPreviousLastPlayedUtc,
                PendingPath = pendingPath,
                PendingPreviousKnown = pendingPreviousKnown,
                PendingPreviousLastPlayedUtc = pendingPreviousLastPlayedUtc
            };
        }

        if (playbackIsCurrentFile)
        {
            return new CurrentFileStatsPaint
            {
                PaintNow = true,
                ShownPreviousKnown = true,
                ShownPreviousLastPlayedUtc = previous.Utc,
                PendingPath = null,
                PendingPreviousKnown = false,
                PendingPreviousLastPlayedUtc = null
            };
        }

        return new CurrentFileStatsPaint
        {
            PaintNow = false,
            ShownPreviousKnown = shownPreviousKnown,
            ShownPreviousLastPlayedUtc = shownPreviousLastPlayedUtc,
            PendingPath = playbackPath,
            PendingPreviousKnown = true,
            PendingPreviousLastPlayedUtc = previous.Utc
        };
    }

    /// <summary>
    /// Starting a different file takes a matching pending last-played time, including a known null.
    /// Starting the same file leaves the value a playback event already stored.
    /// </summary>
    public static CurrentFileStartStats PreviousLastPlayedOnStart(
        string? newPath,
        string? previousPath,
        bool shownPreviousKnown,
        DateTime? shownPreviousLastPlayedUtc,
        string? pendingPath,
        bool pendingPreviousKnown,
        DateTime? pendingPreviousLastPlayedUtc)
    {
        if (string.Equals(newPath, previousPath, StringComparison.OrdinalIgnoreCase))
        {
            return new CurrentFileStartStats
            {
                ShownPreviousKnown = shownPreviousKnown,
                ShownPreviousLastPlayedUtc = shownPreviousLastPlayedUtc,
                ClearPending = false
            };
        }

        var matchesPending = !string.IsNullOrWhiteSpace(newPath) &&
                             string.Equals(newPath, pendingPath, StringComparison.OrdinalIgnoreCase);
        if (matchesPending && pendingPreviousKnown)
        {
            return new CurrentFileStartStats
            {
                ShownPreviousKnown = true,
                ShownPreviousLastPlayedUtc = pendingPreviousLastPlayedUtc,
                ClearPending = true
            };
        }

        return new CurrentFileStartStats
        {
            ShownPreviousKnown = false,
            ShownPreviousLastPlayedUtc = null,
            ClearPending = true
        };
    }

    /// <summary>
    /// A known previous time wins, and a known null is Never. An unknown previous time uses the item.
    /// </summary>
    public static CurrentFileLastPlayed ChooseCurrentFileLastPlayed(
        bool previousKnown,
        DateTime? previousUtc,
        DateTime? itemLastPlayedUtc)
    {
        if (previousKnown)
        {
            return new CurrentFileLastPlayed
            {
                ShowNever = previousUtc is null,
                Utc = previousUtc
            };
        }

        return new CurrentFileLastPlayed
        {
            ShowNever = itemLastPlayedUtc is null,
            Utc = itemLastPlayedUtc
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
