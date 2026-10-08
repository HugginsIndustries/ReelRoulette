import { useEffect, useRef } from "preact/hooks";
import type { TagEditorTab, TagEditorView } from "../tags/tagEditor";
import type { AutoTagResults, AutoTagRowView } from "../tags/autoTagModel";
import type { TagCategory, TagCategoryRow, TagChipRow } from "../tags/tagEditorModel";
import { useApp } from "./appContext";

// The `data-*` attributes keep the markup as it was before the editor moved to a component; nothing reads them.

const BUTTON = "icon-glyph-base icon-glyph-button";
const TOGGLE = "icon-glyph-base icon-glyph-toggle";

const TABS: readonly { tab: TagEditorTab; label: string }[] = [
  { tab: "edit", label: "Edit Tags" },
  { tab: "autotag", label: "Auto Tag" }
];

/** Before the editor first opens, the panels keep the page's starting markup, where only Auto Tag has a style. */
function panelStyle(shown: TagEditorTab | null, panel: TagEditorTab) {
  if (shown === null) {
    return panel === "edit" ? undefined : { display: "none" };
  }
  return { display: shown === panel ? "flex" : "none" };
}

function Icon({ name }: { name: string }) {
  return <span class="material-symbol-icon">{name}</span>;
}

/**
 * The tag editor, with its Edit Tags and Auto Tag tabs and the Edit Tag dialog. It shows only while open, and its
 * panels are empty until it first opens.
 */
export function TagEditor() {
  const { tagEditor } = useApp();
  const view = tagEditor.view.value;
  const shown = tagEditor.tab.value;
  const active = shown ?? "edit";
  const scanning = view?.autoTag.scanning ?? false;
  return (
    <div id="tag-editor" class="tag-editor" style={{ display: tagEditor.isOpen.value ? "flex" : "none" }}>
      <div class="tag-editor-header">
        <h2>Tag Editor</h2>
        <div class="tag-editor-actions">
          <button id="tag-editor-refresh-btn" class={BUTTON} title="Refresh" aria-label="Refresh" disabled={scanning} onClick={() => tagEditor.refresh()}><Icon name="refresh" /></button>
          <button id="tag-editor-close-btn" class={BUTTON} title="Close" aria-label="Close" disabled={scanning} onClick={() => tagEditor.close()}><Icon name="close" /></button>
        </div>
      </div>
      <div class="filter-dialog-tabstrip tag-editor-tabstrip" role="tablist">
        {TABS.map(({ tab, label }) => (
          <button key={tab} type="button" class={tab === active ? "filter-tab is-active" : "filter-tab"} role="tab" data-tag-editor-tab={tab} aria-selected={tab === active ? "true" : "false"} onClick={() => tagEditor.showTab(tab)}>{label}</button>
        ))}
      </div>
      <div class="tag-editor-panel-stack">
        <div id="tag-editor-panel-edit" class="tag-editor-panel" style={panelStyle(shown, "edit")}>
          <div id="tag-editor-body" class="tag-editor-body themed-scrollbar">
            {view?.categories ? view.categories.map((category) => <Category key={category.id} category={category} />) : view?.noModel ? "No tag model available." : null}
          </div>
        </div>
        <div id="tag-editor-panel-autotag" class="tag-editor-panel" style={panelStyle(shown, "autotag")}>
          <AutoTagPanel view={view} />
        </div>
      </div>
      <div class="tag-editor-footer">
        <button id="tag-editor-add-category-btn" class={BUTTON} title="Add category" aria-label="Add category" onClick={() => tagEditor.addCategory()}><Icon name="add" /></button>
        <select id="tag-editor-category-select" value={view?.newTagCategoryId} onChange={(event) => tagEditor.chooseNewTagCategory(event.currentTarget.value)}>
          <CategoryOptions options={view?.categoryOptions ?? []} />
        </select>
        <input id="tag-editor-new-tag" type="text" placeholder="New tag name" value={view?.newTagName ?? ""} onInput={(event) => tagEditor.typeNewTag(event.currentTarget.value)} />
        <button id="tag-editor-add-tag-btn" class={BUTTON} title="Add tag" aria-label="Add tag" onClick={() => tagEditor.addTag()}><Icon name="add" /></button>
        <button id="tag-editor-apply-btn" class={view?.savePending ? `${BUTTON} has-pending` : BUTTON} title="Save" aria-label="Save" disabled={view ? !view.savePending || scanning : undefined} onClick={() => tagEditor.save()}><Icon name="save" /></button>
      </div>
      <EditTagDialog view={view} />
    </div>
  );
}

