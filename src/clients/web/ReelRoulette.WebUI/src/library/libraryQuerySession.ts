import type { FilterState } from "../filter/filterStateModel";
import { cloneFilterState, createDefaultFilterState, serializeFilterStateForApi } from "../filter/filterStateModel";
import {
  createDefaultBrowseControls,
  formatBrowseResultSummary,
  type LibraryBrowseControls,
  type LibrarySortMode
} from "./libraryBrowseModel";
import { DEFAULT_GRID_OVERSCAN_PX } from "./libraryGridVirtualizer";
import type { LibraryProjectionItem } from "./libraryProjectionModel";
import { applyItemStateChanged, applyPlaybackRecorded, findProjectionItem } from "./libraryProjectionSync";
import type { ItemStateChangedPayload, PlaybackRecordedPayload } from "./libraryProjectionSync";

export const LIBRARY_QUERY_WINDOW_SIZE = 200;
/** The server's query limit, so a reload of up to this many loaded tiles is one request. */
export const LIBRARY_QUERY_RELOAD_LIMIT = 10_000;
export const LIBRARY_QUERY_SEARCH_DEBOUNCE_MS = 300;

export type LibraryQueryKind = "reset" | "reload" | "append";
export type LibraryQueryTileEvent = "favorite" | "playback" | "tags";
export type LibraryQueryTileEffect = "patch" | "reload";
export type LibraryWindowPhase = "idle" | "loading" | "ready" | "empty" | "error";

export interface LibraryQueryRequest {
  filterState: Record<string, unknown>;
  search: string;
  sortMode: LibrarySortMode;
  sortDescending: boolean;
  offset: number;
  limit: number;
}

export interface LibraryQueryPage {
  items: LibraryProjectionItem[];
  totalCount: number;
  searchBaselineCount: number;
}

export interface LibraryQuerySessionSnapshot {
  items: readonly LibraryProjectionItem[];
  totalCount: number;
  searchBaselineCount: number;
  hasResult: boolean;
  phase: LibraryWindowPhase;
  errorMessage: string | null;
  summaryText: string | null;
  searchQuery: string;
  overlayVisible: boolean;
  scrollTop: number;
  inFlight: boolean;
}

export interface LibraryQuerySessionEvent {
  scroll: "top" | "keep";
  statusMessage: string | null;
}

export interface ItemTagsChangedPayload {
  itemIds?: readonly string[] | null;
  addedTags?: readonly string[] | null;
  removedTags?: readonly string[] | null;
  /** Set when a catalog rename or delete caused the change. */
  catalogReplacedTag?: string | null;
}

export interface LibraryTileFlags {
  isFavorite: boolean;
  isBlacklisted: boolean;
}

/**
 * One item's change from a favorite, blacklist, playback, or tag event. `before` is the loaded tile's
 * favorite and blacklist before the event, and is unknown for an item that is not loaded.
 */
export interface LibraryTileChange {
  kind: LibraryQueryTileEvent;
  loaded: boolean;
  before?: LibraryTileFlags | null;
  after?: LibraryTileFlags | null;
  addedTags?: readonly string[] | null;
  removedTags?: readonly string[] | null;
}

export type LibraryTileEffectFilter = Pick<
  FilterState,
  "favoritesOnly" | "excludeBlacklisted" | "onlyNeverPlayed" | "selectedTags" | "excludedTags"
>;

export type LibraryQueryFn = (request: LibraryQueryRequest, signal: AbortSignal) => Promise<LibraryQueryPage>;

export interface LibraryQuerySession {
  snapshot(): LibraryQuerySessionSnapshot;
  setListener(listener: (event: LibraryQuerySessionEvent) => void): void;
  ensureLoaded(filter: FilterState, controls: LibraryBrowseControls): Promise<void>;
  resetQuery(filter: FilterState, controls: LibraryBrowseControls): Promise<void>;
  setOverlayVisible(visible: boolean): void;
  noteScroll(scrollTop: number): void;
  considerFill(extentHeight: number, viewportBottom: number): Promise<void>;
  applyFavorite(payload: ItemStateChangedPayload): Promise<void>;
  applyPlayback(payload: PlaybackRecordedPayload): Promise<void>;
  applyTags(payload: ItemTagsChangedPayload): Promise<void>;
  writeTags(updates: readonly { itemId: string; tags: readonly string[] }[]): void;
  reviseStoredFilter(revise: (selected: string[], excluded: string[]) => void): void;
  reloadLoaded(): Promise<void>;
  resync(): Promise<void>;
}

export function createAutoTagScanRequest(scanFullLibrary: boolean): { scanFullLibrary: boolean; itemIds: string[] } {
  return { scanFullLibrary, itemIds: [] };
}

