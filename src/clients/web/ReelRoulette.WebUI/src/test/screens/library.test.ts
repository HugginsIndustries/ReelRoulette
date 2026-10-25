// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import { REMOTE_CONNECTIONS_OFF } from "../serverReasons";
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
  popupsShown,
  presetSelect,
  randomAnswer,
  resetPage,
  selectedPresetLabel,
  setViewport,
  settle,
  status,
  starsShown,
  stubLayoutSize,
  stubStarLayout,
  stylesheetText,
  tapStars,
  unauthorizedLogLine,
  useStylesheet,
  xFor,
  type MountedPage
} from "./pageHarness";

const ALL_FAVORITES_PRESET = {
  id: "preset-favorites",
  name: "Favorites",
  filterState: { favoritesMode: "only", selectedTags: [], excludedTags: [], includedSourceIds: [] }
};

const UNRATED_PRESET = {
  id: "preset-unrated",
  name: "Unrated",
  filterState: { onlyUnrated: true, selectedTags: [], excludedTags: [], includedSourceIds: [] }
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
function panelTab(name: "Library" | "Filter" | "Tags" | "Randomization"): HTMLElement {
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

/** The count line as it shows, such as "3 / 3 shown". */
function countLine(): string {
  return summary().textContent ?? "";
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
  return document.querySelector<HTMLElement>("#player-indicator")?.dataset.state ?? null;
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
    expect(overlay().querySelector(".library-overlay-status-error")?.textContent).toBe("Server missing required capabilities: api.presets.byId.");
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
    expect(overlay().querySelector(".library-overlay-status-error")?.textContent).toBe(`Running without a library. ${NO_LIBRARY_MESSAGE}`);
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
    expect(countLine()).toBe("3 / 3 shown");
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
    expect(countLine()).toBe("2 / 2 shown");
    expect(controlsShown()).toBe(true);
  });

  it("says a first page failed, in the error color, relaying its status, and opening again loads it", async () => {
    const { server, library } = await mountLibrary(libraryItems(2), (_, lib) => {
      lib.failures.push(500);
    });
    await expectRelayed(server, "Library load failed (HTTP 500).");

    await openLibrary();
    await waitFor(() => expect(library.queries()).toHaveLength(2));
    await flush();
    expect(tileNames()).toEqual(["clip 1.mp4", "clip 2.mp4"]);
  });

  it("shows the load error in the error color, keeping the controls", async () => {
    useStylesheet();
    const { server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(503);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    const error = overlay().querySelector(".library-overlay-status-error")!;
    expect(error.textContent).toBe("Library load failed.");
    const errorColor = () => [currentStyle(error).color, currentStyle(document.documentElement).getPropertyValue("--error").trim()];
    expect(errorColor()[0]).toBe(errorColor()[1]);
    document.documentElement.classList.add("theme-light");
    try {
      expect(errorColor()[0]).toBe(errorColor()[1]);
    } finally {
      document.documentElement.classList.remove("theme-light");
    }
    // It shows in place, so it only relays, with the status in place of the text.
    await expectRelayed(server, "Library load failed (HTTP 503).");
    expect(controlsShown()).toBe(true);
    expect(summary().hidden).toBe(true);
    expect(tileNames()).toEqual([]);
  });

  it.each([
    [408, "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."],
    [504, "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."],
    [500, "Library load failed."]
  ])("shows a load answered with %i as its own message in the body, and relays its status", async (failure, message) => {
    const { server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(failure);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    expect(overlay().querySelector(".library-overlay-status-error")?.textContent).toBe(message);
    await expectRelayed(server, `Library load failed (HTTP ${failure}).`);
  });

  it("shows no failure for a load answered with 401, only the pairing prompt, and logs it", async () => {
    const { server, library } = await mountLibrary(libraryItems(2));
    await openLibrary();

    library.failures.push(401);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    await waitFor(() => expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex"));
    expect(overlay().querySelector(".library-overlay-status-error")).toBeNull();
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

  it("keeps the preset dropdown on Loading… while the presets need pairing, with only the pairing prompt", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => status(401));
    server.on("GET", "/api/presets", () => status(401));
    mountPage({ server });
    await waitFor(() => expect(server.logLines()).toContain(unauthorizedLogLine("GET /api/version")));
    await settle();

    expect(selectedPresetLabel()).toBe("Loading…");
    // Neither 401 shows anything but the pairing prompt: the server answered, so it isn't offline.
    expect(server.logLines().some((line) => line.startsWith("status=Reconnecting…"))).toBe(false);
    expect((document.getElementById("pair-section") as HTMLElement).style.display).toBe("flex");
    // The presets load once the server is ready, which it isn't until the device pairs.
    expect(server.requests("GET", "/api/presets")).toHaveLength(0);
    expect(server.logLines()).not.toContain(statusLogLine("Error loading presets: Unauthorized", null, 0));
    expect(server.logLines()).not.toContain(statusLogLine("Ready (API offline)", null, 0));
  });

  it("shows a load answered with a page that isn't JSON as an unexpected response, naming its content type only in the log", async () => {
    const { server } = await mountLibrary(libraryItems(2));
    await openLibrary();

    server.on("POST", "/api/library/query", () => new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    expect(overlay().querySelector(".library-overlay-status-error")?.textContent).toBe("Library load failed: The server sent an unexpected response.");
    await expectRelayed(server, "Library load failed: The server sent an unexpected response (text/html).");
  });

  it("shows the server's reason for a load it refuses, relaying only the status", async () => {
    const { server } = await mountLibrary(libraryItems(2));
    await openLibrary();

    server.on("POST", "/api/library/query", () => json({ error: REMOTE_CONNECTIONS_OFF }, 403));
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    expect(overlay().querySelector(".library-overlay-status-error")?.textContent).toBe(`Library load failed: ${REMOTE_CONNECTIONS_OFF}`);
    await expectRelayed(server, "Library load failed (HTTP 403).");
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
    expect(countLine()).toBe("0 / 5 shown");
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
    expect(countLine()).toBe("0 / 3 shown");
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

  it("the Rating sort comes last, starting on Highest → Lowest, and the direction button reverses it", async () => {
    const { library } = await mountLibrary(libraryItems(3));
    await openLibrary();
    expect([...sortSelect().options].map((option) => [option.value, option.textContent])).toEqual([
      ["Name", "Name"],
      ["LastPlayed", "Last played"],
      ["PlayCount", "Play count"],
      ["Duration", "Duration"],
      ["DateAdded", "Date added"],
      ["DateCreated", "Date created"],
      ["Rating", "Rating"]
    ]);

    fireEvent.change(sortSelect(), { target: { value: "Rating" } });
    await flush();
    expect(library.queries()[1]).toMatchObject({ sortMode: "Rating", sortDescending: true, offset: 0 });
    expect(directionButton().textContent).toBe("Highest → Lowest");

    await click(directionButton());
    expect(library.queries()[2]).toMatchObject({ sortMode: "Rating", sortDescending: false, offset: 0 });
    expect(directionButton().textContent).toBe("Lowest → Highest");
  });

  it("the Date created sort follows Date added, starting on Newest → Oldest, and the direction button reverses it", async () => {
    const { library } = await mountLibrary(libraryItems(3));
    await openLibrary();

    fireEvent.change(sortSelect(), { target: { value: "DateCreated" } });
    await flush();
    expect(library.queries()[1]).toMatchObject({ sortMode: "DateCreated", sortDescending: true, offset: 0 });
    expect(directionButton().textContent).toBe("Newest → Oldest");

    await click(directionButton());
    expect(library.queries()[2]).toMatchObject({ sortMode: "DateCreated", sortDescending: false, offset: 0 });
    expect(directionButton().textContent).toBe("Oldest → Newest");
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
    expect(countLine()).toBe("450 / 450 shown");

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
    expect(countLine()).toBe("650 / 650 shown");
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
    expect(countLine()).toBe("449 / 449 shown");
  });
});

describe("starting over", () => {
  it("a preset pick starts over from the first page, and the tab shows the new totals", async () => {
    const { library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    expect(countLine()).toBe("3 / 3 shown");

    library.items = [libraryItem(2, { isFavorite: true })];
    library.searchBaselineCount = 3;
    await pickPreset("preset-favorites");
    expect(library.queries()[1]).toMatchObject({ filterState: { favoritesMode: "only" }, offset: 0, limit: 200 });
    expect(countLine()).toBe("1 / 3 shown");
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
    expect(countLine()).toBe("2 / 2 shown");
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

  it("a rating event leaves the window as it is with no rating filter or sort, and under Only unrated reloads it when a loaded tile gets a rating", async () => {
    const { page, library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([UNRATED_PRESET]));
    });
    await openLibrary();
    page.stream().emit("itemRatingChanged", 2, { itemId: "item-1", path: "C:\\media\\clip 1.mp4", rating: 4, previousRating: null, clientId: page.clientId() });
    await flush();
    expect(library.queries()).toHaveLength(1);

    await pickPreset("preset-unrated");
    expect(library.queries()).toHaveLength(2);
    library.items = library.items.slice(1);
    page.stream().emit("itemRatingChanged", 3, { itemId: "item-1", path: "C:\\media\\clip 1.mp4", rating: 2.5, previousRating: null, clientId: "another-client" });
    await flush();

    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ filterState: { onlyUnrated: true }, offset: 0, limit: 3 });
    expect(tileNames()).toEqual(["clip 2.mp4", "clip 3.mp4"]);
  });

  it("under Favorites only, a batch unfavoriting several loaded tiles reloads the loaded window in one request", async () => {
    const { page, library } = await mountLibrary(libraryItems(5, { isFavorite: true }), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await pickPreset("preset-favorites");
    await openLibrary();
    expect(library.queries()).toHaveLength(2);

    library.items = library.items.slice(3);
    const unfavorited = (itemId: string) => ({
      itemId,
      isFavorite: false,
      isBlacklisted: false,
      previousIsFavorite: true,
      previousIsBlacklisted: false
    });
    page.stream().emit("bulkItemStateChanged", 2, {
      flag: "favorite",
      value: false,
      count: 3,
      items: [unfavorited("item-1"), unfavorited("item-2"), unfavorited("item-3")],
      clientId: "another-client"
    });
    await flush();

    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ filterState: { favoritesMode: "only" }, offset: 0, limit: 5 });
    expect(tileNames()).toEqual(["clip 4.mp4", "clip 5.mp4"]);
    expect(countLine()).toBe("2 / 2 shown");
  });

  it("a batch favoriting several loaded tiles updates each badge without reloading", async () => {
    const { page, library } = await mountLibrary(libraryItems(3));
    await openLibrary();

    const favorited = (itemId: string) => ({
      itemId,
      isFavorite: true,
      isBlacklisted: false,
      previousIsFavorite: false,
      previousIsBlacklisted: false
    });
    page.stream().emit("bulkItemStateChanged", 2, {
      flag: "favorite",
      value: true,
      count: 3,
      items: [favorited("item-1"), favorited("item-3"), favorited("item-outside")],
      clientId: page.clientId()
    });
    await flush();

    expect(library.queries()).toHaveLength(1);
    expect(["item-1", "item-2", "item-3"].map((id) => tile(id)?.querySelector(".library-grid-tile-badge")?.textContent ?? null)).toEqual([
      "favorite",
      null,
      "favorite"
    ]);
  });

  it("under Only unrated, a batch rating several loaded tiles reloads the loaded window in one request", async () => {
    const { page, library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([UNRATED_PRESET]));
    });
    await pickPreset("preset-unrated");
    await openLibrary();
    expect(library.queries()).toHaveLength(2);

    library.items = library.items.slice(2);
    page.stream().emit("bulkItemRatingChanged", 2, {
      rating: 3,
      count: 2,
      items: [
        { itemId: "item-1", rating: 3, previousRating: null },
        { itemId: "item-2", rating: 3, previousRating: null }
      ],
      clientId: "another-client"
    });
    await flush();

    expect(library.queries()).toHaveLength(3);
    expect(library.queries()[2]).toMatchObject({ filterState: { onlyUnrated: true }, offset: 0, limit: 3 });
    expect(tileNames()).toEqual(["clip 3.mp4"]);
  });

  it("removed items reload the loaded window in one request", async () => {
    const { page, library } = await mountLibrary(libraryItems(4));
    await openLibrary();
    expect(library.queries()).toHaveLength(1);

    library.items = [library.items[1]!, library.items[3]!];
    page.stream().emit("itemsRemoved", 2, { itemIds: ["item-1", "item-3"] });
    await flush();

    expect(library.queries()).toHaveLength(2);
    expect(library.queries()[1]).toMatchObject({ offset: 0, limit: 4 });
    expect(tileNames()).toEqual(["clip 2.mp4", "clip 4.mp4"]);
    expect(countLine()).toBe("2 / 2 shown");
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

describe("tile patching", () => {
  /** What the grid's rows changed while `emit`'s event was handled. */
  async function gridChangesBy(emit: () => void): Promise<MutationRecord[]> {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(overlay().querySelector(".library-grid-rows")!, { subtree: true, childList: true, attributes: true, characterData: true });
    emit();
    await flush();
    records.push(...observer.takeRecords());
    observer.disconnect();
    return records;
  }

  // Without the Blacklisted filter, so blacklisting a tile patches it rather than reloading the window.
  const EVERYTHING_PRESET = {
    id: "preset-everything",
    name: "Everything",
    filterState: { blacklistedMode: "off", selectedTags: [], excludedTags: [], includedSourceIds: [] }
  };

  it("a favorite or blacklist event changes only that tile, and playback, tag, and rating events change no tile", async () => {
    const { page, library } = await mountLibrary(libraryItems(30, { hasThumbnail: true, thumbnailVersion: "v1" }), (server) => {
      server.on("GET", "/api/presets", () => json([EVERYTHING_PRESET]));
    });
    await pickPreset("preset-everything");
    await openLibrary();
    const queries = library.queries().length;
    const tiles = Array.from(overlay().querySelectorAll<HTMLElement>(".library-grid-tile"));
    expect(tiles.length).toBe(30);
    const onlyIn = (records: MutationRecord[], itemId: string) =>
      records.length > 0 && records.every((record) => tile(itemId)!.contains(record.target));

    const favorited = await gridChangesBy(() =>
      page.stream().emit("itemStateChanged", 2, { itemId: "item-3", isFavorite: true, isBlacklisted: false })
    );
    expect(onlyIn(favorited, "item-3")).toBe(true);
    expect(tile("item-3")!.querySelector(".library-grid-tile-badge")?.textContent).toBe("favorite");

    const blacklisted = await gridChangesBy(() =>
      page.stream().emit("itemStateChanged", 3, { itemId: "item-4", isFavorite: false, isBlacklisted: true })
    );
    expect(onlyIn(blacklisted, "item-4")).toBe(true);
    expect(tile("item-4")!.querySelector(".library-grid-tile-badge")?.textContent).toBe("thumb_down");

    const played = await gridChangesBy(() =>
      page.stream().emit("playbackRecorded", 4, { itemId: "item-5", playCount: 4, lastPlayedUtc: "2026-10-07T00:00:00Z" })
    );
    const tagged = await gridChangesBy(() =>
      page.stream().emit("itemTagsChanged", 5, { resolvedItemIds: ["item-6"], addedTags: ["Beach"], removedTags: [] })
    );
    const rated = await gridChangesBy(() =>
      page.stream().emit("itemRatingChanged", 6, { itemId: "item-7", path: "C:\\media\\clip 7.mp4", rating: 4, previousRating: null, clientId: "another-client" })
    );
    expect(played).toHaveLength(0);
    expect(tagged).toHaveLength(0);
    expect(rated).toHaveLength(0);

    expect(library.queries()).toHaveLength(queries);
    const after = Array.from(overlay().querySelectorAll<HTMLElement>(".library-grid-tile"));
    expect(after).toHaveLength(tiles.length);
    after.forEach((element, index) => expect(element).toBe(tiles[index]));
  });
});

describe("playing a tile", () => {
  it("a tile whose file the server can't read says it couldn't load, for a video and a photo", async () => {
    useOverlayWidth();
    const { server } = await mountLibrary([libraryItem(1), libraryItem(2, { mediaType: 1 })], (fake) => {
      fake.fallback((call) =>
        call.method === "POST" && call.path.startsWith("/api/play/")
          ? json({ error: "Media can't be read: C:\\media\\clip.mp4", code: "play_media_unreadable" }, 503)
          : null
      );
    });
    await openLibrary();

    for (const [itemId, kind] of [
      ["item-1", "video"],
      ["item-2", "photo"]
    ]) {
      await click(tile(itemId)!);
      expect(openNotices()).toEqual([`This ${kind} couldn't load. The server may be waiting on a slow or disconnected drive or share.`]);
      expect(isOpen()).toBe(true);
      await closeNotices();
    }
    await waitFor(() =>
      expect(server.logLines()).toContain("playback=library-play-failed attempt=0 hasCurrent=false statusCode=503 code=play_media_unreadable")
    );
    // The server's text names the file, so the log keeps one line for the refusal.
    expect(server.logLines().some((line) => line.includes("clip.mp4"))).toBe(false);
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
      [json({ error: "Disk C:\\media is offline" }, 500), "Playback failed: Disk C:\\media is offline"],
      [json({}, 500), "Playback failed."],
      [json({ itemId: "item-1" }), "Playback failed."],
      [
        new Response("<html>Bad gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
        "Playback failed: The server sent an unexpected response."
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
        statusLogLine("Playback failed (HTTP 404).", null, 0),
        statusLogLine("Playback failed (HTTP 500).", null, 0),
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

function randomLine(): HTMLButtonElement {
  return document.getElementById("library-random-line") as HTMLButtonElement;
}

/** A Filters or Random line's text, its label included, before the chevron at its end. */
function lineText(line: HTMLButtonElement): string {
  return line.querySelector(".library-line-text")?.textContent ?? "";
}

function collapseButton(): HTMLButtonElement {
  return document.getElementById("library-controls-toggle") as HTMLButtonElement;
}

/** The gap the grid set between its tiles, across a row and between rows. */
function tileGapShown(): number {
  return Number.parseFloat(overlay().querySelector<HTMLElement>(".library-grid-rows")!.style.getPropertyValue("--library-grid-gap"));
}

/** The tiles' row heights and widths as the grid laid them out, gaps included. */
function rowLayout(): Array<{ height: number; width: number }> {
  const gap = tileGapShown();
  return Array.from(overlay().querySelectorAll<HTMLElement>(".library-grid-row")).map((row) => {
    const tiles = Array.from(row.querySelectorAll<HTMLElement>(".library-grid-tile"));
    const width = tiles.reduce((sum, tile) => sum + Number.parseFloat(tile.style.width), 0) + gap * (tiles.length - 1);
    return { height: Number.parseFloat(row.style.height), width };
  });
}

/**
 * The width the grid lays its rows out to: the scroller's, less the right padding that keeps the tiles clear of a
 * scrollbar in the tab's margin. happy-dom lays nothing out, so a stubbed width doesn't grow as the scroller reaches into
 * the margin, as a browser's does.
 */
function rowsWidth(scrollerWidth: number): number {
  return scrollerWidth - Number.parseFloat(gridScroll().style.paddingRight || "0");
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
  it("sit above the grid in order: preset and search, then sort with its direction, under the Filters and Random lines, with no randomization dropdown", async () => {
    await mountLibrary(libraryItems(3));
    expect(document.querySelector("header")!.querySelectorAll("select")).toHaveLength(0);
    await openLibrary();

    const named = Array.from(controls().querySelectorAll("select, button, input")).map((control) => control.getAttribute("aria-label"));
    expect(named).toEqual(["Choose preset", "Search library", "Sort library", "Toggle sort direction"]);
    expect(overlay().querySelectorAll("select")).toHaveLength(2);
    const parts = Array.from(overlay().children).map((child) => child.id || child.className);
    expect(parts).toEqual(["library-overlay-header", "library-filter-summary", "library-random-line", "library-controls", "library-overlay-body"]);
    expect(controlsShown()).toBe(true);
  });

  it("keep the collapse button at the header's right end while the count line is hidden", async () => {
    useStylesheet();
    const { library } = await mountLibrary(libraryItems(2));
    await openLibrary();
    library.failures.push(503);
    fireEvent.change(sortSelect(), { target: { value: "PlayCount" } });
    await flush();

    // happy-dom lays nothing out, so the button's own margin stands in for its place: it takes the room the hidden
    // count line leaves, rather than sitting beside the title.
    expect(summary().hidden).toBe(true);
    expect(currentStyle(collapseButton()).marginLeft).toBe("auto");
  });

  it("put the preset and search in one row from a panel about 546 px wide, and stack them narrower", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();
    const field = presetSelect().parentElement!;
    const pair = field.parentElement!;
    expect(field.classList.contains("library-preset-field")).toBe(true);
    expect(pair.classList.contains("library-controls-pair")).toBe(true);
    expect(Array.from(pair.children)).toEqual([field, searchBox()]);

    // happy-dom doesn't apply container queries (measured), so the rule's text stands in for the layout.
    const stylesheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../styles.css"), "utf8");
    expect(stylesheet).toMatch(/\.library-controls \{\s*container: library-controls \/ inline-size;/);
    expect(stylesheet).toMatch(
      /@container library-controls \(min-width: 520px\) \{\s*\.library-controls-pair \{\s*flex-direction: row;\s*\}\s*\.library-controls-pair > \* \{\s*flex: 1 1 0;\s*min-width: 0;\s*\}\s*\}/
    );
    expect(stylesheet).toMatch(/\.library-controls-pair \{\s*display: flex;\s*flex-direction: column;/);
  });

  it("collapse and expand together with the Filters line and the Random line, say which, and stay collapsed after a page refresh", async () => {
    useStylesheet();
    const { page } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    await pickPreset("preset-favorites");
    expect(currentStyle(filtersLine()).display).toBe("flex");
    expect(currentStyle(randomLine()).display).toBe("flex");
    expect(collapseButton().title).toBe("Hide controls & filters");
    expect(collapseButton().getAttribute("aria-label")).toBe("Hide library controls and filters");
    expect(collapseButton().textContent).toBe("unfold_less");

    await click(collapseButton());
    expect(currentStyle(controls()).display).toBe("none");
    expect(currentStyle(filtersLine()).display).toBe("none");
    expect(currentStyle(randomLine()).display).toBe("none");
    expect(collapseButton().title).toBe("Show controls & filters");
    expect(collapseButton().getAttribute("aria-label")).toBe("Show library controls and filters");
    expect(collapseButton().textContent).toBe("unfold_more");

    await refresh(page, libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    expect(currentStyle(controls()).display).toBe("none");
    expect(currentStyle(filtersLine()).display).toBe("none");
    expect(currentStyle(randomLine()).display).toBe("none");

    await click(collapseButton());
    expect(currentStyle(controls()).display).not.toBe("none");
    expect(currentStyle(filtersLine()).display).toBe("flex");
    expect(currentStyle(randomLine()).display).toBe("flex");
    expect(collapseButton().title).toBe("Hide controls & filters");
  });

  it("show a bold Preset: label in the preset dropdown's left padding, before the name the dropdown draws", async () => {
    useStylesheet();
    // happy-dom lays nothing out, so the label's width the field makes room for is stubbed.
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, 0, this.classList.contains("library-preset-label") ? 52 : 0, 0);
    });
    try {
      await mountLibrary(libraryItems(3), (server) => {
        server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
      });
      await openLibrary();
    } finally {
      measure.mockRestore();
    }
    const field = presetSelect().parentElement!;
    const label = field.querySelector<HTMLElement>(".library-preset-label")!;
    expect(Array.from(field.children)).toEqual([presetSelect(), label]);
    expect(label.textContent).toBe("Preset:");
    expect(field.style.getPropertyValue("--preset-label-width")).toBe("52px");
    const style = currentStyle(label);
    expect([style.position, style.left, style.fontWeight, style.pointerEvents]).toEqual(["absolute", "11px", "600", "none"]);
    expect(style.color).toBe(currentStyle(document.documentElement).getPropertyValue("--control-fg").trim());
    expect(style.opacity).not.toBe("0.5");
    // The dropdown draws the chosen name after the label, in its padding, and its options keep their plain names.
    expect(stylesheetText()).toMatch(/\.library-preset-field > \.ctl \{[^}]*padding-left: calc\(14px \+ var\(--preset-label-width, 3\.75em\)\);/);
    expect(Array.from(presetSelect().options).map((option) => option.textContent)).toEqual(["None", "Favorites"]);
  });

  it("show a message in the preset dropdown after its Preset: label, which dims with the disabled dropdown", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => status(500));
    });
    await openLibrary();
    expect([presetSelect().disabled, selectedPresetLabel()]).toEqual([true, "Error loading presets"]);
    expect(currentStyle(presetSelect().parentElement!.querySelector(".library-preset-label")!).opacity).toBe("0.5");
  });

  it("give the preset dropdown, search, Sort, its direction, and the Filters and Random lines one height, with the controls' text at 16 px", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    await pickPreset("preset-favorites");
    const fields = [presetSelect(), searchBox(), sortSelect(), directionButton()];
    expect([...fields, filtersLine(), randomLine()].map((element) => currentStyle(element).height)).toEqual(Array(6).fill("32px"));
    expect(fields.map((element) => currentStyle(element).fontSize)).toEqual(Array(4).fill("16px"));
  });

  it("take the other tabs' field and button styles, as the mockup does", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3));
    await openLibrary();
    expect([presetSelect(), searchBox(), sortSelect()].map((field) => field.classList.contains("ctl"))).toEqual([true, true, true]);
    expect(directionButton().classList.contains("btn")).toBe(true);
    expect([currentStyle(searchBox()).paddingLeft, currentStyle(sortSelect()).paddingLeft]).toEqual(["10px", "10px"]);
    expect(currentStyle(summary()).color).toBe(currentStyle(document.documentElement).getPropertyValue("--muted-fg").trim());
    const iconButtons = [collapseButton()];
    expect(iconButtons.map((button) => button.className)).toEqual(["icon-btn"]);
  });

  it("end the Filters and Random lines with a chevron after their text, which is cut off with an ellipsis, and tint them on hover only where the device can hover", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    await pickPreset("preset-favorites");
    for (const line of [filtersLine(), randomLine()]) {
      const [text, chevron] = Array.from(line.children) as HTMLElement[];
      expect(line.children).toHaveLength(2);
      expect(text!.className).toBe("library-line-text");
      expect([chevron!.className, chevron!.textContent]).toEqual(["material-symbol-icon library-line-chevron", "chevron_right"]);
      const textStyle = currentStyle(text!);
      expect([textStyle.overflow, textStyle.textOverflow, textStyle.whiteSpace]).toEqual(["hidden", "ellipsis", "nowrap"]);
      expect(currentStyle(chevron!).fontSize).toBe("18px");
    }
    const css = stylesheetText();
    const hover = mediaBlocks(css, "(hover: hover)").join("\n").replace(/\s+/g, " ");
    expect(hover).toContain(".library-line:hover { background: rgba(127, 127, 127, 0.1); }");
    expect(outsideMedia(css, "(hover: hover)")).not.toMatch(/library-line[\w-]*:hover/);
    expect(outsideMedia(css, "(hover: hover)")).not.toMatch(/\.library-overlay button:hover/);
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
    expect(lineText(filtersLine())).toBe("Filters: Favorites only · Only never played · Photos only · Min 01:30 · 2 tags · 1 tag excluded");

    await pickPreset("preset-blacklisted");
    expect(lineText(filtersLine())).toBe("Filters: Blacklisted only");

    // Blacklisted excluded is the default, which the line doesn't name.
    await pickPreset("");
    expect(filtersLine().hidden).toBe(true);
  });

  it("names Only unrated and the minimum rating in stars after the other Basic Filters options", async () => {
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () =>
        json([
          UNRATED_PRESET,
          { id: "preset-good", name: "Good", filterState: { onlyBrowserPlayable: true, minRating: 3.5, mediaTypeFilter: 1 } },
          { id: "preset-any", name: "Any", filterState: { minRating: 1 } }
        ])
      );
    });
    await openLibrary();

    await pickPreset("preset-unrated");
    expect(lineText(filtersLine())).toBe("Filters: Only unrated");
    await pickPreset("preset-good");
    expect(lineText(filtersLine())).toBe("Filters: Only files this browser can play · Min 3.5 stars · Videos only");
    await pickPreset("preset-any");
    expect(lineText(filtersLine())).toBe("Filters: Min 1 star");
  });

  it("names the Added and Created ranges by their choice, after the durations and before the tags", async () => {
    const range = { from: "2026-01-03", to: "2026-03-31" };
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () =>
        json([
          { id: "preset-recent", name: "Recent", filterState: { addedRange: "last30Days" } },
          { id: "preset-year", name: "Year", filterState: { maxDuration: "00:10:00", createdRange: "thisYear", addedRange: "last7Days", selectedTags: ["Beach"] } },
          { id: "preset-custom", name: "Custom", filterState: { addedRange: range, createdRange: "last90Days" } }
        ])
      );
    });
    await openLibrary();

    await pickPreset("preset-recent");
    expect(lineText(filtersLine())).toBe("Filters: Added in last 30 days");
    await pickPreset("preset-year");
    expect(lineText(filtersLine())).toBe("Filters: Max 10:00 · Added in last 7 days · Created this year · 1 tag");
    await pickPreset("preset-custom");
    // In the device's own date format, which Intl gives.
    const shown = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).formatRange(new Date(2026, 0, 3), new Date(2026, 2, 31));
    expect(lineText(filtersLine())).toBe(`Filters: Added ${shown} · Created in last 90 days`);
  });

  it("counts the chosen sources out of all the sources, loading them for a source filter", async () => {
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("GET", "/api/presets", () => json([ONE_SOURCE_PRESET]));
      fake.on("GET", "/api/sources", () => json(SOURCES));
    });
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    await openLibrary();

    await pickPreset("preset-one-source");
    await waitFor(() => expect(lineText(filtersLine())).toBe("Filters: 1 of 3 sources"));
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

