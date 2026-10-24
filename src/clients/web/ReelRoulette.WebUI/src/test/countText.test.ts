import { describe, expect, it } from "vitest";
import { countText } from "../text/countText";

describe("countText", () => {
  it("names one in the singular and any other count in the plural, grouped as the device writes numbers", () => {
    expect(countText(1, "item")).toBe("1 item");
    expect(countText(0, "tag")).toBe("0 tags");
    expect(countText(3, "source")).toBe("3 sources");
    expect(countText(1234, "item")).toBe(`${(1234).toLocaleString()} items`);
  });
});
