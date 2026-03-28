# Changelog
<!-- markdownlint-disable MD024 -->

This file follows a Keep a Changelog style format.

## [Unreleased]

### Added

- Add Linux AppImage packaging (`tools/scripts/package-serverapp-linux-appimage.sh`, `package-desktop-linux-appimage.sh`, `tools/scripts/lib/appimage-helpers.sh`): outputs under `artifacts/packages/appimage/`, built from portable tarballs; `AppRun` supports `--help` (prereqs) and `--install` (user-local `.desktop` + icons). 
- Add `tools/scripts/install-linux-from-github.sh` to install the latest GitHub release (AppImage preferred, portable tarball fallback; default repo `HugginsIndustries/ReelRoulette`, overridable). Extend `full-release.ps1` on Linux to run AppImage scripts after portable packaging.
- Add Linux portable packaging scripts (`tools/scripts/package-serverapp-linux-portable.sh`, `package-desktop-linux-portable.sh`): self-contained `linux-x64` tarballs under `artifacts/packages/portable/`, WebUI bundled into server `wwwroot`, stripped symbols / no `.pdb` in package tree, `run-server.sh` / `run-desktop.sh` and `README.txt` for native prerequisites.
- Extend `full-release.ps1` to run the Linux portable scripts on Linux after set-release-version; Inno steps remain Windows-only.
- Add repo-local build support for constrained environments via `Directory.Build.props` (`AllowMissingPrunePackageData=true`).
- Add startup-launch host support for `ReelRoulette.ServerApp` (Windows `HKCU` registration), including control-plane APIs and tray/Operator toggles for immediate apply behavior.
- Add installer desktop-shortcut task options with default-checked behavior for both server and desktop installers.
- Add Material Symbols desktop icon-font foundation (`assets/fonts/MaterialSymbolsOutlined.var.ttf`) with shared glyph styles and grid-tile favorite/blacklist overlays.
- Add core-authoritative contracts/client support for library stats, library item state reads, and backup settings synchronization.
- Add one-shot `Force Rescan (Loudness)` and `Force Rescan (Duration)` settings flow from desktop settings to the core refresh pipeline.
- Add server refresh `fingerprintScan` stage: full-file SHA-256 for library items that are Pending, Failed, Stale, or missing a fingerprint, with `fingerprintScanMaxDegreeOfParallelism` in core refresh settings (default 4, clamped 1–16) editable from desktop Settings.

### Changed

