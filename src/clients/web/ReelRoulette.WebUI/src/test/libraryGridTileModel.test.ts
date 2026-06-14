import { describe, expect, it } from "vitest";
import {
  buildThumbnailUrl,
  hasGridStateIndicator,
  renderGridTileHtml
} from "../library/libraryGridTileModel";

describe("libraryGridTileModel", () => {
  const baseTile = {
    tileWidth: 320,
    tileHeight: 200,
    fileName: "clip.mp4",
    itemId: "item-1",
    hasThumbnail: true,
    isFavorite: false,
    isBlacklisted: false
  };

  it("buildThumbnailUrl uses api base and encoded item id", () => {
    const url = buildThumbnailUrl("http://localhost:51301", "abc/def");
    expect(url).toBe("http://localhost:51301/api/thumbnail/abc%2Fdef");
  });

  it("renders favorite badge when item is favorite", () => {
    const html = renderGridTileHtml(
      { ...baseTile, isFavorite: true },
      buildThumbnailUrl("http://localhost:51301", "item-1")
    );
    expect(html).toContain("material-symbol-icon library-grid-tile-badge-icon");
    expect(html).toContain("favorite");
    expect(html).toContain("library-grid-tile-badge");
    expect(html).not.toContain("material-symbols-outlined");
  });

  it("renders blacklist badge when item is blacklisted", () => {
    const html = renderGridTileHtml(
      { ...baseTile, isBlacklisted: true },
      buildThumbnailUrl("http://localhost:51301", "item-1")
    );
    expect(html).toContain("material-symbol-icon library-grid-tile-badge-icon");
    expect(html).toContain("thumb_down");
    expect(html).not.toContain("material-symbols-outlined");
  });

  it("omits img when hasThumbnail is false", () => {
    const html = renderGridTileHtml({ ...baseTile, hasThumbnail: false }, null);
    expect(html).not.toContain("<img");
    expect(html).toContain("library-grid-tile-scrim");
  });

  it("escapes filename in bar and title", () => {
    const html = renderGridTileHtml(
      { ...baseTile, fileName: 'a<b>"c"' },
      buildThumbnailUrl("http://localhost:51301", "item-1")
    );
    expect(html).toContain("a&lt;b&gt;&quot;c&quot;");
    expect(html).not.toContain('a<b>"c"');
  });

  it("hasGridStateIndicator is true when favorite or blacklisted", () => {
    expect(hasGridStateIndicator(true, false)).toBe(true);
    expect(hasGridStateIndicator(false, true)).toBe(true);
    expect(hasGridStateIndicator(false, false)).toBe(false);
  });
});
