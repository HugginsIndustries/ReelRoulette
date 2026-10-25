import type { TagEditorView } from "../tags/tagEditor";
import type { TagCategory as CatalogCategory, TagCategoryRow, TagChipRow } from "../tags/tagEditorModel";
import { useApp } from "./appContext";
import { NameDialog } from "./Dialog";
import { ValidatedField } from "./FieldValidation";
import { Icon } from "./Icon";
import { DragHandle, useReorder, type Reorder } from "./Reorder";
import { TagCategory, tagsInUse } from "./TagCategory";

/**
 * The Tags tab's tag editor, with its Edit Tag, Edit Category, and New Category dialogs, and the button that opens
 * Auto Tag over the whole page. The panel shows and hides the tab, which is empty until it first opens. The dialogs
 * render after it rather than inside, so the editor's own styles don't reach them.
 */
export function TagEditor() {
  const { tagEditor } = useApp();
  const view = tagEditor.view.value;
  // Every category but Uncategorized, which stays last, moves by its drag handle.
  const movable = (view?.categories ?? []).filter((category) => !category.uncategorized);
  const reorder = useReorder({
    keys: movable.map((category) => category.id),
    nameOf: (id) => movable.find((category) => category.id === id)?.name ?? "",
    onMove: (from, to) => tagEditor.moveCategory(movable[from]!.id, to)
  });
  const saveClass = view?.savePending ? "icon-btn has-pending" : "icon-btn";
  return (
    <>
      <div id="tag-editor" class="tag-editor">
        <div class="tag-editor-header">
          <h2>Tag Editor</h2>
          <button id="tag-editor-autotag-btn" class="icon-btn" type="button" title="Auto Tag" aria-label="Auto Tag" onClick={() => tagEditor.openAutoTag()}><Icon name="auto_awesome" /></button>
        </div>
        <p id="tag-editor-target" class="tags-target" title={view?.heldName ?? undefined} hidden={!view?.heldName}>
          {view?.heldName ? <>Editing tags for <b>{view.heldName}</b></> : null}
        </p>
        <div id="tag-editor-body" class="tag-editor-body themed-scrollbar">
          {view?.categories ? view.categories.map((category) => <Category key={category.id} category={category} reorder={reorder} />) : view?.noModel ? "No tag model available." : null}
        </div>
        <div class="tag-editor-footer">
          <div class="tag-editor-footer-row">
            <button id="tag-editor-add-category-btn" class="icon-btn" type="button" title="Add category" aria-label="Add category" onClick={() => tagEditor.addCategory()}><Icon name="add" /></button>
            <select id="tag-editor-category-select" class="ctl" aria-label="Category for new tag" value={view?.newTagCategoryId} onChange={(event) => tagEditor.chooseNewTagCategory(event.currentTarget.value)}>
              <CategoryOptions options={view?.categoryOptions ?? []} />
            </select>
          </div>
          <div class="tag-editor-footer-row">
            <ValidatedField problem={view?.newTagProblem ?? null} flagged={view?.newTagFlagged ?? false}>
              {(control) => (
                <input
                  {...control}
                  id="tag-editor-new-tag"
                  class="ctl"
                  type="text"
                  placeholder="New tag name"
                  aria-label="New tag name"
                  autocomplete="off"
                  value={view?.newTagName ?? ""}
                  onInput={(event) => tagEditor.typeNewTag(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    // Enter adds the tag while Add tag is enabled, and otherwise does nothing.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (view && !view.addTagDisabled) {
                        tagEditor.addTag();
                      }
                    }
                  }}
                />
              )}
            </ValidatedField>
            <button id="tag-editor-add-tag-btn" class="icon-btn" type="button" title="Add tag" aria-label="Add tag" disabled={!view || view.addTagDisabled} onClick={() => tagEditor.addTag()}><Icon name="add" /></button>
            <button id="tag-editor-discard-btn" class="icon-btn" type="button" title="Discard changes" aria-label="Discard changes" disabled={!view?.savePending} onClick={() => tagEditor.discardChanges()}><Icon name="undo" /></button>
            <button id="tag-editor-apply-btn" class={saveClass} type="button" title="Save" aria-label="Save" disabled={view ? !view.savePending : undefined} onClick={() => tagEditor.save()}><Icon name="save" /><span class="unsaved-dot" hidden={!view?.savePending}></span></button>
          </div>
        </div>
      </div>
      {view?.editing && view.edit ? <EditTagDialog view={view} /> : null}
      {view?.categoryEdit ? <EditCategoryDialog view={view} /> : null}
      {view?.newCategory ? <NewCategoryDialog view={view} /> : null}
    </>
  );
}

function CategoryOptions({ options }: { options: readonly CatalogCategory[] }) {
  return (
    <>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </>
  );
}

/** A category, which moves by its drag handle. Uncategorized's handle is dimmed, since it stays last, and it has no Edit. */
function Category({ category, reorder }: { category: TagCategoryRow; reorder: Reorder }) {
  const { tagEditor } = useApp();
  const fixed = category.uncategorized;
  return (
    <TagCategory
      name={category.name}
      collapsed={category.collapsed}
      inUse={category.inUse}
      inUseTitle={tagsInUse(category.inUse, "on this item")}
      unsaved={category.unsaved}
      onToggle={() => tagEditor.toggleCategory(category.id)}
      handle={fixed ? <DragHandle fixed="Uncategorized stays last" /> : <DragHandle control={reorder.handle(category.id)} />}
      controls={
        fixed ? null : (
          <button class="icon-btn" type="button" title="Edit category" aria-label={`Edit category ${category.name}`} onClick={() => tagEditor.editCategory(category.id)}><Icon name="edit_note" /></button>
        )
      }
      class={reorder.dragging === category.id ? "is-dragging" : undefined}
      sectionRef={fixed ? undefined : reorder.row(category.id)}
    >
      {category.chips.map((chip) => (
        <Chip key={chip.name} chip={chip} />
      ))}
    </TagCategory>
  );
}

/** A tag: green when the item has it, its add, remove, and Edit. */
function Chip({ chip }: { chip: TagChipRow }) {
  const { tagEditor } = useApp();
  return (
    <div class={`tag-chip ${chip.state}`}>
      <span class="tag-chip-label">{chip.name}</span>
      <button class={chip.pending === "add" ? "icon-btn is-selected" : "icon-btn"} type="button" title="Add tag" aria-label={`Add tag ${chip.name}`} disabled={!chip.canChangeItems} onClick={() => tagEditor.toggleTag(chip.name, "add")}><Icon name="add" /></button>
      <button class={chip.pending === "remove" ? "icon-btn is-selected" : "icon-btn"} type="button" title="Remove tag" aria-label={`Remove tag ${chip.name}`} disabled={!chip.canChangeItems} onClick={() => tagEditor.toggleTag(chip.name, "remove")}><Icon name="remove" /></button>
      <button class="icon-btn" type="button" title="Edit tag" aria-label={`Edit tag ${chip.name}`} onClick={() => tagEditor.editTag(chip.name)}><Icon name="edit_note" /></button>
    </div>
  );
}

function EditTagDialog({ view }: { view: TagEditorView }) {
  const { tagEditor } = useApp();
  const edit = view.edit!;
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
    >
      <label for="tag-edit-category">Category</label>
      <select id="tag-edit-category" value={edit.categoryId} onChange={(event) => tagEditor.chooseEditCategory(event.currentTarget.value)}>
        <CategoryOptions options={view.categoryOptions} />
      </select>
    </NameDialog>
  );
}

function EditCategoryDialog({ view }: { view: TagEditorView }) {
  const { tagEditor } = useApp();
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
