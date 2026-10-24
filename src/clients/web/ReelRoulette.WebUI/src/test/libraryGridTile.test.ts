// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildThumbnailUrl, createGridTile, type GridTileView } from "../library/libraryGridTile";

const THUMBNAIL = "http://localhost:51301/api/thumbnail/item-1?v=1a-2b";

const view: GridTileView = {
  tileWidth: 320,
  tileHeight: 200,
  fileName: "clip.mp4",
  thumbnailUrl: THUMBNAIL,
  isFavorite: false,
  isBlacklisted: false
};

function badgeIcons(element: HTMLElement): string[] {
  return Array.from(element.querySelectorAll(".library-grid-tile-badge .library-grid-tile-badge-icon")).map(
    (icon) => icon.textContent ?? ""
  );
}

/** What changing a tile wrote to its elements. */
function changesBy(element: HTMLElement, change: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => {});
  observer.observe(element, { subtree: true, childList: true, attributes: true, characterData: true });
  change();
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}

describe("buildThumbnailUrl", () => {
  it("uses the api base and the encoded item id", () => {
    expect(buildThumbnailUrl("http://localhost:51301", "abc/def")).toBe("http://localhost:51301/api/thumbnail/abc%2Fdef");
  });

  it("adds the thumbnail version when there is one", () => {
    expect(buildThumbnailUrl("http://localhost:51301/", "abc/def", "1a-2b")).toBe(
      "http://localhost:51301/api/thumbnail/abc%2Fdef?v=1a-2b"
    );
    expect(buildThumbnailUrl("http://localhost:51301", "abc", null)).toBe("http://localhost:51301/api/thumbnail/abc");
  });
});

describe("grid tile", () => {
  it("shows the thumbnail loading lazily, its item id, and its size", () => {
    const { element } = createGridTile("item-1", view, false);
    const image = element.querySelector<HTMLImageElement>(".library-grid-tile-scrim > img.library-grid-tile-image")!;

    expect(image.getAttribute("src")).toBe(THUMBNAIL);
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
    expect(element.dataset.itemId).toBe("item-1");
    expect(element.style.width).toBe("320px");
    expect(element.style.height).toBe("200px");
  });

  it("has no image without a thumbnail, keeping the scrim", () => {
    const { element } = createGridTile("item-1", { ...view, thumbnailUrl: null }, false);

    expect(element.querySelector("img")).toBeNull();
    expect(element.querySelector(".library-grid-tile-scrim")).not.toBeNull();
  });

  it("shows favorite and blacklist as filled badge icons, and no badge without either", () => {
    expect(badgeIcons(createGridTile("item-1", { ...view, isFavorite: true }, false).element)).toEqual(["favorite"]);
    expect(badgeIcons(createGridTile("item-1", { ...view, isBlacklisted: true }, false).element)).toEqual(["thumb_down"]);
    const both = createGridTile("item-1", { ...view, isFavorite: true, isBlacklisted: true }, false).element;
    expect(badgeIcons(both)).toEqual(["favorite", "thumb_down"]);
    for (const icon of both.querySelectorAll(".library-grid-tile-badge-icon")) {
      expect(icon.className).toBe("material-symbol-icon is-filled library-grid-tile-badge-icon");
    }
    expect(createGridTile("item-1", view, false).element.querySelector(".library-grid-tile-badge")).toBeNull();
  });

  it("gives every tile the playing icon, and marks only the playing one", () => {
    const playing = createGridTile("item-1", view, true);
    const other = createGridTile("item-2", view, false);

    expect(playing.element.className).toBe("library-grid-tile is-playing");
    expect(other.element.className).toBe("library-grid-tile");
    for (const { element } of [playing, other]) {
      expect(element.querySelector(".library-grid-tile-playing > .material-symbol-icon.is-filled")?.textContent).toBe(
        "play_circle"
      );
    }
    playing.setPlaying(false);
    other.setPlaying(true);
    expect(playing.element.className).toBe("library-grid-tile");
    expect(other.element.className).toBe("library-grid-tile is-playing");
  });

  it("makes the file name the whole tile's tooltip and the name bar's text, as text", () => {
    const { element } = createGridTile("item-1", { ...view, fileName: 'a<b>"c"' }, false);
    const bar = element.querySelector(".library-grid-tile-filename")!;

    expect(element.title).toBe('a<b>"c"');
    expect(bar.textContent).toBe('a<b>"c"');
    expect(bar.children).toHaveLength(0);
  });
});

describe("grid tile update", () => {
  it("writes nothing when nothing changed", () => {
    const tile = createGridTile("item-1", { ...view, isFavorite: true }, false);

    expect(changesBy(tile.element, () => tile.update({ ...view, isFavorite: true }))).toHaveLength(0);
  });

  it("changes only the badge for a favorite or blacklist change", () => {
    const tile = createGridTile("item-1", view, false);
    const image = tile.element.querySelector("img");

    const favorited = changesBy(tile.element, () => tile.update({ ...view, isFavorite: true }));
    expect(badgeIcons(tile.element)).toEqual(["favorite"]);
    const badge = tile.element.querySelector(".library-grid-tile-badge")!;
    expect(favorited.map((record) => Array.from(record.addedNodes))).toEqual([[badge]]);

    const blacklisted = changesBy(tile.element, () => tile.update({ ...view, isFavorite: true, isBlacklisted: true }));
    expect(badgeIcons(tile.element)).toEqual(["favorite", "thumb_down"]);
    expect(blacklisted.length).toBeGreaterThan(0);
    expect(blacklisted.every((record) => record.target === badge)).toBe(true);

    const cleared = changesBy(tile.element, () => tile.update(view));
    expect(tile.element.querySelector(".library-grid-tile-badge")).toBeNull();
    expect(cleared.map((record) => Array.from(record.removedNodes))).toEqual([[badge]]);
    expect(tile.element.querySelector("img")).toBe(image);
  });

  it("points the kept image at a rewritten thumbnail's new version", () => {
    const tile = createGridTile("item-1", view, false);
    const image = tile.element.querySelector("img")!;

    tile.update({ ...view, thumbnailUrl: "http://localhost:51301/api/thumbnail/item-1?v=3c-2b" });

    expect(tile.element.querySelector("img")).toBe(image);
    expect(image.getAttribute("src")).toBe("http://localhost:51301/api/thumbnail/item-1?v=3c-2b");
  });

  it("adds and removes the image as the item gains and loses its thumbnail", () => {
    const tile = createGridTile("item-1", { ...view, thumbnailUrl: null }, false);

    tile.update(view);
    expect(tile.element.querySelector("img")?.getAttribute("src")).toBe(THUMBNAIL);
    tile.update({ ...view, thumbnailUrl: null });
    expect(tile.element.querySelector("img")).toBeNull();
  });

  it("changes the size, tooltip, and name bar in place", () => {
    const tile = createGridTile("item-1", view, false);

    tile.update({ ...view, tileWidth: 210.5, tileHeight: 120, fileName: "renamed.mp4" });

    expect(tile.element.style.width).toBe("210.5px");
    expect(tile.element.style.height).toBe("120px");
    expect(tile.element.title).toBe("renamed.mp4");
    expect(tile.element.querySelector(".library-grid-tile-filename")!.textContent).toBe("renamed.mp4");
  });
});
