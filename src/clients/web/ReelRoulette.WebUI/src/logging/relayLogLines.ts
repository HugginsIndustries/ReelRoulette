/**
 * Lines the WebUI relays to the server log. They never carry item ids (which are file paths), file names, or media
 * URLs (which carry a media token); the attempt id ties the lines of one playback attempt together.
 */

import { HttpStatusError } from "../api/serverRequest";

/** The item playing now, as far as relayed log lines need it. */
export interface RelayLogCurrentItem {
  id?: string;
}

/** Playback context keys whose values hold no item details. Any other key is left out of the line. */
const SAFE_TRACE_CONTEXT_KEYS = new Set(["mediaType", "statusCode", "code", "expectedPlayAttemptId", "message", "timeoutMs"]);

/** Builds the `status=` line relayed to the server log for a message: a popup, a notice, a lasting state, or a text that shows nothing. */
export function statusLogLine(
  status: string,
  current: RelayLogCurrentItem | null | undefined,
  attemptId: number
): string {
  return `status=${status} hasCurrent=${current != null} attempt=${attemptId}`;
}

/**
 * Builds the line relayed to the server log when a screen fails to render. It names the error's type only, since
 * an error message can hold a file name.
 */
export function screenErrorLine(screen: string, error: unknown): string {
  const type = error instanceof Error ? error.name || "Error" : typeof error;
  return `ui-error screen=${screen} error=${type}`;
}

/** Builds the line relayed to the server log for a playback step. */
export function playbackTraceLine(
  event: string,
  current: RelayLogCurrentItem | null | undefined,
  attemptId: number,
  context: Record<string, unknown> = {}
): string {
  const parts = [
    `playback=${event}`,
    `attempt=${attemptId}`,
    `hasCurrent=${current != null}`
  ];
  for (const [key, value] of Object.entries(context)) {
    if (SAFE_TRACE_CONTEXT_KEYS.has(key)) {
      parts.push(`${key}=${value == null ? "null" : String(value)}`);
    }
  }

  return parts.join(" ");
}

/**
 * Builds the line relayed to the server log when the Filter or Tags tab fails to load again for a server event. It
 * names the failure's HTTP status, or the error's type, never its message, which can hold a name.
 */
export function eventLoadFailedLine(tab: "filter" | "tags", error: unknown): string {
  if (error instanceof HttpStatusError) {
    return `${tab}=event-load-failed status=${error.status}`;
  }
  const type = error instanceof Error ? error.name || "Error" : typeof error;
  return `${tab}=event-load-failed error=${type}`;
}
