# ReelRoulette Testing Checklist

**Rule:** Items here must be **testable checks** a maintainer can execute and mark pass or fail. Do not add roadmap text, deferrals, or other non-test process notes as checklist rows (keep those in `MILESTONES.md` and related docs). Intended use is **manual validation before releases** (full or targeted regression).

Use this checklist for manual regression passes. Check boxes inline as you go.
Use `pwsh ./tools/scripts/reset-checklist.ps1` to reset metadata/check states before starting a new validation pass.

## Test Run Metadata

- Test date/time: 2026-03-11 13:55:23
- Tester: Christian Huggins
- Branch/commit: main / Cross-platform tray + Linux autostart baseline and packaging alignment
- Release version: v0.10.0
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
- [ ] Thumbnails appear in the library panel after refresh thumbnail generation completes (no desktop restart required). (Linux thumbnails live under `~/.local/share/ReelRoulette/thumbnails/`)
- [x] Duplicate scan + apply flow works (if test data exists).
- [ ] Duplicate groups in desktop duplicates dialog render per-file thumbnail + info-row pairs in order (header -> keep-selection -> repeated thumbnail/info rows).
- [ ] Duplicate groups allow per-group handling selection (`Keep All` and specific keep-item choice) so groups can be skipped instead of forced into apply.
- [ ] Settings -> Playback persists `Duplicate Handling Default Behavior` (`Keep All` default, `Select Best` legacy), and new duplicate dialogs honor the selected default.
- [ ] Duplicate delete confirmation shows selected group count + file-delete count, and `Keep All`-only selections short-circuit with a no-selection message (no DELETE prompt).
- [ ] Duplicate per-item metadata includes `Tags: {count}` and dropdown keep-selection labels include filename + plays/tags/favorite/blacklisted for easier comparison.
- [x] Auto Tag scan + apply works (if test data exists).
- [x] Favorites toggle updates item state.
- [x] Blacklist toggle updates item state.
- [x] Tag editor apply/remove updates item tags as expected.
- [ ] Desktop tag editor category rows remain readable in both themes (light-compatible surface/border; dark-mode consistency).
- [ ] Desktop tag chips keep white text/icons with WebUI-like text/icon shadows and state-specific inset chip shadows in both themes.
- [ ] Filter dialog `Tags` tab matches tag editor visual surfaces in both themes while preserving add/remove chip controls, local combine-mode controls, and responsive wrapping chip layout.
- [x] Clear playback stats flow works with confirmation.

## Desktop library export / import (cross-machine)

Desktop-only: reads/writes roaming `ReelRoulette` data and local thumbnails (no HTTP migration endpoints). For a clean import, stop the server first and confirm the import dialog checkbox.

