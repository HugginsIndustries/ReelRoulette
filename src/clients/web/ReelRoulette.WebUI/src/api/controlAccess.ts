import { signal, type ReadonlySignal } from "@preact/signals";
import type { Dialogs } from "../dialogs/dialogs";
import type { AppApi } from "../state/appApi";
import { EMPTY_FIELD, type FieldProblem } from "../validation/fieldValidation";
import { noticeRequestFailure, refusalError } from "./serverRequest";

export const CONTROL_TOKEN_TITLE = "Control token";
export const CONTROL_TOKEN_MESSAGE = "This is an admin action. Enter the server's control token.";

/** The server's reason for a wrong token, for a refusal that gives none. */
const WRONG_TOKEN_REASON = "The control token is wrong.";

/** The control-token prompt while it shows: the token typed, and its problem from the field validation pattern. */
export interface ControlTokenPromptView {
  token: string;
  /** Empty while no token is typed, and the server's reason while the token is the one it refused. */
  problem: FieldProblem | null;
}

/**
 * Whether this device may do an admin action, which the server accepts as it accepts the `/control` routes: from the
 * server machine, or with a control session. From another machine without one, it asks for the control token, whose
 * accepted answer is a control session, so the next admin action asks for none.
 */
export interface ControlAccess {
  /** The control-token prompt, or null while it doesn't show. */
  readonly prompt: ReadonlySignal<ControlTokenPromptView | null>;
  /**
   * Asks the server, and on its 401 shows the prompt. True once the server allows admin actions; false for Cancel, or
   * a failure, which shows in the notice as "{failed}: {why}".
   */
  ensure(failed: string): Promise<boolean>;
  /** The token field's text, as typed. */
  input(token: string): void;
  /**
   * Continue: sends the token, while it has no problem. An accepted token closes the prompt, and a wrong one keeps it
   * open with the server's reason in the field until the token changes. Any other failure closes it and shows.
   */
  submit(): Promise<void>;
  /** Cancel, Escape, or a click outside closes the prompt. */
  cancel(): void;
}

export interface ControlAccessOptions {
  api: Pick<AppApi, "requestAroundPairing">;
  dialogs: Pick<Dialogs, "notice">;
}

export function createControlAccess({ api, dialogs }: ControlAccessOptions): ControlAccess {
  const prompt = signal<ControlTokenPromptView | null>(null);
  let token = "";
  /** The token the server refused, and its reason. */
  let refused: { token: string; reason: string } | null = null;
  /** What failed, for the action that asked. */
  let failedText = "";
  let settle: ((allowed: boolean) => void) | null = null;
  let sending = false;

  function problem(): FieldProblem | null {
    const typed = token.trim();
    if (!typed) {
      return EMPTY_FIELD;
    }
    return refused?.token === typed ? { message: refused.reason } : null;
  }

  function show(): void {
    prompt.value = { token, problem: problem() };
  }

  function finish(allowed: boolean): void {
    const done = settle;
    settle = null;
    prompt.value = null;
    done?.(allowed);
  }

  return {
    prompt,

    async ensure(failed) {
      let response: Response;
      try {
        response = await api.requestAroundPairing("/control/access");
      } catch (error) {
        noticeRequestFailure(dialogs, failed, error);
        return false;
      }
      if (response.ok) {
        return true;
      }
      if (response.status !== 401) {
        noticeRequestFailure(dialogs, failed, await refusalError(response));
        return false;
      }
      failedText = failed;
      token = "";
      refused = null;
      return new Promise<boolean>((resolve) => {
        settle = resolve;
        show();
      });
    },

    input(text) {
      token = text;
      show();
    },

    async submit() {
      if (!prompt.peek() || sending || problem() !== null) {
        return;
      }
      const sent = token.trim();
      sending = true;
      try {
        const response = await api.requestAroundPairing("/control/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: sent })
        });
        if (response.ok) {
          finish(true);
          return;
        }
        const error = await refusalError(response);
        if (response.status === 401) {
          refused = { token: sent, reason: error.reason ?? WRONG_TOKEN_REASON };
          show();
          return;
        }
        finish(false);
        noticeRequestFailure(dialogs, failedText, error);
      } catch (error) {
        finish(false);
        noticeRequestFailure(dialogs, failedText, error);
      } finally {
        sending = false;
      }
    },

    cancel() {
      finish(false);
    }
  };
}
