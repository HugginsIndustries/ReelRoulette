import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { requestPlayItem } from "../api/coreApi";
import { filterSummaryParts } from "../filter/filterSummaryModel";
import { playbackTraceLine } from "../logging/relayLogLines";
import type { PanelHost } from "../panel/panelHost";
import type { Player } from "../playback/player";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { DeviceStore } from "../state/deviceStore";
import type { ServerConnection } from "../state/serverConnection";
import type { RuntimeConfig } from "../types/runtimeConfig";
import {
  LIBRARY_SORT_MODES,
  createDefaultBrowseControls,
  getSortDirectionLabel,
  isDefaultDescendingForSortMode,
  type LibraryBrowseControls,
  type LibrarySortMode
} from "./libraryBrowseModel";
import {
  createLibraryGridController,
  type LibraryGridController,
  type LibraryGridCoverage
} from "./libraryGridController";
import { LIBRARY_OVERLAY_FETCH_ERROR, libraryOverlayMessage, type LibraryOverlayMessage } from "./libraryOverlayModel";
import { mapPlayItemErrorToStatus } from "./libraryPlayModel";
import { parseLibraryQueryPage } from "./libraryProjectionModel";
import {
  LIBRARY_QUERY_SEARCH_DEBOUNCE_MS,
  createLibraryQuerySession,
  type LibraryQueryRequest,
  type LibraryQuerySession,
  type LibraryQuerySessionSnapshot
} from "./libraryQuerySession";

/**
 * What the Library tab's body shows: nothing before it first shows a message or tiles, a message, or the grid,
 * which the grid controller renders into the body element it is given.
 */
export type LibraryBody =
  | { kind: "blank" }
  | { kind: "message"; message: LibraryOverlayMessage }
  | { kind: "grid" };

const CONTROLS_COLLAPSED_KEY = "library.controlsCollapsed";
const SORT_KEY = "library.sort";

/** The sort and its direction, as remembered across a page refresh. */
interface RememberedSort {
  mode: LibrarySortMode;
  descending: boolean;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRememberedSort(value: unknown): value is RememberedSort {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (LIBRARY_SORT_MODES as readonly unknown[]).includes(record.mode) && typeof record.descending === "boolean";
}

export type CreateLibraryGrid = (
  host: HTMLElement,
  onCoverage: (coverage: LibraryGridCoverage) => void
) => LibraryGridController;

/**
 * The Library tab's browse window, controls, Filters line, and tile play. The first page loads once the server is
 * ready, and the window keeps its tiles and scroll position while the tab is hidden. The panel shows and hides the
 * tab. The tab remembers on this device whether its controls are collapsed, and its sort and direction.
 */
export interface Library {
  /** The loaded window, which the tag editor reads and updates. */
  readonly session: LibraryQuerySession;
  /** The search text and sort the controls show, as the user sets them. */
  readonly controls: ReadonlySignal<LibraryBrowseControls>;
  /** The controls and the Filters line are collapsed, giving the grid more room. */
  readonly controlsCollapsed: ReadonlySignal<boolean>;
  /** The applied filters as the Filters line names them, empty when no filter applies. */
  readonly filterSummary: ReadonlySignal<string[]>;
  /** The tab's "Showing N of M items", or null while it is hidden. */
  readonly summary: ReadonlySignal<string | null>;
  /** The sort direction button's label. It changes when a page in the new order arrives. */
  readonly directionLabel: ReadonlySignal<string>;
  readonly body: ReadonlySignal<LibraryBody>;

