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
- Organize milestone sections as:
  - `## Active Milestones`: milestones currently being worked, using `M*` IDs in historical order.
  - `## Planned Milestones`: backlog candidates not yet started, using `P*` IDs in numerical order (for example base phases and lettered sub-slices).
  - `## Completed Milestones`: archive of finished milestones, newest completions first.
- Keep `## Active Milestones` updated with `Last milestone completed: Mx` so the next `M*` assignment is unambiguous.
- When promoting planned work to active work, assign the next `M*` ID at promotion time and keep planned `P*` IDs stable until then.
- When a milestone is completed, move it to `## Completed Milestones` as-is: keep existing scope/acceptance/evidence detail unchanged except final-state corrections, and preserve newest completions first.
- In milestone body content (scope/acceptance/evidence/deferrals), do not reference milestone IDs; use milestone names/descriptions (or "this milestone"/"this series") so ID reassignment does not require copy edits.
- ID references are allowed only in milestone section headers and the `Last milestone completed: Mx` tracker line.
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

### Px - {Planned Milestone Title}

- **Status**: ⏳ Planned
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

## Active Milestones

Last milestone completed: M9a

### M9b - Linux Packaging (Server + Desktop)

- **Status**: ⏳ Planned
- **Goal**: Produce distributable Linux artifacts for server and the renamed **Desktop** client using repo-owned packaging scripts.
- **Scope**:
  - Add Linux packaging scripts (portable first):
    - server portable package (`tar.gz`) including WebUI assets in `wwwroot`,
    - **Desktop** client portable package (`tar.gz`) using `desktop`-segment naming and layout aligned with post-rename project output.
  - Package runtime must support **Avalonia server tray** when a tray-capable environment is available, and **headless** fallback otherwise (same policy as baseline milestone).
  - Preserve version metadata and release naming conventions; correct executable bits and launch helpers on Linux.
  - **Windows**-OS packaging for **Desktop** deliverables: unchanged **intent**; update script paths/names if the rename moves `.csproj` or output names.
- **Acceptance criteria**:
  - Linux server and **Desktop** client portable artifacts build deterministically from scripts.
  - Server package includes API/SSE/media/WebUI/Operator assets and whatever the Avalonia tray host requires at runtime.
  - Artifact names align with **`desktop` paths** and **Desktop** branding (not legacy **`windows`** paths or **Windows**-centric client naming).
  - Packaged apps run on the supported Linux baseline in both tray-available and headless/fallback scenarios.
- **Verification evidence**:
  - Artifacts under `artifacts/packages/` (or documented equivalent).
  - Scripts and docs for producing Linux packages are landable without requiring full packaging smoke on every host; comprehensive packaged-artifact verification (tray + headless, **CachyOS** or CI-chosen Linux, plus cross-platform checklist completion) is **deferred** to **Linux Release Readiness and Sign-off**.
  - `docs/checklists/testing-checklist.md` gains Linux package checklist items when packaging lands; completing every checklist item remains deferred to **Linux Release Readiness and Sign-off** unless explicitly scoped here.
- **Deferrals / Follow-ups**:
  - Full Linux packaging smoke matrix and cross-platform checklist completion → **Linux Release Readiness and Sign-off**.

### M9c - CI Linux Distribution Gates

- **Status**: ⏳ Planned
- **Goal**: Enforce Linux build/test/package quality in CI, including the **unified Avalonia server tray** and **Desktop** client.
- **Scope**:
  - Linux jobs: `dotnet build`, `dotnet test`, `npm run verify` parity where applicable.
  - Linux packaging jobs for server + **Desktop** client; publish artifacts.
  - Smoke checks: packaged server reachability (health/version/operator); optional **headless** server boot without display.
  - Tray-related checks: when feasible, runner verifies **headless fallback**; tray-on-runner validation only where the image/session supports it (do not make CI flaky on absent status notifier).
  - **Windows** jobs remain green; adjust only for renamed **`desktop`** project paths / **Desktop** `.csproj` location.
- **Acceptance criteria**:
  - Default-branch/PR Linux pipeline passes and catches Linux-only regressions in server, **Desktop** client, and packaging.
  - Headless server startup remains deterministic in CI (no hard dependency on GUI session for green builds).
- **Verification evidence**:
  - Workflow updates with Linux matrix steps and artifact uploads.
  - Links or logs showing passing Linux gates.
  - Using CI green builds as the bar for this milestone does not replace the full manual + packaged-artifact sign-off matrix; that broader verification remains **deferred** to **Linux Release Readiness and Sign-off**.
- **Deferrals / Follow-ups**:
  - Full cross-platform manual verification and checklist completion beyond CI gates → **Linux Release Readiness and Sign-off**.

### M9d - Linux Documentation and Operator Runbook

- **Status**: ⏳ Planned
- **Goal**: First-class Linux contributor/operator docs: **Avalonia server tray**, **`desktop` paths** and **Desktop** naming, **XDG Autostart** behavior, **CachyOS** baseline, troubleshooting.
- **Scope**:
  - Update `README.md`, `docs/dev-setup.md`, `CONTEXT.md`/`docs/architecture.md`/`docs/domain-inventory.md` as needed: Linux run/package commands, **`desktop` client paths** and **Desktop** naming, ffmpeg/VLC, tray vs headless, **Launch Server on Startup** on Linux (XDG `*.desktop` autostart entry, toggle semantics, where the file lives, and how to verify or remove it manually).
  - Document **CachyOS (Arch-based)** as the primary development/sign-off distro for this series; note other distros as best-effort unless expanded later.
  - `docs/checklists/testing-checklist.md`: Linux + tray + packaging + autostart entries.
  - Troubleshooting: native deps, permissions, display/audio, missing tray/status area, **Avalonia**/LibVLC hints for Linux, autostart entry conflicts.
- **Acceptance criteria**:
  - A new contributor can build, run server (tray or headless), and run the **Desktop** client on Linux using only the docs.
  - Tray best-effort vs guaranteed core runtime is explicit; headless operator path documented; **Linux** autostart behavior is explicit and testable from the docs.
- **Verification evidence**:
  - Doc consistency with scripts/workflows and renamed paths.
  - Maintainer spot-checks while writing docs are sufficient for this milestone; formal dry-run evidence (tray-capable + headless on **CachyOS**, full checklist pass) is **deferred** to **Linux Release Readiness and Sign-off**.
- **Deferrals / Follow-ups**:
  - Formal doc validation dry-runs and exhaustive checklist completion → **Linux Release Readiness and Sign-off**.

### M9e - Linux Release Readiness and Sign-off

- **Status**: ⏳ Planned
- **Goal**: Final Linux + cross-platform tray sign-off for server and **Desktop** client distribution.
- **Scope**:
  - **Owns** the comprehensive automated + manual verification **deferred** from **Avalonia Server Tray + Linux Runtime Baseline**, **Linux Packaging (Server + Desktop)**, **CI Linux Distribution Gates**, and **Linux Documentation and Operator Runbook**: full cross-platform matrix (**Windows** + **Linux**), completed `docs/checklists/testing-checklist.md` with PASS/FAIL evidence, and packaged-artifact smokes where applicable.
  - Full automated + manual matrix on **CachyOS** (`linux-x64`): server (Avalonia tray + headless), **Desktop** client, WebUI/operator against server; include **XDG Autostart** on/off validation for **Launch Server on Startup** on **Linux**.
  - Confirm **Windows** tray parity after Avalonia port (no regression vs accepted baseline behaviors), including **Windows** autostart toggle behavior.
  - End-to-end packaged install/run; release notes and tracking updates.
