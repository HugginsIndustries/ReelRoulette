import type { ReadonlySignal } from "@preact/signals";
import { requestWithNotice } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";
import type { AppApi } from "../state/appApi";
import type { CopyText } from "../ui/copyText";
import type { MenuItem } from "../ui/menuModel";

/** The capability the server lists only for a browser on the server machine, while it has a desktop to open it in. */
export const SHOW_IN_FILE_MANAGER_CAPABILITY = "api.showInFileManager";

/** A library item's file, as a menu's file items act on it. */
export interface MenuFile {
  itemId: string;
  /** Its full path. */
  path: string;
  /** Its file name, which the popups name on their second line. */
  name: string;
}

/**
 * Where a library item's file is, for the menus that act on it: its name or path is copied, and the server machine's
 * file manager opens at it, for a browser on that machine. Each says so in a Your actions popup with the file's name on
 * its second line, and nothing either relays to `last.log` names the file or its path.
 */
export interface FileLocation {
  /**
   * A menu's file items: Copy name, unless `withName` is false, Copy path, on every device, and Show in File Manager
   * while the version check lists it for this browser.
   */
  menuItems(file: MenuFile, options?: { withName?: boolean }): MenuItem[];
}

export interface FileLocationOptions {
  api: Pick<AppApi, "url" | "request">;
  dialogs: Pick<Dialogs, "notice">;
  notifications: Pick<Notifications, "notify">;
  copyText: CopyText;
  /** What the last version check listed the server offering this browser. */
  capabilities: ReadonlySignal<readonly string[]>;
}

/** The key of a file item's popups, so the next one replaces the one showing. */
const FILE_POPUP_KEY = "path";

export function createFileLocation(options: FileLocationOptions): FileLocation {
  const { api, dialogs, notifications, copyText, capabilities } = options;

  async function showInFileManager(file: MenuFile): Promise<void> {
    const taken = await requestWithNotice(dialogs, "Show in File Manager failed", () =>
      api.request(api.url(`/api/show-in-file-manager/${encodeURIComponent(file.itemId)}`), { method: "POST" })
    );
    if (taken) {
      notifications.notify({ kind: "actions", text: "Opened in the file manager.", detail: file.name, key: FILE_POPUP_KEY });
    }
  }

  return {
    menuItems(file, { withName = true } = {}) {
      const items: MenuItem[] = [];
      if (withName) {
        const nameWords = { copied: "Name copied.", failed: "Couldn't copy the name.", detail: file.name, key: FILE_POPUP_KEY };
        items.push({ label: "Copy name", icon: "content_copy", onPick: (element) => void copyText(file.name, nameWords, element) });
      }
      const pathWords = { copied: "Path copied.", failed: "Couldn't copy the path.", detail: file.name, key: FILE_POPUP_KEY };
      items.push({ label: "Copy path", icon: "content_copy", onPick: (element) => void copyText(file.path, pathWords, element) });
      if (capabilities.peek().includes(SHOW_IN_FILE_MANAGER_CAPABILITY)) {
        items.push({ label: "Show in File Manager", icon: "folder_open", onPick: () => void showInFileManager(file) });
      }
      return items;
    }
  };
}