describe("Random line", () => {
  /** A tag catalog with People and Places, each with a tag, and Moods, without one. */
  const CATALOG = {
    categories: [
      { id: "places", name: "Places", sortOrder: 1 },
      { id: "people", name: "People", sortOrder: 0 },
      { id: "moods", name: "Moods", sortOrder: 2 }
    ],
    tags: [
      { name: "Alice", categoryId: "people" },
      { name: "Beach", categoryId: "places" }
    ],
    items: []
  };

  it("always shows, naming the options after a bold Random:, Shuffle and Spread by folder until they change", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();
    expect(filtersLine().hidden).toBe(true);
    expect(randomLine().hidden).toBe(false);
    expect(randomLine().querySelector("b")!.textContent).toBe("Random: ");
    expect(lineText(randomLine())).toBe("Random: Shuffle · Spread by folder");
    expect(randomLine().title).toBe("Open the Randomization tab");
  });

  it("opens the Randomization tab when tapped or clicked", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();

    await click(randomLine());
    expect(isOpen()).toBe(false);
    expect((document.getElementById("panel-page-randomization") as HTMLElement).hidden).toBe(false);
    expect(panelTab("Randomization").getAttribute("aria-selected")).toBe("true");
  });

  it("names the categories By category counts, in the tag catalog's order, loading the catalog once the server is ready", async () => {
    localStorage.setItem(
      "rr_device.randomization.options",
      JSON.stringify({ shuffle: false, spreadByFolder: true, spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["places", "moods", "people"], favorLessPlayed: true, favorHigherRated: true })
    );
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("POST", "/api/tag-editor/model", () => json(CATALOG));
    });
    await openLibrary();
    await waitFor(() => expect(lineText(randomLine())).toBe("Random: Spread by folder, People, and Places · Favor less played and higher rated"));
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1);
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
        expect(row.width).toBeCloseTo(rowsWidth(width), 5);
      }
      expect(rows.some((row) => Math.abs(row.height - 160) > 1)).toBe(true);
    });
  }
});

