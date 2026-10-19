import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionBlock,
  createFieldReveal,
  createSettingField,
  EMPTY_FIELD,
  isFlagged,
  SETTING_SAVED_MS
} from "../validation/fieldValidation";

afterEach(() => {
  vi.useRealTimers();
});

describe("field validation", () => {
  it("flags a problem, but never a field that may sit empty while it is empty", () => {
    expect(isFlagged(null)).toBe(false);
    expect(isFlagged({ message: "Use MM:SS, HH:MM:SS, or seconds." })).toBe(true);
    expect(isFlagged(EMPTY_FIELD)).toBe(false);
  });

  it("holds an action on its first field with a problem", () => {
    const problems = { name: null, min: null, max: { message: "Use seconds." }, flags: { message: "Change one." } };
    expect(actionBlock(["min", "name", "max", "flags"], problems)).toEqual({ disabled: false, heldBy: "max" });
    expect(actionBlock(["min", "name"], problems)).toEqual({ disabled: false, heldBy: null });
  });

  it("disables an action while a field that may sit empty is empty, even while another field has a problem", () => {
    const problems = { name: EMPTY_FIELD, min: { message: "Use seconds." } };
    expect(actionBlock(["min", "name"], problems)).toEqual({ disabled: true, heldBy: null });
  });

  it("disables an action for any problem in a field beside it, and is held only by a field elsewhere", () => {
    const taken = { name: { message: "Use a name no other preset has." }, min: { message: "Use seconds." } };
    expect(actionBlock(["name", "min"], taken, ["name"])).toEqual({ disabled: true, heldBy: null });
    const otherOnly = { name: null, min: { message: "Use seconds." } };
    expect(actionBlock(["name", "min"], otherOnly, ["name"])).toEqual({ disabled: false, heldBy: "min" });
  });

  it("runs the move attached for a field at once, each time it is asked, and none for a field without one", () => {
    const reveal = createFieldReveal<"min" | "max">();
    const moves: string[] = [];
    reveal.reveal("min");
    const detachMin = reveal.attach("min", () => moves.push("min"));
    reveal.attach("max", () => moves.push("max"));
    reveal.reveal("min");
    reveal.reveal("min");
    reveal.reveal("max");
    expect(moves).toEqual(["min", "min", "max"]);

    detachMin();
    reveal.reveal("min");
    expect(moves).toEqual(["min", "min", "max"]);
  });

  it("keeps a move attached since in place when an earlier one for the same field is removed", () => {
    const reveal = createFieldReveal<"min">();
    const moves: string[] = [];
    const detachFirst = reveal.attach("min", () => moves.push("first"));
    reveal.attach("min", () => moves.push("second"));
    detachFirst();
    reveal.reveal("min");
    expect(moves).toEqual(["second"]);
  });
});

describe("a setting's field", () => {
  /** A setting of 1 to 300, kept in `value`, with each save in `saves`. */
  function setup() {
    const kept = { value: 15, saves: [] as string[] };
    const field = createSettingField({
      saved: () => String(kept.value),
      problemOf: (text) => (/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 300 ? null : { message: "Use 1 to 300." }),
      save(text) {
        kept.saves.push(text);
        kept.value = Number(text.trim());
      }
    });
    return { field, kept };
  }

  it("starts with the value saved, and saves nothing while it is typed, however long typing pauses", () => {
    vi.useFakeTimers();
    const { field, kept } = setup();
    expect([field.text.value, field.problem.value]).toEqual(["15", null]);

    for (const text of ["1", "12", "120"]) {
      field.input(text);
      vi.advanceTimersByTime(10_000);
    }
    expect([kept.saves, field.text.value]).toEqual([[], "120"]);
    field.leave();
    expect(kept.saves).toEqual(["120"]);
  });

  it("keeps the value in use when it is cleared, and shows it again once the field is left", () => {
    const { field, kept } = setup();
    field.input("1");
    field.input("");
    expect([field.text.value, isFlagged(field.problem.value)]).toEqual(["", true]);
    field.leave();
    expect([kept.saves, field.text.value, field.problem.value]).toEqual([[], "15", null]);
  });

  it("saves on Enter what was typed since, and nothing for a value that is not valid", () => {
    const { field, kept } = setup();
    field.commit();
    field.input("42");
    field.commit();
    field.commit();
    expect(kept.saves).toEqual(["42"]);
    field.input("abc");
    field.commit();
    expect([kept.saves, isFlagged(field.problem.value)]).toEqual([["42"], true]);
  });

  it("on leaving, saves a valid value and shows the value saved, or shows it again for one that is not valid", () => {
    const { field, kept } = setup();
    field.leave();
    expect(kept.saves).toEqual([]);

    field.input(" 007 ");
    field.leave();
    expect([kept.saves, field.text.value, field.problem.value]).toEqual([[" 007 "], "7", null]);

    field.input("abc");
    field.leave();
    expect([kept.saves, field.text.value, field.problem.value]).toEqual([[" 007 "], "7", null]);
    field.leave();
    expect(kept.saves).toEqual([" 007 "]);
  });

  it("says it saved for a while when a save changes the value, on Enter or on leaving", () => {
    vi.useFakeTimers();
    const { field } = setup();
    expect(field.justSaved.value).toBe(false);
    field.input("42");
    field.commit();
    expect(field.justSaved.value).toBe(true);
    vi.advanceTimersByTime(SETTING_SAVED_MS - 1);
    expect(field.justSaved.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(field.justSaved.value).toBe(false);

    field.input("43");
    field.leave();
    expect(field.justSaved.value).toBe(true);
  });

  it("doesn't say it saved when the value stays as it was, or when a value that is not valid goes back to the one saved", () => {
    const { field, kept } = setup();
    field.input(" 015 ");
    field.commit();
    expect([kept.saves, field.justSaved.value]).toEqual([[" 015 "], false]);
    field.input("abc");
    field.leave();
    expect([field.text.value, field.justSaved.value]).toEqual(["15", false]);
  });

  it("shows the value saved again when asked, as after Reset to defaults, dropping what was typed and saying nothing saved", () => {
    const { field, kept } = setup();
    field.input("42");
    field.commit();
    field.input("abc");
    kept.value = 15;
    field.show();
    expect([field.text.value, field.problem.value, field.justSaved.value]).toEqual(["15", null, false]);
    // What was typed before is gone, so leaving saves nothing.
    field.leave();
    expect(kept.saves).toEqual(["42"]);
  });

  it("stops saying it saved as soon as the field is typed in again", () => {
    vi.useFakeTimers();
    const { field } = setup();
    field.input("42");
    field.commit();
    vi.advanceTimersByTime(1_500);
    field.input("4");
    expect(field.justSaved.value).toBe(false);
    // A save that changes the value again says so again, for its own while, which the first save's doesn't cut short.
    field.input("44");
    field.commit();
    vi.advanceTimersByTime(SETTING_SAVED_MS - 1);
    expect(field.justSaved.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(field.justSaved.value).toBe(false);
  });
});
