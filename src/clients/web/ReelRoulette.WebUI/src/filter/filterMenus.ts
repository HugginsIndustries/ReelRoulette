import type { AppStore } from "../state/appStore";
import type { MenuGroups, MenuItem } from "../ui/menuModel";
import type { FilterDialog } from "./filterDialog";
import { SOURCE_OFF_REASON } from "./filterDialogModel";

/** A preset row's Apply's tooltip while the Filter tab holds unsaved changes, which applying a preset would drop. */
export const APPLY_CHANGES_FIRST_REASON = "Apply or discard the Filter tab's changes first";

/**
 * The menus on the Filter tab's preset rows and sources. Each item works as the control it repeats does, with the same
 * confirmations and the same wait for Apply.
 */
export interface FilterMenus {
  /**
   * A preset row's menu: Apply, while the preset isn't the applied filter, then Load into filter and Update from filter,
   * while the tab's filter isn't the preset's, then Edit… and Delete…. Null, for no menu, once the list no longer has it.
   */
  presetGroups(id: string): MenuGroups | null;
  /**
   * A source's menu: Only this source, or null, for no menu, while it is the only enabled source checked. On a source
   * turned off on the server it is disabled, saying so.
   */
  sourceGroups(index: number): MenuGroups | null;
}

export interface FilterMenusOptions {
  filterDialog: Pick<FilterDialog, "view" | "loadIntoFilter" | "updateFromFilter" | "editPreset" | "deletePreset" | "onlySource">;
  /** The Library tab's preset dropdown's preset, and its pick, which a row's Apply makes. */
  store: Pick<AppStore, "selectedPresetValue" | "pickHeaderPreset">;
}

export function createFilterMenus({ filterDialog, store }: FilterMenusOptions): FilterMenus {
  return {
    presetGroups(id) {
      const view = filterDialog.view.peek();
      if (!view?.presets.some((preset) => preset.id === id)) {
        return null;
      }
      // The dropdown names the applied filter's preset, starred while the filter differs from it.
      const apply: MenuItem | null =
        store.selectedPresetValue() === id
          ? null
          : {
              label: "Apply",
              icon: "filter_alt",
              onPick: () => store.pickHeaderPreset(id),
              disabledReason: view.unsaved ? APPLY_CHANGES_FIRST_REASON : null
            };
      const own = view.filterPreset === id;
      return [
        apply ? [apply] : [],
        own
          ? []
          : [
              { label: "Load into filter", icon: "sync", onPick: () => filterDialog.loadIntoFilter(id) },
              {
                label: "Update from filter",
                icon: "save",
                onPick: () => filterDialog.updateFromFilter(id),
                disabledReason: view.updateFromFilterReason
              }
            ],
        [
          { label: "Edit…", icon: "edit_note", onPick: () => filterDialog.editPreset(id) },
          { label: "Delete…", icon: "delete", danger: true, onPick: () => void filterDialog.deletePreset(id) }
        ]
      ];
    },

    sourceGroups(index) {
      const view = filterDialog.view.peek();
      const source = view?.sources[index];
      if (!view || !source) {
        return null;
      }
      const enabled = source.isEnabled !== false;
      const checked = view.general.sourceChecked;
      const othersChecked = view.sources.some((other, at) => at !== index && other.isEnabled !== false && checked[at]);
      if (enabled && checked[index] && !othersChecked) {
        return null;
      }
      return [
        [
          {
            label: "Only this source",
            icon: "filter_alt",
            onPick: () => filterDialog.onlySource(index),
            disabledReason: enabled ? null : SOURCE_OFF_REASON
          }
        ]
      ];
    }
  };
}
