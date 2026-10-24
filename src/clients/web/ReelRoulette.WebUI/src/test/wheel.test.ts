// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { blockWheelPageZoom, isWheelNotch } from "../ui/wheel";

/** A wheel event; happy-dom's drops `ctrlKey` from its init, so it is set on the event. */
function wheelEvent(ctrlKey: boolean): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("isWheelNotch", () => {
  it("takes line and page units and pixel deltas of 50 or more as a mouse wheel's notches, and smaller ones as a trackpad's", () => {
    expect(isWheelNotch({ deltaY: 3, deltaMode: 1 })).toBe(true);
    expect(isWheelNotch({ deltaY: 1, deltaMode: 2 })).toBe(true);
    expect(isWheelNotch({ deltaY: -100, deltaMode: 0 })).toBe(true);
    expect(isWheelNotch({ deltaY: 50, deltaMode: 0 })).toBe(true);
    expect(isWheelNotch({ deltaY: 49, deltaMode: 0 })).toBe(false);
    expect(isWheelNotch({ deltaY: -4, deltaMode: 0 })).toBe(false);
  });
});

describe("blockWheelPageZoom", () => {
  it("cancels Ctrl+wheel over anything on the page, and leaves a plain wheel to scroll, until it is stopped", () => {
    const inner = document.createElement("span");
    document.body.append(document.createElement("div"));
    document.body.firstElementChild!.append(inner);
    const stop = blockWheelPageZoom(window);

    expect(inner.dispatchEvent(wheelEvent(true))).toBe(false);
    expect(inner.dispatchEvent(wheelEvent(false))).toBe(true);

    stop();
    expect(inner.dispatchEvent(wheelEvent(true))).toBe(true);
  });
});
