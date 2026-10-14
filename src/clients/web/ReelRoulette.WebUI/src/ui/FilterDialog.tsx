import type { JSX, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { FilterDialogTab, FilterDialogView } from "../filter/filterDialog";
import {
  AUDIO_FILTERS,
  BASIC_FILTERS,
  FILTER_FIELD_SECTION,
  MEDIA_TYPES,
  filterHeldReason,
  filterTagCategories,
  sourceLabel,
  type FilterAction,
  type FilterField,
  type FilterTagCategory,
  type FilterTagChip,
  type FlagFilterChoice,
  type GeneralDraft
} from "../filter/filterDialogModel";
import { TAG_MATCH_MODE } from "../filter/filterStateModel";
import { useApp } from "./appContext";
import { NameDialog } from "./Dialog";
import {
  HeldButton,
  SECTION_PROBLEM_TITLE,
  SectionProblemMark,
  ValidatedField,
  useFieldValidation,
  type ValidatedControlProps
} from "./FieldValidation";
import { DragHandle, ReorderStatus, useReorder } from "./Reorder";
import { TagCategory as Category, tagsInUse } from "./TagCategory";

// The `data-*` attributes keep the markup as it was before the dialog moved to a component; nothing reads them.

const TABS: readonly { tab: FilterDialogTab; label: string; display: string }[] = [
  { tab: "general", label: "General", display: "block" },
  { tab: "tags", label: "Tags", display: "block" },
  { tab: "presets", label: "Presets", display: "flex" }
];

/** The Favorites and Blacklisted filters, each a checkbox with an only-or-excluded dropdown that works while it is on. */
interface FlagFilter {
  id: string;
  label: string;
  on: "favoritesOn" | "blacklistedOn";
  choice: "favoritesChoice" | "blacklistedChoice";
}

const FLAG_FILTERS: readonly FlagFilter[] = [
  { id: "filter-fav", label: "Favorites", on: "favoritesOn", choice: "favoritesChoice" },
  { id: "filter-bl", label: "Blacklisted", on: "blacklistedOn", choice: "blacklistedChoice" }
];

const FLAG_CHOICES: readonly FlagFilterChoice[] = ["only", "excluded"];

function isFlagChoice(value: string): value is FlagFilterChoice {
  return (FLAG_CHOICES as readonly string[]).includes(value);
}

/** Whether a field in the section is flagged, which marks its tab. */
function sectionFlagged(view: FilterDialogView | null, section: FilterDialogTab): boolean {
  const fields = Object.keys(FILTER_FIELD_SECTION) as FilterField[];
  return !!view && fields.some((field) => FILTER_FIELD_SECTION[field] === section && view.flagged[field]);
}

/** An action's state for its button: disabled, or held by a field elsewhere. */
function heldAction(view: FilterDialogView | null, action: FilterAction) {
  const block = view?.actions[action];
  return {
    disabled: block?.disabled ?? false,
    heldReason: block?.heldBy ? filterHeldReason(action, block.heldBy) : null
  };
}

/** Before the dialog first opens, the panels keep the page's starting markup, where only General has no style. */
function panelStyle(shown: FilterDialogTab | null, panel: (typeof TABS)[number]) {
  if (shown === null) {
    return panel.tab === "general" ? undefined : { display: "none" };
  }
  return { display: shown === panel.tab ? panel.display : "none" };
}

/**
 * The Filter tab, which the panel shows and hides. It keeps its sections while hidden, and they are empty until the
 * tab first loads. Edit Preset renders after it rather than inside it, so the dialog's own styles apply and not the
 * Filter tab's.
 */
export function FilterDialog() {
  const { filterDialog } = useApp();
  const view = filterDialog.view.value;
  const shown = filterDialog.tab.value;
  const active = shown ?? "general";
  const [general, tags, presets] = TABS;
  return (
    <>
      <div id="filter-dialog" class="filter-dialog">
        <div class="filter-dialog-header">
          <h2 id="filter-dialog-heading">{view ? view.heading : "Preset: None"}</h2>
          <button id="filter-dialog-refresh-btn" class="icon-btn" type="button" title="Refresh" aria-label="Refresh" onClick={() => void filterDialog.refresh()}><span class="material-symbol-icon">refresh</span></button>
        </div>
        <div class="filter-dialog-tabstrip" role="tablist" aria-label="Filter sections">
          {TABS.map(({ tab, label }) => {
            const problem = sectionFlagged(view, tab);
            return (
              <button key={tab} type="button" class={tab === active ? "filter-tab is-active" : "filter-tab"} role="tab" data-filter-tab={tab} aria-selected={tab === active ? "true" : "false"} title={problem ? SECTION_PROBLEM_TITLE : undefined} onClick={() => filterDialog.showTab(tab)}>
                {label}
                <SectionProblemMark shown={problem} />
              </button>
            );
          })}
        </div>
        <div class="filter-dialog-body themed-scrollbar">
          <div id="filter-panel-general" class="filter-panel" style={panelStyle(shown, general!)}>{view ? <GeneralPanel view={view} /> : null}</div>
          <div id="filter-panel-tags" class="filter-panel" style={panelStyle(shown, tags!)}>{view ? <TagsPanel view={view} /> : null}</div>
          <div id="filter-panel-presets" class="filter-panel" style={panelStyle(shown, presets!)}>{view ? <PresetsPanel view={view} /> : null}</div>
        </div>
        <div class="filter-dialog-footer">
          <button id="filter-clear-all-btn" class="btn" type="button" onClick={() => filterDialog.clearAll()}>Clear all filters</button>
          <button id="filter-cancel-btn" class="btn" type="button" onClick={() => filterDialog.cancel()}>Cancel</button>
          <HeldButton id="filter-apply-btn" class={view?.pending ? "btn has-pending" : "btn"} {...heldAction(view, "apply")} onClick={() => void filterDialog.apply()}>{view?.pending ? "Apply*" : "Apply"}</HeldButton>
        </div>
      </div>
      {view?.presetEdit ? <EditPresetDialog view={view} /> : null}
    </>
  );
}

/**
 * The Edit button of the preset row at `index`, or of the last row when there are fewer: after a rename, which keeps
 * the preset's place, the renamed row; after a delete, the next row, or the previous one when the last was deleted.
 */
function presetEditButton(index: number): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>("#filter-dialog .filter-preset-row");
  return rows[Math.min(index, rows.length - 1)]?.querySelector<HTMLElement>('[title="Edit preset"]') ?? null;
}

