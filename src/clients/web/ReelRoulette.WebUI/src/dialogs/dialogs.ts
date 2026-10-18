import { signal, type ReadonlySignal } from "@preact/signals";

/** A confirmation: a prompt that asks before an action. */
export interface ConfirmRequest {
  message: string;
  /** Names the action, such as Delete or Discard. */
  confirmLabel: string;
  /** A red confirming button, for an action that deletes or discards something. */
  danger?: boolean;
}

/** A confirmation or a notice that is showing. A notice may offer one action beside its OK. */
export type OpenDialog =
  | { id: number; kind: "confirm"; message: string; confirmLabel: string; danger: boolean }
  | { id: number; kind: "notice"; message: string; action?: string };

/**
 * The page's confirmations and notices, shown in the in-app dialog. Anything the user needs to notice or act on
 * shows here, never in a browser dialog and never only in a popup; the list behind the player's bell keeps each one.
 */
export interface Dialogs {
  /** The confirmations and notices showing, oldest first, so each new one stacks above the last. */
  readonly open: ReadonlySignal<readonly OpenDialog[]>;
  /** Asks before an action. True when the user confirms; false for Cancel, Escape, or a click outside. */
  confirm(request: ConfirmRequest): Promise<boolean>;
  /**
   * Shows a message the user must see, with one OK, and relays it to `last.log` as a status message is relayed.
   * `logText` replaces `message` in the log when `message` names a file or preset. Settles when it closes. A notice
   * whose message is already open doesn't open again, so a failure that repeats, such as a missing photo under
   * Autoplay, doesn't stack notices; it is still relayed, and settles when the one showing closes.
   */
  notice(message: string, logText?: string): Promise<void>;
  /**
   * A notice that offers one action beside its OK, such as turning a setting off, shown, relayed, and kept as a notice
   * is. True when the user chooses the action; false for OK, Escape, or a click outside.
   */
  noticeWithAction(message: string, action: string): Promise<boolean>;
  /**
   * Closes one: true for its confirming button or a notice's action, false for Cancel, OK, Escape, or a click outside.
   */
  answer(id: number, confirmed: boolean): void;
}

export interface DialogsOptions {
  /** Relays a notice's text to `last.log`. */
  relayStatus: (logText: string) => void;
  /** Keeps a notice that opens in the list behind the player's bell. A notice already open isn't kept again. */
  record?: (message: string) => void;
}

export function createDialogs(options: DialogsOptions): Dialogs {
  const open = signal<readonly OpenDialog[]>([]);
  const settles = new Map<number, (confirmed: boolean) => void>();
  /** Each open notice's promise, which a notice with the same message returns in place of opening again. */
  const noticesClosing = new Map<number, Promise<boolean>>();
  let lastId = 0;

  function show(dialog: OpenDialog, settle: (confirmed: boolean) => void): void {
    settles.set(dialog.id, settle);
    open.value = [...open.peek(), dialog];
  }

  /** Shows a notice, with its action when it has one, unless one with its message is already open. */
  function showNotice(message: string, logText: string, action?: string): Promise<boolean> {
    options.relayStatus(logText);
    const showing = open.peek().find((dialog) => dialog.kind === "notice" && dialog.message === message);
    const closing = showing && noticesClosing.get(showing.id);
    if (closing) {
      return closing;
    }
    options.record?.(message);
    const id = ++lastId;
    const closed = new Promise<boolean>((resolve) =>
      show({ id, kind: "notice", message, ...(action ? { action } : {}) }, (chosen) => {
        noticesClosing.delete(id);
        resolve(chosen);
      })
    );
    noticesClosing.set(id, closed);
    return closed;
  }

  return {
    open,

    confirm(request) {
      return new Promise((resolve) => {
        const { message, confirmLabel, danger = false } = request;
        show({ id: ++lastId, kind: "confirm", message, confirmLabel, danger }, resolve);
      });
    },

    async notice(message, logText = message) {
      await showNotice(message, logText);
    },

    noticeWithAction(message, action) {
      return showNotice(message, message, action);
    },

    answer(id, confirmed) {
      const settle = settles.get(id);
      if (!settle) {
        return;
      }
      settles.delete(id);
      open.value = open.peek().filter((dialog) => dialog.id !== id);
      settle(confirmed);
    }
  };
}
