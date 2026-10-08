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
  - SQLite catalog at `library.db` (WAL, synchronous=NORMAL, `user_version` 3) is the live library store. Opening a `user_version` 2 catalog migrates it in place in one transaction: the stored file name sort key, the sort indexes, and neither a separate item tag index nor a file name fold index, which no query uses. `LibraryCatalogNameSortKey` computes the key, which orders like OrdinalIgnoreCase but takes its casing from .NET's built-in Unicode table rather than the system's ICU, so the key is the same on every system; insert and rename write it with the row. Presets and thumbnail revision, width, and height are catalog columns. Core settings stay in `core-settings.json`. Startup opens it without reading the whole catalog and updates catalog rows in place. A catalog that a newer version saved, including a replace file beside it, or one that cannot be opened or read at the moment, is left unchanged. A file that is not a database, is corrupt, or has another schema, including a schema version before 2, is moved aside to `library.db.refused`. An empty catalog is created only when there is no `library.db`, refused file, or catalog backup. In any of those other cases the server runs without a library: library routes answer 503 with the reason, `/control/status` and the Operator page show it, and neither backups nor refresh run. `LibraryCatalogSession.QueryList` is the browse query (enabled sources, search, filter, sort, paging), with one index per sort mode and direction and both counts cached by catalog revision, search, and filter. The filter's tags become one set of item ids that each item is checked against once, so a filter costs the same with one tag or many; tags match by name fold. Random eligibility uses that filter without search, plus the request's video and photo options, and reads only each eligible item's id, path, play count, and last played; the picked item is read by id. Direct play reads one item and its source. Tag-editor model reads and tag-editor writes (item tags, categories, tags, and auto-tag apply) update those rows. The source list and source enable and disable read those rows. The tag table is the catalog's tag list. An item can still hold a tag name that is not in that table. Favorite, blacklist, record-playback, and clear-stats update those rows. Library stats are one SQL pass grouped by source id and media type and include the loudness baseline. A single-item read returns one row by id or path. An item-state read returns only the requested paths. An empty path list returns no items. Auto-tag scan and duplicate scan read catalog rows. Duplicate apply deletes the non-kept rows. Source import inserts and updates catalog rows. Refresh writes the columns each stage owns. `GET /api/library/catalog-checkpoint` and server catalog backups write a standalone SQLite copy of `library.db`.
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
  - pairing/session/auth middleware and session store behavior, including the remote connections gate and pairing for `/api` routes only.
- `src/core/ReelRoulette.Server/Hosting/LocalRequest.cs`
  - the one localhost check: a direct connection from the server machine, never a proxied request or one with no remote address.
- `src/core/ReelRoulette.Server/Hosting/ProxyForwarding.cs`
  - forwarded headers applied from loopback only, and the `last.log` warning for forwarded headers from other addresses.
- `src/core/ReelRoulette.Server/Hosting/WebRuntimeConfig.cs`
  - `/runtime-config.json` payload: URLs from the caller's scheme and host, pairing token only for an accepted caller.
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
- control-plane auth in `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (localhost trusted, as `LocalRequest` decides; every other address needs the control token) and control token generation in `CoreSettingsService`,
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

WebUI is runtime-config-driven API/SSE client orchestration. Its screens are moving from `app.js` to Preact components over `@preact/signals` shared state.

- `src/clients/web/ReelRoulette.WebUI/src/app.js`
  - the screen not yet moved to a component: the tag overlay with **Edit Tags** + **Auto Tag** API flows. Reads and writes shared state through the store, acts on store and server connection events, calls the player to pause and resume for the tag editor, and uses the library's loaded window for tag saves and item-tag events.
- `src/clients/web/ReelRoulette.WebUI/src/ui/App.tsx`
  - page root: header, the stage, status line, and mobile diagnostics, each screen in an error boundary; starts `app.js` right after the first render, then the server connection. Also the startup error page, which shows its message as text.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Header.tsx`
  - pairing prompt, header preset dropdown, randomization mode, photo duration, and now playing.
- `src/clients/web/ReelRoulette.WebUI/src/ui/StatusLine.tsx`
  - status line and the mobile diagnostics line.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Stage.tsx`
  - the fullscreen stage and its pseudo-fullscreen class, holding the player, the filter dialog, and the library overlay in their error boundaries and the tag editor, which stay inside the stage so they show in fullscreen. Escape closes the library overlay when it is open and otherwise leaves pseudo-fullscreen.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Player.tsx`
  - the media area: video, photo, empty state, and the controls over them; swipe and tap listeners (passive, added through a ref). The player sets the media elements' sources and `display` and the seek slider's value, so the component renders those once and never replaces the video element.
- `src/clients/web/ReelRoulette.WebUI/src/ui/LibraryOverlay.tsx`
  - the library overlay: header with the totals, search and sort toolbar, and a body that is either the grid's host, an element with no children that the grid controller fills and that stays while tiles show, or a loading, error, or empty message. The library sets the overlay's `display`, so the component renders it once. Click, Enter, or Space on a tile plays it.
- `src/clients/web/ReelRoulette.WebUI/src/ui/FilterDialog.tsx`
  - the filter dialog: header with the preset heading, Refresh, and Close; the General, Tags, and Presets tabs; and Clear all, Cancel, and Apply with its pending star. It renders from the filter dialog service and shows only while open; its panels stay empty until it first opens.
- `src/clients/web/ReelRoulette.WebUI/src/ui/LegacyOverlays.tsx`
  - the tag editor markup `app.js` still owns, rendered once and never updated.
- `src/clients/web/ReelRoulette.WebUI/src/ui/ScreenBoundary.tsx`
  - per-screen error boundary: a screen that fails to render stops showing and relays `ui-error screen=<name> error=<type>` to `last.log`.