function CategoryOptions({ options }: { options: readonly TagCategory[] }) {
  return (
    <>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </>
  );
}

function Category({ category }: { category: TagCategoryRow }) {
  const { tagEditor } = useApp();
  return (
    <section class="tag-editor-category">
      <div class="tag-editor-category-header">
        <div class="tag-editor-category-left">
          <button class={`tag-editor-category-toggle ${BUTTON}`} title={category.collapsed ? "Expand category" : "Collapse category"} onClick={() => tagEditor.toggleCategory(category.id)}><Icon name={category.collapsed ? "keyboard_arrow_right" : "keyboard_arrow_down"} /></button>
          <div class="tag-editor-category-title">{category.name}</div>
        </div>
        <div class="tag-editor-category-controls">
          <button class={`tag-editor-category-btn ${BUTTON}`} title="Move category up" disabled={!category.canMoveUp} onClick={() => tagEditor.moveCategory(category.id, -1)}><Icon name="arrow_drop_up" /></button>
          <button class={`tag-editor-category-btn ${BUTTON}`} title="Move category down" disabled={!category.canMoveDown} onClick={() => tagEditor.moveCategory(category.id, 1)}><Icon name="arrow_drop_down" /></button>
          <button class={`tag-editor-category-btn ${BUTTON}`} title="Rename category" disabled={category.uncategorized} onClick={() => tagEditor.renameCategory(category.id)}><Icon name="edit_note" /></button>
          <button class={`tag-editor-category-btn ${BUTTON}`} title="Delete category" disabled={category.uncategorized} onClick={() => tagEditor.deleteCategory(category.id)}><Icon name="delete" /></button>
        </div>
      </div>
      <div class="tag-editor-tag-grid" style={category.collapsed ? { display: "none" } : undefined}>
        {category.chips.map((chip) => (
          <Chip key={chip.name} chip={chip} />
        ))}
      </div>
    </section>
  );
}

function Chip({ chip }: { chip: TagChipRow }) {
  const { tagEditor } = useApp();
  return (
    <div class={`tag-chip ${chip.state}`}>
      <span class="tag-chip-label">{chip.name}</span>
      <button class={`chip-btn ${TOGGLE}${chip.pending === "add" ? " is-selected" : ""}`} title="Add tag" disabled={!chip.canChangeItems} onClick={() => tagEditor.toggleTag(chip.name, "add")}><Icon name="add" /></button>
      <button class={`chip-btn ${TOGGLE}${chip.pending === "remove" ? " is-selected" : ""}`} title="Remove tag" disabled={!chip.canChangeItems} onClick={() => tagEditor.toggleTag(chip.name, "remove")}><Icon name="remove" /></button>
      <button class={`chip-btn ${BUTTON}`} title="Edit tag" onClick={() => tagEditor.editTag(chip.name)}><Icon name="edit_note" /></button>
      <button class={`chip-btn ${BUTTON}`} title="Delete tag" onClick={() => tagEditor.deleteTag(chip.name)}><Icon name="delete" /></button>
    </div>
  );
}

function AutoTagPanel({ view }: { view: TagEditorView | null }) {
  const { tagEditor } = useApp();
  const autoTag = view?.autoTag;
  return (
    <div class="tag-editor-body tag-autotag-body themed-scrollbar">
      <div class="tag-autotag-toolbar">
        <label class="tag-autotag-check-label"><input type="checkbox" id="tag-autotag-scan-full" checked={autoTag?.scanFull ?? false} onChange={(event) => tagEditor.setScanFullLibrary(event.currentTarget.checked)} /> Scan full library</label>
        <label class="tag-autotag-check-label"><input type="checkbox" id="tag-autotag-view-all" checked={autoTag?.viewAll ?? false} onChange={(event) => tagEditor.setViewAll(event.currentTarget.checked)} /> View all matches</label>
      </div>
      <p class="tag-autotag-hint">Use Scan Files to find matching tags. File name matching ignores extension.</p>
      <div class="tag-autotag-actions-row">
        <button type="button" id="tag-autotag-select-all" class="tag-autotag-row-btn" onClick={() => tagEditor.selectAll()}>Select all</button>
        <button type="button" id="tag-autotag-deselect-all" class="tag-autotag-row-btn" onClick={() => tagEditor.deselectAll()}>Deselect all</button>
        <button type="button" id="tag-autotag-scan-btn" class="tag-autotag-scan-btn" disabled={autoTag?.scanning ?? false} onClick={() => void tagEditor.scan()}>Scan Files</button>
      </div>
      <div id="tag-autotag-progress" class="tag-autotag-progress" style={{ display: autoTag?.scanning ? "block" : "none" }} role="progressbar" aria-label="Scan in progress"></div>
      <div id="tag-autotag-status" class="tag-autotag-status" aria-live="polite">{autoTag?.status ?? ""}</div>
      <div id="tag-autotag-results" class="tag-autotag-results themed-scrollbar">
        {view ? <Results results={view.results} /> : null}
      </div>
    </div>
  );
}

