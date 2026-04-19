import { buildRefreshStatusMessage, coerceRefreshSnapshot } from "./events/refreshStatusProjection";
import {
  AUDIO_FILTER,
  MEDIA_TYPE_FILTER,
  TAG_MATCH_MODE,
  cloneFilterState,
  createDefaultFilterState,
  filterStateFromApiObject,
  filterStatesEqualForPresetMatch,
  formatDurationForDisplay,
  parseDurationInputToSeconds,
  presetsToPostBody,
  serializeFilterStateForApi
} from "./filter/filterStateModel.ts";

const CLIENT_ID_KEY = "rr_clientId";
const SESSION_ID_KEY = "rr_sessionId";
const PHOTO_DURATION_KEY = "rr_photoDuration";
const RANDOMIZATION_MODE_KEY = "rr_randomizationMode";
const TAG_EDITOR_COLLAPSED_KEY = "rr_tagEditorCollapsed";
const AUTO_TAG_SCAN_FULL_KEY = "rr_autoTagScanFullLibrary";
const FILTER_DIALOG_COLLAPSED_KEY = "rr_filterDialogCollapsedCategories";
/** Session key for filter Tags tab "Uncategorized" orphan row collapse state. */
const FILTER_DIALOG_UNCATEGORIZED_COLLAPSE_KEY = "__filter_uncategorized__";
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

function isMobileBrowser() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobi/i.test(ua);
}

function getClientType() {
  return isMobileBrowser() ? "mobile-web" : "web";
}

function getDeviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const platform = typeof navigator === "undefined" ? "unknown-platform" : navigator.platform || "unknown-platform";
  const label = isMobileBrowser() ? "Mobile Browser" : "Web Browser";
  return `${label} (${platform}${ua ? `; ${ua.slice(0, 40)}` : ""})`;
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

