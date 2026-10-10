// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE_URL,
  COMPATIBLE_VERSION,
  FakeServer,
  json,
  mountPage,
  normalizedMarkup,
  resetPage,
  settle,
  status,
  stubLayoutSize,
  type MountedPage
} from "./pageHarness";

const ALL_FAVORITES_PRESET = {
  id: "preset-favorites",
  name: "Favorites",
  filterState: { favoritesOnly: true, selectedTags: [], excludedTags: [], includedSourceIds: [] }
};

const BEACH_PRESET = {
  id: "preset-beach",
  name: "Beach",
  filterState: { selectedTags: ["Beach"], excludedTags: [], includedSourceIds: [] }
};

type LibraryRow = ReturnType<typeof libraryItem>;

function libraryItem(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `item-${index}`,
    sourceId: "source-1",
    fileName: `clip ${index}.mp4`,
    fullPath: `C:\\media\\clip ${index}.mp4`,
    relativePath: `clip ${index}.mp4`,
    mediaType: 0,
    durationSeconds: 60,
    playCount: 0,
    isFavorite: false,
    isBlacklisted: false,
    tags: [] as string[],
    hasThumbnail: false,
    thumbnailWidth: 1920,
    thumbnailHeight: 1080,
    ...overrides
  };
}

function libraryItems(count: number, overrides: Record<string, unknown> = {}): LibraryRow[] {
  return Array.from({ length: count }, (_, index) => libraryItem(index + 1, overrides));
}

function playResponse(index: number) {
  return {
    id: `C:\\media\\clip ${index}.mp4`,
    itemId: `item-${index}`,
    displayName: `clip ${index}.mp4`,
    mediaType: "video",
    durationSeconds: 60,
    mediaUrl: `/api/media/item-${index}?token=t`,
    isFavorite: false,
    isBlacklisted: false
  };
}

/** The library the fake server pages by offset and limit. Tests change it, fail its queries, and hold its replies. */
interface FakeLibrary {
  items: LibraryRow[];
  /** Defaults to the number of items. */
  totalCount: number | null;
  /** Defaults to the total count. */
  searchBaselineCount: number | null;
  /** Statuses to answer the next queries with, in order, in place of a page. */
  failures: number[];
  /** While set, query replies wait until `release`. */
  holding: boolean;
  /** Lets every held reply go, and stops holding new ones. */
  release(): Promise<void>;
  /** The bodies of the queries the page sent, oldest first. */
  queries(): any[];
}

function serveLibrary(server: FakeServer, items: LibraryRow[]): FakeLibrary {
  const held: Array<() => void> = [];
  const library: FakeLibrary = {
    items,
    totalCount: null,
    searchBaselineCount: null,
    failures: [],
    holding: false,
    async release() {
      library.holding = false;
      for (const resolve of held.splice(0)) {
        resolve();
      }
      await flush();
    },
    queries() {
      return server.requests("POST", "/api/library/query").map((call) => call.body);
    }
  };
  server.on("POST", "/api/library/query", async (call) => {
    if (library.holding) {
      await new Promise<void>((resolve) => held.push(resolve));
    }
    const failure = library.failures.shift();
    if (failure) {
      return status(failure);
    }
    const offset = Number(call.body?.offset ?? 0);
    const limit = Number(call.body?.limit ?? 200);
    const totalCount = library.totalCount ?? library.items.length;
    return json({
      items: library.items.slice(offset, offset + limit),
      totalCount,
      searchBaselineCount: library.searchBaselineCount ?? totalCount
    });
  });
  return library;
}

interface LibraryPage {
  page: MountedPage;
  server: FakeServer;
  library: FakeLibrary;
}

/** Mounts the page against a library of `items` and waits for its first page. */
async function mountLibrary(
  items: LibraryRow[],
  setup: (server: FakeServer, library: FakeLibrary) => void = () => {}
): Promise<LibraryPage> {
  stubLayoutSize();
  const server = new FakeServer();
  const library = serveLibrary(server, items);
  setup(server, library);
  const page = mountPage({ server });
  await screen.findByText("Ready (API 1)");
  if (!library.holding) {
    await waitFor(() => expect(library.queries()).toHaveLength(1));
  }
  await flush();
  return { page, server, library };
}

