import { describe, expect, it } from "vitest";
import { countText, ofText } from "../text/countText";

describe("countText", () => {
  it("names one in the singular and any other count in the plural, grouped as the device writes numbers", () => {
    expect(countText(1, "item")).toBe("1 item");
    expect(countText(0, "tag")).toBe("0 tags");
    expect(countText(3, "source")).toBe("3 sources");
    expect(countText(1234, "item")).toBe(`${(1234).toLocaleString()} items`);
  });
});

describe("ofText", () => {
  it("groups both numbers and counts the noun by the total, or leaves the noun out", () => {
    expect(ofText(1234, 49455, "file")).toBe(`${(1234).toLocaleString()} of ${(49455).toLocaleString()} files`);
    expect(ofText(0, 1, "video")).toBe("0 of 1 video");
    expect(ofText(1, 2, "video")).toBe("1 of 2 videos");
    expect(ofText(2, 3)).toBe("2 of 3");
  });
});
