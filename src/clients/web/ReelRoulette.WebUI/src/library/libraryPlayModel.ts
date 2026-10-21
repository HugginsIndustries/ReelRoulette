import type { PlayItemResult } from "../api/coreApi";
import { couldNotLoadMessage, type MediaKind } from "../playback/mediaFailure";

/**
 * What a play the server refused says, for an item of `mediaType`. A 401 never reaches here: the play shows the pairing
 * prompt instead.
 */
export function mapPlayItemErrorToStatus(result: Extract<PlayItemResult, { ok: false }>, mediaType: MediaKind): string {
  switch (result.statusCode) {
    case 404:
      return "Media not found. The file may have moved or been deleted.";
    case 409:
      return "This item is unavailable.";
    case 415:
      return "This file type is not supported.";
    default:
      // The server couldn't read the file, such as on a stalled drive or share. Another 503 says why itself.
      if (result.statusCode === 503 && result.code === "play_media_unreadable") {
        return couldNotLoadMessage(mediaType);
      }
      return result.error?.trim() || "Playback failed.";
  }
}
