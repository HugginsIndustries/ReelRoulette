import { describe, expect, it } from "vitest";
import {
  applyItemStateChanged,
  applyPlaybackRecorded,
  findProjectionItem,
  normalizeLibraryPath
} from "../library/libraryProjectionSync";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";

function item(overrides: Partial<LibraryProjectionItem> = {}): LibraryProjectionItem {
  return {
    id: "i1",
    sourceId: "s1",
    fileName: "clip.mp4",
    fullPath: "/media/videos/clip.mp4",
    relativePath: "videos/clip.mp4",
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: 120,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: false,
    thumbnailVersion: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    ...overrides
  };
}

describe("libraryProjectionSync", () => {
  it("normalizeLibraryPath lowercases and normalizes separators", () => {
    expect(normalizeLibraryPath("/Media/Clip.MP4")).toBe("\\media\\clip.mp4");
  });

  it("findProjectionItem matches itemId first", () => {
    const items = [item({ id: "abc" }), item({ id: "def", fileName: "other.mp4" })];
    expect(findProjectionItem(items, { itemId: "def" })?.fileName).toBe("other.mp4");
  });

  it("findProjectionItem matches fullPath when itemId missing", () => {
    const items = [item({ fullPath: "D:\\Library\\clip.mp4" })];
    expect(findProjectionItem(items, { path: "d:/library/clip.mp4" })?.id).toBe("i1");
  });

  it("applyItemStateChanged patches favorite and blacklist", () => {
    const items = [item()];
    const result = applyItemStateChanged(items, {
      itemId: "i1",
      isFavorite: true,
      isBlacklisted: false
    });
    expect(result.changed).toBe(true);
    expect(items[0]?.isFavorite).toBe(true);
    expect(result.before?.isFavorite).toBe(false);
  });

  it("applyItemStateChanged is idempotent when state unchanged", () => {
    const items = [item({ isFavorite: true })];
    const result = applyItemStateChanged(items, {
      itemId: "i1",
      isFavorite: true,
      isBlacklisted: false
    });
    expect(result.changed).toBe(false);
  });

  it("applyPlaybackRecorded uses server playCount and lastPlayedUtc when present", () => {
    const items = [item({ playCount: 1, lastPlayedUtcMs: 1000 })];
    const lastPlayedUtc = "2024-06-01T00:00:00.000Z";
    const result = applyPlaybackRecorded(items, {
      path: "/media/videos/clip.mp4",
      playCount: 5,
      lastPlayedUtc
    });
    expect(result.changed).toBe(true);
    expect(items[0]?.playCount).toBe(5);
    expect(items[0]?.lastPlayedUtcMs).toBe(Date.parse(lastPlayedUtc));
  });

  it("applyPlaybackRecorded leaves playCount and lastPlayedUtc when those fields are missing", () => {
    const items = [item({ playCount: 2, lastPlayedUtcMs: 1000 })];
    const result = applyPlaybackRecorded(items, { path: "/media/videos/clip.mp4" });
    expect(result.changed).toBe(false);
    expect(items[0]?.playCount).toBe(2);
    expect(items[0]?.lastPlayedUtcMs).toBe(1000);
  });
});
