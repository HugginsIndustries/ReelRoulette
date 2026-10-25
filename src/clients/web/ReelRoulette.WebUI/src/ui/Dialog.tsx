import type { ComponentChildren, RefObject } from "preact";
import { useId, useLayoutEffect, useRef } from "preact/hooks";
import { CONTROL_TOKEN_MESSAGE, CONTROL_TOKEN_TITLE } from "../api/controlAccess";
import type { OpenDialog } from "../dialogs/dialogs";
import { actionBlock, isFlagged, type FieldProblem } from "../validation/fieldValidation";
import { useApp } from "./appContext";
import { HeldButton, ValidatedField } from "./FieldValidation";

// The WebUI's dialog: a themed modal in the browser's top layer, so each one opens above any dialog already open, and
// above the overlays and fullscreen. It is rendered inside the fullscreen stage, so it shows in iOS pseudo-fullscreen
// too. Escape or a click outside closes only the top one. Auto Tag, which covers the whole page, is one too, with its
// own class, no outside to click, and a scan to wait for.

export interface DialogProps {
  /** The id of what names it: its heading, or a confirmation's or notice's message. */
  labelledBy: string;
  /** For a confirmation or a notice. */
  role?: "alertdialog";
  /** Escape, a click outside, or the browser closing it, as Android's back gesture does. */
  onCancel: () => void;
  /** Takes focus when it opens. */
  initialFocus: RefObject<HTMLElement | null>;
  /** Selects the text of the field that takes focus. */
  selectInitial?: boolean;
  id?: string;
  /** In place of the in-app dialog's own `app-dialog`. */
  class?: string;
  /** False when a click on the dialog itself isn't a click outside it, as for one that covers the whole page. */
  backdropCancels?: boolean;
  /** Whether a close the browser makes anyway, after its cancel, opens it again, as Auto Tag does while a scan runs. */
  stayOpen?: () => boolean;
  children: ComponentChildren;
}

/** A modal that opens when it renders and closes when it stops rendering. */
export function Dialog(props: DialogProps) {
  const { labelledBy, role, onCancel, initialFocus, selectInitial, id, backdropCancels = true, stayOpen, children } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const keepOpen = useRef(stayOpen);
  keepOpen.current = stayOpen;
  /** Whether the last press on the dialog started on its backdrop, or null before any press. */
  const pressOnBackdrop = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const dialog = ref.current!;
    let closing = false;
    // The browser asks to close it on Escape or a back gesture; this page decides what closing means.
    const onBrowserCancel = (event: Event) => {
      event.preventDefault();
      cancel.current();
    };
    const show = () => {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    };
    // Some browsers close it anyway after repeated requests, so a close this page didn't make is a cancel, and one that
    // should stay open opens again.
    const onBrowserClose = () => {
      if (closing) {
        return;
      }
      cancel.current();
      if (keepOpen.current?.()) {
        show();
      }
    };
    dialog.addEventListener("cancel", onBrowserCancel);
    dialog.addEventListener("close", onBrowserClose);
    show();
    const target = initialFocus.current;
    target?.focus();
    if (selectInitial && target instanceof HTMLInputElement) {
      target.select();
    }
    return () => {
      closing = true;
      dialog.removeEventListener("cancel", onBrowserCancel);
      dialog.removeEventListener("close", onBrowserClose);
      if (dialog.open && typeof dialog.close === "function") {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      id={id}
      class={props.class ?? "app-dialog"}
      role={role}
      aria-labelledby={labelledBy}
      onKeyDown={(event) => {
        // Only the top dialog holds focus, so only it closes; the stage's own Escape handling doesn't run.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel.current();
        }
      }}
      onPointerDown={(event) => {
        pressOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The content fills the dialog, so a click on the dialog itself landed on the backdrop. A press that started
        // inside, such as selecting a field's text, doesn't count.
        const startedOnBackdrop = pressOnBackdrop.current;
        pressOnBackdrop.current = null;
        if (backdropCancels && event.target === event.currentTarget && startedOnBackdrop !== false) {
          cancel.current();
        }
      }}
    >
      {children}
    </dialog>
  );
}

export interface NameDialogProps {
  title: string;
  /** The name field's label. */
  label: string;
  fieldId: string;
  saveId: string;
  /** Save's label, such as Continue for a step before an action. Defaults to Save. */
  saveLabel?: string;
  /** "password" for a secret, such as the control token. Defaults to "text". */
  inputType?: "text" | "password";
  value: string;
  /** The name's problem, from the field validation pattern. Any problem disables Save, since the field is beside it. */
  problem: FieldProblem | null;
  /** Whether the field shows its problem, from `isFlagged`. */
  flagged: boolean;
  onInput: (text: string) => void;
  /**
   * Save, or Enter in the field, while the name has no problem. The caller closes the dialog, or keeps it open with
   * the server's refusal as the name's problem.
   */
  onSave: () => void;
  onCancel: () => void;
  /** Shows a red Delete, which should ask first in a dialog stacked above. */
  onDelete?: () => void;
  /** Fields after the name, such as Edit Tag's category. */
  children?: ComponentChildren;
}

