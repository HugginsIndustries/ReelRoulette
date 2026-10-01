# ReelRoulette Testing Checklist

This checklist is a regression check plus release-specific checks, run before a release.

**Rule:** Every item is a check that passes or fails. Roadmap text, deferrals, and known issues go in `MILESTONES.md`, not here.

**Rule:** One line per check. Do not repeat implementation details, file paths, or platform notes that other docs already cover.

**Rule:** A manual item describes something a person can see or do in the apps. Behavior that is only visible in code, logs, or API responses belongs in automated tests, not in this list.

Run `pwsh ./tools/scripts/reset-checklist.ps1` to clear check states and fill in the date and version before a new pass.

## Test Run Metadata

- Test date/time:
- Tester:
- Release version:
- Environment (OS + device(s) + browser(s)):

---

## Automated Checks

An agent runs these and ticks them.

- [ ] `dotnet build ReelRoulette.sln` passes.
- [ ] `dotnet test ReelRoulette.sln` passes.
- [ ] `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passes.
- [ ] `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI`.
- [ ] `./tools/scripts/verify-linux-packaged-server-smoke.sh` passes.
- [ ] `pwsh ./tools/scripts/verify-web-deploy.ps1` passes. Skipped on every OS until the Server Data Folder Override backlog item lands, because it still writes to real app data.
- [ ] Workflow YAML files in `.github/workflows` are valid, and default CI runs build, test, and web verify.
- [ ] `release.yml` runs on a tag and on `workflow_dispatch`, and publishes Velopack feeds.
- [ ] Docs review: `AGENTS.md`, `README.md`, `CONTEXT.md`, `MILESTONES.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, and `docs/domain-inventory.md` match current behavior.
- [ ] Docs review: the changelog section being released follows the style note at the top of `CHANGELOG.md`, and the `RELEASE-NOTES.md` entry follows its style guide.
- [ ] Docs review: this checklist matches current features and workflows.

## Manual Regression

### Server and Tray

- [ ] Server starts without errors and serves the WebUI at `/` and Operator at `/operator`.
- [ ] Server starts with no console window on Windows.
- [ ] Tray icon appears with the right icon.
- [ ] Tray **Open Operator UI** opens the browser at `/operator`.
- [ ] Tray **Launch Server on Startup** takes effect right away on Windows and Linux.
- [ ] Tray **Refresh Library** starts a refresh.
- [ ] Tray **Restart Server** restarts and clients reconnect.
- [ ] Tray **Stop Server / Exit** shuts down cleanly.
- [ ] Installed server runs with a tray when a desktop session is available and headless otherwise.

### Operator

- [ ] Page layout renders correctly.
- [ ] Connected Clients lists desktop and WebUI clients separately, and **Copy** works.
- [ ] Server Logs refresh keeps filters, and copy works.
- [ ] Incoming and outgoing event tables update during activity.
- [ ] Control settings apply, including **Launch Server on Startup**.
- [ ] Restart and stop buttons work.

### Operator Testing Suite

- [ ] Testing Mode off blocks scenario and fault actions; on enables them.
- [ ] Admin auth Off allows unauthenticated access; TokenRequired asks for auth.
- [ ] API version mismatch shows a clear message in both clients.
- [ ] Capability mismatch shows a clear message in both clients.
- [ ] API unavailable recovers when the server comes back.
- [ ] Missing media shows playback guidance without a crash.
- [ ] SSE disconnect reconnects and resyncs.
- [ ] Reset scenario flags returns to normal behavior.

### WebUI

- [ ] WebUI loads from another device on the LAN.
- [ ] Over HTTPS, Add to Home Screen / Install app opens a standalone app with the app icon.
- [ ] Pairing or sign-in works for the current auth mode.
- [ ] Controls are usable on touch.
- [ ] Random play follows the current filter, including after editing a selected preset without saving.
- [ ] Filter Media opens, and its General, Tags, and Presets tabs work.
- [ ] Preset add, rename, delete, reorder, and load work, and the header list stays in order.
- [ ] Previous, next, loop, autoplay, favorite, and blacklist work.
- [ ] Mute toggles and its icon updates.
- [ ] Tag editor opens, edits, saves, and closes; category reorder persists after save.
- [ ] Auto Tag scan and apply work.
- [ ] Fullscreen keeps overlays usable on desktop browsers, and pseudo-fullscreen works on iOS.
- [ ] Connection status reads clearly when connected, reconnecting, and resyncing.
- [ ] After a refresh, the status line shows the refresh summary.
- [ ] Switching the system theme updates the shell and tag editor.
- [ ] Diagnostics panel appears below the status line.
- [ ] Library overlay opens and closes from the player controls, in fullscreen and in both themes.
- [ ] Library overlay **Showing N of M** matches the filter and search, and search and sort persist across close and reopen.
- [ ] Changing search, sort, filter, or preset scrolls the overlay grid to the top.
- [ ] Library grid lays out mixed-aspect thumbnails at desktop and mobile widths and reflows on resize.
- [ ] Library grid shows a placeholder for a missing thumbnail, favorite and blacklist badges, and a readable filename bar in both themes.
- [ ] Library grid looks like the desktop grid at the same width.
- [ ] Clicking a tile plays it and closes the overlay; a missing or unsupported file shows a message and keeps the overlay open.
- [ ] Escape closes the overlay; Tab to a tile and Enter or Space plays it.
- [ ] With the overlay open, favorite, blacklist, and playback changes from the desktop update tiles, sort, and the **Only never played** filter.
- [ ] With LAN access and mDNS on, the WebUI loads from another device at `http://<LAN hostname>.local:<port>`.

