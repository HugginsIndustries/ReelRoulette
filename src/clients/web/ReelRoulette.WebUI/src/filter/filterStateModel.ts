/**
 * WebUI filter state aligned with desktop FilterState JSON and server ParseFilterState.
 * Enums use numeric values (System.Text.Json default for C# enums).
 */

export const AUDIO_FILTER = { PlayAll: 0, WithAudioOnly: 1, WithoutAudioOnly: 2 } as const;
export const MEDIA_TYPE_FILTER = { All: 0, VideosOnly: 1, PhotosOnly: 2 } as const;
export const TAG_MATCH_MODE = { And: 0, Or: 1 } as const;

export type AudioFilterMode = (typeof AUDIO_FILTER)[keyof typeof AUDIO_FILTER];
export type MediaTypeFilter = (typeof MEDIA_TYPE_FILTER)[keyof typeof MEDIA_TYPE_FILTER];
export type TagMatchMode = (typeof TAG_MATCH_MODE)[keyof typeof TAG_MATCH_MODE];

export interface FilterState {
  favoritesOnly: boolean;
  excludeBlacklisted: boolean;
  onlyNeverPlayed: boolean;
  onlyKnownDuration: boolean;
  onlyKnownLoudness: boolean;
  audioFilter: AudioFilterMode;
  mediaTypeFilter: MediaTypeFilter;
  /** Legacy: parallel to per-category modes; desktop keeps hidden UI default AND */
  tagMatchMode: TagMatchMode;
  /** true = AND across categories, false = OR; null/absent treated as AND on server via Core */
  globalMatchMode: boolean | null;
  categoryLocalMatchModes: Record<string, TagMatchMode> | null;
  selectedTags: string[];
  excludedTags: string[];
  includedSourceIds: string[];
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
}

export function createDefaultFilterState(): FilterState {
  return {
    favoritesOnly: false,
    excludeBlacklisted: true,
    onlyNeverPlayed: false,
    onlyKnownDuration: false,
    onlyKnownLoudness: false,
    audioFilter: AUDIO_FILTER.PlayAll,
    mediaTypeFilter: MEDIA_TYPE_FILTER.All,
    tagMatchMode: TAG_MATCH_MODE.And,
    globalMatchMode: true,
    categoryLocalMatchModes: null,
    selectedTags: [],
    excludedTags: [],
    includedSourceIds: [],
    minDurationSeconds: null,
    maxDurationSeconds: null
  };
}

export function cloneFilterState(source: FilterState): FilterState {
  return {
    ...source,
    selectedTags: [...source.selectedTags],
    excludedTags: [...source.excludedTags],
    includedSourceIds: [...source.includedSourceIds],
    categoryLocalMatchModes: source.categoryLocalMatchModes
      ? { ...source.categoryLocalMatchModes }
      : null
  };
}

/** Desktop FilterDialog.FormatTimeSpan */
export function formatDurationForDisplay(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "";
  }
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours >= 1) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Serialize duration for `filterState` JSON sent to the server.
 * Always `HH:MM:SS` so `TimeSpan.TryParse` (InvariantCulture) matches desktop `TimeSpan` JSON;
 * two-part strings are parsed as hours:minutes on the server, not minutes:seconds.
 */
export function formatDurationForApi(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "00:00:00";
  }
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Desktop FilterDialog.ParseTimeSpan — returns seconds or null if empty/invalid */
export function parseDurationInputToSeconds(text: string): number | null | "invalid" {
  const raw = String(text || "").trim();
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
    return "invalid";
  }
  if (parts.length === 3) {
    const hours = Number.parseInt(parts[0]!, 10);
    const minutes = Number.parseInt(parts[1]!, 10);
    const seconds = Number.parseInt(parts[2]!, 10);
    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(seconds) &&
      hours >= 0 &&
      minutes >= 0 &&
      minutes < 60 &&
      seconds >= 0 &&
      seconds < 60
    ) {
      return hours * 3600 + minutes * 60 + seconds;
    }
    return "invalid";
  }

  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  return "invalid";
}

function durationToApiValue(seconds: number): string {
  return formatDurationForApi(seconds);
}

