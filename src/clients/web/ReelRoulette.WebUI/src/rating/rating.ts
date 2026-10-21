/**
 * A rating is ½ to 5 stars in half-star steps, or none, kept in stars as the API gives it, with null for none.
 */

/** The most stars a rating has. */
export const RATING_MAX = 5;

/** The first star's left edge, in px, which clears the rating. */
export const RATING_CLEAR_EDGE_PX = 8;

/** How long the keys pause before the rating they set is sent. */
export const RATING_KEY_PAUSE_MS = 500;

/** A star's width, in px, when the browser hasn't laid the stars out. */
const STAR_WIDTH_PX = 36;

/** How a rating reads, to screen readers and in its popups: "3.5 stars", "1 star", or "Not rated". */
export function ratingText(rating: number | null): string {
  if (!rating) {
    return "Not rated";
  }
  return rating === 1 ? "1 star" : `${rating} stars`;
}

/** A rating the API takes and gives, a multiple of 0.5 from 0.5 to 5, or null for anything else. */
export function parseRating(value: unknown): number | null {
  return typeof value === "number" && value >= 0.5 && value <= RATING_MAX && Number.isInteger(value * 2) ? value : null;
}

/**
 * The rating under a pointer `x` px from the first star's left edge, with stars `starWidth` px wide: the first star's
 * left edge clears it, a star's left half is half a star less than its right half, and past the stars' ends, which
 * only a press that started on them reaches, is none or 5.
 */
export function ratingAt(x: number, starWidth: number): number | null {
  const width = starWidth > 0 ? starWidth : STAR_WIDTH_PX;
  if (x < RATING_CLEAR_EDGE_PX) {
    return null;
  }
  const index = Math.floor(x / width);
  if (index >= RATING_MAX) {
    return RATING_MAX;
  }
  return index + (x - index * width < width / 2 ? 0.5 : 1);
}

/**
 * The rating a key sets from `rating`: the left and down arrows step down half a star, the right and up arrows step up
 * half a star, Home and Delete or Backspace clear it, and End is 5 stars. Null for any other key.
 */
export function ratingForKey(rating: number | null, key: string): { rating: number | null } | null {
  const stars = rating ?? 0;
  let next: number;
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      next = stars - 0.5;
      break;
    case "ArrowRight":
    case "ArrowUp":
      next = stars + 0.5;
      break;
    case "End":
      next = RATING_MAX;
      break;
    case "Home":
    case "Delete":
    case "Backspace":
      next = 0;
      break;
    default:
      return null;
  }
  const clamped = Math.min(RATING_MAX, Math.max(0, next));
  return { rating: clamped > 0 ? clamped : null };
}

/** How the star at `index`, from 0, shows `rating`: full, half, or empty. */
export function starFill(rating: number | null, index: number): "full" | "half" | "empty" {
  const stars = rating ?? 0;
  if (stars >= index + 1) {
    return "full";
  }
  return stars >= index + 0.5 ? "half" : "empty";
}
