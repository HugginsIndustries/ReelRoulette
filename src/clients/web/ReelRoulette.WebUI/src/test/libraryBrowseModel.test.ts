import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDefaultBrowseControls,
  getSortDirectionLabel,
  isDefaultDescendingForSortMode,
  LIBRARY_SORT_MODES,
  type LibrarySortMode
} from "../library/libraryBrowseModel";

interface SortDirectionLabelCase {
  sortMode: LibrarySortMode;
  descending: boolean;
  label: string;
}

// The desktop sort labels read the same fixture.
const sortLabelCases: SortDirectionLabelCase[] = JSON.parse(
  readFileSync(new URL("../../../../../../shared/fixtures/sort-direction-labels.json", import.meta.url), "utf8")
);

describe("libraryBrowseModel", () => {
  it("defaults to Name ascending", () => {
    const controls = createDefaultBrowseControls();
    expect(controls.sortMode).toBe("Name");
    expect(controls.sortDescending).toBe(false);
    expect(isDefaultDescendingForSortMode("LastPlayed")).toBe(true);
    expect(isDefaultDescendingForSortMode("Name")).toBe(false);
  });

  it.each(sortLabelCases)("labels $sortMode descending=$descending as $label", ({ sortMode, descending, label }) => {
    expect(getSortDirectionLabel(sortMode, descending)).toBe(label);
  });

  it("the sort label fixture covers every sort mode in both directions", () => {
    const covered = new Set(sortLabelCases.map((c) => `${c.sortMode}:${c.descending}`));
    for (const mode of LIBRARY_SORT_MODES) {
      expect(covered.has(`${mode}:true`)).toBe(true);
      expect(covered.has(`${mode}:false`)).toBe(true);
    }
  });
});
