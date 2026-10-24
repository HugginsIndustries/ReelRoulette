/**
 * Reordering a list by its rows' drag handles, as the tag editor's categories and the filter dialog's presets do. Rows
 * are counted among the rows that can move.
 */

/** How far the pointer moves on a handle before a drag starts, in pixels, so a tap on the handle changes nothing. */
export const DRAG_START_DISTANCE = 5;

/** How near the scroller's top or bottom edge the pointer comes before the list scrolls under it, in pixels. */
export const AUTO_SCROLL_EDGE = 40;

/**
 * A row's top and bottom as laid out once the dragged row shows lifted, in the scroller's content, so scrolling
 * doesn't move them.
 */
export interface RowBox {
  top: number;
  bottom: number;
}

/** Whether the pointer has moved far enough from where it went down on a handle to start a drag. */
export function dragStarts(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > DRAG_START_DISTANCE;
}

function midpoint(box: RowBox): number {
  return (box.top + box.bottom) / 2;
}

/**
 * Where the dragged row lands: past each row whose midpoint its center has crossed. `boxes` are the rows as laid out
 * once the dragged row shows lifted, in order, with the dragged row at `from`, and `center` is where its center is
 * now, measured the same way.
 */
export function dropIndex(boxes: readonly RowBox[], from: number, center: number): number {
  let to = from;
  while (to > 0 && center < midpoint(boxes[to - 1]!)) {
    to--;
  }
  if (to === from) {
    while (to < boxes.length - 1 && center > midpoint(boxes[to + 1]!)) {
      to++;
    }
  }
  return to;
}

/**
 * Where the dragged row shows, with its top wanted at `top`: there, but no higher than the first row's top and no
 * lower than the last row's bottom. Below the last row it would make the list longer, and the list would scroll on
 * under it.
 */
export function draggedRowTop(boxes: readonly RowBox[], from: number, top: number): number {
  const own = boxes[from]!;
  const lowest = boxes[boxes.length - 1]!.bottom - (own.bottom - own.top);
  return Math.min(Math.max(top, boxes[0]!.top), lowest);
}

/**
 * How far each row slides while the dragged row would land at `to`: each row it has passed moves over by the room the
 * dragged row takes, toward where the dragged row came from, and the others stay.
 */
export function rowShifts(boxes: readonly RowBox[], from: number, to: number): number[] {
  const room =
    from < boxes.length - 1 ? boxes[from + 1]!.top - boxes[from]!.top : from > 0 ? boxes[from]!.bottom - boxes[from - 1]!.bottom : 0;
  return boxes.map((_, index) => {
    if (index > from && index <= to) {
      return -room;
    }
    if (index >= to && index < from) {
      return room;
    }
    return 0;
  });
}

/** How far the scroller scrolls in one frame while the pointer is near its top edge (negative) or its bottom edge. */
export function autoScrollStep(pointerY: number, top: number, bottom: number): number {
  if (pointerY < top + AUTO_SCROLL_EDGE) {
    return -Math.ceil((top + AUTO_SCROLL_EDGE - pointerY) / 4);
  }
  if (pointerY > bottom - AUTO_SCROLL_EDGE) {
    return Math.ceil((pointerY - bottom + AUTO_SCROLL_EDGE) / 4);
  }
  return 0;
}

/** The list with the entry at `from` moved to `to`. */
export function moveEntry<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry!);
  return next;
}

/** What screen readers hear after a row moves. */
export function movedAnnouncement(name: string, to: number, count: number): string {
  return `${name} moved to position ${to + 1} of ${count}.`;
}
