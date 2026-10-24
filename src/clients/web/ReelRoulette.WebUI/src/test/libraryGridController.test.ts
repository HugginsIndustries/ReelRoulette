// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLibraryGridController, type LibraryGridController } from "../library/libraryGridController";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import { LIBRARY_QUERY_WINDOW_SIZE } from "../library/libraryQuerySession";

const VIEWPORT_HEIGHT = 600;
const RESIZE_DEBOUNCE_MS = 90;

/** The grid's width while it shows; 0 hides it, as a hidden tab does. */
let panelWidth = 800;
const resizeCallbacks: Array<() => void> = [];
const restores: Array<() => void> = [];

function stubOwnProperty(target: object, name: string, descriptor: PropertyDescriptor): void {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
  restores.push(() => {
    if (original) {
      Object.defineProperty(target, name, original);
    } else {
      delete (target as Record<string, unknown>)[name];
    }
  });
}

function hasBox(element: HTMLElement): boolean {
  if (!element.isConnected || panelWidth < 1) {
    return false;
  }
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden) {
      return false;
    }
  }
  return true;
}

/**
 * Gives shown elements the panel's width and the viewport's height, as happy-dom lays nothing out, and makes an element
 * without a box ignore scrolling, as a browser does. happy-dom's ResizeObserver never calls back, so `resize` does.
 */
function stubLayout(): void {
  stubOwnProperty(HTMLElement.prototype, "clientWidth", {
    get(this: HTMLElement) {
      return hasBox(this) ? panelWidth : 0;
    }
  });
  stubOwnProperty(HTMLElement.prototype, "clientHeight", {
    get(this: HTMLElement) {
      return hasBox(this) ? VIEWPORT_HEIGHT : 0;
    }
  });
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
  stubOwnProperty(HTMLElement.prototype, "scrollTop", {
    get(this: HTMLElement) {
      return scrollTop.get!.call(this);
    },
    set(this: HTMLElement, value: number) {
      if (hasBox(this)) {
        scrollTop.set!.call(this, value);
      }
    }
  });
  stubOwnProperty(window, "ResizeObserver", {
    value: class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    }
  });
}

function item(id: string, overrides: Partial<LibraryProjectionItem> = {}): LibraryProjectionItem {
  return {
    id,
    sourceId: "s1",
    fileName: `${id}.mp4`,
    fullPath: null,
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
    hasThumbnail: false,
    thumbnailVersion: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    ...overrides
  };
}

/** Items with thumbnails of mixed shapes, so rows hold different numbers of tiles at different widths. */
function thumbnailItems(count: number): LibraryProjectionItem[] {
  const shapes = [
    [1920, 1080],
    [1080, 1920],
    [1200, 900],
    [3000, 1000]
  ] as const;
  return Array.from({ length: count }, (_, index) => {
    const [thumbnailWidth, thumbnailHeight] = shapes[index % shapes.length]!;
    return item(`item-${index}`, { hasThumbnail: true, thumbnailVersion: "v1", thumbnailWidth, thumbnailHeight });
  });
}

function createGrid(): { container: HTMLElement; grid: LibraryGridController } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, grid: createLibraryGridController(container, "http://localhost") };
}

function scroller(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(".library-grid-scroll")!;
}

function scrollTo(container: HTMLElement, top: number): void {
  const scroll = scroller(container);
  scroll.scrollTop = top;
  scroll.dispatchEvent(new Event("scroll"));
}

/** Changes the panel's width, as a side panel resize does, once the grid's resize wait has passed. */
function resizeTo(width: number): void {
  panelWidth = width;
  for (const callback of resizeCallbacks) {
    callback();
  }
  vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS);
}

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".library-grid-row"));
}

function tilesById(container: HTMLElement): Map<string, HTMLElement> {
  return new Map(
    Array.from(container.querySelectorAll<HTMLElement>(".library-grid-tile")).map((tile) => [tile.dataset.itemId!, tile])
  );
}

/** Expects the very same elements, in order; `toEqual` compares elements by their markup alone. */
function expectSameElements(actual: readonly Element[], expected: readonly Element[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((element, index) => expect(element).toBe(expected[index]));
}

/** The rows shown, by their first tile's item id. */
function rowsByFirstItem(container: HTMLElement): Map<string, HTMLElement> {
  return new Map(rows(container).map((row) => [(row.firstElementChild as HTMLElement).dataset.itemId!, row]));
}

beforeEach(() => {
  panelWidth = 800;
  resizeCallbacks.length = 0;
  stubLayout();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const restore of restores.splice(0).reverse()) {
    restore();
  }
  document.body.replaceChildren();
});

