/** The playing item as the header's now-playing line needs it. */
export interface NowPlayingItem {
  id?: string | null;
  displayName?: string | null;
  durationSeconds?: number | null;
}

export interface NowPlayingView {
  /** The file name, shortened to fit the header. */
  name: string;
  /** The full file name, shown as a tooltip. */
  title: string;
  /** The duration as m:ss, or h:mm:ss from an hour, or empty when it is not known. */
  duration: string;
}

const NOW_PLAYING_MAX_CHARS = 45;

/** Whole seconds, or 0 for an unknown time, as a video's `Infinity` length is. */
function wholeSeconds(seconds: number | null | undefined): number {
  return !seconds || !Number.isFinite(seconds) ? 0 : Math.floor(seconds);
}

/** Whole `seconds` as h:mm:ss with hours, or m:ss, its first part padded to `digits`. */
function timeInShape(seconds: number, withHours: boolean, digits: number): string {
  const two = (value: number) => String(value).padStart(2, "0");
  if (withHours) {
    return `${String(Math.floor(seconds / 3600)).padStart(digits, "0")}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}`;
  }
  return `${String(Math.floor(seconds / 60)).padStart(digits, "0")}:${two(seconds % 60)}`;
}

/** Formats seconds as m:ss, or h:mm:ss from an hour; an unknown or zero time is 0:00. */
export function formatPlaybackTime(seconds: number | null | undefined): string {
  const whole = wholeSeconds(seconds);
  return timeInShape(whole, whole >= 3600, 1);
}

/**
 * The seek row's time, as "elapsed / total". The total is as `formatPlaybackTime` gives it, and the elapsed time takes
 * its shape, with hours only when the total has them and as many hour or minute digits, so its width never changes
 * within an item: "09:47 / 23:12", "0:12:26 / 1:48:37". An unknown time is 0:00.
 */
export function formatPlaybackPosition(elapsedSeconds: number | null | undefined, totalSeconds: number | null | undefined): string {
  const total = wholeSeconds(totalSeconds);
  const withHours = total >= 3600;
  const leadingDigits = String(Math.floor(withHours ? total / 3600 : total / 60)).length;
  return `${timeInShape(wholeSeconds(elapsedSeconds), withHours, leadingDigits)} / ${formatPlaybackTime(total)}`;
}

/** The last segment of a Windows or POSIX path. */
export function basenameFromPath(path: string | null | undefined): string {
  const normalized = String(path || "").replace(/\//g, "\\");
  const idx = normalized.lastIndexOf("\\");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function truncateName(name: string | null | undefined, maxChars: number): string {
  const text = String(name || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

/** What the now-playing line shows for an item, or null before anything has played. */
export function nowPlayingView(item: NowPlayingItem | null | undefined): NowPlayingView | null {
  if (!item) {
    return null;
  }
  const title = basenameFromPath(item.displayName || item.id || "");
  return {
    name: truncateName(title, NOW_PLAYING_MAX_CHARS),
    title,
    duration: item.durationSeconds != null ? formatPlaybackTime(item.durationSeconds) : ""
  };
}
