import { signal } from "@preact/signals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENT_RANGES,
  AMBIENT_SETTINGS,
  createAmbient,
  DEFAULT_AMBIENT_TUNING,
  formatAmbientSetting,
  readAmbientTuning,
  type AmbientCanvas,
  type AmbientTuning
} from "../playback/ambient";
import { createDeviceStore } from "../state/deviceStore";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

/** One thing a canvas was asked to do, with the opacity it was drawn at. */
interface CanvasCall {
  op: "clear" | "draw";
  alpha: number;
  image?: object;
}

/** A canvas that records what is drawn on it. */
function fakeCanvas(name: string) {
  const calls: CanvasCall[] = [];
  const context = {
    globalAlpha: 1,
    clearRect() {
      calls.push({ op: "clear", alpha: context.globalAlpha });
    },
    drawImage(image: object) {
      calls.push({ op: "draw", alpha: context.globalAlpha, image });
    }
  };
  return {
    name,
    width: 32,
    height: 18,
    calls,
    getContext: () => context
  };
}

type FakeCanvas = ReturnType<typeof fakeCanvas>;

/** Animation frames that run only when a test runs them. */
function fakeFrames() {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  return {
    request(callback: () => void) {
      pending.set(nextId, callback);
      return nextId++;
    },
    cancel(id: number) {
      pending.delete(id);
    },
    pending: () => pending.size,
    run() {
      const due = [...pending.values()];
      pending.clear();
      due.forEach((callback) => callback());
    }
  };
}

