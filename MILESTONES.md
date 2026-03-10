# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Document Purpose

Use this file for:

- milestone status (⏳ Planned | 🚧 In Progress | ✅ Complete),
- scope and acceptance criteria,
- verification evidence and explicit deferrals.

Do not use this file for detailed architecture explanation or current capability inventory.

## Ownership Boundaries

- `MILESTONES.md`: roadmap, milestone scope, acceptance gates, verification evidence.
- `CONTEXT.md`: current implemented capabilities across server/desktop/web/operator.
- `AGENTS.md`: agent workflow, boundaries, and doc-discipline rules.
- `docs/domain-inventory.md`: ownership-first implementation surface map.
- `README.md` + `docs/dev-setup.md`: run/setup/verify instructions.
- `docs/api.md` + `shared/api/openapi.yaml`: API behavior and contract source of truth.

## Maintenance Rules

- Keep entries **current-state accurate**: update statuses and evidence as work progresses.
- Keep scope locked to milestone intent; record out-of-scope items as explicit deferrals.
- When a milestone is completed, move it to `## Completed Milestones` as-is: keep all existing scope/acceptance/evidence detail unchanged, update only status to complete, and preserve newest completions first.
- Keep acceptance criteria testable and outcome-focused (avoid implementation-narrative bloat).
- Keep verification evidence concrete:
  - commands/checks run,
  - artifacts/docs updated,
  - waivers/deferrals explicitly called out.
- Avoid duplicating architecture/runtime detail already owned by `CONTEXT.md` and docs under `docs/`.
- Prefer referencing owning docs instead of copying long explanatory sections into this file.
- Keep historical entries intact except for final-state correction of inaccurate facts.
- If script names/paths/contracts change, update milestone references to avoid stale guidance.

## Milestone Template

### Mx - {Milestone Title}

- **Status**: ⏳ Planned | 🚧 In Progress | ✅ Complete
- **Goal**: {one concise outcome statement}
- **Scope**:
  - {key deliverable 1}
  - {key deliverable 2}
  - {key deliverable 3}
- **Acceptance criteria**:
  - {testable outcome 1}
  - {testable outcome 2}
  - {testable outcome 3}
- **Verification evidence**:
  - {automated checks run}
  - {manual checks/evidence notes}
  - {docs/artifacts updated}
- **Deferrals / Follow-ups**:
  - {deferred item -> target milestone}

---

## Milestone Board

### M8g - Unified last.log Pipeline (Server + Client Logging Consolidation)

- **Status**: ⏳ Planned
- **Goal**: Make `last.log` the single reliable diagnostics stream for server runtime logs plus desktop/web client logs, with clear source/time/level metadata and operator-friendly filtering.
- **Scope**:
  - Define and enforce a canonical `last.log` entry shape (timestamp, level, sourceType/source, message, optional client/session/device metadata).
  - Add server-side centralized log writer service used by:
    - server runtime logging pipeline (`ILogger` sink/provider),
    - client log ingestion endpoint (`POST /api/logs/client`).
  - Ensure all server runtime logs are written to `last.log` (not only client-ingested logs).
  - Extend client log ingestion contracts to support correlation metadata:
    - `clientType`, `clientId`, `sessionId`, `deviceName`, optional structured `meta`.
  - Ensure desktop logging relay always sends stable client/session metadata with source labels.
  - Add WebUI log relay to `POST /api/logs/client` for startup/auth/SSE/error and major UX failure paths.
  - Keep logging best-effort and non-blocking for clients (no user-facing failures on log-post errors).
  - Add log safety controls:
    - sensitive-value redaction (tokens/cookies/secrets),
    - bounded retention/rotation policy (or explicit documented reset policy with guardrails).
  - Improve Operator `Server Logs` panel usability for unified stream triage:
    - reliable refresh behavior,
    - source/level search/filter ergonomics for mixed server+client entries.
