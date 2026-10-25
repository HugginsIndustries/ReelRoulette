import { signal } from "@preact/signals";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unauthorizedLogText } from "../api/serverRequest";
import type { NotifyRequest } from "../notifications/notifications";
import { createAudioStage, type AudioStage } from "../playback/audioStage";
import { COMPRESSION_PRESETS } from "../playback/compression";
import { createPlayer, type PlayerElements, type PlayOrigin } from "../playback/player";
import { SEEK_INDICATOR_MS } from "../playback/seekIndicator";
import { DEFAULT_RANDOM_OPTIONS } from "../random/randomOptions";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
import { createDeviceStore } from "../state/deviceStore";
import { NO_LIBRARY_PLAY_NOTICE } from "../state/lastingStates";
import type { ServerConnection, ServerConnectionEvents } from "../state/serverConnection";
import { randomAnswer } from "./randomAnswer";
import { FILE_NOT_IN_LIBRARY, LIBRARY_EMPTY } from "./serverReasons";

const VIDEO: PlayingItem = {
  id: "/media/clip.mp4",
  itemId: "item-video",
  displayName: "clip.mp4",
  mediaType: "video",
  durationSeconds: 65,
  mediaUrl: "/api/media/item-video?token=t",
  isFavorite: false,
  isBlacklisted: false,
  rating: null
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

/** The server's answer to a favorite or blacklist change, where setting one flag clears the other. */
function flagAnswer(body: { itemId?: string; isFavorite?: boolean; isBlacklisted?: boolean }): Response {
  return json({ itemId: body.itemId, path: "", isFavorite: body.isFavorite === true, isBlacklisted: body.isBlacklisted === true, revision: 1 });
}

/** A stand-in for the `<video>` element. Its `play` notes what was set when it was called. */
function fakeVideo() {
  const video = {
    src: "",
    muted: false,
    volume: 1,
    loop: false,
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    ended: false,
    style: { display: "none" },
    plays: [] as string[],
    /** Set once the element is emptied, as one a new element has taken over from is. */
    emptied: false,
    play() {
      video.plays.push(`display=${video.style.display} muted=${video.muted} src=${video.src}`);
      video.paused = false;
      video.ended = false;
      return Promise.resolve();
    },
    pause() {
      video.paused = true;
    },
    removeAttribute(name: string) {
      if (name === "src") video.src = "";
    },
    load() {
      video.emptied = video.src === "";
    },
    addEventListener() {},
    removeEventListener() {}
  };
  return video;
}

/**
 * Gives a stand-in `<video>` the browser's frame timings (`requestVideoFrameCallback`), with `showFrame` to show a frame
 * that starts `mediaTime` seconds in, as the browser does while it plays or after a seek.
 */
function withFrameTimings<T extends object>(video: T) {
  const waiting = new Map<number, (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void>();
  let nextHandle = 1;
  let presentedFrames = 0;
  return Object.assign(video, {
    requestVideoFrameCallback(callback: (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void) {
      waiting.set(nextHandle, callback);
      return nextHandle++;
    },
    cancelVideoFrameCallback(handle: number) {
      waiting.delete(handle);
    },
    showFrame(mediaTime: number) {
      presentedFrames += 1;
      const due = [...waiting.values()];
      waiting.clear();
      due.forEach((callback) => callback(0, { mediaTime, presentedFrames }));
    }
  });
}

/** A stand-in for the `<img>`. It notes each source it is given, so a test sees whether a photo loaded again. */
function fakePhoto() {
  let src = "";
  const photo = {
    style: { display: "none" },
    sources: [] as string[],
    get src() {
      return src;
    },
    set src(value: string) {
      src = value;
      photo.sources.push(value);
    }
  };
  return photo;
}

/** A stand-in for the stretch behind the scrub bar, keeping the CSS variables the player sets on it. */
function fakeStretch() {
  const vars = new Map<string, string>();
  return {
    hidden: true,
    vars,
    style: {
      setProperty(name: string, value: string) {
        vars.set(name, value);
      }
    }
  };
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

/**
 * A player whose device store starts with `saved`, as the page's `localStorage` would hold it. Its sound comes from an
 * audio stage whose gain stage never starts, so the video plays directly, unless `audio` stands in for it.
 */
function setup(
  saved: Record<string, string> = {},
  audioStandIn?: Pick<AudioStage, "play" | "pause" | "pausing" | "cancelPause">,
  options: { frameTimings?: boolean } = {}
) {
  const requests: Array<{ path: string; method: string; body: any; headers: Headers }> = [];
  /** Answers for a path, given the request's body. One that answers nothing leaves the request to the default answer. */
  const replies = new Map<string, (request: { body: any }) => Response | undefined>();
  const randomAnswers: unknown[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ path, method: (init?.method || "GET").toUpperCase(), body, headers: new Headers(init?.headers) });
    const reply = replies.get(path)?.({ body });
    if (reply) {
      return reply;
    }
    if (path === "/api/random") {
      return randomAnswer(randomAnswers.length > 0 ? randomAnswers.shift() : null);
    }
    // A history step's play: the server answers with the entry it plays, its media URL unchanged.
    if (path.startsWith("/api/play/")) {
      const itemId = decodeURIComponent(path.slice("/api/play/".length));
      const entry = store.history.peek().find((item) => item.itemId === itemId);
      return entry ? json({ ...entry }) : json({ error: "Item not found", code: "play_item_not_found" }, 404);
    }
    if (path === "/api/favorite" || path === "/api/blacklist") {
      return flagAnswer(body);
    }
    return json({});
  }) as typeof fetch;
  const relayed: string[] = [];
  // Photos show for 15 seconds, the time these tests' photo timers assume.
  const kept = new Map(Object.entries({ "rr_device.playback.advanceAfter": "15", ...saved }));
  const device = createDeviceStore({ getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) });
  const store = createAppStore({
    identity: { clientId: "client-1", sessionId: "session-1", clientType: "web", deviceName: "Web Browser" },
    device,
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
  /** The line each notice sent to the log, its message unless it named one of its own, as the in-app dialog does. */
  const noticeLogs: string[] = [];
  const dialogs = {
    notice(message: string, logText = message) {
      notices.push(message);
      noticeLogs.push(logText);
      return Promise.resolve();
    }
  };
  const frames = fakeFrames();
  const audio = createAudioStage({
    device,
    dialogs: { noticeWithAction: () => Promise.resolve(false) },
    relay: () => {},
    renewVideo: () => player.renewVideo(),
    normalizationGainDb: signal(0),
    compressor: signal({ on: false, values: COMPRESSION_PRESETS.medium }),
    volumeReadOnly: false,
    activation: new EventTarget()
  });
  const ratings = { takeRead: () => {} };
  const player = createPlayer({ apiBaseUrl: "http://server/", store, audio: audioStandIn ?? audio, api, connection, dialogs, notifications, ratings, frames });
  const elements = {
    video: options.frameTimings ? withFrameTimings(fakeVideo()) : fakeVideo(),
    photo: fakePhoto(),
    emptyState: { style: { display: "" } },
    seekSlider: { value: "0", max: "100" },
    seekStretch: fakeStretch()
  };
  player.attach(elements satisfies PlayerElements);
  audio.attach(elements.video);
  return {
    store,
    player,
    audio,
    elements,
    kept,
    frames,
    notices,
    noticeLogs,
    relayed,
    statuses,
    notified,
    replies,
    requests: (path: string) => requests.filter((request) => request.path === path),
    answerRandom: (...items: unknown[]) => randomAnswers.push(...items),
    emit: (event: keyof ServerConnectionEvents, payload: unknown) => listeners[event]?.forEach((listener) => listener(payload)),
    /** Plays `item` as the user starts a play from `origin`, forward unless it says otherwise. */
    play(item: PlayingItem, origin?: PlayOrigin) {
      store.pushHistory({ ...item });
      player.playCurrent({ origin });
    },
    /** Plays `item` as a video `seconds` long whose metadata has loaded and that has started playing. */
    playVideo(item: PlayingItem, seconds: number) {
      store.pushHistory({ ...item });
      player.playCurrent();
      elements.video.duration = seconds;
      player.videoMetadataLoaded();
      player.videoPlaying();
    },
    /** The stretch behind the scrub bar: whether it shows, and where it starts and ends, as fractions of the video. */
    stretch: () => ({
      hidden: elements.seekStretch.hidden,
      from: elements.seekStretch.vars.get("--loop-from"),
      to: elements.seekStretch.vars.get("--loop-to")
    })
  };
}

afterEach(() => {
  vi.useRealTimers();
});

/** Answers the next request to `path` only when the test calls the function returned. */
function holdReply(page: ReturnType<typeof setup>, path: string): (response: Response) => void {
  let answer: (response: Response) => void = () => {};
  page.replies.set(path, () => new Promise<Response>((resolve) => (answer = resolve)) as unknown as Response);
  return (response) => answer(response);
}

describe("createPlayer", () => {
  it("sets a video's source and shows it, then plays it with the saved mute, and records the play", async () => {
    const page = setup();
    page.audio.toggleMute();
    page.play(VIDEO);

    const { video, photo, emptyState } = page.elements;
    expect(video.plays).toEqual(["display=block muted=true src=http://server/api/media/item-video?token=t"]);
    expect([video.style.display, photo.style.display, emptyState.style.display]).toEqual(["block", "none", "none"]);
    expect(page.player.playButton.value).toEqual({ disabled: false, showsPause: true });
    expect(page.player.seekBar.value).toEqual({ disabled: false, label: "Seek" });
    expect(page.audio.muted.value).toBe(true);
    await vi.waitFor(() =>
      expect(page.requests("/api/record-playback").map((request) => request.body)).toEqual([
        { itemId: "item-video", clientId: "client-1", sessionId: "session-1" }
      ])
    );
    expect(page.relayed).toContain("playback=start attempt=1 hasCurrent=true mediaType=video");
  });

  it("does not record a library play, which the server already recorded", async () => {
    const page = setup();
    page.store.pushHistory({ ...VIDEO });
    page.player.playCurrent({ origin: "library" });
    await Promise.resolve();
    expect(page.requests("/api/record-playback")).toHaveLength(0);
  });

  it("shows a photo, keeps Mute as it was, and ignores the video's events until a video plays again", async () => {
    const page = setup();
    answerMissing(page, PHOTO);
    page.play(VIDEO);
    page.play(PHOTO, "library");

    const { video, photo, seekSlider } = page.elements;
    expect([photo.src, photo.style.display, video.style.display]).toEqual(["http://server/api/media/item-photo?token=t", "block", "none"]);
    expect(video.paused).toBe(true);
    expect(page.audio.muted.value).toBe(false);

    video.duration = 120;
    page.player.videoPlaying();
    page.player.videoFailed();
    page.player.videoMetadataLoaded();
    page.player.videoEnded();
    expect(page.statuses).toEqual([]);
    expect(seekSlider.max).toBe("100");

    page.player.photoFailed();
    await vi.waitFor(() => expect(page.notices).toEqual(["Photo file not found."]));
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
      includeVideos: true,
      includePhotos: true
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

  it("sends the Randomization tab's options with each pick, and keeps the cycle numbers each answer brings, one that finds nothing included", async () => {
    const page = setup();
    page.store.setRandomOptions({ ...DEFAULT_RANDOM_OPTIONS, shuffle: false, rememberPlaysForDays: 7, favorLessPlayed: true });
    page.replies.set("/api/random", () => randomAnswer(VIDEO, { picked: 3, eligible: 10, remaining: 7 }));
    await page.player.pickRandom();
    expect(page.requests("/api/random")[0]!.body.options).toEqual({
      shuffle: false,
      rememberPlaysForDays: 7,
      spreadByFolder: true,
      spreadByTags: "off",
      favorLessPlayed: true,
      favorNewlyAdded: false,
      favorNewlyCreated: false,
      favorHigherRated: false
    });
    expect(page.store.randomCycle.value).toEqual({ picked: 3, eligible: 10, remaining: 7 });

    page.replies.set("/api/random", () => randomAnswer(null));
    page.player.next();
    await vi.waitFor(() => expect(page.store.randomCycle.value).toEqual({ picked: 0, eligible: 0, remaining: 0 }));
  });

  it("shows each pick that ends without playing in the notice alone", async () => {
    const page = setup();
    const answers: Array<[() => Response, string]> = [
      [() => json({}, 503), "Random selection failed."],
      [() => json({ error: LIBRARY_EMPTY }, 503), `Random selection failed: ${LIBRARY_EMPTY}`],
      [() => new Response("<html></html>", { headers: { "Content-Type": "text/html" } }), "Random selection failed: The server sent an unexpected response."]
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

  it("with Autoplay, moves a photo on after Advance after, and with Loop repeats it, keeping it on screen without loading or recording it again", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.answerRandom(SECOND_VIDEO);
    page.store.setAdvanceAfter(4);
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
    page.player.photoLoaded();
    const attempt = page.store.playAttemptId.value;
    const sources = [...page.elements.photo.sources];
    const records = page.requests("/api/record-playback").length;
    const starts = () => page.relayed.filter((line) => line.startsWith("playback=start ")).length;
    const startsBefore = starts();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(page.store.playAttemptId.value).toBe(attempt);
    expect(page.elements.photo.sources).toEqual(sources);
    expect([page.elements.photo.src, page.elements.photo.style.display]).toEqual(["http://server/api/media/item-photo?token=t", "block"]);
    expect(page.requests("/api/record-playback")).toHaveLength(records);
    expect(page.store.loading.shown.value).toBe(false);
    expect(starts()).toBe(startsBefore);

    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.store.playAttemptId.value).toBe(attempt);
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("changes a showing photo's timer length when the photo duration changes, keeping its time, and stops it when detached", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    const attempt = page.store.playAttemptId.value;
    await vi.advanceTimersByTimeAsync(10_000);

    // The photo doesn't show again, so nothing loads or is recorded again.
    page.store.setAdvanceAfter(12);
    expect(page.store.playAttemptId.value).toBe(attempt);
    expect(page.player.timeText.value).toBe("0:10 / 0:12");
    expect(page.requests("/api/record-playback")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);

    // Held, as Auto-Pause holds it, it stays held, and a length shorter than the time shown ends it once it resumes.
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(5_000);
    page.player.autoPause();
    page.store.setAdvanceAfter(3);
    expect(page.player.playButton.value.showsPause).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(1);
    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.requests("/api/random")).toHaveLength(2);

    page.play(PHOTO);
    const lastAttempt = page.store.playAttemptId.value;
    page.player.detach();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(2);
    page.store.setAdvanceAfter(4);
    page.player.playCurrent();
    expect(page.store.playAttemptId.value).toBe(lastAttempt);
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

  it("waits for the user before anything plays, once paused, and at a video's end nothing plays on from, but not while it plays, on a photo without a timer, or as a video moves on from its end", () => {
    const page = setup();
    const { video } = page.elements;
    expect(page.player.paused.value).toBe(true);
    page.playVideo(VIDEO, 60);
    expect(page.player.paused.value).toBe(false);
    page.player.playOrPause();
    expect(page.player.paused.value).toBe(true);
    page.player.playOrPause();
    expect(page.player.paused.value).toBe(false);

    // The browser pauses a video at its end, then sends `ended`. With Autoplay off, nothing plays on from it.
    const reachEnd = () => {
      video.paused = true;
      video.ended = true;
      page.player.videoPlayStateChanged();
    };
    reachEnd();
    expect(page.player.paused.value).toBe(true);

    // With Autoplay on, its `ended` moves on to the next item, so the pause before it doesn't wait for the user.
    page.player.toggleAutoplay();
    page.playVideo(SECOND_VIDEO, 60);
    reachEnd();
    expect(page.player.paused.value).toBe(false);
    page.player.videoEnded();
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.player.paused.value).toBe(false);

    page.player.toggleAutoplay();
    page.play(PHOTO);
    expect(page.player.playButton.value.disabled).toBe(true);
    expect(page.player.paused.value).toBe(false);
  });

  it("doesn't wait for the user between items, as autoplay or Next moves on to a pick or Previous or Next steps through history, while a step waits for its fresh media URL too", async () => {
    vi.useFakeTimers();
    const page = setup();
    const { video, photo } = page.elements;
    page.player.toggleAutoplay();
    page.playVideo(VIDEO, 60);
    const values: boolean[] = [];
    const stop = page.player.paused.subscribe((value) => values.push(value));

    // Autoplay moves on from the video's end to a pick, and Next picks again.
    page.answerRandom(SECOND_VIDEO, PHOTO);
    video.paused = true;
    video.ended = true;
    page.player.videoPlayStateChanged();
    page.player.videoEnded();
    await vi.advanceTimersByTimeAsync(0);
    expect(video.src).toContain("item-other");
    page.player.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(photo.src).toContain("item-photo");

    // Previous waits for its fresh media URL with nothing shown, then Next steps forward to the photo again.
    const answer = holdReply(page, "/api/play/item-other");
    page.player.previous();
    await vi.advanceTimersByTimeAsync(500);
    expect([video.style.display, photo.style.display]).toEqual(["none", "none"]);
    answer(json({ ...SECOND_VIDEO }));
    await vi.advanceTimersByTimeAsync(0);
    expect([video.src, video.style.display]).toEqual(["http://server/api/media/item-other?token=t", "block"]);
    page.player.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(photo.style.display).toBe("block");

    stop();
    expect(values).not.toContain(true);
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
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(12_000);

    page.player.autoPause();
    await vi.advanceTimersByTimeAsync(60_000);
    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(2_999);
    // With Loop off, the bar shows the time it kept.
    page.player.toggleLoop();
    expect(page.player.timeText.value).toBe("0:14 / 0:15");
    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(1);
    // It started over, rather than showing the photo again.
    page.player.toggleLoop();
    expect(page.player.timeText.value).toBe("0:00 / 0:15");
    expect(page.store.playAttemptId.value).toBe(1);
    expect(page.requests("/api/random")).toHaveLength(0);
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
    expect(page.requests("/api/record-playback").map((request) => request.body.itemId)).toEqual(["item-video", "item-other"]);
  });

  it("starts a video a random pick answers with while Auto-Pause holds playback paused, ending Loading…, for Auto-Resume to play", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;
    const answer = holdReply(page, "/api/random");
    page.player.next();
    page.player.autoPause();
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);

    answer(randomAnswer({ ...SECOND_VIDEO }));
    await vi.advanceTimersByTimeAsync(0);
    expect(video.src).toBe("http://server/api/media/item-other?token=t");
    expect(video.paused).toBe(true);
    expect(video.plays).toHaveLength(1);
    expect(page.player.playButton.value.showsPause).toBe(false);
    expect(page.store.loading.shown.value).toBe(false);
    expect(page.relayed).toContain("playback=auto-pause attempt=2 hasCurrent=true mediaType=video");

    page.player.autoResume();
    expect(video.plays).toEqual([
      "display=block muted=false src=http://server/api/media/item-video?token=t",
      "display=block muted=false src=http://server/api/media/item-other?token=t"
    ]);
  });

  it("holds the timer of a photo a random pick answers with while Auto-Pause holds playback, for Auto-Resume to run it", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(VIDEO);
    const answer = holdReply(page, "/api/random");
    page.player.next();
    page.player.autoPause();

    answer(randomAnswer({ ...PHOTO }));
    await vi.advanceTimersByTimeAsync(0);
    page.player.photoLoaded();
    expect(page.store.current.value?.itemId).toBe("item-photo");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(1);

    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(page.requests("/api/random")).toHaveLength(2);
  });

  it("plays an item the user starts while Auto-Pause holds playback, once its history step's answer comes, and Auto-Resume then changes nothing", async () => {
    vi.useFakeTimers();
    const page = setup();
    seedHistory(page, [VIDEO, SECOND_VIDEO], 1);
    page.player.autoPause();
    const answer = holdReply(page, "/api/play/item-video");
    page.player.previous();

    answer(json({ ...VIDEO }));
    await vi.advanceTimersByTimeAsync(0);
    const { video } = page.elements;
    expect(video.plays).toHaveLength(1);
    page.player.autoResume();
    expect(video.plays).toHaveLength(1);
    expect(video.paused).toBe(false);
  });

  it.each<[string, (page: ReturnType<typeof setup>) => void | Promise<void>]>([
    ["Previous at the oldest entry", (page) => page.player.previous()],
    ["Random, which finds nothing", (page) => page.player.pickRandom()]
  ])("resumes what Auto-Pause paused when a press during its hold starts nothing: %s", async (_name, press) => {
    vi.useFakeTimers();
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;
    page.player.autoPause();

    await press(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.store.playAttemptId.value).toBe(1);
    page.player.autoResume();
    expect(video.paused).toBe(false);
    expect(video.plays).toHaveLength(2);
  });

  it("ends Auto-Pause's hold when the browser plays the video itself, as a media key does, so the next item plays", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.playVideo(VIDEO, 30);
    const { video } = page.elements;
    page.player.autoPause();

    // Not through the player's controls, as a media key, a headset's button, or the system's media controls play it.
    video.play();
    page.player.videoPlayStateChanged();
    page.answerRandom({ ...SECOND_VIDEO });
    video.ended = true;
    page.player.videoEnded();
    await vi.advanceTimersByTimeAsync(0);

    expect(video.src).toBe("http://server/api/media/item-other?token=t");
    expect(video.paused).toBe(false);
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

  it("stops moving the bar once a video fails to load, and shows it can't be found in the notice", async () => {
    const page = setup();
    answerMissing(page, VIDEO);
    page.play(VIDEO, "library");
    expect(page.frames.pending()).toBe(1);

    // A source that fails fires no pause, so the video still reads as playing.
    page.player.videoFailed();
    expect(page.elements.video.paused).toBe(false);
    expect(page.frames.pending()).toBe(0);
    await vi.waitFor(() => expect(page.notices).toEqual(["Video file not found."]));
    expect(page.frames.pending()).toBe(0);
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

  it("disables Play and the bar on a photo with Autoplay off or Loop on, and Autoplay starts and clears its timer without showing it again", async () => {
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
    expect(page.store.playAttemptId.value).toBe(1);
    expect(shown()).toEqual({ play: { disabled: false, showsPause: true }, bar: { disabled: false, label: "Photo timer" }, time: "0:00 / 0:15" });
    await vi.advanceTimersByTimeAsync(5_000);

    // Loop keeps the photo's time.
    page.player.toggleLoop();
    expect(shown()).toEqual(disabled);
    expect(page.elements.seekSlider.value).toBe("0");
    await vi.advanceTimersByTimeAsync(2_000);
    page.player.toggleLoop();
    expect(page.player.timeText.value).toBe("0:07 / 0:15");

    page.player.toggleAutoplay();
    expect(shown()).toEqual(disabled);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.store.playAttemptId.value).toBe(1);
    expect(page.requests("/api/record-playback")).toHaveLength(1);
    expect(page.elements.photo.sources.filter(Boolean)).toHaveLength(1);
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

  it("seeks a video by J and L's seconds within its length, showing the new time at once, and does nothing before the video's length is known", () => {
    const page = setup();
    const { video, seekSlider } = page.elements;
    page.play(VIDEO);
    page.player.seekBy(5);
    expect(video.currentTime).toBe(0);

    page.elements.video.duration = 65;
    page.player.videoMetadataLoaded();
    page.player.videoPlaying();
    video.currentTime = 10;
    page.player.seekBy(5);
    expect([video.currentTime, seekSlider.value, page.player.timeText.value]).toEqual([15, "15", "0:15 / 1:05"]);
    page.player.seekBy(-20);
    expect(video.currentTime).toBe(0);
    video.currentTime = 62;
    page.player.seekBy(5);
    expect(video.currentTime).toBe(65);

    page.playVideo(SECOND_VIDEO, Number.POSITIVE_INFINITY);
    video.currentTime = 10;
    page.player.seekBy(5);
    expect(video.currentTime).toBe(10);
  });

  it("shows the seek indicator for J, L, and a double-tap with the full step at the video's start and end too, and is seekable only where they seek", async () => {
    vi.useFakeTimers();
    const page = setup();
    const { video } = page.elements;
    /** The seconds each side of the seek indicator shows, back then forward, 0 while it's hidden. */
    const shown = () => [page.player.seekIndicator.back.value, page.player.seekIndicator.forward.value].map((side) => (side.shown ? side.seconds : 0));
    expect(page.player.seekable()).toBe(false);
    page.play(VIDEO);
    expect(page.player.seekable()).toBe(false);
    page.player.seekBy(-5);
    expect(shown()).toEqual([0, 0]);

    page.playVideo(VIDEO, 65);
    expect(page.player.seekable()).toBe(true);
    page.player.seekBy(-5);
    expect([video.currentTime, shown()]).toEqual([0, [5, 0]]);
    await vi.advanceTimersByTimeAsync(SEEK_INDICATOR_MS);
    video.currentTime = 63;
    page.player.seekBy(5);
    page.player.seekBy(5);
    expect([video.currentTime, shown()]).toEqual([65, [0, 10]]);
    await vi.advanceTimersByTimeAsync(SEEK_INDICATOR_MS);

    // A frame step and the scrub bar don't show it.
    page.playVideo(SECOND_VIDEO, 65);
    video.currentTime = 10;
    page.player.playOrPause();
    page.player.stepFrame(1);
    expect(video.currentTime).toBeCloseTo(10 + 1 / 30, 10);
    page.player.seek("30");
    expect([video.currentTime, shown()]).toEqual([30, [0, 0]]);

    page.playVideo(VIDEO, Number.POSITIVE_INFINITY);
    expect(page.player.seekable()).toBe(false);
    page.play(PHOTO);
    expect(page.player.seekable()).toBe(false);
    page.player.seekBy(5);
    expect(shown()).toEqual([0, 0]);
  });

  it("hides the seek indicator as a new item plays, starting its total over", () => {
    vi.useFakeTimers();
    const page = setup();
    const shown = () => [page.player.seekIndicator.back.value, page.player.seekIndicator.forward.value].map((side) => (side.shown ? side.seconds : 0));
    page.playVideo(VIDEO, 65);
    page.player.seekBy(5);
    expect(shown()).toEqual([0, 5]);

    page.playVideo(SECOND_VIDEO, 65);
    expect(shown()).toEqual([0, 0]);
    page.player.seekBy(5);
    expect(shown()).toEqual([0, 5]);
  });

  it("does nothing for J, L, or a frame step on a photo", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(3_000);
    // Holding the timer shows its time; a frame step needs a pause.
    page.player.playOrPause();
    expect(page.player.timeText.value).toBe("0:03 / 0:15");
    page.player.seekBy(5);
    page.player.stepFrame(1);
    page.player.playOrPause();
    expect(page.player.timeText.value).toBe("0:03 / 0:15");
  });

  it("steps a paused video a frame at 30 frames a second without the browser's frame timings, and not while it plays or past its last frame", () => {
    const page = setup();
    page.playVideo(VIDEO, 65);
    const { video } = page.elements;
    video.currentTime = 10;
    page.player.stepFrame(1);
    expect(video.currentTime).toBe(10);

    page.player.playOrPause();
    page.player.stepFrame(1);
    expect(video.currentTime).toBeCloseTo(10 + 1 / 30, 10);
    expect(page.elements.seekSlider.value).toBe(String(video.currentTime));
    page.player.stepFrame(-1);
    page.player.stepFrame(-1);
    expect(video.currentTime).toBeCloseTo(10 - 1 / 30, 10);
    video.currentTime = 0.01;
    page.player.stepFrame(-1);
    expect(video.currentTime).toBe(0);
    video.currentTime = 64.99;
    page.player.stepFrame(1);
    expect(video.currentTime).toBe(64.99);
  });

  it("steps a paused video from the frame shown by the frame length timed while it played, with the browser's frame timings, and times a new item's frames anew", () => {
    const page = setup({}, undefined, { frameTimings: true });
    page.playVideo(VIDEO, 65);
    const video = page.elements.video as ReturnType<typeof withFrameTimings<ReturnType<typeof fakeVideo>>>;
    // 25 frames a second: the frame shown at the pause starts at 0.4 s.
    for (let frame = 0; frame <= 10; frame++) video.showFrame(frame * 0.04);
    page.player.playOrPause();
    video.currentTime = 0.43;

    page.player.stepFrame(1);
    expect(video.currentTime).toBeCloseTo(0.46, 10);
    // Pressed again before that frame shows, it goes on a frame.
    page.player.stepFrame(1);
    expect(video.currentTime).toBeCloseTo(0.5, 10);
    video.showFrame(0.48);
    page.player.stepFrame(-1);
    page.player.stepFrame(-1);
    expect(video.currentTime).toBeCloseTo(0.42, 10);

    page.playVideo(SECOND_VIDEO, 30);
    page.player.playOrPause();
    video.currentTime = 5;
    page.player.stepFrame(1);
    expect(video.currentTime).toBeCloseTo(5 + 1 / 30, 10);
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
    expect(page.audio.muted.value).toBe(false);
    page.audio.toggleMute();
    expect(page.audio.muted.value).toBe(true);
    page.audio.toggleMute();
    page.audio.toggleMute();
    expect(page.audio.muted.value).toBe(true);

    page.play(VIDEO);
    expect(page.elements.video.muted).toBe(true);
    page.audio.toggleMute();
    expect(page.elements.video.muted).toBe(false);
    expect(page.audio.muted.value).toBe(false);

    page.play(PHOTO);
    expect(page.audio.muted.value).toBe(false);
    page.audio.toggleMute();
    expect(page.audio.muted.value).toBe(true);
    page.play(SECOND_VIDEO);
    expect(page.elements.video.plays.at(-1)).toBe("display=block muted=true src=http://server/api/media/item-other?token=t");
  });

  it("keeps Mute on this device, so the next page starts with sound muted as it was", () => {
    const page = setup();
    page.audio.toggleMute();
    expect(page.kept.get("rr_device.player.muted")).toBe("true");

    const next = setup(Object.fromEntries(page.kept));
    expect(next.audio.muted.value).toBe(true);
    next.play(VIDEO);
    expect(next.elements.video.plays).toEqual(["display=block muted=true src=http://server/api/media/item-video?token=t"]);

    next.audio.toggleMute();
    expect(next.kept.get("rr_device.player.muted")).toBe("false");
  });

  it("hands a playing video to a new element, which plays on from where it was, and empties the one before it", () => {
    const page = setup();
    page.playVideo(VIDEO, 65);
    const previous = page.elements.video;
    previous.currentTime = 20;
    // With Autoplay off, Loop has the browser repeat the video, the new element too.
    page.player.toggleLoop();

    page.player.renewVideo();
    expect(page.player.videoKey.value).toBe(1);
    const fresh = fakeVideo();
    page.player.takeOverVideo(fresh);
    expect(page.elements.video).toBe(fresh);
    expect([fresh.src, fresh.style.display, fresh.loop, fresh.paused]).toEqual(["http://server/api/media/item-video?token=t", "block", true, false]);
    expect([previous.src, previous.paused, previous.emptied]).toEqual(["", true, true]);
    expect(page.store.playAttemptId.value).toBe(1);

    // Its metadata places it where the one before it was.
    fresh.duration = 65;
    page.player.videoMetadataLoaded();
    expect(fresh.currentTime).toBe(20);
    page.player.videoPlaying();
    expect(page.player.playButton.value).toEqual({ disabled: false, showsPause: true });
  });

  it("keeps a paused video paused on the new element, and on a photo leaves the new element empty", () => {
    const page = setup();
    page.playVideo(VIDEO, 65);
    page.player.playOrPause();
    page.elements.video.currentTime = 8;
    page.player.renewVideo();
    const fresh = fakeVideo();
    page.player.takeOverVideo(fresh);
    expect([fresh.src, fresh.paused, fresh.plays]).toEqual(["http://server/api/media/item-video?token=t", true, []]);
    fresh.duration = 65;
    page.player.videoMetadataLoaded();
    expect(fresh.currentTime).toBe(8);
    expect(page.player.playButton.value.showsPause).toBe(false);

    const photoPage = setup();
    photoPage.play(PHOTO);
    photoPage.player.renewVideo();
    const empty = fakeVideo();
    photoPage.player.takeOverVideo(empty);
    expect([empty.src, empty.style.display, empty.plays]).toEqual(["", "none", []]);
  });

  it("counts a video whose pause is fading out as paused, so Play shows at once and Auto-Pause leaves it to the user", () => {
    let fading = false;
    const page = setup({}, {
      play: (video) => video.play(),
      pause() {
        fading = true;
      },
      pausing: () => fading,
      cancelPause() {
        fading = false;
      }
    });
    page.playVideo(VIDEO, 65);
    page.player.playOrPause();
    expect(page.elements.video.paused).toBe(false);
    expect(page.player.playButton.value).toEqual({ disabled: false, showsPause: false });

    page.player.autoPause();
    page.player.autoResume();
    expect(page.elements.video.plays).toHaveLength(1);
  });

  it("favorites and blacklists the playing item with the device's client id, each clearing the other, and remembers it for history", async () => {
    const page = setup();
    page.play(VIDEO);

    await page.player.toggleFavorite();
    expect(page.requests("/api/favorite")[0]!.body).toEqual({ itemId: "item-video", isFavorite: true, clientId: "client-1" });
    expect(page.player.favorite.value).toBe(true);

    await page.player.toggleBlacklist();
    expect(page.requests("/api/blacklist")[0]!.body).toEqual({ itemId: "item-video", isBlacklisted: true, clientId: "client-1" });
    expect([page.player.favorite.value, page.player.blacklisted.value]).toEqual([false, true]);

    page.play(VIDEO);
    expect(page.player.blacklisted.value).toBe(true);

    page.replies.set("/api/favorite", () => json({}, 500));
    await page.player.toggleFavorite();
    page.replies.set("/api/favorite", () => json({ error: FILE_NOT_IN_LIBRARY }, 404));
    await page.player.toggleFavorite();
    expect(page.notices).toEqual(["Favorite update failed.", `Favorite update failed: ${FILE_NOT_IN_LIBRARY}`]);
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
    answer(flagAnswer({ itemId: "item-other", isBlacklisted: false }));
    await removing;
    expect(page.notified).toEqual([
      { kind: "actions", text: "Removed from favorites", detail: "clip.mp4", key: "flag" },
      { kind: "actions", text: "Removed from blacklist", detail: "other.mp4", key: "flag" }
    ]);
  });

  it("applies a favorite or blacklist answer that arrives after Next to the item it was for", async () => {
    const page = setup();
    page.play(VIDEO);
    const answer = holdReply(page, "/api/favorite");
    const favoriting = page.player.toggleFavorite();
    // Another item plays before the server answers.
    page.play(SECOND_VIDEO);
    answer(flagAnswer({ itemId: "item-video", isFavorite: true }));
    await favoriting;

    expect([page.store.current.value?.itemId, page.store.current.value?.isFavorite, page.player.favorite.value]).toEqual([
      "item-other",
      false,
      false
    ]);
    const cached: PlayingItem = { ...VIDEO };
    page.store.itemStates.applyTo(cached);
    expect(cached.isFavorite).toBe(true);
    page.player.previous();
    expect([page.store.current.value?.itemId, page.player.favorite.value]).toEqual(["item-video", true]);
    expect(page.notified).toEqual([{ kind: "actions", text: "Added to favorites", detail: "clip.mp4", key: "flag" }]);
  });

  it("drops the item states it kept on a resync, so an item played again shows its play's state, and reads the playing item", () => {
    const page = setup();
    page.play(VIDEO);
    page.emit("itemStateChanged", { itemId: "item-other", path: "/media/other.mp4", isFavorite: true, isBlacklisted: false });
    page.emit("resyncRequired", {});
    expect(page.requests("/api/library/item").map((request) => request.body)).toEqual([{ id: "item-video" }]);

    page.play(SECOND_VIDEO);
    expect(page.player.favorite.value).toBe(false);
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
    // The file name shows on the second line, which the log leaves out, as it does every popup's.
    expect(page.notified).toEqual([
      { kind: "devices", text: "Added to favorites on another device", detail: "clip.mp4", key: "sync:item-video" },
      { kind: "devices", text: "Blacklisted on another device", detail: "clip.mp4", key: "sync:item-video" }
    ]);
  });

  it("applies a batch's item states to the playing item and its cache, and pops up another device's batch once with no second line", () => {
    const page = setup();
    page.play(VIDEO);
    const batch = (clientId: string | null) => ({
      flag: "blacklist",
      value: true,
      count: 2,
      items: [
        { itemId: "item-video", isFavorite: false, isBlacklisted: true, previousIsFavorite: true, previousIsBlacklisted: false },
        { itemId: "item-other", isFavorite: false, isBlacklisted: true, previousIsFavorite: false, previousIsBlacklisted: false }
      ],
      clientId
    });
    page.emit("bulkItemStateChanged", batch("client-1"));
    expect([page.player.favorite.value, page.player.blacklisted.value]).toEqual([false, true]);
    expect(page.notified).toEqual([]);

    page.emit("bulkItemStateChanged", batch("another-client"));
    expect(page.notified).toEqual([{ kind: "devices", text: "Blacklisted 2 items on another device", key: "sync-bulk" }]);
  });

  it("tells an item leaving the blacklist from one leaving the favorites, by its state before the change", () => {
    const page = setup();
    const change = (before: { previousIsFavorite?: boolean; previousIsBlacklisted?: boolean }) =>
      page.emit("itemStateChanged", { itemId: "item-video", path: "C:\\media\\clip.mp4", isFavorite: false, isBlacklisted: false, ...before });
    change({ previousIsFavorite: false, previousIsBlacklisted: true });
    change({ previousIsFavorite: true, previousIsBlacklisted: false });
    // An event that doesn't say reads as leaving the favorites, as before.
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

describe("autoplay modes and Loop stops autoplay", () => {
  /** Lets a random pick the timer or the video's end started answer. */
  const settle = () => vi.advanceTimersByTimeAsync(0);

  it("in Timer mode, advances a playing video after Advance after, counted from when it first plays, and a pause by the user or Auto-Pause holds the timer", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(4);
    page.store.setAutoplayMode("timer");
    page.player.toggleAutoplay();
    page.answerRandom(SECOND_VIDEO);
    page.play(VIDEO);
    page.elements.video.duration = 65;
    page.player.videoMetadataLoaded();

    // Loading doesn't count.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    page.player.videoPlaying();
    await vi.advanceTimersByTimeAsync(1_000);
    page.player.playOrPause();
    await vi.advanceTimersByTimeAsync(60_000);
    page.player.playOrPause();
    await vi.advanceTimersByTimeAsync(1_000);
    page.player.autoPause();
    await vi.advanceTimersByTimeAsync(60_000);
    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);
    await settle();
    expect(page.elements.video.src).toContain("item-other");
    expect(page.relayed).toContain("playback=timer-advance attempt=1 hasCurrent=true mediaType=video");
  });

  it("gives a playing video's timer a new Advance after, keeping the time it has run", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(10);
    page.store.setAutoplayMode("timer");
    page.player.toggleAutoplay();
    page.playVideo(VIDEO, 65);
    await vi.advanceTimersByTimeAsync(3_000);

    page.store.setAdvanceAfter(5);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(page.requests("/api/random")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("in Normal mode, plays a video to its end, and in Timer mode a video shorter than Advance after advances at its end, with Loop off", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(4);
    page.player.toggleAutoplay();
    page.answerRandom(SECOND_VIDEO, SECOND_VIDEO);
    page.playVideo(VIDEO, 65);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    page.player.videoEnded();
    expect(page.requests("/api/random")).toHaveLength(1);
    await settle();

    page.store.setAutoplayMode("timer");
    page.playVideo(VIDEO, 3);
    expect(page.elements.video.loop).toBe(false);
    page.player.videoEnded();
    expect(page.requests("/api/random")).toHaveLength(2);
  });

  it("with Loop stops autoplay on, advances nothing with Autoplay and Loop on: a video repeats whole in Normal mode, and a photo stays in either mode, only its timer starting over", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(4);
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.playVideo(VIDEO, 65);
    expect(page.elements.video.loop).toBe(true);
    expect(page.stretch().hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(page.requests("/api/random")).toHaveLength(0);

    page.play(PHOTO);
    page.player.photoLoaded();
    const sources = [...page.elements.photo.sources];
    await vi.advanceTimersByTimeAsync(12_000);
    page.store.setAutoplayMode("timer");
    await vi.advanceTimersByTimeAsync(12_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.elements.photo.sources).toEqual(sources);
    expect(page.elements.photo.style.display).toBe("block");
    expect(page.store.playAttemptId.value).toBe(2);
    expect(page.requests("/api/record-playback")).toHaveLength(2);
    expect(page.store.loading.shown.value).toBe(false);
    expect([page.player.playButton.value.disabled, page.player.seekBar.value.disabled, page.player.timeText.value]).toEqual([true, true, "0:00 / 0:00"]);
  });

  it("in Timer mode, with Loop stops autoplay on, repeats a stretch of Advance after seconds from the video's start, where a seek lands, or where it is when Loop turns on, and shows it on the scrub bar", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(10);
    page.store.setAutoplayMode("timer");
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.playVideo(VIDEO, 120);
    const { video } = page.elements;
    const source = video.src;
    expect(video.loop).toBe(false);
    expect(page.stretch()).toEqual({ hidden: false, from: "0", to: String(10 / 120) });

    video.currentTime = 10.1;
    page.player.videoTimeUpdated();
    expect(video.currentTime).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);

    page.player.seek("60");
    expect(page.stretch()).toEqual({ hidden: false, from: "0.5", to: String(70 / 120) });
    video.currentTime = 70.2;
    page.player.videoTimeUpdated();
    expect(video.currentTime).toBe(60);

    // A stretch the video's end cuts short starts over as the video ends.
    page.player.seek("115");
    expect(page.stretch().to).toBe("1");
    const plays = video.plays.length;
    page.player.videoEnded();
    expect(video.currentTime).toBe(115);
    expect(video.plays).toHaveLength(plays + 1);
    expect(video.src).toBe(source);
    expect(page.store.playAttemptId.value).toBe(1);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.requests("/api/record-playback")).toHaveLength(1);

    page.player.toggleLoop();
    expect(page.stretch().hidden).toBe(true);
    video.currentTime = 30;
    page.player.toggleLoop();
    expect(page.stretch()).toEqual({ hidden: false, from: "0.25", to: String(40 / 120) });

    // Normal mode repeats the whole video, and shows no stretch.
    page.store.setAutoplayMode("normal");
    expect([page.stretch().hidden, video.loop]).toEqual([true, true]);
  });

  it("in Timer mode, with Loop stops autoplay on, starts the stretch where J, L, or a frame step lands, as a seek by the bar does", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(10);
    page.store.setAutoplayMode("timer");
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.playVideo(VIDEO, 120);
    const { video } = page.elements;

    video.currentTime = 50;
    page.player.seekBy(10);
    expect(video.currentTime).toBe(60);
    expect(page.stretch()).toEqual({ hidden: false, from: "0.5", to: String(70 / 120) });
    page.player.seekBy(-30);
    expect(page.stretch()).toEqual({ hidden: false, from: "0.25", to: String(40 / 120) });

    page.player.playOrPause();
    video.currentTime = 90;
    page.player.stepFrame(1);
    expect(video.currentTime).toBeCloseTo(90 + 1 / 30, 10);
    expect(Number(page.stretch().from)).toBeCloseTo((90 + 1 / 30) / 120, 10);
  });

  it("in Timer mode, starts the stretch a seek to the video's end lands on Advance after seconds before the end, or at 0 for a shorter video, and lets the browser repeat a stretch that is the whole video", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(10);
    page.store.setAutoplayMode("timer");
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.playVideo(VIDEO, 120);
    const { video } = page.elements;

    page.player.seek("120");
    expect([video.currentTime, video.loop]).toEqual([110, false]);
    expect(page.stretch()).toEqual({ hidden: false, from: String(110 / 120), to: "1" });

    // A video no longer than Advance after: its stretch from 0 is the whole video, which the browser repeats itself.
    page.playVideo(VIDEO, 3);
    expect([video.loop, page.stretch()]).toEqual([true, { hidden: false, from: "0", to: "1" }]);
    page.player.seek("1");
    expect([video.loop, page.stretch().from]).toEqual([false, String(1 / 3)]);
    page.player.seek("3");
    expect([video.currentTime, video.loop, page.stretch().from]).toEqual([0, true, "0"]);
    page.store.setAdvanceAfter(2);
    expect([video.loop, page.stretch().to]).toEqual([false, String(2 / 3)]);
    expect(page.requests("/api/random")).toHaveLength(0);
  });

  it("in Timer mode, starts a stretch that begins to apply while the video sits at its end as a seek to the end does, and the video there", () => {
    const page = setup();
    page.store.setAdvanceAfter(10);
    page.store.setAutoplayMode("timer");
    page.playVideo(VIDEO, 120);
    const { video } = page.elements;

    // With Autoplay and Loop off, the video plays to its end and stays there.
    video.currentTime = 120;
    video.pause();
    page.player.videoPlayStateChanged();
    page.player.videoEnded();
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    expect([video.currentTime, video.loop]).toEqual([110, false]);
    expect(page.stretch()).toEqual({ hidden: false, from: String(110 / 120), to: "1" });

    // A video no longer than Advance after starts its stretch at 0, which is the whole video, so the browser repeats it.
    page.player.toggleLoop();
    page.player.toggleAutoplay();
    page.playVideo(VIDEO, 3);
    video.currentTime = 3;
    video.pause();
    page.player.videoPlayStateChanged();
    page.player.videoEnded();
    page.player.toggleLoop();
    page.player.toggleAutoplay();
    expect([video.currentTime, video.loop]).toEqual([0, true]);
    expect(page.stretch()).toEqual({ hidden: false, from: "0", to: "1" });
    expect(page.requests("/api/random")).toHaveLength(0);
  });

  it("with Loop stops autoplay off, goes on with Loop on: a photo advances with its timer on the bar, a video shorter than Advance after repeats until it has run, and a longer one advances at the timer in Timer mode and at its end in Normal mode", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(4);
    page.store.setLoopStopsAutoplay(false);
    page.player.toggleAutoplay();
    page.player.toggleLoop();
    page.answerRandom(SECOND_VIDEO, SECOND_VIDEO, SECOND_VIDEO, SECOND_VIDEO, SECOND_VIDEO);
    const picks = () => page.requests("/api/random").length;

    page.play(PHOTO);
    expect([page.player.playButton.value.disabled, page.player.seekBar.value.disabled]).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(picks()).toBe(1);
    await settle();

    // Normal mode: a short video finishes the repeat in progress once the timer has run, then advances.
    page.playVideo(VIDEO, 3);
    expect(page.elements.video.loop).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(picks()).toBe(1);
    expect(page.elements.video.loop).toBe(false);
    page.player.videoEnded();
    expect(picks()).toBe(2);
    await settle();

    page.playVideo(VIDEO, 65);
    expect(page.elements.video.loop).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(picks()).toBe(2);
    page.player.videoEnded();
    expect(picks()).toBe(3);
    await settle();

    // Timer mode: a short video advances once the timer has run, mid-repeat, and so does a longer one.
    page.store.setAutoplayMode("timer");
    page.playVideo(VIDEO, 3);
    expect(page.elements.video.loop).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(picks()).toBe(4);
    await settle();
    page.playVideo(VIDEO, 65);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(picks()).toBe(5);
    expect(page.stretch().hidden).toBe(true);
  });

  it("with Autoplay off, repeats a video whole and a photo with Loop on in either mode", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.store.setAdvanceAfter(4);
    page.player.toggleLoop();
    for (const mode of ["normal", "timer"] as const) {
      page.store.setAutoplayMode(mode);
      page.playVideo(VIDEO, 65);
      expect([mode, page.elements.video.loop, page.stretch().hidden]).toEqual([mode, true, true]);
      await vi.advanceTimersByTimeAsync(60_000);
      page.play(PHOTO);
      const attempt = page.store.playAttemptId.value;
      await vi.advanceTimersByTimeAsync(60_000);
      expect([mode, page.store.playAttemptId.value, page.elements.photo.style.display]).toEqual([mode, attempt, "block"]);
    }
    expect(page.requests("/api/random")).toHaveLength(0);
  });

  it("keeps a photo on screen and its time as Loop turns on and off, running on a timer the user paused once Loop hides the bar, and leaving one Auto-Pause holds", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    page.player.photoLoaded();
    await vi.advanceTimersByTimeAsync(5_000);

    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(2_000);
    page.player.toggleLoop();
    expect(page.player.timeText.value).toBe("0:07 / 0:15");

    page.player.playOrPause();
    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(3_000);
    page.player.toggleLoop();
    expect([page.player.timeText.value, page.player.playButton.value.showsPause]).toEqual(["0:10 / 0:15", true]);

    page.player.autoPause();
    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    page.player.toggleLoop();
    expect([page.player.timeText.value, page.player.playButton.value.showsPause]).toEqual(["0:10 / 0:15", false]);
    page.player.autoResume();
    expect(page.player.playButton.value.showsPause).toBe(true);

    // The same holds for Loop stops autoplay, which hides the bar too.
    page.player.toggleLoop();
    page.store.setLoopStopsAutoplay(false);
    page.player.playOrPause();
    page.store.setLoopStopsAutoplay(true);
    await vi.advanceTimersByTimeAsync(1_000);
    page.store.setLoopStopsAutoplay(false);
    expect([page.player.timeText.value, page.player.playButton.value.showsPause]).toEqual(["0:11 / 0:15", true]);

    expect(page.store.playAttemptId.value).toBe(1);
    expect(page.elements.photo.sources.filter(Boolean)).toHaveLength(1);
    expect(page.requests("/api/record-playback")).toHaveLength(1);
  });

  it("starts a photo's ended timer over when Loop makes it repeat, but not while autoplay still goes on, and stops it with Autoplay and Loop off", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);
    // The pick at the end of the photo's timer finds nothing, so the photo stays, its timer ended.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(page.requests("/api/random")).toHaveLength(1);

    page.store.setLoopStopsAutoplay(false);
    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.player.playButton.value.disabled).toBe(true);

    page.player.toggleLoop();
    page.store.setLoopStopsAutoplay(true);
    page.player.toggleLoop();
    await vi.advanceTimersByTimeAsync(2_000);
    page.player.toggleLoop();
    expect(page.player.timeText.value).toBe("0:02 / 0:15");

    page.player.toggleAutoplay();
    expect(page.player.timeText.value).toBe("0:00 / 0:00");
    page.player.toggleLoop();
    page.player.toggleLoop();
    page.player.toggleAutoplay();
    expect(page.player.timeText.value).toBe("0:00 / 0:15");
    expect(page.store.playAttemptId.value).toBe(1);
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
    return (item: unknown) => answer(randomAnswer(item));
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

  it("ends when a photo loads, or once the server has said why it failed", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.play(PHOTO);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.photoLoaded();
    expect(page.store.loading.shown.value).toBe(false);

    answerMissing(page, PHOTO);
    const answerProbe = holdReply(page, "/api/media/item-photo");
    page.play(PHOTO, "library");
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);
    page.player.photoFailed();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(page.store.loading.shown.value).toBe(true);
    answerProbe(json({}, 404));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.notices).toEqual(["Photo file not found."]);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("ends once the server has said why a video failed, though the browser refuses its play at once", async () => {
    vi.useFakeTimers();
    const page = setup();
    answerMissing(page, VIDEO);
    const answerProbe = holdReply(page, "/api/media/item-video");
    // As a browser does, a source that fails fires its error and then refuses the play waiting on it.
    let refusePlay: (reason: unknown) => void = () => {};
    page.elements.video.play = () => new Promise<void>((_resolve, reject) => (refusePlay = reject));
    page.play(VIDEO, "library");
    await vi.advanceTimersByTimeAsync(500);
    page.player.videoFailed();
    refusePlay(new DOMException("No supported source", "NotSupportedError"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(page.store.loading.shown.value).toBe(true);
    answerProbe(json({}, 404));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.notices).toEqual(["Video file not found."]);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("keeps showing while the server is asked about a recovered video's fresh URL that failed, though its play is refused", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.replies.set("/api/play/item-video", () => json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }));
    page.playVideo(VIDEO, 65);
    let refusePlay: (reason: unknown) => void = () => {};
    page.elements.video.play = () => new Promise<void>((_resolve, reject) => (refusePlay = reject));
    page.player.videoFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.elements.video.src).toContain("token=fresh");

    const answerProbe = holdReply(page, "/api/media/item-video");
    page.player.videoFailed();
    refusePlay(new DOMException("No supported source", "NotSupportedError"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(page.store.loading.shown.value).toBe(true);
    answerProbe(json({}, 503));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("ends when the browser won't play a video, when the user pauses it, on Auto-Pause, and when the player detaches", async () => {
    vi.useFakeTimers();
    const page = setup();
    const ends: Array<() => void> = [() => page.player.playOrPause(), () => page.player.autoPause()];
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

  it("holds for a history step, but not for Loop, Autoplay, a photo's repeat, or an Advance after change", async () => {
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

    // None of them shows the photo again, so nothing waits.
    page.play(PHOTO);
    page.player.photoLoaded();
    page.player.toggleLoop();
    page.player.toggleAutoplay();
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(page.store.loading.shown.value).toBe(false);
    page.store.setAdvanceAfter(4);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(false);
  });
});

const MKV: PlayingItem = {
  ...VIDEO,
  id: "/media/Holiday.MKV",
  itemId: "item-mkv",
  displayName: "Holiday.MKV",
  mediaUrl: "/api/media/item-mkv?token=t"
};

const HEIC: PlayingItem = {
  ...PHOTO,
  id: "/media/IMG_1.HEIC",
  itemId: "item-heic",
  displayName: "IMG_1.HEIC",
  mediaUrl: "/api/media/item-heic?token=t"
};

const COULD_NOT_LOAD_VIDEO = "This video couldn't load. The server may be waiting on a slow or disconnected drive or share.";
const COULD_NOT_LOAD_PHOTO = "This photo couldn't load. The server may be waiting on a slow or disconnected drive or share.";

/** The path of `item`'s media URL, which its range request goes to. */
function mediaPath(item: PlayingItem): string {
  return new URL(item.mediaUrl, "http://server").pathname;
}

/** Answers the range request for `item`'s file with `reply`. */
function answerProbe(page: ReturnType<typeof setup>, item: PlayingItem, reply: () => Response | Promise<Response>): void {
  page.replies.set(mediaPath(item), reply as () => Response);
}

/**
 * Makes `item`'s file missing on the server: its range request answers 404, and so does the play route when the player
 * asks it for a fresh media URL that counts no play. Any other play request, such as a history step's, answers as before.
 */
function answerMissing(page: ReturnType<typeof setup>, item: PlayingItem): void {
  answerProbe(page, item, () => json({ error: "Media not found" }, 404));
  page.replies.set(`/api/play/${item.itemId}`, ({ body }) =>
    body?.recordPlayback === false ? json({ error: "Media not found", code: "play_media_missing" }, 404) : undefined
  );
}

/** The play route's requests for a fresh media URL for `item`, which count no play. */
function freshUrlRequestsFor(page: ReturnType<typeof setup>, item: PlayingItem) {
  return page.requests(`/api/play/${item.itemId}`).filter((request) => request.body?.recordPlayback === false);
}

/** A media answer with a body, as the server streams one. */
function media(status: number): Response {
  return new Response("x", { status });
}

/** The range requests the player sent for `item`'s file. */
function probesOf(page: ReturnType<typeof setup>, item: PlayingItem) {
  return page.requests(mediaPath(item)).filter((request) => request.method === "GET");
}

/** Fails the media of the attempt playing now, as its element's error event does. */
function failMedia(page: ReturnType<typeof setup>): void {
  if (page.store.current.value?.mediaType === "photo") {
    page.player.photoFailed();
  } else {
    page.player.videoFailed();
  }
}

/** Makes `items` the history, each a copy, with the entry at `index` playing, without playing it. */
function seedHistory(page: ReturnType<typeof setup>, items: PlayingItem[], index: number): void {
  const entries = items.map((item) => ({ ...item }));
  page.store.history.value = entries;
  page.store.historyIndex.value = index;
  page.store.current.value = entries[index]!;
}

/** The relayed lines that would name the item or its media: its path, file name, or media token. */
function leakedLines(page: ReturnType<typeof setup>): string[] {
  return page.relayed.filter((line) => /\/api\/media\/(?!\{token\})|token=|Holiday|IMG_1|clip\.mp4|beach|other\.mp4|item-/.test(line));
}

describe("a file that fails to load", () => {
  it.each([
    ["a video", "200", MKV, () => media(200), "This video's format (.mkv) isn't supported in this browser.", "statusCode=200 failure=format"],
    ["a video", "206", MKV, () => media(206), "This video's format (.mkv) isn't supported in this browser.", "statusCode=206 failure=format"],
    ["a video", "404", MKV, () => json({ error: "Media not found" }, 404), "Video file not found.", "statusCode=404 failure=missing"],
    ["a video", "503", MKV, () => json({ error: "Media can't be read" }, 503), COULD_NOT_LOAD_VIDEO, "statusCode=503 failure=unreadable"],
    ["a photo", "200", HEIC, () => media(200), "This photo's format (.heic) isn't supported in this browser.", "statusCode=200 failure=format"],
    ["a photo", "206", HEIC, () => media(206), "This photo's format (.heic) isn't supported in this browser.", "statusCode=206 failure=format"],
    ["a photo", "404", HEIC, () => json({ error: "Media not found" }, 404), "Photo file not found.", "statusCode=404 failure=missing"],
    ["a photo", "503", HEIC, () => json({ error: "Media can't be read" }, 503), COULD_NOT_LOAD_PHOTO, "statusCode=503 failure=unreadable"]
  ])("shows %s's message for the server's %s to the range request", async (_kind, answer, item, reply, message, logged) => {
    const page = setup();
    answerProbe(page, item, reply);
    if (answer === "404") {
      // The play route says the file is missing too, so the 404 isn't for a media token the server dropped.
      answerMissing(page, item);
    }
    page.play(item, "library");
    failMedia(page);

    await vi.waitFor(() => expect(page.notices).toEqual([message]));
    const probe = probesOf(page, item);
    expect(probe).toHaveLength(1);
    expect(probe[0]!.headers.get("Range")).toBe("bytes=0-0");
    expect(freshUrlRequestsFor(page, item)).toHaveLength(answer === "404" ? 1 : 0);
    expect(page.notified).toEqual([]);
    expect(page.player.mediaFailed.value).toBe(true);
    expect(page.relayed).toContain(`playback=media-probe attempt=1 hasCurrent=true mediaType=${item.mediaType} ${logged}`);
    expect(leakedLines(page)).toEqual([]);
  });

  it.each([
    ["a video", MKV, COULD_NOT_LOAD_VIDEO],
    ["a photo", HEIC, COULD_NOT_LOAD_PHOTO]
  ])("shows %s's couldn't-load message when the range request gets no answer in ten seconds, keeping Loading… up until then", async (_kind, item, message) => {
    vi.useFakeTimers();
    const page = setup();
    answerProbe(page, item, () => new Promise<Response>(() => {}));
    page.play(item, "library");
    failMedia(page);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(page.notices).toEqual([]);
    expect(page.store.loading.shown.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.notices).toEqual([message]);
    expect(page.store.loading.shown.value).toBe(false);
    expect(page.relayed).toContain(`playback=media-probe attempt=1 hasCurrent=true mediaType=${item.mediaType} timeoutMs=10000 failure=unreadable`);
  });

  it("decides by the server's answer, not the file's container: an .mp4 the server has says its format, and an .mkv it hasn't says not found", async () => {
    const page = setup();
    answerProbe(page, VIDEO, () => media(206));
    answerMissing(page, MKV);
    page.play(VIDEO, "library");
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.notices).toEqual(["This video's format (.mp4) isn't supported in this browser."]));

    page.play(MKV, "library");
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.notices.at(-1)).toBe("Video file not found."));
  });

  it.each([
    ["a video", MKV],
    ["a photo", HEIC]
  ])("plays %s on from a fresh media URL that counts no play when its 404 was for a media token the server dropped", async (_kind, item) => {
    const page = setup();
    answerProbe(page, item, () => json({ error: "Media not found" }, 404));
    page.replies.set(`/api/play/${item.itemId}`, () => json({ ...item, mediaUrl: `${mediaPath(item)}?token=fresh` }));
    page.play(item);
    failMedia(page);

    const element = item.mediaType === "photo" ? page.elements.photo : page.elements.video;
    await vi.waitFor(() => expect(element.src).toBe(`http://server${mediaPath(item)}?token=fresh`));
    expect(page.requests(`/api/play/${item.itemId}`).map((request) => request.body)).toEqual([
      { clientId: "client-1", sessionId: "session-1", recordPlayback: false }
    ]);
    expect(page.store.history.value[0]!.mediaUrl).toBe(`${mediaPath(item)}?token=fresh`);
    expect(page.notices).toEqual([]);
    expect(page.notified).toEqual([]);
    expect(page.player.mediaFailed.value).toBe(false);
    expect(page.requests("/api/record-playback")).toHaveLength(1);
    expect(page.relayed).toContain("playback=media-recheck attempt=1 hasCurrent=true");
    expect(leakedLines(page)).toEqual([]);
  });

  it("says a file is missing when its fresh media URL answers 404 too, asking the play route only once", async () => {
    const page = setup();
    answerProbe(page, MKV, () => json({ error: "Media not found" }, 404));
    page.replies.set("/api/play/item-mkv", () => json({ ...MKV, mediaUrl: "/api/media/item-mkv?token=fresh" }));
    page.play(MKV, "library");
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual(["Video file not found."]));
    expect(freshUrlRequestsFor(page, MKV)).toHaveLength(1);
    expect(probesOf(page, MKV)).toHaveLength(2);
  });

  it("stops on the couldn't-load message when the play route can't say whether a file the range request answered 404 is missing", async () => {
    const page = setup();
    answerProbe(page, MKV, () => json({ error: "Media not found" }, 404));
    page.replies.set("/api/play/item-mkv", () => json({ error: "Media file can't be read", code: "play_media_unreadable" }, 503));
    page.answerRandom(SECOND_VIDEO);
    page.play(MKV);
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]));
    expect(page.notified).toEqual([]);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.relayed).toContain("playback=media-recheck-failed attempt=1 hasCurrent=true statusCode=503 code=play_media_unreadable");
  });

  it("shows only the pairing prompt when the range request is answered 401, naming its route without the token", async () => {
    const page = setup();
    answerProbe(page, MKV, () => json({}, 401));
    page.play(MKV, "library");
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.store.pairingRequired.value).toBe(true));
    await vi.waitFor(() => expect(page.store.loading.shown.value).toBe(false));
    expect(page.notices).toEqual([]);
    expect(page.notified).toEqual([]);
    expect(page.relayed).toContain(
      "status=Unauthorized. Pair first. (GET /api/media/{token}) hasCurrent=true attempt=1"
    );
    expect(leakedLines(page)).toEqual([]);
  });

  it("skips a random pick's file this browser can't play, saying so in a Skipped files popup, and picks again", async () => {
    const page = setup();
    page.answerRandom(MKV, SECOND_VIDEO);
    answerProbe(page, MKV, () => media(206));
    await page.player.pickRandom();
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-other"));
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a file this browser can't play.", detail: "Holiday.MKV", key: "skip" }]);
    expect(page.notices).toEqual([]);
    expect(page.requests("/api/random")).toHaveLength(2);
    expect(page.store.history.value.map((item) => item.itemId)).toEqual(["item-mkv", "item-other"]);
    expect(page.elements.video.src).toContain("item-other");
    expect(leakedLines(page)).toEqual([]);
  });

  it("skips a file this browser can't play that Insert put after the playing item by picking again with Insert, keeping the plays ahead after it", async () => {
    const page = setup({ "rr_device.randomization.behavior": '"insert"' });
    seedHistory(page, [VIDEO, PHOTO], 0);
    page.answerRandom(MKV, SECOND_VIDEO);
    answerProbe(page, MKV, () => media(206));
    await page.player.pickRandom();
    expect(page.store.history.value.map((item) => item.itemId)).toEqual(["item-video", "item-mkv", "item-photo"]);
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-other"));
    expect(page.requests("/api/random")).toHaveLength(2);
    expect(page.store.history.value.map((item) => item.itemId)).toEqual(["item-video", "item-mkv", "item-other", "item-photo"]);
    expect(page.store.historyIndex.value).toBe(2);
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a file this browser can't play.", detail: "Holiday.MKV", key: "skip" }]);
  });

  it("skips a missing file autoplay reaches, and goes on", async () => {
    const page = setup();
    page.player.toggleAutoplay();
    page.answerRandom(MKV, SECOND_VIDEO);
    answerMissing(page, MKV);
    page.playVideo(VIDEO, 30);
    page.player.videoEnded();
    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-mkv"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-other"));
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a missing file.", detail: "Holiday.MKV", key: "skip" }]);
    expect(page.notices).toEqual([]);
  });

  it("skips a file Next reaches in the history, going on to the next entry", async () => {
    const page = setup();
    seedHistory(page, [VIDEO, MKV, SECOND_VIDEO], 0);
    answerProbe(page, MKV, () => media(200));
    page.player.next();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-mkv"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-other"));
    expect(page.store.historyIndex.value).toBe(2);
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a file this browser can't play.", detail: "Holiday.MKV", key: "skip" }]);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.notices).toEqual([]);
  });

  it("skips a file Previous reaches, going on back to the older entry", async () => {
    const page = setup();
    seedHistory(page, [VIDEO, MKV, SECOND_VIDEO], 2);
    answerMissing(page, MKV);
    page.player.previous();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-mkv"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-video"));
    expect(page.store.historyIndex.value).toBe(0);
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a missing file.", detail: "Holiday.MKV", key: "skip" }]);
    expect(page.notices).toEqual([]);
  });

  it("stops on the message of a file Previous reaches at the oldest entry, with nowhere further back", async () => {
    const page = setup();
    seedHistory(page, [MKV, SECOND_VIDEO], 1);
    answerMissing(page, MKV);
    page.player.previous();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-mkv"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual(["Video file not found."]));
    expect(page.notified).toEqual([]);
    expect(page.store.historyIndex.value).toBe(0);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("shows a file chosen from the library its message, rather than skipping it", async () => {
    const page = setup();
    page.answerRandom(SECOND_VIDEO);
    answerProbe(page, MKV, () => media(206));
    page.play(MKV, "library");
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual(["This video's format (.mkv) isn't supported in this browser."]));
    expect(page.notified).toEqual([]);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.store.current.value?.itemId).toBe("item-mkv");
  });

  it("stops after ten skips in a row on the next such file's message, and starts the count over when the user presses Next", async () => {
    const page = setup();
    page.answerRandom(...Array.from({ length: 11 }, () => MKV));
    answerMissing(page, MKV);
    await page.player.pickRandom();
    for (let attempt = 1; attempt <= 11; attempt++) {
      await vi.waitFor(() => expect(page.store.playAttemptId.value).toBe(attempt));
      page.player.videoFailed();
    }

    await vi.waitFor(() => expect(page.notices).toEqual(["Video file not found."]));
    expect(page.notified).toHaveLength(10);
    expect(page.requests("/api/random")).toHaveLength(11);
    expect(page.store.current.value?.itemId).toBe("item-mkv");
    expect(page.store.loading.shown.value).toBe(false);

    // Next is the user's own play, so the count starts over and the file it reaches is skipped again.
    page.answerRandom(MKV, VIDEO);
    page.player.next();
    await vi.waitFor(() => expect(page.store.playAttemptId.value).toBe(12));
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-video"));
    expect(page.notified).toHaveLength(11);
    expect(page.notices).toHaveLength(1);
  });

  it("starts the count of skips in a row over when a file loads", async () => {
    const page = setup();
    page.player.toggleAutoplay();
    answerMissing(page, MKV);
    page.answerRandom(...Array.from({ length: 9 }, () => MKV), VIDEO, ...Array.from({ length: 11 }, () => MKV));
    await page.player.pickRandom();
    for (let attempt = 1; attempt <= 9; attempt++) {
      await vi.waitFor(() => expect(page.store.playAttemptId.value).toBe(attempt));
      page.player.videoFailed();
    }
    await vi.waitFor(() => expect(page.store.playAttemptId.value).toBe(10));
    expect(page.store.current.value?.itemId).toBe("item-video");
    page.player.videoPlaying();
    page.player.videoEnded();
    for (let attempt = 11; attempt <= 21; attempt++) {
      await vi.waitFor(() => expect(page.store.playAttemptId.value).toBe(attempt));
      page.player.videoFailed();
    }

    await vi.waitFor(() => expect(page.notices).toEqual(["Video file not found."]));
    expect(page.notified).toHaveLength(9 + 10);
    expect(page.requests("/api/random")).toHaveLength(21);
  });

  it("stops on the couldn't-load message when autoplay reaches a file the server can't read, picking nothing more", async () => {
    const page = setup();
    page.player.toggleAutoplay();
    page.answerRandom(MKV, SECOND_VIDEO);
    answerProbe(page, MKV, () => json({ error: "Media can't be read" }, 503));
    page.playVideo(VIDEO, 30);
    page.player.videoEnded();
    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-mkv"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]));
    expect(page.notified).toEqual([]);
    expect(page.requests("/api/random")).toHaveLength(1);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("stops on the couldn't-load message when Next reaches a file the server can't read", async () => {
    const page = setup();
    page.answerRandom(MKV, SECOND_VIDEO);
    answerProbe(page, MKV, () => new Promise<Response>(() => {}));
    vi.useFakeTimers();
    page.play(VIDEO);
    page.player.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.store.current.value?.itemId).toBe("item-mkv");
    page.player.videoFailed();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]);
    expect(page.notified).toEqual([]);
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("drops a range request's answer once another play has started", async () => {
    const page = setup();
    const answer = holdReply(page, mediaPath(MKV));
    page.answerRandom(SECOND_VIDEO);
    page.play(MKV);
    page.player.videoFailed();
    page.player.next();
    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-other"));

    answer(json({}, 404));
    await vi.waitFor(() => expect(page.relayed).toContain("playback=media-probe-stale attempt=2 hasCurrent=true expectedPlayAttemptId=1"));
    expect(page.notified).toEqual([]);
    expect(page.notices).toEqual([]);
    expect(page.store.current.value?.itemId).toBe("item-other");
    expect(page.requests("/api/random")).toHaveLength(1);
  });

  it("holds a photo's timer once it stops on a failure, so autoplay doesn't move on past it", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.answerRandom(SECOND_VIDEO);
    answerProbe(page, HEIC, () => json({}, 503));
    page.play(HEIC);
    page.player.photoFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.notices).toEqual([COULD_NOT_LOAD_PHOTO]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.store.current.value?.itemId).toBe("item-heic");
    expect(page.player.playButton.value.showsPause).toBe(false);
  });

  it("keeps a photo that stopped on its message held when Auto-Pause, which held it before it failed, lets go", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.answerRandom(SECOND_VIDEO);
    answerProbe(page, HEIC, () => json({}, 503));
    page.play(HEIC);
    // The panel opens as the overlay while the photo loads, holding its running timer.
    page.player.autoPause();
    page.player.photoFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.notices).toEqual([COULD_NOT_LOAD_PHOTO]);

    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    expect(page.store.current.value?.itemId).toBe("item-heic");
  });

  it("keeps a photo held when Auto-Pause lets go after its skip found nothing else to play", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.answerRandom(HEIC);
    answerProbe(page, HEIC, () => media(206));
    await page.player.pickRandom();
    page.player.autoPause();
    page.player.photoFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.notified).toHaveLength(1);
    expect(page.notices).toEqual(["No eligible media for current filters."]);
    expect(page.requests("/api/random")).toHaveLength(2);

    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(2);
    expect(page.store.current.value?.itemId).toBe("item-heic");
  });
});

