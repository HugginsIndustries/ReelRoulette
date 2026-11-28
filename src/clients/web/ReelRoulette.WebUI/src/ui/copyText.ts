import type { Dialogs } from "../dialogs/dialogs";
import type { Notifications } from "../notifications/notifications";

/** What a copy says: its Your actions popup, and its notice when it fails. */
export interface CopyWords {
  copied: string;
  failed: string;
  /** The popup's second line, such as the file's name, or none. */
  detail?: string;
  /** The popup's key, so a second copy replaces the one showing. */
  key: string;
}

/**
 * Copies `text` from a menu item's `element` and says so in a Your actions popup, or in a notice when it can't. It
 * uses the Clipboard API where the browser has it, and otherwise a hidden text field, since a page served over plain
 * HTTP to another device has no Clipboard API.
 */
export type CopyText = (text: string, words: CopyWords, element: HTMLElement) => Promise<void>;

export interface CopyTextOptions {
  dialogs: Pick<Dialogs, "notice">;
  notifications: Pick<Notifications, "notify">;
}

export function createCopyText({ dialogs, notifications }: CopyTextOptions): CopyText {
  return async (text, words, element) => {
    // The field goes in the open dialog the menu shows in, since the page outside a modal dialog takes no focus, and
    // otherwise in the fullscreen stage, where every other menu renders. Both are found from `element` as the copy
    // starts, since the menu `element` belongs to closes as it is picked; the page's body is only a guard for an
    // element outside the stage.
    const host = element.closest<HTMLElement>("dialog[open]") ?? element.closest<HTMLElement>(".fullscreen-stage") ?? element.ownerDocument.body;
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
      notifications.notify({ kind: "actions", text: words.copied, detail: words.detail, key: words.key });
    } else {
      void dialogs.notice(words.failed);
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
