import { effect, signal, type ReadonlySignal } from "@preact/signals";
import { isBoolean, isRecord, type DeviceStore } from "../state/deviceStore";

/** The kinds of one-off message, each of which the popup settings can turn off. */
export type NotificationKind = "actions" | "devices" | "refresh" | "skips" | "connection";

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ["actions", "devices", "refresh", "skips", "connection"];

/** Each kind's Material Symbols icon, and the icon of a notice the list keeps. */
export const NOTIFICATION_ICONS: Readonly<Record<NotificationKind | "notice", string>> = {
  actions: "check_circle",
  devices: "devices",
  refresh: "autorenew",
  skips: "fast_forward",
  connection: "cloud_done",
  notice: "error"
};

export type PopupPosition = "bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "top-left" | "top-right";

export const POPUP_POSITIONS: readonly PopupPosition[] = ["bottom-center", "bottom-left", "bottom-right", "top-center", "top-left", "top-right"];

/** What pops up, where, and for how long, kept per device. The Settings tab's Notifications section sets them. */
export interface PopupSettings {
  popups: boolean;
  kinds: Record<NotificationKind, boolean>;
  position: PopupPosition;
  /** Popups show in fullscreen too. */
  fullscreen: boolean;
  /** How long a popup that isn't a warning shows, in seconds: 3, 5, or 10. */
  seconds: number;
}

export const DEFAULT_POPUP_SETTINGS: Readonly<PopupSettings> = {
  popups: true,
  kinds: { actions: true, devices: true, refresh: true, skips: true, connection: true },
  position: "bottom-center",
  fullscreen: true,
  seconds: 5
};

/** The per-device store's key for the popup settings. */
export const POPUP_SETTINGS_KEY = "notifications.popups";

/** The per-device store's key for Show seconds, kept apart from the popup settings, which Show popups turns off. */
export const SHOW_SECONDS_KEY = "notifications.showSeconds";

/** A change to the popup settings: the settings it names, and the kinds it names, each in turn. */
export type PopupSettingsChange = Partial<Omit<PopupSettings, "kinds">> & { kinds?: Partial<Record<NotificationKind, boolean>> };

/** The sample popup's key, so a second sample replaces the one showing. */
export const SAMPLE_POPUP_KEY = "preview";

/** The sample popup's second line, for a popup time of `seconds`. */
export function samplePopupDetail(seconds: number): string {
  return `For ${seconds} seconds, unless you point at one or close it.`;
}

/** How many messages the list keeps, for the page's life. */
export const NOTIFICATIONS_KEPT = 50;

/** How many popups show at once. */
export const POPUPS_AT_ONCE = 3;

/** A popup whose time is paused keeps at least this much, so it doesn't close the moment the pointer leaves it. */
export const POPUP_PAUSE_FLOOR_MS = 800;

/** How long a closing popup takes to fade, before it goes. */
export const POPUP_LEAVE_MS = 160;

/** A message the list keeps. */
export interface NotificationEntry {
  id: number;
  /** A notice the list keeps reads as "notice", and the sample popup, which the list never keeps, as "sample". */
  kind: NotificationKind | "notice" | "sample";
  icon: string;
  text: string;
  /** A second line, such as the file name, or empty. */
  detail: string;
  /** A warning, such as a failed refresh, which stays until it is closed. */
  warning: boolean;
  /** When it came, as `Date.now()` gives it. */
  time: number;
  /** It didn't pop up, and the list hasn't been open since. */
  unread: boolean;
  /** The list marks it as one that didn't pop up, while the list is open. */
  highlight: boolean;
}

/** A popup showing, or fading as it closes. */
export interface Popup {
  id: number;
  /** A popup with the same key replaces it. */
  key: string;
  entry: NotificationEntry;
  /** It is fading out. */
  leaving: boolean;
}

/** What holds a popup's time: a mouse or pen pointing at it, or its menu being open. */
export type PopupHold = "pointer" | "menu";

