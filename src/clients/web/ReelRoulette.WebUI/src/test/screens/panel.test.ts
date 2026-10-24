// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import { REFRESH_GATHER_MS } from "../../stats/coalescedRefresh";
import {
  closeNotices,
  COMPATIBLE_VERSION,
  FakeServer,
  IPHONE_USER_AGENT,
  json,
  mountPage,
  openNotices,
  randomAnswer,
  resetPage,
  setViewport,
  settle,
  stubCoarsePointer,
  stubFullscreenApi,
  stubLayoutSize,
  useStylesheet,
  type MountedPage
} from "./pageHarness";

const VIDEO_ITEM = {
  id: "C:\\media\\clip 1.mp4",
  itemId: "item-1",
  displayName: "clip 1.mp4",
  mediaType: "video",
  durationSeconds: 60,
  mediaUrl: "/api/media/item-1?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const LIBRARY_ITEM = {
  id: "item-1",
  sourceId: "source-1",
  fileName: "clip 1.mp4",
  fullPath: "C:\\media\\clip 1.mp4",
  relativePath: "clip 1.mp4",
  mediaType: 0,
  durationSeconds: 60,
  playCount: 0,
  isFavorite: false,
  isBlacklisted: false,
  tags: [] as string[],
  hasThumbnail: false,
  thumbnailWidth: 1920,
  thumbnailHeight: 1080
};

const TAG_MODEL = {
  categories: [{ id: "cat-people", name: "People", sortOrder: 0 }],
  tags: [{ name: "Alice", categoryId: "cat-people" }],
  items: [{ itemId: "item-1", tags: [] as string[] }]
};

/** A server with one library item, which random picks and tile plays return, the filter's data, and the tags. */
function panelServer(): FakeServer {
  const server = new FakeServer();
  server.on("POST", "/api/library/query", () => json({ items: [LIBRARY_ITEM], totalCount: 1, searchBaselineCount: 1 }));
  server.on("POST", "/api/random", () => randomAnswer(VIDEO_ITEM));
  server.on("POST", "/api/play/item-1", () => json(VIDEO_ITEM));
  server.on("GET", "/api/sources", () => json([]));
  server.on("POST", "/api/tag-editor/model", () => json(TAG_MODEL));
  server.on("POST", "/api/tag-editor/apply-item-tags", () => json({}));
  return server;
}

