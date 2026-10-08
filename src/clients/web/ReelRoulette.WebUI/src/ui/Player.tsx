import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { createMediaGestures } from "../playback/mediaGestures";
import { useApp } from "./appContext";

/** The video's boolean attributes, present and empty as in the page's HTML. */
const VIDEO_FLAGS: Record<string, string> = {
  playsinline: "",
  "webkit-playsinline": "",
  disablepictureinpicture: "",
  disableremoteplayback: ""
};

const OVERLAY_BUTTON = "overlay-btn icon-glyph-base icon-glyph-button";
const OVERLAY_TOGGLE = "overlay-btn icon-glyph-base icon-glyph-toggle overlay-toggle";

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
 * The media area: the video and photo, the empty state, and the controls over them. The player sets the media
 * elements' sources and which of them shows itself, so their `style` and the seek slider's value are rendered
 * once and never changed here, and the video element is never replaced or moved.
 */
export function Player() {
  const { store, player, fullscreen, library } = useApp();
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const emptyState = useRef<HTMLDivElement>(null);
  const seekRow = useRef<HTMLDivElement>(null);
  const seekSlider = useRef<HTMLInputElement>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const gestures = useMemo(
    () =>
      createMediaGestures({
        previous: player.previous,
        next: player.next,
        hasCurrent: () => !!store.current.peek(),
        toggleControls: () => setControlsVisible((visible) => !visible)
      }),
    []
  );

  useLayoutEffect(() => {
    player.attach({
      video: video.current!,
      photo: photo.current!,
      emptyState: emptyState.current!,
      seekRow: seekRow.current!,
      seekSlider: seekSlider.current!
    });

    // Passive, which JSX cannot set, so scrolling never waits for them.
    const area = container.current!;
    const onTouchStart = (event: TouchEvent) => {
      const startsOnControls = !!(event.target as Element | null)?.closest?.("#overlay-controls");
      gestures.touchStart(startsOnControls, event.touches?.[0]);
    };
    const onTouchEnd = (event: TouchEvent) => gestures.touchEnd(event.changedTouches?.[0]);
    area.addEventListener("touchstart", onTouchStart, { passive: true });
    area.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchend", onTouchEnd);
      player.detach();
    };
  }, []);

  function onAreaClick(event: MouseEvent): void {
    if (gestures.takeFollowingClick()) {
      return;
    }

    event.stopPropagation();
    if (!store.current.peek()) {
      void player.pickRandom();
      return;
    }

    setControlsVisible((visible) => !visible);
  }

  const mute = player.muteButton.value;
  return (
    <div id="media-container" class={controlsVisible ? "media-container controls-visible" : "media-container"} ref={container} onClick={onAreaClick}>
      <video
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
      <div id="empty-state" class="empty-state" ref={emptyState}>Click here to play (choose a preset or open Filter…)</div>
      <div id="overlay-controls" class="overlay-controls" onTouchStart={stopPropagation} onTouchMove={stopPropagation} onTouchEnd={stopPropagation} onClick={stopPropagation}>
        <button id="library-open-btn" class={`${OVERLAY_BUTTON} overlay-corner-btn`} aria-label="Library" title="Library" onClick={press(library.open)}><span class="material-symbol-icon">browse</span></button>
        <button id="filter-edit-btn" class={`${OVERLAY_BUTTON} overlay-corner-btn`} aria-label="Select filters" title="Select filters…" onClick={press(() => store.openOverlay("filter"))}><span class="material-symbol-icon">filter_alt</span></button>
        <button id="tag-edit-btn" class={`${OVERLAY_BUTTON} overlay-corner-btn`} aria-label="Edit Tags" title="Edit Tags" onClick={press(() => store.openOverlay("tagEditor"))}><span class="material-symbol-icon">tag</span></button>
        <button id="favorite-btn" class={lit(`${OVERLAY_TOGGLE} overlay-corner-btn`, player.favorite.value)} aria-label="Favorite" title="Favorite" onClick={press(player.toggleFavorite)}><span class="material-symbol-icon">favorite</span></button>
        <button id="blacklist-btn" class={lit(`${OVERLAY_TOGGLE} overlay-corner-btn`, player.blacklisted.value)} aria-label="Blacklist" title="Blacklist" onClick={press(player.toggleBlacklist)}><span class="material-symbol-icon">thumb_down</span></button>
        <div class="overlay-controls-row overlay-controls-transport">
          <button id="prev-btn" class={OVERLAY_BUTTON} aria-label="Previous" title="Previous" onClick={press(player.previous)}><span class="material-symbol-icon">skip_previous</span></button>
          <button id="play-btn" class={`${OVERLAY_BUTTON} overlay-btn-play`} aria-label="Play/Pause" title="Play/Pause" onClick={press(player.playOrPause)}><span class="material-symbol-icon">{player.showsPause.value ? "pause" : "play_arrow"}</span></button>
          <button id="next-btn" class={OVERLAY_BUTTON} aria-label="Next" title="Next" onClick={press(player.next)}><span class="material-symbol-icon">skip_next</span></button>
          <button id="mute-btn" class={lit(OVERLAY_TOGGLE, mute.active)} aria-label="Mute" title="Mute" disabled={mute.disabled} onClick={press(player.toggleMute)}><span class="material-symbol-icon">{mute.active ? "volume_off" : "volume_up"}</span></button>
          <button id="loop-btn" class={lit(OVERLAY_TOGGLE, store.loop.value)} aria-label="Loop" title="Loop" onClick={press(player.toggleLoop)}><span class="material-symbol-icon">repeat_one</span></button>
          <button id="autoplay-btn" class={lit(OVERLAY_TOGGLE, store.autoplay.value)} aria-label="Autoplay" title="Autoplay" onClick={press(player.toggleAutoplay)}><span class="material-symbol-icon">autoplay</span></button>
          <button id="fullscreen-btn" class={OVERLAY_BUTTON} aria-label="Fullscreen" title="Fullscreen" onClick={press(fullscreen.toggle)}><span class="material-symbol-icon">fullscreen</span></button>
        </div>
        <div id="seek-row" class="overlay-seek-row" style="display:none" ref={seekRow}>
          <input type="range" id="seek-slider" min="0" max="100" defaultValue="0" aria-label="Seek" ref={seekSlider} onInput={(event) => player.seek(event.currentTarget.value)} />
          <span id="time-display">{player.timeText}</span>
        </div>
      </div>
    </div>
  );
}
