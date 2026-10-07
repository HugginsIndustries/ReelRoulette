import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayer, type PlayerElements } from "../playback/player";
import { createAppApi } from "../state/appApi";
import { createAppStore, type PlayingItem } from "../state/appStore";
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
  const player = createPlayer({ apiBaseUrl: "http://server/", store, api, connection, fetch: fetchImpl });
  const elements = {
    video: fakeVideo(),
    photo: { src: "", style: { display: "none" } },
    emptyState: { style: { display: "" } },
    seekRow: { style: { display: "none" } },
    seekSlider: { value: "0", max: "100" }
  };
  player.attach(elements satisfies PlayerElements);
  return {
    store,
    player,
    elements,
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

    const { video, photo, emptyState, seekRow } = page.elements;
    expect(video.plays).toEqual(["display=block muted=true src=http://server/api/media/item-video?token=t"]);
    expect([video.style.display, seekRow.style.display, photo.style.display, emptyState.style.display]).toEqual(["block", "flex", "none", "none"]);
    expect(page.player.showsPause.value).toBe(true);
    expect(page.player.muteButton.value).toEqual({ disabled: false, active: true });
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

  it("shows a photo, disables Mute, and ignores the video's events until a video plays again", () => {
    const page = setup();
    page.play(VIDEO);
    page.play(PHOTO);

    const { video, photo, seekRow, seekSlider } = page.elements;
    expect([photo.src, photo.style.display, video.style.display, seekRow.style.display]).toEqual([
      "http://server/api/media/item-photo?token=t",
      "block",
      "none",
      "none"
    ]);
    expect(video.paused).toBe(true);
    expect(page.player.muteButton.value).toEqual({ disabled: true, active: false });

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
    expect(page.store.status.value).toBe("Cannot play: server compatibility check failed.");
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

  it("pauses a playing video for the tag editor and resumes it, and leaves a paused one paused", () => {
    const page = setup();
    page.play(VIDEO);
    const { video } = page.elements;

    page.player.pauseForTagEditor();
    expect(video.paused).toBe(true);
    page.player.resumeAfterTagEditor();
    expect(video.paused).toBe(false);

    page.player.playOrPause();
    expect(video.paused).toBe(true);
    expect(page.player.showsPause.value).toBe(false);
    page.player.pauseForTagEditor();
    page.player.resumeAfterTagEditor();
    expect(video.paused).toBe(true);
  });

  it("holds a photo's timer for the tag editor and starts the photo again after it", async () => {
    vi.useFakeTimers();
    const page = setup();
    page.player.toggleAutoplay();
    page.play(PHOTO);

    page.player.pauseForTagEditor();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.requests("/api/random")).toHaveLength(0);
    page.player.resumeAfterTagEditor();
    expect(page.store.playAttemptId.value).toBe(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(page.requests("/api/random")).toHaveLength(1);

    page.player.toggleAutoplay();
    page.play(PHOTO);
    page.player.pauseForTagEditor();
    page.player.resumeAfterTagEditor();
    expect(page.store.playAttemptId.value).toBe(3);
  });

  it("Mute disables itself when pressed before anything plays, and mutes the first video", () => {
    const page = setup();
    expect(page.player.muteButton.value).toEqual({ disabled: false, active: false });
    page.player.toggleMute();
    expect(page.player.muteButton.value).toEqual({ disabled: true, active: false });
    page.player.toggleMute();

    page.play(VIDEO);
    expect(page.elements.video.muted).toBe(true);
    page.player.toggleMute();
    expect(page.elements.video.muted).toBe(false);
    expect(page.player.muteButton.value).toEqual({ disabled: false, active: false });
  });

  it("favorites and blacklists the playing item, each clearing the other, and remembers it for history", async () => {
    const page = setup();
    page.play(VIDEO);

    await page.player.toggleFavorite();
    expect(page.requests("/api/favorite")[0]!.body).toEqual({ path: "item-video", isFavorite: true });
    expect([page.player.favorite.value, page.store.status.value]).toEqual([true, "Added to favorites"]);

    await page.player.toggleBlacklist();
    expect(page.requests("/api/blacklist")[0]!.body).toEqual({ path: "item-video", isBlacklisted: true });
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
    expect([seekSlider.max, page.player.timeText.value]).toEqual(["125", "0:00 / 2:05"]);

    video.currentTime = 61.9;
    page.player.videoTimeUpdated();
    expect([seekSlider.value, page.player.timeText.value]).toEqual(["61", "1:01 / 2:05"]);
    page.player.seek("90");
    expect(video.currentTime).toBe(90);
  });
});
