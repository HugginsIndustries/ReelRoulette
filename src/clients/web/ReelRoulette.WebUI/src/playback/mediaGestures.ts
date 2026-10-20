/** A horizontal move longer than this, and longer than the vertical move, is a swipe. */
const SWIPE_THRESHOLD_PX = 50;
/** A tap on a video within this long of the last one seeks, and a single tap waits this long to rule one out. */
export const DOUBLE_TAP_MS = 300;
/** A two-finger drag changes the volume a step for each this far up or down. */
const DRAG_STEP_PX = 30;
/** A mouse wheel's notch is a line- or page-unit event, or a pixel delta at least this large. */
const WHEEL_NOTCH_MIN_PX = 50;
/** A trackpad's small pixel deltas add up to a notch every this many pixels, and start over after a pause this long. */
const WHEEL_NOTCH_PX = 100;
const WHEEL_PAUSE_MS = 300;

export interface TouchPoint {
  clientX: number;
  clientY: number;
}

export interface WheelDelta {
  deltaY: number;
  deltaMode: number;
}

export interface MediaGestureActions {
  previous(): void;
  next(): void;
  /** A video shows whose length is known, so a double-tap seeks it, and a tap on it waits to rule one out. */
  seekable(): boolean;
  /** A double-tap's seek by the seek step: forward on the player's right half, back on its left. */
  seek(forward: boolean): void;
  /** Where the player's middle is across the page, which splits its halves. */
  middleX(): number;
  /** A single tap on a video, once no second tap came: does what Hide player controls says. */
  tap(): void;
  /** Shows the controls, so the volume slider is visible while the wheel or a two-finger drag changes it. */
  showControls(): void;
  /** The volume can change, which it can't where the volume slider hides. */
  volumeAdjustable(): boolean;
  /** A two-finger drag is one volume change, from its second finger to its fingers lifting. */
  beginVolumeChange(): void;
  endVolumeChange(): void;
  stepVolume(steps: number): void;
}

/**
 * Gestures on the media area. A swipe right plays the previous item and a swipe left the next one. The browser follows
 * a touch with a click, which the media area ignores after a swipe; a tap acts through its click, which Chrome sends to
 * what is under the finger once the touch has ended, so the controls a tap shows can't take it. On a video, a tap's
 * click waits 300 ms to rule out a double-tap, and a single tap acts once no second one came; a tap within 300 ms of the
 * last seeks back by the seek step on the player's left half and forward on its right, leaving the controls as they
 * were, and so does each further one, so a triple-tap seeks twice. Two fingers dragged up or down change the volume a
 * step per 30 px, and are never taken for a swipe or a tap. The scroll wheel changes the volume a step per notch, a
 * trackpad's small deltas adding up to notches, so a light swipe doesn't jump it. Each shows the controls.
 */
export interface MediaGestures {
  /** A finger lands, with every finger now on the screen. */
  touchStart(startsOnControls: boolean, touches: ArrayLike<TouchPoint>): void;
  /** Fingers move. True when the move is a two-finger drag's, which the browser mustn't take as a scroll or zoom. */
  touchMove(touches: ArrayLike<TouchPoint>): boolean;
  /** A finger lifts, or the browser cancels touches, with the number still on the screen. */
  touchEnd(touch: TouchPoint | undefined, remaining: number): void;
  /** The wheel turns over the media area, which never scrolls the page. */
  wheel(delta: WheelDelta): void;
  /**
   * A click on the media area. True when the gestures take it: the click that follows a swipe, and the one that follows
   * a tap on a video, which waits for a double-tap or seeks as one. A click no touch came before, as a mouse's, and a
   * tap's where nothing can seek, are the media area's, which acts at once.
   */
  takeClick(): boolean;
}

function middleY(touches: ArrayLike<TouchPoint>): number {
  return (touches[0]!.clientY + touches[1]!.clientY) / 2;
}

