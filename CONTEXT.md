# ReelRoulette Repository Context

This document is the high-level capability and ownership map for contributors and agents.
Keep it concise and current. Do not use it as a milestone changelog.

## Purpose and Architecture Direction

ReelRoulette is migrating from a monolithic desktop app to a thin-client, API-first system:

- Core/server owns domain logic and authoritative state.
- Desktop/WebUI are orchestration/render clients over API + SSE.
- Shared contracts (`shared/api/openapi.yaml`) drive cross-client behavior parity.

## Current Implemented Capabilities

- **Server host (`src/core/ReelRoulette.ServerApp`)**
  - Default single-process runtime serving API, SSE, media, WebUI assets, and Operator UI.
  - Control-plane surfaces under `/control/*` for runtime status/settings/pairing/lifecycle/testing/logs.
  - Operator testing mode supports deterministic fault simulation (version/capability mismatch, API unavailable, media missing, SSE disconnect).
  - mDNS LAN hostname advertisement for WebUI when enabled.
  - Host-UI abstraction keeps server runtime tray-agnostic:
    - Uses a cross-platform Avalonia tray host when available (lifecycle/refresh/operator shortcuts).
    - Falls back to a deterministic headless host when a tray cannot be created.
  - Startup-launch registration is host-managed with immediate toggle support through tray and Operator control settings:
    - Windows: user-scoped `HKCU` registration.
    - Linux: XDG autostart (`*.desktop` under `~/.config/autostart/` or `$XDG_CONFIG_HOME/autostart/`, with `Exec=`/`Path=` derived from the stable app path—**`APPIMAGE`** when running an AppImage, otherwise the process path—and host content root pinned to `AppContext.BaseDirectory` so session autostart finds config and WebUI assets).

