import type { ComponentChildren, JSX, RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  createSettingField,
  isFlagged,
  type FieldProblem,
  type FieldReveal,
  type SettingFieldOptions
} from "../validation/fieldValidation";
import { keepInside, WINDOW_MARGIN } from "./placement";
import { prefersReducedMotion } from "./reducedMotion";

// The field validation pattern: a field that holds a value that is not valid shows a red icon, whose tooltip says what
// the field expects, and the actions that use it are disabled or held until it is corrected. A field that may sit
// empty, such as a name typed for an action, is never flagged while it is empty and only disables; a field that must
// always hold a value is flagged when emptied. A setting's field, which applies without Save, saves on Enter or when it
// is left, and then shows the value saved again, with a green check when the save changed it. The red icons, the
// tooltip, and the check fade in and out. Field problems never use a dialog or a popup.

/** How long the pattern's icons, its tooltip, and a setting's saved check take to fade in or out. */
export const FADE_MS = 250;

/**
 * Keeps something that fades out rendered for `FADE_MS` once `shown` turns false, as `leaving`, so the stylesheet's
 * fade can run; it fades in by itself as it renders. With reduced motion it goes at once.
 */
function useFadeOut(shown: boolean): { rendered: boolean; leaving: boolean } {
  const [fading, setFading] = useState(false);
  const wasShown = useRef(shown);
  // The render that hides it starts the fade, so it is never unmounted in between.
  const starts = wasShown.current && !shown && !prefersReducedMotion();
  wasShown.current = shown;
  useEffect(() => {
    if (shown || !starts) {
      setFading(false);
      return;
    }
    setFading(true);
    const timer = setTimeout(() => setFading(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  const leaving = !shown && (fading || starts);
  return { rendered: shown || leaving, leaving };
}

/** An element's classes, with `is-fading-out` while it fades out. */
function fadeClasses(classes: string, leaving: boolean): string {
  return leaving ? `${classes} is-fading-out` : classes;
}

/** What a validated control takes: focus, which shows the tooltip. */
export interface ValidatedControlProps {
  onFocus: () => void;
  onBlur: () => void;
}

export interface FieldValidationOptions<F extends string = string, T extends HTMLElement = HTMLElement> {
  problem: FieldProblem | null;
  /** Whether the field shows its problem, from `isFlagged`. */
  flagged: boolean;
  /**
   * Moves to the field when `from` reveals `field`: `show`, when given, shows the field's section, and then its
   * control takes focus, at once, so the browser brings it into view, above a phone's on-screen keyboard once it opens.
   */
  reveal?: { from: FieldReveal<F>; field: F; show?: () => void };
  /** The control's ref, when its component needs one of its own. */
  controlRef?: RefObject<T | null>;
}

export interface FieldValidation<T extends HTMLElement> {
  /** For the field's control, which a reveal or a tap on the icon focuses. */
  control: ValidatedControlProps & { ref: RefObject<T | null> };
  /** For another control checked with it, such as the other dropdown of a pair, whose focus also shows the tooltip. */
  partner: ValidatedControlProps;
  /**
   * The red icon and its tooltip while the field is flagged, and while they fade out once it isn't, for the caller to
   * place in the field's `vfield` wrapper.
   */
  mark: JSX.Element | null;
}

const TIP_GAP = 10;

/** Whether the icon shows: it has a size, and the closest scrolling container around it hasn't scrolled it out of view. */
function iconInView(icon: HTMLElement, box: DOMRect): boolean {
  if (box.width === 0 && box.height === 0) {
    return false;
  }
  for (let parent = icon.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll") {
      const view = parent.getBoundingClientRect();
      return box.bottom > view.top && box.top < view.bottom;
    }
  }
  return true;
}

/**
 * Places a shown tooltip above its icon, or below it when there is no room, kept inside the window, with its arrow
 * on the icon. It is fixed, so a scrolling dialog body doesn't clip it. It hides while the icon is out of view.
 */
function placeTip(icon: HTMLElement | null, tip: HTMLElement | null): void {
  if (!icon || !tip) {
    return;
  }
  const iconBox = icon.getBoundingClientRect();
  if (!iconInView(icon, iconBox)) {
    tip.dataset.place = "hidden";
    return;
  }
  tip.dataset.place = "above";
  const tipBox = tip.getBoundingClientRect();
  const above = iconBox.top - tipBox.height - TIP_GAP >= WINDOW_MARGIN;
  const top = above ? iconBox.top - tipBox.height - TIP_GAP : iconBox.bottom + TIP_GAP;
  const left = keepInside(iconBox.right + 6 - tipBox.width, tipBox.width, window.innerWidth);
  tip.dataset.place = above ? "above" : "below";
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
  const arrowRight = left + tipBox.width - (iconBox.left + iconBox.width / 2) - 5;
  tip.style.setProperty("--arrow-right", `${Math.max(6, Math.round(arrowRight))}px`);
}

/**
 * One field of the pattern. The tooltip shows while the pointer is on the icon, after a tap on the icon, which
 * focuses the control, or while a control has focus.
 */
export function useFieldValidation<T extends HTMLElement, F extends string = string>(
  options: FieldValidationOptions<F, T>
): FieldValidation<T> {
  const { problem, flagged, reveal } = options;
  const ownControl = useRef<T>(null);
  const control = options.controlRef ?? ownControl;
  const icon = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const shown = flagged && (focused || hover);
  // The last problem flagged, which the tooltip says while it fades out.
  const lastProblem = useRef(problem);
  if (flagged && problem) {
    lastProblem.current = problem;
  }
  const iconFade = useFadeOut(flagged && problem !== null);
  const tipFade = useFadeOut(shown);

  // The move runs within the press of the action the field holds, as a tap on the field does, so a phone opens its
  // keyboard and pans the field above it itself. Scrolling it first, or focusing it without scrolling, left it under
  // the keyboard. The latest render's `show` is the one it runs.
  const show = useRef(reveal?.show);
  show.current = reveal?.show;
  useLayoutEffect(() => {
    if (!reveal) {
      return;
    }
    return reveal.from.attach(reveal.field, () => {
      show.current?.();
      control.current?.focus();
    });
  }, [reveal?.from, reveal?.field]);

  // The icon goes away under the pointer when the field is corrected, so no leave event comes.
  useEffect(() => {
    if (!flagged) {
      setHover(false);
    }
  }, [flagged]);

  useLayoutEffect(() => {
    if (!shown) {
      return;
    }
    const place = () => placeTip(icon.current, tip.current);
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [shown, problem?.message]);

  const partner: ValidatedControlProps = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false)
  };
  const marked = flagged && problem ? problem : lastProblem.current;
  const mark =
    iconFade.rendered && marked ? (
      <>
        <span
          ref={icon}
          class={fadeClasses("vfield-icon material-symbol-icon", iconFade.leaving)}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              setHover(true);
            }
          }}
          onPointerLeave={() => setHover(false)}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") {
              event.preventDefault();
              control.current?.focus();
            }
          }}
        >
          error
        </span>
        <span
          ref={tip}
          class={fadeClasses(tipFade.rendered ? "vfield-tip is-shown" : "vfield-tip", tipFade.leaving || iconFade.leaving)}
        >
          {marked.message}
        </span>
      </>
    ) : null;
  return { control: { ...partner, ref: control }, partner, mark };
}

