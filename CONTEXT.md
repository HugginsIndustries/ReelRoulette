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
    - Linux: XDG autostart (`*.desktop`).

- **Domain execution (`src/core/ReelRoulette.Core` + server services)**
  - API-authoritative library operations (import, duplicates, auto-tag, playback stats, refresh pipeline).
  - Unified refresh pipeline with stage/status projection and thumbnail generation.
  - Replay-aware SSE envelope with reconnect recovery (`Last-Event-ID`, `resyncRequired`, authoritative requery).

- **Desktop client (`src/clients/desktop/ReelRoulette.DesktopApp/`)**
  - Thin-client for migrated flows: API command/query + SSE projection (no dual-writer core-state mutation).
  - Local-first playback with deterministic API fallback (`ForceApiPlayback` option).
  - Server version/capability compatibility gating with reconnect/resync guidance.
  - API-backed source import, duplicate scan/apply, auto-tag scan/apply, and playback-stats clear.
  - Duplicate review dialog renders per-item thumbnail previews via server thumbnail endpoint paths for faster keep/delete validation.
  - Duplicate review dialog supports per-group handling selection with a persisted default behavior (`Keep All` or `Select Best`) from desktop settings.
  - Duplicate review comparison metadata now includes per-item tag counts and enriched keep-selection labels (filename + plays/tags/favorite/blacklisted) for faster keep decisions.
  - Tag editor and filter `Tags` tab share theme-compatible category/chip surfaces in light/dark mode while preserving filter control behavior boundaries.

- **WebUI client (`src/clients/web/ReelRoulette.WebUI`)**
  - Runtime-config bootstrap, direct API/SSE integration, and startup compatibility/capability checks.
  - Session-aware identity propagation (`clientId`/`sessionId`) through API + SSE paths.
  - Core playback/control/tag workflows aligned with server-authoritative behavior.

- **Operational surfaces**
  - Manual validation guide/checklist at `docs/checklists/testing-checklist.md`.
  - Windows packaging scripts and CI workflows are present for build/verify/package gates.
  - Linux portable packaging: `tools/scripts/package-serverapp-linux-portable.sh` and `package-desktop-linux-portable.sh` produce self-contained `linux-x64` tarballs under `artifacts/packages/portable/` (`run-server.sh` / `run-desktop.sh`, bundled `README.txt` for native prereqs).
  - Windows installers expose desktop shortcut install tasks (checked by default for server and desktop installers).

## Near-Term Planned Work

Authoritative roadmap details live in `MILESTONES.md`. Near-term focus areas:

- `M9*`: structured logging pipeline and migration rollout.
- `M10`: UX/UI polish.
- `M11*`: playback-session pipeline rollout.

## Repository Map (High Signal)

- `src/core/`:
  - `ReelRoulette.Core`: domain + storage/state logic.
  - `ReelRoulette.Server`: thin transport/composition layer.
  - `ReelRoulette.ServerApp`: default host/runtime + operator surfaces.
  - `ReelRoulette.Core.Tests` and `ReelRoulette.Core.SystemChecks`.
- `src/clients/`:
  - `web/ReelRoulette.WebUI`: active web client.
  - `desktop/ReelRoulette.DesktopApp`: shipping Desktop client location (Avalonia).
- `shared/api/openapi.yaml`: API contract source of truth.
- `tools/scripts/`: runtime/verify/package scripts (`run-server*`, `verify-web*`, `verify-web-deploy*`, `publish-web*`, Windows `package-*-win-*.ps1`, Linux portable `package-*-linux-portable.sh`).
  - includes `set-release-version.ps1` for release-aligned version fan-out (with optional docs update skip via `-NoDocUpdates`) and `reset-checklist.ps1` for testing-guide reset workflows.

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
