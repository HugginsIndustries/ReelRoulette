import type { ReadonlySignal } from "@preact/signals";
import { requestWithNotice } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";
import type { AppApi } from "../state/appApi";
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
  /** What the last version check listed the server offering this browser. */
  capabilities: ReadonlySignal<readonly string[]>;
}

/** A copy's popup, and its notice when it fails. */
interface CopyWords {
  copied: string;
  failed: string;
}

const NAME_WORDS: CopyWords = { copied: "Name copied.", failed: "Couldn't copy the name." };
const PATH_WORDS: CopyWords = { copied: "Path copied.", failed: "Couldn't copy the path." };

export function createFileLocation(options: FileLocationOptions): FileLocation {
  const { api, dialogs, notifications, capabilities } = options;

  function notify(text: string, fileName: string): void {
    notifications.notify({ kind: "actions", text, detail: fileName, key: "path" });
  }

  async function showInFileManager(file: MenuFile): Promise<void> {
    const taken = await requestWithNotice(dialogs, "Show in File Manager failed", () =>
      api.request(api.url(`/api/show-in-file-manager/${encodeURIComponent(file.itemId)}`), { method: "POST" })
    );
    if (taken) {
      notify("Opened in the file manager.", file.name);
    }
  }

  /**
   * Copies `text`, with the Clipboard API where the browser has it, and otherwise from a hidden text field, since a
   * page served over plain HTTP to another device has no Clipboard API. The field goes in the fullscreen stage, where
   * every menu renders, found from `element` as the copy starts, since the menu `element` belongs to closes as it is
   * picked; the page's body is only a guard for an element outside the stage.
   */
  async function copy(text: string, words: CopyWords, fileName: string, element: HTMLElement): Promise<void> {
    const host = element.closest<HTMLElement>(".fullscreen-stage") ?? element.ownerDocument.body;
    // Without the Clipboard API, the field copies within the tap, which a copy needs on iOS.
    const clipboard = typeof navigator.clipboard?.writeText === "function" ? navigator.clipboard : null;
    let copied = false;
    if (clipboard) {
      try {
        await clipboard.writeText(text);
        copied = true;
      } catch {
        // The browser refused, so the field tries.
      }
    }
    if (!copied) {
      copied = copyFromField(text, host);
    }
    if (copied) {
      notify(words.copied, fileName);
    } else {
      void dialogs.notice(words.failed);
    }
  }

  return {
    menuItems(file, { withName = true } = {}) {
      const items: MenuItem[] = [];
      if (withName) {
        items.push({ label: "Copy name", icon: "content_copy", onPick: (element) => void copy(file.name, NAME_WORDS, file.name, element) });
      }
      items.push({ label: "Copy path", icon: "content_copy", onPick: (element) => void copy(file.path, PATH_WORDS, file.name, element) });
      if (capabilities.peek().includes(SHOW_IN_FILE_MANAGER_CAPABILITY)) {
        items.push({ label: "Show in File Manager", icon: "folder_open", onPick: () => void showInFileManager(file) });
      }
      return items;
    }
  };
}

/**
 * Copies `text` from a read-only text field in `host`, out of sight but not hidden, since iOS won't select a hidden
 * one. The field goes either way.
 */
function copyFromField(text: string, host: HTMLElement): boolean {
  const field = document.createElement("textarea");
  field.readOnly = true;
  field.value = text;
  // 16px, so iOS doesn't zoom in when it takes focus.
  Object.assign(field.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    padding: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    fontSize: "16px"
  });
  host.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