/** Mounts the page and waits for its version check, whichever way it answers. */
async function mount(server = panelServer()): Promise<MountedPage> {
  const page = mountPage({ server });
  await waitFor(() => expect(server.requests("GET", "/api/version").length).toBeGreaterThan(0));
  await settle();
  return page;
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

/**
 * Sends a tag catalog change and a source enabled or disabled, which the Filter and Tags tabs load again for, and waits
 * long enough for a load to have gone, had it gone. A resync, which the library reloads for too, is left to the tabs'
 * own tests.
 */
async function emitTabEvents(page: MountedPage): Promise<void> {
  page.stream().emit("tagCatalogChanged", 40, { categories: [], tags: [] });
  page.stream().emit("sourceStateChanged", 41, { sourceId: "source-1", isEnabled: false });
  await new Promise((resolve) => setTimeout(resolve, REFRESH_GATHER_MS + 50));
  await settle();
}

function panelButton(): HTMLButtonElement {
  return document.getElementById("panel-btn") as HTMLButtonElement;
}

function panel(): HTMLElement {
  return document.getElementById("panel")!;
}

function stage(): HTMLElement {
  return document.getElementById("fullscreen-stage")!;
}

function handle(): HTMLElement {
  return document.getElementById("panel-handle")!;
}

function isOpen(): boolean {
  return !panel().hidden;
}

/** The panel's tab row, apart from the Filter and Tags tabs' own section tabs. */
function tabRow(): HTMLElement {
  return panel().querySelector(".panel-tablist") as HTMLElement;
}

function tab(name: "Library" | "Filter" | "Tags" | "Randomization" | "Settings"): HTMLButtonElement {
  // A tab's name says so while it holds unsaved changes.
  return within(tabRow()).getByRole("tab", { name: new RegExp(`^${name}(, unsaved changes)?$`), hidden: true }) as HTMLButtonElement;
}

/** The tab pages showing, by the tab that labels them. */
function shownPages(): string[] {
  return Array.from(panel().querySelectorAll<HTMLElement>("[role=tabpanel]"))
    .filter((page) => !page.hidden)
    .map((page) => document.getElementById(page.getAttribute("aria-labelledby")!)!.getAttribute("aria-label")!.replace(", unsaved changes", ""));
}

function selectedTab(): string | null {
  return within(tabRow()).queryAllByRole("tab", { hidden: true }).find((button) => button.getAttribute("aria-selected") === "true")?.getAttribute("aria-label") ?? null;
}

function icon(button: HTMLElement): string {
  return button.querySelector(".material-symbol-icon")!.textContent ?? "";
}

/** Whether the stylesheet places the open panel over the page as the overlay. */
function coversPage(): boolean {
  return getComputedStyle(panel()).position === "fixed";
}

/** Whether the page has relayed `text`, a message or a state with no message, whatever was playing. */
function relayed(server: FakeServer, text: string): boolean {
  return server.logLines().some((line) => line.startsWith(`status=${text} hasCurrent=`));
}

function topDialog(): HTMLDialogElement | null {
  return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog")).at(-1) ?? null;
}

function videoSrc(): string {
  return (document.getElementById("video") as HTMLVideoElement).src;
}

function applyButton(): HTMLButtonElement {
  return document.getElementById("filter-apply-btn") as HTMLButtonElement;
}

/** Whether the Filter tab's Apply shows changes to apply: orange, with its unsaved-changes dot, and enabled. */
function applyShowsChanges(): boolean {
  const changes = applyButton().classList.contains("has-pending");
  expect(applyButton().querySelector<HTMLElement>(".unsaved-dot")!.hidden).toBe(!changes);
  expect(applyButton().disabled).toBe(!changes);
  return changes;
}

function neverPlayed(): HTMLInputElement {
  return within(panel()).getByLabelText("Only never played") as HTMLInputElement;
}

beforeEach(() => {
  resetPage();
});

describe("main page", () => {
  it("shows the header with the logo and the file name, and the player, with no status line and no settings icon", async () => {
    await mount();
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));

    const header = document.querySelector("header.top-bar") as HTMLElement;
    expect(within(header).getAllByAltText("ReelRoulette")).toHaveLength(3);
    expect(document.getElementById("now-playing-name")!.textContent).toBe("clip 1.mp4");
    expect(document.getElementById("media-container")).not.toBeNull();
    expect(document.getElementById("status")).toBeNull();
    // The panel's tab row reaches Settings, so neither the header nor the player has a settings icon.
    expect(within(header).queryByRole("button", { name: /settings/i, hidden: true })).toBeNull();
    expect(within(document.getElementById("media-container")!).queryByRole("button", { name: /settings/i, hidden: true })).toBeNull();
  });

  it("says how to start before anything plays, and a tap starts a random pick", async () => {
    const page = await mount();
    const empty = screen.getByText("Tap to play, or open the panel to choose a preset or filter.");

    await click(empty);

    expect(page.server.requests("POST", "/api/random")).toHaveLength(1);
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
  });
});

