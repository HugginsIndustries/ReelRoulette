using System.Text.Json;
using ReelRoulette;
using Xunit;

namespace ReelRoulette.DesktopApp.Tests;

public sealed class LibraryPanelBrowseTests
{
    [Fact]
    public void ShouldFill_RequestsAnotherWindowUntilTheResultIsCoveredOrExhausted()
    {
        Assert.False(LibraryPanelBrowse.ShouldFill(0, 500, 0, 800));
        Assert.True(LibraryPanelBrowse.ShouldFill(200, 500, 400, 800));
        Assert.False(LibraryPanelBrowse.ShouldFill(200, 500, 2000, 800));
        Assert.False(LibraryPanelBrowse.ShouldFill(500, 500, 400, 800));
    }

    [Fact]
    public void NextWindow_ContinuesAtTheLoadedCount()
    {
        var window = LibraryPanelBrowse.NextWindow(200);

        Assert.Equal(200, window.Offset);
        Assert.Equal(LibraryPanelBrowse.WindowSize, window.Limit);
    }

    [Fact]
    public void ReloadWindows_CoversTheLoadedCountInWindowSizedSlices()
    {
        var windows = LibraryPanelBrowse.ReloadWindows(450);

        Assert.Equal([(0, 200), (200, 200), (400, 50)], windows);
    }

    [Fact]
    public void Span_ReloadAndAppendUseTheCommittedCountWhenTheLiveCountIsTorn()
    {
        var span = new LibraryBrowseSpan();
        span.Commit(400);

        Assert.Equal([(0, 200), (200, 200)], span.ReloadWindows(199));
        Assert.Equal((400, LibraryPanelBrowse.WindowSize), span.NextWindow(199));

        span.Commit(0);
        Assert.Equal([(0, LibraryPanelBrowse.WindowSize)], span.ReloadWindows(199));
    }

    [Fact]
    public void AppendReflowItemIndex_StartsAtTheLastLoadedRow()
    {
        Assert.Equal(180, LibraryPanelBrowse.AppendReflowItemIndex(200, 180));
        Assert.Equal(200, LibraryPanelBrowse.AppendReflowItemIndex(200, -1));
    }

