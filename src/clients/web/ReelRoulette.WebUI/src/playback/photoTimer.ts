/**
 * A photo's timer, which moves on after the photo duration. It holds and resumes with the time it had left, and moves
 * to a position. It measures the time by a clock, so a browser that delays timers in a hidden tab doesn't stretch it.
 */
export interface PhotoTimer {
  /** A timer is set, running or held. */
  readonly active: boolean;
  readonly running: boolean;
  /** Its length, in milliseconds, or 0 once cleared. */
  readonly length: number;
  /** The milliseconds it has run, up to its length. */
  elapsed(): number;
  /** Starts its full length from now. */
  start(lengthMs: number): void;
  /** Holds it, keeping the time it has left. */
  hold(): void;
  /** Runs a held timer on with the time it had left. */
  resume(): void;
  /** Moves it to `elapsedMs`, running on from there or staying held. */
  seek(elapsedMs: number): void;
  clear(): void;
}

export interface PhotoTimerOptions {
  /** It reached its length. It is no longer set, and shows its whole length as run. */
  onEnd(): void;
  /** Milliseconds by a steady clock. Defaults to `performance.now()`. */
  now?: () => number;
}

export function createPhotoTimer(options: PhotoTimerOptions): PhotoTimer {
  const now = options.now ?? (() => performance.now());
  let active = false;
  let length = 0;
  /** The time run before `startedAt`, or all of it while held. */
  let banked = 0;
  /** When it last started running, or null while held or not set. */
  let startedAt: number | null = null;
  let endId: ReturnType<typeof setTimeout> | null = null;

  function stopClock(): void {
    if (endId !== null) {
      clearTimeout(endId);
      endId = null;
    }
  }

  function elapsed(): number {
    const running = startedAt === null ? 0 : now() - startedAt;
    return Math.max(0, Math.min(length, banked + running));
  }

  function run(): void {
    stopClock();
    startedAt = now();
    endId = setTimeout(end, Math.max(0, length - banked));
  }

  function end(): void {
    stopClock();
    active = false;
    startedAt = null;
    banked = length;
    options.onEnd();
  }

  return {
    get active() {
      return active;
    },
    get running() {
      return startedAt !== null;
    },
    get length() {
      return length;
    },
    elapsed,

    start(lengthMs) {
      active = true;
      length = Math.max(0, lengthMs);
      banked = 0;
      run();
    },

    hold() {
      if (startedAt === null) {
        return;
      }
      banked = elapsed();
      startedAt = null;
      stopClock();
    },

    resume() {
      if (active && startedAt === null) {
        run();
      }
    },

    seek(elapsedMs) {
      if (!active) {
        return;
      }
      banked = Math.max(0, Math.min(length, elapsedMs));
      if (startedAt !== null) {
        run();
      }
    },

    clear() {
      stopClock();
      active = false;
      length = 0;
      banked = 0;
      startedAt = null;
    }
  };
}
