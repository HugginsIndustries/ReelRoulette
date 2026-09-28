import { mergeLibraryItemTags } from "./libraryQuerySession";

export type TagSaveCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type TagSaveStep =
  | { kind: "upsert-category"; id: string; name: string; sortOrder: number }
  | { kind: "delete-category"; categoryId: string }
  | { kind: "upsert-tag"; name: string; categoryId: string }
  | { kind: "rename-tag"; oldName: string; newName: string; newCategoryId: string | null }
  | { kind: "delete-tag"; name: string }
  | { kind: "apply-item-tags"; itemIds: string[]; addTags: string[]; removeTags: string[] }
  | { kind: "apply-auto-tag"; assignments: Array<{ tagName: string; itemPaths: string[] }> };

export type TagSavePlanInput = {
  baselineCategories: readonly TagSaveCategory[];
  displayCategories: readonly TagSaveCategory[];
  deleteCategoryIds: readonly string[];
  upsertTags: readonly { name: string; categoryId: string }[];
  renameTags: readonly { oldName: string; newName: string; newCategoryId: string | null }[];
  deleteTags: readonly { name: string }[];
  itemIds: readonly string[];
  addTags: readonly string[];
  removeTags: readonly string[];
  autoTagAssignments: readonly { tagName: string; itemPaths: readonly string[] }[];
};

export type TaggedItem = {
  id: string;
  fullPath?: string | null;
  tags: string[];
};

export type TagEcho = {
  itemIds: readonly string[];
  addedTags: readonly string[];
  removedTags: readonly string[];
  subsetPaths?: boolean;
  supersetIds?: boolean;
};

export type TagEchoDecision = {
  skipPatch: boolean;
  reload: boolean;
};

export type TagSaveRun = {
  ok: boolean;
  accepted: TagSaveStep[];
  failed: TagSaveStep | null;
};

const UNCATEGORIZED = "uncategorized";

function isUncategorized(id: string): boolean {
  return id.trim().toLowerCase() === UNCATEGORIZED;
}

