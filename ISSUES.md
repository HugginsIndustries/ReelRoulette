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
- **How to make it happen**: In the Tags tab, add a new tag and delete it in Edit Tag or with Delete… in its menu, or add a new category and delete it in Edit Category or with Delete… in its menu, and press Save, alone or with other changes. Save stays enabled with only the add and delete, and posts `delete-tag` or `delete-category` for the new one (measured).
- **How much it matters**: Moderate. It takes adding and deleting a tag or category before one Save, but then the rest of that save's changes after the delete are dropped, with an error that says only that the tag or category doesn't exist.
- **Since**: v0.11.0, when the server began refusing a delete that changes nothing. The WebUI has sent the tag's delete since v0.9.0, and the category's since at least v0.11.0 (inferred).
- **Where**:
  - `deleteTag` and `deleteCategory` in `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditor.ts` drop the tag's or category's held add and queue a delete for it.
  - Edit Tag's and Edit Category's Delete and the Delete… item in a tag's or category's menu (`src/clients/web/ReelRoulette.WebUI/src/tags/tagMenus.ts`) call them.
  - A tag chip's `saved` tells a new tag from a saved one, and the menu's Filter by this tag is already disabled on a new tag with `SAVE_TAG_FIRST_REASON` (`tagMenus.ts`).
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

- **What goes wrong**:
  - Deleting a tag removes it from every preset, and renaming a tag onto another tag's name merges the two in every preset, so a preset can be left holding the default filter, or the same filter as another preset:
    - The WebUI names the default filter None, so choosing a preset that holds it shows None in the preset dropdown and the Filter tab's heading.
    - The WebUI names the first preset whose filter matches, so choosing the later of two presets with one filter shows the earlier one's name there.
    - The retired desktop's Add Preset, and the WebUI's before v0.15.0, could save either kind of preset too, so the catalog can still hold them.
  - A merge also leaves a preset that held both tags with the new name twice, such as `["Robert","Robert"]`, so its filter counts 2 tags, and turning the tag's chip off once leaves the tag on (inferred).
- **How to make it happen**:
  - Save a preset whose only condition is one tag, delete that tag in the Tags tab or on another client, then choose the preset (measured, in Library and Tags screen tests).
  - Save one preset including Bob and another including Robert, otherwise the same, rename Bob to Robert in Edit Tag and save, then choose the second preset (inferred). Deleting a tag does the same when that tag was all that set one preset apart from another (inferred).
  - Save a preset including both Bob and Robert, rename Bob to Robert in Edit Tag and save, then choose the preset (inferred).
- **How much it matters**: Low. Each preset applies what it now holds and keeps its name in the Filter tab's preset list, where it can be renamed or deleted (inferred).
- **Since**: v0.15.0, not yet released, for a preset that shows as None, where WebUI Tweaks names the default filter None. A preset that shows as another one is in v0.12.0 at least, whose WebUI also named the first preset whose filter matches. A tag delete has left presets with no conditions since v0.9.0.
- **Where**:
  - `RemoveTagFromPresetCatalogOnly` and `RenameTagInPresetCatalogOnly` in `src/core/ReelRoulette.Server/Services/ServerStateService.cs`, which `/api/tag-editor/delete-tag` and `/api/tag-editor/rename-tag` call, remove or rename the tag in each preset's included and excluded tags.
  - `RenameTagInFilterArray` in `ServerStateService.cs` replaces each match with the new name and never removes a name the array already holds, and so does `retargetTagFilter` in `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts` for the device's own filters.
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
  - `filterAsFieldsRead` in `src/clients/web/ReelRoulette.WebUI/src/filter/filterDialogModel.ts` reads each duration as its field's text for the dot, the heading's star, and Apply.
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

### A video that fails at the same point mid-file may recover without end

