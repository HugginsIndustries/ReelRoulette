import { signal, type ReadonlySignal } from "@preact/signals";
import { requestPlayItem, type PlayItemFailure } from "../api/coreApi";
import {
  noticeRequestFailure,
  PLAYBACK_REQUEST_TIMEOUT_MS,
  requestWithNotice,
  ServerUnreachableError,
  UnauthorizedError,
  withTimeout
} from "../api/serverRequest";
import type { Dialogs } from "../dialogs/dialogs";
import { applyItemStateToCurrent } from "../library/currentItemState";
import { playRefusalFailure } from "../library/libraryPlayModel";
import type { ItemStateChangedPayload } from "../library/libraryProjectionSync";
import { errorType, playbackTraceLine } from "../logging/relayLogLines";
import type { Notifications } from "../notifications/notifications";
import type { ItemRatings } from "../rating/itemRatings";
import type { AppApi } from "../state/appApi";
import type { AppStore, PlayingItem } from "../state/appStore";
import { playRefusalNotice } from "../state/lastingStates";
import type { ServerConnection } from "../state/serverConnection";
import type { AudioStage } from "./audioStage";
import { createFrameClock, type FramedVideo } from "./frameStep";
import { mediaFailureMessage, probeMedia, SKIP_LIMIT, skipText, type MediaFailure } from "./mediaFailure";
import { basenameFromPath, formatPlaybackPosition, playingFileName } from "./nowPlaying";
import { createPhotoTimer } from "./photoTimer";
import { createRandomPicker, currentRandomPickRequest } from "./randomPick";
import { createSeekIndicator, type SeekIndicator } from "./seekIndicator";

/** An element the player shows and hides by setting its `display`. */
export interface ShownElement {
  readonly style: { display: string };
}

/** The parts of the `<video>` element the player drives, and whose frames it follows for a frame step. */
export interface VideoElement extends ShownElement, FramedVideo {
  src: string;
  loop: boolean;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  /** It played to its end, which the browser pauses it at just before its `ended` event. */
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
  /** With `load()`, empties an element a new one has taken over from, without the error an empty `src` gives. */
  removeAttribute(name: "src"): void;
  load(): void;
}

export interface PhotoElement extends ShownElement {
  src: string;
}

export interface SeekSliderElement {
  value: string;
  max: string;
}

/** The stretch behind the scrub bar's track, which the player shows and places through its CSS variables. */
export interface SeekStretchElement {
  hidden: boolean;
  readonly style: { setProperty(name: string, value: string): void };
}

/**
 * The player's elements. The player sets their sources, playback, and `display` itself: it sets the source and
 * shows the element, then a video's loop, then calls `play()`. The audio stage sets the video's volume and mute.
 */
export interface PlayerElements {
  video: VideoElement;
  photo: PhotoElement;
  emptyState: ShownElement;
  /** Not rendered from state, so a re-render never moves it while it is dragged. */
  seekSlider: SeekSliderElement;
  /** Timer mode's repeating stretch, shown faintly behind the scrub bar while Loop holds autoplay. */
  seekStretch: SeekStretchElement;
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

/**
 * Where a play came from: a library choice, forward (autoplay, Next, a random pick, Random, or the first Play), or back
 * (Previous). Forward and back skip a file that can't play, and a library choice shows its message.
 */
export type PlayOrigin = "library" | "forward" | "back";

/**
 * Where a play attempt came from: a play's origin, or inserted, a Random pick that Insert put right after the playing
 * item, which skips a file that can't play by picking again with Insert.
 */
type AttemptOrigin = PlayOrigin | "inserted";

export interface PlayOptions {
  /**
   * Where the play came from. A library play's server has already recorded it, as `POST /api/play/{itemId}` does; any
   * other is recorded here. Defaults to forward.
   */
  origin?: PlayOrigin;
}

/** How long the player waits before trying again to recover a video while the connection doesn't know the server is down. */
export const RECOVERY_RETRY_MS = 5_000;

/**
 * Plays the current item and history, and runs the player's controls and autoplay. On a photo autoplay will advance,
 * the scrub bar shows the photo's timer, which Play/Pause holds and resumes and the bar moves, until it ends.
 *
 * Autoplay advances a photo after Advance after, and a video at its end in Normal mode or after Advance after in Timer
 * mode. With Loop on, Loop stops autoplay decides: on, the item repeats and nothing advances, and in Timer mode a video
 * repeats a stretch of Advance after seconds; off, autoplay goes on, and a video shorter than Advance after repeats
 * until it has run. A repeat only restarts the photo's timer or the video's position.
 *
 * A history step gets a fresh media URL from the server before it plays, so a token a server restart dropped never
 * plays. When a video that had played fails, the player first gets it a fresh URL and plays it on from where it was,
 * waiting for the connection when the server can't be reached. Otherwise, or when that fails too, it asks the server
 * about the file, and a 404 for a URL not renewed since the media last played gets a fresh URL first, since the server
 * no longer knowing the token answers the same. A file this browser can't play, or a missing one, reached by autoplay,
 * Next, Previous, or a random pick is skipped with a Skipped files popup, up to ten in a row, and any other failure
 * stops on its message.
 */
export interface Player {
  readonly playButton: ReadonlySignal<PlayButtonView>;
  /**
   * Playback waits for the user, as Play shows: before anything plays, once the user or Auto-Pause pauses, at the end
   * of a video nothing plays on from, or when the browser won't play it. Not on a photo whose timer the bar doesn't
   * show, nor while a video moves on from its end, as it repeats or autoplay goes on.
   */
  readonly paused: ReadonlySignal<boolean>;
  readonly seekBar: ReadonlySignal<SeekBarView>;
  /**
   * Counts the times a new `<video>` element has taken over the video, which the page renders it by, so each count
   * renders a new one.
   */
  readonly videoKey: ReadonlySignal<number>;
  readonly favorite: ReadonlySignal<boolean>;
  readonly blacklisted: ReadonlySignal<boolean>;
  /**
   * The seek row's time, as elapsed and total, the elapsed time in the total's shape (`formatPlaybackPosition`): a
   * video's, or a photo's timer while the bar shows it, and otherwise 0:00 / 0:00.
   */
  readonly timeText: ReadonlySignal<string>;
  /** The video or photo of the attempt playing now failed to load, which hides ambient mode's glow until the next. */
  readonly mediaFailed: ReadonlySignal<boolean>;
  /** The seek indicator, which J, L, and a double-tap show through `seekBy`. */
  readonly seekIndicator: Pick<SeekIndicator, "back" | "forward">;

