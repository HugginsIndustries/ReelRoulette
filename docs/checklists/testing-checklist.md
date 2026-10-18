# ReelRoulette Testing Checklist

This checklist is the pre-release pass: automated checks, a short smoke test, checks for this release's changes, and the release flow. Regression coverage comes from automated tests.

**Rule:** Every item is a check that passes or fails. Roadmap text and future work go in `MILESTONES.md`, and known issues in `ISSUES.md`, not here.

**Rule:** One line per check. Do not repeat implementation details, file paths, or platform notes that other docs already cover.

**Rule:** A manual check describes something a person can see or do in the apps. An agent check is something an agent can confirm from the repo, its docs, or the release workflow's runs. Other behavior that is only visible in code, logs, or API responses belongs in automated tests, not in this list.

**Rule:** A failed or skipped check stays unticked and gets a `Failed:` or `Skipped:` sub-bullet that says what happened and names the issue in `ISSUES.md` or the backlog item in `MILESTONES.md` that tracks it.

**Rule:** An agent check that can't be verified yet during the pass, for example because this version has no release run, stays unticked and gets a `Pending:` sub-bullet that says why. It is verified when finishing the release, and the note is removed.

Run `pwsh ./tools/scripts/reset-checklist.ps1` to clear check states and `Failed:`, `Skipped:`, and `Pending:` notes, and fill in the date and version, before a new pass.

## Test Run Metadata

- Test date/time: 2026-10-06 15:35:45
- Tester: Christian Huggins
- Release version: v0.14.1
- Environment (OS + device(s) + browser(s)): CachyOS desktop (server, WebUI in Firefox); CachyOS laptop on home LAN (WebUI in Firefox via .local); Pixel 8 Pro (WebUI in Firefox over Tailscale); iPad Pro 13-inch M4 (WebUI installed from Safari, over Tailscale); Windows 11 VM (server, Setup.exe install and in-app update from the previous release)

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
- [x] The server starts with its tray icon, and tray **Restart Server** and **Stop Server / Exit** work.
- [x] The Operator page loads.

## Release Specific

> Add checks for features or changes in the current release. They are cleared when the next release is promoted. A check that should run every release becomes an automated test.

### Agent checks

An agent verifies these from the repo, its docs, or the release workflow's runs during the pass, and ticks them.

- [ ] Mockup gap audit: every screen in `docs/mockups/reelroulette/` matches the release's WebUI, admin section, and recovery page, and each difference found is fixed in the mockup or recorded as a backlog item in `MILESTONES.md`.

- [ ] On Linux and Windows, the release publishes only the server, and the Windows package carries FFmpeg's license text, checked in a dev-channel release run of `release.yml`.

- [ ] The v0.15.0 release notes say the desktop app is no longer released and that ReelRoulette in the browser replaces it.

- [ ] The v0.15.0 release notes tell users to reload any open ReelRoulette page after updating the server, since an open page keeps the old API version until it's reloaded.

### Manual checks

These need a person, real devices, or the Windows VM.

- [ ] Mockup side by side: with `docs/mockups/reelroulette/` and the release's app open side by side on a desktop browser and on a phone, each screen looks as the mockup shows it, and each difference found is fixed in the mockup or recorded as a backlog item in `MILESTONES.md`.

