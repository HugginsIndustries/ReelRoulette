// @vitest-environment happy-dom
import { cleanup, fireEvent, render, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Menu } from "../../ui/Menu";
import type { MenuItem } from "../../ui/menuModel";
import { menuIcons, menuItemIn as item, menuParts as parts } from "./pageHarness";

afterEach(() => {
  cleanup();
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
