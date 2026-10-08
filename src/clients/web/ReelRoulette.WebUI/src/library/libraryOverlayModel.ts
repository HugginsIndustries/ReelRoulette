export type LibraryOverlayMessagePhase = "loading" | "empty" | "error";

export interface LibraryProjectionSummary {
  totalItems: number;
  enabledSourceCount: number;
  hasItems: boolean;
}

export const LIBRARY_OVERLAY_FETCH_ERROR =
  "Could not load library. Core runtime is unavailable or still recovering.";

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
  /** An error, shown as an alert. */
  error: boolean;
  /** Read out by screen readers when it changes. */
  live: boolean;
}

export function libraryOverlayMessage(
  phase: LibraryOverlayMessagePhase,
  errorMessage: string | null
): LibraryOverlayMessage {
  if (phase === "loading") {
    return { text: "Loading library…", error: false, live: true };
  }
  if (phase === "error") {
    return { text: errorMessage || "Could not load library.", error: true, live: false };
  }
  return { text: "No media in library.", error: false, live: false };
}
