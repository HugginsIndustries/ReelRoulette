# ReelRoulette Completed Milestones

The archive of finished milestones, moved here from `MILESTONES.md` as-is. The rules in `MILESTONES.md` apply to this file too.

## Completed Milestones

Latest completions first:

### M12i5 - Dev Script Cleanup

- **Status**: ✅ Complete
- **Goal**: One command, `run-server.ps1`, installs the WebUI's packages when they're out of date, rebuilds the WebUI, and runs the server from the repo, and the five scripts that ignored a switch they don't take refuse it.

#### Scope

- `tools/scripts/run-server.ps1` builds the WebUI on every run, with `npm run build` in `src/clients/web/ReelRoulette.WebUI`, then starts the server with `dotnet run`.
- Before the build, it installs the WebUI's packages when `node_modules` or `node_modules/.package-lock.json` is missing, or when `package-lock.json` is newer than `node_modules/.package-lock.json`, and otherwise skips the install.
- It installs with `npm ci`, which installs exactly what the lockfile lists without rewriting it, so a dev run never changes a tracked file.
- It prints whether it installs the packages or skips the install, beside the settings it prints today.
- When the install or the build fails, or the build leaves no `dist`, it stops with an error and doesn't start the server.
- It always serves the WebUI from that build's `dist`, so it no longer keeps a `ServerApp__WebUiStaticRootPath` already set.
- It keeps its parameters and their defaults: `-Port`, `-RequireAuth`, `-DisableLocalhostTrust`, `-Framework`, and `-PairingToken`.
- It stays a dev-run helper on the user's real settings, as `AGENTS.md` requires of dev-run helpers, and is never isolated.
- `ResolveWebUiStaticRoot` in `src/core/ReelRoulette.ServerApp/Program.cs` drops its fallback to the repo's WebUI `dist`, which it can't reach since the server's content root is pinned to its build folder, so it serves `ServerApp:WebUiStaticRootPath` when that's set and otherwise its own `wwwroot`.
- Delete `tools/scripts/run-server-rebuild.ps1`.
- Every reference to `run-server-rebuild.ps1` goes or names `run-server.ps1` instead:
  - `README.md`'s Helper Scripts gives one command to build the WebUI and run the server.
  - `docs/dev-setup.md`'s Run ServerApp says the script installs the packages when needed and rebuilds the WebUI first, its Run ServerApp with WebUI rebuild section goes, and its Troubleshooting item for WebUI changes not appearing no longer names the old script.
  - `CONTEXT.md`'s `tools/scripts/` line and Working Commands.
  - `docs/domain-inventory.md`'s Runtime scripts.
  - The Auth Cutover for API and Admin entry's Scope and Traps, which name the `-PairingToken` parameter of both scripts.
- This milestone fixes the issue "run-server-rebuild builds without installing packages" in `ISSUES.md`, with the install before the build.
- This milestone fixes the issue "Five scripts ignore a switch they don't take" in `ISSUES.md`: `cut-changelog.ps1`, `reset-checklist.ps1`, `check-milestones.ps1`, `run-server.ps1`, and `verify-web-deploy.ps1` get `[CmdletBinding()]` on their `param()` blocks, once every caller is checked.
- `tools/scripts/tests/test-scripts.ps1` gets a case for each of `check-milestones.ps1`, `cut-changelog.ps1`, and `reset-checklist.ps1` given an unknown switch.
- Both issues are deleted from `ISSUES.md` when this milestone lands.
- `ISSUES.md`'s header and `AGENTS.md`'s line on `ISSUES.md` say the commit always records a fix, and `CHANGELOG.md` only when users would notice it, as its style note says.

#### Traps

- `run-server-rebuild.ps1` builds with `npm run build` without installing packages, checks that `dist` exists, sets `ServerApp__WebUiStaticRootPath` to it, and runs `run-server.ps1` in a child `pwsh` with `-Port`, `-Framework`, `-PairingToken`, and the two switches.
- Without an install, a clone with no `node_modules` fails to build the WebUI, and a pulled change to `package-lock.json` builds with stale packages.
- `run-server.ps1` keeps a `ServerApp__WebUiStaticRootPath` already set, and otherwise uses the same `dist`, which is how `run-server-rebuild.ps1` hands it the build.
- `run-server-rebuild.ps1` always passes the OS's framework, `net10.0-windows` or `net10.0`, and takes no `-Framework` of its own.
- `dotnet run` builds the server before starting it, so the install and the WebUI build are the only steps the merge adds.
- npm writes `node_modules/.package-lock.json`, its hidden lockfile, after `package-lock.json` at the end of an install: after the WebUI's last install, `package-lock.json` is 9 ms older, with npm 12.2.0 (measured, from the files' times).
- `npm ci` writes the hidden lockfile and leaves `package-lock.json` alone, so the run after an install skips the next one (inferred).
- A pull or checkout that changes `package-lock.json` writes it with the current time, so the next run installs, and one that leaves it unchanged keeps its time (inferred).
- `npm ci` deletes `node_modules` before it installs, and fails when `package.json` and `package-lock.json` disagree.
- `stage-webui-assets.ps1` and `verify-web-deploy.ps1` run `npm install` on every run, and CI's WebUI job runs `npm ci`.
- `README.md`, `CONTEXT.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `ISSUES.md`, and the Auth Cutover for API and Admin entry name `run-server-rebuild.ps1`, and so do `CHANGELOG.md`'s released sections and `MILESTONES-COMPLETED.md`, which keep it as history (measured, by a search).
- `AGENTS.md`, the skills, the testing checklist, and the active entries' spot checks don't name `run-server-rebuild.ps1` (measured, by a search).
- `AGENTS.md` names `run-server.ps1` as the dev-run helper that uses real settings, which stays true of the merged script.
- `run-server.ps1` runs the server on the user's real settings, catalog, and library, so agents must not run it, and the spot check is the user's.
- The script tests must not call `run-server.ps1`, since a run that doesn't refuse the switch would start a server on the user's real settings (inferred).
- The script tests don't call `verify-web-deploy.ps1` either, since a run that doesn't refuse the switch builds the WebUI and starts a server, isolated but slow (inferred). `AGENTS.md` lets agents run it.
- None of the five scripts has `[CmdletBinding()]`, so a switch it doesn't take is ignored: `check-milestones.ps1` runs its checks, `reset-checklist.ps1` resets the checklist, and `cut-changelog.ps1` goes on to its own checks (measured).
- `run-server.ps1` and `verify-web-deploy.ps1` declare their parameters the same way, so they ignore an unknown switch too (inferred).
- With `[CmdletBinding()]`, an unknown switch fails before the script runs, with "A parameter cannot be found that matches parameter name 'Bogus'.", and `pwsh -File` exits 1 (measured, on a scratch copy of `check-milestones.ps1`).
- `Invoke-Tool` in `test-scripts.ps1` runs a script as `& $Script @Parameters` and turns a thrown error into exit code 1 with its message, so a refused switch reads as code 1 with that message (measured).
- `test-scripts.ps1` passes the three scripts it tests only parameters they declare.
- The skills run `check-milestones.ps1` with `-BaseRef HEAD` or `-Staged -BaseRef HEAD`, `cut-changelog.ps1` with `-Version` and `-Name`, and `reset-checklist.ps1` with none.
- `set-release-version.ps1` calls `verify-web-deploy.ps1` with no parameters, and so do the commands in `AGENTS.md`, `README.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, and the testing checklist.
- The commands in `README.md`, `docs/dev-setup.md`, and the testing checklist use only switches the scripts declare.
- Once `run-server-rebuild.ps1` is gone, nothing in the repo calls `run-server.ps1`.
- `[CmdletBinding()]` also accepts the common parameters, such as `-Verbose` and `-ErrorAction`.
- `set-release-version.ps1` already has `[CmdletBinding()]`, and `stage-webui-assets.ps1`'s `[Parameter(Mandatory = $true)]` already makes it refuse an unknown switch (measured).

#### Acceptance

- `check-milestones.ps1`, `cut-changelog.ps1`, and `reset-checklist.ps1` each refuse an unknown switch with exit code 1, and `cut-changelog.ps1` and `reset-checklist.ps1` leave their file unchanged when they do, in the new cases of `pwsh ./tools/scripts/tests/test-scripts.ps1`, which passes.
- `pwsh ./tools/scripts/verify-web-deploy.ps1 -Bogus` exits 1 before it builds anything, and `pwsh ./tools/scripts/verify-web-deploy.ps1` passes.
- `run-server.ps1` and `verify-web-deploy.ps1` have `[CmdletBinding()]`, `run-server.ps1` installs the packages by the rule in Scope and builds the WebUI before it starts the server, and `run-server-rebuild.ps1` is gone, checked by reading `tools/scripts/`.
- No file refers to `run-server-rebuild.ps1` apart from this milestone's entry, its commit message, `CHANGELOG.md`, and `MILESTONES-COMPLETED.md`, checked by `git grep run-server-rebuild`.
- `pwsh ./tools/scripts/check-milestones.ps1` passes.
- A quick spot check: the user runs `pwsh ./tools/scripts/run-server.ps1`, which skips the install, rebuilds the WebUI, and starts the server, and the WebUI loads from it; then, after `touch src/clients/web/ReelRoulette.WebUI/package-lock.json`, runs it again and sees it install the packages first; then runs it once more and sees it skip the install.

#### Evidence

- `pwsh ./tools/scripts/tests/test-scripts.ps1` failed only its three new cases before `[CmdletBinding()]`, each script running with `-Bogus` and `cut-changelog.ps1` and `reset-checklist.ps1` rewriting their file, and passed 86 of 86 after it (measured).
- Copies of the `param()` blocks of `run-server.ps1` and `verify-web-deploy.ps1` ran with `-Bogus` and exited 0 without `[CmdletBinding()]`, and refused it with exit 1 with it (measured).
- A harness in `artifacts/scratch/` ran an unchanged copy of `run-server.ps1` in a fake repo with stand-in `npm` and `dotnet` programs, so no server started, and passed 9 of 9 cases (measured):
  - packages up to date: no install, then the build, then `dotnet run`, with a `ServerApp__WebUiStaticRootPath` already set replaced by `dist`;
  - `package-lock.json` newer than the hidden lockfile, or no `node_modules`: `npm ci` before the build;
  - a failed install, a failed build, or a build that leaves no `dist`: a nonzero exit and no `dotnet run`;
  - every parameter reaches the settings and `dotnet run`, and the parameters and their defaults match the previous commit's;
  - `-Bogus`: exit 1 with neither program called.
- The harness's first run found that `Get-Item` doesn't find `node_modules/.package-lock.json` on Linux without `-Force`, though `Test-Path` does, so the script reads its time with `Get-Item -Force` (measured).
- The review found that the settings printed before the install and the build, whose output pushed them off screen, and left "Starting ReelRoulette.ServerApp..." on screen when the build failed, so they now print just before `dotnet run`. A second harness ran the final script the same way and passed 3 of 3 cases, two of which fail on the earlier order (measured):
  - a build that succeeds: its output, then the settings, then `dotnet run`;
  - a failed build: a nonzero exit, no settings, and no `dotnet run`;
  - `package-lock.json` newer than the hidden lockfile: `npm ci`, the build, then `dotnet run`, and the settings say it installed.
- The first harness and the user's spot check ran before that move, which changes only where the settings print.
- `pwsh ./tools/scripts/verify-web-deploy.ps1 -Bogus` printed only the refusal and exited 1, leaving the previous run's server logs untouched, and `pwsh ./tools/scripts/verify-web-deploy.ps1` passed (measured).
- After that run's `npm install`, `node_modules/.package-lock.json` was 10 ms newer than `package-lock.json` (measured).
- `ResolveWebUiStaticRoot` in `src/core/ReelRoulette.ServerApp/Program.cs` no longer falls back to the repo's WebUI `dist`. Since the content root was pinned to `AppContext.BaseDirectory` in April 2026, that fallback looked for `src/core/ReelRoulette.ServerApp/bin/clients/web/ReelRoulette.WebUI/dist`, which never exists, so it was never used (measured, by resolving the path). The server still serves `ServerApp:WebUiStaticRootPath` when it's set, and otherwise its own `wwwroot`.
- After that removal, `dotnet build ReelRoulette.sln` passed with no warnings, `dotnet test ReelRoulette.sln` passed 495 of 495, and `pwsh ./tools/scripts/verify-web-deploy.ps1` passed (measured).
- npm 12.2.0's `npm ci` installs with `save: false`, which leaves `package-lock.json` alone, and writes `node_modules/.package-lock.json` on every install, read from npm's code.
- `pwsh ./tools/scripts/check-milestones.ps1` passes, with and without `-BaseRef HEAD`.
- `git grep run-server-rebuild` finds it only in `CHANGELOG.md`'s released sections, `MILESTONES-COMPLETED.md`, and the commit message.
- Docs updated: `README.md`, `docs/dev-setup.md`, `CONTEXT.md`, `docs/domain-inventory.md`, the Auth Cutover for API and Admin entry, `ISSUES.md`, and `AGENTS.md`.
- `CHANGELOG.md` gets no entry, since the change is to dev scripts and to server code that was never used, none of which users see.
- The user's spot check passed on all three runs (measured):
  - the first skipped the install, rebuilt the WebUI, and started the server, and the WebUI loaded from it;
  - after `touch` on `package-lock.json`, the second installed the packages first;
  - the third skipped the install again;
  - the install added no noticeable time to the start.

### M12i4 - Desktop Client Removal

- **Status**: ✅ Complete
- **Goal**: The desktop client, its packaging, its tests, and everything only it used are gone, and the WebUI is the only client.

#### Decisions

- The desktop goes before the WebUI does everything it did. Until the milestones that bring them back, these desktop features have no equivalent:
  - the volume slider, scroll-wheel volume, and volume steps, which WebUI Volume and Enhanced Audio brings back;
  - loudness normalization and the Stats panel's Adjustment row, which WebUI Loudness Normalization brings back;
  - an on-screen Random button, which WebUI Player Controls brings back;
  - the keyboard shortcuts, which WebUI Keyboard Shortcuts brings back;
  - Show in File Manager, which Show in File Manager from the WebUI brings back;
  - multi-select, its bulk actions, and editing several items' tags, which WebUI Multi-Select and Bulk Actions brings back;
  - Refresh Now, the refresh and backup settings, duplicate review, and clearing the whole library's playback stats, which Admin Refresh, Backup, and Duplicate Review brings back;
  - Manage Sources, with its statistics, adding a folder, enabling and disabling a source, and refreshing one source, which Admin Source Management brings back;
  - library export and import with the source remap, which Admin Library Catalog Transfer brings back, with restoring a backup;
  - volume above 100%, which WebUI Volume Boost may bring back.
- Until the admin milestones land, nothing offers a UI for library management, a gap that is accepted.
- Meanwhile the tray's Refresh Library still starts a refresh, and auto-refresh and backups keep running on the stored settings.
- Formats only LibVLC plays, such as avi and wmv, play in no client until the playback sessions release, and Browser-Playable Filter only hides them.
- These desktop features are dropped without a WebUI equivalent, because a browser cannot offer them:
  - always-on-top (the closest is picture-in-picture, which the WebUI turns off with `disablepictureinpicture`),
  - desktop self-update,
  - the Linux dependency dialog,
  - application menu registration,
  - the FFmpeg log window, which has been empty since the server took over refresh,
  - Player View's lock of the window to the video's aspect ratio.
- These desktop Settings dialog entries are dropped as not useful in the WebUI:
  - the desktop's own dev update channel (the server's is in the admin section),
  - client settings backups (the WebUI's settings are a few values in browser storage),
  - the core server base URL (the WebUI calls the server that served it),
  - Force API playback (the WebUI always plays through `/api/media`),
  - image scaling (it limited how large the desktop decoded photos, and the browser scales photos to fit by itself).
- These are dropped as not worth bringing back:
  - the Diagnostics dialog's last SSE revision, API reachability line, and Copy button, beside the client and session ids and versions the Settings tab's Diagnostics shows,
  - the status line's times to the millisecond.
- A route, field, or event that only the desktop calls today stays while a planned milestone is written to use it: the refresh start, status, and settings routes, the backup settings, duplicate scan and apply, source import and enable, the catalog checkpoint, clear playback stats, `sourceStateChanged`, and the source statistics' duration fields.
- Requests name a library item only by its catalog id, in a field named for it, and the server no longer looks an item up by its full path.
- The filter state's old `favoritesOnly` and `excludeBlacklisted` fields are no longer written, and the server and the WebUI keep reading them in stored presets until Per-Preset Preset Writes rewrites those presets.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Code and tests | ✅ Complete | The desktop projects, the Core code only the desktop uses, and their tests removed from the solution and the repository. |
| Packaging | ✅ Complete | A release that builds and publishes only the server, with FFmpeg's license text, and the old icons deleted. |
| Contract | ✅ Complete | Routes, fields, and lookups only the desktop used removed, item requests named by id, and the old filter fields no longer written, in OpenAPI, the generated WebUI types, and the WebUI. |
| Fixtures | ✅ Complete | The fixtures only the WebUI reads moved to its tests, so every shared fixture has a Core and a WebUI reader. |
| Mockup | ✅ Complete | The mockup without the desktop notice, the desktop client, or its log sources. |
| Docs | ✅ Complete | `AGENTS.md`, the pre-release skill, current-state docs, the testing checklist, and the changelog without the desktop client. |

#### Code and tests slice

**Scope**

- Remove `ReelRoulette.DesktopApp`, `ReelRoulette.LibraryArchive`, and `ReelRoulette.DesktopApp.Tests` from the solution and the repository.
- Remove the Core tests' link to the desktop's `CoreServerApiClient.cs` (`ReelRoulette.Core.Tests.csproj`) and `CoreServerApiClientTests.cs`, which tests it.
- Remove Core's `LibraryGridLayout` and its tests, and `JsonFileStorageService`, `CoreStorageServices`, and `Abstractions/CoreInterfaces.cs`, which only the desktop uses.
- Comments in Core, the server, and the Core tests that describe the desktop as a client go or are reworded.
- `LibraryCatalogStore`'s import and replace API stays (`ReadSourceRootPaths`, `PrepareIncomingFromFile`, `RemapSources`, `PublishIncoming`, and its recovery), since Admin Library Catalog Transfer reuses it.

**Traps**

- The three projects are 107 tracked files and 31,740 lines of C# and AXAML, including 4,231 test lines, 173 test methods, and 421 test cases (measured).
- `ReelRoulette.Core.Tests.csproj` compiles the desktop's `CoreServerApiClient.cs` for `CoreServerApiClientTests.cs`, 15 test cases, so with the desktop folder gone and that link left the build fails with CS2001 (measured).
- With the projects, the link, and the test file removed, the solution builds with no warnings, and the remaining 482 Core tests and 7 ServerApp tests pass (measured).
- Only `LibraryArchive` and the Core tests call `LibraryCatalogStore`'s import API (measured).
- `src/clients/desktop` also holds 3.6 GB of untracked build output, which removing the tracked files leaves behind (measured).
- `LibVLCSharp.Avalonia`, `VideoLAN.LibVLC.Windows`, `TagLibSharp`, and `Avalonia.Fonts.Inter` leave with the desktop project. Avalonia itself stays, since the server's tray uses it (measured).
- The desktop's duplicate Select Best rule (`DuplicateGroupViewModel` in `DuplicatesDialog.axaml.cs`), its import remap dialog, and its Manage Sources statistics stay readable in git history for the admin milestones that rebuild them.

**Acceptance**

- The solution has no desktop projects, and nothing in the code, scripts, workflows, or the solution refers to `src/clients/desktop`, checked by a search of the repository.
- `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.

**Evidence**

- `src/clients/desktop` is deleted, its 107 tracked files and its 3.6 GB of ignored build output, and `ReelRoulette.sln` is edited by hand to drop the three projects and the `desktop` folder, keeping its encoding (`dotnet sln remove` also drops the empty `clients` and `web` folders and adds a byte order mark).
- The Core tests' link to `CoreServerApiClient.cs` and `CoreServerApiClientTests.cs` (15 cases) are gone, and so are Core's `LibraryGridLayout` with `LibraryGridLayoutTests.cs` (6 cases), `JsonFileStorageService`, `CoreStorageServices`, and `Abstractions/CoreInterfaces.cs`.
- Reworded comments: `BackupFileNaming`, `TagNameComparer`, `LibraryPlaybackService.BuildRandomizationScopeKey`, and the old-field shapes in `OpenApiRouteContractTests`. The tests' desktop client ids and log source are neutral, `QueryLibrary_AcceptsDesktopDurationFilterJson` is `QueryLibrary_AcceptsDurationStringFilterJson`, and the regression test's check that no `desktop-settings.json` is written is gone, since nothing writes that file.
- The desktop comments in `FlagFilterModes.cs`, `ApiContracts.cs`, `FilterStateTests.cs`, and `ItemIdContractTests.cs` change with the Contract slice, which changes those files.
- `LibraryCatalogStore`'s `ReadSourceRootPaths`, `DiscardIncoming`, `DiscardPrevious`, `RestorePrevious`, `DeleteLiveDatabase`, and `LibraryCatalogReplaceOptions.RetainPrevious` now have no caller and no test until Admin Library Catalog Transfer (measured).
- `dotnet build ReelRoulette.sln`: 0 warnings, 0 errors. `dotnet test ReelRoulette.sln`: Core.Tests 476 and ServerApp.Tests 7 passed. `npm run verify`: 1490 tests passed (measured).
- README's and `CONTEXT.md`'s command to run the desktop, and `docs/dev-setup.md`'s Run Desktop app section and Key Projects entry, are gone. `docs/architecture.md` and `docs/domain-inventory.md` no longer describe Core's `LibraryGridLayout` or storage abstractions, and name the WebUI's `libraryGridLayout.ts` as the only grid layout.
- A search finds no code, script, workflow, or solution entry that refers to `src/clients/desktop` or the desktop projects. `CONTEXT.md`, `docs/architecture.md`, and `docs/domain-inventory.md` still name `src/clients/desktop` in their desktop client descriptions, which the Docs slice removes, and its Acceptance searches for that path.

#### Packaging slice

**Scope**

- Remove the `desktop` component from the `release.yml` matrix, with its `--icon` choice, its `native_component`, and the Windows LibVLC relocation step.
- Remove `stage_native`, which `release.yml` computes but never reads.
- Stop publishing the desktop update feeds.
- Remove the desktop's `<Version>` updates and the `-NoUpdateDesktopVersion` switch from `set-release-version.ps1`, and the docs that describe the switch.
- Delete the old icons `assets/HI.ico`, `assets/HI-256.png`, and `assets/HI-512.png`.
- The Windows server package, which bundles FFmpeg and ffprobe, ships the license text its FFmpeg build needs from `licenses/`.
- `licenses/LGPL-2.1.txt`, which only LibVLC needed, is deleted once nothing ships it.
- `README.md`'s Third-Party Components section names FFmpeg's license correctly and no longer names LibVLC.

**Traps**

- `release.yml` lists `components=(server desktop)` and gives the desktop its own case, `--icon` choice, `native_component`, and the step "Relocate LibVLC into probe path (Windows desktop)".
- Every leg packs, uploads to B2, and mirrors to GitHub with no per-component code, so dropping the desktop legs stops the desktop feeds and the `ReelRoulette.Desktop` assets.
- `--shortcuts "Desktop,StartMenuRoot"` makes the server's Windows desktop shortcut, and stays.
- Only `DesktopApp.csproj` copies `licenses/GPL-3.0.txt` and `licenses/LGPL-2.1.txt` into a build, so the Windows server package ships no license text for the FFmpeg build it bundles (measured).
- The Windows server package bundles BtbN's `win64-gpl` FFmpeg build, and Linux packages bundle no FFmpeg.
- `README.md` says LibVLC and FFmpeg are "licensed under the GNU GPL and LGPL respectively", which pairs them the wrong way round (inferred).
- `verify-linux-packaged-server-smoke.sh` has no desktop-client references: its `.desktop` matches are the server's freedesktop menu entries (measured).
- CI has no desktop job (measured).
- An installed desktop's updater polls its own feed (`reelroulette/desktop{-dev}` on B2, channel `{os}-desktop{-dev}`, package `ReelRoulette.Desktop`) and never reads GitHub, so it can't pick up a server package.
- Once no desktop is published, the installed desktop reports itself up to date, since the old feed files stay on B2 (inferred).
- `set-release-version.ps1` sets `ReelRoulette.LibraryArchive.csproj`'s version on every run, not only behind the switch, so the script fails once that project is gone (measured).

**Acceptance**

- `release.yml` builds and publishes only server packages and feeds, and the Windows server package carries FFmpeg's license text, checked by reading it.
- Nothing in the code, scripts, workflows, or the solution refers to `HI.ico`, `HI-256.png`, `HI-512.png`, LibVLC, or `-NoUpdateDesktopVersion`, checked by a search of the repository.
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` passes.

**Evidence**

- `release.yml` lists `components=(server)`, without the desktop case, its icon branch, `native_component="desktop"`, `stage_native`, or the LibVLC relocation step. Its matrix step, run locally with a stable and a dev version, gives 4 and 2 legs, identical to the server legs before without `stage_native` (measured).
- The bundled FFmpeg build is configured with `--enable-gpl --enable-version3`, from the ffprobe banner in the v0.14.1 release run's log, so it needs the GPL-3.0 text (measured).
- The step, now "Bundle FFmpeg and its license into publish output (Windows server)", copies `licenses/GPL-3.0.txt` to `runtimes/win-x64/native/FFmpeg-LICENSE.txt`, fails without it, and logs its size. Its license lines, run locally against a scratch folder, copied the text unchanged, and the step's script parses (measured). `ci.yml`'s comment that names the step follows the rename.
- `set-release-version.ps1` no longer takes `-NoUpdateDesktopVersion` or sets the desktop projects' versions. Run with `-Version v0.0.0-test -NoRunVerify` in a scratch copy of the repo, it exits 0 and changes only `.version`, OpenAPI, `ServerStateService.cs`, `ServerContractTests.cs`, `ServerApp.csproj`, `README.md`, and `docs/dev-setup.md` (measured).
- `set-release-version.ps1` has `[CmdletBinding()]`, so it refuses a switch it doesn't take, such as `-NoUpdateDesktopVersion` or a typo like `-NoRunVerfy`, before changing anything; without it, both were ignored and the run went ahead (measured, in a scratch copy).
- `assets/HI.ico`, `assets/HI-256.png`, `assets/HI-512.png`, and `licenses/LGPL-2.1.txt` are deleted.
- README's Third-Party Components names the BtbN build, its GPL-3.0 license, and where its text ships, and no longer names LibVLC.
- These sections describe the server-only release and the script without the switch: README's Prerequisites, Quick Start (which offers only the server's downloads), Helper Scripts, and Packaging and releases; `docs/dev-setup.md`'s Prerequisites, Velopack packaging and release, Release Versioning, and Troubleshooting; `docs/architecture.md`'s Packaging and Delivery; `CONTEXT.md`'s server icon and CI and release lines; and `docs/domain-inventory.md`'s release script and icon asset lines. `.gitignore`'s comment drops LibVLC. The rest of those docs still describe the desktop client until the Docs slice.
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` passed, and `pwsh ./tools/scripts/tests/test-scripts.ps1` passed 83 checks (measured).
- A search finds no code, script, workflow, or solution entry that refers to `HI.ico`, `HI-256.png`, `HI-512.png`, LibVLC, or `-NoUpdateDesktopVersion`. `CONTEXT.md`, `docs/architecture.md`, and `docs/domain-inventory.md` still name LibVLC in their desktop client descriptions, which the Docs slice removes, and its Acceptance searches for LibVLC.
- The changelog's Removed entry for the desktop app and Fixed entry for FFmpeg's license land with this slice rather than the Docs slice, and the new logo bullet drops its sentence that the desktop keeps its old icon, so each commit's changelog matches it.

#### Contract slice

**Scope**

- Remove `POST /api/library-states`, `LibraryStatesRequest`, and `LibraryCatalogSession.ReadItemStates`, which only that route uses. `LibraryStateResponse` stays, since favorite and blacklist return it.
- Remove `PresetResponse.summary`, which the server never fills.
- Remove the fields only the desktop reads: `itemTagsChanged.itemIds`, the auto-tag apply response's `changedItemPaths` (at its top and in `applied`) and `assignmentsAdded`, `playbackRecorded.path`, and the library stats' `uniquePlayedVideos`, `uniquePlayedPhotos`, `neverPlayedVideos`, and `neverPlayedPhotos`.
- Remove the auto-tag apply response's top-level `changedItemIds`, which no client reads, so the response holds only `applied`.
- The library stats' `uniquePlayedMedia` and `neverPlayedMedia` stay, since the Stats tab shows them.
- Remove `AutoTagScanRequest.itemIds`, which only the desktop fills.
- Item lookups take only a catalog id: `ResolveItemId` no longer falls back to the full path, and `POST /api/library/item` reads by id only.
- `GET /api/media/{idOrToken}` becomes `GET /api/media/{token}` and streams only the tokens the random and play routes issue.
- Rename the request fields that now hold only an item id: `path` becomes `itemId` in the favorite, blacklist, and record-playback requests, and `itemPaths` becomes `itemIds` in clear playback stats. `LibraryItemReadRequest.id` keeps its name.
- The WebUI's serializer, and Core's `FlagFilterModes.Name`, `FavoritesOnly`, and `ExcludeBlacklisted`, stop writing `favoritesOnly` and `excludeBlacklisted`, and the FilterState schema drops them.
- The server's filter parser and the WebUI keep reading the old fields in stored presets.
- `FilterStateSchema_NamesEveryFieldTheParserReads` names the two old fields as read by the parser but left out of the schema, until Per-Preset Preset Writes stops reading them.
- `ClientLogRequest.Source` no longer defaults to `"desktop"`.
- The server's API version becomes 2: `apiVersion` 2, `minimumCompatibleApiVersion` 2, and only "2" supported, and the WebUI's own version becomes 2, so a client written for version 1, such as an installed desktop app, refuses the server.
- Clear playback stats clears every item only with `allItems: true`, clears just the items in `itemIds`, and refuses with 400, clearing nothing, a request with neither or both.
- The comment that the random and play responses' `id` is for the desktop, and the WebUI's comments about the desktop, are corrected.
- OpenAPI, the generated WebUI types, the WebUI's requests, and `docs/api.md` change with the routes and fields.

**Traps**

- The WebUI's Stats tab reads the playing item through `POST /api/library/item` with its id (`src/stats/statsTab.ts`), so the route stays.
- The WebUI's Stats tab shows the random and play responses' `id` as the file's path, and the player falls back to it for the display name (`src/stats/statsTab.ts`, `src/playback/nowPlaying.ts`, `src/playback/player.ts`), so the field stays.
- The WebUI sends auto-tag apply's `itemPaths` as full paths, which the server finds with `ResolveItemByPath`, so that lookup stays.
- The WebUI names items by catalog id at every call to the routes `ResolveItemId` serves, and plays media only by token (inferred, from its call sites).
- `POST /api/play/{itemId}` accepts a full path through `ResolveItemId`, though OpenAPI and `docs/api.md` say it doesn't.
- `serializeFilterStateForApi` (`src/filter/filterStateModel.ts`) writes `favoritesOnly` and `excludeBlacklisted` beside the modes for older readers. Without the two fields in the generated types it still type-checks, since the generated `FilterState` takes any other field (measured).
- `FilterStateSchema_NamesEveryFieldTheParserReads` (`OpenApiRouteContractTests.cs`) needs the fields `LibraryListFilterParser` reads and the FilterState schema's properties to be one set, so dropping the old fields from the schema while the parser reads them fails it (inferred).
- With the serializer no longer writing the old fields, 41 WebUI tests in 8 files fail, each checking them in a request it sent (measured).
- `LibraryListFilterParser` reads the old fields through `FlagFilterModes.ResolveFavorites` and `ResolveBlacklisted`, and the WebUI through `resolveFlagModes`.
- No release contains the Favorites and Blacklisted modes, so every preset a release saved has only the old fields (measured).
- The Stats tab shows the library stats' `uniquePlayedMedia` and `neverPlayedMedia` (`src/stats/statsModel.ts`).
- No WebUI code calls `POST /api/playback/clear-stats`.
- The server clears every item's playback stats when clear-stats names no items, and the server's JSON reading ignores a field the request type doesn't have, so a client that still sends `itemPaths`, such as an installed desktop, would clear the whole library.
- The desktop refuses a server whose `minimumCompatibleApiVersion` is above 1 or whose `apiVersion` isn't 0 or 1 (`MainWindow.axaml.cs`, in git history from before Desktop Client Removal).
- About 40 server tests name items by full path on the routes `ResolveItemId` serves (measured).
- `Spec_ListsEveryMappedApiAndControlRoute` fails for a route the server maps that the spec doesn't list, and `OpenApiSpec.AssertMatchesSchema` needs a payload's fields and its schema's to be the same set.

**Acceptance**

- OpenAPI has none of the removed routes and fields and names the renamed fields, checked by reading `shared/api/openapi.yaml`, and `npm run verify:contracts` passes.
- A full path no longer finds an item on any route that takes an item id, and the media route streams only issued tokens, in server tests of the id lookup and the media route.
- The favorite, blacklist, and record-playback requests send `itemId`, in WebUI tests of each request and server tests of each route, and clear playback stats takes `itemIds`, in a server test, since no WebUI code calls it.
- The WebUI writes neither `favoritesOnly` nor `excludeBlacklisted`, and a stored preset with only the old fields still filters as before, in WebUI filter model tests and server filter parser tests.
- Clear playback stats with `allItems: true` clears every item, with `itemIds` clears only those, and with neither or both is refused with 400 and clears nothing, in server tests of the route.
- The server reports API version 2 and accepts clients of version 2 only, and the WebUI accepts only a version 2 server, in server version tests and WebUI compatibility tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- Gone: `POST /api/library-states` with `LibraryStatesRequest`, `GetLibraryStates`, and `ReadItemStates`; `PresetResponse.summary`; `itemTagsChanged.itemIds`; auto-tag apply's `changedItemPaths`, `assignmentsAdded`, and top-level `changedItemIds`, so its response holds only `applied`; `playbackRecorded.path` with `RecordPlaybackResult.FullPath`; the library stats' four per-type played counts; and `AutoTagScanRequest.itemIds` with the catalog's path scan (`CatalogAutoTagScanScope.Paths`, `ReadAutoTagItemsByPaths`, `ReadTagsForItems`). The catalog's auto-tag result keeps only each tag's changed ids.
- `ResolveItemId` matches only the catalog id, in any case, so the library item, favorite, blacklist, record-playback, clear-stats, play, and tag editor model and apply-item-tags routes take only an id. Favorite, blacklist, and record-playback answer "itemId is required" for a blank id and "item not found in library" for an unknown one. `ResolveItemByPath` stays for auto-tag apply's `itemPaths`.
- `GET /api/media/{token}` streams only tokens from `ServerMediaTokenStore`, so an item id no longer skips the check that its source is enabled.
- Favorite, blacklist, and record-playback take `itemId`, and clear-stats takes `itemIds`.
- `FlagFilterModes.Name`, `FavoritesOnly`, and `ExcludeBlacklisted` are gone, and the WebUI's serializer writes only the modes. The parser and `resolveFlagModes` still read the old fields, and `FilterStateSchema_NamesEveryFieldTheParserReads` lists them in `OldFieldsReadButNotSpecified`, failing while the list names a field the parser no longer reads (measured, with the parser's read of `excludeBlacklisted` removed).
- `ClientLogRequest.Source` defaults to empty, and `RandomResponse.Id`'s comment says the Stats tab shows it.
- OpenAPI drops the route and fields, names `itemId` and `itemIds`, names the media operation `getMediaByToken`, and describes the old filter fields only as what stored presets fall back to. Favorite, blacklist, and record-playback list their 404 for an unknown id. `LibraryStateResponse` stays, though no route's response refers to it. The generated WebUI types and `docs/api.md` follow.
- `CONTEXT.md`, `README.md`, `docs/architecture.md`, and `docs/domain-inventory.md` follow too: the library item read by id only, clear-stats with `allItems` or ids and refusing neither or both, the auto-tag scan as the full library or enabled sources, `/api/media/{token}`, `playbackRecorded` and `itemTagsChanged` without their path fields, and API version 2 in the WebUI's status and Diagnostics, with no item-state read.
- New server tests: a full path finds nothing through each of nine catalog lookups (`ItemLookups_FindNoItemByItsFullPath`), favorite, blacklist, record-playback, and play answer 404 for one with no event, the media route streams an issued token and refuses an id and a full path, and the routes read `itemId` and `itemIds` and no longer bind `path` or `itemPaths`. Each failed with the old behavior put back (measured). About 40 tests that named items by full path use ids.
- New WebUI test: each of the nine mode combinations is written as the modes alone and reads back the same, which failed with the old fields put back (measured). The favorite, blacklist, and record-playback request tests expect exactly `itemId`.
- The server's API version is 2, with `minimumCompatibleApiVersion` 2 and only "2" supported, and the WebUI's is 2 and accepts only a version 2 server. The tests that pinned version 1 expect 2, and those that used 2 as an unsupported version use 3.
- Clear-stats is a handler of its own (`ServerHostComposition.ClearPlaybackStats`) that refuses a request with neither `allItems` nor a non-blank item id, or with both, before it reaches the catalog. The catalog session's `ClearPlaybackStats` clears only the ids it is given, none clearing nothing, and `ClearAllPlaybackStats` clears every item.
- New route tests: `allItems: true` clears every item, `itemIds` clears only those, and `{}`, `allItems: false`, null, empty, or blank `itemIds`, an old `itemPaths` request, and `allItems` with `itemIds` are each refused with 400, clearing nothing and publishing no event. With the old behavior put back, all seven refused requests answered 200 (measured).
- `dotnet build ReelRoulette.sln`: 0 warnings. `dotnet test ReelRoulette.sln`: Core.Tests 488 and ServerApp.Tests 7 passed. SystemChecks passed. `npm run verify`: 1483 tests in 72 files passed (measured).

#### Fixtures slice

**Scope**

- `event-revision.json`, `library-tile-effect.json`, `preset-filter-equality.json`, `sort-direction-labels.json`, and `filter-state-written.json` lose their C# readers and move to the WebUI's tests, so `shared/fixtures/` holds only fixtures that Core and the WebUI both read.
- `filter-mode-projection.json` and its readers go, since nothing writes the old fields.
- The moved fixtures go to `src/clients/web/ReelRoulette.WebUI/src/test/fixtures/`.
- `filter-state-written.json`'s `webui` entry loses the old fields, and its `desktop` entry becomes `oldFields`, the same filter as a release saved it: only `favoritesOnly` and `excludeBlacklisted`, with no modes. It stays until Per-Preset Preset Writes rewrites stored presets.
- `filter-mode-resolution.json`, `filter-enum-values.json`, and `tag-name-order.json` stay in `shared/fixtures/`, read by Core and the WebUI.

**Traps**

- Desktop tests are the only C# readers of the five fixtures that move (measured).
- `filter-mode-projection.json`'s only C# reader, in the Core tests, tests `FlagFilterModes.Name`, `FavoritesOnly`, and `ExcludeBlacklisted`, which only the desktop called, and the WebUI's tests read it twice, for the serializer and with `filter-state-written.json`'s `desktop` entry (measured).
- No WebUI-only copies of shared fixture cases exist. WebUI tests only note that the desktop reads the same fixture (measured).

**Acceptance**

- The moved fixtures are read by WebUI tests from their new place, and every fixture left in `shared/fixtures/` has a Core reader and a WebUI reader, checked by a search of the tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- `event-revision.json`, `library-tile-effect.json`, `preset-filter-equality.json`, `sort-direction-labels.json`, and `filter-state-written.json` are in `src/clients/web/ReelRoulette.WebUI/src/test/fixtures/`, read from there by `sseClient`, `libraryQuerySession`, `presetFilterEquality`, `libraryBrowseModel`, `filterStateModel`, and the Filter screen's tests, and no C# file names them (measured).
- `filter-mode-projection.json` is deleted, with its Core test and the WebUI's two readers of it.
- `filter-state-written.json`'s `webui` entry has no old fields, and its `oldFields` entry, with only `favoritesOnly` true and `excludeBlacklisted` false, reads as Favorites only and Blacklisted off in the filter model tests and the Filter screen's test of a preset saved before the modes. Both tests failed with the WebUI's read of `excludeBlacklisted` removed (measured).
- `shared/fixtures/` holds `filter-enum-values.json` and `filter-mode-resolution.json`, read by Core's `FilterStateTests` and the WebUI's `filterStateModel` tests, and `tag-name-order.json`, read by `TagNameComparerTests` and `tagNameOrder` tests (measured).
- The nine projection cases and the nine cases reading the old desktop entry are gone, replaced by the Contract slice's nine mode combinations and one `oldFields` reading. Test comments say Core reads the shared fixtures, without the desktop.
- `dotnet test ReelRoulette.sln` and `npm run verify` passed, as in the Contract slice (measured).

#### Mockup slice

**Scope**

- Remove the desktop notice page (`desktop-notice.html` and `build/desktop-notice.src.html`), its card in the index, its line in the mockup's `README.md`, its entry in `build_pages.py`, and its checks in `check.mjs`.
- The admin page's connected clients and Log Viewer sources lose the desktop client and its log sources.
- Notes in the mockup that describe the desktop as a current client go.
- The Settings tab's Diagnostics shows the server as "0.15.0 (API 2)" in place of "0.15.0 (API 1)" (`build/layout.src.html`), as the WebUI does with the server's API version 2.

**Traps**

- `check.mjs` checks the desktop notice, a connected client `desktop-0c9e7a22`, and the log sources `desktop-main-window` and `desktop-update` (measured).
- `check.mjs` also checks "Event streams: 4", which counts the admin page's clients, so it drops to 3 with the desktop client (measured).
- The mockup's loudness settings follow the desktop's defaults and formula until WebUI Loudness Normalization replaces them.

**Acceptance**

- The mockup has no desktop notice page or card, and its admin page shows no desktop client or desktop log source, checked by reading it, and `node docs/mockups/reelroulette/build/check.mjs` passes.

**Evidence**

- `desktop-notice.html` and `build/desktop-notice.src.html` are deleted, with the index's card, the mockup README's line, `build_pages.py`'s entry and comment, and `check.mjs`'s checks of the notice.
- The admin page lists three connected clients, with "Event streams: 3", and the Log Viewer's sources are `server` and `webui`. Its two desktop lines are now a WebUI line and a server line, so the Log Viewer's line counts and paging checks are unchanged. The client id and OS check drops the desktop's "OS not reported", whose fallback stays.
- The Settings tab's Diagnostics shows the server as "0.15.0 (API 2)".
- Comments that described the desktop as current are reworded. The loudness settings keep their references to the desktop's defaults and formula, as the Traps say.
- The unused `desktop_windows` icon stays in the icon subset, since rebuilding it takes `build_font.py` and fontTools.
- `python3 docs/mockups/reelroulette/build/build_pages.py` rebuilt the pages and `node docs/mockups/reelroulette/build/check.mjs` passed. Its new check that no Log Viewer source names the desktop failed with a desktop line put back (measured).

#### Docs slice

**Scope**

- `AGENTS.md`:
  - The desktop freeze rule goes, keeping "Don't change user-facing UX without explicit approval".
  - The architecture rule names only the WebUI as the orchestration and render layer, without the desktop flows `docs/domain-inventory.md` records.
  - The "WebUI" naming rule loses "the desktop's retirement notice" and says `CHANGELOG.md` keeps "WebUI" as developer history.
  - The test isolation rule names the Core tests' `TestIsolation` in place of the desktop tests' initializer.
  - The note that `MILESTONES-COMPLETED.md` describes retired tooling names the desktop client too.
- The pre-release skill's standard environment no longer lists the desktop app (`.claude/skills/pre-release/SKILL.md`).
- `CONTEXT.md`, `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, OpenAPI's descriptions, and `MILESTONES.md`'s Ownership Boundaries no longer describe the desktop client.
- The testing checklist loses the desktop app from its environment line, its desktop Smoke item, its desktop in-app update item in Release Flow, the Release Specific checks of the desktop retirement notice, the desktop update note, the desktop's old icon, and the desktop's filter dialog, and "and desktop" in its check of `release.yml`'s finish.
- `CHANGELOG.md`'s `[Unreleased]` loses the desktop halves of its bullets, since v0.15.0 ships no desktop. Its bullets keep "WebUI".

**Traps**

- Current-state docs mention the desktop on 24 lines in `CONTEXT.md`, 18 in `README.md`, 17 in `docs/architecture.md` (including its diagram), 11 in `docs/api.md`, 20 in `docs/dev-setup.md`, 31 in `docs/domain-inventory.md`, and 3 in OpenAPI (measured).
- `CLAUDE.md` doesn't mention the desktop (measured).
- `[Unreleased]` describes desktop changes in its filter modes, true peak, Allow remote connections, and desktop preset picks bullets.

**Acceptance**

- No current-state doc, `AGENTS.md`, or the pre-release skill describes the desktop client as current or refers to `src/clients/desktop` or LibVLC, checked by a search of them.
- `pwsh ./tools/scripts/check-milestones.ps1` passes.

**Evidence**

- `AGENTS.md` names the WebUI as the only orchestration and render layer, keeps "Don't change user-facing UX without explicit approval" without the desktop freeze, drops the retirement notice from the naming rule and says `CHANGELOG.md` keeps "WebUI" as developer history, names the Core tests' `TestIsolation` in the test isolation rule, and says `MILESTONES-COMPLETED.md` describes a retired desktop client too.
- The pre-release skill's standard environment and the testing checklist's environment line no longer list the desktop app.
- The testing checklist loses the desktop Smoke item and the desktop in-app update in Release Flow, the mockup gap audit loses the retirement notice, the old icon check its desktop clause, and the Favorites and Blacklisted check its desktop and cross-client halves, the desktop update note goes, and `release.yml`'s finish is checked for the server. This milestone's three Release checks are added under Agent checks.
- `CONTEXT.md` loses its Desktop client section, the desktop projects in its repository map, its desktop self-update line, and its comparisons with the desktop, and its WebUI lines no longer mention a path list or an empty item-state read.
- `README.md`, `docs/architecture.md` (its diagram too), `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md` (its Desktop Client Orchestration section, with the old fixture paths), and `assets/fonts/README.md` describe the WebUI as the only client. Their rules and `CONTEXT.md`'s about migrated flows and parity across clients are plain rules for server-owned flows, and `docs/architecture.md` says `LibraryCatalogStore`'s replace methods have no caller while `Open` still recovers an interrupted replace on every start.
- OpenAPI's catalog checkpoint, client type, and duration descriptions no longer name the desktop, the client type hint gives only `web` and `mobile-web`, the types the WebUI sends, and the generated WebUI types follow.
- `MILESTONES.md`'s Ownership Boundaries, Per-Preset Preset Writes' preset comparison Trap and Not included, Browser-Playable Filter's preset equality Trap, `ISSUES.md`'s preset issue, and `filter-enum-values.json`'s case of enum names no longer describe the desktop as current.
- `[Unreleased]` loses the desktop halves of the filter modes, true peak, and Allow remote connections bullets and the desktop preset picks fix, and keeps the autoplay bullet's pointer to the desktop's Keep Playing.
- A search of every Markdown file outside the changelog, the release notes, the milestone files, and the mockup, and of `shared/` (OpenAPI and the fixtures), finds the desktop only as retired, and no `src/clients/desktop` or LibVLC (measured).
- `pwsh ./tools/scripts/check-milestones.ps1` and `pwsh ./tools/scripts/tests/test-scripts.ps1` passed (measured).
- With the fixture's renamed case and the client type hint's edit, `dotnet build ReelRoulette.sln` had 0 warnings, `dotnet test ReelRoulette.sln` passed Core.Tests 488 and ServerApp.Tests 7, and `npm run verify` passed 1483 tests in 72 files, with the generated contracts up to date (measured).

#### Release checks

- Agent: On Linux and Windows, the release publishes only the server, and the Windows package carries FFmpeg's license text, checked in a dev-channel release run of `release.yml`.
- Agent: The v0.15.0 release notes say the desktop app is no longer released and that ReelRoulette in the browser replaces it.
- Agent: The v0.15.0 release notes tell users to reload any open ReelRoulette page after updating the server, since an open page keeps the old API version until it's reloaded.

#### Not included

- Rewriting historical `CHANGELOG.md` sections and completed milestones, which keep their desktop references.
- Rewriting stored presets' old Favorites and Blacklisted fields, which is Per-Preset Preset Writes.
- Removing the web runtime settings' `enabled` field, which is Recovery Page and Operator Retirement.
- Making `/api/web-runtime/settings` admin-only and removing token query auth, which is Auth Cutover for API and Admin.
- The random and play responses' `id`, which keeps the full path the WebUI's Stats tab shows.
- Auto-tag apply's full-path `itemPaths`, which the WebUI sends.
- Refresh, backup settings, duplicate review, and clearing all playback stats in the admin section, which is Admin Refresh, Backup, and Duplicate Review.
- Managing sources in the admin section, which is Admin Source Management.
- Library export, import, and backup restore in the admin section, which is Admin Library Catalog Transfer.
- Volume above 100%, which is WebUI Volume Boost.

### M12i3 - WebUI Tweaks

- **Status**: ✅ Complete
- **Goal**: The modified marker and the Filter tab's unsaved-changes dot clear when changes are undone, and the Library tab's count line, held actions, tag category headers, and the Filter tab's footer read better, from daily use of the new UI.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The held action's badge and the category headers are built as the user approves them in the Mockup slice's review, and neither app slice starts before that review.
- The category headers change in the Tags tab and the Filter tab's Tags section alike, since both use one header (`TagCategory` in the WebUI, `categoryEl` in the mockup).
- The Filter tab's Apply and Discard changes tell whether there are changes from the Unsaved state slice's comparison of the tab with the applied filter and the saved presets, so the Display slice's footer lands after it.
- No preset may hold exactly the default filter, by the user's choice: **None** stands for the default filter, so the preset dropdown's None hold goes. A preset holding the default filter, which a tag delete, the desktop's Add Preset, or the WebUI's Add Preset before v0.15.0 can leave, shows as None and gets no other handling, the known issue "A tag delete can leave a preset that shows as None" in `ISSUES.md`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ✅ Complete | The held action's and section tabs' badge, category headers that always show their count and dot, the "{matching} / {total}" count line, and the Filter tab's icon footer, approved by the user on a desktop browser, the iPad, and a phone. |
| Unsaved state | ✅ Complete | A modified marker and the Filter tab's unsaved-changes dot that compare the current state with the applied filter and the saved presets, so they clear when changes are undone, and presets that need a filter other than the default one. |
| Display | ✅ Complete | The count line, the held action's and section tabs' badge, the category headers, and the Filter tab's icon footer, as approved. |

#### Mockup slice

**Scope**

- The held action's red icon becomes a badge over the button's corner, so the button never changes width or wraps, on every held action in the mockup's main, validation, admin, and recovery pages.
- The category headers, in the Tags tab and the Filter tab's Tags section, always show the count of their tags in use and the unsaved-changes dot, whether the category is expanded or collapsed. The Tags tab counts the item's tags in the category and the Filter tab the filter's, as today.
- A count of 0 stays hidden.
- The Library tab's count line reads "{matching} / {total}", such as "615 / 49,106". The Filters line stays as it is.
- The Filter tab's section tabs show a flagged section's problem with the held action's badge on the tab's corner, in place of the icon after the section's name.
- The Filter tab's footer is icon buttons with tooltips, as the Tags tab's, as the Display slice describes.
- The Filter tab's Tags section drops the "Local:" label before each category's match control, as the Display slice describes.
- The Tags tab's Save shows the orange unsaved-changes dot while there are changes, as the Filter tab's Apply does.
- The Library tab's selection bar shows Select all as an icon-only button with the `select_all` icon and Stop selecting with the `deselect` icon, for WebUI Multi-Select and Bulk Actions to build.
- A held action's move to its field brings the field above the on-screen keyboard once it opens, as the Display slice describes.
- Before the app is built, the user reviews them on a desktop browser, the iPad, and a phone.

**Traps**

- `.btn .btn-problem` in `build/common.css` sits in the button's flow after its label, so the button widens when it shows and a row of buttons can wrap (inferred).
- `categoryEl` in `layout.src.html` builds both tabs' headers, hides the count and the dot while the category is expanded, and hides the count at 0.
- `check.mjs` checks that the count line starts with "Showing".
- `check.mjs` runs the pages in happy-dom, which lays nothing out, so whether a button keeps its width is judged on the devices.

**Acceptance**

- The mockup shows the badge, the category headers, the count line, and the Filter tab's footer as the user approved them, and `python3 docs/mockups/reelroulette/build/build_pages.py` and `node docs/mockups/reelroulette/build/check.mjs` pass, with checks that both tabs' headers show their count and dot while expanded and while collapsed, that the count line reads "{matching} / {total}", that every badge sits on its corner out of its button's flow, that a held Apply turns its dot red, that Apply and Cancel are disabled without changes, including changes put back, that Clear all filters is disabled while the filter is the default one, that a duration typed, left, and emptied is no change, and that a held action's move shows the field's section and then focuses the field as a tap does.
- The user has approved them on a desktop browser, the iPad, and a phone before the Unsaved state slice starts.

**Evidence**

- The user approved the mockup on a desktop browser, the iPad, and a phone after five review rounds, whose choices are in the Display and Unsaved state slices and in WebUI Multi-Select and Bulk Actions.
- A held action's move that focuses its field as a tap does, after its section shows, brought the field above the keyboard on the user's phone and iPad (measured), where centering it first and focusing it with `preventScroll` left it under the keyboard (measured).
- `python3 docs/mockups/reelroulette/build/build_font.py` added `cancel`, `filter_alt_off`, `select_all`, and `deselect` to the mockup's icons, and the filled icons kept their glyphs (measured).
- `python3 docs/mockups/reelroulette/build/build_pages.py` and `node docs/mockups/reelroulette/build/check.mjs` pass, with 1163 checks, up from 1110.
- Each check this slice added failed with the behavior it covers broken, in 26 mutations run once in copies of the mockup and restored. The one mutation the first pass missed, a tag change put back still counting, got its own check, which then failed with it.
- The mockup's count line counted its total after the filter, unlike the app's, and now counts it before, as the server's search baseline does.
- The admin page sized its held badges at 20 px with a rule for every icon in a button, and the rule now leaves the badge out.
- A duration typed, left, and emptied left Apply enabled in the user's review, which the mockup's comparison didn't do (measured), and the app's version of it is recorded in the Unsaved state slice.
- happy-dom keeps an element's computed style after an ancestor's class changes, so the checks read Apply's dot color from a fresh copy of the button (measured).

#### Unsaved state slice

**Scope**

- The modified marker ("Preset*"), in the Filter tab's heading and the preset dropdown, clears when the filter is put back to match its preset, and so does Apply's star.
- A category's Local match mode set back to ALL (AND) leaves no entry in the filter, and a filter read from the server or the device drops its AND entries, since a category without one filters as AND. A filter put back then matches its preset, including a preset saved with a leftover entry.
- The AND entries drop in one step after `filterStateFromApiObject`, at each place the WebUI reads a filter for its own use, and `filterStateFromApiObject` stays as `filter-enum-values.json` locks it.
- The shared fixture `preset-filter-equality.json` and the desktop's comparer stay as they are.
- Putting the General section's sources back as they were leaves the filter's source list as it was, so a preset that names every source matches again.
- The Filter tab's unsaved-changes dot compares the current state with the saved one rather than tracking edits, so it clears when its changes are undone, and so does the panel button's while the Tags tab holds no changes:
  - The Filter tab compares its working filter with the applied filter, as today, and its preset list with the saved list, by order, by name with case counting, and by filter with the preset comparison, in place of the `presetsChanged` flag. Refresh and Apply use the same comparison.
  - The preset list's comparison uses a saved copy of the list that the tab keeps, set when it opens or starts over, when Refresh takes the server's list, and after Apply saves.
  - The Filter tab takes each duration as its field's text reads, for the heading's star as for the dot and Apply's star, so a duration typed, left, and then emptied is no limit again, as one emptied before it is left. The heading keeps naming the working filter's preset, so text passed through while typing doesn't change it.
- Add Preset and Update Preset are disabled while the Filter tab's filter, with each duration as its field reads, is the default one, with "Choose a filter to save as a preset." as their tooltip and accessible description.
- **None** names the default filter, before any preset whose filter matches it, and the None hold goes from the preset dropdown, the device's remembered filter, and the Filter tab.

**Traps**

- `setLocalMatch` in `src/filter/filterDialog.ts` writes a category's mode and never removes it, and the preset comparison (`comparablePresetSnapshot` in `src/filter/filterStateModel.ts`) keeps a non-empty map, so a Local match mode set to OR and back leaves "Preset*", Apply's star, and the dot on, and after Apply the remembered filter keeps the entry (measured).
- The server filters a category without a local mode as AND (`LibraryCatalogListQuery.cs`), and the Filter tab shows ALL (AND) for both.
- The fixture's case "category local mode differs from none" locks the comparison, and the desktop's `LibraryPresetSelection.FiltersEqual` reads the same fixture until Desktop Client Removal moves it.
- `filterWithGeneralDraft` in `src/filter/filterDialogModel.ts` turns every source checked into an empty source list, and the fixture's case "source inclusion differs from all sources" keeps a full list unequal to none, so a preset that names every source gets a star after any General change and back (measured).
- A tag included and removed, a tag excluded then included, Global match set to OR and back, and a typed duration cleared already compare equal once put back (measured).
- The Filter tab's `presetsChanged` is set by moving, renaming, adding, updating, and deleting a preset, and cleared only by Apply, Cancel, Clear all, and a preset dropdown pick, so moving a preset and back keeps the dot and Apply's star (measured).
- Refresh keeps the tab's preset list only while `presetsChanged` is set (`takeRemote`), and Apply posts presets only then.
- The server keeps a preset name's case, so a rename that changes only case is a real change.
- `typeDuration` stores only a duration field's text, and leaving the field (`changeGeneral`) puts the duration into the working filter, which `view.unsaved` and `view.pending` compare. Emptying the field after that changes only the text, so the old duration keeps the dot and Apply's star on until the field is left again (inferred).
- A duration still being typed counts as unsaved (`generalDurationsChanged`), and the Filter tab starts over when it opens only without unsaved changes.
- Apply's star compares the working filter with the one the tab opened with, which Clear all keeps, and the dots compare it with the applied filter.
- The preset dropdown's marker is rebuilt only when presets load or a preset is picked, as after Apply (`syncHeaderPresets` in `src/state/appStore.ts`).
- `filterStateFromApiObject` keeps AND entries, as `filter-enum-values.json` locks it for the WebUI and the server's parser (`FilterStateTests.cs`), and the WebUI's reader of `preset-filter-equality.json` goes through it.
- The WebUI reads filters through `filterStateFromApiObject` in `createAppStore` (the remembered applied filter), `presetRowsFromApi`, `presetRowsFromHeaderPresets`, `filterStateForHeaderPresetSelection`, and `randomPickRequest`.
- The Filter tab's heading, the preset dropdown, and Apply name the first preset whose filter matches (`presetAnchorForDisplay` and `dialogPresetBase` in `src/filter/filterStateModel.ts`), so choosing a preset whose filter equals an earlier one's shows the earlier one (measured).
- The None hold is `headerExplicitNone` in `src/state/appStore.ts`, remembered as `holdNone` in `filter.applied`, the `holdNone` argument of `presetAnchorForDisplay` and `headerPresetListForFilter`, and the Filter tab's `holdNone`.
- The Filter tab's heading reads the working filter, which a duration still being typed isn't in, so it keeps a duration's star until the field is left, while the mockup's heading follows the text (measured).
- `store.presets` takes the server's list on every preset load, including the tab's own loads, the server becoming ready, and `resyncRequired`, so it can't stand for the saved list the tab compares with (`loadRemote` in `src/filter/filterDialog.ts`, `src/state/serverConnection.ts`).
- Every General change rewrites the working filter's sources and both durations through `filterWithGeneralDraft`, not only a source check.
- `view.pending` never reads the General draft, so Apply's star waits for a typed duration's field to be left, which `filterDialog.test.ts`'s "counts a duration still being typed as an unsaved change, without Apply's star" and "keeps a typed duration out of the working filter until the field changes" expect.
- The tabs' dots come from `unsaved` in `src/state/appServices.ts`, which `src/ui/Panel.tsx` and the panel button in `src/ui/Player.tsx` read.

**Acceptance**

- A filter put back to match its preset, through a Local match mode or the General section's sources, loses its star in the Filter tab's heading and on Apply, and in the preset dropdown once applied, in Filter tab tests of each.
- A preset saved with a leftover AND entry matches the filter it describes, in a filter model test.
- Each undo the Traps list clears the Filter tab's dot and the panel button's, and a real change still shows them, in Filter tab and panel screen tests.
- Refresh keeps a changed preset list and Apply saves it, and a list put back as it was is neither kept nor saved, in Filter tab tests.
- Typing a minimum, leaving the field, coming back, and emptying it clears the heading's star, the Filter tab's dot, and Apply's star before the field is left again, and so does the same with a maximum, in Filter tab tests of exactly that sequence.
- The heading's star follows a duration as its field reads, and stars one that isn't valid, while the heading keeps naming the working filter's preset, so Long's minimum backspaced to empty and typed again ends as "Long*", in Filter tab tests.
- Add Preset and Update Preset are disabled, with their tooltip, while the filter is the default one, a duration typed included, and enabled with no tooltip otherwise, in Filter tab and Filter screen tests.
- A filter read from the server or the device has no AND entries, and the shared fixtures' tests pass unchanged, in filter model tests and, for the device, `appStore.test.ts`.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

**Evidence**

- `npm run verify` passes, with 1469 tests in 71 files, the typecheck, the build, and its output check. `dotnet test ReelRoulette.sln` and the Core SystemChecks pass.
- Each new Filter test failed with the fix it covers broken and the file restored from a copy under `artifacts/scratch/`, in breaks of the Filter tab's AND entries, read sites, sources, saved preset list, and durations, and the panel test's with typed durations ignored (measured).
- The Filter screen tests of each undo check the panel button's dot as well as the Filter tab's, and each failed with the panel button ignoring the Filter tab's changes (measured).
- The tests of Add Preset and Update Preset with the default filter, and of the heading's star following a typed duration, failed before the change (measured).
- The test of Long's minimum backspaced to empty and typed again, which ends as "Long*", failed before the heading kept naming the working filter's preset, and the test of a tag renamed and deleted in a saved preset failed with the saved copy left unrevised (measured).
- Each test of the Filter tab's sources kept through loads failed with its fix undone (measured).
- `node docs/mockups/reelroulette/build/check.mjs` passes, with 1173 checks, up from 1163, and each new check failed in runs of mutations in copies of the mockup, except those of the heading while a duration is typed: Short clips' maximum backspaced and typed again passes with either heading, and a maximum typed through Short clips' filter failed before the heading kept naming the working filter's preset (measured).
- The Filter tab keeps the source list its General fields were filled from through the tab showing again and Refresh.
- A duration that isn't valid now counts for Apply's star as well as the dots, so a held Apply reads "Apply*", and the heading stars it, as the mockup's does.
- In the user's review, presets were barred from holding the default filter, in place of comparing the None hold, and the None hold went. The device's remembered filter no longer has `holdNone`, and one written before is read without it.
- A tag deleted elsewhere that was a preset's only filter leaves the preset with the default filter, which then shows as None, in Library and Tags screen tests (measured), the known issue "A tag delete can leave a preset that shows as None" in `ISSUES.md`.
- The mockup's Filter tab names the working filter's preset as the app does, None for the default filter and otherwise the first preset whose filter matches, stars it live as a duration is typed, and keeps the filter when None is chosen. Its presets each hold a filter other than the default one, Add Preset and Update Preset are disabled with their tooltip for the default filter, and its match modes and Update Preset keep their state.
- When Apply saves the preset list, the WebUI posts its presets without AND entries, so a desktop whose applied filter holds one shows its preset starred after that save, since the desktop's comparer, kept as decided, counts the entry. Server filtering is unaffected, and the desktop's removal is the next milestone (inferred).
- `CONTEXT.md` and `docs/domain-inventory.md` describe the comparisons, the stored filters without AND entries, and the presets that need a filter, `CHANGELOG.md`'s Fixed section the star that clears, and its Changed section the presets that need a filter.

#### Display slice

**Scope**

- The Library tab's count line reads "{matching} / {total}", such as "615 / 49,106", from the same two counts as today (`formatBrowseResultSummary` in `src/library/libraryBrowseModel.ts`).
- Screen readers hear the count line in words, such as "615 of 49,106 items", while the numbers shown are hidden from them.
- The held action's red icon is a badge on the button's top-right corner, out of its flow, on every held action but the Filter tab's Apply (`HeldButton` in `src/ui/FieldValidation.tsx`):
  - It is the fields' outlined `error` icon at 18 px, 6 px past the corner on each side.
  - It sits on a disc of `--surface-raised`, so the button's border doesn't run through it.
- The Filter tab's section tabs show a flagged section's problem with the same badge on the tab's corner, in place of the icon after the section's name (`SectionProblemMark` in `src/ui/FilterDialog.tsx`).
- The category headers in the Tags tab and the Filter tab's Tags section show their count and the unsaved-changes dot whether expanded or collapsed (`TagCategory` in `src/ui/TagCategory.tsx`), and the toggle's accessible name says both while they show.
- A category's count of 0 stays hidden.
- The Filter tab's footer is icon buttons, each with a tooltip, as the Tags tab's (`src/ui/FilterDialog.tsx`): Clear all filters is `filter_alt_off`, Discard changes is `undo`, and Apply is `save`.
  - Apply turns orange and shows the unsaved-changes dot, as the panel's tabs do, in place of "Apply*", while the Filter tab has changes to apply.
  - Discard changes, in place of Cancel, puts back the applied filter and the saved presets at once and never closes the panel, in the overlay too, since it no longer cancels out of anything; its tooltip and accessible name are "Discard changes". Apply still closes the overlay.
  - Apply and Discard changes are disabled while the Filter tab has no changes, by the Unsaved state slice's comparison, as the Tags tab's Save is.
  - While a field holds Apply, its dot turns red in place of the badge, its icon dims, and its reason is its tooltip, as now.
  - Apply is the only held action with a dot, since the Tags tab's changes can't be held and Settings has no Save or Apply.
  - Clear all filters is disabled while the working filter matches the default filter by the preset comparison, including right after pressing it and before Apply. Changes to the preset list alone don't enable it; Discard changes drops them.
- The Tags tab's Save shows the same orange dot while there are changes (`tag-editor-apply-btn` in `src/ui/TagEditor.tsx`).
- The Filter tab's Tags section drops the "Local:" label before each category's match control, and the control's accessible name is "Match mode for {category}", such as "Match mode for People", and its tooltip is "Match mode" (`src/ui/FilterDialog.tsx`).
- A held action moves to its field as a tap does, so the browser brings the field above the on-screen keyboard once it opens: within the press, after the field's section shows, it focuses the field without `preventScroll` and without scrolling it first (`src/ui/FieldValidation.tsx`).
- The mockup's Filter tab clears its categories' unsaved-changes dots on Apply, as the Tags tab's do on Save, and a Filter screen test locks the app's, with the category collapsed and expanded.

**Traps**

- The count line's second number is the query's `searchBaselineCount`, counted after the search and before the filter, so while a search is typed it is the search's matches.
- `library.test.ts` and `libraryQuerySession.test.ts` expect "Showing N of M items".
- `.held-action` is an inline flex with a 6 px gap, and `.btn-problem` a 22 px icon in its flow (`src/styles.css`), so the button widens when it shows.
- A held button's reason is its title and accessible description, and its icon is hidden from screen readers.
- `TagCategory` shows the count only while collapsed and above 0, and the dot only while collapsed, and names them in its toggle's label only then.
- `SectionProblemMark` sits in the section tab's flow after its label, and `.section-problem` is a 20 px icon (`src/styles.css`).
- The footer's Clear all filters and Cancel are text buttons, and Apply is a `HeldButton` that shows "Apply*" from `view.pending` (`src/ui/FilterDialog.tsx`).
- `view.pending` compares the working filter, with each duration as its field reads, with the one the tab opened with, which Clear all keeps, and `view.unsaved` compares it with the applied filter, so after Clear all both show a change while the applied filter isn't the default.
- The WebUI's icon font is the full Material Symbols font and has `save`, `undo`, and `filter_alt_off` (measured). The mockup's icon subset had no `undo` (measured), and once the footer shows `undo`, no mockup page shows `cancel`.
- `clearAll` sets the working filter to `createDefaultFilterState()`, the chosen preset to none, and the preset list to the saved one (`src/filter/filterDialog.ts`).
- `cancel` in `src/filter/filterDialog.ts` starts the tab over and closes the panel as the overlay.
- The mockup's Apply takes the applied tags as its snapshot without drawing the Filter tab's categories again, so their dots stay until something else draws them (measured).
- Each category's match control is a `<select>` inside `<label class="filter-local">Local:`, which gives it its name today (`src/ui/FilterDialog.tsx`).
- The Tags tab's Save is an icon button that turns orange with `has-pending` while `view.savePending`, and is disabled otherwise (`src/ui/TagEditor.tsx`).
- The move to a field scrolls it to the middle of its scrolling body and then focuses it with `preventScroll` (`src/ui/FieldValidation.tsx`). In the mockup, doing that before the keyboard opened left the body scrolled as far as it goes without the keyboard, so the field stayed under it, while a tap on the field works because the browser pans the page itself (measured on the user's phone).
- The app moves to the field in an effect after a reveal request renders (`reveal.reveal` in `src/filter/filterDialog.ts`, the `useEffect` in `src/ui/FieldValidation.tsx`), so its focus comes after the press, and iOS opens the keyboard only for a focus made within the press (inferred).
- The Filter tab's sections stay rendered and hide with `display: none` (`panelStyle` in `src/ui/FilterDialog.tsx`), so the field's section has to show before the focus, within the same press (inferred).
- In the mockup, a page rule sizing every icon in a button outranked the badge's size until it excluded the badge (measured); the WebUI's rules that size icons in buttons are in the notifications list and popups, which hold no held action.

**Acceptance**

- The count line reads "{matching} / {total}" with grouped numbers, in library tests.
- A held action shows its badge over its corner, out of the button's flow, with its reason as before, in field validation component tests and by reading the stylesheet, and a spot check on the user's phone.
- A flagged section's tab shows the badge on its corner and no icon after its name, in Filter screen tests.
- The count line's screen reader text says "{matching} of {total} items", in library tests.
- The Filter tab's footer shows the three icon buttons with their tooltips, Apply shows the dot and Apply and Discard changes are enabled only while there are changes, including after a change is put back and after Clear all, and a held Apply shows its dot red with no badge, in Filter screen tests.
- Clear all filters is disabled while the filter is the default one, including right after pressing it, and enabled otherwise, in Filter screen tests.
- Discard changes discards the tab's changes and leaves the panel open, beside the player and as the overlay, in Filter screen tests and the mockup's checks.
- Apply clears the dot of a category whose tags changed, with the category collapsed and expanded, in Filter screen tests and the mockup's checks.
- The Tags tab's Save shows the dot only while there are changes, in Tags screen tests.
- Each Filter category's match control has no "Local:" label, is named "Match mode for {category}", and has the tooltip "Match mode", in Filter screen tests.
- A held action's move shows the field's section and then focuses the field within the press, without `preventScroll` and with no scroll first, in field validation component tests and Filter screen tests, and the field comes above the keyboard on the user's phone and iPad, which is the real check.
- The category headers in both tabs show their count and dot expanded and collapsed, with the toggle's name saying both, in Tags and Filter screen tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

**Evidence**

- `npm run verify` passes, with 1490 tests in 72 files, the typecheck, the build, and its output check.
- `node docs/mockups/reelroulette/build/check.mjs` passes, with 1185 checks, up from 1173.
- Each new test and check failed with the behavior it covers broken, in copies under `artifacts/scratch/`, then restored (measured):
  - The count line's shown and spoken text, and its numbers hidden from screen readers.
  - The badge's position and size, and its button's and tab's positioning.
  - Apply's dot, red while held and with no badge, and Apply and Discard changes enabled without changes.
  - Clear all filters always enabled, enabled by a preset list change alone, and enabled before the tab loads.
  - The move with `preventScroll`, with a scroll first, focusing before its section shows, and with a stale `show`.
  - Category counts and dots only while collapsed, and a count of 0 shown.
  - Save's dot, and the match select's name and tooltip.
  - Discard changes closing the overlay, in the app and the mockup, and the mockup's Apply leaving its category dots.
- Keeping the badge's fade out of a button with a dot failed no test, since that button never renders the badge, so the guard went.
- The user's spot check passed on a phone and the iPad: the badges show whole without a row changing, a held Apply brings Min above the keyboard, and Discard changes leaves the panel open (measured).
- In the user's review, Cancel became Discard changes, `undo`, which discards at once and never closes the panel, in the overlay too. The model's `cancel` is `discardChanges`, and its button `filter-discard-btn`.
- The app already cleared a Filter category's dot on Apply, collapsed and expanded (measured). The mockup kept the dot until something drew its categories again, and now draws them on Apply.
- `view.pending` and the state's `original`, which only "Apply*" read, are gone, and `filterDialogHasPendingChanges` is `filterDialogHasUnsavedChanges`.
- Three Filter screen tests that applied with no changes make a change first, since Apply is disabled without one.
- `python3 docs/mockups/reelroulette/build/build_font.py` swapped `cancel` for `undo` in the mockup's icons, since no page shows `cancel` anymore.
- `npx vitest run -u` before the test files takes the first file as its value and skips it, so `-u` goes after them (measured).
- On the iPad, a duration typed, left with a tap, and erased still counts as a change, while Filter screen tests and mockup checks replaying a browser's events for those steps pass (measured), the known issue "Erasing a duration on the iPad leaves the Filter tab's changes" in `ISSUES.md`.
- `CONTEXT.md`, `docs/domain-inventory.md`, and `CHANGELOG.md`'s [Unreleased] describe the count line, the badges, the footer, the dots, and the match select.

#### Release checks

- Manual: On a phone and the iPad, pressing a held Apply with a minimum that is not valid brings the Min field above the keyboard.
- Manual: On a phone 360 px wide, a held Add Preset and a flagged section's tab show their badges whole, without the button changing width or its row wrapping.

#### Not included

- Moving the remembered preset to its id, and keeping it through a preset list that lacks it, which is Per-Preset Preset Writes.
- Telling apart two presets with equal filters, which is Per-Preset Preset Writes.
- The server refusing a preset that holds the default filter, which is Per-Preset Preset Writes.
- The Tags tab's unsaved-changes dot keeps tracking edits rather than comparing with what's saved, by the user's choice, and no milestone takes it.

### M12i2 - WebUI Autoplay Modes

- **Status**: ✅ Complete
- **Goal**: Autoplay has two modes, Normal and Timer, in place of the desktop's Keep Playing, and a looping photo no longer flickers.
- **Depends on**: WebUI Settings Panel, whose Advance after setting both modes use, and WebUI Auto-Pause and Photo Scrub Bar, whose photo timer they drive.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Autoplay gets two modes, replacing the desktop's separate Keep Playing, which plays a random item every N seconds until stopped (Playback → Keep Playing (Timer) and Set Interval):
  - Normal: photos advance after the timer and videos play to the end, as autoplay does today.
  - Timer: every item advances after the timer, including a video that has not finished. Pausing a video holds the timer.
  - In Timer mode with Loop off, a video shorter than the timer advances at its end, as in Normal mode.
- Both modes use one timer, Advance after, the photo duration in the Settings tab, which this milestone widens from 1–300 to the desktop's 1–3600 seconds, so a Keep Playing interval longer than five minutes still fits.
- A new setting, Loop stops autoplay, on by default and kept per device, decides what Loop does while Autoplay is on:
  - On: with Autoplay and Loop on, nothing advances, in either mode. In Normal mode a video repeats whole and a photo stays. In Timer mode a video repeats a stretch of Advance after seconds, or up to its end when that comes first, and a photo stays.
  - Off: Loop doesn't stop autoplay. A photo advances after the timer, as with Loop off. A video shorter than the timer repeats until the timer has run, then advances: at once in Timer mode, and once the repeat in progress finishes in Normal mode. A longer video advances at the timer in Timer mode and at its end in Normal mode.
  - With Autoplay off, Loop works as today, in either mode.
- In Timer mode while Loop holds autoplay, the repeating stretch starts at 0 for a new item, where the video is when the stretch starts to apply, such as when Loop is turned on mid-video, and where a seek by the scrub bar lands, except that a seek landing at the video's end starts it, and the video, Advance after seconds before the end, or at 0 for a shorter video; J, L, and frame steps, which WebUI Keyboard Shortcuts adds, do the same there. The user scrubs as normal, and a seek starts the stretch's timer over there. The stretch shows faintly on the scrub bar, behind its track, and nowhere else.
- A video's timer starts when the video first plays, so loading doesn't count, and holds while the video is paused, by the user or Auto-Pause. A change that stops it applying, such as switching mode or turning Autoplay off, holds it with its time, and it runs on from there once it applies again. A new item starts it from zero, and changing Advance after changes only its length, as for a photo.
- A repeat only restarts the photo's timer or the video's position: nothing loads again, shows Loading…, or records another play. Today a looping photo flickers at the end of each loop, because it is restarted by reloading its image, unlike a video, which seeks back.
- On a photo, the scrub bar shows its timer, and Play and the bar hold and move it, only while autoplay will advance the photo: Autoplay on, and Loop off or Loop stops autoplay off.
- Turning Loop on or off, or changing Loop stops autoplay, while a photo shows keeps the photo on screen and its time, as the mockup does:
  - its timer runs on from where it was while Autoplay or Loop stays on, and stops with both off;
  - a timer that had ended starts over when the photo now repeats;
  - a timer the user paused runs on once the bar no longer shows it, since Play is disabled then, and one Auto-Pause holds stays held.
- Turning Autoplay on, or off while Loop is on, starts a photo's timer over from its full time without loading the photo again.
- The Settings tab's Playback section shows Autoplay mode (Normal, "Photos advance after the timer; videos play to the end.", and Timer, "Every item advances after the timer. Pausing a video holds it.", then the hint "The player's autoplay button turns it on and off."), Advance after, and Loop stops autoplay with the hint "With Autoplay and Loop on, the item repeats and nothing advances. Turned off, autoplay goes on, and a video shorter than Advance after repeats until it advances.", in that order. The player's autoplay button still turns autoplay on and off.
- The autoplay mode and Loop stops autoplay survive a page refresh in the per-device store, as `playback.autoplayMode` and `playback.loopStopsAutoplay`.
- The store's names for the photo duration become Advance after's (`advanceAfterSeconds`, `setAdvanceAfter`, `advanceAfterChanged`), since it now drives both modes.
- The Player screen tests that count a play per loop, or per Loop or Autoplay change on a photo, change with it.

#### Traps

- The WebUI's video end handler and photo timer both skip advancing while loop is on.
- Changing the timer while a photo shows already keeps the time shown and changes only the length, through the photo timer's `setLength` (`photoDurationChanged` in `src/playback/player.ts`), which WebUI Settings Panel added.
- The photo timer calls `playCurrent`, which clears the photo's source and hides it, then loads it again, records a play, and relays a new start.
- Turning Loop or Autoplay on while a photo shows goes through the same restart.
- The video's `loop` is set from Loop alone, in `playCurrent` and `toggleLoop`. With Loop stops autoplay off, it has to follow whether the video is shorter than Advance after, which is known only once its metadata gives its length, and change as Advance after and the settings change (inferred).
- With `loop` set, a browser starts a video over without firing `pause` or `ended`, so its timer runs across repeats (inferred, from the HTML spec). A release check confirms it on real browsers.
- Animation frames stop in a hidden tab, and time updates come only about every 250 ms, so Timer mode's repeating stretch has to check the position on both (inferred).
- The scrub bar is a native range input whose thumb's center runs from half the thumb's width in from each end, so the stretch behind it has to be inset by that much to line up with the thumb; the mockup assumes a 16 px thumb (inferred).
- The scrub bar is set by the player, not rendered from state, so a re-render never moves it while it is dragged (`seekSlider` in `src/playback/player.ts`). The mockup wraps it in `seek-wrap` with the stretch, `seek-loop`, behind it, and the seek row's other children stay as they were.

#### Acceptance

- In Normal mode, photos advance after the timer and videos play to the end. In Timer mode, every item advances after the timer, including an unfinished video, a paused video holds the timer, and with Loop off a video shorter than the timer advances at its end. Shown by player and Player screen autoplay tests for both modes.
- With Loop stops autoplay on and Autoplay and Loop on, nothing advances: in Normal mode a video repeats whole and a photo stays, and in Timer mode a video repeats a stretch of Advance after seconds, or up to its end when that comes first, and a photo stays. Shown by a test for each.
- Timer mode's repeating stretch starts at 0 for a new item, where the video is when Loop is turned on, and where a seek by the bar lands, and shows on the scrub bar while it repeats and not otherwise, in tests for each.
- With Loop stops autoplay off and Autoplay and Loop on, a photo shows its timer and advances after it, a video shorter than the timer repeats until the timer has run and then advances, at once in Timer mode and once the repeat in progress finishes in Normal mode, and a longer video advances at the timer in Timer mode and at its end in Normal mode. Shown by a test for each.
- With Autoplay off, Loop repeats a video whole and a photo's timer in either mode, in a test.
- A repeat records no other play and shows no Loading…: a looping photo keeps its image loaded and shown through each loop, and a repeating video keeps its source, in tests.
- Turning Loop on or off, or changing Loop stops autoplay, while a photo shows keeps its image shown and its time, in tests for a timer that runs on, one that stops with Autoplay and Loop off, one that had ended, one the user paused, and one Auto-Pause holds.
- The Settings tab's Playback section shows Autoplay mode, Advance after, and Loop stops autoplay, in that order; Advance after accepts 1 to 3600 seconds and starts from the value stored before this milestone, and Loop stops autoplay starts on. Shown by Settings screen tests.
- After a page refresh, the autoplay mode and Loop stops autoplay are as they were, in a test.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes, with checks for each case above.
- `npm run verify` passes, and one quick spot check.

#### Evidence

- `npm run verify` passes, with 71 test files and 1448 tests, up from 1431, and the build output check.
- `src/test/player.test.ts` covers the modes and Loop stops autoplay:
  - Timer mode advances a playing video after Advance after, counted from its first `playing`, holds through a pause by the user and by Auto-Pause, and relays `playback=timer-advance`; a new Advance after keeps the time a video's timer has run.
  - Normal mode plays a video to its end, and with Loop off Timer mode advances a video shorter than Advance after at its end.
  - With Loop stops autoplay on, a video repeats whole in Normal mode, and a photo stays in either mode, its image never set again, with no new attempt, play, or Loading….
  - Timer mode's stretch starts at 0, where a seek lands, Advance after seconds before the end, or at 0 for a shorter video, for a seek to the end and for a video that sits at its end as the stretch starts to apply, moving the video there too, and where the video is when Loop turns on, goes back from its end, stops at the video's end and starts over as the video ends, keeping its source and recording nothing, and shows on the stretch element only while it repeats; the browser repeats a stretch that is the whole video.
  - With Loop stops autoplay off, a photo shows its timer and advances, a short video repeats until Advance after has run, finishing the repeat in progress in Normal mode and advancing at once in Timer mode, and a longer one advances at its end in Normal mode and at Advance after in Timer mode.
  - With Autoplay off, Loop repeats a video whole and a photo in either mode.
  - Loop and Loop stops autoplay keep a photo's time; a timer the user paused runs on once the bar hides, one Auto-Pause holds stays held, and an ended timer starts over only when the photo now repeats.
- `src/test/appStore.test.ts` and `src/test/settings.test.ts` cover Advance after's 1 to 3600 seconds, the autoplay mode, Normal until set, and Loop stops autoplay, on until set, each read back and kept on the device.
- `src/test/screens/player.test.ts` shows on the page that Loop repeats a photo without setting its image again, counting a play, or showing Loading…, that Timer mode advances a playing video and a pause holds it, that the stretch sits behind the bar in `#seek-wrap` and moves with a seek, that a stretch starting over from the video's end, through its `pause`, `ended`, and `playing`, relays no line while the user's own play after it does, and that the seek row's gap holds with the wrapper.
- `src/test/screens/settings.test.ts` covers Playback's order, each mode's line and the hints, Timer and Loop stops autoplay applying at once, 3600 accepted and 3601 flagged, both settings surviving a page refresh, and their two storage keys.
- Existing tests changed with the new behavior:
  - Tests that counted a new attempt or play per loop, or per Loop or Autoplay change on a photo, now count none, and Loop off keeps a photo's time instead of starting it over.
  - Loading… no longer shows for Loop or Autoplay on a photo.
  - The starting markup snapshot gains the scrub bar's wrapper and stretch, Autoplay mode, and Loop stops autoplay.
  - The Settings tab's test for no Loop, Autoplay, or Mute entry now looks for a checkbox that turns them on or off, since Autoplay mode and Loop stops autoplay name them.
- Each guarded behavior was broken in turn by editing the code, and its tests failed (measured): a photo's repeat showing it again (5 tests), Loop stops autoplay ignored (3), no Timer mode (5), loading counted on a video's timer (1), a seek not moving the stretch (2), Normal mode cutting a short video's repeat (1), Loop starting a photo's time over (5), a paused photo staying held (1), the stretch starting at 0 when Loop turns on (1), Advance after's old 300-second cap (7), a seek to the end leaving the stretch empty (1), a video at its end starting the stretch there (1), the browser not repeating a stretch that is the whole video (1), and a stretch's repeat from the video's end relaying lines (1).
- Deviations from the plan:
  - J, L, and frame steps don't move the stretch yet, since the WebUI has no such keys; WebUI Keyboard Shortcuts' entry now says they do.
  - A video's timer counts from its first `playing`, where the mockup, which never loads, counts from its start.
  - A stretch that starts mid-video and ends at the video's end starts over from the video's `ended`, since the browser's own loop would go back to 0, and the `playing` that follows relays no line; the browser repeats a stretch that is the whole video itself.
- The mockup was approved after two rounds on the desktop and the iPad: Loop stops autoplay, Timer mode's stretch that a seek moves, Normal mode finishing a short video's repeat, and the WebUI Loop Range milestone came from them.
  - `node docs/mockups/reelroulette/build/check.mjs` passes, with 1110 checks, up from 1038.
  - Each new mockup behavior was broken in turn, and its checks failed (measured).
- `check-milestones.ps1` passes.
- CONTEXT.md, `docs/domain-inventory.md`, and CHANGELOG.md describe the modes, Loop stops autoplay, and Timer mode's stretch.
- The user's spot check passed every step:
  - Settings → Playback shows Autoplay mode with each mode's line and its hint, Advance after, and Loop stops autoplay, on.
  - In Timer mode with Advance after at 5 and Loop off, a long video moves on about 5 seconds after it starts playing, and pausing it holds the timer.
  - With Advance after at 10 and Loop on, a long video repeats 0:00 to 0:10 with the faint band behind the bar, lined up with the thumb, and dragging the bar moves the band and the repeat there.
  - With Autoplay off and Loop on, a photo stays on screen without a flicker each time its timer starts over.

#### Release checks

- Manual: On the iPad in Safari and on a desktop browser, with Autoplay and Loop on and Loop stops autoplay off, a video shorter than Advance after repeats and advances once Advance after has passed, and pausing it holds the timer.
- Manual: On the iPad in Safari and on a desktop browser, in Timer mode with Autoplay and Loop on and Loop stops autoplay on, a video longer than Advance after repeats a stretch of Advance after seconds from its start and from where a seek lands, and the stretch shows faintly on the scrub bar, lined up with the thumb.
- Manual: On the iPad and a desktop browser, a photo with Loop on stays on screen with no flicker each time its timer starts over.

#### Not included

- Moving the photo duration into the Settings tab as Advance after, which is WebUI Settings Panel.
- Start and end markers on the scrub bar that set the range Loop repeats, which is WebUI Loop Range.

### M12i1 - WebUI Ambient Mode

- **Status**: ✅ Complete
- **Goal**: Ambient mode fills the black space around the picture with a soft glow of its colors.
- **Depends on**: WebUI Settings Panel, whose Appearance section holds its settings.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Ambient mode, as YouTube's: behind the player, a heavily blurred, dimmed copy of the current frame's colors fills the black space around the picture.
  - At the update rate the player draws the frame into a tiny canvas, and the glow fades toward each new copy over the fade time, so the colors drift smoothly.
  - The shown canvas blends toward each new sample instead of crossfading two layers, starting from what is on screen, so a sample that arrives mid-fade continues smoothly.
  - A photo gets the same effect, drawn once from the photo.
  - Sampling pauses while the video is paused or the tab is hidden.
  - The glow sits on the player's dark background in both themes, so the light theme uses full color too, and each theme has its own strength, the same kind of setting in both.
  - With ambient mode off, the space is plain black in both themes, as today.
  - The effect never reads the canvas's pixels back, so it doesn't use `getImageData` or `toDataURL`.
- Ambient mode's settings ship with it, apply as they change, and are kept per device:
  - An Ambient mode toggle, on by default, in the Settings tab's Appearance section.
  - Beside it, an expandable "Ambient mode settings" section, whose header shows a chevron that points right while it is closed and down while it is open.
  - Its settings have plain labels, each showing its value: Update rate (1 per second by default, from 0.25 to 4), Fade time (2 s, from 0.25 to 4 s), Blur (64 px, from 10 to 80 px), Strength in the dark theme (50%), Strength in the light theme (75%), and Saturation (100%, from 0 to 200%).
  - A Reset to defaults button.
- The player is also clipped by a rounded `clip-path: inset(0 round 8px)`, so its corners stay rounded on iOS with ambient mode on, and it keeps its rounded corners in every view, fullscreen and a phone on its side included.
- Ambient mode and its settings survive a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.

#### Traps

- Two layers crossfading by CSS opacity flickered slightly in the mockup (measured).
- The flicker came from the black background showing through whenever a sample arrived before the last fade finished (inferred).
- Drawing a cross-origin video taints the canvas (inferred).
- In every served setup the media is same-origin, so a tainted canvas happens only in development, where the Vite dev server plays media from the server's other origin, as WebUI Volume and Enhanced Audio sets out (inferred).
- Showing a tainted canvas still works, since the effect never reads its pixels back (inferred).
- In Safari and Firefox on iOS, the player's rounded corners turned square once ambient mode drew, and stayed rounded with it off or on other devices (measured).
- WebKit doesn't clip a layer of its own, such as the blurred ambient canvas, to its parent's rounded corners (inferred).

#### Acceptance

- With ambient mode on, a blurred, dimmed copy of the frame's colors fills the black space around a playing video and crossfades as the picture changes, and a photo gets one from the photo. Sampling stops while the video is paused or the tab is hidden. Off, the space is plain black in both themes. The light theme uses full color at its own strength, and a sample that arrives mid-fade never lets the black background show through. Shown by ambient mode tests for sampling at the update rate while a video plays, holding while it is paused or the tab is hidden, and a photo drawn once.
- The Ambient mode settings section offers each setting with its default and range, shows each value, applies changes as they're made, and Reset to defaults restores the defaults, in ambient mode tests of each of its settings.
- The player is clipped by the rounded `clip-path`, and its corners stay rounded in fullscreen and on a phone on its side, in WebUI tests.
- After a page refresh, ambient mode and its settings are each as they were, in tests for a page refresh keeping each setting this milestone adds.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's own browsers and phone, without the VM, including that with ambient mode on the player's corners stay rounded in Safari on iOS.

#### Evidence

- `npm run verify` passes, with 71 test files and 1431 tests, up from 70 and 1399, and the build output check.
- `src/test/ambient.test.ts` covers ambient mode's settings: their defaults, ranges, steps, values shown, and reading, with each one outside its range at its default.
- `src/test/ambient.test.ts` covers the glow:
  - It shows and hides as ambient mode, the item playing, and a media failure say, and its layer carries the settings.
  - It copies at the update rate, holds while the video is paused or the tab is hidden, copies a new paused video once and a photo once per play, copies a photo again when ambient mode turns back on, and waits for a picture.
  - A new rate applies at once, and a new fade time applies to the fade under way.
  - It fades from what is on screen without clearing it, a copy that arrives mid-fade carries on from there, and it stops while off or detached and draws nothing without a 2D context.
- `src/test/settings.test.ts` covers ambient mode and its settings, kept on the device, and Reset to defaults.
- `src/test/screens/player.test.ts` shows the glow on the page:
  - It copies once a second while a video plays, holds while it is paused or the tab is hidden, and copies a photo once.
  - It hides once the media fails, sits behind the video and the photo, and blurs at each theme's strength.
  - With ambient mode off, the space is plain black in both themes.
  - The player's corners are clipped by the rounded `clip-path` and stay rounded in pseudo-fullscreen, and only the player's own rule sets its corners, so the browser's fullscreen keeps them too.
- `src/test/screens/phone.test.ts` shows the corners rounded on a phone on its side and on a taller screen.
- `src/test/screens/settings.test.ts` covers the section's place, hint, and chevron, each slider's label, default, range, step, and value, and each setting applying as it moves.
  - It also covers Reset to defaults, ambient mode and each setting surviving a page refresh, and the two new storage keys.
- Each guarded behavior was broken in turn by editing the code, and its tests failed (measured):
  - The glow: ignoring a paused video (3 tests) or a hidden tab (2), copying a photo on every update (2), clearing the canvas on screen each frame (1), starting a mid-fade copy from the last copy (2), and not copying a photo again when ambient mode turns back on (1).
  - Timing and failure: a new rate waiting for the old timer (2), and a failure not hiding the glow (1).
  - The stylesheet: no `clip-path` (3), a square rule back for pseudo-fullscreen (1), the browser's fullscreen (1), or a phone on its side (2), the video and photo not positioned (1), and the light theme at the dark theme's strength (2).
  - Settings not read back after a page refresh (1).
- happy-dom computes the player's `clip-path` as `inset(0 round 8px)` (measured). The tests enter pseudo-fullscreen, so the browser's fullscreen is checked through the stylesheet's rules.
- happy-dom has no 2D canvas context and never loads media (measured), so the tests record draws through a stubbed `getContext` and set a video's `readyState` and a photo's `naturalWidth`.
- Two existing tests changed with the new UI:
  - The starting markup snapshot gains the glow's layer and Appearance's Ambient mode.
  - The Settings tab's no-Save test now finds Reset to defaults as the tab's only button.
- The sliders differ from the approved mockup: each is named by its label alone, with the value shown as its value text. The mockup's label wrapped the value, so a slider's name changed as it moved.
- The player's corners differ from the approved mockup, which squared them in fullscreen and on a phone on its side. After trying rounded corners in the mockup on the iPad, the phone, and the desktop, the user chose to keep them rounded in every view.
- The mockup now matches, with checks for the sliders' names and value text and for the player's rounded corners in fullscreen, on a phone on its side, and under every rule, and its overview no longer says the Mockup tab tunes ambient mode.
  - With the square rules put back, its six corner checks failed (measured).
  - `node docs/mockups/reelroulette/build/check.mjs` passes, with 1038 checks, up from 1028.
- `check-milestones.ps1` passes.
- CONTEXT.md, `docs/domain-inventory.md`, and CHANGELOG.md describe ambient mode.
- The user's spot check passed every step:
  - On the desktop, a playing video glows, drifting as it plays and holding while paused, and the light theme glows at full color.
  - The settings apply as they move, Reset to defaults restores them, and off, which survives a page refresh, leaves plain black.
  - A photo glows from the photo.
  - On the iPad in Safari, with ambient mode on, the player's corners stay rounded, and the glow shows in fullscreen.
  - Playback stays smooth on the phone.

#### Release checks

- Manual: On the iPad, in Safari and Firefox, with ambient mode on, the player's corners stay rounded.
- Manual: On the iPad, with ambient mode on, a video playing for an hour or more doesn't make it run noticeably warm or drain its battery noticeably faster than with ambient mode off, and playback stays smooth.

### M12h - WebUI Stats Panel

- **Status**: ✅ Complete
- **Goal**: The WebUI shows library and playback statistics and details of the current file in a Stats tab, as the desktop stats panel does, with each video's peak measured by the server's loudness scan.
- **Depends on**: WebUI Responsive Layout and Panels.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The loudness scan measures true peak, not sample peak, and the Stats tab shows it in dBTP. On the developer's library true peak reads up to 0.8 dB above sample peak, headroom WebUI Loudness Normalization needs so a boost doesn't clip, and its extra CPU stays under the time a video takes to read over the NAS, so the rescan takes no longer.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ✅ Complete | `integratedLoudness` and `peakDb` named in the OpenAPI item schema, so the generated WebUI types carry them. |
| Loudness scan | ✅ Complete | A measured peak for each video with audio, no stored value where one is missing, and a loudness analysis version whose upgrade rescans the videos with audio without starving playback. |
| Stats tab | ✅ Complete | The side panel's Stats tab with the current file's and the library's stats, opened from the header's file name, with coalesced refreshes. |

#### Contract slice

**Scope**

- Name `integratedLoudness` and `peakDb` in the OpenAPI item schema, so the generated WebUI types carry them. A contract change that only adds.
- `peakDb` is described as the peak stored for the item, since until the Loudness scan slice the scan stores a −5.0 fallback for nearly every video.
- WebUI Loudness Normalization reads both.

**Traps**

- Loudness and peak already come with each list and single-item read as `integratedLoudness` and `peakDb`, but the OpenAPI item schema (`LibraryProjectionItem`) does not name them and allows extra properties, so they are untyped in the generated WebUI types.
- The server leaves either field out when it has no value rather than sending null (`LibraryCatalogSession.ToItem`).
- `npm run verify:contracts` only checks that the generated types match the OpenAPI file, so it runs no contract tests.
- `OpenApiSpec.AssertMatchesSchema` needs a response's fields and the schema's to be the same set, and the item response has about 20 fields the schema doesn't name, so the item can't be checked that way.

**Acceptance**

- `integratedLoudness` and `peakDb` are in the OpenAPI item schema, and list and single-item reads return both for an item that has them and leave both out for one that doesn't, in a server contract test for the two fields.
- `npm run verify:contracts` passes.
- `npm run verify` passes.

**Evidence**

- `shared/api/openapi.yaml` names `integratedLoudness` in `LibraryProjectionItem`, present when the loudness scan has measured it, and `peakDb`, the peak stored for the item, present when the catalog has one, and `npm run generate:contracts` regenerated `openapi.generated.ts`.
- `ItemIdContractTests.LibraryItems_CarryLoudnessAndPeak_AsTheSchemaNamesThem` checks that the schema names both, that list and single-item reads return both for a measured item, and that both reads leave them out for an unmeasured one. With the two schema entries removed it failed ("Not found: integratedLoudness"), and it passes with them.
- `dotnet build ReelRoulette.sln` passed with no warnings, and `dotnet test ReelRoulette.sln` passed: 484 Core, 421 desktop, and 7 ServerApp tests.
- `npm run verify` passed, `npm run verify:contracts` included.
- `docs/api.md` says list and single-item reads carry `integratedLoudness` when the scan has measured it and `peakDb`, the peak stored for the item, when the catalog has one, and leave a missing one out.

#### Loudness scan slice

**Scope**

- The scan runs `ebur128=framelog=verbose:peak=true` and stores the true peak in `peak_db`.
- A missing loudness or peak is stored as no value: the parser's −5.0 peak fallback goes, and `FileLoudnessInfo` stops using 0.0 to mean none. A summary peak of `-inf`, a digitally silent track's, stores no peak.
- With the fallback gone, `peakDb`'s descriptions in `shared/api/openapi.yaml` and `docs/api.md` say it is the measured true peak, absent when the scan hasn't measured one, and the generated WebUI types follow.
- Catalog upgrades become a chain, so no schema change can quarantine an older catalog:
  - Each schema version has its own upgrade step from the one before, and an older catalog runs every step in order, when it opens and when it is imported.
  - The file checks treat a catalog at any version from the oldest shipped one, 2, up to the one before current as older and upgradable, rather than damaged.
- The catalog gains a loudness analysis version, stored with each video, a schema change with its upgrade step.
- The upgrade step clears every stored peak, since the scan never measured one, and marks every existing video as scanned under the previous loudness analysis version.
- Each scan result records the loudness analysis version it was scanned under, even when its loudness and peak haven't changed.
- The refresh's check for which videos need a loudness scan also picks a video with audio scanned under an older loudness analysis version, so the next refresh rescans the videos with audio, not every video.
- The rescan can't starve playback: the loudness stage runs one ffmpeg process at a time, in a loop bounded to that limit instead of a task per video, and the ffprobe it starts for every queued video goes.

**Traps**

- The scan runs `ebur128=framelog=verbose` without the `peak` option, and `ParseLoudnessFromFfmpegOutput` stores `peakDb ?? -5.0` when it finds no peak line (`RefreshPipelineService.cs`).
- With ffmpeg n9.0.2, the version the release ships, the `ebur128` summary has no peak line without the `peak` option; `peak=sample` adds a "Sample peak:" block and `peak=true` a "True peak:" block, each with a line `Peak: {value} dBFS`, the unit printed as dBFS for both (measured).
- A digitally silent track's summary reads `I: -70.0 LUFS` and `Peak: -inf dBFS` (measured).
- `peak=sample` runs as fast as no peak, about 2,000 times real time, and `peak=true` takes about three times the CPU, such as 2.4 s against 0.8 s for a 23-minute video read from a local copy (measured).
- On 20 of the developer's videos across the loudness range, the stored integrated loudness matched a new measurement with every peak option, and true peak read 0.0 to 0.8 dB above sample peak, never below it (measured).
- Over the NAS, a video over 100 MB reads at 123–152 MB/s, and a clip under 5 MB takes 30–70 ms (measured).
- While loudness scans read other NAS videos, an 8 MB cold read at a new offset, standing in for starting or seeking a video, took a median 0.13 s with no scan, 0.31 s with one, 0.62 s with two, 1.01 s with three, and about 1.4 s with four (measured).
- Scan throughput over the NAS is about 130 MB/s with one scan and levels off at 150–176 MB/s from two, and a real-time read of a 17.6 Mbit/s video never fell behind by more than 0.25 s at any level (measured). These measured reads from the NAS only, not playback sent on to a client over the same Wi-Fi.
- The rescan reads 1,190 GB, videos under 60 minutes in full and 10 minutes of each longer one, plus about 7,600 clips under a minute at about 0.1 s each, about 2.8 hours at one scan at a time (inferred from the measured catalog and read rates).
- `AnalyzeLoudnessAsync` starts an ffprobe (`TryDetectAudioStreamAsync`) before it takes `_ffmpegSemaphore` and ignores its result, and the stage starts a task for every queued video at once, so every queued video's ffprobe starts together.
- Of the developer catalog's 10,528 videos with audio, 10,510 have a `peak_db` of exactly −5.0, and the other 18 have −4.9 or −5.1 (measured).
- Of those videos, 964 have the −70.0 LUFS integrated loudness of a track below the gate, such as a silent one (measured).
- `TryPersistLoudness` stores a loudness or peak only when it differs from the stored one by more than 0.1, and keeps the stored peak when a result with audio carries a 0.0 peak, which stands for none. A result that changes nothing writes nothing.
- The WebUI and the desktop parse the loudness stage's progress and completion messages by their words ("files", "updated", "without audio", "errors", "all scanned", "forced full rescan", "unavailable"), so those stay as they are.
- `NeedsLoudness` picks a video whose audio is unknown, one with audio and no loudness, and one without audio that has a loudness.
- Rescan loudness on the next refresh rescans every video, 17,482 on the developer's catalog (measured).
- The catalog's schema version is `PRAGMA user_version`, 3 today (`LibraryCatalogStore.SchemaVersion`).
- `MigrateToCurrentSchema` runs one fixed step, from schema version 2 to 3, when an older catalog opens and when one is imported.
- The file checks (`HasRequiredCatalogSchema` and `InspectCatalogFile` in `LibraryCatalogStore.cs`) accept only `SchemaVersion` and `MigratableSchemaVersion` (2), so an older catalog at any other version is quarantined and refused as damaged when it opens.
- Schema version 2 shipped in v0.13.0 and is the oldest shipped; version 3 shipped in v0.14.1, and version 1 never shipped (measured).
- `CatalogSeed` inserts items with positional values, and `WriteAtVersion` writes the current tables stamped with any version other than 2. `CatalogSeedTests` compares a migrated schema with a new one column by column in order, so a new column is the last one and has the same default in both.
- Backup rotation counts and trims only current-version backups, so schema version 3 backups stay as they are after the upgrade, as schema version 2 ones did at the last bump.
- The developer's 10,528 videos with audio total 1,773 GB and 1,243 hours (measured).
- The 237 of them that run 60 minutes or more total 641 GB (measured), and the scan measures each over 10 minutes from 20% in.
- The loudness stage runs up to four ffmpeg processes at once (`_ffmpegSemaphore`), each with a five-minute timeout, and unlike the fingerprint scan's, its parallelism is not a refresh setting.
- `_ffmpegSemaphore` is static and created once per process, and no test can see how many scans run at once without a hook in place of the ffmpeg run.

**Acceptance**

- A summary with a finite peak stores it, and one with a `-inf` peak or no peak line stores no peak, as does a result without audio, in server tests of the loudness parser and the stored values.
- A catalog at each version from the oldest shipped one to the one before current opens upgraded and imports upgraded, so a schema version bump without its upgrade step fails, in catalog upgrade tests for each version.
- Upgrading a catalog clears every stored peak and marks every existing video as scanned under the previous loudness analysis version, in catalog upgrade tests.
- A scan result records the current loudness analysis version, also when its loudness and peak haven't changed, in server tests of the stored values.
- After the upgrade, the refresh's loudness stage picks every video with audio and no video without audio, in server tests of which videos need a loudness scan.
- The loudness stage runs one ffmpeg process at a time, in server tests of the stage's limit.
- `peakDb`'s descriptions in `shared/api/openapi.yaml` and `docs/api.md` say it is the measured true peak, absent when not measured, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` passes.

**Evidence**

- `LibraryCatalogStore` is at schema version 4.
- `OldestUpgradableSchemaVersion` (2) replaces `MigratableSchemaVersion`.
- An upgrade step per version runs in order, in one transaction, on open and import.
- The file checks take each version's columns from one table, so versions 2 and 3 inspect as older and version 1 stays refused.
- The step from version 3 adds `loudness_analysis_version` (`INTEGER NOT NULL DEFAULT 0`), last in a new catalog too.
- The step from version 3 clears every `peak_db` and sets videos to analysis version 1 and photos to 0.
- `LibraryCatalogStore.LoudnessAnalysisVersion` is 2.
- `CatalogRefreshItem` carries each item's analysis version, and `SetLoudness` writes it.
- The scan runs `ebur128=framelog=verbose:peak=true`.
- `FileLoudnessInfo`'s loudness and peak are nullable.
- The parser stores no peak for `-inf` or a missing peak line.
- `TryPersistLoudness` writes the current analysis version with every result but a failed one, and counts only value changes as updated.
- A failed scan, such as a timeout or a summary without an `I:` line, keeps the stored loudness, peak, and analysis version and records its error. Found in review.
- `NeedsLoudness` also picks a video with audio that has a loudness error, so the next refresh scans a failed video again, also one already at the current analysis version. Found in review.
- The stage runs `Parallel.ForEachAsync` at `LoudnessScanConcurrency` (1) in place of a task per video and the static four-slot semaphore.
- `TryDetectAudioStreamAsync` is gone with its only call.
- The parser's fallback for `volumedetect` lines (`mean_volume`, `max_volume`) went too, since the scan never runs `volumedetect` and the fallback stored a sample peak and the −5.0 stand-in. Found during implementation.
- `LibraryCatalogMigrationTests` runs open and import for every version from 2 to one before current, and checks the version 3 step's peaks and analysis versions.
- `RefreshPipelineServiceTests` covers the parser on ffmpeg n9.0.2 summaries, the stored values and analysis version, a failed scan's kept values and its next scan, which videos need a scan, and the one-at-a-time limit.
- A real ffmpeg scan of a generated 12 kHz tone stores about −0.3 dBTP, not its −3.9 dBFS sample peak, in `RefreshPipelineServiceTests`.
- `CatalogSeed` has a builder per shipped schema version.
- Each guarded behavior made its tests fail when broken, and was restored from a copy:
  - Without the version 3 step, every upgrade test failed.
  - `peak=sample` failed the real ffmpeg test.
  - A limit of 4 failed the limit test.
  - Dropping the version check, the version-only write, or the cleared peak, or bringing back the −5.0 fallback, each failed its test.
  - Clearing the stored values on a failed scan failed the failed-scan test and the real ffmpeg failure test.
  - Dropping the loudness error from `NeedsLoudness` failed the failed-scan test.
- A copy of the developer's catalog upgraded in 432 ms for 49,109 items (measured).
- After the upgrade the copy had no peak, all 17,482 videos at analysis version 1 and its 31,627 photos at 0, and the next refresh would pick exactly its 10,528 videos with audio (measured).
- `dotnet build ReelRoulette.sln` passed with no warnings.
- `dotnet test ReelRoulette.sln` passed: 497 Core, 421 desktop, and 7 ServerApp tests.
- SystemChecks passed.
- `npm run verify` passed, `verify:contracts` included.
- `shared/api/openapi.yaml` and `docs/api.md` describe `peakDb` as the measured true peak.
- `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, and `docs/domain-inventory.md` describe the upgrade chain and the scan.
- `CONTEXT.md` and `docs/api.md` say a failed scan keeps the stored loudness and peak and is scanned again on the next refresh.

#### Stats tab slice

**Scope**

- Library and current-file stats live in the side panel's Stats tab, which joins the tab row here, between Tags and Settings. Its icon is `bar_chart`.
- Clicking the current file name in the header opens the panel on the Stats tab. Its tooltip shows the full file name and then "Show stats".
- The current file comes first, since the file name opens the tab: its name, then its full path, then its stats.
- The full path leaves room beside it for Show in File Manager or Copy Path, which Show in File Manager from the WebUI adds.
- With nothing playing, the current file section says "Nothing is playing yet."
- The library stats follow, as a grid of cards, each a value over its label.
- Library stats: total videos, photos, and media, favorites, blacklisted, total plays, unique media played, never played, videos with and without audio, and baseline loudness.
- Current file: file name and full path, plays, last played (the time before this play, or Never), favorite, blacklisted, duration, has audio, loudness, true peak, and tags.
- Has audio reads "Unknown" before the loudness scan has looked at the file.
- Loudness reads "Unknown" for a file with audio, or whose audio isn't known yet, without loudness data.
- True peak shows the scan's peak, such as "-1.2 dBTP". A file with audio, no peak, and a loudness at the −70.0 LUFS floor reads "Silent", since ffmpeg measures a silent track's peak as −∞; any other file with audio and no peak reads "Not measured".
- A video without audio reads "N/A" for Loudness and True peak, as the desktop does.
- Values use the ASCII hyphen for a minus sign, as the mockup's numbers do.
- Last played reads "Just now", "{n} min ago", "{n} hours ago", or "{n} days ago", in the singular for 1, or "Never".
- Tags show as chips in the tag catalog's category order, as the mockup orders them, from a tag catalog the Stats tab shares with the Tags tab and refreshes on `tagCatalogChanged`.
- The mockup's Peak row becomes True peak, with "Silent", "Not measured", and "N/A" as above, and its Last played and tags follow the rules above.
- The mockup keeps its Adjustment row, which WebUI Loudness Normalization brings, since the mockup shows the whole release.
- One refresh reads `GET /api/library/stats` and `POST /api/library/item` for the playing item. The file name and path show at once from the playing item, and the rows fill in from the read.
- Refresh after events and actions is coalesced as the desktop does it: a short wait gathers a burst, one request is in flight at a time, and requests during it get one more.
- The tab loads only while it shows. Events while it is hidden load nothing, and showing it loads once.
- A failed load keeps what the tab last showed. With nothing shown yet, the Library section says "Stats load failed: {reason}" in place of its cards and relays it, as the Library tab does its load failure, and the current file shows only its name and path.
- While the server fails the compatibility check or runs without a library, the tab loads nothing: the Library section shows the server's own message, as the Library tab does, and the current file shows only its name and path. While the server asks for pairing, both show nothing in place of their stats.
- The mockup changes land first and stop for the user's review on the phone and iPad before the app follows.

**Traps**

- The WebUI never calls `GET /api/library/stats`, and its now-playing line shows only the file name and duration (measured).
- The header file name's tooltip shows the full name only today.
- The playing item (`store.current`, a `RandomResponse`) has no play count, last played time, tags, audio, loudness, or peak, and the WebUI never calls `POST /api/library/item`.
- The time before this play comes only with the `playbackRecorded` event, as `previousLastPlayedUtc`. `POST /api/play/{itemId}` sends that event before it answers, so for a library play the event can arrive before the playing item changes. The desktop holds such an event until its file starts (`LibraryPanelBrowse.cs`).
- A favorite or blacklist change sets the playing item's flags in place without a new value for `store.current`, so a view of `store.current` doesn't render again for it.
- The foundation snapshot (`foundation.test.ts.snap`) holds the whole starting page, including the tab row and the now-playing line.

**Acceptance**

- The Stats tab, with the `bar_chart` icon, shows the current file section first and the library stats below it, and says "Nothing is playing yet." while nothing plays, in component tests for both sections.
- Clicking the current file name in the header opens the panel on the Stats tab, in a component test.
- The library stats match the library stats response, in component tests.
- The current file section updates on play, favorite, blacklist, tag, and playback events, in component tests.
- True peak shows the stored peak, "Silent", "Not measured", or "N/A", and Loudness reads "Unknown" or "N/A", each in its case above, in component tests of each.
- Last played shows the time before this play, also when the play's event arrives before the playing item changes, in component tests.
- Tags show in the tag catalog's category order, in a component test.
- A burst of events causes one stats request, plus at most one more for events during it, in coalescing tests.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

**Evidence**

- The mockup's Peak row is True peak, with "Silent", "Not measured", and "N/A"; Has audio and Loudness read "Unknown" for a video the scan hasn't reached; Last played counts minutes, hours, and days before this play; the audio cards count only videos whose audio is known; and the Mockup tab's Stats load shows a failed first load once, in Library, as the server's own message does, with the current file keeping its name and path. The user reviewed it on the phone and iPad and chose the single message. Its Playing file removed choice shows only the playing file's name and path while the library's cards load, as the app does for a 404, with a check that fails without it. Found in review.
- The WebUI's Stats tab (`src/ui/StatsTab.tsx`, `src/stats/statsTab.ts`) sits between Tags and Settings with `bar_chart`, reads `GET /api/library/stats` and `POST /api/library/item`, and builds its rows and cards in `src/stats/statsModel.ts`. The time before this play comes from `src/stats/lastPlayed.ts`, and refreshes coalesce in `src/stats/coalescedRefresh.ts`.
- The tag catalog the tabs share is `src/tags/tagCatalog.ts`: the Tags and Filter tabs give it each catalog they load, `tagCatalogChanged` brings the new one, and a resync drops it, so the Stats tab loads it itself only when no tab has. That costs at most one request, so the mockup's category order stayed. The catalog takes the Tags tab's category and tag types, and the Stats tab orders categories with the Tags tab's own sort. Found in review.
- The header's file name opens the panel on the Stats tab with a click, Enter, or Space, with the full name, then "Show stats", as its tooltip. `LibraryProjectionItem` gains `peakDb`, and `parseLibraryItem` reads a single item.
- A playing item no longer in the catalog, whose read answers 404 after a refresh drops its file or a duplicate's delete removes it, shows only its name and path, and the library cards still load. Found in review.
- Tests: `src/test/screens/stats.test.ts` (21) covers the tab's place and icon, the header's click and keys, both sections, the library cards, each audio case, a new play and the favorite, blacklist, tag, and playback events, no rows for a new play until its own read lands, the time before this play with its event before or after the play, the tag order from the Tags tab's catalog and from a catalog change, the catalog loaded when no tab has, loading only while shown, a burst and a load in flight, a failed first and later load, a playing item no longer in the catalog, running without a library, failing the compatibility check, and the server asking for pairing. Unit tests cover the wording (`statsModel.test.ts`), the time before this play (`lastPlayed.test.ts`), the coalescing (`coalescedRefresh.test.ts`), and the shared catalog (`tagCatalog.test.ts`).
- Each guarded behavior made its test fail when broken and restored from a copy: ignoring a held event, no coalescing, loading while hidden, loading while the server holds back, tags left unordered, no click on the header's file name, and no Silent rule. Found in review: the new play's rows shown before its read, the compatibility message, and the pairing state each failed its test when broken, and the 404 test failed before its fix.
- The panel, header, and player tests take the new tab and the file name's tooltip, and the foundation snapshot takes the tab, its page, and the file name's button role.
- `npm run verify` passed with 1,399 tests, and `node docs/mockups/reelroulette/build/check.mjs` passed, its new checks included.
- `CONTEXT.md` and `docs/domain-inventory.md` describe the Stats tab, the header's file name, and the shared tag catalog. `docs/api.md` names the Stats tab as showing `previousLastPlayedUtc`, and `docs/architecture.md` lists its reads. Found in review.
- The spot check passed on every step: the header's file name opened the panel on Stats with the file's name, path, rows, and tags, then the library's cards; a favorite from the player's button turned Favorite to Yes; and Next moved the section to the new file, with its Last played the time before that play.

#### Release checks

- Manual: While the loudness rescan runs, a video from the NAS plays on the iPad without stalling, and starts and seeks without a noticeable wait.
- Manual: After the loudness rescan, the Stats tab shows a peak for a video with audio.

#### Not included

- Show in File Manager and Copy Path beside the current file's full path, which is Show in File Manager from the WebUI.
- The Adjustment row, which is WebUI Loudness Normalization.
- Measuring a video of 60 minutes or more in full, instead of over 10 minutes from 20% in.
- Playback history charts, which is Playback History and Analytics.

### M12g - WebUI Settings Panel

- **Status**: ✅ Complete
- **Goal**: The WebUI side panel has a Settings tab for per-device preferences and diagnostics.
- **Depends on**: WebUI Responsive Layout and Panels, WebUI Field Validation Pattern, and WebUI Library Tab, whose tiles Show file names on tiles changes, and WebUI Auto-Pause and Photo Scrub Bar, whose Auto-Pause mode it sets, and WebUI Notifications, whose popup settings its Notifications section sets.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Client settings live in the Settings tab, all kept per device.
- Every client setting survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.
- Remembering is the default, with no option to turn it off.
- Settings apply as they change; the Settings tab has no Save.
- The Settings tab's layout, in this order:
  - Playback: Autoplay mode, Advance after (today's photo duration, renamed), and Seek step.
  - Audio: Volume step and Enhanced audio, on by default and described as "Processes audio in the app, so in-app volume works on iPhone and iPad."
  - Player controls: Hide player controls, with Hide after and Keep visible while paused under its Timeout choice.
  - Appearance: Theme, Ambient mode with its expandable settings, and Show file names on tiles.
  - Notifications: Show popups and its collapsible Popup settings.
  - Panel: Side and Auto-Pause.
  - Keyboard shortcuts: the shortcut reference, collapsed by default with a chevron, as Ambient mode settings is. `?` opens Settings with it expanded.
  - Diagnostics: the client id, the session id, the client type, the device name, the server's version with its API version, such as "0.15.0 (API 1)", and the app's own version, labeled "ReelRoulette", not "WebUI".
- This milestone fills Playback with Advance after, Appearance with Theme and Show file names on tiles, Notifications, Panel, and Diagnostics. The other settings arrive with the milestones that build them, each in its section here.
- Hints say only what a label doesn't: no mockup notes, no "as on the desktop" asides, and no key badges in setting labels, since the shortcut reference lists the keys.
- Settings fields that can hold a value that is not valid use the field validation pattern, and such a value is not kept.
- Each setting's text is the mockup's, word for word, including hints that name what a later milestone of this release adds, such as Auto-Pause's "or the admin view".
- No `last.log` line is written per setting change: what a setting does, such as Auto-Pause pausing, logs itself.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Settings tab | ✅ Complete | The tab in the panel's row, its sections in the mockup's order, Playback's Advance after out of the header, Panel's Side and Auto-Pause, Diagnostics with both versions, the closing line, the player's autoplay, loop, and mute kept across a refresh, a setting's field's saved check, and the field validation pattern's icons and tooltip fading in and out. |
| Appearance | ✅ Complete | Theme, with `theme-color` and the status bar style following it, and Show file names on tiles. |
| Notifications settings | ✅ Complete | The Notifications section with Popup settings and the sample popup, and the bell list's Notification settings link. |

#### Settings tab slice

**Scope**

- The Settings tab joins the side panel's tab row, after Tags; WebUI Stats Panel puts Stats between them.
- The header has no settings icon, since the tab row reaches the Settings tab. WebUI Responsive Layout and Panels already leaves it out.
- The Settings tab holds no unsaved changes, so its tab has no dot.
- The tab shows Playback, Panel, and Diagnostics, leaving the places the mockup gives the other sections to the slices and milestones that fill them.
- Below the sections, one line: "Settings apply at once and are kept on this device."
- Advance after is today's photo duration, renamed, and it leaves the header. It keeps today's 1–300 seconds.
- Advance after uses the field validation pattern: a value that is not a whole number from 1 to 300, an emptied field included, is flagged as it is typed with "Use a whole number from 1 to 300 seconds." and is not kept, and the value in use stays.
- A setting that applies without Save and must always hold a value has a setting's field, a rule of the field validation pattern built once, so later settings such as Hide after reuse it. Advance after uses it:
  - A valid value is saved only on Enter or when the field loses focus, so a value passed through on the way, such as the "1" of "120", is never saved.
  - While the field has focus, a value that is not valid stays flagged. When the field loses focus with one, or the Settings tab hides or the panel closes, since a hidden field may get no blur, it shows the value saved again, unflagged.
  - Every setting field in the mockup follows the same rule: Advance after, Hide after, and Loudness normalization's three fields.
  - When Enter or leaving the field saves a value that changes the setting, a green check, `check_circle`, shows inside the field on its right, where the red icon sits and styled like it, for about two seconds, then fades out, and a polite live region says "Saved". Nothing shows when the value stays as it was, or when a value that is not valid goes back to the one saved, and typing again hides the check. Choices such as Side show their change at once and get none.
- Advance after starts at 10 seconds, the value the user always sets, in place of today's 15, and is kept in the per-device store as `playback.advanceAfter`. The photo duration stored before, `rr_photoDuration`, doesn't carry over, since old client settings aren't carried over.
- Changing Advance after doesn't show the photo showing again: its timer takes the new length, keeping the time it has shown and whether it is paused, as the mockup's handler does, and a length no longer than the time already shown ends the photo as soon as it runs.
- The panel's side setting chooses the side the panel opens on, with options reading Left, then Right, matching the sides.
- The player's panel button sits on the panel's side: at the player's top right, as today, or, with the panel on the left, at its top left just right of the bell that WebUI Notifications adds, with the `left_panel_open` and `left_panel_close` icons.
- Auto-Pause offers Never, Always, or Responsive, the default, kept as `panel.autoPause`. WebUI Auto-Pause and Photo Scrub Bar describes the modes and keeps Auto-Pause at Responsive until this setting exists.
- A side or Auto-Pause change acts at once while the panel is open.
- Randomization mode is not a Settings tab entry; it is in the Library tab, still kept as `rr_randomizationMode`.
- Loop, autoplay, and mute are only the player's buttons, with no entry in the Settings tab, and each button's state survives a page refresh, kept as `player.loop`, `player.autoplay`, and `player.muted`.
- The diagnostics information shows in the Settings tab on every browser.
- Diagnostics shows the client and session ids and the device name in full, since they are for matching `last.log` lines.
- Diagnostics' server version is `/api/version`'s `assetsVersion`, the release version, or its `appVersion` from a server that sends no `assetsVersion`, with its `apiVersion`, from the last version check the server answered, a server that fails the compatibility check included, and "Unknown" before one answers.
- The WebUI build reads the app's version from the repository's `.version` file, which `set-release-version.ps1` already sets for each release, without its leading `v`.
- The build output check fails unless the built WebUI holds that version.
- The field validation pattern's red icons, in a field, on a held action, and after a Filter section's name, its tooltip, and a setting's saved check fade in and out over 250 ms on their opacity, each keeping its place while it fades out, on every screen that uses the pattern: the Filter and Tags tabs, the tag, category, and preset dialogs, and the Settings tab. Only the look lingers: a field's `aria-invalid` and description and a held action's state change at once. With `prefers-reduced-motion: reduce`, they show and hide at once.
- The pairing prompt's Pair is only ever disabled while the token is empty, never held, so it shows no icon to fade, in the mockup too.

**Traps**

- In the v0.13.0 manual regression pass the diagnostics panel appeared only on the phone in Firefox (measured).
- Photo duration and randomization mode are already kept per device in `localStorage`, as `rr_photoDuration` and `rr_randomizationMode`, outside the per-device store's `rr_device.` entries.
- Autoplay and loop are not kept today and start off.
- The mobile diagnostics line, which WebUI Notifications removed, showed the client id, session id, and client type below the player, on a mobile browser only (`isMobileBrowser()`).
- `package.json`'s version is 0.1.0, not the release's, and `set-release-version.ps1` doesn't write it.
- The header ignores a photo duration outside 1–300 seconds without saying so, and reads "12abc" as 12.
- The server's `appVersion` is the 4-part assembly version, `0.15.0.0`, while `assetsVersion` is the release version, `0.15.0-dev.1`, which `set-release-version.ps1` writes for each release (measured).
- A photo duration change calls the player's `playCurrent()`, which posts `/api/record-playback` unless told not to, so applying Advance after as it is typed would record a play per valid keystroke while a photo shows under Autoplay or Loop.
- The panel's tab pages are shown and hidden by their `hidden`, never unmounted, so a field in a hidden tab keeps its text, and a browser may give it no blur as it hides.
- The red icon and its tooltip (`useFieldValidation`'s `mark` in `src/ui/FieldValidation.tsx`), a held action's icon (`HeldButton`), and a Filter section's icon (`SectionProblemMark`, which `FilterDialog.tsx` renders only while a field in the section is flagged) are each rendered only while their field is flagged, so each unmounts the moment its field clears. Each has to stay mounted while it fades out, the tooltip with the last problem's text.
- The tooltip shows only by its `is-shown` class and is `display: none` otherwise, so it has to keep the class while it fades out.
- happy-dom's `matchMedia` never reports reduced motion, so tests stub it, as `stubCoarsePointer` in `src/test/screens/pageHarness.ts` does for a coarse pointer.

**Acceptance**

- The Settings tab holds the client settings, including Advance after, the panel's side, and Auto-Pause, and the header no longer shows photo duration, in WebUI tests.
- An Advance after value outside 1–300 seconds is flagged with the field validation pattern as it is typed and is not kept, and the value in use stays as it was, in WebUI tests of Advance after with the field validation pattern.
- Clearing "15" with Backspace and leaving the field keeps 15 in use, typing "120" saves nothing until the field is left and then only 120, and leaving Advance after with "abc" or emptied, or the Settings tab hiding or the panel closing while it has focus, shows the value saved again, unflagged, in WebUI tests of Advance after.
- Changing Advance after while a photo shows under Autoplay keeps the time it has shown and changes only its length, beside the player and at phone size with Auto-Pause holding the photo, which stays held, in WebUI tests.
- Auto-Pause offers Never, Always, and Responsive, starts at Responsive, and the panel pauses as the chosen mode says, in WebUI tests.
- Each setting applies as it changes, with no Save, in WebUI tests.
- The Settings tab has no loop or autoplay entry, in WebUI tests.
- The Settings tab is in the panel's tab row, and the header has no settings icon, in WebUI tests.
- With the panel on the left, the panel button sits at the player's top left, just right of the bell, with the left icons, and with the panel on the right at its top right with the right icons, in WebUI tests of the panel's side.
- The Settings tab shows Playback, Panel, and Diagnostics, in that order, and no setting label carries a key badge, in WebUI tests.
- The Settings tab shows the diagnostics information on desktop and mobile browsers, in WebUI tests.
- Diagnostics shows the client and session ids, the client type, the device name, the server's version with its API version, and the app's version from `.version`, labeled "ReelRoulette", in WebUI tests and a build check that the app's version matches `.version`.
- After a page refresh, Advance after, the panel's side, Auto-Pause, and the autoplay, loop, and mute buttons' state are each as they were, in WebUI tests of a page refresh keeping each setting this slice adds.
- Preferences are stored per device and do not change other devices, in WebUI tests for preference storage.
- Enter or leaving Advance after with a new value shows the green check and says "Saved", and the check fades out after about two seconds; the same value, a value that is not valid going back to the one saved, and typing again show none, in WebUI tests of Advance after.
- Each red icon, in a field, on a held action, and after a Filter section's name, its tooltip, and the saved check fade in and out over 250 ms, rendered while they fade out and gone once faded, in WebUI tests on the Filter tab, the Tags tab, a dialog, and the Settings tab.
- With reduced motion, they show and hide at once, in WebUI tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone.

**Evidence**

- The Settings tab is `src/ui/SettingsTab.tsx`, the fourth page of the side panel, after Tags (`PANEL_TABS` in `src/panel/panelHost.ts`), in its own screen boundary, with no unsaved dot. Its tab hooks load and keep nothing. Its sections are `section` elements headed Playback, Panel, and Diagnostics, then the closing line, with no button.
- Advance after is a `SettingTextField` whose rule, `advanceAfterProblem` in the new `src/settings/settings.ts`, is a whole number from 1 to 300 through `wholeNumberProblem`, which later settings fields can use. A valid value goes to `setPhotoDuration`, which now takes a number and keeps it in the per-device store as `playback.advanceAfter`; while that key is absent the store starts at 10 seconds, and it neither reads nor writes `rr_photoDuration`. The mockup's Advance after starts at 10 seconds too, in place of 5. The header's Photo Duration and its styles are gone.
- A photo duration change no longer shows the photo again: the player gives a showing photo's timer the new length with the photo timer's new `setLength`, which keeps the time it has run and whether it runs or is held, and ends it at the next tick once that time reaches the new length. Nothing loads or is recorded again, and Auto-Pause's hold stands. The player's own 1–300 clamp is gone, since the store refuses a duration outside the range.
- The setting's field rule is `createSettingField` in `src/validation/fieldValidation.ts`, and `SettingTextField` in `src/ui/FieldValidation.tsx` renders it, saving on Enter, on blur, and when its `shown` turns false, which the Settings tab sets from the panel being open on it. The mockup's `settingField` in `build/common.js` is the same rule, used by Advance after, Hide after, and Loudness normalization's three fields, with `leaveSettingFields()` as the Settings tab hides or the panel closes. The validation page states the rule with a live specimen, and `check.mjs` checks it there and on Advance after.
- Side calls the panel host's new `setSide`, which remembers `panel.side`, and `.fullscreen-stage[data-side="left"] #panel-btn.overlay-corner-btn` puts the panel button at `left: 64px`, just right of the bell; its icon already followed the side. Auto-Pause's mode is `createSettings`' `autoPauseMode`, kept as `panel.autoPause`, in place of the fixed Responsive signal in `appServices.ts`.
- Loop and Autoplay are kept by the store's new `setLoop` and `setAutoplay`, which the player's buttons call, as `player.loop` and `player.autoplay`; the store's `loop`, `autoplay`, and `photoDurationSeconds` are now read-only signals. Mute is kept by the player as `player.muted`, so `createPlayer` takes the device store.
- Each version check the server answers stores `serverVersionOf(version)`, in `src/state/serverCompatibility.ts`, before the compatibility check: `assetsVersion`, or `appVersion` from a server without it, with `apiVersion`. Diagnostics shows "Unknown" until then. The server's `appVersion` measured `0.15.0.0` and its `assetsVersion` `0.15.0-dev.1` on the built server.
- `scripts/app-version.mjs` reads `.version` without its `v` and fails on a missing or empty file; `vite.config.ts` and `vitest.config.ts` define `__APP_VERSION__` from it, `src/env.d.ts` declares it (and `tsconfig.test.json` includes that file), and `src/config/appVersion.ts` exports it. `verify-build-output.mjs` fails unless a built script holds it.
- Tests: `src/test/screens/settings.test.ts` (20 tests) covers the tab and header, section order, no Save, no loop, autoplay, or mute entry and no key badge, Advance after's start at 10 seconds or as saved, its flagging of "0", "301", "abc", "12abc", "1.5", and an emptied field, none of which Enter keeps, with the value in use shown again on leaving, saving nothing while it is typed, however long typing pauses, and then only on Enter or blur ("120" saves only 120 once the field is left), clearing "15" with Backspace and leaving keeping 15, the value saved shown again, unflagged, on blur and when the tab hides or the panel closes, a showing photo keeping its time beside the player and staying held under Auto-Pause at phone size, the side with the button's computed position and icons, Auto-Pause's three modes acting at once, Diagnostics on a desktop and an iPhone user agent, the `appVersion` fallback, a server that fails the check, "Unknown", a page refresh keeping every setting this slice adds, and settings writing only `rr_device.*` keys and sending no request. Unit tests cover `wholeNumberProblem`, `createSettings`, `createSettingField`, the photo timer's `setLength`, a held timer's time kept through a shorter length and then a longer one included, `setSide`, `serverVersionOf`, the store's 10-second default, Loop, and Autoplay, the player's Mute, and its duration change keeping a running or held photo's time.
- Existing tests that changed: the header's photo duration tests moved to the Settings tests; the screen boundary tests find the header by its banner role, since the photo duration field they used is gone; the tab tests list four tabs; the player's storage test now expects its three keys; the full-page snapshot leaves out Diagnostics' values, which differ by run, browser, and release; the Filter and Tags snapshots changed only in `useId` numbers, since the Settings tab's field takes one first; the player's Loading… test now checks that a duration change waits for nothing; the page refresh tests save Advance after with Enter; the player screen tests' photo times and the mockup check's follow the 10-second default; and the player and Auto-Pause unit tests set 15 seconds, the time their photo timers assume.
- Each guarded part was broken in turn and its tests failed: the rule taking "12abc" (2 tests), the photo duration change recording a play (2), Mute not kept (3), the side not kept (4), the left-side button rule removed (1), the server version stored after the compatibility check removed (3), Auto-Pause ignoring the setting (1), the setting's field saving as typing pauses (3), a held photo's timer keeping only the time up to a shorter length (1), and the build defining a wrong version, which the build output check refused. Before the setting's field and the duration change were fixed, the seven new tests of them in `settings.test.ts` failed, and with the old restart put back, both photo tests failed again, the one at phone size with four random picks behind the panel.
- The build output check first looked for the version in double quotes, which the minifier doesn't use: it writes the version in backticks. It now takes any quote, and passes on the real build and fails on one that defines another version.
- `npm run verify` passed: the contracts are fresh, typecheck, 63 test files and 1303 tests, the build, and the build output check. `node docs/mockups/reelroulette/build/check.mjs` and `check-milestones.ps1` passed. There are no C# changes.
- The mockup's Diagnostics shows full-length ids and the device name as the WebUI builds it, so their wrapping can be checked on a phone, and `check.mjs` checks both. In Playback, Panel, and Diagnostics, nothing differs from what shipped apart from Advance after's 1–3600 seconds and Playback's Autoplay mode and Seek step, which WebUI Autoplay Modes and WebUI Keyboard Shortcuts bring. `CONTEXT.md`, `CHANGELOG.md`, `docs/domain-inventory.md`, and `docs/dev-setup.md` follow.
- The field validation pattern's rule that an empty field is never flagged now says it holds only for a field that may sit empty, such as a name typed for an action, and that a field that must always hold a value, such as Advance after, is flagged when emptied: in `CONTEXT.md`, `docs/domain-inventory.md`, `src/validation/fieldValidation.ts`, the comments in `src/ui/FieldValidation.tsx` and `src/styles.css`, two test names in `src/test/fieldValidation.test.ts`, and the mockup's `build/common.js` and `build/validation.src.html`. The mockup's pages were rebuilt and `check.mjs` passed again, as did `npm run verify`.
- The spot check on a phone passed: Advance after and Left were kept after a refresh, the panel button sat just right of the bell, and Diagnostics' full ids and device name wrapped in the panel.
- The saved check is `createSettingField`'s `justSaved`, in `src/validation/fieldValidation.ts`, which a save turns on only when `saved()` changed and which goes off after `SETTING_SAVED_MS`, 2000, or on input. `SettingTextField` shows it as `.vfield-saved`, `check_circle` in `--success`, #22ef7f in the dark theme and #1a7f43 in the light as in the mockup, through `ValidatedField`'s new `trailing`, beside a polite `visually-hidden` live region that says "Saved".
- The fades are `useFadeOut` in `src/ui/FieldValidation.tsx`, with `FADE_MS` of 250: the field's icon and its tooltip, which keeps the last problem's text, `HeldButton`'s icon, `SectionProblemMark`, which now takes `shown` and which `FilterDialog.tsx` always renders, and the saved check stay rendered for 250 ms with `is-fading-out` once they go, or go at once while `prefers-reduced-motion: reduce` matches. The stylesheet fades each in with the `field-mark-in` animation as it renders and out by an opacity transition under `is-fading-out`, which ignores the pointer, and does neither under reduced motion. The mockup fades in by setting a class after a reflow; the app's animation looks the same and needs no second render. A field's `aria-invalid` and description, and a held action's `aria-disabled` and hidden reason, still change at once. The pairing prompt's Pair, never held, shows no icon.
- Tests: unit tests of `justSaved`, a second save's check lasting its full two seconds included (3); in `settings.test.ts`, the check on Enter and on blur, its two seconds and fade, "Saved", none for the same value or a value that is not valid going back, typing again fading it out as the red icon fades in, none for Side, and reduced motion (4), and the stylesheet's rules, which fade each in and out over `FADE_MS`, stop a fade in as the fade out starts, and take no motion under reduced motion (1); in `filter.test.ts`, a corrected duration's icon and tooltip, General's icon, and Apply's icon fading out, rendered until faded, showing again when flagged again during the fade, and going at once with reduced motion (2); the Tags tab's new tag name icon (1) and the Edit Tag dialog's name icon (1) fading out. `stubReducedMotion` in `src/test/screens/pageHarness.ts` makes the reduced-motion query match. The Filter tests' icon, tooltip, section, and held-action helpers and one Settings assertion now count an icon or tooltip that is fading out as not shown, and the full-page snapshot gains Advance after's live region.
- Each guarded part was broken in turn and its tests failed: unmounting at once with no fade (5 tests), ignoring reduced motion (2), the check for a save that changed nothing (2), the stylesheet's reduced-motion rules removed, or the fade out no longer stopping the fade in (1 each), the first save's timer left running past a second save (1), and Advance after's save and the store both taking a value that is not valid (1).
- `npm run verify` passed again: typecheck, 63 test files and 1315 tests, the build, and the build output check. `node docs/mockups/reelroulette/build/check.mjs`, 1000 checks, and `check-milestones.ps1` passed.
- The spot check on a phone passed for the saved check and the fades.

#### Appearance slice

**Scope**

- The Appearance section shows between Playback and Panel.
- Theme is System (the default, following the system as the WebUI does today), Dark, or Light, kept per device.
- The installed app's status bar style and the `theme-color` meta follow the theme in use, so the status bar's text reads against the page in the light theme too.
- Show file names on tiles is off by default, kept per device. Hovering a tile with a mouse shows its name as a tooltip either way.

**Traps**

- `main.ts` sets the `theme-dark` or `theme-light` class on the root element from `prefers-color-scheme` before the page renders, and again when the system's scheme changes.
- `index.html` fixes `theme-color` at `#1a1a1a` and `apple-mobile-web-app-status-bar-style` at `black-translucent`, whose white status bar text an installed iOS app draws over the page, which is light in the light theme (inferred).
- iOS reads `apple-mobile-web-app-status-bar-style` when the installed app starts, so changing it while the app runs may not take effect until the next start (inferred).
- Every tile shows its name today.
- The library grid builds its tiles as HTML strings and moves the playing mark without rendering them again, so a tile change it doesn't render again needs a class the stylesheet reads.

**Acceptance**

- Theme offers System, Dark, and Light and starts at System, in WebUI tests.
- The `theme-color` meta and the status bar style follow the theme in use, in WebUI tests of the theme.
- Show file names on tiles starts off, and turning it on shows each tile's name on the tile, in WebUI tests.
- Theme and Show file names on tiles apply as they change, in WebUI tests.
- The Settings tab shows Appearance between Playback and Panel, in WebUI tests.
- After a page refresh, the theme and whether file names show on tiles are each as they were, in WebUI tests of a page refresh.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone.

**Evidence**

- Theme is `src/settings/theme.ts`: the choices, `resolveTheme`, `THEME_META` with each theme's `theme-color` (`#1a1a1a`, `#eceff4`) and status bar style (`black-translucent`, `default`), `applyTheme`, which sets the root element's class and both metas, creating a missing meta, and `followTheme`, which applies the choice now and again as it or the system's scheme changes. The settings service keeps it as `appearance.theme`, System by default, beside `appearance.tileNames`, off by default. `App.tsx` follows it in a layout effect, as it toggles `short-screen`, so it stops when the page unmounts; `main.ts`'s own system sync is gone.
- `index.html`'s head has an inline boot script, after the two metas, that reads `rr_device.appearance.theme`, takes only the three choices, falls back to System, and sets the class and the metas while the page loads; the metas' static values stay dark. The server sends no Content-Security-Policy, so it runs (read from the server code). Vite keeps it in the built page, ahead of the app's module script (measured), and the build output check now fails unless the built page holds it, which it did when the script was stripped from `dist/index.html`.
- Show file names on tiles is the `show-tile-names` class on `#library-overlay`, from `settings.tileNames`, and the stylesheet hides `.library-grid-tile-filename` unless that class is there; the tiles aren't rendered again, and their `title` is unchanged.
- The Appearance section, between Playback and Panel, holds Theme's radio buttons and a `Checkbox` with the hint as its description, with the mockup's wording; the mockup needed no change.
- happy-dom reports a light system scheme (measured), so the test harness's `resetPage` sets its scheme to dark and clears the theme classes and metas between tests, and gains `stubColorScheme`, a query that sends `change` as the system's scheme changes. Without the dark setting, only the new Theme test, which assumes it, failed; no existing test depended on it (measured). The header's logo tests choose their theme through `rr_device.appearance.theme`.
- Tests: in `src/test/screens/settings.test.ts`, Theme's three choices starting at System and each applying the class and both metas at once and being kept, System following the system's changes and Dark or Light holding, Show file names on tiles starting off, a tile's name bar shown and hidden by the stylesheet on the same tile with its tooltip either way, a page refresh keeping both, the section order, and the storage test's two new keys; `src/test/screens/themeBoot.test.ts` (16 tests) runs the boot script with nothing kept, each choice, an unknown value, and text that isn't JSON, under a dark and a light system, against `resolveTheme` and `applyTheme`, with storage that throws, and checks the static metas are dark; `src/test/theme.test.ts` and `src/test/settings.test.ts` cover `resolveTheme`, `isThemeChoice`, `THEME_META`, and the two settings' defaults and writes. The full-page snapshot gains only the Appearance section.
- Each guarded part was broken in turn and its tests failed: the boot script ignoring the kept choice (2 tests), the light theme keeping `black-translucent` (12), System ignoring the system's change (1), the tile-names rule removed (1), the theme not kept (4), file names on tiles not kept (4), and the page not following the theme (4, the light logo test included).
- `npm run verify` passed: the contracts are fresh, typecheck, 65 test files and 1339 tests, the build, and the build output check. The mockup's pages rebuilt unchanged and `node docs/mockups/reelroulette/build/check.mjs` and `check-milestones.ps1` passed. There are no C# changes.
- `CONTEXT.md`, `CHANGELOG.md`, and `docs/domain-inventory.md` follow.
- The spot check passed: on a phone in the browser, Light, Dark, and System each applied and Show file names on tiles showed the names, both kept after a refresh; and the iPad's installed app in Light, after a relaunch, in portrait and landscape, showed readable status bar text with the header below the status bar and nothing cut off or left as a gap at the top or bottom edge.
- The installed iOS app's status bar followed a theme change at once while the app was running, with no relaunch (measured on the user's iPad).

#### Notifications settings slice

**Scope**

- The Notifications section shows between Appearance and Panel.
- The Notifications section sets WebUI Notifications' popup settings, which keep their defaults until then:
  - Show popups, with the hint "Short messages over the player. The bell on the player lists them either way."
  - Under it, a collapsible Popup settings group, closed at first, with a chevron as Ambient mode settings has, and disabled while Show popups is off.
  - The group holds, in this order: Show popups for, the five kinds, each with its hint as in the mockup; Position; Show in fullscreen; and Show for, with the hint "Pointing at a popup keeps it. A warning stays until you close it."
  - Changing the position or the time shows a sample popup there, which the bell's list doesn't keep.
- The bell's list gains a Notification settings link, which opens the Settings tab at Show popups with Popup settings expanded.

**Traps**

- The notifications service reads the popup settings from `notifications.popups` once, when the page loads, and has nothing that changes them.

**Acceptance**

- The Notifications section sets each popup setting from its default, disables Popup settings while Show popups is off, and shows a sample popup when the position or time changes, in WebUI tests of the section.
- The bell's list's Notification settings link opens the Settings tab at Show popups with Popup settings expanded, in WebUI tests.
- The Settings tab shows Notifications between Appearance and Panel, in WebUI tests.
- After a page refresh, the popup settings are as they were, in WebUI tests of a page refresh.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone.

**Evidence**

- The notifications service gains `updateSettings`, which merges a change into the popup settings, the kinds one by one, sets `settings`, and keeps the whole set in `notifications.popups`, and `preview`, which shows the sample popup with the key `preview` and an entry of its own kind, `sample`, through the same path as any popup, so the cap applies and a second sample replaces the first in its place with its time started over, without adding it to the list, counting it, or relaying it. Popups showing stay when a setting changes; the position moves them, since the popups' host already renders it from `settings`.
- The Notifications section is `NotificationSettings` in `src/ui/SettingsTab.tsx`, between Appearance and Panel, with the mockup's wording. Popup settings is a `details` the browser opens and closes, with no `open` in the JSX, and its `fieldset` and each control in it are disabled while Show popups is off, since happy-dom doesn't disable the controls inside a disabled `fieldset`, and a click on one still toggles it (measured). The radio button list behind `Choices` is now `OptionList`, which also lists checkboxes for the kinds; the radio buttons' markup is unchanged.
- The bell's list's Notification settings, at its foot, closes the list, opens the Settings tab, and calls the settings service's new `revealPopupSettings`, whose count the section answers by opening Popup settings, scrolling its section into view, and focusing Show popups. The stylesheet takes the mockup's rules for the group, its chevron, which turns without motion under reduced motion, its fields, and the list's foot. The mockup needed no change.
- Tests: in `src/test/screens/settings.test.ts`, the defaults with Popup settings closed, each setting applying and kept as the next message shows (a favorite going only to the list and the badge with Your actions off, the popups' host moving, and nothing popping up with Show popups off), the group's ten controls disabled while Show popups is off, the sample popup at the new position with its time, replaced by a second change and absent from the list, the badge, and `last.log`, the bell's list's link opening Popup settings and focusing Show popups from an open and a closed panel, a page refresh keeping every popup setting, the section order, and the storage test's new key; in `src/test/notifications.test.ts`, `updateSettings`' merge, write, and effect on the next messages and their time, and `preview`. The full-page snapshot gains only the section and the list's foot.
- Each guarded part was broken in turn and its tests failed: the popup settings not kept (4 tests), not applied (6), the sample kept in the list (2), the group's controls not disabled (1), the link not opening Popup settings (1), a Position change showing no sample (1), and the section after Panel (1).
- `npm run verify` passed: the contracts are fresh, typecheck, 65 test files and 1347 tests, the build, and the build output check. The mockup's pages rebuilt unchanged and `node docs/mockups/reelroulette/build/check.mjs` and `check-milestones.ps1` passed. There are no C# changes.
- `CONTEXT.md`, `CHANGELOG.md`, and `docs/domain-inventory.md` follow.
- The spot check on a phone passed: the sample popup showed at the new position and said the new time, a favorite with Your actions off popped nothing up and the bell counted it, the bell's list's Notification settings landed on Show popups with Popup settings open, and the settings were kept after a refresh.

#### Release checks

- Manual: On a desktop browser and a phone, and as an installed app, every remembered setting is kept after a refresh and a browser restart, and the library search starts empty.
- Manual: As an installed app on iOS and Android, in the light and the dark theme, the status bar's text reads against the page.
- Manual: On a phone and an iPad, the field validation pattern's red icons, its tooltip, and a setting's saved check fade in and out, and with Reduce Motion on they show and hide at once.
- Manual: On a phone and an iPad, the sample popup shows at each of the six positions, clear of the player's controls and the indicator.

#### Not included

- Admin, a full-page view opened from the header's admin icon, which is WebUI Admin Section.
- Moving randomization mode to the Library tab, which is WebUI Library Tab.
- Widening Advance after to 1–3600 seconds, which is WebUI Autoplay Modes.
- The autoplay mode, a Settings tab entry beside Advance after, which is WebUI Autoplay Modes.
- The volume step and Enhanced audio, which is WebUI Volume and Enhanced Audio.
- Loudness normalization's settings in the Audio section and the update to Enhanced audio's description, which is WebUI Loudness Normalization.
- Hide player controls, and Ambient mode (on by default) with its expandable Ambient mode settings section, added with the effect, which is WebUI Player Controls and Ambient Mode.
- The seek step and the shortcut reference, which is WebUI Keyboard Shortcuts.

### M12f8 - WebUI Notifications

- **Status**: ✅ Complete
- **Goal**: The WebUI's status line gives way to notifications: lasting states show on the player's indicator, one-off messages pop up briefly, and a bell lists recent messages, while what the user must notice or act on stays in the in-app dialog or the field it is about.
- **Depends on**: WebUI Field Validation Pattern, whose pattern the field messages move to, and WebUI In-App Dialogs, whose notice the dialog messages move to, and Catalog Open and Backup Safety, whose library states and messages the list's Now shows.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The WebUI's message rule:
  - A lasting state shows on the player's indicator.
  - A one-off message pops up briefly, and the list behind the bell keeps it.
  - Anything the user must notice or act on shows in the in-app notice, as WebUI In-App Dialogs sets out, and the list keeps it too.
  - A field problem shows in its field, with the pattern from WebUI Field Validation Pattern, and the list doesn't keep it.
  - An error already shown in place, such as in the Library tab's preset dropdown or the library's body, stays there and doesn't pop up.
- The status line stays until the Popups and bell slice removes it, and each slice before that takes its own messages off it, so no message goes unshown between slices.
- A message that moves to a dialog keeps its `last.log` line with the same text, as the notice in WebUI In-App Dialogs is relayed, and a popup or lasting state relays its text as a status line message is relayed today.
- "A player under 600 px wide" is one rule, a player narrower than 600 px, for the indicator and the popups at the top alike.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Server contracts | ✅ Complete | `/api/version` reports the library state, favorite and blacklist carry the device's `clientId` into `itemStateChanged`, and the refresh status lists the sources a run kept. |
| Messages to the notice | ✅ Complete | What the user must act on moves from the status line to the in-app notice, a 401 shows only the pairing prompt, JSON reads check the content type, Auto Tag and tag saves report their own errors, and a library timeout and a kept source get their own messages. |
| Player indicator | ✅ Complete | One lasting state at a time shows on the player's indicator at every width, by the precedence rule, in place of the status line. |
| Popups and bell | ✅ Complete | One-off messages pop up by kind, the bell lists them with the lasting states and notices, and the status line is gone. |

#### Server contracts slice

**Scope**

- `/api/version` adds `libraryState` and `libraryMessage`, as `/control/status` reports them, a contract change that only adds, so the WebUI learns the library state from a route the server answers without a library.
- The favorite and blacklist requests send the device's `clientId`, as random picks and plays already do, and `itemStateChanged` carries it back as `clientId`, the client that made the change, both contract changes that only add.
- The refresh status and its `refreshStatusChanged` event list the sources a run kept because their folder listed no media files while the library held items from them, each with its source id and item count, a contract change that only adds.
- The contract changes only add fields, so the last desktop build keeps working.
- The kept sources travel in a field rather than in a stage message's text, which the desktop parses.
- The field carries source ids rather than folders, since the event goes to every client.
- OpenAPI, the generated contracts, and `docs/api.md` describe the new fields.

**Traps**

- Only `/control/status` reports `libraryState` and `libraryMessage`, and it needs the control token from another machine.
- Without a library, `ServerStateService` has no catalog (`ServerHostComposition.cs` registers it with none), so it can't report the library state; `/control/status` reads it from `LibraryCatalogHost`.
- The `/api/version` handler is an inline lambda in `ServerHostComposition.cs` that no test calls. `/api/capabilities` answers with its own object, not `VersionResponse`.
- The server sends `itemStateChanged` to every device, the one that made the change too, and the payload names no client (`PublishExternal` in `ServerStateService.cs`), so today a device's own favorite shows "Added to favorites" and then "Synced: Added to favorites: {file}". The favorite and blacklist requests send no `clientId`, and the server publishes the event before it answers the request, so the event can arrive before the response.
- A refresh that keeps a source's items because its folder lists no media files writes only a `last.log` warning; no client hears of it.
- `CloneStatus` in `RefreshPipelineService.cs` copies the refresh status field by field, for `GET /api/refresh/status` and the published event alike, so a field it doesn't copy never leaves the server.
- The desktop parses the refresh stage messages for its status line (`BuildSourceRefreshSummary` in `MainWindow.axaml.cs`).
- The desktop reads the version, item state, and refresh status without strict member handling, so added fields don't break it.
- `AssertMatchesSchema` in the core tests requires a payload's top-level property names to equal its OpenAPI schema's exactly, so a C# type and `openapi.yaml` change together.
- WebUI tests check the favorite and blacklist request bodies exactly (`src/test/player.test.ts` and `src/test/screens/player.test.ts`).

**Acceptance**

- `/api/version` reports `libraryState` and `libraryMessage`, with and without a library, in server tests of the version route, and OpenAPI and the generated contracts list them.
- `itemStateChanged` carries the favorite or blacklist request's `clientId`, and none when the request sends none, in server tests of the favorite and blacklist routes, and OpenAPI and the generated contracts list both fields.
- The WebUI's favorite and blacklist requests send its `clientId`, in WebUI tests of the request bodies.
- The refresh status and `refreshStatusChanged` list each source a run kept because its folder listed no media files, by its source id with its item count and no folder, in server tests of a run with such a source, and OpenAPI and the generated contracts list the field.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- `/api/version` is `GetVersion` in `ServerHostComposition.cs`, an `internal static` handler in place of the inline lambda, and takes `libraryState` and `libraryMessage` from `LibraryCatalogHost`, as `/control/status` does. `/api/capabilities` is unchanged.
- The favorite and blacklist routes pass the request's `clientId` through `PublishItemState` onto `itemStateChanged`, trimmed as random picks and plays trim theirs, so a blank one is null. The WebUI's `toggleFlag` in `src/playback/player.ts` sends `store.identity.clientId`; nothing in the WebUI reads the event's yet.
- Where source refresh keeps a source whose folder lists no media files, `RecordKeptSource` in `RefreshPipelineService.cs` adds its id and kept item count to the run's status and publishes the status at once, and `CloneStatus` copies the list. Each run's status starts it empty.
- In `openapi.yaml`, `VersionResponse` gains `libraryState`, with `ControlStatusResponse`'s enum, and a nullable `libraryMessage`, both optional as they are there; `FavoriteRequest`, `BlacklistRequest`, and `ItemStateChangedPayload` gain a nullable, optional `clientId`, as `PlaybackRecordedPayload` has; and `RefreshStatusSnapshot` gains an optional `keptSources` of the new `RefreshKeptSource`, with a required `sourceId` and `itemCount`. Being optional, `keptSources` leaves the WebUI's snapshot code to the Messages to the notice slice, which reads it. The generated contracts, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, and `CONTEXT.md` follow.
- Server tests: the version route reports `ready` and no message with a library, and each of `newer`, `damaged`, `missing`, and `unreadable` with its message without one, each matching the `VersionResponse` schema (`LibraryUnavailableServerTests`, beside the library gate's tests, whose per-state seeding they share, rather than in `OpenApiRouteContractTests`); a favorite and a blacklist sent with a client id carry it, trimmed, and one sent with none or a blank one carries none (`ItemIdContractTests`); and the kept-source run's status and its last published event list `src-empty` with its 2 items and no folder, match the `RefreshStatusSnapshot` schema, and a second run, once the folder lists a file, lists none, while a run that only removes a missing file lists none (`RefreshPipelineServiceTests`).
- WebUI tests: the favorite and blacklist request bodies carry the device's client id, in the player's and the page's tests, which checked the bodies exactly.
- Each guarded part was broken in turn and its tests failed: `CloneStatus` dropping the list and the kept source never recorded (1 test each), the version route leaving out the library state (4 cases; with a library the default `ready` still passes), the client id left off the event or not trimmed (1 test each), the event's `clientId` missing from `openapi.yaml` (the schema check, 1 test), and the WebUI's body without it (2 tests).
- `dotnet build ReelRoulette.sln` passed with no warnings. `dotnet test ReelRoulette.sln` passed: 483 core, 421 desktop, and 7 server app tests. `npm run verify` passed: the contracts are fresh, 55 test files and 1046 tests, the build, and the build output check.
- Nothing looks different, so the mockup and `CHANGELOG.md` are unchanged; the changelog takes the milestone's user-visible change with the later slices.

#### Messages to the notice slice

**Scope**

- These status line messages move to the in-app notice, and the list keeps them once the Popups and bell slice adds it:
  - Playback: "No response from the server. Try again.", "Random selection failed ({status}).", "Random selection failed: {error}", "No eligible media for current filters.", "Video file not found.", and "Photo file not found.".
  - Library play: "Cannot play: server compatibility check failed.", which Play already shows in the notice, "Playback unavailable: no library item was selected.", "Media not found. The file may have moved or been deleted.", "This item is unavailable.", "This file type is not supported.", the server's error text, "Playback failed.", and "Playback failed: {error}".
  - Favorite and blacklist: "Favorite update failed ({status})." and "Blacklist update failed ({status}).".
  - Filter: "Filter load failed: {error}", "Filter refresh failed: {error}", "Saving presets failed ({status}).", "Saving presets failed: {error}", "Select a preset to update.", and "Preset not found.".
  - Tags: "Tag editor unavailable: {error}", "Tag refresh failed: {error}", "No tag changes to save.", and a failed tag save: "{step} failed ({status})" for Category update, Category delete, Tag create/update, Tag rename, Tag delete, Tag apply, and Auto-tag apply, "Tag apply failed", "Tag apply failed: {error}", or the error's text.
- "Unauthorized. Pair first." shows nowhere. A random pick or library play that the server answers with 401 also shows the header's pairing prompt, which is the thing to act on, so the prompt is the only signal. It keeps a `last.log` line, the one the page sends for every 401.
- A 401 on any request, what the Tags and Filter tabs load, saves, favorites, and Auto Tag's Apply included, shows only the header's pairing prompt, with no failure notice.
- The shared request helper handles every 401 once: it raises the prompt and throws an `UnauthorizedError`.
- The page sends one `last.log` line for each 401, "Unauthorized. Pair first. ({method} {route})", naming the request's route without ids, such as "POST /api/play/{itemId}".
- The server refuses that line from a device that isn't paired, as it refuses the request, so it doesn't reach `last.log`.
- `api.postJson` reads the tag model.
- A 401 shows no failure in place either, while the pairing prompt is up: the library's grid shows nothing, Auto Tag's status is empty with the before-scan placeholder, the preset dropdown keeps "Loading...", and the status line shows nothing for it, while the page sends the request's `last.log` line in place of the failure's.
- Pairing, whose 401 means a wrong token, sends past that handling and still says "Pairing failed.", and pairing against a server that can't be reached shows "Pairing failed: Couldn't reach the server." in the notice.
- A request that couldn't reach the server reads "Couldn't reach the server." in every message, whatever the browser calls it ("Failed to fetch", "Load failed", or "NetworkError when attempting to fetch resource."), mapped where the WebUI sends its requests.
- A notice whose text is already open doesn't open again, so a missing photo under Autoplay or Loop, whose timer runs on, or presses that fail the same way, don't stack notices. Each still relays its `last.log` line.
- When a random pick or library play ends without playing, the status line drops its "Loading..." without relaying a line, since the failure that used to replace it moves to the notice.
- A favorite or blacklist that fails on a network error shows "Favorite update failed: {error}" or "Blacklist update failed: {error}" in the in-app notice.
- A failed Auto Tag scan shows "Scan failed: {error}" in Auto Tag's own status, beside Scan Files, in place, and its results go back to the before-scan placeholder.
- Auto Tag's status leaves "Scanning…" when the scan finishes.
- A tag save shows its own error: "{step} failed ({status})" when the server refused a step, or "{step} failed: {error}" when the request failed, from the save that failed.
- The tag model's failures read "HTTP {status}", as the other JSON reads do, in place of "tag-editor model {status}" and "tag-model:{status}".
- A tag save that lands says so even when the library's reload after it fails, which the library reports itself.
- The library's body shows a failed load as "Library load failed: {error}", the text that leaves the status line.
- A library load answered with `408` or `504`, a timeout from the server or a proxy, shows its own message in the library's body in place of "Library load failed: HTTP {status}": "The server didn't answer in time, so the library couldn't load. It may be waiting on a slow or disconnected drive or share."
- A failed library load still shows on the status line too, until the Popups and bell slice removes it.
- The WebUI's refresh snapshot keeps the kept sources from the Server contracts slice.
- When a refresh keeps a source's items that way, the in-app notice says so with the folder, once per folder for the page's life.
- The notice waits until the refresh's source stage has finished, so one notice names every folder the run kept that the page hasn't named.
- For one folder, the notice reads "Library refresh found no media files in {source}, so it kept the library's {count} items from there. If the folder is on a drive or share, check that it's connected.".
- For several, it reads "Library refresh found no media files in {source} and {source}, so it kept the library's {count} items from them. If the folders are on a drive or share, check that it's connected.".
- Each source reads as the Filter tab labels it: its name and, when it differs, its folder.
- A single kept item reads "1 item".
- The kept-source notice's `last.log` line leaves the folders out, since relayed lines carry no paths; the server's own warning names them.
- The WebUI looks up each kept source's folder in the source list from `GET /api/sources`, which Source Access Policy limits to the sources each session may see, and loads that list when it hasn't yet.
- The mockup shows the timeout message, the kept-source notice, the library's body after a failed load, a failed Auto Tag scan, and a favorite and a tag save that couldn't reach the server, with their approved wording.
- The JSON responses that `getJson` in `src/state/appApi.ts`, the random pick in `src/playback/randomPick.ts`, `requestPlayItem` in `src/api/coreApi.ts`, the filter's tag model in `loadRemote` in `src/filter/filterDialog.ts`, and the tag editor's model and the Auto Tag scan in `loadModel` and `scan` in `src/tags/tagEditor.ts` read go through one helper that checks the content type and reports a clear error: "The server sent an unexpected response ({content type}).".

**Traps**

- On a phone on its side the stylesheet hides the status line (`body.short-screen .status` in `src/styles.css`), so until they move to the notice, the messages sorted as a dialog, such as "No eligible media for current filters." after Play, show nothing there.
- The playing video's `playing` event sets the status to "Playing". On a connection where the video keeps buffering, that hides "Loading..." while a random pick waits and "No response from the server. Try again." after one times out.
- `pickRandom` in `player.ts` and `play` in `library.ts` set the pairing prompt just before "Unauthorized. Pair first.". The 401 case in `mapPlayItemErrorToStatus` is never reached, since `play` handles 401 first.
- The tag model requests in `loadModel` in `src/tags/tagEditor.ts` and `loadRemote` in `src/filter/filterDialog.ts` go through `api.post`, which doesn't show the pairing prompt on a 401, so one shows "Tag editor unavailable: tag-model:401" or "Filter load failed: tag-editor model 401".
- Only `getJson` raised the pairing prompt on a 401, and a random pick and a library play each raised it themselves; a 401 on a favorite, a save, or Auto Tag's Apply showed its failure without the prompt.
- `pair` in `src/state/serverConnection.ts` doesn't catch its request, so pairing against a server that can't be reached leaves an unhandled rejection and shows nothing.
- `toggleFlag` in `src/playback/player.ts` doesn't catch a favorite or blacklist request that fails on a network error, and `press` in `src/ui/Player.tsx` drops its promise, so it shows nothing and leaves an unhandled rejection.
- "Select a preset to update." can show: Update Preset isn't disabled while no preset is chosen.
- Tests lock today's three wrong Auto Tag and tag save messages below as they are, marked as recorded in this milestone.
- A failed Auto Tag scan shows "Scan complete: no matching tags found." in Auto Tag's status and "No file names contain any tag's name." in its results, as a scan that found nothing does: `scan` in `src/tags/tagEditor.ts` treats a failure as no rows.
- Before the WebUI Preact Migration, `app.js` set "Auto-tag scan failed. Core runtime is unavailable or still recovering." and overwrote it at once.
- A scan where every match already has its tag shows "No rows to show." and leaves Auto Tag's status on "Scanning…": `autoTagStatusAfterChange` in `src/tags/autoTagModel.ts` keeps the status while no row shows.
- A tag save that cannot reach the server shows the message of the last step the server refused on the page, or "Tag apply failed" when none was: `lastSaveError` in `src/tags/tagEditor.ts` lasts for the page.
- When the library's reload after a landed tag save throws, `saveInBackground` in `src/tags/tagEditor.ts` shows the reload's error in place of "Tag editor changes applied".
- `getJson`, the random pick's `request` in `src/playback/randomPick.ts`, `requestPlayItem` in `src/api/coreApi.ts`, `loadRemote` in `src/filter/filterDialog.ts`, and `loadModel` and `scan` in `src/tags/tagEditor.ts` call `response.json()` without checking the content type, so an HTML error page from a proxy surfaces as a `SyntaxError`. Pairing reads no JSON, and refresh status arrives only over the event stream.
- The library's body shows only a failed load's error, such as "HTTP 500" (`libraryOverlayMessage` in `src/library/libraryOverlayModel.ts`), and a load that fails while the Library tab is hidden reaches only the status line; the tab loads again when it opens.
- Kestrel answers `408` when a request's headers or body don't arrive within its timeouts, and `getJson` turns it into "HTTP 408", so a server stalled on its storage showed "Library load failed: HTTP 408" (measured).
- Auto-refresh runs every 15 minutes by default, so a notice on every run would show four times an hour.
- The refresh status keeps a run's kept sources until the next run starts, so every later `refreshStatusChanged` in that run, and `GET /api/refresh/status`, repeat them.
- `coerceRefreshSnapshot` and `normalizeSnapshot` in `src/events/refreshStatusProjection.ts` rebuild the snapshot field by field, so they drop a field they don't copy.
- The WebUI loads the source list into `store.sources` only for the Filter tab (`loadRemote` in `src/filter/filterDialog.ts`) and the Filters line (`loadSourcesForSummary` in `src/library/library.ts`), so it may not be loaded when a refresh keeps a source.
- The server adds a kept source to the refresh status as it reaches it, so a run that keeps several publishes them one at a time.
- The unit tests' local `json()` helpers answer with `text/plain`, as `new Response(JSON.stringify(...))` does, so a content type check fails 102 unit tests in 7 files until they set `application/json`; the page harness's already does (measured).
- `runTagEditorSave` in `src/library/tagSave.ts` catches a step that throws and drops its error.
- The photo's timer runs on after the photo fails to load (`playCurrent` and `photoFailed` in `src/playback/player.ts`), and the server's random pick doesn't check that files exist, so Autoplay through missing photos fails once every photo duration.
- Browsers word a request that couldn't reach the server differently: "Failed to fetch" in Chrome, "Load failed" in Safari, and "NetworkError when attempting to fetch resource." in Firefox, each a `TypeError` (inferred).
- A random pick and a library play set "Loading..." before their request, and only the failure text or "Playing" replaces it.
- `/api/version` needs pairing, as every route but `/api/pair` does (`ServerPairingAuthMiddleware.cs`), and `loadVersion` in `src/state/serverConnection.ts` shows "Ready (API offline)" for any failure, so a device that isn't paired shows it at every page load.
- `/api/logs/client` needs pairing too, so the server refuses a relayed line from a device that isn't paired, and `relayLog` in `src/state/appApi.ts` ignores the refusal. The page harness's fake server doesn't check pairing.
- `loadSourcesForSummary` in `src/library/library.ts` relays `library=filter-summary-sources-failed` for any failure of the source list.

**Acceptance**

- Each message sorted as a dialog shows in the in-app notice with the same wording, not on the status line, and its `last.log` line is unchanged, in tests that each screen's dialog messages show in the notice with their `last.log` lines.
- A random pick or library play answered with 401 shows the header's pairing prompt, shows "Unauthorized. Pair first." nowhere, and sends the request's `last.log` line, naming its route, in tests of a 401 on a random pick and a library play.
- A 401 shows no failure in place, with nothing on the status line and the request's line sent, naming its route, in tests of a 401 on the version check, a library load and a browse, an Auto Tag scan, and the presets.
- A 401 on the source list logs no failure of its own, for the kept-source notice or the Filters line, in a test of each.
- A 401 on any request shows only the header's pairing prompt and no failure notice, and sends one `last.log` line naming its route without ids, in tests of the shared request helper and of a 401 on the Tags tab's and the Filter tab's tag model, the Filter tab's sources, a favorite and a blacklist, a presets save, a tag save, and Auto Tag's Apply.
- Pairing that couldn't reach the server shows "Pairing failed: Couldn't reach the server." in the notice with its `last.log` line, whatever the browser calls the failure, and a wrong token's 401 still "Pairing failed.", in tests of each.
- A request that couldn't reach the server reads "Couldn't reach the server." whatever the browser calls it, in tests of Chrome's, Safari's, and Firefox's wording.
- A notice whose text is already open doesn't open again, and still relays its line, in tests of the dialogs and of a missing photo under Autoplay.
- The status line doesn't stay on "Loading..." after a random pick or library play that ends without playing, in tests of a failed pick and play.
- A favorite or blacklist that fails on a network error shows its failure in the in-app notice, in tests of a network error on each.
- A failed Auto Tag scan shows its error instead of "Scan complete: no matching tags found." and the results' "No file names contain any tag's name.", in a test that replaces the one locking it today.
- A scan where every match already has its tag clears "Scanning…", in a test that replaces the one locking it today.
- A tag save that fails on a network error shows that error, not one from an earlier save, in a test that replaces the one locking it today.
- A tag save that lands says so when the library's reload after it fails, in a test of that reload failing.
- A response that isn't JSON, such as a proxy's HTML error page, shows "The server sent an unexpected response ({content type}).", not a `SyntaxError`, in tests of such a response for `getJson`, the random pick, a library play, the filter's tag model, the tag editor's model, and an Auto Tag scan.
- A library load answered with `408` or `504` shows the timeout message in the library's body, and any other failed load "Library load failed: {error}", in WebUI tests of the library load's failures.
- A kept source shows the in-app notice with its folder from the source list once per folder for the page's life, one notice for the folders a run kept, in WebUI tests of the kept-source notice with the source list loaded and not yet loaded and with one and several folders.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

**Evidence**

- The requests go through `src/api/serverRequest.ts`: `sendRequest` turns a fetch `TypeError` into `ServerUnreachableError` ("Couldn't reach the server.") and passes a cancelled request's `AbortError` on, and `readJson` takes `application/json` and `application/*+json` with any parameters and otherwise throws `UnexpectedResponseError`, also for a JSON-labelled body that doesn't parse; `HttpStatusError` carries the status as "HTTP {status}", and `UnauthorizedError` the 401. `appApi`'s `post` and `getJson` and the new `postJson`, the player's random pick send, and `requestPlayItem` use them. The unit tests' local `json()` helpers now answer `application/json`.
- `store.clearStatus` empties the status line, relaying nothing, while it still shows a message, which a random pick, a library play, and a missing video or photo use for "Loading...". `dialogs.notice` returns the open notice's promise for a message already open, and still relays it.
- The player's and the library's failures, and the Filter and Tags tabs' load, save, and preset failures, call `dialogs.notice` with the text and log text the status line had; the library takes `dialogs` from `appServices.ts`. A 401 on a random pick or library play shows and relays nothing of its own, the request having raised the prompt and sent its line, and the unreachable 401 branch in `libraryPlayModel.ts` is gone. A favorite or blacklist whose request fails now shows "Favorite update failed: {error}" or "Blacklist update failed: {error}", where it was an unhandled rejection. Acknowledgments stay on the status line.
- `loadRemote` and `loadModel` read the tag model, and `scan` the Auto Tag scan, through `postJson`, so their failures read "HTTP {status}", and the Filter and Tags tabs show no notice for an `UnauthorizedError`, the Filter tab's `/api/sources` 401 included. A failed scan sets the Auto Tag state back to before any scan with "Scan failed: {error}" as its status, which `autoTagStatusAfterChange` keeps through selection changes, so it needs no field of its own, and a scan sets its own summary, which replaces "Scanning…". `runTagEditorSave` takes a client whose `post` answers taken or refused with a status and whose `label` names a step, rather than importing the labels from `tagEditorModel.ts`, which imports it, and returns the failed step's own error; `lastSaveError` is gone. A landed save ignores a reload that rejects and says "Tag editor changes applied". The auto-tag apply result is still read leniently.
- The library session keeps a failed load's `errorStatus`, read off the error, and `libraryOverlayMessage` shows the timeout message for 408 and 504 and "Library load failed: {error}" otherwise; `LIBRARY_OVERLAY_FETCH_ERROR`, which nothing reached, is gone. `src/ui/LibraryOverlay.tsx` needed no change.
- `coerceRefreshSnapshot` and `normalizeSnapshot` keep `keptSources`, `settledKeptSources` gives them once the source stage has completed or the run has stopped, and `serverConnection.ts` emits `refreshKeptSources` with them, once per run and list of ids. The library's `noticeKeptSources`, one event at a time, loads the source list through a shared `loadSources`, which now always writes `store.sources` so a list lacking a source is replaced, names each folder once per page load, and remembers a source a freshly loaded list still lacks, so it doesn't load again for it; when the list can't load it relays `library=kept-sources-list-failed` and tries again on the next event. `src/library/keptSources.ts` builds the message with the Filter tab's `sourceLabel`, and its log text is "Library refresh kept the items of sources whose folder listed no media files". A single kept item reads "1 item", which the approved wording didn't cover, in the mockup too.
- The mockup's Mockup tab sets how the library load goes (loads, fails with HTTP 500, or times out), and its Events send a refresh that keeps one or both sources; its Auto Tag scan fails while the server reconnects, and its Favorite and tag Save while reconnecting, like its other requests then, read "Couldn't reach the server."; its notices don't open again while the same one is open. Its check has new checks for the library body's failure and timeout, the kept-source notice for one folder, a later one naming only the new folder, none once both are named, and several in one notice, a failed scan in place, a second Favorite while reconnecting opening no second notice, which failed with the mockup's de-duplication removed, and the network wording.
- Tests: `src/test/serverRequest.test.ts` (each browser's wording, a cancelled request, content types, a body that doesn't parse), `appApi.test.ts` (the error types, `postJson`, a server that can't be reached), `dialogs.test.ts` (a notice already open), `appStore.test.ts` (`clearStatus`), `keptSources.test.ts`, and the player, library, overlay, session, projection, connection, Filter, Tags, Auto Tag, and tag save unit and screen tests for every moved message with its notice and `last.log` line, the 401s, the network and non-JSON errors, the library loads, the kept-source notice, and the missing photo under Autoplay. The three tests that locked the wrong Auto Tag and tag save behavior are replaced. The library snapshot's error body is now "Library load failed: HTTP 500". "Preset not found." has no test, since the Filter tab's preset name always comes from its list. The screen test of the 10-second timeout leaves its notice open, since `closeNotices` waits on timers the test has faked.
- Each fix was broken in turn and its tests failed: the network failure left unmapped (10 tests), the content type unchecked (1, a JSON body labelled `text/plain`; a body that isn't JSON still fails to parse and reads the same), notices stacking (2), a pick leaving "Loading..." (9), a pick's 401 showing its text (2), a favorite's network error uncaught (2), a pick's and a library play's failure on the status line (3 and 8), no timeout message (5), the body without "Library load failed:" (8), kept sources not waiting for the source stage (2), a folder named again (1), the snapshot dropping kept sources (2), a 401 opening a notice in the Filter and Tags tabs (4 and 2), a Filter failure on the status line (2), a failed scan reading as no matches (9), a scan keeping "Scanning…" (2), a save's error not its own (4), and a landed save showing the reload's error (1).
- Every 401 is handled once, in `createServerRequester` in `src/api/serverRequest.ts`, which `appApi` builds with the page's `onUnauthorized` and offers as `api.request`: it raises the pairing prompt with the request's route and throws an `UnauthorizedError`. `requestRoute` names the route by its method and path from `/api/`, without the server, a path the server is reached under, or the query, and with `{itemId}` for `/api/play/`'s id, the only id the WebUI sends in a path; the page's `onUnauthorized` sends "Unauthorized. Pair first. ({route})" through `store.relayStatus`, the one line for any 401, which the server refuses from a device that isn't paired, since `/api/logs/client` needs pairing too; the tests' fake servers don't check pairing. `post`, `getJson`, `postJson`, the random pick, and a library play send through it, so the player and the library no longer take a `fetch` of their own or set the prompt themselves. A favorite or blacklist, a presets save, and a tag save or Auto Tag Apply, whose `runTagEditorSave` result then has no error, show no notice for it; the save still puts back the tags and the Apply its rows. Nothing shows a 401 in place either: the library's grid is blank, its status line message ("Library load failed: Unauthorized", or "Library browse failed. Showing the tiles already loaded." with tiles loaded) is neither shown nor relayed, by the failed request's status, which the library session now passes with the message, Auto Tag's status is empty with the before-scan placeholder, and the preset dropdown keeps "Loading..." with nothing sent but the request's line. Pairing sends with `sendRequest`, so a wrong token still says "Pairing failed.", and catches a request that fails, which says "Pairing failed: {error}". The mockup's pairing fails the same way while its server is stopped.
- Those were broken in turn too, and their tests failed: the helper not handling 401 (12 tests), a favorite's, a presets save's, and a tag save's 401 showing a failure (1, 1, and 3), pairing not catching a failed request (2), and pairing through the 401 handling (1), and the library's grid, its status line, Auto Tag's status, and the preset dropdown each showing a 401 (3, 2, 2, and 2).
- Before the route was passed and relayed, 17 tests failed: the helper and `appApi` naming no route (2), the pick's, the play's, and the library load's and browse's lines (3 unit tests), and the page's line for a 401 on a random pick, a favorite and a blacklist, the library load, the presets, a library play, the Filter tab's tag model and sources, a presets save, the tag model, a tag save, Auto Tag's Apply, and an Auto Tag scan (12 screen tests); the tests of the pick, a play, the library load and browse, and the presets also check that their old lines are gone.
- A 401 on the version check leaves the status line as it was, where `loadVersion` showed "Ready (API offline)" for any failure, and `loadSources` in `library.ts` reports a 401 apart from a failure, so neither the kept-source notice nor the Filters line relays its warning for it. With each broken in turn, their tests failed (2 and 1). The screen tests of a version check answered 401, which waited for "Ready (API offline)", now wait for the 401's line.
- While the mockup's "The server asks for pairing" option is on, its requests show only the prompt, as the app's answer 401: the grid shows nothing, the presets stay on "Loading...", the Tags tab shows no tags and the Filter tab's sections nothing, an Auto Tag scan leaves its status empty, and a pick, a play, a favorite, Filter Refresh and Apply, and Tags Save show no notice and change nothing; once paired, they load. Its check has 6 new checks at each width, of which 4 failed with the mockup's pairing state taken out.
- Docs updated: `CONTEXT.md`, `CHANGELOG.md`, `docs/domain-inventory.md`, and the mockup.
- `npm run verify` passed: the contracts are fresh, 57 test files and 1145 tests, the build, and the build output check. `node docs/mockups/reelroulette/build/check.mjs` passes 947 checks, two of them new for pairing while the server is stopped and 12 for a server that asks for pairing.

#### Player indicator slice

**Scope**

- The player's indicator, today's "Reconnecting…" indicator extended to every width:
  - It shows one lasting state at a time, the first active one in this order, which is the precedence rule, so it never alternates: Reconnecting…, Server not compatible, Running without a library, Loading…, and a library refresh.
  - Reconnecting… shows while the event stream is lost or the server can't be reached, which today's "SSE reconnecting..." and "Ready (API offline)" report. The WebUI checks `/api/version` again each time the event stream opens or fails, and Reconnecting… ends only once the stream is open and that check succeeds.
  - Server not compatible shows while the server fails the compatibility check. Its full message ("Unsupported server API version: {version}.", "Server requires client API version {version} or newer.", or "Server missing required capabilities: {list}.") shows in the Library tab, and from the Popups and bell slice in the list's Now, and Play's notice stays.
  - Running without a library shows while `/api/version` reports a library state other than ready. The server's message for its library state (newer, damaged, missing, or unreadable) shows in the Library tab, and from the Popups and bell slice in the list's Now. While it shows, the event stream failing doesn't show Reconnecting…, since the server refuses the stream until it has a library. It ends when the stream opens and the version check reports the library ready.
  - Loading… shows while a random pick waits or the media loads, only after half a second, so a quick load shows nothing. The half second counts once, from the first wait until every wait ends, so a pick and its media load are one loading period.
  - A library refresh shows "Library refresh: {stage} ({percent}%)", and only while the player's controls show, since a refresh can run for hours.
  - It sits at the player's top center, and below the corner buttons on a player under 600 px wide.
  - At the top, it stays clear of the corner buttons on both sides, and a state too long for that ends in an ellipsis.
  - It hides while the server asks for pairing, whose prompt is the thing to act on.
  - It is a polite live region, and the percentage is hidden from screen readers, so each step of a refresh isn't announced.
- These status line messages move to the indicator: "Ready (API offline)" and "SSE reconnecting..." as Reconnecting…, the version and capability mismatches as Server not compatible, the server's library message as Running without a library, "Loading..." as Loading…, and "Core refresh: {stage} ({percent}%)" as "Library refresh: {stage} ({percent}%)".
- The WebUI checks `/api/version` one check at a time: an open or failure while a check runs asks for one more after it, and a check that gets no answer in 10 seconds counts as not reaching the server. While the stream is open and the last check didn't reach the server, it checks again every 3 seconds until one does, since nothing else asks for one then. A stream failure while the server asks for pairing checks nothing, since pairing checks the version itself, and one that comes before the first check has answered doesn't show Reconnecting…, since the library state isn't known yet. Nor does one while the last check was answered with 401, or one from before a pairing that succeeds, since the server refused a device that wasn't paired.
- `serverReady`, the presets load, and "Ready (API {version})" happen only when the server goes from not ready to ready, so checking again reloads nothing; ready means compatible and with a library. A check answered with 401 makes it not ready, so the check after pairing loads again what the 401s refused, as pairing did before.
- While the last check found no library, the WebUI holds back what it would load, as while the server fails the compatibility check: the Library tab shows "Running without a library. {the server's message}", the preset dropdown "Running without a library", the Filter and Tags tabs load nothing, the Filter tab's Refresh and Apply, the Tags tab's Save, and Auto Tag do nothing, the Tags tab's Refresh, which still asks to discard changes, loads nothing, and Play, and a tile's play, show the in-app notice "Cannot play: the server is running without a library.". A Filter or Tags tab that shows when a check finds the server ready loads then, keeping its changes, so one that started while the server had no library, a tab remembered open among them, loads once it has one.
- Server not compatible lasts until the page loads again, as today, since the event stream stops while it shows.
- Each lasting state relays its text to `last.log` once, when it starts showing on the indicator, and a refresh once per stage, where today "SSE reconnecting..." is relayed every second while the server is down and "Loading..." at every pick.
- Loading… holds start with a random pick that is sent, a library play, and every media load, history steps and photo restarts included, and end on the media's `playing`, load, or error, a rejected `video.play()`, a pause by the user or Auto-Pause, or the player detaching; stale attempts release nothing. Nothing times them out.
- The refresh state shows a stage's label: "Starting" before the first stage, "Refreshing sources", "Sorting names", "Fingerprinting files", "Scanning durations", "Scanning loudness", and "Generating thumbnails", in place of the server's stage message, which runs to 90 characters with counts. It clears on any refresh status that isn't running, and on `resyncRequired`, so a run that ended while the stream was down doesn't stay on the indicator.
- The status line keeps the refresh's finished summary, its failure, and "Core refresh idle." until the Popups and bell slice.
- "A player under 600 px wide" is a class the WebUI sets on the player column (`.player-col.is-narrow`) from its measured width, which the mockup uses too, in place of its container queries. On a short screen, the narrow position allows for the safe area.
- The live region stays in the page, and the state's box renders inside it only while one shows. The percentage is in its own `aria-hidden` span outside the text that ends in an ellipsis, the icons are `aria-hidden`, and the spin slows under reduced motion.
- The precedence rule is documented, in a Player indicator bullet in `CONTEXT.md` and the `lastingStates.ts` entry in `docs/domain-inventory.md`.
- The mockup's server without a library shows "Running without a library" in the preset dropdown and the Play notice above, in place of "Error loading presets" and "Random selection failed (503).", and its server that fails the compatibility check, or has no library, loads nothing into its Filter and Tags tabs, whose Filter Refresh, Apply, Save, and Auto Tag scan do nothing and whose Tags Refresh loads nothing, as in the app.
- The Release Specific check in `docs/checklists/testing-checklist.md` that pauses the server expects the indicator's Loading… and the in-app notice's "No response from the server. Try again." in place of the status line's messages.

**Traps**

- With the server stopped, the WebUI shows "library load failed: HTTP 503" only briefly before "SSE reconnecting..." (measured before promotion).
- The desktop alternates between "core runtime unavailable" and "core runtime is required to browse the library" with the server stopped (measured before promotion).
- The v0.14.1 release notes still list the WebUI status line flipping between messages as a known issue.
- `getJson` in `src/state/appApi.ts` throws `HTTP {status}` and drops the response body, so the server's library message in a 503 never reaches the status line.
- Without a library, the server refuses the event stream with 503, as it does every route but version, capabilities, pair, the web runtime, backup, and refresh settings, and client logs (`LibraryRouteGate.cs`), so today the WebUI reads it as a lost connection and shows "SSE reconnecting...".
- The WebUI checks `/api/version` at start, after pairing, and, until a check passes, each time the event stream opens (`loadVersion` and `onOpen` in `src/state/serverConnection.ts`), so a server that couldn't be reached at page load fires `serverReady` once it answers, and the presets load again. That part of checking again is done; once a check has passed, the stream opening or failing doesn't check again.
- "Ready (API offline)" shows for any version check that fails, a response that isn't JSON among them, except a 401 while the server asks for pairing, which shows only the pairing prompt.
- Today's indicator shows only on a phone on its side (`ReconnectingIndicator` in `src/ui/Player.tsx`), as a bare text node with no box of its own to end in an ellipsis.
- Whether the player's controls show is local state in `Player` (`controlsVisible` in `src/ui/Player.tsx`), changed only by a click or tap on the player, so nothing outside it can follow it.
- The mockup moves its indicator below the corner buttons by a container query on the media area at 600 px and under, and its top popups by a class set below 600 px, so at exactly 600 px they overlap.
- happy-dom applies no container query and its `ResizeObserver` never fires, so the tests can see only a class set from a measured width (measured).
- The WebUI never reads `libraryState`, so a server without a library passes the version check, and presets, the library, and the Filter and Tags tabs fail with HTTP 503 (measured).
- The event stream client retries every second on its own (`src/events/sseClient.ts`), and each failure relays "SSE reconnecting..." again, since the relay's repeat filter is one second (measured).
- `getJson` has no timeout, so a version check that hangs would keep `versionCheckInFlight` set.
- `pair` in `src/state/serverConnection.ts` runs the version check outside the first-pass latch, so a pairing can send `serverReady` a second time.
- A toggled `hidden` on a live region can lose its announcement, and today's indicator toggles it on the region itself.
- The server's refresh stage messages run 60 to 90 characters with counts (`UpdateStage` in `RefreshPipelineService.cs`).
- After a gap in the event stream, or a server restart, only `resyncRequired` arrives, and the WebUI never reads `GET /api/refresh/status`, so a refresh that ended meanwhile would stay showing.
- `photoFailed` and `videoFailed` are the only failures the player hears from its media; it listens for no `waiting` or `stalled`, and `video.play()` rejections are swallowed.

**Acceptance**

- With the server stopped, unavailable, or mismatched, or running without a library, while loading, and during a refresh, the indicator shows the first lasting state in the precedence order and does not alternate, in WebUI tests of the precedence rule for each lasting state alone and together.
- With the server running without a library or failing the compatibility check, the Library tab shows the server's message, in WebUI tests of the per-event messages.
- Without a library, the refused event stream shows Running without a library, not Reconnecting…, and the state ends when the library opens, in WebUI tests of the stream failing and opening with each library state.
- A server that couldn't be reached at page load and comes back ends Reconnecting… once the version check succeeds, and the page then loads, in WebUI tests of the version check on the stream opening; and a check that fails while the stream stays open is tried again every 3 seconds until one succeeds, in tests of the version check.
- A stream failure while the server asks for pairing sends no version check, and a pairing shows and relays no Reconnecting…, in tests of the version check; and a pairing after a check answered with 401 sends `serverReady` and loads the presets again once, in tests of the version check, and the Library tab's page too, in WebUI tests.
- Loading… shows only after half a second, counted once across a pick and its media load, a refresh's progress only while the controls show, and the indicator nothing while the server asks for pairing, in WebUI tests of the indicator.
- The indicator sits at the player's top center, clear of the corner buttons with a long state ending in an ellipsis, and below them on a player under 600 px wide, in WebUI tests of the indicator's placement.
- The indicator is a polite live region with its percentage hidden from screen readers, in WebUI tests.
- Without a library, Play and a tile's play show "Cannot play: the server is running without a library.", the preset dropdown "Running without a library", and the Filter and Tags tabs load nothing, and once the server has its library, a Filter or Tags tab that shows loads, keeping its changes, a tab remembered open included, in WebUI tests; and checking the version again loads nothing again, in tests of the version check on each stream open and failure.
- A refresh shows its stage's label and clears once it isn't running or on `resyncRequired`, in WebUI tests of the refresh progress.
- A lasting state relays its text once when it starts showing, not on each stream failure, in WebUI tests of the relay.
- A lasting state relays its text to `last.log` as a status line message is relayed today, and none of the indicator's messages shows on the status line, in WebUI tests of the relay.
- The precedence rule is documented, checked by reading it.
- The testing checklist's paused-server check expects the indicator's Loading… and the in-app notice, checked by reading it.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check with the server stopped.

**Evidence**

- `src/state/lastingStates.ts` computes the indicator from the store's signals in the precedence order, null while the server asks for pairing, and relays a state's text when its id or title changes, so a refresh relays once per stage; `appServices.ts` exposes it as `indicator` and starts a panel remembered open when the server turns out to have no library. The store gained the library state and message, `noLibrary`, the refresh progress, and the loading holds (`src/playback/loadingHolds.ts`), and lost `clearStatus`, which only "Loading..." used. `refreshProgress` in `src/events/refreshStatusProjection.ts` gives a running refresh's stage label and percent.
- `serverConnection.ts` checks the version at start and on each stream open and failure through one shared promise that runs once more when asked during a check, aborts a check after `VERSION_CHECK_TIMEOUT_MS` (10 seconds), and derives `store.reconnecting` from whether the stream has failed since it opened, the last check's result, and the library state. A compatible check sets the library state, reading a missing one as ready, and only the change from not ready to ready sets "Ready (API {version})", sends `serverReady`, and loads the presets, so `pair` no longer sends it twice and `start()` no longer loads presets before the check. The status line no longer shows "Ready (API offline)", "SSE reconnecting...", or the compatibility message, which is still relayed with its reason beside the indicator's "Server not compatible" line. The refresh handler sets the progress, and the status line only once a refresh isn't running; `resyncRequired` clears it.
- `filterDialog.ts` and `tagEditor.ts` hold back while the server is incompatible or has no library, where they held back only while incompatible; the Filter tab's Refresh and Apply hold back too, so a server that loses its library after the tab loaded neither shows a 503 nor posts.
- `Player.tsx`'s `PlayerIndicator` replaces `ReconnectingIndicator`: a full-size, unclickable live region (`#player-indicator`, `role="status"`, `aria-live="polite"`) that renders the state's box only while one shows, with `data-state`, `is-warning`, and `follows-controls`. `panelHost.ts` measures the player column (`attachPlayer`, `playerNarrow`, narrow below `NARROW_PLAYER_BELOW_WIDTH` = 600) in its `measure()`, its render, `setWidth`, and the column's own `ResizeObserver`, and `Stage.tsx` sets `is-narrow` in its existing effect. `styles.css` takes the mockup's indicator rules, with the short screen's narrow top allowing for the safe area.
- `player.ts` holds "pick" only for a pick it sends, releasing it after the media's hold starts; holds "media" in `playCurrent`; and releases it on the attempt's `playing`, load, or error, a rejected `play()` while the attempt is current, a pause by the user or Auto-Pause, and `releaseAll()` on detach. `library.ts` holds "play" for a tile's play. While there is no library, Play, a tap on the empty player, Next at the end of history, and a tile's play show `NO_LIBRARY_PLAY_NOTICE`, record-playback is skipped, and the Library tab shows `noLibraryText(...)`, queries nothing, loads no sources, and disables search and sort.
- The mockup's indicator keeps its live region in the page and hides only the box inside it, its narrow position and its mockup notes' follow the `.player-col.is-narrow` class in place of their container queries, its refresh starts at "Starting" and has "Sorting names", its server without a library shows "Running without a library" in the preset dropdown and the Play notice, and while that server or one that fails the compatibility check shows, its Filter and Tags tabs load nothing, their Filter Refresh, Apply, Save, and Auto Tag scan do nothing, and their Tags Refresh loads nothing, as the app's do. Its check passes 957 checks, with new ones for the live region, narrower than 600 px but not at 600, the no-library dropdown and notice, the held-back tabs in both situations, and the stage labels; each failed with its change undone (2 to 4 checks each).
- Tests: `loadingHolds.test.ts`, `lastingStates.test.ts` (each state alone and together, warnings, pairing, the relay once per start and stage), the stage labels in `eventsHelpers.test.ts`; the connection's checks, coalescing, timeout, reconnecting, library state, readiness transitions, presets, pairing, and refresh progress in `serverConnection.test.ts`; the held-back Filter and Tags tabs in their unit and screen tests; the holds in `player.test.ts`, `library.test.ts`, and `autoPause.test.ts`; the narrow measurement in `panelHost.test.ts`; the indicator's live region, precedence, hidden percentage, pairing, follows-controls opacity, placement, ellipsis, narrow class, and reduced motion in `screens/player.test.ts` and `screens/phone.test.ts`; and on the live page in `screens/foundation.test.ts`, a server that stops and comes back, one that couldn't be reached at page load, one without a library that gets one, and one that fails the compatibility check. The foundation snapshot's indicator markup is the new region.
- Each part was broken in turn and its tests failed: in the connection, 15 breaks, from the held-back guards to the readiness transition and the refresh progress (1 to 109 tests); in the indicator and Loading…, the last state shown in place of the first (5), pairing not hiding it (3), a relay per percent (1), no grace (3), the grace starting again on each hold (2), the server's stage message (2), the region hiding itself (1), the percentage announced (1), 600 px counted as narrow (2), the class never set (2), a rejected `play()` keeping Loading… (1), a pick letting go before its media held (1), the library loading without a library (1), and Play picking without one (2).
- After the review, as the user decided: a stream failure counts toward Reconnecting… only once a version check has answered, so a server without a library, or one that asks for pairing, whose refusal of the stream can arrive first, shows nothing before the check says why; while the stream is open and the last check didn't reach the server, `serverConnection.ts` checks again every `VERSION_RECHECK_MS` (3 seconds) until one does, and stops once the stream fails, the server fails the compatibility check, or the connection stops; a stream failure while the server asks for pairing sends no check; and the Filter and Tags tabs listen for `serverReady` and, while they show, load as Refresh does, keeping their changes, so a tab remembered open that started while the server had no library loads once it has one. The mockup re-renders its tabs when its server changes, so it already did. The store's computed `heldBack` replaces the six copies of the compatibility-or-no-library test, and `playRefusalNotice` in `lastingStates.ts` gives Play's and a tile's play's notice. `buildRefreshStatusMessage` lost its running branch, which nothing reached once a running refresh moved to the indicator, with its two tests. The test of a failed compatibility check ending Reconnecting… now fails the stream after the first check, since a failure before it no longer shows Reconnecting….
- Those fixes' tests failed without them: the stream refused before the first check answers (1), a stream failure checking while the server asks for pairing (1), the check again while the stream is open (1), and the Filter and Tags tabs loading on `serverReady`, in their unit tests (1 each) and screen tests of a tab remembered open (1 each).
- After the second review, as the user decided: a pairing that succeeds clears the stream's failures before the pairing prompt hides, and a stream failure while the last check was answered with 401 doesn't count toward Reconnecting…, so a pairing no longer shows Reconnecting… until the new stream opens nor relays it to `last.log`; and a check answered with 401 sets `serverReady` back to false, so the check after pairing sends `serverReady` and loads the presets again, and the Library tab loads a page its 401 refused, as pairing did before this slice. A screen test's dead assertion on "SSE reconnecting..." and its comment are gone.
- Those fixes' tests failed without them: a pairing showing no Reconnecting… in `serverConnection.test.ts`, without the pairing clearing the stream's failures (1) and without a 401 left out of them (1); and the pairing after a 401, in `serverConnection.test.ts` (1) and `screens/library.test.ts` (1).
- `npm run verify` passed: the contracts are fresh, 59 test files and 1216 tests, the build, and the build output check.
- After the spot check, as the user asked, the indicator's text no longer clips the tail of the "g" in "Reconnecting…": `.player-indicator-text`, whose `overflow: hidden` gives the ellipsis, clipped at its line box, which the font's descender reaches past at `line-height: 1.3`, so it takes `padding-block: 0.15em` and `margin-block: -0.15em`, which extend its clip box without making the pill taller, in `styles.css` and the mockup. The indicator's placement test and the mockup's check read both, alongside the ellipsis, and each failed without them.
- The spot check passed with the server stopped: the player said "Reconnecting…" and stayed on it, with nothing on the status line, cleared once the server came back with Play working, and moved below the corner buttons once the panel's handle made the player narrower than 600 px.
- Docs: `CONTEXT.md` has a Player indicator bullet with the precedence rule and its states, `docs/domain-inventory.md` describes the indicator, the measurement, the connection, and the two new modules, and the testing checklist's paused-server check expects Loading… on the indicator and the notice.

#### Popups and bell slice

**Scope**

- The main page has no status line.
- The mobile diagnostics line goes too, with its component, its rules, and its tests, since the mockup doesn't show it; WebUI Settings Panel shows its information in the Settings tab.
- The WebUI shows no Other devices popup for an event with its own `clientId`, so its own change pops up only as Your actions. An event without one, such as one from the desktop, counts as another device's.
- Popups:
  - A popup is a themed card with an icon for its kind, the message, an optional second line such as the file name, and Dismiss.
  - A message that the kind's icon would misread has its own: "Library browse failed. Showing the tiles already loaded." shows a sync problem icon, not the Connection kind's cloud with a check.
  - At most three show at once, newest nearest their edge.
  - The cap never closes a warning: a new popup closes the oldest that isn't one, and while three warnings show, a new popup goes to the list only, which the bell counts.
  - A popup with the same key, such as a second favorite change or a second skip, replaces the one showing and starts its time over.
  - Pointing at one with a mouse or pen, or keyboard focus on it, pauses its time, which runs again only once neither does.
  - A swipe to either side on a touch screen closes it.
  - A warning, such as a failed refresh, stays until it is closed.
  - At the bottom, popups rise above the player's controls while those show, unless the overlay panel covers the player.
  - On a player under 600 px wide, popups at the top start below the indicator.
  - They show over the overlay panel and in fullscreen, take no focus, and only their own boxes take the pointer.
  - While the list is open, new messages go to it and don't pop up.
  - While the list is open, a popup showing with a new message's key closes, since it would be out of date, and the list shows the new message.
- The bell and the list:
  - The bell sits at the player's top left, with its other controls, so it can be reached in fullscreen and on a phone on its side. It shows and hides with them.
  - The player's controls stay shown while the list is open.
  - The bell opens the list under it, lined up with its left edge, or with its right edge when the bell is in the right half of the screen, as the admin bar's is. The list sits inside the fullscreen stage, so it shows in fullscreen and iOS pseudo-fullscreen.
  - The list's Now shows each active lasting state with its full text, the server's compatibility and library messages among them.
  - Its Recent shows, newest first, every one-off message, whether it popped up or not, and every in-app notice, the kept-source notice among them, each with its time ("Just now", "{n} min ago", then the time of day).
  - It keeps the last 50 messages for the page's life, and a page refresh clears it.
  - The bell's badge counts the one-off messages that didn't pop up since the list was last open, and the list marks them. A notice, which the user saw in its dialog, joins the list unmarked, as the mockup does.
  - The list has Clear.
  - It closes on its Close, on the bell, on a press outside it, when the panel opens, or on Escape, which closes it before anything else. After Close, the bell, or Escape, focus returns to the bell; after a press outside or the panel opening, it stays where that put it.
- The popup settings, kept per device, which WebUI Settings Panel's Notifications section sets. Until then they keep their defaults:
  - Show popups, on by default.
  - The kinds that pop up: Your actions, Other devices, Library refresh, Skipped files, and Connection, each on by default.
  - Position: Bottom center, the default, Bottom left, Bottom right, Top center, Top left, or Top right.
  - Show in fullscreen, on by default. Off, entering fullscreen closes the popups showing, and in fullscreen messages go only to the list, which the bell counts.
  - Show for: 3, 5, the default, or 10 seconds.
- The rest of the status line's messages, from `src/state/serverConnection.ts`, `src/events/refreshStatusProjection.ts`, `src/playback/player.ts`, `src/library/library.ts`, `src/library/libraryQuerySession.ts`, `src/filter/filterDialog.ts`, and `src/tags/tagEditor.ts`, sorted by the rule:
  - No message, since the normal state needs none: "Ready", "Ready (API {version})", "Playing", and "Core refresh idle.". Each still relays its text to `last.log`, so it keeps its page-load and version-check lines.
  - Popups, by kind:
    - Connection: "SSE connected" becomes "Reconnected.", shown only after Reconnecting… showed; and "Library browse failed. Showing the tiles already loaded.".
    - Library refresh: the "Core refresh complete | …" summary becomes "Library refresh finished", with the summary's segments after it, joined by " · ", on its second line; and "Core refresh failed: {error}" becomes the warning "Library refresh failed", with the error on its second line.
    - Other devices: "Synced: Added to favorites: {file}", "Synced: Removed from favorites: {file}", and "Synced: Blacklisted: {file}" become "Added to favorites on another device", "Removed from favorites on another device", and "Blacklisted on another device", with the file name on the second line. An item leaving the blacklist, which today also reads "Synced: Removed from favorites: {file}", becomes "Removed from blacklist on another device", told apart by the event's `previousIsBlacklisted`.
    - Your actions, the acknowledgments of the user's own actions, with today's wording: "Added to favorites", "Removed from favorites", "Blacklisted", and "Removed from blacklist", with the file name on the second line, "Filters applied.", "Filter data refreshed.", "Updated preset "{name}" locally — Apply to save.", "Paired.", and "Tag editor changes applied". They are not the rule's confirmations, which are prompts that ask before an action.
  - In place, with no popup: "Error loading presets: {error}", which the Library tab's preset dropdown shows as "Error loading presets".
  - A dialog, moved by earlier milestones, which this milestone checks show nowhere else: "Pairing failed." and "Pairing blocked by server compatibility check." in WebUI Responsive Layout and Panels.
  - Field validation, moved by earlier milestones, which this milestone checks show nowhere else: "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.", "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.", "Enter a preset name.", "A preset with that name already exists.", and "Tag name is required." in WebUI Field Validation Pattern, "That name is already in use." in WebUI In-App Dialogs, and "Pair token required." in WebUI Responsive Layout and Panels, where Pair is disabled while the token is empty.
- A field message is no longer relayed.
- Messages that other milestones add follow the rule from the start, and this milestone checks those already shipped against it. The skips Browser-Playable Filter adds are Skipped files popups, with the file name on the second line.
- The per-event messages are documented, in `CONTEXT.md`.
- A notifications service (`src/notifications/notifications.ts`) holds the entries, the badge's count, the popups showing, the list's state, and the popup settings, read per device from `notifications.popups` with each field falling back to its default; nothing writes them until WebUI Settings Panel.
- The list records each notice when it opens, unmarked and with the error icon, as the mockup does; a notice already open isn't recorded again.
- The list's Now gives each lasting state a second line: Reconnecting… "The connection to the server was lost. ReelRoulette keeps trying.", Server not compatible its full message, and Running without a library the server's message.
- A popup relays its text, with no file name: another device's change relays its new text in place of "Synced: …", "Library refresh finished" relays its summary's segments, as the status line relayed its counts, and "Library refresh failed" no error.
- "Reconnected." pops up when Reconnecting… ends, since the stream opens before the check that ends it; each stream open still relays "SSE connected", which shows nothing. "Error loading presets: {error}" and "Library load failed: {error}", shown in place, only relay too.
- The store's `status` signal and `setStatus` go with the status line; `relayStatus` stays.
- The player's controls show while the list is open by rendering `controls-visible` while either their own state or the list says so; lifting that state out of `Player` is WebUI Player Controls and Ambient Mode's, with its hide timer.
- `.player-col` takes `position: relative`, so the popups sit in the player column, and keeps `overflow: hidden`, which clips only a popup's shadow, or one being swiped, at the column's edge. The stage has a `covers-player` class while the overlay panel is open.
- `stageFullscreen` tells whether the stage is in fullscreen, native or pseudo, following `fullscreenchange`, for Show in fullscreen.
- The list takes Escape and a press outside in the capture phase, Escape not while an in-app dialog is open, and is not a `<dialog>`.

**Traps**

- `itemStateChanged` in `src/playback/player.ts` reads any event that leaves an item neither favorite nor blacklisted as "Synced: Removed from favorites: {file}", an item leaving the blacklist too.
- The server sends `itemStateChanged` to every device, the one that made the change too, with the request's `clientId`, which nothing in the WebUI reads yet, so today a device's own favorite shows "Added to favorites" and then "Synced: Added to favorites: {file}".
- The server publishes `itemStateChanged` before it answers the favorite or blacklist request, so the event can arrive before the response.
- The favorite and blacklist acknowledgments carry no file name today.
- The status line component also holds the mobile diagnostics line (`MobileDiagnostics` in `src/ui/StatusLine.tsx`), which shows the client id, session id, and client type, on a mobile browser only.
- A z-index, containment, or `container` on the element that holds the popups beside the player makes a stacking context that keeps them under the overlay panel; the mockup's first version did this (measured).
- The player clips what it holds (`overflow: hidden` on `.media-container` in `src/styles.css`), so the popups sit beside it, not inside it.
- The player column (`.player-col` in `src/styles.css`) sets no `position`, so popups placed in it take the stage as their containing block.
- The WebUI's player controls stop a click from reaching the player (`onClick` on `#overlay-controls` in `src/ui/Player.tsx`), so a bell among them, pressed with nothing playing, starts no random pick.
- In the mockup, a press on the bell with nothing playing starts no random pick (measured).
- The fullscreen module tells only whether pseudo-fullscreen is on (`pseudo` in `src/playback/stageFullscreen.ts`), and nothing follows the browser's `fullscreenchange`.
- The stage takes Escape on the document as it bubbles (`Stage.tsx`), closing the panel or leaving pseudo-fullscreen, so the list has to take it first.
- The field messages listed as moved by earlier milestones no longer exist in that wording: the field pattern's tooltips say what a field expects, such as "Use MM:SS, HH:MM:SS, or seconds.".
- The screen tests that mount the page wait for status line text, such as "Ready (API 1)", before they start.
- 24 calls still set the status line, in 7 files; "Library load failed: {error}" among them isn't sorted above, and shows in place in the library's body (measured).
- `.player-col` has `overflow: hidden` and no `position`, carried over from the old `main` rule with no stated reason.
- happy-dom passes `pointerType`, fires `focusin` and `focusout`, and delivers pointer moves with `clientX`, and fake timers drive `setInterval`, so the popups' pause and swipe and the list's times can be tested (measured).

**Acceptance**

- With the server running without a library or failing the compatibility check, the list's Now shows the server's message, in WebUI tests of the per-event messages.
- An item leaving the blacklist on another device pops up "Removed from blacklist on another device", in WebUI tests of the item state event's messages.
- A device's own favorite or blacklist change pops up only as Your actions, while one from another client, or an event without a `clientId`, pops up as Other devices, in WebUI tests of the item state event's `clientId`.
- On a player under 600 px wide, popups at the top start below the indicator, in WebUI tests of the popups' placement.
- Popups take no focus, with only their own boxes taking the pointer, in WebUI tests.
- A refresh's progress and its result read the same during and after each refresh, in WebUI tests of the refresh progress and result messages.
- The per-event messages are documented, checked by reading them.
- The main page has no status line and no mobile diagnostics line, in WebUI tests.
- Each one-off message pops up as its kind, with its kind's icon or its own, and as the settings allow, and the list keeps it whether it popped up or not, checked against the sorted list for every message the WebUI sends, including those other milestones added.
- At most three popups show, the cap closes the oldest that isn't a warning, and while three warnings show a new popup goes to the list only, one with the same key replaces the one showing, a warning stays until closed, pointing at one with a mouse or pen, focusing it, or both pauses its time without taking more off, Dismiss and a swipe close it, popups at the bottom rise above the controls unless the overlay panel covers the player, and none pops up while the list is open, where one showing with a new message's key closes, in WebUI tests of popups.
- The bell's badge counts the messages that didn't pop up, the list shows Now and Recent, Clear empties it, the list closes on Close, the bell, Escape, a press outside, or the panel opening, with focus back on the bell after Close, the bell, or Escape, and the controls stay shown while it is open, in WebUI tests of the bell and the list.
- Recent shows each message's time as "Just now", "{n} min ago", then the time of day, and the list keeps the last 50 messages until a page refresh clears it, in WebUI tests of the list.
- The list keeps every in-app notice, the kept-source notice among them, in WebUI tests of the list.
- The list sits inside the fullscreen stage and the popups above the overlay panel, with no stacking context between them, in WebUI tests.
- Popups follow each popup setting, kept per device, and start on for every kind, at the bottom center, in fullscreen too, for 5 seconds, in WebUI tests of each setting's effect and its default.
- With Show in fullscreen off, entering fullscreen closes the popups showing, and in fullscreen messages go only to the list, which the bell counts, in WebUI tests.
- A popup relays its text to `last.log` as a status line message is relayed today, the messages that show nothing still relay theirs, and a field message is no longer relayed, in WebUI tests of the relay.
- None of the dialog and field messages moved by earlier milestones or by the Messages to the notice slice pops up or shows on the indicator, checked against the sorted list for every message the WebUI sends.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass, and one quick spot check.

**Evidence**

- `src/notifications/notifications.ts` holds the entries, the last 50, the badge's count, the popups with their time, paused by a mouse or pen or by focus with an 800 ms floor, none for a warning, and their 160 ms leave, the cap and same-key replacement, the list's state and its clock, which moves every 30 seconds while the list is open, and the popup settings read from `notifications.popups`. A message relays `logText` or its text, never its second line, and an effect closes the popups on entering fullscreen while Show in fullscreen is off. `appServices.ts` builds it after the fullscreen module and before the dialogs, whose new `record` option keeps each notice as it opens, and closes the list when the panel opens. `lastingStates.ts` gives each state its `detail`, and `stageFullscreen.ts` an `active` signal that follows `fullscreenchange` and `webkitfullscreenchange` while attached.
- `src/ui/Notifications.tsx` ports the mockup's `initNotifications`: the bell, the popups (`#toasts`, a polite status region), and the list (`#notify-list`, a section with `role="dialog"`), with the mockup's `data-part` and `data-act` hooks and its row classes, a notice's row taking `is-error`. `Player.tsx` puts the bell first among the corner buttons and renders `controls-visible` while the list is open. `Stage.tsx` puts the popups in the player column and the list in the stage, each in its error boundary, and sets `covers-player` and `fullscreen-pseudo` in its effect. `App.tsx` renders neither the status line nor the mobile diagnostics line, and `StatusLine.tsx` and their rules are gone. `styles.css` takes the mockup's popup, bell, and list rules, and `.player-col` takes `position: relative`.
- Every `setStatus` call moved by the rule. `serverConnection.ts` pops up "Paired." after the header's Pair, while pairing on start with the config's token, which the server gives only a device it already accepts, only relays it, and pops up "Reconnected." and how a refresh ended, from `refreshOutcome` in `refreshStatusProjection.ts`, which replaces `buildRefreshStatusMessage`, and only relays the rest. `player.ts` pops up Your actions with the file name, and Other devices by the event's `clientId` and `previousIsBlacklisted`, and only relays "Playing". `library.ts` pops up a later page's failure, which `libraryQuerySession.ts` now tells from the first page's by a `failure` field, and only relays the first page's. `filterDialog.ts` and `tagEditor.ts` pop up their acknowledgments. The store lost `status` and `setStatus`.
- Checked against the sorted list, none of the dialog and field messages pops up or shows on the indicator: a notice goes through `dialogs.notice`, which keeps it in the list and calls no `notify`, and the indicator shows only the lasting states. `screens/dialogs.test.tsx` checks a notice pops nothing up, and the Filter and Tags screen tests check a field problem shows in its field and relays nothing, which every popup does.
- A refresh's progress and its result read the same during and after each refresh: `serverConnection.test.ts` shows a running refresh's stage and percent on the indicator, pops up how it ended, finished with its summary's segments or failed with its error on the second line, and shows the next run's progress again, and `eventsHelpers.test.ts` checks the stage labels and the summary's segments.
- Deviations from the plan:
  - "Reconnected." pops up on any end of Reconnecting… other than `stop()`. A check that ends it by finding the server incompatible, without a library, or asking for pairing pops it up beside that state, since the server was reached.
  - The stage's rendered class overwrote `covers-player`, so `fullscreen-pseudo` moved into the effect that sets it.
  - The badge renders "0" while it is hidden.
  - "Library refresh failed" has no log text of its own, since a second line is never relayed.
  - Each screen test file has its own relayed-line helper.
  - `screens/library.test.ts` waits for at least one query, since `pageReady` resolves after a remembered preset has applied again.
  - Screen tests look for the indicator's `role="status"` in the media area, since the popups are a second one.
- Tests:
  - `notifications.test.ts` (15) covers the service's rules and settings, the kinds that pop up among them.
  - `screens/notifications.test.ts` (32) covers no status line or diagnostics line on a mobile browser, the popups, their placement, stacking, and reduced motion, the bell, the list, and the defaults.
  - `lastingStates.test.ts` covers the Now details, `stageFullscreen.test.ts` following fullscreen, and `dialogs.test.ts` recording.
  - The unit and screen tests of the connection, the player, the library, the Filter and Tags tabs, the store, and the foundation now check relayed lines in place of the status line, wait with `pageReady`, and cover each message's kind, key, second line, and log text.
  - `screens/library.test.ts` shows the kept-source notice kept in the list.
  - The foundation snapshot has the bell, `#toasts`, and `#notify-list`, and no status line or diagnostics line.
  - The foundation tests check that pairing on start with the config's token pops nothing up and adds nothing to the list.
- Each part was broken in turn from a copy and its tests failed, 37 breaks in all:
  - In the service (13): the cap closing a warning, a warning timing out, no pause floor, a second hold taking more off, same-key adding a popup, popping up while the list is open, the list leaving a same-key popup, the fullscreen setting ignored or not closing popups, the badge counting popped messages, more than 50 kept, the kinds ignored, and the second line relayed.
  - In the routing (12): notices not recorded, in the dialog's and the kept-source tests; this device's own change popping up; unblacklisting reading as unfavoriting; Your actions without the file name; "Reconnected." without Reconnecting…; the refresh summary left out of the log; "Paired." only relayed after the header's Pair; "Paired." popping up on pairing at start; a failed refresh not a warning; the browse failure's icon; and the first page's failure popping up.
  - In the components and styles (11): no `covers-player`, Escape taken as it bubbles or over an in-app dialog, a press outside keeping the list, a touch pausing, no swipe close, the controls hiding while the list is open, popups not taking the pointer, top popups at 0, the panel keeping the list, and fullscreen changes not followed.
  - In the lasting states (1): Reconnecting… without its second line.
  - Each break failed 1 to 10 tests.
- The mockup check passes 965 checks, with new ones for the swipe, the popups' placement, the list's closing and focus, and the 50 messages kept; each failed with its change undone.
- `npm run verify` passed: the contracts are fresh, 61 test files and 1270 tests, the build, and the build output check. `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed: 483 Core, 421 desktop, and 7 ServerApp tests.
- The server publishes a finished refresh's status once per run, when it completes, so "Library refresh finished" can't pop up twice for one run.
- The spot check passed on every step: no status line, and the bell first among the corner buttons; "Added to favorites" popping up at the bottom center with the file name, held while the mouse was over it, and closing about 5 seconds after it left; the list opening under the bell with the message under Recent, the controls staying shown, and Escape closing it; a favorite on the phone popping up "Added to favorites on another device" on the computer and only "Added to favorites" on the phone; and a popup swiped away on the phone.
- After the spot check, as the user asked, the mobile diagnostics line went too, since the mockup doesn't show it, and WebUI Settings Panel shows its information in the Settings tab: `MobileDiagnostics` in `StatusLine.tsx`, its place in `App.tsx`, its `.diagnostics-mobile` rules, and `screens/phone.test.ts`'s test of it hiding on a phone on its side are gone, and the foundation test of a mobile browser checks only the client type and device name it sends. The main page's test checks there is no diagnostics line on a mobile browser, and failed with one put back.
- Docs: `CONTEXT.md` has a Notifications bullet with the message rule, the popups, their settings, the per-event messages by kind, the bell, and the list, and no longer mentions a status line or a diagnostics line. `docs/domain-inventory.md` describes the notifications service and components and the changed connection, player, library, store, dialogs, stage, and fullscreen entries.

#### Release checks

- Manual: With the server stopped, unavailable, or mismatched, and during a refresh, the player's indicator settles on one state.
- Manual: On a phone and an iPad, popups, the bell, and its list show and work in the browser, in fullscreen, and on a phone on its side.

#### Not included

- A desktop counterpart and a shared fixture for the precedence rule, since the desktop is frozen. The desktop's status messages stay as they are.
- Keeping the list across a page refresh.
- The Notifications section in the Settings tab, its sample popup, and the list's Notification settings link, which is WebUI Settings Panel.
- The admin view's bell and popups, which is WebUI Admin Section.
- A message for a video the server couldn't read, which is Browser-Playable Filter.
- Listing a source whose folder is missing, whose items refresh keeps without a warning; only a folder that lists no media files is a kept source.
- Loading… while a playing video buffers again partway through, which the player doesn't listen for.
- Noticing a server that passes the compatibility check again after an update, without loading the page again.

### M12f7 - WebUI Auto-Pause and Photo Scrub Bar

- **Status**: ✅ Complete
- **Goal**: Opening the panel pauses playback only as the Auto-Pause mode says, a photo's timer shows on the scrub bar and pauses and resumes with the time it had left, and the player's controls use the app's colors.
- **Depends on**: WebUI Responsive Layout and Panels and WebUI Tags and Filter Tabs, whose Auto Tag overlay and Tags tab it pauses for in place of the tag editor's own pause.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Auto-Pause replaces the tag editor's pause and resume.
- Opening the panel on any tab, or as its full-screen overlay, pauses playback according to an Auto-Pause mode:
  - **Never**: never pauses.
  - **Always**: pauses whenever the panel opens, at any width.
  - **Responsive**, the default: pauses only while the panel covers the player, as the full-screen overlay does on phones.
- Under Responsive, an open panel that crosses a breakpoint pauses when it comes to cover the player and resumes, if Auto-Pause paused it, when it moves beside the player.
- Auto Tag, which opens over the whole page, always covers the player, so it pauses under Always and Responsive, and so does the admin view.
- Closing resumes playback only if Auto-Pause paused it; playback the user paused stays paused.
- Playing or pausing while the panel is open hands playback back to the user, so closing leaves it as it is.
- Pausing a photo holds its autoplay timer, and the photo then resumes with the time it had left, not its full duration.
- Resuming a photo neither loads it again nor records its play again, as closing the Tags tab on the same photo does today.
- The mode is fixed at Responsive.
- On a photo, the player's scrub bar stays in its place, so the controls keep their place between photos and videos.
- While a photo's timer runs, with Autoplay on and Loop off, the bar fills as the timer runs, showing when the next item plays, with the time shown as elapsed and photo duration.
- With Autoplay on and Loop off, Play/Pause pauses and resumes the photo's timer, keeping the time left, and dragging the scrub bar moves the timer's position.
- With Autoplay off or Loop on, Play and the scrub bar are disabled on a photo. Loop on restarts the same photo, so the bar does not fill then.
- Once a photo's timer has ended, Play and the scrub bar are disabled until the next item plays, even while its pick waits or after it fails.
- The time display always shows, with 0:00 / 0:00 whenever no video or photo timer is active: before anything plays, on a photo with Autoplay off or Loop on, and after a photo's timer ends, so the controls keep their look.
- The mute button is never disabled and always shows whether sound is muted, before anything plays and on a photo too; muting on a photo applies to the next video.
- Turning Autoplay on starts the photo's full time from that moment, and turning it off clears the timer.
- Auto-Pause still resumes a photo with the time it had left.
- Checkboxes, radio buttons, sliders (the scrub bar and, from WebUI Volume and Enhanced Audio, the volume slider among them), and other native controls use the app's orange accent instead of the browser's default blue, in both themes, set once for the whole WebUI with `accent-color`.
- The overlay's time display stays light in both themes, like the overlay's other controls, since the player stays dark.
- The scrub bar, the time, and, from WebUI Volume and Enhanced Audio, the volume slider sit exactly the seek row's 12 px gap apart. The time takes its own width, with its digits all one width (`tabular-nums`) so it doesn't jitter while playing; its width may change between items with different time formats.
- The elapsed time takes the total's shape, so its width never changes within an item: it shows hours only when the total does, with as many hour digits as the total, and pads its minutes to the total's minute digits, as "09:47 / 23:12", "0:12:26 / 1:48:37", and "0:36 / 1:37". Idle stays "0:00 / 0:00". The header's duration shows hours from an hour too, and so does the mockup's Stats tab, so every duration reads the same way.

#### Traps

- The tag editor's resume restarts a held photo: `resumeAfterTagEditor` in `src/playback/player.ts` calls `playCurrent`, which reloads the photo and starts its full duration.
- `playCurrent` records a play unless the server already did, so the tag editor's resume records a held photo's play a second time, and the screen test of the Tags tab holding a photo's autoplay timer expects that second record (`src/test/screens/player.test.ts`).
- `playCurrent` hides the seek row for a photo.
- Play does nothing on a photo (`playOrPause` in `src/playback/player.ts` acts only on a video).
- Nothing sets `accent-color` (`src/styles.css`).
- `--time-display-fg` is `#1a1d21` in the light theme (`src/styles.css`), while the overlay's buttons use `--icon-foreground`, white in both themes, so the time turns dark on the dark player.

#### Acceptance

- With Auto-Pause on Responsive, opening the panel beside the player leaves playback going, opening it as a full-screen overlay pauses it, and an open panel that crosses a breakpoint pauses or resumes as it comes to cover the player or moves beside it, in component tests of Auto-Pause at phone and desktop widths and across a breakpoint.
- With Auto-Pause on Always, opening the panel pauses playback at every width; on Never, opening it never pauses. Shown by component tests of Auto-Pause in each mode at phone and desktop widths.
- Under Always and Responsive, opening Auto Tag pauses playback, in component tests of Auto-Pause with Auto Tag.
- Closing the panel or Auto Tag resumes playback only if Auto-Pause paused it, playback the user paused stays paused, and playing or pausing while the panel is open leaves playback as it is on close, in component tests of Auto-Pause with playback the user paused or resumed.
- Auto-Pause holds a photo's autoplay timer while it pauses, and the photo then resumes with the time it had left, without loading it again or recording its play again, in a component test of a photo resuming with the time it had left.
- The tag editor has no pause of its own, and Auto-Pause is Responsive until the Settings tab can change it.
- On a photo, the scrub bar shows in the place it has on a video. With Autoplay on and Loop off it fills as the photo's timer runs, Play/Pause pauses and resumes the timer with the time left kept, and dragging the bar moves the timer. With Autoplay off or Loop on, Play and the bar are disabled on a photo. Turning Autoplay on starts the photo's full time, and turning it off clears the timer. Shown by component tests of the scrub bar on a photo with Autoplay on and off.
- The overlay's time display is light in both themes, and checkboxes, radio buttons, and sliders use the orange accent in both themes.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Evidence

- Auto-Pause is `src/playback/autoPause.ts`: `autoPauseWants` decides from the mode, whether the panel is open and as the overlay, and whether something shows over the whole page, and `createAutoPause` is an effect that calls the player's `autoPause` and `autoResume` only when that changes, as the mockup's Auto-Pause does, so the user's own play or pause in between stands. `src/state/appServices.ts` gives it a fixed Responsive mode as a signal, which WebUI Settings Panel can bind to its setting, and Auto Tag's `autoTagOpen` as what shows over the page, beside which the admin view can join. The tag editor no longer takes the player.
- The player's tag editor pause and resume are now `autoPause` and `autoResume`, with the same rules, except that a held photo runs its timer on with the time it had left instead of going through `playCurrent`, so it neither loads again nor records its play again; a looping photo's timer is held the same way. Each pause and resume that acts relays `playback=auto-pause` or `playback=auto-resume` with the media type to `last.log`.
- The photo timer is `src/playback/photoTimer.ts`. It holds, resumes, and moves to a position, and measures by `performance.now()`, so a browser that delays timers in a hidden tab doesn't stretch it; its end does what the old timeout did.
- The player's `showsPause` became a `playButton` view of `disabled` and `showsPause`, and a `seekBar` view gives the slider its disabled state and accessible name, "Photo timer" on a photo, as the mockup names it. The seek row is always rendered, so it left the player's elements, and before anything plays the bar is disabled. The bar shows a photo's timer only while the timer is set, so once it has ended, Play and the bar are disabled until the next item plays, even while Next's pick waits or after it fails, as the review found. Whenever no video or photo timer is active, before anything plays as before, on a photo with Autoplay off or Loop on, and once a photo's timer has ended, the time shows 0:00 / 0:00, so the controls keep their look, as the user asked after the review. Each start empties the bar, and a video shows 0:00 / 0:00 until its metadata loads, where it used to show the last item's time.
- The scrub bar moves smoothly on photos and videos, as the user asked after the spot check: the slider has `step="any"`, so a browser doesn't round its value to whole seconds, and while a video plays, or a photo's timer runs while the bar shows it, the player moves the bar every animation frame from the video's `currentTime` or the timer's elapsed time, and stops on pause, and once a video fails to load, whose source fires no pause. The time beside it still changes once a second. The frames come through an injectable `FrameScheduler`, the browser's `requestAnimationFrame` by default, since node tests have none, where a video's bar used to step by whole seconds on each `timeupdate`. A video's bar now reaches its exact length, where its maximum was the whole seconds.
- The player's `muteButton` view became a `muted` signal, as the user asked after the review: Mute is never disabled and always shows whether sound is muted, before anything plays and on a photo, where a press applies to the next video. It used to be disabled and shown as unmuted on a photo, and a press before anything plays disabled it until a video played.
- Turning Loop or Autoplay on or off while a photo shows, and changing the photo duration, still show the photo again through `playCurrent`, which gives the photo's full time when Autoplay turns on; WebUI Autoplay Modes replaces that restart.
- `src/styles.css` takes the mockup's `accent-color` rule for inputs, progress bars, and meters, a white `--time-display-fg` in the light theme, and the default cursor on a disabled slider. After the review, as the user asked, the seek row's sliders drop a browser's own 2 px margin and the time has no minimum width or right alignment, so the bar and the time sit the row's 12 px gap apart, and the time's digits are `tabular-nums`, so it doesn't jitter while playing.
- The seek row's time comes from `formatPlaybackPosition` in `src/playback/nowPlaying.ts`, as the user asked after the review: the total is m:ss, or h:mm:ss from an hour, where it used to count minutes past 59, as 108:37, and the elapsed time takes its shape, with hours only when the total has them, as many hour digits, and its minutes padded to the total's minute digits, so its width never changes within an item: "09:47 / 23:12", "0:12:26 / 1:48:37", "0:36 / 1:37", and 0:00 / 0:00 while idle. `formatPlaybackTime`, which gives the header's duration and the seek row's total, shows h:mm:ss from an hour too, as the user chose, so every duration reads the same way, and the two share one shape function.
- The mockup already showed this milestone's design: the Auto-Pause modes, the photo bar and its disabled states, the accent, and the white time. For the smooth bar, its scrub bar takes `step="any"`, and its playback clock now runs in real time, brought up to now every 250 ms and every animation frame while something plays, where it added a quarter second per 250 ms tick; the bar moves every frame and stops on pause. After the review, its time shows 0:00 / 0:00 before anything plays, on a photo with Autoplay off or Loop on, and once a photo's timer has ended, where it was blank, and a photo whose timer ends stops its clock, so Play and the bar are disabled until the next item plays and a failed pick is no longer tried again on every tick. Its Mute and volume slider stay enabled on a photo, where both were disabled, Mute showing whether sound is muted, its scroll wheel and two-finger drag set the volume on a photo too, where they did nothing, all setting the next video's level, and the comment above its Play handler no longer says Play does nothing on a photo. Its seek row takes the app's margin, width, and `tabular-nums` rules, so the bar, the time, and the volume slider sit the row's 12 px gap apart, and the volume slider keeps its 84 px on a phone, where a container query narrowed it to 60 px. Its `fmt`, for the header's and the Stats tab's durations, shows h:mm:ss from an hour too, and its seek row's time takes the same shape, by `fmtPosition`, which `window.mockup.formatPosition` exposes for the check's hour-long times, since no mockup item runs an hour. `node docs/mockups/reelroulette/build/check.mjs` passes 915 checks, with new ones that the bar moves every frame on a photo's timer and a video and stops while paused, which fail with the frame loop removed, and that the time shows 0:00 / 0:00 before anything plays, on a photo with Autoplay off or Loop on, and once a photo's timer has ended, with Play and the bar disabled then, which failed against the page built before that change, and that Mute is enabled before anything plays and on a photo, showing whether sound is muted, and the mute and volume set on a photo, by the slider, the wheel, and a two-finger drag, carry to the next video, in place of the check that the wheel does nothing on a photo, whose photo checks failed against the page built before them, and that the seek row's parts sit its gap apart and no rule gives the volume slider a width but 84 px, which failed against the page built before them too, since happy-dom does no layout and ignores the container query, so they read the styles and rules, and that the elapsed time takes the total's shape, in a table of times and on a video ten minutes or longer, and that an hour-long video shows hours in the seek row, the header, and the Stats tab, which failed against the page built before them. The differences left belong to WebUI Autoplay Modes: the mockup's Loop and Autoplay buttons keep the photo loaded, and its Loop button keeps the time.
- Each guarded behavior was broken in turn and its tests failed: a photo resuming through `playCurrent` (4 tests), Responsive pausing beside the player (7), the bar never showing a photo's timer (9), the bar's frame loop and `step="any"` (8), and the accent rule and the light time color, each alone failing the colors test. The review's fixes were tested first: Play and the bar enabled once a photo's timer had ended (1 test) and a blank time where it now shows 0:00 / 0:00 (6 more tests, the page markup snapshot among them) failed before their fixes, and so did Mute's 5 rewritten tests: the screen tests with Mute disabled on a photo and before anything plays, and the player's for want of its `muted` signal, and the seek row test, with the bar's margin unset and the time 12 characters wide and right-aligned, and the time format's table of 12 cases and the player's test of a 1:48:37 video, which showed 0:00 / 108:37, and the formatter's and the header's hour-long cases, which showed 60:00 and 108:37. The second review's fixes failed first too: the test that nothing resumes once another item has started, rewritten to a second video that starts but stays paused, since its Play/Pause on a second photo cleared what Auto-Pause held, so it passed without the check, failed with the attempt check removed; the bar's frame loop on a video that fails to load (1 test); and the time of a video whose length is `Infinity`, which showed 00000000:00:05 / Infinity:NaN:NaN (1 case). As the user asked after them, the bar on a video whose length is `Infinity` is disabled and empty, where it stayed enabled with its maximum set to Infinity, which a browser takes as 100; its test failed before the change.
- The page markup snapshot changed only in the seek row, which now has `step="any"` too. A screen test that read the photo's time text exactly 5 seconds in now reads it at 5.1 seconds, since the text changes with the frames and the last frame before 5 seconds shows 0:04. The test that the seek slider keeps a value through the header's and status line's re-renders now sets it after the first play, since each start empties the bar.
- `npm run verify` passed: 55 test files, 1046 tests, the build, and the build output check.
- The spot check passed on a desktop browser: playback kept going on every tab beside the player, paused as the window narrowed below 800 px and resumed as it widened, paused for Auto Tag and resumed as it closed, a photo with Autoplay on filled the bar, paused and resumed with Play, and moved with a drag, and in the light theme the time was white and the bar orange. The smooth bar and the review's fixes came after it and are shown by the tests and the mockup check.
- New and changed WebUI tests:
  - Auto-Pause component tests (`src/test/autoPause.test.ts`), with the panel host and the player: Never, Always, and Responsive at desktop and phone widths and on a phone on its side, an open panel crossing the breakpoint, Auto Tag beside the player, the user's play or pause kept, and a photo resuming with the time it had left without loading or recording it again;
  - the time format (`src/test/nowPlaying.test.ts`): a table of elapsed and total times in each shape, idle, an unknown length, under ten minutes, under an hour, and from an hour, and m:ss or h:mm:ss for the header's duration;
  - the photo timer (`src/test/photoTimer.test.ts`): its length, hold and resume, moving while running and held, clear, and measuring by its clock;
  - the player: Auto-Pause's pause and resume of a video, a photo, and a looping photo, the user's Play/Pause kept, nothing resumed after another start, the bar before anything plays, and the photo bar filling, holding and resuming, moving, disabled with Autoplay off or Loop on and once its timer has ended, with the time at 0:00 / 0:00, and emptied for each new item, and the bar moving every animation frame on a video and on a photo's timer and stopping on pause, a held timer, Auto-Pause, a new item, and a video that fails to load, and Mute showing whether sound is muted before anything plays and on a photo and applying to the next video, and a video's elapsed time in the shape of its length, and the bar disabled and empty on a video whose length is `Infinity`;
  - the page at Responsive: playback going on every tab beside the player, the overlay on a phone pausing on every tab and resuming on close, an open panel crossing the breakpoint, Auto Tag, playback the user paused or played, a photo held by the overlay resuming with the time it had left, the scrub bar on a photo, the bar's `step="any"` and its movement every animation frame on a video and a photo's timer, stopping on pause, and the time and accent colors in both themes, and Mute enabled before anything plays and on a photo, where a press applies to the next video, and the seek row's 12 px gap with the bar's margin dropped and the time's own width and `tabular-nums` digits. The Tags tab's own pause tests are gone.

#### Release checks

- Manual: On a phone and a desktop browser, with Auto-Pause on Responsive, playback keeps going on every tab beside the player, and the overlay and Auto Tag pause it and resume it on close.
- Manual: In both themes on a phone and a desktop browser, the scrub bar and checkboxes are orange, the player's time is white, and the scrub bar moves smoothly on a video and fills smoothly on a photo with Autoplay on.

#### Not included

- Pausing for the admin view, which is WebUI Admin Section.
- The Auto-Pause setting, which is WebUI Settings Panel.

### M12f6 - WebUI Tags and Filter Tabs

- **Status**: ✅ Complete
- **Goal**: The Tags tab follows the playing item, unsaved Tags and Filter changes survive closing the panel, tag categories collapse and show what's in use, and Auto Tag opens over the whole page.
- **Depends on**: WebUI Responsive Layout and Panels, whose panel holds the tabs, and WebUI In-App Dialogs, whose dialog Refresh asks in, and WebUI Drag Reordering, whose handle a category header keeps.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The Tags tab edits the playing item's tags and follows the playing item when it changes, unless the tab has unsaved changes to its item's tags.
- With unsaved changes to its item's tags, the Tags tab stays on that item and shows a line naming it, "Editing tags for {file name}", until those changes are saved or discarded (Refresh discards them, asking first), and then follows the playing item.
- Unsaved changes that are not to the item's tags, such as a category reorder or rename, don't hold the Tags tab on its item.
- Unsaved changes survive closing the panel and switching tabs: the Filter tab's until Apply or Cancel, and the Tags tab's until Save, or Refresh, which discards them after asking.
- Leaving the Tags tab, for another tab or by closing the panel, no longer asks "Discard changes?".
- The Tags tab's Save leaves the panel open, beside the player and as the overlay, as the mockup shows.
- While the Filter or Tags tab holds unsaved changes, a small orange dot marks its tab icon, and the player's panel button while either does, so they aren't forgotten when the panel is closed, and their accessible names say so.
- Tag categories, in the Tags tab and the Filter tab's Tags section, collapse and expand when their header is tapped or clicked, and their expand and collapse arrows go.
- A category header's drag handle, its Edit button, and the Filter tab's Local match select keep their own actions.
- Tag categories remember per device whether each is collapsed, separately for the Tags tab and the Filter tab's Tags section, and start collapsed, new categories included.
- A category expands by itself when a tag is added to it or moved into it, so the change is visible; so does Uncategorized when a deleted category's tags move into it.
- A collapsed category's header shows a small count of what's in use: in the Tags tab, how many of its tags the item has (or, with WebUI Multi-Select and Bulk Actions, the selection); in the Filter tab, how many of its tags the current filter uses.
- A collapsed category with unsaved changes also shows the orange unsaved-changes dot, so the dot keeps one meaning throughout the app. In the Tags tab that is a pending Add or Remove on one of its tags, or a name or tags that differ from the saved ones; in the Filter tab, a change to its tags that Apply hasn't applied.
- Auto Tag opens from the Tags tab as an overlay over the whole page, as its tab does today, instead of as a tab of the tag editor, so its file list keeps its width.
- Auto Tag covers the player.
- Auto Tag has its own Apply for its selected changes, which today the tag editor's Save applies.
- Auto Tag's Close is disabled while a scan runs, as the tag editor's Refresh and the panel's Close are today.
- Auto Tag's Apply sits at the right of its footer with Cancel to its left.
- Auto Tag's Cancel clears the scan and closes Auto Tag, while the X at the top right closes it and keeps the last scan; both wait while a scan runs.
- With View all matches, files that already have the tag show checked and disabled, so they can't be unchecked.
- Each scan starts with nothing checked, as today, and Select all checks everything.
- Auto Tag's results area shows a placeholder before any scan, "Scan to find files whose names contain a tag's name.", and a different one when a scan finds nothing, "No file names contain any tag's name.".
- Auto Tag's Total matched and To be changed counts each line up under their own header, with room between the two columns.
- The Filter tab's message for a library with no tags reads "No tags yet. Add them in the Tags tab." in place of "No tags available. Use Edit tags to create tags.".
- Enter in the Tags tab's New tag name adds the tag while Add tag is enabled, as the mockup shows, and does nothing while the name is empty or another tag's.
- The Filter and Tags tabs and Auto Tag take the mockup's look, which WebUI Responsive Layout and Panels left to this milestone, including the Tags tab footer's two rows: add category and the category for a new tag, then New tag name, Add tag, and Save.

#### Traps

- Enter in the tag editor's New tag name does nothing: the field has no key handler and no form (`TagEditor.tsx`).
- The tag editor's footer, with Add tag, also shows under the Auto Tag tab, where the new chip is hidden, so focus drops to the page after Add tag (`TagEditor.tsx`). Auto Tag opening as its own overlay over the whole page ends that case.
- The Tags tab's tag editor takes the item playing when the tab shows (`open` in `src/tags/tagEditor.ts`) and keeps it. Beside the player, Next, Previous, and a swipe still change the item playing, so the tab can show and save an item that is no longer on screen.
- Leaving the Tags tab, for another tab or by closing the panel, asks "Discard changes?" when it has changes (`close` in `src/tags/tagEditor.ts`).
- Showing the Filter tab again rebuilds its draft from the applied filter and the server's presets, dropping unsaved filter and preset changes (`open` in `src/filter/filterDialog.ts`).
- With View all matches, files that already have the tag show as ordinary checkboxes that start unchecked, and checking one sends the file again (`visibleAutoTagFiles` and `autoTagAssignments` in `src/tags/autoTagModel.ts`).
- Auto Tag's results area is empty before a scan, and after one that finds nothing it repeats the status line's "Scan complete: no matching tags found." (`autoTagResults` in `src/tags/autoTagModel.ts`).
- Auto Tag's header and each row are separate grids whose count columns size to their own content (`.tag-autotag-table-head` and `.tag-autotag-row-main` in `src/styles.css`), so the numbers drift from their headers.

#### Acceptance

- When the playing item changes, the Tags tab shows the new item's tags, unless it has unsaved changes to its item's tags. Then it stays on its item with an "Editing tags for {file name}" line, and follows the playing item once those changes are saved or discarded. Shown by component tests of the Tags tab following the playing item and staying on its item with the "Editing tags for" line while it has unsaved changes to that item's tags.
- Closing the panel or switching tabs keeps unsaved Filter and Tags changes, the Filter tab's until Apply or Cancel and the Tags tab's until Save or Refresh, and closing never asks "Discard changes?", in component tests of unsaved Filter and Tags changes surviving closing the panel and switching tabs.
- While the Filter or Tags tab holds unsaved changes, its tab icon shows a dot, and the player's panel button shows one while either does, each with an accessible name that says so. The dots go once the changes are applied, saved, canceled, or discarded. Shown by component tests of the dots on the tabs and the panel button.
- Tapping or clicking a tag category's header collapses or expands it, with no arrows. Its drag handle, its Edit button, and the Filter tab's Local select keep their own actions. Shown by component tests of category headers toggling while their other controls don't.
- Tag categories start collapsed, new ones included, and each tab remembers which are expanded per device, after a page refresh too. A category expands when a tag is added to it or moved into it. A collapsed category's header shows how many of its tags the item has, in the Tags tab, or the filter uses, in the Filter tab, and the orange dot while it holds unsaved changes. Shown by component tests of categories starting collapsed and remembered per tab across a page refresh, expanding when a tag is added or moved into them, and a collapsed header's count and unsaved-changes dot.
- Auto Tag opens from the Tags tab over the whole page, applies its selected changes with its own Apply, and its Close is disabled while a scan runs, in component tests of Auto Tag's Apply and its Close during a scan.
- Auto Tag's Cancel, left of Apply, clears the scan and closes it, and the X closes it and keeps the last scan. With View all matches, files that already have the tag are checked and disabled. Its results area shows one placeholder before any scan and another when a scan finds nothing, and its two count columns line up under their headers. Shown by component tests of Auto Tag's Cancel, X, View all matches, and placeholders.
- The Tags tab's Save leaves the panel open beside the player and as the overlay, in component tests of Save at each width.
- The Filter tab's no-tags message names the Tags tab.
- Enter in New tag name adds the tag, and does nothing while Add tag is disabled, in component tests of New tag name.
- The Filter and Tags tabs and Auto Tag look as the mockup shows them in both themes, with the Tags tab footer in two rows, shown by the screens' markup snapshots and the spot check.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Evidence

- Auto Tag is `src/ui/AutoTag.tsx`, the in-app dialog (`Dialog` in `src/ui/Dialog.tsx`) with its own class, no outside to click, and a close the browser makes during a scan undone, rendered in the stage beside the in-app dialogs, so it covers the page and the player in fullscreen and iOS pseudo-fullscreen too; Escape and the browser's cancel do what the X does. Its state stays in the tag editor service (`autoTagOpen`, `openAutoTag`, `closeAutoTag`, `cancelAutoTag`, `applyAutoTag`), and its selection rules, placeholders, and the rows after Apply are in `src/tags/autoTagModel.ts`.
- Auto Tag's Apply goes through the tag save session as a save of its own (`planAutoTagApply`), so tiles update before the reply and roll back on a refusal. It leaves Auto Tag open and shows the applied files as having their tag, where the mockup, which has no server, scans again, with the same result on screen. When the server refuses, it shows the files it sent without their tag again (`autoTagRowsAfterRefusal`), keeping row changes made meanwhile, unless a new scan replaced them. A tag renamed or deleted, by a save or by another client, clears a kept scan (`retargetTag`), since its Apply would create the old tag again. Another client's rename or delete of a tag no file has comes only as `tagCatalogChanged`, without the old name, which now clears a kept scan naming a tag the catalog no longer has (`autoTagRowsLeftCatalog`); a save that only moves a tag to another category sends a rename with the same name, which keeps the scan, as the server's event does. A rename or delete from this page, or another client's of a tag some file has, also moves the Tags tab's held adds, removes, and tag edits to the new name or drops them (`retargetHeldTag`), keeping the user's own new name for a held rename, so Save doesn't send the old name back, and the tags load again while the tab shows. Held changes on a tag no file has, such as an add, don't follow another client's rename or delete, since that event doesn't name the old tag. The Tags tab's Refresh no longer clears or asks about Auto Tag's scan, and the panel's Close is no longer disabled during a scan, since Auto Tag covers it.
- The Tags tab follows the playing item by item id (`follow` in `src/tags/tagEditor.ts`), loading the tags again while it shows and taking only the latest load. Save shows the changes as saved at once (`savedTagModel`), and the tab follows the playing item and loads the tags again only once the save lands, so it never shows another item's tags against a catalog the save hasn't reached; the mockup, which has no server, follows at once, with the same result on screen. Undoing the last add or remove, or deleting its tag, ends the hold. A failed save now loads the tags again too, where the editor used to close and load nothing, and shows the tags as they were before it until they load. A save drops a tag load sent before it, whose reply would show the changes undone, and the tab sends none while a save is on its way, showing again or on Refresh, since the save loads the tags once it lands. Save with changes that cancel out, such as a category moved and moved back, sends nothing and drops them, so their dot goes.
- The Filter tab keeps its working copy and section while hidden; shown again without unsaved changes it starts over from the applied filter. A duration still being typed isn't read into the working filter, which the field validation rules need, so its text counts as an unsaved change for the dots and for starting over (`generalDurationsChanged`, and the view's `unsaved`), and text that reads as the filter's duration, such as "90" for 01:30, counts as none. Apply's star still follows the working filter alone, as the field validation tests lock it. Clear all used to reset the filter the tab started from too, so it showed neither Apply's star nor the dots, and showing the tab again undid it. It now leaves that filter as it was. While the applied filter isn't the default, Clear all shows Apply's star, as the mockup does, and the dots, which compare with the applied filter, and the tab keeps it while hidden. A tag renamed or deleted in the Tags tab, or by another client when a file has it, is renamed or removed in its working copy, the filter it started from, and its preset list (`reviseTags`), so Apply doesn't put the old name back. Another client's rename or delete of a tag no file has comes only as `tagCatalogChanged`, without the old name, so it reaches neither the applied filter nor the tab's changes. A preset picked in the Library tab now starts it over whether or not it shows, dropping its changes, as the mockup does; before, that happened only while it showed, which the Library tab's dropdown made impossible.
- The dots are in `src/ui/Panel.tsx` and `src/ui/Player.tsx`, which both read one signal in `src/state/appServices.ts` (`unsaved`) of the Filter tab's unsaved state and the Tags tab's Save; the Library tab has none.
- The category header is `src/ui/TagCategory.tsx`, shared by both tabs. The expanded categories are kept per device as `tags.expandedCategories` and `filter.expandedTagCategories`, and the per-session `rr_tagEditorCollapsed` and `rr_filterDialogCollapsedCategories` are no longer used. A category's count and unsaved state are `tagCategoryRows` and `filterTagCategories`.
- The look follows the mockup, as the user asked during planning, since WebUI Responsive Layout and Panels left the tabs' rework to this milestone: the stylesheet gains the mockup's shared `.btn`, `.ctl`, and `.icon-btn` controls, and the tabs' own button and field rules are gone. Sources read "Name (folder)" when the two differ, as the mockup shows them. The preset list grows with its section and the tab's body scrolls, as in the mockup; the app's list used to scroll by itself. The drag handle is just `.drag-handle`. These controls now show the orange focus ring, so WebUI Keyboard Navigation and Focus's trap on the tag editor's blue ring was corrected.
- The mockup shows what shipped; where it differs above, it only stands in for the server, with the same result on screen. Its Filter dot now also shows while a duration being typed differs from the applied one, as the app's does, and like the app's, its category header no longer toggles for a press on its handle or Edit let go elsewhere on it, which the browser clicks the header for, with checks for both. `node docs/mockups/reelroulette/build/check.mjs` passes 887 checks.
- `npm run verify` passed: 53 test files, 997 tests, the build, and the build output check.
- The spot check passed on a desktop browser and a phone, in both themes: the Tags tab's "Editing tags for" line and Save leaving the panel open, the Filter tab's changes and the panel button's dot surviving a closed panel, a category's header toggle kept across a page reload, Auto Tag covering the page with its counts under their headers, and both tabs' look.
- Each guarded behavior was broken in turn and its tests failed: Auto Tag's X during a scan and View all's disabled boxes; following, holding, the Tags and Filter tabs dropping changes on close, and each dot; the header's padding toggle, a click anywhere in the header toggling, both tabs' memory, the count, the category dot, expanding on a move and on a deleted category, starting expanded, and the Filter tab's category dot. The tests added after review failed before their fixes, Auto Tag's browser close and padding click failed with either of its dialog options removed, and a refused Apply after a new scan failed with its scan check removed. Scan full library's stored value read back failed with its read broken.
- New and changed WebUI tests:
  - Auto Tag: opening over the page with focus on its X and back on its button, Escape, the placeholders, Apply, Close, Cancel, and Escape during a scan, the shared column template, View all's checked and disabled files never sent, Select all with Apply keeping it open and the files tagged, the X keeping the scan and Cancel clearing it, a refused Apply putting the rows back, also after a row changed, and not once a new scan replaced them, even a row in the same place listing the same file as already tagged, a rename or delete clearing a kept scan, as does another client's catalog change that leaves out one of its tags, while a save that only moves a tag keeps it, Scan full library as last stored, and the browser's cancel and close and a click on its padding leaving it open during a scan;
  - the Tags tab: following the playing item while shown and while hidden, holding its item with the line until a save lands or Refresh discards, catalog changes not holding it, only the latest load taken, keeping changes through close and tab switches, following once its last add or remove is undone or its tag deleted, Save showing the changes as saved and loading the tags again, also after a refusal, a failed save showing the tags as they were, a load sent before Save dropped, none sent while a save is on its way, held changes moved to a tag another client renamed or dropped for one it deleted, changes that cancel out dropped on Save, and Enter in New tag name;
  - the Filter tab: keeping changes and section through close and tab switches, a duration still being typed kept as an unsaved change without Apply's star, starting over without changes, Cancel at each width, a Library preset pick dropping its changes, Clear all kept with its dots and Apply's star, and no star when the applied filter is the default, a tag renamed in the Tags tab reaching its changes and preset list, and the no-tags message;
  - the panel: the dots and their names until Apply, Cancel, Save, or Refresh's Discard, and Save leaving the panel open beside the player and as the overlay;
  - categories in both tabs: starting collapsed, the header's name and padding toggling while the handle, Edit, and Local don't, nor a drop or a press on Edit let go elsewhere on the header, memory per tab across a page refresh, expanding on Add tag, a move, and a deleted category, and the collapsed header's count and dot.

#### Release checks

- Manual: On a phone and a desktop browser, in both themes, the Filter and Tags tabs look as the mockup shows them, Auto Tag covers the whole page, in fullscreen too, its count columns line up under their headers, and tapping a tag category's header toggles it.

#### Not included

- Pointing the Tags tab at several selected items, with "Editing tags for {n} items", which is WebUI Multi-Select and Bulk Actions.
- Pausing playback for Auto Tag, which is WebUI Auto-Pause and Photo Scrub Bar.

### M12f5 - WebUI Library Tab

- **Status**: ✅ Complete
- **Goal**: The Library tab holds the library's controls above a grid of smaller tiles, laid out like the desktop library panel, with a line that sums up the applied filters.
- **Depends on**: WebUI Responsive Layout and Panels, whose panel holds the tab, and Favorite and Blacklist Filter Modes, whose modes the filter summary line names.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The preset dropdown and randomization mode leave the header for the Library tab.
- The Library tab is laid out like the desktop library panel: above the grid, the preset, then randomization mode, then sort with its direction toggle, then search.
- The preset and randomization dropdowns share one row from a panel width of about 440 px.
- The controls collapse to give the grid more room, together with the filter summary line, and stay collapsed or open per device.
- The collapse button's tooltip reads "Hide controls & filters" or "Show controls & filters".
- The Library tab's justified rows fit the panel width, 100–240 px high, aiming for 160 px, beside the player and as the overlay.
- When nothing matches the search or the filters, the grid says "Nothing matches the search or filters."; its other messages stay as they are today.
- The favorite and blacklist icons on tiles lose their dark rectangle and become filled icons, by the icon font's FILL axis, with a soft drop shadow, so they stay readable on bright thumbnails.
- The playing tile shows a filled play icon in its middle, modest in size and slightly translucent so the thumbnail shows through, in the same style.
- With a mouse, hovering a tile shows its file name as a tooltip.
- File names keep showing on tiles.
- Filled icons, these and the check icons WebUI Multi-Select and Bulk Actions adds, are plain flat shapes, at the font's FILL 1, with the weight 700 and optical size 20 the badges used before (`.library-grid-tile-badge-icon` in `src/styles.css`).
- The desktop's filter summary line: while a filter applies, the Library tab shows one line above the grid listing the applied filters, as the desktop lists them above its library panel, and tapping or clicking it opens the Filter tab.
- The summary line collapses with the Library tab's controls.
- The summary line names Favorites only or excluded and Blacklisted only, the modes from Favorite and Blacklist Filter Modes. Blacklisted excluded, the default, isn't named, as the desktop's summary doesn't name Exclude blacklisted today.
- The summary line reads "Filters:" and then each applied filter, separated by " · ": Favorites only or excluded, Blacklisted only, each checked Basic Filters option by its label, a media type or audio choice other than the first, "{n} of {total} sources", "Min {duration}" and "Max {duration}", "{n} tags", and "{n} tags excluded".
- The tab remembers per device whether its controls are collapsed, the active preset (including None) and applied filter, randomization mode, and sort and direction.
- The search text is not remembered.
- The randomization mode already stored per device carries over.
- Presets stay on the server: the WebUI remembers only which preset is active and the filter it applied.
- A remembered preset, tag, or source that was renamed or deleted on another device in the meantime is handled as it is when that happens while the WebUI is open.

#### Traps

- Today the library's rows are 200–400 px high, aiming for 300 px (`libraryGridLayout.ts`).
- Today's tile badges are outlined orange icons on a dark rectangle (`.library-grid-tile-badge` in `src/styles.css`).
- The grid doesn't mark the playing tile.
- Every tile shows its name in a bar, which alone carries the tooltip (`renderGridTileHtml` in `src/library/libraryGridTileModel.ts`).
- In the mockup, with the WebUI's font, a filled glyph draws its outline and its fill as separate shapes, and at weight 700 the fill closes the outline's hole only at optical sizes 20 and 24. From 32 up the fill falls short, so at the optical size 48 the WebUI's other icons use, each filled icon shows as an outline around a filled center with a thin gap between them (measured).
- The WebUI library's summary today shows only how many items are showing out of how many.

#### Acceptance

- The header no longer shows the preset dropdown or randomization mode. The Library tab shows, above the grid and in this order, the preset dropdown, randomization mode, sort with its direction toggle, and search. The preset and randomization dropdowns share a row from a panel width of about 440 px, and the controls and the filter summary line collapse and expand together. Shown by component tests of the control order, the dropdowns sharing a line, and the controls and summary line collapsing together.
- The Library tab's rows fit the panel width at 100–240 px high, beside the player and as the overlay, in component tests of the row heights.
- Tile badges are filled icons with a drop shadow and no dark rectangle, only the playing tile shows the playing icon in its middle, and hovering a tile with a mouse shows its file name as a tooltip, in component tests of the tile badges, the playing icon, and the hover tooltip.
- A search or filter with no results shows "Nothing matches the search or filters.".
- While a filter applies, the Library tab shows the filter summary line above the grid, in the format above, without naming Blacklisted excluded, and tapping or clicking it opens the Filter tab, in component tests of the summary line's text for each kind of filter and of its opening the Filter tab.
- After a page refresh, whether the controls are collapsed, the active preset and applied filter, randomization mode, and sort and direction are each as they were, and the search box is empty, in component tests of a page refresh keeping each remembered setting and clearing the search text.
- After a page refresh, a remembered preset, tag, or source that was renamed or deleted elsewhere is handled as it is when that happens while the WebUI is open.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Evidence

- The Library tab's header with its collapse button, the Filters line, and the controls are in `src/ui/LibraryOverlay.tsx`. The Filters line's text is `filterSummaryParts` in `src/filter/filterSummaryModel.ts`, which names the Filter tab's options by the label lists `src/filter/filterDialogModel.ts` now holds for both. The per-device store keeps whether the controls are collapsed and the sort as `library.controlsCollapsed` and `library.sort` (`src/library/library.ts`), and the applied filter, its preset, the None hold, and whether the filter is the preset's own as `filter.applied` (`src/state/appStore.ts`). The randomization mode stays under `rr_randomizationMode`.
- The Filters line sits between the tab's header and the controls, as the mockup has it.
- One tag reads "1 tag" and "1 tag excluded", as the mockup has it, where the entry wrote "{n} tags".
- Durations read as the Filter tab shows them after a reload, such as "Min 02:00", where the mockup showed them as typed; the mockup now formats them the same way.
- The sources' total comes from `GET /api/sources`: the Filter tab hands the list it loads to the store, and the Library tab loads it once when a source filter applies and no list is known. Until then the part reads "{n} sources", and a failed load relays `library=filter-summary-sources-failed`.
- The controls show while the library loads, is empty, or fails, where today's toolbar hid, so the preset and randomization dropdowns stay reachable. Search, sort, and direction are disabled while the server fails the compatibility check, and the preset dropdown while it shows a message in place of the presets; the mockup disables and dims them the same way.
- When the server fails the compatibility check, the preset dropdown now says so even when presets loaded before the check failed, as the mockup has it; before, it kept the presets unless they loaded after the failure (found during implementation).
- Nothing is queried before the server has passed the compatibility check, nor while it fails it: a query started over waits for it, and so does the first page when the tab opens, which opening the tab used to load before the check passed. The first page then loads with what applies by then. The controls now show before the check finishes, and a remembered preset can apply again before it does. A version check that fails to reach the server, at page load or later, runs again when the event stream opens, until one passes, so the tab then loads without a page reload, and the presets load again once it passes, since they likely failed with it; before, only pairing ran it again. WebUI Notifications, which checks again each time the stream opens or fails, notes that this part is done.
- After a page refresh, a remembered preset whose own filter applied, and that no other filter has replaced since the page loaded, applies again on the first preset load as the server has it, so a tag renamed or deleted elsewhere follows, as in the open page. Waiver (criterion partly met): a starred filter keeps its tags as remembered, which differs from the open page for a tag that items hold: the open page renames or removes it when the item-tags event arrives, while after a refresh the old name stays, since nothing tells the page of a rename made before it loaded (inferred). For a tag no item held, the open page keeps it too. A preset renamed elsewhere shows by its new name when its filter matches, and one deleted shows None\* with the filter kept. Remembered sources are sent as they were and counted against the sources listed now. A preset edited elsewhere comes back with its edits, where the open page would show it starred with the old filter, accepted when this was chosen.
- Nothing is written until presets have loaded once, since before then no filter reads as a preset's own, so a page whose presets never load leaves the record as it was for the next. After that, the remembered filter is written only when its record differs from the one kept, so a page load that changes nothing writes nothing, and a preset pick or an Apply changes the filter and its preset in one batch, so each writes once.
- A tag rename or delete now changes the presets in place first and then replaces the applied filter, where both were changed in place, so the Filters line and the memory follow. In the other order the record took the filter as changed from its preset (measured).
- The store's names keep "header" (`pickHeaderPreset`, `headerFilterChanged`, `headerExplicitNone`, `syncHeaderPresets`) though the dropdown moved; their comments name the preset dropdown.
- Every tile has the playing icon, which the stylesheet shows on the tile with `is-playing`. The grid controller moves the class between the tiles shown (`setPlayingItemId`) and renders new tiles with it. The badges and the playing icon take `.material-symbol-icon.is-filled`, and the tiles' icons a two-layer drop shadow. The tooltip moved from the name bar to the tile.
- "No matches for “{search}”." and "No items match the current filter." became "Nothing matches the search or filters."; "No media in library." and the other messages stay.
- The mockup's grid now has the app's minimum layout width of 280 px, where it had 200 px.
- happy-dom applies no container query (measured before implementation), so the test of the dropdowns' row reads the rule's text, and the release check covers the layout.
- A test that read a computed style inside `waitFor` looped instead of failing with the playing icon broken, since restyling changes the page and wakes `waitFor` again (measured); it waits for the class and reads the styles after.
- The mockup formats the Filters line's durations as the app does, its index no longer says the Mockup tab sets how the playing tile is marked, and its check now covers the control order, the header without the dropdowns, the no-match message for a search and for a filter, the Filters line's sources, tags, and label, its opening the Filter tab, the collapse button's tooltip, name, and state both ways, search, sort, and direction disabled and dimmed to half while the server fails the compatibility check and working again once it passes, and the preset dropdown dimmed the same way then; each new check failed with its rule broken. Until WebUI Settings Panel, the app differs from it as the entry says: file names show on tiles, which the mockup hides by default. `check.mjs` passes 879 checks.
- New WebUI tests:
  - the Filters line's parts for each kind of filter, in order, with sources counted with and without the list;
  - the store: the remembered filter's round trip and writes, a held None, an unreadable record, nothing written before presets first load, so a page whose presets never load keeps the preset to apply again, a preset applied again as the server has it, only on the first load, a starred filter kept, a deleted preset on None\*, a renamed one found by its filter, none applied again after a newer filter, and one write for each preset pick;
  - the library: nothing sent before the server passes the check nor while it fails it, and the first page loaded with what applied meanwhile; opening the tab before the check passes sending nothing, and the first page loading once it does;
  - the Filter tab: one write of the remembered filter for an Apply that changes the filter and its preset;
  - the server connection: the compatibility message in the preset dropdown when presets load before the failure and after it, the version checked again when the event stream opens after a check that failed to reach the server, only until one passes and not while one is under way, and the presets loaded again once it passes after both failed at start;
  - the page: the controls' order and the header without the dropdowns, the dropdowns' row, collapsing and expanding with the Filters line and after a refresh, the Filters line's text, sources, and opening the Filter tab, rows beside the player and as the overlay, filled badges with a drop shadow and no rectangle, the playing icon moving and kept after a new order, the tile's tooltip, a refresh keeping each setting but the search, a held None after a refresh, a preset renamed and deleted, a tag renamed and deleted in the preset, a starred filter, and a remembered source, the controls in two rows on a phone on its side, and a tag rename and delete reaching the Filters line and the memory.
- Existing tests now pick presets in the Library tab through a shared helper, read the randomization mode there, and mark the header by its photo duration. Tests that hid the toolbar now expect the controls, the no-match tests expect the new message, the storage key tests allow the device store's keys, two layout tests use a 480 px width where two tiles fill a row, and four library tests now emit the server's readiness before they query or open the tab. Picking a preset in the Library tab fills its second page first, so a fill test counts one more query.
- The starting markup snapshot changed by the controls moving from the header to the Library tab, with the collapse button and the Filters line, and the library's snapshots by the controls, the collapse button, the Filters line, the 160 px rows, the tiles' tooltip, playing icon, and filled badges, and nothing else.
- Each guard was broken on purpose and its tests failed (measured, of 940):
  - the controls out of order: 3;
  - a dropdown left in the header: 2;
  - the dropdowns not in a row from 414 px: 1;
  - the dropdowns not sharing their pair: 3;
  - the Filters line not collapsing: 1;
  - the collapse not remembered: 2;
  - its tooltip not changing: 1;
  - the old row heights: 3;
  - the badges' dark rectangle: 1;
  - the badges not filled: 3;
  - filled icons at optical size 48: 2;
  - no drop shadow: 1;
  - the playing icon on every tile: 1;
  - the playing icon not following the playing item: 1;
  - the playing icon lost when the tiles render again: 1;
  - the tooltip only on the name bar: 3;
  - the old no-match message: 2;
  - Blacklisted excluded named: 13;
  - "1 tags": 5;
  - the Filters line not opening the Filter tab: 1;
  - no sources loaded for it: 1;
  - the sort not remembered: 2;
  - the search remembered: 1;
  - the filter not remembered: 9;
  - the filter written on every check: 3;
  - the remembered preset not applied again: 2;
  - a starred filter applied again: 2;
  - the preset applied again after a newer filter: 1;
  - the None hold not restored: 2;
  - a tag retarget changing the filter in place: 1;
  - a tag retarget replacing the filter before the presets: 1;
  - a query before the server is ready: 1;
  - search and sort enabled while the check fails: 2;
  - the preset dropdown enabled with a message: 1;
  - the controls not in two rows on a phone on its side: 1.
- The guards for the compatibility message failed the same way (measured, of 941): no message when the check fails: 2; presets that arrive after it replacing the message: 1.
- The guard for opening the tab failed the same way (measured, of 942): the first page loaded on opening before the server passes the check: 1.
- The guards for the first write of the remembered filter and the version check failed the same way (measured, of 945): the filter written before presets load: 2; the version not checked again when the stream opens: 1; the server's readiness not kept, so every open checks again: 2; a second check while one is under way: 1.
- The tests for the presets loading again after the version check passes, one write for each preset pick, and one for each Apply each failed before their fix (measured).
- `npm run verify` passed: 53 test files, 948 tests, the build, and the build output check.
- `CHANGELOG.md`, `CONTEXT.md`, `docs/architecture.md`, and `docs/domain-inventory.md` are updated, WebUI Notifications names the Library tab's preset dropdown where it named the header's, WebUI Multi-Select and Bulk Actions has the filled icon and playing tile traps, and the testing checklist's Release Specific checks have this milestone's release check.
- The spot check passed on a desktop browser and a phone.

#### Release checks

- Manual: In the WebUI's Library tab on a phone, a tablet, and a desktop browser, the preset and randomization dropdowns share a row in a panel about 440 px wide or wider and stack in a narrower one, the four controls take two rows on a phone on its side, and the tiles' favorite, blacklist, and playing icons show solid, with no gap between outline and fill.

#### Not included

- The setting that turns off file names on tiles, which is WebUI Settings Panel.
- The tile check icons, which is WebUI Multi-Select and Bulk Actions.

### M12f4 - WebUI Responsive Layout and Panels

- **Status**: ✅ Complete
- **Goal**: The WebUI layout adapts to the viewport: on tablets and desktops a side panel beside the player keeps the video in view while browsing, filtering, or tagging, and on phones the panel is a full-screen overlay.
- **Depends on**: WebUI Preact Migration, WebUI Design Mockup, and New Logo and Icons, whose logo the header shows, and Favorite and Blacklist Filter Modes, whose filter controls the Filter tab carries, and WebUI In-App Dialogs, whose dialogs open inside the panel.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Below 800 px of viewport width, or on a touch screen (coarse pointer) below 500 px of viewport height, the panel is a full-screen overlay with the same tabs; otherwise it sits beside the player.
- The breakpoints use viewport size and pointer type, not the user agent.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Panel | ✅ Complete | The side panel beside the player or as a full-screen overlay, with the Library, Filter, and Tags tabs, one panel button, a resize handle, and its state remembered per device. |
| Phone layouts | ✅ Complete | A phone on its side fills the screen with the player, the installed app stays clear of the safe-area insets, and a reconnecting indicator shows while the status line is hidden. |

#### Panel slice

**Scope**

- The main page is a header bar, the player with its overlay controls, and the footer status line, as today.
- The header holds the logo, which New Logo and Icons puts there in place of the app name, and the current file name.
- The header has no settings icon: the Settings tab is reached from the panel's tab row.
- Photo duration stays in the header.
- The preset dropdown and randomization mode stay in the header.
- The pairing token prompt keeps showing in the header, labeled "Pairing token", when the server asks for pairing.
- Before anything plays, the player says "Tap to play, or open the panel to choose a preset or filter." in place of today's "Click here to play (choose a preset or open Filter…)", and a tap or Play starts a random pick, as today.
- When the server fails the compatibility check, the panel still opens, the Library tab shows the compatibility message in place of the grid, and Play shows its notice.
- Play's notice is the in-app notice "Cannot play: server compatibility check failed.", shown for Play, a tap on the player, and Next at the end of history, in place of today's status line message.
- A panel host: at most one panel is open at a time.
- Beside the player, the panel sits on the right by default or on the left as a per-device setting.
- A drag handle between the panel and the player sets the panel's width, from 360 px to whatever leaves the player 400 px wide, starting at 420 px. The handle also takes the arrow keys while it has focus.
- A remembered width wider than the window allows shows at the widest the window allows, and stays remembered for a wider window.
- The panel has a single row of icon-only tabs: Library, Filter, Tags, Stats, and Settings, each with a tooltip and an accessible name.
- Stats and Settings join the tab row with WebUI Stats Panel and WebUI Settings Panel, so this milestone's row holds Library, Filter, and Tags.
- Library, Filter, and Tags keep the icons the player's buttons for them use today (`browse`, `filter_alt`, and `tag`).
- This milestone builds the Library, Filter, and Tags tabs from the library overlay, filter dialog, and tag editor, moved in as they are.
- One Close button at the end of the tab row closes the panel, in place of the library overlay's, filter dialog's, and tag editor's own Close.
- The player's Library, Filter, and Tags buttons give way to one panel button, which opens the panel on its last tab, Library the first time, and closes the panel when it is open.
- The panel button's icon shows the panel's side and whether it is open (`right_panel_open` and `right_panel_close`, or their left counterparts), and it is orange while the panel is open.
- Favorite and Blacklist stay on the player.
- Choosing a tile in the Library tab plays it in the player beside the panel. As the overlay, choosing a tile plays it and closes the overlay, as the library overlay does today.
- Beside the player, the Filter tab's Apply and Cancel leave the panel open. As the overlay they close it, as the filter dialog does today.
- The Filter tab's Cancel puts back the applied filter and the saved presets, as the mockup's does.
- Leaving the Filter tab, for another tab or by closing the panel, drops its unsaved changes, as closing the filter dialog does today.
- Leaving the Tags tab with unsaved changes asks "Discard changes?" first, as the tag editor's Close does today.
- While Auto Tag scans, the Tags tab can't be left, and the panel's Close is disabled, as the tag editor's Close is today.
- The Tags tab's Save closes the panel at every width, as the tag editor's Save closes the editor today.
- The Tags tab keeps the tag editor's pause and resume, and the other tabs leave playback going.
- Escape closes the top dialog, or else the panel, or else pseudo-fullscreen.
- The WebUI remembers its per-device state across a page refresh, as the desktop remembers its own across restarts.
- This milestone adds one per-device store and remembers in it whether the panel is open, its side, width, and last tab.
- A panel remembered open opens on its last tab when the page loads, and that tab starts as if it had just been opened.
- The panel and the dialogs stay inside the fullscreen stage, so they work in fullscreen as the overlays do today, including iOS pseudo-fullscreen.

**Traps**

- The tag editor, filter, and library overlays are each `position: fixed; inset: 0` with `z-index: 1000`, so they cover the player while it keeps playing underneath (measured).
- The tag editor pauses playback when it opens and resumes it when it closes (`pauseForTagEditor` and `resumeAfterTagEditor`).
- Mobile browsers are detected by user agent (`getClientType` in `src/api/coreApi.ts`) (measured).
- When the server fails the compatibility check, the library overlay doesn't open (`open` in `src/library/library.ts`), and play, pairing, and events stop.
- Play while the compatibility check has failed shows its message on the status line (`pickRandom` in `src/playback/player.ts`).
- Browser storage is kept per address, so on one device the WebUI opened at `localhost`, at the LAN address, and through an HTTPS proxy remembers three separate sets of state (inferred).
- The filter dialog's Refresh does nothing before the dialog has loaded once (`refresh` in `src/filter/filterDialog.ts`).
- The library grid reflows by itself when its width changes, through a `ResizeObserver` (`libraryGridController.ts`).
- The bundled Material Symbols font has `right_panel_open`, `right_panel_close`, `left_panel_open`, and `left_panel_close` (measured).
- happy-dom's `setViewport` changes the window size and fires `resize` and media query `change` events, and its `matchMedia` always reports a fine pointer, with no setting to change it (measured).

**Acceptance**

- The main page shows the header bar with the logo and the current file name, the player with its overlay controls, and the footer status line, and the header has no settings icon.
- At most one panel is open at a time, in component tests of the panel host.
- Below 800 px of viewport width, or on a touch screen below 500 px of viewport height, the panel opens as a full-screen overlay with the same tabs, and closing it returns to the player. Otherwise it opens beside the player on the side set for the device. Shown by panel host tests of the breakpoints by width and by pointer and height, and of the panel side.
- Beside the player, the panel's width stays between 360 px and the width that leaves the player 400 px wide, and starts at 420 px. It changes by dragging the handle or with the arrow keys on it, and is remembered per device. The video stays visible beside the panel. Shown by panel host tests of the width limits and memory.
- The tabs are one row of icons, each with a tooltip and an accessible name, and the Library, Filter, and Tags tabs use `browse`, `filter_alt`, and `tag`, in panel host tests of the tabs' accessible names.
- The player shows one panel button and no Library, Filter, or Tags button. The panel button opens the panel on its last tab and closes an open panel, and Favorite and Blacklist stay on the player. Shown by panel host tests of the panel button and of tab selection and the last tab.
- Choosing a tile plays it beside the panel, or plays it and closes the overlay, in component tests of choosing a tile beside the player and as the overlay.
- Beside the player, the Filter tab's Apply and Cancel leave the panel open; as the overlay, they close it. Shown by component tests of the Filter tab's Apply and Cancel beside the player and as the overlay.
- After a page refresh, whether the panel is open, its side, width, and last tab are each as they were, in a component test of a page refresh keeping the panel's state.
- Resizing the window across a breakpoint moves an open panel between side panel and overlay without losing its state, in panel host tests of the breakpoints.
- The panel works in fullscreen, in component tests of the panel in fullscreen and pseudo-fullscreen.
- The layout does not depend on the user agent, in panel host tests of the breakpoints by width and by pointer and height.
- Before anything plays, the player shows "Tap to play, or open the panel to choose a preset or filter.", and a tap or Play starts a random pick.
- When the server fails the compatibility check, the panel opens, the Library tab shows the message in place of the grid, and Play shows its notice, in component tests of the compatibility-failure state.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone and a desktop browser.

**Evidence**

- The panel host is `src/panel/panelHost.ts`, the panel's tab row, pages, and resize handle are `src/ui/Panel.tsx`, and the per-device store is `src/state/deviceStore.ts`, one `localStorage` entry per setting as JSON under `rr_device.`, read with a fallback. The library overlay, filter dialog, and tag editor are the tabs' contents as they were, without their own Close; their element ids stay, for WebUI Library Tab and WebUI Tags and Filter Tabs to rework.
- The host shows and hides the panel, the handle, and the tab pages by their `hidden` before a tab starts, so the library grid measures itself shown, as the overlay's `display` did. The stage takes the panel's side, mode, and width as attributes and a CSS variable without rendering again, and the tab row and the handle render apart from the pages, so dragging the handle doesn't render the player or the tabs.
- A tab can refuse to be left: the Tags tab does while Auto Tag scans and when the user keeps their changes at "Discard changes?". Other requests are ignored until it answers.
- The Filter service's open state now means the tab shows. Opening puts back the applied filter on General before it loads, so changes the tab was left with don't show while it loads again, and changes made while it loads are kept, the load then taking only the sources, tags, and presets, as Refresh does. Refresh before a first load loads the tab, which a panel remembered open on Filter needs when its first load fails. Nothing loads into the Filter tab while the server fails the compatibility check, Refresh included.
- A panel remembered open shows its tab when the page loads and starts it once the server has passed or failed the compatibility check, so no tab loads from a server that hasn't been checked.
- Nothing loads into the Tags tab while the server fails the compatibility check, and its Save and Scan Files send nothing, as for the Filter tab, so a Tags tab remembered open that starts on a failed check loads nothing.
- The handle's width is measured while it shows, with the stylesheet's 12 and 20 px standing in until then. A click on the handle that doesn't drag leaves the remembered width, which can be wider than the window allows.
- Beside the player, Next, Previous, and a swipe still change the item playing while the Tags tab shows, and the tab keeps the tags of the item playing when it showed, so its Save writes to that item. WebUI Tags and Filter Tabs makes the tab follow the playing item.
- Closing the Tags tab resumes only the play it paused: a video the user played or paused while the tab showed stays as they left it, and nothing resumes once another item, or the same one again, has started, so an item played again while the tab showed isn't played and recorded once more. A photo the tab held still records its play again as it resumes. WebUI Auto-Pause and Photo Scrub Bar replaces this pause and resume, and resumes a photo without recording its play again.
- The handle sits beside the panel, not in it, so closing the panel with focus on the handle gives focus to the panel button too.
- Stats and Settings are not in the tab row yet; WebUI Stats Panel and WebUI Settings Panel add them.
- The stylesheet takes the mockup's `--surface`, `--surface-border`, and `--icon` tokens and its panel, tab row, and handle rules. The overlays' full-screen positioning and backgrounds went, and their narrow layouts follow the panel's width through a container query, since beside the player the panel is narrow at any window width.
- happy-dom's `setViewport` fires `resize` and media query `change` events, its `matchMedia` always reports a fine pointer, so the touch screen tests stub it, and it applies the stylesheet, so the tests read beside or overlay from the panel's computed position. It parses the container query without applying it (all measured).
- The mockup already shows this layout. Its panel now gives focus back on closing only when focus was in the panel or on its handle, as the app does, where before it gave focus back to whatever opened the panel; its check closes the panel with focus outside it and with focus on its Close. Until later milestones, the app differs from it as they say: the header keeps the preset, randomization mode, and photo duration (WebUI Library Tab and WebUI Settings Panel); the tab row has three tabs (WebUI Stats Panel and WebUI Settings Panel); the Library tab keeps today's controls (WebUI Library Tab); the Tags tab keeps its Edit Tags and Auto Tag tabs and Save closes the panel, leaving the Tags tab asks first while leaving the Filter tab drops its changes, and no orange dot marks unsaved changes on the Filter and Tags tabs or the panel button (WebUI Tags and Filter Tabs); playback doesn't pause while the panel is the overlay, only while the Tags tab shows (WebUI Auto-Pause and Photo Scrub Bar); the arrow keys don't move between the panel's tabs (WebUI Keyboard Navigation and Focus); and the overlay has no safe-area padding, a touch screen below 500 px of height keeps the header and status line, and no reconnecting indicator shows on the player (the Phone layouts slice). `check.mjs` passes 749 checks.
- New WebUI tests:
  - the device store: settings kept and read back, a missing, unreadable, or wrong value read as its fallback, and storage the browser refuses;
  - the panel host: the breakpoints at 799 and 800 px of width and at 499 and 500 px of height on a touch screen, a short window with a mouse, a tablet in landscape, an open panel crossing them keeping its tab with no tab started or left, the side, the width's start, limits, touch handle, the stage's width, and memory, opening on Library then the last tab, one page at a time, a tab refusing to be left, other requests ignored while it decides, closing only as the overlay, and memory of open and tab, with what can't be read falling back;
  - the page: the header, the empty state and its tap, the one panel button with Favorite and Blacklist and no Library, Filter, or Tags button, its last tab, icons by side and state, and orange while open, the tabs' names, tooltips, and icons, one tab page at a time, Close giving focus back to the panel button, Escape, the breakpoints by width, by pointer and height, and not by user agent, crossing a breakpoint keeping the Filter tab's changes, dragging the handle and its keys on either side, a page refresh keeping the panel's state, choosing a tile beside the player and as the overlay, Apply and Cancel beside the player and as the overlay, Refresh after a failed load, the Tags tab asking before it is left and Save closing the panel, the panel in fullscreen and pseudo-fullscreen, and the compatibility failure;
  - the panel's error boundary, which leaves the player, header, status line, and connection working;
  - the Filter service's Cancel, starting over on General on open before it loads, keeping changes made while it loads, Refresh before a first load, and loading nothing while the server fails the compatibility check, the tag editor's close saying whether the tab can hide, and the Tags tab staying while Auto Tag scans;
  - the panel host's handle measured while it shows, and a remembered tab started once, only while the panel is still open on it; the page's click on the handle that doesn't drag, a remembered tab starting after the version check, and a Filter tab remembered open loading nothing from an incompatible server, nor on its Refresh;
  - the player's resume after the tag editor leaving a play or pause the user made and an item started since, the tag editor loading, saving, and scanning nothing while the server fails the compatibility check, and the page's Escape with focus on the handle, and a Library or Tags tab remembered open with a server that fails the check.
- Existing tests now open and close the tabs through the panel. Tile plays that closed the overlay, and the filter save failure that kept it open, run at 600 px wide; the storage tests allow the panel's own keys.
- The four markup snapshots changed for the panel and the panel button in place of the three buttons, the new empty state and pairing label, the tab contents without their Close and `display`, and the tag editor's generated ids, which moved by one now that it renders after the Filter tab, and nothing else.
- Each guard was broken on purpose and its tests failed (measured, of 874):
  - the overlay at exactly 800 px: 2;
  - no short touch screen rule: 3;
  - the user agent deciding: 1;
  - no widest width: 1;
  - open not remembered: 2;
  - a remembered open tab not started: 2;
  - closing beside the player too: 33;
  - a tab unable to refuse being left: 5;
  - no focus back to the panel button: 1;
  - Cancel keeping the changes: 3;
  - Refresh needing a loaded tab: 3;
  - Save leaving the panel open: 7;
  - no compatibility message in the Library tab: 3;
  - Play's compatibility message on the status line: 2;
  - the handle's keys ignoring the side: 2;
  - the panel button ignoring the side: 1;
  - no overlay style: 4;
  - no panel error boundary: 1;
  - Escape not closing the panel: 4.
- The guards added after review failed the same way (measured, of 879):
  - a Filter load with no compatibility check: 3;
  - a remembered tab starting before the version check: 4;
  - a Filter reload replacing changes made while it loads: 1;
  - no start-over before a Filter reload: 1;
  - the handle not measured: 1;
  - a click on the handle remembering the width: 1.
- The guards added after the second review failed the same way (measured, of 885):
  - the tag editor's resume undoing the user's play or pause: 1;
  - the tag editor's resume after another play started: 1;
  - the tag model loading while the server fails the compatibility check: 2;
  - the tag editor's Save sending while it fails: 1;
  - the tag editor's scan sending while it fails: 1;
  - focus on the handle ignored when the panel closes: 1;
  - a remembered tab not started when the check fails: 1.
- The guard added after the third review failed the same way (measured, of 885): a Filter reload replacing a duration being typed and a Favorites choice held while its box is off: 1.
- `npm run verify` passed: 51 test files, 885 tests, the build, and the build output check.
- `CHANGELOG.md`, `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, and `docs/domain-inventory.md` are updated, and the testing checklist's Release Specific checks name the panel's tabs.
- The spot check passed on a phone and a desktop browser.

#### Phone layouts slice

**Scope**

- Phone layouts work in an installed app (standalone display, safe-area insets).
- A phone on its side, by the overlay's short-screen rule (a touch screen below 500 px of viewport height): the header and status line hide and the player fills the screen, as in fullscreen but without the browser's fullscreen mode.
- On a phone on its side, the panel, as the overlay, and the dialogs still open, in layouts that fit a short screen.
- A tablet in landscape, at 500 px or more, keeps the normal layout.
- While the server asks for pairing, the header shows on a phone on its side anyway, so its prompt can be reached.
- While the status line is hidden, on a phone on its side or with WebUI Settings Panel's Show the status line off, a small indicator on the player shows while the connection is lost and reconnecting.

**Traps**

- The stylesheet has one `@media (max-width: 600px)` rule, for the header and the diagnostics line; the panel's narrow layouts follow its own width through `@container panel (max-width: 600px)` (measured).
- happy-dom leaves `env()` and `max()` out of computed styles, but substitutes `var()` and keeps `calc()` (measured).
- `index.html`'s viewport meta has no `viewport-fit=cover`, so `env(safe-area-inset-*)` reads 0 (inferred).
- With `apple-mobile-web-app-status-bar-style` set to `black-translucent`, an installed iOS app draws the page under the status bar, so the header can sit under it today (inferred).
- Only the status line's "SSE reconnecting..." records a lost event stream (`createEventStream` in `src/state/serverConnection.ts`).

**Acceptance**

- On a touch screen below 500 px of viewport height, the header and status line hide and the player fills the screen without the browser's fullscreen mode, and the panel and dialogs open in layouts that fit; a tablet in landscape keeps the normal layout. Shown by component tests of the short-screen layout of a phone on its side.
- As an installed app on a phone, the header, the panel, and the player's controls stay clear of the safe-area insets, in component tests of safe-area insets in a standalone display.
- On a phone on its side the header shows while the server asks for pairing, and while the status line is hidden a reconnecting indicator shows on the player when the connection is lost. Shown by component tests of the short-screen layout and of the reconnecting indicator.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone.

**Evidence**

- A phone on its side is `isShortScreen` in `src/panel/panelHost.ts`, the rule the overlay already used, and the host's `shortScreen` signal follows the window as its mode does. The page puts a `short-screen` class on the body while it holds (`src/ui/App.tsx`), and the stylesheet then hides the header, the status line, and the diagnostics line, keeps only the side insets as the page's padding, and squares the player's corners. The header has `is-pairing` while the server asks for pairing, which keeps it showing.
- Randomization mode and photo duration are still only in the header, so on a phone on its side they can't be reached until WebUI Library Tab and WebUI Settings Panel move them into the panel. A preset can still be chosen in the Filter tab's Presets.
- "Pairing failed." and "Pairing blocked by server compatibility check." show in the in-app notice, with their `last.log` lines, and Pair, the shared held button, is disabled while the token is empty, which is not flagged, in place of "Pair token required.", as the mockup and WebUI Status Line Overhaul have them. So pairing says how it went on a phone on its side, where the status line is hidden. WebUI Status Line Overhaul lists the three as moved by earlier milestones, which it checks are gone from the status line.
- The diagnostics line hides with an `!important` over its own inline display.
- On a phone on its side, the panel's tabs and its Close are 40 px high, the tabs' headings are 1rem, and the text buttons, fields, and selects of the Library, Filter, and Tags tabs and of the dialogs are 38 px, with less padding, as the mockup's `.btn` and `.ctl` are. That takes the Favorites and Blacklisted dropdowns from 36 to 38 px there, as in the mockup. Icon buttons keep their 44 px, and checkboxes their size, as the mockup's do. Dialogs may come within 12 px of the screen's height in place of 32 px, with less padding. Whether they fit is the spot check's, since happy-dom does no layout.
- The selected tab's underline moves up 2 px with the tab row's padding there, so it stays on the row's border. happy-dom computes no `::after` style (measured), so no test reads it.
- `index.html`'s viewport has `viewport-fit=cover`, and the stylesheet reads the insets once, as `--safe-area-top`, `--safe-area-right`, `--safe-area-bottom`, and `--safe-area-left`. The page's padding is at least each inset, and the overlay panel and the stage in fullscreen and pseudo-fullscreen pad by them, since fullscreen on a phone can reach into them with `viewport-fit=cover`. On a phone on its side the player's controls and corner buttons stay at least 12 px from the top and bottom edges and clear of the top and bottom insets, except in fullscreen and pseudo-fullscreen, where the stage already pads by them. That exception leaves out only `:fullscreen`, since an unknown pseudo-class drops a whole rule, and a phone with only `:-webkit-full-screen` uses pseudo-fullscreen. The tests' fullscreen is a stub that no `:fullscreen` rule sees (inferred), so the release check covers fullscreen.
- Only the page's height depends on the display mode, as below, so the safe-area tests give the page a phone's insets in place of a standalone display.
- On an iPad (iPadOS 26.6.2, Full Screen Apps; Windowed Apps looked the same), the installed app left a gap at the bottom of the page and of pseudo-fullscreen from launch until the iPad turned. A temporary on-screen readout, since removed, measured why: at launch, `innerHeight`, `visualViewport`, `100dvh`, `100%`, and the body read the screen's height less the 32 px status bar (1000 of 1032 in landscape, 1344 of 1376 in portrait) while the page drew from the top of the screen. After a turn they read the whole height, except the root element's `clientHeight`, which stayed short. The safe-area insets read the same throughout (top 32, bottom 20), and `100lvh` read the whole height in every reading. Sizing the page by `100%` in an installed app kept the gap in both orientations, by that stuck root height (measured). So the page's height is `--page-height`: `100dvh` in a browser tab, whose toolbars come and go, and `100lvh` in an installed app (`@media (display-mode: standalone)`), where the pseudo-fullscreen stage takes it too, in place of the root element's height. happy-dom drops `dvh` and `lvh`, and its display mode is always `browser` (both measured), so the test reads the rules' text.
- The stylesheet takes `max()` inside `calc()`, which is the same value, since happy-dom drops a declaration with `env()` or a bare `max()`, even from the CSS object model, and keeps `var()`, `calc()`, `calc(max(…))`, and a custom property holding `env()` as text (all measured). The tests set the variables to a phone's insets and read the computed padding.
- The store's `reconnecting` is set when the event stream is lost, and cleared when it opens, when the server fails the compatibility check, which stops it, and when the connection stops (`src/state/serverConnection.ts`). While it is set on a phone on its side, except while the server asks for pairing, which refuses the stream while the header's prompt shows, the player's `#conn-indicator` shows "Reconnecting…" with a turning `sync` icon, which the bundled font has (measured). It renders apart from the player. WebUI Settings Panel's Show the status line will show it too.
- happy-dom keeps an element's computed style when the body's class changes and an ancestor in between had its own computed already (measured), so the page tests read styles through the harness's `currentStyle`, which changes the element itself first.
- The mockup's stage pads by the insets in fullscreen as in pseudo-fullscreen, its player controls and corner buttons take the top and bottom insets on a phone on its side outside both, and its selected tab's underline moves up there, as the app's do. Its check now has a phone on its side hide the header and the status line, and show the header while the server asks for pairing, which failed with the mockup's pairing rule broken, and hide the reconnecting indicator while the server asks for pairing, as the app does, which failed before the mockup had that rule, and its page's height is the dynamic viewport in a tab and the large one in an installed app, with its pseudo-fullscreen stage, as the app's, which the check reads from the rules' text and which failed before the mockup had them. The differences the Panel slice left for this slice are gone. On a phone on its side the app also differs where the header's controls are: the mockup keeps the preset, randomization mode, and photo duration in the Library and Settings tabs, so they stay reachable there, while the app's hide with the header, as above. `check.mjs` passes 757 checks.
- New WebUI tests:
  - the panel host: a short screen on a touch screen below 500 px of height at any width, not with a mouse, and following the window;
  - the server connection: reconnecting set by a lost stream, and cleared when it opens, when it stops, and when the server fails the compatibility check; a failed or blocked pairing in a notice, and an empty token sending nothing;
  - the page on a phone on its side: the header, status line, and page padding gone, the player's corners, and the panel as the overlay; the normal layout on a tablet in landscape, at 500 px of height, on a short window with a mouse, and with an iPhone's user agent and a mouse; turning the phone each way with the panel open; the compacted tab row, headings, and the tabs' and dialogs' text buttons, fields, and selects, with icon buttons and the Auto Tag checkboxes kept, and their sizes on a tablet; the header while the server asks for pairing, with no reconnecting indicator while the stream fails, and a failed pairing's notice; and the diagnostics line;
  - the safe-area insets: the variables reading the screen's insets, and `viewport-fit=cover`; an installed app upright, with the page and the overlay panel padded; a phone on its side, with the page padded at the sides and the controls and corner buttons clear; and pseudo-fullscreen, with the stage padded and the controls keeping their own padding;
  - the reconnecting indicator: shown on a phone on its side while the stream is lost and gone once it opens, off the player beside the status line, and shown when the phone turns while the stream is lost;
  - the page's height: `100dvh` in a tab and `100lvh` in an installed app, for the page and the pseudo-fullscreen stage, read from the rules' text.
- Existing pairing tests now expect Pair disabled while the token is empty, without a flag, and a failed or blocked pairing in a notice with its `last.log` line, in place of the status line.
- The starting markup snapshot changed by the indicator and Pair, now a disabled held button, and nothing else. The Filter and Tags tabs' markup snapshots changed only by their generated ids, which moved by one now that Pair takes one.
- Each guard was broken on purpose and its tests failed (measured, of 903):
  - no short-screen class on the body: 7;
  - a short screen by height alone: 5;
  - the short screen not measured again as the window changes: 4;
  - the header hidden while the server asks for pairing: 1;
  - the header kept on a short screen: 2;
  - the status line kept: 5;
  - the diagnostics line kept: 1;
  - the page's normal padding kept: 2;
  - the player's corners kept: 1;
  - the panel's tab row not compacted: 1;
  - its tabs' rows not compacted: 1;
  - the dialogs not compacted: 1;
  - no `viewport-fit=cover`: 1;
  - an inset not read from the screen: 1;
  - the page's padding ignoring the insets: 1;
  - the overlay panel ignoring them: 2;
  - pseudo-fullscreen ignoring them: 1;
  - the controls on the home indicator: 1;
  - the corner buttons ignoring the top inset: 1;
  - the controls padded twice in pseudo-fullscreen: 1;
  - the indicator beside the status line: 2;
  - the indicator never shown: 2;
  - reconnecting not set by a lost stream: 4;
  - reconnecting not cleared when the stream opens: 2;
  - reconnecting not cleared on a compatibility failure: 1;
  - reconnecting not cleared when the connection stops: 1.
- The guards added after review failed the same way (measured, of 904):
  - a failed pairing on the status line: 3;
  - a blocked pairing on the status line: 2;
  - Pair enabled while the token is empty: 2;
  - the tabs' fields and selects that scroll not compacted: 1;
  - the tabs' headings not compacted: 1;
  - the dialogs' buttons not compacted: 1;
  - icon buttons compacted too: 1.
- The guards added after the second review failed the same way (measured, of 904):
  - the indicator shown while the server asks for pairing: 1;
  - the Auto Tag checkboxes compacted: 1.
- The guards added for the iPad's installed app failed the same way (measured, of 905):
  - the page's height left at `100dvh` in an installed app: 1;
  - the pseudo-fullscreen stage left at the root element's height there: 1;
  - the body not taking the page's height: 1.
- `npm run verify` passed: 52 test files, 905 tests, the build, and the build output check.
- `CHANGELOG.md`, `CONTEXT.md`, and `docs/domain-inventory.md` are updated, WebUI Settings Panel now has the status bar and `theme-color` follow the theme, WebUI Status Line Overhaul lists the pairing messages as moved by earlier milestones and has a trap for the dialog messages a phone on its side hides until it moves them, Auth Cutover for API and Admin's pairing trap names the notice in place of the status line, and the testing checklist's Release Specific checks have this milestone's release checks.
- The spot check passed on a phone, and on an iPad as an installed app: the page and pseudo-fullscreen reach the bottom of the screen at launch in landscape and in portrait and after turning it, and the page doesn't drag.

#### Release checks

- Manual: On a phone, a tablet, and a desktop browser, and as an installed app on Android and iOS, the panel opens beside the player or as an overlay by width, and a phone on its side fills the screen with the player.
- Manual: As an installed app on an iPhone and an Android phone, the header (upright) and the panel and the player's controls (upright, on its side, and on Android in fullscreen) stay clear of the notch, the status bar, and the home indicator; with the phone on its side, stopping the server shows the reconnecting indicator on the player.
- Manual: As an installed app on an iPad, launched in landscape and in portrait, the page and pseudo-fullscreen reach the bottom of the screen, and still do after turning it.

#### Not included

- The header's admin icon at its right, which is WebUI Admin Section.
- Moving photo duration from the header into the Settings tab, which is WebUI Settings Panel.
- Moving the preset dropdown and randomization mode from the header into the Library tab, which is WebUI Library Tab.
- Choosing the panel's side in the Settings tab, which is WebUI Settings Panel.
- Reworking the Library tab, which is WebUI Library Tab.
- Reworking the Tags and Filter tabs, which is WebUI Tags and Filter Tabs.
- The Tags tab's Save leaving the panel open, which is WebUI Tags and Filter Tabs.
- The Tags tab following the playing item, which is WebUI Tags and Filter Tabs. Until then, beside the player, it keeps the item playing when it showed, and its Save writes to that item.
- The Stats tab, which is WebUI Stats Panel.
- The Settings tab, which is WebUI Settings Panel.
- The arrow keys, Home, and End moving between the panel's tabs, which is WebUI Keyboard Navigation and Focus.
- Replacing the tag editor's pause and resume, which is WebUI Auto-Pause and Photo Scrub Bar.
- Per-device state that later milestones add, which each remembers in the same store: WebUI Library Tab, WebUI Tags and Filter Tabs, WebUI Settings Panel, the player milestones, and duplicate review in Admin Refresh, Backup, and Duplicate Review.
- The playing item and its position, which is Resume Position and Session Continuity.
- Admin and duplicate review as panel tabs. They open in a full-page admin view, which is WebUI Admin Section.

### M12f3 - WebUI Drag Reordering

- **Status**: ✅ Complete
- **Goal**: Tag categories and presets reorder by dragging a handle, or with the arrow keys on it, instead of up and down icons.
- **Depends on**: WebUI In-App Dialogs, whose Edit button ends the row the drag handle starts.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Tag categories and presets reorder by drag and drop instead of up and down arrows, and the rows' up and down icons go.
- Each row has a visible drag handle, the only place a drag starts, so dragging elsewhere on a row still scrolls on a touch screen.
- The drag handle starts each row, before its name, and the Edit button ends it.
- A drag starts once the pointer has moved a few pixels on the handle, so a tap on it changes nothing.
- A dragged category hides its tags until it is dropped, so only its header moves, however many tags it has.
- The up and down arrow keys move a row while its handle has focus, and screen readers hear the new position.
- Uncategorized stays last, as today, and shows its handle dimmed and disabled, so its name lines up with the other categories'.
- A new order stays pending until Save or Apply, as a move does today.
- After Add Preset adds a preset, focus moves to the new preset's drag handle, where today it moves to the up icon, or to the Edit button while the preset is the only one.

#### Acceptance

- Category and preset rows have no up or down icons, and each has a drag handle at its start, before its name.
- Tag categories and presets reorder by dragging their handle, and with the up and down arrow keys on a focused handle. A drag that starts elsewhere on a row scrolls instead, screen readers hear the new position, and Uncategorized stays last with its handle disabled. Shown by WebUI tests of reordering with the arrow keys and of the drag logic deciding where a dragged row lands.
- A drag starts only once the pointer has moved a few pixels on the handle, and a dragged category's tags hide until it is dropped, in WebUI tests of a tap on the handle and of dragging a category.
- A new order stays pending until Save or Apply.
- After Add Preset adds a preset, focus is on its drag handle, pressed with the pointer and with the keyboard, in WebUI tests of Add Preset.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check of dragging on a touch screen.

#### Evidence

- The reordering rules are `src/reorder/reorder.ts`, and the handle, its help line, the announcement, and the drag are `src/ui/Reorder.tsx`, which the tag editor and the filter dialog both use. The services move a category or a preset to a place (`moveCategory(id, to)` and `movePreset(from, to)`), and category rows no longer say whether they can move up or down.
- The rows stay where they are in the page during a drag: the dragged row and the rows it passes move by transforms, and the order is set when it is dropped. Preact draws the rows, and moving a focused button in the page drops its focus in happy-dom (measured). The mockup moves the rows themselves, and what the user sees is the same.
- The dragged row shows no higher than the first row and no lower than the last, in the app and the mockup. Browsers count a moved row in how far its list scrolls, so below the last row it would lengthen the list, and scrolling near the edge would run on under it. Where it lands still goes by the pointer, so a row as tall as the first or last still lands past it. The app places the dragged row again whenever the list scrolls, such as by a wheel or a touchpad; the mockup already placed it every frame.
- After a drop, the list keeps where it was scrolled to, and the handle takes focus without scrolling once the rows render in their new order, in the app and the mockup. The user found the list scrolling after a drop in a real browser, to the top on desktop and a little on a phone. happy-dom does no layout, so which cause it was isn't measured; the fix covers each one suspected: focusing the handle at its old place before the rows move, a focus that scrolls, and the browser scrolling the list as the rows move.
- The rows are measured once the dragged row shows lifted, so a dragged category's tags are already hidden. Measured when the drag starts instead, the category drag test fails.
- The tag editor renders the help line and the announcement only once it has its view, so the page's starting markup is unchanged.
- happy-dom lays nothing out (every box is empty, measured), so the drag tests give the rows positions. It applies the WebUI's stylesheet (measured), so the tests read the dragged category's hidden tags and the handle's `touch-action: none` from it. The scroll test also gives the preset list its size and its `overflow-y`, which happy-dom's computed style doesn't take from the `overflow` shorthand (measured). The drop tests stand in for the browser: a focus without `preventScroll` scrolls the list to its top, and so does the drop itself, before the page renders.
- The bundled Material Symbols font has `drag_indicator` (measured).
- New and changed WebUI tests:
  - the rules: where a dragged row lands, up, down, across several rows, among rows of different heights, and at the ends; where the dragged row shows, inside the list; how far the rows it passes slide; when a drag starts; the arrow keys; scrolling near the edges; and the announcement;
  - the services: a category moves to a place among those that can move, Uncategorized staying last, and a preset to a place, refusing a move outside the list;
  - in the tag editor and the filter dialog pages:
    - each row's handle, name, and Edit, with no up or down icons, and Uncategorized's disabled handle;
    - the arrow keys moving a row, with focus kept on its handle, the announcement, Save or Apply's star, and the saved order, and doing nothing at the ends;
    - a drag that follows the pointer past each row its middle crosses, staying inside the list, with the rows it passes sliding out of its way, a dragged category's tags hidden until the drop, then the new order, focus, and the announcement;
    - a dragged preset staying under the pointer while the list scrolls, and landing where the pointer is;
    - a drop keeping the list where it was scrolled to, with one focus, on the dropped handle, without scrolling;
    - a tap on a handle, a drop where the drag started, and a drag that starts on a row's name or tags, each leaving the order;
    - Add Preset's focus on the new preset's drag handle, pressed with the pointer and with the keyboard, alone and among others.
- The tags and filter markup snapshots changed for the handles, the removed up and down icons, the help line, and the announcement, and the Edit Tag dialog's heading id moved by one, and nothing else.
- Each guard was broken on purpose and its tests failed (measured, of 817 unless noted):
  - the dragged row's top in place of its center: 2;
  - no move down past a row: 5;
  - rows measured before the tags hide: 1;
  - a drag starting without the pointer moving: 3;
  - no focus back on the handle after a move: 2;
  - no announcement: 5;
  - Uncategorized's handle enabled: 2;
  - no `touch-action: none` on the handle: 2;
  - a dragged category's tags shown: 1;
  - Add Preset's focus on Edit: 4;
  - the arrow keys left to scroll: 2;
  - a drop where it started counted as a move: 1;
  - the rows it passes not sliding: 2;
  - Uncategorized movable: 1;
  - the dragged row shown past the list's ends: 2 (of 820);
  - the dragged row not placed again as the list scrolls: 1 (of 820);
  - the list's scroll position not kept after a drop: 2 (of 822);
  - the dropped handle focused with scrolling: 2 (of 822);
  - the handle focused at its old place before the rows move: 2 (of 822).
- `npm run verify` passed: 48 test files, 822 tests, the build, and the build output check.
- The mockup's drag starts once the pointer has moved more than 5 px, and a dragged category hides its tags until it is dropped. The user tried it on a phone and an iPad. It also keeps the dragged row within the list, and after a drop keeps where the list was scrolled to and focuses the handle without scrolling, as the app does. `check.mjs` passes 745 checks; it does no layout and can't drag, so no check was added.
- `CHANGELOG.md`, `CONTEXT.md`, and `docs/domain-inventory.md` are updated.
- The spot check passed: the user dragged tag categories and presets by their handles on a touch screen, and a drag elsewhere on a row scrolled. With the drop fix, the user dragged again on desktop and on a phone, and after each drop the list stayed where it was scrolled to and focus was on the dropped handle.

#### Release checks

- Manual: In the installed app on Android and iOS, dragging a tag category and a preset by its handle reorders them, and a drag that starts elsewhere on a row scrolls.

### M12f2 - WebUI In-App Dialogs

- **Status**: ✅ Complete
- **Goal**: The WebUI asks for names and confirmations, and shows anything the user must notice or act on, in its own dialogs, styled like the rest of the WebUI, instead of the browser's `prompt`, `confirm`, and `alert`.
- **Depends on**: WebUI Preact Migration, so the dialog is a Preact component the migrated screens use, and WebUI Field Validation Pattern, whose pattern its name fields use.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The dialog component and every conversion to it land together in this milestone.
- The dialog component is themed and shown inside the fullscreen stage, so it works in fullscreen, including iOS pseudo-fullscreen.
- It can stack one dialog above another. Escape or a click outside closes only the top dialog, and focus returns to where it was.
- Enter in a dialog's field saves it.
- A confirmation opens with Cancel focused, so Enter never confirms it by default, and its confirming button names the action, such as a red Delete.
- Every dialog in the WebUI uses the component, never a browser dialog.
- Tag editor: chips lose their delete icon, and category rows lose their rename and delete icons for one Edit button.
- A chip's edit icon opens the Edit Tag dialog. A category's Edit button opens a new Edit Category dialog with the name, in place of today's rename prompt.
- Edit Tag and Edit Category each have Delete, which asks first in a dialog stacked above, with today's wording: `Delete tag "{name}"?` and `Delete category "{name}"? Tags will become Uncategorized.`
- Filter dialog's Manage Presets: preset rows lose their rename and delete icons for one Edit button.
- A preset's Edit opens a new Edit Preset dialog with the name and Delete, which asks `Delete preset "{name}"?` in a dialog stacked above. It replaces today's rename prompt.
- Category and preset rows keep their up and down icons.
- The Edit Category and Edit Preset names use the field validation pattern. They are flagged when another category or preset has the name, ignoring case, and Save is disabled while the name is taken or empty.
- Their tooltips are "Use a name no other category has." and "Use a name no other preset has.".
- They replace the alert "Category already exists." and the status message "That name is already in use.".
- The tag editor's two **Discard changes?** confirmations and its new category name move to the component, keeping their wording.
- New category's name uses the field validation pattern as Edit Category's does: a name another category has, ignoring case, is flagged as it is typed with "Use a name no other category has.", and Save is disabled while the name is taken or empty, so creating and renaming a category follow one rule.
- The field validation pattern changes for an empty required field: it is never flagged, and the action that needs it is disabled, dimmed, and pressing it does nothing.
- That replaces WebUI Field Validation Pattern's rule that an emptied field is flagged once typed in, for every field that uses the pattern: the filter dialog's new preset name and the Edit Tag name, as well as this milestone's names.
- An empty required field disables its action even while another field the action uses has a problem.
- Disabled is the button's disabled state: it can't be focused, and screen readers hear it as unavailable.
- An action whose fields all sit right next to it is disabled, with no icon on it, while any of them has a problem, and the field's red icon and tooltip say why.
- Those fields are a field beside its button, such as the new preset name beside Add Preset and New tag name beside Add tag, or the fields of the dialog the action is in, such as New Category, Edit Category, and Edit Preset, since the dialog has the user's attention.
- An action that uses a field elsewhere is held while that field has a problem: the red icon shows on the action, and pressing it moves to the field. Apply and Update Preset are, and so is Add Preset for a problem in a General field, such as a duration that is not valid, while its name is valid.
- The filter dialog's Presets section keeps its icon while the new preset name is flagged.
- The tag editor's New tag name uses the pattern: a name another tag has, ignoring case, is flagged with "Use a name no other tag has.", and Add tag is disabled while the name is empty or taken.
- The Edit Tag name can still take another tag's name, since the server merges the two tags.
- Add tag only creates the tag in the chosen category, no longer putting it on the playing item, and opens the category.
- After Add tag, focus moves to the new chip's add icon, so one more press puts it on the item, or to its Edit button while no item is playing and add is disabled.
- After Add Preset adds a preset, focus moves to the new preset's up icon, or to its Edit button while it is the only preset and can't move up.
- Both move focus to a button for keyboard, mouse, and touch alike, since a button brings up no on-screen keyboard. The mockup does the same, with the new preset's drag handle in place of its up icon.
- A notice: a message the user must see, shown in the dialog component with one OK.
- A notice is relayed to `last.log` as a status message is today, with the same text, which leaves out file and preset names.
- The WebUI's message rule, dialog side: anything the user needs to notice or act on (an error from their own action, a failure that stops what they asked for, or a confirmation, meaning a prompt that asks before an action, such as Delete or Discard changes) shows in this in-app dialog, never in a browser-native dialog and never on the status line.
- Field problems use the pattern from WebUI Field Validation Pattern instead, and the status line keeps only background information that shouldn't interrupt the user, such as connection state, refresh progress, and sync notices.
- Work from this milestone on follows the rule.
- Apart from the name checks, each dialog's wording and outcome stay as they are today; only how it is shown changes.

#### Traps

- Preset rename in the WebUI opens the browser's native prompt, which does not match the WebUI's styling and does not suit the WebUI when it runs as an installed web app (measured).
- The WebUI uses native dialogs in nine places: preset delete and rename; tag editor category rename, duplicate-name alert, and category delete; tag delete; two **Discard changes?** confirmations; and new category name (measured).
- The native dialogs are in `src/filter/filterDialog.ts` and `src/tags/tagEditor.ts`, which take `confirm`, `prompt`, and `alert` as options.
- The two **Discard changes?** confirmations are the tag editor's Close and Refresh (`close` and `refresh` in `src/tags/tagEditor.ts`).
- The alert "Category already exists." comes from `renameCategory` in `src/tags/tagEditor.ts`, and the status message "That name is already in use." from `renamePreset` in `src/filter/filterDialog.ts`.
- Today an empty name in new category does nothing once confirmed.
- Today new category accepts a name another category has, and the server stores both, since it keys categories by id (`UpsertCategory` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs`).
- Today Add tag with another tag's name moves that tag to the chosen category and adds it to the playing item (`addTag` in `src/tags/tagEditor.ts`), while the server keeps the tag's stored capitalization (`UpsertTag`). Adding an existing tag to the item stays one click on its chip's add icon.
- Renaming a tag onto another tag's name merges the two on the server (`RenameTag`).
- The pattern's empty rule is `isFlagged` in `src/validation/fieldValidation.ts`, and `HeldButton` in `src/ui/FieldValidation.tsx` only marks an action `aria-disabled`.
- The mockup's copy of the pattern is `ValidatedField` and `holdAction` in `build/common.js`, which the mockup's admin, recovery, pairing, and settings fields share, so the empty rule changes there too.

#### Acceptance

- The WebUI calls no `prompt`, `confirm`, or `alert`, in a check that no native dialog calls remain.
- Every dialog matches the WebUI's theme and shows and works in fullscreen, in WebUI tests of the dialog component showing in fullscreen.
- A delete confirmation opens stacked above its edit dialog, with Cancel focused and a red Delete. Escape or a click outside closes only the top dialog, and focus returns to where it was. Enter in a dialog's field saves it. Shown by WebUI tests of the dialog component's stacking, Escape and a click outside, Enter, Cancel focus, and focus returning.
- Chips have no delete icon, and category and preset rows have no rename or delete icons. Edit Tag, Edit Category, and Edit Preset each have Delete, which asks first with today's wording, in WebUI tests of the edit dialogs with Delete asking first and canceling.
- An Edit Category or Edit Preset name that another category or preset has, ignoring case, is flagged with the field validation pattern and disables its Save without an icon on it, and an emptied one is not flagged and disables Save. Neither "Category already exists." nor "That name is already in use." shows. Shown by WebUI tests of both names with the field validation pattern.
- The tag editor's Close and Refresh confirmations and new category name use the dialog component, keep their wording, and confirming or canceling does what it does today, apart from the name check, in WebUI tests of confirm and cancel on each converted dialog.
- In new category, a name another category has, ignoring case, is flagged with the field validation pattern as it is typed and disables Save without an icon on it, and an empty name disables Save without a flag, in WebUI tests of the new category name.
- An empty required field is never flagged, and the action that needs it is disabled, including while another field it uses has a problem: the new preset name with Add Preset, the Edit Tag name with Save, and New tag name with Add tag, in WebUI tests of each.
- A taken new preset name or New tag name is flagged and disables Add Preset or Add tag without an icon on the button, while a problem in another field holds Add Preset with its icon, in WebUI tests of both.
- An Edit Tag name another tag has is not flagged, and Save renames the tag, in a WebUI test of the Edit Tag name.
- A notice shows its message in the in-app dialog and is relayed to `last.log` with the text a status message with that wording is relayed with today, in a WebUI test of a notice and its `last.log` line.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check in an installed web app.

#### Evidence

- The dialog is `src/ui/Dialog.tsx` (the modal, the name dialog, the confirmation, the notice, and the host the stage shows them in) and `src/dialogs/dialogs.ts` (the page's confirmations and notices). The filter dialog and tag editor take the dialogs service in place of `confirm`, `prompt`, and `alert`.
- The dialog is a native `<dialog>` opened with `showModal()`, so each one is in the browser's top layer above the last, above the overlays, and above fullscreen. happy-dom opens it but doesn't move focus, handle Escape, or support `:modal` (measured), so the component focuses, handles Escape, and returns focus itself. It also treats the browser's `cancel` and `close` events, as Android's back gesture sends, as a cancel.
- A notice relays the same `last.log` line a status message with that text gets, through the store's `relayStatus`, which `setStatus` now calls. Nothing shows a notice yet; WebUI Status Line Overhaul moves the first messages to it.
- The field validation pattern's rules are `isFlagged` (never for an empty field) and `actionBlock`, which decides whether an action is disabled or held and by which field. `HeldButton` sets the real `disabled` attribute when disabled.
- The edit dialogs render after the filter dialog and the tag editor rather than inside them. Inside, those screens' button rules outranked the dialog's own, which turned the red Delete white in the filter dialog and dark in the light-theme tag editor.
- Preset rows and tag chips are keyed by name, so a rename replaces the row whose Edit opened the dialog, and a delete removes it. When that happens, focus goes to the renamed row's Edit, or after a delete to the next row's, or the previous one's when the last was deleted (for tags within the same category, and for categories the next or previous category with Edit), and to the page when none is left. Focus returns after the render that closed the dialog, since Preact unmounts the dialog before it updates the rows beside it (measured).
- Add tag returns the new tag's name and Add Preset says whether it added, and the tag editor and the filter dialog move focus once the new chip or row has rendered. Without that, and with Add tag still putting the tag on the item, the 11 new and changed tests of Add tag and Add Preset failed (measured).
- Deviations from today's outcomes:
  - Save with an unchanged name in Edit Category or Edit Preset closes the dialog without a pending change, as Edit Tag already did. Today's rename prompts left a pending change, which lit Save or starred Apply.
  - Uncategorized has no Edit button, as the mockup shows, where today it had disabled rename and delete icons.
  - Add tag no longer puts the new tag on the playing item; today it did, so a tag meant only for the catalog had to be taken off the item again.
  - New Category and Edit Category take Uncategorized's name as taken, ignoring case, even while its row is hidden because no tag is uncategorized. Today New Category accepted it, and the new category then showed as Uncategorized, with no way to rename or delete it.
- New and changed WebUI tests:
  - the dialogs service: order, answers, and a notice's log text;
  - the dialog component:
    - a name dialog opening focused and selected;
    - a confirmation stacked above it, with Cancel focused and a red Delete;
    - Escape and a click outside closing only the top dialog, and a press inside not counting;
    - focus returning each time, and to a fallback only when what had focus is gone;
    - Enter saving, and a problem disabling Save and Enter;
    - a notice;
    - the browser's cancel and close;
  - in the page:
    - a dialog inside the stage in fullscreen and in pseudo-fullscreen, where Escape closes the dialog and stays in pseudo-fullscreen;
    - a notice and its `last.log` line, with a log text in place of a preset name;
  - the pattern's rules;
  - in the filter dialog and tag editor services and pages, each converted dialog confirming and canceling with today's wording, Delete stacked above its edit dialog, each name rule, Add Preset and Add tag disabled or held, and Edit Tag taking another tag's name;
  - in the pages, focus after a preset or tag rename and after deleting a preset, a tag, or a category in the middle, at the end, and alone;
  - in the tag editor service and page, Add tag creating only the tag and opening its category, and in the pages, focus after Add tag on the new chip's add, or its Edit while nothing plays, and after Add Preset on the new preset's up icon, or its Edit when it is the only preset, each pressed with the pointer and with the keyboard.
- The native dialog check parses the WebUI's source with the TypeScript compiler and is tested on samples. Before the conversion it found the nine native dialog calls and the five `window` fallbacks (measured). The screen tests' page throws on any native dialog.
- The tags, filter, and whole-page markup snapshots changed for the removed icons, the Edit buttons, Add Preset and Add tag disabled, the new tag name's field wrapper, and the Edit Tag dialog, and nothing else.
- Each guard was broken on purpose and its tests failed (measured, of 785, or 789 with the focus tests):
  - a confirmation without Cancel focused: 7;
  - no focus return: 12 of 789;
  - focus returned during the render that closes the dialog: 12 of 789;
  - no fallback in Edit Preset, Edit Tag, or Edit Category: 1 each;
  - the fallback used while the opener is still there: 1;
  - an empty field flagged: 18;
  - Add Preset not beside its name: 3;
  - a dialog's Save enabled on a taken name: 4;
  - no taken category check: 5;
  - no taken tag check: 4;
  - a notice not relayed: 2;
  - Edit Tag's Delete not asking: 6;
  - a native confirm for Discard changes?: 9.
- `npm run verify` passed: 47 test files, 799 tests, the build, and the build output check.
- The mockup:
  - New Category checks a taken name, as Edit Category does;
  - the shared validation code never flags an empty field and disables its action, and disables an action for any problem in a field beside it or in its dialog;
  - New tag name uses the pattern;
  - the field validation page explains disabled or held;
  - the admin page's Add Source, Edit Source, and import remap dialog follow the rule;
  - two comments that described the dialogs as still to come are current;
  - Add tag creates only the tag and moves to its chip's Add, and Add Preset moves to the new preset's drag handle.
- The mockup's `check.mjs` passes 745 checks. Its new checks failed when New Category's taken check, the empty rule, the disabling, or the beside rule was taken out, and its Add tag and Add Preset checks failed against the mockup before Add tag stopped putting the tag on the item and both moved focus (measured).
- Enter in the tag editor's New tag name adds nothing, today and still, where the mockup's Tags tab adds the tag. WebUI Tags and Filter Tabs, which builds that tab, now adds it.
- `CHANGELOG.md`, `CONTEXT.md`, and `docs/domain-inventory.md` are updated. Admin Source and Item Management, Admin Library Catalog Transfer, and WebUI Status Line Overhaul follow the new field rule.
- The spot check passed: in an installed web app, in fullscreen, the user checked a delete confirmation stacked above Edit Tag with Escape closing only the top dialog, Discard changes?, focus on a renamed chip's Edit, a taken preset name disabling Save, and focus moving to the next preset after a delete.

#### Release checks

- Manual: Every in-app dialog matches the WebUI's theme and works in an installed web app on desktop and on mobile, including in fullscreen.

#### Not included

- Replacing the category and preset rows' up and down icons with a drag handle beside the Edit button, which is WebUI Drag Reordering.
- Removing the tag editor's Close confirmation once unsaved changes survive closing the panel, which is WebUI Tags and Filter Tabs.
- Sorting today's status line messages by the message rule and moving those that belong in a dialog or a field, which is WebUI Status Line Overhaul.
- Enter in New tag name adding the tag, which is WebUI Tags and Filter Tabs.

### M12f1 - WebUI Field Validation Pattern

- **Status**: ✅ Complete
- **Goal**: A field that holds a value that is not valid says so as it is typed, through one reusable pattern for the whole WebUI, and typed durations are parsed strictly.
- **Depends on**: WebUI Preact Migration, WebUI Design Mockup, and Favorite and Blacklist Filter Modes, whose Favorites and Blacklisted controls the pattern checks as a pair.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The work lands inside today's overlays, the filter dialog and the tag editor.
- One reusable field validation pattern for the whole WebUI, used anywhere a field can hold a value that is not valid.
- In this milestone the filter dialog's minimum and maximum durations and new preset name, and the Edit Tag dialog's tag name, use it.
- Field problems use this pattern, never a dialog or the status line.
- A value that is not valid is flagged as it is typed, by a red validation icon inside the field on its right side, in the WebUI's existing Material Symbols icon style.
- A tooltip says what the field expects, shown while the pointer is on the icon, after a tap on it, or while the field has focus. There is never a separate message line.
- A required field that is still empty is flagged only once the user has typed in it, but the action that uses it can't proceed meanwhile.
- The tooltips in this milestone: "Use MM:SS, HH:MM:SS, or seconds." for a duration; "Enter a preset name." or "Enter a tag name." for an empty name; and "Use a name no other preset has." for a taken preset name.
- The field is marked invalid for screen readers (`aria-invalid`), and the tooltip's text is its accessible description.
- Any action that would use a field while it is not valid, such as Apply, can't proceed until the field is corrected, whether or not anything else changed.
- A held action's label dims, the red icon shows on its right once a field it uses is flagged, and pressing it does nothing but move to the first field that holds it, switching the filter dialog's section when needed. A held Add Preset whose only problem is an empty name the user hasn't typed in dims without the icon, as the mockup shows.
- A filter dialog section with a flagged field shows the red icon after its name, so the field can be found from another section.
- Typed durations are parsed strictly: whole MM:SS or HH:MM:SS with seconds under 60, and minutes under 60 in HH:MM:SS, or a number of seconds. MM:SS minutes have no limit, as today, so "90:00" is 90 minutes.
- Durations in presets and filters from the server, which can carry fractional seconds from the desktop, such as "00:01:30.5000000", are read as today.
- The filter dialog's No minimum and No maximum boxes go: an empty duration field means no limit, and its placeholder says "No minimum" or "No maximum". An empty field is never flagged. The Min and Max fields stay 10px apart, the gap between the WebUI's stacked filter rows. The desktop dialog keeps its boxes.
- The pattern replaces today's duration check at Apply: Apply no longer writes either invalid-duration message to the status line or to `last.log`.
- The filter dialog's new preset name is flagged as it is typed, and Add Preset can't proceed while it is empty or taken. The pattern replaces both of Add Preset's status line messages.
- Add Preset and Update Preset save the durations into a preset, so they can't proceed while a duration is not valid either.
- The Edit Tag dialog's emptied tag name is flagged, and Save can't proceed while it is empty. The pattern replaces "Tag name is required.".
- The filter dialog's Favorites and Blacklisted controls use the pattern as a pair: Favorites only with Blacklisted only is flagged as it is chosen, since the app doesn't allow an item to be both favorite and blacklisted, and Apply, Add Preset, and Update Preset can't proceed until either changes. Every other pairing stays allowed, including Favorites only with Blacklisted excluded. The server doesn't reject the pairing, and the desktop dialog refuses it too.
- The pairing's one red icon sits just right of the Blacklisted dropdown, both dropdowns are marked invalid, and its tooltip is "Nothing is both a favorite and blacklisted. Use excluded for one of them." A held action moves to the Blacklisted dropdown.
- The mockup shows the pairing flagged, on its field validation page (`build/validation.src.html`) and in the Filter tab (`build/layout.src.html`), and shows Add Preset and Update Preset held by a duration that is not valid.
- The filter dialog's Refresh keeps unsaved preset changes: while the preset list has changes Apply hasn't saved, Refresh reloads sources and tags but keeps the edited list and Apply's star, and Apply then saves it.

#### Traps

- `parseDurationInputToSeconds` in `src/filter/filterStateModel.ts` uses `parseInt` and `parseFloat`, so it reads "1:7x" as 1:07 and "12abc" as 12 seconds.
- The same function reads durations in presets and filters from the server (`readDurationFromUnknown`), which can carry fractional seconds from the desktop, such as "00:01:30.5000000".
- Apply checks the durations only when it runs (`generalDraftDurationError` in `src/filter/filterDialogModel.ts`, called from `apply` in `src/filter/filterDialog.ts`).
- A duration that is not valid stops Apply, switches to General, and writes "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds." or "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds." to the status line through `store.setStatus`, which also relays it to `last.log`.
- The open dialog covers the status line (`position: fixed; inset: 0`), so a status line message shows only after the dialog closes.
- Leaving a field with a duration that is not valid returns Apply to its unmarked state, since the working filter counts it as no duration (measured).
- Add Preset writes "Enter a preset name." for an empty name and "A preset with that name already exists." for a saved preset's name, ignoring case, to the status line (`addPreset` in `src/filter/filterDialog.ts`), where the open dialog covers them.
- The Edit Tag dialog's Save writes "Tag name is required." to the status line for an empty name (`saveEdit` in `src/tags/tagEditor.ts`), where the tag editor covers it.
- Refresh replaces the preset list with the server's but leaves Apply's star (`refresh` in `src/filter/filterDialog.ts` keeps `presetsChanged`), so a preset added, updated, renamed, moved, or deleted since the last Apply disappears while Apply still posts the server's own list. The filter dialog did the same before it moved to Preact.

#### Acceptance

- A duration that is not valid is flagged as it is typed by a red validation icon inside the field on its right side, with a tooltip saying what the field expects, and no separate message line shows. The tooltip shows while the pointer is on the icon, after a tap on it, or while the field has focus. Shown by WebUI tests of the field validation pattern on both durations as a value is typed and corrected.
- A field flagged as not valid has `aria-invalid` set and the tooltip's text as its accessible description, and loses both once corrected, in WebUI tests of the pattern on both durations, the new preset name, and the Edit Tag name.
- An empty required field the user hasn't typed in is not flagged, in WebUI tests of the pattern.
- While a duration is not valid, Apply, Add Preset, and Update Preset can't proceed, Apply including when nothing else changed, and Apply never writes an invalid-duration message to the status line or `last.log`, in WebUI tests of the held actions with and without other changes and of the status line and `last.log`.
- A held action shows the red icon on the right of its label once a field it uses is flagged. Pressing a held Apply moves to the field that holds it, switching to General when needed, and applies nothing, in WebUI tests of the held action moving to the field.
- The duration fields have no No minimum or No maximum boxes, their placeholders say "No minimum" and "No maximum", and a duration field that is emptied is not flagged and applies no limit, in WebUI tests of the duration fields.
- A typed duration such as "1:7x", "12abc", or "1:75" is flagged, and a preset whose duration the server sends with fractional seconds, such as "00:01:30.5000000", loads as it does today, in WebUI tests of strict typed durations and of a server preset with fractional seconds.
- A new preset name that is emptied after typing, or that matches a saved preset's name ignoring case, is flagged with the field validation pattern; Add Preset can't proceed while the name is empty or taken; and neither "Enter a preset name." nor "A preset with that name already exists." shows on the status line. Shown by WebUI tests of the pattern on the new preset name.
- An Edit Tag dialog tag name that is emptied is flagged with the field validation pattern, its Save can't proceed while the name is empty, and "Tag name is required." no longer shows, in WebUI tests of the pattern on the Edit Tag name.
- Favorites only with Blacklisted only is flagged with the field validation pattern, and Apply, Add Preset, and Update Preset can't proceed until either changes, while every other pairing, including Favorites only with Blacklisted excluded, is not flagged. Shown by WebUI tests of the pattern on the Favorites and Blacklisted controls.
- After an unsaved preset change in the filter dialog, Refresh keeps the change and Apply's star, and Apply then saves it, in a WebUI test of Refresh after an unsaved preset change.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone: a typed duration that is not valid shows its tooltip beside its red icon after a tap on the icon.

#### Evidence

- The pattern is `src/validation/fieldValidation.ts` (a field's problem, when it is flagged, the first field that holds an action, and requests to move to a field) and `src/ui/FieldValidation.tsx` (the field's icon and tooltip, the held button, and a section's icon). The filter dialog and the tag editor work out each field's problem and the actions it holds in their services, and a held action moves to its field there, so nothing reaches the status line.
- Typed durations go through `parseTypedDuration`, the mockup's strict parser. Server durations go through `parseServerDuration`, the old parser renamed, so "00:01:30.5000000" still reads as 90 seconds.
- Today's parser and the strict one compared on the same inputs (measured):
  - "1:7x" read as 67 seconds, now flagged.
  - "12abc" read as 12 seconds, now flagged.
  - "1e3" read as 1000 seconds, now flagged.
  - ".5" read as 0.5 seconds, now flagged.
  - "12." read as 12 seconds, now flagged.
  - "1:7", "90:00", "1:59:59", "12.5", and " 12 " read the same in both, and "1:75" and "0:60:00" are flagged by both.
- New and changed WebUI tests:
  - the strict parser and the server parser;
  - each field's problem, all nine Favorites and Blacklisted pairings, and the held reasons;
  - the flagged rule and the reveal requests;
  - in the filter dialog and tag editor services, each held action with and without other changes, moving to its field with no status line message, and Refresh keeping or taking the preset list;
  - in the page tests:
    - `aria-invalid`, the tooltip as the description, and the section icons;
    - the tooltip on focus, on mouse hover, and after a touch tap;
    - a held Apply pressed on Tags or Presets moving to and focusing the field;
    - no status line or `last.log` line;
    - a server preset with fractional seconds;
    - the new preset name untouched, emptied, and taken;
    - the pair on both dropdowns holding all three actions;
    - Refresh after an unsaved preset change;
    - the Edit Tag name.
- The filter dialog and Edit Tag markup snapshots changed for the new field wrappers, button labels, and the held Add Preset's description, and nothing else.
- Each fix was broken on purpose and its tests failed (measured):
  - typed durations read leniently: 2 tests;
  - Refresh taking the server's list: 2;
  - Apply not held: 4;
  - a reveal that doesn't focus: 4;
  - Edit Tag's Save not held: 2;
  - the pair not checked: 4;
  - a touch tap that doesn't focus: 1;
  - the old duration placeholder: 2;
  - an empty duration flagged: 46.
- `npm run verify` passed: 44 test files, 738 tests, the build, and the build output check.
- The mockup:
  - its validation page has a Favorites and Blacklisted section, and its out-of-view Apply demo holds on the pair too;
  - the Filter tab flags the pair, and holds Apply, Add Preset, and Update Preset on the pair and the durations;
  - the shared pattern takes partner controls, so one icon and tooltip cover both dropdowns;
  - the Filter tab's duration rows lost their No minimum and No maximum boxes, their placeholders say "No minimum" and "No maximum", and the Min and Max fields stay 10px apart, the WebUI's gap between stacked filter rows, instead of the mockup's 4px;
  - the validation page's duration note states the corrected rule and no longer describes the parser this milestone replaced.
  `check.mjs` has 26 new checks, and all 704 passed. The checks for the placeholders and the gap failed when a box, the old placeholder, or the 4px gap was put back (measured).
- The No minimum and No maximum boxes are gone from the WebUI's filter dialog, and `GeneralDraft` no longer has `noMin` or `noMax`. An empty field applies no limit and is never flagged, in WebUI tests of the model, the service, and the page. The desktop dialog keeps its boxes.
- The duration and new preset name fields gained the accessible names the mockup gives them: "Minimum duration", "Maximum duration", and "New preset name".
- `CHANGELOG.md`, `CONTEXT.md`, and `docs/domain-inventory.md` are updated.
- The spot check passed: on the user's phone, a typed duration that is not valid showed its tooltip beside its red icon after a tap on the icon.

#### Release checks

- Manual: In the WebUI's filter dialog, on a desktop browser and a phone in both themes, a flagged duration's tooltip shows beside its red icon and inside the screen while the pointer is on the icon, after a tap on it, and while the field has focus.

#### Not included

- Turning the filter dialog and the tag editor into the Filter and Tags tabs, which is WebUI Responsive Layout and Panels.
- Fields that later milestones add: each uses the pattern for its own fields that can hold a value that is not valid, starting with WebUI In-App Dialogs.
- The dialog side of the WebUI's message rule, which is WebUI In-App Dialogs.
- The status line side of the WebUI's message rule, which is WebUI Status Line Overhaul.

### M12e - Favorite and Blacklist Filter Modes

- **Status**: ✅ Complete
- **Goal**: The Favorites and Blacklisted filters each choose only or excluded, in the server and both clients, so a filter such as Favorites excluded or Blacklisted only works the same in browse, random picks, and presets.
- **Depends on**: WebUI Design Mockup, whose mockup approves its look.
- **Design**: `docs/mockups/reelroulette/`, including the filter dialog specimen on its field validation page (`build/validation.src.html`).

#### Decisions

- Each filter is a checkbox with a small dropdown to its right offering only and excluded, and the dropdown is disabled while its checkbox is off. Favorites starts off. Blacklisted starts on and excluded, which is today's Exclude blacklisted.
- Both clients offer the same options, so a preset behaves identically in each.
- Favorites only and Blacklisted only can't be chosen together, since the app doesn't allow an item to be both favorite and blacklisted. Every other pairing stays allowed, including Favorites only with Blacklisted excluded, the blacklist filter's default.
  - The server doesn't reject the pairing: a filter with it matches nothing.
  - The clients refuse it. The desktop dialog won't apply or save it, through what the dialog already does for invalid input.
  - The WebUI flags it with the field validation pattern, so Apply and saving a preset can't proceed until it's corrected. WebUI Field Validation Pattern, which builds the pattern after this milestone, adds it.
  - Both ship in v0.15.0, so no release allows the pairing.
- New fields `favoritesMode` and `blacklistedMode`, each `"off"`, `"only"`, or `"excluded"`, written as these names on the wire. One three-value field per filter, so two settings that filter alike can't differ in a preset.
- The new fields sit beside the old `favoritesOnly` and `excludeBlacklisted`, so the contract change only adds. Desktop Client Removal drops the old fields.
- Resolution rule: the server's parser, the desktop's model, and the WebUI's reader resolve each filter on its own, the same way.
  - A new field with a known value decides. A new field with an unknown value counts as missing.
  - Otherwise the old field decides: `favoritesOnly` true is Favorites only, and anything else is off; `excludeBlacklisted` false is Blacklisted off, and anything else, including a missing field, is excluded, as today.
  - When both are present and disagree, the new field wins.
  - A filter or preset with only the old fields therefore reads as before, and so does the desktop's saved filter in `desktop-settings.json`.
  - Locked to a new shared fixture, `shared/fixtures/filter-mode-resolution.json`, of filter inputs and the modes they resolve to, read by Core, desktop, and WebUI tests.
- Old-field projection: both clients write the new fields and the old ones together in every filter they send or save, so a reader that knows only the old fields sees a wider set of files, never a narrower or contradictory one.
  - Favorites only is `favoritesOnly: true`, and Favorites off or excluded is `false`.
  - Blacklisted excluded is `excludeBlacklisted: true`, and Blacklisted off or only is `false`.
  - The server stores presets as posted and writes nothing into them.
- Desktop and server are updated together for v0.15.0, since a desktop older than this milestone drops the new fields from every preset it posts (see the shared client rules slice's Traps). They are separate Velopack packages, and the desktop checks for updates only from its Settings dialog, so the release notes tell desktop users to update it.
- Slices land in table order, except that the desktop and WebUI slices land in parallel after the shared client rules slice; the records (docs and the tracker) come last.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ✅ Complete | An OpenAPI FilterState schema naming today's filter fields, used by every filter state in the contract, and small OpenAPI fixes. |
| Server | ✅ Complete | The new fields in the schema and the parser, applied by browse, its counts, and random selection. |
| Shared client rules | ✅ Complete | Both clients read the modes by the resolution rule, write the old-field projection, and match presets and patch tiles by resolved modes. |
| Desktop | ✅ Complete | The filter dialog's dropdowns, the summary line's new names, and no preset posts on header picks or unchanged Applies. |
| WebUI | ✅ Complete | The filter dialog's two controls, and the mockup updated to match. |

#### Contract slice

**Scope**

- A FilterState schema in OpenAPI covering every filter field that exists today, so the generated WebUI types carry it. What goes over the wire doesn't change. The new fields enter it in the server slice, with the parser that reads them, and Browser-Playable Filter adds its field to it.
- `PresetResponse`, `LibraryQueryRequest`, and `RandomRequest` use it, nullable through `anyOf` with `{type: "null"}`, and `FilterPresetSnapshot` requires it.
- The server's parser, `LibraryListFilterParser`, is the schema's reference: 14 fields. The schema leaves out the legacy `tagMatchMode`, since nothing reads or sends it.
- The schema keeps `additionalProperties: true`, since stored presets can still carry `tagMatchMode`, and every property is optional, since `{}` is a valid preset.
- Defaults go in descriptions, never in `default:` keywords.
- `audioFilter`, `mediaTypeFilter`, and the values of `categoryLocalMatchModes` accept an integer or a name.
- `minDuration` and `maxDuration` are a string, a number, or null. `globalMatchMode`, `categoryLocalMatchModes`, and the tag and source arrays are nullable, since the equality fixture has null arrays.
- Each use keeps its own meaning of null in its description.
- The generated type describes the wire shape. In the WebUI it types `serializeFilterStateForApi`'s output, `filterStateFromApiObject`'s input, `ApiPreset.filterState`, and the library query's `filterState`. The WebUI's internal `FilterState` interface, which holds durations as seconds, stays.
- A Core test checks that the schema's property names equal the names the parser reads, using `ReadSchemaProperties` in `OpenApiSpec.cs`.
- OpenAPI fixes:
  - `GET /api/presets` loses the 404 its handler never returns.
  - `PresetResponse.summary`, which is never filled, is described as always null. Desktop Client Removal removes it.
  - The random request's `presetId` value `"all-media"`, which picks with the default filter when no preset has that name, is documented in OpenAPI and `docs/api.md`.
  - `POST /api/random` declares the 404 it returns for a `presetId` that names no preset when `filterState` is omitted or null.
- OpenAPI and `docs/api.md` say a duration number is seconds and a duration string is .NET TimeSpan text, such as `HH:MM:SS` or the desktop's `d.HH:MM:SS.fffffff`.

**Traps**

- Before this slice, every `filterState` in OpenAPI was a free-form object (`additionalProperties: true`), neither OpenAPI nor `docs/api.md` named `favoritesOnly` or `excludeBlacklisted`, and the WebUI typed them by hand in `filterStateModel.ts`.
- Four schemas carry a filter state, and no SSE event carries one (measured).
- openapi-typescript makes a property with a default required, which breaks the typecheck of `randomPick.ts` (measured).
- The desktop sends enum fields as integers in random requests and presets, but as names in library queries, which it serializes with `CoreServerApiClient.LibraryItemJsonOptions` and its `JsonStringEnumConverter` (measured).
- `$ref` with a sibling `nullable: true` loses the null in the generated types, and `openapi.yaml` is OpenAPI 3.1 (measured).
- A library query without a filter applies no filter predicates, so blacklisted files show, while a random request without one falls back to `presetId`, and its parsed filter excludes blacklisted files (measured).
- `npm run verify:contracts` only checks that the generated types are fresh, so it can't tell the schema and the parser apart (measured).
- `docs/api.md` said "a numeric duration in seconds", but the string `"90"` reads as 90 days. Neither client sends a numeric string (measured).

**Acceptance**

- OpenAPI has a FilterState schema that names every existing filter field, keeps `additionalProperties: true`, and has no `default:` keyword. Every filter state in the contract uses it, the generated WebUI types carry it, and `npm run verify:contracts` passes.
- A Core test checks that the schema's property names equal the parser's.
- OpenAPI declares no 404 for `GET /api/presets`, declares the 404 `POST /api/random` returns for a `presetId` that names no preset, describes `PresetResponse.summary` as always null, and documents the `presetId` value `"all-media"`, checked by reading `openapi.yaml`.
- OpenAPI and `docs/api.md` say a duration number is seconds and a duration string is TimeSpan text, checked by reading both.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- OpenAPI has a `FilterState` schema with the 14 fields the parser reads, `additionalProperties: true`, every property optional, and no `default:` keyword. `PresetResponse`, `LibraryQueryRequest`, and `RandomRequest` use it through `anyOf` with null, and `FilterPresetSnapshot` requires it. `GET /api/presets` declares no 404, `PresetResponse.summary` is described as always null, `RandomRequest.presetId` documents `all-media`, and `POST /api/random` declares its 404 for a `presetId` that names no preset, which `docs/api.md` names too. OpenAPI's duration fields and `docs/api.md` say a number is seconds and a string is TimeSpan text, and `docs/api.md` says fields the schema doesn't name, such as `tagMatchMode` in old presets, are accepted and ignored by filtering and by both clients' preset matching.
- `FilterStateSchema_NamesEveryFieldTheParserReads` compares `ReadSchemaProperties("FilterState")` with the field names `LibraryListFilterParser.cs` reads. It fails when `onlyNeverPlayed` is removed from the schema and when a `favoritesMode` property is added to it, naming the field each time, and passes when the schema is restored.
- In the generated WebUI types, `FilterState` has every property optional and an index signature, and each of its four uses keeps its null. A null assigned to each of the 76 nullable properties under `components.schemas` typechecks against the generated types, and a null assigned to a non-nullable one fails. The 6 nullable query parameters elsewhere in the file also keep `| null`.
- The WebUI types `serializeFilterStateForApi`'s output, `filterStateFromApiObject`'s input, `ApiPreset` (now the generated `PresetResponse`), the library query's `filterState`, and the preset post body with the generated types. Two tests' default-filter presets now hold `serializeFilterStateForApi(createDefaultFilterState())` instead of the internal model, which the wire type no longer accepts; both read back as the same filter.
- The WebUI's built `dist` is byte-identical before and after the change (16 files, same SHA-256), so what the WebUI sends is unchanged. The server's runtime code is unchanged.
- `dotnet build ReelRoulette.sln` has no warnings. `dotnet test ReelRoulette.sln` ran 467 Core, 275 DesktopApp, and 7 ServerApp tests, all passing. `npm run verify` passed with 595 tests in 43 files.

#### Server slice

**Scope**

- The new fields enter the FilterState schema, in OpenAPI and the generated WebUI types, with the parser that reads them.
- Core's `FilterStateModel` (`FilteringContracts.cs`) carries the two modes in place of its two booleans.
- `LibraryListFilterParser` applies the resolution rule. A Core test reads `filter-mode-resolution.json`, which this slice adds.
- `LibraryCatalogListSql.AppendFilter` (`LibraryCatalogListQuery.cs`) applies Favorites only or excluded and Blacklisted only or excluded, in any combination, so the list query, its counts, and random selection all apply them.

**Traps**

- The parser reads field names case-sensitively.
- `AppendFilter` applies today's two booleans as two fixed SQL conditions.
- Random selection goes through the same parser and WHERE builder as browse (measured).
- Nothing that caches by filter needs a change, so the new conditions only need to be in the SQL text or its arguments: the count cache is keyed by the generated WHERE text and its arguments and is cleared on every catalog write, the shuffle bag rebuilds when its set of eligible items changes, and random selection caches nothing.

**Acceptance**

- For each combination of the two filters, the list query, its counts, and random selection return exactly the matching items, and the defaults (Favorites off, Blacklisted excluded) give today's results, in server tests of each combination.
- A filter or preset with only the old fields gives the same results as before this milestone, and a contract test shows a filter state written before this milestone still parses.
- The server resolves every case in `filter-mode-resolution.json` as the fixture says, in a Core test: old fields only, new fields only, both agreeing and disagreeing, and an unknown new value.
- With the count cache warm from one pairing, another pairing returns its own counts, for both counts a filtered query returns, in a server test of the count cache.
- Each route that takes a filter state keeps its meaning when the filter state is missing or null, in a server test of the library query, the random pick, and the preset catalog.
- The FilterState schema names the new fields, the Core test that its property names equal the parser's passes, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- `FilterStateModel` carries `FavoritesMode` and `BlacklistedMode`, of a new `FlagFilterModeValue` (Off, Only, Excluded), in place of its two booleans. `LibraryListFilterParser` reads `favoritesMode` and `blacklistedMode` as `off`, `only`, or `excluded` in any case, and anything else, including null and numbers, falls back to the old fields as they were read before. `AppendFilter` writes `!= 0` for only and `= 0` for excluded on each flag column, in the old order, so a filter without the new fields generates the same WHERE text as before.
- `shared/fixtures/filter-mode-resolution.json` has 36 cases, and `Parser_ResolvesFlagModes_AsTheSharedFixtureSays` passes them all. It fails when the parser ignores the mode fields and when it reads `only` in exact case only.
- `FlagModes_ListCountAndRandomCandidates_MatchEachPairing` seeds 1 plain, 2 favorite, and 4 blacklisted items and checks the list query's items and total and random selection's candidates for all nine pairings, parsed from JSON, against a reference. As the test notes, no item is both favorite and blacklisted, so two of the nine pairings repeat another's result, and Favorites only with Blacklisted only is always empty. The seven distinct results have seven different counts. `{}` gives today's default. `FlagModes_OldFieldsAlone_GiveTheirOldResults` checks `favoritesOnly` and `excludeBlacklisted` each true, false, and missing. `LibraryQueryAndRandomPick_ApplyFlagModes` runs Favorites excluded, Blacklisted only, and mixed-case modes beside an old field through the library query and random pick services. `FlagModes_ListCountAndRandomCandidates_MatchEachPairing` and `LibraryQueryAndRandomPick_ApplyFlagModes` fail when the SQL ignores Favorites excluded.
- `FlagModes_CountCache_KeepsEachPairingsCounts` runs all nine pairings twice at one catalog revision and checks the total and the search baseline each time. The first pass makes nine count queries, since Favorites off with Blacklisted off is the same query as the baseline, and the second makes none (measured). It fails when the cache key drops the Favorites excluded condition.
- `MissingOrNullFilterState_KeepsEachRoutesMeaning` reads request bodies as the server binds them. A library query with no filter state, or null, lists blacklisted items. A random pick falls back to `presetId`: a named preset's filter, `all-media` as the default filter, 400 with no preset id, and 404 for an unknown one. A preset posted without a filter state, or with null, picks with the default filter, before and after a restart. It passed on the code before this slice, and fails when a null filter state reads as the default filter.
- `FilterState_WithOnlyTheOldFields_StillParses` parses full filter states in the desktop's and the WebUI's shapes from before this milestone to the same modes and fields as before. `FilterStateSchema_NamesEveryFieldTheParserReads` failed until the schema named the new fields.
- OpenAPI's `FilterState` names `favoritesMode` and `blacklistedMode` with the values `off`, `only`, and `excluded`, quoted since `off` is a boolean in YAML 1.1, and its descriptions give the resolution rule and say Favorites only with Blacklisted only matches nothing. The generated WebUI type has `favoritesMode?: "off" | "only" | "excluded"` and the same for `blacklistedMode`. The WebUI's built `dist` is byte-identical before and after the change (16 files, same SHA-256). `docs/api.md` and `CONTEXT.md` describe the modes.
- SystemChecks references neither old boolean nor `FilterStateModel`, and it is in `ReelRoulette.sln`, so the solution build covers it.
- `dotnet build ReelRoulette.sln` has no warnings. `dotnet test ReelRoulette.sln` ran 475 Core, 275 DesktopApp, and 7 ServerApp tests, all passing. SystemChecks passed. `npm run verify` passed with 595 tests in 43 files.

#### Shared client rules slice

**Scope**

- Both clients' filter models gain the two modes, read them through the resolution rule, and write the old-field projection: the desktop's `FilterState.cs` and the WebUI's `filterStateModel.ts`. Desktop and WebUI tests read `filter-mode-resolution.json`.
- The resolution rule, the mode names and the old-field fallback, moves from `LibraryListFilterParser` into Core, and the server's parser and the desktop's model both call it, so C# has one copy.
- The old-field projection is locked to a new shared fixture, `filter-mode-projection.json`, of the nine pairings and the fields each writes, read by Core's projection test and both clients' serialization tests.
- The desktop writes the new modes as names through a converter on each property. A converter on the property also overrides the library query's `JsonStringEnumConverter`, so the desktop sends one form everywhere.
- Until the desktop and WebUI slices replace them, each filter dialog's Favorites only and Exclude blacklisted checkboxes map onto the modes, a mode they can't show stays until its checkbox is used, and the desktop dialog's Apply copies the modes back to the main window.
- Saved filters carry the new fields. A preset saved before this milestone reads through its old fields.
- Preset matching compares resolved modes, not raw fields, so `{"favoritesOnly": true}` and `{"favoritesMode": "only"}` match. `preset-filter-equality.json` gains cases for old fields against new ones, Favorites excluded against an unset filter, Blacklisted only against `excludeBlacklisted: false`, and the new fields with Blacklisted off.
- The patch-or-reload rule, which decides whether a favorite or blacklist change patches a loaded tile or reloads the library window, learns the new modes on both clients, with new cases in `library-tile-effect.json`. For example, favoriting a loaded tile under Favorites excluded reloads, and so does removing one from the blacklist under Blacklisted only.
- The WebUI's filter reader accepts `audioFilter`, `mediaTypeFilter`, and the values of `categoryLocalMatchModes` as names in any case as well as integers, as the FilterState schema and the server's parser do. A new shared fixture, `filter-enum-values.json`, locks the two together, run by a Core test of the parser and by the WebUI reader test. The desktop doesn't run it, since it never receives names.

**Traps**

- Both clients read filters into a typed model and drop fields they don't know, so a desktop older than this milestone drops the new fields from every preset it posts (measured on the desktop with a probe against its build). The WebUI's `filterStateFromApiObject` reads only known keys.
- Preset equality also gates behavior: the WebUI's header preset pick reloads only when equality says the filter changed (`pickHeaderPreset` in `appStore.ts`), and equality decides whether Apply shows its star in both filter dialogs.
- Both clients run `preset-filter-equality.json`'s 39 cases: the desktop's `PresetFilterEqualityFixtureTests` and the WebUI's `presetFilterEquality.test.ts`.
- The desktop's `LibraryPanelBrowse.cs` and the WebUI's `libraryQuerySession.ts` follow the patch-or-reload rule line for line.
- The desktop's `LibraryTileEffectFixtureTests` reads each filter key with `GetProperty`, which throws on a missing key, so new cases keep the old keys or the runner changes.
- `readEnumInt` in `filterStateModel.ts` reads only integers, so a name such as `"VideosOnly"` reads as the default.
- `filter-mode-resolution.json` has mode names in mixed case, and numbers, null, and unknown names that count as missing. System.Text.Json's `JsonStringEnumConverter` reads integers and throws on an unknown name by default (inferred), so the desktop needs its own reading of the modes to pass it.
- The desktop reads presets with default JSON options (`ParseCorePresetFilterState` in `MainWindow.axaml.cs`), so an enum written as a name throws, and the catch turns the whole preset into the default filter (measured).

**Acceptance**

- The desktop and the WebUI resolve every case in `filter-mode-resolution.json` as the server does, in desktop and WebUI tests.
- Every filter either client sends or saves carries the new fields and the old fields' projection, in desktop filter serialization tests and the WebUI's `filterStateModel.test.ts`.
- Preset matching compares resolved modes, so old and new fields that resolve alike match, and both clients pass `preset-filter-equality.json` with its new cases.
- Both clients pass `library-tile-effect.json` with cases for the new modes.
- The server's filter parser and the WebUI's filter reader read `audioFilter`, `mediaTypeFilter`, and the values of `categoryLocalMatchModes` alike, as names in any case or as integers, and both pass `filter-enum-values.json`.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- Core's `FlagFilterModes` (`Filtering/FlagFilterModes.cs`) holds the mode names, the old-field fallback, and the projection. `LibraryListFilterParser` calls it, and `Parser_ResolvesFlagModes_AsTheSharedFixtureSays` still passes all 36 cases. It fails when `Parse` reads `only` in exact case.
- New fixtures: `filter-mode-projection.json` has the nine pairings, and `filter-enum-values.json` has 9 cases. `preset-filter-equality.json` gains 11 cases, for 50 in all, including only against excluded for each filter. `library-tile-effect.json` gains 15, for 49, using only flag changes the server sends. For example, favoriting a loaded tile under Blacklisted only reloads, since a favorite clears the blacklist.
- `FlagModes_WriteEachPairing_AsTheSharedFixtureSays` fails when Blacklisted only writes `excludeBlacklisted: true`. `Parser_ReadsEnumFields_AsTheSharedFixtureSays` fails when audio names are read in exact case.
- The desktop's `FilterState` holds `FavoritesMode` and `BlacklistedMode` in place of its two booleans.
  - Private `[JsonInclude]` wire properties write the modes as names through `FlagFilterModeJsonConverter`, beside their projection.
  - An `IJsonOnDeserialized` hook resolves the modes through Core once the whole filter is read.
- `FilterModeJsonTests` checks the desktop's reading and writing of the modes.
  - It reads the 36 resolution cases as presets are read.
  - It writes the nine pairings with default options, with `LibraryItemJsonOptions`, and through the `desktop-settings.json` storage. Each carries the fixture's fields and reads back to the same modes.
  - Each break fails its test:
    - Ignoring the read Favorites mode fails 9 resolution cases.
    - `favoritesOnly` written true for Favorites excluded fails those 3 pairings.
    - The tile rule treating excluded as off fails 8 tile cases.
    - A tile rule that skips the check whenever Favorites isn't only and Blacklisted is off fails the loaded favorite case under Favorites excluded with Blacklisted off, on both clients.
    - Preset comparison that blanks the modes fails 7 equality cases.
    - Preset comparison that treats only and excluded as one fails the 2 only-against-excluded cases, on both clients.
- The WebUI's `FilterState` holds `favoritesMode` and `blacklistedMode`.
  - Its reader resolves them by the rule.
  - Its serializer writes them beside their projection.
  - Its enum reader takes names in any case, and drops a category entry whose value is unknown or null.
- `filterStateModel.test.ts` runs the resolution, projection, and enum fixtures. Each break fails its run:
  - A reader that ignores `favoritesMode` fails the resolution and projection runs.
  - An inverted projection fails the 3 Blacklisted only pairings.
  - A serializer that omits the modes fails 3 equality cases.
  - An integer-only enum reader fails 4 enum cases.
  - A loaded tile rule that ignores Blacklisted only fails the 2 loaded Blacklisted only cases.
- Both filter dialogs look as before, so the mockup is unchanged.
- A mode the checkboxes can't show survives the WebUI dialog's draft round trip, in `keeps a flag mode the checkboxes cannot show` in `filterDialogModel.test.ts`.
- The WebUI screen tests that click Favorites only or Exclude blacklisted check the mode in what is applied or saved. Unchecking Exclude blacklisted as Blacklisted only, which writes the same old fields as off, fails `Update Preset saves the working filter into the chosen preset`.
- `docs/api.md`, `CONTEXT.md`, and `docs/domain-inventory.md` describe the clients' resolution, projection, and preset matching. `docs/api.md` also describes the enum reading.
- `dotnet build ReelRoulette.sln` has no warnings. `dotnet test ReelRoulette.sln` ran 477 Core, 346 DesktopApp, and 7 ServerApp tests, all passing. SystemChecks passed. `npm run verify` passed with 676 tests in 43 files.

#### Desktop slice

**Scope**

- The filter dialog (`FilterDialog.axaml`) replaces its Favorites only and Exclude blacklisted checkboxes with the two checkboxes and their dropdowns, a small change matching the server's, which the desktop's freeze allows.
- `FilterDialog.axaml.cs` covers the new controls in the two places besides Apply's copy back that copy fields one by one: the change notifications on preset load, and Clear All.
- The filter summary line above the library panel (`UpdateFilterSummaryText` in `MainWindow.axaml.cs`) names "Favorites only", "Favorites excluded", and "Blacklisted only". Blacklisted excluded, the default, isn't named, as in the mockup. Today it shows "Favorites" for Favorites only and never names Blacklisted.
- A header preset pick, None included, posts no presets, and a filter dialog Apply posts presets only when they changed, compared with the preset list comparison in `LibraryPresetSelection`. Before removing the post from header picks, confirm what it does today and report anything besides saving the list that depends on it.
- The filter dialog won't apply Favorites only with Blacklisted only, or save it into a preset through Add Preset or Update Preset, through what the dialog already does for invalid input.

**Traps**

- `SyncPresetsToCoreAsync` posts the desktop's cached preset list to `POST /api/presets`, which replaces the server's whole catalog, on every header preset pick and every Apply, and the cache is refreshed only on connect, reconnect, resync, and filter dialog open. Picking a preset on the desktop therefore deletes any preset the WebUI added since.
- Apart from the server raising its catalog revision, nothing else was found to depend on the post.
- The filter dialog shows no message for invalid input. Add Preset with an empty or taken name writes a `last.log` line and returns (`AddPreset` in `FilterDialog.axaml.cs`, with a TODO to show an error), duration text that doesn't parse leaves the previous duration in place, and `ApplyButton_Click` checks nothing. Refusing the pairing the same way gives no visible sign.

**Acceptance**

- The desktop's filter dialog shows a checkbox and an only-or-excluded dropdown for Favorites and for Blacklisted, in desktop filter dialog tests.
- A preset the WebUI saves with each mode loads in the desktop with that mode, in desktop tests.
- A header preset pick posts no presets, and a filter dialog Apply posts presets only when they changed, in desktop tests.
- The filter summary line names Favorites only, Favorites excluded, and Blacklisted only, in desktop tests.
- The filter dialog doesn't apply Favorites only with Blacklisted only or save it into a preset, and applies and saves every other pairing, in desktop filter dialog tests.
- `dotnet test ReelRoulette.sln` passes, and one quick spot check in the desktop.

**Evidence**

- The filter dialog's Favorites and Blacklisted rows are each a checkbox and an `only`/`excluded` ComboBox, named "Favorites filter" and "Blacklisted filter", disabled while its checkbox is off.
  - A choice is kept while its checkbox is off.
  - On open, preset load, and Clear All, a filter that is off shows its default choice: only for Favorites, excluded for Blacklisted.
  - The new setters ignore an unchanged value and an index of -1, so a binding writing back the same value doesn't mark the preset modified.
- Apply, Add Preset, and Update Preset refuse Favorites only with Blacklisted only. Each writes a `last.log` line and returns.
- `FilterDialogFlagModeTests` covers the dialog's flag controls.
  - It shows the controls, their defaults, and their disabled states.
  - It shows a choice surviving uncheck and recheck.
  - It shows each of the nine pairings loading from a preset, and Clear All.
  - Each of the eight allowed pairings applies and saves through Add Preset and Update Preset, set through the controls, and all three refuse Favorites only with Blacklisted only.
- `FilterSummaryFormat.FlagFilters` gives the summary's "Favorites only", "Favorites excluded", and "Blacklisted only", tested in `FilterSummaryFormatTests`.
- Before the post was removed from header picks, its side effects were checked. It raised the catalog revision, which made the next browse query count again, and it queued a catalog backup. It published no event, and no client reloads presets after it, so nothing else depended on it.
- Header picks, None included, no longer post presets.
  - Apply replaces the cached list and posts it only when the dialog's new `PresetsChanged` is true. `PresetsChanged` compares with the dialog's opening copy, so a cache refresh while the dialog is open isn't counted.
  - `RefreshPendingState` reads `PresetsChanged`.
- Waiver: `PresetsChanged` is tested. It is false on open and after an undone edit or move, and true after Add, Update, Rename, Delete, and Move. Neither `MainWindow` gate has a test seam, since `MainWindow` builds its own API client: no post on a header pick, and Apply posting only when `PresetsChanged` is true. The spot check shows the header-pick half.
- `ParseCorePresetFilterState` moved to `LibraryPresetSelection` as `FilterStateFromServer`, renamed, with its behavior unchanged. `LibraryPresetSelectionTests` checks that a missing, null, or unreadable filter reads as the default.
- `shared/fixtures/filter-state-written.json` holds one filter as each client writes it. `FilterModeJsonTests` shows the desktop writes its entry exactly, and reads the WebUI's entry with each of the nine pairings as that pairing's modes and the same filter.
- Each break fails its test:
  - The refusal helper always allowing fails 4 tests, and Apply without its refusal fails `FavoritesOnlyWithBlacklistedOnly_IsNotApplied`.
  - Unchecking that resets the choice fails the choice test.
  - `PresetsChanged` always true fails 7 tests.
  - Naming Favorites excluded as Favorites only fails 2 summary cases.
  - A preset reader that ignores `favoritesMode` fails the cross-client Favorites excluded cases.
- The spot check passed:
  - Blacklisted only applied, with the summary "Blacklisted only".
  - Favorites only with Blacklisted only didn't apply.
  - A preset the WebUI added was still there after a preset pick in the desktop.
- `dotnet build ReelRoulette.sln` has no warnings. `dotnet test ReelRoulette.sln` ran 477 Core, 421 DesktopApp, and 7 ServerApp tests, all passing. SystemChecks passed.

#### WebUI slice

**Scope**

- Today's filter dialog gains the two controls. WebUI Responsive Layout and Panels carries them into the Filter tab as the mockup shows.
- The mockup's field validation page (`build/validation.src.html`), whose filter dialog specimen still shows the Favorites only and Exclude blacklisted checkboxes, gets the new controls.

**Acceptance**

- The WebUI's filter dialog shows a checkbox and an only-or-excluded dropdown for Favorites and for Blacklisted, in WebUI filter dialog tests.
- A preset the desktop saves with each mode loads in the WebUI with that mode, in WebUI tests.
- The mockup, including its field validation page, matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check in the WebUI.

**Evidence**

- The General draft holds each filter's checkbox and its choice. A filter that is off reads as unchecked, with its default choice.
- `FilterDialog.tsx` shows the mockup's two rows: `filter-fav` with `filter-fav-mode` ("Favorites filter"), and `filter-bl` with `filter-bl-mode` ("Blacklisted filter"). Each select is disabled while its checkbox is off.
- `styles.css` adds `.mode-row`. Its select is 36px, as the mockup's is, and half opacity while disabled.
- Screen tests in `screens/filter.test.ts` cover the controls and each mode.
  - They show the rows, their defaults, and their disabled states, and a choice kept through uncheck and recheck.
  - Each mode of each filter applies and saves, checked in the library query, the random pick, and the preset post.
  - They cover Clear all, and preset load for each of the nine pairings.
  - The fixture's desktop entry, served as a preset, shows Favorites excluded and Blacklisted only.
- The three dialog snapshots change only in the two rows. "keeps a flag mode the checkboxes cannot show" became a round trip of every pairing through the draft.
- The WebUI writes the fixture's webui entry exactly, and reads its desktop entry with each of the nine pairings as that pairing's modes and the same filter.
- Each break fails its test:
  - Ignoring the Favorites choice fails 7 tests, and ignoring the Blacklisted choice fails 5 model tests.
  - Unchecking that resets the choice fails the choice screen test.
  - A select that is never disabled fails 7 tests.
  - A reader that ignores `favoritesMode` fails 18 tests, including the desktop entry's Favorites excluded cases.
- The mockup's validation page shows the two rows in its filter dialog specimen. The `.mode-row` styles moved from `layout.src.html` into `common.css`.
- The app keeps an unchecked filter's choice only until the filter is applied, since a filter has no field for it, so the mockup's Filter tab now shows an unchecked dropdown at its default once applied. `check.mjs` gains a check for it, which fails without the reset. `node docs/mockups/reelroulette/build/check.mjs` passed 674 checks.
- The spot check passed: Favorites excluded applied, showed no favorites, and reopened checked, showing excluded.
- `npm run verify` passed with 708 tests in 43 files.

#### Release checks

- Agent: The v0.15.0 release notes tell desktop users to update the desktop along with the server.
- Manual: In the WebUI and the desktop, Favorites excluded and Blacklisted only each limit browse and random play as named, and a preset saved in one client shows the same filter in the other.

#### Not included

- Keeping a preset's stored modes when a desktop older than this milestone posts it without the new fields, since desktop and server are updated together for v0.15.0.
- Name matching for the browser-playable field's values, which is Browser-Playable Filter.
- Flagging Favorites only with Blacklisted only in the WebUI, its mockup included, which is WebUI Field Validation Pattern.

### M12d - New Logo and Icons

- **Status**: ✅ Complete
- **Goal**: The server and the WebUI carry the new logo and icons from `assets/logo/` everywhere they show the app's mark, while the desktop client keeps its old icons until it is removed.
- **Scope**:
  - Placed first after the mockup so the milestones after it build on the new marks instead of replacing old ones later: WebUI Responsive Layout and Panels reworks the header, Recovery Page and Operator Retirement builds the recovery page and renames the tray item, and Desktop Retirement Notice shows the icon in its notice. It is small and independent, so dev releases carry the new icons for the rest of the series.
  - Ships in v0.15.0, right after the WebUI design mockup milestone. Depends on: WebUI Design Mockup, whose mockup approves the header's logo.
  - Built to the mockup approved in WebUI Design Mockup (`docs/mockups/reelroulette/`), the reference for its settled design.
  - The files in `assets/logo/`, read from them at this edit: `logo-lockup.svg` (the icon with light text, for the dark theme) and `logo-lockup-dark.svg` (dark text, for the light theme); `logo-icon.svg` (the orange icon alone, on transparency); `logo-icon-tile.svg` (the icon on a rounded orange tile) and `logo-icon-maskable.svg` (on a full-bleed orange square); `app.ico` (16 to 256 px) and `favicon.ico` (16, 32, and 48 px); and in `png/`, the plain icon at 16 to 256 px (`icon-*.png`), the tile at 192 and 512 px (`pwa-*.png`), the maskable square at 192 and 512 px (`pwa-maskable-*.png`), and `apple-touch-icon.png` (180 px, full bleed).
  - WebUI slice. Its copies live in `src/clients/web/ReelRoulette.WebUI/public/`, which the WebUI build copies into its output and `tools/scripts/stage-webui-assets.ps1` stages into the server's web root:
    - The header shows `logo-lockup.svg` in the dark theme and `logo-lockup-dark.svg` in the light theme in place of the "ReelRoulette" text, and `logo-icon.svg` alone on a phone, with "ReelRoulette" as its accessible name (decided in WebUI Design Mockup). Read from code at this edit: the header shows the name as text (`ui/Header.tsx`).
    - The page title and the manifest's `name` say "ReelRoulette" in place of "ReelRoulette WebUI", and so does the startup error page's heading, since text users see doesn't say WebUI (decided in WebUI Design Mockup). Read from code at this edit: `index.html`'s title, `public/manifest.webmanifest`'s `name`, and `StartupError` in `src/ui/App.tsx` say "ReelRoulette WebUI"; the manifest's `short_name` and the Apple web app title already say "ReelRoulette".
    - The favicon is `favicon.ico`, with `logo-icon.svg` for browsers that take an SVG icon, in place of `/HI.ico` in `index.html`.
    - The manifest's icons are `pwa-192.png` and `pwa-512.png` with purpose `any`, and `pwa-maskable-192.png` and `pwa-maskable-512.png` with purpose `maskable`, in place of `icons/icon-192.png` and `icons/icon-512.png`. The Apple touch icon is `apple-touch-icon.png`.
    - `scripts/sync-shared-icon.mjs`, which runs before dev and build, copies these files. Read from code at this edit: it copies `HI.ico` and resizes `HI-256.png` and `HI-512.png` with `sharp`, its only user, so `sharp` leaves the dev dependencies now that the files come at their sizes. `scripts/verify-build-output.mjs` checks the new files, and the tracked `public/HI.ico` and old `public/icons/` PNGs go.
    - Weak build check, moved here from Client Robustness Findings in the v0.15.0 milestone review, since this milestone changes what `scripts/verify-build-output.mjs` checks: it only checks that `apiBaseUrl` in `dist/runtime-config.json` is a non-empty string, while `parseRuntimeConfig` rejects more. Validate with the same rules the app uses at runtime.
  - Server slice. Its copies sit next to the executable, copied there by `ReelRoulette.ServerApp.csproj`:
    - The Windows executable icon (`ApplicationIcon`) and the tray icon are `app.ico`, in place of `HI.ico` (`ResolveSharedIconPath` in `Program.cs`, which `AvaloniaTrayHostUi` loads).
    - The Linux desktop entry (`LinuxAppImageRegistrationService`, `reelroulette-server.desktop`) installs `png/icon-256.png` as its 256 px icon and `logo-icon.svg` as its scalable icon, in place of `HI-256.png` and `HI-512.png`, since the new set has no plain 512 px PNG.
      - Trap, inferred: an install that registered the old icons keeps `icons/hicolor/512x512/apps/reelroulette-server.png` in the user's data folder, and a desktop environment may prefer it to the scalable icon, so registration removes it.
    - The Operator page's icon link (`/HI.ico` in `Program.cs`) points at the new favicon until Recovery Page and Operator Retirement retires the page.
  - Release packaging slice. Read from code at this edit: `release.yml` passes one `--icon` to every Velopack leg, `assets/HI.ico` on Windows and `assets/HI-256.png` on Linux, which sets the Windows installer's and the Linux AppImage's icon (inferred from Velopack's `--icon` option, not checked against its docs at this edit). Each leg gets its own: the server's use `assets/logo/app.ico` and `assets/logo/png/icon-256.png`, and the desktop's keep the old ones. `verify-linux-packaged-server-smoke.sh` packs with `icon-256.png`.
  - The desktop client keeps its old icons, since Desktop Client Removal removes it in v0.16.0: its executable and window icon, its Avalonia resource, its Linux menu registration, and its release legs' `--icon`.
  - Where the old icons are used, read from code at this edit:
    - `assets/HI.ico`: the server's `ApplicationIcon`, tray icon, and Operator page icon link; the WebUI's favicon, through `sync-shared-icon.mjs` and the tracked `public/HI.ico`; `stage-webui-assets.ps1`; `release.yml`'s Windows `--icon`; `ReverseProxyAccessTests`' list of files an unpaired device may load; and the desktop's `ApplicationIcon`, window icon (`MainWindow.axaml`), and Avalonia resource.
    - `assets/HI-256.png`: the server's and the desktop's Linux menu registration, the WebUI's 192 px PWA icon and Apple touch icon, `release.yml`'s Linux `--icon`, and `verify-linux-packaged-server-smoke.sh`.
    - `assets/HI-512.png`: the server's and the desktop's Linux menu registration, and the WebUI's 512 px PWA icon.
    - After this milestone only the desktop project and its release legs use them, and Desktop Client Removal deletes them.
  - Tests: `ReverseProxyAccessTests`' list of files an unpaired device may load swaps `/HI.ico` and `/icons/icon-192.png` for the new favicon and manifest icons.
  - Docs: `README.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, and `CONTEXT.md`, which describe the old icons and their pipeline.
  - Add a Release Specific checklist item, under Manual checks: "With the dev release installed on Windows and Linux, the server's executable, shortcut, tray, and Linux menu icons show the new logo, the WebUI's tab icon and its installed app icon on Android and iOS show it too, and the desktop app keeps its old icon."
- **Acceptance criteria**:
  - The WebUI's header shows the lockup for the theme, or the icon alone on a phone, named "ReelRoulette", and no "ReelRoulette" text.
  - The favicon, the manifest's `any` and `maskable` icons, and the Apple touch icon are the new files, and the manifest's sizes match them.
  - The page title, the manifest's `name`, and the startup error page's heading say "ReelRoulette".
  - The server's executable and tray icon are `app.ico`, its Linux menu entry uses the new icons and leaves no old 512 px icon behind, and its Velopack legs use the new icons while the desktop's keep the old ones.
  - Outside the desktop project and its release legs, nothing refers to `HI.ico`, `HI-256.png`, or `HI-512.png`.
  - `verify-build-output.mjs` checks `dist/runtime-config.json` with the rules `parseRuntimeConfig` uses.
  - The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- **Verification evidence**:
  - `npm run verify`: 595 tests passing, then the build and `verify-build-output.mjs`. The check confirms the favicon, the three logo SVGs, and the Apple touch icon exist, that every manifest icon exists with a PNG whose pixel size matches its `sizes`, that both purposes `any` and `maskable` are listed, and that the Apple touch icon is 180×180. It checks `dist/runtime-config.json` with `parseRuntimeConfig` itself, imported from `src/config/runtimeConfig.ts`, which Node 24 runs as is. Against tampered copies of `dist`, it failed on an `apiBaseUrl` with a path, a manifest size that didn't match its PNG, the maskable icons removed, a missing favicon, and a 512 px Apple touch icon, and passed on the untampered copy.
  - The synced files in `public/` are byte-identical to `assets/logo/`. `sharp` left the dev dependencies with `npm uninstall sharp`.
  - WebUI header test (`src/test/screens/header.test.ts`): with the app's whole stylesheet loaded, only the dark lockup shows in the dark theme at 1200 px, only the light-theme lockup in the light theme, and only the icon at 400 px in both themes. Each image is named "ReelRoulette", and the header has no "ReelRoulette" text. Removing the light-theme rules or the rule that hides the icon on wide screens made it fail. The startup error test checks its heading says "ReelRoulette". The starting-markup snapshot changed only in the header.
  - Server test (`LinuxAppImageRegistrationServiceTests`), using the icons the build copies next to the assembly: a fresh data home gets the menu entry, the 256 px PNG, and the scalable SVG; an old install gets the new icons and loses its 512 px icon; a leftover 512 px icon alone counts as a change and is removed; a second run changes nothing. Undoing the removal, not counting it as a change, skipping the SVG, or always rewriting the icons each made a test fail.
  - `dotnet build ReelRoulette.sln` with no warnings, and `dotnet test ReelRoulette.sln`: 748 tests passing (Core 466, desktop 275, ServerApp 7).
  - `./tools/scripts/verify-linux-packaged-server-smoke.sh` passed. It packs with `assets/logo/png/icon-256.png` and checks that the isolated data home has the 256 px PNG and the scalable SVG and no 512 px icon, and that nothing named `reelroulette-*` changed under the real `~/.local/share/icons`.
  - `release.yml`: the matrix step, run locally with a dev and a stable version, gives the server legs `assets/logo/app.ico` (Windows) and `assets/logo/png/icon-256.png` (Linux) and the desktop legs `assets/HI.ico` and `assets/HI-256.png`, and the pack step passes the leg's icon.
  - `node docs/mockups/reelroulette/build/check.mjs`: 672 checks, all passing. The mockup needed no change: it already showed the header logo per theme and width, the "ReelRoulette" startup error heading, and the SVG page icon.
  - A search for `HI.ico`, `HI-256`, and `HI-512` outside the history files finds only the desktop project, the desktop release legs in `release.yml`, the two lines in `CONTEXT.md` and `docs/domain-inventory.md` saying the desktop keeps them, and the Desktop Client Removal entry in `MILESTONES.md`, which deletes them.
  - `index.html`'s `<title>` and the manifest's `name` are "ReelRoulette", and a search for "ReelRoulette WebUI" outside the history files finds nothing. The server's `ApplicationIcon` is `assets/logo/app.ico`, and `ResolveSharedIconPath` in `Program.cs`, which gives the tray its icon, loads `app.ico` from next to the executable, falling back to `assets/logo/app.ico` in the repo.
  - The installed icons are covered by the Release Specific manual check for the dev release on Windows and Linux. At the user's request it also checks the server executable's icon in Explorer at each icon view size and the tray icon on Windows, since `app.ico` stores every size as PNG.
  - Docs updated: `CONTEXT.md`, `README.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `docs/architecture.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md`.

### M12c - WebUI Design Mockup

- **Status**: ✅ Complete
- **Goal**: Every visible part of v0.15.0 is designed in one interactive mockup and approved before the milestone that builds it starts, so the release's UI is designed as a whole.
- **Scope**:
  - Ships in v0.15.0, after the WebUI Preact migration milestone and before the rest of the series. Depends on: WebUI Preact Migration, whose look the mockup starts from.
  - The mockup is in `docs/mockups/webui-panels/`: self-contained pages that open without the WebUI or a network, built from sources in `build/`, with a happy-dom check of their scripts and a README on rebuilding them and serving them to a phone. It is tracked and stays as the design reference when this milestone completes. Its magenta Mockup tab and dashed notes are mockup controls, not part of the design. A Mockup option hides every note, leaving only the Mockup tab and its options, so screens can be seen as they will ship.
  - The whole visible UI of v0.15.0, at phone, tablet, and desktop widths and in the light and dark themes:
    - The main page: the header, the player and its controls, the status line, and the panel beside the player or as the full-screen overlay, from WebUI Responsive Layout and Panels.
    - The Library, Filter, and Tags tabs, from WebUI Responsive Layout and Panels, with the Favorites and Blacklisted filter modes from Favorite and Blacklist Filter Modes; the Stats tab, from WebUI Stats Panel; and the Settings tab with every per-device setting from the desktop's Settings dialog that the WebUI keeps, including the autoplay modes and Auto-Pause, from WebUI Settings Panel and WebUI Keyboard Shortcuts and Player Controls.
    - The dialogs and the field validation pattern, from WebUI Responsive Layout and Panels and WebUI In-App Dialogs, and the notices and status line messages, from WebUI Status Line Overhaul.
    - The full-page admin view and its sections, from WebUI Admin Section, Admin Refresh, Backup, and Duplicate Review (with duplicate review), Admin Source and Item Management, Admin Library Catalog Transfer, and Testing Suite Overhaul.
    - The keyboard shortcuts and their reference, the volume control, the seek and volume steps, ambient mode, and when the player's controls hide, from WebUI Keyboard Shortcuts and Player Controls.
    - Show in File Manager and Copy Path, from Show in File Manager from the WebUI.
    - The browser-playable option and its message, from Browser-Playable Filter.
    - The grid's placeholder tiles, from WebUI Grid Rendering.
    - Multi-select and bulk actions, from WebUI Multi-Select and Bulk Actions.
    - Keyboard focus throughout and the Library grid's keyboard navigation, from WebUI Keyboard Navigation and Focus.
    - The desktop's retirement notice, from Desktop Retirement Notice.
    - The logo in the header, the page icon, and the icon on the recovery page and the desktop notice, from New Logo and Icons, WebUI Admin Section, and Desktop Retirement Notice.
  - Each decision approved in the mockup is recorded in the milestone that builds it. A UX question a later milestone leaves to be decided there is decided in the mockup, where it can be seen, and recorded in that milestone.
  - Settled with the mockup:
    - The panel is a full-screen overlay below 800 px of viewport width, or on a touch screen (coarse pointer) below 500 px of viewport height, which is a phone on its side. Otherwise it sits beside the player, on the right until the Settings tab lets each device choose.
    - Beside the player, the panel's width runs from 360 px to whatever leaves the player 400 px wide, and starts at 420 px. The 800 px breakpoint is those 360 px and 400 px plus the resize handle and the page's padding.
    - Library tiles are smaller, beside the player and as the overlay: rows 100–240 px high, aiming for 160 px.
    - Each approved decision is recorded in the milestone that builds it: New Logo and Icons, Favorite and Blacklist Filter Modes, WebUI Responsive Layout and Panels, WebUI In-App Dialogs, WebUI Settings Panel, WebUI Admin Section, Admin Refresh, Backup, and Duplicate Review, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Keyboard Shortcuts and Player Controls, Browser-Playable Filter, WebUI Multi-Select and Bulk Actions, WebUI Keyboard Navigation and Focus, WebUI Stats Panel, Show in File Manager from the WebUI, WebUI Status Line Overhaul, Testing Suite Overhaul, Admin Log Viewer, Desktop Retirement Notice, and Desktop Client Removal. Loudness normalization is declined for v0.15.0 and has its own milestone, WebUI Loudness Normalization.
    - "WebUI" is an internal name: from v0.15.0, text users see says "ReelRoulette" instead, as `AGENTS.md` requires. The mockup follows it, and the milestones that build each renamed text record it: New Logo and Icons (the page title, the installed app's name, and the startup error page's heading), WebUI Settings Panel (the Diagnostics row), Admin Source and Item Management, Testing Suite Overhaul, and Desktop Retirement Notice.
    - Each v0.15.0 milestone that builds UI names the mockup as the reference for its settled design.
  - Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - Every visible v0.15.0 feature is in the mockup at phone and desktop widths, and the user has approved it.
  - Each decision approved in the mockup, including each UX question a later milestone left to be decided there, is recorded in the milestone that builds it.
  - The mockup's pages open without a network, and its check passes.
- **Verification evidence**:
  - `node docs/mockups/webui-panels/build/check.mjs`: 641 checks, all passing, at 1280 and 390 px wide. Checks added for a fix were each seen to fail with the fix undone and pass with it.
  - The pages open without a network: a search of the six built pages finds no `http://` or `https://` URL, and every `src`, `href`, and CSS `url()` in them is a `data:` URI, an in-page anchor, or another of the mockup's pages.
  - The user approved each screen over the mockup's review rounds, the last on 2026-10-08: the volume slider at the end of the seek row; the keys for the tabs and the panel, and the order Esc closes things in; the Stats tab; the browser-playable option's label and format notice; the admin view's layout, the Edit Source dialog, the backup restore list, the import remap dialog, and duplicate review's layout; the desktop retirement notice's wording; the panel widths; the browser-playable option off by default; and every other detail as mocked, including the exact focus colors and the control token hidden with Show and Copy, asking before a change is saved.
  - Each decision is recorded in the milestone that builds it, listed under Settled above.
  - `AGENTS.md` gains the rule that text users see says "ReelRoulette", not "WebUI".
  - The mockup stays in `docs/mockups/webui-panels/` as the design reference.

### M12b - WebUI Preact Migration

- **Status**: ✅ Complete
- **Goal**: The WebUI's screens are Preact components with tests, built on the existing typed modules, with no visible change.
- **Scope**:
  - Ships in v0.15.0, after the reverse proxy and HTTPS access milestone.
  - Measured again at this edit: `src/app.js` is 3,624 lines. `startApp` runs from line 183 to the end as one untyped function with 139 nested functions, which share one `state` object of 33 fields and 27 top-level `let` variables. It looks up 74 elements by id and adds 67 event listeners, and no test imports it. It has 16 `innerHTML` assignments and 9 native dialog calls. The 263 WebUI tests in 23 files cover only the typed modules, and they run with `environment: "node"`, so there is no DOM to test screens against. The built bundle is 119 KB of JavaScript, 32.9 KB gzipped.
  - Preact was chosen at this edit over React, Lit, Svelte, Solid, and plain TypeScript: it adds about 4–5 KB gzipped (published size, inferred), where React would add about 45 KB (inferred); TypeScript checks its JSX; and it adds listeners to each element as `app.js` does, so events behave the same while both run.
  - Packages, installed with approval when this milestone starts: `preact`, `@preact/signals`, `happy-dom`, and `@testing-library/preact`, whose role, label, and text queries also work on the current markup (inferred). `@preact/preset-vite` is not needed: Vite compiles JSX from the tsconfig settings (measured when the Foundation slice started), and the preset only adds hot reload (inferred). Installed then: `preact` 11.0.0, `@preact/signals` 2.11.3, `happy-dom` 20.14.5, and `@testing-library/preact` 3.2.4.
  - Test setup, read from config at this edit: Vitest includes only `src/test/**/*.test.ts`, so `.test.tsx` files would not run, and neither tsconfig sets `jsx` or `jsxImportSource`. Screen tests opt into `happy-dom` per file or through a separate Vitest project, so the model tests keep running under node. Settled in the Foundation slice: Vitest includes `.test.ts` and `.test.tsx`, both tsconfigs set `jsx` to `react-jsx` with `jsxImportSource` `preact`, which Vite and Vitest pick up without a plugin, and a screen test opts into `happy-dom` with a `// @vitest-environment happy-dom` comment.
  - Until the last slice, `app.js` runs inside the Preact root. The root renders the markup not yet migrated once and starts `app.js` after mount, and Preact never re-renders markup `app.js` owns. `app.js` and the components share state only through the store: `startApp` takes the store, so `app.js`'s `setStatus` is a store write, and the handlers `app.js` still owns act on store and server connection events.
  - The store is `@preact/signals` and holds only state several screens use: the current item and history, loop and autoplay, presets and the active preset, the applied filter, randomization mode, photo duration, the item-state cache, the compatibility block, and the status line, whose changes keep relaying to `last.log` as they do now. `app.js` reads and writes the same signals, and acts on another screen's changes through store events. Each screen keeps its own working state, such as the tag editor's pending edits, Auto Tag's rows, and the filter dialog's working copy.
  - The actions that cross screens today (read from code at this edit) are named, so screens never reach into each other: the tag editor pauses the player when it opens and resumes it when it closes (`pauseForTagEditor`, `resumeAfterTagEditor`); a tag save retargets the applied filter and cached presets (`retargetLiveTagFilters`); playing from the library closes the overlay and starts the player; and applying a filter updates the header preset and reloads the library. The store exposes those that change shared state, and the player's are methods on a `player` service next to the server connection, which screens call directly (settled in the Player slice).
  - Each slice moves its logic that renders nothing into typed `.ts` modules tested under node like the existing ones, such as the tag save steps, item-tags event handling, `playCurrent` and random pick, and preset matching. Components only render and wire.
  - Keep the typed modules (library query session, grid layout and virtualizer, tag save, filter state model, events, API) and call them from the components rather than rewriting them. The exception is `renderLibraryOverlayBodyHtml` in `libraryOverlayModel.ts`, which writes the library overlay's loading, error, and empty messages through `innerHTML`; the library overlay slice replaces it.
  - Each slice starts by writing behavior tests for its screen against the current `app.js` in `happy-dom`: the page mounted through `renderApp` with a fake `fetch` and a fake event source (`createSseClient` already takes `createEventSource`), queried by role, label, and text. The slice then migrates the screen and keeps those tests passing, changing only how the page is mounted, and they become its component tests. `app.js` runs under `happy-dom` (measured when the Foundation slice started); `happy-dom` has no `EventSource`, so the harness stubs it.
  - `styles.css` is frozen for this milestone. Components keep the markup's class names and the nine element ids `styles.css` selects besides `#app` (such as `#favorite-btn`, `#filter-panel-presets`, and `#time-display`), so the stylesheet applies as it does today.
  - Migrate screen by screen. Each slice ships with no visible change, removes its code from `app.js`, and ends with a quick desktop-browser spot check from a local dev run:
    - Foundation: the Preact root, the store, connection, pairing, event stream, status line, the header (preset dropdown, randomization mode, photo duration, and now playing), the mobile diagnostics line, the reconnect listeners (`visibilitychange`, `focus`, `pageshow`, and `online`), and startup error. `renderStartupError` in `src/shell.ts` interpolates the error message into `innerHTML` (found by the repository audit, moved here from Client Robustness Findings); render it as text.
    - Player and overlay controls, with fullscreen and iOS pseudo-fullscreen, swipe and tap gestures, and the empty state.
    - Library overlay. It keeps the grid controller, which writes each visible row through `innerHTML` with file names escaped (read from code at promotion). WebUI Grid Rendering replaces that row rendering.
    - Filter dialog.
    - Tag editor and Auto Tag.
  - The document Escape listener closes the library overlay when it is open and otherwise leaves iOS pseudo-fullscreen (read from code at this edit). The player and library overlay slices keep that order when they move it.
  - Overlays stay mounted and hide with `display: none` as today. The library overlay keeps its loaded window and scroll position while hidden and loads its first page before it is first opened, so rendering it only while open would lose both (read from code).
  - Overlays render inside the fullscreen stage, not in a portal to `document.body`, since only the stage shows in fullscreen (read from code).
  - Trap, inferred, not measured: moving a `<video>` element to another place in the page can interrupt or reload playback. The player component owns one video element that is never moved. Today the video and photo elements both stay in the page and are shown or hidden with `display` (read from code); the player keeps that rather than rendering either one only when it is needed.
  - Trap, read from code: the grid controller calls `replaceChildren` on the element it is given, when it is created and when it is destroyed, and today the overlay's loading, error, and empty messages are written into that same element. The controller's host is an element Preact renders with no children, and the messages render in its place, not inside it, so the markup stays the same.
  - Trap: Preact's `onChange` is the DOM `change` event, not React's per-keystroke one. Use `onInput` where `app.js` listens for `input`, such as the library search and the seek slider.
  - The media area's swipe and tap listeners are passive, which JSX cannot set, so the player adds them through a ref.
  - Keep the browser storage keys: `rr_clientId`, `rr_photoDuration`, `rr_randomizationMode`, and `rr_autoTagScanFullLibrary` in `localStorage`, and `rr_sessionId`, `rr_tagEditorCollapsed`, and `rr_filterDialogCollapsedCategories` in `sessionStorage`. A new client id key would make every device a new client to the server.
  - Each screen has an error boundary that relays a line naming the screen to `last.log` through the client log relay and leaves the other screens working. Today an exception breaks one event handler; a render exception with no boundary can blank the whole page (inferred). WebUI Instrumentation later moves the line to a structured entry.
  - Delete `app.js` and `app.d.ts` after the last slice, with the undeclared-name check: `scripts/verify-app-js-names.mjs`, its `verify:app-js-names` step in `npm run verify`, and the step's description in the WebUI README. Update `docs/domain-inventory.md`, which names `app.js` and `shell.tsx`, and the WebUI section of `CONTEXT.md`.
  - Settled in the Foundation slice, for the slices after it:
    - A store field moves in the slice whose screen first needs it outside `app.js`. The Foundation slice moved the status line, the playing item, the play attempt id, presets and the header preset menu, the applied filter, the active preset and its None hold, randomization mode, photo duration, the compatibility block, and the pairing prompt. History, loop and autoplay, and the item-state cache move with the player slice. `app.js`'s `state` object reads and writes moved fields through getters and setters on the store's signals, so the code that uses them did not change.
    - `startApp` takes the page's store, API, server connection, player, and library (`{ store, api, connection, player, library }`). `app.js` acts on cross-screen changes through the store's `headerFilterChanged` and `overlayRequested` events and the server connection's `itemTagsChanged`; the player handles `photoDurationChanged`, the player and the library both handle the item-state event, and the library handles `serverReady`, the playback event, `refreshCompleted`, and `resyncRequired`.
    - The markup `app.js` still owns is `LegacyOverlays` (`LegacyStage` until the Player slice moved the stage and player out of it), whose `shouldComponentUpdate` returns false. Each slice moves its part of it into a component.
    - `App` starts `app.js` in a layout effect, so it still starts inside `renderApp`, and then starts the server connection. `renderApp` returns an unmount function.
    - Screen tests use `src/test/screens/pageHarness.ts`. Its markup snapshot was recorded from `app.js` before the first slice. It normalizes whitespace-only text, style formatting, and `<option>` values, which it compares as `option.value`, because Preact skips a `value` attribute that equals the option's text.
    - The error boundary relays `ui-error screen=<name> error=<type>`: the error's type, never its message, which can hold a file name.
  - Settled in the Player slice, for the slices after it:
    - Playback is a `player` service (`src/playback/player.ts`) in the page's services, next to the server connection, and fullscreen is a `fullscreen` service (`src/playback/stageFullscreen.ts`). The store holds history, loop, autoplay, and the item-state cache, with `pushHistory` and `stepHistory`. A library play is `store.pushHistory`, close the overlay, trace, then `player.playCurrent({ recordPlayback: false })`, in the order `app.js` used, and the tag editor calls `player.pauseForTagEditor` and `player.resumeAfterTagEditor`.
    - The player sets which media element shows, its source, mute, and loop directly on the elements and then calls `play()`, as `playCurrent` did, so the video is never hidden when `play()` runs. The player component renders their `style` once and never changes it. Measured when the slice started: a signal bound to a DOM prop or text updates the page a tick after the write, not synchronously.
    - The seek slider is not rendered from state: the player writes its value and max on `loadedmetadata` and `timeupdate`, as `app.js` did. A controlled value would be reset by each render of the player, and the Foundation slice's slider test catches that.
    - The Library, Select filters, and Edit Tags buttons are in the player and ask for their screen through the store's `overlayRequested` event, which `app.js` handles until those screens move.
    - The Escape listener stays in `app.js` until the library overlay slice moves it: it closes the library overlay when it is open and otherwise calls `fullscreen.exitPseudo()`.
    - The player ignores the video's events while a photo shows and the photo's while a video shows, as `app.js` did by clearing their handlers. The two checks `app.js` ran right after setting the values they compared, which could never fire, were dropped.
    - Kept as it was, and locked by tests: Mute is enabled at startup, and pressing it before anything plays disables it and mutes the first video.
    - Screen tests stub the Fullscreen API, which happy-dom lacks, and element sizes, which happy-dom does not compute, so the library grid renders its tiles (`stubFullscreenApi` and `stubLayoutSize` in the page harness). Measured when the slice started: without the size, the grid renders no tiles.
  - Settled in the Library overlay slice, for the slices after it:
    - The library overlay is a `library` service (`src/library/library.ts`) in the page's services, created after the player so the player handles an item-state event first. It owns the query session, search and sort, the search wait, the open state, and tile play, and acts on `serverReady`, the favorite and playback events, `refreshCompleted`, `resyncRequired`, and the store's `headerFilterChanged`. The tag editor and filter dialog in `app.js` use `library.session` and `library.commitQuery()`.
    - The service sets the overlay's `display` directly and then flushes the grid's deferred layout, so the grid never measures a hidden overlay; the component renders the overlay's `style` once. The toolbar, totals, direction label, and body are signals the service writes where `app.js` wrote the page, so the overlay stays empty until it first opens, and the direction label changes when the page in the new order arrives, as before.
    - The body is either the grid's host, an element with no children that the grid controller fills and that lives as long as the grid, or the message's container, and the two are keyed apart. A reload while tiles show keeps the host and its scroll position, and no message shows in between. Measured when the slice started: Preact 11 leaves alone children it did not create when it renders an element again with no children.
    - The Library button calls `library.open`, and `overlayRequested` names only the filter dialog and tag editor. The stage handles Escape: it closes the library overlay when it is open and otherwise leaves pseudo-fullscreen, and its listener is removed on unmount.
    - `stubLayoutSize` gives an element that is not rendered no size, as a browser does, so screen tests see the grid defer its layout while the overlay is hidden.
  - Settled in the Filter dialog slice, for the slices after it:
    - The filter dialog is a `filterDialog` service (`src/filter/filterDialog.ts`) in the page's services, created after the library, with its General, Tags, and preset row logic in `src/filter/filterDialogModel.ts`. Each change replaces one working-copy signal and works out the heading and Apply's star again, as `app.js` did after each change. The Select filters button calls `filterDialog.open`, and `overlayRequested` names only the tag editor. The service handles `headerFilterChanged` while the dialog is open.
    - The General tab keeps its fields in a draft beside the working filter, filled from the filter where the filter changed or the dialog started over (open, a preset chosen, Clear all, Refresh, and a header change). Rendering the fields from the filter would clear a duration that is not valid and check No minimum again as soon as it is unchecked. A field reaches the working filter on `change` and a duration's text follows `input`, so Apply's star appears when the user leaves the field, as before.
    - The dialog renders its `display` from the service: unlike the library overlay, nothing has to happen between showing it and laying it out. Its panels stay empty, and only General has no `style`, until it first opens, so the starting markup stays the same.
    - The component keeps `app.js`'s markup, including `data-*` attributes nothing reads any more, so the recorded snapshots stay the same.
    - Delete and rename keep their native `confirm` and `prompt`, which the service takes as options. happy-dom has neither; screen tests stub them with `vi.stubGlobal`, which reaches `window.confirm` (measured when the slice started).
    - Screen tests compare form controls with `normalizedMarkup(node, { liveFormState: true })`: `checked`, `selected`, and a field's `value` by property, which is what the user sees, since `innerHTML` wrote attributes that keep their first value and Preact writes properties. The harness also compares a zero length as `0px` and leaves out an empty `class` attribute, which differed only in how the old and new markup were serialized.
  - Not included: replacing the native dialogs, which is WebUI In-App Dialogs.
  - Add a Release Specific manual checklist item, which is this milestone's phone check: "After the Preact migration, the player, library overlay, filter dialog, presets, tag editor, and Auto Tag look and work as in the previous release, in and out of fullscreen, on a desktop browser, an iPhone or iPad in Safari, an Android phone, and as an installed app."
- **Acceptance criteria**:
  - Each slice's behavior tests, written against `app.js` before the slice, pass against the migrated screen and run in `npm run verify` under `happy-dom`.
  - `styles.css` is unchanged from before this milestone's first slice.
  - `src/app.js`, `src/app.d.ts`, and the undeclared-name check no longer exist, and `npm run verify` does not refer to them.
  - Outside tests, no WebUI code uses `innerHTML` or `dangerouslySetInnerHTML` except the grid controller's row rendering, which WebUI Grid Rendering replaces.
  - The video element is the same node before and after each overlay opens and closes and after switching between a photo and a video. Playback continues while the library overlay and filter dialog are open, and the tag editor pauses and resumes it as it does today.
  - The WebUI reads and writes the same browser storage keys as before.
  - A render error in one screen is relayed to `last.log` and leaves the other screens working.
- **Verification evidence**:
  - Completion evidence must include, per slice, the behavior tests written before migrating and passing after, and a quick desktop-browser spot check from a local dev run; tests for video node identity, storage keys, and the error boundary; `npm run verify`; a check that `styles.css` is unchanged; and the updated docs. The phone check is the Release Specific item above, run in the pre-release pass.
  - Foundation slice:
    - Behavior tests in `src/test/screens/foundation.test.ts` (28) cover startup, the event stream and its reconnects, refresh status and resync, the status relay, the header preset dropdown, randomization mode, photo duration, now playing, pairing, the compatibility block, mobile diagnostics, the storage keys `rr_clientId`, `rr_sessionId`, `rr_photoDuration`, and `rr_randomizationMode`, the starting markup, video node identity, and the startup error. Written first against `app.js`: 27 passed and the startup error test failed, since `renderStartupError` wrote the message as HTML. After migrating, all 28 pass. Run again with the final harness against the code at the previous commit, extracted to a scratch folder: the same 27 pass and the startup error test fails. The harness changed only in how the page is mounted and unmounted, plus the `<option>` normalization above; the recorded snapshot is unchanged.
    - The `<video>` element is the same node, and the seek slider keeps its value, while the header preset, now playing, and status line change.
    - `src/test/screens/screenBoundary.test.tsx`: a screen that fails on its first render, or on a later one, relays one `ui-error` line without the error message, and the player, status line, and event stream keep working.
    - Node tests for the new typed modules: `appStore.test.ts`, `serverConnection.test.ts`, `appApi.test.ts`, `serverCompatibility.test.ts`, `nowPlaying.test.ts`, and the new line in `relayLogLines.test.ts`.
    - Tests fail when what they guard breaks: removing the space in now playing, remounting the legacy stage on each status change, removing the boundary's relay, and turning off the status relay's one-second de-duplication each failed their tests.
    - `npm run verify`: 29 test files, 318 tests, build and build-output checks pass.
    - `styles.css` is git blob `66d3dec6fa065d358ffc77c56ba861b95ef8c517`, unchanged, and the built CSS asset hash is unchanged.
    - Bundle: 119.33 KB (32.87 KB gzipped) before, 144.92 KB (42.55 KB gzipped) after. Preact 11 with its hooks and `@preact/signals` measure 8.0 KB gzipped of that.
    - Desktop-browser spot check from a local dev run (`run-server-rebuild.ps1`), all passed: the page looks as before and reaches "Ready (API 1)" and "SSE connected"; a header preset changes Library and Next; now playing shows the file name and duration, and Next and Previous work; randomization mode and photo duration survive a reload; applying a filter updates the header preset, and the Library, Filter, and Tag overlays open in and out of fullscreen; the console shows no new errors.
    - `src/auth/authBootstrap.ts` and its test were removed: nothing used them, and their compatibility check was worded differently from the one users see. The `coreApi.ts` version, pairing, and refresh status helpers, which only it used or nothing used, were removed with their tests. `set-release-version.ps1` no longer updates that test, and the Auth Cutover for API and Admin entry no longer names the file.
    - Docs: `docs/domain-inventory.md`, the WebUI section of `CONTEXT.md`, the WebUI `README.md`, and the Release Specific manual check above in `docs/checklists/testing-checklist.md`.
  - Player slice:
    - Behavior tests in `src/test/screens/player.test.ts` (41) cover random pick with its failures and timeout, the empty state, video and photo playback with their load and error statuses, Play/Pause, Previous and Next through history, favorite and blacklist and item-state events, loop, autoplay and the photo timer, mute, seek, the controls and swipe and tap gestures, fullscreen and pseudo-fullscreen with Escape, the tag editor's pause and resume, playback with the library overlay and filter dialog open, playing a library tile, video and photo node identity, no elements added or removed in the stage or media area, and no new storage keys. Written first against `app.js`: all 41 passed. After migrating, all pass, and the Foundation tests and their recorded snapshot pass unchanged. Run again with the final harness against the code at the previous commit, extracted to a scratch folder, the Player and Foundation tests (69) pass.
    - `src/test/screens/screenBoundary.test.tsx`: a player that fails to render relays one `ui-error screen=player` line without the error message, and the header, status line, overlays, and event stream keep working.
    - Node tests for the new typed modules: `player.test.ts`, `stageFullscreen.test.ts`, `mediaGestures.test.ts`, and new cases in `randomPick.test.ts` and `appStore.test.ts`.
    - Tests fail when what they guard breaks: each of 12 deliberate breaks failed at least one test: recreating the video for each item, rendering the seek slider's value, not ignoring the click after a swipe or tap, handling the video's events during a photo, remounting the overlays on a fullscreen change, showing the video after `play()`, setting mute after `play()`, tracing a library play before it joins history, recording a library play twice, leaving the player out of its error boundary, leaving pseudo-fullscreen on Escape before closing the library overlay, and not pausing for the tag editor.
    - `npm run verify`: 33 test files, 390 tests, build and build-output checks pass.
    - `styles.css` is still git blob `66d3dec6fa065d358ffc77c56ba861b95ef8c517`, and the built CSS asset hash is unchanged.
    - `src/app.js` went from 3,227 to 2,589 lines. Bundle: 144.92 KB (42.55 KB gzipped) before, 145.43 KB (43.25 KB gzipped) after.
    - Desktop-browser spot check from a local dev run (`run-server-rebuild.ps1`), all passed: the page looks as before, and clicking the empty state plays with "Playing"; Play/Pause changes its icon, Next picks, Previous goes back, and Next moves forward again without a pick; Mute is disabled on a photo, Autoplay moves on when a video ends, and Loop repeats it; Favorite and Blacklist light up and clear each other; the seek slider seeks and the time updates; a click on the video hides and shows the controls; fullscreen enters and exits, and the Library, Filter, and Tag overlays open in fullscreen; the tag editor pauses and resumes the video, and a library tile plays and closes the overlay; the console shows no new errors.
    - Docs: `docs/domain-inventory.md` and the WebUI section of `CONTEXT.md`.
  - Library overlay slice:
    - Behavior tests in `src/test/screens/library.test.ts` (32) cover opening with the Library button and closing with Close and Escape, the compatibility block, the overlay's markup while loading, with tiles, and on a load error, the first page loading before the overlay opens and its loading, error, empty, and no-match messages, search and its wait, sort and the direction label changing when the page arrives, search and sort kept across closing and reopening, a new query scrolling to the top, fill on scroll one page at a time and only while shown, a failed further page loading again after the scroll position changes, hiding and showing keeping the tiles and scroll position, tiles reloaded while hidden laying out when the overlay opens, a refresh or live-update reload while tiles show keeping the same grid element and scroll position with no message in between, a header preset and the filter dialog starting over, favorite, playback, and tag events patching or reloading, Enter and Space on a tile, refused, unauthorized, and unreachable plays, one play at a time, tile names as text, thumbnail versions, badges, and no new storage keys. Written first against `app.js`: 28 passed, and 4 failed on expectations the tests had wrong (the default filter excludes blacklisted files, scrolling far past the end keeps filling, and the error trace carries its message); with those corrected, all 32 passed. After migrating, all pass, and the Foundation and Player tests and their snapshot pass unchanged. Run again with the final harness against the code at the previous commit, extracted to a scratch folder, the Library, Foundation, and Player tests (101) pass.
    - `src/test/screens/screenBoundary.test.tsx`: a library overlay that fails to render relays one `ui-error screen=library` line without the error message, and the player, header, status line, filter dialog, and event stream keep working.
    - Node tests for the new typed module: `library.test.ts` (19), and updated `libraryOverlayModel.test.ts` and `appStore.test.ts`.
    - Tests fail when what they guard breaks: each of 11 deliberate breaks failed at least one test: showing the overlay after flushing the grid's deferred layout, keying the grid host by the totals so a reload remounts it, filling while hidden (with the query session's own check removed too, since the service's check alone is a second guard), keeping a waiting search on a commit, removing the one-play-at-a-time guard, updating the direction label at once, Escape leaving pseudo-fullscreen before closing the library overlay, leaving the overlay out of its error boundary, showing Loading while any query runs, opening the library through the store event, and not updating the toolbar and totals while hidden.
    - `npm run verify`: 35 test files, 443 tests, build and build-output checks pass.
    - `styles.css` is still git blob `66d3dec6fa065d358ffc77c56ba861b95ef8c517`, and the built CSS asset hash is unchanged.
    - `src/app.js` went from 2,589 to 2,235 lines. Bundle: 145.43 KB (43.25 KB gzipped) before, 146.25 KB (43.59 KB gzipped) after. Outside tests and `app.js`, the grid controller's row rendering is the only `innerHTML`.
    - Desktop-browser spot check from a local dev run (`run-server-rebuild.ps1`), passed: the Library button opens the overlay with its totals, toolbar, and tiles as before; scrolling near the bottom loads more tiles without stopping; search updates once typing stops, and a sort mode and the direction button re-sort and change the label; closing and reopening keeps the search, sort, and scroll position; a header preset change while the overlay is closed shows the new totals on reopening; click, Enter, and Space on a tile play it and close the overlay; favoriting the playing item shows the tile's badge; the console shows no new errors. Escape with the overlay open in real fullscreen: the browser takes the first Escape to leave fullscreen before the page sees it, as in the build before this slice, so closing the library overlay first applies only in pseudo-fullscreen, where the screen tests cover it.
    - Docs: `docs/domain-inventory.md` and the WebUI section of `CONTEXT.md`.
  - Filter dialog slice:
    - Behavior tests in `src/test/screens/filter.test.ts` (33) cover opening from Select filters after loading sources, tags, and presets, tab switching, Close and Cancel applying nothing and saving no preset changes, which reopening drops, the compatibility block, a failed load, the markup of each tab, the messages for no sources, tags, or presets, the General tab showing the applied filter, Apply's star and the heading following each change, applying to the library, the next random pick, and the header, No minimum and No maximum, a duration that is not valid stopping Apply on General, a duration typed just before Apply, source inclusion, tag order, include and exclude chips, the category combination and each category's match mode, filter tags the catalog does not have, collapsed categories kept for the session, choosing a preset and None, a chosen preset applying as that preset with its id in random picks, Add, Update, Move, Delete, and Rename with their messages and saves, a failed preset save, the header's None hold, a header preset picked while the dialog is open, Refresh, Clear all filters, names shown as text, and no new storage keys besides `rr_filterDialogCollapsedCategories`. Written first against `app.js`: all 33 passed. The harness then gained the zero-length and empty-`class` normalizations above, and the dialog's snapshot was recorded again from `app.js` at the previous commit, extracted to a scratch folder, with the final harness; it differs from the first recording only in those two places. After migrating, all 33 pass, and the Foundation, Player, and Library tests and their snapshots pass unchanged. Run again with the final tests and harness against the code at the previous commit, the Filter, Foundation, Player, and Library tests (134) pass, and the one test added after the move, below, fails there as intended.
    - Intended differences, from no longer rebuilding a panel on each change: focus stays on the tag chip or collapse toggle that was used; the preset list keeps its scroll position after a move, rename, or delete; a typed new preset name is kept when the list changes, and is still cleared when the dialog opens and after Add Preset; and deleting a preset no longer fills the General tab again from the working filter, which had cleared a duration that is not valid and checked No minimum. A screen test added after the move keeps the clicked controls, the preset list element, and a typed name in place, and `filterDialog.test.ts` covers the name and the General tab after a delete.
    - `src/test/screens/screenBoundary.test.tsx`: a filter dialog that fails to render relays one `ui-error screen=filter` line without the error message, and the player, header, status line, library overlay, tag editor, and event stream keep working.
    - Node tests for the new typed modules: `filterDialogModel.test.ts` (12) and `filterDialog.test.ts` (17), and an updated `appStore.test.ts`.
    - Tests fail when what they guard breaks: each of 15 deliberate breaks failed at least one test: filling the General tab from the working filter on each change, updating the working filter while a duration is typed, the dialog's preset not following the working filter, leaving the dialog out of its error boundary, showing the dialog before its data loads, keeping the General tab when a preset is chosen, starting a closed dialog over on a header change, styling the General panel before the first open, not saving collapsed categories, starting the library over before the filter is applied, keeping unsaved presets on Clear all, clearing the new preset name when the list changes, leaving preset changes out of Apply's star, keeping unsaved presets when the dialog opens again, and saving changed presets on Close.
    - `npm run verify`: 38 test files, 507 tests, build and build-output checks pass.
    - `styles.css` is still git blob `66d3dec6fa065d358ffc77c56ba861b95ef8c517`, and the built CSS asset hash is unchanged.
    - `src/app.js` went from 2,235 to 1,367 lines, its `innerHTML` assignments from 12 to 8, and its native dialog calls from 9 to 7. Bundle: 146.25 KB (43.59 KB gzipped) before, 143.79 KB (43.60 KB gzipped) after. Outside tests and `app.js`, the grid controller's row rendering is still the only `innerHTML`.
    - Desktop-browser spot check from a local dev run (`run-server-rebuild.ps1`), all passed: Select filters opens on General with the preset heading and looks as before; Favorites only marks Apply with a star, and Apply shows "Filters applied.", updates the header preset, and the library shows only favorites; a valid duration marks Apply once the field is left, and an invalid duration such as `abc` returns Apply to its unmarked state instead of showing the invalid-duration message, as in the build before this slice (the message goes to the status line when Apply runs, and the open dialog covers the status line, read from code); include and exclude chips toggle, and a collapsed category stays collapsed after reopening; choosing a preset updates the heading, and Add, Move, Rename, and Delete work and Apply saves them to the header list; Refresh and Clear all filters behave as before; in fullscreen the dialog shows over the stage and the video keeps playing; the console shows no new errors. WebUI Responsive Layout and Panels replaces the invalid-duration message with its field validation pattern.
    - Docs: `docs/domain-inventory.md` and the WebUI section of `CONTEXT.md`.
  - Tag editor and Auto Tag slice:
    - Behavior tests in `src/test/screens/tags.test.ts` (41) cover opening from Edit Tags with the tags of the playing item or of no item, closing and asking before dropping changes, each open starting on Edit Tags with Scan full library as last set and View all matches off, a failed load or Refresh, the markup of each tab and of the Edit Tag dialog, names shown as text, category and tag order with Uncategorized, chip states and add and remove turned off when nothing plays, add and remove and their save, collapsed categories kept for the session, moving, renaming (with the duplicate alert), deleting, and adding categories, adding tags with and without a playing item, a typed tag name and its category kept across closing, the Edit Tag dialog's focus, Cancel, click outside, empty name, rename, and category change, deleting tags, Refresh, the order of the save steps with Auto Tag last and the editor closing before the server answers, a refused step, a save that cannot reach the server, the library reloading once under a tag filter and not for the page's own event, a saved rename or delete changing the applied filter, its preset, the library, and random picks, another client's rename, Auto Tag's scan request and stored Scan full library, progress and the controls turned off while scanning, result rows, row boxes with partial selection, View all matches, Select all and Deselect all and their save, dropping Auto Tag selections, no matches, matches that all have their tag, a failed scan, and no new storage keys besides `rr_tagEditorCollapsed` and `rr_autoTagScanFullLibrary`. Written first against `app.js`: 40 passed and one failed on an expectation the test had wrong (a category name also shows in the new tag's category list); with that corrected, all 41 passed. After migrating, all 41 pass, and the Foundation, Player, Library, and Filter tests and their snapshots pass unchanged. Run again with the final tests and harness against the code at the previous commit, extracted to a scratch folder, the Tag, Foundation, Player, Library, and Filter tests (176) pass, and the one test added after the move, below, fails there as intended. The harness is unchanged.
    - Kept as they were and locked by tests, and recorded in WebUI Status Line Overhaul: a failed scan shows "Scan complete: no matching tags found.", a scan whose matches all have their tag leaves the status on "Scanning…", and a save that cannot reach the server shows the message of the last step the server refused on the page. Also kept: a typed new tag name and its category, and the Edit Tag dialog's last values, stay while the editor or the dialog is closed.
    - Intended difference, from no longer rebuilding the Edit Tags body and the Auto Tag results on each change: focus stays on the chip, category, expand, or row control that was used. A screen test added after the move covers it.
    - `src/test/screens/screenBoundary.test.tsx`: a tag editor that fails to render relays one `ui-error screen=tags` line without the error message, and the player, header, status line, library overlay, filter dialog, and event stream keep working.
    - Node tests for the new typed modules in `src/tags/`: `tagEditorModel.test.ts` (15), `autoTagModel.test.ts` (9), and `tagEditor.test.ts` (17), and an updated `appStore.test.ts`.
    - Tests fail when what they guard breaks: each of 15 deliberate breaks failed at least one test: rebuilding the categories on each change, resuming before the editor hides, showing the editor before pausing, leaving Save enabled during a scan, not storing collapsed categories, sending the save steps in reverse, leaving the editor out of its error boundary, keeping the previous tag model's category order on open, clearing the Edit Tag dialog's fields on Cancel, always showing the summary after a scan, ignoring the stored Scan full library, patching tiles again for the page's own event, disabling Save before the first open, not focusing the Edit Tag name, and opening on the last tab.
    - `npm run verify`: 42 test files, 590 tests, build and build-output checks pass.
    - `styles.css` is still git blob `66d3dec6fa065d358ffc77c56ba861b95ef8c517`, and the built CSS asset hash is unchanged.
    - `src/app.js` (1,367 lines), `src/app.d.ts`, `src/ui/LegacyOverlays.tsx`, and `scripts/verify-app-js-names.mjs` with its `verify:app-js-names` step are deleted, and `npm run verify` and the WebUI README no longer refer to them. The store's `overlayRequested` event and `openOverlay` went with them: the Edit Tags button calls the tag editor. Bundle: 143.79 KB (43.60 KB gzipped) before, 141.10 KB (43.01 KB gzipped) after. Outside tests, the grid controller's row rendering is the only `innerHTML`, and the nine native dialog calls are in `src/filter/filterDialog.ts` and `src/tags/tagEditor.ts`, which take them as options.
    - Desktop-browser spot check from a local dev run (`run-server-rebuild.ps1`), all passed: Edit Tags pauses the video and opens on Edit Tags with the playing item's tags, looking as before; add and remove on a chip and Save close the editor at once, resume the video, show "Tag editor changes applied", and show the change on reopening; a collapsed category stays collapsed after reopening; moving, renaming (with the alert for a name in use), adding, and deleting categories (asking first, with their tags moving to Uncategorized) save and show on reopening; adding a tag to a chosen category, the Edit Tag dialog (name selected, Cancel and a click outside closing it, rename and category change), and deleting a tag work and save; Close and Refresh with changes ask "Discard changes?"; on Auto Tag, Scan Files shows progress and then results, and expand, the row and file boxes with the partly checked state, View all matches, Select all, Deselect all, and Save work; in fullscreen the editor shows over the stage; the console shows no new errors.
    - Docs: `docs/domain-inventory.md`, the WebUI section of `CONTEXT.md`, the WebUI `README.md`, the `app.js` references in WebUI Responsive Layout and Panels, WebUI In-App Dialogs, WebUI Status Line Overhaul, and Browser-Playable Filter, and the three messages above in WebUI Status Line Overhaul.

### M12a - Reverse Proxy and HTTPS Access

- **Status**: ✅ Complete
- **Goal**: The server works correctly behind an HTTPS reverse proxy, and the docs show how to set one up, including `tailscale serve`.
- **Scope**:
  - Ships in v0.15.0, first in the series, moved there from the accounts release: with the WebUI as the only client on phones, installing it as an app needs HTTPS, and the overhaul is designed and tested as an installed app. It still lands before PIN login, so LAN and remote logins do not send PINs in clear text, and behind a proxy today's pairing token stops crossing the LAN in clear text. The server does not serve HTTPS itself.
  - Checked against the code at promotion: both `IsLocalRequest` copies are unchanged, CORS still builds `http://` origins only, `runtime-config.json` builds its URLs from the request's scheme and host, and the Android install problem is still a known issue in the v0.14.1 release notes.
  - Document reverse proxy setup in `README.md` and `docs/dev-setup.md`: a general proxy example and `tailscale serve`, with the headers the server needs.
    - Serve the WebUI at the host root: its manifest, service worker, icons, and `start_url` use root paths, and `runtimeConfig.ts` rejects an API base with a path.
    - Use the default HTTPS port 443 and a certificate the phone trusts. A self-signed certificate that the user clicked through does not count as secure for install (inferred from Chrome's install criteria, not tried).
    - For `tailscale serve`, MagicDNS and HTTPS certificates must be on for the tailnet, and the phone must run Tailscale.
    - Replace the README's Tailscale section, which says the runtime config keeps API calls on the HTTPS origin and that the service worker lets Chrome install; neither holds. Correct `CONTEXT.md`, which also gives the service worker as the reason.
  - Server fixes so it behaves correctly behind a proxy:
    - Honor forwarded headers only from a proxy on the server machine, which connects from loopback; decided at implementation, there is no setting for other proxies. A request that came through a proxy is not a localhost request, even when the proxy runs on the server machine, so localhost trust applies only to direct loopback connections. Checked in Tailscale's source while planning: `tailscale serve` sends `X-Forwarded-For` with the client's tailnet address, `X-Forwarded-Proto: https`, and `X-Forwarded-Host`, and passes the original `Host` to a TCP backend. The docs say a general proxy must send `X-Forwarded-For` and `X-Forwarded-Proto`.
    - Treat a missing remote address as not local (found by the repository audit: `RemoteIpAddress == null` treated as local).
    - Merge the two identical localhost checks into one helper that every localhost decision uses: `IsLocalRequest` in `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` and in `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`. Both treat a missing remote address as local, and a request to the server's own LAN address as local. Treating a request to the server's own address as local is intended: it comes from the server machine. Show in File Manager from the WebUI uses the same helper.
    - Mark cookies `Secure` when the original request was HTTPS, and never send `SameSite=None` without `Secure` (found by the repository audit: `SameSite=None` allowed without `Secure`). Checked at promotion: in its default `Request` mode, `PairingCookiePolicy.ResolveSecure` already marks the pairing cookie `Secure` when `context.Request.IsHttps`, so behind a proxy this needs the forwarded scheme; `SameSite=None` with the secure mode set to `Never` still sends no `Secure`.
    - Accept `https` origins for CORS and build LAN origins with the scheme clients actually use (found by the repository audit: CORS hard-coded to HTTP only).
    - Links the server builds (Operator links, runtime config) use the proxied scheme and host. Behind `tailscale serve` today, `/runtime-config.json` returns `http://<machine>.<tailnet>.ts.net`, since the server reads no forwarded headers, so the HTTPS page's API calls are blocked as mixed content. Cause inferred from the code; the device check while planning loaded the WebUI through `tailscale serve` but it could not be used.
    - Leave the WebUI's files open to callers that are not paired. Found while checking the Android install: the pairing check runs before static files, so with `TokenRequired`, the default, a request that is neither local nor paired gets 401 for the page, the manifest, `sw.js`, and the icons (inferred from the middleware order, not run). Browsers fetch a manifest without cookies unless its link sets `crossorigin="use-credentials"`, so the manifest gets 401 even on a paired device, and Chrome cannot install. Through a proxy this is hidden today because proxied requests count as localhost, which this milestone ends. The pairing check covers `/api` routes only. `/runtime-config.json` loads for every caller but includes the pairing token only for requests the pairing check accepts, so a device that is not paired reaches the WebUI's pairing prompt instead of a startup error.
  - Android PWA install, folded in from the backlog: found in the v0.12.0 manual regression pass on a Google Pixel 8 Pro, Add to Home Screen only creates a shortcut that opens in Chrome. Cause confirmed on that phone while planning, with the server's auth mode Off: over HTTPS on port 443 through `tailscale serve`, at an address reachable only on the tailnet, Install opens the WebUI standalone with no browser UI. Over plain HTTP on port 45123, with Chrome's "Insecure origins treated as secure" flag passing the install check, the installed app still opens with browser UI. Which of plain HTTP and the non-default port caused that was not separated. Chrome has not needed a service worker to install from its menu since Chrome 108 on Android: it needs HTTPS and a manifest it can fetch. The manifest already meets Chrome's field and icon requirements (measured: name, short name, start URL, standalone display, 192 and 512 icons at those sizes, served as `application/manifest+json`). iOS installs over plain HTTP from its home-screen meta tags.
  - Add Release Specific checklist items: "Behind `tailscale serve` and one other HTTPS proxy, the WebUI and its admin section connect, pair, browse, and play, and the server treats them as remote," and "On Android Chrome over HTTPS through each proxy, with the default auth mode, choosing Install (not Create shortcut) adds the WebUI to Settings → Apps and opens it standalone with its icon; iOS Add to Home Screen and desktop browser install still open standalone."
  - Rename the Operator's Bind on LAN setting to Allow remote connections (decided at implementation), keeping the `bindOnLan` contract field for the frozen desktop. The desktop Settings dialog's Allow LAN access (bind on all interfaces) label gets the same name (approved at completion). Off, only the server machine is served: every request from another device is refused, directly or through a proxy, for the WebUI and API as well as control routes, CORS preflights included. On, other devices connect directly or through a proxy. The proxy docs say it must be on, and that on also serves plain HTTP on the LAN. The `-BindOnLan` flag of the dev `run-server` scripts is removed, so the saved setting alone decides (decided at review).
  - Not included: installing on Android from a plain-HTTP LAN address; Chrome only adds a shortcut there.
  - Not included: a proxy on another machine, or one that connects to the server's LAN address; its forwarded headers are ignored and logged.
- **Acceptance criteria**:
  - Behind an HTTPS reverse proxy, the WebUI, the Operator page, the event stream, and media range requests work.
  - A request through a proxy on the server machine is not treated as localhost.
  - Cookies are `Secure` for HTTPS clients, and CORS accepts the HTTPS origin.
  - A request with no remote address is not treated as local.
  - Every localhost decision goes through one helper.
  - With the default auth mode, a device that is neither local nor paired loads the WebUI and its manifest and reaches the pairing prompt, and `/runtime-config.json` gives it no pairing token.
  - On Android Chrome over HTTPS, with the default auth mode, Install adds the WebUI as an app that opens standalone, and iOS and desktop browser installs still do.
  - The docs give working `tailscale serve` and general proxy setups at the host root on port 443.
  - With Allow remote connections off, every request from another device is refused, directly or through a proxy, on every path.
- **Verification evidence**:
  - Completion evidence must include server tests for forwarded-header trust, proxied-localhost handling, missing remote address, the merged localhost helper, cookie flags, HTTPS CORS origins, the WebUI's files and `/runtime-config.json` loading without a session, and the pairing token withheld from callers that are neither local nor paired, plus one quick spot check through `tailscale serve`. The proxy matrix and the Android and iOS install pass are the Release Specific checklist items above.
  - Server tests call the middleware and helpers as functions over `DefaultHttpContext`, as the library route gate's tests do. No test project has an HTTP test host, and `Microsoft.AspNetCore.TestHost` is not added (decided at promotion).
  - Measured while planning, with ASP.NET's forwarded headers middleware over `DefaultHttpContext`: its defaults trust `127.0.0.0/8` and `::1` and apply one hop. From loopback, `X-Forwarded-Proto` alone, or `X-Forwarded-For: 127.0.0.1`, leaves a loopback client address, so a proxied request is recognized by its forwarding headers, not by the address.
  - `ReverseProxyAccessTests` (61 cases) covers forwarded-header trust from loopback and not from a LAN address, proxied requests not counting as localhost before and after the headers are applied (including a loopback `X-Forwarded-For` and `X-Forwarded-Proto` alone), a missing remote address, the merged helper through API, control, and control token change paths, `Secure` pairing cookies through an HTTPS proxy and none over plain HTTP, HTTPS CORS origins and the server's own origins on its listen scheme, the WebUI's files, `/runtime-config.json`, and `/operator` loading for a device that is not paired while `/api` still answers 401, the runtime config's proxy `https://` URLs and the pairing token only for local or paired callers, refusal of every request from another device with remote connections off, CORS preflights included, through the server's middleware in its real order, other devices served with them on, and the once-per-address `last.log` warning. `ServerCookiePolicyTests` covers `SameSite=None` falling back to `Lax` without `Secure`, and `EventStreamTests` the `X-Accel-Buffering: no` header.
  - Each of ten deliberate breaks (missing address counted as local, forwarding headers ignored, pairing over every path, remote gate removed, token always in the runtime config, `X-Forwarded-Proto` not applied, `SameSite=None` without `Secure`, CORS `http` only, own origins hard-coded to `http`, warning on every request) failed at least one of these tests. The preflight test failed with 204 while the remote connections check ran after CORS.
  - Three existing tests assumed what this milestone changes: `ControlTokenTests`' local caller had no address, which only counted as local through the missing-address bug, and now has a loopback address; the `ServerAuthRegressionTests` control route test expected 403 from the pairing middleware with remote connections off, a check that is now its own step before CORS, and now expects the control check's 401; its two API tests now give their device a LAN address.
  - Every localhost decision calls `LocalRequest.IsLocal` (checked with `grep` over the server projects).
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass (462 core, 275 desktop, 3 server app). `npm run verify` passes after regenerating the contracts for the renamed 403 descriptions.
  - Isolated server run (temporary data and XDG folders, port 51340, headless, stopped by PID and its folder removed) with `curl` sending `tailscale serve`'s headers through the real pipeline: with remote connections off, proxied `/`, `/api/version`, and `/control/pair` got 403 while localhost was served; with them on, the proxied runtime config returned `https://box.tailnet.ts.net` with no pairing token, the page, manifest (`application/manifest+json`), `sw.js`, icons, and `/operator` loaded, `/api/version` and `/control/status` answered 401, pairing and control pairing set `Secure` cookies that then authorized the API and control routes, the event stream sent `X-Accel-Buffering: no`, and the Operator page carried the new label and the server's own scheme for its next-URL links.
  - Spot check through `tailscale serve`, all pass: the runtime config showed the HTTPS address; on the phone the WebUI loaded, browsed, played, and updated live; the Operator asked for the control token through the proxy on the phone and on the server machine but not at localhost; and Android Install added the WebUI as an app that opens standalone and works fully. The proxy matrix with a second proxy, and the iOS and desktop browser installs, are the Release Specific manual checks.
  - Desktop Settings dialog label renamed; `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass after it.
  - Docs: `README.md` (proxy section replacing the Tailscale one, corrected Operator and service worker notes), `docs/dev-setup.md` (proxy details and nginx), `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `CONTEXT.md`, OpenAPI 403 and `bindOnLan` descriptions, and the two Release Specific manual checks.

### M11f - Item IDs in the Contract

- **Status**: ✅ Complete
- **Goal**: Every event and response that refers to a library item carries its item id, and the WebUI matches items by id instead of by path.
- **Scope**:
  - Ships in v0.14.1, last in the series. Contract change in its own slice. It only adds fields, so the frozen desktop keeps working.
  - Found by the efficiency and divergence report and checked against the code at promotion: `playbackRecorded` carries only a path, and the random and play responses put the full path in `id`. Item-state events already carry the catalog `itemId` beside `path`, and item tag events and `POST /api/play/{itemId}` use item ids. The WebUI's loaded-tile lookup already tries the item id first and falls back to a folded path. Its current item, its item-state cache, and playback events still match by path, ignoring case and treating `/` and `\` as the same. The desktop matches by path, ignoring case.
  - Add the item id to every event and response that refers to an item that lacks it, including `playbackRecorded` and the random and play responses. The item id is a new field beside the random and play responses' `id`, which keeps the full path the frozen desktop reads.
  - Return duration in seconds on library items, next to the `duration` string the WebUI parses back into seconds. The random and play responses already carry `durationSeconds`.
  - The WebUI matches loaded tiles, the current item, its item-state cache, and pending tag saves by item id, and drops the folded-path fallback. The frozen desktop keeps matching by path.
  - Add the previous favorite and blacklist values to item-state events. Today a favorite on an item that is not in the loaded window reloads that window under the default filter, because the client cannot tell whether the item was blacklisted before; with the previous values it can patch. Recorded by the client event efficiency milestone.
  - Not included: the server treating paths that differ only by case as one path on Linux, which is Ordinal Path Identity on Linux. Matching by id in the WebUI removes its part of that problem.
- **Acceptance criteria**:
  - Every item-related event and response in `shared/api/openapi.yaml` has an item id, existing fields keep their meaning, and `npm run verify:contracts` passes.
  - The WebUI applies favorite, blacklist, playback, and tag events to the right tile by item id, including for two items whose paths differ only by case.
  - The WebUI does not normalize paths to match items.
  - Library item duration reaches the WebUI as a number of seconds.
  - Item-state events carry the previous favorite and blacklist values, and a favorite on an item outside the loaded window patches the window under the default filter instead of reloading it.
- **Verification evidence**:
  - Completion evidence must include contract tests for each changed event and response, WebUI tests that match by id with two paths that differ only by case, a WebUI test that a favorite on an item outside the loaded window patches the window from the previous favorite and blacklist values instead of reloading it, `dotnet test ReelRoulette.sln`, and `npm run verify`.
  - Docs evidence must include `docs/api.md` for the changed events and responses.
  - Checked at implementation: only rename and delete tag events carried item ids. A tag apply put the identifiers the request sent into `itemIds`, which were full paths from the desktop and for the WebUI's playing item, and auto-tag apply sent full paths, so the WebUI's grid missed those events. The desktop recognizes its own tag saves by comparing `itemIds` with the paths it sent, so `itemIds` keeps its meaning and `itemTagsChanged` gains `resolvedItemIds`.
  - Added fields: `RandomResponse.itemId` (its `id` stays the full path), `playbackRecorded.itemId`, `itemStateChanged.previousIsFavorite` and `previousIsBlacklisted`, `itemTagsChanged.resolvedItemIds`, library item `durationSeconds`, `itemId` on auto-tag scan files and duplicate-apply failures, `changedItemIds` on the auto-tag apply response and each applied tag, and a `RecordPlaybackResponse` schema with `itemId`. `playbackRecorded.path` is now the catalog's full path, so it stays a path when the WebUI names the item by id, and direct play records the play by item id. The tag-editor model's `items[].itemId` still echoes what the request named, which is an item id from the WebUI.
  - The WebUI matches loaded tiles, the playing item, its item-state cache, pending tag saves (auto-tag by the scan rows' item ids), and auto-tag checkboxes by item id, and names items by id in favorite, blacklist, record-playback, and tag-editor requests. `normalizeLibraryPath`, `normalizePath`, and the duration string parser are gone.
  - The shared tile rule takes the previous values for an item that is not loaded and reloads only when the item enters the filter. The desktop's C# copy changed with it so both stay locked to `shared/fixtures/library-tile-effect.json`; the desktop passes no previous values for an item that is not loaded, so its behavior is unchanged. Six fixture cases were added.
  - Server tests in `ItemIdContractTests` build each changed event and response through the real handler or service and check it against its OpenAPI schema: random and play `itemId`, `playbackRecorded` from direct play and from record-playback by item id with two catalog paths that differ only in case (only that item's play count changes and the event names its path), the previous favorite and blacklist, `resolvedItemIds` for a request that named a file by path, auto-tag scan and apply ids, a duplicate-apply failure id, and `durationSeconds` on listed and single-item reads.
  - WebUI tests: favorite, playback, and tag events and the playing item's state and cache apply to the item with that id when two paths differ only in case; a favorite outside the loaded window patches from the previous values without a query and reloads when the item was blacklisted; pending item-tag and auto-tag saves match by id; duration is read as seconds.
  - Checked that the tests fail when the guarded behavior is put back: playback matched by folded path, the old tile rule, and auto-tag saves matched by path failed seven WebUI tests; `playbackRecorded.path` from the request, `resolvedItemIds` from the request, and previous values from the new state failed three server tests; the old C# rule failed two desktop fixture tests.
  - `dotnet build ReelRoulette.sln` has no warnings, and `dotnet test ReelRoulette.sln` ran 396 Core, 275 DesktopApp, and 3 ServerApp tests, all passing. SystemChecks passed. `npm run generate:contracts` and `npm run verify` passed with 253 WebUI tests.
  - Manual checks are the Release Specific checklist items "Under a WebUI tag filter, removing that tag from a file on the desktop takes it out of the WebUI tiles.", "A favorite, a play, and a tag edit from the WebUI player show on the desktop's tiles and current file.", and "With the WebUI library overlay open under the default filter, a desktop favorite on a file outside the loaded tiles sends no library query, and a desktop favorite on a blacklisted file reloads the tiles."
  - Docs: `shared/api/openapi.yaml`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `CONTEXT.md`, the testing checklist, and the desktop removal milestone's contract slice candidates.

### M11e - Thumbnail Caching

- **Status**: ✅ Complete
- **Goal**: Thumbnails are fetched again only when they change.
- **Scope**:
  - Ships in v0.14.1, after the dependency updates milestone. Depends on: Dependency Updates, whose SkiaSharp alignment the server's thumbnails build on. Can be cut to a later release if v0.14.1 runs long.
  - Found by the efficiency and divergence report from code reading, not measured: `GET /api/thumbnail/{itemId}` sends no cache headers, and its URL has no revision, so the WebUI and the desktop fetch a thumbnail again every time a tile shows it.
  - Inferred, not checked: the route serves the file with `Results.File` from a physical path, which probably sends `Last-Modified`, so browsers may already cache thumbnails heuristically for a while, and a regenerated thumbnail could then show stale. Before changing anything, check in a browser network panel which thumbnail requests reach the server today.
  - Add cache headers to thumbnail responses, or a revision to the thumbnail URL so it can be cached until the thumbnail changes. A revision in the URL needs the thumbnail revision in the list query page, which is a contract change in its own slice and only adds a field.
  - The desktop's own thumbnail problems found by the same report are not fixed, because the desktop is frozen to bug fixes: decoded bitmaps kept after tiles scroll out of view (about 645 KB each at the measured average of 370×436, so about 3 GB for 5,000 tiles, inferred), full-size decoding, and overlapping fetch loops.
  - Not included: WebUI grid rendering, which is WebUI Grid Rendering, in the WebUI overhaul release.
- **Acceptance criteria**:
  - A thumbnail the WebUI has shown is not fetched again while it stays unchanged, including after it scrolls back into view.
  - A regenerated thumbnail is shown without a restart.
  - Grid layout and placeholders behave as before.
- **Verification evidence**:
  - Completion evidence must include a server test for the thumbnail cache headers or revision, a WebUI test or browser network check that an unchanged thumbnail is not fetched again, `dotnet test ReelRoulette.sln`, and `npm run verify` after any contract change.
  - Measured before the change, with the route called directly in a test: it sent `Last-Modified` only, with no `Cache-Control` and no ETag, and answered `If-None-Match` with a full 200. The browser network panel check before the change was skipped by decision, since explicit headers and a versioned URL decide the outcome whatever browsers do today.
  - The list query page carries `thumbnailVersion`, built from the JPEG's write time and size, so it changes whenever the stage writes the file, including a regenerated missing JPEG, which the stored source revision would not show. The thumbnail route takes it as `v`: a current `v` gets `Cache-Control: private, max-age=31536000, immutable`, and no `v` or an older one gets `no-cache`. Every response has an ETag and `Last-Modified`. The desktop sends no `v` and is unchanged.
  - The WebUI puts the version in each tile's thumbnail URL and reloads the loaded window once per finished refresh run, as the desktop does, so rewritten thumbnails and new items reach the grid without reloading the page.
  - Server tests in `ThumbnailResponseTests`: a current version is immutable with an ETag and `Last-Modified`, no version and an old version are `no-cache`, the old version serves the new JPEG, a matching `If-None-Match` gets 304 with no body, and a missing JPEG is 404 with no version. Four of the five failed against the route before the change. `EnrichListedItems` and list query tests assert the version is present for an existing JPEG and absent otherwise.
  - WebUI tests: a rebuilt row keeps the same versioned URL for an unchanged thumbnail and a new URL for a rewritten one, which both fail when the row drops the version; an item without a thumbnail keeps its placeholder; the projection parses the version; a finished refresh run is reported once, while a running or canceled run and a repeated snapshot are not; and a reload that arrives while a new query is loading reads that query again from the top instead of replacing it, which fails against the reload before the fix.
  - `dotnet build ReelRoulette.sln` has no warnings, and `dotnet test ReelRoulette.sln` ran 388 Core, 269 DesktopApp, and 3 ServerApp tests, all passing. `npm run generate:contracts` and `npm run verify` passed with 238 WebUI tests.
  - The browser check is the Release Specific checklist item "In the WebUI library overlay, scrolling tiles away and back sends no new thumbnail requests in the browser network panel, and after a file changes and a refresh finishes, its tile shows the new thumbnail without reloading the page."
  - Docs: `shared/api/openapi.yaml`, `docs/api.md`, `docs/architecture.md`, `CONTEXT.md`, and the testing checklist.

### M11d - Dependency Updates

- **Status**: ✅ Complete
- **Goal**: Dependencies are on their latest safe versions, the shipped server carries one stable SkiaSharp with matching natives, and builds use the same SDK, Node, and FFmpeg every run.
- **Scope**:
  - Ships in v0.14.1, after the random selection performance milestone and before Thumbnail Caching, whose server thumbnails use SkiaSharp. Each slice is verified on its own. Slices 3, 4, and 5 can be cut to a later release if v0.14.1 runs long; slices 1 and 2 cannot.
  - From the dependency inventory report of 2026-10-05. Latest versions were checked against the NuGet, npm, and GitHub release registries that day. Resolved versions were read from `project.assets.json` and `package-lock.json`, and CI and release versions from the logs of CI run 37429751595 and release run 37383133790.
  - Slice 1, safe batch:
    - Avalonia, Avalonia.Desktop, Avalonia.Themes.Fluent, Avalonia.Fonts.Inter, and Avalonia.Headless 12.0.0 to 12.1.3. The 12.1.0 notes only remove obsolete and dead code. Avalonia 12.1.3's FreeDesktop package needs Tmds.DBus.Protocol 0.94.1 or later, so raise the explicit 0.92.0 reference with it. That reference is 0.x, so a minor bump can break.
    - SkiaSharp 3.119.4 everywhere. Measured: ServerApp resolves `SkiaSharp 3.119.3-preview.1.1` through Avalonia 12.0.0 and pulls in both `SkiaSharp.NativeAssets.Linux` 3.119.3-preview and the Server's `SkiaSharp.NativeAssets.Linux.NoDependencies` 3.119.2. The Server project alone builds against 3.119.2, so its tests don't exercise what ships. The release publish passes `-p:ErrorOnDuplicatePublishOutputFiles=false`, so which `libSkiaSharp.so` ships is not checked (inferred; no publish was run). Avalonia 12.1.3 requires SkiaSharp 3.119.4.
    - Microsoft.NET.Test.Sdk 18.4.0 to 18.10.1, VideoLAN.LibVLC.Windows 3.0.23 to 3.0.24, Vite 7.3.6 to 7.3.7, and sharp 0.35.3 to 0.35.5.
    - actions/checkout v5 to v7, actions/setup-dotnet v5 to v6, and actions/setup-node v5 to v7. Their notes show ESM migration, credentials kept in a separate file, fork checkouts blocked on `pull_request_target`, and automatic caching limited to npm, which is what CI uses. Remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, which is a no-op with these majors (inferred).
    - Slice 1 touches the frozen desktop through Avalonia and LibVLC. Add a Release Specific checklist item: "Desktop plays video after the Avalonia and LibVLC update, on Linux and Windows."
  - Slice 2, build reproducibility:
    - Add a `global.json` pinning 10.0.112 with `rollForward: latestPatch`, and have CI and release install the SDK from it. Measured: there is none today, local builds use SDK 10.0.112 and CI's `10.0.x` resolves to 10.0.401, a different feature band. Both run runtime 10.0.12. `latestFeature` would have let CI keep 10.0.401, and distro-built SDKs ship only the 10.0.1xx band, so the 1xx band is pinned. A machine with only a 10.0.4xx SDK cannot build the repo.
    - Run CI and release on Node 24 to match local (24.21.0), instead of Node 22 (22.23.3 in CI). `@types/node` stays on ^24.
    - Pin the Windows server's bundled FFmpeg to a release tag. Measured: `AnimMouse/setup-ffmpeg` with `version: "release"` shipped `n9.0.2-22-g46d8f462ee-20261005` in v0.14.0, a daily build from the release branch, so each release can ship a different ffprobe. The latest FFmpeg tag on 2026-10-05 was n9.0.2. Trap, inferred: the action may not accept a tag. If it doesn't, download a tagged build directly.
    - Checked: the action takes only a major and minor version on Windows, and BtbN builds only branch heads, never an exact tag. BtbN keeps daily releases for about two weeks and month-end releases long term (back to 2024-11-30 on 2026-10-06), so the release downloads a pinned month-end BtbN build, checks its SHA-256, and fails unless the bundled `ffprobe -version` names that build. gyan.dev builds are not used, since they caused dependency problems before.
  - Slice 3, Velopack:
    - Move the Velopack library and the `vpk` tool from 1.2.0 to 1.2.161 together.
    - Check `release.yml`'s `vpk` usage against the release notes first: `vpk download s3`, `vpk upload s3 --keepMaxReleases`, and `pack --noPortable true`. Version 1.2.158 moved argument validation into the command layer and renamed the MSI image flags.
    - Trap: 1.2.158 removes the bsdiff delta fallback, so zstd is the only delta patch format. Installed v0.14.x apps run the 1.2.0 updater.
    - Checked: the 1.2.158 change (velopack/velopack#1010) says the Rust updater that applies deltas only ever supported zstd patches, and bsdiff was a `vpk pack` fallback that produced deltas no client could apply. Installed v0.14.x apps therefore apply deltas from `vpk` 1.2.161, and `vpk pack` now fails instead of falling back.
    - The Release Flow checks for the server and desktop in-app update from the previous release cover this, since an update applies only when every leg was packed and uploaded.
  - Slice 4, Vite 8 and Vitest 5:
    - Move them together, because Vitest 3 only supports Vite 7 and earlier.
    - Vite 8 replaces Rollup and esbuild with Rolldown. Vitest 5 needs Node ^22.12 or 24 and later.
    - The WebUI's `vite.config.ts` only sets the dev server port, and its tests only use `vi.fn` and fake timers, so the risk is low (inferred). Release notes not read yet.
    - After the update, run `npm audit` in the WebUI and fix what remains in the dev dependencies. Measured after the safe batch, which fixed sharp's advisory and introduced none: 9 findings (2 moderate, 5 high, 2 critical). The two critical ones, tinypool and `@vitest/mocker`, come from Vitest 3 and should go with Vitest 5. brace-expansion and js-yaml are held by the `overrides` pins in `package.json`. nanoid, postcss, and source-map-js are fixable with `npm audit fix`.
    - Raise the brace-expansion pin. Keep js-yaml on 4.x.
  - Slice 5, xunit.runner.visualstudio:
    - Move it from 3.1.5 to 4.0.0.
    - Inferred: the 4.0.0 package still ships `xunit.abstractions`, so it probably still runs xUnit v2 tests. Confirm every test project runs the same number of tests before and after.
  - Not included: SkiaSharp 4, because Avalonia 12.1.3 still requires SkiaSharp 3.119.x and ServerApp loads Avalonia and the Server in one process.
  - Not included: TypeScript 7, because `openapi-typescript` 7.13.0 declares a `typescript ^5.x` peer dependency.
  - Not included: Microsoft.Data.Sqlite 11 and .NET 11, which are release candidates only. Microsoft.Data.Sqlite 10.0.12 bundles SQLite 3.53.3 through SQLitePCLRaw 2.1.12 (measured), and 11 moves to SQLitePCLRaw 3.
  - Not included: swapping the unmaintained mDNS package `Makaretu.Dns.Multicast` 0.27.0, last published 2019-11-05, which works as is.
  - Not included: LibVLCSharp.Avalonia 3.10.1, which still targets Avalonia 11.3.13 like 3.9.7, for the frozen desktop.
  - Not included: the Linux CI test FFmpeg, which stays on Ubuntu's 6.1.1 package.
  - Not included: migrating to xUnit v3, a different package that turns test projects into executables.
- **Acceptance criteria**:
  - Slice 1: Every project resolves Avalonia 12.1.3 and SkiaSharp 3.119.4. ServerApp's resolved packages hold one SkiaSharp version, no preview, and no `SkiaSharp.NativeAssets.Linux.NoDependencies` beside `SkiaSharp.NativeAssets.Linux`. The listed packages and Actions are at their target versions, and CI passes on Linux and Windows.
  - Slice 2: `dotnet --version` in the repo resolves through `global.json` locally and in CI. CI and release run Node 24. The bundled `ffprobe -version` in the Windows server release names the pinned build.
  - Slice 3: The Velopack library and `vpk` are both 1.2.161. Every `vpk` command in `release.yml` has been checked against the 1.2.161 release notes and updated where they changed. The release run itself, packing and uploading all legs and the in-app delta update from v0.14.x, is covered by the Release Flow in-app update checks.
  - Slice 4: The WebUI builds and tests on Vite 8 and Vitest 5 with the same test count as before. `npm audit` reports no dev dependency findings that a fix within these limits can clear, and js-yaml stays on 4.x.
  - Slice 5: Every test project runs the same number of xUnit v2 tests on xunit.runner.visualstudio 4.0.0 as on 3.1.5.
- **Verification evidence**:
  - Completion evidence must include, per slice, `dotnet test ReelRoulette.sln` and a green CI run. Add `npm run verify` for slices 1, 2, and 4, and `./tools/scripts/verify-linux-packaged-server-smoke.sh` for slices 1 and 3. Slice 1 also needs the resolved SkiaSharp packages from ServerApp's `project.assets.json`, and slice 4 the `npm audit` output before and after.
  - Checks that need a release run are Release Specific checklist items: desktop playback and the Windows tray menu after the safe batch, and the bundled `ffprobe -version` naming the pinned build for build reproducibility. The release run packing and uploading every leg with the in-app delta update from v0.14.x for Velopack is covered by the Release Flow in-app update checks.
  - Slice 1:
    - Before and after, `dotnet test ReelRoulette.sln` ran 383 Core, 269 DesktopApp, and 3 ServerApp tests, all passing. `dotnet build ReelRoulette.sln` has no warnings.
    - Resolved from `project.assets.json`: ServerApp, ServerApp.Tests, Server, Core.Tests, DesktopApp, and DesktopApp.Tests all hold SkiaSharp 3.119.4 and its natives only, with `SkiaSharp.NativeAssets.Linux` and no `NoDependencies` or preview. Every Avalonia project resolves 12.1.3, Tmds.DBus.Protocol 0.94.1, and Microsoft.NET.Test.Sdk 18.10.1, and DesktopApp resolves VideoLAN.LibVLC.Windows 3.0.24.
    - A linux-x64 ServerApp publish ships one `libSkiaSharp.so`, byte-identical to the 3.119.4 `SkiaSharp.NativeAssets.Linux` one. Without `ErrorOnDuplicatePublishOutputFiles=false` the publish fails only on the Server's and ServerApp's `appsettings.json`, so the flag is still needed for that.
    - `npm run verify` passed with 232 WebUI tests on Vite 7.3.7 and sharp 0.35.5. The lockfile changed only Vite and the sharp packages.
    - `./tools/scripts/verify-linux-packaged-server-smoke.sh` passed.
    - Release Specific items added for desktop playback and the Windows tray menu after the update.
    - CI run 37513096626 passed on Linux, Windows, and WebUI verify, with the same 383, 269, and 3 tests on both OSes.
  - Slice 2:
    - `dotnet --version` in the repo prints 10.0.112 through `global.json`. A copy pinned to 10.0.113 is refused, so the file is read. `dotnet build ReelRoulette.sln` has no warnings, and `dotnet test ReelRoulette.sln` ran 383, 269, and 3 tests, all passing. `npm run verify` passed with 232 tests on Node 24.21.0.
    - The pinned FFmpeg is `ffmpeg-n9.0.2-17-g2a571b6068-win64-gpl-9.0.zip` from BtbN's `autobuild-2026-09-30-13-08`. The downloaded file matched BtbN's published SHA-256, holds `bin/ffmpeg.exe` and `bin/ffprobe.exe`, and its `ffprobe.exe` embeds `n9.0.2-17-g2a571b6068-20260930`. The release step's script, run under pwsh with the download swapped for that file and canned `ffprobe -version` output, bundled both executables for that version line and failed for a wrong hash, a different build, and the version without its date.
    - CI run 37516933133 passed on Linux, Windows, and WebUI verify, with the same 383, 269, and 3 tests on both OSes. Both .NET jobs printed SDK 10.0.112 from `global.json`, and WebUI verify ran on Node 24.21.0.
    - The release run check is the Release Specific checklist item "The Windows server release's bundled `ffprobe -version`, printed in the release log, names the pinned FFmpeg build."
  - Slice 3:
    - The release notes list pull requests only. The argument validation and deployment command refactor (velopack/velopack#934) has no description, so every option `release.yml` passes was checked against `--help` from `vpk` 1.2.0 and 1.2.161, and the hidden `--noPortable` against the `PackCommand` source at both tags. Every option keeps its name and value. `--disablePathStyle` became a flag, which `release.yml` does not use.
    - `upload s3` and `download s3` with the release's options, fake credentials, and a closed local endpoint parse on both versions and stop only at the connection.
    - A Windows server publish packed with the release's Windows options under `vpk [win] pack` 1.2.161 produced a full package, a 64-bit `Setup.exe` (32-bit under 1.2.0), and, on a second version with one changed file, a delta whose changed files are `.zsdiff` patches. 1.2.161 warns "No architecture specified with --runtime, defaulting to x86" although the package still records `win-x64`, so `release.yml` now passes `--runtime` from the leg's RID, which clears the warning with the same output. The smoke script passes `--runtime linux-x64` to match.
    - The smoke script ignored its `VPK_VERSION`: its global install failed silently while 1.2.0 was installed, so it packed with whatever `vpk` was on the path. It now installs that version under `artifacts/velopack-smoke/tools/` and runs it, and a version that does not exist fails the run before publishing.
    - The Velopack library compiled unchanged. All three targets resolve Velopack 1.2.161. `dotnet build ReelRoulette.sln` has no warnings, and `dotnet test ReelRoulette.sln` ran 383, 269, and 3 tests, all passing.
    - `./tools/scripts/verify-linux-packaged-server-smoke.sh` passed, packing with `Velopack CLI 1.2.161`.
    - Release run, upload, and the delta update from v0.14.x: the Release Flow checks for the server and desktop in-app update from the previous release, since an update applies only when every leg was packed and uploaded.
    - CI run 37518838688 passed on Linux, Windows, and WebUI verify, with the same 383, 269, and 3 tests on both OSes.
  - Slice 4:
    - Vite 8.3.3, the latest stable, and Vitest 5.0.3. The Vite 8 and Vitest 4 and 5 migration guides were read. The WebUI config sets none of the changed options, and its tests use none of the changed APIs. Vitest 5 clearing mock history before each test changed no result.
    - Typecheck failed after the update: five tests import `node:fs` for shared fixtures, and `tsconfig.app.json` loads only `vite/client` types. `tsc --explainFiles` on the old lockfile showed that `@types/node` reached the app typecheck only through Vite 7's Node-side types, which Vite 8 no longer pulls in. `tsconfig.app.json` now excludes `src/test`, a new `tsconfig.test.json` checks `src/test` with Node types, and `npm run typecheck` runs both. The app check lists 92 source files with no tests and no `@types/node`, the test check lists all 20 test files, and an injected type error in a test fails only the test check.
    - `npm audit`: 9 findings before (2 moderate, 5 high, 2 critical: `@redocly/openapi-core`, `@vitest/mocker`, brace-expansion, js-yaml, nanoid, postcss, source-map-js, tinypool, vitest), 0 after. The brace-expansion pin is ^5.0.12 and the js-yaml pin ^4.3.2, which resolve 5.0.12 and 4.3.2. Vite 8 resolves postcss 8.5.29, nanoid 3.3.20, and source-map-js 1.2.2, and Vitest 5 no longer uses tinypool, so `npm audit fix` was not needed.
    - `npm run verify` passed with 232 tests in 20 files before and after. The build keeps the same files: the JS bundle went from 120,395 to 118,200 bytes and the CSS from 23,722 to 24,353 bytes, which the Vite 8 guide attributes to Lightning CSS minification. `pwsh ./tools/scripts/verify-web-deploy.ps1` passed with the new build.
    - `dotnet build ReelRoulette.sln` has no warnings, and `dotnet test ReelRoulette.sln` ran 383, 269, and 3 tests, all passing.
    - The newer default browser targets and the CSS minifier are covered by the Release Specific checklist item "After the Vite 8 build change, the WebUI looks and works as before in a desktop browser and on a phone."
    - CI run 37522394099 passed on Linux, Windows, and WebUI verify, with the same 383, 269, and 3 tests on both OSes, and 232 WebUI tests in 20 files on Node 24.21.0.
  - Slice 5:
    - The 3.1.5 and 4.0.0 packages have the same layout and dependencies, both ship `xunit.abstractions` and describe themselves as running xUnit v1, v2, and v3 tests, and the MSBuild files they add are byte-identical. The 4.0.0 release notes add xUnit v3 4.0 support and fix shutdown message ordering under VSTest, with no change for v2 projects.
    - `dotnet test ReelRoulette.sln` with detailed console output ran on `xUnit.net VSTest Adapter v3.1.5` before and `v4.0.0` after in all three test projects, and every project resolves 4.0.0. Both runs passed the same 655 tests by name: 383 Core, 269 DesktopApp, and 3 ServerApp. `dotnet build ReelRoulette.sln` has no warnings.
    - CI run 37525248611 passed on Linux, Windows, and WebUI verify, with the same 383, 269, and 3 tests on both OSes.

### M11c - Random Selection Performance

- **Status**: ✅ Complete
- **Goal**: A random pick over the whole library reads only what selection needs and costs a few tens of milliseconds.
- **Scope**:
  - Ships in v0.14.1, after the library query performance milestone.
  - Measured by the efficiency and divergence report on a copy of a 48,938-item catalog: `POST /api/random` selection with the default filter takes about 240 ms and allocates about 105 MB per request, in every randomization mode. Reading the eligible items with all 28 columns takes 207 ms and 91 MB; the eligible-set signature, which lowercases and sorts every path on every request, takes 23 ms. Reading only the four columns selection needs takes 12 ms in `sqlite3`. A selective preset takes 35 ms.
  - Read only the columns selection and the response need: id, full path, play count, and last played for the eligible set, then the selected item's response fields.
  - Make the eligible-set signature cheap: build it from item ids read in id order instead of lowercasing and sorting every path, and compute it once per request. Today rebuilding the selection state computes it twice, once to compare and again to store. The shuffle bag must still notice an item whose path changed, so either the signature covers paths or the bag holds item ids.
  - Trap, inferred from code: caching the signature by catalog revision would miss on almost every pick. Every committed write, including the play that follows each pick, raises the revision.
  - Replace the linear scans: the smart shuffle check of each dequeued path against the eligible list, and the final lookup of the selected item.
  - Selection results stay the same: the same modes, weights, shuffle-bag behavior, and folder spread.
  - Not included: the spread modes' per-pick folder keys, which cost about 6 ms and 13 MB per pick on the measured catalog.
- **Acceptance criteria**:
  - Each randomization mode picks from the same eligible set with the same weighting as before.
  - Smart shuffle still plays every eligible item once before repeating, and rebuilds its bag when the eligible set changes.
  - A random pick over the measured catalog with the default filter takes a few tens of milliseconds, measured before and after.
- **Verification evidence**:
  - Measured on a copy of the 49,053-item catalog in a temp folder, through `LibraryPlaybackService.TrySelectRandom` in a Release build, with the default filter and both media types (49,006 eligible items) unless noted. Each figure is the median of 21 picks after 20 warm-up picks, from two runs of the code before and after this milestone, alternated under the same load, with allocations as managed bytes per pick.

    | Pick | Before | After |
    | --- | --- | --- |
    | Pure random | 225-227 ms, 106 MB | 54-57 ms, 19 MB |
    | Weighted random | 221-232 ms, 107 MB | 54-56 ms, 19 MB |
    | Smart shuffle | 229 ms, 106 MB | 56-59 ms, 20 MB |
    | Spread | 234-238 ms, 120 MB | 63-65 ms, 32 MB |
    | Weighted with spread | 243-246 ms, 120 MB | 65-66 ms, 32 MB |
    | Smart shuffle, favorites only | 14-15 ms, 1.4 MB | 12.5 ms, 0.3 MB |
    | Smart shuffle, videos only | 89-90 ms, 40 MB | 26-27 ms, 7.6 MB |

    After the change, the four-column candidate read takes 49-52 ms: the filtered table scan through the bundled SQLite is about 15 ms, decoding ids, play counts, last played, and paths about 27 ms, and the ordinal id sort about 8 ms. The id signature takes 1.6 ms, the smart shuffle id lookup about 1.3 ms, and reading the picked item 0.2 ms. The spread modes keep their folder keys. The report's 12 ms for four columns was in `sqlite3`; through Microsoft.Data.Sqlite the same read takes about 42 ms before the sort.
  - Measured before implementing: `ORDER BY items.id` walks the id index and looks up every row, 90 ms against 52 ms unordered, so candidates are read unordered and sorted by ordinal id in C#, which keeps the signature's id order. `EXPLAIN QUERY PLAN` for the candidate query shows `SCAN items` and `SEARCH sources USING INDEX sqlite_autoindex_sources_1 (id=?)`. Resolving an id with `COLLATE NOCASE`, as `ReadPlaybackItem` does, scans the id index (0.6 ms) and takes the write lock, so the picked item is read by its exact id without it.
  - Same selection: a scratchpad harness fed the engine from before this milestone (paths) and the new engine (ids) the same 49,006 id-ordered candidates from the catalog copy and the same seeds. It made 2,000 picks for each of three seeds in all five modes, recorded a play on the picked item after each pick, and changed the eligible set once halfway. All 30,000 picks matched. In the server, candidates now arrive in id order instead of table order, which changes which item a given draw lands on but not any item's odds.
  - Tests: `RandomSelectionEngineCoreTests` checks that smart shuffle plays every item once per cycle over three cycles, rebuilds when the eligible set changes, and keeps its cycle when only paths and play stats change; that the signature covers ids in order and not paths or play stats; that pure random takes the drawn index; and the weighted, spread, and weighted-with-spread roll boundaries with a scripted `Random`. `TrySelectRandom_EveryMode_PicksEachEligibleItemAndNothingElse` covers all five modes. Also added: `TrySelectRandom_SmartShuffle_ReturnsTheCurrentPath_AndKeepsItsCycle_AfterPathsChange`, `TrySelectRandom_WritesOneLastLogLinePerPick_WithModeEligibleCountAndElapsedTime_AndNoPath`, `QueryRandomCandidates_MatchesListQuery_ForFilterEnabledSourcesAndMediaType_InOrdinalIdOrder`, and `ReadPlaybackItemById_ReadsOnlyThatExactId`. Breaking a guarded rule failed its tests, and each test passed again after revert: a signature that also covers paths (3 tests), no rebuild on a set change (1), the play weight 0.6 changed to 0.5 (3), the spread factor 1.5 changed to 1.0 (4), no 0.05 weight floor (3), and unsorted candidates (1).
  - `dotnet build ReelRoulette.sln`: pass, no warnings. `dotnet test ReelRoulette.sln`: pass (Core 383, Desktop 269, ServerApp 3). `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose`: pass.
  - Docs: `CONTEXT.md`, `docs/domain-inventory.md`, and the Server Robustness Findings entry, whose signature finding now names ids and whose quadratic smart shuffle finding this milestone closed.

### M11b - Library Query Performance

- **Status**: ✅ Complete
- **Goal**: Library browse pages in every sort mode and loaded-window reloads cost about the same at any scroll depth, and a reload of the loaded window is one request.
- **Scope**:
  - Ships in v0.14.1, after the catalog open and backup safety milestone. Depends on: Catalog Open and Backup Safety, so every build that can meet a schema version 3 library leaves it and its backups untouched when it cannot open it.
  - Measured by the efficiency and divergence report on a copy of a 48,938-item catalog, through the real list query in a Release build: the first 200-item page takes about 50 ms and allocates about 11 MB. The page at offset 10,000 takes 177 ms and 104 MB, and at offset 40,000 takes 221 ms and 154 MB. Reloading 5,000 loaded tiles takes 2.45 s and 1.1 GB.
  - Causes measured in the same run:
    - Name order uses `COLLATE ORDINAL_IGNORE_CASE`, a managed collation callback with no index, so every page sorts the whole filtered set. The same page ordered by an indexed binary column takes 0.1 ms, against 19.9 ms with the callback.
    - Every page also runs two `COUNT(*)` queries of about 13.5 ms each, including on later pages of the same query.
  - The measurements were not re-run when this milestone was promoted. The code paths they measured are unchanged since the report. The client event efficiency milestone made reloads rarer, but each reload costs the same.
    - A reload re-reads the window in 200-item pages, one request each, and the query limit is 500.
  - Schema version 3 slice:
    - Bump the catalog to schema version 3. The migration from schema version 2 adds the stored file name sort key column and its index and fills every key once. Item insert and rename compute the key with the row. A new refresh pipeline stage fills any empty keys, and recomputes every key when a stored key version changes. Nothing else new runs at startup.
    - The key reproduces today's `OrdinalIgnoreCase` name order exactly: per code point, uppercase only where `OrdinalIgnoreCase` treats the pair as equal, written as code-point-ordered bytes. Plain `ToUpperInvariant` changes the order. A `ToLowerInvariant` key such as the existing `file_name_fold` changes it too, for names containing `_`, `[`, `\`, `]`, `^`, or `` ` ``, which sort after letters today and would sort before them.
    - Name sorts and name tie-breaks order by the key.
    - Drop `idx_item_tags_item_id`, which duplicates the leading `item_id` column of the `item_tags` primary key.
    - Drop `idx_items_file_name_fold`, which no query uses: search matches the fold with `instr`, and no other statement filters, orders, or counts by it. Added during implementation.
    - The migration never leaves a schema version 2 `library.db.previous` beside a schema version 3 `library.db`, including when interrupted: a build without the catalog open and backup safety fix deletes the newer catalog in that case. Schema version 2 backups stay, since rotation deletes only current-version backups.
  - Every sort mode: measure name, last played, play count, duration, and date added, ascending and descending, at the first page and at offset 40,000, and add an index for each sort that needs one, including the name-key tie-break, so no sort mode sorts the whole library per request.
  - Cache both counts on the server, keyed by catalog revision, search, and filter, so later pages, appends, and reloads at the same revision do not count again. No contract change. Neither client keeps the totals from the first page: both read `totalCount` from every page and stop a reload once they have that many items, so a later page without counts would end a desktop reload after its second page with a total of 0. Every page keeps returning both counts, and their meaning does not change.
  - Reload slice: raise the query limit to 10,000 so a reload of the loaded window is one request, and the WebUI reloads with it. This is a contract change in its own slice. The frozen desktop keeps its smaller pages.
  - Library query logging: the server writes one `info` line per library query request (`Library query offset=… limit=… …`), so today a reload writes one line per page; in the v0.14.0 manual pass, a reload of six pages from two WebUI clients wrote twelve near-identical lines. Keep one line per request and add the request's elapsed time to it. Once a reload is a single request, it writes one line.
  - Library stats: the per-source figures join items to sources by path prefix and re-derive video or photo from the file extension in SQL. Measured: about 90 ms in `sqlite3` and 138 ms through the service. Every item in the measured catalog has a source id and a media type of 0 or 1. Group by source id and media type instead, with the same results.
  - Fallback if deep offsets still cost much more than the first page after the sort indexes: add a keyset cursor (the last row's sort values) beside offset paging, and move the WebUI to it. Offset paging stays until Desktop Client Removal, so the frozen desktop keeps working. This is a contract change in its own slice and only adds fields.
  - Measured trap for the tag filter: the tag filter compares `item_tags.name` with the managed collation inside a correlated `EXISTS`, which the planner runs through `idx_item_tags_item_id` and which takes 45 ms for a 22,476-item tag. Rewriting it as `item_tags.name_fold = ?` inside the same `EXISTS` makes the planner use `idx_item_tags_name_fold` for every item, and the same filter took 55 s. The form `items.id IN (SELECT item_id FROM item_tags WHERE name_fold = ?)` takes 35 ms. Any tag filter change keeps a plan of that shape, and after `idx_item_tags_item_id` is dropped the filter still looks up tags by item id through the primary key, both checked with `EXPLAIN QUERY PLAN`.
  - Not included: a keyset cursor beside offset paging. After the sort indexes, a page at offset 40,000 of the measured catalog takes 36-43 ms with its counts cached, against 157-320 ms before, and the decision was to keep offset paging.
- **Acceptance criteria**:
  - Name, last played, play count, duration, and date added sorts, in both directions, return the same items in the same order as before, including names that differ only by case, names containing `_`, `[`, `\`, `]`, `^`, or `` ` ``, and names where `ToUpperInvariant` and `OrdinalIgnoreCase` disagree.
  - Every sort mode in both directions costs within a small factor of its first page at offset 40,000 of the measured catalog, measured, and none sorts the whole library per request.
  - A schema version 2 catalog opens as schema version 3 with every sort key filled. Insert and rename write the key with the row, and the refresh stage fills empty keys and recomputes every key after a key version change. Startup runs nothing else new.
  - An interrupted migration never leaves a schema version 2 `library.db.previous` beside a schema version 3 `library.db`.
  - A repeat query with the same search and filter at the same catalog revision runs no count queries and returns the same totals, and a write that changes the revision counts again.
  - A reload of the loaded window is one request, for windows of up to 10,000 items.
  - A reload writes exactly one library query line to `last.log`, with its elapsed time.
  - Library stats return the same global and per-source figures as before on the measured catalog.
  - Tag filters return the same items as before, and none takes longer than the current form on the measured catalog.
  - `item_tags` has one index on `item_id`.
- **Verification evidence**:
  - Measured on a copy of the 49,053-item catalog in a temp folder, through `LibraryCatalogSession.QueryList` in a Release build, median of 5 runs, allocations as managed bytes. Before, every page ran both counts. After, "cached" is a page whose counts are already cached at that revision (a later page, an append, or a repeat), and "counted" is the first query after a write.

    | Query | Before | After, cached | After, counted |
    | --- | --- | --- | --- |
    | Name asc, first page / 10,000 / 40,000 | 53 / 211 / 273 ms; 11 / 104 / 151 MB | 2.4 / 12.9 / 39.1 ms | 30.7 / 41.7 / 66.9 ms |
    | Name desc, first page / 10,000 / 40,000 | 52 / 135 / 282 ms; 14 / 53 / 153 MB | 2.0 / 10.9 / 38.2 ms | 30.2 / 39.9 / 68.7 ms |
    | Last played asc / desc, first page | 51 / 46 ms | 1.8 / 2.2 ms | 31.1 / 30.9 ms |
    | Last played asc / desc, 40,000 | 278 / 305 ms; 135 / 133 MB | 39.7 / 41.4 ms | 69.3 / 70.5 ms |
    | Play count asc / desc, first page | 49 / 48 ms | 1.7 / 2.2 ms | 29.6 / 29.9 ms |
    | Play count asc / desc, 40,000 | 300 / 309 ms; 143 / 146 MB | 38.1 / 41.0 ms | 65.7 / 69.2 ms |
    | Duration asc / desc, first page | 53 / 47 ms | 1.6 / 1.8 ms | 30.0 / 29.3 ms |
    | Duration asc / desc, 40,000 | 320 / 269 ms; 101 / 101 MB | 39.3 / 42.6 ms | 67.7 / 72.4 ms |
    | Date added asc / desc, first page | 47 / 61 ms | 1.8 / 1.9 ms | 30.1 / 30.1 ms |
    | Date added asc / desc, 40,000 | 157 / 197 ms; 23 / 23 MB | 36.0 / 37.7 ms | 64.0 / 67.4 ms |
    | Reload of 5,000 tiles | 25 requests of 200: 2,683 ms, 1,148 MB | 1 request: 85 ms, 14 MB | 116 ms, 14 MB |
    | Reload of 5,000 through the service, with JSON and thumbnail checks | | 122 ms, 35 MB | 124 ms, 35 MB |
    | Reload of 10,000 tiles | | 288 ms, 29 MB | 314 ms, 29 MB |
    | Common-tag filter (22,476 items) / excluded tag, first page | 117 / 133 ms | 20.6 / 1.9 ms | 81.2 / 71.9 ms |
    | Search `the`, first page | 55 ms | 4.9 ms | 39.6 ms |
    | Library stats | 144 ms | 48 ms | 48 ms |

    After the change every page allocates 0.5-0.7 MB. The first open migrates the copy from schema version 2 in about 600 ms, and the file grows from 70.5 MB to 92.3 MB with an empty WAL and an empty free list (83.6 MiB, about 87.7 MB, after `VACUUM`). A deep page now costs about 1.3 times the first page of a new query, which runs the counts, and about 20 times a first page whose counts are cached: the offset walk itself is 36.5 ms for the raw statement through the bundled SQLite 3.53.3, against 24 ms in the system `sqlite3`, and `QueryList` adds about 2 ms. Planning measured that walk in `sqlite3` only, as 22-27 ms.
  - `EXPLAIN QUERY PLAN` through the bundled SQLite, for the list query at offset 40,000 with the default filter: name asc and desc `SCAN items USING INDEX idx_items_name_sort`; last played, play count, duration, and date added each scan `idx_items_{sort}_asc` or `idx_items_{sort}_desc` for that direction; every one then `SEARCH sources USING INDEX sqlite_autoindex_sources_1 (id=?)` and `USE TEMP B-TREE FOR LAST TERM OF ORDER BY`, which sorts only rows whose name key ties exactly. The count is `SCAN items` with the same sources search. The tag filter page scans `idx_items_name_sort` with `SEARCH item_tags EXISTS USING INDEX sqlite_autoindex_item_tags_1 (item_id=?)`, the excluded-tag page uses a correlated subquery through the same primary key, and both tag counts look tags up through that primary key, so dropping `idx_item_tags_item_id` kept the tag filter's plan shape and it needed no rewrite. No plan uses `idx_items_file_name_fold`: `SELECT COUNT(*) FROM items` scans `idx_items_name_sort` as a covering index, the search page uses the sort's index in every mode and direction, and the search counts scan the table. Every other statement on `items` filters or orders on other columns and reads columns that index does not hold.
  - Same results on the measured catalog: a dump from the code before this milestone and from this milestone, on copies of the same catalog, is identical for every sort mode in both directions over all 49,006 listed items, the common-tag and excluded-tag filters, a search, favorites by play count, and the library stats JSON.
  - Measured before planning: .NET 10 OrdinalIgnoreCase compares a supplementary character with U+E000-U+FFFF by code point, so emoji sort after fullwidth punctuation, which the measured catalog holds. The only BMP character that ToUpperInvariant uppercases where OrdinalIgnoreCase does not is U+017F. A lowercase key put 120 of the catalog's names in a different place. The key matched OrdinalIgnoreCase with no disagreement over every code point and 2 million random pairs mixing emoji, fullwidth, private-use, long s, Kelvin, Deseret, and lone surrogates.
  - Tests (the migration tests also check that `idx_items_file_name_fold` is gone after a migration and still there after an interrupted one): `LibraryCatalogNameSortKeyTests` (the key against OrdinalIgnoreCase over every code point and over pairs of names that differ by case, hold `_`, `[`, `\`, `]`, `^`, or `` ` ``, or differ between ToUpperInvariant and OrdinalIgnoreCase; every sort in both directions against the previous ORDER BY with the managed collation on the same catalog, paged; insert and rename write the key; the refresh stage's read and write, including a rename since the read), `LibraryCatalogMigrationTests` (schema version 2 opens migrated with every key filled and the same schema as a new catalog; an interrupted migration leaves schema version 2 with no `library.db.previous` at any point and opens later; a schema version 2 `library.db.previous` is removed before the migration; a damaged catalog with a schema version 2 previous puts it back and migrates it; a schema version 2 file inspects as older with content; a schema version 2 export is migrated before it is published), `NameSortKeyStage_FillsMissingKeys_AndRecomputesEveryKeyAfterAKeyVersionChange`, `Query_RepeatAtTheSameRevision_RunsNoCountQueries_AndAWriteCountsAgain`, `QueryLibrary_WritesOneLineWithItsElapsedTime_AfterEnrichingTheItems`, the query limit accepting 10,000 and refusing 10,001, `GetLibraryStats_CountsAnItemByItsSourceIdAndMediaType`, and the desktop `Import_Schema2Export_IsMigratedRemappedAndPublished`. Rotation tests now also keep a schema version 2 backup byte-identical and uncounted. WebUI tests: a reload of up to 10,000 loaded tiles is one window, 12,000 is two, and 5,000 loaded tiles reload in one request.
  - Each test failed with its guard removed: a key from plain ToUpperInvariant, name tie-breaks by the lowercase fold, a rename without the key, a migration that commits before the interruption point, a key write that ignores a rename, a count cache without the revision check or without the cache, and WebUI reload windows of 200.
  - Updated tests: literal schema versions now read `SchemaVersion` for current and `SchemaVersion + 1` for newer; the seed writes the current schema and, for migration tests, schema version 2; the schema description includes index SQL, since expression index columns have no name; the refresh stage order includes `nameSortKeys`; `GetLibraryStats_ShouldHandleLegacyMediaTypeAndMissingSourceId` became `GetLibraryStats_CountsAnItemByItsSourceIdAndMediaType`, since stats no longer match items to sources by path or fall back to the file extension, and the media type 2 item in the stats and item-state test is now a photo with a source id.
  - `dotnet build ReelRoulette.sln` with no warnings; `dotnet test ReelRoulette.sln`: 356 core, 269 desktop, and 3 ServerApp tests pass; SystemChecks pass; `npm run generate:contracts` and `npm run verify` pass (232 WebUI tests).
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `docs/architecture.md`, `shared/api/openapi.yaml`, and four Release Specific checklist items.

### M11a - Catalog Open and Backup Safety

- **Status**: ✅ Complete
- **Goal**: A build that finds a catalog it cannot use, because a newer build wrote it or because it is damaged, leaves the library and its backups untouched and keeps running without a library, and backup rotation deletes only its own current backups.
- **Scope**:
  - Ships in v0.14.1, first in the series. Library Query Performance moves the catalog to schema version 3, and no build without this milestone may open a schema version 3 library. Developing against the real library is fine as long as every build used contains this milestone and the installed v0.14.0 is not run until it is replaced by installing the new version directly.
  - Found by the catalog schema safety report, which measured today's behavior with throwaway tests against a schema version 2 catalog given one extra `items` column and `user_version` 3:
    - Server startup: `LibraryCatalogStore.Open` treats any `user_version` other than 2 as damaged and moves the catalog to `library.db.refused`, then `LibraryCatalogHost.Open` throws, so the host fails to start with "The live database was refused." (measured). The process then exits, since the ServerApp's top-level handler catches only `OperationCanceledException` (inferred; the real app was not started). The next start opens an empty catalog, deletes the newer backups, and backs up the empty catalog (measured).
    - Replace recovery at open: a newer live catalog with an older `library.db.previous` beside it is deleted and replaced by the older file, and no copy of the newer catalog remains (measured). A newer live catalog with `library.db.incoming` beside it loses the incoming file and is quarantined (measured). With no live catalog, a newer incoming file is deleted (inferred from code).
    - Desktop import: a newer file is rejected as "not a library database" and nothing is written (measured). Importing an older file over a newer live catalog asks the usual overwrite question and, when confirmed, deletes the newer catalog (measured).
    - Backup rotation deletes every `library.db.backup.*` file that catalog inspection rejects, which includes valid backups at any other schema version and files that are not SQLite. The listing runs before the gap check, so this happens even when no new backup is written (measured: newer, older, and non-SQLite files all deleted while the gap blocked a copy). With the same check, a schema version 3 build would delete every schema version 2 backup on its first start (inferred).
    - After an empty catalog replaces a quarantined one, the next completed refresh deletes every thumbnail JPEG, since none belongs to a catalog item (inferred from code).
    - Nothing deletes `library.db.refused` files (measured with `git grep`).
  - Catalog files slice (no contract change):
    - Read `user_version` before the schema checks. A version above the one this build knows is newer. Anything else that fails the checks is damaged, including schema version 1, which never shipped and stays refused.
    - Newer: when `library.db`, `library.db.previous`, or `library.db.incoming` is newer, open and replace recovery change nothing and report the catalog as newer.
    - Damaged: quarantine to `library.db.refused` as today, and report it as damaged.
    - An empty catalog is created only on a fresh install: no `library.db`, no `library.db.refused*` file, and no `library.db.backup.*` file in `backups/`, whatever its version or state.
    - Replacing the live catalog refuses when the live catalog is newer and leaves it in place, so a forced desktop import over it fails without changes.
    - Backup rotation deletes only valid current-version backups beyond the limit, oldest first. Every other `library.db.backup.*` file stays and counts toward neither the limit nor the gap, including files that are not SQLite. The checkpoint writer still removes its own failed copy.
  - Server slice (no contract change):
    - With a newer or damaged catalog, or a refused file that blocks an empty catalog, the server runs without a library. The Operator page, settings, logs, restart, stop, and in-app update work. Neither place that attaches catalog backups (the catalog host and the library operations service) attaches them, so no backup or rotation runs. The refresh pipeline does not run on its schedule, and a manual or tray refresh is refused with the message.
    - Trap (inferred): by .NET's default, an exception that escapes a background service stops the host, and the scheduled refresh reads the catalog session first, so the refresh pipeline checks for a library before it runs instead of catching the failure.
    - Library routes return 503 `{ error, code }` with the message, the body shape the testing mode's API unavailable simulation already returns. Routes that work without a library stay open: version, capabilities, pair, the web runtime, backup, and refresh settings, and client log relay. Every other `/api` route returns 503, including events, sources, and presets, which without a catalog would answer with empty data and keep preset edits only in memory.
    - The message is written to `last.log` as a warning and returned in each 503. Newer: the library was saved by a newer version of ReelRoulette, was left unchanged, and opens after updating ReelRoulette. Damaged: the library could not be read and was moved aside to `library.db.refused`; restore a backup from the backups folder, or, with no backups, move the refused file away to start with an empty library. The final wording is decided here.
    - Document restoring a backup by hand in `docs/dev-setup.md`.
  - Contract slice: `ControlStatusResponse` gains optional library state and message fields, the 503 on library routes is documented in `shared/api/openapi.yaml` and `docs/api.md`, and the Operator page shows the message. It only adds; the frozen desktop treats a 503 like any failed request. `isHealthy` keeps its meaning.
  - Library Query Performance must not leave a schema version 2 `library.db.previous` beside a schema version 3 `library.db`: a build without this milestone deletes the newer catalog in that case.
  - Not included: showing the message in the WebUI, which is WebUI Status Line Overhaul.
  - Not included: carrying the message into the admin section, which is Admin Section in WebUI Settings.
  - Not included: restoring a backup from the admin section, which is Admin Library Catalog Transfer.
  - Not included: corruption the startup check cannot see, which is Catalog Corruption Detection Off the Startup Path.
  - Not included: a clearer desktop import message for a newer file. The desktop is frozen, and the file is already rejected without changes.
  - Not included: removing older-version backups, which rotation keeps until they are removed by hand, which is Admin Refresh, Backup, and Duplicate Review.
- **Acceptance criteria**:
  - A newer `library.db`, alone or with `library.db.previous` or `library.db.incoming` beside it, and a newer `library.db.previous` or `library.db.incoming` with no live catalog, are byte-identical after open, nothing is created or removed, and the open reports the catalog as newer.
  - A damaged `library.db` is quarantined, and no empty catalog is created on that start or a later one while a backup or a refused file exists.
  - With no `library.db`, no refused file, and no backups, an empty catalog is created as today.
  - Replacing a newer live catalog is refused and leaves it byte-identical.
  - Rotation deletes only valid current-version backups beyond the limit. Newer, older, and unrecognized files in `backups/` are byte-identical afterward and count toward neither the limit nor the gap.
  - With a newer or damaged catalog, the server starts, the Operator page and update routes answer, library routes return 503 with the message, and no backup or refresh runs, on that start and the next.
  - `/control/status` reports the library state and message, and the Operator page shows it.
- **Verification evidence**:
  - Completion evidence must include these tests, each shown failing before the fix:
    - A newer live catalog opens as newer, byte-identical, with no `library.db.refused` and no new database (today it is quarantined, measured).
    - A newer live catalog with an older `library.db.previous`: both unchanged (today the newer one is deleted, measured).
    - A newer live catalog with `library.db.incoming`: both unchanged (today the incoming file is deleted and the live one quarantined, measured).
    - No live catalog with a newer `library.db.incoming` or `library.db.previous`: both unchanged and no empty catalog (today the incoming file is deleted, inferred from code).
    - A damaged live catalog with backups is quarantined with no empty catalog on that open or the next, and a data folder with only a refused file gets no empty catalog.
    - Rotation keeps newer, older, and non-SQLite files, with and without the gap blocking a copy, and does not count them (today they are deleted, measured).
    - A forced desktop import over a newer live catalog is refused and leaves it unchanged (today it replaces it, measured).
    - The server composition with a newer or a damaged catalog starts its hosted services, reports no library, writes no backup, and stays that way on a second start (today the host start throws, measured).
    - The refresh pipeline neither runs on its schedule nor starts manually without a library.
    - The `/api` gate answers 503 for library routes and passes the allowed ones, tested as a function: no HTTP test host exists, and adding `Microsoft.AspNetCore.TestHost` needs approval.
  - `TryCreate_IgnoresAnUnhealthyBackupFile`, which asserts that a non-SQLite backup file is deleted, is renamed (for example `TryCreate_KeepsABackupFileItDoesNotRecognize`) and asserts the file stays byte-identical and uncounted. The existing quarantine tests and `UnrecognizedSchemaFile_IsNotALibraryDatabase_AndIsNotPrepared` keep passing.
  - `dotnet test ReelRoulette.sln`, plus `npm run generate:contracts` and `npm run verify` for the contract slice.
  - Docs evidence must include `CONTEXT.md`, `docs/dev-setup.md`, and `docs/domain-inventory.md`, which say a refused database stops startup, and `docs/api.md` for the 503 and the status fields.
  - Add a Release Specific checklist item: "With a copy of the data folder upgraded by a newer build, the installed build runs without a library, shows the message on the Operator page, leaves the library and backups byte-identical, and updates in-app, on Linux and Windows."
  - Measured before planning, with a throwaway test against the bundled SQLite: a read-only open of a cleanly closed WAL-mode catalog creates `library.db-shm` (32 KB) and an empty `library.db-wal` and leaves them behind, and a newer `user_version` committed only to the `-wal` reads as 2 from the file header and 3 through SQLite, with `library.db` and the `-wal` byte-identical afterward. So the version is read from the header, and through SQLite only when a `-wal` with content is already there. Waiver: in that case alone, the read may create or update `library.db-shm`; `library.db` and its `-wal` stay byte-identical, which the test for it checks.
  - Before the fix, with the new statuses, messages, and properties declared but behavior unchanged: 28 of the 30 new core tests failed, and the desktop forced import over a newer catalog was accepted. Newer catalogs were reported as refused and quarantined, the second open after a quarantine created an empty catalog, rotation deleted newer, older, and non-SQLite backups, and the catalog host threw on open. The two that passed already held: a folder with only settings backups gets an empty catalog, and the gate passes every route with a library.
  - After the fix, all pass:
    - Catalog files: newer live catalog; newer live with an older `library.db.previous`; newer live with `library.db.incoming`; no live catalog with a newer incoming or previous file; a current live catalog with a newer incoming or previous file; a newer version only in the `-wal`; a damaged catalog with backups over two opens; a folder with only `library.db.refused` or `library.db.refused.1`; a folder with only a current-version, newer, or non-SQLite backup; newer-file inspection; preparing an import over a newer live catalog or beside a newer incoming file; publishing over a newer live catalog; a newer live catalog that cannot be opened, with a usable `library.db.previous` beside it; a current-version catalog SQLite cannot read at the moment, alone or with a usable `library.db.previous`, and preparing an import over one. Each checks the folder is byte-identical where nothing should change.
    - Rotation: `Rotation_KeepsOtherVersionAndUnrecognizedBackups_AndDoesNotCountThem` and `Rotation_WhenTheGapBlocksACopy_KeepsOtherVersionAndUnrecognizedBackups`. `TryCreate_IgnoresAnUnhealthyBackupFile` is now `TryCreate_KeepsABackupFileItDoesNotRecognize`, which checks the file stays byte-identical and does not count toward the gap.
    - Desktop: `Import_ForcedOverANewerLiveCatalog_IsRefusedAndChangesNothing`, which also checks the overwrite question is still asked first, and `Import_ForcedOverALiveCatalogThatCannotBeRead_IsRefusedAndChangesNothing`.
    - Server: the composition with a newer or a damaged catalog, started twice, starts its hosted services, reports no library, writes no backup, refuses a manual refresh, leaves the catalog files and backups unchanged after the first start, and logs the message to `last.log` as a warning. The refresh pipeline neither reserves a scheduled run nor starts manually without a library. The `/api` gate is tested as a function over every operation in `openapi.yaml`: it refuses all `/api` routes except the ones listed in Scope with the reason and `library_newer`, `library_damaged`, `library_missing`, or `library_unreadable`, passes every route with a library, and the spec documents a 503 on exactly the routes it refuses. `ControlStatus_ResponseMatchesSpec` checks the new fields.
  - The existing quarantine tests and `UnrecognizedSchemaFile_IsNotALibraryDatabase_AndIsNotPrepared` pass unchanged.
  - Checked that the tests fail when the guard they cover is removed: reading the version through SQLite instead of the header fails 8 newer-catalog tests on the sidecar files it creates, and removing the library check from the refresh schedule fails the refresh test with the loop faulting on the library message. The first version of that test started the service with `StartAsync`, which in .NET 10 runs the loop on another thread, so it passed with the check removed; it now calls the loop directly, where the first check is synchronous.
  - A catalog file that cannot be opened to check its version is left unchanged: open reports the `unreadable` state without quarantining anything, and replace recovery, preparing an import, and publishing one change nothing. The tests hold the file so .NET cannot open it, which SQLite on Linux can still read. Before that fix, with the status, message, and exception declared, all three new tests failed: open deleted the newer `library.db` and opened the older `library.db.previous` in its place, the forced desktop import replaced the newer catalog, and the server host moved it aside as damaged.
  - A current-version `library.db` that SQLite cannot open or read at the moment (busy, locked, or cannot open) is unreadable too: recovery leaves it and the replace files alone, open reports `unreadable` instead of throwing, and preparing an import is refused. Only a file that is not a database, is corrupt, or lacks the catalog schema is damaged. The tests hold an exclusive SQLite lock on the catalog. Before that fix, all three new tests failed: open threw "database is locked", which stopped the server; with a usable `library.db.previous` beside it, recovery deleted the current catalog and opened the previous one; and preparing an import went ahead. `Open_LockedDatabase_FailsWithinASecondAndLeavesFile`, which asserted that throw, is now `Open_LockedDatabase_IsUnreadableWithinASecondAndLeavesFile` and still checks the open gives up within the time limit and moves nothing aside.
  - Open, replace recovery, imports, and checkpoints share one usability check that reads the revision row, so a `library.db` whose revision row is corrupt no longer gets `library.db.previous` deleted before open refuses it, and when recovery puts the previous catalog back, the damaged `library.db` is moved to a refused file instead of being deleted. `Open_CorruptRowPageWithAUsablePrevious_PutsThePreviousBackAndKeepsTheDamagedFile` failed before that fix, first with the previous catalog deleted and the open refused, then with the damaged file deleted, and now opens the previous catalog byte-identical and keeps the damaged file as `library.db.refused`. `Import_FileWithACorruptRevisionRow_IsRefusedBeforeAnythingIsReplaced` failed before the shared check read the revision row, with the import accepted over the existing catalog, and now leaves the folder byte-identical. The damaged message starts "The library is damaged and was moved aside", so it reads differently from the unreadable one.
  - The `-wal` test copies the open catalog files through a `FileStream` that shares write access, since `File.Copy` does not and cannot open them on Windows.
  - The tray's Refresh Library logs the library message without a library and still logs "Refresh is already in progress." while a refresh runs. The tray wiring in `Program.cs` is file-scoped with no test seam, so this rests on the build.
  - `dotnet build ReelRoulette.sln` with no warnings. `dotnet test ReelRoulette.sln`: Core 335, desktop 268, ServerApp 3 passed. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed. `npm run generate:contracts`, then `npm run verify` passed (231 WebUI tests).
  - Not run here: the 503 middleware over HTTP, its order after pairing, and the Operator page message, since the server was not started, and the tests on Windows. Two Release Specific checklist items cover the first three: the newer-build item covers the Operator page message, and "Without a library, a library route answers 503 with the message, the open routes answer, and an unpaired LAN caller gets 401." covers the 503 and the 401 before it.
  - Docs updated: `CONTEXT.md`, `docs/dev-setup.md` (no-library behavior, rotation keeping other-version backups until they are removed by hand, and restoring a backup by hand), `docs/domain-inventory.md`, `docs/api.md` (the 503, its codes and open routes, the status fields, and rotation), `docs/architecture.md` (desktop import refuses a newer catalog), `shared/api/openapi.yaml`, the testing checklist, and `CHANGELOG.md`.
  - Admin Refresh, Backup, and Duplicate Review gained daily backup retention in its Scope and acceptance criteria, which ages out older-version backups.

### M10j12 - Drop the Old Milestones Layout From the Checker

- **Status**: ✅ Complete
- **Goal**: `check-milestones.ps1` supports only the current layout, with completed milestones in `MILESTONES-COMPLETED.md`, once no comparison needs the old single-file layout.
- **Scope**:
  - Ships in v0.14.0, as part of the pre-release pass. Do it only after `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef v0.13.0 -Release` has passed in that pass. v0.13.0 is the last release with completed milestones inside `MILESTONES.md`, so later comparisons never need the old layout.
  - Remove the checker's reading of a base's completed history from the Completed Milestones section of its `MILESTONES.md`, including the intro fallback, and the header comment describing it.
  - Refuse a base that has no `MILESTONES-COMPLETED.md`, instead of treating every completed entry as newly moved.
  - Remove the `legacy.md` fixture and the tests that compare against it. Keep the check that flags a Completed Milestones section left in `MILESTONES.md`, and point its test at a fixture copy with that section added.
  - Remove the sentence in `docs/dev-setup.md` about bases from before the completed history had its own file.
- **Acceptance criteria**:
  - The checker no longer reads completed entries from a base's `MILESTONES.md`, and a base without `MILESTONES-COMPLETED.md` is refused with a clear message.
  - `legacy.md` and its tests are gone, and the leftover-section check is still tested.
  - `check-milestones.ps1 -BaseRef HEAD` and `tools/scripts/tests/test-scripts.ps1` pass.
- **Verification evidence**:
  - Completion evidence must include the passing release-wide check against v0.13.0 from the pre-release pass, run before this change, then `check-milestones.ps1 -BaseRef HEAD`, `tools/scripts/tests/test-scripts.ps1`, and a run against v0.13.0 showing the refusal.
  - Before this change, in the v0.14.0 pre-release pass: `check-milestones.ps1 -BaseRef v0.13.0 -Release` passed (`OK: MILESTONES.md and MILESTONES-COMPLETED.md passed milestone checks`).
  - After: `check-milestones.ps1 -BaseRef HEAD` passes, and `tools/scripts/tests/test-scripts.ps1` reports 35 passed, 0 failed.
  - `check-milestones.ps1 -BaseRef v0.13.0 -Release` now exits 1 with "v0.13.0 has no MILESTONES-COMPLETED.md; the checker compares only against bases that keep completed milestones in their own file."
  - With the `-BasePath` refusal removed, the new test that a base without its completed history is refused fails; with the leftover-section check removed, its test fails. Both checks restored afterward.

### M10j11 - Server Shutdown Fixes

- **Status**: ✅ Complete
- **Goal**: Stopping the server finishes in a few seconds with clients connected, the Windows tray survives its right-click menu, and Operator **Stop**, Operator **Restart**, and in-app update apply shut the tray down on its UI thread, so they cannot deadlock the server's shutdown.
- **Scope**:
  - Ships in v0.14.0. Three slices in this order: slow shutdown, the Windows tray right-click, then the tray shutdown race. The right-click slice goes before the race because both change the tray's exit path.
  - Add Release Specific checklist items:
    - "With clients connected, tray and Operator Stop exit within a few seconds, and Operator Restart relaunches the server, on Linux and Windows."
    - "On Windows, right-clicking the server tray icon opens the menu, menu items work, and the icon stays. If it passes, update the README Known Issues tray entry. If it fails, remove the Windows tray menu bullet from `CHANGELOG.md`."
  - Slow shutdown with connected clients:
    - Observed: stopping the server from the tray or the Operator UI takes about 25 seconds while clients are connected.
    - Likely cause, observed but not confirmed: open event streams are only closed when the host shutdown timeout runs out, not when shutdown starts. The `/api/events` loop only watches the request's abort token, not application stopping.
    - Confirmed by timings before the fix: shutdown waits for every open response until the 30-second host shutdown timeout. An open event stream holds it, and so does a media download the player has stopped reading, on its own.
    - Fix: end open event streams normally when the application starts stopping, and cut media responses still being sent. Media was added after the timings showed it holds shutdown on its own.
  - Windows tray right-click:
    - Observed on Windows since the tray moved to Avalonia: right-clicking the server tray icon shows no menu and the icon disappears, while the server and WebUI keep running. The Avalonia tray has never worked on Windows. Dispatcher hardening, an Avalonia version bump, and removing the checkbox menu item all reproduced it.
    - Cause, read from the Avalonia 12.0.0 binaries and reproduced in a headless experiment, not yet confirmed on Windows: on Windows, Avalonia draws the tray menu as a temporary top-level window that closes itself when it loses focus or an item is clicked. The tray starts its desktop lifetime with the default `ShutdownMode.OnLastWindowClose` and has no main window, so closing the menu shuts down the tray's UI loop, which removes the icon. The UI loop then returns normally and nothing is logged. Linux is unaffected because the desktop shell draws its menu over D-Bus and no Avalonia window opens. The same menu design is in Avalonia 11.3.12 through 12.0.4.
    - Supporting evidence: the original tray was pure WinForms, with no Avalonia, and worked on Windows, including all menu actions. The problem started when the tray moved to Avalonia, which is when the menu became an Avalonia window under the last-window rule. None of the earlier attempts changed that rule.
    - The tray thread is already STA, so apartment state is not the cause.
    - Fix: start the tray with `ShutdownMode.OnExplicitShutdown`. Every intended exit already calls the desktop lifetime's `Shutdown()` explicitly, so no exit path relies on the last-window rule, and Linux never opens a window.
    - Log to `last.log` when the tray's UI loop exits without a requested shutdown, so a silent exit is visible. Today the tray's logger reaches only the console and, for warnings and errors, the Windows Event Log.
    - Once the Release Specific check confirms the fix on Windows, update the README Known Issues entry, which attributes the problem to Avalonia's notification area integration.
  - Tray shutdown race:
    - No hang has been observed. A suspected hang on CachyOS after Operator **Stop** was most likely the terminal not redrawing its prompt after the server exited: pressing Enter brings the prompt back.
    - Suspected risk from code reading, not confirmed: these paths call `StopApplication` while the tray is still running, so the stopping callback shuts the Avalonia tray down from a non-UI thread. That calls `ClassicDesktopStyleApplicationLifetime.Shutdown()` off the UI thread, which cancels the UI main loop and then waits with no timeout in `Dispatcher.UIThread.InvokeShutdown()` for a job the UI thread may never run. If that happens, the blocked callback holds the `StopApplication` lock, so the host never stops its hosted services, `RunAsync` never returns, and a restart or update never relaunches. The tray menu paths avoid this because they shut the tray down on its UI thread before calling `StopApplication`.
    - `AvaloniaTrayHostUi.RequestUiExitAsync` posts the shutdown to the UI thread and then also calls the desktop lifetime's `Shutdown()` directly as an unconditional fallback.
    - The code path is unchanged since v0.12.0: the ServerApp code and the Avalonia version are the same at that tag.
    - Likely fix: always shut the tray down on its UI thread, and never call the desktop lifetime's `Shutdown()` from another thread.
    - Windows has the same code path and is untested. Headless runs are not affected, because the headless host UI does nothing on stop.
- **Acceptance criteria**:
  - With desktop and WebUI clients connected, tray **Stop Server / Exit** and Operator **Stop** exit the process within a few seconds.
  - Connected clients see the server go offline and reconnect after a restart, as they do now.
  - Operator **Stop** exits the process, and Operator **Restart** and update apply relaunch it, on Linux with the tray and on Windows.
  - Tray **Stop Server / Exit** and **Restart Server** still exit and relaunch cleanly.
  - No code path calls the tray's desktop lifetime `Shutdown()` from a non-UI thread.
  - On Windows, right-clicking the tray icon opens the menu, menu items work, and the icon stays, across repeated right-clicks and dismissals.
  - The tray starts with `ShutdownMode.OnExplicitShutdown`, and its UI loop ending without a requested shutdown writes a `last.log` line.
  - The Linux tray menu behaves as it does now.
- **Verification evidence**:
  - Completion evidence must include a test that an open event stream closes when the application starts stopping, a test or code check that the tray starts with `ShutdownMode.OnExplicitShutdown` and that an unrequested UI loop exit writes the `last.log` line, a test or code check that the tray's desktop lifetime `Shutdown()` is only reached on the UI thread, shutdown timings on Linux with and without a connected client before and after the fix, and one quick Linux spot check of the tray menu and of Operator **Stop** and **Restart** with the tray.
  - Repeated runs and the Windows pass are the Release Specific checklist items above, run in the pre-release pass.
  - If a hang is ever reproduced, include a thread dump of the hung process to confirm the cause.
  - `dotnet build ReelRoulette.sln` (0 warnings), `dotnet test ReelRoulette.sln` (desktop 252, Core 297 passed).
  - Shutdown timings on Linux, headless server with isolated data, from `POST /control/stop` to process exit:
    - Before: no client 0.4 s; one open event stream 30.4 s; an event stream plus a media download throttled to 50 KB/s 30.4 s; the throttled media download alone 30.4 s.
    - After: 0.4 s in all four cases. The server output shows the event stream ending with 200 and the media response ending, with no warnings or errors.
  - Event streams: `EventStreamTests` show an open stream ends without an error and unregisters its client when the application starts stopping, without the client disconnecting, and that a stream opened while stopping ends at once.
  - A stream whose write fails with an `IOException` while the client is still connected removes its event subscription. Without cancelling the stream's linked token on exit, the subscription stayed.
  - Media: `MediaResponseTests` shows a media response whose player stopped reading is cut when the application starts stopping.
  - Removing the stopping link from the event stream and the cut-off from media failed all three tests by timeout.
  - Tray code check (`git grep` in `AvaloniaTrayHostUi.cs`):
    - The tray starts with `StartWithClassicDesktopLifetime(..., ShutdownMode.OnExplicitShutdown)`.
    - The only `Shutdown()` call is in a helper that calls `Dispatcher.UIThread.VerifyAccess()` first. It is reached only from the job posted to the UI thread and from the startup-failure path, which runs in `OnFrameworkInitializationCompleted` on the UI thread. The direct fallback call from another thread is removed.
    - When the UI loop ends and no shutdown was requested, the tray writes a `warn` line to `last.log` through `ServerLogService`, with the error message when it failed.
  - Clients: by code reading, the desktop treats a stream that ends normally as a disconnect and reconnects every 2 seconds, and the WebUI's event stream reports an error on a normal end and reconnects the same way.
  - Linux spot check with the tray: PASS. With the WebUI and desktop connected, tray and Operator **Stop** and **Restart** took 1–2 seconds, both clients reconnected after a restart, repeated right-clicks opened the tray menu and the icon stayed, and `last.log` had no line for a tray that ended without a requested shutdown.
  - Docs updated: `CHANGELOG.md`, `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/architecture.md` (its out-of-date WinForms `NotifyIcon` line), and the Release Specific checklist items. The Windows right-click item also says to update the README Known Issues tray entry once it passes.
- **Deferrals / Follow-ups**:
  - Update apply cannot be checked before a release that contains this fix, because an update runs the installed version's shutdown. It stops the same way as Operator **Stop**.
  - If the Windows tray icon survives right-click but the menu still closes instantly, the menu window is losing focus as it opens, which ServerApp cannot change inside Avalonia. The fallback is a Windows-only native menu, such as the WinForms `NotifyIcon` tray that passed Windows verification before the move to Avalonia.

### M10j10 - Desktop Sound on Video Start

- **Status**: ✅ Complete
- **Goal**: Every desktop video starts with the sound the mute button shows.
- **Scope**:
  - Ships in v0.14.0. The desktop is frozen to bug fixes, so this milestone keeps only the silent-start fix; the player view and fullscreen problems are recorded under Deferrals.
  - Videos sometimes start with no sound on desktop after random play, next, or previous, while the mute button shows unmuted. Muting and unmuting restores sound. The WebUI, which plays through the browser's own video element, is unaffected. Existing behavior: the volume and mute code is unchanged since v0.12.0.
  - Likely cause, not confirmed: `PlayMedia` sets volume and mute only before LibVLC creates the new audio output (before and right after `Play()`, which returns before the output exists), and never after playback starts. LibVLC documents that mute may not apply when no audio stream is active. The desktop does not listen to LibVLC's mute or volume events, so the button never learns the player is muted.
  - Log LibVLC's `Muted`, `Unmuted`, and `VolumeChanged` events, and the player's mute and volume just before reapplying, so `last.log` shows whether a new file's audio output came up muted.
  - Reapply volume and mute once playback has actually started: on `Playing`, and again on the first seek-timer tick where playback time advances, once per new media and not on resume from pause. Cover the loop-toggle media rebuild and the other player rebuild path, which do not reapply mute today.
  - Fix the first-video volume check in `PlayMedia`, which reads the player's volume after `Play()`, before an audio output exists.
  - Add a Release Specific checklist item: "Switching videos repeatedly with random, next, and previous never starts a video silently, and the mute button matches what you hear," on Linux and Windows.
- **Acceptance criteria**:
  - After random play, next, previous, autoplay, and the loop-toggle rebuild, volume and mute are reapplied once playback has started, and not again on resume from pause.
  - `last.log` records LibVLC mute and volume events and the player's mute and volume before each reapply.
  - The first-video volume check does not read the player's volume before an audio output exists.
  - A saved mute still applies: with the app muted, switching videos stays silent and the button shows muted.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` (0 warnings), `dotnet test ReelRoulette.sln` (desktop 252, Core 293 passed).
  - Once-per-media rule: `PlaybackAudioReapplyTests` (8 tests) show a new media reapplies once on its first Playing and once on the first tick where playback time advances, and not on a later Playing (resume from pause), on ticks without an advance, after a photo clears it, or without a new media. Letting every Playing reapply failed four of them; never finishing after the time advance failed two.
  - Wiring: random play, next, previous, and autoplay all start videos through `PlayMedia`, which arms the reapply before `Play()`; the loop-toggle and Settings rebuilds arm it the same way. The reapply runs on the UI thread from the Playing handler and the seek timer, sets mute without reading it first, then applies volume through the normalization path, which keeps volume 0 while muted.
  - The first-video volume check that read the player's volume after `Play()` is removed; the constructor and the reapply set volume from the app's own state.
  - `last.log` gets `MediaPlayer.Muted`, `MediaPlayer.Unmuted`, and `MediaPlayer.VolumeChanged` lines from LibVLC, and a `ReapplyAudioState` line with the player's mute and volume before each reapply.
  - Linux spot check: PASS. Random, next, and previous switches all started with sound, a muted switch stayed silent with the button showing muted, and `last.log` showed the reapply and LibVLC audio event lines.
  - Docs updated: `CHANGELOG.md` and the Release Specific checklist item.
  - The Linux and Windows pass of repeated video switching is the Release Specific checklist item above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - Not fixed, because the desktop is frozen to bug fixes and is being retired. All existing behavior, found in the v0.13.0 manual regression pass:
    - Keyboard shortcuts (**P**, **F11**, and the rest) stop working while the pointer is over the video. With player view and fullscreen combined, the video fills the screen, so neither can be exited from the keyboard. Likely cause, not confirmed: the desktop never sets LibVLC's `EnableKeyInput` or `EnableMouseInput`, so the embedded video surface takes keyboard input.
    - Player view leaves a thin divider line from the normal layout at the top of the screen. Moving the pointer onto that line is the only way to make shortcuts work again in fullscreen player view.
    - The video does not always resize to fill the screen in fullscreen or player view.

### M10j9 - Client Event Efficiency

- **Status**: ✅ Complete
- **Goal**: Library events cost the clients and server only the work they need: a loaded window reloads only when an event can change what it shows, the WebUI resumes its event stream without losing events, the desktop does not refetch library stats once per event, and refresh progress does not send one event per file.
- **Scope**:
  - Ships in v0.14.0, right after the post-migration fixes. Four slices, each verified on its own.
  - Found and measured by the efficiency and divergence report on a copy of a 48,938-item catalog and 13 hours of `last.log`.
  - Patch-or-reload rule (desktop and WebUI, shared fixture):
    - Both clients reload every loaded window on a favorite or blacklist event while the filter has `favoritesOnly` or `excludeBlacklisted` (on by default), on a playback event while sorted by last played or play count or filtered to never played, and on a tag event while any tag filter is set. A reload re-reads the window in 200-item pages, one after another. Measured: reloading 5,000 loaded tiles sorted by last played takes 2.45 s and allocates 1.1 GB on the server, per event and per client. In one minute of real use, 31 WebUI plays caused 37 play-count-sorted library queries.
    - Reload the loaded window only when a field the event changed affects the current filter or sort; otherwise patch the tile. For example, a favorite on a loaded tile whose blacklist flag does not change patches under `excludeBlacklisted`, and a playback event under name sort patches. An event for an item that is not loaded reloads only when the change could bring it into the window.
    - Both clients implement the rule today in `LibraryPanelBrowse.EffectFor` and `libraryQueryTileEffect`, identically but with no shared fixture. Add a fixture under `shared/fixtures/` listing event kind, the fields that changed with before and after values, whether the tile is loaded, filter, and sort, with the expected patch or reload. Desktop and WebUI tests both run against it.
    - Decided here: an item that is not loaded and leaves the result (for example blacklisted under `excludeBlacklisted`, or played under `onlyNeverPlayed`) does not reload, so the header total stays one too high until the next query. A favorite on an item that is not loaded still reloads under `excludeBlacklisted`, because the event does not carry its previous blacklist flag. Playback under a last played or play count sort reloads in either direction. A tag change reloads a loaded tile when it removes a selected tag or adds an excluded one, and an item that is not loaded when it adds a selected tag or removes an excluded one. A tag save made on that client, and a catalog tag rename or delete, still reload under any tag filter, because they can change the filter itself.
  - WebUI event stream resume (WebUI, with one server fix):
    - The WebUI's live event stream in `app.js` opens a new `EventSource` on every error, with no last event ID. It receives neither the events published while it was away nor `resyncRequired`, so it shows stale favorites, tags, and playback until something else reloads. The desktop resumes with the last event ID.
    - `events/sseClient.ts` already tracks the last revision and builds the stream URL with it, but only its test uses it. Wire it into the WebUI and remove the duplicate `EventSource`, reconnect timer, and stream URL code in `app.js`.
    - `sseClient.ts` listens only for `refreshStatusChanged` and `resyncRequired`. It needs to carry every event type `app.js` handles today, with the same handling.
    - `sseClient.ts` has its own connection status wording. The WebUI keeps the connection messages `app.js` shows today; the client status line overhaul defines them.
    - `sseClient.ts` reconnects when no event arrives for 30 seconds, and the server sends no keepalive, so an idle stream would reconnect every 30 seconds. Decided here: drop the watchdog. A keepalive comment never reaches the page through `EventSource`, so it could not reset the watchdog; error events and the focus, visibility, and online reconnects cover a dropped stream, as they did before.
    - Server fix found while planning this slice, from code reading: the server's revision counter starts over when it restarts, and a reconnect whose last event ID is ahead of the current revision gets no replay and no `resyncRequired`. Treat a last event ID ahead of the current revision as a gap and send `resyncRequired`.
    - Both clients kept the highest revision they had seen, so after a restart they would keep resuming from the old one and get `resyncRequired` on every reconnect. Decided here: a client takes the revision of a `resyncRequired` it receives.
    - A client that had received no event yet reconnected with no last event ID, so it got neither the missed events nor `resyncRequired`. Decided here: a stream opened without a last event ID starts with a new `streamOpened` event carrying the server's current revision. An SSE `id:` line alone could not be used, because a browser `EventSource` does not hand an event with no data to the page and the desktop reader ignores it. This adds an event type to the contract.
    - Update `CONTEXT.md` to say both clients resume with the last event ID.
  - Desktop library stats coalescing (desktop):
    - The desktop refetches `GET /api/library/stats` from the playback, favorite, and blacklist event handlers, from the current-file read, and after other actions, once per call. Measured: 1,723 stats fetches in 13 hours, and 116 fetches for 31 WebUI plays in one minute, about 3.7 per play. Each fetch costs about 138 ms of server time under the lock the list query and item updates also take.
    - Coalesce them: at most one stats request in flight, a short delay to gather a burst of events, and one more request when events arrived while a request was in flight. Totals stay server-computed; the desktop does not add play counts or favorite counts itself.
  - Refresh progress throttling (server):
    - The fingerprint and thumbnail stages publish progress at most every 400–500 ms. The duration and loudness stages publish one `refreshStatusChanged` event per file they scan. A forced rescan of the 17,307 videos in the measured catalog sends about 17,000 events per stage, which overflows the server's 256-event replay history, so a client that reconnects during the scan gets `resyncRequired` and reloads its window.
    - Throttle duration and loudness progress the same way as the fingerprint and thumbnail stages, and keep the stage completion event and its final counts.
  - Add a Release Specific checklist item: "With the WebUI open, stop and restart the server, change a favorite and a tag on the desktop while the WebUI reconnects, and the WebUI shows both."
- **Acceptance criteria**:
  - Desktop and WebUI patch-or-reload tests read the same fixture, and changing an expected result in it fails both.
  - Under the default filter and name sort, a favorite on a loaded tile and a playback event patch the tile and do not query the library.
  - An event that can change which items are shown or their order still reloads the loaded window, keeping the scroll position.
  - After the WebUI's event stream drops and reconnects, the events published in between are applied, or the WebUI receives `resyncRequired` and reloads.
  - After a server restart, a reconnecting client whose last event ID is ahead of the server's revision receives `resyncRequired`.
  - The WebUI has one event stream implementation, and an idle stream does not reconnect on its own.
  - A burst of playback events on any client causes at most two desktop stats requests, and the desktop header totals match `GET /api/library/stats` once the burst settles.
  - A duration or loudness stage over N files publishes at most one progress event per throttle interval plus its completion event, and the completion message reports the same counts as before.
  - `CONTEXT.md` says both clients resume their event stream with the last event ID.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` (0 warnings), `dotnet test ReelRoulette.sln` (desktop 244, Core 293 passed), `npm run verify` (228 WebUI tests passed, contracts fresh, build output verified), and SystemChecks passed.
  - Patch-or-reload: `shared/fixtures/library-tile-effect.json` (28 cases) is read by `LibraryTileEffectFixtureTests` and the WebUI library session tests. Flipping the expected result of "favorite on a loaded tile under the default filter patches" to `reload` failed that case in both, and restoring it passed both. WebUI session tests show a favorite on a loaded tile and a playback event under the default filter and name sort make no library query, and that a blacklist on a loaded tile reloads and keeps the scroll position.
  - Event stream resume: WebUI `sseClient` tests cover a reconnect that sends the last event ID and applies the replayed events, taking the resync revision after a server restart, every event type reaching its handler, and an idle stream left open for 10 minutes with no reconnect. Building the stream URL without the last revision failed both resume tests. `ReplayAfter_TreatsALastEventIdAheadOfTheCurrentRevisionAsAGap` fails without the server fix. The resync-revision rule is locked to `shared/fixtures/event-revision.json`, read by `CoreEventRevisionTests` and the WebUI `sseClient` tests; flipping the expected result of "streamOpened never moves a revision the client already holds" failed that case in both, and restoring it passed both.
  - Quiet-server restart: a stream opened without a last event ID starts with `streamOpened` carrying the current revision, so a client that received no other event resumes from it, from 0 if need be. `EventStreamTests` runs the server's event stream with no events before a restart and a favorite after it, and the reconnecting client gets that favorite; it and the `streamOpened` test failed before the change. WebUI `sseClient` and desktop `CoreServerApiClient` tests show a reconnect sending a last event ID of 0.
  - Stats coalescing: `LibraryStatsRefreshTests` show 30 requests during the gather wait make one fetch, requests during a fetch make exactly one more, and the last applied stats are from the last fetch. Fetching on every request, as before, failed three of the four tests.
  - Refresh progress: a duration and a loudness stage over 200 files with the clock held publish one progress event and one completion event each, with completion messages `Duration scan complete (200 files, 0 updated)` and `Loudness scan complete (200 files, 0 updated)`. Without the throttle they published 201 and 202 events.
  - Stats fetches from `last.log` for a WebUI playback burst: before, 116 fetches for 31 plays in one minute (about 3.7 per play), from the efficiency and divergence report; after, 30 fetches for about 30 plays (about 1 per play), with the `LibraryStats: Fetching stats for N refresh request(s).` lines showing several requests collapsed into one fetch. Plays spaced further apart than the gather wait still get one fetch each; the at-most-two-per-burst bound is shown by `LibraryStatsRefreshTests`.
  - WebUI reconnect spot check: PASS. After the server was stopped and started again, a favorite changed on the desktop showed in the WebUI without a page reload.
  - Docs updated: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, and the Release Specific checklist item.
  - The full outage pass is the Release Specific checklist item above, run in the pre-release pass.
- **Deferrals / Follow-ups**:
  - Making each reload cheaper (one request for the loaded window, indexed sort, no counts on later pages) is the library query performance milestone.
  - Matching event items by ID instead of by path is the item IDs in the contract milestone.
  - Previous favorite and blacklist values in item-state events, so a favorite on an item that is not loaded can patch under the default filter, is a follow-up on the item IDs in the contract milestone.
  - Revision reuse after a restart is recorded in the server robustness findings: a client whose last event ID is below a restarted server's revision gets a partial replay with no `resyncRequired`, which revisions alone cannot detect.

### M10j8 - Post-Migration Fixes

- **Status**: ✅ Complete
- **Goal**: Fix defects left from the move to the server-owned catalog and two places where desktop and WebUI disagree, and close the control plane to unauthenticated LAN callers, one slice per defect, each with a test that fails before the fix.
- **Scope**:
  - Ships in v0.14.0. Ten slices, each verified on its own.
  - Landed in three parts, each with its own commit: server and Core (source list after import, auto-refresh reschedule, catalog item tags, fingerprint parallelism), then desktop (Update Preset after delete, scan menu items, media type, sort labels, numeric preset durations), then the control token.
  - Source list after source import (server):
    - Recorded as a deferral on catalog document removal: source import does not refresh the in-memory source list that `GET /api/sources` and source enable/disable read. That list is filled at startup.
    - Confirmed during v0.14.0 planning by a throwaway test: after a successful import, the server's source list still had 0 sources and disabling the new source failed until restart.
    - A newly imported source appears in `GET /api/sources` and can be enabled and disabled without a restart. Whether the list is refreshed after import or read from catalog rows is decided here.
  - Auto-refresh interval reschedule (server):
    - `POST /api/refresh/settings` writes through `CoreSettingsService` and skips `RefreshPipelineService.UpdateSettings`, so changing the auto-refresh interval or enabling auto-refresh does not reschedule the next run. Found by code reading and git history during v0.14.0 planning: the route has gone around the pipeline since the change that also split web runtime settings onto their own route.
    - Changing auto-refresh settings through the API schedules the next run from the new settings.
  - Catalog item tag assignment without field copy (Core):
    - `LibraryCatalogSession.AttachTags` replaces each tagged item with `CopyWithTags`, which lists every `LibraryCatalogItem` property by hand because `Tags` is init-only. Thumbnail revision, width, and height were added to the item without being added to that copy, so the list query returned no thumbnail dimensions for tagged items until the copy was fixed.
    - Let tags be assigned on an existing item (for example a settable `Tags`), have `AttachTags` set them in place, and remove `CopyWithTags` and its reflection test.
    - Related trap to check while there: `InsertItem` writes neither thumbnail columns nor tags from the item it is given. Every caller passes a new item today and thumbnails arrive later through `SetThumbnail`, so nothing is lost, but an item passed in with those fields set would silently drop them.
  - Desktop filter dialog Update Preset after preset delete (desktop):
    - In the desktop filter dialog, **Update Preset** can stay enabled after the active preset is deleted from the preset list, although no saved preset is left to update.
    - Found during review of the client-authority sync routes removal. The behavior existed before that work.
    - Likely cause, not confirmed: `DeletePresetButton_Click` clears the active preset name and refreshes the heading and pending state, but does not raise the `CanUpdatePreset` change notification.
    - The WebUI filter dialog has no Update Preset gate, so it is out of scope.
  - Desktop scan menu items (desktop):
    - **Scan Durations** and **Scan Loudness** check `Directory.Exists` on each source root on the desktop's own disk before asking the server to refresh. When the server runs on another machine, that check uses the wrong disk. The server decides which sources it can read.
    - Both items request the server refresh without a local folder check, and their status and log text no longer names a single source folder.
  - Desktop media type from the server (desktop):
    - Found by the efficiency and divergence report: the desktop decides whether the playing file is a photo or a video from its file extension, in `PlayMedia` and in the file-not-found message in `PlayFromPath`, using its own copy of the photo extension list. The playback response already carries the server's `mediaType`, and the WebUI uses it.
    - The desktop uses the server's media type for the playing item, and its photo and video extension lists are removed. The server keeps the only extension lists.
  - Sort direction labels (desktop and WebUI):
    - Found by the efficiency and divergence report: the two clients label the same sort direction differently. The WebUI shows `Newest → Oldest`, `A–Z`, and `Z–A`; the desktop shows `Newest -> Oldest`, `A-Z`, and `Z-A`.
    - Both clients use the WebUI's labels, with `→` and `–`. Check that the desktop font renders both characters in light and dark themes.
  - Numeric preset durations on the desktop (desktop):
    - Found while removing the preset match route: the desktop reads saved preset text with `JsonSerializer.Deserialize<FilterState>`, which throws on a numeric `minDuration` or `maxDuration` (seconds). `ParseCorePresetFilterState` then falls back to the default filter, so that whole preset is read as **None**. The WebUI and server filtering accept seconds, and `docs/api.md` documents them.
    - The desktop reads a numeric duration as seconds. Add a `"minDuration": 60` against `"00:01:00"` entry with `same: true` to `shared/fixtures/preset-filter-equality.json`; it fails on the desktop until the fix.
  - Fingerprint parallelism after a forced rescan (server):
    - Found by code reading while documenting the refresh settings: `RefreshPipelineService.ConsumeRefreshRescanFlags` clears a force flag by building a new `RefreshSettingsSnapshot` from auto-refresh enabled, interval, and the two force flags only. `FingerprintScanMaxDegreeOfParallelism` falls back to its default of 4, so a forced duration or loudness rescan resets a saved value such as 8.
    - Clearing a force flag keeps every other refresh setting.
  - Control token for non-localhost control requests (server and Operator):
    - Found by the repository audit and confirmed by the planned-milestones audit: `ServerPairingAuthMiddleware.AuthorizeControlPlaneAsync` enforces the control token only when `AdminAuthMode` is `TokenRequired`. With LAN binding on, the admin auth mode defaults to `Off`, so any LAN caller can stop, restart, or update the server, change settings, and run testing scenarios. First start writes that `Off` into `core-settings.json`, so changing the default alone would leave existing installs open.
    - The testing routes are open the same way: `IsTestingControlAuthorized` in `ServerHostComposition.cs` also checks the token only in `TokenRequired` mode. They check it themselves and do not exempt localhost, so requiring the token would lock the Operator's own testing panel out on the server machine.
    - Every non-localhost control request needs the control token. There is no `Off` for non-localhost requests: a persisted `Off` no longer opens the control plane to the LAN, and the Operator settings no longer offer it. Whether the admin auth mode field leaves `/control/settings` or stays read-only is decided here; removing it is its own contract slice.
    - Localhost stays trusted for every control route, including the testing routes.
    - A server with no control token generates one on start and saves it.
    - How a browser on another machine gets in: `/operator` still loads, and when its first control read returns `401`, the page shows only a control token prompt in place of the other sections. Submitting it posts to `POST /control/pair`, which sets the admin cookie, and the page then loads normally. The token is shown in the Operator settings opened on the server machine. For a headless server with no local browser, the docs say where `core-settings.json` keeps it. The page does not put the token in the URL.
    - A reverse proxy on the server machine still looks like localhost; that is fixed with reverse proxy support in the accounts release.
    - Add a Release Specific checklist item: "From another machine, the Operator asks for the control token, works after it is entered, and refuses a wrong one; on the server machine it opens without one, testing panel included," on Linux and Windows.
- **Acceptance criteria**:
  - A source imported through `POST /api/sources/import` appears in `GET /api/sources` and can be enabled and disabled before a restart.
  - Changing auto-refresh enabled or interval through `POST /api/refresh/settings` moves the next scheduled run to match the new settings.
  - No code rebuilds a `LibraryCatalogItem` from another one field by field. The list query and single-item read return the same item fields for tagged and untagged items, including thumbnail revision, width, and height. `InsertItem` either writes every field it is given or its contract says which fields it ignores.
  - After deleting the active preset while the heading shows a starred preset, **Update Preset** is disabled and the heading shows **None** or `None*`. Deleting a preset that is not active leaves **Update Preset** as it was. A headless desktop filter dialog test covers deleting the active starred preset and fails without the fix.
  - Scan Durations and Scan Loudness do not read source folders on the desktop's disk and start a server refresh when the server is reachable.
  - After a forced duration or loudness rescan clears its flag, `fingerprintScanMaxDegreeOfParallelism` keeps its saved value.
  - A non-localhost control request without the control token gets `401`, including with `Off` saved in `core-settings.json`. Localhost control requests, including the testing routes, work without it.
  - A server that has no control token creates and saves one on start.
  - On another machine, the Operator shows only the token prompt until a valid token is entered, then works; on the server machine it opens directly.
  - The desktop decides photo or video for the playing item from the server's media type, including when that type disagrees with the file extension, and has no extension list of its own.
  - Every sort mode and direction shows the same label on desktop and WebUI, and the desktop renders `→` and `–`.
  - A saved preset with a numeric `minDuration` or `maxDuration` keeps its other settings on the desktop, and the shared preset equality fixture covers a numeric duration on both clients.
  - Each slice has a test that fails without its fix, or the evidence says why one cannot be written.
- **Verification evidence**:
  - Completion evidence must include each slice's failing test before the fix and passing after it, and `dotnet test ReelRoulette.sln` with the list-query test that covers a tagged and an untagged item with catalog-only thumbnail dimensions still passing.
  - Server and Core part:
    - Source list after import: `ImportedSource_IsListedAndToggles_WithoutRestart` failed before the fix (no source listed after import) and passes. The source list and enable and disable read catalog rows; setting the flag a source already has neither writes nor publishes.
    - Auto-refresh reschedule: `RefreshSettingsRoute_SchedulesTheNextRunFromTheNewInterval` failed against the old route body (next run still 15 minutes out after saving 120) and passes. It calls the route's named handler, so the mapping of `POST /api/refresh/settings` to that handler is checked by reading, not by a test: the core tests share one data folder, so a test cannot start an isolated server host.
    - Fingerprint parallelism: `ForceRescan_ClearingItsFlag_KeepsFingerprintParallelism` (duration and loudness cases) failed before the fix (expected 8, got 4) and passes, and also checks auto-refresh enabled and interval are kept.
    - Catalog item tags: `CopyWithTags` and its reflection test are removed and `AttachTags` sets tags in place. `InsertItem` already wrote tags; it now also writes thumbnail revision, width, and height. `InsertItem_WritesThumbnailFieldsAndTags_ListAndSingleReadsAgree` failed before the fix (thumbnail revision read back null) and passes, comparing the list query and single-item read for a tagged and an untagged item. The existing list-query test with catalog-only thumbnail dimensions still passes.
    - `dotnet build ReelRoulette.sln` clean; `dotnet test ReelRoulette.sln` 262 core and 167 desktop tests pass; SystemChecks pass.
  - Desktop part:
    - Update Preset after preset delete: the recorded symptom did not reproduce. Deleting the active starred preset already disabled **Update Preset** and showed `Preset: None`, because the preset list reload switched the preset dropdown to None and that path raises the change notification. `DeletingTheActiveStarredPreset_DisablesUpdateAndClearsTheHeading` clicks the real Delete button on the Presets tab and passed before any fix; it stays as a regression test, and the delete handler now raises the notification itself. The actual bug: deleting any other preset, or moving the selected one up or down, reloaded the list, reselected the active preset in the dropdown, and loaded that preset's saved filter over the unsaved one, so `P*` became `P` and **Update Preset** turned off. The reload no longer loads the saved filter when it puts back the preset that was already selected. `DeletingAPresetThatIsNotActive_LeavesUpdateAsItWas` and `MovingTheActiveStarredPreset_KeepsTheUnsavedFilterAndUpdate` (up and down) failed before the fix (`Preset: P`, disabled, saved filter loaded) and pass. Renaming the selected starred preset, found in the user's spot check, did the same: the rename handler set the new name before the reload, the dropdown cleared it because the list did not have that name yet, and the reload then loaded the saved filter. The rename handler now tells the reload that the renamed preset is the one already selected. `RenamingTheActiveStarredPreset_KeepsTheUnsavedFilterAndUpdate` drives the real rename dialog and failed before the fix (`Preset: R`, disabled, saved filter loaded) and passes.
    - Scan menu items: the slice turned out to be dead code and was removed rather than fixed. The **Scan Durations** and **Scan Loudness** menu items left the desktop XAML when refresh moved to the server (commit `1657dbe`), and nothing else called `ScanDurations_Click` or `ScanLoudness_Click`, so neither the local folder check nor the ignored **Rescan all files** choice could run. Both handlers are deleted; everything they used has other callers. Refresh and forced rescans go only through the refresh pipeline and its settings. No test applies to removed code.
    - Media type: `PlaybackTarget` carries the server's media type (`mediaType == "photo"` on random and play-item responses, the item's media type for manual play), and `PlayMedia` and the file-not-found message use it. `_photoExtensions` is removed; the desktop had no video list. `PlaybackTargetResolverTests` covers `.mp4` reported as a photo and `.jpg` reported as a video, local and API; with extension detection put back, 4 of 8 cases fail.
    - Sort labels: `shared/fixtures/sort-direction-labels.json` lists every mode and direction. The desktop test failed on all 10 entries before the fix and passes; the WebUI test reads the same fixture and also checks it covers every sort mode. Changing one label in the fixture fails both. The theme spot check of `→` and `–` is the user's.
    - Numeric preset durations: the fixture's numeric `minDuration` and `maxDuration` entries failed on the desktop and pass after a property converter that reads durations the way the server's filter parser does; the WebUI already passed them. `FilterDurationJsonTests` checks a preset with numeric durations keeps its other settings and that durations are still written as `HH:MM:SS` text.
    - `dotnet build ReelRoulette.sln` clean; `dotnet test ReelRoulette.sln` 262 core and 201 desktop tests pass; `npm run verify` passes.
  - Control token part:
    - Found while planning: the auth middleware was installed only when API pairing was required, so with WebUI auth `Off` the control plane had no check at all, not even the 403 for LAN binding off. It is now always installed; its API branch still passes every request when pairing is not required. Checked by reading: the core tests cannot start an isolated server host with a non-local caller.
    - Throwaway checks against an export of the previous commit: a non-localhost `/control/stop` with `Off` saved passed through, no control token was generated, and an in-process host on loopback with `TokenRequired` saved returned 401 for `/control/testing/reset` and `/control/testing/update` without a cookie. Against this change: 401, a 32-character token saved, and 200 for both.
    - `ControlTokenTests` (21 tests): a non-localhost control request with `Off` saved gets 401; a control cookie or the bearer token passes and a wrong bearer token does not; localhost testing routes pass the middleware and their handlers return 200 without a token; a non-localhost testing route gets 401; a token is generated on start, saved, and kept on reload, and a saved `Off` is rewritten; `POST /control/pair` with the token sets `rr_admin` with a valid session, and a wrong token gets 401 with no cookie and logs `Control pairing failed from 192.168.1.90` without either token; a changed token ends both control sessions and keeps the API session, and saving the same token keeps them; a control session authorizes a non-localhost `/api/version` when pairing is required; a non-localhost token change ends every earlier control session and sets one fresh `rr_admin` session for the caller, and a localhost change sets no cookie; the control token as a `token` query gets 401 on a control route and on `POST /control/pair`, while the API pairing token as a query still passes on `/api`; a failed `last.log` append does not throw.
    - Review fixes: a remote Operator that changed the token got a 401 on the startup setting saved right after it, so the caller now gets a fresh control cookie; the control token is no longer accepted as a query parameter and `GET /control/pair` is removed; `LibraryOperationsService` writes its server log lines through `ServerLogService.Append`, which now catches every exception. The fresh cookie, query-token, and query-pair tests failed before their fixes, and the append test failed with the old `IOException`-only catch.
    - Mutation checks: letting every control request through, skipping token generation, skipping the session end, refusing control sessions on API routes, dropping the failed-pair log, skipping the `Off` rewrite, and skipping the cookie each failed at least one of those tests.
    - `adminAuthMode` stays in the contract, read-only. Because a token is now always required, `POST /control/settings` rejects an empty token, so three dev channel tests that posted `Off` with no token now post the current token. A token change reports `restartRequired: false`, since the middleware reads the token on every request.
    - `verify-web-deploy.ps1` now checks the generated token, an accepted settings save with it, and a 200 from a localhost `/control/testing/reset`; it passes. The cross-machine pass is the Release Specific checklist item above.
    - `dotnet build ReelRoulette.sln` clean; `dotnet test ReelRoulette.sln` 283 core and 201 desktop tests pass; `npm run verify` passes; SystemChecks pass; the Operator page script passes `node --check`.
  - The media type slice's test must cover a playback response whose `mediaType` disagrees with the file extension. The sort label slice's tests must check every mode and direction on both clients against the same expected labels, plus one quick spot check of the desktop label in each theme.
- **Deferrals / Follow-ups**:
  - WebUI reaction to `sourceStateChanged` stays with WebUI Source State Sync.
  - Found while planning: **Scan Loudness** asked whether to rescan every file, but only logged that choice. Moot: the handler was unreachable and was removed with the scan menu slice.
  - Found in the numeric duration slice: the server's filter parser, and now the desktop, read duration strings with `TimeSpan` rules first, so `"75"` is 75 days and `"1:30"` is 1 hour 30 minutes, while the WebUI reads them as 75 and 90 seconds. Both clients only write `HH:MM:SS`, so only hand-written or API-written presets differ. Not changed here; it needs a backlog item if those forms should agree.
  - Found during the desktop part's spot checks: the WebUI uses the browser's native prompt, confirm, and alert dialogs, such as for preset rename -> WebUI In-App Dialogs backlog item.
  - Release notes for v0.14.0 must say that opening the Operator from another machine now asks for the control token, and where to find it.
  - Found in the control token slice: removing the now read-only `adminAuthMode` field -> Auth Cutover for API and Operator, which removes the control token and its setting.
  - Found in the control token slice: `/api` routes and `GET /api/pair` still accept the API pairing token as a query parameter -> Auth Cutover for API and Operator.
  - Found in the control token slice: `/api/web-runtime/settings` is open to any LAN caller with the API pairing token, which `/runtime-config.json` serves to every browser -> Auth Cutover for API and Operator.

### M10j7 - Scrub library.json From the Product

- **Status**: ✅ Complete
- **Goal**: Make product code, comments, user-facing copy, tests, and current-state docs read as if a JSON library, a schema 1 catalog, and a catalog document never existed.
- **Scope**:
  - Depends on: Remove library.json Library Support.
  - Ships in v0.14.0.
  - Product code, comments, user-facing copy, tests, and current-state docs do not mention `library.json`, `library.json.migrated`, or a legacy flat tag list.
  - They also do not mention the catalog document (for example "does not load the full catalog document" in `docs/api.md`, `docs/architecture.md`, `CONTEXT.md`, and the description text in `shared/api/openapi.yaml`), schema 1 or a schema 1 migration, `presets.json`, or the thumbnail `index.json`.
  - Rename the empty-catalog temp file `library.db.migrating`, left from the removed migration, to a name that does not mention migration. A leftover file with the old name is not cleaned up, so the old name does not stay in the code.
  - Remove the `docs/feature-migration.md` §3.17 Tag-Catalog Migration Wizard entry, whose dialog is gone.
  - Fix the other `docs/feature-migration.md` sections the planned-milestones audit found stale:
    - The header says no Operator UI project exists. The Operator page exists, served by the server at `/operator`.
    - §3.1 says WebUI click-to-play is not implemented and describes a projection refetch on open. The WebUI library overlay plays on click and browses through the list query.
    - §3.2 says the WebUI lacks the category, tag, duration, and source filter UI. The WebUI filter overlay has it.
    - §3.9 says Manage Sources calls `/api/sources/*` for every action. There are no rename or remove routes.
    - §3.11 says Auto Tag has no web equivalent. The WebUI tag overlay has an Auto Tag tab.
    - §3.12 says tag rename has no web equivalent. The WebUI tag editor renames tags.
    - §3.16 says item removal is backed by a server API. There is no item removal route.
    - §3.18 names `/control/log`. The route is `/control/logs/server`.
  - Fix three `CONTEXT.md` claims the audits found wrong:
    - It says the service worker lets Android Chrome install the WebUI. The worker registers only in a secure context and the server serves plain HTTP, so on a LAN address Chrome offers only a shortcut. Say that installing on Android needs HTTPS, for example through a reverse proxy.
    - It lists remove among the desktop grid's working bulk actions. Remove from Library has no server route and is hidden by the dead code removal milestone.
    - It lists reconnect recovery with `Last-Event-ID` as an SSE capability without naming a client. Found by the efficiency and divergence report: only the desktop resumes with the last event ID. The WebUI opens a new event stream with no last event ID after an error, so it gets neither the missed events nor `resyncRequired`. Say that only the desktop resumes; the client event efficiency milestone updates it when the WebUI does.
  - Remove leftover comments that describe removed or "legacy" paths, such as the disabled legacy tag migration dialog and legacy local-authority comments in `MainWindow.axaml.cs` and the legacy view-model comment in `FilterDialog.axaml.cs`. Code that is still live keeps its name; `AllowLegacyTokenAuth` stays with the auth cutover.
  - Add the desktop flows that still run locally to `docs/domain-inventory.md`, which `AGENTS.md` says it records: library database import writing the server's `library.db` from the desktop process, whole-list preset writes, preset-match heading comparison, refresh status summary parsing, and the client-owned flows that stay local by design (local-first playback, loudness baseline choice, desktop settings backups, Show in File Manager).
  - Core settings and desktop settings stay JSON. Presets and thumbnail revision, width, and height stay in the catalog. JPEG files stay in the local thumbnail directory.
  - Do not rewrite released changelog sections, completed milestone entries, `docs/full-audit.md`, `docs/velopack-migration-audit.md`, or `docs/migration-cleanup.md`. The unreleased changelog may record that the format was removed.
  - Update the testing checklist so it does not mention those names.
- **Acceptance criteria**:
  - Product code, comments, user-facing copy, tests, and current-state docs do not mention `library.json`, `library.json.migrated`, a legacy flat tag list, the catalog document, schema 1, `presets.json`, the thumbnail `index.json`, or `library.db.migrating`. A search for those names outside the historical files named below finds nothing, with no exceptions.
  - `docs/feature-migration.md` has no Tag-Catalog Migration Wizard entry, and its header and §3.1, §3.2, §3.9, §3.11, §3.12, §3.16, and §3.18 match the current WebUI, Operator, and routes.
  - `CONTEXT.md` does not claim Android install works over plain HTTP, that the desktop can remove items from the library, or that the WebUI resumes its event stream with the last event ID.
  - `docs/domain-inventory.md` lists the desktop flows that still run locally and says which are local by design.
  - Core settings and desktop settings stay JSON. Presets and thumbnail metadata stay in the catalog. JPEG files stay local.
  - Released changelog sections, completed milestone entries, and the historical audit and migration notes named above are left as written.
- **Verification evidence**:
  - A case-insensitive `git grep` for `library.json`, a flat tag list, the catalog document (including the shorter "full document"), schema 1 (including `Schema1` identifiers), `presets.json`, `index.json`, `library.db.migrating`, the thumbnail index, the tag-catalog migration wizard, and `/control/log` finds nothing outside `CHANGELOG.md`, `MILESTONES.md`, `RELEASE-NOTES.md`, `COMMIT-MESSAGE.txt`, `docs/full-audit.md`, `docs/velopack-migration-audit.md`, and `docs/migration-cleanup.md`, with no exceptions.
  - The empty-catalog temp file is `library.db.creating`. A leftover `library.db.migrating` is not cleaned up, by decision, so the old name is not in the code.
  - Tests: the leftover-file cases for `library.json`, `library.json.migrated`, `presets.json`, and `thumbnails/index.json` were dropped, by decision, and the behavior tests kept: empty create, healthy open, and quarantine and refusal for a file that is not a database, corrupt row pages, an unversioned database, and an unrecognized schema version. Backup trim tests plant neutrally named backups beside the catalog backups. Desktop import into an empty folder needs no confirmation and remaps. `dotnet test ReelRoulette.sln` passes 425 (Core 258, Desktop 167). Core went from 265 because four parameterized tests became single cases.
  - Mutation check, restored afterward: widening the catalog backup trim to `*.backup.*` failed both backup trim tests.
  - Tests that remap source roots build those roots under the test's temp folder and assert the exact combined path, so they pass on Windows, where an unrooted `/to` resolves onto the current drive. That covers the desktop import tests, the remap rejection test, and the three `CombineRootAndRelative` tests, which resolve their root with `Path.GetFullPath`. No other test resolves or remaps a Unix-style rooted literal; the rest are stored and compared as strings. `AGENTS.md` now requires this for paths a test resolves or remaps. Mutation check, restored afterward: remapping onto the old root failed both desktop remap tests.
  - `dotnet build ReelRoulette.sln` has no warnings or errors. `npm run verify` passes after regenerating contracts. SystemChecks passes.
  - Comments: the disabled tag migration dialog comment and the "removed, now X" tombstone comments in `MainWindow.axaml.cs` are gone. The legacy view-model comment in `FilterDialog.axaml.cs` had already been removed. The Linux packaged server smoke script no longer mentions the retired portable smoke.
  - `docs/feature-migration.md`: the Tag-Catalog Migration Wizard entry had already been removed, so the FFmpeg log entry is §3.17 and names `/control/logs/server`. The header names the Operator page at `/operator`. §3.1, §3.2, §3.9, §3.11, §3.12, and §3.16 were rewritten in place with their numbers kept, by decision.
  - `CONTEXT.md`: Android install needs HTTPS, and only the desktop resumes its event stream with the last event ID, confirmed from `app.js`, which opens a new `EventSource` with no last event ID. It already said Remove from Library is hidden.
  - `docs/domain-inventory.md` lists the desktop flows that still run locally, split into server-owned work still on the desktop and client-owned flows local by design.
  - The testing checklist's Windows first-start item now says a data folder from v0.12.0 or earlier that has no `library.db`.
  - Released changelog sections, completed milestone entries, `docs/full-audit.md`, `docs/velopack-migration-audit.md`, and `docs/migration-cleanup.md` are left as written.
- **Deferrals / Follow-ups**:
  - Accounts stay with the Account Store work, in their own store outside `library.db`.

### M10j6 - Remove library.json Library Support

- **Status**: ✅ Complete
- **Goal**: Remove `library.json` as a library format, the schema 1 catalog migration, and the side-file copy in v0.14.0, so the catalog store only opens or creates a schema version 2 `library.db`.
- **Scope**:
  - Depends on: Seed Tests Through SQL.
  - Ships in v0.14.0.
  - Startup does not look for `library.json` or `library.json.migrated`. Those files do not change open, refuse, or empty-catalog behavior. A missing `library.db` creates an empty catalog with SQL, not by parsing an empty document, whether or not `library.json` is present. `library.json` is left untouched. A healthy `library.db` opens. A corrupt `library.db` is quarantined and startup refuses with the same result it uses when those files are absent. They are not read, not a restore path, and not deleted. Startup and user-facing strings do not mention either file.
  - Delete the JSON-to-SQLite importer, including `PrepareIncomingFromJson`. Tests build a catalog in `library.db`. They do not write `library.json` to create one.
  - Also remove the schema 1 to schema 2 migration and the `presets.json` / `index.json` side-file copy. This overrides the earlier decision to keep the schema 1 migration: no release ever wrote a schema 1 catalog. Release builds before v0.13.0 had no catalog, and the first build after schema 1 was introduced already wrote schema version 2. That removes `LibraryCatalogStore.SideFiles.cs`, `PreviousSchemaVersion`, the schema 1 table list and health branch, the `side_files_copied` key handling, `AfterSideFileCopy`, the open result's migrated-schema flag, and the server's migrated-schema log line. A `library.db` at schema version 1 is treated like any other database with an unrecognized schema. An existing `side_files_copied` row in a catalog is left in place and not read. `presets.json`, `index.json`, and their `.migrated` copies are left untouched.
  - Remove the desktop `LibraryArchive` JSON helpers: `LibraryJsonHasContent` in the overwrite check and `RetireUnmigratedLibraryJson` after import.
  - Import already has no `library.json` path and no zip. A file that is not a library database is rejected. A `.db` import still remaps sources. Export and catalog backups stay on `library.db`.
  - Update current-state docs and the testing checklist to say `library.json` library support is removed, including the checklist item that a v0.12.0 library migrates on first start.
  - Add a Release Specific checklist item: "On Windows, first start with no data folder, and with a data folder holding only `library.json`, opens an empty library."
- **Acceptance criteria**:
  - Startup does not migrate `library.json` and does not rebuild a catalog from `library.json.migrated`.
  - A missing `library.db` creates an empty healthy `library.db` at schema version 2 with SQL, whether or not `library.json` or `library.json.migrated` is present. Those files are left in place and are not read. No message mentions them.
  - A healthy `library.db` opens. A corrupt `library.db` is quarantined and startup refuses the same way whether or not those JSON files are present, and it is not repaired from them.
  - There is no JSON-to-SQLite importer and no `PrepareIncomingFromJson`. There is no schema 1 migration and no side-file copy. A missing database does not read `presets.json` or the thumbnail index, and those files are left in place.
  - A schema version 1 `library.db` is quarantined and refused like any other unrecognized database.
  - Desktop import does not read or rename `library.json`. A folder whose only library data is `library.json` does not ask for overwrite confirmation.
  - There is no `library.json` import path and no deprecation message for that format. A `.db` import still remaps sources.
  - A file that is not a library database is not imported, including a file that used to be a `library.json` archive. Import does not replace the live catalog.
  - Startup messages and user-facing copy do not mention `library.json` or `library.json.migrated`.
  - Docs and the testing checklist describe `library.json` library support as removed in v0.14.0.
- **Verification evidence**:
  - Before: `dotnet test ReelRoulette.sln` passed 441 (Core 274, Desktop 167). After: it passes 432 (Core 265, Desktop 167). Deleted: the 13 `library.json` migration tests, the 5 schema 1 and side-file tests, the loudness-error-from-JSON session test (session writes and the seeding helper's test already cover that column), and the refusal and empty-create tests that named `library.json`, which were rewritten.
  - Added or rewritten: a missing database creates an empty healthy schema version 2 catalog (Uncategorized category, revision 0, no presets, no thumbnail columns, only the `revision` meta row) with nothing present, with `library.json`, with `library.json.migrated`, with both, and with those plus `presets.json` and `thumbnails/index.json` holding data, and every one of those files is byte-identical afterward with no `.migrated` file created. A healthy seeded catalog opens unchanged with all four files present. A file that is not a database, a database with corrupt row pages, and an unversioned database are each quarantined to `library.db.refused` and refused with the same message with and without the JSON files, which stay untouched. A schema version 1 database is quarantined and refused, leaves `presets.json` and `index.json` untouched, and is rejected by catalog inspection and by preparing an import. An existing `side_files_copied` row is kept and not read. A `library.json` document is not imported and leaves the live catalog. Desktop: a folder whose only library data is `library.json` does not count for overwrite confirmation, and import into it needs no confirmation, remaps sources, and leaves `library.json` byte-identical.
  - Removing the side-file copy also removed the only row read on open, which was what quarantined a database with corrupt row pages. Approved fix: open reads the catalog's `revision` row after the schema check, and both corrupt-row-page cases fail without it. Stronger detection is the Catalog Corruption Detection Off the Startup Path backlog item.
  - The empty-catalog create path did not use the before-publish or directory-sync hooks, so the open options and the server's thumbnail-folder open parameter were removed with no loss of coverage.
  - Mutation checks, each restored afterward: removing the revision read failed 2 tests; moving `library.json` aside when creating a catalog failed 3; a JSON-specific refusal message failed 3; accepting schema version 1 failed 2; writing `side_files_copied` on create failed 5; renaming `library.json` after desktop import failed 1; counting `library.json` as library data failed 2.
  - SystemChecks passes. `dotnet build ReelRoulette.sln` has no warnings or errors.
  - Linux spot check: the built server, run from an isolated data, config, and XDG folder holding only `library.json`, started with empty library stats and sources, created `library.db` at user version 2, left `library.json` byte-identical with no `.migrated` file, and logged nothing about `library.json`. The server was stopped by its own PID and the folder removed.
  - Docs: `CONTEXT.md`, `docs/architecture.md`, `docs/dev-setup.md`, and `docs/domain-inventory.md` say `library.json` library support is removed in v0.14.0. `docs/feature-migration.md` says a leftover `library.json` does not count for overwrite confirmation and is left in place. The testing checklist has the Windows first-start item under Release Specific. It no longer had an item saying a v0.12.0 library migrates on first start; the last checklist reset had cleared it.
- **Deferrals / Follow-ups**:
  - Release notes for v0.14.0 must say: users on v0.12.0 or earlier must start v0.13.0 once before updating to v0.14.0, because v0.14.0 does not convert `library.json`.
  - Release notes for v0.14.0 must give the recovery steps for anyone who updated straight from v0.12.0 and sees an empty library: delete the new `library.db`, start v0.13.0 once to convert `library.json`, then update to v0.14.0 again.
  - Scrubbing every remaining `library.json` mention from product code, comments, user-facing copy, tests, and current-state docs is the next milestone.
  - Operator export and import stay with Operator Library Catalog Transfer. That transfer is a `library.db` checkpoint.
  - Accounts stay with the Account Store work, in their own store outside `library.db`.
  - Stronger corruption detection that does not add to startup time is the Catalog Corruption Detection Off the Startup Path backlog item.
  - The empty-catalog temp file is still named `library.db.migrating`; the scrub milestone renames it.

### M10j5 - Seed Tests Through SQL

- **Status**: ✅ Complete
- **Goal**: Tests build their catalog in `library.db` directly, so removing `library.json` support does not touch what they check.
- **Scope**:
  - Ships in v0.14.0. Test-only. No product change.
  - Measured during v0.14.0 planning: with startup `library.json` migration switched off, 81 tests fail because they seed through `library.json`. By class: `LibraryOperationsServiceTests` 23, `LibraryCatalogStoreTests` 21, `RefreshPipelineServiceTests` 17, `LibraryPlaybackServiceTests` 12, `LibraryArchiveMigrationTests` 4, `LibraryListQueryTests` 2, `LibraryCatalogSessionTests` 1, `PlayItemOrchestrationTests` 1.
  - Add one test seeding helper that creates a schema version 2 catalog and writes sources, categories, tags, items, item tags, and presets with SQL.
  - Move every test that seeds through `library.json` to that helper, except tests whose subject is `library.json` migration or recognition. Those stay unchanged until the removal milestone deletes them.
  - Each moved test checks the same thing as before.
- **Acceptance criteria**:
  - With startup `library.json` migration switched off on a scratch copy, the only failing tests are those whose subject is `library.json` migration or recognition.
  - No test outside that set writes `library.json`.
  - The test count and pass count are unchanged on the real code.
- **Verification evidence**:
  - Before: `dotnet test ReelRoulette.sln` passed 437 (Core 270, Desktop 167). With startup migration switched off on a scratch copy, 83 failed, not the 81 measured during planning: `LibraryOperationsServiceTests` had 24 and `LibraryPlaybackServiceTests` 13.
  - After: `dotnet test ReelRoulette.sln` passes 441 (Core 274, Desktop 167). The four added tests cover the seeding helper: its case fold matches the catalog store's, its schema (tables, columns with types, indexes, and user version) matches a catalog the store creates, and a seeded catalog opens healthy with every column read back. Changing a column type, dropping an index, adding a column, or changing the user version in the helper each fails the schema test. Every existing test still runs and passes.
  - After, with migration switched off on a scratch copy, 15 fail, each with `library.json` migration or recognition as its subject: 13 `LibraryCatalogStoreTests` (`Open_MigratesLibraryJson_…`, `Open_BeforePublish_…`, `Open_DirectorySyncFails_…`, `Open_ExistingSnapshot_…`, `Open_PartialDatabase_…`, `Open_HealthyDatabase_DoesNotReadEitherJsonFile`, `Open_TimeSpanDuration_…`, `Open_BlankCategoryId_…`, `Open_DuplicateTagNames_…`, `Open_ItemWithoutFullPath_…`, `Open_MissingFingerprintStatus_…`, `Open_MissingUncategorizedCategory_…`, `Open_SourceMissingIdOrRootPath_…`), `LibraryCatalogSessionTests.Open_StoresLoudnessErrorFromLibraryJson`, and desktop `Import_RejectsALibraryJsonDocument_…`.
  - The only tests that still write `library.json` are those 15 and tests that already pass with migration off and test recognition (`Open_CorruptRowPage_…`, `Open_UnversionedDatabaseWithoutJson_…`, `Open_MigratedSnapshotOnly_…`, `InspectCatalogFile_RejectsALibraryJsonDocument`, desktop `LibraryExistsWithContent_IncludesUnmigratedLibraryJson_…` and `Import_UnmigratedLibraryJson_…`).
  - Same data proven: on scratch copies, a temporary hook in `LibraryCatalogStore.Open` recorded every test's first-open catalog (sources, categories, tags, items with all columns, presets) before and after the move. All 160 shared snapshots match except one `LastWriteTimeUtc` that the test reads from a file it creates at run time.
  - Mutation check: a seeding helper that dropped favorites, blacklists, play counts, and item tags failed 19 moved tests and the helper's own test.
  - Approved addition, requested when the plan was confirmed: the services that fell back to opening their own catalog from a data folder (`LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, `ServerStateService`) no longer do. The tests pass the catalog they seeded, and the server already passed its one catalog to each, so runtime behavior is unchanged. `ServerDataPathsTests` resolves all four services from the server's composition. SystemChecks passes.
  - Two replace-recovery tests prepared their incoming catalog from JSON and now prepare it from a seeded database file. One startup test no longer asserts that `library.json.migrated` exists; it still checks that sources load from the catalog. The importer dropped the orchestration test's source because it had no root path, so its seed has no source row.
- **Deferrals / Follow-ups**:
  - `ServerStateService` keeps an optional catalog. SystemChecks and 38 test constructions use it without one, a mode that touches no disk and is not a data-folder fallback.
  - The 15 tests above stay until the removal milestone deletes or rewrites them, and their names, together with the "Legacy" and "LibraryJson" names of moved tests, are left for the scrub milestone.

### M10j4 - Document Unlisted Server Routes in OpenAPI

- **Status**: ✅ Complete
- **Goal**: Every route the server serves to clients is in `shared/api/openapi.yaml`.
- **Scope**:
  - Ships in v0.14.0. Additive contract change in its own slice.
  - The server serves four routes that the spec does not list: `GET` and `POST /api/backup/settings`, `GET /api/library/stats`, `GET` and `POST /api/web-runtime/settings`, and `GET` and `POST /control/startup`. The desktop calls the first three, and the Operator calls the web-runtime and startup routes.
  - Add them to the spec with the request and response shapes the server returns today, and regenerate the WebUI types.
  - `/` and `/runtime-config.json` stay out of the spec. `/health` was already in the spec and stays there.
  - No server or client behavior changes.
  - Scope expanded with approval: add `forceRescanLoudness` and `forceRescanDuration`, which the server already returns, to `RefreshSettingsSnapshot`, and remove the milestone ID from the spec's `info.description`.
- **Acceptance criteria**:
  - Each listed route and method is in the spec, and its schema matches what the server returns.
  - The spec's paths and the server's mapped API and control routes match, apart from `/` and `/runtime-config.json`.
  - `npm run verify:contracts` passes after regeneration.
- **Verification evidence**:
  - Path diff before the change, from the `MapGet` and `MapPost` literals in `ServerHostComposition.cs` and `ServerApp/Program.cs` against the spec's path and method pairs: the spec lacked exactly the seven listed operations, the server alone had `GET /` and `GET /runtime-config.json`, and the spec had nothing the server does not serve. The Operator page is mapped from a configured path, not a literal, and is also left out.
  - Added the seven operations and the `BackupSettingsSnapshot`, `WebRuntimeSettingsSnapshot`, `LibraryStatsResponse`, `LibraryGlobalStatsResponse`, `SourceStatsResponse`, `StartupLaunchStatus`, `StartupLaunchUpdateRequest`, and `StartupLaunchResult` schemas. Response fields are required, with `sharedToken`, `displayName`, and `averageDurationSeconds` nullable. `StartupLaunchUpdateRequest` requires no fields; the backup and web runtime settings `POST` bodies take the full snapshot, using the same schema as their responses. `POST /control/startup` lists `409` with the same body, and both startup operations list `401` and `403` like the other control routes. The regenerated WebUI types only gained lines.
  - `OpenApiRouteContractTests.Spec_ListsEveryMappedApiAndControlRoute` compares the scanned route mappings with the spec. Property-name shape tests serialize real `CoreSettingsService` get and update results for backup, web runtime, and refresh settings, and `LibraryOperationsService.GetLibraryStats` with a source that has no display name and a source with no items, using ASP.NET's default minimal API JSON options, and require the property names to equal the spec schema's, nested schemas included. They check property names only, not types, nullability, or required lists. `/control/startup` has no automated shape test; the captured responses below cover it. Against the HEAD spec, all five tests failed and the route test named exactly the seven missing operations. Removing `averageDurationSeconds` from `SourceStatsResponse` failed only the stats test, and adding an unserved `GET /api/bogus` failed only the route test. All passed again once the spec was restored.
  - `/control/startup` responses were captured from the Debug server started with `REELROULETTE_DATA_DIR`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` in a temporary folder on a random localhost port, then stopped by PID and removed. Run through `dotnet`, `GET` returned `200 {"supported":true,"launchServerOnStartup":false,"message":"…"}` and `POST` returned `409 {"accepted":false,"supported":true,"launchServerOnStartup":false,"message":"…"}`. Run as the app binary, `POST` with `true` returned `200` with `accepted: true` and wrote the autostart entry under the temporary `XDG_CONFIG_HOME`, the following `GET` reported it on, and `POST` with `false` removed it.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed: Core 270 (+5), Desktop 167. `npm run verify` passed, including `verify:contracts`, with 170 tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - Docs: `docs/api.md` already listed every route. It now says which server routes the spec leaves out, lists the refresh settings fields, and describes the `/control/startup` fields and `409`.
- **Deferrals / Follow-ups**:
  - A forced duration or loudness rescan resets the fingerprint parallelism setting to its default -> Post-Migration Fixes.

### M10j3 - Remove the Preset Match Route

- **Status**: ✅ Complete
- **Goal**: Remove `POST /api/presets/match`, which no client calls, and lock the desktop and WebUI preset comparisons to one shared fixture.
- **Scope**:
  - Ships in v0.14.0. Contract change in its own slice.
  - The desktop `CoreServerApiClient.MatchPresetAsync` is the route's only client method, and only a test calls it. The desktop compares presets with `LibraryPresetSelection.FiltersEqual`, and the WebUI with `filterStatesEqualForPresetMatch`. Neither asks the server.
  - Remove the route, `PresetMatchRequest` and `PresetMatchResponse` from `ApiContracts.cs` and `shared/api/openapi.yaml`, the regenerated WebUI types, the desktop client method and its request and response types, and the tests that call them.
  - Remove the server-side preset equality that only the route uses: `LibraryPlaybackService.TryMatchPreset`, `ResolvePresetByFilterState`, `ParseFilterState`, `FilterStateProjection`, and the token and value helpers only `ParseFilterState` calls.
  - `POST /api/random` still resolves `presetId` by name.
  - Add a shared fixture under `shared/fixtures/` listing pairs of filter states with whether they are the same preset, covering at least an unset global match mode against an explicit AND, per-category local match modes, include and exclude tags, source inclusion, media type, audio filter, duration bounds, and a saved filter that still carries `tagMatchMode`. Desktop and WebUI preset-equality tests both run against it.
- **Acceptance criteria**:
  - The route, its contract types, and its generated WebUI types are gone, and `npm run verify:contracts` passes.
  - The server has no preset equality code. `POST /api/random` with `presetId` gives the same result as before.
  - Desktop and WebUI preset-equality tests read the same fixture, and changing an expected result in it fails both.
  - The desktop filter dialog and library preset list, and the WebUI filter dialog preset heading, behave as before.
- **Verification evidence**:
  - Measured before planning with throwaway tests: both clients agreed on 15 of 18 saved-filter pairs. The desktop alone treated a `null` tag list and an empty `categoryLocalMatchModes` as different from none, and threw on a numeric duration. The removed server equality compared tags as case-insensitive sets, which neither client did.
  - Scope expanded with approval: both clients now compare included and excluded tags as case-insensitive sets and source IDs as case-sensitive sets that ignore order. Category mode maps compare by key regardless of key order, since an older saved preset can list categories in a different order than a filter built after the categories were reordered. The desktop treats a missing tag or source list as empty, ignores empty tag and source names, and treats an empty category mode map as none, matching the WebUI. Tag matching is identical on both clients only for ASCII names, since JavaScript `toUpperCase` and .NET `ToUpperInvariant` differ on some non-ASCII letters such as `ß`; both comparisons and `docs/api.md` say so.
  - `shared/fixtures/preset-filter-equality.json` has 37 entries, checked both ways round on each client. The category mode key order entry was added before its fix and failed on both the desktop and the WebUI (1 of 36 each) against the comparison without it. Against the old comparison code, 8 desktop and 5 WebUI entries failed, all of them the order, case, duplicate, `null` list, and empty map cases this change targets. Flipping `selected tag order is ignored` to `false` failed exactly that entry on both the desktop and the WebUI (1 of 35 each, before the category entry was added), and both passed again once it was restored. The `empty tag and source names are ignored` entry failed on the desktop alone (1 of 37) before the desktop dropped empty names, and passes on both now.
  - Removed `LibraryPlaybackService.TryMatchPreset`, `ResolvePresetByFilterState`, `ParseFilterState`, `FilterStateProjection`, and their token, duration, map, and array helpers. `ResolvePreset` stays. No test sent `presetId` without an inline filter, so `TrySelectRandom_ResolvesPresetIdByNameWhenNoFilterStateIsSent` was added: it resolves a differently cased preset name to that preset's filter and returns 404 for an unknown name. It passed against the HEAD server code and passes after the removal.
  - Removed the client and server tests that called the route or `TryMatchPreset`. The existing desktop and WebUI preset-selection tests still pass unchanged.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed: Core 265, Desktop 167 (+37 fixture cases). `npm run verify` passed, including `verify:contracts`, with 170 tests (+37 fixture cases). `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - Docs: `docs/api.md` no longer lists the route and describes the client comparison. `CONTEXT.md` and the `docs/migration-cleanup.md` status line are updated. Added `[Unreleased]` Changed and Removed entries and a Release Specific checklist check.
- **Deferrals / Follow-ups**:
  - The desktop drops a saved preset with a numeric duration to the default filter -> Post-Migration Fixes.

### M10j2 - Dead Code Removal Without Contract Changes

- **Status**: ✅ Complete
- **Goal**: Remove code that nothing calls at runtime, on every surface, without changing the API contract or user-visible behavior.
- **Scope**:
  - Ships in v0.14.0. Code that only tests call counts as unused. Test hooks that hold or observe a production code path stay (`Hold*` / `*Entered` and `CancelRunsForShutdown` in `RefreshPipelineService`, `LibraryCatalogBackup.WaitForPending`, `ClientLogRelay.DisableForTests`, `AppDataManager.UseDirectoryForTests`).
  - The WebUI `events/sseClient.ts` (`createSseClient`) and `buildEventsUrl` in `events/eventEnvelope.ts` stay, although only their tests call them today: the client event efficiency milestone wires them into the WebUI for reconnect resume.
  - Found by the v0.14.0 planning report: the Roslyn unused-member analyzers (IDE0051, IDE0052, IDE0060) run on a copy of the repo, TypeScript `--noUnusedLocals --checkJs`, and caller searches. Removing one item can leave others unused, so re-run those checks until they report nothing.
  - Three slices, each verified on its own:
  - Desktop slice:
    - The never-constructed `MigrationDialog` (`MigrationDialog.axaml`, `MigrationDialog.axaml.cs`, `MigrationTagViewModel`).
    - Handlers for the removed History, Recently Played, Favorites, and Blacklist list views, which nothing wires: `HistoryPlayAgain_Click`, `RecentlyPlayedPlay_Click`, `RecentlyPlayedShowInFileManager_Click`, `RecentlyPlayedRemove_Click`, `BlacklistPlay_Click`, `BlacklistRemove_Click`, `BlacklistShowInFileManager_Click`, `FavoritesPlay_Click`, `FavoritesRemove_Click`, `FavoritesShowInFileManager_Click`, and `BlacklistCurrentVideo_Click`.
    - `MainWindow` members with no caller: `PlayMedia(string, bool)`, `RemoveLibraryItemAsync`, `BeginLibraryArchiveOperationUI`, `EndLibraryArchiveOperationUI`, `BlacklistCurrentVideo`, `BuildGridRowModels`, `ContainsTagCaseInsensitive`, the `GetAutoTagScopeItems` stub that always returns an empty list, the `persistLibrary` parameter of `ApplyRemoteItemStateProjection`, and the unread `_rng` and `_videoExtensions` fields.
    - The unread `EditTagDialog._categories` field and the unused `TagViewModel` class in `FilterDialog.axaml.cs`.
    - `CoreServerApiClient.AppendClientLogAsync`, `GetVersionAsync`, and `TryReadJsonError`, and `TagSaveApply.EchoesFor`, which nothing calls. `LibraryConnectReads`, which only its test reads.
    - The Auto Tag dialog's local matching fallback: `ItemMatchesTag` and the scan branch that runs it when no API scan is passed. Production always passes the API scan, so this branch is a client-local fallback that never runs. Found by the efficiency and divergence report.
    - `LibraryPanelSort.Apply` and its file name comparer, an in-memory client sort that only tests call. The server sorts the list query. `IsDefaultDescendingForSortMode` and `GetSortDirectionLabel` stay: the sort control uses them. Found by the efficiency and divergence report.
    - Hide the desktop controls that cannot work because their server routes do not exist: **Rename** and **Remove** in the Manage Sources dialog, which only show "API-required and not available" after their dialogs, and **Remove from Library** in the grid's context menu, which shows its confirmation and then the same message. Found by the planned-milestones audit. They stay hidden until Operator Source and Item Management adds the routes. This is the one user-visible change in this milestone. The handlers and dialogs behind them stay: Remove from Library comes back on the new item route, and the Manage Sources dialog is replaced by Desktop Source Management Link.
  - Core and server slice:
    - `State/RuntimeStateServices.cs` (randomization, filter-session, and playback-session state services), the `IPathResolver` and `IBackgroundTaskScheduler` interfaces, and `CoreFilterState` / `CoreFilterPreset` with the `CoreVerification.VerifyDtoMappingRules` check that only exists to construct them. Drop the placeholder list from the SystemChecks verbose output.
    - `LibraryCatalogStore.DatabaseHasContent` (no caller) and `IsUsableDatabase` (tests only). `LibraryCatalogSession.ReplaceItemTags` (no caller), and `AddItemTags`, `RemoveItemTags`, and `SetPlayback`, which only tests call. Tests that seed through them move to the SQL seeding helper from the test seeding milestone, or to the production write they stand in for.
    - The full-catalog read on every open: `LibraryCatalogStore.Open` builds `LibraryCatalogOpenResult.Catalog`, and only tests read it. Measured on a 48,938-item catalog at about 360-450 ms and about 100 MB of allocations at each server start. Tests read the snapshot through `LibraryCatalogStore.Read` instead.
    - `ServerSessionStore.GetActiveSessionCount`, `ServerStateService.GetSubscriberCount`, `MediaPlayableExtensions.IsPhotoExtension`, `CoreSettingsService.ReloadFromDisk`, `FilterStateProjection.ToModel`, and `RefreshPipelineService.GetSettings`, `GetWebRuntimeSettings`, and `UpdateWebRuntimeSettings`. Keep `RefreshPipelineService.UpdateSettings` for the auto-refresh reschedule fix in the post-migration fixes milestone.
    - The unread `CoreSettingsService._logger` and `RefreshPipelineService.JsonOptions` fields.
    - The `catalog ?? LibraryCatalogHost.Open(...)` fallbacks in `LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, and `ServerStateService` are reached only from tests. Remove them if the server data folder override leaves no test that needs them.
  - WebUI and scripts slice:
    - The unread `filterActiveTab` in `app.js`.
    - The flat-tag branch in the WebUI filter Tags tab (`legacyFlat` in `app.js`), which renders tags when the catalog has no categories. The server always keeps Uncategorized and no longer has a no-categories tag path, so this branch cannot be reached.
    - `tools/scripts/publish-web.ps1`, which writes a `.web-deploy` folder that nothing reads, and `tools/scripts/verify-web.ps1`, which only runs `npm install` and `npm run verify`. Remove their references in `docs/dev-setup.md` and `docs/domain-inventory.md`.
- **Acceptance criteria**:
  - Every item listed above is gone, or the evidence says why it stayed.
  - The unused-member analyzers and TypeScript unused-locals checks report nothing new for product code.
  - `LibraryCatalogStore.Open` does not read the full catalog, and server startup does not build a catalog snapshot.
  - API routes, OpenAPI, generated WebUI types, desktop and WebUI behavior, and the Operator are unchanged, except that the desktop no longer shows Manage Sources **Rename** and **Remove** or the grid's **Remove from Library**.
  - The rest of the Manage Sources dialog and the grid context menu work as before.
  - Test hooks listed in scope still exist and their tests pass.
  - `events/sseClient.ts` and `buildEventsUrl` still exist and their tests pass.
  - The desktop Auto Tag scan has no local matching path, and the desktop has no client-side list sort.
- **Verification evidence**:
  - Unused-member analyzers (IDE0051, IDE0052, IDE0060, plus CS0169 and CS0649) on a copy of the working tree. Before: 15 hits, all on the list above except one pre-existing IDE0060 on the `cancellationToken` parameter of `AvaloniaTrayHostUi.RequestUiExitAsync`, which was left alone because it is not dead code on this list. After the desktop slice: 4 (that one plus three server items). After the core and server slice: only that one remains. TypeScript `tsc --noUnusedLocals --noUnusedParameters --checkJs --allowJs`: before, `filterActiveTab` only; after the WebUI slice, nothing.
  - Removals left more items unused, and those went too. Desktop: `RemoveFromBlacklistAsync`, `PlayFromPath`, the archive-operation status fields, the always-hidden status-bar progress bar, and the Auto Tag dialog's `ItemHasTag`, display-path helper, catalog, and scope-items arguments. Core and server: `LibraryCatalogSession.ItemExists`, `CoreSettingsService.ApplyLoadedSettings` and `_serverRuntimeOptions`, and the `CoreSettingsService` constructor's logger parameter, which only fed the removed field.
  - Searches for callers confirmed the public members the analyzers cannot see. `FilterStateProjection.ToModel` is gone; the class stays for the preset match route removal.
  - Catalog open: `LibraryCatalogOpenResult.Catalog` is gone, and `Open` no longer calls `Read`. On a synthetic 50,000-item catalog, `Open` went from a median of 150 ms with 44.5 MB allocated (HEAD) to 0.8 ms with almost nothing allocated (7 runs each). Tests read the snapshot through `LibraryCatalogStore.Read` on the opened database. A check confirmed no test writes between its open and that read.
  - Tests that used `AddItemTags`, `RemoveItemTags`, or `SetPlayback` now use `ApplyItemTagEdits` and `RecordPlayback`. The refresh hold test checks a play count of 1 from a seeded 0 instead of an explicit 3. `AddItemTags_MissingItem_CreatesNothing` was deleted because it covered only the removed method. `ApplyItemTagEdits` still adds the catalog tag for a missing item. The backup test checks `InspectCatalogFile` instead of `IsUsableDatabase`.
  - Met differently: the `catalog ?? LibraryCatalogHost.Open(...)` fallbacks in `LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, and `ServerStateService` stay. About 35 tests build these services from a data folder alone and rely on them.
  - The test hooks listed in scope, `events/sseClient.ts`, and `buildEventsUrl` still exist, and their tests pass. `shared/api/openapi.yaml`, `ApiContracts.cs`, and `openapi.generated.ts` are unchanged, and `npm run verify:contracts` passes.
  - Hidden controls use `IsVisible="False"`, and their handlers and dialogs stay. A new headless test opens Manage Sources with one source and checks that Rename and Remove are not shown while Refresh and Find Duplicates are. It failed with Rename made visible. The test classes now share one headless session. `MainWindow` cannot be built in a headless test without side effects: its constructor loads native LibVLC, and its `Loaded` handler starts the core reconnect loop and the update service. So the grid menu gets a manual spot check instead of a test.
  - Grid menu spot check (manual, desktop app): PASS. **Remove from Library** is hidden from the grid menu with no doubled separator, and the other menu items work. Manage Sources shows the enable toggle, **Refresh**, and **Find Duplicates...** without **Rename** or **Remove**.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed: Core 273 (one deleted test), Desktop 130 (−1 `LibraryConnectReads`, −7 list-sort tests, +1 Manage Sources). `npm run verify` passed with 133 tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed, with no placeholder list.
  - Docs: `docs/dev-setup.md`, `docs/domain-inventory.md`, and `CONTEXT.md` no longer name the removed scripts. `docs/feature-migration.md` drops the migration wizard and notes the hidden controls. `CONTEXT.md` and `docs/domain-inventory.md` note that opening the catalog does not read it whole. Added an `[Unreleased]` Changed entry and a Release Specific checklist check for the hidden controls.
- **Deferrals / Follow-ups**:
  - Unused routes and contract types are the preset match route removal milestone.
  - Make the catalog a required constructor argument of `LibraryOperationsService`, `LibraryPlaybackService`, `RefreshPipelineService`, and `ServerStateService`, and drop their `catalog ?? LibraryCatalogHost.Open(...)` fallbacks, once the tests that build them from a data folder are rewritten -> the test seeding milestone or later.
  - The pre-existing unused `cancellationToken` parameter of `AvaloniaTrayHostUi.RequestUiExitAsync` -> backlog; not on this milestone's list.

### M10j1 - Server Data Folder Override

- **Status**: ✅ Complete
- **Goal**: Let verification scripts and tests point the server at a temporary data folder on every OS, so they never read or write the developer's real settings, catalog, or thumbnails.
- **Scope**:
  - This is the first milestone in the v0.14.0 release. It comes first so later milestones can verify the server on Windows without touching real settings.
  - Why: `verify-web-deploy.ps1` isolates data by setting `APPDATA` on Windows and `XDG_CONFIG_HOME` on Linux. Setting `APPDATA` does not redirect `Environment.GetFolderPath` on Windows, so that script currently runs against real settings there. On Linux it does not set `XDG_DATA_HOME`, so thumbnails still resolve under the real `LocalApplicationData` folder. `set-release-version.ps1` runs that script by default.
  - Add one server helper that reads an environment variable such as `REELROULETTE_DATA_DIR` and otherwise falls back to the current folder lookup (`ApplicationData/ReelRoulette` for data, `LocalApplicationData/ReelRoulette/thumbnails` for thumbnails). With the override set, data lives in the override folder and thumbnails under `<override>/thumbnails`.
  - Use that helper at every place the server and ServerApp resolve their data or thumbnail folder: `ServerHostComposition` (three places), `CoreSettingsService`, `LibraryPlaybackService`, `RefreshPipelineService` (data and thumbnail folders), `ServerLogService`, `ServerStateService`, `LibraryOperationsService`, `LibraryCatalogHost` (thumbnail folder), and the ServerApp `Program.cs` data folder lookup. Explicit constructor path overrides keep precedence.
  - `verify-web-deploy.ps1` sets the override to its temporary folder on every OS, in place of the `APPDATA` / `XDG_CONFIG_HOME` split.
  - Remove the `APPDATA` scope (`AppDataScope`) in `RefreshPipelineServiceTests`, which has no effect on `Environment.GetFolderPath` on Windows. Those tests pass their temporary folder explicitly.
  - Tests that construct `ServerStateService` pass a data folder override instead of falling back to the real folder.
  - Also check `ReelRoulette.Core.SystemChecks`: it constructs `ServerStateService()` with no override, which creates the real data folder if it is missing.
  - Desktop data folder resolution is out of scope.
  - Add a Release Specific checklist item: "`verify-web-deploy.ps1` on Windows leaves the real data and thumbnail folders unchanged."
- **Acceptance criteria**:
  - With the environment variable set, the server reads and writes settings, catalog, backups, logs, and thumbnails only under that folder, with thumbnails under `<override>/thumbnails`.
  - With the variable unset, the server resolves the same folders as before.
  - No server or ServerApp code outside the helper calls `Environment.GetFolderPath` for its data or thumbnail folder.
  - `verify-web-deploy.ps1` leaves the real `ApplicationData/ReelRoulette` and `LocalApplicationData/ReelRoulette` folders untouched on Windows and Linux.
  - No test sets `APPDATA` to isolate data, and every test that constructs `ServerStateService` passes an override.
- **Verification evidence**:
  - Added `ServerDataPaths` in the server project. Every server and ServerApp data and thumbnail lookup goes through it. `git grep GetFolderPath` in `ReelRoulette.Server` and `ReelRoulette.ServerApp` finds only the helper and the unrelated XDG autostart and AppImage `UserProfile` lookups.
  - Met differently: `ServerStateService` with no override and no catalog touches no folder, so tests that construct it without an override are safe. Core verification no longer creates the real data folder.
  - `Core.Tests` now has a test-isolation module initializer. It sets `REELROULETTE_DATA_DIR` to a temporary folder for the run and, on Linux, points `XDG_CONFIG_HOME` and `XDG_DATA_HOME` at temporary folders it creates first, because `GetFolderPath` returns an empty path for an XDG folder that does not exist. `AppDataScope` is gone from `RefreshPipelineServiceTests`.
  - Helper tests cover the unset, blank, set, and relative override cases and the environment variable read. A composition test builds `AddReelRouletteServer()` with the override, resolves every server service, saves settings, writes a log line, and starts and stops the hosted services. It checks that `library.db`, `core-settings.json`, a settings backup, and `last.log` are under the override, and that the Linux XDG folders contain no `ReelRoulette` folder.
  - The composition test was confirmed to fail when `ServerLogService` or `ServerHostComposition` bypasses the helper, and when the thumbnail folder lookup does (caught by the XDG check).
  - `verify-web-deploy.ps1` sets the override on every OS and drops `APPDATA`. Rather than replacing the XDG variables, on Linux it keeps both `XDG_CONFIG_HOME` and `XDG_DATA_HOME` alongside the override, as the verification-script rules in `AGENTS.md` require, so desktop integration such as autostart and menu entries stays isolated too. `verify-linux-packaged-server-smoke.sh` also sets the override, keeping its XDG variables, and checks that `last.log`, `library.db`, and `core-settings.json` are under the override and that the isolated XDG config folder contains nothing named `ReelRoulette`. It passed, and a copy with the override removed failed on the missing `last.log`.
  - `verify-web-deploy.ps1` now checks that `last.log`, `library.db`, and `core-settings.json` are under the override and, on Linux, that the isolated XDG folders contain no `ReelRoulette` folder.
  - One Linux run of `pwsh ./tools/scripts/verify-web-deploy.ps1` passed with no other ReelRoulette server running (checked by port and process list). Names, sizes, and modification times under `~/.config/ReelRoulette` and `~/.local/share/ReelRoulette` (48,973 entries) were identical before and after the run. Port 51312 was free afterward, and the temporary folder was removed.
  - `dotnet build ReelRoulette.sln` passed with 0 warnings. `dotnet test ReelRoulette.sln` passed (Core 274, Desktop 137). `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - The Windows run is the Release Specific checklist item, run in the pre-release pass.
  - Docs: `docs/dev-setup.md` describes the override, the core test isolation, and the verification-script rules it satisfies. Updated `CONTEXT.md`, the testing checklist (the automated `verify-web-deploy.ps1` check is no longer skipped, plus the Release Specific Windows check), and `CHANGELOG.md`.
- **Deferrals / Follow-ups**:
  - Desktop data folder resolution stays out of scope. Desktop library import writes `library.db` into the server data folder it resolves itself, so it does not follow a server started with `REELROULETTE_DATA_DIR`.

### M10i20 - Remove Client-Authority Sync Routes

- **Status**: ✅ Complete
- **Goal**: Remove the unused client-authority tag sync routes and the unused `tagMatchMode` filter field so v0.13.0 no longer offers a client-held catalog sync, after checking whether a v0.12.0 client still needs either.
- **Scope**:
  - Depends on: dropping the unread server tag and item cache.
  - This is the last milestone in the v0.13.0 release.
  - Before removal, check at the `v0.12.0` tag whether a v0.12.0 desktop or WebUI posted to `POST /api/tag-editor/sync-catalog` or `POST /api/tag-editor/sync-item-tags`, and whether the version/capability gate lets a v0.12.0 client connect to a v0.13.0 server. If both are true, stop. This milestone is a compatibility decision to bring back, and the routes stay until that decision.
  - Remove `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags`.
  - Remove their OpenAPI request schemas and the generated WebUI types for those routes. The shared tag snapshot schemas stay.
  - Remove the desktop client methods and request types for those routes.
  - Remove the server operations methods and session methods that exist for those routes, and the tests that call them.
  - WebUI tag save still goes through apply-item-tags after the regenerated types.
  - Current-state docs and the testing checklist no longer describe these routes. Completed milestone entries stay as written.
  - Added during planning: remove `tagMatchMode` from the filter contract. The same `v0.12.0` check covers it, since removing a filter field can affect a v0.12.0 client the same way removing a route can. OpenAPI types `filterState` as a free-form object and never named the field, so the OpenAPI document and generated WebUI types do not change for it. Remove it from the server and Core filter models, the server filter parser and preset-match projection, the desktop `FilterState`, the hidden legacy radio buttons in the desktop filter dialog, the WebUI filter state, and the WebUI code that copies the global match selector into it.
  - Added during planning: the desktop main-window filter summary says "all" or "any" for included tags from the global match mode, not `tagMatchMode`. It used to say "all" for both global AND and global OR.
  - Added during planning: preset matching ignores `tagMatchMode` in saved filter text on the server, the desktop, and the WebUI, so a desktop preset and a WebUI preset with the same filter match. Saved presets are not rewritten.
  - Added during planning: remove `LibraryCatalogSession.ReplaceTagCatalog`, which had no production caller.
  - Added during manual verification: the desktop filter dialog enables **Update Preset** from the same comparison as its `Preset:` heading, including the global match mode. It used to depend on a flag that only a control change set, so reopening the dialog on a starred preset showed the `*` with Update disabled. Apply still compares with the filter the dialog opened with. The WebUI filter dialog has no Update Preset gate, so that part does not change there.
  - Added during manual verification: preset matching on the server, the desktop, and the WebUI treats an unset global match mode as AND, the same as filtering does. Switching the global mode away and back then clears the `*`, and a preset saved with the mode unset matches the same filter with an explicit AND in either app. The desktop filter dialog's own preset checks, including on Apply, use the same desktop comparison, and its Apply button compares the working filter with the filter it opened with the same way, so a toggle away and back leaves Apply disabled. Saved presets are not rewritten. This predates this milestone.
  - Added during review: the WebUI filter dialog's **Apply** `*` compares the working filter with the filter it opened with through the same preset comparison, so a toggle away and back from an unset global mode clears it, as on the desktop. The desktop dialog's pending check compares its preset list by name and order and each preset's filter with `FiltersEqual`, so updating a preset to a filter that means the same as before leaves Apply disabled. The desktop filter dialog has no raw JSON filter comparison left. `LibraryPresetSelection.SameFilterSnapshot`, a raw JSON filter comparison that only its own test called, is removed with that test.
  - Added during manual verification: desktop tests use a test-only settings directory and turn off the server log relay, so they do not touch the developer's settings or a running server on Linux or Windows. Filter dialog tests drive the real dialog with `Avalonia.Headless` in the desktop test project only.
- **Acceptance criteria**:
  - The `v0.12.0` tag check is recorded. Removal proceeds when a v0.12.0 desktop or WebUI did not post to either route, or when the version/capability gate does not let a v0.12.0 client connect to a v0.13.0 server.
  - When both are true, the routes stay and this milestone stops for a compatibility decision.
  - `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags` are gone, along with their OpenAPI request schemas, generated WebUI types, desktop client methods and request types, server operations methods, session methods, and tests.
  - The shared tag snapshot schemas stay.
  - WebUI tag save still goes through apply-item-tags after the regenerated types.
  - Current-state docs and the testing checklist do not describe these routes.
  - Startup still migrates a leftover `library.json`.
  - `tagMatchMode` is not in the server, Core, desktop, or WebUI filter models, the desktop filter dialog, or the WebUI filter code. A filter or saved preset that still carries it is accepted and gives the same result as one without it.
  - The desktop filter summary says "any" with global OR and "all" with global AND or an unset global mode. A test covers each.
  - Saved preset text that still carries `tagMatchMode` matches the same filter without it, and a different `tagMatchMode`, on the server, the desktop, and the WebUI. A test covers each.
  - A desktop settings file whose saved filter still carries `tagMatchMode` loads and keeps its other values.
  - `ReplaceTagCatalog` is gone.
  - In the desktop filter dialog, **Update Preset** is enabled exactly when the heading shows a starred preset, both after a change in the dialog and when the dialog opens on a starred preset. A headless dialog test covers both and fails with the previous flag.
  - Desktop tests resolve settings and backups under a temporary test directory on Linux and Windows, and send no log lines to a server.
  - A preset saved with the global mode unset matches the same filter with an explicit AND, and not with OR, on the server, the desktop, and the WebUI. In the desktop filter dialog, switching the global mode away and back clears the `*`, disables Update, and leaves Apply disabled. A test at each site fails without the normalization.
  - In the WebUI filter dialog, switching the global mode away and back from an unset opening filter clears the Apply `*`. In the desktop filter dialog, updating a preset saved unset to OR and then back to an explicit AND leaves Apply disabled. A test covers each and fails with the previous raw comparison.
- **Verification evidence**:
  - `v0.12.0` tag check: `git grep` at `v0.12.0` finds `/api/tag-editor/sync` only in the desktop `SyncTagCatalogAsync` and `SyncItemTagsAsync` definitions, which nothing calls, and in generated WebUI types. No v0.12.0 desktop or WebUI code posts to either route. The version gate does let a v0.12.0 client connect: v0.12.0 and this release both report API version `1`, minimum compatible `0`, and supported `["1","0"]`, and the WebUI's required capabilities are still offered. Removal proceeds because no client posted to either route.
  - `tagMatchMode` at `v0.12.0`: both clients send it. The v0.12.0 desktop and WebUI filter with it only in their client-side legacy tag filter for a catalog with no categories, which a catalog the app writes cannot reach. The v0.12.0 desktop filter summary also reads it, and the v0.12.0 WebUI derives it from `globalMatchMode`. The server reads named fields from the `filterState` JSON, so an extra field is ignored. A v0.12.0 client that reads a preset without the field falls back to AND.
  - `dotnet build ReelRoulette.sln` (0 errors, 0 warnings) and `dotnet test ReelRoulette.sln` passed: 137 desktop tests and 265 core tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed and exited 0.
  - CI run 36847737031 (`ci.yml`, push to `main` at `1b4c82e`) completed with success, including the `build-test-windows` job.
  - `npm run generate:contracts` removed only lines from `openapi.generated.ts`. `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passed: contracts up to date, typecheck, 133 tests, build, and build output check.
  - The route and session removals leave no reference in `src/` to the routes, `SyncTagCatalog`, `SyncItemTags`, `ApplySyncedTagCatalog`, `CatalogItemTagAssignment`, `ReplaceTagCatalog`, or the private helpers only they called. `EveryCatalogWritePath_KeepsUncategorized` keeps the new-catalog, category upsert, and Uncategorized delete-refusal checks. Its sync and replace steps went with those paths, which were the only writers that cleared the category table. WebUI tag save still posts `apply-item-tags` (`tagSave.ts`, `app.js`, `tagSave.test.ts`).
  - `TryMatchPreset_IgnoresTagMatchModeInSavedPresetText` (server), `SavedPresetTextWithTagMatchMode_MatchesTheSameFilter` (desktop), and the WebUI `filterStateModel` test match saved preset text that carries `tagMatchMode`. Putting the projection comparison back made all three server cases fail. Putting the field back on the desktop `FilterState` made both desktop cases fail. Keeping the field in the WebUI parser and serializer made the WebUI test fail. Each change was reverted.
  - `FilterSummaryFormatTests` covers global AND, OR, and unset. Making the summary always say "all", which is what reading the default `tagMatchMode` produced, made the OR case fail. That change was reverted.
  - `LoadSettingsWithSavedFilterTagMatchMode_KeepsTheFilterAndOtherSettings` loads a desktop settings file whose saved filter carries `tagMatchMode` or `TagMatchMode` and checks the other filter values and settings. Making `FilterState` refuse unknown fields made both cases fail. That change was reverted.
  - `TagFilter_ListQueryAndRandomEligibilityAgree_ForEveryTagShape` parses a filter that carries `tagMatchMode` as `1` and `"Or"` and gets the same AND result on the list query and random eligibility.
  - Desktop filter dialog Update Preset: a headless harness against a `git archive` of HEAD and against the working tree gave the same results, so this predates the milestone. In both, changing only the global mode in the dialog starred the heading and enabled Update. Reopening on a filter that differed from its preset, whether by the global mode or a tag, showed `Preset: P*` with Update disabled. `FilterDialogPresetUpdateTests` covers reopen after a global-only change in both directions, reopen after a tag change, an in-dialog global change and back, reopen then matching again (with the `CanUpdatePreset` change notification), and opening on the saved preset. Putting `CanUpdatePreset` back on the flag made all four reopen cases fail. Those tests read the dialog's properties and run with a headless Fluent theme.
  - Unset global mode: `TryMatchPreset_TreatsAnUnsetGlobalModeAsAnd` (server, missing and `null` stored modes against explicit AND, and unset against OR), `UnsetGlobalMode_EqualsAnExplicitAnd_ButNotOr` (desktop `FiltersEqual` and `Resolve`), `TogglingTheGlobalModeAwayAndBack_OnAPresetSavedUnset_ClearsTheStarAndUpdate` (headless desktop dialog), and the WebUI `filterStateModel` test for a desktop preset saved with `null`. Restoring the raw nullable comparison on the server made its three matching cases fail. Removing the desktop normalization made both desktop tests fail. Restoring the raw WebUI comparison made the WebUI test fail. Each change was reverted. The desktop dialog's `CheckAndSelectMatchingPreset` and Apply path now call `FiltersEqual` instead of comparing raw JSON. `TogglingTheGlobalModeAwayAndBack_FromAnUnsetOpeningFilter_LeavesApplyDisabled` (headless dialog) failed against the raw JSON pending check with `Apply*` after switching back, and passes now that the pending check compares with the opening filter through `FiltersEqual`.
  - Review fixes: the WebUI `filterStateModel` test for the Apply `*` after a toggle away and back from an unset opening filter failed with the helper written as the previous raw `JSON.stringify` comparison, and passes through `filterStatesEqualForPresetMatch`. `UpdatingAPresetSavedUnset_BackToAnExplicitAnd_LeavesApplyDisabled` (headless desktop dialog) failed against the raw preset-list JSON check with `Apply*` after the second update, and passes with `PresetsEqual`, which `PresetsEqual_ComparesNamesAndOrderExactly_AndFiltersWithFiltersEqual` covers. In `app.js`, the four sites that set the dialog's opening filter are the ones that set it before; the only other assignment to the working filter is loading a preset inside the dialog, which is meant to count as a change from the opening filter. After removing `SameFilterSnapshot` and its test, a repository search outside build output finds no reference to it.
  - Desktop test isolation: `AppDataManager` resolves the folder with `Environment.GetFolderPath(SpecialFolder.ApplicationData)`, which on Windows comes from the shell's Roaming AppData folder and ignores `APPDATA`, so a test-only `AppDataManager.UseDirectoryForTests` override is set from a module initializer instead of an environment variable. Settings, backups, and filter dialog bounds all resolve through that directory. `ClientLogRelay.DisableForTests` returns before any network call. `TestIsolationTests` asserts the settings and backup paths are under the test directory. Removing the override made it fail. A full desktop test run left the real `~/.config/ReelRoulette` listing unchanged.
  - `docs/api.md`, `CONTEXT.md`, `docs/domain-inventory.md`, and the testing checklist no longer describe the sync routes. `docs/api.md` says `filterState` has no `tagMatchMode` and preset match ignores it. The checklist has release items for the desktop summary and cross-client preset matching.
- **Deferrals / Follow-ups**:
  - Removing `library.json` file recognition and the JSON-to-SQLite importer, including `PrepareIncomingFromJson`, ships in v0.14.0. The import check and retire-aside for a leftover `library.json` stay until that removal.
  - Scrubbing every remaining `library.json` mention from product code, comments, user-facing copy, tests, and current-state docs follows that format removal.
  - Account and PIN tables stay with the account and PIN data model work.
  - Found while implementing: `FilterStateProjection.ToModel()` in the server preset-match code has no caller.
  - Found while implementing: the desktop server-preset parser returns the default filter when a saved filter cannot be parsed, without logging it.

### M10i19 - Drop the Unread Server Tag and Item Cache

- **Status**: ✅ Complete
- **Goal**: Stop loading a server-side tag and item cache that no live route reads, while v0.13.0 still migrates a leftover `library.json`.
- **Scope**:
  - Depends on: JSON-era leftovers that do not serve migration.
  - This ships in v0.13.0. Removing the client-authority sync routes follows this milestone and is the last milestone in that release.
  - Remove the server startup bootstrap of categories, tags, item tags, favorites, and blacklist.
  - Remove the readers that serve only that cache, and the private helpers that exist only to fill or read it. This includes the test-only server state readers `GetTagEditorModel`, `GetTagsSnapshot`, `GetTagCategoriesSnapshot`, and `GetLibraryStates`, and the uncalled `CreateTagCatalogPayload`.
  - The source list, source enable/disable, and the preset cache stay. `GET /api/sources` still reads the startup source list.
  - The startup test still checks sources loaded from SQL. It no longer reads categories, tags, item tags, favorites, or blacklist from server state.
  - Added during planning: remove the server list query's no-categories tag path, which no catalog the app writes can reach. This removes that branch, the category-count check before it in both the list query and random eligibility, and `Query_LegacyTagAnd_WhenCatalogHasNoCategories`, which seeded that shape with `DELETE FROM categories`.
  - Evidence for that removal covers every catalog the app can produce: tag include and exclude, global and per-category AND/OR, and Uncategorized tags, on both the list query and random eligibility, since they share the filter.
  - A hand-edited catalog with no categories then groups selected tags by the category id stored on each tag row, the same as any other catalog. Per-category and global modes apply. A selected tag that is not in the tag table forms its own group. `tagMatchMode` no longer applies. Selected tags in one group with no per-category mode match with AND, where that catalog previously honored `tagMatchMode = Or`.
- **Acceptance criteria**:
  - Server startup does not load categories, tags, item tags, favorites, or blacklist into server state.
  - The readers and private helpers that served only that cache are gone.
  - The source list, source enable/disable, and the preset cache stay. `GET /api/sources` still reads the startup source list.
  - No API route, control-plane endpoint, Operator UI path, tray path, or SSE event builder reads the removed state.
  - The startup test still checks sources loaded from SQL.
  - Startup still migrates a leftover `library.json`.
  - The list query and random eligibility have no no-categories tag path and no category-count check. A test shows every catalog write path the app uses leaves Uncategorized in place.
  - Tag include and exclude, global and per-category AND/OR, Uncategorized tags, and a tag that is not in the tag table give the same results on the list query and random eligibility, and those results match the expected items.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` (0 errors, 0 warnings) and `dotnet test ReelRoulette.sln` passed: 118 desktop tests and 267 core tests. `dotnet run --project ./src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj -- --verbose` passed and exited 0.
  - `ServerStateService` keeps sources, presets, and event publish and replay. Its startup reads only sources, through `LibraryCatalogSession.ReadStartupSources`. `ReadStartupState`, `CatalogStartupState`, and `CatalogStartupItem` are gone. A search of `src/` for the removed readers, fields, and `hasCategories` finds only `LibraryOperationsService` methods of the same name, which the routes and SSE builders in `ServerHostComposition` already call. The build shows nothing else references the removed members.
  - `Startup_LoadsSourcesFromTheCatalog` seeds `library.json`, checks that startup migrated it to `library.db` and `library.json.migrated`, and checks the source loaded from SQL. `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` still covers that migration.
  - `EveryCatalogWritePath_KeepsUncategorized` checks a new catalog, tag catalog sync with and without categories, tag catalog replace with nothing, and that deleting Uncategorized is refused. `Open_MissingUncategorizedCategory_IsAppended` covers migration. Removing the Uncategorized append from sync normalization made the test fail. Removing the Uncategorized delete refusal also made it fail. Both changes were reverted.
  - `TagFilter_ListQueryAndRandomEligibilityAgree_ForEveryTagShape` asserts the same expected items from `QueryList` and `QueryEligible` for include, exclude, include with exclude, global AND with mixed per-category modes, global OR with mixed per-category modes, Uncategorized tags with and without a per-category OR, a tag that is not in the tag table under global AND and OR, and `tagMatchMode = Or` leaving the result unchanged. Inverting the per-category OR check made it fail. Swapping the global joiner also made it fail. Both changes were reverted.
  - `CONTEXT.md`, `docs/domain-inventory.md`, and the testing checklist say server startup loads sources from catalog rows.
- **Deferrals / Follow-ups**:
  - Removing the client-authority sync routes is the next milestone and ends the v0.13.0 release.
  - Source import does not refresh the in-memory source list that `GET /api/sources` reads. That list stays filled at startup.
  - The JSON reader, the side-file copy, the import check and retire-aside for a leftover `library.json`, refuse strings, and the tests that seed through `library.json` stay until removal of `library.json` library support.
  - Account and PIN tables stay with the account and PIN data model work.
  - Candidate for the sync-route removal milestone, since both are contract changes: `tagMatchMode` is still in the filter contract. The server parses it, and preset matching compares it. Filtering no longer reads it. No visible desktop or WebUI control sets it on its own. The desktop filter dialog sets it only from hidden legacy radio buttons. The desktop main-window filter summary reads it to say "all" or "any". The WebUI sets it to mirror the global match selector. Desktop presets keep the default AND while WebUI presets with global OR store OR. So two saved presets that differ only in `tagMatchMode` do not match today, and would start matching once the field is removed.
  - Found while testing: `LibraryCatalogSession.ReplaceTagCatalog` has no production caller. Only tests call it.

### M10i18 - JSON-Era Leftovers That Do Not Serve Migration

- **Status**: ✅ Complete
- **Goal**: Remove JSON-era library code that does not read `library.json`, while v0.13.0 still migrates a leftover `library.json`. Import does not accept a `library.json` archive.
- **Scope**:
  - Depends on: catalog document removal.
  - This follows catalog document removal. It does not depend on the document work itself. Dropping the unread server tag and item cache follows this milestone. Removing the client-authority sync routes is the last milestone in the v0.13.0 release.
  - Remove the unused library-index file store. Settings JSON storage stays for core settings and desktop settings. Presets and thumbnail metadata are already in the catalog.
  - Remove the verification-only in-memory tag mutator and the verification check that only exists to call it. Remove `FilterSetBuilder` and the verification check that only exists to call it. The rest of that verification stays.
  - Remove the empty desktop tag-catalog sync method and the empty desktop item-tag sync method `SyncRequestedItemTagsToCore`.
  - Remove every server state method whose body only throws because mutation authority moved. Live routes stay on library operations.
  - Remove the desktop check that treats a full-catalog projection route as a live read, and the test that expects that route to count as one. That route is already gone.
  - The desktop library model drops the legacy flat tag list, the fingerprint index, and `LibraryIndex.Items`. Sources, categories, and tags on that model stay. The filter dialog drops the branch that reads that flat list, and the collection that only that branch fills.
  - Remove the unused desktop setting `LibraryGridViewEnabled`.
  - Comments that are not describing startup migration no longer mention `library.json`. Current-state docs that describe that migration still do.
  - Update the testing checklist line that says the filter dialog Tags tab shows per-category collapse toggles and the legacy flat tag model renders correctly. Update the checklist where the other leftovers were described.
  - Fix the `CONTEXT.md` repository map sentence that calls `ReelRoulette.LibraryArchive` zip export/import helpers. That project imports and exports a `library.db` checkpoint.
  - Final-state addition: remove the desktop `LibraryProjectionDisplayFilter`. It has had no caller since desktop browse moved to the list query, so its legacy flat-tag branch could not run either. Library filtering through categories is the server list query. Also remove the Core filter-request, filter-item, filter-source, and filter-tag types and the in-memory index, item, category, and tag types that only the removed builder and mutator used.
- **Acceptance criteria**:
  - The unused library-index file store, the verification-only tag mutator, `FilterSetBuilder` and its verification check, the empty desktop tag-catalog sync method, `SyncRequestedItemTagsToCore`, and the throw-only server state methods are gone. Core settings and desktop settings JSON storage is unchanged. The rest of that verification stays.
  - The desktop library model has no legacy flat tag list, no fingerprint index, and no item list. Sources, categories, and tags on that model stay. The filter dialog does not read a flat tag list.
  - `LibraryGridViewEnabled` is gone. An existing desktop settings file containing `libraryGridViewEnabled` still loads.
  - A full-catalog projection route is not treated as a live library read.
  - Comments that are not about startup migration do not mention `library.json`.
  - The testing checklist no longer says the legacy flat tag model renders correctly. `CONTEXT.md` does not call `ReelRoulette.LibraryArchive` zip export/import helpers.
  - Startup still migrates a leftover `library.json`. Import Library does not accept a `library.json` archive.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` (0 errors, 0 warnings) and `dotnet test ReelRoulette.sln` passed: 118 desktop tests and 265 core tests. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed with randomization and DTO mapping checks and exited 0.
  - A search of `src/` finds no library-index file store, tag mutator, `FilterSetBuilder`, filter-request types, empty desktop sync methods, throw-only server state methods, full-catalog path check, `LibraryProjectionDisplayFilter`, legacy flat tag list, or fingerprint index. `LibraryGridViewEnabled` appears only as the key in the settings-load test. Nothing under `src/` assigns or deserializes the desktop `AvailableTags` before removal, so the filter dialog branch that read it could not run.
  - `LoadSettingsWithRetiredGridViewKey_KeepsTheOtherSettings` loads a desktop settings file with `LibraryGridViewEnabled` or `libraryGridViewEnabled` and keeps the other values. Marking the settings type to reject unknown members made both cases fail, then that change was reverted.
  - `Query_FilterMatchesPanelRules_ForTagsDurationAndPhotos` covers tag filtering through categories on the server list query. `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` and `Open_PartialDatabase_QuarantinesAndLaterOpenMigratesPreservedJson` still migrate a leftover `library.json`. `Import_RejectsALibraryJsonDocument_AndLeavesTheLiveCatalog` still rejects a `library.json` import.
  - `library.json` remains only in the catalog store's startup migration and in tests that seed through it.
  - `docs/checklists/testing-checklist.md` no longer says the legacy flat tag model renders correctly. No other checklist item described these leftovers. `CONTEXT.md` describes `ReelRoulette.LibraryArchive` as `library.db` checkpoint import/export helpers and still describes startup migration of a leftover `library.json`.
- **Deferrals / Follow-ups**:
  - Dropping the unread server tag and item cache is the next milestone, still in v0.13.0.
  - Removing the client-authority sync routes ends the v0.13.0 release.
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0.
  - Scrubbing every remaining `library.json` mention from product code, comments, user-facing copy, tests, and current-state docs follows that format removal.
  - Renaming `LibraryProjectionItem` and the WebUI `libraryProjection*` modules is not planned.
  - Account and PIN tables stay with the account and PIN data model work.
  - Follow-up candidate for the v0.13.0 cleanup: the server list query's no-categories tag path, covered by `Query_LegacyTagAnd_WhenCatalogHasNoCategories`, cannot be reached by a catalog ReelRoulette writes. An empty catalog, `library.json` migration, tag catalog sync, and tag catalog replace all ensure Uncategorized, and deleting Uncategorized is refused. Schema 1 never shipped, and its writer also ensured Uncategorized. Only a `library.db` edited outside the app reaches it. Removing it would remove that branch, the category-count check before it, and that test. A hand-edited catalog with no categories would then filter selected tags as one Uncategorized group.
  - `docs/full-audit.md` and `docs/migration-cleanup.md` are report-only audits and still cite `FilterSetBuilder` and `TagMutationService`.

### M10i17 - Catalog Document Removal

- **Status**: ✅ Complete
- **Goal**: Stop using the catalog document for live reads and writes in v0.13.0, while keeping startup migration of a leftover `library.json` so an old library can still be migrated.
- **Scope**:
  - Depends on: catalog schema version 2.
  - JSON-era leftovers that do not serve migration follow this milestone and end the v0.13.0 release.
  - Tag catalog sync and item-tag sync update catalog rows directly. They do not load or diff the full catalog document.
  - Server startup loads sources, tags, item tags, and favorite and blacklist item state with SQL. It does not build the catalog document.
  - The library reload after import uses that same SQL load, or that reload is removed. It does not build the catalog document.
  - Remove the catalog document builder and the full-document save path.
  - The JSON-to-SQLite importer stays for startup migration of a leftover `library.json`, including the preset and thumbnail-index copy from catalog schema version 2. Startup still migrates a leftover `library.json` once. Import Library does not accept a `library.json` archive. An empty database may still be created through that importer.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Tag catalog sync and item-tag sync persist without loading or diffing the full catalog document.
  - Server startup loads favorite and blacklist item state without building the catalog document.
  - Library reload does not build the catalog document.
  - There is no catalog document builder and no full-document save path.
  - A missing `library.db` still migrates `library.json`. Import Library does not accept a `library.json` archive.
  - Docs and the testing checklist describe live catalog reads and writes as row operations, describe the tag table as the only tag list, and still describe startup migration of a leftover `library.json`.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed. `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose` passed.
  - Tests cover tag catalog sync and item-tag sync as row writes: trimmed names, blank names skipped, the earlier category kept unless it is Uncategorized, Uncategorized forced, last-wins on a duplicate category id, tags stored in name order, no revision bump when the stored rows already match, a removed catalog tag losing its item assignments, an item tag that was never in the tag table staying, a catalog spelling change from `Night` to `NIGHT` updating the item assignment, and an item that already holds both spellings keeping one row. Item-tag sync matches catalog id or full path, returns false when none match, and does not bump revision when the stored tags already match. Server startup loads sources, categories including Uncategorized, item tags, favorite, and blacklist from SQL, and the in-memory item id is the file path. The catalog document builder and the full-document save path are removed, and the unused library reload is removed. `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` still migrates a leftover `library.json`. A file whose body is a `library.json` object is rejected by the catalog file check and by Import Library, and the live catalog stays.
  - `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, and `docs/checklists/testing-checklist.md` describe live catalog reads and writes as row operations, describe the tag table as the catalog's tag list, and still describe startup migration of a leftover `library.json`. The `[Unreleased]` library-catalog changelog bullet includes the same outcome.
- **Deferrals / Follow-ups**:
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0.
  - Unused JSON-era types, desktop fields, and comments that do not serve startup migration are the next milestone, still in v0.13.0.
  - Account and PIN tables stay with the account and PIN data model work.
  - An item can still hold a tag name that is not in the tag table. The tag table is the catalog's tag list. That does not require every name stored on an item to be in that list.
  - Source import does not refresh the in-memory source list that `GET /api/sources` reads. That list is filled at startup. This is pre-existing and is not fixed here.
  - Ordinal path identity on Linux is recorded in the backlog item of that name. This milestone does not change path casing.
  - Removing `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags` needs its own contract decision. Those routes stay.

### M10i16 - Catalog Schema Version 2

- **Status**: ✅ Complete
- **Goal**: Move presets and thumbnail metadata into the catalog, drop the legacy available-tags list, and open every database at schema version 2 in one migration.
- **Scope**:
  - Depends on: refresh column updates.
  - This ships in v0.13.0, before catalog document removal. JSON-era leftovers that do not serve migration still end that release.
  - One migration runs before the health check. A schema 1 database is migrated in place. A corrupt database is still quarantined and startup still refuses it. The health check does not treat schema 1 as corrupt.
  - The schema version is the integer already stored in SQLite `PRAGMA user_version`. The code constant stays `SchemaVersion`. There is no second version key in `catalog_meta`. After this milestone the version is 2.
  - Opening a schema 1 database drops `available_tags` and the `available_tags_present` flag, adds a presets table, and adds thumbnail revision, width, and height on `items`. Existing rows in `tags` stay as they are. `generatedUtc` is not stored.
  - That same open copies `presets.json` and the thumbnail index into the catalog. The thumbnail index lives in the local cache directory, not beside `library.db`, and the migration is given that directory. The schema version is set only after the schema change and that copy have committed, in the same transaction as a flag that the copy finished. `presets.json` and `index.json` are then renamed to `presets.json.migrated` and `index.json.migrated`. A crash after the commit and before those renames does not copy them again; the next open only finishes the rename.
  - A missing `presets.json` or thumbnail index leaves presets or thumbnail columns empty. A file that cannot be parsed does the same and does not quarantine the catalog.
  - A new database, including an empty one and one created by migrating `library.json`, is created at schema version 2. It does not create `available_tags` or `available_tags_present`, and it does not create schema 1 and then migrate. That `library.json` migration also copies `presets.json` and the thumbnail index. The importer ignores `availableTags`. A name that appears only in that list is not stored.
  - The catalog document builder omits `availableTags` and does not query the dropped table. Removing that builder stays with catalog document removal.
  - Preset reads and writes use the catalog table. Tag rename and delete still update presets. `core-settings.json` and `desktop-settings.json` stay JSON.
  - Thumbnail revision, width, and height are read from the item row. The stored revision is the revision the JPEG was built for, and the thumbnail stage still reuses a JPEG when that revision matches the item fingerprint, size, and write time. The thumbnail stage writes that item's revision, width, and height as the item finishes, including a dimension fill when the revision already matches. It does not hold those columns until the stage ends. A favorite, tag, blacklist, or playback change that commits during the stage stays. A cancel leaves thumbnail columns already written. Browse no longer reads `index.json`. `hasThumbnail` is still whether that item's JPEG exists. The JPEG files stay in the local thumbnail directory. `generatedUtc` is not written.
  - At the end of the thumbnail stage, JPEG cleanup lists the thumbnail directory. A `{itemId}.jpg` whose id is not in the catalog is deleted, including files that were never listed in `index.json` and files left from a catalog this run did not remove item by item. `index.json` and `index.json.migrated` are left in place. The server reports progress as it deletes them. Opening the catalog does not scan the thumbnail directory. A cancel before that cleanup finishes leaves the remaining files for the next thumbnail stage that completes. An item removed by source refresh still loses its thumbnail metadata and JPEG.
  - Export, import, and catalog backup copy the whole database, so presets and thumbnail revision and dimensions travel with `library.db`. JPEG files do not. Import replaces the destination preset list. Local JPEGs for item ids that are not in the imported catalog stay until the next thumbnail stage completes. Docs and instructions recommend a refresh after import so those thumbnails are generated and the previous JPEG files are removed.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - A schema 1 database opens at schema version 2 with `available_tags` and `available_tags_present` gone, with presets loaded from `presets.json`, and with thumbnail revision, width, and height loaded from the thumbnail index. Existing tags are unchanged. `generatedUtc` is not stored.
  - A crash after that commit and before the side files are renamed does not import them a second time.
  - A missing or unreadable `presets.json` or thumbnail index does not refuse the database. Presets or thumbnail columns stay empty.
  - A new database, including an empty one and one migrated from `library.json`, is schema version 2, has no `available_tags` table, and includes presets and thumbnail metadata from those side files when they are present. A name that appears only in `availableTags` is not stored. The rest of that library still migrates.
  - A corrupt database is still quarantined.
  - The catalog document builder does not read `available_tags`.
  - Preset save, tag rename, and tag delete persist in the catalog table. Core settings and desktop settings stay in their JSON files.
  - Browse thumbnail dimensions come from the item row. The thumbnail stage persists that item's revision, width, and height as the item finishes, including a dimension fill when the revision already matches. A favorite, tag, blacklist, or playback change committed during the stage is still present afterward. A cancel keeps thumbnail columns already written. At the end of the thumbnail stage, a JPEG whose item id is not in the catalog is deleted, including after import replaces the catalog, and the server reports progress during that cleanup. Opening the catalog does not delete those files. A cancel before that cleanup finishes leaves them for the next thumbnail stage that completes. JPEG files are not part of export or import.
  - Export and import include presets. Import replaces the destination preset list.
  - Docs and the testing checklist describe schema version 2, presets and thumbnail metadata in the catalog, local JPEG files, a refresh after import to generate thumbnails and remove JPEGs that are not in the imported catalog, and core settings remaining in `core-settings.json`.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — 0 warnings, 0 errors. `dotnet test ReelRoulette.sln` — pass (Core.Tests 256, DesktopApp.Tests 115).
  - `LibraryCatalogSchema2Tests`: `Open_Schema1_MigratesPresetsAndThumbnailMetadata` opens a schema 1 database at schema version 2, drops `available_tags` and `available_tags_present`, keeps the existing tag, copies the preset and thumbnail revision, width, and height, stores a non-positive width as null, stores no `generatedUtc` column, renames the side files, and builds a document with no `availableTags`. `Open_CrashAfterSideFileCopy_DoesNotCopyAgain` keeps the first copy when the side files change before the rename finishes. `Open_MissingOrUnreadableSideFiles_DoesNotRefuse` opens with empty presets and thumbnail columns. `Open_WithoutThumbnailDirectory_LeavesSchema1` leaves schema 1 in place. `PublishIncoming_LeavesSchema1_UntilTheNextOpen` publishes a schema 1 export still at version 1, and the next open migrates it. `Open_DoesNotDeleteThumbnailFiles` leaves an orphan JPEG. `WriteCheckpoint_IncludesPresetsAndThumbnailColumns_AndNotJpegBytes` copies the preset and thumbnail columns and not the JPEG bytes.
  - `LibraryCatalogStoreTests`: `Open_MigratesLibraryJson_IncludingStringEnumsNumericDurationAndAvailableTags` creates schema version 2 with no `available_tags` table and does not store a name that appears only in `availableTags`. `Open_EmptyDirectory_CreatesEmptyDatabase` creates schema version 2 with no `available_tags` table. `Open_CorruptRowPage_QuarantinesAndLeavesLibraryJson` still quarantines a corrupt database.
  - `LibraryCatalogSessionTests.BuildDocument_UsesIntegerEnumsAndHourDuration_OmitsThumbnailsAndFingerprintIndex` builds a document with no `availableTags`.
  - `ServerStateRegressionTests.RenameTagInPresetCatalogOnly_ShouldRenameSelectedAndExcludedTags` reloads a renamed preset from the catalog, deletes that tag from the preset, writes `core-settings.json`, and does not write `presets.json` or `desktop-settings.json`.
  - `RefreshPipelineServiceTests`: `EnrichListedItems_UsesRowDimensionsAndJpegExistence` uses row dimensions and JPEG existence. `ThumbnailStage_ShouldWriteIndexMetadataObject` and `ThumbnailStage_ShouldBackfillLegacyStringIndexEntry` persist revision, width, and height as the item finishes, including a dimension fill. `ThumbnailStage_PreservesFavoriteTagBlacklistAndPlaybackDuringTheWrite` keeps a favorite, tag, blacklist, and playback change committed during the write. `ThumbnailStage_CancelKeepsColumnsAlreadyWritten_AndLeavesRemainingCleanup` keeps columns already written, reports thumbnail cleanup progress, and leaves a remaining JPEG when cleanup is cancelled. `ThumbnailStage_RemovesDeletedItemThumbnail_AndKeepsLibraryThumbnails` deletes a JPEG whose item is not in the catalog, including one never listed in `index.json`, and leaves `index.json` in place.
  - `CONTEXT.md`, `docs/architecture.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/dev-setup.md`, `docs/feature-migration.md`, and `docs/checklists/testing-checklist.md` describe schema version 2, presets and thumbnail metadata in the catalog, local JPEG files, a refresh after import, and core settings remaining in `core-settings.json`.
- **Deferrals / Follow-ups**:
  - Catalog document removal follows this milestone and still removes the document builder.
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0. That removal does not remove the schema 1 migration. After that removal, a missing database does not read `presets.json` or the thumbnail index.
  - Account and PIN tables stay with the account and PIN data model work. They extend the schema version rather than replacing this catalog schema.

### M10i15 - Refresh Column Updates

- **Status**: ✅ Complete
- **Goal**: Make each refresh stage write only its own columns as work completes, so a long stage no longer diffs a full catalog snapshot, and so unchanged thumbnails are not revisited file by file.
- **Scope**:
  - Depends on: library catalog export and import cutover.
  - Source refresh, fingerprint, duration, and loudness write the columns that stage owns as work completes. They do not load a snapshot at the start and diff it back at the end.
  - A tag, favorite, blacklist, or playback change that commits during a stage is still present when the stage finishes. The stage does not write those columns.
  - Source refresh still adds, removes, renames, and updates item identity. Missing files are still removed here, not by folder import.
  - The thumbnail stage reads the rows it needs without building the full catalog document. It treats a stored thumbnail revision that still matches the item's fingerprint, size, and write time as current, the same way duration and loudness trust a stored result. It does not stat those source files again. Fingerprint still notices a size or write-time change and updates the fingerprint, which changes the revision.
  - Generate a thumbnail when the item is new, that stored revision differs, or the JPEG is missing. Remove the index entry and JPEG for an item the source stage removed.
  - Remove the thumbnail file-count and byte caps. Every item still in the library keeps its thumbnail. The stage does not delete JPEGs to get under a size or count limit, and it does not stat every JPEG to measure one.
  - Refresh does not load or diff the full catalog document. Tag catalog sync, item-tag sync, and server startup still do, until catalog document removal.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - A refresh run persists source, fingerprint, duration, and loudness changes without loading or diffing a full catalog snapshot.
  - A tag, favorite, or playback change committed during a stage is still present after that stage writes.
  - Source refresh still adds, removes, and renames items. Folder import still does not remove missing files.
  - The thumbnail stage does not build the full catalog document.
  - A refresh where every thumbnail revision still matches does not stat those source files. A new item, a changed revision, or a missing JPEG still generates. An item removed by source refresh loses its thumbnail index entry and JPEG.
  - There is no thumbnail file-count or byte cap. A refresh does not delete thumbnails for items still in the library, and it does not stat every JPEG to enforce a cap.
  - Refresh no longer has a full-document write path. Tag catalog sync and item-tag sync still do, until catalog document removal.
  - Docs and the testing checklist describe refresh as column updates, including thumbnail reuse without a full file walk and no file-count or byte cap.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — 0 warnings, 0 errors. `dotnet test ReelRoulette.sln` — pass (Core.Tests 246, DesktopApp.Tests 115).
  - `dotnet test src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj --filter FullyQualifiedName~RefreshPipelineServiceTests` — 26 passed. `Refresh_PersistsStageColumnsWithoutBuildingTheCatalogDocument` adds and removes a source file and stores fingerprint, duration, and loudness with `DocumentBuilds` unchanged. `FingerprintStage_PreservesFavoriteAndTagCommittedDuringTheWrite` keeps a favorite and tag committed during the fingerprint write. `ThumbnailStage_ReusesMatchingRevisionWithoutTheSourceFile` reuses a matching revision when the source file is absent. `ThumbnailStage_GeneratesWhenJpegIsMissing` generates a missing JPEG. `ThumbnailStage_RemovesDeletedItemThumbnail_AndKeepsLibraryThumbnails` removes a deleted item's thumbnail and keeps one for an item still in the library, with no eviction count. Existing thumbnail tests still regenerate on a changed revision and generate for a new item. `SourceRefresh_ShouldReconcileMovedFile_ByFingerprintWithoutAddRemove` still renames by fingerprint. `ImportSource_UpdatesRowsWithoutBuildingTheCatalogDocument` still leaves a missing file in place.
  - `LibraryOperationsServiceTests`: `DeferredCatalogWrites_CheckpointTheLatestRowsAfterRelease` keeps the startup backup unchanged while catalog writes are deferred, then checkpoints the latest play count after release. `RecordPlayback_WhenBackupGapIsShortened_CreatesACheckpoint` applies a shorter gap on the next save. `RecordPlayback_WhenANewerBackupCannotBeOpened_UsesTheHealthyBackupAge` still checkpoints when the newest healthy backup is outside the gap and a newer file cannot be opened.
  - `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, and `docs/checklists/testing-checklist.md` describe refresh column updates, thumbnail reuse without a source walk, and no thumbnail file-count or byte cap.
- **Deferrals / Follow-ups**:
  - Account and PIN tables stay with the account and PIN data model work.
  - Tag catalog sync, item-tag sync, and the server startup read of the catalog document are the next milestone, still in v0.13.0.
  - Removing `library.json` file recognition and the JSON-to-SQLite importer ships in v0.14.0.

### M10i14 - Library Catalog Export and Import Cutover

- **Status**: ✅ Complete
- **Goal**: Re-enable library export, import, and catalog backups as a live SQLite `library.db` checkpoint, and deprecate `library.json` library files with removal of startup migration planned for v0.14.0.
- **Scope**:
  - Depends on: source folder import row updates.
  - Re-enable desktop Library Export / Import and server catalog backups that were disabled after the SQLite store landed.
  - Export and import move only `library.db`. The server produces the checkpoint while it has that file open. The desktop asks for a destination, then saves that checkpoint. It is not a zip, not a raw copy of an open WAL file, and not leftover `library.json`. Presets, settings, thumbnails, and backups stay in their own files.
  - Import Library restores that checkpoint by replacing the live SQLite catalog, with remap/skip for sources. Keep the server-stopped acknowledgment, because the desktop replaces the database file. The replacement is written to a temporary file, checkpointed so it does not depend on a WAL sidecar, then published by rename. The previous `library.db` stays aside until the new file is in place and opens. A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed. A file that is not a library database is rejected. A `library.json` archive is not imported.
  - The import confirmation names the library catalog. It does not say the import replaces presets, settings, thumbnails, backups, or `library.json`. An existing `library.db` counts as library data unless a successful read shows it has no sources and no items. A folder that still has only `library.json` with sources or items asks for the same confirmation, and a successful import renames that file aside.
  - v0.13.0 deprecates `library.json` as a library format. It is not the live catalog, not an export, and not a backup. There is no JSON dump action. Startup may still migrate a leftover `library.json` once when `library.db` is missing. v0.14.0 removes that startup migration and the JSON-to-SQLite importer.
  - Server catalog backups use the same server-produced checkpoint, not leftover JSON. The copy runs after the save returns. A failed copy is discarded. A backup that cannot be opened is left in place.
  - Update testing checklist and current-state docs for database-file export and import, catalog backups, and the v0.13.0 deprecation with removal of startup migration planned for v0.14.0.
- **Acceptance criteria**:
  - Export saves a usable SQLite checkpoint of the live library. Import Library can restore that file into the live catalog and remap source folders.
  - Import Library still requires the server-stopped acknowledgment before it replaces the live database.
  - An interrupted replace leaves the previous catalog or the finished incoming file, and does not leave a partial `library.db` or an empty catalog.
  - Import rejects a file that is not a library database, including a `library.json` archive, and does not replace the live catalog.
  - Export does not read `library.json` from disk. There is no JSON dump action. Presets, settings, thumbnails, and backups are not part of the transfer.
  - The import confirmation names the library catalog. An unreadable `library.db`, or a leftover `library.json` that still has sources or items, asks before replace. A successful import renames that `library.json` aside.
  - Server catalog backups capture the live SQLite catalog.
  - Docs and the testing checklist describe `library.db` export and restore, deprecated `library.json` library files, and removal of that startup migration in v0.14.0, without treating `library.json` as the live store.
- **Verification evidence**:
  - `dotnet test ReelRoulette.sln` — pass (Core.Tests 238, DesktopApp.Tests 115).
  - `LibraryCatalogStoreTests`: a checkpoint includes a committed favorite and has no WAL sidecar. An interrupted replace restores the previous catalog. A published incoming file is kept and the previous file is removed on the next open. A finished incoming file is promoted when no previous catalog exists. A partial incoming file does not replace a healthy catalog. An unusable live file is restored from the previous catalog. A failed checkpoint copy deletes its destination. A file that is not a database is not a usable catalog.
  - `LibraryArchiveMigrationTests`: import restores a remapped source and item path, including a `..` segment that stays inside the chosen folder. A file that is not a library database is rejected and does not create `library.db`. An unreadable `library.db` asks for confirmation and is not replaced until that confirmation. A leftover `library.json` with items asks for confirmation, and a successful import renames it to `library.json.migrated`. A failure while discarding the previous catalog leaves the imported database in place. The overwrite confirmation names the library catalog.
  - `LibraryOperationsServiceTests`: opening the service writes a `library.db.backup.*` checkpoint and does not write `library.json.backup.*`. When the backup gap has elapsed, playback writes a checkpoint of the updated play count and does not trim leftover JSON backups. A recent SQLite backup skips another create. Leftover `library.json.backup.*` files stay in place. A backup that is not a database is removed. A backup that cannot be opened is left in place.
  - Current-state docs and the testing checklist describe `library.db` export and restore, deprecated `library.json` library files with startup-migration removal planned for v0.14.0, and SQLite catalog backups.
- **Deferrals / Follow-ups**:
  - Account/PIN persistence in SQLite is deferred to the account and PIN data model work.
  - Presets, core settings, and desktop-settings remain on their current files.
  - Running-server import, Operator export/import, and removal of the desktop Library Export / Import menus are deferred to Operator library catalog transfer. That transfer is a `library.db` checkpoint. It ships with the later account and Operator milestones, in the release after the SQLite store/query sequence.
  - Refresh stays on the full-document adapter until refresh column updates.
  - Removing the one-time startup migration from `library.json`, and the JSON-to-SQLite importer, is deferred to removal of `library.json` library support. This milestone deprecates that file and does not remove the startup migration.

### M10i13 - Source Folder Import Row Updates

- **Status**: ✅ Complete
- **Goal**: Add or refresh a media folder with row inserts and updates, without holding the catalog lock across the disk walk or loading the full catalog document.
- **Scope**:
  - Depends on: desktop full-catalog projection removal.
  - Enumerate the folder outside the catalog lock. Then insert new items and update existing ones in one transaction.
  - Match existing items by path. Keep their id, tags, favorite, blacklist, and playback stats. New files get new rows. Report the same imported and updated counts as today.
  - Do not remove items that are missing on disk. That stays with refresh.
  - Do not build or diff the full catalog document.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Importing a folder persists new and updated items in SQLite and does not load or diff the full catalog document.
  - The disk walk does not hold the catalog lock, so browse is not blocked for the whole scan.
  - An existing item matched by path keeps its id, tags, favorite, blacklist, and playback stats.
  - Items missing on disk are not removed by this import.
  - Docs and the testing checklist describe folder import as a row update.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass (Core.Tests 222, DesktopApp.Tests 121). A new file is inserted. An existing path keeps its id, tags, favorite, blacklist, playback stats, fingerprint, and duration, and updates source, relative path, file name, and media type. A file missing on disk stays. The import does not build the catalog document, and a second unchanged import does not bump the revision. Browse returns while enumeration is still blocked.
  - Manual: importing `/mnt/nas/multimedia/TV` inserted 902 files. Library browse kept answering during that scan, and a query after the import returned the new total.
  - `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased] describe folder import as a row update.
- **Deferrals / Follow-ups**:
  - Refresh stays on the full-document adapter until refresh column updates.
  - Catalog export, import, and backups stay with the library catalog export and import cutover.

### M10i12 - Desktop Full-Catalog Projection Removal

- **Status**: ✅ Complete
- **Goal**: Stop desktop from downloading the full catalog at startup and on resync, and remove that endpoint once nothing calls it.
- **Scope**:
  - Depends on: auto-tag and duplicate scans.
  - Desktop connect and resync do not call the full-catalog projection endpoint. WebUI already does not call it.
  - Header video and photo counts come from library stats. Source names in the filter summary come from the sources API. Tag and category lists for the filter and tag editor come from the tag catalog, not from a full item download.
  - Now-playing tags, favorite, blacklist, and playback stats come from the loaded tile or a single-item read. The loudness baseline is a server aggregate that preserves the current baseline, not a scan of a local item replica.
  - Scoped auto-tag scan does not rebuild a path list from a local item replica.
  - Remove the full-catalog projection endpoint once desktop has stopped calling it. Thumbnail layout fields stay on list query.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Desktop connect and resync do not download the full catalog. WebUI still does not.
  - Header counts, source names, tag and category lists, now-playing tags, and the loudness baseline still match current behavior.
  - The full-catalog projection endpoint is removed. List query still returns thumbnail layout fields.
  - Docs and the testing checklist no longer describe that endpoint as a client read.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass (Core.Tests 220, DesktopApp.Tests 115). The catalog test covers the 75th-percentile loudness baseline, including a video on a disabled source, and a single-item read by id and path that does not build the catalog document. Desktop tests lock connect and resync to library stats, sources, and the tag catalog, and lock the one-item read off the removed projection path. List-query thumbnail enrichment still has its own test. A playback event for a file that is not yet playing does not paint the current-file section; starting that file does. `npm run generate:contracts` regenerated the WebUI client from OpenAPI.
  - Manual: desktop startup and a resync on a large library did not download the full catalog. Header counts, now-playing tags, and loudness normalization still matched. The current-file section updates when that file starts, including a library-grid play whose playback event arrives first.
  - Current-state docs and the testing checklist no longer describe the projection endpoint as a client read. `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i11 - Auto-Tag and Duplicate Scans

- **Status**: ✅ Complete
- **Goal**: Run auto-tag scan, duplicate scan, and duplicate apply without loading the full catalog document.
- **Scope**:
  - Depends on: catalog stats and item-state reads.
  - Auto-tag scan matches tags to items without building the catalog document. `scanFullLibrary: true` still scans every item and ignores a path list. `scanFullLibrary: false` with no list still scans enabled sources only. An explicit list still matches full paths.
  - Duplicate scan groups items whose fingerprint status is ready and whose fingerprint is set, without building the catalog document. Pending, failed, and stale fingerprints stay excluded. A missing fingerprint status is not treated as ready.
  - Duplicate apply removes the non-kept items from the catalog with the existing item delete and still deletes those files on disk. It does not load the full catalog document. The kept item stays.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Auto-tag scan, duplicate scan, and duplicate apply do not load or diff the full catalog document.
  - Auto-tag scan scope matches today's full-library, enabled-source, and explicit-path rules.
  - Duplicate groups are ready fingerprints only. Pending, failed, and stale stay excluded. A missing fingerprint status is not treated as ready.
  - Duplicate apply deletes the non-kept files and catalog rows and leaves the kept item in place.
  - Docs and the testing checklist describe these scans as query-backed.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 219, Desktop 115). `ScanAutoTags_ScopeFollowsFullLibraryFlagAndPathList`: enabled sources return the filename match, the already-tagged file, and the relative-path match; a differently cased path matches that full path; full-library scan ignores the path list and includes a disabled source and an unknown source; the document build count stays put. `ScanAutoTags_WhenNoEnabledSourcesAndNoList_ScansNothing` returns no rows and does not build the document. `ScanDuplicates_HonorsIntegerFingerprintStatus`: one ready pair is grouped with favorite, play count, and tag count; pending, failed, and stale are excluded; two items with a fingerprint and no status are not grouped; the document build count stays put. `ScanDuplicates_ScopeFollowsCurrentSourceAndEnabledSources`: current source and enabled sources return the enabled pair and that source's pending exclusion; all sources also return the disabled pair and its stale exclusion; the document build count stays put. `ApplyDuplicateSelection_ShouldPersistRemovedItems_AndKeepProjectionParity`: a missing keep id deletes nothing; apply deletes the other file and row, reports a missing file and leaves that row, leaves the kept file and its favorite flag, and does not build the document.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - The desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i10 - Catalog Stats and Item-State Reads

- **Status**: ✅ Complete
- **Goal**: Answer library stats and item-state reads with SQL so they do not load the full catalog document.
- **Scope**:
  - Depends on: random selection from the catalog query.
  - Library stats, including global totals and per-source totals, are SQL aggregates. The figures stay the ones clients already show.
  - An item-state read returns only the requested paths and does not load the full catalog document. An empty path list returns no items.
  - WebUI resync stops posting an item-state read with an empty path list and discarding the body.
  - Leave auto-tag scan, duplicate scan, and the desktop full-catalog download on their current paths.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Library stats match the current global and per-source figures and do not load the full catalog document.
  - An item-state request returns only the requested items. An empty path list returns no items and does not load the catalog.
  - WebUI resync does not call item-state with an empty path list.
  - Docs and the testing checklist describe stats and item-state as scoped reads.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 218, Desktop 115). `GetLibraryStats_ShouldAggregateGlobalAndPerSourceTotals` and `GetLibraryStats_ShouldHandleLegacyMediaTypeAndMissingSourceId` still match the current global and per-source figures, including a missing source id matched by path, and the catalog document build count stays put. `GetLibraryStatsAndItemStates_MatchCurrentFiguresWithoutBuildingTheCatalogDocument`: a 120.5 second duration counts as 120 whole seconds (total 180, average 90), a negative play count is ignored, a stored media type other than video or photo follows the file extension, an item-state read returns only the requested path, an empty or blank list returns nothing, and the document build count stays put until an explicit document read. WebUI `sseClient` test: resync syncs refresh status and does not request `/api/library-states`. WebUI unit tests 129 passed. OpenAPI contracts regenerated and the freshness check passed.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.
  - The loudness baseline stays on the desktop full-catalog download until that download is removed.

### M10i9 - Random Selection from the Catalog Query

- **Status**: ✅ Complete
- **Goal**: Choose random and play eligibility through the list-query filter so a catalog revision does not reload the full library into memory.
- **Scope**:
  - Depends on: favorite, blacklist, and playback row updates.
  - Random selection loads the eligible set through the same server filter as library list query. It does not keep a full-catalog cache that rebuilds when the revision changes.
  - The current weighting still runs on that eligible set. An empty eligible set still returns no item.
  - Playing one item reads that item and its source state by id or path. It does not read the rest of the catalog.
  - Eligibility stays server-authoritative. Clients do not gain a local eligibility replica.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - A random draw after a favorite, playback, or tag change does not build the full catalog document.
  - Eligible items for a draw match library list query for the same filter, enabled sources, and media-type options.
  - The current weighting still chooses among that eligible set. An empty eligible set still returns no item.
  - Playing one item reads that item only.
  - Docs and the testing checklist describe random and play eligibility as query-backed.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 217, Desktop 115). `QueryEligible_MatchesListQuery_ForFilterEnabledSourcesAndMediaType`: eligible ids match list query for the same favorites and tag filter, a disabled source and an unknown source stay out, and video or photo options match the list media-type filter. The catalog document build count stays put. `ReadPlaybackItem_ReadsThatItemAndSource_ByIdOrPath_WithoutBuildingTheCatalogDocument`: id or path returns that item, a disabled source is disabled, a missing source row stays enabled, and the document build count stays put. `TrySelectRandom_AfterFavoritePlaybackAndTagChange_DoesNotBuildTheCatalogDocument`: a draw after a favorite, a playback, and a tag change does not build the catalog document, and play plus media lookup by id or path do not either. `TrySelectRandom_WeightedRandom_PrefersNeverPlayedItemInTheEligibleSet`: weighted draws stay inside the list-query set and prefer the never-played item. An empty eligible set still returns no item. A library with no items still returns 503.
  - Manual random draw on a large library immediately after a playback passed. The response came back immediately, and playing one item still started that item.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Library stats, item-state reads, auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i8 - Favorite, Blacklist, and Playback Row Updates

- **Status**: ✅ Complete
- **Goal**: Make favorite, blacklist, playback recording, and clear-stats SQLite row updates so they do not stall on a full-catalog load.
- **Scope**:
  - Depends on: responsive tag apply.
  - Move favorite, blacklist, record-playback, and clear-stats onto the existing single-row catalog updates. Resolve the item by catalog id or full path, as current clients already send.
  - A favorite still clears blacklist, and a blacklist still clears favorite.
  - Clear-stats with no path list clears every row that has a play count or last-played time in one update. A path list clears only those items.
  - Publish the same item-state and playback events as today. Do not build or diff the full catalog document for these operations.
  - Leave the playback catalog cache, library stats, auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, and refresh on their current paths.
  - Update the testing checklist and current-state docs.
- **Acceptance criteria**:
  - Setting a favorite, setting a blacklist flag, recording a playback, and clearing playback stats persist in SQLite and do not load or diff the full catalog document.
  - A favorite still clears blacklist, and a blacklist still clears favorite.
  - Clearing stats with an empty path list clears played items across the library. A path list clears only those items.
  - Other clients still receive the item-state and playback events and update the loaded window the same way they do today.
  - Docs and the testing checklist describe these as row updates.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 211, Desktop 115). `FavoriteBlacklistAndPlayback_PersistByIdOrPath_WithoutBuildingTheCatalogDocument`: favorite and blacklist persist by catalog id or full path, a favorite clears blacklist, a blacklist clears favorite, repeating the same flag does not bump the catalog revision, record-playback increments and stops at the maximum play count, a list that matches nothing clears nothing, a path list clears only those items, and an empty list clears every played row including a last-played time with no play count. The catalog document build count stays put until an explicit document read. `FavoriteBlacklistAndPlayback_PersistWithoutBuildingTheCatalogDocument`: the operations service returns the stored id, path, and flags for those writes, and the catalog document build count stays put until an explicit document read. `itemStateChanged`, `playbackRecorded`, and clear-stats `resyncRequired` are still published from the same endpoint handlers.
  - Manual favorite, blacklist, playback record, and clear-stats for a selection on a large library passed: a favorite clears blacklist, a blacklist clears favorite, browse does not stall, a selection clears only those items, and the other client updates. Clear-all was not run on the real library.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - The playback catalog cache stays until random selection from the catalog query. A row update still bumps the catalog revision.
  - Library stats, item-state reads, auto-tag scan, duplicate scan, the desktop full-catalog download, source folder import, refresh, and catalog export stay on their current paths until their own slices.

### M10i7 - Responsive Tag Apply

- **Status**: ✅ Complete
- **Goal**: Make tag apply a SQLite row update so desktop and WebUI saves return immediately and do not stall on a full-catalog load.
- **Scope**:
  - Depends on: WebUI library query cutover.
  - Move tag-editor writes and the tag-editor model read onto catalog-session row operations: item-tag add and remove, category and tag upsert, rename, and delete, and auto-tag apply. Match items by catalog id or full path, as current clients already send.
  - Publish item-tag and tag-catalog events from those writes. When a catalog row changes, read that event's payload from the category and tag tables. Do not build or diff the full catalog document for these operations, and do not load it only to return a model the clients ignore.
  - WebUI save sends only pending category, tag, and item-tag edits. It does not upsert unchanged categories. It uses the catalog returned by the mutation instead of fetching the tag-editor model again.
  - Desktop and WebUI close the tag editor as soon as the user saves. The current file and loaded tiles show the new tags immediately, and the request runs in the background. On failure, restore the previous tags and show the error. The server remains the authority; the local change is that same delta, not a second catalog.
  - The save's own echoed event must not duplicate tags or undo the local update. A tag filter that can change which items are shown still reloads the loaded window once the save lands, and keeps the scroll position.
  - Leave refresh, source import, favorites, blacklist, and playback stats on the full-document catalog adapter.
  - Update the testing checklist and current-state docs for the immediate save.
- **Acceptance criteria**:
  - Adding, removing, renaming, deleting, and auto-applying tags persists in SQLite and does not load or diff the full catalog document.
  - Opening the tag editor and reading its model does not load the full catalog document.
  - A WebUI save that only changes item tags does not upsert categories or tags and does not fetch the tag-editor model a second time.
  - Desktop and WebUI close the editor without waiting for the request. The current file and loaded tiles show the edit immediately. A failed request restores the previous tags and shows an error.
  - The save's own event does not duplicate tags. The other client still receives the item-tag and catalog events and updates.
  - When a tag filter can change which files are shown, the loaded window reloads after the save lands and keeps the scroll position.
  - Docs and the testing checklist describe the immediate save and the server-authoritative rollback.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core 209, Desktop 115). `TagEdits_PersistByIdOrPath_WithoutBuildingTheCatalogDocument` and `TagEditorWrites_PersistWithoutBuildingTheCatalogDocument`: item-tag add and remove by catalog id or full path, category and tag upsert, rename, and delete, and auto-tag apply persist, and the catalog document build count stays put until an explicit document read. Opening the tag-editor model does not build that document. `RenameAndDelete_ReturnTheItemIdsThatHadTheTag_WithoutBuildingTheCatalogDocument`: rename and delete return the catalog ids of files that had the tag, and not files that did not, and a missing name returns no ids. The catalog document build count stays put until an explicit document read. `ApplyAutoTagAssignments_ReportsChangedPathsPerTag`: a file that already has the first tag is left out of that tag's changed paths, and the second tag reports only the file that gained it. The apply response includes that per-tag list.
  - `npm test` in `src/clients/web/ReelRoulette.WebUI` — pass (130 tests). `tagSave.test.ts`: a tag-only save posts no category or tag upsert and does not fetch the tag-editor model again. A reorder upserts only the categories whose order changed. Categories whose stored sort numbers are not their display indexes are left alone. A category rename that only changes case is upserted. Local tags update before the request. The save's own echo does not add those tags again. A tag-filter reload runs once, including a rename that has no item-tag echo. A save that started under a tag filter reloads once after that filter is empty, and a save that did not does not. A per-tag auto-tag event for a subset of that assignment's paths is the save's own echo, and a different item-tag event is not. An item-tag echo does not match a subset of its items. The smaller of two matching auto-tag saves takes the event. An assignment with no changed paths is retired, and a later event for that tag is applied. An assignment whose tag was not written is retired when another tag changed the same path, and a later event for the unwritten tag is applied. A live empty tag list replaces the optimistic tags. A failed later step, including one that throws, restores only that tail. A tag added after the save starts is kept when the save fails. A failed rename puts the old name back and keeps a name that was already on the file. A rename replaces that name in the include and exclude lists, and a delete removes it. The stored library filter is what the next reload sends. Another client's echo is applied. A newer in-flight save that finishes first does not take the older save's echo. Failing the newer save leaves that echo. Failing the older save keeps the newer tags. A confirmed item-tag event keeps that tag when the save then fails, including on tiles that were replaced with the old tags. A confirmed rename for a wider set of files still applies, and a later unconfirmed step still rolls back. An in-flight save projects onto replaced tiles. A confirmed auto-tag assignment stays when the other assignment rolls back. An auto-tag the server did not newly write still rolls back. `handleIncomingItemTags`: a catalog rename replaces that name in the include and exclude lists before the reload sees them, a per-item add and remove leaves those lists, and a catalog delete removes the name and reloads when that clears the filter. Those two catalog cases fail when the filter is updated after the reload.
  - `TagSaveApplyTests`: the same immediate tile update, failed-tail undo, and own-echo skip. A rename with no item-tag echo reloads once when a tag filter can change which files are shown. A save that started under a tag filter reloads once after that filter is empty, and a save that did not does not. A per-tag auto-tag event for a subset of that assignment's paths is the save's own echo, and a different item-tag event is not. An item-tag echo does not match a subset of its items. The smaller of two matching auto-tag saves takes the event. An assignment with no changed paths is retired, and a later event for that tag is applied. An assignment whose tag was not written is retired when another tag changed the same path, and a later event for the unwritten tag is applied. The same overlap cases, plus an auto-tag force reload that does not reload a different in-flight save. A tag added after the save starts is kept when the save fails. A failed rename puts the old name back and keeps a name that was already on the file. A rename replaces that name in the include and exclude lists, and a delete removes it. A confirmed item-tag event keeps that tag when the save then fails, including on tiles that were replaced with the old tags. A confirmed rename for a wider set of files still applies, and a later unconfirmed step still rolls back. An in-flight save projects onto replaced tiles. A confirmed auto-tag assignment stays when the other assignment rolls back. An auto-tag the server did not newly write still rolls back. `IncomingRename_UpdatesTheFilterBeforeTheOtherClientReloads`, `IncomingPerItemEdit_LeavesTheFilterInPlace`, and `IncomingDelete_RemovesTheTagBeforeTheOtherClientReloads`: the same catalog rename, per-item edit, and catalog delete. Those two catalog cases fail when the filter is updated after the reload.
  - Manual tag save on a large library from desktop and WebUI, and a forced failure that restores the previous tags, were not run.
  - Docs: `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `CHANGELOG.md` [Unreleased].
- **Deferrals / Follow-ups**:
  - Favorites, blacklist, playback stats, the playback catalog cache, stats and item-state reads, auto-tag and duplicate scans, the desktop full-catalog download, source folder import, and refresh each move in the following slices of this series.
  - Library export, import, and catalog backups stay with the library catalog export and import cutover, after the desktop full-catalog download is gone.

### M10i6 - WebUI Library Query Cutover

- **Status**: ✅ Complete
- **Goal**: Cut the WebUI library overlay over to the same list/query API as desktop so both clients browse identically through the server, and keep that window current so showing or hiding the overlay is close to instant.
- **Scope**:
  - Depends on: desktop library query cutover.
  - Replace WebUI overlay browse that filters a full in-memory projection with the server list/query API (filter, search, sort, fill-on-scroll).
  - After the WebUI session can reach the server, load the first query window even if the overlay has never been opened.
  - Preserve current WebUI library UX: overlay shell, header counts, justified grid, overscan, and click-to-play. Header "Showing N of M" uses `totalCount` and `searchBaselineCount`.
  - Keep the loaded window across hide and show. Hiding or showing the overlay does not drop that window, does not call list/query, and does not move the scroll position. Showing it again is instant when a window is already loaded.
  - Favorite, blacklist, playback, and tag updates patch the loaded tiles or reload the loaded window whether the overlay is shown or hidden. Filter, search, sort, and a header preset start over from the first page either way. Header **None** restores the default filter and stays on **None** until that filter changes, even when a saved preset has the same filter. A filter that matches neither a preset nor the default shows a starred row first and does not requery when that row is chosen.
  - Fill-on-scroll runs only while the overlay is shown. Showing it again requests further pages only when the restored viewport is not already covered.
  - `resyncRequired` reloads the loaded window the same way, shown or hidden. It does not fetch the full catalog.
  - Stop fetching full-catalog projection to build an auto-tag path list when scan-full-library is off; scoped scan is `scanFullLibrary: false` with no path list. Do not page list/query to collect paths.
  - Do not introduce WebUI-local catalog mutation or eligibility authority.
- **Acceptance criteria**:
  - WebUI library overlay browse uses the same server list/query contract as desktop.
  - The first query window is loaded after connect, before the overlay is opened.
  - Hiding or showing the overlay does not drop the loaded window, does not query, and keeps the scroll position.
  - Scrolling loads further query windows while the overlay is shown; filter/search/sort/preset requery the server from the first page whether the overlay is shown or hidden.
  - Header counts show the filtered total against the post-search, pre-filter baseline.
  - Favorite, blacklist, playback, tag, and resync updates keep the loaded window current whether the overlay is shown or hidden, without a full-catalog refetch.
  - Auto-tag scoped scan does not depend on a full-catalog projection fetch or a client-assembled path list.
- **Verification evidence**:
  - `npm test` in `src/clients/web/ReelRoulette.WebUI` — pass (98 tests). `libraryQuerySession` covers the first list-query window and header counts from `totalCount` and `searchBaselineCount`, the next page when the loaded rows do not cover the viewport, no fill while hidden, hide/show that issues no query and keeps scroll, a filter change while hidden that replaces the saved window and resets scroll, a favorite patch while hidden when membership cannot change, a favorite reload while hidden under the default blacklist filter, a playback patch and a playback reload, resync that reloads the loaded window through list query, a further page still in flight that is discarded when a tile update arrives, an open first page that is read again instead of being replaced by a reload, tag patch versus tag-filter reload, and a failed further page that retries after the scroll position changes. Scoped auto-tag sends `scanFullLibrary` with an empty path list. Header **None** selects the default filter and stays on **None** when a saved preset equals that default. A later comparison without that hold selects the preset. A filter that matches neither a preset nor the default shows a starred row first. A dirty filter-dialog edit keeps that dialog's base. Choosing None in the filter dialog stays on a preset the working filter still equals. A header None or named pick drops the starred row. `libraryGridController` scrolls an empty reset to the top while the scroller has a box, and applies that reset when the scroller is shown again if it had no box. Desktop preset labels use the same in-memory comparison, and an explicit **None** stays on **None** until the filter changes. `DesktopAppSettingsTests` pass: an explicit **None** hold round-trips with a null preset name, and a settings file without the flag loads as no hold.
  - `node --check` on `src/clients/web/ReelRoulette.WebUI/src/app.js` — pass. The WebUI client no longer calls `GET /api/library/projection`.
  - Manual instant hide/show, fill-on-scroll, and desktop/WebUI browse parity were not run in the browser.
- **Deferrals / Follow-ups**:
  - Source enable/disable list-query refresh stays with the later WebUI source-management alignment work.
  - Export/import format cutover is the next slice in this store/query sequence.

### M10i5 - Desktop Library Query Cutover

- **Status**: ✅ Complete
- **Goal**: Cut the desktop library panel over to the server list/query API with fill-on-scroll, without keeping a full local catalog replica for browse.
- **Scope**:
  - Depends on: library list query API.
  - Replace desktop library-panel browse that filters a full in-memory projection with list/query requests using the active filter, search, and sort.
  - Load additional result windows as the user scrolls (including overscan) and treat the last loaded justified row as provisional until the query is exhausted.
  - Preserve current desktop library UX: justified grid, search/sort, multi-select, bulk actions, and click-to-play. Shift-click range selection covers loaded items only.
  - While the panel is open, favorite, blacklist, playback, and tag SSE update the loaded window by patch or requery. They do not refetch the whole catalog.
  - The startup full-catalog fetch may remain in this slice for non-browse readers (video/photo header, now-playing tag grouping, and other library-index uses outside the grid). Browse, scroll, and filter/search/sort do not depend on it.
  - Stop sending a replica-built path list for auto-tag scan; scoped scan is `scanFullLibrary: false` with no path list (server enabled-source semantics from the catalog store). Do not page list/query to collect paths.
  - Keep random/play API-authoritative; do not reintroduce client-side eligibility authority.
- **Acceptance criteria**:
  - Desktop library browse no longer requires downloading the full catalog to filter, search, sort, or scroll.
  - Scrolling loads further query windows and layout remains stable except for the expected last-row pack of an incomplete page.
  - Filter, search, and sort changes requery the server and reset browse to the start of the result set.
  - Favorite, blacklist, playback, and tag SSE while the panel is open update the loaded window without a full-catalog refetch.
  - Auto-tag scoped scan does not depend on a full local item replica or a client-assembled path list.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (Core + Desktop, including `LibraryPanelBrowseTests`, `QueryLibrary_AcceptsDesktopDurationFilterJson`, `ShutdownCancel_ShouldStopManualRunWithoutRecordingAFailure`, `ShutdownCancel_DuringFfmpegCheck_DoesNotRecordLoudnessAsUnavailable`, and `ShutdownCancel_LeavesForcedRescansPending`).
  - `LibraryPanelBrowseTests`: another window is requested until the loaded rows cover the viewport plus overscan or the result is exhausted; an append continues at the loaded count and reflows from the last loaded row; a reload covers the loaded count in window-sized slices. A torn live count does not shrink that reload or move the next append offset; only a finished apply commits the span. A queued reset is not replaced by a reload. An append page applies only when the loaded count is still the offset it was fetched against. A held scrollbar defers a query or reload and does not defer an append, so the drag does not replay a reset. That deferred refresh keeps the browse query open and suppresses a further page, so the new filter or sort is not appended onto the old tiles. An open query is read again after a tile update, including a patch and including before the first page arrives. A further page that has not been applied yet counts as that open query, so a patch reloads the loaded window and that page is discarded. A restored scroll offset stays inside the row-model extent. Favorite, blacklist, playback, and tag events patch loaded tiles when the active filter and sort cannot change membership or order. They reload the loaded window when favorites-only, exclude-blacklisted, never-played, a tag filter, or a last-played or play-count sort can. An unchanged id page reflows from the first tile whose aspect changed, and does not reflow when nothing changed. An item in neither the snapshot nor the loaded tiles syncs the full snapshot when the panel is closed, is skipped when the panel is open with no tag filter, and reloads the loaded window after the rest of the event when a tag filter is active. Now-playing stats use the loaded tile when the snapshot misses that file. The current file downloads the snapshot when it is in neither copy. A playback for any other file missing from both copies still refreshes global play totals. A tag event applies the rest of its items before that snapshot download.
  - A finished item splice applies thumbnail fields on the unchanged tail. An append whose loaded count is no longer the requested offset does not request another page. A panel resize waits for the current grid update, then reflows the loaded rows and restores the viewport anchor.
  - `LibraryListQueryTests.QueryLibrary_AcceptsDesktopDurationFilterJson`: a `minDuration` / `maxDuration` string in desktop `HH:MM:SS` form filters the page.
  - Manual fill-on-scroll, filter/search/sort, and in-place favorite updates were confirmed on a large library before the membership reload rules.
  - Server shutdown during a refresh cancels the manual or automatic run, does not record it as a pipeline failure, and does not set a completion time. `ShutdownCancel_DuringFfmpegCheck_DoesNotRecordLoudnessAsUnavailable`: a cancel while the ffmpeg check is blocked leaves the loudness stage incomplete and does not record "ffmpeg not found" or a pipeline error. `ShutdownCancel_LeavesForcedRescansPending`: cancelling the duration and loudness stages leaves both one-shot rescan flags set, and a cancelled manual run still has no pipeline error.
- **Deferrals / Follow-ups**:
  - WebUI overlay cutover is the next slice in this store/query sequence.
  - Jump-to-middle scrollbar accuracy without loading the result prefix remains out of scope. Shift-click range selection of items that are not yet loaded is the same limitation.
  - Removing the startup full-catalog fetch, and moving the video/photo header and now-playing tag grouping off that replica, is deferred until full-catalog projection is removed or explicitly documented as leftover.

### M10i4 - Library List Query API

- **Status**: ✅ Complete
- **Goal**: Add a server-authoritative library list/query API so browse filter, search, sort, and paging run on the server.
- **Scope**:
  - Depends on: SQLite library catalog cutover.
  - Define OpenAPI list/query contracts that accept `filterState`, free-text search, sort, and offset/limit. Apply the desktop library-panel order: enabled sources, then a filename and relative-path substring search, then `FilterState`, then sort. Search uses the invariant-lowercase fold column, accent-sensitive, matching desktop `ToLowerInvariant` substring match. Name sort uses an `OrdinalIgnoreCase` collation, accent-sensitive, matching desktop, not the fold column. Missing files stay in the result.
  - Return items plus `totalCount` (after search and filter; the pageable set) and `searchBaselineCount` (after search, before filter) so WebUI can keep "Showing N of M".
  - Sort modes are Name, LastPlayed, PlayCount, Duration, and DateAdded, each with direction. Direction applies only to the primary key. Null last-played, duration, and last-write sort as the minimum, as in the desktop panel. Ties follow filename with `OrdinalIgnoreCase` ascending, as in the desktop panel `ThenBy`, then item id ascending, including when the primary sort is descending, so offset pages do not skip or repeat ties.
  - Include per-item thumbnail layout fields (`hasThumbnail`, `thumbnailWidth`, `thumbnailHeight`) on listed items without stating thumbnail files for the entire catalog on each request.
  - Update generated clients, API docs, and validation/error behavior for the new query surface.
  - Keep the existing full-catalog projection endpoint until both clients have cut over.
- **Acceptance criteria**:
  - Clients can request a window of library items with desktop library-panel filter, search, and sort semantics, including missing files and invariant case folding.
  - Responses include `totalCount`, `searchBaselineCount`, and enough thumbnail layout metadata for justified-row virtualization.
  - Equal sort keys stay in ascending filename order, then item id ascending, across adjacent offset windows, including when the primary sort is descending, with no skipped or repeated rows.
  - Query results honor server-owned source enabled state. They do not drop items whose files are missing.
  - Contract documentation describes list/query as the browse path and does not treat full-catalog projection as the long-term browse API.
- **Verification evidence**:
  - `LibraryListQueryTests` covers enabled sources then search then filter, the search-then-filter count split, invariant accent-sensitive search, name sort with ordinal ignore-case and id tie-break across descending offset windows, null last-played / duration / last-write placement, play-count and date-added sort, category and legacy tag filters, photo duration/audio skip, missing-file inclusion, empty and large-offset windows, and thumbnail metadata on the returned page only.
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed (Core.Tests 201, DesktopApp.Tests 58).
  - OpenAPI, `docs/api.md`, `CONTEXT.md`, `docs/domain-inventory.md`, and the testing checklist describe list/query as the browse path. `npm run generate:contracts` refreshed `openapi.generated.ts`.
  - Desktop and WebUI still browse through full-catalog projection. Export and import stay disabled.
- **Deferrals / Follow-ups**:
  - Desktop and WebUI browse cutover to this API are later slices in this store/query sequence.
  - Infinite-scroll client behavior is out of scope here.
  - Library export, import, and JSON catalog backups remain disabled until the library catalog export and import cutover. That gap is intentional because this store/query sequence ships as one release, ahead of the later account and Operator milestones.

### M10i3 - SQLite Library Catalog Cutover

- **Status**: ✅ Complete
- **Goal**: Make the SQLite catalog the live library store so catalog mutations are transactional row updates instead of whole-document JSON rewrites.
- **Scope**:
  - Depends on: SQLite library catalog session.
  - On startup, open the catalog session so a healthy `library.db` is authoritative and a missing `library.db` migrates `library.json` using that store.
  - Move every live catalog reader and writer onto the database: library operations (source import, tags, favorites, blacklist, playback stats, duplicates, auto-tag, stats, and projection), the refresh pipeline, source enabled state, and playback's catalog cache. Each updates the affected rows rather than loading and writing the entire catalog document. Playback cache invalidation uses the session revision, not `library.json` last-write time.
  - After migration, do not treat leftover `library.json` as a source of truth: do not dual-write it, do not read it for live catalog operations, and do not copy it for export or backup.
  - Disable desktop Library Export / Import and server `library.json` catalog backups after migration, with a clear unavailable message; do not export, import, or back up a stale JSON snapshot.
  - Make auto-tag scan scope server-authoritative. `scanFullLibrary: true` scans every item and ignores the client list. `scanFullLibrary: false` with no list scans enabled sources only (zero enabled sources scans nothing). An explicit list scans those items. Values in that list are full paths, matched the way scan matches `fullPath` today, so current clients keep working.
  - Keep `GET /api/library/projection` working by reading SQLite. Projection keeps the current JSON shape, including string-or-integer enums and a duration form both current clients already parse. Thumbnail fields stay serve-time enrichments.
  - Do not change desktop or WebUI browse UX in this milestone.
- **Acceptance criteria**:
  - After upgrade, an existing `library.json` library is available from SQLite with equivalent items, sources, categories, tags, legacy `availableTags`, and item flags/stats. `fingerprintIndex` need not survive.
  - A committed row update from any live catalog writer (refresh, tag apply, playback stats, source enabled state, and the other writers in scope) is still present after another of them commits.
  - Refresh, auto-tag apply, and other catalog mutations persist through SQLite; leftover `library.json` is not read, written, exported, or backed up as the live catalog.
  - Desktop Library Export / Import and server JSON catalog backups are disabled with a clear message until the export and import cutover.
  - Auto-tag scan with `scanFullLibrary: false` and no path list matches enabled sources only. An explicit path list still scans those paths. `scanFullLibrary: true` scans every item.
  - Existing clients can still load the library through the current full-catalog projection API.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (194 Core + 58 Desktop).
  - `LibraryOperationsServiceTests`: opening the service migrates `library.json` to `library.db` and does not create or trim `library.json.backup.*`. Playback, tags, import, and stats persist through the session document. Auto-tag with `scanFullLibrary: false` and no path list matches enabled sources only, including zero enabled sources. An explicit path list matches `fullPath`. `scanFullLibrary: true` scans every item and ignores the list. A duration save from an earlier snapshot keeps a tag apply that committed in between. A path rename that only changes casing is stored. A save that fails after an earlier edit does not keep that edit. Duplicate scan excludes integer pending, failed, and stale statuses, and still groups a missing status that has a SHA-256 fingerprint.
  - `RefreshPipelineServiceTests`: fingerprint status persists as an integer. A fingerprint change through the session regenerates the thumbnail. Thumbnail index reads stay on `index.json`.
  - `LibraryPlaybackServiceTests`: a disabled source with a root path returns 409.
  - Server startup resolves the catalog host before it serves. A refused open throws.
  - Desktop Export Library and Import Library show that export, import, and catalog backups are unavailable and do not write a zip.
  - Docs identify SQLite as the live catalog and the temporary export/import/backup gap. List-query browse and new export formats are not documented as shipping.
- **Deferrals / Follow-ups**:
  - Library list/query API and client browse cutover are later slices in this store/query sequence.
  - Re-enabling export, import, and catalog backups (zip envelope with live `.db`, legacy `library.json` zip import, separate JSON dump that is not a restore path) is deferred to the library catalog export and import cutover. Export, import, and catalog backups stay unavailable until that slice. The gap is intentional: this store/query sequence ships as one release, ahead of the later account and Operator milestones.
  - Removing `GET /api/library/projection` is deferred until both clients browse through the list-query API.
  - Account tables in this database are deferred to the account and PIN data model work. They extend `user_version` rather than replacing this catalog schema.

### M10i2 - SQLite Library Catalog Session

- **Status**: ✅ Complete
- **Goal**: Add a Core catalog session whose mutations are transactional row updates, and a projection builder for the current library document shape, without opening that database from the running server.
- **Scope**:
  - Depends on: SQLite library catalog store.
  - `Open` stays the health and migration gate. `Opened` returns a session for the published database. `Refused` returns no session and does not create an empty catalog. `Absent` (no `library.db` and no `library.json`) creates an empty healthy database.
  - Each operation uses its own connection, WAL, and a short busy timeout. A shared connection is not safe across the refresh pipeline and request threads. Mutations update the affected rows. They do not load a snapshot and write every row back.
  - Row writes cover the live catalog writers the cutover will move: sources (insert, display name, enabled flag); items (insert, path and identity, delete, favorite with blacklist cleared, blacklist, play count and last played, clear playback stats, fingerprint fields, duration, loudness, file size, last write time); tags and categories (upsert, rename, delete, catalog sync, per-item tag add, remove, and replace). Adding a tag to an item inserts a missing catalog tag as `uncategorized` and does not change an existing catalog tag's name or category. An upsert does not rename an existing tag; a blank category leaves its category in place, and a different category updates only that category. `availableTags` stays as migrated. New writes do not invent a second tag list.
  - `loudnessError` is a nullable item column on the version 1 schema. `user_version` stays 1. JSON migration stores the field when `library.json` has it. There is no second schema version.
  - Each committing transaction increments a `catalog_meta` revision so the cutover can drop playback's file-timestamp cache.
  - The session can build the current library document from SQLite: sources, items, categories, tags, and legacy `availableTags` when that list was present. `mediaType` and `fingerprintStatus` are integers. `duration` is an `hh:mm:ss` string. Both current clients already parse those forms. Thumbnail fields are not in this document. `fingerprintIndex` is not emitted.
  - The running server still reads and writes `library.json` and does not open `library.db`.
- **Acceptance criteria**:
  - A missing database and missing `library.json` produce an empty healthy `library.db`. A refused database does not.
  - Migrated and empty databases stay at `user_version` 1 and store `loudnessError`.
  - A committed row update is still present after another connection commits a different row. A tag update is not wiped by a later source-enabled update.
  - Built projection JSON uses integer `mediaType` and `fingerprintStatus` and an `hh:mm:ss` duration. Thumbnail fields and `fingerprintIndex` are absent.
  - The revision increments only when a transaction commits.
  - The running server still reads and writes `library.json`. It does not open `library.db`.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (188 Core + 58 Desktop).
  - `LibraryCatalogStoreTests`: an empty directory creates a healthy `library.db` at `user_version` 1 with a session and revision 0. A migrated snapshot alone is still refused and returns no session.
  - `LibraryCatalogSessionTests`: JSON `loudnessError` is stored at `user_version` 1, a favorite update and a duration update on two connections both remain, a tag update survives a later source-enabled update and does not create `availableTags`, an inserted tag with surrounding whitespace and a case-duplicate collapses to one trimmed tag that a later remove clears, renaming a tag onto an existing name leaves one catalog row and one `bar` item tag for items that had either name or both, that rename keeps the earlier category unless it is `Uncategorized` and the other is not, a blank-category upsert keeps an existing name and category and does not bump the revision, a same-category upsert with a different spelling changes nothing, a different category updates only the category, a new tag with a blank category is stored as `uncategorized`, adding a tag to an item inserts a missing catalog tag as `uncategorized` and leaves an existing catalog tag's name and category in place, a repeat add fills a missing catalog row without duplicating the item tag, and a missing item creates no catalog tag, a catalog sync of duplicate names keeps the earlier spelling and category unless that category is `Uncategorized`, an insert that omits fingerprint version stores `1`, an inserted local timestamp is stored as UTC, projection JSON uses integer `mediaType` and `fingerprintStatus` and `00:01:30` for 90.5 seconds, thumbnail fields and `fingerprintIndex` are absent, and revision stays 0 across a read and a missing-item update then increments on commit.
  - `ReelRoulette.Server` has no reference to `LibraryCatalogStore` or `LibraryCatalogSession`. Startup does not open `library.db`.
- **Deferrals / Follow-ups**:
  - Opening this session from the running server, moving live readers and writers onto it, auto-tag scan scope, projection served from SQLite, and disabling export, import, and JSON catalog backups are the next slice in this store/query sequence.
  - Account tables in this database are deferred to the account and PIN data model work. They extend `user_version` rather than replacing this catalog schema.

### M10i1 - SQLite Library Catalog Store

- **Status**: ✅ Complete
- **Goal**: Add a tested SQLite catalog store and JSON migration without opening that database from the running server.
- **Scope**:
  - Depends on: completed WebUI library browser series.
  - Introduce a server-owned SQLite catalog at `library.db` in the same roaming config directory as `library.json`, versioned with `user_version` and run in WAL mode. Tables cover sources, items, categories, tags, item-tag assignments, and legacy `availableTags`. Item primary key is the existing item `id`. Paths, filenames, and tag names keep invariant-lowercase fold columns for substring search and case-insensitive path/tag match. Name sort does not use those fold columns. Duration is stored as `TimeSpan` ticks. Thumbnails, presets, core settings, and desktop settings stay in their current files. `fingerprintIndex` is not stored.
  - Migrate an existing `library.json` when no `library.db` exists, in one transaction, using the parsers the server already uses: `mediaType` and `fingerprintStatus` may be numbers or strings, and duration may be a `TimeSpan`, a seconds number, or a string. Keep legacy `availableTags` when that list is what the library has. Write that database to a temporary file in the same directory, set `user_version`, commit, and sync it. Rename the temporary file to `library.db` only after it is complete. Rename `library.json` to `library.json.migrated` only after that rename has succeeded. A crash before the database rename leaves `library.json` in place and no `library.db`. A crash after it leaves a healthy `library.db`.
  - A healthy `library.db` is authoritative: ignore `library.json` and `library.json.migrated`. A partial or unversioned `library.db` refuses to serve and is not migrated over. When `library.json` is still present, quarantine that database by renaming it aside and leave `library.json` in place, so a later open with no `library.db` can migrate the preserved JSON. When `library.json` is already gone, quarantine the bad database and refuse to serve: do not migrate `library.json.migrated`, and do not create an empty catalog. The same refusal applies when the open finds `library.json.migrated` but neither `library.db` nor `library.json`. Report that the live database was refused and that the migration-time snapshot is still at `library.json.migrated`.
  - The running server does not open `library.db` in this milestone. Live readers and writers stay on `library.json` until the catalog cutover.
- **Acceptance criteria**:
  - An existing `library.json` library can be migrated into SQLite with equivalent items, sources, categories, tags, legacy `availableTags`, and item flags/stats. `fingerprintIndex` need not survive.
  - Successful migration renames `library.json` to `library.json.migrated` only after `library.db` is in place and healthy. A crash before that publish leaves `library.json` unmoved. A later open of a healthy `library.db` does not read either JSON file. A partial or unversioned `library.db` does not serve and does not consume `library.json`. When `library.json` is still present, quarantine lets a later open migrate it. When only `library.json.migrated` remains, the open refuses and does not create an empty catalog.
  - The running server still reads and writes `library.json`. It does not publish `library.db` on startup.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass. `dotnet test ReelRoulette.sln` — pass (168 Core + 58 Desktop).
  - `LibraryCatalogStoreTests`: JSON-to-SQLite migration (string enums, numeric duration, TimeSpan duration, legacy `availableTags`, fold columns, `fingerprintIndex` absent), crash before publish leaves `library.json` unmoved and creates no `library.db`, a failed directory sync after publish leaves `library.json` unmoved, a healthy `library.db` ignores both JSON files, a partial database is quarantined so the next open migrates preserved `library.json`, an unversioned database with only `library.json.migrated` is refused, a migrated snapshot alone does not create `library.db`, an existing `library.json.migrated` blocks publish so `library.json` stays put, a bad database with neither JSON file does not name a missing snapshot, a database whose header opens but whose later pages are corrupt is quarantined without consuming `library.json`, a read-only database file fails the pre-publish sync, the Windows directory-sync access mask is `FILE_LIST_DIRECTORY`, a missing `fingerprintStatus` stays null while an explicit Pending `0` stays `0`, a source without an id or root path is omitted, an item with no full path is omitted, a locked `library.db` fails within about a second and stays in place, a blank category id is forced to `Uncategorized` with sort order `int.MaxValue` and a later duplicate id is skipped, that category is appended when the file does not have it, duplicate tag names collapse case-insensitively to the last one, and catalog test connections disable pooling so Windows can rename and delete `library.db`.
  - `ReelRoulette.Server` has no reference to `LibraryCatalogStore`. Startup does not publish `library.db`.
- **Deferrals / Follow-ups**:
  - Opening this database from the running server, moving live readers and writers onto row updates, auto-tag scan scope, projection from SQLite, and disabling export, import, and JSON catalog backups are the next slice in this store/query sequence.
  - Library list/query API and client browse cutover remain later slices. This store/query sequence ships as one release, ahead of the later account and Operator milestones.
  - Account tables in this database are deferred to the account and PIN data model work. They extend `user_version` rather than replacing this catalog schema.

### M10h - WebUI Library Click-to-Play and Responsive Sign-off

- **Status**: ✅ Complete
- **Goal**: Complete WebUI library browser behavior by using the server-authoritative play endpoint and signing off responsive/theme parity.
- **Scope**:
  - Depends on: WebUI library SSE state sync and server-authoritative play endpoint foundation.
  - Wire tile activation to `POST /api/play/{itemId}` and play the returned media through the existing WebUI player path.
  - Map endpoint errors into clear overlay/player feedback without local fallback selection logic.
  - Complete mobile LAN and desktop browser responsiveness, fullscreen behavior, keyboard/focus basics, and light/dark theme polish for the full browser.
  - Update docs and testing checklist for the new standard WebUI library play path.
- **Acceptance criteria**:
  - Clicking a WebUI library tile requests item playback through the server endpoint and starts the returned media in the WebUI player.
  - Playback side effects update all clients through SSE and update the open library browser projection.
  - The browser is usable on mobile-width LAN browsers and desktop browsers in light and dark themes.
  - The browser follows established WebUI icon, dialog, and theming conventions with no desktop list-view parity requirement.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (95 Vitest tests).
  - WebUI `coreApi.test.ts` — `requestPlayItem` URL/body/encoding, success JSON, structured failure, blank id guard.
  - WebUI `libraryPlayModel.test.ts` — 404/409/415/401 and fallback status mapping.
  - WebUI `libraryGridTileModel.test.ts` — `data-item-id`, `tabindex`, `role="button"` on tiles.
  - WebUI modules: `coreApi.ts` (`requestPlayItem`), `libraryPlayModel.ts`, `app.js` (`playFromLibraryItemId`, delegated tile click/keyboard, `playCurrent({ skipRecordPlayback })`, Escape closes overlay), `libraryGridTileModel.ts`, `styles.css` (tile focus/active, mobile sort-cluster wrap).
  - API smoke — `POST /api/play/{itemId}` returns `200` with `RandomResponse` against live server library.
  - Manual UI smoke — confirmed: tile click play (overlay closes, no duplicate `record-playback`), error mapping (404/409/415), keyboard (Escape/Enter/Space), desktop and mobile width, light/dark themes, cross-client SSE playback updates, fullscreen (`docs/checklists/testing-checklist.md`).
- **Deferrals / Follow-ups**:
  - Offline/PWA-specific library browsing and advanced library actions remain future considerations.

### M10g - WebUI Library SSE State Sync

- **Status**: ✅ Complete
- **Goal**: Keep the WebUI library browser projection current while open using existing SSE infrastructure.
- **Scope**:
  - Depends on: WebUI virtual thumbnail grid.
  - Subscribe the library browser model to existing SSE events that affect favorite, blacklist, play count, and last played state.
  - Update visible and non-visible virtualized items without requiring a full overlay reopen.
  - Handle `resyncRequired` by re-fetching the authoritative projection.
  - Preserve the explicit refetch-on-open behavior even after live updates are added.
- **Acceptance criteria**:
  - Favorite and blacklist changes from any client update matching WebUI tiles while the overlay is open.
  - Playback stats and last-played changes from any client update search/sort projections correctly while the overlay is open.
  - SSE replay gaps or resync-required events trigger an authoritative projection re-fetch.
  - Closing and reopening the overlay still performs a fresh projection fetch.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests; desktop change limited to library grid hover opacity 0.79).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (84 Vitest tests).
  - WebUI `libraryProjectionSync.test.ts` — tile-state patch, playback patch with optional server fields, rebrowse decision matrix, id/fullPath lookup.
  - WebUI `libraryProjectionModel.test.ts` — optional `fullPath` parse for SSE path matching.
  - WebUI modules: `libraryProjectionSync.ts`, `libraryGridController.ts` (`resetScroll`), `app.js` SSE handlers (`itemStateChanged`, `playbackRecorded`, `resyncRequired` projection refetch when overlay open).
  - Manual cross-client smoke — confirmed: favorite/blacklist tile updates (visible + scrolled-off), playback sort/filter re-browse (`Play count`, `Last played`, `Only never played`), `resyncRequired` projection refetch while open, refetch-on-open, search/sort/filter scroll-to-top regression, playback continues with overlay open (`docs/checklists/testing-checklist.md`).
- **Deferrals / Follow-ups**:
  - New SSE event types are out of scope unless existing events cannot express the required state changes.
  - `refreshStatusChanged` completion → overlay projection refetch remains deferred (desktop parity gap until follow-up).
  - `createSseClient.ts` consolidation with inline `app.js` SSE remains deferred.

### M10f - WebUI Virtual Thumbnail Grid

- **Status**: ✅ Complete
- **Goal**: Replace the interim filename result list with a responsive, virtualized, desktop-aligned justified thumbnail grid using API-backed projection metadata and shared layout rules.
- **Scope**:
  - Depends on: WebUI library projection search and sort; API-backed library thumbnail metadata and desktop grid cutover.
  - Port or mirror `ReelRoulette.Core.Library.LibraryGridLayout` in WebUI (same constants, aspect fallbacks, row packing, and layout-width rules as Core tests in `LibraryGridLayoutTests.cs`).
  - Build justified-row virtual scrolling with top/bottom spacers so only visible rows (plus a small buffer) are mounted; DOM item count stays bounded relative to the viewport, not total library size.
  - Derive tile aspect ratios from projection `thumbnailWidth` / `thumbnailHeight` and `mediaType` fallbacks (same rules as `LibraryGridLayout.GetAspectRatio`); load tile JPEGs from `GET /api/thumbnail/{itemId}` when `hasThumbnail` is true (no local thumbnail cache reads).
  - Replace the interim scrollable filename list in the library overlay with the virtual grid while keeping the “Showing N of M items” summary.
  - Match the current desktop library grid tile chrome as closely as web technology allows. Before implementation, read `LibraryGridLayout.cs`, `LibraryGridLayoutTests.cs`, the `MainWindow.axaml` tile template, and desktop row virtualization/spacer logic in `MainWindow.axaml.cs`; implement equivalent CSS rather than approximate styling. Parity targets include: square tile edges; image scrim (`#22000000`) with crop equivalent to desktop `UniformToFill` inside variable-size cells; bottom filename bar (`#AA000000`, 12px white, ellipsis); top-right favorite/blacklist badge pill (`#99000000`, Material Symbols, Huggins Orange, 18px); missing-thumbnail placeholder when `hasThumbnail` is false; hover opacity ~0.92.
  - Show favorite and blacklist state indicators on tiles using established Material Symbols conventions.
  - Exclude play-count badges, list-view affordances, multi-select, orange selection overlay, and bulk context menu from this milestone.
- **Acceptance criteria**:
  - The browser renders a responsive justified thumbnail grid on mobile-width and desktop-width overlay layouts.
  - Virtual scrolling keeps mounted row/tile count bounded relative to the visible viewport, not total library size.
  - Justified-row layout at a given content width matches desktop row packing for the same visible items and projection metadata.
  - Aspect ratios use projection dimensions when present and the same media-type fallbacks when missing.
  - Tiles with `hasThumbnail: false` render placeholder behavior consistent with desktop (layout still uses fallback aspect; no broken image).
  - Thumbnail images load from `GET /api/thumbnail/{itemId}` only.
  - WebUI grid tile visual design—including variable tile sizing, row gaps, overlay scrims, filename bar, badge pill, and missing-thumbnail placeholder—matches the desktop grid as closely as web technology allows.
  - Tile hover uses desktop-equivalent opacity treatment; no distinct pressed-state requirement beyond that.
  - Side-by-side visual comparison of WebUI and desktop grids at equivalent viewport widths shows no significant unintentional divergence in tile appearance.
  - Thumbnail cropping, placeholder/missing-thumbnail behavior, and filename metadata remain readable in light and dark themes.
  - Favorite and blacklist indicators appear on tiles; play-count badges do not appear.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (72 Vitest tests).
  - WebUI `libraryGridLayout.test.ts` — Core-aligned `getAspectRatio` and `buildRows` parity; layout width uses full scrollport (no Avalonia 8px right gutter).
  - WebUI `libraryGridVirtualizer.test.ts` — visible row window bounded for 1200-item fixture at mid-scroll.
  - WebUI `libraryGridTileModel.test.ts` — favorite/blacklist badges, missing-thumbnail placeholder (no `<img>`), filename escape, thumbnail URL shape.
  - WebUI library grid modules: `libraryGridLayout.ts`, `libraryGridTileModel.ts`, `libraryGridRowModel.ts`, `libraryGridVirtualizer.ts`, `libraryGridController.ts`; overlay wired via `app.js` grid controller; browse re-browse resets scroll to top.
  - Manual smoke — confirmed: large-projection scroll, API thumbnail loading, mixed-aspect reflow, resize debounce, light/dark themes, side-by-side desktop visual parity, edge-to-edge grid layout, overlay scrollbar, header item count, and responsive toolbar/sort cluster at mobile and desktop widths.
- **Deferrals / Follow-ups**:
  - Multi-select, orange selection overlay, bulk context menu, batch actions, list view, and click-to-play are out of scope for this milestone (selection overlay and bulk actions are planned for a later WebUI library milestone; implementation may differ slightly from desktop to support both touch and pointer input).
  - Any desktop grid behavior that is technically impossible to replicate in a browser context should be noted as a known divergence in milestone completion evidence rather than treated as a blocker.

### M10e2 - API-Backed Library Thumbnail Metadata and Desktop Grid Cutover

- **Status**: ✅ Complete
- **Goal**: Serve thumbnail layout metadata through the library projection API and cut the desktop library grid over to API-only thumbnail access so WebUI can replicate the same contract.
- **Scope**:
  - Enrich `GET /api/library/projection` items at serve time with `hasThumbnail`, `thumbnailWidth`, and `thumbnailHeight` derived from the server thumbnail index (not persisted in `library.json`).
  - Extract the justified-row library grid layout algorithm into `ReelRoulette.Core` with golden-vector tests.
  - Cut desktop library grid thumbnail metadata and image loading over to the projection API and `GET /api/thumbnail/{itemId}`; remove local `thumbnails/` reads for grid rendering.
  - Parse projection thumbnail fields in WebUI `libraryProjectionModel` (prep for M10f; no grid rendering yet).
- **Acceptance criteria**:
  - Projection items expose thumbnail metadata when generated thumbs exist; missing thumbs omit dimensions and set `hasThumbnail: false`.
  - Desktop library grid layout remains visually unchanged and no longer reads local thumbnail cache files for rendering.
  - Desktop visible tiles load thumbnail JPEGs through the API only.
  - After refresh completes, new/changed thumbnails appear without desktop restart (projection refetch + visible-tile reload + layout reflow when dimensions change).
  - Core layout tests and WebUI projection parser tests cover the new contract.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (126 Core + 49 Desktop tests).
  - `npm run verify` in WebUI — pass (56 Vitest tests).
  - Manual desktop grid smoke — confirmed (Linux desktop): grid appearance and interaction unchanged vs pre-cutover; thumbnails load via projection metadata and `GET /api/thumbnail/{itemId}` after refresh without restart; mixed-aspect layout and panel resize reflow behave as before.
- **Deferrals / Follow-ups**:
  - WebUI virtual thumbnail grid remains M10f.
  - Library archive export/import continues to use on-disk `thumbnails/` (server artifact management, not grid rendering).

### M10e - WebUI Library Projection Search and Sort

- **Status**: ✅ Complete
- **Goal**: Add the WebUI library browser's in-memory projection model, playback FilterState narrowing, free-text search, and desktop-aligned sort controls.
- **Scope**:
  - Depends on: WebUI library overlay shell.
  - Build an in-memory library projection model from the server projection response for overlay rendering.
  - Apply active playback **FilterState** to the library overlay (desktop `LibraryProjectionDisplayFilter` parity).
  - Add free-text search over filename and relative path without server-side query changes.
  - Add sort by name, last played, date added, play count, and duration with ascending/descending selection matching desktop defaults.
  - Keep filtering/sorting deterministic across missing values, mixed media types, and projection refreshes.
- **Acceptance criteria**:
  - Search matches filename and relative path case-insensitively from the in-memory projection.
  - Sort controls support name, last played, date added, play count, and duration in both directions.
  - Default sort behavior matches the desktop library panel.
  - Search and sort combine predictably and update rendered results without re-fetching the projection.
  - Library overlay reflects the active playback filter (Filter Media / header preset) with desktop-aligned display rules.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (168 tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (55 Vitest tests including `libraryProjectionModel`, `libraryProjectionDisplayFilter`, and `libraryBrowseModel` suites).
  - WebUI library browse modules: projection parse + catalog; FilterState display filter port; browse pipeline (enabled sources → search → FilterState → sort); interim scrollable filename result list with “Showing N of M items” summary.
  - Search/sort controls persist across overlay close/reopen; Filter Media Apply and header preset changes re-browse in memory while overlay is open; projection still refetches on every open.
  - Manual smoke — confirmed: FilterState narrowing (default + favorites-only + header preset), search/sort without refetch, Filter Apply re-browse while overlay open, search/sort persistence across close/reopen, refetch-on-open, zero-match messaging, fullscreen, and light/dark themes.
- **Deferrals / Follow-ups**:
  - Virtual thumbnail grid, SSE sync, and click-to-play remain follow-on WebUI library milestones.
  - Server-side search/query endpoints remain out of scope unless projection size proves untenable after virtual scrolling.

### M10d - WebUI Library Overlay Shell

- **Status**: ✅ Complete
- **Goal**: Introduce the WebUI library browser entry point and full-screen overlay shell without implementing the full grid behavior yet.
- **Scope**:
  - Depends on: none.
  - Add a **Library** button to the WebUI top-right overlay controls, positioned left of the filter button.
  - Implement a full-screen overlay matching the existing tag editor and filter dialog shell patterns, including header, close behavior, responsive layout, focus handling, and light/dark theme integration.
  - Wire overlay open/close lifecycle and fetch the library projection on every open, with loading and error states.
  - Keep the initial content minimal enough to validate shell behavior before grid/search/sort work lands.
- **Acceptance criteria**:
  - The Library button appears in the correct top-right overlay control position and opens a full-screen library overlay.
  - The overlay matches established WebUI dialog structure and works in fullscreen/pseudo-fullscreen contexts used by the player shell.
  - Opening the overlay re-fetches the projection every time, including after close/reopen.
  - Loading, empty, and request-failure states are visible and theme-compatible.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass.
  - `dotnet test ReelRoulette.sln` — pass (168 tests; no server/desktop changes).
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` — pass (36 Vitest tests including new `libraryOverlayModel.test.ts`).
  - WebUI library overlay shell: `#library-open-btn` (`browse` icon) left of filter; `#library-overlay` inside `#fullscreen-stage`; Close-only header; `GET /api/library/projection` on every open with loading/empty/error/summary states; playback continues while open.
  - `libraryOverlayModel.ts` — projection summary parsing (enabled-source item counts), open/close lifecycle, refetch-on-open contract tests.
  - Manual shell smoke — confirmed (Linux desktop, dark theme): open/close from corner control, projection refetch on reopen with loading then summary, native fullscreen overlay usable; light theme not explicitly re-tested (uses same `html.theme-light` overlay pattern as filter/tag dialogs).
- **Deferrals / Follow-ups**:
  - Grid rendering, search, sort, SSE state updates, and click-to-play are handled by later WebUI library-browser milestones.

### M10c - Desktop Grid-Only Library Panel Cleanup

- **Status**: ✅ Complete
- **Goal**: Remove the obsolete desktop library list view so the desktop library panel is grid-only.
- **Scope**:
  - Depends on: desktop click-to-play API cutover.
  - Remove list/grid toggle UI, list-view rendering, and list-view-specific state persistence from the desktop library panel.
  - Keep the existing grid view, thumbnail behavior, filtering behavior, and item activation path intact.
  - Add a `lastWriteTimeUtc`-backed **Date Added** sort mode to the desktop library panel sort selector, supporting both descending (Newest to Oldest) and ascending (Oldest to Newest) directions.
  - Clean up dead list-view styles, settings keys, and code paths without changing library projection contracts.
- **Acceptance criteria**:
  - Desktop library panel always renders the grid view and exposes no list-view toggle.
  - Existing grid thumbnail, sorting, filtering, favorite/blacklist indicator, and click-to-play behavior remain functional.
  - Sort controls include **Date Added** (from `lastWriteTimeUtc`) with both **Newest to Oldest** and **Oldest to Newest** directions.
  - **Date Added** defaults to descending (**Newest to Oldest**), matching desktop time-based sort conventions.
  - Removed list-view preference data is ignored harmlessly if present in existing desktop settings.
  - No WebUI behavior changes are included in this cleanup.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings after cleanup).
  - `dotnet test ReelRoulette.sln` — pass (`LibraryPanelSortTests` Date Added asc/desc/null ordering; existing desktop/core suites).
  - Confirmed `GET /api/library/projection` already exposes per-item `lastWriteTimeUtc` via full library root JSON; no server/OpenAPI contract change required.
  - Desktop library panel is grid-only: removed `LibraryListBox`, grid/list toggle, list scroll-anchor restore, and `LibraryGridViewEnabled` settings read/write (legacy JSON property ignored on load).
  - Added `LibraryPanelSort` helper with **Date added** sort mode (`lastWriteTimeUtc`).
  - Manual grid-only smoke — confirmed (Linux desktop): library panel grid-only with no list/toggle; thumbnails and favorite/blacklist overlays; search and existing sort modes; **Date added** Newest→Oldest/Oldest→Newest (defaults to Newest→Oldest when selected); grid double-click/Enter play via `POST /api/play/{itemId}`; multi-select and right-click bulk context menu; selection persists across filter/sort changes; legacy `libraryGridViewEnabled: false` settings load with grid shown; random playback and prev/next timeline unchanged.
  - Docs/checklist updated to remove list-view validation references.
- **Deferrals / Follow-ups**:
  - Duplicate detection remains in the desktop client until Operator Source Management and must not be removed as part of this milestone.

### M10b - Desktop Click-to-Play API Cutover

- **Status**: ✅ Complete
- **Goal**: Replace the desktop library click-to-play workaround with the server-authoritative item play endpoint.
- **Scope**:
  - Depends on: server-authoritative play endpoint foundation.
  - Route desktop grid item activation through `POST /api/play/{itemId}` instead of determining the selected media locally.
  - Keep LibVLC rendering local to the desktop client while treating the server response as the source of playback truth.
  - Preserve existing desktop error UX for missing/unplayable media with endpoint-backed messages.
  - Remove or retire the click-to-play workaround code path once the API path is verified.
- **Acceptance criteria**:
  - Clicking a desktop library grid item requests playback through the server endpoint and starts the returned media locally.
  - Playback stats, last-played, favorite, and blacklist state continue to update via API/SSE projection only.
  - Missing/unavailable media produces a clear desktop error without local fallback selection logic.
  - Existing random playback and player controls remain unchanged.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings).
  - `dotnet test ReelRoulette.sln` — pass (`CoreServerApiClientPlayItemTests`, `PlaybackMediaUrlResolverTests`, `PhotoPlaybackStreamOpenerTests`; existing Core play-item coverage).
  - Desktop library grid and list activation wired to `RequestPlayItemAsync` with `SkipRecordPlayback` on `PlaybackTarget`; no client `record-playback` for play-item starts.
  - Manual smoke — confirmed (Linux desktop): library grid/list click-to-play for playable video and photo items with Force API `/api/media/...` playback; list double-click, Enter, and play button match grid play-item behavior; favorite/blacklist toggles no longer emit spurious add/remove status on play; random playback and prev/next timeline unchanged.
- **Deferrals / Follow-ups**:
  - WebUI library-browser click-to-play adoption is handled in the WebUI browser series.
  - Non-library play entry points (favorites, blacklist, recently played, timeline navigation) remain on `PlayFromPathAsync` + `record-playback` unless explicitly expanded later.

### M10a - Server-Authoritative Play Endpoint Foundation

- **Status**: ✅ Complete
- **Goal**: Add a dedicated server-owned play request path that any client can use to request a specific library item.
- **Scope**:
  - Depends on: none.
  - Define `POST /api/play/{itemId}` in the OpenAPI contract with deterministic success and failure responses (including optional machine-readable `code` on `ErrorResponse`) for playable item, unknown id, missing media file, disabled source, and unsupported extension cases. Route `itemId` is the persisted library **id** only (not `fullPath`). Direct play does **not** reject blacklisted items; disabled sources return **409**; missing media returns **404** with `play_media_missing`; unknown id returns **404** with `play_item_not_found`; unsupported extension returns **415** with `play_unsupported_media`.
  - Implement the server command path with `LibraryPlaybackService.TryPlayItem`, shared playable extension allowlist (`MediaPlayableExtensions`, aligned with library import lists), and correct per-source `isEnabled` projection for items (including when all catalog sources are disabled).
  - On success, return the same `RandomResponse` shape as random playback, call `LibraryOperationsService.RecordPlayback`, and publish `playbackRecorded` via `ServerStateService` (same side effects as `POST /api/record-playback`). No transcoding/session-streaming.
- **Acceptance criteria**:
  - A valid item-specific play request returns a playable media response for the requesting client.
  - Invalid or unavailable item requests return deterministic status codes and machine-readable error payloads.
  - Playback stats and last-played state are updated server-side and projected to all clients through existing SSE infrastructure.
  - The endpoint is covered in the shared API contract and generated/typed client surfaces where applicable.
  - No client-local state mutation path is introduced for endpoint side effects.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings).
  - `dotnet test ReelRoulette.sln` — pass (`LibraryPlaybackServiceTests` play-item and random-blacklist cases; `PlayItemOrchestrationTests`).
  - WebUI `npm run generate:contracts` / `npm run verify` — pass (OpenAPI + `openapi.generated.ts`).
  - Docs: `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, `CONTEXT.md`, `CHANGELOG.md` `[Unreleased]`, `COMMIT-MESSAGE.txt`.
- **Deferrals / Follow-ups**:
  - Full playback-session, direct-stream, transcode, resume, and format-resilience architecture remains future playback architecture work.
  - Desktop/WebUI cutover to call this endpoint without double `record-playback` is tracked in the desktop/WebUI browser milestones.

### M9i - WebUI Auto Tag Parity

- **Status**: ✅ Complete
- **Goal**: Ship **Auto Tag** in the WebUI with the same **API-level** scan/selection/apply behavior as the **Desktop** **Auto Tag** dialog (full-screen tag overlay with tabs), while using the WebUI’s **shared Save** / **Close**+discard model instead of separate Auto Tag OK/Cancel buttons. **Align Desktop Auto Tag scan scope** with WebUI so **Scan full library** off means **enabled sources only**—not playback/filter state, tag filters, or library search. WebUI integrates into the existing tag experience without duplicating tag logic on the client.
- **Scope**:
  - **Desktop — Auto Tag scan scope:** When **Scan full library** is **unchecked**, the candidate item set for scan/apply is **all library items belonging to enabled sources** only. Remove or bypass any narrowing that used **current filter state**, **tag filter**, or **library search** text for that path (for example **`GetCurrentFilteredLibraryItems`** or equivalent). When **Scan full library** is **checked**, behavior remains **all items** (full library) as today. **`POST /api/autotag/scan`** continues to receive **`scanFullLibrary`** plus **`itemIds`** as **`fullPath`** values for the scoped items (or empty / full-library semantics consistent with the server).
  - Split the WebUI tag overlay into **tabs** using the **same structural pattern** as the WebUI **filter** full-screen overlay: **Edit Tags** retains today’s manual editor; add **Auto Tag** for scan/selection workflows so tab chrome and layout feel consistent across filter and tags.
  - **Shared chrome (both tabs):** **Header** — title, tab strip, **Refresh**, **Close**. **Footer** — add category/tag controls and **Save** (same as today’s tag overlay). Only the **body** switches between **Edit Tags** and **Auto Tag** content.
  - **Default tab:** Opening the overlay from the existing **Edit tags** entry lands on **Edit Tags** first; **Auto Tag** is the sibling tab. **No** extra confirmation when switching tabs; pending work may span both tabs until **Save** or discard.
  - **Auto Tag** tab mirrors **Desktop** scan/selection semantics: **Scan full library**, **View all matches**, explanatory copy (e.g. filename match ignores extension), **Scan Files** → **`POST /api/autotag/scan`**; results list with expand/collapse, row tri-state **Apply**, per-file checkboxes, **Select all** / **Deselect all**, **Total matched** / **To be changed**, status text. **Desktop** uses a separate **OK** / **Cancel** in the Auto Tag **window**; **WebUI** maps **commit** to the shared **Save** and **discard** to **Close** / **Refresh** with **`Discard changes?`** when anything is pending (manual and/or Auto Tag), not separate Auto Tag OK/Cancel buttons.
  - **Save (WebUI):** Single **Save** applies all pending work in order: **(1)** catalog / tag-structure mutations (existing `POST /api/tag-editor/*` upsert/delete/rename sequence), **(2)** manual item tag apply (`POST /api/tag-editor/apply-item-tags` when applicable), **(3)** **`POST /api/autotag/apply`** when Auto Tag has selected assignments after a scan. If any step fails, **abort** the remainder and show the error. **`Save`** shows pending/active state when **either** manual editor deltas **or** Auto Tag selections are pending.
  - **Close / Refresh (WebUI):** If manual and/or Auto Tag changes are pending, prompt **`Discard changes?`** before closing the overlay or refreshing the tag model; **no** prompt on tab switch alone.
  - **Scan request shape (WebUI):** **`scanFullLibrary`** and **`itemIds`** (`fullPath` values) must match the **same scope rules** as **Desktop** after alignment: **off** = items in **enabled sources** only; **on** = full library per server behavior.
  - **In-flight scan UX (WebUI):** While a scan is running, disable **Scan Files** (no overlapping scans), show a clear **status line** (scanning / success / error), and show an **indeterminate progress** indicator consistent with WebUI patterns. Define interaction for **Close** / **Refresh** during an in-flight scan (e.g. disable or cancel scan first) so behavior is deterministic.
  - **After Save** that includes **`POST /api/autotag/apply`**, **refresh or resync tag state** the same way as other WebUI tag mutations (**`tagCatalogChanged`**, **`itemTagsChanged`**, **`resyncRequired`**, and/or refetch of the tag editor model) so the **Edit Tags** tab and any visible chips stay aligned with the server.
  - **Scan full library** default (WebUI): **best-effort `localStorage`** persistence (**Desktop**-style preference), with acceptable fallback if storage is unavailable.
- **Acceptance criteria**:
  - **Desktop:** With **Scan full library** off, Auto Tag scan considers only items from **enabled sources**; filter state, tag filter, and library search **do not** shrink the scan set. With it on, full-library behavior is unchanged.
  - **WebUI:** Scan/selection semantics and **`POST /api/autotag/apply`** payload behavior match **Desktop** Auto Tag for representative libraries (including partial selections and **View all matches**), using the **same** enabled-sources-only rule when **Scan full library** is off.
  - **Edit Tags** and **Auto Tag** are both available inside one WebUI overlay without leaving the flow; **header/footer** shared; tab UX matches the WebUI filter overlay pattern; default tab is **Edit Tags** when opened from the existing control.
  - **WebUI:** **Save** commits manual + Auto Tag pending work in the specified order; **Close** / **Refresh** prompt **`Discard changes?`** when pending; **no** tab-switch-only confirm.
  - During scan, WebUI **in-flight** UX is clear (disabled **Scan Files**, status line, indeterminate progress).
  - After **Save** (including autotag apply), **Edit Tags** data and tag surfaces reflect applied changes without a manual full reload (same class of handling as other tag operations).
  - Automated checks: `dotnet build` / `dotnet test`, WebUI `npm run verify`; OpenAPI/clients updated only if a contract gap is found and fixed.
  - Docs/checklist/`CHANGELOG` `[Unreleased]`/`CONTEXT`/`COMMIT-MESSAGE` updated when work lands, per repo discipline.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` — pass (0 warnings).
  - `dotnet test ReelRoulette.sln` — pass (DesktopApp.Tests + Core.Tests).
  - WebUI `npm run verify` (contracts, typecheck, vitest, build, build-output) — pass.
  - Manual spot-check — **confirmed**: **WebUI** and **Desktop** Auto Tag — **Scan full library** on/off; with it off, scope is **enabled sources** only (e.g. disabled source excluded; filter/search do not exclude items that share an enabled source). **WebUI:** **Save** with combined manual + Auto Tag pending; **Close** / **Refresh** with **`Discard changes?`** when pending.
- **Deferrals / Follow-ups**:
  - Server-owned preference for scan scope instead of WebUI `localStorage`, if desired later.
  - Extra keyboard/ARIA polish on the Auto Tag grid, if not gated here.

### M9h - WebUI Filter Dialog Parity

- **Status**: ✅ Complete
- **Goal**: Bring WebUI playback filtering to parity with the desktop **Filter Media** experience: full filter state editing, tag selection with the same AND/OR semantics (global category combination and per-category local modes), tri-state tag chips, and preset catalog management (create, edit, rename, delete, reorder, update-from-current), while keeping a **quick preset** combobox for fast apply—API-authoritative state only, matching existing tag-editor parity patterns.
- **Scope**:
  - Replace **preset-only** WebUI playback filtering with a desktop-equivalent **filter** UI: **full-screen overlay** implemented the same way as the WebUI tag editor/dialog (layout/shell parity), with desktop-mirroring tabs/sections: **General** (basic flags, media type, client source inclusion, audio filter, duration min/max with **the same free-text format, parsing, validation, and “no min / no max” checkbox semantics as the desktop Filter Media dialog**—e.g. `HH:MM:SS` style inputs, not a divergent mobile-only shortcut), **Tags** (category combination mode, per-category local AND/OR, expandable categories, include/exclude tri-state chips aligned with desktop filter behavior), and **Presets** (list management, header/summary behavior for the **client-held** active preset name, save-as-new, update existing, discard/revert flows as on desktop).
  - **Chrome**: keep the **preset combobox** in its **current** location (shell placement unchanged); add a dedicated **Filter…** control that opens the filter overlay, placed in the **top-right media controls cluster** **to the left of** the tag-edit control (order: … **filter** → **tag** → **favorite** …), using the same **Material Symbols** glyph as desktop (**`filter_alt`**, same tooltip intent as desktop “Select filters…”).
  - Wire filter and preset behavior through existing server APIs (no client-local authoritative preset catalog or server-side filter overrides): **`GET`/`POST /api/presets`**, **`POST /api/presets/match`**, **`POST /api/random`** (request body carries either `filterState` or `presetId`), **`GET /api/sources`** (General tab), **`POST /api/tag-editor/model`** (Tags tab). Continue existing **SSE / `resyncRequired`** handling; **`POST /api/library-states`** is only for **favorite/blacklist item snapshots** on reconnect/resync—not for filter or preset payloads. **Preset list order is API-canonical**; verify OpenAPI and handlers expose every **filter JSON field** and ordering behavior WebUI needs; fix contract/server gaps if found.
  - **Preset catalog freshness:** refetch **`GET /api/presets`** when opening the filter overlay, after every successful **`POST /api/presets`**, and when **`resyncRequired`** is handled (same resync path as other WebUI reloads), so other tabs/clients cannot leave the UI silently stale.
  - **Active preset (UI concept):** the server does not store a per-session “active preset”; WebUI holds the active preset name (and current filter JSON) locally and uses **`POST /api/presets/match`** when a named preset needs to be resolved or labeled—same mental model as desktop’s combo + dialog.
  - Pairing/auth for these endpoints follows the **existing WebUI** and tag-editor gates (no separate auth model).
  - Reuse WebUI theming and chip/surface patterns established for tag editor parity (light/dark, shadows, category rows) so filter and tag UIs feel consistent with desktop and with each other.
- **Acceptance criteria**:
  - Every filter and tag option available in the desktop **Filter Media** dialog is available and persisted via the API from WebUI with the same eligibility semantics for random/next/previous/history playback, for **mouse and touch** workflows; **keyboard parity is best-effort** and not a gate for this milestone.
  - Every **`POST /api/random`** that requests a **new** random pick (including **Next** when not stepping through local history) sends either **`presetId`** **or** the **full serialized `filterState`**—including when **“None” / no named preset** is selected—so eligibility matches desktop for ad-hoc filters.
  - Tag logic matches desktop: global category combination (AND/OR), per-category local ALL/ANY, and tri-state per-tag include/exclude/none behavior including edge cases covered by desktop (empty selection, legacy preset shapes if still supported server-side).
  - Preset operations match desktop intent: create, rename, delete, reorder, set active from list, load preset into editor, update preset from current filter state, and “None” / clear active preset where applicable; preset catalog order matches **GET/POST `/api/presets`** everywhere (combobox + dialog).
  - Quick preset combobox remains usable for one-step apply; full filter overlay is reachable via the dedicated control for all editing workflows.
  - Automated checks green: `dotnet build` / `dotnet test` for the solution, WebUI `npm run verify` (plus any new unit tests for filter/preset client logic); OpenAPI/regenerated clients stay in sync if contracts change.
  - Docs and testing checklist updated for WebUI filter/preset parity (manual spot-check steps vs desktop).
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` passed locally after implementation.
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passed (contracts, `tsc`, Vitest including `filterStateModel.test.ts`, Vite build + output verify).
  - Manual spot-check: follow **WebUI filter / preset parity** rows in `docs/checklists/testing-checklist.md` against desktop Filter Media where applicable.
  - `CHANGELOG.md` `[Unreleased]`, `CONTEXT.md`, `docs/api.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, and `COMMIT-MESSAGE.txt` updated for this landing.
- **Deferrals / Follow-ups**:
  - Full keyboard/shortcut parity for the filter overlay → optional later milestone or polish pass.
  - Record any other server-only or UX deferrals here if scope must shrink during implementation.

### M9g - Linux Release Readiness and Sign-off

- **Status**: ✅ Complete
- **Goal**: Final Linux + cross-platform tray sign-off for server and **Desktop** client distribution.
- **Scope**:
  - **Owns** the comprehensive automated + manual verification **deferred** from **Avalonia Server Tray + Linux Runtime Baseline**, **Linux Packaging (Server + Desktop)**, **Linux Installation UX**, and **CI Linux Distribution Gates**: full cross-platform matrix (**Windows** + **Linux**), completed `docs/checklists/testing-checklist.md` with PASS/FAIL evidence, and packaged-artifact smokes where applicable.
  - Full automated + manual matrix on **CachyOS** (`linux-x64`): server (Avalonia tray + headless), **Desktop** client, WebUI/operator against server; include **XDG Autostart** on/off validation for **Launch Server on Startup** on **Linux**.
  - AppImage launch, application menu registration, and install script end-to-end on a clean **CachyOS** user profile verified in both tray-capable and headless scenarios.
  - **Windows** server tray and autostart: status **reviewed and documented** against the current baseline; **known open issues** with Avalonia/Win32 tray (if any remain) are **called out in release tracking**—this milestone is **not** blocked on full tray parity alone.
  - End-to-end packaged install/run; release notes and tracking updates.
- **Acceptance criteria**:
  - All automated gates green (build/test/web verify/package/smoke) for Linux and **Windows**.
  - Manual checklist complete with PASS/FAIL evidence (tray-capable vs tray-unavailable on Linux; **Linux** autostart on/off evidence).
  - No critical Linux-only regressions; **Desktop** client behaviors accepted by spot-check matrix where exercised; **Windows** server tray status **reviewed and documented**, with any unresolved Avalonia Win32 tray reliability called out in **release tracking** (does not indefinitely defer this milestone).
  - Tracking docs and changelog reflect **Desktop** naming (`desktop` paths) and Linux-ready state.
- **Verification evidence**:
  - **Automated (local, CachyOS `linux-x64`, 2026-04-10):** `dotnet build ReelRoulette.sln --configuration Release -p:TargetFramework=net10.0 -p:EnableWindowsTargeting=true -m:1`; `dotnet test ReelRoulette.sln --configuration Release --no-build -p:TargetFramework=net10.0 -p:EnableWindowsTargeting=true -m:1` (106 + 13 tests passed); WebUI `npm ci` + `npm run verify` in `src/clients/web/ReelRoulette.WebUI`; `pwsh ./tools/scripts/verify-web-deploy.ps1` (single-origin/control-plane smoke passed); `./tools/scripts/package-serverapp-linux-portable.sh` + `./tools/scripts/package-desktop-linux-portable.sh`; `./tools/scripts/package-serverapp-linux-appimage.sh` + `./tools/scripts/package-desktop-linux-appimage.sh`; `./tools/scripts/verify-linux-packaged-server-smoke.sh` (HTTP checks against extracted portable server OK); AppImage `--help` prerequisite text verified for server (ffmpeg/ffprobe) and desktop (LibVLC/VLC); portable staging tree: zero `.pdb` files, `run-server.sh` executable; `HOME=<temp> ./tools/scripts/install-linux-local.sh` verified stable AppImage names, `reelroulette-*.desktop` under `~/.local/share/applications`, and hicolor icons.
  - **CI / Windows matrix:** Default branch protection is expected to run `.github/workflows/ci.yml` jobs `build-test-linux` and `build-test-windows` (build + test on `ubuntu-latest` and `windows-latest`); Linux packaging + headless packaged-server smoke is `package-linux.yml` (on tag / `workflow_dispatch`). Windows Inno/portable packaging rows in the manual checklist remain **waived** on the maintainer checklist with rationale (no Windows desktop session in this evidence pass).
  - **Release tracking (Windows tray):** Avalonia **11.3.13** tray host with `NativeMenuItem` state updates marshaled on `Dispatcher.UIThread` after async registry work (see `[Unreleased]` / recent **Changed** notes in `CHANGELOG.md`). Residual Win32 tray flakiness, if observed in the field, is treated as a known follow-up—not a blocker for this sign-off per milestone scope.
  - **Docs:** `docs/checklists/testing-checklist.md` metadata + sign-off updated; `MILESTONES.md` (this entry + active tracker); `CHANGELOG.md` `[Unreleased]`; `COMMIT-MESSAGE.txt` final state.
- **Deferrals / Follow-ups**:
  - Manual execution of Windows-only checklist rows (console-window absence, Inno installers, `fetch-native-deps.ps1` on a clean tree, packaged Windows tray/no-console) on a **Windows** maintainer host when cutting a Windows release.
  - `install-linux-from-github.sh` against a live GitHub release asset set when tagging (or rely on CI release upload + spot-check).
  - Optional **CHANGELOG** release section cut and tag publish remain a separate release operator step unless bundled into the next release milestone.

### M9f - WebUI UX/UI Polish

- **Status**: ✅ Complete
- **Goal**: Deliver WebUI UX/UI polish and theme parity with desktop behavior without changing core API-first ownership boundaries.
- **Scope**:
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop, including parity for the consolidated refresh-complete summary (`Core refresh complete | Source | Duration | Loudness | Thumbnails`) using the same compact formatting rules as the desktop app (non-zero-only segments where applicable, `all cached` phrasing for duration/loudness no-scan cases, aligned thumbnail/source token vocabulary).
  - Add WebUI runtime theme detection (system/device dark or light mode) and apply matching theme behavior automatically.
  - Ensure WebUI styling parity with desktop for tag editor and related tag-surface visuals in both light and dark modes.
  - WebUI automatically follows device/system dark-light preference at runtime and keeps styling parity with desktop in both modes.
  - Keep WebUI tag chips visually consistent with desktop across themes:
    - chip text/icons remain white in both light and dark modes,
    - apply consistent chip drop-shadow styling matching desktop.
  - Fix WebUI tag editor category reorder behavior so move-up/move-down operations are treated as apply-worthy changes and activate apply/save affordances.
  - Update WebUI media-container controls layout to match desktop intent:
    - replace the bottom-center edit-tags control with a mute control matching desktop mute-button behavior,
    - move edit-tags action to the top-right controls cluster, positioned left of favorite.
  - Add control-only shadow treatment on the WebUI media container controls (do not dim or shadow the full media container surface).
- **Acceptance criteria**:
  - Web refresh-status projections provide actionable stage/progress detail comparable to desktop, including parity for the consolidated refresh-complete summary (`Core refresh complete | Source | Duration | Loudness | Thumbnails`) using the same compact formatting rules as the desktop app (non-zero-only segments where applicable, `all cached` phrasing for duration/loudness no-scan cases, aligned thumbnail/source token vocabulary).
  - WebUI category move-up/move-down actions in tag editor activate apply/save state and persist correctly when applied.
  - WebUI media controls include a desktop-matching mute button in the bottom-center controls position, and edit-tags is moved to top-right immediately left of favorite.
  - WebUI media-container control chrome uses control-only shadow treatment without darkening the full media container background.
  - WebUI automatically follows device/system dark-light preference at runtime and keeps styling parity with desktop in both modes.
  - WebUI tag chips preserve white text/icons with consistent drop-shadow treatment in both light and dark modes.
  - No regressions to previously completed reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).
- **Verification evidence**:
  - Automated: `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, WebUI `npm run verify` (contracts, typecheck, Vitest including refresh projection cases, production build + output verify).
  - Implementation: `src/clients/web/ReelRoulette.WebUI` — `refreshStatusProjection.ts` + `coerceRefreshSnapshot` wired from `app.js` for SSE refresh lines; tag editor `tagEditorCategoryOrderDirty`; `shell.ts` overlay layout (mute in transport row, tag edit top-right); `styles.css` control-only drop shadows and `theme-light`/`theme-dark` via `prefers-color-scheme` in `main.ts`; tag-chip styling unchanged for white glyphs + text shadows across themes.
  - Docs: `CHANGELOG.md` `[Unreleased]`, `CONTEXT.md`, `docs/checklists/testing-checklist.md`, `COMMIT-MESSAGE.txt` updated for this landing.
- **Deferrals / Follow-ups**:
  - WebUI `localStorage` persistence for mute preference (desktop persists volume/mute in settings) remains optional future UX if desired.

### M9e - Cross-Platform Library Migration

- **Status**: ✅ Complete
- **Goal**: Allow users to export their ReelRoulette library from one install and import it on another — including across **Windows** and **Linux** — with a guided source folder remapping step to handle path differences between systems.
- **Scope**:
  - **Export** (`Library > Export Library…`):
    - Produces a single `.zip` archive containing: `library.json`, `core-settings.json`, `desktop-settings.json`, `presets.json`, and an `export-manifest.json`.
    - `export-manifest.json` records: source OS, app version, and the list of unique source folder paths present in the library — used to drive the import remapping UI.
    - Optional checkbox: **Include thumbnails** — if checked, the `thumbnails/` directory is included in the zip. Default unchecked (keeps zip small; thumbnails regenerate on use).
    - Optional checkbox: **Include backups** — if checked, the `backups/` folder from the config directory is included in the zip. Default unchecked.
    - Export writes to a user-chosen location; suggested filename: `ReelRoulette-Library-{timestamp}.zip`.
  - **Import** (`Library > Import Library…`):
    - User picks a previously exported `.zip` via file picker.
    - App parses `export-manifest.json` and `library.json` to enumerate all unique source folder paths from the export.
    - A **remapping dialog** presents each source folder path from the export with a **Browse…** button (to locate the equivalent folder on the current system) and a **Skip** option (source remains in library but is treated as offline/missing, consistent with existing missing-source behavior).
    - After the user confirms remapping, app writes updated config files to the correct platform-specific locations (`~/.config/ReelRoulette/` on Linux; `%APPDATA%/ReelRoulette/` on Windows) with all source paths replaced by the remapped values.
    - If the zip includes thumbnails, copies them to the platform-appropriate local cache location (`~/.local/share/ReelRoulette/thumbnails/` on Linux; `%LOCALAPPDATA%/ReelRoulette/thumbnails/` on Windows).
    - If the zip includes backups, copies the `backups/` folder to the config directory on the target system (`~/.config/ReelRoulette/backups/` on Linux; `%APPDATA%/ReelRoulette/backups/` on Windows).
    - If an existing library is present, prompts the user before overwriting.
  - Path translation is performed entirely in-memory during import — paths in the zip are stored as-is from the source system; no normalization is applied at export time.
  - Feature works symmetrically: **Windows → Linux**, **Linux → Windows**, and same-OS machine-to-machine migrations all follow the same code path.
  - No changes to the internal library data model; migration is a read/transform/write operation on existing JSON structures.
- **Acceptance criteria**:
  - User can export a `.zip` from a Windows install and successfully import it on a Linux install (and vice versa) after remapping source folders.
  - Remapping dialog lists every unique source folder from the export; each can be remapped or skipped independently.
  - Skipped sources appear in the library as offline/missing without error on import.
  - Thumbnails are included in the zip when the checkbox is checked and copied to the correct location on import; import succeeds cleanly when thumbnails are absent.
  - Backups are included in the zip when the checkbox is checked and written to the correct config-directory location on import; import succeeds cleanly when backups are absent.
  - Existing library overwrite prompt appears when a library is already present on the target install.
  - `export-manifest.json` is present in every export zip and contains OS, version, and source path list.
- **Verification evidence**:
  - Implementation: `ReelRoulette.LibraryArchive` + `ReelRoulette.DesktopApp.Tests`, desktop `Library → Export Library…` / `Import Library…` (local disk zip I/O, remap/skip + overwrite confirm + import “server stopped” acknowledgment + **Import to disk** + local `desktop-settings.json` write); docs/checklist updated for current behavior.
  - Author manually verifies round-trip: export from **Windows**, import on **CachyOS** (and vice versa if both environments are available); library loads with remapped sources functional.
  - Same-OS round-trip (e.g. machine-to-machine on **CachyOS**) verified as a simpler baseline case.
  - Thumbnail include/exclude checkbox verified on export; thumbnail presence/absence handled correctly on import.
  - Backup include/exclude checkbox verified on export; backup presence/absence handled correctly on import.
- **Deferrals / Follow-ups**:
  - Automated cross-platform migration test coverage → future test milestone if warranted.
  - Partial-remap recovery (re-opening remapping dialog after a failed import) → follow-up if needed post-verification.

### M9d - CI Linux Distribution Gates

- **Status**: ✅ Complete
- **Goal**: Enforce Linux build/test/package quality in CI, including the **unified Avalonia server tray** and **Desktop** client; publish Linux artifacts to GitHub Releases on tag, mirroring the existing Windows packaging workflow.
- **Scope**:
  - Build/test/verify gates for Linux already exist in `ci.yml` (`build-test-linux`, `web-verify` jobs); `package-linux.yml` is packaging-only, consistent with `package-windows.yml`. No new build/test jobs are required in this milestone unless `ci.yml` needs adjustment for renamed **`desktop`** paths.
  - Add `package-linux.yml` as a peer to `package-windows.yml` — same trigger shape (`workflow_dispatch` + tag push), same version normalization pattern, `ubuntu-latest` runner, bash throughout.
  - `package-linux.yml` runs the Linux packaging scripts from `tools/scripts/` and produces all Linux artifact types established by the time this milestone lands: portable `tar.gz` packages (server + **Desktop**) and AppImage packages (server + **Desktop**).
  - On tag push, `package-linux.yml` uploads all Linux artifacts (`.tar.gz` + `.AppImage`) to the existing GitHub release via `gh release upload`, mirroring the `package-windows.yml` upload behavior.
  - CI artifact uploads (via `actions/upload-artifact`) publish packages to the workflow run for non-tag builds.
  - Smoke checks: packaged server reachability (health/version/operator); optional **headless** server boot without display.
  - Tray-related checks: when feasible, runner verifies **headless fallback**; tray-on-runner validation only where the image/session supports it (do not make CI flaky on absent status notifier).
  - **Windows** jobs remain green; adjust `package-windows.yml` only for renamed **`desktop`** project paths / **Desktop** `.csproj` location if needed.
- **Acceptance criteria**:
  - `package-linux.yml` exists as a standalone workflow file, structurally consistent with `package-windows.yml`.
  - Default-branch/PR Linux pipeline passes and catches Linux-only regressions in server, **Desktop** client, and packaging.
  - On tag push, all Linux artifacts (`.tar.gz` + `.AppImage` for server and **Desktop**) are uploaded to the GitHub release alongside Windows artifacts.
  - Headless server startup remains deterministic in CI (no hard dependency on GUI session for green builds).
- **Verification evidence**:
  - Landed `.github/workflows/package-linux.yml`: `ubuntu-latest`, .NET SDK 10.0.x, Node 22, `ffmpeg`, AppImageKit **12** `appimagetool` install, version normalization, `package-serverapp-linux-appimage.sh` + `package-desktop-linux-appimage.sh`, headless smoke via `tools/scripts/verify-linux-packaged-server-smoke.sh` (unsets display/DBus session variables for the server process; curls `/health`, `/api/version`, `/control/status`, `/operator`), `actions/upload-artifact`, tag path `gh release view` + `gh release upload` for `*.tar.gz` and `*.AppImage`.
  - `package-windows.yml` packaging job updated to .NET SDK **10.0.x** (aligned with solution TFMs and Linux packaging).
  - Default-branch PR CI remains `ci.yml` Linux/Windows build+test and WebUI verify; full tag/release artifact spot-check on GitHub Releases is expected on the next shipping tag (maintainer-verified).
  - CI green builds as the bar for this milestone do not replace the full manual + packaged-artifact sign-off matrix; that broader verification remains **deferred** to **Linux Release Readiness and Sign-off**.
- **Deferrals / Follow-ups**:
  - Full cross-platform manual verification and checklist completion beyond CI gates → **Linux Release Readiness and Sign-off**.

### M9c - Linux Installation UX

- **Status**: ✅ Complete
- **Goal**: Provide polished, low-friction installation paths for Linux users beyond the portable `tar.gz`: an **AppImage** for both server and **Desktop** client, a one-liner GitHub Releases install script, and application menu (`.desktop`) registration handled automatically during install.
- **Scope**:
  - **AppImage** packaging for server and **Desktop** client:
    - Build scripts under `tools/scripts/` producing `ReelRoulette-Server-{Version}-linux-x64.AppImage` and `ReelRoulette-Desktop-{Version}-linux-x64.AppImage`.
    - AppImage bundles carry embedded `.desktop` entry and icon metadata; application menu integration is automatic when `appimaged` is running or via an explicit `--install` flag pattern.
    - AppImage artifacts are self-contained (`linux-x64`) and strip symbols consistent with portable `tar.gz` policy.
    - Native prerequisites (ffmpeg/ffprobe, LibVLC) remain undocumented-as-bundled; document as prereqs in the embedded AppImage `README` or `--help` output, consistent with portable package policy.
  - **GitHub Releases install script** (`tools/scripts/install-linux-from-github.sh`):
    - Fetches the latest release artifact (AppImage preferred; portable `tar.gz` as fallback) from the GitHub Releases API.
    - Places AppImages under `~/.local/share/ReelRoulette/` with stable filenames; portable tarball fallback uses `~/.local/share/ReelRoulette/<target>/<version>/` plus a `~/.local/bin/` launcher symlink.
    - Registers a `.desktop` entry in `~/.local/share/applications/` and runs `update-desktop-database` so the app appears in the application menu.
    - Supports both server and **Desktop** client as install targets (via argument or interactive prompt).
    - Does not require `sudo`; targets the current user only.
  - **Application menu registration** is handled for both install paths (AppImage via embedded metadata + `appimaged` / `--install`; install script via explicit `.desktop` drop + database update); no manual post-install step required for menu integration.
  - Tray/headless fallback policy inherited unchanged from the baseline milestone: the packaged server must start headless when no tray or display is available, without hanging.
  - **Windows** packaging: unchanged; this milestone is Linux installation UX only.
- **Acceptance criteria**:
  - AppImage artifacts build deterministically from `tools/scripts/` for both server and **Desktop** client.
  - Artifact names follow `ReelRoulette-{Component}-{Version}-linux-x64.AppImage`, consistent with release naming conventions.
  - On a fresh install via AppImage or install script, the application appears in the desktop application menu without any manual post-install step.
  - Install script successfully fetches and installs the latest release artifact on the **CachyOS** baseline; user-local install requires no `sudo`.
  - Native prereqs are documented in embedded help/README; nothing is silently missing at launch.
- **Verification evidence**:
  - Landed scripts: `tools/scripts/package-serverapp-linux-appimage.sh`, `tools/scripts/package-desktop-linux-appimage.sh`, shared `tools/scripts/lib/appimage-helpers.sh`, `tools/scripts/install-linux-from-github.sh`; `full-release.ps1` invokes AppImage packaging on Linux after portable steps (requires `appimagetool` on the maintainer machine).
  - AppImages: `artifacts/packages/appimage/ReelRoulette-Server-{Version}-linux-x64.AppImage`, `artifacts/packages/appimage/ReelRoulette-Desktop-{Version}-linux-x64.AppImage` (built from portable tarballs; same publish/strip policy).
  - `docs/checklists/testing-checklist.md` includes AppImage and install-script smoke items; full matrix completion remains **deferred** to **Linux Release Readiness and Sign-off**.
  - Packaging author manual verification on **CachyOS** (AppImage launch, `--install` menu registration, install script end-to-end) is expected before relying on releases; comprehensive tray/headless matrix deferred as above.
- **Deferrals / Follow-ups**:
  - Full AppImage + install script smoke matrix and cross-platform checklist completion → **Linux Release Readiness and Sign-off**.

### M9b - Linux Packaging (Server + Desktop)

- **Status**: ✅ Complete
- **Goal**: Produce distributable Linux artifacts for server and the renamed **Desktop** client using repo-owned packaging scripts.
- **Scope**:
  - Add Linux packaging scripts under `tools/scripts/` (portable first):
    - Server portable package (`ReelRoulette-Server-{Version}-linux-x64.tar.gz`) including WebUI assets in `wwwroot`.
    - **Desktop** client portable package (`ReelRoulette-Desktop-{Version}-linux-x64.tar.gz`) using `desktop`-segment naming and layout aligned with post-rename project output.
  - Both packages are **self-contained** (`linux-x64`, `--self-contained true`) — .NET runtime is bundled; no .NET install required on the target machine.
  - Symbols are **stripped** from packaged binaries (prod-appropriate size; no `.pdb` files in the artifact).
  - Each package includes a **shell wrapper script** (`run-server.sh` / `run-desktop.sh` or equivalent) that sets up the environment (e.g. `LD_LIBRARY_PATH`, working directory) and launches the binary; correct executable bits set on wrapper and binary.
  - Each package includes a bundled `README` (or inline comments in the wrapper) documenting **native prerequisites**: `ffmpeg`/`ffprobe` and LibVLC must be present on the target system and are not bundled.
  - The packaged server binary must start in **headless mode** when no tray or display is available, without hanging — the same fallback behavior established in M9a applies to packaged artifacts.
  - **Windows**-OS packaging for **Desktop** deliverables: unchanged intent; update script paths/names in `tools/scripts/` if the rename moves `.csproj` or output names.
- **Acceptance criteria**:
  - Linux server and **Desktop** client portable artifacts build deterministically from scripts in `tools/scripts/`.
  - Artifacts are self-contained: no .NET runtime required on the target; symbols stripped.
  - Server package includes API/SSE/media/WebUI/Operator assets and whatever the Avalonia tray host requires at runtime.
  - Each artifact includes a shell wrapper with correct executable bits and native prereq documentation.
  - Artifact names follow the pattern `ReelRoulette-{Component}-{Version}-linux-x64.tar.gz`, consistent with Windows release naming (`ReelRoulette-Server-*`, `ReelRoulette-Desktop-*`); no legacy `windows`-path or Windows-centric client naming in Linux outputs.
  - Packaged apps run on the supported Linux baseline in both tray-available and headless/fallback scenarios.
- **Verification evidence**:
  - Landed scripts: `tools/scripts/package-serverapp-linux-portable.sh`, `tools/scripts/package-desktop-linux-portable.sh`; `full-release.ps1` invokes them on Linux after version/verify (and subsequent AppImage steps per Linux Installation UX).
  - Portable tarballs: `artifacts/packages/portable/ReelRoulette-Server-{Version}-linux-x64.tar.gz`, `artifacts/packages/portable/ReelRoulette-Desktop-{Version}-linux-x64.tar.gz` (each includes `run-*.sh`, `README.txt`, no `.pdb` in tree).
  - Docs/checklist updated (`docs/dev-setup.md`, `docs/domain-inventory.md`, `docs/checklists/testing-checklist.md`, `CONTEXT.md`, `README.md`).
  - Full packaged-artifact smoke (tray + headless, CachyOS or CI-chosen Linux, cross-platform checklist completion) remains **deferred** to **Linux Release Readiness and Sign-off**.
- **Deferrals / Follow-ups**:
  - Full Linux packaging smoke matrix and cross-platform checklist completion → **Linux Release Readiness and Sign-off**.
  - AppImage builds, GitHub Releases install script, and application menu (`.desktop`) registration → **Linux Installation UX** (planned).

### M9a - Avalonia Server Tray + Linux Runtime Baseline

- **Status**: ✅ Complete
- **Goal**: Replace the **Windows**-only WinForms server host tray with a cross-platform **Avalonia** tray that preserves today’s behavior; validate server and the **Desktop** client on Linux with **CachyOS (Arch-based, `linux-x64`)** as the primary sign-off environment; align repo naming from legacy **`windows` / Windows-oriented** client identifiers to **`desktop` paths** and **Desktop**-oriented project/product names.
- **Scope**:
  - **Server host tray (WinForms → Avalonia)**:
    - Retire the WinForms `NotifyIcon` host UI path; implement an Avalonia-based tray (or minimal Avalonia application lifetime) shared across **Windows** and Linux.
    - Preserve functional parity with the current tray: **Open Operator UI**, **Launch Server on Startup** (enable/disable autostart in parity across OSes—**Windows** registry-backed behavior today; **Linux** via **XDG Autostart** using a standard `*.desktop` entry in the user autostart directory, with the tray toggle installing/removing or enabling/disabling that entry as appropriate), **Refresh Library**, **Restart Server**, **Stop Server / Exit**, shared icon loading with sensible fallback, non-blocking menu actions, graceful UI-thread shutdown aligned with host restart/stop flows.
    - Preserve **light/dark context-menu theming** on **Windows** where applicable; on Linux, follow the **desktop environment** theme or document explicit behavior when the platform does not expose matching signals.
    - Unify server app targeting where practical (avoid a **Windows**-only TFM solely for tray unless required); keep **`net10.0` headless** path when **tray is unavailable** (no display / no status notifier / unsupported session) with deterministic behavior matching current non-**Windows** headless semantics.
  - **Desktop client**:
    - The **Desktop** GUI client is **already Avalonia**; scope here is Linux **validation and hardening** (not a UI-framework rewrite).
    - **Repo-wide rename**: `src/clients/desktop/...`-style paths, solution/project/assembly names, and docs/scripts slugs move to **`src/clients/desktop/...`**-style paths with **Desktop** client naming (e.g. `ReelRoulette.DesktopApp`—exact identifiers chosen at implementation time; keep **lowercase `desktop` in path segments**, **capitalized Desktop in product-facing names**).
  - **Linux baseline**:
    - Primary manual/automated sign-off reference: **CachyOS**, `linux-x64`, on typical **desktop environment** sessions (tray-capable **and** headless/tray-unavailable cases).
    - Validate consolidated server on Linux: `/health`, `/api/version`, `/api/events`, `/api/media/{idOrToken}`, `/operator`, plus WebUI/static hosting as today.
    - Validate **Desktop** client: launch, pair/connect, random/manual playback, core controls.
    - Validate native deps: **ffprobe/ffmpeg**, **LibVLC** runtime expectations.
    - Keep API-first / thin-client boundaries unchanged.
- **Acceptance criteria**:
  - On **Windows**, after the port, tray menu actions and host lifecycle behavior match pre-port intent (no loss of Operator open, refresh, restart, stop, startup-toggle behavior).
  - On **Linux**, server starts and serves the same core surfaces as above; **Desktop** client completes core workflows against that server.
  - **Launch Server on Startup** works on **Linux**: the tray toggle deterministically enables/disables user login autostart via **XDG Autostart** (`*.desktop` in the user autostart location), verified on **CachyOS** alongside the existing **Windows** registry-backed behavior.
  - Tray-capable **desktop environments** show the Avalonia tray when supported; otherwise server runs **headless** without hanging or requiring a display—deterministic fallback.
  - Linux prerequisites (including VLC/ffmpeg and tray fallbacks) are **documented and reproducible** for the CachyOS baseline.
  - **Desktop** rename is **consistent** in solution, primary scripts, and contributor-facing paths (no lingering **`windows`** folder naming or **Windows**-centric client wording as the canonical **Desktop** app identity).
  - No new client-local authoritative mutation paths are introduced.
- **Verification evidence**:
  - Informal confirmation that server and **Desktop** client run and perform core workflows on a **Linux** desktop baseline (maintainer-reported smoke) is sufficient for closing implementation work in this milestone when paired with green automated gates below.
  - Comprehensive manual verification across **Windows** and **Linux** (full checklist completion, packaged-artifact matrix, formal tray vs headless vs autostart evidence on both platforms) is **deferred** to **Linux Release Readiness and Sign-off** (see that milestone).
  - Automated gates passed (still required when touching release surfaces):
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Notes on any intentional **platform differences** (e.g. autostart implementation details) recorded in the doc slice of this series.
- **Deferrals / Follow-ups**:
  - Full cross-platform manual matrix and checklist-driven sign-off → **Linux Release Readiness and Sign-off**.

### M8i - Desktop App UX/UI Polish

- **Status**: ✅ Complete
- **Goal**: Deliver desktop UX/UI polish and light-dark theme compatibility improvements without changing core API-first ownership boundaries.
- **Scope**:
  - Improve desktop duplicate-review UX in the duplicates dialog:
    - for each duplicate group, render file thumbnails inline above each corresponding file info row for quick visual confirmation,
    - target display order per group:
      1. `x files share fingerprint...` header,
      2. keep-selection dropdown,
      3. file 1 thumbnail,
      4. file 1 info row,
      5. file 2 thumbnail,
      6. file 2 info row,
      7. continue for all files in that group.
  - Keep desktop tag editor category rows theme-compatible:
    - in light mode, category bars use light surfaces with dark-gray borders while text remains readable black,
    - in dark mode, current dark presentation remains visually consistent.
  - Keep desktop tag chips visually stable across themes:
    - chip text/icons remain white in both light and dark modes,
    - apply consistent chip drop-shadow styling aligned with WebUI appearance.
  - Update desktop filter dialog `Tags` tab for visual parity with tag editor presentation in both light/dark modes while preserving control differences:
    - chips expose add/remove controls only,
    - category rows expose local combine-mode dropdown only.
- **Acceptance criteria**:
  - Duplicate groups in desktop duplicates dialog show per-file thumbnails inline in the defined order, enabling quick visual validation before delete/apply actions.
  - Desktop tag editor category rows render with light-compatible surfaces/borders in light mode and retain readable text/contrast in both themes.
  - Desktop tag chips preserve white text/icons with consistent drop-shadow treatment in both light and dark modes.
  - Desktop filter dialog `Tags` tab has visual parity with tag editor surfaces across themes, while preserving intended control differences.
  - No regressions to previously completed reliability fixes (compatibility gating, reconnect/resync, deterministic testing simulations).
- **Verification evidence**:
  - Implemented desktop duplicate-review thumbnail rendering in the required per-group order using server thumbnail endpoint paths (`/api/thumbnail/{itemId}`) with explicit desktop bitmap loading for deterministic thumbnail display.
  - Added per-group duplicate handling selection to avoid forcing all groups to be processed:
    - each group now supports `Keep All` and per-item keep selection in the same dropdown,
    - desktop settings now persist a global `Duplicate Handling Default Behavior` (`Keep All` default, `Select Best` legacy behavior).
    - duplicate delete confirmation now shows total groups handled and total files to delete, and it no longer prompts when all groups are set to `Keep All`.
    - duplicate item metadata now includes tag counts, and keep-selection dropdown labels now include filename + plays/tags/favorite/blacklisted for easier comparisons.
  - Implemented shared desktop tag-surface styling tokens and applied them across tag editor and filter `Tags` tab:
    - category rows now use theme-aware shared surfaces/borders,
    - chip text/icons are pinned white in both themes,
    - chip text/icon shadows are strengthened to align with WebUI treatment,
    - chip state-specific inset shadow behavior now mirrors WebUI closer for selected states.
  - Preserved filter `Tags` behavior boundaries while applying visual parity:
    - chips remain add/remove controls only,
    - category rows retain local combine-mode dropdown controls,
    - filter tags now render in a responsive wrapping layout instead of a fixed three-column grid.
  - Automated verification passed:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln` (91 passed, 0 failed).
  - Manual validation checklist coverage for desktop UX/theme checks added to `docs/checklists/testing-checklist.md`.
- **Deferrals / Follow-ups**:
  - Capture post-implementation manual desktop verification evidence (light/dark screenshots + pass/fail notes) during the next targeted validation run.

### M8h - Tray Theme Parity and Material Symbols Icon Standardization

- **Status**: ✅ Complete
- **Goal**: Align Windows ServerApp tray UX with system theme behavior and standardize icon rendering on Material Symbols **font-based** patterns (with shared icon styles) for consistent cross-platform theming/customization.
- **Scope**:
  - Windows tray menu theme parity:
    - make tray context menu follow active system theme (light/dark) instead of fixed light styling,
    - keep existing tray action behavior unchanged while applying theme-aware rendering.
  - Desktop icon foundation (font-based):
    - wire `assets/fonts/MaterialSymbolsOutlined.var.ttf` into Avalonia resources for desktop icon rendering,
    - use shared `TextBlock.MaterialSymbolIcon` style for icon font setup,
    - standardize transparent icon-button behavior on shared styles:
      - base class: `IconGlyphBase`,
      - control wrappers: `IconGlyphButton`, `IconGlyphToggle`.
  - Full-surface migration contract (this milestone):
    - use mute button as the first implementation slice, then migrate the intended remaining icon controls/surfaces in desktop and WebUI within this milestone,
    - intentionally retain existing emoji/text indicator surfaces in `MainWindow.axaml` and `ManageSourcesDialog.axaml`,
    - preserve existing control behavior while replacing icon rendering implementation (no feature-behavior regressions during cutover).
  - Cross-surface tinting contract:
    - desktop/Avalonia icon font tinting is driven by foreground color/brush and system theme,
    - WebUI icon font tinting is driven via CSS color/theming so symbols inherit site theme state.
  - Asset/source-of-truth boundaries:
    - keep Material Symbols font asset under `assets/fonts/` as desktop icon-font source.
  - Preserve architecture boundaries:
    - keep icon/theming logic in host/UI/render layers,
    - do not move domain logic into clients for this work.
- **Acceptance criteria**:
  - Tray context menu follows current Windows system light/dark theme at runtime.
  - Desktop icon-font path is active via `MaterialSymbolsOutlined.var.ttf` and shared icon styles (`IconGlyphBase`, `IconGlyphButton`, `IconGlyphToggle`, `MaterialSymbolIcon`).
  - Desktop icon controls/surfaces targeted for migration are moved to the shared icon-style foundation and Material Symbols font rendering, with intentional retention of existing emoji/text surfaces in `MainWindow.axaml` and `ManageSourcesDialog.axaml`.
  - WebUI icon rendering is font-based (Material Symbols via CSS) and supports deterministic CSS-driven tinting.
  - All WebUI icon controls/surfaces are migrated to the Material Symbols font-based CSS path.
  - No regressions to existing tray actions (`Open Operator UI`, `Launch Server on Startup`, `Refresh Library`, `Restart Server`, `Stop Server / Exit`).
- **Verification evidence**:
  - Automated gate pass:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification captures:
    - tray menu light-mode rendering evidence,
    - tray menu dark-mode rendering evidence,
    - desktop icon-surface evidence showing targeted icon migration to shared icon-style + Material Symbols font rendering in light/dark themes, with intentional retention exceptions for `MainWindow.axaml` and `ManageSourcesDialog.axaml`,
    - WebUI icon-surface evidence showing full icon migration to Material Symbols CSS font rendering in light/dark themes,
    - icon-source evidence showing desktop font-asset usage (`assets/fonts/MaterialSymbolsOutlined.var.ttf`).
- **Deferrals / Follow-ups**:
  - Windows tray menu item icons are deferred; add Material Symbols-based tray menu icons in a follow-up milestone after theme-parity rollout stabilizes.
  - Linux tray theme/icon parity remains best-effort and is tracked under Linux milestone work unless explicitly expanded.

### M8g - Windows ServerApp System Tray Baseline (Single Binary, No Console)

- **Status**: ✅ Complete
- **Goal**: Provide a single-binary Windows `ReelRoulette Server` runtime that starts without a command prompt and exposes essential operator actions via system tray.
- **Scope**:
  - Convert Windows ServerApp startup to no-console behavior (`WinExe`) while preserving existing server/API behavior.
  - Require tray icon asset parity with repo branding:
    - system tray icon must use the shared app icon at `assets/HI.ico` (same icon source used by other app/package surfaces).
  - Add initial Windows system tray surface with minimum actions:
    - Open Operator UI (default browser to `/operator`),
    - Refresh Library (manual refresh trigger),
    - Restart Server,
    - Stop Server / Exit.
  - Keep server logic API-authoritative and reuse existing server services/endpoints for lifecycle/refresh operations.
  - Introduce host-UI abstraction so non-Windows runtimes remain headless-compatible and can adopt tray support later without server-core rewrites.
  - Preserve existing packaging/install behavior except for intentional startup UX change (no visible command prompt).
- **Acceptance criteria**:
  - Launching `ReelRoulette.ServerApp.exe` on Windows does not show a command prompt window.
  - Windows tray icon uses the shared app icon from `assets/HI.ico` (not a placeholder/default framework icon).
  - Tray icon appears reliably and menu actions execute deterministically:
    - Operator UI opens in default browser,
    - Refresh action triggers library refresh pipeline,
    - Restart action performs graceful self-restart,
    - Stop/Exit performs graceful shutdown.
  - Existing API/SSE/WebUI/Operator runtime behavior remains functional and unchanged in intent.
  - Single-binary Windows ServerApp packaging remains valid and install/run flow remains reproducible.
  - Linux runtime path is unaffected (continues headless unless Linux-focused tray work is explicitly enabled later).
- **Verification evidence**:
  - Implemented code path:
    - host-UI abstraction added under `src/core/ReelRoulette.ServerApp/Hosting/*` with Windows `NotifyIcon` tray host and non-Windows headless host.
    - tray menu actions wired for Open Operator UI, Refresh Library, Restart Server, and Stop Server / Exit.
    - Windows no-console runtime path implemented via `net9.0-windows` + `WinExe`; non-Windows path remains `net9.0` headless.
    - tray icon source now resolves shared `assets/HI.ico` via published `HI.ico` copy and repo fallback path.
  - Automated gate pass (2026-03-11):
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
  - Manual verification completed (`docs/checklists/testing-checklist.md`):
    - no-console Windows launch verified,
    - tray icon parity evidence verified for `assets/HI.ico`,
    - tray action behavior verified for all four required menu actions,
    - packaged portable/install runtime tray behavior verified.
- **Deferrals / Follow-ups**:
  - Linux tray support is explicitly deferred to the Linux milestone group as best-effort capability.
  - Advanced tray UX (notifications, rich status panes, localization, startup-on-login toggles) is out of scope for this milestone unless separately approved.

### M8f - Hardening, Packaging, and Release Readiness

- **Status**: ✅ Complete
- **Goal**: Finalize reliability, packaging, and migration cleanup for the new server-thin-client architecture.
- **Scope**:
  - Add/expand integration tests for API/SSE/runtime transitions and refresh pipeline behavior.
  - Complete migration cleanup of temporary compatibility paths.
  - Finalize packaging/distribution for:
    - `ReelRoulette Server` app,
    - thin desktop client,
    - WebUI assets served by server.
  - Produce migration/upgrade playbook and release-readiness checklist.
  - Add an **Operator Testing Suite** to `/operator` so desktop/web/server validation can be run from UI without ad-hoc shell workflows.
  - Add **connected client/session visibility** in Operator UI (client/session identity and related diagnostics in appropriate sections).
  - Add a dedicated **Server Logs** section in Operator UI for `last.log` with practical triage features.
  - Add **Testing Mode** gate for test/fault controls:
    - testing controls are available only when Testing Mode is enabled,
    - existing control admin auth mode remains authoritative:
      - if admin auth is `Off`, no auth required,
      - if admin auth requires auth, testing actions require auth.
  - Add safe, operator-driven fault/testing scenarios for client UX/error-handling validation, including:
    - API version/capability mismatch simulation,
    - client disconnect/reconnect behavior checks,
    - SSE replay/resync-required recovery checks,
    - missing/invalid media and related API-error path checks.
  - Produce full repo-wide manual testing artifacts linked to Operator test sections:
    - `docs/checklists/testing-checklist.md` (workflow + inline checklist + PASS/FAIL evidence capture).
  - Include Operator-assisted evidence capture quality-of-life features:
    - per-scenario PASS/FAIL + note + timestamp recording,
    - copy/export test evidence bundle (status + relevant log snippets),
    - per-scenario reset/cleanup actions for repeatable reruns.
- **Acceptance criteria**:
  - Stable multi-client operation (desktop + web minimum) against `ReelRoulette Server`.
  - No critical cross-client state divergence.
  - If `ReelRoulette Server` crashes or is unavailable, thin clients show friendly reconnect/start guidance and recover without state corruption.
  - Core JSON persistence uses atomic write semantics (write temp then replace) and is resilient to partial-write failures.
  - Web assets are served with cache-correct behavior (hashed filenames/cache-busting) to prevent stale UI after updates.
  - Full regression suite is part of default CI `dotnet test` gate and remains green.
  - Migration and upgrade documentation is complete and actionable.
  - Operator UI exposes connected client/session identity details sufficient for troubleshooting and correlation.
  - Operator UI includes a dedicated Server Logs section for `last.log` with tail/filter/search/copy-export workflows.
  - Operator Testing Suite can execute key client/server error-handling scenarios from UI when Testing Mode is enabled.
  - Testing controls obey Testing Mode and existing admin auth policy exactly.
  - Repo-wide manual testing manual/checklist is complete, actionable, and mapped to Operator test sections plus common app/server workflows.
  - End-to-end manual verification for desktop/web/server can be executed by a user without requiring ad-hoc command sequences.
- **Verification evidence (implementation + automated gate pass)**:
  - Operator/server implementation now includes:
    - connected client/session/SSE identity snapshots in `/control/status`,
    - dedicated server log endpoint (`/control/logs/server`) and Operator log workbench,
    - testing suite endpoints (`/control/testing`, `/control/testing/update`, `/control/testing/reset`) and Operator Testing Mode/fault controls.
  - Testing policy enforcement implemented:
    - scenario flags require Testing Mode ON,
    - testing actions enforce existing control admin auth mode (`Off` vs `TokenRequired`) using control auth credentials.
  - Windows packaging + CI deliverables implemented:
    - `tools/scripts/package-serverapp-win-portable.ps1`,
    - `tools/scripts/package-serverapp-win-inno.ps1`,
    - `tools/installer/ReelRoulette.ServerApp.iss`,
    - `.github/workflows/ci.yml`,
    - `.github/workflows/package-windows.yml`.
  - Manual validation artifacts added:
    - `docs/checklists/testing-checklist.md`.
  - Automated verification passes on current branch:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual checklist waiver applied per user direction:
    - remaining `NOT TESTED` items in `docs/checklists/testing-checklist.md` are accepted as pass/deferred for this milestone closeout.
  - High/medium reliability fix slice (post-manual test feedback) is implemented:
    - duplicate scan now shows deterministic API-recovery guidance instead of silent no-op,
    - auto-tag scan now reports runtime recovery state accurately and no longer relies on a false version-only health signal,
    - desktop now enforces API/capability compatibility gates and shows reconnect/resync SSE status guidance,
    - missing-media simulation now preserves random selection and fails deterministically at media-fetch endpoints with explicit `Media not found` API errors.
    - desktop legacy locate/remove missing-file dialog flow removed to keep missing-media remediation server-authoritative.
  - Deferred to **UX/UI Polish** (polish-only follow-up):
    - tag-editor apply latency/close responsiveness polish,
    - web refresh-status detail parity enhancements.

### M8e - WebUI and Mobile Thin-Client Contract Standardization

- **Status**: ✅ Complete
- **Goal**: Make WebUI and future mobile clients consume the same stable API contracts from `ReelRoulette Server`.
- **Scope**:
  - Standardize client-facing API contracts/capabilities for desktop/web/mobile parity.
  - Ensure WebUI uses the same API semantics as desktop for migrated behaviors.
  - Scope boundary: playback-session pipeline contracts/capabilities are owned by **Playback Session Contracts and Capability Surface** and are out of scope for this milestone.
  - Define session/reconnect rules on the shared contract surface:
    - persistent per-device `clientId`,
    - optional `sessionId` for future shared-session features,
    - SSE reconnect behavior with missed-revision recovery (replay when available, otherwise authoritative state refetch).
  - Define mobile-ready auth expectations (pairing/session continuity, reconnect continuity) using the same server contracts.
  - Keep client responsibilities strictly orchestration/render (no duplicated domain logic).
- **Acceptance criteria**:
  - WebUI and desktop are behaviorally aligned via shared server APIs.
  - Session/reconnect rules (`clientId`, optional `sessionId`, SSE missed-revision recovery) are documented and validated in client/server behavior.
  - Mobile bootstrap path is contract-ready with no new domain-logic duplication in clients and with documented auth/reconnect expectations.
  - Version/capability compatibility expectations are documented for client evolution.
- **Verification evidence**:
  - OpenAPI contract now documents optional `sessionId` for request/event surfaces and explicit SSE identity/reconnect expectations.
  - Server DTO/contracts now accept and propagate optional `sessionId`, and `/api/version` capabilities now include `identity.sessionId`.
  - Desktop now persists stable `CoreClientId`, generates per-runtime `CoreSessionId`, and propagates both through random/playback/SSE calls with reconnect `lastEventId`.
  - WebUI (legacy + modular seams) now propagates stable `clientId` plus runtime `sessionId` through random/requery/SSE paths and enforces capability checks including `identity.sessionId`.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
    - `npm run verify` (`src/clients/web/ReelRoulette.WebUI`)
    - `tools/scripts/verify-web-deploy.ps1`
  - Manual verification matrix prepared for desktop+web parity checks (session continuity, reconnect replay/resync, capability-mismatch UX) and ready for operator sign-off.

### M8d - Desktop Playback Policy Compromise (Local-First with API Fallback)

- **Status**: ✅ Complete
- **Goal**: Keep desktop playback performant for local/shared-storage scenarios while preserving API-first orchestration and playback-session-series readiness.
- **Scope**:
  - Introduce desktop playback policy:
    - local playback first when the selected media path is accessible on the desktop machine,
    - automatic API media playback fallback when local path access fails.
  - Route desktop manual library-panel play through API identity orchestration:
    - resolve stable media identity (`itemId`/API-routable identity) before playback-path selection so playback stats remain API-authoritative and deterministic,
    - if manual target cannot be mapped to stable identity, surface explicit user-facing error + guidance (no silent substitute/random reroute).
  - Add desktop setting `ForceApiPlayback` (boolean, default `false`):
    - when enabled, desktop always uses API playback even if local file access is available.
  - Preserve strict desktop thin-client boundaries for non-playback domains:
    - desktop may read/write only `desktop-settings.json`,
    - desktop may read local media files for playback/accessibility checks only,
    - no reintroduction of local authoritative state reads/writes (library/settings/log/domain mutations).
  - Keep this policy compatible with incremental playback-session work so API-only playback can be forced during that series' validation.
- **Acceptance criteria**:
  - Desktop playback selection is deterministic:
    - uses local playback when file path is locally accessible and `ForceApiPlayback=false`,
    - otherwise uses API media playback path.
  - Desktop manual library-panel play is deterministic and API-orchestrated:
    - manual play target is identity-resolved through API path first,
    - unmappable manual targets fail with explicit error + guidance (no implicit substitute playback path).
  - `ForceApiPlayback` is persisted in desktop settings, defaults to `false`, and is respected across restarts.
  - Desktop running on LAN clients can still play local files from shared/NAS mappings when accessible, with seamless API fallback when not accessible.
  - Outside allowed exceptions (desktop settings + media-read playback), no additional local file access is introduced in desktop app.
  - API-first/thin-client guarantees from the desktop thin-client cutover remain intact for source import, duplicates, auto-tag, playback-stats clear, and logging ownership.
- **Verification evidence**:
  - Desktop manual playback entry points now resolve stable API media identity first and surface explicit guidance when a manual target cannot be mapped.
  - Desktop playback target policy now deterministically selects local playback when media is readable and `ForceApiPlayback=false`, otherwise routes playback through API media URLs.
  - `ForceApiPlayback` is persisted in desktop settings (`desktop-settings.json`), defaults to `false`, and is wired through settings load/apply/save plus settings dialog toggle UX.
  - Random playback target handling now accepts API media URLs (absolute or relative) and resolves relative API media routes against configured core base URL.
  - Playback source type is tracked (`FromPath` vs `FromLocation`) so loop-toggle media recreation and timeline navigation preserve chosen playback-path semantics.
  - Automated verification passes:
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Documentation/tracking updates are synchronized for final milestone state: `README.md`, `CONTEXT.md`, `docs/api.md`, `docs/architecture.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`, `CHANGELOG.md`, `COMMIT_MESSAGE.txt`.

### M8c - Desktop Client Thin-Client Cutover

- **Status**: ✅ Complete
- **Goal**: Convert desktop `ReelRoulette` app to strict thin-client behavior against `ReelRoulette Server`.
- **Scope**:
  - Remove remaining desktop direct runtime/process control of `ReelRoulette Server` functionality.
  - Remove remaining desktop direct authoritative JSON mutation paths for migrated domains.
  - Ensure desktop commands/queries go through shared APIs only.
  - Ensure desktop sync/projection uses API + SSE paths only.
  - Route source import (`Import Folder`) through core API and remove desktop-local import path now that refresh pipeline ownership is server-side.
  - Route duplicate detection (scan + resolve/delete) through reusable core/server APIs and remove desktop-local duplicate execution paths.
  - Route auto-tag scan/suggestion + apply through reusable core/server APIs so the same logic can be consumed by desktop/web/operator/mobile clients.
  - Keep desktop-local persistence limited to client-side UI/preferences in `desktop-settings.json`.
  - Move `last.log` ownership fully to `ReelRoulette.ServerApp`: server-owned logic writes directly to server-side `last.log`, clients send client-event logs through API, and `last.log` is overwritten/reset on ServerApp startup/restart.
  - Desktop connect UX defaults to localhost `ReelRoulette Server`; if unavailable, show clear Connect/Start guidance without hosting/supervising server runtime.
- **Acceptance criteria**:
  - Desktop is a pure API/SSE consumer for authoritative core state.
  - Desktop writes only `desktop-settings.json` for client-side UI/preferences.
  - Desktop never writes core state files (for example `library.json` and core settings files) directly.
  - Import Folder executes through core API only and does not use a desktop-local source import path.
  - Duplicate detection executes through core API only; desktop has no local authoritative duplicate scan/delete path.
  - Auto-tag scan/suggestion and apply execute through core API only; logic is reusable across clients.
  - Desktop does not write `last.log` directly; ServerApp owns `last.log` lifecycle/reset, server-originated logs are written directly by server components, and client-originated logs are ingested via API into the centralized server log.
  - Desktop no longer directly controls, hosts, or supervises `ReelRoulette Server` runtime responsibilities.
  - Desktop functionality remains stable using API/SSE-only migrated flows.
- **Verification evidence**:
  - Desktop runtime auto-start/supervision path removed (`EnsureCoreRuntimeAvailableAsync` no longer launches `run-core.ps1`) and desktop core endpoint defaults to `http://localhost:51234`.
  - Source import now executes through `POST /api/sources/import` with desktop API orchestration.
  - Duplicate detection migrated to reusable server APIs:
    - `POST /api/duplicates/scan`
    - `POST /api/duplicates/apply`
    and desktop duplicate dialogs now orchestrate through those endpoints.
  - Auto-tag scan/suggestion + apply migrated to reusable server APIs:
    - `POST /api/autotag/scan`
    - `POST /api/autotag/apply`
    and desktop auto-tag dialog now consumes API scan/apply flows.
  - Playback stats clear migrated to reusable server API:
    - `POST /api/playback/clear-stats`
    and desktop ClearPlaybackStats action now executes through API command path.
  - Client log ingestion endpoint added (`POST /api/logs/client`) and desktop local `last.log` file writes removed from app/dialog/service log call paths.
  - ServerApp now resets centralized `last.log` at startup, preserving server-owned log lifecycle ownership.
  - OpenAPI updated for this milestone's endpoints/schemas and WebUI generated contracts refreshed (`openapi.generated.ts`).
  
### M8b - Control-Plane UI + API for Runtime Operations

- **Status**: ✅ Complete
- **Goal**: Provide first-class control-plane operations in `ReelRoulette Server` UI and APIs for status/settings/lifecycle management.
- **Scope**:
  - Add operator UI for:
    - runtime status/health,
    - settings editing/apply,
    - stop/restart operations (with start handled by external launch flow),
    - operation result/error visibility.
  - Expose control-plane API endpoints for trusted clients/tools:
    - `get status`,
    - `get settings`,
    - `apply settings`,
    - runtime restart operations.
  - Reserve `/control/*` namespace for control-plane/admin runtime operations, separate from media/client API routes.
  - Define transport/auth/trust model for control-plane APIs (local-first, optional LAN exposure with explicit safeguards).
  - Keep control-plane access local-first (localhost always available on the shared listener); LAN exposure is opt-in via runtime settings with explicit safeguards.
  - Define deterministic operation semantics:
    - idempotent command behavior,
    - conflicting-operation handling,
    - partial-failure reporting.
- **Acceptance criteria**:
  - Control-plane UI and API both function and are documented.
  - Control-plane access is localhost-available by default on the shared listener, with LAN control access disabled unless explicitly enabled by runtime settings.
  - LAN exposure for control-plane endpoints requires explicit enablement plus pairing/auth and clear operator warnings.
  - Settings apply/restart behavior is deterministic and observable.
  - Control-plane auth/trust policy is implemented and enforced.
  - No orphan child/runtime process behavior remains in supported restart/shutdown flows.
- **Verification evidence**:
  - Added control-plane APIs under `/control/*`: `GET /control/status`, `GET/POST /control/settings`, `GET/POST /control/pair`, `POST /control/restart`, and `POST /control/stop`.
  - Added control-plane settings persistence and deterministic apply result reporting (`accepted`, `restartRequired`, `message`, `errors[]`) in core settings service.
  - Added control-plane auth/trust enforcement with localhost-available default and explicit LAN gating tied to runtime bind settings plus optional admin token auth.
  - Expanded operator UI to a responsive dark-theme layout with runtime status, lifecycle controls, incoming/outgoing API telemetry panels, and connected-client visibility.
  - Added control telemetry and connected-client status projection (`paired sessions` and `SSE subscribers`) through `/control/status`.
  - Extended OpenAPI contract and server contract tests for new control-plane endpoints/schemas.
  - Extended smoke verification (`verify-web-deploy.ps1/.sh`) to validate control-plane status/settings endpoints in the consolidated runtime flow.

### M8a - ReelRoulette Server App Consolidation (Single Process, Single Origin)

- **Status**: ✅ Complete
- **Goal**: Consolidate runtime hosting into one user-facing `ReelRoulette Server` app (UI + core runtime + API/SSE + Web UI static serving) with no separate WebHost process and no atomic deployment switching.
- **Scope**:
  - Create the server control app as `ReelRoulette Server` (operator UI app).
  - Host all runtime responsibilities inside this app/process:
    - core domain runtime,
    - API endpoints,
    - SSE endpoint,
    - media streaming endpoints,
    - WebUI static asset serving.
  - Remove separate `WebHost` process dependency from runtime architecture.
  - Retire manifest-based atomic web deployment switching (`active-manifest`, version pointer switching) from active runtime behavior.
  - Enforce single browser-visible origin/port for WebUI + API + SSE + media.
  - Serve WebUI, API, SSE, and media streaming from the same scheme/host/port (one origin and one port).
  - Keep deployment model simple: current active web assets served directly by `ReelRoulette Server`.
- **Acceptance criteria**:
  - `ReelRoulette Server` runs as a single app/process and serves WebUI/API/SSE/media on one origin.
  - `ReelRoulette Server` exposes runtime metadata/health endpoints (`/health`, `/api/version`, `/api/capabilities`) for clients and operator diagnostics.
  - No separate WebHost process is required for normal runtime.
  - Atomic web version switching is removed from required runtime path.
  - Web client works without CORS for normal operation (same-origin by design).
  - Operator can manage runtime settings and service state from the `ReelRoulette Server` UI.
  - `ReelRoulette Server` app self-restart paths (settings changes or host failures) are graceful and deterministic (clean shutdown, no orphaned listeners/ports).
- **Verification evidence**:
  - Added new consolidated host project: `src/core/ReelRoulette.ServerApp` (single process serving API/SSE/media/static WebUI/operator UI).
  - `ReelRoulette.Server` endpoint composition now includes `GET /api/capabilities` and OpenAPI contract updates in `shared/api/openapi.yaml`.
  - Dynamic same-origin runtime config is served from server app (`/runtime-config.json`) and WebUI static content is served by the same host/port as API/SSE/media.
  - Web runtime `enabled` now controls WebUI availability only: when disabled and after restart, WebUI entry routes return `404` while API/SSE/media/operator paths remain available.
  - Web runtime settings apply follows explicit two-step semantics: apply persists settings, then operator triggers restart (`POST /control/restart`) for listen/auth/WebUI gating changes to take effect.
  - Operator UI now shows next operator URL hints after apply and runtime status content wraps/scrolls without overlap.
  - `tools/scripts/run-core.ps1` and `tools/scripts/run-core.sh` now start `ReelRoulette.ServerApp` by default.
  - `ReelRoulette.Worker` no longer supervises external `ReelRoulette.WebHost` in its startup path.
  - Prior version-switch runtime dependency is removed from required runtime behavior; `verify-web-deploy.*` now executes this milestone's single-origin smoke checks.
  - Operator UI path `/operator` provides status visibility, runtime settings apply (`/api/web-runtime/settings`), and restart control (`POST /control/restart`, localhost-only).

### M7e - Contract Compatibility and Final M7 Verification Gate

- **Status**: ✅ Complete
- **Goal**: Lock independent-release safety and complete this series sign-off with contract-compatibility guarantees.
- **Scope**:
  - Enforce N/N-1 compatibility policy with capability checks for independent web/core releases.
  - Generate TS web client contracts from OpenAPI; verify C# contract compatibility against the same API source.
  - Execute hybrid verification gate (automated + manual) as required milestone exit criteria.
- **Acceptance criteria**:
  - Web API/event models are generated from OpenAPI and validated in CI.
  - Capability checks prevent unsupported feature usage against older compatible core/server versions.
  - Automated gates pass: build-output asset serving, direct web-to-core SSE/refresh status projection, and OpenAPI compatibility checks.
  - Manual gates pass: direct web connect without desktop bridge, refresh status-line parity through run/fail/complete states, and auth/reconnect continuity.
  - Acceptance criteria across the full direct-web migration sequence are explicitly verified before advancing to the next major phase.
- **Verification evidence**:
  - OpenAPI contract generation pipeline added to WebUI (`openapi-typescript`) with generated types committed at `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`.
  - Web verify gate now includes stale-contract enforcement (`npm run verify:contracts`) and fails when generated TS contracts drift from `shared/api/openapi.yaml`.
  - `VersionResponse` contract now exposes explicit compatibility/capability metadata (`minimumCompatibleApiVersion`, `supportedApiVersions`, `capabilities`) in OpenAPI and server DTO mapping.
  - Web auth/version bootstrap paths enforce N/N-1 compatibility and required capability checks before normal feature execution.
  - C# compatibility regression coverage extended (`ServerContractTests`) for version compatibility/capability fields and OpenAPI property presence checks.
  - Automated verification gate passes:
    - `npm run verify` in `src/clients/web/ReelRoulette.WebUI`
    - `dotnet build ReelRoulette.sln`
    - `dotnet test ReelRoulette.sln`
  - Manual gate checklist/instructions prepared at `m7e-final-verification-checklist.md` for direct web-connect, refresh-status parity, and auth/reconnect continuity sign-off.

### M7d - Controlled Cutover and Legacy Bridge Retirement

- **Status**: ✅ Complete
- **Goal**: Complete migration to direct web-to-core paths while preserving current web-remote user experience, then remove legacy embedded web-remote bridge mutations/events.
- **Scope**:
  - Use a two-phase rollout with time-bounded migration feature flags:
    1. parity-capable independent web path behind flag(s)
    2. default-on independent path followed by legacy removal
  - Define flag owner/default-by-environment/validation coverage/removal target metadata.
  - Migrate the current legacy web UI experience into `ReelRoulette.WebUI` with functional and visual parity for the main media page, custom media controls, tag editor workflows, and related interaction paths.
  - Integrate desktop settings UX so users can continue controlling web runtime behavior from desktop UI (web server enable/disable, LAN binding/access, hostname behavior including `reel.local`, and auth/token settings mapped to core/server or web-host runtime controls).
  - Require explicit phase gates before any legacy removal:
    - automated parity/build/test gate pass
    - focused manual parity verification pass executed by the user (not by the agent)
    - explicit user approval to proceed with removing legacy `source/WebRemote` paths
  - Process requirement: after automated gate completion, the agent must stop implementation work, provide a manual migrated-WebUI verification checklist/instructions to the user, and wait for user confirmation before continuing.
  - Remove legacy desktop `WebRemoteServer` mutation/event bridge paths only after parity verification and gate approval.
- **Acceptance criteria**:
  - Migration flag metadata is explicit (owner, defaults, tests, sunset/removal target).
  - `ReelRoulette.WebUI` preserves required legacy web-remote UX parity for main media interactions, custom media controls, and tag editor flows.
  - Desktop settings maintain equivalent user-facing controls for web runtime behavior (including `reel.local`/LAN discoverability and enable/disable/auth configuration paths) after migration.
  - Required web parity flows are verified before default cutover and before legacy removal.
  - Manual parity verification is user-executed; the agent provides instructions/checklist and waits for user confirmation before removal work resumes.
  - Legacy embedded web-remote mutation/event bridge paths are removed only after automated gate pass, user-executed manual parity gate pass, and explicit user approval is recorded.
  - Desktop/core behavior remains stable after legacy path retirement.
  - Time-bounded migration flags are removed or scheduled with explicit follow-up completion criteria.
- **Verification evidence**:
  - Legacy embedded WebRemote stack under `source/WebRemote/` is removed from runtime behavior and project resources.
  - Desktop Web UI controls now map to core-owned runtime settings through API (`/api/web-runtime/settings`) and worker-managed WebHost lifecycle.
  - Core/server owns preset/filter randomization semantics used by both desktop and WebUI (`/api/presets`, `/api/presets/match`, `/api/random` with filter-state-first semantics).
  - Independent WebHost serves host-aware `runtime-config.json`, enabling direct `localhost`, mDNS (`*.local`), and LAN-IP client access without legacy desktop bridge routes.
  - Dynamic CORS allowlist and worker mDNS advertisement are derived from current web runtime settings and active LAN interfaces.
  - Gate A automated checks passed during cutover slices (`dotnet build ReelRoulette.sln`, core test gate, web verify/build checks).
  - Gate B manual parity checklist was user-executed and approved; Gate C explicit user approval was recorded prior to legacy removal.
  - Remaining post-cutover runtime stabilization issues (settings reopen/apply lockout, LAN apply consistency edge cases, worker/WebHost shutdown orphan cleanup) are explicitly deferred to **Control-Plane UI + API for Runtime Operations**.

### M7c - Zero-Restart Web Deployment, Caching, and Rollback

- **Status**: ✅ Complete
- **Goal**: Enable independent web deployments without desktop/core restarts and with fast rollback.
- **Scope**:
  - Publish web artifacts as immutable versioned bundles.
  - Activate versions via atomic pointer/symlink/manifest switch.
  - Apply split caching policy:
    - `index.html` and runtime config: no-store (or short revalidate-first policy)
    - hashed JS/CSS/assets: long-lived immutable caching
  - Add atomic rollback path to prior known-good web artifact.
- **Acceptance criteria**:
  - New web versions can be activated without restarting desktop app or core server.
  - Clients pick up shell/config updates promptly while retaining cached hashed assets.
  - Rollback to previous artifact works via atomic switch only.
  - Deployment/rollback flow is documented and repeatable.
  - Automated smoke checks validate active version, cache policy behavior, and rollback.
- **Verification evidence**:
  - `dotnet build ReelRoulette.sln` passes with the new `ReelRoulette.WebHost` project included.
  - `dotnet test ReelRoulette.sln` passes after this milestone's deployment-host/script changes.
  - `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI`.
  - `tools/scripts/verify-web-deploy.ps1` passes end-to-end:
    - publishes two immutable versions,
    - activates v1 then v2 without restarting web host process,
    - verifies split caching headers (`index.html`/`runtime-config.json` no-store, hashed assets immutable),
    - rolls back atomically to v1 via manifest pointer switch.
  - Activation/rollback are performed through atomic `active-manifest.json` pointer updates (`publish-web.*`, `activate-web-version.*`, `rollback-web-version.*`).

### M7b - Direct Web-to-Core Auth and SSE Reliability

- **Status**: ✅ Complete
- **Goal**: Move web auth/eventing to direct core/server integration with robust reconnect/resync behavior.
- **Scope**:
  - Implement pair-token bootstrap followed by secure HTTP-only session-cookie auth for web API/SSE usage.
  - Connect web directly to core/server SSE (`/api/events`) and refresh status APIs (`/api/refresh/status`) without desktop bridge/proxy.
  - Implement revision-aware SSE reconnect (`Last-Event-ID`), replay handling, and authoritative API requery fallback when replay gaps occur.
  - Define explicit CORS/cookie environment matrix for localhost, LAN/dev-cert, and production paths.
- **Acceptance criteria**:
  - Web auth sessions persist through expected reconnect/navigation flows using secure cookie semantics.
  - `refreshStatusChanged` and related events are projected directly from core/server to web status line during active runs, failures, and completions.
  - Replay-gap/resync-required scenarios recover by requerying authoritative API state with no persistent client divergence.
  - CORS/cookie policies validate in supported environments.
  - Automated reconnect/resync checks plus focused manual parity checks pass.
- **Verification evidence**:
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI` passes, including `sseClient` resync/requery regression coverage (`src/test/sseClient.test.ts`).
  - `dotnet test ReelRoulette.sln` passes with server auth/cookie/CORS policy coverage (`ServerAuthRegressionTests`, `ServerCookiePolicyTests`, `ServerRuntimeOptionsTests`).
  - `dotnet build ReelRoulette.sln` passes after stopping an active worker process that was locking `ReelRoulette.Server.dll`.
  - Manual CORS preflight check (allowed origin): `OPTIONS /api/version` with `Origin: http://localhost:5173` returns `204` plus `Access-Control-Allow-Origin: http://localhost:5173` and `Access-Control-Allow-Credentials: true`.
  - Manual CORS preflight check (blocked origin): `OPTIONS /api/version` with `Origin: http://example.com` returns `204` without `Access-Control-Allow-Origin`.
  - Manual pairing check: `POST /api/pair?token=...` returns `200` and `Set-Cookie` with `httponly` + `samesite=lax`, confirming credentialed session bootstrap behavior.

### M7a - Web Client Foundation and Independent Host Bootstrap

- **Status**: ✅ Complete
- **Goal**: Establish `ReelRoulette.WebUI` as an independently buildable/runnable web client without desktop-hosted runtime dependency.
- **Scope**:
  - Stand up `src/clients/web/ReelRoulette.WebUI` with Vite + TypeScript as the canonical web client project.
  - Add runtime config bootstrap for API/SSE endpoint resolution (no compile-time hardcoded base URLs).
  - Define independent dev-server and production-build workflows for web iteration.
- **Acceptance criteria**:
  - Web UI builds independently from desktop app build.
  - Web UI runs in dev mode with runtime-configured API/SSE endpoints.
  - Web iteration (build/reload) does not require restarting desktop app or core server.
  - Runtime config keys/shape are documented and validated in tests.
  - Automated checks for web build output and runtime-config schema pass.
- **Verification evidence**:
  - `npm run verify` passes in `src/clients/web/ReelRoulette.WebUI` (typecheck + runtime-config tests + production build + build-output checks).
  - Web dev bootstrap starts successfully via `npm run dev` without desktop/core restart dependencies.

### M6b - Feature Alignment Through API (Grid/Thumbnails + Unified Refresh Pipeline)

- **Status**: ✅ Complete
- **Goal**: Deliver API-backed grid/thumbnails and refresh pipeline refactor as a separate milestone.
- **Linked milestone note**: `Grid View for Library Panel with Thumbnail Generation (Unified Refresh Pipeline)` is tracked directly in this document.
- **Scope**:
  - Implement API-backed **Grid View with Thumbnail Generation** pipeline:
    - list/grid toggle persistence
    - thumbnail generation for photos/videos
    - pipeline execution and scheduling owned by core runtime (not desktop-local orchestration)
    - unified refresh stage order:
      1. source refresh
      2. duration scan
      3. loudness scan
      4. thumbnail generation
    - loudness stage runs new/unscanned files only (drop scan-all mode for this flow)
    - manual refresh is triggered via `POST /api/refresh/start` and runs through the same core pipeline as auto-refresh
    - `GET /api/refresh/status` snapshot endpoint complements SSE progress events for active clients
    - core rejects overlapping runs with `409 already running`; auto and manual refresh do not run concurrently
    - triggering manual refresh resets the auto-refresh interval baseline
    - status/progress events are emitted for both auto/manual runs; desktop projects them during this milestone, while direct web/mobile projection is completed in later direct-web milestones when those clients are decoupled from desktop-hosted bridges
  - Move refresh scheduling/config ownership to core host config:
    - support appsettings + CLI override model
    - client settings updates are pushed to core via API and persisted in core settings
    - default auto refresh remains enabled, default interval becomes 15 minutes, idle-only gating settings are removed
  - Define thumbnail artifact policy before feature completion:
    - artifact location convention (for example, `%LOCALAPPDATA%/ReelRoulette/thumbnails/{itemId}.jpg`)
    - invalidation rules (file change/fingerprint change -> thumbnail stale/regenerate)
    - target size/quality and video thumbnail timestamp strategy
- **Acceptance criteria**:
  - Grid view and thumbnail generation work end-to-end through server/core.
  - No standalone legacy duration/loudness actions in UX (as planned).
  - Refresh progress/status remains observable while dialogs close and via `GET /api/refresh/status` + SSE for desktop in this milestone; direct web-to-core SSE status parity is tracked in later direct-web milestones.
  - Core runtime is the single execution owner for unified refresh pipeline and auto-refresh scheduling.
  - Manual refresh is API-triggered (`POST /api/refresh/start`) and returns `409` when a refresh run is already active.
  - Auto-refresh timer baseline is reset when a manual refresh is started.
  - Core config defaults are applied (auto enabled, 15-minute interval, no idle gating settings).
  - Thumbnail artifact/invalidation policy is implemented and documented.
  - Regression tests cover thumbnail invalidation decisions, unified refresh stage sequencing, refresh overlap rejection (`409`), and status/progress projection behavior; all pass in `dotnet test`.

### M6a - Feature Alignment Through API (Web Tag Editing)

- **Status**: ✅ Complete
- **Goal**: Ship API-backed web tag editing parity as an independent, low-blast-radius milestone.
- **Scope**:
  - Implement API-backed **Web Remote Tag Editing** parity:
    - tag/category edit flows
    - batch-ready `itemIds[]`
    - immediate SSE sync
  - Migrate desktop tag/category/item-tag mutation flows to the same core/server command path:
    - desktop tag editing remains orchestration/UI only
    - mutation authority for migrated tag flows is core/server
    - remove direct desktop JSON mutation for migrated tag/category/item-tag paths
- **Acceptance criteria**:
  - Web remote tag editing works end-to-end through server/core.
  - Desktop and web tag edits execute through the same API/core mutation services (single-writer for migrated tag flows).
  - Desktop does not directly mutate JSON for migrated tag/category/item-tag flows.
  - Desktop and web remain synchronized via SSE for tag/category/item-tag changes.
  - Category delete semantics reassign tags to canonical `uncategorized` (fixed ID) instead of deleting tags.
  - `Uncategorized` appears in category dropdowns and remains hidden from category lists when it has no tags.
  - Tag editing can ship independently of grid/thumbnail/pipeline refactors.
  - Regression tests validate tag/category mutation contracts plus SSE sync projections (including batch-ready `itemIds[]` request handling) and pass in `dotnet test`.

### M5 - Desktop as API Client (State Flows)

- **Status**: ✅ Complete
- **Goal**: Convert desktop from state owner to API client for core state.
- **Scope**:
  - Add `ApiClient` layer to Windows app.
  - Migrate desktop flows to API calls + SSE updates:
    - favorites/blacklist
    - playback stat record
    - random selection command/query
    - filter/preset mutations
  - Keep local media playback rendering in desktop client.
- **Acceptance criteria**:
  - Desktop writes state via API (not direct in-process data mutation) for migrated flows.
  - SSE updates keep desktop UI in sync with out-of-process changes.
  - Existing user workflows remain stable.
  - Regression tests for desktop API-client request shape/parsing and this milestone's server-state replay/filter-session behaviors are added to `dotnet test` and passing.

### M4 - Worker Runtime (Headless Host)

- **Status**: ✅ Complete
- **Goal**: Run core runtime independently of desktop UI.
- **Scope**:
  - Implement `ReelRoulette.Worker` to host server + scheduled/background jobs.
  - Worker runtime target for this milestone:
    - run as console host first (service packaging/hardening deferred)
  - Add worker lifecycle:
    - start
    - stop
    - health check
    - graceful shutdown
  - Add pairing/auth primitive used by web and future clients:
    - auth can be required
    - localhost trust can be optionally enabled for dev workflows
    - LAN access requires pairing token/cookie
  - Add desktop lifecycle UX for headless core:
    - desktop detects core not running
    - desktop can show friendly `Start Core` action (or equivalent auto-start behavior)
  - Add scripts:
    - `tools/scripts/run-core.ps1`
    - `tools/scripts/run-core.sh`
- **Acceptance criteria**:
  - Worker runs headless and serves API/SSE.
  - Worker can be launched as console host on Windows.
  - Desktop can connect to worker localhost API.
  - Auth/pairing primitive is functional (required auth supported; localhost trust optional; LAN pairing enforced when configured).
  - Desktop provides a clear UX path when core is not running.
  - Closing desktop UI does not stop worker background jobs (when configured).

### M3 - Server API Skeleton + Contract First

- **Status**: ✅ Complete
- **Goal**: Introduce API seam as primary integration boundary.
- **Scope**:
  - Define initial `shared/api/openapi.yaml`.
  - Implement `ReelRoulette.Server` host with:
    - health endpoint
    - initial query/command endpoints
    - SSE endpoint envelope with revision model
  - Map existing DTOs to OpenAPI contract.
- **Acceptance criteria**:
  - OpenAPI validates and documents live endpoints.
  - SSE event envelope stable (`revision`, `eventType`, timestamp, payload).
  - Client reconnect behavior is explicitly defined (minimum: reconnect detects missed revisions and re-fetches state; optional replay endpoint may be added later).
  - Desktop can call at least one state query via HTTP locally.

### M2 - Storage and State Service Layer

- **Status**: ✅ Complete
- **Goal**: Centralize data access and persistence logic behind core services.
- **Scope**:
  - Move library/settings read-write and consistency logic to `Core/Storage`.
  - Define state services for:
    - library index
    - settings
    - runtime randomization states
  - Keep JSON schema compatibility with existing files.
  - Establish hybrid verification structure for migration safety:
    - make `dotnet test` the default quality gate using a standard test project (xUnit/NUnit/MSTest)
    - cover fast unit checks for randomization logic, filter evaluation, tag operations, and DTO mapping rules
    - create reusable verification modules (for example, `CoreVerification.RunAll(...)`) shared by test and harness flows
    - add a console system-check harness for fixture-driven migration checks, fingerprint pipeline invariants, `RefreshSource` reconciliation checks, and performance sanity checks
- **Acceptance criteria**:
  - Desktop no longer directly mutates raw JSON files in migrated flows.
  - Existing `library.json` and `settings.json` are read/written without schema break.
  - Migration tests cover load/save round trips.
  - `dotnet test` runs the default fast verification suite and is treated as the primary gate.
  - Console harness runs the same reusable verification checks with optional verbose logging and scenario/performance options (no duplicated assertion logic).

### M1 - Core Domain Extraction (Pure Library)

- **Status**: ✅ Complete
- **Goal**: Move pure business logic from desktop code-behind into reusable core library.
- **Scope**:
  - Move non-UI logic into `ReelRoulette.Core`:
    - randomization engine/state
    - filter evaluation
    - tag/preset mutation operations
    - fingerprint comparison helpers
  - Introduce interfaces for storage and background operations.
  - Keep UI consuming adapters around moved logic.
- **Acceptance criteria**:
  - `ReelRoulette.Core` has no Avalonia references.
  - Desktop behavior remains functionally equivalent for migrated paths.
  - Unit tests added for extracted logic hotspots (randomization, tag updates, filter set building).

### M0 - Repo and Solution Foundation

- **Status**: ✅ Complete
- **Goal**: Introduce target project layout and baseline docs without changing runtime behavior.
- **Scope**:
  - Create/organize solution folders: `src/core`, `src/clients`, `shared`, `docs`, `tools`.
  - Add project stubs:
    - `ReelRoulette.Core`
    - `ReelRoulette.Server`
    - `ReelRoulette.Worker`
    - `ReelRoulette.WindowsApp` (can initially point to existing desktop project strategy)
    - `ReelRoulette.WebUI` (structure only)
  - Add baseline docs:
    - `docs/architecture.md`
    - `docs/api.md`
    - `docs/dev-setup.md`
- **Acceptance criteria**:
  - Solution builds successfully.
  - Existing app startup/playback unchanged.
  - Documentation includes current-state and target-state diagrams.
