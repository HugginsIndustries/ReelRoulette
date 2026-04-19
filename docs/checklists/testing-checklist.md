# ReelRoulette Testing Checklist

**Rule:** Items here must be **testable checks** a maintainer can execute and mark pass or fail. Do not add roadmap text, deferrals, or other non-test process notes as checklist rows (keep those in `MILESTONES.md` and related docs). Intended use is **manual validation before releases** (full or targeted regression).

Use this checklist for manual regression passes. Check boxes inline as you go.
Use `pwsh ./tools/scripts/reset-checklist.ps1` to reset metadata/check states before starting a new validation pass.

## Test Run Metadata

- Test date/time: 2026-04-10 12:20:00
- Tester: Christian Huggins
- Branch/commit: main / M9g Linux release readiness sign-off
- Release version: v0.11.0
- Environment (OS + device(s) + browser(s)): CachyOS `linux-x64` (automated build/test, WebUI verify, Linux portable/AppImage packaging, packaged-server smoke, `install-linux-local.sh` with isolated `HOME`); GitHub Actions `ubuntu-latest` + `windows-latest` per `.github/workflows/ci.yml`; prior regression sections also exercised Windows-PC (desktop + Firefox), Android (Chrome), iPad (Chrome) on earlier pass
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
- [x] Thumbnails appear in the library panel after refresh thumbnail generation completes (no desktop restart required). (Linux thumbnails live under `~/.local/share/ReelRoulette/thumbnails/`)
- [x] Duplicate scan + apply flow works (if test data exists).
- [x] Duplicate groups in desktop duplicates dialog render per-file thumbnail + info-row pairs in order (header -> keep-selection -> repeated thumbnail/info rows).
- [x] Duplicate groups allow per-group handling selection (`Keep All` and specific keep-item choice) so groups can be skipped instead of forced into apply.
- [x] Settings -> Playback persists `Duplicate Handling Default Behavior` (`Keep All` default, `Select Best` legacy), and new duplicate dialogs honor the selected default.
- [x] Duplicate delete confirmation shows selected group count + file-delete count, and `Keep All`-only selections short-circuit with a no-selection message (no DELETE prompt).
- [x] Duplicate per-item metadata includes `Tags: {count}` and dropdown keep-selection labels include filename + plays/tags/favorite/blacklisted for easier comparison.
- [x] Auto Tag scan + apply works (if test data exists).
- [x] Favorites toggle updates item state.
- [x] Blacklist toggle updates item state.
- [x] Tag editor apply/remove updates item tags as expected.
- [x] Desktop tag editor category rows remain readable in both themes (light-compatible surface/border; dark-mode consistency).
- [x] Desktop tag chips keep white text/icons with WebUI-like text/icon shadows and state-specific inset chip shadows in both themes.
- [x] Filter dialog `Tags` tab matches tag editor visual surfaces in both themes while preserving add/remove chip controls, local combine-mode controls, responsive wrapping chip layout, and per-category (plus **Uncategorized**) collapse toggles persisted in `sessionStorage` under `rr_filterDialogCollapsedCategories` (independent of tag editor collapse state); legacy flat tag model shows one grid without category rows.
- [x] Clear playback stats flow works with confirmation.

## Desktop library export / import (cross-machine)

Desktop-only: reads/writes roaming `ReelRoulette` data and local thumbnails (no HTTP migration endpoints). For a clean import, stop the server first and confirm the import dialog checkbox.

