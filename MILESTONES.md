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

- **Status**: ✅ Complete
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
- **Verification evidence**:
  - Legacy embedded WebRemote stack under `source/WebRemote/` is removed from runtime behavior and project resources.
  - Desktop Web UI controls now map to core-owned runtime settings through API (`/api/web-runtime/settings`) and worker-managed WebHost lifecycle.
  - Core/server owns preset/filter randomization semantics used by both desktop and WebUI (`/api/presets`, `/api/presets/match`, `/api/random` with filter-state-first semantics).
  - Independent WebHost serves host-aware `runtime-config.json`, enabling direct `localhost`, mDNS (`*.local`), and LAN-IP client access without legacy desktop bridge routes.
  - Dynamic CORS allowlist and worker mDNS advertisement are derived from current web runtime settings and active LAN interfaces.
  - Gate A automated checks passed during cutover slices (`dotnet build ReelRoulette.sln`, core test gate, web verify/build checks).
  - Gate B manual parity checklist was user-executed and approved; Gate C explicit user approval was recorded prior to legacy removal.
  - Remaining post-cutover runtime stabilization issues (settings reopen/apply lockout, LAN apply consistency edge cases, worker/WebHost shutdown orphan cleanup) are explicitly deferred to `M8b`.

### M7e - Contract Compatibility and Final M7 Verification Gate

- **Status**: ✅ Complete
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
- **Verification evidence**:
  - OpenAPI contract generation pipeline added to WebUI (`openapi-typescript`) with generated types committed at `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`.
  - Web verify gate now includes stale-contract enforcement (`npm run verify:contracts`) and fails when generated TS contracts drift from `shared/api/openapi.yaml`.
  - `VersionResponse` contract now exposes explicit compatibility/capability metadata (`minimumCompatibleApiVersion`, `supportedApiVersions`, `capabilities`) in OpenAPI and server DTO mapping.
  - Web auth/version bootstrap paths enforce N/N-1 compatibility and required capability checks before normal feature execution.
  - C# compatibility regression coverage extended (`ServerContractTests`) for version compatibility/capability fields and OpenAPI property presence checks.
  - Automated verification gate passes:
    - `npm run verify` in `src/clients/web/ReelRoulette.WebUI`
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Manual gate checklist/instructions prepared at `m7e-final-verification-checklist.md` for direct web-connect, refresh-status parity, and auth/reconnect continuity sign-off.

### M8a - ReelRoulette Server App Consolidation (Single Process, Single Origin)

- **Status**: ✅ Complete
- **Goal**: Consolidate runtime hosting into one user-facing `ReelRoulette Server` app (UI + core runtime + API/SSE + Web UI static serving) with no separate WebHost process and no atomic deployment switching.
- **Scope**:
  - Create the server control app as `ReelRoulette Server` (operator UI app).
  - Host all runtime responsibilities inside this app/process:
    - core domain runtime,
    - API endpoints,
    - SSE endpoint,
    - media streaming endpoints,
    - WebUI static asset serving.
  - Remove separate `WebHost` process dependency from runtime architecture.
  - Retire manifest-based atomic web deployment switching (`active-manifest`, version pointer switching) from active runtime behavior.
  - Enforce single browser-visible origin/port for WebUI + API + SSE + media.
  - Serve WebUI, API, SSE, and media streaming from the same scheme/host/port (one origin and one port).
  - Keep deployment model simple: current active web assets served directly by `ReelRoulette Server`.
- **Acceptance criteria**:
  - `ReelRoulette Server` runs as a single app/process and serves WebUI/API/SSE/media on one origin.
  - `ReelRoulette Server` exposes runtime metadata/health endpoints (`/health`, `/api/version`, `/api/capabilities`) for clients and operator diagnostics.
  - No separate WebHost process is required for normal runtime.
  - Atomic web version switching is removed from required runtime path.
  - Web client works without CORS for normal operation (same-origin by design).
  - Operator can manage runtime settings and service state from the `ReelRoulette Server` UI.
  - `ReelRoulette Server` app self-restart paths (settings changes or host failures) are graceful and deterministic (clean shutdown, no orphaned listeners/ports).
