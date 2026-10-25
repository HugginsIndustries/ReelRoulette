// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLibraryGridController,
  type LibraryGridController,
  type LibraryGridCoverage,
  type LibraryGridOptions
} from "../library/libraryGridController";
import { TILE_GAP } from "../library/libraryGridLayout";
import {
  createVirtualizerState,
  findRowIndexForItem,
  type LibraryGridVirtualizerState
} from "../library/libraryGridVirtualizer";
import { TILE_MOVE_EASING, TILE_MOVE_MS } from "../library/libraryGridZoom";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import { LIBRARY_QUERY_WINDOW_SIZE } from "../library/libraryQuerySession";
import { stubMatchingMediaQuery, stubProperty, type Restores } from "./stubs";

const VIEWPORT_HEIGHT = 600;
const RESIZE_DEBOUNCE_MS = 90;

/** The grid's width while it shows; 0 hides it, as a hidden tab does. */
let panelWidth = 800;
/** The width of the grid scroller's scrollbar, which its `clientWidth` leaves out, as a browser's does. */
let scrollbarWidth = 0;
const resizeCallbacks: Array<() => void> = [];
/** Undoes what the tests stubbed on shared prototypes and the window, newest first. */
const restores: Restores = [];

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
 * Gives shown elements the panel's width, less the scrollbar's on the grid's scroller, and the viewport's height, as
 * happy-dom lays nothing out, and makes an element without a box ignore scrolling, as a browser does. happy-dom's
 * ResizeObserver never calls back, so `resize` does.
 */
function stubLayout(): void {
  stubProperty(restores, HTMLElement.prototype, "clientWidth", {
    get(this: HTMLElement) {
      if (!hasBox(this)) {
        return 0;
      }
      return this.classList.contains("library-grid-scroll") ? panelWidth - scrollbarWidth : panelWidth;
    }
  });
  stubProperty(restores, HTMLElement.prototype, "clientHeight", {
    get(this: HTMLElement) {
      return hasBox(this) ? VIEWPORT_HEIGHT : 0;
    }
  });
  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
  stubProperty(restores, HTMLElement.prototype, "scrollTop", {
    get(this: HTMLElement) {
      return scrollTop.get!.call(this);
    },
    set(this: HTMLElement, value: number) {
      if (hasBox(this)) {
        scrollTop.set!.call(this, value);
      }
    }
  });
  stubProperty(restores, window, "ResizeObserver", {
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

function createGrid(options?: LibraryGridOptions): { container: HTMLElement; grid: LibraryGridController } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, grid: createLibraryGridController(container, "http://localhost", options) };
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
  scrollbarWidth = 0;
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

describe("layout width", () => {
  /** The width of each row shown, its tiles' widths and the gaps between them. */
  function rowWidths(container: HTMLElement): number[] {
    return rows(container).map((row) => {
      const tiles = Array.from(row.querySelectorAll<HTMLElement>(".library-grid-tile"));
      return tiles.reduce((sum, tile) => sum + Number.parseFloat(tile.style.width), 0) + TILE_GAP * (tiles.length - 1);
    });
  }

  it("lays the rows out beside the grid's scrollbar, whose room the grid always keeps", () => {
    vi.useFakeTimers();
    scrollbarWidth = 16;
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });

    expect(rowWidths(container).length).toBeGreaterThan(3);
    expect(rowWidths(container)).toEqual(rowWidths(container).map(() => expect.closeTo(784, 4)));
    resizeTo(600);
    expect(rowWidths(container)).toEqual(rowWidths(container).map(() => expect.closeTo(584, 4)));

    // The room stays kept whether or not the rows fill the grid, so the width the rows are laid out to doesn't change as
    // the scrollbar comes and goes.
    const stylesheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");
    expect(stylesheet).toMatch(/\.library-grid-scroll \{[^}]*\bscrollbar-gutter: stable;/);
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

  it("marks the selected items' tiles in place, and the tiles that come into view later", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    const selected = new Set(["item-1", "item-3", "item-399"]);
    const shownBefore = tilesById(container);

    grid.setSelection((itemId) => selected.has(itemId));

    const marked = () =>
      Array.from(tilesById(container))
        .filter(([, tile]) => tile.classList.contains("is-selected"))
        .map(([id]) => id);
    expect(marked()).toEqual(["item-1", "item-3"]);
    for (const [id, tile] of tilesById(container)) {
      expect(tile).toBe(shownBefore.get(id));
    }

    selected.delete("item-3");
    grid.setSelection((itemId) => selected.has(itemId));
    expect(marked()).toEqual(["item-1"]);

    scrollTo(container, grid.measureCoverage()!.extentHeight - VIEWPORT_HEIGHT);
    expect(tilesById(container).has("item-399")).toBe(true);
    expect(marked()).toEqual(["item-399"]);
    grid.destroy();
  });

  it("marks the tiles of a grid's rows built after the selection was set", () => {
    const { container, grid } = createGrid();
    grid.setSelection((itemId) => itemId === "item-2");
    grid.setBrowseContent({ visibleItems: thumbnailItems(10) });

    expect(tilesById(container).get("item-2")!.classList.contains("is-selected")).toBe(true);
    expect(tilesById(container).get("item-1")!.classList.contains("is-selected")).toBe(false);
    grid.destroy();
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

/**
 * Turns the wheel over the grid. happy-dom's wheel event drops `ctrlKey` and the pointer's place from its init, so they
 * are set on the event. The grid's box is at the window's top-left corner, as happy-dom lays nothing out.
 */
function wheelOver(
  container: HTMLElement,
  init: { deltaY: number; clientX: number; clientY: number; deltaMode?: number; ctrlKey?: boolean }
): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: init.deltaY, deltaMode: init.deltaMode ?? 0 });
  for (const [name, value] of Object.entries({ ctrlKey: init.ctrlKey ?? true, clientX: init.clientX, clientY: init.clientY })) {
    Object.defineProperty(event, name, { value });
  }
  scroller(container).dispatchEvent(event);
  return event;
}

/** Ctrl+scroll notches over the grid at one point, then the wait until the gesture settles. */
function zoomBy(container: HTMLElement, notches: number, clientX: number, clientY: number): void {
  for (let i = 0; i < Math.abs(notches); i++) {
    wheelOver(container, { deltaY: notches > 0 ? -100 : 100, clientX, clientY });
  }
  vi.advanceTimersByTime(1000);
}

/** Touches on the grid, each finger on the screen at a point. */
function touchOver(container: HTMLElement, type: string, points: Array<[number, number]>): TouchEvent {
  const target = scroller(container);
  const touches = points.map(([clientX, clientY], identifier) => new Touch({ identifier, target, clientX, clientY }));
  const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: touches });
  target.dispatchEvent(event);
  return event;
}

function rowsLayer(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>(".library-grid-rows")!;
}

/** The rows' layer's scale and move while a gesture lasts. */
function layerView(container: HTMLElement): { x: number; y: number; scale: number } {
  const match = /^translate\((\S+)px, (\S+)px\) scale\((\S+)\)$/.exec(rowsLayer(container).style.transform);
  expect(match).not.toBeNull();
  return { x: Number(match![1]), y: Number(match![2]), scale: Number(match![3]) };
}

function spacerHeight(container: HTMLElement, which: "top" | "bottom"): number {
  return Number.parseFloat(container.querySelector<HTMLElement>(`.library-grid-spacer-${which}`)!.style.height);
}

/** Where a point in the window falls in the rows' layer, at the scale and move it shows. */
function layerPoint(container: HTMLElement, clientX: number, clientY: number): [number, number] {
  const view = layerView(container);
  const layerTop = spacerHeight(container, "top") - scroller(container).scrollTop;
  return [(clientX - view.x) / view.scale, (clientY - layerTop - view.y) / view.scale];
}

