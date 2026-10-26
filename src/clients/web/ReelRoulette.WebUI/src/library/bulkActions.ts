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
import type { MenuGroups } from "../ui/menuModel";
import type { LibraryProjectionItem } from "./libraryProjectionModel";
import type { LibrarySelection } from "./librarySelection";

type BulkChangeResponse = components["schemas"]["BulkChangeResponse"];
type ClearPlaybackStatsResponse = components["schemas"]["ClearPlaybackStatsResponse"];
type DeleteFilesResponse = components["schemas"]["DeleteFilesResponse"];
type BulkFlag = components["schemas"]["BulkItemStateRequest"]["flag"];

/** The popups' key, so a bulk action's popup replaces the last one's. */
export const BULK_POPUP_KEY = "bulk";

/** Rate's tooltip while no rating is chosen. */
export const CHOOSE_RATING_REASON = "Choose a rating first";

/** Clear playback stats…' tooltip while none of the items it would act on has stats to clear. */
export const NO_PLAYBACK_STATS_REASON = "No playback stats to clear";

/** What a menu's actions act on: every selected item, read when an action is picked, or one item alone. */
export type BulkTarget = { kind: "selection" } | { kind: "item"; itemId: string };

/**
 * What the items a menu acts on are, as its items need: how many are in the library, and how many of them are
 * favorites, are blacklisted, or have playback stats to clear.
 */
export interface BulkSummary {
  count: number;
  favoriteCount: number;
  blacklistedCount: number;
  playedCount: number;
}

/** A favorite or blacklist action of the library's menus. */
export interface BulkFlagAction {
  /** The menu's label, which its failure names. */
  label: string;
  icon: string;
  flag: BulkFlag;
  value: boolean;
  /** Whether it would change any of the items `summary` describes, which a menu shows it only while it would. */
  applies: (summary: BulkSummary) => boolean;
  /** Its popup, for the items the server counted. */
  done: (items: string) => string;
}

export const BULK_FLAG_ACTIONS: readonly BulkFlagAction[] = [
  {
    label: "Add to favorites",
    icon: "heart_plus",
    flag: "favorite",
    value: true,
    applies: (summary) => summary.favoriteCount < summary.count,
    done: (items) => `Added ${items} to favorites.`
  },
  {
    label: "Remove from favorites",
    icon: "heart_minus",
    flag: "favorite",
    value: false,
    applies: (summary) => summary.favoriteCount > 0,
    done: (items) => `Removed ${items} from favorites.`
  },
  {
    label: "Add to blacklist",
    icon: "thumb_down",
    flag: "blacklist",
    value: true,
    applies: (summary) => summary.blacklistedCount < summary.count,
    done: (items) => `Blacklisted ${items}.`
  },
  {
    label: "Remove from blacklist",
    icon: "thumb_up",
    flag: "blacklist",
    value: false,
    applies: (summary) => summary.blacklistedCount > 0,
    done: (items) => `Removed ${items} from the blacklist.`
  }
];

/**
 * The summary of the items `ids` name from the loaded tiles, or null when one of them isn't loaded, so only the server
 * can say.
 */
export function summarizeLoaded(ids: readonly string[], loaded: readonly LibraryProjectionItem[]): BulkSummary | null {
  const byId = new Map(loaded.map((item) => [item.id, item]));
  const summary: BulkSummary = { count: 0, favoriteCount: 0, blacklistedCount: 0, playedCount: 0 };
  for (const id of new Set(ids)) {
    const item = byId.get(id);
    if (!item) {
      return null;
    }
    summary.count++;
    summary.favoriteCount += item.isFavorite ? 1 : 0;
    summary.blacklistedCount += item.isBlacklisted ? 1 : 0;
    summary.playedCount += item.playCount > 0 || item.lastPlayedUtcMs !== null ? 1 : 0;
  }
  return summary;
}

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
 * The library menus' actions, the Selection actions menu's and a tile's, each on what it acts on, every selected item,
 * loaded or not, or one item, in one request. Each says what it did in a Your actions popup, with the count the server
 * answered, and the tiles and the playing item follow this device's own event. A failure shows in the notice.
 */