- **Verification evidence**:
  - Added new consolidated host project: `src/core/ReelRoulette.ServerApp` (single process serving API/SSE/media/static WebUI/operator UI).
  - `ReelRoulette.Server` endpoint composition now includes `GET /api/capabilities` and OpenAPI contract updates in `shared/api/openapi.yaml`.
  - Dynamic same-origin runtime config is served from server app (`/runtime-config.json`) and WebUI static content is served by the same host/port as API/SSE/media.
  - Web runtime `enabled` now controls WebUI availability only: when disabled and after restart, WebUI entry routes return `404` while API/SSE/media/operator paths remain available.
  - Web runtime settings apply follows explicit two-step semantics: apply persists settings, then operator triggers restart (`POST /control/restart`) for listen/auth/WebUI gating changes to take effect.
  - Operator UI now shows next operator URL hints after apply and runtime status content wraps/scrolls without overlap.
  - `tools/scripts/run-core.ps1` and `tools/scripts/run-core.sh` now start `ReelRoulette.ServerApp` by default.
  - `ReelRoulette.Worker` no longer supervises external `ReelRoulette.WebHost` in its startup path.
  - M7c version-switch runtime dependency is removed from required runtime behavior; `verify-web-deploy.*` now executes M8a single-origin smoke checks.
  - Operator UI path `/operator` provides status visibility, runtime settings apply (`/api/web-runtime/settings`), and restart control (`POST /control/restart`, localhost-only).

### M8b - Control-Plane UI + API for Runtime Operations

- **Status**: ✅ Complete
- **Goal**: Provide first-class control-plane operations in `ReelRoulette Server` UI and APIs for status/settings/lifecycle management.
- **Scope**:
  - Add operator UI for:
    - runtime status/health,
    - settings editing/apply,
    - stop/restart operations (with start handled by external launch flow),
    - operation result/error visibility.
  - Expose control-plane API endpoints for trusted clients/tools:
    - `get status`,
    - `get settings`,
    - `apply settings`,
    - runtime restart operations.
  - Reserve `/control/*` namespace for control-plane/admin runtime operations, separate from media/client API routes.
  - Define transport/auth/trust model for control-plane APIs (local-first, optional LAN exposure with explicit safeguards).
  - Keep control-plane access local-first (localhost always available on the shared listener); LAN exposure is opt-in via runtime settings with explicit safeguards.
  - Define deterministic operation semantics:
    - idempotent command behavior,
    - conflicting-operation handling,
    - partial-failure reporting.
- **Acceptance criteria**:
  - Control-plane UI and API both function and are documented.
  - Control-plane access is localhost-available by default on the shared listener, with LAN control access disabled unless explicitly enabled by runtime settings.
  - LAN exposure for control-plane endpoints requires explicit enablement plus pairing/auth and clear operator warnings.
  - Settings apply/restart behavior is deterministic and observable.
  - Control-plane auth/trust policy is implemented and enforced.
  - No orphan child/runtime process behavior remains in supported restart/shutdown flows.
- **Verification evidence**:
  - Added control-plane APIs under `/control/*`: `GET /control/status`, `GET/POST /control/settings`, `GET/POST /control/pair`, `POST /control/restart`, and `POST /control/stop`.
  - Added control-plane settings persistence and deterministic apply result reporting (`accepted`, `restartRequired`, `message`, `errors[]`) in core settings service.
  - Added control-plane auth/trust enforcement with localhost-available default and explicit LAN gating tied to runtime bind settings plus optional admin token auth.
  - Expanded operator UI to a responsive dark-theme layout with runtime status, lifecycle controls, incoming/outgoing API telemetry panels, and connected-client visibility.
  - Added control telemetry and connected-client status projection (`paired sessions` and `SSE subscribers`) through `/control/status`.
  - Extended OpenAPI contract and server contract tests for new control-plane endpoints/schemas.
  - Extended smoke verification (`verify-web-deploy.ps1/.sh`) to validate control-plane status/settings endpoints in the consolidated runtime flow.

