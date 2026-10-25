import { Fragment } from "preact";

/** One action in a menu. */
export interface MenuItem {
  label: string;
  onPick: () => void;
  /** Red, for an action that deletes something. */
  danger?: boolean;
  /** Why the action makes no sense now, which disables it and is its tooltip, or null while it is enabled. */
  disabledReason?: string | null;
}

export interface MenuProps {
  id?: string;
  /** The container's own classes, which place it, such as above the button that opens it. */
  class?: string;
  hidden?: boolean;
  /** The items in groups, with a rule between each group and the next. An empty group shows nothing. */
  groups: readonly (readonly MenuItem[])[];
  /** Closes the menu, which a pick does before the item's action. */
  onClose: () => void;
}

/**
 * The app's menu: a list of actions in groups, one look for every menu. It renders only the list, and its container
 * places it.
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
              {item.label}
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
