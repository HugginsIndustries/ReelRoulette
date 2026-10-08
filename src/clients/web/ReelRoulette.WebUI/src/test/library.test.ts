import { afterEach, describe, expect, it, vi } from "vitest";
import { createLibrary } from "../library/library";
import type { LibraryGridController, LibraryGridCoverage } from "../library/libraryGridController";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
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

/** A stand-in for the grid controller that records what the library asks of it. */
function fakeGrid(onCoverage: (coverage: LibraryGridCoverage) => void, overlay: { style: { display: string } }) {
  const grid = {
    onCoverage,
    contents: [] as Array<{ ids: string[]; searchQuery: string; resetScroll: boolean | undefined }>,
    /** The overlay's `display` each time the deferred layout was flushed. */
    flushes: [] as string[],
    destroyed: false,
    coverage: null as LibraryGridCoverage | null,
    setBrowseContent(input: Parameters<LibraryGridController["setBrowseContent"]>[0]) {
      grid.contents.push({
        ids: input.visibleItems.map((item) => item.id),
        searchQuery: input.searchQuery,
        resetScroll: input.resetScroll
      });
    },
    measureCoverage: () => grid.coverage,
    flushDeferredLayout() {
      grid.flushes.push(overlay.style.display);
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
  const overlay = { style: { display: "none" } };
  const playCalls: string[] = [];
  const player = {
    playCurrent: vi.fn((options?: { recordPlayback?: boolean }) => {
      playCalls.push(
        `current=${store.current.peek()?.itemId} overlay=${overlay.style.display} recordPlayback=${options?.recordPlayback}`
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
    fetch: fetchImpl,
    createGrid(_host, onCoverage) {
      const grid = fakeGrid(onCoverage, overlay);
      grids.push(grid);
      return grid;
    },
    requestFrame: (callback) => frames.push(callback)
  });
  service.attach({ overlay });
  return {
    library: service,
    fakeLibrary: library,
    store,
    overlay,
    player,
    playCalls,
    relayed,
    replies,
    grids,
    queries: () => requests.filter((request) => request.path === "/api/library/query").map((request) => request.body),
    requests: (path: string) => requests.filter((request) => request.path === path),
    emit: (event: keyof ServerConnectionEvents, payload?: unknown) =>
      listeners[event]?.forEach((listener) => listener(payload)),
    runFrames() {
      for (const frame of frames.splice(0)) {
        frame();
      }
    },
    /** Creates the grid when the body asks for it, as the overlay's grid element does when it mounts. */
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
  it("loads the first page when the server is ready, and shows nothing until the overlay opens", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();

    expect(t.queries()).toEqual([
      expect.objectContaining({ search: "", sortMode: "Name", sortDescending: false, offset: 0, limit: 200 })
    ]);
    expect(t.queries()[0].filterState).toMatchObject({ favoritesOnly: false, excludeBlacklisted: true });
    expect(t.library.body.peek()).toEqual({ kind: "blank" });
    expect(t.library.toolbarShown.peek()).toBe(false);
    expect(t.library.summary.peek()).toBeNull();
    expect(t.grids).toHaveLength(0);
  });

  it("opening shows the overlay, the toolbar and totals, and the grid with the loaded tiles", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();

    t.library.open();
    expect(t.overlay.style.display).toBe("flex");
    expect(t.library.isOpen()).toBe(true);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    expect(t.library.toolbarShown.peek()).toBe(true);
    expect(t.library.summary.peek()).toBe("Showing 3 of 3 items");
    const grid = t.mountGrid();
    expect(grid.contents).toEqual([{ ids: ["item-1", "item-2", "item-3"], searchQuery: "", resetScroll: false }]);
    expect(t.queries()).toHaveLength(1);

    t.library.close();
    expect(t.overlay.style.display).toBe("none");
    expect(t.library.isOpen()).toBe(false);
  });

  it("shows loading, error, and empty messages in place of the grid while open", async () => {
    const t = setup();
    t.fakeLibrary.failures.push(500);
    t.library.open();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Loading library…", error: false, live: true }
    });
    expect(t.queries()).toHaveLength(1);

    await settle();
    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: "HTTP 500", error: true, live: false } });
    expect(t.store.status.peek()).toBe("Library load failed: HTTP 500");
    expect(t.library.toolbarShown.peek()).toBe(false);

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
    t.library.open();
    const grid = t.mountGrid();
    t.library.close();

    t.fakeLibrary.failures.push(503);
    await t.library.commitQuery();
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
    expect(t.library.summary.peek()).toBe("Showing 3 of 3 items");
    expect(t.store.status.peek()).toBe("Library load failed: HTTP 503");

    t.library.open();
    expect(t.library.body.peek()).toMatchObject({ kind: "message", message: { text: "Loading library…" } });
    expect(t.library.summary.peek()).toBeNull();
    expect(t.library.toolbarShown.peek()).toBe(false);
    expect(t.queries()).toHaveLength(3);
    expect(grid.flushes).toEqual([]);
  });

  it("updates a hidden grid's tiles, and flushes its deferred layout after the overlay shows", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.library.open();
    const grid = t.mountGrid();
    t.library.close();

    t.fakeLibrary.items = libraryItems(2);
    t.emit("refreshCompleted");
    await settle();
    expect(grid.contents.at(-1)).toEqual({ ids: ["item-1", "item-2"], searchQuery: "", resetScroll: false });
    expect(t.library.summary.peek()).toBe("Showing 2 of 2 items");

    t.library.open();
    expect(grid.flushes).toEqual(["flex"]);
    expect(t.grids).toHaveLength(1);
  });

  it("keeps a new query's scroll to the top for a grid that is about to be created", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.library.open();
    await t.library.commitQuery();

    const grid = t.mountGrid();
    expect(grid.contents).toEqual([{ ids: ["item-1", "item-2", "item-3"], searchQuery: "", resetScroll: true }]);
  });

  it("a reload while the grid shows keeps it and the scroll position", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.library.open();
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
    t.library.open();
    const destroy = t.library.attachGrid({} as HTMLElement);
    destroy();
    expect(t.grids[0]!.destroyed).toBe(true);

    t.library.close();
    t.library.open();
    expect(t.grids[0]!.flushes).toEqual([]);
  });
});