export interface NotifyRequest {
  kind: NotificationKind;
  text: string;
  /** A second line, such as the file name. */
  detail?: string;
  /** A popup with the same key replaces the one showing; it defaults to the kind and the text. */
  key?: string;
  /** A warning stays until it is closed, and the cap never closes one. */
  warning?: boolean;
  /** Its own icon, where the kind's would misread it, such as a failure of a kind whose icon reads as success. */
  icon?: string;
  /** What `last.log` gets in place of `text`, such as a text that leaves out a file name. */
  logText?: string;
  /**
   * It goes only to the list, unmarked: it doesn't pop up, and the badge doesn't count it, as an automatic refresh
   * with no library changes.
   */
  quiet?: boolean;
}

/**
 * The page's one-off messages, which pop up briefly as the popup settings allow, and the list behind the player's bell,
 * which keeps every one of them and every in-app notice. Lasting states show on the player's indicator instead, and
 * the list's Now shows them; field problems show in their fields.
 */
export interface Notifications {
  /** The messages kept, newest first. */
  readonly entries: ReadonlySignal<readonly NotificationEntry[]>;
  /** The one-off messages that didn't pop up since the list was last open, which the bell's badge counts. */
  readonly unread: ReadonlySignal<number>;
  /** The popups showing, oldest first, so the newest sits nearest the edge they come from. */
  readonly popups: ReadonlySignal<readonly Popup[]>;
  readonly listOpen: ReadonlySignal<boolean>;
  readonly settings: ReadonlySignal<PopupSettings>;
  /** Show seconds, off by default: the list's times read HH:MM:SS in place of HH:MM. */
  readonly showSeconds: ReadonlySignal<boolean>;
  setShowSeconds(on: boolean): void;
  /** A one-off message: it pops up if its kind is on, unless it is quiet, and the list keeps it either way. It relays its text. */
  notify(request: NotifyRequest): void;
  /** Keeps a notice in the list, unmarked, since the user saw it in its dialog. It relays nothing; the notice did. */
  record(text: string): void;
  /** Opens the list: the messages that didn't pop up show marked, and the badge empties. */
  openList(): void;
  closeList(): void;
  /** Empties the list. */
  clear(): void;
  /** Takes one message out of the list, as its menu's Dismiss does. */
  removeEntry(id: number): void;
  /** Closes a popup, with its fade, or at once. */
  dismiss(id: number, atOnce?: boolean): void;
  /** Holds a popup's time, or lets it go: it pauses while anything holds it, and runs again once nothing does. */
  hold(id: number, by: PopupHold, held: boolean): void;
  /**
   * Changes the popup settings, keeps them on this device, and applies them at once: the popups' position, and for the
   * next message, whether and for which kinds popups show, in fullscreen too, and for how long. Popups showing stay.
   */
  updateSettings(change: PopupSettingsChange): void;
  /**
   * Shows the sample popup where popups show and for as long, as a change to the position or the time does. The list
   * doesn't keep it, the badge doesn't count it, and nothing is relayed; a second one replaces the one showing.
   */
  preview(): void;
}

export interface NotificationsOptions {
  /** Sends a message's text to `last.log` as a `status=` line. */
  relay: (logText: string) => void;
  /** Where the popup settings and Show seconds are kept. */
  device: DeviceStore;
  /** The stage is in fullscreen, native or pseudo. */
  inFullscreen: ReadonlySignal<boolean>;
}

/** The popup settings kept on this device, each field falling back to its default. */
export function readPopupSettings(device: DeviceStore): PopupSettings {
  const saved = device.read<Record<string, unknown> | null>(POPUP_SETTINGS_KEY, null, isRecord) ?? {};
  const kinds = { ...DEFAULT_POPUP_SETTINGS.kinds };
  const savedKinds = isRecord(saved.kinds) ? saved.kinds : {};
  for (const kind of NOTIFICATION_KINDS) {
    if (typeof savedKinds[kind] === "boolean") {
      kinds[kind] = savedKinds[kind] as boolean;
    }
  }
  return {
    popups: typeof saved.popups === "boolean" ? saved.popups : DEFAULT_POPUP_SETTINGS.popups,
    kinds,
    position: POPUP_POSITIONS.includes(saved.position as PopupPosition) ? (saved.position as PopupPosition) : DEFAULT_POPUP_SETTINGS.position,
    fullscreen: typeof saved.fullscreen === "boolean" ? saved.fullscreen : DEFAULT_POPUP_SETTINGS.fullscreen,
    seconds: [3, 5, 10].includes(saved.seconds as number) ? (saved.seconds as number) : DEFAULT_POPUP_SETTINGS.seconds
  };
}

