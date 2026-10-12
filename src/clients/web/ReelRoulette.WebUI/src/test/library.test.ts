import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createLibrary } from "../library/library";
import type { LibraryGridController, LibraryGridCoverage } from "../library/libraryGridController";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import type { ServerConnection, ServerConnectionEvents } from "../state/serverConnection";

const PLAYED: PlayingItem = {
  id: "/media/clip 1.mp4",
  itemId: "item-1",
  displayName: "clip 1.mp4",
  mediaType: "video",
  durationSeconds: 60,
  mediaUrl: "/api/media/item-1?token=t",
  isFavorite: false,
  isBlacklisted: false
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
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
function fakeGrid(onCoverage: (coverage: LibraryGridCoverage) => void, page: FakePage) {
  const grid = {
    onCoverage,
    contents: [] as Array<{ ids: string[]; resetScroll: boolean | undefined }>,
    /** Each playing item id the library marked, the first when the grid was created. */
    playing: [] as Array<string | null>,
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

function setup() {
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
    if (path === "/api/library/query") {
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
    return (await replies.get(path)?.()) ?? json({});
  }) as typeof fetch;
  const relayed: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message)
  });
  const api = createAppApi("http://server", { onUnauthorized: () => {}, fetch: fetchImpl });
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
    playCurrent: vi.fn((options?: { recordPlayback?: boolean }) => {
      playCalls.push(
        `current=${store.current.peek()?.itemId} closeIfOverlay=${panel.closeIfOverlay.mock.calls.length} recordPlayback=${options?.recordPlayback}`
      );
    })
  };
  const grids: Array<ReturnType<typeof fakeGrid>> = [];
  const frames: Array<() => void> = [];
  const service = createLibrary({
    config: { apiBaseUrl: "http://server/", sseUrl: "http://server/api/events" },
    store,
    api,
    connection,
    player,
    panel,
    device: createDeviceStore(null),
    fetch: fetchImpl,
    createGrid(_host, onCoverage) {
      const grid = fakeGrid(onCoverage, page);
      grids.push(grid);
      return grid;
    },
    requestFrame: (callback) => frames.push(callback)
  });
  service.attach();
  return {
    library: service,
    fakeLibrary: library,
    store,
    page,
    panel,
    player,
    playCalls,
    relayed,
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
    expect(t.queries()[0].filterState).toMatchObject({ favoritesOnly: false, excludeBlacklisted: true });
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
    expect(t.library.summary.peek()).toBe("Showing 3 of 3 items");
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
      message: { text: "Loading library…", error: false, live: true }
    });
    expect(t.queries()).toHaveLength(1);

    await settle();
    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: "HTTP 500", error: true, live: false } });
    expect(t.store.status.peek()).toBe("Library load failed: HTTP 500");

    t.fakeLibrary.items = [];
    await t.library.commitQuery();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "No media in library.", error: false, live: false }
    });
    expect(t.grids).toHaveLength(0);
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
    expect(t.library.summary.peek()).toBe("Showing 3 of 3 items");
    expect(t.store.status.peek()).toBe("Library load failed: HTTP 503");

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
    expect(t.library.summary.peek()).toBe("Showing 2 of 2 items");

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
    expect(t.queries()).toEqual([expect.objectContaining({ filterState: expect.objectContaining({ favoritesOnly: true }), sortMode: "Duration" })]);

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
      message: { text: "Loading library…", error: false, live: true }
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
    expect(t.library.directionLabel.peek()).toBe("Most Plays → Least Plays");

    t.library.toggleSortDirection();
    await settle();
    expect(t.queries()[2]).toMatchObject({ sortMode: "PlayCount", sortDescending: false });
    expect(t.library.directionLabel.peek()).toBe("Least Plays → Most Plays");
  });
});

describe("play", () => {
  it("joins history, closes the panel as the overlay, and then plays without recording the play again", async () => {
    const t = setup();
    t.replies.set("/api/play/item-1", () => json(PLAYED));
    t.showTab();

    await t.library.play(" item-1 ");

    expect(t.requests("/api/play/item-1")[0]!.body).toEqual({ clientId: "client-1", sessionId: "session-1" });
    expect(t.playCalls).toEqual(["current=item-1 closeIfOverlay=1 recordPlayback=false"]);
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

    const first = t.library.play("item-1");
    expect(t.store.status.peek()).toBe("Loading...");
    await t.library.play("item-1");
    answer();
    await first;

    expect(t.requests("/api/play/item-1")).toHaveLength(1);
    expect(t.player.playCurrent).toHaveBeenCalledTimes(1);
  });

  it("reports a refused, unauthorized, or unreachable play and leaves the panel open", async () => {
    const t = setup();
    t.showTab();

    t.replies.set("/api/play/item-1", () => json({ error: "gone", code: "play_item_not_found" }, 404));
    await t.library.play("item-1");
    expect(t.store.status.peek()).toBe("Media not found. The file may have moved or been deleted.");
    expect(t.relayed).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=404 code=play_item_not_found");

    t.replies.set("/api/play/item-1", () => json({}, 401));
    await t.library.play("item-1");
    expect(t.store.status.peek()).toBe("Unauthorized. Pair first.");
    expect(t.store.pairingRequired.peek()).toBe(true);

    t.replies.set("/api/play/item-1", () => {
      throw new TypeError("Failed to fetch");
    });
    await t.library.play("item-1");
    expect(t.store.status.peek()).toBe("Playback failed: Failed to fetch");
    expect(t.relayed).toContain("playback=library-play-error attempt=0 hasCurrent=false message=Failed to fetch");

    t.replies.set("/api/play/item-1", () => json({ itemId: "item-1" }));
    await t.library.play("item-1");
    expect(t.store.status.peek()).toBe("Playback failed.");

    await t.library.play("  ");
    expect(t.store.status.peek()).toBe("Playback unavailable: no library item was selected.");

    expect(t.panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(t.library.isOpen()).toBe(true);
    expect(t.player.playCurrent).not.toHaveBeenCalled();
  });

  it("shows why in place of the library, and neither loads nor plays, while the server is incompatible", async () => {
    const t = setup();
    t.store.compatibilityMessage.value = "Server API version 0 is not supported.";
    t.store.compatibilityBlocked.value = true;

    t.showTab();
    await t.library.play("item-1");
    await settle();

    expect(t.library.isOpen()).toBe(true);
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Server API version 0 is not supported.", error: true, live: false }
    });
    expect(t.library.summary.peek()).toBeNull();
    expect(t.panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(t.player.playCurrent).not.toHaveBeenCalled();
    expect(t.store.status.peek()).toBe("Cannot play: server compatibility check failed.");
    expect(t.requests("/api/play/item-1")).toHaveLength(0);
    expect(t.queries()).toHaveLength(0);
  });
});

describe("events", () => {
  it("a preset pick and a resync start over or reload, and favorite and playback events update the window", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();

    t.fakeLibrary.items = libraryItems(3, { isFavorite: true });
    t.store.presets.value = [{ id: "fav", name: "Favorites", filterState: { favoritesOnly: true } }];
    t.store.pickHeaderPreset("fav");
    await settle();
    expect(t.queries().at(-1)).toMatchObject({ filterState: { favoritesOnly: true }, offset: 0, limit: 200 });
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

  it("detaching the tab's view while it is open counts as closed, and opening without it does nothing", async () => {
    const t = setup();
    t.library.open();
    t.library.detach();

    expect(t.library.isOpen()).toBe(false);
    t.library.open();
    expect(t.library.isOpen()).toBe(false);
  });
});
