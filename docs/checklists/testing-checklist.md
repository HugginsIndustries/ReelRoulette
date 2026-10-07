# ReelRoulette Testing Checklist

This checklist is the pre-release pass: automated checks, a short smoke test, checks for this release's changes, and the release flow. Regression coverage comes from automated tests.

**Rule:** Every item is a check that passes or fails. Roadmap text, future work, and known issues go in `MILESTONES.md`, not here.

**Rule:** One line per check. Do not repeat implementation details, file paths, or platform notes that other docs already cover.

**Rule:** A manual check describes something a person can see or do in the apps. An agent check is something an agent can confirm from the repo, its docs, or the release workflow's runs. Other behavior that is only visible in code, logs, or API responses belongs in automated tests, not in this list.

**Rule:** A failed or skipped check stays unticked and gets a `Failed:` or `Skipped:` sub-bullet that says what happened and names the backlog item in `MILESTONES.md` that tracks it.

**Rule:** An agent check that can't be verified yet during the pass, for example because this version has no release run, stays unticked and gets a `Pending:` sub-bullet that says why. It is verified when finishing the release, and the note is removed.

Run `pwsh ./tools/scripts/reset-checklist.ps1` to clear check states and `Failed:`, `Skipped:`, and `Pending:` notes, and fill in the date and version, before a new pass.

## Test Run Metadata

- Test date/time: 2026-10-06 15:35:45
- Tester: Christian Huggins
- Release version: v0.14.1
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

## Smoke

A quick pass over the basics no automated test covers end to end.

- [x] The WebUI loads, browses the library, and plays a video in a desktop browser.
- [x] The WebUI loads, browses the library, and plays a video on a phone.
- [x] The desktop app starts, connects to the server, and plays a video.
- [x] The server starts with its tray icon, and tray **Restart Server** and **Stop Server / Exit** work.
- [x] The Operator page loads.

## Release Specific

> Add checks for features or changes in the current release. They are cleared when the next release is promoted. A check that should run every release becomes an automated test.

### Agent checks

An agent verifies these from the repo, its docs, or the release workflow's runs during the pass, and ticks them.

- [ ] The release notes warn not to go back to v0.14.0 or earlier after upgrading, since those versions would set the upgraded library aside.
- [ ] The Windows server release's bundled `ffprobe -version`, printed in the release log, names the pinned FFmpeg build.

### Manual checks

These need a person, real devices, or the Windows VM.

- [x] With a copy of the data folder upgraded by a newer build, the installed build runs without a library, shows the message on the Operator page, leaves the library and backups byte-identical, and updates in-app, on Linux and Windows.
- [x] Without a library, a library route answers 503 with the message, the open routes answer, and an unpaired LAN caller gets 401.
- [x] A copy of a v0.14.0 data folder opens in this build with its items, tags, presets, and stats intact, and every sort order on desktop and WebUI lists files as v0.14.0 did, on Linux and Windows.
- [x] Desktop import of a library exported from v0.14.0 is accepted and opens with its items after the server starts.
- [x] In the WebUI with a few thousand tiles loaded, scrolling deep in each sort order stays smooth.
- [x] Desktop plays video after the Avalonia and LibVLC update, on Linux and Windows.
- [x] On Windows, the server tray menu still opens and its items work after the Avalonia update.
- [x] After the Vite 8 build change, the WebUI looks and works as before in a desktop browser and on a phone.
- [x] In the WebUI library overlay, scrolling tiles away and back sends no new thumbnail requests in the browser network panel, and after a file changes and a refresh finishes, its tile shows the new thumbnail without reloading the page.
- [x] Under a WebUI tag filter, removing that tag from a file on the desktop takes it out of the WebUI tiles.
- [x] A favorite, a play, and a tag edit from the WebUI player show on the desktop's tiles and current file.
- [x] With the WebUI library overlay open under the default filter, a desktop favorite on a file outside the loaded tiles sends no library query, and a desktop favorite on a blacklisted file reloads the tiles.
- [x] Windows `Setup.exe` installs per user without elevation, and the server starts with its tray and no console window.

## Release Flow

During the pass, on the release's dev build:

- [x] Server in-app update from the previous release: the check finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it, on Linux and Windows; on Linux, menu entries still launch the updated AppImage.
- [x] Desktop in-app update from the previous release: Settings finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it, on Linux and Windows; on Linux, menu entries still launch the updated AppImage.

When finishing the release, an agent ticks these:

- [ ] Version set with `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION}`, and `.version` matches the tag you will push.
- [ ] `CHANGELOG.md` `[Unreleased]` is cut into the new release section titled with the release name, and a fresh `[Unreleased]` with empty headings is above it.
- [ ] `CHANGELOG.md` footer links: `[Unreleased]` compares the new version with `HEAD`, and a new line for this version compares the previous version with it.
- [ ] `RELEASE-NOTES.md` has the new release entry, it follows the style guide at the top of that file, and its Verification section is filled in from this pass.

After committing the release, before tagging:

- CI passes on that commit, on both Linux and Windows.

After tagging, keep an eye on:

- `release.yml` finishing on Windows and Linux for server and desktop.
- The GitHub release having only `Setup.exe` and `.AppImage`, plus source archives.
- An installed previous release finding and applying this update in-app.

## Sign-Off

- Overall result:
  - [ ] PASS
  - [ ] FAIL
- [ ] All failures and skipped checks documented.
- [ ] Ready to tag.
