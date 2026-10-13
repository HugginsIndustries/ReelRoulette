import { signal, type ReadonlySignal } from "@preact/signals";
import type { Dialogs } from "../dialogs/dialogs";
import { applyItemStateToCurrent } from "../library/currentItemState";
import { playbackTraceLine } from "../logging/relayLogLines";
import type { AppApi } from "../state/appApi";
import type { AppStore, PlayingItem } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import { basenameFromPath, formatPlaybackPosition } from "./nowPlaying";
import { createPhotoTimer } from "./photoTimer";
import { createRandomPicker, randomPickRequest } from "./randomPick";

/** An element the player shows and hides by setting its `display`. */
export interface ShownElement {
  readonly style: { display: string };
}

/** The parts of the `<video>` element the player drives. */
export interface VideoElement extends ShownElement {
  src: string;
  muted: boolean;
  loop: boolean;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

export interface PhotoElement extends ShownElement {
  src: string;
}

export interface SeekSliderElement {
  value: string;
  max: string;
}

/**
 * The player's elements. The player sets their sources, playback, and `display` itself: it sets the source and
 * shows the element, then a video's loop and mute, then calls `play()`.
 */
export interface PlayerElements {
  video: VideoElement;
  photo: PhotoElement;
  emptyState: ShownElement;
  /** Not rendered from state, so a re-render never moves it while it is dragged. */
  seekSlider: SeekSliderElement;
}

export interface PlayButtonView {
  /** On a photo whose timer the scrub bar doesn't show, or once its timer has ended. */
  disabled: boolean;
  /** Shows the pause icon. */
  showsPause: boolean;
}

export interface SeekBarView {
  disabled: boolean;
  /** Its accessible name: "Photo timer" on a photo, otherwise "Seek". */
  label: string;
}

/** Runs a callback before the browser's next repaint, as `requestAnimationFrame` does. */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(id: number): void;
}

export interface PlayOptions {
  /** False when the server already recorded the play, as `POST /api/play/{itemId}` does. Defaults to true. */
  recordPlayback?: boolean;
}

/**
 * Plays the current item and history, and runs the player's controls. On a photo with Autoplay on and Loop off, the
 * scrub bar shows the photo's timer, which Play/Pause holds and resumes and the bar moves, until it ends.
 */
export interface Player {
  readonly playButton: ReadonlySignal<PlayButtonView>;
  readonly seekBar: ReadonlySignal<SeekBarView>;
  /**
   * Sound is muted, which the mute button shows lit with the muted icon. Mute works before anything plays and on a
   * photo too, applying to the next video.
   */
  readonly muted: ReadonlySignal<boolean>;
  readonly favorite: ReadonlySignal<boolean>;
  readonly blacklisted: ReadonlySignal<boolean>;
  /**
   * The seek row's time, as elapsed and total, the elapsed time in the total's shape (`formatPlaybackPosition`): a
   * video's, or a photo's timer while the bar shows it, and otherwise 0:00 / 0:00.
   */
  readonly timeText: ReadonlySignal<string>;

  attach(elements: PlayerElements): void;
  /** Stops the photo timer and lets go of the elements. */
  detach(): void;
  playCurrent(options?: PlayOptions): void;
  pickRandom(): Promise<void>;
  /**
   * The play button: picks when nothing is playing, otherwise plays or pauses the video, or holds and resumes a
   * photo's timer while the bar shows it.
   */
  playOrPause(): void;
  /** Steps forward in history, or picks at its end. */
  next(): void;
  previous(): void;
  toggleMute(): void;
  toggleLoop(): void;
  toggleAutoplay(): void;
  toggleFavorite(): Promise<void>;
  toggleBlacklist(): Promise<void>;
  /** Takes the seek slider's value, in seconds: a video's position, or a photo's timer's while the bar shows it. */
  seek(value: string): void;
  /** Auto-Pause: pauses the video, or holds a photo's timer, keeping the time it has left. */
  autoPause(): void;
  /**
   * Resumes what `autoPause` paused: plays the video, or runs the photo's timer on with the time it had left, without
   * loading the photo again or recording its play again. Playback the user had paused, or played or paused since,
   * stays as it is, and nothing resumes once another item, or the same one again, has started.
   */
  autoResume(): void;

