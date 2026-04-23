# Desktop-Only Features Without Web Equivalent

Functionality present in `src/clients/desktop/` that has no equivalent in the WebUI or Operator UI.

Each entry notes where the feature lives in the desktop codebase and which web surface it belongs in:
- **WebUI** — media viewing/playback experience (`src/clients/web/ReelRoulette.WebUI/`)
- **Operator UI** — server management, configuration, or diagnostics (no dedicated project exists yet)

Report only — no changes have been made.

---

## WebUI Parity Gaps

### 3.1 Library Browser Panel

**Desktop location:** `MainWindow.axaml` / `MainWindow.axaml.cs`, `LibraryGridRowViewModel.cs`, `LibraryGridTileViewModel.cs`

Browsable list and thumbnail-grid view of all library items with sort (name, last-played, play-count, duration), free-text search, virtual scrolling, and per-item state indicators (favorite, blacklist, play-count badges).

**Target surface:** WebUI

WebUI has a playback-focused player with a tag editor but no browsable library grid.

---

### 3.2 Advanced Filter Editor

**Desktop location:** `FilterDialog.axaml` / `FilterDialog.axaml.cs`

Full compound filter UI: favorites-only, blacklist exclusion, never-played, audio filter, media-type filter, per-category tag match modes (AND/OR per category), global category match mode, duration min/max inputs, source selection, preset save/rename/delete, and per-category collapsible sections.

**Target surface:** WebUI

WebUI has basic filtering but is missing the category/tag/duration/source compound filter UI.

---

### 3.3 Per-Item Tag Editor (multi-item batch)

**Desktop location:** `ItemTagsDialog.axaml` / `ItemTagsDialog.axaml.cs`

Assign and remove tags per item; create new tags and categories inline; batch edit across multiple selected items simultaneously.

**Target surface:** WebUI

WebUI has a tag editor panel but the desktop version is richer — it supports multi-item batch edit and inline category creation.

---

### 3.4 Volume Normalisation

**Desktop location:** `MainWindow.axaml.cs` — `ApplyVolumeNormalization`, `_volumeNormalizationEnabled`, `_maxReductionDb`, `_maxBoostDb`, `_baselineAutoMode`, `_baselineOverrideLUFS`; exposed via `SettingsDialog`

Per-play EBU R128 loudness normalisation: computes a library-wide baseline (75th percentile of `IntegratedLoudness`), then adjusts VLC volume up or down per item within configurable reduction/boost limits. Includes auto vs. manual baseline, displayed as LUFS in the settings panel.

**Target surface:** WebUI

WebUI has a volume slider but no per-item loudness normalisation. A web implementation would use the Web Audio API `DynamicsCompressorNode` or a gain node against the `<video>` element.

---

### 3.5 Photo Slideshow

**Desktop location:** `MainWindow.axaml.cs` — `_photoDisplayTimer`, `_photoDisplayDurationSeconds`, `_imageScalingMode`, `_fixedImageMaxWidth`, `_fixedImageMaxHeight`; exposed via `SettingsDialog`

Displays image/photo library items inline with a configurable dwell time (default 5 s) before auto-advancing to the next item. Supports auto and fixed image scaling modes with configurable maximum pixel dimensions.

**Target surface:** WebUI

WebUI serves media but has no photo slideshow or dwell-time mode.

---

### 3.6 Auto-Play / Keep-Playing / Loop

**Desktop location:** `MainWindow.axaml.cs` — `_isKeepPlayingActive`, `_autoPlayNext`, `_isLoopEnabled`; `LoopToggle`, `AutoPlayNextCheckBox` controls

Persistent auto-play-next (automatically pick the next random item when playback ends) and per-item loop toggle, both persisted across sessions in `desktop-settings.json`.

**Target surface:** WebUI

WebUI has transport controls but no persistent auto-play-next or loop toggle retained across page loads.

---

### 3.7 Player View Mode and Chrome Preferences

**Desktop location:** `MainWindow.axaml.cs` — `_isPlayerViewMode`, `_isFullScreen`, `_alwaysOnTop`, `_showMenu`, `_showStatusLine`, `_showControls`, `_showLibraryPanel`, `_showStatsPanel`; window size/position memory in `desktop-settings.json`

Full-screen and always-on-top modes; per-session hide/show of menu bar, status line, playback controls, library panel, and stats panel; window size and position restored on next launch.

**Target surface:** WebUI

WebUI supports fullscreen but not the full set of chrome preferences (always-on-top is native-only; persistent panel visibility and saved window geometry are desktop-specific).

---

### 3.8 Reveal in File Manager

**Desktop location:** `MainWindow.axaml.cs` — `OpenFileLocation()`

Opens the OS file browser (Explorer on Windows, Finder on macOS, `xdg-open` on Linux) focused on the currently-playing media file.

**Target surface:** WebUI

A direct file-manager launch has no web equivalent. A "copy path to clipboard" action would serve a similar need on WebUI.

---

## Operator UI Parity Gaps

### 3.9 Source Management

**Desktop location:** `ManageSourcesDialog.axaml` / `ManageSourcesDialog.axaml.cs`, `SourceViewModel`

