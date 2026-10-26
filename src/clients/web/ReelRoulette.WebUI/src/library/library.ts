import { computed, effect, signal, untracked, type ReadonlySignal } from "@preact/signals";
import type { ControlAccess } from "../api/controlAccess";
import { requestPlayItem } from "../api/coreApi";
import { errorText, noticeRequestFailure, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { FilterSource } from "../filter/filterDialogModel";
import { filterSummaryParts } from "../filter/filterSummaryModel";
import { randomLineText, spreadCategories } from "../random/randomOptions";
import { failureLine, playbackTraceLine } from "../logging/relayLogLines";
import type { Notifications } from "../notifications/notifications";
import type { PanelHost } from "../panel/panelHost";
import type { Player } from "../playback/player";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import { isBoolean, type DeviceStore } from "../state/deviceStore";
import { heldBackText, playRefusalNotice } from "../state/lastingStates";
import type { ServerConnection } from "../state/serverConnection";
import type { TagCatalog } from "../tags/tagCatalog";
import type { RuntimeConfig } from "../types/runtimeConfig";
import type { RefreshKeptSource } from "../types/serverContracts";
import type { ContextMenu, MenuGroups } from "../ui/menuModel";
import type { WindowPoint } from "../ui/placement";
import { createBulkActions, summarizeLoaded, type BulkActions, type BulkSummary, type BulkTarget } from "./bulkActions";
import { KEPT_SOURCES_LOG_TEXT, keptSourcesMessage, type KeptSourceFolder } from "./keptSources";
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
  type LibraryGridCoverage,
  type LibraryGridOptions
} from "./libraryGridController";
import { DEFAULT_TARGET_ROW_HEIGHT, isTargetRowHeight } from "./libraryGridLayout";
import { libraryOverlayMessage, type LibraryOverlayMessage } from "./libraryOverlayModel";
import { playRefusalFailure } from "./libraryPlayModel";
import { parseItemSummary, parseLibraryIds, parseLibraryQueryPage } from "./libraryProjectionModel";
import {
  LIBRARY_QUERY_SEARCH_DEBOUNCE_MS,
  createLibraryQuerySession,
  type LibraryQueryRequest,
  type LibraryQuerySession,
  type LibraryQuerySessionSnapshot
} from "./libraryQuerySession";
import { createLibrarySelection, type LibrarySelection } from "./librarySelection";

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
const ROW_HEIGHT_KEY = "library.rowHeight";

/** The sort and its direction, as remembered across a page refresh. */
interface RememberedSort {
  mode: LibrarySortMode;
  descending: boolean;
}

function isRememberedSort(value: unknown): value is RememberedSort {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (LIBRARY_SORT_MODES as readonly unknown[]).includes(record.mode) && typeof record.descending === "boolean";
}

/** Select all's tooltip while it is disabled. */
export const ALL_SELECTED_REASON = "Everything is already selected";