  attach(elements: PlayerElements): void;
  /** Stops the photo timer and lets go of the elements. */
  detach(): void;
  /**
   * A new `<video>` element takes over the video, as one must once Enhanced audio is off, since an element that has
   * played through the gain stage never leaves it. Notes where the video is and whether it plays, and renders a new
   * element.
   */
  renewVideo(): void;
  /**
   * The new element rendered: it plays the video on from where it was, playing or paused as it was, and the element
   * before it is emptied.
   */
  takeOverVideo(video: VideoElement): void;
  /** Plays the current item, a play the user started, so the count of files skipped in a row starts over. */
  playCurrent(options?: PlayOptions): void;
  /**
   * Picks a new item, as Next does at the end of history and Random from anywhere in it, and puts it where Random
   * behavior says: at the end with Jump, or right after the playing item with Insert. A press starts the count of files
   * skipped in a row over, as Next, Previous, and the first Play do.
   */
  pickRandom(): Promise<void>;
  /**
   * The play button: picks when nothing is playing, otherwise plays or pauses the video, or holds and resumes a
   * photo's timer while the bar shows it.
   */
  playOrPause(): void;
  /** Steps forward in history, or picks at its end. */
  next(): void;
  previous(): void;
  toggleLoop(): void;
  toggleAutoplay(): void;
  toggleFavorite(): Promise<void>;
  toggleBlacklist(): Promise<void>;
  /**
   * Takes the seek slider's value, in seconds: a video's position, or a photo's timer's while the bar shows it. While
   * Timer mode repeats a stretch, the stretch starts where a seek lands, or, for a seek to the video's end, Advance
   * after seconds before it.
   */
  seek(value: string): void;
  /**
   * J, L, and a double-tap: seeks a video by `seconds`, back for a negative number, within its length, as a seek by the
   * scrub bar does, and shows the seek indicator with the full step. Nothing happens unless the video is `seekable`.
   */
  seekBy(seconds: number): void;
  /**
   * A video shows and its length is known, so J, L, and a double-tap can seek it, and a tap on it waits to rule out a
   * double-tap. Not on a photo, before anything plays, or on a video that can't play.
   */
  seekable(): boolean;
  /**
   * Comma and period: steps a paused video one frame back (-1) or forward (1), as a seek by the scrub bar does. Nothing
   * happens while it plays, on a photo, before its length is known, or forward from its last frame.
   */
  stepFrame(direction: -1 | 1): void;
  /**
   * Auto-Pause: pauses the video, or holds a photo's timer, keeping the time it has left, and holds playback until
   * `autoResume`, so an item that starts meanwhile, as a random pick or a history step answers or a file is skipped,
   * starts paused. The user's own play or pause, or an item they start, hands playback back to them.
   */
  autoPause(): void;
  /**
   * Resumes what Auto-Pause holds: plays the video, or runs the photo's timer on with the time it had left, without
   * loading the photo again or recording its play again. Playback the user had paused, or played, paused, or started
   * since, stays as it is.
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
  /** Plays and pauses the video, so its sound fades in and out, and sets its volume and mute. */
  audio: Pick<AudioStage, "play" | "pause" | "pausing" | "cancelPause">;
  api: AppApi;
  connection: ServerConnection;
  /**
   * The in-app dialogs, for a pick or play that fails, a favorite or blacklist the server doesn't take, and media that
   * can't play and isn't skipped.
   */
  dialogs: Pick<Dialogs, "notice">;
  /** The one-off messages: a favorite or blacklist change made here, or on another device, and a skipped file. */
  notifications: Pick<Notifications, "notify">;
  /** The ratings this device shows, which take the rating a history step's play answer gives the item. */
  ratings: Pick<ItemRatings, "takeRead">;
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
  const { store, audio, api, connection, dialogs, notifications, ratings } = options;
  const apiBaseUrl = String(options.apiBaseUrl || "").replace(/\/+$/, "");
  const frames: FrameScheduler = options.frames ?? {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id)
  };
  const randomPicker = createRandomPicker((body, signal) =>
    api.request(api.url("/api/random"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal
    })
  );

  const playButton = signal<PlayButtonView>({ disabled: false, showsPause: false });
  const paused = signal(true);
  const seekBar = signal<SeekBarView>({ disabled: true, label: "Seek" });
  const videoKey = signal(0);
  const favorite = signal(false);
  const blacklisted = signal(false);
  const timeText = signal(NO_TIME);
  const mediaFailed = signal(false);
  const seekIndicator = createSeekIndicator();
  const photoTimer = createPhotoTimer({ onEnd: photoTimerEnded });
  const frameClock = createFrameClock();
  /**
   * A video's timer: set as each video starts, it runs while it advances the video and the video plays, from its first
   * `playing`, so loading doesn't count. Anything else holds it with its time.
   */
  const videoTimer = createPhotoTimer({ onEnd: videoTimerEnded });

  let elements: PlayerElements | null = null;
  /** The animation frame that moves the bar next, while something plays. */
  let frameId: number | null = null;
  let armed: ArmedAttempt | null = null;
  /**
   * Auto-Pause holds playback, from its pause until its resume or the user's own play, pause, or start, so an item that
   * starts meanwhile starts paused: its video loads without playing, or its photo's timer holds, for Auto-Resume to play.
   */
  let autoPauseHolds = false;
  /** What Auto-Pause holds of what shows now, for Auto-Resume to play: the video it paused, or the photo's timer. */
  let autoPausedVideo = false;
  let autoHeldPhoto = false;
  /** Where the attempt playing now came from. */
  let attemptOrigin: AttemptOrigin = "forward";
  /** Files skipped in a row, which starts over when a file loads and when the user starts a play. */
  let skips = 0;
  /**
   * How the attempt playing now handles its media's failure: it hasn't failed, it gets a fresh media URL, it finds out
   * why and goes on from there, or it stopped. Its timers hold until its video plays again.
   */
  let failurePhase: "none" | "recovering" | "failing" | "stopped" = "none";
  /**
   * The attempt playing now got its media a fresh media URL, and it hasn't played since, so a failure asks about the file
   * without getting another, which can't loop on a fresh URL that fails too.
   */
  let recovered = false;
  /** A history step waits for its fresh media URL, with nothing shown yet. */
  let stepWaiting = false;
  /** A random pick waits for the server, holding Loading…. */
  let pickWaiting = false;
  /** The video of the attempt playing now has played, so its timer can run. */
  let videoStarted = false;
  /** In Normal mode, a short video's timer has run, so the repeat in progress is its last. */
  let videoTimerDone = false;
  /** Where Timer mode's repeating stretch starts, in seconds, and whether it applies now. */
  let stretchStart = 0;
  let stretching = false;
  /** Timer mode's stretch went back to its start from the video's end, so the `playing` that follows is a repeat's. */
  let stretchRestarting = false;
  /** The video's source, which a new element takes over. */
  let videoSource = "";
  /** Where the video was when a new element took over, which it seeks to once its metadata has loaded. */
  let resumeAt: number | null = null;
  /** Where the video was, and whether it played, when a new element was asked for. */
  let renewal: { position: number; playing: boolean } | null = null;

