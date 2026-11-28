// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, within } from "@testing-library/preact";
import { useRef } from "preact/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../state/appServices";
import { AppContext } from "../../ui/appContext";
import { ContextMenuHost, Menu, useMenuSurface } from "../../ui/Menu";
import { createContextMenu, type ContextMenuView, type MenuItem } from "../../ui/menuModel";
import { menuItemIn as item, menuParts as parts } from "./pageHarness";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the menu", () => {
  it("lists its items in groups with a rule between them, leaving out an empty group", () => {
    const pick = () => {};
    const { container } = render(
      <Menu
        id="test-menu"
        class="test-place"
        groups={[
          [
            { label: "One", icon: "star", onPick: pick },
            { label: "Two", icon: "tag", onPick: pick }
          ],
          [],
          [{ label: "Three", icon: "delete_forever", onPick: pick }]
        ]}
        onClose={() => {}}
      />
    );
    const menu = container.querySelector<HTMLElement>("#test-menu")!;
    expect(menu.className).toBe("menu test-place");
    expect(parts(menu)).toEqual(["One", "Two", "—", "Three"]);
    expect(menu.querySelectorAll("hr.menu-rule")).toHaveLength(1);
  });

  it("leaves an item with an icon its label as its name", () => {
    const { container } = render(<Menu groups={[[{ label: "Rate…", icon: "star", onPick: () => {} }]]} onClose={() => {}} />);
    const menu = container.querySelector<HTMLElement>(".menu")!;
    expect(within(menu).getByRole("button", { name: "Rate…" })).toBe(item(menu, "Rate…"));
  });

  it("disables an item with its reason as its tooltip", () => {
    const groups: MenuItem[][] = [
      [{ label: "Rename", icon: "edit", onPick: () => {}, disabledReason: "Pick one item to rename" }],
      [{ label: "Delete", icon: "delete_forever", onPick: () => {}, danger: true }]
    ];
    const { container } = render(<Menu groups={groups} onClose={() => {}} />);
    const menu = container.querySelector<HTMLElement>(".menu")!;
    expect([item(menu, "Rename").disabled, item(menu, "Rename").title]).toEqual([true, "Pick one item to rename"]);
    expect([item(menu, "Delete").disabled, item(menu, "Delete").title]).toEqual([false, ""]);
  });

  it("closes before a picked item's action runs, and a disabled item does nothing", () => {
    const happened: string[] = [];
    const groups: MenuItem[][] = [
      [
        { label: "Rate…", icon: "star", onPick: () => happened.push("rate") },
        { label: "Rename", icon: "edit", onPick: () => happened.push("rename"), disabledReason: "Pick one item to rename" }
      ]
    ];
    const { container } = render(<Menu groups={groups} onClose={() => happened.push("close")} />);
    const menu = container.querySelector<HTMLElement>(".menu")!;

    fireEvent.click(item(menu, "Rate…"));
    expect(happened).toEqual(["close", "rate"]);
    fireEvent.click(item(menu, "Rename"));
    expect(happened).toEqual(["close", "rate"]);
  });

  it("gives a picked item's action that item's own button", () => {
    const picked: Array<[string, HTMLElement]> = [];
    const groups: MenuItem[][] = [
      [
        { label: "Copy name", icon: "content_copy", onPick: (element) => picked.push(["name", element]) },
        { label: "Copy path", icon: "content_copy", onPick: (element) => picked.push(["path", element]) }
      ]
    ];
    const { container } = render(<Menu groups={groups} onClose={() => {}} />);
    const menu = container.querySelector<HTMLElement>(".menu")!;

    fireEvent.click(item(menu, "Copy path"));
    expect(picked.map(([which]) => which)).toEqual(["path"]);
    expect(picked[0]![1]).toBe(item(menu, "Copy path"));
  });
});

