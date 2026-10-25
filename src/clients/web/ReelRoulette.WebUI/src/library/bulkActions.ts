import { signal, type ReadonlySignal } from "@preact/signals";
import type { ControlAccess } from "../api/controlAccess";
import { readWithNotice } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";
import { ratingText } from "../rating/rating";
import type { AppApi } from "../state/appApi";
import type { AppStore } from "../state/appStore";
import { countText } from "../text/countText";
import type { components } from "../types/openapi.generated";
import type { LibrarySelection } from "./librarySelection";

type BulkChangeResponse = components["schemas"]["BulkChangeResponse"];
type ClearPlaybackStatsResponse = components["schemas"]["ClearPlaybackStatsResponse"];
type DeleteFilesResponse = components["schemas"]["DeleteFilesResponse"];
type BulkFlag = components["schemas"]["BulkItemStateRequest"]["flag"];

/** The popups' key, so a bulk action's popup replaces the last one's. */
export const BULK_POPUP_KEY = "bulk";

/** Rate's tooltip while no rating is chosen. */
export const CHOOSE_RATING_REASON = "Choose a rating first";

/** A favorite or blacklist action of the Selection actions menu. */
export interface BulkFlagAction {
  /** The menu's label, which its failure names. */
  label: string;
  flag: BulkFlag;
  value: boolean;
  /** Its popup, for the items the server counted. */
  done: (items: string) => string;
}

export const BULK_FLAG_ACTIONS: readonly BulkFlagAction[] = [
  { label: "Add to favorites", flag: "favorite", value: true, done: (items) => `Added ${items} to favorites.` },
  { label: "Remove from favorites", flag: "favorite", value: false, done: (items) => `Removed ${items} from favorites.` },
  { label: "Add to blacklist", flag: "blacklist", value: true, done: (items) => `Blacklisted ${items}.` },
  { label: "Remove from blacklist", flag: "blacklist", value: false, done: (items) => `Removed ${items} from the blacklist.` }
];

/** The Rate dialog while it shows: how many items it rates, and the rating chosen, or null before one is. */
export interface RateDialogView {
  count: number;
  rating: number | null;
}

/** The delete action's confirmation and its button, for `count` files. */
export function deleteFilesConfirmation(count: number): { message: string; confirmLabel: string } {
  const one = count === 1;
  return {
    message: `Permanently delete ${countText(count, "file")} from disk and remove ${one ? "it" : "them"} from the library? This can't be undone.`,
    confirmLabel: one ? "Delete 1 File" : `Delete ${count.toLocaleString()} Files`
  };
}

/** The notice for files the delete action couldn't delete, whose items stay. */
export function filesKeptText(count: number): string {
  return count === 1
    ? "1 file couldn't be deleted, so its item stays in the library."
    : `${countText(count, "file")} couldn't be deleted, so their items stay in the library.`;
}

/**
 * The Selection actions menu's actions, each on every selected item, loaded or not, in one request. Each says what it
 * did in a Your actions popup, with the count the server answered, and the tiles and the playing item follow this
 * device's own event. A failure shows in the notice.
 */
export interface BulkActions {
  /** The Rate dialog, or null while it doesn't show. */
  readonly rateDialog: ReadonlySignal<RateDialogView | null>;
  setFlag(action: BulkFlagAction): Promise<void>;
  /** Rate…: opens the Rate dialog with no rating chosen. */
  openRate(): void;
  /** The dialog's stars choose a rating, which sets nothing yet. */
  chooseRating(rating: number | null): void;
  /** Rate: sets the chosen rating on every selected item. */
  rate(): Promise<void>;
  /** Clear rating: clears every selected item's rating. */
  clearRating(): Promise<void>;
  cancelRate(): void;
  /** Clear playback stats…: asks first. */
  clearPlaybackStats(): Promise<void>;
  /**
   * Delete files…: asks for the control token when the server wants it, then to confirm, then ends selection and
   * deletes the files and removes their items.
   */
  deleteFiles(): Promise<void>;
}

