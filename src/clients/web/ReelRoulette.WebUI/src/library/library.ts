import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { requestPlayItem } from "../api/coreApi";
import { errorText, noticeRequestFailure, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { FilterSource } from "../filter/filterDialogModel";
import { filterSummaryParts } from "../filter/filterSummaryModel";
import { playbackTraceLine } from "../logging/relayLogLines";
import type { Notifications } from "../notifications/notifications";
import type { PanelHost } from "../panel/panelHost";
import type { Player } from "../playback/player";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { DeviceStore } from "../state/deviceStore";
import { noLibraryText, playRefusalNotice } from "../state/lastingStates";
import type { ServerConnection } from "../state/serverConnection";
import type { RuntimeConfig } from "../types/runtimeConfig";
import type { RefreshKeptSource } from "../types/serverContracts";
import { KEPT_SOURCES_LOG_TEXT, keptSourcesMessage, type KeptSourceFolder } from "./keptSources";
import {
  LIBRARY_SORT_MODES,
  createDefaultBrowseControls,
  getSortDirectionLabel,
  isDefaultDescendingForSortMode,
  type BrowseResultSummary,
  type LibraryBrowseControls,
  type LibrarySortMode
} from "./libraryBrowseModel";
import {
  createLibraryGridController,
  type LibraryGridController,
  type LibraryGridCoverage
} from "./libraryGridController";
import { libraryOverlayMessage, type LibraryOverlayMessage } from "./libraryOverlayModel";
import { playRefusalFailure } from "./libraryPlayModel";
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

/** The source list as loaded, null when its load failed, or "unauthorized" when the server answered 401. */
type SourcesLoad = FilterSource[] | null | "unauthorized";

export type CreateLibraryGrid = (
  host: HTMLElement,
  onCoverage: (coverage: LibraryGridCoverage) => void
) => LibraryGridController;

/**
 * The Library tab's browse window, controls, Filters line, and tile play. The first page loads once the server is
 * ready, and the window keeps its tiles and scroll position while the tab is hidden. The panel shows and hides the
 * tab. The tab remembers on this device whether its controls are collapsed, and its sort and direction. A refresh
 * that keeps a source's items because its folder listed no media files shows a notice naming the folder, once per
 * folder for the page's life.
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
  /** The tab's count line, "{matching} / {total}", or null while it is hidden. */
  readonly summary: ReadonlySignal<BrowseResultSummary | null>;
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
   * compatibility check or runs without a library, the body shows why, in place of the grid, and before the server is
   * ready the first page waits for it.
   */
  open(): void;
  /** The tab hides. */
  close(): void;
  /**
   * Starts over from the first page with the applied filter and the current search and sort. Before the server is
   * ready, while it fails the compatibility check, or while it runs without a library, nothing is sent: the first page
   * loads with them once it is ready.
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
  /**
   * Plays a tile's item through the server, closes the panel as the overlay, and hands the item to the player. A play
   * that fails shows in the notice; one the server answers with 401 shows the pairing prompt.
   */
  play(itemId: string): Promise<void>;
}

export interface LibraryOptions {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
  player: Pick<Player, "playCurrent">;
  /** The in-app dialogs, for a play that fails and a refresh that kept a source's items. */
  dialogs: Pick<Dialogs, "notice">;
  /** The one-off messages, for a later page that fails to load. */
  notifications: Pick<Notifications, "notify">;
  /** Choosing a tile closes the panel as the overlay; beside the player it stays open. */
  panel: Pick<PanelHost, "closeIfOverlay" | "showTab">;
  /** Remembers whether the controls are collapsed, and the sort and direction. */
  device: DeviceStore;
  /** Defaults to the grid controller. */
  createGrid?: CreateLibraryGrid;
  /** Defaults to `requestAnimationFrame`. */
  requestFrame?: (callback: () => void) => void;
}