/** A text field with the pattern's icon inside it on the right. */
export function ValidatedField<F extends string = string>({
  class: extraClass,
  children,
  trailing,
  ...options
}: FieldValidationOptions<F, HTMLInputElement> & {
  class?: string;
  children: (control: FieldValidation<HTMLInputElement>["control"]) => ComponentChildren;
  /** More for the field's wrapper after the icon, such as a setting's saved check. */
  trailing?: ComponentChildren;
}) {
  const field = useFieldValidation<HTMLInputElement, F>(options);
  return (
    <span class={extraClass ? `vfield ${extraClass}` : "vfield"}>
      {children(field.control)}
      {field.mark}
      {trailing}
    </span>
  );
}

export interface SettingTextFieldProps extends SettingFieldOptions {
  id: string;
  /** Classes for the field's `vfield` wrapper, such as its width. */
  class?: string;
  inputMode?: "numeric" | "decimal" | "text";
  /** False while the field is hidden, as when its tab hides or the panel closes, which may give it no blur. */
  shown: boolean;
  /**
   * Changes when the value saved changes from outside the field, as Reset to defaults changes it: the field then shows
   * the value saved again.
   */
  revision?: number;
}

/**
 * The text field of a setting that applies without Save and must always hold a value, with the pattern's icon:
 * `createSettingField`'s rule, saving on Enter or when the field loses focus or hides, and showing the value saved
 * again once it does. A save that changes the value shows a green check in the red icon's place while it says so.
 */
