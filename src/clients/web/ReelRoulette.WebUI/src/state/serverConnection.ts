import { batch } from "@preact/signals";
import {
  coerceRefreshSnapshot,
  newRefreshCompletionRunId,
  refreshOutcome,
  refreshProgress,
  settledKeptSources,
  type RefreshSnapshotInput
} from "../events/refreshStatusProjection";
import { errorText, sendRequest, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import { findPresetById } from "../filter/filterStateModel";
import { presetChanges, presetPopups, type PresetEventRecord } from "../filter/presetEvents";
import { createSseClient, type EventSourceLike, type SseClient } from "../events/sseClient";
import type { Notifications } from "../notifications/notifications";
import { createCoalescedRefresh } from "../stats/coalescedRefresh";
import type { components } from "../types/openapi.generated";
import type { RefreshKeptSource } from "../types/serverContracts";
import type { AppApi } from "./appApi";
import { PRESET_MENU_BLOCKED, PRESET_MENU_LOAD_FAILED, PRESET_MENU_NO_LIBRARY, type ApiPreset, type AppStore } from "./appStore";
import { serverCapabilitiesOf, serverCompatibilityError, serverVersionOf } from "./serverCompatibility";

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
  /** A source was enabled or disabled, which changes the sources the Filter tab lists. */
  sourceStateChanged: (payload: any) => void;
  /** A refresh run finished. Sent once per run. */
  refreshCompleted: () => void;
  /**
   * A refresh kept the library's items from these sources, because their folder listed no media files, by source id.
   * Sent once the run's source stage has finished, or the run has stopped, and again only when a run's list changes.
   */
  refreshKeptSources: (keptSources: RefreshKeptSource[]) => void;
  /**
   * The server could not replay missed events. The refresh progress has cleared, and the presets reload shortly, as for
   * a preset event, sending `presetsReloaded` once they have.
   */
  resyncRequired: (payload: any) => void;
  /**
   * The presets reloaded for a burst of preset events or a resync, and the store took them, the applied preset's new
   * filter included when the store followed it.
   */
  presetsReloaded: () => void;
  /** The connection stopped, as when the page closes, so nothing waiting to load again should go on. */
  stopped: () => void;
}

export interface ServerConnection {
  /**
   * Checks the server version, opens the event stream, and pairs with the config's token, which pops nothing up. The
   * version is checked again each time the event stream opens, or fails while the server doesn't ask for pairing, and
   * every few seconds while the stream is open and the last check didn't reach the server. The presets load once a
   * check finds the server ready, and again once for each burst of preset events or resyncs.
   */
  start(): void;
  /** Closes the event stream and removes the reconnect listeners. */
  stop(): void;
  /** Loads the saved presets and rebuilds the preset dropdown, and says whether they loaded. */
  loadPresets(): Promise<boolean>;
  /**
   * Pairs with the header's token, saying so in a popup, then checks the version, which loads the presets when it finds
   * the server newly ready, and reconnects the event stream. A pairing that fails, one that couldn't reach the server
   * among them, or that the server's compatibility check blocks, shows in a notice.
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
  /** The one-off messages: Paired., Reconnected., how a library refresh ended, and preset changes from another device. */
  notifications: Pick<Notifications, "notify">;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
  /** Defaults to the browser's `EventSource`. */
  createEventSource?: (url: string) => EventSourceLike;
  /** The page whose focus, visibility, and network changes reconnect the event stream. */
  window?: Window;
}

