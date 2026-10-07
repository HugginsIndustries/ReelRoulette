import { describe, expect, it } from "vitest";
import { basenameFromPath, formatPlaybackTime, nowPlayingView } from "../playback/nowPlaying";

describe("nowPlaying", () => {
  it("formats seconds as m:ss, with 0:00 for an unknown time", () => {
    expect(formatPlaybackTime(65.9)).toBe("1:05");
    expect(formatPlaybackTime(3600)).toBe("60:00");
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(Number.NaN)).toBe("0:00");
    expect(formatPlaybackTime(null)).toBe("0:00");
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
