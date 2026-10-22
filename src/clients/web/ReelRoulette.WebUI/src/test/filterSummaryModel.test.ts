import { describe, expect, it } from "vitest";
import type { FilterSource } from "../filter/filterDialogModel";
import { AUDIO_FILTER, MEDIA_TYPE_FILTER, createDefaultFilterState, type FilterState } from "../filter/filterStateModel";
import { filterSummaryParts } from "../filter/filterSummaryModel";

function filter(changes: Partial<FilterState>): FilterState {
  return { ...createDefaultFilterState(), ...changes };
}

const SOURCES: FilterSource[] = [
  { id: "Source-1", displayName: "Movies", isEnabled: true },
  { id: "source-2", displayName: "Photos", isEnabled: true },
  { id: "source-3", displayName: "Archive", isEnabled: false }
];

describe("filterSummaryParts", () => {
  it("names nothing for the default filter, which leaves out blacklisted items", () => {
    expect(filterSummaryParts(createDefaultFilterState(), SOURCES)).toEqual([]);
  });

  it("names Favorites only or excluded, and Blacklisted only, but not Blacklisted excluded or either filter off", () => {
    expect(filterSummaryParts(filter({ favoritesMode: "only" }), null)).toEqual(["Favorites only"]);
    expect(filterSummaryParts(filter({ favoritesMode: "excluded" }), null)).toEqual(["Favorites excluded"]);
    expect(filterSummaryParts(filter({ blacklistedMode: "only" }), null)).toEqual(["Blacklisted only"]);
    expect(filterSummaryParts(filter({ blacklistedMode: "excluded" }), null)).toEqual([]);
    expect(filterSummaryParts(filter({ blacklistedMode: "off" }), null)).toEqual([]);
  });

  it("names each checked Basic Filters option by its label", () => {
    expect(filterSummaryParts(filter({ onlyNeverPlayed: true }), null)).toEqual(["Only never played"]);
    expect(filterSummaryParts(filter({ onlyKnownDuration: true }), null)).toEqual(["Only videos with known duration"]);
    expect(filterSummaryParts(filter({ onlyKnownLoudness: true }), null)).toEqual(["Only videos with known loudness"]);
    expect(filterSummaryParts(filter({ onlyBrowserPlayable: true }), null)).toEqual(["Only files this browser can play"]);
  });

  it("names Only unrated and the minimum rating in stars after the other Basic Filters options", () => {
    expect(filterSummaryParts(filter({ onlyUnrated: true }), null)).toEqual(["Only unrated"]);
    expect(filterSummaryParts(filter({ minRating: 3.5 }), null)).toEqual(["Min 3.5 stars"]);
    expect(filterSummaryParts(filter({ minRating: 1 }), null)).toEqual(["Min 1 star"]);
    expect(filterSummaryParts(filter({ minRating: 0.5 }), null)).toEqual(["Min 0.5 stars"]);
    expect(filterSummaryParts(filter({ onlyBrowserPlayable: true, minRating: 4, mediaTypeFilter: MEDIA_TYPE_FILTER.VideosOnly }), null)).toEqual([
      "Only files this browser can play",
      "Min 4 stars",
      "Videos only"
    ]);
  });

  it("names a media type or audio choice other than the first by its label", () => {
    expect(filterSummaryParts(filter({ mediaTypeFilter: MEDIA_TYPE_FILTER.All }), null)).toEqual([]);
    expect(filterSummaryParts(filter({ mediaTypeFilter: MEDIA_TYPE_FILTER.VideosOnly }), null)).toEqual(["Videos only"]);
    expect(filterSummaryParts(filter({ mediaTypeFilter: MEDIA_TYPE_FILTER.PhotosOnly }), null)).toEqual(["Photos only"]);
    expect(filterSummaryParts(filter({ audioFilter: AUDIO_FILTER.PlayAll }), null)).toEqual([]);
    expect(filterSummaryParts(filter({ audioFilter: AUDIO_FILTER.WithAudioOnly }), null)).toEqual(["Only videos with audio"]);
    expect(filterSummaryParts(filter({ audioFilter: AUDIO_FILTER.WithoutAudioOnly }), null)).toEqual(["Only videos without audio"]);
  });

  it("counts the chosen sources out of all the sources listed, ignoring case, and only the chosen while none are listed", () => {
    expect(filterSummaryParts(filter({ includedSourceIds: [] }), SOURCES)).toEqual([]);
    expect(filterSummaryParts(filter({ includedSourceIds: ["source-1"] }), SOURCES)).toEqual(["1 of 3 sources"]);
    expect(filterSummaryParts(filter({ includedSourceIds: ["source-1", "source-3"] }), SOURCES)).toEqual(["2 of 3 sources"]);
    expect(filterSummaryParts(filter({ includedSourceIds: ["gone"] }), SOURCES)).toEqual(["0 of 3 sources"]);
    expect(filterSummaryParts(filter({ includedSourceIds: ["source-1"] }), null)).toEqual(["1 source"]);
    expect(filterSummaryParts(filter({ includedSourceIds: ["source-1", "source-2"] }), null)).toEqual(["2 sources"]);
  });

  it("names the minimum and maximum duration as the Filter tab shows them", () => {
    expect(filterSummaryParts(filter({ minDurationSeconds: 90 }), null)).toEqual(["Min 01:30"]);
    expect(filterSummaryParts(filter({ maxDurationSeconds: 3600 }), null)).toEqual(["Max 01:00:00"]);
    expect(filterSummaryParts(filter({ minDurationSeconds: 0, maxDurationSeconds: 75 }), null)).toEqual(["Min 00:00", "Max 01:15"]);
  });

  it("counts the included and excluded tags", () => {
    expect(filterSummaryParts(filter({ selectedTags: ["Beach"] }), null)).toEqual(["1 tag"]);
    expect(filterSummaryParts(filter({ selectedTags: ["Beach", "Sunset", "Dogs"] }), null)).toEqual(["3 tags"]);
    expect(filterSummaryParts(filter({ excludedTags: ["Rain"] }), null)).toEqual(["1 tag excluded"]);
    expect(filterSummaryParts(filter({ excludedTags: ["Rain", "Night"] }), null)).toEqual(["2 tags excluded"]);
  });

  it("lists the applied filters in the Filter tab's order", () => {
    const everything = filter({
      favoritesMode: "excluded",
      blacklistedMode: "only",
      onlyNeverPlayed: true,
      onlyKnownDuration: true,
      onlyKnownLoudness: true,
      mediaTypeFilter: MEDIA_TYPE_FILTER.VideosOnly,
      audioFilter: AUDIO_FILTER.WithAudioOnly,
      includedSourceIds: ["source-2"],
      minDurationSeconds: 30,
      maxDurationSeconds: 600,
      selectedTags: ["Beach", "Sunset"],
      excludedTags: ["Rain"]
    });
    expect(filterSummaryParts(everything, SOURCES)).toEqual([
      "Favorites excluded",
      "Blacklisted only",
      "Only never played",
      "Only videos with known duration",
      "Only videos with known loudness",
      "Videos only",
      "Only videos with audio",
      "1 of 3 sources",
      "Min 00:30",
      "Max 10:00",
      "2 tags",
      "1 tag excluded"
    ]);
  });
});