describe("tile icons and tooltip", () => {
  it("round every tile's corners, and give the grid no border, corners, or background of its own", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3));
    await openLibrary();
    expect(currentStyle(tile("item-1")!).borderRadius).toBe("4px");
    const body = currentStyle(document.getElementById("library-overlay-body")!);
    expect([body.borderTopWidth, body.borderRadius, body.backgroundColor, body.overflow]).toEqual(["", "", "", ""]);
  });

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

/** A tile's check icon, found by its tooltip. */
function check(itemId: string): HTMLElement {
  return within(tile(itemId)!).getByTitle(/^(Select|Deselect)$/);
}

/** The selection bar, or null while not selecting. */
function selectionBar(): HTMLElement | null {
  return document.getElementById("library-selection-bar");
}

function barButton(name: "Select all" | "Clear selection" | "Selection actions"): HTMLButtonElement {
  return within(selectionBar()!).getByRole("button", { name, hidden: true }) as HTMLButtonElement;
}

/** The bar's parts in order, leaving out the menu's items: each button's name, or the count's text. */
function barParts(): string[] {
  return Array.from(selectionBar()!.querySelectorAll("button, .library-selection-count"))
    .filter((part) => !part.closest(".menu"))
    .map((part) => (part instanceof HTMLButtonElement ? part.getAttribute("aria-label") ?? "" : part.textContent ?? ""));
}

