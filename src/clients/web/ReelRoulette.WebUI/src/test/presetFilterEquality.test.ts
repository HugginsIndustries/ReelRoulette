import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterStateFromApiObject, filterStatesEqualForPresetMatch } from "../filter/filterStateModel";

interface PresetEqualityCase {
  name: string;
  left: unknown;
  right: unknown;
  same: boolean;
}

// The desktop preset comparison reads the same fixture.
const cases: PresetEqualityCase[] = JSON.parse(
  readFileSync(new URL("../../../../../../shared/fixtures/preset-filter-equality.json", import.meta.url), "utf8")
);

describe("filterStatesEqualForPresetMatch shared fixture", () => {
  it.each(cases)("$name", ({ left, right, same }) => {
    const a = filterStateFromApiObject(left);
    const b = filterStateFromApiObject(right);
    expect(filterStatesEqualForPresetMatch(a, b)).toBe(same);
    expect(filterStatesEqualForPresetMatch(b, a)).toBe(same);
  });
});
