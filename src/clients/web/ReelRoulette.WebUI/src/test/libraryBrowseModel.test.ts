import { describe, expect, it } from "vitest";
import {
  createDefaultBrowseControls,
  getSortDirectionLabel,
  isDefaultDescendingForSortMode
} from "../library/libraryBrowseModel";

describe("libraryBrowseModel", () => {
  it("defaults to Name ascending", () => {
    const controls = createDefaultBrowseControls();
    expect(controls.sortMode).toBe("Name");
    expect(controls.sortDescending).toBe(false);
    expect(isDefaultDescendingForSortMode("LastPlayed")).toBe(true);
    expect(isDefaultDescendingForSortMode("Name")).toBe(false);
  });

  it("getSortDirectionLabel matches desktop labels", () => {
    expect(getSortDirectionLabel("Name", false)).toBe("A–Z");
    expect(getSortDirectionLabel("DateAdded", true)).toBe("Newest → Oldest");
  });
});
