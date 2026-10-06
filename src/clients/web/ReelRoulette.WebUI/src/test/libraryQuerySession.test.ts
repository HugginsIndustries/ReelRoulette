import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createDefaultBrowseControls, type LibraryBrowseControls } from "../library/libraryBrowseModel";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import {
  LIBRARY_QUERY_RELOAD_LIMIT,
  LIBRARY_QUERY_WINDOW_SIZE,
  createAutoTagScanRequest,
  createLibraryQuerySession,
  libraryQueryReloadWindows,
  libraryQueryShouldFill,
  libraryQueryTagSaveEffect,
  libraryQueryTileEffect,
  type LibraryQueryPage,
  type LibraryQueryRequest,
  type LibraryTileChange,
  type LibraryTileEffectFilter
} from "../library/libraryQuerySession";

interface TileEffectCase {
  name: string;
  event: LibraryTileChange["kind"];
  loaded: boolean;
  before?: LibraryTileChange["before"];
  after?: LibraryTileChange["after"];
  addedTags?: string[];
  removedTags?: string[];
  filter: LibraryTileEffectFilter;
  sortMode: string;
  expected: "patch" | "reload";
}

const tileEffectCases = JSON.parse(
  readFileSync(new URL("../../../../../../shared/fixtures/library-tile-effect.json", import.meta.url), "utf8")
) as TileEffectCase[];

function item(id: string, overrides: Partial<LibraryProjectionItem> = {}): LibraryProjectionItem {
  return {
    id,
    sourceId: "s1",
    fileName: `${id}.mp4`,
    fullPath: `/media/${id}.mp4`,
    relativePath: `${id}.mp4`,
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: 10,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: true,
    thumbnailVersion: "v1",
    thumbnailWidth: 160,
    thumbnailHeight: 90,
    ...overrides
  };
}

function page(items: LibraryProjectionItem[], totalCount: number, searchBaselineCount: number): LibraryQueryPage {
  return { items, totalCount, searchBaselineCount };
}

function controls(overrides: Partial<LibraryBrowseControls> = {}): LibraryBrowseControls {
  return { ...createDefaultBrowseControls(), ...overrides };
}