- **What goes wrong**: A video that fails after it has played gets a fresh media URL and plays on from where it failed. The flag that allows one recovery clears on every `playing` event, so when the video plays again from there and fails at the same point, it recovers again, without end, and never reaches the range request that shows a message or skips the file (inferred).
- **How to make it happen**: Play a video whose decoding fails at a fixed point after it has started, in a browser that plays it up to there (inferred). The files measured so far all failed at load, before they played.
- **How much it matters**: Low. It takes a file that fails partway through, but then the player keeps reloading it from that point, sending `POST /api/play/{itemId}` each time, instead of showing a message or moving on (inferred).
- **Since**: v0.15.0, not yet released, whose WebUI recovers a video that fails after it has played.
- **Where**:
  - `mediaFailedNow` in `src/clients/web/ReelRoulette.WebUI/src/playback/player.ts` recovers a video that has played while `recovered` is false.
  - `recover` sets `recovered` and plays the fresh URL from the failed position, and `videoPlaying` clears `recovered` on every `playing` event.

### The sound drifts out of sync on iOS with Enhanced audio on

- **What goes wrong**: On the iPad, with Enhanced audio on, a video's sound drifts out of sync with its picture, most of all once the video loops (measured, on the user's iPad). Pause then Play doesn't reliably bring it back in sync (measured).
- **How to make it happen**: On the iPad's installed app, with Enhanced audio on (its default), play a video with Loop on and let it loop a few times. With Enhanced audio off, the same video stays in sync (measured).
- **How much it matters**: Moderate. It affects any video that loops on an iPhone or iPad with the default settings (inferred for the iPhone). The workaround is to turn Enhanced audio off in the Settings tab's Audio section on the iPhone or iPad, which gives up the in-app volume, loudness normalization, and compression there.
- **Since**: v0.15.0, not yet released, whose WebUI added Enhanced audio.
- **Where**:
  - `start` in `src/clients/web/ReelRoulette.WebUI/src/playback/audioStage.ts` routes the video's sound through Web Audio with `createMediaElementSource`, on the first tap or key while Enhanced audio is on.
  - `syncVideo` in `src/clients/web/ReelRoulette.WebUI/src/playback/player.ts` sets the browser's own `loop`, which seeks back to the start at the video's end. `repeatStretch` repeats Timer mode's stretch by setting `currentTime` while the video plays.
  - Why WebKit drifts isn't established. WebKit's `AudioSourceProviderAVFObjC`, which feeds a video's sound to Web Audio, doesn't line the sound up with the picture again after a seek (inferred, from WebKit's source), but Pause then Play, which resets its timing, doesn't reliably fix it (measured).
  - WebKit has open bugs on it: [221334](https://bugs.webkit.org/show_bug.cgi?id=221334), where sound through Web Audio is delayed and out of sync with the video, and [301824](https://bugs.webkit.org/show_bug.cgi?id=301824), where media through Web Audio isn't kept in sync.
  - Ruled out: the server sends the original file and answers range requests correctly, and a loop fetches nothing new (measured). Nothing in the WebUI seeks, pauses, or changes the gain when the browser's own loop wraps.

## Server

### A failed stop leaves restart and stop stuck

- **What goes wrong**: Restart and stop set a flag that is cleared only when the request is refused. If the scheduled stop fails or the process doesn't exit, every later restart or stop answers "already in progress".
- **How to make it happen**: Request a restart or stop while something keeps the process from exiting, then request another.
- **How much it matters**: Low. It's rare, but getting out of it takes stopping the process by hand (inferred).
- **Since**: v0.9.0.
- **Where**: `_restartInProgress` in `RestartCoordinator.TryRestartAsync` and `TryStopAsync`, in `src/core/ReelRoulette.ServerApp/Program.cs`.

### Autostart status misses other ways it is off

- **What goes wrong**: Launch Server on Startup shows as on whenever the autostart file lacks `Hidden=true`, even when `X-GNOME-Autostart-enabled=false` turns it off or the `Exec` target no longer exists.
- **How to make it happen**: Turn the entry off in the desktop's startup applications settings, or move the server after turning the setting on.
- **How much it matters**: Low. The setting reads on while the server won't start at login.
- **Since**: v0.11.0.
- **Where**: `LinuxXdgStartupLaunchService.GetStatusAsync` in `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs`.

### Stopping mid-refresh waits for a file's hash

- **What goes wrong**: The refresh's fingerprint stage hashes each whole file synchronously, with no cancellation, so stopping the server during a large file waits for its hash to finish. The source stage's hashing of the files that might be a missing item, and its walk of a source's folders, can't be stopped either.
- **How to make it happen**: Stop or restart the server while a refresh fingerprints a large file, or walks a large source, more so on a slow share.
- **How much it matters**: Low. A stop or restart is late by as long as reading the rest of that file, or the rest of that walk, takes (inferred).
- **Since**: v0.9.0.
- **Where**:
  - `FileFingerprintService.ComputeFingerprint` in `src/core/ReelRoulette.Core/Fingerprints/FileFingerprintService.cs`, called from the fingerprint stage in `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`.
  - The source stage's move matching in `RefreshPipelineService.cs` hashes its candidates with the same call.
  - `EnumerateMediaFiles` in `RefreshPipelineService.cs` walks a source with `Directory.EnumerateFiles`, which takes no cancellation.

### A restarted server can replay events without a resync

- **What goes wrong**: The server's event revisions start at zero on every start. A client that reconnects after the restarted server has published past that client's last event ID, but no further than its replay history, gets a partial replay from the new server and no `resyncRequired`, so it misses changes.
- **How to make it happen**: Restart the server while a client is away, let the restarted server publish more events than the client had seen, then reconnect the client.
- **How much it matters**: Low. The client keeps stale state until it reloads, and only within that window of revisions (inferred).
- **Since**: v0.9.0.
- **Where**: The revision counter in `ServerStateService`, in `src/core/ReelRoulette.Server/Services/ServerStateService.cs`.

### Devices reload everything on each wake after a server restart

- **What goes wrong**: The `resyncRequired` the server sends a stream that reconnects with a gap takes a new event revision that never enters the replay history, so the revisions it hands out leave holes, and the gap check counts those holes as missed events. After a restart, each device that wakes holding an older such revision gets another full resync, reloading the library, tags, stats, and presets, until real events fill the history (inferred). No state is lost.
- **How to make it happen**: Restart the server, then let two devices, such as the iPad and a phone, each reconnect, sleep, and wake in turn before anything publishes an event. Each wake gets a `resyncRequired` (inferred).
- **How much it matters**: Low. It costs reload traffic and a flicker of each tab after a restart, until real events arrive, and once more for the device holding the older hole (inferred).
- **Since**: v0.9.0 (inferred).
- **Where**:
  - The event stream route in `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` builds a reconnecting stream's own `resyncRequired` with `ServerStateService.CreateEnvelope`.
  - `CreateEnvelope` in `src/core/ReelRoulette.Server/Services/ServerStateService.cs` takes a new global revision and doesn't add the event to the replay history.
  - `GetReplayAfter` reports a gap whenever an empty history's current revision differs from the client's, and otherwise whenever the client's revision is more than one below the oldest kept one. After two per-stream resyncs take revisions 1 and 2, `GetReplayAfter(1)` reports a gap (measured, in a harness of the real `ServerStateService`).
  - The WebUI reopens its stream on each visibility or focus change (`src/clients/web/ReelRoulette.WebUI/src/state/serverConnection.ts`) and takes the revision of the `resyncRequired` it gets.

### Unscanned videos match neither audio filter

- **What goes wrong**: **With audio** matches `has_audio = 1` and **Without audio** `has_audio = 0`, so a video whose audio hasn't been scanned (`has_audio` NULL) is hidden by both. Which of them should include it is undecided, and `docs/api.md`, the WebUI's labels, and tests follow whichever is chosen.
- **How to make it happen**: Filter by either audio option while a refresh hasn't yet scanned new videos, or for a video ffmpeg can't read.
- **How much it matters**: Low. A full refresh with ffmpeg scans every video it can read.
- **Since**: v0.9.0.
- **Where**: `LibraryCatalogListQuery` in `src/core/ReelRoulette.Core/Library/LibraryCatalogListQuery.cs`.

### A video replaced at the same path keeps its old duration and loudness

- **What goes wrong**: When a video's file is replaced by a different one at the same path, refresh hashes the new file but keeps the old file's duration and loudness. The Filter tab's duration limits, the Stats tab, and the frame the thumbnail stage picks use the old length, and Loudness normalization sets the new file's volume from the old file's loudness (inferred).
- **How to make it happen**:
  - Replace a video in a source folder with a different video under the same name, such as a re-encoded or trimmed copy, then refresh. A forced duration or loudness rescan corrects it, but no ReelRoulette screen offers one yet: it is set through `POST /api/refresh/settings` or in `core-settings.json`.
  - Copy a video into a source folder on the NAS while a refresh runs. The refresh adds the partly copied file, the fingerprint stage marks it unstable, and the loudness stage still scans it, since whether it has audio isn't known yet. Once the copy ends, its size changes and it is hashed again, but its loudness is never scanned again (inferred).
- **How much it matters**: Low. Replacing a file in place is rare, a copy has to overlap a refresh's loudness stage, and the thumbnail still gets made when the old length is wrong (inferred), but the wrong values stay until a forced rescan, with nothing to show they're stale.
- **Since**: v0.9.0 for the duration and loudness, when the server took over refresh: that release's duration stage already scanned only videos without a duration. The thumbnail's frame since v0.15.0, not yet released, whose thumbnail stage picks frames from the stored duration instead of probing the video again.
- **Where**: In `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`:
  - The fingerprint stage marks a changed file's fingerprint stale (`FingerprintStatus = 3`) and clears neither its duration nor its loudness.
  - `RunDurationStageAsync` scans only videos without a stored duration, unless the rescan is forced.
  - `NeedsLoudness` scans again only a video never scanned, scanned under an older analysis version, or with a recorded error.
  - The loudness stage scans an item whose `HasAudio` is null whatever its fingerprint's state, so it scans a file the fingerprint stage marked unstable (inferred).
  - The thumbnail stage picks its frames from the stored duration.

### Reading the tag model takes the catalog's write lock

- **What goes wrong**: The read behind the Tags and Filter tabs' tags opens a write connection and starts an immediate transaction, so it takes the catalog's write lock. It waits up to the 1 s busy timeout behind a refresh's writes, then fails with "database is locked" as a bare 500, and while it runs it holds off writers (inferred).
- **How to make it happen**: Open the Tags or Filter tab, or play another item while the Tags tab shows, during a refresh that writes many items, such as one adding thousands of files (inferred).
- **How much it matters**: Low. A refresh's writes are short, so the read usually gets the lock in time, and when it doesn't, the tab fails to load its tags (inferred).
- **Since**: v0.13.0.
- **Where**: `LibraryCatalogSession.ReadTagEditor` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs`, which `/api/tag-editor/model` calls, opens a write connection and calls `BeginTransaction()`, which Microsoft.Data.Sqlite starts as `BEGIN IMMEDIATE` (inferred). Every other read of several statements in that file uses `BeginTransaction(deferred: true)`.

### mDNS advertises a new port before the server listens on it

- **What goes wrong**: Saving the web runtime settings advertises the new port, host name, and LAN setting over mDNS at once, while the server's listen port and LAN binding change only at its next start, so until a restart the `.local` name points at a port nothing listens on (inferred).
- **How to make it happen**: With Allow remote connections and mDNS on, change the port in the Operator, save, and open the `.local` address from another device before restarting the server.
- **How much it matters**: Low. The Operator says a restart is required after such a change, and the advertisement is right again once the server restarts.
- **Since**: v0.9.0.
- **Where**: `OnWebRuntimeSettingsChanged` in `src/core/ReelRoulette.ServerApp/WebUiMdnsService.cs` reconciles the advertisement with the saved settings rather than the running server's port and binding.
