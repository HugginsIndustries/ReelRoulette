# Domain Inventory (Current State)

This is the canonical implementation inventory for ReelRoulette.
It is ownership-first and reflects current state only.

## Scope and Update Rules

- Purpose: map where authoritative behavior lives across core/server/clients.
- Keep this file current when features/workflows/contracts are added, changed, or removed.
- Keep entries current-state only; avoid narrative history in this file.
- Prefer concise entries: ownership + key files + notable boundaries.

---

## Core Domain Logic (Authoritative)

Core/server domain services own business rules and persisted state semantics.

- `src/core/ReelRoulette.Core/*`
  - filtering/randomization helpers, storage abstractions, verification modules, **`LibraryGridLayout`** (shared justified-row thumbnail grid layout).
- `src/core/ReelRoulette.Core/Library/LibraryCatalogStore.cs` and `LibraryCatalogSession.cs`
  - SQLite catalog at `library.db` (WAL, synchronous=NORMAL, `user_version` 3) is the live library store. Opening a `user_version` 2 catalog migrates it in place in one transaction: the stored file name sort key, the sort indexes, and neither a separate item tag index nor a file name fold index, which no query uses. `LibraryCatalogNameSortKey` computes the key, which orders like OrdinalIgnoreCase but takes its casing from .NET's built-in Unicode table rather than the system's ICU, so the key is the same on every system; insert and rename write it with the row. Presets and thumbnail revision, width, and height are catalog columns. Core settings stay in `core-settings.json`. Startup opens it without reading the whole catalog and updates catalog rows in place. A catalog that a newer version saved, including a replace file beside it, or one that cannot be opened or read at the moment, is left unchanged. A file that is not a database, is corrupt, or has another schema, including a schema version before 2, is moved aside to `library.db.refused`. An empty catalog is created only when there is no `library.db`, refused file, or catalog backup. In any of those other cases the server runs without a library: library routes answer 503 with the reason, `/control/status` and the Operator page show it, and neither backups nor refresh run. `LibraryCatalogSession.QueryList` is the browse query (enabled sources, search, filter, sort, paging), with one index per sort mode and direction and both counts cached by catalog revision, search, and filter. Random eligibility uses that filter without search, plus the request's video and photo options, and reads only each eligible item's id, path, play count, and last played; the picked item is read by id. Direct play reads one item and its source. Tag-editor model reads and tag-editor writes (item tags, categories, tags, and auto-tag apply) update those rows. The source list and source enable and disable read those rows. The tag table is the catalog's tag list. An item can still hold a tag name that is not in that table. Favorite, blacklist, record-playback, and clear-stats update those rows. Library stats are one SQL pass grouped by source id and media type and include the loudness baseline. A single-item read returns one row by id or path. An item-state read returns only the requested paths. An empty path list returns no items. Auto-tag scan and duplicate scan read catalog rows. Duplicate apply deletes the non-kept rows. Source import inserts and updates catalog rows. Refresh writes the columns each stage owns. `GET /api/library/catalog-checkpoint` and server catalog backups write a standalone SQLite copy of `library.db`.
- `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs`
  - source import, library list/query (`POST /api/library/query`), catalog checkpoint (`GET /api/library/catalog-checkpoint`), duplicate scan/apply, auto-tag scan/apply, playback-stats clear, tag-editor model and writes, and related command orchestration. Catalog backups write `library.db.backup.*` checkpoints under the server backup settings, and rotation trims only valid current-version backups, leaving other files in `backups/`. A refresh's checkpoint is taken after that refresh finishes, and a shorter backup gap applies on the next catalog save. Tag-editor reads and writes, auto-tag apply, favorite, blacklist, record-playback, and clear-stats update catalog rows. Library stats, a single-item read, item-state reads, auto-tag scan, and duplicate scan are scoped SQL reads. Duplicate apply deletes catalog rows. Source import inserts and updates rows. Refresh writes its own columns.
