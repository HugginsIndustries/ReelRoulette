# ReelRoulette Testing Checklist

Use this checklist for full-regression passes and milestone validation. Check boxes inline as you go.
Use `tools/scripts/reset-checklist.ps1` to reset metadata/check states before starting a new validation pass.

## Test Run Metadata

- Test date/time: 2026-03-10
- Tester: Christian Huggins
- Branch/commit: main / Refactor: move desktop app to windows client path and streamline release flows
- Release version: v0.9.1-dev
- Environment (OS + device(s) + browser(s)): Windows-PC (desktop app + Firefox browser), Android (Chrome Browser), iPad (Chrome Browser)
- Test mode:
  - [x] Full regression sweep
  - [ ] Targeted regression (list impacted areas):

## Global Preconditions

- [x] `dotnet build ReelRoulette.sln` passes.
- [x] `dotnet test ReelRoulette.sln` passes.
- [x] WebUI verify passes (`npm run verify` in `src/clients/web/ReelRoulette.WebUI`).
- [x] `ReelRoulette.ServerApp` starts without fatal startup errors.
- [x] Desktop app can connect to server.
- [x] WebUI reachable from localhost.
- [x] Mobile web reachable from LAN (if LAN scenario is in scope).

## Desktop Core UX

- [x] Desktop loads and shows current runtime status without crash.
- [x] Random play works from active preset.
- [x] Manual library play works.
- [x] Previous/next timeline navigation works.
- [x] Loop toggle works.
- [x] Autoplay toggle works.
- [x] Volume/mute controls work.
- [x] Fullscreen/player-view transitions work.
- [x] No stale/incorrect status text after playback actions.
- [x] `View -> Diagnostics` opens and shows `CoreClientId`/`CoreSessionId`.

## Desktop Library + Tagging + Sources

- [x] Import folder works (or fails with clear guidance). (waived)
- [x] Manage Sources opens and source enable/disable persists.
- [x] Duplicate scan + apply flow works (if test data exists).
- [x] Auto Tag scan + apply works (if test data exists).
- [x] Favorites toggle updates item state.
- [x] Blacklist toggle updates item state.
- [x] Tag editor apply/remove updates item tags as expected.
- [x] Clear playback stats flow works with confirmation.

## WebUI Core UX (Localhost)

- [x] WebUI bootstraps without runtime-config errors.
- [x] Pair/auth flow works for current auth mode. (waived)
- [x] Random play works.
- [x] Manual controls (prev/play-next) work.
- [x] Loop/autoplay toggles work.
- [x] Favorite/blacklist actions work.
- [x] Tag editor flows work (open/edit/apply/close).
- [x] SSE status transitions are user-friendly (`connected`, `reconnecting`, `resync` paths).

## Mobile Web UX (LAN)

- [x] Mobile web can connect and play media.
- [x] Core controls are usable on touch.
- [x] Tiny diagnostics panel appears below status line.
- [x] Mobile `clientType`/identity appears in Operator Connected Clients.

## Operator UI Core

- [x] Page layout renders in expected order:
  - ReelRoulette Server
  - Web Runtime Settings
  - Control Settings
  - Operator Testing Suite
  - Connected Clients
  - Server Logs
  - Incoming/Outgoing API Events
- [x] Connected Clients panel shows differentiated rows (`clientType`, `deviceName`, `clientId`, `sessionId`, `remoteAddress`, `connected`).
- [x] Connected Clients `Copy` button works.
- [x] Server Logs refresh works without changing filters.
- [x] Server Logs copy works.
- [x] Incoming/outgoing event tables update during activity.
- [x] Control settings apply flow behaves correctly. (waived)
- [x] Restart/stop lifecycle buttons behave correctly.

## Operator Testing Suite Scenarios

- [x] Testing Mode OFF blocks scenario/fault actions.
- [x] Testing Mode ON enables scenario/fault actions.
- [x] Admin auth policy enforcement matches mode: (waived)
  - `AdminAuthMode=Off` allows testing actions unauthenticated.
  - `AdminAuthMode=TokenRequired` requires control auth.
- [x] API version mismatch scenario produces deterministic client UX.
- [x] Capability mismatch scenario produces deterministic client UX.
- [x] API unavailable scenario produces recoverable client behavior.
- [x] Missing media scenario shows clear playback guidance (no crash).
- [x] SSE disconnect scenario triggers reconnect/resync behavior.
- [x] Reset scenario flags returns system to baseline behavior.

