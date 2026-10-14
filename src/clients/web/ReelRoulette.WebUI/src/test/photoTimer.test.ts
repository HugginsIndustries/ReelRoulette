import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhotoTimer } from "../playback/photoTimer";

function setup() {
  const onEnd = vi.fn();
  const timer = createPhotoTimer({ onEnd, now: () => Date.now() });
  return { timer, onEnd };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createPhotoTimer", () => {
  it("ends after its length", () => {
    const { timer, onEnd } = setup();
    timer.start(4_000);
    expect([timer.active, timer.running, timer.length]).toEqual([true, true, 4_000]);

    vi.advanceTimersByTime(3_999);
    expect(onEnd).not.toHaveBeenCalled();
    expect(timer.elapsed()).toBe(3_999);

    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect([timer.active, timer.running, timer.elapsed()]).toEqual([false, false, 4_000]);
    vi.advanceTimersByTime(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("holds with the time it had left, and resumes from there", () => {
    const { timer, onEnd } = setup();
    timer.start(10_000);
    vi.advanceTimersByTime(3_000);

    timer.hold();
    expect([timer.active, timer.running, timer.elapsed()]).toEqual([true, false, 3_000]);
    vi.advanceTimersByTime(60_000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(timer.elapsed()).toBe(3_000);

    timer.resume();
    expect(timer.running).toBe(true);
    vi.advanceTimersByTime(6_999);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("moves to a position, running on from there or staying held, within its length", () => {
    const { timer, onEnd } = setup();
    timer.start(10_000);
    vi.advanceTimersByTime(2_000);
    timer.seek(8_000);
    expect(timer.elapsed()).toBe(8_000);
    vi.advanceTimersByTime(1_999);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);

    timer.start(10_000);
    timer.hold();
    timer.seek(9_000);
    expect([timer.running, timer.elapsed()]).toEqual([false, 9_000]);
    vi.advanceTimersByTime(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    timer.resume();
    vi.advanceTimersByTime(1_000);
    expect(onEnd).toHaveBeenCalledTimes(2);

    timer.start(10_000);
    timer.hold();
    timer.seek(-5);
    expect(timer.elapsed()).toBe(0);
    timer.seek(20_000);
    expect(timer.elapsed()).toBe(10_000);
  });

  it("changes its length, keeping the time it has run and whether it runs or is held", () => {
    const { timer, onEnd } = setup();
    timer.start(10_000);
    vi.advanceTimersByTime(4_000);
    timer.setLength(6_000);
    expect([timer.length, timer.elapsed(), timer.running]).toEqual([6_000, 4_000, true]);
    vi.advanceTimersByTime(1_999);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);

    timer.start(10_000);
    vi.advanceTimersByTime(2_000);
    timer.hold();
    timer.setLength(20_000);
    expect([timer.length, timer.elapsed(), timer.running]).toEqual([20_000, 2_000, false]);
    vi.advanceTimersByTime(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    timer.resume();
    vi.advanceTimersByTime(17_999);
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it("ends at the next tick when its new length is no longer than the time it has run, or once it resumes", () => {
    const { timer, onEnd } = setup();
    timer.start(10_000);
    vi.advanceTimersByTime(5_000);
    timer.setLength(3_000);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(onEnd).toHaveBeenCalledTimes(1);

    timer.start(10_000);
    vi.advanceTimersByTime(5_000);
    timer.hold();
    timer.setLength(5_000);
    expect(timer.elapsed()).toBe(5_000);
    vi.advanceTimersByTime(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    timer.resume();
    vi.advanceTimersByTime(0);
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it("keeps the time a held timer has run through a shorter length and then a longer one", () => {
    const { timer, onEnd } = setup();
    timer.start(10_000);
    vi.advanceTimersByTime(5_000);
    timer.hold();
    timer.setLength(1_000);
    expect(timer.elapsed()).toBe(1_000);
    timer.setLength(15_000);
    expect([timer.length, timer.elapsed(), timer.running]).toEqual([15_000, 5_000, false]);

    timer.resume();
    vi.advanceTimersByTime(9_999);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stops once cleared, and a cleared timer neither resumes nor moves", () => {
    const { timer, onEnd } = setup();
    timer.start(5_000);
    vi.advanceTimersByTime(1_000);
    timer.clear();
    expect([timer.active, timer.running, timer.length, timer.elapsed()]).toEqual([false, false, 0, 0]);

    timer.resume();
    timer.seek(2_000);
    vi.advanceTimersByTime(60_000);
    expect(onEnd).not.toHaveBeenCalled();
    expect([timer.running, timer.elapsed()]).toEqual([false, 0]);
  });

  it("measures by its clock, so timers a browser delays don't stretch it", () => {
    let clock = 0;
    const onEnd = vi.fn();
    const timer = createPhotoTimer({ onEnd, now: () => clock });
    timer.start(10_000);
    clock = 4_000;
    timer.hold();
    expect(timer.elapsed()).toBe(4_000);
    clock = 50_000;
    timer.resume();
    clock = 53_000;
    expect(timer.elapsed()).toBe(7_000);
  });
});
