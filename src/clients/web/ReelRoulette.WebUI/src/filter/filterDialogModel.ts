import { compareTagNames } from "../library/tagNameOrder";
import {
  TAG_MATCH_MODE,
  cloneFilterState,
  filterStateFromApiObject,
  formatDurationForDisplay,
  parseDurationInputToSeconds,
  type ApiFilterState,
  type AudioFilterMode,
  type FilterState,
  type MediaTypeFilter,
  type PresetRow,
  type TagMatchMode
} from "./filterStateModel";

/** The key the Uncategorized row's collapsed state is stored under. */
export const UNCATEGORIZED_COLLAPSE_KEY = "__filter_uncategorized__";

/** A media source as `GET /api/sources` returns it. */
export interface FilterSource {
  id: string;
  displayName?: string | null;
  rootPath?: string | null;
  isEnabled?: boolean;
}

/** The tag catalog as `POST /api/tag-editor/model` returns it. */
export interface FilterTagModel {
  categories?: Array<{ id: string; name: string; sortOrder?: number | null }>;
  tags?: Array<{ name: string; categoryId: string }>;
}

/**
 * What the General tab's fields show. It is filled from the working filter when the dialog opens or starts over,
 * and otherwise keeps what the user left, such as a duration that is not valid or an unchecked No minimum with an
 * empty field, which the working filter cannot hold.
 */
export interface GeneralDraft {
  favoritesOnly: boolean;
  excludeBlacklisted: boolean;
  onlyNeverPlayed: boolean;
  onlyKnownDuration: boolean;
  onlyKnownLoudness: boolean;
  mediaTypeFilter: MediaTypeFilter;
  audioFilter: AudioFilterMode;
  minText: string;
  noMin: boolean;
  maxText: string;
  noMax: boolean;
  /** Whether each source is checked, in the order of the sources list. */
  sourceChecked: boolean[];
}

export type TagChipAction = "include" | "exclude";

export interface FilterTagChip {
  name: string;
  included: boolean;
  excluded: boolean;
}

/** One category on the Tags tab. */
export interface FilterTagCategory {
  /** The category id, or null for the Uncategorized row of filter tags the catalog does not have. */
  id: string | null;
  name: string;
  /** The key the collapsed state is stored under. */
  collapseKey: string;
  collapsed: boolean;
  localMode: TagMatchMode;
  chips: FilterTagChip[];
}

export function namesEqualIgnoringCase(a: string, b: string): boolean {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function containsIgnoringCase(list: readonly string[], value: string): boolean {
  return list.some((entry) => namesEqualIgnoringCase(entry, value));
}

function removeIgnoringCase(list: string[], value: string): void {
  const index = list.findIndex((entry) => namesEqualIgnoringCase(entry, value));
  if (index >= 0) {
    list.splice(index, 1);
  }
}

export function sourceLabel(source: FilterSource): string {
  return source.displayName || source.rootPath || source.id;
}

export function generalDraftFromFilter(filter: FilterState, sources: readonly FilterSource[]): GeneralDraft {
  return {
    favoritesOnly: filter.favoritesOnly,
    excludeBlacklisted: filter.excludeBlacklisted,
    onlyNeverPlayed: filter.onlyNeverPlayed,
    onlyKnownDuration: filter.onlyKnownDuration,
    onlyKnownLoudness: filter.onlyKnownLoudness,
    mediaTypeFilter: filter.mediaTypeFilter,
    audioFilter: filter.audioFilter,
    minText: filter.minDurationSeconds != null ? formatDurationForDisplay(filter.minDurationSeconds) : "",
    noMin: filter.minDurationSeconds == null,
    maxText: filter.maxDurationSeconds != null ? formatDurationForDisplay(filter.maxDurationSeconds) : "",
    noMax: filter.maxDurationSeconds == null,
    sourceChecked: sources.map(
      (source) => filter.includedSourceIds.length === 0 || containsIgnoringCase(filter.includedSourceIds, source.id)
    )
  };
}

/** A duration that is not valid counts as none until Apply refuses it. */
function draftDuration(text: string, none: boolean): number | null {
  if (none) {
    return null;
  }
  const seconds = parseDurationInputToSeconds(text);
  return seconds === "invalid" ? null : seconds;
}

/** The working filter with the General tab's fields read into it. When every source is checked, none is stored. */
export function filterWithGeneralDraft(
  filter: FilterState,
  draft: GeneralDraft,
  sources: readonly FilterSource[]
): FilterState {
  const next = cloneFilterState(filter);
  next.favoritesOnly = draft.favoritesOnly;
  next.excludeBlacklisted = draft.excludeBlacklisted;
  next.onlyNeverPlayed = draft.onlyNeverPlayed;
  next.onlyKnownDuration = draft.onlyKnownDuration;
  next.onlyKnownLoudness = draft.onlyKnownLoudness;
  next.mediaTypeFilter = draft.mediaTypeFilter;
  next.audioFilter = draft.audioFilter;
  next.minDurationSeconds = draftDuration(draft.minText, draft.noMin);
  next.maxDurationSeconds = draftDuration(draft.maxText, draft.noMax);
  const checked = sources.filter((_, index) => draft.sourceChecked[index]).map((source) => source.id);
  next.includedSourceIds = checked.length === sources.length ? [] : checked;
  return next;
}

/** The message that stops Apply when a duration in use is not valid, or null. */
export function generalDraftDurationError(draft: GeneralDraft): string | null {
  if (!draft.noMin && parseDurationInputToSeconds(draft.minText) === "invalid") {
    return "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.";
  }
  if (!draft.noMax && parseDurationInputToSeconds(draft.maxText) === "invalid") {
    return "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.";
  }
  return null;
}

/** Includes or excludes a tag, or clears it when it already is. Including takes it out of the excluded tags, and the other way round. */
export function toggleFilterTag(filter: FilterState, tag: string, action: TagChipAction): FilterState {
  const next = cloneFilterState(filter);
  const [own, other] = action === "include" ? [next.selectedTags, next.excludedTags] : [next.excludedTags, next.selectedTags];
  if (containsIgnoringCase(own, tag)) {
    removeIgnoringCase(own, tag);
  } else {
    removeIgnoringCase(other, tag);
    own.push(tag);
  }
  return next;
}

/**
 * The Tags tab's categories by sort order and then name, each with its tags by name; categories without tags
 * are left out. Filter tags the catalog does not have come last, in an Uncategorized row.
 */
export function filterTagCategories(
  model: FilterTagModel | null,
  filter: FilterState,
  collapsed: ReadonlySet<string>
): FilterTagCategory[] {
  const categories = (model?.categories || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || compareTagNames(a.name, b.name));
  const tags = model?.tags || [];
  const chip = (name: string): FilterTagChip => ({
    name,
    included: containsIgnoringCase(filter.selectedTags, name),
    excluded: containsIgnoringCase(filter.excludedTags, name)
  });

  const blocks: FilterTagCategory[] = [];
  const catalogNames = new Set<string>();
  for (const category of categories) {
    const names = tags
      .filter((tag) => tag.categoryId === category.id)
      .map((tag) => tag.name)
      .sort(compareTagNames);
    if (names.length === 0) {
      continue;
    }
    for (const name of names) {
      catalogNames.add(String(name).toLowerCase());
    }
    const collapseKey = String(category.id ?? "");
    blocks.push({
      id: category.id,
      name: category.name,
      collapseKey,
      collapsed: collapsed.has(collapseKey),
      localMode: filter.categoryLocalMatchModes?.[category.id] ?? TAG_MATCH_MODE.And,
      chips: names.map(chip)
    });
  }

  const missing = [...new Set([...filter.selectedTags, ...filter.excludedTags])]
    .filter((name) => !catalogNames.has(String(name).toLowerCase()))
    .sort(compareTagNames);
  if (missing.length > 0) {
    blocks.push({
      id: null,
      name: "Uncategorized",
      collapseKey: UNCATEGORIZED_COLLAPSE_KEY,
      collapsed: collapsed.has(UNCATEGORIZED_COLLAPSE_KEY),
      localMode: filter.categoryLocalMatchModes?.[""] ?? TAG_MATCH_MODE.And,
      chips: missing.map(chip)
    });
  }
  return blocks;
}

/** The dialog's preset rows from the presets `GET /api/presets` returned. */
export function presetRowsFromApi(
  presets: readonly { id?: string; name?: string; filterState?: ApiFilterState | null }[]
): PresetRow[] {
  return (Array.isArray(presets) ? presets : [])
    .map((preset) => ({
      name: String(preset.name || preset.id || "").trim() || String(preset.id || ""),
      filterState: filterStateFromApiObject(preset.filterState)
    }))
    .filter((row) => row.name);
}
