import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaGestures, DOUBLE_TAP_MS } from "../playback/mediaGestures";

/** The player's middle across the page, which splits its halves. */
const MIDDLE_X = 200;

function setup(volumeAdjustable = true, { seekable = false } = {}) {
  const actions = {
    previous: vi.fn(),
    next: vi.fn(),
    seekable: () => seekable,
    seek: vi.fn(),
    middleX: () => MIDDLE_X,
    tap: vi.fn(),
    showControls: vi.fn(),
    volumeAdjustable: () => volumeAdjustable,
    beginVolumeChange: vi.fn(),
    endVolumeChange: vi.fn(),
    stepVolume: vi.fn()
  };
  const gestures = createMediaGestures(actions);
  const fingers = (ys: number[], x = 120) => ys.map((y) => ({ clientX: x, clientY: y }));
  return {
    actions,
    gestures,
    touch(from: [number, number], to: [number, number], startsOnControls = false) {
      gestures.touchStart(startsOnControls, [{ clientX: from[0], clientY: from[1] }]);
      gestures.touchEnd({ clientX: to[0], clientY: to[1] }, 0);
    },
    /** Two fingers land 40 px apart, one after the other, move by each of `ups` (up is positive), and lift. */
    twoFingerDrag(...ups: number[]) {
      let y = 300;
      gestures.touchStart(false, fingers([y]));
      gestures.touchStart(false, fingers([y, y + 40]));
      const claimed = ups.map((up) => {
        y -= up;
        return gestures.touchMove(fingers([y, y + 40]));
      });
      gestures.touchEnd({ clientX: 120, clientY: y }, 1);
      gestures.touchEnd({ clientX: 120, clientY: y + 40 }, 0);
      return claimed;
    },
    /** A tap at `x` and the click that follows it, which returns whether the gestures took it. */
    tapAt(x: number): boolean {
      gestures.touchStart(false, [{ clientX: x, clientY: 100 }]);
      gestures.touchEnd({ clientX: x, clientY: 102 }, 0);
      return gestures.takeClick();
    },
    stepped: () => actions.stepVolume.mock.calls.map(([steps]) => steps),
    seeks: () => actions.seek.mock.calls.map(([forward]) => (forward ? "forward" : "back"))
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createMediaGestures", () => {
  it("plays the next item on a swipe left and the previous one on a swipe right, and ignores the click after each", () => {
    const { actions, gestures, touch } = setup();
    touch([300, 100], [249, 120]);
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(gestures.takeClick()).toBe(true);
    expect(gestures.takeClick()).toBe(false);

    touch([100, 100], [151, 80]);
    expect(actions.previous).toHaveBeenCalledTimes(1);
    expect(gestures.takeClick()).toBe(true);
  });

  it("ignores a move of 50 pixels or less, and one that is mostly vertical", () => {
    const { actions, gestures, touch } = setup();
    touch([300, 100], [250, 100]);
    touch([300, 100], [230, 171]);
    expect(actions.next).not.toHaveBeenCalled();
    expect(gestures.takeClick()).toBe(false);
  });

  it("leaves a tap to the click that follows it", () => {
    const { actions, gestures, touch } = setup();
    touch([100, 100], [109, 91]);
    expect([actions.next, actions.previous, actions.showControls].map((action) => action.mock.calls.length)).toEqual([0, 0, 0]);
    expect(gestures.takeClick()).toBe(false);
  });

  it("ignores a touch that starts on the controls, and a touch end without a point", () => {
    const { actions, gestures, touch } = setup();
    touch([300, 100], [100, 100], true);
    expect(actions.next).not.toHaveBeenCalled();

    gestures.touchStart(false, [{ clientX: 300, clientY: 100 }]);
    gestures.touchEnd(undefined, 0);
    expect(actions.next).not.toHaveBeenCalled();
    expect(gestures.takeClick()).toBe(false);
  });

  it("changes the volume a step per 30 px of a two-finger drag, up raising it, as one change that shows the controls and is claimed from the browser", () => {
    const { actions, twoFingerDrag, stepped } = setup();
    const claimed = twoFingerDrag(20, 20, 80, -60);
    expect(claimed).toEqual([true, true, true, true]);
    expect(stepped()).toEqual([1, 3, -2]);
    expect(actions.beginVolumeChange).toHaveBeenCalledTimes(1);
    expect(actions.endVolumeChange).toHaveBeenCalledTimes(1);
    expect(actions.beginVolumeChange.mock.invocationCallOrder[0]).toBeLessThan(actions.stepVolume.mock.invocationCallOrder[0]!);
    expect(actions.endVolumeChange.mock.invocationCallOrder[0]).toBeGreaterThan(actions.stepVolume.mock.invocationCallOrder.at(-1)!);
    expect(actions.showControls).toHaveBeenCalled();
  });

  it("measures a two-finger drag afresh when a finger lifts and lands again, still as one change", () => {
    const { actions, gestures, stepped } = setup();
    gestures.touchStart(false, [{ clientX: 120, clientY: 300 }]);
    gestures.touchStart(false, [{ clientX: 120, clientY: 300 }, { clientX: 120, clientY: 340 }]);
    gestures.touchMove([{ clientX: 120, clientY: 270 }, { clientX: 120, clientY: 310 }]);
    gestures.touchEnd({ clientX: 120, clientY: 310 }, 1);
    // The second finger lands again 120 px lower, moving the fingers' middle 60 px down without a drag.
    gestures.touchStart(false, [{ clientX: 120, clientY: 270 }, { clientX: 120, clientY: 430 }]);
    gestures.touchMove([{ clientX: 120, clientY: 240 }, { clientX: 120, clientY: 400 }]);
    gestures.touchEnd({ clientX: 120, clientY: 400 }, 1);
    gestures.touchEnd({ clientX: 120, clientY: 240 }, 0);
    expect(stepped()).toEqual([1, 1]);
    expect([actions.beginVolumeChange.mock.calls.length, actions.endVolumeChange.mock.calls.length]).toEqual([1, 1]);
  });

  it("never takes a two-finger touch for a swipe or a tap, and leaves a one-finger move to the browser", () => {
    const { actions, gestures, twoFingerDrag } = setup();
    twoFingerDrag(5);
    gestures.touchStart(false, [{ clientX: 300, clientY: 300 }]);
    gestures.touchStart(false, [{ clientX: 300, clientY: 300 }, { clientX: 300, clientY: 340 }]);
    gestures.touchEnd({ clientX: 200, clientY: 300 }, 1);
    gestures.touchEnd({ clientX: 200, clientY: 340 }, 0);
    expect([actions.next, actions.previous].map((action) => action.mock.calls.length)).toEqual([0, 0]);
    expect(gestures.takeClick()).toBe(false);

    gestures.touchStart(false, [{ clientX: 300, clientY: 300 }]);
    expect(gestures.touchMove([{ clientX: 300, clientY: 200 }])).toBe(false);
  });

  it("changes the volume a step per wheel notch, adding a trackpad's small deltas up to a notch per 100 px, and shows the controls", () => {
    vi.useFakeTimers();
    const { actions, gestures, stepped } = setup();
    gestures.wheel({ deltaY: -100, deltaMode: 0 });
    gestures.wheel({ deltaY: 3, deltaMode: 1 });
    gestures.wheel({ deltaY: -30, deltaMode: 0 });
    gestures.wheel({ deltaY: -30, deltaMode: 0 });
    gestures.wheel({ deltaY: -30, deltaMode: 0 });
    expect(stepped()).toEqual([1, -1]);
    gestures.wheel({ deltaY: -30, deltaMode: 0 });
    expect(stepped()).toEqual([1, -1, 1]);
    expect(actions.showControls).toHaveBeenCalledTimes(6);

    // A pause starts the small deltas over: 20 px left from the notch, then 40 px, then 40 px after it.
    gestures.wheel({ deltaY: -40, deltaMode: 0 });
    vi.advanceTimersByTime(300);
    gestures.wheel({ deltaY: -40, deltaMode: 0 });
    expect(stepped()).toEqual([1, -1, 1]);
  });

  it("on a video, takes a tap's click and taps once 300 ms pass without another tap", () => {
    vi.useFakeTimers();
    const { actions, tapAt, seeks } = setup(true, { seekable: true });
    expect(tapAt(100)).toBe(true);
    vi.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    expect(actions.tap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(actions.tap).toHaveBeenCalledTimes(1);
    expect(seeks()).toEqual([]);
  });

  it("seeks back on a double-tap on the player's left half and forward on its right, and never taps", () => {
    vi.useFakeTimers();
    const { actions, tapAt, seeks } = setup(true, { seekable: true });
    tapAt(MIDDLE_X - 1);
    vi.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    expect(tapAt(MIDDLE_X - 1)).toBe(true);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    tapAt(MIDDLE_X + 1);
    vi.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    tapAt(MIDDLE_X + 1);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seeks()).toEqual(["back", "forward"]);
    expect(actions.tap).not.toHaveBeenCalled();
  });

  it("seeks again for each further tap within 300 ms of the last, toward its half, so a triple-tap seeks twice, and a tap after that waits again", () => {
    vi.useFakeTimers();
    const { actions, tapAt, seeks } = setup(true, { seekable: true });
    tapAt(300);
    vi.advanceTimersByTime(250);
    tapAt(300);
    vi.advanceTimersByTime(250);
    tapAt(100);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seeks()).toEqual(["forward", "back"]);
    expect(actions.tap).not.toHaveBeenCalled();

    tapAt(300);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(seeks()).toEqual(["forward", "back"]);
    expect(actions.tap).toHaveBeenCalledTimes(1);
  });

  it("leaves a click to the media area where nothing can seek, and one no tap came before, as a mouse's", () => {
    vi.useFakeTimers();
    const unseekable = setup();
    expect(unseekable.tapAt(100)).toBe(false);
    expect(unseekable.tapAt(100)).toBe(false);

    const { actions, gestures, touch, twoFingerDrag, tapAt } = setup(true, { seekable: true });
    expect(gestures.takeClick()).toBe(false);
    touch([100, 100], [101, 100], true);
    expect(gestures.takeClick()).toBe(false);
    twoFingerDrag(5);
    expect(gestures.takeClick()).toBe(false);
    // A swipe's click is taken as before, and doesn't count as a tap.
    touch([300, 100], [200, 100]);
    expect(gestures.takeClick()).toBe(true);
    expect(tapAt(100)).toBe(true);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect([actions.seek.mock.calls.length, actions.tap.mock.calls.length]).toEqual([0, 1]);
  });

  it("leaves the volume alone where it can't change, still claiming a two-finger drag", () => {
    const { actions, gestures, twoFingerDrag } = setup(false);
    gestures.wheel({ deltaY: -100, deltaMode: 0 });
    expect(twoFingerDrag(60)).toEqual([true]);
    expect(actions.stepVolume).not.toHaveBeenCalled();
    expect(actions.showControls).not.toHaveBeenCalled();
  });
});