describe("libraryQuerySession", () => {
  it("loads the first window and reads header counts from the server totals", async () => {
    const calls: LibraryQueryRequest[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request);
      return page([item("a")], 10, 25);
    });

    await session.ensureLoaded(createDefaultFilterState(), controls({ searchQuery: "clip" }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      search: "clip",
      sortMode: "Name",
      sortDescending: false,
      offset: 0,
      limit: LIBRARY_QUERY_WINDOW_SIZE
    });
    expect(calls[0]?.filterState.excludeBlacklisted).toBe(true);
    const snap = session.snapshot();
    expect(snap.summaryText).toBe("Showing 10 of 25 items");
    expect(snap.items).toHaveLength(1);
    expect(snap.phase).toBe("ready");
  });

  it("requests the next window when the loaded rows do not cover the viewport", async () => {
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      if (request.offset === 0) {
        return page(
          Array.from({ length: LIBRARY_QUERY_WINDOW_SIZE }, (_, index) => item(`a-${index}`)),
          450,
          450
        );
      }
      return page([item("next")], 450, 450);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);

    expect(libraryQueryShouldFill(LIBRARY_QUERY_WINDOW_SIZE, 450, 5000, 100)).toBe(false);
    await session.considerFill(5000, 100);
    expect(calls).toEqual([0]);

    expect(libraryQueryShouldFill(LIBRARY_QUERY_WINDOW_SIZE, 450, 100, 0)).toBe(true);
    await session.considerFill(100, 0);
    expect(calls).toEqual([0, LIBRARY_QUERY_WINDOW_SIZE]);
    expect(session.snapshot().items).toHaveLength(LIBRARY_QUERY_WINDOW_SIZE + 1);
  });

  it("does not fill while the overlay is hidden", async () => {
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      return page(
        Array.from({ length: LIBRARY_QUERY_WINDOW_SIZE }, (_, index) => item(`a-${index}`)),
        450,
        450
      );
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);
    await session.considerFill(100, 0);
    expect(calls).toEqual([0]);
  });

  it("keeps the loaded window and scroll position across hide and show", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);
    session.noteScroll(400);
    session.setOverlayVisible(false);
    session.setOverlayVisible(true);
    expect(calls).toBe(1);
    expect(session.snapshot().scrollTop).toBe(400);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("requeries from the first page when the filter changes while hidden", async () => {
    const calls: Array<{ offset: number; favoritesOnly: unknown }> = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push({ offset: request.offset, favoritesOnly: request.filterState.favoritesOnly });
      return page([item(request.filterState.favoritesOnly ? "fav" : "all")], 1, 4);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);
    session.noteScroll(250);

    await session.resetQuery({ ...createDefaultFilterState(), favoritesOnly: true }, controls());
    session.setOverlayVisible(true);

    expect(calls.map((call) => call.favoritesOnly)).toEqual([false, true]);
    expect(calls[1]?.offset).toBe(0);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["fav"]);
    expect(session.snapshot().scrollTop).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it("patches a favorite while hidden when membership cannot change", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    const filter = { ...createDefaultFilterState(), excludeBlacklisted: false };
    await session.ensureLoaded(filter, controls());
    session.setOverlayVisible(false);

    await session.applyFavorite({ itemId: "a", isFavorite: true, isBlacklisted: false });

    expect(calls).toBe(1);
    expect(session.snapshot().items[0]?.isFavorite).toBe(true);
  });

  it("patches a favorite on a loaded tile under the default filter and name sort without a query", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a"), item("b")], 2, 2);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());

    await session.applyFavorite({ itemId: "a", path: "/media/a.mp4", isFavorite: true, isBlacklisted: false });
    await session.applyPlayback({ itemId: "b", path: "/media/b.mp4", playCount: 1 });

    expect(calls).toBe(1);
    expect(session.snapshot().items[0]?.isFavorite).toBe(true);
    expect(session.snapshot().items[1]?.playCount).toBe(1);
  });

  it("reloads the saved window while hidden when a loaded tile is blacklisted under the default filter", async () => {
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      return page(calls.length > 1 ? [item("b")] : [item("a"), item("b")], calls.length > 1 ? 1 : 2, 2);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);
    session.noteScroll(80);

    await session.applyFavorite({ itemId: "a", isFavorite: false, isBlacklisted: true });

    expect(calls).toEqual([0, 0]);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["b"]);
    expect(session.snapshot().scrollTop).toBe(80);
  });

  it("reloads for a favorite on an item that is not loaded only when it could enter the window", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());

    await session.applyFavorite({ itemId: "other", isFavorite: false, isBlacklisted: true });
    expect(calls).toBe(1);

    await session.applyFavorite({ itemId: "other", isFavorite: true, isBlacklisted: false });
    expect(calls).toBe(2);
  });

  it("patches a favorite on an item outside the loaded window from the event's previous values", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());

    await session.applyFavorite({
      itemId: "other",
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: false
    });
    expect(calls).toBe(1);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["a"]);

    // A favorite clears blacklist, so a blacklisted item enters the default filter and the window reloads.
    await session.applyFavorite({
      itemId: "blacklisted",
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: true
    });
    expect(calls).toBe(2);
  });

  it("applies favorite, playback, and tag events to the tile with that id when two paths differ only in case", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page(
        [
          item("id-upper", { fileName: "Clip.mp4", fullPath: "/media/Clip.mp4" }),
          item("id-lower", { fileName: "clip.mp4", fullPath: "/media/clip.mp4" })
        ],
        2,
        2
      );
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());

    await session.applyFavorite({
      itemId: "id-lower",
      path: "/media/clip.mp4",
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: false
    });
    await session.applyPlayback({ itemId: "id-lower", path: "/media/clip.mp4", playCount: 2 });
    await session.applyTags({ resolvedItemIds: ["id-lower"], addedTags: ["Night"], removedTags: [] });

    const [upper, lower] = session.snapshot().items;
    expect(calls).toBe(1);
    expect([upper?.isFavorite, lower?.isFavorite]).toEqual([false, true]);
    expect([upper?.playCount, lower?.playCount]).toEqual([0, 2]);
    expect([upper?.tags, lower?.tags]).toEqual([[], ["Night"]]);
  });

  it("patches playback while hidden and reloads when the sort can change order", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a", { playCount: calls > 1 ? 4 : 1 })], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);

    await session.applyPlayback({ itemId: "a", path: "/media/a.mp4", playCount: 3 });
    expect(calls).toBe(1);
    expect(session.snapshot().items[0]?.playCount).toBe(3);

    await session.resetQuery(createDefaultFilterState(), controls({ sortMode: "PlayCount", sortDescending: true }));
    const afterSort = calls;
    await session.applyPlayback({ itemId: "a", path: "/media/a.mp4", playCount: 4 });
    expect(calls).toBe(afterSort + 1);
    expect(session.snapshot().scrollTop).toBe(0);
  });

  it("resync reloads the loaded window through list query", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push({ offset: request.offset, limit: request.limit });
      return page([item(calls.length === 1 ? "before" : "after")], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);
    session.noteScroll(40);

    await session.resync();

    expect(calls).toEqual([
      { offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE },
      { offset: 0, limit: 1 }
    ]);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["after"]);
    expect(session.snapshot().scrollTop).toBe(40);
  });

  it("drops a further page that is still in flight when a tile update arrives", async () => {
    let releaseAppend: (page: LibraryQueryPage) => void = () => {};
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      if (request.offset === LIBRARY_QUERY_WINDOW_SIZE) {
        return await new Promise<LibraryQueryPage>((resolve) => {
          releaseAppend = resolve;
        });
      }
      return page(
        Array.from({ length: request.limit }, (_, index) => item(`kept-${request.offset + index}`)),
        450,
        450
      );
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);
    const filling = session.considerFill(100, 0);
    await Promise.resolve();
    expect(calls).toContain(LIBRARY_QUERY_WINDOW_SIZE);

    const reloading = session.applyPlayback({ itemId: "kept-0", path: "/media/kept-0.mp4", playCount: 2 });
    await reloading;
    releaseAppend(page([item("stale-append")], 450, 450));
    await filling;

    expect(session.snapshot().items.some((entry) => entry.id === "stale-append")).toBe(false);
    expect(session.snapshot().items[0]?.playCount).toBe(0);
    expect(calls.filter((offset) => offset === 0).length).toBeGreaterThan(1);
  });

  it("retries a failed further page after the scroll position changes", async () => {
    let failAppend = true;
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      if (request.offset > 0 && failAppend) {
        throw new Error("offline");
      }
      return page(
        Array.from({ length: request.limit }, (_, index) => item(`a-${request.offset + index}`)),
        450,
        450
      );
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);
    session.noteScroll(10);

    await session.considerFill(100, 0);
    const failedAppends = calls.filter((offset) => offset > 0).length;
    expect(failedAppends).toBe(1);
    await session.considerFill(100, 0);
    expect(calls.filter((offset) => offset > 0)).toHaveLength(failedAppends);

    session.noteScroll(10);
    await session.considerFill(100, 0);
    expect(calls.filter((offset) => offset > 0)).toHaveLength(failedAppends);

    failAppend = false;
    session.noteScroll(80);
    await session.considerFill(100, 0);
    expect(calls.filter((offset) => offset > 0).length).toBeGreaterThan(failedAppends);
    expect(session.snapshot().items.length).toBeGreaterThan(LIBRARY_QUERY_WINDOW_SIZE);
  });

  it("reads an open first-page query again instead of replacing it with a reload", async () => {
    let releaseFirst: (page: LibraryQueryPage) => void = () => {};
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      if (calls.length === 1) {
        return await new Promise<LibraryQueryPage>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return page([item("fresh", { isFavorite: true })], 1, 1);
    });
    const loading = session.ensureLoaded(createDefaultFilterState(), controls());
    await Promise.resolve();
    const updating = session.applyFavorite({ itemId: "missing", isFavorite: true, isBlacklisted: false });
    await Promise.resolve();
    releaseFirst(page([item("stale")], 1, 1));
    await Promise.all([loading, updating]);

    expect(calls).toEqual([0, 0]);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["fresh"]);
  });

  it("reads an open new query again from the top when the loaded window reloads", async () => {
    let holdSearch = true;
    let releaseSearch: (page: LibraryQueryPage) => void = () => {};
    const calls: Array<{ search: string; offset: number; limit: number }> = [];
    const scrolls: string[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push({ search: request.search, offset: request.offset, limit: request.limit });
      if (request.search === "clip" && holdSearch) {
        holdSearch = false;
        return await new Promise<LibraryQueryPage>((resolve) => {
          releaseSearch = resolve;
        });
      }
      return page(
        Array.from({ length: request.limit }, (_, index) => item(`tile-${request.offset + index}`)),
        8_000,
        8_000
      );
    });
    session.setListener((event) => scrolls.push(event.scroll));
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);
    await session.considerFill(0, 1);
    expect(session.snapshot().items.length).toBeGreaterThan(LIBRARY_QUERY_WINDOW_SIZE);
    session.noteScroll(400);
    calls.length = 0;
    scrolls.length = 0;

    const searching = session.resetQuery(createDefaultFilterState(), controls({ searchQuery: "clip" }));
    const reloading = session.reloadLoaded();
    releaseSearch(page([item("stale")], 1, 1));
    await Promise.all([searching, reloading]);

    expect(calls).toEqual([
      { search: "clip", offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE },
      { search: "clip", offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE }
    ]);
    expect(session.snapshot().items).toHaveLength(LIBRARY_QUERY_WINDOW_SIZE);
    expect(session.snapshot().scrollTop).toBe(0);
    expect(scrolls.at(-1)).toBe("top");
  });

  it("reloads a tag filter and patches tags when no tag filter is active", async () => {
    const calls: string[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(String(request.filterState.selectedTags));
      return page([item("a", { tags: calls.length > 1 ? ["Night"] : ["Day"] })], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    await session.applyTags({ resolvedItemIds: ["a"], addedTags: ["Night"], removedTags: ["Day"] });
    expect(session.snapshot().items[0]?.tags).toEqual(["Night"]);
    expect(calls).toHaveLength(1);

    await session.resetQuery({ ...createDefaultFilterState(), selectedTags: ["Night"] }, controls());
    await session.applyTags({ resolvedItemIds: ["other"], addedTags: ["Night"], removedTags: [] });
    expect(calls).toHaveLength(3);

    await session.applyTags({ resolvedItemIds: ["a"], addedTags: ["Beach"], removedTags: [] });
    expect(calls).toHaveLength(3);
    expect(session.snapshot().items[0]?.tags).toEqual(["Night", "Beach"]);

    await session.applyTags({ resolvedItemIds: ["a"], addedTags: [], removedTags: ["Night"] });
    expect(calls).toHaveLength(4);
  });

  it("reloads a catalog rename or delete under any tag filter", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a", { tags: ["Day"] })], 1, 1);
    });
    await session.ensureLoaded({ ...createDefaultFilterState(), selectedTags: ["Beach"] }, controls());

    await session.applyTags({ resolvedItemIds: ["a"], addedTags: ["Dawn"], removedTags: ["Day"], catalogReplacedTag: "Day" });

    expect(calls).toBe(2);
  });

  it("reloads with a tag name revised on the stored filter", async () => {
    const calls: string[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(String(request.filterState.selectedTags));
      return page([item("a")], 1, 1);
    });
    await session.ensureLoaded({ ...createDefaultFilterState(), selectedTags: ["Day"] }, controls());
    session.reviseStoredFilter((selected) => {
      selected[0] = "Evening";
    });
    await session.reloadLoaded();
    expect(calls).toEqual(["Day", "Evening"]);
  });
});

