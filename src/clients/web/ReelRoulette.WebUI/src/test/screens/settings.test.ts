// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPATIBLE_VERSION,
  currentStyle,
  DESKTOP_USER_AGENT,
  FakeServer,
  flagAnswer,
  IPHONE_USER_AGENT,
  json,
  mountPage,
  pageReady,
  popupsShown,
  randomAnswer,
  resetPage,
  setViewport,
  settle,
  stubCanvas,
  stubColorScheme,
  stubElementProperty,
  stubLayoutSize,
  stubReducedMotion,
  tapPage,
  useStylesheet,
  type FakeGain,
  type MountedPage
} from "./pageHarness";
import { COMPRESSION_GLIDE_SECONDS } from "../../playback/audioStage";
import { COMPRESSION_PRESETS, compressionGainDb, webAudioMakeupDb } from "../../playback/compression";
import { FADE_MS } from "../../ui/FieldValidation";
import { SETTING_SAVED_MS } from "../../validation/fieldValidation";

const VIDEO_ITEM = {
  id: "C:\\media\\clip 1.mp4",
  itemId: "item-1",
  displayName: "clip 1.mp4",
  mediaType: "video",
  durationSeconds: 60,
  mediaUrl: "/api/media/item-1?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const PHOTO_ITEM = {
  id: "C:\\media\\beach.jpg",
  itemId: "item-photo",
  displayName: "beach.jpg",
  mediaType: "photo",
  durationSeconds: null,
  mediaUrl: "/api/media/item-photo?token=t",
  isFavorite: false,
  isBlacklisted: false
};

/** The app's version as the repository's `.version` file has it, without its leading `v`. */
const RELEASE_VERSION = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../../.version"), "utf8")
  .trim()
  .replace(/^v/, "");

const PHONE_VIEWPORT = { width: 600, height: 800 };

beforeEach(() => {
  resetPage();
});

/** Mounts the page and waits until it has found the server ready. */
async function mount(server = new FakeServer()): Promise<MountedPage> {
  const page = mountPage({ server });
  await pageReady(server);
  await settle();
  return page;
}

async function click(element: Element): Promise<void> {
  fireEvent.click(element);
  await settle();
}

function tab(name: string): HTMLElement {
  return screen.getByRole("tab", { name, hidden: true });
}

/** Opens the panel on the Settings tab. */
async function openSettings(): Promise<void> {
  await click(tab("Settings"));
}

function settingsPage(): HTMLElement {
  return document.getElementById("panel-page-settings")!;
}

function advanceAfter(): HTMLInputElement {
  return within(settingsPage()).getByRole("textbox", { name: "Advance after", hidden: true }) as HTMLInputElement;
}

function radio(name: string): HTMLInputElement {
  return within(settingsPage()).getByRole("radio", { name, hidden: true }) as HTMLInputElement;
}

/** A radio button of the group `group` names, for a choice another group has too, such as Never. */
function radioOf(group: string, name: string): HTMLInputElement {
  return within(within(settingsPage()).getByRole("radiogroup", { name: group, hidden: true })).getByRole("radio", { name, hidden: true }) as HTMLInputElement;
}

/** One of Theme's options, apart from Compression's Strength, which has a Light too. */
function themeRadio(name: string): HTMLInputElement {
  const group = within(settingsPage()).getByRole("radiogroup", { name: "Theme", hidden: true });
  return within(group).getByRole("radio", { name, hidden: true }) as HTMLInputElement;
}

function type(input: HTMLInputElement, text: string): void {
  fireEvent.input(input, { target: { value: text } });
}

/** What a flagged field's tooltip says, or null while the field shows no red icon, as while it fades out. */
function problemOf(input: HTMLInputElement): string | null {
  const field = input.closest(".vfield")!;
  return field.querySelector(".vfield-icon:not(.is-fading-out)") ? field.querySelector(".vfield-tip")!.textContent : null;
}

/**
 * The hint a setting's control shows: the line under a choice's title, or the hint right under a checkbox's row, a
 * group of choices, or a field's row. Null while it shows none.
 */
function hintOf(control: HTMLElement): string | null {
  const line = control.closest("label")?.querySelector("small");
  if (line) {
    return line.textContent;
  }
  const row = control.matches('input[type="checkbox"]') ? control.closest(".choice-row") : control.matches('input[type="text"]') ? control.closest(".filter-row") : control;
  const hint = row?.nextElementSibling;
  return hint?.matches(".setting-hint") ? hint.textContent : null;
}

/** The player's volume slider, at the end of the seek row. */
function volumeSlider(): HTMLInputElement {
  return within(document.getElementById("media-container")!).getByRole("slider", { name: "Volume", hidden: true }) as HTMLInputElement;
}

function playerButton(name: string): HTMLButtonElement {
  return within(document.getElementById("media-container")!).getByRole("button", { name, hidden: true }) as HTMLButtonElement;
}

/** The icon Play/Pause shows: `pause` while what shows plays. */
function playIcon(): string | null {
  return playerButton("Play/Pause").querySelector(".material-symbol-icon")!.textContent;
}

function video(): HTMLVideoElement {
  return document.getElementById("video") as HTMLVideoElement;
}

/** Diagnostics' rows, by their labels. */
function diagnostics(): Record<string, string> {
  const list = settingsPage().querySelector("dl.diag")!;
  const terms = Array.from(list.querySelectorAll("dt"));
  return Object.fromEntries(terms.map((term) => [term.textContent, term.nextElementSibling!.textContent]));
}

/** Advance after as kept on this device, or null while nothing is kept. */
function kept(): string | null {
  return localStorage.getItem("rr_device.playback.advanceAfter");
}

/**
 * Fakes the timers and the clock a photo's timer reads from here on, so a test passes the time a setting's field waits
 * for typing to pause, or a photo shows.
 */
function fakeTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
}

/** The tab row's Close, since the panel button is named Close panel too while the panel is open. */
function closePanel(): void {
  fireEvent.click(document.getElementById("panel-close-btn")!);
}