describe("libraryGridController empty scroll reset", () => {
  it("scrolls an empty reset to the top while the scroller still has a box", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: [item("a"), item("b")] });
    const scroll = scroller(container);
    scroll.scrollTop = 400;

    grid.setBrowseContent({ visibleItems: [], resetScroll: true });

    expect(scroll.scrollTop).toBe(0);
    grid.destroy();
  });

  it("keeps an empty reset that cannot move the hidden scroller until rows are shown again", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: [item("a"), item("b")] });
    const scroll = scroller(container);
    scroll.scrollTop = 400;

    panelWidth = 0;
    grid.setBrowseContent({ visibleItems: [], resetScroll: true });
    panelWidth = 800;
    grid.flushDeferredLayout();
    grid.setBrowseContent({ visibleItems: [item("a"), item("b")], resetScroll: false });

    expect(scroll.scrollTop).toBe(0);
    grid.destroy();
  });

  it("leaves the scroll position when an empty reload did not ask to reset", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: [item("a")] });
    const scroll = scroller(container);
    scroll.scrollTop = 400;

    grid.setBrowseContent({ visibleItems: [], resetScroll: false });

    expect(scroll.scrollTop).toBe(400);
    grid.destroy();
  });
});

describe("libraryGridController coverage", () => {
  it("reports the height of the rows holding the last page of loaded tiles", () => {
    // Two tiles to a row, so the second page starts a row of its own.
    panelWidth = 480;
    const { grid } = createGrid();
    const tiles = (count: number) => Array.from({ length: count }, (_, index) => item(`t-${index}`));

    grid.setBrowseContent({ visibleItems: tiles(LIBRARY_QUERY_WINDOW_SIZE) });
    const onePage = grid.measureCoverage();
    expect(onePage?.lastPageHeight).toBe(onePage?.extentHeight);

    grid.setBrowseContent({ visibleItems: tiles(2 * LIBRARY_QUERY_WINDOW_SIZE), resetScroll: false });
    const twoPages = grid.measureCoverage();
    expect(twoPages?.extentHeight).toBeGreaterThan(0);
    expect(twoPages?.lastPageHeight).toBeCloseTo((twoPages?.extentHeight ?? 0) / 2);
    grid.destroy();
  });
});