  function trace(level: string, message: string, context: Record<string, unknown> = {}): void {
    void api.relayLog(level, playbackTraceLine(message, store.current.peek(), store.playAttemptId.peek(), context));
  }

  /**
   * Records the play on start, so random picks and filters use fresh play counts. Nothing is
   * recorded while the server fails the compatibility check or runs without a library.
   */
  function notifyPlaybackStarted(item: PlayingItem): void {
    if (!item?.itemId || store.heldBack.peek()) return;
    void api
      .post("/api/record-playback", {
        itemId: item.itemId,
        clientId: store.identity.clientId,
        sessionId: store.identity.sessionId
      })
      .catch(() => {});
  }

  function videoShown(): boolean {
    return elements !== null && elements.video.style.display !== "none";
  }

  /** The video is paused, or its pause is fading out, which already counts. */
  function videoPaused(): boolean {
    return !elements || elements.video.paused || audio.pausing();
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

  /** The video shows and its length is known, so a key can move its position. */
  function seekableVideo(): VideoElement | null {
    if (!elements || !videoShown()) return null;
    const { duration } = elements.video;
    return Number.isFinite(duration) && duration > 0 ? elements.video : null;
  }

  /**
   * Moves the video to `position`. While Timer mode repeats a stretch, the stretch, and its timer, start over where the
   * seek lands, or, for a seek that lands at the video's end, Advance after seconds before it, or at 0 for a shorter
   * video, and the video plays from there. Whether the browser repeats the video itself follows.
   */
  function seekVideoTo(position: number): void {
    const { video } = elements!;
    if (!stretching) {
      video.currentTime = position;
      return;
    }
    stretchStart = stretchStartAt(position);
    video.currentTime = stretchStart;
    syncVideo();
  }

  /** Autoplay goes on to the next item unless Loop holds it there, which it does while Loop stops autoplay is on. */
  function autoplayGoesOn(): boolean {
    return store.autoplay.peek() && !(store.loop.peek() && store.loopStopsAutoplay.peek());
  }

  function advanceAfterMs(): number {
    return store.advanceAfterSeconds.peek() * 1000;
  }

  /** A photo's timer runs with Autoplay or Loop on: it advances the photo, or starts over while the photo repeats. */
  function photoTimerRuns(): boolean {
    return store.autoplay.peek() || store.loop.peek();
  }

  /** On a photo autoplay will advance, the scrub bar shows its timer, and Play and the bar move it, until it ends. */
  function photoBarShown(): boolean {
    return photoShown() && autoplayGoesOn() && photoTimer.active;
  }

  /** The video's length is known and shorter than Advance after. */
  function videoShorterThanTimer(): boolean {
    const duration = elements!.video.duration;
    return Number.isFinite(duration) && duration > 0 && duration < store.advanceAfterSeconds.peek();
  }

  /**
   * The video's timer advances it: in Timer mode, and in either mode for a video shorter than Advance after that Loop
   * repeats while autoplay goes on.
   */
  function videoTimerApplies(): boolean {
    return autoplayGoesOn() && (store.autoplayMode.peek() === "timer" || (store.loop.peek() && videoShorterThanTimer()));
  }

  /** In Timer mode, while Loop holds autoplay, a video repeats a stretch of Advance after seconds. */
  function stretchApplies(): boolean {
    return store.autoplay.peek() && store.loop.peek() && store.loopStopsAutoplay.peek() && store.autoplayMode.peek() === "timer";
  }

  /** The stretch ends Advance after seconds from its start, or at the video's end when that comes first. */
  function stretchEnd(): number {
    const end = stretchStart + store.advanceAfterSeconds.peek();
    const duration = elements!.video.duration;
    return Number.isFinite(duration) ? Math.min(end, duration) : end;
  }

  /**
   * Where Timer mode's stretch starts for a position: there, or, at the video's end, Advance after seconds before it, or
   * at 0 for a shorter video.
   */
  function stretchStartAt(position: number): number {
    const duration = elements!.video.duration;
    return position >= duration ? Math.max(0, duration - store.advanceAfterSeconds.peek()) : position;
  }

  /** Timer mode's stretch is the whole video, from its start to its end. */
  function stretchIsWholeVideo(): boolean {
    const duration = elements!.video.duration;
    return stretchStart === 0 && Number.isFinite(duration) && duration > 0 && stretchEnd() >= duration;
  }

  /**
   * The browser repeats the video itself, without a pause or its end, while Loop repeats it whole: with Autoplay off,
   * while Loop holds autoplay in Normal mode, for a video shorter than Advance after until, in Normal mode, its timer
   * has run, and while Timer mode's stretch is the whole video. Any other stretch goes back to its start itself.
   */
  function videoLoops(): boolean {
    if (!store.loop.peek()) return false;
    if (stretchApplies()) return stretchIsWholeVideo();
    return !autoplayGoesOn() || (videoShorterThanTimer() && !videoTimerDone);
  }

  /**
   * Brings the video in line with Autoplay, Loop, the autoplay settings, and whether it plays: its timer runs or holds
   * with its time, the browser repeats it or not, and Timer mode's stretch starts where the video is when it starts to
   * apply, or, for a video at its end, where a seek to its end starts it, with the video, and shows on the scrub bar.
   */
  function syncVideo(): void {
    if (!elements || !videoShown() || !armedFor("video")) return;
    const { video } = elements;
    const applies = stretchApplies();
    if (applies && !stretching) {
      stretchStart = stretchStartAt(video.currentTime);
      if (stretchStart !== video.currentTime) {
        video.currentTime = stretchStart;
      }
    }
    stretching = applies;
    if (videoTimerApplies() && videoStarted && !videoPaused() && failurePhase === "none") {
      videoTimer.resume();
    } else {
      videoTimer.hold();
    }
    video.loop = videoLoops();
    showStretch();
  }

  /** Shows Timer mode's stretch faintly behind the scrub bar, once the video's length places it, and hides it otherwise. */
  function showStretch(): void {
    if (!elements) return;
    const { seekStretch, video } = elements;
    const duration = video.duration;
    const shown = stretching && videoShown() && Number.isFinite(duration) && duration > 0;
    seekStretch.hidden = !shown;
    if (shown) {
      seekStretch.style.setProperty("--loop-from", String(stretchStart / duration));
      seekStretch.style.setProperty("--loop-to", String(stretchEnd() / duration));
    }
  }

  /**
   * Timer mode's stretch goes back to its start once the video reaches the stretch's end, checked on each time update and
   * animation frame; one that ends at the video's end starts over when the video ends.
   */
  function repeatStretch(): void {
    if (!stretching || !elements) return;
    const { video } = elements;
    const end = stretchEnd();
    if (end < video.duration && video.currentTime >= end) {
      video.currentTime = stretchStart;
    }
  }

  /** Auto-Pause has nothing of what shows to resume. */
  function dropAutoPaused(): void {
    autoPausedVideo = false;
    autoHeldPhoto = false;
  }

  /** The user played or paused, which Auto-Pause then leaves as it is. */
  function handBackToUser(): void {
    autoPauseHolds = false;
    dropAutoPaused();
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
      playButton.value = { disabled: false, showsPause: !!store.current.peek() && videoShown() && !videoPaused() };
      seekBar.value = { disabled: !videoShown() || videoLengthUnknown(), label: "Seek" };
    }
    const play = playButton.peek();
    // The browser pauses a video at its end just before its `ended`, which repeats it or moves on, so that pause
    // doesn't wait for the user.
    const movesOn = videoShown() && elements!.video.ended && (stretching || autoplayGoesOn());
    paused.value = !play.disabled && !play.showsPause && !movesOn;
    moveBarWhilePlaying();
  }

