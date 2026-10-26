import { describe, expect, it } from "vitest";
import { keepInside, placeAtPoint } from "../ui/placement";

const WINDOW = { width: 1024, height: 768 };
const MENU = { width: 240, height: 300 };

describe("placement inside the window", () => {
  it("keeps a box 8 px inside, moving it as little as it takes", () => {
    expect(keepInside(100, 200, 1024)).toBe(100);
    expect(keepInside(900, 200, 1024)).toBe(816);
    expect(keepInside(2, 200, 1024)).toBe(8);
    // Longer than the room, it starts at the margin.
    expect(keepInside(100, 1100, 1024)).toBe(8);
  });

  it("opens a menu below and to the right of the point", () => {
    expect(placeAtPoint({ x: 100, y: 120 }, MENU, WINDOW)).toEqual({ left: 100, top: 120 });
  });

  it("opens it on the point's other side along a side where it would cross the window's edge", () => {
    expect(placeAtPoint({ x: 1000, y: 120 }, MENU, WINDOW)).toEqual({ left: 760, top: 120 });
    expect(placeAtPoint({ x: 100, y: 700 }, MENU, WINDOW)).toEqual({ left: 100, top: 400 });
    expect(placeAtPoint({ x: 1000, y: 700 }, MENU, WINDOW)).toEqual({ left: 760, top: 400 });
    // Exactly 8 px from the edge still fits.
    expect(placeAtPoint({ x: 776, y: 460 }, MENU, WINDOW)).toEqual({ left: 776, top: 460 });
  });

  it("keeps it inside where neither side of the point has room", () => {
    expect(placeAtPoint({ x: 200, y: 200 }, MENU, { width: 300, height: 400 })).toEqual({ left: 8, top: 8 });
  });
});
