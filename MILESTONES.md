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

## Client-Only Responsibilities Checklist

- **UI/Platform only in clients**: render screens, capture input, manage ephemeral UI state, handle local playback/rendering primitives, and project API/SSE data into view models.
- **Core/Server authority**: own all domain logic and persistence (library state, sources, tags/categories/presets/filters, randomization, playback stats, refresh pipeline, thumbnails, and domain-affecting settings).
- **No direct local mutation**: clients must not write authoritative domain state directly (no direct JSON mutation for migrated domains).
- **API-first execution**: user actions invoke core/server commands/queries; clients orchestrate UX and display results.
- **SSE + snapshot recovery**: clients consume SSE for live sync and use query re-fetch/resync when reconnect gaps occur.
- **Cross-client parity**: desktop/web/mobile use the same contracts; behavior changes are made once in core and reflected through API/SSE.
- **Thin-client end state**: after migration, adding new clients should primarily be UI integration over existing API contracts, not reimplementation of business logic.

---

## Milestone Board

Status legend: `✅ Complete` | `⏳ Planned`

### M0 - Repo and Solution Foundation

- **Status**: ✅ Complete
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

### M1 - Core Domain Extraction (Pure Library)

- **Status**: ✅ Complete
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

### M2 - Storage and State Service Layer

- **Status**: ✅ Complete
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

### M3 - Server API Skeleton + Contract First

- **Status**: ✅ Complete
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

### M4 - Worker Runtime (Headless Host)

- **Status**: ✅ Complete
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

### M5 - Desktop as API Client (State Flows)

- **Status**: ✅ Complete
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

### M6a - P1 Feature Alignment Through API (Web Tag Editing)

- **Status**: ✅ Complete
- **Goal**: Ship API-backed web tag editing parity as an independent, low-blast-radius milestone.
- **Scope**:
  - Implement API-backed **Web Remote Tag Editing** parity:
    - tag/category edit flows
    - batch-ready `itemIds[]`
    - immediate SSE sync
  - Migrate desktop tag/category/item-tag mutation flows to the same core/server command path:
    - desktop tag editing remains orchestration/UI only
    - mutation authority for migrated tag flows is core/server
    - remove direct desktop JSON mutation for migrated tag/category/item-tag paths
- **Acceptance criteria**:
  - Web remote tag editing works end-to-end through server/core.
  - Desktop and web tag edits execute through the same API/core mutation services (single-writer for migrated tag flows).
  - Desktop does not directly mutate JSON for migrated tag/category/item-tag flows.
  - Desktop and web remain synchronized via SSE for tag/category/item-tag changes.
  - Category delete semantics reassign tags to canonical `uncategorized` (fixed ID) instead of deleting tags.
  - `Uncategorized` appears in category dropdowns and remains hidden from category lists when it has no tags.
  - Tag editing can ship independently of grid/thumbnail/pipeline refactors.
  - Regression tests validate tag/category mutation contracts plus SSE sync projections (including batch-ready `itemIds[]` request handling) and pass in `dotnet test`.

### M6b - P1 Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)

- **Status**: ✅ Complete
- **Goal**: Deliver API-backed grid/thumbnails and refresh pipeline refactor as a separate milestone.
- **Linked TODO**: `Grid View for Library Panel with Thumbnail Generation (Unified Refresh Pipeline)` in `TODO.md`.
- **Scope**:
  - Implement API-backed **Grid View with Thumbnail Generation** pipeline:
    - list/grid toggle persistence
    - thumbnail generation for photos/videos
    - pipeline execution and scheduling owned by core runtime (not desktop-local orchestration)
    - unified refresh stage order:
      1. source refresh
      2. duration scan
      3. loudness scan
      4. thumbnail generation
    - loudness stage runs new/unscanned files only (drop scan-all mode for this flow)
    - manual refresh is triggered via `POST /api/refresh/start` and runs through the same core pipeline as auto-refresh
    - `GET /api/refresh/status` snapshot endpoint complements SSE progress events for active clients
    - core rejects overlapping runs with `409 already running`; auto and manual refresh do not run concurrently
    - triggering manual refresh resets the auto-refresh interval baseline
    - status/progress events are emitted for both auto/manual runs; desktop projects them during M6b, while direct web/mobile projection is completed in M7+ when those clients are decoupled from desktop-hosted bridges
  - Move refresh scheduling/config ownership to core host config:
    - support appsettings + CLI override model
    - client settings updates are pushed to core via API and persisted in core settings
    - default auto refresh remains enabled, default interval becomes 15 minutes, idle-only gating settings are removed
  - Define thumbnail artifact policy before feature completion:
    - artifact location convention (for example, `%LOCALAPPDATA%\\ReelRoulette\\thumbnails\\{itemId}.jpg`)
    - invalidation rules (file change/fingerprint change -> thumbnail stale/regenerate)
    - target size/quality and video thumbnail timestamp strategy