### Desktop

- [ ] Desktop connects to the server and shows current status.
- [ ] Random play follows the active filter, including right after a playback.
- [ ] Playing a library item starts that item; a missing or unsupported file shows a clear error.
- [ ] Previous, next, loop, autoplay, volume, and mute work.
- [ ] Fullscreen and player view switch correctly.
- [ ] Status text stays correct after playback actions.
- [ ] **View → Diagnostics** shows the client and session ids.
- [ ] Import folder adds new files, names the source after the folder, and keeps tags, favorites, and stats on files already imported.
- [ ] Library browse keeps responding while a large folder imports.
- [ ] Manage Sources enable and disable persists.
- [ ] Thumbnails appear in the library panel after a refresh, without restarting.
- [ ] Duplicate scan shows thumbnail and info pairs per group, allows Keep All or a chosen file per group, and confirms counts before deleting.
- [ ] Auto Tag scan and apply work.
- [ ] Favorite and blacklist toggles update the item.
- [ ] Tag editor adds and removes tags.
- [ ] Tag editor category rows and tag chips are readable in both themes.
- [ ] Filter dialog Tags tab has per-category collapse toggles.
- [ ] Clear playback stats asks for confirmation and clears stats.
- [ ] With backups on, a library change writes a `library.db.backup.*` file to the backups folder after the backup gap.

### Cross-Client

- [ ] Desktop and WebUI look and behave alike for the same features.
- [ ] Favorite and blacklist changes show in the other client.
- [ ] Tag edits show in the other client.
- [ ] Refresh status matches in both clients.

### Logging

- [ ] Operator Server Logs shows entries during a test run, with timestamp, level, and source.
- [ ] Desktop, WebUI, and server entries all appear in the server log.
- [ ] No tokens, secrets, or cookies appear in logs.

### Packaging

- [ ] Windows `Setup.exe` installs per user without elevation, and its shortcuts appear when offered.
- [ ] Linux `.AppImage` runs after `chmod +x`; desktop plays video with system LibVLC and refresh works with system `ffmpeg`.
- [ ] After first launch, both Linux AppImages appear under Multimedia in the app menu with their icons and launch the right AppImage.
- [ ] Without LibVLC on Linux, the desktop AppImage shows a dependency dialog with a copyable install command and exits cleanly.
- [ ] Moving a Linux AppImage and running it updates its menu entry; relaunching without moving does not rewrite it.
- [ ] After an in-app update on Linux, menu entries still launch the updated AppImage.
- [ ] Server in-app update: the check finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it.
- [ ] Desktop in-app update: Settings finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it.
- [ ] Icons match across shortcuts, menus, and the WebUI.

## Release Specific

> Add checks for features or changes in the current release. Clear these items after sign-off. If a check should outlive the release, move it to Manual Regression.

- [ ] A v0.12.0 library migrates on first start with favorites, tags, play history, sources, and presets intact.
- [ ] Export Library saves a copy to a chosen folder; Import Library with the server stopped restores it and can remap source folders.
- [ ] Favorite, tag, and playback changes made during a refresh are still there after it finishes.
- [ ] Stopping the server mid-refresh does not show the refresh as failed or complete, and work already done is kept.
- [ ] Desktop library grid loads more tiles as you scroll, and favorite, tag, and playback changes do not jump it back to the top.
- [ ] WebUI library overlay loads more tiles as you scroll, and reopens instantly at the same scroll position.
- [ ] Tag editor save on desktop and WebUI closes right away and shows the new tags; a failed save restores the previous tags.
- [ ] Renaming or deleting a tag updates the applied filter and saved presets.
- [ ] Choosing **None** in the preset list stays on **None** until the filter changes, and an unsaved filter shows a starred name.
- [ ] With **Category Combination** set to OR, the desktop filter summary says "any"; with AND it says "all".
- [ ] A preset with an OR tag filter is selected in the other app when the filters match, including presets saved before this release.
- [ ] Tags list in the same order on desktop and WebUI in the tag editor, filter Tags tab, and auto-tag results, with `_` tags before letters.
- [ ] Desktop current-file stats update when a new file starts playing.
- [ ] WebUI in Firefox stays connected across several reloads in a row.

## Release Flow

- [ ] Version set with `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION}`, and `.version` matches the tag you will push.
- [ ] `CHANGELOG.md` `[Unreleased]` is cut into the new release section titled with the release name, and a fresh `[Unreleased]` with empty headings is above it.
- [ ] `RELEASE-NOTES.md` has the new release entry, it follows the style guide at the top of that file, and its Verification section is filled in from this pass.
- [ ] CI passes on the commit being tagged, on both Linux and Windows.

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
  - [ ] PASS
  - [ ] FAIL
- [ ] All failures and skipped checks documented.
- [ ] Ready to tag.
