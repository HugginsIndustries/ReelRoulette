import { signal, type ReadonlySignal } from "@preact/signals";
import { requestPlayItem } from "../api/coreApi";
import { playbackTraceLine } from "../logging/relayLogLines";
import type { Player, ShownElement } from "../playback/player";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import type { RuntimeConfig } from "../types/runtimeConfig";
import {
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
 * What the overlay's body shows: nothing before it first shows a message or tiles, a message, or the grid,
 * which the grid controller renders into the body element it is given.
 */
export type LibraryBody =
  | { kind: "blank" }
  | { kind: "message"; message: LibraryOverlayMessage }
  | { kind: "grid" };

export interface LibraryElements {
  /** The overlay, which the library shows and hides by setting its `display`. */
  overlay: ShownElement;
}

export type CreateLibraryGrid = (
  host: HTMLElement,
  onCoverage: (coverage: LibraryGridCoverage) => void
) => LibraryGridController;

/**
 * The library overlay's browse window, search and sort, and tile play. The first page loads once the server is
 * ready, and the window keeps its tiles and scroll position while the overlay is hidden.
 */
export interface Library {
  /** The loaded window, which the tag editor still in `app.js` reads and updates. */
  readonly session: LibraryQuerySession;
  /** The search text and sort the toolbar shows, as the user sets them. */
  readonly controls: ReadonlySignal<LibraryBrowseControls>;
  readonly toolbarShown: ReadonlySignal<boolean>;
  /** The header's "Showing N of M items", or null while it is hidden. */
  readonly summary: ReadonlySignal<string | null>;
  /** The sort direction button's label. It changes when a page in the new order arrives. */
  readonly directionLabel: ReadonlySignal<string>;
  readonly body: ReadonlySignal<LibraryBody>;

  attach(elements: LibraryElements): void;
  /** Lets go of the overlay, which counts as closed from then on. */
  detach(): void;
  /** Creates the grid in `host`, the body element while the grid shows. Returns a function that destroys it. */
  attachGrid(host: HTMLElement): () => void;
  isOpen(): boolean;
  /** Shows the overlay, unless the server failed the compatibility check. */
  open(): void;
  close(): void;
  /** Starts over from the first page with the applied filter and the current search and sort. */
  commitQuery(): Promise<void>;
  /** Takes the search box's text, and starts over once typing stops. */
  setSearch(text: string): void;
  /** Starts over sorted by `mode` in its default direction. */
  setSortMode(mode: string): void;
  toggleSortDirection(): void;
  /** Plays a tile's item through the server, closes the overlay, and hands it to the player. */
  play(itemId: string): Promise<void>;
}

export interface LibraryOptions {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
  player: Pick<Player, "playCurrent">;
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
  const { store, api, connection, player } = options;
  const apiBaseUrl = String(options.config.apiBaseUrl || "").replace(/\/+$/, "");
  const sseUrl = options.config.sseUrl;
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const createGrid: CreateLibraryGrid =
    options.createGrid ?? ((host, onCoverage) => createLibraryGridController(host, apiBaseUrl, { onCoverage }));
  const requestFrame = options.requestFrame ?? ((callback: () => void) => void requestAnimationFrame(() => callback()));

  const initialControls = createDefaultBrowseControls();
  const controls = signal(initialControls);
  const toolbarShown = signal(false);
  const summary = signal<string | null>(null);
  const directionLabel = signal(getSortDirectionLabel(initialControls.sortMode, initialControls.sortDescending));
  const body = signal<LibraryBody>({ kind: "blank" });

  let elements: LibraryElements | null = null;
  let open = false;
  let grid: LibraryGridController | null = null;
  /** A new query's scroll to the top, kept for a grid that is about to be created. */
  let pendingScrollTop = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let playInFlight = false;

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
    toolbarShown.value = true;
    directionLabel.value = getSortDirectionLabel(current.sortMode, current.sortDescending);
    summary.value = snap.summaryText || null;
  }

  /** Gives the grid the loaded tiles, or keeps the scroll reset for the grid about to be created. */
  function showTiles(scroll: "top" | "keep"): void {
    if (!grid) {
      pendingScrollTop ||= scroll === "top";
      return;
    }
    grid.setBrowseContent({
      visibleItems: session.snapshot().items,
      searchQuery: controls.peek().searchQuery,
      resetScroll: scroll === "top"
    });
  }

  /**
   * While hidden, only a grid already shown is updated, and its layout waits until the overlay shows. While
   * shown, a window without a result shows its message in place of the grid.
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

    if (!ready) {
      toolbarShown.value = false;
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
    return session.resetQuery(store.appliedFilter.peek(), controls.peek());
  }

  function close(): void {
    if (elements) {
      elements.overlay.style.display = "none";
    }
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
      close();
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
  });
  connection.on("serverReady", () => {
    void session.ensureLoaded(store.appliedFilter.peek(), controls.peek());
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

  return {
    session,
    controls,
    toolbarShown,
    summary,
    directionLabel,
    body,

    attach(attached) {
      elements = attached;
    },

    detach() {
      if (open) {
        open = false;
        session.setOverlayVisible(false);
      }
      elements = null;
    },

    attachGrid(host) {
      const created = createGrid(host, onCoverage);
      grid = created;
      const resetScroll = pendingScrollTop;
      pendingScrollTop = false;
      const snap = session.snapshot();
      if (snap.phase === "ready") {
        created.setBrowseContent({
          visibleItems: snap.items,
          searchQuery: controls.peek().searchQuery,
          resetScroll
        });
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

    // Shows the overlay before the grid lays out, so a layout deferred while it was hidden measures it shown.
    open() {
      if (store.compatibilityBlocked.peek() || !elements) {
        return;
      }

      elements.overlay.style.display = "flex";
      open = true;
      session.setOverlayVisible(true);
      const snap = session.snapshot();
      if (snap.phase !== "ready" || !grid) {
        renderWindow("keep");
      } else {
        showChrome(snap);
        grid.flushDeferredLayout();
      }
      if (!snap.hasResult) {
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
      void commitQuery();
    },

    toggleSortDirection() {
      controls.value = { ...controls.peek(), sortDescending: !controls.peek().sortDescending };
      void commitQuery();
    },

    play
  };
}