describe("library query decisions", () => {
  it.each(tileEffectCases.map((entry) => [entry.name, entry] as const))("matches the shared fixture: %s", (_name, entry) => {
    const change: LibraryTileChange = {
      kind: entry.event,
      loaded: entry.loaded,
      before: entry.before ?? null,
      after: entry.after ?? null,
      addedTags: entry.addedTags ?? [],
      removedTags: entry.removedTags ?? []
    };
    expect(libraryQueryTileEffect(change, entry.filter, entry.sortMode)).toBe(entry.expected);
  });

  it("reloads a tag save made here under any tag filter", () => {
    const open = createDefaultFilterState();
    expect(libraryQueryTagSaveEffect(open)).toBe("patch");
    expect(libraryQueryTagSaveEffect({ ...open, excludedTags: ["Skip"] })).toBe("reload");
  });

  it("sizes a reload to the loaded count, one request for up to the reload limit", () => {
    expect(libraryQueryReloadWindows(0)).toEqual([{ offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE }]);
    expect(libraryQueryReloadWindows(LIBRARY_QUERY_WINDOW_SIZE + 20)).toEqual([
      { offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE + 20 }
    ]);
    expect(libraryQueryReloadWindows(LIBRARY_QUERY_RELOAD_LIMIT)).toEqual([
      { offset: 0, limit: LIBRARY_QUERY_RELOAD_LIMIT }
    ]);
    expect(libraryQueryReloadWindows(12_000)).toEqual([
      { offset: 0, limit: LIBRARY_QUERY_RELOAD_LIMIT },
      { offset: LIBRARY_QUERY_RELOAD_LIMIT, limit: 2_000 }
    ]);
  });

  it("reloads 5,000 loaded tiles in one request", async () => {
    const calls: Array<{ offset: number; limit: number }> = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push({ offset: request.offset, limit: request.limit });
      return page(
        Array.from({ length: request.limit }, (_, index) => item(`tile-${request.offset + index}`)),
        8_000,
        8_000
      );
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);
    while (session.snapshot().items.length < 5_000) {
      await session.considerFill(0, 1);
    }
    calls.length = 0;

    await session.reloadLoaded();

    expect(calls).toEqual([{ offset: 0, limit: 5_000 }]);
    expect(session.snapshot().items).toHaveLength(5_000);
  });

  it("sends scoped auto-tag with no path list", () => {
    expect(createAutoTagScanRequest(false)).toEqual({ scanFullLibrary: false, itemIds: [] });
    expect(createAutoTagScanRequest(true)).toEqual({ scanFullLibrary: true, itemIds: [] });
  });
});
