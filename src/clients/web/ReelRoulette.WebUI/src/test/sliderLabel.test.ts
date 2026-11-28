import { describe, expect, it } from "vitest";
import { sliderFraction, sliderValueAt } from "../ui/sliderLabel";

/** A slider 216 px wide from 100 px across the page, its thumb's center running from 8 px in from each end. */
const SPAN = { left: 100, width: 216, thumbHalf: 8 };

describe("the value at a point across a slider", () => {
  it("follows the thumb's center, from 0 where it sits at the start to 1 where it sits at the end", () => {
    expect([108, 158, 208, 308].map((x) => sliderFraction(SPAN, x))).toEqual([0, 0.25, 0.5, 1]);
  });

  it("stays at the ends within half the thumb's box of them and beyond the slider", () => {
    expect([100, 104, 50, 312, 316, 400].map((x) => sliderFraction(SPAN, x))).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("follows a touch screen's larger thumb box", () => {
    const touch = { ...SPAN, thumbHalf: 14 };
    expect([114, 208, 302].map((x) => sliderFraction(touch, x))).toEqual([0, 0.5, 1]);
  });

  it("is the start on a slider no wider than its thumb's box", () => {
    expect(sliderFraction({ left: 0, width: 16, thumbHalf: 8 }, 12)).toBe(0);
    expect(sliderFraction({ left: 0, width: 0, thumbHalf: 8 }, 12)).toBe(0);
  });

  it("runs between the slider's min and max", () => {
    expect([108, 158, 308].map((x) => sliderValueAt(SPAN, 0, 125, x))).toEqual([0, 31.25, 125]);
    expect(sliderValueAt(SPAN, 20, 60, 208)).toBe(40);
  });
});