/** Lets pending replies and renders finish under fake timers. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function storageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    keys.push(localStorage.key(i) ?? "");
  }
  return keys.sort();
}

describe("the Settings tab", () => {
  it("is in the panel's tab row, and the header has no photo duration and no settings icon", async () => {
    await mount();
    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("textbox")).toBeNull();
    expect(within(header).queryByRole("spinbutton")).toBeNull();
    expect(within(header).queryByText(/photo duration/i)).toBeNull();
    expect(within(header).queryByRole("button", { name: /settings/i })).toBeNull();

    await openSettings();
    expect(settingsPage().hidden).toBe(false);
    expect(tab("Settings").getAttribute("aria-selected")).toBe("true");
  });

  it("shows Playback, Audio, Player controls, Appearance, Notifications, Panel, Keyboard shortcuts, and Diagnostics, in that order, then says settings apply at once, with no Save", async () => {
    await mount();
    await openSettings();
    const headings = within(settingsPage()).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Playback", "Audio", "Player controls", "Appearance", "Notifications", "Panel", "Keyboard shortcuts", "Diagnostics"]);
    expect(within(settingsPage()).getByText("Settings apply at once and are kept on this device.")).toBeTruthy();
    // Loudness normalization settings' and Ambient mode settings' Reset to defaults and Custom's Reset to Medium are the
    // tab's only buttons.
    expect(within(settingsPage()).queryAllByRole("button", { hidden: true }).map((button) => [button.id, button.textContent])).toEqual([
      ["settings-loudness-reset", "Reset to defaults"],
      ["settings-compression-reset", "Reset to Medium"],
      ["settings-ambient-reset", "Reset to defaults"]
    ]);
  });

  it("has no entry that turns Loop, Autoplay, or Mute on or off, which the player's buttons do, and no key badge outside the shortcut reference", async () => {
    await mount();
    await openSettings();
    expect(within(settingsPage()).queryByRole("checkbox", { name: /^(loop|autoplay|mute)$/i, hidden: true })).toBeNull();
    const badges = Array.from(settingsPage().querySelectorAll("kbd"));
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.filter((badge) => !badge.closest(".shortcut-list"))).toEqual([]);
  });
});

describe("Enhanced audio", () => {
  it("sits in Audio, right after Playback, on until turned off, with its hint", async () => {
    await mount();
    await openSettings();
    const box = checkbox("Enhanced audio");
    const section = box.closest("section")!;
    expect(section.querySelector("h3")!.textContent).toBe("Audio");
    expect(section.previousElementSibling?.querySelector("h3")?.textContent).toBe("Playback");
    expect(box.checked).toBe(true);
    expect(hintOf(box)).toBe(
      "Processes audio in the app, for loudness normalization and compression."
    );
  });

  it("keeps Enhanced audio and the volume after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    moveSlider(volumeSlider(), 35);
    await click(checkbox("Enhanced audio"));
    expect(checkbox("Enhanced audio").checked).toBe(false);
    page.unmount();

    await mount();
    expect(volumeSlider().value).toBe("35");
    await openSettings();
    expect(checkbox("Enhanced audio").checked).toBe(false);
  });
});

describe("Volume step", () => {
  it("sits first in Audio, before Enhanced audio, offering 1, 2, 5, and 10 percent, 5 until chosen, with its hint", async () => {
    await mount();
    await openSettings();
    const group = within(settingsPage()).getByRole("radiogroup", { name: "Volume step", hidden: true });
    const section = group.closest("section")!;
    expect(section.querySelector("h3")!.textContent).toBe("Audio");
    const settings = Array.from(section.querySelectorAll(":scope > .setting"));
    expect(settings[0]!.contains(group)).toBe(true);
    expect(settings[1]!.contains(checkbox("Enhanced audio"))).toBe(true);
    const names = within(group).getAllByRole("radio", { hidden: true }).map((choice) => document.getElementById(choice.getAttribute("aria-labelledby")!)!.textContent);
    expect(names).toEqual(["1%", "2%", "5%", "10%"]);
    expect(names.map((name) => radio(name!).checked)).toEqual([false, false, true, false]);
    expect(hintOf(group)).toBe("Also for the scroll wheel and a two-finger drag over the player.");
  });

  it("sets the step the scroll wheel takes, and is kept after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    await click(radio("10%"));
    moveSlider(volumeSlider(), 50);
    fireEvent.wheel(document.getElementById("media-container")!, { deltaY: -100 });
    await settle();
    expect(volumeSlider().value).toBe("60");
    page.unmount();

    await mount();
    await openSettings();
    expect(radio("10%").checked).toBe(true);
  });
});

describe("Loudness normalization", () => {
  /** A video at -30 LUFS with its peak at -20 dBTP, which a boost of up to 25 dB, with the allowance, doesn't clip. */
  const QUIET_VIDEO = { ...VIDEO_ITEM, integratedLoudness: -30, peakDb: -20 };

  /** A server whose library's baseline is -27.8 LUFS, and whose random pick is `item`. */
  function serverWith(item: unknown = QUIET_VIDEO): FakeServer {
    const server = new FakeServer();
    server.on("GET", "/api/library/stats", () => json({ global: { baselineLoudnessLufs: -27.8 }, sources: [] }));
    server.on("POST", "/api/random", () => randomAnswer(item));
    return server;
  }

  function loudnessBox(): HTMLInputElement {
    return checkbox("Loudness normalization");
  }

  function loudnessSettings(): HTMLDetailsElement {
    return document.getElementById("settings-loudness-more") as HTMLDetailsElement;
  }

  function manualTarget(): HTMLInputElement {
    return within(settingsPage()).getByRole("textbox", { name: "Target", hidden: true }) as HTMLInputElement;
  }

  function boostLimit(): HTMLInputElement {
    return within(settingsPage()).getByRole("textbox", { name: "Boost quiet videos by up to", hidden: true }) as HTMLInputElement;
  }

  function enter(input: HTMLInputElement, text: string): void {
    type(input, text);
    fireEvent.keyDown(input, { key: "Enter" });
  }

  /** The settings as this device keeps them, or null while it keeps none. */
  function keptSettings(): Record<string, unknown> | null {
    const raw = localStorage.getItem("rr_device.audio.normalizationSettings");
    return raw === null ? null : JSON.parse(raw);
  }

  const gain = (db: number) => Math.pow(10, db / 20);

  it("sits in Audio right under Enhanced audio, on by default, with its hint, and its settings beside it, closed at first", async () => {
    await mount(serverWith());
    await openSettings();
    const box = loudnessBox();
    expect([box.checked, box.disabled]).toEqual([true, false]);
    expect(hintOf(box)).toBe("Evens out loudness between videos.");
    expect(box.closest(".setting")!.previousElementSibling).toBe(checkbox("Enhanced audio").closest(".setting"));
    const more = loudnessSettings();
    expect(more.open).toBe(false);
    expect(more.querySelector("summary")!.textContent).toBe("chevron_rightLoudness normalization settings");
    expect(box.closest(".setting")!.contains(more)).toBe(true);
  });

  it("offers Automatic, the library's baseline, by default, Quieter, Standard, Louder, and Manual, a 15 dB boost limit, and Allow limiting on", async () => {
    await mount(serverWith());
    await openSettings();
    const choices = ["Automatic", "Quieter", "Standard", "Louder", "Manual"].map((name) => [name, radio(name).checked, hintOf(radio(name))]);
    expect(choices).toEqual([
      ["Automatic", true, "The library's baseline, -27.8 LUFS."],
      ["Quieter", false, "-23 LUFS"],
      ["Standard", false, "-18 LUFS"],
      ["Louder", false, "-14 LUFS"],
      ["Manual", false, null]
    ]);
    expect(radio("Automatic").closest('[role="radiogroup"]')!.getAttribute("aria-labelledby")).toBe("settings-loudness-target-label");
    expect(document.getElementById("settings-loudness-target-label")!.textContent).toBe("Target loudness");
    expect(boostLimit().value).toBe("15");
    expect(boostLimit().getAttribute("inputmode")).toBe("numeric");
    const limiting = checkbox("Allow limiting");
    expect(limiting.checked).toBe(true);
    expect(hintOf(limiting)).toBe("Lets quiet videos with loud moments get louder by limiting those moments.");
  });

  it("says only the library's baseline under Automatic until its loudness loads", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/library/stats", () => json({}, 500));
    await mount(server);
    await openSettings();
    expect(hintOf(radio("Automatic"))).toBe("The library's baseline.");
  });

  it("shows Manual's target only while Manual is chosen, starting at -18 LUFS, with the full keyboard, since its values are negative", async () => {
    await mount(serverWith());
    await openSettings();
    const manual = document.getElementById("settings-loudness-manual")!;
    expect(manual.hidden).toBe(true);
    await click(radio("Manual"));
    expect(manual.hidden).toBe(false);
    expect(radio("Manual").closest('[role="radiogroup"]')!.contains(manual)).toBe(true);
    expect(manualTarget().value).toBe("-18");
    expect(manualTarget().hasAttribute("inputmode")).toBe(false);
    await click(radio("Standard"));
    expect(manual.hidden).toBe(true);
    expect(keptSettings()?.target).toBe("standard");
  });

  it("flags a target outside -50 to -10 LUFS and a boost limit that isn't a whole number from 0 to 24 dB, keeping none of them", async () => {
    await mount(serverWith());
    await openSettings();
    await click(radio("Manual"));
    for (const text of ["-5", "-51", "", "abc"]) {
      enter(manualTarget(), text);
      await settle();
      expect([text, problemOf(manualTarget())]).toEqual([text, "Use a number from -50 to -10 LUFS."]);
    }
    for (const text of ["25", "2.5", "-1", ""]) {
      enter(boostLimit(), text);
      await settle();
      expect([text, problemOf(boostLimit())]).toEqual([text, "Use a whole number from 0 to 24 dB."]);
    }
    fireEvent.blur(boostLimit());
    await settle();
    expect([boostLimit().value, problemOf(boostLimit())]).toEqual(["15", null]);
    expect(keptSettings()).toEqual({ target: "manual", manualTarget: -18, boostLimit: 15, allowLimiting: true });

    enter(manualTarget(), "-30.5");
    enter(boostLimit(), "6");
    await settle();
    expect(keptSettings()).toEqual({ target: "manual", manualTarget: -30.5, boostLimit: 6, allowLimiting: true });
  });

  it("is disabled with its settings while Enhanced audio is off, saying it needs Enhanced audio, and stays as it was", async () => {
    await mount(serverWith());
    await openSettings();
    await click(checkbox("Enhanced audio"));
    const box = loudnessBox();
    expect([box.checked, box.disabled]).toEqual([true, true]);
    expect(hintOf(box)).toBe("Needs Enhanced audio.");
    expect((loudnessSettings().querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect([radio("Standard").disabled, checkbox("Allow limiting").disabled]).toEqual([true, true]);
    expect((document.getElementById("settings-loudness-reset") as HTMLButtonElement).disabled).toBe(true);

    await click(checkbox("Enhanced audio"));
    expect([loudnessBox().checked, loudnessBox().disabled, hintOf(loudnessBox())]).toEqual([true, false, "Evens out loudness between videos."]);
    expect((loudnessSettings().querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
  });

  it("Reset to defaults puts every setting back and shows them in the fields, leaving normalization off", async () => {
    await mount(serverWith());
    await openSettings();
    await click(loudnessBox());
    await click(radio("Manual"));
    enter(manualTarget(), "-30");
    enter(boostLimit(), "6");
    await click(checkbox("Allow limiting"));
    // A value that is not valid, typed and not left, goes too.
    type(manualTarget(), "-5");

    await click(document.getElementById("settings-loudness-reset")!);
    expect(radio("Automatic").checked).toBe(true);
    expect(document.getElementById("settings-loudness-manual")!.hidden).toBe(true);
    expect([manualTarget().value, problemOf(manualTarget()), boostLimit().value]).toEqual(["-18", null, "15"]);
    expect(checkbox("Allow limiting").checked).toBe(true);
    // No field shows it saved: a check left from an earlier save fades out.
    expect(settingsPage().querySelector("#settings-loudness-more .vfield-saved:not(.is-fading-out)")).toBeNull();
    expect(keptSettings()).toEqual({ target: "automatic", manualTarget: -18, boostLimit: 15, allowLimiting: true });
    expect(loudnessBox().checked).toBe(false);
  });

  it("keeps normalization and each of its settings after a page refresh", async () => {
    const page = await mount(serverWith());
    await openSettings();
    await click(loudnessBox());
    await click(radio("Manual"));
    enter(manualTarget(), "-30.5");
    enter(boostLimit(), "6");
    await click(checkbox("Allow limiting"));
    page.unmount();

    await mount(serverWith());
    await openSettings();
    expect([loudnessBox().checked, radio("Manual").checked, manualTarget().value, boostLimit().value, checkbox("Allow limiting").checked]).toEqual([
      false,
      true,
      "-30.5",
      "6",
      false
    ]);
  });

  it("applies at once to the playing video: its gain follows the rule toward the target, gliding as a setting changes, through the limiter", async () => {
    const page = await mount(serverWith());
    await tapPage();
    fireEvent.click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await settle();
    const normalization = () => page.webAudio.normalization!;
    // Toward Automatic's -27.8 LUFS, a boost of 2.2 dB, set while the video starts silent.
    expect(normalization().calls.filter(([kind]) => kind === "set").at(-1)![1]).toBeCloseTo(gain(2.2), 9);
    expect(page.webAudio.chain()).toHaveLength(6);
    // Compression's compressor, off, then the limiter.
    expect(
      page.webAudio.contexts.at(-1)!.compressors.map((compressor) => [compressor.threshold.value, compressor.knee.value, compressor.ratio.value, compressor.attack.value])
    ).toEqual([
      [0, 0, 1, 0.005],
      [-1, 0, 20, 0]
    ]);

    await openSettings();
    await click(radio("Standard"));
    expect(normalization().calls.at(-1)).toEqual(["glide", gain(12), expect.any(Number)]);
    enter(boostLimit(), "6");
    await settle();
    expect(normalization().calls.at(-1)).toEqual(["glide", gain(6), expect.any(Number)]);
    await click(loudnessBox());
    expect(normalization().calls.at(-1)).toEqual(["glide", 1, expect.any(Number)]);
    // The limiter stays in the chain, and nothing jumped.
    expect(page.webAudio.chain()).toHaveLength(6);
    expect(normalization().directSets).toBe(0);
  });
});

describe("Compression", () => {
  const MEDIUM_TEXTS = ["-24", "4", "6", "5", "250", "9.7"];
  const FIELDS = ["Threshold", "Ratio", "Knee", "Attack", "Release", "Makeup gain"];

  function compressionBox(): HTMLInputElement {
    return checkbox("Compression");
  }

  function compressionSettings(): HTMLDetailsElement {
    return document.getElementById("settings-compression-more") as HTMLDetailsElement;
  }

  /** One of Strength's options, apart from Theme's Light. */
  function strength(name: string): HTMLInputElement {
    const group = within(settingsPage()).getByRole("radiogroup", { name: "Strength", hidden: true });
    return within(group).getByRole("radio", { name, hidden: true }) as HTMLInputElement;
  }

  function field(name: string): HTMLInputElement {
    return within(settingsPage()).getByRole("textbox", { name, hidden: true }) as HTMLInputElement;
  }

  const fieldTexts = () => FIELDS.map((name) => field(name).value);

  function custom(): HTMLElement {
    return document.getElementById("settings-compression-custom")!;
  }

  function enter(input: HTMLInputElement, text: string): void {
    type(input, text);
    fireEvent.keyDown(input, { key: "Enter" });
  }

  /** The settings as this device keeps them, or null while it keeps none. */
  function keptSettings(): Record<string, unknown> | null {
    const raw = localStorage.getItem("rr_device.audio.compressionSettings");
    return raw === null ? null : JSON.parse(raw);
  }

  it("sits in Audio right under Loudness normalization, off by default, with its hint, and its settings beside it, closed at first", async () => {
    await mount();
    await openSettings();
    const box = compressionBox();
    expect([box.checked, box.disabled]).toEqual([false, false]);
    expect(hintOf(box)).toBe("Evens out loudness within a video.");
    expect(box.closest(".setting")!.previousElementSibling).toBe(checkbox("Loudness normalization").closest(".setting"));
    const more = compressionSettings();
    expect(more.open).toBe(false);
    expect(more.querySelector("summary")!.textContent).toBe("chevron_rightCompression settings");
    expect(box.closest(".setting")!.contains(more)).toBe(true);
  });

  it("offers Strength's Light, Medium, by default, Strong, and Custom, each with its hint, and Custom's values only under Custom, at Medium's", async () => {
    await mount();
    await openSettings();
    const choices = ["Light", "Medium", "Strong", "Custom"].map((name) => [name, strength(name).checked, hintOf(strength(name))]);
    expect(choices).toEqual([
      ["Light", false, "Evens out the loudest moments a little."],
      ["Medium", true, "Brings loud and quiet moments closer."],
      ["Strong", false, "Keeps loud and quiet moments close, for quiet listening."],
      ["Custom", false, "Set each value yourself."]
    ]);
    expect(custom().hidden).toBe(true);
    expect(strength("Custom").closest(".choice-stack")!.contains(custom())).toBe(true);
    await click(strength("Custom"));
    expect(custom().hidden).toBe(false);
    expect(fieldTexts()).toEqual(MEDIUM_TEXTS);
    expect(FIELDS.map((name) => [field(name).closest(".filter-row")!.lastElementChild!.textContent, hintOf(field(name))])).toEqual([
      ["dB", "Lower turns down more of the sound; higher, only the loudest moments."],
      ["to 1", "Higher turns loud moments down harder."],
      ["dB", "Higher starts turning down more gradually, for a softer effect."],
      ["ms", "Lower catches sudden loud sounds faster; higher lets their first moment through."],
      ["ms", "Lower brings the sound back up faster; higher sounds smoother."],
      ["dB", "Higher raises the whole sound after compression. At 0 dB, only loud moments are turned down."]
    ]);
    // The full keyboard for Threshold, since the numeric keypads on iOS have no minus key.
    expect(FIELDS.map((name) => field(name).getAttribute("inputmode"))).toEqual([null, "decimal", "decimal", "numeric", "numeric", "decimal"]);
    expect(keptSettings()).toEqual({ strength: "custom", custom: { thresholdDb: -24, ratio: 4, kneeDb: 6, attackSeconds: 0.005, releaseSeconds: 0.25, makeupDb: 9.7 } });
  });

  it("flags each of Custom's values outside its range with the message saying its range, and keeps the one in use", async () => {
    await mount();
    await openSettings();
    await click(strength("Custom"));
    const messages = FIELDS.map((name) => {
      type(field(name), "5000");
      return problemOf(field(name));
    });
    expect(messages).toEqual([
      "Use a number from -100 to 0 dB.",
      "Use a number from 1 to 20.",
      "Use a number from 0 to 40 dB.",
      "Use a whole number from 0 to 1000 ms.",
      "Use a whole number from 0 to 1000 ms.",
      "Use a number from 0 to 24 dB."
    ]);
    type(field("Attack"), "2.5");
    expect(problemOf(field("Attack"))).toBe("Use a whole number from 0 to 1000 ms.");
    expect(keptSettings()?.custom ?? null).toEqual({ thresholdDb: -24, ratio: 4, kneeDb: 6, attackSeconds: 0.005, releaseSeconds: 0.25, makeupDb: 9.7 });
  });

  it("keeps Custom's values while another strength is chosen, and Reset to Medium puts back Medium's, staying on Custom", async () => {
    await mount();
    await openSettings();
    await click(strength("Custom"));
    enter(field("Ratio"), "6");
    enter(field("Attack"), "12");
    enter(field("Makeup gain"), "3");
    await click(strength("Light"));
    expect(custom().hidden).toBe(true);
    await click(strength("Custom"));
    expect(fieldTexts()).toEqual(["-24", "6", "6", "12", "250", "3"]);

    await click(document.getElementById("settings-compression-reset")!);
    expect(fieldTexts()).toEqual(MEDIUM_TEXTS);
    expect(strength("Custom").checked).toBe(true);
    expect(keptSettings()).toEqual({ strength: "custom", custom: { thresholdDb: -24, ratio: 4, kneeDb: 6, attackSeconds: 0.005, releaseSeconds: 0.25, makeupDb: 9.7 } });
  });

  it("is disabled with its settings while Enhanced audio is off, saying it needs Enhanced audio, and stays as it was", async () => {
    await mount();
    await openSettings();
    await click(compressionBox());
    await click(checkbox("Enhanced audio"));
    expect([compressionBox().checked, compressionBox().disabled, hintOf(compressionBox())]).toEqual([true, true, "Needs Enhanced audio."]);
    expect((compressionSettings().querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(strength("Strong").disabled).toBe(true);

    await click(checkbox("Enhanced audio"));
    expect([compressionBox().checked, compressionBox().disabled, hintOf(compressionBox())]).toEqual([true, false, "Evens out loudness within a video."]);
    expect((compressionSettings().querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
  });

  it("keeps Compression, its strength, and Custom's values after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    await click(compressionBox());
    await click(strength("Custom"));
    enter(field("Threshold"), "-30.5");
    await click(strength("Strong"));
    page.unmount();

    await mount();
    await openSettings();
    expect([compressionBox().checked, strength("Strong").checked]).toEqual([true, true]);
    await click(strength("Custom"));
    expect(field("Threshold").value).toBe("-30.5");
  });

  it("applies at once to the playing video, gliding its compressor and the gain after it, which takes back Web Audio's makeup and applies the strength's own", async () => {
    const page = await mount();
    await tapPage();
    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));
    await settle();
    const compressor = () => page.webAudio.contexts.at(-1)!.compressors[0]!;
    const gainAfter = () => page.webAudio.chain()[2] as FakeGain;
    const glide = (value: number) => ["glide", value, COMPRESSION_GLIDE_SECONDS];
    const level = (db: number) => Math.pow(10, db / 20);
    expect(page.webAudio.chain()[1]).toBe(compressor());
    expect(gainAfter().calls).toEqual([["set", 1]]);

    await openSettings();
    await click(compressionBox());
    expect([compressor().threshold.glides.at(-1), compressor().ratio.glides.at(-1)]).toEqual([glide(-24), glide(4)]);
    expect(gainAfter().calls.at(-1)).toEqual(glide(level(compressionGainDb(COMPRESSION_PRESETS.medium))));
    await click(strength("Strong"));
    expect([compressor().threshold.glides.at(-1), compressor().ratio.glides.at(-1)]).toEqual([glide(-30), glide(8)]);
    await click(strength("Custom"));
    enter(field("Makeup gain"), "0");
    await settle();
    expect(gainAfter().calls.at(-1)).toEqual(glide(level(-webAudioMakeupDb(-24, 6, 4))));
    await click(compressionBox());
    expect([compressor().threshold.glides.at(-1), compressor().ratio.glides.at(-1), gainAfter().calls.at(-1)]).toEqual([glide(0), glide(1), glide(1)]);
    expect(page.webAudio.chain()).toHaveLength(6);
    expect(gainAfter().directSets).toBe(0);
  });
});

describe("Audio's defaults", () => {
  it("are normalization on toward Automatic, a 15 dB boost limit, Allow limiting on, and compression off with Medium", async () => {
    await mount();
    await openSettings();
    const strengthGroup = within(settingsPage()).getByRole("radiogroup", { name: "Strength", hidden: true });
    expect([
      checkbox("Loudness normalization").checked,
      radio("Automatic").checked,
      (within(settingsPage()).getByRole("textbox", { name: "Boost quiet videos by up to", hidden: true }) as HTMLInputElement).value,
      checkbox("Allow limiting").checked,
      checkbox("Compression").checked,
      (within(strengthGroup).getByRole("radio", { name: "Medium", hidden: true }) as HTMLInputElement).checked
    ]).toEqual([true, true, "15", true, false, true]);
  });
});

describe("Autoplay mode and Loop stops autoplay", () => {
  it("sit in Playback around Advance after: Autoplay mode first, Normal until chosen, each mode with its line and the group with its hint, and Loop stops autoplay after it, on until turned off, with its hint, before Seek step", async () => {
    await mount();
    await openSettings();
    const playback = advanceAfter().closest("section")!;
    const settings = Array.from(playback.querySelectorAll(":scope > .setting"));
    expect(settings).toHaveLength(4);
    expect(within(settings[0] as HTMLElement).getByRole("radiogroup", { name: "Autoplay mode", hidden: true })).toBeTruthy();
    expect(settings[1]!.contains(advanceAfter())).toBe(true);
    expect(settings[2]!.contains(checkbox("Loop stops autoplay"))).toBe(true);
    expect(within(settings[3] as HTMLElement).getByRole("radiogroup", { name: "Seek step", hidden: true })).toBeTruthy();

    expect([radio("Normal").checked, radio("Timer").checked]).toEqual([true, false]);
    expect(hintOf(radio("Normal"))).toBe("Photos advance after the timer; videos play to the end.");
    expect(hintOf(radio("Timer"))).toBe("Every item advances after the timer. Pausing a video holds it.");
    expect(hintOf(within(settings[0] as HTMLElement).getByRole("radiogroup", { hidden: true }))).toBe("The player's autoplay button turns it on and off.");
    expect(checkbox("Loop stops autoplay").checked).toBe(true);
    expect(hintOf(checkbox("Loop stops autoplay"))).toBe(
      "With Autoplay and Loop on, the item repeats and nothing advances. Turned off, autoplay goes on, and a video shorter than Advance after repeats until it advances."
    );
  });

  it("apply at once: Timer advances a playing video after Advance after, and with Loop stops autoplay off a photo with Loop on advances", async () => {
    fakeTimers();
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(VIDEO_ITEM));
    mountPage({ server });
    await flush();
    fireEvent.click(playerButton("Autoplay"));
    fireEvent.click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await flush();
    Object.defineProperty(video(), "duration", { configurable: true, value: 65 });
    fireEvent.loadedMetadata(video());
    fireEvent.playing(video());
    await flush();

    fireEvent.click(tab("Settings"));
    fireEvent.click(radio("Timer"));
    await flush();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(server.requests("POST", "/api/random")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.requests("POST", "/api/random")).toHaveLength(2);

    server.on("POST", "/api/random", () => randomAnswer(PHOTO_ITEM));
    fireEvent.click(radio("Normal"));
    await flush();
    fireEvent.click(playerButton("Next"));
    await flush();
    fireEvent.click(playerButton("Loop"));
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.requests("POST", "/api/random")).toHaveLength(3);
    fireEvent.click(checkbox("Loop stops autoplay"));
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.requests("POST", "/api/random")).toHaveLength(4);
  });
});

