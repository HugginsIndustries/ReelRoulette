import { useRef, useState } from "preact/hooks";
import { nowPlayingView } from "../playback/nowPlaying";
import { RANDOMIZATION_MODES } from "../state/appStore";
import { useApp } from "./appContext";
import { HeldButton } from "./FieldValidation";

/**
 * The top bar: logo, pairing prompt, preset, randomization mode, photo duration, and the playing file. The stylesheet
 * shows one of the logo's images, by theme and width, and each carries the name "ReelRoulette" for the heading. On a
 * phone on its side it shows only while the server asks for pairing.
 */
export function Header() {
  const { store } = useApp();
  return (
    <header class={store.pairingRequired.value ? "top-bar is-pairing" : "top-bar"}>
      <h1 class="brand">
        <img class="brand-on-dark" src="/icons/logo-lockup.svg" alt="ReelRoulette" />
        <img class="brand-on-light" src="/icons/logo-lockup-dark.svg" alt="ReelRoulette" />
        <img class="brand-icon" src="/icons/logo-icon.svg" alt="ReelRoulette" />
      </h1>
      <PairingPrompt />
      <PresetSelect />
      <RandomizationModeSelect />
      <PhotoDuration />
      <NowPlaying />
    </header>
  );
}

/** Pair is disabled while the token is empty, and the empty field is not flagged. */
function PairingPrompt() {
  const { config, connection, store } = useApp();
  const tokenInput = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(!config.pairToken?.trim());
  return (
    <div id="pair-section" class="pair-section" style={{ display: store.pairingRequired.value ? "flex" : "none" }}>
      <label class="pair-section-label"><span class="pair-section-label-hint">Pairing token</span> <input type="text" id="pair-token" placeholder="Enter token" defaultValue={config.pairToken} ref={tokenInput} onInput={(event) => setEmpty(!event.currentTarget.value.trim())} /></label>
      <HeldButton id="pair-btn" disabled={empty} heldReason={null} onClick={() => void connection.pair(tokenInput.current?.value ?? "")}>Pair</HeldButton>
    </div>
  );
}

function PresetSelect() {
  const { store } = useApp();
  const menu = store.presetMenu.value;
  return (
    <select
      id="preset-select"
      aria-label="Choose preset"
      value={menu.selectedValue}
      onChange={(event) => store.pickHeaderPreset(event.currentTarget.value)}
    >
      {menu.entries.map((entry) => (
        <option key={entry.value} value={entry.value}>{entry.label}</option>
      ))}
    </select>
  );
}

function RandomizationModeSelect() {
  const { store } = useApp();
  return (
    <select
      id="randomization-mode-select"
      aria-label="Choose randomization mode"
      value={store.randomizationMode.value}
      onChange={(event) => store.setRandomizationMode(event.currentTarget.value)}
    >
      {RANDOMIZATION_MODES.map((mode) => (
        <option key={mode.value} value={mode.value}>{mode.label}</option>
      ))}
    </select>
  );
}

function PhotoDuration() {
  const { store } = useApp();
  // Uncontrolled, so a value the store ignores stays in the field as typed.
  return (
    <div class="photo-duration-wrap">
      <label>Photo Duration: <input type="number" id="photo-duration" min="1" max="300" step="1" defaultValue={String(store.photoDurationSeconds.peek())} aria-label="Photo duration in seconds" onChange={(event) => store.setPhotoDuration(event.currentTarget.value)} /><span class="unit">s</span></label>
    </div>
  );
}

function NowPlaying() {
  const { store } = useApp();
  const view = nowPlayingView(store.current.value);
  return (
    <div id="now-playing" class="now-playing" style={{ display: view ? "block" : "none" }}>
      <span id="now-playing-name" title={view?.title}>{view?.name}</span>{" "}
      <span id="now-playing-duration" class="muted">{view?.duration}</span>
    </div>
  );
}