- **Domain execution (`src/core/ReelRoulette.Core` + server services)**
  - API-authoritative library operations (import, duplicates, auto-tag, playback stats, refresh pipeline).
  - Unified refresh pipeline: stage/status projection, thumbnail generation, library **duration** / **loudness** via **ffmpeg**/**ffprobe**, and server-scheduled **auto-refresh**; clients send refresh **settings** (for example enable/interval) and consume library state via API/SSE only (no authoritative client-side refresh stages or local ffprobe for catalog duration).
  - Replay-aware SSE envelope with reconnect recovery (`Last-Event-ID`, `resyncRequired`, authoritative requery).

- **Desktop client (`src/clients/desktop/ReelRoulette.DesktopApp/`)**
  - Thin-client for migrated flows: API command/query + SSE projection (no dual-writer core-state mutation). Shows library projection from the server (including durations) and syncs refresh-related **settings** to the core; **LibVLC**-backed local playback via `LibVLCSharp.Avalonia` `VideoView` / `MediaPlayer` (`--intf dummy`, re-attach when the native host is ready under Avalonia 12) and `NativeBinaryHelper` / bundled `runtimes/.../native/libvlc` on Windows when present.
  - Local-first playback with deterministic API fallback (`ForceApiPlayback` option).
  - Server version/capability compatibility gating with reconnect/resync guidance.
  - API-backed source import, duplicate scan/apply, auto-tag scan/apply, and playback-stats clear.
  - Duplicate review dialog renders per-item thumbnail previews via server thumbnail endpoint paths for faster keep/delete validation.
  - Duplicate review dialog supports per-group handling selection with a persisted default behavior (`Keep All` or `Select Best`) from desktop settings.
  - `Library → Export Library…` / `Import Library…` use `ReelRoulette.LibraryArchive` to read and write migration zips against the same on-disk bundle the server consumes (`library.json`, `core-settings.json`, `presets.json`, `desktop-settings.json`, optional `thumbnails/` and `backups/` under roaming + local app data): zip layout with `export-manifest.json`, per-source remap/skip, atomic JSON writes; no server HTTP endpoint for this path. Export warns if the core may still be running; import requires an explicit server-stopped acknowledgment and **Import to disk**; overwrite confirmation when a non-empty library already exists; writes imported `desktop-settings.json` locally; resync projection/sources/presets when the core is reachable afterward. Server-side `relativePath` uses `Path.GetRelativePath` (`LibraryRelativePath` in Core); import remap repairs legacy `..`-prefixed `relativePath` using `fullPath` and old source root with cross-platform segment normalization (Windows drive + backslash exports on Linux, POSIX paths on Windows). Storage pickers (import remap **Browse…**, library zip, export save, **Import Folder**) resolve filesystem paths via `TryGetLocalPath` when `Path.LocalPath` is empty (portal-backed dialogs on Linux).
  - Duplicate review comparison metadata now includes per-item tag counts and enriched keep-selection labels (filename + plays/tags/favorite/blacklisted) for faster keep decisions.
  - Tag editor and filter `Tags` tab share theme-compatible category/chip surfaces in light/dark mode while preserving filter control behavior boundaries.

- **WebUI client (`src/clients/web/ReelRoulette.WebUI`)**
  - Runtime-config bootstrap, direct API/SSE integration, and startup compatibility/capability checks.
  - Session-aware identity propagation (`clientId`/`sessionId`) through API + SSE paths.
  - Core playback/control/tag workflows aligned with server-authoritative behavior.
  - Refresh status line uses the same stage parsing and consolidated completion summary as the desktop client (including Fingerprint segment); system light/dark follows `prefers-color-scheme` with themed shell and tag-editor surfaces.
  - Player overlay: edit-tags top-right (left of favorite), mute in the bottom transport row for video (`HTMLVideoElement.muted`, Material `volume_up`/`volume_off`); corner/transport controls use drop-shadow chrome only (media area not dimmed); **Fullscreen** uses a DOM **stage** that includes the media region and the tag/filter overlays (so dialogs work in fullscreen on desktop); **iOS WebKit** uses in-page pseudo-fullscreen to avoid native video controls replacing the custom UI.
  - Tag editor: category reorder enables Save without other pending mutations; tag chips keep white glyphs/text and shadow treatment in both themes.
  - Tag overlay tabs (**Edit Tags** / **Auto Tag**): filter-style tabstrip with shared header (Refresh, Close) and footer (add category/tag, **Save**). **Auto Tag** uses `GET /api/library/projection` for scan scope when **Scan full library** is off (enabled sources only), `POST /api/autotag/scan` and `POST /api/autotag/apply` only (no client-side matching); unified **Save** applies catalog/manual item tags then autotag assignments; **Close** / **Refresh** prompt to discard when manual and/or autotag changes are pending; scan-full default in `localStorage` (`rr_autoTagScanFullLibrary`).
  - Filter Media overlay (full-screen, same shell pattern as the tag editor): General (basic flags, media type, client source inclusion, audio filter, duration text like desktop), Tags (global AND/OR across categories, per-category local AND/OR, include/exclude tri-state chips from `POST /api/tag-editor/model`), and Presets (catalog edit/save via `POST /api/presets`, quick **None** header preset with Material Symbols manage controls). Random playback sends authoritative `filterState` on every `POST /api/random` and includes `presetId` when a named preset is selected; presets refetch on dialog open, after successful preset catalog save, and when SSE signals `resyncRequired`; dialog content now uses full-width responsive layout (no large-screen panel max-width cap).
  - WebUI includes installable PWA metadata (`manifest.webmanifest`, iOS home-screen meta tags, icons under `public/icons/`) plus a minimal root `sw.js` registered in secure contexts (network-only `fetch`) so Chromium-based browsers (notably **Android Chrome**) meet installability and can open **Install app** in `standalone` per the manifest; iOS Safari relies primarily on `apple-mobile-web-app-*` meta. `sync-shared-icon.mjs` (runs before dev/build) uses **`sharp`** to emit **192×192**, **512×512**, and **180×180** PNGs from shared `HI-256.png` / `HI-512.png` so manifest-declared sizes match files.

- **Operational surfaces**
  - Manual validation guide/checklist at `docs/checklists/testing-checklist.md`.
  - Windows and Linux packaging scripts and CI workflows: `ci.yml` (build/test + WebUI verify), `package-windows.yml` and `package-linux.yml` (tag + `workflow_dispatch`, upload artifacts; tag builds attach packages to the existing GitHub release). Linux packaging CI runs `verify-linux-packaged-server-smoke.sh` after producing portable + AppImage outputs.
  - Linux portable packaging: `tools/scripts/package-serverapp-linux-portable.sh` and `package-desktop-linux-portable.sh` produce self-contained `linux-x64` tarballs under `artifacts/packages/portable/` (`run-server.sh` / `run-desktop.sh`, bundled `README.txt` for native prereqs).
  - Linux AppImage packaging: `tools/scripts/package-serverapp-linux-appimage.sh` and `package-desktop-linux-appimage.sh` (shared `tools/scripts/lib/appimage-helpers.sh`) produce `artifacts/packages/appimage/*.AppImage` from those portable tarballs; `AppRun` supports `--help` (prereqs) and `--install` (user-local menu entry and icons). GitHub latest-release installer: `tools/scripts/install-linux-from-github.sh` (AppImage preferred, portable tarball fallback; `curl` + `jq`; AppImages install to `~/.local/share/ReelRoulette` with stable names; `REELROULETTE_LOCAL_APPIMAGE_DIR` override; default repo overridable for forks). Local build: `tools/scripts/install-linux-local.sh` copies those AppImages to the same location and re-runs `--install`.
  - Windows installers expose desktop shortcut install tasks (checked by default for server and desktop installers).
  - Windows dev and packaging: **`tools/scripts/fetch-native-deps.ps1`** fills gitignored **`runtimes/win-x64/native/`** (FFmpeg/ffprobe + LibVLC); packaging copies **ffmpeg/ffprobe** into the **server** publish tree and **LibVLC** into the **desktop** publish tree (`docs/dev-setup.md`).

## Repository Map (High Signal)

- `src/core/`:
  - `ReelRoulette.Core`: domain + storage/state logic.
  - `ReelRoulette.Server`: thin transport/composition layer.
  - `ReelRoulette.ServerApp`: default host/runtime + operator surfaces.
  - `ReelRoulette.Core.Tests` and `ReelRoulette.Core.SystemChecks`.
- `src/clients/`:
  - `web/ReelRoulette.WebUI`: active web client.
  - `desktop/ReelRoulette.DesktopApp`: shipping Desktop client location (Avalonia).
  - `desktop/ReelRoulette.LibraryArchive`: desktop-local library zip export/import helpers (referenced by the Desktop app and its tests).
- `shared/api/openapi.yaml`: API contract source of truth.
- `tools/scripts/`: runtime/verify/package scripts (`run-server*`, `verify-web*`, `verify-web-deploy*`, `verify-linux-packaged-server-smoke.sh`, `publish-web*`, Windows `package-*-win-*.ps1`, Linux portable `package-*-linux-portable.sh`).
  - includes `set-release-version.ps1` for release-aligned version fan-out (by default updates desktop `<Version>`, regenerates WebUI contracts, runs build/test/WebUI/deploy-smoke verify, and syncs README/dev-setup examples; skip pieces with `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, `-NoRunVerify`, `-NoDocUpdates`); `full-release.ps1` forwards those switches when `-Version` is set and skips `set-release-version` when `-Version` is omitted (packaging then uses each `.csproj` `<Version>`); `reset-checklist.ps1` for testing-guide reset workflows; Linux AppImage scripts, `install-linux-from-github.sh`, and packaged-server smoke helper live alongside portable `package-*-linux-portable.sh`.

## Working Commands (Canonical Set)

For full setup/run details use `README.md` and `docs/dev-setup.md`. Core commands:

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`
- `dotnet run --framework net10.0-windows --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` (Windows runtime; tray when available, otherwise headless)
- `dotnet run --framework net10.0 --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` (non-Windows runtime; tray when available, otherwise headless)
- `dotnet run --project ./src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj`
- `pwsh ./tools/scripts/run-server.ps1` / `pwsh ./tools/scripts/run-server-rebuild.ps1`
- `npm run verify` (in `src/clients/web/ReelRoulette.WebUI`)

## Guardrails for Contributors and Agents

- Keep `ReelRoulette.Server` thin (transport/auth/SSE/media composition only).
- Do not reintroduce dual-writer behavior once a flow is migrated to core/server.
- Keep client behavior aligned through OpenAPI + SSE semantics.
- Treat this file as current-state capability context; keep milestone planning details in `MILESTONES.md`.

## Related Docs and Ownership

- `MILESTONES.md`: roadmap, scope, acceptance criteria, verification evidence.
- `README.md`: practical onboarding/run/test commands.
- `docs/api.md`: endpoint/event/contract baseline.
- `docs/dev-setup.md`: development setup and workflow details.
- `docs/architecture.md`: architecture evolution and rationale.
- `docs/domain-inventory.md`: canonical implementation surface and ownership inventory.

## Maintenance Expectations

Update this file when any of these change:

- implemented runtime/client capabilities,
- architecture ownership boundaries,
- repository structure or canonical workflow commands,
- API/eventing direction that affects contributor behavior.

Prefer short factual updates over historical narration.
