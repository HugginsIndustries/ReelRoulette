import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer, type PlayerElements } from "../playback/player";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import type { ServerConnection, ServerConnectionEvents } from "../state/serverConnection";

const VIDEO: PlayingItem = {
  id: "/media/clip.mp4",
  itemId: "item-video",
  displayName: "clip.mp4",
  mediaType: "video",
  durationSeconds: 65,
  mediaUrl: "/api/media/item-video?token=t",
  isFavorite: false,
  isBlacklisted: false
};

const SECOND_VIDEO: PlayingItem = { ...VIDEO, id: "/media/other.mp4", itemId: "item-other", displayName: "other.mp4", mediaUrl: "/api/media/item-other?token=t" };

const PHOTO: PlayingItem = {
  ...VIDEO,
  id: "/media/beach.jpg",
  itemId: "item-photo",
  displayName: "beach.jpg",
  mediaType: "photo",
  durationSeconds: null,
  mediaUrl: "/api/media/item-photo?token=t"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A stand-in for the `<video>` element. Its `play` notes what was set when it was called. */
function fakeVideo() {
  const video = {
    src: "",
    muted: false,
    loop: false,
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    style: { display: "none" },
    plays: [] as string[],
    play() {
      video.plays.push(`display=${video.style.display} muted=${video.muted} src=${video.src}`);
      video.paused = false;
      return Promise.resolve();
    },
    pause() {
      video.paused = true;
    }
  };
  return video;
}

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
    /** How many frames are waiting. */
    pending: () => pending.size,
    /** Runs the frames waiting, as the browser does before it repaints. */
    run() {
      const due = [...pending.values()];
      pending.clear();
      due.forEach((callback) => callback());
    }
  };
}