/** Lets fetch replies and renders finish, with real or fake timers. */
async function flush(): Promise<void> {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
  } else {
    await settle();
  }
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await flush();
}

function overlay(): HTMLElement {
  return document.getElementById("library-overlay") as HTMLElement;
}

function isOpen(): boolean {
  return overlay().style.display !== "none";
}

async function openLibrary(): Promise<void> {
  await click(screen.getByRole("button", { name: "Library" }));
}

async function closeLibrary(): Promise<void> {
  await click(within(overlay()).getByRole("button", { name: "Close", hidden: true }));
}

function summary(): HTMLElement {
  return document.getElementById("library-overlay-summary") as HTMLElement;
}

function toolbarShown(): boolean {
  return (document.getElementById("library-overlay-toolbar") as HTMLElement).style.display !== "none";
}

function searchBox(): HTMLInputElement {
  return within(overlay()).getByRole("searchbox", { name: "Search library", hidden: true }) as HTMLInputElement;
}

function sortSelect(): HTMLSelectElement {
  return within(overlay()).getByRole("combobox", { name: "Sort library", hidden: true }) as HTMLSelectElement;
}

function directionButton(): HTMLButtonElement {
  return within(overlay()).getByRole("button", { name: "Toggle sort direction", hidden: true }) as HTMLButtonElement;
}

function body(): HTMLElement {
  return document.getElementById("library-overlay-body") as HTMLElement;
}

function tile(itemId: string): HTMLElement | null {
  return overlay().querySelector(`.library-grid-tile[data-item-id="${itemId}"]`);
}

function tileNames(): string[] {
  return Array.from(overlay().querySelectorAll(".library-grid-tile-filename")).map((node) => node.textContent ?? "");
}

function gridScroll(): HTMLElement {
  return overlay().querySelector(".library-grid-scroll") as HTMLElement;
}

async function scrollGridTo(top: number): Promise<void> {
  const scroller = gridScroll();
  scroller.scrollTop = top;
  fireEvent.scroll(scroller);
  await flush();
}

function statusLine(): string {
  return document.getElementById("status")?.textContent ?? "";
}

function video(): HTMLVideoElement {
  return document.getElementById("video") as HTMLVideoElement;
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    keys.push(storage.key(i) ?? "");
  }
  return keys.sort();
}

async function choosePreset(value: string): Promise<void> {
  fireEvent.change(screen.getByRole("combobox", { name: "Choose preset" }), { target: { value } });
  await flush();
}

const FINISHED_REFRESH = { isRunning: false, runId: "run-1", completedUtc: "2026-10-07T00:00:00Z", stages: [] };

beforeEach(() => {
  resetPage();
});

describe("overlay", () => {
  it("opens from the Library button, and Close and Escape close it", async () => {
    await mountLibrary(libraryItems(3));
    expect(isOpen()).toBe(false);

    await openLibrary();
    expect(overlay().style.display).toBe("flex");
    await closeLibrary();
    expect(isOpen()).toBe(false);

    await openLibrary();
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(isOpen()).toBe(false);
  });

  it("does not open while the server is incompatible", async () => {
    stubLayoutSize();
    const server = new FakeServer();
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, capabilities: COMPATIBLE_VERSION.capabilities.filter((c) => c !== "api.presets.match") })
    );
    mountPage({ server });
    await screen.findByText("Server missing required capabilities: api.presets.match.");

    await openLibrary();
    expect(isOpen()).toBe(false);
    expect(server.requests("POST", "/api/library/query")).toHaveLength(0);
  });

  it("keeps its markup while loading, with tiles, and when a query fails", async () => {
    const items = [
      libraryItem(1),
      libraryItem(2, { hasThumbnail: true, thumbnailVersion: "v7" }),
      libraryItem(3, { isFavorite: true, isBlacklisted: true, mediaType: 1, thumbnailWidth: 1200, thumbnailHeight: 900 })
    ];
    const { library } = await mountLibrary(items, (_, lib) => {
      lib.holding = true;
    });

    await openLibrary();
    expect(normalizedMarkup(overlay())).toMatchSnapshot("loading");

    await library.release();
    expect(normalizedMarkup(overlay())).toMatchSnapshot("tiles");

    library.failures.push(500);
    fireEvent.change(sortSelect(), { target: { value: "Duration" } });
    await flush();
    expect(normalizedMarkup(overlay())).toMatchSnapshot("error");
  });
});