  /** The tab's view rendered, so the tab can open. */
  attach(): void;
  /** The tab's view went away, so the tab counts as closed from then on. */
  detach(): void;
  /** Creates the grid in `host`, the body element while the grid shows. Returns a function that destroys it. */
  attachGrid(host: HTMLElement): () => void;
  isOpen(): boolean;
  /**
   * The tab shows, its page already shown, and loads the first page when there is none. While the server fails the
   * compatibility check, the body shows why, in place of the grid, and before it has passed the check the first page
   * waits for it.
   */
  open(): void;
  /** The tab hides. */
  close(): void;
  /**
   * Starts over from the first page with the applied filter and the current search and sort. Before the server has
   * passed the compatibility check, or while it fails it, nothing is sent: the first page loads with them once it passes.
   */
  commitQuery(): Promise<void>;
  /** Takes the search box's text, and starts over once typing stops. */
  setSearch(text: string): void;
  /** Starts over sorted by `mode` in its default direction. */
  setSortMode(mode: string): void;
  toggleSortDirection(): void;
  /** Collapses or expands the controls and the Filters line. */
  toggleControls(): void;
  /** Shows the Filter tab, as the Filters line does. */
  openFilterTab(): Promise<void>;
  /** Plays a tile's item through the server, closes the panel as the overlay, and hands the item to the player. */
  play(itemId: string): Promise<void>;
}

export interface LibraryOptions {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
  player: Pick<Player, "playCurrent">;
  /** Choosing a tile closes the panel as the overlay; beside the player it stays open. */
  panel: Pick<PanelHost, "closeIfOverlay" | "showTab">;
  /** Remembers whether the controls are collapsed, and the sort and direction. */
  device: DeviceStore;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
  /** Defaults to the grid controller. */
  createGrid?: CreateLibraryGrid;
  /** Defaults to `requestAnimationFrame`. */
  requestFrame?: (callback: () => void) => void;
}

function errorText(error: unknown): string {
  return (error as { message?: string } | null)?.message || String(error);
}

export function createLibrary(options: LibraryOptions): Library {
  const { store, api, connection, player, panel, device } = options;
  const apiBaseUrl = String(options.config.apiBaseUrl || "").replace(/\/+$/, "");
  const sseUrl = options.config.sseUrl;
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const createGrid: CreateLibraryGrid =
    options.createGrid ?? ((host, onCoverage) => createLibraryGridController(host, apiBaseUrl, { onCoverage }));
  const requestFrame = options.requestFrame ?? ((callback: () => void) => void requestAnimationFrame(() => callback()));

  // The search text isn't remembered.
  const rememberedSort = device.read<RememberedSort | null>(SORT_KEY, null, isRememberedSort);
  const initialControls: LibraryBrowseControls = rememberedSort
    ? { ...createDefaultBrowseControls(), sortMode: rememberedSort.mode, sortDescending: rememberedSort.descending }
    : createDefaultBrowseControls();
  const controls = signal(initialControls);
  const controlsCollapsed = signal(device.read(CONTROLS_COLLAPSED_KEY, false, isBoolean));
  const filterSummary = computed(() => filterSummaryParts(store.appliedFilter.value, store.sources.value));
  const summary = signal<string | null>(null);
  const directionLabel = signal(getSortDirectionLabel(initialControls.sortMode, initialControls.sortDescending));
  const body = signal<LibraryBody>({ kind: "blank" });

  let attached = false;
  let open = false;
  let grid: LibraryGridController | null = null;
  /** A new query's scroll to the top, kept for a grid that is about to be created. */
  let pendingScrollTop = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let playInFlight = false;
  /** The server passed the compatibility check, so the library can load. */
  let serverReady = false;
  let sourcesInFlight = false;

  const session = createLibraryQuerySession((request, signal) => postQuery(request, signal));
  session.setListener((event) => {
    renderWindow(event.scroll);
    if (event.statusMessage) {
      store.setStatus(event.statusMessage);
    }
  });

  async function postQuery(request: LibraryQueryRequest, abort: AbortSignal) {
    const raw = await api.getJson("/api/library/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filterState: request.filterState,
        search: request.search,
        sortMode: request.sortMode,
        sortDescending: request.sortDescending,
        offset: request.offset,
        limit: request.limit
      }),
      signal: abort
    });
    return parseLibraryQueryPage(raw);
  }

  function trace(level: string, message: string, context: Record<string, unknown> = {}): void {
    void api.relayLog(level, playbackTraceLine(message, store.current.peek(), store.playAttemptId.peek(), context));
  }

  function showChrome(snap: LibraryQuerySessionSnapshot): void {
    if (snap.phase !== "ready") {
      return;
    }
    const current = controls.peek();
    directionLabel.value = getSortDirectionLabel(current.sortMode, current.sortDescending);
    summary.value = snap.summaryText || null;
  }

  /** Gives the grid the loaded tiles, or keeps the scroll reset for the grid about to be created. */
  function showTiles(scroll: "top" | "keep"): void {
    if (!grid) {
      pendingScrollTop ||= scroll === "top";
      return;
    }
    grid.setBrowseContent({ visibleItems: session.snapshot().items, resetScroll: scroll === "top" });
  }

  /**
   * While hidden, only a grid already shown is updated, and its layout waits until the tab shows. While shown, a
   * window without a result shows its message in place of the grid, and so does a server that failed the
   * compatibility check.
   */
  function renderWindow(scroll: "top" | "keep"): void {
    const snap = session.snapshot();
    const ready = snap.phase === "ready";
    if (!open) {
      if (body.peek().kind !== "grid" || !ready) {
        return;
      }
      showChrome(snap);
      showTiles(scroll);
      return;
    }

    const blockedBy = store.compatibilityBlocked.peek() ? store.compatibilityMessage.peek() : null;
    if (blockedBy !== null) {
      summary.value = null;
      body.value = { kind: "message", message: { text: blockedBy, error: true, live: false } };
      return;
    }

    if (!ready) {
      summary.value = null;
      const phase = snap.phase === "error" ? "error" : snap.phase === "empty" ? "empty" : "loading";
      body.value = { kind: "message", message: libraryOverlayMessage(phase, snap.errorMessage || LIBRARY_OVERLAY_FETCH_ERROR) };
      return;
    }

    showChrome(snap);
    if (body.peek().kind !== "grid") {
      body.value = { kind: "grid" };
    }
    showTiles(scroll);
  }

  function onCoverage(coverage: LibraryGridCoverage): void {
    session.noteScroll(coverage.scrollTop);
    if (!open) {
      return;
    }
    void session.considerFill(coverage.extentHeight, coverage.viewportBottom, coverage.lastPageHeight);
  }

  function commitQuery(): Promise<void> {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    if (!serverReady || store.compatibilityBlocked.peek()) {
      return Promise.resolve();
    }
    return session.resetQuery(store.appliedFilter.peek(), controls.peek());
  }

  function rememberSort(): void {
    const current = controls.peek();
    device.write(SORT_KEY, { mode: current.sortMode, descending: current.sortDescending } satisfies RememberedSort);
  }

  /** Loads the sources for the Filters line, which counts them, when the applied filter chooses some. */
  async function loadSourcesForSummary(): Promise<void> {
    if (store.sources.peek() !== null || sourcesInFlight || store.appliedFilter.peek().includedSourceIds.length === 0) {
      return;
    }
    sourcesInFlight = true;
    try {
      const sources = await api.getJson("/api/sources");
      if (store.sources.peek() === null) {
        store.sources.value = Array.isArray(sources) ? sources : [];
      }
    } catch {
      // The Filters line counts the chosen sources without their total until a later load succeeds.
      void api.relayLog("warn", "library=filter-summary-sources-failed");
    } finally {
      sourcesInFlight = false;
    }
  }

  function close(): void {
    open = false;
    session.setOverlayVisible(false);
  }

  async function play(itemId: string): Promise<void> {
    const trimmedItemId = String(itemId || "").trim();
    if (!trimmedItemId) {
      store.setStatus("Playback unavailable: no library item was selected.");
      return;
    }

    if (store.compatibilityBlocked.peek()) {
      store.setStatus("Cannot play: server compatibility check failed.");
      return;
    }

    if (playInFlight) {
      return;
    }

    playInFlight = true;
    store.setStatus("Loading...");
    trace("info", "library-play-start");

    try {
      const result = await requestPlayItem(
        { apiBaseUrl, sseUrl },
        trimmedItemId,
        { clientId: store.identity.clientId, sessionId: store.identity.sessionId },
        send
      );

      if (result.statusCode === 401) {
        store.pairingRequired.value = true;
        store.setStatus("Unauthorized. Pair first.");
        return;
      }

      if (!result.ok) {
        trace("warn", "library-play-failed", {
          statusCode: result.statusCode,
          code: result.code || "none"
        });
        store.setStatus(mapPlayItemErrorToStatus(result), "Playback failed");
        return;
      }

      const data = result.response;
      if (!data?.mediaUrl) {
        store.setStatus("Playback failed.");
        return;
      }

      store.pushHistory(data);
      void panel.closeIfOverlay();
      trace("info", "library-play-success");
      player.playCurrent({ recordPlayback: false });
    } catch (error) {
      trace("warn", "library-play-error", { message: errorText(error) });
      store.setStatus(`Playback failed: ${errorText(error)}`);
    } finally {
      playInFlight = false;
    }
  }

  store.on("headerFilterChanged", () => {
    void commitQuery();
    if (serverReady) {
      void loadSourcesForSummary();
    }
  });
  connection.on("serverReady", () => {
    serverReady = true;
    void session.ensureLoaded(store.appliedFilter.peek(), controls.peek());
    void loadSourcesForSummary();
  });
  // The player updates the playing item and the status line first.
  connection.on("itemStateChanged", (payload) => {
    if (!payload?.itemId) return;
    void session.applyFavorite(payload);
  });
  connection.on("playbackRecorded", (payload) => {
    void session.applyPlayback(payload);
  });
  // A finished refresh can add items and rewrite thumbnails, so the loaded window reloads once per run.
  connection.on("refreshCompleted", () => {
    void session.reloadLoaded();
  });
  connection.on("resyncRequired", () => {
    void session.resync();
  });
  // The tab says why while the server fails the compatibility check, and shows the library again once it passes.
  store.compatibilityBlocked.subscribe(() => {
    if (open) {
      renderWindow("keep");
    }
  });
  // The playing item's tile shows the playing icon.
  store.current.subscribe((item) => {
    grid?.setPlayingItemId(item?.itemId ?? null);
  });

  return {
    session,
    controls,
    controlsCollapsed,
    filterSummary,
    summary,
    directionLabel,
    body,

    attach() {
      attached = true;
    },

    detach() {
      if (open) {
        open = false;
        session.setOverlayVisible(false);
      }
      attached = false;
    },

    attachGrid(host) {
      const created = createGrid(host, onCoverage);
      grid = created;
      created.setPlayingItemId(store.current.peek()?.itemId ?? null);
      const resetScroll = pendingScrollTop;
      pendingScrollTop = false;
      const snap = session.snapshot();
      if (snap.phase === "ready") {
        created.setBrowseContent({ visibleItems: snap.items, resetScroll });
      }
      return () => {
        created.destroy();
        if (grid === created) {
          grid = null;
        }
      };
    },

    isOpen() {
      return open;
    },

    // The panel shows the tab before this runs, so a grid layout deferred while it was hidden measures it shown.
    open() {
      if (!attached) {
        return;
      }

      open = true;
      session.setOverlayVisible(true);
      if (store.compatibilityBlocked.peek()) {
        renderWindow("keep");
        return;
      }
      const snap = session.snapshot();
      if (snap.phase !== "ready" || !grid) {
        renderWindow("keep");
      } else {
        showChrome(snap);
        grid.flushDeferredLayout();
      }
      // Before the server has passed the compatibility check, the first page waits for it, as `commitQuery` does.
      if (!snap.hasResult && serverReady) {
        void session.ensureLoaded(store.appliedFilter.peek(), controls.peek());
      }
      requestFrame(() => {
        if (!open) {
          return;
        }
        const coverage = grid?.measureCoverage();
        if (coverage) {
          void session.considerFill(coverage.extentHeight, coverage.viewportBottom, coverage.lastPageHeight);
        }
      });
    },

    close,
    commitQuery,

    setSearch(text) {
      controls.value = { ...controls.peek(), searchQuery: text };
      if (searchTimer) {
        clearTimeout(searchTimer);
      }
      searchTimer = setTimeout(() => {
        void commitQuery();
      }, LIBRARY_QUERY_SEARCH_DEBOUNCE_MS);
    },

    setSortMode(mode) {
      const sortMode = (mode || "Name") as LibrarySortMode;
      controls.value = {
        ...controls.peek(),
        sortMode,
        sortDescending: isDefaultDescendingForSortMode(sortMode)
      };
      rememberSort();
      void commitQuery();
    },

    toggleSortDirection() {
      controls.value = { ...controls.peek(), sortDescending: !controls.peek().sortDescending };
      rememberSort();
      void commitQuery();
    },

    toggleControls() {
      controlsCollapsed.value = !controlsCollapsed.peek();
      device.write(CONTROLS_COLLAPSED_KEY, controlsCollapsed.peek());
    },

    openFilterTab() {
      return panel.showTab("filter");
    },

    play
  };
}