function sameCategoryName(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

export function planTagEditorSave(input: TagSavePlanInput): TagSaveStep[] {
  const steps: TagSaveStep[] = [];
  const baselineById = new Map(input.baselineCategories.map((category) => [category.id.trim().toLowerCase(), category]));
  const deleted = new Set(input.deleteCategoryIds.map((id) => id.trim().toLowerCase()));
  const baselineIndex = new Map<string, number>();
  for (const category of input.baselineCategories) {
    const id = category.id.trim();
    if (!id || isUncategorized(id) || baselineIndex.has(id.toLowerCase())) {
      continue;
    }
    baselineIndex.set(id.toLowerCase(), baselineIndex.size);
  }
  const displayCategories = input.displayCategories.filter((category) => {
    const id = category.id.trim();
    return id && !isUncategorized(id) && !deleted.has(id.toLowerCase());
  });
  displayCategories.forEach((category, index) => {
    const id = category.id.trim();
    const baseline = baselineById.get(id.toLowerCase());
    const previousIndex = baselineIndex.get(id.toLowerCase());
    const changed = baseline == null
      || !sameCategoryName(baseline.name, category.name)
      || previousIndex !== index;
    if (!changed) {
      return;
    }
    steps.push({
      kind: "upsert-category",
      id,
      name: category.name.trim(),
      sortOrder: index
    });
  });

  for (const categoryId of input.deleteCategoryIds) {
    const id = categoryId.trim();
    if (!id || isUncategorized(id)) {
      continue;
    }
    steps.push({ kind: "delete-category", categoryId: id });
  }

  for (const tag of input.upsertTags) {
    const name = tag.name.trim();
    if (!name) {
      continue;
    }
    steps.push({ kind: "upsert-tag", name, categoryId: tag.categoryId || UNCATEGORIZED });
  }

  for (const rename of input.renameTags) {
    const oldName = rename.oldName.trim();
    const newName = rename.newName.trim();
    if (!oldName || !newName) {
      continue;
    }
    steps.push({
      kind: "rename-tag",
      oldName,
      newName,
      newCategoryId: rename.newCategoryId
    });
  }

  for (const tag of input.deleteTags) {
    const name = tag.name.trim();
    if (!name) {
      continue;
    }
    steps.push({ kind: "delete-tag", name });
  }

  const itemIds = input.itemIds.map((id) => id.trim()).filter(Boolean);
  const addTags = input.addTags.map((tag) => tag.trim()).filter(Boolean);
  const removeTags = input.removeTags.map((tag) => tag.trim()).filter(Boolean);
  if (itemIds.length > 0 && (addTags.length > 0 || removeTags.length > 0)) {
    steps.push({ kind: "apply-item-tags", itemIds, addTags, removeTags });
  }

  const assignments = input.autoTagAssignments
    .map((assignment) => ({
      tagName: assignment.tagName.trim(),
      itemPaths: assignment.itemPaths.map((path) => path.trim()).filter(Boolean)
    }))
    .filter((assignment) => assignment.tagName && assignment.itemPaths.length > 0);
  if (assignments.length > 0) {
    steps.push({ kind: "apply-auto-tag", assignments });
  }

  return steps;
}

export async function runTagEditorSave(
  steps: readonly TagSaveStep[],
  client: { post(step: TagSaveStep): Promise<boolean> }
): Promise<TagSaveRun> {
  const accepted: TagSaveStep[] = [];
  for (const step of steps) {
    let ok = false;
    try {
      ok = await client.post(step);
    } catch {
      return { ok: false, accepted, failed: step };
    }
    if (!ok) {
      return { ok: false, accepted, failed: step };
    }
    accepted.push(step);
  }
  return { ok: true, accepted, failed: null };
}

function itemMatches(item: TaggedItem, identifier: string): boolean {
  const key = identifier.trim().toLowerCase();
  if (!key) {
    return false;
  }
  if (item.id.trim().toLowerCase() === key) {
    return true;
  }
  return (item.fullPath ?? "").trim().toLowerCase() === key;
}

function hasTag(tags: readonly string[], name: string): boolean {
  const key = name.trim().toLowerCase();
  return tags.some((tag) => tag.trim().toLowerCase() === key);
}

export type TagUndo = {
  itemId: string;
  remove: string[];
  add: string[];
};

export function applyTagSaveLocally(items: TaggedItem[], steps: readonly TagSaveStep[]): void {
  recordTagSave(items, steps);
}

export function recordTagSave(items: TaggedItem[], steps: readonly TagSaveStep[]): TagUndo[][] {
  return steps.map((step) => recordTagStep(items, step));
}

function recordTagStep(items: TaggedItem[], step: TagSaveStep): TagUndo[] {
  const undos: TagUndo[] = [];
  if (step.kind === "rename-tag") {
    for (const item of items) {
      if (!hasTag(item.tags, step.oldName)) {
        continue;
      }
      const before = item.tags.slice();
      item.tags = mergeLibraryItemTags(
        mergeLibraryItemTags(item.tags, [], [step.oldName]),
        [step.newName],
        []
      );
      recordChange(undos, item, before);
    }
    return undos;
  }
  if (step.kind === "delete-tag") {
    for (const item of items) {
      if (!hasTag(item.tags, step.name)) {
        continue;
      }
      const before = item.tags.slice();
      item.tags = mergeLibraryItemTags(item.tags, [], [step.name]);
      recordChange(undos, item, before);
    }
    return undos;
  }
  if (step.kind === "apply-item-tags") {
    for (const item of items) {
      if (!step.itemIds.some((id) => itemMatches(item, id))) {
        continue;
      }
      const before = item.tags.slice();
      item.tags = mergeLibraryItemTags(item.tags, step.addTags, step.removeTags);
      recordChange(undos, item, before);
    }
    return undos;
  }
  if (step.kind === "apply-auto-tag") {
    for (const assignment of step.assignments) {
      for (const item of items) {
        if (!assignment.itemPaths.some((path) => itemMatches(item, path))) {
          continue;
        }
        const before = item.tags.slice();
        item.tags = mergeLibraryItemTags(item.tags, [assignment.tagName], []);
        recordChange(undos, item, before);
      }
    }
  }
  return undos;
}

function recordChange(undos: TagUndo[], item: TaggedItem, before: readonly string[]): void {
  const removed = before.filter((tag) => !hasTag(item.tags, tag));
  const added = item.tags.filter((tag) => !hasTag(before, tag));
  if (removed.length === 0 && added.length === 0) {
    return;
  }
  undos.push({ itemId: item.id, remove: added, add: removed });
}

export function undoTagChanges(items: TaggedItem[], undos: readonly TagUndo[]): void {
  for (const undo of undos) {
    for (const item of items) {
      if (item.id.trim().toLowerCase() !== undo.itemId.trim().toLowerCase()) {
        continue;
      }
      item.tags = mergeLibraryItemTags(item.tags, undo.add, undo.remove);
    }
  }
}

export type IncomingItemTags = {
  itemIds?: readonly string[] | null;
  addedTags?: readonly string[] | null;
  removedTags?: readonly string[] | null;
  catalogReplacedTag?: string | null;
  catalogReplacementTag?: string | null;
};

export type IncomingTagHandling = {
  hadTagFilter: boolean;
  reloadBecauseFilterCleared: boolean;
};

export function handleIncomingItemTags(
  payload: IncomingItemTags,
  actions: {
    tagFilterCanChangeMembership(): boolean;
    retarget(step: TagSaveStep): void;
    afterRetarget(handling: IncomingTagHandling): void;
  }
): void {
  const hadTagFilter = actions.tagFilterCanChangeMembership();
  const step = catalogRetargetStep(payload);
  if (step) {
    actions.retarget(step);
  }
  const stillHasTagFilter = actions.tagFilterCanChangeMembership();
  actions.afterRetarget({
    hadTagFilter,
    reloadBecauseFilterCleared: hadTagFilter && !stillHasTagFilter
  });
}

function catalogRetargetStep(payload: IncomingItemTags): TagSaveStep | null {
  const oldName = String(payload.catalogReplacedTag ?? "").trim();
  if (!oldName) {
    return null;
  }
  const newName = String(payload.catalogReplacementTag ?? "").trim();
  if (!newName) {
    return { kind: "delete-tag", name: oldName };
  }
  return { kind: "rename-tag", oldName, newName, newCategoryId: null };
}

export function retargetTagFilter(selected: string[], excluded: string[], step: TagSaveStep): boolean {
  if (step.kind === "rename-tag") {
    const selectedChanged = replaceFilterTag(selected, step.oldName, step.newName);
    const excludedChanged = replaceFilterTag(excluded, step.oldName, step.newName);
    return selectedChanged || excludedChanged;
  }
  if (step.kind === "delete-tag") {
    const selectedChanged = removeFilterTag(selected, step.name);
    const excludedChanged = removeFilterTag(excluded, step.name);
    return selectedChanged || excludedChanged;
  }
  return false;
}

function replaceFilterTag(tags: string[], oldName: string, newName: string): boolean {
  const next = newName.trim();
  if (!oldName.trim() || !next) {
    return false;
  }
  let changed = false;
  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i] ?? "";
    if (tag.trim().toLowerCase() !== oldName.trim().toLowerCase() || tag === next) {
      continue;
    }
    tags[i] = next;
    changed = true;
  }
  return changed;
}

