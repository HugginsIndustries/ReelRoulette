import { buildEventsUrl, parseEventEnvelope } from "./eventEnvelope";
import type { ServerEventEnvelope } from "../types/serverContracts";

export const SSE_RECONNECT_DELAY_MS = 1000;

export interface SseIdentity {
  clientId: string;
  sessionId: string;
  clientType: string;
  deviceName: string;
}

export type SseEventHandler = (payload: any, envelope: ServerEventEnvelope<unknown>) => void;

export interface EventSourceLike {
  onopen: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
  close: () => void;
}

export interface SseClientOptions {
  sseUrl: string;
  identity: SseIdentity;
  handlers: Record<string, SseEventHandler>;
  onOpen?: () => void;
  onError?: () => void;
  createEventSource?: (url: string) => EventSourceLike;
  reconnectDelayMs?: number;
}

export interface SseClient {
  /** Opens a new stream that resumes after the last revision received. */
  connect: () => void;
  stop: () => void;
  /** Null until the first event, including `streamOpened`, arrives. */
  lastRevision: () => number | null;
}

/**
 * The revision to resume from. A resync takes its own revision, which can be lower after a server restart.
 * `streamOpened` gives a client with no revision the server's revision, even 0, and never moves one it holds.
 * Locked to shared/fixtures/event-revision.json.
 */
export function nextEventRevision(lastRevision: number | null, eventType: string, revision: number): number {
  if (eventType === "resyncRequired" || lastRevision == null) {
    return revision;
  }
  if (eventType === "streamOpened") {
    return lastRevision;
  }
  return Math.max(lastRevision, revision);
}

/**
 * The WebUI's one event stream. It reconnects after an error with the last event ID, so the server
 * replays the events published in between or sends `resyncRequired`. The server's `streamOpened` gives
 * it a revision before any other event, so it can resume even when nothing else arrived. An idle stream stays open.
 */
export function createSseClient(options: SseClientOptions): SseClient {
  const createEventSource =
    options.createEventSource ??
    ((url: string): EventSourceLike => new EventSource(url, { withCredentials: true }));
  const reconnectDelayMs = options.reconnectDelayMs ?? SSE_RECONNECT_DELAY_MS;

  let source: EventSourceLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRevision: number | null = null;

  function closeSource(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (source) {
      try {
        source.close();
      } catch {
        // ignored
      }
      source = null;
    }
  }

  function connect(): void {
    closeSource();
    const url = buildEventsUrl(options.sseUrl, lastRevision, options.identity);
    const opened = createEventSource(url);
    source = opened;

    opened.onopen = () => {
      options.onOpen?.();
    };

    opened.onerror = () => {
      if (source !== opened) {
        return;
      }
      options.onError?.();
      closeSource();
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
    };

    const handlers: Record<string, SseEventHandler | undefined> = { streamOpened: undefined, ...options.handlers };
    for (const [eventType, handler] of Object.entries(handlers)) {
      opened.addEventListener(eventType, (event) => {
        if (source !== opened) {
          return;
        }
        let envelope: ServerEventEnvelope<unknown>;
        try {
          envelope = parseEventEnvelope<unknown>(event.data);
        } catch {
          return;
        }
        lastRevision = nextEventRevision(lastRevision, envelope.eventType, envelope.revision);
        if (envelope.payload == null || !handler) {
          return;
        }
        handler(envelope.payload, envelope);
      });
    }
  }

  return {
    connect,
    stop: closeSource,
    lastRevision: () => lastRevision
  };
}
