# Domain Inventory (Current State)

This is the canonical implementation inventory for ReelRoulette.
It is ownership-first and reflects current state only.

## Scope and Update Rules

- Purpose: map where authoritative behavior lives across core/server/clients.
- Keep this file current when features/workflows/contracts are added, changed, or removed.
- Keep entries current-state only; avoid narrative history in this file.
- Prefer concise entries: ownership + key files + notable boundaries.

---

## Core Domain Logic (Authoritative)

Core/server domain services own business rules and persisted state semantics.

- `src/core/ReelRoulette.Core/*`
  - filtering/randomization helpers, library path and backup file naming helpers, verification modules.
- `src/core/ReelRoulette.Core/Library/LibraryCatalogStore.cs` and `LibraryCatalogSession.cs`
  - SQLite catalog at `library.db` (WAL, synchronous=NORMAL, `user_version` 4) is the live library store. Opening a catalog at an older version from 2 upgrades it in place in one transaction, one step per version: version 3 brings the stored file name sort key, the sort indexes, and neither a separate item tag index nor a file name fold index, which no query uses, and version 4 brings each item's loudness analysis version, with every stored peak cleared. `LibraryCatalogNameSortKey` computes the key, which orders like OrdinalIgnoreCase but takes its casing from .NET's built-in Unicode table rather than the system's ICU, so the key is the same on every system; insert and rename write it with the row. Presets and thumbnail revision, width, and height are catalog columns. Core settings stay in `core-settings.json`. Startup opens it without reading the whole catalog and updates catalog rows in place. A catalog that a newer version saved, including a replace file beside it, or one that cannot be opened or read at the moment, is left unchanged. A file that is not a database, is corrupt, or has another schema, including a schema version before 2, is moved aside to `library.db.refused`. An empty catalog is created only when there is no `library.db`, refused file, or catalog backup. In any of those other cases the server runs without a library: library routes answer 503 with the reason, `/api/version`, `/control/status`, and the Operator page show it, and neither backups nor refresh run. `LibraryCatalogSession.QueryList` is the browse query (enabled sources, search, filter, sort, paging), with one index per sort mode and direction and both counts cached by catalog revision, search, and filter. The filter's tags become one set of item ids that each item is checked against once, so a filter costs the same with one tag or many; tags match by name fold. Random eligibility uses that filter without search, plus the request's video and photo options, and reads only each eligible item's id, path, play count, and last played; the picked item is read by id. Direct play reads one item and its source. Tag-editor model reads and tag-editor writes (item tags, categories, tags, and auto-tag apply) update those rows. The source list and source enable and disable read those rows. The tag table is the catalog's tag list. An item can still hold a tag name that is not in that table. Favorite, blacklist, record-playback, and clear-stats update those rows. Library stats are one SQL pass grouped by source id and media type and include the loudness baseline. A single-item read returns one row by its catalog id. Auto-tag scan and duplicate scan read catalog rows. Duplicate apply deletes the non-kept rows. Source import inserts and updates catalog rows. Refresh writes the columns each stage owns. `GET /api/library/catalog-checkpoint` and server catalog backups write a standalone SQLite copy of `library.db`.
- `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs`
  - source import, library list/query (`POST /api/library/query`), catalog checkpoint (`GET /api/library/catalog-checkpoint`), duplicate scan/apply, auto-tag scan/apply, playback-stats clear, tag-editor model and writes, and related command orchestration. Catalog backups write `library.db.backup.*` checkpoints under the server backup settings, and rotation trims only valid current-version backups, leaving other files in `backups/`. A refresh's checkpoint is taken after that refresh finishes, and a shorter backup gap applies on the next catalog save. Tag-editor reads and writes, auto-tag apply, favorite, blacklist, record-playback, and clear-stats update catalog rows. Library stats, a single-item read, auto-tag scan, and duplicate scan are scoped SQL reads. Duplicate apply deletes catalog rows. Source import inserts and updates rows. Refresh writes its own columns.
- `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`
  - unified refresh pipeline stage execution (including `nameSortKeys`, which fills missing name sort keys and recomputes every key after a key version change, and `fingerprintScan` for per-file SHA-256 backfill). Each stage writes its own catalog columns as work finishes. Thumbnail reuse trusts the revision stored on the item and does not walk unchanged source files. The stage writes that item's revision, width, and height as the item finishes, and a completed stage deletes a JPEG whose item is not in the catalog. There is no thumbnail file-count or byte cap. A catalog backup for a refresh is taken after that refresh finishes and still follows the backup gap. Overlap guards, status snapshots, duration/loudness scans (loudness one video at a time, with each result's loudness analysis version), server-scheduled **auto-refresh**, and **list-query thumbnail metadata enrichment** at serve time stay here.
- `src/core/ReelRoulette.Server/Services/ServerStateService.cs`
  - revisioned event publication, replay/resync behavior, state projection support. Preset reads and writes use the catalog table. Tag rename and delete update those rows. Source reads and enable and disable use catalog rows.
- `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs`
  - core-owned runtime settings persistence/flow where applicable.

Boundary:

- Domain/state mutation authority is core/server, not the WebUI.

---

## Server Transport and API Composition

`ReelRoulette.Server` remains a thin transport/composition layer.

- `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`
  - endpoint wiring for API/SSE/media/control/testing/log surfaces (including `POST /api/play/{itemId}` with `record-playback`-equivalent persistence and SSE).
- `src/core/ReelRoulette.Server/MediaPlayableExtensions.cs`
  - canonical video/photo extension allowlist for import alignment and play `415` checks.
- `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs`
  - request/response/event DTOs used on transport boundaries.
- `src/core/ReelRoulette.Server/Contracts/ApiContractMapper.cs`
  - contract shaping/mapping.
- `src/core/ReelRoulette.Server/Auth/*`
  - pairing/session/auth middleware and session store behavior, including the remote connections gate and pairing for `/api` routes only.
- `src/core/ReelRoulette.Server/Hosting/LocalRequest.cs`
  - the one localhost check: a direct connection from the server machine, never a proxied request or one with no remote address.
- `src/core/ReelRoulette.Server/Hosting/ProxyForwarding.cs`
  - forwarded headers applied from loopback only, and the `last.log` warning for forwarded headers from other addresses.
- `src/core/ReelRoulette.Server/Hosting/WebRuntimeConfig.cs`
  - `/runtime-config.json` payload: URLs from the caller's scheme and host, pairing token only for an accepted caller.
