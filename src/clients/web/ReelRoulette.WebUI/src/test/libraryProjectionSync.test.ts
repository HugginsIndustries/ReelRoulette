import { describe, expect, it } from "vitest";
import { createDefaultFilterState } from "../filter/filterStateModel";
import {
  applyItemStateChanged,
  applyPlaybackRecorded,
  findProjectionItem,
  normalizeLibraryPath,
  shouldRebrowseAfterItemStateChange,
  shouldRebrowseAfterPlaybackUpdate
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

  it("applyPlaybackRecorded increments playCount and uses now when optional fields missing", () => {
    const items = [item({ playCount: 2, lastPlayedUtcMs: null })];
    const nowMs = 1_700_000_000_000;
    applyPlaybackRecorded(items, { path: "/media/videos/clip.mp4" }, nowMs);
    expect(items[0]?.playCount).toBe(3);
    expect(items[0]?.lastPlayedUtcMs).toBe(nowMs);
  });

  it("shouldRebrowseAfterItemStateChange when favoritesOnly visibility changes", () => {
    const filterState = { ...createDefaultFilterState(), favoritesOnly: true };
    const before = item({ isFavorite: true });
    const after = item({ isFavorite: false });
    expect(shouldRebrowseAfterItemStateChange(filterState, before, after)).toBe(true);
  });

  it("shouldRebrowseAfterItemStateChange when excludeBlacklisted visibility changes", () => {
    const filterState = { ...createDefaultFilterState(), excludeBlacklisted: true };
    const before = item({ isBlacklisted: false });
    const after = item({ isBlacklisted: true });
    expect(shouldRebrowseAfterItemStateChange(filterState, before, after)).toBe(true);
  });

  it("shouldRebrowseAfterItemStateChange false for badge-only change without filter impact", () => {
    const filterState = createDefaultFilterState();
    const before = item({ isFavorite: false });
    const after = item({ isFavorite: true });
    expect(shouldRebrowseAfterItemStateChange(filterState, before, after)).toBe(false);
  });

  it("shouldRebrowseAfterPlaybackUpdate for playback-sensitive sort modes and onlyNeverPlayed", () => {
    expect(shouldRebrowseAfterPlaybackUpdate("Name", createDefaultFilterState())).toBe(false);
    expect(shouldRebrowseAfterPlaybackUpdate("LastPlayed", createDefaultFilterState())).toBe(true);
    expect(shouldRebrowseAfterPlaybackUpdate("PlayCount", createDefaultFilterState())).toBe(true);
    expect(shouldRebrowseAfterPlaybackUpdate("Duration", createDefaultFilterState())).toBe(false);
    expect(shouldRebrowseAfterPlaybackUpdate("DateAdded", createDefaultFilterState())).toBe(false);
    expect(
      shouldRebrowseAfterPlaybackUpdate("Name", { ...createDefaultFilterState(), onlyNeverPlayed: true })
    ).toBe(true);
  });
});
