import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSseClient, nextEventRevision, SSE_RECONNECT_DELAY_MS } from "../events/sseClient";
import type { SseEventHandler } from "../events/sseClient";

class FakeEventSource {
  public onopen: ((ev: Event) => unknown) | null = null;
  public onerror: ((ev: Event) => unknown) | null = null;
  public closed = false;
  private handlers = new Map<string, (event: MessageEvent<string>) => void>();

  constructor(public readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.handlers.set(type, listener);
  }

  emit(eventType: string, revision: number, payload: unknown): void {
    this.handlers.get(eventType)?.({
      data: JSON.stringify({ revision, eventType, timestamp: "2026-10-04T00:00:00Z", payload })
    } as MessageEvent<string>);
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }

  close(): void {
    this.closed = true;
  }
}

interface RevisionCase {
  name: string;
  lastRevision: number | null;
  eventType: string;
  revision: number;
  expected: number;
}

const revisionCases = JSON.parse(
  readFileSync(new URL("../../../../../../shared/fixtures/event-revision.json", import.meta.url), "utf8")
) as RevisionCase[];

const EVENT_TYPES = ["itemStateChanged", "playbackRecorded", "itemTagsChanged", "refreshStatusChanged", "resyncRequired"];

function setup() {
  const sources: FakeEventSource[] = [];
  const received: Array<{ eventType: string; payload: unknown }> = [];
  const handlers: Record<string, SseEventHandler> = {};
  for (const eventType of EVENT_TYPES) {
    handlers[eventType] = (payload) => received.push({ eventType, payload });
  }
  const onOpen = vi.fn();
  const onError = vi.fn();
  const client = createSseClient({
    sseUrl: "http://localhost:51301/api/events",
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    handlers,
    onOpen,
    onError,
    createEventSource: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    }
  });
  return { client, sources, received, onOpen, onError, latest: () => sources[sources.length - 1] };
}

describe("sseClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the first stream with the client identity and no last event ID", () => {
    const { client, latest } = setup();
    client.connect();

    const url = new URL(latest().url);
    expect(url.searchParams.get("clientId")).toBe("client-1");
    expect(url.searchParams.get("sessionId")).toBe("session-1");
    expect(url.searchParams.get("clientType")).toBe("web");
    expect(url.searchParams.get("deviceName")).toBe("Web Browser");
    expect(url.searchParams.has("lastEventId")).toBe(false);
    client.stop();
  });

  it("passes every event type the WebUI handles to its handler", () => {
    const { client, latest, received } = setup();
    client.connect();
    EVENT_TYPES.forEach((eventType, index) => latest().emit(eventType, index + 1, { marker: eventType }));

    expect(received).toEqual(EVENT_TYPES.map((eventType) => ({ eventType, payload: { marker: eventType } })));
    client.stop();
  });

  it("reconnects after an error with the last event ID and applies the replayed events", () => {
    const { client, sources, latest, received, onError } = setup();
    client.connect();
    latest().emit("itemStateChanged", 41, { path: "a.mp4", isFavorite: true });
    latest().emit("playbackRecorded", 42, { path: "b.mp4", playCount: 3 });
    const first = latest();
    first.fail();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(first.closed).toBe(true);
    vi.advanceTimersByTime(SSE_RECONNECT_DELAY_MS);
    expect(sources).toHaveLength(2);
    expect(new URL(latest().url).searchParams.get("lastEventId")).toBe("42");

    latest().emit("itemTagsChanged", 43, { itemIds: ["c.mp4"], addedTags: ["Beach"], removedTags: [] });
    latest().emit("itemStateChanged", 44, { path: "a.mp4", isFavorite: false });
    expect(received.slice(2)).toEqual([
      { eventType: "itemTagsChanged", payload: { itemIds: ["c.mp4"], addedTags: ["Beach"], removedTags: [] } },
      { eventType: "itemStateChanged", payload: { path: "a.mp4", isFavorite: false } }
    ]);
    expect(client.lastRevision()).toBe(44);
    client.stop();
  });

  it("resumes from the resync revision after a server restart", () => {
    const { client, latest, received } = setup();
    client.connect();
    latest().emit("itemStateChanged", 500, { path: "a.mp4" });
    latest().fail();
    vi.advanceTimersByTime(SSE_RECONNECT_DELAY_MS);
    expect(new URL(latest().url).searchParams.get("lastEventId")).toBe("500");

    latest().emit("resyncRequired", 4, { reason: "revisionGap", lastEventId: 500, currentRevision: 3 });
    latest().emit("playbackRecorded", 5, { path: "b.mp4" });
    expect(received.map((entry) => entry.eventType)).toEqual(["itemStateChanged", "resyncRequired", "playbackRecorded"]);
    latest().fail();
    vi.advanceTimersByTime(SSE_RECONNECT_DELAY_MS);
    expect(new URL(latest().url).searchParams.get("lastEventId")).toBe("5");
    client.stop();
  });

  it("resumes from a quiet server's opening revision after a restart", () => {
    const { client, latest, received } = setup();
    client.connect();
    latest().emit("streamOpened", 0, { currentRevision: 0 });
    expect(client.lastRevision()).toBe(0);
    latest().fail();
    vi.advanceTimersByTime(SSE_RECONNECT_DELAY_MS);

    expect(new URL(latest().url).searchParams.get("lastEventId")).toBe("0");
    latest().emit("itemStateChanged", 1, { path: "a.mp4", isFavorite: true });
    expect(received).toEqual([{ eventType: "itemStateChanged", payload: { path: "a.mp4", isFavorite: true } }]);
    expect(client.lastRevision()).toBe(1);
    client.stop();
  });

  it("keeps an idle stream open", () => {
    const { client, sources } = setup();
    client.connect();
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(sources).toHaveLength(1);
    expect(sources[0].closed).toBe(false);
    client.stop();
  });

  it("does not reconnect after stop", () => {
    const { client, sources, latest } = setup();
    client.connect();
    latest().fail();
    client.stop();
    vi.advanceTimersByTime(SSE_RECONNECT_DELAY_MS * 5);

    expect(sources).toHaveLength(1);
  });

  it("ignores events from a stream it has replaced", () => {
    const { client, sources, received } = setup();
    client.connect();
    client.connect();
    sources[0].emit("itemStateChanged", 9, { path: "old.mp4" });
    sources[0].fail();
    vi.advanceTimersByTime(SSE_RECONNECT_DELAY_MS);

    expect(received).toEqual([]);
    expect(sources).toHaveLength(2);
    expect(client.lastRevision()).toBeNull();
    client.stop();
  });

  it.each(revisionCases.map((entry) => [entry.name, entry] as const))("matches the shared revision fixture: %s", (_name, entry) => {
    expect(nextEventRevision(entry.lastRevision, entry.eventType, entry.revision)).toBe(entry.expected);
  });
});
