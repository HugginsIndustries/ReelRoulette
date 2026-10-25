/** How long a finger or a pen rests on a tile before the press counts as a long press. */
export const LONG_PRESS_MS = 500;
/** How far the press may move, in pixels, before it is a scroll or a drag rather than a long press. */
export const LONG_PRESS_MOVE_PX = 8;

export interface TilePressOptions {
  /** The item id of the tile an event landed on, if any. */
  tileItemId(target: EventTarget | null): string | null;
  /** A long press on the tile of `itemId` was held long enough. */
  onLongPress(itemId: string): void;
}

export interface TilePress {
  /**
   * Whether the click that just came ends a press that was already a long press, which it then uses up, so the tile
   * isn't also played or chosen again.
   */
  takeClick(): boolean;
  dispose(): void;
}

interface Press {
  pointerId: number;
  itemId: string;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A long press on a tile in `host`, from a finger or a pen; a mouse has the check icon. It counts once it has rested
 * for `LONG_PRESS_MS` without moving `LONG_PRESS_MOVE_PX`, and a second finger, as for a pinch, a scroll the browser
 * takes over, or lifting the finger first, ends it before then. Only the first finger down starts one, so a pinch never
 * does. The browser's own menu, its callout or image menu, doesn't open on a tile pressed with a finger or a pen.
 */
export function listenForTilePress(host: HTMLElement, options: TilePressOptions): TilePress {
  let press: Press | null = null;
  /** The last press was a long press, so the click it ends with is used up. */
  let pressed = false;
  /** The last press on the grid was a finger's or a pen's. */
  let touchPress = false;

  function cancel(): void {
    if (press) {
      clearTimeout(press.timer);
      press = null;
    }
  }

  function onPointerDown(event: PointerEvent): void {
    // A press that ended without a click, as when the finger moved after a long press, leaves nothing to use up.
    pressed = false;
    touchPress = event.pointerType !== "mouse";
    cancel();
    // A second finger, which the browser never makes the primary pointer, starts a pinch, so it starts no press either,
    // whether or not the first finger started one.
    if (!event.isPrimary) {
      return;
    }
    const itemId = touchPress && event.button === 0 ? options.tileItemId(event.target) : null;
    if (!itemId) {
      return;
    }
    const started: Press = {
      pointerId: event.pointerId,
      itemId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        if (press !== started) {
          return;
        }
        press = null;
        pressed = true;
        options.onLongPress(itemId);
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

  function onContextMenu(event: Event): void {
    if (touchPress && options.tileItemId(event.target)) {
      event.preventDefault();
    }
  }

  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerEnd);
  host.addEventListener("pointercancel", onPointerEnd);
  host.addEventListener("contextmenu", onContextMenu);

  return {
    takeClick() {
      const used = pressed;
      pressed = false;
      return used;
    },
    dispose() {
      cancel();
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerEnd);
      host.removeEventListener("pointercancel", onPointerEnd);
      host.removeEventListener("contextmenu", onContextMenu);
    }
  };
}