/** Expects the rows shown to be the layout of `items`, from the row the top spacer ends at. */
function expectShownRows(
  container: HTMLElement,
  items: readonly LibraryProjectionItem[],
  layout: LibraryGridVirtualizerState
): void {
  const first = layout.offsetIndex.rowTopOffsets.findIndex((top) => Math.abs(top - spacerHeight(container, "top")) < 1e-6);
  expect(first).toBeGreaterThanOrEqual(0);
  const shown = rows(container);
  expect(shown.map((row) => Number.parseFloat(row.style.height))).toEqual(
    layout.rows.slice(first, first + shown.length).map((row) => expect.closeTo(row.rowHeight, 4))
  );
  expect(shown.map((row) => (row.firstElementChild as HTMLElement).dataset.itemId)).toEqual(
    layout.rows.slice(first, first + shown.length).map((row) => items[row.tiles[0]!.itemIndex]!.id)
  );
}

function tileMoves(container: HTMLElement): Map<string, Animation[]> {
  return new Map(
    Array.from(container.querySelectorAll<HTMLElement>(".library-grid-tile"))
      .map((tile) => [tile.dataset.itemId!, tile.getAnimations()] as const)
      .filter(([, animations]) => animations.length > 0)
  );
}

function keyframesOf(animation: Animation): ComputedKeyframe[] {
  return (animation.effect as KeyframeEffect).getKeyframes();
}