- **Acceptance criteria**:
  - `last.log` consistently contains both server runtime logs and desktop/web client logs during normal operation.
  - Each entry is clearly attributable by source and level with readable timestamps.
  - Desktop and WebUI both emit meaningful client logs to `/api/logs/client` with identity/session context.
  - Operator `Server Logs` section shows actionable combined diagnostics without requiring shell access.
  - Sensitive values are not written to `last.log`.
  - Log lifecycle behavior (reset and/or rotation) is deterministic and documented.
  - Automated tests cover server sink behavior, ingestion mapping, and redaction/retention expectations.
- **Verification evidence**:
  - Server logging sink/provider wired into centralized `last.log` writer.
  - `/api/logs/client` ingestion writes through same centralized path with source metadata.
  - Desktop + WebUI log emission paths verified with identity/session fields.
  - Operator log panel validates mixed-source visibility and filtering behavior.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification captures:
    - server lifecycle logs,
    - desktop action/error logs,
    - web/mobile SSE/auth/error logs,
    - source-separated evidence snippets in `docs/testing-guide.md`.

### M8h - UX/UI Polish Follow-up (Post-M8f Reliability Closeout)

- **Status**: ⏳ Planned
- **Goal**: Apply UX polish improvements deferred from M8f reliability closeout without changing core API-first ownership boundaries.
- **Scope**:
  - Improve desktop tag-editor apply responsiveness (close/progress UX should feel immediate while apply completes).
  - Expand WebUI refresh-status projection detail parity with desktop stage/progress visibility.
  - Improve desktop duplicate-review UX in the duplicates dialog:
    - for each duplicate group, render file thumbnails inline above each corresponding file info row for quick visual confirmation,
    - target display order per group:
      1. `x files share fingerprint...` header,
      2. keep-selection dropdown,
      3. file 1 thumbnail,
      4. file 1 info row,
      5. file 2 thumbnail,
      6. file 2 info row,
      7. continue for all files in that group.
- **Acceptance criteria**:
  - Tag apply interactions feel immediate and do not block UI unexpectedly.
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop.
  - Duplicate groups in desktop duplicates dialog show per-file thumbnails inline in the defined order, enabling quick visual validation before delete/apply actions.
  - No regressions to M8f reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).

### M9a - Playback Session Contracts and Capability Surface

- **Status**: ⏳ Planned
- **Goal**: Establish contract-first playback-session APIs and capability signaling.
- **Scope**:
  - Milestone-sequencing guardrails for the M9 series:
    - complete M8 stabilization before starting M9 implementation,
    - keep each `M9*` slice independently verifiable and shippable,
    - preserve thin-client boundaries while introducing server-side playback decisions.
  - Define OpenAPI contracts for playback-session create/read and stream URL contracts.
  - Add server capability markers for playback-session and transcode support in `/api/version`.
  - Regenerate/refresh generated client contracts used by desktop and WebUI.
- **Acceptance criteria**:
  - `M9a` establishes the contract/capability baseline used by subsequent `M9*` slices.
  - OpenAPI includes playback-session surfaces and validates.
  - Generated desktop/web client contracts are in sync with OpenAPI.
  - Version/capability checks can detect missing playback features deterministically.

### M9b - Server Playback Decision Engine

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

### M9c - Direct-Stream Session URL Baseline

- **Status**: ⏳ Planned
- **Goal**: Ship direct-stream playback-session URL path first as the initial playback foundation.
- **Scope**:
  - Implement direct-stream session URL issuance and guarded token/session mapping.
  - Add session TTL lifecycle cleanup for direct-stream sessions.
- **Acceptance criteria**:
  - Direct-stream playback-session URLs are issued/validated deterministically.
  - Session token/session mapping is guarded against invalid/expired use.
  - Direct-stream sessions are cleaned up reliably after TTL expiry.

### M9d - Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline)

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

### M9e - Desktop Thin-Client Playback Cutover

- **Status**: ⏳ Planned
- **Goal**: Integrate desktop with playback-session APIs while preserving local-first performance semantics from M8d.
- **Scope**:
  - Preserve the M8d compromise baseline through M9:
    - local-first playback with automatic API fallback,
    - optional `ForceApiPlayback` for deterministic API-path validation.
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

### M9f - WebUI Playback Cutover and Format Resilience

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

### M9g - Resume Position and Session Continuity