- [x] **Export**: `Library → Export Library…` saves a `.zip` with default name pattern `ReelRoulette-Library-*Z.zip`; with both checkboxes off the archive omits `thumbnails/` and `backups/` trees; with each checkbox on, the matching tree appears at zip root.
- [x] **Import remap**: `Library → Import Library…` lists every unique source `rootPath` from the zip; each row can be mapped with **Browse…** or **Skip**; skipped sources keep exported paths (offline until fixed). On Linux (including AppImage), **Browse…** shows the chosen folder path and does not clear the placeholder without a path; if the dialog cannot resolve a local path, an error explains portal/sandbox limitations.
- [x] **Import overwrite**: When a non-empty library already exists on disk, a replace confirmation appears; declining cancels without changing files.
- [x] **Import success**: After import, start or restart the server and resync the desktop client when needed; `desktop-settings.json` from the zip is written to the desktop app data path; status text notes restart if listen/WebUI/auth settings may need a process restart.
- [x] **Round-trip sanity**: Export on one OS (or machine), import on another with remapping, confirm media plays when paths exist.
- [x] **Import legacy relativePath**: If an export still has `..`-prefixed `relativePath` entries (older server builds), import remap succeeds and written `fullPath`/`relativePath` match the chosen destination roots; a refresh run rewrites `relativePath` to the current server format. Cross-OS: Windows-exported `Z:\`-style roots and backslashes remap on Linux without “escapes the destination root”; Linux POSIX paths remap on Windows.

## WebUI Core UX (Localhost)

- [x] WebUI bootstraps without runtime-config errors.
- [ ] WebUI PWA metadata: over HTTPS origin, **Add to Home Screen** / **Install app** opens in standalone shell (no browser toolbar), with app icon from `public/icons/`.
- [x] Pair/auth flow works for current auth mode. (waived)
- [x] Random play works with **None** (ad-hoc `filterState`) and with a named header preset.
- [x] **Filter / preset parity (spot-check vs desktop Filter Media):** open **Filter…** (`filter_alt`); General flags, media type, sources, audio, and duration (MM:SS / HH:MM:SS, no min/max) behave sensibly; invalid duration shows a clear error on Apply. Tags tab: global AND/OR, per-category local mode, include/exclude chips. Presets tab: add, rename, delete, reorder, load preset into editor, update preset from current; **Apply** persists catalog via API; header combobox stays ordered like `GET /api/presets`. After **Apply**, random/next eligibility matches expectations. Optional: trigger `resyncRequired` (or second client) and confirm presets refetch.
- [ ] Filter dialog uses full available width on large screens (no narrow center column), with Presets manage controls rendered as Material Symbols (`keyboard_arrow_up`, `keyboard_arrow_down`, `edit_note`, `delete`) and disabled up/down at row boundaries; mobile and light/dark theme behavior remain correct.
- [x] Manual controls (prev/play-next) work.
- [ ] WebUI **Fullscreen**: custom overlay and swipe prev/next stay usable on iPad/iPhone WebKit; **Filter…** and **Edit Tags** open and close while fullscreen (desktop: Fullscreen API stage includes overlays; iOS: pseudo-fullscreen).
- [x] Loop/autoplay toggles work.
- [x] Favorite/blacklist actions work.
- [x] Tag editor flows work (open/edit/save/close); **Auto Tag** tab: scan (full library on/off vs enabled sources), **View all matches**, select/deselect, unified **Save** and **`Discard changes?`** on Close/Refresh when pending; in-flight scan disables Close/Refresh/Scan/Save.
- [x] SSE status transitions are user-friendly (`connected`, `reconnecting`, `resync` paths).
- [x] After a core refresh completes, status shows desktop-style segmented summary (`Core refresh complete | Source: … | Fingerprint: … | Duration: … | Loudness: … | Thumbnails: …`).
- [x] System light/dark: with WebUI open, change OS theme; shell and tag editor match (`theme-light` / `theme-dark`) and tag chips stay readable (white glyphs).
- [x] Video: mute in transport row toggles audio and glyph (`volume_up` / `volume_off`); edit-tags is top-right immediately left of favorite; overlay shadows apply to controls only (video/image not dimmed by a full scrim).
- [x] Tag editor: move category up/down only → Save enables → save → reopen editor and confirm order persisted.

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

- [x] Server app-binary launch shows no command prompt window on Windows app-binary execution. (waived — Windows desktop session not re-run; see `MILESTONES.md` M9g evidence / CI `windows-latest`)
- [x] Tray icon appears (Avalonia TrayIcon) and uses shared icon parity with `assets/HI.ico`.
- [x] Tray `Open Operator UI` opens default browser at `/operator`.
- [x] Tray `Launch Server on Startup` toggle updates startup registration immediately (no restart required): (verified on Linux via XDG autostart create/remove; AppImage: `Exec=` should reference the on-disk `.AppImage` via **`APPIMAGE`, not `/tmp/.mount_*`)
  - on Windows: updates user registry-backed startup registration,
  - on Linux: updates user XDG autostart (`*.desktop` entry in the autostart directory).
- [x] Tray `Refresh Library` triggers refresh pipeline start.
- [x] Tray `Restart Server` performs graceful restart and service recovers.
- [x] Tray `Stop Server / Exit` performs graceful shutdown.
- [x] Operator `Control Settings` apply flow persists `Launch Server on Startup` state and reports apply status. (waived — not re-run this pass; Linux tray XDG path verified above)
- [x] Packaged portable server runtime preserves tray/no-console behavior when a compatible desktop session is available; otherwise it runs headless deterministically. (waived — Windows; Linux headless smoke: `verify-linux-packaged-server-smoke.sh`)
- [x] Packaged installer server runtime preserves tray/no-console behavior when a compatible desktop session is available; otherwise it runs headless deterministically. (waived — Windows Inno session; Linux portable/AppImage builds exercised)

## Packaging + Deployment Smoke

- [x] `pwsh ./tools/scripts/fetch-native-deps.ps1` succeeds on a clean Windows tree (downloads FFmpeg/ffprobe with SHA-256 check; LibVLC from NuGet cache after restore or VideoLAN mirror); packaging scripts call it automatically when `runtimes/win-x64/native/` is incomplete. (waived — Windows host)
- [x] Portable packaging script runs (Windows): `pwsh ./tools/scripts/package-serverapp-win-portable.ps1`. (waived — Windows host)
- [x] Inno packaging script runs when `iscc` is available:
  - `pwsh ./tools/scripts/package-serverapp-win-inno.ps1`. (waived — Windows host + Inno)
- [x] Desktop portable packaging script runs (Windows): `pwsh ./tools/scripts/package-desktop-win-portable.ps1`. (waived — Windows host)
- [x] Desktop Inno packaging script runs when `iscc` is available:
  - `pwsh ./tools/scripts/package-desktop-win-inno.ps1`. (waived — Windows host + Inno)
- [x] Linux portable packaging scripts run: `./tools/scripts/package-serverapp-linux-portable.sh` and `./tools/scripts/package-desktop-linux-portable.sh`.
- [x] Linux AppImage packaging scripts run (requires `appimagetool` on `PATH`): `./tools/scripts/package-serverapp-linux-appimage.sh` and `./tools/scripts/package-desktop-linux-appimage.sh`; outputs under `artifacts/packages/appimage/` match `ReelRoulette-{Server|Desktop}-{Version}-linux-x64.AppImage`.
- [x] `./tools/scripts/install-linux-local.sh` copies built AppImages to stable names under `~/.local/share/ReelRoulette` and `--install` refreshes `~/.local/share/applications` entries without error. (verified with isolated `HOME`; see M9g evidence)
- [x] Linux AppImage `--help` lists native prerequisites consistent with portable policy (server: ffmpeg/ffprobe; desktop: LibVLC/VLC for playback); `--install` registers `~/.local/share/applications/reelroulette-{server|desktop}.desktop` and hicolor icons without a manual menu step.
- [x] Linux install-from-release script runs (`curl` + `jq` on `PATH`): `./tools/scripts/install-linux-from-github.sh server` and `... desktop` against a release that includes matching assets; AppImage installs to `~/.local/share/ReelRoulette/` with stable `ReelRoulette-{Server|Desktop}-linux-x64.AppImage` names (portable fallback still uses `~/.local/bin` symlink + `~/.local/share`); no sudo. (waived — no tag fetch this pass; `install-linux-local.sh` exercised for equivalent AppImage + `--install` behavior)
- [x] Linux portable tarballs extract with a single top-level directory; `run-server.sh` and `run-desktop.sh` are executable (`chmod +x` preserved after extract). (staging dir + tarball layout verified; `run-server.sh` executable in publish tree)
- [x] Linux portable tree contains no `.pdb` files; `README.txt` documents prerequisites (desktop: LibVLC/VLC; server: ffmpeg/ffprobe for refresh)—not bundled in tarballs.
- [x] Packaged Linux server starts and responds on `/health` at the configured base URL (or documented equivalent check). (`verify-linux-packaged-server-smoke.sh`)
- [x] Packaged server runtime includes WebUI static assets (root `/` serves WebUI, not missing-assets text). (`wwwroot/index.html` present in portable tree; smoke hits `/operator`)
- [x] Shared icon appears consistently across installer UI, installed shortcuts/apps, and `/HI.ico` for WebUI/Operator. (waived — Windows installers; WebUI `sync:icon` during `npm run verify` + AppImage install icons verified)
- [x] Server installer `Create Desktop Shortcut` task is present and default checked. (waived — Windows Inno)
- [x] Desktop installer `Create Desktop Shortcut` task is present and default checked. (waived — Windows Inno)
- [x] WebUI dev/build auto-syncs shared icon (`assets/HI.ico` -> `src/clients/web/ReelRoulette.WebUI/public/HI.ico`).
- [x] Web deploy verify script passes:
  - `pwsh ./tools/scripts/verify-web-deploy.ps1`.
- [x] Generated artifacts follow expected naming/location conventions.

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

- [x] Windows server+desktop packages created (portable + installer) via `pwsh ./tools/scripts/full-release.ps1 -Version 0.10.0`. (waived — M9g sign-off without full-release cut; use current `<Version>` when releasing)
- [x] Expected artifacts exist under `artifacts/packages/`
- [x] Package output names/version metadata match the release version. (local build used `0.11.0-dev` from `ReelRoulette.ServerApp` / desktop csproj)
- [x] Installed server and desktop apps launch and function properly after installation. (waived — Windows install UX; Linux portable smoke + AppImage `--install` menu entries verified with isolated `HOME`)
- [x] `CHANGELOG.md`: cut `Unreleased` into the new release section, then initialize a fresh `Unreleased` block. (waived — release cut deferred; `[Unreleased]` updated for M9g sign-off only)

## Evidence Capture SKIPPED

- [x] Capture at least one screenshot or log snippet per major section. (waived — command logs captured in `MILESTONES.md` M9g evidence)
- [x] Capture failures with:
  - steps to reproduce,
  - expected vs actual behavior,
  - impacted client(s)/surface(s),
  - follow-up owner + milestone/TODO link. (waived — no new defects filed this pass)

## Sign-Off

- Overall result:
  - [x] PASS
  - [ ] FAIL
- [x] Waivers (if any) documented:
  - Windows-only manual rows (console window, Inno/installers, `fetch-native-deps.ps1`, Windows packaged tray/no-console, installer shortcut tasks, Windows install launch) — execute on a Windows maintainer host when cutting Windows releases; CI `windows-latest` build/test provides compile coverage.
  - `install-linux-from-github.sh` against live GitHub release assets — run when tagging or trust `package-linux.yml` release upload + download spot-check.
  - Operator **Control Settings** autostart apply — not re-run this pass; Linux XDG autostart via tray toggle exercised in prior checklist note.
- [x] Follow-up tasks/milestones created and linked:
  - Windows packaging/installer validation → next Windows release / maintainer checklist pass.
  - End-user README expansion → planned **End-User README and Contributor Dev Documentation** milestone.
- [x] Ready for commit/sign-off:
