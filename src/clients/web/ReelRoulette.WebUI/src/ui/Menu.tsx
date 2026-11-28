import { createPortal, Fragment, type RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { useApp } from "./appContext";
import { MENU_TARGET_CLASS, type ContextMenuView, type MenuGroups } from "./menuModel";
import { placeAtPoint } from "./placement";

export interface MenuProps {
  id?: string;
  /** The container's own classes, which place it, such as above the button that opens it. */
  class?: string;
  hidden?: boolean;
  /** The items in groups, with a rule between each group and the next. An empty group shows nothing. */
  groups: MenuGroups;
  /** Closes the menu, which a pick does before the item's action. */
  onClose: () => void;
}

/**
 * The app's menu: a list of actions in groups, each with its icon at its left, one look for every menu. It renders
 * only the list, and its container places it.
 */
export function Menu({ id, class: extraClass, hidden, groups, onClose }: MenuProps) {
  const shown = groups.filter((group) => group.length > 0);
  return (
    <div id={id} class={extraClass ? `menu ${extraClass}` : "menu"} hidden={hidden}>
      {shown.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? <hr class="menu-rule" /> : null}
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              class={item.danger ? "menu-danger" : undefined}
              disabled={!!item.disabledReason}
              title={item.disabledReason ?? undefined}
              onClick={(event) => {
                onClose();
                item.onPick(event.currentTarget);
              }}
            >
              <span class="material-symbol-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/** The context menu's own element, while it shows. */
const CONTEXT_MENU_ID = "context-menu";

/** Whether `target` is in the context menu, as a press that keeps a popover the menu opened over open is. */
export function inContextMenu(target: Node | null): boolean {
  return target instanceof Element && !!target.closest(`#${CONTEXT_MENU_ID}`);
}

/**
 * The context menu that shows, at its point, below and to the right of it, or on its other side where it would cross
 * the window's edge, kept inside the window. It closes on a press outside it, which still does what it does, on
 * Escape, on a pick, before the item's action, and on a scroll outside it, a resize, and the browser tab hiding, so it
 * never stays where its element no longer is. Escape comes to it before anything else, such as the bell's list it
 * opened over, except a dialog it doesn't show in. The element it acts on is tinted while it is open. It renders in the
 * fullscreen stage, so it shows in fullscreen and nothing it opens over clips it, or in the open dialog its element is
 * in, such as Auto Tag, since the page outside a modal dialog takes no presses.
 */
export function ContextMenuHost() {
  const { contextMenu } = useApp();
  const view = contextMenu.view.value;
  const host = useRef<HTMLDivElement>(null);

  const open = view !== null;
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const { close, dismiss } = contextMenu;
    const outside = (target: EventTarget | null) => !(target instanceof Node && host.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) dismiss();
    };
    // Heard from the window, before the page hears it, so a popover the menu opened over, such as the bell's list,
    // stays open, and so does the dialog it shows in. A dialog it doesn't show in, which opened over it, takes Escape.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (Array.from(document.querySelectorAll("dialog[open]")).some((dialog) => !dialog.contains(host.current))) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    const onScroll = (event: Event) => {
      if (outside(event.target)) close();
    };
    const onVisibilityChange = () => {
      if (document.hidden) close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    const target = view?.target;
    target?.classList.add(MENU_TARGET_CLASS);
    return () => target?.classList.remove(MENU_TARGET_CLASS);
  }, [view]);

  // Placed once it has rendered, by its own size, before it paints.
  useLayoutEffect(() => {
    const element = host.current;
    if (!view || !element) {
      return;
    }
    const { left, top } = placeAtPoint(
      view.point,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }, [view]);

  if (!view) {
    return null;
  }
  const menu = (
    <div id={CONTEXT_MENU_ID} class="context-menu" ref={host}>
      <Menu groups={view.groups} onClose={contextMenu.dismiss} />
    </div>
  );
  const dialog = view.target?.closest("dialog[open]");
  return dialog ? createPortal(menu, dialog) : menu;
}

export interface MenuSurfaceOptions {
  /** The buttons inside the element a long press still opens the menu on. */
  pressOn?: string;
  /** Opens the menu in place of the context menu's own open, as the menus on the playing item do, to close it later. */
  open?: (view: ContextMenuView) => void;
}

/**
 * Gives the element `element` holds a context menu while it is mounted: a right-click or a long press on it opens the
 * groups `groupsFor` gives at that moment, tinting the element, and nothing while it gives null. Without `groupsFor`
 * the element has no menu.
 */
export function useMenuSurface(
  element: RefObject<Element | null>,
  groupsFor: (() => MenuGroups | null) | undefined,
  options: MenuSurfaceOptions = {}
): void {
  const { contextMenu } = useApp();
  // The latest render's `groupsFor` is the one a press asks.
  const latest = useRef(groupsFor);
  latest.current = groupsFor;
  const hasMenu = !!groupsFor;
  useLayoutEffect(() => {
    const target = element.current;
    if (!hasMenu || !target) {
      return;
    }
    const open = options.open ?? contextMenu.open;
    return contextMenu.addSurface({
      element: target,
      menuAt: () => latest.current?.() ?? null,
      open: (groups, point) => open({ point, target, groups }),
      pressOn: options.pressOn
    });
  }, [hasMenu]);
}
