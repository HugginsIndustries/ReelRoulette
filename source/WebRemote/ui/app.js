(function () {
  const API = window.location.origin;
  const CLIENT_ID_KEY = 'rr_clientId';
  const PHOTO_DURATION_KEY = 'rr_photoDuration';
  const RANDOMIZATION_MODE_KEY = 'rr_randomizationMode';
  const TAG_EDITOR_COLLAPSED_KEY = 'rr_tagEditorCollapsed';
  const UNCATEGORIZED_CATEGORY_ID = 'uncategorized';

  function getClientId() {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16));
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  }

  function fetchJSON(url, opts = {}) {
    return fetch(url, { credentials: 'include', ...opts }).then(r => {
      if (r.status === 401) throw new Error('Unauthorized');
      return r.json();
    });
  }

  const state = {
    presets: [],
    currentPresetId: '',
    current: null,
    history: [],
    historyIndex: -1,
    loop: false,
    autoplay: false,
    photoDurationSeconds: 15,
    clientId: getClientId(),
    randomizationMode: 'SmartShuffle',
    lastRecordedPresentationKey: '',
    tagEditorOpen: false,
    tagEditorModel: null,
    tagEditorSelections: new Map(),
    tagEditorPending: null,
    tagEditorCategoryOrder: [],
    tagEditorCollapsedCategories: new Set(),
    tagEditorItemIds: [],
    tagEditContext: null,
    tagEditorWasPlaying: false,
    tagEditorPhotoTimerRunning: false
  };
  let photoTimerId = null;
  let touchStartX = 0, touchStartY = 0, touchWasSwipe = false, touchHandledTap = false, ignoreSwipeTouch = false;
  const SWIPE_THRESHOLD = 50;
  const TAP_THRESHOLD = 10;
  const EVENTS_RETRY_MS = 1000;
  const SSE_STALE_MS = 30000;
  const SSE_WATCHDOG_MS = 5000;
  const RECONCILE_INTERVAL_MS = 5000;
  const ACK_HEARTBEAT_MS = 10000;
  const LIFECYCLE_RECONNECT_COOLDOWN_MS = 3000;

  const el = id => document.getElementById(id);
  const video = el('video');
  const photo = el('photo');
  const presetSelect = el('preset-select');
  const randomizationModeSelect = el('randomization-mode-select');
  const statusEl = el('status');
  const versionEl = el('version');
  const nowPlaying = el('now-playing');
  const nowPlayingName = el('now-playing-name');
  const nowPlayingDuration = el('now-playing-duration');
  const seekRow = el('seek-row');
  const seekSlider = el('seek-slider');
  const timeDisplay = el('time-display');
  const pairSection = el('pair-section');
  const pairToken = el('pair-token');
  const pairBtn = el('pair-btn');
  const fullscreenBtn = el('fullscreen-btn');
  const mediaContainer = el('media-container');
  const overlayControls = el('overlay-controls');
  const prevBtn = el('prev-btn');
  const playBtn = el('play-btn');
  const nextBtn = el('next-btn');
  const favoriteBtn = el('favorite-btn');
  const blacklistBtn = el('blacklist-btn');
  const loopBtn = el('loop-btn');
  const autoplayBtn = el('autoplay-btn');
  const tagEditBtn = el('tag-edit-btn');
  const tagEditor = el('tag-editor');
  const tagEditorBody = el('tag-editor-body');
  const tagEditorCategorySelect = el('tag-editor-category-select');
  const tagEditorNewTag = el('tag-editor-new-tag');
  const tagEditorAddTagBtn = el('tag-editor-add-tag-btn');
  const tagEditorApplyBtn = el('tag-editor-apply-btn');
  const tagEditorCloseBtn = el('tag-editor-close-btn');
  const tagEditorRefreshBtn = el('tag-editor-refresh-btn');
  const tagEditorAddCategoryBtn = el('tag-editor-add-category-btn');
  const tagEditModal = el('tag-edit-modal');
  const tagEditNameInput = el('tag-edit-name');
  const tagEditCategorySelect = el('tag-edit-category');
  const tagEditCancelBtn = el('tag-edit-cancel-btn');
  const tagEditSaveBtn = el('tag-edit-save-btn');
  mediaContainer.classList.add('controls-visible');

  function setStatus(msg) { statusEl.textContent = msg; }
  function postSyncLog(level, message, extra) {
    var payload = Object.assign({ clientId: state.clientId, level: level, message: message }, extra || {});
    fetch(API + '/api/events/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    }).catch(function (err) {
      console.debug('sync log post failed', err);
    });
  }
  function fmtTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function normalizePath(p) {
    return (p || '').replace(/\//g, '\\').toLowerCase();
  }

  function basenameFromPath(p) {
    if (!p) return 'Unknown media';
    var normalized = String(p).replace(/\//g, '\\');
    var idx = normalized.lastIndexOf('\\');
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
  }

  function truncateName(name, maxChars) {
    var text = String(name || '');
    var max = Number(maxChars || 45);
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 3)) + '...';
  }

  var itemStateByPath = new Map();
  function cacheItemState(itemId, isFavorite, isBlacklisted, revision) {
    var key = normalizePath(itemId);
    if (!key) return;
    var prev = itemStateByPath.get(key);
    var nextRevision = Number(revision || 0);
    var prevRevision = Number(prev?.revision || 0);
    if (prev && nextRevision > 0 && prevRevision > nextRevision) return;
    itemStateByPath.set(key, { isFavorite: !!isFavorite, isBlacklisted: !!isBlacklisted, revision: nextRevision });
  }

  function applyCachedState(item) {
    if (!item || !item.id) return false;
    var cached = itemStateByPath.get(normalizePath(item.id));
    if (!cached) return false;
    item.isFavorite = !!cached.isFavorite;
    item.isBlacklisted = !!cached.isBlacklisted;
    return true;
  }

  function collectKnownPaths() {
    var paths = [];
    if (state.current?.id) paths.push(state.current.id);
    for (var i = 0; i < state.history.length; i++) {
      var h = state.history[i];
      if (h?.id) paths.push(h.id);
    }
    for (const key of itemStateByPath.keys()) paths.push(key);
    var seen = new Set();
    var unique = [];
    for (var j = 0; j < paths.length; j++) {
      var p = paths[j];
      var norm = normalizePath(p);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      unique.push(p);
    }
    return unique;
  }

  var reconcileInFlight = false;
  function reconcileKnownStates(reason) {
    if (reconcileInFlight) return;
    var paths = collectKnownPaths();
    if (paths.length === 0) return;
    reconcileInFlight = true;
    postSyncLog('info', 'Reconcile start (' + reason + ') paths=' + paths.length);
    fetch(API + '/api/library-states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ paths: paths })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('reconcile:' + r.status);
        return r.json();
      })
      .then(function (rows) {
        var list = Array.isArray(rows) ? rows : [];
        for (var i = 0; i < list.length; i++) {
          var row = list[i];
          if (!row?.itemId) continue;
          cacheItemState(row.itemId, row.isFavorite, row.isBlacklisted, row.revision);
          var targetKey = normalizePath(row.itemId);
          for (var j = 0; j < state.history.length; j++) {
            var h = state.history[j];
            if (h && normalizePath(h.id) === targetKey) {
              h.isFavorite = !!row.isFavorite;
              h.isBlacklisted = !!row.isBlacklisted;
            }
          }
          if (state.current && normalizePath(state.current.id) === targetKey) {
            state.current.isFavorite = !!row.isFavorite;
            state.current.isBlacklisted = !!row.isBlacklisted;
          }
        }
        updateToggleButtons();
        postSyncLog('info', 'Reconcile applied (' + reason + ') states=' + list.length);
      })
      .catch(function (err) {
        console.warn('reconcile failed', err);
        postSyncLog('error', 'Reconcile failed (' + reason + '): ' + (err?.message || err));
      })
      .finally(function () {
        reconcileInFlight = false;
      });
  }

  function apiPost(path, payload) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload || {})
    });
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
  }

  function loadTagEditorCollapsedCategories() {
    try {
      var raw = sessionStorage.getItem(TAG_EDITOR_COLLAPSED_KEY);
      if (!raw) return new Set();
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map(function (id) { return String(id || ''); }));
    } catch {
      return new Set();
    }
  }

  function persistTagEditorCollapsedCategories() {
    try {
      sessionStorage.setItem(TAG_EDITOR_COLLAPSED_KEY, JSON.stringify(Array.from(state.tagEditorCollapsedCategories)));
    } catch {
      // best-effort only
    }
  }

  function normalizeTagKey(tagName) {
    return String(tagName || '').trim().toLowerCase();
  }

  function isUncategorizedCategoryId(categoryId) {
    var id = String(categoryId || '').trim().toLowerCase();
    return id === '' || id === UNCATEGORIZED_CATEGORY_ID;
  }

  function isUncategorizedCategory(category) {
    if (!category) return false;
    if (isUncategorizedCategoryId(category.id)) return true;
    return String(category.name || '').trim().toLowerCase() === 'uncategorized';
  }

  function canonicalizeCategories(categories) {
    var deduped = new Map();
    (categories || []).forEach(function (cat, idx) {
      var normalized = {
        id: isUncategorizedCategory(cat) ? UNCATEGORIZED_CATEGORY_ID : String(cat.id || ''),
        name: String(cat.name || ''),
        sortOrder: Number(cat.sortOrder ?? idx)
      };
      if (isUncategorizedCategoryId(normalized.id) && !normalized.name) {
        normalized.name = 'Uncategorized';
      }

      var existing = deduped.get(normalized.id);
      if (!existing) {
        deduped.set(normalized.id, normalized);
        return;
      }

      if (normalized.sortOrder < existing.sortOrder) {
        existing.sortOrder = normalized.sortOrder;
      }
      if (normalized.name && !existing.name) {
        existing.name = normalized.name;
      }
    });

    return Array.from(deduped.values());
  }

  function ensureUncategorizedCategory(categories, include) {
    var hasUncategorized = categories.some(function (c) { return isUncategorizedCategoryId(c.id); });
    if (include && !hasUncategorized) {
      categories.push({ id: UNCATEGORIZED_CATEGORY_ID, name: 'Uncategorized', sortOrder: Number.MAX_SAFE_INTEGER });
    }
    if (!include && hasUncategorized) {
      categories = categories.filter(function (c) { return !isUncategorizedCategoryId(c.id); });
    }

    return categories;
  }

  function getCategoryOptionsForInputs(categories) {
    var opts = canonicalizeCategories(Array.isArray(categories) ? categories.slice() : []);
    if (!opts.some(function (c) { return isUncategorizedCategoryId(c.id); })) {
      opts.push({ id: UNCATEGORIZED_CATEGORY_ID, name: 'Uncategorized', sortOrder: Number.MAX_SAFE_INTEGER });
    }
    opts.sort(function (a, b) {
      var x = Number(a.sortOrder || 0);
      var y = Number(b.sortOrder || 0);
      if (x !== y) return x - y;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return opts;
  }

  function getCurrentItemIdsForTagEditor() {
    if (Array.isArray(state.tagEditorItemIds) && state.tagEditorItemIds.length > 0) {
      return state.tagEditorItemIds.slice();
    }

    return state.current?.id ? [state.current.id] : [];
  }

  function getCategoryNameById(categoryId) {
    var categories = Array.isArray(state.tagEditorModel?.categories) ? state.tagEditorModel.categories : [];
    var match = categories.find(function (c) { return String(c.id || '') === String(categoryId || ''); });
    if (match) return String(match.name || '');

    if (state.tagEditorPending?.upsertCategories?.has(String(categoryId || ''))) {
      return String(state.tagEditorPending.upsertCategories.get(String(categoryId || '')).name || '');
    }

    return '';
  }

  function reorderCategories(baseCategories) {
    var includeUncategorized = baseCategories.some(function (c) { return isUncategorizedCategoryId(c.id); });
    var categoriesById = new Map();
    baseCategories.forEach(function (c) {
      categoriesById.set(String(c.id || ''), c);
    });

    if (!Array.isArray(state.tagEditorCategoryOrder) || state.tagEditorCategoryOrder.length === 0) {
      state.tagEditorCategoryOrder = baseCategories.map(function (c) { return String(c.id || ''); });
    }

    var ordered = [];
    var seen = new Set();
    state.tagEditorCategoryOrder.forEach(function (id) {
      var key = String(id || '');
      if (seen.has(key)) return;
      if (!categoriesById.has(key)) return;
      ordered.push(categoriesById.get(key));
      seen.add(key);
    });

    baseCategories.forEach(function (c) {
      var key = String(c.id || '');
      if (seen.has(key)) return;
      if (isUncategorizedCategoryId(key)) return;
      ordered.push(c);
      seen.add(key);
    });

    if (includeUncategorized) {
      var uncategorized = categoriesById.get(UNCATEGORIZED_CATEGORY_ID) || { id: UNCATEGORIZED_CATEGORY_ID, name: 'Uncategorized', sortOrder: Number.MAX_SAFE_INTEGER };
      ordered.push(uncategorized);
    }

    state.tagEditorCategoryOrder = ordered.map(function (c) { return String(c.id || ''); });
    return ordered;
  }

  function buildTagEditorDisplayModel() {
    var model = state.tagEditorModel || { categories: [], tags: [], items: [] };
    var pending = state.tagEditorPending || createTagEditorPending();

    var categories = canonicalizeCategories((Array.isArray(model.categories) ? model.categories : [])
      .map(function (c) {
        return {
          id: String(c.id || ''),
          name: String(c.name || ''),
          sortOrder: Number(c.sortOrder || 0)
        };
      }));

    pending.upsertCategories.forEach(function (cat, key) {
      if (!key) return;
      var existing = categories.find(function (c) { return c.id === key; });
      if (existing) {
        existing.name = String(cat.name || existing.name || '');
      } else {
        categories.push({
          id: key,
          name: String(cat.name || ''),
          sortOrder: Number(cat.sortOrder || 0)
        });
      }
    });

    categories = canonicalizeCategories(categories);
    categories = categories.filter(function (c) {
      if (isUncategorizedCategoryId(c.id)) return true;
      return !pending.deleteCategoryIds.has(c.id);
    });

    var tags = (Array.isArray(model.tags) ? model.tags : [])
      .map(function (t) {
        return {
          name: String(t.name || ''),
          categoryId: String(t.categoryId || UNCATEGORIZED_CATEGORY_ID)
        };
      })
      .filter(function (t) { return t.name.length > 0; });

    pending.upsertTags.forEach(function (tagOp, key) {
      var existing = tags.find(function (t) { return normalizeTagKey(t.name) === key; });
      if (existing) {
        existing.categoryId = String(tagOp.categoryId || UNCATEGORIZED_CATEGORY_ID);
      } else {
        tags.push({
          name: String(tagOp.name || ''),
          categoryId: String(tagOp.categoryId || UNCATEGORIZED_CATEGORY_ID)
        });
      }
    });

    pending.renameTags.forEach(function (renameOp) {
      var existing = tags.find(function (t) { return normalizeTagKey(t.name) === normalizeTagKey(renameOp.oldName); });
      if (existing) {
        existing.name = String(renameOp.newName || existing.name);
        if (typeof renameOp.newCategoryId === 'string') {
          existing.categoryId = renameOp.newCategoryId;
        }
      }
    });

    var items = (Array.isArray(model.items) ? model.items : [])
      .map(function (item) {
        return {
          itemId: String(item?.itemId || ''),
          tags: Array.isArray(item?.tags) ? item.tags.slice() : []
        };
      });

    pending.renameTags.forEach(function (renameOp) {
      var oldKey = normalizeTagKey(renameOp.oldName);
      var newName = String(renameOp.newName || renameOp.oldName || '');
      var newKey = normalizeTagKey(newName);
      items.forEach(function (item) {
        if (!Array.isArray(item.tags)) item.tags = [];
        var hasOld = item.tags.some(function (t) { return normalizeTagKey(t) === oldKey; });
        if (!hasOld) return;
        item.tags = item.tags.filter(function (t) { return normalizeTagKey(t) !== oldKey; });
        if (!item.tags.some(function (t) { return normalizeTagKey(t) === newKey; })) {
          item.tags.push(newName);
        }
      });
    });

    pending.deleteTags.forEach(function (_, key) {
      tags = tags.filter(function (t) { return normalizeTagKey(t.name) !== key; });
    });

    var categoryIds = new Set(categories.map(function (c) { return c.id; }));
    tags.forEach(function (t) {
      if (!t.categoryId || pending.deleteCategoryIds.has(t.categoryId) || !categoryIds.has(t.categoryId)) {
        t.categoryId = UNCATEGORIZED_CATEGORY_ID;
      }
    });

    var hasUncategorizedTags = tags.some(function (t) { return isUncategorizedCategoryId(t.categoryId); });
    categories = ensureUncategorizedCategory(categories, hasUncategorizedTags);
    categories = reorderCategories(canonicalizeCategories(categories));
    categories.forEach(function (c, idx) {
      c.sortOrder = isUncategorizedCategoryId(c.id) ? Number.MAX_SAFE_INTEGER : idx;
    });

    tags.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

    return {
      categories: categories,
      tags: tags,
      items: items
    };
  }

  function computeTagStateForItems(tagName, items) {
    var list = Array.isArray(items) ? items : [];
    if (list.length === 0) return 'state-none';
    var wanted = normalizeTagKey(tagName);
    var withTag = 0;
    for (var i = 0; i < list.length; i++) {
      var itemTags = Array.isArray(list[i]?.tags) ? list[i].tags : [];
      var hasTag = itemTags.some(function (t) { return normalizeTagKey(t) === wanted; });
      if (hasTag) withTag++;
    }

    if (withTag === 0) return 'state-none';
    if (withTag === list.length) return 'state-all';
    return 'state-some';
  }

  function getEffectiveTagStateClass(tagName, items) {
    return computeTagStateForItems(tagName, items);
  }

  function getPendingTagAction(tagName) {
    var key = normalizeTagKey(tagName);
    return state.tagEditorSelections.get(key)?.action || null;
  }

  function toggleTagSelection(tagName, action) {
    var key = normalizeTagKey(tagName);
    var current = state.tagEditorSelections.get(key);
    if (current?.action === action) {
      state.tagEditorSelections.delete(key);
      return;
    }

    state.tagEditorSelections.set(key, { action: action, name: tagName });
  }

  function toggleCategoryCollapsed(categoryId) {
    var key = String(categoryId || '');
    if (state.tagEditorCollapsedCategories.has(key)) {
      state.tagEditorCollapsedCategories.delete(key);
    } else {
      state.tagEditorCollapsedCategories.add(key);
    }

    persistTagEditorCollapsedCategories();
    renderTagEditor();
  }

  function moveCategory(categoryId, direction) {
    var id = String(categoryId || '');
    if (!id || isUncategorizedCategoryId(id)) return;
    var order = state.tagEditorCategoryOrder.slice();
    var movable = order.filter(function (x) { return !isUncategorizedCategoryId(x); });
    var idx = movable.indexOf(id);
    if (idx < 0) return;
    var next = idx + direction;
    if (next < 0 || next >= movable.length) return;

    var tmp = movable[idx];
    movable[idx] = movable[next];
    movable[next] = tmp;

    var hasUncategorized = order.some(function (x) { return isUncategorizedCategoryId(x); });
    state.tagEditorCategoryOrder = hasUncategorized ? movable.concat([UNCATEGORIZED_CATEGORY_ID]) : movable;
    renderTagEditor();
  }

  function queueDeleteCategory(category) {
    if (!category || isUncategorizedCategoryId(category.id)) return;
    state.tagEditorPending.deleteCategoryIds.add(String(category.id));
    state.tagEditorPending.upsertCategories.delete(String(category.id));
    state.tagEditorCategoryOrder = state.tagEditorCategoryOrder.filter(function (id) { return String(id) !== String(category.id); });
    renderTagEditor();
  }

  function queueDeleteTag(tagName) {
    var key = normalizeTagKey(tagName);
    state.tagEditorPending.deleteTags.set(key, { name: tagName });
    state.tagEditorPending.upsertTags.delete(key);
    state.tagEditorPending.renameTags.delete(key);
    state.tagEditorSelections.delete(key);
    renderTagEditor();
  }

  function queueRenameTag(oldTagName, newTagName, newCategoryId) {
    var oldKey = normalizeTagKey(oldTagName);
    var newKey = normalizeTagKey(newTagName);
    state.tagEditorPending.deleteTags.delete(oldKey);
    state.tagEditorPending.deleteTags.delete(newKey);
    state.tagEditorPending.renameTags.set(oldKey, {
      oldName: oldTagName,
      newName: newTagName,
      newCategoryId: typeof newCategoryId === 'string' ? newCategoryId : null
    });
    renderTagEditor();
  }

  function hasPendingTagEditorMutations() {
    if (!state.tagEditorPending) return state.tagEditorSelections.size > 0;
    return state.tagEditorSelections.size > 0 ||
      state.tagEditorPending.upsertCategories.size > 0 ||
      state.tagEditorPending.deleteCategoryIds.size > 0 ||
      state.tagEditorPending.upsertTags.size > 0 ||
      state.tagEditorPending.renameTags.size > 0 ||
      state.tagEditorPending.deleteTags.size > 0;
  }

  function openTagEditModal(tag, categories) {
    if (!tagEditModal || !tagEditNameInput || !tagEditCategorySelect) {
      var fallbackName = prompt('Rename tag', tag.name);
      if (!fallbackName || fallbackName.trim() === '') return;
      queueRenameTag(tag.name, fallbackName.trim(), null);
      return;
    }

    state.tagEditContext = {
      oldName: tag.name,
      oldCategoryId: String(tag.categoryId || UNCATEGORIZED_CATEGORY_ID)
    };

    tagEditNameInput.value = tag.name;
    tagEditCategorySelect.innerHTML = '';

    var categoryOptions = getCategoryOptionsForInputs(categories || []);

    categoryOptions.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = String(cat.id || '');
      opt.textContent = String(cat.name || '');
      tagEditCategorySelect.appendChild(opt);
    });

    if (tagEditCategorySelect.options.length > 0) {
      var currentCategoryId = String(tag.categoryId || '');
      if (Array.from(tagEditCategorySelect.options).some(function (o) { return o.value === currentCategoryId; })) {
        tagEditCategorySelect.value = currentCategoryId;
      } else {
        tagEditCategorySelect.selectedIndex = 0;
      }
    }

    tagEditModal.style.display = 'flex';
    setTimeout(function () {
      try {
        tagEditNameInput.focus();
        tagEditNameInput.select();
      } catch { }
    }, 0);
  }

  function closeTagEditModal() {
    if (!tagEditModal) return;
    tagEditModal.style.display = 'none';
    state.tagEditContext = null;
  }

  function renderTagEditor() {
    if (!tagEditorBody) return;
    var model = state.tagEditorModel;
    tagEditorBody.innerHTML = '';
    if (!model) {
      tagEditorBody.textContent = 'No tag model available.';
      return;
    }

    var display = buildTagEditorDisplayModel();
    var categories = canonicalizeCategories(display.categories);
    var tags = display.tags;
    var items = display.items;

    if (tagEditorCategorySelect) {
      var prevValue = tagEditorCategorySelect.value;
      tagEditorCategorySelect.innerHTML = '';
      getCategoryOptionsForInputs(categories).forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        tagEditorCategorySelect.appendChild(opt);
      });

      if (tagEditorCategorySelect.options.length > 0) {
        if (prevValue && Array.from(tagEditorCategorySelect.options).some(function (o) { return o.value === prevValue; })) {
          tagEditorCategorySelect.value = prevValue;
        } else {
          tagEditorCategorySelect.selectedIndex = 0;
        }
      }
    }

    var tagsByCategory = new Map();
    tags.forEach(function (tag) {
      var key = isUncategorizedCategoryId(tag.categoryId) ? UNCATEGORIZED_CATEGORY_ID : String(tag.categoryId || '');
      if (!tagsByCategory.has(key)) tagsByCategory.set(key, []);
      tagsByCategory.get(key).push(tag);
    });

    categories.forEach(function (cat, catIdx) {
      var wrap = document.createElement('section');
      wrap.className = 'tag-editor-category';

      var header = document.createElement('div');
      header.className = 'tag-editor-category-header';

      var left = document.createElement('div');
      left.className = 'tag-editor-category-left';

      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'tag-editor-category-toggle';
      var collapsed = state.tagEditorCollapsedCategories.has(String(cat.id || ''));
      toggleBtn.textContent = collapsed ? '▶' : '▼';
      toggleBtn.title = collapsed ? 'Expand category' : 'Collapse category';
      toggleBtn.onclick = function () { toggleCategoryCollapsed(cat.id); };
      left.appendChild(toggleBtn);

      var title = document.createElement('div');
      title.className = 'tag-editor-category-title';
      title.textContent = cat.name || 'Uncategorized';
      left.appendChild(title);
      header.appendChild(left);

      var controls = document.createElement('div');
      controls.className = 'tag-editor-category-controls';
      var isUncategorized = isUncategorizedCategoryId(cat.id);
      var movableCount = categories.filter(function (c) { return !isUncategorizedCategoryId(c.id); }).length;

      var upBtn = document.createElement('button');
      upBtn.className = 'tag-editor-category-btn';
      upBtn.textContent = '⬆️';
      upBtn.title = 'Move category up';
      upBtn.disabled = isUncategorized || movableCount <= 1 || catIdx === 0;
      upBtn.onclick = function () { moveCategory(cat.id, -1); };
      controls.appendChild(upBtn);

      var downBtn = document.createElement('button');
      downBtn.className = 'tag-editor-category-btn';
      downBtn.textContent = '⬇️';
      downBtn.title = 'Move category down';
      var lastMovableIndex = categories.filter(function (c) { return !isUncategorizedCategoryId(c.id); }).length - 1;
      downBtn.disabled = isUncategorized || movableCount <= 1 || catIdx >= lastMovableIndex;
      downBtn.onclick = function () { moveCategory(cat.id, 1); };
      controls.appendChild(downBtn);

      var editCategoryBtn = document.createElement('button');
      editCategoryBtn.className = 'tag-editor-category-btn';
      editCategoryBtn.textContent = '✏️';
      editCategoryBtn.title = 'Rename category';
      editCategoryBtn.disabled = isUncategorized;
      editCategoryBtn.onclick = function () {
        var currentName = String(cat.name || '').trim();
        var nextName = prompt('Rename Category', currentName);
        if (!nextName) return;
        nextName = String(nextName).trim();
        if (!nextName) return;
        var duplicate = categories.some(function (c) {
          if (String(c.id || '') === String(cat.id || '')) return false;
          return String(c.name || '').trim().toLowerCase() === nextName.toLowerCase();
        });
        if (duplicate) {
          alert('Category already exists.');
          return;
        }

        state.tagEditorPending.upsertCategories.set(String(cat.id || ''), {
          id: String(cat.id || ''),
          name: nextName,
          sortOrder: Number(cat.sortOrder || 0)
        });
        renderTagEditor();
      };
      controls.appendChild(editCategoryBtn);

      var delCategoryBtn = document.createElement('button');
      delCategoryBtn.className = 'tag-editor-category-btn';
      delCategoryBtn.textContent = '🗑';
      delCategoryBtn.title = 'Delete category';
      delCategoryBtn.disabled = isUncategorized;
      delCategoryBtn.onclick = function () {
        var name = cat.name || 'Category';
        if (!confirm('Delete category "' + name + '"? Tags will become Uncategorized.')) return;
        queueDeleteCategory(cat);
      };
      controls.appendChild(delCategoryBtn);

      header.appendChild(controls);
      wrap.appendChild(header);

      var grid = document.createElement('div');
      grid.className = 'tag-editor-tag-grid';
      if (collapsed) {
        grid.style.display = 'none';
      }

      var catTags = tagsByCategory.get(cat.id) || [];
      catTags.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      catTags.forEach(function (tag) {
        var chip = document.createElement('div');
        var stateClass = getEffectiveTagStateClass(tag.name, items);
        chip.className = 'tag-chip ' + stateClass;
        chip.dataset.tag = tag.name;
        var pendingAction = getPendingTagAction(tag.name);

        var label = document.createElement('span');
        label.className = 'tag-chip-label';
        label.textContent = tag.name;
        chip.appendChild(label);

        var plusBtn = document.createElement('button');
        plusBtn.className = 'chip-btn';
        plusBtn.textContent = '➕';
        plusBtn.title = 'Add tag';
        plusBtn.disabled = !Array.isArray(items) || items.length === 0;
        if (pendingAction === 'add') {
          plusBtn.classList.add('is-selected');
          plusBtn.setAttribute('aria-pressed', 'true');
        } else {
          plusBtn.setAttribute('aria-pressed', 'false');
        }
        plusBtn.onclick = function () {
          toggleTagSelection(tag.name, 'add');
          renderTagEditor();
        };
        chip.appendChild(plusBtn);

        var minusBtn = document.createElement('button');
        minusBtn.className = 'chip-btn';
        minusBtn.textContent = '➖';
        minusBtn.title = 'Remove tag';
        minusBtn.disabled = !Array.isArray(items) || items.length === 0;
        if (pendingAction === 'remove') {
          minusBtn.classList.add('is-selected');
          minusBtn.setAttribute('aria-pressed', 'true');
        } else {
          minusBtn.setAttribute('aria-pressed', 'false');
        }
        minusBtn.onclick = function () {
          toggleTagSelection(tag.name, 'remove');
          renderTagEditor();
        };
        chip.appendChild(minusBtn);

        var editBtn = document.createElement('button');
        editBtn.className = 'chip-btn';
        editBtn.textContent = '✏️';
        editBtn.title = 'Edit tag';
        editBtn.onclick = function () {
          openTagEditModal(tag, categories);
        };
        chip.appendChild(editBtn);

        var delBtn = document.createElement('button');
        delBtn.className = 'chip-btn';
        delBtn.textContent = '🗑';
        delBtn.title = 'Delete tag';
        delBtn.onclick = function () {
          if (!confirm('Delete tag "' + tag.name + '"?')) return;
          queueDeleteTag(tag.name);
        };
        chip.appendChild(delBtn);

        grid.appendChild(chip);
      });

      wrap.appendChild(grid);
      tagEditorBody.appendChild(wrap);
    });

    if (tagEditorApplyBtn) {
      tagEditorApplyBtn.textContent = hasPendingTagEditorMutations() ? '✅️*' : '✅️';
      tagEditorApplyBtn.disabled = !hasPendingTagEditorMutations();
    }
  }

  function refreshTagEditorModel() {
    var itemIds = getCurrentItemIdsForTagEditor();
    return apiPost('/api/tag-editor/model', { itemIds: itemIds })
      .then(function (r) {
        if (!r.ok) throw new Error('tag-model:' + r.status);
        return r.json();
      })
      .then(function (model) {
        state.tagEditorModel = model || { categories: [], tags: [], items: [] };
        if (!Array.isArray(state.tagEditorCategoryOrder) || state.tagEditorCategoryOrder.length === 0) {
          var initialCategories = Array.isArray(state.tagEditorModel.categories) ? state.tagEditorModel.categories.slice() : [];
          initialCategories = canonicalizeCategories(initialCategories);
          initialCategories.sort(function (a, b) {
            var x = Number(a.sortOrder || 0);
            var y = Number(b.sortOrder || 0);
            if (x !== y) return x - y;
            return String(a.name || '').localeCompare(String(b.name || ''));
          });
          state.tagEditorCategoryOrder = initialCategories.map(function (c) { return String(c.id || ''); });
        }
        renderTagEditor();
      });
  }

  function pauseForTagEditor() {
    state.tagEditorWasPlaying = false;
    state.tagEditorPhotoTimerRunning = false;
    if (state.current?.mediaType === 'photo') {
      state.tagEditorPhotoTimerRunning = !!photoTimerId;
      clearPhotoTimer();
      return;
    }

    if (video && video.style.display !== 'none') {
      state.tagEditorWasPlaying = !video.paused;
      video.pause();
    }
  }

  function resumeAfterTagEditor() {
    if (!state.current) return;
    if (state.current.mediaType === 'photo') {
      if (state.tagEditorPhotoTimerRunning && (state.autoplay || state.loop)) {
        playCurrent();
      }
      return;
    }

    if (state.tagEditorWasPlaying && video && video.style.display !== 'none') {
      video.play().catch(function () {});
    }
  }

  function openTagEditor() {
    if (!tagEditor) {
      return;
    }

    state.tagEditorOpen = true;
    state.tagEditorItemIds = getCurrentItemIdsForTagEditor();
    state.tagEditorCategoryOrder = [];
    state.tagEditorCollapsedCategories = loadTagEditorCollapsedCategories();
    resetTagEditorPending();
    pauseForTagEditor();
    tagEditor.style.display = 'flex';
    refreshTagEditorModel().catch(function (err) {
      setStatus('Tag editor unavailable: ' + (err.message || err));
    });
  }

  function closeTagEditor() {
    if (!tagEditor) return;
    closeTagEditModal();
    state.tagEditorOpen = false;
    state.tagEditorItemIds = [];
    tagEditor.style.display = 'none';
    resumeAfterTagEditor();
  }

  async function applyTagEditorChangesAsync() {
    var pending = state.tagEditorPending || createTagEditorPending();
    var itemIds = getCurrentItemIdsForTagEditor();
    var display = buildTagEditorDisplayModel();
    var categories = display.categories || [];

    for (var i = 0; i < categories.length; i++) {
      var category = categories[i];
      if (isUncategorizedCategoryId(category.id)) continue;
      var upsertResp = await apiPost('/api/tag-editor/upsert-category', {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder
      });
      if (!upsertResp.ok) {
        throw new Error('Category update failed (' + upsertResp.status + ')');
      }
    }

    for (const categoryId of pending.deleteCategoryIds.values()) {
      var deleteCategoryResp = await apiPost('/api/tag-editor/delete-category', {
        categoryId: categoryId,
        newCategoryId: null
      });
      if (!deleteCategoryResp.ok) {
        throw new Error('Category delete failed (' + deleteCategoryResp.status + ')');
      }
    }

    for (const upsertTagOp of pending.upsertTags.values()) {
      var upsertTagResp = await apiPost('/api/tag-editor/upsert-tag', {
        name: upsertTagOp.name,
        categoryId: upsertTagOp.categoryId || ''
      });
      if (!upsertTagResp.ok) {
        throw new Error('Tag create/update failed (' + upsertTagResp.status + ')');
      }
    }

    for (const renameTagOp of pending.renameTags.values()) {
      var renameTagResp = await apiPost('/api/tag-editor/rename-tag', {
        oldName: renameTagOp.oldName,
        newName: renameTagOp.newName,
        newCategoryId: renameTagOp.newCategoryId
      });
      if (!renameTagResp.ok) {
        throw new Error('Tag rename failed (' + renameTagResp.status + ')');
      }
    }

    for (const deleteTagOp of pending.deleteTags.values()) {
      var deleteTagResp = await apiPost('/api/tag-editor/delete-tag', { name: deleteTagOp.name });
      if (!deleteTagResp.ok) {
        throw new Error('Tag delete failed (' + deleteTagResp.status + ')');
      }
    }

    var addTags = [];
    var removeTags = [];
    for (const selection of state.tagEditorSelections.values()) {
      if (selection?.action === 'add') addTags.push(selection.name);
      else if (selection?.action === 'remove') removeTags.push(selection.name);
    }

    if (itemIds.length > 0 && (addTags.length > 0 || removeTags.length > 0)) {
      var applyResp = await apiPost('/api/tag-editor/apply-item-tags', {
        itemIds: itemIds,
        addTags: addTags,
        removeTags: removeTags
      });
      if (!applyResp.ok) {
        throw new Error('Tag apply failed (' + applyResp.status + ')');
      }
    }
  }

  function toggleOverlayControls() {
    if (!state.current) return;
    mediaContainer.classList.toggle('controls-visible');
  }

  function loadPresets() {
    return fetchJSON(API + '/api/presets')
      .then(presets => {
        state.presets = presets || [];
        presetSelect.innerHTML = '<option value="">Choose preset</option>';
        state.presets.forEach(p => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name || p.id;
          presetSelect.appendChild(o);
        });
      })
      .catch(e => {
        presetSelect.innerHTML = '<option value="">Error loading presets</option>';
        setStatus('Error: ' + (e.message || 'Failed to load'));
        if (e.message === 'Unauthorized') pairSection.style.display = 'block';
      });
  }

  function loadVersion() {
    if (!versionEl) return;
    fetchJSON(API + '/api/version')
      .then(v => { versionEl.textContent = 'ReelRoulette v' + (v.appVersion || '?') + ' / API v' + (v.apiVersion || '1'); })
      .catch(() => { versionEl.textContent = 'Offline'; });
  }

  function getRandom() {
    const presetId = presetSelect.value;
    if (!presetId) { setStatus('Select a preset'); return; }
    setStatus('Loading...');
    fetch(API + '/api/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        presetId,
        clientId: state.clientId,
        includeVideos: true,
        includePhotos: true,
        randomizationMode: state.randomizationMode
      })
    })
      .then(r => {
        if (r.status === 401) throw new Error('Unauthorized');
        return r.json();
      })
      .then(data => {
        if (data && data.mediaUrl) {
          state.current = data;
          applyCachedState(state.current);
          state.history = state.history.slice(0, state.historyIndex + 1);
          state.history.push(data);
          state.historyIndex = state.history.length - 1;
          playCurrent();
          setStatus('Playing');
        } else {
          setStatus('No media found');
        }
      })
      .catch(e => {
        setStatus('Error: ' + (e.message || 'Request failed'));
        if (e.message === 'Unauthorized') pairSection.style.display = 'block';
      });
  }

  function clearPhotoTimer() {
    if (photoTimerId) { clearTimeout(photoTimerId); photoTimerId = null; }
  }

  function goPrevious() {
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    state.current = state.history[state.historyIndex];
    playCurrent();
  }

  function goNext() {
    if (state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      state.current = state.history[state.historyIndex];
      playCurrent();
    } else {
      getRandom();
    }
  }

  function updateToggleButtons() {
    if (loopBtn) loopBtn.classList.toggle('active', state.loop);
    if (autoplayBtn) autoplayBtn.classList.toggle('active', state.autoplay);
    if (favoriteBtn) favoriteBtn.classList.toggle('active', state.current?.isFavorite === true);
    if (blacklistBtn) blacklistBtn.classList.toggle('active', state.current?.isBlacklisted === true);
  }

  function playCurrent() {
    const c = state.current;
    if (!c) return;
    applyCachedState(c);
    video.pause();
    video.src = '';
    video.load();
    clearPhotoTimer();
    video.style.display = 'none';
    photo.style.display = 'none';
    el('empty-state').style.display = 'none';
    nowPlaying.style.display = 'block';
    var fullName = c.displayName || '';
    nowPlayingName.textContent = truncateName(fullName, 45);
    nowPlayingName.title = fullName;
    nowPlayingDuration.textContent = c.durationSeconds != null ? fmtTime(c.durationSeconds) : '';
    recordPlaybackForPresentation(c);

    if (c.mediaType === 'photo') {
      photo.src = c.mediaUrl;
      photo.style.display = 'block';
      seekRow.style.display = 'none';
      var sec = Math.max(1, Math.min(300, state.photoDurationSeconds));
      if (state.loop) {
        var currentId = c.id;
        photoTimerId = setTimeout(function () {
          // Loop takes priority for photos (desktop parity): replay same photo.
          if (state.current && state.current.id === currentId) {
            playCurrent();
          }
        }, sec * 1000);
      } else if (state.autoplay) {
        photoTimerId = setTimeout(function () {
          if (state.historyIndex < state.history.length - 1) goNext();
          else getRandom();
        }, sec * 1000);
      }
    } else {
      video.src = c.mediaUrl;
      video.style.display = 'block';
      seekRow.style.display = 'flex';
      setupVideoEvents();
    }
    updateToggleButtons();
  }

  function toggleFullscreen() {
    if (!state.current) return;
    var doc = document;
    var fs = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!fs) {
      var req = mediaContainer.requestFullscreen || mediaContainer.webkitRequestFullscreen;
      if (req) req.call(mediaContainer);
    } else {
      var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (exit) exit.call(doc);
    }
  }

  function setupVideoEvents() {
    video.volume = 1;
    video.loop = state.loop;
    video.onended = () => {
      if (state.autoplay && !state.loop) {
        if (state.historyIndex < state.history.length - 1) goNext();
        else getRandom();
      }
    };
    video.onloadedmetadata = () => {
      seekSlider.max = Math.floor(video.duration) || 100;
      updateTimeDisplay();
    };
    video.ontimeupdate = updateTimeDisplay;
    video.oncanplay = function tryPlay() {
      video.oncanplay = null;
      video.play().catch(function () {});
    };
  }

  function recordPlaybackForPresentation(item) {
    if (!item || !item.id) return;
    var key = String(state.historyIndex) + ':' + String(item.id).toLowerCase();
    if (state.lastRecordedPresentationKey === key) return;
    state.lastRecordedPresentationKey = key;

    fetch(API + '/api/record-playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: state.clientId, path: item.id })
    }).then(function (r) {
      if (!r.ok && r.status !== 404) {
        console.warn('record playback failed', r.status);
      }
    }).catch(function (err) {
      console.warn('record playback request failed', err);
    });
  }

  function updateTimeDisplay() {
    if (!video.duration) return;
    timeDisplay.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
    seekSlider.value = Math.floor(video.currentTime);
  }

  function onControlAction(e) {
    if (e) e.stopPropagation();
  }

  mediaContainer.addEventListener('click', function (e) {
    if (touchWasSwipe) { touchWasSwipe = false; return; }
    if (touchHandledTap) { touchHandledTap = false; return; }
    if (state.current) {
      toggleOverlayControls();
    } else if (presetSelect.value) {
      getRandom();
    }
  });
  if (overlayControls) {
    overlayControls.addEventListener('touchstart', function (e) { e.stopPropagation(); });
    overlayControls.addEventListener('touchmove', function (e) { e.stopPropagation(); });
    overlayControls.addEventListener('touchend', function (e) { e.stopPropagation(); });
    overlayControls.addEventListener('click', function (e) { e.stopPropagation(); });
  }
  mediaContainer.addEventListener('touchstart', function (e) {
    if (e.target && e.target.closest && e.target.closest('#overlay-controls')) {
      ignoreSwipeTouch = true;
      return;
    }
    ignoreSwipeTouch = false;
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchWasSwipe = false;
    }
  }, { passive: true });
  mediaContainer.addEventListener('touchend', function (e) {
    if (ignoreSwipeTouch) {
      ignoreSwipeTouch = false;
      return;
    }
    if (!e.changedTouches || !e.changedTouches[0]) return;
    var tx = e.changedTouches[0].clientX;
    var ty = e.changedTouches[0].clientY;
    var dx = tx - touchStartX;
    var dy = ty - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      touchWasSwipe = true;
      if (dx > 0) goPrevious();
      else goNext();
    } else if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
      if (state.current) {
        touchHandledTap = true;
        toggleOverlayControls();
      }
    }
  }, { passive: true });

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', e => { onControlAction(e); toggleFullscreen(); });
  nextBtn.addEventListener('click', e => { onControlAction(e); goNext(); });
  prevBtn.addEventListener('click', e => { onControlAction(e); goPrevious(); });
  if (favoriteBtn) favoriteBtn.addEventListener('click', e => {
    onControlAction(e);
    if (!state.current?.id) return;
    var next = !state.current.isFavorite;
    fetch(API + '/api/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: state.current.id, isFavorite: next })
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401) pairSection.style.display = 'block';
        setStatus('Favorite update failed (' + r.status + ')');
        return;
      }
      state.current.isFavorite = next;
      if (next) state.current.isBlacklisted = false;
      // Local optimistic update should not outrank authoritative server SSE revisions.
      cacheItemState(state.current.id, state.current.isFavorite, state.current.isBlacklisted, 0);
      updateToggleButtons();
      setStatus(next ? 'Added to favorites' : 'Removed from favorites');
    });
  });
  if (blacklistBtn) blacklistBtn.addEventListener('click', e => {
    onControlAction(e);
    if (!state.current?.id) return;
    var next = !state.current.isBlacklisted;
    fetch(API + '/api/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: state.current.id, isBlacklisted: next })
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401) pairSection.style.display = 'block';
        setStatus('Blacklist update failed (' + r.status + ')');
        return;
      }
      state.current.isBlacklisted = next;
      if (next) state.current.isFavorite = false;
      // Local optimistic update should not outrank authoritative server SSE revisions.
      cacheItemState(state.current.id, state.current.isFavorite, state.current.isBlacklisted, 0);
      updateToggleButtons();
      setStatus(next ? 'Blacklisted' : 'Removed from blacklist');
    });
  });
  playBtn.addEventListener('click', e => {
    onControlAction(e);
    if (!state.current) { getRandom(); return; }
    if (video.style.display !== 'none') {
      video.paused ? video.play() : video.pause();
    }
  });
  seekSlider.addEventListener('input', () => {
    if (video.duration) video.currentTime = +seekSlider.value;
  });
  loopBtn.addEventListener('click', e => {
    onControlAction(e);
    state.loop = !state.loop;
    if (video.src) video.loop = state.loop;
    if (state.current && state.current.mediaType === 'photo') {
      if (state.loop || state.autoplay) playCurrent();
      else clearPhotoTimer();
    }
    updateToggleButtons();
  });
  autoplayBtn.addEventListener('click', e => {
    onControlAction(e);
    state.autoplay = !state.autoplay;
    if (state.current && state.current.mediaType === 'photo') {
      if (state.loop || state.autoplay) playCurrent();
      else clearPhotoTimer();
    } else if (!state.autoplay) {
      clearPhotoTimer();
    }
    updateToggleButtons();
  });
  if (tagEditBtn) {
    tagEditBtn.addEventListener('click', function (e) {
      onControlAction(e);
      openTagEditor();
    });
  }
  if (tagEditorCloseBtn) tagEditorCloseBtn.addEventListener('click', closeTagEditor);
  if (tagEditorRefreshBtn) {
    tagEditorRefreshBtn.addEventListener('click', function () {
      resetTagEditorPending();
      state.tagEditorCategoryOrder = [];
      refreshTagEditorModel().catch(function (err) {
        setStatus('Tag refresh failed: ' + (err.message || err));
      });
    });
  }
  if (tagEditorAddCategoryBtn) {
    tagEditorAddCategoryBtn.addEventListener('click', function () {
      var name = prompt('New category name');
      if (!name || !name.trim()) return;
      var id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      state.tagEditorPending.upsertCategories.set(id, {
        id: id,
        name: name.trim(),
        sortOrder: state.tagEditorCategoryOrder.length
      });
      var uncatIdx = state.tagEditorCategoryOrder.findIndex(function (x) { return isUncategorizedCategoryId(x); });
      if (uncatIdx >= 0) {
        state.tagEditorCategoryOrder.splice(uncatIdx, 0, id);
      } else {
        state.tagEditorCategoryOrder.push(id);
      }
      renderTagEditor();
    });
  }
  if (tagEditorAddTagBtn) {
    tagEditorAddTagBtn.addEventListener('click', function () {
      var tagName = (tagEditorNewTag && tagEditorNewTag.value || '').trim();
      var categoryId = tagEditorCategorySelect ? tagEditorCategorySelect.value : UNCATEGORIZED_CATEGORY_ID;
      if (!tagName) return;
      var tagKey = normalizeTagKey(tagName);
      state.tagEditorPending.deleteTags.delete(tagKey);
      state.tagEditorPending.upsertTags.set(tagKey, { name: tagName, categoryId: categoryId || UNCATEGORIZED_CATEGORY_ID });
      if (getCurrentItemIdsForTagEditor().length > 0) {
        state.tagEditorSelections.set(tagKey, { action: 'add', name: tagName });
      } else {
        state.tagEditorSelections.delete(tagKey);
      }
      if (tagEditorNewTag) tagEditorNewTag.value = '';
      renderTagEditor();
    });
  }
  if (tagEditorApplyBtn) {
    tagEditorApplyBtn.addEventListener('click', async function () {
      try {
        await applyTagEditorChangesAsync();
        setStatus('Tag editor changes applied');
        closeTagEditor();
      } catch (err) {
        setStatus((err && err.message) ? err.message : ('Tag apply failed: ' + err));
      }
    });
  }

  if (tagEditCancelBtn) {
    tagEditCancelBtn.addEventListener('click', function () {
      closeTagEditModal();
    });
  }

  if (tagEditSaveBtn) {
    tagEditSaveBtn.addEventListener('click', function () {
      if (!state.tagEditContext || !tagEditNameInput || !tagEditCategorySelect) {
        closeTagEditModal();
        return;
      }

      var nextName = String(tagEditNameInput.value || '').trim();
      if (!nextName) {
        setStatus('Tag name is required.');
        return;
      }

      var oldName = state.tagEditContext.oldName;
      var oldCategoryId = state.tagEditContext.oldCategoryId;
      var selectedCategoryId = String(tagEditCategorySelect.value || UNCATEGORIZED_CATEGORY_ID);
      var nameChanged = normalizeTagKey(nextName) !== normalizeTagKey(oldName);
      var categoryChanged = selectedCategoryId !== oldCategoryId;
      if (!nameChanged && !categoryChanged) {
        closeTagEditModal();
        return;
      }

      queueRenameTag(oldName, nextName, categoryChanged ? selectedCategoryId : null);
      closeTagEditModal();
    });
  }

  if (tagEditModal) {
    tagEditModal.addEventListener('click', function (evt) {
      if (evt.target === tagEditModal) {
        closeTagEditModal();
      }
    });
  }

  var photoDurationInput = el('photo-duration');
  if (photoDurationInput) {
    var saved = localStorage.getItem(PHOTO_DURATION_KEY);
    if (saved != null) {
      var n = parseInt(saved, 10);
      if (!isNaN(n) && n >= 1 && n <= 300) { state.photoDurationSeconds = n; photoDurationInput.value = n; }
    } else { photoDurationInput.value = state.photoDurationSeconds; }
    photoDurationInput.addEventListener('change', function () {
      var n = parseInt(photoDurationInput.value, 10);
      if (!isNaN(n) && n >= 1 && n <= 300) {
        state.photoDurationSeconds = n;
        localStorage.setItem(PHOTO_DURATION_KEY, String(n));
        if (state.current && state.current.mediaType === 'photo' && (state.autoplay || state.loop)) playCurrent();
      }
    });
  }
  presetSelect.addEventListener('change', () => { state.currentPresetId = presetSelect.value; });
  if (randomizationModeSelect) {
    var savedMode = localStorage.getItem(RANDOMIZATION_MODE_KEY);
    if (savedMode && Array.from(randomizationModeSelect.options).some(function (o) { return o.value === savedMode; })) {
      state.randomizationMode = savedMode;
    }
    randomizationModeSelect.value = state.randomizationMode;
    randomizationModeSelect.addEventListener('change', function () {
      state.randomizationMode = randomizationModeSelect.value || 'SmartShuffle';
      localStorage.setItem(RANDOMIZATION_MODE_KEY, state.randomizationMode);
    });
  }

  var evtSource = null;
  var evtReconnectTimer = null;
  var sseWatchdogTimer = null;
  var reconcileTimer = null;
  var ackHeartbeatTimer = null;
  var lastSseAt = 0;
  var lastLifecycleReconnectAt = 0;
  var lastAckRevision = 0;
  function sendAck(revision, force) {
    var rev = Number(revision || 0);
    if (!force && (!rev || rev <= lastAckRevision)) return;
    lastAckRevision = rev;
    fetch(API + '/api/events/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId: state.clientId, revision: rev })
    }).catch(function (err) {
      console.debug('ack post failed', err);
    });
  }
  function markSseActivity() {
    lastSseAt = Date.now();
  }
  function ensurePeriodicReconcile() {
    if (reconcileTimer) return;
    reconcileTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      reconcileKnownStates('interval');
    }, RECONCILE_INTERVAL_MS);
  }
  function ensureAckHeartbeat() {
    if (ackHeartbeatTimer) return;
    ackHeartbeatTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      sendAck(lastAckRevision, true);
    }, ACK_HEARTBEAT_MS);
  }
  function ensureSseWatchdog() {
    if (sseWatchdogTimer) return;
    sseWatchdogTimer = setInterval(function () {
      if (!lastSseAt) return;
      if (Date.now() - lastSseAt > SSE_STALE_MS) {
        postSyncLog('warn', 'SSE watchdog stale detected, reconnecting');
        scheduleEventsReconnect();
      }
    }, SSE_WATCHDOG_MS);
  }
  function clearEventsReconnectTimer() {
    if (evtReconnectTimer) {
      clearTimeout(evtReconnectTimer);
      evtReconnectTimer = null;
    }
  }
  function scheduleEventsReconnect() {
    if (evtReconnectTimer) return;
    postSyncLog('info', 'SSE reconnect scheduled');
    evtReconnectTimer = setTimeout(function () {
      evtReconnectTimer = null;
      connectEvents();
    }, EVENTS_RETRY_MS);
  }
  function connectEvents() {
    clearEventsReconnectTimer();
    ensureSseWatchdog();
    ensurePeriodicReconcile();
    ensureAckHeartbeat();
    if (evtSource) {
      try { evtSource.close(); } catch (err) { console.warn('eventsource close failed', err); }
      evtSource = null;
    }
    var eventsUrl = API + '/api/events?clientId=' + encodeURIComponent(state.clientId);
    postSyncLog('info', 'SSE connect', { itemId: eventsUrl });
    evtSource = new EventSource(eventsUrl, { withCredentials: true });
    evtSource.onopen = function () {
      markSseActivity();
      postSyncLog('info', 'SSE open');
      reconcileKnownStates('open');
    };
    evtSource.onmessage = function (e) {
      try {
        markSseActivity();
        var data = JSON.parse(e.data);
        if (!data.itemId) return;
        cacheItemState(data.itemId, data.isFavorite, data.isBlacklisted, data.revision);
        var targetKey = normalizePath(data.itemId);
        for (var i = 0; i < state.history.length; i++) {
          var h = state.history[i];
          if (h && normalizePath(h.id) === targetKey) {
            h.isFavorite = !!data.isFavorite;
            h.isBlacklisted = !!data.isBlacklisted;
          }
        }
        var fileName = basenameFromPath(data.itemId);
        if (!!data.isBlacklisted) setStatus('Synced: Blacklisted: ' + fileName);
        else setStatus(!!data.isFavorite ? 'Synced: Added to favorites: ' + fileName : 'Synced: Removed from favorites: ' + fileName);
        if (state.current && normalizePath(state.current.id) === targetKey) {
          state.current.isFavorite = !!data.isFavorite;
          state.current.isBlacklisted = !!data.isBlacklisted;
          updateToggleButtons();
        }
        sendAck(data.revision);
      } catch (err) {
        console.warn('SSE message processing failed', err);
        postSyncLog('error', 'SSE message processing failed: ' + (err?.message || err), { revision: -1 });
      }
    };
    evtSource.addEventListener('ping', function () {
      markSseActivity();
    });
    evtSource.onerror = function () {
      postSyncLog('warn', 'SSE error');
      scheduleEventsReconnect();
    };
  }

  function reconnectForLifecycle(reason) {
    var now = Date.now();
    if (now - lastLifecycleReconnectAt < LIFECYCLE_RECONNECT_COOLDOWN_MS) return;
    lastLifecycleReconnectAt = now;
    postSyncLog('info', 'Lifecycle reconnect: ' + reason);
    connectEvents();
    reconcileKnownStates('lifecycle:' + reason);
  }

  pairBtn.addEventListener('click', () => {
    const token = pairToken.value.trim();
    if (!token) return;
    fetch(API + '/api/pair?token=' + encodeURIComponent(token), { credentials: 'include' })
      .then(r => {
        if (r.ok) { setStatus('Paired'); pairSection.style.display = 'none'; loadPresets(); connectEvents(); reconcileKnownStates('paired'); }
        else setStatus('Pairing failed');
      });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible')
      reconnectForLifecycle('visibility');
  });
  window.addEventListener('focus', function () { reconnectForLifecycle('focus'); });
  window.addEventListener('pageshow', function () { reconnectForLifecycle('pageshow'); });
  window.addEventListener('online', function () { reconnectForLifecycle('online'); });

  loadPresets().then(() => setStatus('Ready'));
  loadVersion();
  updateToggleButtons();
  connectEvents();
})();
