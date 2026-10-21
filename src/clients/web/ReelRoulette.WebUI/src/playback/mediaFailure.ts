import { PLAYBACK_REQUEST_TIMEOUT_MS, UnauthorizedError, withTimeout } from "../api/serverRequest";
import { errorType } from "../logging/relayLogLines";
import { basenameFromPath } from "./nowPlaying";

/**
 * Why an item's media failed to load, as the server's answer for its file tells: this browser can't play its format,
 * the file is missing, or the server couldn't read it, or didn't answer.
 */
export type MediaFailure = "format" | "missing" | "unreadable";

/** A failure the player skips on from, when the play came from autoplay, Next, Previous, or a random pick. */
export type SkippedFailure = Exclude<MediaFailure, "unreadable">;

export type MediaKind = "video" | "photo";

/**
 * Files skipped in a row before the player stops on the next one's message, so a filter that matches only files this
 * browser can't play doesn't pick without end.
 */
export const SKIP_LIMIT = 10;

/** The file's extension without its dot, in lower case, or empty when it has none. */
export function fileExtension(name: string | null | undefined): string {
  const base = basenameFromPath(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** The couldn't-load message: the server couldn't read the file, or didn't answer. */
export function couldNotLoadMessage(kind: MediaKind): string {
  return `This ${kind} couldn't load. The server may be waiting on a slow or disconnected drive or share.`;
}

/** The message a failure stops on. `fileName` gives the format message its extension. */
export function mediaFailureMessage(kind: MediaKind, failure: MediaFailure, fileName: string): string {
  switch (failure) {
    case "format":
      return `This ${kind}'s format (.${fileExtension(fileName)}) isn't supported in this browser.`;
    case "missing":
      return kind === "photo" ? "Photo file not found." : "Video file not found.";
    case "unreadable":
      return couldNotLoadMessage(kind);
  }
}

/** The Skipped files popup's text for a file the player skipped. The file name goes on its second line. */
export function skipText(failure: SkippedFailure): string {
  return failure === "format" ? "Skipped a file this browser can't play." : "Skipped a missing file.";
}

export type MediaProbeResult =
  | { outcome: MediaFailure; statusCode: number }
  /** The server asked for pairing, whose prompt is the only signal. */
  | { outcome: "unauthorized" }
  | { outcome: "unreadable"; timeoutMs: number }
  /** The request failed without an answer; `error` is the error's type, never its message. */
  | { outcome: "unreadable"; error: string };

/**
 * Asks the server about a file whose media failed, with a one-byte range request to its media URL through `send`, the
 * app's request helper, and reads only the answer's status. A success means the server has the file and this browser
 * can't play its format, a 404 that it is missing, and any other answer, or none in time, that it couldn't load.
 */
export async function probeMedia(
  send: typeof fetch,
  mediaUrl: string,
  timeoutMs: number = PLAYBACK_REQUEST_TIMEOUT_MS
): Promise<MediaProbeResult> {
  const answer = await withTimeout(
    (signal) => send(mediaUrl, { method: "GET", headers: { Range: "bytes=0-0" }, signal }),
    timeoutMs
  );
  if (answer.kind === "timedOut") {
    return { outcome: "unreadable", timeoutMs };
  }
  if (answer.kind === "failed") {
    if (answer.error instanceof UnauthorizedError) {
      return { outcome: "unauthorized" };
    }
    return { outcome: "unreadable", error: errorType(answer.error) };
  }
  const response = answer.value;
  // Only the status is read; the byte isn't needed.
  void response.body?.cancel().catch(() => {});
  const statusCode = response.status;
  if (statusCode === 200 || statusCode === 206) {
    return { outcome: "format", statusCode };
  }
  return { outcome: statusCode === 404 ? "missing" : "unreadable", statusCode };
}
