import type { FilterDialog } from "../filter/filterDialog";
import type { MenuGroups, MenuItem } from "../ui/menuModel";
import type { TagEditor } from "./tagEditor";
import type { TagCategoryRow, TagChipRow } from "./tagEditorModel";

/** Filter by this tag's tooltip while Save hasn't created the tag, or given it its name, yet. */
export const SAVE_TAG_FIRST_REASON = "Save this tag first";

/**
 * The menus on tags: the Tags tab's tags' and categories', and the Stats tab's tags'. Each item works as the control it
 * repeats does, with the same confirmations and the same wait for Save or Apply.
 */
export interface TagMenus {
  /** A Tags tab tag's menu: Filter by this tag, while the Filter tab's filter doesn't include the tag, then Edit… and Delete…. */
  tagGroups(chip: TagChipRow): MenuGroups;
  /** A Tags tab category's menu: New tag in this category, then Edit… and Delete…, which Uncategorized's leaves out. */
  categoryGroups(category: TagCategoryRow): MenuGroups;
  /** A Stats tab tag's menu: Filter by this tag, or null, for no menu, while the Filter tab's filter includes the tag. */
  statsTagGroups(name: string): MenuGroups | null;
}

export interface TagMenusOptions {
  tagEditor: Pick<TagEditor, "editTag" | "deleteTag" | "editCategory" | "deleteCategory" | "newTagIn">;
  filterDialog: Pick<FilterDialog, "includesTag" | "filterByTag">;
}

export function createTagMenus({ tagEditor, filterDialog }: TagMenusOptions): TagMenus {
  /**
   * Filter by this tag, or null while the Filter tab's filter includes the tag. A tag Save hasn't created or renamed yet
   * isn't in the catalog the filter matches against, so it is disabled, saying why, until Save.
   */
  function filterItem(name: string, saved: boolean): MenuItem | null {
    if (filterDialog.includesTag(name)) {
      return null;
    }
    return {
      label: "Filter by this tag",
      icon: "filter_alt",
      onPick: () => void filterDialog.filterByTag(name),
      disabledReason: saved ? null : SAVE_TAG_FIRST_REASON
    };
  }

  function editItem(onPick: () => void): MenuItem {
    return { label: "Edit…", icon: "edit_note", onPick };
  }

  function deleteItem(onPick: () => void): MenuItem {
    return { label: "Delete…", icon: "delete", danger: true, onPick };
  }

  return {
    tagGroups(chip) {
      const filter = filterItem(chip.name, chip.saved);
      return [
        filter ? [filter] : [],
        [editItem(() => tagEditor.editTag(chip.name)), deleteItem(() => void tagEditor.deleteTag(chip.name))]
      ];
    },

    categoryGroups(category) {
      return [
        [{ label: "New tag in this category", icon: "new_label", onPick: () => tagEditor.newTagIn(category.id) }],
        category.uncategorized
          ? []
          : [editItem(() => tagEditor.editCategory(category.id)), deleteItem(() => void tagEditor.deleteCategory(category.id))]
      ];
    },

    statsTagGroups(name) {
      // The Stats tab's tags come from the catalog, so they are saved.
      const filter = filterItem(name, true);
      return filter ? [[filter]] : null;
    }
  };
}
