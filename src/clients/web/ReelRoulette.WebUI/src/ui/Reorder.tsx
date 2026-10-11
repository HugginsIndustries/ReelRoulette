import type { RefObject } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  arrowKeyTarget,
  autoScrollStep,
  draggedRowTop,
  dragStarts,
  dropIndex,
  movedAnnouncement,
  rowShifts,
  type RowBox
} from "../reorder/reorder";

// Reordering by drag handle. A row moves only by its handle, so a drag anywhere else on the row still scrolls on a
// touch screen. The rows stay where they are in the page while one is dragged: the dragged row follows the pointer,
// the rows it passes slide out of its way, and the new order is set when it is dropped. Moving the rows in the page
// mid-drag would fight Preact, which draws them, and would drop the handle's focus.

export interface ReorderOptions {
  /** The keys of the rows that can move, in order. */
  keys: readonly string[];
  /** A row's name, as screen readers hear it. */
  nameOf: (key: string) => string;
  /** Moves the row at `from` to `to`, counted among the rows that can move. */
  onMove: (from: number, to: number) => void;
}

/** What a movable row's handle takes. */
export interface DragHandleControl {
  name: string;
  helpId: string;
  ref: (element: HTMLButtonElement | null) => void;
  onPointerDown: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

export interface Reorder {
  /** The key of the row being dragged, which shows lifted, or null. */
  dragging: string | null;
  /** The ref for the row with this key. */
  row: (key: string) => (element: HTMLElement | null) => void;
  /** What the handle of the row with this key takes. */
  handle: (key: string) => DragHandleControl;
  /** The help line's id, which each handle's description reads. */
  helpId: string;
  /** What screen readers last heard about a move. */
  announcement: string;
}

interface Drag {
  key: string;
  from: number;
  /** The rows that could move when the drag began; the drag ends without a move if they change. */
  keys: readonly string[];
  pointerId: number;
  startX: number;
  startY: number;
  /** How far below the row's top the pointer went down. */
  grab: number;
  y: number;
  started: boolean;
  /** The rows as laid out once the dragged row shows lifted, which hides a category's tags. */
  boxes: RowBox[] | null;
  scroller: HTMLElement | null;
  to: number;
  frame: number;
}

/** The closest container around `element` that scrolls, which scrolls under the pointer near its edges. */
function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }
  return null;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** Keeps one ref callback per key, so a row's ref doesn't change on every render. */
function refsByKey<T extends HTMLElement>(elements: Map<string, T>): (key: string) => (element: T | null) => void {
  const refs = new Map<string, (element: T | null) => void>();
  return (key) => {
    let ref = refs.get(key);
    if (!ref) {
      ref = (element) => {
        if (element) {
          elements.set(key, element);
        } else {
          elements.delete(key);
        }
      };
      refs.set(key, ref);
    }
    return ref;
  };
}

