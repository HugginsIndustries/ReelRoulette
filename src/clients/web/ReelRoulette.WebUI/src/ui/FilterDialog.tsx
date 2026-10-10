import type { FilterDialogTab, FilterDialogView } from "../filter/filterDialog";
import {
  filterTagCategories,
  sourceLabel,
  type FilterTagCategory,
  type FilterTagChip,
  type GeneralDraft
} from "../filter/filterDialogModel";
import { AUDIO_FILTER, MEDIA_TYPE_FILTER, TAG_MATCH_MODE } from "../filter/filterStateModel";
import { useApp } from "./appContext";

// The `data-*` attributes keep the markup as it was before the dialog moved to a component; nothing reads them.

const TABS: readonly { tab: FilterDialogTab; label: string; display: string }[] = [
  { tab: "general", label: "General", display: "block" },
  { tab: "tags", label: "Tags", display: "block" },
  { tab: "presets", label: "Presets", display: "flex" }
];

type BasicField = "onlyNeverPlayed" | "onlyKnownDuration" | "onlyKnownLoudness";

interface BasicFilter {
  id: string;
  label: string;
  checked(draft: GeneralDraft): boolean;
  change(checked: boolean): Partial<Omit<GeneralDraft, "sourceChecked">>;
}

function booleanFilter(id: string, field: BasicField, label: string): BasicFilter {
  return { id, label, checked: (draft) => draft[field], change: (checked) => ({ [field]: checked }) };
}

// The two flag checkboxes show one mode each. A mode they cannot show leaves its checkbox clear, and stays in the
// draft until the checkbox is used.
const BASIC_FILTERS: readonly BasicFilter[] = [
  {
    id: "filter-fav-only",
    label: "Favorites only",
    checked: (draft) => draft.favoritesMode === "only",
    change: (checked) => ({ favoritesMode: checked ? "only" : "off" })
  },
  {
    id: "filter-excl-bl",
    label: "Exclude blacklisted",
    checked: (draft) => draft.blacklistedMode === "excluded",
    change: (checked) => ({ blacklistedMode: checked ? "excluded" : "off" })
  },
  booleanFilter("filter-never-played", "onlyNeverPlayed", "Only never played"),
  booleanFilter("filter-known-dur", "onlyKnownDuration", "Only videos with known duration"),
  booleanFilter("filter-known-loud", "onlyKnownLoudness", "Only videos with known loudness")
];

const MEDIA_TYPES = [
  { value: MEDIA_TYPE_FILTER.All, label: "All (Videos and Photos)" },
  { value: MEDIA_TYPE_FILTER.VideosOnly, label: "Videos only" },
  { value: MEDIA_TYPE_FILTER.PhotosOnly, label: "Photos only" }
] as const;

const AUDIO_FILTERS = [
  { value: AUDIO_FILTER.PlayAll, label: "All videos" },
  { value: AUDIO_FILTER.WithAudioOnly, label: "Only videos with audio" },
  { value: AUDIO_FILTER.WithoutAudioOnly, label: "Only videos without audio" }
] as const;

/** Before the dialog first opens, the panels keep the page's starting markup, where only General has no style. */
function panelStyle(shown: FilterDialogTab | null, panel: (typeof TABS)[number]) {
  if (shown === null) {
    return panel.tab === "general" ? undefined : { display: "none" };
  }
  return { display: shown === panel.tab ? panel.display : "none" };
}

/**
 * The filter dialog. It shows only while open, and keeps its panels while closed. The panels are empty until it
 * first opens.
 */
