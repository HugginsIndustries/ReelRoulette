// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { render as renderInto } from "preact";
import { useState } from "preact/hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDialogs, type Dialogs } from "../../dialogs/dialogs";
import { statusLogLine } from "../../logging/relayLogLines";
import { createAppServices, type AppServices } from "../../state/appServices";
import { App } from "../../ui/App";
import { AppContext, useApp } from "../../ui/appContext";
import { DialogHost, NameDialog } from "../../ui/Dialog";
import { EMPTY_FIELD, isFlagged, type FieldProblem } from "../../validation/fieldValidation";
import { API_BASE_URL, FakeEventSource, FakeServer, SSE_URL, pageReady, resetPage, settle, stubFullscreenApi } from "./pageHarness";

/** The dialogs in the order the page opened them, so the last one is on top. */
let opened: HTMLDialogElement[] = [];

beforeEach(() => {
  opened = [];
  const showModal = HTMLDialogElement.prototype.showModal;
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
    opened.push(this);
    showModal.call(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openDialogs(): HTMLDialogElement[] {
  return Array.from(document.querySelectorAll<HTMLDialogElement>("dialog.app-dialog"));
}

function top(): HTMLDialogElement {
  const shown = openDialogs();
  return opened.filter((dialog) => shown.includes(dialog)).at(-1)!;
}

function buttonIn(dialog: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent?.trim() === label);
  if (!found) {
    throw new Error(`No ${label} button in the dialog.`);
  }
  return found;
}

/** Presses a button the way a browser does: it takes focus, then it is clicked. */
async function press(button: HTMLElement): Promise<void> {
  button.focus();
  fireEvent.click(button);
  await settle();
}

async function escape(): Promise<void> {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await settle();
}

async function type(field: HTMLElement, text: string): Promise<void> {
  fireEvent.input(field, { target: { value: text } });
  await settle();
}

/** An Edit Tag dialog over a page that opens it, with Delete asking first. "Bob" is another tag's name. */
function EditTagHarness({ saved }: { saved: (name: string) => void }) {
  const { dialogs } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Beach");
  const problem: FieldProblem | null = !name.trim()
    ? EMPTY_FIELD
    : name.trim().toLowerCase() === "bob"
      ? { message: "Use a name no other tag has." }
      : null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Edit tag</button>
      {open ? (
        <NameDialog
          title="Edit Tag"
          label="Tag Name"
          fieldId="edit-name"
          saveId="edit-save"
          value={name}
          problem={problem}
          flagged={isFlagged(problem)}
          onInput={setName}
          onSave={() => {
            saved(name.trim());
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
          onDelete={() => {
            void dialogs.confirm({ message: 'Delete tag "Beach"?', confirmLabel: "Delete", danger: true }).then((yes) => {
              if (yes) {
                setOpen(false);
              }
            });
          }}
        />
      ) : null}
      <DialogHost />
    </>
  );
}

function renderWithDialogs(saved = vi.fn()): { dialogs: Dialogs; saved: typeof saved } {
  const dialogs = createDialogs({ relayStatus: () => {} });
  render(
    <AppContext.Provider value={{ dialogs } as unknown as AppServices}>
      <EditTagHarness saved={saved} />
    </AppContext.Provider>
  );
  return { dialogs, saved };
}

/** A dialog whose Save replaces the button that opened it, as a rename replaces the row whose Edit opened it. */
function ReplacingHarness() {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState("first");
  return (
    <>
      <button key={opener} type="button" onClick={() => setOpen(true)}>{`Open ${opener}`}</button>
      <button type="button">Elsewhere</button>
      {open ? (
        <NameDialog
          title="Rename"
          label="Name"
          fieldId="rename-name"
          saveId="rename-save"
          value="Name"
          problem={null}
          flagged={false}
          onInput={() => {}}
          onSave={() => {
            setOpener("second");
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
          fallbackFocus={() => screen.getByRole("button", { name: "Elsewhere" })}
        />
      ) : null}
    </>
  );
}

async function openEditTag(): Promise<HTMLDialogElement> {
  await press(screen.getByRole("button", { name: "Edit tag" }));
  return top();
}

describe("the dialog component", () => {
  it("opens a name dialog with its name focused and selected, and Cancel closes it with focus back where it was", async () => {
    renderWithDialogs();
    const edit = await openEditTag();
    const name = edit.querySelector("input") as HTMLInputElement;
    expect(edit.open).toBe(true);
    expect(edit.getAttribute("aria-labelledby")).toBe(edit.querySelector("h3")!.id);
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, "Beach".length]);

    await press(buttonIn(edit, "Cancel"));
    expect(openDialogs()).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit tag" }));
  });

  it("opens a confirmation above the dialog that asked, with Cancel focused and a red Delete", async () => {
    renderWithDialogs();
    const edit = await openEditTag();
    await press(buttonIn(edit, "Delete"));

    const confirm = top();
    expect(confirm).not.toBe(edit);
    expect(opened.indexOf(confirm)).toBeGreaterThan(opened.indexOf(edit));
    expect(confirm.getAttribute("role")).toBe("alertdialog");
    expect(document.getElementById(confirm.getAttribute("aria-labelledby")!)?.textContent).toBe('Delete tag "Beach"?');
    expect(document.activeElement).toBe(buttonIn(confirm, "Cancel"));
    expect(buttonIn(confirm, "Delete").classList.contains("btn-danger")).toBe(true);

    await press(buttonIn(confirm, "Delete"));
    expect(openDialogs()).toEqual([]);
  });

  it("Escape closes only the top dialog, and focus returns to where it was each time", async () => {
    renderWithDialogs();
    const edit = await openEditTag();
    await type(edit.querySelector("input")!, "Shore");
    const remove = buttonIn(edit, "Delete");
    await press(remove);

    await escape();
    expect(openDialogs()).toEqual([edit]);
    expect(document.activeElement).toBe(remove);
    expect((edit.querySelector("input") as HTMLInputElement).value).toBe("Shore");

    await escape();
    expect(openDialogs()).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit tag" }));
  });

  it("a click outside closes only the top dialog, and a press that starts inside it doesn't count", async () => {
    renderWithDialogs();
    const edit = await openEditTag();
    await press(buttonIn(edit, "Delete"));
    const confirm = top();

    fireEvent.pointerDown(confirm.querySelector(".dialog-message")!);
    fireEvent.click(confirm);
    await settle();
    expect(openDialogs()).toEqual([edit, confirm]);

    fireEvent.pointerDown(confirm);
    fireEvent.click(confirm);
    await settle();
    expect(openDialogs()).toEqual([edit]);

    fireEvent.click(edit.querySelector(".dialog-body")!);
    await settle();
    expect(openDialogs()).toEqual([edit]);
    fireEvent.click(edit);
    await settle();
    expect(openDialogs()).toEqual([]);
  });

  it("Enter in the name field saves it, and a name with a problem disables Save and Enter", async () => {
    const { saved } = renderWithDialogs();
    const edit = await openEditTag();
    const name = edit.querySelector("input") as HTMLInputElement;
    const save = buttonIn(edit, "Save");

    await type(name, "  ");
    expect(save.disabled).toBe(true);
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    fireEvent.keyDown(name, { key: "Enter" });
    await settle();

    await type(name, "BOB");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toBe("Use a name no other tag has.");
    expect(save.disabled).toBe(true);
    expect(save.hasAttribute("aria-disabled")).toBe(false);
    expect(save.classList.contains("shows-problem")).toBe(false);
    fireEvent.keyDown(name, { key: "Enter" });
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(openDialogs()).toEqual([edit]);

    await type(name, " Shore ");
    expect(save.disabled).toBe(false);
    fireEvent.keyDown(name, { key: "Enter" });
    await settle();
    expect(saved.mock.calls).toEqual([["Shore"]]);
    expect(openDialogs()).toEqual([]);
  });

  it("returns focus to its fallback only when what had focus before it opened is gone", async () => {
    render(<ReplacingHarness />);
    await press(screen.getByRole("button", { name: "Open first" }));
    await press(buttonIn(top(), "Cancel"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open first" }));

    await press(screen.getByRole("button", { name: "Open first" }));
    await press(buttonIn(top(), "Save"));
    expect(screen.queryByRole("button", { name: "Open first" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Elsewhere" }));
  });

  it("a notice shows its message with one OK, which takes focus, and OK or Escape closes it", async () => {
    const { dialogs } = renderWithDialogs();
    const first = dialogs.notice("Saving presets failed (500).");
    await settle();
    const notice = top();
    expect(notice.getAttribute("role")).toBe("alertdialog");
    expect(document.getElementById(notice.getAttribute("aria-labelledby")!)?.textContent).toBe("Saving presets failed (500).");
    expect(Array.from(notice.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["OK"]);
    expect(document.activeElement).toBe(buttonIn(notice, "OK"));
    await press(buttonIn(notice, "OK"));
    await expect(first).resolves.toBeUndefined();

    const second = dialogs.notice("Tag apply failed");
    await settle();
    await escape();
    await expect(second).resolves.toBeUndefined();
    expect(openDialogs()).toEqual([]);
  });

  it("a confirmation the browser cancels or closes, as Android's back gesture does, answers Cancel", async () => {
    const { dialogs } = renderWithDialogs();
    const cancelled = dialogs.confirm({ message: "Discard changes?", confirmLabel: "Discard", danger: true });
    await settle();
    const event = new Event("cancel", { cancelable: true });
    top().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await expect(cancelled).resolves.toBe(false);

    const closed = dialogs.confirm({ message: "Discard changes?", confirmLabel: "Discard", danger: true });
    await settle();
    top().close();
    await expect(closed).resolves.toBe(false);
    await settle();
    expect(openDialogs()).toEqual([]);
  });
});

describe("the dialog in the page", () => {
  let unmount: (() => void) | null = null;

  /** Mounts the page and keeps its services, so a test can open a dialog the way a screen does. */
  function mountWithServices(): { services: AppServices; server: FakeServer } {
    const server = new FakeServer();
    vi.stubGlobal("fetch", server.fetch);
    vi.stubGlobal("EventSource", FakeEventSource);
    const root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
    const services = createAppServices({ apiBaseUrl: API_BASE_URL, sseUrl: SSE_URL });
    renderInto(<App services={services} />, root);
    unmount = () => renderInto(null, root);
    return { services, server };
  }

  function stage(): HTMLElement {
    return document.getElementById("fullscreen-stage") as HTMLElement;
  }

  beforeEach(() => {
    resetPage();
  });

  afterEach(() => {
    unmount?.();
    unmount = null;
  });

  it("shows inside the stage in fullscreen, themed, and works there", async () => {
    const fullscreen = stubFullscreenApi();
    const { services } = mountWithServices();
    await settle();
    await press(screen.getByRole("button", { name: "Fullscreen" }));
    expect(document.fullscreenElement).toBe(stage());
    expect(fullscreen.requests).toEqual([stage()]);

    const answer = services.dialogs.confirm({ message: "Discard changes?", confirmLabel: "Discard", danger: true });
    await settle();
    const confirm = top();
    expect(stage().contains(confirm)).toBe(true);
    expect(confirm.classList.contains("app-dialog")).toBe(true);
    expect(confirm.open).toBe(true);
    await press(buttonIn(confirm, "Discard"));
    await expect(answer).resolves.toBe(true);
  });

  it("shows inside the stage in pseudo-fullscreen, where Escape closes the dialog and stays in pseudo-fullscreen", async () => {
    const { services } = mountWithServices();
    await settle();
    await press(screen.getByRole("button", { name: "Fullscreen" }));
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);

    const answer = services.dialogs.confirm({ message: "Discard changes?", confirmLabel: "Discard", danger: true });
    await settle();
    expect(stage().contains(top())).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await settle();
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);
    expect(openDialogs()).toHaveLength(1);

    await escape();
    await expect(answer).resolves.toBe(false);
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(true);
    await escape();
    expect(stage().classList.contains("fullscreen-pseudo")).toBe(false);
  });

  it("a notice shows its message, pops nothing up, and is relayed to last.log with the line a popup gets", async () => {
    const { services, server } = mountWithServices();
    await pageReady(server);

    void services.dialogs.notice("Saving presets failed (500).");
    void services.dialogs.notice('Preset "Beach days" could not be saved.', "Preset could not be saved.");
    await settle();
    expect(openDialogs().map((dialog) => dialog.querySelector(".dialog-message")?.textContent)).toEqual([
      "Saving presets failed (500).",
      'Preset "Beach days" could not be saved.'
    ]);
    await waitFor(() =>
      expect(server.logLines()).toEqual(
        expect.arrayContaining([
          statusLogLine("Saving presets failed (500).", null, 0),
          statusLogLine("Preset could not be saved.", null, 0)
        ])
      )
    );
    expect(server.logLines().some((line) => line.includes("Beach days"))).toBe(false);
    expect(services.notifications.popups.value).toEqual([]);
  });
});