describe("panel button", () => {
  it("is the player's one panel button, with Favorite and Blacklist, and no Library, Filter, or Tags button", async () => {
    await mount();
    const controls = document.getElementById("overlay-controls")!;

    expect(within(controls).getByRole("button", { name: "Open panel" })).toBe(panelButton());
    expect(within(controls).getByRole("button", { name: "Favorite" })).not.toBeNull();
    expect(within(controls).getByRole("button", { name: "Blacklist" })).not.toBeNull();
    for (const name of ["Library", "Select filters", "Edit Tags", "Filter", "Tags"]) {
      expect(screen.queryByRole("button", { name, hidden: true })).toBeNull();
    }
  });

  it("opens the panel on Library the first time, then on its last tab, and closes an open panel", async () => {
    await mount();
    expect(isOpen()).toBe(false);

    await click(panelButton());
    expect(isOpen()).toBe(true);
    expect(selectedTab()).toBe("Library");
    expect(shownPages()).toEqual(["Library"]);

    await click(tab("Filter"));
    expect(shownPages()).toEqual(["Filter"]);
    await click(panelButton());
    expect(isOpen()).toBe(false);
    expect(shownPages()).toEqual([]);

    await click(panelButton());
    expect(selectedTab()).toBe("Filter");
    expect(shownPages()).toEqual(["Filter"]);
  });

  it("shows the panel's side and whether it is open, and is orange while it is open", async () => {
    await mount();
    expect(icon(panelButton())).toBe("right_panel_open");
    expect(panelButton().getAttribute("aria-expanded")).toBe("false");
    expect(panelButton().classList.contains("active")).toBe(false);

    await click(panelButton());

    expect(icon(panelButton())).toBe("right_panel_close");
    expect(panelButton().getAttribute("aria-label")).toBe("Close panel");
    expect(panelButton().title).toBe("Close panel");
    expect(panelButton().getAttribute("aria-expanded")).toBe("true");
    expect(panelButton().classList.contains("active")).toBe(true);
  });

  it("shows the left panel's icons when the panel sits on the left", async () => {
    localStorage.setItem("rr_device.panel.side", '"left"');
    useStylesheet();
    await mount();
    expect(icon(panelButton())).toBe("left_panel_open");

    await click(panelButton());

    expect(icon(panelButton())).toBe("left_panel_close");
    expect(stage().dataset.side).toBe("left");
    expect(getComputedStyle(stage()).flexDirection).toBe("row-reverse");
  });
});

describe("tabs", () => {
  it("are one row of icons, Library, Tags, Stats, Filter, Randomization, and Settings, each with a tooltip and an accessible name", async () => {
    await mount();
    const tabs = within(tabRow()).getAllByRole("tab", { hidden: true });

    expect(tabs.map((button) => button.getAttribute("aria-label"))).toEqual(["Library", "Tags", "Stats", "Filter", "Randomization", "Settings"]);
    expect(tabs.map((button) => button.title)).toEqual(["Library", "Tags", "Stats", "Filter", "Randomization", "Settings"]);
    expect(tabs.map(icon)).toEqual(["browse", "tag", "bar_chart", "filter_alt", "casino", "settings"]);
    expect(tabs.every((button) => button.parentElement === tabRow())).toBe(true);
    expect(tabRow().getAttribute("role")).toBe("tablist");
  });

  it("show one tab page at a time in the one panel", async () => {
    await mount();
    await click(panelButton());

    for (const name of ["Settings", "Randomization", "Tags", "Filter", "Library"] as const) {
      await click(tab(name));
      expect(shownPages()).toEqual([name]);
      expect(selectedTab()).toBe(name);
    }
    expect(document.querySelectorAll("aside.panel")).toHaveLength(1);
  });

  it("close the panel with the Close at the end of the row", async () => {
    await mount();
    await click(panelButton());

    await click(within(panel()).getByRole("button", { name: "Close panel" }));

    expect(isOpen()).toBe(false);
  });

  it("leaves focus on the page however it closes, by its button, its Close, or Escape, so keys don't go to a text field it hides", async () => {
    await mount();
    const closes: [string, () => Promise<void>][] = [
      ["panel button", () => click(panelButton())],
      ["Close", () => click(within(panel()).getByRole("button", { name: "Close panel" }))],
      [
        "Escape",
        async () => {
          fireEvent.keyDown(document.activeElement!, { key: "Escape" });
          await settle();
        }
      ]
    ];
    for (const [name, close] of closes) {
      await click(panelButton());
      // A tap on a button, as on an iPad, leaves focus where it was.
      within(panel()).getByRole("searchbox", { name: "Search library", hidden: true }).focus();
      await close();
      expect([isOpen(), document.activeElement], name).toEqual([false, document.body]);
    }
  });

  it("close with Escape, and Escape then leaves pseudo-fullscreen", async () => {
    stubFullscreenApi({ refuse: true });
    await mount();
    await click(screen.getByRole("button", { name: "Fullscreen" }));
    await click(panelButton());

    fireEvent.keyDown(document, { key: "Escape" });
    await settle();
    expect(isOpen()).toBe(false);
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await settle();
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(false);
  });
});

