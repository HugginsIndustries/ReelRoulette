import { signal } from "@preact/signals";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAudioStage,
  FADE_OUT_MS,
  GAIN_GLIDE_SECONDS,
  GAIN_STAGE_FAILED_NOTICE,
  LIMITER_MAKEUP_DB,
  COMPRESSION_GLIDE_SECONDS,
  TURN_OFF_ENHANCED_AUDIO,
  VOLUME_INDICATOR_MS,
  type AudioVideoElement,
  type GainStageContext
} from "../playback/audioStage";
import { COMPRESSION_PRESETS, compressionGainDb, type CompressorSetting } from "../playback/compression";
import { createDeviceStore } from "../state/deviceStore";

/** A stand-in for the `<video>` element: `play` and `pause` fire their events as a browser does. */
function fakeVideo() {
  const events = new EventTarget();
  const video = {
    volume: 1,
    muted: false,
    paused: true,
    pauses: 0,
    play() {
      if (video.paused) {
        video.paused = false;
        events.dispatchEvent(new Event("play"));
        events.dispatchEvent(new Event("playing"));
      }
      return Promise.resolve();
    },
    pause() {
      video.pauses += 1;
      video.paused = true;
    },
    addEventListener: (type: string, listener: () => void) => events.addEventListener(type, listener),
    removeEventListener: (type: string, listener: () => void) => events.removeEventListener(type, listener)
  };
  return video satisfies AudioVideoElement;
}

type GainCall = ["set", number] | ["glide", number, number];

/** A node the fake context built: what it connects to, and for a gain, each change to it and the level it is at. */
interface FakeGain {
  kind: "gain";
  calls: GainCall[];
  level: number;
  next: unknown;
}

/** A compressor's setting: the value it is at, and each change to it, a direct set or a glide. */
interface FakeParam {
  value: number;
  calls: GainCall[];
}

/** A compressor the fake context built, the limiter or compression's, with its settings. */
interface FakeCompressor {
  kind: "compressor";
  threshold: FakeParam;
  knee: FakeParam;
  ratio: FakeParam;
  attack: FakeParam;
  release: FakeParam;
  next: unknown;
}

function fakeParam(initial: number): FakeParam & { setTargetAtTime(value: number, start: number, timeConstant: number): void } {
  let value = initial;
  const param = {
    calls: [] as GainCall[],
    get value() {
      return value;
    },
    set value(next: number) {
      param.calls.push(["set", next]);
      value = next;
    },
    setTargetAtTime(next: number, _start: number, timeConstant: number) {
      param.calls.push(["glide", next, timeConstant]);
      value = next;
    }
  };
  return param;
}

/**
 * A stand-in for Web Audio's context: it records the elements it routes, the nodes it builds and how they connect, and
 * each change to a gain. `calls` and `level` are the volume's gain's, the last before the speakers.
 */
function fakeContext(options: { refuse?: boolean } = {}) {
  const destination = { kind: "destination" };
  const nodes: Array<FakeGain | FakeCompressor> = [];
  const source = { next: null as unknown };
  const context = {
    state: "suspended",
    currentTime: 0,
    destination,
    routed: [] as unknown[],
    resumes: 0,
    /** The nodes from the routed video to the speakers, in order. */
    chain(): Array<FakeGain | FakeCompressor> {
      const chain: Array<FakeGain | FakeCompressor> = [];
      for (let node = source.next as FakeGain | FakeCompressor | null; node && node !== (destination as unknown); node = node.next as FakeGain | FakeCompressor | null) {
        chain.push(node);
      }
      return chain;
    },
    /** Loudness normalization's gain, the first after the video. */
    get normalization(): FakeGain {
      return source.next as FakeGain;
    },
    get volume(): FakeGain {
      return nodes.find((node): node is FakeGain => node.kind === "gain" && node.next === destination)!;
    },
    get calls(): GainCall[] {
      return context.volume.calls;
    },
    get level(): number {
      return context.volume.level;
    },
    resume() {
      context.resumes += 1;
      if (options.refuse) return Promise.reject(new DOMException("Not allowed", "NotAllowedError"));
      context.state = "running";
      return Promise.resolve();
    },
    close() {
      context.state = "closed";
      return Promise.resolve();
    },
    createMediaElementSource(element: unknown) {
      context.routed.push(element);
      return { connect: (node: unknown) => (source.next = node) };
    },
    createGain() {
      const node: FakeGain & { gain: unknown; connect(next: unknown): unknown } = {
        kind: "gain",
        calls: [],
        level: 1,
        next: null,
        gain: {
          setValueAtTime(level: number) {
            node.calls.push(["set", level]);
            node.level = level;
          },
          setTargetAtTime(level: number, _start: number, timeConstant: number) {
            node.calls.push(["glide", level, timeConstant]);
            node.level = level;
          }
        },
        connect: (next: unknown) => (node.next = next)
      };
      nodes.push(node);
      return node;
    },
    createDynamicsCompressor() {
      // Web Audio's defaults, which the limiter and compression's compressor must not keep.
      const node: FakeCompressor & { connect(next: unknown): unknown } = {
        kind: "compressor",
        threshold: fakeParam(-24),
        knee: fakeParam(30),
        ratio: fakeParam(12),
        attack: fakeParam(0.003),
        release: fakeParam(0.25),
        next: null,
        connect: (next: unknown) => (node.next = next)
      };
      nodes.push(node);
      return node;
    }
  };
  return context;
}

