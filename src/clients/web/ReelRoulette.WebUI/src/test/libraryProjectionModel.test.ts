import { describe, expect, it } from "vitest";
import {
  parseDurationSeconds,
  parseLibraryProjection,
  parseMediaType,
  parseUtcMs
} from "../library/libraryProjectionModel";

describe("libraryProjectionModel", () => {
  it("parses enabled-source items with filter and sort fields", () => {
    const result = parseLibraryProjection({
      sources: [
        { id: "s1", isEnabled: true },
        { id: "s2", isEnabled: false }
      ],
      categories: [{ id: "c1", name: "Genre" }],
      tags: [{ name: "Action", categoryId: "c1" }],
      items: [
        {
          id: "i1",
          sourceId: "s1",
          fileName: "clip.mp4",
          relativePath: "videos/clip.mp4",
          playCount: 2,
          lastPlayedUtc: "2024-01-15T12:00:00Z",
          lastWriteTimeUtc: "2023-06-01T00:00:00Z",
          duration: "00:02:30",
          mediaType: 0,
          isFavorite: true,
          isBlacklisted: false,
          hasAudio: true,
          integratedLoudness: -14,
          tags: ["Action"]
        },
        { id: "i2", sourceId: "s2", fileName: "skip.mp4" }
      ]
    });

    expect(result.summary.totalItems).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "i1",
      fileName: "clip.mp4",
      durationSeconds: 150,
      mediaType: "video",
      isFavorite: true,
      tags: ["Action"]
    });
    expect(result.catalog.categories).toHaveLength(1);
    expect(result.catalog.tags[0]?.name).toBe("Action");
  });

  it("parseDurationSeconds handles HH:MM:SS and null", () => {
    expect(parseDurationSeconds("00:02:30")).toBe(150);
    expect(parseDurationSeconds(null)).toBeNull();
    expect(parseDurationSeconds("bad")).toBeNull();
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

  it("parses optional fullPath on projection items", () => {
    const result = parseLibraryProjection({
      sources: [{ id: "s1", isEnabled: true }],
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

  it("parses projection thumbnail metadata fields", () => {
    const result = parseLibraryProjection({
      sources: [{ id: "s1", isEnabled: true }],
      items: [
        {
          id: "i1",
          sourceId: "s1",
          fileName: "clip.mp4",
          hasThumbnail: true,
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
      thumbnailWidth: 480,
      thumbnailHeight: 270
    });
    expect(result.items[1]).toMatchObject({
      hasThumbnail: false,
      thumbnailWidth: null,
      thumbnailHeight: null
    });
  });
});