### M8c - Desktop Client Thin-Client Cutover

- **Status**: ✅ Complete
- **Goal**: Convert desktop `ReelRoulette` app to strict thin-client behavior against `ReelRoulette Server`.
- **Scope**:
  - Remove remaining desktop direct runtime/process control of `ReelRoulette Server` functionality.
  - Remove remaining desktop direct authoritative JSON mutation paths for migrated domains.
  - Ensure desktop commands/queries go through shared APIs only.
  - Ensure desktop sync/projection uses API + SSE paths only.
  - Route source import (`Import Folder`) through core API and remove desktop-local import path now that refresh pipeline ownership is server-side.
  - Route duplicate detection (scan + resolve/delete) through reusable core/server APIs and remove desktop-local duplicate execution paths.
  - Route auto-tag scan/suggestion + apply through reusable core/server APIs so the same logic can be consumed by desktop/web/operator/mobile clients.
  - Keep desktop-local persistence limited to client-side UI/preferences in `desktop-settings.json`.
  - Move `last.log` ownership fully to `ReelRoulette.ServerApp`: server-owned logic writes directly to server-side `last.log`, clients send client-event logs through API, and `last.log` is overwritten/reset on ServerApp startup/restart.
  - Desktop connect UX defaults to localhost `ReelRoulette Server`; if unavailable, show clear Connect/Start guidance without hosting/supervising server runtime.
- **Acceptance criteria**:
  - Desktop is a pure API/SSE consumer for authoritative core state.
  - Desktop writes only `desktop-settings.json` for client-side UI/preferences.
  - Desktop never writes core state files (for example `library.json` and core settings files) directly.
  - Import Folder executes through core API only and does not use a desktop-local source import path.
  - Duplicate detection executes through core API only; desktop has no local authoritative duplicate scan/delete path.
  - Auto-tag scan/suggestion and apply execute through core API only; logic is reusable across clients.
  - Desktop does not write `last.log` directly; ServerApp owns `last.log` lifecycle/reset, server-originated logs are written directly by server components, and client-originated logs are ingested via API into the centralized server log.
  - Desktop no longer directly controls, hosts, or supervises `ReelRoulette Server` runtime responsibilities.
  - Desktop functionality remains stable using API/SSE-only migrated flows.
- **Verification evidence**:
  - Desktop runtime auto-start/supervision path removed (`EnsureCoreRuntimeAvailableAsync` no longer launches `run-core.ps1`) and desktop core endpoint defaults to `http://localhost:51234`.
  - Source import now executes through `POST /api/sources/import` with desktop API orchestration.
  - Duplicate detection migrated to reusable server APIs:
    - `POST /api/duplicates/scan`
    - `POST /api/duplicates/apply`
    and desktop duplicate dialogs now orchestrate through those endpoints.
  - Auto-tag scan/suggestion + apply migrated to reusable server APIs:
    - `POST /api/autotag/scan`
    - `POST /api/autotag/apply`
    and desktop auto-tag dialog now consumes API scan/apply flows.
  - Playback stats clear migrated to reusable server API:
    - `POST /api/playback/clear-stats`
    and desktop ClearPlaybackStats action now executes through API command path.
  - Client log ingestion endpoint added (`POST /api/logs/client`) and desktop local `last.log` file writes removed from app/dialog/service log call paths.
  - ServerApp now resets centralized `last.log` at startup, preserving server-owned log lifecycle ownership.
  - OpenAPI updated for M8c endpoints/schemas and WebUI generated contracts refreshed (`openapi.generated.ts`).

