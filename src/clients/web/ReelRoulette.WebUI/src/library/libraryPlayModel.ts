import { requestFailure, type HttpStatusError, type RequestFailure } from "../api/serverRequest";
import { couldNotLoadMessage, type MediaKind } from "../playback/mediaFailure";

/**
 * What a play the server refused says, for an item of `mediaType`, worded as `requestFailure` words "Playback failed",
 * except a missing, unavailable, unsupported, or unreadable file, which says so in its own words. A 401 never reaches
 * here: the play shows the pairing prompt instead.
 */
export function playRefusalFailure(refusal: HttpStatusError, mediaType: MediaKind): RequestFailure {
  const failure = requestFailure("Playback failed", refusal);
  const text = refusedFileText(refusal, mediaType);
  return text ? { text, logText: failure.logText } : failure;
}

/** The text for a refusal about the file itself, or null for any other refusal. */
function refusedFileText(refusal: HttpStatusError, mediaType: MediaKind): string | null {
  switch (refusal.status) {
    case 404:
      return "Media not found. The file may have moved or been deleted.";
    case 409:
      return "This item is unavailable.";
    case 415:
      return "This file type is not supported.";
    default:
      // The server couldn't read the file, such as on a stalled drive or share. Another 503 says why itself.
      return refusal.status === 503 && refusal.code === "play_media_unreadable" ? couldNotLoadMessage(mediaType) : null;
  }
}