function removeFilterTag(tags: string[], name: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) {
    return false;
  }
  let changed = false;
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    if ((tags[i] ?? "").trim().toLowerCase() !== key) {
      continue;
    }
    tags.splice(i, 1);
    changed = true;
  }
  return changed;
}

export type TagSaveAppliedTag = {
  tagName: string;
  changedItemPaths: readonly string[];
};

export function replaceWithLiveTags(loaded: TaggedItem[], current: readonly TaggedItem[]): void {
  const byId = new Map(current.map((item) => [item.id.trim().toLowerCase(), item.tags ?? []]));
  for (const item of loaded) {
    const key = item.id.trim().toLowerCase();
    if (!byId.has(key)) {
      continue;
    }
    item.tags = (byId.get(key) ?? []).slice();
  }
}

export function snapshotTags(items: readonly TaggedItem[]): Array<{ id: string; tags: string[] }> {
  return items.map((item) => ({ id: item.id, tags: item.tags.slice() }));
}

export function restoreTags(items: TaggedItem[], snapshot: readonly { id: string; tags: readonly string[] }[]): void {
  const byId = new Map(snapshot.map((entry) => [entry.id.trim().toLowerCase(), entry.tags]));
  for (const item of items) {
    const tags = byId.get(item.id.trim().toLowerCase());
    if (!tags) {
      continue;
    }
    item.tags = tags.slice();
  }
}