- **Status**: ⏳ Planned
- **Goal**: Deliver server-authoritative remember-position behavior across desktop and WebUI playback paths.
- **Scope**:
  - Add server-owned resume-position contract and persistence for playback sessions.
  - Record playback position updates with throttled writes and deterministic completion/clear rules.
  - Provide resume-position query/clear APIs so desktop and WebUI can present consistent resume UX.
  - Add policy settings for resume behavior (enable/disable, threshold windows, retention/auto-clear) through server-authoritative settings flows.
  - Preserve looping semantics while tracking resume state:
    - loop iterations do not inflate playback stats,
    - looping does not create false resume checkpoints.
- **Acceptance criteria**:
  - Resume position persists across reconnects/restarts through server state (not client-local authoritative persistence).
  - Desktop and WebUI resume behavior is consistent for API playback paths.
  - Clear-resume operations are deterministic and observable.
  - Resume policy settings are documented, persisted, and enforced by server.

### M9h - Hardening, Operations, and Final Verification

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

### M11 - File Metadata Sync and Extended Metadata

- **Status**: ⏳ Planned
- **Goal**: Add server-authoritative metadata sync so tags/metadata can be imported from and exported to media files, while preserving thin-client boundaries and cross-client parity.
- **Scope**:
  - Implement metadata sync in core/server domain services (not client-local mutation paths):
    - import tags from supported file formats during import/refresh,
    - export tags/metadata back to file metadata on demand (and optional auto-export policy),
    - keep merge/conflict policy explicit and configurable.
  - Introduce metadata sync settings through server-authoritative settings APIs:
    - auto-import enable/disable,
    - auto-export enable/disable,
    - merge strategy policy,
    - write-warning/confirmation behavior.
  - Add extended metadata support in core model and APIs:
    - genre, year, artist/creator, title, album/series, comment, rating.
  - Expose metadata in client projections and filtering surfaces:
    - library presentation fields (sortable where applicable),
    - filter/query support for selected metadata dimensions,
    - batch metadata edit support through API commands.
  - Add operational safety:
    - unsupported format handling,
    - read-only/locked/network-path failure handling,
    - clear result summaries and structured logging.
- **Acceptance criteria**:
  - Metadata import/export executes through core/server APIs/services only (no client-authoritative metadata file mutation path).
  - Supported format matrix and field mappings are documented and covered by verification.
  - Merge policy behavior is deterministic and validated.
  - Extended metadata persists through server-owned state and is visible/usable in desktop and WebUI without behavior divergence.
  - Batch metadata operations work through API contracts and respect conflict/error policies.
  - Error reporting is actionable (success/failure counts + reasons), and logging follows centralized server logging ownership.

### M12 - Customizable Keyboard Shortcuts (Desktop)

- **Status**: ⏳ Planned
- **Goal**: Enable user-configurable desktop keyboard shortcuts while preserving reliable input handling and existing default behavior.
- **Scope**:
  - Add keyboard-shortcuts configuration UX in desktop client:
    - open shortcuts editor dialog from menu,
    - list actions with current bindings,
    - capture/rebind keys including modifier combinations (`Ctrl`, `Shift`, `Alt`),
    - detect conflicts and require explicit resolution,
    - reset selected/all bindings to defaults.
  - Add read-only shortcut reference entry in Help menu.
  - Persist shortcut bindings in desktop client preferences (`desktop-settings.json`) only.
  - Refactor desktop key-dispatch path to resolve actions from configurable binding map instead of hardcoded key checks.
  - Define reserved/system key policy and menu-accelerator conflict policy.
- **Acceptance criteria**:
  - Users can rebind supported actions and changes persist across restarts.
  - Conflict detection prevents ambiguous active bindings.
  - Default shortcut set is available and can be restored deterministically.
  - System-reserved shortcuts are protected from unsafe overrides.
  - Existing playback/control workflows remain stable with both default and customized bindings.

### M13 - Playback Analytics and Visualization

