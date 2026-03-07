# Development Setup

## Projects

- Existing desktop runtime: `source/ReelRoulette.csproj`
- Core library: `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- Server host: `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`
- Worker host: `src/core/ReelRoulette.Worker/ReelRoulette.Worker.csproj`
- Windows target location: `src/clients/windows/ReelRoulette.WindowsApp/ReelRoulette.WindowsApp.csproj`
- Web target location: `src/clients/web/ReelRoulette.WebUI/ReelRoulette.WebUI.csproj`
- Web deployment host: `src/clients/web/ReelRoulette.WebHost/ReelRoulette.WebHost.csproj`
- Core test gate: `src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj`
- Core system-check harness: `src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj`

## Migration Notes

- During M0/M1, desktop startup/playback continues from the existing `source` project.
- Core logic moves incrementally and is consumed through desktop adapter classes.
- New projects are scaffolded now so later milestones can migrate hosting and clients without repo churn.

## Verification Workflow (M2)

- Default fast gate: `dotnet test ReelRoulette.sln`
- Optional system checks with verbose output:
  - `dotnet run --project .\\src\\core\\ReelRoulette.Core.SystemChecks\\ReelRoulette.Core.SystemChecks.csproj -- --verbose`
- Shared verification logic lives in `src/core/ReelRoulette.Core/Verification/CoreVerification.cs` and is reused by both test and harness flows.

## M3 Reconnect/Resync Notes

- `GET /api/events` supports reconnect using `Last-Event-ID`.
- Server replays retained events newer than the supplied revision.
- If a reconnect misses more history than replay retention, server emits `resyncRequired`.
- Client recovers by calling `POST /api/library-states` to re-fetch authoritative state.

## M4 Worker Runtime + Auth Notes

- Console-first worker host:
  - `dotnet run --project .\\src\\core\\ReelRoulette.Worker\\ReelRoulette.Worker.csproj`
  - or `tools/scripts/run-core.ps1` / `tools/scripts/run-core.sh`.
- Worker and server runtime options are configured through `CoreServer` settings (`ListenUrl`, `RequireAuth`, `TrustLocalhost`, `BindOnLan`, `PairingToken`).
- Pairing/auth primitive:
  - pair via `GET /api/pair?token=...` or `POST /api/pair`
  - cookie/token authorizes subsequent calls when auth is required
  - localhost trust can be enabled for dev while keeping LAN pairing required.

## M5 Desktop API-Client Notes

- Desktop now runs an internal API-client layer for migrated state flows instead of directly mutating those paths first.
- SSE subscription is used to keep desktop projections synchronized with out-of-process updates.
- Preset catalog mutations are mirrored via `POST /api/presets`.
- Migrated state flows are API-required: desktop no longer applies local write fallback for those mutations when core runtime is unavailable.
- Desktop attempts to auto-start core runtime on launch if local probe fails.

## M6a Tag Editing Notes

- Desktop and web tag/category/item-tag mutations are routed through tag-editor API endpoints (`/api/tag-editor/*`).
- Batch item-tag deltas use `itemIds[]` plus `addTags[]` / `removeTags[]`.
- Desktop SSE projection now includes tag events (`itemTagsChanged`, `tagCatalogChanged`) to keep local UI state synchronized with out-of-process updates.
- Desktop additionally syncs local tag catalog to core on successful core connect/start (`POST /api/tag-editor/sync-catalog`) so the core/web model starts from complete category/tag data.
- Desktop hydrates requested item-tag snapshots to core with `POST /api/tag-editor/sync-item-tags` ahead of web tag-editor model queries.
- Category deletes in migrated tag flows reassign tags to canonical `uncategorized` (fixed ID) instead of deleting tags.
- Web remote tag editor is full-screen and pauses playback/photo autoplay while open, then resumes prior media behavior on close.
- Web editor supports touch-friendly controls, per-session category collapse state, inline category move/delete controls, and staged category/tag operations that are applied in one batch when `Apply` is pressed.
- Chip backgrounds remain current-state indicators (`all/some/none`), while pending add/remove intent is represented by orange `+/-` toggle button selection.
- Tag edit supports rename and reassignment to an existing category via dropdown.
- Desktop `ItemTagsDialog` uses a parity control layout with top controls (`➕ Category`, `🔄`, `❌`) and a single bottom action row (`category`, `tag name`, `➕ Tag`, `✅️`) replacing the old `Cancel`/`OK` footer.
- Desktop tag chip controls follow `➕`, `➖`, `✏️`, `🗑` order and reuse existing shared icon button/toggle styles.
- Desktop category headers expose inline `⬆️`, `⬇️`, `🗑` controls using the same shared square icon button style family.
- Desktop category delete/reorder is staged in-dialog (delete warning shown on click) and sent to core only on `Apply`; `Close` discards staged category changes.
- Desktop `ItemTagsDialog` is the single tag-management dialog (player button/context entry points). Opening with no selected items is supported; item tag `+/-` assignment controls are disabled in that mode while category/tag catalog editing remains available.
- Desktop and web category inline controls use `up`, `down`, `edit`, `delete` order, and category create/rename blocks duplicate names (trimmed, case-insensitive).
- Web footer controls keep a single-row layout on small screens with the tag name input as the flexible/fill field.

## M6b Unified Refresh + Grid/Thumbnail Notes

- Core refresh pipeline + ownership:
  - `POST /api/refresh/start` starts manual refresh.
  - `GET /api/refresh/status` returns snapshot state.
  - `GET/POST /api/refresh/settings` reads/writes core-owned refresh settings.
  - SSE emits `refreshStatusChanged` payloads during and after runs.
- Overlap behavior:
  - refresh overlap is rejected (`409 already running`), with one active refresh run at a time.
- Stage order:
  1. source refresh
  2. duration scan
  3. loudness scan (new/unscanned)
  4. thumbnail generation
- Desktop UX migration:
  - `Manage Sources` refresh now requests core refresh start (dialog can be closed while run continues).
  - standalone `Scan Durations`/`Scan Loudness` library menu actions are removed.
  - library panel supports persisted list/grid view toggle (`🖼️`) and a justified, responsive grid using variable-size aspect-ratio-preserving thumbnails.
- Thumbnail artifacts + metadata:
  - artifacts are stored at `%LOCALAPPDATA%\\ReelRoulette\\thumbnails\\{itemId}.jpg`.
  - index metadata tracks `revision`, `width`, `height`, and `generatedUtc` for layout projection and invalidation.
- Web refresh-status projection note:
  - desktop projects refresh status in M6b; direct web-to-core SSE status parity is completed in M7 when web UI is decoupled from desktop-hosted bridge paths.

## M7a Web Client Foundation Notes

- Canonical web client location:
  - `src/clients/web/ReelRoulette.WebUI`
- Toolchain:
  - Vite + TypeScript (`npm run dev`, `npm run build`, `npm run test`)
- Runtime endpoint bootstrap (no compile-time base URL constants):
  - load `window.__REEL_ROULETTE_RUNTIME_CONFIG` when present
  - otherwise fetch `/runtime-config.json` with `no-store`
  - required keys: `apiBaseUrl`, `sseUrl`
  - optional key: `pairToken` for direct web auth bootstrap convenience
- Validation:
  - runtime-config schema is validated by web unit tests (`src/test/runtimeConfig.test.ts`)
  - build-output verification checks `dist` artifacts and runtime-config presence (`scripts/verify-build-output.mjs`)
- One-command web verification helpers:
  - `tools/scripts/verify-web.ps1`
  - `tools/scripts/verify-web.sh`

## M7b Direct Web Auth + SSE Reliability Notes

- Worker/server direct web auth flow:
  - Pair with `GET/POST /api/pair` token bootstrap.
  - Server issues HTTP-only session cookie; credentialed web requests/SSE use that cookie.
- Runtime policy controls (`CoreServer`):
  - `EnableCors`, `CorsAllowedOrigins`, `CorsAllowCredentials`
  - `PairingSessionDurationHours`, `PairingCookieSameSite`, `PairingCookieSecureMode`
  - `AllowLegacyTokenAuth` (temporary compatibility fallback)
- Web reconnect/resync behavior:
  - direct `EventSource` to `/api/events` with credentials
  - reconnect tracks revision and passes `lastEventId` query fallback
  - `resyncRequired` triggers authoritative requery (`POST /api/library-states`) and refresh snapshot sync (`GET /api/refresh/status`)
- Verification notes:
  - automated: `dotnet test ReelRoulette.sln` and `npm run verify` (web includes `src/test/sseClient.test.ts` resync regression coverage)
  - manual CORS/pairing sanity checks:
    - `OPTIONS /api/version` from allowed origin (`http://localhost:5173`) should return `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials`
    - `OPTIONS /api/version` from blocked origin should omit CORS allow-origin header
    - `POST /api/pair?token=...` should issue `Set-Cookie` with HTTP-only session semantics

## M7c Zero-Restart Web Deployment Notes

- Independent web host:
  - run with `dotnet run --project .\\src\\clients\\web\\ReelRoulette.WebHost\\ReelRoulette.WebHost.csproj`
  - default listen URL: `http://localhost:51302`
- Versioned artifact layout:
  - deployment root: `.web-deploy` (configurable)
  - immutable builds: `.web-deploy/versions/{versionId}`
  - active pointer: `.web-deploy/active-manifest.json`
- Deployment commands:
  - `tools/scripts/publish-web.ps1` / `tools/scripts/publish-web.sh`
  - `tools/scripts/activate-web-version.ps1` / `tools/scripts/activate-web-version.sh`
  - `tools/scripts/rollback-web-version.ps1` / `tools/scripts/rollback-web-version.sh`
- Cache policy:
  - `index.html` and `runtime-config.json`: `Cache-Control: no-store`
  - fingerprinted `assets/*`: `Cache-Control: public, max-age=31536000, immutable`
- Smoke verification:
  - `tools/scripts/verify-web-deploy.ps1`
  - `tools/scripts/verify-web-deploy.sh`

## M7d Controlled Cutover Notes

- Legacy embedded `source/WebRemote` runtime is retired; use independent WebUI + WebHost paths.
- Worker now supervises WebHost lifecycle and mDNS advertisement from core-owned web runtime settings:
  - `WebUiHostSupervisorService`
  - `WebUiMdnsService`
- Core web runtime settings API:
  - `GET /api/web-runtime/settings`
  - `POST /api/web-runtime/settings`
- Source and preset flows used by desktop/web are API-first:
  - `GET /api/sources`
  - `POST /api/sources/{sourceId}/enabled`
  - `GET /api/presets`
  - `POST /api/presets`
  - `POST /api/presets/match`
  - `POST /api/random`
- Local bootstrap helper for publish+activate+worker:
  - `tools/scripts/publish-activate-run-worker.ps1`

## M7e Contract Compatibility Notes

- WebUI contract generation:
  - `npm run generate:contracts` generates `src/types/openapi.generated.ts` from `shared/api/openapi.yaml`.
  - `npm run verify:contracts` verifies generated contract freshness and fails when output is stale.
- `npm run verify` now runs contract freshness checks before typecheck/tests/build.
- Version compatibility/capability checks:
  - `GET /api/version` includes `minimumCompatibleApiVersion`, `supportedApiVersions[]`, and `capabilities[]`.
  - WebUI startup/auth bootstrap validates N/N-1 API compatibility and required capability presence before enabling normal flows.