- `shared/api/openapi.yaml`
  - API source of truth for endpoint and schema contracts.

Boundary:

- Keep server layer transport/auth/SSE/media composition only (no deep domain logic).

---

## ServerApp Runtime and Operator Surface

`ReelRoulette.ServerApp` is the default runtime host and operator surface.

- `src/core/ReelRoulette.ServerApp/Program.cs`
  - single-process host for API + SSE + media + WebUI static assets + `/operator`.
- `src/core/ReelRoulette.ServerApp/Hosting/UpdateService.cs`
  - Velopack self-update for packaged ServerApp: check-only background poll, operator check/download/apply under `/control/update/*`, stable vs dev channel via `devChannelEnabled`.
- `src/core/ReelRoulette.ServerApp/Hosting/IHostUi.cs`
  - host-UI abstraction boundary keeping server runtime tray-agnostic.
- `src/core/ReelRoulette.ServerApp/Hosting/AvaloniaTrayHostUi.cs`
  - Cross-platform tray runtime controls (Open Operator UI, Launch Server on Startup, Refresh Library, Restart Server, Stop Server / Exit) using `assets/logo/app.ico`, with deterministic headless fallback when tray is unavailable. The tray ends only when shut down explicitly, on its UI thread, and an unrequested end is written to `last.log`. It loads the Fluent theme so the menu window Avalonia draws on Windows renders, and writes tray clicks, Windows menu opens and closes, failed menu actions, tray UI errors, and Avalonia warnings and errors (each once per run) to `last.log`.
- `src/core/ReelRoulette.ServerApp/Hosting/HeadlessHostUi.cs`
  - headless host path, used on any OS when no tray can be created.
- `src/core/ReelRoulette.ServerApp/Hosting/WindowsStartupLaunchService.cs`
  - Windows startup-launch registration and state reconciliation (`HKCU` Run key) for immediate tray/operator toggles.
- `src/core/ReelRoulette.ServerApp/Hosting/LinuxXdgStartupLaunchService.cs`
  - Linux startup-launch registration and state reconciliation via XDG autostart (`*.desktop` in the user autostart location, `Path=` + `Exec=` resolved from **`APPIMAGE`** when present for AppImage runs) for immediate tray/operator toggles; complements `Program.cs` content root pinned to `AppContext.BaseDirectory` for session autostart.
- `src/core/ReelRoulette.ServerApp/Hosting/HeadlessStartupLaunchService.cs`
  - non-Windows startup-launch no-op/unsupported path for host portability.
- `src/core/ReelRoulette.Server/Services/ConnectedClientTracker.cs`
  - connected client/session/SSE diagnostics backing operator visibility.
- `src/core/ReelRoulette.Server/Services/OperatorTestingService.cs`
  - testing mode and fault simulation state transitions.
- `src/core/ReelRoulette.Server/Services/ServerLogService.cs`
  - bounded/filterable server log reads for operator tooling.

Includes:

- control-plane surfaces (`/control/status`, `/control/settings`, `/control/pair`, `/control/restart`, `/control/stop`, `/control/update/*`, testing/log endpoints),
- control-plane auth in `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (localhost trusted, as `LocalRequest` decides; every other address needs the control token) and control token generation in `CoreSettingsService`,
- startup-launch control surface (`/control/startup`),
- operator diagnostics and manual testing controls.

---

## WebUI Client Orchestration (`src/clients/web/ReelRoulette.WebUI`)

WebUI is runtime-config-driven API/SSE client orchestration. Its screens are Preact components over `@preact/signals` shared state, with their logic in typed modules.

- `src/clients/web/ReelRoulette.WebUI/src/ui/App.tsx`
  - page root: the header, in its error boundary, and the stage; starts the server connection right after the first render, puts the `short-screen` class on the body while the panel host says the window is a phone on its side, for the stylesheet's layout of it, and follows the Settings tab's theme while the page is mounted. Also the startup error page, which shows its message as text.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Header.tsx`
  - pairing prompt, labeled "Pairing token", whose Pair is disabled while the token is empty, and now playing, whose file name opens the panel on the Stats tab with a click, Enter, or Space, with the full name, then "Show stats", as its tooltip; its `is-pairing` class while the server asks for pairing keeps it showing on a phone on its side.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Notifications.tsx`
  - the player's bell, with its badge and its accessible name counting what didn't pop up, which opens the list under it or closes it and keeps focus on it; the popups, a polite live region at the edge and side the popup settings say, each a card with its icon, message, second line, and Dismiss, paused while a mouse or pen points at it or focus is in it, and closed by a swipe past 64 px on a touch screen; and the list, a dialog lined up with the bell, showing Now from `src/state/lastingStates.ts` and Recent with their times, with Clear and Close, which takes Escape before the stage except while an in-app dialog is open, and closes on a press outside it, and Notification settings at its foot, which closes it, opens the Settings tab, and asks the settings service to show the popup settings.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Stage.tsx`
  - the fullscreen stage, holding the player with its popups, the side panel, the list behind the bell, Auto Tag, and the in-app dialogs' host, each in its error boundary, which stay inside the stage so they show in fullscreen. The panel's side, where it goes (`data-side` and `data-panel-mode`), its width (`--panel-width`), `covers-player` while the overlay panel is open, and the pseudo-fullscreen class are set on the stage, and `is-narrow` on the player column while the player is narrower than 600 px, as they change, without rendering the stage again. Escape closes the panel when it is open and otherwise leaves pseudo-fullscreen, except while a dialog or Auto Tag is open, when Escape is theirs.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Panel.tsx`
  - the side panel: its tab row of icon-only Library, Filter, Tags, Stats, and Settings tabs, the Filter and Tags tabs with an orange dot and "unsaved changes" in their names while they hold unsaved changes, and its Close; the five tab pages, each in its error boundary, holding the library, filter, tag editor, stats, and settings components; and the handle between the player and the panel, which drags its width or takes the arrow keys, Home, and End; a click that doesn't drag leaves the remembered width. The panel host shows and hides the panel, the handle, and the pages, so the component renders their `hidden` once; the tab row and the handle render apart from the pages.
- `src/clients/web/ReelRoulette.WebUI/src/panel/panelHost.ts`
  - the side panel's state and actions: open or closed, its tab, side, and width, all remembered in the per-device store, and moving it to the side the Settings tab gives; where it goes, the overlay below 800 px of viewport width or on a short screen, a touch screen below 500 px of height, and otherwise beside the player, from the window's size and pointer and never the user agent, and whether the window is a short screen; the width within 360 px and what leaves the player 400 px, with the handle measured while it shows; whether the player column is narrower than 600 px, measured with the panel and when the column itself resizes; and each tab's start, and its leave, which a tab could refuse, though each now agrees and keeps its changes. Choosing a tab and closing wait for the tab being left, and other requests are ignored while it decides. A tile and Apply close the panel only as the overlay. A panel remembered open shows its tab when the page loads and starts it when told the server has been checked.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Player.tsx`
  - the media area: ambient mode's glow layer with its canvas, which comes first so it sits behind the picture, then video, photo, empty state, the player's indicator, a polite live region that stays in the page and shows the first active lasting state from `src/state/lastingStates.ts`, its icon and a refresh's percentage hidden from screen readers and a long state ending in an ellipsis, and the controls over them, shown while the bell's list is open, with the bell, the panel button that opens the panel on its last tab or closes it, which the stylesheet puts on the panel's side, just right of the bell while the panel is on the left, marked with the orange dot and "unsaved changes" in its name while the Filter or Tags tab holds unsaved changes; swipe and tap listeners (passive, added through a ref). The player sets the media elements' sources and `display`, the seek slider's value, and the stretch behind it (`#seek-loop` in `#seek-wrap`), shown and placed while Timer mode repeats one, and ambient mode the glow's `hidden` and settings, so the component renders those once and never replaces the video element; it attaches the glow to ambient mode with the video and photo.
