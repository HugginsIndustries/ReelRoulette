import { Fragment } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { useApp } from "./appContext";
import { useLightDismiss } from "./LightDismiss";
import type { MenuGroups } from "./menuModel";
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
              onClick={() => {
                onClose();
                item.onPick();
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

/**
 * The context menu that shows, at its point, below and to the right of it, or on its other side where it would cross
 * the window's edge, kept inside the window. It closes on a press outside it, which still does what it does, on
 * Escape, and on a pick, before the item's action. A right-click on it opens nothing more. It renders in the
 * fullscreen stage, so it shows in fullscreen and nothing it opens over clips it.
 */
export function ContextMenuHost() {
  const { contextMenu } = useApp();
  const view = contextMenu.view.value;
  const host = useRef<HTMLDivElement>(null);

  useLightDismiss({
    open: contextMenu.isOpen,
    keepsOpen: (target) => !!target && !!host.current?.contains(target),
    onPressOutside: contextMenu.close,
    onEscape: contextMenu.close
  });

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
  return (
    <div id="context-menu" class="context-menu" ref={host} onContextMenu={(event) => event.preventDefault()}>
      <Menu groups={view.groups} onClose={contextMenu.close} />
    </div>
  );
}