function selectionMenu(): HTMLElement {
  return document.getElementById("library-selection-menu") as HTMLElement;
}

/** The ids of the tiles shown selected, in grid order. */
function selectedTiles(): string[] {
  return Array.from(overlay().querySelectorAll<HTMLElement>(".library-grid-tile.is-selected")).map((tile) => tile.dataset.itemId!);
}

function selecting(): boolean {
  return overlay().classList.contains("is-selecting") && selectionBar() !== null;
}

async function pressEscape(): Promise<void> {
  fireEvent.keyDown(document.body, { key: "Escape" });
  await flush();
}

/** A finger resting on `element` for as long as `ms`, then lifting, with the click a browser sends after it. */
async function fingerPress(element: Element, ms: number): Promise<void> {
  fireEvent.pointerDown(element, { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
  await vi.advanceTimersByTimeAsync(ms);
  fireEvent.pointerUp(element, { pointerType: "touch", pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  await click(element);
}

/** The text inside each `@media {query} { ... }` block of `css`. */
function mediaBlocks(css: string, query: string): string[] {
  const blocks: string[] = [];
  const opening = `@media ${query} {`;
  for (let start = css.indexOf(opening); start >= 0; start = css.indexOf(opening, start + 1)) {
    let depth = 1;
    let index = start + opening.length;
    while (depth > 0) {
      const char = css[index++];
      if (char === "{") depth++;
      if (char === "}") depth--;
    }
    blocks.push(css.slice(start + opening.length, index - 1));
  }
  return blocks;
}

/** `css` with its comments and the `@media {query}` blocks taken out. */
function outsideMedia(css: string, query: string): string {
  let rest = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of mediaBlocks(rest, query)) {
    rest = rest.replace(block, "");
  }
  return rest;
}

describe("selection", () => {
  it("the check icon selects a tile and starts selection, showing every tile's icon and the bar", async () => {
    useStylesheet();
    const { server } = await mountLibrary(libraryItems(3));
    await openLibrary();
    expect(within(overlay()).queryByRole("button", { name: /^Select/, hidden: true })).toBeNull();
    expect(selectionBar()).toBeNull();
    expect(["item-1", "item-2", "item-3"].map((id) => currentStyle(check(id)).display)).toEqual(["none", "none", "none"]);
    expect(check("item-2").title).toBe("Select");

    await click(check("item-2").firstElementChild!);

    expect(server.calls.filter((call) => call.path.startsWith("/api/play/"))).toEqual([]);
    expect(selecting()).toBe(true);
    expect(selectedTiles()).toEqual(["item-2"]);
    expect(check("item-2").title).toBe("Deselect");
    expect(["item-1", "item-2", "item-3"].map((id) => currentStyle(check(id)).display)).toEqual(["flex", "flex", "flex"]);
    expect([currentStyle(check("item-1")).opacity, currentStyle(check("item-2")).opacity]).toEqual(["0.6", "1"]);
    expect(currentStyle(check("item-2")).color).toBe(currentStyle(document.documentElement).getPropertyValue("--huggins-orange").trim());
    expect(currentStyle(check("item-1")).color).toBe("#fff");
    const media = (id: string) => currentStyle(tile(id)!.querySelector(".library-grid-tile-media")!);
    expect([media("item-1").getPropertyValue("inset"), media("item-2").getPropertyValue("inset")]).toEqual(["0", "8px"]);
    expect(currentStyle(check("item-2").firstElementChild!).fontVariationSettings).toBe('"FILL" 1, "wght" 700, "GRAD" 0, "opsz" 20');

    expect(barParts()).toEqual(["Select all", "Clear selection", "1 / 3 selected", "Selection actions"]);
    const barButtons = Array.from(selectionBar()!.querySelectorAll("button")).filter((button) => !button.closest(".menu"));
    expect(barButtons.map((button) => [button.title, button.textContent])).toEqual([
      ["Select all", "select_all"],
      ["Clear selection", "deselect"],
      ["Selection actions", "more_vert"]
    ]);
  });

  it("shows a selected tile grey around its thumbnail, inset 8 px with 4 px corners, with its check mark black, or white in the light theme", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3));
    await openLibrary();
    await click(check("item-2"));

    const media = (id: string) => currentStyle(tile(id)!.querySelector(".library-grid-tile-media")!);
    // happy-dom keeps the inset as the stylesheet writes it, one length for every side.
    expect([media("item-1").getPropertyValue("inset"), media("item-2").getPropertyValue("inset")]).toEqual(["0", "8px"]);
    expect([media("item-1").borderRadius, media("item-2").borderRadius]).toEqual(["", "4px"]);
    // The thumbnail covers the inset as it covers the tile.
    expect(stylesheetText()).toMatch(/\.library-grid-tile-image \{[^}]*object-fit: cover;/);
    const shadow = "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.5))";
    // Selected, the shadow is around the whole mark, its disc included, and not on the icon, whose check mark it would grey.
    expect([currentStyle(check("item-2")).filter, currentStyle(check("item-2").firstElementChild!).filter]).toEqual([shadow, "none"]);
    expect([currentStyle(check("item-1")).filter, currentStyle(check("item-1").firstElementChild!).filter]).toEqual(["", shadow]);

    const looks = () => ({
      tiles: [currentStyle(tile("item-1")!).backgroundColor, currentStyle(tile("item-2")!).backgroundColor],
      disc: currentStyle(check("item-2")).backgroundImage
    });
    expect(looks()).toEqual({ tiles: ["", "#333333"], disc: "radial-gradient(circle closest-side, #000000 0 76%, transparent 80%)" });
    document.documentElement.classList.add("theme-light");
    try {
      expect(looks()).toEqual({ tiles: ["", "#e0e3e8"], disc: "radial-gradient(circle closest-side, #ffffff 0 76%, transparent 80%)" });
    } finally {
      document.documentElement.classList.remove("theme-light");
    }
  });

  it("shows the check icon and dims only the thumbnail on hover only where the device can hover", () => {
    const css = stylesheetText();
    const hover = mediaBlocks(css, "(hover: hover)").join("\n").replace(/\s+/g, " ");
    expect(hover).toContain(".library-grid-tile:hover .library-grid-tile-check { display: flex; }");
    expect(hover).toContain(".library-grid-tile-check:hover { opacity: 1; }");
    expect(hover).toContain(".library-grid-tile:hover .library-grid-tile-media { opacity: 0.79; }");
    expect(outsideMedia(css, "(hover: hover)")).not.toMatch(/library-grid-tile[\w-]*:hover/);
  });

  it("keeps a thumbnail from being dragged, so a long press selects its tile rather than lifting the picture", () => {
    const rule = /\.library-grid-tile-image \{([^}]*)\}/.exec(stylesheetText())?.[1] ?? "";
    expect(rule).toContain("-webkit-user-drag: none;");
  });

  it("once selecting, a click or a Ctrl or Cmd+click adds or removes a tile, and Shift+click adds a range, highlighting no text", async () => {
    useStylesheet();
    const { server } = await mountLibrary(libraryItems(6));
    await openLibrary();
    expect(currentStyle(gridScroll()).userSelect).toBe("none");

    await click(check("item-2"));
    await click(tile("item-3")!);
    fireEvent.click(tile("item-4")!, { ctrlKey: true });
    fireEvent.click(tile("item-3")!, { metaKey: true });
    await flush();
    expect(selectedTiles()).toEqual(["item-2", "item-4"]);

    fireEvent.click(tile("item-6")!, { shiftKey: true });
    await flush();
    expect(selectedTiles()).toEqual(["item-2", "item-3", "item-4", "item-5", "item-6"]);
    expect(barParts()[2]).toBe("5 / 6 selected");
    expect(server.calls.filter((call) => call.path.startsWith("/api/play/"))).toEqual([]);
  });

  it("a Shift, Ctrl, or Cmd+click starts selection with its tile, a plain click plays, and deselecting the last tile ends it", async () => {
    useOverlayWidth();
    const { server } = await mountLibrary(libraryItems(3), (fake) => fake.playsItems(playResponse(3)));
    await openLibrary();

    for (const held of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      fireEvent.click(tile("item-1")!, held);
      await flush();
      expect([selecting(), selectedTiles(), isOpen()]).toEqual([true, ["item-1"], true]);
      await click(tile("item-1")!);
      expect([selecting(), selectedTiles()]).toEqual([false, []]);
    }
    expect(server.calls.filter((call) => call.path.startsWith("/api/play/"))).toEqual([]);

    await click(tile("item-3")!);
    await waitFor(() => expect(server.requests("POST", "/api/play/item-3")).toHaveLength(1));
  });

  it("Clear selection ends selection", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();
    await click(check("item-1"));
    await click(tile("item-2")!);

    await click(barButton("Clear selection"));
    expect([selecting(), selectedTiles()]).toEqual([false, []]);
  });

  it("Select all selects every item the search and filters match, loaded or not, and is then disabled", async () => {
    const items = libraryItems(1234);
    const { server } = await mountLibrary(items, (fake) => {
      fake.on("POST", "/api/library/query-ids", () => json({ ids: items.map((item) => item.id) }));
    });
    await openLibrary();
    expect(tile("item-1000")).toBeNull();
    await click(check("item-1"));
    expect([barButton("Select all").disabled, barButton("Select all").title]).toEqual([false, "Select all"]);

    await click(barButton("Select all"));

    expect(server.requests("POST", "/api/library/query-ids")).toHaveLength(1);
    expect(barParts()[2]).toBe(`${(1234).toLocaleString()} / ${(1234).toLocaleString()} selected`);
    expect(selectedTiles()).toEqual(Array.from(overlay().querySelectorAll<HTMLElement>(".library-grid-tile")).map((tile) => tile.dataset.itemId!));
    expect([barButton("Select all").disabled, barButton("Select all").title]).toEqual([true, "Everything is already selected"]);

    await click(tile("item-2")!);
    expect(barParts()[2]).toBe(`${(1233).toLocaleString()} / ${(1234).toLocaleString()} selected`);
    expect(barButton("Select all").disabled).toBe(false);
  });

  it("a search, filter, or preset change ends selection, and a sort change keeps it", async () => {
    const { library } = await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
    });
    await openLibrary();
    await click(check("item-1"));

    fireEvent.change(sortSelect(), { target: { value: "LastPlayed" } });
    await click(directionButton());
    expect([selecting(), selectedTiles()]).toEqual([true, ["item-1"]]);

    fireEvent.input(searchBox(), { target: { value: "clip" } });
    await waitFor(() => expect(library.queries().at(-1)).toMatchObject({ search: "clip" }));
    expect(selecting()).toBe(false);

    await click(check("item-1"));
    await pickPreset("preset-favorites");
    expect(selecting()).toBe(false);
  });

  it("removed items leave the selection, which ends when none are left", async () => {
    const { page, library } = await mountLibrary(libraryItems(3));
    await openLibrary();
    await click(check("item-1"));
    await click(tile("item-2")!);

    library.items = [library.items[1]!, library.items[2]!];
    page.stream().emit("itemsRemoved", 2, { itemIds: ["item-1"] });
    await flush();
    expect([barParts()[2], selectedTiles()]).toEqual(["1 / 2 selected", ["item-2"]]);

    library.items = [library.items[1]!];
    page.stream().emit("itemsRemoved", 3, { itemIds: ["item-2"] });
    await flush();
    expect(selecting()).toBe(false);
  });

  it("lasts while the panel shows another tab or is closed", async () => {
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/sources", () => json([]));
      server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    });
    await openLibrary();
    await click(check("item-1"));

    await click(panelTab("Filter"));
    await openLibrary();
    expect([selecting(), selectedTiles()]).toEqual([true, ["item-1"]]);
    await closeLibrary();
    await openLibrary();
    expect([selecting(), selectedTiles()]).toEqual([true, ["item-1"]]);
  });

  it("a long press with a finger selects its tile without playing it, then a tap adds a tile and a long press takes one out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { server } = await mountLibrary(libraryItems(3));
    await openLibrary();

    fireEvent.pointerDown(tile("item-1")!, { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    expect(fireEvent.contextMenu(tile("item-1")!)).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect([selecting(), selectedTiles()]).toEqual([true, ["item-1"]]);
    fireEvent.pointerUp(tile("item-1")!, { pointerType: "touch", pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    await click(tile("item-1")!);
    expect(selectedTiles()).toEqual(["item-1"]);

    await fingerPress(tile("item-2")!, 100);
    expect(selectedTiles()).toEqual(["item-1", "item-2"]);
    await fingerPress(tile("item-1")!, 500);
    expect(selectedTiles()).toEqual(["item-2"]);
    expect(server.calls.filter((call) => call.path.startsWith("/api/play/"))).toEqual([]);
  });

  it("Selection actions opens its menu above the bar, which a press outside it or a second press closes", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();
    await click(check("item-1"));
    expect(selectionMenu().hidden).toBe(true);

    await click(barButton("Selection actions"));
    expect(selectionMenu().hidden).toBe(false);
    fireEvent.pointerDown(barButton("Selection actions"));
    await click(barButton("Selection actions"));
    expect(selectionMenu().hidden).toBe(true);

    await click(barButton("Selection actions"));
    fireEvent.pointerDown(tile("item-2")!);
    await flush();
    expect(selectionMenu().hidden).toBe(true);
  });
});