- **Status**: ⏳ Planned
- **Goal**: Provide server-authoritative playback analytics with rich client-side visualization for desktop/WebUI parity.
- **Scope**:
  - Add server-side analytics query surfaces over playback history/library stats:
    - time-series aggregates (day/week/month),
    - top-played items,
    - favorites ratio and completion-oriented aggregates,
    - distribution metrics (duration/source/time-of-day),
    - tag usage/play weighting aggregates.
  - Support analytics query parameters:
    - date ranges (`7d`, `30d`, `90d`, `1y`, `all`),
    - optional grouping/bucketing controls.
  - Add client-side analytics UI surfaces (desktop first, WebUI parity path):
    - chart views and summary metrics panel,
    - date-range selector,
    - export support (chart image + CSV/JSON data exports).
  - Keep role boundaries explicit:
    - server computes/owns analytics data contracts,
    - clients render/visualize only (no duplicated analytics business logic).
- **Acceptance criteria**:
  - Analytics data is produced via server APIs only and is consistent across clients for the same query window.
  - Desktop analytics view renders required chart/summary categories from server query results.
  - Export outputs (image/data) are generated deterministically from current visualization/query state.
  - Date-range filters produce correct aggregate differences and are validated by tests.
  - Client visualizations do not introduce local authoritative analytics calculations that diverge from server semantics.

### M14 - Desktop Confirmation Dialog Standardization

- **Status**: ⏳ Planned
- **Goal**: Reduce desktop UI duplication and improve consistency by standardizing confirmation dialogs behind a reusable component.
- **Scope**:
  - Introduce a reusable `ConfirmDialog` component for desktop UI with configurable:
    - title,
    - message/body content,
    - button sets (`OK/Cancel`, `Yes/No`, `Remove/Cancel`, etc.),
    - default/cancel action behavior.
  - Refactor existing desktop confirmation flows to use the shared component incrementally.
  - Preserve current UX semantics (wording, destructive-action emphasis, default button intent) unless explicitly changed.
  - Keep compatibility-safe rollout:
    - allow legacy dialog implementations to coexist during migration,
    - remove obsolete dialog variants only after parity validation.
- **Acceptance criteria**:
  - New confirmation dialog component supports required button/action patterns used by current desktop flows.
  - Migrated dialog flows preserve existing behavior and outcomes.
  - Duplicate confirmation-dialog code paths are reduced with no functional regressions.
  - Desktop UI tests/manual checks confirm parity for destructive and non-destructive confirmation actions.

### M15 - Advanced Runtime and Cache Controls

- **Status**: ⏳ Planned
- **Goal**: Provide controlled, server-authoritative cache/performance tuning for varied hardware and storage environments, with safe defaults and clear operator observability.
- **Scope**:
  - Define server-owned advanced settings domains:
    - cache policies (thumbnail/metadata/preview where applicable),
    - concurrency limits (ffmpeg/ffprobe/transcode/thumbnail workers),
    - network-storage tuning (timeouts/retries/check cadence),
    - runtime throttling policies (background/battery/priority where supported).
  - Expose settings via server APIs and apply semantics consistent with runtime policy model:
    - immediate-apply vs restart-required classification,
    - validation/normalization and deterministic apply-result reporting.
  - Add management UX surfaces (operator first; desktop/web parity where appropriate):
    - advanced settings section,
    - current cache stats and last cleanup time,
    - explicit cleanup actions (targeted + clear-all with confirmation),
    - reset-to-defaults action.
  - Add presets/profile model:
    - `LowEnd`, `Balanced` (default), `HighPerformance`, `Custom`.
  - Keep thin-client boundaries:
    - clients do not directly mutate authoritative runtime/cache state outside server APIs.
- **Acceptance criteria**:
  - Advanced settings are persisted and enforced by server-owned configuration/state flows.
  - Safe defaults are preserved; invalid values are rejected or normalized with explicit feedback.
  - Cache cleanup operations are observable and report deterministic outcomes (freed space/counts/failures).
  - Concurrency/throttling settings measurably affect runtime behavior without regressions.
  - Desktop/WebUI/operator surfaces show consistent effective settings and apply results.
  - No client-local authoritative settings drift is introduced.

### M16a - Photo Face Detection Baseline

