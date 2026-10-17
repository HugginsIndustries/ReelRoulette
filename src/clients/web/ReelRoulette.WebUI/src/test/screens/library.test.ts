// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import {
  API_BASE_URL,
  COMPATIBLE_VERSION,
  FakeServer,
  closeNotices,
  currentStyle,
  json,
  mountPage,
  normalizedMarkup,
  openNotices,
  pageReady,
  pickPreset,
  presetSelect,
  resetPage,
  selectedPresetLabel,
  setViewport,
  settle,
  status,
  stubLayoutSize,
  unauthorizedLogLine,
  useStylesheet,
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
  await pageReady(server);
  // The first page has loaded; a preset remembered from before may already have applied again and loaded once more.
  if (!library.holding) {
    await waitFor(() => expect(library.queries().length).toBeGreaterThan(0));
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

function panel(): HTMLElement {
  return document.getElementById("panel") as HTMLElement;
}

/** The library shows: the panel is open on its Library tab. */
function isOpen(): boolean {
  return !panel().hidden && !(document.getElementById("panel-page-library") as HTMLElement).hidden;
}

/** The panel's own tab, apart from the Filter and Tags tabs' section tabs. */
function panelTab(name: "Library" | "Filter" | "Tags"): HTMLElement {
  // A tab's name says so while it holds unsaved changes.
  return within(panel().querySelector(".panel-tablist") as HTMLElement).getByRole("tab", { name: new RegExp(`^${name}(, unsaved changes)?$`), hidden: true });
}

/** Opens the panel with the panel button, then shows its Library tab if it opened on another. */
async function openLibrary(): Promise<void> {
  if (panel().hidden) {
    await click(screen.getByRole("button", { name: "Open panel" }));
  }
  if (!isOpen()) {
    await click(panelTab("Library"));
  }
}

/** Closes the panel with its own Close, at the end of its tab row; the panel button is named the same while open. */
async function closeLibrary(): Promise<void> {
  await click(within(panel()).getByRole("button", { name: "Close panel", hidden: true }));
}

/** A window below 800 px wide, where the panel is the overlay over the player. */
function useOverlayWidth(): void {
  setViewport({ width: 600, height: 800 });
}

function summary(): HTMLElement {
  return document.getElementById("library-overlay-summary") as HTMLElement;
}

/** The count line as it shows, hidden from screen readers, and the words they hear in its place. */
function countLine(): { shown: string; spoken: string } {
  const [shown, spoken] = Array.from(summary().children);
  expect(shown?.getAttribute("aria-hidden")).toBe("true");
  expect(spoken?.classList.contains("visually-hidden")).toBe(true);
  return { shown: shown?.textContent ?? "", spoken: spoken?.textContent ?? "" };
}

/** The controls show, not collapsed. They show while the library loads, is empty, or fails too. */
function controlsShown(): boolean {
  return !(document.getElementById("library-controls") as HTMLElement).classList.contains("is-collapsed");
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

/** Waits until the page has relayed `text`, a message or an error shown in place, while nothing has played. */
async function expectRelayed(server: FakeServer, text: string): Promise<void> {
  await waitFor(() => expect(server.logLines()).toContain(statusLogLine(text, null, 0)));
}

/** The state the player's indicator shows, by its id, or null while it shows none. */
function indicatorState(): string | null {
  return document.querySelector<HTMLElement>("#player-indicator .player-indicator")?.dataset.state ?? null;
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

const FINISHED_REFRESH = { isRunning: false, runId: "run-1", completedUtc: "2026-10-07T00:00:00Z", stages: [] };

beforeEach(() => {
  resetPage();
});

describe("overlay", () => {
  it("opens from the panel button on the Library tab, and the panel's Close and Escape close it", async () => {
    await mountLibrary(libraryItems(3));
    expect(isOpen()).toBe(false);

    await click(screen.getByRole("button", { name: "Open panel" }));
    expect(isOpen()).toBe(true);
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4", "clip 3.mp4"]);
    await closeLibrary();
    expect(isOpen()).toBe(false);

    await openLibrary();
    fireEvent.keyDown(document, { key: "Escape" });
    await flush();
    expect(isOpen()).toBe(false);
  });

  it("shows why in place of the library while the server is incompatible, and sends no query", async () => {
    stubLayoutSize();
    const server = new FakeServer();
    server.on("GET", "/api/version", () =>
      json({ ...COMPATIBLE_VERSION, capabilities: COMPATIBLE_VERSION.capabilities.filter((c) => c !== "api.presets.byId") })
    );
    mountPage({ server });
    await waitFor(() => expect(server.requests("GET", "/api/version")).toHaveLength(1));
    await flush();

    await openLibrary();
    expect(isOpen()).toBe(true);
    expect(within(overlay()).getByRole("alert").textContent).toBe("Server missing required capabilities: api.presets.byId.");
    expect(controlsShown()).toBe(true);
    // Nothing loads, so search and sort have nothing to change, and the preset dropdown says why.
    expect([searchBox().disabled, sortSelect().disabled, directionButton().disabled]).toEqual([true, true, true]);
    expect(presetSelect().disabled).toBe(true);
    expect(selectedPresetLabel()).toBe("Server compatibility check failed");
    expect(summary().hidden).toBe(true);
    expect(tileNames()).toEqual([]);
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

describe("without a library", () => {
  const NO_LIBRARY_MESSAGE = "The library was made by a newer version of ReelRoulette. Update ReelRoulette to open it.";

  it("says why in place of the library, loads nothing, disables search and sort, and loads once the library is ready", async () => {
    stubLayoutSize();
    const server = new FakeServer();
    const library = serveLibrary(server, libraryItems(3));
    let version: object = { ...COMPATIBLE_VERSION, libraryState: "newer", libraryMessage: NO_LIBRARY_MESSAGE };
    server.on("GET", "/api/version", () => json(version));
    const page = mountPage({ server });
    await waitFor(() => expect(server.requests("GET", "/api/version")).toHaveLength(1));
    await flush();

    await openLibrary();
    expect(within(overlay()).getByRole("alert").textContent).toBe(`Running without a library. ${NO_LIBRARY_MESSAGE}`);
    expect([searchBox().disabled, sortSelect().disabled, directionButton().disabled]).toEqual([true, true, true]);
    expect(summary().hidden).toBe(true);
    fireEvent.input(searchBox(), { target: { value: "clip" } });
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    await flush();
    expect(library.queries()).toHaveLength(0);
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);

    // The server opens its library; the event stream opening has the page check again.
    version = COMPATIBLE_VERSION;
    page.stream().open();
    await waitFor(() => expect(library.queries()).toHaveLength(1));
    await flush();
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4", "clip 3.mp4"]);
    expect([searchBox().disabled, sortSelect().disabled, directionButton().disabled]).toEqual([false, false, false]);
  });
});

describe("first page", () => {
  it("loads once the server is ready, before the tab opens, and opening shows it without querying again", async () => {
    const { library } = await mountLibrary(libraryItems(3));
    expect(library.queries()).toHaveLength(1);
    expect(library.queries()[0]).toMatchObject({
      filterState: { favoritesMode: "off", blacklistedMode: "excluded", selectedTags: [], excludedTags: [] },
      search: "",
      sortMode: "Name",
      sortDescending: false,
      offset: 0,
      limit: 200
    });

    await openLibrary();
    expect(summary().hidden).toBe(false);
    expect(countLine()).toEqual({ shown: "3 / 3", spoken: "3 of 3 items" });
    expect(controlsShown()).toBe(true);
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4", "clip 3.mp4"]);
    expect(library.queries()).toHaveLength(1);
  });

  it("shows Loading library… while the first page loads, then its tiles", async () => {
    const { library } = await mountLibrary(libraryItems(2), (_, lib) => {
      lib.holding = true;
    });

    await openLibrary();
    expect(within(overlay()).getByText("Loading library…")).toBeTruthy();
    expect(controlsShown()).toBe(true);
    expect(summary().hidden).toBe(true);

    await library.release();
    expect(within(overlay()).queryByText("Loading library…")).toBeNull();
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4"]);
    expect(countLine()).toEqual({ shown: "2 / 2", spoken: "2 of 2 items" });
    expect(controlsShown()).toBe(true);
  });

  it("shows a first page that fails as an alert, relaying its status, and opening again loads it", async () => {
    const { server, library } = await mountLibrary(libraryItems(2), (_, lib) => {
      lib.failures.push(500);
    });
    await expectRelayed(server, "Library load failed: HTTP 500");

    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4"]);
  });

  it("shows the load error as an alert, keeping the controls", async () => {
    const { server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(503);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    expect(within(overlay()).getByRole("alert").textContent).toBe("Library load failed: HTTP 503");
    // It shows in place, so it only relays.
    await expectRelayed(server, "Library load failed: HTTP 503");
    expect(controlsShown()).toBe(true);
    expect(summary().hidden).toBe(true);
    expect(tileNames()).toEqual([]);
  });

  it.each([
    [408, "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."],
    [504, "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."],
    [500, "Library load failed: HTTP 500"]
  ])("shows a load answered with %i as its own message in the body, and relays its status", async (failure, message) => {
    const { server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(failure);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    expect(within(overlay()).getByRole("alert").textContent).toBe(message);
    await expectRelayed(server, `Library load failed: HTTP ${failure}`);
  });

  it("shows no failure for a load answered with 401, only the pairing prompt, and logs it", async () => {
    const { server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(401);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    await waitFor(() => expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex"));
    expect(within(overlay()).queryByRole("alert")).toBeNull();
    expect(overlay().textContent).not.toContain("Library load failed");
    // One line, the request's, which names its route.
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/library/query")));
    await settle();
    expect(server.logLines()).not.toContain(statusLogLine("Library load failed: Unauthorized", null, 0));
    expect(openNotices()).toEqual([]);
  });

  it("loads the library and the presets again once after pairing, when the server forgot the device's pairing", async () => {
    const { page, server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();
    page.stream().open();
    await flush();
    const presetLoads = server.requests("GET", "/api/presets").length;

    // The server forgot the device's pairing, as after a restart: it refuses the stream and the version check, and the
    // query a new sort sends.
    server.on("GET", "/api/version", () => status(401));
    page.stream().fail();
    await flush();
    await waitFor(() => expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex"));
    library.failures.push(401);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();
    expect(tileNames()).toEqual([]);
    const queries = library.queries().length;

    server.on("GET", "/api/version", () => json(COMPATIBLE_VERSION));
    server.on("POST", "/api/pair", () => json({ paired: true }));
    fireEvent.input(screen.getByLabelText("Pairing token"), { target: { value: "token-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));
    await waitFor(() => expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4"]));
    await settle();
    expect(library.queries()).toHaveLength(queries + 1);
    expect(library.queries().at(-1).sortMode).toBe("PlayCount");
    expect(server.requests("GET", "/api/presets")).toHaveLength(presetLoads + 1);
  });

  it("keeps the preset dropdown on Loading... while the presets need pairing, with only the pairing prompt", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => status(401));
    server.on("GET", "/api/presets", () => status(401));
    mountPage({ server });
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("GET /api/version")));
    await settle();

    expect(selectedPresetLabel()).toBe("Loading...");
    // Neither 401 shows anything but the pairing prompt: the server answered, so it isn't offline.
    expect(server.logLines().some((line) => line.startsWith("status=Reconnecting…"))).toBe(false);
    expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex");
    // The presets load once the server is ready, which it isn't until the device pairs.
    expect(server.requests("GET", "/api/presets")).toHaveLength(0);
    expect(server.logLines()).not.toContain(statusLogLine("Error loading presets: Unauthorized", null, 0));
    expect(server.logLines()).not.toContain(statusLogLine("Ready (API offline)", null, 0));
  });

  it("shows a load answered with a page that isn't JSON as an unexpected response, naming its content type", async () => {
    const { server } = await mountLibrary(libraryItems(2));
    await openLibrary();

    server.on("POST", "/api/library/query", () => new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    const message = "Library load failed: The server sent an unexpected response (text/html).";
    expect(within(overlay()).getByRole("alert").textContent).toBe(message);
    await expectRelayed(server, message);
  });

  it("says when the library is empty", async () => {
    await mountLibrary([]);
    await openLibrary();

    expect(within(overlay()).getByText("No media in library.")).toBeTruthy();
    expect(controlsShown()).toBe(true);
    expect(summary().hidden).toBe(true);
  });

  it("says when the filter leaves nothing, with the totals", async () => {
    await mountLibrary([], (_, lib) => {
      lib.searchBaselineCount = 5;
    });
    await openLibrary();

    expect(within(overlay()).getByText("Nothing matches the search or filters.")).toBeTruthy();
    expect(countLine()).toEqual({ shown: "0 / 5", spoken: "0 of 5 items" });
    expect(controlsShown()).toBe(true);
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
    expect(within(overlay()).getByText("Nothing matches the search or filters.")).toBeTruthy();
    expect(countLine()).toEqual({ shown: "0 / 3", spoken: "0 of 3 items" });
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
    expect(countLine()).toEqual({ shown: "450 / 450", spoken: "450 of 450 items" });

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

  it("does not fill while the tab is hidden", async () => {
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

  it("a further page that fails pops up, and loads again only after the scroll position changes", async () => {
    const { server, library } = await mountLibrary(libraryItems(650));
    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();

    library.failures.push(500);
    await scrollGridTo(1_000_000);
    expect(library.queries()).toHaveLength(3);
    await expectRelayed(server, "Library browse failed. Showing the tiles already loaded.");

    await scrollGridTo(1_000_000);
    expect(library.queries()).toHaveLength(3);
    await scrollGridTo(1_000_100);
    await flush();
    expect(library.queries().slice(3).map((query) => query.offset)).toEqual([400, 600]);
    expect(countLine()).toEqual({ shown: "650 / 650", spoken: "650 of 650 items" });
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

  it("tiles reloaded while the tab was hidden lay out as soon as it opens", async () => {
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
    // The Library tab, shown for the preset pick, fills its second page before and after it.
    await pickPreset("preset-favorites");
    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(4));
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
    expect(library.queries()).toHaveLength(5);
    expect(library.queries()[4]).toMatchObject({ offset: 0, limit: 400 });
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
    expect(library.queries()).toHaveLength(6);
    expect(library.queries()[5]).toMatchObject({ filterState: { favoritesMode: "only" }, offset: 0, limit: 400 });
    expect(within(overlay()).queryByText("Loading library…")).toBeNull();
    await library.release();

    records.push(...observer.takeRecords());
    observer.disconnect();
    expect(records).toHaveLength(0);
    expect(body()).toBe(host);
    expect(gridScroll()).toBe(scroller);
    expect(gridScroll().scrollTop).toBe(600);
    expect(countLine()).toEqual({ shown: "449 / 449", spoken: "449 of 449 items" });
  });
});

describe("starting over", () => {
  it("a preset pick starts over from the first page, and the tab shows the new totals", async () => {
    const { library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    expect(countLine()).toEqual({ shown: "3 / 3", spoken: "3 of 3 items" });

    library.items = [libraryItem(2, { isFavorite: true })];
    library.searchBaselineCount = 3;
    await pickPreset("preset-favorites");
    expect(library.queries()[1]).toMatchObject({ filterState: { favoritesMode: "only" }, offset: 0, limit: 200 });
    expect(countLine()).toEqual({ shown: "1 / 3", spoken: "1 of 3 items" });
    expect(tileNames()).toEqual(["clip 2.mp4"]);
  });

  it("applying the Filter tab starts over from the first page with the new filter", async () => {
    const { library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/sources", () => json([]));
      server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    });
    await openLibrary();

    await click(panelTab("Filter"));
    await waitFor(() => expect((document.getElementById("panel-page-filter") as HTMLElement).hidden).toBe(false));
    fireEvent.click(screen.getByLabelText("Favorites"));
    fireEvent.change(screen.getByLabelText("Favorites"));
    await click(screen.getByRole("button", { name: /^Apply/ }));

    await waitFor(() => expect(library.queries()).toHaveLength(2));
    expect(library.queries()[1]).toMatchObject({ filterState: { favoritesMode: "only" }, search: "", offset: 0, limit: 200 });
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
    await pickPreset("preset-favorites");
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
    expect(library.queries()[2]).toMatchObject({ filterState: { favoritesMode: "only" }, offset: 0, limit: 3 });
    expect(tileNames()).toEqual(["clip 2.mp4", "clip 3.mp4"]);
    expect(countLine()).toEqual({ shown: "2 / 2", spoken: "2 of 2 items" });
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
    await pickPreset("preset-beach");
    await openLibrary();
    expect(library.queries()).toHaveLength(2);

    library.items = library.items.slice(1);
    page.stream().emit("itemTagsChanged", 2, {
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
  it("Enter or Space on a focused tile plays it and closes the overlay, other keys do not, and the video element stays the same", async () => {
    useOverlayWidth();
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

  it("a tile the server cannot play leaves the overlay open and says why in the notice", async () => {
    useOverlayWidth();
    const replies: Response[] = [];
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => replies.shift()!);
    });
    await openLibrary();

    const cases: Array<[Response, string]> = [
      [json({ error: "Not found", code: "play_item_not_found" }, 404), "Media not found. The file may have moved or been deleted."],
      [json({ error: "Unavailable", code: "play_item_unavailable" }, 409), "This item is unavailable."],
      [json({ error: "Unsupported" }, 415), "This file type is not supported."],
      [json({ error: "Disk C:\\media is offline" }, 500), "Disk C:\\media is offline"],
      [json({}, 500), "Playback failed."],
      [json({ itemId: "item-1" }), "Playback failed."],
      [
        new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
        "Playback failed: The server sent an unexpected response (text/html)."
      ]
    ];
    for (const [reply, message] of cases) {
      replies.push(reply);
      await click(tile("item-1")!);
      expect(openNotices()).toEqual([message]);
      // The player's indicator shows nothing.
      expect(indicatorState()).toBeNull();
      expect(isOpen()).toBe(true);
      await closeNotices();
    }

    await waitFor(() =>
      expect(server.logLines()).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=404 code=play_item_not_found")
    );
    expect(server.logLines()).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=415 code=none");
    expect(server.logLines()).toEqual(
      expect.arrayContaining([
        statusLogLine("Playback failed", null, 0),
        statusLogLine("Playback failed.", null, 0),
        statusLogLine("Playback failed: The server sent an unexpected response (text/html).", null, 0)
      ])
    );
    expect(server.logLines().some((line) => line.includes("media"))).toBe(false);
    expect(video().getAttribute("src")).toBeNull();
  });

  it("an unauthorized play shows only the pairing prompt, and still relays its line", async () => {
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => status(401));
    });
    await openLibrary();

    await click(tile("item-1")!);

    expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex");
    expect(screen.queryByText("Unauthorized. Pair first.")).toBeNull();
    expect(openNotices()).toEqual([]);
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("POST /api/play/{itemId}")));
    await settle();
    expect(server.logLines()).not.toContain(statusLogLine("Unauthorized. Pair first.", null, 0));
    expect(server.logLines().some((line) => line.includes("item-1"))).toBe(false);
  });

  it("a second activation while a play is loading is ignored", async () => {
    useOverlayWidth();
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
    await click(tile("item-1")!);
    await click(tile("item-2")!);
    expect(server.requests("POST", "/api/play/item-1")).toHaveLength(1);
    expect(server.requests("POST", "/api/play/item-2")).toHaveLength(0);
    // The play waits, so after half a second the player's indicator says Loading….
    await waitFor(() => expect(indicatorState()).toBe("loading"));

    answer();
    await flush();
    expect(video().src).toBe(`${API_BASE_URL}/api/media/item-1?token=t`);
    expect(isOpen()).toBe(false);
    // The video plays, which ends the one loading period.
    await waitFor(() => expect(indicatorState()).toBeNull());
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "a play that cannot reach the server, which the browser calls %j, says so in the notice and leaves the overlay open",
    async (wording) => {
      useOverlayWidth();
      const { server } = await mountLibrary(libraryItems(3), (fake) => {
        fake.on("POST", "/api/play/item-1", () => {
          throw new TypeError(wording);
        });
      });
      await openLibrary();

      await click(tile("item-1")!);

      expect(openNotices()).toEqual(["Playback failed: Couldn't reach the server."]);
      expect(isOpen()).toBe(true);
      await waitFor(() =>
        expect(server.logLines()).toEqual(
          expect.arrayContaining([
            "playback=library-play-error attempt=0 hasCurrent=false message=Couldn't reach the server.",
            statusLogLine("Playback failed: Couldn't reach the server.", null, 0)
          ])
        )
      );
    }
  );
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
    expect(body().querySelector("b")).toBeNull();
    expect(tile("item-1")?.querySelector("img")).toBeNull();
    expect(tile("item-2")?.querySelector("img")?.getAttribute("src")).toBe(`${API_BASE_URL}/api/thumbnail/item-2?v=v7`);
    expect(tile("item-2")?.querySelector(".library-grid-tile-badge")).toBeNull();
    expect(tile("item-3")?.querySelector(".library-grid-tile-badge")?.textContent).toBe("favoritethumb_down");
  });

  it("add no browser storage keys while browsing and playing, besides the device's own, and not the search", async () => {
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

    expect(storageKeys(localStorage)).toEqual(["rr_clientId", "rr_device.library.sort", "rr_device.panel.open", "rr_device.panel.tab"]);
    expect(storageKeys(sessionStorage)).toEqual(["rr_sessionId"]);
  });
});

/** The Library tab's controls and Filters line, which collapse together. */
function controls(): HTMLElement {
  return document.getElementById("library-controls") as HTMLElement;
}

function filtersLine(): HTMLButtonElement {
  return document.getElementById("library-filter-summary") as HTMLButtonElement;
}

function collapseButton(): HTMLButtonElement {
  return document.getElementById("library-controls-toggle") as HTMLButtonElement;
}

function randomizationModeSelect(): HTMLSelectElement {
  return within(overlay()).getByRole("combobox", { name: "Choose randomization mode", hidden: true }) as HTMLSelectElement;
}

function selectedOption(select: HTMLSelectElement): string {
  return select.options[select.selectedIndex]?.textContent ?? "";
}

/** The tiles' row heights and widths as the grid laid them out, gaps included. */
function rowLayout(): Array<{ height: number; width: number }> {
  return Array.from(overlay().querySelectorAll<HTMLElement>(".library-grid-row")).map((row) => {
    const tiles = Array.from(row.querySelectorAll<HTMLElement>(".library-grid-tile"));
    const width = tiles.reduce((sum, tile) => sum + Number.parseFloat(tile.style.width), 0) + 2 * (tiles.length - 1);
    return { height: Number.parseFloat(row.style.height), width };
  });
}

/** Unmounts the page and mounts it again with what this device remembers, as a page refresh does. */
async function refresh(
  page: MountedPage,
  items: LibraryRow[],
  setup: (server: FakeServer, library: FakeLibrary) => void = () => {}
): Promise<LibraryPage> {
  page.unmount();
  return mountLibrary(items, setup);
}

const RICH_PRESET = {
  id: "preset-rich",
  name: "Rich",
  filterState: {
    favoritesMode: "only",
    blacklistedMode: "excluded",
    onlyNeverPlayed: true,
    mediaTypeFilter: 2,
    minDuration: "00:01:30",
    selectedTags: ["Beach", "Sunset"],
    excludedTags: ["Rain"],
    includedSourceIds: []
  }
};

const BLACKLISTED_ONLY_PRESET = {
  id: "preset-blacklisted",
  name: "Blacklisted",
  filterState: { blacklistedMode: "only", selectedTags: [], excludedTags: [], includedSourceIds: [] }
};

const ONE_SOURCE_PRESET = {
  id: "preset-one-source",
  name: "Movies",
  filterState: { selectedTags: [], excludedTags: [], includedSourceIds: ["source-1"] }
};

const SOURCES = [
  { id: "source-1", rootPath: "C:\\media\\movies", displayName: "Movies", isEnabled: true },
  { id: "source-2", rootPath: "C:\\media\\photos", displayName: "Photos", isEnabled: true },
  { id: "source-3", rootPath: "C:\\media\\archive", displayName: "Archive", isEnabled: false }
];

const REMEMBERED_FILTER_KEY = "rr_device.filter.applied";

describe("controls", () => {
  it("sit above the grid in order: preset, randomization mode, sort with its direction, and search, and the header has neither dropdown", async () => {
    await mountLibrary(libraryItems(3));
    expect(document.querySelector("header")!.querySelectorAll("select")).toHaveLength(0);
    await openLibrary();

    const named = Array.from(controls().querySelectorAll("select, button, input")).map((control) => control.getAttribute("aria-label"));
    expect(named).toEqual(["Choose preset", "Choose randomization mode", "Sort library", "Toggle sort direction", "Search library"]);
    const parts = Array.from(overlay().children).map((child) => child.id || child.className);
    expect(parts).toEqual(["library-overlay-header", "library-filter-summary", "library-controls", "library-overlay-body"]);
    expect(controlsShown()).toBe(true);
  });

  it("put the preset and randomization dropdowns in one row from a panel about 440 px wide", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();
    const pair = presetSelect().parentElement!;
    expect(pair.classList.contains("library-controls-pair")).toBe(true);
    expect(randomizationModeSelect().parentElement).toBe(pair);

    // happy-dom doesn't apply container queries (measured), so the rule's text stands in for the layout.
    const stylesheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../styles.css"), "utf8");
    expect(stylesheet).toMatch(/\.library-controls \{\s*container: library-controls \/ inline-size;/);
    expect(stylesheet).toMatch(
      /@container library-controls \(min-width: 414px\) \{\s*\.library-controls-pair \{\s*flex-direction: row;\s*\}\s*\.library-controls-pair > select \{\s*flex: 1 1 0;\s*\}\s*\}/
    );
    expect(stylesheet).toMatch(/\.library-controls-pair \{\s*display: flex;\s*flex-direction: column;/);
  });

  it("collapse and expand together with the Filters line, say which, and stay collapsed after a page refresh", async () => {
    useStylesheet();
    const { page } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    await pickPreset("preset-favorites");
    expect(currentStyle(filtersLine()).display).toBe("block");
    expect(collapseButton().title).toBe("Hide controls & filters");
    expect(collapseButton().getAttribute("aria-label")).toBe("Hide library controls and filters");
    expect(collapseButton().getAttribute("aria-expanded")).toBe("true");
    expect(collapseButton().textContent).toBe("unfold_less");

    await click(collapseButton());
    expect(currentStyle(controls()).display).toBe("none");
    expect(currentStyle(filtersLine()).display).toBe("none");
    expect(collapseButton().title).toBe("Show controls & filters");
    expect(collapseButton().getAttribute("aria-label")).toBe("Show library controls and filters");
    expect(collapseButton().getAttribute("aria-expanded")).toBe("false");
    expect(collapseButton().textContent).toBe("unfold_more");

    await refresh(page, libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    expect(currentStyle(controls()).display).toBe("none");
    expect(currentStyle(filtersLine()).display).toBe("none");

    await click(collapseButton());
    expect(currentStyle(controls()).display).not.toBe("none");
    expect(currentStyle(filtersLine()).display).toBe("block");
    expect(collapseButton().getAttribute("aria-expanded")).toBe("true");
  });
});

describe("Filters line", () => {
  it("shows while a filter applies, naming each applied filter after a bold Filters:", async () => {
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([RICH_PRESET, BLACKLISTED_ONLY_PRESET]));
    });
    await openLibrary();
    expect(filtersLine().hidden).toBe(true);

    await pickPreset("preset-rich");
    expect(filtersLine().hidden).toBe(false);
    expect(filtersLine().querySelector("b")!.textContent).toBe("Filters: ");
    expect(filtersLine().textContent).toBe("Filters: Favorites only · Only never played · Photos only · Min 01:30 · 2 tags · 1 tag excluded");

    await pickPreset("preset-blacklisted");
    expect(filtersLine().textContent).toBe("Filters: Blacklisted only");

    // Blacklisted excluded is the default, which the line doesn't name.
    await pickPreset("");
    expect(filtersLine().hidden).toBe(true);
  });

  it("counts the chosen sources out of all the sources, loading them for a source filter", async () => {
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("GET", "/api/presets", () => json([ONE_SOURCE_PRESET]));
      fake.on("GET", "/api/sources", () => json(SOURCES));
    });
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    await openLibrary();

    await pickPreset("preset-one-source");
    await waitFor(() => expect(filtersLine().textContent).toBe("Filters: 1 of 3 sources"));
    expect(server.requests("GET", "/api/sources")).toHaveLength(1);
  });

  it("opens the Filter tab when tapped or clicked", async () => {
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
      server.on("GET", "/api/sources", () => json([]));
      server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    });
    await openLibrary();
    await pickPreset("preset-favorites");

    await click(filtersLine());
    expect(isOpen()).toBe(false);
    expect((document.getElementById("panel-page-filter") as HTMLElement).hidden).toBe(false);
    expect(panelTab("Filter").getAttribute("aria-selected")).toBe("true");
  });
});

describe("rows", () => {
  const MIXED = [
    { thumbnailWidth: 1920, thumbnailHeight: 1080 },
    { thumbnailWidth: 1080, thumbnailHeight: 1920 },
    { thumbnailWidth: 1200, thumbnailHeight: 900 },
    { thumbnailWidth: 3000, thumbnailHeight: 1000 },
    { thumbnailWidth: 800, thumbnailHeight: 800 }
  ];
  const items = Array.from({ length: 60 }, (_, index) => libraryItem(index + 1, MIXED[index % MIXED.length]));

  for (const [where, viewport, width] of [
    ["beside the player", { width: 1024, height: 768 }, 394],
    ["as the overlay", { width: 600, height: 800 }, 574]
  ] as const) {
    it(`fit the panel's width at 100 to 240 px high, ${where}`, async () => {
      setViewport(viewport);
      await mountLibrary(items, () => stubLayoutSize(width, 600));
      await openLibrary();
      expect(document.getElementById("fullscreen-stage")!.dataset.panelMode).toBe(where === "as the overlay" ? "overlay" : "side");

      const rows = rowLayout();
      expect(rows.length).toBeGreaterThan(3);
      for (const row of rows) {
        expect(row.height).toBeGreaterThanOrEqual(100);
        expect(row.height).toBeLessThanOrEqual(240);
      }
      // Every row but the last fills the width; the last keeps its tiles' shapes at 160 px.
      for (const row of rows.slice(0, -1)) {
        expect(row.width).toBeCloseTo(width, 6);
      }
      expect(rows.some((row) => Math.abs(row.height - 160) > 1)).toBe(true);
    });
  }
});

describe("tile icons and tooltip", () => {
  it("show favorite and blacklist as filled icons with a drop shadow and no dark rectangle", async () => {
    useStylesheet();
    await mountLibrary([libraryItem(1, { isFavorite: true, isBlacklisted: true })]);
    await openLibrary();

    const badge = tile("item-1")!.querySelector<HTMLElement>(".library-grid-tile-badge")!;
    expect(currentStyle(badge).backgroundColor).toBe("");
    expect(currentStyle(badge).padding).toBe("");
    for (const icon of Array.from(badge.querySelectorAll<HTMLElement>(".material-symbol-icon"))) {
      const style = currentStyle(icon);
      expect(style.fontVariationSettings).toBe('"FILL" 1, "wght" 700, "GRAD" 0, "opsz" 20');
      expect(style.filter).toBe("drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.5))");
    }
  });

  it("show the playing icon on the playing tile only, and move it to the next tile played", async () => {
    useStylesheet();
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/play/item-1", () => json(playResponse(1)));
      fake.on("POST", "/api/play/item-2", () => json(playResponse(2)));
    });
    await openLibrary();
    const ids = ["item-1", "item-2", "item-3"];
    // Restyling changes the page, which would wake waitFor again, so it waits for the class and reads styles after.
    const playingShown = () => ids.filter((id) => currentStyle(tile(id)!.querySelector(".library-grid-tile-playing")!).display === "flex");
    const playingMarked = () => ids.filter((id) => tile(id)!.classList.contains("is-playing"));
    expect(playingShown()).toEqual([]);

    await click(tile("item-1")!);
    await waitFor(() => expect(playingMarked()).toEqual(["item-1"]));
    expect(playingShown()).toEqual(["item-1"]);
    const icon = tile("item-1")!.querySelector<HTMLElement>(".library-grid-tile-playing .material-symbol-icon")!;
    expect(icon.textContent).toBe("play_circle");
    expect(currentStyle(icon).fontVariationSettings).toBe('"FILL" 1, "wght" 700, "GRAD" 0, "opsz" 20');
    expect(currentStyle(icon).opacity).toBe("0.8");

    await click(tile("item-2")!);
    await waitFor(() => expect(playingMarked()).toEqual(["item-2"]));
    expect(playingShown()).toEqual(["item-2"]);
    expect(server.requests("POST", "/api/play/item-2")).toHaveLength(1);

    // The tiles rendered again for a new order still mark it.
    await click(directionButton());
    await waitFor(() => expect(server.requests("POST", "/api/library/query").at(-1)!.body.sortDescending).toBe(true));
    await settle();
    expect(playingMarked()).toEqual(["item-2"]);
    expect(playingShown()).toEqual(["item-2"]);
  });

  it("show the file name as the tile's tooltip, and on the tile", async () => {
    await mountLibrary(libraryItems(2));
    await openLibrary();
    expect(tile("item-1")!.title).toBe("clip 1.mp4");
    expect(tile("item-1")!.querySelector(".library-grid-tile-filename")!.textContent).toBe("clip 1.mp4");
  });
});

describe("memory", () => {
  it("keeps the collapsed controls, the preset and its filter, randomization mode, and sort and direction after a page refresh, and not the search", async () => {
    const presets = (server: FakeServer) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
      server.on("POST", "/api/random", () => json(playResponse(1)));
    };
    const first = await mountLibrary(libraryItems(3), presets);
    await openLibrary();
    await pickPreset("preset-favorites");
    fireEvent.change(randomizationModeSelect(), { target: { value: "SpreadMode" } });
    fireEvent.change(sortSelect(), { target: { value: "Duration" } });
    await click(directionButton());
    fireEvent.input(searchBox(), { target: { value: "clip" } });
    await waitFor(() => expect(first.library.queries().at(-1)!.search).toBe("clip"));
    await click(collapseButton());
    const page = first.page;

    const { server, library } = await refresh(page, libraryItems(3), presets);
    expect(library.queries()[0]).toMatchObject({
      filterState: { favoritesMode: "only" },
      search: "",
      sortMode: "Duration",
      sortDescending: false
    });
    await openLibrary();
    expect(selectedPresetLabel()).toBe("Favorites");
    expect(selectedOption(randomizationModeSelect())).toBe("Spread Mode");
    expect(sortSelect().value).toBe("Duration");
    expect(directionButton().textContent).toBe("Shortest → Longest");
    expect(searchBox().value).toBe("");
    expect(controlsShown()).toBe(false);

    await click(screen.getByRole("button", { name: "Play/Pause" }));
    const pick = server.requests("POST", "/api/random")[0]!.body;
    expect(pick).toMatchObject({ presetId: "preset-favorites", randomizationMode: "SpreadMode", filterState: { favoritesMode: "only" } });
  });

  it("shows a remembered preset renamed elsewhere by its new name, and one deleted as None*, keeping its filter", async () => {
    const { page } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await pickPreset("preset-favorites");

    const renamed = { ...ALL_FAVORITES_PRESET, id: "Faves", name: "Faves" };
    const second = await refresh(page, libraryItems(3), (server) => server.on("GET", "/api/presets", () => json([renamed])));
    await waitFor(() => expect(selectedPresetLabel()).toBe("Faves"));
    expect(second.library.queries().at(-1)).toMatchObject({ filterState: { favoritesMode: "only" } });

    const third = await refresh(second.page, libraryItems(3), (server) => server.on("GET", "/api/presets", () => json([])));
    await waitFor(() => expect(selectedPresetLabel()).toBe("None*"));
    expect(third.library.queries().at(-1)).toMatchObject({ filterState: { favoritesMode: "only" } });
  });

  it("takes a tag renamed or deleted elsewhere into a remembered preset's own filter, as the open page does", async () => {
    const { page } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([BEACH_PRESET]));
    });
    await pickPreset("preset-beach");
    expect(JSON.parse(localStorage.getItem(REMEMBERED_FILTER_KEY)!)).toMatchObject({ preset: "Beach", unchanged: true });

    const shore = { ...BEACH_PRESET, filterState: { ...BEACH_PRESET.filterState, selectedTags: ["Shore"] } };
    const second = await refresh(page, libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([shore]));
      server.on("POST", "/api/random", () => json(playResponse(1)));
    });
    await waitFor(() => expect(second.library.queries().at(-1)!.filterState.selectedTags).toEqual(["Shore"]));
    expect(selectedPresetLabel()).toBe("Beach");
    await click(screen.getByRole("button", { name: "Play/Pause" }));
    expect(second.server.requests("POST", "/api/random")[0]!.body.filterState.selectedTags).toEqual(["Shore"]);

    const emptied = { ...BEACH_PRESET, filterState: { ...BEACH_PRESET.filterState, selectedTags: [] } };
    const third = await refresh(second.page, libraryItems(3), (server) => server.on("GET", "/api/presets", () => json([emptied])));
    await waitFor(() => expect(third.library.queries().at(-1)!.filterState.selectedTags).toEqual([]));
    // The preset is left with the default filter, which is None.
    expect(selectedPresetLabel()).toBe("None");
  });

  it("keeps a changed filter's tags as remembered, starred, as the open page keeps a tag no item held", async () => {
    localStorage.setItem(
      REMEMBERED_FILTER_KEY,
      JSON.stringify({
        filter: { selectedTags: ["Beach"], excludedTags: [], includedSourceIds: [], onlyNeverPlayed: true },
        preset: "Beach",
        unchanged: false
      })
    );
    const shore = { ...BEACH_PRESET, filterState: { ...BEACH_PRESET.filterState, selectedTags: ["Shore"] } };
    const { library } = await mountLibrary(libraryItems(3), (server) => server.on("GET", "/api/presets", () => json([shore])));
    await waitFor(() => expect(selectedPresetLabel()).toBe("Beach*"));
    expect(library.queries().every((query) => query.filterState.selectedTags[0] === "Beach")).toBe(true);
  });

  it("sends a remembered source as it was, and counts it out of the sources there are now", async () => {
    localStorage.setItem(
      REMEMBERED_FILTER_KEY,
      JSON.stringify({
        filter: { selectedTags: [], excludedTags: [], includedSourceIds: ["source-gone"] },
        preset: null,
        unchanged: false
      })
    );
    const { library } = await mountLibrary(libraryItems(3), (server) => server.on("GET", "/api/sources", () => json(SOURCES)));
    expect(library.queries()[0].filterState.includedSourceIds).toEqual(["source-gone"]);
    await openLibrary();
    await waitFor(() => expect(filtersLine().textContent).toBe("Filters: 0 of 3 sources"));
  });
});

describe("kept sources", () => {
  const MOVIES_NOTICE =
    "Library refresh found no media files in Movies (C:\\media\\movies), so it kept the library's 120 items from there. If the folder is on a drive or share, check that it's connected.";
  const LOG_LINE = statusLogLine("Library refresh kept the items of sources whose folder listed no media files", null, 0);

  /** A refresh status that lists the sources the run kept, while its source stage runs or once it has finished. */
  function refreshStatus(runId: string, sourceStageDone: boolean, keptSources: Array<{ sourceId: string; itemCount: number }>) {
    return {
      snapshot: {
        isRunning: true,
        runId,
        trigger: "manual",
        currentStage: sourceStageDone ? "fingerprintScan" : "sourceRefresh",
        stages: [{ stage: "sourceRefresh", percent: sourceStageDone ? 100 : 40, message: "", isComplete: sourceStageDone }],
        keptSources
      }
    };
  }

  it("waits for the source stage, loads the source list to name the folder, and names it once for the page's life", async () => {
    const { page, server } = await mountLibrary(libraryItems(3), (fake) => fake.on("GET", "/api/sources", () => json(SOURCES)));
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);

    page.stream().emit("refreshStatusChanged", 2, refreshStatus("run-1", false, [{ sourceId: "source-1", itemCount: 120 }]));
    await flush();
    expect(openNotices()).toEqual([]);
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);

    page.stream().emit("refreshStatusChanged", 3, refreshStatus("run-1", true, [{ sourceId: "source-1", itemCount: 120 }]));
    await waitFor(() => expect(openNotices()).toEqual([MOVIES_NOTICE]));
    expect(server.requests("GET", "/api/sources")).toHaveLength(1);
    await waitFor(() => expect(server.logLines()).toContain(LOG_LINE));
    expect(server.logLines().some((line) => line.includes("movies") || line.includes("Movies"))).toBe(false);
    await closeNotices();
    // The list behind the bell keeps it.
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await flush();
    const recent = document.querySelectorAll('#notify-list [data-part="recent"] .notify-text');
    expect(Array.from(recent, (text) => text.textContent)).toEqual([MOVIES_NOTICE]);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    await flush();

    page.stream().emit("refreshStatusChanged", 4, refreshStatus("run-2", true, [{ sourceId: "source-1", itemCount: 120 }]));
    await flush();
    expect(openNotices()).toEqual([]);
  });

  it("names several folders in one notice from the source list already loaded", async () => {
    localStorage.setItem(
      REMEMBERED_FILTER_KEY,
      JSON.stringify({
        filter: { selectedTags: [], excludedTags: [], includedSourceIds: ["source-1"] },
        preset: null,
        unchanged: false
      })
    );
    const { page, server } = await mountLibrary(libraryItems(3), (fake) => fake.on("GET", "/api/sources", () => json(SOURCES)));
    await waitFor(() => expect(server.requests("GET", "/api/sources")).toHaveLength(1));

    page.stream().emit(
      "refreshStatusChanged",
      2,
      refreshStatus("run-1", true, [
        { sourceId: "source-1", itemCount: 120 },
        { sourceId: "source-2", itemCount: 1000 }
      ])
    );
    await waitFor(() =>
      expect(openNotices()).toEqual([
        `Library refresh found no media files in Movies (C:\\media\\movies) and Photos (C:\\media\\photos), so it kept the library's ${(1120).toLocaleString()} items from them. If the folders are on a drive or share, check that it's connected.`
      ])
    );
    expect(server.requests("GET", "/api/sources")).toHaveLength(1);
  });

  it("loads the source list again when it lacks a kept source, and leaves out a source it still lacks", async () => {
    localStorage.setItem(
      REMEMBERED_FILTER_KEY,
      JSON.stringify({
        filter: { selectedTags: [], excludedTags: [], includedSourceIds: ["source-2"] },
        preset: null,
        unchanged: false
      })
    );
    // The Filters line loads the list before Movies is added.
    let listed = [SOURCES[1]!];
    const { page, server } = await mountLibrary(libraryItems(3), (fake) => fake.on("GET", "/api/sources", () => json(listed)));
    await waitFor(() => expect(server.requests("GET", "/api/sources")).toHaveLength(1));
    listed = SOURCES;

    page.stream().emit(
      "refreshStatusChanged",
      2,
      refreshStatus("run-1", true, [
        { sourceId: "source-1", itemCount: 120 },
        { sourceId: "source-hidden", itemCount: 4 }
      ])
    );
    await waitFor(() => expect(openNotices()).toEqual([MOVIES_NOTICE]));
    expect(server.requests("GET", "/api/sources")).toHaveLength(2);
  });
});