- [ ] **Export**: `Library → Export Library…` saves a `.zip` with default name pattern `ReelRoulette-Library-*Z.zip`; with both checkboxes off the archive omits `thumbnails/` and `backups/` trees; with each checkbox on, the matching tree appears at zip root.
- [ ] **Import remap**: `Library → Import Library…` lists every unique source `rootPath` from the zip; each row can be mapped with **Browse…** or **Skip**; skipped sources keep exported paths (offline until fixed). On Linux (including AppImage), **Browse…** shows the chosen folder path and does not clear the placeholder without a path; if the dialog cannot resolve a local path, an error explains portal/sandbox limitations.
- [ ] **Import overwrite**: When a non-empty library already exists on disk, a replace confirmation appears; declining cancels without changing files.
- [ ] **Import success**: After import, start or restart the server and resync the desktop client when needed; `desktop-settings.json` from the zip is written to the desktop app data path; status text notes restart if listen/WebUI/auth settings may need a process restart.
- [ ] **Round-trip sanity**: Export on one OS (or machine), import on another with remapping, confirm media plays when paths exist.
- [ ] **Import legacy relativePath**: If an export still has `..`-prefixed `relativePath` entries (older server builds), import remap succeeds and written `fullPath`/`relativePath` match the chosen destination roots; a refresh run rewrites `relativePath` to the current server format. Cross-OS: Windows-exported `Z:\`-style roots and backslashes remap on Linux without “escapes the destination root”; Linux POSIX paths remap on Windows.

## WebUI Core UX (Localhost)

- [x] WebUI bootstraps without runtime-config errors.
- [x] Pair/auth flow works for current auth mode. (waived)
- [x] Random play works.
- [x] Manual controls (prev/play-next) work.
- [x] Loop/autoplay toggles work.
- [x] Favorite/blacklist actions work.
- [x] Tag editor flows work (open/edit/apply/close).
- [x] SSE status transitions are user-friendly (`connected`, `reconnecting`, `resync` paths).
- [ ] After a core refresh completes, status shows desktop-style segmented summary (`Core refresh complete | Source: … | Fingerprint: … | Duration: … | Loudness: … | Thumbnails: …`).
- [ ] System light/dark: with WebUI open, change OS theme; shell and tag editor match (`theme-light` / `theme-dark`) and tag chips stay readable (white glyphs).
- [ ] Video: mute in transport row toggles audio and glyph (`volume_up` / `volume_off`); edit-tags is top-right immediately left of favorite; overlay shadows apply to controls only (video/image not dimmed by a full scrim).
- [ ] Tag editor: move category up/down only → Apply enables → apply → reopen editor and confirm order persisted.

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

## Logging + Diagnostics (Unified last.log Validation)

- [x] Operator Server Logs shows non-empty log data during active test run.
- [x] Entries contain clear timestamp/level/source identity.
- [x] Desktop-originated events appear in server log stream.
- [x] Web/mobile-originated events appear in server log stream.
- [x] Server-originated operational logs appear in server log stream. (waived)
- [x] No obvious sensitive values (tokens/secrets/cookies) are logged. (waived)

## Cross-Platform ServerApp Tray Baseline (Avalonia)

- [ ] Server app-binary launch shows no command prompt window on Windows app-binary execution.
- [x] Tray icon appears (Avalonia TrayIcon) and uses shared icon parity with `assets/HI.ico`.
- [x] Tray `Open Operator UI` opens default browser at `/operator`.
- [x] Tray `Launch Server on Startup` toggle updates startup registration immediately (no restart required): (verified on Linux via XDG autostart create/remove)
  - on Windows: updates user registry-backed startup registration,
  - on Linux: updates user XDG autostart (`*.desktop` entry in the autostart directory).
- [x] Tray `Refresh Library` triggers refresh pipeline start.
- [x] Tray `Restart Server` performs graceful restart and service recovers.
- [x] Tray `Stop Server / Exit` performs graceful shutdown.
- [ ] Operator `Control Settings` apply flow persists `Launch Server on Startup` state and reports apply status.
- [ ] Packaged portable server runtime preserves tray/no-console behavior when a compatible desktop session is available; otherwise it runs headless deterministically.
- [ ] Packaged installer server runtime preserves tray/no-console behavior when a compatible desktop session is available; otherwise it runs headless deterministically.

## Packaging + Deployment Smoke

- [ ] `pwsh ./tools/scripts/fetch-native-deps.ps1` succeeds on a clean Windows tree (downloads FFmpeg/ffprobe with SHA-256 check; LibVLC from NuGet cache after restore or VideoLAN mirror); packaging scripts call it automatically when `runtimes/win-x64/native/` is incomplete.
- [ ] Portable packaging script runs (Windows): `pwsh ./tools/scripts/package-serverapp-win-portable.ps1`.
- [ ] Inno packaging script runs when `iscc` is available:
  - `pwsh ./tools/scripts/package-serverapp-win-inno.ps1`.
- [ ] Desktop portable packaging script runs (Windows): `pwsh ./tools/scripts/package-desktop-win-portable.ps1`.
- [ ] Desktop Inno packaging script runs when `iscc` is available:
  - `pwsh ./tools/scripts/package-desktop-win-inno.ps1`.
- [ ] Linux portable packaging scripts run: `./tools/scripts/package-serverapp-linux-portable.sh` and `./tools/scripts/package-desktop-linux-portable.sh`.
- [ ] Linux AppImage packaging scripts run (requires `appimagetool` on `PATH`): `./tools/scripts/package-serverapp-linux-appimage.sh` and `./tools/scripts/package-desktop-linux-appimage.sh`; outputs under `artifacts/packages/appimage/` match `ReelRoulette-{Server|Desktop}-{Version}-linux-x64.AppImage`.
- [ ] `./tools/scripts/install-linux-local.sh` copies built AppImages to stable names under `~/.local/share/ReelRoulette` and `--install` refreshes `~/.local/share/applications` entries without error.
- [ ] Linux AppImage `--help` lists native prerequisites consistent with portable policy (server: ffmpeg/ffprobe; desktop: LibVLC/VLC for playback); `--install` registers `~/.local/share/applications/reelroulette-{server|desktop}.desktop` and hicolor icons without a manual menu step.
- [ ] Linux install-from-release script runs (`curl` + `jq` on `PATH`): `./tools/scripts/install-linux-from-github.sh server` and `... desktop` against a release that includes matching assets; AppImage installs to `~/.local/share/ReelRoulette/` with stable `ReelRoulette-{Server|Desktop}-linux-x64.AppImage` names (portable fallback still uses `~/.local/bin` symlink + `~/.local/share`); no sudo.
- [ ] Linux portable tarballs extract with a single top-level directory; `run-server.sh` and `run-desktop.sh` are executable (`chmod +x` preserved after extract).
- [ ] Linux portable tree contains no `.pdb` files; `README.txt` documents prerequisites (desktop: LibVLC/VLC; server: ffmpeg/ffprobe for refresh)—not bundled in tarballs.
- [ ] Packaged Linux server starts and responds on `/health` at the configured base URL (or documented equivalent check).
- [ ] Packaged server runtime includes WebUI static assets (root `/` serves WebUI, not missing-assets text).
- [ ] Shared icon appears consistently across installer UI, installed shortcuts/apps, and `/HI.ico` for WebUI/Operator.
- [ ] Server installer `Create Desktop Shortcut` task is present and default checked.
- [ ] Desktop installer `Create Desktop Shortcut` task is present and default checked.
- [ ] WebUI dev/build auto-syncs shared icon (`assets/HI.ico` -> `src/clients/web/ReelRoulette.WebUI/public/HI.ico`).
- [ ] Web deploy verify script passes:
  - `pwsh ./tools/scripts/verify-web-deploy.ps1`.
- [ ] Generated artifacts follow expected naming/location conventions.

## CI/Workflow Readiness

- [x] Workflow YAML files are valid and committed in `.github/workflows`.
- [x] Default CI gates map to required checks (`build`, `test`, web verify).
- [x] Packaging workflow paths are defined and runnable: `package-windows.yml` and `package-linux.yml` (tag + `workflow_dispatch`; Linux job includes headless packaged-server smoke).

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

## Optional Release Flow

- [ ] Windows server+desktop packages created (portable + installer) via `pwsh ./tools/scripts/full-release.ps1 -Version 0.10.0`.
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
  - [ ] PASS
  - [x] FAIL
- [ ] Waivers (if any) documented:
- [ ] Follow-up tasks/milestones created and linked:
- [ ] Ready for commit/sign-off:
