// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusLogLine } from "../../logging/relayLogLines";
import { ScreenBoundary } from "../../ui/ScreenBoundary";
import { FakeServer, json, mountPage, pageReady, pickPreset, resetPage, status } from "./pageHarness";

const failing = vi.hoisted(() => ({ player: false, header: false, library: false, filter: false, tags: false, panel: false }));

// The panel's tab row throws when it reads the tab, when a test asks it to, as a render bug in the panel would.
vi.mock("../../panel/panelHost", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../panel/panelHost")>();
  return {
    ...actual,
    createPanelHost(...args: Parameters<typeof actual.createPanelHost>) {
      const host = actual.createPanelHost(...args);
      if (!failing.panel) {
        return host;
      }
      const tab = host.tab;
      return {
        ...host,
        tab: {
          get value(): never {
            throw new RangeError("Cannot show C:\\media\\holiday clip.mp4");
          },
          peek: () => tab.peek()
        } as unknown as typeof tab
      };
    }
  };
});

// The player throws on its first render when a test asks it to, as a render bug in the player would.
vi.mock("../../playback/mediaGestures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../playback/mediaGestures")>();
  return {
    ...actual,
    createMediaGestures(...args: Parameters<typeof actual.createMediaGestures>) {
      if (failing.player) {
        throw new RangeError("Cannot read C:\\media\\holiday clip.mp4");
      }
      return actual.createMediaGestures(...args);
    }
  };
});

// The now-playing line throws once an item plays, when a test asks it to, as a render bug in the header would.
vi.mock("../../playback/nowPlaying", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../playback/nowPlaying")>();
  return {
    ...actual,
    nowPlayingView(item: Parameters<typeof actual.nowPlayingView>[0]) {
      if (failing.header && item) {
        throw new TypeError("Cannot read C:\\media\\holiday clip.mp4");
      }
      return actual.nowPlayingView(item);
    }
  };
});

// The library overlay's error message throws when it renders, when a test asks it to, as a render bug in the
// library overlay would.
vi.mock("../../library/libraryOverlayModel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../library/libraryOverlayModel")>();
  return {
    ...actual,
    libraryOverlayMessage(...args: Parameters<typeof actual.libraryOverlayMessage>) {
      const message = actual.libraryOverlayMessage(...args);
      if (!failing.library || !message.error) {
        return message;
      }
      return {
        ...message,
        get text(): string {
          throw new TypeError("Cannot read C:\\media\\holiday clip.mp4");
        }
      };
    }
  };
});

// The filter dialog's Tags tab throws when it renders, when a test asks it to, as a render bug in the filter dialog
// would.
vi.mock("../../filter/filterDialogModel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../filter/filterDialogModel")>();
  return {
    ...actual,
    filterTagCategories(...args: Parameters<typeof actual.filterTagCategories>) {
      if (failing.filter) {
        throw new TypeError("Cannot read C:\\media\\holiday clip.mp4");
      }
      return actual.filterTagCategories(...args);
    }
  };
});

// The tag editor's first category throws when its name renders, when a test asks it to, as a render bug in the tag
// editor would.
vi.mock("../../tags/tagEditorModel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../tags/tagEditorModel")>();
  return {
    ...actual,
    tagCategoryRows(...args: Parameters<typeof actual.tagCategoryRows>) {
      const rows = actual.tagCategoryRows(...args);
      if (!failing.tags || rows.length === 0) {
        return rows;
      }
      const [first, ...rest] = rows;
      return [
        {
          ...first!,
          get name(): string {
            throw new TypeError("Cannot read C:\\media\\holiday clip.mp4");
          }
        },
        ...rest
      ];
    }
  };
});

function Broken(): never {
  throw new RangeError("broken");
}

const EMPTY_STATE_TEXT = "Tap to play, or open the panel to choose a preset or filter.";

/** The header, which is there only while it renders. */
function header(): HTMLElement {
  return screen.getByRole("banner");
}

type PanelTabName = "Library" | "Filter" | "Tags";

function panel(): HTMLElement {
  return document.getElementById("panel") as HTMLElement;
}

/** Whether the panel is open on `tab`. */
function isShowing(tab: PanelTabName): boolean {
  return !panel().hidden && !(document.getElementById(`panel-page-${tab.toLowerCase()}`) as HTMLElement).hidden;
}

/** Opens the panel with the panel button if it is closed, then chooses `tab` in the panel's tab row. */
function showPanelTab(tab: PanelTabName): void {
  if (panel().hidden) {
    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));
  }
  const tabRow = panel().querySelector(".panel-tablist") as HTMLElement;
  fireEvent.click(within(tabRow).getByRole("tab", { name: tab }));
}

/** Waits until the page has relayed the event stream's opening, which shows nothing. */
async function streamOpened(server: FakeServer): Promise<void> {
  await waitFor(() => expect(server.logLines().some((line) => line.startsWith("status=SSE connected "))).toBe(true));
}

beforeEach(() => {
  resetPage();
});

afterEach(() => {
  cleanup();
  failing.player = false;
  failing.header = false;
  failing.library = false;
  failing.filter = false;
  failing.tags = false;
  failing.panel = false;
});

describe("ScreenBoundary", () => {
  it("hides a screen that fails on its first render, relays one line, and renders its siblings", () => {
    const relay = vi.fn();
    render(
      <div>
        <ScreenBoundary screen="header" relay={relay}>
          <Broken />
        </ScreenBoundary>
        <ScreenBoundary screen="status" relay={relay}>
          <p>Ready</p>
        </ScreenBoundary>
      </div>
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    expect(relay).toHaveBeenCalledTimes(1);
    expect(relay).toHaveBeenCalledWith("error", "ui-error screen=header error=RangeError");
  });

  it("keeps the player and connection working when the header fails after an item plays", async () => {
    failing.header = true;
    const server = new FakeServer();
    server.on("POST", "/api/random", () =>
      json({
        id: "C:\\media\\holiday clip.mp4",
        itemId: "item-video",
        displayName: "holiday clip.mp4",
        mediaType: "video",
        durationSeconds: 65,
        mediaUrl: "/api/media/item-video?token=t",
        isFavorite: false,
        isBlacklisted: false
      })
    );
    const page = mountPage({ server });
    await pageReady(server);
    expect(header()).toBeTruthy();

    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));

    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=header error=TypeError"));
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(screen.queryByRole("banner")).toBeNull();
    expect((page.root.querySelector("video") as HTMLVideoElement).src).toContain("/api/media/item-video");

    page.stream().open();
    await streamOpened(server);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(server.requests("POST", "/api/random")).toHaveLength(2));
  });

  it("keeps the header, overlays, and connection working when the player fails to render", async () => {
    failing.player = true;
    const server = new FakeServer();
    server.on("GET", "/api/presets", () => json([{ id: "preset-1", name: "Favorites", filterState: { favoritesOnly: true } }]));
    const page = mountPage({ server });

    await pageReady(server);
    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=player error=RangeError"));
    expect(server.logLines().filter((line) => line.startsWith("ui-error"))).toEqual(["ui-error screen=player error=RangeError"]);
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(page.root.querySelector("video")).toBeNull();
    expect(page.root.querySelector("#fullscreen-stage #library-overlay")).not.toBeNull();

    await pickPreset("preset-1");
    await waitFor(() => expect(server.requests("POST", "/api/library/query")).toHaveLength(2));
    page.stream().open();
    await streamOpened(server);
  });

  it("keeps the player, header, and connection working when the panel fails to render", async () => {
    failing.panel = true;
    const server = new FakeServer();
    server.on("POST", "/api/random", () =>
      json({
        id: "C:\\media\\holiday clip.mp4",
        itemId: "item-video",
        displayName: "holiday clip.mp4",
        mediaType: "video",
        durationSeconds: 65,
        mediaUrl: "/api/media/item-video?token=t",
        isFavorite: false,
        isBlacklisted: false
      })
    );
    const page = mountPage({ server });
    await pageReady(server);

    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=panel error=RangeError"));
    expect(server.logLines().filter((line) => line.startsWith("ui-error"))).toEqual(["ui-error screen=panel error=RangeError"]);
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(page.root.querySelector("#panel")).toBeNull();
    expect(page.root.querySelector("#panel-handle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));
    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));
    await waitFor(() => expect((page.root.querySelector("video") as HTMLVideoElement).src).toContain("/api/media/item-video"));
    expect(header()).toBeTruthy();
    page.stream().open();
    await streamOpened(server);
  });

  it("keeps the player, header, panel, filter dialog, and connection working when the library overlay fails", async () => {
    failing.library = true;
    const server = new FakeServer();
    server.on("POST", "/api/library/query", () => status(500));
    server.on("POST", "/api/random", () =>
      json({
        id: "C:\\media\\holiday clip.mp4",
        itemId: "item-video",
        displayName: "holiday clip.mp4",
        mediaType: "video",
        durationSeconds: 65,
        mediaUrl: "/api/media/item-video?token=t",
        isFavorite: false,
        isBlacklisted: false
      })
    );
    server.on("GET", "/api/sources", () => json([]));
    server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    const page = mountPage({ server });
    // The library's body shows the failure, which only relays, and the library overlay has failed.
    await waitFor(() => expect(server.logLines()).toContain(statusLogLine("Library load failed: HTTP 500", null, 0)));

    showPanelTab("Library");
    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=library error=TypeError"));
    expect(server.logLines().filter((line) => line.startsWith("ui-error"))).toEqual(["ui-error screen=library error=TypeError"]);
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(page.root.querySelector("#library-overlay")).toBeNull();
    expect(isShowing("Library")).toBe(true);

    fireEvent.click(within(panel()).getByRole("button", { name: "Close panel" }));
    await waitFor(() => expect(panel().hidden).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));
    await waitFor(() => expect(isShowing("Library")).toBe(true));
    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));
    await waitFor(() => expect((page.root.querySelector("video") as HTMLVideoElement).src).toContain("/api/media/item-video"));
    expect(header()).toBeTruthy();
    showPanelTab("Filter");
    await waitFor(() => expect(isShowing("Filter")).toBe(true));
    expect(page.root.querySelector("#panel-page-filter #filter-dialog")).not.toBeNull();
    page.stream().open();
    await streamOpened(server);
  });

  it("keeps the player, header, panel, library overlay, tag editor, and connection working when the filter dialog fails", async () => {
    failing.filter = true;
    const server = new FakeServer();
    server.on("POST", "/api/random", () =>
      json({
        id: "C:\\media\\holiday clip.mp4",
        itemId: "item-video",
        displayName: "holiday clip.mp4",
        mediaType: "video",
        durationSeconds: 65,
        mediaUrl: "/api/media/item-video?token=t",
        isFavorite: false,
        isBlacklisted: false
      })
    );
    server.on("GET", "/api/sources", () => json([]));
    server.on("POST", "/api/tag-editor/model", () => json({ categories: [], tags: [], items: [] }));
    const page = mountPage({ server });
    await pageReady(server);
    expect(page.root.querySelector("#fullscreen-stage #filter-dialog")).not.toBeNull();

    showPanelTab("Filter");
    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=filter error=TypeError"));
    expect(server.logLines().filter((line) => line.startsWith("ui-error"))).toEqual(["ui-error screen=filter error=TypeError"]);
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(page.root.querySelector("#filter-dialog")).toBeNull();
    expect(isShowing("Filter")).toBe(true);

    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));
    await waitFor(() => expect((page.root.querySelector("video") as HTMLVideoElement).src).toContain("/api/media/item-video"));
    expect(header()).toBeTruthy();
    showPanelTab("Library");
    await waitFor(() => expect(isShowing("Library")).toBe(true));
    await waitFor(() => expect(within(page.root.querySelector("#library-overlay") as HTMLElement).getByText("No media in library.")).toBeTruthy());
    showPanelTab("Tags");
    await waitFor(() => expect(isShowing("Tags")).toBe(true));
    expect(page.root.querySelector("#panel-page-tags #tag-editor")).not.toBeNull();
    page.stream().open();
    await streamOpened(server);
  });

  it("keeps the player, header, panel, library overlay, filter dialog, and connection working when the tag editor fails", async () => {
    failing.tags = true;
    const server = new FakeServer();
    server.on("POST", "/api/random", () =>
      json({
        id: "C:\\media\\holiday clip.mp4",
        itemId: "item-video",
        displayName: "holiday clip.mp4",
        mediaType: "video",
        durationSeconds: 65,
        mediaUrl: "/api/media/item-video?token=t",
        isFavorite: false,
        isBlacklisted: false
      })
    );
    server.on("GET", "/api/sources", () => json([]));
    server.on("POST", "/api/tag-editor/model", () =>
      json({ categories: [{ id: "cat-places", name: "Places", sortOrder: 0 }], tags: [{ name: "Beach", categoryId: "cat-places" }], items: [] })
    );
    const page = mountPage({ server });
    await pageReady(server);
    expect(page.root.querySelector("#fullscreen-stage #tag-editor")).not.toBeNull();

    showPanelTab("Tags");
    await waitFor(() => expect(server.logLines()).toContain("ui-error screen=tags error=TypeError"));
    expect(server.logLines().filter((line) => line.startsWith("ui-error"))).toEqual(["ui-error screen=tags error=TypeError"]);
    expect(server.logLines().some((line) => line.includes("holiday"))).toBe(false);
    expect(page.root.querySelector("#tag-editor")).toBeNull();
    expect(isShowing("Tags")).toBe(true);

    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));
    await waitFor(() => expect((page.root.querySelector("video") as HTMLVideoElement).src).toContain("/api/media/item-video"));
    expect(header()).toBeTruthy();
    showPanelTab("Library");
    await waitFor(() => expect(isShowing("Library")).toBe(true));
    await waitFor(() => expect(within(page.root.querySelector("#library-overlay") as HTMLElement).getByText("No media in library.")).toBeTruthy());
    showPanelTab("Filter");
    await waitFor(() => expect(isShowing("Filter")).toBe(true));
    expect(page.root.querySelector("#panel-page-filter #filter-dialog")).not.toBeNull();
    page.stream().open();
    await streamOpened(server);
  });
});