/** Where focus goes after Add Preset adds a preset: the new last row's drag handle. A button, so no on-screen keyboard opens. */
function addedPresetFocus(): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>("#filter-dialog .filter-preset-row");
  return rows[rows.length - 1]?.querySelector<HTMLElement>(".drag-handle") ?? null;
}

/** Edit Preset: renames a preset, or deletes it after asking. It shows while the dialog's preset edit is open. */
function EditPresetDialog({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const index = view.presetEdit?.index ?? 0;
  return (
    <NameDialog
      title="Edit Preset"
      label="Preset Name"
      fieldId="filter-preset-edit-name"
      saveId="filter-preset-edit-save-btn"
      value={view.presetEdit?.name ?? ""}
      problem={view.presetEditProblem}
      flagged={view.presetEditFlagged}
      onInput={(text) => filterDialog.typePresetName(text)}
      onSave={() => filterDialog.savePresetEdit()}
      onCancel={() => filterDialog.cancelPresetEdit()}
      onDelete={() => void filterDialog.deleteEditedPreset()}
      fallbackFocus={() => presetEditButton(index)}
    />
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
          <FlagFilterRows view={view} />
          {BASIC_FILTERS.map(({ id, field, label }) => (
            <label key={id}><input type="checkbox" id={id} checked={draft[field]} onChange={(event) => filterDialog.changeGeneral({ [field]: event.currentTarget.checked })} /> {label}</label>
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
        <div class="filter-stack duration-stack">
          <DurationRow which="min" view={view} />
          <DurationRow which="max" view={view} />
        </div>
      </div>
    </>
  );
}

/**
 * The Favorites and Blacklisted filters, checked as a pair: Favorites only with Blacklisted only matches nothing.
 * Both dropdowns are marked and described while it is flagged, and its icon sits just after the Blacklisted one.
 */
function FlagFilterRows({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const pair = useFieldValidation<HTMLSelectElement, FilterField>({
    problem: view.problems.flagModes,
    flagged: view.flagged.flagModes,
    reveal: { from: filterDialog.reveal, field: "flagModes" }
  });
  const [favorites, blacklisted] = FLAG_FILTERS;
  return (
    <>
      <FlagFilterRow flag={favorites!} draft={view.general} validation={pair.partner} />
      <FlagFilterRow flag={blacklisted!} draft={view.general} validation={pair.control} mark={pair.mark} />
    </>
  );
}

/**
 * A flag filter's checkbox and dropdown. The dropdown keeps its choice while the checkbox is off. The row given a
 * `mark`, even a null one, keeps the pair's wrapper around its dropdown, so the icon can sit after it.
 */
function FlagFilterRow({
  flag,
  draft,
  validation,
  mark
}: {
  flag: FlagFilter;
  draft: GeneralDraft;
  validation: ValidatedControlProps & { ref?: RefObject<HTMLSelectElement | null> };
  mark?: JSX.Element | null;
}) {
  const { filterDialog } = useApp();
  const on = draft[flag.on];
  const select = (
    <select
      {...validation}
      class="ctl mode-select"
      id={`${flag.id}-mode`}
      aria-label={`${flag.label} filter`}
      value={draft[flag.choice]}
      disabled={!on}
      onChange={(event) => {
        const value = event.currentTarget.value;
        if (isFlagChoice(value)) {
          filterDialog.changeGeneral({ [flag.choice]: value });
        }
      }}
    >
      {FLAG_CHOICES.map((choice) => (
        <option key={choice} value={choice}>{choice}</option>
      ))}
    </select>
  );
  return (
    <div class="mode-row">
      <label><input type="checkbox" id={flag.id} checked={on} onChange={(event) => filterDialog.changeGeneral({ [flag.on]: event.currentTarget.checked })} /> {flag.label}</label>
      {mark === undefined ? (
        select
      ) : (
        <span class="vfield vfield-after">
          {select}
          {mark}
        </span>
      )}
    </div>
  );
}

/**
 * A duration field, where empty means no limit, as its placeholder says. The field's text follows each keystroke,
 * which flags a duration that is not valid as it is typed, and the working filter takes it when the field changes,
 * so Apply's star appears when the user leaves the field.
 */
function DurationRow({ which, view }: { which: "min" | "max"; view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const draft = view.general;
  const min = which === "min";
  const field = min ? "minDuration" : "maxDuration";
  const text = min ? draft.minText : draft.maxText;
  return (
    <div class="filter-row">
      <span style="min-width:3rem">{min ? "Min" : "Max"}</span>
      <ValidatedField class="duration-field" problem={view.problems[field]} flagged={view.flagged[field]} reveal={{ from: filterDialog.reveal, field }}>
        {(control) => (
          <input
            {...control}
            type="text"
            id={min ? "filter-min-dur-text" : "filter-max-dur-text"}
            class="ctl"
            autocomplete="off"
            aria-label={min ? "Minimum duration" : "Maximum duration"}
            placeholder={min ? "No minimum" : "No maximum"}
            value={text}
            onInput={(event) => filterDialog.typeDuration(which, event.currentTarget.value)}
            onChange={(event) =>
              filterDialog.changeGeneral(min ? { minText: event.currentTarget.value } : { maxText: event.currentTarget.value })
            }
          />
        )}
      </ValidatedField>
    </div>
  );
}

function TagsPanel({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const categories = filterTagCategories(view.tagModel, view.working, view.expanded, view.applied);
  if (categories.length === 0) {
    return <p class="filter-hint">No tags yet. Add them in the Tags tab.</p>;
  }
  const globalAnd = view.working.globalMatchMode !== false;
  return (
    <>
      <div class="filter-section">
        <h3>Category Combination</h3>
        <p class="filter-hint">AND = all categories must match. OR = any category can match.</p>
        <label class="filter-row">Combine categories using:
          <select id="filter-global-match" class="ctl" value={globalAnd ? "and" : "or"} onChange={(event) => filterDialog.setGlobalMatch(event.currentTarget.value === "and")}>
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

/** A tag category, which its header toggles, with its Local match mode, which keeps its own action. */
function TagCategory({ category }: { category: FilterTagCategory }) {
  const { filterDialog } = useApp();
  const categoryId = category.id ?? "";
  return (
    <Category
      name={category.name}
      gridId={`filter-tag-grid-${category.collapseKey}`}
      collapsed={category.collapsed}
      inUse={category.inUse}
      inUseTitle={tagsInUse(category.inUse, "in the filter")}
      unsaved={category.unsaved}
      onToggle={() => filterDialog.toggleCategory(category.collapseKey)}
      controls={
        <label class="filter-local">Local:
          <select class="ctl filter-local-mode" data-cat-id={categoryId} value={String(category.localMode)} onChange={(event) => filterDialog.setLocalMatch(categoryId, Number.parseInt(event.currentTarget.value, 10) === TAG_MATCH_MODE.Or ? TAG_MATCH_MODE.Or : TAG_MATCH_MODE.And)}>
            <option value={String(TAG_MATCH_MODE.And)}>ALL (AND)</option>
            <option value={String(TAG_MATCH_MODE.Or)}>ANY (OR)</option>
          </select>
        </label>
      }
    >
      {category.chips.map((chip) => (
        <TagChip key={chip.name} chip={chip} />
      ))}
    </Category>
  );
}

/** A tag: green when the filter includes it, violet otherwise, with its include and exclude. */
function TagChip({ chip }: { chip: FilterTagChip }) {
  const { filterDialog } = useApp();
  const state = chip.included ? " state-all" : chip.excluded ? " state-none" : "";
  return (
    <div class={`tag-chip${state}`}>
      <span class="tag-chip-label">{chip.name}</span>
      <button type="button" class={chip.included ? "icon-btn is-selected" : "icon-btn"} title="Include" aria-label={`Include ${chip.name}`} onClick={() => filterDialog.toggleTag(chip.name, "include")}><span class="material-symbol-icon">add</span></button>
      <button type="button" class={chip.excluded ? "icon-btn is-selected" : "icon-btn"} title="Exclude" aria-label={`Exclude ${chip.name}`} onClick={() => filterDialog.toggleTag(chip.name, "exclude")}><span class="material-symbol-icon">remove</span></button>
    </div>
  );
}

function PresetsPanel({ view }: { view: FilterDialogView }) {
  const { filterDialog } = useApp();
  const names = view.presets.map((preset) => preset.name);
  const chosen = view.presetName && names.includes(view.presetName) ? view.presetName : "";
  const reorder = useReorder({ keys: names, nameOf: (name) => name, onMove: (from, to) => filterDialog.movePreset(from, to) });
  // Whether Add Preset added a preset, until its row renders and takes focus.
  const added = useRef(false);
  useLayoutEffect(() => {
    if (added.current) {
      added.current = false;
      addedPresetFocus()?.focus();
    }
  });
  return (
    <>
      <div class="filter-section">
        <h3>Choose Preset</h3>
        <div class="filter-row">
          <select id="filter-dialog-preset-select" class="ctl grow" aria-label="Choose preset" value={chosen} onChange={(event) => filterDialog.choosePreset(event.currentTarget.value)}>
            <option value="">None</option>
            {names.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <HeldButton id="filter-update-preset-btn" class="btn" {...heldAction(view, "updatePreset")} onClick={() => filterDialog.updatePreset()}>Update Preset</HeldButton>
        </div>
      </div>
      <div class="filter-section">
        <h3>Create New Preset From Current Filter</h3>
        <div class="filter-row">
          <ValidatedField class="new-preset-field" problem={view.problems.newPresetName} flagged={view.flagged.newPresetName} reveal={{ from: filterDialog.reveal, field: "newPresetName" }}>
            {(control) => (
              <input {...control} type="text" id="filter-new-preset-name" class="ctl" aria-label="New preset name" placeholder="Enter preset name" autocomplete="off" value={view.newPresetName} onInput={(event) => filterDialog.typeNewPresetName(event.currentTarget.value)} />
            )}
          </ValidatedField>
          <HeldButton id="filter-add-preset-btn" class="btn" {...heldAction(view, "addPreset")} onClick={() => (added.current = filterDialog.addPreset())}>Add Preset</HeldButton>
        </div>
      </div>
      <div class="filter-section filter-section-manage">
        <h3>Manage Presets</h3>
        <div class="filter-preset-list themed-scrollbar">
          {view.presets.length > 0 ? (
            view.presets.map((preset, index) => (
              <div key={preset.name} ref={reorder.row(preset.name)} class={reorder.dragging === preset.name ? "filter-preset-row is-dragging" : "filter-preset-row"} data-preset-idx={String(index)}>
                <DragHandle control={reorder.handle(preset.name)} />
                <span class="filter-preset-name">{preset.name}</span>
                <button type="button" class="icon-btn" data-preset-edit={String(index)} aria-label={`Edit preset ${preset.name}`} title="Edit preset" onClick={() => filterDialog.editPreset(index)}><span class="material-symbol-icon">edit_note</span></button>
              </div>
            ))
          ) : (
            <span class="filter-hint">No presets</span>
          )}
        </div>
        <ReorderStatus reorder={reorder} />
      </div>
    </>
  );
}
