import type { ReadonlySignal } from "@preact/signals";
import type { RefObject } from "preact";
import { useLayoutEffect } from "preact/hooks";

/** Half the slider's thumb box when its style doesn't say, as on a screen with a mouse. */
const DEFAULT_THUMB_HALF = 8;

/** Where a slider sits across the page, and half its thumb's box, whose center runs from that far in from each end. */
export interface SliderSpan {
  left: number;
  width: number;
  thumbHalf: number;
}

/** Where a point across a slider falls, from 0 at the thumb's center at its start to 1 at its end. */
export function sliderFraction(span: SliderSpan, clientX: number): number {
  const length = span.width - 2 * span.thumbHalf;
  return length > 0 ? Math.max(0, Math.min(1, (clientX - span.left - span.thumbHalf) / length)) : 0;
}

/** The slider's value at a point across it, between its `min` and `max`. */
export function sliderValueAt(span: SliderSpan, min: number, max: number, clientX: number): number {
  return min + sliderFraction(span, clientX) * (max - min);
}

function spanOf(slider: HTMLInputElement): SliderSpan {
  const box = slider.getBoundingClientRect();
  const thumbHalf = parseFloat(getComputedStyle(slider).getPropertyValue("--thumb-half")) || DEFAULT_THUMB_HALF;
  return { left: box.left, width: box.width, thumbHalf };
}

/** The slider's value at `clientX`, where its thumb's center would be, as the page lays the slider out now. */
export function sliderValueAtPoint(slider: HTMLInputElement, clientX: number): number {
  return sliderValueAt(spanOf(slider), Number(slider.min), Number(slider.max), clientX);
}

export interface SliderLabelOptions {
  /** The label's text for a value. */
  text(value: number): string;
  /** The track fills light gray from the value up to a mouse or pen ahead of it. */
  previews?: boolean;
  /** Hides the label as it changes, as the scrub bar's does as each new item starts, until the pointer moves again. */
  hidesOn?: ReadonlySignal<unknown>;
}

/**
 * The label above one of the player's sliders, inside the slider's wrapper with it: the value under a mouse or pen while
 * it is over the slider or drags it, and under a finger while it is on the slider, set higher so the finger doesn't cover
 * it. A finger also gives the slider its pressed look until it lifts. A disabled slider shows no label, so one that
 * becomes disabled under the pointer hides it, and a new length shows the value under the same point anew. The scrub
 * bar's light gray fill follows a mouse or pen only. A browser may take over a finger's drag on the slider and cancel its
 * pointer events, so a finger is followed with touch events.
 */
export function useSliderLabel(sliderRef: RefObject<HTMLInputElement | null>, labelRef: RefObject<HTMLElement | null>, options: SliderLabelOptions): void {
  useLayoutEffect(() => {
    const slider = sliderRef.current!;
    const label = labelRef.current!;
    const wrap = slider.parentElement!;
    /** A mouse or pen is over the slider. */
    let over = false;
    /** A mouse or pen drags the slider, so the label follows it off the slider until it's let go. */
    let dragging = false;
    let touching = false;
    /** Where the label last showed the value, and whether for a finger. */
    let shownAt = { clientX: 0, byTouch: false };

    function show(clientX: number, byTouch: boolean): void {
      if (slider.disabled) {
        hide();
        return;
      }
      shownAt = { clientX, byTouch };
      const span = spanOf(slider);
      label.textContent = options.text(sliderValueAt(span, Number(slider.min), Number(slider.max), clientX));
      label.hidden = false;
      label.classList.toggle("is-touch", byTouch);
      // The label stays within the slider's width.
      const box = wrap.getBoundingClientRect();
      const half = label.offsetWidth / 2;
      label.style.left = `${Math.max(half, Math.min(box.width - half, clientX - box.left))}px`;
      if (options.previews && !byTouch) wrap.style.setProperty("--preview", String(sliderFraction(span, clientX)));
    }

    function hide(): void {
      label.hidden = true;
      wrap.style.removeProperty("--preview");
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      over = true;
      show(event.clientX, false);
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      over = false;
      if (!dragging) hide();
    };
    const onDown = (event: PointerEvent) => {
      dragging = event.pointerType !== "touch";
    };
    const onDragMove = (event: PointerEvent) => {
      if (dragging) show(event.clientX, false);
    };
    const onRelease = () => {
      if (!dragging) return;
      dragging = false;
      if (!over) hide();
    };
    const onTouchStart = (event: TouchEvent) => {
      if (slider.disabled || !event.touches[0]) return;
      touching = true;
      wrap.classList.add("is-touched");
      show(event.touches[0].clientX, true);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touching && event.touches[0]) show(event.touches[0].clientX, true);
    };
    const onLift = () => {
      if (!touching) return;
      touching = false;
      wrap.classList.remove("is-touched");
      hide();
    };

    // The slider becoming disabled, or taking a new length, changes what the label under the pointer shows.
    const sliderChanges = new MutationObserver(() => {
      if (!label.hidden) show(shownAt.clientX, shownAt.byTouch);
    });
    sliderChanges.observe(slider, { attributes: true, attributeFilter: ["disabled", "max"] });
    const stopHiding = options.hidesOn?.subscribe(() => hide());
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    slider.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onRelease);
    document.addEventListener("pointercancel", onRelease);
    wrap.addEventListener("touchstart", onTouchStart, { passive: true });
    wrap.addEventListener("touchmove", onTouchMove, { passive: true });
    wrap.addEventListener("touchend", onLift);
    wrap.addEventListener("touchcancel", onLift);
    return () => {
      sliderChanges.disconnect();
      stopHiding?.();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      slider.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onDragMove);
      document.removeEventListener("pointerup", onRelease);
      document.removeEventListener("pointercancel", onRelease);
      wrap.removeEventListener("touchstart", onTouchStart);
      wrap.removeEventListener("touchmove", onTouchMove);
      wrap.removeEventListener("touchend", onLift);
      wrap.removeEventListener("touchcancel", onLift);
    };
  }, []);
}
