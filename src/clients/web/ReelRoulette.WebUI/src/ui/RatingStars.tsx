import { useRef, useState } from "preact/hooks";
import { RATING_MAX, ratingAt, starFill } from "../rating/rating";

interface RatingStarsProps {
  /** The rating set, or null for none, which shows again once a press or a preview ends. */
  rating: number | null;
  /** A press's release sets a rating, or clears it with null. */
  onSet(rating: number | null): void;
}

/**
 * Five stars that show a rating with half stars and set it. A press, by any pointer, shows the value under it as it
 * moves and sets it on release, and a mouse over the stars previews the value under it; neither changes the rating set.
 */
export function RatingStars({ rating, onSet }: RatingStarsProps) {
  /** A press's value, or a mouse's preview, shown in place of the rating set; undefined while there is none. */
  const [preview, setPreview] = useState<number | null | undefined>(undefined);
  const pressId = useRef<number | null>(null);
  const firstStar = useRef<HTMLSpanElement>(null);

  function valueAt(clientX: number): number | null {
    const box = firstStar.current!.getBoundingClientRect();
    return ratingAt(clientX - box.left, box.width);
  }

  /** Ends the press by this pointer, saying whether there was one. */
  function endPress(event: PointerEvent): boolean {
    if (pressId.current !== event.pointerId) {
      return false;
    }
    pressId.current = null;
    setPreview(undefined);
    return true;
  }

  const shown = preview === undefined ? rating : preview;
  return (
    <div
      class="rating"
      // A browser moves focus on `mousedown`, which a tap sends too, so a press doesn't take focus off another control,
      // and the shortcuts' keys stay with the page after a click or a tap.
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pressId.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setPreview(valueAt(event.clientX));
      }}
      onPointerMove={(event) => {
        if (pressId.current === event.pointerId || (pressId.current === null && event.pointerType === "mouse")) {
          setPreview(valueAt(event.clientX));
        }
      }}
      onPointerUp={(event) => {
        if (endPress(event)) onSet(valueAt(event.clientX));
      }}
      // A press the browser cuts short sets nothing.
      onPointerCancel={endPress}
      onLostPointerCapture={endPress}
      // A tap sends pointer leave too, so only a mouse's preview ends there.
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && pressId.current === null) setPreview(undefined);
      }}
    >
      {Array.from({ length: RATING_MAX }, (_, index) => {
        const fill = starFill(shown, index);
        return (
          <span key={index} ref={index === 0 ? firstStar : undefined} class={fill === "empty" ? "rating-star" : `rating-star is-${fill}`}>
            <span class="material-symbol-icon rating-outline">star</span>
            <span class="material-symbol-icon is-filled rating-fill">star</span>
          </span>
        );
      })}
    </div>
  );
}