## Cross-Client Parity + Sync

- [x] Favorite/blacklist changes on desktop reflect in web/mobile.
- [x] Favorite/blacklist changes on web/mobile reflect in desktop.
- [x] Tag edits converge across clients.
- [x] Refresh status projection is consistent across clients.
- [x] No critical cross-client state divergence observed.

## Logging + Diagnostics (Unified last.log Validation) deferred to M8g

- [x] Operator Server Logs shows non-empty log data during active test run. (waived)
- [x] Entries contain clear timestamp/level/source identity. (waived)
- [x] Desktop-originated events appear in server log stream. (waived)
- [x] Web/mobile-originated events appear in server log stream. (waived)
- [x] Server-originated operational logs appear in server log stream. (waived)
- [x] No obvious sensitive values (tokens/secrets/cookies) are logged. (waived)

## Packaging + Deployment Smoke

- [x] Portable packaging script runs (Windows): `tools/scripts/package-serverapp-win-portable.ps1`. (waived)
- [x] Inno packaging script runs when `iscc` is available: (waived)
  - `tools/scripts/package-serverapp-win-inno.ps1`.
- [x] Desktop portable packaging script runs (Windows): `tools/scripts/package-desktop-win-portable.ps1`. (waived)
- [x] Desktop Inno packaging script runs when `iscc` is available: (waived)
  - `tools/scripts/package-desktop-win-inno.ps1`.
- [x] Packaged server runtime includes WebUI static assets (root `/` serves WebUI, not missing-assets text). (waived)
- [x] Shared icon appears consistently across installer UI, installed shortcuts/apps, and `/HI.ico` for WebUI/Operator. (waived)
- [x] WebUI dev/build auto-syncs shared icon (`assets/HI.ico` -> `src/clients/web/ReelRoulette.WebUI/public/HI.ico`). (waived)
- [x] Web deploy verify script passes:
  - `tools/scripts/verify-web-deploy.ps1`.
- [x] Generated artifacts follow expected naming/location conventions. (waived)

## CI/Workflow Readiness

- [x] Workflow YAML files are valid and committed in `.github/workflows`.
- [x] Default CI gates map to required checks (`build`, `test`, web verify).
- [x] Packaging workflow path is defined and runnable.

## Documentation Sync

- [x] `AGENTS.md` reflects current agent workflow/document ownership rules.
- [x] `README.md` reflects current runtime scripts/commands and practical onboarding info.
- [x] `CONTEXT.md` reflects current implemented capability/ownership map.
- [x] `CHANGELOG.md` follows Keep a Changelog format and reflects only current unreleased delta.
- [x] `MILESTONES.md` reflects current scope/status/acceptance evidence and deferrals.
- [x] `docs/api.md` reflects current API/error-path contract behavior.
- [x] `docs/architecture.md` reflects current architecture/runtime boundaries.
- [x] `docs/dev-setup.md` reflects current local setup/run/verify workflows.
- [x] `docs/domain-inventory.md` reflects current ownership-first implementation surfaces.
- [x] `docs/testing-checklist.md` checklist sections/items match current feature/workflow reality.

## Optional Release Flow SKIPPED

- [ ] Release validation gates pass:
  - `dotnet build ReelRoulette.sln`
  - `dotnet test ReelRoulette.sln`
  - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - `tools/scripts/verify-web-deploy.ps1`
- [ ] Windows server+desktop packages created (portable + installer) via `tools/scripts/full-release.ps1 -Version 0.9.1-dev`.
- [ ] Expected artifacts exist under `artifacts/packages/`
- [ ] Package output names/version metadata match the release version.
- [ ] Installed server and desktop apps launch and function properly after installation.
- [ ] `CHANGELOG.md`: cut `Unreleased` into the new release section, then initialize a fresh `Unreleased` block.

## Evidence Capture SKIPPED

- [ ] Capture at least one screenshot or log snippet per major section.
- [ ] Capture failures with:
  - steps to reproduce,
  - expected vs actual behavior,
  - impacted client(s)/surface(s),
  - follow-up owner + milestone/TODO link.

## Sign-Off

- Overall result:
  - [x] PASS
  - [ ] FAIL
- [x] Waivers (if any) documented:
- [ ] Follow-up tasks/milestones created and linked:
- [x] Ready for commit/sign-off:
