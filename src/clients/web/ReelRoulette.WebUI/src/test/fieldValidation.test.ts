import { describe, expect, it } from "vitest";
import { actionBlock, createFieldReveal, EMPTY_FIELD, isFlagged } from "../validation/fieldValidation";

describe("field validation", () => {
  it("flags a problem, but never an empty required field", () => {
    expect(isFlagged(null)).toBe(false);
    expect(isFlagged({ message: "Use MM:SS, HH:MM:SS, or seconds." })).toBe(true);
    expect(isFlagged(EMPTY_FIELD)).toBe(false);
  });

  it("holds an action on its first field with a problem", () => {
    const problems = { name: null, min: null, max: { message: "Use seconds." }, flags: { message: "Change one." } };
    expect(actionBlock(["min", "name", "max", "flags"], problems)).toEqual({ disabled: false, heldBy: "max" });
    expect(actionBlock(["min", "name"], problems)).toEqual({ disabled: false, heldBy: null });
  });

  it("disables an action for an empty required field, even while another field has a problem", () => {
    const problems = { name: EMPTY_FIELD, min: { message: "Use seconds." } };
    expect(actionBlock(["min", "name"], problems)).toEqual({ disabled: true, heldBy: null });
  });

  it("disables an action for any problem in a field beside it, and is held only by a field elsewhere", () => {
    const taken = { name: { message: "Use a name no other preset has." }, min: { message: "Use seconds." } };
    expect(actionBlock(["name", "min"], taken, ["name"])).toEqual({ disabled: true, heldBy: null });
    const otherOnly = { name: null, min: { message: "Use seconds." } };
    expect(actionBlock(["name", "min"], otherOnly, ["name"])).toEqual({ disabled: false, heldBy: "min" });
  });

  it("makes each request to move to a field a new one, even for the same field", () => {
    const reveal = createFieldReveal<"min" | "max">();
    expect(reveal.request.value).toBeNull();
    reveal.reveal("min");
    reveal.reveal("min");
    expect(reveal.request.value).toEqual({ field: "min", count: 2 });
  });
});
