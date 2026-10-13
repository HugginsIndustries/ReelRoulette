import { describe, expect, it } from "vitest";
import { basenameFromPath, formatPlaybackPosition, formatPlaybackTime, nowPlayingView } from "../playback/nowPlaying";

describe("nowPlaying", () => {
  it("formats seconds as m:ss, or h:mm:ss from an hour, with 0:00 for an unknown time", () => {
    expect(formatPlaybackTime(65.9)).toBe("1:05");
    expect(formatPlaybackTime(3599)).toBe("59:59");
    expect(formatPlaybackTime(3600)).toBe("1:00:00");
    expect(formatPlaybackTime(6517)).toBe("1:48:37");
    expect(formatPlaybackTime(36000)).toBe("10:00:00");
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(Number.NaN)).toBe("0:00");
    expect(formatPlaybackTime(null)).toBe("0:00");
  });

  it.each([
    // Nothing known yet.
    [0, 0, "0:00 / 0:00"],
    [Number.NaN, Number.NaN, "0:00 / 0:00"],
    // A video whose length the browser doesn't know, as a WebM without one in its header.
    [5, Number.POSITIVE_INFINITY, "0:05 / 0:00"],
    // Under ten minutes, one minute digit.
    [36, 97, "0:36 / 1:37"],
    [61.7, 125, "1:01 / 2:05"],
    [5, 59.9, "0:05 / 0:59"],
    // Ten minutes and over, two minute digits, the elapsed time's padded.
    [0, 600, "00:00 / 10:00"],
    [587, 1392, "09:47 / 23:12"],
    [3599, 3599, "59:59 / 59:59"],
    // An hour and over, hours with the total's hour digits, and two minute digits.
    [0, 3600, "0:00:00 / 1:00:00"],
    [746, 6517, "0:12:26 / 1:48:37"],
    [3723, 36000, "01:02:03 / 10:00:00"],
    [45000, 45296, "12:30:00 / 12:34:56"]
  ])("shows %s s of %s s as %s, the elapsed time in the total's shape", (elapsed, total, shown) => {
    expect(formatPlaybackPosition(elapsed, total)).toBe(shown);
  });

  it("takes the file name from a Windows or POSIX path", () => {
    expect(basenameFromPath("C:\\media\\clip.mp4")).toBe("clip.mp4");
    expect(basenameFromPath("/mnt/media/clip.mp4")).toBe("clip.mp4");
    expect(basenameFromPath("clip.mp4")).toBe("clip.mp4");
  });

  it("shows nothing before an item plays", () => {
    expect(nowPlayingView(null)).toBeNull();
  });

  it("shows the display name's file name, falling back to the path, with the duration when known", () => {
    expect(nowPlayingView({ id: "C:\\media\\clip.mp4", displayName: "clip.mp4", durationSeconds: 125 })).toEqual({
      name: "clip.mp4",
      title: "clip.mp4",
      duration: "2:05"
    });
    expect(nowPlayingView({ id: "/media/film.mkv", displayName: "film.mkv", durationSeconds: 6517 })?.duration).toBe("1:48:37");
    expect(nowPlayingView({ id: "/mnt/media/photo.jpg", displayName: "", durationSeconds: null })).toEqual({
      name: "photo.jpg",
      title: "photo.jpg",
      duration: ""
    });
  });

  it("shortens a name over 45 characters and keeps the full name as the title", () => {
    const longName = `${"b".repeat(50)}.mkv`;
    const view = nowPlayingView({ id: longName, displayName: longName });
    expect(view?.name).toBe(`${"b".repeat(42)}...`);
    expect(view?.name).toHaveLength(45);
    expect(view?.title).toBe(longName);
  });
});