describe("Seek step", () => {
  it("offers 1, 5, and 10 seconds, 5 until chosen, and is kept after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    const group = within(settingsPage()).getByRole("radiogroup", { name: "Seek step", hidden: true });
    const names = within(group).getAllByRole("radio", { hidden: true }).map((choice) => document.getElementById(choice.getAttribute("aria-labelledby")!)!.textContent);
    expect(names).toEqual(["1 second", "5 seconds", "10 seconds"]);
    expect(names.map((name) => radioOf("Seek step", name!).checked)).toEqual([false, true, false]);

    await click(radioOf("Seek step", "1 second"));
    expect(localStorage.getItem("rr_device.player.seekStep")).toBe("1");
    page.unmount();

    await mount();
    await openSettings();
    expect(radioOf("Seek step", "1 second").checked).toBe(true);
  });
});

describe("Keyboard shortcuts", () => {
  it("sits between Panel and Diagnostics, collapsed, opening from its heading with a chevron", async () => {
    await mount();
    await openSettings();
    const section = document.getElementById("settings-shortcuts") as HTMLDetailsElement;
    expect(section.closest("section")!.previousElementSibling?.querySelector("h3")?.textContent).toBe("Panel");
    expect(section.closest("section")!.nextElementSibling?.querySelector("h3")?.textContent).toBe("Diagnostics");
    expect(section.open).toBe(false);
    const summary = section.querySelector("summary")!;
    expect([summary.querySelector(".setting-more-chevron")?.textContent, summary.querySelector("h3")?.textContent]).toEqual(["chevron_right", "Keyboard shortcuts"]);
    await click(summary);
    expect(section.open).toBe(true);
  });
});

