import { batch } from "@preact/signals";
import {
  buildRefreshStatusMessage,
  coerceRefreshSnapshot,
  newRefreshCompletionRunId,
  refreshProgress,
  settledKeptSources
} from "../events/refreshStatusProjection";
import { errorText, sendRequest, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import { createSseClient, type EventSourceLike, type SseClient } from "../events/sseClient";
import type { RefreshKeptSource } from "../types/serverContracts";
import type { AppApi } from "./appApi";
import { PRESET_MENU_BLOCKED, PRESET_MENU_LOAD_FAILED, PRESET_MENU_NO_LIBRARY, type AppStore } from "./appStore";
import { serverCompatibilityError } from "./serverCompatibility";

/** A version check that gets no answer in this time counts as not reaching the server. */
export const VERSION_CHECK_TIMEOUT_MS = 10_000;

/**
 * While the event stream is open and the last version check didn't reach the server, it checks again after this time,
 * since nothing else asks for a check while the stream stays open.
 */
export const VERSION_RECHECK_MS = 3_000;

/** What the last version check found. */
type VersionCheckResult = "none" | "reached" | "unreachable" | "unauthorized" | "incompatible";

/** Server events and connection changes that the screens act on. */
export interface ServerConnectionEvents {
  /**
   * The server passed the version check and has a library, so the library can load. Sent when the server goes from
   * not ready to ready, so a later check that finds it still ready sends nothing, while one that finds no library, or
   * is answered with 401, makes it not ready again until a check finds it ready.
   */
  serverReady: () => void;
  itemStateChanged: (payload: any) => void;
  playbackRecorded: (payload: any) => void;
  itemTagsChanged: (payload: any) => void;
  /** The tag catalog changed, with its categories and tags as they now are. */
  tagCatalogChanged: (payload: any) => void;
  /** A refresh run finished. Sent once per run. */
  refreshCompleted: () => void;
  /**
   * A refresh kept the library's items from these sources, because their folder listed no media files, by source id.
   * Sent once the run's source stage has finished, or the run has stopped, and again only when a run's list changes.
   */
  refreshKeptSources: (keptSources: RefreshKeptSource[]) => void;
  /** The server could not replay missed events. Presets have started reloading, and the refresh progress cleared. */
  resyncRequired: (payload: any) => void;
}

export interface ServerConnection {
  /**
   * Checks the server version, opens the event stream, and pairs with the config's token. The version is checked again
   * each time the event stream opens, or fails while the server doesn't ask for pairing, and every few seconds while the
   * stream is open and the last check didn't reach the server. The presets load once a check finds the server ready.
   */
  start(): void;
  /** Closes the event stream and removes the reconnect listeners. */
  stop(): void;
  loadPresets(): Promise<void>;
  /**
   * Pairs with a token, then checks the version, which loads the presets when it finds the server newly ready, and
   * reconnects the event stream. A pairing that fails, one that couldn't reach the server among them, or that the
   * server's compatibility check blocks, shows in a notice.
   */
  pair(token: string): Promise<void>;
  on<K extends keyof ServerConnectionEvents>(event: K, listener: ServerConnectionEvents[K]): void;
}

export interface ServerConnectionOptions {
  sseUrl: string;
  pairToken?: string;
  store: AppStore;
  api: AppApi;
  /** The in-app dialogs, for a pairing that fails or that the server's compatibility check blocks. */
  dialogs: Pick<Dialogs, "notice">;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
  /** Defaults to the browser's `EventSource`. */
  createEventSource?: (url: string) => EventSourceLike;
  /** The page whose focus, visibility, and network changes reconnect the event stream. */
  window?: Window;
}

export function createServerConnection(options: ServerConnectionOptions): ServerConnection {
  const { store, api, dialogs } = options;
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const pageWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const listeners: { [K in keyof ServerConnectionEvents]: ServerConnectionEvents[K][] } = {
    serverReady: [],
    itemStateChanged: [],
    playbackRecorded: [],
    itemTagsChanged: [],
    tagCatalogChanged: [],
    refreshCompleted: [],
    refreshKeptSources: [],
    resyncRequired: []
  };
  let eventStream: SseClient | null = null;
  let lastAppliedRefreshRunId: string | null = null;
  /** The run and source ids last sent as kept, since every later status of a run repeats them. */
  let lastKeptSourcesKey: string | null = null;
  /** The server has passed the version check and has a library. */
  let serverReady = false;
  /** The version checks under way, one at a time, until none is asked for. */
  let versionChecks: Promise<void> | null = null;
  /** An open or failure of the event stream asked for one more check while one ran. */
  let checkAgain = false;
  let lastCheck: VersionCheckResult = "none";
  /** The event stream has failed since it last opened. */
  let streamFailed = false;
  /** The event stream is open. */
  let streamOpen = false;
  /** The next check while the stream is open and the last check didn't reach the server. */
  let recheckTimer: ReturnType<typeof setTimeout> | null = null;

  function emit<K extends keyof ServerConnectionEvents>(event: K, ...args: Parameters<ServerConnectionEvents[K]>): void {
    for (const listener of listeners[event]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  /**
   * The server can't be reached: the last version check didn't reach it, or the event stream failed and hasn't opened
   * again, unless the last check found no library or asked for pairing, since the server then refuses the stream. A
   * stream that fails before any check has answered waits for it, since the library state isn't known yet. Never while
   * the server fails the compatibility check, whose stream is stopped.
   */
  function updateReconnecting(): void {
    store.reconnecting.value =
      !store.compatibilityBlocked.peek() &&
      (lastCheck === "unreachable" ||
        (streamFailed && lastCheck !== "none" && lastCheck !== "unauthorized" && store.libraryState.peek() === "ready"));
  }

  function cancelRecheck(): void {
    if (recheckTimer !== null) {
      clearTimeout(recheckTimer);
      recheckTimer = null;
    }
  }

  /**
   * While the stream is open and the last check didn't reach the server, checks again after `VERSION_RECHECK_MS`, and
   * so on until one does. A stream that is down checks on each of its own retries instead.
   */
  function scheduleRecheck(): void {
    cancelRecheck();
    if (!streamOpen || lastCheck !== "unreachable") {
      return;
    }
    recheckTimer = setTimeout(() => {
      recheckTimer = null;
      void checkVersion();
    }, VERSION_RECHECK_MS);
  }

  function blockForCompatibility(message: string): void {
    lastCheck = "incompatible";
    serverReady = false;
    store.compatibilityMessage.value = message;
    store.compatibilityBlocked.value = true;
    // Nothing a preset picks can load, so the preset dropdown says why in place of the presets.
    store.showPresetMenuMessage(PRESET_MENU_BLOCKED);
    eventStream?.stop();
    streamOpen = false;
    cancelRecheck();
    updateReconnecting();
    // The player's indicator and the Library tab show it; the log keeps the full message.
    store.relayStatus(message);
  }

  /** Shows why no presets load in place of them, or returns false when they can load. */
  function presetsHeldBack(): boolean {
    if (!store.heldBack.peek()) {
      return false;
    }
    store.showPresetMenuMessage(store.compatibilityBlocked.peek() ? PRESET_MENU_BLOCKED : PRESET_MENU_NO_LIBRARY);
    return true;
  }

  async function loadPresets(): Promise<void> {
    if (presetsHeldBack()) {
      return;
    }

    try {
      const presets = await api.getJson("/api/presets");
      store.presets.value = Array.isArray(presets) ? presets : [];
      // The server failed the compatibility check, or turned out to have no library, while they loaded; the check
      // that finds it ready again loads them again.
      if (presetsHeldBack()) {
        return;
      }
      store.presetsLoaded();
    } catch (error) {
      // A 401 shows only the pairing prompt, which the request has asked for, and sent its line: the preset dropdown
      // keeps what it shows.
      if (error instanceof UnauthorizedError) {
        return;
      }
      store.showPresetMenuMessage(PRESET_MENU_LOAD_FAILED);
      store.setStatus(`Error loading presets: ${errorText(error)}`);
    }
  }

  /** Reads `/api/version`, failing after `VERSION_CHECK_TIMEOUT_MS` without an answer. */
  async function requestVersion(): Promise<any> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("The version check got no answer."));
      }, VERSION_CHECK_TIMEOUT_MS);
    });
    try {
      return await Promise.race([api.getJson("/api/version", { signal: controller.signal }), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One version check, which updates the compatibility, library state, and readiness it finds. */
  async function checkVersionOnce(): Promise<void> {
    let version: any;
    try {
      version = await requestVersion();
    } catch (error) {
      // A 401 shows only the pairing prompt, which the request has asked for: the server answered, so it is reachable.
      // It isn't ready until the device pairs, so the check after pairing loads again what the 401s refused.
      // Otherwise the server wasn't reached, and the library state stays as last known.
      if (error instanceof UnauthorizedError) {
        lastCheck = "unauthorized";
        serverReady = false;
      } else {
        lastCheck = "unreachable";
      }
      updateReconnecting();
      return;
    }
    const compatibilityError = serverCompatibilityError(version);
    if (compatibilityError) {
      blockForCompatibility(compatibilityError);
      return;
    }
    // An older server reports no library state, and always has a library.
    const reported = typeof version?.libraryState === "string" ? version.libraryState.trim() : "";
    const libraryState = reported || "ready";
    const libraryReady = libraryState === "ready";
    lastCheck = "reached";
    batch(() => {
      store.compatibilityBlocked.value = false;
      store.compatibilityMessage.value = null;
      store.pairingRequired.value = false;
      store.libraryState.value = libraryState;
      store.libraryMessage.value = libraryReady ? null : typeof version?.libraryMessage === "string" ? version.libraryMessage : null;
      updateReconnecting();
    });
    if (!libraryReady) {
      serverReady = false;
      store.showPresetMenuMessage(PRESET_MENU_NO_LIBRARY);
      return;
    }
    if (!serverReady) {
      serverReady = true;
      store.setStatus(`Ready (API ${version.apiVersion || "unknown"})`);
      emit("serverReady");
      void loadPresets();
    }
  }

  /**
   * Checks the server version, one check at a time: asked while one runs, it runs one more after it. Resolves once
   * no more is asked for, having asked for the next one when the last didn't reach the server while the stream is open.
   * Nothing is checked once the server fails the compatibility check.
   */
  function checkVersion(): Promise<void> {
    if (store.compatibilityBlocked.peek()) {
      return Promise.resolve();
    }
    if (versionChecks) {
      checkAgain = true;
      return versionChecks;
    }
    versionChecks = (async () => {
      try {
        do {
          checkAgain = false;
          await checkVersionOnce();
        } while (checkAgain && !store.compatibilityBlocked.peek());
      } finally {
        versionChecks = null;
      }
      scheduleRecheck();
    })();
    return versionChecks;
  }

  function createEventStream(): SseClient {
    return createSseClient({
      sseUrl: options.sseUrl,
      identity: store.identity,
      createEventSource: options.createEventSource,
      onOpen() {
        streamFailed = false;
        streamOpen = true;
        updateReconnecting();
        store.setStatus("SSE connected");
        // The server may have come back, restarted, or found its library since the last check, so it checks again.
        void checkVersion();
      },
      onError() {
        streamFailed = true;
        streamOpen = false;
        cancelRecheck();
        updateReconnecting();
        // A server without a library refuses the stream, so the check tells that apart from one that can't be reached.
        // A server that asks for pairing refuses it too, and pairing checks the version itself.
        if (!store.pairingRequired.peek()) {
          void checkVersion();
        }
      },
      handlers: {
        itemStateChanged(payload) {
          emit("itemStateChanged", payload);
        },
        playbackRecorded(payload) {
          emit("playbackRecorded", payload);
        },
        itemTagsChanged(payload) {
          emit("itemTagsChanged", payload);
        },
        tagCatalogChanged(payload) {
          emit("tagCatalogChanged", payload);
        },
        refreshStatusChanged(payload) {
          const raw = payload?.snapshot || payload?.Snapshot;
          if (!raw) return;
          const snapshot = coerceRefreshSnapshot(raw);
          // A running refresh shows on the player's indicator; the status line takes how it ended.
          const progress = refreshProgress(snapshot);
          store.refreshProgress.value = progress;
          if (!progress) {
            const message = buildRefreshStatusMessage(snapshot);
            // The server's refresh error text can name a file or folder, so the log leaves it out.
            store.setStatus(message, message.startsWith("Core refresh failed:") ? "Core refresh failed" : message);
          }
          // A finished refresh can add items and rewrite thumbnails, so the loaded window reloads once per run.
          const completedRunId = newRefreshCompletionRunId(snapshot, lastAppliedRefreshRunId);
          if (completedRunId) {
            lastAppliedRefreshRunId = completedRunId;
            emit("refreshCompleted");
          }
          const keptSources = settledKeptSources(snapshot);
          const keptKey = JSON.stringify([snapshot.runId ?? null, keptSources.map((kept) => kept.sourceId)]);
          if (keptSources.length > 0 && keptKey !== lastKeptSourcesKey) {
            lastKeptSourcesKey = keptKey;
            emit("refreshKeptSources", keptSources);
          }
        },
        resyncRequired(payload) {
          // A refresh that ended while events were missed would otherwise stay showing.
          store.refreshProgress.value = null;
          void loadPresets();
          emit("resyncRequired", payload);
        }
      }
    });
  }

  function connectEvents(): void {
    if (store.compatibilityBlocked.peek()) {
      return;
    }

    eventStream ??= createEventStream();
    eventStream.connect();
  }

  async function pair(token: string): Promise<void> {
    if (store.compatibilityBlocked.peek()) {
      void dialogs.notice("Pairing blocked by server compatibility check.");
      return;
    }

    // Pair is disabled while the token is empty, so this sends nothing and says nothing.
    const trimmed = String(token || "").trim();
    if (!trimmed) {
      return;
    }
    // Not through `api.request`, since a 401 here is a wrong token, which says so rather than asking for pairing.
    let response: Response;
    try {
      response = await sendRequest(send, api.url("/api/pair"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed })
      });
    } catch (error) {
      void dialogs.notice(`Pairing failed: ${errorText(error)}`);
      return;
    }
    if (!response.ok) {
      void dialogs.notice("Pairing failed.");
      return;
    }
    // The stream's failures were the server refusing a device that wasn't paired, so they don't show Reconnecting… once
    // the pairing prompt hides.
    streamFailed = false;
    updateReconnecting();
    store.pairingRequired.value = false;
    store.setStatus("Paired.");
    await checkVersion();
    if (lastCheck !== "reached") {
      return;
    }
    connectEvents();
  }

  function onVisibilityChange(): void {
    if (pageWindow?.document.visibilityState === "visible") connectEvents();
  }

  function addReconnectListeners(): void {
    pageWindow?.document.addEventListener("visibilitychange", onVisibilityChange);
    pageWindow?.addEventListener("focus", connectEvents);
    pageWindow?.addEventListener("pageshow", connectEvents);
    pageWindow?.addEventListener("online", connectEvents);
  }

  function removeReconnectListeners(): void {
    pageWindow?.document.removeEventListener("visibilitychange", onVisibilityChange);
    pageWindow?.removeEventListener("focus", connectEvents);
    pageWindow?.removeEventListener("pageshow", connectEvents);
    pageWindow?.removeEventListener("online", connectEvents);
  }

  return {
    start() {
      addReconnectListeners();
      void checkVersion();
      connectEvents();
      store.setStatus("Ready");
      if (options.pairToken) {
        void pair(options.pairToken);
      }
    },
    stop() {
      removeReconnectListeners();
      eventStream?.stop();
      streamOpen = false;
      cancelRecheck();
      store.reconnecting.value = false;
    },
    loadPresets,
    pair,
    on(event, listener) {
      listeners[event].push(listener);
    }
  };
}
