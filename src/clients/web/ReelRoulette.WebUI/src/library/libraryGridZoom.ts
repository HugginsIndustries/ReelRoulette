import type { TouchPoint } from "../ui/touch";
import { isWheelNotch, type WheelDelta } from "../ui/wheel";
import { DEFAULT_GRID_OVERSCAN_PX } from "./libraryGridVirtualizer";

/** A wheel notch zooms the grid by this much, eased over a few frames. */
const ZOOM_NOTCH = 1.15;
/** A trackpad's small deltas zoom it by about this share per pixel, as they come. */
const ZOOM_PER_PIXEL = 0.01;
/** Each frame of a notch's ease covers this share of the scale left to go. */
const ZOOM_EASE = 0.35;
/** The ease has arrived once the scale is this close to where the notches ask for. */
const ZOOM_ARRIVED = 0.002;
/** A wheel gesture settles this long after the wheel stops. */
export const ZOOM_SETTLE_MS = 200;
/** When a gesture settles, each tile in view moves from where it showed to its new place over this long. */
export const TILE_MOVE_MS = 220;
export const TILE_MOVE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** How the rows' layer shows during a gesture: scaled from its top-left corner, then moved. */
export interface ZoomView {
  x: number;
  y: number;
  scale: number;
}

export interface ZoomPoint {
  x: number;
  y: number;
}

/** A Ctrl+wheel event over the grid. */
export interface ZoomWheel extends WheelDelta {
  clientX: number;
  clientY: number;
}

/** What a gesture starts from. */
export interface GridZoomStart {
  /** Where the rows' layer's top-left corner is on the screen, which the view is relative to. */
  left: number;
  top: number;
  /** The scales the gesture can reach, which keep the row height the rows aim for within the zoom's range. */
  minScale: number;
  maxScale: number;
}

export interface GridZoomHost {
  /** A gesture starts. Null where the grid shows no rows, which leaves the gesture nothing to zoom. */
  begin(): GridZoomStart | null;
  /** The rows' layer shows at `view`. */
  show(view: ZoomView): void;
  /** The gesture settled at `view`, with the pointer or the pinch's center at `focus` on the screen. */
  settle(view: ZoomView, focus: ZoomPoint): void;
}

/**
 * Ctrl+scroll over the grid, which a laptop trackpad pinch also sends, and a two-finger pinch zoom it. While the gesture
 * lasts, the rows' layer scales as one picture around the pointer or the pinch's center, and the pinch's center moving
 * pans it. A wheel notch zooms a step, eased over a few frames; a trackpad's small deltas scale it as they come. The
 * gesture settles 200 ms after the wheel stops, or as a finger lifts.
 */
export interface GridZoom {
  wheel(event: ZoomWheel): void;
  /** A finger lands, with every finger now on the screen. Two start a pinch. */
  touchStart(touches: ArrayLike<TouchPoint>): void;
  /** Fingers move. True when the move is a pinch's, which the browser mustn't take as a scroll or zoom. */
  touchMove(touches: ArrayLike<TouchPoint>): boolean;
  /** A finger lifts, or the browser cancels touches, with the number still on the screen. */
  touchEnd(remaining: number): void;
  isActive(): boolean;
  /** Drops the gesture under way without settling it. */
  cancel(): void;
}

/**
 * The rows to render around the view when a gesture starts, so the view stays filled at the smallest scale the gesture
 * can reach, wherever in the view it scales around.
 */
export function zoomOverscanPx(viewportHeight: number, minScale: number): number {
  return Math.max(DEFAULT_GRID_OVERSCAN_PX, (1 / minScale - 1) * viewportHeight);
}

interface Gesture {
  start: GridZoomStart;
  view: ZoomView;
  /** Where the wheel's notches ask the scale to go. */
  goal: number;
  focus: ZoomPoint;
  /** The scale eases toward the goal, as for a wheel notch, rather than taking it at once. */
  eased: boolean;
  frame: number | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  /** The wheel stopped, so the gesture settles once the ease arrives. */
  wheelIdle: boolean;
}

interface Pinch {
  spread: number;
  x: number;
  y: number;
}