export function isEmptyLibraryResult(totalCount: number, searchBaselineCount: number, searchQuery: string): boolean {
  return totalCount === 0 && searchBaselineCount === 0 && !String(searchQuery || "").trim();
}

export function libraryQueryShouldFill(
  loadedCount: number,
  totalCount: number,
  loadedExtentHeight: number,
  viewportBottom: number
): boolean {
  if (loadedCount <= 0 || totalCount <= 0 || loadedCount >= totalCount) {
    return false;
  }
  return loadedExtentHeight < viewportBottom + DEFAULT_GRID_OVERSCAN_PX;
}

export function libraryQueryNextWindow(loadedCount: number): { offset: number; limit: number } {
  return { offset: Math.max(0, loadedCount), limit: LIBRARY_QUERY_WINDOW_SIZE };
}

export function libraryQueryReloadWindows(loadedCount: number): Array<{ offset: number; limit: number }> {
  if (loadedCount <= 0) {
    return [{ offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE }];
  }
  const windows: Array<{ offset: number; limit: number }> = [];
  let offset = 0;
  while (offset < loadedCount) {
    const limit = Math.min(LIBRARY_QUERY_RELOAD_LIMIT, loadedCount - offset);
    windows.push({ offset, limit });
    offset += limit;
  }
  return windows;
}

/**
 * Reload the loaded window only when the change can alter what it shows or its order. A loaded tile reloads
 * when a changed field is in the filter or sort and can take it out or move it. An item that is not loaded
 * reloads only when the change could bring it into the window. Locked to shared/fixtures/library-tile-effect.json.
 */
export function libraryQueryTileEffect(
  change: LibraryTileChange,
  filter: LibraryTileEffectFilter,
  sortMode: string
): LibraryQueryTileEffect {
  let reload = false;
  switch (change.kind) {
    case "favorite":
      reload = flagChangeReloads(change, filter);
      break;
    case "playback":
      reload = sortMode === "LastPlayed" || sortMode === "PlayCount" || (change.loaded && filter.onlyNeverPlayed);
      break;
    case "tags":
      reload = tagChangeReloads(change, filter);
      break;
  }
  return reload ? "reload" : "patch";
}

/** A tag save made here can rename or delete a tag the filter holds, so it reloads under any tag filter. */
export function libraryQueryTagSaveEffect(filter: LibraryTileEffectFilter): LibraryQueryTileEffect {
  return filter.selectedTags.length > 0 || filter.excludedTags.length > 0 ? "reload" : "patch";
}

function flagChangeReloads(change: LibraryTileChange, filter: LibraryTileEffectFilter): boolean {
  const { favoritesOnly, excludeBlacklisted } = filter;
  if (!favoritesOnly && !excludeBlacklisted) {
    return false;
  }
  const after = change.after;
  if (!after) {
    return true;
  }
  const before = change.before;
  if (change.loaded && before) {
    return (
      (favoritesOnly && before.isFavorite !== after.isFavorite) ||
      (excludeBlacklisted && before.isBlacklisted !== after.isBlacklisted)
    );
  }
  return (!favoritesOnly || after.isFavorite) && (!excludeBlacklisted || !after.isBlacklisted);
}

/** Adding a selected tag or removing an excluded one can only bring an item in; the reverse can only take it out. */
function tagChangeReloads(change: LibraryTileChange, filter: LibraryTileEffectFilter): boolean {
  const selected = new Set(filter.selectedTags.map((tag) => tag.toLowerCase()));
  const excluded = new Set(filter.excludedTags.map((tag) => tag.toLowerCase()));
  if (selected.size === 0 && excluded.size === 0) {
    return false;
  }
  const hits = (tags: readonly string[] | null | undefined, set: Set<string>) =>
    (tags ?? []).some((tag) => set.has(tag.toLowerCase()));
  if (change.loaded) {
    return hits(change.removedTags, selected) || hits(change.addedTags, excluded);
  }
  return hits(change.addedTags, selected) || hits(change.removedTags, excluded);
}

/** An in-flight reset stays a reset. Any other open query, or a reload effect, reads the loaded window again. */
export function libraryQueryReplayKind(
  inFlight: LibraryQueryKind | null,
  effect: LibraryQueryTileEffect
): LibraryQueryKind | null {
  if (inFlight === "reset") {
    return "reset";
  }
  if (inFlight != null || effect === "reload") {
    return "reload";
  }
  return null;
}