function Results({ results }: { results: AutoTagResults }) {
  if (results.kind === "none") {
    return null;
  }
  if (results.kind === "hint") {
    return <p class="tag-autotag-hint">{results.text}</p>;
  }
  return (
    <>
      <div class="tag-autotag-table-head"><span></span><span>Apply</span><span>Tag / File</span><span>Total matched</span><span>To be changed</span></div>
      {results.rows.map((entry) => (
        <ResultRow key={entry.row.rowId} entry={entry} />
      ))}
    </>
  );
}

function ResultRow({ entry }: { entry: AutoTagRowView }) {
  const { tagEditor } = useApp();
  const { row } = entry;
  const rowId = String(row.rowId);
  return (
    <div class="tag-autotag-row" data-autotag-row={rowId}>
      <div class="tag-autotag-row-main">
        <button type="button" class={BUTTON} data-autotag-expand={rowId} aria-label={row.expanded ? "Collapse" : "Expand"} onClick={(event) => { event.preventDefault(); tagEditor.toggleRowExpanded(row.rowId); }}><Icon name={row.expanded ? "expand_more" : "chevron_right"} /></button>
        <input type="checkbox" data-autotag-row-check={rowId} checked={entry.checked} indeterminate={entry.indeterminate} onChange={(event) => tagEditor.checkRow(row.rowId, event.currentTarget.checked)} />
        <span style="font-weight:600">{row.tagName || ""}</span>
        <span>{row.totalMatchedCount}</span>
        <span>{row.wouldChangeCount}</span>
      </div>
      <div class="tag-autotag-row-files" style={{ display: row.expanded ? "block" : "none" }}>
        {entry.files.map((file) => (
          <div key={file.itemId} class="tag-autotag-file-row"><label><input type="checkbox" data-autotag-file="" data-row-id={rowId} data-item-id={file.itemId || ""} checked={file.selected} onChange={(event) => tagEditor.checkFile(row.rowId, file.itemId, event.currentTarget.checked)} /></label><span class="tag-autotag-file-path" title={file.fullPath || ""}>{file.displayPath || file.fullPath || ""}</span></div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Edit Tag dialog. Its fields keep their last values while it is closed, as the page did before it moved to a
 * component. Opening it focuses and selects the name.
 */
function EditTagDialog({ view }: { view: TagEditorView | null }) {
  const { tagEditor } = useApp();
  const name = useRef<HTMLInputElement>(null);
  const editing = view?.editing ?? false;
  useEffect(() => {
    if (!editing) {
      return;
    }
    const timer = setTimeout(() => {
      name.current?.focus();
      name.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [editing]);
  const edit = view?.edit;
  return (
    <div
      id="tag-edit-modal"
      class="tag-edit-modal"
      style={{ display: editing ? "flex" : "none" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          tagEditor.cancelEdit();
        }
      }}
    >
      <div class="tag-edit-modal-card">
        <h3>Edit Tag</h3>
        <label for="tag-edit-name">Tag Name</label>
        <input id="tag-edit-name" type="text" autocomplete="off" ref={name} value={edit?.name ?? ""} onInput={(event) => tagEditor.typeEditName(event.currentTarget.value)} />
        <label for="tag-edit-category">Category</label>
        <select id="tag-edit-category" value={edit?.categoryId} onChange={(event) => tagEditor.chooseEditCategory(event.currentTarget.value)}>
          {edit ? <CategoryOptions options={view?.categoryOptions ?? []} /> : null}
        </select>
        <div class="tag-edit-modal-actions">
          <button id="tag-edit-cancel-btn" type="button" onClick={() => tagEditor.cancelEdit()}>Cancel</button>
          <button id="tag-edit-save-btn" type="button" onClick={() => tagEditor.saveEdit()}>Save</button>
        </div>
      </div>
    </div>
  );
}