export function createMediaGestures(actions: MediaGestureActions): MediaGestures {
  let startX = 0;
  let startY = 0;
  let wasSwipe = false;
  /** Where a tap's touch ended, until its click comes. */
  let tapX: number | null = null;
  /** The 300 ms after a tap on a video, in which the next tap seeks. A single tap acts as it ends. */
  let tapWindow: ReturnType<typeof setTimeout> | null = null;
  let singleTapWaits = false;
  let ignoreTouch = false;
  /** A second finger landed, so the touch is neither a swipe nor a tap until every finger lifts. */
  let multiTouch = false;
  let drag: { y: number; rest: number } | null = null;
  let wheelRest = 0;
  let wheelPause: ReturnType<typeof setTimeout> | null = null;

  function step(steps: number): void {
    actions.showControls();
    if (steps) {
      actions.stepVolume(steps);
    }
  }

  return {
    touchStart(startsOnControls, touches) {
      tapX = null;
      if (touches.length >= 2) {
        multiTouch = true;
        // A finger that lifts and lands again mid-drag moves the fingers' middle, so the drag measures from there on,
        // still as the one change.
        if (touches.length === 2 && !ignoreTouch) {
          if (!drag) {
            actions.beginVolumeChange();
          }
          drag = { y: middleY(touches), rest: 0 };
        }
        return;
      }
      if (startsOnControls) {
        ignoreTouch = true;
        return;
      }

      ignoreTouch = false;
      const touch = touches[0];
      if (touch) {
        startX = touch.clientX;
        startY = touch.clientY;
        wasSwipe = false;
      }
    },

    touchMove(touches) {
      if (!drag || touches.length !== 2) {
        return false;
      }
      if (actions.volumeAdjustable()) {
        const y = middleY(touches);
        drag.rest += drag.y - y;
        drag.y = y;
        const steps = Math.trunc(drag.rest / DRAG_STEP_PX);
        drag.rest -= steps * DRAG_STEP_PX;
        step(steps);
      }
      return true;
    },

    touchEnd(touch, remaining) {
      if (multiTouch) {
        if (remaining === 0) {
          multiTouch = false;
          ignoreTouch = false;
          if (drag) {
            drag = null;
            actions.endVolumeChange();
          }
        }
        return;
      }
      if (ignoreTouch) {
        ignoreTouch = false;
        return;
      }
      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
        wasSwipe = true;
        if (deltaX > 0) {
          actions.previous();
        } else {
          actions.next();
        }
      } else {
        tapX = touch.clientX;
      }
    },

    wheel(delta) {
      if (!actions.volumeAdjustable()) {
        return;
      }
      if (delta.deltaMode !== 0 || Math.abs(delta.deltaY) >= WHEEL_NOTCH_MIN_PX) {
        step(-Math.sign(delta.deltaY));
        return;
      }
      wheelRest -= delta.deltaY;
      const steps = Math.trunc(wheelRest / WHEEL_NOTCH_PX);
      wheelRest -= steps * WHEEL_NOTCH_PX;
      if (wheelPause !== null) clearTimeout(wheelPause);
      wheelPause = setTimeout(() => {
        wheelPause = null;
        wheelRest = 0;
      }, WHEEL_PAUSE_MS);
      step(steps);
    },

    takeClick() {
      if (wasSwipe) {
        wasSwipe = false;
        return true;
      }
      const x = tapX;
      tapX = null;
      if (x === null || !actions.seekable()) return false;

      const seeks = tapWindow !== null;
      if (tapWindow !== null) clearTimeout(tapWindow);
      singleTapWaits = !seeks;
      if (seeks) actions.seek(x >= actions.middleX());
      tapWindow = setTimeout(() => {
        tapWindow = null;
        if (singleTapWaits) {
          singleTapWaits = false;
          actions.tap();
        }
      }, DOUBLE_TAP_MS);
      return true;
    }
  };
}