/** Serialize for POST /api/random and preset snapshots (matches desktop JsonSerializer shape). */
export function serializeFilterStateForApi(state: FilterState): Record<string, unknown> {
  const out: Record<string, unknown> = {
    favoritesOnly: state.favoritesOnly,
    excludeBlacklisted: state.excludeBlacklisted,
    onlyNeverPlayed: state.onlyNeverPlayed,
    onlyKnownDuration: state.onlyKnownDuration,
    onlyKnownLoudness: state.onlyKnownLoudness,
    audioFilter: state.audioFilter,
    mediaTypeFilter: state.mediaTypeFilter,
    tagMatchMode: state.tagMatchMode,
    globalMatchMode: state.globalMatchMode,
    selectedTags: [...state.selectedTags],
    excludedTags: [...state.excludedTags],
    includedSourceIds: [...state.includedSourceIds]
  };

  if (state.categoryLocalMatchModes && Object.keys(state.categoryLocalMatchModes).length > 0) {
    const modes: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.categoryLocalMatchModes)) {
      modes[k] = v;
    }
    out.categoryLocalMatchModes = modes;
  }

  if (state.minDurationSeconds != null && Number.isFinite(state.minDurationSeconds)) {
    out.minDuration = durationToApiValue(state.minDurationSeconds);
  }
  if (state.maxDurationSeconds != null && Number.isFinite(state.maxDurationSeconds)) {
    out.maxDuration = durationToApiValue(state.maxDurationSeconds);
  }

  return out;
}

function readDurationFromUnknown(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const p = parseDurationInputToSeconds(value);
    if (p === "invalid") {
      return null;
    }
    return p;
  }
  return null;
}

function readEnumInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fallback;
}

/** Hydrate from API preset filterState object (partial). */
export function filterStateFromApiObject(raw: unknown): FilterState {
  const base = createDefaultFilterState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.favoritesOnly === "boolean") {
    base.favoritesOnly = o.favoritesOnly;
  }
  if (typeof o.excludeBlacklisted === "boolean") {
    base.excludeBlacklisted = o.excludeBlacklisted;
  }
  if (typeof o.onlyNeverPlayed === "boolean") {
    base.onlyNeverPlayed = o.onlyNeverPlayed;
  }
  if (typeof o.onlyKnownDuration === "boolean") {
    base.onlyKnownDuration = o.onlyKnownDuration;
  }
  if (typeof o.onlyKnownLoudness === "boolean") {
    base.onlyKnownLoudness = o.onlyKnownLoudness;
  }

  base.audioFilter = readEnumInt(o.audioFilter, base.audioFilter) as AudioFilterMode;
  base.mediaTypeFilter = readEnumInt(o.mediaTypeFilter, base.mediaTypeFilter) as MediaTypeFilter;
  base.tagMatchMode = readEnumInt(o.tagMatchMode, base.tagMatchMode) as TagMatchMode;

  if (typeof o.globalMatchMode === "boolean") {
    base.globalMatchMode = o.globalMatchMode;
  } else if (o.globalMatchMode === null) {
    base.globalMatchMode = null;
  }

  if (Array.isArray(o.selectedTags)) {
    base.selectedTags = o.selectedTags.map((x) => String(x)).filter(Boolean);
  }
  if (Array.isArray(o.excludedTags)) {
    base.excludedTags = o.excludedTags.map((x) => String(x)).filter(Boolean);
  }
  if (Array.isArray(o.includedSourceIds)) {
    base.includedSourceIds = o.includedSourceIds.map((x) => String(x)).filter(Boolean);
  }

  if (o.categoryLocalMatchModes && typeof o.categoryLocalMatchModes === "object" && !Array.isArray(o.categoryLocalMatchModes)) {
    const cm: Record<string, TagMatchMode> = {};
    for (const [k, v] of Object.entries(o.categoryLocalMatchModes as Record<string, unknown>)) {
      cm[k] = readEnumInt(v, TAG_MATCH_MODE.And) as TagMatchMode;
    }
    base.categoryLocalMatchModes = Object.keys(cm).length ? cm : null;
  }

  base.minDurationSeconds = readDurationFromUnknown(o.minDuration);
  base.maxDurationSeconds = readDurationFromUnknown(o.maxDuration);

  return base;
}

/** Stable comparison for preset auto-select (mirrors desktop string compare of serialized JSON). */
export function filterStatesEqualForPresetMatch(a: FilterState, b: FilterState): boolean {
  const sa = JSON.stringify(serializeFilterStateForApi(a));
  const sb = JSON.stringify(serializeFilterStateForApi(b));
  return sa === sb;
}

export interface PresetRow {
  name: string;
  filterState: FilterState;
}

export function presetsToPostBody(rows: PresetRow[]): { name: string; filterState: Record<string, unknown> }[] {
  return rows.map((r) => ({
    name: r.name,
    filterState: serializeFilterStateForApi(r.filterState)
  }));
}
