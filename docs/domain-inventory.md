# Domain Inventory (Current State)

This is the canonical implementation inventory for ReelRoulette.
It is ownership-first (not milestone-first) and reflects current state only.

## Scope and Update Rules

- Purpose: map where authoritative behavior lives across core/server/clients.
- Keep this file current when features/workflows/contracts are added, changed, or removed.
- Do not use this file as milestone history; use `MILESTONES.md` for roadmap/evidence.
- Prefer concise entries: ownership + key files + notable boundaries.

---

## Core Domain Logic (Authoritative)

Core/server domain services own business rules and persisted state semantics.

- `src/core/ReelRoulette.Core/*`
  - filtering/randomization helpers, storage abstractions, verification modules.
- `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs`
  - source import, duplicate scan/apply, auto-tag scan/apply, playback-stats clear, related command orchestration.
- `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`
  - unified refresh pipeline stage execution, overlap guards, status snapshots, thumbnail generation/invalidation.
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
- `src/core/ReelRoulette.ServerApp/Hosting/WindowsNotifyIconHostUi.cs`
  - Windows-only tray runtime controls (Open Operator UI, Launch Server on Startup, Refresh Library, Restart Server, Stop Server / Exit) using shared `assets/HI.ico`.
- `src/core/ReelRoulette.ServerApp/Hosting/HeadlessHostUi.cs`
  - non-Windows headless host path for runtime compatibility.
- `src/core/ReelRoulette.ServerApp/Hosting/WindowsStartupLaunchService.cs`
  - Windows startup-launch registration and state reconciliation (`HKCU` Run key) for immediate tray/operator toggles.
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

## Desktop Client Orchestration (`src/clients/windows/ReelRoulette.WindowsApp/`)

Desktop is orchestration/render for migrated flows.

- `src/clients/windows/ReelRoulette.WindowsApp/MainWindow.axaml.cs`
  - API/SSE lifecycle orchestration, reconnect/resync guidance, compatibility gating, playback orchestration.
- `src/clients/windows/ReelRoulette.WindowsApp/CoreServerApiClient.cs`
  - typed desktop API adapter (commands/queries/SSE wiring).
- `src/clients/windows/ReelRoulette.WindowsApp/ManageSourcesDialog.axaml.cs`
  - API-backed source/duplicate orchestration behavior.
- `src/clients/windows/ReelRoulette.WindowsApp/AutoTagDialog.axaml.cs`
  - API-backed auto-tag scan/apply orchestration.
- `src/clients/windows/ReelRoulette.WindowsApp/SettingsDialog.axaml(.cs)`
  - client-side settings orchestration including playback policy toggle UX.
- `src/clients/windows/ReelRoulette.WindowsApp/ClientLogRelay.cs`
  - client log relay to server-side log ingestion API.

Boundary:

- No authoritative local mutation fallback for migrated server-owned domains.

---

## WebUI Client Orchestration (`src/clients/web/ReelRoulette.WebUI`)

WebUI is runtime-config-driven API/SSE client orchestration.

- `src/clients/web/ReelRoulette.WebUI/src/app.js`
  - main client runtime behavior and orchestration.
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
  - `src/clients/web/ReelRoulette.WebUI/scripts/sync-shared-icon.mjs`
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
  - `docs/testing-checklist.md`

Canonical gates:

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`
- `npm run verify` (WebUI)
- `tools/scripts/verify-web-deploy.ps1` / `.sh`

---

## Runtime, Packaging, and CI Tooling

Runtime scripts:

- `tools/scripts/run-server.ps1` / `.sh`
- `tools/scripts/run-server-rebuild.ps1` / `.sh`
- scripts select `net9.0-windows` framework on Windows and `net9.0` on non-Windows for ServerApp startup.
- `tools/scripts/set-release-version.ps1` (release-aligned version fan-out for OpenAPI/runtime/tests/project metadata plus README/dev-setup release command examples; use `-NoDocUpdates` to skip docs updates)
- `tools/scripts/full-release.ps1` (chained release flow: version fan-out + verify + server/desktop packaging)
- `tools/scripts/reset-checklist.ps1` (resets `docs/testing-checklist.md` metadata/checklist state; preserves waived checks by default, supports `-RemoveWaived`)

Web verification:

- `tools/scripts/verify-web.ps1` / `.sh`
- `tools/scripts/verify-web-deploy.ps1` / `.sh`
- `tools/scripts/publish-web.ps1` / `.sh` (compat/deploy tooling)

Packaging:

- `tools/scripts/package-serverapp-win-portable.ps1`
- `tools/scripts/package-serverapp-win-inno.ps1`
- `tools/scripts/package-desktop-win-portable.ps1`
- `tools/scripts/package-desktop-win-inno.ps1`
- `tools/installer/ReelRoulette.ServerApp.iss`
- `tools/installer/ReelRoulette.Desktop.iss`
- shared icon asset: `assets/HI.ico`

CI:

- `.github/workflows/ci.yml`
- `.github/workflows/package-windows.yml`
