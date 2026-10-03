# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. v0.14.0 closes the M10 series; each later release becomes a new `M*` series when it is promoted.

- **v0.14.0 — Cleanup and polish**: Finish the SQLite migration cleanup, fix the defects found since, cut redundant client and refresh event work, and close the control plane to the LAN without a token. M10j1, M10j2, M10j3, M10j4, M10j5, M10j6, M10j7, M10j8, M10j9, M10j10, M10j11, M10j12, M10j13, M10j14.
- **v0.14.1 — Performance**: Make library browse, window reloads, and random selection cheap on large catalogs, keep desktop thumbnail memory bounded, and identify items by ID in every event and response. P29a, P29b, P29c, P29d.
- **v0.15.0 — Operator administration**: Move source, item, and catalog administration into a tested Operator so a server plus WebUI install does not need the desktop app. P26a, P26b, P26c, P26d, P26e, P25.
- **v0.15.1 — Structured log foundation**: Write `last.log` as structured JSON Lines through one server writer and give both clients a typed, privacy-safe log API. P27a, P27b.
- **v0.16.0 — Accounts**: Require an account PIN from LAN and remote clients, with HTTPS through a reverse proxy and per-user source access. P28a, P28b, P28c, P28d, P28e, P28f, P28g, P28h, P28i, P28j, P28k, P28l.
- **v0.17.0 — Structured log migration and Log Viewer**: Move every desktop, server, and WebUI log to the structured API and give the Operator a filterable Log Viewer. P27c, P27d, P27e, P27f, P27g.
- **v0.18.0 — Playback sessions**: Let the server choose direct, remux, or transcode playback per session for desktop and WebUI. P2a, P2b, P2c, P2d, P2e, P2f, P2g, P2h.
- **Unscheduled backlog**: P1, P3, P4, P5, P6, P7, P9a, P9b, P10, P20, P30, P31, P32.

## Document Purpose

Use this file for:

- milestone status (⏳ Planned | 🚧 In Progress | ✅ Complete),
- scope and acceptance criteria,
- verification evidence and explicit deferrals.

Do not use this file for detailed architecture explanation or current capability inventory.

## Ownership Boundaries

- `MILESTONES.md`: roadmap, milestone scope, acceptance gates, verification evidence.
- `CONTEXT.md`: current implemented capabilities across server/desktop/web/operator.
- `AGENTS.md`: agent workflow, boundaries, and doc-discipline rules.
- `docs/domain-inventory.md`: ownership-first implementation surface map.
- `README.md` + `docs/dev-setup.md`: run/setup/verify instructions.
- `docs/api.md` + `shared/api/openapi.yaml`: API behavior and contract source of truth.

## Maintenance Rules

- Keep entries **current-state accurate**: update statuses and evidence as work progresses.
- Keep scope locked to milestone intent; record out-of-scope items as explicit deferrals.
- Organize milestone sections as:
  - `## Planned Releases`: the release outline at the top of this file; keep it in sync when milestones are added, moved, promoted, completed, or removed.
  - `## Active Milestones`: milestones currently being worked, using `M*` IDs in historical order.
  - `## Planned Milestones`: backlog candidates not yet started, using `P*` IDs in numerical order (for example base phases and lettered sub-slices).
  - `## Completed Milestones`: archive of finished milestones, newest completions first.
- Keep `## Active Milestones` updated with `Last milestone completed: Mx` so the next `M*` assignment is unambiguous.
- When promoting planned work to active work, assign the next `M*` ID at promotion time and keep planned `P*` IDs stable until then. Promote a planned release as a new `M*` series, with lettered milestones in its outline order.
- When a milestone is completed, move it to `## Completed Milestones` as-is: keep existing scope/acceptance/evidence detail unchanged except final-state corrections, and preserve newest completions first.
- In milestone body content (scope/acceptance/evidence/deferrals), do not reference milestone IDs; use milestone names/descriptions (or "this milestone"/"this series") so ID reassignment does not require copy edits.
- ID references are allowed only in milestone section headers, the `Last milestone completed: Mx` tracker line, and the `## Planned Releases` outline.
- `Depends on` lines name milestones by their exact titles, which `check-milestones.ps1` enforces.
- Keep acceptance criteria testable and outcome-focused (avoid implementation-narrative bloat).
- Keep verification evidence concrete:
  - commands/checks run,
  - artifacts/docs updated,
  - waivers/deferrals explicitly called out.
- Avoid duplicating architecture/runtime detail already owned by `CONTEXT.md` and docs under `docs/`.
- Prefer referencing owning docs instead of copying long explanatory sections into this file.
- Keep historical entries intact except for final-state correction of inaccurate facts.
- If script names/paths/contracts change, update milestone references to avoid stale guidance.

## Milestone Template

### Mx - {Milestone Title}

- **Status**: ⏳ Planned | 🚧 In Progress | ✅ Complete
- **Goal**: {one concise outcome statement}
- **Scope**:
  - {key deliverable 1}
  - {key deliverable 2}
  - {key deliverable 3}
- **Acceptance criteria**:
  - {testable outcome 1}
  - {testable outcome 2}
  - {testable outcome 3}
- **Verification evidence**:
  - {automated checks run}
  - {manual checks/evidence notes}
  - {docs/artifacts updated}
- **Deferrals / Follow-ups**:
  - {deferred item -> target milestone}

### Px - {Planned Milestone Title}

- **Status**: ⏳ Planned
- **Goal**: {one concise outcome statement}
- **Scope**:
  - {key deliverable 1}
  - {key deliverable 2}
  - {key deliverable 3}
- **Acceptance criteria**:
  - {testable outcome 1}
  - {testable outcome 2}
  - {testable outcome 3}
- **Verification evidence**:
  - {automated checks run}
  - {manual checks/evidence notes}
  - {docs/artifacts updated}
- **Deferrals / Follow-ups**:
  - {deferred item -> target milestone}

---

## Active Milestones

Last milestone completed: M10j4

### M10j5 - Seed Tests Through SQL

- **Status**: ⏳ Planned
- **Goal**: Tests build their catalog in `library.db` directly, so removing `library.json` support does not touch what they check.
- **Scope**:
  - Ships in v0.14.0. Test-only. No product change.
  - Measured during v0.14.0 planning: with startup `library.json` migration switched off, 81 tests fail because they seed through `library.json`. By class: `LibraryOperationsServiceTests` 23, `LibraryCatalogStoreTests` 21, `RefreshPipelineServiceTests` 17, `LibraryPlaybackServiceTests` 12, `LibraryArchiveMigrationTests` 4, `LibraryListQueryTests` 2, `LibraryCatalogSessionTests` 1, `PlayItemOrchestrationTests` 1.
  - Add one test seeding helper that creates a schema version 2 catalog and writes sources, categories, tags, items, item tags, and presets with SQL.
  - Move every test that seeds through `library.json` to that helper, except tests whose subject is `library.json` migration or recognition. Those stay unchanged until the removal milestone deletes them.
  - Each moved test checks the same thing as before.
- **Acceptance criteria**:
  - With startup `library.json` migration switched off on a scratch copy, the only failing tests are those whose subject is `library.json` migration or recognition.
  - No test outside that set writes `library.json`.
  - The test count and pass count are unchanged on the real code.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include `dotnet test ReelRoulette.sln` before and after, and the scratch-copy run with migration switched off listing the remaining failures.
- **Deferrals / Follow-ups**:
  - None yet.

### M10j6 - Remove library.json Library Support

- **Status**: ⏳ Planned
- **Goal**: Remove `library.json` as a library format, the schema 1 catalog migration, and the side-file copy in v0.14.0, so the catalog store only opens or creates a schema version 2 `library.db`.
- **Scope**:
  - Depends on: Seed Tests Through SQL.
  - Ships in v0.14.0.
  - Startup does not look for `library.json` or `library.json.migrated`. Those files do not change open, refuse, or empty-catalog behavior. A missing `library.db` creates an empty catalog with SQL, not by parsing an empty document, whether or not `library.json` is present. `library.json` is left untouched. A healthy `library.db` opens. A corrupt `library.db` is quarantined and startup refuses with the same result it uses when those files are absent. They are not read, not a restore path, and not deleted. Startup and user-facing strings do not mention either file.
  - Delete the JSON-to-SQLite importer, including `PrepareIncomingFromJson`. Tests build a catalog in `library.db`. They do not write `library.json` to create one.
  - Also remove the schema 1 to schema 2 migration and the `presets.json` / `index.json` side-file copy. This overrides the earlier decision to keep the schema 1 migration: no release ever wrote a schema 1 catalog. Release builds before v0.13.0 had no catalog, and the first build after schema 1 was introduced already wrote schema version 2. That removes `LibraryCatalogStore.SideFiles.cs`, `PreviousSchemaVersion`, the schema 1 table list and health branch, the `side_files_copied` key handling, `AfterSideFileCopy`, the open result's migrated-schema flag, and the server's migrated-schema log line. A `library.db` at schema version 1 is treated like any other database with an unrecognized schema. An existing `side_files_copied` row in a catalog is left in place and not read. `presets.json`, `index.json`, and their `.migrated` copies are left untouched.
  - Remove the desktop `LibraryArchive` JSON helpers: `LibraryJsonHasContent` in the overwrite check and `RetireUnmigratedLibraryJson` after import.
  - Import already has no `library.json` path and no zip. A file that is not a library database is rejected. A `.db` import still remaps sources. Export and catalog backups stay on `library.db`.
  - Update current-state docs and the testing checklist to say `library.json` library support is removed, including the checklist item that a v0.12.0 library migrates on first start.
  - Add a Release Specific checklist item: "On Windows, first start with no data folder, and with a data folder holding only `library.json`, opens an empty library."
- **Acceptance criteria**:
  - Startup does not migrate `library.json` and does not rebuild a catalog from `library.json.migrated`.
  - A missing `library.db` creates an empty healthy `library.db` at schema version 2 with SQL, whether or not `library.json` or `library.json.migrated` is present. Those files are left in place and are not read. No message mentions them.
  - A healthy `library.db` opens. A corrupt `library.db` is quarantined and startup refuses the same way whether or not those JSON files are present, and it is not repaired from them.
  - There is no JSON-to-SQLite importer and no `PrepareIncomingFromJson`. There is no schema 1 migration and no side-file copy. A missing database does not read `presets.json` or the thumbnail index, and those files are left in place.
  - A schema version 1 `library.db` is quarantined and refused like any other unrecognized database.
  - Desktop import does not read or rename `library.json`. A folder whose only library data is `library.json` does not ask for overwrite confirmation.
  - There is no `library.json` import path and no deprecation message for that format. A `.db` import still remaps sources.
  - A file that is not a library database is not imported, including a file that used to be a `library.json` archive. Import does not replace the live catalog.
  - Startup messages and user-facing copy do not mention `library.json` or `library.json.migrated`.
  - Docs and the testing checklist describe `library.json` library support as removed in v0.14.0.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include tests that a missing database creates an empty schema version 2 database with SQL whether or not `library.json` or `library.json.migrated` is present and leaves those files untouched, does not read `presets.json` or the thumbnail index, a healthy database opens with those JSON files present, a corrupt database is refused the same way with or without them, a schema version 1 database is refused, a file that is not a library database is not imported, a `.db` import still remaps sources, and desktop import leaves `library.json` untouched.
  - Completion evidence must include one quick Linux spot check of first start with a data folder holding only `library.json`. The Windows first-start check is the Release Specific checklist item above, run in the pre-release pass.
  - Docs evidence must include current-state and checklist updates that `library.json` library support is removed in v0.14.0.
- **Deferrals / Follow-ups**:
  - Release notes for v0.14.0 must say: users on v0.12.0 or earlier must start v0.13.0 once before updating to v0.14.0, because v0.14.0 does not convert `library.json`.
  - Release notes for v0.14.0 must give the recovery steps for anyone who updated straight from v0.12.0 and sees an empty library: delete the new `library.db`, start v0.13.0 once to convert `library.json`, then update to v0.14.0 again.
  - Scrubbing every remaining `library.json` mention from product code, comments, user-facing copy, tests, and current-state docs is the next milestone.
  - Operator export and import stay with Operator Library Catalog Transfer. That transfer is a `library.db` checkpoint.
  - Accounts stay with the Account Store work, in their own store outside `library.db`.

### M10j7 - Scrub library.json From the Product

- **Status**: ⏳ Planned
- **Goal**: Make product code, comments, user-facing copy, tests, and current-state docs read as if a JSON library, a schema 1 catalog, and a catalog document never existed.
- **Scope**:
  - Depends on: Remove library.json Library Support.
  - Ships in v0.14.0.
  - Product code, comments, user-facing copy, tests, and current-state docs do not mention `library.json`, `library.json.migrated`, or a legacy flat tag list.
  - They also do not mention the catalog document (for example "does not load the full catalog document" in `docs/api.md`, `docs/architecture.md`, `CONTEXT.md`, and the description text in `shared/api/openapi.yaml`), schema 1 or a schema 1 migration, `presets.json`, or the thumbnail `index.json`.
  - Remove the `docs/feature-migration.md` §3.17 Tag-Catalog Migration Wizard entry, whose dialog is gone.
  - Fix the other `docs/feature-migration.md` sections the planned-milestones audit found stale:
    - The header says no Operator UI project exists. The Operator page exists, served by the server at `/operator`.
    - §3.1 says WebUI click-to-play is not implemented and describes a projection refetch on open. The WebUI library overlay plays on click and browses through the list query.
    - §3.2 says the WebUI lacks the category, tag, duration, and source filter UI. The WebUI filter overlay has it.
    - §3.9 says Manage Sources calls `/api/sources/*` for every action. There are no rename or remove routes.
    - §3.11 says Auto Tag has no web equivalent. The WebUI tag overlay has an Auto Tag tab.
    - §3.12 says tag rename has no web equivalent. The WebUI tag editor renames tags.
    - §3.16 says item removal is backed by a server API. There is no item removal route.
    - §3.18 names `/control/log`. The route is `/control/logs/server`.
  - Fix three `CONTEXT.md` claims the audits found wrong:
    - It says the service worker lets Android Chrome install the WebUI. The worker registers only in a secure context and the server serves plain HTTP, so on a LAN address Chrome offers only a shortcut. Say that installing on Android needs HTTPS, for example through a reverse proxy.
    - It lists remove among the desktop grid's working bulk actions. Remove from Library has no server route and is hidden by the dead code removal milestone.
    - It lists reconnect recovery with `Last-Event-ID` as an SSE capability without naming a client. Found by the efficiency and divergence report: only the desktop resumes with the last event ID. The WebUI opens a new event stream with no last event ID after an error, so it gets neither the missed events nor `resyncRequired`. Say that only the desktop resumes; the client event efficiency milestone updates it when the WebUI does.
  - Remove leftover comments that describe removed or "legacy" paths, such as the disabled legacy tag migration dialog and legacy local-authority comments in `MainWindow.axaml.cs` and the legacy view-model comment in `FilterDialog.axaml.cs`. Code that is still live keeps its name; `AllowLegacyTokenAuth` stays with the auth cutover.
  - Add the desktop flows that still run locally to `docs/domain-inventory.md`, which `AGENTS.md` says it records: library database import writing the server's `library.db` from the desktop process, whole-list preset writes, preset-match heading comparison, refresh status summary parsing, and the client-owned flows that stay local by design (local-first playback, loudness baseline choice, desktop settings backups, Show in File Manager).
  - Core settings and desktop settings stay JSON. Presets and thumbnail revision, width, and height stay in the catalog. JPEG files stay in the local thumbnail directory.
  - Do not rewrite released changelog sections, completed milestone entries, `docs/full-audit.md`, `docs/velopack-migration-audit.md`, or `docs/migration-cleanup.md`. The unreleased changelog may record that the format was removed.
  - Update the testing checklist so it does not mention those names.
- **Acceptance criteria**:
  - Product code, comments, user-facing copy, tests, and current-state docs do not mention `library.json`, `library.json.migrated`, a legacy flat tag list, the catalog document, schema 1, `presets.json`, or the thumbnail `index.json`.
  - `docs/feature-migration.md` has no Tag-Catalog Migration Wizard entry, and its header and §3.1, §3.2, §3.9, §3.11, §3.12, §3.16, and §3.18 match the current WebUI, Operator, and routes.
  - `CONTEXT.md` does not claim Android install works over plain HTTP, that the desktop can remove items from the library, or that the WebUI resumes its event stream with the last event ID.
  - `docs/domain-inventory.md` lists the desktop flows that still run locally and says which are local by design.
  - Core settings and desktop settings stay JSON. Presets and thumbnail metadata stay in the catalog. JPEG files stay local.
  - Released changelog sections, completed milestone entries, and the historical audit and migration notes named above are left as written.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include a search of product code, comments, user-facing copy, tests, and current-state docs that finds none of those names, plus a build, tests, and `npm run verify` after the scrub.
  - Released changelog sections, completed milestone entries, `docs/full-audit.md`, `docs/velopack-migration-audit.md`, and `docs/migration-cleanup.md` are left as written.
- **Deferrals / Follow-ups**:
  - Accounts stay with the Account Store work, in their own store outside `library.db`.

### M10j8 - Post-Migration Fixes

- **Status**: ⏳ Planned
- **Goal**: Fix defects left from the move to the server-owned catalog and two places where desktop and WebUI disagree, and close the control plane to unauthenticated LAN callers, one slice per defect, each with a test that fails before the fix.
- **Scope**:
  - Ships in v0.14.0. Ten slices, each verified on its own.
  - Source list after source import (server):
    - Recorded as a deferral on catalog document removal: source import does not refresh the in-memory source list that `GET /api/sources` and source enable/disable read. That list is filled at startup.
    - Confirmed during v0.14.0 planning by a throwaway test: after a successful import, the server's source list still had 0 sources and disabling the new source failed until restart.
    - A newly imported source appears in `GET /api/sources` and can be enabled and disabled without a restart. Whether the list is refreshed after import or read from catalog rows is decided here.
  - Auto-refresh interval reschedule (server):
    - `POST /api/refresh/settings` writes through `CoreSettingsService` and skips `RefreshPipelineService.UpdateSettings`, so changing the auto-refresh interval or enabling auto-refresh does not reschedule the next run. Found by code reading and git history during v0.14.0 planning: the route has gone around the pipeline since the change that also split web runtime settings onto their own route.
    - Changing auto-refresh settings through the API schedules the next run from the new settings.
  - Catalog item tag assignment without field copy (Core):
    - `LibraryCatalogSession.AttachTags` replaces each tagged item with `CopyWithTags`, which lists every `LibraryCatalogItem` property by hand because `Tags` is init-only. Thumbnail revision, width, and height were added to the item without being added to that copy, so the list query returned no thumbnail dimensions for tagged items until the copy was fixed.
    - Let tags be assigned on an existing item (for example a settable `Tags`), have `AttachTags` set them in place, and remove `CopyWithTags` and its reflection test.
    - Related trap to check while there: `InsertItem` writes neither thumbnail columns nor tags from the item it is given. Every caller passes a new item today and thumbnails arrive later through `SetThumbnail`, so nothing is lost, but an item passed in with those fields set would silently drop them.
  - Desktop filter dialog Update Preset after preset delete (desktop):
    - In the desktop filter dialog, **Update Preset** can stay enabled after the active preset is deleted from the preset list, although no saved preset is left to update.
    - Found during review of the client-authority sync routes removal. The behavior existed before that work.
    - Likely cause, not confirmed: `DeletePresetButton_Click` clears the active preset name and refreshes the heading and pending state, but does not raise the `CanUpdatePreset` change notification.
    - The WebUI filter dialog has no Update Preset gate, so it is out of scope.
  - Desktop scan menu items (desktop):
    - **Scan Durations** and **Scan Loudness** check `Directory.Exists` on each source root on the desktop's own disk before asking the server to refresh. When the server runs on another machine, that check uses the wrong disk. The server decides which sources it can read.
    - Both items request the server refresh without a local folder check, and their status and log text no longer names a single source folder.
  - Desktop media type from the server (desktop):
    - Found by the efficiency and divergence report: the desktop decides whether the playing file is a photo or a video from its file extension, in `PlayMedia` and in the file-not-found message in `PlayFromPath`, using its own copy of the photo extension list. The playback response already carries the server's `mediaType`, and the WebUI uses it.
    - The desktop uses the server's media type for the playing item, and its photo and video extension lists are removed. The server keeps the only extension lists.
  - Sort direction labels (desktop and WebUI):
    - Found by the efficiency and divergence report: the two clients label the same sort direction differently. The WebUI shows `Newest → Oldest`, `A–Z`, and `Z–A`; the desktop shows `Newest -> Oldest`, `A-Z`, and `Z-A`.
    - Both clients use the WebUI's labels, with `→` and `–`. Check that the desktop font renders both characters in light and dark themes.
  - Numeric preset durations on the desktop (desktop):
    - Found while removing the preset match route: the desktop reads saved preset text with `JsonSerializer.Deserialize<FilterState>`, which throws on a numeric `minDuration` or `maxDuration` (seconds). `ParseCorePresetFilterState` then falls back to the default filter, so that whole preset is read as **None**. The WebUI and server filtering accept seconds, and `docs/api.md` documents them.
    - The desktop reads a numeric duration as seconds. Add a `"minDuration": 60` against `"00:01:00"` entry with `same: true` to `shared/fixtures/preset-filter-equality.json`; it fails on the desktop until the fix.
  - Fingerprint parallelism after a forced rescan (server):
    - Found by code reading while documenting the refresh settings: `RefreshPipelineService.ConsumeRefreshRescanFlags` clears a force flag by building a new `RefreshSettingsSnapshot` from auto-refresh enabled, interval, and the two force flags only. `FingerprintScanMaxDegreeOfParallelism` falls back to its default of 4, so a forced duration or loudness rescan resets a saved value such as 8.
    - Clearing a force flag keeps every other refresh setting.
  - Control token for non-localhost control requests (server and Operator):
    - Found by the planned-milestones audit and still accurate in `docs/full-audit.md` finding 1 (`/control/*` admin plane unauthenticated when `AdminAuthMode != "TokenRequired"`): with LAN binding on, the admin auth mode defaults to `Off`, so any LAN caller can stop, restart, or update the server, change settings, and run testing scenarios. First start writes that `Off` into `core-settings.json`, so changing the default alone would leave existing installs open.
    - `docs/full-audit.md` finding 19 (`OperatorTestingService` mutations protected only by middleware policy) also still holds: the testing routes check the token themselves and do not exempt localhost, so requiring the token would lock the Operator's own testing panel out on the server machine.
    - Every non-localhost control request needs the control token. There is no `Off` for non-localhost requests: a persisted `Off` no longer opens the control plane to the LAN, and the Operator settings no longer offer it. Whether the admin auth mode field leaves `/control/settings` or stays read-only is decided here; removing it is its own contract slice.
    - Localhost stays trusted for every control route, including the testing routes.
    - A server with no control token generates one on start and saves it.
    - How a browser on another machine gets in: `/operator` still loads, and when its first control read returns `401`, the page shows only a control token prompt in place of the other sections. Submitting it posts to `POST /control/pair`, which sets the admin cookie, and the page then loads normally. The token is shown in the Operator settings opened on the server machine. For a headless server with no local browser, the docs say where `core-settings.json` keeps it. The page does not put the token in the URL.
    - A reverse proxy on the server machine still looks like localhost; that is fixed with reverse proxy support in the accounts release.
    - Add a Release Specific checklist item: "From another machine, the Operator asks for the control token, works after it is entered, and refuses a wrong one; on the server machine it opens without one, testing panel included," on Linux and Windows.
- **Acceptance criteria**:
  - A source imported through `POST /api/sources/import` appears in `GET /api/sources` and can be enabled and disabled before a restart.
  - Changing auto-refresh enabled or interval through `POST /api/refresh/settings` moves the next scheduled run to match the new settings.
  - No code rebuilds a `LibraryCatalogItem` from another one field by field. The list query and single-item read return the same item fields for tagged and untagged items, including thumbnail revision, width, and height. `InsertItem` either writes every field it is given or its contract says which fields it ignores.
  - After deleting the active preset while the heading shows a starred preset, **Update Preset** is disabled and the heading shows **None** or `None*`. Deleting a preset that is not active leaves **Update Preset** as it was. A headless desktop filter dialog test covers deleting the active starred preset and fails without the fix.
  - Scan Durations and Scan Loudness do not read source folders on the desktop's disk and start a server refresh when the server is reachable.
  - After a forced duration or loudness rescan clears its flag, `fingerprintScanMaxDegreeOfParallelism` keeps its saved value.
  - A non-localhost control request without the control token gets `401`, including with `Off` saved in `core-settings.json`. Localhost control requests, including the testing routes, work without it.
  - A server that has no control token creates and saves one on start.
  - On another machine, the Operator shows only the token prompt until a valid token is entered, then works; on the server machine it opens directly.
  - The desktop decides photo or video for the playing item from the server's media type, including when that type disagrees with the file extension, and has no extension list of its own.
  - Every sort mode and direction shows the same label on desktop and WebUI, and the desktop renders `→` and `–`.
  - A saved preset with a numeric `minDuration` or `maxDuration` keeps its other settings on the desktop, and the shared preset equality fixture covers a numeric duration on both clients.
  - Each slice has a test that fails without its fix, or the evidence says why one cannot be written.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include each slice's failing test before the fix and passing after it, and `dotnet test ReelRoulette.sln` with the list-query test that covers a tagged and an untagged item with catalog-only thumbnail dimensions still passing.
  - The control token slice's tests must cover a non-localhost request with `Off` saved, a localhost testing-route request, token generation on start, and `POST /control/pair` setting the admin cookie. The cross-machine pass is the Release Specific checklist item above.
  - The media type slice's test must cover a playback response whose `mediaType` disagrees with the file extension. The sort label slice's tests must check every mode and direction on both clients against the same expected labels, plus one quick spot check of the desktop label in each theme.
- **Deferrals / Follow-ups**:
  - WebUI reaction to `sourceStateChanged` stays with WebUI Source State Sync.
  - Release notes for v0.14.0 must say that opening the Operator from another machine now asks for the control token, and where to find it.

### M10j9 - Client Event Efficiency

- **Status**: ⏳ Planned
- **Goal**: Library events cost the clients and server only the work they need: a loaded window reloads only when an event can change what it shows, the WebUI resumes its event stream without losing events, the desktop does not refetch library stats once per event, and refresh progress does not send one event per file.
- **Scope**:
  - Ships in v0.14.0, right after the post-migration fixes. Four slices, each verified on its own.
  - Found and measured by the efficiency and divergence report on a copy of a 48,938-item catalog and 13 hours of `last.log`.
  - Patch-or-reload rule (desktop and WebUI, shared fixture):
    - Both clients reload every loaded window on a favorite or blacklist event while the filter has `favoritesOnly` or `excludeBlacklisted` (on by default), on a playback event while sorted by last played or play count or filtered to never played, and on a tag event while any tag filter is set. A reload re-reads the window in 200-item pages, one after another. Measured: reloading 5,000 loaded tiles sorted by last played takes 2.45 s and allocates 1.1 GB on the server, per event and per client. In one minute of real use, 31 WebUI plays caused 37 play-count-sorted library queries.
    - Reload the loaded window only when a field the event changed affects the current filter or sort; otherwise patch the tile. For example, a favorite on a loaded tile whose blacklist flag does not change patches under `excludeBlacklisted`, and a playback event under name sort patches. An event for an item that is not loaded reloads only when the change could bring it into the window.
    - Both clients implement the rule today in `LibraryPanelBrowse.EffectFor` and `libraryQueryTileEffect`, identically but with no shared fixture. Add a fixture under `shared/fixtures/` listing event kind, the fields that changed with before and after values, whether the tile is loaded, filter, and sort, with the expected patch or reload. Desktop and WebUI tests both run against it.
  - WebUI event stream resume (WebUI, with one server fix):
    - The WebUI's live event stream in `app.js` opens a new `EventSource` on every error, with no last event ID. It receives neither the events published while it was away nor `resyncRequired`, so it shows stale favorites, tags, and playback until something else reloads. The desktop resumes with the last event ID.
    - `events/sseClient.ts` already tracks the last revision and builds the stream URL with it, but only its test uses it. Wire it into the WebUI and remove the duplicate `EventSource`, reconnect timer, and stream URL code in `app.js`.
    - `sseClient.ts` listens only for `refreshStatusChanged` and `resyncRequired`. It needs to carry every event type `app.js` handles today, with the same handling.
    - `sseClient.ts` has its own connection status wording. The WebUI keeps the connection messages `app.js` shows today; the client status line overhaul defines them.
    - `sseClient.ts` reconnects when no event arrives for 30 seconds, and the server sends no keepalive, so an idle stream would reconnect every 30 seconds. Decided here: add a periodic keepalive comment to the server's event stream, or drop the watchdog.
    - Server fix found while planning this slice, from code reading: the server's revision counter starts over when it restarts, and a reconnect whose last event ID is ahead of the current revision gets no replay and no `resyncRequired`. Treat a last event ID ahead of the current revision as a gap and send `resyncRequired`.
    - Update `CONTEXT.md` to say both clients resume with the last event ID.
  - Desktop library stats coalescing (desktop):
    - The desktop refetches `GET /api/library/stats` from the playback, favorite, and blacklist event handlers, from the current-file read, and after other actions, once per call. Measured: 1,723 stats fetches in 13 hours, and 116 fetches for 31 WebUI plays in one minute, about 3.7 per play. Each fetch costs about 138 ms of server time under the lock the list query and item updates also take.
    - Coalesce them: at most one stats request in flight, a short delay to gather a burst of events, and one more request when events arrived while a request was in flight. Totals stay server-computed; the desktop does not add play counts or favorite counts itself.
  - Refresh progress throttling (server):
    - The fingerprint and thumbnail stages publish progress at most every 400–500 ms. The duration and loudness stages publish one `refreshStatusChanged` event per file they scan. A forced rescan of the 17,307 videos in the measured catalog sends about 17,000 events per stage, which overflows the server's 256-event replay history, so a client that reconnects during the scan gets `resyncRequired` and reloads its window.
    - Throttle duration and loudness progress the same way as the fingerprint and thumbnail stages, and keep the stage completion event and its final counts.
  - Add a Release Specific checklist item: "With the WebUI open, stop and restart the server, change a favorite and a tag on the desktop while the WebUI reconnects, and the WebUI shows both."
- **Acceptance criteria**:
  - Desktop and WebUI patch-or-reload tests read the same fixture, and changing an expected result in it fails both.
  - Under the default filter and name sort, a favorite on a loaded tile and a playback event patch the tile and do not query the library.
  - An event that can change which items are shown or their order still reloads the loaded window, keeping the scroll position.
  - After the WebUI's event stream drops and reconnects, the events published in between are applied, or the WebUI receives `resyncRequired` and reloads.
  - After a server restart, a reconnecting client whose last event ID is ahead of the server's revision receives `resyncRequired`.
  - The WebUI has one event stream implementation, and an idle stream does not reconnect on its own.
  - A burst of playback events on any client causes at most two desktop stats requests, and the desktop header totals match `GET /api/library/stats` once the burst settles.
  - A duration or loudness stage over N files publishes at most one progress event per throttle interval plus its completion event, and the completion message reports the same counts as before.
  - `CONTEXT.md` says both clients resume their event stream with the last event ID.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include `dotnet test ReelRoulette.sln`, `npm run verify`, a check that a flipped fixture entry fails both the desktop and WebUI tests, a WebUI test that a reconnect sends the last event ID and applies replayed events, a server test for a last event ID ahead of the current revision, a desktop test counting stats requests for a burst of events, and a server test counting progress events for a duration and a loudness stage.
  - Completion evidence must include the stats fetch count from `last.log` for the same kind of WebUI playback burst, before and after, and one quick spot check of a WebUI reconnect.
  - The full outage pass is the Release Specific checklist item above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - Making each reload cheaper (one request for the loaded window, indexed sort, no counts on later pages) is the library query performance milestone.
  - Matching event items by ID instead of by path is the item IDs in the contract milestone.

### M10j10 - Desktop Player View and Fullscreen Fixes

- **Status**: ⏳ Planned
- **Goal**: Desktop keyboard shortcuts work in player view and fullscreen, the video fills the screen without leftover layout, and every video starts with the sound the mute button shows.
- **Scope**:
  - Ships in v0.14.0. Two slices, each verified on its own: player view and fullscreen, then sound on video start.
  - Player view and fullscreen slice:
    - Three related problems, all existing behavior, not regressions. Found in the v0.13.0 manual regression pass.
    - Keyboard shortcuts (**P**, **F11**, and the rest) stop working while the pointer is over the video. With player view and fullscreen combined, the video fills the screen, so neither can be exited from the keyboard.
      - Likely cause, not confirmed: the embedded VLC video surface takes keyboard input. The desktop never sets LibVLC's `EnableKeyInput` or `EnableMouseInput`, so both are on by default. Try turning them off so input reaches the app.
    - Player view leaves a thin divider line from the normal layout at the top of the screen.
      - Moving the pointer onto that line is currently the only way to make shortcuts work again in fullscreen player view, so fix the keyboard problem first or together with this one, never after.
    - The video does not always resize to fill the screen in fullscreen or player view.
    - Add a Release Specific checklist item: "With the pointer over the video, every shortcut works and the video fills the screen in normal, player view, fullscreen, and both combined," on Linux and Windows.
  - Sound on video start slice:
    - Videos sometimes start with no sound on desktop after random play, next, or previous, while the mute button shows unmuted. Muting and unmuting restores sound. The WebUI, which plays through the browser's own video element, is unaffected. Existing behavior: the volume and mute code is unchanged since v0.12.0.
    - Likely cause, not confirmed: `PlayMedia` sets volume and mute only before LibVLC creates the new audio output (before and right after `Play()`, which returns before the output exists), and never after playback starts. LibVLC documents that mute may not apply when no audio stream is active. The desktop does not listen to LibVLC's mute or volume events, so the button never learns the player is muted.
    - Log LibVLC's `Muted`, `Unmuted`, and `VolumeChanged` events, and the player's mute and volume just before reapplying, so `last.log` shows whether a new file's audio output came up muted.
    - Reapply volume and mute once playback has actually started: on `Playing`, and again on the first seek-timer tick where playback time advances, once per new media and not on resume from pause. Cover the loop-toggle media rebuild and the other player rebuild path, which do not reapply mute today.
    - Fix the first-video volume check in `PlayMedia`, which reads the player's volume after `Play()`, before an audio output exists.
    - Add a Release Specific checklist item: "Switching videos repeatedly with random, next, and previous never starts a video silently, and the mute button matches what you hear," on Linux and Windows.
- **Acceptance criteria**:
  - With the pointer over the video, every keyboard shortcut works in normal, player view, fullscreen, and combined player view and fullscreen.
  - Combined player view and fullscreen can be exited from the keyboard.
  - Player view shows no divider line or other leftover layout.
  - The video fills the screen in fullscreen and player view, including after switching between them and after the window is resized.
  - Existing mouse interaction on the video, such as the scroll wheel, still works.
  - After random play, next, previous, autoplay, and the loop-toggle rebuild, volume and mute are reapplied once playback has started, and not again on resume from pause.
  - `last.log` records LibVLC mute and volume events and the player's mute and volume before each reapply.
  - The first-video volume check does not read the player's volume before an audio output exists.
  - A saved mute still applies: with the app muted, switching videos stays silent and the button shows muted.
- **Verification evidence**:
  - Completion evidence must include automated tests where they reach the behavior (for example the LibVLC input options, the player view layout in a headless window, and the once-per-media reapply rule), `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, and one quick Linux spot check per slice: shortcuts with the pointer over the video in fullscreen player view, and a few video switches with sound.
  - The Linux and Windows passes of every view combination and of repeated video switching are the two Release Specific checklist items above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - None yet.

### M10j11 - Tag UI Polish

- **Status**: ⏳ Planned
- **Goal**: Tag chips, tag editor controls, and the Auto Tag dialog look and respond the same on desktop and WebUI.
- **Scope**:
  - Ships in v0.14.0. Four slices, one per surface change, each verified on its own.
  - WebUI light mode tag chips and tag editor buttons:
    - Found in the v0.12.0 manual regression pass: in light mode, tag chip text in the filter Tags tab and the tag editor is black, and the tag editor buttons outside the tag grid stay white instead of switching to dark.
    - Dark mode stays as it is.
  - Desktop tag chip toggle state:
    - Found in the v0.12.0 manual regression pass: in the desktop tag editor, a tag chip's toggle state does not change when the tag is added or removed, so there is no visual feedback. The chip should change to the accent color (HugginsOrange) when applied.
    - The WebUI tag editor is the reference for the toggle states.
  - Desktop Auto Tag busy indicator:
    - While an Auto Tag scan runs, the WebUI shows an in-progress indicator, but the desktop shows nothing until results arrive.
    - Add an indeterminate busy indicator to the desktop Auto Tag dialog during the scan, matching the WebUI.
  - Desktop filter dialog collapse toggle styling:
    - In the desktop filter dialog's Tags tab, the per-category collapse toggle's arrow icon sits in the top-left of its button instead of centered, and the toggle is styled differently from the desktop tag editor's.
    - Make it match the tag editor's collapse toggle, as the WebUI's filter Tags tab and tag editor already do.
  - Add a Release Specific checklist item: "Tag chips, tag editor buttons, the Auto Tag busy indicator, and the filter collapse toggle look and respond the same on desktop and WebUI in light and dark themes."
- **Acceptance criteria**:
  - In WebUI light mode, tag chip text in the filter Tags tab and the tag editor is readable on every chip state, and the tag editor buttons outside the tag grid use light-theme colors. Switching the system theme while the tag editor is open updates both.
  - Adding a tag in the desktop tag editor shows that chip in the accent color right away, and removing it returns the chip to its normal state. Chips show the correct state when the editor opens, in both themes.
  - The desktop Auto Tag dialog shows an indeterminate busy indicator from the start of a scan until results arrive or the scan fails. The indicator matches the WebUI's in-progress indicator in placement and wording, and clears on success, failure, and closing the dialog.
  - The desktop filter dialog's collapse toggle arrow is centered in its button and matches the tag editor's collapse toggle in size, icon, and styling, collapsed and expanded, in both themes.
- **Verification evidence**:
  - Completion evidence must include automated tests where they reach the behavior (for example light-theme chip and button styles in the WebUI, the desktop chip state after add and remove, and the desktop Auto Tag busy indicator from scan start to result, failure, and close in a headless window), `dotnet test ReelRoulette.sln`, `npm run verify`, and one quick spot check per slice in one theme.
  - The side-by-side desktop and WebUI pass in both themes is the Release Specific checklist item above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - None yet.

### M10j12 - Server Shutdown Fixes

- **Status**: ⏳ Planned
- **Goal**: Stopping the server finishes in a few seconds with clients connected, the Windows tray survives its right-click menu, and Operator **Stop**, Operator **Restart**, and in-app update apply shut the tray down on its UI thread, so they cannot deadlock the server's shutdown.
- **Scope**:
  - Ships in v0.14.0. Three slices in this order: slow shutdown, the Windows tray right-click, then the tray shutdown race. The right-click slice goes before the race because both change the tray's exit path.
  - Add Release Specific checklist items:
    - "With clients connected, tray and Operator Stop exit within a few seconds, and Operator Restart relaunches the server, on Linux and Windows."
    - "On Windows, right-clicking the server tray icon opens the menu, menu items work, and the icon stays."
  - Slow shutdown with connected clients:
    - Observed: stopping the server from the tray or the Operator UI takes about 25 seconds while clients are connected.
    - Likely cause, observed but not confirmed: open event streams are only closed when the host shutdown timeout runs out, not when shutdown starts. The `/api/events` loop only watches the request's abort token, not application stopping.
  - Windows tray right-click:
    - Observed on Windows since the tray moved to Avalonia: right-clicking the server tray icon shows no menu and the icon disappears, while the server and WebUI keep running. The Avalonia tray has never worked on Windows. Dispatcher hardening, an Avalonia version bump, and removing the checkbox menu item all reproduced it.
    - Cause, read from the Avalonia 12.0.0 binaries and reproduced in a headless experiment, not yet confirmed on Windows: on Windows, Avalonia draws the tray menu as a temporary top-level window that closes itself when it loses focus or an item is clicked. The tray starts its desktop lifetime with the default `ShutdownMode.OnLastWindowClose` and has no main window, so closing the menu shuts down the tray's UI loop, which removes the icon. The UI loop then returns normally and nothing is logged. Linux is unaffected because the desktop shell draws its menu over D-Bus and no Avalonia window opens. The same menu design is in Avalonia 11.3.12 through 12.0.4.
    - Supporting evidence: the original tray was pure WinForms, with no Avalonia, and worked on Windows, including all menu actions. The problem started when the tray moved to Avalonia, which is when the menu became an Avalonia window under the last-window rule. None of the earlier attempts changed that rule.
    - The tray thread is already STA, so apartment state is not the cause.
    - Fix: start the tray with `ShutdownMode.OnExplicitShutdown`. Every intended exit already calls the desktop lifetime's `Shutdown()` explicitly, so no exit path relies on the last-window rule, and Linux never opens a window.
    - Log to `last.log` when the tray's UI loop exits without a requested shutdown, so a silent exit is visible. Today the tray's logger reaches only the console and, for warnings and errors, the Windows Event Log.
    - Once the Release Specific check confirms the fix on Windows, update the README Known Issues entry, which attributes the problem to Avalonia's notification area integration.
  - Tray shutdown race:
    - No hang has been observed. A suspected hang on CachyOS after Operator **Stop** was most likely the terminal not redrawing its prompt after the server exited: pressing Enter brings the prompt back.
    - Suspected risk from code reading, not confirmed: these paths call `StopApplication` while the tray is still running, so the stopping callback shuts the Avalonia tray down from a non-UI thread. That calls `ClassicDesktopStyleApplicationLifetime.Shutdown()` off the UI thread, which cancels the UI main loop and then waits with no timeout in `Dispatcher.UIThread.InvokeShutdown()` for a job the UI thread may never run. If that happens, the blocked callback holds the `StopApplication` lock, so the host never stops its hosted services, `RunAsync` never returns, and a restart or update never relaunches. The tray menu paths avoid this because they shut the tray down on its UI thread before calling `StopApplication`.
    - `AvaloniaTrayHostUi.RequestUiExitAsync` posts the shutdown to the UI thread and then also calls the desktop lifetime's `Shutdown()` directly as an unconditional fallback.
    - The code path is unchanged since v0.12.0: the ServerApp code and the Avalonia version are the same at that tag.
    - Likely fix: always shut the tray down on its UI thread, and never call the desktop lifetime's `Shutdown()` from another thread.
    - Windows has the same code path and is untested. Headless runs are not affected, because the headless host UI does nothing on stop.
- **Acceptance criteria**:
  - With desktop and WebUI clients connected, tray **Stop Server / Exit** and Operator **Stop** exit the process within a few seconds.
  - Connected clients see the server go offline and reconnect after a restart, as they do now.
  - Operator **Stop** exits the process, and Operator **Restart** and update apply relaunch it, on Linux with the tray and on Windows.
  - Tray **Stop Server / Exit** and **Restart Server** still exit and relaunch cleanly.
  - No code path calls the tray's desktop lifetime `Shutdown()` from a non-UI thread.
  - On Windows, right-clicking the tray icon opens the menu, menu items work, and the icon stays, across repeated right-clicks and dismissals.
  - The tray starts with `ShutdownMode.OnExplicitShutdown`, and its UI loop ending without a requested shutdown writes a `last.log` line.
  - The Linux tray menu behaves as it does now.
- **Verification evidence**:
  - Completion evidence must include a test that an open event stream closes when the application starts stopping, a test or code check that the tray starts with `ShutdownMode.OnExplicitShutdown` and that an unrequested UI loop exit writes the `last.log` line, a test or code check that the tray's desktop lifetime `Shutdown()` is only reached on the UI thread, shutdown timings on Linux with and without a connected client before and after the fix, and one quick Linux spot check of the tray menu and of Operator **Stop** and **Restart** with the tray.
  - Repeated runs and the Windows pass are the Release Specific checklist items above, run in the pre-release pass.
  - If a hang is ever reproduced, include a thread dump of the hung process to confirm the cause.
- **Deferrals / Follow-ups**:
  - If the Windows tray icon survives right-click but the menu still closes instantly, the menu window is losing focus as it opens, which ServerApp cannot change inside Avalonia. The fallback is a Windows-only native menu, such as the WinForms `NotifyIcon` tray that passed Windows verification before the move to Avalonia.

### M10j13 - Client Status Line Overhaul

- **Status**: ⏳ Planned
- **Goal**: Each client's status line shows one stable message per situation, and desktop and WebUI show the same message for the same event.
- **Scope**:
  - Ships in v0.14.0. Can be cut from the release if it runs long; the Operator Testing Suite overhaul is then cut with it.
  - Both clients' status lines can alternate between competing messages, and they often show different messages for the same event.
  - Observed in the v0.13.0 manual regression pass: with the server stopped, the desktop alternates between "core runtime unavailable" and "core runtime is required to browse the library", and the WebUI shows "library load failed: HTTP 503" only briefly before "SSE reconnecting...". Refresh status also differs between desktop and WebUI for the same refresh.
  - Refresh status is in scope: the same refresh stage, progress, and result read the same on both clients. Refresh summary parsing is implemented separately in each client today. If the refresh text moves to the server, that contract change is its own slice.
  - Define one rule per client for which message wins when several apply, so the status line never alternates.
  - Define the message for each event once and use it on both desktop and WebUI.
  - Add a Release Specific checklist item: "With the server stopped, unavailable, or mismatched, and during a refresh, desktop and WebUI each settle on the same status message."
- **Acceptance criteria**:
  - With the server stopped, unavailable, or mismatched, each client's status line settles on one message and does not alternate.
  - Desktop and WebUI show the same message for the same event.
  - During and after a refresh, desktop and WebUI show the same refresh status.
  - The precedence rule and the per-event messages are documented.
- **Verification evidence**:
  - Completion evidence must include desktop and WebUI tests of the precedence rule and the per-event messages, locked to one shared fixture under `shared/fixtures/` if the rule is implemented in both languages, covering the server stopped, the API unavailable, a version or capability mismatch, and refresh progress and results, plus one quick spot check of each client with the server stopped.
  - The full side-by-side pass is the Release Specific checklist item above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - The Operator Testing Suite overhaul checks these messages in its scenarios once they are defined.

### M10j14 - Operator Testing Suite Overhaul

- **Status**: ⏳ Planned
- **Goal**: The Operator Testing Suite produces clear results that match current client connection and status handling.
- **Scope**:
  - Depends on: the client status line overhaul, which defines the messages these scenarios check, and the server shutdown fixes, which change how event streams close.
  - This is the last milestone in the v0.14.0 release. It can be cut from the release if the release runs long.
  - The suite predates the current client connection and status handling and no longer produces clear results.
  - Observed in the v0.13.0 manual regression pass:
    - With an API version mismatch or capability mismatch, the desktop alternates between "core runtime is required" and the mismatch warning too fast to read. The WebUI is fine.
    - With the API unavailable, the desktop flickers between disconnected and reconnecting messages, and the WebUI shows "library load failed: HTTP 503" only briefly before settling on "SSE reconnecting...".
    - SSE disconnect behaves inconsistently and may need redesigning.
  - Redesign the scenarios against current client behavior.
  - Define the expected message per client for each scenario.
  - Verify client interactions as part of the suite.
  - Add a Release Specific checklist item: "Every Operator Testing Suite scenario shows its expected desktop and WebUI message, and resetting it leaves both clients connected."
- **Acceptance criteria**:
  - Each scenario lists the expected desktop and WebUI message, and both clients show it while the scenario is active.
  - SSE disconnect behaves the same way on every run.
  - Running and resetting each scenario leaves both clients connected and working.
- **Verification evidence**:
  - Completion evidence must include automated tests that each scenario sets and resets the server state it describes, and that SSE disconnect closes and reconnects the same way on repeated runs, plus one quick spot check of one scenario on desktop and WebUI.
  - The pass of every scenario is the Release Specific checklist item above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - None yet.

## Planned Milestones

### P1 - End-User README and Contributor Dev Documentation

- **Status**: ⏳ Planned
- **Goal**: Make `README.md` the non-technical guide for installing and running ReelRoulette on Windows and Linux, and keep contributor detail in `docs/dev-setup.md` with one complete command and script reference.
- **Scope**:
  - Unscheduled. Best done after the accounts release, which changes first-run setup and how clients connect.
  - `README.md` (end users and operators):
    - Installation and day-to-day use only, with a pointer to `docs/dev-setup.md` for building from source.
    - A table of contents after the introduction.
    - Install through the Velopack releases: the Windows per-user `Setup.exe` and the Linux AppImage, first launch, application menu registration on Linux, and in-app updates through Operator and desktop Settings.
    - Runtime prerequisites only (FFmpeg with `ffprobe`, LibVLC, FUSE 2 for the AppImage), with package commands for Debian/Ubuntu, Fedora, and Arch-based distributions (CachyOS as the Arch example).
    - A user manual covering playback, library browse, tags, presets, filters, Operator and WebUI access, account setup and login, reverse proxy access, Library Export and Import or the Operator catalog transfer (whichever has shipped), Launch Server on Startup, and tray versus headless behavior.
    - Troubleshooting: native dependencies, permissions, display and audio, missing tray, autostart conflicts.
    - Keep the Documentation Map and Third-Party Components sections.
  - `docs/dev-setup.md` (contributors):
    - Move any developer content out of the README.
    - All development prerequisites (.NET SDK, Node, PowerShell) with Debian/Ubuntu, Fedora, and Arch-based install commands.
    - A full list near the top of every `tools/scripts/*` entry point and recurring `dotnet` and `npm` command, with a short explanation each.
  - Bring `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, and the testing checklist in line with the README and dev-setup split.
- **Acceptance criteria**:
  - A non-developer can follow `README.md` alone to install and run the server and desktop client on Windows and on each listed Linux family, and reach the Operator and WebUI.
  - A contributor can rely on `docs/dev-setup.md` for setup, build, test, and release workflows, and its script list matches `tools/scripts/`.
  - No current-state doc names retired packaging (Inno Setup, portable archives, install scripts, `appimagetool`).
- **Verification evidence**:
  - Completion evidence must include a check that every script in `tools/scripts/` is listed in `docs/dev-setup.md`, and a search showing no retired packaging names in current-state docs.
  - A fresh-install walkthrough on Windows and one Linux distribution from the README alone is a Release Specific checklist item.
- **Deferrals / Follow-ups**:
  - None yet.

### P2a - Playback Session Contracts and Capability Surface

- **Status**: ⏳ Planned
- **Goal**: Establish contract-first playback-session APIs and capability signaling.
- **Scope**:
  - First milestone of the playback sessions release, planned for v0.18.0. Depends on: Per-User Source Permissions, so every stream session is checked against the user's sources from the start.
  - Keep each slice of this series independently verifiable and shippable, and keep thin-client boundaries while adding server-side playback decisions.
  - Define OpenAPI contracts for playback-session create and read and the stream URL.
  - Add playback-session and transcode capability markers to the capability list served by `/api/version` and `/api/capabilities`.
  - Regenerate the WebUI types and update the desktop client contracts.
- **Acceptance criteria**:
  - OpenAPI includes the playback-session surfaces and validates.
  - Generated WebUI types and desktop contracts match OpenAPI.
  - Clients detect a server without playback sessions from the capability list.
- **Verification evidence**:
  - Completion evidence must include contract tests, `npm run verify:contracts`, and a capability check against a server without the feature.
- **Deferrals / Follow-ups**:
  - None yet.

### P2b - Server Playback Decision Engine

- **Status**: ⏳ Planned
- **Goal**: Make the server the only place that chooses direct, remux, or transcode playback.
- **Scope**:
  - Planned for v0.18.0.
  - Implement a playback-session decision service from media probe metadata and client capability hints.
  - Cache probe results by file path and modification time to avoid repeated `ffprobe` runs.
  - Decision output: playback mode (`direct`, `remux`, `transcode`), delivery type (`progressive` or `hls-fmp4`), and a reason for troubleshooting.
  - Log each decision through the structured log API (component, operation, mode, reason), without file names or paths.
- **Acceptance criteria**:
  - The server chooses `direct`, `remux`, or `transcode` for each session request, and the same inputs give the same decision.
  - Session responses include the delivery type and a reason.
  - Each decision appears in `last.log` as a structured entry without file names or paths.
- **Verification evidence**:
  - Completion evidence must include decision tests over a fixture of probe results and client hints, and probe-cache tests for unchanged and changed files.
- **Deferrals / Follow-ups**:
  - None yet.

### P2c - Media Token Lifetime and Direct-Stream Sessions

- **Status**: ⏳ Planned
- **Goal**: Direct-stream URLs are session tokens with a lifetime, and an expired or unknown token cannot stream anything.
- **Scope**:
  - Planned for v0.18.0.
  - Already in place: `POST /api/random` and `POST /api/play/{itemId}` issue a media token, and `GET /api/media/{idOrToken}` streams it with range requests.
  - `docs/full-audit.md` finding 11 (`ServerMediaTokenStore` has no expiry or eviction) still holds: every play adds a token that is never removed and stays valid until the server stops.
  - Give tokens a time to live and a size cap, tie them to the playback session, and clean expired sessions up.
  - `GET /api/media/{idOrToken}` also accepts a raw item id. The source access policy covers that path; decide here whether raw ids stay accepted once sessions exist.
- **Acceptance criteria**:
  - Direct-stream URLs are issued and validated through playback sessions.
  - An expired or unknown token returns the same not-found result, and expired sessions are removed.
  - The token store size stays bounded under repeated plays.
- **Verification evidence**:
  - Completion evidence must include token expiry, eviction, and size-cap tests, and a range-request test on a session URL.
- **Deferrals / Follow-ups**:
  - None yet.

### P2d - Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline)

- **Status**: ⏳ Planned
- **Goal**: Add compatibility streaming for unsupported formats and long-form playback.
- **Scope**:
  - Planned for v0.18.0.
  - Implement remux and transcode with ffmpeg.
  - Segmented streaming uses HLS with fMP4 segments as the single baseline profile.
  - Clean up ffmpeg workers and temporary segment and transcode files.
- **Acceptance criteria**:
  - With API playback, incompatible media is served through remux or transcode, with no client-side format workarounds.
  - Segmented streaming is HLS with fMP4 segments.
  - No ffmpeg process or segment or transcode file is left after a session expires or the server stops.
- **Verification evidence**:
  - Completion evidence must include remux and transcode tests on a small media fixture set and a cleanup test after session expiry and after shutdown.
- **Deferrals / Follow-ups**:
  - None yet.

### P2e - Desktop Thin-Client Playback Cutover

- **Status**: ⏳ Planned
- **Goal**: Desktop API playback uses playback sessions, while local-first playback stays as it is.
- **Scope**:
  - Planned for v0.18.0.
  - Keep local-first playback with automatic API fallback, and `ForceApiPlayback` for validating the API path.
  - Add playback-session orchestration for desktop API playback.
  - Define "locally accessible": the file exists at the expected path, the desktop can read it, the path is not a server-issued token, and a quick open-read succeeds.
  - Fall back to API playback when the local path is not accessible, and always use API playback with `ForceApiPlayback=true`.
  - Loop toggle without reload is new work, not existing behavior: toggling loop today stops playback, rebuilds the LibVLC media with the new repeat option, and seeks back. In this series, toggling loop does not reload media, loop transitions stay gapless, and loop iterations do not count as plays.
  - Keep reconnect and status behavior consistent across local and API playback.
- **Acceptance criteria**:
  - Local playback when the file is locally accessible and `ForceApiPlayback=false`; API playback otherwise.
  - Desktop API playback uses the playback-session contract.
  - No new local file authority beyond `desktop-settings.json` and reading media for playback.
  - Toggling loop does not reload media or count a play, and loop transitions are gapless.
- **Verification evidence**:
  - Completion evidence must include path-selection tests and a loop-toggle test that the media is not rebuilt.
- **Deferrals / Follow-ups**:
  - None yet.

### P2f - WebUI Playback Cutover and Format Resilience

- **Status**: ⏳ Planned
- **Goal**: WebUI playback starts through playback sessions and handles formats the browser cannot play.
- **Scope**:
  - Planned for v0.18.0.
  - Route WebUI playback start through the playback-session API.
  - Prefer direct playback when supported; fall back to the HLS fMP4 stream when needed.
  - Keep the WebUI's seamless loop on both progressive and HLS playback.
  - Check long-form buffering, seek, reconnect, and format edge cases.
- **Acceptance criteria**:
  - WebUI playback starts from server-issued playback sessions.
  - Formats the browser cannot play are handled by the server pipeline.
  - Movie-length playback works on the validation set.
  - Looping behaves the same on progressive and HLS playback.
- **Verification evidence**:
  - Completion evidence must include WebUI tests of session start and fallback, and `npm run verify`. The long-form validation set pass is a Release Specific checklist item.
- **Deferrals / Follow-ups**:
  - None yet.

### P2g - Resume Position and Session Continuity

- **Status**: ⏳ Planned
- **Goal**: The server remembers playback position for desktop and WebUI.
- **Scope**:
  - Planned for v0.18.0.
  - Add a server-owned resume-position contract and storage, with throttled writes and clear completion and reset rules.
  - Add resume-position query and clear APIs.
  - Add resume settings (on or off, threshold windows, retention) through server settings.
  - Loop iterations do not count as plays and do not create resume points.
  - Decide whether resume positions are per account.
- **Acceptance criteria**:
  - Resume position survives reconnects and restarts through server state.
  - Desktop and WebUI resume the same way on API playback.
  - Clearing a resume position works and is visible to both clients.
  - Resume settings are documented, stored, and enforced by the server.
- **Verification evidence**:
  - Completion evidence must include server tests for recording, clearing, and the loop rule, and client tests for resume.
- **Deferrals / Follow-ups**:
  - None yet.

### P2h - Playback Concurrency, Diagnostics, and Hardening

- **Status**: ⏳ Planned
- **Goal**: Keep the playback pipeline stable with several clients and make failures diagnosable from the Operator.
- **Scope**:
  - Last milestone of the playback sessions release, planned for v0.18.0.
  - Limit concurrent transcodes, with a queueing policy, as a server setting with a safe default. This takes over the transcode-concurrency part of the removed advanced runtime and cache controls backlog item; the rest of that item was overtaken when refresh stopped trimming thumbnails to a count or size limit.
  - Add Operator diagnostics for active sessions, mode decisions, and failure reasons.
  - Add Release Specific checklist items for the multi-client playback matrix on Linux and Windows.
- **Acceptance criteria**:
  - Multi-client playback stays stable when transcode capacity is limited.
  - The Operator shows enough to troubleshoot a playback failure.
  - After the server stops, no ffmpeg worker remains, and temporary playback and transcode folders are cleaned or expire.
- **Verification evidence**:
  - Completion evidence must include concurrency-limit and queueing tests and a shutdown cleanup test. The multi-client matrix is the Release Specific checklist item above.
- **Deferrals / Follow-ups**:
  - None yet.

### P3 - Android Client Bootstrap

- **Status**: ⏳ Planned
- **Goal**: Start an Android app on the API once accounts and playback sessions exist.
- **Scope**:
  - Unscheduled. Depends on: PIN Login API and Sessions, and Playback Concurrency, Diagnostics, and Hardening.
  - Create `src/clients/android/ReelRoulette.Android` as a Gradle project.
  - Basic API connectivity and event stream use.
  - Find the server through mDNS, which the server already advertises, and log in with an account PIN like the other LAN clients.
  - Optional: generate a Kotlin API client from OpenAPI.
- **Acceptance criteria**:
  - The app can find the server, log in, list presets, request random media, and stream it.
  - Favorite, blacklist, and tag events update the app.
  - Returning from background and event stream reconnects keep working within the session rules.
- **Verification evidence**:
  - Completion evidence must include Android tests for API and event envelope handling and reconnect behavior.
- **Deferrals / Follow-ups**:
  - None yet.

### P4 - File Metadata Sync and Extended Metadata

- **Status**: ⏳ Planned
- **Goal**: Import tags and metadata from media files and write them back, through the server.
- **Scope**:
  - Unscheduled.
  - Needs a catalog schema change (schema version 3) for the extended metadata columns, with its own migration from schema version 2. No metadata library is referenced today.
  - Implement metadata sync in core and server services:
    - import tags from supported formats during import and refresh,
    - export tags and metadata to files on demand, with an optional auto-export policy,
    - an explicit, configurable merge policy.
  - Metadata sync settings through server settings: auto-import, auto-export, merge strategy, and write confirmation.
  - Extended metadata: genre, year, artist or creator, title, album or series, comment, rating.
  - Show metadata in library browse and filters, with batch metadata edit through the API.
  - Handle unsupported formats, read-only or locked files, and network paths, with result summaries and structured logs.
- **Acceptance criteria**:
  - Metadata import and export run only through server APIs.
  - The supported formats and field mappings are documented and tested.
  - The merge policy gives the same result for the same inputs.
  - Extended metadata is stored by the server and behaves the same on desktop and WebUI.
  - Batch operations follow the conflict and error policy and report success and failure counts with reasons.
- **Verification evidence**:
  - Completion evidence must include schema migration tests, format mapping tests, and merge-policy tests.
- **Deferrals / Follow-ups**:
  - None yet.

### P5 - Customizable Keyboard Shortcuts (Desktop)

- **Status**: ⏳ Planned
- **Goal**: Let desktop users rebind keyboard shortcuts while keeping input handling reliable and the current defaults.
- **Scope**:
  - Unscheduled. Depends on: Desktop Player View and Fullscreen Fixes, which changes how keyboard input reaches the app over the video.
  - Today 31 hard-coded key cases in the desktop decide what each key does.
  - Shortcuts editor dialog from the menu: list actions and bindings, capture keys with `Ctrl`, `Shift`, and `Alt`, detect conflicts, and reset one or all bindings.
  - Read-only shortcut reference in the Help menu.
  - Store bindings in `desktop-settings.json` only.
  - Resolve keys through a binding map instead of hard-coded checks.
  - Define reserved system keys and menu-accelerator conflicts.
- **Acceptance criteria**:
  - Rebound actions work and survive a restart.
  - Conflicts cannot leave two actions on one binding.
  - Defaults can be restored.
  - Reserved system shortcuts cannot be overridden.
  - Playback and controls work with default and custom bindings.
- **Verification evidence**:
  - Completion evidence must include binding-map, conflict, and reset tests.
- **Deferrals / Follow-ups**:
  - None yet.

### P6 - Playback History and Analytics

- **Status**: ⏳ Planned
- **Goal**: Record playback history on the server and show analytics from it on desktop and WebUI.
- **Scope**:
  - Unscheduled.
  - The catalog keeps only a play count and last-played time per item, so there is no history to chart yet. Start with a server-owned playback events table (catalog schema change) written when the server records a play, with a retention setting.
  - Server analytics queries over that history and library stats: plays per day, week, and month; top-played items; favorites ratio; duration, source, and time-of-day distributions; tag usage.
  - Date ranges (`7d`, `30d`, `90d`, `1y`, `all`) and optional grouping.
  - Client charts and summary panels (desktop first, then WebUI), a date-range selector, and image and CSV or JSON export.
  - The server computes analytics; clients only render.
  - Decide whether history is per account.
- **Acceptance criteria**:
  - Each recorded play adds a history row, and retention removes old rows.
  - Analytics come only from server APIs and match across clients for the same range.
  - Date ranges change the aggregates correctly.
  - Exports match the current query.
- **Verification evidence**:
  - Completion evidence must include schema migration tests, history write and retention tests, and aggregate tests per range.
- **Deferrals / Follow-ups**:
  - None yet.

### P7 - Desktop Confirmation Dialog Standardization

- **Status**: ⏳ Planned
- **Goal**: Replace the desktop's ad-hoc confirmation windows with one reusable dialog.
- **Scope**:
  - Unscheduled. Best done after Desktop Source Management Link, which removes the Manage Sources dialog and its five ad-hoc windows. The desktop builds 23 ad-hoc windows today.
  - A reusable `ConfirmDialog` with title, message, button sets (`OK/Cancel`, `Yes/No`, `Remove/Cancel`), and default and cancel actions.
  - Move the existing confirmations to it one at a time, keeping wording, destructive-action emphasis, and default buttons.
  - Remove each old dialog only after its replacement behaves the same.
- **Acceptance criteria**:
  - The dialog supports every button pattern the desktop uses.
  - Moved confirmations behave and end the same as before.
  - Duplicate confirmation code is gone with no regressions.
- **Verification evidence**:
  - Completion evidence must include headless dialog tests for destructive and non-destructive confirmations.
- **Deferrals / Follow-ups**:
  - None yet.

### P9a - Photo Face Detection Baseline

- **Status**: ⏳ Planned
- **Goal**: Deliver reliable face detection for photos with practical UX and performance controls.
- **Scope**:
  - Unscheduled.
  - Establish the face-analysis baseline in core and server: detection jobs, stored results, and API queries for clients.
  - Clients display results and start server jobs; they do not detect locally.
  - This milestone is the first phase of the face-detection rollout, with video in the companion video-detection phase.
  - Choose a .NET-compatible detection stack (OpenCV, ML.NET, or other) for photos.
  - Import-time and on-demand scans.
  - Store bounding boxes, confidence, and a metadata version per item (catalog schema change).
  - Optional bounding box overlays in preview and face-aware filter entry points.
  - Off by default, run in the background, and reuse cached results with a clear invalidation rule.
- **Acceptance criteria**:
  - Face detection results are produced and owned by the server.
  - Desktop and WebUI read face metadata through APIs.
  - Photo detection runs in the background and does not block playback or import.
  - Overlays and filters work for detected photo faces.
  - Performance impact is bounded and documented.
- **Verification evidence**:
  - Completion evidence must include detection job, storage, and query tests on a photo fixture set.
- **Deferrals / Follow-ups**:
  - None yet.

### P9b - Video Face Detection Expansion

- **Status**: ⏳ Planned
- **Goal**: Extend face detection to video with sampling suited to long media.
- **Scope**:
  - Unscheduled. This milestone is the second phase of the face-detection rollout and builds on the photo-detection phase.
  - Define frame sampling (interval, keyframe, or scene-aware).
  - Run detection as background jobs with queueing and concurrency limits.
  - Store timeline-aware results for video items.
  - Timeline overlays or markers and filter hooks matching photo behavior where practical.
  - Recognition or identity only after the detection baseline is stable, and only if separately approved.
- **Acceptance criteria**:
  - Video detection runs within its resource limits and does not disturb playback or transcodes.
  - Results come through server APIs in the same shape as photo results where possible.
  - Long media processing can resume and retry and is visible to the operator.
- **Verification evidence**:
  - Completion evidence must include sampling, resume, and resource-limit tests.
- **Deferrals / Follow-ups**:
  - None yet.

### P10 - Ordinal Path Identity on Linux

- **Status**: ⏳ Planned
- **Goal**: On Linux, treat paths that differ only by case as different paths in folder import and in refresh, and keep the ignore-case path compare on Windows.
- **Scope**:
  - Unscheduled.
  - Folder import and refresh use ordinal path identity on Linux. Windows keeps the ignore-case compare.
  - A case-only rename on Linux rewrites the stored full path, relative path, and file name together. Two files that differ only by case stay two items.
  - Source roots have the same case problem: `/Media` and `/media` can be different directories on Linux and are still compared ignoring case.
  - Path identity is built into the catalog: source and item paths are matched on lowercase `root_path_fold`, `full_path_fold`, and `relative_path_fold` columns, and only those columns are indexed. Ordinal lookups on Linux need matching indexes on the stored paths, or fold columns that keep case on Linux, so this is a catalog schema change with its own migration.
  - This needs a Windows VM pass before the compare changes. Windows enumeration casing was not measured. An ordinal compare there may treat an operating-system casing difference as a removed file plus a new file.
- **Acceptance criteria**:
  - On Linux, importing a case-only rename of an existing file stores the new full path, relative path, and file name, and that full path exists.
  - On Linux, refresh of that rename reports the rename and stores the discovered path. Two files in one folder that differ only by case both remain in the catalog.
  - On Windows, a casing difference between the stored path and the enumerated path does not remove the item or add a second one.
  - Source-root casing is decided in the same change, including two directories that differ only by case on Linux.
  - Path lookups stay indexed after the change.
- **Verification evidence**:
  - Measured on Linux before this backlog item, for both v0.12.0 import and the current import: after `Clip.mp4` is renamed to `clip.mp4`, the stored full path stays `Clip.mp4` while the relative path and file name become `clip.mp4`. Refresh then reports 0 added, 0 removed, 0 renamed, and 0 moved. The thumbnail stage reports 1 missing source. An ignore-case set of a folder that contains both `clip.mp4` and `Clip.mp4` keeps one path; an ordinal set keeps both.
  - Completion evidence must include those Linux cases after the fix, schema migration tests, plus a Windows VM pass for the ignore-case compare.
- **Deferrals / Follow-ups**:
  - Deferred past v0.14.0: Windows enumeration casing has not been measured, an ordinal compare there risks removing and re-adding items, and a v0.14.0 planning query of a real 48,938-item catalog found no case-only path collisions.

### P20 - WebUI Settings Page

- **Status**: ⏳ Planned
- **Goal**: The WebUI has a settings page for per-device preferences and diagnostics, as the desktop has its settings dialog and Diagnostics view.
- **Scope**:
  - Unscheduled.
  - Add a settings page to the WebUI.
  - Move the diagnostics information to the settings page and remove the diagnostics panel from below the main page's status line. That panel is currently shown only on mobile browsers by design; in the v0.13.0 manual regression pass it appeared only on the phone in Firefox.
  - Add client-side preferences, starting with an option to remember filter settings across sessions.
  - Where the desktop has an equivalent option, match its name and behavior. The desktop has no option for remembering filter settings: it always saves the filter state with its other saved data. Whether the desktop gains a matching option is decided in this item.
- **Acceptance criteria**:
  - The settings page shows the diagnostics information on desktop and mobile browsers, and the main page no longer shows the diagnostics panel.
  - With the remember option on, filter settings survive closing and reopening the WebUI on that device. With it off, the WebUI opens with default filter settings.
  - Preferences are stored per device and do not change other devices or the desktop.
  - Every option with a desktop equivalent has the same name and behavior on both clients.
- **Verification evidence**:
  - Completion evidence must include a desktop browser and phone pass of the settings page, and the remember option checked across a browser restart.
- **Deferrals / Follow-ups**:
  - Deferred past v0.14.0: the remember-filter option and whether the desktop gains a matching option need UX decisions first.

### P25 - Per-Preset Preset Writes

- **Status**: ⏳ Planned
- **Goal**: Saving, renaming, reordering, or deleting a preset on one client changes only that preset on the server, so two clients editing presets do not overwrite each other.
- **Scope**:
  - Planned for v0.15.0, last in the Operator administration release. Builds on the shared preset-equality fixture from Remove the Preset Match Route.
  - Found during v0.14.0 planning: the desktop and the WebUI both post the whole preset list to `POST /api/presets`, which replaces the server's preset catalog. The last writer wins, so a preset saved on one client can be lost when the other client saves its older list. This is the same client-held whole-catalog pattern as the tag sync routes removed in v0.13.0.
  - Add per-preset write routes (save, rename, reorder, delete) and move both clients to them. Remove the whole-list replace once no client uses it.
  - Tag rename and delete keep updating presets on the server.
  - Contract change, crossing server, OpenAPI, generated WebUI types, desktop, and WebUI.
- **Acceptance criteria**:
  - A preset saved on one client while the other client has its preset list open is still present after the other client saves a different preset.
  - Rename, reorder, and delete change only the named preset.
  - Desktop and WebUI show the same preset list after either client changes it.
  - No client posts the whole preset list.
- **Verification evidence**:
  - Completion evidence must include server tests for each write, a two-client test of concurrent saves, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - None yet.

### P26a - Operator UI Extraction

- **Status**: ⏳ Planned
- **Goal**: Move the Operator page out of `Program.cs` into a frontend with automated tests, without changing what it does.
- **Scope**:
  - First milestone of the Operator administration release, planned for v0.15.0. Every later Operator milestone needs Operator UI tests, and there is nowhere to write them today.
  - The Operator page is about 780 lines of HTML, CSS, and JavaScript inside a raw string in `src/core/ReelRoulette.ServerApp/Program.cs`, and no test covers `/operator`.
  - Where it lives is decided here. The first candidate is a second entry in the WebUI Vite project, which already has `npm run verify`, type checking, and tests, and is already staged into server builds by `stage-webui-assets.ps1`.
  - The page stays at `/operator`, calls the same control routes, and keeps its sections, labels, and behavior.
  - Replace `innerHTML` with escaped rendering where the page inserts settings and status text (`docs/full-audit.md` finding 43, Operator HTML page interpolates user input via `innerHTML`).
  - Packaged server builds serve the extracted page.
- **Acceptance criteria**:
  - `/operator` shows the same sections and controls and calls the same routes as before.
  - Operator UI tests run in `npm run verify`.
  - The page renders settings and status text without `innerHTML` interpolation.
  - The packaged Linux server smoke still reaches `/operator`.
- **Verification evidence**:
  - Completion evidence must include Operator UI tests for loading status and settings, saving settings, and the testing panel, `npm run verify`, `dotnet test ReelRoulette.sln`, and `./tools/scripts/verify-linux-packaged-server-smoke.sh`.
- **Deferrals / Follow-ups**:
  - None yet.

### P26b - WebUI Source State Sync

- **Status**: ⏳ Planned
- **Goal**: The WebUI updates its library window and filter source list when a source is enabled, disabled, added, or removed elsewhere.
- **Scope**:
  - Planned for v0.15.0.
  - The server already applies source state: list query, random selection, and item play only use enabled sources. The WebUI keeps no source authority of its own; its source checkboxes are a filter choice.
  - What is missing: the WebUI ignores `sourceStateChanged`, and it reads `GET /api/sources` only when the filter dialog opens.
  - On `sourceStateChanged`, reload the loaded library window (keeping the scroll position, as the desktop does) and refresh the filter source list.
  - Do not add source administration to the WebUI.
- **Acceptance criteria**:
  - Enabling or disabling a source from the desktop or the Operator updates the WebUI library window and filter source list without a reload.
  - A source imported elsewhere appears in the WebUI filter source list.
  - No WebUI source administration is added.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for `sourceStateChanged` handling and `npm run verify`, plus one quick spot check of a desktop source toggle seen in the WebUI.
- **Deferrals / Follow-ups**:
  - None yet.

### P26c - Operator Source and Item Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources and remove library items from the Operator, with server routes for what the desktop cannot do today.
- **Scope**:
  - Planned for v0.15.0. Depends on: Operator UI Extraction.
  - Gated by the control plane: localhost, or the control token from other machines. The accounts release later moves this behind admin accounts.
  - Today the desktop Manage Sources dialog shows Rename and Remove buttons and the grid shows Remove from Library, but none of them has a server route; v0.14.0 hides them until this milestone.
  - Add server routes to rename a source, remove a source (its items leave the catalog; files stay on disk), and remove items from the library, with the delete-from-disk option the desktop remove dialog offers.
  - Add a Manage Sources section to the Operator: list sources with item and duration statistics, add a folder, rename, remove, enable and disable, refresh, and duplicate scan and apply. Folder import, enable and disable, refresh, and the duplicate routes already exist.
  - Bring back the desktop grid's Remove from Library on the new item route.
  - Source and item changes publish events so connected clients update.
- **Acceptance criteria**:
  - From the Operator, sources can be added, renamed, removed, enabled, and disabled, and duplicates scanned and applied.
  - Removing a source removes its items from the catalog and leaves its files.
  - The desktop Remove from Library removes the selected items through the server, with and without deleting from disk.
  - Connected desktop and WebUI clients update through events and list requery.
  - New routes are in OpenAPI, and `npm run verify:contracts` passes.
- **Verification evidence**:
  - Completion evidence must include server tests for each new route, Operator UI tests for the Manage Sources section, a desktop test for Remove from Library, `dotnet test ReelRoulette.sln`, and `npm run verify`.
  - Add a Release Specific checklist item: "From the Operator, add, rename, disable, and remove a source, and scan and apply duplicates; desktop and WebUI update without a restart."
- **Deferrals / Follow-ups**:
  - Per-user source visibility is Per-User Source Permissions.

### P26d - Operator Library Catalog Transfer

- **Status**: ⏳ Planned
- **Goal**: Export and import the library from the Operator, with the server applying the catalog, so a server plus WebUI install does not need the desktop app.
- **Scope**:
  - Planned for v0.15.0. Depends on: Operator UI Extraction, and Remove library.json Library Support.
  - Gated by the control plane, like Operator source management.
  - Move the `library.db` checkpoint transfer onto server operations. The server writes the checkpoint while it has `library.db` open. Settings and backups are not part of the transfer. Presets and thumbnail revision and dimensions travel with `library.db`. JPEG files stay in the local thumbnail directory.
  - Reuse the replace-and-recover protocol already in `LibraryCatalogStore` (incoming file, finished-file rename, recovery), which the desktop import uses today with the server stopped. What is new is replacing the database while the server's catalog session is open.
  - Import runs while the server is up. The previous database stays aside until the new file is in place and opens. A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed. A file that is not a library database is rejected.
  - Import keeps the source folder remap the desktop import offers.
  - Add export and import actions to the Operator.
  - Remove the desktop Library Export and Import menus.
- **Acceptance criteria**:
  - The Operator can export a server-produced checkpoint and import a `library.db` while the server is running.
  - An interrupted import leaves the previous catalog or the finished incoming file, never a partial database or an empty catalog.
  - Import rejects a file that is not a library database and does not replace the live catalog.
  - Import replaces the catalog, including presets and thumbnail revision and dimensions. Settings and backups stay where they are. JPEG files stay in the local thumbnail directory.
  - Connected clients resync after an import.
  - The desktop client no longer has Library Export or Import.
- **Verification evidence**:
  - Completion evidence must include server tests for checkpoint export, running-server import, rejection of a file that is not a library database, and interrupted-replace recovery, plus Operator UI tests for export and import.
  - Add a Release Specific checklist item: "With no desktop app, export the library from the Operator and import it into a fresh server, on Linux and Windows."
- **Deferrals / Follow-ups**:
  - None yet.

### P26e - Desktop Source Management Link

- **Status**: ⏳ Planned
- **Goal**: The desktop's Manage Sources dialog is replaced by a link that opens source management in the Operator.
- **Scope**:
  - Planned for v0.15.0. Depends on: Operator Source and Item Management.
  - Replace the **Manage Sources** dialog with a **Manage Sources** menu item that opens the Operator's Manage Sources section in the browser, for the server the desktop is connected to.
  - Remove `ManageSourcesDialog`, its rename dialog, and its duplicate-scope prompt. Duplicate review moves to the Operator with source management.
  - **Import Folder** stays in the desktop Library menu.
  - Update the testing checklist and docs for the moved workflow.
- **Acceptance criteria**:
  - **Manage Sources** opens the Operator's source section for the connected server and no longer opens a desktop dialog.
  - The desktop has no source rename, remove, enable, or duplicate workflow of its own.
  - **Import Folder** still works from the desktop.
- **Verification evidence**:
  - Completion evidence must include a desktop test that the menu item opens the expected Operator URL, `dotnet test ReelRoulette.sln`, and one quick spot check.
- **Deferrals / Follow-ups**:
  - None yet.

### P27a - Structured Log Schema, Writer, and Ingestion

- **Status**: ⏳ Planned
- **Goal**: `last.log` is JSON Lines written by one server writer, for server logs and ingested client logs alike, with correlation fields and deterministic rotation.
- **Scope**:
  - First milestone of the structured log foundation release, planned for v0.15.1. Depends on: Server Data Folder Override, whose folder helper resolves the log path.
  - Today `last.log` is free text: a few server paths append bracketed lines by hand, the server's `ILogger` output goes only to the console, client logs arrive through `POST /api/logs/client` as source, level, and message, and startup empties the file. Decide here whether startup still empties it once rotation exists.
  - Schema, one JSON object per line:
    - required on every entry: `ts`, `lvl`, `svc`, `comp`, `op`, `msg`, and the writer-assigned `ingestReqId`,
    - `lvl` is one of lowercase `trace|debug|info|warn|error|fatal`,
    - `svc` is one of `server|desktop|webui`; `android|ios` are reserved and not emitted,
    - optional fields in canonical order: `evt`, `data`, `ingestReqId`, `clientOpId`, `traceId`, `spanId`, `clientId`, `sessionId`, `ver`, `build`, `clientTs`, `srcIp`, `userAgent`; `evt` sits right after `op` and `data` right after `msg`,
    - `evt` is optional, dot-delimited, lowercase, stable, and low-cardinality, used only when it adds something `op` does not,
    - `data` is bounded: safe primitives, short allowlisted strings, and small objects, with no arbitrary object dumps,
    - `ex` is accepted on input only and normalized into `data.error` (`type`, `code`, `messageSafe`, optional bounded stack fingerprint); it is never a top-level field.
    - example: `{"ts":"...","lvl":"info","svc":"desktop","comp":"ui.main-window","op":"UpdateLibraryPanel","evt":"ui.library.panel.updated","msg":"Library panel updated.","data":{"totalCount":38833,"eligibleCount":163},"ingestReqId":"...","clientOpId":"...","traceId":"...","spanId":"...","clientId":"...","sessionId":"...","ver":"...","build":"...","clientTs":"...","srcIp":"...","userAgent":"..."}`
  - One writer for the server's `ILogger` pipeline (a logging provider) and for `POST /api/logs/client`. The hand-written appends go through it.
  - Time and correlation:
    - `ts` is the server write time and decides order; `clientTs` is the client's event time, kept for context,
    - `clientOpId` is an optional client operation id, kept when provided,
    - request-scoped HTTP and event stream logs carry W3C `traceId` and `spanId` when trace context is active; background and client-local events may omit them,
    - `srcIp` and `userAgent` are added by the server, never by clients.
  - Strict ingestion at `POST /api/logs/client`: keep valid fields as sent without inferring `lvl`, `comp`, or `op` from the message; reject missing required fields, invalid `lvl` or `svc`, invalid or oversized `data`, and unknown fields; return a `400` listing every error with `code`, `field` (dotted path such as `data.error.code`), and `reason`. JSON serialization also closes the forged-line problem in `docs/full-audit.md` finding 21 (`AppendClientLog` does not sanitize newlines or control characters).
  - Rotation: rotate at 25 MB, keep the current file plus 10 uncompressed archives, enforce retention at startup before writing, and define what happens to a single oversized entry and to concurrent appends.
  - Human-readable rendering is a view over the fields (Operator, console), not what is stored.
  - Contract change for `POST /api/logs/client` in OpenAPI and the generated WebUI types.
- **Acceptance criteria**:
  - Every `last.log` line is a JSON object with the required fields and canonical field order.
  - `lvl` and `svc` values are always from their fixed lists.
  - Server `ILogger` logs and ingested client logs go through the same writer, and every persisted entry has a writer-assigned `ingestReqId`.
  - Client entries keep `clientTs`, `clientOpId`, and trace fields as sent, and `ts` is the write time.
  - Invalid client payloads get a `400` with every error listed and are not written.
  - A client message with line breaks or control characters cannot produce a second log line.
  - Rotation, retention, oversized entries, and concurrent appends behave as documented.
- **Verification evidence**:
  - Completion evidence must include schema and order tests, rejection tests for each invalid case, correlation and time-field tests, rotation and retention edge-case tests, `dotnet test ReelRoulette.sln`, and `npm run verify:contracts`.
  - Docs evidence must include the schema, ingestion contract, and rotation rules in `docs/api.md` and `docs/architecture.md`.
- **Deferrals / Follow-ups**:
  - The Operator log view keeps reading the file through its current route until Operator Log Viewer.

### P27b - Structured Log API and Privacy Rules

- **Status**: ⏳ Planned
- **Goal**: Desktop and WebUI log through a typed structured API that requires explicit metadata and makes privacy-safe entries the only kind it can emit.
- **Scope**:
  - Last milestone of the structured log foundation release, planned for v0.15.1. Depends on: Structured Log Schema, Writer, and Ingestion.
  - Level-typed methods for desktop and WebUI, each with explicit `comp` and `op`:
    - `LogTrace(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogDebug(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogInfo(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogWarn(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogError(comp, op, evt? = null, msg, data? = null, ex? = null, context? = null)`
    - `LogFatal(comp, op, evt? = null, msg, data? = null, ex? = null, context? = null)`
  - `lvl` comes from the method; there is no parsing of `comp` or `op` from the message.
  - `LogContext = { clientOpId?, traceId?, spanId?, clientId?, sessionId?, ver?, build?, clientTs? }`; `ingestReqId`, `srcIp`, and `userAgent` are never client-supplied.
  - Baseline `comp` names: desktop `ui.main-window`, `ui.player`, `ui.settings`, `core.client`, `playback.vlc`, `library.panel`; server `api`, `auth`, `sse`, `playback`, `refresh.pipeline`, `storage`; WebUI `web.app`, `web.player`, `web.api`, `web.sse`.
  - Privacy by construction, enforced by the API rather than by rewriting entries afterwards:
    - `msg` and `data` never carry file names or paths, tag or category names, preset or source names, search text, tokens, cookies, PINs or other secrets, or raw media identifiers that reveal content. The one exception is the one-time first-run setup code from Admin First-Run Setup, which the server logs only while no account exists,
    - prefer fixed templates with counts, booleans, and durations, for example `"Saved desktop settings."` with `data: { wroteBackup: true }`, or `"API request failed."` with `data: { endpoint: "SetFavorite" }` and no URL,
    - `ex` on `LogError` and `LogFatal` becomes `data.error` with `type`, `code`, `messageSafe`, and an optional fingerprint; raw stack traces, local paths, and payload fragments are not emitted,
    - `data` is checked for size and shape before serialization.
  - Until the migration milestones, the existing desktop `Log(string)` calls and the WebUI status relay keep working by emitting through the new API as `comp` `legacy`, `op` `unmigrated`, level `info`. This is the only inferred path, and the migration milestones remove it.
- **Acceptance criteria**:
  - Desktop and WebUI have the level-typed API with explicit `comp` and `op`, optional `evt`, and typed context.
  - `ex` is always written as privacy-safe `data.error`, never as a top-level field.
  - Oversized or arbitrary `data` is rejected before it is written.
  - The legacy path is the only one that emits `comp` `legacy`, and it is documented as temporary.
  - The `comp` baseline and privacy rules are documented.
- **Verification evidence**:
  - Completion evidence must include API tests per level, `ex` normalization tests, context mapping tests, negative tests that paths, names, and secrets in the shapes above are refused, `dotnet test ReelRoulette.sln`, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - Migrating desktop call sites is Desktop Log Migration; WebUI call sites are WebUI Instrumentation.

### P27c - Desktop Log Migration

- **Status**: ⏳ Planned
- **Goal**: Every desktop log call uses the structured API, and the legacy `Log(string)` path is gone and cannot come back.
- **Scope**:
  - First milestone of the structured log migration release, planned for v0.17.0. Depends on: Structured Log API and Privacy Rules.
  - The desktop has about 660 `Log(` call sites, most of them in `MainWindow.axaml.cs`.
  - Move every call site to the structured API with a fitting level: `trace` or `debug` for noisy detail, `info` for state changes, `warn` for recoverable problems, `error` for failures, `fatal` for unrecoverable ones.
  - Rewrite messages that carry file names, paths, tag names, or other content to fixed templates.
  - Delete `Log(string)` and the `legacy` path on the desktop, and add a test or analyzer rule that fails if a string-only log path or message parsing comes back.
  - Example: `LogInfo(comp: "ui.main-window", op: "UpdateLibraryPanel", evt: "ui.library.panel.updated", msg: "Library panel updated.", data: { totalCount: 38833, eligibleCount: 163 })`.
- **Acceptance criteria**:
  - No desktop `Log(string)` call or `legacy` entry remains.
  - Desktop entries have explicit `comp` and `op` and fitting levels.
  - A reintroduced string-only log call fails the build or tests.
  - Desktop entries contain no file names, paths, or tag names.
- **Verification evidence**:
  - Completion evidence must include a before and after call-site inventory, the guard test failing on a reintroduced call, a scan of a captured desktop `last.log` for paths and names, and `dotnet test ReelRoulette.sln`.
- **Deferrals / Follow-ups**:
  - None yet.

### P27d - Server Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The server logs its meaningful decisions and failures as structured entries, not only transport events.
- **Scope**:
  - Planned for v0.17.0. Depends on: Structured Log Schema, Writer, and Ingestion.
  - Structured logs for: API handlers and login and session outcomes, event stream connect and disconnect, refresh pipeline stages and outcomes, catalog open, import, backup, and replace, and settings changes and their errors. Playback decisions are logged by the playback sessions release.
  - Favor state changes, decisions, degradations, and failures over repetitive noise.
  - Move the remaining hand-built server log lines to `ILogger` with structured fields.
- **Acceptance criteria**:
  - Each listed area emits structured entries with `comp`, `op`, and fitting levels.
  - Request-scoped entries carry trace fields when trace context is active, and every entry carries `ingestReqId`; `clientOpId` appears only when a client sent one.
  - Server entries contain no file names, paths, tag names, or secrets.
- **Verification evidence**:
  - Completion evidence must include a captured entry per listed area, correlation checks, and a scan of a captured `last.log` for paths, names, and secrets.
- **Deferrals / Follow-ups**:
  - None yet.

### P27e - WebUI Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The WebUI logs its key flows as structured entries instead of relaying status-line text.
- **Scope**:
  - Planned for v0.17.0. Depends on: Structured Log API and Privacy Rules, and WebUI Login Gate.
  - Today the WebUI logs mainly by relaying each status-line message as free text.
  - Structured logs for app startup and compatibility checks, login, event stream connect and retry, API request failures, and major user actions and error states.
  - Five flows with stable operation names: `BootstrapSession` (startup and compatibility gating), `LoginSession` (account tile, PIN, and session start), `SseLifecycle`, `RandomPickAndPlay`, and `MutateItemState` (favorite, blacklist, and tag-edit apply).
  - Remove the status-line relay and the `legacy` path in the WebUI, with a test that fails if string-only logging or message parsing comes back.
- **Acceptance criteria**:
  - The five flows emit structured entries, with trace linkage on request-scoped steps.
  - `MutateItemState` covers favorite, blacklist, and tag-edit apply.
  - No WebUI string-only logging or `legacy` entry remains.
  - WebUI entries contain no file names, paths, tag names, search text, or PINs.
- **Verification evidence**:
  - Completion evidence must include one captured entry per flow and `MutateItemState` case, the guard test, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - None yet.

### P27f - Operator Log Viewer

- **Status**: ⏳ Planned
- **Goal**: The Operator can filter and page structured logs by field, text, and time without shell access.
- **Scope**:
  - Planned for v0.17.0. Depends on: Structured Log Schema, Writer, and Ingestion, and Operator UI Extraction.
  - Rename **Server Logs** to **Log Viewer** across the Operator, API, tests, and docs, and rename `GET /control/logs/server` to `GET /control/log-viewer` in one step. There is no alias period: the bundled Operator page is the route's only caller and ships in the same binary.
  - The route stays read-only; logs are still written directly to `last.log`.
  - Server-side filters: `svc`, `lvl`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`, message text, and a time window. Client-side filtering only refines results already fetched.
  - Newest first by `ts`, tie-broken by `ingestReqId` and then a stable row sequence, with a versioned cursor and defined `from` and `to` bounds, so paging never repeats or skips rows.
  - Read from the end of the file and across rotated archives instead of walking every line on each request (`docs/full-audit.md` finding 12, `ServerLogService.Read` walks the entire log on every request).
  - Operator view: controls collapsed by default with active-filter chips, readable rows with expandable raw JSON, and auto-refresh that pauses while scrolled away from the newest rows, with a resume control.
- **Acceptance criteria**:
  - The Operator Log Viewer filters by every listed field, text, and time window.
  - `/control/logs/server` is gone and `/control/log-viewer` is in OpenAPI and `docs/api.md`.
  - The same filters and cursor return the same rows, and paging never repeats or skips a row.
  - A request reads only as much of the log as its page needs.
  - Controls start collapsed and show active filters; rows expand to raw JSON; auto-refresh pauses and resumes as described.
- **Verification evidence**:
  - Completion evidence must include paging tests across page and archive boundaries, replay tests for identical filters, a read-cost test on a large log, Operator UI tests for the view, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - None yet.

### P27g - Client Log Relay Reliability

- **Status**: ⏳ Planned
- **Goal**: Client log relay never blocks or interrupts user actions, and its retries are bounded and predictable.
- **Scope**:
  - Last milestone of the structured log migration release, planned for v0.17.0.
  - Desktop and WebUI relay asynchronously with bounded retries and a bounded queue; a failing log endpoint drops entries after the bound instead of slowing the client.
  - Add Release Specific checklist items for a combined trace across server and both clients for one end-to-end flow, and for a simulated log endpoint failure during normal use.
- **Acceptance criteria**:
  - A failing or slow `POST /api/logs/client` does not delay or interrupt any user action on either client.
  - Retry and drop behavior matches its documented bounds.
  - `last.log` holds server and both clients' entries through the same writer.
- **Verification evidence**:
  - Completion evidence must include relay tests with a failing and a slow endpoint on both clients, `dotnet test ReelRoulette.sln`, and `npm run verify`. The end-to-end trace and failure simulation are the Release Specific checklist items above.
- **Deferrals / Follow-ups**:
  - None yet.

### P28a - Reverse Proxy and HTTPS Access

- **Status**: ⏳ Planned
- **Goal**: The server works correctly behind an HTTPS reverse proxy, and the docs show how to set one up, including `tailscale serve`.
- **Scope**:
  - First milestone of the accounts release, planned for v0.16.0. HTTPS comes before PIN login so LAN and remote logins do not send PINs in clear text. The server does not serve HTTPS itself.
  - Document reverse proxy setup in `README.md` and `docs/dev-setup.md`: a general proxy example and `tailscale serve`, with the headers the server needs.
  - Server fixes so it behaves correctly behind a proxy:
    - Honor forwarded headers only from configured proxies. A request that came through a proxy is not a localhost request, even when the proxy runs on the server machine, so localhost trust applies only to direct loopback connections. Check during this milestone which forwarding headers `tailscale serve` sends; if a proxy sends none, document that it must, or how the server is told the proxy address.
    - Treat a missing remote address as not local (`docs/full-audit.md` finding 8, `RemoteIpAddress == null` treated as local).
    - Mark cookies `Secure` when the original request was HTTPS, and never send `SameSite=None` without `Secure` (`docs/full-audit.md` finding 9, `SameSite=None` allowed without `Secure`).
    - Accept `https` origins for CORS and build LAN origins with the scheme clients actually use (`docs/full-audit.md` finding 10, CORS hard-coded to HTTP only).
    - Links the server builds (Operator links, runtime config) use the proxied scheme and host.
  - Android PWA install, folded in from the backlog: found in the v0.12.0 manual regression pass on a Google Pixel 8 Pro, Add to Home Screen only creates a shortcut that opens in Chrome. Likely cause, not confirmed on a device: the WebUI registers its service worker only in a secure context, and a plain-HTTP LAN address is not one, so Chrome has no service worker and does not offer Install app. iOS installs from its home-screen meta tags without one. Over HTTPS through a proxy, Install app should open the WebUI standalone; check the manifest fields Chrome requires if it does not.
  - Add Release Specific checklist items: "Behind `tailscale serve` and one other HTTPS proxy, desktop, WebUI, and Operator connect, log in, browse, and play, and the server treats them as remote," and "On Android Chrome over HTTPS, Install app opens the WebUI standalone with its icon; iOS Add to Home Screen and desktop browser install still open standalone."
- **Acceptance criteria**:
  - Behind an HTTPS reverse proxy, desktop, WebUI, Operator, the event stream, and media range requests work.
  - A request through a proxy on the server machine is not treated as localhost.
  - Cookies are `Secure` for HTTPS clients, and CORS accepts the HTTPS origin.
  - A request with no remote address is not treated as local.
  - On Android Chrome over HTTPS, Install app opens the WebUI as a standalone app, and iOS and desktop browser installs still do.
  - The docs give working `tailscale serve` and general proxy setups.
- **Verification evidence**:
  - Completion evidence must include server tests for forwarded-header trust, proxied-localhost handling, missing remote address, cookie flags, and HTTPS CORS origins, plus one quick spot check through `tailscale serve`. The proxy matrix and the Android and iOS install pass are the Release Specific checklist items above.
- **Deferrals / Follow-ups**:
  - None yet.

### P28b - Source Access Policy

- **Status**: ⏳ Planned
- **Goal**: Every path that reads or serves library items asks one server-side source access policy, which allows everything until per-user permissions exist.
- **Scope**:
  - Planned for v0.16.0.
  - Today source enabled state is applied by separate SQL conditions in list query, random selection, and item play, and some paths skip it: `GET /api/media/{idOrToken}` streams any item by its raw id regardless of its source.
  - Add one policy that takes the request's session context and returns the sources it may see, and apply it on every item path: library list query, random selection, item play, `GET /api/media/{idOrToken}` (tokens and raw ids), `GET /api/thumbnail/{itemId}`, `POST /api/library/item`, `POST /api/library-states`, the tag-editor model, auto-tag and duplicate scans, library stats, and `GET /api/sources`.
  - The default policy allows every enabled source, so behavior does not change, except that a raw item id of a disabled source no longer streams.
  - No accounts or permission UI yet.
- **Acceptance criteria**:
  - Every listed path goes through the policy, and a test policy that denies a source hides that source's items on every one of them.
  - Current behavior is unchanged with the default policy, except that disabled-source items no longer stream by raw id.
  - Docs separate implemented source state from future per-user access.
- **Verification evidence**:
  - Completion evidence must include a denying-policy test per listed path, a raw-id media test for a disabled source, and `dotnet test ReelRoulette.sln`.
- **Deferrals / Follow-ups**:
  - Per-user grants are Per-User Source Permissions.

### P28c - Account Store

- **Status**: ⏳ Planned
- **Goal**: Accounts live in their own server store, separate from the library catalog.
- **Scope**:
  - Planned for v0.16.0.
  - Accounts are not stored in `library.db`. Catalog export, import, and backups copy or replace that whole file, so accounts there would ship PIN hashes inside every export and be replaced by every import.
  - Store accounts in their own SQLite database in the server data folder (for example `accounts.db`), resolved through the server data folder helper.
  - What catalog transfer does with accounts:
    - catalog export and the catalog checkpoint do not contain accounts,
    - catalog import replaces the catalog and leaves accounts as they are,
    - catalog backups do not contain accounts; the account store keeps its own backup copies on the catalog backup schedule, in separate files that a catalog restore does not touch.
  - Account records: stable id, name, level (admin or user), and a bcrypt or Argon2 PIN hash. No custom, fast, or reversible PIN storage. Multiple admins are allowed.
  - No default account is seeded. A store with no accounts is the first-run setup state, handled by Admin First-Run Setup.
  - Per-account, per-device failed attempts, with a one-hour lockout after 10 failures.
  - There is no guest account. Localhost connections are trusted as admin without an account session (see PIN Login API and Sessions).
  - Source permissions will reference account ids here and source ids in the catalog, so the schema keeps account identity stable across name and PIN changes.
- **Acceptance criteria**:
  - Accounts persist in their own store with stable id, name, level, and a bcrypt or Argon2 hash, and no plaintext PIN.
  - A new store has no accounts, and no default account or PIN exists.
  - Catalog export contains no account data, catalog import leaves accounts unchanged, and catalog backups contain no account data.
  - The account store has its own backups, and a catalog restore does not touch them.
  - Failed attempts are tracked per account and device, with a deterministic lockout end.
- **Verification evidence**:
  - Completion evidence must include store tests for creation, an empty new store, hashing, levels, lockout, and backups, and tests that a catalog export, import, and backup neither contain nor change accounts.
  - Docs evidence must describe account storage, backups, and the empty first-run state without describing login flows as implemented.
- **Deferrals / Follow-ups**:
  - None yet.

### P28d - PIN Login API and Sessions

- **Status**: ⏳ Planned
- **Goal**: LAN and remote clients log in with an account PIN and get a session; localhost stays trusted.
- **Scope**:
  - Planned for v0.16.0. Depends on: Account Store, and Reverse Proxy and HTTPS Access.
  - Add a login route: the client sends account id, device id, and PIN, and gets a per-client session token on success.
  - Sessions are not persisted; clients log in again after a restart.
  - Enforce lockout on the server and return lockout state and remaining time.
  - Define logout, session invalidation, and how account identity reaches HTTP and event stream handlers.
  - Localhost trust: a direct localhost connection is trusted as admin and needs no PIN. A request through a reverse proxy is not localhost.
  - There is no general auth-off mode once accounts exist: the API `AuthMode` `Off` setting and running without a shared token no longer open the API to LAN clients.
  - Remove pairing and the shared pairing token, with no migration; old pairing cookies and tokens fail. Remove query-string tokens (`docs/full-audit.md` finding 2, `AllowLegacyTokenAuth` defaults to `true`, accepting tokens via query string).
  - Compare session tokens in constant time (`docs/full-audit.md` finding 7, non-constant-time comparison of secrets).
- **Acceptance criteria**:
  - A correct PIN returns a session tied to the account, client, and device.
  - Failed PINs count per account and device, lock out for one hour after 10 failures, and return lockout details.
  - Sessions do not survive a server restart.
  - Direct localhost requests work without a session; LAN, remote, and proxied requests need one.
  - No setting turns authentication off for LAN or remote clients.
  - Pairing, the shared pairing token, and query-string tokens are no longer accepted.
- **Verification evidence**:
  - Completion evidence must include server tests for login, wrong PIN, lockout and its expiry, logout, restart, localhost and proxied requests, and rejection of old pairing tokens.
  - Contract evidence must include OpenAPI and `docs/api.md` for the login and session payloads and the lockout error.
- **Deferrals / Follow-ups**:
  - None yet.

### P28e - Auth Cutover for API and Operator

- **Status**: ⏳ Planned
- **Goal**: Every API route, the event stream, and the Operator require an account session from LAN and remote clients, and the separate control token is gone.
- **Scope**:
  - Planned for v0.16.0. Depends on: PIN Login API and Sessions.
  - Require a session on every API and control route and on the event stream for non-localhost requests.
  - The Operator uses admin account sessions and no longer accepts the control token added in v0.14.0. Remove the control token, its setting, and its prompt.
  - Admin-only operations (control plane, source and item management, catalog transfer, account administration, testing routes) reject user-level accounts. Testing routes use the same check as the rest of the control plane (`docs/full-audit.md` finding 19, `OperatorTestingService` mutations protected only by middleware policy).
  - Settings reads no longer return secrets (`docs/full-audit.md` finding 20, auth and secret fields in DTOs encourage credential leakage; `GET /control/settings` returns the admin token today).
  - Remove pairing and control-token flows from clients, docs, and contracts.
  - External programmatic API access stays out of scope.
- **Acceptance criteria**:
  - LAN and remote requests without a valid session get a deterministic auth error on every API and control route and on the event stream.
  - The Operator uses account sessions, and no control token is accepted anywhere.
  - User-level accounts are refused on admin-only operations.
  - No settings response contains a secret.
  - Active docs no longer describe pairing or control tokens.
- **Verification evidence**:
  - Completion evidence must include authorization tests across library, playback, source, event stream, Operator, and testing routes for localhost, admin, user, and no session.
- **Deferrals / Follow-ups**:
  - None yet.

### P28f - Admin First-Run Setup

- **Status**: ⏳ Planned
- **Goal**: The first admin account is created in the Operator, from localhost directly or from another machine with a one-time setup code, before any LAN or remote client can log in.
- **Scope**:
  - Planned for v0.16.0. Depends on: Auth Cutover for API and Operator.
  - There is no default account and no default PIN. First-run setup state is an account store with no accounts.
  - In that state, the server generates a random one-time setup code from a cryptographic random source on start, writes it to the server log, and shows it in the Operator opened on localhost. Each start without accounts makes a new code, and the previous one stops working.
  - The setup code is the only secret the server writes to its log, and only while no account exists. The structured log privacy rules carry it as their one documented exception.
  - From localhost, the Operator opens straight into setup and needs no code. From another machine, the Operator shows only a setup code prompt, and only the setup route accepts LAN or remote requests until setup finishes.
  - Setup creates the first admin account with a name and a PIN.
  - The code stops working as soon as the first admin account exists, and the server no longer generates or logs one.
  - Failed code attempts count per device with the same one-hour lockout after 10 failures as PIN login, the code is compared in constant time, and it never appears in a URL.
  - Desktop and WebUI login from LAN or remote clients is blocked until setup is done, with a message pointing to the Operator. Localhost clients keep working.
  - Add a Release Specific checklist item: "On a fresh install, LAN login is blocked until the first admin is created: from localhost without a code, and from another machine only with the setup code from the server log; the code is refused afterwards."
- **Acceptance criteria**:
  - Setup state is detected from the account store and ends when the first admin account exists.
  - On start with no accounts, a new setup code is written to the server log and shown in the Operator on localhost, and the previous code is refused.
  - Localhost setup needs no code. Setup from another machine needs the current code, and wrong codes lock that device out after 10 failures.
  - Once the first admin exists, the code is refused and no new code is generated or logged.
  - LAN and remote desktop and WebUI logins report setup-incomplete and are refused until setup finishes.
- **Verification evidence**:
  - Completion evidence must include server tests for code generation, logging, replacement on restart, constant-time comparison, lockout, refusal after the first admin exists, and setup-only access before setup, plus Operator UI tests for setup from localhost and from another machine with the code.
- **Deferrals / Follow-ups**:
  - None yet.

### P28g - Operator Account Administration

- **Status**: ⏳ Planned
- **Goal**: Admins create and maintain accounts in the Operator.
- **Scope**:
  - Planned for v0.16.0. Depends on: Admin First-Run Setup.
  - An admin-only Access Control section: list accounts with name and level, add accounts with name, level, and initial PIN, edit name and level, reset a PIN, and remove accounts.
  - The last admin cannot be removed or demoted.
  - Admins change their own name and PIN through the same self-service flow as users.
- **Acceptance criteria**:
  - Admins can list, add, edit, reset PINs for, and remove accounts.
  - User-level accounts cannot reach account administration.
  - The last admin cannot be deleted or demoted.
  - Changes persist across restart and apply to later logins.
- **Verification evidence**:
  - Completion evidence must include server tests for account changes, last-admin protection, level changes, and PIN resets, and Operator UI tests for the section and its errors.
- **Deferrals / Follow-ups**:
  - None yet.

### P28h - Self-Service PIN Change

- **Status**: ⏳ Planned
- **Goal**: Logged-in users change their own PIN from every client.
- **Scope**:
  - Planned for v0.16.0. Depends on: Operator Account Administration.
  - A PIN change route that needs the old PIN, the new PIN, and a confirmation.
  - The flow in the Operator, desktop, and WebUI for admins and users.
  - Reuse server hashing, validation, and lockout, and never return a PIN.
  - Define what happens to the current session after a change.
- **Acceptance criteria**:
  - Admins and users can change their own PIN with the old PIN, a new PIN, and a matching confirmation.
  - Wrong old PIN, mismatched confirmation, invalid new PIN, and lockout return clear errors.
  - The next login needs the new PIN.
  - The flow is available in all three clients without admin rights.
- **Verification evidence**:
  - Completion evidence must include server tests for each success and failure path and client tests for the validation messages.
- **Deferrals / Follow-ups**:
  - Profile editing beyond name and PIN stays out of scope.

### P28i - Desktop Login Gate

- **Status**: ⏳ Planned
- **Goal**: The desktop asks for a PIN before the main window loads when its server is not on the same machine.
- **Scope**:
  - Planned for v0.16.0. Depends on: Self-Service PIN Change.
  - A desktop connected to a localhost server is trusted and shows no login.
  - Otherwise, show a login window before the main window: an account tile grid with `admin_panel_settings` for admins and `account_circle` for users, names below; a PIN prompt on selecting a tile.
  - Server-unavailable and setup-incomplete messages with retry or a pointer to the Operator.
  - No persisted session: log in each time the app opens.
  - Add a Release Specific checklist item: "A desktop on another machine needs a PIN on every launch and after a server restart; a desktop on the server machine does not."
- **Acceptance criteria**:
  - With a non-localhost server, the main window is unreachable until a PIN login succeeds; with a localhost server, no login is shown.
  - Server-unavailable and setup-incomplete states block login with clear messages.
  - Tiles use the required icons and account names.
  - Failed PINs and lockouts show clear errors, including the remaining lockout time.
  - Restarting the desktop needs a new login.
- **Verification evidence**:
  - Completion evidence must include desktop tests for login, server unavailable, setup incomplete, wrong PIN, lockout, localhost trust, and no session reuse.
- **Deferrals / Follow-ups**:
  - Remembered accounts, biometrics, and offline login are out of scope.

### P28j - WebUI Login Gate

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for a PIN before any library or player surface when it is not opened from the server machine.
- **Scope**:
  - Planned for v0.16.0. Depends on: Desktop Login Gate.
  - Opened from localhost, the WebUI is trusted and shows no login.
  - Otherwise, show the account tile grid before the shell, library, player, or random controls, with the same icons as the desktop.
  - PIN prompt, setup-incomplete message, and no persisted session: log in on every open or reload.
  - API and event stream calls carry the session after login.
  - Add a Release Specific checklist item: "The WebUI from another device needs a PIN on every open and reload, on desktop and phone browsers; from the server machine it does not."
- **Acceptance criteria**:
  - From another device, no library, random, or player surface is reachable before login; from localhost, no login is shown.
  - Tiles use the required icons and names at desktop and mobile widths.
  - Failed PINs and lockouts show clear errors, including the remaining lockout time.
  - Reloading or reopening needs a new login.
  - API and event stream traffic uses the logged-in session.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for gating, login, setup incomplete, wrong PIN, lockout, session use, and reload, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - Offline PWA login and remember-me sessions are out of scope.

### P28k - Per-User Source Permissions

- **Status**: ⏳ Planned
- **Goal**: Admins choose which sources each user sees, and the source access policy enforces it.
- **Scope**:
  - Planned for v0.16.0. Depends on: Source Access Policy, Operator Account Administration, and Operator Source and Item Management.
  - Per-source, per-user access in the Operator's Manage Sources section.
  - Grants are stored in the account store against account ids and catalog source ids. A grant for a source id that is not in the catalog (for example after a catalog import) is ignored and shown as stale in the Operator.
  - Enforce denied sources through the source access policy on every path it covers, including `GET /api/media/{idOrToken}`, `GET /api/thumbnail/{itemId}`, and `POST /api/play/{itemId}`.
  - Admins and localhost connections see every source.
  - Groups, invitations, and audit reporting stay out of scope.
- **Acceptance criteria**:
  - Admins can grant or deny each user each source in the Operator.
  - Denied sources and their items are invisible to that user on every policy path.
  - A denied item cannot be streamed, played, or have its thumbnail read, even by a client that knows its id.
  - Permission changes reach active sessions through events or requery.
  - Grants survive account and source renames, and a catalog import leaves grants for missing sources inert.
- **Verification evidence**:
  - Completion evidence must include policy tests for every path with a denied source, direct-id bypass tests, a catalog-import test for stale grants, and Operator UI tests for permission editing.
- **Deferrals / Follow-ups**:
  - None yet.

### P28l - Permission-Aware Clients

- **Status**: ⏳ Planned
- **Goal**: Desktop and WebUI show only what the server allows the logged-in user, with clear empty and denied states.
- **Scope**:
  - Last milestone of the accounts release, planned for v0.16.0. Depends on: Per-User Source Permissions, and Desktop Source Management Link.
  - Desktop and WebUI source lists, library browse, random playback, and item playback rely only on what the server returns for the session.
  - The desktop **Manage Sources** link is shown only to admins and localhost.
  - Messages for a user with no visible sources and for an item that becomes inaccessible.
  - Update docs and the testing checklist for per-user source visibility.
  - Add a Release Specific checklist item: "An admin and a user account on desktop and WebUI see only their allowed sources, and a permission change in the Operator reaches both clients without a restart."
- **Acceptance criteria**:
  - Desktop and WebUI never show denied sources or play denied items.
  - Permission changes made in the Operator reach both clients through events or requery.
  - Client filtering cannot widen what the server returns.
  - Users without admin rights do not see the Manage Sources link.
- **Verification evidence**:
  - Completion evidence must include desktop and WebUI tests for hidden sources, inaccessible items, and the link's visibility.
- **Deferrals / Follow-ups**:
  - Client requests for source access, approval workflows, and external sharing remain out of scope.

### P29a - Library Query Performance

- **Status**: ⏳ Planned
- **Goal**: Library browse pages and loaded-window reloads cost about the same at any scroll depth, and a reload of the loaded window is one request.
- **Scope**:
  - Planned for v0.14.1.
  - Measured by the efficiency and divergence report on a copy of a 48,938-item catalog, through the real list query in a Release build: the first 200-item page takes about 50 ms and allocates about 11 MB. The page at offset 10,000 takes 177 ms and 104 MB, and at offset 40,000 takes 221 ms and 154 MB. Reloading 5,000 loaded tiles takes 2.45 s and 1.1 GB.
  - Causes measured in the same run:
    - Name order uses `COLLATE ORDINAL_IGNORE_CASE`, a managed collation callback with no index, so every page sorts the whole filtered set. The same page ordered by an indexed binary column takes 0.1 ms, against 19.9 ms with the callback.
    - Every page also runs two `COUNT(*)` queries of about 13.5 ms each, including on later pages of the same query.
    - A reload re-reads the window in 200-item pages, one request each, and the query limit is 500.
  - Add a stored, indexed sort key for file name whose order matches today's `OrdinalIgnoreCase` order, and order name sorts and name tie-breaks by it. A `ToLowerInvariant` key such as the existing `file_name_fold` would change today's order for names containing `_`, `[`, `\`, `]`, `^`, or `` ` ``, which sort after letters today and would sort before them. An uppercase-invariant key should keep it; the sort order tests confirm it. This is a catalog schema change with its own migration.
  - Skip both counts when the offset is above 0. The clients keep the totals from the first page.
  - Reload the loaded window in one request. Whether that raises the query limit or adds a reload request with its own bound is decided here; either is a contract change in its own slice.
  - Library stats: the per-source figures join items to sources by path prefix and re-derive video or photo from the file extension in SQL. Measured: about 90 ms in `sqlite3` and 138 ms through the service. Every item in the measured catalog has a source id and a media type of 0 or 1. Group by source id and media type instead, with the same results.
  - Drop `idx_item_tags_item_id`, which duplicates the leading `item_id` column of the `item_tags` primary key.
  - Measured trap for the tag filter: the tag filter compares `item_tags.name` with the managed collation inside a correlated `EXISTS`, which the planner runs through `idx_item_tags_item_id` and which takes 45 ms for a 22,476-item tag. Rewriting it as `item_tags.name_fold = ?` inside the same `EXISTS` makes the planner use `idx_item_tags_name_fold` for every item, and the same filter took 55 s. The form `items.id IN (SELECT item_id FROM item_tags WHERE name_fold = ?)` takes 35 ms. Any tag filter change keeps a plan of that shape, and after `idx_item_tags_item_id` is dropped the filter still looks up tags by item id through the primary key, both checked with `EXPLAIN QUERY PLAN`.
- **Acceptance criteria**:
  - Name, last played, play count, duration, and date added sorts return the same items in the same order as before, including names that differ only by case and names containing `_`, `[`, `\`, `]`, `^`, or `` ` ``.
  - A page at offset 40,000 of the measured catalog costs within a small factor of the first page, measured.
  - Pages after the first do not run count queries, and the clients still show the totals from the first page.
  - A reload of the loaded window is one request.
  - Library stats return the same global and per-source figures as before on the measured catalog.
  - Tag filters return the same items as before, and none takes longer than the current form on the measured catalog.
  - `item_tags` has one index on `item_id`.
- **Verification evidence**:
  - Completion evidence must include before-and-after timings and allocations, on a copy of a large catalog in a temp folder, for the first page, offset 10,000, offset 40,000, a 5,000-tile reload, a common-tag filter, a search, and library stats, plus `EXPLAIN QUERY PLAN` for the list, count, and tag filter queries.
  - Completion evidence must include tests that each sort order matches the previous order on a fixture with case-only and punctuation differences, the schema migration tests, `dotnet test ReelRoulette.sln`, and `npm run verify` after any contract change.
- **Deferrals / Follow-ups**:
  - Keyset paging instead of offsets, if the measured cost of deep offsets is still high after the sort key.

### P29b - Random Selection Performance

- **Status**: ⏳ Planned
- **Goal**: A random pick over the whole library reads only what selection needs and costs a few tens of milliseconds.
- **Scope**:
  - Planned for v0.14.1.
  - Measured by the efficiency and divergence report on a copy of a 48,938-item catalog: `POST /api/random` selection with the default filter takes about 240 ms and allocates about 105 MB per request, in every randomization mode. Reading the eligible items with all 28 columns takes 207 ms and 91 MB; the eligible-set signature, which lowercases and sorts every path on every request, takes 23 ms. Reading only the four columns selection needs takes 12 ms in `sqlite3`. A selective preset takes 35 ms.
  - Read only the columns selection and the response need: id, full path, play count, and last played for the eligible set, then the selected item's response fields.
  - Cache the eligible-set signature by catalog revision and filter, so an unchanged library and filter do not recompute it.
  - Replace the linear scans: the smart shuffle check of each dequeued path against the eligible list, and the final lookup of the selected item.
  - Selection results stay the same: the same modes, weights, shuffle-bag behavior, and folder spread.
- **Acceptance criteria**:
  - Each randomization mode picks from the same eligible set with the same weighting as before.
  - Smart shuffle still plays every eligible item once before repeating, and rebuilds its bag when the eligible set changes.
  - A random pick over the measured catalog with the default filter takes a few tens of milliseconds, measured before and after.
- **Verification evidence**:
  - Completion evidence must include before-and-after timings and allocations per randomization mode on a copy of a large catalog in a temp folder, tests that the selection rules are unchanged, and `dotnet test ReelRoulette.sln`.
- **Deferrals / Follow-ups**:
  - None yet.

### P29c - Desktop Thumbnail Memory and Caching

- **Status**: ⏳ Planned
- **Goal**: Desktop grid thumbnail memory stays bounded however far the user scrolls, and thumbnails are fetched again only when they change.
- **Scope**:
  - Planned for v0.14.1.
  - Found by the efficiency and divergence report from code reading, not measured:
    - Each tile keeps its decoded bitmap until its item changes or leaves the loaded window, including after it scrolls out of view. Thumbnails average 370×436 in the measured catalog, about 645 KB decoded each, so scrolling through 5,000 tiles could hold about 3 GB.
    - Each JPEG is decoded at full size, not at the tile's display size.
    - Every change of visible rows starts a new fetch loop over the visible tiles with no cancellation, so loops overlap during scrolling and can fetch the same thumbnail twice.
    - `GET /api/thumbnail/{itemId}` sends no cache headers, its URL has no revision, and the desktop keeps no cache of its own.
  - Release decoded bitmaps for tiles that leave the visible rows plus overscan, and load them again when they return.
  - Decode at the tile's display size.
  - Cancel a fetch loop when a newer one replaces it, and fetch each thumbnail once.
  - Add cache headers to thumbnail responses, or a revision to the thumbnail URL so it can be cached until the thumbnail changes. A revision in the URL needs the thumbnail revision in the list query page, which is a contract change in its own slice. The WebUI uses the same URLs and benefits from the same change.
- **Acceptance criteria**:
  - Scrolling the desktop grid through thousands of tiles and back keeps decoded thumbnail memory bounded by the visible rows plus overscan, measured.
  - A thumbnail is fetched once while it stays unchanged and is shown again after it scrolls back into view.
  - A regenerated thumbnail is shown on both clients without a restart.
  - Grid layout and placeholders behave as before.
- **Verification evidence**:
  - Completion evidence must include desktop tests for bitmap release and fetch cancellation, the process memory after scrolling a large catalog before and after, a server test for the thumbnail cache headers or revision, `dotnet test ReelRoulette.sln`, and `npm run verify` after any contract change.
- **Deferrals / Follow-ups**:
  - WebUI grid rendering is its own backlog item.

### P29d - Item IDs in the Contract

- **Status**: ⏳ Planned
- **Goal**: Every event and response that refers to a library item carries its item id, and desktop and WebUI match items by id instead of by path.
- **Scope**:
  - Planned for v0.14.1. Contract change in its own slice.
  - Found by the efficiency and divergence report: `playbackRecorded` carries only a path, the random and play responses put the full path in `id`, while item tag events and `POST /api/play/{itemId}` use item ids. Both clients therefore match event items by path: the desktop ignoring case, and the WebUI ignoring case and treating `/` and `\` as the same.
  - Add the item id to every event and response that refers to an item, including `playbackRecorded` and the random and play responses. Whether the random response's `id` becomes the item id, or the item id is a new field beside it, is decided here.
  - Return duration in seconds next to, or in place of, the `hh:mm:ss` string the WebUI parses back into seconds. Which one is decided here.
  - Desktop and WebUI match loaded tiles, the current item, and pending tag saves by item id, and stop folding paths to match them.
- **Acceptance criteria**:
  - Every item-related event and response in `shared/api/openapi.yaml` has an item id, and `npm run verify:contracts` passes.
  - Desktop and WebUI apply favorite, blacklist, playback, and tag events to the right tile by item id, including for two items whose paths differ only by case.
  - Neither client normalizes paths to match items.
  - Duration reaches both clients as a number of seconds.
- **Verification evidence**:
  - Completion evidence must include contract tests for each changed event and response, desktop and WebUI tests that match by id with two paths that differ only by case, `dotnet test ReelRoulette.sln`, and `npm run verify`.
  - Docs evidence must include `docs/api.md` for the changed events and responses.
- **Deferrals / Follow-ups**:
  - The server still treats paths that differ only by case as one path on Linux until Ordinal Path Identity on Linux. Matching by id on the clients removes their part of that problem.

### P30 - Shared Fixtures for Cross-Language Rules

- **Status**: ⏳ Planned
- **Goal**: Every rule implemented in both C# and the WebUI is locked to one shared fixture under `shared/fixtures/`.
- **Scope**:
  - Unscheduled. Add each fixture the next time its rule is touched, not all at once.
  - Found by the efficiency and divergence report: only tag name order is locked today. Preset equality, the status line messages, and the patch-or-reload rule get fixtures in their own milestones.
  - Rules still implemented in both languages with no shared fixture:
    - Justified grid layout: `ReelRoulette.Core.Library.LibraryGridLayout` and the WebUI `libraryGridLayout` port.
    - Tag save reconciliation: `TagSaveApply.cs` and `tagSave.ts`.
    - Filter duration text: the desktop filter dialog's duration labels and the WebUI's duration parse and format.
    - Path normalization for matching items, until item ids replace it.
  - Each fixture follows the existing tag name order pattern: one file under `shared/fixtures/`, read by a desktop or Core test and a WebUI test.
- **Acceptance criteria**:
  - Each listed rule has a fixture that both its C# and WebUI tests read, and changing an expected result in it fails both.
- **Verification evidence**:
  - Completion evidence per fixture must include a check that a flipped fixture entry fails both tests, `dotnet test ReelRoulette.sln`, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - A rule that moves to the server no longer needs a fixture.

### P31 - WebUI Grid Rendering

- **Status**: ⏳ Planned
- **Goal**: The WebUI library grid updates only the rows and tiles that change.
- **Scope**:
  - Unscheduled.
  - Found by the efficiency and divergence report from code reading, not measured: each change of visible rows replaces the rows' HTML, which recreates every tile image. Each patch and each appended page rebuilds the layout and virtualizer for every loaded item, so loading a window page by page costs time that grows with the square of its size.
  - Keep row elements that stay visible, add and remove only the rows that enter or leave, update a patched tile in place, and extend the layout for appended items instead of rebuilding it.
  - Grid layout, scrolling, focus, and tile behavior stay as they are.
- **Acceptance criteria**:
  - Scrolling keeps the image elements of rows that stay visible.
  - A favorite, blacklist, playback, or tag patch updates only the affected tile.
  - Appending a page does not lay out the already-loaded items again.
  - Layout results match the current layout for the same items and width.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for row reuse, tile patching, and append layout, before-and-after timings for rendering a large window in a browser, and `npm run verify`.
- **Deferrals / Follow-ups**:
  - None yet.

### P32 - Desktop and WebUI UI Rework

- **Status**: ⏳ Planned
- **Goal**: Rework the desktop and WebUI interfaces together so the same features look and read the same on both, keeping platform differences that are deliberate.
- **Scope**:
  - Unscheduled. Scope is not set yet; changes to user-facing UX need explicit approval.
  - Deliberate differences found by the efficiency and divergence report, which stay unless this milestone changes them: single-click play in the WebUI and double-click play on the desktop, and loudness normalization and local-first playback on the desktop only.
  - Decided here: whether the desktop keeps its filter summary line, and whether the WebUI gets one.
- **Acceptance criteria**:
  - Set when the scope is decided.
- **Verification evidence**:
  - Set when the scope is decided.
- **Deferrals / Follow-ups**:
  - None yet.

---

## Completed Milestones

Latest completions first:

### M10j4 - Document Unlisted Server Routes in OpenAPI

- **Status**: ✅ Complete
- **Goal**: Every route the server serves to clients is in `shared/api/openapi.yaml`.
- **Scope**:
  - Ships in v0.14.0. Additive contract change in its own slice.
  - The server serves four routes that the spec does not list: `GET` and `POST /api/backup/settings`, `GET /api/library/stats`, `GET` and `POST /api/web-runtime/settings`, and `GET` and `POST /control/startup`. The desktop calls the first three, and the Operator calls the web-runtime and startup routes.
  - Add them to the spec with the request and response shapes the server returns today, and regenerate the WebUI types.
  - `/` and `/runtime-config.json` stay out of the spec. `/health` was already in the spec and stays there.
  - No server or client behavior changes.
  - Scope expanded with approval: add `forceRescanLoudness` and `forceRescanDuration`, which the server already returns, to `RefreshSettingsSnapshot`, and remove the milestone ID from the spec's `info.description`.
- **Acceptance criteria**:
  - Each listed route and method is in the spec, and its schema matches what the server returns.
  - The spec's paths and the server's mapped API and control routes match, apart from `/` and `/runtime-config.json`.
  - `npm run verify:contracts` passes after regeneration.
- **Verification evidence**:
  - Path diff before the change, from the `MapGet` and `MapPost` literals in `ServerHostComposition.cs` and `ServerApp/Program.cs` against the spec's path and method pairs: the spec lacked exactly the seven listed operations, the server alone had `GET /` and `GET /runtime-config.json`, and the spec had nothing the server does not serve. The Operator page is mapped from a configured path, not a literal, and is also left out.
  - Added the seven operations and the `BackupSettingsSnapshot`, `WebRuntimeSettingsSnapshot`, `LibraryStatsResponse`, `LibraryGlobalStatsResponse`, `SourceStatsResponse`, `StartupLaunchStatus`, `StartupLaunchUpdateRequest`, and `StartupLaunchResult` schemas. Response fields are required, with `sharedToken`, `displayName`, and `averageDurationSeconds` nullable. `StartupLaunchUpdateRequest` requires no fields; the backup and web runtime settings `POST` bodies take the full snapshot, using the same schema as their responses. `POST /control/startup` lists `409` with the same body, and both startup operations list `401` and `403` like the other control routes. The regenerated WebUI types only gained lines.
  - `OpenApiRouteContractTests.Spec_ListsEveryMappedApiAndControlRoute` compares the scanned route mappings with the spec. Property-name shape tests serialize real `CoreSettingsService` get and update results for backup, web runtime, and refresh settings, and `LibraryOperationsService.GetLibraryStats` with a source that has no display name and a source with no items, using ASP.NET's default minimal API JSON options, and require the property names to equal the spec schema's, nested schemas included. They check property names only, not types, nullability, or required lists. `/control/startup` has no automated shape test; the captured responses below cover it. Against the HEAD spec, all five tests failed and the route test named exactly the seven missing operations. Removing `averageDurationSeconds` from `SourceStatsResponse` failed only the stats test, and adding an unserved `GET /api/bogus` failed only the route test. All passed again once the spec was restored.
  - `/control/startup` responses were captured from the Debug server started with `REELROULETTE_DATA_DIR`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` in a temporary folder on a random localhost port, then stopped by PID and removed. Run through `dotnet`, `GET` returned `200 {"supported":true,"launchServerOnStartup":false,"message":"…"}` and `POST` returned `409 {"accepted":false,"supported":true,"launchServerOnStartup":false,"message":"…"}`. Run as the app binary, `POST` with `true` returned `200` with `accepted: true` and wrote the autostart entry under the temporary `XDG_CONFIG_HOME`, the following `GET` reported it on, and `POST` with `false` removed it.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed: Core 270 (+5), Desktop 167. `npm run verify` passed, including `verify:contracts`, with 170 tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - Docs: `docs/api.md` already listed every route. It now says which server routes the spec leaves out, lists the refresh settings fields, and describes the `/control/startup` fields and `409`.
- **Deferrals / Follow-ups**:
  - A forced duration or loudness rescan resets the fingerprint parallelism setting to its default -> Post-Migration Fixes.

### M10j3 - Remove the Preset Match Route

- **Status**: ✅ Complete
- **Goal**: Remove `POST /api/presets/match`, which no client calls, and lock the desktop and WebUI preset comparisons to one shared fixture.
- **Scope**:
  - Ships in v0.14.0. Contract change in its own slice.
  - The desktop `CoreServerApiClient.MatchPresetAsync` is the route's only client method, and only a test calls it. The desktop compares presets with `LibraryPresetSelection.FiltersEqual`, and the WebUI with `filterStatesEqualForPresetMatch`. Neither asks the server.
  - Remove the route, `PresetMatchRequest` and `PresetMatchResponse` from `ApiContracts.cs` and `shared/api/openapi.yaml`, the regenerated WebUI types, the desktop client method and its request and response types, and the tests that call them.
  - Remove the server-side preset equality that only the route uses: `LibraryPlaybackService.TryMatchPreset`, `ResolvePresetByFilterState`, `ParseFilterState`, `FilterStateProjection`, and the token and value helpers only `ParseFilterState` calls.
  - `POST /api/random` still resolves `presetId` by name.
  - Add a shared fixture under `shared/fixtures/` listing pairs of filter states with whether they are the same preset, covering at least an unset global match mode against an explicit AND, per-category local match modes, include and exclude tags, source inclusion, media type, audio filter, duration bounds, and a saved filter that still carries `tagMatchMode`. Desktop and WebUI preset-equality tests both run against it.
- **Acceptance criteria**:
  - The route, its contract types, and its generated WebUI types are gone, and `npm run verify:contracts` passes.
  - The server has no preset equality code. `POST /api/random` with `presetId` gives the same result as before.
  - Desktop and WebUI preset-equality tests read the same fixture, and changing an expected result in it fails both.
  - The desktop filter dialog and library preset list, and the WebUI filter dialog preset heading, behave as before.
- **Verification evidence**:
  - Measured before planning with throwaway tests: both clients agreed on 15 of 18 saved-filter pairs. The desktop alone treated a `null` tag list and an empty `categoryLocalMatchModes` as different from none, and threw on a numeric duration. The removed server equality compared tags as case-insensitive sets, which neither client did.
  - Scope expanded with approval: both clients now compare included and excluded tags as case-insensitive sets and source IDs as case-sensitive sets that ignore order. Category mode maps compare by key regardless of key order, since an older saved preset can list categories in a different order than a filter built after the categories were reordered. The desktop treats a missing tag or source list as empty, ignores empty tag and source names, and treats an empty category mode map as none, matching the WebUI. Tag matching is identical on both clients only for ASCII names, since JavaScript `toUpperCase` and .NET `ToUpperInvariant` differ on some non-ASCII letters such as `ß`; both comparisons and `docs/api.md` say so.
  - `shared/fixtures/preset-filter-equality.json` has 37 entries, checked both ways round on each client. The category mode key order entry was added before its fix and failed on both the desktop and the WebUI (1 of 36 each) against the comparison without it. Against the old comparison code, 8 desktop and 5 WebUI entries failed, all of them the order, case, duplicate, `null` list, and empty map cases this change targets. Flipping `selected tag order is ignored` to `false` failed exactly that entry on both the desktop and the WebUI (1 of 35 each, before the category entry was added), and both passed again once it was restored. The `empty tag and source names are ignored` entry failed on the desktop alone (1 of 37) before the desktop dropped empty names, and passes on both now.
  - Removed `LibraryPlaybackService.TryMatchPreset`, `ResolvePresetByFilterState`, `ParseFilterState`, `FilterStateProjection`, and their token, duration, map, and array helpers. `ResolvePreset` stays. No test sent `presetId` without an inline filter, so `TrySelectRandom_ResolvesPresetIdByNameWhenNoFilterStateIsSent` was added: it resolves a differently cased preset name to that preset's filter and returns 404 for an unknown name. It passed against the HEAD server code and passes after the removal.
  - Removed the client and server tests that called the route or `TryMatchPreset`. The existing desktop and WebUI preset-selection tests still pass unchanged.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed: Core 265, Desktop 167 (+37 fixture cases). `npm run verify` passed, including `verify:contracts`, with 170 tests (+37 fixture cases). `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - Docs: `docs/api.md` no longer lists the route and describes the client comparison. `CONTEXT.md` and the `docs/migration-cleanup.md` status line are updated. Added `[Unreleased]` Changed and Removed entries and a Release Specific checklist check.
- **Deferrals / Follow-ups**:
  - The desktop drops a saved preset with a numeric duration to the default filter -> Post-Migration Fixes.

### M10j2 - Dead Code Removal Without Contract Changes

- **Status**: ✅ Complete
- **Goal**: Remove code that nothing calls at runtime, on every surface, without changing the API contract or user-visible behavior.
- **Scope**:
  - Ships in v0.14.0. Code that only tests call counts as unused. Test hooks that hold or observe a production code path stay (`Hold*` / `*Entered` and `CancelRunsForShutdown` in `RefreshPipelineService`, `LibraryCatalogBackup.WaitForPending`, `ClientLogRelay.DisableForTests`, `AppDataManager.UseDirectoryForTests`).
  - The WebUI `events/sseClient.ts` (`createSseClient`) and `buildEventsUrl` in `events/eventEnvelope.ts` stay, although only their tests call them today: the client event efficiency milestone wires them into the WebUI for reconnect resume.
  - Found by the v0.14.0 planning report: the Roslyn unused-member analyzers (IDE0051, IDE0052, IDE0060) run on a copy of the repo, TypeScript `--noUnusedLocals --checkJs`, and caller searches. Removing one item can leave others unused, so re-run those checks until they report nothing.
  - Three slices, each verified on its own:
  - Desktop slice:
    - The never-constructed `MigrationDialog` (`MigrationDialog.axaml`, `MigrationDialog.axaml.cs`, `MigrationTagViewModel`).
    - Handlers for the removed History, Recently Played, Favorites, and Blacklist list views, which nothing wires: `HistoryPlayAgain_Click`, `RecentlyPlayedPlay_Click`, `RecentlyPlayedShowInFileManager_Click`, `RecentlyPlayedRemove_Click`, `BlacklistPlay_Click`, `BlacklistRemove_Click`, `BlacklistShowInFileManager_Click`, `FavoritesPlay_Click`, `FavoritesRemove_Click`, `FavoritesShowInFileManager_Click`, and `BlacklistCurrentVideo_Click`.
    - `MainWindow` members with no caller: `PlayMedia(string, bool)`, `RemoveLibraryItemAsync`, `BeginLibraryArchiveOperationUI`, `EndLibraryArchiveOperationUI`, `BlacklistCurrentVideo`, `BuildGridRowModels`, `ContainsTagCaseInsensitive`, the `GetAutoTagScopeItems` stub that always returns an empty list, the `persistLibrary` parameter of `ApplyRemoteItemStateProjection`, and the unread `_rng` and `_videoExtensions` fields.
    - The unread `EditTagDialog._categories` field and the unused `TagViewModel` class in `FilterDialog.axaml.cs`.
    - `CoreServerApiClient.AppendClientLogAsync`, `GetVersionAsync`, and `TryReadJsonError`, and `TagSaveApply.EchoesFor`, which nothing calls. `LibraryConnectReads`, which only its test reads.
    - The Auto Tag dialog's local matching fallback: `ItemMatchesTag` and the scan branch that runs it when no API scan is passed. Production always passes the API scan, so this branch is a client-local fallback that never runs. Found by the efficiency and divergence report.
    - `LibraryPanelSort.Apply` and its file name comparer, an in-memory client sort that only tests call. The server sorts the list query. `IsDefaultDescendingForSortMode` and `GetSortDirectionLabel` stay: the sort control uses them. Found by the efficiency and divergence report.
    - Hide the desktop controls that cannot work because their server routes do not exist: **Rename** and **Remove** in the Manage Sources dialog, which only show "API-required and not available" after their dialogs, and **Remove from Library** in the grid's context menu, which shows its confirmation and then the same message. Found by the planned-milestones audit. They stay hidden until Operator Source and Item Management adds the routes. This is the one user-visible change in this milestone. The handlers and dialogs behind them stay: Remove from Library comes back on the new item route, and the Manage Sources dialog is replaced by Desktop Source Management Link.
  - Core and server slice:
    - `State/RuntimeStateServices.cs` (randomization, filter-session, and playback-session state services), the `IPathResolver` and `IBackgroundTaskScheduler` interfaces, and `CoreFilterState` / `CoreFilterPreset` with the `CoreVerification.VerifyDtoMappingRules` check that only exists to construct them. Drop the placeholder list from the SystemChecks verbose output.
    - `LibraryCatalogStore.DatabaseHasContent` (no caller) and `IsUsableDatabase` (tests only). `LibraryCatalogSession.ReplaceItemTags` (no caller), and `AddItemTags`, `RemoveItemTags`, and `SetPlayback`, which only tests call. Tests that seed through them move to the SQL seeding helper from the test seeding milestone, or to the production write they stand in for.
    - The full-catalog read on every open: `LibraryCatalogStore.Open` builds `LibraryCatalogOpenResult.Catalog`, and only tests read it. Measured on a 48,938-item catalog at about 360-450 ms and about 100 MB of allocations at each server start. Tests read the snapshot through `LibraryCatalogStore.Read` instead.
    - `ServerSessionStore.GetActiveSessionCount`, `ServerStateService.GetSubscriberCount`, `MediaPlayableExtensions.IsPhotoExtension`, `CoreSettingsService.ReloadFromDisk`, `FilterStateProjection.ToModel`, and `RefreshPipelineService.GetSettings`, `GetWebRuntimeSettings`, and `UpdateWebRuntimeSettings`. Keep `RefreshPipelineService.UpdateSettings` for the auto-refresh reschedule fix in the post-migration fixes milestone.
    - The unread `CoreSettingsService._logger` and `RefreshPipelineService.JsonOptions` fields.
    - The `catalog ?? LibraryCatalogHost.Open(...)` fallbacks in `LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, and `ServerStateService` are reached only from tests. Remove them if the server data folder override leaves no test that needs them.
  - WebUI and scripts slice:
    - The unread `filterActiveTab` in `app.js`.
    - The flat-tag branch in the WebUI filter Tags tab (`legacyFlat` in `app.js`), which renders tags when the catalog has no categories. The server always keeps Uncategorized and no longer has a no-categories tag path, so this branch cannot be reached.
    - `tools/scripts/publish-web.ps1`, which writes a `.web-deploy` folder that nothing reads, and `tools/scripts/verify-web.ps1`, which only runs `npm install` and `npm run verify`. Remove their references in `docs/dev-setup.md` and `docs/domain-inventory.md`.
- **Acceptance criteria**:
  - Every item listed above is gone, or the evidence says why it stayed.
  - The unused-member analyzers and TypeScript unused-locals checks report nothing new for product code.
  - `LibraryCatalogStore.Open` does not read the full catalog, and server startup does not build a catalog snapshot.
  - API routes, OpenAPI, generated WebUI types, desktop and WebUI behavior, and the Operator are unchanged, except that the desktop no longer shows Manage Sources **Rename** and **Remove** or the grid's **Remove from Library**.
  - The rest of the Manage Sources dialog and the grid context menu work as before.
  - Test hooks listed in scope still exist and their tests pass.
  - `events/sseClient.ts` and `buildEventsUrl` still exist and their tests pass.
  - The desktop Auto Tag scan has no local matching path, and the desktop has no client-side list sort.
- **Verification evidence**:
  - Unused-member analyzers (IDE0051, IDE0052, IDE0060, plus CS0169 and CS0649) on a copy of the working tree. Before: 15 hits, all on the list above except one pre-existing IDE0060 on the `cancellationToken` parameter of `AvaloniaTrayHostUi.RequestUiExitAsync`, which was left alone because it is not dead code on this list. After the desktop slice: 4 (that one plus three server items). After the core and server slice: only that one remains. TypeScript `tsc --noUnusedLocals --noUnusedParameters --checkJs --allowJs`: before, `filterActiveTab` only; after the WebUI slice, nothing.
  - Removals left more items unused, and those went too. Desktop: `RemoveFromBlacklistAsync`, `PlayFromPath`, the archive-operation status fields, the always-hidden status-bar progress bar, and the Auto Tag dialog's `ItemHasTag`, display-path helper, catalog, and scope-items arguments. Core and server: `LibraryCatalogSession.ItemExists`, `CoreSettingsService.ApplyLoadedSettings` and `_serverRuntimeOptions`, and the `CoreSettingsService` constructor's logger parameter, which only fed the removed field.
  - Searches for callers confirmed the public members the analyzers cannot see. `FilterStateProjection.ToModel` is gone; the class stays for the preset match route removal.
  - Catalog open: `LibraryCatalogOpenResult.Catalog` is gone, and `Open` no longer calls `Read`. On a synthetic 50,000-item catalog, `Open` went from a median of 150 ms with 44.5 MB allocated (HEAD) to 0.8 ms with almost nothing allocated (7 runs each). Tests read the snapshot through `LibraryCatalogStore.Read` on the opened database. A check confirmed no test writes between its open and that read.
  - Tests that used `AddItemTags`, `RemoveItemTags`, or `SetPlayback` now use `ApplyItemTagEdits` and `RecordPlayback`. The refresh hold test checks a play count of 1 from a seeded 0 instead of an explicit 3. `AddItemTags_MissingItem_CreatesNothing` was deleted because it covered only the removed method. `ApplyItemTagEdits` still adds the catalog tag for a missing item. The backup test checks `InspectCatalogFile` instead of `IsUsableDatabase`.
  - Met differently: the `catalog ?? LibraryCatalogHost.Open(...)` fallbacks in `LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, and `ServerStateService` stay. About 35 tests build these services from a data folder alone and rely on them.
  - The test hooks listed in scope, `events/sseClient.ts`, and `buildEventsUrl` still exist, and their tests pass. `shared/api/openapi.yaml`, `ApiContracts.cs`, and `openapi.generated.ts` are unchanged, and `npm run verify:contracts` passes.
  - Hidden controls use `IsVisible="False"`, and their handlers and dialogs stay. A new headless test opens Manage Sources with one source and checks that Rename and Remove are not shown while Refresh and Find Duplicates are. It failed with Rename made visible. The test classes now share one headless session. `MainWindow` cannot be built in a headless test without side effects: its constructor loads native LibVLC, and its `Loaded` handler starts the core reconnect loop and the update service. So the grid menu gets a manual spot check instead of a test.
  - Grid menu spot check (manual, desktop app): PASS. **Remove from Library** is hidden from the grid menu with no doubled separator, and the other menu items work. Manage Sources shows the enable toggle, **Refresh**, and **Find Duplicates...** without **Rename** or **Remove**.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed: Core 273 (one deleted test), Desktop 130 (−1 `LibraryConnectReads`, −7 list-sort tests, +1 Manage Sources). `npm run verify` passed with 133 tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed, with no placeholder list.
  - Docs: `docs/dev-setup.md`, `docs/domain-inventory.md`, and `CONTEXT.md` no longer name the removed scripts. `docs/feature-migration.md` drops the migration wizard and notes the hidden controls. `CONTEXT.md` and `docs/domain-inventory.md` note that opening the catalog does not read it whole. Added an `[Unreleased]` Changed entry and a Release Specific checklist check for the hidden controls.
- **Deferrals / Follow-ups**:
  - Unused routes and contract types are the preset match route removal milestone.
  - Make the catalog a required constructor argument of `LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, and `ServerStateService`, and drop their `catalog ?? LibraryCatalogHost.Open(...)` fallbacks, once the tests that build them from a data folder are rewritten -> the test seeding milestone or later.
  - The pre-existing unused `cancellationToken` parameter of `AvaloniaTrayHostUi.RequestUiExitAsync` -> backlog; not on this milestone's list.

### M10j1 - Server Data Folder Override

- **Status**: ✅ Complete
- **Goal**: Let verification scripts and tests point the server at a temporary data folder on every OS, so they never read or write the developer's real settings, catalog, or thumbnails.
- **Scope**:
  - This is the first milestone in the v0.14.0 release. It comes first so later milestones can verify the server on Windows without touching real settings.
  - Why: `verify-web-deploy.ps1` isolates data by setting `APPDATA` on Windows and `XDG_CONFIG_HOME` on Linux. Setting `APPDATA` does not redirect `Environment.GetFolderPath` on Windows, so that script currently runs against real settings there. On Linux it does not set `XDG_DATA_HOME`, so thumbnails still resolve under the real `LocalApplicationData` folder. `set-release-version.ps1` runs that script by default.
  - Add one server helper that reads an environment variable such as `REELROULETTE_DATA_DIR` and otherwise falls back to the current folder lookup (`ApplicationData/ReelRoulette` for data, `LocalApplicationData/ReelRoulette/thumbnails` for thumbnails). With the override set, data lives in the override folder and thumbnails under `<override>/thumbnails`.
  - Use that helper at every place the server and ServerApp resolve their data or thumbnail folder: `ServerHostComposition` (three places), `CoreSettingsService`, `LibraryPlaybackService`, `RefreshPipelineService` (data and thumbnail folders), `ServerLogService`, `ServerStateService`, `LibraryOperationsService`, `LibraryCatalogHost` (thumbnail folder), and the ServerApp `Program.cs` data folder lookup. Explicit constructor path overrides keep precedence.
  - `verify-web-deploy.ps1` sets the override to its temporary folder on every OS, in place of the `APPDATA` / `XDG_CONFIG_HOME` split.
  - Remove the `APPDATA` scope (`AppDataScope`) in `RefreshPipelineServiceTests`, which has no effect on `Environment.GetFolderPath` on Windows. Those tests pass their temporary folder explicitly.
  - Tests that construct `ServerStateService` pass a data folder override instead of falling back to the real folder.
  - Also check `ReelRoulette.Core.SystemChecks`: it constructs `ServerStateService()` with no override, which creates the real data folder if it is missing.
  - Desktop data folder resolution is out of scope.
  - Add a Release Specific checklist item: "`verify-web-deploy.ps1` on Windows leaves the real data and thumbnail folders unchanged."
- **Acceptance criteria**:
  - With the environment variable set, the server reads and writes settings, catalog, backups, logs, and thumbnails only under that folder, with thumbnails under `<override>/thumbnails`.
  - With the variable unset, the server resolves the same folders as before.
  - No server or ServerApp code outside the helper calls `Environment.GetFolderPath` for its data or thumbnail folder.
  - `verify-web-deploy.ps1` leaves the real `ApplicationData/ReelRoulette` and `LocalApplicationData/ReelRoulette` folders untouched on Windows and Linux.
  - No test sets `APPDATA` to isolate data, and every test that constructs `ServerStateService` passes an override.
- **Verification evidence**:
  - Added `ServerDataPaths` in the server project. Every server and ServerApp data and thumbnail lookup goes through it. `git grep GetFolderPath` in `ReelRoulette.Server` and `ReelRoulette.ServerApp` finds only the helper and the unrelated XDG autostart and AppImage `UserProfile` lookups.
  - Met differently: `ServerStateService` with no override and no catalog touches no folder, so tests that construct it without an override are safe. Core verification no longer creates the real data folder.
  - `Core.Tests` now has a test-isolation module initializer. It sets `REELROULETTE_DATA_DIR` to a temporary folder for the run and, on Linux, points `XDG_CONFIG_HOME` and `XDG_DATA_HOME` at temporary folders it creates first, because `GetFolderPath` returns an empty path for an XDG folder that does not exist. `AppDataScope` is gone from `RefreshPipelineServiceTests`.
  - Helper tests cover the unset, blank, set, and relative override cases and the environment variable read. A composition test builds `AddReelRouletteServer()` with the override, resolves every server service, saves settings, writes a log line, and starts and stops the hosted services. It checks that `library.db`, `core-settings.json`, a settings backup, and `last.log` are under the override, and that the Linux XDG folders contain no `ReelRoulette` folder.
  - The composition test was confirmed to fail when `ServerLogService` or `ServerHostComposition` bypasses the helper, and when the thumbnail folder lookup does (caught by the XDG check).
  - `verify-web-deploy.ps1` sets the override on every OS and drops `APPDATA`. Rather than replacing the XDG variables, on Linux it keeps both `XDG_CONFIG_HOME` and `XDG_DATA_HOME` alongside the override, as the verification-script rules in `AGENTS.md` require, so desktop integration such as autostart and menu entries stays isolated too. `verify-linux-packaged-server-smoke.sh` also sets the override, keeping its XDG variables, and checks that `last.log`, `library.db`, and `core-settings.json` are under the override and that the isolated XDG config folder contains nothing named `ReelRoulette`. It passed, and a copy with the override removed failed on the missing `last.log`.
  - `verify-web-deploy.ps1` now checks that `last.log`, `library.db`, and `core-settings.json` are under the override and, on Linux, that the isolated XDG folders contain no `ReelRoulette` folder.
  - One Linux run of `pwsh ./tools/scripts/verify-web-deploy.ps1` passed with no other ReelRoulette server running (checked by port and process list). Names, sizes, and modification times under `~/.config/ReelRoulette` and `~/.local/share/ReelRoulette` (48,973 entries) were identical before and after the run. Port 51312 was free afterward, and the temporary folder was removed.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed (Core 274, Desktop 137). `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - The Windows run is the Release Specific checklist item, run in the pre-release pass.
  - Docs: `docs/dev-setup.md` describes the override, the core test isolation, and the verification-script rules it satisfies. Updated `CONTEXT.md`, the testing checklist (the automated `verify-web-deploy.ps1` check is no longer skipped, plus the Release Specific Windows check), and `CHANGELOG.md`.
- **Deferrals / Follow-ups**:
  - Desktop data folder resolution stays out of scope. Desktop library import writes `library.db` into the server data folder it resolves itself, so it does not follow a server started with `REELROULETTE_DATA_DIR`.

### M10i20 - Remove Client-Authority Sync Routes

- **Status**: ✅ Complete
- **Goal**: Remove the unused client-authority tag sync routes and the unused `tagMatchMode` filter field so v0.13.0 no longer offers a client-held catalog sync, after checking whether a v0.12.0 client still needs either.
- **Scope**:
  - Depends on: dropping the unread server tag and item cache.
  - This is the last milestone in the v0.13.0 release.
  - Before removal, check at the `v0.12.0` tag whether a v0.12.0 desktop or WebUI posted to `POST /api/tag-editor/sync-catalog` or `POST /api/tag-editor/sync-item-tags`, and whether the version/capability gate lets a v0.12.0 client connect to a v0.13.0 server. If both are true, stop. This milestone is a compatibility decision to bring back, and the routes stay until that decision.
  - Remove `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags`.
  - Remove their OpenAPI request schemas and the generated WebUI types for those routes. The shared tag snapshot schemas stay.
  - Remove the desktop client methods and request types for those routes.
  - Remove the server operations methods and session methods that exist for those routes, and the tests that call them.
  - WebUI tag save still goes through apply-item-tags after the regenerated types.
  - Current-state docs and the testing checklist no longer describe these routes. Completed milestone entries stay as written.
  - Added during planning: remove `tagMatchMode` from the filter contract. The same `v0.12.0` check covers it, since removing a filter field can affect a v0.12.0 client the same way removing a route can. OpenAPI types `filterState` as a free-form object and never named the field, so the OpenAPI document and generated WebUI types do not change for it. Remove it from the server and Core filter models, the server filter parser and preset-match projection, the desktop `FilterState`, the hidden legacy radio buttons in the desktop filter dialog, the WebUI filter state, and the WebUI code that copies the global match selector into it.
  - Added during planning: the desktop main-window filter summary says "all" or "any" for included tags from the global match mode, not `tagMatchMode`. It used to say "all" for both global AND and global OR.
  - Added during planning: preset matching ignores `tagMatchMode` in saved filter text on the server, the desktop, and the WebUI, so a desktop preset and a WebUI preset with the same filter match. Saved presets are not rewritten.
  - Added during planning: remove `LibraryCatalogSession.ReplaceTagCatalog`, which had no production caller.
  - Added during manual verification: the desktop filter dialog enables **Update Preset** from the same comparison as its `Preset:` heading, including the global match mode. It used to depend on a flag that only a control change set, so reopening the dialog on a starred preset showed the `*` with Update disabled. Apply still compares with the filter the dialog opened with. The WebUI filter dialog has no Update Preset gate, so that part does not change there.
  - Added during manual verification: preset matching on the server, the desktop, and the WebUI treats an unset global match mode as AND, the same as filtering does. Switching the global mode away and back then clears the `*`, and a preset saved with the mode unset matches the same filter with an explicit AND in either app. The desktop filter dialog's own preset checks, including on Apply, use the same desktop comparison, and its Apply button compares the working filter with the filter it opened with the same way, so a toggle away and back leaves Apply disabled. Saved presets are not rewritten. This predates this milestone.
  - Added during review: the WebUI filter dialog's **Apply** `*` compares the working filter with the filter it opened with through the same preset comparison, so a toggle away and back from an unset global mode clears it, as on the desktop. The desktop dialog's pending check compares its preset list by name and order and each preset's filter with `FiltersEqual`, so updating a preset to a filter that means the same as before leaves Apply disabled. The desktop filter dialog has no raw JSON filter comparison left. `LibraryPresetSelection.SameFilterSnapshot`, a raw JSON filter comparison that only its own test called, is removed with that test.
  - Added during manual verification: desktop tests use a test-only settings directory and turn off the server log relay, so they do not touch the developer's settings or a running server on Linux or Windows. Filter dialog tests drive the real dialog with `Avalonia.Headless` in the desktop test project only.
- **Acceptance criteria**:
  - The `v0.12.0` tag check is recorded. Removal proceeds when a v0.12.0 desktop or WebUI did not post to either route, or when the version/capability gate does not let a v0.12.0 client connect to a v0.13.0 server.
  - When both are true, the routes stay and this milestone stops for a compatibility decision.
  - `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags` are gone, along with their OpenAPI request schemas, generated WebUI types, desktop client methods and request types, server operations methods, session methods, and tests.
  - The shared tag snapshot schemas stay.
  - WebUI tag save still goes through apply-item-tags after the regenerated types.
  - Current-state docs and the testing checklist do not describe these routes.
  - Startup still migrates a leftover `library.json`.
  - `tagMatchMode` is not in the server, Core, desktop, or WebUI filter models, the desktop filter dialog, or the WebUI filter code. A filter or saved preset that still carries it is accepted and gives the same result as one without it.
  - The desktop filter summary says "any" with global OR and "all" with global AND or an unset global mode. A test covers each.
  - Saved preset text that still carries `tagMatchMode` matches the same filter without it, and a different `tagMatchMode`, on the server, the desktop, and the WebUI. A test covers each.
  - A desktop settings file whose saved filter still carries `tagMatchMode` loads and keeps its other values.
  - `ReplaceTagCatalog` is gone.
  - In the desktop filter dialog, **Update Preset** is enabled exactly when the heading shows a starred preset, both after a change in the dialog and when the dialog opens on a starred preset. A headless dialog test covers both and fails with the previous flag.
  - Desktop tests resolve settings and backups under a temporary test directory on Linux and Windows, and send no log lines to a server.
  - A preset saved with the global mode unset matches the same filter with an explicit AND, and not with OR, on the server, the desktop, and the WebUI. In the desktop filter dialog, switching the global mode away and back clears the `*`, disables Update, and leaves Apply disabled. A test at each site fails without the normalization.
  - In the WebUI filter dialog, switching the global mode away and back from an unset opening filter clears the Apply `*`. In the desktop filter dialog, updating a preset saved unset to OR and then back to an explicit AND leaves Apply disabled. A test covers each and fails with the previous raw comparison.
- **Verification evidence**:
  - `v0.12.0` tag check: `git grep` at `v0.12.0` finds `/api/tag-editor/sync` only in the desktop `SyncTagCatalogAsync` and `SyncItemTagsAsync` definitions, which nothing calls, and in generated WebUI types. No v0.12.0 desktop or WebUI code posts to either route. The version gate does let a v0.12.0 client connect: v0.12.0 and this release both report API version `1`, minimum compatible `0`, and supported `["1","0"]`, and the WebUI's required capabilities are still offered. Removal proceeds because no client posted to either route.
  - `tagMatchMode` at `v0.12.0`: both clients send it. The v0.12.0 desktop and WebUI filter with it only in their client-side legacy tag filter for a catalog with no categories, which a catalog the app writes cannot reach. The v0.12.0 desktop filter summary also reads it, and the v0.12.0 WebUI derives it from `globalMatchMode`. The server reads named fields from the `filterState` JSON, so an extra field is ignored. A v0.12.0 client that reads a preset without the field falls back to AND.
  - `dotnet build ReelRoulette.sln` (0 errors, 0 warnings) and `dotnet test ReelRoulette.sln` passed: 137 desktop tests and 265 core tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed and exited 0.
  - CI run 36847737031 (`ci.yml`, push to `main` at `1b4c82e`) completed with success, including the `build-test-windows` job.
  - `npm run generate:contracts` removed only lines from `openapi.generated.ts`. `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passed: contracts up to date, typecheck, 133 tests, build, and build output check.
  - The route and session removals leave no reference in `src/` to the routes, `SyncTagCatalog`, `SyncItemTags`, `ApplySyncedTagCatalog`, `CatalogItemTagAssignment`, `ReplaceTagCatalog`, or the private helpers only they called. `EveryCatalogWritePath_KeepsUncategorized` keeps the new-catalog, category upsert, and Uncategorized delete-refusal checks. Its sync and replace steps went with those paths, which were the only writers that cleared the category table. WebUI tag save still posts `apply-item-tags` (`tagSave.ts`, `app.js`, `tagSave.test.ts`).
  - `TryMatchPreset_IgnoresTagMatchModeInSavedPresetText` (server), `SavedPresetTextWithTagMatchMode_MatchesTheSameFilter` (desktop), and the WebUI `filterStateModel` test match saved preset text that carries `tagMatchMode`. Putting the projection comparison back made all three server cases fail. Putting the field back on the desktop `FilterState` made both desktop cases fail. Keeping the field in the WebUI parser and serializer made the WebUI test fail. Each change was reverted.
  - `FilterSummaryFormatTests` covers global AND, OR, and unset. Making the summary always say "all", which is what reading the default `tagMatchMode` produced, made the OR case fail. That change was reverted.
  - `LoadSettingsWithSavedFilterTagMatchMode_KeepsTheFilterAndOtherSettings` loads a desktop settings file whose saved filter carries `tagMatchMode` or `TagMatchMode` and checks the other filter values and settings. Making `FilterState` refuse unknown fields made both cases fail. That change was reverted.
  - `TagFilter_ListQueryAndRandomEligibilityAgree_ForEveryTagShape` parses a filter that carries `tagMatchMode` as `1` and `"Or"` and gets the same AND result on the list query and random eligibility.
  - Desktop filter dialog Update Preset: a headless harness against a `git archive` of HEAD and against the working tree gave the same results, so this predates the milestone. In both, changing only the global mode in the dialog starred the heading and enabled Update. Reopening on a filter that differed from its preset, whether by the global mode or a tag, showed `Preset: P*` with Update disabled. `FilterDialogPresetUpdateTests` covers reopen after a global-only change in both directions, reopen after a tag change, an in-dialog global change and back, reopen then matching again (with the `CanUpdatePreset` change notification), and opening on the saved preset. Putting `CanUpdatePreset` back on the flag made all four reopen cases fail. Those tests read the dialog's properties and run with a headless Fluent theme.
  - Unset global mode: `TryMatchPreset_TreatsAnUnsetGlobalModeAsAnd` (server, missing and `null` stored modes against explicit AND, and unset against OR), `UnsetGlobalMode_EqualsAnExplicitAnd_ButNotOr` (desktop `FiltersEqual` and `Resolve`), `TogglingTheGlobalModeAwayAndBack_OnAPresetSavedUnset_ClearsTheStarAndUpdate` (headless desktop dialog), and the WebUI `filterStateModel` test for a desktop preset saved with `null`. Restoring the raw nullable comparison on the server made its three matching cases fail. Removing the desktop normalization made both desktop tests fail. Restoring the raw WebUI comparison made the WebUI test fail. Each change was reverted. The desktop dialog's `CheckAndSelectMatchingPreset` and Apply path now call `FiltersEqual` instead of comparing raw JSON. `TogglingTheGlobalModeAwayAndBack_FromAnUnsetOpeningFilter_LeavesApplyDisabled` (headless dialog) failed against the raw JSON pending check with `Apply*` after switching back, and passes now that the pending check compares with the opening filter through `FiltersEqual`.
  - Review fixes: the WebUI `filterStateModel` test for the Apply `*` after a toggle away and back from an unset opening filter failed with the helper written as the previous raw `JSON.stringify` comparison, and passes through `filterStatesEqualForPresetMatch`. `UpdatingAPresetSavedUnset_BackToAnExplicitAnd_LeavesApplyDisabled` (headless desktop dialog) failed against the raw preset-list JSON check with `Apply*` after the second update, and passes with `PresetsEqual`, which `PresetsEqual_ComparesNamesAndOrderExactly_AndFiltersWithFiltersEqual` covers. In `app.js`, the four sites that set the dialog's opening filter are the ones that set it before; the only other assignment to the working filter is loading a preset inside the dialog, which is meant to count as a change from the opening filter. After removing `SameFilterSnapshot` and its test, a repository search outside build output finds no reference to it.
  - Desktop test isolation: `AppDataManager` resolves the folder with `Environment.GetFolderPath(SpecialFolder.ApplicationData)`, which on Windows comes from the shell's Roaming AppData folder and ignores `APPDATA`, so a test-only `AppDataManager.UseDirectoryForTests` override is set from a module initializer instead of an environment variable. Settings, backups, and filter dialog bounds all resolve through that directory. `ClientLogRelay.DisableForTests` returns before any network call. `TestIsolationTests` asserts the settings and backup paths are under the test directory. Removing the override made it fail. A full desktop test run left the real `~/.config/ReelRoulette` listing unchanged.
  - `docs/api.md`, `CONTEXT.md`, `docs/domain-inventory.md`, and the testing checklist no longer describe the sync routes. `docs/api.md` says `filterState` has no `tagMatchMode` and preset match ignores it. The checklist has release items for the desktop summary and cross-client preset matching.
- **Deferrals / Follow-ups**:
  - Removing `library.json` file recognition and the JSON-to-SQLite importer, including `PrepareIncomingFromJson`, ships in v0.14.0. The import check and retire-aside for a leftover `library.json` stay until that removal.
  - Scrubbing every remaining `library.json` mention from product code, comments, user-facing copy, tests, and current-state docs follows that format removal.
  - Account and PIN tables stay with the account and PIN data model work.
  - Found while implementing: `FilterStateProjection.ToModel()` in the server preset-match code has no caller.
  - Found while implementing: the desktop server-preset parser returns the default filter when a saved filter cannot be parsed, without logging it.

### M10i19 - Drop the Unread Server Tag and Item Cache

- **Status**: ✅ Complete
- **Goal**: Stop loading a server-side tag and item cache that no live route reads, while v0.13.0 still migrates a leftover `library.json`.
- **Scope**:
  - Depends on: JSON-era leftovers that do not serve migration.
  - This ships in v0.13.0. Removing the client-authority sync routes follows this milestone and is the last milestone in that release.
  - Remove the server startup bootstrap of categories, tags, item tags, favorites, and blacklist.
  - Remove the readers that serve only that cache, and the private helpers that exist only to fill or read it. This includes the test-only server state readers `GetTagEditorModel`, `GetTagsSnapshot`, `GetTagCategoriesSnapshot`, and `GetLibraryStates`, and the uncalled `CreateTagCatalogPayload`.
  - The source list, source enable/disable, and the preset cache stay. `GET /api/sources` still reads the startup source list.
  - The startup test still checks sources loaded from SQL. It no longer reads categories, tags, item tags, favorites, or blacklist from server state.
  - Added during planning: remove the server list query's no-categories tag path, which no catalog the app writes can reach. This removes that branch, the category-count check before it in both the list query and random eligibility, and `Query_LegacyTagAnd_WhenCatalogHasNoCategories`, which seeded that shape with `DELETE FROM categories`.
  - Evidence for that removal covers every catalog the app can produce: tag include and exclude, global and per-category AND/OR, and Uncategorized tags, on both the list query and random eligibility, since they share the filter.
  - A hand-edited catalog with no categories then groups selected tags by the category id stored on each tag row, the same as any other catalog. Per-category and global modes apply. A selected tag that is not in the tag table forms its own group. `tagMatchMode` no longer applies. Selected tags in one group with no per-category mode match with AND, where that catalog previously honored `tagMatchMode = Or`.
- **Acceptance criteria**:
  - Server startup does not load categories, tags, item tags, favorites, or blacklist into server state.
  - The readers and private helpers that served only that cache are gone.
  - The source list, source enable/disable, and the preset cache stay. `GET /api/sources` still reads the startup source list.
  - No API route, control-plane endpoint, Operator UI path, tray path, or SSE event builder reads the removed state.
  - The startup test still checks sources loaded from SQL.
  - Startup still migrates a leftover `library.json`.
  - The list query and random eligibility have no no-categories tag path and no category-count check. A test shows every catalog write path the app uses leaves Uncategorized in place.
  - Tag include and exclude, global and per-category AND/OR, Uncategorized tags, and a tag that is not in the tag table give the same results on the list query and random eligibility, and those results match the expected items.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` (0 errors, 0 warnings) and `dotnet test ReelRoulette.sln` passed: 118 desktop tests and 267 core tests. `dotnet run --project ./src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj -- --verbose` passed and exited 0.
  - `ServerStateService` keeps sources, presets, and event publish and replay. Its startup reads only sources, through `LibraryCatalogSession.ReadStartupSources`. `ReadStartupState`, `CatalogStartupState`, and `CatalogStartupItem` are gone. A search of `src/` for the removed readers, fields, and `hasCategories` finds only `LibraryOperationsService` methods of the same name, which the routes and SSE builders in `ServerHostComposition` already call. The build shows nothing else references the removed members.
  - `Startup_LoadsSourcesFromTheCatalog` seeds `library.json`, checks that startup migrated it to `library.db` and `library.json.migrated`, and checks the source loaded from SQL. `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` still covers that migration.
  - `EveryCatalogWritePath_KeepsUncategorized` checks a new catalog, tag catalog sync with and without categories, tag catalog replace with nothing, and that deleting Uncategorized is refused. `Open_MissingUncategorizedCategory_IsAppended` covers migration. Removing the Uncategorized append from sync normalization made the test fail. Removing the Uncategorized delete refusal also made it fail. Both changes were reverted.
  - `TagFilter_ListQueryAndRandomEligibilityAgree_ForEveryTagShape` asserts the same expected items from `QueryList` and `QueryEligible` for include, exclude, include with exclude, global AND with mixed per-category modes, global OR with mixed per-category modes, Uncategorized tags with and without a per-category OR, a tag that is not in the tag table under global AND and OR, and `tagMatchMode = Or` leaving the result unchanged. Inverting the per-category OR check made it fail. Swapping the global joiner also made it fail. Both changes were reverted.
  - `CONTEXT.md`, `docs/domain-inventory.md`, and the testing checklist say server startup loads sources from catalog rows.
- **Deferrals / Follow-ups**:
  - Removing the client-authority sync routes is the next milestone and ends the v0.13.0 release.
  - Source import does not refresh the in-memory source list that `GET /api/sources` reads. That list stays filled at startup.
  - The JSON reader, the side-file copy, the import check and retire-aside for a leftover `library.json`, refuse strings, and the tests that seed through `library.json` stay until removal of `library.json` library support.
  - Account and PIN tables stay with the account and PIN data model work.
  - Candidate for the sync-route removal milestone, since both are contract changes: `tagMatchMode` is still in the filter contract. The server parses it, and preset matching compares it. Filtering no longer reads it. No visible desktop or WebUI control sets it on its own. The desktop filter dialog sets it only from hidden legacy radio buttons. The desktop main-window filter summary reads it to say "all" or "any". The WebUI sets it to mirror the global match selector. Desktop presets keep the default AND while WebUI presets with global OR store OR. So two saved presets that differ only in `tagMatchMode` do not match today, and would start matching once the field is removed.
  - Found while testing: `LibraryCatalogSession.ReplaceTagCatalog` has no production caller. Only tests call it.

### M10i18 - JSON-Era Leftovers That Do Not Serve Migration

- **Status**: ✅ Complete
- **Goal**: Remove JSON-era library code that does not read `library.json`, while v0.13.0 still migrates a leftover `library.json`. Import does not accept a `library.json` archive.
- **Scope**:
  - Depends on: catalog document removal.
  - This follows catalog document removal. It does not depend on the document work itself. Dropping the unread server tag and item cache follows this milestone. Removing the client-authority sync routes is the last milestone in the v0.13.0 release.
  - Remove the unused library-index file store. Settings JSON storage stays for core settings and desktop settings. Presets and thumbnail metadata are already in the catalog.
  - Remove the verification-only in-memory tag mutator and the verification check that only exists to call it. Remove `FilterSetBuilder` and the verification check that only exists to call it. The rest of that verification stays.
  - Remove the empty desktop tag-catalog sync method and the empty desktop item-tag sync method `SyncRequestedItemTagsToCore`.
  - Remove every server state method whose body only throws because mutation authority moved. Live routes stay on library operations.
  - Remove the desktop check that treats a full-catalog projection route as a live read, and the test that expects that route to count as one. That route is already gone.
  - The desktop library model drops the legacy flat tag list, the fingerprint index, and `LibraryIndex.Items`. Sources, categories, and tags on that model stay. The filter dialog drops the branch that reads that flat list, and the collection that only that branch fills.
  - Remove the unused desktop setting `LibraryGridViewEnabled`.
  - Comments that are not describing startup migration no longer mention `library.json`. Current-state docs that describe that migration still do.
  - Update the testing checklist line that says the filter dialog Tags tab shows per-category collapse toggles and the legacy flat tag model renders correctly. Update the checklist where the other leftovers were described.
  - Fix the `CONTEXT.md` repository map sentence that calls `ReelRoulette.LibraryArchive` zip export/import helpers. That project imports and exports a `library.db` checkpoint.
  - Final-state addition: remove the desktop `LibraryProjectionDisplayFilter`. It has had no caller since desktop browse moved to the list query, so its legacy flat-tag branch could not run either. Library filtering through categories is the server list query. Also remove the Core filter-request, filter-item, filter-source, and filter-tag types and the in-memory index, item, category, and tag types that only the removed builder and mutator used.
- **Acceptance criteria**:
  - The unused library-index file store, the verification-only tag mutator, `FilterSetBuilder` and its verification check, the empty desktop tag-catalog sync method, `SyncRequestedItemTagsToCore`, and the throw-only server state methods are gone. Core settings and desktop settings JSON storage is unchanged. The rest of that verification stays.
  - The desktop library model has no legacy flat tag list, no fingerprint index, and no item list. Sources, categories, and tags on that model stay. The filter dialog does not read a flat tag list.
  - `LibraryGridViewEnabled` is gone. An existing desktop settings file containing `libraryGridViewEnabled` still loads.
  - A full-catalog projection route is not treated as a live library read.
  - Comments that are not about startup migration do not mention `library.json`.
  - The testing checklist no longer says the legacy flat tag model renders correctly. `CONTEXT.md` does not call `ReelRoulette.LibraryArchive` zip export/import helpers.
  - Startup still migrates a leftover `library.json`. Import Library does not accept a `library.json` archive.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` (0 errors, 0 warnings) and `dotnet test ReelRoulette.sln` passed: 118 desktop tests and 265 core tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed with randomization and DTO mapping checks and exited 0.
  - A search of `src/` finds no library-index file store, tag mutator, `FilterSetBuilder`, filter-request types, empty desktop sync methods, throw-only server state methods, full-catalog path check, `LibraryProjectionDisplayFilter`, legacy flat tag list, or fingerprint index. `LibraryGridViewEnabled` appears only as the key in the settings-load test. Nothing under `src/` assigns or deserializes the desktop `AvailableTags` before removal, so the filter dialog branch that read it could not run.
  - `LoadSettingsWithRetiredGridViewKey_KeepsTheOtherSettings` loads a desktop settings file with `LibraryGridViewEnabled` or `libraryGridViewEnabled` and keeps the other values. Marking the settings type to reject unknown members made both cases fail, then that change was reverted.
  - `Query_FilterMatchesPanelRules_ForTagsDurationAndPhotos` covers tag filtering through categories on the server list query. `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` and `Open_PartialDatabase_QuarantinesAndLaterOpenMigratesPreservedJson` still migrate a leftover `library.json`. `Import_RejectsALibraryJsonDocument_AndLeavesTheLiveCatalog` still rejects a `library.json` import.
  - `library.json` remains only in the catalog store's startup migration and in tests that seed through it.
  - `docs/checklists/testing-checklist.md` no longer says the legacy flat tag model renders correctly. No other checklist item described these leftovers. `CONTEXT.md` describes `ReelRoulette.LibraryArchive` as `library.db` checkpoint import/export helpers and still describes startup migration of a leftover `library.json`.
- **Deferrals / Follow-ups**:
  - Dropping the unread server tag and item cache is the next milestone, still in v0.13.0.
  - Removing the client-authority sync routes ends the v0.13.0 release.
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0.
  - Scrubbing every remaining `library.json` mention from product code, comments, user-facing copy, tests, and current-state docs follows that format removal.
  - Renaming `LibraryProjectionItem` and the WebUI `libraryProjection*` modules is not planned.
  - Account and PIN tables stay with the account and PIN data model work.
  - Follow-up candidate for the v0.13.0 cleanup: the server list query's no-categories tag path, covered by `Query_LegacyTagAnd_WhenCatalogHasNoCategories`, cannot be reached by a catalog ReelRoulette writes. An empty catalog, `library.json` migration, tag catalog sync, and tag catalog replace all ensure Uncategorized, and deleting Uncategorized is refused. Schema 1 never shipped, and its writer also ensured Uncategorized. Only a `library.db` edited outside the app reaches it. Removing it would remove that branch, the category-count check before it, and that test. A hand-edited catalog with no categories would then filter selected tags as one Uncategorized group.
  - `docs/full-audit.md` and `docs/migration-cleanup.md` are report-only audits and still cite `FilterSetBuilder` and `TagMutationService`.

### M10i17 - Catalog Document Removal

- **Status**: ✅ Complete
- **Goal**: Stop using the catalog document for live reads and writes in v0.13.0, while keeping startup migration of a leftover `library.json` so an old library can still be migrated.
- **Scope**:
  - Depends on: catalog schema version 2.
  - JSON-era leftovers that do not serve migration follow this milestone and end the v0.13.0 release.
  - Tag catalog sync and item-tag sync update catalog rows directly. They do not load or diff the full catalog document.
  - Server startup loads sources, tags, item tags, and favorite and blacklist item state with SQL. It does not build the catalog document.
  - The library reload after import uses that same SQL load, or that reload is removed. It does not build the catalog document.
  - Remove the catalog document builder and the full-document save path.
  - The JSON-to-SQLite importer stays for startup migration of a leftover `library.json`, including the preset and thumbnail-index copy from catalog schema version 2. Startup still migrates a leftover `library.json` once. Import Library does not accept a `library.json` archive. An empty database may still be created through that importer.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Tag catalog sync and item-tag sync persist without loading or diffing the full catalog document.
  - Server startup loads favorite and blacklist item state without building the catalog document.
  - Library reload does not build the catalog document.
  - There is no catalog document builder and no full-document save path.
  - A missing `library.db` still migrates `library.json`. Import Library does not accept a `library.json` archive.
  - Docs and the testing checklist describe live catalog reads and writes as row operations, describe the tag table as the only tag list, and still describe startup migration of a leftover `library.json`.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - Tests cover tag catalog sync and item-tag sync as row writes: trimmed names, blank names skipped, the earlier category kept unless it is Uncategorized, Uncategorized forced, last-wins on a duplicate category id, tags stored in name order, no revision bump when the stored rows already match, a removed catalog tag losing its item assignments, an item tag that was never in the tag table staying, a catalog spelling change from `Night` to `NIGHT` updating the item assignment, and an item that already holds both spellings keeping one row. Item-tag sync matches catalog id or full path, returns false when none match, and does not bump revision when the stored tags already match. Server startup loads sources, categories including Uncategorized, item tags, favorite, and blacklist from SQL, and the in-memory item id is the file path. The catalog document builder and the full-document save path are removed, and the unused library reload is removed. `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` still migrates a leftover `library.json`. A file whose body is a `library.json` object is rejected by the catalog file check and by Import Library, and the live catalog stays.
  - `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, and `docs/checklists/testing-checklist.md` describe live catalog reads and writes as row operations, describe the tag table as the catalog's tag list, and still describe startup migration of a leftover `library.json`. The `[Unreleased]` library-catalog changelog bullet includes the same outcome.
- **Deferrals / Follow-ups**:
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0.
  - Unused JSON-era types, desktop fields, and comments that do not serve startup migration are the next milestone, still in v0.13.0.
  - Account and PIN tables stay with the account and PIN data model work.
  - An item can still hold a tag name that is not in the tag table. The tag table is the catalog's tag list. That does not require every name stored on an item to be in that list.
  - Source import does not refresh the in-memory source list that `GET /api/sources` reads. That list is filled at startup. This is pre-existing and is not fixed here.
  - Ordinal path identity on Linux is recorded in the backlog item of that name. This milestone does not change path casing.
  - Removing `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags` needs its own contract decision. Those routes stay.

### M10i16 - Catalog Schema Version 2

- **Status**: ✅ Complete
- **Goal**: Move presets and thumbnail metadata into the catalog, drop the legacy available-tags list, and open every database at schema version 2 in one migration.
- **Scope**:
  - Depends on: refresh column updates.
  - This ships in v0.13.0, before catalog document removal. JSON-era leftovers that do not serve migration still end that release.
  - One migration runs before the health check. A schema 1 database is migrated in place. A corrupt database is still quarantined and startup still refuses it. The health check does not treat schema 1 as corrupt.
  - The schema version is the integer already stored in SQLite `PRAGMA user_version`. The code constant stays `SchemaVersion`. There is no second version key in `catalog_meta`. After this milestone the version is 2.
  - Opening a schema 1 database drops `available_tags` and the `available_tags_present` flag, adds a presets table, and adds thumbnail revision, width, and height on `items`. Existing rows in `tags` stay as they are. `generatedUtc` is not stored.
  - That same open copies `presets.json` and the thumbnail index into the catalog. The thumbnail index lives in the local cache directory, not beside `library.db`, and the migration is given that directory. The schema version is set only after the schema change and that copy have committed, in the same transaction as a flag that the copy finished. `presets.json` and `index.json` are then renamed to `presets.json.migrated` and `index.json.migrated`. A crash after the commit and before those renames does not copy them again; the next open only finishes the rename.
  - A missing `presets.json` or thumbnail index leaves presets or thumbnail columns empty. A file that cannot be parsed does the same and does not quarantine the catalog.
  - A new database, including an empty one and one created by migrating `library.json`, is created at schema version 2. It does not create `available_tags` or `available_tags_present`, and it does not create schema 1 and then migrate. That `library.json` migration also copies `presets.json` and the thumbnail index. The importer ignores `availableTags`. A name that appears only in that list is not stored.
  - The catalog document builder omits `availableTags` and does not query the dropped table. Removing that builder stays with catalog document removal.
  - Preset reads and writes use the catalog table. Tag rename and delete still update presets. `core-settings.json` and `desktop-settings.json` stay JSON.
  - Thumbnail revision, width, and height are read from the item row. The stored revision is the revision the JPEG was built for, and the thumbnail stage still reuses a JPEG when that revision matches the item fingerprint, size, and write time. The thumbnail stage writes that item's revision, width, and height as the item finishes, including a dimension fill when the revision already matches. It does not hold those columns until the stage ends. A favorite, tag, blacklist, or playback change that commits during the stage stays. A cancel leaves thumbnail columns already written. Browse no longer reads `index.json`. `hasThumbnail` is still whether that item's JPEG exists. The JPEG files stay in the local thumbnail directory. `generatedUtc` is not written.
  - At the end of the thumbnail stage, JPEG cleanup lists the thumbnail directory. A `{itemId}.jpg` whose id is not in the catalog is deleted, including files that were never listed in `index.json` and files left from a catalog this run did not remove item by item. `index.json` and `index.json.migrated` are left in place. The server reports progress as it deletes them. Opening the catalog does not scan the thumbnail directory. A cancel before that cleanup finishes leaves the remaining files for the next thumbnail stage that completes. An item removed by source refresh still loses its thumbnail metadata and JPEG.
  - Export, import, and catalog backup copy the whole database, so presets and thumbnail revision and dimensions travel with `library.db`. JPEG files do not. Import replaces the destination preset list. Local JPEGs for item ids that are not in the imported catalog stay until the next thumbnail stage completes. Docs and instructions recommend a refresh after import so those thumbnails are generated and the previous JPEG files are removed.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - A schema 1 database opens at schema version 2 with `available_tags` and `available_tags_present` gone, with presets loaded from `presets.json`, and with thumbnail revision, width, and height loaded from the thumbnail index. Existing tags are unchanged. `generatedUtc` is not stored.
  - A crash after that commit and before the side files are renamed does not import them a second time.
  - A missing or unreadable `presets.json` or thumbnail index does not refuse the database. Presets or thumbnail columns stay empty.
  - A new database, including an empty one and one migrated from `library.json`, is schema version 2, has no `available_tags` table, and includes presets and thumbnail metadata from those side files when they are present. A name that appears only in `availableTags` is not stored. The rest of that library still migrates.
  - A corrupt database is still quarantined.
  - The catalog document builder does not read `available_tags`.
  - Preset save, tag rename, and tag delete persist in the catalog table. Core settings and desktop settings stay in their JSON files.
  - Browse thumbnail dimensions come from the item row. The thumbnail stage persists that item's revision, width, and height as the item finishes, including a dimension fill when the revision already matches. A favorite, tag, blacklist, or playback change committed during the stage is still present afterward. A cancel keeps thumbnail columns already written. At the end of the thumbnail stage, a JPEG whose item id is not in the catalog is deleted, including after import replaces the catalog, and the server reports progress during that cleanup. Opening the catalog does not delete those files. A cancel before that cleanup finishes leaves them for the next thumbnail stage that completes. JPEG files are not part of export or import.
  - Export and import include presets. Import replaces the destination preset list.
  - Docs and the testing checklist describe schema version 2, presets and thumbnail metadata in the catalog, local JPEG files, a refresh after import to generate thumbnails and remove JPEGs that are not in the imported catalog, and core settings remaining in `core-settings.json`.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — 0 warnings, 0 errors. `dotnet test ReelRoulette.sln` — pass (Core.Tests 256, DesktopApp.Tests 115).
  - `LibraryCatalogSchema2Tests`: `Open_Schema1_MigratesPresetsAndThumbnailMetadata` opens a schema 1 database at schema version 2, drops `available_tags` and `available_tags_present`, keeps the existing tag, copies the preset and thumbnail revision, width, and height, stores a non-positive width as null, stores no `generatedUtc` column, renames the side files, and builds a document with no `availableTags`. `Open_CrashAfterSideFileCopy_DoesNotCopyAgain` keeps the first copy when the side files change before the rename finishes. `Open_MissingOrUnreadableSideFiles_DoesNotRefuse` opens with empty presets and thumbnail columns. `Open_WithoutThumbnailDirectory_LeavesSchema1` leaves schema 1 in place. `PublishIncoming_LeavesSchema1_UntilTheNextOpen` publishes a schema 1 export still at version 1, and the next open migrates it. `Open_DoesNotDeleteThumbnailFiles` leaves an orphan JPEG. `WriteCheckpoint_IncludesPresetsAndThumbnailColumns_AndNotJpegBytes` copies the preset and thumbnail columns and not the JPEG bytes.
  - `LibraryCatalogStoreTests`: `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` creates schema version 2 with no `available_tags` table and does not store a name that appears only in `availableTags`. `Open_EmptyDirectory_CreatesEmptyDatabase` creates schema version 2 with no `available_tags` table. `Open_CorruptRowPage_QuarantinesAndLeavesLibraryJson` still quarantines a corrupt database.
  - `LibraryCatalogSessionTests.BuildDocument_UsesIntegerEnumsAndHourDuration_OmitsThumbnailsAndFingerprintIndex` builds a document with no `availableTags`.
  - `ServerStateRegressionTests.RenameTagInPresetCatalogOnly_ShouldRenameSelectedAndExcludedTags` reloads a renamed preset from the catalog, deletes that tag from the preset, writes `core-settings.json`, and does not write `presets.json` or `desktop-settings.json`.
  - `RefreshPipelineServiceTests`: `EnrichListedItems_UsesRowDimensionsAndJpegExistence` uses row dimensions and JPEG existence. `ThumbnailStage_ShouldWriteIndexMetadataObject` and `ThumbnailStage_ShouldBackfillLegacyStringIndexEntry` persist revision, width, and height as the item finishes, including a dimension fill. `ThumbnailStage_PreservesFavoriteTagBlacklistAndPlaybackDuringTheWrite` keeps a favorite, tag, blacklist, and playback change committed during the write. `ThumbnailStage_CancelKeepsColumnsAlreadyWritten_AndLeavesRemainingCleanup` keeps columns already written, reports thumbnail cleanup progress, and leaves a remaining JPEG when cleanup is cancelled. `ThumbnailStage_RemovesDeletedItemThumbnail_AndKeepsLibraryThumbnails` deletes a JPEG whose item is not in the catalog, including one never listed in `index.json`, and leaves `index.json` in place.
  - `CONTEXT.md`, `docs/architecture.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/dev-setup.md`, `docs/feature-migration.md`, and `docs/checklists/testing-checklist.md` describe schema version 2, presets and thumbnail metadata in the catalog, local JPEG files, a refresh after import, and core settings remaining in `core-settings.json`.
- **Deferrals / Follow-ups**:
  - Catalog document removal follows this milestone and still removes the document builder.
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0. That removal does not remove the schema 1 migration. After that removal, a missing database does not read `presets.json` or the thumbnail index.
  - Account and PIN tables stay with the account and PIN data model work. They extend the schema version rather than replacing this catalog schema.

### M10i15 - Refresh Column Updates

- **Status**: ✅ Complete
- **Goal**: Make each refresh stage write only its own columns as work completes, so a long stage no longer diffs a full catalog snapshot, and so unchanged thumbnails are not revisited file by file.
- **Scope**:
  - Depends on: library catalog export and import cutover.
  - Source refresh, fingerprint, duration, and loudness write the columns that stage owns as work completes. They do not load a snapshot at the start and diff it back at the end.
  - A tag, favorite, blacklist, or playback change that commits during a stage is still present when the stage finishes. The stage does not write those columns.
  - Source refresh still adds, removes, renames, and updates item identity. Missing files are still removed here, not by folder import.
  - The thumbnail stage reads the rows it needs without building the full catalog document. It treats a stored thumbnail revision that still matches the item's fingerprint, size, and write time as current, the same way duration and loudness trust a stored result. It does not stat those source files again. Fingerprint still notices a size or write-time change and updates the fingerprint, which changes the revision.
  - Generate a thumbnail when the item is new, that stored revision differs, or the JPEG is missing. Remove the index entry and JPEG for an item the source stage removed.
  - Remove the thumbnail file-count and byte caps. Every item still in the library keeps its thumbnail. The stage does not delete JPEGs to get under a size or count limit, and it does not stat every JPEG to measure one.
  - Refresh does not load or diff the full catalog document. Tag catalog sync, item-tag sync, and server startup still do, until catalog document removal.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - A refresh run persists source, fingerprint, duration, and loudness changes without loading or diffing a full catalog snapshot.
  - A tag, favorite, or playback change committed during a stage is still present after that stage writes.
  - Source refresh still adds, removes, and renames items. Folder import still does not remove missing files.
  - The thumbnail stage does not build the full catalog document.
  - A refresh where every thumbnail revision still matches does not stat those source files. A new item, a changed revision, or a missing JPEG still generates. An item removed by source refresh loses its thumbnail index entry and JPEG.
  - There is no thumbnail file-count or byte cap. A refresh does not delete thumbnails for items still in the library, and it does not stat every JPEG to enforce a cap.
  - Refresh no longer has a full-document write path. Tag catalog sync and item-tag sync still do, until catalog document removal.
  - Docs and the testing checklist describe refresh as column updates, including thumbnail reuse without a full file walk and no file-count or byte cap.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — 0 warnings, 0 errors. `dotnet test ReelRoulette.sln` — pass (Core.Tests 246, DesktopApp.Tests 115).
  - `dotnet test src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj --filter FullyQualifiedName~RefreshPipelineServiceTests` — 26 passed. `Refresh_PersistsStageColumnsWithoutBuildingTheCatalogDocument` adds and removes a source file and stores fingerprint, duration, and loudness with `DocumentBuilds` unchanged. `FingerprintStage_PreservesFavoriteAndTagCommittedDuringTheWrite` keeps a favorite and tag committed during the fingerprint write. `ThumbnailStage_ReusesMatchingRevisionWithoutTheSourceFile` reuses a matching revision when the source file is absent. `ThumbnailStage_GeneratesWhenJpegIsMissing` generates a missing JPEG. `ThumbnailStage_RemovesDeletedItemThumbnail_AndKeepsLibraryThumbnails` removes a deleted item's thumbnail and keeps one for an item still in the library, with no eviction count. Existing thumbnail tests still regenerate on a changed revision and generate for a new item. `SourceRefresh_ShouldReconcileMovedFile_ByFingerprintWithoutAddRemove` still renames by fingerprint. `ImportSource_UpdatesRowsWithoutBuildingTheCatalogDocument` still leaves a missing file in place.
  - `LibraryOperationsServiceTests`: `DeferredCatalogWrites_CheckpointTheLatestRowsAfterRelease` keeps the startup backup unchanged while catalog writes are deferred, then checkpoints the latest play count after release. `RecordPlayback_WhenBackupGapIsShortened_CreatesACheckpoint` applies a shorter gap on the next save. `RecordPlayback_WhenANewerBackupCannotBeOpened_UsesTheHealthyBackupAge` still checkpoints when the newest healthy backup is outside the gap and a newer file cannot be opened.
  - `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, and `docs/checklists/testing-checklist.md` describe refresh column updates, thumbnail reuse without a source walk, and no thumbnail file-count or byte cap.
- **Deferrals / Follow-ups**:
  - Account and PIN tables stay with the account and PIN data model work.
  - Tag catalog sync, item-tag sync, and the server startup read of the catalog document are the next milestone, still in v0.13.0.
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0.

### M10i14 - Library Catalog Export and Import Cutover

- **Status**: ✅ Complete
- **Goal**: Re-enable library export, import, and catalog backups as a live SQLite `library.db` checkpoint, and deprecate `library.json` library files with removal of startup migration planned for v0.14.0.
- **Scope**:
  - Depends on: source folder import row updates.
  - Re-enable desktop Library Export / Import and server catalog backups that were disabled after the SQLite store landed.
  - Export and import move only `library.db`. The server produces the checkpoint while it has that file open. The desktop asks for a destination, then saves that checkpoint. It is not a zip, not a raw copy of an open WAL file, and not leftover `library.json`. Presets, settings, thumbnails, and backups stay in their own files.
  - Import Library restores that checkpoint by replacing the live SQLite catalog, with remap/skip for sources. Keep the server-stopped acknowledgment, because the desktop replaces the database file. The replacement is written to a temporary file, checkpointed so it does not depend on a WAL sidecar, then published by rename. The previous `library.db` stays aside until the new file is in place and opens. A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed. A file that is not a library database is rejected. A `library.json` archive is not imported.
  - The import confirmation names the library catalog. It does not say the import replaces presets, settings, thumbnails, backups, or `library.json`. An existing `library.db` counts as library data unless a successful read shows it has no sources and no items. A folder that still has only `library.json` with sources or items asks for the same confirmation, and a successful import renames that file aside.
  - v0.13.0 deprecates `library.json` as a library format. It is not the live catalog, not an export, and not a backup. There is no JSON dump action. Startup may still migrate a leftover `library.json` once when `library.db` is missing. v0.14.0 removes that startup migration and the JSON-to-SQLite importer.
  - Server catalog backups use the same server-produced checkpoint, not leftover JSON. The copy runs after the save returns. A failed copy is discarded. A backup that cannot be opened is left in place.
  - Update testing checklist and current-state docs for database-file export and import, catalog backups, and the v0.13.0 deprecation with removal of startup migration planned for v0.14.0.
- **Acceptance criteria**:
  - Export saves a usable SQLite checkpoint of the live library. Import Library can restore that file into the live catalog and remap source folders.
  - Import Library still requires the server-stopped acknowledgment before it replaces the live database.
  - An interrupted replace leaves the previous catalog or the finished incoming file, and does not leave a partial `library.db` or an empty catalog.
  - Import rejects a file that is not a library database, including a `library.json` archive, and does not replace the live catalog.
  - Export does not read `library.json` from disk. There is no JSON dump action. Presets, settings, thumbnails, and backups are not part of the transfer.
  - The import confirmation names the library catalog. An unreadable `library.db`, or a leftover `library.json` that still has sources or items, asks before replace. A successful import renames that `library.json` aside.
  - Server catalog backups capture the live SQLite catalog.
  - Docs and the testing checklist describe `library.db` export and restore, deprecated `library.json` library files, and removal of that startup migration in v0.14.0, without treating `library.json` as the live store.
- **Verification evidence**:
  - `dotnet test ReelRoulette.sln` — pass (Core.Tests 238, DesktopApp.Tests 115).
  - `LibraryCatalogStoreTests`: a checkpoint includes a committed favorite and has no WAL sidecar. An interrupted replace restores the previous catalog. A published incoming file is kept and the previous file is removed on the next open. A finished incoming file is promoted when no previous catalog exists. A partial incoming file does not replace a healthy catalog. An unusable live file is restored from the previous catalog. A failed checkpoint copy deletes its destination. A file that is not a database is not a usable catalog.
  - `LibraryArchiveMigrationTests`: import restores a remapped source and item path, including a `..` segment that stays inside the chosen folder. A file that is not a library database is rejected and does not create `library.db`. An unreadable `library.db` asks for confirmation and is not replaced until that confirmation. A leftover `library.json` with items asks for confirmation, and a successful import renames it to `library.json.migrated`. A failure while discarding the previous catalog leaves the imported database in place. The overwrite confirmation names the library catalog.
  - `LibraryOperationsServiceTests`: opening the service writes a `library.db.backup.*` checkpoint and does not write `library.json.backup.*`. When the backup gap has elapsed, playback writes a checkpoint of the updated play count and does not trim leftover JSON backups. A recent SQLite backup skips another create. Leftover `library.json.backup.*` files stay in place. A backup that is not a database is removed. A backup that cannot be opened is left in place.
  - Current-state docs and the testing checklist describe `library.db` export and restore, deprecated `library.json` library files with startup-migration removal planned for v0.14.0, and SQLite catalog backups.
- **Deferrals / Follow-ups**:
  - Account/PIN persistence in SQLite is deferred to the account and PIN data model work.
  - Presets, core settings, and desktop-settings remain on their current files.
  - Running-server import, Operator export/import, and removal of the desktop Library Export / Import menus are deferred to Operator library catalog transfer. That transfer is a `library.db` checkpoint. It ships with the later account and Operator milestones, in the release after the SQLite store/query sequence.
  - Refresh stays on the full-document adapter until refresh column updates.
  - Removing the one-time startup migration from `library.json`, and the JSON-to-SQLite importer, is deferred to removal of `library.json` library support. This milestone deprecates that file and does not remove the startup migration.

### M10i13 - Source Folder Import Row Updates

- **Status**: ✅ Complete
- **Goal**: Add or refresh a media folder with row inserts and updates, without holding the catalog lock across the disk walk or loading the full catalog document.
- **Scope**:
  - Depends on: desktop full-catalog projection removal.
  - Enumerate the folder outside the catalog lock. Then insert new items and update existing ones in one transaction.
  - Match existing items by path. Keep their id, tags, favorite, blacklist, and playback stats. New files get new rows. Report the same imported and updated counts as today.
  - Do not remove items that are missing on disk. That stays with refresh.
  - Do not build or diff the full catalog document.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Importing a folder persists new and updated items in SQLite and does not load or diff the full catalog document.
  - The disk walk does not hold the catalog lock, so browse is not blocked for the whole scan.
  - An existing item matched by path keeps its id, tags, favorite, blacklist, and playback stats.
  - Items missing on disk are not removed by this import.
  - Docs and the testing checklist describe folder import as a row update.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass (Core.Tests 222, DesktopApp.Tests 121). A new file is inserted. An existing path keeps its id, tags, favorite, blacklist, playback stats, fingerprint, and duration, and updates source, relative path, file name, and media type. A file missing on disk stays. The import does not build the catalog document, and a second unchanged import does not bump the revision. Browse returns while enumeration is still blocked.
  - Manual: importing `/mnt/nas/multimedia/TV` inserted 902 files. Library browse kept answering during that scan, and a query after the import returned the new total.
  - `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased] describe folder import as a row update.
- **Deferrals / Follow-ups**:
  - Refresh stays on the full-document adapter until refresh column updates.
  - Catalog export, import, and backups stay with the library catalog export and import cutover.

### M10i12 - Desktop Full-Catalog Projection Removal

- **Status**: ✅ Complete
- **Goal**: Stop desktop from downloading the full catalog at startup and on resync, and remove that endpoint once nothing calls it.
- **Scope**:
  - Depends on: auto-tag and duplicate scans.
  - Desktop connect and resync do not call the full-catalog projection endpoint. WebUI already does not call it.
  - Header video and photo counts come from library stats. Source names in the filter summary come from the sources API. Tag and category lists for the filter and tag editor come from the tag catalog, not from a full item download.
  - Now-playing tags, favorite, blacklist, and playback stats come from the loaded tile or a single-item read. The loudness baseline is a server aggregate that preserves the current baseline, not a scan of a local item replica.
  - Scoped auto-tag scan does not rebuild a path list from a local item replica.
  - Remove the full-catalog projection endpoint once desktop has stopped calling it. Thumbnail layout fields stay on list query.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Desktop connect and resync do not download the full catalog. WebUI still does not.
  - Header counts, source names, tag and category lists, now-playing tags, and the loudness baseline still match current behavior.
  - The full-catalog projection endpoint is removed. List query still returns thumbnail layout fields.
  - Docs and the testing checklist no longer describe that endpoint as a client read.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass (Core.Tests 220, DesktopApp.Tests 115). The catalog test covers the 75th-percentile loudness baseline, including a video on a disabled source, and a single-item read by id and path that does not build the catalog document. Desktop tests lock connect and resync to library stats, sources, and the tag catalog, and lock the one-item read off the removed projection path. List-query thumbnail enrichment still has its own test. A playback event for a file that is not yet playing does not paint the current-file section; starting that file does. `npm run generate:contracts` regenerated the WebUI client from OpenAPI.
  - Manual: desktop startup and a resync on a large library did not download the full catalog. Header counts, now-playing tags, and loudness normalization still matched. The current-file section updates when that file starts, including a library-grid play whose playback event arrives first.
  - Current-state docs and the testing checklist no longer describe the projection endpoint as a client read. `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i11 - Auto-Tag and Duplicate Scans

- **Status**: ✅ Complete
- **Goal**: Run auto-tag scan, duplicate scan, and duplicate apply without loading the full catalog document.
- **Scope**:
  - Depends on: catalog stats and item-state reads.
  - Auto-tag scan matches tags to items without building the catalog document. `scanFullLibrary: true` still scans every item and ignores a path list. `scanFullLibrary: false` with no list still scans enabled sources only. An explicit list still matches full paths.
  - Duplicate scan groups items whose fingerprint status is ready and whose fingerprint is set, without building the catalog document. Pending, failed, and stale fingerprints stay excluded. A missing fingerprint status is not treated as ready.
  - Duplicate apply removes the non-kept items from the catalog with the existing item delete and still deletes those files on disk. It does not load the full catalog document. The kept item stays.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Auto-tag scan, duplicate scan, and duplicate apply do not load or diff the full catalog document.
  - Auto-tag scan scope matches today's full-library, enabled-source, and explicit-path rules.
  - Duplicate groups are ready fingerprints only. Pending, failed, and stale stay excluded. A missing fingerprint status is not treated as ready.
  - Duplicate apply deletes the non-kept files and catalog rows and leaves the kept item in place.
  - Docs and the testing checklist describe these scans as query-backed.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 219, Desktop 115). `ScanAutoTags_ScopeFollowsFullLibraryFlagAndPathList`: enabled sources return the filename match, the already-tagged file, and the relative-path match; a differently cased path matches that full path; full-library scan ignores the path list and includes a disabled source and an unknown source; the document build count stays put. `ScanAutoTags_WhenNoEnabledSourcesAndNoList_ScansNothing` returns no rows and does not build the document. `ScanDuplicates_HonorsIntegerFingerprintStatus`: one ready pair is grouped with favorite, play count, and tag count; pending, failed, and stale are excluded; two items with a fingerprint and no status are not grouped; the document build count stays put. `ScanDuplicates_ScopeFollowsCurrentSourceAndEnabledSources`: current source and enabled sources return the enabled pair and that source's pending exclusion; all sources also return the disabled pair and its stale exclusion; the document build count stays put. `ApplyDuplicateSelection_ShouldPersistRemovedItems_AndKeepProjectionParity`: a missing keep id deletes nothing; apply deletes the other file and row, reports a missing file and leaves that row, leaves the kept file and its favorite flag, and does not build the document.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - The desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i10 - Catalog Stats and Item-State Reads

- **Status**: ✅ Complete
- **Goal**: Answer library stats and item-state reads with SQL so they do not load the full catalog document.
- **Scope**:
  - Depends on: random selection from the catalog query.
  - Library stats, including global totals and per-source totals, are SQL aggregates. The figures stay the ones clients already show.
  - An item-state read returns only the requested paths and does not load the full catalog document. An empty path list returns no items.
  - WebUI resync stops posting an item-state read with an empty path list and discarding the body.
  - Leave auto-tag scan, duplicate scan, and the desktop full-catalog download on their current paths.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Library stats match the current global and per-source figures and do not load the full catalog document.
  - An item-state request returns only the requested items. An empty path list returns no items and does not load the catalog.
  - WebUI resync does not call item-state with an empty path list.
  - Docs and the testing checklist describe stats and item-state as scoped reads.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 218, Desktop 115). `GetLibraryStats_ShouldAggregateGlobalAndPerSourceTotals` and `GetLibraryStats_ShouldHandleLegacyMediaTypeAndMissingSourceId` still match the current global and per-source figures, including a missing source id matched by path, and the catalog document build count stays put. `GetLibraryStatsAndItemStates_MatchCurrentFiguresWithoutBuildingTheCatalogDocument`: a 120.5 second duration counts as 120 whole seconds (total 180, average 90), a negative play count is ignored, a stored media type other than video or photo follows the file extension, an item-state read returns only the requested path, an empty or blank list returns nothing, and the document build count stays put until an explicit document read. WebUI `sseClient` test: resync syncs refresh status and does not request `/api/library-states`. WebUI unit tests 129 passed. OpenAPI contracts regenerated and the freshness check passed.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.
  - The loudness baseline stays on the desktop full-catalog download until that download is removed.

### M10i9 - Random Selection from the Catalog Query

- **Status**: ✅ Complete
- **Goal**: Choose random and play eligibility through the list-query filter so a catalog revision does not reload the full library into memory.
- **Scope**:
  - Depends on: favorite, blacklist, and playback row updates.
  - Random selection loads the eligible set through the same server filter as library list query. It does not keep a full-catalog cache that rebuilds when the revision changes.
  - The current weighting still runs on that eligible set. An empty eligible set still returns no item.
  - Playing one item reads that item and its source state by id or path. It does not read the rest of the catalog.
  - Eligibility stays server-authoritative. Clients do not gain a local eligibility replica.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - A random draw after a favorite, playback, or tag change does not build the full catalog document.
  - Eligible items for a draw match library list query for the same filter, enabled sources, and media-type options.
  - The current weighting still chooses among that eligible set. An empty eligible set still returns no item.
  - Playing one item reads that item only.
  - Docs and the testing checklist describe random and play eligibility as query-backed.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 217, Desktop 115). `QueryEligible_MatchesListQuery_ForFilterEnabledSourcesAndMediaType`: eligible ids match list query for the same favorites and tag filter, a disabled source and an unknown source stay out, and video or photo options match the list media-type filter. The catalog document build count stays put. `ReadPlaybackItem_ReadsThatItemAndSource_ByIdOrPath_WithoutBuildingTheCatalogDocument`: id or path returns that item, a disabled source is disabled, a missing source row stays enabled, and the document build count stays put. `TrySelectRandom_AfterFavoritePlaybackAndTagChange_DoesNotBuildTheCatalogDocument`: a draw after a favorite, a playback, and a tag change does not build the catalog document, and play plus media lookup by id or path do not either. `TrySelectRandom_WeightedRandom_PrefersNeverPlayedItemInTheEligibleSet`: weighted draws stay inside the list-query set and prefer the never-played item. An empty eligible set still returns no item. A library with no items still returns 503.
  - Manual random draw on a large library immediately after a playback passed. The response came back immediately, and playing one item still started that item.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Library stats, item-state reads, auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i8 - Favorite, Blacklist, and Playback Row Updates

- **Status**: ✅ Complete
- **Goal**: Make favorite, blacklist, playback recording, and clear-stats SQLite row updates so they do not stall on a full-catalog load.
- **Scope**:
  - Depends on: responsive tag apply.
  - Move favorite, blacklist, record-playback, and clear-stats onto the existing single-row catalog updates. Resolve the item by catalog id or full path, as current clients already send.
  - A favorite still clears blacklist, and a blacklist still clears favorite.
  - Clear-stats with no path list clears every row that has a play count or last-played time in one update. A path list clears only those items.
  - Publish the same item-state and playback events as today. Do not build or diff the full catalog document for these operations.
  - Leave the playback catalog cache, library stats, auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, and refresh on their current paths.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Setting a favorite, setting a blacklist flag, recording a playback, and clearing playback stats persist in SQLite and do not load or diff the full catalog document.
  - A favorite still clears blacklist, and a blacklist still clears favorite.
  - Clearing stats with an empty path list clears played items across the library. A path list clears only those items.
  - Other clients still receive the item-state and playback events and update the loaded window the same way they do today.
  - Docs and the testing checklist describe these as row updates.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 211, Desktop 115). `FavoriteBlacklistAndPlayback_PersistByIdOrPath_WithoutBuildingTheCatalogDocument`: favorite and blacklist persist by catalog id or full path, a favorite clears blacklist, a blacklist clears favorite, repeating the same flag does not bump the catalog revision, record-playback increments and stops at the maximum play count, a list that matches nothing clears nothing, a path list clears only those items, and an empty list clears every played row including a last-played time with no play count. The catalog document build count stays put until an explicit document read. `FavoriteBlacklistAndPlayback_PersistWithoutBuildingTheCatalogDocument`: the operations service returns the stored id, path, and flags for those writes, and the catalog document build count stays put until an explicit document read. `itemStateChanged`, `playbackRecorded`, and clear-stats `resyncRequired` are still published from the same endpoint handlers.
  - Manual favorite, blacklist, playback record, and clear-stats for a selection on a large library passed: a favorite clears blacklist, a blacklist clears favorite, browse does not stall, a selection clears only those items, and the other client updates. Clear-all was not run on the real library.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - The playback catalog cache stays until random selection from the catalog query. A row update still bumps the catalog revision.
  - Library stats, item-state reads, auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i7 - Responsive Tag Apply

- **Status**: ✅ Complete
- **Goal**: Make tag apply a SQLite row update so desktop and WebUI saves return immediately and do not stall on a full-catalog load.
- **Scope**:
  - Depends on: WebUI library query cutover.
  - Move tag-editor writes and the tag-editor model read onto catalog-session row operations: item-tag add and remove, category and tag upsert, rename, and delete, and auto-tag apply. Match items by catalog id or full path, as current clients already send.
  - Publish item-tag and tag-catalog events from those writes. When a catalog row changes, read that event's payload from the category and tag tables. Do not build or diff the full catalog document for these operations, and do not load it only to return a model the clients ignore.
  - WebUI save sends only pending category, tag, and item-tag edits. It does not upsert unchanged categories. It uses the catalog returned by the mutation instead of fetching the tag-editor model again.
  - Desktop and WebUI close the tag editor as soon as the user saves. The current file and loaded tiles show the new tags immediately, and the request runs in the background. On failure, restore the previous tags and show the error. The server remains the authority; the local change is that same delta, not a second catalog.
  - The save's own echoed event must not duplicate tags or undo the local update. A tag filter that can change which items are shown still reloads the loaded window once the save lands, and keeps the scroll position.
  - Leave refresh, source import, favorites, blacklist, and playback stats on the full-document catalog adapter.
  - Update the testing checklist and current-state docs for the immediate save.
- **Acceptance criteria**:
  - Adding, removing, renaming, deleting, and auto-applying tags persists in SQLite and does not load or diff the full catalog document.
  - Opening the tag editor and reading its model does not load the full catalog document.
  - A WebUI save that only changes item tags does not upsert categories or tags and does not fetch the tag-editor model a second time.
  - Desktop and WebUI close the editor without waiting for the request. The current file and loaded tiles show the edit immediately. A failed request restores the previous tags and shows an error.
  - The save's own event does not duplicate tags. The other client still receives the item-tag and catalog events and updates.
  - When a tag filter can change which files are shown, the loaded window reloads after the save lands and keeps the scroll position.
  - Docs and the testing checklist describe the immediate save and the server-authoritative rollback.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 209, Desktop 115). `TagEdits_PersistByIdOrPath_WithoutBuildingTheCatalogDocument` and `TagEditorWrites_PersistWithoutBuildingTheCatalogDocument`: item-tag add and remove by catalog id or full path, category and tag upsert, rename, and delete, and auto-tag apply persist, and the catalog document build count stays put until an explicit document read. Opening the tag-editor model does not build that document. `RenameAndDelete_ReturnTheItemIdsThatHadTheTag_WithoutBuildingTheCatalogDocument`: rename and delete return the catalog ids of files that had the tag, and not files that did not, and a missing name returns no ids. The catalog document build count stays put until an explicit document read. `ApplyAutoTagAssignments_ReportsChangedPathsPerTag`: a file that already has the first tag is left out of that tag's changed paths, and the second tag reports only the file that gained it. The apply response includes that per-tag list.
  - `npm test` in `src/clients/web/ReelRoulette.WebUI` — pass (130 tests). `tagSave.test.ts`: a tag-only save posts no category or tag upsert and does not fetch the tag-editor model again. A reorder upserts only the categories whose order changed. Categories whose stored sort numbers are not their display indexes are left alone. A category rename that only changes case is upserted. Local tags update before the request. The save's own echo does not add those tags again. A tag-filter reload runs once, including a rename that has no item-tag echo. A save that started under a tag filter reloads once after that filter is empty, and a save that did not does not. A per-tag auto-tag event for a subset of that assignment's paths is the save's own echo, and a different item-tag event is not. An item-tag echo does not match a subset of its items. The smaller of two matching auto-tag saves takes the event. An assignment with no changed paths is retired, and a later event for that tag is applied. An assignment whose tag was not written is retired when another tag changed the same path, and a later event for the unwritten tag is applied. A live empty tag list replaces the optimistic tags. A failed later step, including one that throws, restores only that tail. A tag added after the save starts is kept when the save fails. A failed rename puts the old name back and keeps a name that was already on the file. A rename replaces that name in the include and exclude lists, and a delete removes it. The stored library filter is what the next reload sends. Another client's echo is applied. A newer in-flight save that finishes first does not take the older save's echo. Failing the newer save leaves that echo. Failing the older save keeps the newer tags. A confirmed item-tag event keeps that tag when the save then fails, including on tiles that were replaced with the old tags. A confirmed rename for a wider set of files still applies, and a later unconfirmed step still rolls back. An in-flight save projects onto replaced tiles. A confirmed auto-tag assignment stays when the other assignment rolls back. An auto-tag the server did not newly write still rolls back. `handleIncomingItemTags`: a catalog rename replaces that name in the include and exclude lists before the reload sees them, a per-item add and remove leaves those lists, and a catalog delete removes the name and reloads when that clears the filter. Those two catalog cases fail when the filter is updated after the reload.
  - `TagSaveApplyTests`: the same immediate tile update, failed-tail undo, and own-echo skip. A rename with no item-tag echo reloads once when a tag filter can change which files are shown. A save that started under a tag filter reloads once after that filter is empty, and a save that did not does not. A per-tag auto-tag event for a subset of that assignment's paths is the save's own echo, and a different item-tag event is not. An item-tag echo does not match a subset of its items. The smaller of two matching auto-tag saves takes the event. An assignment with no changed paths is retired, and a later event for that tag is applied. An assignment whose tag was not written is retired when another tag changed the same path, and a later event for the unwritten tag is applied. The same overlap cases, plus an auto-tag force reload that does not reload a different in-flight save. A tag added after the save starts is kept when the save fails. A failed rename puts the old name back and keeps a name that was already on the file. A rename replaces that name in the include and exclude lists, and a delete removes it. A confirmed item-tag event keeps that tag when the save then fails, including on tiles that were replaced with the old tags. A confirmed rename for a wider set of files still applies, and a later unconfirmed step still rolls back. An in-flight save projects onto replaced tiles. A confirmed auto-tag assignment stays when the other assignment rolls back. An auto-tag the server did not newly write still rolls back. `IncomingRename_UpdatesTheFilterBeforeTheOtherClientReloads`, `IncomingPerItemEdit_LeavesTheFilterInPlace`, and `IncomingDelete_RemovesTheTagBeforeTheOtherClientReloads`: the same catalog rename, per-item edit, and catalog delete. Those two catalog cases fail when the filter is updated after the reload.
  - Manual tag save on a large library from desktop and WebUI, and a forced failure that restores the previous tags, were not run.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Favorites, blacklist, playback stats, the playback catalog cache, stats and item-state reads, auto-tag and duplicate scans, the desktop full-catalog download, source folder import, and refresh each move in the following slices of this series.
  - Library export, import, and catalog backups stay with the library catalog export and import cutover, after the desktop full-catalog download is gone.

### M10i6 - WebUI Library Query Cutover

- **Status**: ✅ Complete
- **Goal**: Cut the WebUI library overlay over to the same list/query API as desktop so both clients browse identically through the server, and keep that window current so showing or hiding the overlay is close to instant.
- **Scope**:
  - Depends on: desktop library query cutover.
  - Replace WebUI overlay browse that filters a full in-memory projection with the server list/query API (filter, search, sort, fill-on-scroll).
  - After the WebUI session can reach the server, load the first query window even if the overlay has never been opened.
  - Preserve current WebUI library UX: overlay shell, header counts, justified grid, overscan, and click-to-play. Header "Showing N of M" uses `totalCount` and `searchBaselineCount`.
  - Keep the loaded window across hide and show. Hiding or showing the overlay does not drop that window, does not call list/query, and does not move the scroll position. Showing it again is instant when a window is already loaded.
  - Favorite, blacklist, playback, and tag updates patch the loaded tiles or reload the loaded window whether the overlay is shown or hidden. Filter, search, sort, and a header preset start over from the first page either way. Header **None** restores the default filter and stays on **None** until that filter changes, even when a saved preset has the same filter. A filter that matches neither a preset nor the default shows a starred row first and does not requery when that row is chosen.
  - Fill-on-scroll runs only while the overlay is shown. Showing it again requests further pages only when the restored viewport is not already covered.
  - `resyncRequired` reloads the loaded window the same way, shown or hidden. It does not fetch the full catalog.
  - Stop fetching full-catalog projection to build an auto-tag path list when scan-full-library is off; scoped scan is `scanFullLibrary: false` with no path list. Do not page list/query to collect paths.
  - Do not introduce WebUI-local catalog mutation or eligibility authority.
- **Acceptance criteria**:
  - WebUI library overlay browse uses the same server list/query contract as desktop.
  - The first query window is loaded after connect, before the overlay is opened.
  - Hiding or showing the overlay does not drop the loaded window, does not query, and keeps the scroll position.
  - Scrolling loads further query windows while the overlay is shown; filter/search/sort/preset requery the server from the first page whether the overlay is shown or hidden.
  - Header counts show the filtered total against the post-search, pre-filter baseline.
  - Favorite, blacklist, playback, tag, and resync updates keep the loaded window current whether the overlay is shown or hidden, without a full-catalog refetch.
  - Auto-tag scoped scan does not depend on a full-catalog projection fetch or a client-assembled path list.
- **Verification evidence**:
  - `npm test` in `src/clients/web/ReelRoulette.WebUI` — pass (98 tests). `libraryQuerySession` covers the first list-query window and header counts from `totalCount` and `searchBaselineCount`, the next page when the loaded rows do not cover the viewport, no fill while hidden, hide/show that issues no query and keeps scroll, a filter change while hidden that replaces the saved window and resets scroll, a favorite patch while hidden when membership cannot change, a favorite reload while hidden under the default blacklist filter, a playback patch and a playback reload, resync that reloads the loaded window through list query, a further page still in flight that is discarded when a tile update arrives, an open first page that is read again instead of being replaced by a reload, tag patch versus tag-filter reload, and a failed further page that retries after the scroll position changes. Scoped auto-tag sends `scanFullLibrary` with an empty path list. Header **None** selects the default filter and stays on **None** when a saved preset equals that default. A later comparison without that hold selects the preset. A filter that matches neither a preset nor the default shows a starred row first. A dirty filter-dialog edit keeps that dialog's base. Choosing None in the filter dialog stays on a preset the working filter still equals. A header None or named pick drops the starred row. `libraryGridController` scrolls an empty reset to the top while the scroller has a box, and applies that reset when the scroller is shown again if it had no box. Desktop preset labels use the same in-memory comparison, and an explicit **None** stays on **None** until the filter changes. `DesktopAppSettingsTests` pass: an explicit **None** hold round-trips with a null preset name, and a settings file without the flag loads as no hold.
  - `node --check` on `src/clients/web/ReelRoulette.WebUI/src/app.js` — pass. The WebUI client no longer calls `GET /api/library/projection`.
  - Manual instant hide/show, fill-on-scroll, and desktop/WebUI browse parity were not run in the browser.
- **Deferrals / Follow-ups**:
  - Source enable/disable list-query refresh stays with the later WebUI source-management alignment work.
  - Export/import format cutover is the next slice in this store/query sequence.

### M10i5 - Desktop Library Query Cutover

- **Status**: ✅ Complete
- **Goal**: Cut the desktop library panel over to the server list/query API with fill-on-scroll, without keeping a full local catalog replica for browse.
- **Scope**:
  - Depends on: library list query API.
  - Replace desktop library-panel browse that filters a full in-memory projection with list/query requests using the active filter, search, and sort.
  - Load additional result windows as the user scrolls (including overscan) and treat the last loaded justified row as provisional until the query is exhausted.
  - Preserve current desktop library UX: justified grid, search/sort, multi-select, bulk actions, and click-to-play. Shift-click range selection covers loaded items only.
  - While the panel is open, favorite, blacklist, playback, and tag SSE update the loaded window by patch or requery. They do not refetch the whole catalog.
  - The startup full-catalog fetch may remain in this slice for non-browse readers (video/photo header, now-playing tag grouping, and other library-index uses outside the grid). Browse, scroll, and filter/search/sort do not depend on it.
  - Stop sending a replica-built path list for auto-tag scan; scoped scan is `scanFullLibrary: false` with no path list (server enabled-source semantics from the catalog store). Do not page list/query to collect paths.
  - Keep random/play API-authoritative; do not reintroduce client-side eligibility authority.
- **Acceptance criteria**:
  - Desktop library browse no longer requires downloading the full catalog to filter, search, sort, or scroll.
  - Scrolling loads further query windows and layout remains stable except for the expected last-row pack of an incomplete page.
  - Filter, search, and sort changes requery the server and reset browse to the start of the result set.
  - Favorite, blacklist, playback, and tag SSE while the panel is open update the loaded window without a full-catalog refetch.
  - Auto-tag scoped scan does not depend on a full local item replica or a client-assembled path list.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core + Desktop, including `LibraryPanelBrowseTests`, `QueryLibrary_AcceptsDesktopDurationFilterJson`, `ShutdownCancel_ShouldStopManualRunWithoutRecordingAFailure`, `ShutdownCancel_DuringFfmpegCheck_DoesNotRecordLoudnessAsUnavailable`, and `ShutdownCancel_LeavesForcedRescansPending`).
  - `LibraryPanelBrowseTests`: another window is requested until the loaded rows cover the viewport plus overscan or the result is exhausted; an append continues at the loaded count and reflows from the last loaded row; a reload covers the loaded count in window-sized slices. A torn live count does not shrink that reload or move the next append offset; only a finished apply commits the span. A queued reset is not replaced by a reload. An append page applies only when the loaded count is still the offset it was fetched against. A held scrollbar defers a query or reload and does not defer an append, so the drag does not replay a reset. That deferred refresh keeps the browse query open and suppresses a further page, so the new filter or sort is not appended onto the old tiles. An open query is read again after a tile update, including a patch and including before the first page arrives. A further page that has not been applied yet counts as that open query, so a patch reloads the loaded window and that page is discarded. A restored scroll offset stays inside the row-model extent. Favorite, blacklist, playback, and tag events patch loaded tiles when the active filter and sort cannot change membership or order. They reload the loaded window when favorites-only, exclude-blacklisted, never-played, a tag filter, or a last-played or play-count sort can. An unchanged id page reflows from the first tile whose aspect changed, and does not reflow when nothing changed. An item in neither the snapshot nor the loaded tiles syncs the full snapshot when the panel is closed, is skipped when the panel is open with no tag filter, and reloads the loaded window after the rest of the event when a tag filter is active. Now-playing stats use the loaded tile when the snapshot misses that file. The current file downloads the snapshot when it is in neither copy. A playback for any other file missing from both copies still refreshes global play totals. A tag event applies the rest of its items before that snapshot download.
  - A finished item splice applies thumbnail fields on the unchanged tail. An append whose loaded count is no longer the requested offset does not request another page. A panel resize waits for the current grid update, then reflows the loaded rows and restores the viewport anchor.
  - `LibraryListQueryTests.QueryLibrary_AcceptsDesktopDurationFilterJson`: a `minDuration` / `maxDuration` string in desktop `HH:MM:SS` form filters the page.
  - Manual fill-on-scroll, filter/search/sort, and in-place favorite updates were confirmed on a large library before the membership reload rules.
  - Server shutdown during a refresh cancels the manual or automatic run, does not record it as a pipeline failure, and does not set a completion time. `ShutdownCancel_DuringFfmpegCheck_DoesNotRecordLoudnessAsUnavailable`: a cancel while the ffmpeg check is blocked leaves the loudness stage incomplete and does not record "ffmpeg not found" or a pipeline error. `ShutdownCancel_LeavesForcedRescansPending`: cancelling the duration and loudness stages leaves both one-shot rescan flags set, and a cancelled manual run still has no pipeline error.
- **Deferrals / Follow-ups**:
  - WebUI overlay cutover is the next slice in this store/query sequence.
  - Jump-to-middle scrollbar accuracy without loading the result prefix remains out of scope. Shift-click range selection of items that are not yet loaded is the same limitation.
  - Removing the startup full-catalog fetch, and moving the video/photo header and now-playing tag grouping off that replica, is deferred until full-catalog projection is removed or explicitly documented as leftover.

### M10i4 - Library List Query API

- **Status**: ✅ Complete
- **Goal**: Add a server-authoritative library list/query API so browse filter, search, sort, and paging run on the server.
- **Scope**:
  - Depends on: SQLite library catalog cutover.
  - Define OpenAPI list/query contracts that accept `filterState`, free-text search, sort, and offset/limit. Apply the desktop library-panel order: enabled sources, then a filename and relative-path substring search, then `FilterState`, then sort. Search uses the invariant-lowercase fold column, accent-sensitive, matching desktop `ToLowerInvariant` substring match. Name sort uses an `OrdinalIgnoreCase` collation, accent-sensitive, matching desktop, not the fold column. Missing files stay in the result.
  - Return items plus `totalCount` (after search and filter; the pageable set) and `searchBaselineCount` (after search, before filter) so WebUI can keep "Showing N of M".
  - Sort modes are Name, LastPlayed, PlayCount, Duration, and DateAdded, each with direction. Direction applies only to the primary key. Null last-played, duration, and last-write sort as the minimum, as in the desktop panel. Ties follow filename with `OrdinalIgnoreCase` ascending, as in the desktop panel `ThenBy`, then item id ascending, including when the primary sort is descending, so offset pages do not skip or repeat ties.
  - Include per-item thumbnail layout fields (`hasThumbnail`, `thumbnailWidth`, `thumbnailHeight`) on listed items without stating thumbnail files for the entire catalog on each request.
  - Update generated clients, API docs, and validation/error behavior for the new query surface.
  - Keep the existing full-catalog projection endpoint until both clients have cut over.
- **Acceptance criteria**:
  - Clients can request a window of library items with desktop library-panel filter, search, and sort semantics, including missing files and invariant case folding.
  - Responses include `totalCount`, `searchBaselineCount`, and enough thumbnail layout metadata for justified-row virtualization.
  - Equal sort keys stay in ascending filename order, then item id ascending, across adjacent offset windows, including when the primary sort is descending, with no skipped or repeated rows.
  - Query results honor server-owned source enabled state. They do not drop items whose files are missing.
  - Contract documentation describes list/query as the browse path and does not treat full-catalog projection as the long-term browse API.
- **Verification evidence**:
  - `LibraryListQueryTests` covers enabled sources then search then filter, the search-then-filter count split, invariant accent-sensitive search, name sort with ordinal ignore-case and id tie-break across descending offset windows, null last-played / duration / last-write placement, play-count and date-added sort, category and legacy tag filters, photo duration/audio skip, missing-file inclusion, empty and large-offset windows, and thumbnail metadata on the returned page only.
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed (Core.Tests 201, DesktopApp.Tests 58).
  - OpenAPI, `docs/api.md`, `CONTEXT.md`, `docs/domain-inventory.md`, and the testing checklist describe list/query as the browse path. `npm run generate:contracts` refreshed `openapi.generated.ts`.
  - Desktop and WebUI still browse through full-catalog projection. Export and import stay disabled.
- **Deferrals / Follow-ups**:
  - Desktop and WebUI browse cutover to this API are later slices in this store/query sequence.
  - Infinite-scroll client behavior is out of scope here.
  - Library export, import, and JSON catalog backups remain disabled until the library catalog export and import cutover. That gap is intentional because this store/query sequence ships as one release, ahead of the later account and Operator milestones.

### M10i3 - SQLite Library Catalog Cutover

- **Status**: ✅ Complete
- **Goal**: Make the SQLite catalog the live library store so catalog mutations are transactional row updates instead of whole-document JSON rewrites.
- **Scope**:
  - Depends on: SQLite library catalog session.
  - On startup, open the catalog session so a healthy `library.db` is authoritative and a missing `library.db` migrates `library.json` using that store.
  - Move every live catalog reader and writer onto the database: library operations (source import, tags, favorites, blacklist, playback stats, duplicates, auto-tag, stats, and projection), the refresh pipeline, source enabled state, and playback's catalog cache. Each updates the affected rows rather than loading and writing the entire catalog document. Playback cache invalidation uses the session revision, not `library.json` last-write time.
  - After migration, do not treat leftover `library.json` as a source of truth: do not dual-write it, do not read it for live catalog operations, and do not copy it for export or backup.
  - Disable desktop Library Export / Import and server `library.json` catalog backups after migration, with a clear unavailable message; do not export, import, or back up a stale JSON snapshot.
  - Make auto-tag scan scope server-authoritative. `scanFullLibrary: true` scans every item and ignores the client list. `scanFullLibrary: false` with no list scans enabled sources only (zero enabled sources scans nothing). An explicit list scans those items. Values in that list are full paths, matched the way scan matches `fullPath` today, so current clients keep working.
  - Keep `GET /api/library/projection` working by reading SQLite. Projection keeps the current JSON shape, including string-or-integer enums and a duration form both current clients already parse. Thumbnail fields stay serve-time enrichments.
  - Do not change desktop or WebUI browse UX in this milestone.
- **Acceptance criteria**:
  - After upgrade, an existing `library.json` library is available from SQLite with equivalent items, sources, categories, tags, legacy `availableTags`, and item flags/stats. `fingerprintIndex` need not survive.
  - A committed row update from any live catalog writer (refresh, tag apply, playback stats, source enabled state, and the other writers in scope) is still present after another of them commits.
  - Refresh, auto-tag apply, and other catalog mutations persist through SQLite; leftover `library.json` is not read, written, exported, or backed up as the live catalog.
  - Desktop Library Export / Import and server JSON catalog backups are disabled with a clear message until the export and import cutover.
  - Auto-tag scan with `scanFullLibrary: false` and no path list matches enabled sources only. An explicit path list still scans those paths. `scanFullLibrary: true` scans every item.
  - Existing clients can still load the library through the current full-catalog projection API.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (194 Core + 58 Desktop).
  - `LibraryOperationsServiceTests`: opening the service migrates `library.json` to `library.db` and does not create or trim `library.json.backup.*`. Playback, tags, import, and stats persist through the session document. Auto-tag with `scanFullLibrary: false` and no path list matches enabled sources only, including zero enabled sources. An explicit path list matches `fullPath`. `scanFullLibrary: true` scans every item and ignores the list. A duration save from an earlier snapshot keeps a tag apply that committed in between. A path rename that only changes casing is stored. A save that fails after an earlier edit does not keep that edit. Duplicate scan excludes integer pending, failed, and stale statuses, and still groups a missing status that has a SHA-256 fingerprint.
  - `RefreshPipelineServiceTests`: fingerprint status persists as an integer. A fingerprint change through the session regenerates the thumbnail. Thumbnail index reads stay on `index.json`.
  - `LibraryPlaybackServiceTests`: a disabled source with a root path returns 409.
  - Server startup resolves the catalog host before it serves. A refused open throws.
  - Desktop Export Library and Import Library show that export, import, and catalog backups are unavailable and do not write a zip.
  - Docs identify SQLite as the live catalog and the temporary export/import/backup gap. List-query browse and new export formats are not documented as shipping.
- **Deferrals / Follow-ups**:
  - Library list/query API and client browse cutover are later slices in this store/query sequence.
  - Re-enabling export, import, and catalog backups (zip envelope with live `.db`, legacy `library.json` zip import, separate JSON dump that is not a restore path) is deferred to the library catalog export and import cutover. Export, import, and catalog backups stay unavailable until that slice. The gap is intentional: this store/query sequence ships as one release, ahead of the later account and Operator milestones.
  - Removing `GET /api/library/projection` is deferred until both clients browse through the list-query API.
  - Account tables in this database are deferred to the account and PIN data model work. They extend `user_version` rather than replacing this catalog schema.

### M10i2 - SQLite Library Catalog Session

- **Status**: ✅ Complete
- **Goal**: Add a Core catalog session whose mutations are transactional row updates, and a projection builder for the current library document shape, without opening that database from the running server.
- **Scope**:
  - Depends on: SQLite library catalog store.
  - `Open` stays the health and migration gate. `Opened` returns a session for the published database. `Refused` returns no session and does not create an empty catalog. `Absent` (no `library.db` and no `library.json`) creates an empty healthy database.
  - Each operation uses its own connection, WAL, and a short busy timeout. A shared connection is not safe across the refresh pipeline and request threads. Mutations update the affected rows. They do not load a snapshot and write every row back.
  - Row writes cover the live catalog writers the cutover will move: sources (insert, display name, enabled flag); items (insert, path and identity, delete, favorite with blacklist cleared, blacklist, play count and last played, clear playback stats, fingerprint fields, duration, loudness, file size, last write time); tags and categories (upsert, rename, delete, catalog sync, per-item tag add, remove, and replace). Adding a tag to an item inserts a missing catalog tag as `uncategorized` and does not change an existing catalog tag's name or category. An upsert does not rename an existing tag; a blank category leaves its category in place, and a different category updates only that category. `availableTags` stays as migrated. New writes do not invent a second tag list.
  - `loudnessError` is a nullable item column on the version 1 schema. `user_version` stays 1. JSON migration stores the field when `library.json` has it. There is no second schema version.
  - Each committing transaction increments a `catalog_meta` revision so the cutover can drop playback's file-timestamp cache.
  - The session can build the current library document from SQLite: sources, items, categories, tags, and legacy `availableTags` when that list was present. `mediaType` and `fingerprintStatus` are integers. `duration` is an `hh:mm:ss` string. Both current clients already parse those forms. Thumbnail fields are not in this document. `fingerprintIndex` is not emitted.
  - The running server still reads and writes `library.json` and does not open `library.db`.
- **Acceptance criteria**:
  - A missing database and missing `library.json` produce an empty healthy `library.db`. A refused database does not.
  - Migrated and empty databases stay at `user_version` 1 and store `loudnessError`.
  - A committed row update is still present after another connection commits a different row. A tag update is not wiped by a later source-enabled update.
  - Built projection JSON uses integer `mediaType` and `fingerprintStatus` and an `hh:mm:ss` duration. Thumbnail fields and `fingerprintIndex` are absent.
  - The revision increments only when a transaction commits.
  - The running server still reads and writes `library.json`. It does not open `library.db`.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (188 Core + 58 Desktop).
  - `LibraryCatalogStoreTests`: an empty directory creates a healthy `library.db` at `user_version` 1 with a session and revision 0. A migrated snapshot alone is still refused and returns no session.
  - `LibraryCatalogSessionTests`: JSON `loudnessError` is stored at `user_version` 1, a favorite update and a duration update on two connections both remain, a tag update survives a later source-enabled update and does not create `availableTags`, an inserted tag with surrounding whitespace and a case-duplicate collapses to one trimmed tag that a later remove clears, renaming a tag onto an existing name leaves one catalog row and one `bar` item tag for items that had either name or both, that rename keeps the earlier category unless it is `Uncategorized` and the other is not, a blank-category upsert keeps an existing name and category and does not bump the revision, a same-category upsert with a different spelling changes nothing, a different category updates only the category, a new tag with a blank category is stored as `uncategorized`, adding a tag to an item inserts a missing catalog tag as `uncategorized` and leaves an existing catalog tag's name and category in place, a repeat add fills a missing catalog row without duplicating the item tag, and a missing item creates no catalog tag, a catalog sync of duplicate names keeps the earlier spelling and category unless that category is `Uncategorized`, an insert that omits fingerprint version stores `1`, an inserted local timestamp is stored as UTC, projection JSON uses integer `mediaType` and `fingerprintStatus` and `00:01:30` for 90.5 seconds, thumbnail fields and `fingerprintIndex` are absent, and revision stays 0 across a read and a missing-item update then increments on commit.
  - `ReelRoulette.Server` has no reference to `LibraryCatalogStore` or `LibraryCatalogSession`. Startup does not open `library.db`.
- **Deferrals / Follow-ups**:
  - Opening this session from the running server, moving live readers and writers onto it, auto-tag scan scope, projection served from SQLite, and disabling export, import, and JSON catalog backups are the next slice in this store/query sequence.
  - Account tables in this database are deferred to the account and PIN data model work. They extend `user_version` rather than replacing this catalog schema.

### M10i1 - SQLite Library Catalog Store

- **Status**: ✅ Complete
- **Goal**: Add a tested SQLite catalog store and JSON migration without opening that database from the running server.
- **Scope**:
  - Depends on: completed WebUI library browser series.
  - Introduce a server-owned SQLite catalog at `library.db` in the same roaming config directory as `library.json`, versioned with `user_version` and run in WAL mode. Tables cover sources, items, categories, tags, item-tag assignments, and legacy `availableTags`. Item primary key is the existing item `id`. Paths, filenames, and tag names keep invariant-lowercase fold columns for substring search and case-insensitive path/tag match. Name sort does not use those fold columns. Duration is stored as `TimeSpan` ticks. Thumbnails, presets, core settings, and desktop settings stay in their current files. `fingerprintIndex` is not stored.
  - Migrate an existing `library.json` when no `library.db` exists, in one transaction, using the parsers the server already uses: `mediaType` and `fingerprintStatus` may be numbers or strings, and duration may be a `TimeSpan`, a seconds number, or a string. Keep legacy `availableTags` when that list is what the library has. Write that database to a temporary file in the same directory, set `user_version`, commit, and sync it. Rename the temporary file to `library.db` only after it is complete. Rename `library.json` to `library.json.migrated` only after that rename has succeeded. A crash before the database rename leaves `library.json` in place and no `library.db`. A crash after it leaves a healthy `library.db`.
  - A healthy `library.db` is authoritative: ignore `library.json` and `library.json.migrated`. A partial or unversioned `library.db` refuses to serve and is not migrated over. When `library.json` is still present, quarantine that database by renaming it aside and leave `library.json` in place, so a later open with no `library.db` can migrate the preserved JSON. When `library.json` is already gone, quarantine the bad database and refuse to serve: do not migrate `library.json.migrated`, and do not create an empty catalog. The same refusal applies when the open finds `library.json.migrated` but neither `library.db` nor `library.json`. Report that the live database was refused and that the migration-time snapshot is still at `library.json.migrated`.
  - The running server does not open `library.db` in this milestone. Live readers and writers stay on `library.json` until the catalog cutover.
- **Acceptance criteria**:
  - An existing `library.json` library can be migrated into SQLite with equivalent items, sources, categories, tags, legacy `availableTags`, and item flags/stats. `fingerprintIndex` need not survive.
  - Successful migration renames `library.json` to `library.json.migrated` only after `library.db` is in place and healthy. A crash before that publish leaves `library.json` unmoved. A later open of a healthy `library.db` does not read either JSON file. A partial or unversioned `library.db` does not serve and does not consume `library.json`. When `library.json` is still present, quarantine lets a later open migrate it. When only `library.json.migrated` remains, the open refuses and does not create an empty catalog.
  - The running server still reads and writes `library.json`. It does not publish `library.db` on startup.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (168 Core + 58 Desktop).
  - `LibraryCatalogStoreTests`: JSON-to-SQLite migration (string enums, numeric duration, TimeSpan duration, legacy `availableTags`, fold columns, `fingerprintIndex` absent), crash before publish leaves `library.json` unmoved and creates no `library.db`, a failed directory sync after publish leaves `library.json` unmoved, a healthy `library.db` ignores both JSON files, a partial database is quarantined so the next open migrates preserved `library.json`, an unversioned database with only `library.json.migrated` is refused, a migrated snapshot alone does not create `library.db`, an existing `library.json.migrated` blocks publish so `library.json` stays put, a bad database with neither JSON file does not name a missing snapshot, a database whose header opens but whose later pages are corrupt is quarantined without consuming `library.json`, a read-only database file fails the pre-publish sync, the Windows directory-sync access mask is `FILE_LIST_DIRECTORY`, a missing `fingerprintStatus` stays null while an explicit Pending `0` stays `0`, a source without an id or root path is omitted, an item with no full path is omitted, a locked `library.db` fails within about a second and stays in place, a blank category id is forced to `Uncategorized` with sort order `int.MaxValue` and a later duplicate id is skipped, that category is appended when the file does not have it, duplicate tag names collapse case-insensitively to the last one, and catalog test connections disable pooling so Windows can rename and delete `library.db`.
  - `ReelRoulette.Server` has no reference to `LibraryCatalogStore`. Startup does not publish `library.db`.
- **Deferrals / Follow-ups**:
  - Opening this database from the running server, moving live readers and writers onto row updates, auto-tag scan scope, projection from SQLite, and disabling export, import, and JSON catalog backups are the next slice in this store/query sequence.
  - Library list/query API and client browse cutover remain later slices. This store/query sequence ships as one release, ahead of the later account and Operator milestones.
  - Account tables in this database are deferred to the account and PIN data model work. They extend `user_version` rather than replacing this catalog schema.

### M10h - WebUI Library Click-to-Play and Responsive Sign-off

- **Status**: ✅ Complete
- **Goal**: Complete WebUI library browser behavior by using the server-authoritative play endpoint and signing off responsive/theme parity.
- **Scope**:
  - Depends on: WebUI library SSE state sync and server-authoritative play endpoint foundation.
  - Wire tile activation to `POST /api/play/{itemId}` and play the returned media through the existing WebUI player path.
  - Map endpoint errors into clear overlay/player feedback without local fallback selection logic.
  - Complete mobile LAN and desktop browser responsiveness, fullscreen behavior, keyboard/focus basics, and light/dark theme polish for the full browser.
  - Update docs and testing checklist for the new standard WebUI library play path.
- **Acceptance criteria**:
  - Clicking a WebUI library tile requests item playback through the server endpoint and starts the returned media in the WebUI player.
  - Playback side effects update all clients through SSE and update the open library browser projection.
  - The browser is usable on mobile-width LAN browsers and desktop browsers in light and dark themes.
  - The browser follows established WebUI icon, dialog, and theming conventions with no desktop list-view parity requirement.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (95 Vitest tests).
  - WebUI `coreApi.test.ts` — `requestPlayItem` URL/body/encoding, success JSON, structured failure, blank id guard.
  - WebUI `libraryPlayModel.test.ts` — 404/409/415/401 and fallback status mapping.
  - WebUI `libraryGridTileModel.test.ts` — `data-item-id`, `tabindex`, `role="button"` on tiles.
  - WebUI modules: `coreApi.ts` (`requestPlayItem`), `libraryPlayModel.ts`, `app.js` (`playFromLibraryItemId`, delegated tile click/keyboard, `playCurrent({ skipRecordPlayback })`, Escape closes overlay), `libraryGridTileModel.ts`, `styles.css` (tile focus/active, mobile sort-cluster wrap).
  - API smoke — `POST /api/play/{itemId}` returns `200` with `RandomResponse` against live server library.
  - Manual UI smoke — confirmed: tile click play (overlay closes, no duplicate `record-playback`), error mapping (404/409/415), keyboard (Escape/Enter/Space), desktop and mobile width, light/dark themes, cross-client SSE playback updates, fullscreen (`docs/checklists/testing-checklist.md`).
- **Deferrals / Follow-ups**:
  - Offline/PWA-specific library browsing and advanced library actions remain future considerations.

### M10g - WebUI Library SSE State Sync

- **Status**: ✅ Complete
- **Goal**: Keep the WebUI library browser projection current while open using existing SSE infrastructure.
- **Scope**:
  - Depends on: WebUI virtual thumbnail grid.
  - Subscribe the library browser model to existing SSE events that affect favorite, blacklist, play count, and last played state.
  - Update visible and non-visible virtualized items without requiring a full overlay reopen.
  - Handle `resyncRequired` by re-fetching the authoritative projection.
  - Preserve the explicit refetch-on-open behavior even after live updates are added.
- **Acceptance criteria**:
  - Favorite and blacklist changes from any client update matching WebUI tiles while the overlay is open.
  - Playback stats and last-played changes from any client update search/sort projections correctly while the overlay is open.
  - SSE replay gaps or resync-required events trigger an authoritative projection re-fetch.
  - Closing and reopening the overlay still performs a fresh projection fetch.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests; desktop change limited to library grid hover opacity 0.79).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (84 Vitest tests).
  - WebUI `libraryProjectionSync.test.ts` — tile-state patch, playback patch with optional server fields, rebrowse decision matrix, id/fullPath lookup.
  - WebUI `libraryProjectionModel.test.ts` — optional `fullPath` parse for SSE path matching.
  - WebUI modules: `libraryProjectionSync.ts`, `libraryGridController.ts` (`resetScroll`), `app.js` SSE handlers (`itemStateChanged`, `playbackRecorded`, `resyncRequired` projection refetch when overlay open).
  - Manual cross-client smoke — confirmed: favorite/blacklist tile updates (visible + scrolled-off), playback sort/filter re-browse (`Play count`, `Last played`, `Only never played`), `resyncRequired` projection refetch while open, refetch-on-open, search/sort/filter scroll-to-top regression, playback continues with overlay open (`docs/checklists/testing-checklist.md`).
- **Deferrals / Follow-ups**:
  - New SSE event types are out of scope unless existing events cannot express the required state changes.
  - `refreshStatusChanged` completion → overlay projection refetch remains deferred (desktop parity gap until follow-up).
  - `createSseClient.ts` consolidation with inline `app.js` SSE remains deferred.

### M10f - WebUI Virtual Thumbnail Grid

- **Status**: ✅ Complete
- **Goal**: Replace the interim filename result list with a responsive, virtualized, desktop-aligned justified thumbnail grid using API-backed projection metadata and shared layout rules.
- **Scope**:
  - Depends on: WebUI library projection search and sort; API-backed library thumbnail metadata and desktop grid cutover.
  - Port or mirror `ReelRoulette.Core.Library.LibraryGridLayout` in WebUI (same constants, aspect fallbacks, row packing, and layout-width rules as Core tests in `LibraryGridLayoutTests.cs`).
  - Build justified-row virtual scrolling with top/bottom spacers so only visible rows (plus a small buffer) are mounted; DOM item count stays bounded relative to the viewport, not total library size.
  - Derive tile aspect ratios from projection `thumbnailWidth` / `thumbnailHeight` and `mediaType` fallbacks (same rules as `LibraryGridLayout.GetAspectRatio`); load tile JPEGs from `GET /api/thumbnail/{itemId}` when `hasThumbnail` is true (no local thumbnail cache reads).
  - Replace the interim scrollable filename list in the library overlay with the virtual grid while keeping the “Showing N of M items” summary.
  - Match the current desktop library grid tile chrome as closely as web technology allows. Before implementation, read `LibraryGridLayout.cs`, `LibraryGridLayoutTests.cs`, the `MainWindow.axaml` tile template, and desktop row virtualization/spacer logic in `MainWindow.axaml.cs`; implement equivalent CSS rather than approximate styling. Parity targets include: square tile edges; image scrim (`#22000000`) with crop equivalent to desktop `UniformToFill` inside variable-size cells; bottom filename bar (`#AA000000`, 12px white, ellipsis); top-right favorite/blacklist badge pill (`#99000000`, Material Symbols, Huggins Orange, 18px); missing-thumbnail placeholder when `hasThumbnail` is false; hover opacity ~0.92.
  - Show favorite and blacklist state indicators on tiles using established Material Symbols conventions.
  - Exclude play-count badges, list-view affordances, multi-select, orange selection overlay, and bulk context menu from this milestone.
- **Acceptance criteria**:
  - The browser renders a responsive justified thumbnail grid on mobile-width and desktop-width overlay layouts.
  - Virtual scrolling keeps mounted row/tile count bounded relative to the visible viewport, not total library size.
  - Justified-row layout at a given content width matches desktop row packing for the same visible items and projection metadata.
  - Aspect ratios use projection dimensions when present and the same media-type fallbacks when missing.
  - Tiles with `hasThumbnail: false` render placeholder behavior consistent with desktop (layout still uses fallback aspect; no broken image).
  - Thumbnail images load from `GET /api/thumbnail/{itemId}` only.
  - WebUI grid tile visual design—including variable tile sizing, row gaps, overlay scrims, filename bar, badge pill, and missing-thumbnail placeholder—matches the desktop grid as closely as web technology allows.
  - Tile hover uses desktop-equivalent opacity treatment; no distinct pressed-state requirement beyond that.
  - Side-by-side visual comparison of WebUI and desktop grids at equivalent viewport widths shows no significant unintentional divergence in tile appearance.
  - Thumbnail cropping, placeholder/missing-thumbnail behavior, and filename metadata remain readable in light and dark themes.
  - Favorite and blacklist indicators appear on tiles; play-count badges do not appear.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (72 Vitest tests).
  - WebUI `libraryGridLayout.test.ts` — Core-aligned `getAspectRatio` and `buildRows` parity; layout width uses full scrollport (no Avalonia 8px right gutter).
  - WebUI `libraryGridVirtualizer.test.ts` — visible row window bounded for 1200-item fixture at mid-scroll.
  - WebUI `libraryGridTileModel.test.ts` — favorite/blacklist badges, missing-thumbnail placeholder (no `<img>`), filename escape, thumbnail URL shape.
  - WebUI library grid modules: `libraryGridLayout.ts`, `libraryGridTileModel.ts`, `libraryGridRowModel.ts`, `libraryGridVirtualizer.ts`, `libraryGridController.ts`; overlay wired via `app.js` grid controller; browse re-browse resets scroll to top.
  - Manual smoke — confirmed: large-projection scroll, API thumbnail loading, mixed-aspect reflow, resize debounce, light/dark themes, side-by-side desktop visual parity, edge-to-edge grid layout, overlay scrollbar, header item count, and responsive toolbar/sort cluster at mobile and desktop widths.
- **Deferrals / Follow-ups**:
  - Multi-select, orange selection overlay, bulk context menu, batch actions, list view, and click-to-play are out of scope for this milestone (selection overlay and bulk actions are planned for a later WebUI library milestone; implementation may differ slightly from desktop to support both touch and pointer input).
  - Any desktop grid behavior that is technically impossible to replicate in a browser context should be noted as a known divergence in milestone completion evidence rather than treated as a blocker.

### M10e2 - API-Backed Library Thumbnail Metadata and Desktop Grid Cutover

- **Status**: ✅ Complete
- **Goal**: Serve thumbnail layout metadata through the library projection API and cut the desktop library grid over to API-only thumbnail access so WebUI can replicate the same contract.
- **Scope**:
  - Enrich `GET /api/library/projection` items at serve time with `hasThumbnail`, `thumbnailWidth`, and `thumbnailHeight` derived from the server thumbnail index (not persisted in `library.json`).
  - Extract the justified-row library grid layout algorithm into `ReelRoulette.Core` with golden-vector tests.
  - Cut desktop library grid thumbnail metadata and image loading over to the projection API and `GET /api/thumbnail/{itemId}`; remove local `thumbnails/` reads for grid rendering.
  - Parse projection thumbnail fields in WebUI `libraryProjectionModel` (prep for M10f; no grid rendering yet).
- **Acceptance criteria**:
  - Projection items expose thumbnail metadata when generated thumbs exist; missing thumbs omit dimensions and set `hasThumbnail: false`.
  - Desktop library grid layout remains visually unchanged and no longer reads local thumbnail cache files for rendering.
  - Desktop visible tiles load thumbnail JPEGs through the API only.
  - After refresh completes, new/changed thumbnails appear without desktop restart (projection refetch + visible-tile reload + layout reflow when dimensions change).
  - Core layout tests and WebUI projection parser tests cover the new contract.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests).
  - `npm run verify` in WebUI — pass (56 Vitest tests).
  - Manual desktop grid smoke — confirmed (Linux desktop): grid appearance and interaction unchanged vs pre-cutover; thumbnails load via projection metadata and `GET /api/thumbnail/{itemId}` after refresh without restart; mixed-aspect layout and panel resize reflow behave as before.
- **Deferrals / Follow-ups**:
  - WebUI virtual thumbnail grid remains M10f.
  - Library archive export/import continues to use on-disk `thumbnails/` (server artifact management, not grid rendering).

### M10e - WebUI Library Projection Search and Sort

- **Status**: ✅ Complete
- **Goal**: Add the WebUI library browser's in-memory projection model, playback FilterState narrowing, free-text search, and desktop-aligned sort controls.
- **Scope**:
  - Depends on: WebUI library overlay shell.
  - Build an in-memory library projection model from the server projection response for overlay rendering.
  - Apply active playback **FilterState** to the library overlay (desktop `LibraryProjectionDisplayFilter` parity).
  - Add free-text search over filename and relative path without server-side query changes.
  - Add sort by name, last played, date added, play count, and duration with ascending/descending selection matching desktop defaults.
  - Keep filtering/sorting deterministic across missing values, mixed media types, and projection refreshes.
- **Acceptance criteria**:
  - Search matches filename and relative path case-insensitively from the in-memory projection.
  - Sort controls support name, last played, date added, play count, and duration in both directions.
  - Default sort behavior matches the desktop library panel.
  - Search and sort combine predictably and update rendered results without re-fetching the projection.
  - Library overlay reflects the active playback filter (Filter Media / header preset) with desktop-aligned display rules.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (168 tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (55 Vitest tests including `libraryProjectionModel`, `libraryProjectionDisplayFilter`, and `libraryBrowseModel` suites).
  - WebUI library browse modules: projection parse + catalog; FilterState display filter port; browse pipeline (enabled sources → search → FilterState → sort); interim scrollable filename result list with “Showing N of M items” summary.
  - Search/sort controls persist across overlay close/reopen; Filter Media Apply and header preset changes re-browse in memory while overlay is open; projection still refetches on every open.
  - Manual smoke — confirmed: FilterState narrowing (default + favorites-only + header preset), search/sort without refetch, Filter Apply re-browse while overlay open, search/sort persistence across close/reopen, refetch-on-open, zero-match messaging, fullscreen, and light/dark themes.
- **Deferrals / Follow-ups**:
  - Virtual thumbnail grid, SSE sync, and click-to-play remain follow-on WebUI library milestones.
  - Server-side search/query endpoints remain out of scope unless projection size proves untenable after virtual scrolling.

### M10d - WebUI Library Overlay Shell

- **Status**: ✅ Complete
- **Goal**: Introduce the WebUI library browser entry point and full-screen overlay shell without implementing the full grid behavior yet.
- **Scope**:
  - Depends on: none.
  - Add a **Library** button to the WebUI top-right overlay controls, positioned left of the filter button.
  - Implement a full-screen overlay matching the existing tag editor and filter dialog shell patterns, including header, close behavior, responsive layout, focus handling, and light/dark theme integration.
  - Wire overlay open/close lifecycle and fetch the library projection on every open, with loading and error states.
  - Keep the initial content minimal enough to validate shell behavior before grid/search/sort work lands.
- **Acceptance criteria**:
  - The Library button appears in the correct top-right overlay control position and opens a full-screen library overlay.
  - The overlay matches established WebUI dialog structure and works in fullscreen/pseudo-fullscreen contexts used by the player shell.
  - Opening the overlay re-fetches the projection every time, including after close/reopen.
  - Loading, empty, and request-failure states are visible and theme-compatible.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (168 tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (36 Vitest tests including new `libraryOverlayModel.test.ts`).
  - WebUI library overlay shell: `#library-open-btn` (`browse` icon) left of filter; `#library-overlay` inside `#fullscreen-stage`; Close-only header; `GET /api/library/projection` on every open with loading/empty/error/summary states; playback continues while open.
  - `libraryOverlayModel.ts` — projection summary parsing (enabled-source item counts), open/close lifecycle, refetch-on-open contract tests.
  - Manual shell smoke — confirmed (Linux desktop, dark theme): open/close from corner control, projection refetch on reopen with loading then summary, native fullscreen overlay usable; light theme not explicitly re-tested (uses same `html.theme-light` overlay pattern as filter/tag dialogs).
- **Deferrals / Follow-ups**:
  - Grid rendering, search, sort, SSE state updates, and click-to-play are handled by later WebUI library-browser milestones.

### M10c - Desktop Grid-Only Library Panel Cleanup

- **Status**: ✅ Complete
- **Goal**: Remove the obsolete desktop library list view so the desktop library panel is grid-only.
- **Scope**:
  - Depends on: desktop click-to-play API cutover.
  - Remove list/grid toggle UI, list-view rendering, and list-view-specific state persistence from the desktop library panel.
  - Keep the existing grid view, thumbnail behavior, filtering behavior, and item activation path intact.
  - Add a `lastWriteTimeUtc`-backed **Date Added** sort mode to the desktop library panel sort selector, supporting both descending (Newest to Oldest) and ascending (Oldest to Newest) directions.
  - Clean up dead list-view styles, settings keys, and code paths without changing library projection contracts.
- **Acceptance criteria**:
  - Desktop library panel always renders the grid view and exposes no list-view toggle.
  - Existing grid thumbnail, sorting, filtering, favorite/blacklist indicator, and click-to-play behavior remain functional.
  - Sort controls include **Date Added** (from `lastWriteTimeUtc`) with both **Newest to Oldest** and **Oldest to Newest** directions.
  - **Date Added** defaults to descending (**Newest to Oldest**), matching desktop time-based sort conventions.
  - Removed list-view preference data is ignored harmlessly if present in existing desktop settings.
  - No WebUI behavior changes are included in this cleanup.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings after cleanup).
  - `dotnet test ReelRoulette.sln` — pass (`LibraryPanelSortTests` Date Added asc/desc/null ordering; existing desktop/core suites).
  - Confirmed `GET /api/library/projection` already exposes per-item `lastWriteTimeUtc` via full library root JSON; no server/OpenAPI contract change required.
  - Desktop library panel is grid-only: removed `LibraryListBox`, grid/list toggle, list scroll-anchor restore, and `LibraryGridViewEnabled` settings read/write (legacy JSON property ignored on load).
  - Added `LibraryPanelSort` helper with **Date added** sort mode (`lastWriteTimeUtc`).
  - Manual grid-only smoke — confirmed (Linux desktop): library panel grid-only with no list/toggle; thumbnails and favorite/blacklist overlays; search and existing sort modes; **Date added** Newest→Oldest/Oldest→Newest (defaults to Newest→Oldest when selected); grid double-click/Enter play via `POST /api/play/{itemId}`; multi-select and right-click bulk context menu; selection persists across filter/sort changes; legacy `libraryGridViewEnabled: false` settings load with grid shown; random playback and prev/next timeline unchanged.
  - Docs/checklist updated to remove list-view validation references.
- **Deferrals / Follow-ups**:
  - Duplicate detection remains in the desktop client until Operator Source Management and must not be removed as part of this milestone.

### M10b - Desktop Click-to-Play API Cutover

- **Status**: ✅ Complete
- **Goal**: Replace the desktop library click-to-play workaround with the server-authoritative item play endpoint.
- **Scope**:
  - Depends on: server-authoritative play endpoint foundation.
  - Route desktop grid item activation through `POST /api/play/{itemId}` instead of determining the selected media locally.
  - Keep LibVLC rendering local to the desktop client while treating the server response as the source of playback truth.
  - Preserve existing desktop error UX for missing/unplayable media with endpoint-backed messages.
  - Remove or retire the click-to-play workaround code path once the API path is verified.
- **Acceptance criteria**:
  - Clicking a desktop library grid item requests playback through the server endpoint and starts the returned media locally.
  - Playback stats, last-played, favorite, and blacklist state continue to update via API/SSE projection only.
  - Missing/unavailable media produces a clear desktop error without local fallback selection logic.
  - Existing random playback and player controls remain unchanged.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings).
  - `dotnet test ReelRoulette.sln` — pass (`CoreServerApiClientPlayItemTests`, `PlaybackMediaUrlResolverTests`, `PhotoPlaybackStreamOpenerTests`; existing Core play-item coverage).
  - Desktop library grid and list activation wired to `RequestPlayItemAsync` with `SkipRecordPlayback` on `PlaybackTarget`; no client `record-playback` for play-item starts.
  - Manual smoke — confirmed (Linux desktop): library grid/list click-to-play for playable video and photo items with Force API `/api/media/...` playback; list double-click, Enter, and play button match grid play-item behavior; favorite/blacklist toggles no longer emit spurious add/remove status on play; random playback and prev/next timeline unchanged.
- **Deferrals / Follow-ups**:
  - WebUI library-browser click-to-play adoption is handled in the WebUI browser series.
  - Non-library play entry points (favorites, blacklist, recently played, timeline navigation) remain on `PlayFromPathAsync` + `record-playback` unless explicitly expanded later.

### M10a - Server-Authoritative Play Endpoint Foundation

- **Status**: ✅ Complete
- **Goal**: Add a dedicated server-owned play request path that any client can use to request a specific library item.
- **Scope**:
  - Depends on: none.
  - Define `POST /api/play/{itemId}` in the OpenAPI contract with deterministic success and failure responses (including optional machine-readable `code` on `ErrorResponse`) for playable item, unknown id, missing media file, disabled source, and unsupported extension cases. Route `itemId` is the persisted library **id** only (not `fullPath`). Direct play does **not** reject blacklisted items; disabled sources return **409**; missing media returns **404** with `play_media_missing`; unknown id returns **404** with `play_item_not_found`; unsupported extension returns **415** with `play_unsupported_media`.
  - Implement the server command path with `LibraryPlaybackService.TryPlayItem`, shared playable extension allowlist (`MediaPlayableExtensions`, aligned with library import lists), and correct per-source `isEnabled` projection for items (including when all catalog sources are disabled).
  - On success, return the same `RandomResponse` shape as random playback, call `LibraryOperationsService.RecordPlayback`, and publish `playbackRecorded` via `ServerStateService` (same side effects as `POST /api/record-playback`). No transcoding/session-streaming.
- **Acceptance criteria**:
  - A valid item-specific play request returns a playable media response for the requesting client.
  - Invalid or unavailable item requests return deterministic status codes and machine-readable error payloads.
  - Playback stats and last-played state are updated server-side and projected to all clients through existing SSE infrastructure.
  - The endpoint is covered in the shared API contract and generated/typed client surfaces where applicable.
  - No client-local state mutation path is introduced for endpoint side effects.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings).
  - `dotnet test ReelRoulette.sln` — pass (`LibraryPlaybackServiceTests` play-item and random-blacklist cases; `PlayItemOrchestrationTests`).
  - WebUI `npm run generate:contracts` / `npm run verify` — pass (OpenAPI + `openapi.generated.ts`).
  - Docs: `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, `CONTEXT.md`, `CHANGELOG.md` `[Unreleased]`, `COMMIT-MESSAGE.txt`.
- **Deferrals / Follow-ups**:
  - Full playback-session, direct-stream, transcode, resume, and format-resilience architecture remains future playback architecture work.
  - Desktop/WebUI cutover to call this endpoint without double `record-playback` is tracked in the desktop/WebUI browser milestones.

### M9i - WebUI Auto Tag Parity

- **Status**: ✅ Complete
- **Goal**: Ship **Auto Tag** in the WebUI with the same **API-level** scan/selection/apply behavior as the **Desktop** **Auto Tag** dialog (full-screen tag overlay with tabs), while using the WebUI’s **shared Save** / **Close**+discard model instead of separate Auto Tag OK/Cancel buttons. **Align Desktop Auto Tag scan scope** with WebUI so **Scan full library** off means **enabled sources only**—not playback/filter state, tag filters, or library search. WebUI integrates into the existing tag experience without duplicating tag logic on the client.
- **Scope**:
  - **Desktop — Auto Tag scan scope:** When **Scan full library** is **unchecked**, the candidate item set for scan/apply is **all library items belonging to enabled sources** only. Remove or bypass any narrowing that used **current filter state**, **tag filter**, or **library search** text for that path (for example **`GetCurrentFilteredLibraryItems`** or equivalent). When **Scan full library** is **checked**, behavior remains **all items** (full library) as today. **`POST /api/autotag/scan`** continues to receive **`scanFullLibrary`** plus **`itemIds`** as **`fullPath`** values for the scoped items (or empty / full-library semantics consistent with the server).
  - Split the WebUI tag overlay into **tabs** using the **same structural pattern** as the WebUI **filter** full-screen overlay: **Edit Tags** retains today’s manual editor; add **Auto Tag** for scan/selection workflows so tab chrome and layout feel consistent across filter and tags.
  - **Shared chrome (both tabs):** **Header** — title, tab strip, **Refresh**, **Close**. **Footer** — add category/tag controls and **Save** (same as today’s tag overlay). Only the **body** switches between **Edit Tags** and **Auto Tag** content.
  - **Default tab:** Opening the overlay from the existing **Edit tags** entry lands on **Edit Tags** first; **Auto Tag** is the sibling tab. **No** extra confirmation when switching tabs; pending work may span both tabs until **Save** or discard.
  - **Auto Tag** tab mirrors **Desktop** scan/selection semantics: **Scan full library**, **View all matches**, explanatory copy (e.g. filename match ignores extension), **Scan Files** → **`POST /api/autotag/scan`**; results list with expand/collapse, row tri-state **Apply**, per-file checkboxes, **Select all** / **Deselect all**, **Total matched** / **To be changed**, status text. **Desktop** uses a separate **OK** / **Cancel** in the Auto Tag **window**; **WebUI** maps **commit** to the shared **Save** and **discard** to **Close** / **Refresh** with **`Discard changes?`** when anything is pending (manual and/or Auto Tag), not separate Auto Tag OK/Cancel buttons.
  - **Save (WebUI):** Single **Save** applies all pending work in order: **(1)** catalog / tag-structure mutations (existing `POST /api/tag-editor/*` upsert/delete/rename sequence), **(2)** manual item tag apply (`POST /api/tag-editor/apply-item-tags` when applicable), **(3)** **`POST /api/autotag/apply`** when Auto Tag has selected assignments after a scan. If any step fails, **abort** the remainder and show the error. **`Save`** shows pending/active state when **either** manual editor deltas **or** Auto Tag selections are pending.
  - **Close / Refresh (WebUI):** If manual and/or Auto Tag changes are pending, prompt **`Discard changes?`** before closing the overlay or refreshing the tag model; **no** prompt on tab switch alone.
  - **Scan request shape (WebUI):** **`scanFullLibrary`** and **`itemIds`** (`fullPath` values) must match the **same scope rules** as **Desktop** after alignment: **off** = items in **enabled sources** only; **on** = full library per server behavior.
  - **In-flight scan UX (WebUI):** While a scan is running, disable **Scan Files** (no overlapping scans), show a clear **status line** (scanning / success / error), and show an **indeterminate progress** indicator consistent with WebUI patterns. Define interaction for **Close** / **Refresh** during an in-flight scan (e.g. disable or cancel scan first) so behavior is deterministic.
  - **After Save** that includes **`POST /api/autotag/apply`**, **refresh or resync tag state** the same way as other WebUI tag mutations (**`tagCatalogChanged`**, **`itemTagsChanged`**, **`resyncRequired`**, and/or refetch of the tag editor model) so the **Edit Tags** tab and any visible chips stay aligned with the server.
  - **Scan full library** default (WebUI): **best-effort `localStorage`** persistence (**Desktop**-style preference), with acceptable fallback if storage is unavailable.
- **Acceptance criteria**:
  - **Desktop:** With **Scan full library** off, Auto Tag scan considers only items from **enabled sources**; filter state, tag filter, and library search **do not** shrink the scan set. With it on, full-library behavior is unchanged.
  - **WebUI:** Scan/selection semantics and **`POST /api/autotag/apply`** payload behavior match **Desktop** Auto Tag for representative libraries (including partial selections and **View all matches**), using the **same** enabled-sources-only rule when **Scan full library** is off.
  - **Edit Tags** and **Auto Tag** are both available inside one WebUI overlay without leaving the flow; **header/footer** shared; tab UX matches the WebUI filter overlay pattern; default tab is **Edit Tags** when opened from the existing control.
  - **WebUI:** **Save** commits manual + Auto Tag pending work in the specified order; **Close** / **Refresh** prompt **`Discard changes?`** when pending; **no** tab-switch-only confirm.
  - During scan, WebUI **in-flight** UX is clear (disabled **Scan Files**, status line, indeterminate progress).
  - After **Save** (including autotag apply), **Edit Tags** data and tag surfaces reflect applied changes without a manual full reload (same class of handling as other tag operations).
  - Automated checks: `dotnet build` / `dotnet test`, WebUI `npm run verify`; OpenAPI/clients updated only if a contract gap is found and fixed.
  - Docs/checklist/`CHANGELOG` `[Unreleased]`/`CONTEXT`/`COMMIT-MESSAGE` updated when work lands, per repo discipline.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings).
  - `dotnet test ReelRoulette.sln` — pass (DesktopApp.Tests + Core.Tests).
  - WebUI `npm run verify` (contracts, typecheck, vitest, build, build-output) — pass.
  - Manual spot-check — **confirmed**: **WebUI** and **Desktop** Auto Tag — **Scan full library** on/off; with it off, scope is **enabled sources** only (e.g. disabled source excluded; filter/search do not exclude items that share an enabled source). **WebUI:** **Save** with combined manual + Auto Tag pending; **Close** / **Refresh** with **`Discard changes?`** when pending.
- **Deferrals / Follow-ups**:
  - Server-owned preference for scan scope instead of WebUI `localStorage`, if desired later.
  - Extra keyboard/ARIA polish on the Auto Tag grid, if not gated here.

### M9h - WebUI Filter Dialog Parity

- **Status**: ✅ Complete
- **Goal**: Bring WebUI playback filtering to parity with the desktop **Filter Media** experience: full filter state editing, tag selection with the same AND/OR semantics (global category combination and per-category local modes), tri-state tag chips, and preset catalog management (create, edit, rename, delete, reorder, update-from-current), while keeping a **quick preset** combobox for fast apply—API-authoritative state only, matching existing tag-editor parity patterns.
- **Scope**:
  - Replace **preset-only** WebUI playback filtering with a desktop-equivalent **filter** UI: **full-screen overlay** implemented the same way as the WebUI tag editor/dialog (layout/shell parity), with desktop-mirroring tabs/sections: **General** (basic flags, media type, client source inclusion, audio filter, duration min/max with **the same free-text format, parsing, validation, and “no min / no max” checkbox semantics as the desktop Filter Media dialog**—e.g. `HH:MM:SS` style inputs, not a divergent mobile-only shortcut), **Tags** (category combination mode, per-category local AND/OR, expandable categories, include/exclude tri-state chips aligned with desktop filter behavior), and **Presets** (list management, header/summary behavior for the **client-held** active preset name, save-as-new, update existing, discard/revert flows as on desktop).
  - **Chrome**: keep the **preset combobox** in its **current** location (shell placement unchanged); add a dedicated **Filter…** control that opens the filter overlay, placed in the **top-right media controls cluster** **to the left of** the tag-edit control (order: … **filter** → **tag** → **favorite** …), using the same **Material Symbols** glyph as desktop (**`filter_alt`**, same tooltip intent as desktop “Select filters…”).
  - Wire filter and preset behavior through existing server APIs (no client-local authoritative preset catalog or server-side filter overrides): **`GET`/`POST /api/presets`**, **`POST /api/presets/match`**, **`POST /api/random`** (request body carries either `filterState` or `presetId`), **`GET /api/sources`** (General tab), **`POST /api/tag-editor/model`** (Tags tab). Continue existing **SSE / `resyncRequired`** handling; **`POST /api/library-states`** is only for **favorite/blacklist item snapshots** on reconnect/resync—not for filter or preset payloads. **Preset list order is API-canonical**; verify OpenAPI and handlers expose every **filter JSON field** and ordering behavior WebUI needs; fix contract/server gaps if found.
  - **Preset catalog freshness:** refetch **`GET /api/presets`** when opening the filter overlay, after every successful **`POST /api/presets`**, and when **`resyncRequired`** is handled (same resync path as other WebUI reloads), so other tabs/clients cannot leave the UI silently stale.
  - **Active preset (UI concept):** the server does not store a per-session “active preset”; WebUI holds the active preset name (and current filter JSON) locally and uses **`POST /api/presets/match`** when a named preset needs to be resolved or labeled—same mental model as desktop’s combo + dialog.
  - Pairing/auth for these endpoints follows the **existing WebUI** and tag-editor gates (no separate auth model).
  - Reuse WebUI theming and chip/surface patterns established for tag editor parity (light/dark, shadows, category rows) so filter and tag UIs feel consistent with desktop and with each other.
- **Acceptance criteria**:
  - Every filter and tag option available in the desktop **Filter Media** dialog is available and persisted via the API from WebUI with the same eligibility semantics for random/next/previous/history playback, for **mouse and touch** workflows; **keyboard parity is best-effort** and not a gate for this milestone.
  - Every **`POST /api/random`** that requests a **new** random pick (including **Next** when not stepping through local history) sends either **`presetId`** **or** the **full serialized `filterState`**—including when **“None” / no named preset** is selected—so eligibility matches desktop for ad-hoc filters.
  - Tag logic matches desktop: global category combination (AND/OR), per-category local ALL/ANY, and tri-state per-tag include/exclude/none behavior including edge cases covered by desktop (empty selection, legacy preset shapes if still supported server-side).
  - Preset operations match desktop intent: create, rename, delete, reorder, set active from list, load preset into editor, update preset from current filter state, and “None” / clear active preset where applicable; preset catalog order matches **GET/POST `/api/presets`** everywhere (combobox + dialog).
  - Quick preset combobox remains usable for one-step apply; full filter overlay is reachable via the dedicated control for all editing workflows.
  - Automated checks green: `dotnet build` / `dotnet test` for the solution, WebUI `npm run verify` (plus any new unit tests for filter/preset client logic); OpenAPI/regenerated clients stay in sync if contracts change.
  - Docs and testing checklist updated for WebUI filter/preset parity (manual spot-check steps vs desktop).
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed locally after implementation.
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passed (contracts, `tsc`, Vitest including `filterStateModel.test.ts`, Vite build + output verify).
  - Manual spot-check: follow **WebUI filter / preset parity** rows in `docs/checklists/testing-checklist.md` against desktop Filter Media where applicable.
  - `CHANGELOG.md` `[Unreleased]`, `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `COMMIT-MESSAGE.txt` updated for this landing.
- **Deferrals / Follow-ups**:
  - Full keyboard/shortcut parity for the filter overlay → optional later milestone or polish pass.
  - Record any other server-only or UX deferrals here if scope must shrink during implementation.

### M9g - Linux Release Readiness and Sign-off

- **Status**: ✅ Complete
- **Goal**: Final Linux + cross-platform tray sign-off for server and **Desktop** client distribution.
- **Scope**:
  - **Owns** the comprehensive automated + manual verification **deferred** from **Avalonia Server Tray + Linux Runtime Baseline**, **Linux Packaging (Server + Desktop)**, **Linux Installation UX**, and **CI Linux Distribution Gates**: full cross-platform matrix (**Windows** + **Linux**), completed `docs/checklists/testing-checklist.md` with PASS/FAIL evidence, and packaged-artifact smokes where applicable.
  - Full automated + manual matrix on **CachyOS** (`linux-x64`): server (Avalonia tray + headless), **Desktop** client, WebUI/operator against server; include **XDG Autostart** on/off validation for **Launch Server on Startup** on **Linux**.
  - AppImage launch, application menu registration, and install script end-to-end on a clean **CachyOS** user profile verified in both tray-capable and headless scenarios.
  - **Windows** server tray and autostart: status **reviewed and documented** against the current baseline; **known open issues** with Avalonia/Win32 tray (if any remain) are **called out in release tracking**—this milestone is **not** blocked on full tray parity alone.
  - End-to-end packaged install/run; release notes and tracking updates.
- **Acceptance criteria**:
  - All automated gates green (build/test/web verify/package/smoke) for Linux and **Windows**.
  - Manual checklist complete with PASS/FAIL evidence (tray-capable vs tray-unavailable on Linux; **Linux** autostart on/off evidence).
  - No critical Linux-only regressions; **Desktop** client behaviors accepted by spot-check matrix where exercised; **Windows** server tray status **reviewed and documented**, with any unresolved Avalonia Win32 tray reliability called out in **release tracking** (does not indefinitely defer this milestone).
  - Tracking docs and changelog reflect **Desktop** naming (`desktop` paths) and Linux-ready state.
- **Verification evidence**:
  - **Automated (local, CachyOS `linux-x64`, 2026-04-10):** `dotnet build ReelRoulette.sln --configuration Release -p:TargetFramework=net10.0 -p:EnableWindowsTargeting=true -m:1`; `dotnet test ReelRoulette.sln --configuration Release --no-build -p:TargetFramework=net10.0 -p:EnableWindowsTargeting=true -m:1` (106 + 13 tests passed); WebUI `npm ci` + `npm run verify` in `src/clients/web/ReelRoulette.WebUI`; `pwsh ./tools/scripts/verify-web-deploy.ps1` (single-origin/control-plane smoke passed); `./tools/scripts/package-serverapp-linux-portable.sh` + `./tools/scripts/package-desktop-linux-portable.sh`; `./tools/scripts/package-serverapp-linux-appimage.sh` + `./tools/scripts/package-desktop-linux-appimage.sh`; `./tools/scripts/verify-linux-packaged-server-smoke.sh` (HTTP checks against extracted portable server OK); AppImage `--help` prerequisite text verified for server (ffmpeg/ffprobe) and desktop (LibVLC/VLC); portable staging tree: zero `.pdb` files, `run-server.sh` executable; `HOME=<temp> ./tools/scripts/install-linux-local.sh` verified stable AppImage names, `reelroulette-*.desktop` under `~/.local/share/applications`, and hicolor icons.
  - **CI / Windows matrix:** Default branch protection is expected to run `.github/workflows/ci.yml` jobs `build-test-linux` and `build-test-windows` (build + test on `ubuntu-latest` and `windows-latest`); Linux packaging + headless packaged-server smoke is `package-linux.yml` (on tag / `workflow_dispatch`). Windows Inno/portable packaging rows in the manual checklist remain **waived** on the maintainer checklist with rationale (no Windows desktop session in this evidence pass).
  - **Release tracking (Windows tray):** Avalonia **11.3.13** tray host with `NativeMenuItem` state updates marshaled on `Dispatcher.UIThread` after async registry work (see `[Unreleased]` / recent **Changed** notes in `CHANGELOG.md`). Residual Win32 tray flakiness, if observed in the field, is treated as a known follow-up—not a blocker for this sign-off per milestone scope.
  - **Docs:** `docs/checklists/testing-checklist.md` metadata + sign-off updated; `MILESTONES.md` (this entry + active tracker); `CHANGELOG.md` `[Unreleased]`; `COMMIT-MESSAGE.txt` final state.
- **Deferrals / Follow-ups**:
  - Manual execution of Windows-only checklist rows (console-window absence, Inno installers, `fetch-native-deps.ps1` on a clean tree, packaged Windows tray/no-console) on a **Windows** maintainer host when cutting a Windows release.
  - `install-linux-from-github.sh` against a live GitHub release asset set when tagging (or rely on CI release upload + spot-check).
  - Optional **CHANGELOG** release section cut and tag publish remain a separate release operator step unless bundled into the next release milestone.

### M9f - WebUI UX/UI Polish

- **Status**: ✅ Complete
- **Goal**: Deliver WebUI UX/UI polish and theme parity with desktop behavior without changing core API-first ownership boundaries.
- **Scope**:
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop, including parity for the consolidated refresh-complete summary (`Core refresh complete | Source | Duration | Loudness | Thumbnails`) using the same compact formatting rules as the desktop app (non-zero-only segments where applicable, `all cached` phrasing for duration/loudness no-scan cases, aligned thumbnail/source token vocabulary).
  - Add WebUI runtime theme detection (system/device dark or light mode) and apply matching theme behavior automatically.
  - Ensure WebUI styling parity with desktop for tag editor and related tag-surface visuals in both light and dark modes.
  - WebUI automatically follows device/system dark-light preference at runtime and keeps styling parity with desktop in both modes.
  - Keep WebUI tag chips visually consistent with desktop across themes:
    - chip text/icons remain white in both light and dark modes,
    - apply consistent chip drop-shadow styling matching desktop.
  - Fix WebUI tag editor category reorder behavior so move-up/move-down operations are treated as apply-worthy changes and activate apply/save affordances.
  - Update WebUI media-container controls layout to match desktop intent:
    - replace the bottom-center edit-tags control with a mute control matching desktop mute-button behavior,
    - move edit-tags action to the top-right controls cluster, positioned left of favorite.
  - Add control-only shadow treatment on the WebUI media container controls (do not dim or shadow the full media container surface).
- **Acceptance criteria**:
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop, including parity for the consolidated refresh-complete summary (`Core refresh complete | Source | Duration | Loudness | Thumbnails`) using the same compact formatting rules as the desktop app (non-zero-only segments where applicable, `all cached` phrasing for duration/loudness no-scan cases, aligned thumbnail/source token vocabulary).
  - WebUI category move-up/move-down actions in tag editor activate apply/save state and persist correctly when applied.
  - WebUI media controls include a desktop-matching mute button in the bottom-center controls position, and edit-tags is moved to top-right immediately left of favorite.
  - WebUI media-container control chrome uses control-only shadow treatment without darkening the full media container background.
  - WebUI automatically follows device/system dark-light preference at runtime and keeps styling parity with desktop in both modes.
  - WebUI tag chips preserve white text/icons with consistent drop-shadow treatment in both light and dark modes.
  - No regressions to previously completed reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).
- **Verification evidence**:
  - Automated: `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, WebUI `npm run verify` (contracts, typecheck, Vitest including refresh projection cases, production build + output verify).
  - Implementation: `src/clients/web/ReelRoulette.WebUI` — `refreshStatusProjection.ts` + `coerceRefreshSnapshot` wired from `app.js` for SSE refresh lines; tag editor `tagEditorCategoryOrderDirty`; `shell.ts` overlay layout (mute in transport row, tag edit top-right); `styles.css` control-only drop shadows and `theme-light`/`theme-dark` via `prefers-color-scheme` in `main.ts`; tag-chip styling unchanged for white glyphs + text shadows across themes.
  - Docs: `CHANGELOG.md` `[Unreleased]`, `CONTEXT.md`, `docs/checklists/testing-checklist.md`, `COMMIT-MESSAGE.txt` updated for this landing.
- **Deferrals / Follow-ups**:
  - WebUI `localStorage` persistence for mute preference (desktop persists volume/mute in settings) remains optional future UX if desired.

### M9e - Cross-Platform Library Migration

- **Status**: ✅ Complete
- **Goal**: Allow users to export their ReelRoulette library from one install and import it on another — including across **Windows** and **Linux** — with a guided source folder remapping step to handle path differences between systems.
- **Scope**:
  - **Export** (`Library > Export Library…`):
    - Produces a single `.zip` archive containing: `library.json`, `core-settings.json`, `desktop-settings.json`, `presets.json`, and an `export-manifest.json`.
    - `export-manifest.json` records: source OS, app version, and the list of unique source folder paths present in the library — used to drive the import remapping UI.
    - Optional checkbox: **Include thumbnails** — if checked, the `thumbnails/` directory is included in the zip. Default unchecked (keeps zip small; thumbnails regenerate on use).
    - Optional checkbox: **Include backups** — if checked, the `backups/` folder from the config directory is included in the zip. Default unchecked.
    - Export writes to a user-chosen location; suggested filename: `ReelRoulette-Library-{timestamp}.zip`.
  - **Import** (`Library > Import Library…`):
    - User picks a previously exported `.zip` via file picker.
    - App parses `export-manifest.json` and `library.json` to enumerate all unique source folder paths from the export.
    - A **remapping dialog** presents each source folder path from the export with a **Browse…** button (to locate the equivalent folder on the current system) and a **Skip** option (source remains in library but is treated as offline/missing, consistent with existing missing-source behavior).
    - After the user confirms remapping, app writes updated config files to the correct platform-specific locations (`~/.config/ReelRoulette/` on Linux; `%APPDATA%/ReelRoulette/` on Windows) with all source paths replaced by the remapped values.
    - If the zip includes thumbnails, copies them to the platform-appropriate local cache location (`~/.local/share/ReelRoulette/thumbnails/` on Linux; `%LOCALAPPDATA%/ReelRoulette/thumbnails/` on Windows).
    - If the zip includes backups, copies the `backups/` folder to the config directory on the target system (`~/.config/ReelRoulette/backups/` on Linux; `%APPDATA%/ReelRoulette/backups/` on Windows).
    - If an existing library is present, prompts the user before overwriting.
  - Path translation is performed entirely in-memory during import — paths in the zip are stored as-is from the source system; no normalization is applied at export time.
  - Feature works symmetrically: **Windows → Linux**, **Linux → Windows**, and same-OS machine-to-machine migrations all follow the same code path.
  - No changes to the internal library data model; migration is a read/transform/write operation on existing JSON structures.
- **Acceptance criteria**:
  - User can export a `.zip` from a Windows install and successfully import it on a Linux install (and vice versa) after remapping source folders.
  - Remapping dialog lists every unique source folder from the export; each can be remapped or skipped independently.
  - Skipped sources appear in the library as offline/missing without error on import.
  - Thumbnails are included in the zip when the checkbox is checked and copied to the correct location on import; import succeeds cleanly when thumbnails are absent.
  - Backups are included in the zip when the checkbox is checked and written to the correct config-directory location on import; import succeeds cleanly when backups are absent.
  - Existing library overwrite prompt appears when a library is already present on the target install.
  - `export-manifest.json` is present in every export zip and contains OS, version, and source path list.
- **Verification evidence**:
  - Implementation: `ReelRoulette.LibraryArchive` + `ReelRoulette.DesktopApp.Tests`, desktop `Library → Export Library…` / `Import Library…` (local disk zip I/O, remap/skip + overwrite confirm + import “server stopped” acknowledgment + **Import to disk** + local `desktop-settings.json` write); docs/checklist updated for current behavior.
  - Author manually verifies round-trip: export from **Windows**, import on **CachyOS** (and vice versa if both environments are available); library loads with remapped sources functional.
  - Same-OS round-trip (e.g. machine-to-machine on **CachyOS**) verified as a simpler baseline case.
  - Thumbnail include/exclude checkbox verified on export; thumbnail presence/absence handled correctly on import.
  - Backup include/exclude checkbox verified on export; backup presence/absence handled correctly on import.
- **Deferrals / Follow-ups**:
  - Automated cross-platform migration test coverage → future test milestone if warranted.
  - Partial-remap recovery (re-opening remapping dialog after a failed import) → follow-up if needed post-verification.

### M9d - CI Linux Distribution Gates

- **Status**: ✅ Complete
- **Goal**: Enforce Linux build/test/package quality in CI, including the **unified Avalonia server tray** and **Desktop** client; publish Linux artifacts to GitHub Releases on tag, mirroring the existing Windows packaging workflow.
- **Scope**:
  - Build/test/verify gates for Linux already exist in `ci.yml` (`build-test-linux`, `web-verify` jobs); `package-linux.yml` is packaging-only, consistent with `package-windows.yml`. No new build/test jobs are required in this milestone unless `ci.yml` needs adjustment for renamed **`desktop`** paths.
  - Add `package-linux.yml` as a peer to `package-windows.yml` — same trigger shape (`workflow_dispatch` + tag push), same version normalization pattern, `ubuntu-latest` runner, bash throughout.
  - `package-linux.yml` runs the Linux packaging scripts from `tools/scripts/` and produces all Linux artifact types established by the time this milestone lands: portable `tar.gz` packages (server + **Desktop**) and AppImage packages (server + **Desktop**).
  - On tag push, `package-linux.yml` uploads all Linux artifacts (`.tar.gz` + `.AppImage`) to the existing GitHub release via `gh release upload`, mirroring the `package-windows.yml` upload behavior.
  - CI artifact uploads (via `actions/upload-artifact`) publish packages to the workflow run for non-tag builds.
  - Smoke checks: packaged server reachability (health/version/operator); optional **headless** server boot without display.
  - Tray-related checks: when feasible, runner verifies **headless fallback**; tray-on-runner validation only where the image/session supports it (do not make CI flaky on absent status notifier).
  - **Windows** jobs remain green; adjust `package-windows.yml` only for renamed **`desktop`** project paths / **Desktop** `.csproj` location if needed.
- **Acceptance criteria**:
  - `package-linux.yml` exists as a standalone workflow file, structurally consistent with `package-windows.yml`.
  - Default-branch/PR Linux pipeline passes and catches Linux-only regressions in server, **Desktop** client, and packaging.
  - On tag push, all Linux artifacts (`.tar.gz` + `.AppImage` for server and **Desktop**) are uploaded to the GitHub release alongside Windows artifacts.
  - Headless server startup remains deterministic in CI (no hard dependency on GUI session for green builds).
- **Verification evidence**:
  - Landed `.github/workflows/package-linux.yml`: `ubuntu-latest`, .NET SDK 10.0.x, Node 22, `ffmpeg`, AppImageKit **12** `appimagetool` install, version normalization, `package-serverapp-linux-appimage.sh` + `package-desktop-linux-appimage.sh`, headless smoke via `tools/scripts/verify-linux-packaged-server-smoke.sh` (unsets display/DBus session variables for the server process; curls `/health`, `/api/version`, `/control/status`, `/operator`), `actions/upload-artifact`, tag path `gh release view` + `gh release upload` for `*.tar.gz` and `*.AppImage`.
  - `package-windows.yml` packaging job updated to .NET SDK **10.0.x** (aligned with solution TFMs and Linux packaging).
  - Default-branch PR CI remains `ci.yml` Linux/Windows build+test and WebUI verify; full tag/release artifact spot-check on GitHub Releases is expected on the next shipping tag (maintainer-verified).
  - CI green builds as the bar for this milestone do not replace the full manual + packaged-artifact sign-off matrix; that broader verification remains **deferred** to **Linux Release Readiness and Sign-off**.
- **Deferrals / Follow-ups**:
  - Full cross-platform manual verification and checklist completion beyond CI gates → **Linux Release Readiness and Sign-off**.

### M9c - Linux Installation UX

- **Status**: ✅ Complete
- **Goal**: Provide polished, low-friction installation paths for Linux users beyond the portable `tar.gz`: an **AppImage** for both server and **Desktop** client, a one-liner GitHub Releases install script, and application menu (`.desktop`) registration handled automatically during install.
- **Scope**:
  - **AppImage** packaging for server and **Desktop** client:
    - Build scripts under `tools/scripts/` producing `ReelRoulette-Server-{Version}-linux-x64.AppImage` and `ReelRoulette-Desktop-{Version}-linux-x64.AppImage`.
    - AppImage bundles carry embedded `.desktop` entry and icon metadata; application menu integration is automatic when `appimaged` is running or via an explicit `--install` flag pattern.
    - AppImage artifacts are self-contained (`linux-x64`) and strip symbols consistent with portable `tar.gz` policy.
    - Native prerequisites (ffmpeg/ffprobe, LibVLC) remain undocumented-as-bundled; document as prereqs in the embedded AppImage `README` or `--help` output, consistent with portable package policy.
  - **GitHub Releases install script** (`tools/scripts/install-linux-from-github.sh`):
    - Fetches the latest release artifact (AppImage preferred; portable `tar.gz` as fallback) from the GitHub Releases API.
    - Places AppImages under `~/.local/share/ReelRoulette/` with stable filenames; portable tarball fallback uses `~/.local/share/ReelRoulette/<target>/<version>/` plus a `~/.local/bin/` launcher symlink.
    - Registers a `.desktop` entry in `~/.local/share/applications/` and runs `update-desktop-database` so the app appears in the application menu.
    - Supports both server and **Desktop** client as install targets (via argument or interactive prompt).
    - Does not require `sudo`; targets the current user only.
  - **Application menu registration** is handled for both install paths (AppImage via embedded metadata + `appimaged` / `--install`; install script via explicit `.desktop` drop + database update); no manual post-install step required for menu integration.
  - Tray/headless fallback policy inherited unchanged from the baseline milestone: the packaged server must start headless when no tray or display is available, without hanging.
  - **Windows** packaging: unchanged; this milestone is Linux installation UX only.
- **Acceptance criteria**:
  - AppImage artifacts build deterministically from `tools/scripts/` for both server and **Desktop** client.
  - Artifact names follow `ReelRoulette-{Component}-{Version}-linux-x64.AppImage`, consistent with release naming conventions.
  - On a fresh install via AppImage or install script, the application appears in the desktop application menu without any manual post-install step.
  - Install script successfully fetches and installs the latest release artifact on the **CachyOS** baseline; user-local install requires no `sudo`.
  - Native prereqs are documented in embedded help/README; nothing is silently missing at launch.
- **Verification evidence**:
  - Landed scripts: `tools/scripts/package-serverapp-linux-appimage.sh`, `tools/scripts/package-desktop-linux-appimage.sh`, shared `tools/scripts/lib/appimage-helpers.sh`, `tools/scripts/install-linux-from-github.sh`; `full-release.ps1` invokes AppImage packaging on Linux after portable steps (requires `appimagetool` on the maintainer machine).
  - AppImages: `artifacts/packages/appimage/ReelRoulette-Server-{Version}-linux-x64.AppImage`, `artifacts/packages/appimage/ReelRoulette-Desktop-{Version}-linux-x64.AppImage` (built from portable tarballs; same publish/strip policy).
  - `docs/checklists/testing-checklist.md` includes AppImage and install-script smoke items; full matrix completion remains **deferred** to **Linux Release Readiness and Sign-off**.
  - Packaging author manual verification on **CachyOS** (AppImage launch, `--install` menu registration, install script end-to-end) is expected before relying on releases; comprehensive tray/headless matrix deferred as above.
- **Deferrals / Follow-ups**:
  - Full AppImage + install script smoke matrix and cross-platform checklist completion → **Linux Release Readiness and Sign-off**.

### M9b - Linux Packaging (Server + Desktop)

- **Status**: ✅ Complete
- **Goal**: Produce distributable Linux artifacts for server and the renamed **Desktop** client using repo-owned packaging scripts.
- **Scope**:
  - Add Linux packaging scripts under `tools/scripts/` (portable first):
    - Server portable package (`ReelRoulette-Server-{Version}-linux-x64.tar.gz`) including WebUI assets in `wwwroot`.
    - **Desktop** client portable package (`ReelRoulette-Desktop-{Version}-linux-x64.tar.gz`) using `desktop`-segment naming and layout aligned with post-rename project output.
  - Both packages are **self-contained** (`linux-x64`, `--self-contained true`) — .NET runtime is bundled; no .NET install required on the target machine.
  - Symbols are **stripped** from packaged binaries (prod-appropriate size; no `.pdb` files in the artifact).
  - Each package includes a **shell wrapper script** (`run-server.sh` / `run-desktop.sh` or equivalent) that sets up the environment (e.g. `LD_LIBRARY_PATH`, working directory) and launches the binary; correct executable bits set on wrapper and binary.
  - Each package includes a bundled `README` (or inline comments in the wrapper) documenting **native prerequisites**: `ffmpeg`/`ffprobe` and LibVLC must be present on the target system and are not bundled.
  - The packaged server binary must start in **headless mode** when no tray or display is available, without hanging — the same fallback behavior established in M9a applies to packaged artifacts.
  - **Windows**-OS packaging for **Desktop** deliverables: unchanged intent; update script paths/names in `tools/scripts/` if the rename moves `.csproj` or output names.
- **Acceptance criteria**:
  - Linux server and **Desktop** client portable artifacts build deterministically from scripts in `tools/scripts/`.
  - Artifacts are self-contained: no .NET runtime required on the target; symbols stripped.
  - Server package includes API/SSE/media/WebUI/Operator assets and whatever the Avalonia tray host requires at runtime.
  - Each artifact includes a shell wrapper with correct executable bits and native prereq documentation.
  - Artifact names follow the pattern `ReelRoulette-{Component}-{Version}-linux-x64.tar.gz`, consistent with Windows release naming (`ReelRoulette-Server-*`, `ReelRoulette-Desktop-*`); no legacy `windows`-path or Windows-centric client naming in Linux outputs.
  - Packaged apps run on the supported Linux baseline in both tray-available and headless/fallback scenarios.
- **Verification evidence**:
  - Landed scripts: `tools/scripts/package-serverapp-linux-portable.sh`, `tools/scripts/package-desktop-linux-portable.sh`; `full-release.ps1` invokes them on Linux after version/verify (and subsequent AppImage steps per Linux Installation UX).
  - Portable tarballs: `artifacts/packages/portable/ReelRoulette-Server-{Version}-linux-x64.tar.gz`, `artifacts/packages/portable/ReelRoulette-Desktop-{Version}-linux-x64.tar.gz` (each includes `run-*.sh`, `README.txt`, no `.pdb` in tree).
  - Docs/checklist updated (`docs/dev-setup.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, `CONTEXT.md`, `README.md`).
  - Full packaged-artifact smoke (tray + headless, CachyOS or CI-chosen Linux, cross-platform checklist completion) remains **deferred** to **Linux Release Readiness and Sign-off**.
- **Deferrals / Follow-ups**:
  - Full Linux packaging smoke matrix and cross-platform checklist completion → **Linux Release Readiness and Sign-off**.
  - AppImage builds, GitHub Releases install script, and application menu (`.desktop`) registration → **Linux Installation UX** (planned).

### M9a - Avalonia Server Tray + Linux Runtime Baseline

- **Status**: ✅ Complete
- **Goal**: Replace the **Windows**-only WinForms server host tray with a cross-platform **Avalonia** tray that preserves today’s behavior; validate server and the **Desktop** client on Linux with **CachyOS (Arch-based, `linux-x64`)** as the primary sign-off environment; align repo naming from legacy **`windows` / Windows-oriented** client identifiers to **`desktop` paths** and **Desktop**-oriented project/product names.
- **Scope**:
  - **Server host tray (WinForms → Avalonia)**:
    - Retire the WinForms `NotifyIcon` host UI path; implement an Avalonia-based tray (or minimal Avalonia application lifetime) shared across **Windows** and Linux.
    - Preserve functional parity with the current tray: **Open Operator UI**, **Launch Server on Startup** (enable/disable autostart in parity across OSes—**Windows** registry-backed behavior today; **Linux** via **XDG Autostart** using a standard `*.desktop` entry in the user autostart directory, with the tray toggle installing/removing or enabling/disabling that entry as appropriate), **Refresh Library**, **Restart Server**, **Stop Server / Exit**, shared icon loading with sensible fallback, non-blocking menu actions, graceful UI-thread shutdown aligned with host restart/stop flows.
    - Preserve **light/dark context-menu theming** on **Windows** where applicable; on Linux, follow the **desktop environment** theme or document explicit behavior when the platform does not expose matching signals.
    - Unify server app targeting where practical (avoid a **Windows**-only TFM solely for tray unless required); keep **`net10.0` headless** path when **tray is unavailable** (no display / no status notifier / unsupported session) with deterministic behavior matching current non-**Windows** headless semantics.
  - **Desktop client**:
    - The **Desktop** GUI client is **already Avalonia**; scope here is Linux **validation and hardening** (not a UI-framework rewrite).
    - **Repo-wide rename**: `src/clients/desktop/...`-style paths, solution/project/assembly names, and docs/scripts slugs move to **`src/clients/desktop/...`**-style paths with **Desktop** client naming (e.g. `ReelRoulette.DesktopApp`—exact identifiers chosen at implementation time; keep **lowercase `desktop` in path segments**, **capitalized Desktop in product-facing names**).
  - **Linux baseline**:
    - Primary manual/automated sign-off reference: **CachyOS**, `linux-x64`, on typical **desktop environment** sessions (tray-capable **and** headless/tray-unavailable cases).
    - Validate consolidated server on Linux: `/health`, `/api/version`, `/api/events`, `/api/media/{idOrToken}`, `/operator`, plus WebUI/static hosting as today.
    - Validate **Desktop** client: launch, pair/connect, random/manual playback, core controls.
    - Validate native deps: **ffprobe/ffmpeg**, **LibVLC** runtime expectations.
    - Keep API-first / thin-client boundaries unchanged.
- **Acceptance criteria**:
  - On **Windows**, after the port, tray menu actions and host lifecycle behavior match pre-port intent (no loss of Operator open, refresh, restart, stop, startup-toggle behavior).
  - On **Linux**, server starts and serves the same core surfaces as above; **Desktop** client completes core workflows against that server.
  - **Launch Server on Startup** works on **Linux**: the tray toggle deterministically enables/disables user login autostart via **XDG Autostart** (`*.desktop` in the user autostart location), verified on **CachyOS** alongside the existing **Windows** registry-backed behavior.
  - Tray-capable **desktop environments** show the Avalonia tray when supported; otherwise server runs **headless** without hanging or requiring a display—deterministic fallback.
  - Linux prerequisites (including VLC/ffmpeg and tray fallbacks) are **documented and reproducible** for the CachyOS baseline.
  - **Desktop** rename is **consistent** in solution, primary scripts, and contributor-facing paths (no lingering **`windows`** folder naming or **Windows**-centric client wording as the canonical **Desktop** app identity).
  - No new client-local authoritative mutation paths are introduced.
- **Verification evidence**:
  - Informal confirmation that server and **Desktop** client run and perform core workflows on a **Linux** desktop baseline (maintainer-reported smoke) is sufficient for closing implementation work in this milestone when paired with green automated gates below.
  - Comprehensive manual verification across **Windows** and **Linux** (full checklist completion, packaged-artifact matrix, formal tray vs headless vs autostart evidence on both platforms) is **deferred** to **Linux Release Readiness and Sign-off** (see that milestone).
  - Automated gates passed (still required when touching release surfaces):
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Notes on any intentional **platform differences** (e.g. autostart implementation details) recorded in the doc slice of this series.
- **Deferrals / Follow-ups**:
  - Full cross-platform manual matrix and checklist-driven sign-off → **Linux Release Readiness and Sign-off**.

### M8i - Desktop App UX/UI Polish

- **Status**: ✅ Complete
- **Goal**: Deliver desktop UX/UI polish and light-dark theme compatibility improvements without changing core API-first ownership boundaries.
- **Scope**:
  - Improve desktop duplicate-review UX in the duplicates dialog:
    - for each duplicate group, render file thumbnails inline above each corresponding file info row for quick visual confirmation,
    - target display order per group:
      1. `x files share fingerprint...` header,
      2. keep-selection dropdown,
      3. file 1 thumbnail,
      4. file 1 info row,
      5. file 2 thumbnail,
      6. file 2 info row,
      7. continue for all files in that group.
  - Keep desktop tag editor category rows theme-compatible:
    - in light mode, category bars use light surfaces with dark-gray borders while text remains readable black,
    - in dark mode, current dark presentation remains visually consistent.
  - Keep desktop tag chips visually stable across themes:
    - chip text/icons remain white in both light and dark modes,
    - apply consistent chip drop-shadow styling aligned with WebUI appearance.
  - Update desktop filter dialog `Tags` tab for visual parity with tag editor presentation in both light/dark modes while preserving control differences:
    - chips expose add/remove controls only,
    - category rows expose local combine-mode dropdown only.
- **Acceptance criteria**:
  - Duplicate groups in desktop duplicates dialog show per-file thumbnails inline in the defined order, enabling quick visual validation before delete/apply actions.
  - Desktop tag editor category rows render with light-compatible surfaces/borders in light mode and retain readable text/contrast in both themes.
  - Desktop tag chips preserve white text/icons with consistent drop-shadow treatment in both light and dark modes.
  - Desktop filter dialog `Tags` tab has visual parity with tag editor surfaces across themes, while preserving intended control differences.
  - No regressions to previously completed reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).
- **Verification evidence**:
  - Implemented desktop duplicate-review thumbnail rendering in the required per-group order using server thumbnail endpoint paths (`/api/thumbnail/{itemId}`) with explicit desktop bitmap loading for deterministic thumbnail display.
  - Added per-group duplicate handling selection to avoid forcing all groups to be processed:
    - each group now supports `Keep All` and per-item keep selection in the same dropdown,
    - desktop settings now persist a global `Duplicate Handling Default Behavior` (`Keep All` default, `Select Best` legacy behavior).
    - duplicate delete confirmation now shows total groups handled and total files to delete, and it no longer prompts when all groups are set to `Keep All`.
    - duplicate item metadata now includes tag counts, and keep-selection dropdown labels now include filename + plays/tags/favorite/blacklisted for easier comparisons.
  - Implemented shared desktop tag-surface styling tokens and applied them across tag editor and filter `Tags` tab:
    - category rows now use theme-aware shared surfaces/borders,
    - chip text/icons are pinned white in both themes,
    - chip text/icon shadows are strengthened to align with WebUI treatment,
    - chip state-specific inset shadow behavior now mirrors WebUI closer for selected states.
  - Preserved filter `Tags` behavior boundaries while applying visual parity:
    - chips remain add/remove controls only,
    - category rows retain local combine-mode dropdown controls,
    - filter tags now render in a responsive wrapping layout instead of a fixed three-column grid.
  - Automated verification passed:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln` (91 passed, 0 failed).
  - Manual validation checklist coverage for desktop UX/theme checks added to `docs/checklists/testing-checklist.md`.
- **Deferrals / Follow-ups**:
  - Capture post-implementation manual desktop verification evidence (light/dark screenshots + pass/fail notes) during the next targeted validation run.

### M8h - Tray Theme Parity and Material Symbols Icon Standardization

- **Status**: ✅ Complete
- **Goal**: Align Windows ServerApp tray UX with system theme behavior and standardize icon rendering on Material Symbols **font-based** patterns (with shared icon styles) for consistent cross-platform theming/customization.
- **Scope**:
  - Windows tray menu theme parity:
    - make tray context menu follow active system theme (light/dark) instead of fixed light styling,
    - keep existing tray action behavior unchanged while applying theme-aware rendering.
  - Desktop icon foundation (font-based):
    - wire `assets/fonts/MaterialSymbolsOutlined.var.ttf` into Avalonia resources for desktop icon rendering,
    - use shared `TextBlock.MaterialSymbolIcon` style for icon font setup,
    - standardize transparent icon-button behavior on shared styles:
      - base class: `IconGlyphBase`,
      - control wrappers: `IconGlyphButton`, `IconGlyphToggle`.
  - Full-surface migration contract (this milestone):
    - use mute button as the first implementation slice, then migrate the intended remaining icon controls/surfaces in desktop and WebUI within this milestone,
    - intentionally retain existing emoji/text indicator surfaces in `MainWindow.axaml` and `ManageSourcesDialog.axaml`,
    - preserve existing control behavior while replacing icon rendering implementation (no feature-behavior regressions during cutover).
  - Cross-surface tinting contract:
    - desktop/Avalonia icon font tinting is driven by foreground color/brush and system theme,
    - WebUI icon font tinting is driven via CSS color/theming so symbols inherit site theme state.
  - Asset/source-of-truth boundaries:
    - keep Material Symbols font asset under `assets/fonts/` as desktop icon-font source.
  - Preserve architecture boundaries:
    - keep icon/theming logic in host/UI/render layers,
    - do not move domain logic into clients for this work.
- **Acceptance criteria**:
  - Tray context menu follows current Windows system light/dark theme at runtime.
  - Desktop icon-font path is active via `MaterialSymbolsOutlined.var.ttf` and shared icon styles (`IconGlyphBase`, `IconGlyphButton`, `IconGlyphToggle`, `MaterialSymbolIcon`).
  - Desktop icon controls/surfaces targeted for migration are moved to the shared icon-style foundation and Material Symbols font rendering, with intentional retention of existing emoji/text surfaces in `MainWindow.axaml` and `ManageSourcesDialog.axaml`.
  - WebUI icon rendering is font-based (Material Symbols via CSS) and supports deterministic CSS-driven tinting.
  - All WebUI icon controls/surfaces are migrated to the Material Symbols font-based CSS path.
  - No regressions to existing tray actions (`Open Operator UI`, `Launch Server on Startup`, `Refresh Library`, `Restart Server`, `Stop Server / Exit`).
- **Verification evidence**:
  - Automated gate pass:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification captures:
    - tray menu light-mode rendering evidence,
    - tray menu dark-mode rendering evidence,
    - desktop icon-surface evidence showing targeted icon migration to shared icon-style + Material Symbols font rendering in light/dark themes, with intentional retention exceptions for `MainWindow.axaml` and `ManageSourcesDialog.axaml`,
    - WebUI icon-surface evidence showing full icon migration to Material Symbols CSS font rendering in light/dark themes,
    - icon-source evidence showing desktop font-asset usage (`assets/fonts/MaterialSymbolsOutlined.var.ttf`).
- **Deferrals / Follow-ups**:
  - Windows tray menu item icons are deferred; add Material Symbols-based tray menu icons in a follow-up milestone after theme-parity rollout stabilizes.
  - Linux tray theme/icon parity remains best-effort and is tracked under Linux milestone work unless explicitly expanded.

### M8g - Windows ServerApp System Tray Baseline (Single Binary, No Console)

- **Status**: ✅ Complete
- **Goal**: Provide a single-binary Windows `ReelRoulette Server` runtime that starts without a command prompt and exposes essential operator actions via system tray.
- **Scope**:
  - Convert Windows ServerApp startup to no-console behavior (`WinExe`) while preserving existing server/API behavior.
  - Require tray icon asset parity with repo branding:
    - system tray icon must use the shared app icon at `assets/HI.ico` (same icon source used by other app/package surfaces).
  - Add initial Windows system tray surface with minimum actions:
    - Open Operator UI (default browser to `/operator`),
    - Refresh Library (manual refresh trigger),
    - Restart Server,
    - Stop Server / Exit.
  - Keep server logic API-authoritative and reuse existing server services/endpoints for lifecycle/refresh operations.
  - Introduce host-UI abstraction so non-Windows runtimes remain headless-compatible and can adopt tray support later without server-core rewrites.
  - Preserve existing packaging/install behavior except for intentional startup UX change (no visible command prompt).
- **Acceptance criteria**:
  - Launching `ReelRoulette.ServerApp.exe` on Windows does not show a command prompt window.
  - Windows tray icon uses the shared app icon from `assets/HI.ico` (not a placeholder/default framework icon).
  - Tray icon appears reliably and menu actions execute deterministically:
    - Operator UI opens in default browser,
    - Refresh action triggers library refresh pipeline,
    - Restart action performs graceful self-restart,
    - Stop/Exit performs graceful shutdown.
  - Existing API/SSE/WebUI/Operator runtime behavior remains functional and unchanged in intent.
  - Single-binary Windows ServerApp packaging remains valid and install/run flow remains reproducible.
  - Linux runtime path is unaffected (continues headless unless Linux-focused tray work is explicitly enabled later).
- **Verification evidence**:
  - Implemented code path:
    - host-UI abstraction added under `src/core/ReelRoulette.ServerApp/Hosting/*` with Windows `NotifyIcon` tray host and non-Windows headless host.
    - tray menu actions wired for Open Operator UI, Refresh Library, Restart Server, and Stop Server / Exit.
    - Windows no-console runtime path implemented via `net9.0-windows` + `WinExe`; non-Windows path remains `net9.0` headless.
    - tray icon source now resolves shared `assets/HI.ico` via published `HI.ico` copy and repo fallback path.
  - Automated gate pass (2026-03-11):
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification completed (`docs/checklists/testing-checklist.md`):
    - no-console Windows launch verified,
    - tray icon parity evidence verified for `assets/HI.ico`,
    - tray action behavior verified for all four required menu actions,
    - packaged portable/install runtime tray behavior verified.
- **Deferrals / Follow-ups**:
  - Linux tray support is explicitly deferred to the Linux milestone group as best-effort capability.
  - Advanced tray UX (notifications, rich status panes, localization, startup-on-login toggles) is out of scope for this milestone unless separately approved.

### M8f - Hardening, Packaging, and Release Readiness

- **Status**: ✅ Complete
- **Goal**: Finalize reliability, packaging, and migration cleanup for the new server-thin-client architecture.
- **Scope**:
  - Add/expand integration tests for API/SSE/runtime transitions and refresh pipeline behavior.
  - Complete migration cleanup of temporary compatibility paths.
  - Finalize packaging/distribution for:
    - `ReelRoulette Server` app,
    - thin desktop client,
    - WebUI assets served by server.
  - Produce migration/upgrade playbook and release-readiness checklist.
  - Add an **Operator Testing Suite** to `/operator` so desktop/web/server validation can be run from UI without ad-hoc shell workflows.
  - Add **connected client/session visibility** in Operator UI (client/session identity and related diagnostics in appropriate sections).
  - Add a dedicated **Server Logs** section in Operator UI for `last.log` with practical triage features.
  - Add **Testing Mode** gate for test/fault controls:
    - testing controls are available only when Testing Mode is enabled,
    - existing control admin auth mode remains authoritative:
      - if admin auth is `Off`, no auth required,
      - if admin auth requires auth, testing actions require auth.
  - Add safe, operator-driven fault/testing scenarios for client UX/error-handling validation, including:
    - API version/capability mismatch simulation,
    - client disconnect/reconnect behavior checks,
    - SSE replay/resync-required recovery checks,
    - missing/invalid media and related API-error path checks.
  - Produce full repo-wide manual testing artifacts linked to Operator test sections:
    - `docs/checklists/testing-checklist.md` (workflow + inline checklist + PASS/FAIL evidence capture).
  - Include Operator-assisted evidence capture quality-of-life features:
    - per-scenario PASS/FAIL + note + timestamp recording,
    - copy/export test evidence bundle (status + relevant log snippets),
    - per-scenario reset/cleanup actions for repeatable reruns.
- **Acceptance criteria**:
  - Stable multi-client operation (desktop + web minimum) against `ReelRoulette Server`.
  - No critical cross-client state divergence.
  - If `ReelRoulette Server` crashes or is unavailable, thin clients show friendly reconnect/start guidance and recover without state corruption.
  - Core JSON persistence uses atomic write semantics (write temp then replace) and is resilient to partial-write failures.
  - Web assets are served with cache-correct behavior (hashed filenames/cache-busting) to prevent stale UI after updates.
  - Full regression suite is part of default CI `dotnet test` gate and remains green.
  - Migration and upgrade documentation is complete and actionable.
  - Operator UI exposes connected client/session identity details sufficient for troubleshooting and correlation.
  - Operator UI includes a dedicated Server Logs section for `last.log` with tail/filter/search/copy-export workflows.
  - Operator Testing Suite can execute key client/server error-handling scenarios from UI when Testing Mode is enabled.
  - Testing controls obey Testing Mode and existing admin auth policy exactly.
  - Repo-wide manual testing manual/checklist is complete, actionable, and mapped to Operator test sections plus common app/server workflows.
  - End-to-end manual verification for desktop/web/server can be executed by a user without requiring ad-hoc command sequences.
- **Verification evidence (implementation + automated gate pass)**:
  - Operator/server implementation now includes:
    - connected client/session/SSE identity snapshots in `/control/status`,
    - dedicated server log endpoint (`/control/logs/server`) and Operator log workbench,
    - testing suite endpoints (`/control/testing`, `/control/testing/update`, `/control/testing/reset`) and Operator Testing Mode/fault controls.
  - Testing policy enforcement implemented:
    - scenario flags require Testing Mode ON,
    - testing actions enforce existing control admin auth mode (`Off` vs `TokenRequired`) using control auth credentials.
  - Windows packaging + CI deliverables implemented:
    - `tools/scripts/package-serverapp-win-portable.ps1`,
    - `tools/scripts/package-serverapp-win-inno.ps1`,
    - `tools/installer/ReelRoulette.ServerApp.iss`,
    - `.github/workflows/ci.yml`,
    - `.github/workflows/package-windows.yml`.
  - Manual validation artifacts added:
    - `docs/checklists/testing-checklist.md`.
  - Automated verification passes on current branch:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual checklist waiver applied per user direction:
    - remaining `NOT TESTED` items in `docs/checklists/testing-checklist.md` are accepted as pass/deferred for this milestone closeout.
  - High/medium reliability fix slice (post-manual test feedback) is implemented:
    - duplicate scan now shows deterministic API-recovery guidance instead of silent no-op,
    - auto-tag scan now reports runtime recovery state accurately and no longer relies on a false version-only health signal,
    - desktop now enforces API/capability compatibility gates and shows reconnect/resync SSE status guidance,
    - missing-media simulation now preserves random selection and fails deterministically at media-fetch endpoints with explicit `Media not found` API errors.
    - desktop legacy locate/remove missing-file dialog flow removed to keep missing-media remediation server-authoritative.
  - Deferred to **UX/UI Polish** (polish-only follow-up):
    - tag-editor apply latency/close responsiveness polish,
    - web refresh-status detail parity enhancements.

### M8e - WebUI and Mobile Thin-Client Contract Standardization

- **Status**: ✅ Complete
- **Goal**: Make WebUI and future mobile clients consume the same stable API contracts from `ReelRoulette Server`.
- **Scope**:
  - Standardize client-facing API contracts/capabilities for desktop/web/mobile parity.
  - Ensure WebUI uses the same API semantics as desktop for migrated behaviors.
  - Scope boundary: playback-session pipeline contracts/capabilities are owned by **Playback Session Contracts and Capability Surface** and are out of scope for this milestone.
  - Define session/reconnect rules on the shared contract surface:
    - persistent per-device `clientId`,
    - optional `sessionId` for future shared-session features,
    - SSE reconnect behavior with missed-revision recovery (replay when available, otherwise authoritative state refetch).
  - Define mobile-ready auth expectations (pairing/session continuity, reconnect continuity) using the same server contracts.
  - Keep client responsibilities strictly orchestration/render (no duplicated domain logic).
- **Acceptance criteria**:
  - WebUI and desktop are behaviorally aligned via shared server APIs.
  - Session/reconnect rules (`clientId`, optional `sessionId`, SSE missed-revision recovery) are documented and validated in client/server behavior.
  - Mobile bootstrap path is contract-ready with no new domain-logic duplication in clients and with documented auth/reconnect expectations.
  - Version/capability compatibility expectations are documented for client evolution.
- **Verification evidence**:
  - OpenAPI contract now documents optional `sessionId` for request/event surfaces and explicit SSE identity/reconnect expectations.
  - Server DTO/contracts now accept and propagate optional `sessionId`, and `/api/version` capabilities now include `identity.sessionId`.
  - Desktop now persists stable `CoreClientId`, generates per-runtime `CoreSessionId`, and propagates both through random/playback/SSE calls with reconnect `lastEventId`.
  - WebUI (legacy + modular seams) now propagates stable `clientId` plus runtime `sessionId` through random/requery/SSE paths and enforces capability checks including `identity.sessionId`.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual verification matrix prepared for desktop+web parity checks (session continuity, reconnect replay/resync, capability-mismatch UX) and ready for operator sign-off.

### M8d - Desktop Playback Policy Compromise (Local-First with API Fallback)

- **Status**: ✅ Complete
- **Goal**: Keep desktop playback performant for local/shared-storage scenarios while preserving API-first orchestration and playback-session-series readiness.
- **Scope**:
  - Introduce desktop playback policy:
    - local playback first when the selected media path is accessible on the desktop machine,
    - automatic API media playback fallback when local path access fails.
  - Route desktop manual library-panel play through API identity orchestration:
    - resolve stable media identity (`itemId`/API-routable identity) before playback-path selection so playback stats remain API-authoritative and deterministic,
    - if manual target cannot be mapped to stable identity, surface explicit user-facing error + guidance (no silent substitute/random reroute).
  - Add desktop setting `ForceApiPlayback` (boolean, default `false`):
    - when enabled, desktop always uses API playback even if local file access is available.
  - Preserve strict desktop thin-client boundaries for non-playback domains:
    - desktop may read/write only `desktop-settings.json`,
    - desktop may read local media files for playback/accessibility checks only,
    - no reintroduction of local authoritative state reads/writes (library/settings/log/domain mutations).
  - Keep this policy compatible with incremental playback-session work so API-only playback can be forced during that series' validation.
- **Acceptance criteria**:
  - Desktop playback selection is deterministic:
    - uses local playback when file path is locally accessible and `ForceApiPlayback=false`,
    - otherwise uses API media playback path.
  - Desktop manual library-panel play is deterministic and API-orchestrated:
    - manual play target is identity-resolved through API path first,
    - unmappable manual targets fail with explicit error + guidance (no implicit substitute playback path).
  - `ForceApiPlayback` is persisted in desktop settings, defaults to `false`, and is respected across restarts.
  - Desktop running on LAN clients can still play local files from shared/NAS mappings when accessible, with seamless API fallback when not accessible.
  - Outside allowed exceptions (desktop settings + media-read playback), no additional local file access is introduced in desktop app.
  - API-first/thin-client guarantees from the desktop thin-client cutover remain intact for source import, duplicates, auto-tag, playback-stats clear, and logging ownership.
- **Verification evidence**:
  - Desktop manual playback entry points now resolve stable API media identity first and surface explicit guidance when a manual target cannot be mapped.
  - Desktop playback target policy now deterministically selects local playback when media is readable and `ForceApiPlayback=false`, otherwise routes playback through API media URLs.
  - `ForceApiPlayback` is persisted in desktop settings (`desktop-settings.json`), defaults to `false`, and is wired through settings load/apply/save plus settings dialog toggle UX.
  - Random playback target handling now accepts API media URLs (absolute or relative) and resolves relative API media routes against configured core base URL.
  - Playback source type is tracked (`FromPath` vs `FromLocation`) so loop-toggle media recreation and timeline navigation preserve chosen playback-path semantics.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Documentation/tracking updates are synchronized for final milestone state: `README.md`, `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `CHANGELOG.md`, `COMMIT_MESSAGE.txt`.

### M8c - Desktop Client Thin-Client Cutover

- **Status**: ✅ Complete
- **Goal**: Convert desktop `ReelRoulette` app to strict thin-client behavior against `ReelRoulette Server`.
- **Scope**:
  - Remove remaining desktop direct runtime/process control of `ReelRoulette Server` functionality.
  - Remove remaining desktop direct authoritative JSON mutation paths for migrated domains.
  - Ensure desktop commands/queries go through shared APIs only.
  - Ensure desktop sync/projection uses API + SSE paths only.
  - Route source import (`Import Folder`) through core API and remove desktop-local import path now that refresh pipeline ownership is server-side.
  - Route duplicate detection (scan + resolve/delete) through reusable core/server APIs and remove desktop-local duplicate execution paths.
  - Route auto-tag scan/suggestion + apply through reusable core/server APIs so the same logic can be consumed by desktop/web/operator/mobile clients.
  - Keep desktop-local persistence limited to client-side UI/preferences in `desktop-settings.json`.
  - Move `last.log` ownership fully to `ReelRoulette.ServerApp`: server-owned logic writes directly to server-side `last.log`, clients send client-event logs through API, and `last.log` is overwritten/reset on ServerApp startup/restart.
  - Desktop connect UX defaults to localhost `ReelRoulette Server`; if unavailable, show clear Connect/Start guidance without hosting/supervising server runtime.
- **Acceptance criteria**:
  - Desktop is a pure API/SSE consumer for authoritative core state.
  - Desktop writes only `desktop-settings.json` for client-side UI/preferences.
  - Desktop never writes core state files (for example `library.json` and core settings files) directly.
  - Import Folder executes through core API only and does not use a desktop-local source import path.
  - Duplicate detection executes through core API only; desktop has no local authoritative duplicate scan/delete path.
  - Auto-tag scan/suggestion and apply execute through core API only; logic is reusable across clients.
  - Desktop does not write `last.log` directly; ServerApp owns `last.log` lifecycle/reset, server-originated logs are written directly by server components, and client-originated logs are ingested via API into the centralized server log.
  - Desktop no longer directly controls, hosts, or supervises `ReelRoulette Server` runtime responsibilities.
  - Desktop functionality remains stable using API/SSE-only migrated flows.
- **Verification evidence**:
  - Desktop runtime auto-start/supervision path removed (`EnsureCoreRuntimeAvailableAsync` no longer launches `run-core.ps1`) and desktop core endpoint defaults to `http://localhost:51234`.
  - Source import now executes through `POST /api/sources/import` with desktop API orchestration.
  - Duplicate detection migrated to reusable server APIs:
    - `POST /api/duplicates/scan`
    - `POST /api/duplicates/apply`
    and desktop duplicate dialogs now orchestrate through those endpoints.
  - Auto-tag scan/suggestion + apply migrated to reusable server APIs:
    - `POST /api/autotag/scan`
    - `POST /api/autotag/apply`
    and desktop auto-tag dialog now consumes API scan/apply flows.
  - Playback stats clear migrated to reusable server API:
    - `POST /api/playback/clear-stats`
    and desktop ClearPlaybackStats action now executes through API command path.
  - Client log ingestion endpoint added (`POST /api/logs/client`) and desktop local `last.log` file writes removed from app/dialog/service log call paths.
  - ServerApp now resets centralized `last.log` at startup, preserving server-owned log lifecycle ownership.
  - OpenAPI updated for this milestone's endpoints/schemas and WebUI generated contracts refreshed (`openapi.generated.ts`).
  
### M8b - Control-Plane UI + API for Runtime Operations

- **Status**: ✅ Complete
- **Goal**: Provide first-class control-plane operations in `ReelRoulette Server` UI and APIs for status/settings/lifecycle management.
- **Scope**:
  - Add operator UI for:
    - runtime status/health,
    - settings editing/apply,
    - stop/restart operations (with start handled by external launch flow),
    - operation result/error visibility.
  - Expose control-plane API endpoints for trusted clients/tools:
    - `get status`,
    - `get settings`,
    - `apply settings`,
    - runtime restart operations.
  - Reserve `/control/*` namespace for control-plane/admin runtime operations, separate from media/client API routes.
  - Define transport/auth/trust model for control-plane APIs (local-first, optional LAN exposure with explicit safeguards).
  - Keep control-plane access local-first (localhost always available on the shared listener); LAN exposure is opt-in via runtime settings with explicit safeguards.
  - Define deterministic operation semantics:
    - idempotent command behavior,
    - conflicting-operation handling,
    - partial-failure reporting.
- **Acceptance criteria**:
  - Control-plane UI and API both function and are documented.
  - Control-plane access is localhost-available by default on the shared listener, with LAN control access disabled unless explicitly enabled by runtime settings.
  - LAN exposure for control-plane endpoints requires explicit enablement plus pairing/auth and clear operator warnings.
  - Settings apply/restart behavior is deterministic and observable.
  - Control-plane auth/trust policy is implemented and enforced.
  - No orphan child/runtime process behavior remains in supported restart/shutdown flows.
- **Verification evidence**:
  - Added control-plane APIs under `/control/*`: `GET /control/status`, `GET/POST /control/settings`, `GET/POST /control/pair`, `POST /control/restart`, and `POST /control/stop`.
  - Added control-plane settings persistence and deterministic apply result reporting (`accepted`, `restartRequired`, `message`, `errors[]`) in core settings service.
  - Added control-plane auth/trust enforcement with localhost-available default and explicit LAN gating tied to runtime bind settings plus optional admin token auth.
  - Expanded operator UI to a responsive dark-theme layout with runtime status, lifecycle controls, incoming/outgoing API telemetry panels, and connected-client visibility.
  - Added control telemetry and connected-client status projection (`paired sessions` and `SSE subscribers`) through `/control/status`.
  - Extended OpenAPI contract and server contract tests for new control-plane endpoints/schemas.
  - Extended smoke verification (`verify-web-deploy.ps1/.sh`) to validate control-plane status/settings endpoints in the consolidated runtime flow.

### M8a - ReelRoulette Server App Consolidation (Single Process, Single Origin)

- **Status**: ✅ Complete
- **Goal**: Consolidate runtime hosting into one user-facing `ReelRoulette Server` app (UI + core runtime + API/SSE + Web UI static serving) with no separate WebHost process and no atomic deployment switching.
- **Scope**:
  - Create the server control app as `ReelRoulette Server` (operator UI app).
  - Host all runtime responsibilities inside this app/process:
    - core domain runtime,
    - API endpoints,
    - SSE endpoint,
    - media streaming endpoints,
    - WebUI static asset serving.
  - Remove separate `WebHost` process dependency from runtime architecture.
  - Retire manifest-based atomic web deployment switching (`active-manifest`, version pointer switching) from active runtime behavior.
  - Enforce single browser-visible origin/port for WebUI + API + SSE + media.
  - Serve WebUI, API, SSE, and media streaming from the same scheme/host/port (one origin and one port).
  - Keep deployment model simple: current active web assets served directly by `ReelRoulette Server`.
- **Acceptance criteria**:
  - `ReelRoulette Server` runs as a single app/process and serves WebUI/API/SSE/media on one origin.
  - `ReelRoulette Server` exposes runtime metadata/health endpoints (`/health`, `/api/version`, `/api/capabilities`) for clients and operator diagnostics.
  - No separate WebHost process is required for normal runtime.
  - Atomic web version switching is removed from required runtime path.
  - Web client works without CORS for normal operation (same-origin by design).
  - Operator can manage runtime settings and service state from the `ReelRoulette Server` UI.
  - `ReelRoulette Server` app self-restart paths (settings changes or host failures) are graceful and deterministic (clean shutdown, no orphaned listeners/ports).
- **Verification evidence**:
  - Added new consolidated host project: `src/core/ReelRoulette.ServerApp` (single process serving API/SSE/media/static WebUI/operator UI).
  - `ReelRoulette.Server` endpoint composition now includes `GET /api/capabilities` and OpenAPI contract updates in `shared/api/openapi.yaml`.
  - Dynamic same-origin runtime config is served from server app (`/runtime-config.json`) and WebUI static content is served by the same host/port as API/SSE/media.
  - Web runtime `enabled` now controls WebUI availability only: when disabled and after restart, WebUI entry routes return `404` while API/SSE/media/operator paths remain available.
  - Web runtime settings apply follows explicit two-step semantics: apply persists settings, then operator triggers restart (`POST /control/restart`) for listen/auth/WebUI gating changes to take effect.
  - Operator UI now shows next operator URL hints after apply and runtime status content wraps/scrolls without overlap.
  - `tools/scripts/run-core.ps1` and `tools/scripts/run-core.sh` now start `ReelRoulette.ServerApp` by default.
  - `ReelRoulette.Worker` no longer supervises external `ReelRoulette.WebHost` in its startup path.
  - Prior version-switch runtime dependency is removed from required runtime behavior; `verify-web-deploy.*` now executes this milestone's single-origin smoke checks.
  - Operator UI path `/operator` provides status visibility, runtime settings apply (`/api/web-runtime/settings`), and restart control (`POST /control/restart`, localhost-only).

### M7e - Contract Compatibility and Final M7 Verification Gate

- **Status**: ✅ Complete
- **Goal**: Lock independent-release safety and complete this series sign-off with contract-compatibility guarantees.
- **Scope**:
  - Enforce N/N-1 compatibility policy with capability checks for independent web/core releases.
  - Generate TS web client contracts from OpenAPI; verify C# contract compatibility against the same API source.
  - Execute hybrid verification gate (automated + manual) as required milestone exit criteria.
- **Acceptance criteria**:
  - Web API/event models are generated from OpenAPI and validated in CI.
  - Capability checks prevent unsupported feature usage against older compatible core/server versions.
  - Automated gates pass: build-output asset serving, direct web-to-core SSE/refresh status projection, and OpenAPI compatibility checks.
  - Manual gates pass: direct web connect without desktop bridge, refresh status-line parity through run/fail/complete states, and auth/reconnect continuity.
  - Acceptance criteria across the full direct-web migration sequence are explicitly verified before advancing to the next major phase.
- **Verification evidence**:
  - OpenAPI contract generation pipeline added to WebUI (`openapi-typescript`) with generated types committed at `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`.
  - Web verify gate now includes stale-contract enforcement (`npm run verify:contracts`) and fails when generated TS contracts drift from `shared/api/openapi.yaml`.
  - `VersionResponse` contract now exposes explicit compatibility/capability metadata (`minimumCompatibleApiVersion`, `supportedApiVersions`, `capabilities`) in OpenAPI and server DTO mapping.
  - Web auth/version bootstrap paths enforce N/N-1 compatibility and required capability checks before normal feature execution.
  - C# compatibility regression coverage extended (`ServerContractTests`) for version compatibility/capability fields and OpenAPI property presence checks.
  - Automated verification gate passes:
    - `npm run verify` in `src/clients/web/ReelRoulette.WebUI`
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Manual gate checklist/instructions prepared at `m7e-final-verification-checklist.md` for direct web-connect, refresh-status parity, and auth/reconnect continuity sign-off.

### M7d - Controlled Cutover and Legacy Bridge Retirement

- **Status**: ✅ Complete
- **Goal**: Complete migration to direct web-to-core paths while preserving current web-remote user experience, then remove legacy embedded web-remote bridge mutations/events.
- **Scope**:
  - Use a two-phase rollout with time-bounded migration feature flags:
    1. parity-capable independent web path behind flag(s)
    2. default-on independent path followed by legacy removal
  - Define flag owner/default-by-environment/validation coverage/removal target metadata.
  - Migrate the current legacy web UI experience into `ReelRoulette.WebUI` with functional and visual parity for the main media page, custom media controls, tag editor workflows, and related interaction paths.
  - Integrate desktop settings UX so users can continue controlling web runtime behavior from desktop UI (web server enable/disable, LAN binding/access, hostname behavior including `reel.local`, and auth/token settings mapped to core/server or web-host runtime controls).
  - Require explicit phase gates before any legacy removal:
    - automated parity/build/test gate pass
    - focused manual parity verification pass executed by the user (not by the agent)
    - explicit user approval to proceed with removing legacy `source/WebRemote` paths
  - Process requirement: after automated gate completion, the agent must stop implementation work, provide a manual migrated-WebUI verification checklist/instructions to the user, and wait for user confirmation before continuing.
  - Remove legacy desktop `WebRemoteServer` mutation/event bridge paths only after parity verification and gate approval.
- **Acceptance criteria**:
  - Migration flag metadata is explicit (owner, defaults, tests, sunset/removal target).
  - `ReelRoulette.WebUI` preserves required legacy web-remote UX parity for main media interactions, custom media controls, and tag editor flows.
  - Desktop settings maintain equivalent user-facing controls for web runtime behavior (including `reel.local`/LAN discoverability and enable/disable/auth configuration paths) after migration.
  - Required web parity flows are verified before default cutover and before legacy removal.
  - Manual parity verification is user-executed; the agent provides instructions/checklist and waits for user confirmation before removal work resumes.
  - Legacy embedded web-remote mutation/event bridge paths are removed only after automated gate pass, user-executed manual parity gate pass, and explicit user approval is recorded.
  - Desktop/core behavior remains stable after legacy path retirement.
  - Time-bounded migration flags are removed or scheduled with explicit follow-up completion criteria.
- **Verification evidence**:
  - Legacy embedded WebRemote stack under `source/WebRemote/` is removed from runtime behavior and project resources.
  - Desktop Web UI controls now map to core-owned runtime settings through API (`/api/web-runtime/settings`) and worker-managed WebHost lifecycle.
  - Core/server owns preset/filter randomization semantics used by both desktop and WebUI (`/api/presets`, `/api/presets/match`, `/api/random` with filter-state-first semantics).
  - Independent WebHost serves host-aware `runtime-config.json`, enabling direct `localhost`, mDNS (`*.local`), and LAN-IP client access without legacy desktop bridge routes.
  - Dynamic CORS allowlist and worker mDNS advertisement are derived from current web runtime settings and active LAN interfaces.
  - Gate A automated checks passed during cutover slices (`dotnet build ReelRoulette.sln`, core test gate, web verify/build checks).
  - Gate B manual parity checklist was user-executed and approved; Gate C explicit user approval was recorded prior to legacy removal.
  - Remaining post-cutover runtime stabilization issues (settings reopen/apply lockout, LAN apply consistency edge cases, worker/WebHost shutdown orphan cleanup) are explicitly deferred to **Control-Plane UI + API for Runtime Operations**.

### M7c - Zero-Restart Web Deployment, Caching, and Rollback

- **Status**: ✅ Complete
- **Goal**: Enable independent web deployments without desktop/core restarts and with fast rollback.
- **Scope**:
  - Publish web artifacts as immutable versioned bundles.
  - Activate versions via atomic pointer/symlink/manifest switch.
  - Apply split caching policy:
    - `index.html` and runtime config: no-store (or short revalidate-first policy)
    - hashed JS/CSS/assets: long-lived immutable caching
  - Add atomic rollback path to prior known-good web artifact.
- **Acceptance criteria**:
  - New web versions can be activated without restarting desktop app or core server.
  - Clients pick up shell/config updates promptly while retaining cached hashed assets.
  - Rollback to previous artifact works via atomic switch only.
  - Deployment/rollback flow is documented and repeatable.
  - Automated smoke checks validate active version, cache policy behavior, and rollback.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` passes with the new `ReelRoulette.WebHost` project included.
  - `dotnet test ReelRoulette.sln` passes after this milestone's deployment-host/script changes.
  - `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI`.
  - `tools/scripts/verify-web-deploy.ps1` passes end-to-end:
    - publishes two immutable versions,
    - activates v1 then v2 without restarting web host process,
    - verifies split caching headers (`index.html`/`runtime-config.json` no-store, hashed assets immutable),
    - rolls back atomically to v1 via manifest pointer switch.
  - Activation/rollback are performed through atomic `active-manifest.json` pointer updates (`publish-web.*`, `activate-web-version.*`, `rollback-web-version.*`).

### M7b - Direct Web-to-Core Auth and SSE Reliability

- **Status**: ✅ Complete
- **Goal**: Move web auth/eventing to direct core/server integration with robust reconnect/resync behavior.
- **Scope**:
  - Implement pair-token bootstrap followed by secure HTTP-only session-cookie auth for web API/SSE usage.
  - Connect web directly to core/server SSE (`/api/events`) and refresh status APIs (`/api/refresh/status`) without desktop bridge/proxy.
  - Implement revision-aware SSE reconnect (`Last-Event-ID`), replay handling, and authoritative API requery fallback when replay gaps occur.
  - Define explicit CORS/cookie environment matrix for localhost, LAN/dev-cert, and production paths.
- **Acceptance criteria**:
  - Web auth sessions persist through expected reconnect/navigation flows using secure cookie semantics.
  - `refreshStatusChanged` and related events are projected directly from core/server to web status line during active runs, failures, and completions.
  - Replay-gap/resync-required scenarios recover by requerying authoritative API state with no persistent client divergence.
  - CORS/cookie policies validate in supported environments.
  - Automated reconnect/resync checks plus focused manual parity checks pass.
- **Verification evidence**:
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passes, including `sseClient` resync/requery regression coverage (`src/test/sseClient.test.ts`).
  - `dotnet test ReelRoulette.sln` passes with server auth/cookie/CORS policy coverage (`ServerAuthRegressionTests`, `ServerCookiePolicyTests`, `ServerRuntimeOptionsTests`).
  - `dotnet build ReelRoulette.sln` passes after stopping an active worker process that was locking `ReelRoulette.Server.dll`.
  - Manual CORS preflight check (allowed origin): `OPTIONS /api/version` with `Origin: http://localhost:5173` returns `204` plus `Access-Control-Allow-Origin: http://localhost:5173` and `Access-Control-Allow-Credentials: true`.
  - Manual CORS preflight check (blocked origin): `OPTIONS /api/version` with `Origin: http://example.com` returns `204` without `Access-Control-Allow-Origin`.
  - Manual pairing check: `POST /api/pair?token=...` returns `200` and `Set-Cookie` with `httponly` + `samesite=lax`, confirming credentialed session bootstrap behavior.

### M7a - Web Client Foundation and Independent Host Bootstrap

- **Status**: ✅ Complete
- **Goal**: Establish `ReelRoulette.WebUI` as an independently buildable/runnable web client without desktop-hosted runtime dependency.
- **Scope**:
  - Stand up `src/clients/web/ReelRoulette.WebUI` with Vite + TypeScript as the canonical web client project.
  - Add runtime config bootstrap for API/SSE endpoint resolution (no compile-time hardcoded base URLs).
  - Define independent dev-server and production-build workflows for web iteration.
- **Acceptance criteria**:
  - Web UI builds independently from desktop app build.
  - Web UI runs in dev mode with runtime-configured API/SSE endpoints.
  - Web iteration (build/reload) does not require restarting desktop app or core server.
  - Runtime config keys/shape are documented and validated in tests.
  - Automated checks for web build output and runtime-config schema pass.
- **Verification evidence**:
  - `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI` (typecheck + runtime-config tests + production build + build-output checks).
  - Web dev bootstrap starts successfully via `npm run dev` without desktop/core restart dependencies.

### M6b - Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)

- **Status**: ✅ Complete
- **Goal**: Deliver API-backed grid/thumbnails and refresh pipeline refactor as a separate milestone.
- **Linked milestone note**: `Grid View for Library Panel with Thumbnail Generation (Unified Refresh Pipeline)` is tracked directly in this document.
- **Scope**:
  - Implement API-backed **Grid View with Thumbnail Generation** pipeline:
    - list/grid toggle persistence
    - thumbnail generation for photos/videos
    - pipeline execution and scheduling owned by core runtime (not desktop-local orchestration)
    - unified refresh stage order:
      1. source refresh
      2. duration scan
      3. loudness scan
      4. thumbnail generation
    - loudness stage runs new/unscanned files only (drop scan-all mode for this flow)
    - manual refresh is triggered via `POST /api/refresh/start` and runs through the same core pipeline as auto-refresh
    - `GET /api/refresh/status` snapshot endpoint complements SSE progress events for active clients
    - core rejects overlapping runs with `409 already running`; auto and manual refresh do not run concurrently
    - triggering manual refresh resets the auto-refresh interval baseline
    - status/progress events are emitted for both auto/manual runs; desktop projects them during this milestone, while direct web/mobile projection is completed in later direct-web milestones when those clients are decoupled from desktop-hosted bridges
  - Move refresh scheduling/config ownership to core host config:
    - support appsettings + CLI override model
    - client settings updates are pushed to core via API and persisted in core settings
    - default auto refresh remains enabled, default interval becomes 15 minutes, idle-only gating settings are removed
  - Define thumbnail artifact policy before feature completion:
    - artifact location convention (for example, `%LOCALAPPDATA%/ReelRoulette/thumbnails/{itemId}.jpg`)
    - invalidation rules (file change/fingerprint change -> thumbnail stale/regenerate)
    - target size/quality and video thumbnail timestamp strategy
- **Acceptance criteria**:
  - Grid view and thumbnail generation work end-to-end through server/core.
  - No standalone legacy duration/loudness actions in UX (as planned).
  - Refresh progress/status remains observable while dialogs close and via `GET /api/refresh/status` + SSE for desktop in this milestone; direct web-to-core SSE status parity is tracked in later direct-web milestones.
  - Core runtime is the single execution owner for unified refresh pipeline and auto-refresh scheduling.
  - Manual refresh is API-triggered (`POST /api/refresh/start`) and returns `409` when a refresh run is already active.
  - Auto-refresh timer baseline is reset when a manual refresh is started.
  - Core config defaults are applied (auto enabled, 15-minute interval, no idle gating settings).
  - Thumbnail artifact/invalidation policy is implemented and documented.
  - Regression tests cover thumbnail invalidation decisions, unified refresh stage sequencing, refresh overlap rejection (`409`), and status/progress projection behavior; all pass in `dotnet test`.

### M6a - Feature Alignment Through API (Web Tag Editing)

- **Status**: ✅ Complete
- **Goal**: Ship API-backed web tag editing parity as an independent, low-blast-radius milestone.
- **Scope**:
  - Implement API-backed **Web Remote Tag Editing** parity:
    - tag/category edit flows
    - batch-ready `itemIds[]`
    - immediate SSE sync
  - Migrate desktop tag/category/item-tag mutation flows to the same core/server command path:
    - desktop tag editing remains orchestration/UI only
    - mutation authority for migrated tag flows is core/server
    - remove direct desktop JSON mutation for migrated tag/category/item-tag paths
- **Acceptance criteria**:
  - Web remote tag editing works end-to-end through server/core.
  - Desktop and web tag edits execute through the same API/core mutation services (single-writer for migrated tag flows).
  - Desktop does not directly mutate JSON for migrated tag/category/item-tag flows.
  - Desktop and web remain synchronized via SSE for tag/category/item-tag changes.
  - Category delete semantics reassign tags to canonical `uncategorized` (fixed ID) instead of deleting tags.
  - `Uncategorized` appears in category dropdowns and remains hidden from category lists when it has no tags.
  - Tag editing can ship independently of grid/thumbnail/pipeline refactors.
  - Regression tests validate tag/category mutation contracts plus SSE sync projections (including batch-ready `itemIds[]` request handling) and pass in `dotnet test`.

### M5 - Desktop as API Client (State Flows)

- **Status**: ✅ Complete
- **Goal**: Convert desktop from state owner to API client for core state.
- **Scope**:
  - Add `ApiClient` layer to Windows app.
  - Migrate desktop flows to API calls + SSE updates:
    - favorites/blacklist
    - playback stat record
    - random selection command/query
    - filter/preset mutations
  - Keep local media playback rendering in desktop client.
- **Acceptance criteria**:
  - Desktop writes state via API (not direct in-process data mutation) for migrated flows.
  - SSE updates keep desktop UI in sync with out-of-process changes.
  - Existing user workflows remain stable.
  - Regression tests for desktop API-client request shape/parsing and this milestone's server-state replay/filter-session behaviors are added to `dotnet test` and passing.

### M4 - Worker Runtime (Headless Host)

- **Status**: ✅ Complete
- **Goal**: Run core runtime independently of desktop UI.
- **Scope**:
  - Implement `ReelRoulette.Worker` to host server + scheduled/background jobs.
  - Worker runtime target for this milestone:
    - run as console host first (service packaging/hardening deferred)
  - Add worker lifecycle:
    - start
    - stop
    - health check
    - graceful shutdown
  - Add pairing/auth primitive used by web and future clients:
    - auth can be required
    - localhost trust can be optionally enabled for dev workflows
    - LAN access requires pairing token/cookie
  - Add desktop lifecycle UX for headless core:
    - desktop detects core not running
    - desktop can show friendly `Start Core` action (or equivalent auto-start behavior)
  - Add scripts:
    - `tools/scripts/run-core.ps1`
    - `tools/scripts/run-core.sh`
- **Acceptance criteria**:
  - Worker runs headless and serves API/SSE.
  - Worker can be launched as console host on Windows.
  - Desktop can connect to worker localhost API.
  - Auth/pairing primitive is functional (required auth supported; localhost trust optional; LAN pairing enforced when configured).
  - Desktop provides a clear UX path when core is not running.
  - Closing desktop UI does not stop worker background jobs (when configured).

### M3 - Server API Skeleton + Contract First

- **Status**: ✅ Complete
- **Goal**: Introduce API seam as primary integration boundary.
- **Scope**:
  - Define initial `shared/api/openapi.yaml`.
  - Implement `ReelRoulette.Server` host with:
    - health endpoint
    - initial query/command endpoints
    - SSE endpoint envelope with revision model
  - Map existing DTOs to OpenAPI contract.
- **Acceptance criteria**:
  - OpenAPI validates and documents live endpoints.
  - SSE event envelope stable (`revision`, `eventType`, timestamp, payload).
  - Client reconnect behavior is explicitly defined (minimum: reconnect detects missed revisions and re-fetches state; optional replay endpoint may be added later).
  - Desktop can call at least one state query via HTTP locally.

### M2 - Storage and State Service Layer

- **Status**: ✅ Complete
- **Goal**: Centralize data access and persistence logic behind core services.
- **Scope**:
  - Move library/settings read-write and consistency logic to `Core/Storage`.
  - Define state services for:
    - library index
    - settings
    - runtime randomization states
  - Keep JSON schema compatibility with existing files.
  - Establish hybrid verification structure for migration safety:
    - make `dotnet test` the default quality gate using a standard test project (xUnit/NUnit/MSTest)
    - cover fast unit checks for randomization logic, filter evaluation, tag operations, and DTO mapping rules
    - create reusable verification modules (for example, `CoreVerification.RunAll(...)`) shared by test and harness flows
    - add a console system-check harness for fixture-driven migration checks, fingerprint pipeline invariants, `RefreshSource` reconciliation checks, and performance sanity checks
- **Acceptance criteria**:
  - Desktop no longer directly mutates raw JSON files in migrated flows.
  - Existing `library.json` and `settings.json` are read/written without schema break.
  - Migration tests cover load/save round trips.
  - `dotnet test` runs the default fast verification suite and is treated as the primary gate.
  - Console harness runs the same reusable verification checks with optional verbose logging and scenario/performance options (no duplicated assertion logic).

### M1 - Core Domain Extraction (Pure Library)

- **Status**: ✅ Complete
- **Goal**: Move pure business logic from desktop code-behind into reusable core library.
- **Scope**:
  - Move non-UI logic into `ReelRoulette.Core`:
    - randomization engine/state
    - filter evaluation
    - tag/preset mutation operations
    - fingerprint comparison helpers
  - Introduce interfaces for storage and background operations.
  - Keep UI consuming adapters around moved logic.
- **Acceptance criteria**:
  - `ReelRoulette.Core` has no Avalonia references.
  - Desktop behavior remains functionally equivalent for migrated paths.
  - Unit tests added for extracted logic hotspots (randomization, tag updates, filter set building).

### M0 - Repo and Solution Foundation

- **Status**: ✅ Complete
- **Goal**: Introduce target project layout and baseline docs without changing runtime behavior.
- **Scope**:
  - Create/organize solution folders: `src/core`, `src/clients`, `shared`, `docs`, `tools`.
  - Add project stubs:
    - `ReelRoulette.Core`
    - `ReelRoulette.Server`
    - `ReelRoulette.Worker`
    - `ReelRoulette.WindowsApp` (can initially point to existing desktop project strategy)
    - `ReelRoulette.WebUI` (structure only)
  - Add baseline docs:
    - `docs/architecture.md`
    - `docs/api.md`
    - `docs/dev-setup.md`
- **Acceptance criteria**:
  - Solution builds successfully.
  - Existing app startup/playback unchanged.
  - Documentation includes current-state and target-state diagrams.