  // The video and photo elements' events.
  videoPlayStateChanged(): void;
  videoPlaying(): void;
  videoFailed(): void;
  videoMetadataLoaded(): void;
  videoTimeUpdated(): void;
  videoEnded(): void;
  photoLoaded(): void;
  photoFailed(): void;
}

export interface PlayerOptions {
  apiBaseUrl: string;
  store: AppStore;
  api: AppApi;
  connection: ServerConnection;
  /** The in-app dialogs, for a play the server's compatibility check stops. */
  dialogs: Pick<Dialogs, "notice">;
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
  /** Defaults to the browser's animation frames, looked up on each request. */
  frames?: FrameScheduler;
}

/** The attempt whose media events the player handles. Events from the element not in use are ignored. */
interface ArmedAttempt {
  mediaType: "video" | "photo";
  /** The item's `id`, its file path. */
  id: string;
  attemptId: number;
}

const MIN_PHOTO_SECONDS = 1;
const MAX_PHOTO_SECONDS = 300;
/** The time shown while no video's or photo timer's time is known, so the controls keep their look. */
const NO_TIME = "0:00 / 0:00";

function absolutizeMediaUrl(apiBaseUrl: string, mediaUrl: string): string {
  if (!mediaUrl) {
    return "";
  }

  try {
    return new URL(mediaUrl, `${apiBaseUrl}/`).toString();
  } catch {
    return mediaUrl;
  }
}

