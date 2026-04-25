# Desktop Migration Cleanup

Findings from auditing `src/clients/desktop/ReelRoulette.DesktopApp/` against the thin-client ideal.
Report only — no changes have been made.

---

## 1. Dead Code — Unused or Superseded

### 1.1 `HistoryEntry.cs`

`HistoryEntry` is defined but not referenced anywhere in the desktop project or any other project.
No collection field, no instantiation, no serialisation call sites exist in `MainWindow.axaml.cs` or any dialog.
The playback history concept was evidently removed or never fully wired.

**Action:** Remove.

**Status:** Completed — removed the unused desktop `HistoryEntry.cs` file.

---

### 1.2 `FileFingerprintService.cs`

Desktop wrapper over `Core.Fingerprints.FileFingerprintService` that does nothing but delegate — no additional logic.
Only referenced inside `FingerprintCoordinator.cs`, which is itself not referenced anywhere (see 1.3).

**Action:** Remove (once 1.3 is removed).

**Status:** Completed — removed the unused desktop wrapper after removing the coordinator.

---

### 1.3 `FingerprintCoordinator.cs`

Full background fingerprinting queue and worker with `Enqueue`, `ComputeOnDemand`, checkpoint/save callbacks.
Not instantiated or called anywhere in `MainWindow.axaml.cs` or any other file — fingerprinting was fully migrated to `RefreshPipelineService` on the server.

**Action:** Remove.

**Status:** Completed — removed the unused desktop fingerprint coordinator.

---

### 1.4 `FingerprintStatus.cs`

`FingerprintStatus` enum (`Pending`, `Ready`, `Failed`, `Stale`) is live only as a field type on `LibraryItem.FingerprintStatus`.
If `LibraryItem` is eventually replaced by server DTOs this enum has no independent life.
Flagged because it duplicates fingerprint status concepts already tracked server-side.

**Action:** Keep while `LibraryItem` exists; reconsider if `LibraryItem` is removed.

---

### 1.5 `AppDataManager.cs` — `GetLibraryIndexPath()`

Returns the path to the local `library.json`.
The desktop no longer reads or writes a local `library.json`; all data comes from the server projection via `/api/library/projection`.
This method is no longer called from `MainWindow`. Only `GetSettingsPath()` and `GetBackupDirectoryPath()` are still active.

**Action:** Remove `GetLibraryIndexPath()`.

**Status:** Completed — removed `GetLibraryIndexPath()` from `AppDataManager.cs`.

---

### 1.6 `DuplicatesModels.cs`

`DuplicateScanResult`, `DuplicateGroup`, `DuplicateGroupItem`, `DuplicateScanScope` are local duplicate scan models used only as adapter intermediaries to map `CoreDuplicate*` API response types (from `CoreServerApiClient`) into dialog VMs.
The adapter mapping is a thin manual copy; these types are redundant given the identically-shaped `CoreDuplicate*` types already defined in `CoreServerApiClient.cs`.

**Action:** Remove; update `DuplicatesDialog` and `ManageSourcesDialog` to use `CoreDuplicate*` types directly.

**Status:** Completed — removed local duplicate DTOs; duplicate dialogs now use `CoreDuplicate*` API DTOs directly.

---

### 1.7 `SourceStatistics.cs`

`SourceStatistics` is a local DTO computed from library items in `ManageSourcesDialog`.
It is a subset of `CoreSourceStatsResponse`, which is already available from `/api/library/stats`.
The local computation runs against the desktop-local `LibraryIndex` projection, duplicating what the server already exposes.

**Action:** Remove; replace with `CoreSourceStatsResponse` from the API.

**Status:** Completed — removed `SourceStatistics.cs`; `ManageSourcesDialog` now binds source rows to `CoreSourceStatsResponse` from `/api/library/stats`.

---

## 2. Misplaced Logic — Business or Domain Logic That Belongs on the Server

### 2.1 `FilterService.cs`

Desktop adapter over `Core.Filtering.FilterSetBuilder`.
Manually projects `LibraryIndex`/`FilterState`/`LibraryItem` into core types and calls `BuildEligibleSet[WithoutFileCheck]`.
This client-side filtering drives both **library panel display** and **random item selection** — the latter especially must be API-authoritative.
The same logic now also runs on the server in `LibraryPlaybackService`, so the desktop runs a parallel filter evaluation against a stale local projection rather than canonical server state.

