// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeldButton, ValidatedField } from "../../ui/FieldValidation";
import { createFieldReveal, type FieldReveal } from "../../validation/fieldValidation";
import { currentStyle, resetPage, useStylesheet } from "./pageHarness";

const REASON = "Correct the minimum duration first.";

beforeEach(() => {
  resetPage();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** A stylesheet variable's value, as the page's root holds it. */
function token(name: string): string {
  return currentStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The text of the element that describes `element`, or null when nothing does. */
function description(element: HTMLElement): string | null {
  const id = element.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

describe("a held action", () => {
  it("shows the red badge over its top-right corner, out of its flow, with its reason as its title and description", () => {
    useStylesheet();
    render(
      <HeldButton id="add" class="btn" disabled={false} heldReason={REASON} onClick={() => {}}>
        Add Preset
      </HeldButton>
    );
    const button = byId<HTMLButtonElement>("add");
    const badge = button.querySelector<HTMLElement>(".btn-problem")!;
    const style = currentStyle(badge);

    expect(currentStyle(button).position).toBe("relative");
    expect([style.position, style.top, style.right, style.fontSize]).toEqual(["absolute", "-6px", "-6px", "18px"]);
    expect(style.fontFamily).toContain("Material Symbols Outlined");
    expect(style.color).toBe(token("--error"));
    expect(badge.textContent).toBe("error");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    expect(button.classList.contains("shows-problem")).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(currentStyle(button.querySelector(".btn-label")!).opacity).toBe("0.5");
    expect(button.title).toBe(REASON);
    expect(description(button)).toBe(REASON);
    // A text button keeps its own label as its name.
    expect(button.hasAttribute("aria-label")).toBe(false);
  });

  it("with a dot, turns the dot red while held, in place of the badge, and its label names it and is its title while no reason shows", () => {
    useStylesheet();
    const apply = (props: { dot: boolean; disabled: boolean; heldReason: string | null }) => (
      <HeldButton id="apply" class="icon-btn" label="Apply" {...props} onClick={() => {}}>
        <span class="material-symbol-icon">save</span>
      </HeldButton>
    );
    const { rerender } = render(apply({ dot: true, disabled: false, heldReason: null }));
    const button = byId<HTMLButtonElement>("apply");
    const dot = () => button.querySelector<HTMLElement>(".unsaved-dot")!;
    expect(button.getAttribute("aria-label")).toBe("Apply");
    expect(button.title).toBe("Apply");
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(dot().hidden).toBe(false);
    expect(button.classList.contains("shows-problem")).toBe(false);
    expect(currentStyle(dot()).backgroundColor).toBe(token("--huggins-orange"));

    rerender(apply({ dot: true, disabled: false, heldReason: REASON }));
    expect(button.classList.contains("shows-problem")).toBe(true);
    expect(button.querySelector(".btn-problem")).toBeNull();
    expect(dot().hidden).toBe(false);
    expect(currentStyle(dot()).backgroundColor).toBe(token("--error"));
    expect(currentStyle(button.querySelector(".btn-label")!).opacity).toBe("0.5");
    expect(button.getAttribute("aria-label")).toBe("Apply");
    expect(button.title).toBe(REASON);
    expect(description(button)).toBe(REASON);

    rerender(apply({ dot: false, disabled: true, heldReason: null }));
    expect(dot().hidden).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Apply");
  });
});

describe("a held action's move to its field", () => {
  /** Renders a flagged field that `reveal` moves to, with its `show`. */
  function field(reveal: FieldReveal<"min">, show: () => void) {
    return (
      <ValidatedField problem={{ message: "Use seconds." }} flagged={true} reveal={{ from: reveal, field: "min", show }}>
        {(control) => <input {...control} id="min" type="text" />}
      </ValidatedField>
    );
  }

  it("shows the field's section and then focuses the field within the reveal, without preventScroll or a scroll first", () => {
    const reveal = createFieldReveal<"min">();
    const steps: string[] = [];
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      steps.push(`focus ${this.id}, preventScroll ${options?.preventScroll === true}`);
      focus.call(this, options);
    });
    const scrolls = vi.spyOn(Element.prototype, "scrollIntoView");
    render(field(reveal, () => steps.push("show")));
    expect(steps).toEqual([]);

    reveal.reveal("min");
    expect(steps).toEqual(["show", "focus min, preventScroll false"]);
    expect(document.activeElement).toBe(byId("min"));
    expect(scrolls).not.toHaveBeenCalled();
  });

  it("runs the latest render's show, and nothing once the field is gone", () => {
    const reveal = createFieldReveal<"min">();
    const shown: string[] = [];
    const { rerender, unmount } = render(field(reveal, () => shown.push("first")));
    rerender(field(reveal, () => shown.push("second")));
    reveal.reveal("min");
    expect(shown).toEqual(["second"]);

    unmount();
    reveal.reveal("min");
    expect(shown).toEqual(["second"]);
  });
});
