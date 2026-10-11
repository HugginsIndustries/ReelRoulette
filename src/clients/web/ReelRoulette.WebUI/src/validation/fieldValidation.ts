import { signal, type ReadonlySignal } from "@preact/signals";

/**
 * What is wrong with a field's value. Its message is the tooltip, which says what the field expects, and the
 * field's accessible description.
 */
export interface FieldProblem {
  message: string;
  /** A required field that is empty: flagged only once the user has typed in it, but it holds its action meanwhile. */
  empty?: boolean;
}

/** Whether a field shows its problem: always, except an empty required field the user hasn't typed in yet. */
export function isFlagged(problem: FieldProblem | null, typedIn: boolean): boolean {
  return problem !== null && !(problem.empty && !typedIn);
}

/** The first of an action's fields, in order, whose problem holds the action, or null while the action can proceed. */
export function firstHoldingField<F extends string>(
  fields: readonly F[],
  problems: Readonly<Record<F, FieldProblem | null>>
): F | null {
  return fields.find((field) => problems[field] !== null) ?? null;
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
