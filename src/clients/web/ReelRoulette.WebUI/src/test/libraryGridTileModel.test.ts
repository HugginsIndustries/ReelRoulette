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
    isBlacklisted: false,
    isPlaying: false
  };

  it("buildThumbnailUrl uses api base and encoded item id", () => {
    const url = buildThumbnailUrl("http://localhost:51301", "abc/def");
    expect(url).toBe("http://localhost:51301/api/thumbnail/abc%2Fdef");
  });

  it("buildThumbnailUrl adds the thumbnail version when there is one", () => {
    expect(buildThumbnailUrl("http://localhost:51301/", "abc/def", "1a-2b")).toBe(
      "http://localhost:51301/api/thumbnail/abc%2Fdef?v=1a-2b"
    );
    expect(buildThumbnailUrl("http://localhost:51301", "abc", null)).toBe("http://localhost:51301/api/thumbnail/abc");
  });

  it("renders favorite badge when item is favorite", () => {
    const html = renderGridTileHtml(
      { ...baseTile, isFavorite: true },
      buildThumbnailUrl("http://localhost:51301", "item-1")
    );
    expect(html).toContain("material-symbol-icon is-filled library-grid-tile-badge-icon");
    expect(html).toContain("favorite");
    expect(html).toContain("library-grid-tile-badge");
    expect(html).not.toContain("material-symbols-outlined");
  });

  it("renders blacklist badge when item is blacklisted", () => {
    const html = renderGridTileHtml(
      { ...baseTile, isBlacklisted: true },
      buildThumbnailUrl("http://localhost:51301", "item-1")
    );
    expect(html).toContain("material-symbol-icon is-filled library-grid-tile-badge-icon");
    expect(html).toContain("thumb_down");
    expect(html).not.toContain("material-symbols-outlined");
  });

  it("gives every tile the playing icon, and marks only the playing one", () => {
    const thumbnail = buildThumbnailUrl("http://localhost:51301", "item-1");
    const playing = renderGridTileHtml({ ...baseTile, isPlaying: true }, thumbnail);
    const other = renderGridTileHtml(baseTile, thumbnail);
    expect(playing).toContain('class="library-grid-tile is-playing"');
    expect(other).toContain('class="library-grid-tile"');
    for (const html of [playing, other]) {
      expect(html).toContain(
        '<div class="library-grid-tile-playing"><span class="material-symbol-icon is-filled">play_circle</span></div>'
      );
    }
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

  it("makes the file name the whole tile's tooltip, and keeps it in the name bar", () => {
    const html = renderGridTileHtml(baseTile, buildThumbnailUrl("http://localhost:51301", "item-1"));
    expect(html).toMatch(/^<div class="library-grid-tile"[^>]* title="clip\.mp4"/);
    expect(html).toContain('<div class="library-grid-tile-filename">clip.mp4</div>');
  });

  it("includes data-item-id", () => {
    const html = renderGridTileHtml(baseTile, buildThumbnailUrl("http://localhost:51301", "item-1"));
    expect(html).toContain('data-item-id="item-1"');
  });

  it("hasGridStateIndicator is true when favorite or blacklisted", () => {
    expect(hasGridStateIndicator(true, false)).toBe(true);
    expect(hasGridStateIndicator(false, true)).toBe(true);
    expect(hasGridStateIndicator(false, false)).toBe(false);
  });
});