- `src/clients/web/ReelRoulette.WebUI/src/ui/LibraryOverlay.tsx`
  - the Library tab: header with the count line, "{matching} / {total}", hidden from screen readers, which hear it in words, and the button that collapses the controls and the Filters line together; the Filters line, shown while a filter applies, which opens the Filter tab; the controls, in order the preset dropdown and randomization mode, which share a row from a panel about 440 px wide, then sort with its direction, then search, all four in two rows on a phone on its side, with the preset dropdown disabled while it shows a message in place of the presets, and search and sort while the server fails the compatibility check or runs without a library; and a body that is either the grid's host, an element with no children that the grid controller fills and that stays while tiles show, or a loading, error, or empty message, or the compatibility or no-library message. Click, Enter, or Space on a tile plays it. Its `show-tile-names` class, while the Settings tab's Show file names on tiles is on, has the stylesheet show each tile's file name bar.
- `src/clients/web/ReelRoulette.WebUI/src/ui/FilterDialog.tsx`
  - the Filter tab, laid out and styled as the mockup shows it with the shared `.btn`, `.ctl`, and `.icon-btn` controls: header with the preset heading and Refresh; the General, Tags, and Presets sections, each marked while a field in it is flagged; sources labeled by name and folder; the Tags section's categories, each with the shared category header and its match mode select, named for its category; preset rows with a drag handle, the name, and Edit, in a list that grows with the section; and the footer's icon buttons, Clear all filters, disabled while the filter is the default one, Discard changes, and Apply, both disabled without changes, with Apply orange and showing the unsaved-changes dot while there are some. The durations, the new preset name, and the Favorites and Blacklisted pair use the field validation pattern; Apply, Add Preset, and Update Preset are held buttons, and Add Preset is disabled while the new preset name is empty or taken, and moves focus to the new preset's drag handle. Edit Preset renders after the dialog, not inside it, so the dialog's own styles apply, and gives the preset row's Edit at the same place as its focus fallback after a rename or delete. It renders from the filter dialog service, and its panels stay empty until it first loads.
- `src/clients/web/ReelRoulette.WebUI/src/ui/TagEditor.tsx`
  - the Tags tab's tag editor, laid out and styled as the mockup shows it: header with Auto Tag and Refresh; the "Editing tags for" line naming the item it edits while that isn't the one playing; its categories, each with the shared category header holding its drag handle and Edit (Uncategorized's handle is disabled, and it has no Edit), and tag chips with add, remove, and edit; the footer's two rows, add category and the new tag's category, then the new tag name with the field validation pattern, where Enter adds the tag while Add tag is enabled, Add tag, disabled while the name is empty or taken, which moves focus to the new chip's add, or its Edit while nothing plays, and Save, orange with the unsaved-changes dot while there are changes; and the Edit Tag, Edit Category, and New Category dialogs, which render after the editor, not inside it, so the dialog's own styles apply. Edit Tag's focus fallback is the renamed chip's Edit, or after a delete the next or previous chip's in its category; Edit Category's is the next or previous category's Edit. It renders from the tag editor service, and its panels stay empty until it first opens.
- `src/clients/web/ReelRoulette.WebUI/src/ui/SettingsTab.tsx`
  - the Settings tab: Playback's Autoplay mode, radio buttons named by their choice with its line as the description and the group's hint as its description, Advance after, a setting's field of the field validation pattern, which saves to the store's Advance after and shows the value saved again once the field loses focus or the tab hides or the panel closes, and Loop stops autoplay, a checkbox with its hint as its description; Appearance's Theme, Ambient mode with its hint as its description and its Ambient mode settings, a `details` group closed at first whose sliders are named by their labels with the value shown as their value text, and Reset to defaults, and Show file names on tiles, a checkbox with its hint as its description; Notifications' Show popups and Popup settings, a `details` group closed at first, its controls each disabled with their fieldset while Show popups is off, a Position or Show for change showing the sample popup, and a request from the bell's list opening it and focusing Show popups; Panel's Side and Auto-Pause, radio buttons named by their choice with its line as the description; Diagnostics, the client and session ids, client type, and device name in full, the server's version with its API version, or "Unknown" before a version check answers, and the app's version, labeled ReelRoulette; and the line saying settings apply at once and are kept on this device. Each setting applies as it changes, with no Save.
- `src/clients/web/ReelRoulette.WebUI/src/ui/StatsTab.tsx`
  - the Stats tab, laid out as the mockup shows it: Current file, with "Nothing is playing yet." or the playing file's name, full path, and once loaded its rows and tag chips, then Library, with its cards or a message in their place. It renders from the stats tab service.
- `src/clients/web/ReelRoulette.WebUI/src/stats/statsTab.ts`
  - the Stats tab's service: loads `GET /api/library/stats`, `POST /api/library/item` for the playing item, and the shared tag catalog when none has loaded, only while the tab shows and not while the server holds back or asks for pairing; loads again on a new playing item and the server's events, through `coalescedRefresh.ts` (a 250 ms gather, one load at a time, one more for requests during it); keeps what it showed when a later load fails; takes a 404 for the playing item, which has left the catalog, as no item, so the library still loads; and builds the tab's view with `statsModel.ts` (each row's and card's wording and the tags' catalog order) and `lastPlayed.ts` (the time before this play, from the playback events).