export function createServerConnection(options: ServerConnectionOptions): ServerConnection {
  const { store, api, dialogs, notifications } = options;
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const pageWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const listeners: { [K in keyof ServerConnectionEvents]: ServerConnectionEvents[K][] } = {
    serverReady: [],
    itemStateChanged: [],
    playbackRecorded: [],
    itemTagsChanged: [],
    tagCatalogChanged: [],
    sourceStateChanged: [],
    refreshCompleted: [],
    refreshKeptSources: [],
    resyncRequired: [],
    presetsReloaded: [],
    stopped: []
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
  /** The presets the preset events since the last reload named, by id, each as the page held it when its first arrived. */
  let presetEvents = new Map<string, PresetEventRecord>();
  /** A resync asked for the next reload. */
  let resyncAsked = false;
  /** Reloads the presets once for a burst of preset events and resyncs. */
  const presetReloads = createCoalescedRefresh(reloadPresetsForEvents);

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
    const wasReconnecting = store.reconnecting.peek();
    store.reconnecting.value =
      !store.compatibilityBlocked.peek() &&
      (lastCheck === "unreachable" ||
        (streamFailed && lastCheck !== "none" && lastCheck !== "unauthorized" && store.libraryState.peek() === "ready"));
    // Reconnecting… showed, and has ended. `stop()` ends it without reconnecting, so it says nothing.
    if (wasReconnecting && !store.reconnecting.peek()) {
      notifications.notify({ kind: "connection", text: "Reconnected.", key: "connection" });
    }
  }

  /**
   * How a refresh that isn't running ended: finished, with its summary, or failed, a warning that stays until closed.
   * A cancelled run says nothing, and only relays.
   */
  function showRefreshOutcome(snapshot: RefreshSnapshotInput): void {
    const outcome = refreshOutcome(snapshot);
    if (outcome.result === "finished") {
      const summary = outcome.segments.join(" · ");
      notifications.notify({
        kind: "refresh",
        text: "Library refresh finished",
        detail: summary,
        key: "refresh",
        logText: `Library refresh finished: ${summary}`
      });
    } else if (outcome.result === "failed") {
      // The server's refresh error text can name a file or folder, so it goes only in the second line, which the log
      // leaves out.
      notifications.notify({ kind: "refresh", text: "Library refresh failed", detail: outcome.error, key: "refresh", warning: true });
    } else {
      store.relayStatus("Core refresh idle.");
    }
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

  /** The store takes loaded presets and rebuilds the preset dropdown. */
  function takeLoadedPresets(presets: ApiPreset[]): void {
    store.presets.value = presets;
    store.presetsLoaded();
  }

  /** Loads the saved presets, which `take` gives the store, and says whether they loaded. */
  async function loadPresets(take: (presets: ApiPreset[]) => void = takeLoadedPresets): Promise<boolean> {
    if (presetsHeldBack()) {
      return false;
    }

    try {
      const presets = await api.getJson("/api/presets");
      const list: ApiPreset[] = Array.isArray(presets) ? presets : [];
      // The server failed the compatibility check, or turned out to have no library, while they loaded; the check
      // that finds it ready again loads them again.
      if (store.heldBack.peek()) {
        store.presets.value = list;
        presetsHeldBack();
        return false;
      }
      take(list);
      return true;
    } catch (error) {
      // A 401 shows only the pairing prompt, which the request has asked for, and sent its line: the preset dropdown
      // keeps what it shows.
      if (error instanceof UnauthorizedError) {
        return false;
      }
      store.showPresetMenuMessage(PRESET_MENU_LOAD_FAILED);
      // The preset dropdown shows it in place, so it only relays.
      store.relayStatus(`Error loading presets: ${errorText(error)}`);
      return false;
    }
  }

  /**
   * Records a preset event for the next reload, which it asks for. The preset is kept as the page holds it now, since
   * another load, such as the Filter tab's, can land before the reload and hide the change. A preset named by several
   * events in a burst keeps its first record, and counts as another device's when any of them came from one. An event
   * without a client id counts as another device's.
   */
  function recordPresetEvent(payload: Partial<components["schemas"]["PresetCatalogChangedPayload"]>): void {
    const id = typeof payload.presetId === "string" ? payload.presetId : null;
    if (id !== null) {
      const anotherDevice = !payload.clientId || payload.clientId !== store.identity.clientId;
      const recorded = presetEvents.get(id);
      if (recorded) {
        recorded.anotherDevice ||= anotherDevice;
      } else {
        presetEvents.set(id, { before: findPresetById(store.presets.peek(), id) ?? null, anotherDevice });
      }
    }
    // A reorder names no preset, and needs the reload all the same.
    void presetReloads.request();
  }

  /**
   * Reloads the presets for the preset events and resyncs recorded since the last reload, keeping those that arrive
   * meanwhile for the next. The store follows the active preset when another device changed its filter while it applied
   * unchanged; tabs in one browser share a client id, so they follow none of each other's changes. A resync, which can't
   * tell which device changed which preset, follows it the same way, and shows only the active preset's own popup.
   * Otherwise another device's changes pop up. A load that fails drops what it took.
   */
  async function reloadPresetsForEvents(): Promise<void> {
    const records = presetEvents;
    presetEvents = new Map();
    const resync = resyncAsked;
    resyncAsked = false;
    const activeId = store.activePresetId.peek();
    if (resync && activeId !== null) {
      const recorded = records.get(activeId);
      records.set(activeId, { before: recorded ? recorded.before : findPresetById(store.presets.peek(), activeId) ?? null, anotherDevice: true });
    }
    const active = activeId === null ? undefined : records.get(activeId);
    let followed = false;
    const loaded = await loadPresets((presets) => {
      followed = store.presetsReloaded(presets, active?.anotherDevice ? active.before : null);
    });
    if (!loaded) {
      return;
    }
    for (const popup of presetPopups(presetChanges(records, store.presets.peek()), activeId, followed, resync)) {
      notifications.notify(popup);
    }
    emit("presetsReloaded");
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
    // Before the compatibility check, so Diagnostics shows the version of a server that fails it.
    batch(() => {
      store.serverVersion.value = serverVersionOf(version);
      store.serverCapabilities.value = serverCapabilitiesOf(version);
    });
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
      store.relayStatus(`Ready (API ${version.apiVersion || "unknown"})`);
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
        // The normal state shows nothing; Reconnected. pops up when Reconnecting… ends, here when only the stream had
        // failed, or once a check reaches the server.
        store.relayStatus("SSE connected");
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
        sourceStateChanged(payload) {
          emit("sourceStateChanged", payload);
        },
        presetCatalogChanged(payload) {
          recordPresetEvent(payload);
        },
        refreshStatusChanged(payload) {
          const raw = payload?.snapshot || payload?.Snapshot;
          if (!raw) return;
          const snapshot = coerceRefreshSnapshot(raw);
          // A running refresh shows on the player's indicator; how it ended pops up.
          const progress = refreshProgress(snapshot);
          store.refreshProgress.value = progress;
          if (!progress) {
            showRefreshOutcome(snapshot);
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
          // Presets changed while events were missed reload as for a preset event.
          resyncAsked = true;
          void presetReloads.request();
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

  /**
   * The header's Pair pops up "Paired.". Pairing on start with the config's token, which the server gives only a
   * device it already accepts, isn't the user's action, so it only relays it.
   */
  async function pair(token: string, fromPairButton: boolean): Promise<void> {
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
    if (fromPairButton) {
      notifications.notify({ kind: "actions", text: "Paired.", key: "pair" });
    } else {
      store.relayStatus("Paired.");
    }
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
      store.relayStatus("Ready");
      if (options.pairToken) {
        void pair(options.pairToken, false);
      }
    },
    stop() {
      removeReconnectListeners();
      eventStream?.stop();
      streamOpen = false;
      cancelRecheck();
      store.reconnecting.value = false;
      emit("stopped");
    },
    loadPresets: () => loadPresets(),
    pair: (token) => pair(token, true),
    on(event, listener) {
      listeners[event].push(listener);
    }
  };
}
