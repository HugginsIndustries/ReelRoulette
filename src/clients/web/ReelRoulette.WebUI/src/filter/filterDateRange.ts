import type { components } from "../types/openapi.generated";

type Schemas = components["schemas"];

/** A date range that rolls with the clock: the last 7, 30, or 90 days, or this year. */
export type FilterDateRangePreset = Schemas["FilterDateRangePreset"];

/** A custom range of whole days, each written YYYY-MM-DD. */
export type FilterCustomDateRange = Schemas["FilterCustomDateRange"];

/**
 * The days a date filter keeps: a preset or a custom range. A filter holds the choice, never resolved dates, so a
 * preset always means the days up to today, which the server works out in its own time zone. Core's FilterDateRange
 * is the C# copy.
 */
export type FilterDateRange = FilterDateRangePreset | FilterCustomDateRange;

/**
 * Each preset's label and how the Filters line names it after Added or Created, keyed by the contract's presets, so the
 * typecheck fails until a new preset has its wording.
 */
const PRESET_WORDING: Readonly<Record<FilterDateRangePreset, { label: string; phrase: string }>> = {
  last7Days: { label: "Last 7 days", phrase: "in last 7 days" },
  last30Days: { label: "Last 30 days", phrase: "in last 30 days" },
  last90Days: { label: "Last 90 days", phrase: "in last 90 days" },
  thisYear: { label: "This year", phrase: "this year" }
};

/** The presets in the order the Filter tab offers them, each with its label and its Filters line wording. */
export const DATE_RANGE_PRESETS = (Object.keys(PRESET_WORDING) as FilterDateRangePreset[]).map((value) => ({
  value,
  ...PRESET_WORDING[value]
}));

/**
 * The first and last day a custom range may hold. The server can't resolve a range that touches either end of the
 * calendar, and no file's dates come near these.
 */
export const EARLIEST_DAY = "1970-01-01";
export const LATEST_DAY = "2099-12-31";

const DAY_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Whether `text` is a day written YYYY-MM-DD that the calendar has, as the server reads a custom range's days. */
export function isDayText(text: unknown): text is string {
  if (typeof text !== "string") {
    return false;
  }
  const match = DAY_TEXT.exec(text);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Whether a day, written YYYY-MM-DD, is one a custom range may hold: from `EARLIEST_DAY` to `LATEST_DAY`. */
export function isDayWithinLimits(day: string): boolean {
  return day >= EARLIEST_DAY && day <= LATEST_DAY;
}

/**
 * A stored date filter's range, read as the server's list filter parser reads it: a preset's name in any case, or a
 * custom range whose days are real and in order. Anything else, null included, is no limit. Locked to
 * shared/fixtures/filter-date-ranges.json.
 */
export function readDateRange(value: unknown): FilterDateRange | null {
  if (typeof value === "string") {
    const name = value.toLowerCase();
    return DATE_RANGE_PRESETS.find((preset) => preset.value.toLowerCase() === name)?.value ?? null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const { from, to } = value as Record<string, unknown>;
  // Days written YYYY-MM-DD order as text does.
  return isDayText(from) && isDayText(to) && from <= to ? { from, to } : null;
}

/** A copy of a range, so a filter's copy never shares a custom range with it. */
export function copyDateRange(range: FilterDateRange | null): FilterDateRange | null {
  return range !== null && typeof range === "object" ? { from: range.from, to: range.to } : range;
}