**Action:** Migrate. Remove client-side eligible-set computation for random selection (use `/api/random` only). Retain a lightweight local search/sort for library panel UI display, backed by the server projection, but move eligibility rules to the server.

**Status:** Completed — removed `FilterService.cs` and all desktop references to `Core.Filtering.FilterSetBuilder`. Library panel `FilterState` is applied via `LibraryProjectionDisplayFilter` against the in-memory projection (mirrors former core rules for UI only). Random play uses `CoreServerApiClient.RequestRandomAsync` exclusively; local shuffle-queue rebuild wiring was removed with item **2.2**.

---

### 2.2 `RandomSelectionEngine.cs` + `RandomizationRuntimeState`

Desktop adapter over `Core.Randomization.RandomSelectionEngineCore`.
Maintains a local `_desktopRandomizationState` shuffle-bag and applies `SmartShuffle`/`SpreadMode`/`WeightedRandom` locally against the desktop-filtered `LibraryItem` list.
This is a full duplicate of the server's `LibraryPlaybackService` randomisation, which is already API-authoritative.
The desktop path (`GetEligibleItems` → `RebuildPlayQueueIfNeeded` → `RandomSelectionEngine.SelectPath`) bypasses the server and produces locally-determined picks with stale play-count data.

**Action:** Remove the local path; route all random selection through `/api/random`.

**Status:** Completed — removed `RandomSelectionEngine.cs`, desktop `RandomizationRuntimeState`, `_desktopRandomizationState`, `GetEligibleItems`/`RebuildPlayQueueIfNeeded` and all call sites; random play was already API-only via `RequestRandomAsync`. **Server:** `LibraryPlaybackService` now keys `RandomizationRuntimeStateCore` by **client + session** (WebUI uses per-tab `sessionStorage` session ids but a shared `localStorage` client id; previously every tab shared one shuffle bag and spread history, which broke SmartShuffle/SpreadMode). **WebUI:** `playCurrent` now POSTs `/api/record-playback` on play start (desktop already did), so WeightedRandom and `lastPlayed`-based weights use up-to-date library stats instead of stale `library.json` counts.

---

### 2.3 `MainWindow.axaml.cs` — `GetEligibleItems()` / `GetEligibleItemsAsync()` / `RebuildPlayQueueIfNeeded()`

These methods rebuild local shuffle state from a (now empty) local pool, then hand the result to `RandomSelectionEngine` — a leftover parallel to server randomisation.
This is the orchestration layer for the duplicate local randomisation pipeline (see 2.1 and 2.2).
The entire code path should be removed in favour of the server `/api/random` call that the desktop already makes via `CoreServerApiClient.RequestRandomAsync`.

**Action:** Remove once API-only random selection is fully adopted.

**Status:** Completed — removed `GetEligibleItems`, `GetEligibleItemsAsync`, `RebuildPlayQueueIfNeeded`, and `RebuildPlayQueueIfNeededAsync` from `MainWindow.axaml.cs`, plus all call sites that previously rebuilt desktop-local randomization state after filter/source/favorite/blacklist changes. Desktop random selection is now fully API-authoritative through `CoreServerApiClient.RequestRandomAsync`.

---

### 2.4 `MainWindow.axaml.cs` — Volume normalisation (`ApplyVolumeNormalization`, `ComputeBaselineLoudness`, `_cachedBaselineLoudnessDb`, `_maxReductionDb`, `_maxBoostDb`, `_baselineAutoMode`)

The desktop computes its own per-item loudness normalisation using `IntegratedLoudness` values from the local `LibraryIndex` projection.
It calculates a library-wide baseline loudness (75th percentile) and adjusts VLC volume per-play.
The VLC volume adjustment is legitimately a desktop concern, but the **baseline loudness computation** iterates all library items and applies statistical aggregation logic that is out of place in a UI event handler.

**Action:** Migrate the loudness baseline computation to a dedicated desktop-local service class. The VLC volume adjustment itself stays in the desktop.

**Status:** Completed — extracted baseline loudness aggregation/caching into `LoudnessNormalizationService`; `MainWindow.axaml.cs` now delegates baseline computation to the service while keeping `ApplyVolumeNormalization` and per-play VLC volume adjustment in place.