- `src/clients/web/ReelRoulette.WebUI/src/tags/tagCatalog.ts`
  - the tag catalog the Tags, Filter, and Stats tabs share: the Tags and Filter tabs give it each catalog they load, `tagCatalogChanged` brings the new one, a resync drops it, and it loads `POST /api/tag-editor/model` with no items only when asked and none has loaded.
- `src/clients/web/ReelRoulette.WebUI/src/settings/settings.ts`
  - the Settings tab's settings that nothing else keeps, each read from and kept in the per-device store: the Auto-Pause mode as `panel.autoPause`, Responsive by default, the theme as `appearance.theme`, System by default, ambient mode as `appearance.ambient`, on by default, its settings together as `appearance.ambientSettings`, changed a few at a time and reset to their defaults, and Show file names on tiles as `appearance.tileNames`, off by default; the requests to show the popup settings, which the bell's list makes; and the whole-number field rule, with Advance after's 1 to 3600 seconds, whose problem says what the field takes, an emptied field included.
- `src/clients/web/ReelRoulette.WebUI/src/settings/theme.ts`
  - the theme: the choices System, Dark, and Light, the theme a choice gives with the system's scheme, each theme's `theme-color` and installed iOS app status bar style, applying a theme as the root element's `theme-dark` or `theme-light` class and those two metas, and following a choice, and the system's scheme while it is System. `index.html`'s inline boot script applies the theme kept on this device the same way while the page loads, which a test checks case by case.
- `src/clients/web/ReelRoulette.WebUI/src/ui/TagCategory.tsx`
  - a tag category, in the Tags tab and the Filter tab's Tags section: its header, whose name, or a tap on its own padding, expands and collapses it while its drag handle and controls keep their own actions, and which shows, expanded or collapsed, a count of its tags in use while any are and the orange unsaved-changes dot, both in its toggle's accessible name while they show; and its tags' grid, hidden while it is collapsed.
- `src/clients/web/ReelRoulette.WebUI/src/ui/AutoTag.tsx`
  - Auto Tag, over the whole page: the in-app dialog with its own class and no outside to click, rendered in the stage, with its X, Scan full library and View all matches, Select all, Deselect all, Scan Files, progress, status, results, Cancel, and Apply. Escape or the browser's cancel or close does what the X does, which waits while a scan runs, and focus starts on the X and returns to the Auto Tag button. The results show a placeholder before any scan and another after one that found nothing, and the header and every row share one column template; with View all matches, a file that already has the tag shows checked and disabled.
- `src/clients/web/ReelRoulette.WebUI/src/ui/FieldValidation.tsx`
  - the field validation pattern's components: a field's red icon inside it on the right and its tooltip, placed beside the icon and kept inside the window, shown while the pointer is on the icon, after a tap on it, or while the field has focus; the field's `aria-invalid` and accessible description; an action's button, either disabled, dimmed with no icon and with its reason as its tooltip when no field says why, or held, its label or icon dimmed and a red badge on its top-right corner, out of its flow, or, for an action with the unsaved-changes dot, that dot red in the badge's place; a section's badge on its tab's corner; and a setting's text field, which takes the setting's field rule, saving on Enter and when it loses focus or hides, and shows a green check in the red icon's place, with "Saved" in a polite live region, while the rule says a save changed the value. The red icons, the tooltip, and the check fade in as they render and stay rendered for 250 ms as they fade out (`useFadeOut`), or go at once with reduced motion; the field's `aria-invalid` and description and the action's state change at once. When a held action asks to move to a field, the field's component, within the press, has its place shown, such as its Filter tab section, and focuses it as a tap does, with no scroll first.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Dialog.tsx`
  - the in-app dialog: a modal in the browser's top layer that opens when it renders, focuses its first control, closes only itself on Escape, a click outside, or the browser's cancel, and returns focus after the render that closes it, to a fallback the screen gives when what had focus is gone, with a class in place of its own, clicks on itself left alone for one that covers the page, and a close the browser makes anyway undone while the screen keeps it open; the name dialog with its field, extra fields, Delete, Cancel, and Save, disabled while the name has a problem, and Enter saving; the confirmation, with Cancel focused and its confirming button named, red for a delete or discard; the notice, with one OK; and the host that shows the service's confirmations and notices.
- `src/clients/web/ReelRoulette.WebUI/src/dialogs/dialogs.ts`
  - the page's confirmations and notices: each one asked for opens above the last and settles with its answer, and a notice's text is relayed to `last.log` as a popup's is and kept in the list behind the bell. A notice whose message is already open doesn't open again; it is still relayed, and settles when the one showing closes.
- `src/clients/web/ReelRoulette.WebUI/src/notifications/notifications.ts`
  - the page's one-off messages: each relays its text, or a log text that leaves out a file name, to `last.log`, pops up if the popup settings allow, at most three at once, the cap never closing a warning, one with the same key replacing the one showing, a warning staying until closed, and the time pausing while held, with a floor; and the list keeps it, the last 50, with in-app notices kept unmarked. The badge's count of what didn't pop up, the list's open state and the time its entries show against, and the popup settings, read per device from `notifications.popups` with each field falling back to its default, which a change merges into and keeps whole; nothing pops up while the list is open, and entering fullscreen closes the popups while Show in fullscreen is off. The sample popup, key `preview`, shows for the popup time and never reaches the list, the badge, or `last.log`.
- `src/clients/web/ReelRoulette.WebUI/src/ui/Reorder.tsx`
  - reordering by drag handle, which the tag editor's categories and the Filter tab's presets use: a drag starts on the handle only, once the pointer has moved a few pixels, and the dragged row shows lifted, follows the pointer within the list, and is measured after it shows lifted, so a dragged category's tags are already hidden. The rows it passes slide out of its way by transforms, the rows stay where they are in the page until the drop, whatever scrolls the list scrolls near its edges, the dragged row is placed again whenever the list scrolls, and the move is set on the drop. The up and down arrow keys on a handle move its row one place. After a move, focus is on the handle and a polite live region announces the new position. After a drop, the list keeps where it was scrolled to, and the handle takes focus once the rows render in their new order, without scrolling; the handle's description is a hidden help line.
