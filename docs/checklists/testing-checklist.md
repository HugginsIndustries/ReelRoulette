# ReelRoulette Testing Checklist

This checklist is a regression check plus release-specific checks, run before a release.

**Rule:** Every item is a check that passes or fails. Roadmap text, future work, and known issues go in `MILESTONES.md`, not here.

**Rule:** One line per check. Do not repeat implementation details, file paths, or platform notes that other docs already cover.

**Rule:** A manual item describes something a person can see or do in the apps. Behavior that is only visible in code, logs, or API responses belongs in automated tests, not in this list.

Run `pwsh ./tools/scripts/reset-checklist.ps1` to clear check states and fill in the date and version before a new pass.

## Test Run Metadata

- Test date/time: 2026-10-05 01:08:42
- Tester: Christian Huggins
- Release version: v0.14.0
- Environment (OS + device(s) + browser(s)): CachyOS desktop (desktop app, server, WebUI in Firefox); CachyOS laptop on home LAN (WebUI in Firefox via .local); Pixel 8 Pro (WebUI in Firefox over Tailscale); iPad Pro 13-inch M4 (WebUI installed from Safari, over Tailscale); Windows 11 VM (desktop and server, Setup.exe install and in-app update from the previous release)

---

## Automated Checks

An agent runs these and ticks them.

- [x] `dotnet build ReelRoulette.sln` passes.
- [x] `dotnet test ReelRoulette.sln` passes.
- [x] `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passes.
- [x] `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI`.
- [x] `./tools/scripts/verify-linux-packaged-server-smoke.sh` passes.
- [x] `pwsh ./tools/scripts/verify-web-deploy.ps1` passes.
- [x] `pwsh ./tools/scripts/tests/test-scripts.ps1` passes.
- [x] `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef {previous release tag} -Release` passes.
- [x] Workflow YAML files in `.github/workflows` are valid, and default CI runs build, test, and web verify.
- [x] `release.yml` runs on a tag and on `workflow_dispatch`, and publishes Velopack feeds.
- [x] Docs review: `AGENTS.md`, `README.md`, `CONTEXT.md`, `MILESTONES.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, and `docs/domain-inventory.md` match current behavior.
- [x] Docs review: the changelog section being released follows the style note at the top of `CHANGELOG.md`, and the `RELEASE-NOTES.md` entry follows its style guide.
- [x] Docs review: this checklist matches current features and workflows.

## Manual Regression

### Server and Tray

- [x] Server starts without errors and serves the WebUI at `/` and Operator at `/operator`.
- [x] Server starts with no console window on Windows.
- [x] Tray icon appears with the right icon.
- [x] Tray **Open Operator UI** opens the browser at `/operator`.
- [x] Tray **Launch Server on Startup** takes effect right away.
- [x] Tray **Refresh Library** starts a refresh.
- [x] Tray **Restart Server** restarts and clients reconnect.
- [x] Tray **Stop Server / Exit** shuts down cleanly.
- [x] Installed server runs with a tray when a desktop session is available and headless otherwise.

### Operator

- [x] Page layout renders correctly.
- [x] Connected Clients lists desktop and WebUI clients separately, and **Copy** works.
- [x] Server Logs refresh keeps filters, and copy works.
- [x] Incoming and outgoing event tables update during activity.
- [x] Control settings apply, including **Launch Server on Startup**.
- [x] Restart and stop buttons work.

### Operator Testing Suite

- Skipped: the Operator Testing Suite needs an overhaul to work properly; see the Operator Testing Suite overhaul backlog item.

- [ ] Testing Mode off blocks scenario and fault actions; on enables them.
- [ ] From another machine, testing actions need the control token; on the server machine they work without it.
- [ ] API version mismatch shows a clear message in both clients.
- [ ] Capability mismatch shows a clear message in both clients.
- [ ] API unavailable recovers when the server comes back.
- [ ] Missing media shows playback guidance without a crash.
- [ ] SSE disconnect reconnects and resyncs.
- [ ] Reset scenario flags returns to normal behavior.

### WebUI