describe("selection and Escape", () => {
  it("closes the Selection actions menu, then ends selection, then closes the panel", async () => {
    await mountLibrary(libraryItems(3));
    await openLibrary();
    await click(check("item-1"));
    await click(barButton("Selection actions"));

    await pressEscape();
    expect([selectionMenu().hidden, selecting(), isOpen()]).toEqual([true, true, true]);
    await pressEscape();
    expect([selecting(), isOpen()]).toEqual([false, true]);
    await pressEscape();
    expect(isOpen()).toBe(false);
  });

  it("leaves a selection the Library tab doesn't show, which shows again with the tab", async () => {
    await mountLibrary(libraryItems(3), (server) => {
      server.on("GET", "/api/sources", () => json([]));
      server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    });
    await openLibrary();
    await click(check("item-1"));
    await click(panelTab("Filter"));

    await pressEscape();
    expect(panel().hidden).toBe(true);
    await pressEscape();
    await openLibrary();
    expect([selecting(), selectedTiles()]).toEqual([true, ["item-1"]]);
  });

  it("goes to an open dialog first, leaving the selection", async () => {
    await mountLibrary(libraryItems(3), (server) => {
      server.on("POST", "/api/library/query-ids", () => json({ error: "The library is busy." }, 503));
    });
    await openLibrary();
    await click(check("item-1"));
    await click(barButton("Select all"));
    expect(openNotices()).toEqual(["Select all failed: The library is busy."]);

    await pressEscape();
    expect(selecting()).toBe(true);
    await closeNotices();
    await pressEscape();
    expect([selecting(), isOpen()]).toEqual([false, true]);
  });
});

