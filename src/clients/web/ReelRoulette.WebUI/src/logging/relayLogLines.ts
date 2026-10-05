/**
 * Lines the WebUI relays to the server log. They never carry item ids (which are file paths), file names, or media
 * URLs (which carry a media token); the attempt id ties the lines of one playback attempt together.
 */

/** The item playing now, as far as relayed log lines need it. */
export interface RelayLogCurrentItem {
  id?: string;
}

/** Playback context keys whose values hold no item details. Any other key is left out of the line. */
const SAFE_TRACE_CONTEXT_KEYS = new Set(["mediaType", "statusCode", "code", "expectedPlayAttemptId", "message"]);

/** Builds the line relayed to the server log when the status text changes. */
export function statusLogLine(
  status: string,
  current: RelayLogCurrentItem | null | undefined,
  attemptId: number
): string {
  return `status=${status} hasCurrent=${current != null} attempt=${attemptId}`;
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
