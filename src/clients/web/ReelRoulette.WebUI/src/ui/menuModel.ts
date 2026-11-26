import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type { WindowPoint } from "./placement";

/** One action in a menu. */
export interface MenuItem {
  label: string;
  /** Its icon's name, drawn at its left. */
  icon: string;
  /** Runs once the menu has closed, with the item's own button, which tells a copy where its fallback field can go. */
  onPick: (element: HTMLElement) => void;
  /** Red, for an action that deletes something. */
  danger?: boolean;
  /** Why the action can't act now, which disables it and is its tooltip, or null while it is enabled. */
  disabledReason?: string | null;
}

/** A menu's items in groups, with a rule between each group and the next. An empty group shows nothing. */
export type MenuGroups = readonly (readonly MenuItem[])[];

/** The class on the element a context menu acts on while it is open. */
export const MENU_TARGET_CLASS = "is-menu-target";

/** A context menu: its items, the point it opens at, and what to do once it closes. */
export interface ContextMenuView {
  point: WindowPoint;
  groups: MenuGroups;
  /** The element it acts on, tinted while it is open; one marked its own way, as a tile's ring does, is left out. */
  target?: Element;
  /**
   * Runs when the menu closes, however it closes, so whoever opened it can let go of what it marked. `byUser` is true
   * for a close the user made: a pick, Escape, or a press outside it.
   */
  onClose?: (byUser: boolean) => void;
}

/** A part of the page with a menu, which a right-click or a long press on it opens. */
export interface MenuSurface<T> {
  /** The element whose presses open it. */
  element: Element;
  /** What a press on `target`, inside the element, opens the menu on, or null where it opens none, as between tiles. */
  menuAt(target: Element): T | null;
  /** Opens the menu on what `menuAt` gave, at `point`. */
  open(on: T, point: WindowPoint): void;
  /** Buttons inside it that a long press still opens its menu on, as part of it, such as a tag category's name. */
  pressOn?: string;
}

/** The surface a press landed on: its element, and how to open its menu on what the press was on. */
export interface MenuSurfaceHit {
  element: Element;
  open(point: WindowPoint): void;
  pressOn?: string;
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
  /** Closes the menu on its own, as when what it acts on goes. */
  close(): void;
  /** Closes the menu as the user did: a pick, Escape, or a press outside it. */
  dismiss(): void;
  /** Gives `surface` a menu until the returned function takes it away. */
  addSurface<T>(surface: MenuSurface<T>): () => void;
  /** The innermost surface `target` is in, or null where it is in none or that surface opens no menu on it. */
  surfaceAt(target: Element): MenuSurfaceHit | null;
}

interface SurfaceEntry {
  element: Element;
  pressOn?: string;
  at(target: Element): ((point: WindowPoint) => void) | null;
}

export function createContextMenu(): ContextMenu {
  const view = signal<ContextMenuView | null>(null);
  const surfaces: SurfaceEntry[] = [];

  function close(byUser = false): void {
    const shown = view.peek();
    if (!shown) {
      return;
    }
    view.value = null;
    shown.onClose?.(byUser);
  }

  return {
    view,
    isOpen: computed(() => view.value !== null),
    open(next) {
      close();
      view.value = next;
    },
    close: () => close(),
    dismiss: () => close(true),

    addSurface(surface) {
      const entry: SurfaceEntry = {
        element: surface.element,
        pressOn: surface.pressOn,
        at(target) {
          const on = surface.menuAt(target);
          return on === null ? null : (point) => surface.open(on, point);
        }
      };
      surfaces.push(entry);
      return () => {
        const index = surfaces.indexOf(entry);
        if (index >= 0) {
          surfaces.splice(index, 1);
        }
      };
    },

    surfaceAt(target) {
      for (let element: Element | null = target; element; element = element.parentElement) {
        const entry = surfaces.find((surface) => surface.element === element);
        if (entry) {
          const open = entry.at(target);
          return open ? { element: entry.element, open, pressOn: entry.pressOn } : null;
        }
      }
      return null;
    }
  };
}
