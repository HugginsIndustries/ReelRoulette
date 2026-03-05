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

Optional: run additional hosts/scaffolds:

```bash
dotnet run --project .\src\core\ReelRoulette.Server\ReelRoulette.Server.csproj
dotnet run --project .\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj
```

Run web client (M7a foundation):

```bash
cd .\src\clients\web\ReelRoulette.WebUI
npm install
npm run dev
```

Or run worker via helper scripts:

```bash
.\tools\scripts\run-core.ps1
./tools/scripts/run-core.sh
```

M4/M5/M6a runtime notes:

- `ReelRoulette.Worker` hosts the API/SSE runtime using shared server endpoint composition.
- Pairing/auth primitive is available through `/api/pair` with optional localhost trust and token/cookie enforcement for paired clients.
- SSE reconnect supports `Last-Event-ID` replay and `POST /api/library-states` authoritative resync when history gaps are detected.
- Desktop migrated M5 state flows now call the worker/server API first (favorite/blacklist/playback/random command), then project updates from SSE.
- Filter/preset session projection sync is available through `GET/POST /api/filter-session`.
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
- M7c adds zero-restart web deployment and rollback:
  - independent static host at `src/clients/web/ReelRoulette.WebHost`
  - immutable versioned artifacts under `.web-deploy/versions/{versionId}`
  - atomic `active-manifest.json` activation/rollback pointer flow
  - split cache policy (`index.html`/`runtime-config.json` no-store; hashed assets immutable)

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

M7b direct auth/SSE smoke checks:

```bash
# Start worker (auth enabled by default in worker appsettings)
dotnet run --project .\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj

# In another terminal, start web UI
cd .\src\clients\web\ReelRoulette.WebUI
npm run dev
```

M7c zero-restart web deploy smoke checks:

```bash
# Publish and activate versioned web artifacts
.\tools\scripts\publish-web.ps1
.\tools\scripts\activate-web-version.ps1 -VersionId <versionId>

# Run independent web host against deployment root
dotnet run --project .\src\clients\web\ReelRoulette.WebHost\ReelRoulette.WebHost.csproj -- --WebDeployment:DeployRootPath=.\.web-deploy

# Full activation/cache/rollback smoke gate
.\tools\scripts\verify-web-deploy.ps1
# or
./tools/scripts/verify-web-deploy.sh
```

Worker runtime independence check (desktop close should not stop worker):

```bash
# 1) Start desktop (it auto-starts core runtime if needed)
# 2) Verify worker health while desktop is open
Invoke-WebRequest -UseBasicParsing http://localhost:51301/health | Select-Object -ExpandProperty Content

# 3) Close desktop, then verify worker still responds
Invoke-WebRequest -UseBasicParsing http://localhost:51301/health | Select-Object -ExpandProperty Content

# 4) Optional stronger check
Invoke-WebRequest -UseBasicParsing http://localhost:51301/api/version | Select-Object -ExpandProperty Content
```

Expected results:

- `/health` returns `{"status":"ok"}` before and after desktop closes.
- `/api/version` remains reachable after desktop closes (worker keeps running independently).

## Third-Party Components

This program bundles VLC (VideoLAN) and FFprobe from FFmpeg. They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.
