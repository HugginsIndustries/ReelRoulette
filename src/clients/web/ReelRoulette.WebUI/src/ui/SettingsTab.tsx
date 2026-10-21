import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { APP_VERSION } from "../config/appVersion";
import { SHORTCUT_LINES } from "../keyboard/shortcuts";
import { POPUP_POSITIONS, type NotificationKind, type PopupPosition } from "../notifications/notifications";
import type { PanelSide } from "../panel/panelHost";
import { AMBIENT_RANGES, AMBIENT_SETTINGS, formatAmbientSetting, type AmbientSetting } from "../playback/ambient";
import { VOLUME_STEPS, type VolumeStep } from "../playback/audioStage";
import type { AutoPauseMode } from "../playback/autoPause";
import { automaticLine, TARGET_LUFS, type NormalizationTarget } from "../playback/loudnessNormalization";
import { CUSTOM_RANGES, type CompressionStrength, type CompressorValues } from "../playback/compression";
import type { HideControlsMode } from "../playback/playerControls";
import {
  advanceAfterProblem,
  boostLimitProblem,
  hideAfterProblem,
  manualTargetProblem,
  numberProblem,
  SEEK_STEPS,
  wholeNumberProblem,
  type SeekStep
} from "../settings/settings";
import type { ThemeChoice } from "../settings/theme";
import type { AutoplayMode } from "../state/appStore";
import type { FieldProblem } from "../validation/fieldValidation";
import { useApp } from "./appContext";
import { SettingTextField } from "./FieldValidation";

/** One choice of a group of radio buttons: its name, and a line under it when the name needs one. */
interface Choice<T extends string> {
  value: T;
  title: string;
  description?: string;
}

const AUTOPLAY_MODE_CHOICES: readonly Choice<AutoplayMode>[] = [
  { value: "normal", title: "Normal", description: "Photos advance after the timer; videos play to the end." },
  { value: "timer", title: "Timer", description: "Every item advances after the timer. Pausing a video holds it." }
];

const VOLUME_STEP_CHOICES: readonly Choice<`${VolumeStep}`>[] = VOLUME_STEPS.map((step) => ({ value: `${step}`, title: `${step}%` }));

const SEEK_STEP_CHOICES: readonly Choice<`${SeekStep}`>[] = SEEK_STEPS.map((step) => ({ value: `${step}`, title: step === 1 ? "1 second" : `${step} seconds` }));

/** Target loudness's choices, Automatic's line naming the library's baseline once it has loaded. */
function targetChoices(baseline: number | null): Choice<NormalizationTarget>[] {
  return [
    { value: "automatic", title: "Automatic", description: automaticLine(baseline) },
    { value: "quieter", title: "Quieter", description: `${TARGET_LUFS.quieter} LUFS` },
    { value: "standard", title: "Standard", description: `${TARGET_LUFS.standard} LUFS` },
    { value: "louder", title: "Louder", description: `${TARGET_LUFS.louder} LUFS` },
    { value: "manual", title: "Manual" }
  ];
}

/** Compression's Strength: the presets, Medium by default, and Custom. */
const STRENGTH_CHOICES: readonly Choice<CompressionStrength>[] = [
  { value: "light", title: "Light", description: "Evens out the loudest moments a little." },
  { value: "medium", title: "Medium", description: "Brings loud and quiet moments closer." },
  { value: "strong", title: "Strong", description: "Keeps loud and quiet moments close, for quiet listening." },
  { value: "custom", title: "Custom", description: "Set each value yourself." }
];

/**
 * One of Custom's values: its field's label, unit, and hint, how many of its unit make the value's, whether it takes only
 * whole numbers, and its keyboard.
 */
interface CustomField {
  key: keyof CompressorValues;
  label: string;
  unit: string;
  hint: string;
  scale: number;
  whole: boolean;
  inputMode?: "numeric" | "decimal";
}

