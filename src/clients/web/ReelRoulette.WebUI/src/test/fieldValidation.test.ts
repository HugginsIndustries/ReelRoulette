import { describe, expect, it } from "vitest";
import { createFieldReveal, firstHoldingField, isFlagged } from "../validation/fieldValidation";

describe("field validation", () => {
  it("flags a problem, except an empty required field the user hasn't typed in", () => {
    expect(isFlagged(null, true)).toBe(false);
    expect(isFlagged({ message: "Use MM:SS, HH:MM:SS, or seconds." }, false)).toBe(true);
    expect(isFlagged({ message: "Enter a preset name.", empty: true }, false)).toBe(false);
    expect(isFlagged({ message: "Enter a preset name.", empty: true }, true)).toBe(true);
  });

  it("holds an action on its first field with a problem, flagged or not", () => {
    const problems = { name: { message: "Enter a name.", empty: true }, min: null, max: { message: "Use seconds." } };
    expect(firstHoldingField(["min", "name", "max"], problems)).toBe("name");
    expect(firstHoldingField(["min", "max"], problems)).toBe("max");
    expect(firstHoldingField(["min"], problems)).toBeNull();
  });

  it("makes each request to move to a field a new one, even for the same field", () => {
    const reveal = createFieldReveal<"min" | "max">();
    expect(reveal.request.value).toBeNull();
    reveal.reveal("min");
    reveal.reveal("min");
    expect(reveal.request.value).toEqual({ field: "min", count: 2 });
  });
});