describe("fill", () => {
  it("fills from the grid's coverage only while the overlay is open", async () => {
    const t = setup();
    t.fakeLibrary.items = libraryItems(450);
    t.emit("serverReady");
    await settle();
    t.library.open();
    const grid = t.mountGrid();
    t.library.close();

    grid.onCoverage(NEEDS_FILL);
    await settle();
    expect(t.queries()).toHaveLength(1);

    t.library.open();
    grid.onCoverage(NEEDS_FILL);
    await settle();
    expect(t.queries()).toHaveLength(2);
    expect(t.queries()[1]).toMatchObject({ offset: 200, limit: 200 });
  });

  it("the frame after opening fills from the grid's coverage, unless the overlay closed first", async () => {
    const t = setup();
    t.fakeLibrary.items = libraryItems(450);
    t.emit("serverReady");
    await settle();
    t.library.open();
    t.mountGrid().coverage = NEEDS_FILL;

    t.library.close();
    t.runFrames();
    await settle();
    expect(t.queries()).toHaveLength(1);

    t.library.open();
    t.runFrames();
    await settle();
    expect(t.queries()).toHaveLength(2);
  });

  it("opening loads the first page when there is none yet", async () => {
    const t = setup();
    t.library.open();
    await settle();

    expect(t.queries()).toHaveLength(1);
    expect(t.library.body.peek()).toEqual({ kind: "grid" });
  });
});

describe("search and sort", () => {
  it("search waits until typing stops, and a commit drops the waiting search", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = setup();
    t.library.setSearch("ho");
    await vi.advanceTimersByTimeAsync(299);
    t.library.setSearch("hol");
    await vi.advanceTimersByTimeAsync(299);
    expect(t.queries()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.queries()).toEqual([expect.objectContaining({ search: "hol", offset: 0 })]);

    t.library.setSearch("holi");
    await t.library.commitQuery();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.queries().map((query) => query.search)).toEqual(["hol", "holi"]);
  });

  it("a sort mode starts in its default direction, and the direction label changes when its page arrives", async () => {
    const t = setup();
    t.emit("serverReady");
    await settle();
    t.library.open();
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
  it("joins history, closes the overlay, and then plays without recording the play again", async () => {
    const t = setup();
    t.replies.set("/api/play/item-1", () => json(PLAYED));
    t.library.open();

    await t.library.play(" item-1 ");

    expect(t.requests("/api/play/item-1")[0]!.body).toEqual({ clientId: "client-1", sessionId: "session-1" });
    expect(t.playCalls).toEqual(["current=item-1 overlay=none recordPlayback=false"]);
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

  it("reports a refused, unauthorized, or unreachable play and leaves the overlay open", async () => {
    const t = setup();
    t.library.open();

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

    expect(t.overlay.style.display).toBe("flex");
    expect(t.player.playCurrent).not.toHaveBeenCalled();
  });

  it("neither opens nor plays while the server is incompatible", async () => {
    const t = setup();
    t.store.compatibilityBlocked.value = true;

    t.library.open();
    await t.library.play("item-1");

    expect(t.overlay.style.display).toBe("none");
    expect(t.library.isOpen()).toBe(false);
    expect(t.store.status.peek()).toBe("Cannot play: server compatibility check failed.");
    expect(t.requests("/api/play/item-1")).toHaveLength(0);
    expect(t.queries()).toHaveLength(0);
  });
});

describe("events", () => {
  it("a header filter change and a resync start over or reload, and favorite and playback events update the window", async () => {
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

  it("detaching the overlay while it is open counts as closed, and opening without it does nothing", async () => {
    const t = setup();
    t.library.open();
    t.library.detach();

    expect(t.library.isOpen()).toBe(false);
    t.library.open();
    expect(t.library.isOpen()).toBe(false);
  });
});
