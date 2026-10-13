import { signal, type ReadonlySignal } from "@preact/signals";

/** How long something must keep loading before the player's indicator says Loading…, so a quick load shows nothing. */
export const LOADING_GRACE_MS = 500;

/** What is loading: a random pick waiting for the server, a library play waiting for it, or the media itself. */
export type LoadingReason = "pick" | "play" | "media";

/**
 * What the player is waiting for. Loading… shows once something has been held for the grace time, counted once from
 * the first hold until every hold ends, so a pick and its media load are one loading period.
 */
export interface LoadingHolds {
  /** Loading… shows. */
  readonly shown: ReadonlySignal<boolean>;
  hold(reason: LoadingReason): void;
  release(reason: LoadingReason): void;
  /** Ends every hold, such as when the player detaches. */
  releaseAll(): void;
}

export function createLoadingHolds(graceMs: number = LOADING_GRACE_MS): LoadingHolds {
  const holds = new Set<LoadingReason>();
  const shown = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function endIfNothingHeld(): void {
    if (holds.size > 0) {
      return;
    }
    clearTimeout(timer);
    timer = undefined;
    shown.value = false;
  }

  return {
    shown,

    hold(reason) {
      holds.add(reason);
      // The grace counts from the first hold, so a hold added while another is held doesn't start it again.
      if (timer === undefined && !shown.peek()) {
        timer = setTimeout(() => {
          timer = undefined;
          shown.value = holds.size > 0;
        }, graceMs);
      }
    },

    release(reason) {
      holds.delete(reason);
      endIfNothingHeld();
    },

    releaseAll() {
      holds.clear();
      endIfNothingHeld();
    }
  };
}
