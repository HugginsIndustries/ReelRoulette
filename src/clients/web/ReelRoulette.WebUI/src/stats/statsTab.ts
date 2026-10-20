import { batch, computed, signal, type ReadonlySignal } from "@preact/signals";
import { errorText, HttpStatusError, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import { parseLibraryItem, type LibraryProjectionItem } from "../library/libraryProjectionModel";
import type { Notifications } from "../notifications/notifications";
import type { LoudnessNormalization } from "../playback/loudnessNormalization";
import { basenameFromPath } from "../playback/nowPlaying";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import { noLibraryText } from "../state/lastingStates";
import type { ServerConnection } from "../state/serverConnection";
import type { TagCatalog } from "../tags/tagCatalog";
import { createCoalescedRefresh } from "./coalescedRefresh";
import { createFileLocation, SHOW_IN_FILE_MANAGER_CAPABILITY } from "./fileLocation";
import { createLastPlayedBeforePlay } from "./lastPlayed";
import { adjustmentText, fileRows, libraryCards, orderTags, type LibraryStats, type StatsLibraryView, type StatsView } from "./statsModel";

/**
 * The panel's Stats tab: the playing file's stats and the library's. It loads only while it shows: showing it loads
 * once, and while it shows, a new playing item and the server's events load again, a burst of them once. A failed load
 * keeps what the tab showed; with nothing loaded yet, the Library section says why. Nothing loads while the server
 * fails the compatibility check, runs without a library, or asks for pairing. Beside the file's path, Show in File
 * Manager opens the server machine's file manager at it where the server offers that, and Copy Path copies it
 * everywhere else.
 */
export interface StatsTab {
  readonly view: ReadonlySignal<StatsView>;
  /** The tab shows: it loads. */
  open(): void;
  /** The tab hides: nothing loads until it shows again. */
  close(): void;
  /** Opens the server machine's file manager at the file the tab shows. */
  showInFileManager(): Promise<void>;
  /** Copies the path of the file the tab shows, giving focus back to `button`, which copied it. */
  copyPath(button: HTMLElement): Promise<void>;
}

export interface StatsTabOptions {
  store: AppStore;
  api: Pick<AppApi, "getJson" | "postJson" | "url" | "request">;
  connection: Pick<ServerConnection, "on">;
  /** The tag catalog the Tags and Filter tabs share, which orders the file's tags. */
  tagCatalog: TagCatalog;
  /** What loudness normalization applies to the playing file, which the Adjustment row follows. */
  normalization: Pick<LoudnessNormalization, "adjustment">;
  /** Enhanced audio, without which nothing is applied. */
  enhanced: ReadonlySignal<boolean>;
  /** The notice Show in File Manager's and Copy Path's failures show. */
  dialogs: Pick<Dialogs, "notice">;
  /** The popups that say a path was shown or copied. */
  notifications: Pick<Notifications, "notify">;
}

interface LoadedItem {
  itemId: string;
  item: LibraryProjectionItem | null;
}

export function createStatsTab(options: StatsTabOptions): StatsTab {
  const { store, api, connection, tagCatalog, normalization, enhanced, dialogs, notifications } = options;
  const fileLocation = createFileLocation({ api, dialogs, notifications });
  const isOpen = signal(false);
  const stats = signal<LibraryStats | null>(null);
  const loadedItem = signal<LoadedItem | null>(null);
  /** Why the last load failed, while the library has never loaded. */
  const failure = signal<string | null>(null);
  const lastPlayed = createLastPlayedBeforePlay();
  /** Changes with what the playback events said about the time before this play. */
  const lastPlayedChanged = signal(0);

  /** The server's own message while it fails the compatibility check or runs without a library. */
  function blockedMessage(): string | null {
    if (store.compatibilityBlocked.value) {
      return store.compatibilityMessage.value;
    }
    return store.noLibrary.value ? noLibraryText(store.libraryMessage.value) : null;
  }

  const view = computed<StatsView>(() => {
    const playing = store.current.value;
    const blocked = blockedMessage();
    const unavailable = blocked !== null || store.pairingRequired.value;
    // Read so the view follows what the playback events said, which the tracker keeps outside signals.
    void lastPlayedChanged.value;
    let file: StatsView["file"] = null;
    if (playing) {
      const loaded = loadedItem.value;
      const item = !unavailable && loaded?.itemId === playing.itemId ? loaded.item : null;
      file = {
        itemId: playing.itemId,
        name: basenameFromPath(playing.displayName || playing.id),
        path: playing.id,
        canShowInFileManager: !!playing.itemId && store.serverCapabilities.value.includes(SHOW_IN_FILE_MANAGER_CAPABILITY),
        rows: item
          ? fileRows(item, lastPlayed.shownFor(item.lastPlayedUtcMs), Date.now(), adjustmentText(normalization.adjustment.value, enhanced.value))
          : null,
        tags: item ? orderTags(item.tags, tagCatalog.catalog.value) : []
      };
    }
    let library: StatsLibraryView = { kind: "none" };
    const loadedStats = stats.value;
    if (store.pairingRequired.value) {
      library = { kind: "none" };
    } else if (blocked !== null) {
      library = { kind: "message", text: blocked, error: true };
    } else if (loadedStats) {
      library = { kind: "cards", cards: libraryCards(loadedStats) };
    } else if (failure.value !== null) {
      library = { kind: "message", text: failure.value, error: true };
    }
    return { file, library };
  });

  /**
   * The playing item's read, or null once the item has left the catalog, as a refresh drops a file gone from disk and
   * a duplicate's delete its file, so the file shows only its name and path and the library still loads.
   */
  async function readItem(itemId: string): Promise<unknown> {
    try {
      return await api.postJson("/api/library/item", { id: itemId });
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async function load(): Promise<void> {
    if (!isOpen.peek() || store.heldBack.peek() || store.pairingRequired.peek()) {
      return;
    }
    const itemId = store.current.peek()?.itemId || null;
    try {
      const [loadedStats, rawItem] = await Promise.all([
        api.getJson("/api/library/stats") as Promise<LibraryStats>,
        itemId ? readItem(itemId) : Promise.resolve(null),
        // The tags show by name without the catalog, so a catalog that fails to load doesn't fail the tab.
        tagCatalog.ensureLoaded().catch(() => {})
      ]);
      batch(() => {
        stats.value = loadedStats;
        loadedItem.value = itemId ? { itemId, item: parseLibraryItem(rawItem) } : null;
        failure.value = null;
      });
    } catch (error) {
      // A 401's pairing prompt is the only thing to act on.
      if (error instanceof UnauthorizedError) {
        return;
      }
      const text = `Stats load failed: ${errorText(error)}`;
      failure.value = text;
      store.relayStatus(text);
    }
  }

  // A request while the tab is hidden comes to nothing, since a load checks that the tab shows.
  const refresh = createCoalescedRefresh(load);
  function request(): void {
    void refresh.request();
  }

  store.current.subscribe((playing) => {
    lastPlayed.started(playing?.itemId);
    lastPlayedChanged.value += 1;
    request();
  });
  connection.on("playbackRecorded", (payload) => {
    const previous = payload && typeof payload === "object" && "previousLastPlayedUtc" in payload ? payload.previousLastPlayedUtc : undefined;
    lastPlayed.recorded(payload?.itemId, previous);
    lastPlayedChanged.value += 1;
    request();
  });
  connection.on("itemStateChanged", request);
  connection.on("itemTagsChanged", request);
  connection.on("tagCatalogChanged", request);
  connection.on("refreshCompleted", request);
  connection.on("resyncRequired", request);
  connection.on("serverReady", request);
  store.pairingRequired.subscribe((required) => {
    if (!required) {
      request();
    }
  });

  return {
    view,
    open() {
      isOpen.value = true;
      request();
    },
    close() {
      isOpen.value = false;
    },
    async showInFileManager() {
      const file = view.peek().file;
      if (file?.canShowInFileManager) {
        await fileLocation.showInFileManager(file.itemId, file.name);
      }
    },
    async copyPath(button) {
      const file = view.peek().file;
      if (file) {
        await fileLocation.copyPath(file.path, file.name, button);
      }
    }
  };
}