describe("history steps", () => {
  it("get a fresh media URL from the play route, which counts the step's one play, and play with it", async () => {
    const page = setup();
    seedHistory(page, [VIDEO, SECOND_VIDEO], 1);
    page.replies.set("/api/play/item-video", () => json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }));
    page.player.previous();
    // Nothing loads until the server answers, and Loading… waits for it.
    expect(page.elements.video.src).toBe("");

    await vi.waitFor(() => expect(page.elements.video.src).toBe("http://server/api/media/item-video?token=fresh"));
    expect(page.requests("/api/play/item-video").map((request) => request.body)).toEqual([{ clientId: "client-1", sessionId: "session-1" }]);
    expect(page.store.history.value[0]!.mediaUrl).toBe("/api/media/item-video?token=fresh");
    await Promise.resolve();
    expect(page.requests("/api/record-playback")).toHaveLength(0);

    page.player.next();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-other"));
    expect(page.requests("/api/play/item-other")).toHaveLength(1);
    expect(page.requests("/api/record-playback")).toHaveLength(0);
  });

  it("skip a file the play route says is missing, without asking about it again", async () => {
    const page = setup();
    seedHistory(page, [VIDEO, MKV, SECOND_VIDEO], 0);
    page.replies.set("/api/play/item-mkv", () => json({ error: "Media not found", code: "play_media_missing" }, 404));
    page.player.next();

    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-other"));
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a missing file.", detail: "Holiday.MKV", key: "skip" }]);
    expect(probesOf(page, MKV)).toHaveLength(0);
    expect(page.relayed).toContain("playback=step-play-failed attempt=1 hasCurrent=true statusCode=404 code=play_media_missing");
  });

  it.each([
    [
      "503 play_media_unreadable",
      () => json({ error: "Media can't be read", code: "play_media_unreadable" }, 503),
      COULD_NOT_LOAD_VIDEO,
      COULD_NOT_LOAD_VIDEO
    ],
    ["another 5xx", () => json({ error: "Server exploded" }, 500), COULD_NOT_LOAD_VIDEO, COULD_NOT_LOAD_VIDEO],
    // A refusal's log line names only its status, since the server's reason can name a file.
    ["409", () => json({ error: "Source disabled", code: "play_source_disabled" }, 409), "This item is unavailable.", "Playback failed (HTTP 409)."],
    ["415", () => json({ error: "Unsupported", code: "play_unsupported_media" }, 415), "This file type is not supported.", "Playback failed (HTTP 415)."],
    ["another 4xx", () => json({ error: "The source is offline." }, 400), "Playback failed: The source is offline.", "Playback failed (HTTP 400)."],
    [
      "no answer",
      () => {
        throw new TypeError("Failed to fetch");
      },
      COULD_NOT_LOAD_VIDEO,
      COULD_NOT_LOAD_VIDEO
    ]
  ])("stop on the message for a play route's %s, without skipping or asking about the file", async (_answer, reply, message, logText) => {
    const page = setup();
    seedHistory(page, [VIDEO, MKV, SECOND_VIDEO], 0);
    page.replies.set("/api/play/item-mkv", reply);
    page.player.next();

    await vi.waitFor(() => expect(page.notices).toEqual([message]));
    expect(page.noticeLogs).toEqual([logText]);
    expect(page.notified).toEqual([]);
    expect(page.store.current.value?.itemId).toBe("item-mkv");
    expect(page.store.historyIndex.value).toBe(1);
    expect(probesOf(page, MKV)).toHaveLength(0);
    expect(page.store.loading.shown.value).toBe(false);
    expect(page.player.mediaFailed.value).toBe(true);
    expect(leakedLines(page)).toEqual([]);
  });

  it("stop on the couldn't-load message when the play route doesn't answer in ten seconds", async () => {
    vi.useFakeTimers();
    const page = setup();
    seedHistory(page, [VIDEO, MKV], 0);
    page.replies.set("/api/play/item-mkv", () => new Promise<Response>(() => {}) as unknown as Response);
    page.player.next();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(page.notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]);
    expect(page.relayed).toContain("playback=step-play-failed attempt=1 hasCurrent=true timeoutMs=10000");
  });

  it("show only the pairing prompt for a play route's 401", async () => {
    const page = setup();
    seedHistory(page, [VIDEO, MKV], 0);
    page.replies.set("/api/play/item-mkv", () => json({}, 401));
    page.player.next();

    await vi.waitFor(() => expect(page.store.pairingRequired.value).toBe(true));
    await vi.waitFor(() => expect(page.store.loading.shown.value).toBe(false));
    expect(page.notices).toEqual([]);
    expect(page.relayed).toContain("status=Unauthorized. Pair first. (POST /api/play/{itemId}) hasCurrent=true attempt=1");
  });

  it("drop a play route's answer once another play has started", async () => {
    const page = setup();
    seedHistory(page, [VIDEO, MKV, SECOND_VIDEO], 0);
    const answer = holdReply(page, "/api/play/item-mkv");
    page.player.next();
    page.player.next();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("item-other"));

    answer(json({ ...MKV, mediaUrl: "/api/media/item-mkv?token=late" }));
    await vi.waitFor(() => expect(page.relayed).toContain("playback=step-play-stale attempt=2 hasCurrent=true expectedPlayAttemptId=1"));
    expect(page.elements.video.src).toContain("item-other");
  });

  it("load a video paused when Auto-Pause came while they waited for the server, for Auto-Resume to play", async () => {
    vi.useFakeTimers();
    const page = setup();
    seedHistory(page, [VIDEO, SECOND_VIDEO], 1);
    const answer = holdReply(page, "/api/play/item-video");
    page.player.previous();
    page.player.autoPause();
    // Loading… keeps waiting for the server.
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(true);

    answer(json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.elements.video.src).toBe("http://server/api/media/item-video?token=fresh");
    expect(page.elements.video.style.display).toBe("block");
    expect(page.elements.video.plays).toEqual([]);
    expect(page.player.playButton.value.showsPause).toBe(false);
    expect(page.store.loading.shown.value).toBe(false);

    page.player.autoResume();
    expect(page.elements.video.plays).toEqual(["display=block muted=false src=http://server/api/media/item-video?token=fresh"]);
  });

  it("hold a photo's timer when Auto-Pause came while they waited for the server, for Auto-Resume to run it", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    seedHistory(page, [PHOTO, SECOND_VIDEO], 1);
    const answer = holdReply(page, "/api/play/item-photo");
    page.player.previous();
    page.player.autoPause();
    answer(json({ ...PHOTO }));
    await vi.advanceTimersByTimeAsync(0);
    page.player.photoLoaded();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.store.historyIndex.value).toBe(0);

    page.player.autoResume();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(page.store.historyIndex.value).toBe(1);
  });

  it("play as usual when Auto-Pause let go before the server answered", async () => {
    vi.useFakeTimers();
    const page = setup();
    seedHistory(page, [VIDEO, SECOND_VIDEO], 1);
    const answer = holdReply(page, "/api/play/item-video");
    page.player.previous();
    page.player.autoPause();
    page.player.autoResume();

    answer(json({ ...VIDEO }));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.elements.video.plays).toHaveLength(1);
  });

  it.each([
    [
      "the play route says is missing",
      async (_page: ReturnType<typeof setup>, answer: (response: Response) => void) =>
        answer(json({ error: "Media not found", code: "play_media_missing" }, 404))
    ],
    [
      "this browser can't play",
      async (page: ReturnType<typeof setup>, answer: (response: Response) => void) => {
        answerProbe(page, MKV, () => media(200));
        answer(json({ ...MKV }));
        await vi.waitFor(() => expect(page.elements.video.src).toContain("item-mkv"));
        page.player.videoFailed();
      }
    ]
  ])("load the next entry paused when the one Auto-Pause came to while they waited is a file %s, which is skipped", async (_name, fail) => {
    vi.useFakeTimers();
    const page = setup();
    seedHistory(page, [VIDEO, MKV, SECOND_VIDEO], 0);
    const answer = holdReply(page, "/api/play/item-mkv");
    page.player.next();
    page.player.autoPause();
    await fail(page, answer);

    const { video } = page.elements;
    await vi.waitFor(() => expect(video.src).toContain("item-other"));
    expect(page.notified).toHaveLength(1);
    expect(video.plays).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(page.store.loading.shown.value).toBe(false);

    page.player.autoResume();
    expect(video.plays).toEqual(["display=block muted=false src=http://server/api/media/item-other?token=t"]);
  });
});

