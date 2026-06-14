import { parseLibraryProjectionSummary, type LibraryProjectionSummary } from "./libraryOverlayModel";

export type LibraryMediaType = "video" | "photo";

export interface LibraryProjectionSource {
  id: string;
  isEnabled: boolean;
}

export interface LibraryProjectionCategory {
  id: string;
  name: string;
}

export interface LibraryProjectionTag {
  name: string;
  categoryId: string;
}

export interface LibraryProjectionCatalog {
  sources: LibraryProjectionSource[];
  categories: LibraryProjectionCategory[];
  tags: LibraryProjectionTag[];
}

export interface LibraryProjectionItem {
  id: string;
  sourceId: string;
  fileName: string;
  fullPath: string | null;
  relativePath: string;
  playCount: number;
  lastPlayedUtcMs: number | null;
  lastWriteTimeUtcMs: number | null;
  durationSeconds: number | null;
  mediaType: LibraryMediaType;
  isFavorite: boolean;
  isBlacklisted: boolean;
  hasAudio: boolean | null;
  integratedLoudness: number | null;
  tags: string[];
  hasThumbnail: boolean;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

export interface ParsedLibraryProjection {
  catalog: LibraryProjectionCatalog;
  items: LibraryProjectionItem[];
  summary: LibraryProjectionSummary;
}

export function parseDurationSeconds(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":");
  if (parts.length === 2) {
    const minutes = Number.parseInt(parts[0]!, 10);
    const seconds = Number.parseInt(parts[1]!, 10);
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60) {
      return minutes * 60 + seconds;
    }
    return null;
  }
  if (parts.length === 3) {
    const hours = Number.parseInt(parts[0]!, 10);
    const minutes = Number.parseInt(parts[1]!, 10);
    const secs = Number.parseInt(parts[2]!, 10);
    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(secs) &&
      hours >= 0 &&
      minutes >= 0 &&
      minutes < 60 &&
      secs >= 0 &&
      secs < 60
    ) {
      return hours * 3600 + minutes * 60 + secs;
    }
    return null;
  }
  const numeric = Number.parseFloat(raw);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
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

function parseCatalog(raw: Record<string, unknown>): LibraryProjectionCatalog {
  const sources: LibraryProjectionSource[] = [];
  for (const source of Array.isArray(raw.sources) ? raw.sources : []) {
    if (!source || typeof source !== "object") {
      continue;
    }
    const row = source as Record<string, unknown>;
    if (row.id == null) {
      continue;
    }
    sources.push({
      id: String(row.id),
      isEnabled: row.isEnabled !== false
    });
  }

  const categories: LibraryProjectionCategory[] = [];
  for (const category of Array.isArray(raw.categories) ? raw.categories : []) {
    if (!category || typeof category !== "object") {
      continue;
    }
    const row = category as Record<string, unknown>;
    if (row.id == null) {
      continue;
    }
    categories.push({
      id: String(row.id),
      name: row.name != null ? String(row.name) : String(row.id)
    });
  }

  const tags: LibraryProjectionTag[] = [];
  for (const tag of Array.isArray(raw.tags) ? raw.tags : []) {
    if (!tag || typeof tag !== "object") {
      continue;
    }
    const row = tag as Record<string, unknown>;
    const name = row.name != null ? String(row.name).trim() : "";
    if (!name) {
      continue;
    }
    tags.push({
      name,
      categoryId: row.categoryId != null ? String(row.categoryId) : ""
    });
  }

  return { sources, categories, tags };
}

function parseOptionalPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return null;
}

function parseItem(row: Record<string, unknown>, enabledSourceIds: Set<string>): LibraryProjectionItem | null {
  const sourceId = row.sourceId != null ? String(row.sourceId) : "";
  if (!enabledSourceIds.has(sourceId)) {
    return null;
  }
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
    lastWriteTimeUtcMs: parseUtcMs(row.lastWriteTimeUtc),
    durationSeconds: parseDurationSeconds(row.duration),
    mediaType: parseMediaType(row.mediaType),
    isFavorite: row.isFavorite === true,
    isBlacklisted: row.isBlacklisted === true,
    hasAudio: typeof row.hasAudio === "boolean" ? row.hasAudio : null,
    integratedLoudness:
      typeof row.integratedLoudness === "number" && Number.isFinite(row.integratedLoudness)
        ? row.integratedLoudness
        : null,
    tags: parseStringArray(row.tags),
    hasThumbnail: row.hasThumbnail === true,
    thumbnailWidth: parseOptionalPositiveInt(row.thumbnailWidth),
    thumbnailHeight: parseOptionalPositiveInt(row.thumbnailHeight)
  };
}

export function parseLibraryProjection(raw: unknown): ParsedLibraryProjection {
  const proj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const catalog = parseCatalog(proj);
  const enabledSourceIds = new Set(catalog.sources.filter((s) => s.isEnabled).map((s) => s.id));

  const items: LibraryProjectionItem[] = [];
  for (const item of Array.isArray(proj.items) ? proj.items : []) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const parsed = parseItem(item as Record<string, unknown>, enabledSourceIds);
    if (parsed) {
      items.push(parsed);
    }
  }

  return {
    catalog,
    items,
    summary: parseLibraryProjectionSummary(raw)
  };
}