- **Acceptance criteria**:
  - All automated gates green (build/test/web verify/package/smoke) for Linux and **Windows**.
  - Manual checklist complete with PASS/FAIL evidence (tray-capable vs tray-unavailable on Linux; **Linux** autostart on/off evidence).
  - No critical Linux-only regressions; **Windows** server tray and **Desktop** client behaviors accepted by spot-check matrix.
  - Tracking docs and changelog reflect **Desktop** naming (`desktop` paths) and Linux-ready state.
- **Verification evidence**:
  - Completed checklist entries in `docs/checklists/testing-checklist.md`.
  - Environment matrix (CachyOS + Windows) noted in evidence bundle.
  - CI evidence for Linux artifacts.
  - Updated `MILESTONES.md`, `CHANGELOG.md`, and `COMMIT_MESSAGE.txt` entries for final state.

### M10 - WebUI UX/UI Polish

- **Status**: 🚧 In Progress
- **Goal**: Deliver WebUI UX/UI polish and theme parity with desktop behavior without changing core API-first ownership boundaries.
- **Scope**:
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop, including parity for the consolidated refresh-complete summary (`Core refresh complete | Source | Duration | Loudness | Thumbnails`) using the same compact formatting rules as the desktop app (non-zero-only segments where applicable, `all cached` phrasing for duration/loudness no-scan cases, aligned thumbnail/source token vocabulary).
  - Add WebUI runtime theme detection (system/device dark or light mode) and apply matching theme behavior automatically.
  - Ensure WebUI styling parity with desktop for tag editor and related tag-surface visuals in both light and dark modes.
  - WebUI automatically follows device/system dark-light preference at runtime and keeps styling parity with desktop in both modes.
  - Keep WebUI tag chips visually consistent with desktop across themes:
    - chip text/icons remain white in both light and dark modes,
    - apply consistent chip drop-shadow styling matching desktop.
  - Fix WebUI tag editor category reorder behavior so move-up/move-down operations are treated as apply-worthy changes and activate apply/save affordances.
  - Update WebUI media-container controls layout to match desktop intent:
    - replace the bottom-center edit-tags control with a mute control matching desktop mute-button behavior,
    - move edit-tags action to the top-right controls cluster, positioned left of favorite.
  - Add control-only shadow treatment on the WebUI media container controls (do not dim or shadow the full media container surface).
- **Acceptance criteria**:
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop, including parity for the consolidated refresh-complete summary (`Core refresh complete | Source | Duration | Loudness | Thumbnails`) using the same compact formatting rules as the desktop app (non-zero-only segments where applicable, `all cached` phrasing for duration/loudness no-scan cases, aligned thumbnail/source token vocabulary).
  - WebUI category move-up/move-down actions in tag editor activate apply/save state and persist correctly when applied.
  - WebUI media controls include a desktop-matching mute button in the bottom-center controls position, and edit-tags is moved to top-right immediately left of favorite.
  - WebUI media-container control chrome uses control-only shadow treatment without darkening the full media container background.
  - WebUI automatically follows device/system dark-light preference at runtime and keeps styling parity with desktop in both modes.
  - WebUI tag chips preserve white text/icons with consistent drop-shadow treatment in both light and dark modes.
  - No regressions to previously completed reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).

### M11a - Structured JSONL Schema + Server Writer Foundation

- **Status**: ⏳ Planned
- **Goal**: Establish canonical JSONL `last.log` foundation with server-owned write path and deterministic lifecycle behavior.
- **Scope**:
  - Define and enforce canonical JSONL log schema (one JSON object per line) with required core fields:
    - required on every entry: `ts`, `lvl`, `svc`, `comp`, `op`, `msg`,
    - `lvl` vocabulary is fixed to lowercase values only: `trace|debug|info|warn|error|fatal`.
    - `svc` vocabulary for this structured-logging series is fixed to lowercase values only: `server|desktop|webui`; `android|ios` remain schema-reserved for later milestones and are not emitted by this series.
    - conditional/optional fields in canonical serialization order: `evt`, `data`, `ingestReqId`, `clientOpId`, `traceId`, `spanId`, `clientId`, `sessionId`, `ver`, `build`, `clientTs`, `srcIp`, `userAgent`.
    - canonical serialization order places `evt` immediately after `op` when present, and places `data` immediately after `msg` when present.
    - `evt` is optional and free-form with naming convention guidance (dot-delimited, lowercase, action-oriented), for example: `sse.connected`, `ui.pair.submit`, `api.random.requested`.
    - include `evt` only when it adds clarity beyond `op`; omit it when `op` already captures the event meaning.
    - keep `evt` stable and low-cardinality; never embed user data, file names/paths, or other high-cardinality/sensitive values.
    - `ingestReqId` is server-writer-assigned and required on every persisted entry; `clientOpId` is optional client-generated operation identifier for client-side action correlation.
    - `data` payloads must be bounded and privacy-safe (safe primitives, allowlisted short strings, and small structured objects); arbitrary object dumps are not allowed.
    - `ex` is API input convenience only and is not persisted as a top-level JSONL field.
    - when `ex` is provided, it is normalized into privacy-safe `data.error` metadata (for example: `type`, `code`, `messageSafe`, optional bounded stack fingerprint).
    - example (all fields shown in canonical order): `{"ts":"...","lvl":"info","svc":"desktop","comp":"ui.main-window","op":"UpdateLibraryPanel","evt":"ui.library.panel.updated","msg":"Library panel updated.","data":{"totalCount":38833,"eligibleCount":163},"ingestReqId":"...","clientOpId":"...","traceId":"...","spanId":"...","clientId":"...","sessionId":"...","ver":"...","build":"...","clientTs":"...","srcIp":"...","userAgent":"..."}`
  - Centralize writes through one server writer for:
    - server runtime logging pipeline (`ILogger` sink/provider),
    - client ingestion endpoint (`POST /api/logs/client`).
  - Enforce strict validation at `/api/logs/client`:
    - preserve valid provided metadata fields without parsing/inference of `lvl`/`comp`/`op`,
    - reject invalid rows (missing required fields, invalid `lvl`/`svc`, invalid/oversized `data`) instead of normalizing,
    - return deterministic machine-readable `400` validation payloads for contract violations:
      - one response may include multiple validation errors,
      - each error includes `code`, `field`, `reason`,
      - `field` uses canonical dotted-path notation (for example: `lvl`, `data.error.code`),
      - unknown/unmodeled input fields are rejected rather than silently ignored.
  - Keep optional human-readable rendering as a *view* over structured fields (Operator panel/console), not as the persisted source of truth.
  - Treat `srcIp` and `userAgent` as server-enriched fields when available; clients do not set them directly.
  - Define deterministic size-based rotation/retention for `last.log`:
    - rotate at 25 MB per file,
    - keep current file + 10 archives,
    - no compression for rotated files,
    - enforce retention/startup cleanup deterministically before append/write,
    - define deterministic handling for single-entry oversize writes and concurrent writer append attempts.
- **Acceptance criteria**:
  - `last.log` is JSONL and entries include required core fields with consistent optional-field shapes when emitted.
  - `lvl` values are always one of `trace|debug|info|warn|error|fatal` (lowercase).
  - `svc` values are always one of `server|desktop|webui` for this series' emitted entries; `android|ios` remain reserved and unused in this series runtime flows.
  - Optional fields serialize in canonical order with `evt` immediately after `op` when present and `data` immediately after `msg` when present.
  - `ingestReqId` is present on every persisted log entry and is assigned by the centralized server writer path.
  - `data` payload shape constraints are enforced (bounded, privacy-safe, no arbitrary object dumps).
  - `/api/logs/client` rejects invalid payloads with deterministic `400` validation errors (`code`, `field`, `reason`) and does not normalize invalid metadata.
  - Server runtime logs are written through the centralized writer path.
  - Lifecycle behavior is deterministic and documented with 25 MB rotation, 10-archive cap (uncompressed), startup retention enforcement, and defined oversize/concurrency edge handling.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include schema/order validation checks, strict-ingest rejection-path checks, and lifecycle/rotation edge-case checks.
  - Contract/docs evidence must capture canonical `svc` vocabulary and always-present writer-assigned `ingestReqId` behavior.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11b - Ingestion Contract + Correlation Semantics

