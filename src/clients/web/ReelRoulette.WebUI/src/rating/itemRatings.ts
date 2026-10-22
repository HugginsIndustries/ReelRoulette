import { signal } from "@preact/signals";
import { requestWithNotice } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";
import { basenameFromPath } from "../playback/nowPlaying";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import { parseRating, RATING_KEY_PAUSE_MS, ratingText } from "./rating";

/** An item as a rating control shows it: its id, its file's name for the popups, and the rating it shows now. */
export interface RatedItem {
  itemId: string;
  fileName: string;
  shown: number | null;
}

/**
 * Item ratings as this device sets and shows them. A new rating shows at once. A pointer's is sent at once, and a
 * key's once the keys pause, focus leaves the control, or another item plays, each to the item it was set on, so
 * stepping through several values sends one request, and one still waiting when the page closes is dropped. A change
 * that ends on the rating it started from sends nothing.
 * The server's answer pops up as Your actions, and a request that fails puts the rating back with a notice. Another
 * device's change, from `itemRatingChanged`, pops up as Other devices.
 */
export interface ItemRatings {
  /**
   * The rating to show for an item whose read gave `read`: this device's change still waiting or on its way, else the
   * latest one the server answered or an event brought, else `read`. It reads a signal, so a view follows it.
   */
  shown(itemId: string, read: number | null): number | null;
  /** Sets the item's rating, or clears it with null, sending a key's change once the keys pause. */
  set(item: RatedItem, rating: number | null, options: { byKey: boolean }): void;
  /** Sends a key's change still waiting, as when focus leaves the control. */
  send(): void;
  /**
   * Takes the playing item's rating as a new read gives it, such as a history step's play answer, so a change made
   * while the item wasn't playing shows, though this device no longer keeps it, as after a resync.
   */
  takeRead(itemId: string, rating: number | null): void;
}

export interface ItemRatingsOptions {
  store: Pick<AppStore, "identity" | "current">;
  api: Pick<AppApi, "post">;
  connection: Pick<ServerConnection, "on">;
  dialogs: Pick<Dialogs, "notice">;
  notifications: Pick<Notifications, "notify">;
}

/** `itemRatingChanged` as the WebUI reads it. */
interface ItemRatingChangedPayload {
  itemId?: string | null;
  path?: string | null;
  rating?: number | null;
  clientId?: string | null;
}

/** A change waiting for the keys to pause: the item it was set on, the rating it started from, and the new one. */
interface WaitingChange {
  itemId: string;
  fileName: string;
  before: number | null;
  rating: number | null;
}

/** The popup's text for a rating set, or cleared with null. */
function changeText(rating: number | null): string {
  return rating === null ? "Rating cleared" : `Rated ${ratingText(rating)}`;
}

export function createItemRatings(options: ItemRatingsOptions): ItemRatings {
  const { store, api, connection, dialogs, notifications } = options;
  /** Moves on with every change to what `shown` gives. */
  const changes = signal(0);
  let waiting: WaitingChange | null = null;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  /** The last request sent for each item still on its way, numbered so an older answer leaves a newer request. */
  const sending = new Map<string, { rating: number | null; request: number }>();
  let requests = 0;
  /** The rating the server last answered or an event last brought, by item id, until a resync. */
  const confirmed = new Map<string, number | null>();

  function changed(): void {
    changes.value += 1;
  }

  /**
   * Keeps the rating the server answered or an event brought. On the playing item it also becomes the item's read, as
   * its favorite does, so the player keeps showing it through a resync, which no read of the player's own follows.
   */
  function keepConfirmed(itemId: string, rating: number | null): void {
    confirmed.set(itemId, rating);
    keepRead(itemId, rating);
  }

  /** Makes `rating` the playing item's read, when `itemId` plays. */
  function keepRead(itemId: string, rating: number | null): void {
    const playing = store.current.peek();
    if (playing?.itemId === itemId) {
      playing.rating = rating;
    }
  }

  function send(): void {
    clearTimeout(pauseTimer);
    const change = waiting;
    if (!change) {
      return;
    }
    waiting = null;
    if (change.rating === change.before) {
      changed();
      return;
    }
    void post(change);
  }

  async function post(change: WaitingChange): Promise<void> {
    const request = ++requests;
    sending.set(change.itemId, { rating: change.rating, request });
    changed();
    const taken = await requestWithNotice(dialogs, "Rating update failed", () =>
      // The client id comes back on the change's event, so this device can tell its own change from another's.
      api.post("/api/rating", { itemId: change.itemId, rating: change.rating, clientId: store.identity.clientId })
    );
    if (taken) {
      keepConfirmed(change.itemId, change.rating);
    }
    if (sending.get(change.itemId)?.request === request) {
      sending.delete(change.itemId);
    }
    changed();
    if (taken) {
      notifications.notify({ kind: "actions", text: changeText(change.rating), detail: change.fileName, key: "rating" });
    }
  }

  connection.on("itemRatingChanged", (payload: ItemRatingChangedPayload | null | undefined) => {
    const itemId = payload?.itemId;
    if (!payload || !itemId) return;
    const rating = parseRating(payload.rating);
    keepConfirmed(itemId, rating);
    changed();
    // This device's own change already said so, as Your actions. An event without a client id counts as another
    // device's. Its own key keeps it from replacing another device's favorite popup for the same file.
    if (payload.clientId && payload.clientId === store.identity.clientId) {
      return;
    }
    notifications.notify({
      kind: "devices",
      text: `${changeText(rating)} on another device`,
      detail: basenameFromPath(payload.path || ""),
      key: `sync-rating:${itemId}`
    });
  });
  // Events may have been missed, so the ratings they brought may be out of date; the reads that follow have them.
  connection.on("resyncRequired", () => {
    confirmed.clear();
    changed();
  });
  // The connection stops as the page closes, so a change still waiting for the keys is dropped.
  connection.on("stopped", () => {
    clearTimeout(pauseTimer);
    waiting = null;
  });
  // A change waiting for the keys goes to the item it was set on before another plays.
  store.current.subscribe(() => send());

  return {
    shown(itemId, read) {
      void changes.value;
      if (waiting?.itemId === itemId) {
        return waiting.rating;
      }
      const sent = sending.get(itemId);
      if (sent) {
        return sent.rating;
      }
      return confirmed.has(itemId) ? confirmed.get(itemId)! : read;
    },
    set(item, rating, { byKey }) {
      if (waiting && waiting.itemId !== item.itemId) {
        send();
      }
      waiting ??= { itemId: item.itemId, fileName: item.fileName, before: item.shown, rating };
      waiting.rating = rating;
      changed();
      clearTimeout(pauseTimer);
      if (byKey) {
        pauseTimer = setTimeout(send, RATING_KEY_PAUSE_MS);
      } else {
        send();
      }
    },
    send,
    takeRead(itemId, rating) {
      keepRead(itemId, rating);
      changed();
    }
  };
}
