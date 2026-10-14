import { Fragment, type ComponentChildren } from "preact";
import { APP_VERSION } from "../config/appVersion";
import type { PanelSide } from "../panel/panelHost";
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
 * Player controls after Playback, Notifications between Appearance and Panel, and Keyboard shortcuts before
 * Diagnostics.
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
 * Radio buttons for one setting. Each button is named by its choice's title alone, with its line, when it has one, as
 * its description, so a screen reader reads them apart.
 */
function Choices<T extends string>(props: {
  id: string;
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { id, label, choices, value, onChange } = props;
  const stacked = choices.some((choice) => choice.description);
  return (
    <div class="setting">
      <span class="setting-label" id={`${id}-label`}>{label}</span>
      <div class={stacked ? "choice-stack" : "choice-row"} role="radiogroup" aria-labelledby={`${id}-label`}>
        {choices.map((choice) => (
          <label key={choice.value}>
            <input
              type="radio"
              name={id}
              value={choice.value}
              checked={choice.value === value}
              aria-labelledby={`${id}-${choice.value}`}
              aria-describedby={choice.description ? `${id}-${choice.value}-description` : undefined}
              onChange={() => onChange(choice.value)}
            />
            <span>
              <span id={`${id}-${choice.value}`}>{choice.title}</span>
              {choice.description ? <small id={`${id}-${choice.value}-description`}>{choice.description}</small> : null}
            </span>
          </label>
        ))}
      </div>
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