describe("the context menu", () => {
  /**
   * The context menu's host, rendered on its own, with a menu of one item open on `target`, whose `onClose` records
   * whether the user closed it.
   */
  function openOn(target?: Element) {
    const contextMenu = createContextMenu();
    render(
      <AppContext.Provider value={{ contextMenu } as unknown as AppServices}>
        <ContextMenuHost />
      </AppContext.Provider>
    );
    const groups = [[{ label: "Rate…", icon: "star", onPick: () => {} }]];
    const onClose = vi.fn((_byUser: boolean) => {});
    const open = () => act(() => contextMenu.open({ point: { x: 10, y: 10 }, groups, target, onClose }));
    open();
    return { contextMenu, open, onClose };
  }

  it("closes on its own on a scroll outside it, a resize, and the browser tab hiding, but not on a scroll inside it", () => {
    const list = document.body.appendChild(document.createElement("div"));
    const { contextMenu, open, onClose } = openOn();
    fireEvent.scroll(document.querySelector("#context-menu .menu")!);
    expect(contextMenu.isOpen.peek()).toBe(true);
    act(() => void fireEvent.scroll(list));
    expect(contextMenu.isOpen.peek()).toBe(false);

    open();
    act(() => void fireEvent(window, new Event("resize")));
    expect(contextMenu.isOpen.peek()).toBe(false);

    open();
    act(() => void fireEvent(document, new Event("visibilitychange")));
    expect(contextMenu.isOpen.peek()).toBe(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void fireEvent(document, new Event("visibilitychange")));
    expect(contextMenu.isOpen.peek()).toBe(false);
    // None of them is the user's close.
    expect(onClose.mock.calls).toEqual([[false], [false], [false]]);
    list.remove();
  });

  it("is the user's close on Escape, a press outside it, and a pick", () => {
    const { contextMenu, open, onClose } = openOn();
    act(() => void fireEvent.keyDown(document, { key: "Escape" }));
    expect(contextMenu.isOpen.peek()).toBe(false);

    open();
    act(() => void fireEvent.pointerDown(document.body, { pointerType: "mouse", button: 0 }));
    expect(contextMenu.isOpen.peek()).toBe(false);

    open();
    act(() => void fireEvent.click(item(document.querySelector<HTMLElement>("#context-menu .menu")!, "Rate…")));
    expect(contextMenu.isOpen.peek()).toBe(false);
    expect(onClose.mock.calls).toEqual([[true], [true], [true]]);
  });

  it("shows inside the open dialog its element is in, taking Escape before it, and leaves Escape to a dialog it isn't in", () => {
    const dialog = document.body.appendChild(document.createElement("dialog"));
    dialog.setAttribute("open", "");
    const row = dialog.appendChild(document.createElement("div"));
    const dialogKeys = vi.fn();
    dialog.addEventListener("keydown", dialogKeys);
    const { contextMenu } = openOn(row);
    expect(dialog.contains(document.getElementById("context-menu"))).toBe(true);
    act(() => void fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(contextMenu.isOpen.peek()).toBe(false);
    expect(dialogKeys).not.toHaveBeenCalled();

    act(() => contextMenu.open({ point: { x: 10, y: 10 }, groups: [[{ label: "Rate…", icon: "star", onPick: () => {} }]] }));
    expect(dialog.contains(document.getElementById("context-menu"))).toBe(false);
    act(() => void fireEvent.keyDown(dialog, { key: "Escape" }));
    expect(contextMenu.isOpen.peek()).toBe(true);
    expect(dialogKeys).toHaveBeenCalledTimes(1);
    dialog.remove();
  });

  it("tints the element it acts on while it is open", () => {
    const row = document.body.appendChild(document.createElement("div"));
    const { contextMenu } = openOn(row);
    expect(row.classList.contains("is-menu-target")).toBe(true);
    act(() => contextMenu.close());
    expect(row.classList.contains("is-menu-target")).toBe(false);
    row.remove();
  });
});

describe("a menu surface", () => {
  const GROUPS = [[{ label: "Copy name", icon: "content_copy", onPick: () => {} }]];

  /** An element with a menu of one item, opened through `open` when it is given. */
  function Surface({ open }: { open?: (view: ContextMenuView) => void }) {
    const element = useRef<HTMLDivElement>(null);
    useMenuSurface(element, () => GROUPS, { open });
    return <div id="surface" ref={element}>Name</div>;
  }

  /** Renders the surface and opens its menu, as a press on it does. */
  function pressSurface(open?: (view: ContextMenuView) => void) {
    const contextMenu = createContextMenu();
    render(
      <AppContext.Provider value={{ contextMenu } as unknown as AppServices}>
        <Surface open={open} />
      </AppContext.Provider>
    );
    const surface = document.getElementById("surface")!;
    act(() => contextMenu.surfaceAt(surface)!.open({ x: 5, y: 6 }));
    return { contextMenu, surface };
  }

  it("opens its menu on its element, at the press, through the context menu", () => {
    const { contextMenu, surface } = pressSurface();
    expect(contextMenu.view.peek()).toMatchObject({ point: { x: 5, y: 6 }, target: surface, groups: GROUPS });
  });

  it("opens it through its own open in place of the context menu's, when it is given one", () => {
    const open = vi.fn((_view: ContextMenuView) => {});
    const { contextMenu, surface } = pressSurface(open);
    expect(open.mock.calls).toEqual([[{ point: { x: 5, y: 6 }, target: surface, groups: GROUPS }]]);
    expect(contextMenu.isOpen.peek()).toBe(false);
  });
});
