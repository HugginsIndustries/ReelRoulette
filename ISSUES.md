# ReelRoulette Known Issues

This file holds known issues: things that behave wrong. Improvements are planned work and go in `MILESTONES.md`.

- An issue is fixed either by a milestone whose Scope names it by its title here, or on its own in a `Bugfix:` commit.
- When an issue is fixed, delete it from this file. The commit always records the fix, and `CHANGELOG.md` records it only when users would notice it, as its style note says.

Each issue is a `###` heading with a short title, then these bullets:

- **What goes wrong**: the wrong behavior.
- **How to make it happen**: the steps or conditions that trigger it.
- **How much it matters**: how often it happens and what it costs.
- **Since**: the first release it is in, such as "v0.14.1".
- **Where**: the code involved, when known.
- **Intended fix**: how the user has decided to fix it, when that is settled.

Mark a fact that was run or measured "(measured)" and one reasoned but not checked "(inferred)". An unmarked fact was read from the code, the docs, or git history.

## Tags and presets

### Deleting a tag or category added since the last save fails Save

- **What goes wrong**: Save sends a delete for a tag or category the server never had. The server refuses it with 409, and the save stops there with 'Tag delete failed: There's no tag named "{name}".' or "Category delete failed: That category doesn't exist.": changes sent before it land, and the ones sent after it don't (inferred). A category's delete goes before new tags, renames, tag deletes, and the item's adds and removes, and a tag's delete before the item's adds and removes.
- **How to make it happen**: In the Tags tab, add a new tag and delete it in Edit Tag, or add a new category and delete it in Edit Category, and press Save, alone or with other changes. Save stays enabled with only the add and delete, and posts `delete-tag` or `delete-category` for the new one (measured).
- **How much it matters**: Moderate. It takes adding and deleting a tag or category before one Save, but then the rest of that save's changes after the delete are dropped, with an error that says only that the tag or category doesn't exist.
- **Since**: v0.11.0, when the server began refusing a delete that changes nothing. The WebUI has sent the tag's delete since v0.9.0, and the category's since at least v0.11.0 (inferred).
- **Where**:
  - `deleteTag` and `deleteCategory` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditor.ts` drop the tag's or category's held add and queue a delete for it.
  - `planTagEditorSave` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` sends category changes, category deletes, new tags, renames, tag deletes, and then the item's adds and removes, and `runTagEditorSave` stops at the first step the server refuses.
  - `/api/tag-editor/delete-tag` and `/api/tag-editor/delete-category` in `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` answer 409 when `LibraryCatalogSession.DeleteTag` or `DeleteCategory` changes nothing.
- **Intended fix**: The Tags tab blocks deleting a tag or category that isn't saved yet, with a clear reason, such as a disabled Delete with a tooltip, rather than sending the delete. The server's refusal stays.

### A new tag named after a just-renamed tag is lost

- **What goes wrong**: Save sends the new tag before the rename, so the server takes it as the tag about to be renamed (inferred):
  - When the new tag's category differs, that tag moves to it and is then renamed, so the renamed tag ends up in the new tag's category and the new tag doesn't exist.
  - When the category is the same, the server refuses the new tag with 409, and the save stops with 'Tag update failed: A tag named "Bob" already exists.' before the rename.
- **How to make it happen**: In the Tags tab, rename Bob to Robert in Edit Tag, add a new tag named Bob, and press Save. Add tag accepts the name, and Save posts `upsert-tag` for Bob, then `rename-tag` from Bob to Robert (measured).
- **How much it matters**: Moderate. It's rare, and saving the rename before adding the tag avoids it, but the new tag goes missing without an error, or the save fails partway.
- **Since**: v0.9.0 (inferred): every release's WebUI sends new tags before renames.
- **Where**:
  - `newTagNameProblem` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditorModel.ts` frees a renamed tag's old name, since the tag shows under its new one.
  - `planTagEditorSave` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` sends new tags before renames.
  - `LibraryCatalogSession.UpsertTag` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs` takes an existing name as that tag, moving it to the given category, or refusing when it is already there, which `/api/tag-editor/upsert-tag` answers with 409.
- **Intended fix**: The Tags tab blocks adding a tag named after one whose rename isn't saved yet, with a clear reason, such as a disabled Add tag with a tooltip. The server's behavior stays.

### Add or Remove on a tag the file already matches fails Save

- **What goes wrong**: Add on a tag the playing file already has, or Remove on one it doesn't have, is sent as a change. When every add and remove in the save changes nothing, the server refuses it with 409, and Save fails with "Tag apply failed: The tags were already that way." A save that also changes something takes it all (inferred).
- **How to make it happen**: In the Tags tab, press Add on a green tag, or Remove on one that isn't green, and press Save. The WebUI posts `apply-item-tags` with that add or remove (measured), and the server refuses an apply that changes nothing (measured, in `TagEditorRouteTests`).
- **How much it matters**: Low. Nothing is lost, but one tap on a lit chip's Add gives an error for a change that does nothing.
- **Since**: v0.11.0, when the server began refusing an apply that changes nothing.
- **Where**:
  - `Chip` in `src/clients/web/ReelRoulette.WebUI/src/ui/TagEditor.tsx` enables Add and Remove whatever the item has, disabling them only when the items can't change.
  - `LibraryCatalogSession.ApplyItemTagEdits` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs` returns false when nothing changes, which `/api/tag-editor/apply-item-tags` answers with 409.
