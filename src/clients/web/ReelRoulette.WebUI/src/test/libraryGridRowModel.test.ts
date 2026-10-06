import { describe, expect, it } from "vitest";
import type { LibraryGridRowLayout } from "../library/libraryGridLayout";
import type { LibraryProjectionItem } from "../library/libraryProjectionModel";
import { renderGridRowHtml } from "../library/libraryGridRowModel";

const row: LibraryGridRowLayout = {
  tiles: [{ tileWidth: 160, tileHeight: 90, itemIndex: 0, aspectRatioUsed: 16 / 9 }],
  startItemIndex: 0,
  endItemIndexExclusive: 1,
  itemCount: 1,
  rowHeight: 90,
  rowWidth: 160
};

function item(overrides: Partial<LibraryProjectionItem> = {}): LibraryProjectionItem {
  return {
    id: "item-1",
    sourceId: "s1",
    fileName: "clip.mp4",
    fullPath: null,
    relativePath: "clip.mp4",
    playCount: 0,
    lastPlayedUtcMs: null,
    lastWriteTimeUtcMs: null,
    durationSeconds: null,
    mediaType: "video",
    isFavorite: false,
    isBlacklisted: false,
    hasAudio: null,
    integratedLoudness: null,
    tags: [],
    hasThumbnail: true,
    thumbnailVersion: "1a-2b",
    thumbnailWidth: 160,
    thumbnailHeight: 90,
    ...overrides
  };
}

function imageSrc(html: string): string | null {
  return /<img[^>]* src="([^"]*)"/.exec(html)?.[1] ?? null;
}

describe("libraryGridRowModel", () => {
  it("renders an unchanged thumbnail at the same versioned URL every time its row is rebuilt", () => {
    const first = imageSrc(renderGridRowHtml(row, [item()], "http://localhost:51301"));
    const scrolledBack = imageSrc(renderGridRowHtml(row, [item({ isFavorite: true })], "http://localhost:51301"));

    expect(first).toBe("http://localhost:51301/api/thumbnail/item-1?v=1a-2b");
    expect(scrolledBack).toBe(first);
  });

  it("renders a rewritten thumbnail at a new URL", () => {
    const before = imageSrc(renderGridRowHtml(row, [item()], "http://localhost:51301"));
    const after = imageSrc(renderGridRowHtml(row, [item({ thumbnailVersion: "3c-2b" })], "http://localhost:51301"));

    expect(after).toBe("http://localhost:51301/api/thumbnail/item-1?v=3c-2b");
    expect(after).not.toBe(before);
  });

  it("keeps the placeholder for an item without a thumbnail", () => {
    const html = renderGridRowHtml(row, [item({ hasThumbnail: false, thumbnailVersion: null })], "http://localhost:51301");

    expect(imageSrc(html)).toBeNull();
    expect(html).toContain("library-grid-tile-scrim");
  });
});