/** An audio stage on a device whose store starts with `saved`, with each context it builds, the notices it shows, and the lines it relays. */
function setup(
  options: {
    saved?: Record<string, string>;
    volumeReadOnly?: boolean;
    refuse?: boolean;
    unavailable?: boolean;
    turnOff?: boolean;
    normalizationGainDb?: number;
    compressor?: CompressorSetting;
  } = {}
) {
  const kept = new Map(Object.entries(options.saved ?? {}));
  const device = createDeviceStore({ getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) });
  const contexts: Array<ReturnType<typeof fakeContext>> = [];
  const notices: Array<{ message: string; action: string }> = [];
  const relayed: string[] = [];
  let renewals = 0;
  const activation = new EventTarget();
  const normalizationGainDb = signal(options.normalizationGainDb ?? 0);
  const compressor = signal<CompressorSetting>(options.compressor ?? { on: false, values: COMPRESSION_PRESETS.medium });
  const audio = createAudioStage({
    device,
    dialogs: {
      noticeWithAction(message, action) {
        notices.push({ message, action });
        return Promise.resolve(options.turnOff ?? false);
      }
    },
    relay: (_level, message) => relayed.push(message),
    renewVideo: () => void (renewals += 1),
    normalizationGainDb,
    compressor,
    volumeReadOnly: options.volumeReadOnly ?? false,
    createContext() {
      if (options.unavailable) throw new Error("Web Audio is unavailable");
      const context = fakeContext({ refuse: options.refuse });
      contexts.push(context);
      return context as unknown as GainStageContext;
    },
    activation
  });
  const video = fakeVideo();
  audio.attach(video);
  return {
    audio,
    video,
    kept,
    contexts,
    notices,
    relayed,
    normalizationGainDb,
    compressor,
    renewals: () => renewals,
    async tap(type: "pointerdown" | "pointerup" | "keydown" = "pointerup") {
      activation.dispatchEvent(new Event(type));
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createAudioStage", () => {
  it("starts the gain stage on a tap's pointerup or a key, not a pointerdown, routing the video through it silent", async () => {
    const page = setup();
    await page.tap("pointerdown");
    expect(page.contexts).toHaveLength(0);
    expect(page.audio.running.value).toBe(false);

    await page.tap("pointerup");
    expect(page.contexts).toHaveLength(1);
    expect(page.contexts[0]!.routed).toEqual([page.video]);
    expect(page.contexts[0]!.calls).toEqual([["set", 0]]);
    expect(page.audio.running.value).toBe(true);
    expect(page.relayed).toEqual(["audio=gain-stage-started"]);

    // Once it runs, a tap only resumes it after the browser suspends it.
    await page.tap("pointerup");
    expect(page.contexts).toHaveLength(1);
    page.contexts[0]!.state = "suspended";
    await page.tap("keydown");
    expect(page.contexts[0]!.resumes).toBe(2);

    const keyed = setup();
    await keyed.tap("keydown");
    expect(keyed.audio.running.value).toBe(true);
  });

  it("fades in from silence as the video plays, and glides to each new volume and Mute, never jumping", async () => {
    const page = setup();
    await page.tap();
    await page.audio.play(page.video);
    const glide = (level: number): GainCall => ["glide", level, GAIN_GLIDE_SECONDS];
    expect(page.contexts[0]!.calls).toEqual([["set", 0], ["set", 0], glide(1)]);

    page.audio.setVolume(40);
    page.audio.toggleMute();
    page.audio.toggleMute();
    expect(page.contexts[0]!.calls.slice(3)).toEqual([glide(0.4), glide(0), glide(0.4)]);
    // Through the gain stage, the element plays at full volume and unmuted, and the gain sets the level.
    expect([page.video.volume, page.video.muted]).toEqual([1, false]);
    expect(GAIN_GLIDE_SECONDS).toBeLessThanOrEqual(0.03);
  });

  it("fades out on pause and pauses the video once it is silent, and a play during the fade glides back without pausing", async () => {
    vi.useFakeTimers();
    const page = setup();
    await page.tap();
    await page.audio.play(page.video);

    page.audio.pause(page.video);
    expect(page.audio.pausing()).toBe(true);
    expect(page.video.paused).toBe(false);
    expect(page.contexts[0]!.level).toBe(0);
    vi.advanceTimersByTime(FADE_OUT_MS);
    expect(page.video.paused).toBe(true);
    expect(page.audio.pausing()).toBe(false);

    await page.audio.play(page.video);
    expect(page.contexts[0]!.calls.slice(-2)).toEqual([["set", 0], ["glide", 1, GAIN_GLIDE_SECONDS]]);

    page.audio.pause(page.video);
    vi.advanceTimersByTime(FADE_OUT_MS / 2);
    await page.audio.play(page.video);
    vi.advanceTimersByTime(FADE_OUT_MS * 2);
    expect(page.video.paused).toBe(false);
    expect(page.video.pauses).toBe(1);
    expect(page.contexts[0]!.level).toBe(1);

    // A new item stops the video at once, so a fade still under way pauses nothing later.
    page.audio.pause(page.video);
    page.audio.cancelPause();
    vi.advanceTimersByTime(FADE_OUT_MS * 2);
    expect(page.video.pauses).toBe(1);
  });

  it("before the gain stage runs, and with Enhanced audio off, plays directly at the element's own volume and mute, pausing at once", async () => {
    const page = setup();
    page.audio.setVolume(30);
    page.audio.toggleMute();
    expect([page.video.volume, page.video.muted]).toEqual([0.3, true]);
    await page.audio.play(page.video);
    page.audio.pause(page.video);
    expect(page.video.paused).toBe(true);

    const off = setup({ saved: { "rr_device.audio.enhanced": "false" } });
    await off.tap();
    expect(off.contexts).toHaveLength(0);
    off.audio.setVolume(55);
    expect(off.video.volume).toBeCloseTo(0.55);
  });

  it("shows the volume slider from the start where the element's volume is read-only, hiding it only while Enhanced audio is off", async () => {
    const page = setup({ volumeReadOnly: true });
    expect(page.audio.volumeShown.value).toBe(true);
    // The level set before the gain stage runs is the one it starts at.
    page.audio.setVolume(60);
    expect(page.video.volume).toBe(1);
    await page.tap();
    await page.audio.play(page.video);
    expect(page.contexts[0]!.level).toBeCloseTo(0.6);

    page.audio.setEnhanced(false);
    expect(page.audio.volumeShown.value).toBe(false);
    page.audio.setEnhanced(true);
    expect(page.audio.volumeShown.value).toBe(true);

    expect(setup({ volumeReadOnly: false, saved: { "rr_device.audio.enhanced": "false" } }).audio.volumeShown.value).toBe(true);
  });

  it("turning Enhanced audio off closes the gain stage and asks for a new element only once the video went through it", async () => {
    const page = setup();
    page.audio.setEnhanced(false);
    expect(page.renewals()).toBe(0);
    page.audio.setEnhanced(true);
    expect(page.contexts).toHaveLength(1);
    await Promise.resolve();

    page.audio.setEnhanced(false);
    expect(page.contexts[0]!.state).toBe("closed");
    expect(page.audio.running.value).toBe(false);
    expect(page.renewals()).toBe(1);

    // The new element plays directly.
    const fresh = fakeVideo();
    page.audio.setVolume(70);
    page.audio.attach(fresh);
    expect([fresh.volume, fresh.muted]).toEqual([0.7, false]);
  });

  it("says so once when the gain stage can't start, and its action turns Enhanced audio off on this device", async () => {
    const unavailable = setup({ unavailable: true });
    await unavailable.tap();
    await unavailable.tap();
    expect(unavailable.notices).toEqual([{ message: GAIN_STAGE_FAILED_NOTICE, action: TURN_OFF_ENHANCED_AUDIO }]);
    // It names no device, since the app finds a read-only volume at runtime.
    expect(GAIN_STAGE_FAILED_NOTICE).toBe("Audio processing couldn't start on this device. Turn off Enhanced audio to play sound directly.");
    expect(unavailable.relayed).toEqual(["audio=gain-stage-failed error=Error"]);
    expect(unavailable.audio.enhanced.value).toBe(true);

    const refused = setup({ refuse: true, turnOff: true });
    await refused.tap();
    await Promise.resolve();
    expect(refused.notices).toHaveLength(1);
    expect(refused.relayed).toEqual(["audio=gain-stage-failed error=NotAllowedError"]);
    expect(refused.audio.enhanced.value).toBe(false);
    expect(refused.kept.get("rr_device.audio.enhanced")).toBe("false");
    // The video went through the stage before it failed, so a new element takes over.
    expect(refused.renewals()).toBe(1);
  });

  it("keeps the volume, Mute, Enhanced audio, and the volume step on this device, and a new page reads them back", () => {
    const page = setup();
    expect([page.audio.volume.value, page.audio.muted.value, page.audio.enhanced.value, page.audio.volumeStep.value]).toEqual([100, false, true, 5]);
    page.audio.setVolume(42.4);
    page.audio.toggleMute();
    page.audio.setEnhanced(false);
    page.audio.setVolumeStep(10);
    expect(Object.fromEntries(page.kept)).toEqual({
      "rr_device.player.volume": "42",
      "rr_device.player.muted": "true",
      "rr_device.audio.enhanced": "false",
      "rr_device.audio.volumeStep": "10"
    });

    const next = setup({ saved: Object.fromEntries(page.kept) });
    expect([next.audio.volume.value, next.audio.muted.value, next.audio.enhanced.value, next.audio.volumeStep.value]).toEqual([42, true, false, 10]);
    // While muted, the slider shows 0, and unmuting brings back the kept volume.
    expect(next.audio.shownVolume.value).toBe(0);
    next.audio.toggleMute();
    expect(next.audio.shownVolume.value).toBe(42);
    // A kept volume outside 1 to 100, 0 among them since 0 is muted, and a volume step not offered read as the defaults.
    expect(setup({ saved: { "rr_device.player.volume": "140" } }).audio.volume.value).toBe(100);
    expect(setup({ saved: { "rr_device.player.volume": "0" } }).audio.volume.value).toBe(100);
    expect(setup({ saved: { "rr_device.audio.volumeStep": "3" } }).audio.volumeStep.value).toBe(5);
  });
});

