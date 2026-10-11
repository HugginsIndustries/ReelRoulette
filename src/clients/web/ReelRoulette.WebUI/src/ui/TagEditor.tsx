import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { TagEditorTab, TagEditorView } from "../tags/tagEditor";
import type { AutoTagResults, AutoTagRowView } from "../tags/autoTagModel";
import { normalizeTagKey, type TagCategory, type TagCategoryRow, type TagChipRow } from "../tags/tagEditorModel";
import { useApp } from "./appContext";
import { NameDialog } from "./Dialog";
import { ValidatedField } from "./FieldValidation";
import { DragHandle, ReorderStatus, useReorder, type Reorder } from "./Reorder";

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
 * The Tags tab's tag editor, with its Edit Tags and Auto Tag tabs, and its Edit Tag, Edit Category, and New Category
 * dialogs. The panel shows and hides the tab, and the editor's panels are empty until it first opens. The dialogs
 * render after it rather than inside, so the editor's own button styles don't reach them.
 */
export function TagEditor() {
  const { tagEditor } = useApp();
  const view = tagEditor.view.value;
  const shown = tagEditor.tab.value;
  const active = shown ?? "edit";
  const scanning = view?.autoTag.scanning ?? false;
  // Every category but Uncategorized, which stays last, moves by its drag handle.
  const movable = (view?.categories ?? []).filter((category) => !category.uncategorized);
  const reorder = useReorder({
    keys: movable.map((category) => category.id),
    nameOf: (id) => movable.find((category) => category.id === id)?.name ?? "",
    onMove: (from, to) => tagEditor.moveCategory(movable[from]!.id, to)
  });
  // The tag Add tag created, until its chip renders and takes focus.
  const addedTag = useRef<string | null>(null);
  useLayoutEffect(() => {
    const name = addedTag.current;
    if (name !== null) {
      addedTag.current = null;
      addedChipFocus(name)?.focus();
    }
  });
  return (
    <>
      <div id="tag-editor" class="tag-editor">
        <div class="tag-editor-header">
          <h2>Tag Editor</h2>
          <div class="tag-editor-actions">
            <button id="tag-editor-refresh-btn" class={BUTTON} title="Refresh" aria-label="Refresh" disabled={scanning} onClick={() => void tagEditor.refresh()}><Icon name="refresh" /></button>
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
              {view?.categories ? view.categories.map((category) => <Category key={category.id} category={category} reorder={reorder} />) : view?.noModel ? "No tag model available." : null}
            </div>
            {view ? <ReorderStatus reorder={reorder} /> : null}
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
          <ValidatedField problem={view?.newTagProblem ?? null} flagged={view?.newTagFlagged ?? false}>
            {(control) => (
              <input {...control} id="tag-editor-new-tag" type="text" placeholder="New tag name" value={view?.newTagName ?? ""} onInput={(event) => tagEditor.typeNewTag(event.currentTarget.value)} />
            )}
          </ValidatedField>
          <button id="tag-editor-add-tag-btn" class={BUTTON} title="Add tag" aria-label="Add tag" disabled={!view || view.addTagDisabled} onClick={() => (addedTag.current = tagEditor.addTag())}><Icon name="add" /></button>
          <button id="tag-editor-apply-btn" class={view?.savePending ? `${BUTTON} has-pending` : BUTTON} title="Save" aria-label="Save" disabled={view ? !view.savePending || scanning : undefined} onClick={() => tagEditor.save()}><Icon name="save" /></button>
        </div>
      </div>
      {view?.editing && view.edit ? <EditTagDialog view={view} /> : null}
      {view?.categoryEdit ? <EditCategoryDialog view={view} /> : null}
      {view?.newCategory ? <NewCategoryDialog view={view} /> : null}
    </>
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

/** A category, which moves by its drag handle. Uncategorized's handle is dimmed, since it stays last. */
function Category({ category, reorder }: { category: TagCategoryRow; reorder: Reorder }) {
  const { tagEditor } = useApp();
  const fixed = category.uncategorized;
  return (
    <section class={reorder.dragging === category.id ? "tag-editor-category is-dragging" : "tag-editor-category"} ref={fixed ? undefined : reorder.row(category.id)}>
      <div class="tag-editor-category-header">
        <div class="tag-editor-category-left">
          {fixed ? <DragHandle fixed="Uncategorized stays last" /> : <DragHandle control={reorder.handle(category.id)} />}
          <button class={`tag-editor-category-toggle ${BUTTON}`} title={category.collapsed ? "Expand category" : "Collapse category"} onClick={() => tagEditor.toggleCategory(category.id)}><Icon name={category.collapsed ? "keyboard_arrow_right" : "keyboard_arrow_down"} /></button>
          <div class="tag-editor-category-title">{category.name}</div>
        </div>
        <div class="tag-editor-category-controls">
          {fixed ? null : (
            <button class={`tag-editor-category-btn ${BUTTON}`} title="Edit category" aria-label={`Edit category ${category.name}`} onClick={() => tagEditor.editCategory(category.id)}><Icon name="edit_note" /></button>
          )}
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

/** The chip of the tag with this name, ignoring case and spaces, as tag names are compared. */
function findChip(name: string): Element | undefined {
  const key = normalizeTagKey(name);
  return Array.from(document.querySelectorAll("#tag-editor-body .tag-chip")).find(
    (candidate) => normalizeTagKey(candidate.querySelector(".tag-chip-label")?.textContent) === key
  );
}

/** The Edit tag button of the chip with this name. */
function chipEditButton(name: string): HTMLElement | null {
  return findChip(name)?.querySelector<HTMLElement>('[title="Edit tag"]') ?? null;
}

/**
 * Where focus goes after Add tag creates a tag: its chip's add, so one more press puts it on the playing item, or its
 * Edit while nothing plays and add is disabled. A button, so no on-screen keyboard opens.
 */
function addedChipFocus(name: string): HTMLElement | null {
  const add = findChip(name)?.querySelector<HTMLButtonElement>('[title="Add tag"]');
  return add && !add.disabled ? add : chipEditButton(name);
}

/** Where a chip was: its category, and its place among that category's chips. */
interface ChipPlace {
  categoryId: string;
  index: number;
}

function chipPlace(view: TagEditorView, name: string): ChipPlace | null {
  for (const category of view.categories ?? []) {
    const index = category.chips.findIndex((chip) => chip.name === name);
    if (index >= 0) {
      return { categoryId: category.id, index };
    }
  }
  return null;
}

/**
 * Where focus goes when Edit Tag closes after its chip was replaced or removed: after a rename, the renamed chip's Edit,
 * in whichever category it is now; after a delete, the next chip's in the same category, or the previous one's when
 * the last was deleted.
 */
function editTagFallback(view: TagEditorView | null, oldName: string, typedName: string, place: ChipPlace | null): HTMLElement | null {
  if (!view?.pending.deleteTags.has(normalizeTagKey(oldName))) {
    return chipEditButton(typedName.trim());
  }
  const chips = view.categories?.find((category) => category.id === place?.categoryId)?.chips ?? [];
  const next = chips[Math.min(place?.index ?? 0, chips.length - 1)];
  return next ? chipEditButton(next.name) : null;
}

function EditTagDialog({ view }: { view: TagEditorView }) {
  const { tagEditor } = useApp();
  const edit = view.edit!;
  const [place] = useState(() => chipPlace(view, edit.oldName));
  return (
    <NameDialog
      title="Edit Tag"
      label="Tag Name"
      fieldId="tag-edit-name"
      saveId="tag-edit-save-btn"
      value={edit.name}
      problem={view.editNameProblem}
      flagged={view.editNameFlagged}
      onInput={(text) => tagEditor.typeEditName(text)}
      onSave={() => tagEditor.saveEdit()}
      onCancel={() => tagEditor.cancelEdit()}
      onDelete={() => void tagEditor.deleteEditedTag()}
      fallbackFocus={() => editTagFallback(tagEditor.view.peek(), edit.oldName, edit.name, place)}
    >
      <label for="tag-edit-category">Category</label>
      <select id="tag-edit-category" value={edit.categoryId} onChange={(event) => tagEditor.chooseEditCategory(event.currentTarget.value)}>
        <CategoryOptions options={view.categoryOptions} />
      </select>
    </NameDialog>
  );
}

/**
 * The Edit button of the category at `index`, or of the one before it: after a delete, the next category's, or the
 * previous one's when the deleted one was the last with an Edit button.
 */
function categoryEditButton(index: number): HTMLElement | null {
  const categories = document.querySelectorAll("#tag-editor-body .tag-editor-category");
  const at = (position: number) => categories[position]?.querySelector<HTMLElement>('[title="Edit category"]') ?? null;
  return at(index) ?? at(index - 1);
}

function EditCategoryDialog({ view }: { view: TagEditorView }) {
  const { tagEditor } = useApp();
  const [index] = useState(() => view.categories?.findIndex((category) => category.id === view.categoryEdit?.categoryId) ?? 0);
  return (
    <NameDialog
      title="Edit Category"
      label="Category Name"
      fieldId="tag-category-edit-name"
      saveId="tag-category-edit-save-btn"
      value={view.categoryEdit!.name}
      problem={view.categoryEditProblem}
      flagged={view.categoryEditFlagged}
      onInput={(text) => tagEditor.typeCategoryName(text)}
      onSave={() => tagEditor.saveCategoryEdit()}
      onCancel={() => tagEditor.cancelCategoryEdit()}
      onDelete={() => void tagEditor.deleteEditedCategory()}
      fallbackFocus={() => categoryEditButton(index)}
    />
  );
}

function NewCategoryDialog({ view }: { view: TagEditorView }) {
  const { tagEditor } = useApp();
  return (
    <NameDialog
      title="New Category"
      label="Category Name"
      fieldId="tag-new-category-name"
      saveId="tag-new-category-save-btn"
      value={view.newCategory!.name}
      problem={view.newCategoryProblem}
      flagged={view.newCategoryFlagged}
      onInput={(text) => tagEditor.typeNewCategoryName(text)}
      onSave={() => tagEditor.saveNewCategory()}
      onCancel={() => tagEditor.cancelNewCategory()}
    />
  );
}