export function FilterDialog() {
  const { filterDialog } = useApp();
  const view = filterDialog.view.value;
  const shown = filterDialog.tab.value;
  const active = shown ?? "general";
  const [general, tags, presets] = TABS;
  return (
    <div id="filter-dialog" class="filter-dialog" style={{ display: filterDialog.isOpen.value ? "flex" : "none" }}>
      <div class="filter-dialog-header">
        <h2 id="filter-dialog-heading">{view ? view.heading : "Preset: None"}</h2>
        <div class="filter-dialog-actions">
          <button id="filter-dialog-refresh-btn" class="icon-glyph-base icon-glyph-button" type="button" title="Refresh" aria-label="Refresh" onClick={() => void filterDialog.refresh()}><span class="material-symbol-icon">refresh</span></button>
          <button id="filter-dialog-close-btn" class="icon-glyph-base icon-glyph-button" type="button" title="Close" aria-label="Close" onClick={() => filterDialog.close()}><span class="material-symbol-icon">close</span></button>
        </div>
      </div>
      <div class="filter-dialog-tabstrip" role="tablist">
        {TABS.map(({ tab, label }) => (
          <button key={tab} type="button" class={tab === active ? "filter-tab is-active" : "filter-tab"} role="tab" data-filter-tab={tab} aria-selected={tab === active ? "true" : "false"} onClick={() => filterDialog.showTab(tab)}>{label}</button>
        ))}
      </div>
      <div class="filter-dialog-body themed-scrollbar">
        <div id="filter-panel-general" class="filter-panel" style={panelStyle(shown, general!)}>{view ? <GeneralPanel view={view} /> : null}</div>
        <div id="filter-panel-tags" class="filter-panel" style={panelStyle(shown, tags!)}>{view ? <TagsPanel view={view} /> : null}</div>
        <div id="filter-panel-presets" class="filter-panel" style={panelStyle(shown, presets!)}>{view ? <PresetsPanel view={view} /> : null}</div>
      </div>
      <div class="filter-dialog-footer">
        <button id="filter-clear-all-btn" type="button" onClick={() => filterDialog.clearAll()}>Clear all filters</button>
        <button id="filter-cancel-btn" type="button" onClick={() => filterDialog.close()}>Cancel</button>
        <button id="filter-apply-btn" type="button" class={view?.pending ? "has-pending" : undefined} onClick={() => void filterDialog.apply()}>{view?.pending ? "Apply*" : "Apply"}</button>
      </div>
    </div>
  );
}

