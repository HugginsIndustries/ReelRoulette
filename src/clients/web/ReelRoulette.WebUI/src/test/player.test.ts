import { afterEach, describe, expect, it, vi } from "vitest";
import { unauthorizedLogText } from "../api/serverRequest";
import type { NotifyRequest } from "../notifications/notifications";
import { createPlayer, type PlayerElements } from "../playback/player";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { NO_LIBRARY_PLAY_NOTICE } from "../state/lastingStates";
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
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
    const reply = replies.get(path);
    if (reply) {
      return reply();
    }
    if (path === "/api/random") {
      return json(randomAnswers.length > 0 ? randomAnswers.shift() : { mediaUrl: null });
    }
    return json({});
  }) as typeof fetch;
  const relayed: string[] = [];
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    storage: { getItem: () => null, setItem: () => {} },
    device: createDeviceStore(null),
    relay: (_level, message) => relayed.push(message)
  });
  /** The texts relayed without a message, such as "Playing". */
  const statuses: string[] = [];
  const relayStatus = store.relayStatus;
  store.relayStatus = (logText) => {
    statuses.push(logText);
    relayStatus(logText);
  };
  /** The one-off messages, which pop up and which the list keeps. */
  const notified: NotifyRequest[] = [];
  const notifications = {
    notify(request: NotifyRequest) {
      notified.push(request);
    }
  };
  // As the page does: a 401 on any request shows the pairing prompt and relays one line naming its route.
  const api = createAppApi("http://server", {
    onUnauthorized: (route) => {
      store.pairingRequired.value = true;
      store.relayStatus(unauthorizedLogText(route));
    },
    fetch: fetchImpl
  });
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
  const player = createPlayer({ apiBaseUrl: "http://server/", store, api, connection, dialogs, notifications, frames });
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
    statuses,
    notified,
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

    video.duration = 120;
    page.player.videoPlaying();
    page.player.videoFailed();
    page.player.videoMetadataLoaded();
    page.player.videoEnded();
    expect(page.statuses).toEqual([]);
    expect(seekSlider.max).toBe("100");

    page.player.photoFailed();
    expect(page.notices).toEqual(["Photo file not found."]);
    expect(page.statuses).toEqual([]);
    // Playing is the normal state, which shows nothing and only relays.
    page.player.photoLoaded();
    expect(page.statuses).toEqual(["Playing"]);
    expect(page.notified).toEqual([]);
  });

  it("only traces events from an attempt once another item is playing", () => {
    const page = setup();
    page.play(VIDEO);
    page.store.pushHistory({ ...SECOND_VIDEO });

    page.player.videoPlaying();
    expect(page.statuses).toEqual([]);
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
    expect(page.notices).toEqual(["No eligible media for current filters."]);
    expect(page.statuses).toEqual([]);
    expect(page.notified).toEqual([]);
    expect(page.store.current.value).toBeNull();

    page.store.compatibilityBlocked.value = true;
    await page.player.pickRandom();
    expect(page.notices).toEqual(["No eligible media for current filters.", "Cannot play: server compatibility check failed."]);
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("shows each pick that ends without playing in the notice alone", async () => {
    const page = setup();
    const answers: Array<[() => Response, string]> = [
      [() => json({}, 503), "Random selection failed (503)."],
      [() => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }), "Random selection failed: The server sent an unexpected response (text/html)."]
    ];
    for (const [answer, notice] of answers) {
      page.replies.set("/api/random", answer);
      await page.player.pickRandom();
      expect(page.notices.at(-1)).toBe(notice);
    }
    expect(page.statuses).toEqual([]);
    expect(page.notified).toEqual([]);
    expect(page.store.current.value).toBeNull();
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "reads a pick that couldn't reach the server, which the browser calls %j, the same in every browser",
    async (wording) => {
      const page = setup();
      page.replies.set("/api/random", () => {
        throw new TypeError(wording);
      });
      await page.player.pickRandom();
      expect(page.notices).toEqual(["Random selection failed: Couldn't reach the server."]);
      expect(page.statuses).toEqual([]);
      expect(page.notified).toEqual([]);
    }
  );

  it("shows only the pairing prompt for a pick the server answers with 401, and still relays its line", async () => {
    const page = setup();
    page.replies.set("/api/random", () => json({}, 401));
    await page.player.pickRandom();
    expect(page.store.pairingRequired.value).toBe(true);
    expect(page.notices).toEqual([]);
    expect(page.notified).toEqual([]);
    expect(page.relayed.filter((relayed) => relayed.includes("Unauthorized"))).toEqual([
      "status=Unauthorized. Pair first. (POST /api/random) hasCurrent=false attempt=0"
    ]);
  });

  it("shows a pick the server doesn't answer in time in the notice", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.replies.set("/api/random", () => new Promise<Response>(() => {}) as unknown as Response);
    const pick = page.player.pickRandom();
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    await vi.advanceTimersByTimeAsync(9_500);
    await pick;
    expect(page.notices).toEqual(["No response from the server. Try again."]);
    expect(page.store.loading.shown.value).toBe(false);
    expect(page.statuses).toEqual([]);
    expect(page.notified).toEqual([]);
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

  it("stops moving the bar once a video fails to load, and shows it can't be found in the notice", () => {
    const page = setup();
    page.play(VIDEO);
    expect(page.frames.pending()).toBe(1);

    // A source that fails fires no pause, so the video still reads as playing.
    page.player.videoFailed();
    expect(page.elements.video.paused).toBe(false);
    expect(page.frames.pending()).toBe(0);
    expect(page.notices).toEqual(["Video file not found."]);
    expect(page.statuses).toEqual([]);
    expect(page.notified).toEqual([]);
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
    expect(page.notices).toEqual(["No eligible media for current filters."]);
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
    expect(page.player.favorite.value).toBe(true);

    await page.player.toggleBlacklist();
    expect(page.requests("/api/blacklist")[0]!.body).toEqual({ path: "item-video", isBlacklisted: true, clientId: "client-1" });
    expect([page.player.favorite.value, page.player.blacklisted.value]).toEqual([false, true]);

    page.play(VIDEO);
    expect(page.player.blacklisted.value).toBe(true);

    page.replies.set("/api/favorite", () => json({}, 500));
    await page.player.toggleFavorite();
    expect(page.notices).toEqual(["Favorite update failed (500)."]);
    expect(page.player.blacklisted.value).toBe(true);
    // Each change it made pops up as Your actions, with the file name, and replaces the one before.
    expect(page.notified).toEqual([
      { kind: "actions", text: "Added to favorites", detail: "clip.mp4", key: "flag" },
      { kind: "actions", text: "Blacklisted", detail: "clip.mp4", key: "flag" }
    ]);
  });

  it("says a favorite or blacklist was removed, naming the item the request acted on", async () => {
    const page = setup();
    page.play({ ...VIDEO, isFavorite: true });
    await page.player.toggleFavorite();

    page.play({ ...SECOND_VIDEO, isBlacklisted: true });
    let answer: (response: Response) => void = () => {};
    page.replies.set("/api/blacklist", () => new Promise<Response>((resolve) => (answer = resolve)) as unknown as Response);
    const removing = page.player.toggleBlacklist();
    // Another item plays before the server answers.
    page.play(PHOTO);
    answer(json({}));
    await removing;
    expect(page.notified).toEqual([
      { kind: "actions", text: "Removed from favorites", detail: "clip.mp4", key: "flag" },
      { kind: "actions", text: "Removed from blacklist", detail: "other.mp4", key: "flag" }
    ]);
  });

  it("shows a favorite or blacklist that couldn't reach the server in the notice, leaving the buttons as they were", async () => {
    const page = setup();
    page.play(VIDEO);
    const unreachable = () => {
      throw new TypeError("Load failed");
    };
    page.replies.set("/api/favorite", unreachable);
    page.replies.set("/api/blacklist", unreachable);

    await expect(page.player.toggleFavorite()).resolves.toBeUndefined();
    await expect(page.player.toggleBlacklist()).resolves.toBeUndefined();
    expect(page.notices).toEqual([
      "Favorite update failed: Couldn't reach the server.",
      "Blacklist update failed: Couldn't reach the server."
    ]);
    expect([page.player.favorite.value, page.player.blacklisted.value]).toEqual([false, false]);
  });

  it("applies item-state events to the playing item and its cache, and pops up another device's change", () => {
    const page = setup();
    page.play(VIDEO);
    page.emit("itemStateChanged", { itemId: "item-video", path: "/media/clip.mp4", isFavorite: true, isBlacklisted: false });
    expect(page.player.favorite.value).toBe(true);

    page.play(SECOND_VIDEO);
    page.emit("itemStateChanged", { itemId: "item-video", path: "/media/clip.mp4", isFavorite: false, isBlacklisted: true });
    expect(page.player.blacklisted.value).toBe(false);
    page.player.previous();
    expect(page.player.blacklisted.value).toBe(true);

    // An event without an item changes nothing and says nothing.
    page.emit("itemStateChanged", { path: "/media/clip.mp4", isFavorite: true });
    // The file name shows on the second line, and the log leaves it out.
    expect(page.notified).toEqual([
      { kind: "devices", text: "Added to favorites on another device", detail: "clip.mp4", key: "sync:item-video", logText: "Added to favorites on another device" },
      { kind: "devices", text: "Blacklisted on another device", detail: "clip.mp4", key: "sync:item-video", logText: "Blacklisted on another device" }
    ]);
  });

  it("tells an item leaving the blacklist from one leaving the favorites, by its state before the change", () => {
    const page = setup();
    const change = (before: { previousIsFavorite?: boolean; previousIsBlacklisted?: boolean }) =>
      page.emit("itemStateChanged", { itemId: "item-video", path: "C:\\media\\clip.mp4", isFavorite: false, isBlacklisted: false, ...before });
    change({ previousIsFavorite: false, previousIsBlacklisted: true });
    change({ previousIsFavorite: true, previousIsBlacklisted: false });
    // A desktop event that doesn't say reads as leaving the favorites, as before.
    change({});
    expect(page.notified.map((request) => [request.text, request.detail])).toEqual([
      ["Removed from blacklist on another device", "clip.mp4"],
      ["Removed from favorites on another device", "clip.mp4"],
      ["Removed from favorites on another device", "clip.mp4"]
    ]);
  });

  it("pops up nothing for this device's own change, which it already said, and another client's or one without a client id", () => {
    const page = setup();
    page.play(VIDEO);
    const event = { itemId: "item-video", path: "/media/clip.mp4", isFavorite: true, isBlacklisted: false };

    page.emit("itemStateChanged", { ...event, clientId: "client-1" });
    // Its own change still updates the buttons and the cache.
    expect(page.player.favorite.value).toBe(true);
    expect(page.notified).toEqual([]);

    page.emit("itemStateChanged", { ...event, clientId: "client-2" });
    page.emit("itemStateChanged", { ...event, clientId: null });
    page.emit("itemStateChanged", event);
    expect(page.notified.map((request) => request.text)).toEqual([
      "Added to favorites on another device",
      "Added to favorites on another device",
      "Added to favorites on another device"
    ]);
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

describe("Loading… on the player's indicator", () => {
  /** Records each change of whether Loading… shows from here on. */
  function watchLoading(page: ReturnType<typeof setup>) {
    const shown: boolean[] = [];
    page.store.loading.shown.subscribe((value) => shown.push(value));
    return { shown };
  }

  /** Answers the next random pick only when the test says so. */
  function holdRandom(page: ReturnType<typeof setup>) {
    let answer: (response: Response) => void = () => {};
    page.replies.set("/api/random", () => new Promise<Response>((resolve) => (answer = resolve)) as unknown as Response);
    return (item: unknown) => answer(json(item));
  }

  it("shows only after half a second, counted once across a pick and its media load, and never as a message", async () => {
    vi.useFakeTimers();
    const page = setup();
    const watched = watchLoading(page);
    const answer = holdRandom(page);

    const pick = page.player.pickRandom();
    await vi.advanceTimersByTimeAsync(300);
    answer(VIDEO);
    await pick;
    expect(page.elements.video.src).toContain("item-video");
    expect(page.store.loading.shown.value).toBe(false);
    await vi.advanceTimersByTimeAsync(199);
    expect(page.store.loading.shown.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.store.loading.shown.value).toBe(true);

    page.player.videoPlaying();
    expect(page.store.loading.shown.value).toBe(false);
    // One loading period: it showed once and ended once.
    expect(watched.shown).toEqual([false, true, false]);
    expect(page.statuses).toEqual(["Playing"]);
    expect(page.notified).toEqual([]);
  });

  it("shows nothing for a load quicker than half a second", async () => {
    vi.useFakeTimers();
    const page = setup();
    const watched = watchLoading(page);
    page.answerRandom(VIDEO);

    await page.player.pickRandom();
    await vi.advanceTimersByTimeAsync(499);
    page.player.videoPlaying();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(watched.shown).toEqual([false]);
  });

  it("ends when a photo loads or fails", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.photoLoaded();
    expect(page.store.loading.shown.value).toBe(false);

    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.photoFailed();
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("ends when a video fails, when the browser won't play it, when the user pauses it, on Auto-Pause, and when the player detaches", async () => {
    vi.useFakeTimers();
    const page = setup();
    const ends: Array<() => void> = [
      () => page.player.videoFailed(),
      () => page.player.playOrPause(),
      () => page.player.autoPause()
    ];
    for (const end of ends) {
      page.play(VIDEO);
      await vi.advanceTimersByTimeAsync(500);
      expect(page.store.loading.shown.value).toBe(true);
      end();
      expect(page.store.loading.shown.value).toBe(false);
    }

    // The browser refuses to play it, as when it blocks autoplay.
    page.elements.video.play = () => Promise.reject(new DOMException("Not allowed", "NotAllowedError"));
    page.play(VIDEO);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(false);

    page.elements.video.play = () => Promise.resolve();
    page.play(VIDEO);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.detach();
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("lets an earlier attempt's events release nothing", async () => {
    vi.useFakeTimers();
    const page = setup();
    let refuseFirst: (reason: unknown) => void = () => {};
    page.elements.video.play = () => new Promise<void>((_resolve, reject) => (refuseFirst = reject));
    page.play(VIDEO);
    page.elements.video.play = () => Promise.resolve();
    page.play(SECOND_VIDEO);

    // The first play is cut short by the second's source, and its rejection arrives after the second started.
    refuseFirst(new DOMException("Interrupted", "AbortError"));
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);

    // A photo's events while a video plays, and a video's events once another item is current, are stale.
    page.player.photoLoaded();
    page.player.photoFailed();
    page.store.pushHistory({ ...VIDEO });
    page.player.videoPlaying();
    page.player.videoFailed();
    expect(page.store.loading.shown.value).toBe(true);
  });

  it("holds nothing more for a press while a pick waits, and ends when that pick gives up", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.replies.set("/api/random", () => new Promise<Response>(() => {}) as unknown as Response);
    const pick = page.player.pickRandom();
    await vi.advanceTimersByTimeAsync(400);
    await page.player.pickRandom();
    page.player.next();
    expect(page.requests("/api/random")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(page.store.loading.shown.value).toBe(true);

    await vi.advanceTimersByTimeAsync(9_500);
    await pick;
    expect(page.notices).toEqual(["No response from the server. Try again."]);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("holds for a history step and a photo shown again", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(VIDEO);
    page.player.videoPlaying();
    page.play(SECOND_VIDEO);
    page.player.videoPlaying();

    page.player.previous();
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.videoPlaying();
    expect(page.store.loading.shown.value).toBe(false);

    page.play(PHOTO);
    page.player.photoLoaded();
    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.photoLoaded();
    page.store.setPhotoDuration("4");
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.photoLoaded();
    expect(page.store.loading.shown.value).toBe(false);
  });
});

describe("without a library", () => {
  it("Play and Next at the end of history show the notice and send nothing, after the compatibility check's notice", async () => {
    const page = setup();
    page.store.libraryState.value = "missing";

    await page.player.pickRandom();
    page.player.next();
    page.player.playOrPause();
    await vi.waitFor(() => expect(page.notices).toHaveLength(3));
    expect(page.notices).toEqual([NO_LIBRARY_PLAY_NOTICE, NO_LIBRARY_PLAY_NOTICE, NO_LIBRARY_PLAY_NOTICE]);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.store.loading.shown.value).toBe(false);

    page.store.compatibilityBlocked.value = true;
    await page.player.pickRandom();
    expect(page.notices.at(-1)).toBe("Cannot play: server compatibility check failed.");
  });

  it("records no play", async () => {
    const page = setup();
    page.store.libraryState.value = "newer";
    page.play(VIDEO);
    await Promise.resolve();
    expect(page.requests("/api/record-playback")).toHaveLength(0);

    page.store.libraryState.value = "ready";
    page.play(VIDEO);
    await vi.waitFor(() => expect(page.requests("/api/record-playback")).toHaveLength(1));
  });
});
