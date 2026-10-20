import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeekIndicator, SEEK_INDICATOR_MS } from "../playback/seekIndicator";

afterEach(() => {
  vi.useRealTimers();
});

/** What each side shows, as "back" or "forward" with its seconds, or "hidden" with the seconds it keeps. */
function sides(indicator: ReturnType<typeof createSeekIndicator>): string[] {
  return [indicator.back.value, indicator.forward.value].map((side) => `${side.shown ? "shown" : "hidden"} ${side.seconds}`);
}

describe("createSeekIndicator", () => {
  it("shows a back seek on the back side and a forward seek on the forward side, with the full step", () => {
    vi.useFakeTimers();
    const indicator = createSeekIndicator();
    expect(sides(indicator)).toEqual(["hidden 0", "hidden 0"]);
    indicator.seeked(-5);
    expect(sides(indicator)).toEqual(["shown 5", "hidden 0"]);
    vi.advanceTimersByTime(SEEK_INDICATOR_MS);
    indicator.seeked(10);
    expect(sides(indicator)).toEqual(["hidden 5", "shown 10"]);
  });

  it("adds up seeks the same way, and hides a second after the last, keeping its total as it fades out", () => {
    vi.useFakeTimers();
    const indicator = createSeekIndicator();
    indicator.seeked(5);
    vi.advanceTimersByTime(SEEK_INDICATOR_MS - 1);
    indicator.seeked(5);
    vi.advanceTimersByTime(SEEK_INDICATOR_MS - 1);
    indicator.seeked(5);
    expect(sides(indicator)).toEqual(["hidden 0", "shown 15"]);
    vi.advanceTimersByTime(SEEK_INDICATOR_MS - 1);
    expect(sides(indicator)).toEqual(["hidden 0", "shown 15"]);
    vi.advanceTimersByTime(1);
    expect(sides(indicator)).toEqual(["hidden 0", "hidden 15"]);
  });

  it("starts the total over a second after the last seek, and with a seek the other way", () => {
    vi.useFakeTimers();
    const indicator = createSeekIndicator();
    indicator.seeked(5);
    indicator.seeked(5);
    vi.advanceTimersByTime(SEEK_INDICATOR_MS);
    indicator.seeked(5);
    expect(sides(indicator)).toEqual(["hidden 0", "shown 5"]);

    indicator.seeked(5);
    indicator.seeked(-5);
    expect(sides(indicator)).toEqual(["shown 5", "hidden 10"]);
    indicator.seeked(5);
    expect(sides(indicator)).toEqual(["hidden 5", "shown 5"]);
  });

  it("hides at once when cleared, and starts the total over", () => {
    vi.useFakeTimers();
    const indicator = createSeekIndicator();
    indicator.seeked(-5);
    indicator.clear();
    expect(sides(indicator)).toEqual(["hidden 5", "hidden 0"]);
    indicator.seeked(-5);
    expect(sides(indicator)).toEqual(["shown 5", "hidden 0"]);
  });
});
