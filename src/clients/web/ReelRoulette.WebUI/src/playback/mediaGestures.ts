/** A horizontal move longer than this, and longer than the vertical move, is a swipe. */
const SWIPE_THRESHOLD_PX = 50;
/** A touch that moves less than this both ways is a tap. */
const TAP_THRESHOLD_PX = 10;

export interface TouchPoint {
  clientX: number;
  clientY: number;
}

export interface MediaGestureActions {
  previous(): void;
  next(): void;
  hasCurrent(): boolean;
  toggleControls(): void;
}

/**
 * Swipes and taps on the media area: a swipe right plays the previous item and a swipe left the next one, and a
 * tap shows or hides the controls once something plays. The browser follows a touch with a click, which the media
 * area ignores after a swipe or a tap it handled.
 */
export interface MediaGestures {
  touchStart(startsOnControls: boolean, touch: TouchPoint | undefined): void;
  touchEnd(touch: TouchPoint | undefined): void;
  /** True for the click that follows a swipe or a handled tap. Clears it, so the next click counts. */
  takeFollowingClick(): boolean;
}

export function createMediaGestures(actions: MediaGestureActions): MediaGestures {
  let startX = 0;
  let startY = 0;
  let wasSwipe = false;
  let handledTap = false;
  let ignoreTouch = false;

  return {
    touchStart(startsOnControls, touch) {
      if (startsOnControls) {
        ignoreTouch = true;
        return;
      }

      ignoreTouch = false;
      if (touch) {
        startX = touch.clientX;
        startY = touch.clientY;
        wasSwipe = false;
      }
    },

    touchEnd(touch) {
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
      } else if (Math.abs(deltaX) < TAP_THRESHOLD_PX && Math.abs(deltaY) < TAP_THRESHOLD_PX) {
        if (actions.hasCurrent()) {
          handledTap = true;
          actions.toggleControls();
        }
      }
    },

    takeFollowingClick() {
      if (wasSwipe) {
        wasSwipe = false;
        return true;
      }
      if (handledTap) {
        handledTap = false;
        return true;
      }
      return false;
    }
  };
}
