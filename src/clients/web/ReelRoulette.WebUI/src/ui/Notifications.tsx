import { useLayoutEffect, useRef } from "preact/hooks";
import type { NotificationEntry, Popup } from "../notifications/notifications";
import { activeLastingStates, lastingStateText } from "../state/lastingStates";
import { whenText } from "../time/timeText";
import { useApp } from "./appContext";
import { useLightDismiss } from "./LightDismiss";
import { inContextMenu, useMenuSurface } from "./Menu";
import type { MenuGroups } from "./menuModel";
import { keepInside } from "./placement";

/** How far a swipe on a touch screen has to go, to either side, to close a popup. */
const SWIPE_CLOSE_PX = 64;
/** Over how far a swipe fades a popup, down to a fifth of its opacity. */
const SWIPE_FADE_PX = 220;

const BELL_CLASS = "overlay-btn icon-glyph-base icon-glyph-button overlay-corner-btn notify-btn";

function bell(): HTMLElement | null {
  return document.getElementById("notify-btn");
}

/**
 * The player's bell, at its top left with its other controls, so it shows and hides with them. Its badge counts the
 * one-off messages that didn't pop up since the list was last open, and the bell is orange while there are any, as it
 * is while its list is open. A press opens the list under it, or closes the list; the controls stop the press from
 * reaching the player, so it starts no random pick.
 */
export function NotifyButton() {
  const { notifications } = useApp();
  const open = notifications.listOpen.value;
  const unread = notifications.unread.value;
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  function onClick(event: Event): void {
    event.stopPropagation();
    if (notifications.listOpen.peek()) {
      notifications.closeList();
    } else {
      notifications.openList();
    }
  }

  return (
    <button id="notify-btn" type="button" class={[BELL_CLASS, open ? "is-open" : null, unread > 0 ? "has-unread" : null].filter(Boolean).join(" ")} aria-label={label} title={label} onClick={onClick}>
      <span class="material-symbol-icon">notifications</span>
      <span class="notify-badge" hidden={unread === 0}>{unread > 9 ? "9+" : String(unread)}</span>
    </button>
  );
}

/**
 * The popups beside the player, at the edge and side the popup settings say, newest nearest the edge. They take no
 * focus, and only their own boxes take the pointer, so the player and the panel stay usable around them. Their host is
 * a sibling of the media area, so popups at the bottom rise above the player's controls while those show. While Auto
 * Tag is open they show inside it, at the window's edge, since it covers the page from the browser's top layer: the
 * host there renders them, `inAutoTag`, and the one beside the player renders nothing.
 */
export function Popups({ inAutoTag = false }: { inAutoTag?: boolean }) {
  const { notifications, tagEditor } = useApp();
  const popups = notifications.popups.value;
  if (tagEditor.autoTagOpen.value !== inAutoTag) {
    return null;
  }
  return (
    <div id="toasts" class="toasts" data-pos={notifications.settings.value.position}>
      {popups.map((popup) => (
        <Toast key={popup.id} popup={popup} />
      ))}
    </div>
  );
}

/**
 * One popup: its kind's icon or its own, the message, an optional second line, and Dismiss. Pointing at it with a mouse
 * or pen pauses its time, and so does its menu while it is open; a swipe to either side on a touch screen closes it.
 */