const CUSTOM_FIELDS: readonly CustomField[] = [
  { key: "thresholdDb", label: "Threshold", unit: "dB", hint: "Lower turns down more of the sound; higher, only the loudest moments.", scale: 1, whole: false },
  { key: "ratio", label: "Ratio", unit: "to 1", hint: "Higher turns loud moments down harder.", scale: 1, whole: false, inputMode: "decimal" },
  { key: "kneeDb", label: "Knee", unit: "dB", hint: "Higher starts turning down more gradually, for a softer effect.", scale: 1, whole: false, inputMode: "decimal" },
  {
    key: "attackSeconds",
    label: "Attack",
    unit: "ms",
    hint: "Lower catches sudden loud sounds faster; higher lets their first moment through.",
    scale: 1000,
    whole: true,
    inputMode: "numeric"
  },
  { key: "releaseSeconds", label: "Release", unit: "ms", hint: "Lower brings the sound back up faster; higher sounds smoother.", scale: 1000, whole: true, inputMode: "numeric" },
  {
    key: "makeupDb",
    label: "Makeup gain",
    unit: "dB",
    hint: "Higher raises the whole sound after compression. At 0 dB, only loud moments are turned down.",
    scale: 1,
    whole: false,
    inputMode: "decimal"
  }
];

/** A Custom value in its field's unit, without a multiplication's rounding error, such as 7.000000000000001 ms. */
function customText(values: CompressorValues, field: CustomField): string {
  return String(Number((values[field.key] * field.scale).toFixed(6)));
}

/** Custom's problem for a field: outside its range, or a fraction of a ms. A ratio's range has no unit. */
function customProblem(text: string, field: CustomField): FieldProblem | null {
  const range = CUSTOM_RANGES[field.key];
  const unit = field.key === "ratio" ? "" : field.unit;
  const problem = field.whole ? wholeNumberProblem : numberProblem;
  return problem(text, range.min * field.scale, range.max * field.scale, unit);
}

const THEME_OPTIONS: readonly Choice<ThemeChoice>[] = [
  { value: "system", title: "System" },
  { value: "dark", title: "Dark" },
  { value: "light", title: "Light" }
];

const AMBIENT_LABELS: Readonly<Record<AmbientSetting, string>> = {
  rate: "Update rate",
  fade: "Fade time",
  blur: "Blur",
  dark: "Strength in the dark theme",
  light: "Strength in the light theme",
  saturation: "Saturation"
};

const POPUP_KIND_CHOICES: readonly Choice<NotificationKind>[] = [
  { value: "actions", title: "Your actions", description: "Such as Added to favorites, Filters applied, and Path copied." },
  { value: "devices", title: "Other devices", description: "Favorites, blacklist, rating, and preset changes made on another device." },
  { value: "refresh", title: "Library refresh", description: "When a refresh finishes or fails." },
  { value: "skips", title: "Skipped files", description: "When playback skips a missing file or one this browser can't play." },
  { value: "connection", title: "Connection", description: "When the connection to the server comes back, or the library can't load more." }
];

const POPUP_POSITION_LABELS: Readonly<Record<PopupPosition, string>> = {
  "bottom-center": "Bottom center",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
  "top-center": "Top center",
  "top-left": "Top left",
  "top-right": "Top right"
};

const POPUP_TIME_CHOICES: readonly Choice<string>[] = [
  { value: "3", title: "3 seconds" },
  { value: "5", title: "5 seconds" },
  { value: "10", title: "10 seconds" }
];

const HIDE_CONTROLS_CHOICES: readonly Choice<HideControlsMode>[] = [
  { value: "timeout", title: "Timeout", description: "They hide after a time with no activity." },
  { value: "click", title: "On click/tap", description: "A click or tap on the player shows or hides them." },
  { value: "never", title: "Never" }
];

const SIDE_CHOICES: readonly Choice<PanelSide>[] = [
  { value: "left", title: "Left" },
  { value: "right", title: "Right" }
];

const AUTO_PAUSE_CHOICES: readonly Choice<AutoPauseMode>[] = [
  { value: "responsive", title: "Responsive", description: "Pauses only while the panel or the admin view covers the player." },
  { value: "always", title: "Always", description: "Pauses whenever the panel opens." },
  { value: "never", title: "Never" }
];

