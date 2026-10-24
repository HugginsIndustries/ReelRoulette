/** A wheel event's vertical movement and its unit. */
export interface WheelDelta {
  deltaY: number;
  deltaMode: number;
}

/** A mouse wheel's notch is a line- or page-unit event, or a pixel delta at least this large. */
const WHEEL_NOTCH_MIN_PX = 50;

/** A mouse wheel sends whole notches: line or page units, or a large pixel delta. A trackpad sends small pixel deltas. */
export function isWheelNotch(delta: WheelDelta): boolean {
  return delta.deltaMode !== 0 || Math.abs(delta.deltaY) >= WHEEL_NOTCH_MIN_PX;
}

/**
 * Keeps Ctrl+scroll, which a laptop trackpad pinch also sends, from zooming the page anywhere in the app, so it can
 * zoom the library grid's rows instead. Ctrl with + and - still zoom the page. Passive unless set otherwise, a wheel
 * listener on the window couldn't cancel. Returns what stops it.
 */
export function blockWheelPageZoom(page: Window): () => void {
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };
  page.addEventListener("wheel", onWheel, { passive: false });
  return () => page.removeEventListener("wheel", onWheel);
}