describe("first page", () => {
  it("loads once the server is ready, before the overlay opens, and opening shows it without querying again", async () => {
    const { library } = await mountLibrary(libraryItems(3));
    expect(library.queries()).toHaveLength(1);
    expect(library.queries()[0]).toMatchObject({
      filterState: { favoritesOnly: false, excludeBlacklisted: true, selectedTags: [], excludedTags: [] },
      search: "",
      sortMode: "Name",
      sortDescending: false,
      offset: 0,
      limit: 200
    });

    await openLibrary();
    expect(summary().hidden).toBe(false);
    expect(summary().textContent).toBe("Showing 3 of 3 items");
    expect(toolbarShown()).toBe(true);
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4", "clip 3.mp4"]);
    expect(library.queries()).toHaveLength(1);
  });

  it("shows Loading library… while the first page loads, then its tiles", async () => {
    const { library } = await mountLibrary(libraryItems(2), (_, lib) => {
      lib.holding = true;
    });

    await openLibrary();
    expect(within(overlay()).getByText("Loading library…")).toBeTruthy();
    expect(toolbarShown()).toBe(false);
    expect(summary().hidden).toBe(true);

    await library.release();
    expect(within(overlay()).queryByText("Loading library…")).toBeNull();
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4"]);
    expect(summary().textContent).toBe("Showing 2 of 2 items");
    expect(toolbarShown()).toBe(true);
  });

  it("shows a first page that fails as an alert and in the status line, and opening again loads it", async () => {
    const { library } = await mountLibrary(libraryItems(2), (_, lib) => {
      lib.failures.push(500);
    });
    await waitFor(() => expect(statusLine()).toBe("Library load failed: HTTP 500"));

    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4"]);
  });

  it("shows the load error as an alert, without the toolbar", async () => {
    const { library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(503);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    expect(within(overlay()).getByRole("alert").textContent).toBe("HTTP 503");
    expect(statusLine()).toBe("Library load failed: HTTP 503");
    expect(toolbarShown()).toBe(false);
    expect(summary().hidden).toBe(true);
    expect(tileNames()).toEqual([]);
  });

  it("says when the library is empty", async () => {
    await mountLibrary([]);
    await openLibrary();

    expect(within(overlay()).getByText("No media in library.")).toBeTruthy();
    expect(toolbarShown()).toBe(false);
    expect(summary().hidden).toBe(true);
  });

  it("says when the filter leaves nothing, with the totals", async () => {
    await mountLibrary([], (_, lib) => {
      lib.searchBaselineCount = 5;
    });
    await openLibrary();

    expect(within(overlay()).getByText("No items match the current filter.")).toBeTruthy();
    expect(summary().textContent).toBe("Showing 0 of 5 items");
    expect(toolbarShown()).toBe(true);
  });
});

describe("search and sort", () => {
  it("search waits until typing stops, then starts over from the first page with the text", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { library } = await mountLibrary(libraryItems(3));
    await openLibrary();

    for (const text of ["h", "ho", "hol"]) {
      fireEvent.input(searchBox(), { target: { value: text } });
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(library.queries()).toHaveLength(1);

    library.items = [];
    library.searchBaselineCount = 3;
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(library.queries()).toHaveLength(2);
    expect(library.queries()[1]).toMatchObject({ search: "hol", sortMode: "Name", offset: 0, limit: 200 });
    expect(within(overlay()).getByText("No matches for “hol”.")).toBeTruthy();
    expect(summary().textContent).toBe("Showing 0 of 3 items");
    expect(searchBox().value).toBe("hol");
  });

  it("a sort mode starts over in its default direction, and the direction button reverses it once the page arrives", async () => {
    const { library } = await mountLibrary(libraryItems(3));
    await openLibrary();
    expect(directionButton().textContent).toBe("A–Z");

    fireEvent.change(sortSelect(), { target: { value: "LastPlayed" } });
    await flush();
    expect(library.queries()[1]).toMatchObject({ sortMode: "LastPlayed", sortDescending: true, offset: 0 });
    expect(directionButton().textContent).toBe("Newest → Oldest");

    library.holding = true;
    await click(directionButton());
    expect(library.queries()[2]).toMatchObject({ sortMode: "LastPlayed", sortDescending: false, offset: 0 });
    expect(directionButton().textContent).toBe("Newest → Oldest");
    await library.release();
    expect(directionButton().textContent).toBe("Oldest → Newest");
    expect(sortSelect().value).toBe("LastPlayed");
  });

  it("search and sort stay after closing and reopening, and a new query scrolls back to the top", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { library } = await mountLibrary(libraryItems(450));
    await openLibrary();

    fireEvent.input(searchBox(), { target: { value: "clip" } });
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    fireEvent.change(sortSelect(), { target: { value: "Duration" } });
    await flush();
    const sent = library.queries().length;
    await scrollGridTo(600);
    await closeLibrary();
    await openLibrary();

    expect(searchBox().value).toBe("clip");
    expect(sortSelect().value).toBe("Duration");
    expect(directionButton().textContent).toBe("Longest → Shortest");
    expect(gridScroll().scrollTop).toBe(600);
    expect(library.queries()).toHaveLength(sent);

    await click(directionButton());
    expect(library.queries()[sent]).toMatchObject({ search: "clip", sortMode: "Duration", sortDescending: false, offset: 0 });
    expect(gridScroll().scrollTop).toBe(0);
  });

  it("a sort change sends the search typed so far and drops the pending search query", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { library } = await mountLibrary(libraryItems(3));
    await openLibrary();

    fireEvent.input(searchBox(), { target: { value: "cli" } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();
    expect(library.queries()[1]).toMatchObject({ search: "cli", sortMode: "PlayCount", sortDescending: true });

    await vi.advanceTimersByTimeAsync(1000);
    expect(library.queries()).toHaveLength(2);
  });
});

describe("fill on scroll", () => {
  it("opening loads a second page, and scrolling near the end loads the next one page at a time until the total", async () => {
    const { library } = await mountLibrary(libraryItems(450));
    expect(library.queries()).toHaveLength(1);

    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    expect(library.queries()[1]).toMatchObject({ offset: 200, limit: 200 });
    await flush();
    expect(summary().textContent).toBe("Showing 450 of 450 items");

    await scrollGridTo(600);
    expect(library.queries()).toHaveLength(2);

    library.holding = true;
    await scrollGridTo(1_000_000);
    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ offset: 400, limit: 200 });
    await scrollGridTo(1_000_100);
    expect(library.queries()).toHaveLength(3);

    await library.release();
    await scrollGridTo(2_000_000);
    expect(library.queries()).toHaveLength(3);
  });

  it("does not fill while the overlay is hidden", async () => {
    const { library } = await mountLibrary(libraryItems(650));
    await settle();
    expect(library.queries()).toHaveLength(1);

    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await closeLibrary();
    await scrollGridTo(1_000_000);
    await settle();
    expect(library.queries()).toHaveLength(2);
  });

  it("a further page that fails loads again only after the scroll position changes", async () => {
    const { library } = await mountLibrary(libraryItems(650));
    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();

    library.failures.push(500);
    await scrollGridTo(1_000_000);
    expect(library.queries()).toHaveLength(3);
    await waitFor(() => expect(statusLine()).toBe("Library browse failed. Showing the tiles already loaded."));

    await scrollGridTo(1_000_000);
    expect(library.queries()).toHaveLength(3);
    await scrollGridTo(1_000_100);
    await flush();
    expect(library.queries().slice(3).map((query) => query.offset)).toEqual([400, 600]);
    expect(summary().textContent).toBe("Showing 650 of 650 items");
  });

  it("hiding and showing keeps the tiles and the scroll position without querying", async () => {
    const { library } = await mountLibrary(libraryItems(450));
    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();
    await scrollGridTo(600);
    const scroller = gridScroll();
    const names = tileNames();

    await closeLibrary();
    await openLibrary();

    expect(gridScroll()).toBe(scroller);
    expect(gridScroll().scrollTop).toBe(600);
    expect(tileNames()).toEqual(names);
    expect(library.queries()).toHaveLength(2);
  });

  it("tiles reloaded while the overlay was hidden lay out as soon as it opens", async () => {
    const { page, library } = await mountLibrary(libraryItems(3));
    await openLibrary();
    await closeLibrary();

    library.items = libraryItems(3, { fileName: "renamed.mp4" });
    page.stream().emit("refreshStatusChanged", 2, { snapshot: FINISHED_REFRESH });
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();

    await openLibrary();
    expect(tileNames()).toEqual(["renamed.mp4", "renamed.mp4", "renamed.mp4"]);
  });

  it("a reload while tiles show keeps the same grid and scroll position and never shows a message in between", async () => {
    const { page, library } = await mountLibrary(libraryItems(450, { isFavorite: true }), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain("Favorites"));
    await choosePreset("preset-favorites");
    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(3));
    await flush();
    await scrollGridTo(600);
    const host = body();
    const scroller = gridScroll();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(overlay(), { childList: true });
    observer.observe(host, { childList: true });

    library.holding = true;
    page.stream().emit("refreshStatusChanged", 2, { snapshot: FINISHED_REFRESH });
    await flush();
    expect(library.queries()).toHaveLength(4);
    expect(library.queries()[3]).toMatchObject({ offset: 0, limit: 400 });
    expect(within(overlay()).queryByText("Loading library…")).toBeNull();
    expect(tileNames().length).toBeGreaterThan(0);
    await library.release();

    library.holding = true;
    library.items = library.items.slice(1);
    page.stream().emit("itemStateChanged", 3, {
      itemId: "item-1",
      isFavorite: false,
      isBlacklisted: false,
      previousIsFavorite: true,
      previousIsBlacklisted: false
    });
    await flush();
    expect(library.queries()).toHaveLength(5);
    expect(library.queries()[4]).toMatchObject({ filterState: { favoritesOnly: true }, offset: 0, limit: 400 });
    expect(within(overlay()).queryByText("Loading library…")).toBeNull();
    await library.release();

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records).toHaveLength(0);
    expect(body()).toBe(host);
    expect(gridScroll()).toBe(scroller);
    expect(gridScroll().scrollTop).toBe(600);
    expect(summary().textContent).toBe("Showing 449 of 449 items");
  });
});