export function mergeLibraryItemTags(
  tags: readonly string[],
  addedTags: readonly string[],
  removedTags: readonly string[]
): string[] {
  const removed = new Set(removedTags.map((tag) => tag.toLowerCase()));
  const next: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (removed.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(tag);
  }
  for (const tag of addedTags) {
    const trimmed = tag.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

export function createLibraryQuerySession(query: LibraryQueryFn): LibraryQuerySession {
  let items: LibraryProjectionItem[] = [];
  let totalCount = 0;
  let searchBaselineCount = 0;
  let hasResult = false;
  let errorMessage: string | null = null;
  let overlayVisible = false;
  let scrollTop = 0;
  let generation = 0;
  let inFlight: LibraryQueryKind | null = null;
  let appendFailed = false;
  let exhausted = false;
  let filterState: FilterState = createDefaultFilterState();
  let controls: LibraryBrowseControls = createDefaultBrowseControls();
  let abort: AbortController | null = null;
  let listener: (event: LibraryQuerySessionEvent) => void = () => {};

  function snapshot(): LibraryQuerySessionSnapshot {
    const phase = derivePhase();
    return {
      items,
      totalCount,
      searchBaselineCount,
      hasResult,
      phase,
      errorMessage,
      summaryText: phase === "ready" ? formatBrowseResultSummary(totalCount, searchBaselineCount) : null,
      searchQuery: controls.searchQuery,
      overlayVisible,
      scrollTop,
      inFlight: inFlight != null
    };
  }

  function derivePhase(): LibraryWindowPhase {
    if (!hasResult) {
      if (inFlight) {
        return "loading";
      }
      if (errorMessage) {
        return "error";
      }
      return "idle";
    }
    if (isEmptyLibraryResult(totalCount, searchBaselineCount, controls.searchQuery)) {
      return "empty";
    }
    return "ready";
  }

  function notify(event: LibraryQuerySessionEvent): void {
    listener(event);
  }

  function storeQuery(filter: FilterState, nextControls: LibraryBrowseControls): void {
    filterState = cloneFilterState(filter);
    controls = {
      sortMode: nextControls.sortMode,
      sortDescending: nextControls.sortDescending,
      searchQuery: nextControls.searchQuery
    };
  }

  function requestFor(offset: number, limit: number): LibraryQueryRequest {
    return {
      filterState: serializeFilterStateForApi(filterState),
      search: controls.searchQuery,
      sortMode: controls.sortMode,
      sortDescending: controls.sortDescending,
      offset,
      limit
    };
  }

  async function run(kind: LibraryQueryKind): Promise<void> {
    const gen = ++generation;
    inFlight = kind;
    if (abort) {
      abort.abort();
    }
    const controller = new AbortController();
    abort = controller;
    const windows = kind === "reload" ? libraryQueryReloadWindows(items.length) : kind === "append"
      ? [libraryQueryNextWindow(items.length)]
      : [{ offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE }];
    const requestedOffset = kind === "append" ? items.length : 0;
    if (!hasResult) {
      notify({ scroll: "keep", statusMessage: null });
    }

    try {
      const collected: LibraryProjectionItem[] = [];
      let pageTotal = 0;
      let pageBaseline = 0;
      let lastLimit = LIBRARY_QUERY_WINDOW_SIZE;
      let lastReturned = 0;
      for (const window of windows) {
        const page = await query(requestFor(window.offset, window.limit), controller.signal);
        if (gen !== generation || controller.signal.aborted) {
          return;
        }
        collected.push(...page.items);
        pageTotal = page.totalCount;
        pageBaseline = page.searchBaselineCount;
        lastLimit = window.limit;
        lastReturned = page.items.length;
        if (collected.length >= pageTotal || page.items.length < window.limit) {
          break;
        }
      }
      if (gen !== generation || controller.signal.aborted) {
        return;
      }
      if (kind === "append" && items.length !== requestedOffset) {
        if (gen === generation) {
          inFlight = null;
        }
        return;
      }

      if (kind === "append") {
        items = items.concat(collected);
      } else {
        items = collected;
      }
      totalCount = pageTotal;
      searchBaselineCount = pageBaseline;
      hasResult = true;
      errorMessage = null;
      appendFailed = false;
      exhausted = items.length >= pageTotal || lastReturned < lastLimit;
      const scroll = kind === "reset" ? "top" : "keep";
      if (scroll === "top") {
        scrollTop = 0;
      }
      if (gen === generation) {
        inFlight = null;
        notify({ scroll, statusMessage: null });
      }
    } catch (error) {
      if (gen !== generation || controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error && error.message ? error.message : "Could not load library.";
      if (kind === "reset" || !hasResult) {
        items = [];
        totalCount = 0;
        searchBaselineCount = 0;
        hasResult = false;
        errorMessage = message;
        exhausted = false;
        if (gen === generation) {
          inFlight = null;
          notify({ scroll: "keep", statusMessage: `Library load failed: ${message}` });
        }
        return;
      }
      if (kind === "append") {
        appendFailed = true;
      }
      if (gen === generation) {
        inFlight = null;
        notify({
          scroll: "keep",
          statusMessage: "Library browse failed. Showing the tiles already loaded."
        });
      }
    }
  }

  return {
    snapshot,
    setListener(next) {
      listener = next;
    },
    async ensureLoaded(filter, nextControls) {
      if (hasResult || inFlight) {
        return;
      }
      storeQuery(filter, nextControls);
      await run("reset");
    },
    async resetQuery(filter, nextControls) {
      storeQuery(filter, nextControls);
      appendFailed = false;
      await run("reset");
    },
    setOverlayVisible(visible) {
      overlayVisible = visible;
    },
    noteScroll(next) {
      const clamped = Math.max(0, next);
      if (appendFailed && Math.abs(clamped - scrollTop) > 0.5) {
        appendFailed = false;
      }
      scrollTop = clamped;
    },
    async considerFill(extentHeight, viewportBottom) {
      if (!overlayVisible || !hasResult || inFlight || appendFailed || exhausted) {
        return;
      }
      if (!libraryQueryShouldFill(items.length, totalCount, extentHeight, viewportBottom)) {
        return;
      }
      await run("append");
    },
    async applyFavorite(payload) {
      if (!hasResult && !inFlight) {
        return;
      }
      const loaded = findProjectionItem(items, { itemId: payload.itemId, path: payload.path });
      const change: LibraryTileChange = {
        kind: "favorite",
        loaded: loaded != null,
        before: loaded ? { isFavorite: !!loaded.isFavorite, isBlacklisted: !!loaded.isBlacklisted } : null,
        after: { isFavorite: !!payload.isFavorite, isBlacklisted: !!payload.isBlacklisted }
      };
      const replay = libraryQueryReplayKind(inFlight, libraryQueryTileEffect(change, filterState, controls.sortMode));
      if (replay) {
        await run(replay);
        return;
      }
      const result = applyItemStateChanged(items, payload);
      if (result.changed) {
        notify({ scroll: "keep", statusMessage: null });
      }
    },
    async applyPlayback(payload) {
      if (!hasResult && !inFlight) {
        return;
      }
      const change: LibraryTileChange = {
        kind: "playback",
        loaded: findProjectionItem(items, { path: payload.path }) != null
      };
      const replay = libraryQueryReplayKind(inFlight, libraryQueryTileEffect(change, filterState, controls.sortMode));
      if (replay) {
        await run(replay);
        return;
      }
      const result = applyPlaybackRecorded(items, payload);
      if (result.changed) {
        notify({ scroll: "keep", statusMessage: null });
      }
    },
    reviseStoredFilter(revise) {
      revise(filterState.selectedTags, filterState.excludedTags);
    },
    writeTags(updates) {
      let changed = false;
      for (const update of updates) {
        const item = findProjectionItem(items, { itemId: update.itemId, path: update.itemId });
        if (!item) {
          continue;
        }
        item.tags = update.tags.slice();
        changed = true;
      }
      if (changed) {
        notify({ scroll: "keep", statusMessage: null });
      }
    },
    async reloadLoaded() {
      if (!hasResult && !inFlight) {
        return;
      }
      await run("reload");
    },
    async applyTags(payload) {
      const ids = (payload.itemIds ?? []).map((id) => String(id).trim()).filter(Boolean);
      if (ids.length === 0 || (!hasResult && !inFlight)) {
        return;
      }
      const added = payload.addedTags ?? [];
      const removed = payload.removedTags ?? [];
      // A catalog rename or delete also retargets the filter, so it keeps reloading under any tag filter.
      let effect: LibraryQueryTileEffect = String(payload.catalogReplacedTag ?? "").trim()
        ? libraryQueryTagSaveEffect(filterState)
        : "patch";
      for (const id of ids) {
        const change: LibraryTileChange = {
          kind: "tags",
          loaded: findProjectionItem(items, { itemId: id }) != null,
          addedTags: added,
          removedTags: removed
        };
        if (libraryQueryTileEffect(change, filterState, controls.sortMode) === "reload") {
          effect = "reload";
        }
      }
      const replay = libraryQueryReplayKind(inFlight, effect);
      if (replay) {
        await run(replay);
        return;
      }
      let changed = false;
      for (const id of ids) {
        const item = findProjectionItem(items, { itemId: id });
        if (!item) {
          continue;
        }
        item.tags = mergeLibraryItemTags(item.tags, added, removed);
        changed = true;
      }
      if (changed) {
        notify({ scroll: "keep", statusMessage: null });
      }
    },
    async resync() {
      if (!hasResult && !inFlight) {
        await run("reset");
        return;
      }
      if (inFlight === "reset") {
        await run("reset");
        return;
      }
      await run("reload");
    }
  };
}
