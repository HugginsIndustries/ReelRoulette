import { afterEach, describe, expect, it, vi } from "vitest";
import { unauthorizedLogText } from "../api/serverRequest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createLibrary } from "../library/library";
import { LIBRARY_LOAD_TIMEOUT_MESSAGE } from "../library/libraryOverlayModel";
import type { LibraryGridController, LibraryGridCoverage, LibraryGridOptions } from "../library/libraryGridController";
import type { NotifyRequest } from "../notifications/notifications";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
import { createDeviceStore, type DeviceStorage } from "../state/deviceStore";
import { NO_LIBRARY_PLAY_NOTICE, noLibraryText } from "../state/lastingStates";
import type { ServerConnection, ServerConnectionEvents } from "../state/serverConnection";
import { createTagCatalog } from "../tags/tagCatalog";
import { createContextMenu } from "../ui/menuModel";
import { REMOTE_CONNECTIONS_OFF } from "./serverReasons";

const PLAYED: PlayingItem = {
  id: "/media/clip 1.mp4",
  itemId: "item-1",
  displayName: "clip 1.mp4",
  mediaType: "video",
  durationSeconds: 60,
  mediaUrl: "/api/media/item-1?token=t",
  isFavorite: false,
  isBlacklisted: false,
  rating: null
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function libraryItems(count: number, overrides: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index + 1}`,
    sourceId: "source-1",
    fileName: `clip ${index + 1}.mp4`,
    thumbnailWidth: 1920,
    thumbnailHeight: 1080,
    ...overrides
  }));
}

/** The Library tab's page, which the panel shows and hides around the library's `open` and `close`. */
interface FakePage {
  hidden: boolean;
}

/** A stand-in for the grid controller that records what the library asks of it. */
function fakeGrid(options: Required<LibraryGridOptions>, page: FakePage) {
  const grid = {
    onCoverage: options.onCoverage,
    /** The row height the grid was created to aim for. */
    rowHeight: options.rowHeight,
    /** As a zoom over the grid settling at a new row height does. */
    zoomTo: options.onRowHeightChange,
    contents: [] as Array<{ ids: string[]; resetScroll: boolean | undefined }>,
    /** Each playing item id the library marked, the first when the grid was created. */
    playing: [] as Array<string | null>,
    /** Each item id the library ringed as the one a menu acts on alone, the first when the grid was created. */
    ringed: [] as Array<string | null>,
    /** Whether an item's tile shows as selected, as the library last marked the tiles. */
    isSelected: (_itemId: string) => false,
    /** Whether the tab's page was shown or hidden each time the deferred layout was flushed. */
    flushes: [] as string[],
    destroyed: false,
    coverage: null as LibraryGridCoverage | null,
    setBrowseContent(input: Parameters<LibraryGridController["setBrowseContent"]>[0]) {
      grid.contents.push({ ids: input.visibleItems.map((item) => item.id), resetScroll: input.resetScroll });
    },
    setPlayingItemId(itemId: string | null) {
      grid.playing.push(itemId);
    },
    setMenuItemId(itemId: string | null) {
      grid.ringed.push(itemId);
    },
    setSelection(isSelected: (itemId: string) => boolean) {
      grid.isSelected = isSelected;
    },
    measureCoverage: () => grid.coverage,
    flushDeferredLayout() {
      grid.flushes.push(page.hidden ? "hidden" : "shown");
    },
    destroy() {
      grid.destroyed = true;
    }
  };
  return grid;
}

const NEEDS_FILL: LibraryGridCoverage = { scrollTop: 0, viewportBottom: 600, extentHeight: 1000, lastPageHeight: 1000 };

/** `storage` is the device's browser storage, which the Library tab remembers its settings in. */
function setup(options: { storage?: DeviceStorage } = {}) {
  const requests: Array<{ path: string; body: any }> = [];
  const replies = new Map<string, () => Response | Promise<Response>>();
  const library = {
    items: libraryItems(3) as Array<Record<string, unknown>>,
    totalCount: null as number | null,
    failures: [] as number[],
    held: null as Promise<void> | null
  };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ path, body });
    if (path === "/api/library/query" && !replies.has(path)) {
      if (library.held) {
        await library.held;
      }
      const failure = library.failures.shift();
      if (failure) {
        return json({}, failure);
      }
      const totalCount = library.totalCount ?? library.items.length;
      return json({
        items: library.items.slice(body.offset, body.offset + body.limit),
        totalCount,
        searchBaselineCount: totalCount
      });
    }
    // As the server does: every matching id, or only the matching ones of `itemIds`.
    if (path === "/api/library/query-ids" && !replies.has(path)) {
      const ids = library.items.map((item) => String(item.id));
      return json({ ids: body?.itemIds ? ids.filter((id) => body.itemIds.includes(id)) : ids });
    }
    return (await replies.get(path)?.()) ?? json({});
  }) as typeof fetch;
  const relayed: string[] = [];
  /** The store's clock, which a test moves on to relay a line again. */
  const clock = { ms: 0 };
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message),
    now: () => clock.ms
  });
  /** The texts relayed without a message, as an error shown in place is. */
  const statuses: string[] = [];
  const relayStatus = store.relayStatus;
  store.relayStatus = (logText) => {
    statuses.push(logText);
    relayStatus(logText);
  };
  /** The one-off messages, which pop up and which the list keeps. */
  const notified: NotifyRequest[] = [];
  const notifications = {
    notify(request: NotifyRequest) {
      notified.push(request);
    }
  };
  // As the page does: a 401 on any request shows the pairing prompt and relays one line naming its route.
  const api = createAppApi("http://server", {
    onUnauthorized: (route) => {
      store.pairingRequired.value = true;
      store.relayStatus(unauthorizedLogText(route));
    },
    fetch: fetchImpl
  });
  api.relayLog = async (_level, message) => {
    relayed.push(message);
  };
  const listeners: Partial<Record<keyof ServerConnectionEvents, Array<(payload: any) => void>>> = {};
  const connection = {
    on(event: keyof ServerConnectionEvents, listener: (payload: any) => void) {
      (listeners[event] ??= []).push(listener);
    }
  } as unknown as ServerConnection;
  const page: FakePage = { hidden: true };
  const panel = { closeIfOverlay: vi.fn(() => Promise.resolve()), showTab: vi.fn(() => Promise.resolve()) };
  const playCalls: string[] = [];
  const player = {
    playCurrent: vi.fn((options?: { origin?: string }) => {
      playCalls.push(`current=${store.current.peek()?.itemId} closeIfOverlay=${panel.closeIfOverlay.mock.calls.length} origin=${options?.origin}`);
    })
  };
  const grids: Array<ReturnType<typeof fakeGrid>> = [];
  const frames: Array<() => void> = [];
  const contextMenu = createContextMenu();
  /** Each notice's message, and the text it relays when that differs. */
  const notices: string[] = [];
  const noticeLogs: string[] = [];
  const dialogs = {
    notice(message: string, logText = message) {
      notices.push(message);
      noticeLogs.push(logText);
      return Promise.resolve();
    },
    // No test here confirms a bulk action.
    confirm: () => Promise.resolve(false)
  };
  const service = createLibrary({
    config: { apiBaseUrl: "http://server/", sseUrl: "http://server/api/events" },
    store,
    api,
    connection,
    player,
    dialogs,
    notifications,
    controlAccess: { ensure: () => Promise.resolve(true) },
    panel,
    device: createDeviceStore(options.storage ?? null),
    tagCatalog: createTagCatalog({ api, connection }),
    contextMenu,
    createGrid(_host, gridOptions) {
      const grid = fakeGrid(gridOptions, page);
      grids.push(grid);
      return grid;
    },
    requestFrame: (callback) => frames.push(callback)
  });
  service.attach();
  return {
    library: service,
    contextMenu,
    fakeLibrary: library,
    store,
    page,
    panel,
    player,
    playCalls,
    relayed,
    statuses,
    notified,
    clock,
    notices,
    noticeLogs,
    replies,
    grids,
    queries: () => requests.filter((request) => request.path === "/api/library/query").map((request) => request.body),
    requests: (path: string) => requests.filter((request) => request.path === path),
    emit: (event: keyof ServerConnectionEvents, payload?: unknown) =>
      listeners[event]?.forEach((listener) => listener(payload)),
    /** Shows the Library tab as the panel does: its page first, then the library's `open`. */
    showTab() {
      page.hidden = false;
      service.open();
    },
    /** Hides the Library tab as the panel does: the library's `close`, then its page. */
    hideTab() {
      service.close();
      page.hidden = true;
    },
    runFrames() {
      for (const frame of frames.splice(0)) {
        frame();
      }
    },
    /** Creates the grid when the body asks for it, as the Library tab's grid element does when it mounts. */
    mountGrid() {
      if (service.body.peek().kind !== "grid") {
        throw new Error("The body is not showing the grid.");
      }
      service.attachGrid({} as HTMLElement);
      return grids[grids.length - 1]!;
    }
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("library window", () => {
  it("loads the first page when the server is ready, and shows nothing until the tab opens", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();

    expect(t.queries()).toEqual([
      expect.objectContaining({ search: "", sortMode: "Name", sortDescending: false, offset: 0, limit: 200 })
    ]);
    expect(t.queries()[0].filterState).toMatchObject({ favoritesMode: "off", blacklistedMode: "excluded" });
    expect(t.library.body.peek()).toEqual({ kind: "blank" });
    expect(t.library.summary.peek()).toBeNull();
    expect(t.grids).toHaveLength(0);
  });

  it("opening shows the toolbar and totals, and the grid with the loaded tiles", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();

    t.showTab();
    expect(t.library.isOpen()).toBe(true);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    expect(t.library.summary.peek()).toBe("3 / 3 shown");
    const grid = t.mountGrid();
    expect(grid.contents).toEqual([{ ids: ["item-1", "item-2", "item-3"], resetScroll: false }]);
    expect(t.queries()).toHaveLength(1);

    t.hideTab();
    expect(t.library.isOpen()).toBe(false);
  });

  it("shows loading, error, and empty messages in place of the grid while open", async () => {
    const t = setup();
    t.fakeLibrary.failures.push(500);
    t.emit("serverReady");
    t.showTab();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Loading library…", error: false }
    });
    expect(t.queries()).toHaveLength(1);

    await settle();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Library load failed.", error: true }
    });
    // The body shows it, so it only relays, with the status in place of the text.
    expect(t.statuses).toEqual(["Library load failed (HTTP 500)."]);
    expect(t.notified).toEqual([]);

    t.replies.set("/api/library/query", () => json({ error: REMOTE_CONNECTIONS_OFF }, 403));
    await t.library.commitQuery();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: `Library load failed: ${REMOTE_CONNECTIONS_OFF}`, error: true }
    });
    expect(t.statuses).toEqual(["Library load failed (HTTP 500).", "Library load failed (HTTP 403)."]);
    t.replies.delete("/api/library/query");

    t.fakeLibrary.items = [];
    await t.library.commitQuery();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "No media in library.", error: false }
    });
    expect(t.grids).toHaveLength(0);
  });

  it.each([408, 504])("says a load answered with %i timed out in the body, and relays its status", async (failure) => {
    const t = setup();
    t.fakeLibrary.failures.push(failure);
    t.emit("serverReady");
    t.showTab();
    await settle();

    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: LIBRARY_LOAD_TIMEOUT_MESSAGE, error: true }
    });
    expect(t.statuses).toEqual([`Library load failed (HTTP ${failure}).`]);
    expect(t.notified).toEqual([]);
  });

  it("shows no failure for a load or a browse answered with 401, only logs it, and asks for pairing", async () => {
    const t = setup();
    t.fakeLibrary.failures.push(401);
    t.emit("serverReady");
    t.showTab();
    await settle();

    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: "", error: false } });
    expect(t.notified).toEqual([]);
    expect(t.store.pairingRequired.peek()).toBe(true);
    // One line, the request's, which names its route.
    const line = "status=Unauthorized. Pair first. (POST /api/library/query) hasCurrent=false attempt=0";
    expect(t.relayed.filter((relayed) => relayed.startsWith("status="))).toEqual([line]);

    // Once it loads, a reload the server answers with 401 keeps the tiles and shows no failure either.
    t.store.pairingRequired.value = false;
    t.library.open();
    await settle();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    t.clock.ms += 2000;
    t.relayed.length = 0;
    t.fakeLibrary.failures.push(401);
    t.emit("refreshCompleted");
    await settle();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    expect(t.notified).toEqual([]);
    expect(t.store.pairingRequired.peek()).toBe(true);
    expect(t.relayed.filter((relayed) => relayed.startsWith("status="))).toEqual([line]);
  });

  it("pops up a reload that fails while the tiles stay, with its own icon, and doesn't show it in the body", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    t.mountGrid();

    t.fakeLibrary.failures.push(500);
    t.emit("refreshCompleted");
    await settle();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    // It relays its text when it pops up; the fake here relays nothing.
    expect(t.statuses).toEqual([]);
    expect(t.notified).toEqual([
      { kind: "connection", text: "Library browse failed. Showing the tiles already loaded.", icon: "sync_problem", key: "browse" }
    ]);
  });

  it("says a load answered with a page that isn't JSON failed, naming its content type only in the log", async () => {
    const t = setup();
    t.replies.set("/api/library/query", () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    t.emit("serverReady");
    t.showTab();
    await settle();

    expect(t.library.body.peek()).toMatchObject({
      message: { text: "Library load failed: The server sent an unexpected response." }
    });
    expect(t.statuses).toEqual(["Library load failed: The server sent an unexpected response (text/html)."]);
  });

  it("keeps the grid while hidden when a query fails, and opening loads again with a message in its place", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    const grid = t.mountGrid();
    t.hideTab();

    t.fakeLibrary.failures.push(503);
    await t.library.commitQuery();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    expect(t.library.summary.peek()).toBe("3 / 3 shown");
    expect(t.statuses).toEqual(["Library load failed (HTTP 503)."]);

    t.showTab();
    expect(t.library.body.peek()).toMatchObject({ kind: "message", message: { text: "Loading library…" } });
    expect(t.library.summary.peek()).toBeNull();
    expect(t.queries()).toHaveLength(3);
    expect(grid.flushes).toEqual([]);
  });

  it("updates a hidden grid's tiles, and flushes its deferred layout after the tab shows", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    const grid = t.mountGrid();
    t.hideTab();

    t.fakeLibrary.items = libraryItems(2);
    t.emit("refreshCompleted");
    await settle();
    expect(grid.contents.at(-1)).toEqual({ ids: ["item-1", "item-2"], resetScroll: false });
    expect(t.library.summary.peek()).toBe("2 / 2 shown");

    t.showTab();
    expect(grid.flushes).toEqual(["shown"]);
    expect(t.grids).toHaveLength(1);
  });

  it("keeps a new query's scroll to the top for a grid that is about to be created", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    await t.library.commitQuery();

    const grid = t.mountGrid();
    expect(grid.contents).toEqual([{ ids: ["item-1", "item-2", "item-3"], resetScroll: true }]);
  });

  it("a reload while the grid shows keeps it and the scroll position", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    const grid = t.mountGrid();
    let release: () => void = () => {};
    t.fakeLibrary.held = new Promise<void>((resolve) => {
      release = resolve;
    });

    t.emit("refreshCompleted");
    await settle();
    expect(t.queries()).toHaveLength(2);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });

    release();
    await settle();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    expect(grid.contents.at(-1)?.resetScroll).toBe(false);
    expect(grid.destroyed).toBe(false);
  });

  it("destroying the grid lets a later open create a new one", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    const destroy = t.library.attachGrid({} as HTMLElement);
    destroy();
    expect(t.grids[0]!.destroyed).toBe(true);

    t.hideTab();
    t.showTab();
    expect(t.grids[0]!.flushes).toEqual([]);
  });
});

describe("row height", () => {
  /** Browser storage for one device, kept across the libraries a test creates, as across a page refresh. */
  function deviceStorage(kept: Record<string, string> = {}): DeviceStorage & { entries: Map<string, string> } {
    const entries = new Map(Object.entries(kept));
    return { entries, getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => void entries.set(key, value) };
  }

  async function shownGrid(t: ReturnType<typeof setup>) {
    t.emit("serverReady");
    await settle();
    t.showTab();
    return t.mountGrid();
  }

  it("creates the grid at 160 px rows until a zoom sets this device's own", async () => {
    expect((await shownGrid(setup({ storage: deviceStorage() }))).rowHeight).toBe(160);
  });

  it("keeps the row height a zoom settles at, for the next grid and after a page refresh", async () => {
    const storage = deviceStorage();
    const t = setup({ storage });
    const grid = await shownGrid(t);

    grid.zoomTo(243);

    expect(storage.entries.get("rr_device.library.rowHeight")).toBe("243");
    expect(t.mountGrid().rowHeight).toBe(243);
    expect((await shownGrid(setup({ storage }))).rowHeight).toBe(243);
  });

  for (const kept of ["99", "119", "301", "160.5", "\"200\"", "null", "{"]) {
    it(`creates the grid at 160 px rows when the kept row height is ${kept}`, async () => {
      const storage = deviceStorage({ "rr_device.library.rowHeight": kept });
      expect((await shownGrid(setup({ storage }))).rowHeight).toBe(160);
    });
  }
});

describe("fill", () => {
  it("fills from the grid's coverage only while the tab is open", async () => {
    const t = setup();
    t.fakeLibrary.items = libraryItems(450);
    t.emit("serverReady");
    await settle();
    t.showTab();
    const grid = t.mountGrid();
    t.hideTab();

    grid.onCoverage(NEEDS_FILL);
    await settle();
    expect(t.queries()).toHaveLength(1);

    t.showTab();
    grid.onCoverage(NEEDS_FILL);
    await settle();
    expect(t.queries()).toHaveLength(2);
    expect(t.queries()[1]).toMatchObject({ offset: 200, limit: 200 });
  });

  it("the frame after opening fills from the grid's coverage, unless the tab closed first", async () => {
    const t = setup();
    t.fakeLibrary.items = libraryItems(450);
    t.emit("serverReady");
    await settle();
    t.showTab();
    t.mountGrid().coverage = NEEDS_FILL;

    t.hideTab();
    t.runFrames();
    await settle();
    expect(t.queries()).toHaveLength(1);

    t.showTab();
    t.runFrames();
    await settle();
    expect(t.queries()).toHaveLength(2);
  });

  it("sends nothing before the server passes the compatibility check, nor while it fails it, and loads with the filter applied meanwhile", async () => {
    const t = setup();
    t.store.appliedFilter.value = { ...createDefaultFilterState(), favoritesMode: "only" };
    await t.library.commitQuery();
    t.library.setSortMode("Duration");
    await settle();
    expect(t.queries()).toHaveLength(0);

    t.emit("serverReady");
    await settle();
    expect(t.queries()).toEqual([expect.objectContaining({ filterState: expect.objectContaining({ favoritesMode: "only" }), sortMode: "Duration" })]);

    t.store.compatibilityBlocked.value = true;
    await t.library.commitQuery();
    expect(t.queries()).toHaveLength(1);
  });

  it("opening loads the first page when there is none yet", async () => {
    const t = setup();
    t.fakeLibrary.failures.push(500);
    t.emit("serverReady");
    await settle();
    expect(t.queries()).toHaveLength(1);

    t.showTab();
    await settle();
    expect(t.queries()).toHaveLength(2);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
  });

  it("opening before the server passes the compatibility check sends nothing, and the first page loads once it does", async () => {
    const t = setup();
    t.showTab();
    await settle();
    expect(t.queries()).toHaveLength(0);
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Loading library…", error: false }
    });

    t.emit("serverReady");
    await settle();
    expect(t.queries()).toHaveLength(1);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
  });
});

describe("search and sort", () => {
  it("search waits until typing stops, and a commit drops the waiting search", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = setup();
    t.emit("serverReady");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.queries().map((query) => query.search)).toEqual([""]);
    t.library.setSearch("ho");
    await vi.advanceTimersByTimeAsync(299);
    t.library.setSearch("hol");
    await vi.advanceTimersByTimeAsync(299);
    expect(t.queries()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.queries()[1]).toEqual(expect.objectContaining({ search: "hol", offset: 0 }));

    t.library.setSearch("holi");
    await t.library.commitQuery();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.queries().map((query) => query.search)).toEqual(["", "hol", "holi"]);
  });

  it("a sort mode starts in its default direction, and the direction label changes when its page arrives", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    expect(t.library.directionLabel.peek()).toBe("A–Z");

    t.library.setSortMode("PlayCount");
    expect(t.library.controls.peek()).toMatchObject({ sortMode: "PlayCount", sortDescending: true });
    expect(t.library.directionLabel.peek()).toBe("A–Z");
    await settle();
    expect(t.queries()[1]).toMatchObject({ sortMode: "PlayCount", sortDescending: true, offset: 0 });
    expect(t.library.directionLabel.peek()).toBe("Most → Least");

    t.library.toggleSortDirection();
    await settle();
    expect(t.queries()[2]).toMatchObject({ sortMode: "PlayCount", sortDescending: false });
    expect(t.library.directionLabel.peek()).toBe("Least → Most");
  });
});

/** A click on a tile away from its check icon, with no keys held, which plays it outside selection. */
const PLAIN = { onCheck: false, shiftKey: false, ctrlKey: false, metaKey: false };

describe("play", () => {
  it("joins history, closes the panel as the overlay, and then plays as a library choice, which records no play again", async () => {
    const t = setup();
    t.replies.set("/api/play/item-1", () => json(PLAYED));
    t.showTab();

    await t.library.clickTile("item-1", PLAIN);

    expect(t.requests("/api/play/item-1")[0]!.body).toEqual({ clientId: "client-1", sessionId: "session-1" });
    expect(t.playCalls).toEqual(["current=item-1 closeIfOverlay=1 origin=library"]);
    expect(t.store.history.peek()).toHaveLength(1);
    expect(t.relayed.filter((line) => line.startsWith("playback="))).toEqual([
      "playback=library-play-start attempt=0 hasCurrent=false",
      "playback=library-play-success attempt=0 hasCurrent=true"
    ]);
  });

  it("ignores a play while one is loading", async () => {
    const t = setup();
    let answer: () => void = () => {};
    t.replies.set(
      "/api/play/item-1",
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(json(PLAYED));
        })
    );

    const first = t.library.clickTile("item-1", PLAIN);
    await t.library.clickTile("item-1", PLAIN);
    answer();
    await first;

    expect(t.requests("/api/play/item-1")).toHaveLength(1);
    expect(t.player.playCurrent).toHaveBeenCalledTimes(1);
  });

  it("holds Loading… while the play waits, handing it to the media before letting go, and never shows it as a message", async () => {
    vi.useFakeTimers();
    const t = setup();
    const shown: boolean[] = [];
    t.store.loading.shown.subscribe((value) => shown.push(value));
    // As the player does: every play attempt holds its media until it plays.
    t.player.playCurrent.mockImplementation(() => t.store.loading.hold("media"));
    let answer: () => void = () => {};
    t.replies.set("/api/play/item-1", () => new Promise<Response>((resolve) => (answer = () => resolve(json(PLAYED)))));

    const play = t.library.clickTile("item-1", PLAIN);
    await vi.advanceTimersByTimeAsync(499);
    expect(t.store.loading.shown.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.store.loading.shown.value).toBe(true);
    answer();
    await play;
    expect(t.store.loading.shown.value).toBe(true);
    t.store.loading.release("media");
    expect(t.store.loading.shown.value).toBe(false);
    expect(shown).toEqual([false, true, false]);
    expect(t.statuses).toEqual([]);
    expect(t.notified).toEqual([]);
  });

  it("lets go of Loading… when a play ends without playing", async () => {
    vi.useFakeTimers();
    const t = setup();
    for (const answer of [() => json({}, 500), () => json({}, 401), () => Promise.reject(new TypeError("Failed to fetch"))]) {
      t.replies.set("/api/play/item-1", answer);
      const play = t.library.clickTile("item-1", PLAIN);
      await vi.advanceTimersByTimeAsync(500);
      await play;
      expect(t.store.loading.shown.value).toBe(false);
    }
    expect(t.player.playCurrent).not.toHaveBeenCalled();
  });

  it("shows a refused, unreachable, or empty play in the notice alone, leaving the panel open", async () => {
    const t = setup();
    t.showTab();

    const plays: Array<[number, () => Response, string]> = [
      [404, () => json({ error: "gone", code: "play_item_not_found" }, 404), "Media not found. The file may have moved or been deleted."],
      [409, () => json({ error: "disabled" }, 409), "This item is unavailable."],
      [415, () => json({}, 415), "This file type is not supported."],
      [
        503,
        () => json({ error: "Media can't be read", code: "play_media_unreadable" }, 503),
        "This video couldn't load. The server may be waiting on a slow or disconnected drive or share."
      ],
      [503, () => json({ error: "The library is missing.", code: "library_missing" }, 503), "Playback failed: The library is missing."],
      [500, () => json({ error: "Server exploded" }, 500), "Playback failed: Server exploded"],
      [500, () => json({}, 500), "Playback failed."]
    ];
    for (const [status, answer, notice] of plays) {
      t.replies.set("/api/play/item-1", answer);
      await t.library.clickTile("item-1", PLAIN);
      expect(t.notices.at(-1)).toBe(notice);
      // The server's text can name a file, so the log names only the status.
      expect(t.noticeLogs.at(-1)).toBe(`Playback failed (HTTP ${status}).`);
    }
    expect(t.relayed).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=404 code=play_item_not_found");

    t.replies.set("/api/play/item-1", () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    await t.library.clickTile("item-1", PLAIN);
    expect([t.notices.at(-1), t.noticeLogs.at(-1)]).toEqual([
      "Playback failed: The server sent an unexpected response.",
      "Playback failed: The server sent an unexpected response (text/html)."
    ]);

    t.replies.set("/api/play/item-1", () => json({ itemId: "item-1" }));
    await t.library.clickTile("item-1", PLAIN);
    expect([t.notices.at(-1), t.noticeLogs.at(-1)]).toEqual(["Playback failed.", "Playback failed."]);
    expect(t.statuses).toEqual([]);
    expect(t.notified).toEqual([]);

    expect(t.panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(t.library.isOpen()).toBe(true);
    expect(t.player.playCurrent).not.toHaveBeenCalled();
  });

  it("names a photo tile in the couldn't-load message of a play the server can't read", async () => {
    const t = setup();
    t.fakeLibrary.items = libraryItems(1, { mediaType: 1 });
    t.emit("serverReady");
    await vi.waitFor(() => expect(t.library.session.snapshot().items).toHaveLength(1));
    t.replies.set("/api/play/item-1", () => json({ error: "Media can't be read", code: "play_media_unreadable" }, 503));

    await t.library.clickTile("item-1", PLAIN);

    expect(t.notices).toEqual(["This photo couldn't load. The server may be waiting on a slow or disconnected drive or share."]);
    expect(t.noticeLogs).toEqual(["Playback failed (HTTP 503)."]);
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "reads a play that couldn't reach the server, which the browser calls %j, the same in every browser",
    async (wording) => {
      const t = setup();
      t.replies.set("/api/play/item-1", () => {
        throw new TypeError(wording);
      });
      await t.library.clickTile("item-1", PLAIN);
      expect(t.notices).toEqual(["Playback failed: Couldn't reach the server."]);
      expect(t.relayed).toContain("playback=library-play-error attempt=0 hasCurrent=false message=Couldn't reach the server.");
      expect(t.statuses).toEqual([]);
      expect(t.notified).toEqual([]);
    }
  );

  it("shows only the pairing prompt for a play the server answers with 401, and still relays its line", async () => {
    const t = setup();
    t.replies.set("/api/play/item-1", () => json({}, 401));
    await t.library.clickTile("item-1", PLAIN);

    expect(t.store.pairingRequired.peek()).toBe(true);
    expect(t.notices).toEqual([]);
    expect(t.notified).toEqual([]);
    expect(t.relayed.filter((relayed) => relayed.includes("Unauthorized"))).toEqual([
      "status=Unauthorized. Pair first. (POST /api/play/{itemId}) hasCurrent=false attempt=0"
    ]);
  });

  it("shows why in place of the library, and neither loads nor plays, while the server is incompatible", async () => {
    const t = setup();
    t.store.compatibilityMessage.value = "Server API version 0 is not supported.";
    t.store.compatibilityBlocked.value = true;

    t.showTab();
    await t.library.clickTile("item-1", PLAIN);
    await settle();

    expect(t.library.isOpen()).toBe(true);
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Server API version 0 is not supported.", error: true }
    });
    expect(t.library.summary.peek()).toBeNull();
    expect(t.panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(t.player.playCurrent).not.toHaveBeenCalled();
    expect(t.notices).toEqual(["Cannot play: server compatibility check failed."]);
    expect(t.requests("/api/play/item-1")).toHaveLength(0);
    expect(t.queries()).toHaveLength(0);
  });
});

describe("without a library", () => {
  const MESSAGE = "The library was made by a newer version of ReelRoulette.";

  it("shows the server's message in place of the library, and neither loads nor plays", async () => {
    const t = setup();
    t.store.libraryMessage.value = MESSAGE;
    t.store.libraryState.value = "newer";

    t.showTab();
    await t.library.clickTile("item-1", PLAIN);
    await t.library.commitQuery();
    t.library.setSortMode("Duration");
    t.store.presets.value = [{ id: "fav", name: "Favorites", filterState: { favoritesMode: "only", includedSourceIds: ["source-1"] } }];
    t.store.pickHeaderPreset("fav");
    await settle();

    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: noLibraryText(MESSAGE), error: true } });
    expect(t.library.summary.peek()).toBeNull();
    expect(t.notices).toEqual([NO_LIBRARY_PLAY_NOTICE]);
    expect(t.requests("/api/play/item-1")).toHaveLength(0);
    expect(t.requests("/api/sources")).toHaveLength(0);
    expect(t.queries()).toHaveLength(0);
    expect(t.player.playCurrent).not.toHaveBeenCalled();
  });

  it("shows the compatibility check's notice first while both hold", async () => {
    const t = setup();
    t.store.libraryState.value = "missing";
    t.store.compatibilityMessage.value = "Server API version 0 is not supported.";
    t.store.compatibilityBlocked.value = true;

    t.showTab();
    await t.library.clickTile("item-1", PLAIN);
    expect(t.notices).toEqual(["Cannot play: server compatibility check failed."]);
    expect(t.library.body.peek()).toMatchObject({ message: { text: "Server API version 0 is not supported." } });
  });

  it("follows the server's message while open, and loads once the library is ready and the server says so", async () => {
    const t = setup();
    t.showTab();
    t.store.libraryState.value = "missing";
    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: "Running without a library.", error: true } });
    t.store.libraryMessage.value = MESSAGE;
    expect(t.library.body.peek()).toMatchObject({ message: { text: noLibraryText(MESSAGE) } });

    t.store.libraryState.value = "ready";
    t.store.libraryMessage.value = null;
    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: "Loading library…", error: false } });
    t.emit("serverReady");
    await settle();
    expect(t.queries()).toHaveLength(1);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
  });

  it("shows the message in place of loaded tiles when the library goes, and the tiles again when it is back", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.showTab();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });

    t.store.libraryState.value = "unreadable";
    expect(t.library.body.peek()).toMatchObject({ kind: "message", message: { text: "Running without a library." } });
    t.library.toggleSortDirection();
    await settle();
    expect(t.queries()).toHaveLength(1);

    t.store.libraryState.value = "ready";
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
  });
});

describe("events", () => {
  it("a preset pick and a resync start over or reload, and favorite and playback events update the window", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();

    t.fakeLibrary.items = libraryItems(3, { isFavorite: true });
    t.store.presets.value = [{ id: "fav", name: "Favorites", filterState: { favoritesMode: "only" } }];
    t.store.pickHeaderPreset("fav");
    await settle();
    expect(t.queries().at(-1)).toMatchObject({ filterState: { favoritesMode: "only" }, offset: 0, limit: 200 });
    const sent = t.queries().length;

    t.emit("itemStateChanged", { itemId: "item-1", isFavorite: false, isBlacklisted: false, previousIsFavorite: true, previousIsBlacklisted: false });
    await settle();
    expect(t.queries()).toHaveLength(sent + 1);

    t.emit("itemStateChanged", { isFavorite: true });
    t.emit("playbackRecorded", { itemId: "item-2", playCount: 3 });
    await settle();
    expect(t.queries()).toHaveLength(sent + 1);

    t.emit("resyncRequired", { reason: "gap" });
    await settle();
    expect(t.queries()).toHaveLength(sent + 2);
    expect(t.queries().at(-1)).toMatchObject({ offset: 0, limit: 3 });
  });

  it("starts over, loading the sources for the Filters line, when the applied preset follows another device's new filter", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.store.presets.value = [{ id: "fav", name: "Favorites", filterState: { favoritesMode: "only" } }];
    t.store.pickHeaderPreset("fav");
    await settle();
    const sent = t.queries().length;
    const phone = { id: "src-phone", displayName: "Phone backup", rootPath: "/media/phone", isEnabled: true };
    t.replies.set("/api/sources", () => json([phone]));

    const before = t.store.presets.peek()[0]!;
    t.store.presetsReloaded([{ ...before, filterState: { favoritesMode: "only", includedSourceIds: ["src-phone"] } }], before);
    await settle();
    expect(t.queries()).toHaveLength(sent + 1);
    expect(t.queries().at(-1)).toMatchObject({ filterState: { favoritesMode: "only", includedSourceIds: ["src-phone"] }, offset: 0 });
    expect(t.requests("/api/sources")).toHaveLength(1);
    expect(t.store.sources.peek()).toEqual([phone]);
  });

  it("detaching the tab's view while it is open counts as closed, and opening without it does nothing", async () => {
    const t = setup();
    t.library.open();
    t.library.detach();

    expect(t.library.isOpen()).toBe(false);
    t.library.open();
    expect(t.library.isOpen()).toBe(false);
  });
});

describe("kept sources", () => {
  const PHONE = { id: "src-phone", displayName: "Phone backup", rootPath: "/media/phone", isEnabled: true };
  const CAMERA = { id: "src-camera", displayName: "Camera", rootPath: "/media/camera", isEnabled: true };
  const PHONE_NOTICE =
    "Library refresh found no media files in Phone backup (/media/phone), so it kept the library's 2 items from there. If the folder is on a drive or share, check that it's connected.";
  const LOG_TEXT = "Library refresh kept the items of sources whose folder listed no media files";

  it("names the folder from the source list already loaded, without loading it again, and its log line names none", async () => {
    const t = setup();
    t.store.sources.value = [PHONE, CAMERA];

    t.emit("refreshKeptSources", [{ sourceId: "src-phone", itemCount: 2 }]);
    await settle();

    expect(t.notices).toEqual([PHONE_NOTICE]);
    expect(t.noticeLogs).toEqual([LOG_TEXT]);
    expect(t.requests("/api/sources")).toHaveLength(0);
  });

  it("loads the source list when it hasn't loaded, and names several folders in one notice", async () => {
    const t = setup();
    t.replies.set("/api/sources", () => json([PHONE, CAMERA]));

    t.emit("refreshKeptSources", [
      { sourceId: "src-phone", itemCount: 2 },
      { sourceId: "src-camera", itemCount: 3 }
    ]);
    await settle();

    expect(t.requests("/api/sources")).toHaveLength(1);
    expect(t.store.sources.peek()).toEqual([PHONE, CAMERA]);
    expect(t.notices).toEqual([
      "Library refresh found no media files in Phone backup (/media/phone) and Camera (/media/camera), so it kept the library's 5 items from them. If the folders are on a drive or share, check that it's connected."
    ]);
  });

  it("loads the source list again when it lacks a kept source, and leaves out one it still lacks", async () => {
    const t = setup();
    t.store.sources.value = [CAMERA];
    t.replies.set("/api/sources", () => json([PHONE, CAMERA]));

    t.emit("refreshKeptSources", [
      { sourceId: "src-phone", itemCount: 2 },
      { sourceId: "src-hidden", itemCount: 9 }
    ]);
    await settle();
    expect(t.requests("/api/sources")).toHaveLength(1);
    expect(t.notices).toEqual([PHONE_NOTICE]);

    // A source this session can't see stays left out, without loading the list for it again.
    t.emit("refreshKeptSources", [{ sourceId: "src-hidden", itemCount: 9 }]);
    await settle();
    expect(t.requests("/api/sources")).toHaveLength(1);
    expect(t.notices).toHaveLength(1);
  });

  it("names each folder once for the page's life, so a later run naming it again shows nothing", async () => {
    const t = setup();
    t.store.sources.value = [PHONE, CAMERA];

    t.emit("refreshKeptSources", [{ sourceId: "src-phone", itemCount: 2 }]);
    t.emit("refreshKeptSources", [{ sourceId: "src-phone", itemCount: 2 }]);
    await settle();
    expect(t.notices).toEqual([PHONE_NOTICE]);

    t.emit("refreshKeptSources", [
      { sourceId: "src-phone", itemCount: 2 },
      { sourceId: "src-camera", itemCount: 1 }
    ]);
    await settle();
    expect(t.notices).toEqual([
      PHONE_NOTICE,
      "Library refresh found no media files in Camera (/media/camera), so it kept the library's 1 item from there. If the folder is on a drive or share, check that it's connected."
    ]);
  });

  it("shows nothing when the source list can't load, and tries again on the next event", async () => {
    const t = setup();
    let answer = () => json({}, 500);
    t.replies.set("/api/sources", () => answer());

    t.emit("refreshKeptSources", [{ sourceId: "src-phone", itemCount: 2 }]);
    await settle();
    expect(t.notices).toEqual([]);
    expect(t.relayed).toContain("library=kept-sources-list-failed");

    answer = () => json([PHONE]);
    t.emit("refreshKeptSources", [{ sourceId: "src-phone", itemCount: 2 }]);
    await settle();
    expect(t.notices).toEqual([PHONE_NOTICE]);
  });

  it("logs only the request's line when the source list needs pairing, for the notice and the Filters line", async () => {
    const t = setup();
    t.replies.set("/api/sources", () => json({}, 401));

    t.emit("refreshKeptSources", [{ sourceId: "src-phone", itemCount: 2 }]);
    await settle();
    expect(t.store.pairingRequired.peek()).toBe(true);
    expect(t.notices).toEqual([]);
    expect(t.relayed).not.toContain("library=kept-sources-list-failed");

    // The Filters line loads the list for a source filter once the server is ready.
    t.store.appliedFilter.value = { ...createDefaultFilterState(), includedSourceIds: ["src-phone"] };
    t.emit("serverReady");
    await settle();
    expect(t.requests("/api/sources")).toHaveLength(2);
    expect(t.relayed).not.toContain("library=filter-summary-sources-failed");
    expect(t.relayed).toContain("status=Unauthorized. Pair first. (GET /api/sources) hasCurrent=false attempt=0");
  });
});

describe("selection", () => {
  /** A library whose first page has loaded and whose tab shows, with its grid. */
  async function shown(count = 3) {
    const t = setup();
    t.fakeLibrary.items = libraryItems(count);
    t.emit("serverReady");
    await settle();
    t.showTab();
    const grid = t.mountGrid();
    return { ...t, grid };
  }

  it("a click plays a tile, and one on its check icon or with Shift, Ctrl, or Cmd held selects it instead", async () => {
    const t = await shown();
    t.replies.set("/api/play/item-1", () => json(PLAYED));

    for (const click of [{ onCheck: true }, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      t.library.clickTile("item-2", { ...PLAIN, ...click });
      expect([t.library.selection.active.peek(), t.library.selection.ids()]).toEqual([true, ["item-2"]]);
      t.library.selection.clear();
    }
    expect(t.requests("/api/play/item-2")).toHaveLength(0);

    t.library.clickTile("item-1", PLAIN);
    await settle();
    expect(t.requests("/api/play/item-1")).toHaveLength(1);
    expect(t.library.selection.active.peek()).toBe(false);
  });

  it("while selecting, a click, a Ctrl or Cmd+click, or a long press adds or removes a tile without playing it", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });

    t.library.clickTile("item-2", PLAIN);
    t.library.clickTile("item-3", { ...PLAIN, ctrlKey: true });
    expect(t.library.selection.ids()).toEqual(["item-1", "item-2", "item-3"]);
    t.library.clickTile("item-2", { ...PLAIN, metaKey: true });
    t.library.longPressTile("item-3");
    expect(t.library.selection.ids()).toEqual(["item-1"]);
    t.library.longPressTile("item-2");
    expect(t.library.selection.ids()).toEqual(["item-1", "item-2"]);
    await settle();
    expect(t.requests("/api/play/item-2")).toHaveLength(0);
  });

  it("Shift+click adds the range from the last tile chosen in the loaded order", async () => {
    const t = await shown(6);
    t.library.clickTile("item-5", { ...PLAIN, onCheck: true });
    t.library.clickTile("item-2", { ...PLAIN, shiftKey: true });
    expect(t.library.selection.ids().sort()).toEqual(["item-2", "item-3", "item-4", "item-5"]);
  });

  it("marks the selected tiles on the grid, and on a grid created again", async () => {
    const t = await shown();
    t.library.clickTile("item-2", { ...PLAIN, onCheck: true });
    expect(["item-1", "item-2"].map(t.grid.isSelected)).toEqual([false, true]);

    t.library.selection.clear();
    expect(t.grid.isSelected("item-2")).toBe(false);
    t.library.clickTile("item-3", { ...PLAIN, onCheck: true });
    const again = t.mountGrid();
    expect(["item-2", "item-3"].map(again.isSelected)).toEqual([false, true]);
  });

  it("Select all sends the search and filter the window shows, not text still being typed, and picks every id answered", async () => {
    const t = await shown();
    t.replies.set("/api/library/query-ids", () => json({ ids: ["item-1", "item-2", "item-3", "item-400"] }));
    t.store.appliedFilter.value = { ...createDefaultFilterState(), favoritesMode: "only" };
    t.library.setSearch("clip");
    await t.library.commitQuery();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });

    t.library.setSearch("clip 4");
    await t.library.selectAll();

    expect(t.requests("/api/library/query-ids").map((request) => request.body)).toEqual([
      expect.objectContaining({ search: "clip", filterState: expect.objectContaining({ favoritesMode: "only" }) })
    ]);
    expect(Object.keys(t.requests("/api/library/query-ids")[0]!.body).sort()).toEqual(["filterState", "search"]);
    expect(t.library.selection.count.peek()).toBe(4);
    expect(t.library.selection.has("item-400")).toBe(true);
  });

  it("Select all is disabled while as many items are selected as match", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    t.library.clickTile("item-2", PLAIN);
    expect(t.library.allSelected.peek()).toBe(false);
    t.library.clickTile("item-3", PLAIN);
    expect(t.library.allSelected.peek()).toBe(true);
    t.library.clickTile("item-3", PLAIN);
    expect(t.library.allSelected.peek()).toBe(false);
  });

  it("a press of Select all while one is under way sends nothing, and clearing selection drops its answer, even for a new selection", async () => {
    const t = await shown();
    let answer: () => void = () => {};
    t.replies.set(
      "/api/library/query-ids",
      () => new Promise<Response>((resolve) => (answer = () => resolve(json({ ids: ["item-1", "item-2", "item-3"] }))))
    );
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });

    const first = t.library.selectAll();
    await t.library.selectAll();
    expect(t.requests("/api/library/query-ids")).toHaveLength(1);
    t.library.selection.clear();
    t.library.clickTile("item-2", { ...PLAIN, onCheck: true });
    answer();
    await first;

    expect(t.library.selection.ids()).toEqual(["item-2"]);
    expect(t.notices).toEqual([]);
  });

  it("a Select all that fails says so in the notice, with the server's reason, and logs its status", async () => {
    const t = await shown();
    t.replies.set("/api/library/query-ids", () => json({ error: "The library is busy." }, 503));
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });

    await t.library.selectAll();

    expect(t.notices).toEqual(["Select all failed: The library is busy."]);
    expect(t.noticeLogs).toEqual(["Select all failed (HTTP 503)."]);
    expect(t.library.selection.ids()).toEqual(["item-1"]);
  });

  it("a new search or filter ends selection, and a new sort or the same query keeps it", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });

    t.library.setSortMode("PlayCount");
    t.library.toggleSortDirection();
    await t.library.commitQuery();
    await settle();
    expect(t.library.selection.active.peek()).toBe(true);

    t.store.appliedFilter.value = { ...createDefaultFilterState(), onlyUnrated: true };
    await t.library.commitQuery();
    expect(t.library.selection.active.peek()).toBe(false);

    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    t.library.setSearch("clip");
    await t.library.commitQuery();
    expect(t.library.selection.active.peek()).toBe(false);
  });

  it("removed items leave the selection, which ends when none are left", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    t.library.clickTile("item-2", PLAIN);

    t.emit("itemsRemoved", { itemIds: ["item-1", "item-3"] });
    expect(t.library.selection.ids()).toEqual(["item-2"]);
    t.emit("itemsRemoved", { itemIds: ["item-2"] });
    expect(t.library.selection.active.peek()).toBe(false);
  });

  it("after a reload, selected items that no longer match leave the selection, loaded or not, from the window's search and filter", async () => {
    const t = await shown(300);
    t.store.appliedFilter.value = { ...createDefaultFilterState(), favoritesMode: "only" };
    t.library.setSearch("clip");
    await t.library.commitQuery();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    await t.library.selectAll();
    expect([t.library.selection.count.peek(), t.library.allSelected.peek()]).toEqual([300, true]);

    // The server no longer matches a loaded item and one past the loaded page.
    t.fakeLibrary.items = t.fakeLibrary.items.filter((item) => item.id !== "item-1" && item.id !== "item-250");
    t.emit("refreshCompleted");
    await settle();

    const check = t.requests("/api/library/query-ids").at(-1)!.body;
    expect(Object.keys(check).sort()).toEqual(["filterState", "itemIds", "search"]);
    expect(check).toEqual(expect.objectContaining({ search: "clip", filterState: expect.objectContaining({ favoritesMode: "only" }) }));
    expect(check.itemIds).toHaveLength(300);
    expect(["item-1", "item-250", "item-2", "item-251"].map((id) => t.library.selection.has(id))).toEqual([false, false, true, true]);
    expect([t.library.selection.count.peek(), t.library.matchCount.peek(), t.library.allSelected.peek()]).toEqual([298, 298, true]);
  });

  it("items selected while a check's answer is on its way stay, and a later check replaces one under way", async () => {
    const t = await shown();
    const answers: Array<(ids: string[]) => void> = [];
    t.replies.set(
      "/api/library/query-ids",
      () => new Promise<Response>((resolve) => answers.push((ids) => resolve(json({ ids }))))
    );
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    t.emit("refreshCompleted");
    await settle();
    t.library.clickTile("item-2", PLAIN);
    t.emit("refreshCompleted");
    await settle();
    expect(t.requests("/api/library/query-ids").map((request) => request.body.itemIds)).toEqual([["item-1"], ["item-1", "item-2"]]);

    // The first check's answer comes after the second was sent, so it is dropped.
    answers[0]!([]);
    await settle();
    expect(t.library.selection.ids()).toEqual(["item-1", "item-2"]);

    t.library.clickTile("item-3", PLAIN);
    answers[1]!(["item-2"]);
    await settle();
    expect(t.library.selection.ids()).toEqual(["item-2", "item-3"]);
  });

  it("ending selection drops a check's answer, even for a new selection", async () => {
    const t = await shown();
    let answer: () => void = () => {};
    t.replies.set("/api/library/query-ids", () => new Promise<Response>((resolve) => (answer = () => resolve(json({ ids: [] })))));
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    t.emit("refreshCompleted");
    await settle();
    expect(t.requests("/api/library/query-ids")).toHaveLength(1);

    t.library.selection.clear();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    answer();
    await settle();
    expect(t.library.selection.ids()).toEqual(["item-1"]);
  });

  it("checks nothing after a reload while nothing is selected", async () => {
    const t = await shown();
    t.emit("refreshCompleted");
    await settle();
    expect(t.queries()).toHaveLength(2);
    expect(t.requests("/api/library/query-ids")).toHaveLength(0);
  });

  it("a check that fails keeps the selection, shows nothing, and logs its status", async () => {
    const t = await shown();
    t.replies.set("/api/library/query-ids", () => json({ error: "The library is busy." }, 503));
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });

    t.emit("refreshCompleted");
    await settle();

    expect(t.library.selection.ids()).toEqual(["item-1"]);
    expect([t.notices, t.notified]).toEqual([[], []]);
    expect(t.relayed).toContain("library=selection-check-failed status=503");
  });

  it("hiding the tab closes the Selection actions menu and keeps the selection", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    await t.library.toggleSelectionMenu();
    expect(t.library.selection.menuOpen.peek()).toBe(true);

    t.hideTab();
    expect([t.library.selection.menuOpen.peek(), t.library.selection.ids()]).toEqual([false, ["item-1"]]);
  });
});

describe("menus", () => {
  const POINT = { x: 40, y: 50 };

  /** A library whose first page has loaded and whose tab shows, with its grid. */
  async function shown(items: Array<Record<string, unknown>> = libraryItems(3)) {
    const t = setup();
    t.fakeLibrary.items = items;
    t.emit("serverReady");
    await settle();
    t.showTab();
    const grid = t.mountGrid();
    t.replies.set("/api/bulk/item-state", () => json({ count: 1 }));
    return { ...t, grid };
  }

  type Shown = Awaited<ReturnType<typeof shown>>;

  /** The items of the open context menu, each with a disabled one's reason, or null while none shows. */
  function tileMenuItems(t: Shown): string[] | null {
    const view = t.contextMenu.view.peek();
    return view ? view.groups.flat().map((item) => (item.disabledReason ? `${item.label} (${item.disabledReason})` : item.label)) : null;
  }

  function selectionMenuItems(t: Shown): string[] {
    return t.library.selectionMenuGroups.peek().flat().map((item) => (item.disabledReason ? `${item.label} (${item.disabledReason})` : item.label));
  }

  /** Picks `label` in the open context menu, as a click does: the menu closes, then the action runs. */
  async function pick(t: Shown, label: string): Promise<void> {
    const item = t.contextMenu.view.peek()!.groups.flat().find((candidate) => candidate.label === label)!;
    t.contextMenu.close();
    item.onPick();
    await settle();
  }

  const flagBody = (itemIds: string[], flag: string, value: boolean) => ({ itemIds, flag, value, clientId: "client-1" });

  it("with nothing selected acts on the tile alone, rings it, and reads what applies from its loaded tile", async () => {
    const t = await shown([...libraryItems(2), { ...libraryItems(3)[2]!, isFavorite: true, playCount: 4 }]);

    await t.library.openTileMenu("item-3", POINT);
    expect(t.contextMenu.view.peek()!.point).toEqual(POINT);
    expect(tileMenuItems(t)).toEqual(["Remove from favorites", "Add to blacklist", "Rate…", "Clear playback stats…", "Delete file…"]);
    expect(t.grid.ringed.at(-1)).toBe("item-3");
    expect(t.requests("/api/library/item-summary")).toEqual([]);

    await pick(t, "Remove from favorites");
    expect(t.requests("/api/bulk/item-state").map((request) => request.body)).toEqual([flagBody(["item-3"], "favorite", false)]);
    expect(t.grid.ringed.at(-1)).toBeNull();

    // A tile never played has no stats to clear.
    await t.library.openTileMenu("item-1", POINT);
    expect(tileMenuItems(t)).toEqual(["Add to favorites", "Add to blacklist", "Rate…", "Clear playback stats… (No playback stats to clear)", "Delete file…"]);
  });

  it("on a selected tile acts on the selection, without a ring, and on a tile outside it acts on that tile alone, leaving the selection", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    void t.library.clickTile("item-2", PLAIN);

    await t.library.openTileMenu("item-2", POINT);
    expect(tileMenuItems(t)!.at(-1)).toBe("Delete files…");
    expect(t.grid.ringed.at(-1)).toBeNull();
    await pick(t, "Add to blacklist");

    await t.library.openTileMenu("item-3", POINT);
    expect(tileMenuItems(t)!.at(-1)).toBe("Delete file…");
    expect(t.grid.ringed.at(-1)).toBe("item-3");
    await pick(t, "Add to blacklist");

    expect(t.requests("/api/bulk/item-state").map((request) => request.body)).toEqual([
      flagBody(["item-1", "item-2"], "blacklist", true),
      flagBody(["item-3"], "blacklist", true)
    ]);
    expect(t.library.selection.ids()).toEqual(["item-1", "item-2"]);
  });

  it("shows one menu at a time: a tile's menu closes the Selection actions menu, and that menu closes a tile's", async () => {
    const t = await shown();
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    await t.library.toggleSelectionMenu();
    expect(t.library.selection.menuOpen.peek()).toBe(true);

    await t.library.openTileMenu("item-2", POINT);
    expect([t.library.selection.menuOpen.peek(), t.contextMenu.isOpen.peek(), t.grid.ringed.at(-1)]).toEqual([false, true, "item-2"]);

    await t.library.toggleSelectionMenu();
    expect([t.library.selection.menuOpen.peek(), t.contextMenu.isOpen.peek(), t.grid.ringed.at(-1)]).toEqual([true, false, null]);
  });

  it("a tile's menu closes when its tile leaves the loaded window or a message replaces the grid, but not when another leaves", async () => {
    const t = await shown();
    await t.library.openTileMenu("item-2", POINT);
    t.fakeLibrary.items = libraryItems(2);
    t.emit("itemsRemoved", { itemIds: ["item-3"] });
    await settle();
    expect(t.contextMenu.isOpen.peek()).toBe(true);

    t.fakeLibrary.items = libraryItems(1);
    t.emit("itemsRemoved", { itemIds: ["item-2"] });
    await settle();
    expect([t.contextMenu.isOpen.peek(), t.grid.ringed.at(-1)]).toEqual([false, null]);

    await t.library.openTileMenu("item-1", POINT);
    t.store.compatibilityMessage.value = "Server API version 0 is not supported.";
    t.store.compatibilityBlocked.value = true;
    expect(t.library.body.peek().kind).toBe("message");
    expect(t.contextMenu.isOpen.peek()).toBe(false);
  });

  it("a tile's menu closes when the tab hides and when a selection it acts on ends, while one on a tile alone stays", async () => {
    const t = await shown();
    await t.library.openTileMenu("item-1", POINT);
    t.hideTab();
    expect(t.contextMenu.isOpen.peek()).toBe(false);
    t.showTab();

    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    await t.library.openTileMenu("item-1", POINT);
    t.library.selection.clear();
    expect(t.contextMenu.isOpen.peek()).toBe(false);

    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    await t.library.openTileMenu("item-2", POINT);
    t.library.selection.clear();
    expect(t.contextMenu.isOpen.peek()).toBe(true);
  });

  /** A library of 250 items, 200 of them loaded, all selected with Select all. */
  async function selectedPastLoaded() {
    const t = await shown(libraryItems(250));
    t.library.clickTile("item-1", { ...PLAIN, onCheck: true });
    await t.library.selectAll();
    await settle();
    expect(t.library.selection.count.peek()).toBe(250);
    return t;
  }

  /** Holds the summary read's replies until `answer` is called with a summary, or with a status to fail. */
  function holdSummary(t: Shown) {
    const waiting: Array<(response: Response) => void> = [];
    t.replies.set("/api/library/item-summary", () => new Promise<Response>((resolve) => waiting.push(resolve)));
    return {
      answer(body: unknown, status = 200) {
        for (const resolve of waiting.splice(0)) {
          resolve(json(body, status));
        }
      }
    };
  }

  const ALL_FAVORITES = { count: 250, favoriteCount: 250, blacklistedCount: 0, playedCount: 0 };

  it("asks the server once what a selection past the loaded tiles is, and opens only with its answer", async () => {
    const t = await selectedPastLoaded();
    const summary = holdSummary(t);

    const opening = t.library.toggleSelectionMenu();
    await settle();
    expect(t.library.selection.menuOpen.peek()).toBe(false);
    expect(t.requests("/api/library/item-summary").map((request) => request.body)).toEqual([{ itemIds: t.library.selection.ids() }]);

    summary.answer(ALL_FAVORITES);
    await opening;
    expect(t.library.selection.menuOpen.peek()).toBe(true);
    expect(selectionMenuItems(t)).toEqual([
      "Remove from favorites",
      "Add to blacklist",
      "Rate…",
      "Clear playback stats… (No playback stats to clear)",
      "Delete files…"
    ]);
    expect(t.requests("/api/library/item-summary")).toHaveLength(1);
  });

  it("drops a read under way when Selection actions is pressed again, the selection changes, or the tab hides", async () => {
    const t = await selectedPastLoaded();
    const summary = holdSummary(t);
    const drops = [
      () => void t.library.toggleSelectionMenu(),
      () => void t.library.clickTile("item-2", PLAIN),
      () => t.hideTab()
    ];
    for (const drop of drops) {
      t.showTab();
      const opening = t.library.toggleSelectionMenu();
      await settle();
      drop();
      summary.answer(ALL_FAVORITES);
      await opening;
      expect(t.library.selection.menuOpen.peek()).toBe(false);
    }
  });

  it("opens Selection actions pressed while a tile's menu is still reading, dropping the tile's read", async () => {
    const t = await selectedPastLoaded();
    const summary = holdSummary(t);

    const tileOpening = t.library.openTileMenu("item-1", POINT);
    await settle();
    const opening = t.library.toggleSelectionMenu();
    await settle();
    summary.answer(ALL_FAVORITES);
    await Promise.all([tileOpening, opening]);
    expect([t.library.selection.menuOpen.peek(), t.contextMenu.isOpen.peek()]).toEqual([true, false]);
    expect(t.requests("/api/library/item-summary")).toHaveLength(2);
  });

  it("opens with every add and remove item when the read fails, and logs it, and opens none when it answers 401", async () => {
    const t = await selectedPastLoaded();
    t.replies.set("/api/library/item-summary", () => json({ error: "The library is busy." }, 503));

    await t.library.toggleSelectionMenu();
    expect(t.library.selection.menuOpen.peek()).toBe(true);
    expect(selectionMenuItems(t)).toEqual([
      "Add to favorites",
      "Remove from favorites",
      "Add to blacklist",
      "Remove from blacklist",
      "Rate…",
      "Clear playback stats…",
      "Delete files…"
    ]);
    expect(t.relayed).toContain("library=item-summary-failed status=503");
    expect(t.notices).toEqual([]);

    await t.library.toggleSelectionMenu();
    t.replies.set("/api/library/item-summary", () => json({ error: "Unauthorized" }, 401));
    await t.library.toggleSelectionMenu();
    expect([t.library.selection.menuOpen.peek(), t.store.pairingRequired.peek()]).toEqual([false, true]);
  });
});