- `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`
  - unified refresh pipeline stage execution (including `nameSortKeys`, which fills missing name sort keys and recomputes every key after a key version change, and `fingerprintScan` for per-file SHA-256 backfill). Each stage writes its own catalog columns as work finishes. Thumbnail reuse trusts the revision stored on the item and does not walk unchanged source files. The stage writes that item's revision, width, and height as the item finishes, and a completed stage deletes a JPEG whose item is not in the catalog. There is no thumbnail file-count or byte cap. A catalog backup for a refresh is taken after that refresh finishes and still follows the backup gap. Overlap guards, status snapshots, duration/loudness scans, server-scheduled **auto-refresh**, and **list-query thumbnail metadata enrichment** at serve time stay here.
- `src/core/ReelRoulette.Server/Services/ServerStateService.cs`
  - revisioned event publication, replay/resync behavior, state projection support. Preset reads and writes use the catalog table. Tag rename and delete update those rows. Source reads and enable and disable use catalog rows.
- `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs`
  - core-owned runtime settings persistence/flow where applicable.

Boundary:

- Domain/state mutation authority is core/server, not desktop/web clients.

---

## Server Transport and API Composition

`ReelRoulette.Server` remains a thin transport/composition layer.

- `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`
  - endpoint wiring for API/SSE/media/control/testing/log surfaces (including `POST /api/play/{itemId}` with `record-playback`-equivalent persistence and SSE).
- `src/core/ReelRoulette.Server/MediaPlayableExtensions.cs`
  - canonical video/photo extension allowlist for import alignment and play `415` checks.
- `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs`
  - request/response/event DTOs used on transport boundaries.
- `src/core/ReelRoulette.Server/Contracts/ApiContractMapper.cs`
  - contract shaping/mapping.
- `src/core/ReelRoulette.Server/Auth/*`
  - pairing/session/auth middleware and session store behavior.
- `shared/api/openapi.yaml`
  - API source of truth for endpoint and schema contracts.

Boundary:

- Keep server layer transport/auth/SSE/media composition only (no deep domain logic).

---

## ServerApp Runtime and Operator Surface

`ReelRoulette.ServerApp` is the default runtime host and operator surface.

- `src/core/ReelRoulette.ServerApp/Program.cs`
  - single-process host for API + SSE + media + WebUI static assets + `/operator`.
- `src/core/ReelRoulette.ServerApp/Hosting/UpdateService.cs`
  - Velopack self-update for packaged ServerApp: check-only background poll, operator check/download/apply under `/control/update/*`, stable vs dev channel via `devChannelEnabled`.
- `src/core/ReelRoulette.ServerApp/Hosting/IHostUi.cs`
  - host-UI abstraction boundary keeping server runtime tray-agnostic.
- `src/core/ReelRoulette.ServerApp/Hosting/AvaloniaTrayHostUi.cs`
  - Cross-platform tray runtime controls (Open Operator UI, Launch Server on Startup, Refresh Library, Restart Server, Stop Server / Exit) using shared `assets/HI.ico`, with deterministic headless fallback when tray is unavailable. The tray ends only when shut down explicitly, on its UI thread, and an unrequested end is written to `last.log`. It loads the Fluent theme so the menu window Avalonia draws on Windows renders, and writes tray clicks, Windows menu opens and closes, failed menu actions, tray UI errors, and Avalonia warnings and errors (each once per run) to `last.log`.
- `src/core/ReelRoulette.ServerApp/Hosting/HeadlessHostUi.cs`
  - headless host path, used on any OS when no tray can be created.
- `src/core/ReelRoulette.ServerApp/Hosting/WindowsStartupLaunchService.cs`
  - Windows startup-launch registration and state reconciliation (`HKCU` Run key) for immediate tray/operator toggles.
- `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs`
  - Linux startup-launch registration and state reconciliation via XDG autostart (`*.desktop` in the user autostart location, `Path=` + `Exec=` resolved from **`APPIMAGE`** when present for AppImage runs) for immediate tray/operator toggles; complements `Program.cs` content root pinned to `AppContext.BaseDirectory` for session autostart.
- `src/core/ReelRoulette.ServerApp/Hosting/HeadlessStartupLaunchService.cs`
  - non-Windows startup-launch no-op/unsupported path for host portability.
- `src/core/ReelRoulette.Server/Services/ConnectedClientTracker.cs`
  - connected client/session/SSE diagnostics backing operator visibility.
- `src/core/ReelRoulette.Server/Services/OperatorTestingService.cs`
  - testing mode and fault simulation state transitions.
