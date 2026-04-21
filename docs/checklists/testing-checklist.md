# ReelRoulette Testing Checklist

**Rule:** Items here must be **testable checks** a maintainer can execute and mark pass or fail. Do not add roadmap text, deferrals, or other non-test process notes as checklist rows (keep those in `MILESTONES.md` and related docs). Intended use is **manual validation before releases** (full or targeted regression).

**Rule:** Keep checklist items concise. Do not inline implementation details, file paths, or platform caveats that already exist in other documentation (`README.md`, `docs/dev-setup.md`, `docs/architecture.md`, etc.). A one-line testable check is always preferred over a multi-line re-specification of a feature.

Use this checklist for manual regression passes. Check boxes inline as you go.
Use `pwsh ./tools/scripts/reset-checklist.ps1` to reset metadata/check states before starting a new validation pass.

## Test Run Metadata

- Test date: 2026-04-20
- Tester: Christian Huggins
- Release version: 0.11.0
- Environment (OS + device(s) + browser(s)): CachyOS (desktop app & server + WebUI on Firefox), iPad (WebUI in Safari), and Google Pixel 8 Pro (WebUI in Chrome)
- Test mode:
  - [x] Full regression sweep
  - [ ] Targeted regression (list impacted areas):

---

## Build & Preconditions

- [x] `dotnet build ReelRoulette.sln` passes.
- [x] `dotnet test ReelRoulette.sln` passes.
- [x] WebUI verify passes (`npm run verify` in `src/clients/web/ReelRoulette.WebUI`).
- [x] `pwsh ./tools/scripts/verify-web-deploy.ps1` passes.

## Server Baseline + Tray

- [x] `ReelRoulette.ServerApp` starts without fatal startup errors.
- [x] `/health` and WebUI static assets respond correctly.
- [x] Server launches with no command prompt window on Windows.
- [x] Tray icon appears and matches expected icon.
- [x] Tray `Open Operator UI` opens default browser at `/operator`.
- [x] Tray `Launch Server on Startup` toggle applies immediately on Windows (registry) and Linux (XDG autostart).
- [x] Tray `Refresh Library` triggers refresh pipeline.
- [x] Tray `Restart Server` performs graceful restart and service recovers.
- [x] Tray `Stop Server / Exit` performs graceful shutdown.
- [x] Packaged portable server runs with tray when a desktop session is available, headless otherwise.
- [x] Packaged installer server runs with tray when a desktop session is available, headless otherwise.

## Operator UI

- [x] Page layout renders as expected.
- [x] Connected Clients panel shows differentiated rows with expected fields.
- [x] Connected Clients `Copy` button works.
- [x] Server Logs refresh works without changing filters.
- [x] Server Logs copy works.
- [x] Incoming/outgoing event tables update during activity.
- [x] Control settings apply flow behaves correctly, including `Launch Server on Startup` state.
- [x] Restart/stop lifecycle buttons behave correctly.

## Operator Testing Suite

- [x] Testing Mode OFF blocks scenario/fault actions.
- [x] Testing Mode ON enables scenario/fault actions.
- [x] Admin auth policy enforcement matches mode (Off = unauthenticated allowed; TokenRequired = auth required).
- [x] API version mismatch scenario produces deterministic client UX.
- [x] Capability mismatch scenario produces deterministic client UX.
- [x] API unavailable scenario produces recoverable client behavior.
- [x] Missing media scenario shows clear playback guidance (no crash).
- [x] SSE disconnect scenario triggers reconnect/resync behavior.
- [x] Reset scenario flags returns system to baseline behavior.

## WebUI

- [x] WebUI bootstraps without runtime-config errors from a LAN device.
- [ ] WebUI PWA metadata: over HTTPS origin, Add to Home Screen / Install app opens in standalone shell with app icon.
  - Issues: PWA on Android is not working (only creates a shortcut that opens in Chrome browser)
- [x] Pair/auth flow works for current auth mode.
- [x] Core controls are usable on touch.
- [x] Random play works with None (ad-hoc filter) and with a named header preset.
- [x] Filter Media overlay opens and General, Tags, and Presets tabs function correctly.
- [x] Preset catalog add, rename, delete, reorder, and load all work; header combobox stays ordered.
- [x] Manual controls (prev/play-next) work.
- [x] Loop/autoplay toggles work.
- [x] Favorite/blacklist actions work.
- [x] Tag editor open/edit/save/close works; Auto Tag scan and apply work correctly.
- [x] Tag editor category reorder marks pending and persists after save.
- [x] Session mute toggle works and glyph updates correctly.
- [x] WebUI Fullscreen: overlays stay usable on desktop; pseudo-fullscreen works correctly on iOS WebKit.
- [x] SSE status transitions are user-friendly (connected, reconnecting, resync paths).
- [x] After a core refresh completes, status shows the correct segmented summary.
- [ ] System light/dark theme change is reflected correctly in shell and tag editor. 
  - Issues: 1 - filter media tags tab & tag editor chip text is black on light mode 2 - tag editor buttons (outside of tag grid) are always white (should be black on light mode)
