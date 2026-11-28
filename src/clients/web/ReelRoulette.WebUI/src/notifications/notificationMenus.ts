import type { CopyText, CopyWords } from "../ui/copyText";
import type { MenuGroups, MenuItem } from "../ui/menuModel";
import type { NotificationEntry, Notifications, Popup } from "./notifications";

const TEXT_COPY: CopyWords = { copied: "Text copied.", failed: "Couldn't copy the text.", key: "copy" };

/**
 * The menus on the bell's list entries and on the popups. Copy text copies the message, with its second line on a line
 * of its own, and Dismiss removes that one.
 */
export interface NotificationMenus {
  /** A message's menu in the list: Copy text, then Dismiss, which takes it out of the list. */
  entryGroups(entry: NotificationEntry): MenuGroups;
  /** A lasting state's menu under Now: Copy text alone, since the state stays while it lasts. */
  stateGroups(text: string, detail: string | null): MenuGroups;
  /** A popup's menu: Copy text, then Dismiss, which closes it. */
  popupGroups(popup: Popup): MenuGroups;
}

export interface NotificationMenusOptions {
  notifications: Pick<Notifications, "removeEntry" | "dismiss">;
  copyText: CopyText;
}

export function createNotificationMenus({ notifications, copyText }: NotificationMenusOptions): NotificationMenus {
  function copyItem(text: string, detail: string | null): MenuItem {
    return { label: "Copy text", icon: "content_copy", onPick: (element) => void copyText(detail ? `${text}\n${detail}` : text, TEXT_COPY, element) };
  }

  function dismissItem(onPick: () => void): MenuItem {
    return { label: "Dismiss", icon: "close", onPick };
  }

  return {
    entryGroups(entry) {
      return [[copyItem(entry.text, entry.detail), dismissItem(() => notifications.removeEntry(entry.id))]];
    },

    stateGroups(text, detail) {
      return [[copyItem(text, detail)]];
    },

    popupGroups(popup) {
      return [[copyItem(popup.entry.text, popup.entry.detail), dismissItem(() => notifications.dismiss(popup.id))]];
    }
  };
}
