import { compareTagNames } from "./library/tagNameOrder.ts";
import {
  createAutoTagScanRequest,
  libraryQueryTagSaveEffect
} from "./library/libraryQuerySession.ts";
import {
  createTagSaveSession,
  handleIncomingItemTags,
  planTagEditorSave,
  retargetTagFilter,
  runTagEditorSave
} from "./library/tagSave.ts";

const TAG_EDITOR_COLLAPSED_KEY = "rr_tagEditorCollapsed";
const AUTO_TAG_SCAN_FULL_KEY = "rr_autoTagScanFullLibrary";
const UNCATEGORIZED_CATEGORY_ID = "uncategorized";

function getElement(id) {
  return document.getElementById(id);
}

export function startApp({ store, api, connection, player, library }) {
  const setStatus = store.setStatus;
  const apiPost = api.post;
  const state = {
    // Shared with the Preact screens: these read and write the store's signals.
    get presets() { return store.presets.peek(); },
    get current() { return store.current.peek(); },
    get appliedFilterState() { return store.appliedFilter.peek(); },
    tagEditorModel: null,
    tagEditorOpen: false,
    tagEditorCategoryOrder: [],
    tagEditorSelections: new Map(),
    tagEditorPending: null,
    tagEditorCollapsedCategories: new Set(),
    tagEditorItemIds: [],
    tagEditorCategoryOrderDirty: false,
    tagEditContext: null,
    tagEditorActiveTab: "edit",
    autoTagScanInFlight: false,
    autoTagRows: [],
    autoTagScanHasRun: false
  };

  const tagSaveSession = createTagSaveSession();
  const librarySession = library.session;

  const tagEditor = getElement("tag-editor");
  const tagEditorBody = getElement("tag-editor-body");
  const tagEditorCloseBtn = getElement("tag-editor-close-btn");
  const tagEditorRefreshBtn = getElement("tag-editor-refresh-btn");
  const tagEditorAddCategoryBtn = getElement("tag-editor-add-category-btn");
  const tagEditorCategorySelect = getElement("tag-editor-category-select");
  const tagEditorNewTag = getElement("tag-editor-new-tag");
  const tagEditorAddTagBtn = getElement("tag-editor-add-tag-btn");
  const tagEditorApplyBtn = getElement("tag-editor-apply-btn");
  const tagEditorPanelEdit = getElement("tag-editor-panel-edit");
  const tagEditorPanelAutotag = getElement("tag-editor-panel-autotag");
  const tagAutotagScanFull = getElement("tag-autotag-scan-full");
  const tagAutotagViewAll = getElement("tag-autotag-view-all");
  const tagAutotagSelectAll = getElement("tag-autotag-select-all");
  const tagAutotagDeselectAll = getElement("tag-autotag-deselect-all");
  const tagAutotagScanBtn = getElement("tag-autotag-scan-btn");
  const tagAutotagProgress = getElement("tag-autotag-progress");
  const tagAutotagStatus = getElement("tag-autotag-status");
  const tagAutotagResults = getElement("tag-autotag-results");
  const tagEditModal = getElement("tag-edit-modal");
  const tagEditName = getElement("tag-edit-name");
  const tagEditCategory = getElement("tag-edit-category");
  const tagEditCancelBtn = getElement("tag-edit-cancel-btn");
  const tagEditSaveBtn = getElement("tag-edit-save-btn");

  if (
    !tagEditor || !tagEditorBody ||
    !tagEditorCloseBtn || !tagEditorRefreshBtn || !tagEditorAddCategoryBtn || !tagEditorCategorySelect ||
    !tagEditorNewTag || !tagEditorAddTagBtn || !tagEditorApplyBtn || !tagEditorPanelEdit || !tagEditorPanelAutotag ||
    !tagAutotagScanFull || !tagAutotagViewAll || !tagAutotagSelectAll || !tagAutotagDeselectAll || !tagAutotagScanBtn ||
    !tagAutotagProgress || !tagAutotagStatus || !tagAutotagResults || !tagEditModal || !tagEditName ||
    !tagEditCategory || !tagEditCancelBtn || !tagEditSaveBtn
  ) {
    throw new Error("Legacy WebUI bootstrap failed: missing required DOM elements.");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setButtonSymbol(button, symbolName) {
    if (!button) return;
    const iconNode = button.querySelector(".material-symbol-icon");
    if (iconNode) {
      iconNode.textContent = symbolName;
      return;
    }

    button.textContent = symbolName;
  }

  function createMaterialSymbolNode(symbolName) {
    const icon = document.createElement("span");
    icon.className = "material-symbol-icon";
    icon.textContent = symbolName;
    return icon;
  }

  function createTagEditorPending() {
    return {
      upsertCategories: new Map(),
      deleteCategoryIds: new Set(),
      upsertTags: new Map(),
      renameTags: new Map(),
      deleteTags: new Map()
    };
  }

  function resetTagEditorPending() {
    state.tagEditorSelections = new Map();
    state.tagEditorPending = createTagEditorPending();
    state.tagEditorCategoryOrderDirty = false;
  }

  function normalizeTagKey(tagName) {
    return String(tagName || "").trim().toLowerCase();
  }

  function isUncategorizedCategoryId(categoryId) {
    const id = String(categoryId || "").trim().toLowerCase();
    return id === "" || id === UNCATEGORIZED_CATEGORY_ID;
  }

  function isUncategorizedCategory(category) {
    if (!category) return false;
    if (isUncategorizedCategoryId(category.id)) return true;
    return String(category.name || "").trim().toLowerCase() === "uncategorized";
  }

  function loadTagEditorCollapsedCategories() {
    try {
      const raw = sessionStorage.getItem(TAG_EDITOR_COLLAPSED_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((id) => String(id || "")));
    } catch {
      return new Set();
    }
  }

  function persistTagEditorCollapsedCategories() {
    try {
      sessionStorage.setItem(TAG_EDITOR_COLLAPSED_KEY, JSON.stringify(Array.from(state.tagEditorCollapsedCategories)));
    } catch {
      // best effort
    }
  }

  function canonicalizeCategories(categories) {
    const deduped = new Map();
    for (const category of categories || []) {
      const id = isUncategorizedCategory(category) ? UNCATEGORIZED_CATEGORY_ID : String(category.id || "");
      const normalized = {
        id,
        name: id === UNCATEGORIZED_CATEGORY_ID ? "Uncategorized" : String(category.name || ""),
        sortOrder: Number(category.sortOrder ?? 0)
      };
      if (!deduped.has(normalized.id)) {
        deduped.set(normalized.id, normalized);
      }
    }

    return Array.from(deduped.values());
  }

  function ensureUncategorizedCategory(categories, include) {
    const hasUncategorized = categories.some((category) => isUncategorizedCategoryId(category.id));
    if (include && !hasUncategorized) {
      categories.push({ id: UNCATEGORIZED_CATEGORY_ID, name: "Uncategorized", sortOrder: Number.MAX_SAFE_INTEGER });
    }

    if (!include && hasUncategorized) {
      categories = categories.filter((category) => !isUncategorizedCategoryId(category.id));
    }

    return categories;
  }

  function reorderCategories(baseCategories) {
    const includeUncategorized = baseCategories.some((category) => isUncategorizedCategoryId(category.id));
    const byId = new Map(baseCategories.map((category) => [String(category.id || ""), category]));
    if (!Array.isArray(state.tagEditorCategoryOrder) || state.tagEditorCategoryOrder.length === 0) {
      state.tagEditorCategoryOrder = baseCategories.map((category) => String(category.id || ""));
    }

    const ordered = [];
    const seen = new Set();
    for (const id of state.tagEditorCategoryOrder) {
      const key = String(id || "");
      if (seen.has(key) || !byId.has(key)) continue;
      ordered.push(byId.get(key));
      seen.add(key);
    }

    for (const category of baseCategories) {
      const key = String(category.id || "");
      if (seen.has(key) || isUncategorizedCategoryId(key)) continue;
      ordered.push(category);
      seen.add(key);
    }

    if (includeUncategorized && !seen.has(UNCATEGORIZED_CATEGORY_ID)) {
      ordered.push(byId.get(UNCATEGORIZED_CATEGORY_ID) || {
        id: UNCATEGORIZED_CATEGORY_ID,
        name: "Uncategorized",
        sortOrder: Number.MAX_SAFE_INTEGER
      });
    }

    state.tagEditorCategoryOrder = ordered.map((category) => String(category.id || ""));
    return ordered;
  }

  function getCategoryOptionsForInputs(categories) {
    const options = canonicalizeCategories(Array.isArray(categories) ? categories.slice() : []);
    if (!options.some((category) => isUncategorizedCategoryId(category.id))) {
      options.push({ id: UNCATEGORIZED_CATEGORY_ID, name: "Uncategorized", sortOrder: Number.MAX_SAFE_INTEGER });
    }
    options.sort((a, b) => {
      const x = Number(a.sortOrder || 0);
      const y = Number(b.sortOrder || 0);
      if (x !== y) return x - y;
      return compareTagNames(a.name, b.name);
    });
    return options;
  }

  function getCurrentTagEditorItemIds() {
    if (Array.isArray(state.tagEditorItemIds) && state.tagEditorItemIds.length > 0) {
      return state.tagEditorItemIds.slice();
    }
    return state.current?.itemId ? [state.current.itemId] : [];
  }

  function computeTagStateForItems(tagName, items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return "state-none";
    const key = normalizeTagKey(tagName);
    let withTag = 0;
    for (const item of list) {
      const itemTags = Array.isArray(item?.tags) ? item.tags : [];
      if (itemTags.some((tag) => normalizeTagKey(tag) === key)) {
        withTag += 1;
      }
    }
    if (withTag === 0) return "state-none";
    if (withTag === list.length) return "state-all";
    return "state-some";
  }

  function getPendingTagAction(tagName) {
    return state.tagEditorSelections.get(normalizeTagKey(tagName))?.action || null;
  }

  function toggleTagSelection(tagName, action) {
    const key = normalizeTagKey(tagName);
    const current = state.tagEditorSelections.get(key);
    if (current?.action === action) {
      state.tagEditorSelections.delete(key);
      return;
    }
    state.tagEditorSelections.set(key, { action, name: tagName });
  }

  function toggleCategoryCollapsed(categoryId) {
    const key = String(categoryId || "");
    if (state.tagEditorCollapsedCategories.has(key)) {
      state.tagEditorCollapsedCategories.delete(key);
    } else {
      state.tagEditorCollapsedCategories.add(key);
    }
    persistTagEditorCollapsedCategories();
    renderTagEditor();
  }

  function moveCategory(categoryId, direction) {
    const id = String(categoryId || "");
    if (!id || isUncategorizedCategoryId(id)) return;
    const order = state.tagEditorCategoryOrder.slice();
    const movable = order.filter((value) => !isUncategorizedCategoryId(value));
    const currentIndex = movable.indexOf(id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= movable.length) return;
    const temp = movable[currentIndex];
    movable[currentIndex] = movable[nextIndex];
    movable[nextIndex] = temp;
    const hasUncategorized = order.some((value) => isUncategorizedCategoryId(value));
    state.tagEditorCategoryOrder = hasUncategorized ? movable.concat([UNCATEGORIZED_CATEGORY_ID]) : movable;
    state.tagEditorCategoryOrderDirty = true;
    renderTagEditor();
  }

  function queueDeleteCategory(category) {
    if (!category || isUncategorizedCategoryId(category.id)) return;
    state.tagEditorPending.deleteCategoryIds.add(String(category.id));
    state.tagEditorPending.upsertCategories.delete(String(category.id));
    state.tagEditorCategoryOrder = state.tagEditorCategoryOrder.filter((id) => String(id) !== String(category.id));
    renderTagEditor();
  }

  function queueDeleteTag(tagName) {
    const key = normalizeTagKey(tagName);
    state.tagEditorPending.deleteTags.set(key, { name: tagName });
    state.tagEditorPending.upsertTags.delete(key);
    state.tagEditorPending.renameTags.delete(key);
    state.tagEditorSelections.delete(key);
    renderTagEditor();
  }

  function queueRenameTag(oldTagName, newTagName, newCategoryId) {
    const oldKey = normalizeTagKey(oldTagName);
    state.tagEditorPending.deleteTags.delete(oldKey);
    state.tagEditorPending.renameTags.set(oldKey, {
      oldName: oldTagName,
      newName: newTagName,
      newCategoryId: typeof newCategoryId === "string" ? newCategoryId : null
    });
    renderTagEditor();
  }

  function hasPendingTagEditorMutations() {
    const pending = state.tagEditorPending;
    if (!pending) return state.tagEditorSelections.size > 0 || state.tagEditorCategoryOrderDirty;
    return (
      state.tagEditorCategoryOrderDirty ||
      state.tagEditorSelections.size > 0 ||
      pending.upsertCategories.size > 0 ||
      pending.deleteCategoryIds.size > 0 ||
      pending.upsertTags.size > 0 ||
      pending.renameTags.size > 0 ||
      pending.deleteTags.size > 0
    );
  }

  function loadPersistedAutoTagScanFull() {
    try {
      return localStorage.getItem(AUTO_TAG_SCAN_FULL_KEY) === "true";
    } catch {
      return false;
    }
  }

  function persistAutoTagScanFull(value) {
    try {
      localStorage.setItem(AUTO_TAG_SCAN_FULL_KEY, value ? "true" : "false");
    } catch {
      // best effort
    }
  }

  function resetAutoTagState() {
    state.autoTagRows = [];
    state.autoTagScanHasRun = false;
    state.autoTagScanInFlight = false;
    if (tagAutotagStatus) tagAutotagStatus.textContent = "";
    if (tagAutotagProgress) tagAutotagProgress.style.display = "none";
    if (tagAutotagResults) tagAutotagResults.innerHTML = "";
  }

  function getAutoTagViewAllMatches() {
    return !!(tagAutotagViewAll && tagAutotagViewAll.checked);
  }

  function findAutoTagRowByRowId(rid) {
    const n = Number(rid);
    return state.autoTagRows.find((r) => r._rowId === n) || null;
  }

  function getVisibleAutoTagFiles(row) {
    const viewAll = getAutoTagViewAllMatches();
    const files = Array.isArray(row.files) ? row.files : [];
    return files.filter((f) => viewAll || f.needsChange);
  }

  function getAutoTagVisibleRowIndices() {
    const viewAll = getAutoTagViewAllMatches();
    const indices = [];
    state.autoTagRows.forEach((row, idx) => {
      if (viewAll || (row.wouldChangeCount || 0) > 0) {
        indices.push(idx);
      }
    });
    indices.sort((a, b) => compareTagNames(state.autoTagRows[a].tagName, state.autoTagRows[b].tagName));
    return indices;
  }

  function syncAutoTagRowHeaderCheckbox(row) {
    const visible = getVisibleAutoTagFiles(row);
    const input = tagAutotagResults && tagAutotagResults.querySelector(`input[data-autotag-row-check="${row._rowId}"]`);
    if (!input || visible.length === 0) return;
    const n = visible.filter((f) => f.selected).length;
    input.indeterminate = n > 0 && n < visible.length;
    input.checked = n === visible.length && n > 0;
  }

  function updateAutoTagStatusSummary() {
    if (!tagAutotagStatus || !state.autoTagScanHasRun) return;
    if (state.autoTagRows.length === 0) {
      tagAutotagStatus.textContent = "Scan complete: no matching tags found.";
      return;
    }
    const matchingTags = state.autoTagRows.length;
    let totalMatches = 0;
    let totalWouldChange = 0;
    let selectedChanges = 0;
    for (const row of state.autoTagRows) {
      totalMatches += row.totalMatchedCount || 0;
      totalWouldChange += row.wouldChangeCount || 0;
      for (const f of getVisibleAutoTagFiles(row)) {
        if (f.needsChange && f.selected) selectedChanges += 1;
      }
    }
    tagAutotagStatus.textContent = `Scan complete: ${matchingTags} matching tags, ${totalMatches} matches, ${selectedChanges}/${totalWouldChange} selected changes.`;
  }

  function hasAutoTagApplyPending() {
    if (!state.autoTagScanHasRun || state.autoTagRows.length === 0) return false;
    for (const row of state.autoTagRows) {
      for (const f of getVisibleAutoTagFiles(row)) {
        if (f.needsChange && f.selected) return true;
      }
    }
    return false;
  }

  function shouldConfirmDiscardTagOverlay() {
    return hasPendingTagEditorMutations() || hasAutoTagApplyPending();
  }

  function buildAutoTagAssignments() {
    const assignments = [];
    for (const row of state.autoTagRows) {
      const paths = [];
      const itemIds = [];
      for (const f of getVisibleAutoTagFiles(row)) {
        if (f.selected && f.fullPath && f.itemId) {
          paths.push(String(f.fullPath));
          itemIds.push(String(f.itemId));
        }
      }
      if (paths.length > 0) {
        assignments.push({ tagName: String(row.tagName || ""), itemPaths: paths, itemIds });
      }
    }
    return assignments;
  }

  function updateTagOverlaySaveButtonState() {
    const manual = hasPendingTagEditorMutations();
    const autoP = hasAutoTagApplyPending();
    const hasAny = manual || autoP;
    const block = state.autoTagScanInFlight;
    tagEditorApplyBtn.classList.toggle("has-pending", hasAny);
    tagEditorApplyBtn.disabled = !hasAny || block;
  }

  function updateAutotagChromeDisabled() {
    const busy = state.autoTagScanInFlight;
    if (tagAutotagScanBtn) tagAutotagScanBtn.disabled = busy;
    if (tagEditorCloseBtn) tagEditorCloseBtn.disabled = busy;
    if (tagEditorRefreshBtn) tagEditorRefreshBtn.disabled = busy;
    updateTagOverlaySaveButtonState();
  }

  function renderAutoTagPanel() {
    if (!tagAutotagResults) return;
    if (!state.autoTagScanHasRun) {
      tagAutotagResults.innerHTML = "";
      return;
    }
    if (state.autoTagRows.length === 0) {
      tagAutotagResults.innerHTML = '<p class="tag-autotag-hint">Scan complete: no matching tags found.</p>';
      updateAutoTagStatusSummary();
      updateTagOverlaySaveButtonState();
      return;
    }
    const visIdx = getAutoTagVisibleRowIndices();
    if (visIdx.length === 0) {
      tagAutotagResults.innerHTML = '<p class="tag-autotag-hint">No rows to show.</p>';
      updateTagOverlaySaveButtonState();
      return;
    }
    const head = `<div class="tag-autotag-table-head"><span></span><span>Apply</span><span>Tag / File</span><span>Total matched</span><span>To be changed</span></div>`;
    const parts = [head];
    for (const idx of visIdx) {
      const row = state.autoTagRows[idx];
      const visibleFiles = getVisibleAutoTagFiles(row);
      const exp = row.expanded ? "expand_more" : "chevron_right";
      const filesHtml = visibleFiles
        .map((f) => {
          const rid = row._rowId;
          return `<div class="tag-autotag-file-row"><label><input type="checkbox" data-autotag-file data-row-id="${rid}" data-item-id="${escapeHtml(f.itemId || "")}" ${f.selected ? "checked" : ""}></label><span class="tag-autotag-file-path" title="${escapeHtml(f.fullPath || "")}">${escapeHtml(f.displayPath || f.fullPath || "")}</span></div>`;
        })
        .join("");
      const rowHtml = `<div class="tag-autotag-row" data-autotag-row="${row._rowId}">
        <div class="tag-autotag-row-main">
          <button type="button" class="icon-glyph-base icon-glyph-button" data-autotag-expand="${row._rowId}" aria-label="${row.expanded ? "Collapse" : "Expand"}"><span class="material-symbol-icon">${exp}</span></button>
          <input type="checkbox" data-autotag-row-check="${row._rowId}">
          <span style="font-weight:600">${escapeHtml(row.tagName || "")}</span>
          <span>${row.totalMatchedCount}</span>
          <span>${row.wouldChangeCount}</span>
        </div>
        <div class="tag-autotag-row-files" style="display:${row.expanded ? "block" : "none"}">${filesHtml}</div>
      </div>`;
      parts.push(rowHtml);
    }
    tagAutotagResults.innerHTML = parts.join("");
    for (const idx of visIdx) {
      const row = state.autoTagRows[idx];
      syncAutoTagRowHeaderCheckbox(row);
    }
    updateAutoTagStatusSummary();
    updateTagOverlaySaveButtonState();
  }

  function switchTagEditorTab(tab, silent) {
    const t = tab === "autotag" ? "autotag" : "edit";
    state.tagEditorActiveTab = t;
    const strip = tagEditor && tagEditor.querySelector(".tag-editor-tabstrip");
    if (strip) {
      strip.querySelectorAll("[data-tag-editor-tab]").forEach((btn) => {
        const on = btn.getAttribute("data-tag-editor-tab") === t;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    }
    if (tagEditorPanelEdit) tagEditorPanelEdit.style.display = t === "edit" ? "flex" : "none";
    if (tagEditorPanelAutotag) tagEditorPanelAutotag.style.display = t === "autotag" ? "flex" : "none";
    if (!silent && t === "autotag") {
      renderAutoTagPanel();
    }
  }

  async function runAutoTagScan() {
    if (state.autoTagScanInFlight) return;
    state.autoTagScanInFlight = true;
    updateAutotagChromeDisabled();
    if (tagAutotagProgress) tagAutotagProgress.style.display = "block";
    if (tagAutotagStatus) tagAutotagStatus.textContent = "Scanning…";
    try {
      const scanFull = !!(tagAutotagScanFull && tagAutotagScanFull.checked);
      const payload = createAutoTagScanRequest(scanFull);
      const resp = await apiPost("/api/autotag/scan", payload);
      if (!resp.ok) {
        throw new Error(String(resp.status));
      }
      const data = await resp.json();
      const rowsIn = Array.isArray(data.rows) ? data.rows : [];
      state.autoTagRows = [];
      let rid = 0;
      for (const r of rowsIn) {
        const files = Array.isArray(r.files) ? r.files : [];
        if (files.length === 0) continue;
        state.autoTagRows.push({
          _rowId: rid++,
          tagName: r.tagName,
          totalMatchedCount: r.totalMatchedCount,
          wouldChangeCount: r.wouldChangeCount,
          expanded: false,
          files: files.map((f) => ({
            itemId: f.itemId,
            fullPath: f.fullPath,
            displayPath: f.displayPath,
            needsChange: !!f.needsChange,
            selected: false
          }))
        });
      }
      state.autoTagScanHasRun = true;
      renderAutoTagPanel();
    } catch {
      if (tagAutotagStatus) {
        tagAutotagStatus.textContent = "Auto-tag scan failed. Core runtime is unavailable or still recovering.";
      }
      state.autoTagRows = [];
      state.autoTagScanHasRun = true;
      renderAutoTagPanel();
    } finally {
      state.autoTagScanInFlight = false;
      if (tagAutotagProgress) tagAutotagProgress.style.display = "none";
      updateAutotagChromeDisabled();
    }
  }

  function tagFilterCanChangeMembership() {
    const applied = state.appliedFilterState;
    return (applied?.selectedTags?.length || 0) > 0 || (applied?.excludedTags?.length || 0) > 0;
  }

  function tagSaveReloadOnLand() {
    const effect = libraryQueryTagSaveEffect(state.appliedFilterState);
    return librarySession.snapshot().inFlight || effect === "reload";
  }

  function collectTagSavePlan() {
    const pending = state.tagEditorPending || createTagEditorPending();
    const display = buildTagEditorDisplayModel();
    const baseline = (Array.isArray(state.tagEditorModel?.categories) ? state.tagEditorModel.categories : []).map((category) => ({
      id: String(category.id || ""),
      name: String(category.name || ""),
      sortOrder: Number(category.sortOrder || 0)
    }));
    const addTags = [];
    const removeTags = [];
    for (const selection of state.tagEditorSelections.values()) {
      if (selection?.action === "add") addTags.push(selection.name);
      else if (selection?.action === "remove") removeTags.push(selection.name);
    }
    return planTagEditorSave({
      baselineCategories: baseline,
      displayCategories: (display.categories || []).map((category) => ({
        id: String(category.id || ""),
        name: String(category.name || ""),
        sortOrder: Number(category.sortOrder || 0)
      })),
      deleteCategoryIds: [...pending.deleteCategoryIds.values()],
      upsertTags: [...pending.upsertTags.values()],
      renameTags: [...pending.renameTags.values()],
      deleteTags: [...pending.deleteTags.values()],
      itemIds: getCurrentTagEditorItemIds(),
      addTags,
      removeTags,
      autoTagAssignments: buildAutoTagAssignments()
    });
  }

  function loadedTagItems() {
    return librarySession.snapshot().items.map((item) => ({
      id: item.id,
      tags: item.tags.slice()
    }));
  }

  function writeLoadedTagItems(items) {
    librarySession.writeTags(items.map((item) => ({ itemId: item.id, tags: item.tags })));
  }

  function retargetLiveTagFilters(step) {
    if (step.kind !== "rename-tag" && step.kind !== "delete-tag") {
      return;
    }
    const applied = state.appliedFilterState;
    const filterChanged = applied
      ? retargetTagFilter(applied.selectedTags || [], applied.excludedTags || [], step)
      : false;
    let presetsChanged = false;
    for (const preset of state.presets || []) {
      const filter = preset?.filterState;
      if (!filter || !Array.isArray(filter.selectedTags) || !Array.isArray(filter.excludedTags)) {
        continue;
      }
      presetsChanged = retargetTagFilter(filter.selectedTags, filter.excludedTags, step) || presetsChanged;
    }
    librarySession.reviseStoredFilter((selected, excluded) => {
      retargetTagFilter(selected, excluded, step);
    });
    if (filterChanged || presetsChanged) {
      store.syncHeaderPresets();
    }
  }

  let tagSaveError = "";

  async function postTagSaveStep(handle, step) {
    let response;
    let label = "Tag update";
    if (step.kind === "upsert-category") {
      label = "Category update";
      response = await apiPost("/api/tag-editor/upsert-category", {
        id: step.id,
        name: step.name,
        sortOrder: step.sortOrder
      });
    } else if (step.kind === "delete-category") {
      label = "Category delete";
      response = await apiPost("/api/tag-editor/delete-category", {
        categoryId: step.categoryId,
        newCategoryId: null
      });
    } else if (step.kind === "upsert-tag") {
      label = "Tag create/update";
      response = await apiPost("/api/tag-editor/upsert-tag", {
        name: step.name,
        categoryId: step.categoryId || ""
      });
    } else if (step.kind === "rename-tag") {
      label = "Tag rename";
      response = await apiPost("/api/tag-editor/rename-tag", {
        oldName: step.oldName,
        newName: step.newName,
        newCategoryId: step.newCategoryId
      });
    } else if (step.kind === "delete-tag") {
      label = "Tag delete";
      response = await apiPost("/api/tag-editor/delete-tag", { name: step.name });
    } else if (step.kind === "apply-item-tags") {
      label = "Tag apply";
      response = await apiPost("/api/tag-editor/apply-item-tags", {
        itemIds: step.itemIds,
        addTags: step.addTags,
        removeTags: step.removeTags
      });
    } else if (step.kind === "apply-auto-tag") {
      label = "Auto-tag apply";
      response = await apiPost("/api/autotag/apply", {
        assignments: step.assignments.map((assignment) => ({
          tagName: assignment.tagName,
          itemPaths: assignment.itemPaths
        }))
      });
      if (!response.ok) {
        tagSaveError = `${label} failed (${response.status})`;
        return false;
      }
      const body = await response.json().catch(() => null);
      const rows = body?.applied || body?.Applied || [];
      const applied = Array.isArray(rows)
        ? rows.map((row) => ({
            tagName: String(row?.tagName || row?.TagName || ""),
            changedItemIds: Array.isArray(row?.changedItemIds)
              ? row.changedItemIds
              : Array.isArray(row?.ChangedItemIds)
                ? row.ChangedItemIds
                : []
          }))
        : [];
      tagSaveSession.noteAutoTagResult(handle, applied);
      retargetLiveTagFilters(step);
      return true;
    } else {
      tagSaveError = "Tag update failed";
      return false;
    }
    if (!response.ok) {
      tagSaveError = `${label} failed (${response.status})`;
      return false;
    }
    retargetLiveTagFilters(step);
    return true;
  }

  function projectLoadedTagItems() {
    const current = loadedTagItems();
    tagSaveSession.project(current);
    writeLoadedTagItems(current);
  }

  function failCurrentTagSave(handle, accepted) {
    const current = loadedTagItems();
    const rolledBack = tagSaveSession.fail(handle, current, accepted);
    writeLoadedTagItems(current);
    return rolledBack;
  }

  async function saveTagEditorInBackground(handle, steps) {
    const successStatus = "Tag editor changes applied";
    let result;
    try {
      result = await runTagEditorSave(steps, { post: (step) => postTagSaveStep(handle, step) });
    } catch (error) {
      const rolledBack = failCurrentTagSave(handle, []);
      setStatus(rolledBack ? (error?.message || `Tag apply failed: ${error}`) : successStatus);
      return;
    }
    if (!result.ok) {
      const rolledBack = failCurrentTagSave(handle, result.accepted);
      setStatus(rolledBack ? (tagSaveError || "Tag apply failed") : successStatus);
      return;
    }
    try {
      projectLoadedTagItems();
      const decision = tagSaveSession.succeed(handle, tagSaveReloadOnLand());
      if (decision.reload) {
        await librarySession.reloadLoaded();
      }
      setStatus(successStatus);
    } catch (error) {
      setStatus(error?.message || successStatus);
    }
  }

  function openTagEditModal(tag, categories) {
    state.tagEditContext = {
      oldName: tag.name,
      oldCategoryId: String(tag.categoryId || UNCATEGORIZED_CATEGORY_ID)
    };
    tagEditName.value = String(tag.name || "");
    tagEditCategory.innerHTML = "";
    for (const category of getCategoryOptionsForInputs(categories || [])) {
      const option = document.createElement("option");
      option.value = String(category.id || "");
      option.textContent = String(category.name || "");
      tagEditCategory.appendChild(option);
    }
    const currentCategoryId = String(tag.categoryId || "");
    if (Array.from(tagEditCategory.options).some((option) => option.value === currentCategoryId)) {
      tagEditCategory.value = currentCategoryId;
    } else {
      tagEditCategory.selectedIndex = 0;
    }
    tagEditModal.style.display = "flex";
    setTimeout(() => {
      try {
        tagEditName.focus();
        tagEditName.select();
      } catch {
        // ignored
      }
    }, 0);
  }

  function closeTagEditModal() {
    tagEditModal.style.display = "none";
    state.tagEditContext = null;
  }

  function buildTagEditorDisplayModel() {
    const model = state.tagEditorModel || { categories: [], tags: [], items: [] };
    const pending = state.tagEditorPending || createTagEditorPending();
    let categories = canonicalizeCategories(
      (Array.isArray(model.categories) ? model.categories : []).map((category) => ({
        id: String(category.id || ""),
        name: String(category.name || ""),
        sortOrder: Number(category.sortOrder || 0)
      }))
    );

    pending.upsertCategories.forEach((category, key) => {
      const existing = categories.find((item) => item.id === key);
      if (existing) {
        existing.name = String(category.name || existing.name || "");
      } else {
        categories.push({
          id: key,
          name: String(category.name || ""),
          sortOrder: Number(category.sortOrder || 0)
        });
      }
    });
    categories = categories.filter((category) => isUncategorizedCategoryId(category.id) || !pending.deleteCategoryIds.has(category.id));

    let tags = (Array.isArray(model.tags) ? model.tags : []).map((tag) => ({
      name: String(tag.name || ""),
      categoryId: String(tag.categoryId || UNCATEGORIZED_CATEGORY_ID)
    })).filter((tag) => tag.name.length > 0);

    pending.upsertTags.forEach((upsertTag, key) => {
      const existing = tags.find((tag) => normalizeTagKey(tag.name) === key);
      if (existing) {
        existing.categoryId = String(upsertTag.categoryId || UNCATEGORIZED_CATEGORY_ID);
      } else {
        tags.push({
          name: String(upsertTag.name || ""),
          categoryId: String(upsertTag.categoryId || UNCATEGORIZED_CATEGORY_ID)
        });
      }
    });

    pending.renameTags.forEach((renameTag) => {
      const existing = tags.find((tag) => normalizeTagKey(tag.name) === normalizeTagKey(renameTag.oldName));
      if (existing) {
        existing.name = String(renameTag.newName || existing.name);
        if (typeof renameTag.newCategoryId === "string") {
          existing.categoryId = renameTag.newCategoryId;
        }
      }
    });

    const items = (Array.isArray(model.items) ? model.items : []).map((item) => ({
      itemId: String(item?.itemId || ""),
      tags: Array.isArray(item?.tags) ? item.tags.slice() : []
    }));

    pending.renameTags.forEach((renameTag) => {
      const oldKey = normalizeTagKey(renameTag.oldName);
      const newName = String(renameTag.newName || renameTag.oldName || "");
      const newKey = normalizeTagKey(newName);
      items.forEach((item) => {
        const hasOld = item.tags.some((tag) => normalizeTagKey(tag) === oldKey);
        if (!hasOld) return;
        item.tags = item.tags.filter((tag) => normalizeTagKey(tag) !== oldKey);
        if (!item.tags.some((tag) => normalizeTagKey(tag) === newKey)) {
          item.tags.push(newName);
        }
      });
    });

    pending.deleteTags.forEach((_, key) => {
      tags = tags.filter((tag) => normalizeTagKey(tag.name) !== key);
    });

    const categoryIds = new Set(categories.map((category) => category.id));
    tags.forEach((tag) => {
      if (!tag.categoryId || pending.deleteCategoryIds.has(tag.categoryId) || !categoryIds.has(tag.categoryId)) {
        tag.categoryId = UNCATEGORIZED_CATEGORY_ID;
      }
    });

    const hasUncategorizedTags = tags.some((tag) => isUncategorizedCategoryId(tag.categoryId));
    categories = ensureUncategorizedCategory(categories, hasUncategorizedTags);
    categories = reorderCategories(canonicalizeCategories(categories));
    categories.forEach((category, index) => {
      category.sortOrder = isUncategorizedCategoryId(category.id) ? Number.MAX_SAFE_INTEGER : index;
    });
    tags.sort((a, b) => compareTagNames(a.name, b.name));
    return { categories, tags, items };
  }

  function renderTagEditor() {
    tagEditorBody.innerHTML = "";
    if (!state.tagEditorModel) {
      tagEditorBody.textContent = "No tag model available.";
      return;
    }

    const display = buildTagEditorDisplayModel();
    const categories = display.categories;
    const tags = display.tags;
    const items = display.items;

    const previousCategoryValue = tagEditorCategorySelect.value;
    tagEditorCategorySelect.innerHTML = "";
    for (const category of getCategoryOptionsForInputs(categories)) {
      const option = document.createElement("option");
      option.value = String(category.id || "");
      option.textContent = String(category.name || "");
      tagEditorCategorySelect.appendChild(option);
    }
    if (tagEditorCategorySelect.options.length > 0) {
      if (previousCategoryValue && Array.from(tagEditorCategorySelect.options).some((option) => option.value === previousCategoryValue)) {
        tagEditorCategorySelect.value = previousCategoryValue;
      } else {
        tagEditorCategorySelect.selectedIndex = 0;
      }
    }

    const tagsByCategory = new Map();
    tags.forEach((tag) => {
      const key = isUncategorizedCategoryId(tag.categoryId) ? UNCATEGORIZED_CATEGORY_ID : String(tag.categoryId || "");
      if (!tagsByCategory.has(key)) tagsByCategory.set(key, []);
      tagsByCategory.get(key).push(tag);
    });

    categories.forEach((category, categoryIndex) => {
      const section = document.createElement("section");
      section.className = "tag-editor-category";
      const header = document.createElement("div");
      header.className = "tag-editor-category-header";
      const left = document.createElement("div");
      left.className = "tag-editor-category-left";
      const toggleButton = document.createElement("button");
      toggleButton.className = "tag-editor-category-toggle icon-glyph-base icon-glyph-button";
      const collapsed = state.tagEditorCollapsedCategories.has(String(category.id || ""));
      toggleButton.appendChild(createMaterialSymbolNode(collapsed ? "keyboard_arrow_right" : "keyboard_arrow_down"));
      toggleButton.title = collapsed ? "Expand category" : "Collapse category";
      toggleButton.onclick = () => toggleCategoryCollapsed(category.id);
      left.appendChild(toggleButton);
      const title = document.createElement("div");
      title.className = "tag-editor-category-title";
      title.textContent = String(category.name || "");
      left.appendChild(title);
      header.appendChild(left);

      const controls = document.createElement("div");
      controls.className = "tag-editor-category-controls";
      const isUncategorized = isUncategorizedCategoryId(category.id);
      const movableCount = categories.filter((item) => !isUncategorizedCategoryId(item.id)).length;
      const upButton = document.createElement("button");
      upButton.className = "tag-editor-category-btn icon-glyph-base icon-glyph-button";
      upButton.appendChild(createMaterialSymbolNode("arrow_drop_up"));
      upButton.title = "Move category up";
      upButton.disabled = isUncategorized || movableCount <= 1 || categoryIndex === 0;
      upButton.onclick = () => moveCategory(category.id, -1);
      controls.appendChild(upButton);
      const downButton = document.createElement("button");
      downButton.className = "tag-editor-category-btn icon-glyph-base icon-glyph-button";
      downButton.appendChild(createMaterialSymbolNode("arrow_drop_down"));
      downButton.title = "Move category down";
      const lastMovableIndex = categories.filter((item) => !isUncategorizedCategoryId(item.id)).length - 1;
      downButton.disabled = isUncategorized || movableCount <= 1 || categoryIndex >= lastMovableIndex;
      downButton.onclick = () => moveCategory(category.id, 1);
      controls.appendChild(downButton);
      const editCategoryButton = document.createElement("button");
      editCategoryButton.className = "tag-editor-category-btn icon-glyph-base icon-glyph-button";
      editCategoryButton.appendChild(createMaterialSymbolNode("edit_note"));
      editCategoryButton.title = "Rename category";
      editCategoryButton.disabled = isUncategorized;
      editCategoryButton.onclick = () => {
        const currentName = String(category.name || "").trim();
        let nextName = prompt("Rename Category", currentName);
        if (!nextName) return;
        nextName = String(nextName).trim();
        if (!nextName) return;
        const duplicate = categories.some((item) =>
          String(item.id || "") !== String(category.id || "") &&
          String(item.name || "").trim().toLowerCase() === nextName.toLowerCase());
        if (duplicate) {
          alert("Category already exists.");
          return;
        }
        state.tagEditorPending.upsertCategories.set(String(category.id || ""), {
          id: String(category.id || ""),
          name: nextName,
          sortOrder: Number(category.sortOrder || 0)
        });
        renderTagEditor();
      };
      controls.appendChild(editCategoryButton);
      const deleteCategoryButton = document.createElement("button");
      deleteCategoryButton.className = "tag-editor-category-btn icon-glyph-base icon-glyph-button";
      deleteCategoryButton.appendChild(createMaterialSymbolNode("delete"));
      deleteCategoryButton.title = "Delete category";
      deleteCategoryButton.disabled = isUncategorized;
      deleteCategoryButton.onclick = () => {
        const name = category.name || "Category";
        if (!confirm(`Delete category "${name}"? Tags will become Uncategorized.`)) return;
        queueDeleteCategory(category);
      };
      controls.appendChild(deleteCategoryButton);
      header.appendChild(controls);
      section.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "tag-editor-tag-grid";
      if (collapsed) {
        grid.style.display = "none";
      }
      const categoryTags = tagsByCategory.get(category.id) || [];
      categoryTags.sort((a, b) => compareTagNames(a.name, b.name));
      categoryTags.forEach((tag) => {
        const chip = document.createElement("div");
        chip.className = `tag-chip ${computeTagStateForItems(tag.name, items)}`;
        const pendingAction = getPendingTagAction(tag.name);
        const label = document.createElement("span");
        label.className = "tag-chip-label";
        label.textContent = String(tag.name || "");
        chip.appendChild(label);
        const plusButton = document.createElement("button");
        plusButton.className = "chip-btn icon-glyph-base icon-glyph-toggle";
        plusButton.appendChild(createMaterialSymbolNode("add"));
        plusButton.title = "Add tag";
        plusButton.disabled = !Array.isArray(items) || items.length === 0;
        if (pendingAction === "add") plusButton.classList.add("is-selected");
        plusButton.onclick = () => {
          toggleTagSelection(tag.name, "add");
          renderTagEditor();
        };
        chip.appendChild(plusButton);
        const minusButton = document.createElement("button");
        minusButton.className = "chip-btn icon-glyph-base icon-glyph-toggle";
        minusButton.appendChild(createMaterialSymbolNode("remove"));
        minusButton.title = "Remove tag";
        minusButton.disabled = !Array.isArray(items) || items.length === 0;
        if (pendingAction === "remove") minusButton.classList.add("is-selected");
        minusButton.onclick = () => {
          toggleTagSelection(tag.name, "remove");
          renderTagEditor();
        };
        chip.appendChild(minusButton);
        const editButton = document.createElement("button");
        editButton.className = "chip-btn icon-glyph-base icon-glyph-button";
        editButton.appendChild(createMaterialSymbolNode("edit_note"));
        editButton.title = "Edit tag";
        editButton.onclick = () => openTagEditModal(tag, categories);
        chip.appendChild(editButton);
        const deleteButton = document.createElement("button");
        deleteButton.className = "chip-btn icon-glyph-base icon-glyph-button";
        deleteButton.appendChild(createMaterialSymbolNode("delete"));
        deleteButton.title = "Delete tag";
        deleteButton.onclick = () => {
          if (!confirm(`Delete tag "${tag.name}"?`)) return;
          queueDeleteTag(tag.name);
        };
        chip.appendChild(deleteButton);
        grid.appendChild(chip);
      });

      section.appendChild(grid);
      tagEditorBody.appendChild(section);
    });

    setButtonSymbol(tagEditorApplyBtn, "save");
    updateTagOverlaySaveButtonState();
  }

  async function refreshTagEditorModel() {
    const itemIds = getCurrentTagEditorItemIds();
    const response = await apiPost("/api/tag-editor/model", { itemIds });
    if (!response.ok) {
      throw new Error(`tag-model:${response.status}`);
    }
    const model = await response.json();
    state.tagEditorModel = model || { categories: [], tags: [], items: [] };
    if (!Array.isArray(state.tagEditorCategoryOrder) || state.tagEditorCategoryOrder.length === 0) {
      const initial = canonicalizeCategories(Array.isArray(state.tagEditorModel.categories) ? state.tagEditorModel.categories.slice() : []);
      initial.sort((a, b) => {
        const x = Number(a.sortOrder || 0);
        const y = Number(b.sortOrder || 0);
        if (x !== y) return x - y;
        return compareTagNames(a.name, b.name);
      });
      state.tagEditorCategoryOrder = initial.map((category) => String(category.id || ""));
    }
    renderTagEditor();
  }

  function openTagEditor() {
    state.tagEditorOpen = true;
    state.tagEditorItemIds = getCurrentTagEditorItemIds();
    state.tagEditorCategoryOrder = [];
    state.tagEditorCollapsedCategories = loadTagEditorCollapsedCategories();
    resetTagEditorPending();
    resetAutoTagState();
    if (tagAutotagScanFull) tagAutotagScanFull.checked = loadPersistedAutoTagScanFull();
    if (tagAutotagViewAll) tagAutotagViewAll.checked = false;
    switchTagEditorTab("edit", true);
    player.pauseForTagEditor();
    tagEditor.style.display = "flex";
    refreshTagEditorModel().catch((error) => {
      setStatus(`Tag editor unavailable: ${error?.message || error}`);
    });
  }

  function closeTagEditor(skipDiscardConfirm) {
    if (!skipDiscardConfirm && shouldConfirmDiscardTagOverlay()) {
      if (!confirm("Discard changes?")) return;
    }
    closeTagEditModal();
    state.tagEditorOpen = false;
    state.tagEditorItemIds = [];
    resetAutoTagState();
    resetTagEditorPending();
    tagEditor.style.display = "none";
    player.resumeAfterTagEditor();
  }

  function applyItemTagsEvent(payload) {
    const echo = {
      itemIds: payload.resolvedItemIds || payload.ResolvedItemIds || [],
      addedTags: payload.addedTags || payload.AddedTags || [],
      removedTags: payload.removedTags || payload.RemovedTags || []
    };
    handleIncomingItemTags({
      resolvedItemIds: echo.itemIds,
      addedTags: echo.addedTags,
      removedTags: echo.removedTags,
      catalogReplacedTag: payload.catalogReplacedTag || payload.CatalogReplacedTag || null,
      catalogReplacementTag: payload.catalogReplacementTag || payload.CatalogReplacementTag || null
    }, {
      tagFilterCanChangeMembership,
      retarget(step) {
        retargetLiveTagFilters(step);
      },
      afterRetarget(handling) {
        const decision = tagSaveSession.onEcho(echo, handling.hadTagFilter || tagSaveReloadOnLand());
        if (decision.skipPatch) {
          projectLoadedTagItems();
          tagSaveSession.sweep();
          if (decision.reload) {
            void librarySession.reloadLoaded();
          }
          return;
        }
        tagSaveSession.sweep();
        void librarySession.applyTags({
          resolvedItemIds: echo.itemIds,
          addedTags: echo.addedTags,
          removedTags: echo.removedTags,
          catalogReplacedTag: payload.catalogReplacedTag || payload.CatalogReplacedTag || null
        });
        if (handling.reloadBecauseFilterCleared) {
          void librarySession.reloadLoaded();
        }
      }
    });
  }

  connection.on("itemTagsChanged", applyItemTagsEvent);

  tagEditor.querySelector(".tag-editor-tabstrip")?.addEventListener("click", (event) => {
    const btn = event.target && event.target.closest ? event.target.closest("[data-tag-editor-tab]") : null;
    if (!btn) return;
    const tab = btn.getAttribute("data-tag-editor-tab");
    if (tab === "edit" || tab === "autotag") {
      switchTagEditorTab(tab);
    }
  });

  tagAutotagScanFull.addEventListener("change", () => {
    persistAutoTagScanFull(!!tagAutotagScanFull.checked);
  });
  tagAutotagViewAll.addEventListener("change", () => {
    for (const row of state.autoTagRows) {
      if (getVisibleAutoTagFiles(row).length === 0) row.expanded = false;
    }
    renderAutoTagPanel();
  });
  tagAutotagSelectAll.addEventListener("click", () => {
    for (const idx of getAutoTagVisibleRowIndices()) {
      const row = state.autoTagRows[idx];
      for (const f of getVisibleAutoTagFiles(row)) {
        f.selected = true;
      }
    }
    renderAutoTagPanel();
  });
  tagAutotagDeselectAll.addEventListener("click", () => {
    for (const idx of getAutoTagVisibleRowIndices()) {
      const row = state.autoTagRows[idx];
      for (const f of getVisibleAutoTagFiles(row)) {
        f.selected = false;
      }
    }
    renderAutoTagPanel();
  });
  tagAutotagScanBtn.addEventListener("click", () => {
    void runAutoTagScan();
  });

  tagAutotagResults.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.hasAttribute("data-autotag-row-check")) {
      const row = findAutoTagRowByRowId(t.getAttribute("data-autotag-row-check"));
      if (!row) return;
      const v = !!t.checked;
      t.indeterminate = false;
      for (const f of getVisibleAutoTagFiles(row)) {
        f.selected = v;
      }
      renderAutoTagPanel();
      return;
    }
    if (t.hasAttribute("data-autotag-file")) {
      const row = findAutoTagRowByRowId(t.getAttribute("data-row-id"));
      const itemId = t.getAttribute("data-item-id") || "";
      if (!row || !itemId) return;
      const f = row.files.find((x) => x.itemId === itemId);
      if (f) f.selected = t.checked;
      syncAutoTagRowHeaderCheckbox(row);
      updateAutoTagStatusSummary();
      updateTagOverlaySaveButtonState();
    }
  });
  tagAutotagResults.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("[data-autotag-expand]") : null;
    if (!b) return;
    e.preventDefault();
    const row = findAutoTagRowByRowId(b.getAttribute("data-autotag-expand"));
    if (row) {
      row.expanded = !row.expanded;
      renderAutoTagPanel();
    }
  });

  store.on("overlayRequested", (overlay) => {
    if (overlay === "tagEditor") {
      openTagEditor();
    }
  });
  tagEditorCloseBtn.addEventListener("click", () => {
    if (state.autoTagScanInFlight) return;
    closeTagEditor(false);
  });
  tagEditorRefreshBtn.addEventListener("click", () => {
    if (state.autoTagScanInFlight) return;
    if (shouldConfirmDiscardTagOverlay()) {
      if (!confirm("Discard changes?")) return;
    }
    resetAutoTagState();
    resetTagEditorPending();
    state.tagEditorCategoryOrder = [];
    void refreshTagEditorModel().catch((error) => {
      setStatus(`Tag refresh failed: ${error?.message || error}`);
    });
  });
  tagEditorAddCategoryBtn.addEventListener("click", () => {
    const name = prompt("New category name");
    if (!name || !name.trim()) return;
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    state.tagEditorPending.upsertCategories.set(id, {
      id,
      name: name.trim(),
      sortOrder: state.tagEditorCategoryOrder.length
    });
    const uncategorizedIndex = state.tagEditorCategoryOrder.findIndex((value) => isUncategorizedCategoryId(value));
    if (uncategorizedIndex >= 0) {
      state.tagEditorCategoryOrder.splice(uncategorizedIndex, 0, id);
    } else {
      state.tagEditorCategoryOrder.push(id);
    }
    renderTagEditor();
  });
  tagEditorAddTagBtn.addEventListener("click", () => {
    const tagName = String(tagEditorNewTag.value || "").trim();
    const categoryId = tagEditorCategorySelect.value || UNCATEGORIZED_CATEGORY_ID;
    if (!tagName) return;
    const tagKey = normalizeTagKey(tagName);
    state.tagEditorPending.deleteTags.delete(tagKey);
    state.tagEditorPending.upsertTags.set(tagKey, { name: tagName, categoryId });
    if (getCurrentTagEditorItemIds().length > 0) {
      state.tagEditorSelections.set(tagKey, { action: "add", name: tagName });
    } else {
      state.tagEditorSelections.delete(tagKey);
    }
    tagEditorNewTag.value = "";
    renderTagEditor();
  });
  tagEditorApplyBtn.addEventListener("click", () => {
    if (state.autoTagScanInFlight) return;
    if (!hasPendingTagEditorMutations() && !hasAutoTagApplyPending()) return;
    const steps = collectTagSavePlan();
    if (steps.length === 0) {
      setStatus("No tag changes to save.");
      return;
    }
    const loaded = loadedTagItems();
    const handle = tagSaveSession.begin(loaded, steps, false, tagFilterCanChangeMembership());
    writeLoadedTagItems(loaded);
    closeTagEditor(true);
    void saveTagEditorInBackground(handle, steps);
  });
  tagEditCancelBtn.addEventListener("click", () => {
    closeTagEditModal();
  });
  tagEditSaveBtn.addEventListener("click", async () => {
    if (!state.tagEditContext) {
      closeTagEditModal();
      return;
    }

    const nextName = String(tagEditName.value || "").trim();
    if (!nextName) {
      setStatus("Tag name is required.");
      return;
    }

    const selectedCategoryId = String(tagEditCategory.value || UNCATEGORIZED_CATEGORY_ID);
    const oldName = state.tagEditContext.oldName;
    const oldCategoryId = state.tagEditContext.oldCategoryId;
    const nameChanged = normalizeTagKey(nextName) !== normalizeTagKey(oldName);
    const categoryChanged = selectedCategoryId !== oldCategoryId;
    if (!nameChanged && !categoryChanged) {
      closeTagEditModal();
      return;
    }
    queueRenameTag(oldName, nextName, categoryChanged ? selectedCategoryId : null);
    closeTagEditModal();
  });
  tagEditModal.addEventListener("click", (event) => {
    if (event.target === tagEditModal) {
      closeTagEditModal();
    }
  });
}