- `src/clients/web/ReelRoulette.WebUI/src/reorder/reorder.ts`
  - the reordering rules: when a drag starts, where a dragged row lands (past each row whose midpoint its center has crossed), where it shows (no higher than the first row and no lower than the last), how far the rows it passes slide, where an arrow key moves a row, how fast the list scrolls near its edges, and the announcement.
- `src/clients/web/ReelRoulette.WebUI/src/validation/fieldValidation.ts`
  - the field validation pattern's rules: a field's problem, when it is flagged (never while a field that may sit empty, such as a name typed for an action, is empty; a field that must always hold a value, such as Advance after, is flagged when emptied), whether an action is disabled, by such an empty field or a problem in a field right next to it, or held by the first field elsewhere with a problem, and moving to a field, which runs at once the move its component attached; and a setting's field, for a setting that applies without Save and must always hold a value, which saves a valid value only on Enter or when the field loses focus, so a value passed through on the way is never saved, keeps a value that is not valid flagged while the field has focus, shows the value saved again, unflagged, once the field loses focus or hides with the Settings tab or the panel, and says for about two seconds, or until it is typed in again, that a save changed the value, but not when the value stays as it was or a value that is not valid goes back to the one saved.
- `src/clients/web/ReelRoulette.WebUI/src/ui/ScreenBoundary.tsx`
  - per-screen error boundary: a screen that fails to render stops showing and relays `ui-error screen=<name> error=<type>` to `last.log`.
- `src/clients/web/ReelRoulette.WebUI/src/state/appStore.ts`
  - shared state as signals (playing item and history, loop and autoplay, presets and the preset menu, applied filter, active preset, randomization mode, Advance after, the autoplay mode, Loop stops autoplay, the media sources as last loaded, compatibility block and its message, pairing prompt, the server's version from the last version check it answered, whether the server can't be reached, the library state, its message, whether there is no library, and whether either holds the page back, a running refresh's progress, and the loading holds), the item-state cache, and the actions and events that cross screens; messages' text, and texts that show nothing, relay to `last.log` as `status=` lines, a repeat at most once a second. It remembers the applied filter, its preset, and whether the filter is the preset's own in the per-device store, written only when that changes, and restores them before the connection starts. It keeps Loop, Autoplay, the Settings tab's Advance after, 10 seconds until set, its Autoplay mode, Normal until set, and its Loop stops autoplay, on until set, in the per-device store. On the first preset load, a remembered preset whose own filter applied, and that no other filter has replaced since, applies again as the server has it, so tag renames and deletions made elsewhere reach the filter.
- `src/clients/web/ReelRoulette.WebUI/src/state/lastingStates.ts`
  - the lasting states in their precedence order (Reconnecting…, Server not compatible, Running without a library, Loading…, a library refresh), each with its icon, text, whether it warns, spins, or follows the player's controls, and the second line the list's Now shows; the player's indicator, the first active one, or none while the server asks for pairing, relaying each state's text to `last.log` once when it starts showing; the no-library text for the Library tab; and the notice Play, or a tile's play, shows while the server fails the compatibility check or runs without a library.
- `src/clients/web/ReelRoulette.WebUI/src/state/serverConnection.ts`
  - version and capability check, at start, each time the event stream opens, or fails while the server doesn't ask for pairing, and every 3 seconds while the stream is open and the last check didn't reach the server, one at a time, given up after 10 seconds, which sets the server's version from each check it answers, before the compatibility check, whether the server can't be reached, and its library state, and sends `serverReady` and loads the presets only when the server goes from not ready to ready, compatible with a library, where a check that finds no library or is answered with 401 makes it not ready; a running refresh's progress, cleared once it stops and on `resyncRequired`, and how a refresh ended as a popup, finished with its summary or failed as a warning; "Reconnected." when Reconnecting… ends; pairing, whose success pops up and whose failure shows in a notice, preset loading, with the preset dropdown saying the server failed the compatibility check, or runs without a library, in place of the presets, also when they arrive after it, the event stream and whether it is reconnecting, and reconnecting on focus, visibility, page show, and coming online; passes server events to the player, the library, and the tag editor, and the sources a refresh kept, by id, once the run's source stage has finished, and again only when a run's list changes.
- `src/clients/web/ReelRoulette.WebUI/src/state/serverCompatibility.ts`
  - the supported server API versions and required capabilities, and the status message for a server that fails them; and the server's release version for Diagnostics, its `assetsVersion`, or its `appVersion`, the 4-part assembly version, from a server that sends no `assetsVersion`.
- `src/clients/web/ReelRoulette.WebUI/src/state/appApi.ts`
  - API URLs, the page's requests through the shared request helper (`request`), posts, JSON reads (`getJson` and `postJson`, which throw an `HttpStatusError` for a failed status), and the client log relay, which sends past the helper.
- `src/clients/web/ReelRoulette.WebUI/src/state/appServices.ts`
  - builds one page's store, API, fullscreen, notifications, which close the popups on entering fullscreen while the popup settings say so, in-app dialogs, which keep each notice in the list, server connection, side panel, player, ambient mode on the settings, the playing item, and the player's media failure, library, the tag catalog the Filter, Tags, and Stats tabs share, filter dialog, tag editor, and stats tab from the runtime config, connects the panel's tabs to the library, filter dialog, tag editor, stats tab, which opens as its tab shows and closes as it hides, and Settings tab, and Auto-Pause to the panel, Auto Tag, and the player, in the mode the Settings tab sets, the panel opening closing the bell's list, starting a tab remembered open once the server has passed or failed the compatibility check or turned out to have no library, and whether the Filter and Tags tabs hold unsaved changes, which both the tabs' dots and the panel button's dot read; the library after the player, so the player handles an item-state event first.
- `src/clients/web/ReelRoulette.WebUI/src/state/deviceStore.ts`
  - the per-device store: what the WebUI remembers on this device across a page refresh, one `localStorage` entry per setting as JSON under `rr_device.`, read with a fallback for a value missing, unreadable, or not accepted, and written best effort.
- `src/clients/web/ReelRoulette.WebUI/src/playback/player.ts`
  - playback: plays the current item (sets the source and shows the element, then loop and mute, then `play()`), random pick, Previous and Next through history, whether the media of the attempt playing now failed, play/pause, mute, kept on this device, loop, autoplay and its modes, the photo timer and a video's timer, which an Advance after change gives the new length, keeping the time they have run and whether they run or are held, without showing the photo again, Loop stops autoplay, which decides whether Loop holds autoplay, the video's own `loop`, set while Loop repeats it whole, Timer mode's repeating stretch, which starts where a seek lands, or Advance after seconds before the end for a seek to the end or a video at its end, the browser repeating one that is the whole video, and shows behind the scrub bar, and repeats that restart only a photo's timer or the video's position, favorite and blacklist, seek and the time display, the scrub bar moving every animation frame while a video plays or a photo's timer runs, Play/Pause and the scrub bar on a photo, which hold, resume, and move its timer while autoplay will advance the photo and are disabled otherwise and once its timer has ended, a photo keeping its time as Loop or Loop stops autoplay changes, the time showing 0:00 / 0:00 while no video or photo timer is active, Auto-Pause's pause and resume, which resume a photo's timer with the time it had left without loading or recording the photo again, leave a play or pause the user made since, and resume nothing once another play has started, and item-state events, popping up another device's favorite or blacklist change with the file name, but not this device's own, whose change already popped up as Your actions. A play while the server fails the compatibility check or runs without a library shows the in-app notice. It holds Loading… while a pick waits and while the media loads, until its `playing`, load, or error, a rejected `play()`, or a pause by the user or Auto-Pause. Records a play on start unless the server already did, and relays playback steps to `last.log` without file names.
- `src/clients/web/ReelRoulette.WebUI/src/playback/loadingHolds.ts`
  - what the player waits for, a pick, a library play, or a media load, and whether Loading… shows: once something has waited half a second, counted once from the first wait until every wait ends.
- `src/clients/web/ReelRoulette.WebUI/src/playback/ambient.ts`
  - ambient mode: its settings' defaults, ranges, steps, and how each value shows, reading them from the per-device store with each one outside its range at its default, and the glow: at the update rate a 32×18 copy of the picture playing, held while the video is paused or the tab is hidden, a photo copied once per play and again when ambient mode turns back on, a video waiting until it has a picture and a photo until it has loaded, the canvas on screen fading to each copy from what it shows over the fade time, every animation frame, without being cleared, and the glow's layer shown while ambient mode is on and an item plays whose media hasn't failed, carrying its blur, both strengths, and saturation for the stylesheet's filter. It never reads a canvas's pixels back.
- `src/clients/web/ReelRoulette.WebUI/src/playback/photoTimer.ts`
  - the timer behind a photo's and a video's Advance after: starts its full length, holds and resumes with the time it had left, moves to a position, and changes its length, keeping the time it has run and whether it runs, ending at the next tick once the time run reaches the length, measuring the time by a steady clock.
- `src/clients/web/ReelRoulette.WebUI/src/playback/autoPause.ts`
  - Auto-Pause: its Never, Always, and Responsive modes, whether a mode wants playback paused for the panel's state and what shows over the whole page, and pausing and resuming the player only when that changes.
- `src/clients/web/ReelRoulette.WebUI/src/playback/stageFullscreen.ts`
  - fullscreen for the stage through the Fullscreen API, and pseudo-fullscreen on iPhone and iPad or when the browser has no API or refuses, and whether the stage is in either, following the browser's `fullscreenchange`.
- `src/clients/web/ReelRoulette.WebUI/src/playback/mediaGestures.ts`
  - swipe left and right for Next and Previous, a tap to show or hide the controls, and ignoring the click that follows either.
- `src/clients/web/ReelRoulette.WebUI/src/playback/nowPlaying.ts`
  - now-playing name, tooltip, and duration, the time format, m:ss or h:mm:ss from an hour, and the seek row's elapsed and total time, the elapsed time in the total's shape.
- `src/clients/web/ReelRoulette.WebUI/src/library/library.ts`
  - the Library tab's state and actions: the first page once the server is ready, open and close (the panel has shown the tab, so open flushes the grid's deferred layout), the controls, whether they are collapsed, the Filters line's parts, totals, direction label, and body as signals, the compatibility message in place of the grid while the server fails the check, and "Running without a library." with the server's message while it has no library, search with its wait, sort, nothing queried, neither a query started over nor the first page when the tab opens, until the server has passed the compatibility check with a library, nor while it fails it or has none, fill from the grid's coverage while open, favorite, playback, refresh, resync, and preset pick events, the playing item's tile, the sources for the Filters line, loaded once when a source filter applies, the Filter tab shown from the Filters line, a later page's failure, which pops up and keeps the tiles already loaded, and tile play through `POST /api/play/{itemId}`, which holds Loading… while it waits, joins history, closes the panel as the overlay, and hands the item to the player, or shows its failure in the notice. A refresh that keeps a source's items because its folder listed no media files shows a notice naming each folder once per page load, loading the source list when it hasn't loaded or lacks the source. It remembers whether the controls are collapsed, and the sort and its direction, in the per-device store; the search text is not remembered.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterStateModel.ts`
  - filter JSON serialize/parse aligned with the server's `FilterState`, with the wire shape typed by OpenAPI's generated `FilterState` schema, and a filter without its categories' AND match modes, as the WebUI keeps the filters it reads for its own use, and preset lists compared by order, name, and filter. Typed durations are parsed strictly; durations from the server are read leniently, so fractional seconds in a stored preset read as whole seconds.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterDialog.ts`
  - the Filter tab's state and actions: open (on the section it was left on, General the first time; without unsaved changes it starts over from the applied filter and the preset dropdown's preset; it then loads sources, which it hands to the store for the Library tab's Filters line, the tag model, and presets, keeping the working copy and taking only what loaded), close, which keeps the working copy and its changes until Apply or Discard changes, a tag renamed or deleted, renamed or removed in the working copy and the preset list, the working copy with the heading, whether its filter is the default one, and whether it holds unsaved changes, against the applied filter and the saved preset list it keeps, so Clear all counts and a change put back doesn't, with each duration as its field reads, as the heading's star reads it too, while the heading names the working filter's preset, for the dots and for starting over, worked out after each change, General, Tags, and preset edits, Edit Preset with its rename and its Delete, which asks first, the fields' problems and whether each action is disabled or held, with Add Preset and Update Preset disabled while the filter is the default one, saying why, a held one moving to the field that holds it, within the press, after showing its section, the tag categories expanded, remembered in the per-device store, Refresh, which keeps a preset list that differs from the saved one and loads the tab when it hasn't loaded yet, nothing loading, and Refresh and Apply doing nothing, while the server fails the compatibility check or runs without a library, and a tab that shows loading once the server is ready, keeping its changes, Clear all, a preset picked in the Library tab, which starts it over from that preset's filter and the saved presets whether or not it shows, Discard changes, which puts back the applied filter and the saved presets and leaves the tab open, and Apply, which saves a preset list that differs from the saved one, applies the filter, updates the preset dropdown, and starts the library over. Apply closes the panel as the overlay.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterDialogModel.ts`
  - the General tab's Basic Filters, media type, and audio choices with their labels, which the Filters line names them by, the General tab's fields as a draft beside the working filter and their reading into it, the fields' problems (durations, the new preset name, Edit Preset's name, and Favorites only with Blacklisted only), the fields each action uses, the one beside Add Preset, and why a General field holds an action, a filter with the General tab's durations as their fields read, the source list the fields were filled from, which checking the same sources again keeps, through loads of the sources, include and exclude toggles, the Tags section's categories with Uncategorized for filter tags the catalog does not have, each with how many of its tags the filter uses and whether they differ from the applied filter, source labels, and preset rows from the API.