- `set-release-version.ps1` now updates desktop `<Version>`, runs WebUI `generate:contracts`, and runs build/test/WebUI/deploy-smoke verify by default; opt out with `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, and/or `-NoRunVerify`. `full-release.ps1` forwards those `-No*` switches (and `-NoDocUpdates`) when `-Version` is set; omit `-Version` on `full-release.ps1` to skip `set-release-version` and package using each `.csproj` `<Version>`. Document behavior in `README.md`, `docs/dev-setup.md`, `CONTEXT.md`, and `docs/domain-inventory.md`.
- Expand `README.md` Quick Start with end-user install paths: Windows installers and portable ZIPs from GitHub Releases, Linux install script / AppImage / tarball, FFmpeg–VLC note, and a separate “Developing from source” subsection for contributors.
- Restructure `README.md` **Packaging** into **Linux**, **Windows**, and **General** subsections with full Linux script commands and shared release/GitHub notes.
- Mark every file under `tools/scripts/` as executable in Git (`100755`) so they can be run as `./tools/scripts/<name>.ps1` or `./tools/scripts/<name>.sh` on Unix when the shebang resolves (`pwsh` / `bash`).
- Expand `README.md` Prerequisites (`bash`/`tar`, Inno Setup, FFmpeg/VLC) and clarify third-party bundling (Windows portable vs Linux/system) in Third-Party Components; align `docs/dev-setup.md` Prerequisites with FFmpeg/VLC notes.
- Linux portable packaging uses executable `tools/scripts/package-*-linux-portable.sh` scripts (invoked directly or from `full-release.ps1` on Linux) alongside existing `pwsh` Windows packaging scripts.
- Standardize contributor-facing docs to POSIX repo-relative paths (`./src/...`, forward slashes) and unified user-data notes in `docs/dev-setup.md` (Windows `%...%` examples use `/` as well).
- Consolidate `tools/scripts` to cross-platform `.ps1` only and align script docs/examples around `pwsh` usage.
- Rename desktop client directory to `src/clients/desktop/ReelRoulette.DesktopApp/` to match `ReelRoulette.DesktopApp.csproj` (update solution, test compile links, packaging/version scripts, and current docs; historical changelog entries unchanged).
- Bump Avalonia packages to **11.3.12** for the desktop client and ServerApp tray host (from 11.3.9).
- Upgrade repo to .NET 10 (`net10.0` / `net10.0-windows`) including CI and run/verify/packaging scripts.
- Switch ServerApp tray host from Windows-only WinForms/`NotifyIcon` to a cross-platform Avalonia tray with deterministic headless fallback when tray is unavailable.
- Implement Linux startup launch via XDG autostart (`*.desktop`) with immediate apply behavior via tray and Operator control surfaces.
- Rename desktop client path and identifiers from legacy `windows` naming to `desktop` naming (keep `Windows` for the OS).
- Polish duplicate-review UX: duplicate groups now render per-item thumbnail previews in review order with explicit desktop bitmap loading from `/api/thumbnail/{itemId}`.
- Add per-group duplicate handling selection: groups can use `Keep All` or a per-item keep selection, with persisted desktop default behavior (`Keep All` or `Select Best`).
- Improve duplicate delete confirmation UX by summarizing groups/files before destructive apply and skipping the confirmation prompt when no groups are selected.
- Improve duplicate item comparison signals: item metadata now includes `Tags: {count}`, and keep-selection dropdown labels now include filename + plays/tags/favorite/blacklisted fields for side-by-side decisions.
- Update filter `Tags` layout to responsive wrapping for parity with tag editor behavior.
- Refine desktop tag-chip visuals toward WebUI parity: white glyph/text, stronger text/icon shadows, and state-specific inset shadows.
- Improve desktop core refresh completion status: single `Core refresh complete | Source | Fingerprint | Duration | Loudness | Thumbnails` summary with compact tokens parsed from stage messages (for example source `no changes`, fingerprint `hashed`/`ready`/`failed`/`skipped` only when non-zero, duration/loudness `files N, all cached`, thumbnail counts emitted only when non-zero).
- Complete desktop Material Symbols migration with shared no-box controls, standardized glyph sizing/checked-state tint and transport layout cleanup, plus `ItemTagsDialog` parity refinements (icon-only footer actions, rounded category bars, responsive wrapping chips, and session-scoped category collapse-state persistence).
- Migrate WebUI overlay and tag-editor controls to Material Symbols, including explicit `play_arrow`/`pause` glyph swapping and local Material Symbols font sync from shared assets.
- Align WebUI tag-editor styling with desktop parity: dark rounded inputs, category header bars, shared orange/lime/violet tag-chip tokens, and stronger consistent text/glyph shadows.
- Implement Windows tray context-menu runtime light/dark theme parity with live refresh on system theme changes.
- Document explicit server `.exe` tray-validation run steps in `README.md`.
- Simplify library filtering UX by removing `Respect filters`; active filter state now applies consistently when present.
- Rework large-library panel performance and stability with keyed diff patching, active-filter eligibility groundwork, exact logical row virtualization, anchor/inset restore with drag-aware coalescing, targeted `last.log` virtualizer diagnostics, and list/grid resize repaint hardening (fixed non-overlay scrollbars, viewport-driven grid width with an 8px right visual gutter, debounced splitter reflow, and forced visible-row refresh when layout changes without index-range changes).
- Add top-right favorite/blacklist indicators on grid thumbnails using Material Symbols with real-time visibility updates.
- Finalize server-authoritative desktop library behavior by removing `LibraryService`, consolidating persistence-first mutation authority in `LibraryOperationsService` (with `ServerStateService` event publication), and routing favorites/blacklist, tags/categories, playback stats, refresh triggers, and library remove flows through core API + SSE reconciliation.
- Move Manage Sources statistics to server-owned `/api/library/stats` and harden source/media counting for legacy library data shapes.
- Finalize backup ownership split: server manages `library.json`/`core-settings.json` backups with no-churn gap policy and retention trimming; desktop backup scope is `desktop-settings.json` only. Timestamped backup filenames use the same format everywhere: local wall time plus a filesystem-safe UTC offset token (`_pHHmm` / `_mHHmm`), while retention/min-gap ordering still uses file UTC timestamps.
- Improve tag/category apply performance by removing redundant full projection sync/rebuild triggers and relying on targeted SSE-driven updates.

### Fixed

- Improve grid-view stability by combining exact row-offset virtualization with drag-aware update gating and anchor/inset offset restoration.
- Keep projection sync as the single trigger for core refresh completion updates to the library panel.
- Improve dynamic-filter refresh behavior (for example `OnlyNeverPlayed`) by adding targeted panel refresh triggers for playback/stat and metadata-related filter changes.
- Ensure playback projection updates apply for same-session events via authoritative projection sync instead of local writebacks.
- Fix edit-tag category display so newly created categories resolve to human-readable names instead of fallback GUID text.
- Ignore repo-local scratch directories for dev runs (`.dotnet/`, `.xdg-data/`).
- Fix server refresh pipeline failures when legacy `library.json` stores enum fields as strings (`mediaType`, `fingerprintStatus`).
- Fix desktop crash when core library projection sends string enum values by accepting both string + integer enum forms during JSON deserialization.
- Fix desktop grid thumbnails not appearing until restart by hydrating thumbnail paths for visible tiles after thumbnail generation completes and as the visible grid window changes.

## v0.10.0 - Platform and Experience Update (2026-03-11)

### Added

- Add `tools/scripts/reset-checklist.ps1` to reset `docs/testing-checklist.md` metadata/checklist state using the current server app version, with default waived-item preservation and optional `-RemoveWaived` cleanup.

### Changed

- Add Windows tray-host runtime path for `ReelRoulette.ServerApp` using native `NotifyIcon` behind host-UI abstraction, while keeping non-Windows runtime headless-compatible.
- Add required tray actions (`Open Operator UI`, `Refresh Library`, `Restart Server`, `Stop Server / Exit`) wired to existing server-authoritative lifecycle/refresh paths.
- Multi-target `ReelRoulette.ServerApp` for `net9.0` (headless) and `net9.0-windows` (`WinExe` no-console path), and include shared `HI.ico` in publish output for tray icon loading.
- Update server run/package/verify script paths for explicit multi-target framework selection (`net9.0-windows` on Windows, `net9.0` otherwise) without introducing single-file publish requirements.
- Synchronize runtime/docs/checklist surfaces for Windows tray baseline verification and shared icon parity requirements.
- Align Windows tray restart/stop shutdown sequencing to marshal tray exit on the UI thread, ensuring deterministic tray teardown and single-instance tray behavior across restart cycles.
- Move desktop app runtime from `source/` to `src/clients/windows/ReelRoulette.WindowsApp/` while preserving behavior.
- Replace placeholder windows-client project files with the shipping desktop app project, source files, and assets.
- Update solution, test-project compile links, desktop packaging scripts, and release-version script to target `ReelRoulette.WindowsApp.csproj` in the new path.
- Synchronize desktop run/package path references in docs (`README.md`, `CONTEXT.md`, `docs/dev-setup.md`, `docs/architecture.md`, `docs/domain-inventory.md`).
- Update `set-release-version.ps1` to sync release command examples in `README.md` and `docs/dev-setup.md` by default, with docs opt-out via `-NoDocUpdates`.
- Remove legacy compatibility projects `ReelRoulette.Worker` and `ReelRoulette.WebHost` from the solution and repository.
- Remove the legacy `source/` desktop runtime tree after path cutover.

### Fixed

- Reduce intermittent server startup failures from port conflicts by changing the default server/web runtime port from `51234` to `45123` and documenting avoidance of ephemeral port ranges (`49152-65535`) for Web UI port choices.

## v0.9.0 - Initial Release (2026-03-09)

- **Attach Windows package artifacts to existing GitHub releases** (2026-03-09):
  - Update `package-windows.yml` with `contents: write` permission so workflow can upload release assets.
  - Add tag-release safety check (`gh release view`) before upload to enforce manual release-first workflow.
  - Upload package outputs (`artifacts/packages/**/*.zip`, `artifacts/packages/**/*.exe`) to the existing tag release via `gh release upload --clobber`.
  - Document final release flow in `README.md` and `docs/dev-setup.md` (manual release notes + automatic asset attachment).

- **Fix desktop package resolver output-stream binding in CI** (2026-03-09):
  - Prevent Chocolatey install command output from leaking into resolver return values during native dependency acquisition.
  - Normalize resolver returns to single-string paths and add array/empty-value guards before `Copy-Item -LiteralPath` operations.
  - Eliminate remaining `Cannot bind argument to parameter 'LiteralPath' because it is an empty string` failures in desktop packaging CI runs.

- **Harden desktop packaging path validation for CI edge cases** (2026-03-09):
  - Add shared non-empty/unique candidate-path filtering in desktop portable and installer packaging scripts before probe resolution loops.
  - Add explicit validation guards for resolved ffprobe and LibVLC source paths prior to copy operations to prevent empty-path argument binding failures.
  - Use `-LiteralPath` checks where applicable during native dependency and Inno candidate probing for safer CI path handling.
  - Strengthen desktop packaging behavior for partially populated CI environment variables without changing the packaging output contract.

- **Fix desktop packaging env-var path handling in CI** (2026-03-09):
  - Fix desktop native dependency resolution for CI runners where one or more Windows Program Files environment variables may be empty.
  - Update desktop portable and installer packaging scripts to guard `Join-Path` candidate creation before probing VLC install locations.
  - Harden desktop Inno `ISCC.exe` candidate probing to avoid `Join-Path` with empty Program Files base paths.
  - Prevent `Cannot bind argument to parameter 'Path' because it is an empty string` failures during native staging on GitHub Actions.

- **Stabilize desktop packaging with native dependency staging** (2026-03-09):
  - Remove hard publish-time runtime file includes from `source/ReelRoulette.csproj` so desktop publish no longer fails when large native files are absent from CI checkouts.
  - Update `package-desktop-win-portable.ps1` and `package-desktop-win-inno.ps1` to stage `ffprobe.exe` and LibVLC files into `runtimes/win-x64/native` after publish.
  - Prefer local repo runtime assets when available, and fall back to Chocolatey acquisition (`ffmpeg`, `vlc`) when packaging on clean CI/agent hosts.
  - Add post-stage validation for required desktop native payload (`ffprobe.exe`, `libvlc.dll`, `plugins`) before creating zip/installer artifacts.
  - Update packaging documentation in `README.md` and `docs/dev-setup.md` to reflect native staging behavior.

- **Stabilize Windows packaging workflow version inputs** (2026-03-09):
  - Fix Windows package workflow version handling by normalizing v-prefixed tag values (for example `v0.9.0`) to semver before invoking packaging scripts.
  - Update manual package workflow default version to `0.9.0` to avoid invalid `dotnet publish -p:Version=...` inputs.

- **Add Linux distribution roadmap and fix Linux CI thumbnail-stage test failures** (2026-03-09):
  - Add planned `M17a`-`M17e` milestones for full Linux distribution readiness covering runtime baseline, packaging, CI gates, documentation, and release sign-off for server + desktop.
  - Fix Linux test-runtime dependency gap by adding `SkiaSharp.NativeAssets.Linux.NoDependencies` to `ReelRoulette.Server`.
  - Validate thumbnail-stage regressions pass in Release test runs (`RefreshPipelineServiceTests.ThumbnailStage*`) and keep the full CI-equivalent Release test gate green.

- **Finalize release-aligned versioning/tooling and documentation cleanup** (2026-03-09):
  - Add `tools/scripts/set-release-version.ps1` to fan out one release version across OpenAPI (`info.version`), runtime `assetsVersion`, release fixtures, and server app project version metadata.
  - Add desktop version participation in the simple release flow (`-UpdateDesktopVersion`) and set desktop project version metadata for release-aligned packaging.
  - Align release version surfaces to `0.9.0` (including OpenAPI version and server `/api/version` assets version semantics).
  - Update Windows packaging scripts so `-Version` is optional and auto-derived from project metadata when omitted.
  - Update server packaging scripts to rebuild WebUI and bundle static assets (`wwwroot`) into publish/install artifacts so packaged runtime includes both WebUI and Operator surfaces.
  - Consolidate app icon usage to shared `assets/HI.ico` and apply it across server/desktop build metadata and installer presentation surfaces.
  - Add WebUI script automation to sync shared icon into `public/HI.ico` on dev/build so favicon updates remain single-source.
  - Add `tools/scripts/full-release.ps1` as an all-in-one release command that chains version fan-out, verification, and server/desktop packaging in canonical order.
  - Add desktop Windows packaging scripts for portable zip and Inno installer (`package-desktop-win-portable.ps1`, `package-desktop-win-inno.ps1`, `tools/installer/ReelRoulette.Desktop.iss`) and extend `package-windows.yml` to publish both server and desktop artifacts.
  - Add Inno Setup auto-detection in `package-serverapp-win-inno.ps1` (PATH, common install paths, registry lookups), removing the strict PATH-only requirement.
  - Consolidate domain inventory references to `docs/domain-inventory.md` and synchronize docs (`README.md`, `CONTEXT.md`, `docs/dev-setup.md`, `docs/testing-checklist.md`) with current scripts and release flow.

- **Implement M8f hardening/packaging/release-readiness operator testing suite + Windows packaging/CI gates** (2026-03-08):
  - Extend control-plane contracts/endpoints for operator testing + diagnostics (`/control/logs/server`, `/control/testing`, `/control/testing/update`, `/control/testing/reset`) and richer connected client/session/SSE identity status.
  - Add server-side testing mode/fault simulation state handling for API version mismatch, capability mismatch, API unavailable, missing media, and SSE disconnect scenarios.
  - Upgrade `/operator` UI with connected identity detail views, server log workbench (tail/filter/search/copy), and testing mode + scenario controls with reset.
  - Add Windows packaging assets for both portable self-contained zip and Inno installer (`tools/scripts/package-serverapp-win-*.ps1`, `tools/installer/ReelRoulette.ServerApp.iss`).
  - Add GitHub Actions workflows for default solution/web verification and Windows packaging artifact publishing.
  - Add regression coverage for operator testing service behavior and OpenAPI control-surface assertions.
  - Add canonical repo-wide manual testing artifact (`docs/testing-checklist.md`).
  - Apply high/medium post-matrix reliability fixes:
    - desktop compatibility gating now blocks API/capability mismatches during runtime probe/reconnect,
    - duplicate/auto-tag scan failures now surface deterministic runtime-recovery guidance instead of silent/noisy false API-required behavior,
    - desktop reconnect/resync flow now reports SSE disconnect/reconnect state and treats projection-sync failures as disconnected runtime,
    - missing-media simulation now preserves random selection and returns deterministic `404 { "error": "Media not found" }` responses on `/api/media/{idOrToken}`.
    - removed desktop locate/remove missing-file dialog handling; desktop now surfaces standard missing-media guidance and relies on server-authoritative refresh/remediation.
    - desktop playback entry points are renamed from `PlayVideo` to `PlayMedia`, and media-type detection now correctly handles API-backed photos.
    - web app module naming is normalized from `legacyApp` to `app`, and web client log source labels are now `webui`.
    - runtime helper scripts are renamed to `run-server` and `run-server-rebuild` (PowerShell and shell variants), replacing old `run-core` and publish-activate helpers.
    - WebUI and Operator UI now load app favicon via `/HI.ico`, eliminating runtime favicon 404 noise.
    - desktop reconnect guidance now preserves explicit API-version/capability mismatch reasons instead of collapsing to generic runtime-unavailable text.

- **Implement M8e WebUI/mobile thin-client contract standardization (identity/session/reconnect parity)** (2026-03-08):
  - Extend OpenAPI contract surfaces with optional `sessionId` and explicit identity/reconnect expectations for `GET /api/events`, random requests, playback-record requests, and authoritative requery payloads.
  - Regenerate WebUI OpenAPI-derived contracts and align server DTOs/composition to accept/propagate `sessionId` without adding new domain logic in `ReelRoulette.Server`.
  - Add `identity.sessionId` capability marker and enforce it in WebUI startup compatibility checks for deterministic contract/version gating.
  - Align desktop identity/session behavior by persisting stable `CoreClientId`, generating per-runtime `CoreSessionId`, propagating both on random/playback/SSE calls, and reconnecting SSE with revision replay hints.
  - Align WebUI legacy + modular seams to propagate `clientId`/`sessionId` through random, requery, and SSE reconnect paths.
  - Add regression coverage across core and web tests for session propagation, capability gating, and SSE reconnect URL/header behavior.
  - Verify end-to-end gates pass: `dotnet build`, `dotnet test`, WebUI `npm run verify`, and `tools/scripts/verify-web-deploy.ps1`.

- **Implement M8d desktop playback policy compromise (local-first playback + API fallback with deterministic manual identity routing)** (2026-03-08):
  - Add deterministic desktop playback target selection in `MainWindow`:
    - local playback when media path is readable and `ForceApiPlayback=false`,
    - API media playback (`/api/media/...`) when local access fails or `ForceApiPlayback=true`.
  - Route manual library-panel playback through stable identity resolution before playback-path selection and show explicit user guidance when mapping fails (no silent substitute/random reroute).
  - Update random playback target handling to accept API media URLs (absolute or relative) and resolve relative API media paths against configured core base URL.
  - Track playback source type (`FromPath` vs `FromLocation`) so loop-toggle media recreation and timeline navigation preserve the selected playback path semantics.
  - Add persisted desktop setting `ForceApiPlayback` (default `false`) and wire it through settings load/save + Settings dialog playback tab.
  - Add API client regression coverage ensuring random-response absolute `mediaUrl` values are preserved for playback target resolution.
  - Synchronize M8d milestone/docs/tracking artifacts (`MILESTONES.md`, `CONTEXT.md`, `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `COMMIT_MESSAGE.txt`).

