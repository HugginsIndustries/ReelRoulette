import { ratingText } from "../rating/rating";
import { localDay } from "../time/timeText";
import { DATE_RANGE_PRESETS, type FilterDateRange } from "./filterDateRange";
import {
  AUDIO_FILTERS,
  BASIC_FILTERS,
  DATE_FILTERS,
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
 * How the Filters line names a date filter's range after its label: "in last 30 days", "this year", or a custom range
 * in the device's own date format, such as "Jan 3 – Mar 31, 2026". `locale` is the device's unless given.
 */
export function dateRangeSummary(range: FilterDateRange, locale?: string): string {
  if (typeof range === "string") {
    return DATE_RANGE_PRESETS.find((preset) => preset.value === range)!.phrase;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).formatRange(localDay(range.from), localDay(range.to));
}

/**
 * The applied filters as the Library tab's Filters line names them, in order: Favorites only or excluded, Blacklisted
 * only, each checked Basic Filters option by its label, Only unrated, the minimum rating, such as "Min 3.5 stars", a
 * media type or audio choice other than the first, the sources checked out of all, the minimum and maximum duration,
 * the Added and Created ranges, such as "Added in last 30 days", and the included and excluded tags. Blacklisted
 * excluded, the default, isn't named. Empty when no filter applies.
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
  for (const { field, label } of DATE_FILTERS) {
    const range = filter[field];
    if (range !== null) {
      parts.push(`${label} ${dateRangeSummary(range)}`);
    }
  }
  if (filter.selectedTags.length > 0) {
    parts.push(counted(filter.selectedTags.length, "tag"));
  }
  if (filter.excludedTags.length > 0) {
    parts.push(`${counted(filter.excludedTags.length, "tag")} excluded`);
  }
  return parts;
}
