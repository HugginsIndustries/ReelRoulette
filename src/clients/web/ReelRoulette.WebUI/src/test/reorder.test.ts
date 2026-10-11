import { describe, expect, it } from "vitest";
import {
  arrowKeyTarget,
  autoScrollStep,
  draggedRowTop,
  dragStarts,
  dropIndex,
  moveEntry,
  movedAnnouncement,
  rowShifts,
  type RowBox
} from "../reorder/reorder";

/** Rows of these heights, stacked with `gap` between them, from the top. */
function stack(heights: readonly number[], gap = 0): RowBox[] {
  let top = 0;
  return heights.map((height) => {
    const box = { top, bottom: top + height };
    top += height + gap;
    return box;
  });
}

describe("where a dragged row lands", () => {
  // Four 40 px rows: midpoints at 20, 60, 100, and 140.
  const rows = stack([40, 40, 40, 40]);

  it("stays while its center hasn't crossed a neighbor's midpoint", () => {
    expect(dropIndex(rows, 1, 60)).toBe(1);
    expect(dropIndex(rows, 1, 21)).toBe(1);
    expect(dropIndex(rows, 1, 99)).toBe(1);
  });

  it("passes each neighbor whose midpoint its center has crossed, up or down", () => {
    expect(dropIndex(rows, 1, 19)).toBe(0);
    expect(dropIndex(rows, 1, 101)).toBe(2);
    expect(dropIndex(rows, 0, 141)).toBe(3);
    expect(dropIndex(rows, 3, 59)).toBe(1);
  });

  it("stops at either end", () => {
    expect(dropIndex(rows, 2, -500)).toBe(0);
    expect(dropIndex(rows, 2, 900)).toBe(3);
    expect(dropIndex(stack([40]), 0, 900)).toBe(0);
  });

  it("goes by each neighbor's own midpoint when the rows differ in height", () => {
    // A tall row of 200 px, then rows of 40 px: midpoints at 100, 220, and 260.
    const mixed = stack([200, 40, 40]);
    expect(dropIndex(mixed, 2, 101)).toBe(1);
    expect(dropIndex(mixed, 2, 99)).toBe(0);
    expect(dropIndex(mixed, 0, 219)).toBe(0);
    expect(dropIndex(mixed, 0, 221)).toBe(1);
  });
});

describe("where the dragged row shows", () => {
  // Rows of 40, 60, and 40 px, 12 px apart: the list runs from 0 to 164.
  const rows = stack([40, 60, 40], 12);

  it("follows the pointer inside the list", () => {
    expect(draggedRowTop(rows, 1, 30)).toBe(30);
    expect(draggedRowTop(rows, 1, 0)).toBe(0);
    expect(draggedRowTop(rows, 1, 104)).toBe(104);
  });

  it("stops at the list's top and bottom, so it never makes the list longer", () => {
    expect(draggedRowTop(rows, 1, -50)).toBe(0);
    expect(draggedRowTop(rows, 1, 105)).toBe(104);
    expect(draggedRowTop(rows, 0, 900)).toBe(124);
    expect(draggedRowTop(stack([40]), 0, 900)).toBe(0);
  });
});

describe("how the other rows slide while a row is dragged", () => {
  it("moves the rows it has passed over by the room it takes, gap included, toward where it came from", () => {
    const rows = stack([40, 60, 40, 40], 12);
    expect(rowShifts(rows, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(rowShifts(rows, 1, 3)).toEqual([0, 0, -72, -72]);
    expect(rowShifts(rows, 1, 0)).toEqual([72, 0, 0, 0]);
  });

  it("takes the last row's room from the row above it", () => {
    const rows = stack([40, 40, 30], 12);
    expect(rowShifts(rows, 2, 0)).toEqual([42, 42, 0]);
  });

  it("moves nothing when there is only one row", () => {
    expect(rowShifts(stack([40]), 0, 0)).toEqual([0]);
  });
});

describe("starting a drag, the arrow keys, and scrolling", () => {
  it("starts a drag only once the pointer has moved more than a few pixels", () => {
    expect(dragStarts(0, 0)).toBe(false);
    expect(dragStarts(3, 4)).toBe(false);
    expect(dragStarts(0, 6)).toBe(true);
    expect(dragStarts(-6, 0)).toBe(true);
  });

  it("moves a row one place with the up and down arrow keys, and not past either end", () => {
    expect(arrowKeyTarget("ArrowUp", 2, 4)).toBe(1);
    expect(arrowKeyTarget("ArrowDown", 2, 4)).toBe(3);
    expect(arrowKeyTarget("ArrowUp", 0, 4)).toBeNull();
    expect(arrowKeyTarget("ArrowDown", 3, 4)).toBeNull();
    expect(arrowKeyTarget("ArrowLeft", 2, 4)).toBeNull();
    expect(arrowKeyTarget("Enter", 2, 4)).toBeNull();
  });

  it("scrolls faster the nearer the pointer is to the scroller's edge, and not away from the edges", () => {
    expect(autoScrollStep(300, 100, 500)).toBe(0);
    expect(autoScrollStep(140, 100, 500)).toBe(0);
    expect(autoScrollStep(139, 100, 500)).toBe(-1);
    expect(autoScrollStep(100, 100, 500)).toBe(-10);
    expect(autoScrollStep(461, 100, 500)).toBe(1);
    expect(autoScrollStep(520, 100, 500)).toBe(15);
  });
});

describe("moving an entry and announcing it", () => {
  it("moves an entry to its new place and leaves the list it came from", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveEntry(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveEntry(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveEntry(list, 1, 1)).toEqual(list);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("says the row's new position, counting from one", () => {
    expect(movedAnnouncement("People", 1, 3)).toBe("People moved to position 2 of 3.");
  });
});