### M8d - Desktop Playback Policy Compromise (Local-First with API Fallback)

- **Status**: ⏳ Planned
- **Goal**: Keep desktop playback performant for local/shared-storage scenarios while preserving API-first orchestration and M9 playback-pipeline readiness.
- **Scope**:
  - Introduce desktop playback policy:
    - local playback first when the selected media path is accessible on the desktop machine,
    - automatic API media playback fallback when local path access fails.
  - Add desktop setting `ForceApiPlayback` (boolean, default `false`):
    - when enabled, desktop always uses API playback even if local file access is available.
  - Preserve strict desktop thin-client boundaries for non-playback domains:
    - desktop may read/write only `desktop-settings.json`,
    - desktop may read local media files for playback/accessibility checks only,
    - no reintroduction of local authoritative state reads/writes (library/settings/log/domain mutations).
  - Keep this policy compatible with M9 incremental playback-pipeline work so API-only playback can be forced during M9 validation.
- **Acceptance criteria**:
  - Desktop playback selection is deterministic:
    - uses local playback when file path is locally accessible and `ForceApiPlayback=false`,
    - otherwise uses API media playback path.
  - `ForceApiPlayback` is persisted in desktop settings, defaults to `false`, and is respected across restarts.
  - Desktop running on LAN clients can still play local files from shared/NAS mappings when accessible, with seamless API fallback when not accessible.
  - Outside allowed exceptions (desktop settings + media-read playback), no additional local file access is introduced in desktop app.
  - M8c API-first/thin-client guarantees remain intact for source import, duplicates, auto-tag, playback-stats clear, and logging ownership.

### M8e - WebUI and Mobile Thin-Client Contract Standardization

- **Status**: ⏳ Planned
- **Goal**: Make WebUI and future mobile clients consume the same stable API contracts from `ReelRoulette Server`.
- **Scope**:
  - Standardize client-facing API contracts/capabilities for desktop/web/mobile parity.
  - Ensure WebUI uses the same API semantics as desktop for migrated behaviors.
  - Scope boundary: playback-session pipeline contracts/capabilities are owned by `M9a` and are out of scope for `M8e`.
  - Define session/reconnect rules on the shared contract surface:
    - persistent per-device `clientId`,
    - optional `sessionId` for future shared-session features,
    - SSE reconnect behavior with missed-revision recovery (replay when available, otherwise authoritative state refetch).
  - Define mobile-ready auth expectations (pairing/session continuity, reconnect continuity) using the same server contracts.
  - Keep client responsibilities strictly orchestration/render (no duplicated domain logic).
- **Acceptance criteria**:
  - WebUI and desktop are behaviorally aligned via shared server APIs.
  - Session/reconnect rules (`clientId`, optional `sessionId`, SSE missed-revision recovery) are documented and validated in client/server behavior.
  - Mobile bootstrap path is contract-ready with no new domain-logic duplication in clients and with documented auth/reconnect expectations.
  - Version/capability compatibility expectations are documented for client evolution.

### M8f - Hardening, Packaging, and Release Readiness

- **Status**: ⏳ Planned
- **Goal**: Finalize reliability, packaging, and migration cleanup for the new server-thin-client architecture.
- **Scope**:
  - Add/expand integration tests for API/SSE/runtime transitions and refresh pipeline behavior.
  - Complete migration cleanup of temporary compatibility paths.
  - Finalize packaging/distribution for:
    - `ReelRoulette Server` app,
    - thin desktop client,
    - WebUI assets served by server.
  - Produce migration/upgrade playbook and release-readiness checklist.
