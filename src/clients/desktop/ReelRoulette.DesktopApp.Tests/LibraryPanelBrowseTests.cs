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
    public void CurrentFileSource_UsesTheLoadedTileWhenTheSnapshotMisses()
    {
        Assert.Equal(LibraryCurrentFileSource.Snapshot, LibraryPanelBrowse.CurrentFileSource(snapshotHasItem: true, loadedHasItem: true));
        Assert.Equal(LibraryCurrentFileSource.Snapshot, LibraryPanelBrowse.CurrentFileSource(snapshotHasItem: true, loadedHasItem: false));
        Assert.Equal(LibraryCurrentFileSource.LoadedTile, LibraryPanelBrowse.CurrentFileSource(snapshotHasItem: false, loadedHasItem: true));
        Assert.Equal(LibraryCurrentFileSource.None, LibraryPanelBrowse.CurrentFileSource(snapshotHasItem: false, loadedHasItem: false));
    }

    [Fact]
    public void NeedsCurrentFileSnapshotSync_OnlyWhenNeitherCopyHasTheFile()
    {
        Assert.True(LibraryPanelBrowse.NeedsCurrentFileSnapshotSync(snapshotHasItem: false, loadedHasItem: false));
        Assert.False(LibraryPanelBrowse.NeedsCurrentFileSnapshotSync(snapshotHasItem: false, loadedHasItem: true));
        Assert.False(LibraryPanelBrowse.NeedsCurrentFileSnapshotSync(snapshotHasItem: true, loadedHasItem: false));
        Assert.False(LibraryPanelBrowse.NeedsCurrentFileSnapshotSync(snapshotHasItem: true, loadedHasItem: true));
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
