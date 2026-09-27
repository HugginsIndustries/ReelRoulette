export type LibraryOverlayPhase = "loading" | "ready" | "empty" | "error";

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLibraryOverlayBodyHtml(
  phase: LibraryOverlayPhase,
  summary: LibraryProjectionSummary | null,
  errorMessage: string | null
): string {
  if (phase === "loading") {
    return `<p class="library-overlay-status" aria-live="polite">Loading library…</p>`;
  }
  if (phase === "error") {
    const message = errorMessage || "Could not load library.";
    return `<p class="library-overlay-status library-overlay-status-error" role="alert">${escapeHtml(message)}</p>`;
  }
  if (phase === "empty" || (summary && !summary.hasItems)) {
    return `<p class="library-overlay-status">No media in library.</p>`;
  }
  return "";
}