- **Status**: ⏳ Planned
- **Goal**: Deliver reliable face detection for photos with practical UX and performance controls.
- **Scope**:
  - Establish the face-analysis baseline in core/server:
    - detection job orchestration,
    - result persistence/caching,
    - API query/projection surfaces for clients.
  - Keep clients as orchestration/render layers:
    - no client-local detection authority,
    - clients display overlays/results and invoke server jobs/queries.
  - This milestone is the first phase of the M16 rollout, with video expansion in `M16b`.
  - Select and integrate a .NET-compatible detection stack (OpenCV/ML.NET/other) for photo inputs.
  - Add detection execution modes:
    - import-time and/or on-demand scan jobs.
  - Persist detection outputs per item:
    - bounding boxes, confidence, metadata versioning.
  - Add client UX surfaces:
    - optional bounding box overlays in preview,
    - face-aware filter/search entry points where applicable.
  - Add operational controls:
    - enable/disable setting (default off),
    - async/background execution,
    - cached result reuse and invalidation strategy.
- **Acceptance criteria**:
  - Face detection outputs are produced and owned by server-side workflows.
  - Desktop/WebUI consume face metadata through APIs without local business-logic duplication.
  - Photo detection runs asynchronously and does not block core playback/import UX.
  - Detection results are queryable and consistently projected to clients.
  - Overlay/filter behavior works for detected photo faces with deterministic result semantics.
  - Performance impact is bounded and documented.

### M16b - Video Face Detection Expansion

- **Status**: ⏳ Planned
- **Goal**: Extend face detection to video with sampling/throughput strategies suitable for long-form media.
- **Scope**:
  - This milestone is the second phase of the M16 rollout and extends the server-authoritative model established in `M16a`.
  - Define video frame-sampling strategy (interval/keyframe/scene-aware options as needed).
  - Run detection as background jobs with queueing/concurrency controls.
  - Persist timeline-aware face detection outputs for video items.
  - Add client UX surfaces for video results:
    - timeline/segment-aware overlays or markers,
    - filter/search hooks aligned with photo semantics where practical.
  - Optional extension path:
    - identity/recognition layer only after detection baseline stability.
- **Acceptance criteria**:
  - Video detection pipeline runs within configured resource limits and does not destabilize playback/transcode workloads.
  - Results are available through server APIs and align with photo detection contract shape where possible.
  - Long-duration media processing is resumable/retry-safe and operationally observable.
  - Recognition/identity features remain explicitly out of scope unless separately approved.

### M17a - Linux Runtime Baseline (Server + Desktop)

- **Status**: ⏳ Planned
- **Goal**: Establish a supported Linux runtime baseline for both `ReelRoulette Server` and desktop client with deterministic startup/playback behavior.
- **Scope**:
  - Define and document initial support target:
    - `linux-x64` first (single baseline distro family/version for sign-off).
  - Validate consolidated server runtime on Linux:
    - API/SSE/media/WebUI/Operator surfaces start and respond.
  - Validate desktop runtime on Linux:
    - app launch, connect to server, random/manual playback, and control interactions.
  - Validate native dependency expectations on Linux:
    - ffprobe/ffmpeg availability,
    - LibVLC runtime dependency behavior and startup prerequisites.
  - Keep existing API-first/thin-client ownership boundaries unchanged.
- **Acceptance criteria**:
  - Server starts on Linux and serves `/health`, `/api/version`, `/api/events`, `/api/media/{idOrToken}`, `/operator`.
  - Desktop launches on Linux and completes core playback/control workflows against Linux server runtime.
  - Linux runtime dependency prerequisites are explicit and reproducible.
  - No new client-local authoritative mutation paths are introduced.
- **Verification evidence**:
  - Linux runtime smoke checks pass for server surfaces and desktop connect/playback flows.
  - Automated gate pass includes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - Linux run/smoke command evidence for server + desktop startup.

### M17b - Linux Packaging (Server + Desktop)

- **Status**: ⏳ Planned
- **Goal**: Produce distributable Linux artifacts for both server and desktop using repo-owned packaging scripts.
- **Scope**:
  - Add Linux packaging scripts (portable first):
    - server portable package (`tar.gz`),
    - desktop portable package (`tar.gz`).
  - Ensure server Linux package includes built WebUI assets in `wwwroot`.
  - Ensure packaging preserves version metadata and release naming conventions.
  - Ensure executable bits and launch scripts are correctly staged for Linux artifacts.
  - Keep Windows packaging behavior unchanged.
