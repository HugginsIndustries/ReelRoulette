// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS } from "../ui/longPress";
import { createContextMenu, type ContextMenu } from "../ui/menuModel";
import { listenForMenus } from "../ui/menuOpener";

let contextMenu: ContextMenu;
let stop: () => void;
/** Each menu a surface opened: what it was on, and the point. */
let opened: string[];

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;

/**
 * A mouse's right-click on `target`: the right button's press, then `contextmenu`. Answers whether the browser's own
 * menu would open.
 */
function rightClick(target: Element, x = 100, y = 100): boolean {
  fireEvent.pointerDown(target, { pointerType: "mouse", pointerId: 1, isPrimary: true, button: 2, clientX: x, clientY: y });
  return fireEvent.contextMenu(target, { button: 2, clientX: x, clientY: y });
}

function fingerDown(target: Element, x = 10, y = 10): void {
  fireEvent.pointerDown(target, { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y });
}

/**
 * A finger resting on `target` long enough, then lifting, with the click a browser sends after it. Answers whether the
 * page heard the click.
 */
function longPress(target: Element, x = 10, y = 10): boolean {
  fingerDown(target, x, y);
  vi.advanceTimersByTime(LONG_PRESS_MS);
  fireEvent.pointerUp(target, { pointerType: "touch", pointerId: 1, button: 0, clientX: x, clientY: y });
  return clickHeard(target);
}

function clickHeard(target: Element): boolean {
  let heard = false;
  const hear = () => (heard = true);
  target.addEventListener("click", hear);
  fireEvent.click(target);
  target.removeEventListener("click", hear);
  return heard;
}

/**
 * Gives `element` a menu that opens on its `[data-name]` part a press lands in, and none elsewhere, counting the buttons
 * `pressOn` names as part of it.
 */
function surface(element: Element, pressOn?: string): () => void {
  return contextMenu.addSurface({
    element,
    menuAt: (target) => target.closest("[data-name]")?.getAttribute("data-name") ?? null,
    open: (name, point) => opened.push(`${name} at ${point.x},${point.y}`),
    pressOn
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <div id="list">
      <div data-name="row">
        <span class="row-text">Row</span>
        <div id="inner" data-name="chip"><span class="chip-text">Chip</span></div>
        <button type="button">Edit</button>
        <button id="name" type="button"><span class="name-text">Name</span></button>
        <span class="drag-handle"></span>
        <div class="rating"><span class="star"></span></div>
        <div class="panel-handle"></div>
        <span class="loop-mark"></span>
      </div>
      <p class="gap"></p>
    </div>
    <p id="plain">Text</p>
    <button id="lone" type="button">Lone</button>
    <input id="text" type="text">
    <input id="search" type="search">
    <input id="number" type="number">
    <input id="date" type="date">
    <input id="check" type="checkbox">
    <select id="choice"><option>One</option></select>
    <textarea id="area"></textarea>`;
  opened = [];
  contextMenu = createContextMenu();
  stop = listenForMenus(contextMenu);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("the browser's own menu", () => {
  it("shows only in text fields", () => {
    for (const id of ["text", "search", "number", "area"]) {
      expect([id, rightClick($(`#${id}`))]).toEqual([id, true]);
    }
    for (const id of ["plain", "lone", "date", "check", "choice", "list"]) {
      expect([id, rightClick($(`#${id}`))]).toEqual([id, false]);
    }
  });

  it("stays off after a finger's press, as Chrome on Android sends `contextmenu` for one", () => {
    fingerDown($("#plain"));
    expect(fireEvent.contextMenu($("#plain"))).toBe(false);
  });
});

describe("context menus", () => {
  it("open at a mouse's right-click anywhere on a surface, its buttons included, and nowhere else", () => {
    surface($("#list"));
    rightClick($(".row-text"), 30, 40);
    rightClick($("#list button"), 50, 60);
    rightClick($(".gap"));
    rightClick($("#plain"));
    expect(opened).toEqual(["row at 30,40", "row at 50,60"]);
  });

  it("open the innermost surface's menu", () => {
    surface($("#list"));
    surface($("#inner"));
    rightClick($(".chip-text"));
    rightClick($(".row-text"));
    expect(opened).toEqual(["chip at 100,100", "row at 100,100"]);
  });

  it("open at a long press with a finger, where it began, and the click it ends with reaches nothing", () => {
    surface($("#list"));
    expect(longPress($(".row-text"), 20, 30)).toBe(false);
    expect(opened).toEqual(["row at 20,30"]);
    // The `contextmenu` Chrome on Android sends for it opens nothing more.
    expect(fireEvent.contextMenu($(".row-text"), { clientX: 20, clientY: 30 })).toBe(false);
    expect(opened).toHaveLength(1);

    // The next tap's click goes through.
    fingerDown($(".row-text"));
    fireEvent.pointerUp($(".row-text"), { pointerType: "touch", pointerId: 1 });
    expect(clickHeard($(".row-text"))).toBe(true);
    expect(opened).toHaveLength(1);
  });

  it("open at no long press on a button, a drag handle, the rating's stars, the panel's resize handle, or a loop marker, whose clicks go through", () => {
    surface($("#list"));
    for (const target of [$("#list button"), $(".drag-handle"), $(".star"), $(".panel-handle"), $(".loop-mark")]) {
      expect(longPress(target)).toBe(true);
    }
    expect(longPress($(".gap"))).toBe(true);
    expect(opened).toEqual([]);
  });

  it("open at a long press on a button the surface counts as part of it, but on no other button", () => {
    surface($("#list"), "#name");
    expect(longPress($(".name-text"), 20, 30)).toBe(false);
    expect(longPress($("#list button"))).toBe(true);
    expect(longPress($(".drag-handle"))).toBe(true);
    expect(opened).toEqual(["row at 20,30"]);
  });

  it("open nothing once their surface is gone, or the opener stops", () => {
    const remove = surface($("#list"));
    remove();
    rightClick($(".row-text"));
    longPress($(".row-text"));
    expect(opened).toEqual([]);

    surface($("#list"));
    stop();
    expect(rightClick($(".row-text"))).toBe(true);
    expect(longPress($(".row-text"))).toBe(true);
    expect(opened).toEqual([]);
  });
});