/** How many items match in the bulk actions' tests, of which the first page loads 200. */
const MATCHING = 1234;

/** A count as the device groups it, such as "1,234". */
function grouped(count: number): string {
  return count.toLocaleString();
}

/**
 * Mounts a library of `MATCHING` items, shows it, and selects every one with Select all, most of them not loaded. The
 * server answers each bulk route with a count that differs from the selection's, `ANSWERED`.
 */
async function selectAllItems(
  setup: (server: FakeServer) => void = () => {},
  items: LibraryRow[] = libraryItems(MATCHING)
): Promise<LibraryPage & { ids: string[] }> {
  const ids = items.map((item) => item.id);
  const mounted = await mountLibrary(items, (server) => {
    server.on("POST", "/api/library/query-ids", () => json({ ids }));
    server.on("POST", "/api/bulk/item-state", () => json({ count: ANSWERED }));
    server.on("POST", "/api/bulk/rating", () => json({ count: ANSWERED }));
    server.on("POST", "/api/playback/clear-stats", () => json({ count: ANSWERED }));
    setup(server);
  });
  await openLibrary();
  expect(tile(`item-${MATCHING}`)).toBeNull();
  await click(check("item-1"));
  await click(barButton("Select all"));
  expect(barParts()[2]).toBe(`${grouped(MATCHING)} / ${grouped(MATCHING)} selected`);
  return { ...mounted, ids };
}

/** The count the fake server answers the bulk routes with. */
const ANSWERED = 1200;

/** The Selection actions menu's items and rules in order: each item's label, or "—" for a rule. */
function menuParts(): string[] {
  return Array.from(selectionMenu().children).map((part) => (part.tagName === "HR" ? "—" : part.textContent ?? ""));
}

function menuItems(): HTMLButtonElement[] {
  return Array.from(selectionMenu().querySelectorAll("button"));
}

function menuItem(label: string): HTMLButtonElement {
  const found = menuItems().find((button) => button.textContent === label);
  if (!found) {
    throw new Error(`The menu has no ${label}.`);
  }
  return found;
}

/** Opens Selection actions and picks `label`. */
async function pickAction(label: string): Promise<void> {
  await click(barButton("Selection actions"));
  await click(menuItem(label));
}

/** The in-app dialogs open now, oldest first. */
function shownDialogs(): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog"));
}

/** The open dialog whose heading or message reads `text`, or null. */
function findDialog(text: string): HTMLDialogElement | null {
  return shownDialogs().find((dialog) => dialog.querySelector("h3, .dialog-message")?.textContent === text) ?? null;
}

function dialogWith(text: string): HTMLDialogElement {
  const found = findDialog(text);
  if (!found) {
    throw new Error(`No dialog reads "${text}".`);
  }
  return found;
}

function buttonIn(dialog: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent?.trim() === label);
  if (!found) {
    throw new Error(`No ${label} button in the dialog.`);
  }
  return found;
}

/** The popups of other devices' changes showing. */
function otherDevicePopups(): string[] {
  return popupsShown().filter((text) => text.includes("another device"));
}

const CONTROL_TOKEN = "control-secret";
const WRONG_TOKEN_REASON = "The control token is wrong.";

/**
 * Answers the control routes as the server answers another machine: `GET /control/access` with 401 until the control
 * token is paired, and `POST /control/pair` with 401 and its reason for a wrong token.
 */
function serveControlFromAnotherMachine(server: FakeServer): void {
  let session = false;
  server.on("GET", "/control/access", () => (session ? status(204) : json({ error: "Unauthorized" }, 401)));
  server.on("POST", "/control/pair", (call) => {
    if (call.body?.token !== CONTROL_TOKEN) {
      return json({ error: WRONG_TOKEN_REASON }, 401);
    }
    session = true;
    return json({ paired: true, message: "Control paired." });
  });
}

function tokenPrompt(): HTMLDialogElement | null {
  return findDialog("Control token");
}

function tokenField(): HTMLInputElement {
  return document.getElementById("control-token-input") as HTMLInputElement;
}

function continueButton(): HTMLButtonElement {
  return document.getElementById("control-token-continue") as HTMLButtonElement;
}

async function typeToken(text: string): Promise<void> {
  fireEvent.input(tokenField(), { target: { value: text } });
  await flush();
}