function createReorder(
  latest: RefObject<ReorderOptions>,
  setDragging: (key: string | null) => void,
  setAnnouncement: (text: string) => void
) {
  const rows = new Map<string, HTMLElement>();
  const handles = new Map<string, HTMLButtonElement>();
  let drag: Drag | null = null;
  // The handle that takes focus once a move has rendered.
  let focusKey: string | null = null;
  // After a drop, where its list was scrolled to, which it keeps once the rows render in their new order.
  let dropScroll: { scroller: HTMLElement | null; top: number } | null = null;

  function move(key: string, from: number, to: number, count: number): void {
    latest.current.onMove(from, to);
    setAnnouncement(movedAnnouncement(latest.current.nameOf(key), to, count));
    focusKey = key;
  }

  function measure(current: Drag): boolean {
    const row = rows.get(current.key);
    const scroller = row ? scrollerOf(row) : null;
    const scrollTop = scroller?.scrollTop ?? 0;
    const boxes: RowBox[] = [];
    for (const key of current.keys) {
      const element = rows.get(key);
      if (!element) {
        return false;
      }
      const box = element.getBoundingClientRect();
      boxes.push({ top: box.top + scrollTop, bottom: box.bottom + scrollTop });
    }
    current.boxes = boxes;
    current.scroller = scroller;
    return true;
  }

  /**
   * Moves the dragged row under the pointer, within the list, and slides the rows it has passed out of its way. Where
   * it lands goes by the pointer, so a row as tall as the first or last one still lands past it.
   */
  function place(current: Drag): void {
    const boxes = current.boxes!;
    const own = boxes[current.from]!;
    const top = current.y - current.grab + (current.scroller?.scrollTop ?? 0);
    current.to = dropIndex(boxes, current.from, top + (own.bottom - own.top) / 2);
    const shifts = rowShifts(boxes, current.from, current.to);
    const shown = draggedRowTop(boxes, current.from, top);
    current.keys.forEach((key, index) => {
      const offset = index === current.from ? shown - own.top : shifts[index]!;
      const element = rows.get(key);
      if (element) {
        element.style.transform = offset ? `translateY(${offset}px)` : "";
      }
    });
  }

  function scrollFrame(): void {
    const current = drag;
    if (!current?.scroller) {
      return;
    }
    const box = current.scroller.getBoundingClientRect();
    const step = autoScrollStep(current.y, box.top, box.bottom);
    if (step !== 0) {
      current.scroller.scrollTop += step;
      place(current);
    }
    current.frame = requestAnimationFrame(scrollFrame);
  }

  /** Keeps the dragged row under the pointer, and where it lands, while the list scrolls by a wheel or a touchpad. */
  function onScroll(): void {
    if (drag?.boxes) {
      place(drag);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    current.y = event.clientY;
    if (!current.started) {
      if (!dragStarts(event.clientX - current.startX, event.clientY - current.startY)) {
        return;
      }
      // The row shows lifted on the next render, and is measured and placed after it.
      current.started = true;
      document.body.classList.add("sorting");
      setDragging(current.key);
      return;
    }
    if (current.boxes) {
      place(current);
    }
  }

  function onPointerEnd(event: PointerEvent): void {
    if (drag && event.pointerId === drag.pointerId) {
      finish(true);
    }
  }

  /** Ends the drag, moving the row where it was dropped when `drop` is set, and otherwise leaving the order. */
  function finish(drop: boolean, unmounting = false): void {
    const current = drag;
    if (!current) {
      return;
    }
    drag = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerEnd);
    document.removeEventListener("pointercancel", onPointerEnd);
    current.scroller?.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(current.frame);
    const scrollTop = current.scroller?.scrollTop ?? 0;
    for (const key of current.keys) {
      const element = rows.get(key);
      if (element) {
        element.style.transform = "";
      }
    }
    if (current.started) {
      document.body.classList.remove("sorting");
      if (!unmounting) {
        setDragging(null);
      }
    }
    if (!drop) {
      return;
    }
    if (current.boxes && current.to !== current.from) {
      move(current.key, current.from, current.to, current.keys.length);
    }
    if (!current.started) {
      handles.get(current.key)?.focus({ preventScroll: true });
      return;
    }
    // The handle takes focus once the rows render where they were dropped, not at its old place, and without scrolling.
    // The list keeps where it was scrolled to, however the browser scrolled it as the rows moved.
    focusKey = current.key;
    dropScroll = { scroller: current.scroller, top: scrollTop };
  }

  return {
    rowRef: refsByKey(rows),
    handleRef: refsByKey(handles),

    pointerDown(key: string, event: PointerEvent): void {
      const row = rows.get(key);
      const from = latest.current.keys.indexOf(key);
      if (drag || event.button !== 0 || !row || from < 0) {
        return;
      }
      // Keeps the browser from selecting text or focusing the handle; it takes focus when the pointer comes up.
      event.preventDefault();
      drag = {
        key,
        from,
        keys: latest.current.keys.slice(),
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grab: event.clientY - row.getBoundingClientRect().top,
        y: event.clientY,
        started: false,
        boxes: null,
        scroller: null,
        to: from,
        frame: 0
      };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerEnd);
      document.addEventListener("pointercancel", onPointerEnd);
    },

    keyDown(key: string, event: KeyboardEvent): void {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      // The arrow keys move the row, never scroll the list, even at either end.
      event.preventDefault();
      const keys = latest.current.keys;
      const from = keys.indexOf(key);
      const to = drag || from < 0 ? null : arrowKeyTarget(event.key, from, keys.length);
      if (to !== null) {
        move(key, from, to, keys.length);
      }
    },

    afterRender(dragging: string | null): void {
      const current = drag;
      if (current && !sameKeys(current.keys, latest.current.keys)) {
        finish(false);
      } else if (current?.started && !current.boxes && dragging === current.key) {
        if (measure(current)) {
          place(current);
          if (current.scroller) {
            current.scroller.addEventListener("scroll", onScroll);
            current.frame = requestAnimationFrame(scrollFrame);
          }
        } else {
          finish(false);
        }
      }
      if (focusKey !== null) {
        const key = focusKey;
        const dropped = dropScroll;
        focusKey = null;
        dropScroll = null;
        if (dropped) {
          if (dropped.scroller) {
            dropped.scroller.scrollTop = dropped.top;
          }
          handles.get(key)?.focus({ preventScroll: true });
        } else {
          // An arrow key's move brings the handle into view when its row has left it.
          handles.get(key)?.focus();
        }
      }
    },

    dispose(): void {
      finish(false, true);
    }
  };
}

/**
 * Reorders a list's rows by their drag handles, or with the up and down arrow keys while a handle has focus. Each
 * move goes to `onMove`, then focus is on the moved row's handle and screen readers hear its new position.
 */
export function useReorder(options: ReorderOptions): Reorder {
  const latest = useRef(options);
  latest.current = options;
  const helpId = useId();
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [controller] = useState(() => createReorder(latest, setDragging, setAnnouncement));
  useLayoutEffect(() => {
    controller.afterRender(dragging);
  });
  useEffect(() => () => controller.dispose(), []);
  return {
    dragging,
    row: controller.rowRef,
    handle: (key) => ({
      name: options.nameOf(key),
      helpId,
      ref: controller.handleRef(key),
      onPointerDown: (event) => controller.pointerDown(key, event),
      onKeyDown: (event) => controller.keyDown(key, event)
    }),
    helpId,
    announcement
  };
}

const HANDLE = "drag-handle icon-glyph-base icon-glyph-button";

/** A row's drag handle, or with `fixed`, a dimmed one for a row that can't move, whose name says why. */
export function DragHandle(props: { control: DragHandleControl } | { fixed: string }) {
  const icon = <span class="material-symbol-icon">drag_indicator</span>;
  if ("fixed" in props) {
    return (
      <button type="button" class={HANDLE} title={props.fixed} aria-label={props.fixed} disabled>
        {icon}
      </button>
    );
  }
  const { name, helpId, ...handlers } = props.control;
  return (
    <button type="button" class={HANDLE} title="Drag to reorder" aria-label={`Reorder ${name}`} aria-describedby={helpId} {...handlers}>
      {icon}
    </button>
  );
}

/** The list's help line, which each handle's description reads, and where screen readers hear each move. */
export function ReorderStatus({ reorder }: { reorder: Reorder }) {
  return (
    <>
      <p id={reorder.helpId} class="visually-hidden">Drag to reorder, or press the up and down arrow keys.</p>
      <div class="visually-hidden" aria-live="polite">{reorder.announcement}</div>
    </>
  );
}
