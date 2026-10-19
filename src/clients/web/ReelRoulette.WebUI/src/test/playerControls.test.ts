// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerControls, HIDE_AFTER_KEY, HIDE_CONTROLS_KEY, isTextField, KEEP_WHILE_PAUSED_KEY } from "../playback/playerControls";
import { createDeviceStore } from "../state/deviceStore";

/** Controls whose device store starts with `saved`, as the page's `localStorage` would hold it, while playing. */
function setup(saved: Record<string, unknown> = {}) {
  const kept = new Map(Object.entries(saved).map(([key, value]) => [`rr_device.${key}`, JSON.stringify(value)]));
  const device = createDeviceStore({ getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) });
  const paused = signal(false);
  const listOpen = signal(false);
  const controls = createPlayerControls({ device, paused, listOpen });
  return {
    controls,
    paused,
    listOpen,
    kept: (key: string) => kept.get(`rr_device.${key}`),
    shown: () => controls.shown.value,
    /** Lets `seconds` pass. */
    wait: (seconds: number) => vi.advanceTimersByTime(seconds * 1000)
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Timeout", () => {
  it("is the default: the controls start shown and hide 3 seconds after the last activity, which shows them again", () => {
    const page = setup();
    expect(page.controls.mode.value).toBe("timeout");
    expect(page.controls.hideAfterSeconds.value).toBe(3);
    expect(page.shown()).toBe(true);
    page.wait(2.9);
    expect(page.shown()).toBe(true);
    page.wait(0.1);
    expect(page.shown()).toBe(false);

    page.controls.activity();
    expect(page.shown()).toBe(true);
    page.wait(2);
    page.controls.activity();
    page.wait(2);
    expect(page.shown()).toBe(true);
    page.wait(1);
    expect(page.shown()).toBe(false);
  });

  it("counts a tap or click on the player, the scroll wheel, and a two-finger drag as activity, never hiding them", () => {
    const page = setup();
    page.controls.tap();
    expect(page.shown()).toBe(true);
    page.wait(3);
    expect(page.shown()).toBe(false);

    page.controls.tap();
    expect(page.shown()).toBe(true);
    page.controls.tap();
    expect(page.shown()).toBe(true);
    page.wait(3);
    page.controls.show();
    expect(page.shown()).toBe(true);
    page.wait(2.9);
    expect(page.shown()).toBe(true);
    page.wait(0.1);
    expect(page.shown()).toBe(false);
  });

  it("hides after Hide after, which takes a whole number of seconds from 1 to 30 and is kept on this device", () => {
    const page = setup();
    page.controls.setHideAfter(1);
    expect(page.kept(HIDE_AFTER_KEY)).toBe("1");
    page.wait(1);
    expect(page.shown()).toBe(false);

    for (const seconds of [0, 31, 2.5, Number.NaN]) {
      page.controls.setHideAfter(seconds);
    }
    expect(page.controls.hideAfterSeconds.value).toBe(1);
    expect(page.kept(HIDE_AFTER_KEY)).toBe("1");

    page.controls.setHideAfter(30);
    page.controls.activity();
    page.wait(29);
    expect(page.shown()).toBe(true);
    page.wait(1);
    expect(page.shown()).toBe(false);
  });

  it.each(["pointer", "drag", "keyboardFocus"] as const)("stays while the %s hold lasts, and hides Hide after once it ends", (reason) => {
    const page = setup();
    page.controls.hold(reason, true);
    page.wait(10);
    expect(page.shown()).toBe(true);

    page.controls.hold(reason, false);
    page.wait(2.9);
    expect(page.shown()).toBe(true);
    page.wait(0.1);
    expect(page.shown()).toBe(false);
  });

  it("an end of a hold that wasn't held changes nothing", () => {
    const page = setup();
    page.wait(3);
    page.controls.hold("pointer", false);
    expect(page.shown()).toBe(false);
  });

  it("stays while the bell's list is open, and its countdown starts again as the list closes", () => {
    const page = setup();
    page.listOpen.value = true;
    page.wait(10);
    expect(page.shown()).toBe(true);

    page.listOpen.value = false;
    page.wait(2.9);
    expect(page.shown()).toBe(true);
    page.wait(0.1);
    expect(page.shown()).toBe(false);
  });

  it("with Keep visible while paused, the default, a pause shows the controls and keeps them, and playing on hides them after the time", () => {
    const page = setup();
    page.wait(3);
    expect(page.shown()).toBe(false);

    page.paused.value = true;
    expect(page.shown()).toBe(true);
    page.wait(10);
    expect(page.shown()).toBe(true);

    page.paused.value = false;
    page.wait(2.9);
    expect(page.shown()).toBe(true);
    page.wait(0.1);
    expect(page.shown()).toBe(false);
  });

  it("without Keep visible while paused, they hide while paused too, and it is kept on this device", () => {
    const page = setup();
    page.controls.setKeepWhilePaused(false);
    expect(page.kept(KEEP_WHILE_PAUSED_KEY)).toBe("false");
    page.paused.value = true;
    page.wait(3);
    expect(page.shown()).toBe(false);

    // Turned back on while paused, it shows them.
    page.controls.setKeepWhilePaused(true);
    expect(page.shown()).toBe(true);
    page.wait(10);
    expect(page.shown()).toBe(true);
  });
});

