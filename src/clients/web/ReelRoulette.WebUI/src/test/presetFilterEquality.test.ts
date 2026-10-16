import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterStateFromApiObject, filterStatesEqualForPresetMatch, type ApiFilterState } from "../filter/filterStateModel";

interface PresetEqualityCase {
  name: string;
  left: ApiFilterState;
  right: ApiFilterState;
  same: boolean;
}

const cases: PresetEqualityCase[] = JSON.parse(
  readFileSync(new URL("./fixtures/preset-filter-equality.json", import.meta.url), "utf8")
);

describe("filterStatesEqualForPresetMatch fixture", () => {
  it.each(cases)("$name", ({ left, right, same }) => {
    const a = filterStateFromApiObject(left);
    const b = filterStateFromApiObject(right);
    expect(filterStatesEqualForPresetMatch(a, b)).toBe(same);
    expect(filterStatesEqualForPresetMatch(b, a)).toBe(same);
  });
});