/**
 * The panel's Settings tab: the settings kept on this device, in the mockup's sections, and Diagnostics. Each setting
 * applies as it changes, so there is no Save. Keyboard shortcuts, which later work fills, goes in the mockup's place,
 * before Diagnostics.
 */
export function SettingsTab() {
  return (
    <div id="settings-tab" class="settings-tab">
      <div class="settings-tab-header">
        <h2>Settings</h2>
      </div>
      <div id="settings-body" class="settings-body themed-scrollbar">
        <Section id="playback" title="Playback">
          <PlaybackSettings />
        </Section>
        <Section id="audio" title="Audio">
          <AudioSettings />
        </Section>
        <Section id="player-controls" title="Player controls">
          <PlayerControlsSettings />
        </Section>
        <Section id="appearance" title="Appearance">
          <AppearanceSettings />
        </Section>
        <Section id="notifications" title="Notifications">
          <NotificationSettings />
        </Section>
        <Section id="panel" title="Panel">
          <PanelSettings />
        </Section>
        <KeyboardShortcuts />
        <Section id="diagnostics" title="Diagnostics">
          <Diagnostics />
        </Section>
        <p class="setting-hint">Settings apply at once and are kept on this device.</p>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="settings-section" aria-labelledby={`settings-${id}-heading`}>
      <h3 id={`settings-${id}-heading`}>{title}</h3>
      {children}
    </section>
  );
}

/**
 * A labeled list of radio buttons, for one value, or checkboxes, for each of a set. Each is named by its choice's title
 * alone, with its line, when it has one, as its description, so a screen reader reads them apart. The group's hint,
 * when it has one, is its description. A choice may have more after it, such as the field it shows.
 */
