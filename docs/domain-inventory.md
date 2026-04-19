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
  - filtering/randomization helpers, storage abstractions, verification modules.
- `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs`
  - source import, duplicate scan/apply, auto-tag scan/apply, playback-stats clear, related command orchestration.
- `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`
  - unified refresh pipeline stage execution (including `fingerprintScan` for per-file SHA-256 backfill), overlap guards, status snapshots, thumbnail generation/invalidation, duration/loudness scans, and server-scheduled **auto-refresh** (clients surface settings only).
- `src/core/ReelRoulette.Server/Services/ServerStateService.cs`
  - revisioned event publication, replay/resync behavior, state projection support.
- `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs`
  - core-owned runtime settings persistence/flow where applicable.

Boundary:

- Domain/state mutation authority is core/server, not desktop/web clients.

---

## Server Transport and API Composition

`ReelRoulette.Server` remains a thin transport/composition layer.

- `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`
  - endpoint wiring for API/SSE/media/control/testing/log surfaces.
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
- `src/core/ReelRoulette.ServerApp/Hosting/IHostUi.cs`
  - host-UI abstraction boundary keeping server runtime tray-agnostic.
- `src/core/ReelRoulette.ServerApp/Hosting/AvaloniaTrayHostUi.cs`
  - Cross-platform tray runtime controls (Open Operator UI, Launch Server on Startup, Refresh Library, Restart Server, Stop Server / Exit) using shared `assets/HI.ico`, with deterministic headless fallback when tray is unavailable.
- `src/core/ReelRoulette.ServerApp/Hosting/HeadlessHostUi.cs`
  - non-Windows headless host path for runtime compatibility.
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

- control-plane surfaces (`/control/status`, `/control/settings`, `/control/pair`, `/control/restart`, `/control/stop`, testing/log endpoints),
- startup-launch control surface (`/control/startup`),
- operator diagnostics and manual testing controls.

---

## Desktop Client Orchestration (`src/clients/desktop/ReelRoulette.DesktopApp/`)

Desktop is orchestration/render for migrated flows.

- `src/clients/desktop/ReelRoulette.LibraryArchive/`
  - shared `net10.0` library: library zip export/import (manifest, source-root remap/skip, zip validation, atomic writes, optional thumbnails/backups) against roaming + local cache paths.
- `src/clients/desktop/ReelRoulette.DesktopApp.Tests/`
  - xUnit tests for `ReelRoulette.LibraryArchive` migration helpers and export→import round-trip.
- `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs`
  - API/SSE lifecycle orchestration, reconnect/resync guidance, compatibility gating, playback orchestration.
- `src/clients/desktop/ReelRoulette.DesktopApp/CoreServerApiClient.cs`
  - typed desktop API adapter (commands/queries/SSE wiring).
- `src/clients/desktop/ReelRoulette.DesktopApp/ManageSourcesDialog.axaml.cs`
  - API-backed source/duplicate orchestration behavior.
- `src/clients/desktop/ReelRoulette.DesktopApp/LibraryExportOptionsDialog.*`, `LibraryImportRemapDialog.*`, `LibraryOverwriteConfirmDialog.*`
  - desktop UI for local-disk library zip export/import (options, per-source remap/skip, overwrite confirm, server-stopped acknowledgment on import); writes imported `desktop-settings.json` locally after successful import.
- `src/clients/desktop/ReelRoulette.DesktopApp/AutoTagDialog.axaml.cs`
  - API-backed auto-tag scan/apply orchestration.
- `src/clients/desktop/ReelRoulette.DesktopApp/SettingsDialog.axaml(.cs)`
  - client-side settings orchestration including playback policy toggle UX.
- `src/clients/desktop/ReelRoulette.DesktopApp/ClientLogRelay.cs`
  - client log relay to server-side log ingestion API.

Boundary:

- No authoritative local mutation fallback for migrated server-owned domains.

---

## WebUI Client Orchestration (`src/clients/web/ReelRoulette.WebUI`)

WebUI is runtime-config-driven API/SSE client orchestration.

- `src/clients/web/ReelRoulette.WebUI/src/app.js`
  - main client runtime behavior and orchestration (playback, filter dialog, tag overlay with **Edit Tags** + **Auto Tag** API flows).
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterStateModel.ts`
  - filter JSON serialize/parse aligned with desktop/server `FilterState`.
- `src/clients/web/ReelRoulette.WebUI/src/shell.ts`
  - static layout including tabbed tag overlay and filter overlay chrome.
- `src/clients/web/ReelRoulette.WebUI/src/main.ts`
  - bootstrap entrypoint.
- `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts`
  - API client calls and identity propagation.
- `src/clients/web/ReelRoulette.WebUI/src/auth/authBootstrap.ts`
  - startup auth/version/capability checks.
- `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts`
  - SSE connect/reconnect behavior.
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
- `tools/scripts/full-release.ps1` (chained release: optional `-Version` runs `set-release-version.ps1` with forwarded `-No*` switches, then server/desktop packaging; omit `-Version` to package from `.csproj` versions only)
- `tools/scripts/reset-checklist.ps1` (resets `docs/checklists/testing-checklist.md` metadata/checklist state; preserves waived checks by default, supports `-RemoveWaived`)

Web verification:

- `tools/scripts/verify-web.ps1`
- `tools/scripts/verify-web-deploy.ps1`
- `tools/scripts/publish-web.ps1` (compat/deploy tooling)
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` (headless packaged Linux server tarball: curls `/health`, `/api/version`, `/control/status`, `/operator`; Linux packaging CI and local runs after producing a portable tarball)

Packaging:

- `pwsh ./tools/scripts/package-serverapp-win-portable.ps1`
- `pwsh ./tools/scripts/package-serverapp-win-inno.ps1`
- `pwsh ./tools/scripts/package-desktop-win-portable.ps1`
- `pwsh ./tools/scripts/package-desktop-win-inno.ps1`
- `./tools/scripts/package-serverapp-linux-portable.sh`
- `./tools/scripts/package-desktop-linux-portable.sh`
- `./tools/scripts/package-serverapp-linux-appimage.sh`
- `./tools/scripts/package-desktop-linux-appimage.sh`
- `./tools/scripts/install-linux-from-github.sh`
- `./tools/scripts/install-linux-local.sh` (copy local `artifacts/packages/appimage/*.AppImage` to stable names under `~/.local/share/ReelRoulette` and run `--install`)
- `tools/scripts/lib/appimage-helpers.sh` (sourced by Linux AppImage package scripts)
- `tools/installer/ReelRoulette.ServerApp.iss`
- `tools/installer/ReelRoulette.Desktop.iss`
- shared icon assets: `assets/HI.ico`, `assets/HI-256.png`, `assets/HI-512.png` (Linux menu / AppImage)

CI:

- `.github/workflows/ci.yml`
- `.github/workflows/package-windows.yml`
- `.github/workflows/package-linux.yml`
