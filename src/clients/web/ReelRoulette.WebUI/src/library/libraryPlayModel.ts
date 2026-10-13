import type { PlayItemResult } from "../api/coreApi";

/** What a play the server refused says. A 401 never reaches here: the play shows the pairing prompt instead. */
export function mapPlayItemErrorToStatus(result: Extract<PlayItemResult, { ok: false }>): string {
  switch (result.statusCode) {
    case 404:
      return "Media not found. The file may have moved or been deleted.";
    case 409:
      return "This item is unavailable.";
    case 415:
      return "This file type is not supported.";
    default:
      return result.error?.trim() || "Playback failed.";
  }
}
