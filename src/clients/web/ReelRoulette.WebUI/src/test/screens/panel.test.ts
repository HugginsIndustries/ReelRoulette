// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import {
  closeNotices,
  COMPATIBLE_VERSION,
  FakeServer,
  IPHONE_USER_AGENT,
  json,
  mountPage,
  openNotices,
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
  server.on("POST", "/api/random", () => json(VIDEO_ITEM));
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

async function press(element: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  element.focus();
  fireEvent.keyDown(element, { key, ...init });
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

function tab(name: "Library" | "Filter" | "Tags"): HTMLButtonElement {
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
    expect(screen.queryByRole("button", { name: /settings/i, hidden: true })).toBeNull();
    expect(screen.queryByRole("tab", { name: /settings|stats/i, hidden: true })).toBeNull();
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
  it("are one row of icons, Library, Filter, and Tags, each with a tooltip and an accessible name", async () => {
    await mount();
    const tabs = within(tabRow()).getAllByRole("tab", { hidden: true });

    expect(tabs.map((button) => button.getAttribute("aria-label"))).toEqual(["Library", "Filter", "Tags"]);
    expect(tabs.map((button) => button.title)).toEqual(["Library", "Filter", "Tags"]);
    expect(tabs.map(icon)).toEqual(["browse", "filter_alt", "tag"]);
    expect(tabs.every((button) => button.parentElement === tabRow())).toBe(true);
    expect(tabRow().getAttribute("role")).toBe("tablist");
  });

  it("show one tab page at a time in the one panel", async () => {
    await mount();
    await click(panelButton());

    for (const name of ["Tags", "Filter", "Library"] as const) {
      await click(tab(name));
      expect(shownPages()).toEqual([name]);
      expect(selectedTab()).toBe(name);
    }
    expect(document.querySelectorAll("aside.panel")).toHaveLength(1);
  });

  it("close the panel with the Close at the end of the row, which gives focus back to the panel button", async () => {
    await mount();
    await click(panelButton());
    const close = within(panel()).getByRole("button", { name: "Close panel" });
    close.focus();

    await click(close);

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(panelButton());
  });

  it("Escape with focus on the handle gives focus back to the panel button", async () => {
    await mount();
    await click(panelButton());
    handle().focus();

    fireEvent.keyDown(handle(), { key: "Escape" });
    await settle();

    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(panelButton());
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
    expect(applyButton().textContent).toBe("Apply*");

    setViewport({ width: 600, height: 800 });
    await settle();
    expect(coversPage()).toBe(true);
    setViewport({ width: 1200, height: 800 });
    await settle();

    expect(coversPage()).toBe(false);
    expect(shownPages()).toEqual(["Filter"]);
    expect(neverPlayed().checked).toBe(true);
    expect(applyButton().textContent).toBe("Apply*");
  });
});

