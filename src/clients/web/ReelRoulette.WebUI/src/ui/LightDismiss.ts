import type { ReadonlySignal } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";

export interface LightDismissOptions {
  /** The popover is open. */
  open: ReadonlySignal<boolean>;
  /** Whether a press on `target` leaves it open, as one inside it or on the button that opens it does. */
  keepsOpen(target: Node | null): boolean;
  /** A press outside it closes it, leaving focus where the press puts it. */
  onPressOutside(): void;
  /** Escape closes it. */
  onEscape(): void;
}

/**
 * Closes a popover, something a button opens over the page, such as the bell's list or the rating's stars, on a press
 * outside it, which still does what it does, and on Escape, which comes to it before anything else, except while an
 * in-app dialog is open. Both are heard from the page, in the capture phase.
 */
export function useLightDismiss(options: LightDismissOptions): void {
  const latest = useRef(options);
  latest.current = options;

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !latest.current.open.peek() || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onEscape();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!latest.current.open.peek() || latest.current.keepsOpen(event.target as Node | null)) return;
      latest.current.onPressOutside();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
}