/** Ambient mode on the page's signals, attached to fake elements, playing nothing yet. */
function setup(options: { tuning?: Partial<AmbientTuning>; enabled?: boolean } = {}) {
  const enabled = signal(options.enabled ?? true);
  const tuning = signal<AmbientTuning>({ ...DEFAULT_AMBIENT_TUNING, ...options.tuning });
  const current = signal<{ mediaType: string } | null>(null);
  const attemptId = signal(0);
  const failed = signal(false);
  const frames = fakeFrames();
  let clock = 0;
  let hidden = false;
  const created: FakeCanvas[] = [];
  const ambient = createAmbient({
    enabled,
    tuning,
    current,
    attemptId,
    failed,
    frames,
    now: () => clock,
    tabHidden: () => hidden,
    createCanvas: () => {
      const canvas = fakeCanvas(created.length === 0 ? "from" : "to");
      created.push(canvas);
      return canvas;
    }
  });
  const properties = new Map<string, string>();
  const layer = { hidden: false, style: { setProperty: (name: string, value: string) => properties.set(name, value) } };
  const shown = fakeCanvas("shown");
  const video = { paused: true, readyState: 4 };
  const photo = { complete: true, naturalWidth: 640 };
  ambient.attach({ layer, canvas: shown, video, photo });
  const [from, to] = created as [FakeCanvas, FakeCanvas];

  return {
    ambient,
    enabled,
    tuning,
    failed,
    frames,
    layer,
    properties,
    shown,
    from,
    to,
    video,
    photo,
    /** Starts a new play attempt of a video or a photo. */
    play(mediaType: "video" | "photo") {
      current.value = { mediaType };
      attemptId.value += 1;
    },
    /** How many times the picture of `source` was copied. */
    copiesOf(source: object): number {
      return to.calls.filter((call) => call.op === "draw" && call.image === source).length;
    },
    setClock(ms: number) {
      clock = ms;
    },
    setHidden(value: boolean) {
      hidden = value;
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ambient mode's settings", () => {
  it("start at their defaults, with each one's range and step as its slider offers it", () => {
    expect(readAmbientTuning(createDeviceStore(memoryStorage()))).toEqual({ rate: 1, fade: 2, blur: 64, dark: 50, light: 75, saturation: 100 });
    expect(AMBIENT_SETTINGS.map((setting) => [setting, AMBIENT_RANGES[setting]])).toEqual([
      ["rate", { min: 0.25, max: 4, step: 0.25 }],
      ["fade", { min: 0.25, max: 4, step: 0.25 }],
      ["blur", { min: 10, max: 80, step: 1 }],
      ["dark", { min: 0, max: 100, step: 1 }],
      ["light", { min: 0, max: 100, step: 1 }],
      ["saturation", { min: 0, max: 200, step: 5 }]
    ]);
  });

  it("are read as this device keeps them, each one outside its range or not a number at its default", () => {
    const kept = { rate: 0.25, fade: 4, blur: 10, dark: 0, light: 100, saturation: 200 };
    const device = createDeviceStore(memoryStorage({ "rr_device.appearance.ambientSettings": JSON.stringify(kept) }));
    expect(readAmbientTuning(device)).toEqual(kept);

    const mixed = { rate: 5, fade: "3", blur: 40, dark: -1, light: 60, saturation: null };
    const mixedDevice = createDeviceStore(memoryStorage({ "rr_device.appearance.ambientSettings": JSON.stringify(mixed) }));
    expect(readAmbientTuning(mixedDevice)).toEqual({ ...DEFAULT_AMBIENT_TUNING, blur: 40, light: 60 });

    const unreadable = createDeviceStore(memoryStorage({ "rr_device.appearance.ambientSettings": "[1, 2]" }));
    expect(readAmbientTuning(unreadable)).toEqual(DEFAULT_AMBIENT_TUNING);
  });

  it("show their values with their units", () => {
    expect(AMBIENT_SETTINGS.map((setting) => formatAmbientSetting(setting, DEFAULT_AMBIENT_TUNING[setting]))).toEqual([
      "1 per second",
      "2 s",
      "64 px",
      "50%",
      "75%",
      "100%"
    ]);
    expect(formatAmbientSetting("rate", 0.25)).toBe("0.25 per second");
    expect(formatAmbientSetting("fade", 1.5)).toBe("1.5 s");
  });
});

describe("ambient mode's glow", () => {
  it("shows while ambient mode is on and an item plays, and hides while it is off, before anything plays, and once the media fails", () => {
    const page = setup();
    expect(page.layer.hidden).toBe(true);
    page.play("video");
    expect(page.layer.hidden).toBe(false);
    page.enabled.value = false;
    expect(page.layer.hidden).toBe(true);
    page.enabled.value = true;
    expect(page.layer.hidden).toBe(false);

    page.failed.value = true;
    expect(page.layer.hidden).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(page.copiesOf(page.video)).toBe(0);
    page.failed.value = false;
    page.play("photo");
    expect(page.layer.hidden).toBe(false);
  });

  it("gives the layer its blur, both strengths, and saturation for the stylesheet's filter, as they change", () => {
    const page = setup();
    expect(Object.fromEntries(page.properties)).toEqual({
      "--ambient-blur": "64px",
      "--ambient-dark": "0.5",
      "--ambient-light": "0.75",
      "--ambient-saturation": "1"
    });
    page.tuning.value = { ...page.tuning.value, blur: 40, dark: 30, light: 60, saturation: 150 };
    expect(Object.fromEntries(page.properties)).toEqual({
      "--ambient-blur": "40px",
      "--ambient-dark": "0.3",
      "--ambient-light": "0.6",
      "--ambient-saturation": "1.5"
    });
  });

  it("copies a playing video's picture at the update rate, and holds while it is paused or the tab is hidden", () => {
    const page = setup({ tuning: { rate: 4 } });
    page.play("video");
    page.video.paused = false;
    vi.advanceTimersByTime(1_000);
    expect(page.copiesOf(page.video)).toBe(4);

    page.video.paused = true;
    vi.advanceTimersByTime(2_000);
    expect(page.copiesOf(page.video)).toBe(4);

    page.video.paused = false;
    page.setHidden(true);
    vi.advanceTimersByTime(2_000);
    expect(page.copiesOf(page.video)).toBe(4);

    page.setHidden(false);
    vi.advanceTimersByTime(250);
    expect(page.copiesOf(page.video)).toBe(5);
  });

  it("copies a new video's first picture once though it is paused, as when the browser blocks autoplay", () => {
    const page = setup();
    page.play("video");
    vi.advanceTimersByTime(5_000);
    expect(page.copiesOf(page.video)).toBe(1);
  });

  it("copies a photo once, and again when it shows again", () => {
    const page = setup();
    page.play("photo");
    vi.advanceTimersByTime(5_000);
    expect(page.copiesOf(page.photo)).toBe(1);
    page.play("photo");
    vi.advanceTimersByTime(5_000);
    expect(page.copiesOf(page.photo)).toBe(2);
  });

  it("waits until the video has a picture and the photo has loaded", () => {
    const page = setup();
    page.video.readyState = 1;
    page.play("video");
    page.video.paused = false;
    vi.advanceTimersByTime(3_000);
    expect(page.copiesOf(page.video)).toBe(0);
    page.video.readyState = 2;
    vi.advanceTimersByTime(1_000);
    expect(page.copiesOf(page.video)).toBe(1);

    page.photo.naturalWidth = 0;
    page.play("photo");
    vi.advanceTimersByTime(3_000);
    expect(page.copiesOf(page.photo)).toBe(0);
    page.photo.naturalWidth = 640;
    vi.advanceTimersByTime(1_000);
    expect(page.copiesOf(page.photo)).toBe(1);
  });

  it("applies a new update rate at once, not after the wait already set", () => {
    const page = setup({ tuning: { rate: 0.25 } });
    page.play("video");
    page.video.paused = false;
    vi.advanceTimersByTime(3_000);
    page.tuning.value = { ...page.tuning.value, rate: 2 };
    vi.advanceTimersByTime(500);
    expect(page.copiesOf(page.video)).toBe(1);
  });

  it("fades the canvas on screen from what it showed to each copy over the fade time, never clearing it", () => {
    const page = setup({ tuning: { fade: 2 } });
    page.play("video");
    vi.advanceTimersByTime(1_000);
    // The copy keeps what was on screen as where the fade starts.
    expect(page.from.calls).toEqual([
      { op: "clear", alpha: 1 },
      { op: "draw", alpha: 1, image: page.shown }
    ]);
    expect(page.frames.pending()).toBe(1);

    page.setClock(500);
    page.frames.run();
    expect(page.shown.calls).toEqual([
      { op: "draw", alpha: 1, image: page.from },
      { op: "draw", alpha: 0.25, image: page.to }
    ]);
    page.setClock(2_000);
    page.frames.run();
    expect(page.shown.calls.slice(2)).toEqual([
      { op: "draw", alpha: 1, image: page.from },
      { op: "draw", alpha: 1, image: page.to }
    ]);
    expect(page.frames.pending()).toBe(0);
    expect(page.shown.calls.some((call) => call.op === "clear")).toBe(false);
  });

  it("applies a new fade time to the fade under way", () => {
    const page = setup({ tuning: { fade: 2 } });
    page.play("video");
    vi.advanceTimersByTime(1_000);
    page.tuning.value = { ...page.tuning.value, fade: 1 };
    page.setClock(500);
    page.frames.run();
    expect(page.shown.calls.at(-1)).toEqual({ op: "draw", alpha: 0.5, image: page.to });
  });

  it("starts a copy that arrives mid-fade from what is on screen, carrying on in one fade", () => {
    const page = setup({ tuning: { rate: 1, fade: 2 } });
    page.play("video");
    page.video.paused = false;
    vi.advanceTimersByTime(1_000);
    page.setClock(1_000);
    page.frames.run();
    expect(page.frames.pending()).toBe(1);

    page.from.calls.length = 0;
    page.setClock(1_000);
    vi.advanceTimersByTime(1_000);
    // The new start is the canvas on screen, mid-fade, and the fade starts over from there.
    expect(page.from.calls).toEqual([
      { op: "clear", alpha: 1 },
      { op: "draw", alpha: 1, image: page.shown }
    ]);
    expect(page.frames.pending()).toBe(1);
    page.shown.calls.length = 0;
    page.setClock(1_500);
    page.frames.run();
    expect(page.shown.calls).toEqual([
      { op: "draw", alpha: 1, image: page.from },
      { op: "draw", alpha: 0.25, image: page.to }
    ]);
  });

  it("stops copying and fading while ambient mode is off, and once detached", () => {
    const page = setup();
    page.play("video");
    page.video.paused = false;
    vi.advanceTimersByTime(1_000);
    expect(page.frames.pending()).toBe(1);
    page.enabled.value = false;
    expect(page.frames.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    page.enabled.value = true;
    vi.advanceTimersByTime(1_000);
    expect(page.copiesOf(page.video)).toBe(2);
    page.ambient.detach();
    expect(page.frames.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("copies a photo again when ambient mode turns back on, since turning it off cut its fade short", () => {
    const page = setup({ tuning: { fade: 2 } });
    page.play("photo");
    vi.advanceTimersByTime(1_000);
    page.setClock(500);
    page.frames.run();
    expect(page.frames.pending()).toBe(1);
    page.enabled.value = false;
    expect(page.frames.pending()).toBe(0);

    page.from.calls.length = 0;
    page.enabled.value = true;
    vi.advanceTimersByTime(1_000);
    expect(page.copiesOf(page.photo)).toBe(2);
    // The fade carries on from the canvas on screen, where the cut-short fade left it.
    expect(page.from.calls).toEqual([
      { op: "clear", alpha: 1 },
      { op: "draw", alpha: 1, image: page.shown }
    ]);
    expect(page.frames.pending()).toBe(1);
  });

  it("draws nothing where the browser gives a canvas no 2D context", () => {
    const enabled = signal(true);
    const nothing = (): AmbientCanvas => ({ width: 0, height: 0, getContext: () => null });
    const ambient = createAmbient({
      enabled,
      tuning: signal(DEFAULT_AMBIENT_TUNING),
      current: signal({ mediaType: "video" }),
      attemptId: signal(1),
      failed: signal(false),
      frames: fakeFrames(),
      tabHidden: () => false,
      createCanvas: nothing
    });
    const layer = { hidden: true, style: { setProperty: () => {} } };
    ambient.attach({ layer, canvas: { width: 32, height: 18, getContext: () => null }, video: { paused: false, readyState: 4 }, photo: { complete: false, naturalWidth: 0 } });
    expect(() => vi.advanceTimersByTime(3_000)).not.toThrow();
    expect(layer.hidden).toBe(false);
  });
});
