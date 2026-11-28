import { describe, expect, it } from "vitest";
import { dragLoopMark, hasLoopMarks, loopStretch, NO_LOOP_MARKS, positionAfterMarksChange, setLoopMark } from "../playback/loopMarks";

describe("loop markers", () => {
  it("make a stretch from the start marker to the end marker, from the video's start or to its end while one isn't set", () => {
    expect(hasLoopMarks(NO_LOOP_MARKS)).toBe(false);
    expect(loopStretch(NO_LOOP_MARKS, 120)).toBeNull();
    expect(loopStretch({ start: 20, end: 40 }, 120)).toEqual({ from: 20, to: 40 });
    expect(loopStretch({ start: 20, end: null }, 120)).toEqual({ from: 20, to: 120 });
    expect(loopStretch({ start: null, end: 40 }, 120)).toEqual({ from: 0, to: 40 });
  });

  it("are set within the video, each at least a second from its other end", () => {
    expect(setLoopMark(NO_LOOP_MARKS, "start", 30, 120)).toEqual({ start: 30, end: null });
    expect(setLoopMark(NO_LOOP_MARKS, "start", -5, 120)).toEqual({ start: 0, end: null });
    expect(setLoopMark(NO_LOOP_MARKS, "start", 119.5, 120)).toEqual({ start: 119, end: null });
    expect(setLoopMark(NO_LOOP_MARKS, "end", 30, 120)).toEqual({ start: null, end: 30 });
    expect(setLoopMark(NO_LOOP_MARKS, "end", 0.5, 120)).toEqual({ start: null, end: 1 });
    expect(setLoopMark(NO_LOOP_MARKS, "end", 130, 120)).toEqual({ start: null, end: 120 });
  });

  it("stay in order a second apart: one set within a second of the other, or past it, clears the other", () => {
    const marks = { start: 20, end: 40 };
    expect(setLoopMark(marks, "start", 39, 120)).toEqual({ start: 39, end: 40 });
    expect(setLoopMark(marks, "start", 39.5, 120)).toEqual({ start: 39.5, end: null });
    expect(setLoopMark(marks, "start", 60, 120)).toEqual({ start: 60, end: null });
    expect(setLoopMark(marks, "end", 21, 120)).toEqual({ start: 20, end: 21 });
    expect(setLoopMark(marks, "end", 20.5, 120)).toEqual({ start: null, end: 20.5 });
    expect(setLoopMark(marks, "end", 10, 120)).toEqual({ start: null, end: 10 });
  });

  it("move by a drag no closer than a second to the other marker, or to the video's other end, leaving the other where it is", () => {
    const marks = { start: 20, end: 40 };
    expect(dragLoopMark(marks, "start", 30, 120)).toEqual({ start: 30, end: 40 });
    expect(dragLoopMark(marks, "start", 60, 120)).toEqual({ start: 39, end: 40 });
    expect(dragLoopMark(marks, "start", -10, 120)).toEqual({ start: 0, end: 40 });
    expect(dragLoopMark(marks, "end", 10, 120)).toEqual({ start: 20, end: 21 });
    expect(dragLoopMark(marks, "end", 200, 120)).toEqual({ start: 20, end: 120 });
    expect(dragLoopMark({ start: 20, end: null }, "start", 200, 120)).toEqual({ start: 119, end: null });
    expect(dragLoopMark({ start: null, end: 40 }, "end", -10, 120)).toEqual({ start: null, end: 1 });
  });

  it("send a video outside the stretch, before it or at or after its end, to its start, and leave one inside it", () => {
    const stretch = { from: 20, to: 40 };
    expect(positionAfterMarksChange(10, stretch)).toBe(20);
    expect(positionAfterMarksChange(40, stretch)).toBe(20);
    expect(positionAfterMarksChange(90, stretch)).toBe(20);
    expect(positionAfterMarksChange(20, stretch)).toBeNull();
    expect(positionAfterMarksChange(39.9, stretch)).toBeNull();
  });
});