describe("breakpoints", () => {
  beforeEach(() => {
    useStylesheet();
  });

  it("opens beside the player from 800 px, and as the overlay below", async () => {
    setViewport({ width: 800, height: 700 });
    await mount();
    await click(panelButton());
    expect(stage().dataset.panelMode).toBe("side");
    expect(coversPage()).toBe(false);

    setViewport({ width: 799, height: 700 });
    expect(stage().dataset.panelMode).toBe("overlay");
    expect(coversPage()).toBe(true);
    expect(getComputedStyle(handle()).display).toBe("none");
  });

  it("opens as the overlay on a touch screen below 500 px of height, and beside the player from 500 px", async () => {
    stubCoarsePointer();
    setViewport({ width: 900, height: 499 });
    await mount();
    await click(panelButton());
    expect(coversPage()).toBe(true);

    setViewport({ width: 900, height: 500 });
    expect(coversPage()).toBe(false);
  });

  it("stays beside the player on a short window with a mouse", async () => {
    setViewport({ width: 900, height: 400 });
    await mount();
    await click(panelButton());
    expect(coversPage()).toBe(false);
  });

  it("go by the window and the pointer, not the user agent", async () => {
    resetPage(IPHONE_USER_AGENT);
    useStylesheet();
    setViewport({ width: 1200, height: 800 });
    await mount();
    await click(panelButton());
    expect(coversPage()).toBe(false);

    resetPage();
    useStylesheet();
    setViewport({ width: 600, height: 800 });
    await mount();
    await click(panelButton());
    expect(coversPage()).toBe(true);
  });

  it("move an open panel between beside the player and the overlay without losing its tab or its changes", async () => {
    setViewport({ width: 1200, height: 800 });
    await mount();
    await click(panelButton());
    await click(tab("Filter"));
    await click(neverPlayed());
    expect(applyShowsChanges()).toBe(true);

    setViewport({ width: 600, height: 800 });
    await settle();
    expect(coversPage()).toBe(true);
    setViewport({ width: 1200, height: 800 });
    await settle();

    expect(coversPage()).toBe(false);
    expect(shownPages()).toEqual(["Filter"]);
    expect(neverPlayed().checked).toBe(true);
    expect(applyShowsChanges()).toBe(true);
  });
});

/**
 * Mounts the page on a 1200 px stage, so the panel can be 360 to 788 px wide: the stage less the 12 px handle and the
 * 400 px player.
 */
async function mountWideStage(): Promise<MountedPage> {
  stubLayoutSize(1200, 700);
  const page = await mount();
  const stageBox = new DOMRect(0, 0, 1200, 700);
  Object.defineProperty(stage(), "getBoundingClientRect", { configurable: true, value: () => stageBox });
  return page;
}

function shownWidth(): number {
  return Number(handle().getAttribute("aria-valuenow"));
}

/** Presses the handle at `fromX` and drags it to `toX`, without letting go. */
async function drag(fromX: number, toX: number): Promise<void> {
  fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: fromX, clientY: 300 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: toX, clientY: 300 });
  await settle();
}

async function release(): Promise<void> {
  fireEvent.pointerUp(document, { pointerId: 1, button: 0 });
  await settle();
}

describe("width", () => {
  it("starts at 420 px and follows a drag of the handle within 360 px and the width that leaves the player 400 px", async () => {
    await mountWideStage();
    await click(panelButton());
    expect(shownWidth()).toBe(420);
    expect(handle().getAttribute("aria-valuemin")).toBe("360");
    expect(handle().getAttribute("aria-valuemax")).toBe("788");

    await drag(780, 700);
    expect(shownWidth()).toBe(500);
    expect(stage().style.getPropertyValue("--panel-width")).toBe("500px");
    expect(localStorage.getItem("rr_device.panel.width")).toBeNull();
    await drag(700, 100);
    expect(shownWidth()).toBe(788);
    await drag(100, 1100);
    expect(shownWidth()).toBe(360);
    await release();

    expect(localStorage.getItem("rr_device.panel.width")).toBe("360");
  });

  it("keeps a wider remembered width after a click on the handle that doesn't drag", async () => {
    localStorage.setItem("rr_device.panel.width", "700");
    stubLayoutSize(1000, 700);
    await mount();
    await click(panelButton());
    expect(shownWidth()).toBe(588);

    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    await release();
    expect(localStorage.getItem("rr_device.panel.width")).toBe("700");
  });
});

describe("memory", () => {
  it("keeps whether the panel is open, its side, width, and last tab across a page refresh", async () => {
    localStorage.setItem("rr_device.panel.side", '"left"');
    const first = await mountWideStage();
    await click(panelButton());
    await click(tab("Tags"));
    // On the left, the panel grows as its handle moves right.
    await drag(420, 436);
    await release();
    expect(shownWidth()).toBe(436);
    first.unmount();

    const again = await mount();
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Tags"]);
    expect(stage().dataset.side).toBe("left");
    expect(shownWidth()).toBe(436);
    expect(again.server.requests("POST", "/api/tag-editor/model")).toHaveLength(1);
    const calls = again.server.calls.map((call) => `${call.method} ${call.path}`);
    expect(calls.indexOf("POST /api/tag-editor/model")).toBeGreaterThan(calls.indexOf("GET /api/version"));

    await click(panelButton());
    again.unmount();
    await mount();
    expect(isOpen()).toBe(false);
  });
});

describe("choosing a tile", () => {
  async function openLibraryWithTile(): Promise<MountedPage> {
    stubLayoutSize();
    const page = await mount();
    await click(panelButton());
    await waitFor(() => expect(document.querySelector(".library-grid-tile[data-item-id='item-1']")).not.toBeNull());
    return page;
  }

  it("plays it in the player beside the panel, which stays open", async () => {
    const page = await openLibraryWithTile();

    await click(document.querySelector(".library-grid-tile[data-item-id='item-1']")!);

    expect(page.server.requests("POST", "/api/play/item-1")).toHaveLength(1);
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Library"]);
  });

  it("plays it and closes the overlay, leaving focus on the page", async () => {
    setViewport({ width: 600, height: 800 });
    const page = await openLibraryWithTile();
    within(panel()).getByRole("searchbox", { name: "Search library", hidden: true }).focus();

    await click(document.querySelector(".library-grid-tile[data-item-id='item-1']")!);

    expect(page.server.requests("POST", "/api/play/item-1")).toHaveLength(1);
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    expect([isOpen(), document.activeElement]).toEqual([false, document.body]);
  });
});

