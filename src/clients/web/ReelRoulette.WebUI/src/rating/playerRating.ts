import { computed, effect, signal, untracked, type ReadonlySignal } from "@preact/signals";
import type { AudioStage } from "../playback/audioStage";
import { playingFileName } from "../playback/nowPlaying";
import type { AppStore } from "../state/appStore";
import type { ItemRatings } from "./itemRatings";
import { stepRating } from "./rating";

/**
 * The playing item's rating as the player shows and sets it: its star, the stars the star opens at the player's center
 * (the popover), and the rating keys. The rating shows through Item Ratings, with the random or play response's rating
 * as its read, so the Stats tab's stars, the popover's, and the keys share one change waiting to be sent. Nothing opens
 * or changes while nothing plays or while the server asks for pairing.
 */
export interface PlayerRating {
  /** The playing item's rating as it shows now, or null while it has none or nothing plays. */
  readonly shown: ReadonlySignal<number | null>;
  /** The popover is open. */
  readonly popoverOpen: ReadonlySignal<boolean>;
  /**
   * Opens the popover on the playing item, hiding the volume indicator, which shows where it does. Returns whether it
   * opened.
   */
  openPopover(): boolean;
  closePopover(): void;
  /** Sets the playing item's rating, or clears it with null, sending a key's change once the keys pause. */
  set(rating: number | null, options: { byKey: boolean }): void;
  /** Steps the playing item's rating half a star down, for -1, or up, for 1, as a key's change. */
  step(direction: -1 | 1): void;
  /** Sends a key's change still waiting, as when focus leaves the stars. */
  send(): void;
}

export interface PlayerRatingOptions {
  store: Pick<AppStore, "current" | "pairingRequired">;
  ratings: Pick<ItemRatings, "shown" | "set" | "send">;
  audio: Pick<AudioStage, "indicatorShown" | "hideIndicator">;
}

export function createPlayerRating(options: PlayerRatingOptions): PlayerRating {
  const { store, ratings, audio } = options;
  const popoverOpen = signal(false);
  const shown = computed(() => {
    const playing = store.current.value;
    return playing?.itemId ? ratings.shown(playing.itemId, playing.rating ?? null) : null;
  });

  /** The playing item's id and file name while it can be rated, or null. */
  function rateable(): { itemId: string; fileName: string } | null {
    const playing = store.current.peek();
    if (!playing?.itemId || store.pairingRequired.peek()) {
      return null;
    }
    return { itemId: playing.itemId, fileName: playingFileName(playing) };
  }

  function closePopover(): void {
    popoverOpen.value = false;
  }

  function set(rating: number | null, { byKey }: { byKey: boolean }): void {
    const item = rateable();
    if (item) {
      ratings.set({ ...item, shown: shown.peek() }, rating, { byKey });
    }
  }

  // Another item playing closes the popover, so a rating goes only to the item it was opened for.
  store.current.subscribe(closePopover);
  // The volume indicator shows where the popover does, so a volume change or M closes it and the two never show at once.
  effect(() => {
    if (audio.indicatorShown.value) untracked(closePopover);
  });

  return {
    shown,
    popoverOpen,
    openPopover() {
      if (!rateable()) {
        return false;
      }
      audio.hideIndicator();
      popoverOpen.value = true;
      return true;
    },
    closePopover,
    set,
    step(direction) {
      set(stepRating(shown.peek(), direction), { byKey: true });
    },
    send: () => ratings.send()
  };
}
