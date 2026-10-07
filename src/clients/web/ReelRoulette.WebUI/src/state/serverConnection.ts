import {
  buildRefreshStatusMessage,
  coerceRefreshSnapshot,
  newRefreshCompletionRunId
} from "../events/refreshStatusProjection";
import { createSseClient, type EventSourceLike, type SseClient } from "../events/sseClient";
import type { AppApi } from "./appApi";
import { PRESET_MENU_BLOCKED, PRESET_MENU_LOAD_FAILED, type AppStore } from "./appStore";
import { serverCompatibilityError } from "./serverCompatibility";

/** Server events and connection changes that screens still in `app.js` act on. */
export interface ServerConnectionEvents {
  /** The server passed the version check, so the library can load. */
  serverReady: () => void;
  itemStateChanged: (payload: any) => void;
  playbackRecorded: (payload: any) => void;
  itemTagsChanged: (payload: any) => void;
  /** A refresh run finished. Sent once per run. */
  refreshCompleted: () => void;
  /** The server could not replay missed events. Presets have started reloading. */
  resyncRequired: (payload: any) => void;
}

export interface ServerConnection {
  /** Loads presets, checks the server version, opens the event stream, and pairs with the config's token. */
  start(): void;
  /** Closes the event stream and removes the reconnect listeners. */
  stop(): void;
  loadPresets(): Promise<void>;
  /** Pairs with a token, then checks the version, reloads presets, and reconnects the event stream. */
  pair(token: string): Promise<void>;
  on<K extends keyof ServerConnectionEvents>(event: K, listener: ServerConnectionEvents[K]): void;
}

export interface ServerConnectionOptions {
  sseUrl: string;
  pairToken?: string;
  store: AppStore;
  api: AppApi;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
  /** Defaults to the browser's `EventSource`. */
  createEventSource?: (url: string) => EventSourceLike;
  /** The page whose focus, visibility, and network changes reconnect the event stream. */
  window?: Window;
}

export function createServerConnection(options: ServerConnectionOptions): ServerConnection {
  const { store, api } = options;
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const pageWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const listeners: { [K in keyof ServerConnectionEvents]: ServerConnectionEvents[K][] } = {
    serverReady: [],
    itemStateChanged: [],
    playbackRecorded: [],
    itemTagsChanged: [],
    refreshCompleted: [],
    resyncRequired: []
  };
  let eventStream: SseClient | null = null;
  let lastAppliedRefreshRunId: string | null = null;

  function emit<K extends keyof ServerConnectionEvents>(event: K, ...args: Parameters<ServerConnectionEvents[K]>): void {
    for (const listener of listeners[event]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  function blockForCompatibility(message: string): void {
    store.compatibilityBlocked.value = true;
    eventStream?.stop();
    store.setStatus(message);
  }

  async function loadPresets(): Promise<void> {
    if (store.compatibilityBlocked.peek()) {
      store.showPresetMenuMessage(PRESET_MENU_BLOCKED);
      return;
    }

    try {
      const presets = await api.getJson("/api/presets");
      store.presets.value = Array.isArray(presets) ? presets : [];
      store.syncHeaderPresets();
    } catch (error) {
      store.showPresetMenuMessage(PRESET_MENU_LOAD_FAILED);
      store.setStatus(`Error loading presets: ${(error as Error)?.message || error}`);
    }
  }

  async function loadVersion(): Promise<boolean> {
    try {
      const version = await api.getJson("/api/version");
      const compatibilityError = serverCompatibilityError(version);
      if (compatibilityError) {
        blockForCompatibility(compatibilityError);
        return false;
      }
      store.compatibilityBlocked.value = false;
      store.pairingRequired.value = false;
      store.setStatus(`Ready (API ${version.apiVersion || "unknown"})`);
      emit("serverReady");
      return true;
    } catch {
      store.setStatus("Ready (API offline)");
      return false;
    }
  }

  function createEventStream(): SseClient {
    return createSseClient({
      sseUrl: options.sseUrl,
      identity: store.identity,
      createEventSource: options.createEventSource,
      onOpen() {
        store.setStatus("SSE connected");
      },
      onError() {
        store.setStatus("SSE reconnecting...");
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
        refreshStatusChanged(payload) {
          const raw = payload?.snapshot || payload?.Snapshot;
          if (!raw) return;
          const snapshot = coerceRefreshSnapshot(raw);
          const message = buildRefreshStatusMessage(snapshot);
          // The server's refresh error text can name a file or folder, so the log leaves it out.
          store.setStatus(message, message.startsWith("Core refresh failed:") ? "Core refresh failed" : message);
          // A finished refresh can add items and rewrite thumbnails, so the loaded window reloads once per run.
          const completedRunId = newRefreshCompletionRunId(snapshot, lastAppliedRefreshRunId);
          if (completedRunId) {
            lastAppliedRefreshRunId = completedRunId;
            emit("refreshCompleted");
          }
        },
        resyncRequired(payload) {
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
      store.setStatus("Pairing blocked by server compatibility check.");
      return;
    }

    const trimmed = String(token || "").trim();
    if (!trimmed) {
      store.setStatus("Pair token required.");
      return;
    }
    const response = await send(api.url("/api/pair"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: trimmed })
    });
    if (!response.ok) {
      store.setStatus("Pairing failed.");
      return;
    }
    store.pairingRequired.value = false;
    store.setStatus("Paired.");
    const versionOk = await loadVersion();
    if (!versionOk) {
      return;
    }
    await loadPresets();
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
      void loadPresets();
      void loadVersion();
      connectEvents();
      store.setStatus("Ready");
      if (options.pairToken) {
        void pair(options.pairToken);
      }
    },
    stop() {
      removeReconnectListeners();
      eventStream?.stop();
    },
    loadPresets,
    pair,
    on(event, listener) {
      listeners[event].push(listener);
    }
  };
}