- **Status**: ⏳ Planned
- **Goal**: Make server/client event ordering and correlation deterministic through ingestion contracts and trace propagation.
- **Scope**:
  - Preserve two-time semantics for client-originated events:
    - `ts` = server ingestion/write UTC time (authoritative ordering),
    - `clientTs` = client-reported event time (diagnostic context).
  - Define request/operation identifier semantics:
    - `ingestReqId` = server-writer-assigned identifier present on every persisted row for deterministic traceability,
    - `clientOpId` = optional client-generated operation identifier for client-side action correlation across retries/UI events.
  - Require W3C trace context (`traceId`/`spanId`) for HTTP/SSE request-scoped logs when active trace context is available; keep it optional for background/local-only client events.
  - Ensure `/api/logs/client` preserves valid provided metadata without parsing/inference of `lvl`/`comp`/`op`; reject invalid payloads rather than normalizing.
- **Acceptance criteria**:
  - Client-originated entries preserve both `ts` and `clientTs` semantics with server-side ordering.
  - `ingestReqId` is server-writer-assigned, present on every persisted row, and deterministic; `clientOpId` is preserved when provided.
  - Request-scoped HTTP/SSE flows include `traceId`/`spanId` when active trace context is available; paths without active trace context are explicitly documented/test-evidenced.
  - `/api/logs/client` contract mapping is deterministic with no inferred metadata fields; invalid contract inputs return deterministic machine-readable `400` validation errors.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include two-time semantics checks (`ts` vs `clientTs`) and correlation checks across `ingestReqId`/`clientOpId`/trace fields.
  - Ingest-contract evidence must include both valid preserve-path and invalid reject-path behavior (`400` with `code`/`field`/`reason`).
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11c - Structured Log API Introduction (Desktop + WebUI)

- **Status**: ⏳ Planned
- **Goal**: Introduce typed structured Log API surfaces that require explicit metadata at call sites.
- **Scope**:
  - Provide strongly-typed methods (or overloads) with optional typed context metadata:
    - `LogTrace(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogDebug(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogInfo(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogWarn(comp, op, evt? = null, msg, data? = null, context? = null)`
    - `LogError(comp, op, evt? = null, msg, data? = null, ex? = null, context? = null)`
    - `LogFatal(comp, op, evt? = null, msg, data? = null, ex? = null, context? = null)`
  - Enforce explicit `comp` and `op` parameters (no parsing from `msg`).
  - Ensure `lvl` is set by API method used and constrained to `trace|debug|info|warn|error|fatal` only (no “everything is info” path and no custom variants).
  - Support optional `evt` to classify event type independently from operation context (`op`), using free-form dot-delimited lowercase naming convention.
  - Include `evt` only when it adds clarity beyond `op`; avoid redundant `evt` values.
  - Keep `evt` tokens stable and low-cardinality; do not include user data, file names/paths, or other high-cardinality values.
  - Optional `data` payloads must follow privacy-safe bounded-shape rules (safe primitives, allowlisted short strings, small objects; no arbitrary object dumps).
  - `ex` parameter semantics:
    - accepted only on `LogError`/`LogFatal`,
    - normalized into `data.error` before emit,
    - never written as a top-level field,
    - raw exception text/stack is not emitted unless explicitly privacy-approved and bounded by policy.
  - `context` holds conditional metadata (`clientOpId`, `traceId`, `spanId`, `clientId`, `sessionId`, `ver`, `build`, `clientTs`) where available/applicable.
  - Define canonical `LogContext` shape used by all `Log*` methods:
    - `LogContext = { clientOpId?: string; traceId?: string; spanId?: string; clientId?: string; sessionId?: string; ver?: string; build?: string; clientTs?: string }`
    - `traceId`/`spanId` are required for request-scoped HTTP/SSE flows when active trace context is available.
    - `ingestReqId` is assigned by the centralized server writer and is not client-supplied; clients may provide `clientOpId` when correlating multi-step client operations.
    - `ingestReqId`, `srcIp`, and `userAgent` are excluded from client-supplied `LogContext` and are server-enriched only.
  - Provide minimal canonical `comp` mapping list and enforce in review/docs:
    - Desktop examples: `ui.main-window`, `ui.player`, `ui.settings`, `core.client`, `playback.vlc`, `library.panel`.
    - Server examples (reference baseline for **Server/Core Meaningful Instrumentation Expansion**): `api`, `auth`, `sse`, `playback`, `refresh.pipeline`, `storage`.
    - WebUI examples: `web.app`, `web.player`, `web.api`, `web.sse`.
- **Acceptance criteria**:
  - Structured Log API exists for desktop and WebUI with explicit `comp`/`op` and level-typed methods.
  - `lvl` is determined by method choice, constrained to `trace|debug|info|warn|error|fatal`, and no “forced info” path is required.
  - `evt` is supported as optional event-type metadata and appears in canonical serialized position when emitted.
  - `data` payload constraints are enforced by API surface/policy (bounded safe shape, no arbitrary object dumps).
  - Canonical `comp` mapping list is documented and used as migration baseline.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include API-surface validation for level-typed methods, `ex` normalization to `data.error`, and context-field mapping behavior.
  - Evidence must confirm request-scoped trace fields are emitted when active trace context is available, and omitted paths are explicitly expected/tested.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11d - Desktop Log Migration + Legacy API Obsoletion

- **Status**: ⏳ Planned
- **Goal**: Migrate the high-volume desktop logging surface to structured API as the primary structured-logging migration priority.
- **Scope**:
  - Update all desktop legacy `Log("OpName: ...")` call sites to structured API.
  - Remove any desktop-side “infer op from msg” logic/normalizers.
  - Concrete expected call-site pattern example:
    - call: `LogInfo(comp: "ui.main-window", op: "UpdateLibraryPanel", evt: "ui.library.panel.updated", msg: "Library panel updated.", data: { totalCount: 38833, eligibleCount: 163 }, context: { clientOpId: <when-available>, traceId: <request-scoped>, spanId: <request-scoped>, clientId: <when-available>, sessionId: <when-available>, ver: <when-available>, build: <when-available>, clientTs: <client-originated> })`.
    - expected emitted entry shape (all fields shown in canonical order): `{"ts":"...","lvl":"info","svc":"desktop","comp":"ui.main-window","op":"UpdateLibraryPanel","evt":"ui.library.panel.updated","msg":"Library panel updated.","data":{"totalCount":38833,"eligibleCount":163},"ingestReqId":"...","clientOpId":"...","traceId":"...","spanId":"...","clientId":"...","sessionId":"...","ver":"...","build":"...","clientTs":"...","srcIp":"...","userAgent":"..."}`
  - Ensure desktop call sites choose appropriate levels:
    - `trace/debug` for noisy flow details,
    - `info` for meaningful state transitions,
    - `warn` for recoverable degradations,
    - `error` for failures/exceptions,
    - `fatal` for unrecoverable failures.
  - Mark legacy desktop `Log(string)` path as obsolete/error once migration is complete (or delete path).
- **Acceptance criteria**:
  - No legacy desktop `Log(string)` usage remains.
  - Desktop logs provide explicit `comp`/`op` (with `evt` where meaningful) and correctly categorized levels.
  - No desktop fallback path reintroduces string-prefix parsing or forced `info` levels.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include call-site migration inventory, obsolete/remove enforcement for legacy `Log(string)`, and representative emitted-entry validation.
  - Evidence must confirm migrated desktop flows retain canonical field ordering and writer-assigned `ingestReqId`.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11e - Server/Core Meaningful Instrumentation Expansion

