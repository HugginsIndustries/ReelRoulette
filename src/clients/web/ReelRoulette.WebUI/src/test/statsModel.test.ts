import { describe, expect, it } from "vitest";
import { parseLibraryItem, type LibraryProjectionItem } from "../library/libraryProjectionModel";
import { adjustmentText, fileRows, libraryCards, loudnessText, orderTags, timeAgo, truePeakText, type LibraryStats } from "../stats/statsModel";

const NOW = Date.parse("2026-10-13T20:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function item(fields: Record<string, unknown>): LibraryProjectionItem {
  return parseLibraryItem({ id: "item-1", sourceId: "s1", fileName: "clip.mp4", mediaType: 0, ...fields })!;
}

const rowsOf = (from: LibraryProjectionItem, exactTimes = false) =>
  Object.fromEntries(fileRows(from, from.lastPlayedUtcMs, NOW, "Off", exactTimes).map((row) => [row.label, row.value]));

/** Noon on 22 October 2026 on this device, which the calendar wording counts from. */
const LOCAL_NOW = new Date(2026, 9, 22, 12, 0, 0).getTime();

describe("stats model", () => {
  it.each([
    ["30 seconds before", "Just now", LOCAL_NOW - 30_000],
    ["a time after now", "Just now", LOCAL_NOW + 5 * MINUTE],
    ["a minute before", "1 minute ago", LOCAL_NOW - MINUTE],
    ["2 minutes before", "2 minutes ago", LOCAL_NOW - 2 * MINUTE],
    ["59 minutes before", "59 minutes ago", LOCAL_NOW - 59 * MINUTE],
    ["an hour before", "1 hour ago", LOCAL_NOW - HOUR],
    ["a second short of a day before", "23 hours ago", LOCAL_NOW - DAY + 1_000],
    ["a day before", "1 day ago", LOCAL_NOW - DAY],
    ["23 September at midnight, a day short of a month", "29 days ago", new Date(2026, 8, 23, 0, 0, 0).getTime()],
    ["22 September at 13:00, on the month's own day", "1 month ago", new Date(2026, 8, 22, 13, 0, 0).getTime()],
    ["3 months before", "3 months ago", new Date(2026, 6, 10, 9, 0, 0).getTime()],
    ["23 October last year, a day short of a year", "11 months ago", new Date(2025, 9, 23, 12, 0, 0).getTime()],
    ["22 October last year", "1 year ago", new Date(2025, 9, 22, 12, 0, 0).getTime()],
    ["5 years before", "5 years ago", new Date(2021, 2, 1, 8, 0, 0).getTime()]
  ])("says %s as %s", (_, text, at) => {
    expect(timeAgo(at, LOCAL_NOW)).toBe(text);
  });

  it.each([
    ["a measured video", { hasAudio: true, integratedLoudness: -23.44, peakDb: -1.25 }, "-23.4 LUFS", "-1.3 dBTP"],
    ["a track without a peak yet", { hasAudio: true, integratedLoudness: -30 }, "-30.0 LUFS", "Not measured"],
    ["a track with audio and no loudness", { hasAudio: true }, "Unknown", "Not measured"],
    ["a video without audio", { hasAudio: false }, "N/A", "N/A"],
    ["a video not scanned yet", {}, "Unknown", "Not measured"]
  ])("shows %s's loudness and true peak", (_, fields, loudness, peak) => {
    const scanned = item(fields);
    expect([loudnessText(scanned), truePeakText(scanned)]).toEqual([loudness, peak]);
  });

  it.each([
    ["a cut", { kind: "applied", db: -4.5, limitedByPeak: false }, true, "-4.5 dB"],
    ["a boost", { kind: "applied", db: 6, limitedByPeak: false }, true, "+6.0 dB"],
    ["a boost the headroom held back", { kind: "applied", db: 3.24, limitedByPeak: true }, true, "+3.2 dB (limited by peak)"],
    ["no boost, as the peak leaves no headroom", { kind: "applied", db: 0, limitedByPeak: true }, true, "+0.0 dB (limited by peak)"],
    ["normalization off", { kind: "off" }, true, "Off"],
    ["Enhanced audio off", { kind: "applied", db: -4.5, limitedByPeak: false }, false, "Off"],
    ["a file without loudness data", { kind: "none" }, true, "N/A"],
    ["a file without loudness data, with Enhanced audio off", { kind: "none" }, false, "N/A"]
  ] as const)("shows the adjustment for %s", (_, adjustment, enhanced, text) => {
    expect(adjustmentText(adjustment, enhanced)).toBe(text);
  });

  it("lists a video's plays, last played, added, created, flags, duration, and audio", () => {
    const video = item({
      playCount: 3,
      isFavorite: true,
      durationSeconds: 3725,
      hasAudio: true,
      integratedLoudness: -20,
      peakDb: -0.5,
      dateAddedUtc: new Date(NOW - 5 * DAY).toISOString(),
      dateCreatedUtc: new Date(NOW - 3 * HOUR).toISOString()
    });

    expect(fileRows(video, NOW - 2 * DAY, NOW, "+2.0 dB", false)).toEqual([
      { label: "Plays", value: "3" },
      { label: "Last played", value: "2 days ago" },
      { label: "Added", value: "5 days ago" },
      { label: "Created", value: "3 hours ago" },
      { label: "Favorite", value: "Yes" },
      { label: "Blacklisted", value: "No" },
      { label: "Duration", value: "1:02:05" },
      { label: "Has audio", value: "Yes" },
      { label: "Loudness", value: "-20.0 LUFS" },
      { label: "Adjustment", value: "+2.0 dB" },
      { label: "True peak", value: "-0.5 dBTP" }
    ]);
  });

  it("leaves a photo's duration and audio out, and says Unknown for a video without a duration", () => {
    expect(Object.keys(rowsOf(item({ mediaType: 1 })))).toEqual(["Plays", "Last played", "Added", "Created", "Favorite", "Blacklisted"]);
    expect(rowsOf(item({})).Duration).toBe("Unknown");
    expect(rowsOf(item({}))["Has audio"]).toBe("Unknown");
  });

  it("shows a photo's added and created, and says Never and Unknown for a file without the times", () => {
    const photo = item({ mediaType: 1, dateAddedUtc: new Date(NOW - 40 * MINUTE).toISOString(), dateCreatedUtc: new Date(NOW - DAY).toISOString() });
    expect([rowsOf(photo).Added, rowsOf(photo).Created]).toEqual(["40 minutes ago", "1 day ago"]);

    const unknown = rowsOf(item({}));
    expect([unknown["Last played"], unknown.Added, unknown.Created]).toEqual(["Never", "Unknown", "Unknown"]);
    const unknownExact = rowsOf(item({}), true);
    expect([unknownExact["Last played"], unknownExact.Added, unknownExact.Created]).toEqual(["Never", "Unknown", "Unknown"]);
  });

  it("shows all three times exactly with exact times on", () => {
    const [played, added, created] = [new Date(2026, 9, 12, 7, 8, 9), new Date(2024, 0, 2, 23, 59, 58), new Date(2019, 5, 30, 0, 0, 1)];
    const video = item({ lastPlayedUtc: played.toISOString(), dateAddedUtc: added.toISOString(), dateCreatedUtc: created.toISOString() });

    const exact = rowsOf(video, true);
    expect([exact["Last played"], exact.Added, exact.Created]).toEqual(["2026-10-12 07:08:09", "2024-01-02 23:59:58", "2019-06-30 00:00:01"]);
  });

  it("gives the library's cards in the mockup's order", () => {
    const stats = {
      global: {
        totalVideos: 1200,
        totalPhotos: 30,
        totalMedia: 1230,
        favorites: 4,
        blacklisted: 2,
        rated: 12,
        totalPlays: 15000,
        uniquePlayedMedia: 900,
        neverPlayedMedia: 330,
        videosWithAudio: 1100,
        videosWithoutAudio: 90,
        baselineLoudnessLufs: -20.44
      },
      sources: []
    } as unknown as LibraryStats;

    expect(libraryCards(stats)).toEqual([
      { label: "Videos", value: (1200).toLocaleString() },
      { label: "Photos", value: "30" },
      { label: "Total media", value: (1230).toLocaleString() },
      { label: "Favorites", value: "4" },
      { label: "Blacklisted", value: "2" },
      { label: "Rated", value: "12" },
      { label: "Total plays", value: (15000).toLocaleString() },
      { label: "Unique played", value: "900" },
      { label: "Never played", value: "330" },
      { label: "Videos with audio", value: (1100).toLocaleString() },
      { label: "Videos without audio", value: "90" },
      { label: "Baseline loudness", value: "-20.4 LUFS" }
    ]);
  });

  it("orders tags by their categories' saved order, then by name, with tags without a category last", () => {
    const catalog = {
      categories: [
        { id: "people", name: "People", sortOrder: 2 },
        { id: "places", name: "Places", sortOrder: 0 },
        { id: "mood", name: "Mood", sortOrder: 1 }
      ],
      tags: [
        { name: "Bob", categoryId: "people" },
        { name: "alice", categoryId: "people" },
        { name: "Beach", categoryId: "places" },
        { name: "Calm", categoryId: "mood" },
        { name: "Loose", categoryId: "" }
      ]
    };

    expect(orderTags(["Loose", "Bob", "calm", "Gone", "alice", "Beach"], catalog)).toEqual(["Beach", "calm", "alice", "Bob", "Gone", "Loose"]);
    expect(orderTags(["Loose", "Bob", "alice"], null)).toEqual(["alice", "Bob", "Loose"]);
  });
});