function GeneralPanel({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const draft = view.general;
  return (
    <>
      <div class="filter-section">
        <h3>Basic Filters</h3>
        <div class="filter-stack">
          {BASIC_FILTERS.map(({ id, label, checked, change }) => (
            <label key={id}><input type="checkbox" id={id} checked={checked(draft)} onChange={(event) => filterDialog.changeGeneral(change(event.currentTarget.checked))} /> {label}</label>
          ))}
        </div>
      </div>
      <div class="filter-section">
        <h3>Media Type</h3>
        <div class="filter-stack">
          {MEDIA_TYPES.map(({ value, label }) => (
            <label key={value}><input type="radio" name="filter-media-type" value={String(value)} checked={draft.mediaTypeFilter === value} onChange={() => filterDialog.changeGeneral({ mediaTypeFilter: value })} /> {label}</label>
          ))}
        </div>
      </div>
      <div class="filter-section">
        <h3>Sources (Client Filter)</h3>
        <p class="filter-hint">Checked sources are included. If all are checked, no source restriction is stored.</p>
        <div class="filter-stack">
          {view.sources.length > 0 ? (
            view.sources.map((source, index) => (
              <label key={index}><input type="checkbox" id={`filter-src-${index}`} data-source-id={source.id} checked={draft.sourceChecked[index]} disabled={source.isEnabled === false} onChange={(event) => filterDialog.checkSource(index, event.currentTarget.checked)} /> {sourceLabel(source)}</label>
            ))
          ) : (
            <span class="filter-hint">No sources returned from server.</span>
          )}
        </div>
      </div>
      <div class="filter-section">
        <h3>Audio Filter</h3>
        <div class="filter-stack">
          {AUDIO_FILTERS.map(({ value, label }) => (
            <label key={value}><input type="radio" name="filter-audio" value={String(value)} checked={draft.audioFilter === value} onChange={() => filterDialog.changeGeneral({ audioFilter: value })} /> {label}</label>
          ))}
        </div>
      </div>
      <div class="filter-section">
        <h3>Duration Filter</h3>
        <div class="filter-stack">
          <DurationRow which="min" draft={draft} />
          <DurationRow which="max" draft={draft} />
        </div>
      </div>
    </>
  );
}

/**
 * A duration field and its No minimum or No maximum box. The field's text follows each keystroke, and the working
 * filter takes it when the field changes, so Apply's star appears when the user leaves the field.
 */
function DurationRow({ which, draft }: { which: "min" | "max"; draft: GeneralDraft }) {
  const { filterDialog } = useApp();
  const min = which === "min";
  const text = min ? draft.minText : draft.maxText;
  const none = min ? draft.noMin : draft.noMax;
  return (
    <div class="filter-row">
      <span style="min-width:3rem">{min ? "Min" : "Max"}</span>
      <input
        type="text"
        id={min ? "filter-min-dur-text" : "filter-max-dur-text"}
        placeholder="HH:MM:SS or MM:SS"
        value={text}
        disabled={none}
        onInput={(event) => filterDialog.typeDuration(which, event.currentTarget.value)}
        onChange={(event) =>
          filterDialog.changeGeneral(min ? { minText: event.currentTarget.value } : { maxText: event.currentTarget.value })
        }
      />
      <label><input type="checkbox" id={min ? "filter-no-min-dur" : "filter-no-max-dur"} checked={none} onChange={(event) => filterDialog.changeGeneral(min ? { noMin: event.currentTarget.checked } : { noMax: event.currentTarget.checked })} /> {min ? "No minimum" : "No maximum"}</label>
    </div>
  );
}

function TagsPanel({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const categories = filterTagCategories(view.tagModel, view.working, view.collapsed);
  if (categories.length === 0) {
    return <p class="filter-hint">No tags available. Use Edit tags to create tags.</p>;
  }
  const globalAnd = view.working.globalMatchMode !== false;
  return (
    <>
      <div class="filter-section">
        <h3>Category Combination</h3>
        <p class="filter-hint">AND = all categories must match. OR = any category can match.</p>
        <label>Combine categories using:
          <select id="filter-global-match" value={globalAnd ? "and" : "or"} onChange={(event) => filterDialog.setGlobalMatch(event.currentTarget.value === "and")}>
            <option value="and">AND</option>
            <option value="or">OR</option>
          </select>
        </label>
      </div>
      <div class="filter-section">
        <h3>Tags Filter</h3>
        {categories.map((category) => (
          <TagCategory key={category.collapseKey} category={category} />
        ))}
      </div>
    </>
  );
}

function TagCategory({ category }: { category: FilterTagCategory }) {
  const { filterDialog } = useApp();
  const categoryId = category.id ?? "";
  return (
    <div class="tag-editor-category" data-filter-category={category.id ?? undefined}>
      <div class="tag-editor-category-header">
        <div class="tag-editor-category-left">
          <button type="button" class="tag-editor-category-toggle icon-glyph-base icon-glyph-button" data-filter-category-toggle={category.collapseKey} title={category.collapsed ? "Expand category" : "Collapse category"} onClick={() => filterDialog.toggleCategory(category.collapseKey)}><span class="material-symbol-icon">{category.collapsed ? "keyboard_arrow_right" : "keyboard_arrow_down"}</span></button>
          <span class="tag-editor-category-title">{category.name}</span>
        </div>
        <div class="tag-editor-category-controls">
          <label class="filter-hint" style="margin:0">Local:
            <select class="filter-local-mode" data-cat-id={categoryId} value={String(category.localMode)} onChange={(event) => filterDialog.setLocalMatch(categoryId, Number.parseInt(event.currentTarget.value, 10) === TAG_MATCH_MODE.Or ? TAG_MATCH_MODE.Or : TAG_MATCH_MODE.And)}>
              <option value={String(TAG_MATCH_MODE.And)}>ALL (AND)</option>
              <option value={String(TAG_MATCH_MODE.Or)}>ANY (OR)</option>
            </select>
          </label>
        </div>
      </div>
      <div class="tag-editor-tag-grid" style={category.collapsed ? { display: "none" } : undefined}>
        {category.chips.map((chip) => (
          <TagChip key={chip.name} chip={chip} categoryId={category.id} />
        ))}
      </div>
    </div>
  );
}

function TagChip({ chip, categoryId }: { chip: FilterTagChip; categoryId: string | null }) {
  const { filterDialog } = useApp();
  const state = chip.included ? " state-all" : chip.excluded ? " state-none" : "";
  return (
    <div class={`tag-chip${state}`} data-filter-cat={categoryId ?? undefined}>
      <span class="tag-chip-label">{chip.name}</span>
      <button type="button" class={`chip-btn icon-glyph-base icon-glyph-toggle${chip.included ? " is-selected" : ""}`} data-filter-chip="inc" data-tag={chip.name} title="Include" onClick={() => filterDialog.toggleTag(chip.name, "include")}><span class="material-symbol-icon">add</span></button>
      <button type="button" class={`chip-btn icon-glyph-base icon-glyph-toggle${chip.excluded ? " is-selected" : ""}`} data-filter-chip="exc" data-tag={chip.name} title="Exclude" onClick={() => filterDialog.toggleTag(chip.name, "exclude")}><span class="material-symbol-icon">remove</span></button>
    </div>
  );
}

function PresetsPanel({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const names = view.presets.map((preset) => preset.name);
  const chosen = view.presetName && names.includes(view.presetName) ? view.presetName : "";
  const last = view.presets.length - 1;
  return (
    <>
      <div class="filter-section">
        <h3>Choose Preset</h3>
        <div class="filter-row">
          <select id="filter-dialog-preset-select" value={chosen} onChange={(event) => filterDialog.choosePreset(event.currentTarget.value)}>
            <option value="">None</option>
            {names.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" id="filter-update-preset-btn" onClick={() => filterDialog.updatePreset()}>Update Preset</button>
        </div>
      </div>
      <div class="filter-section">
        <h3>Create New Preset From Current Filter</h3>
        <div class="filter-row">
          <input type="text" id="filter-new-preset-name" placeholder="Enter preset name" value={view.newPresetName} onInput={(event) => filterDialog.typeNewPresetName(event.currentTarget.value)} />
          <button type="button" id="filter-add-preset-btn" onClick={() => filterDialog.addPreset()}>Add Preset</button>
        </div>
      </div>
      <div class="filter-section filter-section-manage">
        <h3>Manage Presets</h3>
        <div class="filter-preset-list themed-scrollbar">
          {view.presets.length > 0 ? (
            view.presets.map((preset, index) => (
              <div key={preset.name} class="filter-preset-row" data-preset-idx={String(index)}>
                <span class="filter-preset-name">{preset.name}</span>
                <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-up={String(index)} aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => filterDialog.movePreset(index, -1)}><span class="material-symbol-icon">keyboard_arrow_up</span></button>
                <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-down={String(index)} aria-label="Move down" title="Move down" disabled={index === last} onClick={() => filterDialog.movePreset(index, 1)}><span class="material-symbol-icon">keyboard_arrow_down</span></button>
                <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-rename={String(index)} aria-label="Rename" title="Rename" onClick={() => filterDialog.renamePreset(index)}><span class="material-symbol-icon">edit_note</span></button>
                <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-del={String(index)} aria-label="Delete" title="Delete" onClick={() => filterDialog.deletePreset(index)}><span class="material-symbol-icon">delete</span></button>
              </div>
            ))
          ) : (
            <span class="filter-hint">No presets</span>
          )}
        </div>
      </div>
    </>
  );
}
