/** The frame rate a step assumes where the browser gives no frame timings, or before a frame has been timed. */
export const ASSUMED_FRAMES_PER_SECOND = 30;

/** A frame longer than this, in seconds, is a seek or a stall between frames, not a frame's length. */
const LONGEST_FRAME_SECONDS = 0.25;

/** The frame's length is the middle of this many recent ones, so a dropped frame doesn't change it. */
const TIMED_FRAMES = 15;

/** What the browser tells of a frame as it shows (`VideoFrameCallbackMetadata`). */
export interface FrameMetadata {
  /** Where in the video the frame starts, in seconds. */
  mediaTime: number;
  /** How many frames the element has shown, this one included. */
  presentedFrames: number;
}

/** A video whose frames the clock can follow, where the browser offers `requestVideoFrameCallback`. */
export interface FramedVideo {
  readonly paused: boolean;
  requestVideoFrameCallback?(callback: (now: number, metadata: FrameMetadata) => void): number;
  cancelVideoFrameCallback?(handle: number): void;
}

/**
 * Follows the frames of the video that shows, as the browser shows them, so a frame step moves exactly one frame: it
 * learns the video's frame length from the frames that follow each other while it plays, and keeps where the frame
 * shown starts. Without the browser's frame timings, or before a frame has been timed, a frame lasts 1/30 of a second.
 */
export interface FrameClock {
  /** Follows `video`'s frames in place of the one before, or none for null, starting over. */
  follow(video: FramedVideo | null): void;
  /** Forgets what it learned, for a new item on the same element. */
  reset(): void;
  /** The frame's length, in seconds. */
  frameLength(): number;
  /**
   * Where a step one frame back (-1) or forward (1) from `position` lands: the middle of the frame before or after the
   * one shown, so it never lands on the edge between two. A position outside the frame last shown, as while an earlier
   * step's frame is still on its way, counts as the middle of its own frame.
   */
  stepTarget(position: number, direction: -1 | 1): number;
}

function middle(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function createFrameClock(): FrameClock {
  let video: FramedVideo | null = null;
  let handle: number | null = null;
  let shown: FrameMetadata | null = null;
  let lengths: number[] = [];

  function onFrame(_now: number, metadata: FrameMetadata): void {
    handle = null;
    // Only frames that follow each other while the video plays time a frame; a seek shows one frame on its own.
    const length = shown && !video?.paused && metadata.presentedFrames === shown.presentedFrames + 1 ? metadata.mediaTime - shown.mediaTime : 0;
    if (length > 0 && length <= LONGEST_FRAME_SECONDS) {
      lengths = [...lengths.slice(1 - TIMED_FRAMES), length];
    }
    shown = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };
    request();
  }

  function request(): void {
    if (video?.requestVideoFrameCallback) {
      handle = video.requestVideoFrameCallback(onFrame);
    }
  }

  function cancel(): void {
    if (handle !== null) {
      video?.cancelVideoFrameCallback?.(handle);
      handle = null;
    }
  }

  function reset(): void {
    shown = null;
    lengths = [];
  }

  function frameLength(): number {
    return lengths.length ? middle(lengths) : 1 / ASSUMED_FRAMES_PER_SECOND;
  }

  return {
    follow(next) {
      cancel();
      video = next;
      reset();
      request();
    },
    reset,
    frameLength,
    stepTarget(position, direction) {
      const length = frameLength();
      const shownMiddle = shown ? shown.mediaTime + length / 2 : null;
      // A position within the frame shown is that frame's; one about a frame away is an earlier step's, still on its way.
      const from = shownMiddle !== null && Math.abs(position - shownMiddle) < length * 0.75 ? shownMiddle : position;
      return from + direction * length;
    }
  };
}