- `src/clients/web/ReelRoulette.WebUI/src/filter/filterSummaryModel.ts`
  - the Library tab's Filters line: the applied filters it names, in order, by the Filter tab's labels, with the chosen sources counted out of those listed, and what goes before and between them.
- `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditor.ts`
  - the Tags tab's tag editor's state and actions: the item it edits, which follows the playing item unless it holds an add or remove for its item or a save hasn't landed, loading the tag model again while it shows and only taking the latest load, and none while a save is on its way; open (loads the tag model for its item), close, which keeps its changes, and Refresh (asking Discard changes? in the in-app dialog before dropping changes, then following the playing item), the categories expanded, remembered in the per-device store, a category expanding when a tag is added to it or moved into it, and Uncategorized when a deleted category's tags move into it, category and tag edits held until Save, the Edit Tag, Edit Category, and New Category dialogs, whose Save does nothing while the name has a problem, with Edit Tag's and Edit Category's Delete asking first, the new tag name's check, Add tag creating a tag without putting it on the playing item and expanding its category, Auto Tag open or closed, its scan with Scan full library kept in `localStorage`, its selections and status, its Cancel, which clears the scan, as a renamed or deleted tag does, and a tag catalog change that leaves one of its tags out, though not a save that only moves a tag to another category, and its Apply, which posts the selected files in the background as a save of its own and shows them as having their tag, showing the files it sent without their tag again when the server refuses it, unless a new scan replaced them, and Save, which drops changes that cancel out and sends nothing, or plans the steps, updates the loaded tiles, shows the changes as saved, dropping a tag model load sent before it, and posts the steps in the background, putting tiles back for a refused step and showing the tags as they were; once a save or apply lands, the editor follows the playing item and loads the tag model again. It renames or removes a saved tag, or another client's renamed or deleted tag that a file has, in the presets, the applied filter, the library's filter, the Filter tab's unsaved changes, and its own held changes, loading the tag model again while it shows, changing the presets in place, then replacing the applied filter, and skips the tile patch for its own item-tag events. Another client's rename or delete of a tag no file has comes only as `tagCatalogChanged`, without the old name, and reaches none of those. Nothing loads, saves, or scans while the server fails the compatibility check or runs without a library, and while the tab shows it loads once the server is ready, keeping its changes.
- `src/clients/web/ReelRoulette.WebUI/src/tags/tagEditorModel.ts`
  - the catalog with pending edits applied (category order, Uncategorized last only while a tag has none, renamed tags renamed on the items), the model as a save of the changes leaves it, category rows and chips with what the items have, each row's count of tags in use and whether it holds unsaved changes, held changes moved to a tag renamed elsewhere or dropped for one deleted, category options, the Edit Tag, category, and new tag name problems, order moves, the save plan's input, Auto Tag's apply as a save step, and each save step's request.
- `src/clients/web/ReelRoulette.WebUI/src/tags/autoTagModel.ts`
  - Auto Tag rows from the scan, the rows and files shown with and without View all matches, the results with their placeholders and each row's box, where a file that has the tag counts as checked, the summary and status, selection, which only a file without the tag can take, whether Apply has work, the assignments it sends, the rows once Apply has sent them and once the server refuses it, and whether a scan's tag has left the catalog.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryOverlayModel.ts`
  - the Library tab's loading, error, and empty messages, with the timeout message for a load answered 408 or 504 and nothing for a 401, the message for a search or filter that matches nothing, and projection summary parsing.
- `src/clients/web/ReelRoulette.WebUI/src/library/keptSources.ts`
  - the kept-source notice's wording, naming each source as the Filter tab labels it with the items kept, and its `last.log` text, which names no folder.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryProjectionModel.ts`
  - projection item parse and list-query page parse, with duration read as seconds.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryProjectionSync.ts`
  - pure SSE patch helpers for favorite, blacklist, and playback fields on loaded tiles, matched by item id only.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryQuerySession.ts`
  - list-query window: first page, fill-on-scroll, hide/show, patch or reload, and resync. A favorite or blacklist on an item that is not loaded uses the event's previous values. Auto-tag scan sends only its scope. Tag save writes the tiles loaded now, updates the stored filter when a tag is renamed or deleted, and reloads that window once when a tag filter can change which files are shown.