describe("Advance after", () => {
  it("starts at 10 seconds, or as this device saved it", async () => {
    await mount();
    await openSettings();
    expect(advanceAfter().value).toBe("10");

    resetPage();
    localStorage.setItem("rr_device.playback.advanceAfter", "42");
    await mount();
    await openSettings();
    expect(advanceAfter().value).toBe("42");
  });

  it("flags a value that isn't a whole number from 1 to 3600 while the field has focus, and keeps none of them", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    input.focus();

    for (const text of ["0", "3601", "abc", "12abc", "1.5", ""]) {
      type(input, text);
      await vi.advanceTimersByTimeAsync(1_000);
      expect([text, problemOf(input)]).toEqual([text, "Use a whole number from 1 to 3600 seconds."]);
      expect([text, input.closest(".vfield")!.querySelector(".vfield-icon")]).not.toEqual([text, null]);
      fireEvent.keyDown(input, { key: "Enter" });
      await flush();
      expect([text, kept()]).toEqual([text, null]);
    }
    // The text stays as typed while the field has focus, so it can be corrected, and leaving shows the value in use.
    expect(input.value).toBe("");
    fireEvent.blur(input);
    await flush();
    expect([input.value, kept()]).toEqual(["10", null]);
  });

  it("saves nothing while it is typed, however long typing pauses, so typing 120 saves only 120 once the field is left", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    input.focus();

    for (const text of ["1", "12", "120"]) {
      type(input, text);
      await vi.advanceTimersByTimeAsync(10_000);
      expect([text, problemOf(input), kept()]).toEqual([text, null, null]);
    }
    fireEvent.blur(input);
    await flush();
    expect(kept()).toBe("120");
    expect(input.value).toBe("120");
  });

  it("saves at once on Enter, or when the field loses focus, showing the value saved", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    input.focus();

    type(input, "42");
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(kept()).toBe("42");

    type(input, " 007 ");
    fireEvent.blur(input);
    await flush();
    expect(kept()).toBe("7");
    expect(input.value).toBe("7");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(kept()).toBe("7");

    // Up to an hour.
    input.focus();
    type(input, "3600");
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect([kept(), problemOf(input)]).toEqual(["3600", null]);
  });

  it("keeps the value in use when the field is cleared with Backspace and left", async () => {
    localStorage.setItem("rr_device.playback.advanceAfter", "15");
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    input.focus();

    // Backspace on "15" leaves "1", then an empty field.
    type(input, "1");
    await vi.advanceTimersByTimeAsync(2_000);
    type(input, "");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(problemOf(input)).toBe("Use a whole number from 1 to 3600 seconds.");
    expect(kept()).toBe("15");

    fireEvent.blur(input);
    await flush();
    expect([input.value, problemOf(input), kept()]).toEqual(["15", null, "15"]);
  });

  it("shows the value saved again, unflagged, when the field loses focus with a value that isn't valid", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();

    for (const text of ["abc", ""]) {
      input.focus();
      type(input, text);
      await flush();
      expect([text, problemOf(input)]).toEqual([text, "Use a whole number from 1 to 3600 seconds."]);
      fireEvent.blur(input);
      await flush();
      expect([text, input.value, problemOf(input)]).toEqual([text, "10", null]);
      expect(input.closest(".vfield")!.querySelector(".vfield-icon:not(.is-fading-out)")).toBeNull();
    }
    expect(kept()).toBeNull();
  });

  it("does the same when the Settings tab hides or the panel closes while the field has focus", async () => {
    await mount();
    await openSettings();
    fakeTimers();

    advanceAfter().focus();
    type(advanceAfter(), "abc");
    await flush();
    fireEvent.click(tab("Library"));
    await flush();
    fireEvent.click(tab("Settings"));
    await flush();
    expect([advanceAfter().value, problemOf(advanceAfter())]).toEqual(["10", null]);

    advanceAfter().focus();
    type(advanceAfter(), "");
    await flush();
    closePanel();
    await flush();
    fireEvent.click(tab("Settings"));
    await flush();
    expect([advanceAfter().value, problemOf(advanceAfter())]).toEqual(["10", null]);
    expect(kept()).toBeNull();

    // A valid value typed is saved as the panel closes, as when the field loses focus: the field hides with focus still
    // in it, and saves as its hiding takes effect, after the next frame.
    advanceAfter().focus();
    type(advanceAfter(), "33");
    closePanel();
    await vi.advanceTimersByTimeAsync(100);
    expect(kept()).toBe("33");
  });

  it("changes only the length of a photo showing beside the player, keeping the time it has shown", async () => {
    fakeTimers();
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(PHOTO_ITEM));
    mountPage({ server });
    await flush();

    fireEvent.click(playerButton("Autoplay"));
    fireEvent.click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await flush();
    expect(server.requests("POST", "/api/random")).toHaveLength(1);
    expect(server.requests("POST", "/api/record-playback")).toHaveLength(1);

    fireEvent.click(tab("Settings"));
    await vi.advanceTimersByTimeAsync(8_000);
    type(advanceAfter(), "12");
    fireEvent.keyDown(advanceAfter(), { key: "Enter" });
    await flush();
    expect(document.getElementById("time-display")!.textContent).toBe("0:08 / 0:12");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(server.requests("POST", "/api/random")).toHaveLength(1);
    expect(server.requests("POST", "/api/record-playback")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.requests("POST", "/api/random")).toHaveLength(2);

    // A length shorter than the time already shown ends the photo at once.
    await vi.advanceTimersByTimeAsync(5_000);
    type(advanceAfter(), "3");
    fireEvent.keyDown(advanceAfter(), { key: "Enter" });
    await flush();
    expect(server.requests("POST", "/api/random")).toHaveLength(3);
  });

  it("keeps a photo Auto-Pause holds on a phone held, with the time it has shown, when Advance after changes", async () => {
    setViewport(PHONE_VIEWPORT);
    fakeTimers();
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(PHOTO_ITEM));
    mountPage({ server });
    await flush();

    fireEvent.click(playerButton("Autoplay"));
    fireEvent.click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);

    // The panel covers the player, so Auto-Pause holds the photo's timer.
    fireEvent.click(tab("Settings"));
    await flush();
    expect(document.getElementById("fullscreen-stage")!.dataset.panelMode).toBe("overlay");
    expect(playIcon()).toBe("play_arrow");

    type(advanceAfter(), "20");
    fireEvent.keyDown(advanceAfter(), { key: "Enter" });
    await flush();
    expect(kept()).toBe("20");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.requests("POST", "/api/random")).toHaveLength(1);
    expect(server.requests("POST", "/api/record-playback")).toHaveLength(1);
    expect(document.getElementById("time-display")!.textContent).toBe("0:05 / 0:20");
    expect(playIcon()).toBe("play_arrow");

    // Closing the panel resumes it with the 15 seconds it had left.
    closePanel();
    await flush();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(server.requests("POST", "/api/random")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.requests("POST", "/api/random")).toHaveLength(2);
  });
});