export function rollbackTagSave(
  items: TaggedItem[],
  snapshot: readonly { id: string; tags: readonly string[] }[],
  accepted: readonly TagSaveStep[]
): void {
  restoreTags(items, snapshot);
  applyTagSaveLocally(items, accepted);
}

export function echoesForSave(steps: readonly TagSaveStep[]): TagEcho[] {
  const echoes: TagEcho[] = [];
  for (const step of steps) {
    if (step.kind === "apply-item-tags") {
      echoes.push({
        itemIds: step.itemIds,
        addedTags: step.addTags,
        removedTags: step.removeTags
      });
      continue;
    }
    if (step.kind !== "apply-auto-tag") {
      continue;
    }
    for (const assignment of step.assignments) {
      const tagName = assignment.tagName.trim();
      if (!tagName) {
        continue;
      }
      const seen = new Set<string>();
      const itemIds: string[] = [];
      for (const path of assignment.itemPaths) {
        const trimmed = path.trim();
        const key = trimmed.toLowerCase();
        if (!trimmed || seen.has(key)) {
          continue;
        }
        seen.add(key);
        itemIds.push(trimmed);
      }
      if (itemIds.length === 0) {
        continue;
      }
      echoes.push({
        itemIds,
        addedTags: [tagName],
        removedTags: [],
        subsetPaths: true
      });
    }
  }
  return echoes;
}