function setup() {
  const requests: Array<{ path: string; body: any }> = [];
  const replies = new Map<string, () => Response>();
  const randomAnswers: unknown[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ path, body });
    if (path === "/api/random") {
      return json(randomAnswers.length > 0 ? randomAnswers.shift() : { mediaUrl: null });
    }
    return replies.get(path)?.() ?? json({});
  }) as typeof fetch;
  const relayed: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message)
  });
  const api = createAppApi("http://server", { onUnauthorized: () => {}, fetch: fetchImpl });
  const realRelay = api.relayLog;
  api.relayLog = async (level, message) => {
    relayed.push(message);
    await realRelay(level, message);
  };
  const listeners: Partial<Record<keyof ServerConnectionEvents, Array<(payload: any) => void>>> = {};
  const connection = {
    on(event: keyof ServerConnectionEvents, listener: (payload: any) => void) {
      (listeners[event] ??= []).push(listener);
    }
  } as unknown as ServerConnection;
  const notices: string[] = [];
  const dialogs = {
    notice(message: string) {
      notices.push(message);
      return Promise.resolve();
    }
  };
  const frames = fakeFrames();
  const player = createPlayer({ apiBaseUrl: "http://server/", store, api, connection, dialogs, fetch: fetchImpl, frames });
  const elements = {
    video: fakeVideo(),
    photo: { src: "", style: { display: "none" } },
    emptyState: { style: { display: "" } },
    seekSlider: { value: "0", max: "100" }
  };
  player.attach(elements satisfies PlayerElements);
  return {
    store,
    player,
    elements,
    frames,
    notices,
    relayed,
    replies,
    requests: (path: string) => requests.filter((request) => request.path === path),
    answerRandom: (...items: unknown[]) => randomAnswers.push(...items),
    emit: (event: keyof ServerConnectionEvents, payload: unknown) => listeners[event]?.forEach((listener) => listener(payload)),
    play(item: PlayingItem) {
      store.pushHistory({ ...item });
      player.playCurrent();
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createPlayer", () => {
  it("sets a video's source and shows it, then plays it with the saved mute, and records the play", async () => {
    const page = setup();
    page.player.toggleMute();
    page.play(VIDEO);

    const { video, photo, emptyState } = page.elements;
    expect(video.plays).toEqual(["display=block muted=true src=http://server/api/media/item-video?token=t"]);
    expect([video.style.display, photo.style.display, emptyState.style.display]).toEqual(["block", "none", "none"]);
    expect(page.player.playButton.value).toEqual({ disabled: false, showsPause: true });
    expect(page.player.seekBar.value).toEqual({ disabled: false, label: "Seek" });
    expect(page.player.muted.value).toBe(true);
    await vi.waitFor(() =>
      expect(page.requests("/api/record-playback").map((request) => request.body)).toEqual([
        { path: "item-video", clientId: "client-1", sessionId: "session-1" }
      ])
    );
    expect(page.relayed).toContain("playback=start attempt=1 hasCurrent=true mediaType=video");
  });

  it("does not record a play the server already recorded", async () => {
    const page = setup();
    page.store.pushHistory({ ...VIDEO });
    page.player.playCurrent({ recordPlayback: false });
    await Promise.resolve();
    expect(page.requests("/api/record-playback")).toHaveLength(0);
  });

  it("shows a photo, keeps Mute as it was, and ignores the video's events until a video plays again", () => {
    const page = setup();
    page.play(VIDEO);
    page.play(PHOTO);

    const { video, photo, seekSlider } = page.elements;
    expect([photo.src, photo.style.display, video.style.display]).toEqual(["http://server/api/media/item-photo?token=t", "block", "none"]);
    expect(video.paused).toBe(true);
    expect(page.player.muted.value).toBe(false);

    page.store.setStatus("Before");
    video.duration = 120;
    page.player.videoPlaying();
    page.player.videoFailed();
    page.player.videoMetadataLoaded();
    page.player.videoEnded();
    expect(page.store.status.value).toBe("Before");
    expect(seekSlider.max).toBe("100");

    page.player.photoFailed();
    expect(page.store.status.value).toBe("Photo file not found.");
    page.player.photoLoaded();
    expect(page.store.status.value).toBe("Playing");
  });

  it("only traces events from an attempt once another item is playing", () => {
    const page = setup();
    page.play(VIDEO);
    page.store.pushHistory({ ...SECOND_VIDEO });

    page.player.videoPlaying();
    expect(page.store.status.value).toBe("");
    expect(page.relayed).toContain("playback=video-onplaying-stale attempt=1 hasCurrent=true expectedPlayAttemptId=1");
  });

  it("picks at the end of history and moves through it with Previous and Next", async () => {
    const page = setup();
    page.answerRandom(VIDEO, SECOND_VIDEO);

    page.player.previous();
    page.player.next();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-video"));
    page.player.next();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-other"));

    page.player.previous();
    expect(page.store.current.value?.itemId).toBe("item-video");
    page.player.next();
    expect(page.store.current.value?.itemId).toBe("item-other");
    expect(page.requests("/api/random")).toHaveLength(2);
    expect(page.store.playAttemptId.value).toBe(4);
  });

  it("sends the pick request, and reports a pick the server refuses or cannot fill", async () => {
    const page = setup();
    await page.player.pickRandom();
    expect(page.requests("/api/random")[0]!.body).toMatchObject({
      clientId: "client-1",
      sessionId: "session-1",
      includeVideos: true,
      includePhotos: true,
      randomizationMode: "SmartShuffle"
    });
    expect(page.store.status.value).toBe("No eligible media for current filters.");
    expect(page.store.current.value).toBeNull();

    page.store.compatibilityBlocked.value = true;
    await page.player.pickRandom();
    expect(page.notices).toEqual(["Cannot play: server compatibility check failed."]);
    expect(page.store.status.value).toBe("No eligible media for current filters.");
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("with Autoplay, moves a photo on after the photo duration, and with Loop shows it again", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.answerRandom(SECOND_VIDEO);
    page.store.setPhotoDuration("4");
    page.player.toggleAutoplay();
    page.play(PHOTO);

    await vi.advanceTimersByTimeAsync(3_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.elements.video.src).toContain("item-other");

    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.play(PHOTO);
    const attempt = page.store.playAttemptId.value;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(page.store.playAttemptId.value).toBe(attempt + 1);
    expect(page.store.current.value?.itemId).toBe("item-photo");

    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.store.playAttemptId.value).toBe(attempt + 1);
  });

  it("restarts a photo's timer when the photo duration changes, and stops it when detached", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(10_000);

    page.store.setPhotoDuration("2");
    expect(page.store.playAttemptId.value).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(page.requests("/api/random")).toHaveLength(1);

    page.play(PHOTO);
    page.player.detach();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(1);
    page.player.playCurrent();
    expect(page.store.playAttemptId.value).toBe(3);
  });

  it("Loop sets the video to loop once a source was set, and Autoplay plays the next item when a video ends", () => {
    const page = setup();
    page.player.toggleLoop();
    expect(page.elements.video.loop).toBe(false);
    page.play(VIDEO);
    expect(page.elements.video.loop).toBe(true);

    page.player.toggleAutoplay();
    page.player.videoEnded();
    expect(page.requests("/api/random")).toHaveLength(0);
    page.player.toggleLoop();
    expect(page.elements.video.loop).toBe(false);
    page.player.videoEnded();
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("pauses a playing video for Auto-Pause and resumes it, and leaves a paused one paused", () => {
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;

    page.player.autoPause();
    expect(video.paused).toBe(true);
    expect(page.player.playButton.value.showsPause).toBe(false);
    page.player.autoResume();
    expect(video.paused).toBe(false);
    expect(page.relayed).toEqual(
      expect.arrayContaining(["playback=auto-pause attempt=1 hasCurrent=true mediaType=video", "playback=auto-resume attempt=1 hasCurrent=true mediaType=video"])
    );

    page.player.playOrPause();
    expect(video.paused).toBe(true);
    expect(page.player.playButton.value.showsPause).toBe(false);
    page.player.autoPause();
    page.player.autoResume();
    expect(video.paused).toBe(true);
  });

  it("holds a photo's timer for Auto-Pause and resumes it with the time it had left, without loading or recording it again", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(10_000);

    page.player.autoPause();
    expect(page.player.playButton.value.showsPause).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.player.timeText.value).toBe("0:10 / 0:15");

    page.player.autoResume();
    expect(page.store.playAttemptId.value).toBe(1);
    expect(page.player.playButton.value.showsPause).toBe(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.requests("/api/record-playback")).toHaveLength(1);
  });

  it("holds a looping photo's timer for Auto-Pause and resumes it with the time it had left", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleLoop();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(12_000);

    page.player.autoPause();
    await vi.advanceTimersByTimeAsync(60_000);
    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(page.store.playAttemptId.value).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.store.playAttemptId.value).toBe(2);
  });

  it("leaves playback as the user left it with Play/Pause while Auto-Pause held it", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;

    page.player.autoPause();
    page.player.playOrPause();
    page.player.playOrPause();
    page.player.autoResume();
    expect(video.paused).toBe(true);

    page.player.toggleAutoplay();
    page.play(PHOTO);
    page.player.autoPause();
    page.player.playOrPause();
    expect(page.player.playButton.value.showsPause).toBe(true);
    page.player.playOrPause();
    page.player.autoResume();
    expect(page.player.playButton.value.showsPause).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
  });

  it("neither resumes nor plays again an item that started while Auto-Pause held playback", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;
    page.player.autoPause();

    page.play(SECOND_VIDEO);
    // It doesn't play, as when the browser blocks its autoplay.
    video.pause();
    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(0);

    expect(video.paused).toBe(true);
    expect(video.plays).toHaveLength(2);
    expect(page.store.playAttemptId.value).toBe(2);
    expect(page.requests("/api/record-playback").map((request) => request.body.path)).toEqual(["item-video", "item-other"]);
  });

  it("disables the scrub bar before anything plays, with the time at 0:00 / 0:00", () => {
    const page = setup();
    expect(page.player.seekBar.value).toEqual({ disabled: true, label: "Seek" });
    expect(page.player.playButton.value).toEqual({ disabled: false, showsPause: false });
    expect(page.player.timeText.value).toBe("0:00 / 0:00");
  });

  it("shows a photo's timer on the scrub bar with Autoplay on and Loop off, filling as it runs", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    const { seekSlider } = page.elements;

    expect(page.player.seekBar.value).toEqual({ disabled: false, label: "Photo timer" });
    expect(page.player.playButton.value).toEqual({ disabled: false, showsPause: true });
    expect([seekSlider.max, seekSlider.value, page.player.timeText.value]).toEqual(["15", "0", "0:00 / 0:15"]);
    await vi.advanceTimersByTimeAsync(5_250);
    page.frames.run();
    expect([seekSlider.value, page.player.timeText.value]).toEqual(["5.25", "0:05 / 0:15"]);
  });

  it("moves the bar every animation frame from a photo's timer while it runs, and stops once it is held", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    const { seekSlider } = page.elements;

    for (const at of ["0.016", "0.032", "0.048"]) {
      await vi.advanceTimersByTimeAsync(16);
      page.frames.run();
      expect([seekSlider.value, page.player.timeText.value]).toEqual([at, "0:00 / 0:15"]);
    }
    expect(page.frames.pending()).toBe(1);

    page.player.playOrPause();
    expect(page.frames.pending()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seekSlider.value).toBe("0.048");
    page.player.playOrPause();
    expect(page.frames.pending()).toBe(1);
    page.player.autoPause();
    expect(page.frames.pending()).toBe(0);
    page.player.autoResume();
    expect(page.frames.pending()).toBe(1);
  });

  it("shows a video's elapsed time in the shape of its length", () => {
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;
    video.duration = 6517;
    page.player.videoMetadataLoaded();
    expect(page.player.timeText.value).toBe("0:00:00 / 1:48:37");

    video.currentTime = 746.4;
    page.player.videoTimeUpdated();
    expect(page.player.timeText.value).toBe("0:12:26 / 1:48:37");
  });

  it("moves the bar every animation frame from the video's time while it plays, and stops once it pauses", () => {
    const page = setup();
    page.play(VIDEO);
    const { video, seekSlider } = page.elements;
    video.duration = 120;
    page.player.videoMetadataLoaded();

    video.currentTime = 10.4;
    page.frames.run();
    expect([seekSlider.value, page.player.timeText.value]).toEqual(["10.4", "0:10 / 2:00"]);
    video.currentTime = 10.9;
    page.frames.run();
    expect([seekSlider.value, page.player.timeText.value]).toEqual(["10.9", "0:10 / 2:00"]);
    expect(page.frames.pending()).toBe(1);

    page.player.playOrPause();
    expect(page.frames.pending()).toBe(0);
    video.currentTime = 50;
    page.frames.run();
    expect(seekSlider.value).toBe("10.9");
    page.player.playOrPause();
    expect(page.frames.pending()).toBe(1);
    page.player.autoPause();
    expect(page.frames.pending()).toBe(0);
    page.player.autoResume();
    expect(page.frames.pending()).toBe(1);

    page.play(PHOTO);
    expect(page.frames.pending()).toBe(0);
    page.player.detach();
    expect(page.frames.pending()).toBe(0);
  });

  it("stops moving the bar once a video fails to load", () => {
    const page = setup();
    page.play(VIDEO);
    expect(page.frames.pending()).toBe(1);

    // A source that fails fires no pause, so the video still reads as playing.
    page.player.videoFailed();
    expect(page.elements.video.paused).toBe(false);
    expect(page.frames.pending()).toBe(0);
  });

  it("holds and resumes a photo's timer with Play/Pause, keeping the time left, and moves it with the bar", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(5_000);

    page.player.playOrPause();
    expect(page.player.playButton.value.showsPause).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.player.timeText.value).toBe("0:05 / 0:15");
    expect(page.requests("/api/random")).toHaveLength(0);

    page.player.seek("12");
    expect([page.elements.seekSlider.value, page.player.timeText.value]).toEqual(["12", "0:12 / 0:15"]);
    page.player.playOrPause();
    expect(page.player.playButton.value.showsPause).toBe(true);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.store.playAttemptId.value).toBe(1);
  });

  it("disables Play and the bar once a photo's timer has ended, with the time at 0:00 / 0:00, until the next item plays", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    const shown = () => ({ play: page.player.playButton.value, bar: page.player.seekBar.value, time: page.player.timeText.value });
    const ended = { play: { disabled: true, showsPause: false }, bar: { disabled: true, label: "Photo timer" }, time: "0:00 / 0:00" };

    // The pick at the end of history finds nothing, so the photo stays.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.store.status.value).toBe("No eligible media for current filters.");
    expect(shown()).toEqual(ended);
    expect(page.elements.seekSlider.value).toBe("0");
    expect(page.frames.pending()).toBe(0);

    page.player.playOrPause();
    page.player.seek("5");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shown()).toEqual(ended);
    expect(page.elements.seekSlider.value).toBe("0");
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.store.playAttemptId.value).toBe(1);

    page.answerRandom(VIDEO);
    page.player.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.store.playAttemptId.value).toBe(2);
    expect(shown()).toEqual({ play: { disabled: false, showsPause: true }, bar: { disabled: false, label: "Seek" }, time: "0:00 / 0:00" });
  });

  it("disables Play and the bar on a photo with Autoplay off or Loop on, and Autoplay starts and clears its timer", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(PHOTO);
    const disabled = { play: { disabled: true, showsPause: false }, bar: { disabled: true, label: "Photo timer" }, time: "0:00 / 0:00" };
    const shown = () => ({ play: page.player.playButton.value, bar: page.player.seekBar.value, time: page.player.timeText.value });
    expect(shown()).toEqual(disabled);
    page.player.playOrPause();
    page.player.seek("5");
    expect(shown()).toEqual(disabled);
    expect(page.store.playAttemptId.value).toBe(1);

    page.player.toggleAutoplay();
    expect(page.store.playAttemptId.value).toBe(2);
    expect(shown()).toEqual({ play: { disabled: false, showsPause: true }, bar: { disabled: false, label: "Photo timer" }, time: "0:00 / 0:15" });
    await vi.advanceTimersByTimeAsync(5_000);

    page.player.toggleLoop();
    expect(shown()).toEqual(disabled);
    expect(page.elements.seekSlider.value).toBe("0");
    page.player.toggleLoop();
    expect(page.player.timeText.value).toBe("0:00 / 0:15");

    page.player.toggleAutoplay();
    expect(shown()).toEqual(disabled);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.store.playAttemptId.value).toBe(4);
  });

  it("empties the bar for each new item, and shows a video's time from 0:00 until its length is known", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(5_000);

    page.play(VIDEO);
    expect([page.elements.seekSlider.value, page.player.timeText.value]).toEqual(["0", "0:00 / 0:00"]);
    expect(page.player.seekBar.value).toEqual({ disabled: false, label: "Seek" });
  });

  it("disables the scrub bar and leaves it empty on a video whose length is Infinity, as the browser reports an unknown length", () => {
    const page = setup();
    page.play(VIDEO);
    const { video, seekSlider } = page.elements;
    video.duration = Number.POSITIVE_INFINITY;
    page.player.videoMetadataLoaded();
    video.currentTime = 5;
    page.frames.run();

    expect(page.player.seekBar.value).toEqual({ disabled: true, label: "Seek" });
    expect([seekSlider.value, seekSlider.max, page.player.timeText.value]).toEqual(["0", "100", "0:05 / 0:00"]);

    page.play(SECOND_VIDEO);
    video.duration = 120;
    page.player.videoMetadataLoaded();
    expect(page.player.seekBar.value).toEqual({ disabled: false, label: "Seek" });
    expect(seekSlider.max).toBe("120");
  });

  it("Mute shows whether sound is muted before anything plays and on a photo, and applies to the next video", () => {
    const page = setup();
    expect(page.player.muted.value).toBe(false);
    page.player.toggleMute();
    expect(page.player.muted.value).toBe(true);
    page.player.toggleMute();
    page.player.toggleMute();
    expect(page.player.muted.value).toBe(true);

    page.play(VIDEO);
    expect(page.elements.video.muted).toBe(true);
    page.player.toggleMute();
    expect(page.elements.video.muted).toBe(false);
    expect(page.player.muted.value).toBe(false);

    page.play(PHOTO);
    expect(page.player.muted.value).toBe(false);
    page.player.toggleMute();
    expect(page.player.muted.value).toBe(true);
    page.play(SECOND_VIDEO);
    expect(page.elements.video.plays.at(-1)).toBe("display=block muted=true src=http://server/api/media/item-other?token=t");
  });

  it("favorites and blacklists the playing item with the device's client id, each clearing the other, and remembers it for history", async () => {
    const page = setup();
    page.play(VIDEO);

    await page.player.toggleFavorite();
    expect(page.requests("/api/favorite")[0]!.body).toEqual({ path: "item-video", isFavorite: true, clientId: "client-1" });
    expect([page.player.favorite.value, page.store.status.value]).toEqual([true, "Added to favorites"]);

    await page.player.toggleBlacklist();
    expect(page.requests("/api/blacklist")[0]!.body).toEqual({ path: "item-video", isBlacklisted: true, clientId: "client-1" });
    expect([page.player.favorite.value, page.player.blacklisted.value, page.store.status.value]).toEqual([false, true, "Blacklisted"]);

    page.play(VIDEO);
    expect(page.player.blacklisted.value).toBe(true);

    page.replies.set("/api/favorite", () => json({}, 500));
    await page.player.toggleFavorite();
    expect(page.store.status.value).toBe("Favorite update failed (500).");
    expect(page.player.blacklisted.value).toBe(true);
  });

  it("applies item-state events to the playing item and its cache, and reports them without the file name in the log", () => {
    const page = setup();
    page.play(VIDEO);
    page.emit("itemStateChanged", { itemId: "item-video", path: "/media/clip.mp4", isFavorite: true, isBlacklisted: false });
    expect(page.player.favorite.value).toBe(true);
    expect(page.store.status.value).toBe("Synced: Added to favorites: clip.mp4");
    expect(page.relayed).toContain("status=Synced: Added to favorites hasCurrent=true attempt=1");

    page.play(SECOND_VIDEO);
    page.emit("itemStateChanged", { itemId: "item-video", path: "/media/clip.mp4", isFavorite: false, isBlacklisted: true });
    expect(page.player.blacklisted.value).toBe(false);
    page.player.previous();
    expect(page.player.blacklisted.value).toBe(true);

    page.emit("itemStateChanged", { path: "/media/clip.mp4", isFavorite: true });
    expect(page.store.status.value).toBe("Synced: Blacklisted: clip.mp4");
  });

  it("shows the time and moves the slider as the video plays, and seeks only once the duration is known", () => {
    const page = setup();
    page.play(VIDEO);
    const { video, seekSlider } = page.elements;

    page.player.seek("30");
    expect(video.currentTime).toBe(0);
    video.duration = 125.4;
    page.player.videoMetadataLoaded();
    expect([seekSlider.max, page.player.timeText.value]).toEqual(["125.4", "0:00 / 2:05"]);

    video.currentTime = 61.9;
    page.player.videoTimeUpdated();
    expect([seekSlider.value, page.player.timeText.value]).toEqual(["61.9", "1:01 / 2:05"]);
    page.player.seek("90");
    expect(video.currentTime).toBe(90);
  });
});