- **Acceptance criteria**:
  - Stable multi-client operation (desktop + web minimum) against `ReelRoulette Server`.
  - No critical cross-client state divergence.
  - If `ReelRoulette Server` crashes or is unavailable, thin clients show friendly reconnect/start guidance and recover without state corruption.
  - Core JSON persistence uses atomic write semantics (write temp then replace) and is resilient to partial-write failures.
  - Web assets are served with cache-correct behavior (hashed filenames/cache-busting) to prevent stale UI after updates.
  - Full regression suite is part of default CI `dotnet test` gate and remains green.
  - Migration and upgrade documentation is complete and actionable.

### M9 - Plex-Style Playback Pipeline (Incremental)

- **Status**: ⏳ Planned
- **Goal**: Deliver server-authoritative, Plex-style playback incrementally while preserving the M8d desktop compromise baseline (local-first playback with API fallback and optional forced API playback).
- **Scope**:
  - Split playback migration into sub-milestones (`M9a`-`M9g`) to reduce blast radius and keep each slice shippable.
  - Keep execution sequencing strict: complete M8 stabilization before starting M9 implementation.
  - Preserve thin-client boundaries while introducing direct/remux/transcode playback decisions in server.
  - Maintain desktop local-first + API-fallback behavior during migration, with `ForceApiPlayback` available for deterministic API-path validation.
  - Preserve seamless looping behavior across playback paths:
    - no audible/visual gap during loop transitions,
    - do not increment playback stats on each loop iteration (retain current behavior).
- **Acceptance criteria**:
  - Each sub-milestone (`M9a`-`M9g`) is independently verifiable and shippable.
  - No non-approved local authority is introduced beyond M8d compromise boundaries.
  - Server playback-session contract is authoritative for API playback paths across desktop and WebUI.
  - Seamless looping remains parity-safe: loop transitions remain gapless and loop iterations do not inflate playback stats.

#### M9a - Playback Session Contracts and Capability Surface

- **Status**: ⏳ Planned
- **Goal**: Establish contract-first playback-session APIs and capability signaling.
- **Scope**:
  - Define OpenAPI contracts for playback-session create/read and stream URL contracts.
  - Add server capability markers for playback-session and transcode support in `/api/version`.
  - Regenerate/refresh generated client contracts used by desktop and WebUI.
- **Acceptance criteria**:
  - OpenAPI includes playback-session surfaces and validates.
  - Generated desktop/web client contracts are in sync with OpenAPI.
  - Version/capability checks can detect missing playback features deterministically.

#### M9b - Server Playback Decision Engine

- **Status**: ⏳ Planned
- **Goal**: Make server the sole decision point for direct/remux/transcode mode selection.
- **Scope**:
  - Implement playback-session decision service using media probe metadata and client capability hints.
  - Add probe-cache strategy keyed by file path + mtime to avoid repeated ffprobe cost.
  - Decision output includes:
    - playback mode (`direct`/`remux`/`transcode`),
    - delivery type (`progressive` or `hls-fmp4`),
    - explicit decision reason diagnostics for troubleshooting.
- **Acceptance criteria**:
  - Server deterministically selects `direct`, `remux/transmux`, or `transcode` for each session request.
  - Decision outputs are stable/repeatable for identical inputs.
  - Session responses include delivery type (`progressive` or `hls-fmp4`) and actionable reason fields.

#### M9c - Direct-Stream Session URL Baseline

- **Status**: ⏳ Planned
- **Goal**: Ship direct-stream playback-session URL path first as the initial playback foundation.
- **Scope**:
  - Implement direct-stream session URL issuance and guarded token/session mapping.
  - Add session TTL lifecycle cleanup for direct-stream sessions.
- **Acceptance criteria**:
  - Direct-stream playback-session URLs are issued/validated deterministically.
  - Session token/session mapping is guarded against invalid/expired use.
  - Direct-stream sessions are cleaned up reliably after TTL expiry.

#### M9d - Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline)

- **Status**: ⏳ Planned
- **Goal**: Add resilient compatibility streaming for unsupported formats and long-form playback.
- **Scope**:
  - Implement remux/transmux and transcode orchestration using ffmpeg.
  - Segmented streaming uses **HLS with fMP4 segments** as the single baseline profile.
  - Add lifecycle cleanup for ffmpeg workers and temporary segment/transcode artifacts.