- **Intended fix**: The Tags tab blocks Add on a tag every file has and Remove on one none has, with a clear reason, such as a disabled button with a tooltip. The server's refusal stays.

### Deleting a tag and adding it back before a save fails Save

- **What goes wrong**: Adding a tag deleted since the last save, in its own category, drops the held delete, so Save sends only a new tag that is already there. The server refuses it with 409, and the save stops with 'Tag update failed: A tag named "{name}" already exists.': renames, deletes, and the item's adds and removes, sent after it, don't land (inferred).
- **How to make it happen**: In the Tags tab, delete Bob in Edit Tag, add a new tag named Bob in Bob's category, and press Save. Save posts only `upsert-tag` for Bob (measured).
- **How much it matters**: Low. It's an odd sequence that leaves the tag as it was, but the rest of that save's changes are dropped with an error.
- **Since**: v0.11.0, when the server began refusing a new tag already in its category (inferred).
- **Where**:
  - `addTag` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditor.ts` drops a held delete of the same name.
  - `planTagEditorSave` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` sends new tags before renames, deletes, and the item's adds and removes.
  - `LibraryCatalogSession.UpsertTag` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs` refuses a tag already in the category it names, which `/api/tag-editor/upsert-tag` answers with 409.
- **Intended fix**: The Tags tab blocks adding a tag whose delete isn't saved yet, with a clear reason, such as a disabled Add tag with a tooltip. The server's refusal stays.

### An add or remove waiting on a renamed tag goes to its old name

- **What goes wrong**: Save sends a tag's rename before the item's adds and removes, which still name the tag's old name, so the file gets or loses the old name instead of the renamed tag, and an add brings the old name back as a tag of its own (inferred).
- **How to make it happen**: In the Tags tab, press Add on Bob, rename Bob to Robert in Edit Tag, and press Save. Save posts `rename-tag` from Bob to Robert, then `apply-item-tags` adding Bob (measured).
- **How much it matters**: Moderate. It's rare, but the file ends up with a tag the user just renamed away, without an error.
- **Since**: v0.9.0 (inferred): every release's WebUI sends renames before the item's adds and removes.
- **Where**:
  - `saveEdit` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditor.ts` renames the tag without carrying its waiting add or remove to the new name.
  - `planTagEditorSave` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` sends renames before the item's adds and removes.
  - `LibraryCatalogSession.ApplyItemTagEdits` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs` adds a tag the catalog doesn't have.
- **Intended fix**: The Tags tab blocks renaming a tag with an add or remove waiting, and adding or removing a tag with a rename waiting, with a clear reason, such as a disabled control with a tooltip. The server's behavior stays.

### A tag delete or rename can leave a preset that shows as None or as another preset

- **What goes wrong**: Deleting a tag removes it from every preset, and renaming a tag onto another tag's name merges the two in every preset, so a preset can be left holding the default filter, or the same filter as another preset:
  - The WebUI names the default filter None, so choosing a preset that holds it shows None in the preset dropdown and the Filter tab's heading.
  - The WebUI names the first preset whose filter matches, so choosing the later of two presets with one filter shows the earlier one's name there.
  - The retired desktop's Add Preset, and the WebUI's before v0.15.0, could save either kind of preset too, so the catalog can still hold them.