describe("row reuse", () => {
  it("scrolling keeps the rows and images that stay visible, and creates only the rows coming into view", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    const before = rowsByFirstItem(container);
    const imagesBefore = new Map(Array.from(before, ([id, row]) => [id, Array.from(row.querySelectorAll("img"))]));
    const createElement = vi.spyOn(document, "createElement");

    scrollTo(container, 1500);

    const after = rowsByFirstItem(container);
    const stayed = Array.from(after.keys()).filter((id) => before.has(id));
    const entered = Array.from(after.keys()).filter((id) => !before.has(id));
    expect(stayed.length).toBeGreaterThan(0);
    expect(entered.length).toBeGreaterThan(0);
    expect(Array.from(before.keys()).some((id) => !after.has(id))).toBe(true);
    for (const id of stayed) {
      expect(after.get(id)).toBe(before.get(id));
      expectSameElements(Array.from(after.get(id)!.querySelectorAll("img")), imagesBefore.get(id)!);
    }
    const enteredTiles = entered.reduce((sum, id) => sum + after.get(id)!.children.length, 0);
    const createdImages = createElement.mock.calls.filter(([tag]) => tag === "img").length;
    expect(createdImages).toBe(enteredTiles);
    grid.destroy();
  });

  it("scrolling down adds and removes only the rows coming into and leaving view, moving none of the rows that stay", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    const before = rows(container);
    const observer = new MutationObserver(() => {});
    observer.observe(container.querySelector(".library-grid-rows")!, { childList: true });

    scrollTo(container, 1500);

    const records = observer.takeRecords();
    observer.disconnect();
    const after = rows(container);
    const entered = after.filter((row) => !before.includes(row));
    const left = before.filter((row) => !after.includes(row));
    const added = records.flatMap((record) => Array.from(record.addedNodes));
    const removed = records.flatMap((record) => Array.from(record.removedNodes));
    expect(after.some((row) => before.includes(row))).toBe(true);
    expect(entered.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    expect(added).toHaveLength(entered.length);
    expect(removed).toHaveLength(left.length);
    added.forEach((row) => expect(entered).toContain(row));
    removed.forEach((row) => expect(left).toContain(row));
    grid.destroy();
  });

  it("a reflow at a new width keeps the tile and image elements of the items that stay in view, moved into their new rows", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    const tilesBefore = tilesById(container);
    const rowOf = (tile: HTMLElement) => rows(container).indexOf(tile.parentElement as HTMLElement);
    const rowsBefore = new Map(Array.from(tilesBefore, ([id, tile]) => [id, rowOf(tile)]));
    const imagesBefore = new Map(Array.from(tilesBefore, ([id, tile]) => [id, tile.querySelector("img")]));

    resizeTo(560);

    const tilesAfter = tilesById(container);
    const kept = Array.from(tilesAfter.keys()).filter((id) => tilesBefore.has(id));
    expect(kept.length).toBeGreaterThan(10);
    for (const id of kept) {
      expect(tilesAfter.get(id)).toBe(tilesBefore.get(id));
      expect(tilesAfter.get(id)!.querySelector("img")).toBe(imagesBefore.get(id));
    }
    expect(kept.some((id) => rowOf(tilesAfter.get(id)!) !== rowsBefore.get(id))).toBe(true);
    grid.destroy();
  });

  it("sets no grid element's innerHTML while loading, scrolling, reflowing, adding a page, or patching a tile", () => {
    vi.useFakeTimers();
    const innerHtml = vi.spyOn(Element.prototype, "innerHTML", "set");
    const { container, grid } = createGrid();
    const items = thumbnailItems(400);

    grid.setBrowseContent({ visibleItems: items });
    scrollTo(container, 1500);
    resizeTo(560);
    const added = items.concat(thumbnailItems(600).slice(400));
    grid.setBrowseContent({ visibleItems: added, resetScroll: false });
    added[20] = { ...added[20]!, isFavorite: true };
    grid.setBrowseContent({ visibleItems: added, resetScroll: false });

    expect(tilesById(container).size).toBeGreaterThan(0);
    expect(innerHtml).not.toHaveBeenCalled();
    grid.destroy();
  });

  it("after scrolling, a narrowing reflow, an added page, a patch, and a widening reflow, shows what a new grid shows for the same items, width, and scroll position", () => {
    vi.useFakeTimers();
    const kept = createGrid();
    const items = thumbnailItems(400);
    kept.grid.setPlayingItemId("item-12");
    kept.grid.setBrowseContent({ visibleItems: items });
    scrollTo(kept.container, 1500);
    resizeTo(560);
    const added = items.concat(thumbnailItems(600).slice(400));
    kept.grid.setBrowseContent({ visibleItems: added, resetScroll: false });
    added[20] = { ...added[20]!, isFavorite: true, fileName: "renamed.mp4" };
    added[21] = { ...added[21]!, thumbnailVersion: "v2" };
    kept.grid.setBrowseContent({ visibleItems: added, resetScroll: false });
    // Widening moves tiles into earlier rows, while the later rows they leave are still shown.
    resizeTo(800);
    kept.grid.setPlayingItemId("item-22");
    scrollTo(kept.container, 900);

    const fresh = createGrid();
    fresh.grid.setPlayingItemId("item-22");
    fresh.grid.setBrowseContent({ visibleItems: added });
    scrollTo(fresh.container, 900);

    expect(tilesById(kept.container).size).toBeGreaterThan(10);
    expect(kept.container.innerHTML).toBe(fresh.container.innerHTML);
    kept.grid.destroy();
    fresh.grid.destroy();
  });

  it("shows an item loaded twice in each place, keeping both tiles", () => {
    const { container, grid } = createGrid();
    const items = thumbnailItems(12);
    items.splice(9, 0, items[1]!);

    grid.setBrowseContent({ visibleItems: items });
    const twice = () => Array.from(container.querySelectorAll<HTMLElement>('.library-grid-tile[data-item-id="item-1"]'));
    const tiles = twice();
    grid.setBrowseContent({ visibleItems: items.slice(), resetScroll: false });

    expect(tiles).toHaveLength(2);
    expect(tiles[0]!.parentElement).not.toBe(tiles[1]!.parentElement);
    expectSameElements(twice(), tiles);
    expect(container.querySelectorAll(".library-grid-tile")).toHaveLength(13);
    grid.destroy();
  });
});
