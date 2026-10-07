import { signal, type ReadonlySignal } from "@preact/signals";
import { applyItemStateToCurrent } from "../library/currentItemState";
import { playbackTraceLine } from "../logging/relayLogLines";
import type { AppApi } from "../state/appApi";
import type { AppStore, PlayingItem } from "../state/appStore";
import type { ServerConnection } from "../state/serverConnection";
import { basenameFromPath, formatPlaybackTime } from "./nowPlaying";
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
  seekRow: ShownElement;
  /** Not rendered from state, so a re-render never moves it while it is dragged. */
  seekSlider: SeekSliderElement;
}

export interface MuteButtonView {
  disabled: boolean;
  /** Shown as lit with the muted icon. */
  active: boolean;
}

export interface PlayOptions {
  /** False when the server already recorded the play, as `POST /api/play/{itemId}` does. Defaults to true. */
  recordPlayback?: boolean;
}

/** Plays the current item and history, and runs the player's controls. */
export interface Player {
  /** The play button shows the pause icon. */
  readonly showsPause: ReadonlySignal<boolean>;
  readonly muteButton: ReadonlySignal<MuteButtonView>;
  readonly favorite: ReadonlySignal<boolean>;
  readonly blacklisted: ReadonlySignal<boolean>;
  /** The seek row's time, as `m:ss / m:ss`. */
  readonly timeText: ReadonlySignal<string>;

  attach(elements: PlayerElements): void;
  /** Stops the photo timer and lets go of the elements. */
  detach(): void;
  playCurrent(options?: PlayOptions): void;
  pickRandom(): Promise<void>;
  /** The play button: picks when nothing is playing, otherwise plays or pauses the video. */
  playOrPause(): void;
  /** Steps forward in history, or picks at its end. */
  next(): void;
  previous(): void;
  toggleMute(): void;
  toggleLoop(): void;
  toggleAutoplay(): void;
  toggleFavorite(): Promise<void>;
  toggleBlacklist(): Promise<void>;
  /** Takes the seek slider's value, in seconds. */
  seek(value: string): void;
  /** Pauses the video, or holds a photo's autoplay timer, while the tag editor is open. */
  pauseForTagEditor(): void;
  /** Resumes what `pauseForTagEditor` paused. A video the user had paused stays paused. */
  resumeAfterTagEditor(): void;

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
  /** Defaults to the global `fetch`, looked up on each request. */
  fetch?: typeof fetch;
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
  const { store, api, connection } = options;
  const apiBaseUrl = String(options.apiBaseUrl || "").replace(/\/+$/, "");
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const randomPicker = createRandomPicker((body, signal) =>
    send(api.url("/api/random"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      signal
    })
  );

  const showsPause = signal(false);
  // Mute starts enabled: it is only disabled once something without a video plays.
  const muteButton = signal<MuteButtonView>({ disabled: false, active: false });
  const favorite = signal(false);
  const blacklisted = signal(false);
  const timeText = signal("0:00 / 0:00");

  let elements: PlayerElements | null = null;
  let armed: ArmedAttempt | null = null;
  let photoTimerId: ReturnType<typeof setTimeout> | null = null;
  let videoMuted = false;
  let tagEditorPausedVideo = false;
  let tagEditorHeldPhotoTimer = false;

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

  function showToggles(): void {
    const current = store.current.peek();
    favorite.value = current?.isFavorite === true;
    blacklisted.value = current?.isBlacklisted === true;
    showPlayState();
  }

  function showPlayState(): void {
    showsPause.value = !!store.current.peek() && videoShown() && !elements!.video.paused;
  }

  function showMute(): void {
    if (elements && videoShown() && !!elements.video.src) {
      elements.video.muted = videoMuted;
      muteButton.value = { disabled: false, active: videoMuted };
    } else {
      muteButton.value = { disabled: true, active: false };
    }
  }

  function clearPhotoTimer(): void {
    if (photoTimerId) {
      clearTimeout(photoTimerId);
      photoTimerId = null;
    }
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
    timeText.value = `${formatPlaybackTime(video.currentTime)} / ${formatPlaybackTime(video.duration)}`;
    seekSlider.value = String(Math.floor(video.currentTime));
  }

  function playCurrent(playOptions: PlayOptions = {}): void {
    const item = store.current.peek();
    if (!item || !elements) return;
    const { video, photo, emptyState, seekRow } = elements;
    store.playAttemptId.value += 1;
    const attemptId = store.playAttemptId.peek();
    trace("info", "start", { mediaType: item.mediaType });
    if (playOptions.recordPlayback !== false) {
      notifyPlaybackStarted(item);
    }

    store.itemStates.applyTo(item);
    clearPhotoTimer();
    armed = null;
    video.pause();
    video.src = "";
    photo.src = "";
    video.style.display = "none";
    photo.style.display = "none";
    seekRow.style.display = "none";
    emptyState.style.display = "none";
    const mediaUrl = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);

    if (item.mediaType === "photo") {
      armed = { mediaType: "photo", id: item.id, attemptId };
      photo.src = mediaUrl;
      photo.style.display = "block";
      if (store.loop.peek() || store.autoplay.peek()) {
        const seconds = Math.max(MIN_PHOTO_SECONDS, Math.min(MAX_PHOTO_SECONDS, store.photoDurationSeconds.peek()));
        photoTimerId = setTimeout(() => {
          if (store.loop.peek()) {
            playCurrent();
            return;
          }
          next();
        }, seconds * 1000);
      }
    } else {
      video.src = mediaUrl;
      video.style.display = "block";
      seekRow.style.display = "flex";
      video.loop = store.loop.peek();
      armed = { mediaType: "video", id: item.id, attemptId };
      video.muted = videoMuted;
      void video.play().catch(() => {});
    }

    showToggles();
    showMute();
  }

  async function pickRandom(): Promise<void> {
    if (store.compatibilityBlocked.peek()) {
      store.setStatus("Cannot play: server compatibility check failed.");
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
      clearPhotoTimer();
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
    showsPause,
    muteButton,
    favorite,
    blacklisted,
    timeText,

    attach(attached) {
      elements = attached;
    },

    detach() {
      clearPhotoTimer();
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
      if (elements && videoShown()) {
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
      if (muteButton.peek().disabled) return;
      videoMuted = !videoMuted;
      showMute();
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
      if (!elements?.video.duration) return;
      elements.video.currentTime = Number(value);
    },

    pauseForTagEditor() {
      tagEditorPausedVideo = false;
      tagEditorHeldPhotoTimer = false;
      if (store.current.peek()?.mediaType === "photo") {
        tagEditorHeldPhotoTimer = !!photoTimerId;
        clearPhotoTimer();
        return;
      }

      if (elements && videoShown()) {
        tagEditorPausedVideo = !elements.video.paused;
        elements.video.pause();
      }
    },

    resumeAfterTagEditor() {
      const current = store.current.peek();
      if (!current) return;
      if (current.mediaType === "photo") {
        if (tagEditorHeldPhotoTimer && (store.autoplay.peek() || store.loop.peek())) {
          playCurrent();
        }
        return;
      }

      if (tagEditorPausedVideo && elements && videoShown()) {
        void elements.video.play().catch(() => {});
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
      store.setStatus("Video file not found.");
    },

    videoMetadataLoaded() {
      if (!armedFor("video") || !elements) return;
      elements.seekSlider.max = String(Math.floor(elements.video.duration) || 100);
      showTime();
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
