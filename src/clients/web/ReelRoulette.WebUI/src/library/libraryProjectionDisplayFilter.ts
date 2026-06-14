import {
  AUDIO_FILTER,
  MEDIA_TYPE_FILTER,
  TAG_MATCH_MODE,
  type FilterState,
  type TagMatchMode
} from "../filter/filterStateModel";
import type { LibraryProjectionCatalog, LibraryProjectionItem } from "./libraryProjectionModel";

function tagEquals(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function enabledSourceIds(catalog: LibraryProjectionCatalog): Set<string> {
  const ids = new Set<string>();
  for (const source of catalog.sources) {
    if (source.isEnabled) {
      ids.add(source.id);
    }
  }
  return ids;
}

function passesLegacyTagFilter(item: LibraryProjectionItem, filterState: FilterState): boolean {
  if (!item.tags.length) {
    return false;
  }
  if (filterState.tagMatchMode === TAG_MATCH_MODE.And) {
    return filterState.selectedTags.every((tag) => item.tags.some((it) => tagEquals(it, tag)));
  }
  return filterState.selectedTags.some((tag) => item.tags.some((it) => tagEquals(it, tag)));
}

function passesSelectedTags(
  item: LibraryProjectionItem,
  catalog: LibraryProjectionCatalog,
  filterState: FilterState
): boolean {
  const selected = filterState.selectedTags;
  if (!selected.length) {
    return true;
  }

  if (!catalog.categories.length) {
    return passesLegacyTagFilter(item, filterState);
  }

  const tagsByCategory = new Map<string, string[]>();
  for (const selectedTag of selected) {
    const tag = catalog.tags.find((t) => tagEquals(t.name, selectedTag));
    const categoryId = tag ? tag.categoryId : "";
    const bucket = tagsByCategory.get(categoryId) ?? [];
    bucket.push(selectedTag);
    tagsByCategory.set(categoryId, bucket);
  }

  if (tagsByCategory.size === 0) {
    return true;
  }

  const categoryOutcomes: boolean[] = [];
  for (const [categoryId, categoryTags] of tagsByCategory) {
    const localMode: TagMatchMode =
      filterState.categoryLocalMatchModes?.[categoryId] ?? TAG_MATCH_MODE.And;

    let catMatch: boolean;
    if (localMode === TAG_MATCH_MODE.And) {
      catMatch =
        item.tags.length > 0 &&
        categoryTags.every((tag) => item.tags.some((it) => tagEquals(it, tag)));
    } else {
      catMatch =
        item.tags.length > 0 &&
        categoryTags.some((tag) => item.tags.some((it) => tagEquals(it, tag)));
    }
    categoryOutcomes.push(catMatch);
  }

  if (!categoryOutcomes.length) {
    return false;
  }

  const useAndBetweenCategories = filterState.globalMatchMode ?? true;
  return useAndBetweenCategories ? categoryOutcomes.every(Boolean) : categoryOutcomes.some(Boolean);
}

export function passesFilterState(
  item: LibraryProjectionItem,
  catalog: LibraryProjectionCatalog,
  filterState: FilterState
): boolean {
  const enabled = enabledSourceIds(catalog);
  if (!enabled.has(item.sourceId)) {
    return false;
  }

  if (filterState.includedSourceIds.length > 0) {
    const included = new Set(filterState.includedSourceIds.filter(Boolean).map((id) => id.toLowerCase()));
    if (!included.has(item.sourceId.toLowerCase())) {
      return false;
    }
  }

  if (filterState.excludeBlacklisted && item.isBlacklisted) {
    return false;
  }

  if (filterState.favoritesOnly && !item.isFavorite) {
    return false;
  }

  if (filterState.onlyNeverPlayed && item.playCount !== 0) {
    return false;
  }

  if (filterState.audioFilter === AUDIO_FILTER.WithAudioOnly) {
    if (item.mediaType !== "photo" && item.hasAudio !== true) {
      return false;
    }
  } else if (filterState.audioFilter === AUDIO_FILTER.WithoutAudioOnly) {
    if (item.mediaType !== "photo" && item.hasAudio !== false) {
      return false;
    }
  }

  if (filterState.minDurationSeconds != null && Number.isFinite(filterState.minDurationSeconds)) {
    if (
      item.mediaType !== "photo" &&
      (item.durationSeconds == null || item.durationSeconds < filterState.minDurationSeconds)
    ) {
      return false;
    }
  }

  if (filterState.maxDurationSeconds != null && Number.isFinite(filterState.maxDurationSeconds)) {
    if (
      item.mediaType !== "photo" &&
      (item.durationSeconds == null || item.durationSeconds > filterState.maxDurationSeconds)
    ) {
      return false;
    }
  }

  if (filterState.onlyKnownDuration && item.mediaType !== "photo" && item.durationSeconds == null) {
    return false;
  }

  if (filterState.onlyKnownLoudness && item.mediaType !== "photo" && item.integratedLoudness == null) {
    return false;
  }

  if (filterState.selectedTags.length > 0 && !passesSelectedTags(item, catalog, filterState)) {
    return false;
  }

  if (filterState.excludedTags.length > 0) {
    if (filterState.excludedTags.some((ex) => item.tags.some((t) => tagEquals(t, ex)))) {
      return false;
    }
  }

  if (filterState.mediaTypeFilter === MEDIA_TYPE_FILTER.VideosOnly && item.mediaType !== "video") {
    return false;
  }

  if (filterState.mediaTypeFilter === MEDIA_TYPE_FILTER.PhotosOnly && item.mediaType !== "photo") {
    return false;
  }

  return true;
}

export function filterItemsByFilterState(
  items: readonly LibraryProjectionItem[],
  catalog: LibraryProjectionCatalog,
  filterState: FilterState
): LibraryProjectionItem[] {
  return items.filter((item) => passesFilterState(item, catalog, filterState));
}
