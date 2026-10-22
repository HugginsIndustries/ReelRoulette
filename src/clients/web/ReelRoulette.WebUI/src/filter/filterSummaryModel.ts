import { ratingText } from "../rating/rating";
import {
  AUDIO_FILTERS,
  BASIC_FILTERS,
  MEDIA_TYPES,
  ONLY_UNRATED_LABEL,
  containsIgnoringCase,
  type FilterSource
} from "./filterDialogModel";
import { formatDurationForDisplay, type FilterState } from "./filterStateModel";

/** What comes before the applied filters on the Library tab's Filters line. */
export const FILTER_SUMMARY_LABEL = "Filters: ";
/** What separates the applied filters on the Filters line. */
export const FILTER_SUMMARY_SEPARATOR = " · ";

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The applied filters as the Library tab's Filters line names them, in order: Favorites only or excluded, Blacklisted
 * only, each checked Basic Filters option by its label, Only unrated, the minimum rating, such as "Min 3.5 stars", a
 * media type or audio choice other than the first, the sources checked out of all, the minimum and maximum duration,
 * and the included and excluded tags. Blacklisted excluded, the default, isn't named. Empty when no filter applies.
 *
 * `sources` is the list the Filter tab shows, or null while it isn't known, when the sources are only counted.
 */
export function filterSummaryParts(filter: FilterState, sources: readonly FilterSource[] | null): string[] {
  const parts: string[] = [];
  if (filter.favoritesMode === "only") {
    parts.push("Favorites only");
  } else if (filter.favoritesMode === "excluded") {
    parts.push("Favorites excluded");
  }
  if (filter.blacklistedMode === "only") {
    parts.push("Blacklisted only");
  }
  for (const basic of BASIC_FILTERS) {
    if (filter[basic.field]) {
      parts.push(basic.label);
    }
  }
  if (filter.onlyUnrated) {
    parts.push(ONLY_UNRATED_LABEL);
  }
  if (filter.minRating !== null) {
    parts.push(`Min ${ratingText(filter.minRating)}`);
  }
  const mediaType = MEDIA_TYPES.findIndex((choice) => choice.value === filter.mediaTypeFilter);
  if (mediaType > 0) {
    parts.push(MEDIA_TYPES[mediaType]!.label);
  }
  const audio = AUDIO_FILTERS.findIndex((choice) => choice.value === filter.audioFilter);
  if (audio > 0) {
    parts.push(AUDIO_FILTERS[audio]!.label);
  }
  // No source chosen means every source, as the Filter tab stores it.
  if (filter.includedSourceIds.length > 0) {
    if (sources) {
      const checked = sources.filter((source) => containsIgnoringCase(filter.includedSourceIds, source.id)).length;
      parts.push(`${checked} of ${sources.length} sources`);
    } else {
      parts.push(counted(filter.includedSourceIds.length, "source"));
    }
  }
  if (filter.minDurationSeconds != null) {
    parts.push(`Min ${formatDurationForDisplay(filter.minDurationSeconds)}`);
  }
  if (filter.maxDurationSeconds != null) {
    parts.push(`Max ${formatDurationForDisplay(filter.maxDurationSeconds)}`);
  }
  if (filter.selectedTags.length > 0) {
    parts.push(counted(filter.selectedTags.length, "tag"));
  }
  if (filter.excludedTags.length > 0) {
    parts.push(`${counted(filter.excludedTags.length, "tag")} excluded`);
  }
  return parts;
}