describe("bulk actions", () => {
  it("Selection actions lists its actions in three groups with a rule between them, Delete files… in red, in the menu's look", async () => {
    useStylesheet();
    await mountLibrary(libraryItems(3));
    await openLibrary();
    await click(check("item-1"));
    await click(barButton("Selection actions"));

    expect(menuParts()).toEqual([
      "Add to favorites",
      "Remove from favorites",
      "Add to blacklist",
      "Remove from blacklist",
      "—",
      "Rate…",
      "Clear playback stats…",
      "—",
      "Delete files…"
    ]);
    const error = currentStyle(document.documentElement).getPropertyValue("--error").trim();
    expect(currentStyle(menuItem("Delete files…")).color).toBe(error);
    expect(currentStyle(menuItem("Add to favorites")).color).not.toBe(error);
    expect([currentStyle(menuItem("Rate…")).minHeight, currentStyle(menuItem("Rate…")).textAlign]).toEqual(["40px", "left"]);
    expect(menuItems().every((button) => !button.disabled)).toBe(true);
  });

  it("picking an action closes the menu before the action asks anything", async () => {
    await selectAllItems();
    await pickAction("Clear playback stats…");
    expect(selectionMenu().hidden).toBe(true);
    expect(findDialog(`Clear playback stats for ${grouped(MATCHING)} items?`)).not.toBeNull();
  });

  it("favorites and the blacklist each send one request for every selected item, loaded or not, and say so with the count the server answered", async () => {
    const { server, page, ids } = await selectAllItems();
    const cases = [
      { label: "Add to favorites", flag: "favorite", value: true, popup: `Added ${grouped(ANSWERED)} items to favorites.` },
      { label: "Remove from favorites", flag: "favorite", value: false, popup: `Removed ${grouped(ANSWERED)} items from favorites.` },
      { label: "Add to blacklist", flag: "blacklist", value: true, popup: `Blacklisted ${grouped(ANSWERED)} items.` },
      { label: "Remove from blacklist", flag: "blacklist", value: false, popup: `Removed ${grouped(ANSWERED)} items from the blacklist.` }
    ];
    for (const [index, { label, flag, value, popup }] of cases.entries()) {
      await pickAction(label);
      const requests = server.requests("POST", "/api/bulk/item-state");
      expect(requests).toHaveLength(index + 1);
      expect(requests.at(-1)!.body).toEqual({ itemIds: ids, flag, value, clientId: page.clientId() });
      // Each popup replaces the last.
      await waitFor(() => expect(popupsShown()).toEqual([popup]));
    }
    expect(selecting()).toBe(true);
  });

  it("the tiles take the after-values of this device's own bulk event, which shows no Other devices popup", async () => {
    const items = libraryItems(MATCHING);
    items[0] = { ...items[0]!, isFavorite: true };
    const { page, library } = await selectAllItems(undefined, items);
    const badges = () => Array.from(tile("item-1")!.querySelectorAll(".library-grid-tile-badge-icon")).map((icon) => icon.textContent);
    expect(badges()).toEqual(["favorite"]);
    await pickAction("Add to blacklist");
    // The server's library, which a reload reads, as the change left it.
    library.items[0] = { ...library.items[0]!, isFavorite: false, isBlacklisted: true };
    const event = (clientId: string) => ({
      flag: "blacklist",
      value: true,
      count: ANSWERED,
      // Blacklisting cleared the favorite, which the event says.
      items: [{ itemId: "item-1", isFavorite: false, isBlacklisted: true, previousIsFavorite: true, previousIsBlacklisted: false }],
      clientId
    });
    page.stream().emit("bulkItemStateChanged", 5, event(page.clientId()));
    await flush();

    expect(badges()).toEqual(["thumb_down"]);
    expect(popupsShown()).toEqual([`Blacklisted ${grouped(ANSWERED)} items.`]);
    // Another device's same event pops up, so only the client id keeps this device's own quiet.
    page.stream().emit("bulkItemStateChanged", 6, event("another-client"));
    await flush();
    expect(otherDevicePopups()).toEqual([`Blacklisted ${grouped(ANSWERED)} items on another device`]);
  });

  it("the tiles take Add to favorites clearing a blacklisting from this device's own bulk event", async () => {
    const items = libraryItems(MATCHING);
    items[1] = { ...items[1]!, isBlacklisted: true };
    const { page, library } = await selectAllItems(undefined, items);
    const badges = () => Array.from(tile("item-2")!.querySelectorAll(".library-grid-tile-badge-icon")).map((icon) => icon.textContent);
    expect(badges()).toEqual(["thumb_down"]);
    await pickAction("Add to favorites");
    // The server's library, which a reload reads, as the change left it.
    library.items[1] = { ...library.items[1]!, isFavorite: true, isBlacklisted: false };
    page.stream().emit("bulkItemStateChanged", 5, {
      flag: "favorite",
      value: true,
      count: ANSWERED,
      // Favoriting cleared the blacklisting, which the event says.
      items: [{ itemId: "item-2", isFavorite: true, isBlacklisted: false, previousIsFavorite: false, previousIsBlacklisted: true }],
      clientId: page.clientId()
    });
    await flush();

    expect(badges()).toEqual(["favorite"]);
  });

  it("Rate… chooses a rating with its stars before Rate sets it on every selected item in one request, and Clear rating clears it", async () => {
    useStylesheet();
    stubStarLayout();
    const { server, page, ids } = await selectAllItems();
    await pickAction("Rate…");

    const dialog = dialogWith(`Rate ${grouped(MATCHING)} items`);
    const stars = dialog.querySelector<HTMLElement>(".rating")!;
    // Centered, rather than at the right as in the Stats tab's row.
    expect([currentStyle(stars).marginLeft, currentStyle(stars).marginRight]).toEqual(["auto", "auto"]);
    const words = () => dialog.querySelector(".rate-dialog-words")?.textContent;
    expect(Array.from(dialog.querySelectorAll(".dialog-actions > button")).map((button) => button.textContent)).toEqual(["Clear rating", "Cancel", "Rate"]);
    expect(document.activeElement).toBe(buttonIn(dialog, "Cancel"));
    expect([starsShown(stars), words()]).toEqual([0, "Choose a rating"]);
    expect([buttonIn(dialog, "Rate").disabled, buttonIn(dialog, "Rate").title]).toEqual([true, "Choose a rating first"]);

    await tapStars(stars, xFor(3.5));
    expect([starsShown(stars), words()]).toEqual([3.5, "3.5 stars"]);
    expect([buttonIn(dialog, "Rate").disabled, buttonIn(dialog, "Rate").title]).toEqual([false, ""]);
    expect(server.requests("POST", "/api/bulk/rating")).toEqual([]);

    await click(buttonIn(dialog, "Rate"));
    expect(findDialog(`Rate ${grouped(MATCHING)} items`)).toBeNull();
    expect(server.requests("POST", "/api/bulk/rating").map((call) => call.body)).toEqual([{ itemIds: ids, rating: 3.5, clientId: page.clientId() }]);
    await waitFor(() => expect(popupsShown()).toEqual([`Rated ${grouped(ANSWERED)} items 3.5 stars.`]));
    page.stream().emit("bulkItemRatingChanged", 5, {
      rating: 3.5,
      count: ANSWERED,
      items: [{ itemId: "item-1", rating: 3.5, previousRating: null }],
      clientId: page.clientId()
    });
    await flush();
    expect(otherDevicePopups()).toEqual([]);

    await pickAction("Rate…");
    await click(buttonIn(dialogWith(`Rate ${grouped(MATCHING)} items`), "Clear rating"));
    expect(server.requests("POST", "/api/bulk/rating").map((call) => call.body)).toEqual([
      { itemIds: ids, rating: 3.5, clientId: page.clientId() },
      { itemIds: ids, rating: null, clientId: page.clientId() }
    ]);
    await waitFor(() => expect(popupsShown()).toEqual([`Cleared the rating on ${grouped(ANSWERED)} items.`]));

    await pickAction("Rate…");
    await click(buttonIn(dialogWith(`Rate ${grouped(MATCHING)} items`), "Cancel"));
    expect(shownDialogs()).toEqual([]);
    expect(server.requests("POST", "/api/bulk/rating")).toHaveLength(2);
  });

  it("Clear playback stats… asks first, with Cancel focused and a red Clear, then clears every selected item's stats", async () => {
    const { server, ids } = await selectAllItems();
    await pickAction("Clear playback stats…");
    let confirm = dialogWith(`Clear playback stats for ${grouped(MATCHING)} items?`);
    expect(document.activeElement).toBe(buttonIn(confirm, "Cancel"));
    expect(buttonIn(confirm, "Clear").classList.contains("btn-danger")).toBe(true);
    await click(buttonIn(confirm, "Cancel"));
    expect(server.requests("POST", "/api/playback/clear-stats")).toEqual([]);

    await pickAction("Clear playback stats…");
    confirm = dialogWith(`Clear playback stats for ${grouped(MATCHING)} items?`);
    await click(buttonIn(confirm, "Clear"));
    expect(server.requests("POST", "/api/playback/clear-stats").map((call) => call.body)).toEqual([{ itemIds: ids }]);
    await waitFor(() => expect(popupsShown()).toEqual([`Cleared playback stats for ${grouped(ANSWERED)} items.`]));
  });

  it("names a failed action in plain words with the server's reason", async () => {
    const reason = "The library is busy.";
    await selectAllItems((server) => {
      for (const path of ["/api/bulk/item-state", "/api/bulk/rating", "/api/playback/clear-stats", "/api/library/delete-files"]) {
        server.on("POST", path, () => json({ error: reason }, 503));
      }
      server.on("GET", "/control/access", () => status(204));
    });
    for (const label of ["Add to favorites", "Remove from favorites", "Add to blacklist", "Remove from blacklist"]) {
      await pickAction(label);
      expect(openNotices()).toEqual([`${label} failed: ${reason}`]);
      await closeNotices();
    }
    await pickAction("Rate…");
    await click(buttonIn(dialogWith(`Rate ${grouped(MATCHING)} items`), "Clear rating"));
    expect(openNotices()).toEqual([`Rating update failed: ${reason}`]);
    await closeNotices();
    await pickAction("Clear playback stats…");
    await click(buttonIn(dialogWith(`Clear playback stats for ${grouped(MATCHING)} items?`), "Clear"));
    expect(openNotices()).toEqual([`Clear playback stats failed: ${reason}`]);
    await closeNotices();
    expect(popupsShown()).toEqual([]);
  });
});