- **Acceptance criteria**:
  - When API playback is selected, incompatible media is served through remux/transcode pipeline (no client-side format workarounds).
  - Segmented streaming baseline is explicitly HLS with fMP4 segments and is validated in playback paths.
  - No orphan ffmpeg processes or segment/transcode artifacts remain after session expiry or runtime shutdown.

#### M9e - Desktop Thin-Client Playback Cutover

- **Status**: ⏳ Planned
- **Goal**: Integrate desktop with playback-session APIs while preserving local-first performance semantics from M8d.
- **Scope**:
  - Add playback-session orchestration path for desktop API playback mode.
  - Keep local-first playback behavior for locally accessible media paths when `ForceApiPlayback=false`.
  - Define "locally accessible" deterministically:
    - file exists at expected path,
    - desktop has read access,
    - path is not a server-issued token/virtual playback path,
    - quick open-read preflight succeeds.
  - Ensure automatic fallback to API playback when local path is inaccessible.
  - Ensure `ForceApiPlayback=true` always routes desktop through API playback path (for M9 validation and advanced-user preference).
  - Desktop loop parity requirement:
    - toggling loop must not reload media,
    - loop transitions remain gapless,
    - loop iterations do not increment playback stats (same playback session semantics).
  - Preserve reconnect/status UX with deterministic behavior across local/API path selection.
- **Acceptance criteria**:
  - Desktop path selection is deterministic:
    - local playback when locally accessible and `ForceApiPlayback=false`,
    - API playback when local path is inaccessible or `ForceApiPlayback=true`.
  - Desktop API playback mode uses server playback-session contract successfully.
  - Outside allowed M8d exceptions (`desktop-settings.json`, media-read for playback), no new local file authority paths are introduced.
  - Desktop looping parity is preserved: loop toggling/iteration semantics remain gapless without per-loop stat increments.
  - Disconnect/reconnect behavior remains user-friendly and deterministic.

#### M9f - WebUI Playback Cutover and Format Resilience

- **Status**: ⏳ Planned
- **Goal**: Align WebUI playback with server playback-session contract and robust format handling, while preserving parity with desktop API playback mode.
- **Scope**:
  - Route WebUI playback startup through playback-session API flow.
  - Prefer direct playback when supported; fallback to HLS with fMP4 segmented/transcoded stream path when needed.
  - Preserve current WebUI seamless loop behavior for both progressive and HLS playback paths after cutover.
  - Validate long-form behavior for buffering, seek, reconnect, and format compatibility edge cases.
- **Acceptance criteria**:
  - WebUI uses server-issued playback sessions for playback start.
  - Format incompatibilities are handled by server pipeline path rather than client failure/local workaround.
  - Movie-length playback reliability issues are resolved for supported validation corpus.
  - Looping parity is preserved: WebUI behavior remains unchanged across progressive and HLS playback paths.

#### M9g - Hardening, Operations, and Final Verification

- **Status**: ⏳ Planned
- **Goal**: Stabilize playback pipeline for multi-client operation and operational visibility.
- **Scope**:
  - Add concurrency/backpressure controls (max concurrent transcodes + queueing policy).
  - Add operator diagnostics for active sessions, mode decisions, and failure reasons.
  - Execute full automated/manual verification matrix and finalize docs/tracking updates for M9.
- **Acceptance criteria**:
  - Multi-client playback remains stable under constrained transcode capacity.
  - Operator-facing diagnostics are sufficient to troubleshoot playback failures.
  - Automated gates and manual playback matrix pass before M9 sign-off.
  - After server shutdown, no ffmpeg workers remain, and temporary playback/transcode directories are cleaned or explicitly TTL-managed.

### M10 - Android Client Bootstrap

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
