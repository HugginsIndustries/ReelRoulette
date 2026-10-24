import { computeAvailableLayoutWidth } from "./libraryGridLayout";
import { createLibraryGridRows, type LibraryGridRows } from "./libraryGridRows";
import {
  createVirtualizerState,
  findVisibleRowRange,
  measureTrailingItemsHeight,
  type LibraryGridVirtualizerState
} from "./libraryGridVirtualizer";
import type { LibraryProjectionItem } from "./libraryProjectionModel";
import { LIBRARY_NO_MATCH_MESSAGE } from "./libraryOverlayModel";
import { LIBRARY_QUERY_WINDOW_SIZE } from "./libraryQuerySession";

const RESIZE_DEBOUNCE_MS = 90;
const MIN_FALLBACK_WIDTH = 280;

export interface LibraryGridCoverage {
  scrollTop: number;
  viewportBottom: number;
  extentHeight: number;
  /** Height of the rows holding the last page of loaded tiles. */
  lastPageHeight: number;
}

export interface LibraryGridController {
  setBrowseContent(input: { visibleItems: readonly LibraryProjectionItem[]; resetScroll?: boolean }): void;
  /** Marks the playing item's tile, or none, on the tiles shown and on those shown later. */
  setPlayingItemId(itemId: string | null): void;
  measureCoverage(): LibraryGridCoverage | null;
  flushDeferredLayout(): void;
  destroy(): void;
}