- **Implement M8c desktop thin-client cutover (API-first ownership + centralized logging)** (2026-03-07):
  - Remove desktop auto-start/supervision of core runtime and switch to guidance-only availability behavior.
  - Switch desktop default core endpoint to `http://localhost:51234` (`MainWindow` + `SettingsDialog` defaults/hints).
  - Add server-side reusable API surfaces for migrated desktop operations:
    - `POST /api/sources/import`
    - `POST /api/duplicates/scan`, `POST /api/duplicates/apply`
    - `POST /api/autotag/scan`, `POST /api/autotag/apply`
    - `POST /api/playback/clear-stats`
    - `POST /api/logs/client`
  - Add `LibraryOperationsService` in server for source import, duplicate scan/apply, auto-tag scan/apply, and client-log ingestion.
  - Rewire desktop UI orchestration:
    - import flow in `MainWindow`,
    - duplicate flows in `ManageSourcesDialog` + `DuplicatesDialog`,
    - auto-tag scan/apply via API in `AutoTagDialog` + `MainWindow`,
    - playback-stats clear now routed through API command path in `MainWindow` instead of local-only mutation.
  - Centralize logging to server:
    - desktop local `last.log` writes removed from dialog/app/service call sites,
    - new `ClientLogRelay` routes client log events to server API,
    - ServerApp resets centralized `last.log` on startup.
  - Extend OpenAPI contract and regenerate WebUI generated contracts for new M8c endpoints/schemas.
  - Harden API-required desktop behavior:
    - disable local `library.json` load/write paths unconditionally in desktop service layer,
    - add server-backed library projection endpoint (`GET /api/library/projection`) and hydrate desktop library/stats from API snapshot instead of local fallback,
    - remove local-to-core tag-catalog/item-tag push paths from desktop startup/tag-editor prep.
  - Harden connectivity diagnostics:
    - increase desktop version-probe timeout/retry behavior,
    - include explicit HTTP/timeout diagnostic reasons in unavailable status message.

