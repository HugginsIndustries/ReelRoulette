import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAudioStage,
  FADE_OUT_MS,
  GAIN_GLIDE_SECONDS,
  GAIN_STAGE_FAILED_NOTICE,
  TURN_OFF_ENHANCED_AUDIO,
  type AudioVideoElement,
  type GainStageContext
} from "../playback/audioStage";
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

/** A stand-in for Web Audio's context: it records the elements it routes and each change to its gain. */
function fakeContext(options: { refuse?: boolean } = {}) {
  const calls: GainCall[] = [];
  const context = {
    state: "suspended",
    currentTime: 0,
    destination: {},
    routed: [] as unknown[],
    calls,
    level: 1,
    resumes: 0,
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
      return { connect: (node: unknown) => node };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime(level: number) {
            calls.push(["set", level]);
            context.level = level;
          },
          setTargetAtTime(level: number, _start: number, timeConstant: number) {
            calls.push(["glide", level, timeConstant]);
            context.level = level;
          }
        },
        connect: (next: unknown) => next
      };
    }
  };
  return context;
}

/** An audio stage on a device whose store starts with `saved`, with each context it builds, the notices it shows, and the lines it relays. */
function setup(options: { saved?: Record<string, string>; volumeReadOnly?: boolean; refuse?: boolean; unavailable?: boolean; turnOff?: boolean } = {}) {
  const kept = new Map(Object.entries(options.saved ?? {}));
  const device = createDeviceStore({ getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) });
  const contexts: Array<ReturnType<typeof fakeContext>> = [];
  const notices: Array<{ message: string; action: string }> = [];
  const relayed: string[] = [];
  let renewals = 0;
  const activation = new EventTarget();
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

  it("keeps the volume, Mute, and Enhanced audio on this device, and a new page reads them back", () => {
    const page = setup();
    expect([page.audio.volume.value, page.audio.muted.value, page.audio.enhanced.value]).toEqual([100, false, true]);
    page.audio.setVolume(42.4);
    page.audio.toggleMute();
    page.audio.setEnhanced(false);
    expect(Object.fromEntries(page.kept)).toEqual({
      "rr_device.player.volume": "42",
      "rr_device.player.muted": "true",
      "rr_device.audio.enhanced": "false"
    });

    const next = setup({ saved: Object.fromEntries(page.kept) });
    expect([next.audio.volume.value, next.audio.muted.value, next.audio.enhanced.value]).toEqual([42, true, false]);
    expect(setup({ saved: { "rr_device.player.volume": "140" } }).audio.volume.value).toBe(100);
  });
});
