import { signal } from "@preact/signals";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpStatusError, UnauthorizedError } from "../api/serverRequest";
import { BASELINE_RETRY_MS, createLibraryBaseline } from "../stats/libraryBaseline";

const stats = (baselineLoudnessLufs: unknown) => ({ global: { baselineLoudnessLufs }, sources: [] });

/** A baseline over a fake stats route and a fake connection whose events the test sends. */
function setup(answer: () => Promise<unknown> = async () => stats(-27.8)) {
  const handlers = new Map<string, () => void>();
  const store = { heldBack: signal(false), pairingRequired: signal(false) };
  const getJson = vi.fn(answer);
  const relayed: string[] = [];
  const baseline = createLibraryBaseline({
    store,
    api: { getJson },
    connection: { on: (event: string, handler: () => void) => void handlers.set(event, handler) } as any,
    relay: (level, message) => relayed.push(`${level} ${message}`)
  });
  const send = async (event: string) => {
    handlers.get(event)!();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { baseline, store, getJson, relayed, send };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("library baseline", () => {
  it("loads nothing until the server is ready, then the library stats' baseline loudness", async () => {
    vi.useFakeTimers();
    const { baseline, getJson, send } = setup();
    await vi.advanceTimersByTimeAsync(1000);
    expect(getJson).not.toHaveBeenCalled();
    expect(baseline.lufs.value).toBeNull();

    await send("serverReady");
    expect(getJson).toHaveBeenCalledWith("/api/library/stats");
    expect(baseline.lufs.value).toBe(-27.8);
  });

  it("loads again after each refresh and resync, which can change it", async () => {
    vi.useFakeTimers();
    let next = -27.8;
    const { baseline, getJson, send } = setup(async () => stats(next));
    await send("serverReady");
    next = -26.1;
    await send("refreshCompleted");
    expect(baseline.lufs.value).toBe(-26.1);
    next = -25;
    await send("resyncRequired");
    expect(baseline.lufs.value).toBe(-25);
    expect(getJson).toHaveBeenCalledTimes(3);
  });

  it("loads nothing while the server holds back or asks for pairing", async () => {
    vi.useFakeTimers();
    const { getJson, store, send } = setup();
    store.heldBack.value = true;
    await send("serverReady");
    store.heldBack.value = false;
    store.pairingRequired.value = true;
    await send("refreshCompleted");
    expect(getJson).not.toHaveBeenCalled();
  });

  it("keeps the baseline it has when a load fails, relaying why, and when the stats carry none", async () => {
    vi.useFakeTimers();
    let answer: () => Promise<unknown> = async () => stats(-27.8);
    const { baseline, relayed, send } = setup(() => answer());
    await send("serverReady");

    answer = async () => {
      throw new HttpStatusError(500);
    };
    await send("refreshCompleted");
    expect(baseline.lufs.value).toBe(-27.8);
    expect(relayed).toEqual(["warn audio=baseline-load-failed error=HTTP 500"]);

    answer = async () => stats(null);
    await send("refreshCompleted");
    expect(baseline.lufs.value).toBe(-27.8);
  });

  it("relays nothing for a 401, whose pairing prompt is the only thing to act on, and doesn't try again", async () => {
    vi.useFakeTimers();
    const { baseline, getJson, relayed, send } = setup(async () => {
      throw new UnauthorizedError();
    });
    await send("serverReady");
    expect(baseline.lufs.value).toBeNull();
    expect(relayed).toEqual([]);
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS * 3);
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it("tries a failed load again every few seconds until one succeeds, relaying only the first failure", async () => {
    vi.useFakeTimers();
    let failures = 2;
    const { baseline, getJson, relayed, send } = setup(async () => {
      if (failures > 0) {
        failures -= 1;
        throw new HttpStatusError(503);
      }
      return stats(-27.8);
    });
    await send("serverReady");
    expect(getJson).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS - 100);
    expect(getJson).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(baseline.lufs.value).toBeNull();

    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS);
    expect(getJson).toHaveBeenCalledTimes(3);
    expect(baseline.lufs.value).toBe(-27.8);
    expect(relayed).toEqual(["warn audio=baseline-load-failed error=HTTP 503"]);

    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS * 3);
    expect(getJson).toHaveBeenCalledTimes(3);
  });

  it("takes an event's load in place of the try it was waiting for", async () => {
    vi.useFakeTimers();
    const { getJson, send } = setup(async () => {
      throw new HttpStatusError(500);
    });
    await send("serverReady");
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS / 2);
    await send("refreshCompleted");
    expect(getJson).toHaveBeenCalledTimes(2);

    // The refresh's load failed too, so the next try waits from it.
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS / 2 + 100);
    expect(getJson).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS / 2);
    expect(getJson).toHaveBeenCalledTimes(3);
  });

  it("stops trying again while the server holds back, until it is ready again", async () => {
    vi.useFakeTimers();
    const { getJson, store, send } = setup(async () => {
      throw new HttpStatusError(500);
    });
    await send("serverReady");
    store.heldBack.value = true;
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS * 3);
    expect(getJson).toHaveBeenCalledTimes(1);

    store.heldBack.value = false;
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS * 3);
    expect(getJson).toHaveBeenCalledTimes(1);
    await send("serverReady");
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it("stops trying again once the connection stops, as when the page closes", async () => {
    vi.useFakeTimers();
    const { getJson, send } = setup(async () => {
      throw new HttpStatusError(500);
    });
    await send("serverReady");
    await send("stopped");
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS * 3);
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it("doesn't try again a load that fails after the connection stops", async () => {
    vi.useFakeTimers();
    let fail!: () => void;
    const { getJson, send } = setup(() => new Promise((_, reject) => (fail = () => reject(new HttpStatusError(500)))));
    await send("serverReady");
    await send("stopped");
    fail();
    await vi.advanceTimersByTimeAsync(BASELINE_RETRY_MS * 3);
    expect(getJson).toHaveBeenCalledTimes(1);
  });
});