- **Implement M8b control-plane UI + API runtime operations expansion** (2026-03-07):
  - Add control-plane API namespace under `/control/*` with status/settings/pair/restart/stop operations (`/control/status`, `GET/POST /control/settings`, `GET/POST /control/pair`, `POST /control/restart`, `POST /control/stop`).
  - Add control settings persistence and deterministic apply-result contract (`accepted`, `restartRequired`, `message`, `errors[]`) with optional admin token auth policy.
  - Add control auth/trust enforcement model for shared-listener runtime:
    - localhost control access remains available,
    - LAN control access is blocked unless runtime LAN bind is enabled,
    - control pairing uses scoped session cookies and optional token requirement.
  - Expand operator UI to responsive dark theme with runtime lifecycle controls, incoming/outgoing API telemetry feed, and connected-client visibility.
  - Add telemetry service + control status snapshot projection for API event activity and active paired-session/SSE subscriber counts.
  - Extend verification coverage:
    - OpenAPI contract + core test assertions for control endpoints/capabilities,
    - auth/settings/runtime option regressions for control policy behavior,
    - `verify-web-deploy.ps1/.sh` checks for control status/settings endpoints in the consolidated runtime smoke path.
  - Sync M8b milestone/docs/domain inventory/tracking artifacts (`MILESTONES.md`, `CONTEXT.md`, `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `COMMIT_MESSAGE.txt`).
  - Follow-up runtime hardening:
    - add ServerApp-owned mDNS advertisement for LAN WebUI hostname (`{LanHostname}.local`) in the consolidated runtime path,
    - harden restart/stop single-flight behavior to avoid repeated lifecycle-trigger duplication,
    - make replacement launch deterministic under `dotnet run` by relaunching explicit entry assembly path.

- **Implement M8a server app consolidation (single process, single origin)** (2026-03-06):
  - Add `src/core/ReelRoulette.ServerApp` as the default runtime host serving API, SSE, media, WebUI static assets, dynamic `/runtime-config.json`, and operator UI (`/operator`) in one process.
  - Add explicit capability endpoint `GET /api/capabilities` plus OpenAPI contract updates (`CapabilitiesResponse`, `RestartResponse`, and `POST /control/restart`).
  - Add minimal operator control surface with runtime status/settings apply and localhost-only deterministic restart action.
  - Update core runtime scripts (`run-core.ps1`, `run-core.sh`) to launch `ReelRoulette.ServerApp` and update compatibility helper `publish-activate-run-worker.ps1` to build WebUI and run server app.
  - Repurpose `verify-web-deploy.ps1` / `verify-web-deploy.sh` into M8a single-origin smoke checks instead of WebHost manifest-switch validation.
  - Remove WebHost supervision from Worker startup path and synchronize milestone/docs/tracking artifacts for final M8a state (`MILESTONES.md`, `CONTEXT.md`, `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`).
  - Follow-up hardening for operator/runtime behavior:
    - keep default server-app runtime port at `51234`,
    - make WebUI `enabled` semantics explicit (WebUI-only gating with `404` when disabled, API/SSE/media still available),
    - enforce two-step settings apply + restart expectations for listen/auth/WebUI changes,
    - improve operator status panel text wrapping/scroll behavior to prevent card overlap,
    - harden `verify-web-deploy.ps1` with fail-fast timeouts and startup log diagnostics so failures are actionable instead of appearing stuck.

- **Implement M7e contract compatibility guards and final M7 verification gate** (2026-03-06):
  - Add OpenAPI-driven TS contract generation for WebUI (`openapi-typescript`) with committed generated artifact (`src/types/openapi.generated.ts`).
  - Add generated-contract freshness verification (`npm run verify:contracts`) and make it part of default WebUI verify gate.
  - Extend `VersionResponse` contract with compatibility metadata (`minimumCompatibleApiVersion`, `supportedApiVersions`) and explicit `capabilities[]`.
  - Add server-side version/capability mapping defaults and web-side compatibility gating for unsupported API versions/capability sets.
  - Add compatibility regression coverage in WebUI (`authBootstrap` capability/version checks) and core tests (`ServerContractTests` contract/OpenAPI invariants).
  - Add M7e manual verification checklist artifact (`m7e-final-verification-checklist.md`) and update milestone/docs context for final M7 sign-off.

- **Implement M7d controlled cutover, legacy WebRemote retirement, and worker-owned web runtime** (2026-03-06):
  - Migrate the legacy WebRemote UX into `ReelRoulette.WebUI` with parity for player controls, touch gestures, refresh-status projection, and tag-editor workflows.
  - Remove legacy embedded WebRemote runtime/resources (`source/WebRemote/*`) and desktop bridge contracts after gate approvals.
  - Shift web runtime ownership to core/server + worker flows:
    - add `CoreSettingsService` for core-owned runtime settings persistence,
    - add worker-hosted `WebUiHostSupervisorService` (WebHost process lifecycle),
    - add worker-hosted `WebUiMdnsService` (`*.local` discoverability).
  - Add dynamic CORS origin registration (`DynamicCorsOriginRegistry`) and host-aware `runtime-config.json` rewriting in `ReelRoulette.WebHost` to support localhost/LAN hostname/LAN-IP clients.
  - Canonicalize server-owned preset/random/filter behavior for desktop + WebUI parity (`/api/presets`, `/api/presets/match`, `/api/random` filter-state-first semantics), and remove legacy filter-session runtime paths.
  - Split desktop/client-local vs core-owned setting boundaries, remove temporary migration compatibility flags/services completed during cutover, and align docs/checklists to final M7d end-state.
  - Defer post-cutover runtime stabilization issues (settings reopen lockout, LAN apply edge consistency, orphaned host cleanup hardening) to `M8b`.

- **Implement M7c zero-restart web deployment, caching, and rollback** (2026-03-05):
  - Add independent static web host project (`ReelRoulette.WebHost`) that serves immutable versioned web artifacts selected by atomic `active-manifest.json` pointer.
  - Add deployment orchestration scripts for publish/activate/rollback across PowerShell and Bash (`publish-web.*`, `activate-web-version.*`, `rollback-web-version.*`).
  - Enforce split cache policy in the web host (`index.html` + runtime config as `no-store`; fingerprinted assets as long-lived `immutable`).
  - Add cross-platform deployment smoke verification scripts (`verify-web-deploy.ps1`, `verify-web-deploy.sh`) covering active version switch, cache headers, and rollback without host restart.
  - Update milestone/context/docs/domain inventory artifacts for final M7c state (`MILESTONES.md`, `CONTEXT.md`, `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`).

- **Implement M7b direct web-to-core auth/session and SSE reliability** (2026-03-05):
  - Add direct WebUI auth bootstrap flow that pairs via `/api/pair`, verifies API authorization, and uses credentialed requests for ongoing API/SSE access.
  - Introduce server-side session-id cookie auth semantics (HTTP-only cookie storing generated session id, configurable same-site/secure/session duration policy).
  - Add explicit runtime-configurable CORS policy controls (`EnableCors`, `CorsAllowedOrigins`, `CorsAllowCredentials`) and browser-preflight-safe auth middleware behavior.
  - Extend `/api/events` reconnect handling with `lastEventId` query fallback and replay/live dedupe guard based on delivered revision tracking.
  - Add WebUI SSE reconnect/watchdog/lifecycle reconnect flow with direct `refreshStatusChanged` status-line projection and `resyncRequired` authoritative requery fallback (`/api/library-states` + `/api/refresh/status`).
  - Add regression coverage for server auth middleware/session-cookie behavior, cookie/CORS policy normalization matrix, and WebUI auth/event helper modules (including `resyncRequired` requery handling).
  - Update OpenAPI/docs/milestone inventory artifacts for final M7b state (`README`, `CONTEXT`, `docs/api.md`, `docs/dev-setup.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `MILESTONES.md`).

- **Implement M7a independent web client foundation and runtime endpoint bootstrap** (2026-03-05):
  - Replace `src/clients/web/ReelRoulette.WebUI` placeholder-only state with a canonical Vite + TypeScript web client project (real app bootstrap, styling, and runtime-config-aware startup flow).
  - Add runtime endpoint config contract loading (`window.__REEL_ROULETTE_RUNTIME_CONFIG` fallback to `/runtime-config.json`) with strict URL validation and startup error surfacing for invalid/missing config.
  - Add web runtime-config schema regression tests and build-output validation gate (`npm run verify`) covering typecheck, tests, production build, and artifact assertions.
  - Add cross-platform helper scripts for repeatable web verification from repo root (`tools/scripts/verify-web.ps1`, `tools/scripts/verify-web.sh`).
  - Verify project health with automated gates (`npm run verify`, `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`) plus web dev bootstrap smoke (`npm run dev` startup).
  - Mark M7a complete in `MILESTONES.md` and synchronize milestone-state docs (`README.md`, `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`).

- **Implement M6b unified refresh pipeline and desktop grid/thumbnail API flow** (2026-03-01):
  - Add M6b contract surface to OpenAPI and server contracts for refresh start/status/settings plus thumbnail retrieval.
  - Implement `RefreshPipelineService` as core-owned execution owner for sequential refresh stages (source refresh, duration scan, loudness scan for new/unscanned items, thumbnail generation).
  - Add overlap guard semantics (`already running` / `409`), run status snapshots, SSE `refreshStatusChanged` publication, and core settings persistence/defaults (enabled, 15-minute interval).
  - Wire refresh and thumbnail routes into shared server host composition and register runtime options in both server and worker hosts.
  - Extend desktop core API client with typed refresh settings/status/start methods and DTOs.
  - Migrate desktop Manage Sources refresh action to API-only core refresh start path; refresh can continue after dialog close.
  - Remove standalone desktop library menu actions for `Scan Durations` and `Scan Loudness` after pipeline integration.
  - Add desktop list/grid library view toggle persistence (`🖼️`) and justified responsive grid composition with aspect-ratio-preserving variable-size thumbnails.
  - Move thumbnail artifact storage to `%LOCALAPPDATA%\\ReelRoulette\\thumbnails\\{itemId}.jpg`, persist per-item thumbnail index metadata (`revision`, `width`, `height`, `generatedUtc`), and backfill legacy index entries.
  - Add 500ms refresh-status projection throttling for thumbnail stage updates to reduce SSE/UI churn on large libraries.
  - Add M6b regression coverage for refresh overlap rejection, stage sequencing, loudness scan semantics, thumbnail invalidation/regeneration/metadata backfill behavior, and refresh API client request/response shapes.
  - Keep direct web-to-core refresh-status SSE parity scoped to M7 web/desktop decoupling; M6b finalizes desktop projection + core status contracts.
  - Mark M6b milestone as complete and normalize docs to the final projection scope (desktop in M6b; direct web-to-core parity in M7).
  - Update M6b documentation (`README`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `MILESTONES.md`) to reflect final-state contracts and behavior.

- **Implement M6a API-first tag editing parity (desktop + web)** (2026-03-01):
  - Add batch-ready tag editor contract surface (`/api/tag-editor/*`) to OpenAPI and server endpoint composition for item-tag deltas plus tag/category CRUD flows.
  - Extend server state with tag catalog/item-tag projection methods and publish revisioned `itemTagsChanged` / `tagCatalogChanged` SSE events.
  - Extend desktop `CoreServerApiClient` with typed tag-editor commands/queries and add desktop SSE projection handling for new tag events.
  - Migrate desktop tag dialog orchestration (`ItemTagsDialog` and main-window bulk tag handlers) to API-first mutation paths via `ITagMutationClient`, then remove legacy `ManageTagsDialog` source and redundant Library menu entry.
  - Extend legacy web-remote API services/endpoints with tag-editor routes and add a full-screen web tag editor UI (including playback/photo-autoplay pause/resume behavior while editing).
  - Add desktop-to-core catalog hydration (`POST /api/tag-editor/sync-catalog`) and startup/connect sync behavior to prevent sparse tag catalogs from regressing dialog/editor category mappings.
  - Rework web tag editor interactions to a touch-first combined layout with collapsible category sections, inline category move/delete controls, staged tag/category actions applied in one batch on `Apply`, desktop-like chip corner radius, and desktop-style button hover/press/toggle feedback.
  - Keep chip background colors tied to current item state (`all/some/none`) while pending add/remove intent is shown on `+/-` toggle buttons (orange selected state before apply).
  - Extend web tag edit flow to support both rename and reassignment to an existing category via dropdown.
  - Ensure web tag editor shows a single `Uncategorized` bucket only when uncategorized tags exist and renders current-item tag-state highlighting from synchronized item-tag snapshots.
  - Normalize migrated tag flows to canonical `uncategorized` category semantics: deleting a category reassigns its tags to `uncategorized` (fixed ID), and `Uncategorized` is always available in category dropdowns while remaining hidden in category lists when empty.
  - Align desktop `ItemTagsDialog` control layout with the combined editor pattern: top controls (`➕ Category`, `🔄`, `❌`), bottom action row (`category`, `tag name`, `➕ Tag`, `✅️`), and chip control order `➕`, `➖`, `✏️`, `🗑` with shared icon button styles.
  - Align web editor control labels to icon-only `🔄` (refresh), `✅️` (apply), and `❌` (close) for consistent cross-client affordances.
  - Add desktop inline category header controls (`↑`, `↓`, `🗑`) with shared square icon button styling and keep web footer controls in a single-row small-screen layout with flexible tag-name input.
  - Update desktop `ItemTagsDialog` category delete/reorder semantics to match staged-apply behavior: delete warns on click, category UI updates locally (including uncategorized projection), and backend mutations occur only on `Apply` while `Close` discards staged category changes.
  - Make desktop `ItemTagsDialog` API-model-first at open/refresh, support no-selection open (disabling `+/-` item-assignment toggles in that mode), and use it as the primary desktop tag-management entry path.
  - Add category inline `edit` control in both desktop and web (`up`, `down`, `edit`, `delete` order), prevent duplicate category names, and normalize web uncategorized grouping to avoid duplicate `Uncategorized` sections.
  - Isolate desktop tag-editor staged state from shared live library objects so category/tag staging no longer leaks into persisted library state before `Apply`.
  - Add M6a regression coverage for tag API request shapes and server-side tag mutation/event behavior.
  - Update M6a docs/artifacts (`README`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`).

- **Implement M5 desktop API-client state migration flow** (2026-03-01):
  - Add a desktop `CoreServerApiClient` layer for worker/server query-command calls plus SSE event consumption.
  - Migrate desktop favorite/blacklist/playback/random command flow to API-first behavior and remove local state-mutation fallback for migrated paths.
  - Add desktop SSE projection handling for `itemStateChanged` and `playbackRecorded` updates to keep UI state synchronized with out-of-process changes.
  - Harden desktop SSE reliability with a dedicated long-lived SSE client, reconnect loop behavior, and case-insensitive payload projection to prevent dropped updates.
  - Add filter/preset session sync endpoint contract (`GET/POST /api/filter-session`) and server state support for filter-session projection snapshots.
  - Contain legacy web-remote mutation path by routing through the same desktop API-delegated mutation helpers.
  - Enforce backend favorite/blacklist mutual exclusion so server projections cannot persist both flags as true for the same item.
  - Switch desktop lifecycle UX to automatic core runtime startup on launch probe failure (remove manual Start/Auto-start menu actions).
  - Update OpenAPI/docs/README to reflect M5 API surface and desktop API-client + SSE synchronization behavior.

- **Implement M4 worker runtime, pairing/auth primitive, and desktop core lifecycle UX** (2026-03-01):
  - Refactor `ReelRoulette.Server` startup into shared endpoint composition so both server and worker hosts use the same API/SSE/auth mapping.
  - Convert `ReelRoulette.Worker` from scaffold placeholder into a real console-first host with lifecycle logging and graceful shutdown wiring.
  - Add pairing/auth primitive on the core server seam (`/api/pair` GET/POST, cookie/token auth middleware, optional localhost trust, and auth-required behavior for non-pair endpoints).
  - Add desktop lifecycle UX for headless core runtime (`View > Start Core Runtime`, optional auto-start, probe-driven status messaging).
  - Replace `tools/scripts/run-core.ps1` and `tools/scripts/run-core.sh` placeholders with functional worker launch scripts and runtime configuration flags.
  - Expand OpenAPI/docs/README for M4 runtime/auth behavior and explicitly document server-thin guardrails for future milestones.

- **Finalize M3 reconnect/resync contract and runtime behavior** (2026-03-01):
  - Add `POST /api/library-states` to `ReelRoulette.Server` and OpenAPI for authoritative item-state re-fetch during reconnect recovery.
  - Add SSE reconnect handling in `ReelRoulette.Server` for `Last-Event-ID` replay and emit `resyncRequired` when revision gaps exceed replay retention.
  - Extend server state service with bounded replay history and revision-aware library state projections.
  - Extend verification checks with replay/state-resync coverage in both xUnit contract tests and system-check harness.
  - Update M3 documentation (`docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `README.md`) to reflect final reconnect semantics.

- **Implement M3 contract-first server seam and initial API boundary proof** (2026-03-01):
  - Expand `shared/api/openapi.yaml` from health-only to initial M3 query/command endpoints and typed SSE envelope schema (`revision`, `eventType`, `timestamp`, `payload`).
  - Add typed server contract models and mapping helpers under `src/core/ReelRoulette.Server/Contracts`.
  - Implement thin `ReelRoulette.Server` endpoint handlers for `version`, `presets`, `random`, `favorite`, `blacklist`, `record-playback`, and SSE events.
  - Add in-memory server state/event service with revisioned envelope publishing for SSE streaming.
  - Add desktop local HTTP probe for `/api/version` to prove one local HTTP state/query integration seam.
  - Extend verification coverage with server contract/revision tests and system-check harness revision sanity checks.
  - Update API/architecture docs to reflect M3 contract-first server boundary.

- **Implement M2 storage/state service layer and hybrid verification foundation** (2026-03-01):
  - Add core storage abstractions and JSON-backed atomic storage services (`IAtomicUpdateStorageService`, `JsonFileStorageService`, and typed `LibraryIndexStorageService`/`SettingsStorageService` wrappers).
  - Add core runtime state services for randomization scope state, filter session snapshots, and playback session primitives.
  - Refactor desktop persistence paths to use core storage adapters in `LibraryService`, `MainWindow` settings flows, and `FilterStateService` while keeping existing JSON schema compatibility.
  - Wire web client session randomization state to the new core randomization state service.
  - Add shared reusable verification entrypoint `CoreVerification.RunAll()` for randomization/filter/tag/DTO contract checks.
  - Convert `ReelRoulette.Core.Tests` to framework-based `dotnet test` structure and add xUnit verification test coverage.
  - Add `ReelRoulette.Core.SystemChecks` console harness that reuses shared verification logic and supports verbose system-check output.
  - Update architecture and development setup docs with M2 storage/state layering and verification workflow guidance.

- **Kick off M0/M1 migration foundation and core extraction** (2026-03-01):
  - Add migration solution scaffold and target folders/projects: `ReelRoulette.Core`, `ReelRoulette.Server`, `ReelRoulette.Worker`, `ReelRoulette.WindowsApp` (placeholder), `ReelRoulette.WebUI` (placeholder), plus `shared/api/openapi.yaml`.
  - Add baseline migration docs for architecture, API, setup, and M1 domain inventory.
  - Extract pure randomization, filtering, tag mutation, and fingerprint helper logic into `src/core/ReelRoulette.Core`.
  - Convert desktop `FilterService`, `RandomSelectionEngine`, `FileFingerprintService`, and `LibraryService` tag/duplicate flows into adapters that route to core services.
  - Add `ReelRoulette.Core.Tests` lightweight unit test harness covering randomization, filter set building, and tag mutation behavior.

- **Stabilize autoplay media handoff and tighten privacy-safe diagnostics** (2026-03-01):
  - Fix end-of-video autoplay hangs by guarding duplicate `EndReached` handling and avoiding synchronous `MediaPlayer.Stop()` during end-triggered transitions before prior media disposal.
  - Improve playback-transition diagnostics with explicit stop/dispose logging around prior-media teardown.
  - Fix filter-apply settings persistence to save on the UI thread so `SaveSettingsInternal` does not read UI-owned values from background threads.
  - Strengthen log sanitization by redacting multiline `Tags:` payloads and preset names/fields (quoted preset names plus active/selected preset values) across preset-related logs.

- **Implement enhanced random selection modes across desktop and web** (2026-02-28):
  - Replace legacy no-repeat behavior with a shared `RandomizationMode` model: `PureRandom`, `WeightedRandom`, `SmartShuffle`, `SpreadMode`, `WeightedWithSpread`.
  - Add shared random selection engine/runtime state used by both desktop and web for consistent mode behavior and state rebuild when eligible sets change.
  - Desktop random playback now routes through mode-based selection logic; no-repeat menu/toggle controls are removed.
  - Desktop settings migrate to persisted `RandomizationMode` with one-time forced migration to `SmartShuffle`.
  - Add desktop Library panel randomization dropdown directly under preset selection, matching preset dropdown styling and width (no extra label).
  - Web `POST /api/random` now honors per-client `randomizationMode` and uses per-client mode-aware randomization state.
  - Add web header randomization dropdown (no extra label), persisted client-locally and sent with random requests.
  - Add web `POST /api/record-playback` and UI playback reporting so web playback updates `PlayCount`/`LastPlayedUtc`, keeping weighted selection accurate.
  - Preserve existing back/forward/autoplay history semantics: forward history is consumed before requesting a new random item.

- **Harden settings reliability and privacy-safe diagnostics** (2026-02-28):
  - Web Remote port input in Settings is widened so full 5-digit ports are fully visible while editing.
  - Settings open is now re-entrancy guarded so repeated open requests do not create overlapping dialog flows.
  - Applying settings avoids unnecessary side effects when values are unchanged (no-op apply path).
  - Auto-refresh timer restart runs only when auto-refresh settings actually change.
  - Web Remote server restart runs only when Web Remote settings change, and stop/start uses async await flow instead of UI-thread blocking waits.
  - Loop media reinitialization now runs only when loop mode actually changes.
  - Settings logs now clearly distinguish cancel, no-op apply, and effective apply paths.
  - Add timing diagnostics for settings operations (`dialog lifecycle`, `apply flow`, `auto-refresh timer restart`, `web remote stop/start/restart`, `SaveSettings`) to speed up freeze/hang triage.
  - Add settings open-path diagnostics (`create`, `load`, `ShowDialog` call/return, dialog opened/closed events, 5s watchdog) plus exception stack logging to isolate modal open hangs.
  - Distinguish true user-driven control changes from programmatic state sync during startup/apply (`UI ACTION` vs `STATE SYNC`) so diagnostics remain trustworthy.
  - Prevent `settings.json` writes while settings are loading and preserve existing preset data if in-memory presets are not initialized.
  - Add dedicated Settings Backup options (enable, minimum gap, count) with defaults matching library backups.
  - Add settings backup retention in the shared `backups` folder using timestamped files (`settings.json.backup.*`) with keep/replace behavior aligned to library backup policy.
  - Write `settings.json` via temp-file replacement flow to reduce partial-write/corruption risk.
  - Add preset-count guardrail diagnostics at settings load to compare persisted and in-memory preset counts before normal runtime saves.
  - Route app logs through a centralized sanitizer that redacts file paths, filename-like tokens, and tag payloads to avoid personal data leakage in bug reports.

- **Add scheduled auto-refresh for enabled sources** (2026-02-28):
  - Settings include `Auto-refresh sources`, `Refresh interval (minutes)`, `Run only when idle`, and `Idle threshold (minutes)` with persisted defaults.
  - Auto-refresh runs in the background after UI load, targets enabled sources only, and uses accurate per-source refresh with no fast mode.
  - Soft-idle gating defers runs during recent user activity or active library jobs while allowing playback to continue.
  - Progress/status updates are shown during auto-refresh (`source x/y`, phase, fingerprint progress) and remain until replaced by a newer status.
  - Refresh jobs run sequentially, aggregate counters, save once per run, and refresh library UI/statistics after completion.
  - Concurrency guards prevent overlap with manual source refresh and duration/loudness scans.
  - Lifecycle/defer/progress/final summaries are logged to `last.log` with throttled progress logging.

- **Add GUID identity, fingerprinting, and duplicate management foundation** (2026-02-28):
  - `LibraryItem` carries stable `Id` plus fingerprint metadata (`Fingerprint`, algorithm/version, file size, last-write, status, timestamp), and `LibraryIndex` carries a global fingerprint index map.
  - Load path performs in-memory ID/fingerprint migration and index rebuild first; non-essential migration save and fingerprint queue warmup run after UI is shown.
  - `FileFingerprintService` computes full-file SHA-256, and `FingerprintCoordinator` handles background queueing, progress snapshots, checkpoint saves, and throttled `last.log` diagnostics.
  - Source refresh runs as a blocking accurate pass with progress phases (`scan`, `analyze`, `fingerprinting x/y`, `reconcile`) and finalizes `Added/Removed/Renamed/Moved/Updated/Unresolved` only after candidate fingerprint comparison.
  - Refresh reconciliation is changed-set scoped (missing/new paths) so small reorganizations avoid whole-library metadata sweeps.
  - Path-change classification is explicit: same-folder name change counts as `Renamed`; directory/source change counts as `Moved` (including move+rename).
  - Deferred post-fingerprinting reconciliation resolves remaining unresolved path changes when exact hash evidence becomes available.
  - Main status line shows fingerprint progress (`Fingerprinting: completed/total complete`) with responsive throttling.
  - Manage Sources refresh summary includes added/removed/renamed/moved/updated/unresolved counters.
  - Duplicate workflow supports per-run scope selection, exact SHA-256 grouping, manual keep choice per group, type-to-confirm permanent delete (`DELETE`), and failure-safe retention when disk delete fails.

- **Add Auto Tag workflow for Library items** (2026-02-27):
  - Add `Library -> Auto Tag` entry that opens a dedicated scan/apply dialog.
  - Add `AutoTagDialog` with explicit `Scan Files` action, `Scan Full Library` toggle, `View All Matches` toggle (default off), and per-tag counts for both `Total matched` and `To be changed`.
  - Add global `Select All` / `Deselect All`, default unselected file matches, and tag-level toggles that select/deselect all visible files under each tag.
  - Add expandable per-tag file lists with individual file-level selection for precise apply behavior.
  - Implement case-insensitive substring matching against filename (without extension), relative-path segments, and path text, supporting multi-tag matches per item.
  - When `View All Matches` is off, show only files that would change and hide tags with zero `To be changed` while preserving true `Total matched` counts.
  - Update scan status messaging to show selected-vs-total pending changes (`selected/total`) so selection impact is explicit.
  - Add add-only tag application behavior (never removes existing tags), batch-save after apply, and refresh library/current-file UI state after changes.
  - Persist `Scan Full Library` preference in app settings (default `true`), saving only on `OK` and not on `Cancel`.

- **Implement Local Web Remote UI (Preset-Based Streaming Webapp)** (2026-02-27):
  - Add Web Remote settings (Settings > Web Remote tab): enable/disable, port, bind on LAN, auth mode (off/token), shared token, and configurable LAN hostname (default `reel`).
  - Self-host Kestrel HTTP server with minimal APIs; start when enabled, stop on disable or app exit.
  - Provide Web Remote API endpoints:
    - `GET /api/version`
    - `GET /api/presets`
    - `POST /api/random`
    - `GET /api/media/{token}`
    - `GET/POST /api/pair`
    - `POST /api/favorite`
    - `POST /api/blacklist`
    - `POST /api/library-states`
    - `POST /api/events/ack`
    - `POST /api/events/client-log`
    - `GET /api/events` (SSE)
  - Add media streaming with HTTP Range support for seeking in video/audio.
  - Add optional shared-token auth with pairing flow (cookie-based), auto-generate token when auth is enabled and token is blank, allow static UI assets without auth, and show pairing form when API returns 401.
  - Add per-client session store for history (Previous, repeat avoidance).

  - **Embedded static Web UI (`web-remote-dev` override supported)**:
    - **Top bar and metadata**:
      - responsive top bar with title/status, preset selector, photo duration, and now-playing metadata.
      - move status text from header to below media container; remove footer version text.
      - rename `Photo` label to `Photo Duration`, add spacing before `s`, and hide desktop number-input spinners.
      - truncate long now-playing filenames to 45 chars with ellipsis and show full filename via hover tooltip.
    - **Media layout and rendering**:
      - serve from embedded resources with optional disk override (`web-remote-dev` folder).
      - fullscreen via media container; preload/playsinline support.
      - stop video when switching to photo (fix audio bleed).
      - evolve layout from initial wider design to full-width viewport behavior:
        - remove `#app` max-width cap.
        - replace fixed 16:9 with flexible media sizing.
        - lock page to viewport height (`100dvh` + `overflow: hidden` + flex `min-height: 0`) so media fits available space with `object-fit: contain`.
    - **Playback controls and behavior**:
      - custom overlay controls: prev/play/next/favorite/blacklist/loop/autoplay/fullscreen + seek bar.
      - place favorite (★) and blacklist (👎) controls together in the top-right media overlay corner, ordered as ★ then 👎 to match desktop.
      - no native video controls.
      - loop/autoplay as toggle buttons (🔂➡️).
      - photo duration range: 1–300s.
      - history navigation (prev/next) separate from random; next/autoplay play through history before random fallback.
      - touch gestures: swipe left/right prev/next (next loads random at end); fix tap/click double-fire on mobile.
      - update interaction model so tap/click toggles overlay visibility (persistent across media changes), remove tap/click play-pause on media, remove auto-hide/hover auto-show, and reduce overlay opacity.
      - prevent seek/overlay touches from triggering swipe previous/next by excluding overlay-origin touches and stopping overlay touch propagation (`touchstart`/`touchmove`/`touchend`), while letting non-control overlay space click through to media-container tap/click handlers (overlay toggle and initial empty-state click).
    - **Sync UX and error/status feedback**:
      - favorite/blacklist buttons (★👎) sync to desktop library via API.
      - show synced status text on web for desktop-driven favorite/blacklist changes regardless of currently loaded media.
      - show explicit status on favorite/blacklist API failures.
      - empty-state copy updated to: `Select a preset and click here`.

  - Add real-time desktop↔web sync hardening:
    - SSE `/api/events` for desktop→web live sync (`LibraryItemChanged`).
    - normalize SSE path matching (case/slash-insensitive) to prevent toggle desync.
    - cache synced favorite/blacklist state per media path so updates apply even when different media is currently playing.
    - apply cached state when loading random/history media to keep toggles consistent across devices.
    - add `/api/library-states` reconcile endpoint and client resync on SSE open/pair for missed updates.
    - add periodic reconcile polling fallback (reduced to 5s) and lifecycle reconnect triggers (`visibility`/`focus`/`pageshow`/`online`).
    - add SSE event IDs + Last-Event-ID replay buffer.
    - include `clientId` in SSE and add `/api/events/ack` lag tracking.
    - add ACK heartbeat from web clients and prune stale ACK clients to keep telemetry accurate.
    - force anti-buffering SSE behavior (`no-transform`, `X-Accel-Buffering: no`, `DisableBuffering`).
    - auto-reconnect SSE (including after pairing), add SSE ping events, client watchdog stale reconnect, and `retry: 1000`.
    - fix client revision ordering by preventing local optimistic updates from using timestamp revisions that outrank server SSE revisions.
    - add detailed Web Remote sync logging to `last.log` (connect/disconnect/replay/reconcile/API mutations/broadcast recipients/ack lag/heartbeat-lifecycle reconnect/SSE stale reconnect/client errors via `/api/events/client-log`).

  - Make favorite/blacklist API behavior idempotent so stale web state self-recovers.
  - Broadcast desktop-side library/context-menu/favorites-panel favorite/blacklist mutations to SSE clients.
  - Refresh desktop library/global stats and show synced status for web-originated favorite/blacklist changes even when a different media file is currently loaded.
  - Add `Open Web Remote` menu item (View) to launch browser when enabled.
  - Keep desktop playback alignment updates: Next loads random at end of timeline; autoplay plays through history before new random.
  - Add LAN discoverability and convenience:
    - true mDNS/DNS-SD advertisement (`_http._tcp`) using configured hostname (`<hostname>.local`) with host/path TXT hints.
    - proper unadvertise/cleanup on server stop/restart.
    - optional LAN port-80 redirect listener (when available) forwarding `http://<hostname>.local` to configured Web Remote port; fallback to explicit `:<port>` when port 80 is unavailable.
  - Default remains: disabled, localhost-only, port `51234`.

- **Fix Volume Control Issues** (2026-01-08):
  - **Volume Slider**: Fixed lag when dragging by adding debounce; applies immediately on release
  - **Mute Bug**: Fixed inability to unmute videos during playback
  - **Normalization**: Simplified from 4-mode system to single On/Off checkbox; new algorithm reduces loud videos while minimally boosting quiet videos; uses library baseline (75th percentile) or manual override; advanced settings exposed (Max Reduction 1-30 dB, Max Boost 0-10 dB, baseline mode Auto/Manual); defaults: 15 dB reduction, 5 dB boost; settings persist and apply immediately; cache resets after scanning or settings change
  - **Loudness Scanning**: Replaced volumedetect with EBU R128 ebur128 filter for accurate perceptual loudness (LUFS); scan dialog offers "Only new files" or "Rescan all" options; backward compatible with old scan data; fixed detection of -91.0 dB "no audio" placeholder
  - **Stats Panel**: Current file shows loudness adjustment (boost/reduction applied); global stats show baseline loudness with mode indicator (Auto/Manual); loudness values now shown in LUFS (EBU R128 standard)
  - **Settings**: Volume normalization migrated to boolean, defaults off; shows warning when enabled without loudness data
  - **Additional**: Fixed audio spike during video transitions; all volume controls respect mute state; fixed volume slider drag from muted state to preserve user's position; fixed missing loudness warning flag reset

- **Implement Tag Categories and Tag Renaming System** (2026-01-08):
  - Complete hierarchical tag system with categories and advanced filtering
  - **Data Model**: TagCategory and Tag classes with category-based organization
  - **Migration System**: Automatic detection and mandatory migration dialog for flat tags
  - **ManageTagsDialog**: Complete redesign with category grouping, reordering, edit buttons, orphaned tag handling, default category selection, alphabetically sorted tags within categories
  - **ItemTagsDialog**: Category-grouped tags with edit functionality, orphaned tag handling, multi-tag addition preserving selection states, default category selection, alphabetically sorted tags within categories, 1200x800 default size with persistent bounds
  - **FilterDialog**: Per-category local match modes (ANY/ALL within category) and single global match mode (AND/OR between categories), orphaned tag handling, preset loading prevented from marking presets as modified, alphabetically sorted tags within categories, 1200x800 default size with persistent bounds, local match mode dropdown width 150px
  - **FilterService**: Advanced filtering logic supporting "ANY Genre AND ALL People" style filters, single global match mode (defaults to AND) for combining categories, orphaned tags properly filtered, category-aware filtering used when categories exist
  - **Tag Renaming**: Comprehensive rename across library items (includes static utility methods for updating filter presets)
  - **Tag Deletion**: Removes tags from all items (includes static utility methods for updating filter presets)
  - **Orphaned Tags**: Tags on items but not in LibraryIndex.Tags appear in "Uncategorized" category (prevents invisible tags after failed migrations, properly included in filtering)
  - **Backward Compatibility**: Supports both new category-based and legacy flat tag formats
  - **UI Enhancements**: Tags alphabetically sorted within categories across all dialogs; info panel displays tags grouped by category on separate lines; dialogs persist size/position across sessions including multi-monitor setups
  - **Dialog Persistence**: ItemTagsDialog and FilterDialog remember window size and position across sessions including multi-monitor support (stored in AppSettings with ItemTagsDialogX/Y/Width/Height and FilterDialogX/Y/Width/Height properties)
  - All existing features (batch operations, filter presets, search) continue to work
  - Mandatory migration on first run with old format (app closes if user cancels)
  - Example filtering: "(Action OR Comedy in Genre: ANY) AND (Tom Hanks in People: ALL)" with global AND between categories

- **Fix: Explicitly set _originalPresetState when creating new preset** (2026-01-06):
  - Explicitly set _originalPresetState when creating new preset instead of relying on SelectionChanged event (fixes Apply button logic when event doesn't fire)

- **Fix: Filter Preset State Tracking Bugs** (2026-01-06):
  - Set _originalPresetState during FilterDialog initialization when active preset is provided (fixes Apply button logic when preset is active on dialog open)

- **Implement Filter Presets (Saved Filter Configurations)** (2026-01-06):
  - Add filter presets feature allowing users to save and quickly apply commonly used filter configurations
  - New "Presets" tab in FilterDialog with three sections:
    - Choose Preset dropdown (includes "None" as default option)
    - Create New Preset from current filter settings
    - Manage Presets list with rename (via dialog), delete, and reorder (up/down) operations that fills available space
  - Presets stored in settings.json alongside other app settings
  - Active preset name displayed in FilterDialog header: "Configure Filters - Active Preset: {name}"
  - Filter preset dropdown added to library panel (below filter summary row, above view/source/sort controls)
  - Preset selection in library panel loads immediately and applies filters automatically (no Apply button needed)
  - Selecting "None" in library panel clears active preset but preserves current filter settings
  - Filter summary always displays current filter configuration (not preset name)
  - Preset selection in FilterDialog instantly loads filter configuration into dialog (still requires Apply to save)
  - Preset reordering changes dropdown display order in both FilterDialog and library panel
  - All preset operations logged for debugging
  - Changed FilterDialog title from "Filter Videos" to "Filter Media" for consistency
  - Filter presets persist across app restarts
  - Show an asterisk appended to the active preset name in FilterDialog header when current filters differ from the selected preset (e.g., "MyPreset*")
  - Add "Update Preset" button next to the Choose Preset dropdown to overwrite the selected preset with current filter settings and clear the asterisk
  - Track modified state across all filter changes (booleans, media type, audio, duration, tag match, tag selections); button enabled only when changes exist
  - Added logging for preset modification and update actions
  - Clear active preset name when Apply is clicked with modified filters (prevents mismatch between displayed preset and actual filter state)
  - Create deep copy of presets list in FilterDialog to prevent cancelled changes from persisting
  - Fallback to select "None" in library panel preset dropdown if active preset name doesn't match any existing preset
  - Suppress preset loading during FilterDialog initialization to prevent overwriting passed-in filter state
  - Clear active preset name when fallback to "None" occurs in library panel (prevents UI mismatch when preset is deleted)
  - Compare actual filter states instead of modification flag when applying filters (prevents clearing active preset when filters are reverted to match preset)
  - Auto-detect and auto-select matching presets when filters are manually configured to match a preset (removes asterisk and selects preset automatically)

- **Fix: Prevent silent data loss in tags dialog when library service is unavailable** (2026-01-05):
  - Fixed critical bug where ItemTagsDialog would silently fail to save tags if _libraryService was null
  - Dialog now checks for null library service before attempting to save
  - Shows error message to user if library service is unavailable instead of silently closing with success
  - Prevents tag modifications from being lost when app restarts due to failed persistence

- **Improve library list UX and keyboard shortcuts** (2026-01-05):
  - Removed tag button from library list items (only play and show in file manager buttons remain)
  - Added keyboard shortcut T for managing tags/metadata dialog
  - Added keyboard shortcuts to all control bar button tooltips for better discoverability
  - Removed keyboard shortcut hint from "Always On Top" menu item (no longer has a shortcut)
  - Tooltips now show format: "Action description (keyboard shortcut)" for consistency

- **CRITICAL FIX: Remove favorite/blacklist toggles from library list to prevent data loss** (2026-01-04):
  - Removed favorite and blacklist toggle buttons from library list items to prevent virtualization recycling bugs
  - ListBox virtualization was recycling UI elements and causing bindings to incorrectly toggle favorites/blacklist
  - Favorites and blacklist can still be managed via:
    - Keyboard shortcuts (F for favorites, B for blacklist - for the currently playing video/photo)
    - Control bar toggle buttons (for the currently playing video/photo)
    - Right-click context menu batch operations (for multiple selected items)
  - Added visual indicators in library list: ⭐ for favorites and 👎 for blacklisted items (shown before file name)
  - Made favorites and blacklist mutually exclusive: adding to favorites removes from blacklist and vice versa
  - This eliminates the root cause of data loss while maintaining all functionality
  - Also fixed critical data integrity bug in LibraryService.UpdateItem() that could cause metadata to disappear
  - Changed UpdateItem to update properties in place instead of replacing the item reference
  - All item properties are now preserved when updating: SourceId, FullPath, RelativePath, FileName, MediaType, Duration, HasAudio, IntegratedLoudness, PeakDb, IsFavorite, IsBlacklisted, PlayCount, LastPlayedUtc, Tags

- **Enhance Statistics Panel with context-aware display** (2026-01-04):
  - Renamed "Current Video" section header to "Current File" for consistency with photo support
  - Added context-aware visibility: video-specific stats (duration, has audio, loudness, peak) automatically hidden when displaying photos
  - Renamed UpdateCurrentVideoStatsUi() method to UpdateCurrentFileStatsUi() throughout codebase
  - Stats panel now adapts display based on MediaType (Video/Photo), showing only relevant information for each media type

- **Enhance Filter Dialog with tabbed interface and tag inclusion/exclusion** (2026-01-04):
  - Split filter dialog into two tabs: General (all filters except tags) and Tags (tag-specific filtering)
  - Enhanced tag filtering UI: 3-column grid layout with color-coded tag boxes (green = included, orange = excluded, violet = neither)
  - Add tag exclusion support: tags can be explicitly excluded from results using minus button
  - Tag inclusion (plus button) and exclusion (minus button) are mutually exclusive per tag
  - Match mode options (All selected AND / Any selected OR) moved to top of Tags tab
  - Filter state persistence includes both included and excluded tags
  - Filter dialog now uses working copy pattern: changes are only applied when OK/Apply is clicked, Cancel properly discards modifications
  - Filter summary text now displays both tag inclusion and exclusion counts (e.g., "3 tag(s) included (any), 2 tag(s) excluded")
  - Fixed case-insensitive tag comparison bugs: FilterService and FilterDialog now use StringComparison.OrdinalIgnoreCase for all tag operations to ensure consistent filtering behavior regardless of tag case

- **Implement batch operations in Library panel** (2026-01-03):
  - Add multi-select support to Library panel ListBox with standard desktop selection patterns (Ctrl+Click, Shift+Click)
  - Add context menu with batch operations: Add/Remove from Favorites, Add/Remove from Blacklist, Add/Remove Tags, Remove from Library, Clear Playback Stats
  - Add filter/selection count display showing "🎯 n filtered • 📝 n selected"
  - Implement selection tracking that persists across filter changes
  - Context menu items dynamically enabled/disabled based on selection state
  - Batch operations show status messages and update library panel after completion
  - Selection cleared when source changes
  - Enhanced ItemTagsDialog for batch operations:
    - Modified to accept `List<LibraryItem>` for consistent UX (works with single or multiple items)
    - New UI: rounded boxes with color-coded backgrounds (lime green = all items have tag, Huggins orange = some items, violet = none)
    - Plus/minus toggle buttons side-by-side for adding/removing tags from all selected items
    - New tags automatically select plus button for adding to all items
  - Added RemoveItemsDialog confirmation dialog showing item count before removal
  - Tags dialog UI improvements: 3-column layout, increased default size, removed title line
  - Fixed TagState calculation bug: zero items edge case incorrectly marked tags as "AllItemsHaveTag" (now correctly shows "NoItemsHaveTag")
  - Fixed selection count display: now properly updates after filter changes when selection is restored
  - Optimized library panel updates: removed unnecessary forced refresh that caused list to disappear/reload
  - Added scroll position preservation: library panel maintains scroll position during filter/search updates using anchor item (SelectedIndex or previous anchor path)
  - Fixed scrollbar drag reset issue: improved scroll anchor detection to use SelectedIndex when available, fallback to previous anchor path when scrolling without selection
  - Optimized batch tag operations: skip full library panel rebuild for tag-only changes when tag filters aren't active
  - Library panel header UI improvements: removed "n selected" from header line, centered header and filter/selection count lines, unified text styling (white text, larger font), unified bullet separator (•) across both lines

- **Fix photo loading race condition** (2026-01-03):
  - Fix race condition where multiple photo loading tasks can complete out of order and overwrite current photo display
  - Validate that loaded photo is still current before updating UI to prevent stale photo loads from overwriting newer photos
  - Add validation checks in success, error, and missing file handlers to ensure only current photo updates are applied

- **Fix inconsistent UI text and data consistency issues after photo support added** (2026-01-03):
  - Fix library info text to include photo count when library index is null (matches format used elsewhere)
  - Update status message from "Finding eligible videos..." to "Finding eligible media..." for consistency
  - Update status message checks to use "Finding eligible media..." instead of "Finding eligible videos..."
  - Fix stale video count in library info text: recalculate both video and photo counts in async callback to prevent inconsistent display
  - Fix MediaType not updated for existing items during import: update MediaType based on current file extension to correct items imported before photo support
  - Fix blacklist toggle using stale item data with virtualization: use FindItemByPath() like favorites handler to prevent incorrect state changes when scrolling
  - Fix missing file handler incorrectly detecting file type: detect photo/video from file extension in PlayFromPathAsync instead of hardcoding isPhoto: false
  - Fix photo bitmap resource leak: clear _currentPhotoBitmap reference in exception handler to prevent disposing already-disposed object
  - Fix photo bitmap resource leak during InvokeAsync setup: dispose bitmap if exception occurs during UI thread invocation setup
  - Fix photo bitmap scope issue: move bitmap declaration before try block to ensure it's accessible in catch handlers
  - Fix photo bitmap double-disposal: set bitmap to null after disposal when PhotoImageView is unavailable to prevent outer catch handler from disposing again
  - Fix photo bitmap double-disposal in inner exception handler: set bitmap to null after disposal to prevent outer catch handler from disposing again
  - Fix photo bitmap double-disposal in InvokeAsync setup exception handler: set bitmap to null after disposal before re-throwing to prevent outer catch handler from disposing again
  - Fix Image control dangling reference: clear PhotoImageView.Source before disposing bitmap when exception occurs during photo display to prevent rendering errors
  - Fix cross-thread UI access violations: marshal StatusTextBlock updates to UI thread after GetEligiblePoolAsync() completes on background thread
  - Fix cross-thread UI access violations in PlayRandomVideoAsync: marshal StatusTextBlock updates to UI thread when method is called from background threads (e.g., from MediaPlayer_EndReached)

- **Refactor project structure** (2026-01-03):
  - Move all program files (.cs, .axaml, .csproj, app.manifest) into `source/` subfolder
  - Keep markdown files (.md), .gitignore, and resource folders (licenses, runtimes) at repository root
  - Move assets folder from root to `source/` folder for proper Windows taskbar icon embedding
  - Update .csproj file paths to reference root-level folders (licenses, runtimes) with relative paths
  - Improve project organization and maintainability

- **Implement automatic library backup system** (2025-12-29):
  - Add automatic backup creation at program exit (before saving library)
  - Add backup settings to General tab in Settings dialog:
    - "Backup Library?" checkbox (default: enabled)
    - "Minimum Backup Gap" numeric input (1-60 minutes, default: 15)
    - "Number of Backups" numeric input (1-30 backups, default: 10)
  - Smart backup retention logic:
    - During testing (frequent restarts < minimum gap): Replaces most recent backup to preserve older backups
    - During normal use (>= minimum gap): Deletes oldest backup for normal rotation
  - Backup files stored in {AppData}/ReelRoulette/backups/ directory
  - Backup naming format: library.json.backup.YYYY-MM-DD_HH-MM-SS
  - All backup operations logged with comprehensive error handling
  - Backup failures don't prevent library save (non-blocking)
  - Prevents data loss during frequent testing by intelligently managing backup retention

- **Add comprehensive statistics and improve stats panel UI** (2025-12-29):
  - Add photo and aggregate media statistics: GlobalTotalPhotosKnown, GlobalTotalMediaKnown, GlobalUniquePhotosPlayed, GlobalUniqueMediaPlayed
  - Add never-played statistics: GlobalNeverPlayedPhotosKnown, GlobalNeverPlayedMediaKnown
  - Rename GlobalNeverPlayedKnown to GlobalNeverPlayedVideosKnown for consistency
  - Update RecalculateGlobalStats to distinguish videos from photos in all calculations
  - Reorganize stats panel with logical grouping: Library Totals, Playback Statistics, Never Played, Library Management, Video Audio Stats
  - Change main header from "Stats" to "Global Stats" and "Current video" to "Current Video"
  - Increase header sizes (big headers 16px, section headers 14px) and make all headers bold and white
  - Improve visual hierarchy and readability of statistics display

- **Implement library panel virtualization for large libraries** (2025-12-28):
  - Replace ItemsControl with ListBox for native virtualization support in Avalonia
  - Only visible items are rendered, dramatically improving performance with 10,000+ item libraries
  - Eliminates 5-10 second lag and UI freezing when loading large libraries
  - Maintains all existing functionality: search, sort, filters, multi-column layout, selection, keyboard navigation
  - Smooth scrolling and UI responsiveness even with 50,000+ item libraries
  - Performance now consistent regardless of library size

- **Add comprehensive photo support with mixed slideshow functionality** (2025-12-28):
  - Add MediaType enum (Video/Photo) and MediaTypeFilter (All/VideosOnly/PhotosOnly) for media type distinction
  - Library system now scans and categorizes both videos and photos during import
  - Photo playback using Avalonia Image control with configurable display duration (1-3600 seconds)
  - Image scaling options: Off, Auto (screen-based), Fixed (user-defined max dimensions) for high-resolution images
  - Media type filtering integrated into FilterService and FilterDialog UI
  - Statistics updated to distinguish videos from photos (separate counts and playback stats)
  - Missing file handling for photos with configurable default behavior (show dialog or auto-remove)
  - Auto-continue playback when missing photos are removed from library
  - Support for extensive image formats: JPG, PNG, GIF, BMP, WebP, TIFF, HEIC, HEIF, AVIF, ICO, SVG, RAW formats
  - Photos integrated into queue system and random playback alongside videos

- **Fix audio output bug after volume persistence** (2025-12-19):
  - Fix bug where audio had no output when unmuted due to mute state not being explicitly set to false
  - Changed PlayVideo method to always set `_mediaPlayer.Mute` to match saved `_isMuted` preference
  - Previously only set mute state when _isMuted was true, leaving player muted from previous state when unmuted
  - Now ensures mute state is always synchronized with saved preference when starting playback

- **Implement centralized Settings dialog with persistence** (2025-12-19):
  - Add Settings dialog accessible from View → Settings (S) menu or 'S' keyboard shortcut
  - Settings dialog features General (placeholder) and Playback tabs
  - **CRITICAL FIX:** Loop, Auto-play, Mute state, Volume level, and No Repeat settings now persist across app restarts
  - **Mute state and volume level persist directly** - app restores exact volume and mute state from last session
  - Volume level (0-200) now persists between sessions - any volume setting is remembered
  - Consolidate seek step, volume step, and volume normalization settings into Settings dialog
  - Remove redundant submenus from Playback menu (Seek Step, Volume Step, Volume Normalization)
  - Keep "No Repeats Until All Played" and "Set Interval" in Playback menu for quick access
  - Add Apply/OK/Cancel button pattern (consistent with FilterDialog)
  - All playback settings now automatically persist when changed via UI controls or dialog
  - Mute button and volume slider now save state when toggled/changed
  - Add comprehensive Settings dialog with all playback preferences in one location
  - Create SettingsDialog.axaml and SettingsDialog.axaml.cs with WasApplied pattern
  - Extend AppSettings class with LoopEnabled, AutoPlayNext, IsMuted, VolumeLevel, NoRepeatMode fields
  - **Fix keyboard shortcuts not working reliably** - add Focusable="True" to Window
  - Add debug logging to keyboard shortcut handler for diagnostics
  - Remove overly restrictive filtering that blocked shortcuts when buttons had focus
  - **Fix settings sync issue** - prevent recursive SaveSettings calls with _isApplyingSettings flag

- **Fix library panel width not restored on startup** (2025-12-19):
  - Apply saved library panel width in Loaded event handler when panel is visible on startup
  - Ensures width is applied after Grid is fully initialized
  - Fixes issue where panel would use default XAML width instead of user's saved width
  - Previously, width was loaded from settings but not applied during window initialization

- **Fix library panel collapse and size persistence** (2025-12-19):
  - Fix blank area appearing when library panel is hidden via View menu
  - Dynamically clear MinWidth constraint (set to 0) when hiding panel to allow proper collapse
  - Add _libraryPanelWidth field to track panel width independently from Bounds property
  - Capture panel width before hiding to preserve user's resize preference
  - Restore saved width and MinWidth constraint when showing panel again
  - Add GridSplitter DragCompleted event handler to track manual resizing via splitter
  - Update SaveSettings() to capture and save panel width at hide/show time, not just on exit
  - Apply same MinWidth clearing logic to player view mode for consistent behavior

- **Restructure and expand task tracking**:
  - Add comprehensive priority system (P1/P2/P3) with clear impact definitions
  - Reorganize all TODO items by priority level for better planning
  - Standardize entry format: Title, Priority, Impact, Description, Implementation, Notes
  - Add 11 new proposed features with detailed specifications
  - Move completed features to archive section
  - Add implementation guidelines and contribution workflow
  - Total: 2 P1 items, 7 P2 items, 7 P3 items

- **Fix window state restoration for FullScreen mode**:
  - Add explicit handling for FullScreen state (value 3) in window restoration logic
  - Previously, closing in FullScreen would restore as Normal instead of FullScreen
  - Intentionally restore Minimized state (1) as Normal to avoid starting hidden
  - Add comprehensive logging for all window state restorations

- **Add Source Management UI**:
  - Add comprehensive source management dialog with enable/disable, rename, remove, and refresh functionality
  - Display per-source statistics (video count, total duration, audio/no-audio counts)
  - Add inline enable/disable checkboxes in Library panel source ComboBox
  - Add UpdateSource() and GetSourceStatistics() methods to LibraryService
  - Filter out items from disabled sources in Library panel and playback queue
  - Rebuild queue automatically when source enabled state changes
  - Show empty state message when no sources exist
  - Add "Manage Sources" menu item in Library menu
  - Set default source name to folder name when importing (e.g., "Movies" instead of blank)
  - Fix concurrent library save errors with dedicated save lock and atomic file replace
  - Improve Library panel layout and UX:
    - Remove MaxWidth constraint, make ComboBoxes fill column width evenly
    - Add right margin to items to prevent scrollbar overlap
    - Add text trimming to file names, display full paths
    - Increase MinWidth to 400px and prevent splitter from clipping content
  - Add window state persistence (position, size, maximized state, panel widths):
    - Save and restore window position, size, and maximized state
    - Save and restore Library panel splitter width
    - Set WindowStartupLocation to Manual and Position before window initialization
    - Track position changes with custom _lastKnownPosition field (Avalonia Position property unreliable)
    - Properly handles multi-monitor setups and arbitrary window positions
    - Window always opens exactly as user left it, in the same location
    - Throttle position change logging to once per second to avoid log spam
  - Fix empty state display bug in ManageSourcesDialog

- **Status line stability and scan throttling**:
  - Enforce minimum 1s display for status messages with coalesced updates and logging for delayed/cancelled updates
  - Throttle duration and loudness scan progress updates to once per second while preserving completion messages

- **Fix missing file dialog bugs and UI improvements**:
  - Fix status message overwrite: Remove unconditional status message after library item removal to preserve error messages
  - Fix library item consistency: Clear RelativePath when file is moved outside all sources to prevent data inconsistency
  - Fix save pattern inconsistency: Await library save in HandleLocateFileAsync to match RemoveLibraryItemAsync behavior
  - Fix tags display: Add text wrapping to tags line in stats panel for videos with many tags

- **Add missing file dialog for library management**:
  - Show dialog when video file no longer exists during playback
  - Allow users to remove missing files from library or locate and update file paths
  - Automatically update library item paths when user locates moved files
  - Update source references and relative paths when files are relocated
  - Remove old "Periodic Cleanup of Stale Loudness Stats Entries" TODO (replaced with user-driven solution)

- **UI reorganization and improvements**:
  - Remove Library/Filter Info Row: Moved library information and filter controls into Library panel header
  - Reorganize Library panel: New header layout with library stats, filter summary, unified controls row, and search
  - Unified button styles: Create four consistent button style classes (IconToggleLarge, IconToggleSmall, IconMomentaryLarge, IconMomentarySmall) for all icon buttons throughout the UI
  - Move filter and tags buttons: "Select filters" and "Manage tags for current video" buttons moved to main Controls row for better accessibility
  - Replace checkbox with toggle: "Respect filters" control now uses toggle button style (IconToggleSmall) instead of checkbox
  - Update keyboard shortcuts: Reassign number keys (D1-D8) for view toggles (D1=Menu, D2=Status, D3=Controls, D4=Library Panel, D5=Stats Panel)
  - Add keyboard shortcuts to menus: All menu items now display their keyboard shortcuts in parentheses (e.g., "Show Menu (1)", "Fullscreen (F11)")
  - Status line improvements: Status line always displays a meaningful message, shows "Ready: Library loaded." on startup
  - Remove redundant UI elements: Removed "Remove from view" button, "Auto-play next on end" menu item, "Remember last folder" menu item, redundant "Filter..." menu item
  - Standardize menu naming: All menu items use consistent capitalization and remove ellipses for cleaner appearance
  - Stats panel: Made non-resizable with fixed width, removed movable divider

- **UI improvements and fixes**:
  - Add "Manage tags for current video" button (moved to Controls row)
  - Standardize all icon buttons: Make all buttons square with rounded edges and centered icons
  - Unify filter button styling: Library panel "Filter..." button now matches "Select filters..." button (same icon and style)
  - Fix no-repeat mode: Properly prevent duplicate videos until all eligible videos have been played
  - Improve no-repeat queue logic: Exclude already-queued videos when rebuilding, filter out ineligible items when filters change
  - Performance optimization: Skip File.Exists checks in filtering operations for UI display and queue building (file existence still validated during actual playback)

- **Major: Library Refactor - Transform to library-based system**:
  - Replace folder-based model with persistent library system using `library.json`
  - New unified Library panel replaces separate Favorites, Blacklist, and Recently Played panels
  - Add Library Sources: Import and manage multiple folder sources, enable/disable individual sources
  - Add Tags system: Create and manage tags, assign tags to individual videos, filter by tags (AND/OR logic)
  - Add unified FilterDialog: Single source of truth for all filtering (favorites, blacklist, audio, duration, tags, playback status)
  - Add Library Info Row: Display library statistics and quick access to filter configuration
  - Consolidate data storage: Merge favorites, blacklist, durations, playback stats, loudness stats, and history into `library.json`
  - Consolidate settings: Merge playback settings, view preferences, and filter state into `settings.json`
  - Add one-time data migration: Automatically migrate existing data from legacy JSON files into new library structure
  - Update random playback: Now uses library system with filter state instead of folder scanning
  - Update stats panel: Now calculates from library data, includes tags display for current video
  - Performance improvements: Async library info calculation to prevent UI blocking, optimized filtering operations
  - Remove legacy UI: Old panel toggles, folder selection row, and separate filter controls removed

- **Add comprehensive logging system**:
  - Unified logging: All application logging consolidated into single `last.log` file in AppData directory
  - Logging coverage: Added detailed logging across all major operations:
    - Application startup and initialization
    - Media playback operations (play, pause, stop, seek, volume changes)
    - Library operations (load, save, import, updates)
    - Scanning operations (duration and loudness scans)
    - UI event handlers (button clicks, menu actions, user interactions)
    - File and folder operations
    - Error handling and exception logging
    - State changes (filter updates, queue rebuilds, settings saves)
  - Timestamped entries: All log entries include precise timestamps for debugging
  - Log rotation: `last.log` is overwritten on each application run for easy access to latest session

- **Add audio statistics and scan status improvements**:
  - Distinguish between "no audio" videos (successful scan) and genuine errors during loudness scanning
  - Add separate counters for no-audio files vs errors in scan status messages
  - Improve scan progress updates: update every file with throttling (max once per 100ms) instead of every 50 files
  - Add `HasAudio` property to loudness metadata to track audio presence
  - Add backward compatibility handling for existing loudness stats without `HasAudio` field
  - Fix: Videos with -91.0 dB loudness (placeholder value) now correctly marked as no-audio
  - Add global audio statistics: "Videos with audio" and "Videos without audio" counts in Stats panel
  - Add current video audio stats: "Has audio" status and loudness/peak dB values in Stats panel

- **Add audio filter mode for playback**:
  - New filter modes: Play all, Only with audio, Only without audio
  - Audio filter settings moved to Playback menu
  - Filter persists in playback settings and applies to random/queue selection
  - Direct play actions (favorites, blacklist, etc.) always work regardless of filter mode

- **Improve volume normalization algorithm**:
  - Increase target loudness from -18.0 dB to -16.0 dB for better perceived volume
  - Increase max gain adjustment from ±12.0 dB to ±20.0 dB for very quiet videos
  - Add peak-based limiter to prevent loud videos from exceeding -3.0 dB (prevents clipping/distortion)
  - Use PeakDb data to inform limiting decisions alongside MeanVolumeDb
  - Refactor normalization calculation into single helper method for consistency

- **Add FFmpeg logging window**:
  - New "Show FFmpeg logs" option in View menu
  - Displays detailed FFmpeg execution logs (exit codes, output, results) in separate non-modal window
  - Includes Copy Logs and Clear buttons for debugging loudness scanning issues
  - Auto-refreshes every 2 seconds to show new logs during scanning

- **UI improvements**:
  - Remove "(all libraries)" suffix from global stats labels for cleaner display
  - Add peak dB display to current video stats in Stats panel

- **Add volume normalization system** with four modes:
  - Off: No normalization (direct volume control)
  - Simple: Real-time normalization using LibVLC `normvol` audio filter only
  - Library-aware: Per-file loudness adjustment only (no real-time filter)
  - Advanced: Both per-file loudness adjustment and real-time normalization
- Add loudness scanning feature: scan video library to measure mean volume and peak levels per file
- Add persistent loudness statistics storage (loudnessStats.json)
- Add volume normalization menu controls in Playback menu
- Add "Scan loudness…" option in Library menu for per-file loudness analysis
- Extend NativeBinaryHelper with GetFFmpegPath() for loudness scanning
- Library-aware and Advanced modes automatically adjust volume per-file based on scanned loudness data
- Fix: Switching normalization modes during playback now properly recreates media with correct options
- Fix: Mute button now correctly preserves user volume preference instead of normalized volume value

- **Improve duration scanning reliability**:
  - Replace TagLib# duration scanning with FFprobe for significantly improved reliability (works on virtually all video formats)
  - Fix thread-safety issues in semaphore initialization and permit leak in duration scanning

- **Bundle native dependencies**:
  - Bundle FFprobe and LibVLC native libraries to eliminate external dependencies
  - Add NativeBinaryHelper for platform-aware binary path resolution with caching
  - Add license attribution for bundled third-party components (GPL-3.0, LGPL-2.1)
  
- **Performance improvements**:
  - Move loop restart work off the UI thread to reduce freezes when videos restart
