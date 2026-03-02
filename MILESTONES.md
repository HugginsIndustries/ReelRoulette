# ReelRoulette Migration Milestones

This board defines a concrete migration path from the current monolithic desktop app to a headless core/server architecture with multiple clients (Windows, Web, Android) sharing one API contract.

It is designed to be:

- **Incremental**: no big-bang rewrite
- **Shippable each milestone**: app remains usable after every milestone
- **Traceable**: each milestone has clear scope and acceptance criteria

---

## Guiding Rules

- Keep existing desktop behavior functional while migrating.
- Move business logic to core before moving UI behavior.
- Keep `ReelRoulette.Server` thin; put domain logic in `ReelRoulette.Core`.
- Treat `shared/api/openapi.yaml` as API source of truth.
- Use SSE revisions for cross-client consistency.
- Prefer adapters during transition over hard cutovers.

---

## Milestone Board

## M0 - Repo and Solution Foundation

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

## M1 - Core Domain Extraction (Pure Library)

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

## M2 - Storage and State Service Layer

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

## M3 - Server API Skeleton + Contract First

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
  - Desktop can call at least one state query via HTTP locally.

## M4 - Worker Runtime (Headless Host)

- **Goal**: Run core runtime independently of desktop UI.
- **Scope**:
  - Implement `ReelRoulette.Worker` to host server + scheduled/background jobs.
  - Add worker lifecycle:
    - start
    - stop
    - health check
    - graceful shutdown
  - Add scripts:
    - `tools/scripts/run-core.ps1`
    - `tools/scripts/run-core.sh`
- **Acceptance criteria**:
  - Worker runs headless and serves API/SSE.
  - Desktop can connect to worker localhost API.
  - Closing desktop UI does not stop worker background jobs (when configured).

## M5 - Desktop as API Client (State Flows)

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

## M6 - P1 Feature Alignment Through API (Tag Editing + Grid/Thumbnails)

- **Goal**: Implement top-priority features using new architecture seams.
- **Scope**:
  - Implement API-backed **Web Remote Tag Editing** parity:
    - tag/category edit flows
    - batch-ready `itemIds[]`
    - immediate SSE sync
  - Implement API-backed **Grid View with Thumbnail Generation** pipeline:
    - list/grid toggle persistence
    - thumbnail generation for photos/videos
    - unified refresh stage order:
      1. source refresh
      2. duration scan
      3. loudness scan
      4. thumbnail generation
    - manual refresh behavior aligned to background auto-refresh workflow
- **Acceptance criteria**:
  - Both P1 features work end-to-end through server/core.
  - No standalone legacy duration/loudness actions in UX (as planned).
  - Refresh progress/status remains observable while dialogs close.

## M7 - Web UI Separation and Build Pipeline

- **Goal**: Decouple web client codebase while preserving host integration.
- **Scope**:
  - Move web UI to `src/clients/web/ReelRoulette.WebUI`.
  - Add build pipeline that outputs static assets consumed by server.
  - Keep dev-mode local web UI and packaged hosted web UI workflows.
- **Acceptance criteria**:
  - Web UI builds independently from desktop app build.
  - Server can serve production web assets from web build output.
  - No API drift between web and desktop clients.

## M8 - Android Client Bootstrap

- **Goal**: Enable initial Android app development on stable API seam.
- **Scope**:
  - Create `src/clients/android/ReelRoulette.Android` Gradle project.
  - Implement basic API connectivity + SSE consumption.
  - Add mDNS discovery and pairing/auth flow compatible with server.
  - Optional: generate Kotlin API client from OpenAPI.
- **Acceptance criteria**:
  - Android app can discover/connect, list presets, request random media, and stream.
  - Event sync works for favorite/blacklist/tag updates.

## M9 - Hardening, Packaging, and Migration Cleanup

- **Goal**: Make architecture production-ready and reduce legacy coupling.
- **Scope**:
  - Add integration tests:
    - API command/query
    - SSE ordering/reconnect
    - background refresh pipeline
  - Finalize config/state migration strategy.
  - Reduce remaining legacy in-process paths from desktop.
  - Add packaging/distribution strategy for worker + clients.
- **Acceptance criteria**:
  - Stable multi-client operation (desktop + web at minimum).
  - No critical state divergence between clients.
  - Migration and upgrade path documented.

---

## Cross-Cutting Workstreams

These run in parallel across milestones:

- **Contract discipline**:
  - Keep `openapi.yaml` current.
  - Add change log section for API breaking/non-breaking changes.

- **Observability**:
  - Standardize structured event and operation logging.
  - Preserve privacy-safe log sanitization across all hosts/clients.

- **Concurrency and consistency**:
  - Explicit conflict policy (currently last-write-wins).
  - Idempotent commands where practical.

- **Developer workflow**:
  - Add scripts for build/run/test/generate-clients.
  - Ensure one-command local setup for core + desktop + web.

---

## Immediate Next Actions (Recommended)

- Start **M0 + M1** first.
- In parallel, define OpenAPI skeleton for the two current P1 tracks:
  - Web Remote Tag Editing
  - Grid View with Thumbnail Generation and unified refresh
- Keep desktop app shipping during migration by routing feature-by-feature through adapters.