describe("width", () => {
  /**
   * Mounts the page on a 1200 px stage, so the panel can be 360 to 788 px wide: the stage less the 12 px handle and
   * the 400 px player.
   */
  async function mountWideStage(): Promise<void> {
    stubLayoutSize(1200, 700);
    await mount();
    const stageBox = new DOMRect(0, 0, 1200, 700);
    Object.defineProperty(stage(), "getBoundingClientRect", { configurable: true, value: () => stageBox });
  }

  function shownWidth(): number {
    return Number(handle().getAttribute("aria-valuenow"));
  }

  async function drag(fromX: number, toX: number): Promise<void> {
    fireEvent.pointerDown(handle(), { pointerId: 1, button: 0, clientX: fromX, clientY: 300 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: toX, clientY: 300 });
    await settle();
  }

  async function release(): Promise<void> {
    fireEvent.pointerUp(document, { pointerId: 1, button: 0 });
    await settle();
  }

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

  it("takes the arrow keys, Home, and End on the handle, growing toward the player", async () => {
    await mountWideStage();
    await click(panelButton());

    await press(handle(), "ArrowLeft");
    expect(shownWidth()).toBe(436);
    await press(handle(), "ArrowLeft", { shiftKey: true });
    expect(shownWidth()).toBe(500);
    await press(handle(), "ArrowRight");
    expect(shownWidth()).toBe(484);
    expect(localStorage.getItem("rr_device.panel.width")).toBe("484");
    await press(handle(), "End");
    expect(shownWidth()).toBe(788);
    await press(handle(), "Home");
    expect(shownWidth()).toBe(360);
    expect(handle().getAttribute("aria-valuetext")).toBe("360 pixels");
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

  it("grows with the right arrow when the panel sits on the left", async () => {
    localStorage.setItem("rr_device.panel.side", '"left"');
    await mountWideStage();
    await click(panelButton());

    await press(handle(), "ArrowRight");
    expect(shownWidth()).toBe(436);
  });
});

describe("memory", () => {
  it("keeps whether the panel is open, its side, width, and last tab across a page refresh", async () => {
    localStorage.setItem("rr_device.panel.side", '"left"');
    stubLayoutSize(1200, 700);
    const first = await mount();
    await click(panelButton());
    await click(tab("Tags"));
    await press(handle(), "ArrowRight");
    expect(handle().getAttribute("aria-valuenow")).toBe("436");
    first.unmount();

    const again = await mount();
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Tags"]);
    expect(stage().dataset.side).toBe("left");
    expect(handle().getAttribute("aria-valuenow")).toBe("436");
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

  it("plays it and closes the overlay", async () => {
    setViewport({ width: 600, height: 800 });
    const page = await openLibraryWithTile();

    await click(document.querySelector(".library-grid-tile[data-item-id='item-1']")!);

    expect(page.server.requests("POST", "/api/play/item-1")).toHaveLength(1);
    await waitFor(() => expect(videoSrc()).toContain("/api/media/item-1"));
    expect(isOpen()).toBe(false);
  });
});

describe("Filter tab's Apply and Cancel", () => {
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
    expect(applyButton().textContent).toBe("Apply");
  });

  it("Cancel puts back the applied filter and leaves the panel open beside the player", async () => {
    await openFilter();
    expect(applyButton().textContent).toBe("Apply*");

    await click(within(panel()).getByRole("button", { name: "Cancel" }));

    expect(neverPlayed().checked).toBe(false);
    expect(applyButton().textContent).toBe("Apply");
    expect(isOpen()).toBe(true);
    expect(shownPages()).toEqual(["Filter"]);
  });

  it("Apply and Cancel each close the overlay", async () => {
    setViewport({ width: 600, height: 800 });
    const page = await openFilter();
    await click(applyButton());
    await waitFor(() => expect(relayed(page.server, "Filters applied.")).toBe(true));
    expect(isOpen()).toBe(false);

    await click(panelButton());
    expect(shownPages()).toEqual(["Filter"]);
    await click(neverPlayed());
    await click(within(panel()).getByRole("button", { name: "Cancel" }));
    expect(isOpen()).toBe(false);
  });

  it("Refresh loads the tab when it failed to load when it showed", async () => {
    const server = panelServer();
    let sources = 503;
    server.on("GET", "/api/sources", () => (sources === 200 ? json([]) : new Response("{}", { status: sources })));
    await mount(server);
    await click(panelButton());
    await click(tab("Filter"));
    await waitFor(() => expect(openNotices()).toEqual(["Filter load failed: HTTP 503"]));
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Filter load failed: HTTP 503", null, 0)));
    await closeNotices();

    sources = 200;
    await click(within(panel()).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(relayed(server, "Filter data refreshed.")).toBe(true));
    expect(neverPlayed().checked).toBe(false);
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

  it("mark the Filter tab and the panel button with a dot, and their names say so, until Apply or Cancel", async () => {
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
    await click(within(panel()).getByRole("button", { name: "Cancel" }));
    expect(marked(tab("Filter")).dot).toBe(false);
    expect(marked(panelButton()).dot).toBe(false);
  });

  it("mark the Tags tab and the panel button with a dot until Save, or until Refresh discards the changes", async () => {
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
    await click(document.getElementById("tag-editor-refresh-btn")!);
    await click(within(topDialog()!).getByRole("button", { name: "Discard" }));
    expect(marked(tab("Tags")).dot).toBe(false);
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

  it("loads nothing into a Filter tab remembered open, nor on its Refresh", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"filter"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    await mount(server);
    expect(shownPages()).toEqual(["Filter"]);

    await click(within(panel()).getByRole("button", { name: "Refresh" }));
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

  it("loads nothing into a Tags tab remembered open, nor on its Refresh", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"tags"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, capabilities: [] }));
    await mount(server);
    expect(shownPages()).toEqual(["Tags"]);

    await click(within(document.getElementById("panel-page-tags")!).getByRole("button", { name: "Refresh" }));
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
  });
});

describe("running without a library", () => {
  const NO_LIBRARY = { ...COMPATIBLE_VERSION, libraryState: "damaged", libraryMessage: "The library file is damaged." };

  it("loads nothing into a Filter tab remembered open, nor on its Refresh or Apply", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"filter"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json(NO_LIBRARY));
    await mount(server);
    expect(shownPages()).toEqual(["Filter"]);

    await click(within(panel()).getByRole("button", { name: "Refresh" }));
    await click(applyButton());
    expect(server.requests("GET", "/api/sources")).toHaveLength(0);
    expect(server.requests("POST", "/api/tag-editor/model")).toHaveLength(0);
    expect(server.requests("GET", "/api/presets")).toHaveLength(0);
    expect(server.requests("POST", "/api/library/query")).toHaveLength(0);
    expect(topDialog()).toBeNull();
  });

  it("loads nothing into a Tags tab remembered open, nor on its Refresh", async () => {
    localStorage.setItem("rr_device.panel.open", "true");
    localStorage.setItem("rr_device.panel.tab", '"tags"');
    const server = panelServer();
    server.on("GET", "/api/version", () => json(NO_LIBRARY));
    await mount(server);
    expect(shownPages()).toEqual(["Tags"]);

    await click(within(document.getElementById("panel-page-tags")!).getByRole("button", { name: "Refresh" }));
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