- **Status**: ⏳ Planned
- **Goal**: Add meaningful, structured logs to server/core decision points and runtime features (not only transport wrappers).
- **Scope**:
  - Instrument server/core logic paths with structured logs:
    - API handlers + auth/pairing outcomes,
    - SSE lifecycle and session identity transitions,
    - playback decision engine and playback-session orchestration,
    - refresh pipeline stages/outcomes,
    - storage/config apply and error paths.
  - Emphasize meaningful state transitions, decisions, degradations, and failures over noisy repetitive logs.
- **Acceptance criteria**:
  - Server/core features emit meaningful structured logs with `comp`/`op` and correct levels across listed functional areas.
  - Correlation fields (`traceId`/`spanId` when active trace context is available, plus writer-assigned `ingestReqId`) are present on request-scoped server/core logs; `clientOpId` is present only when propagated from a client-originated operation.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include representative logs across all listed functional areas with level/category correctness.
  - Evidence must include request-scoped correlation checks and explicit expected handling for paths without active trace context.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11f - WebUI Meaningful Instrumentation Expansion

- **Status**: ⏳ Planned
- **Goal**: Raise WebUI from minimal/wrapped status logging to meaningful structured logging aligned with unified API.
- **Scope**:
  - Add structured WebUI logging coverage for:
    - app bootstrap and runtime initialization,
    - auth/pairing flows and state transitions,
    - SSE connect/disconnect/retry lifecycle,
    - API request lifecycle/failure handling,
    - key user action flows and major UX error states.
  - Define and instrument the top 5 critical WebUI flows with stable operation keys:
    - session bootstrap + compatibility gating (`BootstrapSession`),
    - pairing/auth transition (`PairSession`),
    - SSE connection lifecycle (`SseLifecycle`),
    - random selection + playback start (`RandomPickAndPlay`),
    - item-state mutation actions (favorite/blacklist/tag-edit apply) (`MutateItemState`).
  - Migrate remaining WebUI legacy/prefix log usage to structured API.
  - Remove any WebUI-side “infer op from msg” logic/normalizers.
  - Use optional `evt` across those flows with free-form dot-delimited lowercase naming convention to classify event type without overloading `op`.
  - Ensure WebUI call sites choose appropriate levels:
    - `trace/debug` for noisy flow details,
    - `info` for meaningful state transitions,
    - `warn` for recoverable degradations,
    - `error` for failures/exceptions,
    - `fatal` for unrecoverable failures.
- **Acceptance criteria**:
  - WebUI no longer relies on minimal/wrapped status-only logging for critical flows.
  - WebUI logs are emitted via structured API with explicit `comp`/`op` (and `evt` where meaningful) and appropriate levels.
  - Top 5 critical WebUI flows listed in scope emit meaningful structured logs with request/trace linkage where applicable.
  - `MutateItemState` instrumentation includes explicit subcase coverage for favorite, blacklist, and tag-edit apply actions.
  - No legacy WebUI `Log(string)` usage remains.
  - No WebUI fallback path reintroduces string-prefix parsing or forced `info` levels.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include one captured structured entry for each required critical flow and `MutateItemState` subcase.
  - Evidence must include request-scoped correlation checks (trace fields when active trace context is available) and no-legacy-path enforcement.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11g - Operator Structured Query Surface

- **Status**: ⏳ Planned
- **Goal**: Deliver operator triage capabilities over structured logs with typed filtering while keeping server write path file-based.
- **Scope**:
  - Perform end-to-end naming cutover from **Server Logs** to **Log Viewer** across UI, API contracts, and test/docs artifacts.
  - Rename primary read/query endpoint from `/control/logs/server` to `/control/log-viewer` with compatibility alias:
    - keep `/control/logs/server` temporarily as backward-compatible alias,
    - maintain equivalent behavior/payload semantics during alias period,
    - mark alias as deprecated in OpenAPI/docs during **Operator Structured Query Surface** with explicit planned removal in **Reliability Hardening and Final Verification** (no indefinite dual-endpoint ambiguity).
  - Ensure `/control/log-viewer` remains read/query only; server runtime log writes continue directly to `last.log`.
  - Update OpenAPI and docs (`shared/api/openapi.yaml`, `docs/api.md`, operator-facing docs) to:
    - define `/control/log-viewer` as primary endpoint,
    - mark `/control/logs/server` as deprecated compatibility alias with planned removal noted in **Reliability Hardening and Final Verification**.
  - Update Operator page title and navigation labels from `Server Logs` to `Log Viewer`.
  - Implement collapsible Log Viewer controls section:
    - collapsed by default,
    - expandable on demand,
    - show active-filter summary chips while collapsed.
  - Ensure Log Viewer supports full structured + text + time filtering:
    - `svc`, `lvl`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`,
    - message text search,
    - time-window filter.
  - Filter execution model:
    - primary filtering path is server-side query/filter at `/control/log-viewer` for `svc`, `lvl`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`, text, and time-window inputs,
    - client-side filtering is limited to transient UX refinement on already-fetched results,
    - server query results are deterministic for identical filter inputs (including time window and pagination cursor),
    - deterministic ordering contract is explicit and stable: newest-first by `ts` with deterministic tie-breakers (`ingestReqId`, then stable row sequence) to avoid page drift/duplication,
    - when `ts` and `ingestReqId` are equal, ordering falls back to a stable per-row sequence key evaluated by cursor semantics so paging never duplicates/skips rows,
    - cursor contract is explicit and versioned, with deterministic bound semantics for `from`/`to` time-window filters.
  - Render human-readable log rows by default with expandable per-row raw JSON details.
  - Implement newest-first ordering, incremental/cursor paging, and auto-refresh behavior:
    - auto-refresh toggle,
    - pause auto-refresh while user is scrolled away from newest rows,
    - explicit resume control/state indicator.
- **Acceptance criteria**:
  - Operator Log Viewer can filter/search by structured fields, text, and time window without shell access.
  - Primary endpoint `/control/log-viewer` returns structured-entry responses compatible with exact field filtering.
  - Compatibility alias `/control/logs/server` remains functional during migration window.
  - Alias lifecycle is explicit: OpenAPI/docs mark the alias deprecated during **Operator Structured Query Surface** with planned removal in **Reliability Hardening and Final Verification**.
  - Log Viewer controls are collapsed by default and expose active filter state when collapsed.
  - Human-readable row mode with expandable JSON detail is available and functional.
  - Query ordering and cursor pagination are deterministic and documented (stable sort tuple, tie-break semantics, cursor version/bounds behavior).
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include deterministic pagination checks (no duplicate/missing rows across page boundaries) and stable-result replay for identical filter inputs.
  - Evidence must include contract/docs artifacts for sort/cursor/time-bound semantics and alias deprecation annotations.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11h - Privacy-by-Construction Enforcement + Legacy Guardrails