/**
 * The gain stage's chain: normalization's gain, compression's compressor and the gain after it, the limiter, the gain
 * taking back its makeup, and the volume's gain.
 */
const CHAIN = ["gain", "compressor", "gain", "compressor", "gain", "gain"];

describe("loudness normalization's chain", () => {
  const glide = (level: number): GainCall => ["glide", level, GAIN_GLIDE_SECONDS];
  const gain = (db: number) => Math.pow(10, db / 20);

  it("runs from the video through normalization's gain, compression, the limiter at the ceiling, and the gain that takes back its makeup, to the volume's gain", async () => {
    const page = setup({ normalizationGainDb: -6 });
    await page.tap();
    const context = page.contexts[0]!;
    const chain = context.chain();
    expect(chain.map((node) => node.kind)).toEqual(CHAIN);
    expect(chain[0]).toBe(context.normalization);
    expect(chain[5]).toBe(context.volume);
    expect(context.volume.next).toBe(context.destination);

    const limiter = chain[3] as FakeCompressor;
    expect([limiter.threshold.value, limiter.knee.value, limiter.ratio.value, limiter.attack.value]).toEqual([-1, 0, 20, 0]);
    // Web Audio's makeup gain for that curve: the inverse of its gain at full scale, -0.95 dB, to the power 0.6.
    expect(LIMITER_MAKEUP_DB).toBeCloseTo(0.57, 9);
    expect((chain[4] as FakeGain).calls).toEqual([["set", gain(-LIMITER_MAKEUP_DB)]]);
    expect(context.normalization.calls).toEqual([["set", gain(-6)]]);
  });

  it("keeps the limiter in the chain with normalization off, at no gain", async () => {
    const page = setup({ normalizationGainDb: 0 });
    await page.tap();
    expect(page.contexts[0]!.chain().map((node) => node.kind)).toEqual(CHAIN);
    expect(page.contexts[0]!.normalization.level).toBe(1);
  });

  it("starts each video at its own gain, set while it starts from silence", async () => {
    const page = setup({ normalizationGainDb: -6 });
    await page.tap();
    await page.audio.play(page.video);
    const context = page.contexts[0]!;
    expect(context.normalization.calls).toEqual([["set", gain(-6)], ["set", gain(-6)]]);

    // The next video, a quiet one: the player stops the last at once and plays the new one, which starts silent.
    page.video.pause();
    page.normalizationGainDb.value = 9;
    await page.audio.play(page.video);
    expect(context.normalization.calls.at(-1)).toEqual(["set", gain(9)]);
    expect(context.normalization.level).toBeCloseTo(gain(9), 9);
    expect(context.volume.calls.slice(-2)).toEqual([["set", 0], glide(1)]);
  });

  it("glides the playing video's gain to each new value as a setting changes, never jumping, and leaves the volume as it is", async () => {
    const page = setup({ normalizationGainDb: 4 });
    await page.tap();
    await page.audio.play(page.video);
    const context = page.contexts[0]!;
    const volumeCalls = context.volume.calls.length;

    page.normalizationGainDb.value = 2.5;
    page.normalizationGainDb.value = 0;
    expect(context.normalization.calls.slice(2)).toEqual([glide(gain(2.5)), glide(1)]);
    expect(context.volume.calls).toHaveLength(volumeCalls);
  });

  it("starts a gain stage turned on during a video at that video's gain", async () => {
    const page = setup({ saved: { "rr_device.audio.enhanced": "false" }, normalizationGainDb: -3 });
    await page.audio.play(page.video);
    page.normalizationGainDb.value = -4.5;
    page.audio.setEnhanced(true);
    await Promise.resolve();
    expect(page.contexts[0]!.normalization.calls).toEqual([["set", gain(-4.5)]]);
  });
});

