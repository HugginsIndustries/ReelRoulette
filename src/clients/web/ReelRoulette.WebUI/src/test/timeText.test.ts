import { describe, expect, it } from "vitest";
import { exactTimeText, localDay, localDayText, splitDuration, twoDigits } from "../time/timeText";

describe("time text", () => {
  it("writes a number as at least two digits", () => {
    expect([twoDigits(0), twoDigits(5), twoDigits(59), twoDigits(100)]).toEqual(["00", "05", "59", "100"]);
  });

  it("splits whole seconds into hours, then the minutes and seconds under 60", () => {
    expect(splitDuration(59.9)).toEqual({ hours: 0, minutes: 0, seconds: 59 });
    expect(splitDuration(3661)).toEqual({ hours: 1, minutes: 1, seconds: 1 });
    expect(splitDuration(360_000)).toEqual({ hours: 100, minutes: 0, seconds: 0 });
  });

  it("writes and reads a day in this device's time, never in UTC", () => {
    expect(localDayText(new Date(2026, 0, 3, 23, 59, 59))).toBe("2026-01-03");
    expect(localDayText(new Date(2026, 0, 3, 0, 0, 0))).toBe("2026-01-03");
    expect(localDay("2026-01-03").getTime()).toBe(new Date(2026, 0, 3).getTime());
  });

  it("writes an exact time as YYYY-MM-DD HH:MM:SS in 24-hour time on this device", () => {
    expect(exactTimeText(new Date(2026, 2, 4, 21, 5, 9).getTime())).toBe("2026-03-04 21:05:09");
    expect(exactTimeText(new Date(2025, 11, 31, 0, 0, 0).getTime())).toBe("2025-12-31 00:00:00");
  });
});