- **Status**: ⏳ Planned
- **Goal**: Enforce source-safe logging policy and prevent regression to unsafe or inferred logging behavior.
- **Scope**:
  - Enforce privacy-by-default by construction:
    - emitters must never include domain-identifying/sensitive values in `msg` or `data`, including:
      - filenames or file paths,
      - tag/category names,
      - preset/source names,
      - user-provided search text,
      - token/cookie/secret values,
      - raw media identifiers that could reveal content without server context.
    - prefer safe templates and coarse counts/booleans/durations (examples):
      - `"Saved desktop settings."` with `data: { wroteBackup: true }`
      - `"Applied favorite update."` with `data: { isFavorite: true }`
      - `"Library panel updated."` with `data: { totalCount: 38833, eligibleCount: 163 }`
      - `"API request failed."` with `data: { endpoint: "SetFavorite" }` (no URL, no path)
  - Exception handling policy for structured logging:
    - `ex` inputs must be converted to privacy-safe `data.error` shape,
    - do not emit raw stack traces, local file paths, or sensitive payload fragments by default,
    - include only safe error descriptors (`type`, `code`, `messageSafe`, optional hash/fingerprint).
    - explicit error emitted entry example (`ex` normalized into `data.error`): `{"ts":"...","lvl":"error","svc":"desktop","comp":"core.client","op":"PairSession","evt":"ui.pair.failed","msg":"Pairing request failed.","data":{"error":{"type":"HttpError","code":"401","messageSafe":"Unauthorized"}},"ingestReqId":"...","clientOpId":"...","traceId":"...","spanId":"...","clientId":"...","sessionId":"...","ver":"...","build":"...","clientTs":"...","srcIp":"...","userAgent":"..."}`
  - Enforce bounded `data` payload contract at runtime:
    - allow safe primitives, allowlisted short strings, and small objects only,
    - reject/trim/block arbitrary object dumps and oversized payloads before serialization.
  - Prevent reintroduction of legacy logging paths:
    - remove/obsolete global `Log(string)` paths once migration is complete,
    - enforce no parsing/inference fallback for `lvl`/`comp`/`op`.
- **Acceptance criteria**:
  - Privacy constraints are enforced at source in `msg` and `data`.
  - Error/fatal logs with `ex` inputs persist only privacy-safe `data.error` payloads; no top-level `ex` field is written and no raw sensitive exception content is emitted by default.
  - Runtime safety/correctness is achieved by source-safe templates + structured Log API contracts, not by post-hoc sanitizer/normalizer rewriting.
  - Sanitizer/normalizer runtime paths are removed by end of this milestone with regression tests proving they are not in runtime data path.
  - Legacy string-prefix logging paths are blocked from reintroduction.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include negative tests for sensitive content leakage and `ex` serialization policy enforcement.
  - Evidence must include regression proof that sanitizer/normalizer paths are removed from runtime data path and legacy string-prefix logging is blocked.
- **Deferrals / Follow-ups**:
  - None at planned state.

### M11i - Reliability Hardening and Final Verification

- **Status**: ⏳ Planned
- **Goal**: Finalize non-blocking behavior and complete cross-surface sign-off evidence for the structured-logging series.
- **Scope**:
  - Keep logging best-effort and non-blocking for clients:
    - client relay failures must not block/interrupt user actions,
    - retries are asynchronous and bounded.
  - Complete endpoint cutover by removing compatibility alias `/control/logs/server` in this milestone; `/control/log-viewer` becomes sole supported endpoint after structured-logging sign-off.
  - Complete OpenAPI/docs endpoint cutover in this milestone:
    - remove deprecated `/control/logs/server` alias from contract/docs,
    - keep `/control/log-viewer` as sole documented/supported endpoint.
  - Scope for this implementation series is `server`, `desktop`, and `webui`; `android`/`ios` remain schema-reserved `svc` values for later milestones.
- **Acceptance criteria**:
  - `last.log` includes both server runtime logs and ingested desktop/web client logs through the same writer path.
  - Desktop and WebUI logs are emitted using structured API with explicit `comp`/`op` and correctly categorized levels.
  - Client log ingestion failures are non-blocking in user flows and bounded retry behavior is deterministic/tested.
  - `/control/logs/server` compatibility alias is removed as part of this milestone cutover; `/control/log-viewer` remains the only supported log-viewer endpoint.
  - Automated tests cover schema validation, ingestion mapping, timestamp semantics, request-scoped trace correlation fields, structured Log API behavior (field correctness + levels), privacy guardrails (source-safe templates), lifecycle behavior, and non-blocking relay behavior.
