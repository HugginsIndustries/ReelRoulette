# ReelRoulette

random video player that mostly works

## Building and Running

You need the .NET SDK installed (version compatible with the `TargetFramework` in this repo's `.csproj` files).

From the repository root:

```bash
dotnet build ReelRoulette.sln
```

Run the desktop app:

```bash
dotnet run --project .\source\ReelRoulette.csproj
```

Run the consolidated M8a server app (single-process runtime):

```bash
dotnet run --project .\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj
```

Run web client (M7a foundation):

```bash
cd .\src\clients\web\ReelRoulette.WebUI
npm install
npm run dev
```

Or run the server app via helper scripts:

```bash
.\tools\scripts\run-core.ps1
./tools/scripts/run-core.sh
```

All-in-one: build WebUI and run server app.

```powershell
.\tools\scripts\publish-activate-run-worker.ps1
```

Runtime notes:

- `ReelRoulette.ServerApp` is the default runtime host and serves:
  - API endpoints (`/api/*`)
  - SSE endpoint (`/api/events`)
  - media streaming (`/api/media/{idOrToken}`)
  - WebUI static assets
  - operator UI (`/operator`)
- Pairing/auth primitive is available through `/api/pair` with optional localhost trust and token/cookie enforcement for paired clients.
- SSE reconnect supports `Last-Event-ID` replay and `POST /api/library-states` authoritative resync when history gaps are detected.
- Desktop migrated M5 state flows call the server API first (favorite/blacklist/playback/random command), then project updates from SSE.
- Preset catalog sync is API-first through `GET/POST /api/presets`.
- Migrated M5 state writes are API-required (no local mutation fallback for those flows when core runtime is unavailable).
- M6a tag/category/item-tag edits are API-first through `/api/tag-editor/*` (desktop dialogs + web tag editor share the same mutation seam).
- SSE now carries tag synchronization events (`itemTagsChanged`, `tagCatalogChanged`) used by desktop projection paths.
- Desktop now performs a defensive tag-catalog sync (`POST /api/tag-editor/sync-catalog`) when core connectivity is established so server/web tag-editor model starts from the full library catalog.
- Desktop hydrates requested item-tag snapshots (`POST /api/tag-editor/sync-item-tags`) before web tag-editor model reads so existing-item tag states render correctly.
- Category delete operations now reassign tags to canonical `uncategorized` (fixed ID); `Uncategorized` remains selectable in tag-category dropdowns across clients.
- Web tag editor keeps the combined ItemTags/ManageTags layout, now with touch-friendly controls, collapsible categories, desktop-style button interaction feedback, and batched apply semantics for staged tag/category changes.
- Chip background colors show current item tag state (`all/some/none`), while pending add/remove intent is shown by orange `+/-` button toggle state before `Apply`.
- Tag edit supports rename plus reassignment to an existing category via dropdown.
- Desktop `ItemTagsDialog` now mirrors the combined editor control layout with top controls (`➕ Category`, `🔄`, `❌`) and a single bottom action row (`category`, `tag name`, `➕ Tag`, `✅️`).
- Desktop tag chip control order is now `➕`, `➖`, `✏️`, `🗑` using existing shared button styles for consistent interaction feedback.
- Desktop category headers include inline controls (`⬆️`, `⬇️`, `🗑`) using shared square icon button styles.
- Desktop `ItemTagsDialog` category delete/reorder actions now stage locally (with delete warning on click) and commit through API only on `Apply`; closing the dialog discards staged category mutations.
- Desktop `ItemTagsDialog` now serves as the single desktop tag-management entry point (including library-level open with no selected items); `+/-` per-tag item assignment controls are disabled when no items are selected.
- Desktop and web category inline controls now follow `up`, `down`, `edit`, `delete`, and both enforce duplicate category-name prevention.
- Web bottom controls keep one row on small screens; the tag name input flex-fills remaining width.
- M6b adds core-owned refresh endpoints (`POST /api/refresh/start`, `GET /api/refresh/status`, `GET/POST /api/refresh/settings`) and SSE `refreshStatusChanged` projection events.
- In M6b, desktop projects refresh status directly from core SSE/events; direct web-to-core refresh-status parity remains tracked in M7 decoupling scope.
- Desktop `Manage Sources` refresh now starts core refresh runs (dialog may close while refresh continues), and standalone `Scan Durations`/`Scan Loudness` library menu actions are removed.
- Auto-refresh ownership is now core-side (default enabled, 15-minute interval, idle-only desktop settings removed from active behavior).
- Library panel now supports persisted list/grid mode with `🖼️` toggle (left of `Select filters...`) and a justified responsive grid layout using aspect-ratio-preserving variable-size thumbnails.
- Core thumbnail artifacts are generated into `%LOCALAPPDATA%\\ReelRoulette\\thumbnails\\{itemId}.jpg`, with metadata/index tracking (`revision`, `width`, `height`, `generatedUtc`) and cache eviction.
- M7a introduces independent web-client bootstrap under `src/clients/web/ReelRoulette.WebUI` using Vite + TypeScript.
- Web API/SSE endpoints are runtime-configured from `window.__REEL_ROULETTE_RUNTIME_CONFIG` or `/runtime-config.json` (no compile-time base URL constants).
- Web build/typecheck/test/build-output verification is available via `npm run verify` (or `.\tools\scripts\verify-web.ps1` / `./tools/scripts/verify-web.sh`).
- M7b adds direct web-to-core auth/event reliability:
  - pair-token bootstrap to HTTP-only session-cookie auth (`/api/pair`)
  - explicit CORS/cookie runtime policy controls in `CoreServer` options
  - direct credentialed SSE status projection (`/api/events`) with reconnect/resync fallback (`/api/library-states` + `/api/refresh/status`)
- M7d completes controlled cutover and legacy bridge retirement:
  - legacy embedded `source/WebRemote` runtime/resources are retired from active runtime behavior
  - desktop/web preset + random selection behavior is API-authoritative (server-owned preset catalog and random eligibility semantics)
- M7e adds contract compatibility and final M7 sign-off guardrails:
  - WebUI TS contracts are generated from `shared/api/openapi.yaml` (`npm run generate:contracts`)
  - `npm run verify` now validates generated contract freshness (`npm run verify:contracts`) before typecheck/tests/build
  - `/api/version` exposes compatibility/capability metadata and WebUI blocks unsupported server contracts/capability sets
- M8a consolidates runtime hosting:
  - single `ReelRoulette.ServerApp` process and single browser origin for WebUI/API/SSE/media
  - explicit `/api/capabilities` endpoint for runtime diagnostics/client checks
  - no separate `ReelRoulette.WebHost` process required in normal runtime path
- M8b adds first-class control-plane operations in the same host:
  - `/control/*` API surface for status/settings/pair/lifecycle (`/control/status`, `/control/settings`, `/control/pair`, `/control/restart`, `/control/stop`)
  - localhost-available control access by default, with LAN control exposure gated by runtime LAN bind plus optional admin token auth
  - operator UI upgraded to responsive dark theme with incoming/outgoing API telemetry and connected-client visibility
  - ServerApp now performs mDNS advertisement for LAN-enabled WebUI (`http://{lanHostname}.local:{port}/`) when WebUI is enabled and LAN bind is on
- M8c desktop thin-client cutover updates:
  - desktop no longer auto-starts core runtime and defaults core endpoint to `http://localhost:51234`
  - source import, duplicate scan/apply, and auto-tag scan/apply are routed through new core APIs
  - playback stats clear now routes through `POST /api/playback/clear-stats` (desktop no longer clears stats through local-only mutation path)
  - desktop local `last.log` writes are removed; client log events are centralized through `POST /api/logs/client` while server-side logic writes directly to ServerApp `last.log`
- M8d desktop playback policy compromise updates:
  - desktop playback is local-first with deterministic API media fallback when local access fails
  - manual library-panel play now resolves stable API media identity first; unmappable manual targets fail with explicit guidance instead of silent substitute playback
  - new `ForceApiPlayback` desktop setting persists in `desktop-settings.json` (default `false`) and forces API playback path for validation/preference scenarios
  - playback source selection remains deterministic across random/manual/timeline navigation flows while preserving M8c API-first ownership boundaries for non-playback domains
- M8e web/mobile thin-client contract standardization updates:
  - desktop and web now share the same identity/reconnect contract semantics: stable `clientId`, optional runtime `sessionId`, and SSE reconnect replay hints via `lastEventId`
  - desktop persists `CoreClientId` in `desktop-settings.json`, generates per-runtime `CoreSessionId`, and propagates both through random/playback/SSE calls
  - WebUI (legacy and modular SSE/requery paths) now propagates `clientId` + `sessionId` consistently and validates required server capabilities including `identity.sessionId`

## Testing

Default test gate:

```bash
dotnet test ReelRoulette.sln
```

Core verification system checks (verbose mode):

```bash
dotnet run --project .\src\core\ReelRoulette.Core.SystemChecks\ReelRoulette.Core.SystemChecks.csproj -- --verbose
```

M7a web verification gate:

```bash
.\tools\scripts\verify-web.ps1
# or
./tools/scripts/verify-web.sh
```

M7e contract generation/check commands:

```bash
cd .\src\clients\web\ReelRoulette.WebUI
npm run generate:contracts
npm run verify:contracts
```

Direct auth/SSE smoke checks:

```bash
# Start server app (auth enabled by default in server app appsettings)
dotnet run --project .\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj

# In another terminal, start web UI
cd .\src\clients\web\ReelRoulette.WebUI
npm run dev
```

M8a single-origin smoke checks:

```bash
# Build WebUI + run consolidated server app smoke verification
.\tools\scripts\verify-web-deploy.ps1
# or
./tools/scripts/verify-web-deploy.sh
```

## Third-Party Components

This program bundles VLC (VideoLAN) and FFprobe from FFmpeg. They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.
