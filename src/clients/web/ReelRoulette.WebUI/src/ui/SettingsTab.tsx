import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { APP_VERSION } from "../config/appVersion";
import { POPUP_POSITIONS, type NotificationKind, type PopupPosition } from "../notifications/notifications";
import type { PanelSide } from "../panel/panelHost";
import { AMBIENT_RANGES, AMBIENT_SETTINGS, formatAmbientSetting, type AmbientSetting } from "../playback/ambient";
import type { AutoPauseMode } from "../playback/autoPause";
import { advanceAfterProblem } from "../settings/settings";
import type { ThemeChoice } from "../settings/theme";
import { useApp } from "./appContext";
import { SettingTextField } from "./FieldValidation";

/** One choice of a group of radio buttons: its name, and a line under it when the name needs one. */
interface Choice<T extends string> {
  value: T;
  title: string;
  description?: string;
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
  { value: "devices", title: "Other devices", description: "Favorites and blacklist changes made on another device." },
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
 * applies as it changes, so there is no Save. Sections that later work fills go in the mockup's places: Audio and
 * Player controls after Playback, and Keyboard shortcuts before Diagnostics.
 */
export function SettingsTab() {
  return (
    <div id="settings-tab" class="settings-tab">
      <div class="settings-tab-header">
        <h2>Settings</h2>
      </div>
      <div id="settings-body" class="settings-body themed-scrollbar">
        <Section id="playback" title="Playback">
          <AdvanceAfter />
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
 * alone, with its line, when it has one, as its description, so a screen reader reads them apart.
 */
function OptionList<T extends string>(props: {
  id: string;
  label: string;
  type: "radio" | "checkbox";
  choices: readonly Choice<T>[];
  isChecked: (value: T) => boolean;
  onChange: (value: T, checked: boolean) => void;
  disabled?: boolean;
}) {
  const { id, label, type, choices, isChecked, onChange, disabled } = props;
  const stacked = choices.some((choice) => choice.description);
  return (
    <>
      <span class="setting-label" id={`${id}-label`}>{label}</span>
      <div class={stacked ? "choice-stack" : "choice-row"} role={type === "radio" ? "radiogroup" : "group"} aria-labelledby={`${id}-label`}>
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
            <label key={choice.value}>
              {type === "radio" ? <input type="radio" {...input} /> : <input type="checkbox" {...input} />}
              <span>
                <span id={`${id}-${choice.value}`}>{choice.title}</span>
                {choice.description ? <small id={`${id}-${choice.value}-description`}>{choice.description}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

/** Radio buttons for one setting, as an `OptionList`. */
function Choices<T extends string>(props: {
  id: string;
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { value, onChange, ...list } = props;
  return (
    <div class="setting">
      <OptionList {...list} type="radio" isChecked={(choice) => choice === value} onChange={(choice) => onChange(choice)} />
    </div>
  );
}

/**
 * How long a photo shows, the photo duration. A value that is not a whole number from 1 to 300 is flagged and not
 * kept, and the one in use stays; a valid one is saved as a setting's field saves it.
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
          saved={() => String(store.photoDurationSeconds.peek())}
          problemOf={advanceAfterProblem}
          save={(text) => store.setPhotoDuration(Number(text.trim()))}
        />
        <span>seconds</span>
      </div>
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
