import { signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNotifications,
  DEFAULT_POPUP_SETTINGS,
  LIST_TIME_REFRESH_MS,
  NOTIFICATIONS_KEPT,
  POPUP_LEAVE_MS,
  POPUP_SETTINGS_KEY,
  readPopupSettings,
  SAMPLE_POPUP_KEY,
  messageTime
} from "../notifications/notifications";
import { createDeviceStore } from "../state/deviceStore";
import { memoryStorage } from "./memoryStorage";

function memoryDevice(saved?: unknown) {
  const values = new Map<string, string>();
  if (saved !== undefined) {
    values.set(`rr_device.${POPUP_SETTINGS_KEY}`, JSON.stringify(saved));
  }
  return createDeviceStore(memoryStorage(values));
}

function setup(saved?: unknown) {
  const relayed: string[] = [];
  const inFullscreen = signal(false);
  const notes = createNotifications({ relay: (line) => relayed.push(line), device: memoryDevice(saved), inFullscreen });
  const shown = () => notes.popups.value.filter((popup) => !popup.leaving).map((popup) => popup.entry.text);
  return { notes, relayed, inFullscreen, shown };
}

describe("notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pops a message up with its kind's icon, keeps it in the list, and relays its text without its second line", () => {
    const { notes, relayed, shown } = setup();
    notes.notify({ kind: "actions", text: "Added to favorites", detail: "clip.mp4", key: "flag" });
    expect(shown()).toEqual(["Added to favorites"]);
    expect(notes.popups.value[0]).toMatchObject({ key: "flag", entry: { icon: "check_circle", detail: "clip.mp4", warning: false } });
    expect(notes.entries.value.map((entry) => entry.text)).toEqual(["Added to favorites"]);
    expect(notes.unread.value).toBe(0);
    expect(relayed).toEqual(["Added to favorites"]);

    notes.notify({ kind: "devices", text: "Blacklisted on another device", detail: "clip.mp4", logText: "Synced elsewhere" });
    expect(relayed.at(-1)).toBe("Synced elsewhere");
    expect(notes.popups.value[1]).toMatchObject({ key: "devices:Blacklisted on another device", entry: { icon: "devices" } });
  });

  it("gives a warning the warning icon, a message its own icon where given, and keeps the newest first", () => {
    const { notes } = setup();
    notes.notify({ kind: "refresh", text: "Library refresh failed", warning: true });
    notes.notify({ kind: "connection", text: "Library browse failed. Showing the tiles already loaded.", icon: "sync_problem", key: "browse" });
    expect(notes.entries.value.map((entry) => [entry.text, entry.icon])).toEqual([
      ["Library browse failed. Showing the tiles already loaded.", "sync_problem"],
      ["Library refresh failed", "warning"]
    ]);
  });

  it("closes a popup after its time, 5 seconds by default, with a short fade", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "actions", text: "Filters applied.", key: "filter" });
    vi.advanceTimersByTime(4_999);
    expect(shown()).toEqual(["Filters applied."]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
    expect(notes.popups.value).toHaveLength(1);
    vi.advanceTimersByTime(POPUP_LEAVE_MS);
    expect(notes.popups.value).toHaveLength(0);
    expect(notes.entries.value).toHaveLength(1);
  });

  it("keeps a warning until it is closed, with Dismiss or at once", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "refresh", text: "Library refresh failed", warning: true, key: "refresh" });
    vi.advanceTimersByTime(60_000);
    expect(shown()).toEqual(["Library refresh failed"]);
    notes.dismiss(notes.popups.value[0]!.id);
    expect(shown()).toEqual([]);
  });

  it("replaces a popup with the same key in its place and starts its time over", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "actions", text: "Added to favorites", key: "flag" });
    notes.notify({ kind: "actions", text: "Filters applied.", key: "filter" });
    vi.advanceTimersByTime(4_000);
    notes.notify({ kind: "actions", text: "Removed from favorites", key: "flag" });
    expect(shown()).toEqual(["Removed from favorites", "Filters applied."]);
    vi.advanceTimersByTime(1_000);
    expect(shown()).toEqual(["Removed from favorites"]);
    vi.advanceTimersByTime(4_000);
    expect(shown()).toEqual([]);
  });

  it("shows three at most, closing the oldest that isn't a warning, and sends a message to the list only while three warnings show", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "refresh", text: "First warning", warning: true });
    notes.notify({ kind: "actions", text: "One" });
    notes.notify({ kind: "actions", text: "Two" });
    notes.notify({ kind: "actions", text: "Three" });
    expect(shown()).toEqual(["First warning", "Two", "Three"]);

    notes.notify({ kind: "refresh", text: "Second warning", warning: true });
    notes.notify({ kind: "refresh", text: "Third warning", warning: true });
    expect(shown()).toEqual(["First warning", "Second warning", "Third warning"]);
    expect(notes.unread.value).toBe(0);

    notes.notify({ kind: "actions", text: "No room" });
    expect(shown()).toEqual(["First warning", "Second warning", "Third warning"]);
    expect(notes.entries.value[0]).toMatchObject({ text: "No room", unread: true });
    expect(notes.unread.value).toBe(1);
  });

  it("pauses a popup's time while a mouse or pen points at it", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "actions", text: "Filters applied." });
    const id = notes.popups.value[0]!.id;
    vi.advanceTimersByTime(2_000);
    notes.hold(id, true);
    vi.advanceTimersByTime(20_000);
    expect(shown()).toEqual(["Filters applied."]);
    notes.hold(id, false);
    // It had 3 seconds left when the pointer came.
    vi.advanceTimersByTime(2_999);
    expect(shown()).toEqual(["Filters applied."]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it("keeps at least 800 ms after a pause, so it doesn't close the moment the pointer leaves", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "actions", text: "Filters applied." });
    const id = notes.popups.value[0]!.id;
    vi.advanceTimersByTime(4_900);
    notes.hold(id, true);
    notes.hold(id, false);
    vi.advanceTimersByTime(799);
    expect(shown()).toEqual(["Filters applied."]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it("pops nothing up while the list is open, closes a popup with a new message's key, and marks what didn't pop up", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "actions", text: "Added to favorites", key: "flag" });
    notes.openList();
    notes.notify({ kind: "actions", text: "Removed from favorites", key: "flag" });
    notes.notify({ kind: "actions", text: "Filters applied.", key: "filter" });
    expect(shown()).toEqual([]);
    expect(notes.unread.value).toBe(0);
    notes.closeList();

    const off = setup({ kinds: { devices: false } });
    off.notes.notify({ kind: "devices", text: "Added to favorites on another device" });
    off.notes.notify({ kind: "actions", text: "Filters applied." });
    expect(off.shown()).toEqual(["Filters applied."]);
    expect(off.notes.unread.value).toBe(1);
    off.notes.openList();
    expect(off.notes.unread.value).toBe(0);
    expect(off.notes.entries.value.map((entry) => [entry.text, entry.highlight])).toEqual([
      ["Filters applied.", false],
      ["Added to favorites on another device", true]
    ]);
    off.notes.closeList();
    expect(off.notes.entries.value.every((entry) => !entry.highlight)).toBe(true);
  });

  it("keeps a notice unmarked with the error icon, relaying nothing, and keeps the last 50 messages", () => {
    const { notes, relayed } = setup();
    notes.record("Saving presets failed.");
    expect(notes.entries.value[0]).toMatchObject({ kind: "notice", icon: "error", text: "Saving presets failed.", unread: false });
    expect(notes.unread.value).toBe(0);
    expect(relayed).toEqual([]);

    for (let i = 0; i < NOTIFICATIONS_KEPT + 5; i++) {
      notes.record(`Notice ${i}`);
    }
    expect(notes.entries.value).toHaveLength(NOTIFICATIONS_KEPT);
    expect(notes.entries.value[0]!.text).toBe(`Notice ${NOTIFICATIONS_KEPT + 4}`);

    notes.clear();
    expect(notes.entries.value).toEqual([]);
  });

  it("moves the list's times on every 30 seconds while it is open", () => {
    const { notes } = setup();
    notes.notify({ kind: "actions", text: "Filters applied." });
    const sent = notes.entries.value[0]!.time;
    notes.openList();
    expect(messageTime(sent, notes.now.value)).toBe("Just now");
    vi.advanceTimersByTime(LIST_TIME_REFRESH_MS * 3);
    expect(messageTime(sent, notes.now.value)).toBe("1 min ago");
    notes.closeList();
    const closedAt = notes.now.value;
    vi.advanceTimersByTime(LIST_TIME_REFRESH_MS * 4);
    expect(notes.now.value).toBe(closedAt);
  });

  it("reads a message's time as Just now, minutes ago, then the time of day", () => {
    const sent = new Date(2026, 9, 13, 10, 0, 0).getTime();
    expect(messageTime(sent, sent + 59_000)).toBe("Just now");
    expect(messageTime(sent, sent + 60_000)).toBe("1 min ago");
    expect(messageTime(sent, sent + 59 * 60_000)).toBe("59 min ago");
    expect(messageTime(sent, sent + 60 * 60_000)).toBe(new Date(sent).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  });

  it("reads the popup settings kept on this device, each field falling back to its default", () => {
    expect(readPopupSettings(memoryDevice())).toEqual(DEFAULT_POPUP_SETTINGS);
    expect(DEFAULT_POPUP_SETTINGS).toEqual({
      popups: true,
      kinds: { actions: true, devices: true, refresh: true, skips: true, connection: true },
      position: "bottom-center",
      fullscreen: true,
      seconds: 5
    });
    expect(readPopupSettings(memoryDevice({ popups: false, kinds: { skips: false, other: false }, position: "top-left", fullscreen: false, seconds: 10 }))).toEqual({
      popups: false,
      kinds: { actions: true, devices: true, refresh: true, skips: false, connection: true },
      position: "top-left",
      fullscreen: false,
      seconds: 10
    });
    expect(readPopupSettings(memoryDevice({ popups: "yes", position: "middle", seconds: 7, kinds: [] }))).toEqual(DEFAULT_POPUP_SETTINGS);
    expect(readPopupSettings(memoryDevice([1, 2]))).toEqual(DEFAULT_POPUP_SETTINGS);
  });

  it("follows Show popups, the kinds that pop up, and Show for", () => {
    const off = setup({ popups: false });
    off.notes.notify({ kind: "actions", text: "Filters applied." });
    expect(off.shown()).toEqual([]);
    expect(off.notes.unread.value).toBe(1);

    const kindOff = setup({ kinds: { devices: false } });
    kindOff.notes.notify({ kind: "devices", text: "Added to favorites on another device" });
    kindOff.notes.notify({ kind: "actions", text: "Filters applied." });
    expect(kindOff.shown()).toEqual(["Filters applied."]);
    expect(kindOff.notes.unread.value).toBe(1);
    expect(kindOff.notes.entries.value.map((entry) => entry.text)).toEqual(["Filters applied.", "Added to favorites on another device"]);

    const short = setup({ seconds: 3 });
    short.notes.notify({ kind: "actions", text: "Filters applied." });
    vi.advanceTimersByTime(3_000);
    expect(short.shown()).toEqual([]);
  });

  it("with Show in fullscreen off, closes the popups on entering fullscreen and sends messages only to the list there", () => {
    const { notes, inFullscreen, shown } = setup({ fullscreen: false });
    notes.notify({ kind: "actions", text: "Filters applied." });
    inFullscreen.value = true;
    expect(shown()).toEqual([]);
    notes.notify({ kind: "actions", text: "Tag editor changes applied" });
    expect(shown()).toEqual([]);
    expect(notes.unread.value).toBe(1);
    inFullscreen.value = false;
    notes.notify({ kind: "actions", text: "Paired." });
    expect(shown()).toEqual(["Paired."]);

    const on = setup();
    on.notes.notify({ kind: "actions", text: "Filters applied." });
    on.inFullscreen.value = true;
    on.notes.notify({ kind: "actions", text: "Paired." });
    expect(on.shown()).toEqual(["Filters applied.", "Paired."]);
  });

  it("changes the popup settings named, a kind at a time, keeps them all on this device, and applies them to the next message", () => {
    const values = new Map<string, string>();
    const device = createDeviceStore(memoryStorage(values));
    const notes = createNotifications({ relay: () => {}, device, inFullscreen: signal(false) });
    const shown = () => notes.popups.value.filter((popup) => !popup.leaving).map((popup) => popup.entry.text);
    notes.notify({ kind: "actions", text: "Filters applied." });

    notes.updateSettings({ kinds: { actions: false } });
    notes.updateSettings({ position: "top-left", seconds: 10 });
    const expected = { ...DEFAULT_POPUP_SETTINGS, kinds: { ...DEFAULT_POPUP_SETTINGS.kinds, actions: false }, position: "top-left", seconds: 10 };
    expect(notes.settings.value).toEqual(expected);
    expect(JSON.parse(values.get(`rr_device.${POPUP_SETTINGS_KEY}`)!)).toEqual(expected);
    expect(readPopupSettings(device)).toEqual(expected);
    // The popup showing stays.
    expect(shown()).toEqual(["Filters applied."]);

    notes.notify({ kind: "actions", text: "Paired." });
    notes.notify({ kind: "connection", text: "Reconnected." });
    expect(shown()).toEqual(["Filters applied.", "Reconnected."]);
    vi.advanceTimersByTime(9_999);
    expect(notes.popups.value.find((popup) => popup.entry.text === "Reconnected.")?.leaving).toBe(false);
    vi.advanceTimersByTime(1);
    expect(notes.popups.value.find((popup) => popup.entry.text === "Reconnected.")?.leaving).toBe(true);

    notes.updateSettings({ popups: false });
    notes.notify({ kind: "connection", text: "Reconnected." });
    expect(notes.popups.value.filter((popup) => !popup.leaving)).toHaveLength(0);
  });

  it("shows a sample popup for the popup time, which a second one replaces, and which the list, the badge, and the log never get", () => {
    const { notes, relayed, shown } = setup();
    notes.preview();
    expect(notes.popups.value).toHaveLength(1);
    expect(notes.popups.value[0]).toMatchObject({
      key: SAMPLE_POPUP_KEY,
      entry: { kind: "sample", icon: "notifications", text: "Popups show here.", detail: "For 5 seconds, unless you point at one or close it.", warning: false }
    });
    expect(notes.entries.value).toEqual([]);
    expect(notes.unread.value).toBe(0);
    expect(relayed).toEqual([]);

    vi.advanceTimersByTime(2_000);
    notes.updateSettings({ seconds: 3 });
    notes.preview();
    expect(shown()).toEqual(["Popups show here."]);
    expect(notes.popups.value[0]!.entry.detail).toBe("For 3 seconds, unless you point at one or close it.");
    // Its time starts over at the new length.
    vi.advanceTimersByTime(2_999);
    expect(shown()).toEqual(["Popups show here."]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
    expect(notes.entries.value).toEqual([]);
  });
});
