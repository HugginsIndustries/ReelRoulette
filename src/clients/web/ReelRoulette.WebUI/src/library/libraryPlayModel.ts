import type { PlayItemResult } from "../api/coreApi";

export function mapPlayItemErrorToStatus(result: Extract<PlayItemResult, { ok: false }>): string {
  if (result.statusCode === 401) {
    return "Unauthorized. Pair first.";
  }

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