- [x] Diagnostics panel appears below status line.
- [x] Client `clientType`/identity appears in Operator Connected Clients.

## Desktop App

- [x] Desktop app can connect to server.
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
- [x] Import folder works (or fails with clear guidance).
- [x] Manage Sources opens and source enable/disable persists.
- [x] Thumbnails appear in the library panel after refresh thumbnail generation completes (no desktop restart required).
- [x] Duplicate scan + apply flow works (if test data exists).
- [x] Duplicate groups render per-file thumbnail and info-row pairs in order.
- [x] Duplicate groups allow per-group handling selection (Keep All and specific keep-item choice).
- [x] Duplicate delete confirmation shows selected group/file counts before applying.
- [x] Auto Tag scan + apply works (if test data exists).
- [x] Favorites toggle updates item state.
- [x] Blacklist toggle updates item state.
- [x] Tag editor apply/remove updates item tags as expected.
- [x] Tag editor category rows are readable in both light and dark themes.
- [x] Tag chips render correctly in both light and dark themes.
- [x] Filter dialog Tags tab shows per-category collapse toggles and legacy flat tag model renders correctly.
- [x] Clear playback stats flow works with confirmation.
- [x] `Library → Export Library…` saves a zip with expected contents based on selected options.
- [x] `Library → Import Library…` lists source paths from the zip and allows remap or skip per source.
- [x] Import shows an overwrite confirmation when a non-empty library already exists.
- [x] After import, server resync succeeds and media plays when paths are valid.
- [x] Cross-platform round-trip (Windows ↔ Linux) completes without path errors.

## Cross-Client Parity + Sync

- [ ] Overall UI parity between desktop app and WebUI.
  - Issues: desktop tag chip button toggle state doesn't apply when adding/removing tags (no visual user feedback - should change to HugginsOrange) - overall UI parity is not 100% in the desktop app.
- [x] Favorite/blacklist changes on desktop reflect in web/mobile.
- [x] Favorite/blacklist changes on web/mobile reflect in desktop.
- [x] Tag edits converge across clients.
- [x] Refresh status projection is consistent across clients.
- [x] No critical cross-client state divergence observed.

## Logging + Diagnostics

- [x] Operator Server Logs shows non-empty log data during active test run.
- [x] Entries contain clear timestamp/level/source identity.
- [x] Desktop, web/mobile, and server-originated events all appear in server log stream.
- [x] No obvious sensitive values (tokens/secrets/cookies) are logged.

## Packaging + Deployment Smoke

- [x] **Windows:** server and desktop portable and installer packages build successfully.
- [x] **Linux:** portable tarballs and AppImages build with expected names under `artifacts/packages/`.
- [x] **Linux install:** `install-linux-local.sh` installs AppImages with stable names and registers menu entries.
- [x] **Linux portable tarball:** single top-level directory, executable run scripts, no `.pdb`, prerequisites documented.
- [x] **Branding:** icon parity across shortcuts, menus, and WebUI.
- [x] **Inno shortcuts:** server and desktop installers include default-checked desktop shortcut option.

## CI/Workflow Readiness

- [x] Workflow YAML files are valid and committed in `.github/workflows`.
- [x] Default CI gates map to required checks (build, test, web verify).
- [x] `package-windows.yml` and `package-linux.yml` are runnable (tag + `workflow_dispatch`).

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
- [x] `docs/checklists/testing-checklist.md` checklist sections/items match current feature/workflow reality.

## Release Specific

> Add checks here for features or changes introduced in the current release. Remove this section's items after the release is signed off and the checklist is reset. Do not add permanent checks here — if a check should survive future releases, promote it to the appropriate section above.

## Optional Release Flow

- [x] Server and desktop packages created via `pwsh ./tools/scripts/full-release.ps1 -Version {VERSION}`.
- [x] Expected artifacts exist under `artifacts/packages/` with correct names and version metadata.
- [x] Installed server and desktop apps launch and function properly after installation.
- [x] `CHANGELOG.md`: cut `Unreleased` into the new release section, then initialize a fresh `Unreleased` block.

## Failure Documentation

If any check fails, capture:
- Steps to reproduce
- Expected vs. actual behavior
- Impacted client(s) / surface(s)
- Follow-up owner and milestone/TODO link

## Sign-Off

- Overall result:
  - [x] PASS
  - [ ] FAIL
- [x] All failures and skipped checks documented.
- [x] Ready for commit/sign-off.
