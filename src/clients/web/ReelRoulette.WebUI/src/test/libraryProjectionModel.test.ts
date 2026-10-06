import { describe, expect, it } from "vitest";
import {
  parseLibraryProjection,
  parseLibraryQueryPage,
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
          durationSeconds: 150.48,
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
      durationSeconds: 150.48,
      mediaType: "video",
      isFavorite: true,
      tags: ["Action"]
    });
    expect(result.catalog.categories).toHaveLength(1);
    expect(result.catalog.tags[0]?.name).toBe("Action");
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
