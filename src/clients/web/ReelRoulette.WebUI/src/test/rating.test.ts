import { describe, expect, it } from "vitest";
import { RATING_CLEAR_EDGE_PX, ratingAt, ratingText, starFill, stepRating } from "../rating/rating";

describe("rating", () => {
  it("reads as its value text says it: in stars, 1 star in the singular, or Not rated", () => {
    expect([0.5, 1, 1.5, 3, 5, null].map(ratingText)).toEqual(["0.5 stars", "1 star", "1.5 stars", "3 stars", "5 stars", "Not rated"]);
  });

  it("is none on the first star's left edge, and half a star less on a star's left half than on its right half", () => {
    const width = 36;
    expect(ratingAt(0, width)).toBeNull();
    expect(ratingAt(RATING_CLEAR_EDGE_PX - 1, width)).toBeNull();
    expect(ratingAt(RATING_CLEAR_EDGE_PX, width)).toBe(0.5);
    expect(ratingAt(17, width)).toBe(0.5);
    expect(ratingAt(18, width)).toBe(1);
    expect(ratingAt(35, width)).toBe(1);
    expect(ratingAt(36, width)).toBe(1.5);
    expect(ratingAt(4 * width + 17, width)).toBe(4.5);
    expect(ratingAt(5 * width - 1, width)).toBe(5);
  });

  it("is none past the stars' left end and 5 stars past their right end, which only a press that started on them reaches", () => {
    expect(ratingAt(-40, 36)).toBeNull();
    expect(ratingAt(5 * 36, 36)).toBe(5);
    expect(ratingAt(900, 36)).toBe(5);
  });

  it("takes a star's width as 36 px when the browser hasn't laid the stars out", () => {
    expect(ratingAt(40, 0)).toBe(1.5);
  });

  it("steps half a star down or up within none and 5 stars", () => {
    expect([stepRating(2, -1), stepRating(2, 1), stepRating(null, 1), stepRating(0.5, -1), stepRating(null, -1), stepRating(5, 1)]).toEqual([1.5, 2.5, 0.5, null, null, 5]);
  });

  it("fills each star full, half, or not at all", () => {
    expect([0, 1, 2, 3, 4].map((index) => starFill(2.5, index))).toEqual(["full", "full", "half", "empty", "empty"]);
    expect([0, 4].map((index) => starFill(null, index))).toEqual(["empty", "empty"]);
    expect(starFill(5, 4)).toBe("full");
  });
});