function Toast({ popup }: { popup: Popup }) {
  const { notifications, notificationMenus, contextMenu } = useApp();
  const box = useRef<HTMLDivElement>(null);
  /** Ends a swipe in progress and puts the popup back where it was, as its menu opens. */
  const cancelSwipe = useRef<() => void>(() => {});
  const { id, entry } = popup;

  // A long press opens the menu while the finger is still down, so the swipe it started ends, and sliding on leaves
  // the popup in place. Held once the menu is open, so closing the menu it replaces, which lets go of its own hold,
  // comes first.
  useMenuSurface(box, () => notificationMenus.popupGroups(popup), {
    open(view) {
      cancelSwipe.current();
      contextMenu.open({ ...view, onClose: () => notifications.hold(id, "menu", false) });
      notifications.hold(id, "menu", true);
    }
  });

  useLayoutEffect(() => {
    const toast = box.current!;
    let hovering = false;
    let endSwipe: (() => void) | null = null;

    const onPointerEnter = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      hovering = true;
      notifications.hold(id, "pointer", true);
    };
    const onPointerLeave = () => {
      if (!hovering) return;
      hovering = false;
      notifications.hold(id, "pointer", false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || (event.target as Element | null)?.closest?.("button")) return;
      endSwipe?.();
      const startX = event.clientX;
      let dx = 0;
      const move = (moved: PointerEvent) => {
        dx = moved.clientX - startX;
        toast.style.transition = "none";
        toast.style.transform = `translateX(${dx}px)`;
        toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / SWIPE_FADE_PX));
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        endSwipe = null;
      };
      const up = () => {
        stop();
        toast.style.transition = "";
        if (Math.abs(dx) > SWIPE_CLOSE_PX) {
          notifications.dismiss(id, true);
          return;
        }
        toast.style.transform = "";
        toast.style.opacity = "";
      };
      endSwipe = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    cancelSwipe.current = () => {
      if (!endSwipe) return;
      endSwipe();
      toast.style.transition = "";
      toast.style.transform = "";
      toast.style.opacity = "";
    };

    toast.addEventListener("pointerenter", onPointerEnter);
    toast.addEventListener("pointerleave", onPointerLeave);
    toast.addEventListener("pointerdown", onPointerDown);
    return () => {
      endSwipe?.();
      // A popup moving into Auto Tag or out of it renders anew, and the box under a resting mouse gets no pointerleave,
      // so its hold goes with it.
      onPointerLeave();
      toast.removeEventListener("pointerenter", onPointerEnter);
      toast.removeEventListener("pointerleave", onPointerLeave);
      toast.removeEventListener("pointerdown", onPointerDown);
    };
  }, [id]);

  const className = ["toast", "menu-surface", entry.warning ? "is-warning" : "", popup.leaving ? "is-leaving" : ""].filter(Boolean).join(" ");
  return (
    <div class={className} data-key={popup.key} ref={box}>
      <span class="material-symbol-icon">{entry.icon}</span>
      <div class="toast-text">
        <div>{entry.text}</div>
        {entry.detail ? <div class="toast-detail">{entry.detail}</div> : null}
      </div>
      <button type="button" class="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={() => notifications.dismiss(id)}>
        <span class="material-symbol-icon">close</span>
      </button>
    </div>
  );
}

interface ListRow {
  key: string;
  icon: string;
  text: string;
  detail: string | null;
  time: string;
  className: string;
  /** What a tap on the row does, as the update notice's reload, or null where it takes none. */
  onTap: (() => void) | null;
  /** The row's menu. */
  menu: () => MenuGroups;
}

function EntryRow({ row }: { row: ListRow }) {
  const element = useRef<HTMLLIElement>(null);
  useMenuSurface(element, row.menu);
  return (
    <li class={row.onTap ? `${row.className} is-action` : row.className} onClick={row.onTap ?? undefined} ref={element}>
      <span class="material-symbol-icon">{row.icon}</span>
      <span class="notify-text">{row.text}</span>
      <span class="notify-time">{row.time}</span>
      {row.detail ? <span class="notify-detail">{row.detail}</span> : null}
    </li>
  );
}

