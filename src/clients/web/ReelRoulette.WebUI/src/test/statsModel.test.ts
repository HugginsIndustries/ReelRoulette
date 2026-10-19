import { describe, expect, it } from "vitest";
import { parseLibraryItem, type LibraryProjectionItem } from "../library/libraryProjectionModel";
import { adjustmentText, fileRows, libraryCards, loudnessText, orderTags, playedAgo, truePeakText, type LibraryStats } from "../stats/statsModel";

const NOW = Date.parse("2026-10-13T20:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function item(fields: Record<string, unknown>): LibraryProjectionItem {
  return parseLibraryItem({ id: "item-1", sourceId: "s1", fileName: "clip.mp4", mediaType: 0, ...fields })!;
}

const rowsOf = (from: LibraryProjectionItem) => Object.fromEntries(fileRows(from, from.lastPlayedUtcMs, NOW, "Off").map((row) => [row.label, row.value]));

describe("stats model", () => {
  it.each([
    [null, "Never"],
    [NOW - 20_000, "Just now"],
    [NOW - MINUTE, "1 min ago"],
    [NOW - 59 * MINUTE, "59 min ago"],
    [NOW - HOUR, "1 hour ago"],
    [NOW - 23 * HOUR, "23 hours ago"],
    [NOW - DAY, "1 day ago"],
    [NOW - 300 * DAY, "300 days ago"]
  ])("says a last play at %s as %s", (at, text) => {
    expect(playedAgo(at, NOW)).toBe(text);
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

  it("lists a video's plays, last played, flags, duration, and audio", () => {
    const video = item({ playCount: 3, isFavorite: true, durationSeconds: 3725, hasAudio: true, integratedLoudness: -20, peakDb: -0.5 });

    expect(fileRows(video, NOW - 2 * DAY, NOW, "+2.0 dB")).toEqual([
      { label: "Plays", value: "3" },
      { label: "Last played", value: "2 days ago" },
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
    expect(Object.keys(rowsOf(item({ mediaType: 1 })))).toEqual(["Plays", "Last played", "Favorite", "Blacklisted"]);
    expect(rowsOf(item({})).Duration).toBe("Unknown");
    expect(rowsOf(item({}))["Has audio"]).toBe("Unknown");
  });

  it("gives the library's cards in the mockup's order", () => {
    const stats = {
      global: {
        totalVideos: 1200,
        totalPhotos: 30,
        totalMedia: 1230,
        favorites: 4,
        blacklisted: 2,
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
