# ReelRoulette Repository Context

This document is the operational context map for this repo. It is intended for both contributors and agents, and should be kept current as milestones land.

## Purpose and Migration Goal

ReelRoulette is being migrated from a monolithic desktop app into a thin-client, API-first architecture:

- Core/server owns business logic and authoritative state.
- Clients (desktop, web, future mobile) are orchestration/render layers.
- Shared API contracts and SSE eventing provide cross-client parity.

Primary outcome: new clients can be added without reimplementing domain logic.

## Current State (Implemented)

As of current milestones:

- `M0`-`M8b` are complete in `MILESTONES.md`.
- Desktop runtime is still `source/ReelRoulette.csproj`.
- Core/server/worker runtime exists under `src/core/*`.
- M8a server-app consolidation is complete: `src/core/ReelRoulette.ServerApp` now hosts API/SSE/media/WebUI/operator UI in one process and one origin.
- M8b control-plane expansion is complete: `/control/*` now provides status/settings/pair/restart/stop operations, with control auth/trust policy and operator telemetry/connected-client visibility.
- API contract source of truth is `shared/api/openapi.yaml` (currently `0.8.0`).
- M6a tag editing migration is API-first and shared across desktop/web seams.
- M6b refresh pipeline/thumbnails/grid are core-owned; desktop consumes API/SSE projection.
- M7a web foundation is complete: independent Vite+TypeScript web bootstrap with runtime endpoint config contract and verification gates.
- M7b direct web auth/SSE reliability is complete: pair-token bootstrap to session-cookie auth, direct web SSE status projection, replay-gap resync fallback, and explicit CORS/cookie runtime policy controls.
- M7c zero-restart web deployment is complete: independent `ReelRoulette.WebHost` static host, immutable versioned web artifacts, atomic `active-manifest.json` activation/rollback, and split shell-vs-asset cache policy.
- M7e compatibility guardrails are complete: TS OpenAPI-generated contracts are part of WebUI verify, and web startup enforces version/capability checks for N/N-1 safety.

## Planned State (Upcoming)

Near-term planned milestones:

- `M8c`: thin-client runtime ownership cleanup after M8a/M8b server-app control-plane completion.
- `M9`: Android client bootstrap on stable API seam.

Detailed M7 decisions and rollout strategy: `docs/m7-clarifications.md`.

## Repository Structure (Top-Level + Key Subtrees)

- `source/`
  - Current shipping desktop application (Avalonia).
  - Contains desktop API client (`source/CoreServerApiClient.cs`) and UI orchestration.
- `src/core/`
  - `ReelRoulette.Core`: domain logic, storage/state services, verification helpers.
  - `ReelRoulette.Server`: thin HTTP/SSE/auth composition and contracts.
  - `ReelRoulette.ServerApp`: operator-facing single-process host for API/SSE/media/WebUI and runtime restart/settings operations.
  - `ReelRoulette.Worker`: headless runtime host for core/server APIs and jobs.
  - `ReelRoulette.Core.Tests`: xUnit regression and contract tests.
  - `ReelRoulette.Core.SystemChecks`: console harness for scenario/system checks.
- `src/clients/`
  - `windows/ReelRoulette.WindowsApp`: target location for desktop client migration.
  - `web/ReelRoulette.WebUI`: target location for decoupled web client migration.
  - `web/ReelRoulette.WebHost`: independent static web host with manifest-based active-version switching.
- `shared/api/`
  - `openapi.yaml`: API contract source of truth.
- `docs/`
  - Architecture, API baseline, dev setup, milestone domain inventories, and clarification records.
- `tools/scripts/`
  - Core runtime helper scripts (`run-core.ps1`, `run-core.sh`) now target `ReelRoulette.ServerApp`.
  - Web verification helper scripts (`verify-web.ps1`, `verify-web.sh`).
  - M7c web deployment scripts (`publish-web.*`, `activate-web-version.*`, `rollback-web-version.*`) remain for compatibility tooling only (not required runtime path in M8a).
  - `verify-web-deploy.*` now runs M8a single-origin smoke verification against `ReelRoulette.ServerApp`.
  - `publish-activate-run-worker.ps1` is retained as a compatibility-named helper but now builds WebUI and runs `ReelRoulette.ServerApp`.
- `licenses/`
  - Third-party license texts (VLC, FFmpeg licensing artifacts).

## Tech Stack

- Runtime/platform:
  - .NET (solution-based multi-project architecture)
  - Avalonia (desktop UI)
  - HTTP APIs + SSE for client synchronization
- Media/processing:
  - FFmpeg/FFprobe for media analysis/extraction
  - SkiaSharp for photo thumbnail generation paths
- Data/storage:
  - JSON-backed state (`library.json`, `settings.json`) with migration toward core-owned access
  - Thumbnail artifacts in `%LOCALAPPDATA%\\ReelRoulette\\thumbnails\\`