export function SettingTextField(props: SettingTextFieldProps) {
  const { id, class: extraClass, inputMode, shown, revision } = props;
  // The latest render's callbacks, so the field reads what the page holds now.
  const latest = useRef(props);
  latest.current = props;
  const [field] = useState(() =>
    createSettingField({
      saved: () => latest.current.saved(),
      problemOf: (text) => latest.current.problemOf(text),
      save: (text) => latest.current.save(text)
    })
  );
  useEffect(() => {
    if (!shown) {
      field.leave();
    }
  }, [shown]);
  const shownRevision = useRef(revision);
  useEffect(() => {
    if (revision !== shownRevision.current) {
      shownRevision.current = revision;
      field.show();
    }
  }, [revision]);
  const problem = field.problem.value;
  const saved = field.justSaved.value;
  const check = useFadeOut(saved);
  return (
    <ValidatedField
      class={extraClass}
      problem={problem}
      flagged={isFlagged(problem)}
      trailing={
        check.rendered ? <span class={fadeClasses("vfield-saved material-symbol-icon", check.leaving)}>check_circle</span> : null
      }
    >
      {(control) => (
        <input
          {...control}
          type="text"
          inputMode={inputMode}
          id={id}
          class="ctl"
          autocomplete="off"
          value={field.text.value}
          onInput={(event) => field.input(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              field.commit();
            }
          }}
          onBlur={() => {
            control.onBlur();
            field.leave();
          }}
        />
      )}
    </ValidatedField>
  );
}

export interface HeldButtonProps {
  id: string;
  class?: string;
  /** An icon button's accessible name, and its title while no reason shows. */
  label?: string;
  /**
   * Whether the unsaved-changes dot shows, for an action that has one: it turns red in place of the red icon while a
   * field holds the action. Without it, the button has no dot.
   */
  dot?: boolean;
  /**
   * A red dot shows in place of the red icon while a field holds the action, where the unsaved-changes dot sits, for an
   * icon button without that dot, such as Add Preset. It fades as the icon does.
   */
  heldDot?: boolean;
  /**
   * A field that may sit empty, while it is empty, or any problem in a field right next to the action, disables it,
   * from `actionBlock`. The field says why, so the button shows nothing more, unless `disabledReason` does.
   */
  disabled: boolean;
  /** Why a flagged field elsewhere holds the action, its title, or null while none does. */
  heldReason: string | null;
  /** Why the action is disabled when no field says why, its title while it is disabled. */
  disabledReason?: string | null;
  /**
   * Why the action is blocked, for one whose reason has to be seen on a phone or tablet, which shows no tooltip, such as
   * Apply while presets would take each other's names. It shows as a held action does, ahead of any field that holds it,
   * with this reason as its title, and its press still goes to `onClick`, which shows why.
   */
  blockedReason?: string | null;
  onClick: () => void;
  children: ComponentChildren;
}

/**
 * An action that uses fields of the pattern. While it is disabled, it dims and pressing it does nothing. While a
 * field elsewhere holds it, its label, or an icon button's icon, dims, the red icon shows as a
 * badge on its top-right corner, out of its flow, or its unsaved-changes dot turns red when it has one, or a red dot
 * shows with `heldDot`, and its click handler moves to that field instead of acting. A blocked action looks the same,
 * and its click handler shows why.
 */
export function HeldButton({ id, class: extraClass, label, dot, heldDot, disabled, heldReason, disabledReason, blockedReason, onClick, children }: HeldButtonProps) {
  const blocked = !disabled && !!blockedReason;
  const held = !disabled && !blocked && heldReason !== null;
  const showsProblem = held || blocked;
  const reason = blocked ? blockedReason! : held ? heldReason : disabled ? (disabledReason ?? null) : null;
  // Only the icon fades out; the button's look and its title change at once. A button with a dot shows none.
  const iconFade = useFadeOut(showsProblem);
  const classes = ["held-action", extraClass, showsProblem ? "shows-problem" : null].filter(Boolean).join(" ");
  return (
    <button id={id} type="button" class={classes} disabled={disabled} aria-label={label} title={reason ?? label} onClick={onClick}>
      <span class="btn-label">{children}</span>
      {dot !== undefined ? (
        <span class="unsaved-dot" hidden={!dot}></span>
      ) : !iconFade.rendered ? null : heldDot ? (
        <span class={fadeClasses("held-dot", iconFade.leaving)}></span>
      ) : (
        <span class={fadeClasses("btn-problem material-symbol-icon", iconFade.leaving)} aria-hidden="true">
          error
        </span>
      )}
    </button>
  );
}

/**
 * The red icon on a section tab's top-right corner, as a held action's badge, while a field in the section is flagged,
 * `shown`, so the field can be found from another section. It fades in and out.
 */
export function SectionProblemMark({ shown }: { shown: boolean }) {
  const fade = useFadeOut(shown);
  return fade.rendered ? (
    <span class={fadeClasses("section-problem material-symbol-icon", fade.leaving)} aria-hidden="true">
      error
    </span>
  ) : null;
}

/** A section tab's title while a field in it is flagged. */
export const SECTION_PROBLEM_TITLE = "A field here is not valid";
