import { describe, expect, it } from "vitest";
import { copyDateRange, isDayText, isDayWithinLimits } from "../filter/filterDateRange";

describe("date filter days", () => {
  it.each([
    ["2026-01-03", true],
    ["2024-02-29", true],
    ["2000-02-29", true],
    ["2026-02-29", false],
    ["1900-02-29", false],
    ["2026-04-31", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["0000-01-01", false],
    ["2026-1-3", false],
    ["01/03/2026", false],
    ["", false],
    [20260103, false],
    [null, false]
  ])("reads %s as a day: %s", (text, day) => {
    expect(isDayText(text)).toBe(day);
  });

  it.each([
    ["1969-12-31", false],
    ["1970-01-01", true],
    ["2099-12-31", true],
    ["2100-01-01", false]
  ])("takes %s within the years a custom range may hold: %s", (day, within) => {
    expect(isDayWithinLimits(day)).toBe(within);
  });

  it("copies a custom range, so a filter's copy never shares it", () => {
    const range = { from: "2026-01-03", to: "2026-03-31" };
    const copy = copyDateRange(range);
    expect(copy).toEqual(range);
    expect(copy).not.toBe(range);
    expect(copyDateRange("last7Days")).toBe("last7Days");
    expect(copyDateRange(null)).toBeNull();
  });
});
