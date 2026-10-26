import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type { WindowPoint } from "./placement";

/** One action in a menu. */
export interface MenuItem {
  label: string;
  /** Its icon's name, drawn at its left. */
  icon: string;
  onPick: () => void;
  /** Red, for an action that deletes something. */
  danger?: boolean;
  /** Why the action can't act now, which disables it and is its tooltip, or null while it is enabled. */
  disabledReason?: string | null;
}

/** A menu's items in groups, with a rule between each group and the next. An empty group shows nothing. */
export type MenuGroups = readonly (readonly MenuItem[])[];

/** A context menu: its items, the point it opens at, and what to do once it closes. */
export interface ContextMenuView {
  point: WindowPoint;
  groups: MenuGroups;
  /** Runs when the menu closes, however it closes, so whoever opened it can let go of what it marked. */
  onClose?: () => void;
}

/**
 * The app's context menu, which opens at a point, such as where a right-click landed. One shows at a time: opening one
 * closes the one before.
 */
export interface ContextMenu {
  /** The menu showing, or null. */
  readonly view: ReadonlySignal<ContextMenuView | null>;
  readonly isOpen: ReadonlySignal<boolean>;
  open(view: ContextMenuView): void;
  close(): void;
}

export function createContextMenu(): ContextMenu {
  const view = signal<ContextMenuView | null>(null);

  function close(): void {
    const shown = view.peek();
    if (!shown) {
      return;
    }
    view.value = null;
    shown.onClose?.();
  }

  return {
    view,
    isOpen: computed(() => view.value !== null),
    open(next) {
      close();
      view.value = next;
    },
    close
  };
}
