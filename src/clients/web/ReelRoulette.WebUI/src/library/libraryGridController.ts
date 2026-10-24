import { prefersReducedMotion } from "../ui/reducedMotion";
import {
  DEFAULT_TARGET_ROW_HEIGHT,
  MAX_TARGET_ROW_HEIGHT,
  MIN_TARGET_ROW_HEIGHT,
  clampTargetRowHeight,
  computeAvailableLayoutWidth,
  getTileLeftOffsets
} from "./libraryGridLayout";
import { createLibraryGridRows, type LibraryGridRows, type ShownTile } from "./libraryGridRows";
import {
  createVirtualizerState,
  findRowIndexForItem,
  findVisibleRowRange,
  measureTrailingItemsHeight,
  type LibraryGridVirtualizerState,
  type VisibleGridWindow
} from "./libraryGridVirtualizer";
import {
  TILE_MOVE_EASING,
  TILE_MOVE_MS,
  createGridZoom,
  zoomOverscanPx,
  type GridZoomStart,
  type ZoomPoint,
  type ZoomView
} from "./libraryGridZoom";
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

export interface LibraryGridOptions {
  onCoverage?: (coverage: LibraryGridCoverage) => void;
  /** The row height the rows aim for, a whole number of pixels from 100 to 300. Defaults to 160. */
  rowHeight?: number;
  /** A zoom over the grid settled at a new row height for the rows to aim for. */
  onRowHeightChange?: (rowHeight: number) => void;
}

type BrowseContent = Parameters<LibraryGridController["setBrowseContent"]>[0];

/** A tile's box on the screen. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function overlaps(box: Box, view: Box): boolean {
  return (
    box.top + box.height > view.top &&
    box.top < view.top + view.height &&
    box.left + box.width > view.left &&
    box.left < view.left + view.width
  );
}

/**
 * Where each shown tile is on the screen, worked out from the layout rather than measured, with the layout's top-left
 * corner at `left` and `top` on the screen and the layout shown at `scale`. Each row's tiles' distances from its left
 * edge are worked out once.
 */
function tileBoxes(state: LibraryGridVirtualizerState, left: number, top: number, scale: number): (shown: ShownTile) => Box {
  const leftsByRow = new Map<number, number[]>();
  return (shown) => {
    const row = state.rows[shown.row]!;
    let lefts = leftsByRow.get(shown.row);
    if (!lefts) {
      lefts = getTileLeftOffsets(row);
      leftsByRow.set(shown.row, lefts);
    }
    const tile = row.tiles[shown.slot]!;
    return {
      left: left + scale * lefts[shown.slot]!,
      top: top + scale * state.offsetIndex.rowTopOffsets[shown.row]!,
      width: scale * tile.tileWidth,
      height: scale * tile.tileHeight
    };
  };
}

/**
 * The Library tab's grid of justified rows, which renders only the rows near the view. Ctrl+scroll, a trackpad pinch,
 * and a two-finger pinch over it zoom the row height the rows aim for: the rows scale as one picture while the gesture
 * lasts, then reflow once at the new row height when it settles, with the tile under the pointer keeping its vertical
 * place and each tile in view moving from where it showed to its new place, or at once with reduced motion.
 */