describe("starting over", () => {
  it("a header preset starts over while the overlay is hidden, and reopening shows the new totals", async () => {
    const { library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    expect(summary().textContent).toBe("Showing 3 of 3 items");
    await closeLibrary();

    library.items = [libraryItem(2, { isFavorite: true })];
    library.searchBaselineCount = 3;
    await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain("Favorites"));
    await choosePreset("preset-favorites");
    expect(library.queries()[1]).toMatchObject({ filterState: { favoritesOnly: true }, offset: 0, limit: 200 });

    await openLibrary();
    expect(summary().textContent).toBe("Showing 1 of 3 items");
    expect(tileNames()).toEqual(["clip 2.mp4"]);
  });

  it("applying the filter dialog starts over from the first page with the new filter", async () => {
    const { library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/sources", () => json([]));
      server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    });
    await openLibrary();

    await click(screen.getByRole("button", { name: "Select filters", hidden: true }));
    await waitFor(() => expect((document.getElementById("filter-dialog") as HTMLElement).style.display).toBe("flex"));
    fireEvent.click(screen.getByLabelText("Favorites only"));
    fireEvent.change(screen.getByLabelText("Favorites only"));
    await click(screen.getByRole("button", { name: /^Apply/ }));

    await waitFor(() => expect(library.queries()).toHaveLength(2));
    expect(library.queries()[1]).toMatchObject({ filterState: { favoritesMode: "only", favoritesOnly: true }, search: "", offset: 0, limit: 200 });
  });
});