- [x] WebUI loads from another device on the LAN.
- [ ] Over HTTPS, Add to Home Screen / Install app opens a standalone app with the app icon.
  - Failed: Android install still creates a shortcut; see the reverse proxy and HTTPS access milestone.
- [x] Pairing or sign-in works for the current auth mode.
- [x] Controls are usable on touch.
- [x] Random play follows the current filter, including after editing a selected preset without saving.
- [x] Filter Media opens, and its General, Tags, and Presets tabs work.
- [x] Preset add, rename, delete, reorder, and load work, and the header list stays in order.
- [x] Previous, next, loop, autoplay, favorite, and blacklist work.
- [x] Mute toggles and its icon updates.
- [x] Tag editor opens, edits, saves, and closes; category reorder persists after save.
- [x] Auto Tag scan and apply work.
- [x] Fullscreen keeps overlays usable on desktop browsers, and pseudo-fullscreen works on iOS.
- [x] Connection status reads clearly when connected, reconnecting, and resyncing.
- [x] After a refresh, the status line shows the refresh summary.
- [x] Switching the system theme updates the shell and tag editor.
- [x] On a mobile browser, the diagnostics panel appears below the status line.
- [x] Library overlay opens and closes from the player controls, in fullscreen and in both themes.
- [x] Library overlay **Showing N of M** matches the filter and search, and search and sort persist across close and reopen.
- [x] Changing search, sort, filter, or preset scrolls the overlay grid to the top.
- [x] Library grid shows portrait and landscape thumbnails at their own shape, not stretched or cropped to one shape, and reflows on resize.
- [x] Library grid shows a placeholder for a missing thumbnail, favorite and blacklist badges, and a readable filename bar in both themes.
- [x] Library grid looks like the desktop grid at the same width.
- [x] Clicking a tile plays it and closes the overlay; a missing or unsupported file shows a message and keeps the overlay open.
- [x] Escape closes the overlay; Tab to a tile and Enter or Space plays it.
- [x] With the overlay open, favorite, blacklist, and playback changes from the desktop update tiles, sort, and the **Only never played** filter.
- [x] With LAN access and mDNS on, the WebUI loads from another device at `http://<LAN hostname>.local:<port>`.

### Desktop

- [x] Desktop connects to the server and shows current status.
- [x] Random play follows the active filter, including right after a playback.
- [x] Playing a library item starts that item; a missing or unsupported file shows a clear error.
- [x] Previous, next, loop, autoplay, volume, and mute work.
- [x] Fullscreen and player view switch correctly.
- [x] Status text stays correct after playback actions.
- [x] **View → Diagnostics** shows the client and session ids.
- [x] Import folder adds new files, names the source after the folder, and keeps tags, favorites, and stats on files already imported.
- [x] Library browse keeps responding while a large folder imports.
- [x] Manage Sources enable and disable persists.
- [x] Thumbnails appear in the library panel after a refresh, without restarting.
- [x] Duplicate scan shows thumbnail and info pairs per group, allows Keep All or a chosen file per group, and confirms counts before deleting.
- [x] Auto Tag scan and apply work.
- [x] Favorite and blacklist toggles update the item.
- [x] Tag editor adds and removes tags.
- [x] Tag editor category rows and tag chips are readable in both themes.
- [x] Filter dialog Tags tab has per-category collapse toggles.
- [x] Clear playback stats asks for confirmation and clears stats.
- [x] With backups on, a library change writes a `library.db.backup.*` file to the backups folder after the backup gap.

### Cross-Client

- [x] Desktop and WebUI look and behave alike for the same features.
- [x] Favorite and blacklist changes show in the other client.
- [x] Tag edits show in the other client.
- [x] Refresh status matches in both clients.

### Logging

