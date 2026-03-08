const CLIENT_ID_KEY = "rr_clientId";
const SESSION_ID_KEY = "rr_sessionId";
const PHOTO_DURATION_KEY = "rr_photoDuration";
const RANDOMIZATION_MODE_KEY = "rr_randomizationMode";
const TAG_EDITOR_COLLAPSED_KEY = "rr_tagEditorCollapsed";
const UNCATEGORIZED_CATEGORY_ID = "uncategorized";
const SWIPE_THRESHOLD = 50;
const TAP_THRESHOLD = 10;
const WEBUI_API_VERSION = "1";
const SUPPORTED_SERVER_API_VERSIONS = new Set(["1", "0"]);
const REQUIRED_SERVER_CAPABILITIES = [
  "auth.sessionCookie",
  "identity.sessionId",
  "events.refreshStatusChanged",
  "events.resyncRequired",
  "api.random.filterState",
  "api.presets.match"
];

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }

  return id;
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }

  return id;
}

function normalizePath(path) {
  return String(path || "").replace(/\//g, "\\").toLowerCase();
}

function fmtTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) {
    return "0:00";
  }

  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function basenameFromPath(path) {
  const normalized = String(path || "").replace(/\//g, "\\");
  const idx = normalized.lastIndexOf("\\");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function truncateName(name, maxChars) {
  const text = String(name || "");
  const max = Number(maxChars || 45);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function absolutizeMediaUrl(apiBaseUrl, mediaUrl) {
  if (!mediaUrl) {
    return "";
  }

  try {
    return new URL(mediaUrl, `${apiBaseUrl}/`).toString();
  } catch {
    return mediaUrl;
  }
}

function parseEnvelopePayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.payload) {
      return parsed.payload;
    }
  } catch {
    // ignored
  }

  return null;
}

function getElement(id) {
  return document.getElementById(id);
}

