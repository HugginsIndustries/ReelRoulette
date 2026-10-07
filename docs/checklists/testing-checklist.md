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

### Manual checks

These need a person, real devices, or the Windows VM.

- [ ] Behind `tailscale serve` and one other HTTPS proxy, the WebUI and its admin section connect, pair, browse, and play, and the server treats them as remote.
- [ ] On Android Chrome over HTTPS through each proxy, with the default auth mode, choosing Install (not Create shortcut) adds the WebUI to Settings → Apps and opens it standalone with its icon; iOS Add to Home Screen and desktop browser install still open standalone.
- [ ] With the server paused (`kill -STOP` on its process) while the WebUI plays, pressing Next several times shows "Loading..." and, about 10 seconds after the first press, "No response from the server. Try again."; after `kill -CONT`, `last.log` has one `playback=random-pick-timeout` line and no more than one random pick from those presses, and the next Next plays one item.
- [ ] After the Preact migration, the player, library overlay, filter dialog, presets, tag editor, and Auto Tag look and work as in the previous release, in and out of fullscreen, on a desktop browser, an iPhone or iPad in Safari, an Android phone, and as an installed app.

## Release Flow

During the pass, on the release's dev build:

- [x] Server in-app update from the previous release: the check finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it, on Linux and Windows; on Linux, menu entries still launch the updated AppImage.
- [x] Desktop in-app update from the previous release: Settings finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it, on Linux and Windows; on Linux, menu entries still launch the updated AppImage.

When finishing the release, an agent ticks these:

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

## Sign-Off

- Overall result:
  - [x] PASS
  - [ ] FAIL
- [x] All failures and skipped checks documented.
- [x] Ready to tag.
