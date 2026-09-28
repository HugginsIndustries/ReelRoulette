import { describe, expect, it } from "vitest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import { createDefaultBrowseControls, type LibraryBrowseControls } from "../library/libraryBrowseModel";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import {
  LIBRARY_QUERY_WINDOW_SIZE,
  createAutoTagScanRequest,
  createLibraryQuerySession,
  libraryQueryReloadWindows,
  libraryQueryShouldFill,
  libraryQueryTileEffect,
  type LibraryQueryPage,
  type LibraryQueryRequest
} from "../library/libraryQuerySession";

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

  it("reloads the saved window for a favorite while hidden when the default blacklist filter is on", async () => {
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      return page([item("a", { isFavorite: calls.length > 1 })], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);
    session.noteScroll(80);

    await session.applyFavorite({ itemId: "a", isFavorite: true, isBlacklisted: false });

    expect(calls).toEqual([0, 0]);
    expect(session.snapshot().items[0]?.isFavorite).toBe(true);
    expect(session.snapshot().scrollTop).toBe(80);
  });

  it("patches playback while hidden and reloads when the sort can change order", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a", { playCount: calls > 1 ? 4 : 1 })], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);

    await session.applyPlayback({ path: "/media/a.mp4", playCount: 3 });
    expect(calls).toBe(1);
    expect(session.snapshot().items[0]?.playCount).toBe(3);

    await session.resetQuery(createDefaultFilterState(), controls({ sortMode: "PlayCount", sortDescending: true }));
    const afterSort = calls;
    await session.applyPlayback({ path: "/media/a.mp4", playCount: 4 });
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

    const reloading = session.applyPlayback({ path: "/media/kept-0.mp4", playCount: 2 });
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

  it("reloads a tag filter and patches tags when no tag filter is active", async () => {
    const calls: string[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(String(request.filterState.selectedTags));
      return page([item("a", { tags: calls.length > 1 ? ["Night"] : ["Day"] })], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    await session.applyTags({ itemIds: ["a"], addedTags: ["Night"], removedTags: ["Day"] });
    expect(session.snapshot().items[0]?.tags).toEqual(["Night"]);
    expect(calls).toHaveLength(1);

    await session.resetQuery({ ...createDefaultFilterState(), selectedTags: ["Night"] }, controls());
    await session.applyTags({ itemIds: ["other"], addedTags: ["Night"], removedTags: [] });
    expect(calls).toHaveLength(3);
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
  it("reloads when a favorite, playback, or tag update can change membership or order", () => {
    const open = createDefaultFilterState();
    expect(libraryQueryTileEffect("favorite", open, "Name")).toBe("reload");
    expect(libraryQueryTileEffect("favorite", { ...open, excludeBlacklisted: false }, "Name")).toBe("patch");
    expect(libraryQueryTileEffect("playback", open, "Name")).toBe("patch");
    expect(libraryQueryTileEffect("playback", open, "LastPlayed")).toBe("reload");
    expect(libraryQueryTileEffect("playback", { ...open, onlyNeverPlayed: true }, "Name")).toBe("reload");
    expect(libraryQueryTileEffect("tags", open, "Name")).toBe("patch");
    expect(libraryQueryTileEffect("tags", { ...open, excludedTags: ["Skip"] }, "Name")).toBe("reload");
  });

  it("sizes a reload to the loaded count", () => {
    expect(libraryQueryReloadWindows(0)).toEqual([{ offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE }]);
    expect(libraryQueryReloadWindows(LIBRARY_QUERY_WINDOW_SIZE + 20)).toEqual([
      { offset: 0, limit: LIBRARY_QUERY_WINDOW_SIZE },
      { offset: LIBRARY_QUERY_WINDOW_SIZE, limit: 20 }
    ]);
  });

  it("sends scoped auto-tag with no path list", () => {
    expect(createAutoTagScanRequest(false)).toEqual({ scanFullLibrary: false, itemIds: [] });
    expect(createAutoTagScanRequest(true)).toEqual({ scanFullLibrary: true, itemIds: [] });
  });
});