describe("Filter tab's Apply and Discard changes", () => {
  async function openFilter(): Promise<MountedPage> {
    const page = await mount();
    await click(panelButton());
    await click(tab("Filter"));
    await click(neverPlayed());
    return page;
  }

  it("Apply applies the filter and leaves the panel open beside the player", async () => {
    const page = await openFilter();
    const queries = page.server.requests("POST", "/api/library/query").length;

    await click(applyButton());

    await waitFor(() => expect(relayed(page.server, "Filters applied.")).toBe(true));
    expect(page.server.requests("POST", "/api/library/query")).toHaveLength(queries + 1);
    expect(page.server.requests("POST", "/api/library/query").at(-1)!.body.filterState.onlyNeverPlayed).toBe(true);
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Filter"]);
    expect(applyShowsChanges()).toBe(false);
  });

  it("Discard changes puts back the applied filter and leaves the panel open beside the player", async () => {
    await openFilter();
    expect(applyShowsChanges()).toBe(true);

    await click(within(panel()).getByRole("button", { name: "Discard changes" }));

    expect(neverPlayed().checked).toBe(false);
    expect(applyShowsChanges()).toBe(false);
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Filter"]);
  });

  it("Apply closes the overlay, and Discard changes leaves it open", async () => {
    useStylesheet();
    setViewport({ width: 600, height: 800 });
    const page = await openFilter();
    await click(applyButton());
    await waitFor(() => expect(relayed(page.server, "Filters applied.")).toBe(true));
    expect(isOpen()).toBe(false);

    await click(panelButton());
    expect(shownPages()).toEqual(["Filter"]);
    await click(neverPlayed());
    await click(within(panel()).getByRole("button", { name: "Discard changes" }));
    expect(isOpen()).toBe(true);
    expect(coversPage()).toBe(true);
    // Apply applied it checked.
    expect(neverPlayed().checked).toBe(true);
    expect(applyShowsChanges()).toBe(false);
  });

  it("loads the tab when it shows again after it failed to load when it showed", async () => {
    const server = panelServer();
    let sources = 503;
    server.on("GET", "/api/sources", () => (sources === 200 ? json([]) : new Response("{}", { status: sources })));
    await mount(server);
    await click(panelButton());
    await click(tab("Filter"));
    await waitFor(() => expect(openNotices()).toEqual(["Filter load failed."]));
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Filter load failed (HTTP 503).", null, 0)));
    await closeNotices();

    sources = 200;
    await click(tab("Library"));
    await click(tab("Filter"));

    await waitFor(() => expect(neverPlayed()).not.toBeNull());
    expect(neverPlayed().checked).toBe(false);
    expect(openNotices()).toEqual([]);
  });
});

describe("Tags tab", () => {
  /** The Alice chip's add. */
  function addAlice(): HTMLButtonElement | null {
    return panel().querySelector<HTMLButtonElement>(".tag-chip [title='Add tag']");
  }

  async function openTagsWithChange(): Promise<MountedPage> {
    const page = await mount();
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    await click(panelButton());
    await click(tab("Tags"));
    await waitFor(() => expect(addAlice()).not.toBeNull());
    await click(addAlice()!);
    return page;
  }

  it("keeps its changes when it is left for another tab or the panel closes, without asking", async () => {
    await openTagsWithChange();

    await click(tab("Library"));
    expect(topDialog()).toBeNull();
    expect(shownPages()).toEqual(["Library"]);
    await click(tab("Tags"));
    expect(addAlice()!.classList.contains("is-selected")).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await settle();
    expect(topDialog()).toBeNull();
    expect(isOpen()).toBe(false);
    await click(panelButton());
    expect(shownPages()).toEqual(["Tags"]);
    expect(addAlice()!.classList.contains("is-selected")).toBe(true);
  });

  it("Save leaves the panel open beside the player", async () => {
    const page = await openTagsWithChange();
    expect(stage().dataset.panelMode).toBe("side");

    await click(document.getElementById("tag-editor-apply-btn")!);

    await waitFor(() => expect(relayed(page.server, "Tag editor changes applied")).toBe(true));
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Tags"]);
  });

  it("Save leaves the panel open as the overlay", async () => {
    setViewport({ width: 600, height: 800 });
    const page = await openTagsWithChange();
    expect(stage().dataset.panelMode).toBe("overlay");

    await click(document.getElementById("tag-editor-apply-btn")!);

    await waitFor(() => expect(relayed(page.server, "Tag editor changes applied")).toBe(true));
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Tags"]);
  });
});