function entryClass(entry: NotificationEntry): string {
  return ["notify-entry", "menu-surface", entry.kind === "notice" ? "is-error" : "", entry.warning ? "is-warning" : "", entry.highlight ? "is-unread" : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * The list under the bell, inside the fullscreen stage so it shows in fullscreen and pseudo-fullscreen. Now shows each
 * active lasting state with its full text, the update notice's row taking a tap that reloads the page, and Recent the
 * messages kept, newest first, with their times. Each row has a menu, with Copy text, and Dismiss on a message. It
 * lines up with the bell's left edge, or its right edge when the bell is in the right half of the window. It closes on
 * its Close, the bell, Escape, a press outside it, or the panel opening; a menu opened from it keeps it open while it
 * is used. Escape comes to it before anything else but that menu, except while an in-app dialog is open. Its
 * Notification settings opens the Settings tab at Show popups with Popup settings open.
 */
export function NotificationList() {
  const { notifications, notificationMenus, store, panel, settings, reloadForUpdate } = useApp();
  const list = useRef<HTMLElement>(null);
  const open = notifications.listOpen.value;

  // Under the bell, lined up with its left edge in the window's left half and with its right edge otherwise.
  function place(): void {
    const anchor = bell()?.getBoundingClientRect();
    const element = list.current;
    if (!anchor || !element) return;
    const width = element.offsetWidth || Math.min(380, window.innerWidth - 16);
    const left = anchor.left < window.innerWidth / 2 ? anchor.left : anchor.right - width;
    element.style.left = `${keepInside(left, width, window.innerWidth)}px`;
    element.style.top = `${Math.round(anchor.bottom + 6)}px`;
    element.style.maxHeight = `${Math.max(220, Math.round(window.innerHeight - anchor.bottom - 18))}px`;
  }

  // Closing the list, however it closes, leaves focus on the page rather than on a control it hides.
  useLayoutEffect(() => {
    if (open) {
      place();
      return;
    }
    const focused = document.activeElement as HTMLElement | null;
    if (focused && list.current?.contains(focused)) focused.blur();
  }, [open]);

  useLightDismiss({
    open: notifications.listOpen,
    keepsOpen: (target) => !!target && (!!list.current?.contains(target) || !!bell()?.contains(target) || inContextMenu(target)),
    onPressOutside: notifications.closeList,
    onEscape: notifications.closeList
  });

  useLayoutEffect(() => {
    const onResize = () => {
      if (notifications.listOpen.peek()) place();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function openSettings(): Promise<void> {
    notifications.closeList();
    await panel.showTab("settings");
    settings.revealPopupSettings();
  }

  const now: ListRow[] = open
    ? activeLastingStates(store).map((state) => {
        const text = lastingStateText(state);
        return {
          key: state.id,
          icon: state.icon,
          text,
          detail: state.detail,
          time: "",
          className: state.warning ? "notify-entry menu-surface is-warning" : "notify-entry menu-surface",
          onTap: state.reloads ? () => void reloadForUpdate() : null,
          menu: () => notificationMenus.stateGroups(text, state.detail)
        };
      })
    : [];
  const entries = notifications.entries.value;
  // Each render reads the day afresh, so a message's time gains its date the next time the list renders after midnight.
  const at = Date.now();
  const seconds = notifications.showSeconds.value;
  const recent: ListRow[] = open
    ? entries.map((entry) => ({
        key: String(entry.id),
        icon: entry.icon,
        text: entry.text,
        detail: entry.detail || null,
        time: whenText(entry.time, at, seconds),
        className: entryClass(entry),
        onTap: null,
        menu: () => notificationMenus.entryGroups(entry)
      }))
    : [];

  return (
    <section id="notify-list" class="notify-list" hidden={!open} ref={list}>
      <div class="notify-head">
        <h2>Notifications</h2>
        <button type="button" class="btn" data-act="clear" disabled={entries.length === 0} onClick={() => notifications.clear()}>Clear</button>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close" title="Close" onClick={() => notifications.closeList()}>
          <span class="material-symbol-icon">close</span>
        </button>
      </div>
      <div class="notify-scroll themed-scrollbar">
        <div data-part="now" hidden={now.length === 0}>
          <h3 class="notify-group-title">Now</h3>
          <ul class="notify-entries">
            {now.map((row) => (
              <EntryRow key={row.key} row={row} />
            ))}
          </ul>
        </div>
        <div data-part="recent">
          <h3 class="notify-group-title" hidden={recent.length === 0}>Recent</h3>
          <ul class="notify-entries">
            {recent.map((row) => (
              <EntryRow key={row.key} row={row} />
            ))}
          </ul>
          <p class="notify-empty" hidden={recent.length > 0 || now.length > 0}>No notifications yet.</p>
        </div>
      </div>
      <div class="notify-foot">
        <button type="button" class="btn" data-act="settings" onClick={() => void openSettings()}>
          <span class="material-symbol-icon" aria-hidden="true">settings</span>
          Notification settings
        </button>
      </div>
    </section>
  );
}