/** How a tile was clicked: on its check icon, and with which keys held. */
export interface TileClick {
  onCheck: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** The source list as loaded, null when its load failed, or "unauthorized" when the server answered 401. */
type SourcesLoad = FilterSource[] | null | "unauthorized";

export type CreateLibraryGrid = (host: HTMLElement, options: Required<LibraryGridOptions>) => LibraryGridController;

/**
 * The Library tab's browse window, controls, Filters line, tile play, and selection. The first page loads once the
 * server is ready, and the window keeps its tiles and scroll position while the tab is hidden. The panel shows and
 * hides the tab. The tab remembers on this device whether its controls are collapsed, its sort and direction, and the
 * row height a zoom over the grid set. A refresh that keeps a source's items because its folder listed no media files
 * shows a notice naming the folder, once per folder for the page's life. Selection lasts while the tab is hidden, a
 * change to the search or the filter the grid shows ends it, and selected items that leave the results, which reloads
 * the window, leave it. The Selection actions menu and a tile's menu each show only the actions that apply to what
 * they act on, and one shows at a time.
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
  /** The random pick options as the Random line names them after its label, such as "Shuffle · Spread by folder". */
  readonly randomLine: ReadonlySignal<string>;
  /** The tab's count line, "{matching} / {total} shown", or null while it is hidden. */
  readonly summary: ReadonlySignal<string | null>;
  /** How many items the search and the filter match, while the window is ready, or null. */
  readonly matchCount: ReadonlySignal<number | null>;
  /** The sort direction button's label. It changes when a page in the new order arrives. */
  readonly directionLabel: ReadonlySignal<string>;
  readonly body: ReadonlySignal<LibraryBody>;
  /** The items picked in the grid, which the selection bar and the bulk actions work on. */
  readonly selection: LibrarySelection;
  /** As many items are selected as the search and the filter match, so Select all has nothing to add. */
  readonly allSelected: ReadonlySignal<boolean>;
  /** The library menus' actions, on the selected items or one tile's item. */
  readonly bulk: BulkActions;
  /** The Selection actions menu's items, as they were when it last opened. */
  readonly selectionMenuGroups: ReadonlySignal<MenuGroups>;

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
  /** Shows the Randomization tab, as the Random line does. */
  openRandomizationTab(): Promise<void>;
  /**
   * A click on a tile: on its check icon, with Shift, Ctrl, or Cmd held, or during selection, it picks the tile or takes
   * it out, Shift+click picking the range from the last tile chosen. Otherwise it plays the tile's item through the
   * server, closes the panel as the overlay, and hands the item to the player, resolving once the play ends. A play that
   * fails shows in the notice; one the server answers with 401 shows the pairing prompt.
   */
  clickTile(itemId: string, click: TileClick): Promise<void>;
  /** A long press on a tile picks it or takes it out, as a click during selection does. */
  longPressTile(itemId: string): void;
  /**
   * Picks every item the grid's search and filter match, loaded or not, from the server. A press while one is under way
   * does nothing, an answer that comes after selection ended is dropped, and a failure shows in the notice.
   */
  selectAll(): Promise<void>;
  /**
   * Selection actions: opens its menu, once the server has said what the selected items are when some aren't loaded,
   * or closes it, dropping a read under way.
   */
  toggleSelectionMenu(): Promise<void>;
  /**
   * A right-click on a tile with a mouse: opens a menu at `point` that acts on the selection when the tile is selected,
   * and otherwise on that tile alone, which shows a ring while the menu is open, so a right-click never changes a
   * selection. It closes when its tile leaves the grid, the tab hides, or a selection it acts on ends.
   */
  openTileMenu(itemId: string, point: WindowPoint): Promise<void>;
}

export interface LibraryOptions {
  config: RuntimeConfig;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
  player: Pick<Player, "playCurrent">;
  /**
   * The in-app dialogs, for a play that fails, a refresh that kept a source's items, and the bulk actions' confirmations
   * and failures.
   */
  dialogs: Pick<Dialogs, "notice" | "confirm">;
  /** The one-off messages, for a later page that fails to load and the bulk actions' popups. */
  notifications: Pick<Notifications, "notify">;
  /** Asks for the control token before the delete action, when the server wants it. */
  controlAccess: Pick<ControlAccess, "ensure">;
  /** Choosing a tile closes the panel as the overlay; beside the player it stays open. */
  panel: Pick<PanelHost, "closeIfOverlay" | "showTab">;
  /** Remembers whether the controls are collapsed, the sort and direction, and the grid's row height. */
  device: DeviceStore;
  /** The tag catalog the tabs share, whose categories the Random line names under By category. */
  tagCatalog: Pick<TagCatalog, "catalog" | "ensureLoaded">;
  /** The app's context menu, which a tile's menu opens in. */
  contextMenu: ContextMenu;
  /**
   * Edit tags… in the menus: points the tag editor at the items, after it asks to discard changes held for others, and
   * says whether it did, so the Tags tab shows.
   */
  editTags: (target: BulkTarget) => Promise<boolean>;
  /** Defaults to the grid controller. */
  createGrid?: CreateLibraryGrid;
  /** Defaults to `requestAnimationFrame`. */
  requestFrame?: (callback: () => void) => void;
}

