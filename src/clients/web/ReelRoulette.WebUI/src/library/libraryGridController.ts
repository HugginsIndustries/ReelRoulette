import { computeAvailableLayoutWidth } from "./libraryGridLayout";
import { renderGridRowHtml } from "./libraryGridRowModel";
import {
  countVisibleRows,
  createVirtualizerState,
  findVisibleRowRange,
  type LibraryGridVirtualizerState
} from "./libraryGridVirtualizer";
import type { LibraryProjectionItem } from "./libraryProjectionModel";

const RESIZE_DEBOUNCE_MS = 90;
const MIN_FALLBACK_WIDTH = 280;

export interface LibraryGridController {
  setBrowseContent(input: {
    visibleItems: readonly LibraryProjectionItem[];
    searchQuery: string;
    resetScroll?: boolean;
  }): void;
  destroy(): void;
}

export function createLibraryGridController(
  container: HTMLElement,
  apiBaseUrl: string
): LibraryGridController {
  let browseRoot: HTMLElement | null = null;
  let scrollEl: HTMLElement | null = null;
  let topSpacerEl: HTMLElement | null = null;
  let rowsEl: HTMLElement | null = null;
  let bottomSpacerEl: HTMLElement | null = null;
  let emptyEl: HTMLElement | null = null;

  let items: readonly LibraryProjectionItem[] = [];
  let virtualizerState: LibraryGridVirtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
  let layoutWidth = computeAvailableLayoutWidth(container.clientWidth || MIN_FALLBACK_WIDTH);
  let lastVisibleStart = -1;
  let lastVisibleEnd = -1;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let resizeObserver: ResizeObserver | null = null;

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

    rowsEl = document.createElement("div");
    rowsEl.className = "library-grid-rows";

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
    if (!scrollEl || !topSpacerEl || !rowsEl || !bottomSpacerEl) {
      return;
    }

    if (virtualizerState.rows.length === 0) {
      topSpacerEl.style.height = "0px";
      bottomSpacerEl.style.height = "0px";
      rowsEl.replaceChildren();
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

    const visibleRows = virtualizerState.rows.slice(window.firstVisibleRow, window.endExclusive);
    const html = visibleRows.map((row) => renderGridRowHtml(row, items, apiBaseUrl)).join("");
    rowsEl.innerHTML = html;
  }

  function onScroll(): void {
    updateVisibleRows(false);
  }

  function scheduleResizeReflow(): void {
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      const nextWidth = measureLayoutWidth();
      if (Math.abs(nextWidth - layoutWidth) < 0.5 && items.length > 0) {
        updateVisibleRows(true);
        return;
      }
      rebuildVirtualizer(false);
    }, RESIZE_DEBOUNCE_MS);
  }

  function setBrowseContent(input: {
    visibleItems: readonly LibraryProjectionItem[];
    searchQuery: string;
    resetScroll?: boolean;
  }): void {
    ensureBrowseShell();
    items = input.visibleItems;

    const hasItems = input.visibleItems.length > 0;
    if (emptyEl && scrollEl) {
      if (!hasItems) {
        const trimmed = String(input.searchQuery || "").trim();
        emptyEl.textContent = trimmed
          ? `No matches for “${trimmed}”.`
          : "No items match the current filter.";
        emptyEl.hidden = false;
        scrollEl.hidden = true;
      } else {
        emptyEl.hidden = true;
        scrollEl.hidden = false;
      }
    }

    if (!hasItems) {
      virtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
      if (rowsEl && topSpacerEl && bottomSpacerEl) {
        rowsEl.replaceChildren();
        topSpacerEl.style.height = "0px";
        bottomSpacerEl.style.height = "0px";
      }
      return;
    }

    rebuildVirtualizer(input.resetScroll !== false);
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
    rowsEl = null;
    bottomSpacerEl = null;
    emptyEl = null;
    items = [];
    virtualizerState = { rows: [], offsetIndex: { rowTopOffsets: [], rowBottomOffsets: [], totalExtentHeight: 0 } };
    lastVisibleStart = -1;
    lastVisibleEnd = -1;
    container.replaceChildren();
  }

  return {
    setBrowseContent,
    destroy
  };
}

/** Exported for tests that assert virtualization window sizing. */
export function getVisibleRowCountForFixture(
  itemCount: number,
  layoutWidth: number,
  scrollTop: number,
  viewportHeight: number
): number {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    id: `id-${index}`,
    sourceId: "s1",
    fileName: `f-${index}.mp4`,
    fullPath: null,
    relativePath: "",
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: null,
    mediaType: "video" as const,
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: false,
    thumbnailWidth: null,
    thumbnailHeight: null
  }));
  const state = createVirtualizerState(items, layoutWidth);
  const window = findVisibleRowRange(state.offsetIndex, scrollTop, viewportHeight);
  return countVisibleRows(window);
}
