import { signal, type ReadonlySignal } from "@preact/signals";

/** A confirmation: a prompt that asks before an action. */
export interface ConfirmRequest {
  message: string;
  /** Names the action, such as Delete or Discard. */
  confirmLabel: string;
  /** A red confirming button, for an action that deletes or discards something. */
  danger?: boolean;
}

/** A confirmation or a notice that is showing. */
export type OpenDialog =
  | { id: number; kind: "confirm"; message: string; confirmLabel: string; danger: boolean }
  | { id: number; kind: "notice"; message: string };

/**
 * The page's confirmations and notices, shown in the in-app dialog. Anything the user needs to notice or act on
 * shows here, never in a browser dialog and never on the status line.
 */
export interface Dialogs {
  /** The confirmations and notices showing, oldest first, so each new one stacks above the last. */
  readonly open: ReadonlySignal<readonly OpenDialog[]>;
  /** Asks before an action. True when the user confirms; false for Cancel, Escape, or a click outside. */
  confirm(request: ConfirmRequest): Promise<boolean>;
  /**
   * Shows a message the user must see, with one OK, and relays it to `last.log` as a status message is relayed.
   * `logText` replaces `message` in the log when `message` names a file or preset. Settles when it closes.
   */
  notice(message: string, logText?: string): Promise<void>;
  /** Closes one: true for its confirming button or OK, false for Cancel, Escape, or a click outside. */
  answer(id: number, confirmed: boolean): void;
}

export interface DialogsOptions {
  /** Relays a status message's text to `last.log`, as the status line does. */
  relayStatus: (logText: string) => void;
}

export function createDialogs(options: DialogsOptions): Dialogs {
  const open = signal<readonly OpenDialog[]>([]);
  const settles = new Map<number, (confirmed: boolean) => void>();
  let lastId = 0;

  function show(dialog: OpenDialog, settle: (confirmed: boolean) => void): void {
    settles.set(dialog.id, settle);
    open.value = [...open.peek(), dialog];
  }

  return {
    open,

    confirm(request) {
      return new Promise((resolve) => {
        const { message, confirmLabel, danger = false } = request;
        show({ id: ++lastId, kind: "confirm", message, confirmLabel, danger }, resolve);
      });
    },

    notice(message, logText = message) {
      options.relayStatus(logText);
      return new Promise((resolve) => show({ id: ++lastId, kind: "notice", message }, () => resolve()));
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
