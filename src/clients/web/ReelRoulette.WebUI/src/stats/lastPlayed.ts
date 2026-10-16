import { parseUtcMs } from "../library/libraryProjectionModel";

/**
 * When the playing item was last played before this play. Only a playback event carries it, so an event for the item
 * playing sets it, and one for an item that isn't playing yet, as a library play's can be, since the server sends its
 * event before it answers, is held until that item starts. Until an event says, the item's own last-played time
 * stands in.
 */
export interface LastPlayedBeforePlay {
  /** The playing item changed, to `itemId` or to nothing. Playing the same item again keeps what an event said. */
  started(itemId: string | null | undefined): void;
  /**
   * A playback event for `itemId`, with its `previousLastPlayedUtc` as it came: null for an item never played before,
   * or undefined when the event left it out, which changes nothing.
   */
  recorded(itemId: string | null | undefined, previousLastPlayedUtc: unknown): void;
  /** The time to show for the playing item, in UTC milliseconds, or null for Never, given the item's own time. */
  shownFor(itemLastPlayedUtcMs: number | null): number | null;
}

interface KnownTime {
  utcMs: number | null;
}

function idKey(itemId: string | null | undefined): string {
  return itemId != null ? String(itemId).trim() : "";
}

export function createLastPlayedBeforePlay(): LastPlayedBeforePlay {
  let playing = "";
  let shown: KnownTime | null = null;
  let held: (KnownTime & { itemId: string }) | null = null;

  return {
    started(itemId) {
      const key = idKey(itemId);
      if (key === playing) {
        return;
      }
      playing = key;
      shown = key && held?.itemId === key ? { utcMs: held.utcMs } : null;
      held = null;
    },
    recorded(itemId, previousLastPlayedUtc) {
      const key = idKey(itemId);
      if (!key || previousLastPlayedUtc === undefined) {
        return;
      }
      const utcMs = parseUtcMs(previousLastPlayedUtc);
      if (key === playing) {
        shown = { utcMs };
      } else {
        held = { itemId: key, utcMs };
      }
    },
    shownFor(itemLastPlayedUtcMs) {
      return shown ? shown.utcMs : itemLastPlayedUtcMs;
    }
  };
}
