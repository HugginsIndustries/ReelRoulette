import { describe, expect, it } from "vitest";
import { clockText, exactTimeText, localDay, localDayText, splitDuration, twoDigits, whenText } from "../time/timeText";

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

  it("writes a time of day as HH:MM in 24-hour time, or HH:MM:SS with seconds", () => {
    expect(clockText(new Date(2026, 2, 4, 21, 5, 9))).toBe("21:05");
    expect(clockText(new Date(2026, 2, 4, 21, 5, 9), true)).toBe("21:05:09");
    expect(clockText(new Date(2026, 2, 4, 0, 0, 0), true)).toBe("00:00:00");
  });

  it("writes a time from today as its time of day, and one from another day with MM-DD before it, today ending at midnight", () => {
    const now = new Date(2026, 2, 4, 9, 30, 0).getTime();
    const sameDay = (hours: number, minutes: number, seconds: number) => new Date(2026, 2, 4, hours, minutes, seconds).getTime();
    expect(whenText(sameDay(0, 0, 0), now)).toBe("00:00");
    expect(whenText(sameDay(23, 59, 59), now, true)).toBe("23:59:59");
    expect(whenText(new Date(2026, 2, 3, 23, 59, 59).getTime(), now)).toBe("03-03 23:59");
    expect(whenText(new Date(2026, 2, 3, 23, 59, 59).getTime(), now, true)).toBe("03-03 23:59:59");
    expect(whenText(new Date(2025, 11, 31, 18, 4, 7).getTime(), new Date(2026, 0, 1, 0, 0, 0).getTime(), true)).toBe("12-31 18:04:07");
    expect(whenText(sameDay(14, 32, 5), new Date(2026, 2, 5, 0, 0, 0).getTime())).toBe("03-04 14:32");
  });

  it("writes an exact time as YYYY-MM-DD HH:MM:SS in 24-hour time on this device", () => {
    expect(exactTimeText(new Date(2026, 2, 4, 21, 5, 9).getTime())).toBe("2026-03-04 21:05:09");
    expect(exactTimeText(new Date(2025, 11, 31, 0, 0, 0).getTime())).toBe("2025-12-31 00:00:00");
  });
});