- **Verification evidence**:
  - Centralized server writer emits JSONL entries for both server and client-ingested events.
  - `/api/logs/client` maps to canonical schema, preserves valid client/session/trace metadata without parsing/inference of `lvl`/`comp`/`op`, and rejects invalid inputs with deterministic machine-readable `400` validation errors.
  - Desktop + WebUI relays verified with stable `svc`, `clientId`, `sessionId`; request-scoped paths include trace fields when active trace context is available.
  - `clientOpId` appears only when propagated from a client-originated operation; absence on pure server-originated rows is expected.
  - Operator Log Viewer validates mixed-source filtering/search by structured fields (`svc`, `lvl`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`) plus message text search and time-window filtering.
  - Endpoint migration evidence captures:
    - `/control/log-viewer` primary endpoint behavior,
    - `/control/logs/server` alias deprecation state in **Operator Structured Query Surface** and removal behavior in **Reliability Hardening and Final Verification** (expected unsupported response after cutover).
  - Log Viewer UX evidence captures:
    - collapsed-by-default controls with active-filter summary while collapsed,
    - human-readable rows with expandable JSON detail,
    - auto-refresh toggle + pause-on-scroll behavior.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification captures:
    - server lifecycle logs,
    - desktop action/error logs,
    - web SSE/auth/error logs,
    - one captured structured log example for each required WebUI flow (`BootstrapSession`, `PairSession`, `SseLifecycle`, `RandomPickAndPlay`, `MutateItemState`),
    - `MutateItemState` evidence includes favorite, blacklist, and tag-edit apply subcases,
    - combined trace-level evidence across server + client for at least one end-to-end flow,
    - one explicit `/api/logs/client` failure simulation proving user actions remain non-blocking,
    - field-level evidence snippets in `docs/checklists/testing-checklist.md`.

## Planned Milestones

### P2a - Playback Session Contracts and Capability Surface

- **Status**: ⏳ Planned
- **Goal**: Establish contract-first playback-session APIs and capability signaling.
- **Scope**:
  - Milestone-sequencing guardrails for this playback-session series:
    - complete current stabilization work before starting this series implementation,
    - keep each slice independently verifiable and shippable,
    - preserve thin-client boundaries while introducing server-side playback decisions.
  - Define OpenAPI contracts for playback-session create/read and stream URL contracts.
  - Add server capability markers for playback-session and transcode support in `/api/version`.
  - Regenerate/refresh generated client contracts used by desktop and WebUI.
- **Acceptance criteria**:
  - This milestone establishes the contract/capability baseline used by subsequent slices in the playback-session series.
  - OpenAPI includes playback-session surfaces and validates.
  - Generated desktop/web client contracts are in sync with OpenAPI.
  - Version/capability checks can detect missing playback features deterministically.

### P2b - Server Playback Decision Engine

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

### P2c - Direct-Stream Session URL Baseline

- **Status**: ⏳ Planned
- **Goal**: Ship direct-stream playback-session URL path first as the initial playback foundation.
- **Scope**:
  - Implement direct-stream session URL issuance and guarded token/session mapping.
  - Add session TTL lifecycle cleanup for direct-stream sessions.
- **Acceptance criteria**:
  - Direct-stream playback-session URLs are issued/validated deterministically.
  - Session token/session mapping is guarded against invalid/expired use.
  - Direct-stream sessions are cleaned up reliably after TTL expiry.

### P2d - Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline)

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

### P2e - Desktop Thin-Client Playback Cutover

- **Status**: ⏳ Planned
- **Goal**: Integrate desktop with playback-session APIs while preserving local-first performance semantics from the completed desktop playback-policy milestone.
- **Scope**:
  - Preserve the desktop playback-policy compromise baseline throughout this playback-session series:
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
  - Ensure `ForceApiPlayback=true` always routes desktop through API playback path (for this series validation and advanced-user preference).
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
  - Outside allowed desktop playback-policy exceptions (`desktop-settings.json`, media-read for playback), no new local file authority paths are introduced.
  - Desktop looping parity is preserved: loop toggling/iteration semantics remain gapless without per-loop stat increments.
  - Disconnect/reconnect behavior remains user-friendly and deterministic.

### P2f - WebUI Playback Cutover and Format Resilience

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

### P2g - Resume Position and Session Continuity

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

### P2h - Hardening, Operations, and Final Verification

- **Status**: ⏳ Planned
- **Goal**: Stabilize playback pipeline for multi-client operation and operational visibility.
- **Scope**:
  - Add concurrency/backpressure controls (max concurrent transcodes + queueing policy).
  - Add operator diagnostics for active sessions, mode decisions, and failure reasons.
  - Execute full automated/manual verification matrix and finalize docs/tracking updates for this playback-session series.
- **Acceptance criteria**:
  - Multi-client playback remains stable under constrained transcode capacity.
  - Operator-facing diagnostics are sufficient to troubleshoot playback failures.
  - Automated gates and manual playback matrix pass before playback-session series sign-off.
  - After server shutdown, no ffmpeg workers remain, and temporary playback/transcode directories are cleaned or explicitly TTL-managed.

### P3 - Android Client Bootstrap

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

### P4 - File Metadata Sync and Extended Metadata

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

### P5 - Customizable Keyboard Shortcuts (Desktop)

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

### P6 - Playback Analytics and Visualization

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

### P7 - Desktop Confirmation Dialog Standardization

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

### P8 - Advanced Runtime and Cache Controls

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

### P9a - Photo Face Detection Baseline

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
  - This milestone is the first phase of the face-detection rollout, with video expansion in the companion video-detection phase.
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

### P9b - Video Face Detection Expansion

- **Status**: ⏳ Planned
- **Goal**: Extend face detection to video with sampling/throughput strategies suitable for long-form media.
- **Scope**:
  - This milestone is the second phase of the face-detection rollout and extends the server-authoritative model established in the companion photo-detection phase.
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


---

## Completed Milestones

Latest completions first:

### M9a - Avalonia Server Tray + Linux Runtime Baseline

- **Status**: ✅ Complete
- **Goal**: Replace the **Windows**-only WinForms server host tray with a cross-platform **Avalonia** tray that preserves today’s behavior; validate server and the **Desktop** client on Linux with **CachyOS (Arch-based, `linux-x64`)** as the primary sign-off environment; align repo naming from legacy **`windows` / Windows-oriented** client identifiers to **`desktop` paths** and **Desktop**-oriented project/product names.
- **Scope**:
  - **Server host tray (WinForms → Avalonia)**:
    - Retire the WinForms `NotifyIcon` host UI path; implement an Avalonia-based tray (or minimal Avalonia application lifetime) shared across **Windows** and Linux.
    - Preserve functional parity with the current tray: **Open Operator UI**, **Launch Server on Startup** (enable/disable autostart in parity across OSes—**Windows** registry-backed behavior today; **Linux** via **XDG Autostart** using a standard `*.desktop` entry in the user autostart directory, with the tray toggle installing/removing or enabling/disabling that entry as appropriate), **Refresh Library**, **Restart Server**, **Stop Server / Exit**, shared icon loading with sensible fallback, non-blocking menu actions, graceful UI-thread shutdown aligned with host restart/stop flows.
    - Preserve **light/dark context-menu theming** on **Windows** where applicable; on Linux, follow the **desktop environment** theme or document explicit behavior when the platform does not expose matching signals.
    - Unify server app targeting where practical (avoid a **Windows**-only TFM solely for tray unless required); keep **`net10.0` headless** path when **tray is unavailable** (no display / no status notifier / unsupported session) with deterministic behavior matching current non-**Windows** headless semantics.
  - **Desktop client**:
    - The **Desktop** GUI client is **already Avalonia**; scope here is Linux **validation and hardening** (not a UI-framework rewrite).
    - **Repo-wide rename**: `src/clients/desktop/...`-style paths, solution/project/assembly names, and docs/scripts slugs move to **`src/clients/desktop/...`**-style paths with **Desktop** client naming (e.g. `ReelRoulette.DesktopApp`—exact identifiers chosen at implementation time; keep **lowercase `desktop` in path segments**, **capitalized Desktop in product-facing names**).
  - **Linux baseline**:
    - Primary manual/automated sign-off reference: **CachyOS**, `linux-x64`, on typical **desktop environment** sessions (tray-capable **and** headless/tray-unavailable cases).
    - Validate consolidated server on Linux: `/health`, `/api/version`, `/api/events`, `/api/media/{idOrToken}`, `/operator`, plus WebUI/static hosting as today.
    - Validate **Desktop** client: launch, pair/connect, random/manual playback, core controls.
    - Validate native deps: **ffprobe/ffmpeg**, **LibVLC** runtime expectations.
    - Keep API-first / thin-client boundaries unchanged.
- **Acceptance criteria**:
  - On **Windows**, after the port, tray menu actions and host lifecycle behavior match pre-port intent (no loss of Operator open, refresh, restart, stop, startup-toggle behavior).
  - On **Linux**, server starts and serves the same core surfaces as above; **Desktop** client completes core workflows against that server.
  - **Launch Server on Startup** works on **Linux**: the tray toggle deterministically enables/disables user login autostart via **XDG Autostart** (`*.desktop` in the user autostart location), verified on **CachyOS** alongside the existing **Windows** registry-backed behavior.
  - Tray-capable **desktop environments** show the Avalonia tray when supported; otherwise server runs **headless** without hanging or requiring a display—deterministic fallback.
  - Linux prerequisites (including VLC/ffmpeg and tray fallbacks) are **documented and reproducible** for the CachyOS baseline.
  - **Desktop** rename is **consistent** in solution, primary scripts, and contributor-facing paths (no lingering **`windows`** folder naming or **Windows**-centric client wording as the canonical **Desktop** app identity).
  - No new client-local authoritative mutation paths are introduced.
- **Verification evidence**:
  - Informal confirmation that server and **Desktop** client run and perform core workflows on a **Linux** desktop baseline (maintainer-reported smoke) is sufficient for closing implementation work in this milestone when paired with green automated gates below.
  - Comprehensive manual verification across **Windows** and **Linux** (full checklist completion, packaged-artifact matrix, formal tray vs headless vs autostart evidence on both platforms) is **deferred** to **Linux Release Readiness and Sign-off** (see that milestone).
  - Automated gates passed (still required when touching release surfaces):
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Notes on any intentional **platform differences** (e.g. autostart implementation details) recorded in the doc slice of this series.
- **Deferrals / Follow-ups**:
  - Full cross-platform manual matrix and checklist-driven sign-off → **Linux Release Readiness and Sign-off**.

### M8i - Desktop App UX/UI Polish

- **Status**: ✅ Complete
- **Goal**: Deliver desktop UX/UI polish and light-dark theme compatibility improvements without changing core API-first ownership boundaries.
- **Scope**:
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
  - Keep desktop tag editor category rows theme-compatible:
    - in light mode, category bars use light surfaces with dark-gray borders while text remains readable black,
    - in dark mode, current dark presentation remains visually consistent.
  - Keep desktop tag chips visually stable across themes:
    - chip text/icons remain white in both light and dark modes,
    - apply consistent chip drop-shadow styling aligned with WebUI appearance.
  - Update desktop filter dialog `Tags` tab for visual parity with tag editor presentation in both light/dark modes while preserving control differences:
    - chips expose add/remove controls only,
    - category rows expose local combine-mode dropdown only.
- **Acceptance criteria**:
  - Duplicate groups in desktop duplicates dialog show per-file thumbnails inline in the defined order, enabling quick visual validation before delete/apply actions.
  - Desktop tag editor category rows render with light-compatible surfaces/borders in light mode and retain readable text/contrast in both themes.
  - Desktop tag chips preserve white text/icons with consistent drop-shadow treatment in both light and dark modes.
  - Desktop filter dialog `Tags` tab has visual parity with tag editor surfaces across themes, while preserving intended control differences.
  - No regressions to previously completed reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).
- **Verification evidence**:
  - Implemented desktop duplicate-review thumbnail rendering in the required per-group order using server thumbnail endpoint paths (`/api/thumbnail/{itemId}`) with explicit desktop bitmap loading for deterministic thumbnail display.
  - Added per-group duplicate handling selection to avoid forcing all groups to be processed:
    - each group now supports `Keep All` and per-item keep selection in the same dropdown,
    - desktop settings now persist a global `Duplicate Handling Default Behavior` (`Keep All` default, `Select Best` legacy behavior).
    - duplicate delete confirmation now shows total groups handled and total files to delete, and it no longer prompts when all groups are set to `Keep All`.
    - duplicate item metadata now includes tag counts, and keep-selection dropdown labels now include filename + plays/tags/favorite/blacklisted for easier comparisons.
  - Implemented shared desktop tag-surface styling tokens and applied them across tag editor and filter `Tags` tab:
    - category rows now use theme-aware shared surfaces/borders,
    - chip text/icons are pinned white in both themes,
    - chip text/icon shadows are strengthened to align with WebUI treatment,
    - chip state-specific inset shadow behavior now mirrors WebUI closer for selected states.
  - Preserved filter `Tags` behavior boundaries while applying visual parity:
    - chips remain add/remove controls only,
    - category rows retain local combine-mode dropdown controls,
    - filter tags now render in a responsive wrapping layout instead of a fixed three-column grid.
  - Automated verification passed:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln` (91 passed, 0 failed).
  - Manual validation checklist coverage for desktop UX/theme checks added to `docs/checklists/testing-checklist.md`.
- **Deferrals / Follow-ups**:
  - Capture post-implementation manual desktop verification evidence (light/dark screenshots + pass/fail notes) during the next targeted validation run.

### M8h - Tray Theme Parity and Material Symbols Icon Standardization

- **Status**: ✅ Complete
- **Goal**: Align Windows ServerApp tray UX with system theme behavior and standardize icon rendering on Material Symbols **font-based** patterns (with shared icon styles) for consistent cross-platform theming/customization.
- **Scope**:
  - Windows tray menu theme parity:
    - make tray context menu follow active system theme (light/dark) instead of fixed light styling,
    - keep existing tray action behavior unchanged while applying theme-aware rendering.
  - Desktop icon foundation (font-based):
    - wire `assets/fonts/MaterialSymbolsOutlined.var.ttf` into Avalonia resources for desktop icon rendering,
    - use shared `TextBlock.MaterialSymbolIcon` style for icon font setup,
    - standardize transparent icon-button behavior on shared styles:
      - base class: `IconGlyphBase`,
      - control wrappers: `IconGlyphButton`, `IconGlyphToggle`.
  - Full-surface migration contract (this milestone):
    - use mute button as the first implementation slice, then migrate the intended remaining icon controls/surfaces in desktop and WebUI within this milestone,
    - intentionally retain existing emoji/text indicator surfaces in `MainWindow.axaml` and `ManageSourcesDialog.axaml`,
    - preserve existing control behavior while replacing icon rendering implementation (no feature-behavior regressions during cutover).
  - Cross-surface tinting contract:
    - desktop/Avalonia icon font tinting is driven by foreground color/brush and system theme,
    - WebUI icon font tinting is driven via CSS color/theming so symbols inherit site theme state.
  - Asset/source-of-truth boundaries:
    - keep Material Symbols font asset under `assets/fonts/` as desktop icon-font source.
  - Preserve architecture boundaries:
    - keep icon/theming logic in host/UI/render layers,
    - do not move domain logic into clients for this work.
- **Acceptance criteria**:
  - Tray context menu follows current Windows system light/dark theme at runtime.
  - Desktop icon-font path is active via `MaterialSymbolsOutlined.var.ttf` and shared icon styles (`IconGlyphBase`, `IconGlyphButton`, `IconGlyphToggle`, `MaterialSymbolIcon`).
  - Desktop icon controls/surfaces targeted for migration are moved to the shared icon-style foundation and Material Symbols font rendering, with intentional retention of existing emoji/text surfaces in `MainWindow.axaml` and `ManageSourcesDialog.axaml`.
  - WebUI icon rendering is font-based (Material Symbols via CSS) and supports deterministic CSS-driven tinting.
  - All WebUI icon controls/surfaces are migrated to the Material Symbols font-based CSS path.
  - No regressions to existing tray actions (`Open Operator UI`, `Launch Server on Startup`, `Refresh Library`, `Restart Server`, `Stop Server / Exit`).
- **Verification evidence**:
  - Automated gate pass:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification captures:
    - tray menu light-mode rendering evidence,
    - tray menu dark-mode rendering evidence,
    - desktop icon-surface evidence showing targeted icon migration to shared icon-style + Material Symbols font rendering in light/dark themes, with intentional retention exceptions for `MainWindow.axaml` and `ManageSourcesDialog.axaml`,
    - WebUI icon-surface evidence showing full icon migration to Material Symbols CSS font rendering in light/dark themes,
    - icon-source evidence showing desktop font-asset usage (`assets/fonts/MaterialSymbolsOutlined.var.ttf`).
- **Deferrals / Follow-ups**:
  - Windows tray menu item icons are deferred; add Material Symbols-based tray menu icons in a follow-up milestone after theme-parity rollout stabilizes.
  - Linux tray theme/icon parity remains best-effort and is tracked under Linux milestone work unless explicitly expanded.

### M8g - Windows ServerApp System Tray Baseline (Single Binary, No Console)

- **Status**: ✅ Complete
- **Goal**: Provide a single-binary Windows `ReelRoulette Server` runtime that starts without a command prompt and exposes essential operator actions via system tray.
- **Scope**:
  - Convert Windows ServerApp startup to no-console behavior (`WinExe`) while preserving existing server/API behavior.
  - Require tray icon asset parity with repo branding:
    - system tray icon must use the shared app icon at `assets/HI.ico` (same icon source used by other app/package surfaces).
  - Add initial Windows system tray surface with minimum actions:
    - Open Operator UI (default browser to `/operator`),
    - Refresh Library (manual refresh trigger),
    - Restart Server,
    - Stop Server / Exit.
  - Keep server logic API-authoritative and reuse existing server services/endpoints for lifecycle/refresh operations.
  - Introduce host-UI abstraction so non-Windows runtimes remain headless-compatible and can adopt tray support later without server-core rewrites.
  - Preserve existing packaging/install behavior except for intentional startup UX change (no visible command prompt).
- **Acceptance criteria**:
  - Launching `ReelRoulette.ServerApp.exe` on Windows does not show a command prompt window.
  - Windows tray icon uses the shared app icon from `assets/HI.ico` (not a placeholder/default framework icon).
  - Tray icon appears reliably and menu actions execute deterministically:
    - Operator UI opens in default browser,
    - Refresh action triggers library refresh pipeline,
    - Restart action performs graceful self-restart,
    - Stop/Exit performs graceful shutdown.
  - Existing API/SSE/WebUI/Operator runtime behavior remains functional and unchanged in intent.
  - Single-binary Windows ServerApp packaging remains valid and install/run flow remains reproducible.
  - Linux runtime path is unaffected (continues headless unless Linux-focused tray work is explicitly enabled later).
- **Verification evidence**:
  - Implemented code path:
    - host-UI abstraction added under `src/core/ReelRoulette.ServerApp/Hosting/*` with Windows `NotifyIcon` tray host and non-Windows headless host.
    - tray menu actions wired for Open Operator UI, Refresh Library, Restart Server, and Stop Server / Exit.
    - Windows no-console runtime path implemented via `net9.0-windows` + `WinExe`; non-Windows path remains `net9.0` headless.
    - tray icon source now resolves shared `assets/HI.ico` via published `HI.ico` copy and repo fallback path.
  - Automated gate pass (2026-03-11):
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification completed (`docs/checklists/testing-checklist.md`):
    - no-console Windows launch verified,
    - tray icon parity evidence verified for `assets/HI.ico`,
    - tray action behavior verified for all four required menu actions,
    - packaged portable/install runtime tray behavior verified.
- **Deferrals / Follow-ups**:
  - Linux tray support is explicitly deferred to the Linux milestone group as best-effort capability.
  - Advanced tray UX (notifications, rich status panes, localization, startup-on-login toggles) is out of scope for this milestone unless separately approved.

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
    - `docs/checklists/testing-checklist.md` (workflow + inline checklist + PASS/FAIL evidence capture).
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
    - `docs/checklists/testing-checklist.md`.
  - Automated verification passes on current branch:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual checklist waiver applied per user direction:
    - remaining `NOT TESTED` items in `docs/checklists/testing-checklist.md` are accepted as pass/deferred for this milestone closeout.
  - High/medium reliability fix slice (post-manual test feedback) is implemented:
    - duplicate scan now shows deterministic API-recovery guidance instead of silent no-op,
    - auto-tag scan now reports runtime recovery state accurately and no longer relies on a false version-only health signal,
    - desktop now enforces API/capability compatibility gates and shows reconnect/resync SSE status guidance,
    - missing-media simulation now preserves random selection and fails deterministically at media-fetch endpoints with explicit `Media not found` API errors.
    - desktop legacy locate/remove missing-file dialog flow removed to keep missing-media remediation server-authoritative.
  - Deferred to **UX/UI Polish** (polish-only follow-up):
    - tag-editor apply latency/close responsiveness polish,
    - web refresh-status detail parity enhancements.

### M8e - WebUI and Mobile Thin-Client Contract Standardization

- **Status**: ✅ Complete
- **Goal**: Make WebUI and future mobile clients consume the same stable API contracts from `ReelRoulette Server`.
- **Scope**:
  - Standardize client-facing API contracts/capabilities for desktop/web/mobile parity.
  - Ensure WebUI uses the same API semantics as desktop for migrated behaviors.
  - Scope boundary: playback-session pipeline contracts/capabilities are owned by **Playback Session Contracts and Capability Surface** and are out of scope for this milestone.
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
- **Goal**: Keep desktop playback performant for local/shared-storage scenarios while preserving API-first orchestration and playback-session-series readiness.
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
  - Keep this policy compatible with incremental playback-session work so API-only playback can be forced during that series' validation.
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
  - API-first/thin-client guarantees from the desktop thin-client cutover remain intact for source import, duplicates, auto-tag, playback-stats clear, and logging ownership.
- **Verification evidence**:
  - Desktop manual playback entry points now resolve stable API media identity first and surface explicit guidance when a manual target cannot be mapped.
  - Desktop playback target policy now deterministically selects local playback when media is readable and `ForceApiPlayback=false`, otherwise routes playback through API media URLs.
  - `ForceApiPlayback` is persisted in desktop settings (`desktop-settings.json`), defaults to `false`, and is wired through settings load/apply/save plus settings dialog toggle UX.
  - Random playback target handling now accepts API media URLs (absolute or relative) and resolves relative API media routes against configured core base URL.
  - Playback source type is tracked (`FromPath` vs `FromLocation`) so loop-toggle media recreation and timeline navigation preserve chosen playback-path semantics.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Documentation/tracking updates are synchronized for final milestone state: `README.md`, `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `CHANGELOG.md`, `COMMIT_MESSAGE.txt`.

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
  - OpenAPI updated for this milestone's endpoints/schemas and WebUI generated contracts refreshed (`openapi.generated.ts`).
  
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
  - Prior version-switch runtime dependency is removed from required runtime behavior; `verify-web-deploy.*` now executes this milestone's single-origin smoke checks.
  - Operator UI path `/operator` provides status visibility, runtime settings apply (`/api/web-runtime/settings`), and restart control (`POST /control/restart`, localhost-only).

### M7e - Contract Compatibility and Final M7 Verification Gate

- **Status**: ✅ Complete
- **Goal**: Lock independent-release safety and complete this series sign-off with contract-compatibility guarantees.
- **Scope**:
  - Enforce N/N-1 compatibility policy with capability checks for independent web/core releases.
  - Generate TS web client contracts from OpenAPI; verify C# contract compatibility against the same API source.
  - Execute hybrid verification gate (automated + manual) as required milestone exit criteria.
- **Acceptance criteria**:
  - Web API/event models are generated from OpenAPI and validated in CI.
  - Capability checks prevent unsupported feature usage against older compatible core/server versions.
  - Automated gates pass: build-output asset serving, direct web-to-core SSE/refresh status projection, and OpenAPI compatibility checks.
  - Manual gates pass: direct web connect without desktop bridge, refresh status-line parity through run/fail/complete states, and auth/reconnect continuity.
  - Acceptance criteria across the full direct-web migration sequence are explicitly verified before advancing to the next major phase.
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
  - Remaining post-cutover runtime stabilization issues (settings reopen/apply lockout, LAN apply consistency edge cases, worker/WebHost shutdown orphan cleanup) are explicitly deferred to **Control-Plane UI + API for Runtime Operations**.

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
  - `dotnet test ReelRoulette.sln` passes after this milestone's deployment-host/script changes.
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

### M6b - Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)

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
    - status/progress events are emitted for both auto/manual runs; desktop projects them during this milestone, while direct web/mobile projection is completed in later direct-web milestones when those clients are decoupled from desktop-hosted bridges
  - Move refresh scheduling/config ownership to core host config:
    - support appsettings + CLI override model
    - client settings updates are pushed to core via API and persisted in core settings
    - default auto refresh remains enabled, default interval becomes 15 minutes, idle-only gating settings are removed
  - Define thumbnail artifact policy before feature completion:
    - artifact location convention (for example, `%LOCALAPPDATA%/ReelRoulette/thumbnails/{itemId}.jpg`)
    - invalidation rules (file change/fingerprint change -> thumbnail stale/regenerate)
    - target size/quality and video thumbnail timestamp strategy
- **Acceptance criteria**:
  - Grid view and thumbnail generation work end-to-end through server/core.
  - No standalone legacy duration/loudness actions in UX (as planned).
  - Refresh progress/status remains observable while dialogs close and via `GET /api/refresh/status` + SSE for desktop in this milestone; direct web-to-core SSE status parity is tracked in later direct-web milestones.
  - Core runtime is the single execution owner for unified refresh pipeline and auto-refresh scheduling.
  - Manual refresh is API-triggered (`POST /api/refresh/start`) and returns `409` when a refresh run is already active.
  - Auto-refresh timer baseline is reset when a manual refresh is started.
  - Core config defaults are applied (auto enabled, 15-minute interval, no idle gating settings).
  - Thumbnail artifact/invalidation policy is implemented and documented.
  - Regression tests cover thumbnail invalidation decisions, unified refresh stage sequencing, refresh overlap rejection (`409`), and status/progress projection behavior; all pass in `dotnet test`.

### M6a - Feature Alignment Through API (Web Tag Editing)

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
  - Regression tests for desktop API-client request shape/parsing and this milestone's server-state replay/filter-session behaviors are added to `dotnet test` and passing.

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
