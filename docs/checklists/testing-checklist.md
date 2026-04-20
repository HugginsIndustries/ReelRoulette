# ReelRoulette Testing Checklist

**Rule:** Items here must be **testable checks** a maintainer can execute and mark pass or fail. Do not add roadmap text, deferrals, or other non-test process notes as checklist rows (keep those in `MILESTONES.md` and related docs). Intended use is **manual validation before releases** (full or targeted regression).

**Rule:** Keep checklist items concise. Do not inline implementation details, file paths, or platform caveats that already exist in other documentation (`README.md`, `docs/dev-setup.md`, `docs/architecture.md`, etc.). A one-line testable check is always preferred over a multi-line re-specification of a feature.

Use this checklist for manual regression passes. Check boxes inline as you go.
Use `pwsh ./tools/scripts/reset-checklist.ps1` to reset metadata/check states before starting a new validation pass.

## Test Run Metadata

- Test date/time:
- Tester:
- Release version:
- Environment (OS + device(s) + browser(s)):
- Test mode:
  - [ ] Full regression sweep
  - [ ] Targeted regression (list impacted areas):

---

## Build & Preconditions

- [ ] `dotnet build ReelRoulette.sln` passes.
- [ ] `dotnet test ReelRoulette.sln` passes.
- [ ] WebUI verify passes (`npm run verify` in `src/clients/web/ReelRoulette.WebUI`).
- [ ] `pwsh ./tools/scripts/verify-web-deploy.ps1` passes.

## Server Baseline + Tray

- [ ] `ReelRoulette.ServerApp` starts without fatal startup errors.
- [ ] `/health` and WebUI static assets respond correctly.
- [ ] Server launches with no command prompt window on Windows.
- [ ] Tray icon appears and matches expected icon.
- [ ] Tray `Open Operator UI` opens default browser at `/operator`.
- [ ] Tray `Launch Server on Startup` toggle applies immediately on Windows (registry) and Linux (XDG autostart).
- [ ] Tray `Refresh Library` triggers refresh pipeline.
- [ ] Tray `Restart Server` performs graceful restart and service recovers.
- [ ] Tray `Stop Server / Exit` performs graceful shutdown.
- [ ] Packaged portable server runs with tray when a desktop session is available, headless otherwise.
- [ ] Packaged installer server runs with tray when a desktop session is available, headless otherwise.

## Operator UI

- [ ] Page layout renders as expected.
- [ ] Connected Clients panel shows differentiated rows with expected fields.
- [ ] Connected Clients `Copy` button works.
- [ ] Server Logs refresh works without changing filters.
- [ ] Server Logs copy works.
- [ ] Incoming/outgoing event tables update during activity.
- [ ] Control settings apply flow behaves correctly, including `Launch Server on Startup` state.
- [ ] Restart/stop lifecycle buttons behave correctly.

## Operator Testing Suite

- [ ] Testing Mode OFF blocks scenario/fault actions.
- [ ] Testing Mode ON enables scenario/fault actions.
- [ ] Admin auth policy enforcement matches mode (Off = unauthenticated allowed; TokenRequired = auth required).
- [ ] API version mismatch scenario produces deterministic client UX.
- [ ] Capability mismatch scenario produces deterministic client UX.
- [ ] API unavailable scenario produces recoverable client behavior.
- [ ] Missing media scenario shows clear playback guidance (no crash).
- [ ] SSE disconnect scenario triggers reconnect/resync behavior.
- [ ] Reset scenario flags returns system to baseline behavior.

## WebUI

- [ ] WebUI bootstraps without runtime-config errors from a LAN device.
- [ ] WebUI PWA metadata: over HTTPS origin, Add to Home Screen / Install app opens in standalone shell with app icon.
- [ ] Pair/auth flow works for current auth mode.
- [ ] Core controls are usable on touch.
- [ ] Random play works with None (ad-hoc filter) and with a named header preset.
- [ ] Filter Media overlay opens and General, Tags, and Presets tabs function correctly.
- [ ] Preset catalog add, rename, delete, reorder, and load all work; header combobox stays ordered.
- [ ] Manual controls (prev/play-next) work.
- [ ] Loop/autoplay toggles work.
- [ ] Favorite/blacklist actions work.
- [ ] Tag editor open/edit/save/close works; Auto Tag scan and apply work correctly.
- [ ] Tag editor category reorder marks pending and persists after save.
- [ ] Session mute toggle works and glyph updates correctly.
- [ ] WebUI Fullscreen: overlays stay usable on desktop; pseudo-fullscreen works correctly on iOS WebKit.
- [ ] SSE status transitions are user-friendly (connected, reconnecting, resync paths).
- [ ] After a core refresh completes, status shows the correct segmented summary.
- [ ] System light/dark theme change is reflected correctly in shell and tag editor.
- [ ] Diagnostics panel appears below status line.
- [ ] Client `clientType`/identity appears in Operator Connected Clients.

## Desktop App

