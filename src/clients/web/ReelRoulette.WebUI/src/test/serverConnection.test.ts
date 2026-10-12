import { describe, expect, it, vi } from "vitest";
import { createAppApi } from "../state/appApi";
import { createAppStore } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { createServerConnection } from "../state/serverConnection";

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
  return new Response(JSON.stringify(body), { status });
}

function setup(routes: Record<string, () => Response> = {}, pairToken?: string) {
  const requests: string[] = [];
  const replies: Record<string, () => Response> = {
    "GET /api/version": () => json(COMPATIBLE_VERSION),
    "GET /api/presets": () => json([{ id: "p1", name: "Favorites", filterState: { favoritesOnly: true } }]),
    "POST /api/logs/client": () => new Response(null, { status: 204 }),
    ...routes
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method || "GET"} ${new URL(String(input)).pathname}`;
    requests.push(key);
    return replies[key]?.() ?? new Response("{}", { status: 404 });
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
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: () => {}
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
  return { store, connection, requests, sources, statuses, notices, pageWindow };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe("createServerConnection", () => {
  it("loads presets, checks the version, opens the event stream, and tells listeners the server is ready", async () => {
    const { store, connection, requests, sources, statuses } = setup();
    const ready = vi.fn();
    connection.on("serverReady", ready);

    connection.start();
    expect(statuses).toEqual(["Ready"]);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toContain("clientId=client-1");
    await settle();

    expect(requests).toEqual(expect.arrayContaining(["GET /api/presets", "GET /api/version"]));
    expect(statuses).toContain("Ready (API 1)");
    expect(ready).toHaveBeenCalledTimes(1);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Favorites"]);
  });

  it("passes item, playback, and tag events on, and a finished refresh once per run", async () => {
    const { connection, sources } = setup();
    const received: Array<[string, unknown]> = [];
    connection.on("itemStateChanged", (payload) => received.push(["itemStateChanged", payload]));
    connection.on("playbackRecorded", (payload) => received.push(["playbackRecorded", payload]));
    connection.on("itemTagsChanged", (payload) => received.push(["itemTagsChanged", payload]));
    connection.on("refreshCompleted", () => received.push(["refreshCompleted", null]));
    connection.start();
    await settle();

    const stream = sources[0]!;
    stream.emit("itemStateChanged", 1, { itemId: "a" });
    stream.emit("playbackRecorded", 2, { itemId: "b" });
    stream.emit("itemTagsChanged", 3, { resolvedItemIds: ["c"] });
    const finished = { snapshot: { isRunning: false, runId: "run-1", completedUtc: "2026-10-07T00:00:00Z", stages: [] } };
    stream.emit("refreshStatusChanged", 4, finished);
    stream.emit("refreshStatusChanged", 5, finished);

    expect(received).toEqual([
      ["itemStateChanged", { itemId: "a" }],
      ["playbackRecorded", { itemId: "b" }],
      ["itemTagsChanged", { resolvedItemIds: ["c"] }],
      ["refreshCompleted", null]
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

  it("blocks an incompatible server: stops the stream, and preset loads and pairing say so", async () => {
    const { store, connection, sources, statuses, notices, requests } = setup({
      "GET /api/version": () => json({ ...COMPATIBLE_VERSION, apiVersion: "7" })
    });
    connection.start();
    await settle();

    expect(store.compatibilityBlocked.value).toBe(true);
    expect(sources[0]!.closed).toBe(true);
    expect(statuses).toContain("Unsupported server API version: 7.");
    // The presets the start loaded give way to the message.
    expect(store.presetMenu.value.entries).toEqual([{ label: "Server compatibility check failed", value: "" }]);

    await connection.loadPresets();
    expect(store.presetMenu.value.entries).toEqual([{ label: "Server compatibility check failed", value: "" }]);
    const statusCount = statuses.length;
    await connection.pair("token");
    expect(notices).toEqual(["Pairing blocked by server compatibility check."]);
    expect(statuses).toHaveLength(statusCount);
    expect(requests).not.toContain("POST /api/pair");
  });

  it("keeps saying the server failed the compatibility check when presets arrive after it", async () => {
    let answerPresets: () => void = () => {};
    const presetsAnswered = new Promise<void>((resolve) => {
      answerPresets = resolve;
    });
    const { store, connection } = setup({
      "GET /api/version": () => json({ ...COMPATIBLE_VERSION, apiVersion: "7" }),
      "GET /api/presets": (async () => {
        await presetsAnswered;
        return json([{ id: "p1", name: "Favorites", filterState: { favoritesOnly: true } }]);
      }) as unknown as () => Response
    });
    connection.start();
    await settle();
    expect(store.compatibilityBlocked.value).toBe(true);

    answerPresets();
    await settle();
    expect(store.presetMenu.value).toEqual({ entries: [{ label: "Server compatibility check failed", value: "" }], selectedValue: "", message: true });
  });

  it("says the event stream is reconnecting from a lost connection until it opens again or stops", async () => {
    const { store, connection, sources, pageWindow } = setup();
    connection.start();
    await settle();
    expect(store.reconnecting.value).toBe(false);

    sources[0]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(true);
    pageWindow.dispatchEvent(new Event("focus"));
    expect(store.reconnecting.value).toBe(true);
    sources[1]!.onopen?.(new Event("open"));
    expect(store.reconnecting.value).toBe(false);

    sources[1]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(true);
    connection.stop();
    expect(store.reconnecting.value).toBe(false);
  });

  it("checks the version again when the event stream opens while a failed check left the server not ready", async () => {
    let versionFails = true;
    const { connection, requests, sources, statuses } = setup({
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
    expect(statuses).toContain("Ready (API offline)");
    expect(ready).not.toHaveBeenCalled();

    versionFails = false;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);

    // Once the server is ready, the stream opening again checks nothing.
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(requests.filter((request) => request === "GET /api/version")).toHaveLength(2);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("loads presets again when the version check passes on the event stream opening after both failed at start", async () => {
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
    expect(store.presetMenu.value).toEqual({ entries: [{ label: "Error loading presets", value: "" }], selectedValue: "", message: true });

    serverDown = false;
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(store.presetMenu.value.message).toBe(false);
    expect(store.presetMenu.value.entries.map((entry) => entry.label)).toEqual(["None", "Favorites"]);
  });

  it("doesn't check the version again when the event stream opens while the first check is under way", async () => {
    const { connection, requests, sources } = setup();
    const ready = vi.fn();
    connection.on("serverReady", ready);
    connection.start();
    sources[0]!.onopen?.(new Event("open"));
    await settle();
    expect(requests.filter((request) => request === "GET /api/version")).toHaveLength(1);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("stops saying the event stream is reconnecting when the server fails the compatibility check", async () => {
    const { store, connection, sources } = setup({
      "GET /api/version": () => json({ ...COMPATIBLE_VERSION, apiVersion: "7" })
    });
    connection.start();
    sources[0]!.onerror?.(new Event("error"));
    expect(store.reconnecting.value).toBe(true);
    await settle();

    expect(store.compatibilityBlocked.value).toBe(true);
    expect(store.reconnecting.value).toBe(false);
  });

  it("pairs with the config token on start, then checks the version, reloads presets, and reconnects", async () => {
    const { store, connection, requests, sources, statuses } = setup(
      { "POST /api/pair": () => json({ paired: true }) },
      "config-token"
    );
    store.pairingRequired.value = true;
    connection.start();
    await settle();

    expect(requests.filter((request) => request === "POST /api/pair")).toHaveLength(1);
    expect(store.pairingRequired.value).toBe(false);
    expect(statuses).toContain("Paired.");
    expect(requests.filter((request) => request === "GET /api/presets")).toHaveLength(2);
    expect(sources).toHaveLength(2);
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

  it("shows the pairing prompt and an error entry when presets need pairing", async () => {
    const { store, connection } = setup({ "GET /api/presets": () => json({}, 401) });
    await connection.loadPresets();
    expect(store.pairingRequired.value).toBe(true);
    expect(store.presetMenu.value.entries).toEqual([{ label: "Error loading presets", value: "" }]);
    expect(store.status.value).toBe("Error loading presets: Unauthorized");
  });
});