function OptionList<T extends string>(props: {
  id: string;
  label: string;
  type: "radio" | "checkbox";
  choices: readonly Choice<T>[];
  isChecked: (value: T) => boolean;
  onChange: (value: T, checked: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
  after?: Partial<Record<T, ComponentChildren>>;
}) {
  const { id, label, type, choices, isChecked, onChange, disabled, describedBy, after } = props;
  const stacked = choices.some((choice) => choice.description);
  return (
    <>
      <span class="setting-label" id={`${id}-label`}>{label}</span>
      <div
        class={stacked ? "choice-stack" : "choice-row"}
        role={type === "radio" ? "radiogroup" : "group"}
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy}
      >
        {choices.map((choice) => {
          const input = {
            name: id,
            value: choice.value,
            checked: isChecked(choice.value),
            disabled,
            "aria-labelledby": `${id}-${choice.value}`,
            "aria-describedby": choice.description ? `${id}-${choice.value}-description` : undefined,
            onChange: (event: Event) => onChange(choice.value, (event.currentTarget as HTMLInputElement).checked)
          };
          return (
            <Fragment key={choice.value}>
              <label>
                {type === "radio" ? <input type="radio" {...input} /> : <input type="checkbox" {...input} />}
                <span>
                  <span id={`${id}-${choice.value}`}>{choice.title}</span>
                  {choice.description ? <small id={`${id}-${choice.value}-description`}>{choice.description}</small> : null}
                </span>
              </label>
              {after?.[choice.value] ?? null}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}

/** Radio buttons for one setting, as an `OptionList`, with a hint under them when it has one. */
function Choices<T extends string>(props: {
  id: string;
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
}) {
  const { value, onChange, hint, ...list } = props;
  return (
    <div class="setting">
      <OptionList
        {...list}
        type="radio"
        isChecked={(choice) => choice === value}
        onChange={(choice) => onChange(choice)}
        describedBy={hint ? `${list.id}-hint` : undefined}
      />
      {hint ? (
        <p class="setting-hint" id={`${list.id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Autoplay mode, Advance after, and Loop stops autoplay, which the store keeps and the player follows at once, and the
 * seek step, which J and L seek by.
 */
function PlaybackSettings() {
  const { store, settings } = useApp();
  return (
    <>
      <Choices
        id="settings-autoplay-mode"
        label="Autoplay mode"
        choices={AUTOPLAY_MODE_CHOICES}
        value={store.autoplayMode.value}
        onChange={store.setAutoplayMode}
        hint="The player's autoplay button turns it on and off."
      />
      <AdvanceAfter />
      <Checkbox
        id="settings-loop-stops-autoplay"
        label="Loop stops autoplay"
        hint="With Autoplay and Loop on, the item repeats and nothing advances. Turned off, autoplay goes on, and a video shorter than Advance after repeats until it advances."
        checked={store.loopStopsAutoplay.value}
        onChange={store.setLoopStopsAutoplay}
      />
      <Choices
        id="settings-seek-step"
        label="Seek step"
        choices={SEEK_STEP_CHOICES}
        value={`${settings.seekStep.value}`}
        onChange={(step) => settings.setSeekStep(Number(step) as SeekStep)}
      />
    </>
  );
}

/**
 * The volume step and Enhanced audio, which the audio stage keeps and applies at once, and Loudness normalization and
 * Compression, which its gain stage applies.
 */
function AudioSettings() {
  const { audio } = useApp();
  return (
    <>
      <Choices
        id="settings-volume-step"
        label="Volume step"
        choices={VOLUME_STEP_CHOICES}
        value={`${audio.volumeStep.value}`}
        onChange={(step) => audio.setVolumeStep(Number(step) as VolumeStep)}
        hint="Also for the scroll wheel and a two-finger drag over the player."
      />
      <Checkbox
        id="settings-enhanced-audio"
        label="Enhanced audio"
        hint="Processes audio in the app, for loudness normalization and compression."
        checked={audio.enhanced.value}
        onChange={audio.setEnhanced}
      />
      <LoudnessNormalization />
      <CompressionSetting />
    </>
  );
}

/**
 * Compression, off by default, which evens out loudness within a video, and its Compression settings, which start
 * closed: Strength, Medium by default, whose Custom shows its values only while it is chosen. They apply at once,
 * whether compression is on or off, and are kept on this device. Everything here is disabled while Enhanced audio is
 * off, since the sound then plays directly. Custom's values start at Medium's and stay while another strength is
 * chosen, and Reset to Medium puts Medium's back and shows them in the fields.
 */
function CompressionSetting() {
  const { audio, compression, panel } = useApp();
  const [resets, setResets] = useState(0);
  const off = !audio.enhanced.value;
  const settings = compression.settings.value;
  const shown = panel.isOpen.value && panel.tab.value === "settings";
  const custom = settings.strength === "custom";
  return (
    <div class="setting">
      <div class="choice-row">
        <label>
          <input
            type="checkbox"
            id="settings-compression"
            checked={compression.enabled.value}
            disabled={off}
            aria-describedby="settings-compression-hint"
            onChange={(event) => compression.setEnabled(event.currentTarget.checked)}
          />
          Compression
        </label>
      </div>
      <p class="setting-hint" id="settings-compression-hint">
        {off ? "Needs Enhanced audio." : "Evens out loudness within a video."}
      </p>
      <details class="setting-more" id="settings-compression-more">
        <summary>
          <span class="material-symbol-icon setting-more-chevron" aria-hidden="true">chevron_right</span>
          Compression settings
        </summary>
        <fieldset class="setting-fields" disabled={off}>
          <OptionList
            id="settings-compression-strength"
            label="Strength"
            type="radio"
            choices={STRENGTH_CHOICES}
            isChecked={(strength) => strength === settings.strength}
            disabled={off}
            onChange={(strength) => compression.setStrength(strength)}
            after={{
              custom: (
                <div class="setting-sub" id="settings-compression-custom" hidden={!custom}>
                  {CUSTOM_FIELDS.map((field) => (
                    <Fragment key={field.key}>
                      <label class="setting-label" for={`settings-compression-${field.key}`}>
                        {field.label}
                      </label>
                      <div class="filter-row">
                        {/* Threshold uses the full keyboard, since the numeric keypads on iOS have no minus key. */}
                        <SettingTextField
                          id={`settings-compression-${field.key}`}
                          class="number-field"
                          inputMode={field.inputMode}
                          shown={shown && custom}
                          revision={resets}
                          describedBy={`settings-compression-${field.key}-hint`}
                          saved={() => customText(compression.settings.peek().custom, field)}
                          problemOf={(text) => customProblem(text, field)}
                          save={(text) => compression.updateCustom({ [field.key]: Number(text.trim()) / field.scale })}
                        />
                        <span>{field.unit}</span>
                      </div>
                      <p class="setting-hint" id={`settings-compression-${field.key}-hint`}>
                        {field.hint}
                      </p>
                    </Fragment>
                  ))}
                  <button
                    class="btn"
                    type="button"
                    id="settings-compression-reset"
                    disabled={off}
                    onClick={() => {
                      compression.resetCustom();
                      setResets((count) => count + 1);
                    }}
                  >
                    Reset to Medium
                  </button>
                </div>
              )
            }}
          />
        </fieldset>
      </details>
    </div>
  );
}

/**
 * Loudness normalization, on by default, and its Loudness normalization settings, which start closed: Target loudness,
 * the boost limit, and Allow limiting, which apply at once, whether normalization is on or off, and are kept on this
 * device. Everything here is disabled while Enhanced audio is off, since the sound then plays directly. Manual's target
 * shows only while Manual is chosen. Reset to defaults puts the settings back, leaving normalization on or off, and the
 * fields show them.
 */
function LoudnessNormalization() {
  const { audio, normalization, panel } = useApp();
  const [resets, setResets] = useState(0);
  const off = !audio.enhanced.value;
  const settings = normalization.settings.value;
  const shown = panel.isOpen.value && panel.tab.value === "settings";
  const manual = settings.target === "manual";
  return (
    <div class="setting">
      <div class="choice-row">
        <label>
          <input
            type="checkbox"
            id="settings-loudness"
            checked={normalization.enabled.value}
            disabled={off}
            aria-describedby="settings-loudness-hint"
            onChange={(event) => normalization.setEnabled(event.currentTarget.checked)}
          />
          Loudness normalization
        </label>
      </div>
      <p class="setting-hint" id="settings-loudness-hint">
        {off ? "Needs Enhanced audio." : "Evens out loudness between videos."}
      </p>
      <details class="setting-more" id="settings-loudness-more">
        <summary>
          <span class="material-symbol-icon setting-more-chevron" aria-hidden="true">chevron_right</span>
          Loudness normalization settings
        </summary>
        <fieldset class="setting-fields" disabled={off}>
          <OptionList
            id="settings-loudness-target"
            label="Target loudness"
            type="radio"
            choices={targetChoices(normalization.baseline.value)}
            isChecked={(target) => target === settings.target}
            disabled={off}
            onChange={(target) => normalization.updateSettings({ target })}
            after={{
              manual: (
                <div class="setting-sub" id="settings-loudness-manual" hidden={!manual}>
                  <label class="setting-label" for="settings-loudness-manual-target">Target</label>
                  <div class="filter-row">
                    {/* The full keyboard, since the numeric keypads on iOS have no minus key. */}
                    <SettingTextField
                      id="settings-loudness-manual-target"
                      class="number-field"
                      shown={shown && manual}
                      revision={resets}
                      saved={() => String(normalization.settings.peek().manualTarget)}
                      problemOf={manualTargetProblem}
                      save={(text) => normalization.updateSettings({ manualTarget: Number(text.trim()) })}
                    />
                    <span>LUFS</span>
                  </div>
                </div>
              )
            }}
          />
          <label class="setting-label" for="settings-loudness-boost">Boost quiet videos by up to</label>
          <div class="filter-row">
            <SettingTextField
              id="settings-loudness-boost"
              class="number-field"
              inputMode="numeric"
              shown={shown}
              revision={resets}
              saved={() => String(normalization.settings.peek().boostLimit)}
              problemOf={boostLimitProblem}
              save={(text) => normalization.updateSettings({ boostLimit: Number(text.trim()) })}
            />
            <span>dB</span>
          </div>
          <div class="choice-stack">
            <label>
              <input
                type="checkbox"
                id="settings-loudness-limiting"
                checked={settings.allowLimiting}
                disabled={off}
                aria-labelledby="settings-loudness-limiting-label"
                aria-describedby="settings-loudness-limiting-description"
                onChange={(event) => normalization.updateSettings({ allowLimiting: event.currentTarget.checked })}
              />
              <span>
                <span id="settings-loudness-limiting-label">Allow limiting</span>
                <small id="settings-loudness-limiting-description">Lets quiet videos with loud moments get louder by limiting those moments.</small>
              </span>
            </label>
          </div>
          <button
            class="btn"
            type="button"
            id="settings-loudness-reset"
            disabled={off}
            onClick={() => {
              normalization.resetSettings();
              setResets((count) => count + 1);
            }}
          >
            Reset to defaults
          </button>
        </fieldset>
      </details>
    </div>
  );
}

/**
 * The timer both autoplay modes use, and how long a photo shows. A value that is not a whole number from 1 to 3600 is
 * flagged and not kept, and the one in use stays; a valid one is saved as a setting's field saves it.
 */
function AdvanceAfter() {
  const { store, panel } = useApp();
  return (
    <div class="setting">
      <label class="setting-label" for="settings-advance-after">Advance after</label>
      <div class="filter-row">
        <SettingTextField
          id="settings-advance-after"
          class="number-field"
          inputMode="numeric"
          shown={panel.isOpen.value && panel.tab.value === "settings"}
          saved={() => String(store.advanceAfterSeconds.peek())}
          problemOf={advanceAfterProblem}
          save={(text) => store.setAdvanceAfter(Number(text.trim()))}
        />
        <span>seconds</span>
      </div>
    </div>
  );
}

/**
 * Hide player controls, which the player's controls follow at once. Under Timeout, Hide after, a whole number of seconds
 * from 1 to 30 saved as a setting's field saves it, and Keep visible while paused show; they keep their values while
 * another mode is chosen.
 */
function PlayerControlsSettings() {
  const { playerControls: controls, panel } = useApp();
  const timeout = controls.mode.value === "timeout";
  return (
    <div class="setting">
      <OptionList
        id="settings-hide-controls"
        label="Hide player controls"
        type="radio"
        choices={HIDE_CONTROLS_CHOICES}
        isChecked={(mode) => mode === controls.mode.value}
        onChange={(mode) => controls.setMode(mode)}
        after={{
          timeout: (
            <div class="setting-sub" id="settings-hide-timeout" hidden={!timeout}>
              <label class="setting-label" for="settings-hide-after">Hide after</label>
              <div class="filter-row">
                <SettingTextField
                  id="settings-hide-after"
                  class="number-field"
                  inputMode="numeric"
                  shown={panel.isOpen.value && panel.tab.value === "settings" && timeout}
                  saved={() => String(controls.hideAfterSeconds.peek())}
                  problemOf={hideAfterProblem}
                  save={(text) => controls.setHideAfter(Number(text.trim()))}
                />
                <span>seconds</span>
              </div>
              <div class="choice-row">
                <label>
                  <input
                    type="checkbox"
                    id="settings-keep-while-paused"
                    checked={controls.keepWhilePaused.value}
                    onChange={(event) => controls.setKeepWhilePaused(event.currentTarget.checked)}
                  />
                  Keep visible while paused
                </label>
              </div>
            </div>
          )
        }}
      />
    </div>
  );
}

/** A setting that is on or off, with a hint under it, when it has one, as its description. */
function Checkbox(props: { id: string; label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const { id, label, hint, checked, onChange } = props;
  return (
    <div class="setting">
      <div class="choice-row">
        <label>
          <input type="checkbox" id={id} checked={checked} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(event) => onChange(event.currentTarget.checked)} />
          {label}
        </label>
      </div>
      {hint ? (
        <p class="setting-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AppearanceSettings() {
  const { settings } = useApp();
  return (
    <>
      <Choices id="settings-theme" label="Theme" choices={THEME_OPTIONS} value={settings.theme.value} onChange={settings.setTheme} />
      <AmbientMode />
      <Checkbox
        id="settings-tile-names"
        label="Show file names on tiles"
        hint="Hovering a tile shows its name either way."
        checked={settings.tileNames.value}
        onChange={settings.setTileNames}
      />
    </>
  );
}

/**
 * Ambient mode, and its Ambient mode settings, which start closed. Each setting's slider shows its value, applies as it
 * moves, whether ambient mode is on or off, and is kept on this device; Reset to defaults puts them all back. A slider
 * is named by its label alone, and its value, as shown, is its value text.
 */
function AmbientMode() {
  const { settings } = useApp();
  const tuning = settings.ambientTuning.value;
  return (
    <div class="setting">
      <div class="choice-row">
        <label>
          <input type="checkbox" id="settings-ambient" checked={settings.ambient.value} aria-describedby="settings-ambient-hint" onChange={(event) => settings.setAmbient(event.currentTarget.checked)} />
          Ambient mode
        </label>
      </div>
      <p class="setting-hint" id="settings-ambient-hint">
        A soft glow of the picture's colors fills the black space around it.
      </p>
      <details class="setting-more" id="settings-ambient-more">
        <summary>
          <span class="material-symbol-icon setting-more-chevron" aria-hidden="true">chevron_right</span>
          Ambient mode settings
        </summary>
        <div class="setting-sliders">
          {AMBIENT_SETTINGS.map((setting) => {
            const id = `settings-ambient-${setting}`;
            const { min, max, step } = AMBIENT_RANGES[setting];
            const shown = formatAmbientSetting(setting, tuning[setting]);
            return (
              <Fragment key={setting}>
                <label for={id}>
                  <span id={`${id}-label`}>{AMBIENT_LABELS[setting]}</span>
                  <output for={id}>{shown}</output>
                </label>
                <input
                  type="range"
                  id={id}
                  min={min}
                  max={max}
                  step={step}
                  value={tuning[setting]}
                  aria-labelledby={`${id}-label`}
                  aria-valuetext={shown}
                  onInput={(event) => settings.setAmbientTuning({ [setting]: Number(event.currentTarget.value) })}
                />
              </Fragment>
            );
          })}
          <button class="btn" type="button" id="settings-ambient-reset" onClick={settings.resetAmbientTuning}>
            Reset to defaults
          </button>
        </div>
      </details>
    </div>
  );
}

/**
 * Show popups and its Popup settings: which kinds pop up, where, whether in fullscreen, and for how long, which the
 * notifications service keeps and applies at once. Popup settings starts closed, and its controls are disabled while
 * Show popups is off, each one too, besides their fieldset. Changing where or how long shows a sample popup. The bell's
 * list's Notification settings opens Popup settings and moves to Show popups.
 */
function NotificationSettings() {
  const { notifications, settings } = useApp();
  const current = notifications.settings.value;
  const more = useRef<HTMLDetailsElement>(null);
  const showPopups = useRef<HTMLInputElement>(null);
  // A request made before this rendered was for an earlier page.
  const request = settings.popupSettingsRequest.value;
  const handled = useRef(request);
  useEffect(() => {
    if (request === handled.current) {
      return;
    }
    handled.current = request;
    more.current!.open = true;
    showPopups.current!.closest("section")?.scrollIntoView?.({ block: "start" });
    showPopups.current!.focus({ preventScroll: true });
  }, [request]);

  const off = !current.popups;
  return (
    <div class="setting">
      <div class="choice-row">
        <label>
          <input type="checkbox" id="settings-popups" ref={showPopups} checked={current.popups} aria-describedby="settings-popups-hint" onChange={(event) => notifications.updateSettings({ popups: event.currentTarget.checked })} />
          Show popups
        </label>
      </div>
      <p class="setting-hint" id="settings-popups-hint">
        Short messages over the player. The bell on the player lists them either way.
      </p>
      <details class="setting-more" id="settings-popups-more" ref={more}>
        <summary>
          <span class="material-symbol-icon setting-more-chevron" aria-hidden="true">chevron_right</span>
          Popup settings
        </summary>
        <fieldset class="setting-fields" disabled={off}>
          <OptionList
            id="settings-popup-kinds"
            label="Show popups for"
            type="checkbox"
            choices={POPUP_KIND_CHOICES}
            isChecked={(kind) => current.kinds[kind]}
            disabled={off}
            onChange={(kind, on) => notifications.updateSettings({ kinds: { [kind]: on } })}
          />
          <label class="setting-label" for="settings-popup-position">Position</label>
          <select
            class="ctl"
            id="settings-popup-position"
            value={current.position}
            disabled={off}
            onChange={(event) => {
              notifications.updateSettings({ position: event.currentTarget.value as PopupPosition });
              notifications.preview();
            }}
          >
            {POPUP_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {POPUP_POSITION_LABELS[position]}
              </option>
            ))}
          </select>
          <div class="choice-row">
            <label>
              <input type="checkbox" id="settings-popup-fullscreen" checked={current.fullscreen} disabled={off} onChange={(event) => notifications.updateSettings({ fullscreen: event.currentTarget.checked })} />
              Show in fullscreen
            </label>
          </div>
          <OptionList
            id="settings-popup-time"
            label="Show for"
            type="radio"
            choices={POPUP_TIME_CHOICES}
            isChecked={(seconds) => Number(seconds) === current.seconds}
            disabled={off}
            onChange={(seconds) => {
              notifications.updateSettings({ seconds: Number(seconds) });
              notifications.preview();
            }}
          />
          <p class="setting-hint">Pointing at a popup keeps it. A warning stays until you close it.</p>
        </fieldset>
      </details>
    </div>
  );
}

function PanelSettings() {
  const { panel, settings } = useApp();
  return (
    <>
      <Choices id="settings-side" label="Side" choices={SIDE_CHOICES} value={panel.side.value} onChange={panel.setSide} />
      <Choices id="settings-auto-pause" label="Auto-Pause" choices={AUTO_PAUSE_CHOICES} value={settings.autoPauseMode.value} onChange={settings.setAutoPauseMode} />
    </>
  );
}

/**
 * The keyboard shortcuts, a section that opens from its heading and starts closed. H opens it, moves to it, and puts
 * focus on its heading, as the bell's Notification settings does for Popup settings.
 */
function KeyboardShortcuts() {
  const { settings } = useApp();
  const more = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  // A request made before this rendered was for an earlier page.
  const request = settings.shortcutsRequest.value;
  const handled = useRef(request);
  useEffect(() => {
    if (request === handled.current) {
      return;
    }
    handled.current = request;
    more.current!.open = true;
    more.current!.closest("section")?.scrollIntoView?.({ block: "start" });
    summary.current!.focus({ preventScroll: true });
  }, [request]);

  return (
    <section class="settings-section" aria-labelledby="settings-shortcuts-heading">
      <details class="setting-more shortcuts-more" id="settings-shortcuts" ref={more}>
        <summary ref={summary}>
          <span class="material-symbol-icon setting-more-chevron" aria-hidden="true">chevron_right</span>
          <h3 id="settings-shortcuts-heading">Keyboard shortcuts</h3>
        </summary>
        <dl class="shortcut-list">
          {SHORTCUT_LINES.map((line) => (
            <Fragment key={line.text}>
              <dt>
                {line.keys.map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 ? ` ${line.join} ` : null}
                    <kbd>{key}</kbd>
                  </Fragment>
                ))}
              </dt>
              <dd>{line.text}</dd>
            </Fragment>
          ))}
        </dl>
        <p class="setting-hint">Shortcuts do nothing while you type in a text field.</p>
      </details>
    </section>
  );
}

/** What identifies this page in `last.log`, shown in full, and the server's and the app's versions. */
function Diagnostics() {
  const { store } = useApp();
  const { identity } = store;
  const server = store.serverVersion.value;
  const rows: [string, string][] = [
    ["Client", identity.clientId],
    ["Session", identity.sessionId],
    ["Client type", identity.clientType],
    ["Device name", identity.deviceName],
    ["Server", server ? `${server.version || "Unknown"} (API ${server.apiVersion || "unknown"})` : "Unknown"],
    ["ReelRoulette", APP_VERSION]
  ];
  return (
    <dl class="diag">
      {rows.map(([term, value]) => (
        <Fragment key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