- `src/clients/web/ReelRoulette.WebUI/src/library/tagSave.ts`
  - pending-only tag-editor save plan, the same local delta matched by item id (auto-tag by the scan rows' item ids), a confirmed tag kept when the request fails, failed-tail undo, the same filter retarget, and the same own-event skip for an exact item-tag echo. An incoming rename or delete retargets that filter before the reload. A rename or delete event for a wider set of files still applies.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryBrowseModel.ts`
  - sort mode, direction labels, and search text held by the Library tab.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridLayout.ts`
  - justified-row layout (`getAspectRatio`, `buildRows`), at the Library tab's tile size, rows 100 to 240 px high aiming for 160; layout width uses full scrollport.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridTileModel.ts`
  - grid tile HTML with the file name as the tile's tooltip, thumbnail URL builder, filled favorite and blacklist badges, and the playing icon every tile has, which shows only on the playing tile.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridRowModel.ts`
  - justified grid row HTML composition.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridVirtualizer.ts`
  - row offset index, visible-window calculation (900px overscan), and the height of the last loaded page.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryGridController.ts`
  - Library tab grid DOM lifecycle (mount, scroll, fill coverage with the last page's height, deferred layout while hidden, optional scroll reset on a new query, resize debounce, destroy), the message for no matches, and the playing tile, moved between the tiles shown without rendering them again.
- `src/clients/web/ReelRoulette.WebUI/src/library/libraryPlayModel.ts`
  - play-item error status mapping and request identity helpers for library tile activation.
- `src/clients/web/ReelRoulette.WebUI/src/playback/randomPick.ts`
  - the random pick request body, which names the preset dropdown's preset only while its filter still equals the applied filter, and random pick requests, one at a time, cancelled after 10 seconds without an answer; an answer that arrives after that is not used.
- `src/clients/web/ReelRoulette.WebUI/src/library/currentItemState.ts`
  - the playing item's favorite and blacklist from item-state events, and the per-item cache applied when an item plays again, both by item id.
- `src/clients/web/ReelRoulette.WebUI/src/shell.tsx`
  - mounts the page (`renderApp`, which returns an unmount function) and the startup error into `#app`.
- `src/clients/web/ReelRoulette.WebUI/src/main.ts`
  - bootstrap entrypoint. The theme applies before it runs, from `index.html`'s boot script, and the page follows it from `App.tsx`.
- `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts`
  - client and session ids (`rr_clientId` in `localStorage`, `rr_sessionId` in `sessionStorage`), client type and device name, and `requestPlayItem` for library tile play.
- `src/clients/web/ReelRoulette.WebUI/src/api/serverRequest.ts`
  - sending requests and reading their JSON, with one wording for each way they fail: a request that couldn't reach the server, whatever the browser calls it, a success whose body isn't JSON, which names its content type, and a failed status. Every 401 is handled here once: it asks for pairing with the request's route without ids, for the one `last.log` line the page sends, which the server refuses from a device that isn't paired, and throws an `UnauthorizedError`, for which no screen shows or logs a failure of its own.
- `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts`
  - the WebUI's one event stream: resume with the last event ID after an error, revision tracking, and handler dispatch for each event type.
- `src/clients/web/ReelRoulette.WebUI/src/events/eventEnvelope.ts`
  - event envelope parsing/building utilities.
- `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts`
  - runtime config parsing/validation.
- `src/clients/web/ReelRoulette.WebUI/src/config/appVersion.ts`
  - the app's version, which the build sets from the repository's `.version` file, without its leading `v`, through `scripts/app-version.mjs`.
- `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`
  - generated TS contracts from OpenAPI.

Boundary:

- WebUI does not own authoritative domain mutation semantics; it consumes server contracts.

---

## Contracts and Generated Client Surfaces

- Source of truth: `shared/api/openapi.yaml`.
- Server contract models/mapping:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs`
  - `src/core/ReelRoulette.Server/Contracts/ApiContractMapper.cs`
- Web generated contracts/tooling:
  - `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`
  - `src/clients/web/ReelRoulette.WebUI/scripts/verify-openapi-contracts-fresh.mjs`
  - `src/clients/web/ReelRoulette.WebUI/scripts/sync-shared-icon.mjs` (copies `favicon.ico` to `public/`, the logo SVGs and PWA PNGs from `assets/logo/` to `public/icons/` as they are, and the font)
  - `src/clients/web/ReelRoulette.WebUI/scripts/app-version.mjs` (reads the app's version from the repository's `.version` file, without its leading `v`, for the build, the tests, and the build output check)
  - `src/clients/web/ReelRoulette.WebUI/scripts/verify-build-output.mjs` (checks the build output's icons and their manifest sizes, checks `dist/runtime-config.json` with the app's `parseRuntimeConfig`, checks that the built scripts hold the app's version from `.version`, and checks that the built page keeps its theme boot script)
  - `src/clients/web/ReelRoulette.WebUI/public/sw.js` + `src/main.ts` service worker registration (Chromium PWA installability; document navigations only)
  - package scripts (`generate:contracts`, `verify:contracts`, `verify`).

---

## Verification and Test Surfaces

- Core regression tests:
  - `src/core/ReelRoulette.Core.Tests/*`
- System-check harness:
  - `src/core/ReelRoulette.Core.SystemChecks/*`
- WebUI tests:
  - `src/clients/web/ReelRoulette.WebUI/src/test/*`
  - screen tests under `src/test/screens/` mount the page in `happy-dom` against a fake server and event stream (`pageHarness.ts`).
- Manual test guide/checklist:
  - `docs/checklists/testing-checklist.md`

Canonical gates:

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`
- `npm run verify` (WebUI)
- `pwsh ./tools/scripts/verify-web-deploy.ps1`

---

## Runtime, Packaging, and CI Tooling

Runtime scripts:

- `tools/scripts/run-server.ps1`
- `tools/scripts/run-server-rebuild.ps1`
- scripts select `net10.0-windows` framework on Windows and `net10.0` on non-Windows for ServerApp startup.
- `tools/scripts/set-release-version.ps1` (release-aligned version fan-out for OpenAPI/runtime/tests/server project metadata, optional WebUI contract regen and verify gates, plus README/dev-setup release command examples; use `-NoDocUpdates` / `-NoRegenerateContracts` / `-NoRunVerify` to skip pieces)
- `tools/scripts/stage-webui-assets.ps1` (WebUI build + copy into server publish `wwwroot`; used by `release.yml` and packaged-server smoke)
- `tools/scripts/reset-checklist.ps1` (resets `docs/checklists/testing-checklist.md` metadata/checklist state, fills Release version from `.version` without its `-dev.N` suffix, and removes `Failed:`, `Skipped:`, and `Pending:` notes; preserves waived checks by default, supports `-RemoveWaived`)

Web verification:

- `tools/scripts/verify-web-deploy.ps1`
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` (headless Velopack Linux server AppImage: curls `/health`, `/api/version`, `/control/status`, `/operator`; checks the isolated menu entry and its icons; builds an AppImage locally when no path is passed)

Packaging and release:

- `.github/workflows/release.yml` (Velopack matrix build/pack/upload to B2; stable GitHub mirror of `Setup.exe` / `.AppImage` only; sole shipping pipeline)
- `tools/scripts/stage-webui-assets.ps1`
- logo and icon assets: `assets/logo/` (the server, its release legs, and the WebUI)

CI:

- `.github/workflows/ci.yml`