function parseApiVersion(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateServerCompatibility(version) {
  const apiVersion = String(version?.apiVersion || "").trim();
  if (!SUPPORTED_SERVER_API_VERSIONS.has(apiVersion)) {
    return `Unsupported server API version: ${apiVersion || "unknown"}.`;
  }

  const minimumCompatible = parseApiVersion(version?.minimumCompatibleApiVersion);
  const webUiVersion = parseApiVersion(WEBUI_API_VERSION);
  if (Number.isFinite(minimumCompatible) && Number.isFinite(webUiVersion) && webUiVersion < minimumCompatible) {
    return `Server requires client API version ${version.minimumCompatibleApiVersion} or newer.`;
  }

  const capabilitySet = new Set(Array.isArray(version?.capabilities) ? version.capabilities.map((x) => String(x)) : []);
  const missing = REQUIRED_SERVER_CAPABILITIES.filter((key) => !capabilitySet.has(key));
  if (missing.length > 0) {
    return `Server missing required capabilities: ${missing.join(", ")}.`;
  }

  return null;
}

export function startLegacyApp(config) {
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/+$/, "");
  const sseUrl = config.sseUrl;
  const state = {
    clientId: getClientId(),
    sessionId: getSessionId(),
    presets: [],
    currentPresetId: "",
    history: [],
    historyIndex: -1,
    current: null,
    loop: false,
    autoplay: false,
    randomizationMode: "SmartShuffle",
    photoDurationSeconds: 15,
    itemStates: new Map(),
    tagEditorModel: null,
    tagEditorOpen: false,
    tagEditorCategoryOrder: [],
    tagEditorSelections: new Map(),
    tagEditorPending: null,
    tagEditorCollapsedCategories: new Set(),
    tagEditorItemIds: [],
    tagEditContext: null,
    tagEditorWasPlaying: false,
    tagEditorPhotoTimerRunning: false,
    compatibilityBlocked: false
  };

  const video = getElement("video");
  const photo = getElement("photo");
  const statusEl = getElement("status");
  const presetSelect = getElement("preset-select");
  const randomizationModeSelect = getElement("randomization-mode-select");
  const pairSection = getElement("pair-section");
  const pairToken = getElement("pair-token");
  const pairBtn = getElement("pair-btn");
  const nowPlaying = getElement("now-playing");
  const nowPlayingName = getElement("now-playing-name");
  const nowPlayingDuration = getElement("now-playing-duration");
  const mediaContainer = getElement("media-container");
  const overlayControls = getElement("overlay-controls");
  const seekRow = getElement("seek-row");
  const seekSlider = getElement("seek-slider");
  const timeDisplay = getElement("time-display");
  const favoriteBtn = getElement("favorite-btn");
  const blacklistBtn = getElement("blacklist-btn");
  const prevBtn = getElement("prev-btn");
  const playBtn = getElement("play-btn");
  const nextBtn = getElement("next-btn");
  const loopBtn = getElement("loop-btn");
  const autoplayBtn = getElement("autoplay-btn");
  const fullscreenBtn = getElement("fullscreen-btn");
  const tagEditBtn = getElement("tag-edit-btn");
  const tagEditor = getElement("tag-editor");
  const tagEditorBody = getElement("tag-editor-body");
  const tagEditorCloseBtn = getElement("tag-editor-close-btn");
  const tagEditorRefreshBtn = getElement("tag-editor-refresh-btn");
  const tagEditorAddCategoryBtn = getElement("tag-editor-add-category-btn");
  const tagEditorCategorySelect = getElement("tag-editor-category-select");
  const tagEditorNewTag = getElement("tag-editor-new-tag");
  const tagEditorAddTagBtn = getElement("tag-editor-add-tag-btn");
  const tagEditorApplyBtn = getElement("tag-editor-apply-btn");
  const tagEditModal = getElement("tag-edit-modal");
  const tagEditName = getElement("tag-edit-name");
  const tagEditCategory = getElement("tag-edit-category");
  const tagEditCancelBtn = getElement("tag-edit-cancel-btn");
  const tagEditSaveBtn = getElement("tag-edit-save-btn");
  const photoDurationInput = getElement("photo-duration");
  const emptyState = getElement("empty-state");

  if (
    !video || !photo || !statusEl || !presetSelect || !pairSection || !pairToken || !pairBtn ||
    !mediaContainer || !seekRow || !seekSlider || !timeDisplay || !nowPlaying || !nowPlayingName ||
    !nowPlayingDuration || !favoriteBtn || !blacklistBtn || !prevBtn || !playBtn || !nextBtn ||
    !loopBtn || !autoplayBtn || !fullscreenBtn || !tagEditBtn || !tagEditor || !tagEditorBody ||
    !tagEditorCloseBtn || !tagEditorRefreshBtn || !tagEditorAddCategoryBtn || !tagEditorCategorySelect ||
    !tagEditorNewTag || !tagEditorAddTagBtn || !tagEditorApplyBtn || !tagEditModal || !tagEditName ||
    !tagEditCategory || !tagEditCancelBtn || !tagEditSaveBtn || !photoDurationInput || !emptyState
  ) {
    throw new Error("Legacy WebUI bootstrap failed: missing required DOM elements.");
  }

  let photoTimerId = null;
  let eventSource = null;
  let reconnectTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchWasSwipe = false;
  let touchHandledTap = false;
  let ignoreSwipeTouch = false;
  function apiPost(path, payload) {
    return fetch(buildApiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload || {})
    });
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function blockForCompatibility(message) {
    state.compatibilityBlocked = true;
    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignored
      }
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    setStatus(message);
  }

  function buildApiUrl(path) {
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    return new URL(normalized, `${apiBaseUrl}/`).toString();
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(buildApiUrl(path), {
      credentials: "include",
      ...options
    });
    if (response.status === 401) {
      pairSection.style.display = "block";
      throw new Error("Unauthorized");
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  function cacheItemState(itemId, isFavorite, isBlacklisted) {
    if (!itemId) return;
    state.itemStates.set(normalizePath(itemId), {
      isFavorite: !!isFavorite,
      isBlacklisted: !!isBlacklisted
    });
  }

  function applyCachedState(item) {
    if (!item?.id) return;
    const cached = state.itemStates.get(normalizePath(item.id));
    if (!cached) return;
    item.isFavorite = cached.isFavorite;
    item.isBlacklisted = cached.isBlacklisted;
  }

  function updateToggleButtons() {
    loopBtn.classList.toggle("active", state.loop);
    autoplayBtn.classList.toggle("active", state.autoplay);
    favoriteBtn.classList.toggle("active", state.current?.isFavorite === true);
    blacklistBtn.classList.toggle("active", state.current?.isBlacklisted === true);
  }

  function clearPhotoTimer() {
    if (photoTimerId) {
      clearTimeout(photoTimerId);
      photoTimerId = null;
    }
  }

  function pauseForTagEditor() {
    state.tagEditorWasPlaying = false;
    state.tagEditorPhotoTimerRunning = false;
    if (state.current?.mediaType === "photo") {
      state.tagEditorPhotoTimerRunning = !!photoTimerId;
      clearPhotoTimer();
      return;
    }

    if (video && video.style.display !== "none") {
      state.tagEditorWasPlaying = !video.paused;
      video.pause();
    }
  }

  function resumeAfterTagEditor() {
    if (!state.current) return;
    if (state.current.mediaType === "photo") {
      if (state.tagEditorPhotoTimerRunning && (state.autoplay || state.loop)) {
        playCurrent();
      }
      return;
    }

    if (state.tagEditorWasPlaying && video && video.style.display !== "none") {
      void video.play().catch(() => {});
    }
  }

  function updateTimeDisplay() {
    if (!video.duration) return;
    timeDisplay.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
    seekSlider.value = String(Math.floor(video.currentTime));
  }

  function setupVideoEvents() {
    video.loop = state.loop;
    video.onloadedmetadata = () => {
      seekSlider.max = String(Math.floor(video.duration) || 100);
      updateTimeDisplay();
    };
    video.ontimeupdate = () => updateTimeDisplay();
    video.onended = () => {
      if (!state.autoplay || state.loop) return;
      goNext();
    };
  }

  function playCurrent() {
    const item = state.current;
    if (!item) return;

    applyCachedState(item);
    clearPhotoTimer();
    video.pause();
    video.src = "";
    video.style.display = "none";
    photo.style.display = "none";
    seekRow.style.display = "none";
    emptyState.style.display = "none";
    nowPlaying.style.display = "block";
    const fullName = basenameFromPath(item.displayName || item.id || "");
    nowPlayingName.textContent = truncateName(fullName, 45);
    nowPlayingName.title = fullName;
    nowPlayingDuration.textContent = item.durationSeconds != null ? fmtTime(item.durationSeconds) : "";

    if (item.mediaType === "photo") {
      photo.src = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);
      photo.style.display = "block";
      if (state.loop || state.autoplay) {
        const timeoutMs = Math.max(1, Math.min(300, state.photoDurationSeconds)) * 1000;
        photoTimerId = setTimeout(() => {
          if (state.loop) {
            playCurrent();
            return;
          }
          goNext();
        }, timeoutMs);
      }
    } else {
      video.src = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);
      video.style.display = "block";
      seekRow.style.display = "flex";
      setupVideoEvents();
      void video.play().catch(() => {});
    }

    updateToggleButtons();
  }

  async function loadPresets() {
    if (state.compatibilityBlocked) {
      presetSelect.innerHTML = "<option value=\"\">Server compatibility check failed</option>";
      return;
    }

    try {
      const presets = await fetchJson("/api/presets");
      state.presets = Array.isArray(presets) ? presets : [];
      presetSelect.innerHTML = "<option value=\"\">Choose preset</option>";
      for (const preset of state.presets) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.name || preset.id;
        presetSelect.appendChild(option);
      }
    } catch (error) {
      presetSelect.innerHTML = "<option value=\"\">Error loading presets</option>";
      setStatus(`Error loading presets: ${error?.message || error}`);
    }
  }

  async function loadVersion() {
    try {
      const version = await fetchJson("/api/version");
      const compatibilityError = validateServerCompatibility(version);
      if (compatibilityError) {
        blockForCompatibility(compatibilityError);
        return false;
      }
      state.compatibilityBlocked = false;
      setStatus(`Ready (API ${version.apiVersion || "unknown"})`);
      return true;
    } catch {
      setStatus("Ready (API offline)");
      return false;
    }
  }

  async function getRandom() {
    if (state.compatibilityBlocked) {
      setStatus("Cannot play: server compatibility check failed.");
      return;
    }

    const presetId = presetSelect.value;
    if (!presetId) {
      setStatus("Select a preset.");
      return;
    }

    setStatus("Loading...");
    try {
      const response = await fetch(buildApiUrl("/api/random"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId,
          clientId: state.clientId,
          sessionId: state.sessionId,
          includeVideos: true,
          includePhotos: true,
          randomizationMode: state.randomizationMode
        })
      });
      if (response.status === 401) {
        pairSection.style.display = "block";
        setStatus("Unauthorized. Pair first.");
        return;
      }
      if (!response.ok) {
        setStatus(`Random selection failed (${response.status}).`);
        return;
      }

      const data = await response.json();
      if (!data?.mediaUrl) {
        setStatus("No media returned for selected preset.");
        return;
      }

      state.current = data;
      applyCachedState(state.current);
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(state.current);
      state.historyIndex = state.history.length - 1;
      playCurrent();
      setStatus("Playing");
    } catch (error) {
      setStatus(`Random selection failed: ${error?.message || error}`);
    }
  }

  function goPrevious() {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    state.current = state.history[state.historyIndex];
    playCurrent();
  }

  function goNext() {
    if (state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
      state.historyIndex += 1;
      state.current = state.history[state.historyIndex];
      playCurrent();
      return;
    }

    void getRandom();
  }

  async function toggleFavorite() {
    if (!state.current?.id) return;
    const nextValue = !state.current.isFavorite;
    const response = await fetch(buildApiUrl("/api/favorite"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: state.current.id, isFavorite: nextValue })
    });
    if (!response.ok) {
      setStatus(`Favorite update failed (${response.status}).`);
      return;
    }
    state.current.isFavorite = nextValue;
    if (nextValue) state.current.isBlacklisted = false;
    cacheItemState(state.current.id, state.current.isFavorite, state.current.isBlacklisted);
    updateToggleButtons();
    setStatus(nextValue ? "Added to favorites" : "Removed from favorites");
  }

  async function toggleBlacklist() {
    if (!state.current?.id) return;
    const nextValue = !state.current.isBlacklisted;
    const response = await fetch(buildApiUrl("/api/blacklist"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: state.current.id, isBlacklisted: nextValue })
    });
    if (!response.ok) {
      setStatus(`Blacklist update failed (${response.status}).`);
      return;
    }
    state.current.isBlacklisted = nextValue;
    if (nextValue) state.current.isFavorite = false;
    cacheItemState(state.current.id, state.current.isFavorite, state.current.isBlacklisted);
    updateToggleButtons();
    setStatus(nextValue ? "Blacklisted" : "Removed from blacklist");
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
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return options;
  }

  function getCurrentTagEditorItemIds() {
    if (Array.isArray(state.tagEditorItemIds) && state.tagEditorItemIds.length > 0) {
      return state.tagEditorItemIds.slice();
    }
    return state.current?.id ? [state.current.id] : [];
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
    if (!pending) return state.tagEditorSelections.size > 0;
    return state.tagEditorSelections.size > 0 ||
      pending.upsertCategories.size > 0 ||
      pending.deleteCategoryIds.size > 0 ||
      pending.upsertTags.size > 0 ||
      pending.renameTags.size > 0 ||
      pending.deleteTags.size > 0;
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
    tags.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
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
      toggleButton.className = "tag-editor-category-toggle";
      const collapsed = state.tagEditorCollapsedCategories.has(String(category.id || ""));
      toggleButton.textContent = collapsed ? "▶" : "▼";
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
      upButton.className = "tag-editor-category-btn";
      upButton.textContent = "⬆️";
      upButton.title = "Move category up";
      upButton.disabled = isUncategorized || movableCount <= 1 || categoryIndex === 0;
      upButton.onclick = () => moveCategory(category.id, -1);
      controls.appendChild(upButton);
      const downButton = document.createElement("button");
      downButton.className = "tag-editor-category-btn";
      downButton.textContent = "⬇️";
      downButton.title = "Move category down";
      const lastMovableIndex = categories.filter((item) => !isUncategorizedCategoryId(item.id)).length - 1;
      downButton.disabled = isUncategorized || movableCount <= 1 || categoryIndex >= lastMovableIndex;
      downButton.onclick = () => moveCategory(category.id, 1);
      controls.appendChild(downButton);
      const editCategoryButton = document.createElement("button");
      editCategoryButton.className = "tag-editor-category-btn";
      editCategoryButton.textContent = "✏️";
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
      deleteCategoryButton.className = "tag-editor-category-btn";
      deleteCategoryButton.textContent = "🗑";
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
      categoryTags.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      categoryTags.forEach((tag) => {
        const chip = document.createElement("div");
        chip.className = `tag-chip ${computeTagStateForItems(tag.name, items)}`;
        const pendingAction = getPendingTagAction(tag.name);
        const label = document.createElement("span");
        label.className = "tag-chip-label";
        label.textContent = String(tag.name || "");
        chip.appendChild(label);
        const plusButton = document.createElement("button");
        plusButton.className = "chip-btn";
        plusButton.textContent = "➕";
        plusButton.title = "Add tag";
        plusButton.disabled = !Array.isArray(items) || items.length === 0;
        if (pendingAction === "add") plusButton.classList.add("is-selected");
        plusButton.onclick = () => {
          toggleTagSelection(tag.name, "add");
          renderTagEditor();
        };
        chip.appendChild(plusButton);
        const minusButton = document.createElement("button");
        minusButton.className = "chip-btn";
        minusButton.textContent = "➖";
        minusButton.title = "Remove tag";
        minusButton.disabled = !Array.isArray(items) || items.length === 0;
        if (pendingAction === "remove") minusButton.classList.add("is-selected");
        minusButton.onclick = () => {
          toggleTagSelection(tag.name, "remove");
          renderTagEditor();
        };
        chip.appendChild(minusButton);
        const editButton = document.createElement("button");
        editButton.className = "chip-btn";
        editButton.textContent = "✏️";
        editButton.title = "Edit tag";
        editButton.onclick = () => openTagEditModal(tag, categories);
        chip.appendChild(editButton);
        const deleteButton = document.createElement("button");
        deleteButton.className = "chip-btn";
        deleteButton.textContent = "🗑";
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

    tagEditorApplyBtn.textContent = hasPendingTagEditorMutations() ? "✅️*" : "✅️";
    tagEditorApplyBtn.disabled = !hasPendingTagEditorMutations();
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
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      state.tagEditorCategoryOrder = initial.map((category) => String(category.id || ""));
    }
    renderTagEditor();
  }

  async function applyTagEditorChangesAsync() {
    const pending = state.tagEditorPending || createTagEditorPending();
    const itemIds = getCurrentTagEditorItemIds();
    const display = buildTagEditorDisplayModel();
    const categories = display.categories || [];

    for (const category of categories) {
      if (isUncategorizedCategoryId(category.id)) continue;
      const upsertCategoryResponse = await apiPost("/api/tag-editor/upsert-category", {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder
      });
      if (!upsertCategoryResponse.ok) throw new Error(`Category update failed (${upsertCategoryResponse.status})`);
    }

    for (const categoryId of pending.deleteCategoryIds.values()) {
      const deleteCategoryResponse = await apiPost("/api/tag-editor/delete-category", {
        categoryId,
        newCategoryId: null
      });
      if (!deleteCategoryResponse.ok) throw new Error(`Category delete failed (${deleteCategoryResponse.status})`);
    }

    for (const upsertTag of pending.upsertTags.values()) {
      const upsertTagResponse = await apiPost("/api/tag-editor/upsert-tag", {
        name: upsertTag.name,
        categoryId: upsertTag.categoryId || ""
      });
      if (!upsertTagResponse.ok) throw new Error(`Tag create/update failed (${upsertTagResponse.status})`);
    }

    for (const renameTag of pending.renameTags.values()) {
      const renameTagResponse = await apiPost("/api/tag-editor/rename-tag", {
        oldName: renameTag.oldName,
        newName: renameTag.newName,
        newCategoryId: renameTag.newCategoryId
      });
      if (!renameTagResponse.ok) throw new Error(`Tag rename failed (${renameTagResponse.status})`);
    }

    for (const deleteTag of pending.deleteTags.values()) {
      const deleteTagResponse = await apiPost("/api/tag-editor/delete-tag", { name: deleteTag.name });
      if (!deleteTagResponse.ok) throw new Error(`Tag delete failed (${deleteTagResponse.status})`);
    }

    const addTags = [];
    const removeTags = [];
    for (const selection of state.tagEditorSelections.values()) {
      if (selection?.action === "add") addTags.push(selection.name);
      else if (selection?.action === "remove") removeTags.push(selection.name);
    }
    if (itemIds.length > 0 && (addTags.length > 0 || removeTags.length > 0)) {
      const applyResponse = await apiPost("/api/tag-editor/apply-item-tags", {
        itemIds,
        addTags,
        removeTags
      });
      if (!applyResponse.ok) throw new Error(`Tag apply failed (${applyResponse.status})`);
    }
  }

  function openTagEditor() {
    state.tagEditorOpen = true;
    state.tagEditorItemIds = getCurrentTagEditorItemIds();
    state.tagEditorCategoryOrder = [];
    state.tagEditorCollapsedCategories = loadTagEditorCollapsedCategories();
    resetTagEditorPending();
    pauseForTagEditor();
    tagEditor.style.display = "flex";
    refreshTagEditorModel().catch((error) => {
      setStatus(`Tag editor unavailable: ${error?.message || error}`);
    });
  }

  function closeTagEditor() {
    closeTagEditModal();
    state.tagEditorOpen = false;
    state.tagEditorItemIds = [];
    tagEditor.style.display = "none";
    resumeAfterTagEditor();
  }

  function connectEvents() {
    if (state.compatibilityBlocked) {
      return;
    }

    if (eventSource) {
      try {
        eventSource.close();
      } catch {
        // ignored
      }
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const streamUrl = new URL(sseUrl);
    streamUrl.searchParams.set("clientId", state.clientId);
    streamUrl.searchParams.set("sessionId", state.sessionId);
    eventSource = new EventSource(streamUrl.toString(), { withCredentials: true });
    eventSource.onopen = () => {
      setStatus("SSE connected");
    };
    eventSource.onerror = () => {
      setStatus("SSE reconnecting...");
      reconnectTimer = setTimeout(connectEvents, 1000);
    };
    eventSource.addEventListener("itemStateChanged", (event) => {
      const payload = parseEnvelopePayload(event.data);
      const itemPath = payload?.path || payload?.itemId;
      if (!itemPath) return;
      cacheItemState(itemPath, payload.isFavorite, payload.isBlacklisted);
      if (state.current && normalizePath(state.current.id) === normalizePath(itemPath)) {
        state.current.isFavorite = !!payload.isFavorite;
        state.current.isBlacklisted = !!payload.isBlacklisted;
        updateToggleButtons();
      }
      const fileName = basenameFromPath(itemPath);
      if (payload.isBlacklisted) {
        setStatus(`Synced: Blacklisted: ${fileName}`);
      } else if (payload.isFavorite) {
        setStatus(`Synced: Added to favorites: ${fileName}`);
      } else {
        setStatus(`Synced: Removed from favorites: ${fileName}`);
      }
    });
    eventSource.addEventListener("refreshStatusChanged", (event) => {
      const payload = parseEnvelopePayload(event.data);
      const snapshot = payload?.snapshot || payload?.Snapshot;
      if (!snapshot) return;
      if (snapshot.isRunning) {
        setStatus(`Core refresh: ${snapshot.currentStage || "running"}...`);
      } else if (snapshot.lastError) {
        setStatus(`Core refresh failed: ${snapshot.lastError}`);
      } else if (snapshot.completedUtc) {
        setStatus("Core refresh complete.");
      }
    });
    eventSource.addEventListener("resyncRequired", async () => {
      try {
        await fetchJson("/api/library-states", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: state.clientId, sessionId: state.sessionId, paths: [] })
        });
      } catch {
        // best effort
      }
    });
  }

  async function pairAndConnect() {
    if (state.compatibilityBlocked) {
      setStatus("Pairing blocked by server compatibility check.");
      return;
    }

    const token = String(pairToken.value || "").trim();
    if (!token) {
      setStatus("Pair token required.");
      return;
    }
    const response = await fetch(buildApiUrl("/api/pair"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (!response.ok) {
      setStatus("Pairing failed.");
      return;
    }
    pairSection.style.display = "none";
    setStatus("Paired.");
    const versionOk = await loadVersion();
    if (!versionOk) {
      return;
    }
    await loadPresets();
    connectEvents();
  }

  function reconnectFromLifecycle() {
    connectEvents();
  }

  const savedDuration = parseInt(localStorage.getItem(PHOTO_DURATION_KEY) || "", 10);
  if (!Number.isNaN(savedDuration) && savedDuration >= 1 && savedDuration <= 300) {
    state.photoDurationSeconds = savedDuration;
    photoDurationInput.value = String(savedDuration);
  }
  photoDurationInput.addEventListener("change", () => {
    const next = parseInt(photoDurationInput.value || "", 10);
    if (Number.isNaN(next) || next < 1 || next > 300) return;
    state.photoDurationSeconds = next;
    localStorage.setItem(PHOTO_DURATION_KEY, String(next));
    if (state.current && state.current.mediaType === "photo" && (state.autoplay || state.loop)) {
      playCurrent();
    }
  });

  const savedMode = localStorage.getItem(RANDOMIZATION_MODE_KEY);
  if (savedMode && randomizationModeSelect && Array.from(randomizationModeSelect.options).some((x) => x.value === savedMode)) {
    state.randomizationMode = savedMode;
    randomizationModeSelect.value = savedMode;
  }
  if (randomizationModeSelect) {
    randomizationModeSelect.addEventListener("change", () => {
      state.randomizationMode = randomizationModeSelect.value || "SmartShuffle";
      localStorage.setItem(RANDOMIZATION_MODE_KEY, state.randomizationMode);
    });
  }

  presetSelect.addEventListener("change", () => {
    state.currentPresetId = presetSelect.value;
  });
  playBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!state.current) {
      void getRandom();
      return;
    }
    if (video.style.display !== "none") {
      if (video.paused) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  });
  prevBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    goPrevious();
  });
  nextBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    goNext();
  });
  favoriteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleFavorite();
  });
  blacklistBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleBlacklist();
  });
  loopBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    state.loop = !state.loop;
    if (video.src) {
      video.loop = state.loop;
    }
    if (state.current && state.current.mediaType === "photo") {
      if (state.loop || state.autoplay) {
        playCurrent();
      } else {
        clearPhotoTimer();
      }
    }
    updateToggleButtons();
  });
  autoplayBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    state.autoplay = !state.autoplay;
    if (state.current && state.current.mediaType === "photo") {
      if (state.loop || state.autoplay) {
        playCurrent();
      } else {
        clearPhotoTimer();
      }
    }
    updateToggleButtons();
  });
  fullscreenBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!document.fullscreenElement) {
      void mediaContainer.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  });
  seekSlider.addEventListener("input", () => {
    if (!video.duration) return;
    video.currentTime = Number(seekSlider.value);
  });
  mediaContainer.addEventListener("click", (event) => {
    if (touchWasSwipe) {
      touchWasSwipe = false;
      return;
    }

    if (touchHandledTap) {
      touchHandledTap = false;
      return;
    }

    event.stopPropagation();
    if (!state.current && presetSelect.value) {
      void getRandom();
      return;
    }

    mediaContainer.classList.toggle("controls-visible");
  });
  if (overlayControls) {
    overlayControls.addEventListener("touchstart", (event) => event.stopPropagation());
    overlayControls.addEventListener("touchmove", (event) => event.stopPropagation());
    overlayControls.addEventListener("touchend", (event) => event.stopPropagation());
    overlayControls.addEventListener("click", (event) => event.stopPropagation());
  }

  mediaContainer.addEventListener("touchstart", (event) => {
    if (event.target && event.target.closest && event.target.closest("#overlay-controls")) {
      ignoreSwipeTouch = true;
      return;
    }

    ignoreSwipeTouch = false;
    if (event.touches && event.touches[0]) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchWasSwipe = false;
    }
  }, { passive: true });

  mediaContainer.addEventListener("touchend", (event) => {
    if (ignoreSwipeTouch) {
      ignoreSwipeTouch = false;
      return;
    }

    if (!event.changedTouches || !event.changedTouches[0]) {
      return;
    }

    const touchX = event.changedTouches[0].clientX;
    const touchY = event.changedTouches[0].clientY;
    const deltaX = touchX - touchStartX;
    const deltaY = touchY - touchStartY;
    if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
      touchWasSwipe = true;
      if (deltaX > 0) {
        goPrevious();
      } else {
        goNext();
      }
    } else if (Math.abs(deltaX) < TAP_THRESHOLD && Math.abs(deltaY) < TAP_THRESHOLD) {
      if (state.current) {
        touchHandledTap = true;
        mediaContainer.classList.toggle("controls-visible");
      }
    }
  }, { passive: true });

  mediaContainer.classList.add("controls-visible");
  pairBtn.addEventListener("click", () => {
    void pairAndConnect();
  });
  if (config.pairToken) {
    pairToken.value = config.pairToken;
  }

  tagEditBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openTagEditor();
  });
  tagEditorCloseBtn.addEventListener("click", () => {
    closeTagEditor();
  });
  tagEditorRefreshBtn.addEventListener("click", () => {
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
  tagEditorApplyBtn.addEventListener("click", async () => {
    try {
      await applyTagEditorChangesAsync();
      setStatus("Tag editor changes applied");
      closeTagEditor();
    } catch (error) {
      setStatus(error?.message || `Tag apply failed: ${error}`);
    }
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconnectFromLifecycle();
  });
  window.addEventListener("focus", reconnectFromLifecycle);
  window.addEventListener("pageshow", reconnectFromLifecycle);
  window.addEventListener("online", reconnectFromLifecycle);

  void loadPresets();
  void loadVersion();
  updateToggleButtons();
  connectEvents();
  setStatus("Ready");

  if (config.pairToken) {
    void pairAndConnect();
  } else {
    pairSection.style.display = "block";
  }
}
