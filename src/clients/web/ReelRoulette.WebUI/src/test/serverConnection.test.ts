import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRefreshStatusMessage } from "../events/refreshStatusProjection";
import { createAppApi } from "../state/appApi";
import { createAppStore } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { createPlayerIndicator } from "../state/lastingStates";
import { createServerConnection, VERSION_CHECK_TIMEOUT_MS, VERSION_RECHECK_MS } from "../state/serverConnection";

const COMPATIBLE_VERSION = {
  apiVersion: "1",
  capabilities: [
    "auth.sessionCookie",
    "identity.sessionId",
    "events.refreshStatusChanged",
    "events.resyncRequired",
    "api.random.filterState",
    "api.presets.match"
  ]
};

class FakeSource {
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  closed = false;
  private readonly handlers = new Map<string, (event: MessageEvent<string>) => void>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.handlers.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(eventType: string, revision: number, payload: unknown): void {
    this.handlers.get(eventType)?.({ data: JSON.stringify({ revision, eventType, payload }) } as MessageEvent<string>);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Route = (init?: RequestInit) => Response | Promise<Response>;

/** A reply the test answers later, for a request the page is waiting on. */
function deferredReply() {
  const answers: Array<(response: Response) => void> = [];
  return {
    reply: (() => new Promise<Response>((resolve) => answers.push(resolve))) as Route,
    pending: () => answers.length,
    answer(response: Response) {
      answers.shift()!(response);
    }
  };
}

const NO_LIBRARY_MESSAGE = "The library was made by a newer version of ReelRoulette.";

function setup(routes: Record<string, Route> = {}, pairToken?: string) {
  const requests: string[] = [];
  const replies: Record<string, Route> = {
    "GET /api/version": () => json(COMPATIBLE_VERSION),
    "GET /api/presets": () => json([{ id: "p1", name: "Favorites", filterState: { favoritesOnly: true } }]),
    "POST /api/logs/client": () => new Response(null, { status: 204 }),
    ...routes
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method || "GET"} ${new URL(String(input)).pathname}`;
    requests.push(key);
    return (await replies[key]?.(init)) ?? new Response("{}", { status: 404 });
  }) as typeof fetch;
  const sources: FakeSource[] = [];
  const pageWindow = Object.assign(new EventTarget(), {
    document: Object.assign(new EventTarget(), { visibilityState: "visible" })
  });
  const api = createAppApi("http://localhost:51301", {
    fetch: fetchImpl,
    onUnauthorized: () => {
      store.pairingRequired.value = true;
    }
  });
  const statuses: string[] = [];
  const relayed: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message)
  });
  const setStatus = store.setStatus;
  store.setStatus = (message, logText) => {
    statuses.push(message);
    setStatus(message, logText);
  };
  const notices: string[] = [];
  const dialogs = {
    async notice(message: string) {
      notices.push(message);
    }
  };
  const connection = createServerConnection({
    sseUrl: "http://localhost:51301/api/events",
    pairToken,
    store,
    api,
    dialogs,
    fetch: fetchImpl,
    createEventSource: (url) => {
      const source = new FakeSource(url);
      sources.push(source);
      return source;
    },
    window: pageWindow as unknown as Window
  });
  const count = (request: string) => requests.filter((made) => made === request).length;
  return { store, connection, requests, sources, statuses, notices, relayed, pageWindow, count };
}

afterEach(() => {
  vi.useRealTimers();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe("createServerConnection", () => {
  it("checks the version, opens the event stream, and once the server is ready tells listeners and loads presets", async () => {
    const { store, connection, requests, sources, statuses } = setup();
    const ready = vi.fn();
    connection.on("serverReady", ready);

    connection.start();
    expect(statuses).toEqual(["Ready"]);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toContain("clientId=client-1");
    await settle();

    // The presets wait for the check, since a server that fails it, or has no library, can't give them.
    expect(requests.filter((request) => request !== "POST /api/logs/client")).toEqual(["GET /api/version", "GET /api/presets"]);
    expect(statuses).toEqual(["Ready", "Ready (API 1)"]);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Favorites"]);
  });

  it("passes item, playback, tag, and tag catalog events on, and a finished refresh once per run", async () => {
    const { connection, sources } = setup();
    const received: Array<[string, unknown]> = [];
    connection.on("itemStateChanged", (payload) => received.push(["itemStateChanged", payload]));
    connection.on("playbackRecorded", (payload) => received.push(["playbackRecorded", payload]));
    connection.on("itemTagsChanged", (payload) => received.push(["itemTagsChanged", payload]));
    connection.on("tagCatalogChanged", (payload) => received.push(["tagCatalogChanged", payload]));
    connection.on("refreshCompleted", () => received.push(["refreshCompleted", null]));
    connection.start();
    await settle();

    const stream = sources[0]!;
    stream.emit("itemStateChanged", 1, { itemId: "a" });
    stream.emit("playbackRecorded", 2, { itemId: "b" });
    stream.emit("itemTagsChanged", 3, { resolvedItemIds: ["c"] });
    stream.emit("tagCatalogChanged", 4, { reason: "deleteTag", categories: [], tags: [] });
    const finished = { snapshot: { isRunning: false, runId: "run-1", completedUtc: "2026-10-07T00:00:00Z", stages: [] } };
    stream.emit("refreshStatusChanged", 5, finished);
    stream.emit("refreshStatusChanged", 6, finished);

    expect(received).toEqual([
      ["itemStateChanged", { itemId: "a" }],
      ["playbackRecorded", { itemId: "b" }],
      ["itemTagsChanged", { resolvedItemIds: ["c"] }],
      ["tagCatalogChanged", { reason: "deleteTag", categories: [], tags: [] }],
      ["refreshCompleted", null]
    ]);
  });

  it("passes on the sources a refresh kept once its source stage has finished, and again only when a run's list changes", async () => {
    const { connection, sources } = setup();
    const kept: unknown[] = [];
    connection.on("refreshKeptSources", (keptSources) => kept.push(keptSources));
    connection.start();
    await settle();

    const stream = sources[0]!;
    const status = (runId: string, isRunning: boolean, sourceDone: boolean, keptSources: unknown[]) => ({
      snapshot: {
        isRunning,
        runId,
        currentStage: sourceDone ? "durationScan" : "sourceRefresh",
        stages: [{ stage: "sourceRefresh", percent: sourceDone ? 100 : 50, message: "", isComplete: sourceDone }],
        keptSources
      }
    });
    const first = { sourceId: "src-a", itemCount: 2 };
    const second = { SourceId: "src-b", ItemCount: 5 };
    stream.emit("refreshStatusChanged", 1, status("run-1", true, false, [first]));
    stream.emit("refreshStatusChanged", 2, status("run-1", true, false, [first, second]));
    expect(kept).toEqual([]);

    stream.emit("refreshStatusChanged", 3, status("run-1", true, true, [first, second]));
    stream.emit("refreshStatusChanged", 4, status("run-1", false, true, [first, second]));
    stream.emit("refreshStatusChanged", 5, status("run-2", true, true, []));
    stream.emit("refreshStatusChanged", 6, status("run-2", false, true, [first]));
    expect(kept).toEqual([
      [{ sourceId: "src-a", itemCount: 2 }, { sourceId: "src-b", itemCount: 5 }],
      [{ sourceId: "src-a", itemCount: 2 }]
    ]);
  });

  it("reloads presets before passing a resync on", async () => {
    const { connection, requests, sources } = setup();
    const resync = vi.fn(() => {
      expect(requests.filter((request) => request === "GET /api/presets")).toHaveLength(2);
    });
    connection.on("resyncRequired", resync);
    connection.start();
    await settle();

    sources[0]!.emit("resyncRequired", 9, { reason: "gap" });
    expect(resync).toHaveBeenCalledWith({ reason: "gap" });
  });

  it("blocks an incompatible server: stops the stream, and preset loads and pairing say so, off the status line", async () => {
    const { store, connection, sources, statuses, notices, requests, relayed } = setup({
      "GET /api/version": () => json({ ...COMPATIBLE_VERSION, apiVersion: "7" })
    });
    connection.start();
    await settle();

    expect(store.compatibilityBlocked.value).toBe(true);
    expect(sources[0]!.closed).toBe(true);
    expect(store.compatibilityMessage.value).toBe("Unsupported server API version: 7.");
    // The player's indicator and the Library tab show it, and the log keeps it.
    expect(statuses).toEqual(["Ready"]);
    expect(relayed.some((line) => line.includes("Unsupported server API version: 7."))).toBe(true);
    expect(requests).not.toContain("GET /api/presets");
    expect(store.presetMenu.value.entries).toEqual([{ label: "Server compatibility check failed", value: "" }]);

    await connection.loadPresets();
    expect(store.presetMenu.value.entries).toEqual([{ label: "Server compatibility check failed", value: "" }]);
    const statusCount = statuses.length;
    await connection.pair("token");
    expect(notices).toEqual(["Pairing blocked by server compatibility check."]);
    expect(statuses).toHaveLength(statusCount);
    expect(requests).not.toContain("POST /api/pair");
  });

  it("keeps saying the server failed the compatibility check, or has no library, when presets arrive after it", async () => {
    for (const [after, menu] of [
      [{ ...COMPATIBLE_VERSION, apiVersion: "7" }, "Server compatibility check failed"],
      [{ ...COMPATIBLE_VERSION, libraryState: "newer", libraryMessage: NO_LIBRARY_MESSAGE }, "Running without a library"]
    ] as const) {
      let version: object = COMPATIBLE_VERSION;
      const presets = deferredReply();
      const { store, connection, sources } = setup({
        "GET /api/version": () => json(version),
        "GET /api/presets": presets.reply
      });
      connection.start();
      await settle();
      expect(presets.pending()).toBe(1);

      version = after;
      sources[0]!.onopen?.(new Event("open"));
      await settle();
      presets.answer(json([{ id: "p1", name: "Favorites", filterState: { favoritesOnly: true } }]));
      await settle();
      expect(store.presetMenu.value).toEqual({ entries: [{ label: menu, value: "" }], selectedValue: "", message: true });
      connection.stop();
    }
  });

  it("says the server can't be reached from a lost event stream until it opens again, or stops", async () => {
    const { store, connection, sources, pageWindow, statuses } = setup();
    connection.start();
    await settle();
    expect(store.reconnecting.value).toBe(false);

    sources[0]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(true);
    // The failure's check reached the server, but the stream is still down.
    await settle();
    expect(store.reconnecting.value).toBe(true);
    pageWindow.dispatchEvent(new Event("focus"));
    expect(store.reconnecting.value).toBe(true);
    sources[1]!.onopen?.(new Event("open"));
    expect(store.reconnecting.value).toBe(false);

    sources[1]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(true);
    connection.stop();
    expect(store.reconnecting.value).toBe(false);
    // The player's indicator says so; the status line keeps only the stream opening.
    expect(statuses).not.toContain("SSE reconnecting...");
    expect(statuses).toContain("SSE connected");
  });

  it("keeps saying the server can't be reached once the stream opens, until a version check reaches it", async () => {
    let serverDown = false;
    const { store, connection, sources, statuses } = setup({
      "GET /api/version": () => {
        if (serverDown) {
          throw new TypeError("Failed to fetch");
        }
        return json(COMPATIBLE_VERSION);
      }
    });
    connection.start();
    await settle();

    serverDown = true;
    sources[0]!.onerror?.(new Event("error"));
    await settle();
    expect(store.reconnecting.value).toBe(true);

    // The stream opens, but the check it starts doesn't reach the server.
    sources[0]!.onopen?.(new Event("open"));
    expect(store.reconnecting.value).toBe(true);
    await settle();
    expect(store.reconnecting.value).toBe(true);

    serverDown = false;
    sources[0]!.onopen?.(new Event("open"));
    expect(store.reconnecting.value).toBe(true);
    await settle();
    expect(store.reconnecting.value).toBe(false);
    expect(statuses).not.toContain("Ready (API offline)");
  });

  it("says the server can't be reached when the version check at page load doesn't reach it, and nothing before", async () => {
    const version = deferredReply();
    const { store, connection } = setup({ "GET /api/version": version.reply });
    connection.start();
    await settle();
    expect(store.reconnecting.value).toBe(false);

    version.answer(new Response("<html>Bad gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
    await settle();
    expect(store.reconnecting.value).toBe(true);
  });

  it("doesn't say the server can't be reached for a stream refused before the first version check answers", async () => {
    const version = deferredReply();
    const { store, connection, sources } = setup({ "GET /api/version": version.reply });
    connection.start();
    // A server without a library refuses the stream, which can fail before the check at page load answers.
    sources[0]!.onerror?.(new Event("error"));
    await settle();
    expect(store.reconnecting.value).toBe(false);

    const noLibrary = { ...COMPATIBLE_VERSION, libraryState: "damaged", libraryMessage: NO_LIBRARY_MESSAGE };
    version.answer(json(noLibrary));
    await settle();
    expect(store.noLibrary.value).toBe(true);
    expect(store.reconnecting.value).toBe(false);
    // The failure asked for one more check, which finds the same.
    version.answer(json(noLibrary));
    await settle();
    expect(store.reconnecting.value).toBe(false);
  });

  it("doesn't say the server can't be reached while the version check found no library and the server refuses the stream", async () => {
    let serverDown = false;
    const { store, connection, sources, pageWindow } = setup({
      "GET /api/version": () => {
        if (serverDown) {
          throw new TypeError("Failed to fetch");
        }
        return json({ ...COMPATIBLE_VERSION, libraryState: "damaged", libraryMessage: NO_LIBRARY_MESSAGE });
      }
    });
    connection.start();
    await settle();
    expect(store.noLibrary.value).toBe(true);

    sources[0]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(false);
    await settle();
    expect(store.reconnecting.value).toBe(false);

    // The server going away after that can't be reached, and the library state stays as last known.
    serverDown = true;
    pageWindow.dispatchEvent(new Event("focus"));
    sources[1]!.onerror?.(new Event("error"));
    await settle();
    expect(store.reconnecting.value).toBe(true);
    expect(store.libraryState.value).toBe("damaged");
    expect(store.libraryMessage.value).toBe(NO_LIBRARY_MESSAGE);
  });

  it("doesn't say the server can't be reached when the version check needs pairing", async () => {
    const { store, connection, statuses } = setup({ "GET /api/version": () => json({}, 401) });
    connection.start();
    await settle();

    expect(store.pairingRequired.value).toBe(true);
    expect(store.reconnecting.value).toBe(false);
    expect(statuses).toEqual(["Ready"]);
  });

  it("doesn't check the version when the event stream fails while the server asks for pairing", async () => {
    const { store, connection, sources, pageWindow, count } = setup({ "GET /api/version": () => json({}, 401) });
    connection.start();
    await settle();
    expect(store.pairingRequired.value).toBe(true);
    expect(count("GET /api/version")).toBe(1);

    // The server refuses the stream until the device pairs, and pairing checks the version itself.
    sources[0]!.onerror?.(new Event("error"));
    await settle();
    pageWindow.dispatchEvent(new Event("focus"));
    sources[1]!.onerror?.(new Event("error"));
    await settle();
    expect(count("GET /api/version")).toBe(1);
    connection.stop();
  });

  it("checks the version on each open and failure of the event stream, one check at a time", async () => {
    const version = deferredReply();
    const { connection, sources, count } = setup({ "GET /api/version": version.reply });
    connection.start();
    await settle();
    expect(count("GET /api/version")).toBe(1);

    // Asked again while the first runs, the stream opening, failing, and opening again ask for one more after it.
    sources[0]!.onopen?.(new Event("open"));
    sources[0]!.onerror?.(new Event("error"));
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(count("GET /api/version")).toBe(1);

    version.answer(json(COMPATIBLE_VERSION));
    await settle();
    expect(count("GET /api/version")).toBe(2);
    version.answer(json(COMPATIBLE_VERSION));
    await settle();
    expect(count("GET /api/version")).toBe(2);

    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(count("GET /api/version")).toBe(3);
    version.answer(json(COMPATIBLE_VERSION));
    await settle();
  });

  it("counts a version check that gets no answer in 10 seconds as not reaching the server, and aborts it", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    let hang = true;
    const { store, connection, sources, count } = setup({
      "GET /api/version": (init) => {
        signals.push(init!.signal!);
        return hang ? new Promise<Response>(() => {}) : json(COMPATIBLE_VERSION);
      }
    });
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_TIMEOUT_MS - 1);
    expect(store.reconnecting.value).toBe(false);
    expect(signals[0]!.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]!.aborted).toBe(true);
    expect(store.reconnecting.value).toBe(true);
    expect(ready).not.toHaveBeenCalled();

    // The check that hung no longer holds back the next.
    hang = false;
    sources[0]!.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);
    expect(count("GET /api/version")).toBe(2);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(store.reconnecting.value).toBe(false);
    connection.stop();
  });

  it("checks again every few seconds while the stream is open and the last check didn't reach the server, until one does", async () => {
    vi.useFakeTimers();
    let reachable = true;
    const { store, connection, sources, count } = setup({
      "GET /api/version": () => {
        if (!reachable) {
          throw new TypeError("Failed to fetch");
        }
        return json(COMPATIBLE_VERSION);
      }
    });
    connection.start();
    sources[0]!.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);
    const checked = count("GET /api/version");
    // Nothing more while checks reach the server.
    await vi.advanceTimersByTimeAsync(VERSION_RECHECK_MS * 2);
    expect(count("GET /api/version")).toBe(checked);

    // The stream opens again, but the check it starts doesn't reach the server, and nothing else would ask for one.
    reachable = false;
    sources[0]!.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);
    expect(count("GET /api/version")).toBe(checked + 1);
    expect(store.reconnecting.value).toBe(true);

    await vi.advanceTimersByTimeAsync(VERSION_RECHECK_MS - 1);
    expect(count("GET /api/version")).toBe(checked + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(count("GET /api/version")).toBe(checked + 2);
    expect(store.reconnecting.value).toBe(true);

    reachable = true;
    await vi.advanceTimersByTimeAsync(VERSION_RECHECK_MS);
    expect(count("GET /api/version")).toBe(checked + 3);
    expect(store.reconnecting.value).toBe(false);
    await vi.advanceTimersByTimeAsync(VERSION_RECHECK_MS * 3);
    expect(count("GET /api/version")).toBe(checked + 3);
    connection.stop();
  });

  it("leaves checking to the event stream's own retries while it is down, and stops checking once stopped", async () => {
    vi.useFakeTimers();
    let reachable = true;
    const { connection, sources, count } = setup({
      "GET /api/version": () => {
        if (!reachable) {
          throw new TypeError("Failed to fetch");
        }
        return json(COMPATIBLE_VERSION);
      }
    });
    connection.start();
    sources[0]!.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);

    // A failed stream checks on each of its own retries, about once a second, and nothing else checks.
    reachable = false;
    sources[0]!.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(0);
    const checked = count("GET /api/version");
    connection.stop();
    await vi.advanceTimersByTimeAsync(VERSION_RECHECK_MS * 3);
    expect(count("GET /api/version")).toBe(checked);

    // A check that fails while the stream is open waits for its next one, which stopping cancels.
    const second = setup({ "GET /api/version": () => Promise.reject(new TypeError("Failed to fetch")) });
    second.connection.start();
    second.sources[0]!.onopen?.(new Event("open"));
    await vi.advanceTimersByTimeAsync(0);
    const secondChecked = second.count("GET /api/version");
    second.connection.stop();
    await vi.advanceTimersByTimeAsync(VERSION_RECHECK_MS * 3);
    expect(second.count("GET /api/version")).toBe(secondChecked);
  });

  it("stops saying the event stream is reconnecting when the server fails the compatibility check", async () => {
    let version: object = COMPATIBLE_VERSION;
    const { store, connection, sources } = setup({ "GET /api/version": () => json(version) });
    connection.start();
    await settle();

    // The server comes back from an update that it no longer passes.
    version = { ...COMPATIBLE_VERSION, apiVersion: "7" };
    sources[0]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(true);
    await settle();

    expect(store.compatibilityBlocked.value).toBe(true);
    expect(store.reconnecting.value).toBe(false);
  });

  it("checks the version again when the event stream opens while a failed check left the server not ready", async () => {
    let versionFails = true;
    const { connection, sources, statuses, count } = setup({
      "GET /api/version": () => {
        if (versionFails) {
          throw new TypeError("Failed to fetch");
        }
        return json(COMPATIBLE_VERSION);
      }
    });
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    await settle();
    expect(statuses).toEqual(["Ready"]);
    expect(ready).not.toHaveBeenCalled();
    expect(count("GET /api/presets")).toBe(0);

    versionFails = false;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(count("GET /api/presets")).toBe(1);

    // Once the server is ready, a check on the stream opening or failing loads nothing again.
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    sources[0]!.onerror?.(new Event("error"));
    await settle();
    expect(count("GET /api/version")).toBe(4);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(count("GET /api/presets")).toBe(1);
    expect(statuses.filter((status) => status === "Ready (API 1)")).toHaveLength(1);
  });

  it("loads presets when the version check passes on the event stream opening after it failed at start", async () => {
    let serverDown = true;
    const offline = (reply: () => Response) => () => {
      if (serverDown) {
        throw new TypeError("Failed to fetch");
      }
      return reply();
    };
    const { store, connection, sources } = setup({
      "GET /api/version": offline(() => json(COMPATIBLE_VERSION)),
      "GET /api/presets": offline(() => json([{ id: "p1", name: "Favorites", filterState: { favoritesOnly: true } }]))
    });
    connection.start();
    await settle();
    expect(store.presetMenu.value).toEqual({ entries: [{ label: "Loading...", value: "" }], selectedValue: "", message: true });

    serverDown = false;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(store.presetMenu.value.message).toBe(false);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Favorites"]);
  });

  it("reads the library state and its message from the version check, and none as ready from an older server", async () => {
    let version: object = { ...COMPATIBLE_VERSION, libraryState: "missing", libraryMessage: NO_LIBRARY_MESSAGE };
    const { store, connection, sources } = setup({ "GET /api/version": () => json(version) });
    connection.start();
    await settle();
    expect(store.libraryState.value).toBe("missing");
    expect(store.libraryMessage.value).toBe(NO_LIBRARY_MESSAGE);
    expect(store.noLibrary.value).toBe(true);

    version = COMPATIBLE_VERSION;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(store.libraryState.value).toBe("ready");
    expect(store.libraryMessage.value).toBeNull();
    expect(store.noLibrary.value).toBe(false);
  });

  it("holds back serverReady and the presets while the server has no library, and sends them once it has one", async () => {
    let version: object = { ...COMPATIBLE_VERSION, libraryState: "unreadable", libraryMessage: NO_LIBRARY_MESSAGE };
    const { store, connection, sources, statuses, count } = setup({ "GET /api/version": () => json(version) });
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    await settle();
    expect(ready).not.toHaveBeenCalled();
    expect(store.presetMenu.value).toEqual({ entries: [{ label: "Running without a library", value: "" }], selectedValue: "", message: true });
    expect(statuses).toEqual(["Ready"]);

    // Nothing asks the server for presets: not a load, nor a resync.
    await connection.loadPresets();
    sources[0]!.emit("resyncRequired", 9, { reason: "gap" });
    await settle();
    expect(count("GET /api/presets")).toBe(0);
    expect(store.presetMenu.value.entries).toEqual([{ label: "Running without a library", value: "" }]);

    version = COMPATIBLE_VERSION;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(count("GET /api/presets")).toBe(1);
    expect(store.presetMenu.value.message).toBe(false);
    expect(statuses).toContain("Ready (API 1)");
  });

  it("is not ready again after a check finds no library, until one finds the library ready", async () => {
    let version: object = COMPATIBLE_VERSION;
    const { store, connection, sources, statuses, count } = setup({ "GET /api/version": () => json(version) });
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);

    // The server restarted with a broken library.
    version = { ...COMPATIBLE_VERSION, libraryState: "damaged", libraryMessage: NO_LIBRARY_MESSAGE };
    sources[0]!.onerror?.(new Event("error"));
    await settle();
    expect(store.noLibrary.value).toBe(true);
    expect(store.presetMenu.value.entries).toEqual([{ label: "Running without a library", value: "" }]);

    version = COMPATIBLE_VERSION;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(ready).toHaveBeenCalledTimes(2);
    expect(count("GET /api/presets")).toBe(2);
    expect(statuses.filter((status) => status === "Ready (API 1)")).toHaveLength(2);
  });

  it("pairs with the config token on start, then checks the version and reconnects, without the server ready again", async () => {
    const { store, connection, requests, sources, statuses, count } = setup(
      { "POST /api/pair": () => json({ paired: true }) },
      "config-token"
    );
    const ready = vi.fn();
    connection.on("serverReady", ready);
    store.pairingRequired.value = true;
    connection.start();
    await settle();

    expect(requests.filter((request) => request === "POST /api/pair")).toHaveLength(1);
    expect(store.pairingRequired.value).toBe(false);
    expect(statuses).toContain("Paired.");
    expect(count("GET /api/version")).toBe(2);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(count("GET /api/presets")).toBe(1);
    expect(sources).toHaveLength(2);
  });

  it("sends serverReady and loads presets once when pairing makes the server ready, and not on pairing again", async () => {
    let paired = false;
    const { connection, statuses, count } = setup({
      "GET /api/version": () => (paired ? json(COMPATIBLE_VERSION) : json({}, 401)),
      "POST /api/pair": () => {
        paired = true;
        return json({ paired: true });
      }
    });
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    await settle();
    expect(ready).not.toHaveBeenCalled();

    await connection.pair("token");
    expect(ready).toHaveBeenCalledTimes(1);
    await settle();
    expect(count("GET /api/presets")).toBe(1);

    await connection.pair("token");
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(count("GET /api/presets")).toBe(1);
    expect(statuses.filter((status) => status === "Ready (API 1)")).toHaveLength(1);
  });

  it("sends serverReady and loads presets again once when pairing follows a version check answered with 401", async () => {
    let paired = true;
    const { connection, sources, count } = setup({
      "GET /api/version": () => (paired ? json(COMPATIBLE_VERSION) : json({}, 401)),
      "POST /api/pair": () => {
        paired = true;
        return json({ paired: true });
      }
    });
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(count("GET /api/presets")).toBe(1);

    // The server forgot the device's pairing, as after a restart, so it refuses the stream and the check.
    paired = false;
    sources[0]!.onerror?.(new Event("error"));
    await settle();

    await connection.pair("token");
    await settle();
    expect(ready).toHaveBeenCalledTimes(2);
    expect(count("GET /api/presets")).toBe(2);
    connection.stop();
  });

  it("shows and relays no Reconnecting… when a device the server refuses for pairing pairs", async () => {
    let paired = false;
    const { store, connection, sources, relayed } = setup({
      "GET /api/version": () => (paired ? json(COMPATIBLE_VERSION) : json({}, 401)),
      "POST /api/pair": () => {
        paired = true;
        return json({ paired: true });
      }
    });
    const indicator = createPlayerIndicator(store);
    const shown: Array<string | null> = [];
    indicator.subscribe((state) => shown.push(state?.id ?? null));
    connection.start();
    await settle();
    // The server refuses the stream of a device that isn't paired, which isn't a server that can't be reached.
    sources[0]!.onerror?.(new Event("error"));
    await settle();
    expect(store.pairingRequired.value).toBe(true);
    expect(store.reconnecting.value).toBe(false);

    await connection.pair("token");
    sources[1]!.onopen?.(new Event("open"));
    await settle();
    expect(indicator.value).toBeNull();
    expect(shown).not.toContain("reconnecting");
    expect(relayed.filter((line) => line.includes("Reconnecting"))).toEqual([]);
    connection.stop();
  });

  it("sends nothing for an empty token, and reports a failed pairing in a notice without reconnecting", async () => {
    const { connection, requests, sources, statuses, notices } = setup({ "POST /api/pair": () => json({}, 403) });
    connection.start();
    await settle();
    const statusCount = statuses.length;

    await connection.pair("   ");
    expect(requests).not.toContain("POST /api/pair");
    expect(notices).toEqual([]);
    await connection.pair("wrong");
    expect(notices).toEqual(["Pairing failed."]);
    expect(statuses).toHaveLength(statusCount);
    expect(requests.filter((request) => request === "POST /api/pair")).toHaveLength(1);
    expect(sources).toHaveLength(1);
  });

  it("says a wrong token's 401 failed, and a pairing that couldn't reach the server why, whatever the browser calls it", async () => {
    let pairReply = () => json({ error: "Invalid token" }, 401);
    const { connection, notices } = setup({ "POST /api/pair": () => pairReply() });
    connection.start();
    await settle();
    notices.length = 0;

    await connection.pair("wrong");
    expect(notices).toEqual(["Pairing failed."]);

    for (const message of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
      pairReply = () => {
        throw new TypeError(message);
      };
      await connection.pair("token");
    }
    expect(notices).toEqual([
      "Pairing failed.",
      "Pairing failed: Couldn't reach the server.",
      "Pairing failed: Couldn't reach the server.",
      "Pairing failed: Couldn't reach the server."
    ]);
  });

  it("reconnects on focus, page show, coming online, and becoming visible, and stops listening once stopped", async () => {
    const { connection, sources, pageWindow } = setup();
    connection.start();
    await settle();

    pageWindow.dispatchEvent(new Event("focus"));
    pageWindow.dispatchEvent(new Event("pageshow"));
    pageWindow.dispatchEvent(new Event("online"));
    pageWindow.document.dispatchEvent(new Event("visibilitychange"));
    expect(sources).toHaveLength(5);

    pageWindow.document.visibilityState = "hidden";
    pageWindow.document.dispatchEvent(new Event("visibilitychange"));
    expect(sources).toHaveLength(5);

    connection.stop();
    expect(sources[4]!.closed).toBe(true);
    pageWindow.dispatchEvent(new Event("focus"));
    pageWindow.document.visibilityState = "visible";
    pageWindow.document.dispatchEvent(new Event("visibilitychange"));
    expect(sources).toHaveLength(5);
  });

  it("shows only the pairing prompt when presets need pairing, and an error entry for any other failure", async () => {
    let presetsStatus = 401;
    const { store, connection } = setup({ "GET /api/presets": () => json({}, presetsStatus) });
    await connection.loadPresets();
    expect(store.pairingRequired.value).toBe(true);
    expect(store.presetMenu.value.entries).toEqual([{ label: "Loading...", value: "" }]);
    expect(store.status.value).toBe("");

    presetsStatus = 500;
    await connection.loadPresets();
    expect(store.presetMenu.value.entries).toEqual([{ label: "Error loading presets", value: "" }]);
    expect(store.status.value).toBe("Error loading presets: HTTP 500");
  });

  it("shows a running refresh's progress off the status line, and its end, failure, or idle on it", async () => {
    const { store, connection, sources, statuses } = setup();
    connection.start();
    await settle();
    const stream = sources[0]!;
    statuses.length = 0;

    const running = {
      isRunning: true,
      runId: "run-1",
      currentStage: "sourceRefresh",
      stages: [{ stage: "sourceRefresh", percent: 40, message: "Refreshing sources (12 added, 3 removed)", isComplete: false }]
    };
    stream.emit("refreshStatusChanged", 1, { snapshot: running });
    expect(store.refreshProgress.value).toEqual({ stage: "Refreshing sources", percent: 40 });
    expect(statuses).toEqual([]);

    const finished = { ...running, isRunning: false, completedUtc: "2026-10-07T00:00:00Z" };
    stream.emit("refreshStatusChanged", 2, { snapshot: finished });
    expect(store.refreshProgress.value).toBeNull();
    stream.emit("refreshStatusChanged", 3, { snapshot: { ...finished, runId: "run-2", lastError: "Disk full" } });
    stream.emit("refreshStatusChanged", 4, { snapshot: { isRunning: false, stages: [] } });
    expect(statuses).toEqual([buildRefreshStatusMessage(finished), "Core refresh failed: Disk full", "Core refresh idle."]);
    expect(statuses[0]).toMatch(/^Core refresh complete \| /);

    // A run that ended while events were missed doesn't stay showing.
    stream.emit("refreshStatusChanged", 5, { snapshot: { ...running, runId: "run-3" } });
    expect(store.refreshProgress.value).not.toBeNull();
    stream.emit("resyncRequired", 9, { reason: "gap" });
    expect(store.refreshProgress.value).toBeNull();
  });
});
