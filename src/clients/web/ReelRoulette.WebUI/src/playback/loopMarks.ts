/** A loop marker: the start or the end of the stretch Loop repeats. */
export type LoopMark = "start" | "end";

/** The loop markers' times in seconds, each null while it isn't set. */
export interface LoopMarks {
  readonly start: number | null;
  readonly end: number | null;
}

/** The stretch the markers make, in seconds: from its start up to its end. */
export interface LoopStretch {
  readonly from: number;
  readonly to: number;
}

export const NO_LOOP_MARKS: LoopMarks = { start: null, end: null };

/** The least time between the markers, and between each marker and the video's other end. */
export const LOOP_MARK_GAP_SECONDS = 1;

export function hasLoopMarks(marks: LoopMarks): boolean {
  return marks.start !== null || marks.end !== null;
}

/**
 * The stretch the markers make in a video `duration` seconds long, or null while neither is set: with only a start, it
 * runs to the video's end, and with only an end, from the video's start.
 */
export function loopStretch(marks: LoopMarks, duration: number): LoopStretch | null {
  if (!hasLoopMarks(marks)) return null;
  return { from: marks.start ?? 0, to: marks.end ?? duration };
}

/**
 * Sets a marker at `seconds`, within the video and at least a second from its other end: a start before its last
 * second, an end after its first. The markers stay in order at least a second apart, so one set within a second of the
 * other marker, or past it, clears the other.
 */
export function setLoopMark(marks: LoopMarks, which: LoopMark, seconds: number, duration: number): LoopMarks {
  if (which === "start") {
    const start = Math.max(0, Math.min(duration - LOOP_MARK_GAP_SECONDS, seconds));
    const keepsEnd = marks.end !== null && marks.end - start >= LOOP_MARK_GAP_SECONDS;
    return { start, end: keepsEnd ? marks.end : null };
  }
  const end = Math.min(duration, Math.max(LOOP_MARK_GAP_SECONDS, seconds));
  const keepsStart = marks.start !== null && end - marks.start >= LOOP_MARK_GAP_SECONDS;
  return { start: keepsStart ? marks.start : null, end };
}

/**
 * Moves a set marker to `seconds`, as a drag does: within the video, and no closer than a second to the other marker,
 * or, while the other isn't set, to the video's other end. The other marker stays where it is.
 */
export function dragLoopMark(marks: LoopMarks, which: LoopMark, seconds: number, duration: number): LoopMarks {
  const stretch = loopStretch(marks, duration) ?? { from: 0, to: duration };
  if (which === "start") {
    return { start: Math.max(0, Math.min(stretch.to - LOOP_MARK_GAP_SECONDS, seconds)), end: marks.end };
  }
  return { start: marks.start, end: Math.min(duration, Math.max(stretch.from + LOOP_MARK_GAP_SECONDS, seconds)) };
}

/**
 * Where the video goes once the markers change: to the stretch's start while it is outside the stretch, before its start
 * or at or after its end, or null while it is inside and stays where it is.
 */
export function positionAfterMarksChange(position: number, stretch: LoopStretch): number | null {
  return position < stretch.from || position >= stretch.to ? stretch.from : null;
}
