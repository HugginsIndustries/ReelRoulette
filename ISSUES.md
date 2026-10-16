# ReelRoulette Known Issues

This file holds known issues: things that behave wrong. Improvements are planned work and go in `MILESTONES.md`.

- An issue is fixed either by a milestone whose Scope names it by its title here, or on its own in a `Bugfix:` commit.
- When an issue is fixed, delete it from this file. The commit and `CHANGELOG.md` record the fix.

Each issue is a `###` heading with a short title, then these bullets:

- **What goes wrong**: the wrong behavior.
- **How to make it happen**: the steps or conditions that trigger it.
- **How much it matters**: how often it happens and what it costs.
- **Since**: the first release it is in, such as "v0.14.1".
- **Where**: the code involved, when known.

Mark a fact that was run or measured "(measured)" and one reasoned but not checked "(inferred)". An unmarked fact was read from the code, the docs, or git history.

## Tags and presets

### Deleting a tag added since the last save fails Save

- **What goes wrong**: Save sends a delete for a tag the server never had. The server refuses it with 409, and the save stops there with "Tag delete failed (409)": changes sent before it, such as categories, new tags, and renames, land, and the item's tag adds and removes, sent after it, don't (inferred).
- **How to make it happen**: In the Tags tab, add a new tag, delete it in Edit Tag, and press Save, alone or with other changes. Save stays enabled with only the add and delete, and posts `delete-tag` for the new tag, ahead of the item's adds and removes (measured).
- **How much it matters**: Moderate. It takes adding and deleting a tag before one Save, but then the rest of that save's item changes are dropped, with an error that doesn't say why.
- **Since**: v0.11.0, when the server began refusing a delete that changes nothing. The WebUI has sent the delete since v0.9.0.
- **Where**:
  - `deleteTag` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditor.ts` drops the tag's held add and queues a delete for it.
  - `planTagEditorSave` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` sends category changes, new tags, renames, deletes, and then the item's adds and removes, and `runTagEditorSave` stops at the first step the server refuses.
  - `/api/tag-editor/delete-tag` in `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` answers 409 when `LibraryCatalogSession.DeleteTag` changes nothing.

### A new tag named after a just-renamed tag is lost

- **What goes wrong**: Save sends the new tag before the rename, so the server takes it as the tag about to be renamed (inferred):
  - When the new tag's category differs, that tag moves to it and is then renamed, so the renamed tag ends up in the new tag's category and the new tag doesn't exist.
  - When the category is the same, the server refuses the new tag with 409, and the save stops with "Tag create/update failed (409)" before the rename.