- API/contracts:
  - OpenAPI 3.1 (`shared/api/openapi.yaml`)
  - Typed DTOs/contracts mirrored in server/desktop client layers

## Runtime Architecture (Current)

- `ReelRoulette.ServerApp` is the default runtime host:
  - serves API, SSE, and media endpoints;
  - serves WebUI static assets and dynamic `runtime-config.json`;
  - exposes operator UI at `/operator`;
  - exposes metadata endpoints (`/health`, `/api/version`, `/api/capabilities`);
  - exposes control-plane endpoints (`/control/status`, `/control/settings`, `/control/pair`, `/control/restart`, `/control/stop`).
  - advertises LAN WebUI hostname via mDNS (`{LanHostname}.local`) when WebUI is enabled and LAN bind is active.
- Desktop acts as thin client for migrated flows:
  - Commands/queries via API
  - Live projection via SSE
- Core refresh pipeline is unified and core-owned:
  1. source refresh
  2. duration scan
  3. loudness scan (new/unscanned)
  4. thumbnail generation
- Event envelope includes revision metadata and supports reconnect replay semantics (`Last-Event-ID`, `resyncRequired` + authoritative requery).
- Legacy embedded `source/WebRemote` runtime bridge is retired.
- Separate `ReelRoulette.WebHost` process and manifest pointer switching are not required for normal runtime in M8a.

## Development Workflows (Current)

From repo root:

- Build solution:
  - `dotnet build ReelRoulette.sln`
- Run desktop runtime:
  - `dotnet run --project .\source\ReelRoulette.csproj`
- Run server (optional directly):
  - `dotnet run --project .\src\core\ReelRoulette.Server\ReelRoulette.Server.csproj`
- Run worker (headless runtime):
  - `dotnet run --project .\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj`
- Run server app (single-process runtime, recommended):
  - `dotnet run --project .\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj`
  - or `.\tools\scripts\run-core.ps1` / `./tools/scripts/run-core.sh`
- Primary test gate:
  - `dotnet test ReelRoulette.sln`
- Optional system checks:
  - `dotnet run --project .\src\core\ReelRoulette.Core.SystemChecks\ReelRoulette.Core.SystemChecks.csproj -- --verbose`

## Development Workflows (Planned)

For M7 web separation:

- Web client builds/runs independently under `src/clients/web/ReelRoulette.WebUI` (M7a complete).
- Runtime endpoint resolution now comes from runtime config (not compile-time constants).
- Web auth/session and SSE reconnect/resync now run through direct web-to-core paths (M7b complete).
- Web deployment now supports immutable versioned artifacts with atomic activation/rollback and split cache policy (M7c complete).
- M7d cutover is complete: parity WebUI migrated and legacy bridge retired.
- M7e is complete: OpenAPI-driven TS contract generation is enforced in web verify and version/capability compatibility checks gate unsupported server contracts.
- M8a is complete: server app consolidation to one process/one origin, with WebHost/manifest switching removed from required runtime behavior.
- M8b is complete: control-plane API/UI expansion with deterministic settings/lifecycle operations, control auth policy, and operator telemetry/connected-client diagnostics.

See `docs/m7-clarifications.md` for chosen options and sequencing.

## Testing and Verification Model

- Default quality gate: `dotnet test ReelRoulette.sln`.
- Regression tests cover:
  - contract compatibility
  - state/replay behavior
  - refresh pipeline sequencing/overlap/status
  - thumbnail invalidation/metadata behaviors
- System-check harness exists for scenario-heavy verification and verbose diagnostics.
- Milestone sign-off requires explicit acceptance criteria verification in `MILESTONES.md`.

## Core Guardrails and Non-Goals

- Keep `ReelRoulette.Server` thin:
  - HTTP/SSE/auth/streaming composition only
  - no domain business logic and no direct JSON file I/O in server glue
- No dual-writer state:
  - once a flow is migrated to core/server, desktop must not directly mutate authoritative state for that flow
- API-first discipline:
  - update `shared/api/openapi.yaml` for endpoint contract changes
  - keep client behavior aligned through shared contracts + SSE semantics

## Key Context Docs

- Migration board: `MILESTONES.md`
- Active/planned work items: `TODO.md`
- Architecture evolution: `docs/architecture.md`
- API baseline and endpoint/event notes: `docs/api.md`
- Dev setup and milestone runtime notes: `docs/dev-setup.md`
- M7 decisions: `docs/m7-clarifications.md`
- Milestone domain inventories: `docs/m*-domain-inventory.md`

## Maintenance Expectations for This Context Doc

Update this file whenever any of the following change:

- milestone status/scope that affects runtime or workflow reality
- core architecture ownership boundaries
- repo/project structure
- build/run/test commands
- API/eventing contract direction (including compatibility policy)

When uncertain, prefer short factual updates over speculative detail.