Add, remove, rename, enable/disable library sources; per-source item and duration statistics; trigger a duplicate scan scoped to a single source.

**Target surface:** Operator UI

Sources live on the server. This dialog calls `/api/sources/*` and is a server-management action with no web equivalent.

---

### 3.10 Duplicate Detection and Resolution

**Desktop location:** `DuplicatesDialog.axaml` / `DuplicatesDialog.axaml.cs`, `DuplicatesModels.cs`

Fingerprint-based duplicate scan scoped to current source, all enabled sources, or all sources; grouped display of duplicates; per-item keep/remove selection with a default-behaviour preference; bulk apply (removes duplicates from library and optionally from disk).

**Target surface:** Operator UI

Backed by `/api/duplicates/scan` and `/api/duplicates/apply`; no web equivalent exists.

---

### 3.11 Auto-Tag (Filename Pattern Match)

**Desktop location:** `AutoTagDialog.axaml` / `AutoTagDialog.axaml.cs`

Scans the full library or a selection for filename-to-tag matches; previews per-tag matched files with a "needs change" indicator; allows selective confirmation before applying.

**Target surface:** Operator UI

Backed by `/api/autotag/scan` and `/api/autotag/apply`; no web equivalent exists.

---

### 3.12 Inline Tag Rename / Recategorise

**Desktop location:** `EditTagDialog.axaml` / `EditTagDialog.axaml.cs`

Rename a tag globally across all items or move it to a different category, with a live preview of affected item count.

**Target surface:** Operator UI

Administrative tag catalog management; the desktop calls `/api/tag-editor/rename-tag` and `/api/tag-editor/upsert-tag`.

---

### 3.13 Manual Scan Triggers (Durations and Loudness)

**Desktop location:** `MainWindow.axaml.cs` — `ScanDurations_Click`, `ScanLoudness_Click`; accessible via Library menu

"Scan Durations" and "Scan Loudness" menu items that trigger a core refresh via `/api/refresh/start`. The loudness scan dialog also lets the user choose between scanning only new files or rescanning all files (setting `ForceRescanLoudness`).

**Target surface:** Operator UI

The Operator UI should surface refresh trigger controls and refresh settings. Currently `/api/refresh/start` and `/api/refresh/settings` have no web-accessible UI.

---

### 3.14 Server Settings Panel

**Desktop location:** `SettingsDialog.axaml` / `SettingsDialog.axaml.cs`

Configures all core-owned settings via API: refresh schedule (auto-refresh enabled/interval), loudness/duration rescan flags, fingerprint scan parallelism, library backup policy (enabled/interval/count), Web UI enable/port/LAN binding/hostname/auth mode/shared token, and the core server base URL.

**Target surface:** Operator UI

All settings are core-owned and synced via API (`/api/refresh/settings`, `/api/backup/settings`, `/api/web-runtime/settings`). An Operator UI settings page is the correct home for these controls.

---

### 3.15 Library Archive Import/Export

**Desktop location:** `LibraryImportRemapDialog.axaml` / `LibraryImportRemapDialog.axaml.cs`, `LibraryExportOptionsDialog.axaml` / `LibraryExportOptionsDialog.axaml.cs`, `LibraryOverwriteConfirmDialog.axaml` / `LibraryOverwriteConfirmDialog.axaml.cs`; backed by `src/clients/desktop/ReelRoulette.LibraryArchive/LibraryArchiveMigration.cs`

Export `library.json`, thumbnails, and desktop settings to a zip archive. Import from a zip with a source-path remapping wizard (handles cross-machine or cross-OS path differences).

**Target surface:** Operator UI

Library data management belongs on the Operator UI. `LibraryArchiveMigration` could be reused or adapted server-side to expose import/export as API endpoints.

---

### 3.16 Remove Items from Library

**Desktop location:** `RemoveItemsDialog.axaml` / `RemoveItemsDialog.axaml.cs`

Confirmation dialog for removing selected items from the library (backed by server API). Supports removing from the library index only or also deleting from disk.

**Target surface:** Operator UI

Library mutation action; no web equivalent.

---

### 3.17 Tag-Catalog Migration Wizard

**Desktop location:** `MigrationDialog.axaml` / `MigrationDialog.axaml.cs`, `MigrationTagViewModel`

One-time wizard that assigns legacy flat (uncategorised) tags to categories when upgrading from the old tag schema. Presents all orphaned tags with a category picker and bulk-assigns on confirm.

**Target surface:** Operator UI

Schema migration tooling belongs on the Operator UI; alternatively this could be driven server-side as a one-time background operation surfaced via a status endpoint.

---

### 3.18 FFmpeg Log Viewer

**Desktop location:** `FFmpegLogWindow.axaml` / `FFmpegLogWindow.axaml.cs`; accessed via Help menu

Secondary window that displays FFmpeg log entries buffered during a refresh run, with a clear button.

**Target surface:** Operator UI

The server log is accessible via `/control/log`. An Operator UI log viewer (covering both server and FFmpeg output) would subsume this window.
