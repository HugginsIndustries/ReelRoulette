/** How far a box placed by script keeps from the window's edges, in pixels. */
export const WINDOW_MARGIN = 8;

export interface BoxSize {
  width: number;
  height: number;
}

/** A point in the window, in CSS pixels, such as where a right-click landed. */
export interface WindowPoint {
  x: number;
  y: number;
}

/**
 * Where a box `size` long starts along one side of a window `extent` long, moved from `start` as little as it takes to
 * keep it `WINDOW_MARGIN` inside, or at the margin when it is longer than the room.
 */
export function keepInside(start: number, size: number, extent: number): number {
  return Math.max(WINDOW_MARGIN, Math.min(start, extent - size - WINDOW_MARGIN));
}

/**
 * Where a box opened at `point` goes, as a context menu opens: below and to the right of the point, or on the point's
 * other side along a side where it would cross the window's edge, and kept inside the window.
 */
export function placeAtPoint(point: WindowPoint, size: BoxSize, window: BoxSize): { left: number; top: number } {
  const left = point.x + size.width + WINDOW_MARGIN > window.width ? point.x - size.width : point.x;
  const top = point.y + size.height + WINDOW_MARGIN > window.height ? point.y - size.height : point.y;
  return { left: keepInside(left, size.width, window.width), top: keepInside(top, size.height, window.height) };
}
