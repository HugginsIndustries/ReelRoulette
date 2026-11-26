import type { WindowPoint } from "./placement";

/** How long a finger or a pen rests before the press counts as a long press. */
export const LONG_PRESS_MS = 500;
/** How far the press may move, in pixels, before it is a scroll or a drag rather than a long press. */
export const LONG_PRESS_MOVE_PX = 8;

export interface LongPressOptions<T> {
  /** What a finger's or a pen's press on `target` would act on, or null where a long press does nothing. */
  pressAt(target: Element): T | null;
  /** A long press on what `pressAt` gave was held long enough, at the point where it began. */
  onLongPress(pressed: T, point: WindowPoint): void;
}

export interface LongPress {
  /** Whether the last press was a mouse's, as it is before any press. */
  byMouse(): boolean;
  /**
   * Whether the click that just came ends a press that was already a long press, which it then uses up, so what the
   * press was on isn't also pressed, played, or chosen.
   */
  takeClick(): boolean;
  dispose(): void;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A long press anywhere in `root`, from a finger or a pen; a mouse has its right-click. It counts once it has rested
 * for `LONG_PRESS_MS` without moving `LONG_PRESS_MOVE_PX`, and a second finger, as for a pinch, a scroll the browser
 * takes over, or lifting the finger first, ends it before then. Only the first finger down starts one, so a pinch never
 * does. It hears presses in the capture phase, so nothing in the page can keep one from it.
 */
export function listenForLongPress<T>(root: Document, options: LongPressOptions<T>): LongPress {
  let press: Press | null = null;
  /** The last press was a long press, so the click it ends with is used up. */
  let pressed = false;
  let mousePress = true;

  function cancel(): void {
    if (press) {
      clearTimeout(press.timer);
      press = null;
    }
  }

  function onPointerDown(event: PointerEvent): void {
    // A press that ended without a click, as when the finger moved after a long press, leaves nothing to use up.
    pressed = false;
    mousePress = event.pointerType === "mouse";
    cancel();
    // A second finger, which the browser never makes the primary pointer, starts a pinch, so it starts no press either,
    // whether or not the first finger started one.
    if (!event.isPrimary || mousePress || event.button !== 0 || !(event.target instanceof Element)) {
      return;
    }
    const at = options.pressAt(event.target);
    if (at === null) {
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    const started: Press = {
      pointerId: event.pointerId,
      ...point,
      timer: setTimeout(() => {
        if (press !== started) {
          return;
        }
        press = null;
        pressed = true;
        options.onLongPress(at, point);
      }, LONG_PRESS_MS)
    };
    press = started;
  }

  function onPointerMove(event: PointerEvent): void {
    if (press?.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= LONG_PRESS_MOVE_PX) {
      cancel();
    }
  }

  function onPointerEnd(event: PointerEvent): void {
    if (press?.pointerId === event.pointerId) {
      cancel();
    }
  }

  root.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("pointermove", onPointerMove, true);
  root.addEventListener("pointerup", onPointerEnd, true);
  root.addEventListener("pointercancel", onPointerEnd, true);

  return {
    byMouse: () => mousePress,
    takeClick() {
      const used = pressed;
      pressed = false;
      return used;
    },
    dispose() {
      cancel();
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("pointermove", onPointerMove, true);
      root.removeEventListener("pointerup", onPointerEnd, true);
      root.removeEventListener("pointercancel", onPointerEnd, true);
    }
  };
}