- **Acceptance criteria**:
  - Grid view and thumbnail generation work end-to-end through server/core.
  - No standalone legacy duration/loudness actions in UX (as planned).
  - Refresh progress/status remains observable while dialogs close and via `GET /api/refresh/status` + SSE for desktop in M6b; direct web-to-core SSE status parity is tracked in M7.
  - Core runtime is the single execution owner for unified refresh pipeline and auto-refresh scheduling.
  - Manual refresh is API-triggered (`POST /api/refresh/start`) and returns `409` when a refresh run is already active.
  - Auto-refresh timer baseline is reset when a manual refresh is started.
  - Core config defaults are applied (auto enabled, 15-minute interval, no idle gating settings).
  - Thumbnail artifact/invalidation policy is implemented and documented.
  - Regression tests cover thumbnail invalidation decisions, unified refresh stage sequencing, refresh overlap rejection (`409`), and status/progress projection behavior; all pass in `dotnet test`.

### M7a - Web Client Foundation and Independent Host Bootstrap

- **Status**: ✅ Complete
- **Goal**: Establish `ReelRoulette.WebUI` as an independently buildable/runnable web client without desktop-hosted runtime dependency.
- **Scope**:
  - Stand up `src/clients/web/ReelRoulette.WebUI` with Vite + TypeScript as the canonical web client project.
  - Add runtime config bootstrap for API/SSE endpoint resolution (no compile-time hardcoded base URLs).
  - Define independent dev-server and production-build workflows for web iteration.
- **Acceptance criteria**:
  - Web UI builds independently from desktop app build.
  - Web UI runs in dev mode with runtime-configured API/SSE endpoints.
  - Web iteration (build/reload) does not require restarting desktop app or core server.
  - Runtime config keys/shape are documented and validated in tests.
  - Automated checks for web build output and runtime-config schema pass.
- **Verification evidence**:
  - `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI` (typecheck + runtime-config tests + production build + build-output checks).
  - Web dev bootstrap starts successfully via `npm run dev` without desktop/core restart dependencies.

### M7b - Direct Web-to-Core Auth and SSE Reliability

- **Status**: ✅ Complete
- **Goal**: Move web auth/eventing to direct core/server integration with robust reconnect/resync behavior.
- **Scope**:
  - Implement pair-token bootstrap followed by secure HTTP-only session-cookie auth for web API/SSE usage.
  - Connect web directly to core/server SSE (`/api/events`) and refresh status APIs (`/api/refresh/status`) without desktop bridge/proxy.
  - Implement revision-aware SSE reconnect (`Last-Event-ID`), replay handling, and authoritative API requery fallback when replay gaps occur.
  - Define explicit CORS/cookie environment matrix for localhost, LAN/dev-cert, and production paths.
- **Acceptance criteria**:
  - Web auth sessions persist through expected reconnect/navigation flows using secure cookie semantics.
  - `refreshStatusChanged` and related events are projected directly from core/server to web status line during active runs, failures, and completions.
  - Replay-gap/resync-required scenarios recover by requerying authoritative API state with no persistent client divergence.
  - CORS/cookie policies validate in supported environments.
  - Automated reconnect/resync checks plus focused manual parity checks pass.
