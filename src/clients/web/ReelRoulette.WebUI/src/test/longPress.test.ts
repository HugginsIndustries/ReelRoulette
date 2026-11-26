// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MOVE_PX, LONG_PRESS_MS, listenForLongPress, type LongPress } from "../ui/longPress";

let press: LongPress;
/** Each long press that counted: what it was on, and where it began. */
let pressed: string[];

function tile(itemId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-item-id="${itemId}"] img`)!;
}

function gap(): HTMLElement {
  return document.querySelector<HTMLElement>(".gap")!;
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

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <div class="tile" data-item-id="item-1"><img alt=""></div>
    <div class="tile" data-item-id="item-2"><img alt=""></div>
    <p class="gap"></p>`;
  pressed = [];
  press = listenForLongPress(document, {
    pressAt: (target) => target.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null,
    onLongPress: (itemId, point) => pressed.push(`${itemId} at ${point.x},${point.y}`)
  });
});

afterEach(() => {
  press.dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("long press", () => {
  it("counts a finger resting for half a second where it began, and uses up the click it ends with", () => {
    down(tile("item-1"), { x: 30, y: 40 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(pressed).toEqual([]);
    move(tile("item-1"), 32, 41);
    vi.advanceTimersByTime(1);
    expect(pressed).toEqual(["item-1 at 30,40"]);

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

  it("counts a pen, but not a mouse or a pen's other button, and says whether the last press was a mouse's", () => {
    expect(press.byMouse()).toBe(true);
    down(tile("item-1"), { pointerType: "pen" });
    expect(press.byMouse()).toBe(false);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1 at 10,10"]);

    down(tile("item-1"), { pointerType: "mouse" });
    expect(press.byMouse()).toBe(true);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    down(tile("item-2"), { pointerType: "pen", button: 2 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1 at 10,10"]);
  });

  it("is cancelled by moving as far as a scroll or drag, but not by a finger's tremor", () => {
    down(tile("item-1"), { x: 10, y: 10 });
    move(tile("item-1"), 10 + LONG_PRESS_MOVE_PX - 1, 10);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1 at 10,10"]);

    down(tile("item-2"), { x: 10, y: 10 });
    move(tile("item-2"), 10, 10 + LONG_PRESS_MOVE_PX);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1 at 10,10"]);
  });

  it("is cancelled by a second finger landing, as for a pinch", () => {
    down(tile("item-1"), { pointerId: 1 });
    vi.advanceTimersByTime(200);
    down(tile("item-2"), { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });

  it("never starts from a second finger, as in a pinch whose first finger started no press", () => {
    // The first finger landed where a long press does nothing.
    down(gap(), { pointerId: 1 });
    down(tile("item-1"), { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
    fireEvent.pointerUp(tile("item-1"), { pointerType: "touch", pointerId: 2 });
    fireEvent.pointerUp(gap(), { pointerType: "touch", pointerId: 1 });

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

  it("starts only where it does something", () => {
    down(gap());
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual([]);
  });

  it("hears a press whose events the page stops", () => {
    tile("item-1").addEventListener("pointerdown", (event) => event.stopPropagation());
    down(tile("item-1"));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pressed).toEqual(["item-1 at 10,10"]);
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