- [x] Operator Server Logs shows entries during a test run, with timestamp, level, and source.
- [x] Desktop and WebUI entries both appear in the server log.
- [x] No tokens, secrets, or cookies appear in logs.
- [x] WebUI and desktop log lines contain no file paths or file names (the server's own source and backup lines still show paths until the server instrumentation milestone).
- [x] No log line is cut off or merged with another.

### Packaging

- [x] Windows `Setup.exe` installs per user without elevation, and its shortcuts appear when offered.
- [x] Linux `.AppImage` runs after `chmod +x`; desktop plays video with system LibVLC and refresh works with system `ffmpeg`.
- [x] After first launch, both Linux AppImages appear under Multimedia in the app menu with their icons and launch the right AppImage.
- [x] Without LibVLC on Linux, the desktop AppImage shows a dependency dialog with a copyable install command and exits cleanly.
- [x] Moving a Linux AppImage and running it updates its menu entry; relaunching without moving does not rewrite it.
- [x] After an in-app update on Linux, menu entries still launch the updated AppImage.
- [x] Server in-app update: the check finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it.
- [x] Desktop in-app update: Settings finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it.
- [x] Icons match across shortcuts, menus, and the WebUI.

## Release Specific

> Add checks for features or changes in the current release. Clear these items after sign-off. If a check should outlive the release, move it to Manual Regression.

- [x] `verify-web-deploy.ps1` on Windows leaves the real data and thumbnail folders unchanged.
- [x] Desktop hides **Rename** and **Remove** in Manage Sources and **Remove from Library** in the library grid menu; the other Manage Sources actions and grid menu items still show and work.
- [x] On desktop and WebUI, a saved preset stays selected (not starred) after its tags are re-selected in a different order, and a different tag set still shows it starred.
- [x] On Windows, first start with no data folder, and with a data folder from v0.12.0 or earlier that has no `library.db`, opens an empty library.
- [x] From another machine, the Operator asks for the control token, works after it is entered, and refuses a wrong one; on the server machine it opens without one, testing panel included. Run on Linux and Windows.
- [x] With the WebUI open, stop and restart the server, change a favorite and a tag on the desktop while the WebUI reconnects, and the WebUI shows both.
- [x] Switching videos repeatedly with random, next, and previous never starts a video silently, and the mute button matches what you hear. Run on Linux and Windows.
- [x] With clients connected, tray and Operator Stop exit within a few seconds, and Operator Restart relaunches the server, on Linux and Windows.
- [x] On Windows, right-clicking the server tray icon opens the menu, menu items work, the icon stays, and `last.log` shows `Tray menu opened` with a non-zero size. If it passes, update the README Known Issues tray entry. If it fails, remove the Windows tray menu bullet from `CHANGELOG.md` and the tray menu sentence from the `RELEASE-NOTES.md` entry.
- [x] Opening desktop Settings, closing it, and opening it again does not freeze the app.
- [x] In the desktop filter dialog, deleting, renaming, or moving a preset keeps unsaved filter changes and **Update Preset**.
- [ ] With a copy of the data folder upgraded by a newer build, the installed build runs without a library, shows the message on the Operator page, leaves the library and backups byte-identical, and updates in-app, on Linux and Windows.
- [ ] Without a library, a library route answers 503 with the message, the open routes answer, and an unpaired LAN caller gets 401.

## Release Flow

- [x] Version set with `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION}`, and `.version` matches the tag you will push.
- [x] `CHANGELOG.md` `[Unreleased]` is cut into the new release section titled with the release name, and a fresh `[Unreleased]` with empty headings is above it.
- [x] `CHANGELOG.md` footer links: `[Unreleased]` compares the new version with `HEAD`, and a new line for this version compares the previous version with it.
- [x] `RELEASE-NOTES.md` has the new release entry, it follows the style guide at the top of that file, and its Verification section is filled in from this pass.

After committing the release, before tagging:

- CI passes on that commit, on both Linux and Windows.

After tagging, keep an eye on:

- `release.yml` finishing on Windows and Linux for server and desktop.
- The GitHub release having only `Setup.exe` and `.AppImage`, plus source archives.
- An installed previous release finding and applying this update in-app.

## Failure Documentation

If any check fails, record:

- Steps to reproduce
- Expected and actual behavior
- Affected client(s) or surface(s)
- Follow-up owner and backlog item

## Sign-Off

- Overall result:
  - [x] PASS
  - [ ] FAIL
- [x] All failures and skipped checks documented.
- [x] Ready to tag.