describe("unsaved changes", () => {
  /** Whether the element's dot shows, and the name it has. */
  function marked(element: HTMLElement): { dot: boolean; name: string; title: string } {
    const dot = element.querySelector<HTMLElement>(".unsaved-dot");
    return { dot: !!dot && !dot.hidden, name: element.getAttribute("aria-label") ?? "", title: element.title };
  }

  it("mark the Filter tab and the panel button with a dot, and their names say so, until Apply or Discard changes", async () => {
    await mount();
    await click(panelButton());
    expect(marked(tab("Filter"))).toEqual({ dot: false, name: "Filter", title: "Filter" });
    expect(marked(panelButton())).toEqual({ dot: false, name: "Close panel", title: "Close panel" });
    await click(tab("Filter"));
    await click(neverPlayed());

    expect(marked(tab("Filter"))).toEqual({ dot: true, name: "Filter, unsaved changes", title: "Filter (unsaved changes)" });
    expect(marked(tab("Tags"))).toEqual({ dot: false, name: "Tags", title: "Tags" });
    expect(marked(tab("Library")).dot).toBe(false);
    expect(marked(panelButton())).toEqual({ dot: true, name: "Close panel, unsaved changes", title: "Close panel, unsaved changes" });
    await click(document.getElementById("panel-close-btn")!);
    expect(marked(panelButton())).toEqual({ dot: true, name: "Open panel, unsaved changes", title: "Open panel, unsaved changes" });

    await click(panelButton());
    expect(neverPlayed().checked).toBe(true);
    await click(applyButton());
    expect(marked(tab("Filter")).dot).toBe(false);
    expect(marked(panelButton())).toEqual({ dot: false, name: "Close panel", title: "Close panel" });

    await click(neverPlayed());
    expect(marked(tab("Filter")).dot).toBe(true);
    await click(within(panel()).getByRole("button", { name: "Discard changes" }));
    expect(marked(tab("Filter")).dot).toBe(false);
    expect(marked(panelButton()).dot).toBe(false);
  });

  it("mark the Tags tab and the panel button with a dot until Save, or until Discard changes drops the changes", async () => {
    await mount();
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    await click(panelButton());
    await click(tab("Tags"));
    const alice = () => panel().querySelector<HTMLButtonElement>(".tag-chip [title='Add tag']")!;
    await waitFor(() => expect(alice()).not.toBeNull());

    await click(alice());
    expect(marked(tab("Tags"))).toEqual({ dot: true, name: "Tags, unsaved changes", title: "Tags (unsaved changes)" });
    expect(marked(panelButton()).dot).toBe(true);
    await click(document.getElementById("tag-editor-apply-btn")!);
    expect(marked(tab("Tags")).dot).toBe(false);
    expect(marked(panelButton()).dot).toBe(false);

    await click(alice());
    expect(marked(tab("Tags")).dot).toBe(true);
    await click(document.getElementById("tag-editor-discard-btn")!);
    expect(topDialog()).toBeNull();
    expect(marked(tab("Tags")).dot).toBe(false);
    expect(marked(panelButton()).dot).toBe(false);
  });

  it("clear the dots on the Filter tab and the panel button when a change is put back", async () => {
    await mount();
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    await click(panelButton());
    await click(tab("Filter"));
    // A minimum typed and left is a change, and emptied again it is none, before the field is left again.
    const minimum = document.getElementById("filter-min-dur-text") as HTMLInputElement;
    fireEvent.input(minimum, { target: { value: "1:30" } });
    fireEvent.change(minimum);
    await settle();
    expect(marked(panelButton()).dot).toBe(true);
    fireEvent.input(minimum, { target: { value: "" } });
    await settle();
    expect(marked(tab("Filter")).dot).toBe(false);
    expect(marked(panelButton()).dot).toBe(false);
  });

  it("show the dot on the panel button while either tab holds changes", async () => {
    await mount();
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    await click(panelButton());
    await click(tab("Filter"));
    await click(neverPlayed());
    await click(tab("Tags"));
    const alice = () => panel().querySelector<HTMLButtonElement>(".tag-chip [title='Add tag']")!;
    await waitFor(() => expect(alice()).not.toBeNull());
    await click(alice());

    await click(document.getElementById("tag-editor-apply-btn")!);
    expect(marked(tab("Tags")).dot).toBe(false);
    expect(marked(tab("Filter")).dot).toBe(true);
    expect(marked(panelButton()).dot).toBe(true);
  });
});

describe("fullscreen", () => {
  it("keeps the panel inside the stage, so it opens in fullscreen", async () => {
    const fullscreen = stubFullscreenApi();
    await mount();

    await click(screen.getByRole("button", { name: "Fullscreen" }));
    await click(panelButton());

    expect(fullscreen.requests).toEqual([stage()]);
    expect(stage().contains(panel())).toBe(true);
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Library"]);
  });

  it("opens in pseudo-fullscreen, as on an iPhone", async () => {
    resetPage(IPHONE_USER_AGENT);
    stubFullscreenApi();
    await mount();

    await click(screen.getByRole("button", { name: "Fullscreen" }));
    await click(panelButton());

    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);
    expect(stage().contains(panel())).toBe(true);
    expect(isOpen()).toBe(true);
  });
});