function norm(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }
  result.sort();
  return result;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  const a = norm(left);
  const b = norm(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function matchesEcho(expected: TagEcho, incoming: TagEcho): boolean {
  if (!sameList(expected.addedTags, incoming.addedTags) || !sameList(expected.removedTags, incoming.removedTags)) {
    return false;
  }
  if (expected.supersetIds) {
    const expectedIds = norm(expected.itemIds);
    if (expectedIds.length === 0) {
      return false;
    }
    const incomingIds = new Set(norm(incoming.itemIds));
    return expectedIds.every((id) => incomingIds.has(id));
  }
  if (!expected.subsetPaths) {
    return sameList(expected.itemIds, incoming.itemIds);
  }
  const incomingIds = norm(incoming.itemIds);
  if (incomingIds.length === 0) {
    return false;
  }
  const expectedIds = new Set(norm(expected.itemIds));
  return incomingIds.every((id) => expectedIds.has(id));
}

export type TagSaveHandle = { id: number };

type PendingEcho = { echo: TagEcho; seen: boolean; confirmed: boolean; stepIndex: number; undos: TagUndo[] };
type PendingSave = {
  handle: TagSaveHandle;
  steps: TagSaveStep[];
  undos: TagUndo[][];
  echoes: PendingEcho[];
  forceReload: boolean;
  tagFilterCanChangeMembership: boolean;
  reloadDone: boolean;
  httpDone: boolean;
  folded: boolean;
};

export function createTagSaveSession() {
  const saves: PendingSave[] = [];
  let baseline: TaggedItem[] = [];
  let nextId = 0;

  function copyItems(items: readonly TaggedItem[]): TaggedItem[] {
    return items.map((item) => ({
      id: item.id,
      fullPath: item.fullPath,
      tags: item.tags.slice()
    }));
  }

  function fold(save: PendingSave): void {
    if (save.folded) {
      return;
    }
    applyTagSaveLocally(baseline, save.steps);
    save.folded = true;
  }

  function find(handle: TagSaveHandle): PendingSave | undefined {
    return saves.find((save) => save.handle.id === handle.id);
  }

  function findEcho(echo: TagEcho, superset: boolean): { save: PendingSave; slot: PendingEcho } | null {
    let best: { save: PendingSave; slot: PendingEcho } | null = null;
    let bestCount = Number.POSITIVE_INFINITY;
    for (const save of saves) {
      for (const slot of save.echoes) {
        if (slot.seen || Boolean(slot.echo.supersetIds) !== superset || !matchesEcho(slot.echo, echo)) {
          continue;
        }
        const count = norm(slot.echo.itemIds).length;
        if (count >= bestCount) {
          continue;
        }
        best = { save, slot };
        bestCount = count;
      }
    }
    return best;
  }

  function dropIfFinished(save: PendingSave): void {
    if (save.httpDone && save.echoes.every((slot) => slot.seen)) {
      const index = saves.indexOf(save);
      if (index >= 0) {
        saves.splice(index, 1);
      }
    }
  }

  function project(items: TaggedItem[]): void {
    for (const save of saves.slice()) {
      applyTagSaveLocally(items, save.steps);
    }
  }

  return {
    begin(items: TaggedItem[], steps: readonly TagSaveStep[], forceReload = false, tagFilterCanChangeMembership = false): TagSaveHandle {
      if (saves.length === 0) {
        baseline = copyItems(items);
      }
      const undos = recordTagSave(items, steps);
      const handle = { id: ++nextId };
      saves.push({
        handle,
        steps: steps.slice(),
        undos,
        echoes: buildPendingEchoes(steps, undos),
        forceReload,
        tagFilterCanChangeMembership,
        reloadDone: false,
        httpDone: false,
        folded: false
      });
      return handle;
    },
    fail(handle: TagSaveHandle, items: TaggedItem[], accepted: readonly TagSaveStep[]): boolean {
      const save = find(handle);
      if (!save || save.httpDone) {
        return false;
      }
      project(items);
      let rolledBack = false;
      for (let stepIndex = save.undos.length - 1; stepIndex >= accepted.length; stepIndex -= 1) {
        const slots = save.echoes.filter((slot) => slot.stepIndex === stepIndex);
        if (slots.length === 0) {
          const stepUndo = save.undos[stepIndex] ?? [];
          if (stepUndo.length > 0) {
            undoTagChanges(items, stepUndo.slice().reverse());
          }
          rolledBack = true;
          continue;
        }
        let stepFailed = false;
        for (let slotIndex = slots.length - 1; slotIndex >= 0; slotIndex -= 1) {
          const slot = slots[slotIndex];
          if (!slot || slot.confirmed) {
            continue;
          }
          stepFailed = true;
          if (slot.undos.length > 0) {
            undoTagChanges(items, slot.undos.slice().reverse());
          }
        }
        if (stepFailed) {
          rolledBack = true;
        }
      }
      save.steps = accepted.slice();
      fold(save);
      const index = saves.indexOf(save);
      if (index >= 0) {
        saves.splice(index, 1);
      }
      return rolledBack;
    },
    project,
    sweep(): void {
      for (let index = saves.length - 1; index >= 0; index -= 1) {
        const save = saves[index];
        if (save && save.httpDone && save.echoes.every((slot) => slot.seen)) {
          saves.splice(index, 1);
        }
      }
    },
    noteAutoTagResult(handle: TagSaveHandle, applied: readonly TagSaveAppliedTag[]): void {
      const save = find(handle);
      if (!save) {
        return;
      }
      const changedByTag = new Map<string, Set<string>>();
      for (const row of applied) {
        const tags = norm([row.tagName]);
        if (tags.length !== 1) {
          continue;
        }
        const key = tags[0] ?? "";
        let paths = changedByTag.get(key);
        if (!paths) {
          paths = new Set<string>();
          changedByTag.set(key, paths);
        }
        for (const path of norm(row.changedItemPaths)) {
          paths.add(path);
        }
      }
      for (const slot of save.echoes) {
        if (slot.seen || !slot.echo.subsetPaths) {
          continue;
        }
        const tags = norm(slot.echo.addedTags);
        const paths = tags.length === 1 ? changedByTag.get(tags[0] ?? "") : undefined;
        if (!paths || !norm(slot.echo.itemIds).some((path) => paths.has(path))) {
          slot.seen = true;
        }
      }
      dropIfFinished(save);
    },
    succeed(handle: TagSaveHandle, reloadOnLand: boolean): TagEchoDecision {
      const save = find(handle);
      if (!save || save.httpDone) {
        return { skipPatch: true, reload: false };
      }
      const reload = (save.forceReload || reloadOnLand || save.tagFilterCanChangeMembership) && !save.reloadDone;
      if (reload) {
        save.reloadDone = true;
      }
      save.httpDone = true;
      fold(save);
      dropIfFinished(save);
      return { skipPatch: true, reload };
    },
    onEcho(echo: TagEcho, reloadOnLand: boolean): TagEchoDecision {
      const match = findEcho(echo, false) ?? findEcho(echo, true);
      if (!match) {
        return { skipPatch: false, reload: false };
      }
      match.slot.seen = true;
      match.slot.confirmed = true;
      if (match.slot.echo.supersetIds) {
        return { skipPatch: false, reload: false };
      }
      const reload = (match.save.forceReload || reloadOnLand || match.save.tagFilterCanChangeMembership) && !match.save.reloadDone;
      if (reload) {
        match.save.reloadDone = true;
      }
      return { skipPatch: true, reload };
    }
  };
}

function buildPendingEchoes(steps: readonly TagSaveStep[], undos: TagUndo[][]): PendingEcho[] {
  const echoes: PendingEcho[] = [];
  steps.forEach((step, stepIndex) => {
    const stepUndos = undos[stepIndex] ?? [];
    if (step.kind === "apply-item-tags") {
      echoes.push({
        echo: { itemIds: step.itemIds, addedTags: step.addTags, removedTags: step.removeTags },
        seen: false,
        confirmed: false,
        stepIndex,
        undos: stepUndos.slice()
      });
      return;
    }
    if (step.kind === "apply-auto-tag") {
      const pool = stepUndos.slice();
      for (const assignment of step.assignments) {
        const tagName = assignment.tagName.trim();
        if (!tagName) {
          continue;
        }
        const seen = new Set<string>();
        const itemIds: string[] = [];
        for (const path of assignment.itemPaths) {
          const trimmed = path.trim();
          const key = trimmed.toLowerCase();
          if (!trimmed || seen.has(key)) {
            continue;
          }
          seen.add(key);
          itemIds.push(trimmed);
        }
        if (itemIds.length === 0) {
          continue;
        }
        const mine: TagUndo[] = [];
        for (let index = pool.length - 1; index >= 0; index -= 1) {
          const undo = pool[index];
          if (undo && undo.remove.some((tag) => tag.trim().toLowerCase() === tagName.toLowerCase())) {
            mine.push(undo);
            pool.splice(index, 1);
          }
        }
        mine.reverse();
        echoes.push({
          echo: { itemIds, addedTags: [tagName], removedTags: [], subsetPaths: true },
          seen: false,
          confirmed: false,
          stepIndex,
          undos: mine
        });
      }
      return;
    }
    if (step.kind !== "rename-tag" && step.kind !== "delete-tag") {
      return;
    }
    const ids = [...new Set(stepUndos.map((undo) => undo.itemId.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return;
    }
    const added = step.kind === "rename-tag" ? [step.newName.trim()].filter(Boolean) : [];
    const removed = step.kind === "rename-tag" ? [step.oldName.trim()].filter(Boolean) : [step.name.trim()].filter(Boolean);
    echoes.push({
      echo: { itemIds: ids, addedTags: added, removedTags: removed, supersetIds: true },
      seen: false,
      confirmed: false,
      stepIndex,
      undos: stepUndos.slice()
    });
  });
  return echoes;
}