- **How to make it happen**:
  - Save a preset whose only condition is one tag, delete that tag in the Tags tab or on another client, then choose the preset (measured, in Library and Tags screen tests).
  - Save one preset including Bob and another including Robert, otherwise the same, rename Bob to Robert in Edit Tag and save, then choose the second preset (inferred). Deleting a tag does the same when that tag was all that set one preset apart from another (inferred).
- **How much it matters**: Low. Each preset applies what it now holds and keeps its name in the Filter tab's preset list, where it can be renamed or deleted (inferred).
- **Since**: v0.15.0, not yet released, for a preset that shows as None, where WebUI Tweaks names the default filter None. A preset that shows as another one is in v0.12.0 at least, whose WebUI also named the first preset whose filter matches. A tag delete has left presets with no conditions since v0.9.0.
- **Where**:
  - `RemoveTagFromPresetCatalogOnly` and `RenameTagInPresetCatalogOnly` in `src/core/ReelRoulette.Server/Services/ServerStateService.cs`, which `/api/tag-editor/delete-tag` and `/api/tag-editor/rename-tag` call, remove or rename the tag in each preset's included and excluded tags.
  - `resolvePresetAnchor` in `src/clients/web/ReelRoulette.WebUI/src/filter/filterStateModel.ts` names the default filter None, and otherwise the first preset whose filter matches.
  - The server keeps such presets. Per-Preset Preset Writes makes the preset routes refuse a preset holding the default filter or another preset's, which tag deletes and renames don't go through.

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

## Field validation pattern

### Field tooltips don't show for fields low on the iPad's screen

- **What goes wrong**: On the iPad's installed app, a flagged field low on the screen shows its red icon but not its tooltip, so the message saying what the field expects never appears. Advance after, near the top of the Settings tab, and the Favorites and Blacklisted pair, a dropdown that opens no keyboard, show theirs, and desktop Firefox and the Pixel's installed app show every field's tooltip (measured). These fields don't show theirs (measured):
  - The Filter tab's Min and Max durations, at the bottom of that tab.
  - Loudness normalization settings' Manual target and boost limit.
  - Compression settings' Custom values.
- **How to make it happen**: On the iPad's installed app, type a value that isn't valid into one of those fields, such as −5 in Loudness normalization settings' Manual target (measured).
- **How much it matters**: Moderate. The field is flagged and keeps the value in use, but the user can't see what it expects without trying values.
- **Since**: v0.15.0, not yet released, whose WebUI added the field validation pattern.
- **Where**:
  - `placeTip` in `src/clients/web/ReelRoulette.WebUI/src/ui/FieldValidation.tsx` places the fixed tooltip from its icon's `getBoundingClientRect`. When the keyboard opens, iOS shifts the visual viewport to keep a low field in view, and the tooltip's position likely doesn't account for that shift (inferred).
  - Rendering the tooltip outside the field's containers, in the page, the open dialog, or the fullscreen stage, didn't help (measured).
  - The mockup's `ValidatedField` in `docs/mockups/reelroulette/build/common.js` places its tooltip the same way.

## Player

### A favorite changed while disconnected shows its old state on a later play

- **What goes wrong**: The WebUI remembers the favorite and blacklist it last saw for each item and puts them over the ones a random pick, a library play, or a history step brings from the server. A resync doesn't clear what it remembers, so after this device misses a favorite or blacklist change made on another device, playing that file again shows the old heart and thumb (inferred). A rating doesn't have this problem on a later play, since a resync drops the ratings this device kept.
- **How to make it happen**: Play a file on one device, let that device lose its connection, such as while the iPad sleeps or the server restarts, favorite or blacklist the same file on another device, reconnect the first device, and play that file there again by a random pick, from the library, or with Previous (inferred).
- **How much it matters**: Low. It takes a change on another device while this one is disconnected, to a file this one has already played. The server keeps the right state, and the heart and thumb show it again after the next change to that file or a page reload (inferred).
- **Since**: v0.9.0, whose WebUI first remembered each item's favorite and blacklist.
- **Where**:
  - `createItemStateCache` in `src/clients/web/ReelRoulette.WebUI/src/library/currentItemState.ts` keeps the states, and its `applyTo` overwrites an item's favorite and blacklist with them.
  - `pushHistory` and `appendHistory` in `src/clients/web/ReelRoulette.WebUI/src/state/appStore.ts` and the play's start in `src/clients/web/ReelRoulette.WebUI/src/playback/player.ts` call `applyTo`, and no `resyncRequired` handler clears the cache.

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