function pinchOf(touches: ArrayLike<TouchPoint>): Pinch {
  const a = touches[0]!;
  const b = touches[1]!;
  return {
    spread: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2
  };
}

export function createGridZoom(host: GridZoomHost): GridZoom {
  let gesture: Gesture | null = null;
  let pinch: Pinch | null = null;

  function begin(): Gesture | null {
    if (gesture) {
      return gesture;
    }
    const start = host.begin();
    if (!start) {
      return null;
    }
    gesture = {
      start,
      view: { x: 0, y: 0, scale: 1 },
      goal: 1,
      focus: { x: 0, y: 0 },
      eased: false,
      frame: null,
      settleTimer: null,
      wheelIdle: false
    };
    return gesture;
  }

  function clampScale(g: Gesture, scale: number): number {
    return Math.min(g.start.maxScale, Math.max(g.start.minScale, scale));
  }

  // Scales the layer to `scale` around a point on the screen, which stays where it is.
  function scaleAround(g: Gesture, scale: number, clientX: number, clientY: number): void {
    const k = scale / g.view.scale;
    const px = clientX - g.start.left;
    const py = clientY - g.start.top;
    g.view.x = px + k * (g.view.x - px);
    g.view.y = py + k * (g.view.y - py);
    g.view.scale = scale;
  }

  function step(): void {
    const g = gesture;
    if (!g) {
      return;
    }
    g.frame = null;
    const next = g.eased ? g.view.scale + (g.goal - g.view.scale) * ZOOM_EASE : g.goal;
    const arrived = Math.abs(g.goal - next) < ZOOM_ARRIVED;
    scaleAround(g, arrived ? g.goal : next, g.focus.x, g.focus.y);
    host.show({ ...g.view });
    if (!arrived) {
      g.frame = requestAnimationFrame(step);
    } else if (g.wheelIdle) {
      settle();
    }
  }

  function stop(g: Gesture): void {
    if (g.frame !== null) {
      cancelAnimationFrame(g.frame);
    }
    if (g.settleTimer !== null) {
      clearTimeout(g.settleTimer);
    }
    gesture = null;
    pinch = null;
  }

  function settle(): void {
    const g = gesture;
    if (!g) {
      return;
    }
    stop(g);
    host.settle({ ...g.view }, { ...g.focus });
  }

  return {
    wheel(event) {
      const g = begin();
      if (!g) {
        return;
      }
      g.focus = { x: event.clientX, y: event.clientY };
      g.eased = isWheelNotch(event);
      const factor = g.eased ? ZOOM_NOTCH ** -Math.sign(event.deltaY) : Math.exp(-event.deltaY * ZOOM_PER_PIXEL);
      g.goal = clampScale(g, g.goal * factor);
      g.wheelIdle = false;
      if (g.frame === null) {
        g.frame = requestAnimationFrame(step);
      }
      if (g.settleTimer !== null) {
        clearTimeout(g.settleTimer);
      }
      g.settleTimer = setTimeout(() => {
        g.settleTimer = null;
        g.wheelIdle = true;
        if (g.frame === null) {
          settle();
        }
      }, ZOOM_SETTLE_MS);
    },

    touchStart(touches) {
      if (touches.length !== 2) {
        return;
      }
      const g = begin();
      if (!g) {
        return;
      }
      pinch = pinchOf(touches);
      g.focus = { x: pinch.x, y: pinch.y };
    },

    touchMove(touches) {
      const g = gesture;
      if (!g || !pinch || touches.length !== 2) {
        return false;
      }
      const next = pinchOf(touches);
      scaleAround(g, clampScale(g, g.view.scale * (next.spread / Math.max(1, pinch.spread))), pinch.x, pinch.y);
      g.view.x += next.x - pinch.x;
      g.view.y += next.y - pinch.y;
      host.show({ ...g.view });
      g.focus = { x: next.x, y: next.y };
      pinch = next;
      return true;
    },

    touchEnd(remaining) {
      if (!pinch || remaining >= 2) {
        return;
      }
      settle();
    },

    isActive() {
      return gesture !== null;
    },

    cancel() {
      if (gesture) {
        stop(gesture);
      }
    }
  };
}
