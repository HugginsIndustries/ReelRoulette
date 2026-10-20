import { batch, signal, type ReadonlySignal, type Signal } from "@preact/signals";

/** The seek indicator fades out this long after the last seek, and the next seek's total starts over. */
export const SEEK_INDICATOR_MS = 1000;

/** One side's seek indicator: whether it shows, and the seconds it reads, which stay as it fades out. */
export interface SeekIndicatorSide {
  readonly shown: boolean;
  readonly seconds: number;
}

const HIDDEN: SeekIndicatorSide = { shown: false, seconds: 0 };

/**
 * The seek indicator, as YouTube shows it, for J, L, and double-taps: "+ 5" with a chevron on the player's right for a
 * forward seek, and "− 5" on its left for a back seek. Seeks the same way add up, each counting its full step even at
 * the video's start or end. It fades out `SEEK_INDICATOR_MS` after the last seek, and the total then starts over, as
 * it does with a seek the other way.
 */
export interface SeekIndicator {
  readonly back: ReadonlySignal<SeekIndicatorSide>;
  readonly forward: ReadonlySignal<SeekIndicatorSide>;
  /** A seek by `seconds`, back for a negative number. */
  seeked(seconds: number): void;
  /** Hides it at once and starts the total over, as a new item plays and as the player lets go of its elements. */
  clear(): void;
}

function hide(side: Signal<SeekIndicatorSide>): void {
  if (side.peek().shown) side.value = { shown: false, seconds: side.peek().seconds };
}

export function createSeekIndicator(): SeekIndicator {
  const back = signal(HIDDEN);
  const forward = signal(HIDDEN);
  /** The seconds the seeks add up to since the total last started over, back for a negative number. */
  let total = 0;
  let fade: ReturnType<typeof setTimeout> | null = null;

  function clear(): void {
    if (fade !== null) clearTimeout(fade);
    fade = null;
    total = 0;
    batch(() => {
      hide(back);
      hide(forward);
    });
  }

  return {
    back,
    forward,
    seeked(seconds) {
      if (!seconds) return;
      if (Math.sign(seconds) !== Math.sign(total)) total = 0;
      total += seconds;
      const [shown, other] = total > 0 ? [forward, back] : [back, forward];
      batch(() => {
        shown.value = { shown: true, seconds: Math.abs(total) };
        hide(other);
      });
      if (fade !== null) clearTimeout(fade);
      fade = setTimeout(clear, SEEK_INDICATOR_MS);
    },
    clear
  };
}
