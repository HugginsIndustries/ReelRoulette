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
  /** The duration as m:ss, or empty when it is not known. */
  duration: string;
}

const NOW_PLAYING_MAX_CHARS = 45;

/** Formats seconds as m:ss; an unknown or zero time is 0:00. */
export function formatPlaybackTime(seconds: number | null | undefined): string {
  if (!seconds || Number.isNaN(seconds)) {
    return "0:00";
  }

  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
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