- **How to make it happen**: In the Tags tab, rename Bob to Robert in Edit Tag, add a new tag named Bob, and press Save. Add tag accepts the name, and Save posts `upsert-tag` for Bob, then `rename-tag` from Bob to Robert (measured).
- **How much it matters**: Moderate. It's rare, and saving the rename before adding the tag avoids it, but the new tag goes missing without an error, or the save fails partway.
- **Since**: v0.9.0 (inferred): every release's WebUI sends new tags before renames.
- **Where**:
  - `newTagNameProblem` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditorModel.ts` frees a renamed tag's old name, since the tag shows under its new one.
  - `planTagEditorSave` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` sends new tags before renames.
  - `LibraryCatalogSession.UpsertTag` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs` takes an existing name as that tag, moving it to the given category, or refusing when it is already there, which `/api/tag-editor/upsert-tag` answers with 409.

### A tag delete can leave a preset that shows as None

- **What goes wrong**: Deleting a tag removes it from every preset, so a preset whose only condition was that tag is left holding the default filter. The WebUI names the default filter None, so choosing that preset shows None in the preset dropdown and the Filter tab's heading. The desktop's Add Preset, and the WebUI's before v0.15.0, can save such a preset too.
- **How to make it happen**: Save a preset whose only condition is one tag, delete that tag in the Tags tab or on another client, then choose the preset (measured, in Library and Tags screen tests).
- **How much it matters**: Low. The preset applies what it now holds, which is no filter, and keeps its name in the Filter tab's preset list, where it can be renamed or deleted (inferred).
- **Since**: v0.15.0, not yet released, where WebUI Tweaks names the default filter None. A tag delete has left presets with no conditions since v0.9.0.
- **Where**:
  - `RemoveTagFromPresetCatalog` in `src/core/ReelRoulette.Server/Services/ServerStateService.cs`, which `/api/tag-editor/delete-tag` calls, removes the tag from each preset's included and excluded tags.
  - `resolvePresetAnchor` in `src/clients/web/ReelRoulette.WebUI/src/filter/filterStateModel.ts` names the default filter None.
  - The server keeps such a preset. Per-Preset Preset Writes makes the preset routes refuse one, which a tag delete doesn't go through.

## Filter tab

### Erasing a duration on the iPad leaves the Filter tab's changes

- **What goes wrong**: An emptied Min or Max duration still counts as a change. The Filter tab's heading stays "Preset: None*", the orange dot stays, and Apply and Discard changes stay enabled, while the field shows no red icon. An empty duration should be no limit (measured, on the user's iPad).
- **How to make it happen**: On the iPad, in Safari or the installed app, type a duration in Min or Max, such as "1:00" or "abc", leave the field by tapping elsewhere, tap the field again, and erase it. Leaving with the keyboard's hide button instead works correctly, and so do other devices and other General changes put back (measured, on the user's devices).
- **How much it matters**: Low. It takes a duration typed, left with a tap, and erased on the iPad, and Discard changes puts the filter back (inferred).
- **Since**: v0.15.0, not yet released, where the Filter tab's dot compares the tab with the applied filter.
- **Where**:
  - `DurationRow` in `src/clients/web/ReelRoulette.WebUI/src/ui/FilterDialog.tsx` reads each keystroke with `typeDuration` and the field's change event with `changeGeneral`.
  - `filterWithTypedDurations` in `src/clients/web/ReelRoulette.WebUI/src/filter/filterDialogModel.ts` reads each duration as its field's text for the dot, the heading's star, and Apply.
  - The Filter screen tests "a minimum of "1:00" typed, left, and erased with a browser's events…", for both fields and both texts, and the mockup's matching checks replay a browser's events for these steps and pass (measured). The cause is likely how iPadOS orders its events when focus moves by a tap (inferred).

## Server

### The ffmpeg check can hang on its own output

- **What goes wrong**: The check that ffmpeg runs redirects its standard output and error, reads neither, and waits for it to exit, so output that fills a pipe would hang the check and the refresh waiting on it.
- **How to make it happen**: Point the server at an ffmpeg whose `-version` output is larger than a pipe's buffer.
- **How much it matters**: Low. `ffmpeg -version` prints a few kilobytes, less than a pipe holds (inferred).
- **Since**: v0.9.0.
- **Where**: `RefreshPipelineService.VerifyFfmpegAsync` in `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`. The other ffmpeg and ffprobe calls already read stderr.

### Restarting a dev server goes through a shell

- **What goes wrong**: On Linux, a restart of a server running under the `dotnet` host launches its replacement through one `/bin/bash -lc` script with the process path, assembly path, host, and port written into it, so a path containing `"` or `\` breaks the restart.
- **How to make it happen**: Run the server with `dotnet` from a folder whose path contains `"` or `\`, then restart it.
- **How much it matters**: Low. Packaged servers start their replacement directly, without a shell.
- **Since**: v0.11.0.
- **Where**: `RestartCoordinator.TryLaunchReplacementProcess` in `src/core/ReelRoulette.ServerApp/Program.cs`.

### A failed stop leaves restart and stop stuck

- **What goes wrong**: Restart and stop set a flag that is cleared only when the request is refused. If the scheduled stop fails or the process doesn't exit, every later restart or stop answers "already in progress".
- **How to make it happen**: Request a restart or stop while something keeps the process from exiting, then request another.
- **How much it matters**: Low. It's rare, but getting out of it takes stopping the process by hand (inferred).
- **Since**: v0.9.0.
- **Where**: `_restartInProgress` in `RestartCoordinator.TryRestartAsync` and `TryStopAsync`, in `src/core/ReelRoulette.ServerApp/Program.cs`.

### The autostart entry doesn't escape its path

- **What goes wrong**: The Linux autostart entry writes `Exec="<path>"` without escaping, while the Desktop Entry spec requires `"`, `` ` ``, `$`, and `\` inside a quoted argument to be backslash-escaped and `%` to be written `%%`, so a path holding one of them doesn't start.
- **How to make it happen**: Install the server under a path containing one of those characters and turn on Launch Server on Startup.
- **How much it matters**: Low. Install paths rarely hold those characters.
- **Since**: v0.11.0.
- **Where**: `LinuxXdgStartupLaunchService.BuildDesktopEntryContent` in `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs`.

### Autostart status misses other ways it is off

- **What goes wrong**: Launch Server on Startup shows as on whenever the autostart file lacks `Hidden=true`, even when `X-GNOME-Autostart-enabled=false` turns it off or the `Exec` target no longer exists.
- **How to make it happen**: Turn the entry off in the desktop's startup applications settings, or move the server after turning the setting on.
- **How much it matters**: Low. The setting reads on while the server won't start at login.
- **Since**: v0.11.0.
- **Where**: `LinuxXdgStartupLaunchService.GetStatusAsync` in `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs`.

### Stopping mid-refresh waits for a file's hash

- **What goes wrong**: The refresh's fingerprint stage hashes each whole file synchronously, with no cancellation, so stopping the server during a large file waits for its hash to finish.
- **How to make it happen**: Stop or restart the server while a refresh fingerprints a large file, more so on a slow share.
- **How much it matters**: Low. A stop or restart is late by as long as reading the rest of that file takes (inferred).
- **Since**: v0.9.0.
- **Where**: `FileFingerprintService.ComputeFingerprint` in `src/core/ReelRoulette.Core/Fingerprints/FileFingerprintService.cs`, called from the fingerprint stage in `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`.