describe("Compression", () => {
  const MEDIUM = COMPRESSION_PRESETS.medium;
  const settingsOf = (values: typeof MEDIUM) => [values.thresholdDb, values.kneeDb, values.ratio, values.attackSeconds, values.releaseSeconds];
  /** Off, no compression: a ratio of 1 with no knee, at 0 dB, with the strength's attack and release, and no gain. */
  const OFF = [0, 0, 1, MEDIUM.attackSeconds, MEDIUM.releaseSeconds];
  const level = (db: number) => Math.pow(10, db / 20);

  /** Compression's compressor and the gain after it, in the newest gain stage. */
  function compression(page: ReturnType<typeof setup>): { compressor: FakeCompressor; gain: FakeGain } {
    const chain = page.contexts.at(-1)!.chain();
    return { compressor: chain[1] as FakeCompressor, gain: chain[2] as FakeGain };
  }

  function params(compressor: FakeCompressor): FakeParam[] {
    return [compressor.threshold, compressor.knee, compressor.ratio, compressor.attack, compressor.release];
  }

  const valuesOf = (compressor: FakeCompressor) => params(compressor).map((param) => param.value);
  /** Each setting was set once, as the stage started, and never glided. */
  const setOnce = (compressor: FakeCompressor) => params(compressor).every((param) => param.calls.length === 1 && param.calls[0]![0] === "set");

  it("sits between normalization's gain and the limiter with compression and normalization each on or off: off, no compression and no gain", async () => {
    for (const on of [false, true]) {
      for (const normalizationGainDb of [0, -6]) {
        const label = `compression ${on ? "on" : "off"}, normalization's gain ${normalizationGainDb} dB`;
        const page = setup({ compressor: { on, values: MEDIUM }, normalizationGainDb });
        await page.tap();
        const chain = page.contexts[0]!.chain();
        const { compressor, gain } = compression(page);
        expect(chain.map((node) => node.kind), label).toEqual(CHAIN);
        expect(valuesOf(compressor), label).toEqual(on ? settingsOf(MEDIUM) : OFF);
        expect(setOnce(compressor), label).toBe(true);
        // On, the gain takes back Web Audio's makeup and applies the strength's own; off, it applies none.
        expect(gain.calls, label).toEqual([["set", on ? level(compressionGainDb(MEDIUM)) : 1]]);
        const limiter = chain[3] as FakeCompressor;
        expect([limiter.threshold.value, limiter.knee.value, limiter.ratio.value, limiter.attack.value], label).toEqual([-1, 0, 20, 0]);
      }
    }
  });

  it("glides on and off, and to another strength's values, with its own time constant, never jumping, without changing the chain or touching the other gains", async () => {
    const page = setup({ normalizationGainDb: -6 });
    await page.tap();
    await page.audio.play(page.video);
    const context = page.contexts[0]!;
    const chain = context.chain();
    const { compressor, gain } = compression(page);
    const otherGains = [context.normalization.calls.length, context.volume.calls.length];
    const glides = (values: number[]): GainCall[] => values.map((value) => ["glide", value, COMPRESSION_GLIDE_SECONDS]);
    const lastCalls = () => [...params(compressor).map((param) => param.calls.at(-1)), gain.calls.at(-1)];
    const STRONG = COMPRESSION_PRESETS.strong;

    page.compressor.value = { on: true, values: MEDIUM };
    expect(lastCalls()).toEqual(glides([...settingsOf(MEDIUM), level(compressionGainDb(MEDIUM))]));
    page.compressor.value = { on: true, values: STRONG };
    expect(lastCalls()).toEqual(glides([...settingsOf(STRONG), level(compressionGainDb(STRONG))]));
    page.compressor.value = { on: false, values: STRONG };
    expect(lastCalls()).toEqual(glides([0, 0, 1, STRONG.attackSeconds, STRONG.releaseSeconds, 1]));
    // Only the stage's start set a value directly.
    expect([...params(compressor), gain].map((node) => node.calls.filter(([kind]) => kind === "set").length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(context.chain()).toEqual(chain);
    expect([context.normalization.calls.length, context.volume.calls.length]).toEqual(otherGains);
  });

  it("turned on before the gain stage runs, starts with it", async () => {
    const page = setup();
    page.compressor.value = { on: true, values: COMPRESSION_PRESETS.light };
    await page.tap();
    const { compressor, gain } = compression(page);
    expect(valuesOf(compressor)).toEqual(settingsOf(COMPRESSION_PRESETS.light));
    expect(setOnce(compressor)).toBe(true);
    expect(gain.calls).toEqual([["set", level(compressionGainDb(COMPRESSION_PRESETS.light))]]);
  });
});

describe("the muted-volume rules", () => {
  /** What the slider shows, and whether sound is muted. */
  function sound(page: ReturnType<typeof setup>): string {
    return `${page.audio.muted.value ? "muted" : "unmuted"} ${page.audio.shownVolume.value}`;
  }

  /** Unmutes, and returns the volume the slider then shows. */
  function unmute(page: ReturnType<typeof setup>): number {
    if (page.audio.muted.value) page.audio.toggleMute();
    return page.audio.shownVolume.value;
  }

  /** A slider drag through `values`, as one change. */
  function slide(page: ReturnType<typeof setup>, ...values: number[]): void {
    page.audio.beginVolumeChange();
    values.forEach((value) => page.audio.setVolume(value));
    page.audio.endVolumeChange();
  }

  it("Mute moves the slider to 0 and remembers the volume, which unmuting restores", () => {
    const page = setup();
    page.audio.setVolume(60);
    page.audio.toggleMute();
    expect(sound(page)).toBe("muted 0");
    expect(page.audio.volume.value).toBe(60);
    page.audio.toggleMute();
    expect(sound(page)).toBe("unmuted 60");
  });

  it("raising the volume while muted, by the slider or a step, unmutes and starts from 0, so the remembered volume isn't restored", () => {
    const page = setup();
    page.audio.setVolume(60);
    page.audio.toggleMute();
    slide(page, 10, 30);
    expect(sound(page)).toBe("unmuted 30");
    page.audio.toggleMute();
    expect(unmute(page)).toBe(30);

    page.audio.setVolume(60);
    page.audio.toggleMute();
    page.audio.stepVolume(1);
    expect(sound(page)).toBe("unmuted 5");
    page.audio.toggleMute();
    expect(unmute(page)).toBe(5);
  });

  it("lowering the volume while muted changes nothing", () => {
    const page = setup();
    page.audio.setVolume(60);
    page.audio.toggleMute();
    page.audio.stepVolume(-1);
    slide(page, 0);
    expect(sound(page)).toBe("muted 0");
    expect(Object.fromEntries(page.kept)).toMatchObject({ "rr_device.player.volume": "60", "rr_device.player.muted": "true" });
    expect(unmute(page)).toBe(60);
  });

  it("lowering it to 0 while not muted mutes, and unmuting restores the volume from before the change: a drag's start, or the volume before the last step", () => {
    const page = setup();
    page.audio.setVolume(40);
    slide(page, 25, 10, 0);
    expect(sound(page)).toBe("muted 0");
    expect(Object.fromEntries(page.kept)).toMatchObject({ "rr_device.player.volume": "40", "rr_device.player.muted": "true" });
    expect(unmute(page)).toBe(40);

    // A two-finger drag is one change of steps.
    page.audio.setVolume(15);
    page.audio.beginVolumeChange();
    page.audio.stepVolume(-1);
    page.audio.stepVolume(-1);
    page.audio.stepVolume(-1);
    page.audio.endVolumeChange();
    expect(sound(page)).toBe("muted 0");
    expect(unmute(page)).toBe(15);

    // Each wheel notch and [ or ] press is a change of its own.
    page.audio.setVolume(8);
    page.audio.stepVolume(-1);
    page.audio.stepVolume(-1);
    expect(sound(page)).toBe("muted 0");
    expect(unmute(page)).toBe(3);
    page.audio.setVolume(1);
    page.audio.setVolume(0);
    expect(sound(page)).toBe("muted 0");
    expect(unmute(page)).toBe(1);
  });

  it("a drag that starts muted, raises the volume, and comes back to 0 leaves the remembered volume as it was", () => {
    const page = setup();
    page.audio.setVolume(40);
    page.audio.toggleMute();
    slide(page, 20, 0);
    expect(sound(page)).toBe("muted 0");
    expect(unmute(page)).toBe(40);
  });

  it("Mute ends a change left under way, so a later step counts from its own start", () => {
    const page = setup();
    page.audio.setVolume(40);
    page.audio.beginVolumeChange();
    page.audio.setVolume(10);
    page.audio.toggleMute();
    page.audio.toggleMute();
    page.audio.stepVolume(-1);
    page.audio.stepVolume(-1);
    expect(sound(page)).toBe("muted 0");
    expect(unmute(page)).toBe(5);
  });

  it("glides the gain to each level the rules give, never jumping", async () => {
    const page = setup();
    await page.tap();
    await page.video.play();
    const context = page.contexts[0]!;
    page.audio.setVolume(10);
    page.audio.stepVolume(-2);
    expect(context.level).toBe(0);
    page.audio.stepVolume(1);
    expect(context.level).toBeCloseTo(0.05);
    expect(context.calls.slice(2).every(([kind]) => kind === "glide")).toBe(true);
  });
});

describe("the volume indicator", () => {
  it("shows for a step, a step down while muted too, until it fades out after the last one, and not for the slider", () => {
    vi.useFakeTimers();
    const page = setup();
    page.audio.setVolume(30);
    expect(page.audio.indicatorShown.value).toBe(false);

    page.audio.stepVolume(1);
    expect(page.audio.indicatorShown.value).toBe(true);
    vi.advanceTimersByTime(VOLUME_INDICATOR_MS - 100);
    page.audio.stepVolume(1);
    vi.advanceTimersByTime(VOLUME_INDICATOR_MS - 100);
    expect(page.audio.indicatorShown.value).toBe(true);
    vi.advanceTimersByTime(100);
    expect(page.audio.indicatorShown.value).toBe(false);

    page.audio.toggleMute();
    page.audio.stepVolume(-1);
    expect([page.audio.indicatorShown.value, page.audio.shownVolume.value]).toEqual([true, 0]);
  });

  it("shows for M, muting and unmuting, until it fades out, and not for the Mute button", () => {
    vi.useFakeTimers();
    const page = setup();
    page.audio.toggleMute();
    page.audio.toggleMute();
    expect(page.audio.indicatorShown.value).toBe(false);

    page.audio.toggleMute({ byKey: true });
    expect([page.audio.indicatorShown.value, page.audio.muted.value]).toEqual([true, true]);
    vi.advanceTimersByTime(VOLUME_INDICATOR_MS - 100);
    page.audio.toggleMute({ byKey: true });
    vi.advanceTimersByTime(VOLUME_INDICATOR_MS - 100);
    expect([page.audio.indicatorShown.value, page.audio.muted.value]).toEqual([true, false]);
    vi.advanceTimersByTime(100);
    expect(page.audio.indicatorShown.value).toBe(false);
  });
});
