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
- `ReelRoulette.Server` contains only HTTP/SSE/auth/streaming glue (no direct JSON file I/O).
- Treat `shared/api/openapi.yaml` as API source of truth.
- Use SSE revisions for cross-client consistency.
- Prefer adapters during transition over hard cutovers.
- No state mutation happens in two places: once a flow is migrated to core/server, desktop must not also write JSON directly for that same data.

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
  - Client reconnect behavior is explicitly defined (minimum: reconnect detects missed revisions and re-fetches state; optional replay endpoint may be added later).
  - Desktop can call at least one state query via HTTP locally.

## M4 - Worker Runtime (Headless Host)

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
  - Regression tests for desktop API-client request shape/parsing and M5 server-state replay/filter-session behaviors are added to `dotnet test` and passing.

## M6a - P1 Feature Alignment Through API (Web Tag Editing)

- **Goal**: Ship API-backed web tag editing parity as an independent, low-blast-radius milestone.
- **Scope**:
  - Implement API-backed **Web Remote Tag Editing** parity:
    - tag/category edit flows
    - batch-ready `itemIds[]`
    - immediate SSE sync
- **Acceptance criteria**:
  - Web remote tag editing works end-to-end through server/core.
  - Desktop and web remain synchronized via SSE for tag/category/item-tag changes.
  - Tag editing can ship independently of grid/thumbnail/pipeline refactors.
  - Regression tests validate tag/category mutation contracts plus SSE sync projections (including batch-ready `itemIds[]` request handling) and pass in `dotnet test`.

## M6b - P1 Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)

- **Goal**: Deliver API-backed grid/thumbnails and refresh pipeline refactor as a separate milestone.
- **Scope**:
  - Implement API-backed **Grid View with Thumbnail Generation** pipeline:
    - list/grid toggle persistence
    - thumbnail generation for photos/videos
    - unified refresh stage order:
      1. source refresh
      2. duration scan
      3. loudness scan
      4. thumbnail generation
    - manual refresh behavior aligned to background auto-refresh workflow
  - Define thumbnail artifact policy before feature completion:
    - artifact location convention (for example, `data/thumbnails/{itemId}.jpg`)
    - invalidation rules (file change/fingerprint change -> thumbnail stale/regenerate)
    - target size/quality and video thumbnail timestamp strategy
- **Acceptance criteria**:
  - Grid view and thumbnail generation work end-to-end through server/core.
  - No standalone legacy duration/loudness actions in UX (as planned).
  - Refresh progress/status remains observable while dialogs close.
  - Thumbnail artifact/invalidation policy is implemented and documented.
  - Regression tests cover thumbnail invalidation decisions and unified refresh stage sequencing/progress projection; all pass in `dotnet test`.

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
  - Regression tests include build-output asset serving and contract compatibility checks against current OpenAPI, and pass in `dotnet test`.

## M8 - Android Client Bootstrap

- **Goal**: Enable initial Android app development on stable API seam.
- **Scope**:
  - Create `src/clients/android/ReelRoulette.Android` Gradle project.
  - Implement basic API connectivity + SSE consumption.
  - Add mDNS discovery and integrate with the existing pairing/auth primitive from earlier milestones.
  - Optional: generate Kotlin API client from OpenAPI.
- **Acceptance criteria**:
  - Android app can discover/connect, list presets, request random media, and stream.
  - Event sync works for favorite/blacklist/tag updates.
  - Regression tests validate Android client API/SSE compatibility expectations (schema, event envelope handling, and reconnect behavior) and pass in `dotnet test`.

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
  - Full regression suite (unit + integration + reconnect/ordering checks) is part of the default CI `dotnet test` gate and remains green.

---

## Cross-Cutting Workstreams

These run in parallel across milestones:

- **Contract discipline**:
  - Keep `openapi.yaml` current.
  - Update OpenAPI whenever endpoint shape/behavior changes (do not require unrelated OpenAPI churn).
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
