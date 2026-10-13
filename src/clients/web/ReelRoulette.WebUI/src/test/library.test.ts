import { afterEach, describe, expect, it, vi } from "vitest";
import { unauthorizedLogText } from "../api/serverRequest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createLibrary } from "../library/library";
import { LIBRARY_LOAD_TIMEOUT_MESSAGE } from "../library/libraryOverlayModel";
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
    return (await replies.get(path)?.()) ?? json({});
  }) as typeof fetch;
  const relayed: string[] = [];
  /** The store's clock, which a test moves on to relay a line again. */
  const clock = { ms: 0 };
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message),
    now: () => clock.ms
  });
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
    playCurrent: vi.fn((options?: { recordPlayback?: boolean }) => {
      playCalls.push(
        `current=${store.current.peek()?.itemId} closeIfOverlay=${panel.closeIfOverlay.mock.calls.length} recordPlayback=${options?.recordPlayback}`
      );
    })
  };
  const grids: Array<ReturnType<typeof fakeGrid>> = [];
  const frames: Array<() => void> = [];
  /** Each notice's message, and the text it relays when that differs. */
  const notices: string[] = [];
  const noticeLogs: string[] = [];
  const dialogs = {
    notice(message: string, logText = message) {
      notices.push(message);
      noticeLogs.push(logText);
      return Promise.resolve();
    }
  };
  const service = createLibrary({
    config: { apiBaseUrl: "http://server/", sseUrl: "http://server/api/events" },
    store,
    api,
    connection,
    player,
    dialogs,
    panel,
    device: createDeviceStore(null),
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
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "Library load failed: HTTP 500", error: true, live: false }
    });
    expect(t.store.status.peek()).toBe("Library load failed: HTTP 500");

    t.fakeLibrary.items = [];
    await t.library.commitQuery();
    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: "No media in library.", error: false, live: false }
    });
    expect(t.grids).toHaveLength(0);
  });

  it.each([408, 504])("says a load answered with %i timed out in the body, and keeps its status on the status line", async (failure) => {
    const t = setup();
    t.fakeLibrary.failures.push(failure);
    t.emit("serverReady");
    t.showTab();
    await settle();

    expect(t.library.body.peek()).toEqual({
      kind: "message",
      message: { text: LIBRARY_LOAD_TIMEOUT_MESSAGE, error: true, live: false }
    });
    expect(t.store.status.peek()).toBe(`Library load failed: HTTP ${failure}`);
  });

  it("shows no failure for a load or a browse answered with 401, only logs it, and asks for pairing", async () => {
    const t = setup();
    t.fakeLibrary.failures.push(401);
    t.emit("serverReady");
    t.showTab();
    await settle();

    expect(t.library.body.peek()).toEqual({ kind: "message", message: { text: "", error: false, live: false } });
    expect(t.store.status.peek()).toBe("");
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
    expect(t.store.status.peek()).toBe("");
    expect(t.store.pairingRequired.peek()).toBe(true);
    expect(t.relayed.filter((relayed) => relayed.startsWith("status="))).toEqual([line]);
  });

  it("says a load answered with a page that isn't JSON failed, naming its content type", async () => {
    const t = setup();
    t.replies.set("/api/library/query", () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    t.emit("serverReady");
    t.showTab();
    await settle();

    expect(t.library.body.peek()).toMatchObject({
      message: { text: "Library load failed: The server sent an unexpected response (text/html)." }
    });
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

  it("shows a refused, unreachable, or empty play in the notice, drops Loading..., and leaves the panel open", async () => {
    const t = setup();
    t.showTab();

    const plays: Array<[() => Response, string]> = [
      [() => json({ error: "gone", code: "play_item_not_found" }, 404), "Media not found. The file may have moved or been deleted."],
      [() => json({ error: "disabled" }, 409), "This item is unavailable."],
      [() => json({}, 415), "This file type is not supported."],
      [() => json({ error: "Server exploded" }, 500), "Server exploded"],
      [() => json({}, 500), "Playback failed."]
    ];
    for (const [answer, notice] of plays) {
      t.replies.set("/api/play/item-1", answer);
      await t.library.play("item-1");
      expect(t.notices.at(-1)).toBe(notice);
      // The server's text can name a file, so every refusal relays one line.
      expect(t.noticeLogs.at(-1)).toBe("Playback failed");
      expect(t.store.status.peek()).toBe("");
    }
    expect(t.relayed).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=404 code=play_item_not_found");

    t.replies.set("/api/play/item-1", () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    await t.library.play("item-1");
    expect(t.notices.at(-1)).toBe("Playback failed: The server sent an unexpected response (text/html).");

    t.replies.set("/api/play/item-1", () => json({ itemId: "item-1" }));
    await t.library.play("item-1");
    expect([t.notices.at(-1), t.noticeLogs.at(-1)]).toEqual(["Playback failed.", "Playback failed."]);

    await t.library.play("  ");
    expect(t.notices.at(-1)).toBe("Playback unavailable: no library item was selected.");
    expect(t.store.status.peek()).toBe("");

    expect(t.panel.closeIfOverlay).not.toHaveBeenCalled();
    expect(t.library.isOpen()).toBe(true);
    expect(t.player.playCurrent).not.toHaveBeenCalled();
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "reads a play that couldn't reach the server, which the browser calls %j, the same in every browser",
    async (wording) => {
      const t = setup();
      t.replies.set("/api/play/item-1", () => {
        throw new TypeError(wording);
      });
      await t.library.play("item-1");
      expect(t.notices).toEqual(["Playback failed: Couldn't reach the server."]);
      expect(t.relayed).toContain("playback=library-play-error attempt=0 hasCurrent=false message=Couldn't reach the server.");
      expect(t.store.status.peek()).toBe("");
    }
  );

  it("shows only the pairing prompt for a play the server answers with 401, and still relays its line", async () => {
    const t = setup();
    t.replies.set("/api/play/item-1", () => json({}, 401));
    await t.library.play("item-1");

    expect(t.store.pairingRequired.peek()).toBe(true);
    expect(t.notices).toEqual([]);
    expect(t.store.status.peek()).toBe("");
    expect(t.relayed.filter((relayed) => relayed.includes("Unauthorized"))).toEqual([
      "status=Unauthorized. Pair first. (POST /api/play/{itemId}) hasCurrent=false attempt=0"
    ]);
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
    expect(t.notices).toEqual(["Cannot play: server compatibility check failed."]);
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
