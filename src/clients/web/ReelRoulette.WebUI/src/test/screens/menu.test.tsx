// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Menu, type MenuItem } from "../../ui/Menu";

afterEach(() => {
  cleanup();
});

/** The menu's items and rules in order: each item's label, or "—" for a rule. */
function parts(menu: HTMLElement): string[] {
  return Array.from(menu.children).map((part) => (part.tagName === "HR" ? "—" : part.textContent ?? ""));
}

function item(menu: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(menu.querySelectorAll("button")).find((button) => button.textContent === label)!;
}

describe("the menu", () => {
  it("lists its items in groups with a rule between them, leaving out an empty group", () => {
    const pick = () => {};
    const { container } = render(
      <Menu
        id="test-menu"
        class="test-place"
        groups={[[{ label: "One", onPick: pick }, { label: "Two", onPick: pick }], [], [{ label: "Three", onPick: pick }]]}
        onClose={() => {}}
      />
    );
    const menu = container.querySelector<HTMLElement>("#test-menu")!;
    expect(menu.className).toBe("menu test-place");
    expect(parts(menu)).toEqual(["One", "Two", "—", "Three"]);
    expect(menu.querySelectorAll("hr.menu-rule")).toHaveLength(1);
  });

  it("marks a destructive item red, and disables an item with its reason as its tooltip", () => {
    const groups: MenuItem[][] = [
      [{ label: "Rename", onPick: () => {}, disabledReason: "Pick one item to rename" }],
      [{ label: "Delete", onPick: () => {}, danger: true }]
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
        { label: "Rate…", onPick: () => happened.push("rate") },
        { label: "Rename", onPick: () => happened.push("rename"), disabledReason: "Pick one item to rename" }
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