- **Acceptance criteria**:
  - Linux server and desktop portable artifacts are produced deterministically by scripts.
  - Server package includes API/SSE/media/WebUI/Operator runtime assets.
  - Artifact naming/version metadata align with release version.
  - Packaged apps launch successfully on the supported Linux baseline.
- **Verification evidence**:
  - Packaging scripts produce expected Linux artifacts under `artifacts/packages/`.
  - Install/run smoke checks from packaged artifacts pass on Linux baseline host.
  - `docs/testing-guide.md` packaging checklist includes Linux package checks.

### M17c - CI Linux Distribution Gates

- **Status**: ⏳ Planned
- **Goal**: Add Linux build/test/package verification to CI so Linux distribution quality is continuously enforced.
- **Scope**:
  - Add Linux CI jobs for build/test/web verify parity.
  - Add Linux packaging jobs for server + desktop artifact generation.
  - Add Linux smoke checks for packaged runtime startup and key endpoint reachability.
  - Publish Linux artifacts from CI packaging workflow.
- **Acceptance criteria**:
  - CI runs Linux build/test/web verify successfully on default branch/PR paths.
  - Linux package workflow produces downloadable server + desktop artifacts.
  - Linux smoke checks fail deterministically on runtime/package regressions.
  - Windows CI/package gates remain green and unchanged in intent.
- **Verification evidence**:
  - Workflow files include Linux jobs and artifact upload steps.
  - CI run evidence shows passing Linux gates and generated artifacts.

### M17d - Linux Documentation and Operator Runbook

- **Status**: ⏳ Planned
- **Goal**: Make Linux setup, packaging, and troubleshooting workflows first-class and self-serve for contributors/operators.
- **Scope**:
  - Update `README.md` with Linux run/package command paths.
  - Update `docs/dev-setup.md` with Linux prerequisites, runtime notes, and packaging flow.
  - Update `docs/testing-guide.md` with Linux-specific validation checklist entries.
  - Update `docs/domain-inventory.md` to include Linux packaging/runtime surfaces.
  - Add Linux troubleshooting guidance:
    - native dependency resolution,
    - permissions/executable-bit issues,
    - display/audio/runtime edge cases.
- **Acceptance criteria**:
  - Linux setup and packaging instructions are complete and executable without ad-hoc tribal knowledge.
  - Testing guide includes Linux validation paths for server + desktop distribution.
  - Domain inventory reflects Linux ownership/tooling surfaces accurately.
- **Verification evidence**:
  - Doc set updates merged and internally consistent with scripts/workflows.
  - Manual dry-run of documented Linux commands succeeds on baseline host.

### M17e - Linux Release Readiness and Sign-off

- **Status**: ⏳ Planned
- **Goal**: Complete release-quality Linux validation for server + desktop and capture final evidence for sign-off.
- **Scope**:
  - Execute full automated + manual Linux validation matrix.
  - Validate server/web/desktop parity on migrated API/SSE flows.
  - Validate packaged artifact install/run behavior end-to-end.
  - Capture evidence and finalize release-tracking docs.
- **Acceptance criteria**:
  - Linux automated gates pass (build/test/web verify/package/smoke).
  - Linux manual validation checklist is completed with PASS/FAIL evidence.
  - No critical Linux-only runtime regressions remain for server or desktop.
  - Release tracking docs are synchronized to final Linux-ready state.
- **Verification evidence**:
  - Completed Linux checklist entries in `docs/testing-guide.md`.
  - CI evidence for Linux packaging + smoke checks.
  - Updated `MILESTONES.md`, `CHANGELOG.md`, and `COMMIT_MESSAGE.txt` entries reflecting final M17 state.

---

## Completed Milestones

Latest completions first:

### M8f - Hardening, Packaging, and Release Readiness

