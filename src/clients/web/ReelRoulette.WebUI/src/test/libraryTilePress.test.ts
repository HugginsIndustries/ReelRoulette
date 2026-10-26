// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MOVE_PX, LONG_PRESS_MS, listenForTilePress, type TilePress } from "../library/libraryTilePress";

let host: HTMLElement;
let press: TilePress;
let pressed: string[];
/** Each menu a right-click opened: its tile's item id and the point. */
let menus: string[];

function tile(itemId: string): HTMLElement {
  return host.querySelector<HTMLElement>(`[data-item-id="${itemId}"] img`)!;
}

/** A pointer landing on `target`: the first finger down, which the browser calls primary, unless `isPrimary` is false. */
function down(
  target: Element,
  init: { pointerType?: string; pointerId?: number; isPrimary?: boolean; x?: number; y?: number; button?: number } = {}
): void {
  fireEvent.pointerDown(target, {
    pointerType: init.pointerType ?? "touch",
    pointerId: init.pointerId ?? 1,
    isPrimary: init.isPrimary ?? true,
    button: init.button ?? 0,
    clientX: init.x ?? 10,
    clientY: init.y ?? 10
  });
}

function move(target: Element, x: number, y: number, pointerId = 1): void {
  fireEvent.pointerMove(target, { pointerType: "touch", pointerId, clientX: x, clientY: y });
}

/** Whether a page would show its own menu for this press: true when nothing stopped it. */
function browserMenuOpens(target: Element): boolean {
  return fireEvent.contextMenu(target);
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  host.innerHTML = `
    <div class="tile" data-item-id="item-1"><img alt=""></div>
    <div class="tile" data-item-id="item-2"><img alt=""></div>
    <p class="gap"></p>`;
  document.body.append(host);
  pressed = [];
  menus = [];
  press = listenForTilePress(host, {
    tileItemId: (target) => (target instanceof Element ? target.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null : null),
    onLongPress: (itemId) => pressed.push(itemId),
    onMenu: (itemId, point) => menus.push(`${itemId} at ${point.x},${point.y}`)
  });
});

afterEach(() => {
  press.dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("tile long press", () => {
  it("counts a finger resting on a tile for half a second, and uses up the click it ends with", () => {
    down(tile("item-1"));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(pressed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(pressed).toEqual(["item-1"]);

    fireEvent.pointerUp(tile("item-1"), { pointerType: "touch", pointerId: 1 });
    expect(press.takeClick()).toBe(true);
    expect(press.takeClick()).toBe(false);
  });

  it("leaves a tap's click alone", () => {
    down(tile("item-1"));
    vi.advanceTimersByTime(100);
    fireEvent.pointerUp(tile("item-1"), { pointerType: "touch", pointerId: 1 });
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(pressed).toEqual([]);
    expect(press.takeClick()).toBe(false);
  });

  it("counts a pen, but not a mouse, whose right-click opens the tile's menu at the pointer in place of the browser's", () => {
    down(tile("item-1"), { pointerType: "mouse" });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
    down(tile("item-1"), { pointerType: "mouse", button: 2 });
    expect(fireEvent.contextMenu(tile("item-1"), { clientX: 40, clientY: 50 })).toBe(false);
    expect(menus).toEqual(["item-1 at 40,50"]);
    // Off a tile, the browser's menu stays.
    down(host.querySelector(".gap")!, { pointerType: "mouse", button: 2 });
    expect(browserMenuOpens(host.querySelector(".gap")!)).toBe(true);
    expect(menus).toHaveLength(1);

    down(tile("item-2"), { pointerType: "pen" });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-2"]);
  });

  it("keeps the browser's menu off a tile pressed with a finger, before and after the press counts, and opens none of its own", () => {
    down(tile("item-1"));
    expect(browserMenuOpens(tile("item-1"))).toBe(false);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(browserMenuOpens(tile("item-1"))).toBe(false);
    expect(browserMenuOpens(host.querySelector(".gap")!)).toBe(true);
    expect(menus).toEqual([]);
  });

  it("is cancelled by moving as far as a scroll or drag, but not by a finger's tremor", () => {
    down(tile("item-1"), { x: 10, y: 10 });
    move(tile("item-1"), 10 + LONG_PRESS_MOVE_PX - 1, 10);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1"]);

    down(tile("item-2"), { x: 10, y: 10 });
    move(tile("item-2"), 10, 10 + LONG_PRESS_MOVE_PX);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1"]);
  });

  it("is cancelled by a second finger landing, as for a pinch", () => {
    down(tile("item-1"), { pointerId: 1 });
    vi.advanceTimersByTime(200);
    down(tile("item-2"), { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });

  it("never starts from a second finger, as in a pinch whose first finger started no press", () => {
    // The first finger landed off a tile.
    down(host.querySelector(".gap")!, { pointerId: 1 });
    down(tile("item-1"), { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
    fireEvent.pointerUp(tile("item-1"), { pointerType: "touch", pointerId: 2 });
    fireEvent.pointerUp(host.querySelector(".gap")!, { pointerType: "touch", pointerId: 1 });

    // The first finger's press was cancelled by moving.
    down(tile("item-1"), { pointerId: 3, x: 10, y: 10 });
    move(tile("item-1"), 10, 10 + LONG_PRESS_MOVE_PX, 3);
    down(tile("item-2"), { pointerId: 4, isPrimary: false });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });

  it("is cancelled by a scroll the browser takes over, or lifting the finger first", () => {
    down(tile("item-1"));
    fireEvent.pointerCancel(tile("item-1"), { pointerType: "touch", pointerId: 1 });
    down(tile("item-2"), { pointerId: 2 });
    fireEvent.pointerUp(tile("item-2"), { pointerType: "touch", pointerId: 2 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });

  it("starts nowhere but on a tile", () => {
    down(host.querySelector(".gap")!);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });

  it("forgets a long press that ended without a click, so the next tap's click goes through", () => {
    down(tile("item-1"));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    // The finger moved off after the press counted, so no click came.
    fireEvent.pointerCancel(tile("item-1"), { pointerType: "touch", pointerId: 1 });

    down(tile("item-2"));
    fireEvent.pointerUp(tile("item-2"), { pointerType: "touch", pointerId: 1 });
    expect(press.takeClick()).toBe(false);
  });

  it("stops listening when disposed, leaving no press to count", () => {
    down(tile("item-1"));
    press.dispose();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    down(tile("item-2"));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });
});