export function createLibrary(options: LibraryOptions): Library {
  const { store, api, connection, player, panel, device, dialogs, notifications, controlAccess, tagCatalog, contextMenu } = options;
  const apiBaseUrl = String(options.config.apiBaseUrl || "").replace(/\/+$/, "");
  const createGrid: CreateLibraryGrid =
    options.createGrid ?? ((host, gridOptions) => createLibraryGridController(host, apiBaseUrl, gridOptions));
  const requestFrame = options.requestFrame ?? ((callback: () => void) => void requestAnimationFrame(() => callback()));

  // The search text isn't remembered.
  const rememberedSort = device.read<RememberedSort | null>(SORT_KEY, null, isRememberedSort);
  const initialControls: LibraryBrowseControls = rememberedSort
    ? { ...createDefaultBrowseControls(), sortMode: rememberedSort.mode, sortDescending: rememberedSort.descending }
    : createDefaultBrowseControls();
  const controls = signal(initialControls);
  const controlsCollapsed = signal(device.read(CONTROLS_COLLAPSED_KEY, false, isBoolean));
  /** The row height the grid's rows aim for, which a zoom over the grid sets and each grid created starts from. */
  let rowHeight = device.read(ROW_HEIGHT_KEY, DEFAULT_TARGET_ROW_HEIGHT, isTargetRowHeight);
  const filterSummary = computed(() => filterSummaryParts(store.appliedFilter.value, store.sources.value));
  const randomLine = computed(() => randomLineText(store.randomOptions.value, spreadCategories(tagCatalog.catalog.value)));
  const summary = signal<string | null>(null);
  /** How many items the search and the filter match, while the window is ready. */
  const matchCount = signal<number | null>(null);
  const directionLabel = signal(getSortDirectionLabel(initialControls.sortMode, initialControls.sortDescending));
  const body = signal<LibraryBody>({ kind: "blank" });
  const selection = createLibrarySelection();
  const allSelected = computed(() => matchCount.value !== null && selection.count.value === matchCount.value);
  const bulk = createBulkActions({
    store,
    api,
    dialogs,
    notifications,
    controlAccess,
    selection,
    async editTags(target) {
      if (await options.editTags(target)) {
        await panel.showTab("tags");
      }
    }
  });
  /** Select all's request under way, which a selection ending aborts. */
  let selectAllRequest: AbortController | null = null;
  /** The check of the selected items under way, which a later check or a selection ending aborts. */
  let selectionCheck: AbortController | null = null;
  const selectionMenuGroups = signal<MenuGroups>([]);
  /** The tile whose menu is open, and what the menu acts on, or null. */
  let tileMenu: { itemId: string; target: BulkTarget } | null = null;
  /**
   * The read of what a menu about to open acts on, and which menu it is for, which a newer open, a close, or a change to
   * the selection drops.
   */
  let menuRead: { menu: "selection" | "tile"; request: AbortController } | null = null;

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
    closeTileMenuIfGone();
    // Every change that can take an item out of the results reloads the window, so a reload checks the selection.
    if (event.reloaded) {
      void checkSelection();
    }
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
    matchCount.value = snap.totalCount;
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

    // Nothing loads while the server fails the compatibility check or runs without a library, and the tab says why in
    // place of the grid. Read untracked, since a subscription can render the window.
    const blockedBy = untracked(() => heldBackText(store));
    if (blockedBy !== null) {
      summary.value = null;
      matchCount.value = null;
      body.value = { kind: "message", message: { text: blockedBy, error: true } };
      return;
    }

    if (!ready) {
      summary.value = null;
      matchCount.value = null;
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
    // A new search or filter would leave picked items the grid no longer shows, so selection ends; a new sort keeps it.
    if (session.changesMatch(store.appliedFilter.peek(), controls.peek())) {
      selection.clear();
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
   * Loads the tag catalog for the Random line, which names the chosen categories under By category, when none has
   * loaded since the page started or the last resync.
   */
  function loadCatalogForRandomLine(): void {
    const randomOptions = store.randomOptions.peek();
    const namesCategories = randomOptions.spreadByTags && randomOptions.tagSpread === "byCategory" && randomOptions.spreadCategoryIds.length > 0;
    if (!serverReady || store.heldBack.peek() || store.pairingRequired.peek() || tagCatalog.catalog.peek() || !namesCategories) {
      return;
    }
    tagCatalog.ensureLoaded().catch(() => {
      // The Random line reads "tags" in place of the categories' names until a later load succeeds.
      void api.relayLog("warn", "library=random-line-catalog-failed");
    });
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

  // The menus close with the tab, so none stays open where nobody can see it.
  function close(): void {
    open = false;
    session.setOverlayVisible(false);
    dropMenuRead();
    selection.closeMenu();
    if (tileMenu) {
      contextMenu.close();
    }
  }

  /** The media type of the loaded tile with `itemId`, which a refusal's message names. */
  function tileMediaType(itemId: string): "video" | "photo" {
    return session.snapshot().items.find((item) => item.id === itemId)?.mediaType === "photo" ? "photo" : "video";
  }

  async function play(itemId: string): Promise<void> {
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
        itemId,
        { clientId: store.identity.clientId, sessionId: store.identity.sessionId },
        api.request
      );

      if (!result.ok) {
        trace("warn", "library-play-failed", {
          statusCode: result.refusal.status,
          code: result.refusal.code || "none"
        });
        const { text, logText } = playRefusalFailure(result.refusal, tileMediaType(itemId));
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

  async function clickTile(itemId: string, click: TileClick): Promise<void> {
    if (click.shiftKey) {
      selection.addRange(itemId, session.snapshot().items.map((item) => item.id));
    } else if (click.onCheck || click.ctrlKey || click.metaKey || selection.active.peek()) {
      selection.toggle(itemId);
    } else {
      await play(itemId);
    }
  }

  async function selectAll(): Promise<void> {
    if (selectAllRequest || !selection.active.peek()) {
      return;
    }
    const request = new AbortController();
    selectAllRequest = request;
    try {
      const raw = await api.postJson("/api/library/query-ids", session.matchQuery(), { signal: request.signal });
      if (request.signal.aborted) {
        return;
      }
      selection.addAll(parseLibraryIds(raw));
    } catch (error) {
      if (!request.signal.aborted) {
        noticeRequestFailure(dialogs, "Select all failed", error);
      }
    } finally {
      if (selectAllRequest === request) {
        selectAllRequest = null;
      }
    }
  }

  /**
   * Takes out of the selection the selected items that no longer match the window's search and filter, loaded or not,
   * so an action never reaches an item the grid doesn't show. Items selected while the answer is on its way stay. A
   * failure leaves the selection as it was, for the next reload to check, and only logs, since nobody asked for it.
   */
  async function checkSelection(): Promise<void> {
    if (!selection.active.peek()) {
      return;
    }
    selectionCheck?.abort();
    const request = new AbortController();
    selectionCheck = request;
    const sent = selection.ids();
    try {
      const raw = await api.postJson(
        "/api/library/query-ids",
        { ...session.matchQuery(), itemIds: sent },
        { signal: request.signal }
      );
      if (request.signal.aborted) {
        return;
      }
      const matching = new Set(parseLibraryIds(raw));
      selection.remove(sent.filter((id) => !matching.has(id)));
    } catch (error) {
      // A 401 shows only the pairing prompt, which the request has asked for, and sent its line.
      if (!request.signal.aborted && !(error instanceof UnauthorizedError)) {
        void api.relayLog("warn", failureLine("library=selection-check-failed", error));
      }
    } finally {
      if (selectionCheck === request) {
        selectionCheck = null;
      }
    }
  }

  function dropMenuRead(): void {
    menuRead?.request.abort();
    menuRead = null;
  }

  /**
   * What the items of `ids` are, for a menu about to open: from the loaded tiles when every one is loaded, and otherwise
   * from the server. Null when the read failed, which only logs, so the menu shows every add and remove item, and
   * "unauthorized" for a 401, whose pairing prompt is the only signal, so no menu opens.
   */
  async function readMenuSummary(ids: string[], abort: AbortSignal): Promise<BulkSummary | null | "unauthorized"> {
    const loaded = summarizeLoaded(ids, session.snapshot().items);
    if (loaded) {
      return loaded;
    }
    try {
      return parseItemSummary(await api.postJson("/api/library/item-summary", { itemIds: ids }, { signal: abort }));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return "unauthorized";
      }
      if (!abort.aborted) {
        void api.relayLog("warn", failureLine("library=item-summary-failed", error));
      }
      return null;
    }
  }

  /**
   * The items of `menu` about to open on `target`, once what it acts on is known, so they never appear or vanish under
   * the pointer; null when a newer open, a close, a change to the selection, or a 401 dropped the menu.
   */
  async function menuGroupsFor(menu: "selection" | "tile", target: BulkTarget): Promise<MenuGroups | null> {
    dropMenuRead();
    const read = { menu, request: new AbortController() };
    menuRead = read;
    try {
      const summary = await readMenuSummary(bulk.targetIds(target), read.request.signal);
      return read.request.signal.aborted || summary === "unauthorized" ? null : bulk.menuGroups(target, summary);
    } finally {
      if (menuRead === read) {
        menuRead = null;
      }
    }
  }

  // A press while its own read is under way closes it, as a press on the open menu does; a tile's menu still reading
  // gives way to it.
  async function toggleSelectionMenu(): Promise<void> {
    if (selection.menuOpen.peek() || menuRead?.menu === "selection") {
      dropMenuRead();
      selection.closeMenu();
      return;
    }
    const groups = await menuGroupsFor("selection", { kind: "selection" });
    if (groups) {
      selectionMenuGroups.value = groups;
      selection.openMenu();
    }
  }

  /** The tile that shows the ring: the one whose menu acts on it alone. */
  function ringedItemId(): string | null {
    return tileMenu?.target.kind === "item" ? tileMenu.itemId : null;
  }

  async function openTileMenu(itemId: string, point: WindowPoint): Promise<void> {
    const target: BulkTarget = selection.active.peek() && selection.has(itemId) ? { kind: "selection" } : { kind: "item", itemId };
    const groups = await menuGroupsFor("tile", target);
    if (!groups) {
      return;
    }
    const shown = { itemId, target };
    contextMenu.open({
      point,
      groups,
      onClose() {
        if (tileMenu === shown) {
          tileMenu = null;
          grid?.setMenuItemId(null);
        }
      }
    });
    tileMenu = shown;
    grid?.setMenuItemId(ringedItemId());
  }

  /** A tile's menu closes when its tile leaves the grid: its item leaves the loaded window, or a message replaces it. */
  function closeTileMenuIfGone(): void {
    const shown = tileMenu;
    if (shown && (body.peek().kind !== "grid" || !session.snapshot().items.some((item) => item.id === shown.itemId))) {
      contextMenu.close();
    }
  }

  // Select all's answer would start selection over, and a check's would take items out of a new one, so a selection
  // ending drops them, and a menu about to open on it or open on it closes.
  selection.active.subscribe((active) => {
    if (active) {
      return;
    }
    for (const request of [selectAllRequest, selectionCheck]) {
      request?.abort();
    }
    selectAllRequest = null;
    selectionCheck = null;
    dropMenuRead();
    if (tileMenu?.target.kind === "selection") {
      contextMenu.close();
    }
  });
  // A menu about to open shows what the selection was when it opened, so a change to the selection drops it.
  selection.version.subscribe(() => dropMenuRead());
  // One menu shows at a time: a context menu opening closes the Selection actions menu, and that menu opening closes the
  // context menu.
  contextMenu.isOpen.subscribe((isOpen) => {
    if (isOpen) {
      dropMenuRead();
      selection.closeMenu();
    }
  });
  selection.menuOpen.subscribe((isOpen) => {
    if (isOpen) {
      contextMenu.close();
    }
  });
  // The tiles shown change their marks in place.
  effect(() => {
    selection.version.value;
    grid?.setSelection(selection.has);
  });

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
    loadCatalogForRandomLine();
  });
  // A resync drops the catalog, so the Random line loads it again.
  tagCatalog.catalog.subscribe(() => loadCatalogForRandomLine());
  // The player updates the playing item and its buttons first.
  connection.on("itemStateChanged", (payload) => {
    if (!payload?.itemId) return;
    void session.applyFavorites([payload]);
  });
  // A batch reloads the window at most once, and otherwise patches each loaded tile it names.
  connection.on("bulkItemStateChanged", (payload) => {
    void session.applyFavorites(payload?.items ?? []);
  });
  connection.on("playbackRecorded", (payload) => {
    void session.applyPlayback(payload);
  });
  // Under Only unrated, a minimum rating, or the rating sort, a rating change can take a tile out, bring an item in, or
  // move one.
  connection.on("itemRatingChanged", (payload) => {
    if (!payload?.itemId) return;
    void session.applyRatings([payload]);
  });
  connection.on("bulkItemRatingChanged", (payload) => {
    void session.applyRatings(payload?.items ?? []);
  });
  // A finished refresh can add items and rewrite thumbnails, so the loaded window reloads once per run.
  connection.on("refreshCompleted", () => {
    void session.reloadLoaded();
  });
  // Removed items leave the window, which reloads once for them, and the selection.
  connection.on("itemsRemoved", (payload) => {
    selection.remove(payload?.itemIds ?? []);
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
      closeTileMenuIfGone();
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
    randomLine,
    summary,
    matchCount,
    directionLabel,
    body,
    selection,
    allSelected,
    bulk,
    selectionMenuGroups,

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
      const created = createGrid(host, {
        onCoverage,
        rowHeight,
        onRowHeightChange(height) {
          rowHeight = height;
          device.write(ROW_HEIGHT_KEY, height);
        }
      });
      grid = created;
      created.setPlayingItemId(store.current.peek()?.itemId ?? null);
      created.setSelection(selection.has);
      created.setMenuItemId(ringedItemId());
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

    openRandomizationTab() {
      return panel.showTab("randomization");
    },

    clickTile,
    longPressTile: (itemId) => selection.toggle(itemId),
    selectAll,
    toggleSelectionMenu,
    openTileMenu
  };
}