- [ ] Behind `tailscale serve` and one other HTTPS proxy, the WebUI and its admin section connect, pair, browse, and play, and the server treats them as remote.
- [ ] On Android Chrome over HTTPS through each proxy, with the default auth mode, choosing Install (not Create shortcut) adds the WebUI to Settings → Apps and opens it standalone with its icon; iOS Add to Home Screen and desktop browser install still open standalone.
- [ ] With the server paused (`kill -STOP` on its process) while the WebUI plays, pressing Next several times shows Loading… on the player's indicator and, about 10 seconds after the first press, "No response from the server. Try again." in the in-app notice; after `kill -CONT`, `last.log` has one `playback=random-pick-timeout` line and no more than one random pick from those presses, and the next Next plays one item.
- [ ] After the Preact migration, the player, the library, filter, presets, and tag editor in the side panel's tabs, and Auto Tag work as in the previous release apart from the side panel's, its Library, Filter, and Tags tabs', and Auto Tag's own changes and the player's Auto-Pause, scrub bar, time, and Mute changes, in and out of fullscreen, on a desktop browser, the iPad in Safari, an Android phone, and as an installed app.
- [ ] With the dev release installed on Windows and Linux, the server's executable, shortcut, tray, and Linux menu icons show the new logo, and the WebUI's tab icon and its installed app icon on Android and iOS show it too. On Windows, check the server executable's icon in Explorer at small, medium, large, and extra large icon views, and the tray icon, since `app.ico` stores every size as PNG.
- [ ] On the Windows VM, measure whether folder import and refresh see paths in a different casing from the stored ones: add a source typed in a casing that differs from the folder on disk, import it, rename a file by case only, and refresh. Record the result in the Ordinal Path Identity on Linux entry's Traps in `MILESTONES.md`.
- [ ] In the WebUI, Favorites excluded and Blacklisted only each limit browse and random play as named.
- [ ] In the WebUI's Filter tab, on a desktop browser and a phone in both themes, a flagged duration's tooltip shows beside its red icon and inside the screen while the pointer is on the icon, after a tap on it, and while the field has focus.
- [ ] Every in-app dialog matches the WebUI's theme and works in an installed web app on desktop and on mobile, including in fullscreen.
- [ ] In the installed app on Android and iOS, dragging a tag category and a preset by its handle reorders them, and a drag that starts elsewhere on a row scrolls.
- [ ] On a phone, a tablet, and a desktop browser, and as an installed app on Android and iOS, the panel opens beside the player or as an overlay by width, and a phone on its side fills the screen with the player.
- [ ] As an installed app on the iPad and an Android phone, the header (upright) and the panel and the player's controls (upright, on its side, and on Android in fullscreen) stay clear of the notch, the status bar, and the home indicator; with the phone on its side, stopping the server shows the reconnecting indicator on the player.
- [ ] As an installed app on an iPad, launched in landscape and in portrait, the page and pseudo-fullscreen reach the bottom of the screen, and still do after turning it.
- [ ] In the WebUI's Library tab on a phone, a tablet, and a desktop browser, the preset and randomization dropdowns share a row in a panel about 440 px wide or wider and stack in a narrower one, the four controls take two rows on a phone on its side, and the tiles' favorite, blacklist, and playing icons show solid, with no gap between outline and fill.
- [ ] On a phone and a desktop browser, in both themes, the WebUI's Filter and Tags tabs look as the mockup shows them, Auto Tag covers the whole page, in fullscreen too, its count columns line up under their headers, and tapping a tag category's header toggles it.
- [ ] On a phone and a desktop browser, with Auto-Pause on Responsive, playback keeps going on every tab beside the player, and the overlay and Auto Tag pause it and resume it on close.
- [ ] In both themes on a phone and a desktop browser, the scrub bar and checkboxes are orange, the player's time is white, and the scrub bar moves smoothly on a video and fills smoothly on a photo with Autoplay on.
- [ ] With the server stopped, unavailable, or mismatched, and during a refresh, the player's indicator settles on one state.
- [ ] On a phone and an iPad, popups, the bell, and its list show and work in the browser, in fullscreen, and on a phone on its side.
- [ ] On a desktop browser and a phone, and as an installed app, every remembered setting is kept after a refresh and a browser restart, and the library search starts empty.
- [ ] As an installed app on iOS and Android, in the light and the dark theme, the status bar's text reads against the page.
- [ ] On a phone and an iPad, the field validation pattern's red icons, its tooltip, and a setting's saved check fade in and out, and with Reduce Motion on they show and hide at once.
- [ ] On a phone and an iPad, the sample popup shows at each of the six positions, clear of the player's controls and the indicator.
- [ ] While the loudness rescan runs, a video from the NAS plays on the iPad without stalling, and starts and seeks without a noticeable wait.
- [ ] After the loudness rescan, the Stats tab shows a peak for a video with audio.
- [ ] On the iPad, in Safari and Firefox, with ambient mode on, the player's corners stay rounded.
- [ ] On the iPad, with ambient mode on, a video playing for an hour or more doesn't make it run noticeably warm or drain its battery noticeably faster than with ambient mode off, and playback stays smooth.
- [ ] On the iPad in Safari and on a desktop browser, with Autoplay and Loop on and Loop stops autoplay off, a video shorter than Advance after repeats and advances once Advance after has passed, and pausing it holds the timer.
- [ ] On the iPad in Safari and on a desktop browser, in Timer mode with Autoplay and Loop on and Loop stops autoplay on, a video longer than Advance after repeats a stretch of Advance after seconds from its start and from where a seek lands, and the stretch shows faintly on the scrub bar, lined up with the thumb.
- [ ] On the iPad and a desktop browser, a photo with Loop on stays on screen with no flicker each time its timer starts over.
- [ ] On a phone and the iPad, pressing a held Apply with a minimum that is not valid brings the Min field above the keyboard.
- [ ] On the Pixel, a flagged section's tab shows its badge whole, without the tab changing width or its row wrapping.
- [ ] On two devices, saving, renaming, reordering, and deleting a preset on one shows on the other without a reload, a save, rename, or delete with its Other devices popup and a reorder with none, and neither overwrites the other's changes.
- [ ] On two devices, updating on one the preset the other has applied changes the other's filter and library, with its popup.
- [ ] With Enhanced audio on, videos play with sound in Firefox on the desktop and in the Pixel's and the iPad's installed apps, and turning it off plays sound directly.
- [ ] In the iPad's installed app, the volume slider shows from the start, and the slider and a two-finger drag change the video's volume relative to the system volume, without crackles, and play and pause don't pop.

## Release Flow

During the pass, on the release's dev build:

- [x] Server in-app update from the previous release: the check finds the new version without downloading, Download reaches ready, and Apply & Restart relaunches on it, on Linux and Windows; on Linux, menu entries still launch the updated AppImage.

When finishing the release, an agent ticks these:

- [x] Version set with `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION}`, and `.version` matches the tag you will push.
- [x] `CHANGELOG.md` `[Unreleased]` is cut into the new release section titled with the release name, and a fresh `[Unreleased]` with empty headings is above it.
- [x] `CHANGELOG.md` footer links: `[Unreleased]` compares the new version with `HEAD`, and a new line for this version compares the previous version with it.
- [x] `RELEASE-NOTES.md` has the new release entry, it follows the style guide at the top of that file, and its Verification section is filled in from this pass.

After committing the release, before tagging:

- CI passes on that commit, on both Linux and Windows.

After tagging, keep an eye on:

- `release.yml` finishing on Windows and Linux for the server.
- The GitHub release having only `Setup.exe` and `.AppImage`, plus source archives.
- An installed previous release finding and applying this update in-app.

## Sign-Off

- Overall result:
  - [x] PASS
  - [ ] FAIL
- [x] All failures and skipped checks documented.
- [x] Ready to tag.