- `src/clients/web/ReelRoulette.WebUI/src/state/appStore.ts`
  - shared state as signals (status line, playing item and history, loop and autoplay, presets and the header preset menu, applied filter, active preset, randomization mode, photo duration, compatibility block, pairing prompt), the item-state cache, and the actions and events that cross screens, including the Edit Tags button's request to open the tag editor still in `app.js`; status changes relay to `last.log`, a repeat at most once a second.
- `src/clients/web/ReelRoulette.WebUI/src/state/serverConnection.ts`
  - version and capability check, pairing, preset loading, the event stream, and reconnecting on focus, visibility, page show, and coming online; passes server events to the player, the library, and `app.js`.
- `src/clients/web/ReelRoulette.WebUI/src/state/serverCompatibility.ts`
  - the supported server API versions and required capabilities, and the status message for a server that fails them.
- `src/clients/web/ReelRoulette.WebUI/src/state/appApi.ts`
  - API URLs, JSON posts and reads (a 401 shows the pairing prompt), and the client log relay.
- `src/clients/web/ReelRoulette.WebUI/src/state/appServices.ts`
  - builds one page's store, API, server connection, player, fullscreen, library, and filter dialog from the runtime config; the library after the player, so the player handles an item-state event first.
- `src/clients/web/ReelRoulette.WebUI/src/playback/player.ts`
  - playback: plays the current item (sets the source and shows the element, then loop and mute, then `play()`), random pick, Previous and Next through history, play/pause, mute, loop, autoplay and the photo timer, favorite and blacklist, seek and the time display, the tag editor's pause and resume, and item-state events with their status line. Records a play on start unless the server already did, and relays playback steps to `last.log` without file names.
- `src/clients/web/ReelRoulette.WebUI/src/playback/stageFullscreen.ts`
  - fullscreen for the stage through the Fullscreen API, and pseudo-fullscreen on iPhone and iPad or when the browser has no API or refuses.
- `src/clients/web/ReelRoulette.WebUI/src/playback/mediaGestures.ts`
  - swipe left and right for Next and Previous, a tap to show or hide the controls, and ignoring the click that follows either.
- `src/clients/web/ReelRoulette.WebUI/src/playback/nowPlaying.ts`
  - now-playing name, tooltip, and duration, and the m:ss time format.
- `src/clients/web/ReelRoulette.WebUI/src/library/library.ts`
  - the library overlay's state and actions: the first page once the server is ready, open and close (shows the overlay, then flushes the grid's deferred layout), the toolbar, totals, direction label, and body as signals, search with its wait, sort, fill from the grid's coverage while open, favorite, playback, refresh, resync, and header filter events, and tile play through `POST /api/play/{itemId}`, which joins history, closes the overlay, and hands the item to the player.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterStateModel.ts`
  - filter JSON serialize/parse aligned with desktop/server `FilterState`.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterDialog.ts`
  - the filter dialog's state and actions: open (loads sources, the tag model, and presets, then starts from the applied filter, the header's preset, and its None hold), the working copy with the heading and Apply's pending star worked out after each change, General, Tags, and preset edits, collapsed categories kept in `sessionStorage`, Refresh, Clear all, a header preset change while open, and Apply, which saves a changed preset list, applies the filter, updates the header, and starts the library over.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterDialogModel.ts`
  - the General tab's fields as a draft beside the working filter and their reading into it, duration checks, include and exclude toggles, the Tags tab's categories with Uncategorized for filter tags the catalog does not have, and preset rows from the API.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryOverlayModel.ts`
  - the library overlay's loading, error, and empty messages, and projection summary parsing.
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
- `src/clients/web/ReelRoulette.WebUI/src/playback/randomPick.ts`
  - the random pick request body, which names the header's preset only while its filter still equals the applied filter, and random pick requests, one at a time, cancelled after 10 seconds without an answer; an answer that arrives after that is not used.
- `src/clients/web/ReelRoulette.WebUI/src/library/currentItemState.ts`
  - the playing item's favorite and blacklist from item-state events, and the per-item cache applied when an item plays again, both by item id.
- `src/clients/web/ReelRoulette.WebUI/src/shell.tsx`
  - mounts the page (`renderApp`, which returns an unmount function) and the startup error into `#app`.
- `src/clients/web/ReelRoulette.WebUI/src/main.ts`
  - bootstrap entrypoint.
- `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts`
  - client and session ids (`rr_clientId` in `localStorage`, `rr_sessionId` in `sessionStorage`), client type and device name, and `requestPlayItem` for library tile play.
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
  - screen tests under `src/test/screens/` mount the page in `happy-dom` against a fake server and event stream (`pageHarness.ts`).
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
- `tools/scripts/reset-checklist.ps1` (resets `docs/checklists/testing-checklist.md` metadata/checklist state, fills Release version from `.version` without its `-dev.N` suffix, and removes `Failed:`, `Skipped:`, and `Pending:` notes; preserves waived checks by default, supports `-RemoveWaived`)

Web verification:

- `tools/scripts/verify-web-deploy.ps1`
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` (headless Velopack Linux server AppImage: curls `/health`, `/api/version`, `/control/status`, `/operator`; builds an AppImage locally when no path is passed)

Packaging and release:

- `.github/workflows/release.yml` (Velopack matrix build/pack/upload to B2; stable GitHub mirror of `Setup.exe` / `.AppImage` only; sole shipping pipeline)
- `tools/scripts/stage-webui-assets.ps1`
- shared icon assets: `assets/HI.ico`, `assets/HI-256.png`, `assets/HI-512.png`

CI:

- `.github/workflows/ci.yml`