- **Verification evidence**:
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passes, including `sseClient` resync/requery regression coverage (`src/test/sseClient.test.ts`).
  - `dotnet test ReelRoulette.sln` passes with server auth/cookie/CORS policy coverage (`ServerAuthRegressionTests`, `ServerCookiePolicyTests`, `ServerRuntimeOptionsTests`).
  - `dotnet build ReelRoulette.sln` passes after stopping an active worker process that was locking `ReelRoulette.Server.dll`.
  - Manual CORS preflight check (allowed origin): `OPTIONS /api/version` with `Origin: http://localhost:5173` returns `204` plus `Access-Control-Allow-Origin: http://localhost:5173` and `Access-Control-Allow-Credentials: true`.
  - Manual CORS preflight check (blocked origin): `OPTIONS /api/version` with `Origin: http://example.com` returns `204` without `Access-Control-Allow-Origin`.
  - Manual pairing check: `POST /api/pair?token=...` returns `200` and `Set-Cookie` with `httponly` + `samesite=lax`, confirming credentialed session bootstrap behavior.

### M7c - Zero-Restart Web Deployment, Caching, and Rollback

- **Status**: ✅ Complete
- **Goal**: Enable independent web deployments without desktop/core restarts and with fast rollback.
- **Scope**:
  - Publish web artifacts as immutable versioned bundles.
  - Activate versions via atomic pointer/symlink/manifest switch.
  - Apply split caching policy:
    - `index.html` and runtime config: no-store (or short revalidate-first policy)
    - hashed JS/CSS/assets: long-lived immutable caching
  - Add atomic rollback path to prior known-good web artifact.
