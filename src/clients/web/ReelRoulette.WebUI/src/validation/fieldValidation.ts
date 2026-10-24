import { computed, signal, type ReadonlySignal } from "@preact/signals";

/** What is wrong with a field's value. Its message is the tooltip, which says what the field expects. */
export interface FieldProblem {
  message: string;
  /**
   * A field that may sit empty, such as a name typed for an action, is empty: never flagged, so it has no message, and
   * it disables the action that needs it. A field that must always hold a value for the app to work, such as Advance
   * after, never sets this: emptied, it has a message and is flagged, so the user sees it.
   */
  empty?: boolean;
}

/** The problem of a field that may sit empty, while it is empty. */
export const EMPTY_FIELD: FieldProblem = { message: "", empty: true };

/** Whether a field shows its problem: always, except while a field that may sit empty is empty. */
export function isFlagged(problem: FieldProblem | null): boolean {
  return problem !== null && !problem.empty;
}

/** What an action's fields do to it. */
export interface ActionBlock<F extends string = string> {
  /** The action is disabled: it dims, and pressing it does nothing. */
  disabled: boolean;
  /** The first field elsewhere whose problem holds the action, which pressing it moves to, or null. */
  heldBy: F | null;
}

/**
 * Decides whether an action can proceed. A field that may sit empty disables it while it is empty, and so does any
 * problem in a field that sits right next to it (`beside`): a field beside its button, or a field of the dialog the
 * action is in, which says why itself. Otherwise the first of its fields, in order, with a problem holds it. Disabling
 * wins over holding.
 */
export function actionBlock<F extends string>(
  fields: readonly F[],
  problems: Readonly<Record<F, FieldProblem | null>>,
  beside: readonly F[] = []
): ActionBlock<F> {
  const disabled = fields.some((field) => problems[field]?.empty) || beside.some((field) => problems[field] !== null);
  return { disabled, heldBy: disabled ? null : (fields.find((field) => problems[field] !== null) ?? null) };
}

/**
 * Moves to a field when an action it holds is pressed. The field's component attaches its move, which shows the
 * field's section and focuses its control, and `reveal` runs it at once, within the press, since a phone opens its
 * on-screen keyboard only for a focus made within the press, and then brings the focused field above it.
 */
export interface FieldReveal<F extends string = string> {
  /** Runs the move attached for `field`, at once; nothing while none is attached. */
  reveal(field: F): void;
  /** Attaches `field`'s move and returns its removal, which leaves a move attached for the field since in place. */
  attach(field: F, move: () => void): () => void;
}

export function createFieldReveal<F extends string>(): FieldReveal<F> {
  const moves = new Map<F, () => void>();
  return {
    reveal(field) {
      moves.get(field)?.();
    },
    attach(field, move) {
      moves.set(field, move);
      return () => {
        if (moves.get(field) === move) {
          moves.delete(field);
        }
      };
    }
  };
}

/** How long a setting's field says it saved a new value. */
export const SETTING_SAVED_MS = 2000;

export interface SettingFieldOptions {
  /** The value in use, as the field shows it. */
  saved(): string;
  /** The field's problem, which a setting that must always hold a value gives an emptied field too, or null. */
  problemOf(text: string): FieldProblem | null;
  /** Keeps a value that has no problem, which then applies. */
  save(text: string): void;
}

/**
 * The field of a setting that applies without Save and must always hold a value. A valid value typed is saved only on
 * Enter or when the field loses focus or hides, so a value passed through on the way, such as the "1" of "120", is
 * never saved. While the field has focus, a value that is not valid stays flagged; once it loses focus, or hides, it
 * shows the value saved again, unflagged. A save that changes the value says so for `SETTING_SAVED_MS`.
 */
export interface SettingField {
  readonly text: ReadonlySignal<string>;
  readonly problem: ReadonlySignal<FieldProblem | null>;
  /**
   * A save just changed the value, for `SETTING_SAVED_MS` or until the field is typed in again: not when the value
   * stays as it was, or when a value that is not valid goes back to the one saved.
   */
  readonly justSaved: ReadonlySignal<boolean>;
  /** The field's text, as typed. */
  input(text: string): void;
  /** Enter: saves a valid value typed since the last save. */
  commit(): void;
  /** The field loses focus or hides: saves a valid value typed since the last save, then shows the value saved. */
  leave(): void;
  /** Shows the value saved again, dropping what was typed, as after Reset to defaults puts the values back. */
  show(): void;
}

export function createSettingField(options: SettingFieldOptions): SettingField {
  const text = signal(options.saved());
  const problem = computed(() => options.problemOf(text.value));
  const justSaved = signal(false);
  /** Typed since the last save, or since the field showed the value saved. */
  let edited = false;
  let savedTimer: ReturnType<typeof setTimeout> | null = null;

  function saidSaved(said: boolean): void {
    if (savedTimer !== null) {
      clearTimeout(savedTimer);
      savedTimer = null;
    }
    justSaved.value = said;
    if (said) {
      savedTimer = setTimeout(() => saidSaved(false), SETTING_SAVED_MS);
    }
  }

  function saveEdit(): void {
    if (!edited || problem.peek() !== null) {
      return;
    }
    edited = false;
    const before = options.saved();
    options.save(text.peek());
    if (options.saved() !== before) {
      saidSaved(true);
    }
  }

  return {
    text,
    problem,
    justSaved,
    input(next) {
      text.value = next;
      edited = true;
      saidSaved(false);
    },
    commit: saveEdit,
    leave() {
      saveEdit();
      edited = false;
      text.value = options.saved();
    },
    show() {
      edited = false;
      saidSaved(false);
      text.value = options.saved();
    }
  };
}
