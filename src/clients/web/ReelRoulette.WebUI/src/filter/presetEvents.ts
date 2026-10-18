import type { NotifyRequest } from "../notifications/notifications";
import type { ApiPreset } from "../state/appStore";
import { filterStateForHeaderPresetSelection, filterStatesEqualForPresetMatch, findPresetById } from "./filterStateModel";

/**
 * What a burst of `presetCatalogChanged` events recorded for one preset: the preset as the page held it when its first
 * event arrived, or null when the page didn't have it, and whether any of its events came from another device.
 */
export interface PresetEventRecord {
  before: ApiPreset | null;
  anotherDevice: boolean;
}

/**
 * A preset another device changed, told apart by comparing the reloaded list with the one before, since the event
 * carries only the preset's id and the device's client id. `name` is its name before the change, except for an update,
 * which goes by its new name; a rename's new name is `to`.
 */
export type PresetChange =
  | { kind: "added" | "updated" | "deleted"; id: string; name: string }
  | { kind: "renamed"; id: string; name: string; to: string };

/** The ordinary preset popups' key, so a later burst's replaces one still showing. */
export const PRESET_POPUP_KEY = "presets";
/** The active preset's own popup's key, so it shows beside the ordinary one. */
export const YOUR_PRESET_POPUP_KEY = "your-preset";

function sameFilter(a: ApiPreset, b: ApiPreset): boolean {
  return filterStatesEqualForPresetMatch(filterStateForHeaderPresetSelection(a), filterStateForHeaderPresetSelection(b));
}

/**
 * The changes another device made to the presets `recorded` names, by comparing each with the reloaded list, in the
 * order the events arrived. A filter change wins over a rename, by the new name. A preset added and deleted within one
 * burst, one this device alone changed, and one whose name and filter are as they were, as after a reorder, give none.
 */
export function presetChanges(recorded: ReadonlyMap<string, PresetEventRecord>, reloaded: readonly ApiPreset[]): PresetChange[] {
  const changes: PresetChange[] = [];
  for (const [id, record] of recorded) {
    if (!record.anotherDevice) {
      continue;
    }
    const before = record.before;
    const after = findPresetById(reloaded, id);
    if (!before && after) {
      changes.push({ kind: "added", id, name: after.name });
    } else if (before && !after) {
      changes.push({ kind: "deleted", id, name: before.name });
    } else if (before && after) {
      if (!sameFilter(before, after)) {
        changes.push({ kind: "updated", id, name: after.name });
      } else if (before.name !== after.name) {
        changes.push({ kind: "renamed", id, name: before.name, to: after.name });
      }
    }
  }
  return changes;
}

/** The popup of one ordinary change, whose log leaves the preset's names out. */
function changePopup(change: PresetChange): NotifyRequest {
  const popup = (text: string, logText: string): NotifyRequest => ({ kind: "devices", text, key: PRESET_POPUP_KEY, logText });
  switch (change.kind) {
    case "added":
      return popup(`Preset "${change.name}" added on another device`, "Preset added on another device");
    case "renamed":
      return popup(`Preset "${change.name}" renamed to "${change.to}" on another device`, "Preset renamed on another device");
    case "updated":
      return popup(`Preset "${change.name}" updated on another device`, "Preset updated on another device");
    case "deleted":
      return popup(`Preset "${change.name}" deleted on another device`, "Preset deleted on another device");
  }
}

/**
 * The popups for `changes`. A change to the active preset, by `activeId`, that changes what this device plays keeps a
 * popup of its own: an update the applied filter `followed`, or a delete, whose filter stays applied. Every other change,
 * the active preset's rename or its update while its filter shows as modified included, counts into one ordinary popup,
 * which names the one change, or counts two or more. With `ownOnly`, as for a resync, which can't tell which device
 * changed which preset, only the active preset's own popup shows.
 */
export function presetPopups(
  changes: readonly PresetChange[],
  activeId: string | null,
  followed: boolean,
  ownOnly = false
): NotifyRequest[] {
  const active = activeId === null ? undefined : changes.find((change) => change.id === activeId);
  const own = active && ((active.kind === "updated" && followed) || active.kind === "deleted") ? active : undefined;
  const rest = ownOnly ? [] : changes.filter((change) => change !== own);
  const popups: NotifyRequest[] = [];
  if (rest.length === 1) {
    popups.push(changePopup(rest[0]!));
  } else if (rest.length > 1) {
    const text = `${rest.length} presets changed on another device`;
    popups.push({ kind: "devices", text, key: PRESET_POPUP_KEY, logText: text });
  }
  if (own?.kind === "deleted") {
    popups.push({
      kind: "devices",
      text: `Your preset "${own.name}" was deleted on another device. Its filter is still applied.`,
      key: YOUR_PRESET_POPUP_KEY,
      logText: "Your preset was deleted on another device. Its filter is still applied."
    });
  } else if (own) {
    popups.push({
      kind: "devices",
      text: `Your preset "${own.name}" was updated on another device. The library has been updated.`,
      key: YOUR_PRESET_POPUP_KEY,
      logText: "Your preset was updated on another device. The library has been updated."
    });
  }
  return popups;
}