describe("grid zoom", () => {
  it("scales the rows around the pointer while Ctrl+scroll turns, leaving the tiles as they were laid out", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    scrollTo(container, 1500);
    const sizes = (tiles: Map<string, HTMLElement>) => new Map(Array.from(tiles, ([id, tile]) => [id, tile.style.cssText]));
    const before = tilesById(container);
    const sizesBefore = sizes(before);

    const event = wheelOver(container, { deltaY: -100, clientX: 300, clientY: 200 });
    const [x, y] = [300, 200 - (spacerHeight(container, "top") - 1500)];
    vi.advanceTimersByTime(150);

    expect(event.defaultPrevented).toBe(true);
    expect(layerView(container).scale).toBeGreaterThan(1.1);
    const [layerX, layerY] = layerPoint(container, 300, 200);
    expect(layerX).toBeCloseTo(x, 6);
    expect(layerY).toBeCloseTo(y, 6);
    const during = tilesById(container);
    for (const [id, tile] of before) {
      expect(during.get(id)).toBe(tile);
    }
    expect(new Map(Array.from(sizes(during)).filter(([id]) => before.has(id)))).toEqual(sizesBefore);
    grid.destroy();
  });

  it("settles once the wheel stops, at a row height from 100 to 300 px, its rows' shortest and tallest scaled with it", () => {
    vi.useFakeTimers();
    const onRowHeightChange = vi.fn();
    const { container, grid } = createGrid({ onRowHeightChange });
    const items = thumbnailItems(400);
    grid.setBrowseContent({ visibleItems: items });

    zoomBy(container, 3, 300, 200);
    expect(onRowHeightChange.mock.calls).toEqual([[243]]);
    expect(rowsLayer(container).style.transform).toBe("");
    expectShownRows(container, items, createVirtualizerState(items, 800, 243));
    for (const row of rows(container)) {
      expect(Number.parseFloat(row.style.height)).toBeGreaterThanOrEqual(243 * 0.625);
      expect(Number.parseFloat(row.style.height)).toBeLessThanOrEqual(243 * 1.5);
    }

    zoomBy(container, -20, 300, 200);
    expect(onRowHeightChange).toHaveBeenLastCalledWith(100);
    expectShownRows(container, items, createVirtualizerState(items, 800, 100));

    zoomBy(container, 20, 300, 200);
    expect(onRowHeightChange).toHaveBeenLastCalledWith(300);
    expectShownRows(container, items, createVirtualizerState(items, 800, 300));
    grid.destroy();
  });

  it("starts from the row height it was given, and leaves a plain wheel to scroll the grid", () => {
    vi.useFakeTimers();
    const onRowHeightChange = vi.fn();
    const { container, grid } = createGrid({ rowHeight: 220, onRowHeightChange });
    const items = thumbnailItems(400);
    grid.setBrowseContent({ visibleItems: items });
    expectShownRows(container, items, createVirtualizerState(items, 800, 220));

    const event = wheelOver(container, { deltaY: -100, clientX: 300, clientY: 200, ctrlKey: false });
    vi.advanceTimersByTime(1000);

    expect(event.defaultPrevented).toBe(false);
    expect(rowsLayer(container).style.transform).toBe("");
    expect(onRowHeightChange).not.toHaveBeenCalled();
    grid.destroy();
  });

  it("starts a gesture with the rows that fill the view at the smallest scale it can reach", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid({ rowHeight: 300 });
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    scrollTo(container, 3000);
    const extent = () => spacerHeight(container, "top") + rows(container).reduce((sum, row) => sum + Number.parseFloat(row.style.height) + 1, 0);
    expect(spacerHeight(container, "top")).toBeGreaterThan(1800);
    expect(extent()).toBeLessThan(4800);

    wheelOver(container, { deltaY: 100, clientX: 300, clientY: 200 });

    // At a third of the size, the view shows three views' height of rows, from as far as two views above it.
    expect(spacerHeight(container, "top")).toBeLessThanOrEqual(3000 - 2 * VIEWPORT_HEIGHT);
    expect(extent()).toBeGreaterThanOrEqual(3000 + 3 * VIEWPORT_HEIGHT);
    grid.destroy();
  });

  it("scales the rows around a pinch's center, pans them as it moves, claiming the moves, and settles as a finger lifts", () => {
    const onRowHeightChange = vi.fn();
    const { container, grid } = createGrid({ onRowHeightChange });
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });

    touchOver(container, "touchstart", [[300, 200]]);
    touchOver(container, "touchstart", [[300, 200], [400, 200]]);
    const [x, y] = [350, 200 - spacerHeight(container, "top")];
    const move = touchOver(container, "touchmove", [[275, 210], [425, 210]]);

    expect(move.defaultPrevented).toBe(true);
    expect(layerView(container).scale).toBe(1.5);
    const [layerX, layerY] = layerPoint(container, 350, 210);
    expect(layerX).toBeCloseTo(x, 6);
    expect(layerY).toBeCloseTo(y, 6);
    expect(onRowHeightChange).not.toHaveBeenCalled();

    touchOver(container, "touchend", [[425, 210]]);
    expect(onRowHeightChange.mock.calls).toEqual([[240]]);
    expect(rowsLayer(container).style.transform).toBe("");
    grid.destroy();
  });

  it("leaves one finger's moves to the browser's scroll", () => {
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });

    touchOver(container, "touchstart", [[300, 200]]);
    const move = touchOver(container, "touchmove", [[300, 100]]);

    expect(move.defaultPrevented).toBe(false);
    expect(rowsLayer(container).style.transform).toBe("");
    grid.destroy();
  });

  it("changes nothing in the rows while a gesture lasts, and shows what came during it when it settles, in its one reflow", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    const items = thumbnailItems(400);
    grid.setBrowseContent({ visibleItems: items });
    scrollTo(container, 1500);
    // A tile at the top of where the grid scrolls to during the gesture, which the pointer is over when it settles.
    const layout = createVirtualizerState(items, 800, 160);
    const row = layout.offsetIndex.rowTopOffsets.findIndex((top) => top >= 2500);
    const patchedId = items[layout.rows[row]!.tiles[0]!.itemIndex]!.id;
    const badge = () => tilesById(container).get(patchedId)!.querySelector(".library-grid-tile-badge");
    wheelOver(container, { deltaY: -100, clientX: 5, clientY: layout.offsetIndex.rowTopOffsets[row]! - 2500 + 5 });
    vi.advanceTimersByTime(20);
    const observer = new MutationObserver(() => {});
    observer.observe(rowsLayer(container), { subtree: true, childList: true, attributes: true, characterData: true });
    const topSpacer = spacerHeight(container, "top");

    // A patch, a narrower panel, and a scroll far enough to change the rows shown.
    const patched = items.map((entry) => (entry.id === patchedId ? { ...entry, isFavorite: true } : entry));
    grid.setBrowseContent({ visibleItems: patched, resetScroll: false });
    resizeTo(560);
    scrollTo(container, 2500);

    // Only the gesture's scale and move change, on the rows' layer's style; no row comes or goes.
    const changed = observer
      .takeRecords()
      .filter((record) => !(record.target === rowsLayer(container) && record.type === "attributes" && record.attributeName === "style"));
    observer.disconnect();
    expect(changed).toEqual([]);
    expect(spacerHeight(container, "top")).toBe(topSpacer);
    expect(badge()).toBeNull();

    vi.advanceTimersByTime(1000);
    expect(badge()).not.toBeNull();
    expectShownRows(container, patched, createVirtualizerState(patched, 560, 184));
    grid.destroy();
  });

  it("starts at the top with a new window that came during a gesture", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    scrollTo(container, 1500);
    const other = thumbnailItems(400).reverse();

    wheelOver(container, { deltaY: -100, clientX: 10, clientY: 10 });
    grid.setBrowseContent({ visibleItems: other });
    vi.advanceTimersByTime(1000);

    expect(scroller(container).scrollTop).toBe(0);
    expectShownRows(container, other, createVirtualizerState(other, 800, 184));
    grid.destroy();
  });

  it("keeps the tile under the pointer at its vertical place through the reflow", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    const items = thumbnailItems(400);
    grid.setBrowseContent({ visibleItems: items });
    scrollTo(container, 1500);
    // The pointer over a row's first tile, a quarter of the way down it.
    const before = createVirtualizerState(items, 800, 160);
    const row = before.offsetIndex.rowTopOffsets.findIndex((top) => top >= 1700);
    const anchorItem = before.rows[row]!.tiles[0]!.itemIndex;
    const clientY = before.offsetIndex.rowTopOffsets[row]! - 1500 + before.rows[row]!.rowHeight / 4;

    zoomBy(container, 3, 5, clientY);

    const after = createVirtualizerState(items, 800, 243);
    const afterRow = findRowIndexForItem(after.rows, anchorItem);
    const top = after.offsetIndex.rowTopOffsets[afterRow]! - scroller(container).scrollTop;
    expect(top + after.rows[afterRow]!.rowHeight / 4).toBeCloseTo(clientY, 6);
    expect(tilesById(container).has(`item-${anchorItem}`)).toBe(true);
    grid.destroy();
  });

  it("moves each tile in view from its scaled place to its new one, and fades in the tiles coming into view", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    const items = thumbnailItems(400);
    grid.setBrowseContent({ visibleItems: items });
    const before = createVirtualizerState(items, 800, 160);

    zoomBy(container, -3, 10, 10);

    // In view now: the tiles of the rows that start above the view's bottom.
    const after = createVirtualizerState(items, 800, 105);
    const inView = after.rows
      .filter((row, index) => after.offsetIndex.rowTopOffsets[index]! < VIEWPORT_HEIGHT)
      .flatMap((row) => row.tiles.map((tile) => `item-${tile.itemIndex}`));
    const moves = tileMoves(container);
    expect(Array.from(moves.keys()).sort()).toEqual(inView.sort());
    const kinds = Array.from(moves.values()).map((animations) => {
      expect(animations).toHaveLength(1);
      expect(animations[0]!.effect!.getTiming()).toMatchObject({ duration: TILE_MOVE_MS });
      return "transform" in keyframesOf(animations[0]!)[0]! ? "move" : "fade";
    });
    expect(kinds).toContain("move");
    expect(kinds).toContain("fade");

    // The first tile scaled around the pointer at (10, 10), and keeps the pointer as far down it, a few pixels down.
    const scale = 1.15 ** -3;
    const from = { left: 10 * (1 - scale), top: 10 * (1 - scale), width: before.rows[0]!.tiles[0]!.tileWidth * scale, height: before.rows[0]!.rowHeight * scale };
    const to = { width: after.rows[0]!.tiles[0]!.tileWidth, height: after.rows[0]!.rowHeight };
    expect(scroller(container).scrollTop).toBe(0);
    const [start, end] = keyframesOf(moves.get("item-0")![0]!);
    const moved = /^translate\((\S+)px, (\S+)px\) scale\((\S+), (\S+)\)$/.exec(String(start!.transform))!;
    expect(Number(moved[1])).toBeCloseTo(from.left, 6);
    expect(Number(moved[2])).toBeCloseTo(from.top, 6);
    expect(Number(moved[3])).toBeCloseTo(from.width / to.width, 6);
    expect(Number(moved[4])).toBeCloseTo(from.height / to.height, 6);
    expect(start!.transformOrigin).toBe("0 0");
    expect(end!.transform).toBe("none");
    expect(moves.get("item-0")![0]!.effect!.getTiming().easing).toBe(TILE_MOVE_EASING);
    grid.destroy();
  });

  it("puts the tiles in their new places at once with reduced motion, still at the new row height", () => {
    vi.useFakeTimers();
    stubMatchingMediaQuery(restores, "prefers-reduced-motion: reduce");
    const onRowHeightChange = vi.fn();
    const { container, grid } = createGrid({ onRowHeightChange });
    const items = thumbnailItems(400);
    grid.setBrowseContent({ visibleItems: items });

    zoomBy(container, -3, 10, 10);

    expect(onRowHeightChange.mock.calls).toEqual([[105]]);
    expectShownRows(container, items, createVirtualizerState(items, 800, 105));
    expect(tileMoves(container).size).toBe(0);
    grid.destroy();
  });

  it("keeps the tile and image elements of the items that stay in view through the reflow", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    scrollTo(container, 1500);
    const tilesBefore = tilesById(container);
    const imagesBefore = new Map(Array.from(tilesBefore, ([id, tile]) => [id, tile.querySelector("img")]));

    zoomBy(container, 3, 300, 200);

    const tilesAfter = tilesById(container);
    const kept = Array.from(tilesAfter.keys()).filter((id) => tilesBefore.has(id));
    expect(kept.length).toBeGreaterThan(10);
    for (const id of kept) {
      expect(tilesAfter.get(id)).toBe(tilesBefore.get(id));
      expect(tilesAfter.get(id)!.querySelector("img")).toBe(imagesBefore.get(id));
    }
    grid.destroy();
  });

  it("finishes the tiles' moves before a new gesture starts", () => {
    vi.useFakeTimers();
    const { container, grid } = createGrid();
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    zoomBy(container, 3, 300, 200);
    const moving = Array.from(tileMoves(container).values()).flat();
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.every((animation) => animation.playState === "running")).toBe(true);

    wheelOver(container, { deltaY: -100, clientX: 300, clientY: 200 });

    expect(moving.every((animation) => animation.playState === "finished")).toBe(true);
    grid.destroy();
  });

  it("reports the grid's coverage at the scroll position a settle lands on, never at the one from before it", () => {
    vi.useFakeTimers();
    const reports: LibraryGridCoverage[] = [];
    const { container, grid } = createGrid({ rowHeight: 300, onCoverage: (coverage) => reports.push(coverage) });
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });
    scrollTo(container, 12000);

    // Zooming out far down the grid lands it much nearer the top of a much shorter layout.
    zoomBy(container, -20, 300, 200);

    const settled = grid.measureCoverage()!;
    expect(settled.scrollTop).toBeLessThan(3000);
    expect(reports.at(-1)).toEqual(settled);
    const atNewLayout = reports.filter((report) => report.extentHeight === settled.extentHeight);
    expect(atNewLayout.every((report) => report.scrollTop === settled.scrollTop)).toBe(true);
    grid.destroy();
  });

  it("drops a gesture under way when the grid goes, leaving it no timer or frame and setting no row height", () => {
    vi.useFakeTimers();
    const onRowHeightChange = vi.fn();
    const { container, grid } = createGrid({ onRowHeightChange });
    grid.setBrowseContent({ visibleItems: thumbnailItems(400) });

    wheelOver(container, { deltaY: -100, clientX: 300, clientY: 200 });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    grid.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);

    expect(onRowHeightChange).not.toHaveBeenCalled();
  });
});