export function createLibrary(options: LibraryOptions): Library {
  const { store, api, connection, player, panel, device, dialogs, notifications } = options;
  const apiBaseUrl = String(options.config.apiBaseUrl || "").replace(/\/+$/, "");
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
  const summary = signal<BrowseResultSummary | null>(null);
  const directionLabel = signal(getSortDirectionLabel(initialControls.sortMode, initialControls.sortDescending));
  const body = signal<LibraryBody>({ kind: "blank" });

  let attached = false;
  let open = false;
  let grid: LibraryGridController | null = null;
  /** A new query's scroll to the top, kept for a grid that is about to be created. */
  let pendingScrollTop = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let playInFlight = false;
  /** The server passed the compatibility check with a library, so the library can load. */
  let serverReady = false;
  /** The source list's load under way, which a second caller waits for rather than sending another. */
  let sourcesLoad: Promise<SourcesLoad> | null = null;
  /** The folders a kept-source notice has named, which no later notice names again. */
  const namedKeptFolders = new Set<string>();
  /** Kept source ids the source list didn't have even when loaded again, so later events don't load it again. */
  const unlistedKeptIds = new Set<string>();
  /** Kept-source events, handled one at a time, so a folder is named once though its events arrive together. */
  let keptSourcesQueue: Promise<void> = Promise.resolve();

  const session = createLibraryQuerySession((request, signal) => postQuery(request, signal));
  session.setListener((event) => {
    renderWindow(event.scroll);
    if (!event.statusMessage) {
      return;
    }
    // A 401 shows only the pairing prompt, which the request has asked for, and sent its line.
    if (event.failureStatus === 401) {
      return;
    }
    // A failed first page shows in place in the body, so it only relays; a later page's failure keeps the tiles
    // already loaded, and pops up.
    if (event.failure === "browse") {
      notifications.notify({ kind: "connection", text: event.statusMessage, icon: "sync_problem", key: "browse" });
    } else {
      store.relayStatus(event.statusMessage);
    }
  });

  async function postQuery(request: LibraryQueryRequest, abort: AbortSignal) {
    const raw = await api.postJson(
      "/api/library/query",
      {
        filterState: request.filterState,
        search: request.search,
        sortMode: request.sortMode,
        sortDescending: request.sortDescending,
        offset: request.offset,
        limit: request.limit
      },
      { signal: abort }
    );
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
    summary.value = snap.summary;
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
   * Nothing loads while the server fails the compatibility check or runs without a library, and the tab says why in
   * place of the grid: the compatibility message, or the server's message for its library state.
   */
  function blockedMessage(): string | null {
    if (store.compatibilityBlocked.peek()) {
      return store.compatibilityMessage.peek();
    }
    return store.noLibrary.peek() ? noLibraryText(store.libraryMessage.peek()) : null;
  }

  /**
   * While hidden, only a grid already shown is updated, and its layout waits until the tab shows. While shown, a
   * window without a result shows its message in place of the grid, and so does a server that failed the
   * compatibility check or runs without a library.
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

    const blockedBy = blockedMessage();
    if (blockedBy !== null) {
      summary.value = null;
      body.value = { kind: "message", message: { text: blockedBy, error: true, live: false } };
      return;
    }

    if (!ready) {
      summary.value = null;
      const phase = snap.phase === "error" ? "error" : snap.phase === "empty" ? "empty" : "loading";
      body.value = { kind: "message", message: libraryOverlayMessage(phase, snap.failureText, snap.errorStatus) };
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
    if (!serverReady || store.heldBack.peek()) {
      return Promise.resolve();
    }
    return session.resetQuery(store.appliedFilter.peek(), controls.peek());
  }

  function rememberSort(): void {
    const current = controls.peek();
    device.write(SORT_KEY, { mode: current.sortMode, descending: current.sortDescending } satisfies RememberedSort);
  }

  /**
   * Loads the source list into `store.sources`, which the Filters line counts and the kept-source notice names, and
   * returns it, or null when it fails, or "unauthorized" when the server answered 401, whose pairing prompt is the only
   * signal, so the caller logs no failure of its own. A load under way is shared rather than sent again.
   */
  function loadSources(): Promise<SourcesLoad> {
    sourcesLoad ??= (async () => {
      try {
        const sources = await api.getJson("/api/sources");
        const list: FilterSource[] = Array.isArray(sources) ? sources : [];
        store.sources.value = list;
        return list;
      } catch (error) {
        return error instanceof UnauthorizedError ? "unauthorized" : null;
      } finally {
        sourcesLoad = null;
      }
    })();
    return sourcesLoad;
  }

  /** Loads the sources for the Filters line, which counts them, when the applied filter chooses some. */
  async function loadSourcesForSummary(): Promise<void> {
    if (store.sources.peek() !== null || sourcesLoad || store.appliedFilter.peek().includedSourceIds.length === 0) {
      return;
    }
    if ((await loadSources()) === null) {
      // The Filters line counts the chosen sources without their total until a later load succeeds.
      void api.relayLog("warn", "library=filter-summary-sources-failed");
    }
  }

  /**
   * Names the folders of the sources a refresh kept, from the source list, loading it when it hasn't loaded or lacks
   * one of them. A folder named before, or a source the list doesn't have even then, is left out.
   */
  async function noticeKeptSources(keptSources: readonly RefreshKeptSource[]): Promise<void> {
    const pending = keptSources.filter((kept) => !unlistedKeptIds.has(kept.sourceId));
    if (pending.length === 0) {
      return;
    }
    const listed = (list: readonly FilterSource[] | null) =>
      pending.every((kept) => list?.some((source) => source.id === kept.sourceId));
    let sources = store.sources.peek();
    let loadedNow = false;
    if (!listed(sources)) {
      const loaded = await loadSources();
      if (Array.isArray(loaded)) {
        sources = loaded;
        loadedNow = true;
      } else if (loaded === null) {
        void api.relayLog("warn", "library=kept-sources-list-failed");
      }
    }
    const folders: KeptSourceFolder[] = [];
    for (const kept of pending) {
      const source = sources?.find((candidate) => candidate.id === kept.sourceId);
      if (!source) {
        // Source Access Policy can leave a source out of this session's list.
        if (loadedNow) {
          unlistedKeptIds.add(kept.sourceId);
        }
        continue;
      }
      const folder = source.rootPath || source.id;
      if (namedKeptFolders.has(folder)) {
        continue;
      }
      namedKeptFolders.add(folder);
      folders.push({ source, itemCount: kept.itemCount });
    }
    if (folders.length > 0) {
      void dialogs.notice(keptSourcesMessage(folders), KEPT_SOURCES_LOG_TEXT);
    }
  }

  function close(): void {
    open = false;
    session.setOverlayVisible(false);
  }

  /** The media type of the loaded tile with `itemId`, which a refusal's message names. */
  function tileMediaType(itemId: string): "video" | "photo" {
    return session.snapshot().items.find((item) => item.id === itemId)?.mediaType === "photo" ? "photo" : "video";
  }

  async function play(itemId: string): Promise<void> {
    const trimmedItemId = String(itemId || "").trim();
    if (!trimmedItemId) {
      void dialogs.notice("Playback unavailable: no library item was selected.");
      return;
    }

    const refusal = playRefusalNotice(store);
    if (refusal) {
      void dialogs.notice(refusal);
      return;
    }

    if (playInFlight) {
      return;
    }

    playInFlight = true;
    store.loading.hold("play");
    trace("info", "library-play-start");

    try {
      const result = await requestPlayItem(
        { apiBaseUrl },
        trimmedItemId,
        { clientId: store.identity.clientId, sessionId: store.identity.sessionId },
        api.request
      );

      if (!result.ok) {
        trace("warn", "library-play-failed", {
          statusCode: result.refusal.status,
          code: result.refusal.code || "none"
        });
        const { text, logText } = playRefusalFailure(result.refusal, tileMediaType(trimmedItemId));
        void dialogs.notice(text, logText);
        return;
      }

      const data = result.response;
      if (!data?.mediaUrl) {
        void dialogs.notice("Playback failed.");
        return;
      }

      store.pushHistory(data);
      void panel.closeIfOverlay();
      trace("info", "library-play-success");
      // The server recorded the play, and a file that can't play shows its message rather than being skipped.
      player.playCurrent({ origin: "library" });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        // The request asked for pairing, whose prompt is the only signal, and sent its line.
        return;
      }
      trace("warn", "library-play-error", { message: errorText(error) });
      noticeRequestFailure(dialogs, "Playback failed", error);
    } finally {
      playInFlight = false;
      // The media holds Loading… by now when the play went ahead, so the play and its media load are one loading period.
      store.loading.release("play");
    }
  }

  // A preset picked in the dropdown, or the applied preset's new filter from another device, starts the library over.
  const appliedFilterChanged = () => {
    void commitQuery();
    if (serverReady && !store.heldBack.peek()) {
      void loadSourcesForSummary();
    }
  };
  store.on("headerFilterChanged", appliedFilterChanged);
  store.on("appliedPresetFollowed", appliedFilterChanged);
  connection.on("serverReady", () => {
    serverReady = true;
    void session.ensureLoaded(store.appliedFilter.peek(), controls.peek());
    void loadSourcesForSummary();
  });
  // The player updates the playing item and its buttons first.
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
  connection.on("refreshKeptSources", (keptSources) => {
    keptSourcesQueue = keptSourcesQueue.then(() => noticeKeptSources(keptSources));
  });
  // The tab says why while the server fails the compatibility check or runs without a library, and shows the library
  // again once it can load, which `serverReady` then starts.
  const rerenderShown = () => {
    if (open) {
      renderWindow("keep");
    }
  };
  store.compatibilityBlocked.subscribe(rerenderShown);
  store.noLibrary.subscribe(rerenderShown);
  store.libraryMessage.subscribe(rerenderShown);
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
      if (store.heldBack.peek()) {
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
      // Before the server is ready, the first page waits for it, as `commitQuery` does.
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
