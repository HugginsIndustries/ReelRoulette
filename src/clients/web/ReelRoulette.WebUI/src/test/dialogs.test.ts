import { describe, expect, it, vi } from "vitest";
import { createDialogs } from "../dialogs/dialogs";

function setup() {
  const relayed: string[] = [];
  const recorded: string[] = [];
  const dialogs = createDialogs({ relayStatus: (logText) => relayed.push(logText), record: (message) => recorded.push(message) });
  return { dialogs, relayed, recorded };
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

  it("doesn't open a notice whose message is already open, still relays it, and settles both when it closes", async () => {
    const { dialogs, relayed, recorded } = setup();
    const settled: string[] = [];
    void dialogs.notice("Photo file not found.").then(() => settled.push("first"));
    void dialogs.notice("No eligible media for current filters.");
    void dialogs.notice("Photo file not found.").then(() => settled.push("second"));
    expect(dialogs.open.value.map((dialog) => dialog.message)).toEqual(["Photo file not found.", "No eligible media for current filters."]);
    expect(relayed).toEqual(["Photo file not found.", "No eligible media for current filters.", "Photo file not found."]);

    dialogs.answer(1, true);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toEqual(["first", "second"]);

    // The list behind the bell keeps each notice that opened, not one already open.
    expect(recorded).toEqual(["Photo file not found.", "No eligible media for current filters."]);

    // Once it has closed, the same message opens again.
    void dialogs.notice("Photo file not found.");
    expect(dialogs.open.value.map((dialog) => dialog.message)).toEqual(["No eligible media for current filters.", "Photo file not found."]);
  });

  it("shows a notice that offers an action, relayed and kept as a notice is, settling true for the action and false for OK", async () => {
    const { dialogs, relayed, recorded } = setup();
    const chosen = dialogs.noticeWithAction("Audio processing couldn't start on this device.", "Turn off Enhanced audio");
    const dismissed = dialogs.noticeWithAction("Another problem.", "Fix it");
    expect(dialogs.open.value).toEqual([
      { id: 1, kind: "notice", message: "Audio processing couldn't start on this device.", action: "Turn off Enhanced audio" },
      { id: 2, kind: "notice", message: "Another problem.", action: "Fix it" }
    ]);
    expect(relayed).toEqual(["Audio processing couldn't start on this device.", "Another problem."]);
    expect(recorded).toEqual(relayed);

    dialogs.answer(1, true);
    dialogs.answer(2, false);
    await expect(chosen).resolves.toBe(true);
    await expect(dismissed).resolves.toBe(false);
  });
});