describe("live updates", () => {
  it("a favorite event updates a loaded tile's badge without reloading, shown or hidden", async () => {
    const { page, library } = await mountLibrary(libraryItems(3));
    await openLibrary();

    page.stream().emit("itemStateChanged", 2, { itemId: "item-1", isFavorite: true, isBlacklisted: false });
    await flush();
    expect(tile("item-1")?.querySelector(".library-grid-tile-badge")?.textContent).toBe("favorite");

    await closeLibrary();
    page.stream().emit("itemStateChanged", 3, { itemId: "item-2", isFavorite: true, isBlacklisted: false });
    await flush();
    await openLibrary();
    expect(tile("item-2")?.querySelector(".library-grid-tile-badge")?.textContent).toBe("favorite");
    expect(library.queries()).toHaveLength(1);
  });

  it("under Favorites only, unfavoriting a loaded tile reloads the loaded window in one request", async () => {
    const { page, library } = await mountLibrary(libraryItems(3, { isFavorite: true }), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain("Favorites"));
    await choosePreset("preset-favorites");
    await openLibrary();
    expect(library.queries()).toHaveLength(2);

    library.items = library.items.slice(1);
    page.stream().emit("itemStateChanged", 2, {
      itemId: "item-1",
      isFavorite: false,
      isBlacklisted: false,
      previousIsFavorite: true,
      previousIsBlacklisted: false
    });
    await flush();

    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ filterState: { favoritesOnly: true }, offset: 0, limit: 3 });
    expect(tileNames()).toEqual(["clip 2.mp4", "clip 3.mp4"]);
    expect(summary().textContent).toBe("Showing 2 of 2 items");
  });

  it("a playback event patches the tiles under Name and reloads them under Play count", async () => {
    const { page, library } = await mountLibrary(libraryItems(3));
    await openLibrary();

    page.stream().emit("playbackRecorded", 2, { itemId: "item-1", playCount: 4, lastPlayedUtc: "2026-10-07T00:00:00Z" });
    await flush();
    expect(library.queries()).toHaveLength(1);

    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();
    expect(library.queries()).toHaveLength(2);
    page.stream().emit("playbackRecorded", 3, { itemId: "item-2", playCount: 1, lastPlayedUtc: "2026-10-07T00:00:00Z" });
    await flush();
    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ sortMode: "PlayCount", offset: 0, limit: 3 });
  });

  it("a tag event on a loaded tile reloads the window under a tag filter", async () => {
    const { page, library } = await mountLibrary(libraryItems(3, { tags: ["Beach"] }), (server) => {
      server.on("GET", "/api/presets", () => json([BEACH_PRESET]));
    });
    await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain("Beach"));
    await choosePreset("preset-beach");
    await openLibrary();
    expect(library.queries()).toHaveLength(2);

    library.items = library.items.slice(1);
    page.stream().emit("itemTagsChanged", 2, {
      itemIds: ["C:\\media\\clip 1.mp4"],
      resolvedItemIds: ["item-1"],
      addedTags: [],
      removedTags: ["Beach"]
    });
    await flush();

    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ filterState: { selectedTags: ["Beach"] }, offset: 0, limit: 3 });
    expect(tileNames()).toEqual(["clip 2.mp4", "clip 3.mp4"]);
  });
});