- [ ] Desktop app can connect to server.
- [ ] Desktop loads and shows current runtime status without crash.
- [ ] Random play works from active preset.
- [ ] Manual library play works.
- [ ] Previous/next timeline navigation works.
- [ ] Loop toggle works.
- [ ] Autoplay toggle works.
- [ ] Volume/mute controls work.
- [ ] Fullscreen/player-view transitions work.
- [ ] No stale/incorrect status text after playback actions.
- [ ] `View -> Diagnostics` opens and shows `CoreClientId`/`CoreSessionId`.
- [ ] Import folder works (or fails with clear guidance).
- [ ] Manage Sources opens and source enable/disable persists.
- [ ] Thumbnails appear in the library panel after refresh thumbnail generation completes (no desktop restart required).
- [ ] Duplicate scan + apply flow works (if test data exists).
- [ ] Duplicate groups render per-file thumbnail and info-row pairs in order.
- [ ] Duplicate groups allow per-group handling selection (Keep All and specific keep-item choice).
- [ ] Duplicate delete confirmation shows selected group/file counts before applying.
- [ ] Auto Tag scan + apply works (if test data exists).
- [ ] Favorites toggle updates item state.
- [ ] Blacklist toggle updates item state.
- [ ] Tag editor apply/remove updates item tags as expected.
- [ ] Tag editor category rows are readable in both light and dark themes.
- [ ] Tag chips render correctly in both light and dark themes.
- [ ] Filter dialog Tags tab shows per-category collapse toggles and legacy flat tag model renders correctly.
- [ ] Clear playback stats flow works with confirmation.
- [ ] `Library → Export Library…` saves a zip with expected contents based on selected options.
- [ ] `Library → Import Library…` lists source paths from the zip and allows remap or skip per source.
- [ ] Import shows an overwrite confirmation when a non-empty library already exists.
- [ ] After import, server resync succeeds and media plays when paths are valid.
- [ ] Cross-platform round-trip (Windows ↔ Linux) completes without path errors.

## Cross-Client Parity + Sync

- [ ] Favorite/blacklist changes on desktop reflect in web/mobile.
- [ ] Favorite/blacklist changes on web/mobile reflect in desktop.
- [ ] Tag edits converge across clients.
- [ ] Refresh status projection is consistent across clients.
- [ ] No critical cross-client state divergence observed.

## Logging + Diagnostics

- [ ] Operator Server Logs shows non-empty log data during active test run.
- [ ] Entries contain clear timestamp/level/source identity.
- [ ] Desktop, web/mobile, and server-originated events all appear in server log stream.
- [ ] No obvious sensitive values (tokens/secrets/cookies) are logged.

## Packaging + Deployment Smoke

- [ ] **Windows:** server and desktop portable and installer packages build successfully.
- [ ] **Linux:** portable tarballs and AppImages build with expected names under `artifacts/packages/`.
- [ ] **Linux install:** `install-linux-local.sh` installs AppImages with stable names and registers menu entries.
- [ ] **Linux portable tarball:** single top-level directory, executable run scripts, no `.pdb`, prerequisites documented.
- [ ] **Branding:** icon parity across shortcuts, menus, and WebUI.
- [ ] **Inno shortcuts:** server and desktop installers include default-checked desktop shortcut option.

## CI/Workflow Readiness

- [ ] Workflow YAML files are valid and committed in `.github/workflows`.
- [ ] Default CI gates map to required checks (build, test, web verify).
- [ ] `package-windows.yml` and `package-linux.yml` are runnable (tag + `workflow_dispatch`).

## Documentation Sync

- [ ] `AGENTS.md` reflects current agent workflow/document ownership rules.
- [ ] `README.md` reflects current runtime scripts/commands and practical onboarding info.
- [ ] `CONTEXT.md` reflects current implemented capability/ownership map.
- [ ] `CHANGELOG.md` follows Keep a Changelog format and reflects only current unreleased delta.
- [ ] `MILESTONES.md` reflects current scope/status/acceptance evidence and deferrals.
- [ ] `docs/api.md` reflects current API/error-path contract behavior.
- [ ] `docs/architecture.md` reflects current architecture/runtime boundaries.
- [ ] `docs/dev-setup.md` reflects current local setup/run/verify workflows.
- [ ] `docs/domain-inventory.md` reflects current ownership-first implementation surfaces.
- [ ] `docs/checklists/testing-checklist.md` checklist sections/items match current feature/workflow reality.

## Release Specific

> Add checks here for features or changes introduced in the current release. Remove this section's items after the release is signed off and the checklist is reset. Do not add permanent checks here — if a check should survive future releases, promote it to the appropriate section above.

## Optional Release Flow

- [ ] Server and desktop packages created via `pwsh ./tools/scripts/full-release.ps1 -Version {VERSION}`.
- [ ] Expected artifacts exist under `artifacts/packages/` with correct names and version metadata.
- [ ] Installed server and desktop apps launch and function properly after installation.
- [ ] `CHANGELOG.md`: cut `Unreleased` into the new release section, then initialize a fresh `Unreleased` block.

## Failure Documentation

If any check fails, capture:
- Steps to reproduce
- Expected vs. actual behavior
- Impacted client(s) / surface(s)
- Follow-up owner and milestone/TODO link

## Sign-Off

- Overall result:
  - [ ] PASS
  - [ ] FAIL
- [ ] All failures documented with follow-up tasks linked.
- [ ] Ready for commit/sign-off.