describe("delete files", () => {
  it("from another machine asks for the control token before confirming, keeps the prompt open on a wrong token, and deletes every selected item's file", async () => {
    useStylesheet();
    const { server, ids } = await selectAllItems((fake) => {
      serveControlFromAnotherMachine(fake);
      fake.on("POST", "/api/library/delete-files", () => json({ deletedCount: 1230, failedItemIds: ["item-1", "item-2", "item-3", "item-4"] }));
    });
    await pickAction("Delete files…");

    const prompt = tokenPrompt()!;
    expect(prompt).not.toBeNull();
    expect(server.requests("GET", "/control/access")).toHaveLength(1);
    expect(prompt.querySelector("label")?.textContent).toBe("This is an admin action. Enter the server's control token.");
    expect([tokenField().type, document.activeElement]).toEqual(["password", tokenField()]);
    // Styled as the dialogs' text fields are, with room for the red icon.
    expect([currentStyle(tokenField()).minHeight, currentStyle(tokenField()).paddingRight]).toEqual(["44px", "40px"]);
    expect(Array.from(prompt.querySelectorAll(".dialog-actions > button")).map((button) => button.textContent)).toEqual(["Cancel", "Continue"]);
    // Empty, Continue is disabled quietly, with no red icon.
    expect([continueButton().disabled, prompt.querySelector(".vfield-icon")]).toEqual([true, null]);
    expect(findDialog(`Permanently delete ${grouped(MATCHING)} files from disk and remove them from the library? This can't be undone.`)).toBeNull();

    await typeToken("wrong");
    await click(continueButton());
    expect(server.requests("POST", "/control/pair").map((call) => call.body)).toEqual([{ token: "wrong" }]);
    expect(tokenPrompt()).toBe(prompt);
    expect(prompt.querySelector(".vfield-icon")).not.toBeNull();
    expect(prompt.querySelector(".vfield-tip")?.textContent).toBe(WRONG_TOKEN_REASON);
    expect(continueButton().disabled).toBe(true);
    // A wrong token is the token's problem, not a device that needs pairing.
    expect(server.logLines().some((line) => line.includes("Pair first"))).toBe(false);

    await typeToken(CONTROL_TOKEN);
    expect(continueButton().disabled).toBe(false);
    await click(continueButton());
    expect(tokenPrompt()).toBeNull();

    const confirm = dialogWith(`Permanently delete ${grouped(MATCHING)} files from disk and remove them from the library? This can't be undone.`);
    expect(document.activeElement).toBe(buttonIn(confirm, "Cancel"));
    expect(buttonIn(confirm, `Delete ${grouped(MATCHING)} Files`).classList.contains("btn-danger")).toBe(true);
    await click(buttonIn(confirm, `Delete ${grouped(MATCHING)} Files`));

    expect(server.requests("POST", "/api/library/delete-files").map((call) => call.body)).toEqual([{ itemIds: ids }]);
    await waitFor(() => expect(popupsShown()).toEqual([`Deleted ${grouped(1230)} files.`]));
    expect(openNotices()).toEqual(["4 files couldn't be deleted, so their items stay in the library."]);
    expect(selecting()).toBe(false);
    await closeNotices();

    // The control session lasts, so the next delete asks the server, which allows it, and shows no prompt.
    await click(check("item-5"));
    await pickAction("Delete files…");
    expect(server.requests("GET", "/control/access")).toHaveLength(2);
    expect(tokenPrompt()).toBeNull();
    expect(findDialog("Permanently delete 1 file from disk and remove it from the library? This can't be undone.")).not.toBeNull();
    expect(server.requests("POST", "/control/pair")).toHaveLength(2);
  });

  it("on the server machine asks for no token, and for one file says so, with no popup when nothing was deleted", async () => {
    const { server } = await mountLibrary(libraryItems(3), (fake) => {
      fake.on("GET", "/control/access", () => status(204));
      fake.on("POST", "/api/library/delete-files", () => json({ deletedCount: 0, failedItemIds: ["item-2"] }));
    });
    await openLibrary();
    await click(check("item-2"));
    await pickAction("Delete files…");

    expect(tokenPrompt()).toBeNull();
    const confirm = dialogWith("Permanently delete 1 file from disk and remove it from the library? This can't be undone.");
    expect(buttonIn(confirm, "Delete 1 File").classList.contains("btn-danger")).toBe(true);
    await click(buttonIn(confirm, "Delete 1 File"));

    expect(server.requests("POST", "/api/library/delete-files").map((call) => call.body)).toEqual([{ itemIds: ["item-2"] }]);
    expect(server.requests("POST", "/control/pair")).toEqual([]);
    expect(openNotices()).toEqual(["1 file couldn't be deleted, so its item stays in the library."]);
    expect(popupsShown()).toEqual([]);
    expect(selecting()).toBe(false);
  });

  it("ends selection once confirmed, so an answer that arrives later leaves a new selection alone", async () => {
    let answer: () => void = () => {};
    await mountLibrary(libraryItems(3), (fake) => {
      fake.on("GET", "/control/access", () => status(204));
      fake.on("POST", "/api/library/delete-files", async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return json({ deletedCount: 1, failedItemIds: [] });
      });
    });
    await openLibrary();
    await click(check("item-1"));
    await pickAction("Delete files…");
    await click(buttonIn(dialogWith("Permanently delete 1 file from disk and remove it from the library? This can't be undone."), "Delete 1 File"));
    expect(selecting()).toBe(false);

    await click(check("item-2"));
    answer();
    await waitFor(() => expect(popupsShown()).toEqual(["Deleted 1 file."]));
    expect([selecting(), barParts()[2]]).toEqual([true, "1 / 3 selected"]);
  });

  it("ends without deleting when the token prompt or the confirmation is cancelled", async () => {
    const { server } = await selectAllItems((fake) => serveControlFromAnotherMachine(fake));
    await pickAction("Delete files…");
    await click(buttonIn(tokenPrompt()!, "Cancel"));
    expect([shownDialogs(), selecting()]).toEqual([[], true]);

    await pickAction("Delete files…");
    await typeToken(CONTROL_TOKEN);
    await click(continueButton());
    await click(buttonIn(dialogWith(`Permanently delete ${grouped(MATCHING)} files from disk and remove them from the library? This can't be undone.`), "Cancel"));
    expect([shownDialogs(), selecting()]).toEqual([[], true]);
    expect(server.requests("POST", "/api/library/delete-files")).toEqual([]);
  });

  it("shows a refusal from a control session that ended before the request, with the server's reason and no retry", async () => {
    const reason = "This is an admin action. Pair with the control token first.";
    const { server } = await selectAllItems((fake) => {
      fake.on("GET", "/control/access", () => status(204));
      fake.on("POST", "/api/library/delete-files", () => json({ error: reason, code: "control_token_required" }, 403));
    });
    await pickAction("Delete files…");
    await click(buttonIn(dialogWith(`Permanently delete ${grouped(MATCHING)} files from disk and remove them from the library? This can't be undone.`), `Delete ${grouped(MATCHING)} Files`));

    expect(openNotices()).toEqual([`Delete files failed: ${reason}`]);
    // Selection ended when the delete was confirmed.
    expect([tokenPrompt(), server.requests("POST", "/api/library/delete-files").length, selecting()]).toEqual([null, 1, false]);
  });

  it("shows a failed access check in the notice, worded without its status", async () => {
    const { server } = await selectAllItems((fake) => {
      fake.on("GET", "/control/access", () => json({ error: REMOTE_CONNECTIONS_OFF }, 403));
    });
    await pickAction("Delete files…");

    expect(openNotices()).toEqual([`Delete files failed: ${REMOTE_CONNECTIONS_OFF}`]);
    expect([tokenPrompt(), server.requests("POST", "/api/library/delete-files")]).toEqual([null, []]);
  });
});

describe("memory", () => {
  it("keeps the collapsed controls, the preset and its filter, and sort and direction after a page refresh, and not the search", async () => {
    const presets = (server: FakeServer) => {
      server.on("GET", "/api/presets", () => json([ALL_FAVORITES_PRESET]));
      server.on("POST", "/api/random", () => randomAnswer(playResponse(1)));
    };
    const first = await mountLibrary(libraryItems(3), presets);
    await openLibrary();
    await pickPreset("preset-favorites");
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
    expect(sortSelect().value).toBe("Duration");
    expect(directionButton().textContent).toBe("Shortest → Longest");
    expect(searchBox().value).toBe("");
    expect(controlsShown()).toBe(false);

    await click(screen.getByRole("button", { name: "Play/Pause" }));
    const pick = server.requests("POST", "/api/random")[0]!.body;
    expect(pick).toMatchObject({ presetId: "preset-favorites", filterState: { favoritesMode: "only" } });
  });

  it("keeps the row height Ctrl+scroll over the grid zooms to after a page refresh", async () => {
    // Tiles three to a row at 160 px and two at 243, and one more in a last row at the height the rows aim for, all in
    // view.
    const { page } = await mountLibrary(libraryItems(7));
    await openLibrary();
    expect(rowLayout().at(-1)!.height).toBe(160);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
    for (let notch = 0; notch < 3; notch++) {
      // happy-dom's wheel event drops `ctrlKey` and the pointer's place from its init, so they are set on the event.
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
      for (const [name, value] of Object.entries({ ctrlKey: true, clientX: 100, clientY: 100 })) {
        Object.defineProperty(event, name, { value });
      }
      gridScroll().dispatchEvent(event);
    }
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    expect(rowLayout().at(-1)!.height).toBe(243);
    expect(localStorage.getItem("rr_device.library.rowHeight")).toBe("243");

    await refresh(page, libraryItems(7));
    await openLibrary();
    expect(rowLayout().at(-1)!.height).toBe(243);
    expect(rowLayout()[0]!.width).toBeCloseTo(rowsWidth(800), 6);
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
    expect(JSON.parse(localStorage.getItem(REMEMBERED_FILTER_KEY)!)).toMatchObject({ presetId: "preset-beach", unchanged: true });

    const shore = { ...BEACH_PRESET, filterState: { ...BEACH_PRESET.filterState, selectedTags: ["Shore"] } };
    const second = await refresh(page, libraryItems(3), (server) => {
      server.on("GET", "/api/presets", () => json([shore]));
      server.on("POST", "/api/random", () => randomAnswer(playResponse(1)));
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
        presetId: "preset-beach",
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
        presetId: null,
        unchanged: false
      })
    );
    const { library } = await mountLibrary(libraryItems(3), (server) => server.on("GET", "/api/sources", () => json(SOURCES)));
    expect(library.queries()[0].filterState.includedSourceIds).toEqual(["source-gone"]);
    await openLibrary();
    await waitFor(() => expect(lineText(filtersLine())).toBe("Filters: 0 of 3 sources"));
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
        presetId: null,
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
        presetId: null,
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