### Shuffle states pile up for every client session

- **What goes wrong**: The server keeps one random-pick shuffle state per client and session id, taken from requests, and never removes any, so its memory grows until it restarts.
- **How to make it happen**: Open the WebUI in new tabs or app launches over time, each of which brings a new session id, and pick at random in each.
- **How much it matters**: Moderate for a server that runs for weeks. Each state can hold a shuffle of the whole eligible set (inferred).
- **Since**: v0.9.0.
- **Where**: `LibraryPlaybackService._clientRandomizationStates` in `src/core/ReelRoulette.Server/Services/LibraryPlaybackService.cs`.

### A restarted server can replay events without a resync

- **What goes wrong**: The server's event revisions start at zero on every start. A client that reconnects after the restarted server has published past that client's last event ID, but no further than its replay history, gets a partial replay from the new server and no `resyncRequired`, so it misses changes.
- **How to make it happen**: Restart the server while a client is away, let the restarted server publish more events than the client had seen, then reconnect the client.
- **How much it matters**: Low. The client keeps stale state until it reloads, and only within that window of revisions (inferred).
- **Since**: v0.9.0.
- **Where**: The revision counter in `ServerStateService`, in `src/core/ReelRoulette.Server/Services/ServerStateService.cs`.

### Unscanned videos match neither audio filter

- **What goes wrong**: **With audio** matches `has_audio = 1` and **Without audio** `has_audio = 0`, so a video whose audio hasn't been scanned (`has_audio` NULL) is hidden by both. Which of them should include it is undecided, and `docs/api.md`, the WebUI's labels, and tests follow whichever is chosen.
- **How to make it happen**: Filter by either audio option while a refresh hasn't yet scanned new videos, or for a video ffmpeg can't read.
- **How much it matters**: Low. A full refresh with ffmpeg scans every video it can read.
- **Since**: v0.9.0.
- **Where**: `LibraryCatalogListQuery` in `src/core/ReelRoulette.Core/Library/LibraryCatalogListQuery.cs`.

## Dev scripts

### run-server-rebuild builds without installing packages

- **What goes wrong**: `tools/scripts/run-server-rebuild.ps1` runs `npm run build` without installing packages, so a clean clone fails to build the WebUI, and a changed lockfile builds with stale packages.
- **How to make it happen**: Run the script on a clone without `node_modules`, or after pulling a change to `package-lock.json`.
- **How much it matters**: Low. It's a dev script, and running `npm ci` first avoids it.
- **Since**: v0.9.0.
- **Where**: `tools/scripts/run-server-rebuild.ps1`.

### Five scripts ignore a switch they don't take

- **What goes wrong**: `cut-changelog.ps1`, `reset-checklist.ps1`, `check-milestones.ps1`, `run-server.ps1`, and `verify-web-deploy.ps1` have no `[CmdletBinding()]`, so a switch they don't take, such as a typo, is silently ignored and the script runs as if it weren't given, instead of being refused.
- **How to make it happen**: Pass any of them a switch it doesn't take, such as `-Bogus`: `check-milestones.ps1` runs its checks, `reset-checklist.ps1` resets the checklist, and `cut-changelog.ps1` goes on to its own checks (measured, the last two on scratch copies). `run-server.ps1` and `verify-web-deploy.ps1` declare their parameters the same way (inferred).
- **How much it matters**: Low. A mistyped switch, such as `-Stagged` for `check-milestones.ps1`, quietly gives a different run than asked for, but the usual commands in the docs and skills are spelled right.
- **Since**: v0.9.0 for `run-server.ps1` and `verify-web-deploy.ps1`, v0.10.0 for `reset-checklist.ps1`, and v0.14.0 for `cut-changelog.ps1` and `check-milestones.ps1`. None of them has ever had `[CmdletBinding()]`.
- **Where**:
  - The `param()` blocks of `tools/scripts/cut-changelog.ps1`, `tools/scripts/reset-checklist.ps1`, `tools/scripts/check-milestones.ps1`, `tools/scripts/run-server.ps1`, and `tools/scripts/verify-web-deploy.ps1`. `set-release-version.ps1` already has `[CmdletBinding()]`, and `stage-webui-assets.ps1`'s `[Parameter(Mandatory = $true)]` already makes it refuse an unknown switch (measured).
  - With it, every caller must pass only switches the script takes, so a fix checks each caller first: `run-server-rebuild.ps1` calls `run-server.ps1`; `set-release-version.ps1` calls `verify-web-deploy.ps1` with no parameters; `tools/scripts/tests/test-scripts.ps1` calls the other three; and the plan-from-report, pre-release, promote-milestones, and review-staged skills call `check-milestones.ps1`, `cut-changelog.ps1`, or `reset-checklist.ps1`.