/**
 * A dialog with a name field using the field validation pattern, any fields after it, an optional Delete on the left,
 * and Cancel and Save. It opens with the name focused and selected.
 */
export function NameDialog(props: NameDialogProps) {
  const { title, label, fieldId, saveId, saveLabel = "Save", inputType = "text", value, problem, flagged } = props;
  const { onInput, onSave, onCancel, onDelete, children } = props;
  const titleId = useId();
  const name = useRef<HTMLInputElement>(null);
  // The name is a field of the dialog Save is in, so any problem in it disables Save.
  const saveDisabled = actionBlock(["name"], { name: problem }, ["name"]).disabled;
  return (
    <Dialog labelledBy={titleId} onCancel={onCancel} initialFocus={name} selectInitial>
      <div class="dialog-body">
        <h3 id={titleId}>{title}</h3>
        <label for={fieldId}>{label}</label>
        <ValidatedField problem={problem} flagged={flagged} controlRef={name}>
          {(control) => (
            <input
              {...control}
              // Preact types each input type's attributes apart, so the type is spread.
              {...(inputType === "password" ? { type: "password" } : { type: "text" })}
              id={fieldId}
              autocomplete="off"
              value={value}
              onInput={(event) => onInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.isComposing) {
                  event.preventDefault();
                  if (!saveDisabled) {
                    onSave();
                  }
                }
              }}
            />
          )}
        </ValidatedField>
        {children}
        <div class="dialog-actions">
          {onDelete ? (
            <button type="button" class="btn-danger" onClick={onDelete}>
              Delete
            </button>
          ) : null}
          <span class="dialog-spacer" />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <HeldButton id={saveId} disabled={saveDisabled} heldReason={null} onClick={onSave}>
            {saveLabel}
          </HeldButton>
        </div>
      </div>
    </Dialog>
  );
}

/** Asks before an action. Cancel starts focused, so Enter never confirms by default. */
function ConfirmDialog({ dialog, answer }: { dialog: Extract<OpenDialog, { kind: "confirm" }>; answer: (confirmed: boolean) => void }) {
  const messageId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog role="alertdialog" labelledBy={messageId} onCancel={() => answer(false)} initialFocus={cancel}>
      <div class="dialog-body">
        <p id={messageId} class="dialog-message">{dialog.message}</p>
        <div class="dialog-actions">
          <span class="dialog-spacer" />
          <button ref={cancel} type="button" onClick={() => answer(false)}>
            Cancel
          </button>
          <button type="button" class={dialog.danger ? "btn-danger" : undefined} onClick={() => answer(true)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Something the user must see, with one OK, and after it the notice's action when it offers one. OK starts focused. */
function NoticeDialog({ dialog, answer }: { dialog: Extract<OpenDialog, { kind: "notice" }>; answer: (confirmed: boolean) => void }) {
  const messageId = useId();
  const ok = useRef<HTMLButtonElement>(null);
  return (
    <Dialog role="alertdialog" labelledBy={messageId} onCancel={() => answer(false)} initialFocus={ok}>
      <div class="dialog-body">
        <p id={messageId} class="dialog-message">{dialog.message}</p>
        <div class="dialog-actions">
          <span class="dialog-spacer" />
          <button ref={ok} type="button" onClick={() => answer(false)}>
            OK
          </button>
          {dialog.action ? (
            <button type="button" onClick={() => answer(true)}>
              {dialog.action}
            </button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** The control-token prompt, while an admin action asks for the token. */
function ControlTokenDialog() {
  const { controlAccess } = useApp();
  const view = controlAccess.prompt.value;
  if (!view) {
    return null;
  }
  return (
    <NameDialog
      title={CONTROL_TOKEN_TITLE}
      label={CONTROL_TOKEN_MESSAGE}
      fieldId="control-token-input"
      saveId="control-token-continue"
      saveLabel="Continue"
      inputType="password"
      value={view.token}
      problem={view.problem}
      flagged={isFlagged(view.problem)}
      onInput={controlAccess.input}
      onSave={() => void controlAccess.submit()}
      onCancel={controlAccess.cancel}
    />
  );
}

/**
 * The control-token prompt, and the confirmations and notices the dialog service shows, each above the ones before
 * it.
 */
export function DialogHost() {
  const { dialogs } = useApp();
  return (
    <>
      <ControlTokenDialog />
      {dialogs.open.value.map((dialog) =>
        dialog.kind === "confirm" ? (
          <ConfirmDialog key={dialog.id} dialog={dialog} answer={(confirmed) => dialogs.answer(dialog.id, confirmed)} />
        ) : (
          <NoticeDialog key={dialog.id} dialog={dialog} answer={(confirmed) => dialogs.answer(dialog.id, confirmed)} />
        )
      )}
    </>
  );
}
