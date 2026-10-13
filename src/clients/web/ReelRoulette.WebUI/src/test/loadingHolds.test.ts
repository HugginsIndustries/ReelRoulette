import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoadingHolds, LOADING_GRACE_MS } from "../playback/loadingHolds";

describe("loading holds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Loading… only once something has been held for half a second", () => {
    const loading = createLoadingHolds();
    expect(LOADING_GRACE_MS).toBe(500);

    loading.hold("pick");
    vi.advanceTimersByTime(499);
    expect(loading.shown.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(loading.shown.value).toBe(true);

    loading.release("pick");
    expect(loading.shown.value).toBe(false);
  });

  it("shows nothing for a load that ends within the half second", () => {
    const loading = createLoadingHolds();
    loading.hold("media");
    vi.advanceTimersByTime(300);
    loading.release("media");
    vi.advanceTimersByTime(1_000);
    expect(loading.shown.value).toBe(false);
  });

  it("counts the half second once, from the first hold until every hold ends", () => {
    const loading = createLoadingHolds();
    loading.hold("pick");
    vi.advanceTimersByTime(300);
    // The media's hold starts before the pick's ends, so they are one loading period.
    loading.hold("media");
    loading.release("pick");
    vi.advanceTimersByTime(200);
    expect(loading.shown.value).toBe(true);

    loading.hold("pick");
    loading.release("media");
    expect(loading.shown.value).toBe(true);
    loading.releaseAll();
    expect(loading.shown.value).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(loading.shown.value).toBe(false);
  });

  it("ignores a release of what isn't held", () => {
    const loading = createLoadingHolds();
    loading.hold("play");
    loading.release("media");
    vi.advanceTimersByTime(500);
    expect(loading.shown.value).toBe(true);
  });
});