export interface BulkActionsOptions {
  store: Pick<AppStore, "identity">;
  api: Pick<AppApi, "postJson">;
  dialogs: Pick<Dialogs, "notice" | "confirm">;
  notifications: Pick<Notifications, "notify">;
  controlAccess: Pick<ControlAccess, "ensure">;
  selection: LibrarySelection;
}

export function createBulkActions(options: BulkActionsOptions): BulkActions {
  const { store, api, dialogs, notifications, controlAccess, selection } = options;
  const rateDialog = signal<RateDialogView | null>(null);
  /** The items the Rate dialog rates, as selected when it opened. */
  let rateIds: string[] = [];

  function popup(text: string): void {
    notifications.notify({ kind: "actions", text, key: BULK_POPUP_KEY });
  }

  function post<T>(failed: string, path: string, body: unknown): Promise<T | null> {
    return readWithNotice(dialogs, failed, () => api.postJson(path, body) as Promise<T>);
  }

  async function sendRating(rating: number | null): Promise<void> {
    rateDialog.value = null;
    const answer = await post<BulkChangeResponse>("Rating update failed", "/api/bulk/rating", {
      itemIds: rateIds,
      rating,
      clientId: store.identity.clientId
    });
    if (answer) {
      const items = countText(answer.count, "item");
      popup(rating === null ? `Cleared the rating on ${items}.` : `Rated ${items} ${ratingText(rating)}.`);
    }
  }

  return {
    rateDialog,

    async setFlag(action) {
      const answer = await post<BulkChangeResponse>(`${action.label} failed`, "/api/bulk/item-state", {
        itemIds: selection.ids(),
        flag: action.flag,
        value: action.value,
        clientId: store.identity.clientId
      });
      if (answer) {
        popup(action.done(countText(answer.count, "item")));
      }
    },

    openRate() {
      rateIds = selection.ids();
      rateDialog.value = { count: rateIds.length, rating: null };
    },

    chooseRating(rating) {
      const view = rateDialog.peek();
      if (view) {
        rateDialog.value = { ...view, rating };
      }
    },

    async rate() {
      const rating = rateDialog.peek()?.rating ?? null;
      if (rating !== null) {
        await sendRating(rating);
      }
    },

    clearRating: () => sendRating(null),

    cancelRate() {
      rateDialog.value = null;
    },

    async clearPlaybackStats() {
      const itemIds = selection.ids();
      const confirmed = await dialogs.confirm({
        message: `Clear playback stats for ${countText(itemIds.length, "item")}?`,
        confirmLabel: "Clear",
        danger: true
      });
      if (!confirmed) {
        return;
      }
      const answer = await post<ClearPlaybackStatsResponse>("Clear playback stats failed", "/api/playback/clear-stats", { itemIds });
      if (answer) {
        popup(`Cleared playback stats for ${countText(answer.count, "item")}.`);
      }
    },

    async deleteFiles() {
      const failed = "Delete files failed";
      const itemIds = selection.ids();
      if (!(await controlAccess.ensure(failed))) {
        return;
      }
      if (!(await dialogs.confirm({ ...deleteFilesConfirmation(itemIds.length), danger: true }))) {
        return;
      }
      // Selection ends once the delete is confirmed, so its answer, however late, never ends a later one. The removed
      // items' event updates the grid.
      selection.clear();
      const answer = await post<DeleteFilesResponse>(failed, "/api/library/delete-files", { itemIds });
      if (!answer) {
        return;
      }
      if (answer.deletedCount > 0) {
        popup(`Deleted ${countText(answer.deletedCount, "file")}.`);
      }
      if (answer.failedItemIds.length > 0) {
        void dialogs.notice(filesKeptText(answer.failedItemIds.length));
      }
    }
  };
}