/** A popup's time: what it has left, whether it is counting down, and what holds it paused. */
interface PopupTime {
  remaining: number;
  running: boolean;
  started: number;
  holds: Set<PopupHold>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export function createNotifications(options: NotificationsOptions): Notifications {
  const entries = signal<readonly NotificationEntry[]>([]);
  const unread = signal(0);
  const popups = signal<readonly Popup[]>([]);
  const listOpen = signal(false);
  const settings = signal(readPopupSettings(options.device));
  const showSeconds = signal(options.device.read(SHOW_SECONDS_KEY, false, isBoolean));
  const times = new Map<number, PopupTime>();
  let lastId = 0;

  const showing = (): readonly Popup[] => popups.peek().filter((popup) => !popup.leaving);

  function add(entry: NotificationEntry): void {
    entries.value = [entry, ...entries.peek()].slice(0, NOTIFICATIONS_KEPT);
  }

  function run(id: number): void {
    const time = times.get(id);
    if (!time || time.remaining === 0 || time.holds.size > 0) {
      return;
    }
    time.started = Date.now();
    time.running = true;
    clearTimeout(time.timer);
    time.timer = setTimeout(() => dismiss(id), time.remaining);
  }

  /** Takes off only the time since it last ran. */
  function pause(id: number): void {
    const time = times.get(id);
    if (!time?.running) {
      return;
    }
    time.running = false;
    clearTimeout(time.timer);
    time.remaining = Math.max(POPUP_PAUSE_FLOOR_MS, time.remaining - (Date.now() - time.started));
  }

  function startTime(id: number, warning: boolean): void {
    const time = times.get(id) ?? { remaining: 0, running: false, started: 0, holds: new Set<PopupHold>(), timer: undefined };
    times.set(id, time);
    clearTimeout(time.timer);
    time.running = false;
    // A warning stays until it is closed.
    time.remaining = warning ? 0 : settings.peek().seconds * 1000;
    run(id);
  }

  function dismiss(id: number, atOnce = false): void {
    const popup = popups.peek().find((candidate) => candidate.id === id);
    if (!popup || popup.leaving) {
      return;
    }
    const time = times.get(id);
    clearTimeout(time?.timer);
    times.delete(id);
    popups.value = popups.peek().map((candidate) => (candidate.id === id ? { ...candidate, leaving: true } : candidate));
    setTimeout(() => {
      popups.value = popups.peek().filter((candidate) => candidate.id !== id);
    }, atOnce ? 0 : POPUP_LEAVE_MS);
  }

  /** While three warnings show, there is no room for a new popup, unless it replaces one with the same key. */
  function hasRoom(key: string): boolean {
    const shown = showing();
    return shown.some((popup) => popup.key === key) || shown.filter((popup) => popup.entry.warning).length < POPUPS_AT_ONCE;
  }

  function show(entry: NotificationEntry, key: string): void {
    // A popup with the same key, such as a second favorite change, replaces the one showing in its place and starts
    // its time over.
    const same = showing().find((popup) => popup.key === key);
    if (same) {
      popups.value = popups.peek().map((popup) => (popup.id === same.id ? { ...popup, entry } : popup));
      startTime(same.id, entry.warning);
      return;
    }
    const popup: Popup = { id: entry.id, key, entry, leaving: false };
    popups.value = [...popups.peek(), popup];
    startTime(popup.id, entry.warning);
    // The cap never closes a warning: it closes the oldest popups that aren't one.
    const shown = showing();
    const excess = shown.length - POPUPS_AT_ONCE;
    if (excess > 0) {
      shown
        .filter((candidate) => !candidate.entry.warning)
        .slice(0, excess)
        .forEach((candidate) => dismiss(candidate.id, true));
    }
  }

  function notify(request: NotifyRequest): void {
    const warning = !!request.warning;
    const entry: NotificationEntry = {
      id: ++lastId,
      kind: request.kind,
      icon: request.icon || (warning ? "warning" : NOTIFICATION_ICONS[request.kind]),
      text: request.text,
      detail: request.detail ?? "",
      warning,
      time: Date.now(),
      unread: false,
      highlight: false
    };
    options.relay(request.logText ?? request.text);
    const key = request.key || `${request.kind}:${request.text}`;
    const current = settings.peek();
    const open = listOpen.peek();
    const pops =
      !request.quiet &&
      current.popups &&
      current.kinds[request.kind] &&
      !open &&
      (current.fullscreen || !options.inFullscreen.peek()) &&
      hasRoom(key);
    if (!pops && !open && !request.quiet) {
      entry.unread = true;
      unread.value = unread.peek() + 1;
    }
    add(entry);
    if (pops) {
      show(entry, key);
    } else if (open) {
      // While the list is open nothing pops up, so a popup showing with this key would be out of date: it closes, and
      // the list shows the new message.
      showing()
        .filter((popup) => popup.key === key)
        .forEach((popup) => dismiss(popup.id));
    }
  }

  function closeList(): void {
    if (!listOpen.peek()) {
      return;
    }
    listOpen.value = false;
    entries.value = entries.peek().map((entry) => (entry.highlight ? { ...entry, highlight: false } : entry));
  }

  function openList(): void {
    if (listOpen.peek()) {
      return;
    }
    entries.value = entries.peek().map((entry) => ({ ...entry, highlight: entry.unread, unread: false }));
    unread.value = 0;
    listOpen.value = true;
  }

  // With Show in fullscreen off, entering fullscreen closes the popups showing.
  let wasInFullscreen = options.inFullscreen.peek();
  effect(() => {
    const inFullscreen = options.inFullscreen.value;
    if (inFullscreen && !wasInFullscreen && !settings.peek().fullscreen) {
      showing().forEach((popup) => dismiss(popup.id, true));
    }
    wasInFullscreen = inFullscreen;
  });

  return {
    entries,
    unread,
    popups,
    listOpen,
    settings,
    showSeconds,
    notify,

    record(text) {
      add({
        id: ++lastId,
        kind: "notice",
        icon: NOTIFICATION_ICONS.notice,
        text,
        detail: "",
        warning: false,
        time: Date.now(),
        unread: false,
        highlight: false
      });
    },

    openList,
    closeList,

    clear() {
      entries.value = [];
      unread.value = 0;
    },

    removeEntry(id) {
      entries.value = entries.peek().filter((entry) => entry.id !== id);
    },

    dismiss,

    hold(id, by, held) {
      const time = times.get(id);
      if (!time) {
        return;
      }
      if (held) {
        time.holds.add(by);
        pause(id);
      } else if (time.holds.delete(by)) {
        run(id);
      }
    },

    updateSettings(change) {
      const current = settings.peek();
      const next: PopupSettings = { ...current, ...change, kinds: { ...current.kinds, ...change.kinds } };
      settings.value = next;
      options.device.write(POPUP_SETTINGS_KEY, next);
    },

    setShowSeconds(on) {
      showSeconds.value = on;
      options.device.write(SHOW_SECONDS_KEY, on);
    },

    preview() {
      const entry: NotificationEntry = {
        id: ++lastId,
        kind: "sample",
        icon: "notifications",
        text: "Popups show here.",
        detail: samplePopupDetail(settings.peek().seconds),
        warning: false,
        time: Date.now(),
        unread: false,
        highlight: false
      };
      show(entry, SAMPLE_POPUP_KEY);
    }
  };
}