  /**
   * Moves the bar every animation frame while a video plays, or a photo's timer runs while the bar shows it, so it
   * moves smoothly, and stops once it pauses. The time it shows still changes once a second.
   */
  function moveBarWhilePlaying(): void {
    const moves = photoShown() ? photoBarShown() && photoTimer.running : videoShown() && !videoPaused();
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
      repeatStretch();
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

  /**
   * The photo advances while autoplay goes on. Otherwise it repeats: it stays on screen and only its timer starts over,
   * so it neither loads again nor counts another play.
   */
  function photoTimerEnded(): void {
    if (!autoplayGoesOn()) {
      photoTimer.start(advanceAfterMs());
      showPlayState();
      return;
    }
    showPlayState();
    advance();
  }

  /** Timer mode advances the video; in Normal mode, a short video Loop repeats finishes the repeat in progress first. */
  function videoTimerEnded(): void {
    if (!videoShown()) return;
    if (store.autoplayMode.peek() === "timer") {
      trace("info", "timer-advance", { mediaType: "video" });
      advance();
      return;
    }
    videoTimerDone = true;
    syncVideo();
  }

  /**
   * Loop or Loop stops autoplay changed while a photo shows, and the photo keeps its time. With Autoplay and Loop off its
   * timer stops. One that wasn't set, or had ended, starts from its full time when the photo now repeats, and one the
   * user held runs on once the bar no longer shows it, since Play can't resume it then; one Auto-Pause holds stays held.
   */
  function followLoopChange(): void {
    if (!photoShown()) return;
    if (!photoTimerRuns()) {
      photoTimer.clear();
    } else if (!photoTimer.active) {
      if (!autoplayGoesOn()) {
        photoTimer.start(advanceAfterMs());
      }
    } else if (!photoTimer.running && !autoHeldPhoto && !photoBarShown()) {
      photoTimer.resume();
    }
  }

  /**
   * The media of the attempt playing now has loaded, failed, or been paused, so the player no longer waits for it.
   * Loading… keeps showing while a pick or a library play still waits.
   */
  function mediaSettled(): void {
    store.loading.release("media");
  }

  /**
   * The browser refused the attempt's video play, as when it blocks autoplay, which leaves it waiting for the user. A
   * source that fails refuses its play just after its error, whose handling holds Loading… until it knows why, so that
   * refusal changes nothing. A refusal that arrives after another attempt has started is that earlier play's, cut short
   * by the new source.
   */
  function playRefused(attemptId: number): void {
    if (store.playAttemptId.peek() === attemptId && failurePhase === "none") {
      mediaSettled();
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
    timeText.value = formatPlaybackPosition(video.currentTime, video.duration);
    seekSlider.value = videoLengthUnknown() ? "0" : String(video.currentTime);
  }

  /**
   * Starts a play attempt for `item`: the last item stops at once, Loading… holds until the media plays, loads, or
   * fails, and the play is recorded unless the server already recorded it. The media loads with `loadMedia`.
   */
  function beginAttempt(item: PlayingItem, origin: AttemptOrigin, recordPlayback: boolean): number {
    const { video, photo, emptyState, seekSlider } = elements!;
    store.playAttemptId.value += 1;
    const attemptId = store.playAttemptId.peek();
    attemptOrigin = origin;
    // Every attempt waits for its media, a history step or a photo shown again too, until it plays, loads, or fails.
    store.loading.hold("media");
    trace("info", "start", { mediaType: item.mediaType });
    if (recordPlayback) {
      notifyPlaybackStarted(item);
    }

    store.itemStates.applyTo(item);
    photoTimer.clear();
    videoTimer.clear();
    videoStarted = false;
    videoTimerDone = false;
    failurePhase = "none";
    recovered = false;
    stepWaiting = false;
    // What Auto-Pause held of the last item has nothing left to resume.
    dropAutoPaused();
    // A new item's stretch starts at its start, its frames are timed anew, and the seek indicator's total starts over.
    frameClock.reset();
    seekIndicator.clear();
    stretchStart = 0;
    stretching = false;
    stretchRestarting = false;
    armed = null;
    mediaFailed.value = false;
    resumeAt = null;
    // A new item stops the last at once, so a pause still fading out has nothing left to do.
    audio.cancelPause();
    video.pause();
    video.src = "";
    photo.src = "";
    video.style.display = "none";
    photo.style.display = "none";
    emptyState.style.display = "none";
    // The bar starts empty, so it never shows the last item's time.
    seekSlider.value = "0";
    showToggles();
    return attemptId;
  }

  /**
   * Shows the attempt's photo, or loads and plays its video, from the item's media URL. While Auto-Pause holds playback,
   * the video loads paused and the photo's timer holds, for Auto-Resume to play, and Loading… ends, as Auto-Pause ends a
   * media load's wait.
   */
  function loadMedia(item: PlayingItem, attemptId: number): void {
    const { video, photo } = elements!;
    const mediaUrl = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);

    if (item.mediaType === "photo") {
      armed = { mediaType: "photo", id: item.id, attemptId };
      photo.src = mediaUrl;
      photo.style.display = "block";
      if (photoTimerRuns()) {
        photoTimer.start(advanceAfterMs());
        if (autoPauseHolds) {
          photoTimer.hold();
          autoHeldPhoto = true;
        }
      }
      showStretch();
    } else {
      // Until its metadata gives its length.
      timeText.value = NO_TIME;
      videoSource = mediaUrl;
      video.src = mediaUrl;
      video.style.display = "block";
      armed = { mediaType: "video", id: item.id, attemptId };
      // Held until the video first plays.
      videoTimer.start(advanceAfterMs());
      videoTimer.hold();
      stretching = stretchApplies();
      syncVideo();
      if (autoPauseHolds) {
        autoPausedVideo = true;
      } else {
        void audio.play(video).catch(() => playRefused(attemptId));
      }
    }

    if (autoPauseHolds) {
      mediaSettled();
      if (autoPausedVideo || autoHeldPhoto) {
        trace("info", "auto-pause", { mediaType: item.mediaType });
      }
    }
    showToggles();
  }

  /** Plays the current item from where `origin` says it came from. */
  function play(origin: AttemptOrigin): void {
    const item = store.current.peek();
    if (!item || !elements) return;
    loadMedia(item, beginAttempt(item, origin, origin !== "library"));
  }

  /**
   * Steps through the history, forward or back, and plays the entry with a fresh media URL from the server, which
   * counts its one play. Returns false at either end of the history. While the server fails the compatibility check or
   * runs without a library, it plays nothing, so the entry plays with the URL it has and nothing is recorded.
   */
  function stepHistory(step: -1 | 1): boolean {
    if (!store.stepHistory(step)) return false;
    if (!elements) return true;
    const item = store.current.peek()!;
    const attemptId = beginAttempt(item, step < 0 ? "back" : "forward", false);
    if (store.heldBack.peek()) {
      loadMedia(item, attemptId);
    } else {
      stepWaiting = true;
      void playFresh(item, attemptId);
    }
    return true;
  }

  /** What the server answered a play request for the current item. */
  type PlayAnswer =
    | { kind: "played"; mediaUrl: string; rating: number | null }
    | { kind: "refused"; result: PlayItemFailure }
    | { kind: "unauthorized" }
    | { kind: "unreachable" }
    | { kind: "timedOut" }
    | { kind: "error"; error: string };

  /**
   * Asks the server for a fresh media URL through `POST /api/play/{itemId}`, which counts a play unless
   * `recordPlayback` is false, with the same time limit as the probe.
   */
  async function requestPlay(item: PlayingItem, recordPlayback: boolean): Promise<PlayAnswer> {
    const identity = { clientId: store.identity.clientId, sessionId: store.identity.sessionId };
    const outcome = await withTimeout(
      (signal) => requestPlayItem({ apiBaseUrl }, item.itemId, identity, api.request, { recordPlayback, signal }),
      PLAYBACK_REQUEST_TIMEOUT_MS
    );
    if (outcome.kind === "timedOut") return { kind: "timedOut" };
    if (outcome.kind === "failed") {
      if (outcome.error instanceof UnauthorizedError) return { kind: "unauthorized" };
      if (outcome.error instanceof ServerUnreachableError) return { kind: "unreachable" };
      return { kind: "error", error: errorType(outcome.error) };
    }
    const result = outcome.value;
    if (!result.ok) return { kind: "refused", result };
    return result.response?.mediaUrl
      ? { kind: "played", mediaUrl: result.response.mediaUrl, rating: result.response.rating ?? null }
      : { kind: "error", error: "NoMediaUrl" };
  }

  /**
   * A play request the server refused or didn't answer: a 404 means the file is missing, a 5xx or no answer that it
   * couldn't load, and anything else stops on the library play's message for it. A 401 shows only the pairing prompt.
   */
  function playRequestFailed(attempt: ArmedAttempt, answer: Exclude<PlayAnswer, { kind: "played" }>, event: string): void {
    switch (answer.kind) {
      case "unauthorized":
        stopSilently();
        return;
      case "refused": {
        const { refusal } = answer.result;
        trace("warn", event, { statusCode: refusal.status, code: refusal.code || "none" });
        if (refusal.status === 404) {
          failed(attempt, "missing");
        } else if (refusal.status >= 500) {
          failed(attempt, "unreadable");
        } else {
          const { text, logText } = playRefusalFailure(refusal, attempt.mediaType);
          stopOn(text, logText);
        }
        return;
      }
      case "timedOut":
        trace("warn", event, { timeoutMs: PLAYBACK_REQUEST_TIMEOUT_MS });
        failed(attempt, "unreadable");
        return;
      case "unreachable":
        trace("warn", event, { error: "ServerUnreachableError" });
        failed(attempt, "unreadable");
        return;
      case "error":
        trace("warn", event, { error: answer.error });
        failed(attempt, "unreadable");
        return;
    }
  }

  /**
   * A history step's play: its fresh media URL replaces the entry's, and its media loads with it. Its rating becomes the
   * entry's, so a change made while the entry wasn't playing shows.
   */
  async function playFresh(item: PlayingItem, attemptId: number): Promise<void> {
    const attempt: ArmedAttempt = { mediaType: item.mediaType, id: item.id, attemptId };
    const answer = await requestPlay(item, true);
    if (!isStale(attempt)) {
      stepWaiting = false;
    }
    if (!elements || isStale(attempt)) {
      trace("info", "step-play-stale", { expectedPlayAttemptId: attemptId });
      return;
    }
    if (answer.kind !== "played") {
      playRequestFailed(attempt, answer, "step-play-failed");
      return;
    }
    item.mediaUrl = answer.mediaUrl;
    ratings.takeRead(item.itemId, answer.rating);
    loadMedia(item, attemptId);
  }

  /**
   * Resolves once the connection is back: Reconnecting… has shown and ended, or, while it doesn't show, after
   * `RECOVERY_RETRY_MS`, since the connection may not yet know the server is down.
   */
  function connectionBack(): Promise<void> {
    return new Promise((resolve) => {
      let wasDown = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe = () => {};
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      // Called at once with whether it shows now, which can't finish the wait.
      unsubscribe = store.reconnecting.subscribe((down) => {
        if (down) {
          wasDown = true;
          clearTimeout(timer);
        } else if (wasDown) {
          finish();
        }
      });
      if (!wasDown) {
        timer = setTimeout(finish, RECOVERY_RETRY_MS);
      }
    });
  }

  /**
   * A video that had played failed, as when a server restart drops its media token: it gets a fresh media URL that
   * counts no second play, and plays on from where it was, playing or paused as it was. While the server can't be
   * reached it waits for the connection, with no dialog. A refused request goes on as a history step's does.
   */
  async function recover(attempt: ArmedAttempt): Promise<void> {
    const item = store.current.peek()!;
    const position = elements!.video.currentTime;
    failurePhase = "recovering";
    recovered = true;
    syncVideo();
    store.loading.hold("media");
    trace("info", "recover-start");
    let answer: PlayAnswer;
    for (;;) {
      if (store.reconnecting.peek()) {
        trace("info", "recover-wait");
        await connectionBack();
        if (!elements || isStale(attempt)) {
          trace("info", "recover-stale", { expectedPlayAttemptId: attempt.attemptId });
          return;
        }
      }
      answer = await requestPlay(item, false);
      if (!elements || isStale(attempt)) {
        trace("info", "recover-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      if (answer.kind !== "unreachable") break;
      trace("info", "recover-wait");
      await connectionBack();
      if (!elements || isStale(attempt)) {
        trace("info", "recover-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
    }
    if (answer.kind !== "played") {
      playRequestFailed(attempt, answer, "recover-failed");
      return;
    }
    trace("info", "recover");
    playFreshUrl(attempt, item, answer.mediaUrl, position);
  }

  /**
   * Plays the attempt's media on from a fresh media URL: a photo shows again, and a video goes on from `position`,
   * playing unless the user or Auto-Pause paused it while it waited.
   */
  function playFreshUrl(attempt: ArmedAttempt, item: PlayingItem, mediaUrl: string, position: number): void {
    item.mediaUrl = mediaUrl;
    failurePhase = "none";
    mediaFailed.value = false;
    if (attempt.mediaType === "photo") {
      loadMedia(item, attempt.attemptId);
      return;
    }
    const { video } = elements!;
    // A source that fails fires no pause, so the video reads as paused only once the user or Auto-Pause paused it.
    const playing = !videoPaused();
    // A new source pauses the video, so playing it again plays it on.
    audio.cancelPause();
    video.pause();
    videoSource = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);
    video.src = videoSource;
    // Its metadata seeks it to where it was.
    resumeAt = position;
    if (playing) {
      void audio.play(video).catch(() => playRefused(attempt.attemptId));
    } else {
      mediaSettled();
    }
    showPlayState();
    syncVideo();
  }

  /**
   * Asks the server about the file whose media failed, keeping Loading… up, and goes on from its answer, unless another
   * play has started by then. The server answers 404 for a media token it no longer knows, as after a restart, as well
   * as for a missing file, so a 404 for a media URL that hasn't been renewed since the media last played asks the play
   * route first.
   */
  async function probe(attempt: ArmedAttempt): Promise<void> {
    const item = store.current.peek()!;
    failurePhase = "failing";
    store.loading.hold("media");
    const result = await probeMedia(api.request, absolutizeMediaUrl(apiBaseUrl, item.mediaUrl));
    if (!elements || isStale(attempt)) {
      trace("info", "media-probe-stale", { expectedPlayAttemptId: attempt.attemptId });
      return;
    }
    if (result.outcome === "unauthorized") {
      trace("warn", "media-probe", { mediaType: attempt.mediaType, statusCode: 401 });
      stopSilently();
      return;
    }
    const { outcome, ...answer } = result;
    trace("warn", "media-probe", { mediaType: attempt.mediaType, ...answer, failure: outcome });
    if (outcome === "missing" && !recovered) {
      await recheck(attempt, item);
      return;
    }
    failed(attempt, outcome);
  }

  /**
   * Asks the play route about a file whose range request answered 404, for a fresh media URL that counts no play: its
   * 404 means the file is missing, and a fresh URL plays on, since only the media's token was stale. Any other answer
   * goes on as a history step's does.
   */
  async function recheck(attempt: ArmedAttempt, item: PlayingItem): Promise<void> {
    recovered = true;
    const position = elements!.video.currentTime;
    const answer = await requestPlay(item, false);
    if (!elements || isStale(attempt)) {
      trace("info", "media-recheck-stale", { expectedPlayAttemptId: attempt.attemptId });
      return;
    }
    if (answer.kind !== "played") {
      playRequestFailed(attempt, answer, "media-recheck-failed");
      return;
    }
    trace("info", "media-recheck");
    playFreshUrl(attempt, item, answer.mediaUrl, position);
  }

  /**
   * The media of the attempt playing now failed: its timers hold, its bar stops, and ambient mode's glow hides. A video
   * that had played recovers first, once; anything else asks the server about the file.
   */
  function mediaFailedNow(attempt: ArmedAttempt): void {
    // A failure already handled, such as one from an element a new one took over from, changes nothing.
    if (failurePhase !== "none") return;
    stopMovingBar();
    videoTimer.hold();
    photoTimer.hold();
    if (photoShown()) {
      showPlayState();
    }
    if (attempt.mediaType === "video" && videoStarted && !recovered) {
      void recover(attempt);
      return;
    }
    mediaFailed.value = true;
    void probe(attempt);
  }

  /**
   * Goes on from a failure whose cause is known. A file this browser can't play, or a missing one, reached forward or
   * back is skipped in the same direction with a Skipped files popup, up to ten in a row, and one Insert put after the
   * playing item by picking again with Insert; Previous at the oldest entry has nowhere to go. Anything else stops on
   * its message.
   */
  function failed(attempt: ArmedAttempt, failure: MediaFailure): void {
    failurePhase = "failing";
    const fileName = playingFileName(store.current.peek()!);
    const atOldest = attemptOrigin === "back" && store.historyIndex.peek() <= 0;
    if (failure === "unreadable" || attemptOrigin === "library" || skips >= SKIP_LIMIT || atOldest) {
      stopOn(mediaFailureMessage(attempt.mediaType, failure, fileName));
      return;
    }
    skips += 1;
    notifications.notify({ kind: "skips", text: skipText(failure), detail: fileName, key: "skip" });
    if (attemptOrigin === "back") {
      stepHistory(-1);
    } else if (attemptOrigin === "inserted") {
      void pick("afterCurrent");
    } else {
      advance();
    }
  }

  /** Stops on a failure's notice: the photo's timer and the video's hold, so autoplay goes no further, and Loading… ends. */
  function stopOn(message: string, logText?: string): void {
    stopSilently();
    void dialogs.notice(message, logText);
  }

  /**
   * Stops on a failure without a notice, as for a 401, whose pairing prompt is the only signal. Auto-Pause has nothing to
   * resume then, so a held photo's timer stays held.
   */
  function stopSilently(): void {
    dropAutoPaused();
    failurePhase = "stopped";
    mediaFailed.value = true;
    stopMovingBar();
    photoTimer.hold();
    videoTimer.hold();
    mediaSettled();
    if (photoShown()) {
      showPlayState();
    }
  }

  /**
   * A play the user started, which starts the count of files skipped in a row over and ends Auto-Pause's hold, so the
   * item it starts plays. What Auto-Pause paused still resumes until an item starts, since a press can start nothing,
   * as Previous at the oldest entry or a pick that finds nothing doesn't.
   */
  function userStarted(): void {
    skips = 0;
    autoPauseHolds = false;
  }

  /**
   * Picks with the applied filter and the Randomization tab's options, and puts the pick at the end of the history or,
   * with `afterCurrent`, right after the playing item. Each answer brings this device's Shuffle cycle numbers.
   */
  async function pick(placement: "end" | "afterCurrent" = "end"): Promise<void> {
    const refusal = playRefusalNotice(store);
    if (refusal) {
      settleFailedMedia();
      void dialogs.notice(refusal);
      return;
    }

    const body = currentRandomPickRequest(store);

    // A press while a pick is waiting sends nothing and holds nothing more; the pick that waits shows Loading….
    if (!pickWaiting) {
      pickWaiting = true;
      store.loading.hold("pick");
    }
    const outcome = await randomPicker.pick(body);
    if (outcome.kind === "busy") {
      return;
    }
    pickWaiting = false;
    if ((outcome.kind === "picked" || outcome.kind === "none") && outcome.cycle) {
      store.randomCycle.value = outcome.cycle;
    }
    try {
      if (outcome.kind !== "picked") {
        settleFailedMedia();
      }
      switch (outcome.kind) {
        case "timedOut":
          trace("warn", "random-pick-timeout", { timeoutMs: outcome.timeoutMs });
          void dialogs.notice("No response from the server. Try again.");
          return;
        case "unauthorized":
          // The request asked for pairing, whose prompt is the only signal, and sent its line.
          return;
        case "failed":
          noticeRequestFailure(dialogs, "Random selection failed", outcome.error);
          return;
        case "none":
          void dialogs.notice("No eligible media for current filters.");
          return;
      }

      // The media holds Loading… before the pick lets go of it, so a pick and its media load are one loading period.
      // A pick goes at the end of history, or right after the playing item, keeping every entry either way, wherever in
      // it the press came from.
      if (placement === "afterCurrent") {
        store.insertHistory(outcome.item);
        play("inserted");
      } else {
        store.appendHistory(outcome.item);
        play("forward");
      }
    } finally {
      store.loading.release("pick");
    }
  }

  /**
   * A pick that skipped on from a file that couldn't play, and then played nothing, leaves that file stopped, with
   * nothing loading and nothing for Auto-Pause to resume.
   */
  function settleFailedMedia(): void {
    if (failurePhase === "failing") {
      dropAutoPaused();
      failurePhase = "stopped";
      videoTimer.hold();
      mediaSettled();
    }
  }

  /** Steps forward in history, or picks at its end, as autoplay, Next, and a skip forward do. */
  function advance(): void {
    if (!stepHistory(1)) {
      void pick();
    }
  }

  /** Favoriting clears the blacklist, and blacklisting clears the favorite. */
  async function toggleFlag(flag: "isFavorite" | "isBlacklisted"): Promise<void> {
    const isFavorite = flag === "isFavorite";
    const item = store.current.peek();
    if (!item?.itemId) return;
    const nextValue = !item[flag];
    // The item the request acts on, named as the now-playing line names it, though another may play by the answer.
    const fileName = playingFileName(item);
    const path = isFavorite ? "/api/favorite" : "/api/blacklist";
    const taken = await requestWithNotice(dialogs, `${isFavorite ? "Favorite" : "Blacklist"} update failed`, () =>
      // The client id comes back on the change's event, so this device can tell its own change from another's.
      api.post(path, { itemId: item.itemId, [flag]: nextValue, clientId: store.identity.clientId })
    );
    if (!taken) return;
    // Applied to the item playing when the server answers.
    const current = store.current.peek()!;
    current[flag] = nextValue;
    if (nextValue) {
      current[isFavorite ? "isBlacklisted" : "isFavorite"] = false;
    }
    store.itemStates.remember(current.itemId, { isFavorite: current.isFavorite, isBlacklisted: current.isBlacklisted });
    showToggles();
    const text = isFavorite
      ? nextValue
        ? "Added to favorites"
        : "Removed from favorites"
      : nextValue
        ? "Blacklisted"
        : "Removed from blacklist";
    notifications.notify({ kind: "actions", text, detail: fileName, key: "flag" });
  }

  connection.on("itemStateChanged", (payload: ItemStateChangedPayload | null | undefined) => {
    const itemId = payload?.itemId;
    if (!payload || !itemId) return;
    store.itemStates.remember(itemId, { isFavorite: !!payload.isFavorite, isBlacklisted: !!payload.isBlacklisted });
    if (applyItemStateToCurrent(store.current.peek(), payload)) {
      showToggles();
    }
    // This device's own change already said so, as Your actions. An event without a client id counts as another
    // device's.
    if (payload.clientId && payload.clientId === store.identity.clientId) {
      return;
    }
    const text = payload.isBlacklisted
      ? "Blacklisted on another device"
      : payload.isFavorite
        ? "Added to favorites on another device"
        : payload.previousIsBlacklisted
          ? "Removed from blacklist on another device"
          : "Removed from favorites on another device";
    // The log leaves the file name out.
    notifications.notify({
      kind: "devices",
      text,
      detail: basenameFromPath(payload.path || ""),
      key: `sync:${itemId}`,
      logText: text
    });
  });

  // A showing photo's timer, and a video's, takes the new length, keeping the time it has run and whether it runs or
  // Auto-Pause or the user holds it, so a length no longer than that time ends it as soon as it runs. Whether a video is
  // shorter than Advance after, and where its stretch ends, follow.
  store.on("advanceAfterChanged", () => {
    if (photoShown() && photoTimer.active) {
      photoTimer.setLength(advanceAfterMs());
      showPhotoTime();
    }
    if (videoTimer.active) {
      videoTimer.setLength(advanceAfterMs());
    }
    syncVideo();
  });

  store.on("autoplaySettingsChanged", () => {
    followLoopChange();
    syncVideo();
    showPlayState();
  });

  return {
    playButton,
    paused,
    seekBar,
    videoKey,
    favorite,
    blacklisted,
    timeText,
    mediaFailed,
    seekIndicator,

    attach(attached) {
      elements = attached;
      frameClock.follow(attached.video);
    },

    detach() {
      frameClock.follow(null);
      seekIndicator.clear();
      photoTimer.clear();
      videoTimer.clear();
      stopMovingBar();
      armed = null;
      elements = null;
      store.loading.releaseAll();
    },

    renewVideo() {
      if (!elements) return;
      renewal = { position: elements.video.currentTime, playing: !videoPaused() };
      videoKey.value += 1;
    },

    takeOverVideo(next) {
      if (!elements || elements.video === next) return;
      const previous = elements.video;
      const { position, playing } = renewal ?? { position: previous.currentTime, playing: !videoPaused() };
      renewal = null;
      audio.cancelPause();
      previous.pause();
      previous.removeAttribute("src");
      previous.load();
      elements.video = next;
      frameClock.follow(next);
      next.style.display = previous.style.display;
      // Only a video playing now, loaded or still loading, moves to the new element; a photo, or nothing yet, leaves it
      // empty.
      if (armedFor("video") && videoShown()) {
        next.src = videoSource;
        resumeAt = position;
        if (playing) {
          const attemptId = store.playAttemptId.peek();
          store.loading.hold("media");
          void audio.play(next).catch(() => {
            if (store.playAttemptId.peek() === attemptId) {
              mediaSettled();
            }
          });
        }
      }
      showPlayState();
      syncVideo();
    },

    playCurrent(playOptions = {}) {
      userStarted();
      play(playOptions.origin ?? "forward");
    },

    pickRandom() {
      userStarted();
      return pick(store.randomBehavior.peek() === "insert" ? "afterCurrent" : "end");
    },

    playOrPause() {
      if (!store.current.peek()) {
        userStarted();
        void pick();
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
        if (videoPaused()) {
          void audio.play(elements.video).catch(() => {});
        } else {
          // A video the user pauses while it still loads no longer shows Loading….
          audio.pause(elements.video);
          mediaSettled();
        }
        showPlayState();
        syncVideo();
      }
    },

    next() {
      userStarted();
      advance();
    },

    previous() {
      userStarted();
      stepHistory(-1);
    },

    toggleLoop() {
      store.setLoop(!store.loop.peek());
      followLoopChange();
      syncVideo();
      showToggles();
    },

    toggleAutoplay() {
      store.setAutoplay(!store.autoplay.peek());
      // A photo stays on screen: its timer starts over from its full time, or stops with Loop off too.
      if (photoShown()) {
        if (photoTimerRuns()) {
          handBackToUser();
          photoTimer.start(advanceAfterMs());
        } else {
          photoTimer.clear();
        }
      }
      syncVideo();
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
      seekVideoTo(Number(value));
    },

    seekBy(seconds) {
      const video = seekableVideo();
      if (!video) return;
      seekVideoTo(Math.min(video.duration, Math.max(0, video.currentTime + seconds)));
      showTime();
      seekIndicator.seeked(seconds);
    },

    seekable: () => seekableVideo() !== null,

    stepFrame(direction) {
      const video = seekableVideo();
      if (!video || !videoPaused()) return;
      const target = frameClock.stepTarget(video.currentTime, direction);
      // There is no frame after the last, and a seek to the end would end the video.
      if (target >= video.duration) return;
      seekVideoTo(Math.max(0, target));
      showTime();
    },

    autoPause() {
      autoPauseHolds = true;
      // Nothing shows yet: the step's media loads paused once the server answers, and Loading… waits for that.
      if (stepWaiting) return;
      mediaSettled();
      if (photoShown()) {
        autoHeldPhoto = photoTimer.running;
        photoTimer.hold();
      } else if (elements && videoShown()) {
        autoPausedVideo = !videoPaused();
        audio.pause(elements.video);
        syncVideo();
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
      if (resumePhoto && photoShown() && photoTimer.active) {
        trace("info", "auto-resume", { mediaType: "photo" });
        photoTimer.resume();
        showPlayState();
      } else if (resumeVideo && elements && videoShown()) {
        trace("info", "auto-resume", { mediaType: "video" });
        void audio.play(elements.video).catch(() => {});
        showPlayState();
        syncVideo();
      }
    },

    videoPlayStateChanged() {
      // Nothing in the player plays a video while Auto-Pause holds playback, so this play is the user's, from outside
      // its controls, as a media key or the system's media controls play it.
      if (autoPauseHolds && !videoPaused()) {
        handBackToUser();
      }
      showPlayState();
      syncVideo();
    },

    videoPlaying() {
      const attempt = armedFor("video");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "video-onplaying-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      // A stretch's repeat from the video's end only plays on, so it relays nothing.
      const repeat = stretchRestarting;
      stretchRestarting = false;
      if (!repeat) {
        trace("info", "video-onplaying");
      }
      mediaSettled();
      if (!repeat) {
        store.relayStatus("Playing");
      }
      // A file loaded, so the files skipped before it no longer count as in a row.
      skips = 0;
      videoStarted = true;
      // Once it plays again after a recovery, a later failure, such as another server restart, recovers too.
      recovered = false;
      syncVideo();
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
      mediaFailedNow(attempt);
    },

    videoMetadataLoaded() {
      if (!armedFor("video") || !elements) return;
      // A new element that took over the video goes on from where the one before it was.
      if (resumeAt !== null) {
        elements.video.currentTime = resumeAt;
        resumeAt = null;
      }
      if (!videoLengthUnknown()) {
        elements.seekSlider.max = String(elements.video.duration || 100);
      }
      showTime();
      // Its length decides whether the bar is enabled, whether it is shorter than Advance after, and where its stretch
      // shows.
      showPlayState();
      syncVideo();
    },

    videoTimeUpdated() {
      if (!armedFor("video")) return;
      repeatStretch();
      showTime();
    },

    videoEnded() {
      if (!armedFor("video") || !elements) return;
      // A stretch that starts mid-video and reaches the video's end starts over from its start, without loading again;
      // the browser repeats one that is the whole video itself.
      if (stretching) {
        stretchRestarting = true;
        elements.video.currentTime = stretchStart;
        void audio.play(elements.video).catch(() => {
          stretchRestarting = false;
        });
        return;
      }
      if (!autoplayGoesOn()) return;
      advance();
    },

    photoLoaded() {
      const attempt = armedFor("photo");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "photo-onload-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      trace("info", "photo-onload");
      mediaSettled();
      store.relayStatus("Playing");
      skips = 0;
    },

    photoFailed() {
      const attempt = armedFor("photo");
      if (!attempt) return;
      if (isStale(attempt)) {
        trace("info", "photo-onerror-stale", { expectedPlayAttemptId: attempt.attemptId });
        return;
      }
      trace("warn", "photo-onerror");
      mediaFailedNow(attempt);
    }
  };
}
