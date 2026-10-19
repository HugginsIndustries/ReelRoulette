import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { createMediaGestures } from "../playback/mediaGestures";
import { isTextField } from "../playback/playerControls";
import { useApp } from "./appContext";
import { NotifyButton } from "./Notifications";

/** The video's boolean attributes, present and empty as in the page's HTML. */
const VIDEO_FLAGS: Record<string, string> = {
  playsinline: "",
  "webkit-playsinline": "",
  disablepictureinpicture: "",
  disableremoteplayback: ""
};

const OVERLAY_BUTTON = "overlay-btn icon-glyph-base icon-glyph-button";
const OVERLAY_TOGGLE = "overlay-btn icon-glyph-base icon-glyph-toggle overlay-toggle";

/** The controls a mouse or pen pointer over keeps shown: the buttons and the seek row. */
const CONTROL_PARTS = ".overlay-btn, .overlay-seek-row";

function lit(className: string, active: boolean): string {
  return active ? `${className} active` : className;
}

/** A control's click, which never reaches the media area behind it. */
function press(action: () => unknown) {
  return (event: Event) => {
    event.stopPropagation();
    void action();
  };
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

/**
 * The media area: ambient mode's glow, the video and photo, the empty state, and the controls over them. The player
 * sets the media elements' sources and which of them shows itself, and ambient mode whether its glow shows and its
 * settings, so their `style`, the glow's `hidden`, the seek slider's value, and the stretch behind it are rendered once
 * and never changed here. The video element is never moved, and is replaced only when the player asks for a new one,
 * once Enhanced audio is off, which then takes over the video. The seek row stays in its place before anything plays
 * and on a photo too, so the controls never move. The player claims its touches (`touch-action: none`), so a two-finger
 * drag changes the volume without the browser scrolling or zooming, and over it the scroll wheel never scrolls the page.
 * Hide player controls decides when the controls show; hidden, they can't be pressed, so a first tap only shows them.
 */
export function Player() {
  const { store, player, playerControls: controls, audio, ambient, fullscreen } = useApp();
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const ambientLayer = useRef<HTMLDivElement>(null);
  const ambientCanvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const emptyState = useRef<HTMLDivElement>(null);
  const seekSlider = useRef<HTMLInputElement>(null);
  const seekStretch = useRef<HTMLSpanElement>(null);
  /** The volume slider is pressed, so its drag is one volume change until it's let go. */
  const sliderPressed = useRef(false);
  const gestures = useMemo(
    () =>
      createMediaGestures({
        previous: player.previous,
        next: player.next,
        showControls: controls.show,
        volumeAdjustable: () => audio.volumeShown.peek(),
        beginVolumeChange: audio.beginVolumeChange,
        endVolumeChange: audio.endVolumeChange,
        stepVolume: audio.stepVolume
      }),
    []
  );

  /** A drag of the scrub bar or the volume keeps the controls shown until it's let go. */
  function pressBar(): void {
    controls.hold("drag", true);
  }

  function pressSlider(): void {
    sliderPressed.current = true;
    audio.beginVolumeChange();
    pressBar();
  }

  function releaseSlider(): void {
    controls.hold("drag", false);
    if (!sliderPressed.current) return;
    sliderPressed.current = false;
    audio.endVolumeChange();
  }

  useLayoutEffect(() => {
    player.attach({
      video: video.current!,
      photo: photo.current!,
      emptyState: emptyState.current!,
      seekSlider: seekSlider.current!,
      seekStretch: seekStretch.current!
    });
    ambient.attach({ layer: ambientLayer.current!, canvas: ambientCanvas.current!, video: video.current!, photo: photo.current! });
    audio.attach(video.current!);

    // Passive where they never cancel, which JSX cannot set, so the browser never waits for them. A two-finger drag's
    // move and the wheel cancel the browser's own scroll, and Safari's pinch gesture is turned away.
    const area = container.current!;
    const onTouchStart = (event: TouchEvent) => {
      const startsOnControls = !!(event.target as Element | null)?.closest?.("#overlay-controls");
      gestures.touchStart(startsOnControls, event.touches ?? []);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (gestures.touchMove(event.touches ?? [])) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => gestures.touchEnd(event.changedTouches?.[0], event.touches?.length ?? 0);
    // A touch the system cancels, as for an app switch, is neither a swipe nor a tap, and ends a two-finger drag.
    const onTouchCancel = (event: TouchEvent) => gestures.touchEnd(undefined, event.touches?.length ?? 0);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      gestures.wheel(event);
    };
    const onGestureStart = (event: Event) => event.preventDefault();
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    area.addEventListener("touchmove", onTouchMove, { passive: false });
    area.addEventListener("touchend", onTouchEnd, { passive: true });
    area.addEventListener("touchcancel", onTouchCancel, { passive: true });
    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("gesturestart", onGestureStart);
    // The slider's drag ends where it's let go, which may be off the slider. A key step on the focused slider, without a
    // press, is a change of its own.
    document.addEventListener("pointerup", releaseSlider);
    document.addEventListener("pointercancel", releaseSlider);

    // Moving the mouse over the player, a press on the controls, which Safari leaves no focus for, and a key press,
    // outside a field that takes keys, are activity. A touch moving over the player isn't, so the controls a tap shows
    // come back only through its click, which then lands on the player. Focus on a control keeps the controls shown only
    // when it's keyboard focus, which `:focus-visible` matches: the last input was a key, not a pointer, so focus a tap or
    // click leaves on a control doesn't. A touch never counts as over a control.
    const controlsLayer = overlay.current!;
    let keyInput = false;
    const followFocus = (focused: EventTarget | null) =>
      controls.hold("keyboardFocus", keyInput && controlsLayer.contains(focused as Node | null));
    const onKeyDown = (event: KeyboardEvent) => {
      keyInput = true;
      followFocus(document.activeElement);
      if (!isTextField(event.target)) controls.activity();
    };
    const onPointerDown = (event: PointerEvent) => {
      keyInput = false;
      followFocus(document.activeElement);
      if (controlsLayer.contains(event.target as Node | null)) controls.activity();
    };
    const onFocusIn = () => {
      followFocus(document.activeElement);
      controls.activity();
    };
    const onFocusOut = (event: FocusEvent) => {
      followFocus(event.relatedTarget);
      controls.activity();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") controls.activity();
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if ((event.target as Element | null)?.closest?.(CONTROL_PARTS)) controls.hold("pointer", true);
    };
    const onPointerOut = (event: PointerEvent) => {
      if ((event.relatedTarget as Element | null)?.closest?.(CONTROL_PARTS)) return;
      controls.hold("pointer", false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    controlsLayer.addEventListener("focusin", onFocusIn);
    controlsLayer.addEventListener("focusout", onFocusOut);
    area.addEventListener("pointermove", onPointerMove, { passive: true });
    controlsLayer.addEventListener("pointerover", onPointerOver);
    controlsLayer.addEventListener("pointerout", onPointerOut);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      controlsLayer.removeEventListener("focusin", onFocusIn);
      controlsLayer.removeEventListener("focusout", onFocusOut);
      area.removeEventListener("pointermove", onPointerMove);
      controlsLayer.removeEventListener("pointerover", onPointerOver);
      controlsLayer.removeEventListener("pointerout", onPointerOut);
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchmove", onTouchMove);
      area.removeEventListener("touchend", onTouchEnd);
      area.removeEventListener("touchcancel", onTouchCancel);
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("gesturestart", onGestureStart);
      document.removeEventListener("pointerup", releaseSlider);
      document.removeEventListener("pointercancel", releaseSlider);
      audio.detach();
      ambient.detach();
      player.detach();
    };
  }, []);

  // A new video element, rendered for a new key, takes over the video: its sound plays directly, and the glow copies it.
  const videoKey = player.videoKey.value;
  const firstVideoKey = useRef(videoKey);
  useLayoutEffect(() => {
    if (videoKey === firstVideoKey.current) return;
    const next = video.current!;
    audio.attach(next);
    player.takeOverVideo(next);
    ambient.replaceVideo(next);
  }, [videoKey]);

  function onAreaClick(event: MouseEvent): void {
    if (gestures.takeFollowingClick()) {
      return;
    }

    event.stopPropagation();
    if (!store.current.peek()) {
      void player.pickRandom();
      return;
    }

    controls.tap();
  }

  const muted = audio.muted.value;
  const play = player.playButton.value;
  const seekBar = player.seekBar.value;
  return (
    <div id="media-container" class={controls.shown.value ? "media-container controls-visible" : "media-container"} ref={container} onClick={onAreaClick}>
      <div id="ambient" class="ambient" aria-hidden="true" ref={ambientLayer}>
        <canvas width="32" height="18" ref={ambientCanvas}></canvas>
      </div>
      <video
        key={videoKey}
        id="video"
        {...VIDEO_FLAGS}
        preload="auto"
        style="display:none"
        ref={video}
        onPlay={player.videoPlayStateChanged}
        onPause={player.videoPlayStateChanged}
        onPlaying={player.videoPlaying}
        onError={player.videoFailed}
        onLoadedMetadata={player.videoMetadataLoaded}
        onTimeUpdate={player.videoTimeUpdated}
        onEnded={player.videoEnded}
      ></video>
      <img id="photo" alt="Photo" style="display:none" ref={photo} onLoad={player.photoLoaded} onError={player.photoFailed} />
      <div id="empty-state" class="empty-state" ref={emptyState}>Tap to play, or open the panel to choose a preset or filter.</div>
      <PlayerIndicator />
      <VolumeIndicator />
      <div id="overlay-controls" class="overlay-controls" ref={overlay} onTouchStart={stopPropagation} onTouchMove={stopPropagation} onTouchEnd={stopPropagation} onClick={stopPropagation}>
        <NotifyButton />
        <PanelButton />
        <button id="favorite-btn" class={lit(`${OVERLAY_TOGGLE} overlay-corner-btn`, player.favorite.value)} aria-label="Favorite" title="Favorite" onClick={press(player.toggleFavorite)}><span class="material-symbol-icon">favorite</span></button>
        <button id="blacklist-btn" class={lit(`${OVERLAY_TOGGLE} overlay-corner-btn`, player.blacklisted.value)} aria-label="Blacklist" title="Blacklist" onClick={press(player.toggleBlacklist)}><span class="material-symbol-icon">thumb_down</span></button>
        <div class="overlay-controls-row overlay-controls-transport">
          <button id="prev-btn" class={OVERLAY_BUTTON} aria-label="Previous" title="Previous" onClick={press(player.previous)}><span class="material-symbol-icon">skip_previous</span></button>
          <button id="play-btn" class={`${OVERLAY_BUTTON} overlay-btn-play`} aria-label="Play/Pause" title="Play/Pause" disabled={play.disabled} onClick={press(player.playOrPause)}><span class="material-symbol-icon">{play.showsPause ? "pause" : "play_arrow"}</span></button>
          <button id="next-btn" class={OVERLAY_BUTTON} aria-label="Next" title="Next" onClick={press(player.next)}><span class="material-symbol-icon">skip_next</span></button>
          <button id="random-btn" class={OVERLAY_BUTTON} aria-label="Random" title="Random" onClick={press(player.pickRandom)}><span class="material-symbol-icon">casino</span></button>
          <button id="loop-btn" class={lit(OVERLAY_TOGGLE, store.loop.value)} aria-label="Loop" title="Loop" onClick={press(player.toggleLoop)}><span class="material-symbol-icon">repeat_one</span></button>
          <button id="autoplay-btn" class={lit(OVERLAY_TOGGLE, store.autoplay.value)} aria-label="Autoplay" title="Autoplay" onClick={press(player.toggleAutoplay)}><span class="material-symbol-icon">autoplay</span></button>
          <button id="fullscreen-btn" class={OVERLAY_BUTTON} aria-label="Fullscreen" title="Fullscreen" onClick={press(fullscreen.toggle)}><span class="material-symbol-icon">{fullscreen.active.value ? "fullscreen_exit" : "fullscreen"}</span></button>
        </div>
        <div id="seek-row" class="overlay-seek-row">
          <span id="seek-wrap" class="seek-wrap">
            <span id="seek-loop" class="seek-loop" aria-hidden="true" hidden ref={seekStretch}></span>
            <input type="range" id="seek-slider" min="0" max="100" step="any" defaultValue="0" aria-label={seekBar.label} disabled={seekBar.disabled} ref={seekSlider} onPointerDown={pressBar} onInput={(event) => player.seek(event.currentTarget.value)} />
          </span>
          <span id="time-display">{player.timeText}</span>
          <button id="mute-btn" class={lit(OVERLAY_TOGGLE, muted)} aria-label="Mute" title="Mute" onClick={press(audio.toggleMute)}><span class="material-symbol-icon">{muted ? "volume_off" : "volume_up"}</span></button>
          <span id="volume-wrap" class="volume" hidden={!audio.volumeShown.value}>
            <input
              type="range"
              id="volume-slider"
              min="0"
              max="100"
              step="1"
              value={String(audio.shownVolume.value)}
              aria-label="Volume"
              title="Volume"
              onPointerDown={pressSlider}
              onInput={(event) => audio.setVolume(Number(event.currentTarget.value))}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The player's indicator: one lasting state at a time, the first active one in the precedence order (Reconnecting…,
 * Server not compatible, Running without a library, Loading…, then a library refresh), at the player's top center, or
 * below the corner buttons on a narrow player. Nothing shows while the server asks for pairing. The live region always
 * stays in the page, so its announcements aren't lost, and the state's box renders inside it only while one shows. A
 * long state ends in an ellipsis, and a refresh's percentage, outside the text, is hidden from screen readers, so each
 * step isn't announced. A refresh shows only while the player's controls do.
 */
function PlayerIndicator() {
  const { indicator } = useApp();
  const state = indicator.value;
  return (
    <div id="player-indicator" class="player-indicator-region" role="status" aria-live="polite">
      {state ? (
        <div
          class={["player-indicator", state.warning ? "is-warning" : "", state.followsControls ? "follows-controls" : ""].filter(Boolean).join(" ")}
          data-state={state.id}
        >
          <span class={state.spins ? "material-symbol-icon spins" : "material-symbol-icon"} aria-hidden="true">{state.icon}</span>
          <span class="player-indicator-text">{state.title}</span>
          {state.progress ? (
            <>
              {" "}
              <span aria-hidden="true">{state.progress}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The volume indicator: the volume as a percentage, with Mute's icon, centered over the player while the scroll wheel
 * or a two-finger drag changes it, on a photo too. It sits outside the controls, so it shows while they're hidden, and
 * is hidden from screen readers, since the slider carries the value.
 */
function VolumeIndicator() {
  const { audio } = useApp();
  return (
    <div id="volume-indicator" class={audio.indicatorShown.value ? "volume-indicator is-shown" : "volume-indicator"} aria-hidden="true">
      <span class="material-symbol-icon">{audio.muted.value ? "volume_off" : "volume_up"}</span>
      <span id="volume-indicator-text">{`${audio.shownVolume.value}%`}</span>
    </div>
  );
}

/**
 * Opens the panel on its last tab, or closes it. Its icon shows the panel's side and whether it is open, and it is
 * orange while the panel is open. While the Filter or Tags tab holds unsaved changes, an orange dot marks it and its
 * name says so, so they aren't forgotten while the panel is closed. It takes focus back when the panel closes with
 * focus inside it.
 */
function PanelButton() {
  const { panel, unsaved } = useApp();
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    panel.attachButton(button.current);
    return () => panel.attachButton(null);
  }, []);

  const open = panel.isOpen.value;
  const held = unsaved.value.filter || unsaved.value.tags;
  const label = (open ? "Close panel" : "Open panel") + (held ? ", unsaved changes" : "");
  return (
    <button id="panel-btn" class={lit(`${OVERLAY_TOGGLE} overlay-corner-btn`, open)} aria-label={label} title={label} aria-expanded={open ? "true" : "false"} aria-controls="panel" ref={button} onClick={press(panel.toggle)}>
      <span class="material-symbol-icon">{`${panel.side.value}_panel_${open ? "close" : "open"}`}</span>
      <span class="unsaved-dot" hidden={!held}></span>
    </button>
  );
}
