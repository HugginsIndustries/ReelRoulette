import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescedRefresh, REFRESH_GATHER_MS } from "../stats/coalescedRefresh";

/** A refresh whose runs finish only when the test says, counting them. */
function heldRuns() {
  const finishes: Array<() => void> = [];
  const run = vi.fn(() => new Promise<void>((resolve) => finishes.push(resolve)));
  return {
    run,
    finish(index: number) {
      finishes[index]!();
    }
  };
}

describe("coalesced refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits a moment, so a burst of requests shares one run", async () => {
    const runs = heldRuns();
    const refresh = createCoalescedRefresh(runs.run);

    refresh.request();
    refresh.request();
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS - 1);
    refresh.request();
    expect(runs.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runs.run).toHaveBeenCalledTimes(1);
  });

  it("runs once more, and only once, for requests made while a run goes", async () => {
    const runs = heldRuns();
    const refresh = createCoalescedRefresh(runs.run);

    refresh.request();
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS);
    expect(runs.run).toHaveBeenCalledTimes(1);
    refresh.request();
    refresh.request();
    refresh.request();
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS * 4);
    expect(runs.run).toHaveBeenCalledTimes(1);

    runs.finish(0);
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS);
    expect(runs.run).toHaveBeenCalledTimes(2);
    runs.finish(1);
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS * 4);
    expect(runs.run).toHaveBeenCalledTimes(2);
  });

  it("settles a request once a run that started after it has finished", async () => {
    const runs = heldRuns();
    const refresh = createCoalescedRefresh(runs.run);
    const settled: string[] = [];

    void refresh.request().then(() => settled.push("first"));
    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS);
    void refresh.request().then(() => settled.push("during"));
    runs.finish(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS);
    runs.finish(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual(["first", "during"]);
  });

  it("goes on after a run that fails", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("HTTP 500")).mockResolvedValue(undefined);
    const refresh = createCoalescedRefresh(run);

    await Promise.all([refresh.request(), vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS)]);
    await Promise.all([refresh.request(), vi.advanceTimersByTimeAsync(REFRESH_GATHER_MS)]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
