import { describe, expect, it, vi } from "vitest";
import { createDialogs } from "../dialogs/dialogs";

function setup() {
  const relayed: string[] = [];
  const dialogs = createDialogs({ relayStatus: (logText) => relayed.push(logText) });
  return { dialogs, relayed };
}

describe("dialogs", () => {
  it("shows each confirmation above the ones before it, and settles each with its own answer", async () => {
    const { dialogs } = setup();
    const discard = dialogs.confirm({ message: "Discard changes?", confirmLabel: "Discard", danger: true });
    const remove = dialogs.confirm({ message: 'Delete tag "Bob"?', confirmLabel: "Delete" });
    expect(dialogs.open.value).toEqual([
      { id: 1, kind: "confirm", message: "Discard changes?", confirmLabel: "Discard", danger: true },
      { id: 2, kind: "confirm", message: 'Delete tag "Bob"?', confirmLabel: "Delete", danger: false }
    ]);

    dialogs.answer(2, false);
    expect(dialogs.open.value.map((dialog) => dialog.id)).toEqual([1]);
    await expect(remove).resolves.toBe(false);
    dialogs.answer(1, true);
    await expect(discard).resolves.toBe(true);
    expect(dialogs.open.value).toEqual([]);
  });

  it("ignores an answer to a dialog that is no longer open", async () => {
    const { dialogs } = setup();
    const settled = vi.fn();
    void dialogs.confirm({ message: "Discard changes?", confirmLabel: "Discard" }).then(settled);
    dialogs.answer(1, true);
    dialogs.answer(1, false);
    await Promise.resolve();
    expect(settled.mock.calls).toEqual([[true]]);
  });

  it("relays a notice's text to the server log as a status message is, or its log text in its place", async () => {
    const { dialogs, relayed } = setup();
    const notice = dialogs.notice("Saving presets failed (500).");
    void dialogs.notice('Preset "Beach days" could not be saved.', "Preset could not be saved.");
    expect(relayed).toEqual(["Saving presets failed (500).", "Preset could not be saved."]);
    expect(dialogs.open.value).toEqual([
      { id: 1, kind: "notice", message: "Saving presets failed (500)." },
      { id: 2, kind: "notice", message: 'Preset "Beach days" could not be saved.' }
    ]);

    dialogs.answer(1, true);
    await expect(notice).resolves.toBeUndefined();
  });
});