export interface BulkActions {
  /** The Rate dialog, or null while it doesn't show. */
  readonly rateDialog: ReadonlySignal<RateDialogView | null>;
  /** The ids `target` names: the selected items' now, or its one item's. */
  targetIds(target: BulkTarget): string[];
  /**
   * A menu's items for `target`, in their groups: the favorite and blacklist actions that apply to the items `summary`
   * describes, or all four while it is null, as when its read failed; Rate…; Clear playback stats…, disabled with its
   * reason while none has stats to clear; and Delete files…, which names one file for one item.
   */
  menuGroups(target: BulkTarget, summary: BulkSummary | null): MenuGroups;
  setFlag(action: BulkFlagAction, target: BulkTarget): Promise<void>;
  /** Rate…: opens the Rate dialog with no rating chosen. */
  openRate(target: BulkTarget): void;
  /** The dialog's stars choose a rating, which sets nothing yet. */
  chooseRating(rating: number | null): void;
  /** Rate: sets the chosen rating on every item the dialog opened for. */
  rate(): Promise<void>;
  /** Clear rating: clears the rating of every item the dialog opened for. */
  clearRating(): Promise<void>;
  cancelRate(): void;
  /** Clear playback stats…: asks first. */
  clearPlaybackStats(target: BulkTarget): Promise<void>;
  /**
   * Delete files…: asks for the control token when the server wants it, then to confirm, then ends selection when it
   * acts on the selection, and deletes the files and removes their items.
   */
  deleteFiles(target: BulkTarget): Promise<void>;
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
  /** The items the Rate dialog rates, as its menu named them when it opened. */
  let rateIds: string[] = [];

  function popup(text: string): void {
    notifications.notify({ kind: "actions", text, key: BULK_POPUP_KEY });
  }

  function post<T>(failed: string, path: string, body: unknown): Promise<T | null> {
    return readWithNotice(dialogs, failed, () => api.postJson(path, body) as Promise<T>);
  }

  function targetIds(target: BulkTarget): string[] {
    return target.kind === "selection" ? selection.ids() : [target.itemId];
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

  const actions: BulkActions = {
    rateDialog,
    targetIds,

    menuGroups(target, summary) {
      const one = targetIds(target).length === 1;
      return [
        BULK_FLAG_ACTIONS.filter((action) => !summary || action.applies(summary)).map((action) => ({
          label: action.label,
          icon: action.icon,
          onPick: () => void actions.setFlag(action, target)
        })),
        [
          { label: "Rate…", icon: "star", onPick: () => actions.openRate(target) },
          {
            label: "Clear playback stats…",
            icon: "delete_history",
            disabledReason: summary && summary.playedCount === 0 ? NO_PLAYBACK_STATS_REASON : null,
            onPick: () => void actions.clearPlaybackStats(target)
          }
        ],
        [
          {
            label: one ? "Delete file…" : "Delete files…",
            icon: "delete_forever",
            danger: true,
            onPick: () => void actions.deleteFiles(target)
          }
        ]
      ];
    },

    async setFlag(action, target) {
      const answer = await post<BulkChangeResponse>(`${action.label} failed`, "/api/bulk/item-state", {
        itemIds: targetIds(target),
        flag: action.flag,
        value: action.value,
        clientId: store.identity.clientId
      });
      if (answer) {
        popup(action.done(countText(answer.count, "item")));
      }
    },

    openRate(target) {
      rateIds = targetIds(target);
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

    async clearPlaybackStats(target) {
      const itemIds = targetIds(target);
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

    async deleteFiles(target) {
      const failed = "Delete files failed";
      const itemIds = targetIds(target);
      if (!(await controlAccess.ensure(failed))) {
        return;
      }
      if (!(await dialogs.confirm({ ...deleteFilesConfirmation(itemIds.length), danger: true }))) {
        return;
      }
      // Selection ends once a delete of the selection is confirmed, so its answer, however late, never ends a later one;
      // a delete of one item alone leaves the selection as it is. The removed items' event updates the grid.
      if (target.kind === "selection") {
        selection.clear();
      }
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
  return actions;
}
