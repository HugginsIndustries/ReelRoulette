import { describe, expect, it, vi } from "vitest";
import { createMediaGestures } from "../playback/mediaGestures";

function setup(hasCurrent = true) {
  const actions = {
    previous: vi.fn(),
    next: vi.fn(),
    hasCurrent: () => hasCurrent,
    toggleControls: vi.fn()
  };
  const gestures = createMediaGestures(actions);
  return {
    actions,
    gestures,
    touch(from: [number, number], to: [number, number], startsOnControls = false) {
      gestures.touchStart(startsOnControls, { clientX: from[0], clientY: from[1] });
      gestures.touchEnd({ clientX: to[0], clientY: to[1] });
    }
  };
}

describe("createMediaGestures", () => {
  it("plays the next item on a swipe left and the previous one on a swipe right, and ignores the click after each", () => {
    const { actions, gestures, touch } = setup();
    touch([300, 100], [249, 120]);
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(gestures.takeFollowingClick()).toBe(true);
    expect(gestures.takeFollowingClick()).toBe(false);

    touch([100, 100], [151, 80]);
    expect(actions.previous).toHaveBeenCalledTimes(1);
    expect(gestures.takeFollowingClick()).toBe(true);
    expect(actions.toggleControls).not.toHaveBeenCalled();
  });

  it("ignores a move of 50 pixels or less, and one that is mostly vertical", () => {
    const { actions, gestures, touch } = setup();
    touch([300, 100], [250, 100]);
    touch([300, 100], [230, 171]);
    expect(actions.next).not.toHaveBeenCalled();
    expect(actions.toggleControls).not.toHaveBeenCalled();
    expect(gestures.takeFollowingClick()).toBe(false);
  });

  it("toggles the controls on a tap once something plays, and ignores the click after it", () => {
    const { actions, gestures, touch } = setup();
    touch([100, 100], [109, 91]);
    expect(actions.toggleControls).toHaveBeenCalledTimes(1);
    expect(gestures.takeFollowingClick()).toBe(true);
    expect(gestures.takeFollowingClick()).toBe(false);

    touch([100, 100], [110, 100]);
    expect(actions.toggleControls).toHaveBeenCalledTimes(1);
  });

  it("lets the click after a tap through when nothing plays", () => {
    const { actions, gestures, touch } = setup(false);
    touch([100, 100], [101, 101]);
    expect(actions.toggleControls).not.toHaveBeenCalled();
    expect(gestures.takeFollowingClick()).toBe(false);
  });

  it("ignores a touch that starts on the controls, and a touch end without a point", () => {
    const { actions, gestures, touch } = setup();
    touch([300, 100], [100, 100], true);
    expect(actions.next).not.toHaveBeenCalled();

    gestures.touchStart(false, { clientX: 300, clientY: 100 });
    gestures.touchEnd(undefined);
    expect(actions.next).not.toHaveBeenCalled();
    expect(gestures.takeFollowingClick()).toBe(false);
  });
});
