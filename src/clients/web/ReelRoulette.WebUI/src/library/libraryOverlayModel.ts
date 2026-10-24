export type LibraryOverlayMessagePhase = "loading" | "empty" | "error";

export interface LibraryProjectionSummary {
  totalItems: number;
  enabledSourceCount: number;
  hasItems: boolean;
}

/** What the grid says when the library has media but none matches the search or the applied filter. */
export const LIBRARY_NO_MATCH_MESSAGE = "Nothing matches the search or filters.";

/**
 * What the body says for a load answered with 408 or 504, a timeout from the server or a proxy in between, as when the
 * server waits on a slow or disconnected drive or share.
 */
export const LIBRARY_LOAD_TIMEOUT_MESSAGE =
  "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share.";

/** The statuses that mean a load timed out on its way: the server's own 408 or a proxy's 504. */
const TIMEOUT_STATUSES: readonly number[] = [408, 504];

export function parseLibraryProjectionSummary(raw: unknown): LibraryProjectionSummary {
  const proj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sources = Array.isArray(proj.sources) ? proj.sources : [];
  const enabled = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      continue;
    }
    const row = source as Record<string, unknown>;
    if (row.id != null && row.isEnabled !== false) {
      enabled.add(String(row.id));
    }
  }

  const items = Array.isArray(proj.items) ? proj.items : [];
  let totalItems = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const sourceId = row.sourceId != null ? String(row.sourceId) : "";
    if (enabled.has(sourceId)) {
      totalItems++;
    }
  }

  return {
    totalItems,
    enabledSourceCount: enabled.size,
    hasItems: totalItems > 0
  };
}

/** What the overlay's body says while it has no tiles to show. */
export interface LibraryOverlayMessage {
  text: string;
  /** An error, which shows in the error color. */
  error: boolean;
}

/**
 * A failed load reads `failureText`, such as "Library load failed.", or the timeout message when the server answered
 * 408 or 504, and says nothing when it answered 401, whose pairing prompt is the only thing to show. `errorStatus` is
 * the failed load's HTTP status, or null when it has none.
 */
export function libraryOverlayMessage(
  phase: LibraryOverlayMessagePhase,
  failureText: string | null,
  errorStatus: number | null = null
): LibraryOverlayMessage {
  if (phase === "loading") {
    return { text: "Loading library…", error: false };
  }
  if (phase === "error") {
    if (errorStatus === 401) {
      return { text: "", error: false };
    }
    if (errorStatus !== null && TIMEOUT_STATUSES.includes(errorStatus)) {
      return { text: LIBRARY_LOAD_TIMEOUT_MESSAGE, error: true };
    }
    return { text: failureText || "Library load failed.", error: true };
  }
  return { text: "No media in library.", error: false };
}
