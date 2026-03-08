import { getClientId, getRefreshStatus, getSessionId, requeryAuthoritativeState } from "../api/coreApi";
import { buildEventsUrl, parseEventEnvelope } from "./eventEnvelope";
import { buildRefreshStatusMessage } from "./refreshStatusProjection";
import type { RuntimeConfig } from "../types/runtimeConfig";
import type { RefreshStatusChangedPayload, ResyncRequiredPayload } from "../types/serverContracts";

const RECONNECT_DELAY_MS = 1200;
const WATCHDOG_INTERVAL_MS = 5000;
const STALE_STREAM_MS = 30000;

export interface SseUiBindings {
  setConnectionStatus: (message: string) => void;
  setRefreshStatus: (message: string) => void;
}

export interface SseClient {
  connect: (reason: string) => void;
  stop: () => void;
}

interface EventSourceLike {
  onopen: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
  close: () => void;
}

interface SseClientDependencies {
  createEventSource?: (url: string) => EventSourceLike;
  getRefreshStatus?: typeof getRefreshStatus;
  requeryAuthoritativeState?: typeof requeryAuthoritativeState;
}

export function createSseClient(
  config: RuntimeConfig,
  ui: SseUiBindings,
  fetchImpl: typeof fetch = fetch,
  dependencies: SseClientDependencies = {}
): SseClient {
  const createEventSource =
    dependencies.createEventSource ??
    ((url: string): EventSourceLike => new EventSource(url, { withCredentials: true }));
  const getRefreshStatusFn = dependencies.getRefreshStatus ?? getRefreshStatus;
  const requeryAuthoritativeStateFn = dependencies.requeryAuthoritativeState ?? requeryAuthoritativeState;

  let source: EventSourceLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let lastEventTimestamp = 0;
  let lastRevision = 0;
  const clientId = getClientId();
  const sessionId = getSessionId();

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function startWatchdog(): void {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
    }

    watchdogTimer = setInterval(() => {
      if (!source) {
        return;
      }

      if (Date.now() - lastEventTimestamp > STALE_STREAM_MS) {
        ui.setConnectionStatus("SSE stale, reconnecting...");
        reconnect("watchdog");
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  function stopWatchdog(): void {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  async function syncRefreshStatus(): Promise<void> {
    try {
      const status = await getRefreshStatusFn(config, fetchImpl);
      ui.setRefreshStatus(buildRefreshStatusMessage(status));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown refresh sync error";
      ui.setRefreshStatus(`Refresh status sync failed: ${message}`);
    }
  }

  async function handleResyncRequired(payload: ResyncRequiredPayload): Promise<void> {
    ui.setConnectionStatus(
      `SSE resync requested (${payload.reason}, last=${payload.lastEventId}, current=${payload.currentRevision}).`
    );

    try {
      await requeryAuthoritativeStateFn(config, fetchImpl);
      await syncRefreshStatus();
      ui.setConnectionStatus("SSE resync completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown resync error";
      ui.setConnectionStatus(`SSE resync failed: ${message}`);
    }
  }

  function reconnect(reason: string): void {
    clearReconnectTimer();
    if (source) {
      source.close();
      source = null;
    }

    reconnectTimer = setTimeout(() => {
      connect(reason);
    }, RECONNECT_DELAY_MS);
  }

  function connect(reason: string): void {
    clearReconnectTimer();
    if (source) {
      source.close();
      source = null;
    }

    const url = buildEventsUrl(config.sseUrl, lastRevision, { clientId, sessionId });
    ui.setConnectionStatus(`Connecting SSE (${reason})...`);
    source = createEventSource(url);
    lastEventTimestamp = Date.now();
    startWatchdog();

    source.onopen = () => {
      ui.setConnectionStatus(`SSE connected (${reason}).`);
      lastEventTimestamp = Date.now();
      void syncRefreshStatus();
    };

    source.onerror = () => {
      ui.setConnectionStatus("SSE connection error; reconnecting...");
      reconnect("error");
    };

    source.addEventListener("refreshStatusChanged", (event) => {
      lastEventTimestamp = Date.now();
      try {
        const envelope = parseEventEnvelope<RefreshStatusChangedPayload>(event.data);
        lastRevision = Math.max(lastRevision, envelope.revision);
        ui.setRefreshStatus(buildRefreshStatusMessage(envelope.payload.snapshot));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid refresh event payload";
        ui.setRefreshStatus(`Refresh event parse failed: ${message}`);
      }
    });

    source.addEventListener("resyncRequired", (event) => {
      lastEventTimestamp = Date.now();
      try {
        const envelope = parseEventEnvelope<ResyncRequiredPayload>(event.data);
        lastRevision = Math.max(lastRevision, envelope.revision);
        void handleResyncRequired(envelope.payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid resync payload";
        ui.setConnectionStatus(`resyncRequired parse failed: ${message}`);
      }
    });
  }

  function stop(): void {
    clearReconnectTimer();
    stopWatchdog();
    if (source) {
      source.close();
      source = null;
    }
  }

  return {
    connect,
    stop
  };
}
