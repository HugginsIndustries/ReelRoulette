import { errorText, refusalReason, UnauthorizedError } from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";
import type { AppApi } from "../state/appApi";

/** The capability the server lists only for a browser on the server machine, while it has a desktop to open it in. */
export const SHOW_IN_FILE_MANAGER_CAPABILITY = "api.showInFileManager";

/**
 * Where the playing file is: the server machine's file manager opens at it, for a browser on that machine, and
 * elsewhere its path is copied. Each says so in a Your actions popup with the file's name on its second line, and
 * nothing either relays to `last.log` names the file or its path.
 */
export interface FileLocation {
  /** Asks the server to open its file manager at the item's file. */
  showInFileManager(itemId: string, fileName: string): Promise<void>;
  /**
   * Copies the path, with the Clipboard API where the browser has it, and otherwise from a hidden text field next to
   * `button`, which gets focus back, since a page served over plain HTTP to another device has no Clipboard API.
   */
  copyPath(path: string, fileName: string, button: HTMLElement): Promise<void>;
}

export interface FileLocationOptions {
  api: Pick<AppApi, "url" | "request">;
  dialogs: Pick<Dialogs, "notice">;
  notifications: Pick<Notifications, "notify">;
}

export function createFileLocation(options: FileLocationOptions): FileLocation {
  const { api, dialogs, notifications } = options;

  async function showInFileManager(itemId: string, fileName: string): Promise<void> {
    const failed = "Show in File Manager failed";
    let response: Response;
    try {
      response = await api.request(api.url(`/api/show-in-file-manager/${encodeURIComponent(itemId)}`), {
        method: "POST"
      });
    } catch (error) {
      // A 401 shows only the pairing prompt, which the request has asked for.
      if (!(error instanceof UnauthorizedError)) {
        void dialogs.notice(`${failed}: ${errorText(error)}`);
      }
      return;
    }
    if (!response.ok) {
      const logText = `${failed} (${response.status}).`;
      const reason = await refusalReason(response);
      void dialogs.notice(reason ? `${failed}: ${reason}` : logText, logText);
      return;
    }
    notifications.notify({ kind: "actions", text: "Opened in the file manager.", detail: fileName, key: "path" });
  }

  async function copyPath(path: string, fileName: string, button: HTMLElement): Promise<void> {
    // Without the Clipboard API, the field copies within the tap, which a copy needs on iOS.
    const clipboard = typeof navigator.clipboard?.writeText === "function" ? navigator.clipboard : null;
    let copied = false;
    if (clipboard) {
      try {
        await clipboard.writeText(path);
        copied = true;
      } catch {
        // The browser refused, so the field tries.
      }
    }
    if (!copied) {
      copied = copyFromField(path, button);
    }
    if (copied) {
      notifications.notify({ kind: "actions", text: "Path copied.", detail: fileName, key: "path" });
    } else {
      void dialogs.notice("Couldn't copy the path.");
    }
  }

  return { showInFileManager, copyPath };
}

/**
 * Copies `text` from a read-only text field next to `button`, out of sight but not hidden, since iOS won't select a
 * hidden one, and inside the page's fullscreen stage when it is in fullscreen. The field goes, and `button` gets focus
 * back, either way.
 */
function copyFromField(text: string, button: HTMLElement): boolean {
  const field = document.createElement("textarea");
  field.readOnly = true;
  field.value = text;
  field.tabIndex = -1;
  field.setAttribute("aria-hidden", "true");
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
  button.after(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    button.focus({ preventScroll: true });
  }
}