- `src/core/ReelRoulette.Server/Services/ServerLogService.cs`
  - bounded/filterable server log reads for operator tooling.

Includes:

- control-plane surfaces (`/control/status`, `/control/settings`, `/control/pair`, `/control/restart`, `/control/stop`, `/control/update/*`, testing/log endpoints),
- control-plane auth in `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (localhost trusted; every other address needs the control token) and control token generation in `CoreSettingsService`,
- startup-launch control surface (`/control/startup`),
- operator diagnostics and manual testing controls.

---

## Desktop Client Orchestration (`src/clients/desktop/ReelRoulette.DesktopApp/`)

Desktop is orchestration/render for migrated flows.

- `src/clients/desktop/ReelRoulette.LibraryArchive/`
  - shared `net10.0` library: library database export/import. A transfer is one SQLite checkpoint. Source-root remap and skip run inside that database. An existing `library.db` that cannot be opened requires confirmation. If import fails before the new database is in place, the previous catalog is put back, and a folder that had no catalog is left without one. A cleanup failure after that leaves the imported catalog in place.
- `src/clients/desktop/ReelRoulette.DesktopApp.Tests/`
  - xUnit tests for `ReelRoulette.LibraryArchive` migration helpers, export→import round-trip, library-panel browse window decisions, and tag-save local apply (immediate tiles, a confirmed tag kept when the save fails, failed-tail undo that keeps a tag which arrived during the save, filter retarget, own-echo skip, and a rename event for a wider set of files that still applies).
- `src/clients/desktop/ReelRoulette.DesktopApp/LibraryPanelBrowse.cs`
  - pure decisions for infinite-scroll fill, append reflow, whether a catalog event patches tiles or reloads the loaded window (shared fixture `library-tile-effect.json`), whether an open query or a further page still in flight is read again, whether a deferred refresh keeps that query open, where a query page reflows, the committed loaded span a reload uses after a splice stops halfway, which copy supplies now-playing stats, when a file that is not on screen is read again, when that read replaces the copy already shown, and when a playback event paints the current-file section.
- `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs`
  - API/SSE lifecycle orchestration, reconnect/resync guidance, compatibility gating, playback orchestration (library grid click-to-play via `POST /api/play/{itemId}`); grid-only library panel that browses through `POST /api/library/query`. Connect and resync use library stats, sources, and the tag catalog.
- `src/clients/desktop/ReelRoulette.DesktopApp/LibraryStatsRefresh.cs`
  - coalesces library stats refreshes: a short wait gathers a burst, one request in flight, and one more for requests made during it.
- `src/clients/desktop/ReelRoulette.DesktopApp/CoreServerApiClient.cs`
  - typed desktop API adapter (commands/queries/SSE wiring), including `QueryLibraryAsync` and `RequestPlayItemAsync`.
- `src/clients/desktop/ReelRoulette.DesktopApp/ManageSourcesDialog.axaml.cs`
  - API-backed source/duplicate orchestration behavior.
- `src/clients/desktop/ReelRoulette.DesktopApp/LibraryImportRemapDialog.*`, `LibraryOverwriteConfirmDialog.*`
  - desktop UI for library database import (per-source remap/skip, overwrite confirm naming the library catalog, server-stopped acknowledgment). Export saves the server checkpoint as `library.db`. Import replaces that database only.
- `src/clients/desktop/ReelRoulette.DesktopApp/AutoTagDialog.axaml.cs`
  - API-backed auto-tag scan/apply orchestration. Scoped scan sends no path list. The dialog closes on accept. Apply then updates the current file and loaded tiles before the request returns, and a failure undoes tags an event has not already confirmed.
- `src/clients/desktop/ReelRoulette.DesktopApp/TagSaveApply.cs`
  - local tag-save delta, undo of an unconfirmed failed tail on the tiles loaded now, retarget of a renamed or deleted filter tag, and skip of the save's own exact item-tag event. An incoming rename or delete retargets that filter before the reload. A rename or delete event for the files that had that tag still applies.
- `src/clients/desktop/ReelRoulette.DesktopApp/SettingsDialog.axaml(.cs)`
  - client-side settings orchestration including playback policy toggle UX and Velopack check → download → apply.
- `src/clients/desktop/ReelRoulette.DesktopApp/UpdateService.cs`
  - Velopack self-update for packaged desktop builds (same check-only background poll and confirmed download/apply as the server; channel via `DevChannelEnabled`).
- `src/clients/desktop/ReelRoulette.DesktopApp/ClientLogRelay.cs`
  - client log relay to server-side log ingestion API.

Desktop flows that still run locally:

- Server-owned work still done on the desktop:
  - Library database import: `LibraryArchiveMigration.ImportDatabase` writes the server's `library.db` from the desktop process while the server is stopped, including source remap and skip.
  - Preset writes: the filter dialog edits the whole preset list and `POST /api/presets` replaces it.
  - Preset-match heading: `LibraryPresetSelection.FiltersEqual` decides which saved preset the current filter equals, locked to the WebUI by `shared/fixtures/preset-filter-equality.json`.
  - Refresh status summary: `MainWindow` parses refresh stage messages into the status line summary (`BuildSourceRefreshSummary` and the stage counts).
- Client-owned flows that stay local by design:
  - Local-first playback through LibVLC: a file the desktop can reach plays from disk, and the API media path is used when it cannot or when `ForceApiPlayback` is set.
  - Loudness baseline choice for volume normalization: auto mode uses the baseline from the last library stats response, and manual mode uses the desktop's own override.
  - Desktop settings backups of `desktop-settings.json`, with their own gap and count.
  - Show in File Manager (`OpenFileLocation`), which opens the local file browser.

Boundary:

- No authoritative local mutation fallback for migrated server-owned domains.

---

## WebUI Client Orchestration (`src/clients/web/ReelRoulette.WebUI`)

WebUI is runtime-config-driven API/SSE client orchestration.

- `src/clients/web/ReelRoulette.WebUI/src/app.js`
  - main client runtime behavior and orchestration (playback, filter dialog, library overlay browse + SSE live sync + click-to-play, header counts from the current query window, tag overlay with **Edit Tags** + **Auto Tag** API flows).
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterStateModel.ts`
  - filter JSON serialize/parse aligned with desktop/server `FilterState`.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryOverlayModel.ts`
  - library overlay status HTML and projection summary parsing.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryProjectionModel.ts`
  - projection item parse and list-query page parse, with duration read as seconds.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryProjectionSync.ts`
  - pure SSE patch helpers for favorite, blacklist, and playback fields on loaded tiles, matched by item id only.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryQuerySession.ts`
  - list-query window: first page, fill-on-scroll, hide/show, patch or reload, and resync. A favorite or blacklist on an item that is not loaded uses the event's previous values. Scoped auto-tag scan sends no path list. Tag save writes the tiles loaded now, updates the stored filter when a tag is renamed or deleted, and reloads that window once when a tag filter can change which files are shown.
