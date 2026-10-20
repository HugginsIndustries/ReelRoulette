import { describe, expect, it } from "vitest";
import { ASSUMED_FRAMES_PER_SECOND, createFrameClock, type FrameMetadata } from "../playback/frameStep";

/** A video whose frames a test shows one at a time, as the browser would while it plays or after a seek. */
function framedVideo() {
  const waiting = new Map<number, (now: number, metadata: FrameMetadata) => void>();
  let nextHandle = 1;
  let presentedFrames = 0;
  const video = {
    paused: false,
    requestVideoFrameCallback(callback: (now: number, metadata: FrameMetadata) => void) {
      waiting.set(nextHandle, callback);
      return nextHandle++;
    },
    cancelVideoFrameCallback(handle: number) {
      waiting.delete(handle);
    },
    /** How many callbacks wait for the next frame. */
    waiting: () => waiting.size,
    /** Shows a frame that starts `mediaTime` seconds in. */
    show(mediaTime: number) {
      presentedFrames += 1;
      const due = [...waiting.values()];
      waiting.clear();
      due.forEach((callback) => callback(0, { mediaTime, presentedFrames }));
    },
    /** Shows `count` frames from `from`, each `length` seconds after the one before. */
    play(from: number, length: number, count: number) {
      for (let i = 0; i < count; i++) video.show(from + i * length);
    }
  };
  return video;
}

describe("createFrameClock", () => {
  it("assumes 30 frames a second where the browser gives no frame timings, stepping from where the video is", () => {
    const clock = createFrameClock();
    clock.follow({ paused: true });
    expect(ASSUMED_FRAMES_PER_SECOND).toBe(30);
    expect(clock.frameLength()).toBeCloseTo(1 / 30, 10);
    expect(clock.stepTarget(2, 1)).toBeCloseTo(2 + 1 / 30, 10);
    expect(clock.stepTarget(2, -1)).toBeCloseTo(2 - 1 / 30, 10);
  });

  it("assumes 30 frames a second until a frame has been timed, too", () => {
    const clock = createFrameClock();
    const video = framedVideo();
    clock.follow(video);
    video.show(0);
    expect(clock.frameLength()).toBeCloseTo(1 / 30, 10);
  });

  it("learns a video's frame length from the frames that follow each other while it plays", () => {
    const clock = createFrameClock();
    const video = framedVideo();
    clock.follow(video);
    video.play(0, 0.04, 5);
    expect(clock.frameLength()).toBeCloseTo(0.04, 10);
  });

  it("keeps the middle of its recent frames, so a dropped frame or a seek while it plays doesn't change the length", () => {
    const clock = createFrameClock();
    const video = framedVideo();
    clock.follow(video);
    video.play(0, 0.04, 6);
    // A dropped frame shows the one after it, two frames on.
    video.show(0.28);
    // A seek shows a frame far away.
    video.show(30);
    video.show(30.04);
    expect(clock.frameLength()).toBeCloseTo(0.04, 10);
  });

  it("times no frame while the video is paused, as a seek or a frame step shows one", () => {
    const clock = createFrameClock();
    const video = framedVideo();
    clock.follow(video);
    video.paused = true;
    video.play(0, 0.1, 4);
    expect(clock.frameLength()).toBeCloseTo(1 / 30, 10);
  });

  it("steps to the middle of the frame before or after the one shown, wherever in it the video paused", () => {
    const clock = createFrameClock();
    const video = framedVideo();
    clock.follow(video);
    video.play(0, 0.04, 26);
    // The frame shown starts at 1 s and lasts to 1.04 s; the video paused 0.03 s into it.
    expect(clock.stepTarget(1.03, 1)).toBeCloseTo(1.06, 10);
    expect(clock.stepTarget(1.03, -1)).toBeCloseTo(0.98, 10);
    expect(clock.stepTarget(1.0, 1)).toBeCloseTo(1.06, 10);
  });

  it("steps on from an earlier step whose frame hasn't shown yet, so each press moves a frame", () => {
    const clock = createFrameClock();
    const video = framedVideo();
    clock.follow(video);
    video.play(0, 0.04, 26);
    const first = clock.stepTarget(1.02, 1);
    expect(first).toBeCloseTo(1.06, 10);
    // The frame at 1.04 s hasn't shown when the next press comes.
    expect(clock.stepTarget(first, 1)).toBeCloseTo(1.1, 10);
    // Once it shows, a step goes on from it.
    video.paused = true;
    video.show(1.04);
    expect(clock.stepTarget(first, 1)).toBeCloseTo(1.1, 10);
  });

  it("follows a new element in place of the one before, and forgets what it learned for a new item", () => {
    const clock = createFrameClock();
    const first = framedVideo();
    clock.follow(first);
    first.play(0, 0.04, 5);
    expect(first.waiting()).toBe(1);

    const second = framedVideo();
    clock.follow(second);
    expect([first.waiting(), second.waiting()]).toEqual([0, 1]);
    expect(clock.frameLength()).toBeCloseTo(1 / 30, 10);
    second.play(0, 0.02, 5);
    expect(clock.frameLength()).toBeCloseTo(0.02, 10);

    clock.reset();
    expect(clock.frameLength()).toBeCloseTo(1 / 30, 10);
    expect(clock.stepTarget(5, 1)).toBeCloseTo(5 + 1 / 30, 10);

    clock.follow(null);
    expect(second.waiting()).toBe(0);
  });
});