describe("recovering a video that had played", () => {
  /** Plays VIDEO forward until it has played to `position`, answering the play route with a fresh URL. */
  function playedTo(position: number, options: { paused?: boolean } = {}) {
    const page = setup();
    page.replies.set("/api/play/item-video", () => json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }));
    page.playVideo(VIDEO, 65);
    page.elements.video.currentTime = position;
    if (options.paused) {
      page.player.playOrPause();
    }
    return page;
  }

  /** The play route's requests for a fresh media URL, which count no play. */
  function freshUrlRequests(page: ReturnType<typeof setup>) {
    return page.requests("/api/play/item-video").filter((request) => request.body?.recordPlayback === false);
  }

  it("gets a fresh media URL that counts no play, and plays on from where it was, with no message", async () => {
    const page = playedTo(30);
    const plays = page.elements.video.plays.length;
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.elements.video.src).toBe("http://server/api/media/item-video?token=fresh"));
    expect(page.requests("/api/play/item-video").map((request) => request.body)).toEqual([
      { clientId: "client-1", sessionId: "session-1", recordPlayback: false }
    ]);
    expect(page.elements.video.plays.slice(plays)).toEqual(["display=block muted=false src=http://server/api/media/item-video?token=fresh"]);
    // The new source starts at its beginning; its metadata seeks it to where it was.
    page.elements.video.currentTime = 0;
    page.player.videoMetadataLoaded();
    expect(page.elements.video.currentTime).toBe(30);
    page.player.videoPlaying();

    expect(page.notices).toEqual([]);
    expect(page.notified).toEqual([]);
    expect(probesOf(page, VIDEO)).toHaveLength(0);
    expect(page.requests("/api/record-playback")).toHaveLength(1);
    expect(page.store.history.value[0]!.mediaUrl).toBe("/api/media/item-video?token=fresh");
    expect(page.store.loading.shown.value).toBe(false);
    expect(page.relayed).toContain("playback=recover attempt=1 hasCurrent=true");
    expect(leakedLines(page)).toEqual([]);
  });

  it("stays paused at its position when it was paused", async () => {
    const page = playedTo(12, { paused: true });
    const plays = page.elements.video.plays.length;
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh"));
    page.elements.video.currentTime = 0;
    page.player.videoMetadataLoaded();
    expect(page.elements.video.currentTime).toBe(12);
    expect(page.elements.video.plays.length).toBe(plays);
    expect(page.elements.video.paused).toBe(true);
    expect(page.notices).toEqual([]);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("stays paused when the user pauses it while it waits for the fresh URL", async () => {
    const page = playedTo(30);
    const answer = holdReply(page, "/api/play/item-video");
    const plays = page.elements.video.plays.length;
    page.player.videoFailed();
    // A source that fails fires no pause, so the video still reads as playing, and Pause pauses it.
    page.player.playOrPause();
    answer(json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }));

    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh"));
    expect(page.elements.video.plays.length).toBe(plays);
    expect(page.elements.video.paused).toBe(true);
    expect(page.player.playButton.value.showsPause).toBe(false);
    expect(page.store.loading.shown.value).toBe(false);
  });

  it("stays paused while Auto-Pause paused it during the wait, and plays on once Auto-Pause lets go", async () => {
    const page = playedTo(30);
    const answer = holdReply(page, "/api/play/item-video");
    page.player.videoFailed();
    page.player.autoPause();
    answer(json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }));
    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh"));
    const plays = page.elements.video.plays.length;
    expect(page.elements.video.paused).toBe(true);

    page.player.autoResume();
    await vi.waitFor(() =>
      expect(page.elements.video.plays.slice(plays)).toEqual(["display=block muted=false src=http://server/api/media/item-video?token=fresh"])
    );
  });

  it("waits for the connection while the server can't be reached, with no dialog, and then recovers", async () => {
    vi.useFakeTimers();
    const page = playedTo(30);
    page.store.reconnecting.value = true;
    page.player.videoFailed();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(freshUrlRequests(page)).toHaveLength(0);
    expect(page.notices).toEqual([]);
    expect(page.relayed).toContain("playback=recover-wait attempt=1 hasCurrent=true");

    page.store.reconnecting.value = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(freshUrlRequests(page)).toHaveLength(1);
    expect(page.elements.video.src).toContain("token=fresh");
    expect(page.notices).toEqual([]);
  });

  it("waits for the connection when its request can't reach the server, and asks again once it is back", async () => {
    vi.useFakeTimers();
    const page = playedTo(30);
    let reachable = false;
    page.replies.set("/api/play/item-video", () => {
      if (!reachable) {
        throw new TypeError("Failed to fetch");
      }
      return json({ ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" });
    });
    page.player.videoFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(freshUrlRequests(page)).toHaveLength(1);

    // The connection finds the server down, and then back.
    page.store.reconnecting.value = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(freshUrlRequests(page)).toHaveLength(1);
    reachable = true;
    page.store.reconnecting.value = false;
    await vi.advanceTimersByTimeAsync(0);
    expect(freshUrlRequests(page)).toHaveLength(2);
    expect(page.elements.video.src).toContain("token=fresh");
    expect(page.notices).toEqual([]);
  });

  it("asks about the file when the fresh URL fails too", async () => {
    const page = playedTo(30);
    answerProbe(page, { ...VIDEO, mediaUrl: "/api/media/item-video?token=fresh" }, () => json({}, 503));
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh"));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]));
    expect(freshUrlRequests(page)).toHaveLength(1);
    expect(probesOf(page, VIDEO)).toHaveLength(1);
  });

  it("recovers again once the video has played since, as for a second server restart in one video", async () => {
    const page = playedTo(30);
    let fresh = 0;
    page.replies.set("/api/play/item-video", () => json({ ...VIDEO, mediaUrl: `/api/media/item-video?token=fresh${++fresh}` }));
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh1"));
    page.elements.video.currentTime = 0;
    page.player.videoMetadataLoaded();
    page.player.videoPlaying();
    page.elements.video.currentTime = 50;

    // A second restart later in the same video: it plays on again from where it had reached.
    page.player.videoFailed();
    await vi.waitFor(() => expect(page.elements.video.src).toContain("token=fresh2"));
    page.elements.video.currentTime = 0;
    page.player.videoMetadataLoaded();
    expect(page.elements.video.currentTime).toBe(50);
    page.player.videoPlaying();

    expect(freshUrlRequests(page)).toHaveLength(2);
    expect(probesOf(page, VIDEO)).toHaveLength(0);
    expect(page.notices).toEqual([]);
    expect(page.requests("/api/record-playback")).toHaveLength(1);
  });

  it("goes on as a history step's request does when the server refuses it: a missing file skips, without asking about it", async () => {
    const page = playedTo(30);
    page.answerRandom(SECOND_VIDEO);
    page.replies.set("/api/play/item-video", () => json({ error: "Media not found", code: "play_media_missing" }, 404));
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.store.current.value?.itemId).toBe("item-other"));
    expect(page.notified).toEqual([{ kind: "skips", text: "Skipped a missing file.", detail: "clip.mp4", key: "skip" }]);
    expect(probesOf(page, VIDEO)).toHaveLength(0);
    expect(page.relayed).toContain("playback=recover-failed attempt=1 hasCurrent=true statusCode=404 code=play_media_missing");
  });

  it("asks about a video that never played straight away, without a fresh URL", async () => {
    const page = setup();
    answerProbe(page, VIDEO, () => json({}, 503));
    page.play(VIDEO);
    page.player.videoFailed();

    await vi.waitFor(() => expect(page.notices).toEqual([COULD_NOT_LOAD_VIDEO]));
    expect(freshUrlRequests(page)).toHaveLength(0);
    expect(probesOf(page, VIDEO)).toHaveLength(1);
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