- `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts`
  - pending-only tag-editor save plan, the same local delta matched by item id (auto-tag by the scan rows' item ids), a confirmed tag kept when the request fails, failed-tail undo, the same filter retarget, and the same own-event skip for an exact item-tag echo. An incoming rename or delete retargets that filter before the reload. A rename or delete event for a wider set of files still applies.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryBrowseModel.ts`
  - sort mode, direction labels, and search text held by the library overlay.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridLayout.ts`
  - Core-aligned justified-row layout port (`getAspectRatio`, `buildRows`); layout width uses full scrollport (no desktop 8px right gutter).
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridTileModel.ts`
  - grid tile HTML, thumbnail URL builder, favorite/blacklist badge rendering.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridRowModel.ts`
  - justified grid row HTML composition.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridVirtualizer.ts`
  - row offset index, visible-window calculation (900px overscan), and the height of the last loaded page.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridController.ts`
  - library overlay grid DOM lifecycle (mount, scroll, fill coverage with the last page's height, deferred layout while hidden, optional scroll reset on a new query, resize debounce, destroy).
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryPlayModel.ts`
  - play-item error status mapping and request identity helpers for library tile activation.
- `src/clients/web/ReelRoulette.WebUI/src/library/currentItemState.ts`
  - the playing item's favorite and blacklist from item-state events, and the per-item cache applied when an item plays again, both by item id.
- `src/clients/web/ReelRoulette.WebUI/src/shell.ts`
  - static layout including library overlay header browse count, toolbar (search/sort cluster), tabbed tag overlay, and filter overlay chrome.
- `src/clients/web/ReelRoulette.WebUI/src/main.ts`
  - bootstrap entrypoint.
- `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts`
  - API client calls, identity propagation, and `requestPlayItem` for library tile play.
- `src/clients/web/ReelRoulette.WebUI/src/auth/authBootstrap.ts`
  - startup auth/version/capability checks.
- `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts`
  - the WebUI's one event stream: resume with the last event ID after an error, revision tracking, and handler dispatch for each event type.
- `src/clients/web/ReelRoulette.WebUI/src/events/eventEnvelope.ts`
  - event envelope parsing/building utilities.
- `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts`
  - runtime config parsing/validation.
- `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`
  - generated TS contracts from OpenAPI.

Boundary:

- WebUI does not own authoritative domain mutation semantics; it consumes server contracts.

---

## Contracts and Generated Client Surfaces

- Source of truth: `shared/api/openapi.yaml`.
- Server contract models/mapping:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs`
  - `src/core/ReelRoulette.Server/Contracts/ApiContractMapper.cs`
- Web generated contracts/tooling:
  - `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`
  - `src/clients/web/ReelRoulette.WebUI/scripts/verify-openapi-contracts-fresh.mjs`
  - `src/clients/web/ReelRoulette.WebUI/scripts/sync-shared-icon.mjs` (copies shared `HI.ico` + font; uses **`sharp`** to resize `HI-256.png` / `HI-512.png` into manifest-accurate PWA PNGs under `public/icons/`)
  - `src/clients/web/ReelRoulette.WebUI/public/sw.js` + `src/main.ts` service worker registration (Chromium PWA installability; document navigations only)
  - package scripts (`generate:contracts`, `verify:contracts`, `verify`).

---

## Verification and Test Surfaces

- Core regression tests:
  - `src/core/ReelRoulette.Core.Tests/*`
- System-check harness:
  - `src/core/ReelRoulette.Core.SystemChecks/*`
- WebUI tests:
  - `src/clients/web/ReelRoulette.WebUI/src/test/*`
- Manual test guide/checklist:
  - `docs/checklists/testing-checklist.md`

Canonical gates:

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`
- `npm run verify` (WebUI)
- `pwsh ./tools/scripts/verify-web-deploy.ps1`

---

## Runtime, Packaging, and CI Tooling

Runtime scripts:

- `tools/scripts/run-server.ps1`
- `tools/scripts/run-server-rebuild.ps1`
- scripts select `net10.0-windows` framework on Windows and `net10.0` on non-Windows for ServerApp startup.
- `tools/scripts/set-release-version.ps1` (release-aligned version fan-out for OpenAPI/runtime/tests/server+desktop project metadata, optional WebUI contract regen and verify gates, plus README/dev-setup release command examples; use `-NoDocUpdates` / `-NoUpdateDesktopVersion` / `-NoRegenerateContracts` / `-NoRunVerify` to skip pieces)
- `tools/scripts/stage-webui-assets.ps1` (WebUI build + copy into server publish `wwwroot`; used by `release.yml` and packaged-server smoke)
- `tools/scripts/reset-checklist.ps1` (resets `docs/checklists/testing-checklist.md` metadata/checklist state, fills Release version from `.version` without its `-dev.N` suffix, and removes `Failed:` and `Skipped:` notes; preserves waived checks by default, supports `-RemoveWaived`)

Web verification:

- `tools/scripts/verify-web-deploy.ps1`
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` (headless Velopack Linux server AppImage: curls `/health`, `/api/version`, `/control/status`, `/operator`; builds an AppImage locally when no path is passed)

Packaging and release:

- `.github/workflows/release.yml` (Velopack matrix build/pack/upload to B2; stable GitHub mirror of `Setup.exe` / `.AppImage` only; sole shipping pipeline)
- `tools/scripts/stage-webui-assets.ps1`
- shared icon assets: `assets/HI.ico`, `assets/HI-256.png`, `assets/HI-512.png`

CI:

- `.github/workflows/ci.yml`
