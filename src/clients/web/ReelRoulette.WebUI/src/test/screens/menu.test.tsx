// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../state/appServices";
import { AppContext } from "../../ui/appContext";
import { ContextMenuHost, Menu } from "../../ui/Menu";
import { createContextMenu, type MenuItem } from "../../ui/menuModel";
import { menuIcons, menuItemIn as item, menuParts as parts } from "./pageHarness";

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

  it("draws each item's icon at its left, which leaves the item's name its label", () => {
    const { container } = render(<Menu groups={[[{ label: "Rate…", icon: "star", onPick: () => {} }]]} onClose={() => {}} />);
    const menu = container.querySelector<HTMLElement>(".menu")!;
    expect(menuIcons(menu)).toEqual(["star Rate…"]);
    expect(item(menu, "Rate…").firstElementChild?.className).toBe("material-symbol-icon");
    expect(within(menu).getByRole("button", { name: "Rate…" })).toBe(item(menu, "Rate…"));
  });

  it("marks a destructive item red, and disables an item with its reason as its tooltip", () => {
    const groups: MenuItem[][] = [
      [{ label: "Rename", icon: "edit", onPick: () => {}, disabledReason: "Pick one item to rename" }],
      [{ label: "Delete", icon: "delete_forever", onPick: () => {}, danger: true }]
    ];
    const { container } = render(<Menu groups={groups} onClose={() => {}} />);
    const menu = container.querySelector<HTMLElement>(".menu")!;
    expect([item(menu, "Rename").disabled, item(menu, "Rename").title]).toEqual([true, "Pick one item to rename"]);
    expect([item(menu, "Delete").disabled, item(menu, "Delete").title, item(menu, "Delete").className]).toEqual([false, "", "menu-danger"]);
    expect(item(menu, "Rename").className).toBe("");
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
});

describe("the context menu", () => {
  /** The context menu's host, rendered on its own, with a menu of one item open on `target`. */
  function openOn(target?: Element) {
    const contextMenu = createContextMenu();
    render(
      <AppContext.Provider value={{ contextMenu } as unknown as AppServices}>
        <ContextMenuHost />
      </AppContext.Provider>
    );
    const groups = [[{ label: "Rate…", icon: "star", onPick: () => {} }]];
    const open = () => act(() => contextMenu.open({ point: { x: 10, y: 10 }, groups, target }));
    open();
    return { contextMenu, open };
  }

  it("closes on a scroll outside it, a resize, and the browser tab hiding, but not on a scroll inside it", () => {
    const list = document.body.appendChild(document.createElement("div"));
    const { contextMenu, open } = openOn();
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
    list.remove();
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
