import { parseRating } from "../rating/rating";

export type LibraryMediaType = "video" | "photo";

export interface LibraryProjectionItem {
  id: string;
  sourceId: string;
  fileName: string;
  fullPath: string | null;
  relativePath: string;
  playCount: number;
  lastPlayedUtcMs: number | null;
  /** When the file came into the library, or null when the server doesn't know. */
  dateAddedUtcMs: number | null;
  /** The file's modified time, which the app calls its date created, or null when the server doesn't know. */
  dateCreatedUtcMs: number | null;
  durationSeconds: number | null;
  mediaType: LibraryMediaType;
  isFavorite: boolean;
  isBlacklisted: boolean;
  hasAudio: boolean | null;
  integratedLoudness: number | null;
  /** The true peak in dBTP the loudness scan measured, or null when it hasn't measured one. */
  peakDb: number | null;
  /** The rating in stars, from 0.5 to 5 in half-star steps, or null for an unrated item. */
  rating: number | null;
  tags: string[];
  hasThumbnail: boolean;
  /** Changes whenever the thumbnail is written again; part of the thumbnail URL so it can be cached. */
  thumbnailVersion: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

export function parseUtcMs(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function parseMediaType(value: unknown): LibraryMediaType {
  if (typeof value === "number") {
    return value === 1 ? "photo" : "video";
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "photo" || lower === "1") {
      return "photo";
    }
  }
  return "video";
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of value) {
    if (entry == null) {
      continue;
    }
    const s = String(entry).trim();
    if (s) {
      out.push(s);
    }
  }
  return out;
}

function parseOptionalPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return null;
}

function parseQueryItem(row: Record<string, unknown>): LibraryProjectionItem {
  const sourceId = row.sourceId != null ? String(row.sourceId) : "";
  const fileName = row.fileName != null ? String(row.fileName) : "";
  const fullPathRaw = row.fullPath != null ? String(row.fullPath).trim() : "";
  return {
    id: row.id != null ? String(row.id) : fileName || sourceId,
    sourceId,
    fileName,
    fullPath: fullPathRaw || null,
    relativePath: row.relativePath != null ? String(row.relativePath) : "",
    playCount: typeof row.playCount === "number" && Number.isFinite(row.playCount) ? Math.max(0, Math.trunc(row.playCount)) : 0,
    lastPlayedUtcMs: parseUtcMs(row.lastPlayedUtc),
    dateAddedUtcMs: parseUtcMs(row.dateAddedUtc),
    dateCreatedUtcMs: parseUtcMs(row.dateCreatedUtc),
    durationSeconds:
      typeof row.durationSeconds === "number" && Number.isFinite(row.durationSeconds) && row.durationSeconds >= 0
        ? row.durationSeconds
        : null,
    mediaType: parseMediaType(row.mediaType),
    isFavorite: row.isFavorite === true,
    isBlacklisted: row.isBlacklisted === true,
    hasAudio: typeof row.hasAudio === "boolean" ? row.hasAudio : null,
    integratedLoudness:
      typeof row.integratedLoudness === "number" && Number.isFinite(row.integratedLoudness)
        ? row.integratedLoudness
        : null,
    peakDb: typeof row.peakDb === "number" && Number.isFinite(row.peakDb) ? row.peakDb : null,
    rating: parseRating(row.rating),
    tags: parseStringArray(row.tags),
    hasThumbnail: row.hasThumbnail === true,
    thumbnailVersion: typeof row.thumbnailVersion === "string" && row.thumbnailVersion !== "" ? row.thumbnailVersion : null,
    thumbnailWidth: parseOptionalPositiveInt(row.thumbnailWidth),
    thumbnailHeight: parseOptionalPositiveInt(row.thumbnailHeight)
  };
}

/** One item as `POST /api/library/item` returns it, or null for a body that isn't one. */
export function parseLibraryItem(raw: unknown): LibraryProjectionItem | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? parseQueryItem(raw as Record<string, unknown>) : null;
}

export interface LibraryQueryPageParsed {
  items: LibraryProjectionItem[];
  totalCount: number;
  searchBaselineCount: number;
}

export function parseLibraryQueryPage(raw: unknown): LibraryQueryPageParsed {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const items: LibraryProjectionItem[] = [];
  for (const item of Array.isArray(body.items) ? body.items : []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    items.push(parseQueryItem(item as Record<string, unknown>));
  }
  return {
    items,
    totalCount: readCount(body.totalCount),
    searchBaselineCount: readCount(body.searchBaselineCount)
  };
}

function readCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  return 0;
}