- **Acceptance criteria**:
  - New web versions can be activated without restarting desktop app or core server.
  - Clients pick up shell/config updates promptly while retaining cached hashed assets.
  - Rollback to previous artifact works via atomic switch only.
  - Deployment/rollback flow is documented and repeatable.
  - Automated smoke checks validate active version, cache policy behavior, and rollback.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` passes with the new `ReelRoulette.WebHost` project included.
  - `dotnet test ReelRoulette.sln` passes after M7c deployment-host/script changes.
  - `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI`.
  - `tools/scripts/verify-web-deploy.ps1` passes end-to-end:
    - publishes two immutable versions,
    - activates v1 then v2 without restarting web host process,
    - verifies split caching headers (`index.html`/`runtime-config.json` no-store, hashed assets immutable),
    - rolls back atomically to v1 via manifest pointer switch.
  - Activation/rollback are performed through atomic `active-manifest.json` pointer updates (`publish-web.*`, `activate-web-version.*`, `rollback-web-version.*`).

### M7d - Controlled Cutover and Legacy Bridge Retirement

- **Status**: ⏳ Planned
- **Goal**: Complete migration to direct web-to-core paths while preserving current web-remote user experience, then remove legacy embedded web-remote bridge mutations/events.
- **Scope**:
  - Use a two-phase rollout with time-bounded migration feature flags:
    1. parity-capable independent web path behind flag(s)
    2. default-on independent path followed by legacy removal
  - Define flag owner/default-by-environment/validation coverage/removal target metadata.
  - Migrate the current legacy web UI experience into `ReelRoulette.WebUI` with functional and visual parity for the main media page, custom media controls, tag editor workflows, and related interaction paths.
  - Integrate desktop settings UX so users can continue controlling web runtime behavior from desktop UI (web server enable/disable, LAN binding/access, hostname behavior including `reel.local`, and auth/token settings mapped to core/server or web-host runtime controls).
  - Require explicit phase gates before any legacy removal:
    - automated parity/build/test gate pass
    - focused manual parity verification pass executed by the user (not by the agent)
    - explicit user approval to proceed with removing legacy `source/WebRemote` paths
  - Process requirement: after automated gate completion, the agent must stop implementation work, provide a manual migrated-WebUI verification checklist/instructions to the user, and wait for user confirmation before continuing.
  - Remove legacy desktop `WebRemoteServer` mutation/event bridge paths only after parity verification and gate approval.
- **Acceptance criteria**:
  - Migration flag metadata is explicit (owner, defaults, tests, sunset/removal target).
  - `ReelRoulette.WebUI` preserves required legacy web-remote UX parity for main media interactions, custom media controls, and tag editor flows.
  - Desktop settings maintain equivalent user-facing controls for web runtime behavior (including `reel.local`/LAN discoverability and enable/disable/auth configuration paths) after migration.
  - Required web parity flows are verified before default cutover and before legacy removal.
  - Manual parity verification is user-executed; the agent provides instructions/checklist and waits for user confirmation before removal work resumes.
  - Legacy embedded web-remote mutation/event bridge paths are removed only after automated gate pass, user-executed manual parity gate pass, and explicit user approval is recorded.
  - Desktop/core behavior remains stable after legacy path retirement.
  - Time-bounded migration flags are removed or scheduled with explicit follow-up completion criteria.

### M7e - Contract Compatibility and Final M7 Verification Gate

- **Status**: ⏳ Planned
- **Goal**: Lock independent-release safety and complete M7 sign-off with contract-compatibility guarantees.
- **Scope**:
  - Enforce N/N-1 compatibility policy with capability checks for independent web/core releases.
  - Generate TS web client contracts from OpenAPI; verify C# contract compatibility against the same API source.
  - Execute hybrid verification gate (automated + manual) as required milestone exit criteria.
- **Acceptance criteria**:
  - Web API/event models are generated from OpenAPI and validated in CI.
  - Capability checks prevent unsupported feature usage against older compatible core/server versions.
  - Automated gates pass: build-output asset serving, direct web-to-core SSE/refresh status projection, and OpenAPI compatibility checks.
  - Manual gates pass: direct web connect without desktop bridge, refresh status-line parity through run/fail/complete states, and auth/reconnect continuity.
  - M7a-M7e acceptance criteria are explicitly verified before advancing to M8.

### M8 - Hardening, Packaging, and Migration Cleanup

- **Status**: ⏳ Planned
- **Goal**: Make architecture production-ready and reduce legacy coupling.
- **Scope**:
  - Add integration tests:
    - API command/query
    - SSE ordering/reconnect
    - background refresh pipeline
  - Finalize config/state migration strategy.
  - Reduce remaining legacy in-process paths from desktop.
  - Migrate stats aggregation/query logic to core services and expose API endpoints/contracts used by desktop/web clients.
  - Add packaging/distribution strategy for worker + clients.
- **Acceptance criteria**:
  - Stable multi-client operation (desktop + web at minimum).
  - No critical state divergence between clients.
  - Source CRUD + enable/disable and operational settings that affect domain behavior are core-owned API commands/queries, with desktop/web as orchestration/render only.
  - All migrated domains (state/tag/random/filter/etc.) have zero direct desktop JSON mutation paths; exceptions list is empty or explicitly documented.
  - Library panel dataset composition (filters/sources/search/sort/paging/result shaping) is executed via core/server query paths; desktop/web clients are render/orchestration only for migrated views.
  - Library refresh completion is thin-client projected: clients observe core refresh status/events and re-query core API datasets (no authoritative local JSON reload/path scanning to discover new or removed items).
  - Global library stats and current-file stats panel data are retrieved via core/server API query paths; desktop/web clients do not compute or persist authoritative stats locally for migrated views.
  - Migration and upgrade path documented.
  - Full regression suite (unit + integration + reconnect/ordering checks) is part of the default CI `dotnet test` gate and remains green.

### M9 - Android Client Bootstrap

- **Status**: ⏳ Planned
- **Goal**: Enable initial Android app development on stable API seam after desktop/web client migration is functionally complete.
- **Scope**:
  - Create `src/clients/android/ReelRoulette.Android` Gradle project.
  - Implement basic API connectivity + SSE consumption.
  - Add mDNS discovery and integrate with the existing pairing/auth primitive from earlier milestones.
  - Optional: generate Kotlin API client from OpenAPI.
- **Acceptance criteria**:
  - Android app can discover/connect, list presets, request random media, and stream.
  - Event sync works for favorite/blacklist/tag updates.
  - Mobile resume/reconnect auth continuity is verified (pairing/auth state survives app background/resume and SSE reconnect paths).
  - Regression tests validate Android client API/SSE compatibility expectations (schema, event envelope handling, and reconnect behavior) and pass in `dotnet test`.