describe("playing a tile", () => {
  it("Enter or Space on a focused tile plays it, other keys do not, and the video element stays the same", async () => {
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => json(playResponse(1)));
      fake.on("POST", "/api/play/item-2", () => json(playResponse(2)));
    });
    const videoNode = video();
    await openLibrary();

    fireEvent.keyDown(tile("item-1")!, { key: "a" });
    await flush();
    expect(server.requests("POST", "/api/play/item-1")).toHaveLength(0);

    fireEvent.keyDown(tile("item-1")!, { key: "Enter" });
    await flush();
    expect(server.requests("POST", "/api/play/item-1")).toHaveLength(1);
    expect(isOpen()).toBe(false);
    expect(video().src).toBe(`${API_BASE_URL}/api/media/item-1?token=t`);

    await openLibrary();
    fireEvent.keyDown(tile("item-2")!, { key: " " });
    await flush();
    expect(server.requests("POST", "/api/play/item-2")).toHaveLength(1);
    expect(video().src).toBe(`${API_BASE_URL}/api/media/item-2?token=t`);
    expect(video()).toBe(videoNode);
    expect(server.requests("POST", "/api/record-playback")).toHaveLength(0);
  });

  it("a tile the server cannot play leaves the overlay open and says why", async () => {
    const replies: Response[] = [];
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => replies.shift()!);
    });
    await openLibrary();

    const cases: Array<[Response, string]> = [
      [json({ error: "Not found", code: "play_item_not_found" }, 404), "Media not found. The file may have moved or been deleted."],
      [json({ error: "Unavailable", code: "play_item_unavailable" }, 409), "This item is unavailable."],
      [json({ error: "Unsupported" }, 415), "This file type is not supported."],
      [json({ error: "Disk C:\\media is offline" }, 500), "Disk C:\\media is offline"]
    ];
    for (const [reply, message] of cases) {
      replies.push(reply);
      await click(tile("item-1")!);
      expect(statusLine()).toBe(message);
      expect(isOpen()).toBe(true);
    }

    await waitFor(() =>
      expect(server.logLines()).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=404 code=play_item_not_found")
    );
    expect(server.logLines()).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=415 code=none");
    expect(server.logLines()).toContain("status=Playback failed hasCurrent=false attempt=0");
    expect(server.logLines().some((line) => line.includes("media"))).toBe(false);
    expect(video().getAttribute("src")).toBeNull();
  });

  it("an unauthorized play shows the pairing prompt", async () => {
    await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => status(401));
    });
    await openLibrary();

    await click(tile("item-1")!);

    expect(statusLine()).toBe("Unauthorized. Pair first.");
    expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex");
  });

  it("a second activation while a play is loading is ignored", async () => {
    let answer: () => void = () => {};
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return json(playResponse(1));
      });
      fake.on("POST", "/api/play/item-2", () => json(playResponse(2)));
    });
    await openLibrary();

    await click(tile("item-1")!);
    expect(statusLine()).toBe("Loading...");
    await click(tile("item-1")!);
    await click(tile("item-2")!);
    expect(server.requests("POST", "/api/play/item-1")).toHaveLength(1);
    expect(server.requests("POST", "/api/play/item-2")).toHaveLength(0);

    answer();
    await flush();
    expect(video().src).toBe(`${API_BASE_URL}/api/media/item-1?token=t`);
    expect(isOpen()).toBe(false);
  });

  it("a play that cannot reach the server says so", async () => {
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => {
        throw new TypeError("Failed to fetch");
      });
    });
    await openLibrary();

    await click(tile("item-1")!);

    expect(statusLine()).toBe("Playback failed: Failed to fetch");
    expect(isOpen()).toBe(true);
    await waitFor(() => expect(server.logLines()).toContain("playback=library-play-error attempt=0 hasCurrent=false message=Failed to fetch"));
  });
});

