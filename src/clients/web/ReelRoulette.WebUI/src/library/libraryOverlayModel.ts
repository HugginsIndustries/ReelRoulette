export type LibraryOverlayPhase = "closed" | "loading" | "ready" | "empty" | "error";

export interface LibraryProjectionSummary {
  totalItems: number;
  enabledSourceCount: number;
  hasItems: boolean;
}

export interface LibraryOverlayState {
  phase: LibraryOverlayPhase;
  openCount: number;
  fetchCount: number;
  summary: LibraryProjectionSummary | null;
  lastError: string | null;
}

export const LIBRARY_OVERLAY_FETCH_ERROR =
  "Could not load library. Core runtime is unavailable or still recovering.";

export function createLibraryOverlayState(): LibraryOverlayState {
  return {
    phase: "closed",
    openCount: 0,
    fetchCount: 0,
    summary: null,
    lastError: null
  };
}

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

export function beginLibraryOverlayOpen(state: LibraryOverlayState): LibraryOverlayState {
  return {
    ...state,
    phase: "loading",
    openCount: state.openCount + 1,
    fetchCount: state.fetchCount + 1,
    summary: null,
    lastError: null
  };
}

export function completeLibraryOverlayFetch(
  state: LibraryOverlayState,
  summary: LibraryProjectionSummary
): LibraryOverlayState {
  return {
    ...state,
    phase: summary.hasItems ? "ready" : "empty",
    summary,
    lastError: null
  };
}

export function failLibraryOverlayFetch(state: LibraryOverlayState, message: string): LibraryOverlayState {
  return {
    ...state,
    phase: "error",
    summary: null,
    lastError: message
  };
}

export function closeLibraryOverlayState(state: LibraryOverlayState): LibraryOverlayState {
  return {
    ...state,
    phase: "closed",
    summary: null,
    lastError: null
  };
}

export function formatLibrarySummaryMessage(summary: LibraryProjectionSummary): string {
  const itemLabel = summary.totalItems.toLocaleString();
  const sourceLabel = summary.enabledSourceCount.toLocaleString();
  return `Library loaded — ${itemLabel} items (${sourceLabel} enabled sources)`;
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

export interface LibraryBrowseRenderInput {
  summaryLine: string;
  visibleItems: readonly { fileName: string }[];
  searchQuery: string;
}

export function renderLibraryBrowseHtml(input: LibraryBrowseRenderInput): string {
  const summary = `<p class="library-overlay-summary" aria-live="polite">${escapeHtml(input.summaryLine)}</p>`;
  if (input.visibleItems.length === 0) {
    const trimmed = String(input.searchQuery || "").trim();
    const message = trimmed
      ? `No matches for “${trimmed}”.`
      : "No items match the current filter.";
    return `${summary}<p class="library-overlay-status">${escapeHtml(message)}</p>`;
  }
  const rows = input.visibleItems
    .map((item) => `<li class="library-overlay-result-row">${escapeHtml(item.fileName)}</li>`)
    .join("");
  return `${summary}<ul class="library-overlay-results-list">${rows}</ul>`;
}