describe("Player controls", () => {
  function hideAfter(): HTMLInputElement {
    return within(settingsPage()).getByRole("textbox", { name: "Hide after", hidden: true }) as HTMLInputElement;
  }

  function hideMode(name: string): HTMLInputElement {
    return radioOf("Hide player controls", name);
  }

  function timeoutSettings(): HTMLElement {
    return document.getElementById("settings-hide-timeout")!;
  }

  it("sits after Audio: Hide player controls on Timeout until changed, each mode with its line, and Hide after at 3 seconds and Keep visible while paused, on, shown only under Timeout", async () => {
    await mount();
    await openSettings();
    const section = hideMode("Timeout").closest("section")!;
    expect(section.querySelector("h3")!.textContent).toBe("Player controls");
    const choices = within(settingsPage()).getByRole("radiogroup", { name: "Hide player controls", hidden: true });
    expect(
      within(choices)
        .getAllByRole("radio", { hidden: true })
        .map((choice) => [choice.getAttribute("value"), (choice as HTMLInputElement).checked, hintOf(choice)])
    ).toEqual([
      ["timeout", true, "They hide after a time with no activity."],
      ["click", false, "A click or tap on the player shows or hides them."],
      ["never", false, null]
    ]);
    expect(timeoutSettings().hidden).toBe(false);
    expect(hideAfter().value).toBe("3");
    expect(checkbox("Keep visible while paused").checked).toBe(true);
    expect(timeoutSettings().contains(hideAfter())).toBe(true);
    expect(timeoutSettings().contains(checkbox("Keep visible while paused"))).toBe(true);

    await click(hideMode("On click/tap"));
    expect(timeoutSettings().hidden).toBe(true);
    expect(localStorage.getItem("rr_device.playerControls.hide")).toBe('"click"');
    await click(hideMode("Never"));
    expect(timeoutSettings().hidden).toBe(true);
    await click(hideMode("Timeout"));
    expect(timeoutSettings().hidden).toBe(false);
  });

  it("Hide after flags a value that isn't a whole number from 1 to 30 and keeps none of them, and keeps 1 and 30", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = hideAfter();
    input.focus();

    for (const text of ["0", "31", "abc", "1.5", ""]) {
      type(input, text);
      await vi.advanceTimersByTimeAsync(1_000);
      expect([text, problemOf(input)]).toEqual([text, "Use a whole number from 1 to 30 seconds."]);
      fireEvent.keyDown(input, { key: "Enter" });
      await flush();
      expect([text, localStorage.getItem("rr_device.playerControls.hideAfter")]).toEqual([text, null]);
    }
    for (const text of ["1", "30"]) {
      type(input, text);
      fireEvent.keyDown(input, { key: "Enter" });
      await flush();
      expect([text, problemOf(input), localStorage.getItem("rr_device.playerControls.hideAfter")]).toEqual([text, null, text]);
    }
  });
});

describe("Advance after's saved check", () => {
  /** An icon's or tooltip's state: shown, fading out while still rendered, or gone. */
  function fade(element: Element | null): "shown" | "fading" | "gone" {
    return !element ? "gone" : element.classList.contains("is-fading-out") ? "fading" : "shown";
  }

  function check(): Element | null {
    return settingsPage().querySelector(".vfield-saved");
  }

  it("shows a green check when Enter or leaving the field saves a new value, then fades the check out", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    input.focus();

    type(input, "42");
    expect(fade(check())).toBe("gone");
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(fade(check())).toBe("shown");
    expect([check()!.textContent, check()!.parentElement]).toEqual(["check_circle", input.closest(".vfield")]);
    await vi.advanceTimersByTimeAsync(SETTING_SAVED_MS - 1);
    expect(fade(check())).toBe("shown");
    await vi.advanceTimersByTimeAsync(1);
    expect(fade(check())).toBe("fading");
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(fade(check())).toBe("gone");

    type(input, "43");
    fireEvent.blur(input);
    await flush();
    expect([kept(), fade(check())]).toEqual(["43", "shown"]);
  });

  it("shows none when the value stays as it was or a value that is not valid goes back, and typing again fades it out", async () => {
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    input.focus();

    type(input, " 010 ");
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(fade(check())).toBe("gone");
    type(input, "abc");
    fireEvent.blur(input);
    await flush();
    expect([input.value, fade(check())]).toEqual(["10", "gone"]);

    // Typing over a saved value fades the check out as the red icon fades in.
    input.focus();
    type(input, "20");
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    type(input, "2x");
    await flush();
    expect([fade(check()), fade(input.closest(".vfield")!.querySelector(".vfield-icon"))]).toEqual(["fading", "shown"]);
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(fade(check())).toBe("gone");
  });

  it("is only for typed settings: a choice such as Side shows none", async () => {
    await mount();
    await openSettings();
    await click(radio("Left"));
    expect(settingsPage().querySelector(".vfield-saved")).toBeNull();
  });

  it("with reduced motion, shows and hides the check, the red icon, and its tooltip at once", async () => {
    stubReducedMotion();
    await mount();
    await openSettings();
    fakeTimers();
    const input = advanceAfter();
    const field = input.closest(".vfield")!;
    input.focus();

    type(input, "abc");
    await flush();
    expect([fade(field.querySelector(".vfield-icon")), fade(field.querySelector(".vfield-tip.is-shown"))]).toEqual(["shown", "shown"]);
    type(input, "42");
    await flush();
    expect([fade(field.querySelector(".vfield-icon")), fade(field.querySelector(".vfield-tip.is-shown"))]).toEqual(["gone", "gone"]);
    fireEvent.keyDown(input, { key: "Enter" });
    await flush();
    expect(fade(check())).toBe("shown");
    await vi.advanceTimersByTimeAsync(SETTING_SAVED_MS);
    expect(fade(check())).toBe("gone");
  });
});

describe("the field validation pattern's fades", () => {
  /** What fades: the red icons, in a field, on a held action, and after a section's name, the saved check, and the tooltip. */
  const FADED = [".vfield-icon", ".btn-problem", ".section-problem", ".vfield-saved", ".vfield-tip.is-shown"];

  /** The stylesheet's style rules, at its top level, or inside its media rules whose query includes `media`. */
  function styleRules(media?: string): CSSStyleRule[] {
    const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
    if (!media) {
      return rules.filter((rule): rule is CSSStyleRule => "selectorText" in rule);
    }
    return rules
      .filter((rule): rule is CSSMediaRule => (rule as CSSMediaRule).media?.mediaText?.includes(media) ?? false)
      .flatMap((rule) => Array.from(rule.cssRules) as CSSStyleRule[]);
  }

  /** The fade's properties as the rules that list `selector` set them, later rules winning. happy-dom keeps shorthands whole. */
  function styleOf(rules: CSSStyleRule[], selector: string): Record<string, string> {
    const style: Record<string, string> = {};
    for (const rule of rules.filter((candidate) => candidate.selectorText.split(",").map((part) => part.trim()).includes(selector))) {
      for (const property of ["opacity", "animation", "transition"]) {
        const value = rule.style.getPropertyValue(property);
        if (value) {
          style[property] = value;
        }
      }
    }
    return style;
  }

  it("fade in and out by the stylesheet over the time the app keeps them rendered, and take no motion under reduced motion", async () => {
    useStylesheet();
    await mount();
    const rules = styleRules();
    const reduced = styleRules("prefers-reduced-motion: reduce");
    const fadeIn = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .find((rule): rule is CSSKeyframesRule => (rule as CSSKeyframesRule).name === "field-mark-in");
    const from = fadeIn?.cssRules[0] as CSSKeyframeRule | undefined;
    expect([fadeIn?.cssRules.length, from?.keyText, from?.style.opacity]).toEqual([1, "0%", "0"]);

    for (const selector of FADED) {
      const fading = `${selector.replace(".is-shown", "")}.is-fading-out`;
      expect([selector, styleOf(rules, selector)]).toEqual([
        selector,
        { animation: `field-mark-in ${FADE_MS}ms ease`, transition: `opacity ${FADE_MS}ms ease` }
      ]);
      // A fade out takes over from a fade in that hasn't finished.
      expect([fading, styleOf(rules, fading)]).toEqual([fading, { opacity: "0", animation: "none" }]);
      expect([selector, styleOf(reduced, selector)]).toEqual([selector, { animation: "none", transition: "none" }]);
    }
  });
});

describe("the panel's side", () => {
  it("starts on the right, and moves the panel and its button to the chosen side at once", async () => {
    useStylesheet();
    await mount();
    const button = document.getElementById("panel-btn")!;
    const bell = document.getElementById("notify-btn")!;
    const stage = document.getElementById("fullscreen-stage")!;
    expect(currentStyle(button).right).toBe("168px");

    await openSettings();
    expect(radio("Right").checked).toBe(true);
    expect(radio("Left").checked).toBe(false);

    await click(radio("Left"));
    expect(stage.dataset.side).toBe("left");
    expect(button.querySelector(".material-symbol-icon")!.textContent).toBe("left_panel_close");
    // Just right of the bell, which sits 12 px in and is 40 px wide.
    expect(currentStyle(bell).left).toBe("12px");
    expect(currentStyle(button).left).toBe("64px");
    expect(currentStyle(button).right).toBe("auto");
    expect(localStorage.getItem("rr_device.panel.side")).toBe('"left"');

    await click(button);
    expect(button.querySelector(".material-symbol-icon")!.textContent).toBe("left_panel_open");

    await openSettings();
    await click(radio("Right"));
    expect(stage.dataset.side).toBe("right");
    expect(button.querySelector(".material-symbol-icon")!.textContent).toBe("right_panel_close");
    expect(currentStyle(button).right).toBe("168px");
    expect(localStorage.getItem("rr_device.panel.side")).toBe('"right"');
  });
});

