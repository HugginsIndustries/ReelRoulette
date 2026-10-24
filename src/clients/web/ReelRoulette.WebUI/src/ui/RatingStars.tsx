import { useRef, useState } from "preact/hooks";
import { RATING_MAX, ratingAt, ratingText, starFill } from "../rating/rating";

interface RatingStarsBaseProps {
  /** The rating set, or null for none, which the slider's value gives through a preview too. */
  rating: number | null;
  /** A press's release sets a rating, or clears it with null. */
  onSet(rating: number | null): void;
  /** What screen readers hear for no rating. "Not rated" when not given. */
  noneText?: string;
  /** Set while a field checked with the control is flagged, as the validation pattern marks a partner. */
  "aria-invalid"?: "true";
  "aria-describedby"?: string;
}

/** The control is named by an element on screen, or by its own name where none shows. */
type RatingStarsProps = RatingStarsBaseProps &
  (
    | {
        /** The element that names the control. */
        labelledBy: string;
        label?: never;
      }
    | {
        /** The control's name. */
        label: string;
        labelledBy?: never;
      }
  );

/**
 * Five stars that show a rating with half stars and set it, a slider from 0 to 5 to screen readers. A press, by any
 * pointer, shows the value under it as it moves and sets it on release, and a mouse over the stars previews the value
 * under it; neither changes the slider's value.
 */
export function RatingStars({
  rating,
  labelledBy,
  label,
  onSet,
  noneText,
  "aria-invalid": invalid,
  "aria-describedby": describedBy
}: RatingStarsProps) {
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
      role="slider"
      aria-labelledby={labelledBy}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={RATING_MAX}
      aria-valuenow={rating ?? 0}
      aria-valuetext={rating === null && noneText !== undefined ? noneText : ratingText(rating)}
      aria-invalid={invalid}
      aria-describedby={describedBy}
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
            <span class="material-symbol-icon rating-outline" aria-hidden="true">star</span>
            <span class="material-symbol-icon is-filled rating-fill" aria-hidden="true">star</span>
          </span>
        );
      })}
    </div>
  );
}