- **Status**: ✅ Complete
- **Goal**: Finalize reliability, packaging, and migration cleanup for the new server-thin-client architecture.
- **Scope**:
  - Add/expand integration tests for API/SSE/runtime transitions and refresh pipeline behavior.
  - Complete migration cleanup of temporary compatibility paths.
  - Finalize packaging/distribution for:
    - `ReelRoulette Server` app,
    - thin desktop client,
    - WebUI assets served by server.
  - Produce migration/upgrade playbook and release-readiness checklist.
  - Add an **Operator Testing Suite** to `/operator` so desktop/web/server validation can be run from UI without ad-hoc shell workflows.
  - Add **connected client/session visibility** in Operator UI (client/session identity and related diagnostics in appropriate sections).
  - Add a dedicated **Server Logs** section in Operator UI for `last.log` with practical triage features.
  - Add **Testing Mode** gate for test/fault controls:
    - testing controls are available only when Testing Mode is enabled,
    - existing control admin auth mode remains authoritative:
      - if admin auth is `Off`, no auth required,
      - if admin auth requires auth, testing actions require auth.
  - Add safe, operator-driven fault/testing scenarios for client UX/error-handling validation, including:
    - API version/capability mismatch simulation,
    - client disconnect/reconnect behavior checks,
    - SSE replay/resync-required recovery checks,
    - missing/invalid media and related API-error path checks.
  - Produce full repo-wide manual testing artifacts linked to Operator test sections:
    - `docs/testing-guide.md` (workflow + inline checklist + PASS/FAIL evidence capture).
  - Include Operator-assisted evidence capture quality-of-life features:
    - per-scenario PASS/FAIL + note + timestamp recording,
    - copy/export test evidence bundle (status + relevant log snippets),
    - per-scenario reset/cleanup actions for repeatable reruns.
- **Acceptance criteria**:
  - Stable multi-client operation (desktop + web minimum) against `ReelRoulette Server`.
  - No critical cross-client state divergence.
  - If `ReelRoulette Server` crashes or is unavailable, thin clients show friendly reconnect/start guidance and recover without state corruption.
  - Core JSON persistence uses atomic write semantics (write temp then replace) and is resilient to partial-write failures.
  - Web assets are served with cache-correct behavior (hashed filenames/cache-busting) to prevent stale UI after updates.
  - Full regression suite is part of default CI `dotnet test` gate and remains green.
  - Migration and upgrade documentation is complete and actionable.
  - Operator UI exposes connected client/session identity details sufficient for troubleshooting and correlation.
  - Operator UI includes a dedicated Server Logs section for `last.log` with tail/filter/search/copy-export workflows.
  - Operator Testing Suite can execute key client/server error-handling scenarios from UI when Testing Mode is enabled.
  - Testing controls obey Testing Mode and existing admin auth policy exactly.
  - Repo-wide manual testing manual/checklist is complete, actionable, and mapped to Operator test sections plus common app/server workflows.
  - End-to-end manual verification for desktop/web/server can be executed by a user without requiring ad-hoc command sequences.
- **Verification evidence (implementation + automated gate pass)**:
  - Operator/server implementation now includes:
    - connected client/session/SSE identity snapshots in `/control/status`,
    - dedicated server log endpoint (`/control/logs/server`) and Operator log workbench,
    - testing suite endpoints (`/control/testing`, `/control/testing/update`, `/control/testing/reset`) and Operator Testing Mode/fault controls.
  - Testing policy enforcement implemented:
    - scenario flags require Testing Mode ON,
    - testing actions enforce existing control admin auth mode (`Off` vs `TokenRequired`) using control auth credentials.
  - Windows packaging + CI deliverables implemented:
    - `tools/scripts/package-serverapp-win-portable.ps1`,
    - `tools/scripts/package-serverapp-win-inno.ps1`,
    - `tools/installer/ReelRoulette.ServerApp.iss`,
    - `.github/workflows/ci.yml`,
    - `.github/workflows/package-windows.yml`.
  - Manual validation artifacts added:
    - `docs/testing-guide.md`.
  - Automated verification passes on current branch:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual checklist waiver applied per user direction:
    - remaining `NOT TESTED` items in `docs/testing-guide.md` are accepted as pass/deferred for M8f closeout.
  - High/medium reliability fix slice (post-manual test feedback) is implemented:
    - duplicate scan now shows deterministic API-recovery guidance instead of silent no-op,
    - auto-tag scan now reports runtime recovery state accurately and no longer relies on a false version-only health signal,
    - desktop now enforces API/capability compatibility gates and shows reconnect/resync SSE status guidance,
    - missing-media simulation now preserves random selection and fails deterministically at media-fetch endpoints with explicit `Media not found` API errors.
    - desktop legacy locate/remove missing-file dialog flow removed to keep missing-media remediation server-authoritative.
  - Deferred to `M8h` (UX/UI polish only):
    - tag-editor apply latency/close responsiveness polish,
    - web refresh-status detail parity enhancements.

