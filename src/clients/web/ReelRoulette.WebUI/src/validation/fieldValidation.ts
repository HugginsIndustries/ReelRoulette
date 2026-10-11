import { signal, type ReadonlySignal } from "@preact/signals";

/**
 * What is wrong with a field's value. Its message is the tooltip, which says what the field expects, and the
 * field's accessible description.
 */
export interface FieldProblem {
  message: string;
  /** An empty required field: never flagged, so it has no message, and it disables the action that needs it. */
  empty?: boolean;
}

/** An empty required field's problem. */
export const EMPTY_FIELD: FieldProblem = { message: "", empty: true };

/** Whether a field shows its problem: always, except an empty required field, which is never flagged. */
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
 * Decides whether an action can proceed. An empty required field disables it, and so does any problem in a field
 * that sits right next to it (`beside`): a field beside its button, or a field of the dialog the action is in, which
 * says why itself. Otherwise the first of its fields, in order, with a problem holds it. Disabling wins over holding.
 */
export function actionBlock<F extends string>(
  fields: readonly F[],
  problems: Readonly<Record<F, FieldProblem | null>>,
  beside: readonly F[] = []
): ActionBlock<F> {
  const disabled = fields.some((field) => problems[field]?.empty) || beside.some((field) => problems[field] !== null);
  return { disabled, heldBy: disabled ? null : (fields.find((field) => problems[field] !== null) ?? null) };
}

/** A request to move to a field. Each one is new, so asking for the same field again moves to it again. */
export interface RevealRequest<F extends string = string> {
  field: F;
  count: number;
}

/** Moves to a field: the field's component scrolls it into view and focuses it, which shows its tooltip. */
export interface FieldReveal<F extends string = string> {
  readonly request: ReadonlySignal<RevealRequest<F> | null>;
  reveal(field: F): void;
}

export function createFieldReveal<F extends string>(): FieldReveal<F> {
  const request = signal<RevealRequest<F> | null>(null);
  let count = 0;
  return {
    request,
    reveal(field) {
      count += 1;
      request.value = { field, count };
    }
  };
}