export function createPlayer(options: PlayerOptions): Player {
  const { store, api, connection, dialogs } = options;
  const apiBaseUrl = String(options.apiBaseUrl || "").replace(/\/+$/, "");
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const frames: FrameScheduler = options.frames ?? {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id)
  };
  const randomPicker = createRandomPicker((body, signal) =>
    send(api.url("/api/random"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      signal
    })
  );

  const playButton = signal<PlayButtonView>({ disabled: false, showsPause: false });
  const seekBar = signal<SeekBarView>({ disabled: true, label: "Seek" });
  const muted = signal(false);
  const favorite = signal(false);
  const blacklisted = signal(false);
  const timeText = signal(NO_TIME);
  const photoTimer = createPhotoTimer({ onEnd: photoTimerEnded });

  let elements: PlayerElements | null = null;
  /** The animation frame that moves the bar next, while something plays. */
  let frameId: number | null = null;
  let armed: ArmedAttempt | null = null;
  let autoPausedVideo = false;
  let autoHeldPhoto = false;
  /** The play attempt Auto-Pause paused; once another has started, there is nothing to resume. */
  let autoPausedAttempt = 0;

  function trace(level: string, message: string, context: Record<string, unknown> = {}): void {
    void api.relayLog(level, playbackTraceLine(message, store.current.peek(), store.playAttemptId.peek(), context));
  }

  /** Records the play on start, as the desktop does, so random picks and filters use fresh play counts. */
  function notifyPlaybackStarted(item: PlayingItem): void {
    if (!item?.itemId || store.compatibilityBlocked.peek()) return;
    void api
      .post("/api/record-playback", {
        path: item.itemId,
        clientId: store.identity.clientId,
        sessionId: store.identity.sessionId
      })
      .catch(() => {});
  }

  function videoShown(): boolean {
    return elements !== null && elements.video.style.display !== "none";
  }

  /**
   * The browser reports a video's length as `Infinity` when it can't know it, as for a WebM without one in its header.
   * The bar is then disabled and empty, as on a photo without a timer.
   */
  function videoLengthUnknown(): boolean {
    return videoShown() && elements!.video.duration === Number.POSITIVE_INFINITY;
  }

  function photoShown(): boolean {
    return elements !== null && elements.photo.style.display !== "none";
  }

  /**
   * On a photo with Autoplay on and Loop off, the scrub bar shows its timer, and Play and the bar move it, until the
   * timer ends.
   */
  function photoBarShown(): boolean {
    return photoShown() && store.autoplay.peek() && !store.loop.peek() && photoTimer.active;
  }

  /** The user played or paused, which Auto-Pause then leaves as it is. */
  function handBackToUser(): void {
    autoPausedVideo = false;
    autoHeldPhoto = false;
  }

  function showToggles(): void {
    const current = store.current.peek();
    favorite.value = current?.isFavorite === true;
    blacklisted.value = current?.isBlacklisted === true;
    showPlayState();
  }

  /** Shows Play/Pause and the scrub bar for what plays: a video, a photo, or nothing yet. */
  function showPlayState(): void {
    if (photoShown()) {
      const barShown = photoBarShown();
      playButton.value = { disabled: !barShown, showsPause: barShown && photoTimer.running };
      seekBar.value = { disabled: !barShown, label: "Photo timer" };
      showPhotoTime();
    } else {
      playButton.value = { disabled: false, showsPause: !!store.current.peek() && videoShown() && !elements!.video.paused };
      seekBar.value = { disabled: !videoShown() || videoLengthUnknown(), label: "Seek" };
    }
    moveBarWhilePlaying();
  }

  /**
   * Moves the bar every animation frame while a video plays, or a photo's timer runs while the bar shows it, so it
   * moves smoothly, and stops once it pauses. The time it shows still changes once a second.
   */
  function moveBarWhilePlaying(): void {
    const moves = photoShown() ? photoBarShown() && photoTimer.running : videoShown() && !elements!.video.paused;
    if (moves && frameId === null) {
      frameId = frames.request(moveBar);
    } else if (!moves) {
      stopMovingBar();
    }
  }

  function moveBar(): void {
    frameId = null;
    if (photoShown()) {
      showPhotoTime();
    } else {
      showTime();
    }
    moveBarWhilePlaying();
  }

  function stopMovingBar(): void {
    if (frameId !== null) {
      frames.cancel(frameId);
      frameId = null;
    }
  }

  /** While the bar shows a photo's timer, it fills as the timer runs; otherwise it is empty and the time 0:00 / 0:00. */
  function showPhotoTime(): void {
    if (!elements || !photoShown()) return;
    const { seekSlider } = elements;
    if (!photoBarShown()) {
      seekSlider.value = "0";
      timeText.value = NO_TIME;
      return;
    }
    const seconds = photoTimer.length / 1000;
    const elapsed = photoTimer.elapsed() / 1000;
    seekSlider.max = String(seconds);
    seekSlider.value = String(elapsed);
    timeText.value = formatPlaybackPosition(elapsed, seconds);
  }

  /** Loop shows the photo again; otherwise the next item plays. */
  function photoTimerEnded(): void {
    showPlayState();
    if (store.loop.peek()) {
      playCurrent();
      return;
    }
    next();
  }

  /** An attempt is stale once another item or attempt has started; its events are only traced. */
  function isStale(attempt: ArmedAttempt): boolean {
    const current = store.current.peek();
    return !current || current.id !== attempt.id || store.playAttemptId.peek() !== attempt.attemptId;
  }

  function armedFor(mediaType: ArmedAttempt["mediaType"]): ArmedAttempt | null {
    return armed?.mediaType === mediaType ? armed : null;
  }

  function showTime(): void {
    if (!elements || !elements.video.duration) return;
    const { video, seekSlider } = elements;
    timeText.value = formatPlaybackPosition(video.currentTime, video.duration);
    seekSlider.value = videoLengthUnknown() ? "0" : String(video.currentTime);
  }

  function playCurrent(playOptions: PlayOptions = {}): void {
    const item = store.current.peek();
    if (!item || !elements) return;
    const { video, photo, emptyState, seekSlider } = elements;
    store.playAttemptId.value += 1;
    const attemptId = store.playAttemptId.peek();
    trace("info", "start", { mediaType: item.mediaType });
    if (playOptions.recordPlayback !== false) {
      notifyPlaybackStarted(item);
    }

    store.itemStates.applyTo(item);
    photoTimer.clear();
    armed = null;
    video.pause();
    video.src = "";
    photo.src = "";
    video.style.display = "none";
    photo.style.display = "none";
    emptyState.style.display = "none";
    // The bar starts empty, so it never shows the last item's time.
    seekSlider.value = "0";
    const mediaUrl = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);

    if (item.mediaType === "photo") {
      armed = { mediaType: "photo", id: item.id, attemptId };
      photo.src = mediaUrl;
      photo.style.display = "block";
      if (store.loop.peek() || store.autoplay.peek()) {
        const seconds = Math.max(MIN_PHOTO_SECONDS, Math.min(MAX_PHOTO_SECONDS, store.photoDurationSeconds.peek()));
        photoTimer.start(seconds * 1000);
      }
    } else {
      // Until its metadata gives its length.
      timeText.value = NO_TIME;
      video.src = mediaUrl;
      video.style.display = "block";
      video.loop = store.loop.peek();
      armed = { mediaType: "video", id: item.id, attemptId };
      video.muted = muted.peek();
      void video.play().catch(() => {});
    }

    showToggles();
  }

  async function pickRandom(): Promise<void> {
    if (store.compatibilityBlocked.peek()) {
      void dialogs.notice("Cannot play: server compatibility check failed.");
      return;
    }

    const body = randomPickRequest({
      clientId: store.identity.clientId,
      sessionId: store.identity.sessionId,
      randomizationMode: store.randomizationMode.peek(),
      appliedFilter: store.appliedFilter.peek(),
      presets: store.presets.peek(),
      selectedPresetValue: store.selectedPresetValue()
    });

    store.setStatus("Loading...");
    // A press while a pick is waiting sends nothing; the status above shows it is still loading.
    const outcome = await randomPicker.pick(body);
    switch (outcome.kind) {
      case "busy":
        return;
      case "timedOut":
        trace("warn", "random-pick-timeout", { timeoutMs: outcome.timeoutMs });
        store.setStatus("No response from the server. Try again.");
        return;
      case "unauthorized":
        store.pairingRequired.value = true;
        store.setStatus("Unauthorized. Pair first.");
        return;
      case "failed":
        store.setStatus(`Random selection failed (${outcome.statusCode}).`);
        return;
      case "error":
        store.setStatus(`Random selection failed: ${outcome.message}`);
        return;
      case "none":
        store.setStatus("No eligible media for current filters.");
        return;
    }

    store.pushHistory(outcome.item);
    playCurrent();
  }

  function next(): void {
    if (store.stepHistory(1)) {
      playCurrent();
      return;
    }

    void pickRandom();
  }

  function previous(): void {
    if (store.stepHistory(-1)) {
      playCurrent();
    }
  }

  function restartPhotoForLoopOrAutoplay(): void {
    if (store.current.peek()?.mediaType !== "photo") return;
    if (store.loop.peek() || store.autoplay.peek()) {
      playCurrent();
    } else {
      photoTimer.clear();
    }
  }

  /** Favoriting clears the blacklist, and blacklisting clears the favorite. */
  async function toggleFlag(flag: "isFavorite" | "isBlacklisted"): Promise<void> {
    const isFavorite = flag === "isFavorite";
    const item = store.current.peek();
    if (!item?.itemId) return;
    const nextValue = !item[flag];
    const response = await api.post(isFavorite ? "/api/favorite" : "/api/blacklist", { path: item.itemId, [flag]: nextValue });
    if (!response.ok) {
      store.setStatus(`${isFavorite ? "Favorite" : "Blacklist"} update failed (${response.status}).`);
      return;
    }
    // Applied to the item playing when the server answers.
    const current = store.current.peek()!;
    current[flag] = nextValue;
    if (nextValue) {
      current[isFavorite ? "isBlacklisted" : "isFavorite"] = false;
    }
    store.itemStates.remember(current.itemId, { isFavorite: current.isFavorite, isBlacklisted: current.isBlacklisted });
    showToggles();
    if (isFavorite) {
      store.setStatus(nextValue ? "Added to favorites" : "Removed from favorites");
    } else {
      store.setStatus(nextValue ? "Blacklisted" : "Removed from blacklist");
    }
  }

  connection.on("itemStateChanged", (payload) => {
    const itemId = payload?.itemId;
    if (!itemId) return;
    store.itemStates.remember(itemId, { isFavorite: !!payload.isFavorite, isBlacklisted: !!payload.isBlacklisted });
    if (applyItemStateToCurrent(store.current.peek(), payload)) {
      showToggles();
    }
    const fileName = basenameFromPath(payload.path || "");
    if (payload.isBlacklisted) {
      store.setStatus(`Synced: Blacklisted: ${fileName}`, "Synced: Blacklisted");
    } else if (payload.isFavorite) {
      store.setStatus(`Synced: Added to favorites: ${fileName}`, "Synced: Added to favorites");
    } else {
      store.setStatus(`Synced: Removed from favorites: ${fileName}`, "Synced: Removed from favorites");
    }
  });

  store.on("photoDurationChanged", () => {
    const current = store.current.peek();
    if (current && current.mediaType === "photo" && (store.autoplay.peek() || store.loop.peek())) {
      playCurrent();
    }
  });

  return {
    playButton,
    seekBar,
    muted,
    favorite,
    blacklisted,
    timeText,

    attach(attached) {
      elements = attached;
    },

    detach() {
      photoTimer.clear();
      stopMovingBar();
      armed = null;
      elements = null;
    },

    playCurrent,
    pickRandom,

    playOrPause() {
      if (!store.current.peek()) {
        void pickRandom();
        return;
      }
      if (photoShown()) {
        if (!photoBarShown()) return;
        // The user's own play or pause stands once Auto-Pause stops wanting playback paused.
        handBackToUser();
        if (photoTimer.running) {
          photoTimer.hold();
        } else {
          photoTimer.resume();
        }
        showPlayState();
        return;
      }
      if (elements && videoShown()) {
        handBackToUser();
        if (elements.video.paused) {
          void elements.video.play().catch(() => {});
        } else {
          elements.video.pause();
        }
        showPlayState();
      }
    },

    next,
    previous,

    toggleMute() {
      muted.value = !muted.peek();
      if (elements) {
        elements.video.muted = muted.peek();
      }
    },

    toggleLoop() {
      store.loop.value = !store.loop.peek();
      if (elements?.video.src) {
        elements.video.loop = store.loop.peek();
      }
      restartPhotoForLoopOrAutoplay();
      showToggles();
    },

    toggleAutoplay() {
      store.autoplay.value = !store.autoplay.peek();
      restartPhotoForLoopOrAutoplay();
      showToggles();
    },

    toggleFavorite: () => toggleFlag("isFavorite"),
    toggleBlacklist: () => toggleFlag("isBlacklisted"),

    seek(value) {
      if (photoShown()) {
        if (photoBarShown()) {
          photoTimer.seek(Number(value) * 1000);
          showPhotoTime();
        }
        return;
      }
      if (!elements?.video.duration) return;
      elements.video.currentTime = Number(value);
    },

    autoPause() {
      handBackToUser();
      autoPausedAttempt = store.playAttemptId.peek();
      if (photoShown()) {
        autoHeldPhoto = photoTimer.running;
        photoTimer.hold();
      } else if (elements && videoShown()) {
        autoPausedVideo = !elements.video.paused;
        elements.video.pause();
      }
      showPlayState();
      if (autoPausedVideo || autoHeldPhoto) {
        trace("info", "auto-pause", { mediaType: autoHeldPhoto ? "photo" : "video" });
      }
    },

    autoResume() {
      const resumeVideo = autoPausedVideo;
      const resumePhoto = autoHeldPhoto;
      handBackToUser();
      // An item played since, or the same one played again, already plays as it should.
      if (!store.current.peek() || store.playAttemptId.peek() !== autoPausedAttempt) return;
      if (resumePhoto && photoShown() && photoTimer.active) {
        trace("info", "auto-resume", { mediaType: "photo" });
        photoTimer.resume();
        showPlayState();
      } else if (resumeVideo && elements && videoShown()) {
        trace("info", "auto-resume", { mediaType: "video" });
        void elements.video.play().catch(() => {});
        showPlayState();
      }
    },

    videoPlayStateChanged: showPlayState,

    videoPlaying() {
      const attempt = armedFor("video");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "video-onplaying-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      trace("info", "video-onplaying");
      store.setStatus("Playing");
    },

    videoFailed() {
      const attempt = armedFor("video");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "video-onerror-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      trace("warn", "video-onerror");
      // A source that fails fires no pause, so the video still reads as playing; its bar has nothing more to show.
      stopMovingBar();
      store.setStatus("Video file not found.");
    },

    videoMetadataLoaded() {
      if (!armedFor("video") || !elements) return;
      if (!videoLengthUnknown()) {
        elements.seekSlider.max = String(elements.video.duration || 100);
      }
      showTime();
      // Its length decides whether the bar is enabled.
      showPlayState();
    },

    videoTimeUpdated() {
      if (!armedFor("video")) return;
      showTime();
    },

    videoEnded() {
      if (!armedFor("video")) return;
      if (!store.autoplay.peek() || store.loop.peek()) return;
      next();
    },

    photoLoaded() {
      const attempt = armedFor("photo");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "photo-onload-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      trace("info", "photo-onload");
      store.setStatus("Playing");
    },

    photoFailed() {
      const attempt = armedFor("photo");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "photo-onerror-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      trace("warn", "photo-onerror");
      store.setStatus("Photo file not found.");
    }
  };
}
