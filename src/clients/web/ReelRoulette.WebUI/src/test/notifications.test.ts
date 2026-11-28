import { signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNotifications,
  DEFAULT_POPUP_SETTINGS,
  NOTIFICATIONS_KEPT,
  POPUP_LEAVE_MS,
  POPUP_SETTINGS_KEY,
  readPopupSettings,
  RECENT_MESSAGES_KEY,
  SAMPLE_POPUP_KEY,
  SHOW_SECONDS_KEY,
  type Notifications
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

/** One device's storage, with popup settings kept, where each `page()` starts the notifications as a page that loads does. */
function keptDevice(saved?: unknown) {
  const values = new Map<string, string>();
  if (saved !== undefined) {
    values.set(`rr_device.${POPUP_SETTINGS_KEY}`, JSON.stringify(saved));
  }
  const device = createDeviceStore(memoryStorage(values));
  const page = () => createNotifications({ relay: () => {}, device, inFullscreen: signal(false) });
  const kept = () => JSON.parse(values.get(`rr_device.${RECENT_MESSAGES_KEY}`) ?? "null");
  return { values, page, kept };
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
    notes.notify({ kind: "connection", text: "Library browse failed: Couldn't reach the server. Showing the tiles already loaded.", icon: "sync_problem", key: "browse" });
    expect(notes.entries.value.map((entry) => [entry.text, entry.icon])).toEqual([
      ["Library browse failed: Couldn't reach the server. Showing the tiles already loaded.", "sync_problem"],
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
    notes.hold(id, "pointer", true);
    vi.advanceTimersByTime(20_000);
    expect(shown()).toEqual(["Filters applied."]);
    notes.hold(id, "pointer", false);
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
    notes.hold(id, "pointer", true);
    notes.hold(id, "pointer", false);
    vi.advanceTimersByTime(799);
    expect(shown()).toEqual(["Filters applied."]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it("keeps a popup's time paused while its menu is open, after the pointer leaves, and runs it once nothing holds it", () => {
    const { notes, shown } = setup();
    notes.notify({ kind: "actions", text: "Filters applied." });
    const id = notes.popups.value[0]!.id;
    vi.advanceTimersByTime(1_000);
    notes.hold(id, "pointer", true);
    notes.hold(id, "menu", true);
    notes.hold(id, "pointer", false);
    vi.advanceTimersByTime(20_000);
    expect(shown()).toEqual(["Filters applied."]);

    // Letting go of a hold it doesn't have changes nothing.
    notes.hold(id, "pointer", false);
    vi.advanceTimersByTime(20_000);
    expect(shown()).toEqual(["Filters applied."]);

    notes.hold(id, "menu", false);
    vi.advanceTimersByTime(3_999);
    expect(shown()).toEqual(["Filters applied."]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it("takes one message out of the list, leaving the others", () => {
    const { notes } = setup();
    notes.notify({ kind: "actions", text: "One" });
    notes.notify({ kind: "actions", text: "Two" });
    notes.notify({ kind: "actions", text: "Three" });
    notes.openList();
    const two = notes.entries.value.find((entry) => entry.text === "Two")!;
    notes.removeEntry(two.id);
    expect(notes.entries.value.map((entry) => entry.text)).toEqual(["Three", "One"]);
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

  it("sends a quiet message only to the list, unmarked and uncounted, and relays it, whatever its kind's setting", () => {
    for (const saved of [undefined, { kinds: { refresh: false } }]) {
      const { notes, relayed, shown } = setup(saved);
      notes.notify({ kind: "refresh", text: "Library refresh finished", detail: "No changes", key: "refresh", logText: "Library refresh finished: No changes", quiet: true });
      expect(shown()).toEqual([]);
      expect(notes.unread.value).toBe(0);
      expect(notes.entries.value).toMatchObject([{ text: "Library refresh finished", detail: "No changes", unread: false }]);
      expect(relayed).toEqual(["Library refresh finished: No changes"]);
      notes.openList();
      expect(notes.entries.value[0]!.highlight).toBe(false);
    }
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

  it("keeps the list on this device with each message's read state, so the next page shows it and the badge counts it", () => {
    const { values, page, kept } = keptDevice({ kinds: { devices: false } });
    const first = page();
    expect(values.has(`rr_device.${RECENT_MESSAGES_KEY}`)).toBe(false);

    first.notify({ kind: "devices", text: "Blacklisted on another device", detail: "clip.mp4" });
    vi.advanceTimersByTime(60_000);
    first.notify({ kind: "refresh", text: "Library refresh failed", detail: "Couldn't read the source.", warning: true });
    first.record("Saving presets failed.");
    first.preview();
    const at = new Date(2026, 9, 13, 10, 0, 0).getTime();
    expect(kept()).toEqual([
      { kind: "notice", icon: "error", text: "Saving presets failed.", detail: "", warning: false, time: at + 60_000, unread: false },
      { kind: "refresh", icon: "warning", text: "Library refresh failed", detail: "Couldn't read the source.", warning: true, time: at + 60_000, unread: false },
      { kind: "devices", icon: "devices", text: "Blacklisted on another device", detail: "clip.mp4", warning: false, time: at, unread: true }
    ]);

    const second = page();
    const withoutIds = (notes: Notifications) => notes.entries.value.map(({ id: _id, ...entry }) => entry);
    expect(withoutIds(second)).toEqual(withoutIds(first));
    expect(second.unread.value).toBe(1);
  });

  it("keeps the list as it opens, without the highlight, and as Dismiss and Clear take messages out", () => {
    const { page, kept } = keptDevice({ popups: false });
    const first = page();
    for (const text of ["One", "Two", "Three"]) {
      first.notify({ kind: "actions", text });
    }
    first.openList();
    expect(first.entries.value.map((entry) => entry.highlight)).toEqual([true, true, true]);
    expect(kept().map((entry: Record<string, unknown>) => [entry.text, entry.unread, "highlight" in entry])).toEqual([
      ["Three", false, false],
      ["Two", false, false],
      ["One", false, false]
    ]);

    const second = page();
    expect(second.entries.value.map((entry) => [entry.text, entry.unread, entry.highlight])).toEqual([
      ["Three", false, false],
      ["Two", false, false],
      ["One", false, false]
    ]);
    expect(second.unread.value).toBe(0);

    second.removeEntry(second.entries.value.find((entry) => entry.text === "Two")!.id);
    expect(kept().map((entry: Record<string, unknown>) => entry.text)).toEqual(["Three", "One"]);
    second.clear();
    expect(kept()).toEqual([]);
    expect(page().entries.value).toEqual([]);
  });

  it("gives the kept messages ids of the page's own, so none shares one with a new message", () => {
    const { page } = keptDevice({ popups: false });
    const first = page();
    first.notify({ kind: "actions", text: "One" });
    first.notify({ kind: "actions", text: "Two" });

    const second = page();
    second.notify({ kind: "actions", text: "Three" });
    expect(new Set(second.entries.value.map((entry) => entry.id)).size).toBe(3);
  });

  it("keeps the last 50 for the next page, and the badge counts only the unread messages the list keeps", () => {
    const { page, kept } = keptDevice({ popups: false });
    const first = page();
    for (let i = 0; i < NOTIFICATIONS_KEPT + 5; i++) {
      first.notify({ kind: "actions", text: `Message ${i}` });
    }
    expect(first.unread.value).toBe(NOTIFICATIONS_KEPT);
    expect(kept()).toHaveLength(NOTIFICATIONS_KEPT);

    const second = page();
    expect(second.entries.value).toHaveLength(NOTIFICATIONS_KEPT);
    expect([second.entries.value[0]!.text, second.entries.value.at(-1)!.text]).toEqual([`Message ${NOTIFICATIONS_KEPT + 4}`, "Message 5"]);
    expect(second.unread.value).toBe(NOTIFICATIONS_KEPT);
  });

  it("reads the kept list, leaving out a message whose fields don't check, and nothing from a value that isn't a list", () => {
    const { values, page } = keptDevice();
    const key = `rr_device.${RECENT_MESSAGES_KEY}`;
    const good = { kind: "actions", icon: "check_circle", text: "Filters applied.", detail: "", warning: false, time: Date.now(), unread: true };
    const { icon: _icon, ...noIcon } = good;
    values.set(
      key,
      JSON.stringify([
        good,
        { ...good, kind: "sample" },
        noIcon,
        { ...good, text: 3 },
        { ...good, detail: null },
        { ...good, warning: "yes" },
        { ...good, time: "10:00" },
        { ...good, unread: 1 },
        null,
        "Paired.",
        { ...good, kind: "notice", text: "Saving presets failed." }
      ])
    );
    expect(page().entries.value.map((entry) => entry.text)).toEqual(["Filters applied.", "Saving presets failed."]);

    values.set(key, JSON.stringify(Array.from({ length: NOTIFICATIONS_KEPT + 5 }, (_, i) => ({ ...good, text: `Message ${i}` }))));
    expect(page().entries.value).toHaveLength(NOTIFICATIONS_KEPT);

    values.set(key, JSON.stringify({ entries: [good] }));
    expect(page().entries.value).toEqual([]);
  });

  it("has Show seconds off by default, and keeps it on this device apart from the popup settings", () => {
    const values = new Map<string, string>();
    const device = createDeviceStore(memoryStorage(values));
    const notes = createNotifications({ relay: () => {}, device, inFullscreen: signal(false) });
    expect(notes.showSeconds.value).toBe(false);

    notes.setShowSeconds(true);
    expect(notes.showSeconds.value).toBe(true);
    expect(values.get(`rr_device.${SHOW_SECONDS_KEY}`)).toBe("true");
    expect(values.has(`rr_device.${POPUP_SETTINGS_KEY}`)).toBe(false);
    expect(createNotifications({ relay: () => {}, device, inFullscreen: signal(false) }).showSeconds.value).toBe(true);

    values.set(`rr_device.${SHOW_SECONDS_KEY}`, JSON.stringify("yes"));
    expect(createNotifications({ relay: () => {}, device, inFullscreen: signal(false) }).showSeconds.value).toBe(false);
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
