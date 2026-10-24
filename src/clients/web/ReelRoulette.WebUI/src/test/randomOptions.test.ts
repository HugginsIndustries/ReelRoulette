import { describe, expect, it } from "vitest";
import {
  byCategoryProblem,
  chosenCategories,
  DEFAULT_RANDOM_OPTIONS,
  randomLineText,
  randomPickOptionsRequest,
  readRandomOptions,
  spreadCategories,
  type RandomOptions
} from "../random/randomOptions";

const CATALOG = {
  categories: [
    { id: "places", name: "Places", sortOrder: 1 },
    { id: "people", name: "People", sortOrder: 0 },
    { id: "moods", name: "Moods", sortOrder: 2 },
    { id: "animals", name: "Animals", sortOrder: 1 }
  ],
  tags: [
    { name: "Beach", categoryId: "places" },
    { name: "Alice", categoryId: "people" },
    { name: "Cat", categoryId: "animals" },
    { name: "Loose", categoryId: "" }
  ]
};

const CATEGORIES = spreadCategories(CATALOG)!;

function options(change: Partial<RandomOptions>): RandomOptions {
  return { ...DEFAULT_RANDOM_OPTIONS, ...change };
}

describe("readRandomOptions", () => {
  it("reads every kept option, and each one missing or not valid as its default", () => {
    const kept: RandomOptions = {
      shuffle: false,
      rememberPlaysForDays: null,
      spreadByFolder: false,
      spreadByTags: true,
      tagSpread: "byCategory",
      spreadCategoryIds: ["people", "places"],
      favorLessPlayed: true,
      favorNewlyAdded: true,
      favorNewlyCreated: true,
      favorHigherRated: true
    };
    expect(readRandomOptions(kept)).toEqual(kept);
    expect(readRandomOptions(null)).toEqual(DEFAULT_RANDOM_OPTIONS);
    expect(readRandomOptions({ shuffle: "no", rememberPlaysForDays: 14, tagSpread: "some", spreadCategoryIds: ["people", 3], favorLessPlayed: true })).toEqual({
      ...DEFAULT_RANDOM_OPTIONS,
      spreadCategoryIds: ["people"],
      favorLessPlayed: true
    });
    expect(readRandomOptions({ rememberPlaysForDays: 1 }).rememberPlaysForDays).toBe(1);
  });
});

describe("randomPickOptionsRequest", () => {
  it("sends Spread by tags as off, all tags, or by category, and the category ids only by category", () => {
    expect(randomPickOptionsRequest(options({ tagSpread: "byCategory", spreadCategoryIds: ["people"] }))).toMatchObject({ spreadByTags: "off" });
    expect(randomPickOptionsRequest(options({ tagSpread: "byCategory", spreadCategoryIds: ["people"] })).spreadCategoryIds).toBeUndefined();
    expect(randomPickOptionsRequest(options({ spreadByTags: true, spreadCategoryIds: ["people"] }))).toMatchObject({ spreadByTags: "allTags" });
    expect(randomPickOptionsRequest(options({ spreadByTags: true, spreadCategoryIds: ["people"] })).spreadCategoryIds).toBeUndefined();
    expect(randomPickOptionsRequest(options({ spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["people", "gone"] }))).toMatchObject({
      spreadByTags: "byCategory",
      spreadCategoryIds: ["people", "gone"]
    });
  });
});

describe("spreadCategories", () => {
  it("lists the categories with tags by sort order, then name, and nothing before the catalog loads", () => {
    expect(CATEGORIES).toEqual([
      { id: "people", name: "People" },
      { id: "animals", name: "Animals" },
      { id: "places", name: "Places" }
    ]);
    expect(spreadCategories(null)).toBeNull();
  });

  it("chooses categories by id, in the list's order, leaving out one the list no longer has", () => {
    expect(chosenCategories(options({ spreadCategoryIds: ["places", "gone", "people"] }), CATEGORIES).map((category) => category.name)).toEqual(["People", "Places"]);
  });
});

describe("byCategoryProblem", () => {
  it("flags By category with no listed category chosen while Spread by tags is on", () => {
    const byCategory = options({ spreadByTags: true, tagSpread: "byCategory" });
    expect(byCategoryProblem(byCategory, CATEGORIES)).toEqual({ message: "Choose at least one category." });
    expect(byCategoryProblem({ ...byCategory, spreadCategoryIds: ["gone"] }, CATEGORIES)).toEqual({ message: "Choose at least one category." });
    expect(byCategoryProblem({ ...byCategory, spreadCategoryIds: ["people"] }, CATEGORIES)).toBeNull();
    expect(byCategoryProblem({ ...byCategory, spreadByTags: false }, CATEGORIES)).toBeNull();
    expect(byCategoryProblem({ ...byCategory, tagSpread: "allTags" }, CATEGORIES)).toBeNull();
  });

  it("before the catalog loads, flags only an empty choice", () => {
    const byCategory = options({ spreadByTags: true, tagSpread: "byCategory" });
    expect(byCategoryProblem(byCategory, null)).toEqual({ message: "Choose at least one category." });
    expect(byCategoryProblem({ ...byCategory, spreadCategoryIds: ["gone"] }, null)).toBeNull();
  });
});

describe("randomLineText", () => {
  it.each<[string, Partial<RandomOptions>, string]>([
    ["the defaults", {}, "Shuffle · Spread by folder"],
    ["every option off", { shuffle: false, spreadByFolder: false }, "Pure random"],
    ["Shuffle alone", { spreadByFolder: false }, "Shuffle"],
    ["Spread by tags alone", { shuffle: false, spreadByFolder: false, spreadByTags: true }, "Spread by tags"],
    ["both spreads", { shuffle: false, spreadByTags: true }, "Spread by folder and tags"],
    ["one category", { spreadByFolder: false, spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["people"] }, "Shuffle · Spread by People"],
    ["folder and one category", { spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["people"] }, "Shuffle · Spread by folder and People"],
    ["folder and two categories, in the list's order", { spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["places", "people"] }, "Shuffle · Spread by folder, People, and Places"],
    ["By category with none chosen", { spreadByFolder: false, spreadByTags: true, tagSpread: "byCategory" }, "Shuffle"],
    ["Spread by tags off, keeping its categories", { tagSpread: "byCategory", spreadCategoryIds: ["people"] }, "Shuffle · Spread by folder"],
    ["one Favor", { shuffle: false, spreadByFolder: false, favorHigherRated: true }, "Favor higher rated"],
    ["two Favors", { favorLessPlayed: true, favorHigherRated: true }, "Shuffle · Spread by folder · Favor less played and higher rated"],
    [
      "every Favor",
      { shuffle: false, spreadByFolder: false, favorLessPlayed: true, favorNewlyAdded: true, favorNewlyCreated: true, favorHigherRated: true },
      "Favor less played, newly added, newly created, and higher rated"
    ],
    ["Remember plays for, which it never names", { rememberPlaysForDays: null }, "Shuffle · Spread by folder"]
  ])("names %s", (_name, change, text) => {
    expect(randomLineText(options(change), CATEGORIES)).toBe(text);
  });

  it("names chosen categories as tags before the catalog loads, and none chosen as no tag part", () => {
    expect(randomLineText(options({ spreadByTags: true, tagSpread: "byCategory", spreadCategoryIds: ["people"] }), null)).toBe("Shuffle · Spread by folder and tags");
    expect(randomLineText(options({ spreadByTags: true, tagSpread: "byCategory" }), null)).toBe("Shuffle · Spread by folder");
  });
});
