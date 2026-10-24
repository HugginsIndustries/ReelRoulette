import { describe, expect, it } from "vitest";
import {
  applyItemRatingChanged,
  applyItemStateChanged,
  applyPlaybackRecorded,
  findProjectionItem,
  indexProjectionItems
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
    dateAddedUtcMs: null,
    dateCreatedUtcMs: null,
    durationSeconds: 120,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    peakDb: null,
    rating: null,
    tags: [],
    hasThumbnail: false,
    thumbnailVersion: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    ...overrides
  };
}

describe("libraryProjectionSync", () => {
  it("findProjectionItem matches by item id", () => {
    const items = [item({ id: "abc" }), item({ id: "def", fileName: "other.mp4" })];
    expect(findProjectionItem(indexProjectionItems(items), "def")?.fileName).toBe("other.mp4");
    expect(findProjectionItem(indexProjectionItems(items), " def ")?.fileName).toBe("other.mp4");
  });

  it("findProjectionItem does not match a path", () => {
    const index = indexProjectionItems([item({ fullPath: "/media/videos/clip.mp4" })]);
    expect(findProjectionItem(index, "/media/videos/clip.mp4")).toBeNull();
    expect(findProjectionItem(index, null)).toBeNull();
  });

  it("applies favorite, rating, and playback to the item with that id when two paths differ only in case", () => {
    const items = [
      item({ id: "id-upper", fileName: "Clip.mp4", fullPath: "/media/Clip.mp4" }),
      item({ id: "id-lower", fileName: "clip.mp4", fullPath: "/media/clip.mp4" })
    ];
    const index = indexProjectionItems(items);

    applyItemStateChanged(index, { itemId: "id-lower", path: "/media/clip.mp4", isFavorite: true, isBlacklisted: false });
    applyItemRatingChanged(index, { itemId: "id-lower", path: "/media/clip.mp4", rating: 4 });
    applyPlaybackRecorded(index, { itemId: "id-lower", playCount: 3, lastPlayedUtc: 5000 });

    expect(items.map((entry) => entry.isFavorite)).toEqual([false, true]);
    expect(items.map((entry) => entry.rating)).toEqual([null, 4]);
    expect(items.map((entry) => entry.playCount)).toEqual([0, 3]);
  });

  it("applyItemStateChanged patches favorite and blacklist", () => {
    const items = [item()];
    const changed = applyItemStateChanged(indexProjectionItems(items), {
      itemId: "i1",
      isFavorite: true,
      isBlacklisted: false
    });
    expect(changed).toBe(true);
    expect(items[0]?.isFavorite).toBe(true);
  });

  it("applyItemStateChanged is idempotent when state unchanged", () => {
    const items = [item({ isFavorite: true })];
    const changed = applyItemStateChanged(indexProjectionItems(items), {
      itemId: "i1",
      isFavorite: true,
      isBlacklisted: false
    });
    expect(changed).toBe(false);
  });

  it("applyItemRatingChanged says whether the loaded tile's rating changed", () => {
    const items = [item({ rating: 3 })];
    const index = indexProjectionItems(items);
    expect(applyItemRatingChanged(index, { itemId: "i1", rating: 3 })).toBe(false);
    expect(applyItemRatingChanged(index, { itemId: "missing", rating: 2 })).toBe(false);
    expect(applyItemRatingChanged(index, { itemId: "i1", rating: null })).toBe(true);
    expect(items[0]?.rating).toBeNull();
  });

  it("applyPlaybackRecorded uses server playCount and lastPlayedUtc when present", () => {
    const items = [item({ playCount: 1, lastPlayedUtcMs: 1000 })];
    const lastPlayedUtc = "2024-06-01T00:00:00.000Z";
    const changed = applyPlaybackRecorded(indexProjectionItems(items), {
      itemId: "i1",
      playCount: 5,
      lastPlayedUtc
    });
    expect(changed).toBe(true);
    expect(items[0]?.playCount).toBe(5);
    expect(items[0]?.lastPlayedUtcMs).toBe(Date.parse(lastPlayedUtc));
  });

  it("applyPlaybackRecorded leaves playCount and lastPlayedUtc when those fields are missing", () => {
    const items = [item({ playCount: 2, lastPlayedUtcMs: 1000 })];
    const changed = applyPlaybackRecorded(indexProjectionItems(items), { itemId: "i1" });
    expect(changed).toBe(false);
    expect(items[0]?.playCount).toBe(2);
    expect(items[0]?.lastPlayedUtcMs).toBe(1000);
  });
});
