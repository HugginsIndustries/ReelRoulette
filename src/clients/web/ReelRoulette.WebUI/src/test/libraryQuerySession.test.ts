import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HttpStatusError, ServerUnreachableError } from "../api/serverRequest";
import { createDefaultFilterState, filterStateFromApiObject, type ApiFilterState, type FilterState } from "../filter/filterStateModel";
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
  type LibraryTileChange
} from "../library/libraryQuerySession";
import { REMOTE_CONNECTIONS_OFF } from "./serverReasons";

interface TileEffectCase {
  name: string;
  event: LibraryTileChange["kind"];
  loaded: boolean;
  before?: LibraryTileChange["before"];
  after?: LibraryTileChange["after"];
  addedTags?: string[];
  removedTags?: string[];
  rating?: number | null;
  previousRating?: number | null;
  /** A filter as the wire carries it, read the way the WebUI reads one. */
  filter: ApiFilterState;
  sortMode: string;
  expected: "patch" | "reload";
}

const tileEffectCases = JSON.parse(
  readFileSync(new URL("./fixtures/library-tile-effect.json", import.meta.url), "utf8")
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
    dateAddedUtcMs: null,
    dateCreatedUtcMs: null,
    durationSeconds: 10,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    peakDb: null,
    rating: null,
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

/** Height of the rows holding the last loaded page, as the grid reports it. */
const LAST_PAGE_HEIGHT = 6_000;

describe("libraryQuerySession", () => {
  it("sends Only files this browser can play with the filter when it applies", async () => {
    const calls: LibraryQueryRequest[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request);
      return page([item("a")], 1, 25);
    });

    await session.ensureLoaded({ ...createDefaultFilterState(), onlyBrowserPlayable: true }, controls());

    expect(calls[0]?.filterState.onlyBrowserPlayable).toBe(true);
  });

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
    expect(calls[0]?.filterState.blacklistedMode).toBe("excluded");
    const snap = session.snapshot();
    expect(snap.summary).toBe("10 / 25 shown");
    expect(snap.items).toHaveLength(1);
    expect(snap.phase).toBe("ready");
  });

  it("matches by the filter and search of the query it shows, which a new sort doesn't change", async () => {
    const session = createLibraryQuerySession(async () => page([item("a")], 1, 1));
    const favorites: FilterState = { ...createDefaultFilterState(), favoritesMode: "only" };
    await session.resetQuery(favorites, controls({ searchQuery: "clip" }));

    expect(session.matchQuery()).toEqual({ filterState: expect.objectContaining({ favoritesMode: "only" }), search: "clip" });
    expect(session.changesMatch({ ...favorites }, controls({ searchQuery: "clip", sortMode: "PlayCount", sortDescending: true }))).toBe(false);
    expect(session.changesMatch(favorites, controls({ searchQuery: "clip 4" }))).toBe(true);
    expect(session.changesMatch(createDefaultFilterState(), controls({ searchQuery: "clip" }))).toBe(true);
  });

  it("requests the next window once less than one page of loaded tiles is left below the screen", async () => {
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

    await session.considerFill(16_000, 10_000, LAST_PAGE_HEIGHT);
    expect(calls).toEqual([0]);

    await session.considerFill(15_999, 10_000, LAST_PAGE_HEIGHT);
    expect(calls).toEqual([0, LIBRARY_QUERY_WINDOW_SIZE]);
    expect(session.snapshot().items).toHaveLength(LIBRARY_QUERY_WINDOW_SIZE + 1);
  });

  it("keeps a full page in reserve, and fills no later than the rendered overscan", () => {
    expect(libraryQueryShouldFill(LIBRARY_QUERY_WINDOW_SIZE, 450, 16_000, 10_000, 6_000)).toBe(false);
    expect(libraryQueryShouldFill(LIBRARY_QUERY_WINDOW_SIZE, 450, 15_999, 10_000, 6_000)).toBe(true);

    expect(libraryQueryShouldFill(LIBRARY_QUERY_WINDOW_SIZE, 450, 10_900, 10_000, 300)).toBe(false);
    expect(libraryQueryShouldFill(LIBRARY_QUERY_WINDOW_SIZE, 450, 10_899, 10_000, 300)).toBe(true);

    expect(libraryQueryShouldFill(450, 450, 100, 0, 6_000)).toBe(false);
  });

  it("requests one further window at a time while scrolling inside the reserve", async () => {
    let releaseAppend: () => void = () => {};
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      const loaded = page(
        Array.from({ length: request.limit }, (_, index) => item(`a-${request.offset + index}`)),
        1_000,
        1_000
      );
      if (request.offset !== LIBRARY_QUERY_WINDOW_SIZE) {
        return loaded;
      }
      return await new Promise<LibraryQueryPage>((resolve) => {
        releaseAppend = () => resolve(loaded);
      });
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);

    const filling = session.considerFill(6_000, 1_000, LAST_PAGE_HEIGHT);
    void session.considerFill(6_000, 3_000, LAST_PAGE_HEIGHT);
    void session.considerFill(6_000, 5_000, LAST_PAGE_HEIGHT);
    expect(calls).toEqual([0, LIBRARY_QUERY_WINDOW_SIZE]);

    releaseAppend();
    await filling;
    expect(session.snapshot().items).toHaveLength(2 * LIBRARY_QUERY_WINDOW_SIZE);

    await session.considerFill(12_000, 7_000, LAST_PAGE_HEIGHT);
    expect(calls).toEqual([0, LIBRARY_QUERY_WINDOW_SIZE, 2 * LIBRARY_QUERY_WINDOW_SIZE]);
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
    await session.considerFill(100, 0, LAST_PAGE_HEIGHT);
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
    const calls: Array<{ offset: number; favoritesMode: unknown }> = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push({ offset: request.offset, favoritesMode: request.filterState.favoritesMode });
      return page([item(request.filterState.favoritesMode === "only" ? "fav" : "all")], 1, 4);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(false);
    session.noteScroll(250);

    await session.resetQuery({ ...createDefaultFilterState(), favoritesMode: "only" }, controls());
    session.setOverlayVisible(true);

    expect(calls.map((call) => call.favoritesMode)).toEqual(["off", "only"]);
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
    const filter = { ...createDefaultFilterState(), blacklistedMode: "off" as const };
    await session.ensureLoaded(filter, controls());
    session.setOverlayVisible(false);

    await session.applyFavorites([{ itemId: "a", isFavorite: true, isBlacklisted: false }]);

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

    await session.applyFavorites([{ itemId: "a", path: "/media/a.mp4", isFavorite: true, isBlacklisted: false }]);
    await session.applyPlayback({ itemId: "b", playCount: 1 });

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

    await session.applyFavorites([{ itemId: "a", isFavorite: false, isBlacklisted: true }]);

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

    await session.applyFavorites([{ itemId: "other", isFavorite: false, isBlacklisted: true }]);
    expect(calls).toBe(1);

    await session.applyFavorites([{ itemId: "other", isFavorite: true, isBlacklisted: false }]);
    expect(calls).toBe(2);
  });

  it("patches a favorite on an item outside the loaded window from the event's previous values", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());

    await session.applyFavorites([{
      itemId: "other",
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: false
    }]);
    expect(calls).toBe(1);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["a"]);

    // A favorite clears blacklist, so a blacklisted item enters the default filter and the window reloads.
    await session.applyFavorites([{
      itemId: "blacklisted",
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: true
    }]);
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

    await session.applyFavorites([{
      itemId: "id-lower",
      path: "/media/clip.mp4",
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: false
    }]);
    await session.applyPlayback({ itemId: "id-lower", playCount: 2 });
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

    await session.applyPlayback({ itemId: "a", playCount: 3 });
    expect(calls).toBe(1);
    expect(session.snapshot().items[0]?.playCount).toBe(3);

    await session.resetQuery(createDefaultFilterState(), controls({ sortMode: "PlayCount", sortDescending: true }));
    const afterSort = calls;
    await session.applyPlayback({ itemId: "a", playCount: 4 });
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
    const filling = session.considerFill(100, 0, LAST_PAGE_HEIGHT);
    await Promise.resolve();
    expect(calls).toContain(LIBRARY_QUERY_WINDOW_SIZE);

    const reloading = session.applyPlayback({ itemId: "kept-0", playCount: 2 });
    await reloading;
    releaseAppend(page([item("stale-append")], 450, 450));
    await filling;

    expect(session.snapshot().items.some((entry) => entry.id === "stale-append")).toBe(false);
    expect(session.snapshot().items[0]?.playCount).toBe(0);
    expect(calls.filter((offset) => offset === 0).length).toBeGreaterThan(1);
  });

  it("keeps a failed load's text and the status its error carries, relays its log line, and clears both once a load succeeds", async () => {
    const failures: unknown[] = [new HttpStatusError(408), new HttpStatusError(403, REMOTE_CONNECTIONS_OFF), new ServerUnreachableError()];
    const statusMessages: Array<[string | null, string | undefined]> = [];
    const session = createLibraryQuerySession(async () => {
      const failure = failures.shift();
      if (failure) {
        throw failure;
      }
      return page([item("a")], 1, 1);
    });
    session.setListener((event) => statusMessages.push([event.statusMessage, event.failure]));

    await session.resetQuery(createDefaultFilterState(), controls());
    expect(session.snapshot()).toMatchObject({ phase: "error", failureText: "Library load failed.", errorStatus: 408 });
    await session.resetQuery(createDefaultFilterState(), controls());
    expect(session.snapshot()).toMatchObject({ phase: "error", failureText: `Library load failed: ${REMOTE_CONNECTIONS_OFF}`, errorStatus: 403 });
    await session.resetQuery(createDefaultFilterState(), controls());
    expect(session.snapshot()).toMatchObject({ phase: "error", failureText: "Library load failed: Couldn't reach the server.", errorStatus: null });
    await session.resetQuery(createDefaultFilterState(), controls());
    expect(session.snapshot()).toMatchObject({ phase: "ready", failureText: null, errorStatus: null });
    expect(statusMessages.filter(([message]) => message)).toEqual([
      ["Library load failed (HTTP 408).", "load"],
      ["Library load failed (HTTP 403).", "load"],
      ["Library load failed: Couldn't reach the server.", "load"]
    ]);
  });

  it("retries a failed further page after the scroll position changes, having said the browse failed", async () => {
    let failAppend = true;
    const calls: number[] = [];
    const failures: Array<[string | null, string | undefined]> = [];
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
    session.setListener((event) => {
      if (event.statusMessage) {
        failures.push([event.statusMessage, event.failure]);
      }
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());
    session.setOverlayVisible(true);
    session.noteScroll(10);

    await session.considerFill(100, 0, LAST_PAGE_HEIGHT);
    const failedAppends = calls.filter((offset) => offset > 0).length;
    expect(failedAppends).toBe(1);
    // The tiles already loaded stay, so it isn't the first page's failure, which the body shows.
    expect(failures).toEqual([["Library browse failed. Showing the tiles already loaded.", "browse"]]);
    await session.considerFill(100, 0, LAST_PAGE_HEIGHT);
    expect(calls.filter((offset) => offset > 0)).toHaveLength(failedAppends);

    session.noteScroll(10);
    await session.considerFill(100, 0, LAST_PAGE_HEIGHT);
    expect(calls.filter((offset) => offset > 0)).toHaveLength(failedAppends);

    failAppend = false;
    session.noteScroll(80);
    await session.considerFill(100, 0, LAST_PAGE_HEIGHT);
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
    const updating = session.applyFavorites([{ itemId: "missing", isFavorite: true, isBlacklisted: false }]);
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
    await session.considerFill(0, 1, LAST_PAGE_HEIGHT);
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

  it("patches a rating on a loaded tile without a query while no rating filter or sort applies", async () => {
    let calls = 0;
    const renders: string[] = [];
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a"), item("b")], 2, 2);
    });
    session.setListener((event) => renders.push(event.scroll));
    await session.ensureLoaded(createDefaultFilterState(), controls());
    const rendered = renders.length;

    await session.applyRatings([{ itemId: "a", rating: 3.5, previousRating: null }]);
    await session.applyRatings([{ itemId: "other", rating: 2, previousRating: null }]);

    expect(calls).toBe(1);
    expect(session.snapshot().items.map((entry) => entry.rating)).toEqual([3.5, null]);
    expect(renders.slice(rendered)).toEqual(["keep"]);
  });

  it("reloads the loaded window under Only unrated when a loaded tile gets a rating, keeping the scroll position", async () => {
    const filters: unknown[] = [];
    const session = createLibraryQuerySession(async (request) => {
      filters.push(request.filterState.onlyUnrated);
      return page(filters.length > 1 ? [item("b")] : [item("a"), item("b")], filters.length > 1 ? 1 : 2, 2);
    });
    await session.ensureLoaded({ ...createDefaultFilterState(), onlyUnrated: true }, controls());
    session.noteScroll(80);

    await session.applyRatings([{ itemId: "a", rating: 4, previousRating: null }]);

    expect(filters).toEqual([true, true]);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["b"]);
    expect(session.snapshot().scrollTop).toBe(80);
  });

  it("reloads under the rating sort for a rating change on an item that is not loaded", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls({ sortMode: "Rating", sortDescending: true }));

    await session.applyRatings([{ itemId: "other", rating: 5, previousRating: 4.5 }]);

    expect(calls).toBe(2);
  });

  it("reloads the loaded window once for a batch of favorite changes that each call for a reload", async () => {
    const calls: number[] = [];
    const session = createLibraryQuerySession(async (request) => {
      calls.push(request.offset);
      const all = [item("a", { isFavorite: true }), item("b", { isFavorite: true }), item("c", { isFavorite: true }), item("d", { isFavorite: true })];
      return calls.length > 1 ? page(all.slice(3), 1, 4) : page(all, 4, 4);
    });
    await session.ensureLoaded({ ...createDefaultFilterState(), favoritesMode: "only" }, controls());

    const unfavorited = (itemId: string) => ({
      itemId,
      isFavorite: false,
      isBlacklisted: false,
      previousIsFavorite: true,
      previousIsBlacklisted: false
    });
    await session.applyFavorites([unfavorited("a"), unfavorited("b"), unfavorited("c")]);

    expect(calls).toEqual([0, 0]);
    expect(session.snapshot().items.map((entry) => entry.id)).toEqual(["d"]);
  });

  it("patches every loaded tile a batch of favorite changes names, rendering once, when none calls for a reload", async () => {
    let calls = 0;
    const renders: string[] = [];
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a"), item("b"), item("c")], 3, 3);
    });
    session.setListener((event) => renders.push(event.scroll));
    await session.ensureLoaded(createDefaultFilterState(), controls());
    const rendered = renders.length;

    const favorited = (itemId: string) => ({
      itemId,
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: false
    });
    await session.applyFavorites([favorited("a"), favorited("c"), favorited("outside")]);

    expect(calls).toBe(1);
    expect(session.snapshot().items.map((entry) => entry.isFavorite)).toEqual([true, false, true]);
    expect(renders.slice(rendered)).toEqual(["keep"]);
  });

  it("reloads once for a batch that brings an item outside the window into the filter", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a"), item("b")], 2, 2);
    });
    await session.ensureLoaded(createDefaultFilterState(), controls());

    // Removing the blacklist brings an item the default filter left out into it.
    await session.applyFavorites([
      { itemId: "a", isFavorite: true, isBlacklisted: false, previousIsFavorite: false, previousIsBlacklisted: false },
      { itemId: "hidden-1", isFavorite: false, isBlacklisted: false, previousIsFavorite: false, previousIsBlacklisted: true },
      { itemId: "hidden-2", isFavorite: false, isBlacklisted: false, previousIsFavorite: false, previousIsBlacklisted: true }
    ]);

    expect(calls).toBe(2);
  });

  it("does nothing for a batch that changed no item", async () => {
    let calls = 0;
    const renders: string[] = [];
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a")], 1, 1);
    });
    session.setListener((event) => renders.push(event.scroll));
    await session.ensureLoaded({ ...createDefaultFilterState(), favoritesMode: "only" }, controls({ sortMode: "Rating" }));
    const rendered = renders.length;

    await session.applyFavorites([]);
    await session.applyRatings([]);

    expect(calls).toBe(1);
    expect(renders.slice(rendered)).toEqual([]);
  });

  it("reloads the loaded window once for a batch of rating changes under the rating sort or a minimum rating", async () => {
    let calls = 0;
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a", { rating: 4 }), item("b", { rating: 4 }), item("c", { rating: 4 })], 3, 3);
    });
    const rated = (itemId: string, rating: number | null) => ({ itemId, rating, previousRating: 4 });
    await session.ensureLoaded(createDefaultFilterState(), controls({ sortMode: "Rating", sortDescending: true }));

    await session.applyRatings([rated("a", 2), rated("b", 2), rated("outside", 2)]);
    expect(calls).toBe(2);

    await session.resetQuery({ ...createDefaultFilterState(), minRating: 3 }, controls());
    expect(calls).toBe(3);
    await session.applyRatings([rated("a", 1), rated("b", null), rated("c", 2.5)]);
    expect(calls).toBe(4);
  });

  it("patches every loaded tile a batch of rating changes names, rendering once, when none calls for a reload", async () => {
    let calls = 0;
    const renders: string[] = [];
    const session = createLibraryQuerySession(async () => {
      calls += 1;
      return page([item("a", { rating: 4 }), item("b", { rating: 4 }), item("c")], 3, 3);
    });
    session.setListener((event) => renders.push(event.scroll));
    await session.ensureLoaded({ ...createDefaultFilterState(), minRating: 3 }, controls());
    const rendered = renders.length;

    // Each stays at or above the minimum, and the item outside the window was in the filter before.
    await session.applyRatings([
      { itemId: "a", rating: 5, previousRating: 4 },
      { itemId: "b", rating: 3.5, previousRating: 4 },
      { itemId: "outside", rating: 5, previousRating: 4 }
    ]);

    expect(calls).toBe(1);
    expect(session.snapshot().items.map((entry) => entry.rating)).toEqual([5, 3.5, null]);
    expect(renders.slice(rendered)).toEqual(["keep"]);
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
  it.each(tileEffectCases.map((entry) => [entry.name, entry] as const))("matches the fixture: %s", (_name, entry) => {
    const change: LibraryTileChange = {
      kind: entry.event,
      loaded: entry.loaded,
      before: entry.before ?? null,
      after: entry.after ?? null,
      addedTags: entry.addedTags ?? [],
      removedTags: entry.removedTags ?? [],
      rating: entry.rating ?? null,
      previousRating: entry.previousRating ?? null
    };
    expect(libraryQueryTileEffect(change, filterStateFromApiObject(entry.filter), entry.sortMode)).toBe(entry.expected);
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
      await session.considerFill(0, 1, LAST_PAGE_HEIGHT);
    }
    calls.length = 0;

    await session.reloadLoaded();

    expect(calls).toEqual([{ offset: 0, limit: 5_000 }]);
    expect(session.snapshot().items).toHaveLength(5_000);
  });

  it("sends auto-tag scan with only its scope", () => {
    expect(createAutoTagScanRequest(false)).toEqual({ scanFullLibrary: false });
    expect(createAutoTagScanRequest(true)).toEqual({ scanFullLibrary: true });
  });
});