describe("Auto-Pause", () => {
  it("offers Responsive, Always, and Never, starts at Responsive, and pauses as the chosen mode says", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(VIDEO_ITEM));
    await mount(server);
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await waitFor(() => expect(video().paused).toBe(false));

    // Beside the player, Responsive pauses nothing.
    await openSettings();
    const choices = within(settingsPage()).getByRole("radiogroup", { name: "Auto-Pause", hidden: true });
    expect(within(choices).getAllByRole("radio", { hidden: true }).map((choice) => choice.getAttribute("aria-labelledby"))).toEqual([
      "settings-auto-pause-responsive",
      "settings-auto-pause-always",
      "settings-auto-pause-never"
    ]);
    expect(radio("Responsive").checked).toBe(true);
    expect(video().paused).toBe(false);

    // Always pauses at once, since the panel is open, and Responsive resumes what it paused.
    await click(radio("Always"));
    expect(video().paused).toBe(true);
    expect(localStorage.getItem("rr_device.panel.autoPause")).toBe('"always"');
    await click(radio("Responsive"));
    expect(video().paused).toBe(false);

    // Never leaves the overlay playing.
    await click(radioOf("Auto-Pause", "Never"));
    setViewport(PHONE_VIEWPORT);
    await settle();
    expect(document.getElementById("fullscreen-stage")!.dataset.panelMode).toBe("overlay");
    expect(video().paused).toBe(false);

    await click(radio("Responsive"));
    expect(video().paused).toBe(true);
  });
});

describe("Diagnostics", () => {
  for (const [browser, userAgent, clientType, prefix] of [
    ["a desktop browser", DESKTOP_USER_AGENT, "web", "Web Browser"],
    ["a phone", IPHONE_USER_AGENT, "mobile-web", "Mobile Browser"]
  ] as const) {
    it(`shows the ids, the client type, the device name, and the server's and the app's versions on ${browser}`, async () => {
      resetPage(userAgent);
      const server = new FakeServer();
      server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, appVersion: "0.15.0.0", assetsVersion: "0.15.0-dev.1" }));
      const page = await mount(server);
      await openSettings();

      expect(diagnostics()).toEqual({
        Client: page.clientId(),
        Session: page.sessionId(),
        "Client type": clientType,
        "Device name": `${prefix} (${navigator.platform}; ${userAgent.slice(0, 40)})`,
        Server: "0.15.0-dev.1 (API 2)",
        ReelRoulette: RELEASE_VERSION
      });
      expect(page.clientId()).toMatch(/^[0-9a-f-]{36}$/);
      expect(page.sessionId()).toMatch(/^[0-9a-f-]{36}$/);
    });
  }

  it("shows the server's appVersion when it sends no assetsVersion, and the version of a server that fails the check", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, appVersion: "0.14.2.0" }));
    await mount(server);
    await openSettings();
    expect(diagnostics().Server).toBe("0.14.2.0 (API 2)");

    resetPage();
    const incompatible = new FakeServer();
    incompatible.on("GET", "/api/version", () => json({ ...COMPATIBLE_VERSION, apiVersion: "3", assetsVersion: "0.16.0" }));
    mountPage({ server: incompatible });
    await waitFor(() => expect(incompatible.requests("GET", "/api/version").length).toBeGreaterThan(0));
    await settle();
    await openSettings();
    expect(diagnostics().Server).toBe("0.16.0 (API 3)");
  });

  it("says the server's version is unknown until a version check answers", async () => {
    const server = new FakeServer();
    server.on("GET", "/api/version", () => new Promise<Response>(() => {}));
    mountPage({ server });
    await settle();
    await openSettings();
    expect(diagnostics().Server).toBe("Unknown");
    expect(diagnostics().ReelRoulette).toBe(RELEASE_VERSION);
  });
});

/** The theme on the page: the root element's theme class, and the `theme-color` and status bar style metas. */
function pageTheme(): { classes: string[]; color: string | null; statusBar: string | null } {
  const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;
  return {
    classes: Array.from(document.documentElement.classList).filter((name) => name.startsWith("theme-")),
    color: meta("theme-color"),
    statusBar: meta("apple-mobile-web-app-status-bar-style")
  };
}

const DARK = { classes: ["theme-dark"], color: "#1a1a1a", statusBar: "black-translucent" };
const LIGHT = { classes: ["theme-light"], color: "#eceff4", statusBar: "default" };

function tileNamesBox(): HTMLInputElement {
  return within(settingsPage()).getByRole("checkbox", { name: "Show file names on tiles", hidden: true }) as HTMLInputElement;
}

const LIBRARY_ITEM = {
  id: "item-1",
  sourceId: "source-1",
  fileName: "clip 1.mp4",
  fullPath: "C:\\media\\clip 1.mp4",
  relativePath: "clip 1.mp4",
  mediaType: 0,
  durationSeconds: 60,
  playCount: 0,
  isFavorite: false,
  isBlacklisted: false,
  tags: [] as string[],
  hasThumbnail: false,
  thumbnailWidth: 1920,
  thumbnailHeight: 1080
};

describe("Theme", () => {
  it("offers System, Dark, and Light, starts at System, and applies each at once, with the metas an installed app reads", async () => {
    // The harness's system is dark.
    await mount();
    await openSettings();
    const group = within(settingsPage()).getByRole("radiogroup", { name: "Theme", hidden: true });
    expect(within(group).getAllByRole("radio", { hidden: true }).map((choice) => choice.getAttribute("value"))).toEqual(["system", "dark", "light"]);
    expect(radio("System").checked).toBe(true);
    expect(pageTheme()).toEqual(DARK);

    await click(themeRadio("Light"));
    expect(pageTheme()).toEqual(LIGHT);
    expect(localStorage.getItem("rr_device.appearance.theme")).toBe('"light"');

    await click(radio("Dark"));
    expect(pageTheme()).toEqual(DARK);
    expect(localStorage.getItem("rr_device.appearance.theme")).toBe('"dark"');

    await click(radio("System"));
    expect(pageTheme()).toEqual(DARK);
    expect(localStorage.getItem("rr_device.appearance.theme")).toBe('"system"');
  });

  it("follows the system's scheme as it changes while System is chosen, and not while Dark or Light is", async () => {
    const setSystemDark = stubColorScheme(false);
    await mount();
    expect(pageTheme()).toEqual(LIGHT);
    setSystemDark(true);
    expect(pageTheme()).toEqual(DARK);

    await openSettings();
    await click(themeRadio("Light"));
    setSystemDark(false);
    setSystemDark(true);
    expect(pageTheme()).toEqual(LIGHT);

    await click(radio("System"));
    expect(pageTheme()).toEqual(DARK);
    setSystemDark(false);
    expect(pageTheme()).toEqual(LIGHT);
  });
});

function ambientBox(): HTMLInputElement {
  return checkbox("Ambient mode");
}

function ambientSettings(): HTMLDetailsElement {
  return document.getElementById("settings-ambient-more") as HTMLDetailsElement;
}

function slider(name: string): HTMLInputElement {
  return within(settingsPage()).getByRole("slider", { name, hidden: true }) as HTMLInputElement;
}

/** The value a slider shows beside its label. */
function shownValue(input: HTMLInputElement): string {
  return settingsPage().querySelector(`output[for="${input.id}"]`)!.textContent ?? "";
}

function moveSlider(input: HTMLInputElement, value: number): void {
  fireEvent.input(input, { target: { value: String(value) } });
}

function ambientLayer(): HTMLElement {
  return document.getElementById("ambient") as HTMLElement;
}

/** The glow's filter in the dark theme and then the light one. */
function ambientFilters(): string[] {
  const root = document.documentElement;
  const canvas = ambientLayer().querySelector("canvas")!;
  const filters: string[] = [];
  try {
    for (const theme of ["theme-dark", "theme-light"]) {
      root.classList.remove("theme-dark", "theme-light");
      root.classList.add(theme);
      filters.push(currentStyle(canvas).filter);
    }
  } finally {
    root.classList.remove("theme-light");
    root.classList.add("theme-dark");
  }
  return filters;
}

function keptAmbientSettings(): unknown {
  const raw = localStorage.getItem("rr_device.appearance.ambientSettings");
  return raw === null ? null : JSON.parse(raw);
}

/** Ambient mode's sliders: each one's name, with its range, step, value, and the value shown. */
const AMBIENT_SLIDERS = ["Update rate", "Fade time", "Blur", "Strength in the dark theme", "Strength in the light theme", "Saturation"];

function ambientSliders(): string[][] {
  return AMBIENT_SLIDERS.map((name) => {
    const input = slider(name);
    return [name, input.min, input.max, input.step, input.value, shownValue(input)];
  });
}

const DEFAULT_AMBIENT_SLIDERS = [
  ["Update rate", "0.25", "4", "0.25", "1", "1 per second"],
  ["Fade time", "0.25", "4", "0.25", "2", "2 s"],
  ["Blur", "10", "80", "1", "64", "64 px"],
  ["Strength in the dark theme", "0", "100", "1", "50", "50%"],
  ["Strength in the light theme", "0", "100", "1", "75", "75%"],
  ["Saturation", "0", "200", "5", "100", "100%"]
];

const EMPTY_STATE_TEXT = "Tap to play, or open the panel to choose a preset or filter.";