### M8e - WebUI and Mobile Thin-Client Contract Standardization

- **Status**: ✅ Complete
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
- **Verification evidence**:
  - OpenAPI contract now documents optional `sessionId` for request/event surfaces and explicit SSE identity/reconnect expectations.
  - Server DTO/contracts now accept and propagate optional `sessionId`, and `/api/version` capabilities now include `identity.sessionId`.
  - Desktop now persists stable `CoreClientId`, generates per-runtime `CoreSessionId`, and propagates both through random/playback/SSE calls with reconnect `lastEventId`.
  - WebUI (legacy + modular seams) now propagates stable `clientId` plus runtime `sessionId` through random/requery/SSE paths and enforces capability checks including `identity.sessionId`.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual verification matrix prepared for desktop+web parity checks (session continuity, reconnect replay/resync, capability-mismatch UX) and ready for operator sign-off.

### M8d - Desktop Playback Policy Compromise (Local-First with API Fallback)

- **Status**: ✅ Complete
- **Goal**: Keep desktop playback performant for local/shared-storage scenarios while preserving API-first orchestration and M9 playback-pipeline readiness.
- **Scope**:
  - Introduce desktop playback policy:
    - local playback first when the selected media path is accessible on the desktop machine,
    - automatic API media playback fallback when local path access fails.
  - Route desktop manual library-panel play through API identity orchestration:
    - resolve stable media identity (`itemId`/API-routable identity) before playback-path selection so playback stats remain API-authoritative and deterministic,
    - if manual target cannot be mapped to stable identity, surface explicit user-facing error + guidance (no silent substitute/random reroute).
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
  - Desktop manual library-panel play is deterministic and API-orchestrated:
    - manual play target is identity-resolved through API path first,
    - unmappable manual targets fail with explicit error + guidance (no implicit substitute playback path).
  - `ForceApiPlayback` is persisted in desktop settings, defaults to `false`, and is respected across restarts.
  - Desktop running on LAN clients can still play local files from shared/NAS mappings when accessible, with seamless API fallback when not accessible.
  - Outside allowed exceptions (desktop settings + media-read playback), no additional local file access is introduced in desktop app.
  - M8c API-first/thin-client guarantees remain intact for source import, duplicates, auto-tag, playback-stats clear, and logging ownership.
- **Verification evidence**:
  - Desktop manual playback entry points now resolve stable API media identity first and surface explicit guidance when a manual target cannot be mapped.
  - Desktop playback target policy now deterministically selects local playback when media is readable and `ForceApiPlayback=false`, otherwise routes playback through API media URLs.
  - `ForceApiPlayback` is persisted in desktop settings (`desktop-settings.json`), defaults to `false`, and is wired through settings load/apply/save plus settings dialog toggle UX.
  - Random playback target handling now accepts API media URLs (absolute or relative) and resolves relative API media routes against configured core base URL.
  - Playback source type is tracked (`FromPath` vs `FromLocation`) so loop-toggle media recreation and timeline navigation preserve chosen playback-path semantics.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Documentation/tracking updates are synchronized for final M8d state: `README.md`, `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `CHANGELOG.md`, `COMMIT_MESSAGE.txt`.

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

### M6b - P1 Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)

- **Status**: ✅ Complete
- **Goal**: Deliver API-backed grid/thumbnails and refresh pipeline refactor as a separate milestone.
- **Linked milestone note**: `Grid View for Library Panel with Thumbnail Generation (Unified Refresh Pipeline)` is tracked directly in this document.
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
