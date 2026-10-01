import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareTagNames } from "../library/tagNameOrder";

const expected: string[] = JSON.parse(
  readFileSync(new URL("../../../../../../shared/fixtures/tag-name-order.json", import.meta.url), "utf8")
);

describe("compareTagNames", () => {
  it("reproduces the shared fixture order", () => {
    expect(expected.slice().reverse().sort(compareTagNames)).toEqual(expected);

    const shuffled = expected.slice();
    let seed = 1234;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    expect(shuffled.sort(compareTagNames)).toEqual(expected);
  });
});
