import { describe, expect, it } from "vitest";
import {
  parseLibraryIds,
  parseLibraryQueryPage,
  parseMediaType,
  parseUtcMs
} from "../library/libraryProjectionModel";

describe("libraryProjectionModel", () => {
  it("parses items with filter and sort fields", () => {
    const result = parseLibraryQueryPage({
      items: [
        {
          id: "i1",
          sourceId: "s1",
          fileName: "clip.mp4",
          relativePath: "videos/clip.mp4",
          playCount: 2,
          lastPlayedUtc: "2024-01-15T12:00:00Z",
          dateAddedUtc: "2023-07-01T00:00:00Z",
          dateCreatedUtc: "2023-06-01T00:00:00Z",
          duration: "00:02:30",
          durationSeconds: 150.48,
          mediaType: 0,
          isFavorite: true,
          isBlacklisted: false,
          hasAudio: true,
          integratedLoudness: -14,
          tags: ["Action"]
        }
      ],
      totalCount: 1,
      searchBaselineCount: 1
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "i1",
      fileName: "clip.mp4",
      durationSeconds: 150.48,
      mediaType: "video",
      isFavorite: true,
      dateAddedUtcMs: Date.UTC(2023, 6, 1),
      dateCreatedUtcMs: Date.UTC(2023, 5, 1),
      tags: ["Action"]
    });
  });

  it("reads duration as seconds and does not parse the duration string", () => {
    const page = parseLibraryQueryPage({
      items: [
        { id: "i1", sourceId: "s1", fileName: "clip.mp4", duration: "00:02:30", durationSeconds: 150.48 },
        { id: "i2", sourceId: "s1", fileName: "unprobed.mp4", duration: "00:02:30" },
        { id: "i3", sourceId: "s1", fileName: "photo.jpg" }
      ],
      totalCount: 3,
      searchBaselineCount: 3
    });
    expect(page.items.map((item) => item.durationSeconds)).toEqual([150.48, null, null]);
  });

  it("reads a rating in stars, a half-star step from 0.5 to 5, and none for an unrated item or any other value", () => {
    const ratings = [0.5, 3.5, 5, undefined, null, 0, 5.5, 3.3, "4"];
    const page = parseLibraryQueryPage({
      items: ratings.map((rating, index) => ({ id: `i${index}`, sourceId: "s1", fileName: "clip.mp4", rating })),
      totalCount: ratings.length,
      searchBaselineCount: ratings.length
    });
    expect(page.items.map((item) => item.rating)).toEqual([0.5, 3.5, 5, null, null, null, null, null, null]);
  });

  it("parseUtcMs parses ISO strings", () => {
    const ms = parseUtcMs("2024-01-15T12:00:00Z");
    expect(ms).not.toBeNull();
    expect(new Date(ms!).toISOString()).toBe("2024-01-15T12:00:00.000Z");
  });

  it("parseMediaType maps numeric and string values", () => {
    expect(parseMediaType(0)).toBe("video");
    expect(parseMediaType(1)).toBe("photo");
    expect(parseMediaType("Photo")).toBe("photo");
  });

  it("parses optional fullPath on items", () => {
    const result = parseLibraryQueryPage({
      items: [
        {
          id: "i1",
          sourceId: "s1",
          fileName: "clip.mp4",
          fullPath: "/data/videos/clip.mp4"
        }
      ]
    });

    expect(result.items[0]?.fullPath).toBe("/data/videos/clip.mp4");
  });

  it("parses thumbnail metadata fields", () => {
    const result = parseLibraryQueryPage({
      items: [
        {
          id: "i1",
          sourceId: "s1",
          fileName: "clip.mp4",
          hasThumbnail: true,
          thumbnailVersion: "1a-2b",
          thumbnailWidth: 480,
          thumbnailHeight: 270
        },
        {
          id: "i2",
          sourceId: "s1",
          fileName: "missing.jpg",
          hasThumbnail: false
        }
      ]
    });

    expect(result.items[0]).toMatchObject({
      hasThumbnail: true,
      thumbnailVersion: "1a-2b",
      thumbnailWidth: 480,
      thumbnailHeight: 270
    });
    expect(result.items[1]).toMatchObject({
      hasThumbnail: false,
      thumbnailVersion: null,
      thumbnailWidth: null,
      thumbnailHeight: null
    });
  });

  it("reads the ids a query-ids answer names, leaving out any that aren't text", () => {
    expect(parseLibraryIds({ ids: ["a", 7, null, "b"] })).toEqual(["a", "b"]);
    expect([parseLibraryIds({}), parseLibraryIds({ ids: "a" }), parseLibraryIds(null)]).toEqual([[], [], []]);
  });

  it("parses a list query page without dropping items for a missing source list", () => {
    const page = parseLibraryQueryPage({
      items: [
        {
          id: "i1",
          sourceId: "s1",
          fileName: "clip.mp4",
          isFavorite: true,
          tags: ["Night"],
          hasThumbnail: true,
          thumbnailWidth: 320,
          thumbnailHeight: 180
        }
      ],
      totalCount: 40,
      searchBaselineCount: 55
    });
    expect(page.totalCount).toBe(40);
    expect(page.searchBaselineCount).toBe(55);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "i1",
      isFavorite: true,
      tags: ["Night"],
      hasThumbnail: true,
      thumbnailWidth: 320
    });
  });
});