describe("On click/tap and Never", () => {
  it("On click/tap: a tap or click shows or hides them, nothing hides them on its own, and the wheel shows them", () => {
    const page = setup();
    page.wait(3);
    page.controls.setMode("click");
    expect(page.kept(HIDE_CONTROLS_KEY)).toBe('"click"');
    expect(page.shown()).toBe(true);

    page.controls.tap();
    expect(page.shown()).toBe(false);
    page.controls.activity();
    page.wait(10);
    expect(page.shown()).toBe(false);
    page.controls.tap();
    expect(page.shown()).toBe(true);
    page.wait(10);
    expect(page.shown()).toBe(true);
    page.controls.tap();
    page.controls.show();
    expect(page.shown()).toBe(true);
  });

  it("Never: they stay through taps, time, and pauses", () => {
    const page = setup();
    page.wait(3);
    page.controls.setMode("never");
    expect(page.shown()).toBe(true);
    page.controls.tap();
    page.paused.value = true;
    page.paused.value = false;
    page.wait(60);
    expect(page.shown()).toBe(true);
  });

  it("a mode chosen starts with the controls shown, and Timeout's countdown starts over", () => {
    const page = setup({ [HIDE_CONTROLS_KEY]: "click" });
    page.controls.tap();
    expect(page.shown()).toBe(false);

    page.controls.setMode("timeout");
    expect(page.shown()).toBe(true);
    page.wait(2.9);
    expect(page.shown()).toBe(true);
    page.wait(0.1);
    expect(page.shown()).toBe(false);
  });

  it("starts with the mode and settings kept on this device, and reads one it can't use as its default", () => {
    const page = setup({ [HIDE_CONTROLS_KEY]: "never", [HIDE_AFTER_KEY]: 12, [KEEP_WHILE_PAUSED_KEY]: false });
    expect([page.controls.mode.value, page.controls.hideAfterSeconds.value, page.controls.keepWhilePaused.value]).toEqual(["never", 12, false]);

    const unusable = setup({ [HIDE_CONTROLS_KEY]: "sometimes", [HIDE_AFTER_KEY]: 31, [KEEP_WHILE_PAUSED_KEY]: "no" });
    expect([unusable.controls.mode.value, unusable.controls.hideAfterSeconds.value, unusable.controls.keepWhilePaused.value]).toEqual(["timeout", 3, true]);
  });
});

describe("isTextField", () => {
  it("is true for text fields, sliders, text areas, dropdowns, and editable text, and false for buttons, checkboxes, and radio buttons", () => {
    const input = (type: string) => Object.assign(document.createElement("input"), { type });
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect([input("text"), input("search"), input("range"), document.createElement("textarea"), document.createElement("select"), editable].map(isTextField)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true
    ]);
    expect([input("checkbox"), input("radio"), document.createElement("button"), document.body, null].map(isTextField)).toEqual([false, false, false, false, false]);
  });
});