export function createLibraryGridController(
  container: HTMLElement,
  apiBaseUrl: string,
  options?: LibraryGridOptions
): LibraryGridController {
  let browseRoot: HTMLElement | null = null;
  let scrollEl: HTMLElement | null = null;
  let topSpacerEl: HTMLElement | null = null;
  let rowsEl: HTMLElement | null = null;
  let gridRows: LibraryGridRows | null = null;
  let bottomSpacerEl: HTMLElement | null = null;
  let emptyEl: HTMLElement | null = null;

  let items: readonly LibraryProjectionItem[] = [];
  let playingItemId: string | null = null;
  let targetRowHeight = options?.rowHeight ?? DEFAULT_TARGET_ROW_HEIGHT;
  let virtualizerState: LibraryGridVirtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
  let layoutWidth = computeAvailableLayoutWidth(container.clientWidth || MIN_FALLBACK_WIDTH);
  let lastVisibleStart = -1;
  let lastVisibleEnd = -1;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let layoutStale = false;
  let pendingScrollReset = false;
  /** Content that came during a zoom gesture, which its settle shows, starting at the top if any of it asked to. */
  let pendingContent: { visibleItems: readonly LibraryProjectionItem[]; resetScroll: boolean } | null = null;
  /** The tiles' moves the last settle started, which a new gesture finishes first. */
  let tileMoves: Animation[] = [];

  const zoom = createGridZoom({ begin: beginZoom, show: showZoom, settle: settleZoom });

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
    // Passive where they never cancel. The wheel and a pinch's moves cancel the browser's own scroll and zoom.
    scrollEl.addEventListener("wheel", onWheel, { passive: false });
    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollEl.addEventListener("touchend", onTouchEnd, { passive: true });
    scrollEl.addEventListener("touchcancel", onTouchEnd, { passive: true });
    scrollEl.addEventListener("gesturestart", onGestureStart);

    topSpacerEl = document.createElement("div");
    topSpacerEl.className = "library-grid-spacer library-grid-spacer-top";

    // The layer around the rows clips them while a zoom scales them, so a gesture never adds a scrollbar or resizes
    // the grid.
    const zoomEl = document.createElement("div");
    zoomEl.className = "library-grid-zoom";
    rowsEl = document.createElement("div");
    rowsEl.className = "library-grid-rows";
    zoomEl.appendChild(rowsEl);
    gridRows = createLibraryGridRows(rowsEl, apiBaseUrl);
    gridRows.setPlayingItemId(playingItemId);

    bottomSpacerEl = document.createElement("div");
    bottomSpacerEl.className = "library-grid-spacer library-grid-spacer-bottom";

    scrollEl.appendChild(topSpacerEl);
    scrollEl.appendChild(zoomEl);
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

  // The scroller's own width leaves out its scrollbar, whose room it always keeps, so the rows fit beside it.
  function measureLayoutWidth(): number {
    const measured = scrollEl?.clientWidth ?? container.clientWidth ?? MIN_FALLBACK_WIDTH;
    return computeAvailableLayoutWidth(measured);
  }

  function rebuildVirtualizer(resetScroll: boolean): void {
    layoutWidth = measureLayoutWidth();
    virtualizerState = createVirtualizerState(items, layoutWidth, targetRowHeight);
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

    if (showWindow(findVisibleRowRange(virtualizerState.offsetIndex, scrollEl.scrollTop, scrollEl.clientHeight), force)) {
      reportCoverage();
    }
  }

  /**
   * Shows the rows of `window`, unless they already show and `force` is off. True when it showed them. It reports no
   * coverage, since a zoom's settle shows its rows before it scrolls to them.
   */
  function showWindow(window: VisibleGridWindow, force: boolean): boolean {
    if (!topSpacerEl || !gridRows || !bottomSpacerEl) {
      return false;
    }
    if (!force && lastVisibleStart === window.firstVisibleRow && lastVisibleEnd === window.endExclusive) {
      return false;
    }

    lastVisibleStart = window.firstVisibleRow;
    lastVisibleEnd = window.endExclusive;

    topSpacerEl.style.height = `${window.topSpacerHeight}px`;
    bottomSpacerEl.style.height = `${window.bottomSpacerHeight}px`;

    gridRows.show(virtualizerState.rows, window.firstVisibleRow, window.endExclusive, items);
    return true;
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
    // While a zoom gesture lasts the rows stay as they are, since a row coming or going would move the scaled picture.
    // The settle shows the rows for wherever the grid is then.
    if (zoom.isActive()) {
      return;
    }
    updateVisibleRows(false);
    reportCoverage();
  }

  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    zoom.wheel(event);
  }

  function onTouchStart(event: TouchEvent): void {
    zoom.touchStart(event.touches);
  }

  function onTouchMove(event: TouchEvent): void {
    if (zoom.touchMove(event.touches)) {
      event.preventDefault();
    }
  }

  // A touch the system cancels, as for an app switch, ends a pinch as lifting a finger does.
  function onTouchEnd(event: TouchEvent): void {
    zoom.touchEnd(event.touches.length);
  }

  // Safari's own pinch would zoom the page.
  function onGestureStart(event: Event): void {
    event.preventDefault();
  }

  function finishTileMoves(): void {
    for (const move of tileMoves) {
      move.finish();
    }
    tileMoves = [];
  }

  /** Where the rows' layer's top-left corner is on the screen, before a gesture scales it. */
  function layerOrigin(): ZoomPoint {
    const box = scrollEl!.getBoundingClientRect();
    return { x: box.left, y: box.top + (virtualizerState.offsetIndex.rowTopOffsets[lastVisibleStart] ?? 0) - scrollEl!.scrollTop };
  }

  /** The grid's view on the screen. */
  function viewBox(): Box {
    const box = scrollEl!.getBoundingClientRect();
    return { left: box.left, top: box.top, width: scrollEl!.clientWidth, height: scrollEl!.clientHeight };
  }

  function beginZoom(): GridZoomStart | null {
    if (!scrollEl || !rowsEl || scrollEl.hidden || virtualizerState.rows.length === 0) {
      return null;
    }
    // A gesture that starts while the tiles still move finishes their move first.
    finishTileMoves();
    // The rows that fill the view at the smallest scale the gesture can reach, wherever it scales around.
    const minScale = MIN_TARGET_ROW_HEIGHT / targetRowHeight;
    const viewportHeight = scrollEl.clientHeight;
    const overscan = zoomOverscanPx(viewportHeight, minScale);
    showWindow(findVisibleRowRange(virtualizerState.offsetIndex, scrollEl.scrollTop, viewportHeight, overscan), true);
    rowsEl.style.willChange = "transform";
    const origin = layerOrigin();
    return { left: origin.x, top: origin.y, minScale, maxScale: MAX_TARGET_ROW_HEIGHT / targetRowHeight };
  }

  function showZoom(view: ZoomView): void {
    if (rowsEl) {
      rowsEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    }
  }

  function settleZoom(view: ZoomView, focus: ZoomPoint): void {
    if (!scrollEl || !rowsEl || !gridRows) {
      return;
    }

    // Where each tile showed, from the layout as the gesture scaled it, and the tile under the pointer, or the one
    // nearest it, with how far down that tile the pointer is. The layer starts at the first row shown, so the layout's
    // top-left corner sits that row's top above the layer's, scaled with it.
    const { rows, offsetIndex } = virtualizerState;
    const origin = layerOrigin();
    const layerTop = offsetIndex.rowTopOffsets[lastVisibleStart] ?? 0;
    const shownAt = tileBoxes(virtualizerState, origin.x + view.x, origin.y + view.y - view.scale * layerTop, view.scale);
    const before = new Map<HTMLElement, Box>();
    let anchor: { itemId: string; itemIndex: number; fraction: number } | null = null;
    let nearest = Infinity;
    for (const shown of gridRows.shownTiles()) {
      const place = shownAt(shown);
      before.set(shown.element, place);
      const dx = Math.max(place.left - focus.x, 0, focus.x - (place.left + place.width));
      const dy = Math.max(place.top - focus.y, 0, focus.y - (place.top + place.height));
      const distance = dx * dx + dy * dy;
      const tile = rows[shown.row]!.tiles[shown.slot]!;
      const item = items[tile.itemIndex];
      if (item && distance < nearest) {
        nearest = distance;
        const fraction = Math.min(1, Math.max(0, (focus.y - place.top) / Math.max(1, place.height)));
        anchor = { itemId: item.id, itemIndex: tile.itemIndex, fraction };
      }
    }
    rowsEl.style.transform = "";
    rowsEl.style.willChange = "";

    const rowHeight = clampTargetRowHeight(targetRowHeight * view.scale);
    if (rowHeight !== targetRowHeight) {
      targetRowHeight = rowHeight;
      options?.onRowHeightChange?.(rowHeight);
    }

    // Content that came during the gesture shows now, in its one reflow. A new window starts at the top instead, so no
    // tile keeps its place.
    const content = pendingContent;
    pendingContent = null;
    if (content) {
      if (content.resetScroll || content.visibleItems.length === 0) {
        setBrowseContent(content);
        return;
      }
      items = content.visibleItems;
    }

    layoutWidth = measureLayoutWidth();
    virtualizerState = createVirtualizerState(items, layoutWidth, targetRowHeight);
    const next = virtualizerState.offsetIndex;
    const gridBox = viewBox();
    let scrollTop = scrollEl.scrollTop;
    if (anchor) {
      const { itemId, itemIndex, fraction } = anchor;
      const index = items[itemIndex]?.id === itemId ? itemIndex : items.findIndex((item) => item.id === itemId);
      const rowIndex = index < 0 ? -1 : findRowIndexForItem(virtualizerState.rows, index);
      if (rowIndex >= 0) {
        // The point under the pointer stays as far down its tile, so the tile keeps its vertical place.
        const anchorRow = virtualizerState.rows[rowIndex]!;
        scrollTop = next.rowTopOffsets[rowIndex]! + fraction * anchorRow.rowHeight - (focus.y - gridBox.top);
      }
    }
    scrollTop = Math.min(Math.max(0, scrollTop), Math.max(0, next.totalExtentHeight - gridBox.height));
    // The rows show before the grid scrolls to them, so the scroll position fits within them, and the coverage goes out
    // once it has, never pairing the new rows with the scroll position from before the zoom.
    showWindow(findVisibleRowRange(next, scrollTop, gridBox.height), true);
    scrollEl.scrollTop = scrollTop;
    reportCoverage();

    if (!prefersReducedMotion()) {
      moveTiles(before, gridBox, scrollTop);
    }
  }

  // Tiles that showed move from where they were to their new places; tiles that come into view fade in.
  function moveTiles(before: ReadonlyMap<HTMLElement, Box>, view: Box, scrollTop: number): void {
    const placeOf = tileBoxes(virtualizerState, view.left, view.top - scrollTop, 1);
    for (const shown of gridRows!.shownTiles()) {
      const to = placeOf(shown);
      if (!overlaps(to, view)) {
        continue;
      }
      const from = before.get(shown.element);
      if (from && overlaps(from, view)) {
        const moved = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
        tileMoves.push(
          shown.element.animate(
            [
              { transformOrigin: "0 0", transform: moved },
              { transformOrigin: "0 0", transform: "none" }
            ],
            { duration: TILE_MOVE_MS, easing: TILE_MOVE_EASING }
          )
        );
      } else {
        tileMoves.push(shown.element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TILE_MOVE_MS, easing: "ease-out" }));
      }
    }
  }

  function scheduleResizeReflow(): void {
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      // A zoom gesture's settle lays the rows out at the width it has then.
      if ((browseRoot?.clientWidth ?? 0) < 1 || scrollEl?.hidden || zoom.isActive()) {
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

  function setBrowseContent(input: BrowseContent): void {
    ensureBrowseShell();
    // Content that comes during a zoom gesture waits for it to settle, which shows it in its one reflow.
    if (zoom.isActive()) {
      const resetScroll = input.resetScroll !== false || pendingContent?.resetScroll === true;
      pendingContent = { visibleItems: input.visibleItems, resetScroll };
      return;
    }
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
    zoom.cancel();
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
      scrollEl.removeEventListener("wheel", onWheel);
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("touchend", onTouchEnd);
      scrollEl.removeEventListener("touchcancel", onTouchEnd);
      scrollEl.removeEventListener("gesturestart", onGestureStart);
    }
    browseRoot = null;
    scrollEl = null;
    topSpacerEl = null;
    rowsEl = null;
    gridRows = null;
    bottomSpacerEl = null;
    emptyEl = null;
    items = [];
    virtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
    lastVisibleStart = -1;
    lastVisibleEnd = -1;
    layoutStale = false;
    pendingScrollReset = false;
    pendingContent = null;
    tileMoves = [];
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