describe("Ambient mode", () => {
  it("is on by default, in Appearance between Theme and Show file names on tiles, with its hint", async () => {
    await mount();
    await openSettings();
    expect(ambientBox().checked).toBe(true);
    expect(hintOf(ambientBox())).toBe(
      "A soft glow of the picture's colors fills the black space around it."
    );
    const appearance = document.getElementById("settings-appearance-heading")!.closest("section")!;
    const parts = Array.from(appearance.querySelectorAll('[role="radiogroup"], input[type="checkbox"], details')).map((part) => part.id || part.getAttribute("aria-labelledby"));
    expect(parts).toEqual(["settings-theme-label", "settings-ambient", "settings-ambient-more", "settings-tile-names"]);
  });

  it("has its settings in Ambient mode settings beside it, closed at first, under a chevron that points right, then down while open", async () => {
    useStylesheet();
    await mount();
    await openSettings();
    const more = ambientSettings();
    expect(more.closest(".setting")).toBe(ambientBox().closest(".setting"));
    expect(more.open).toBe(false);
    const summary = more.querySelector("summary")!;
    expect(summary.textContent).toBe("chevron_rightAmbient mode settings");
    const chevron = summary.querySelector(".setting-more-chevron")!;
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
    const closed = currentStyle(chevron).transform;
    await click(summary);
    expect(more.open).toBe(true);
    expect([closed, currentStyle(chevron).transform]).toEqual(["", "rotate(90deg)"]);
  });

  it("offers each setting by its plain label, with its default, range, and step, and shows each value", async () => {
    await mount();
    await openSettings();
    expect(ambientSliders()).toEqual(DEFAULT_AMBIENT_SLIDERS);
    expect(within(ambientSettings()).getByRole("button", { name: "Reset to defaults", hidden: true })).toBeTruthy();
    expect(keptAmbientSettings()).toBeNull();
  });

  it("applies at once: off hides the glow around a playing video, and on shows it again, and each is kept", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(VIDEO_ITEM));
    await mount(server);
    await click(screen.getByText(EMPTY_STATE_TEXT));
    await openSettings();
    expect(ambientLayer().hidden).toBe(false);

    await click(ambientBox());
    expect(ambientLayer().hidden).toBe(true);
    expect(localStorage.getItem("rr_device.appearance.ambient")).toBe("false");
    await click(ambientBox());
    expect(ambientLayer().hidden).toBe(false);
    expect(localStorage.getItem("rr_device.appearance.ambient")).toBe("true");
  });

  it("applies each setting as its slider moves, showing and keeping its value: the glow's update rate, blur, strengths, and saturation", async () => {
    useStylesheet();
    fakeTimers();
    const canvases = stubCanvas();
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(VIDEO_ITEM));
    mountPage({ server });
    await flush();
    stubElementProperty(video(), "readyState", 4);
    fireEvent.click(screen.getByText(EMPTY_STATE_TEXT));
    await flush();
    fireEvent.click(tab("Settings"));
    await flush();
    expect(video().paused).toBe(false);
    expect(ambientFilters()).toEqual(["blur(64px) brightness(0.5) saturate(1)", "blur(64px) brightness(0.75) saturate(1)"]);

    moveSlider(slider("Update rate"), 4);
    await flush();
    const copied = canvases.copiesOf(video());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(canvases.copiesOf(video()) - copied).toBe(4);

    moveSlider(slider("Fade time"), 3);
    moveSlider(slider("Blur"), 40);
    moveSlider(slider("Strength in the dark theme"), 30);
    moveSlider(slider("Strength in the light theme"), 60);
    moveSlider(slider("Saturation"), 150);
    await flush();
    expect(ambientSliders()).toEqual([
      ["Update rate", "0.25", "4", "0.25", "4", "4 per second"],
      ["Fade time", "0.25", "4", "0.25", "3", "3 s"],
      ["Blur", "10", "80", "1", "40", "40 px"],
      ["Strength in the dark theme", "0", "100", "1", "30", "30%"],
      ["Strength in the light theme", "0", "100", "1", "60", "60%"],
      ["Saturation", "0", "200", "5", "150", "150%"]
    ]);
    expect(ambientFilters()).toEqual(["blur(40px) brightness(0.3) saturate(1.5)", "blur(40px) brightness(0.6) saturate(1.5)"]);
    expect(keptAmbientSettings()).toEqual({ rate: 4, fade: 3, blur: 40, dark: 30, light: 60, saturation: 150 });
  });

  it("Reset to defaults puts every setting back, and the glow with them", async () => {
    useStylesheet();
    await mount();
    await openSettings();
    moveSlider(slider("Update rate"), 0.25);
    moveSlider(slider("Fade time"), 4);
    moveSlider(slider("Blur"), 10);
    moveSlider(slider("Strength in the dark theme"), 100);
    moveSlider(slider("Strength in the light theme"), 0);
    moveSlider(slider("Saturation"), 0);
    await settle();

    await click(within(ambientSettings()).getByRole("button", { name: "Reset to defaults", hidden: true }));
    expect(ambientSliders()).toEqual(DEFAULT_AMBIENT_SLIDERS);
    expect(ambientFilters()).toEqual(["blur(64px) brightness(0.5) saturate(1)", "blur(64px) brightness(0.75) saturate(1)"]);
    expect(keptAmbientSettings()).toEqual({ rate: 1, fade: 2, blur: 64, dark: 50, light: 75, saturation: 100 });
    expect(ambientBox().checked).toBe(true);
  });
});

describe("Show file names on tiles", () => {
  it("starts off, and shows each tile's name on it once turned on, while the tile's tooltip names it either way", async () => {
    useStylesheet();
    stubLayoutSize();
    const server = new FakeServer();
    server.on("POST", "/api/library/query", () => json({ items: [LIBRARY_ITEM], totalCount: 1, searchBaselineCount: 1 }));
    await mount(server);
    await click(tab("Library"));
    const tile = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.library-grid-tile[data-item-id="item-1"]');
      expect(found).not.toBeNull();
      return found!;
    });
    const name = tile.querySelector(".library-grid-tile-filename")!;
    expect(name.textContent).toBe("clip 1.mp4");
    expect(tile.title).toBe("clip 1.mp4");
    expect(currentStyle(name).display).toBe("none");

    await openSettings();
    expect(tileNamesBox().checked).toBe(false);
    expect(hintOf(tileNamesBox())).toBe("Hovering a tile shows its name either way.");
    await click(tileNamesBox());
    expect(localStorage.getItem("rr_device.appearance.tileNames")).toBe("true");
    await click(tab("Library"));
    // The same tile, not rendered again.
    expect(document.querySelector('.library-grid-tile[data-item-id="item-1"]')).toBe(tile);
    expect(currentStyle(name).display).toBe("block");
    expect(tile.title).toBe("clip 1.mp4");

    await openSettings();
    await click(tileNamesBox());
    expect(currentStyle(name).display).toBe("none");
  });
});

function checkbox(name: string): HTMLInputElement {
  return within(settingsPage()).getByRole("checkbox", { name, hidden: true }) as HTMLInputElement;
}

function popupSettings(): HTMLDetailsElement {
  return document.getElementById("settings-popups-more") as HTMLDetailsElement;
}

function positionSelect(): HTMLSelectElement {
  return within(settingsPage()).getByRole("combobox", { name: "Position", hidden: true }) as HTMLSelectElement;
}

/** The popup settings' controls inside Popup settings: the five kinds, Position, Show in fullscreen, and Show for. */
function popupSettingControls(): HTMLElement[] {
  return Array.from(popupSettings().querySelectorAll<HTMLElement>("fieldset input, fieldset select"));
}

function bell(): HTMLButtonElement {
  return document.getElementById("notify-btn") as HTMLButtonElement;
}

function keptPopupSettings(): unknown {
  const raw = localStorage.getItem("rr_device.notifications.popups");
  return raw === null ? null : JSON.parse(raw);
}

const SAMPLE = "Popups show here.";