describe("compatibility failure", () => {
  it("opens the panel, says why on the Library tab in place of the grid, and Play shows its notice", async () => {
    const server = panelServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    await mount(server);

    await click(panelButton());
    expect(isOpen()).toBe(true);
    const library = document.getElementById("panel-page-library")!;
    expect(within(library).getByRole("alert").textContent).toBe(
      `Server missing required capabilities: ${COMPATIBLE_VERSION.capabilities.join(", ")}.`
    );
    // The controls stay, but search and sort have nothing to load.
    expect((document.getElementById("library-search-input") as HTMLInputElement).disabled).toBe(true);
    expect(server.requests("POST", "/api/library/query")).toHaveLength(0);

    await click(screen.getByRole("button", { name: "Play/Pause" }));
    expect(topDialog()?.textContent).toContain("Cannot play: server compatibility check failed.");
    expect(server.requests("POST", "/api/random")).toHaveLength(0);
  });

  it("loads nothing into a Filter tab remembered open", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"filter"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    await mount(server);
    expect(shownPages()).toEqual(["Filter"]);

    await click(tab("Library"));
    await click(tab("Filter"));
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
  });

  it("says why on a Library tab remembered open", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"library"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    await mount(server);

    expect(shownPages()).toEqual(["Library"]);
    const library = document.getElementById("panel-page-library")!;
    expect(within(library).getByRole("alert").textContent).toBe(
      `Server missing required capabilities: ${COMPATIBLE_VERSION.capabilities.join(", ")}.`
    );
  });

  it("loads nothing into a Tags tab remembered open", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"tags"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    await mount(server);
    expect(shownPages()).toEqual(["Tags"]);

    await click(tab("Library"));
    await click(tab("Tags"));
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
  });
});

describe("running without a library", () => {
  const NO_LIBRARY = { ...COMPATIBLE_VERSION, libraryState: "damaged", libraryMessage: "The library file is damaged." };

  it("loads nothing into a Filter tab remembered open, nor on a server event or Apply", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"filter"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json(NO_LIBRARY));
    const page = await mount(server);
    expect(shownPages()).toEqual(["Filter"]);

    await emitTabEvents(page);
    await click(applyButton());
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
    expect(server.requests("GET", "/api/presets")).toHaveLength(0);
    expect(server.requests("POST", "/api/library/query")).toHaveLength(0);
    expect(topDialog()).toBeNull();
  });

  it("loads nothing into a Tags tab remembered open, nor on a server event", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"tags"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json(NO_LIBRARY));
    const page = await mount(server);
    expect(shownPages()).toEqual(["Tags"]);

    await emitTabEvents(page);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
    expect(topDialog()).toBeNull();
  });

  it("loads a Filter tab remembered open once the server has its library", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"filter"');
    const server = panelServer();
    let version: object = NO_LIBRARY;
    server.on("GET", "/api/version", () => json(version));
    const page = await mount(server);
    expect(shownPages()).toEqual(["Filter"]);
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);

    version = COMPATIBLE_VERSION;
    page.stream().open();
    await waitFor(() => expect(server.requests("GET", "/api/sources")).toHaveLength(1));
    await waitFor(() => expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1));
    expect(shownPages()).toEqual(["Filter"]);
    expect(topDialog()).toBeNull();
  });

  it("loads a Tags tab remembered open once the server has its library", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"tags"');
    const server = panelServer();
    let version: object = NO_LIBRARY;
    server.on("GET", "/api/version", () => json(version));
    const page = await mount(server);
    expect(shownPages()).toEqual(["Tags"]);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);

    version = COMPATIBLE_VERSION;
    page.stream().open();
    await waitFor(() => expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(1));
    expect(shownPages()).toEqual(["Tags"]);
    expect(topDialog()).toBeNull();
  });
});
