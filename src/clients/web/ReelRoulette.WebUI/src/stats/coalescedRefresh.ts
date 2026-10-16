/** How long a refresh request waits, so a burst of events shares one refresh. */
export const REFRESH_GATHER_MS = 250;

export interface CoalescedRefresh {
  /** Asks for a refresh. Settles once a refresh that started after this request has finished. */
  request(): Promise<void>;
}

/**
 * Coalesces refreshes: a request waits a short time so a burst of requests shares
 * one `run`, one `run` goes at a time, and requests made during one get exactly one more after it. `run` reports its
 * own failures; one that throws still lets the next run go.
 */
export function createCoalescedRefresh(run: () => Promise<void>, gatherMs = REFRESH_GATHER_MS): CoalescedRefresh {
  let next: { promise: Promise<void>; resolve: () => void } | null = null;
  let running = false;
  const waiting = () => next !== null;

  async function loop(): Promise<void> {
    do {
      await new Promise((resolve) => setTimeout(resolve, gatherMs));
      const covered = next!;
      next = null;
      try {
        await run();
      } catch {
        // `run` reports its own failures.
      } finally {
        covered.resolve();
      }
    } while (waiting());
    running = false;
  }

  return {
    request() {
      if (!next) {
        let resolve!: () => void;
        const promise = new Promise<void>((settle) => (resolve = settle));
        next = { promise, resolve };
      }
      const covered = next.promise;
      if (!running) {
        running = true;
        void loop();
      }
      return covered;
    }
  };
}