describe("tiles", () => {
  it("show file names as text, thumbnails at their version, and favorite and blacklist badges", async () => {
    await mountLibrary([
      libraryItem(1, { fileName: "<b>bold</b> clip.mp4" }),
      libraryItem(2, { hasThumbnail: true, thumbnailVersion: "v7" }),
      libraryItem(3, { isFavorite: true, isBlacklisted: true })
    ]);
    await openLibrary();

    expect(within(overlay()).getByText("<b>bold</b> clip.mp4")).toBeTruthy();
    expect(overlay().querySelector("b")).toBeNull();
    expect(tile("item-1")?.querySelector("img")).toBeNull();
    expect(tile("item-2")?.querySelector("img")?.getAttribute("src")).toBe(`${API_BASE_URL}/api/thumbnail/item-2?v=v7`);
    expect(tile("item-2")?.querySelector(".library-grid-tile-badge")).toBeNull();
    expect(tile("item-3")?.querySelector(".library-grid-tile-badge")?.textContent).toBe("favoritethumb_down");
  });

  it("add no browser storage keys while browsing and playing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => json(playResponse(1)));
    });
    await openLibrary();

    fireEvent.input(searchBox(), { target: { value: "clip" } });
    await vi.advanceTimersByTimeAsync(300);
    fireEvent.change(sortSelect(), { target: { value: "DateAdded" } });
    await click(directionButton());
    await closeLibrary();
    await openLibrary();
    await click(tile("item-1")!);

    expect(storageKeys(localStorage)).toEqual(["rr_clientId"]);
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId"]);
  });
});