describe("Notifications", () => {
  it("starts with popups on for every kind, at the bottom center, in fullscreen, for 5 seconds, with Popup settings closed", async () => {
    await mount();
    await openSettings();
    expect(checkbox("Show popups").checked).toBe(true);
    expect(hintOf(checkbox("Show popups"))).toBe(
      "Short messages over the player. The bell on the player lists them either way."
    );
    expect(popupSettings().open).toBe(false);

    await click(popupSettings().querySelector("summary")!);
    expect(popupSettings().open).toBe(true);
    const kinds = within(settingsPage()).getByRole("group", { name: "Show popups for", hidden: true });
    expect(within(kinds).getAllByRole("checkbox", { hidden: true }).map((box) => [box.getAttribute("value"), (box as HTMLInputElement).checked])).toEqual([
      ["actions", true],
      ["devices", true],
      ["refresh", true],
      ["skips", true],
      ["connection", true]
    ]);
    expect(hintOf(checkbox("Other devices"))).toBe(
      "Favorites, blacklist, rating, and preset changes made on another device."
    );
    expect(Array.from(positionSelect().options).map((option) => [option.value, option.textContent])).toEqual([
      ["bottom-center", "Bottom center"],
      ["bottom-left", "Bottom left"],
      ["bottom-right", "Bottom right"],
      ["top-center", "Top center"],
      ["top-left", "Top left"],
      ["top-right", "Top right"]
    ]);
    expect(positionSelect().value).toBe("bottom-center");
    expect(checkbox("Show in fullscreen").checked).toBe(true);
    expect(radioOf("Show for", "5 seconds").checked).toBe(true);
    expect(keptPopupSettings()).toBeNull();
  });

  it("applies each popup setting at once and keeps it, as the next message shows", async () => {
    const server = new FakeServer();
    server.on("POST", "/api/random", () => randomAnswer(VIDEO_ITEM));
    server.on("POST", "/api/favorite", flagAnswer);
    await mount(server);
    await click(screen.getByText("Tap to play, or open the panel to choose a preset or filter."));
    await openSettings();
    await click(popupSettings().querySelector("summary")!);

    // Your actions off: a favorite goes only to the list, and the bell counts it.
    await click(checkbox("Your actions"));
    expect(keptPopupSettings()).toMatchObject({ kinds: { actions: false, devices: true } });
    await click(playerButton("Favorite"));
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications, 1 unread"));
    expect(popupsShown()).toEqual([]);

    // Back on, it pops up again.
    await click(checkbox("Your actions"));
    await click(playerButton("Favorite"));
    await waitFor(() => expect(popupsShown()).toEqual(["Removed from favorites | clip 1.mp4"]));

    fireEvent.change(positionSelect(), { target: { value: "top-right" } });
    await settle();
    expect(document.getElementById("toasts")!.dataset.pos).toBe("top-right");
    await click(checkbox("Show in fullscreen"));
    await click(radioOf("Show for", "10 seconds"));
    expect(keptPopupSettings()).toMatchObject({ position: "top-right", fullscreen: false, seconds: 10 });

    // Show popups off: nothing pops up, and the list keeps it.
    await click(checkbox("Show popups"));
    await click(playerButton("Favorite"));
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread"));
    expect(popupsShown().filter((popup) => popup.startsWith("Added to favorites"))).toEqual([]);
    expect(keptPopupSettings()).toMatchObject({ popups: false });
  });

  it("disables Popup settings' controls while Show popups is off", async () => {
    await mount();
    await openSettings();
    await click(popupSettings().querySelector("summary")!);
    const fieldset = popupSettings().querySelector("fieldset")!;
    expect(popupSettingControls()).toHaveLength(10);

    await click(checkbox("Show popups"));
    expect(fieldset.disabled).toBe(true);
    expect(popupSettingControls().map((control) => (control as HTMLInputElement).disabled)).toEqual(Array(10).fill(true));

    await click(checkbox("Show popups"));
    expect(fieldset.disabled).toBe(false);
    expect(popupSettingControls().map((control) => (control as HTMLInputElement).disabled)).toEqual(Array(10).fill(false));
  });

  it("shows one sample popup where and for as long as a Position or Show for change says, which the list, the bell, and the log never get", async () => {
    const page = await mount();
    await openSettings();
    await click(popupSettings().querySelector("summary")!);

    fireEvent.change(positionSelect(), { target: { value: "top-left" } });
    await settle();
    expect(document.getElementById("toasts")!.dataset.pos).toBe("top-left");
    expect(popupsShown()).toEqual([`${SAMPLE} | For 5 seconds, unless you point at one or close it.`]);

    await click(radio("3 seconds"));
    expect(popupsShown()).toEqual([`${SAMPLE} | For 3 seconds, unless you point at one or close it.`]);

    expect(bell().getAttribute("aria-label")).toBe("Notifications");
    expect(page.server.logLines().some((line) => line.includes(SAMPLE))).toBe(false);
    await click(bell());
    expect(within(document.getElementById("notify-list")!).queryByText(SAMPLE)).toBeNull();
  });

  it("opens from the bell's list scrolled to Show popups, with Popup settings open, closing the list", async () => {
    await mount();
    await click(tab("Library"));
    await click(bell());
    const list = document.getElementById("notify-list")!;
    expect(list.hidden).toBe(false);
    const scrolls = vi.spyOn(Element.prototype, "scrollIntoView");
    const scrolled = () => scrolls.mock.contexts.filter((element) => element === checkbox("Show popups").closest("section")).length;
    try {
      await click(within(list).getByRole("button", { name: "Notification settings" }));
      expect(list.hidden).toBe(true);
      expect(settingsPage().hidden).toBe(false);
      expect(tab("Settings").getAttribute("aria-selected")).toBe("true");
      expect(popupSettings().open).toBe(true);
      expect(scrolled()).toBe(1);

      // Again, after Popup settings was closed, from a closed panel.
      await click(popupSettings().querySelector("summary")!);
      expect(popupSettings().open).toBe(false);
      closePanel();
      await settle();
      await click(bell());
      await click(within(list).getByRole("button", { name: "Notification settings" }));
      expect(settingsPage().hidden).toBe(false);
      expect(popupSettings().open).toBe(true);
      expect(scrolled()).toBe(2);
    } finally {
      scrolls.mockRestore();
    }
  });
});

describe("kept on this device", () => {
  it("keeps every popup setting after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    await click(popupSettings().querySelector("summary")!);
    await click(checkbox("Other devices"));
    fireEvent.change(positionSelect(), { target: { value: "bottom-right" } });
    await settle();
    await click(checkbox("Show in fullscreen"));
    await click(radio("3 seconds"));
    await click(checkbox("Show popups"));
    page.unmount();

    await mount();
    expect(document.getElementById("toasts")!.dataset.pos).toBe("bottom-right");
    await openSettings();
    expect(checkbox("Show popups").checked).toBe(false);
    expect(checkbox("Other devices").checked).toBe(false);
    expect(checkbox("Your actions").checked).toBe(true);
    expect(positionSelect().value).toBe("bottom-right");
    expect(checkbox("Show in fullscreen").checked).toBe(false);
    expect(radio("3 seconds").checked).toBe(true);
  });

  it("keeps the theme and Show file names on tiles after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    await click(themeRadio("Light"));
    await click(tileNamesBox());
    page.unmount();

    await mount();
    expect(pageTheme()).toEqual(LIGHT);
    expect(document.getElementById("library-overlay")!.classList.contains("show-tile-names")).toBe(true);
    await openSettings();
    expect(themeRadio("Light").checked).toBe(true);
    expect(tileNamesBox().checked).toBe(true);
  });

  it("keeps ambient mode and each of its settings after a page refresh", async () => {
    useStylesheet();
    const page = await mount();
    await openSettings();
    await click(ambientBox());
    moveSlider(slider("Update rate"), 2.5);
    moveSlider(slider("Fade time"), 0.5);
    moveSlider(slider("Blur"), 20);
    moveSlider(slider("Strength in the dark theme"), 35);
    moveSlider(slider("Strength in the light theme"), 90);
    moveSlider(slider("Saturation"), 50);
    await settle();
    page.unmount();

    await mount();
    expect(ambientFilters()).toEqual(["blur(20px) brightness(0.35) saturate(0.5)", "blur(20px) brightness(0.9) saturate(0.5)"]);
    await openSettings();
    expect(ambientBox().checked).toBe(false);
    expect(ambientSliders().map((row) => [row[0], row[5]])).toEqual([
      ["Update rate", "2.5 per second"],
      ["Fade time", "0.5 s"],
      ["Blur", "20 px"],
      ["Strength in the dark theme", "35%"],
      ["Strength in the light theme", "90%"],
      ["Saturation", "50%"]
    ]);
  });

  it("keeps Advance after, the autoplay mode, Loop stops autoplay, the side, Auto-Pause, and the player's Autoplay, Loop, and Mute after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    type(advanceAfter(), "42");
    fireEvent.keyDown(advanceAfter(), { key: "Enter" });
    await click(radio("Timer"));
    await click(checkbox("Loop stops autoplay"));
    await click(radio("Left"));
    await click(radioOf("Auto-Pause", "Never"));
    await click(playerButton("Autoplay"));
    await click(playerButton("Loop"));
    await click(playerButton("Mute"));
    page.unmount();

    await mount();
    for (const name of ["Autoplay", "Loop", "Mute"]) {
      expect([name, playerButton(name).classList.contains("active")]).toEqual([name, true]);
    }
    expect(playerButton("Mute").querySelector(".material-symbol-icon")!.textContent).toBe("volume_off");
    expect(document.getElementById("fullscreen-stage")!.dataset.side).toBe("left");
    await openSettings();
    expect(advanceAfter().value).toBe("42");
    expect([radio("Timer").checked, checkbox("Loop stops autoplay").checked]).toEqual([true, false]);
    expect(radio("Left").checked).toBe(true);
    expect(radioOf("Auto-Pause", "Never").checked).toBe(true);
  });

  it("keeps Hide player controls, Hide after, and Keep visible while paused after a page refresh", async () => {
    const page = await mount();
    await openSettings();
    const hideAfter = () => within(settingsPage()).getByRole("textbox", { name: "Hide after", hidden: true }) as HTMLInputElement;
    type(hideAfter(), "12");
    fireEvent.keyDown(hideAfter(), { key: "Enter" });
    await click(checkbox("Keep visible while paused"));
    await click(radioOf("Hide player controls", "On click/tap"));
    page.unmount();

    await mount();
    await openSettings();
    expect(radioOf("Hide player controls", "On click/tap").checked).toBe(true);
    await click(radioOf("Hide player controls", "Timeout"));
    expect(hideAfter().value).toBe("12");
    expect(checkbox("Keep visible while paused").checked).toBe(false);
  });

  it("keeps each setting only in this browser's storage, and tells the server nothing", async () => {
    const page = await mount();
    await openSettings();
    // The page's first tap starts the gain stage, which relays a line of its own.
    await tapPage();
    const keysBefore = storageKeys();
    const requestsBefore = page.server.calls.length;

    type(advanceAfter(), "20");
    fireEvent.keyDown(advanceAfter(), { key: "Enter" });
    await click(radio("Timer"));
    await click(checkbox("Loop stops autoplay"));
    await click(radio("Left"));
    await click(radio("Always"));
    await click(themeRadio("Light"));
    await click(tileNamesBox());
    await click(ambientBox());
    moveSlider(slider("Blur"), 30);
    await settle();
    await click(checkbox("Show popups"));
    await click(playerButton("Autoplay"));
    await click(playerButton("Loop"));
    await click(playerButton("Mute"));
    moveSlider(volumeSlider(), 40);
    await click(checkbox("Enhanced audio"));
    await click(radio("10%"));

    expect(page.server.calls.slice(requestsBefore)).toEqual([]);
    expect(storageKeys().filter((key) => !keysBefore.includes(key))).toEqual([
      "rr_device.appearance.ambient",
      "rr_device.appearance.ambientSettings",
      "rr_device.appearance.theme",
      "rr_device.appearance.tileNames",
      "rr_device.audio.enhanced",
      "rr_device.audio.volumeStep",
      "rr_device.notifications.popups",
      "rr_device.panel.autoPause",
      "rr_device.panel.side",
      "rr_device.playback.advanceAfter",
      "rr_device.playback.autoplayMode",
      "rr_device.playback.loopStopsAutoplay",
      "rr_device.player.autoplay",
      "rr_device.player.loop",
      "rr_device.player.muted",
      "rr_device.player.volume"
    ]);
  });
});
