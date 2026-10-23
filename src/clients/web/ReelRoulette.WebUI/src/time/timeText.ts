/** A whole number as at least two digits, such as "05", or "100" for 100. */
export function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Whole `totalSeconds` split into hours, then the minutes and seconds under 60, for writing a duration. */
export function splitDuration(totalSeconds: number): { hours: number; minutes: number; seconds: number } {
  const whole = Math.floor(totalSeconds);
  return { hours: Math.floor(whole / 3600), minutes: Math.floor((whole % 3600) / 60), seconds: whole % 60 };
}

/** A date's day on this device, written YYYY-MM-DD. */
export function localDayText(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/**
 * The start of a day, written YYYY-MM-DD, on this device. A date field's own `valueAsDate` is midnight UTC, which is
 * the day before on a device west of UTC.
 */
export function localDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!);
}

/** `utcMs` on this device, written YYYY-MM-DD HH:MM:SS in 24-hour time. */
export function exactTimeText(utcMs: number): string {
  const date = new Date(utcMs);
  return `${localDayText(date)} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}