---

### 2.5 `MainWindow.axaml.cs` — Local preset serialisation/matching (`ResolveMatchingPresetName`, `_filterPresets` management, preset JSON compare)

The desktop maintains its own in-memory `List<FilterPreset>`, serialises filter state to JSON to compare against preset snapshots for auto-selection, and syncs the local list to the server via `SyncPresetsAsync`.
The preset-matching logic performs a client-local JSON string comparison that should instead call `/api/presets/match` — an endpoint that is already plumbed in `CoreServerApiClient`.

**Action:** Migrate; use `/api/presets/match` for active-preset auto-detection and remove the client-local JSON-compare path.

**Status:** Completed — removed local JSON preset comparison (`ResolveMatchingPresetName`) and now resolve active preset name via `CoreServerApiClient.MatchPresetAsync` (`/api/presets/match`); retained `_filterPresets` only for preset list UI/dialog/sync responsibilities.

---

### 2.6 `MainWindow.axaml.cs` — `_randomizationStateService`, `_filterSessionStateService`, `_playbackSessionStateService`

The desktop instantiates three `ReelRoulette.Core.State.*` services (`RandomizationStateService`, `FilterSessionStateService`, `PlaybackSessionStateService`) and uses them only as in-process state boxes to shuttle values between `LoadSettings` and `SaveSettings`.
These Core services were designed for the server's session infrastructure.
In the desktop they serve as glorified local variable holders — the state they contain is never shared with any other consumer in the process, and the locking they add provides no benefit.

**Action:** Remove the Core state service instances from the desktop; replace with plain fields or a local settings bag.

**Status:** Completed — removed the desktop Core state-service instances and persisted settings directly from local fields.

---

### 2.7 `MainWindow.axaml.cs` — `RecalculateGlobalStats()` (local stats aggregation)

Iterates the local `LibraryIndex` projection to compute counts (total videos, photos, favorites, blacklisted, never-played, etc.) and updates the stats panel.
The server exposes identical computed stats via `/api/library/stats` (already polled via `GetLibraryStatsAsync`).
The desktop runs a local aggregation in addition to the API fetch, maintaining a parallel computation path against a potentially stale snapshot.

**Action:** Migrate; fetch stats exclusively from `/api/library/stats` and remove the local aggregation loop.

**Status:** Completed — removed the desktop local global-stats aggregation loop; stats now refresh from `/api/library/stats`.

---

### 2.8 `LibraryItem.cs` — Avalonia thumbnail fields (`ThumbnailPath`, `ThumbnailBitmap`, `ThumbnailWidth`, `ThumbnailHeight`)

`LibraryItem` is a domain model (deserialised from the server library projection JSON) but carries Avalonia-specific UI state: `Bitmap` object references and pixel dimensions.
This couples a data-layer class to the presentation framework, making it impossible to reuse in a non-Avalonia context and impossible to unit-test without an Avalonia runtime.

**Action:** Migrate the UI-specific thumbnail fields into a separate `LibraryItemViewModel` class; keep `LibraryItem` as a pure data class.

---

### 2.9 `LibraryItem.cs` — `HasGridStateIndicator`, `INotifyPropertyChanged` implementation

Same structural issue as 2.8: `INotifyPropertyChanged` and computed UI properties are baked into the domain model rather than a view-model layer.

**Action:** Migrate to a `LibraryItemViewModel` wrapper.

---

### 2.10 `MainWindow.axaml.cs` — `#region Duration Cache System` (`StartDurationScan`, `StartLoudnessScan`, `ParseDurationFilter`, `ParseDurationFilterString`)

`StartDurationScan` and `StartLoudnessScan` now simply delegate to `RequestCoreRefreshAsync()`; the methods are near-empty shells that add no value.
`ParseDurationFilter`/`ParseDurationFilterString` parse combobox label strings (`"5s"`, `"30m"`, etc.) into seconds — a UI concern that belongs in `FilterDialog`, not in the main window.

**Action:** Inline `StartDurationScan`/`StartLoudnessScan` call sites and remove the wrapper methods; move duration-label parsing into `FilterDialog`.

**Status:** Completed — inlined scan request call sites, removed the wrapper methods, and moved duration-label parsing into `FilterDialog`.