export function startApp(config) {
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
    tagEditorCategoryOrderDirty: false,
    tagEditContext: null,
    tagEditorWasPlaying: false,
    tagEditorPhotoTimerRunning: false,
    tagEditorActiveTab: "edit",
    autoTagScanInFlight: false,
    autoTagRows: [],
    autoTagScanHasRun: false,
    compatibilityBlocked: false,
    playAttemptId: 0,
    videoMuted: false,
    appliedFilterState: createDefaultFilterState(),
    activePresetName: null,
    filterDialogOpen: false
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
  const fullscreenStage = getElement("fullscreen-stage");
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
  const muteBtn = getElement("mute-btn");
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
  const photoDurationInput = getElement("photo-duration");
  const emptyState = getElement("empty-state");
  const mobileDiagnosticsEl = getElement("mobile-diagnostics");
  const filterEditBtn = getElement("filter-edit-btn");
  const filterDialog = getElement("filter-dialog");
  const filterDialogHeading = getElement("filter-dialog-heading");
  const filterDialogRefreshBtn = getElement("filter-dialog-refresh-btn");
  const filterDialogCloseBtn = getElement("filter-dialog-close-btn");
  const filterPanelGeneral = getElement("filter-panel-general");
  const filterPanelTags = getElement("filter-panel-tags");
  const filterPanelPresets = getElement("filter-panel-presets");
  const filterClearAllBtn = getElement("filter-clear-all-btn");
  const filterCancelBtn = getElement("filter-cancel-btn");
  const filterApplyBtn = getElement("filter-apply-btn");

  if (
    !video || !photo || !statusEl || !presetSelect || !pairSection || !pairToken || !pairBtn ||
    !mediaContainer || !fullscreenStage || !seekRow || !seekSlider || !timeDisplay || !nowPlaying || !nowPlayingName ||
    !nowPlayingDuration || !favoriteBtn || !blacklistBtn || !prevBtn || !playBtn || !nextBtn ||
    !loopBtn || !autoplayBtn || !fullscreenBtn || !muteBtn || !filterEditBtn || !tagEditBtn || !tagEditor || !tagEditorBody ||
    !tagEditorCloseBtn || !tagEditorRefreshBtn || !tagEditorAddCategoryBtn || !tagEditorCategorySelect ||
    !tagEditorNewTag || !tagEditorAddTagBtn || !tagEditorApplyBtn || !tagEditorPanelEdit || !tagEditorPanelAutotag ||
    !tagAutotagScanFull || !tagAutotagViewAll || !tagAutotagSelectAll || !tagAutotagDeselectAll || !tagAutotagScanBtn ||
    !tagAutotagProgress || !tagAutotagStatus || !tagAutotagResults || !tagEditModal || !tagEditName ||
    !tagEditCategory || !tagEditCancelBtn || !tagEditSaveBtn || !photoDurationInput || !emptyState ||
    !filterDialog || !filterDialogHeading || !filterDialogRefreshBtn || !filterDialogCloseBtn ||
    !filterPanelGeneral || !filterPanelTags || !filterPanelPresets || !filterClearAllBtn ||
    !filterCancelBtn || !filterApplyBtn
  ) {
    throw new Error("Legacy WebUI bootstrap failed: missing required DOM elements.");
  }

  function isIosTouchWebKit() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  let pseudoFullscreen = false;

  function isStageFullscreenActive() {
    if (pseudoFullscreen) return true;
    return getFullscreenElement() === fullscreenStage;
  }

  function exitPseudoFullscreen() {
    if (!pseudoFullscreen) return;
    pseudoFullscreen = false;
    fullscreenStage.classList.remove("fullscreen-pseudo");
  }

  function enterPseudoFullscreen() {
    pseudoFullscreen = true;
    fullscreenStage.classList.add("fullscreen-pseudo");
  }

  function exitApiFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (getFullscreenElement()) {
      void exit?.call(document)?.catch?.(() => {});
    }
  }

  function enterStageFullscreen() {
    if (isIosTouchWebKit()) {
      enterPseudoFullscreen();
      return;
    }
    const req = fullscreenStage.requestFullscreen || fullscreenStage.webkitRequestFullscreen;
    if (!req) {
      enterPseudoFullscreen();
      return;
    }
    void req.call(fullscreenStage).catch(() => {
      enterPseudoFullscreen();
    });
  }

  function exitStageFullscreen() {
    if (pseudoFullscreen) {
      exitPseudoFullscreen();
      return;
    }
    if (getFullscreenElement() === fullscreenStage) {
      exitApiFullscreen();
    }
  }

  function toggleStageFullscreen() {
    if (isStageFullscreenActive()) {
      exitStageFullscreen();
    } else {
      enterStageFullscreen();
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!pseudoFullscreen) return;
    exitPseudoFullscreen();
  });

  pairSection.style.display = "none";

  let filterWorkingPresets = [];
  let filterWorking = createDefaultFilterState();
  let filterSources = [];
  let filterTagModel = null;
  let filterDialogOriginalJson = "";
  let filterPresetCatalogDirty = false;
  let filterActiveTab = "general";
  /** Preset name selected inside the filter dialog only (header combobox uses `state.activePresetName` after Apply). */
  let filterDialogActiveName = null;
  /** Category ids (and uncategorized sentinel) with collapsed tag grids in the filter dialog; persisted in sessionStorage. */
  let filterDialogCollapsedCategories = new Set();

  function loadFilterDialogCollapsedCategories() {
    try {
      const raw = sessionStorage.getItem(FILTER_DIALOG_COLLAPSED_KEY);
      if (!raw) {
        return new Set();
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(parsed.map((id) => String(id ?? "")));
    } catch {
      return new Set();
    }
  }

  function persistFilterDialogCollapsedCategories() {
    try {
      sessionStorage.setItem(
        FILTER_DIALOG_COLLAPSED_KEY,
        JSON.stringify(Array.from(filterDialogCollapsedCategories))
      );
    } catch {
      // best effort
    }
  }

  function toggleFilterCategoryCollapsed(categoryKey) {
    const key = String(categoryKey ?? "");
    if (filterDialogCollapsedCategories.has(key)) {
      filterDialogCollapsedCategories.delete(key);
    } else {
      filterDialogCollapsedCategories.add(key);
    }
    persistFilterDialogCollapsedCategories();
    renderFilterTagsPanel();
  }

  function tagEqualsCi(a, b) {
    return String(a || "").toLowerCase() === String(b || "").toLowerCase();
  }

  function containsTagCi(list, tag) {
    return list.some((t) => tagEqualsCi(t, tag));
  }

  function removeTagCi(list, tag) {
    const idx = list.findIndex((t) => tagEqualsCi(t, tag));
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }

  function mapApiPresetsToWorkingRows(presets) {
    const list = Array.isArray(presets) ? presets : [];
    return list.map((p) => ({
      name: String(p.name || p.id || "").trim() || String(p.id || ""),
      filterState: filterStateFromApiObject(p.filterState)
    })).filter((r) => r.name);
  }

  function updateFilterApplyButtonPending() {
    const now = JSON.stringify(serializeFilterStateForApi(filterWorking));
    const dirty = now !== filterDialogOriginalJson || filterPresetCatalogDirty;
    filterApplyBtn.classList.toggle("has-pending", dirty);
    filterApplyBtn.textContent = dirty ? "Apply*" : "Apply";
  }

  function setFilterDialogHeading() {
    if (!state.filterDialogOpen) {
      return;
    }
    if (filterDialogActiveName) {
      filterDialogHeading.textContent = `Filter Media — Active preset: ${filterDialogActiveName}`;
    } else {
      filterDialogHeading.textContent = "Filter Media";
    }
  }

  function switchFilterTab(tab) {
    filterActiveTab = tab;
    document.querySelectorAll(".filter-tab").forEach((btn) => {
      const t = btn.getAttribute("data-filter-tab");
      const on = t === tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    filterPanelGeneral.style.display = tab === "general" ? "block" : "none";
    filterPanelTags.style.display = tab === "tags" ? "block" : "none";
    filterPanelPresets.style.display = tab === "presets" ? "flex" : "none";
  }

  function readGeneralPanelIntoWorking() {
    const fav = document.getElementById("filter-fav-only");
    const excl = document.getElementById("filter-excl-bl");
    const nev = document.getElementById("filter-never-played");
    const okDur = document.getElementById("filter-known-dur");
    const okLou = document.getElementById("filter-known-loud");
    if (fav) {
      filterWorking.favoritesOnly = !!fav.checked;
    }
    if (excl) {
      filterWorking.excludeBlacklisted = !!excl.checked;
    }
    if (nev) {
      filterWorking.onlyNeverPlayed = !!nev.checked;
    }
    if (okDur) {
      filterWorking.onlyKnownDuration = !!okDur.checked;
    }
    if (okLou) {
      filterWorking.onlyKnownLoudness = !!okLou.checked;
    }

    const mt = document.querySelector("input[name=\"filter-media-type\"]:checked");
    if (mt) {
      filterWorking.mediaTypeFilter = Number.parseInt(mt.value, 10) || MEDIA_TYPE_FILTER.All;
    }
    const af = document.querySelector("input[name=\"filter-audio\"]:checked");
    if (af) {
      filterWorking.audioFilter = Number.parseInt(af.value, 10) || AUDIO_FILTER.PlayAll;
    }

    const noMin = document.getElementById("filter-no-min-dur");
    const noMax = document.getElementById("filter-no-max-dur");
    const minEl = document.getElementById("filter-min-dur-text");
    const maxEl = document.getElementById("filter-max-dur-text");
    if (noMin?.checked) {
      filterWorking.minDurationSeconds = null;
    } else if (minEl) {
      const p = parseDurationInputToSeconds(minEl.value || "");
      if (p === "invalid") {
        filterWorking.minDurationSeconds = null;
      } else {
        filterWorking.minDurationSeconds = p;
      }
    }
    if (noMax?.checked) {
      filterWorking.maxDurationSeconds = null;
    } else if (maxEl) {
      const p = parseDurationInputToSeconds(maxEl.value || "");
      if (p === "invalid") {
        filterWorking.maxDurationSeconds = null;
      } else {
        filterWorking.maxDurationSeconds = p;
      }
    }

    const selectedIds = [];
    filterSources.forEach((src, idx) => {
      const cb = document.getElementById(`filter-src-${idx}`);
      if (cb && cb.checked) {
        selectedIds.push(src.id);
      }
    });
    if (selectedIds.length === filterSources.length) {
      filterWorking.includedSourceIds = [];
    } else {
      filterWorking.includedSourceIds = selectedIds;
    }
  }

  function renderFilterGeneralPanel() {
    const s = filterWorking;
    const srcRows = filterSources
      .map((src, idx) => {
        const id = `filter-src-${idx}`;
        const included = s.includedSourceIds.length === 0 || containsTagCi(s.includedSourceIds, src.id);
        const dis = src.isEnabled === false ? " disabled" : "";
        const label = src.displayName || src.rootPath || src.id;
        return `<label><input type="checkbox" id="${id}" data-source-id="${escapeHtml(src.id)}"${included ? " checked" : ""}${dis}/> ${escapeHtml(label)}</label>`;
      })
      .join("");

    filterPanelGeneral.innerHTML = `
      <div class="filter-section">
        <h3>Basic Filters</h3>
        <div class="filter-stack">
          <label><input type="checkbox" id="filter-fav-only"${s.favoritesOnly ? " checked" : ""}/> Favorites only</label>
          <label><input type="checkbox" id="filter-excl-bl"${s.excludeBlacklisted ? " checked" : ""}/> Exclude blacklisted</label>
          <label><input type="checkbox" id="filter-never-played"${s.onlyNeverPlayed ? " checked" : ""}/> Only never played</label>
          <label><input type="checkbox" id="filter-known-dur"${s.onlyKnownDuration ? " checked" : ""}/> Only videos with known duration</label>
          <label><input type="checkbox" id="filter-known-loud"${s.onlyKnownLoudness ? " checked" : ""}/> Only videos with known loudness</label>
        </div>
      </div>
      <div class="filter-section">
        <h3>Media Type</h3>
        <div class="filter-stack">
          <label><input type="radio" name="filter-media-type" value="${MEDIA_TYPE_FILTER.All}"${s.mediaTypeFilter === MEDIA_TYPE_FILTER.All ? " checked" : ""}/> All (Videos and Photos)</label>
          <label><input type="radio" name="filter-media-type" value="${MEDIA_TYPE_FILTER.VideosOnly}"${s.mediaTypeFilter === MEDIA_TYPE_FILTER.VideosOnly ? " checked" : ""}/> Videos only</label>
          <label><input type="radio" name="filter-media-type" value="${MEDIA_TYPE_FILTER.PhotosOnly}"${s.mediaTypeFilter === MEDIA_TYPE_FILTER.PhotosOnly ? " checked" : ""}/> Photos only</label>
        </div>
      </div>
      <div class="filter-section">
        <h3>Sources (Client Filter)</h3>
        <p class="filter-hint">Checked sources are included. If all are checked, no source restriction is stored.</p>
        <div class="filter-stack">${srcRows || "<span class=\"filter-hint\">No sources returned from server.</span>"}</div>
      </div>
      <div class="filter-section">
        <h3>Audio Filter</h3>
        <div class="filter-stack">
          <label><input type="radio" name="filter-audio" value="${AUDIO_FILTER.PlayAll}"${s.audioFilter === AUDIO_FILTER.PlayAll ? " checked" : ""}/> All videos</label>
          <label><input type="radio" name="filter-audio" value="${AUDIO_FILTER.WithAudioOnly}"${s.audioFilter === AUDIO_FILTER.WithAudioOnly ? " checked" : ""}/> Only videos with audio</label>
          <label><input type="radio" name="filter-audio" value="${AUDIO_FILTER.WithoutAudioOnly}"${s.audioFilter === AUDIO_FILTER.WithoutAudioOnly ? " checked" : ""}/> Only videos without audio</label>
        </div>
      </div>
      <div class="filter-section">
        <h3>Duration Filter</h3>
        <div class="filter-stack">
          <div class="filter-row">
            <span style="min-width:3rem">Min</span>
            <input type="text" id="filter-min-dur-text" placeholder="HH:MM:SS or MM:SS" value="${s.minDurationSeconds != null ? escapeHtml(formatDurationForDisplay(s.minDurationSeconds)) : ""}"/>
            <label><input type="checkbox" id="filter-no-min-dur"${s.minDurationSeconds == null ? " checked" : ""}/> No minimum</label>
          </div>
          <div class="filter-row">
            <span style="min-width:3rem">Max</span>
            <input type="text" id="filter-max-dur-text" placeholder="HH:MM:SS or MM:SS" value="${s.maxDurationSeconds != null ? escapeHtml(formatDurationForDisplay(s.maxDurationSeconds)) : ""}"/>
            <label><input type="checkbox" id="filter-no-max-dur"${s.maxDurationSeconds == null ? " checked" : ""}/> No maximum</label>
          </div>
        </div>
      </div>`;

    filterPanelGeneral.querySelectorAll("input,select").forEach((el) => {
      el.addEventListener("change", () => {
        readGeneralPanelIntoWorking();
        updateFilterApplyButtonPending();
      });
    });
    const noMin = filterPanelGeneral.querySelector("#filter-no-min-dur");
    const noMax = filterPanelGeneral.querySelector("#filter-no-max-dur");
    const minT = filterPanelGeneral.querySelector("#filter-min-dur-text");
    const maxT = filterPanelGeneral.querySelector("#filter-max-dur-text");
    if (noMin && minT) {
      noMin.addEventListener("change", () => {
        if (noMin.checked) {
          minT.value = "";
          minT.disabled = true;
        } else {
          minT.disabled = false;
        }
      });
      minT.disabled = !!noMin.checked;
    }
    if (noMax && maxT) {
      noMax.addEventListener("change", () => {
        if (noMax.checked) {
          maxT.value = "";
          maxT.disabled = true;
        } else {
          maxT.disabled = false;
        }
      });
      maxT.disabled = !!noMax.checked;
    }
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderFilterTagsPanel() {
    const categories = (filterTagModel?.categories || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const tags = filterTagModel?.tags || [];
    const globalAnd = filterWorking.globalMatchMode !== false;

    const catBlocks = [];
    const processed = new Set();

    for (const cat of categories) {
      const catTags = tags.filter((t) => t.categoryId === cat.id).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (catTags.length === 0) {
        continue;
      }
      for (const t of catTags) {
        processed.add(String(t.name).toLowerCase());
      }
      const localMode = filterWorking.categoryLocalMatchModes?.[cat.id] ?? TAG_MATCH_MODE.And;
      const catKey = String(cat.id ?? "");
      const collapsed = filterDialogCollapsedCategories.has(catKey);
      const expandIcon = collapsed ? "keyboard_arrow_right" : "keyboard_arrow_down";
      let chips = "";
      for (const t of catTags) {
        const inc = containsTagCi(filterWorking.selectedTags, t.name);
        const exc = containsTagCi(filterWorking.excludedTags, t.name);
        let cls = "tag-chip";
        if (inc) {
          cls += " state-all";
        } else if (exc) {
          cls += " state-none";
        }
        chips += `<div class="${cls}" data-filter-cat="${escapeHtml(cat.id)}">
          <span class="tag-chip-label">${escapeHtml(t.name)}</span>
          <button type="button" class="chip-btn icon-glyph-base icon-glyph-toggle${inc ? " is-selected" : ""}" data-filter-chip="inc" data-tag="${escapeHtml(t.name)}" title="Include"><span class="material-symbol-icon">add</span></button>
          <button type="button" class="chip-btn icon-glyph-base icon-glyph-toggle${exc ? " is-selected" : ""}" data-filter-chip="exc" data-tag="${escapeHtml(t.name)}" title="Exclude"><span class="material-symbol-icon">remove</span></button>
        </div>`;
      }
      catBlocks.push(`<div class="tag-editor-category" data-filter-category="${escapeHtml(cat.id)}">
        <div class="tag-editor-category-header">
          <div class="tag-editor-category-left">
            <button type="button" class="tag-editor-category-toggle icon-glyph-base icon-glyph-button" data-filter-category-toggle="${escapeHtml(catKey)}" title="${collapsed ? "Expand category" : "Collapse category"}"><span class="material-symbol-icon">${expandIcon}</span></button>
            <span class="tag-editor-category-title">${escapeHtml(cat.name)}</span>
          </div>
          <div class="tag-editor-category-controls">
            <label class="filter-hint" style="margin:0">Local:
              <select class="filter-local-mode" data-cat-id="${escapeHtml(cat.id)}">
                <option value="${TAG_MATCH_MODE.And}"${localMode === TAG_MATCH_MODE.And ? " selected" : ""}>ALL (AND)</option>
                <option value="${TAG_MATCH_MODE.Or}"${localMode === TAG_MATCH_MODE.Or ? " selected" : ""}>ANY (OR)</option>
              </select>
            </label>
          </div>
        </div>
        <div class="tag-editor-tag-grid"${collapsed ? " style=\"display:none\"" : ""}>${chips}</div>
      </div>`);
    }

    const allFilterTags = [...filterWorking.selectedTags, ...filterWorking.excludedTags];
    const orphans = allFilterTags.filter((n) => !processed.has(String(n).toLowerCase()));
    if (orphans.length > 0) {
      const localMode = filterWorking.categoryLocalMatchModes?.[""] ?? TAG_MATCH_MODE.And;
      const uncCollapsed = filterDialogCollapsedCategories.has(FILTER_DIALOG_UNCATEGORIZED_COLLAPSE_KEY);
      const uncIcon = uncCollapsed ? "keyboard_arrow_right" : "keyboard_arrow_down";
      let chips = "";
      for (const name of [...new Set(orphans)].sort((a, b) => String(a).localeCompare(String(b)))) {
        const inc = containsTagCi(filterWorking.selectedTags, name);
        const exc = containsTagCi(filterWorking.excludedTags, name);
        let cls = "tag-chip";
        if (inc) {
          cls += " state-all";
        } else if (exc) {
          cls += " state-none";
        }
        chips += `<div class="${cls}">
          <span class="tag-chip-label">${escapeHtml(name)}</span>
          <button type="button" class="chip-btn icon-glyph-base icon-glyph-toggle${inc ? " is-selected" : ""}" data-filter-chip="inc" data-tag="${escapeHtml(name)}" title="Include"><span class="material-symbol-icon">add</span></button>
          <button type="button" class="chip-btn icon-glyph-base icon-glyph-toggle${exc ? " is-selected" : ""}" data-filter-chip="exc" data-tag="${escapeHtml(name)}" title="Exclude"><span class="material-symbol-icon">remove</span></button>
        </div>`;
      }
      catBlocks.push(`<div class="tag-editor-category">
        <div class="tag-editor-category-header">
          <div class="tag-editor-category-left">
            <button type="button" class="tag-editor-category-toggle icon-glyph-base icon-glyph-button" data-filter-category-toggle="${FILTER_DIALOG_UNCATEGORIZED_COLLAPSE_KEY}" title="${uncCollapsed ? "Expand category" : "Collapse category"}"><span class="material-symbol-icon">${uncIcon}</span></button>
            <span class="tag-editor-category-title">Uncategorized</span>
          </div>
          <div class="tag-editor-category-controls">
            <label class="filter-hint" style="margin:0">Local:
              <select class="filter-local-mode" data-cat-id="">
                <option value="${TAG_MATCH_MODE.And}"${localMode === TAG_MATCH_MODE.And ? " selected" : ""}>ALL (AND)</option>
                <option value="${TAG_MATCH_MODE.Or}"${localMode === TAG_MATCH_MODE.Or ? " selected" : ""}>ANY (OR)</option>
              </select>
            </label>
          </div>
        </div>
        <div class="tag-editor-tag-grid"${uncCollapsed ? " style=\"display:none\"" : ""}>${chips}</div>
      </div>`);
    }

    const legacyFlat = categories.length === 0 && tags.length > 0;
    if (legacyFlat) {
      const sorted = tags.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      let chips = "";
      for (const t of sorted) {
        const inc = containsTagCi(filterWorking.selectedTags, t.name);
        const exc = containsTagCi(filterWorking.excludedTags, t.name);
        let cls = "tag-chip";
        if (inc) {
          cls += " state-all";
        } else if (exc) {
          cls += " state-none";
        }
        chips += `<div class="${cls}">
          <span class="tag-chip-label">${escapeHtml(t.name)}</span>
          <button type="button" class="chip-btn icon-glyph-base icon-glyph-toggle${inc ? " is-selected" : ""}" data-filter-chip="inc" data-tag="${escapeHtml(t.name)}" title="Include"><span class="material-symbol-icon">add</span></button>
          <button type="button" class="chip-btn icon-glyph-base icon-glyph-toggle${exc ? " is-selected" : ""}" data-filter-chip="exc" data-tag="${escapeHtml(t.name)}" title="Exclude"><span class="material-symbol-icon">remove</span></button>
        </div>`;
      }
      catBlocks.length = 0;
      catBlocks.push(`<div class="tag-editor-tag-grid">${chips}</div>`);
    }

    if (catBlocks.length === 0) {
      filterPanelTags.innerHTML = "<p class=\"filter-hint\">No tags available. Use Edit tags to create tags.</p>";
      return;
    }

    filterPanelTags.innerHTML = `
      <div class="filter-section">
        <h3>Category Combination</h3>
        <p class="filter-hint">AND = all categories must match. OR = any category can match.</p>
        <label>Combine categories using:
          <select id="filter-global-match">
            <option value="and"${globalAnd ? " selected" : ""}>AND</option>
            <option value="or"${!globalAnd ? " selected" : ""}>OR</option>
          </select>
        </label>
      </div>
      <div class="filter-section">
        <h3>Tags Filter</h3>
        ${catBlocks.join("")}
      </div>`;

    const gm = filterPanelTags.querySelector("#filter-global-match");
    if (gm) {
      gm.addEventListener("change", () => {
        filterWorking.globalMatchMode = gm.value === "and";
        filterWorking.tagMatchMode = filterWorking.globalMatchMode ? TAG_MATCH_MODE.And : TAG_MATCH_MODE.Or;
        updateFilterApplyButtonPending();
      });
    }
    filterPanelTags.querySelectorAll(".filter-local-mode").forEach((sel) => {
      sel.addEventListener("change", () => {
        const cid = sel.getAttribute("data-cat-id") ?? "";
        if (!filterWorking.categoryLocalMatchModes) {
          filterWorking.categoryLocalMatchModes = {};
        }
        filterWorking.categoryLocalMatchModes[cid] = Number.parseInt(sel.value, 10) || TAG_MATCH_MODE.And;
        updateFilterApplyButtonPending();
      });
    });
  }

  function onFilterTagPanelClick(event) {
    const toggleBtn = event.target.closest("[data-filter-category-toggle]");
    if (toggleBtn && filterPanelTags.contains(toggleBtn)) {
      event.preventDefault();
      const key = toggleBtn.getAttribute("data-filter-category-toggle") ?? "";
      toggleFilterCategoryCollapsed(key);
      return;
    }
    onFilterTagChipClick(event);
  }

  function onFilterTagChipClick(event) {
    const btn = event.target.closest("[data-filter-chip]");
    if (!btn || !filterPanelTags.contains(btn)) {
      return;
    }
    event.preventDefault();
    const mode = btn.getAttribute("data-filter-chip");
    const tag = btn.getAttribute("data-tag");
    if (!tag) {
      return;
    }
    if (mode === "inc") {
      if (containsTagCi(filterWorking.selectedTags, tag)) {
        removeTagCi(filterWorking.selectedTags, tag);
      } else {
        removeTagCi(filterWorking.excludedTags, tag);
        filterWorking.selectedTags.push(tag);
      }
    } else if (mode === "exc") {
      if (containsTagCi(filterWorking.excludedTags, tag)) {
        removeTagCi(filterWorking.excludedTags, tag);
      } else {
        removeTagCi(filterWorking.selectedTags, tag);
        filterWorking.excludedTags.push(tag);
      }
    }
    renderFilterTagsPanel();
    updateFilterApplyButtonPending();
  }

  function renderFilterPresetsPanel() {
    const names = filterWorkingPresets.map((p) => p.name);
    const opts = [`<option value="">None</option>`]
      .concat(names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`))
      .join("");
    const rows = filterWorkingPresets
      .map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === filterWorkingPresets.length - 1;
        return `<div class="filter-preset-row" data-preset-idx="${i}">
        <span class="filter-preset-name">${escapeHtml(p.name)}</span>
        <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-up="${i}" aria-label="Move up" title="Move up"${isFirst ? " disabled" : ""}><span class="material-symbol-icon">keyboard_arrow_up</span></button>
        <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-down="${i}" aria-label="Move down" title="Move down"${isLast ? " disabled" : ""}><span class="material-symbol-icon">keyboard_arrow_down</span></button>
        <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-rename="${i}" aria-label="Rename" title="Rename"><span class="material-symbol-icon">edit_note</span></button>
        <button type="button" class="icon-glyph-base icon-glyph-button" data-preset-del="${i}" aria-label="Delete" title="Delete"><span class="material-symbol-icon">delete</span></button>
      </div>`;
      })
      .join("");

    filterPanelPresets.innerHTML = `
      <div class="filter-section">
        <h3>Choose Preset</h3>
        <div class="filter-row">
          <select id="filter-dialog-preset-select">${opts}</select>
          <button type="button" id="filter-update-preset-btn">Update Preset</button>
        </div>
      </div>
      <div class="filter-section">
        <h3>Create New Preset From Current Filter</h3>
        <div class="filter-row">
          <input type="text" id="filter-new-preset-name" placeholder="Enter preset name"/>
          <button type="button" id="filter-add-preset-btn">Add Preset</button>
        </div>
      </div>
      <div class="filter-section filter-section-manage">
        <h3>Manage Presets</h3>
        <div class="filter-preset-list">${rows || "<span class=\"filter-hint\">No presets</span>"}</div>
      </div>`;

    const sel = filterPanelPresets.querySelector("#filter-dialog-preset-select");
    if (sel) {
      sel.value = filterDialogActiveName && names.includes(filterDialogActiveName) ? filterDialogActiveName : "";
      sel.addEventListener("change", () => {
        const v = sel.value;
        if (!v) {
          filterDialogActiveName = null;
          setFilterDialogHeading();
          updateFilterApplyButtonPending();
          return;
        }
        const preset = filterWorkingPresets.find((p) => p.name === v);
        if (preset) {
          filterWorking = cloneFilterState(preset.filterState);
          filterDialogActiveName = v;
          renderFilterGeneralPanel();
          renderFilterTagsPanel();
          setFilterDialogHeading();
          updateFilterApplyButtonPending();
        }
      });
    }

    filterPanelPresets.querySelector("#filter-update-preset-btn")?.addEventListener("click", () => {
      if (!filterDialogActiveName) {
        setStatus("Select a preset to update.");
        return;
      }
      const idx = filterWorkingPresets.findIndex((p) => tagEqualsCi(p.name, filterDialogActiveName));
      if (idx < 0) {
        setStatus("Preset not found.");
        return;
      }
      readGeneralPanelIntoWorking();
      filterWorkingPresets[idx].filterState = cloneFilterState(filterWorking);
      filterPresetCatalogDirty = true;
      setStatus(`Updated preset "${filterDialogActiveName}" locally — Apply to save.`);
      updateFilterApplyButtonPending();
    });

    filterPanelPresets.querySelector("#filter-add-preset-btn")?.addEventListener("click", () => {
      const name = String(filterPanelPresets.querySelector("#filter-new-preset-name")?.value || "").trim();
      if (!name) {
        setStatus("Enter a preset name.");
        return;
      }
      if (filterWorkingPresets.some((p) => tagEqualsCi(p.name, name))) {
        setStatus("A preset with that name already exists.");
        return;
      }
      readGeneralPanelIntoWorking();
      filterWorkingPresets.push({ name, filterState: cloneFilterState(filterWorking) });
      filterPresetCatalogDirty = true;
      filterPanelPresets.querySelector("#filter-new-preset-name").value = "";
      renderFilterPresetsPanel();
      switchFilterTab("presets");
      updateFilterApplyButtonPending();
    });

    filterPanelPresets.querySelector(".filter-preset-list")?.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest("[data-preset-up], [data-preset-down], [data-preset-del], [data-preset-rename]");
      if (!button || !filterPanelPresets.contains(button)) {
        return;
      }
      const up = button.getAttribute("data-preset-up");
      const down = button.getAttribute("data-preset-down");
      const del = button.getAttribute("data-preset-del");
      const ren = button.getAttribute("data-preset-rename");
      if (up != null) {
        const i = Number.parseInt(up, 10);
        if (i > 0) {
          const tmp = filterWorkingPresets[i - 1];
          filterWorkingPresets[i - 1] = filterWorkingPresets[i];
          filterWorkingPresets[i] = tmp;
          filterPresetCatalogDirty = true;
          renderFilterPresetsPanel();
        }
      } else if (down != null) {
        const i = Number.parseInt(down, 10);
        if (i < filterWorkingPresets.length - 1) {
          const tmp = filterWorkingPresets[i + 1];
          filterWorkingPresets[i + 1] = filterWorkingPresets[i];
          filterWorkingPresets[i] = tmp;
          filterPresetCatalogDirty = true;
          renderFilterPresetsPanel();
        }
      } else if (del != null) {
        const i = Number.parseInt(del, 10);
        const removed = filterWorkingPresets[i];
        if (!removed) {
          return;
        }
        if (!window.confirm(`Delete preset "${removed.name}"?`)) {
          return;
        }
        filterWorkingPresets.splice(i, 1);
        if (filterDialogActiveName && tagEqualsCi(filterDialogActiveName, removed.name)) {
          filterDialogActiveName = null;
        }
        filterPresetCatalogDirty = true;
        renderFilterPresetsPanel();
        renderFilterGeneralPanel();
        renderFilterTagsPanel();
        setFilterDialogHeading();
      } else if (ren != null) {
        const i = Number.parseInt(ren, 10);
        const row = filterWorkingPresets[i];
        if (!row) {
          return;
        }
        const nn = prompt("Rename preset", row.name);
        if (!nn || !nn.trim()) {
          return;
        }
        const nt = nn.trim();
        if (filterWorkingPresets.some((p, pidx) => pidx !== i && tagEqualsCi(p.name, nt))) {
          setStatus("That name is already in use.");
          return;
        }
        const old = row.name;
        row.name = nt;
        if (filterDialogActiveName && tagEqualsCi(filterDialogActiveName, old)) {
          filterDialogActiveName = nt;
        }
        filterPresetCatalogDirty = true;
        renderFilterPresetsPanel();
        setFilterDialogHeading();
      }
      updateFilterApplyButtonPending();
    });
  }

  function renderAllFilterPanels() {
    renderFilterGeneralPanel();
    renderFilterTagsPanel();
    renderFilterPresetsPanel();
    updateFilterApplyButtonPending();
  }

  function validateFilterDurationsForApply() {
    readGeneralPanelIntoWorking();
    const noMin = document.getElementById("filter-no-min-dur");
    const noMax = document.getElementById("filter-no-max-dur");
    const minEl = document.getElementById("filter-min-dur-text");
    const maxEl = document.getElementById("filter-max-dur-text");
    if (noMin && !noMin.checked && minEl) {
      const p = parseDurationInputToSeconds(minEl.value || "");
      if (p === "invalid") {
        return "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.";
      }
    }
    if (noMax && !noMax.checked && maxEl) {
      const p = parseDurationInputToSeconds(maxEl.value || "");
      if (p === "invalid") {
        return "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.";
      }
    }
    return null;
  }

  async function refreshFilterDialogRemoteData() {
    const sources = await fetchJson("/api/sources");
    const modelResp = await apiPost("/api/tag-editor/model", { itemIds: [] });
    if (!modelResp.ok) {
      throw new Error(`tag-editor model ${modelResp.status}`);
    }
    const model = await modelResp.json();
    filterSources = Array.isArray(sources) ? sources : [];
    filterTagModel = model;
    await loadPresets();
    filterWorkingPresets = mapApiPresetsToWorkingRows(state.presets);
  }

  async function openFilterDialog() {
    if (state.compatibilityBlocked) {
      return;
    }
    try {
      await refreshFilterDialogRemoteData();
    } catch (error) {
      setStatus(`Filter dialog load failed: ${error?.message || error}`);
      return;
    }
    filterWorking = cloneFilterState(state.appliedFilterState);
    filterDialogActiveName = state.activePresetName;
    filterDialogOriginalJson = JSON.stringify(serializeFilterStateForApi(filterWorking));
    filterPresetCatalogDirty = false;
    filterDialogCollapsedCategories = loadFilterDialogCollapsedCategories();
    setFilterDialogHeading();
    switchFilterTab("general");
    renderAllFilterPanels();
    filterDialog.style.display = "flex";
    state.filterDialogOpen = true;
    filterPanelTags.addEventListener("click", onFilterTagPanelClick);
  }

  function closeFilterDialog() {
    filterPanelTags.removeEventListener("click", onFilterTagPanelClick);
    filterDialog.style.display = "none";
    state.filterDialogOpen = false;
  }

  async function applyFilterDialog() {
    const err = validateFilterDurationsForApply();
    if (err) {
      setStatus(err);
      switchFilterTab("general");
      return;
    }
    readGeneralPanelIntoWorking();
    if (filterPresetCatalogDirty) {
      try {
        const resp = await apiPost("/api/presets", presetsToPostBody(filterWorkingPresets));
        if (!resp.ok) {
          setStatus(`Saving presets failed (${resp.status}).`);
          return;
        }
        filterPresetCatalogDirty = false;
        const presets = await fetchJson("/api/presets");
        state.presets = Array.isArray(presets) ? presets : [];
        filterWorkingPresets = mapApiPresetsToWorkingRows(state.presets);
      } catch (e) {
        setStatus(`Saving presets failed: ${e?.message || e}`);
        return;
      }
    }

    readGeneralPanelIntoWorking();
    const matched = filterWorkingPresets.find((p) => filterStatesEqualForPresetMatch(p.filterState, filterWorking));
    if (matched) {
      state.activePresetName = matched.name;
    } else {
      state.activePresetName = null;
    }
    state.appliedFilterState = cloneFilterState(filterWorking);
    filterDialogOriginalJson = JSON.stringify(serializeFilterStateForApi(filterWorking));
    await loadPresets();
    closeFilterDialog();
    setStatus("Filters applied.");
  }

  function clearAllFiltersInDialog() {
    filterWorking = createDefaultFilterState();
    filterDialogActiveName = null;
    filterWorkingPresets = mapApiPresetsToWorkingRows(state.presets);
    filterPresetCatalogDirty = false;
    filterDialogOriginalJson = JSON.stringify(serializeFilterStateForApi(filterWorking));
    renderAllFilterPanels();
    setFilterDialogHeading();
    const sel = filterPanelPresets.querySelector("#filter-dialog-preset-select");
    if (sel) {
      sel.value = "";
    }
    updateFilterApplyButtonPending();
  }

  let photoTimerId = null;
  let eventSource = null;
  let reconnectTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchWasSwipe = false;
  let touchHandledTap = false;
  let ignoreSwipeTouch = false;
  let lastLoggedStatusMessage = "";
  let lastLoggedStatusAtMs = 0;
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
    const now = Date.now();
    const normalizedMessage = String(message || "");
    const shouldLog = normalizedMessage !== lastLoggedStatusMessage || now - lastLoggedStatusAtMs > 1000;
    if (shouldLog) {
      lastLoggedStatusMessage = normalizedMessage;
      lastLoggedStatusAtMs = now;
      relayClientLog("info", `status=${normalizedMessage} currentId=${state.current?.id || "none"} attempt=${state.playAttemptId}`);
    }
  }

  async function relayClientLog(level, message) {
    try {
      await fetch(buildApiUrl("/api/logs/client"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "webui",
          level: level || "info",
          message: String(message || "")
        })
      });
    } catch {
      // Client logging is best-effort and must never break UX flow.
    }
  }

  function tracePlayback(level, message, context = {}) {
    const parts = [
      `playback=${message}`,
      `attempt=${state.playAttemptId}`,
      `currentId=${state.current?.id || "none"}`
    ];
    for (const [key, value] of Object.entries(context)) {
      parts.push(`${key}=${value == null ? "null" : String(value)}`);
    }

    relayClientLog(level, parts.join(" "));
  }

  function renderMobileDiagnostics() {
    if (!mobileDiagnosticsEl || !isMobileBrowser()) {
      return;
    }

    mobileDiagnosticsEl.style.display = "block";
    mobileDiagnosticsEl.textContent =
      `Diagnostics: clientId=${state.clientId.slice(0, 10)}..., sessionId=${state.sessionId.slice(0, 10)}..., type=${getClientType()}`;
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
      pairSection.style.display = "flex";
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
    updatePlayButtonGlyph();
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

  function updatePlayButtonGlyph() {
    const shouldShowPause =
      !!state.current &&
      video.style.display !== "none" &&
      !video.paused;
    setButtonSymbol(playBtn, shouldShowPause ? "pause" : "play_arrow");
  }

  function updateMuteUi() {
    const videoActive = video.style.display !== "none" && !!video.src;
    if (videoActive) {
      video.muted = state.videoMuted;
      muteBtn.disabled = false;
      muteBtn.classList.toggle("active", state.videoMuted);
      setButtonSymbol(muteBtn, state.videoMuted ? "volume_off" : "volume_up");
    } else {
      muteBtn.disabled = true;
      muteBtn.classList.remove("active");
      setButtonSymbol(muteBtn, "volume_up");
    }
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
    video.onplay = () => updatePlayButtonGlyph();
    video.onpause = () => updatePlayButtonGlyph();
  }

  async function playCurrent() {
    const item = state.current;
    if (!item) return;
    state.playAttemptId += 1;
    const expectedPlayAttemptId = state.playAttemptId;
    tracePlayback("info", "start", { expectedItemId: item.id, mediaType: item.mediaType });

    applyCachedState(item);
    clearPhotoTimer();
    video.onplaying = null;
    video.onerror = null;
    video.onloadedmetadata = null;
    video.ontimeupdate = null;
    video.onended = null;
    photo.onload = null;
    photo.onerror = null;
    video.pause();
    video.src = "";
    photo.src = "";
    video.style.display = "none";
    photo.style.display = "none";
    seekRow.style.display = "none";
    emptyState.style.display = "none";
    nowPlaying.style.display = "block";
    const fullName = basenameFromPath(item.displayName || item.id || "");
    nowPlayingName.textContent = truncateName(fullName, 45);
    nowPlayingName.title = fullName;
    nowPlayingDuration.textContent = item.durationSeconds != null ? fmtTime(item.durationSeconds) : "";
    const expectedItemId = item.id;

    if (item.mediaType === "photo") {
      const mediaUrl = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);
      if (!state.current || state.current.id !== expectedItemId || state.playAttemptId !== expectedPlayAttemptId) {
        tracePlayback("info", "photo-preload-stale", { expectedItemId, expectedPlayAttemptId });
        return;
      }

      photo.onload = () => {
        if (!state.current || state.current.id !== expectedItemId || state.playAttemptId !== expectedPlayAttemptId) {
          tracePlayback("info", "photo-onload-stale", { expectedItemId, expectedPlayAttemptId });
          return;
        }
        tracePlayback("info", "photo-onload", { mediaUrl });
        setStatus("Playing");
      };
      photo.onerror = () => {
        if (!state.current || state.current.id !== expectedItemId || state.playAttemptId !== expectedPlayAttemptId) {
          tracePlayback("info", "photo-onerror-stale", { expectedItemId, expectedPlayAttemptId });
          return;
        }
        tracePlayback("warn", "photo-onerror", { mediaUrl });
        setStatus("Photo file not found.");
      };
      photo.src = mediaUrl;
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
      const mediaUrl = absolutizeMediaUrl(apiBaseUrl, item.mediaUrl);
      if (!state.current || state.current.id !== expectedItemId || state.playAttemptId !== expectedPlayAttemptId) {
        tracePlayback("info", "video-preload-stale", { expectedItemId, expectedPlayAttemptId });
        return;
      }

      video.src = mediaUrl;
      video.style.display = "block";
      seekRow.style.display = "flex";
      setupVideoEvents();
      video.onplaying = () => {
        if (!state.current || state.current.id !== expectedItemId || state.playAttemptId !== expectedPlayAttemptId) {
          tracePlayback("info", "video-onplaying-stale", { expectedItemId, expectedPlayAttemptId });
          return;
        }
        tracePlayback("info", "video-onplaying", { mediaUrl });
        setStatus("Playing");
      };
      video.onerror = () => {
        if (!state.current || state.current.id !== expectedItemId || state.playAttemptId !== expectedPlayAttemptId) {
          tracePlayback("info", "video-onerror-stale", { expectedItemId, expectedPlayAttemptId });
          return;
        }
        tracePlayback("warn", "video-onerror", { mediaUrl });
        setStatus("Video file not found.");
      };
      video.muted = state.videoMuted;
      void video.play().catch(() => {});
    }

    updateToggleButtons();
    updatePlayButtonGlyph();
    updateMuteUi();
  }

  async function loadPresets() {
    if (state.compatibilityBlocked) {
      presetSelect.innerHTML = "<option value=\"\">Server compatibility check failed</option>";
      return;
    }

    try {
      const presets = await fetchJson("/api/presets");
      state.presets = Array.isArray(presets) ? presets : [];
      presetSelect.innerHTML = "<option value=\"\">None</option>";
      for (const preset of state.presets) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.name || preset.id;
        presetSelect.appendChild(option);
      }
      if (state.activePresetName) {
        const match = state.presets.find(
          (p) => tagEqualsCi(p.id, state.activePresetName) || tagEqualsCi(p.name, state.activePresetName)
        );
        if (match) {
          presetSelect.value = match.id;
        } else {
          presetSelect.value = "";
          state.activePresetName = null;
        }
      } else {
        presetSelect.value = "";
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
      pairSection.style.display = "none";
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

    const presetId = String(presetSelect.value || "").trim();
    const filterState = serializeFilterStateForApi(state.appliedFilterState);
    const body = {
      clientId: state.clientId,
      sessionId: state.sessionId,
      includeVideos: true,
      includePhotos: true,
      randomizationMode: state.randomizationMode,
      filterState
    };
    if (presetId) {
      body.presetId = presetId;
    }

    setStatus("Loading...");
    try {
      const response = await fetch(buildApiUrl("/api/random"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.status === 401) {
        pairSection.style.display = "flex";
        setStatus("Unauthorized. Pair first.");
        return;
      }
      if (!response.ok) {
        setStatus(`Random selection failed (${response.status}).`);
        return;
      }

      const data = await response.json();
      if (!data?.mediaUrl) {
        setStatus("No eligible media for current filters.");
        return;
      }

      state.current = data;
      applyCachedState(state.current);
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(state.current);
      state.historyIndex = state.history.length - 1;
      playCurrent();
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
    indices.sort((a, b) =>
      String(state.autoTagRows[a].tagName || "").localeCompare(String(state.autoTagRows[b].tagName || ""), undefined, {
        sensitivity: "base"
      })
    );
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
      for (const f of getVisibleAutoTagFiles(row)) {
        if (f.selected && f.fullPath) paths.push(String(f.fullPath));
      }
      if (paths.length > 0) {
        assignments.push({ tagName: String(row.tagName || ""), itemPaths: paths });
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

  async function fetchAutoTagScopeItemIds() {
    const proj = await fetchJson("/api/library/projection");
    const sources = Array.isArray(proj.sources) ? proj.sources : [];
    const enabled = new Set();
    for (const s of sources) {
      if (s && s.id != null && s.isEnabled !== false) {
        enabled.add(String(s.id));
      }
    }
    const items = Array.isArray(proj.items) ? proj.items : [];
    const paths = [];
    const seen = new Set();
    for (const item of items) {
      const sid = item.sourceId != null ? String(item.sourceId) : "";
      if (!enabled.has(sid)) continue;
      const fp = item.fullPath != null ? String(item.fullPath).trim() : "";
      if (!fp) continue;
      const low = fp.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      paths.push(fp);
    }
    return paths;
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
          const pathAttr = encodeURIComponent(String(f.fullPath || ""));
          return `<div class="tag-autotag-file-row"><label><input type="checkbox" data-autotag-file data-row-id="${rid}" data-path="${pathAttr}" ${f.selected ? "checked" : ""}></label><span class="tag-autotag-file-path" title="${escapeHtml(f.fullPath || "")}">${escapeHtml(f.displayPath || f.fullPath || "")}</span></div>`;
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
      /** @type {{ scanFullLibrary: boolean, itemIds: string[] }} */
      const payload = { scanFullLibrary: scanFull, itemIds: [] };
      if (!scanFull) {
        const ids = await fetchAutoTagScopeItemIds();
        if (ids.length === 0) {
          if (tagAutotagStatus) tagAutotagStatus.textContent = "No items available in this scan scope.";
          state.autoTagRows = [];
          state.autoTagScanHasRun = true;
          renderAutoTagPanel();
          return;
        }
        payload.itemIds = ids;
      }
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

  async function applyFullTagOverlayAsync() {
    if (state.autoTagScanInFlight) return;
    if (hasPendingTagEditorMutations()) {
      await applyTagEditorChangesAsync();
      resetTagEditorPending();
      await refreshTagEditorModel();
    }
    const assignments = buildAutoTagAssignments();
    if (assignments.length > 0) {
      const r = await apiPost("/api/autotag/apply", { assignments });
      if (!r.ok) throw new Error(`Auto-tag apply failed (${r.status})`);
    }
    resetTagEditorPending();
    resetAutoTagState();
    await refreshTagEditorModel();
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
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      state.tagEditorCategoryOrder = initial.map((category) => String(category.id || ""));
    }
    renderTagEditor();
  }

  async function applyTagEditorChangesAsync() {
    if (!hasPendingTagEditorMutations()) {
      return;
    }
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
    resetAutoTagState();
    if (tagAutotagScanFull) tagAutotagScanFull.checked = loadPersistedAutoTagScanFull();
    if (tagAutotagViewAll) tagAutotagViewAll.checked = false;
    switchTagEditorTab("edit", true);
    pauseForTagEditor();
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
    streamUrl.searchParams.set("clientType", getClientType());
    streamUrl.searchParams.set("deviceName", getDeviceName());
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
      const raw = payload?.snapshot || payload?.Snapshot;
      if (!raw) return;
      setStatus(buildRefreshStatusMessage(coerceRefreshSnapshot(raw)));
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
      void loadPresets();
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
    const v = String(presetSelect.value || "").trim();
    if (!v) {
      state.activePresetName = null;
      return;
    }
    const preset = state.presets.find((p) => p.id === v);
    if (preset) {
      state.activePresetName = preset.name || preset.id;
      state.appliedFilterState = filterStateFromApiObject(preset.filterState);
    }
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
      updatePlayButtonGlyph();
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
  muteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (muteBtn.disabled) return;
    state.videoMuted = !state.videoMuted;
    updateMuteUi();
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
    toggleStageFullscreen();
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
    if (!state.current) {
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

  filterDialog.querySelector(".filter-dialog-tabstrip")?.addEventListener("click", (event) => {
    const btn = event.target && event.target.closest ? event.target.closest("[data-filter-tab]") : null;
    if (!btn) {
      return;
    }
    const tab = btn.getAttribute("data-filter-tab");
    if (tab) {
      switchFilterTab(tab);
    }
  });

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
      let path = "";
      try {
        path = decodeURIComponent(t.getAttribute("data-path") || "");
      } catch {
        path = t.getAttribute("data-path") || "";
      }
      if (!row || !path) return;
      const f = row.files.find((x) => normalizePath(x.fullPath) === normalizePath(path));
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

  filterEditBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    void openFilterDialog();
  });
  filterDialogCloseBtn.addEventListener("click", () => {
    closeFilterDialog();
  });
  filterCancelBtn.addEventListener("click", () => {
    closeFilterDialog();
  });
  filterClearAllBtn.addEventListener("click", () => {
    clearAllFiltersInDialog();
  });
  filterApplyBtn.addEventListener("click", () => {
    void applyFilterDialog();
  });
  filterDialogRefreshBtn.addEventListener("click", () => {
    void (async () => {
      try {
        await refreshFilterDialogRemoteData();
        renderAllFilterPanels();
        setStatus("Filter data refreshed.");
      } catch (error) {
        setStatus(`Filter refresh failed: ${error?.message || error}`);
      }
    })();
  });

  tagEditBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openTagEditor();
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
  tagEditorApplyBtn.addEventListener("click", async () => {
    if (state.autoTagScanInFlight) return;
    try {
      await applyFullTagOverlayAsync();
      setStatus("Tag editor changes applied");
      closeTagEditor(true);
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
  renderMobileDiagnostics();

  if (config.pairToken) {
    void pairAndConnect();
  }
}