export function createLibraryGridController(
  container: HTMLElement,
  apiBaseUrl: string,
  options?: { onCoverage?: (coverage: LibraryGridCoverage) => void }
): LibraryGridController {
  let browseRoot: HTMLElement | null = null;
  let scrollEl: HTMLElement | null = null;
  let topSpacerEl: HTMLElement | null = null;
  let gridRows: LibraryGridRows | null = null;
  let bottomSpacerEl: HTMLElement | null = null;
  let emptyEl: HTMLElement | null = null;

  let items: readonly LibraryProjectionItem[] = [];
  let playingItemId: string | null = null;
  let virtualizerState: LibraryGridVirtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
  let layoutWidth = computeAvailableLayoutWidth(container.clientWidth || MIN_FALLBACK_WIDTH);
  let lastVisibleStart = -1;
  let lastVisibleEnd = -1;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let layoutStale = false;
  let pendingScrollReset = false;

  function ensureBrowseShell(): void {
    if (browseRoot) {
      return;
    }

    browseRoot = document.createElement("div");
    browseRoot.className = "library-overlay-browse";

    emptyEl = document.createElement("p");
    emptyEl.className = "library-overlay-status";
    emptyEl.hidden = true;
    browseRoot.appendChild(emptyEl);

    scrollEl = document.createElement("div");
    scrollEl.className = "library-grid-scroll themed-scrollbar";
    scrollEl.addEventListener("scroll", onScroll, { passive: true });

    topSpacerEl = document.createElement("div");
    topSpacerEl.className = "library-grid-spacer library-grid-spacer-top";

    const rowsEl = document.createElement("div");
    rowsEl.className = "library-grid-rows";
    gridRows = createLibraryGridRows(rowsEl, apiBaseUrl);
    gridRows.setPlayingItemId(playingItemId);

    bottomSpacerEl = document.createElement("div");
    bottomSpacerEl.className = "library-grid-spacer library-grid-spacer-bottom";

    scrollEl.appendChild(topSpacerEl);
    scrollEl.appendChild(rowsEl);
    scrollEl.appendChild(bottomSpacerEl);
    browseRoot.appendChild(scrollEl);

    container.replaceChildren(browseRoot);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleResizeReflow();
      });
      resizeObserver.observe(browseRoot);
    }
  }

  function measureLayoutWidth(): number {
    const measured = browseRoot?.clientWidth ?? container.clientWidth ?? MIN_FALLBACK_WIDTH;
    return computeAvailableLayoutWidth(measured);
  }

  function rebuildVirtualizer(resetScroll: boolean): void {
    layoutWidth = measureLayoutWidth();
    virtualizerState = createVirtualizerState(items, layoutWidth);
    lastVisibleStart = -1;
    lastVisibleEnd = -1;
    if (resetScroll && scrollEl) {
      scrollEl.scrollTop = 0;
    }
    updateVisibleRows(true);
  }

  function updateVisibleRows(force = false): void {
    if (!scrollEl || !topSpacerEl || !gridRows || !bottomSpacerEl) {
      return;
    }

    if (virtualizerState.rows.length === 0) {
      topSpacerEl.style.height = "0px";
      bottomSpacerEl.style.height = "0px";
      gridRows.clear();
      lastVisibleStart = 0;
      lastVisibleEnd = 0;
      return;
    }

    const window = findVisibleRowRange(
      virtualizerState.offsetIndex,
      scrollEl.scrollTop,
      scrollEl.clientHeight
    );

    if (
      !force &&
      lastVisibleStart === window.firstVisibleRow &&
      lastVisibleEnd === window.endExclusive
    ) {
      return;
    }

    lastVisibleStart = window.firstVisibleRow;
    lastVisibleEnd = window.endExclusive;

    topSpacerEl.style.height = `${window.topSpacerHeight}px`;
    bottomSpacerEl.style.height = `${window.bottomSpacerHeight}px`;

    gridRows.show(virtualizerState.rows, window.firstVisibleRow, window.endExclusive, items);
    reportCoverage();
  }

  function reportCoverage(): void {
    const coverage = measureCoverage();
    if (coverage && options?.onCoverage) {
      options.onCoverage(coverage);
    }
  }

  function measureCoverage(): LibraryGridCoverage | null {
    if (!scrollEl) {
      return null;
    }
    return {
      scrollTop: scrollEl.scrollTop,
      viewportBottom: scrollEl.scrollTop + Math.max(0, scrollEl.clientHeight),
      extentHeight: virtualizerState.offsetIndex.totalExtentHeight,
      lastPageHeight: measureTrailingItemsHeight(virtualizerState, LIBRARY_QUERY_WINDOW_SIZE)
    };
  }

  function onScroll(): void {
    updateVisibleRows(false);
    reportCoverage();
  }

  function scheduleResizeReflow(): void {
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if ((browseRoot?.clientWidth ?? 0) < 1 || scrollEl?.hidden) {
        return;
      }
      const nextWidth = measureLayoutWidth();
      if (!layoutStale && Math.abs(nextWidth - layoutWidth) < 0.5 && items.length > 0 && virtualizerState.rows.length > 0) {
        updateVisibleRows(true);
        return;
      }
      const resetScroll = pendingScrollReset;
      layoutStale = false;
      pendingScrollReset = false;
      rebuildVirtualizer(resetScroll);
    }, RESIZE_DEBOUNCE_MS);
  }

  function setBrowseContent(input: { visibleItems: readonly LibraryProjectionItem[]; resetScroll?: boolean }): void {
    ensureBrowseShell();
    items = input.visibleItems;

    const hasItems = input.visibleItems.length > 0;
    const wantsReset = input.resetScroll !== false || pendingScrollReset;
    if (!hasItems) {
      if (wantsReset && scrollEl && !scrollEl.hidden && scrollEl.clientWidth >= 1) {
        scrollEl.scrollTop = 0;
        pendingScrollReset = false;
        layoutStale = false;
      } else if (wantsReset) {
        pendingScrollReset = true;
        layoutStale = true;
      }

      if (emptyEl && scrollEl) {
        emptyEl.textContent = LIBRARY_NO_MATCH_MESSAGE;
        emptyEl.hidden = false;
        scrollEl.hidden = true;
      }

      virtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
      if (gridRows && topSpacerEl && bottomSpacerEl) {
        gridRows.clear();
        topSpacerEl.style.height = "0px";
        bottomSpacerEl.style.height = "0px";
      }
      return;
    }

    if (emptyEl && scrollEl) {
      emptyEl.hidden = true;
      scrollEl.hidden = false;
    }

    if ((browseRoot?.clientWidth ?? 0) < 1) {
      layoutStale = true;
      pendingScrollReset = wantsReset;
      return;
    }

    layoutStale = false;
    pendingScrollReset = false;
    rebuildVirtualizer(wantsReset);
  }

  // Moves the mark between the tiles shown, changing nothing else.
  function setPlayingItemId(itemId: string | null): void {
    playingItemId = itemId;
    gridRows?.setPlayingItemId(itemId);
  }

  function flushDeferredLayout(): void {
    if (!layoutStale || (browseRoot?.clientWidth ?? 0) < 1 || scrollEl?.hidden) {
      return;
    }
    const resetScroll = pendingScrollReset;
    layoutStale = false;
    pendingScrollReset = false;
    rebuildVirtualizer(resetScroll);
  }

  function destroy(): void {
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (scrollEl) {
      scrollEl.removeEventListener("scroll", onScroll);
    }
    browseRoot = null;
    scrollEl = null;
    topSpacerEl = null;
    gridRows = null;
    bottomSpacerEl = null;
    emptyEl = null;
    items = [];
    virtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
    lastVisibleStart = -1;
    lastVisibleEnd = -1;
    layoutStale = false;
    pendingScrollReset = false;
    container.replaceChildren();
  }

  return {
    setBrowseContent,
    setPlayingItemId,
    measureCoverage,
    flushDeferredLayout,
    destroy
  };
}
