import { useLayoutEffect, useRef } from "preact/hooks";
import { timeAgo, type NotificationEntry, type Popup } from "../notifications/notifications";
import { activeLastingStates, lastingStateText } from "../state/lastingStates";
import { useApp } from "./appContext";

/** How far a swipe on a touch screen has to go, to either side, to close a popup. */
const SWIPE_CLOSE_PX = 64;
/** Over how far a swipe fades a popup, down to a fifth of its opacity. */
const SWIPE_FADE_PX = 220;

function bell(): HTMLElement | null {
  return document.getElementById("notify-btn");
}

function listTitle(): HTMLElement | null {
  return document.getElementById("notify-title");
}

/**
 * The player's bell, at its top left with its other controls, so it shows and hides with them. Its badge counts the
 * one-off messages that didn't pop up since the list was last open. A press opens the list under it, or closes the
 * list and keeps focus on the bell; the controls stop the press from reaching the player, so it starts no random pick.
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
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    } else {
      notifications.openList();
    }
  }

  return (
    <button id="notify-btn" type="button" class="overlay-btn icon-glyph-base icon-glyph-button overlay-corner-btn notify-btn" aria-label={label} title={label} aria-expanded={open ? "true" : "false"} aria-controls="notify-list" onClick={onClick}>
      <span class="material-symbol-icon">notifications</span>
      <span class="notify-badge" hidden={unread === 0}>{unread > 9 ? "9+" : String(unread)}</span>
    </button>
  );
}

/**
 * The popups beside the player, at the edge and side the popup settings say, newest nearest the edge. They take no
 * focus, and only their own boxes take the pointer, so the player and the panel stay usable around them. Their host is
 * a sibling of the media area, so popups at the bottom rise above the player's controls while those show.
 */
export function Popups() {
  const { notifications } = useApp();
  const popups = notifications.popups.value;
  return (
    <div id="toasts" class="toasts" role="status" aria-live="polite" data-pos={notifications.settings.value.position}>
      {popups.map((popup) => (
        <Toast key={popup.id} popup={popup} />
      ))}
    </div>
  );
}

/**
 * One popup: its kind's icon or its own, the message, an optional second line, and Dismiss. Pointing at it with a mouse
 * or pen, or keyboard focus in it, pauses its time; a swipe to either side on a touch screen closes it.
 */
function Toast({ popup }: { popup: Popup }) {
  const { notifications } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const { id, entry } = popup;

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
    // Focus moving between the popup's own parts doesn't count as leaving it.
    const onFocusIn = () => notifications.hold(id, "focus", true);
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && toast.contains(event.relatedTarget)) return;
      notifications.hold(id, "focus", false);
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

    toast.addEventListener("pointerenter", onPointerEnter);
    toast.addEventListener("pointerleave", onPointerLeave);
    toast.addEventListener("focusin", onFocusIn);
    toast.addEventListener("focusout", onFocusOut);
    toast.addEventListener("pointerdown", onPointerDown);
    return () => {
      endSwipe?.();
      toast.removeEventListener("pointerenter", onPointerEnter);
      toast.removeEventListener("pointerleave", onPointerLeave);
      toast.removeEventListener("focusin", onFocusIn);
      toast.removeEventListener("focusout", onFocusOut);
      toast.removeEventListener("pointerdown", onPointerDown);
    };
  }, [id]);

  const className = ["toast", entry.warning ? "is-warning" : "", popup.leaving ? "is-leaving" : ""].filter(Boolean).join(" ");
  return (
    <div class={className} data-key={popup.key} ref={box}>
      <span class="material-symbol-icon" aria-hidden="true">{entry.icon}</span>
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
}

function EntryRow({ row }: { row: ListRow }) {
  return (
    <li class={row.className}>
      <span class="material-symbol-icon" aria-hidden="true">{row.icon}</span>
      <span class="notify-text">{row.text}</span>
      <span class="notify-time">{row.time}</span>
      {row.detail ? <span class="notify-detail">{row.detail}</span> : null}
    </li>
  );
}

function entryClass(entry: NotificationEntry): string {
  return ["notify-entry", entry.kind === "notice" ? "is-error" : "", entry.warning ? "is-warning" : "", entry.highlight ? "is-unread" : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * The list under the bell, inside the fullscreen stage so it shows in fullscreen and pseudo-fullscreen. Now shows each
 * active lasting state with its full text, and Recent the messages kept, newest first, with their times. It lines up
 * with the bell's left edge, or its right edge when the bell is in the right half of the window. It closes on its Close,
 * the bell, Escape, a press outside it, or the panel opening; Escape comes to it before anything else, except while an
 * in-app dialog is open.
 */
export function NotificationList() {
  const { notifications, store } = useApp();
  const list = useRef<HTMLElement>(null);
  const open = notifications.listOpen.value;

  // Under the bell, lined up with its left edge in the window's left half and with its right edge otherwise.
  function place(): void {
    const anchor = bell()?.getBoundingClientRect();
    const element = list.current;
    if (!anchor || !element) return;
    const width = element.offsetWidth || Math.min(380, window.innerWidth - 16);
    const left = anchor.left < window.innerWidth / 2 ? anchor.left : anchor.right - width;
    element.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.round(anchor.bottom + 6)}px`;
    element.style.maxHeight = `${Math.max(220, Math.round(window.innerHeight - anchor.bottom - 18))}px`;
  }

  useLayoutEffect(() => {
    if (open) {
      place();
      listTitle()?.focus({ preventScroll: true });
    }
  }, [open]);

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !notifications.listOpen.peek() || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      event.stopPropagation();
      notifications.closeList();
      bell()?.focus({ preventScroll: true });
    };
    // A press outside leaves focus where it puts it.
    const onPointerDown = (event: PointerEvent) => {
      if (!notifications.listOpen.peek()) return;
      const target = event.target as Node | null;
      if (target && (list.current?.contains(target) || bell()?.contains(target))) return;
      notifications.closeList();
    };
    const onResize = () => {
      if (notifications.listOpen.peek()) place();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  function close(): void {
    notifications.closeList();
    bell()?.focus({ preventScroll: true });
  }

  function clear(): void {
    notifications.clear();
    listTitle()?.focus({ preventScroll: true });
  }

  const now: ListRow[] = open
    ? activeLastingStates(store).map((state) => ({
        key: state.id,
        icon: state.icon,
        text: lastingStateText(state),
        detail: state.detail,
        time: "",
        className: state.warning ? "notify-entry is-warning" : "notify-entry"
      }))
    : [];
  const entries = notifications.entries.value;
  const at = notifications.now.value;
  const recent: ListRow[] = open
    ? entries.map((entry) => ({
        key: String(entry.id),
        icon: entry.icon,
        text: entry.text,
        detail: entry.detail || null,
        time: timeAgo(entry.time, at),
        className: entryClass(entry)
      }))
    : [];

  return (
    <section id="notify-list" class="notify-list" role="dialog" aria-labelledby="notify-title" hidden={!open} ref={list}>
      <div class="notify-head">
        <h2 id="notify-title" tabindex={-1}>Notifications</h2>
        <button type="button" class="btn" data-act="clear" disabled={entries.length === 0} onClick={clear}>Clear</button>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close" title="Close" onClick={close}>
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
    </section>
  );
}