    [Fact]
    public void EffectFor_PatchesWhenTheOpenGridCannotChangeMembershipOrOrder()
    {
        Assert.Equal(
            LibraryPanelBrowseEffect.Patch,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.FavoriteOrBlacklist, false, false, false, false, "Name"));
        Assert.Equal(
            LibraryPanelBrowseEffect.Patch,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.Playback, false, false, false, false, "Name"));
        Assert.Equal(
            LibraryPanelBrowseEffect.Patch,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.ItemTags, false, false, false, false, "Name"));
    }

    [Fact]
    public void EffectFor_ReloadsWhenMembershipOrOrderCanChange()
    {
        Assert.Equal(
            LibraryPanelBrowseEffect.ReloadLoaded,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.FavoriteOrBlacklist, true, false, false, false, "Name"));
        Assert.Equal(
            LibraryPanelBrowseEffect.ReloadLoaded,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.FavoriteOrBlacklist, false, true, false, false, "Duration"));
        Assert.Equal(
            LibraryPanelBrowseEffect.ReloadLoaded,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.Playback, false, false, true, false, "Name"));
        Assert.Equal(
            LibraryPanelBrowseEffect.ReloadLoaded,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.Playback, false, false, false, false, "LastPlayed"));
        Assert.Equal(
            LibraryPanelBrowseEffect.ReloadLoaded,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.Playback, false, false, false, false, "PlayCount"));
        Assert.Equal(
            LibraryPanelBrowseEffect.ReloadLoaded,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.ItemTags, false, false, false, true, "Name"));
    }

    [Fact]
    public void EffectFor_PatchesAFavoriteWhenTheSortDoesNotDependOnIt()
    {
        Assert.Equal(
            LibraryPanelBrowseEffect.Patch,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.FavoriteOrBlacklist, false, false, false, false, "LastPlayed"));
        Assert.Equal(
            LibraryPanelBrowseEffect.Patch,
            LibraryPanelBrowse.EffectFor(LibraryPanelBrowseEvent.Playback, false, false, false, false, "Duration"));
    }

    [Fact]
    public void QueryReflowIndex_ReflowsAnUnchangedPageWhenTheAspectChanges()
    {
        Assert.Equal(0, LibraryPanelBrowse.QueryReflowIndex(reset: true, firstChangedIndex: -1, firstLayoutIndex: -1));
        Assert.Equal(0, LibraryPanelBrowse.QueryReflowIndex(reset: true, firstChangedIndex: 40, firstLayoutIndex: 10));
        Assert.Equal(-1, LibraryPanelBrowse.QueryReflowIndex(reset: false, firstChangedIndex: -1, firstLayoutIndex: -1));
        Assert.Equal(25, LibraryPanelBrowse.QueryReflowIndex(reset: false, firstChangedIndex: -1, firstLayoutIndex: 25));
        Assert.Equal(10, LibraryPanelBrowse.QueryReflowIndex(reset: false, firstChangedIndex: 10, firstLayoutIndex: -1));
        Assert.Equal(4, LibraryPanelBrowse.QueryReflowIndex(reset: false, firstChangedIndex: 10, firstLayoutIndex: 4));
    }

    [Fact]
    public void CoalesceRequest_KeepsAQueuedResetAheadOfAReload()
    {
        Assert.Equal(
            LibraryPanelBrowseRequest.Reset,
            LibraryPanelBrowse.CoalesceRequest(LibraryPanelBrowseRequest.Reset, LibraryPanelBrowseRequest.ReloadLoaded));
        Assert.Equal(
            LibraryPanelBrowseRequest.Reset,
            LibraryPanelBrowse.CoalesceRequest(LibraryPanelBrowseRequest.ReloadLoaded, LibraryPanelBrowseRequest.Reset));
        Assert.Equal(
            LibraryPanelBrowseRequest.ReloadLoaded,
            LibraryPanelBrowse.CoalesceRequest(null, LibraryPanelBrowseRequest.ReloadLoaded));
        Assert.Equal(
            LibraryPanelBrowseRequest.ReloadLoaded,
            LibraryPanelBrowse.CoalesceRequest(LibraryPanelBrowseRequest.ReloadLoaded, LibraryPanelBrowseRequest.ReloadLoaded));
    }

    [Fact]
    public void ShouldDeferBrowseForScroll_DefersAQueryAndNotAnAppend()
    {
        Assert.True(LibraryPanelBrowse.ShouldDeferBrowseForScroll(isScrollInteracting: true, isAppend: false));
        Assert.False(LibraryPanelBrowse.ShouldDeferBrowseForScroll(isScrollInteracting: true, isAppend: true));
        Assert.False(LibraryPanelBrowse.ShouldDeferBrowseForScroll(isScrollInteracting: false, isAppend: false));
        Assert.False(LibraryPanelBrowse.ShouldDeferBrowseForScroll(isScrollInteracting: false, isAppend: true));
    }

    [Fact]
    public void ShouldReleaseBrowseQuery_KeepsTheQueryOpenWhileARefreshIsDeferred()
    {
        Assert.False(LibraryPanelBrowse.ShouldReleaseBrowseQuery(generationMatches: true, refreshStillPending: true));
        Assert.True(LibraryPanelBrowse.ShouldReleaseBrowseQuery(generationMatches: true, refreshStillPending: false));
        Assert.False(LibraryPanelBrowse.ShouldReleaseBrowseQuery(generationMatches: false, refreshStillPending: false));
        Assert.False(LibraryPanelBrowse.ShouldReleaseBrowseQuery(generationMatches: false, refreshStillPending: true));
    }

    [Fact]
    public void ShouldSuppressAppend_WaitsWhileAQueryOrDeferredRefreshIsOpen()
    {
        Assert.True(LibraryPanelBrowse.ShouldSuppressAppend(queryOpen: true, refreshStillPending: false));
        Assert.True(LibraryPanelBrowse.ShouldSuppressAppend(queryOpen: false, refreshStillPending: true));
        Assert.False(LibraryPanelBrowse.ShouldSuppressAppend(queryOpen: false, refreshStillPending: false));
    }

    [Fact]
    public void IsBrowseQueryOpen_TreatsAnInFlightPageAsOpen()
    {
        Assert.True(LibraryPanelBrowse.IsBrowseQueryOpen(resetOrReloadOpen: false, appendInFlight: true));
        Assert.True(LibraryPanelBrowse.ShouldReplayBrowse(
            LibraryPanelBrowse.IsBrowseQueryOpen(resetOrReloadOpen: false, appendInFlight: true),
            LibraryPanelBrowseEffect.Patch));
        Assert.True(LibraryPanelBrowse.IsBrowseQueryOpen(resetOrReloadOpen: true, appendInFlight: false));
        Assert.False(LibraryPanelBrowse.IsBrowseQueryOpen(resetOrReloadOpen: false, appendInFlight: false));
    }

    [Fact]
    public void ShouldReplayBrowse_RereadsAnOpenQueryEvenWhenTheEventWouldOnlyPatch()
    {
        Assert.True(LibraryPanelBrowse.ShouldReplayBrowse(queryOpen: true, LibraryPanelBrowseEffect.Patch));
        Assert.True(LibraryPanelBrowse.ShouldReplayBrowse(queryOpen: true, LibraryPanelBrowseEffect.ReloadLoaded));
        Assert.False(LibraryPanelBrowse.ShouldReplayBrowse(queryOpen: false, LibraryPanelBrowseEffect.Patch));
        Assert.True(LibraryPanelBrowse.ShouldReplayBrowse(queryOpen: false, LibraryPanelBrowseEffect.ReloadLoaded));
        Assert.False(LibraryPanelBrowse.ShouldReplayBrowse(queryOpen: false, LibraryPanelBrowseEffect.None));
    }

    [Fact]
    public void CanApplyAppend_RequiresTheLoadedCountToStillBeTheRequestedOffset()
    {
        Assert.True(LibraryPanelBrowse.CanApplyAppend(400, 400));
        Assert.False(LibraryPanelBrowse.CanApplyAppend(200, 400));
    }

    [Fact]
    public void ClampScrollOffset_KeepsAnAnchorInsideTheRowModelExtent()
    {
        Assert.Equal(4000, LibraryPanelBrowse.ClampScrollOffset(4000, 5000, 800));
        Assert.Equal(4200, LibraryPanelBrowse.ClampScrollOffset(5000, 5000, 800));
        Assert.Equal(0, LibraryPanelBrowse.ClampScrollOffset(-20, 5000, 800));
    }

    [Fact]
    public void CurrentFileSource_UsesTheLoadedTileBeforeASingleItemRead()
    {
        Assert.Equal(LibraryCurrentFileSource.LoadedTile, LibraryPanelBrowse.CurrentFileSource(loadedHasItem: true, singleItemHasItem: true));
        Assert.Equal(LibraryCurrentFileSource.LoadedTile, LibraryPanelBrowse.CurrentFileSource(loadedHasItem: true, singleItemHasItem: false));
        Assert.Equal(LibraryCurrentFileSource.SingleItem, LibraryPanelBrowse.CurrentFileSource(loadedHasItem: false, singleItemHasItem: true));
        Assert.Equal(LibraryCurrentFileSource.None, LibraryPanelBrowse.CurrentFileSource(loadedHasItem: false, singleItemHasItem: false));
    }

    [Fact]
    public void NeedsCurrentFileRead_ReadsAgainWhenTheFileIsNotALoadedTile()
    {
        Assert.True(LibraryPanelBrowse.NeedsCurrentFileRead(loadedHasItem: false, cachedItemMatches: true));
        Assert.True(LibraryPanelBrowse.NeedsCurrentFileRead(loadedHasItem: false, cachedItemMatches: false));
        Assert.False(LibraryPanelBrowse.NeedsCurrentFileRead(loadedHasItem: true, cachedItemMatches: true));
        Assert.False(LibraryPanelBrowse.NeedsCurrentFileRead(loadedHasItem: true, cachedItemMatches: false));
    }

    [Fact]
    public void ShouldApplyCurrentFileRead_KeepsAMatchingCacheWhenTheReadFails()
    {
        Assert.False(LibraryPanelBrowse.ShouldApplyCurrentFileRead(readIsLatest: true, cacheMatchesPath: true, CurrentFileReadResult.Failed));
        Assert.True(LibraryPanelBrowse.ShouldApplyCurrentFileRead(readIsLatest: true, cacheMatchesPath: false, CurrentFileReadResult.Failed));
        Assert.True(LibraryPanelBrowse.ShouldApplyCurrentFileRead(readIsLatest: true, cacheMatchesPath: true, CurrentFileReadResult.NotFound));
        Assert.True(LibraryPanelBrowse.ShouldApplyCurrentFileRead(readIsLatest: true, cacheMatchesPath: true, CurrentFileReadResult.Found));
        Assert.False(LibraryPanelBrowse.ShouldApplyCurrentFileRead(readIsLatest: false, cacheMatchesPath: true, CurrentFileReadResult.Found));
        Assert.False(LibraryPanelBrowse.ShouldApplyCurrentFileRead(readIsLatest: false, cacheMatchesPath: false, CurrentFileReadResult.NotFound));
    }

    [Fact]
    public void ReadCurrentFileAfterPlayback_ReadsTheCurrentFileWhenItIsNotLoaded()
    {
        Assert.True(LibraryPanelBrowse.ReadCurrentFileAfterPlayback(loadedHasItem: false, isCurrentFile: true));
        Assert.False(LibraryPanelBrowse.ReadCurrentFileAfterPlayback(loadedHasItem: true, isCurrentFile: true));
        Assert.False(LibraryPanelBrowse.ReadCurrentFileAfterPlayback(loadedHasItem: false, isCurrentFile: false));
    }

    [Fact]
    public void InvalidateCurrentFileRead_LeavesAReadOfADifferentFileInFlight()
    {
        Assert.False(LibraryPanelBrowse.InvalidateCurrentFileRead("/media/new.mp4", "/media/old.mp4"));
        Assert.True(LibraryPanelBrowse.InvalidateCurrentFileRead("/media/new.mp4", "/media/new.mp4"));
        Assert.False(LibraryPanelBrowse.InvalidateCurrentFileRead(null, "/media/old.mp4"));
        Assert.False(LibraryPanelBrowse.InvalidateCurrentFileRead("/media/new.mp4", null));
    }

    [Fact]
    public void PlaybackStatsPaint_KeepsThePreviousTimeUntilThatFileStarts()
    {
        var earlier = new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        var showing = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var specified = new PlaybackPrevious { Specified = true, Utc = earlier };
        var early = LibraryPanelBrowse.PlaybackStatsPaint(
            playbackIsCurrentFile: false,
            specified,
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: null,
            pendingPreviousKnown: false,
            pendingPreviousLastPlayedUtc: null,
            playbackPath: "/media/next.mp4");
        Assert.False(early.PaintNow);
        Assert.True(early.ShownPreviousKnown);
        Assert.Equal(showing, early.ShownPreviousLastPlayedUtc);
        Assert.Equal("/media/next.mp4", early.PendingPath);
        Assert.True(early.PendingPreviousKnown);
        Assert.Equal(earlier, early.PendingPreviousLastPlayedUtc);

        var neverPlayed = LibraryPanelBrowse.PlaybackStatsPaint(
            playbackIsCurrentFile: false,
            new PlaybackPrevious { Specified = true, Utc = null },
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: null,
            pendingPreviousKnown: false,
            pendingPreviousLastPlayedUtc: null,
            playbackPath: "/media/next.mp4");
        Assert.False(neverPlayed.PaintNow);
        Assert.True(neverPlayed.PendingPreviousKnown);
        Assert.Null(neverPlayed.PendingPreviousLastPlayedUtc);

        var current = LibraryPanelBrowse.PlaybackStatsPaint(
            playbackIsCurrentFile: true,
            specified,
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: "/media/next.mp4",
            pendingPreviousKnown: true,
            pendingPreviousLastPlayedUtc: earlier,
            playbackPath: "/media/next.mp4");
        Assert.True(current.PaintNow);
        Assert.True(current.ShownPreviousKnown);
        Assert.Equal(earlier, current.ShownPreviousLastPlayedUtc);
        Assert.Null(current.PendingPath);
        Assert.False(current.PendingPreviousKnown);

        var missingPrevious = LibraryPanelBrowse.PlaybackStatsPaint(
            playbackIsCurrentFile: false,
            new PlaybackPrevious(),
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: "/media/kept.mp4",
            pendingPreviousKnown: true,
            pendingPreviousLastPlayedUtc: earlier,
            playbackPath: "/media/next.mp4");
        Assert.False(missingPrevious.PaintNow);
        Assert.Equal(showing, missingPrevious.ShownPreviousLastPlayedUtc);
        Assert.Equal("/media/kept.mp4", missingPrevious.PendingPath);
        Assert.Equal(earlier, missingPrevious.PendingPreviousLastPlayedUtc);

        var sameFile = LibraryPanelBrowse.PreviousLastPlayedOnStart(
            "/media/next.mp4",
            "/media/next.mp4",
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: earlier,
            pendingPath: "/media/other.mp4",
            pendingPreviousKnown: true,
            pendingPreviousLastPlayedUtc: showing);
        Assert.True(sameFile.ShownPreviousKnown);
        Assert.Equal(earlier, sameFile.ShownPreviousLastPlayedUtc);
        Assert.False(sameFile.ClearPending);

        var matchingStart = LibraryPanelBrowse.PreviousLastPlayedOnStart(
            "/media/next.mp4",
            "/media/current.mp4",
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: "/MEDIA/next.mp4",
            pendingPreviousKnown: true,
            pendingPreviousLastPlayedUtc: earlier);
        Assert.True(matchingStart.ShownPreviousKnown);
        Assert.Equal(earlier, matchingStart.ShownPreviousLastPlayedUtc);
        Assert.True(matchingStart.ClearPending);

        var matchingNever = LibraryPanelBrowse.PreviousLastPlayedOnStart(
            "/media/next.mp4",
            "/media/current.mp4",
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: "/media/next.mp4",
            pendingPreviousKnown: true,
            pendingPreviousLastPlayedUtc: null);
        Assert.True(matchingNever.ShownPreviousKnown);
        Assert.Null(matchingNever.ShownPreviousLastPlayedUtc);
        var neverChoice = LibraryPanelBrowse.ChooseCurrentFileLastPlayed(
            matchingNever.ShownPreviousKnown,
            matchingNever.ShownPreviousLastPlayedUtc,
            earlier);
        Assert.True(neverChoice.ShowNever);

        var otherStart = LibraryPanelBrowse.PreviousLastPlayedOnStart(
            "/media/next.mp4",
            "/media/current.mp4",
            shownPreviousKnown: true,
            shownPreviousLastPlayedUtc: showing,
            pendingPath: "/media/other.mp4",
            pendingPreviousKnown: true,
            pendingPreviousLastPlayedUtc: earlier);
        Assert.False(otherStart.ShownPreviousKnown);
        Assert.Null(otherStart.ShownPreviousLastPlayedUtc);
        Assert.True(otherStart.ClearPending);
    }

    [Fact]
    public void UnknownTagItem_ReloadsAfterTheBatchOnlyWhenATagFilterIsActive()
    {
        Assert.Equal(
            LibraryPanelBrowseUnknownTag.Skip,
            LibraryPanelBrowse.UnknownTagItem(hasTagFilter: false));
        Assert.Equal(
            LibraryPanelBrowseUnknownTag.ReloadLoadedAfterBatch,
            LibraryPanelBrowse.UnknownTagItem(hasTagFilter: true));
    }

}

public sealed class PlaybackPreviousJsonTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true
    };

    [Fact]
    public void PreviousLastPlayed_NullIsKnown_AndMissingIsNot()
    {
        var knownNull = JsonSerializer.Deserialize<CorePlaybackRecordedPayload>(
            """{"path":"/a.mp4","previousLastPlayedUtc":null}""",
            Options);
        Assert.NotNull(knownNull);
        Assert.True(knownNull!.PreviousLastPlayedUtc.Specified);
        Assert.Null(knownNull.PreviousLastPlayedUtc.Value);

        var missing = JsonSerializer.Deserialize<CorePlaybackRecordedPayload>(
            """{"path":"/a.mp4"}""",
            Options);
        Assert.NotNull(missing);
        Assert.False(missing!.PreviousLastPlayedUtc.Specified);

        var value = JsonSerializer.Deserialize<CorePlaybackRecordedPayload>(
            """{"path":"/a.mp4","previousLastPlayedUtc":"2024-01-02T03:04:05Z"}""",
            Options);
        Assert.NotNull(value);
        Assert.True(value!.PreviousLastPlayedUtc.Specified);
        Assert.Equal(new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc), value.PreviousLastPlayedUtc.Value);
    }
}
