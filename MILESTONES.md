# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. Each release becomes a new `M*` series when it is promoted.

The WebUI becomes the only client on every device. The desktop client is frozen to bug fixes (crashes, data loss, broken playback, security) until the desktop removal release, and until then server contract changes only add fields, so the last desktop build keeps working. The native Android client is dropped.

- **v0.15.0 — WebUI overhaul**: Serve the WebUI over HTTPS so it installs as an app, move it to Preact, give it a responsive layout with a side panel and phone overlays, and give it everything the desktop does: keyboard shortcuts, stats, settings, an admin section that replaces the Operator page and manages refresh, backups, duplicates, sources, and catalog transfer, Show in File Manager, a browser-playable filter, and multi-select. The desktop still ships as a fallback, and its last build tells users it is retired. M12a, M12b, M12c, M12d, M12e, M12f, M12g, M12h, M12i, M12j, M12k, M12l, M12m, M12n, M12o, M12p, M12q, M12r.
- **v0.16.0 — Desktop removal**: Remove the desktop client, its packaging, and its tests, then move preset writes to per-preset routes. P48, P25.
- **v0.16.1 — Structured log foundation**: Write `last.log` as structured JSON Lines through one server writer and give the WebUI a typed, privacy-safe log API. P27a, P27b.
- **v0.17.0 — Accounts**: Require an account PIN from LAN and remote clients, with per-user source access. P28b, P28c, P28d, P28e, P28f, P28g, P28h, P28j, P28k, P28l.
- **v0.18.0 — Structured log migration and Log Viewer**: Move every server and WebUI log to the structured API and give the admin section a filterable Log Viewer. P27d, P27e, P27f, P27g.
- **v0.19.0 — Playback sessions**: Let the server choose direct, remux, or transcode playback per session for the WebUI. P2a, P2b, P2c, P2d, P2f, P2g, P2h.
- **Unscheduled backlog**: P1, P4, P5, P6, P9a, P9b, P10, P33, P35, P36.

## Document Purpose

Use this file for:

- milestone status (⏳ Planned | 🚧 In Progress | ✅ Complete),
- scope and acceptance criteria,
- verification evidence.

Do not use this file for detailed architecture explanation or current capability inventory.

## Ownership Boundaries

- `MILESTONES.md`: roadmap, milestone scope, acceptance gates, verification evidence.
- `MILESTONES-COMPLETED.md`: archive of finished milestones.
- `CONTEXT.md`: current implemented capabilities across server/desktop/web/operator.
- `AGENTS.md`: agent workflow, boundaries, and doc-discipline rules.
- `docs/domain-inventory.md`: ownership-first implementation surface map.
- `README.md` + `docs/dev-setup.md`: run/setup/verify instructions.
- `docs/api.md` + `shared/api/openapi.yaml`: API behavior and contract source of truth.

## Maintenance Rules

- Keep entries **current-state accurate**: update statuses and evidence as work progresses.
- Keep scope locked to milestone intent.
- Record future work found during a milestone as its own backlog item in `## Planned Milestones`, or as an addition to the existing milestone that will do it. Check existing items first so the work is not recorded twice.
- Record scope boundaries in Scope as a `Not included:` line. When another milestone covers the boundary, name it by its exact title after "which is" (for example `Not included: rebinding, which is Customizable Keyboard Shortcuts.`), which `check-milestones.ps1` enforces.
- Organize milestone sections as:
  - `## Planned Releases`: the release outline at the top of this file; keep it in sync when milestones are added, moved, promoted, completed, or removed.
  - `## Active Milestones`: milestones currently being worked, using `M*` IDs in historical order.
  - `## Planned Milestones`: backlog candidates not yet started, using `P*` IDs in numerical order (for example base phases and lettered sub-slices).
- Finished milestones live in `MILESTONES-COMPLETED.md` under `## Completed Milestones`, newest completions first. These rules apply there too, except that completed entries keep their `Deferrals / Follow-ups` sections as historical record.
- Keep `## Active Milestones` updated with `Last milestone completed: Mx` so the next `M*` assignment is unambiguous.
- When promoting planned work to active work, assign the next `M*` ID at promotion time and keep planned `P*` IDs stable until then. Promote a planned release as a new `M*` series, with lettered milestones in its outline order.
- When a milestone is completed, move it to the top of `MILESTONES-COMPLETED.md` as-is: keep existing scope/acceptance/evidence detail unchanged except final-state corrections, and preserve newest completions first.
- In milestone body content (scope/acceptance/evidence), do not reference milestone IDs; use milestone names/descriptions (or "this milestone"/"this series") so ID reassignment does not require copy edits.
- ID references are allowed only in milestone section headers, the `Last milestone completed: Mx` tracker line, and the `## Planned Releases` outline.
- `Depends on` lines name milestones by their exact titles, which `check-milestones.ps1` enforces.
- Keep acceptance criteria testable and outcome-focused (avoid implementation-narrative bloat).
- Keep verification evidence concrete:
  - commands/checks run,
  - artifacts/docs updated,
  - waivers explicitly called out.
- Avoid duplicating architecture/runtime detail already owned by `CONTEXT.md` and docs under `docs/`.
- Prefer referencing owning docs instead of copying long explanatory sections into this file.
- Keep historical entries intact except for final-state correction of inaccurate facts.
- If script names/paths/contracts change, update milestone references to avoid stale guidance.

## Milestone Template

### Mx - {Milestone Title}

- **Status**: ⏳ Planned | 🚧 In Progress | ✅ Complete
- **Goal**: {one concise outcome statement}
- **Scope**:
  - {key deliverable 1}
  - {key deliverable 2}
  - {key deliverable 3}
  - Not included: {scope boundary}, which is {covering milestone title}. Leave out the "which is" part when no milestone covers it.
- **Acceptance criteria**:
  - {testable outcome 1}
  - {testable outcome 2}
  - {testable outcome 3}
- **Verification evidence**:
  - {automated checks run}
  - {manual checks/evidence notes}
  - {docs/artifacts updated}

### Px - {Planned Milestone Title}

- **Status**: ⏳ Planned
- **Goal**: {one concise outcome statement}
- **Scope**:
  - {key deliverable 1}
  - {key deliverable 2}
  - {key deliverable 3}
  - Not included: {scope boundary}, which is {covering milestone title}. Leave out the "which is" part when no milestone covers it.
- **Acceptance criteria**:
  - {testable outcome 1}
  - {testable outcome 2}
  - {testable outcome 3}
- **Verification evidence**:
  - {automated checks run}
  - {manual checks/evidence notes}
  - {docs/artifacts updated}

---

## Active Milestones

Last milestone completed: M12a

### M12b - WebUI Preact Migration

- **Status**: ⏳ Planned
- **Goal**: The WebUI's screens are Preact components with tests, built on the existing typed modules, with no visible change.
- **Scope**:
  - Ships in v0.15.0, after the reverse proxy and HTTPS access milestone.
  - Measured again at this edit: `src/app.js` is 3,624 lines. `startApp` runs from line 183 to the end as one untyped function with 139 nested functions, which share one `state` object of 33 fields and 27 top-level `let` variables. It looks up 74 elements by id and adds 67 event listeners, and no test imports it. It has 16 `innerHTML` assignments and 9 native dialog calls. The 263 WebUI tests in 23 files cover only the typed modules, and they run with `environment: "node"`, so there is no DOM to test screens against. The built bundle is 119 KB of JavaScript, 32.9 KB gzipped.
  - Preact was chosen at this edit over React, Lit, Svelte, Solid, and plain TypeScript: it adds about 4–5 KB gzipped (published size, inferred), where React would add about 45 KB (inferred); TypeScript checks its JSX; and it adds listeners to each element as `app.js` does, so events behave the same while both run.
  - Packages, installed with approval when this milestone starts: `preact`, `@preact/signals`, `happy-dom`, and `@testing-library/preact`, whose role, label, and text queries also work on the current markup (inferred). `@preact/preset-vite` is not needed: Vite compiles JSX from the tsconfig settings, and the preset only adds hot reload (inferred).
  - Test setup, read from config at this edit: Vitest includes only `src/test/**/*.test.ts`, so `.test.tsx` files would not run, and neither tsconfig sets `jsx` or `jsxImportSource`. Screen tests opt into `happy-dom` per file or through a separate Vitest project, so the model tests keep running under node.
  - Until the last slice, `app.js` runs inside the Preact root. The root renders the markup not yet migrated once and starts `app.js` after mount, and Preact never re-renders markup `app.js` owns. `app.js` and the components share state only through the store: `app.js` imports the store's actions, so its `setStatus` becomes a store write, and the event handlers `app.js` still owns subscribe through the store.
  - The store is `@preact/signals` and holds only state several screens use: the current item and history, loop and autoplay, presets and the active preset, the applied filter, randomization mode, photo duration, the item-state cache, the compatibility block, and the status line, whose changes keep relaying to `last.log` as they do now. `app.js` reads and writes the same signals and updates the markup it still owns with `effect()`. Each screen keeps its own working state, such as the tag editor's pending edits, Auto Tag's rows, and the filter dialog's working copy.
  - The store exposes the actions that cross screens today (read from code at this edit): the tag editor pauses the player when it opens and resumes it when it closes (`pauseForTagEditor`, `resumeAfterTagEditor`); a tag save retargets the applied filter and cached presets (`retargetLiveTagFilters`); playing from the library closes the overlay and starts the player; and applying a filter updates the header preset and reloads the library.
  - Each slice moves its logic that renders nothing into typed `.ts` modules tested under node like the existing ones, such as the tag save steps, item-tags event handling, `playCurrent` and random pick, and preset matching. Components only render and wire.
  - Keep the typed modules (library query session, grid layout and virtualizer, tag save, filter state model, events, API) and call them from the components rather than rewriting them. The exception is `renderLibraryOverlayBodyHtml` in `libraryOverlayModel.ts`, which writes the library overlay's loading, error, and empty messages through `innerHTML`; the library overlay slice replaces it.
  - Each slice starts by writing behavior tests for its screen against the current `app.js` in `happy-dom`: the page mounted through `renderApp` with a fake `fetch` and a fake event source (`createSseClient` already takes `createEventSource`), queried by role, label, and text. The slice then migrates the screen and keeps those tests passing, changing only how the page is mounted, and they become its component tests. That `app.js` runs under `happy-dom` is inferred, not measured.
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
  - Delete `app.js` and `app.d.ts` after the last slice, with the undeclared-name check: `scripts/verify-app-js-names.mjs`, its `verify:app-js-names` step in `npm run verify`, and the step's description in the WebUI README. Update `docs/domain-inventory.md`, which names `app.js` and `shell.ts`, and the WebUI section of `CONTEXT.md`.
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

### M12c - WebUI Responsive Layout and Panels

- **Status**: ⏳ Planned
- **Goal**: The WebUI layout adapts to the viewport: on tablets and desktops a side panel beside the player keeps the video playing in view while browsing, filtering, tagging, or viewing stats and settings, and on phones the panel is a full-screen overlay.
- **Scope**:
  - Ships in v0.15.0, after the WebUI Preact migration milestone. Depends on: WebUI Preact Migration.
  - This changes user-facing UX: mockups for phone, tablet, and desktop widths are approved before code.
  - Measured again at promotion: the tag editor, filter, and library overlays are each `position: fixed; inset: 0` with `z-index: 1000`, so they cover the player while it keeps playing underneath, except that the tag editor pauses playback when it opens and resumes it when it closes (`pauseForTagEditor` and `resumeAfterTagEditor`, read from code when Auto-Pause was planned). The stylesheet has two `@media (max-width: 600px)` rules, and mobile browsers are detected by user agent (`isMobileBrowser` in `app.js`).
  - The main page is a header bar, the player with its overlay controls as today, and the footer status line as today. The header holds the app name and the current file name, and at the right a settings icon and an admin icon. The settings icon arrives with the Settings tab in WebUI Settings Panel, and the admin icon with WebUI Admin Section. Photo duration stays in the header until WebUI Settings Panel moves it into the Settings tab, and the pairing token prompt keeps showing there when the server asks for pairing.
  - A panel host: at most one side panel is open at a time. At tablet and desktop widths it sits beside the player, on the left or right as a per-device setting, with a width the user adjusts between a minimum and a maximum set with the mockups and that is remembered per device. At phone widths it is a full-screen overlay with the same tabs. Breakpoints use viewport width and pointer type, not the user agent. The side is chosen in the Settings tab, which WebUI Settings Panel adds; until then the panel uses its default side.
  - The panel has a single row of icon-only tabs: Library, Filter, Tags, Stats, and Settings. Each tab uses the icon the WebUI already uses for it, such as the player's grid, filter, and tag icons, and has a tooltip and an accessible name. This milestone builds the Library, Filter, and Tags tabs from the library overlay, filter dialog, and tag editor; WebUI Stats Panel and WebUI Settings Panel add the Stats and Settings tabs.
  - The player's grid, filter, and tag buttons open the panel on the matching tab, and the panel remembers its last tab.
  - Auto-Pause replaces the tag editor's pause and resume. Opening the panel on any tab, or as its full-screen overlay, pauses playback according to an Auto-Pause mode:
    - **Never**: never pauses.
    - **Always**: pauses whenever the panel opens, at any width.
    - **Responsive**, the default: pauses only while the panel covers the player, as the full-screen overlay does on phones. An open panel that crosses a breakpoint pauses when it comes to cover the player and resumes, if Auto-Pause paused it, when it moves beside the player.
    - The admin view, which WebUI Admin Section adds, always covers the player, so it pauses under Always and Responsive.
    - Closing resumes playback only if Auto-Pause paused it; playback the user paused stays paused. Playing or pausing while the panel is open hands playback back to the user, so closing leaves it as it is. Pausing a photo holds its autoplay timer, as the tag editor does today.
    - The mode is fixed at Responsive until WebUI Settings Panel adds the setting. WebUI Preact Migration keeps today's tag editor pause, since that milestone changes nothing visible.
  - The preset dropdown and randomization mode leave the header for the Library tab, laid out like the desktop library panel: above the grid, the preset, then randomization mode, then sort with its direction toggle, then search.
  - The Library tab fits its column count to the panel width, and choosing a tile plays it in the player beside the panel.
  - The WebUI remembers its per-device state across a page refresh, as the desktop remembers its own across restarts. This milestone adds one per-device store and remembers the active preset (including None) and applied filter, randomization mode, sort and direction, and the panel's width and last tab. WebUI Settings Panel and WebUI Keyboard Shortcuts and Player Controls remember the client settings they add the same way, and so does duplicate review in Admin Refresh, Backup, and Duplicate Review. The search text is not remembered. The randomization mode already stored per device carries over.
  - Presets stay on the server: the WebUI remembers only which preset is active and the filter it applied. A remembered preset, tag, or source that was renamed or deleted on another device in the meantime is handled as it is when that happens while the WebUI is open.
  - Trap, inferred: browser storage is kept per address, so on one device the WebUI opened at `localhost`, at the LAN address, and through an HTTPS proxy remembers three separate sets of state.
  - Not included: the playing item and its position, which is Resume Position and Session Continuity.
  - Auto Tag opens as an overlay from the Tags tab instead of as a tab of the tag editor.
  - Not included: admin and duplicate review as panel tabs. They open in a full-page admin view, which is WebUI Admin Section.
  - The panel stays inside the fullscreen stage, so it works in fullscreen as the overlays do today, including iOS pseudo-fullscreen.
  - Phone layouts work in an installed app (standalone display, safe-area insets).
  - Add a Release Specific checklist item: "On a phone, a tablet, and a desktop browser, and as an installed app on Android and iOS, the panel opens beside the player on either side or as an overlay by width; with Auto-Pause on Responsive, playback keeps going on every tab beside the player, and the overlay pauses it and resumes it on close."
- **Acceptance criteria**:
  - The main page shows the header bar with the app name and current file name, the player with its overlay controls, and the footer status line, and the header no longer shows the preset dropdown or randomization mode.
  - At most one panel is open at a time.
  - At tablet and desktop widths, the panel opens beside the player on the side set for the device, its width adjusts only between its minimum and maximum and is remembered per device, and with Auto-Pause on Responsive the video stays visible and playing.
  - At phone widths, the panel opens as a full-screen overlay with the same tabs, and closing it returns to the player.
  - With Auto-Pause on Responsive, opening the panel beside the player leaves playback going, opening it as a full-screen overlay pauses it, and an open panel that crosses a breakpoint pauses or resumes as it comes to cover the player or moves beside it.
  - With Auto-Pause on Always, opening the panel pauses playback at every width; on Never, opening it never pauses.
  - Closing the panel resumes playback only if Auto-Pause paused it, playback the user paused stays paused, and playing or pausing while the panel is open leaves playback as it is on close.
  - Auto-Pause holds a photo's autoplay timer while it pauses.
  - The tag editor has no pause of its own, and Auto-Pause is Responsive until the Settings tab can change it.
  - The tabs are one row of icons, each with a tooltip and an accessible name, and the Library, Filter, and Tags icons match the player's grid, filter, and tag icons.
  - The player's grid, filter, and tag buttons open the panel on the Library, Filter, and Tags tabs, and the panel reopens on its last tab.
  - The Library tab shows, above the grid and in this order, the preset dropdown, randomization mode, sort with its direction toggle, and search.
  - The Library tab fits its column count to the panel width, and choosing a tile plays it beside the panel.
  - After a page refresh, the active preset and applied filter, randomization mode, sort and direction, and the panel's width and last tab are each as they were, and the search box is empty.
  - After a page refresh, a remembered preset, tag, or source that was renamed or deleted elsewhere is handled as it is when that happens while the WebUI is open.
  - Auto Tag opens as an overlay from the Tags tab.
  - Resizing the window across a breakpoint moves an open panel between side panel and overlay without losing its state.
  - The panel works in fullscreen.
  - The layout does not depend on the user agent.
- **Verification evidence**:
  - Completion evidence must include component tests for panel host breakpoints, panel side, width limits and memory, tab selection and the last tab, the tabs' accessible names, the Library tab's control order and column fitting, a page refresh keeping each remembered setting and clearing the search text, and Auto-Pause in each mode at phone and desktop widths, across a breakpoint, with playback the user paused or resumed, and with a photo, `npm run verify`, and one quick spot check on a phone and a desktop browser.

### M12d - WebUI In-App Dialogs

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for names and confirmations in its own dialogs, styled like the rest of the WebUI, instead of the browser's `prompt`, `confirm`, and `alert`.
- **Scope**:
  - Ships in v0.15.0, after the WebUI responsive layout and panels milestone. Depends on: WebUI Preact Migration, so the dialog is a Preact component the migrated screens use.
  - Found during the post-migration fixes desktop spot checks: preset rename in the WebUI opens the browser's native prompt, which does not match the WebUI's styling and does not suit the WebUI when it runs as an installed web app.
  - Measured again at promotion: `app.js` uses native dialogs in nine places, and no other WebUI file uses any: preset delete and rename; tag editor category rename, duplicate-name alert, and category delete; tag delete; two **Discard changes?** confirmations; and new category name.
  - One reusable in-app dialog for text input, confirmation, and notice, with keyboard support (Enter confirms, Escape cancels) and focus returning to where it was.
  - Dialogs render inside the fullscreen stage, not outside it, or they disappear in fullscreen: only the stage shows in fullscreen (read from code).
  - Keep each dialog's wording and outcome as it is today; only how it is shown changes. Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - The WebUI calls no `prompt`, `confirm`, or `alert`.
  - Each replaced dialog keeps its wording, and confirming or canceling does what it does today.
  - The dialogs match the WebUI's theme and work in an installed web app on desktop and mobile.
  - The dialogs render inside the fullscreen stage and show and work in fullscreen.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include WebUI tests for confirm and cancel on the shared dialog and for the dialog rendering inside the fullscreen stage, a check that no native dialog calls remain, `npm run verify`, and a spot check in an installed web app.

### M12e - WebUI Settings Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI side panel has a Settings tab for per-device preferences and diagnostics.
- **Scope**:
  - Ships in v0.15.0, after the WebUI in-app dialogs milestone. Depends on: WebUI Responsive Layout and Panels.
  - The Settings tab joins the side panel's tab row, and the header's settings icon arrives with it and opens the panel on the Settings tab.
  - Not included: admin. It opens as a full-page view from the header's admin icon, which is WebUI Admin Section.
  - Checked against the code at promotion: the diagnostics panel is shown only when `isMobileBrowser()` is true. Photo duration and randomization mode are already kept per device in `localStorage`; autoplay and loop are not kept and start off.
  - Move the diagnostics information to the Settings tab and remove the diagnostics panel from below the main page's status line. That panel is currently shown only on mobile browsers by design; in the v0.13.0 manual regression pass it appeared only on the phone in Firefox.
  - Client settings live in the Settings tab, all per device: photo duration, which leaves the header, the side the panel opens on, and Auto-Pause (Never, Always, or Responsive, the default), which WebUI Responsive Layout and Panels describes and keeps at Responsive until this setting exists. Randomization mode is in the Library tab, which WebUI Responsive Layout and Panels builds.
  - Every client setting survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds. Remembering is the default, with no option to turn it off. The photo duration already stored per device carries over.
  - Loop, autoplay, and mute are only the player's buttons, with no entry in the Settings tab, and each button's state survives a page refresh. The autoplay mode and its timer are Settings tab entries, which WebUI Keyboard Shortcuts and Player Controls adds.
  - Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - The Settings tab holds the client settings, including photo duration, the panel's side, and Auto-Pause, and the header no longer shows photo duration.
  - Auto-Pause offers Never, Always, and Responsive, starts at Responsive, and the panel pauses as the chosen mode says.
  - The Settings tab has no loop or autoplay entry.
  - The header's settings icon opens the panel on the Settings tab.
  - The Settings tab shows the diagnostics information on desktop and mobile browsers, and the main page no longer shows the diagnostics panel.
  - After a page refresh, photo duration, the panel's side, Auto-Pause, and the autoplay, loop, and mute buttons' state are each as they were.
  - Preferences are stored per device and do not change other devices.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for preference storage and for a page refresh keeping each setting this milestone adds, `npm run verify`, and one quick spot check on a phone.
  - Add a Release Specific checklist item: "On a desktop browser and a phone, and as an installed app, every remembered setting is kept after a refresh and a browser restart, and the library search starts empty."

### M12f - WebUI Admin Section

- **Status**: ⏳ Planned
- **Goal**: Everything the Operator page does moves into a full-page admin section of the WebUI, and the server keeps a minimal recovery page for when the WebUI's files are broken.
- **Scope**:
  - Ships in v0.15.0, after the WebUI settings panel milestone. Depends on: WebUI Responsive Layout and Panels, whose header holds the admin icon, and Catalog Open and Backup Safety, whose library state and message the admin section shows.
  - Measured again at promotion: the Operator page is 842 lines of HTML, CSS, and JavaScript inside a raw string in `src/core/ReelRoulette.ServerApp/Program.cs`, up from 779 when this entry was written, after the control token, shutdown, and no-library work. No test covers the page's content; the only test that names `/operator` checks that the library route gate leaves it open. The sections listed below match the page, and `verify-linux-packaged-server-smoke.sh` still requests `/operator`.
  - Admin section slice:
    - Admin is a full-page view opened from the header's admin icon, not a panel tab. The icon is always visible. The view keeps the Operator page's responsive layout (a 12-column grid that changes at 620 and 980 px wide, read from code at this edit), restyled to match the rest of the WebUI.
    - The admin view covers the player, so opening it pauses playback under the Always and Responsive Auto-Pause modes, and leaving it resumes playback only if Auto-Pause paused it, as WebUI Responsive Layout and Panels describes.
    - Move every Operator section into the admin section as Preact screens: server updates, runtime status with restart and stop (including the message when the server runs without a library), web runtime settings (port, Allow remote connections, mDNS advertising and LAN hostname, and auth mode and shared token, without Enable Web UI, which the always-on WebUI slice drops), control settings (control token, dev channel, Launch Server on Startup), the testing suite, connected clients, server logs, and incoming and outgoing API events. They call the same control routes, so there is no contract change.
    - The Operator's update download needs two attempts every time: click Download and confirm, and nothing happens; click Download and confirm again, and it downloads. Find the cause before building the admin section's update controls, so they don't inherit it. No commit has fixed it (checked at promotion).
    - Gating: opening admin from another machine asks for the control token first, through `POST /control/pair`, and shows nothing until it is accepted. On the server machine, which the merged localhost helper decides, it opens directly. The accounts release replaces the token with admin accounts.
    - Later admin work lands here: refresh, backup, and duplicate review, with duplicate review opening within the admin section, source and item management, catalog transfer, the Log Viewer, and account administration.
  - Recovery page slice:
    - The server keeps a minimal built-in page with restart, stop, a log tail, and updates, at a fixed path such as `/recovery` (decided here). It does not load the WebUI's files, so it works when they are missing or broken, and it has the same control-token gating.
    - It renders settings and status text without `innerHTML` interpolation (found by the repository audit: Operator HTML page interpolates user input via `innerHTML`).
    - Retire the Operator page: `/operator` redirects to the admin section, the tray's Operator shortcut opens the admin section, `verify-linux-packaged-server-smoke.sh` checks the recovery page and the admin section entry instead of `/operator`, and the testing checklist's Smoke item checks the admin section instead of the Operator page.
  - Always-on WebUI slice:
    - The server always serves the WebUI from this release, since the admin section lives there, and ignores the web runtime settings' `enabled` field. Read from code at this edit: turned off, that field stops the server serving the WebUI's files and `/runtime-config.json` from its next start, leaves the WebUI's origins out of CORS, and stops mDNS advertising. Turned off from the admin section, it would remove the admin section itself, and the recovery page has no way to turn it back on.
    - The field stays in the contract, so the last desktop build keeps working, and the server reports it as on. Trap, read from code: the desktop enables its Open Web UI menu item only when the server reports the WebUI as on, and Desktop Retirement Notice's notice offers that action. Desktop Client Removal drops the field.
    - The admin section has no Enable Web UI switch, and the frozen desktop's Settings dialog loses its Enable Web UI switch, which would no longer do anything (approved as a desktop change outside bug fixes). `docs/api.md` and `docs/dev-setup.md` stop describing the WebUI as optional.
- **Acceptance criteria**:
  - The header's admin icon is always visible and opens the admin section as a full-page view, not a panel tab.
  - Under Always and Responsive, opening the admin section pauses playback and leaving it resumes only playback Auto-Pause paused; under Never, playback keeps going.
  - The admin section keeps the Operator page's layout at phone and desktop widths and matches the rest of the WebUI's styling.
  - The admin section offers every action and setting the Operator page offers today and calls the same routes.
  - In the admin section, one Download click and one confirmation start the update download.
  - From another machine, opening admin asks for the control token first, and nothing in the admin section is shown until a valid token is entered; on the server machine it opens without one.
  - With the WebUI's files removed, the recovery page restarts, stops, shows logs, and checks, downloads, and applies updates.
  - The recovery page renders settings, status, and log text without `innerHTML` interpolation.
  - `/operator` reaches the admin section, and the packaged Linux server smoke passes against the recovery page.
  - With the web runtime settings' `enabled` stored or posted as off, the server still serves the WebUI and `/runtime-config.json`, allows the WebUI's CORS origins, and, with remote connections and mDNS on, advertises over mDNS after a restart, and it reports `enabled` as on.
  - Neither the admin section nor the desktop Settings dialog shows an Enable Web UI switch, and `enabled` is still in OpenAPI.
- **Verification evidence**:
  - Completion evidence must include admin section UI tests for the admin icon opening the full-page view, Auto-Pause on opening and leaving it in each mode, loading status and settings, saving settings, the testing panel, and control-token gating in `npm run verify`, server tests that the recovery page is served without WebUI assets and keeps control-token gating, server tests that a stored or posted `enabled` of off is ignored and reported as on, a desktop test that the Settings dialog has no Enable Web UI switch, `dotnet test ReelRoulette.sln`, and `./tools/scripts/verify-linux-packaged-server-smoke.sh`.
  - Server tests call the handlers and gating as functions over `DefaultHttpContext`, as the library route gate's tests do. No test project has an HTTP test host, and `Microsoft.AspNetCore.TestHost` is not added (decided at promotion).
  - Add a Release Specific checklist item: "From another machine, the admin section asks for the control token and works after it is entered; with the WebUI files removed, the recovery page restarts, stops, shows logs, and applies an update, on Linux and Windows."

### M12g - Admin Refresh, Backup, and Duplicate Review

- **Status**: ⏳ Planned
- **Goal**: The admin section starts a refresh, edits refresh and backup settings, and reviews and applies duplicates, so none of these needs the desktop.
- **Scope**:
  - Ships in v0.15.0, after the WebUI admin section milestone. Depends on: WebUI Admin Section.
  - Measured again at promotion: only the desktop calls `POST /api/refresh/start`, `/api/refresh/settings`, `/api/backup/settings`, `/api/duplicates/scan`, and `/api/duplicates/apply`. The routes exist, so this needs no contract change. The tray can also start a refresh.
  - Gated like the rest of the admin section.
  - Refresh slice: Refresh Now with the refresh status, and the refresh settings the desktop Settings dialog shows: auto-refresh and its interval (5–1440 minutes), forced loudness and duration rescans on the next refresh, and fingerprint scan parallelism (1–16). The ranges are the ones the server already clamps to (read from code at this edit).
  - Backup slice: server backups on or off, the time between backups (1–10080 minutes), the number kept (1–100), and the days of daily backups kept. The first two ranges are the server's clamps, as above.
  - Daily retention, in the backup slice: on top of the existing count limit, catalog backup rotation keeps one backup per date for a number of days set in the server's backup settings. It applies to current- and older-version backups alike, so older-version backups, which rotation keeps and does not count today, age out with their dates. Newer-version backups and files rotation does not recognize are never touched. The days setting adds a field to the backup settings, a contract change that only adds.
  - Trap: the refresh and backup settings routes assign every field from the posted snapshot, so a partial post writes defaults (Server Robustness Findings; still the case at promotion). Until that is fixed, the admin section posts the full settings it read.
  - Duplicate review slice: scan the whole library or one source, show each group with thumbnails and the comparison details the desktop shows (file name, plays, tags, favorite, blacklisted), choose Keep All or a file to keep per group, default to Keep All or Select Best from a per-device preference, and confirm counts before deleting. The preference is chosen in duplicate review rather than the Settings tab, since nothing else uses it, starts at Keep All as on the desktop, and survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds. It opens within the admin section's full-page view, not as a panel tab.
  - Add a Release Specific checklist item: "From the admin section, start a refresh, change refresh and backup settings, and scan and apply duplicates with Keep All and with a chosen file, and the library updates."
- **Acceptance criteria**:
  - Refresh Now starts a refresh, and the status line shows its progress and result.
  - Refresh and backup settings load and save, and saving one field leaves the others as they were on the server.
  - Each refresh and backup field accepts the range the server enforces.
  - With daily retention set to a number of days, rotation keeps the count limit's newest current-version backups plus the newest backup of each date in that window, current-version or older-version, and deletes older-version backups whose dates fall outside it.
  - Newer-version backups and unrecognized files in `backups/` are byte-identical after rotation, with daily retention on or off.
  - Duplicate review opens within the admin section.
  - Duplicate apply deletes only the files not kept, after confirming counts, and Keep All deletes nothing in that group.
  - The duplicate default is chosen in duplicate review, starts at Keep All, is kept per device, and survives a page refresh.
- **Verification evidence**:
  - Completion evidence must include admin section UI tests for each slice, including the duplicate default surviving a page refresh, `npm run verify`, and one quick spot check of a refresh and a duplicate scan.

### M12h - Admin Source and Item Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources and remove library items from the WebUI admin section, with server routes for what no client can do today, and every open WebUI follows source changes without a reload.
- **Scope**:
  - Ships in v0.15.0, after the admin refresh, backup, and duplicate review milestone. Depends on: WebUI Admin Section.
  - Gated like the rest of the admin section: localhost, or the control token from other machines. The accounts release later moves this behind admin accounts.
  - Today the desktop Manage Sources dialog shows Rename and Remove buttons and the grid shows Remove from Library, but none of them has a server route; v0.14.0 hides them, and the frozen desktop keeps them hidden. Checked at promotion: the routes are still missing and the three controls are still hidden.
  - Contract slice: server routes to rename a source, remove a source (its items leave the catalog; files stay on disk), and remove items from the library, with the delete-from-disk option the desktop remove dialog offers. OpenAPI and generated WebUI types.
  - Manage Sources slice: list sources with the statistics the desktop dialog shows (total media, videos, photos, total duration, and videos with and without audio), add a folder, rename, remove, enable and disable, and refresh. Folder import, enable and disable, and refresh routes already exist. Read from code at promotion: the per-source statistics already come from the `sources` list of `GET /api/library/stats`, so they need no contract change, and the refresh route takes no source id, so a source's Refresh starts a whole-library refresh, as the desktop's does. Duplicate review is Admin Refresh, Backup, and Duplicate Review.
  - Adding a folder takes a path on the server machine. A browser folder picker returns paths on the browser's machine (inferred), and the desktop's Import Folder has the same flaw today: it sends its own folder picker path to the server (read from code), so it only works on the server machine. Whether the admin section takes a typed path that the server checks, or browses the server's folders through a new admin-only route, is decided here; a browse route is a contract change in its own slice.
  - The item removal route also serves bulk removal in WebUI Multi-Select and Bulk Actions.
  - Source and item changes publish events so connected clients update. Read from code at promotion: only enabling or disabling a source publishes one (`sourceStateChanged`), and `POST /api/sources/import` publishes nothing, so import gets an event here too.
  - WebUI source sync slice, folded in from WebUI Source State Sync at promotion: the server already applies source state (list query, random selection, and item play only use enabled sources), and the WebUI keeps no source authority of its own; its source checkboxes are a filter choice. Checked at promotion: the WebUI ignores `sourceStateChanged` and reads `GET /api/sources` only when the filter dialog loads its data. On a source event, reload the loaded library window, keeping the scroll position as the desktop does, and refresh the Filter tab's source list.
  - Not included: per-user source visibility, which is Per-User Source Permissions.
- **Acceptance criteria**:
  - From the admin section, sources can be added by server path, renamed, removed, enabled, disabled, and refreshed, with per-source statistics.
  - Removing a source removes its items from the catalog and leaves its files.
  - The item removal route removes items with and without deleting from disk.
  - Adding, renaming, removing, enabling, or disabling a source from the admin section or the desktop updates every open WebUI's library window and Filter tab source list without a reload.
  - Removing items updates connected WebUI sessions through events and list requery.
  - New routes are in OpenAPI, and `npm run verify:contracts` passes.
- **Verification evidence**:
  - Completion evidence must include server tests for each new route and for the event each source change publishes, admin section UI tests for Manage Sources, WebUI tests for source event handling, `dotnet test ReelRoulette.sln`, `npm run verify`, and one quick spot check of an admin section source toggle seen in another WebUI tab.
  - Add a Release Specific checklist item: "From the admin section, add, rename, disable, refresh, and remove a source, and other open WebUI sessions update without a reload."

### M12i - Admin Library Catalog Transfer

- **Status**: ⏳ Planned
- **Goal**: Export and import the library from the WebUI admin section, with the server applying the catalog, so catalog transfer does not need the desktop app.
- **Scope**:
  - Ships in v0.15.0, after the admin source and item management milestone. Depends on: WebUI Admin Section, Remove library.json Library Support, and Catalog Open and Backup Safety, so import can restore a library while the server runs without one.
  - Gated like the rest of the admin section.
  - Today import is desktop-only and needs the server stopped: `LibraryArchiveMigration.ImportDatabase` writes the server's `library.db` from the desktop process (read from code, still the case at promotion). This is the main blocker for removing the desktop.
  - Export is already a server operation, checked at promotion: `GET /api/library/catalog-checkpoint` writes a standalone checkpoint while the server has `library.db` open, and the desktop's Library Export saves that file. The admin section's export uses the same route. What is left is moving import onto server operations. Settings and backups are not part of the transfer. Presets and thumbnail revision and dimensions travel with `library.db`. JPEG files stay in the local thumbnail directory.
  - Reuse the replace-and-recover protocol already in `LibraryCatalogStore` (incoming file, finished-file rename, recovery), which the desktop import uses today with the server stopped. What is new is replacing the database while the server's catalog session is open.
  - Import runs while the server is up. The previous database stays aside until the new file is in place and opens. A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed. A file that is not a library database is rejected.
  - Import also works while the server runs without a library, and can import one of the server's own backups, which is how the admin section restores a backup.
  - Import keeps the source folder remap the desktop import offers.
  - Add export and import actions to the admin section. Desktop Client Removal removes the desktop's Library Export and Import menus.
  - Trap: re-measured at promotion on a copy of the developer's catalog, `library.db` is 92.5 MB (92,520,448 bytes, no free pages) for 49,055 items, up from 70.5 MB when this entry was written. That is larger than ASP.NET Core's default request body limit of about 30 MB (the framework default, not tested here). Read from code at promotion: the server raises the multipart form limit (`FormOptions.MultipartBodyLengthLimit`) to 512 MB, left from earlier library import work, but no route reads a form now and the request body limit itself is not raised. The import upload needs its own limit and should stream to the incoming file rather than buffer in memory.
- **Acceptance criteria**:
  - The admin section can export a server-produced checkpoint and import a `library.db` while the server is running.
  - An interrupted import leaves the previous catalog or the finished incoming file, never a partial database or an empty catalog.
  - Import rejects a file that is not a library database and does not replace the live catalog.
  - Import replaces the catalog, including presets and thumbnail revision and dimensions. Settings and backups stay where they are. JPEG files stay in the local thumbnail directory.
  - Connected clients resync after an import.
- **Verification evidence**:
  - Completion evidence must include server tests for running-server import, rejection of a file that is not a library database, and interrupted-replace recovery, plus admin section UI tests for export and import, including an upload larger than 30 MB.
  - Add a Release Specific checklist item: "With no desktop app, export the library from the admin section and import it into a fresh server, on Linux and Windows."

### M12j - WebUI Stats Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI shows library and playback statistics and details of the current file in a Stats tab, as the desktop stats panel does.
- **Scope**:
  - Ships in v0.15.0, after the admin library catalog transfer milestone. Depends on: WebUI Responsive Layout and Panels.
  - Measured again at promotion: the WebUI never calls `GET /api/library/stats`, and its now-playing line shows only the file name and duration.
  - Library and current-file stats live in the side panel's Stats tab, which joins the tab row here. Clicking the current file name in the header opens the panel on the Stats tab.
  - Library stats: total videos, photos, and media, favorites, blacklisted, total plays, unique media played, never played, videos with and without audio, and baseline loudness.
  - Current file: file name and full path, plays, last played (the time before this play, or Never), favorite, blacklisted, duration, has audio, loudness, adjustment, peak, and tags.
  - Refresh after events and actions is coalesced as the desktop does it: a short wait gathers a burst, one request is in flight at a time, and requests during it get one more.
  - No contract change. Inferred from code at promotion: loudness and peak already come with each list and single-item read as `integratedLoudness` and `peakDb`, but the OpenAPI item schema does not name them (it allows extra properties), so they are untyped in the generated WebUI types.
  - Not included: playback history charts, which is Playback History and Analytics.
- **Acceptance criteria**:
  - The Stats tab shows the library stats and the current file section.
  - Clicking the current file name in the header opens the panel on the Stats tab.
  - The library stats match the library stats response.
  - The current file section updates on play, favorite, blacklist, tag, and playback events.
  - A burst of events causes one stats request, plus at most one more for events during it.
- **Verification evidence**:
  - Completion evidence must include component tests for both sections and for the file name opening the Stats tab, coalescing tests, `npm run verify`, and one quick spot check.

### M12k - WebUI Keyboard Shortcuts and Player Controls

- **Status**: ⏳ Planned
- **Goal**: The WebUI has the desktop's keyboard shortcuts wherever a browser allows them, plus volume and seek-step controls and two autoplay modes, and the desktop's loudness normalization is built or declined.
- **Scope**:
  - Ships in v0.15.0, after the WebUI stats panel milestone. Depends on: WebUI Responsive Layout and Panels, WebUI Settings Panel, and WebUI Stats Panel, so every panel tab exists.
  - Measured again at promotion: the WebUI handles only Escape, which closes overlays, and Enter or Space on a focused library tile. It has a mute button and no volume control. The desktop binds K play or pause, J and L seek, Left and Right previous and next, R random, F favorite, B blacklist, A autoplay, M mute, comma and period volume, T tags, P player view, S settings, O import folder, Q quit, F11 fullscreen, and 1 to 5 to show or hide parts of the window; it also swallows 6 to 8 and Space, which do nothing.
  - Use the desktop keys. Keys the browser keeps (Ctrl+Q, Ctrl+O, and F11 for the browser's own fullscreen; inferred) are not bound, and Q quit and O import folder have no WebUI equivalent. Each panel tab has a shortcut: Library, Filter, Tags, Stats, and Settings. Which key opens each tab (the desktop's T for tags and S for settings, or the number keys it uses to show and hide parts of its window), and which key enters fullscreen, are decided here.
  - Shortcuts do nothing while focus is in a text field.
  - A shortcut reference in the Settings tab.
  - A volume control where the browser lets a page set volume (not on iOS, where it is read-only; inferred), with comma and period stepping by a volume step preference. The Settings tab offers the desktop's volume steps: 1, 2, or 5 percent.
  - J and L seek by a seek step preference in seconds. The Settings tab offers the desktop's seek steps: 1, 5, or 10 seconds, plus frame if frame stepping is built. Frame stepping, which the desktop offers through LibVLC, is only approximate in a browser (inferred); build or decline it here.
  - Autoplay gets two modes, replacing the desktop's separate Keep Playing, which plays a random item every N seconds until stopped (Playback → Keep Playing (Timer) and Set Interval):
    - Normal: photos advance after the timer and videos play to the end, as autoplay does today.
    - Timer: every item advances after the timer, including a video that has not finished. With loop on, a video shorter than the timer repeats until the timer advances. Pausing a video holds the timer.
    - With loop on in Normal mode, the current item repeats and autoplay waits, as today. Read from code at this edit: the WebUI's video end handler and photo timer both skip advancing while loop is on.
    - Both modes use one timer setting, today's photo duration, renamed to fit (for example "Advance after"). Its range widens from the WebUI's 1–300 seconds to the desktop's 1–3600, so a Keep Playing interval longer than five minutes still fits. The mode and the timer sit together in the Settings tab, and the player's autoplay button still turns autoplay on and off.
  - The autoplay mode, the timer, the volume, and the volume and seek steps survive a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.
  - Build or decline loudness normalization, moved here from the desktop parity feature list at promotion, since it is a player control: the desktop adjusts volume from the server's per-item loudness and the library baseline (`LoudnessNormalizationService`, off by default). The WebUI could apply a gain through the Web Audio API next to the volume control; behavior on iOS is not verified.
  - If loudness normalization is built, its settings go in the Settings tab, per device and with the desktop's ranges and defaults: on or off (off), maximum reduction (1–30 dB, 15), maximum boost (0–10 dB, 5), and the baseline, automatic or a manual target (−50 to −10 LUFS, −23). The automatic baseline uses the baseline loudness the server's library stats already report (read from code at this edit). Each setting survives a page refresh. If it is declined, these settings go with it.
  - Changes to user-facing UX need approval.
  - Add a Release Specific checklist item: "In Chrome, Firefox, and Safari on a desktop, every listed shortcut works in normal view, with a panel open, and in fullscreen, and does nothing while typing in a text field."
  - Not included: rebinding, which is Customizable Keyboard Shortcuts.
- **Acceptance criteria**:
  - Each bound shortcut does what the desktop's does.
  - Each panel tab's shortcut opens the panel on that tab.
  - Shortcuts are ignored while a text field has focus.
  - The volume control and seek step work, and the Settings tab offers the desktop's volume and seek step choices.
  - In Normal mode, photos advance after the timer and videos play to the end. In Timer mode, every item advances after the timer, including an unfinished video, and a paused video holds it.
  - With loop on in Timer mode, a video shorter than the timer repeats until the timer advances. With loop on in Normal mode, the current item repeats and does not advance.
  - The Settings tab shows the autoplay mode and the timer under its new name, the timer accepts 1 to 3600 seconds, and it starts from the photo duration stored before this milestone.
  - After a page refresh, the autoplay mode, the timer, the volume, and the volume and seek steps are each as they were.
  - The shortcut reference matches the bindings.
  - Loudness normalization is built or explicitly declined with a reason in this entry. If built, its settings are in the Settings tab with the desktop's ranges and defaults, and each survives a page refresh.
- **Verification evidence**:
  - Completion evidence must include keyboard tests per binding under `happy-dom`, autoplay tests for both modes with loop on and off and with a paused video, tests for a page refresh keeping each setting this milestone adds, tests for loudness normalization if built, `npm run verify`, and one quick spot check.

### M12l - Show in File Manager from the WebUI

- **Status**: ⏳ Planned
- **Goal**: A WebUI on the server machine opens the system file manager at the playing file, and elsewhere copies its path.
- **Scope**:
  - Ships in v0.15.0, after the WebUI keyboard shortcuts and player controls milestone. Depends on: Reverse Proxy and HTTPS Access, and WebUI Preact Migration.
  - It uses the single localhost check that Reverse Proxy and HTTPS Access adds.
  - The desktop's `OpenFileLocation` opens Explorer with the file selected on Windows and opens the folder with `xdg-open` on Linux. A browser cannot do this itself; the server can when the browser runs on the server machine, and the tray already launches programs (`AvaloniaTrayHostUi.cs`). Both checked against the code at promotion.
  - Contract slice: a route that takes an item id, never a path, accepted only from the server machine, meaning a direct connection from loopback or from the server's own address as the merged localhost helper decides, and a capability the WebUI reads to decide whether to offer the action. A request through a reverse proxy is not localhost, so the action is not offered there, even on the server machine.
  - Server slice: on Windows `explorer.exe /select,<path>`; on Linux the `org.freedesktop.FileManager1` `ShowItems` D-Bus call, which selects the file, falling back to `xdg-open` on its folder. Start processes with `ProcessStartInfo.ArgumentList` and no shell. A headless server with no desktop session reports the action as unavailable.
  - WebUI slice: a Show in File Manager action for the current file where the server offers it, and Copy Path everywhere else.
  - Add a Release Specific checklist item: "On the server machine at `http://localhost`, Show in File Manager opens the file manager at the playing file on Linux and Windows; from another device, Copy Path copies it."
- **Acceptance criteria**:
  - A direct request from loopback or from the server's own address opens the file manager with the file selected, or its folder where selection is not available.
  - Requests from other addresses, proxied requests, and unknown ids are refused, and a headless server reports the action as unavailable.
  - The WebUI shows the action only when the server offers it, and Copy Path otherwise.
  - No process is started through a shell.
- **Verification evidence**:
  - Completion evidence must include server tests for loopback, the server's own address, another LAN address, proxied, unknown-id, and headless requests with the launcher faked, contract tests, `npm run verify`, and one quick Linux spot check.

### M12m - WebUI Status Line Overhaul

- **Status**: ⏳ Planned
- **Goal**: The WebUI status line shows one stable message per situation.
- **Scope**:
  - Ships in v0.15.0, after the Show in File Manager from the WebUI milestone. Depends on: WebUI Responsive Layout and Panels, and Catalog Open and Backup Safety, whose 503 message the status line shows.
  - Moved here from v0.14.0 when the desktop was frozen. The desktop half and the shared fixture are dropped, and the status line moves with the panel layout.
  - Observed in the v0.13.0 manual regression pass: with the server stopped, the WebUI shows "library load failed: HTTP 503" only briefly before "SSE reconnecting...". The desktop alternates between "core runtime unavailable" and "core runtime is required to browse the library", and stays as it is. Not re-run at promotion, since it needs a running server; the v0.14.1 release notes still list the WebUI status line flipping between messages as a known issue.
  - Read from code at promotion: the WebUI's `fetchJson` throws `HTTP {status}` and drops the response body, so the server's library message in a 503 never reaches the status line.
  - Read from code when random picks got a timeout: the playing video's `playing` event sets the status to "Playing". On a connection where the video keeps buffering, that hides "Loading..." while a random pick waits and "No response from the server. Try again." after one times out. The precedence rule covers both.
  - Define one precedence rule for which message wins when several apply, so the status line never alternates.
  - Define the message for each event once: server stopped, API unavailable, the server running without a library (showing the server's message for each library state: newer, damaged, missing, or unreadable), version or capability mismatch, and refresh progress and results.
  - Add a Release Specific checklist item: "With the server stopped, unavailable, or mismatched, and during a refresh, the WebUI settles on one status message."
- **Acceptance criteria**:
  - With the server stopped, unavailable, or mismatched, the status line settles on one message and does not alternate.
  - With the server running without a library, the status line shows the server's message.
  - Refresh status reads the same during and after each refresh.
  - The precedence rule and the per-event messages are documented.
- **Verification evidence**:
  - Completion evidence must include WebUI tests of the precedence rule and the per-event messages, covering the server stopped, the API unavailable, a version or capability mismatch, and refresh progress and results, plus one quick spot check with the server stopped.

### M12n - Testing Suite Overhaul

- **Status**: ⏳ Planned
- **Goal**: The testing suite produces clear results that match the WebUI's connection and status handling.
- **Scope**:
  - Ships in v0.15.0, after the WebUI status line overhaul milestone. Depends on: WebUI Status Line Overhaul, Server Shutdown Fixes, and WebUI Admin Section.
  - The status line overhaul defines the messages these scenarios check, the shutdown fixes change how event streams close, and the suite runs from the admin section.
  - Moved here from v0.14.0 when the desktop was frozen; the desktop's expected messages are dropped.
  - The suite predates the current client connection and status handling and no longer produces clear results. Observed in the v0.13.0 manual regression pass: with the API unavailable, the WebUI shows "library load failed: HTTP 503" only briefly before settling on "SSE reconnecting...", and SSE disconnect behaves inconsistently and may need redesigning. Not re-run at promotion, since it needs a running server. The Operator testing suite still has five scenario flags: API version mismatch, capability mismatch, API unavailable, missing media, and SSE disconnect.
  - Redesign the scenarios against current WebUI behavior, define the expected WebUI message for each, and verify the WebUI's behavior as part of the suite.
  - Add a Release Specific checklist item: "Every testing suite scenario shows its expected WebUI message, and resetting it leaves the WebUI connected."
- **Acceptance criteria**:
  - Each scenario lists the expected WebUI message, and the WebUI shows it while the scenario is active.
  - SSE disconnect behaves the same way on every run.
  - Running and resetting each scenario leaves the WebUI connected and working.
- **Verification evidence**:
  - Completion evidence must include automated tests that each scenario sets and resets the server state it describes, and that SSE disconnect closes and reconnects the same way on repeated runs, plus one quick spot check of one scenario.

### M12o - Browser-Playable Filter

- **Status**: ⏳ Planned
- **Goal**: Browse and random play can be limited to files a browser can play, and a file the browser cannot play says so instead of "not found".
- **Scope**:
  - Ships in v0.15.0, after the testing suite overhaul milestone. Depends on: WebUI Preact Migration, and WebUI Status Line Overhaul, whose precedence rule the new message follows.
  - Accepted gap until playback sessions: browsers cannot play every format LibVLC plays on the desktop. Re-measured at promotion on a copy of the developer's catalog, by file extension: 17,423 videos, of which 16,611 are mp4, 533 mkv (3.1%), 225 avi, and 54 wmv. The codecs inside the files were not measured. Tested by the user: avi and wmv files from that library fail in the WebUI. mkv plays in Chrome and Firefox with common codecs but not in Safari or on iOS (inferred), and counts as browser-playable.
  - The server decides playability from one documented container profile, so browse, random play, and counts agree. The profile lists the playable video containers, starting with mp4, m4v, webm, and mkv; any other video container, including avi and wmv, is not browser-playable. Photos are always playable. Codec-level detection waits for the probe in Server Playback Decision Engine.
  - Contract slice: a browser-playable option in the filter state, applied by the server in the list query, its counts, and random selection. OpenAPI and generated WebUI types; it only adds a field.
  - WebUI slice: the option in the Filter tab's general filters and in presets, off by default so current behavior does not change. Turning it on by default needs approval.
  - Error message slice: when the browser cannot play a file, the WebUI's status line says "Video file not found." ("Photo file not found." for photos) whatever the cause, though the file exists (reported by the user). Read from code at promotion: both come from the media element's error handlers in `app.js`, which the Preact migration moves into the player component. Say that the format is not supported in this browser when that is the cause, and "not found" only when the file is missing.
  - Trap, inferred: a browser reports a missing file (a `404` from `/api/media`) and an unsupported format with the same `MEDIA_ERR_SRC_NOT_SUPPORTED` code, so the error code alone cannot tell them apart. Use the item's container against the profile, or ask the server whether the file exists.
  - Trap, inferred from how presets are saved: until Per-Preset Preset Writes, the desktop posts the whole preset list, and the frozen desktop does not know the new field, so a desktop preset save drops the option from every preset. Decide here whether the server keeps a stored option the desktop did not send, or documents the loss. Checked at promotion: the desktop still posts the whole list to `POST /api/presets`.
  - Preset equality is locked to `preset-filter-equality.json`, which the desktop tests also read (still the case at promotion). New cases for the option must pass there too, or go in a WebUI-only fixture until the desktop is removed.
  - Add a Release Specific checklist item: "With the browser-playable filter on, browse and random play show no avi or wmv files; with it off, playing one says its format is not supported in this browser, and a deleted file says not found."
- **Acceptance criteria**:
  - With the option on, the list query, its counts, and random selection exclude videos outside the profile; with it off, results are unchanged.
  - The option is saved in presets and compared in preset matching.
  - A file the browser cannot play shows a format-not-supported message, and a missing file shows not found.
  - The profile is documented in `docs/api.md`.
- **Verification evidence**:
  - Completion evidence must include server tests for the option in the list query, counts, and random selection, contract tests, WebUI tests for the option and both error messages, `dotnet test ReelRoulette.sln`, and `npm run verify`.

### M12p - WebUI Grid Rendering

- **Status**: ⏳ Planned
- **Goal**: The WebUI library grid updates only the rows and tiles that change, and dragging the scrollbar reaches any part of the results without loading every page before it.
- **Scope**:
  - Ships in v0.15.0, after the browser-playable filter milestone. Depends on: WebUI Responsive Layout and Panels, so it is built in the Preact Library tab, whose width changes whenever the side panel is resized.
  - Found by the efficiency and divergence report from code reading, and confirmed in the code at promotion: each change of visible rows replaces the rows' HTML through `innerHTML`, which recreates every tile image. Each patch and each appended page rebuilds the layout and virtualizer for every loaded item, so loading a window page by page costs time that grows with the square of its size.
  - Measured at promotion, in Node 24 on the development machine with the layout and virtualizer modules alone (no DOM): one full rebuild takes 0.5 ms for 10,000 items at 1,400 px wide and 1.2 ms at 390 px, and 2.7 to 7.8 ms for 49,000. Loading 10,000 items in 200-item pages spends 13 to 32 ms in total on rebuilds, and 49,000 spends 355 to 953 ms over 245 pages, about 1.5 to 4 ms per page. The growth is real but small. Replacing the rows' HTML, the likely cause of the iPad flicker below, was not measured.
  - Seen on an iPad with the WebUI installed as an app: the grid flickers dark each time it re-renders its visible rows while scrolling, about seven times for a screen-height drag in landscape with three to four rows on screen. Desktop browsers and Firefox on Android are fine. Each re-render rebuilds every visible row's HTML, including images that were already showing. Not re-measured at promotion, since it needs the device.
  - Keep row elements that stay visible, add and remove only the rows that enter or leave, and update a patched tile in place. Grid rows stop going through `innerHTML`; the Preact migration's library overlay keeps the grid controller's row HTML until this milestone.
  - Size the grid to the full result count with placeholder tiles, and load the page at the scroll position, so dragging the scrollbar far down works without scrolling through every page.
  - Trap, inferred from code: the row layout depends on each item's thumbnail aspect ratio, so placeholder tiles for items not loaded yet use fallback ratios, and rows can change when their page arrives and shift what is on screen.
  - Apart from placeholder tiles and loading the page at the scroll position, grid layout, scrolling, focus, and tile behavior stay as they are.
  - Not included: extending the layout for appended pages instead of rebuilding it, dropped at promotion because a rebuild measured a few milliseconds per page.
  - Add a Release Specific checklist item: "On an iPad with the WebUI installed as an app, scrolling the library grid a screen height in landscape shows no flicker."
- **Acceptance criteria**:
  - Scrolling keeps the image elements of rows that stay visible.
  - A favorite, blacklist, playback, or tag patch updates only the affected tile.
  - No grid row is rendered through `innerHTML`.
  - Layout results match the current layout for the same items and width.
  - Dragging the scrollbar far down loads the page at that position without loading the pages before it.
  - Scrolling the grid on an iPad with the WebUI installed as an app shows no flicker.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for row reuse, tile patching, and loading the page at a scrollbar position, before-and-after timings for rendering a large window in a browser, and `npm run verify`.

### M12q - WebUI Multi-Select and Bulk Actions

- **Status**: ⏳ Planned
- **Goal**: The WebUI selects several library items and applies the desktop's bulk actions to them, and clears playback stats for the whole library.
- **Scope**:
  - Ships in v0.15.0, after the WebUI grid rendering milestone. Depends on: Admin Source and Item Management, whose item removal route bulk removal uses, and WebUI Grid Rendering, which updates a tile in place, so selection marks are tile updates.
  - From the desktop-versus-web feature comparison and the desktop retirement report, checked against the code at promotion. Adding a feature changes user-facing UX and needs approval.
  - Multi-select and bulk actions: the desktop library grid selects several items (click, Ctrl+click, Shift+click) and acts on them from its context menu: add to or remove from favorites and the blacklist, add or remove tags, clear playback stats, and remove from library. The WebUI library plays one item per click and has no selection. How selection works on touch is decided here. Remove from library is an admin action.
  - Trap, read from code at promotion: `POST /api/favorite` and `POST /api/blacklist` take one item path each, and the desktop sends one request per selected item, while `POST /api/playback/clear-stats` takes a list of item paths and `POST /api/tag-editor/apply-item-tags` a list of item ids. Decide here whether bulk favorite and blacklist get a route that takes many ids, a contract change in its own slice, or send one request per item as the desktop does.
  - Tag edits on several items: the desktop `ItemTagsDialog` adds and removes tags across all selected items at once; the WebUI tag editor works on the current item only.
  - Clear playback stats for the whole library, which the desktop offers from its Playback menu through `POST /api/playback/clear-stats` (measured again at promotion: the WebUI never calls it). Whether it is an admin action is decided here.
  - Build or decline the desktop's filter summary line, which lists the active filters above its library panel, and whether the Library tab shows one. The WebUI library's summary today shows only how many items are showing out of how many.
  - Settled at promotion: Keep Playing and loudness normalization moved to WebUI Keyboard Shortcuts and Player Controls, where autoplay's Timer mode has since replaced Keep Playing. The FFmpeg log is declined: nothing has written to the desktop's FFmpeg log buffer since the server took over refresh (read from code), so its window is always empty. The desktop features a browser cannot offer are recorded in Desktop Client Removal.
- **Acceptance criteria**:
  - The WebUI selects several library items and applies favorite, blacklist, tag add and remove, clear stats, and, for admins, remove from library to all of them.
  - Tag edits apply across all selected items.
  - The whole library's playback stats can be cleared from the WebUI.
  - The filter summary line is built or explicitly declined with a reason in this entry.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for selection and each bulk action, and `npm run verify`.
  - Add a Release Specific checklist item: "In the WebUI on a desktop browser and a phone, select several items, apply each bulk action, and the tiles update."

### M12r - Desktop Retirement Notice

- **Status**: ⏳ Planned
- **Goal**: The last desktop build tells users the desktop app is retired and points them to the WebUI.
- **Scope**:
  - Ships in v0.15.0, last in the series. With the Enable Web UI switch that WebUI Admin Section removes, the only desktop changes outside bug fixes.
  - After Desktop Client Removal no desktop update is published, so installed desktops stay on their last version (inferred: the Velopack desktop feed stops getting releases). Later servers stop working with it, starting with the accounts release, which removes pairing.
  - On start, show a notice once per installed version: the desktop app is retired; use the WebUI. It offers the existing Open Web UI action. The wording needs approval. Checked at promotion: the desktop's Open Web UI menu item exists, and `release.yml` still packages the desktop.
  - Add a Release Specific checklist item: "After updating, the desktop shows the retirement notice once, and Open Web UI opens the WebUI."
- **Acceptance criteria**:
  - The notice appears on the first start of this version and not again after it is dismissed.
  - Open Web UI from the notice opens the WebUI in the browser.
- **Verification evidence**:
  - Completion evidence must include a headless desktop test that the notice shows once per version, `dotnet test ReelRoulette.sln`, and one quick spot check.

## Planned Milestones

### P1 - End-User README and Contributor Dev Documentation

- **Status**: ⏳ Planned
- **Goal**: Make `README.md` the non-technical guide for installing and running ReelRoulette on Windows and Linux, and keep contributor detail in `docs/dev-setup.md` with one complete command and script reference.
- **Scope**:
  - Unscheduled. Best done after the accounts release, which changes first-run setup and how clients connect.
  - `README.md` (end users and operators):
    - Installation and day-to-day use only, with a pointer to `docs/dev-setup.md` for building from source.
    - A table of contents after the introduction.
    - Install through the Velopack releases: the Windows per-user `Setup.exe` and the Linux AppImage, first launch, application menu registration on Linux, and in-app updates through the WebUI admin section.
    - Installing the WebUI as an app on phones and desktops over HTTPS.
    - Runtime prerequisites only (FFmpeg with `ffprobe`, FUSE 2 for the AppImage), with package commands for Debian/Ubuntu, Fedora, and Arch-based distributions (CachyOS as the Arch example).
    - A user manual covering playback, library browse, tags, presets, filters, WebUI access, the admin section and the recovery page, account setup and login, reverse proxy access, catalog transfer from the admin section, Launch Server on Startup, and tray versus headless behavior.
    - Troubleshooting: native dependencies, permissions, display and audio, missing tray, autostart conflicts.
    - Keep the Documentation Map and Third-Party Components sections.
  - `docs/dev-setup.md` (contributors):
    - Move any developer content out of the README.
    - All development prerequisites (.NET SDK, Node, PowerShell) with Debian/Ubuntu, Fedora, and Arch-based install commands.
    - A full list near the top of every `tools/scripts/*` entry point and recurring `dotnet` and `npm` command, with a short explanation each.
  - Bring `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, and the testing checklist in line with the README and dev-setup split.
- **Acceptance criteria**:
  - A non-developer can follow `README.md` alone to install and run the server on Windows and on each listed Linux family, and reach the WebUI and its admin section.
  - A contributor can rely on `docs/dev-setup.md` for setup, build, test, and release workflows, and its script list matches `tools/scripts/`.
  - No current-state doc names retired packaging (Inno Setup, portable archives, install scripts, `appimagetool`).
- **Verification evidence**:
  - Completion evidence must include a check that every script in `tools/scripts/` is listed in `docs/dev-setup.md`, and a search showing no retired packaging names in current-state docs.
  - A fresh-install walkthrough on Windows and one Linux distribution from the README alone is a Release Specific checklist item.

### P2a - Playback Session Contracts and Capability Surface

- **Status**: ⏳ Planned
- **Goal**: Establish contract-first playback-session APIs and capability signaling.
- **Scope**:
  - First milestone of the playback sessions release, planned for v0.19.0. Depends on: Per-User Source Permissions, so every stream session is checked against the user's sources from the start.
  - Keep each slice of this series independently verifiable and shippable, and keep thin-client boundaries while adding server-side playback decisions.
  - Define OpenAPI contracts for playback-session create and read and the stream URL.
  - Add playback-session and transcode capability markers to the capability list served by `/api/version` and `/api/capabilities`.
  - Regenerate the WebUI types.
- **Acceptance criteria**:
  - OpenAPI includes the playback-session surfaces and validates.
  - Generated WebUI types match OpenAPI.
  - The WebUI detects a server without playback sessions from the capability list.
- **Verification evidence**:
  - Completion evidence must include contract tests, `npm run verify:contracts`, and a capability check against a server without the feature.

### P2b - Server Playback Decision Engine

- **Status**: ⏳ Planned
- **Goal**: Make the server the only place that chooses direct, remux, or transcode playback.
- **Scope**:
  - Planned for v0.19.0.
  - Implement a playback-session decision service from media probe metadata and client capability hints.
  - Cache probe results by file path and modification time to avoid repeated `ffprobe` runs.
  - Decision output: playback mode (`direct`, `remux`, `transcode`), delivery type (`progressive` or `hls-fmp4`), and a reason for troubleshooting.
  - Log each decision through the structured log API (component, operation, mode, reason), without file names or paths.
- **Acceptance criteria**:
  - The server chooses `direct`, `remux`, or `transcode` for each session request, and the same inputs give the same decision.
  - Session responses include the delivery type and a reason.
  - Each decision appears in `last.log` as a structured entry without file names or paths.
- **Verification evidence**:
  - Completion evidence must include decision tests over a fixture of probe results and client hints, and probe-cache tests for unchanged and changed files.

### P2c - Media Token Lifetime and Direct-Stream Sessions

- **Status**: ⏳ Planned
- **Goal**: Direct-stream URLs are session tokens with a lifetime, and an expired or unknown token cannot stream anything.
- **Scope**:
  - Planned for v0.19.0.
  - Already in place: `POST /api/random` and `POST /api/play/{itemId}` issue a media token, and `GET /api/media/{idOrToken}` streams it with range requests.
  - Found by the repository audit: `ServerMediaTokenStore` has no expiry or eviction; every play adds a token that is never removed and stays valid until the server stops.
  - Give tokens a time to live and a size cap, tie them to the playback session, and clean expired sessions up.
  - `GET /api/media/{idOrToken}` also accepts a raw item id. The source access policy covers that path; decide here whether raw ids stay accepted once sessions exist.
- **Acceptance criteria**:
  - Direct-stream URLs are issued and validated through playback sessions.
  - An expired or unknown token returns the same not-found result, and expired sessions are removed.
  - The token store size stays bounded under repeated plays.
- **Verification evidence**:
  - Completion evidence must include token expiry, eviction, and size-cap tests, and a range-request test on a session URL.

### P2d - Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline)

- **Status**: ⏳ Planned
- **Goal**: Add compatibility streaming for unsupported formats and long-form playback.
- **Scope**:
  - Planned for v0.19.0.
  - Implement remux and transcode with ffmpeg.
  - Segmented streaming uses HLS with fMP4 segments as the single baseline profile.
  - Clean up ffmpeg workers and temporary segment and transcode files.
  - Once this lands, revisit the Browser-Playable Filter: files the server can remux or transcode play in every browser.
- **Acceptance criteria**:
  - With API playback, incompatible media is served through remux or transcode, with no client-side format workarounds.
  - Segmented streaming is HLS with fMP4 segments.
  - No ffmpeg process or segment or transcode file is left after a session expires or the server stops.
- **Verification evidence**:
  - Completion evidence must include remux and transcode tests on a small media fixture set and a cleanup test after session expiry and after shutdown.

### P2f - WebUI Playback Cutover and Format Resilience

- **Status**: ⏳ Planned
- **Goal**: WebUI playback starts through playback sessions and handles formats the browser cannot play.
- **Scope**:
  - Planned for v0.19.0.
  - Route WebUI playback start through the playback-session API.
  - Prefer direct playback when supported; fall back to the HLS fMP4 stream when needed.
  - Keep the WebUI's seamless loop on both progressive and HLS playback.
  - Check long-form buffering, seek, reconnect, and format edge cases.
- **Acceptance criteria**:
  - WebUI playback starts from server-issued playback sessions.
  - Formats the browser cannot play are handled by the server pipeline.
  - Movie-length playback works on the validation set.
  - Looping behaves the same on progressive and HLS playback.
- **Verification evidence**:
  - Completion evidence must include WebUI tests of session start and fallback, and `npm run verify`. The long-form validation set pass is a Release Specific checklist item.

### P2g - Resume Position and Session Continuity

- **Status**: ⏳ Planned
- **Goal**: The server remembers playback position for the WebUI on every device.
- **Scope**:
  - Planned for v0.19.0.
  - Add a server-owned resume-position contract and storage, with throttled writes and clear completion and reset rules.
  - Add resume-position query and clear APIs.
  - Add resume settings (on or off, threshold windows, retention) through server settings.
  - Loop iterations do not count as plays and do not create resume points.
  - Decide whether resume positions are per account.
  - Recover WebUI playback when the server restarts mid-video:
    - Observed: when the server restarts mid-video, the WebUI player does not recover, even when the server is back before the buffered part runs out.
    - Expected: the player notices the media error, waits for the server to come back, requests a fresh media link for the same item, and continues from the same position.
    - Media tokens are held only in memory, so a link issued before the restart returns not found afterward. The server cuts media downloads still in progress when it starts stopping, so the player's download fails as the stop begins rather than when a timeout runs out.
    - Requesting the fresh link must not count as a new play. `POST /api/play/{itemId}` records one today.
- **Acceptance criteria**:
  - Resume position survives reconnects and restarts through server state.
  - The WebUI resumes from the server's position on every device.
  - Clearing a resume position works and is visible on every device.
  - Resume settings are documented, stored, and enforced by the server.
  - After a server restart mid-video, the WebUI continues the same item from the same position without recording a new play.
- **Verification evidence**:
  - Completion evidence must include server tests for recording, clearing, and the loop rule, client tests for resume, and a WebUI test that a media error during a server restart fetches a fresh link and continues from the same position without recording a play.

### P2h - Playback Concurrency, Diagnostics, and Hardening

- **Status**: ⏳ Planned
- **Goal**: Keep the playback pipeline stable with several clients and make failures diagnosable from the admin section.
- **Scope**:
  - Last milestone of the playback sessions release, planned for v0.19.0.
  - Limit concurrent transcodes, with a queueing policy, as a server setting with a safe default. This takes over the transcode-concurrency part of the removed advanced runtime and cache controls backlog item; the rest of that item was overtaken when refresh stopped trimming thumbnails to a count or size limit.
  - Add admin section diagnostics for active sessions, mode decisions, and failure reasons.
  - Add Release Specific checklist items for the multi-client playback matrix on Linux and Windows.
- **Acceptance criteria**:
  - Multi-client playback stays stable when transcode capacity is limited.
  - The admin section shows enough to troubleshoot a playback failure.
  - After the server stops, no ffmpeg worker remains, and temporary playback and transcode folders are cleaned or expire.
- **Verification evidence**:
  - Completion evidence must include concurrency-limit and queueing tests and a shutdown cleanup test. The multi-client matrix is the Release Specific checklist item above.

### P4 - File Metadata Sync and Extended Metadata

- **Status**: ⏳ Planned
- **Goal**: Import tags and metadata from media files and write them back, through the server.
- **Scope**:
  - Unscheduled.
  - Needs a catalog schema change (schema version 3) for the extended metadata columns, with its own migration from schema version 2. No metadata library is referenced today.
  - Implement metadata sync in core and server services:
    - import tags from supported formats during import and refresh,
    - export tags and metadata to files on demand, with an optional auto-export policy,
    - an explicit, configurable merge policy.
  - Metadata sync settings through server settings: auto-import, auto-export, merge strategy, and write confirmation.
  - Extended metadata: genre, year, artist or creator, title, album or series, comment, rating.
  - Show metadata in library browse and filters, with batch metadata edit through the API.
  - Handle unsupported formats, read-only or locked files, and network paths, with result summaries and structured logs.
- **Acceptance criteria**:
  - Metadata import and export run only through server APIs.
  - The supported formats and field mappings are documented and tested.
  - The merge policy gives the same result for the same inputs.
  - Extended metadata is stored by the server and shown and edited in the WebUI.
  - Batch operations follow the conflict and error policy and report success and failure counts with reasons.
- **Verification evidence**:
  - Completion evidence must include schema migration tests, format mapping tests, and merge-policy tests.

### P5 - Customizable Keyboard Shortcuts

- **Status**: ⏳ Planned
- **Goal**: Let WebUI users rebind keyboard shortcuts on each device while keeping the defaults.
- **Scope**:
  - Unscheduled. Depends on: WebUI Keyboard Shortcuts and Player Controls, which adds the default bindings and the shortcut reference.
  - A shortcut editor in the WebUI Settings tab: list actions and bindings, capture keys with `Ctrl`, `Shift`, and `Alt`, detect conflicts, and reset one or all bindings.
  - Store bindings per device with the other WebUI preferences.
  - Resolve keys through a binding map instead of fixed checks.
  - Keys the browser keeps for itself cannot be bound.
- **Acceptance criteria**:
  - Rebound actions work and survive a reload on that device.
  - Conflicts cannot leave two actions on one binding.
  - Defaults can be restored.
  - Browser-reserved keys cannot be bound.
- **Verification evidence**:
  - Completion evidence must include binding-map, conflict, and reset tests, and `npm run verify`.

### P6 - Playback History and Analytics

- **Status**: ⏳ Planned
- **Goal**: Record playback history on the server and show analytics from it in the WebUI.
- **Scope**:
  - Unscheduled.
  - The catalog keeps only a play count and last-played time per item, so there is no history to chart yet. Start with a server-owned playback events table (catalog schema change) written when the server records a play, with a retention setting.
  - Server analytics queries over that history and library stats: plays per day, week, and month; top-played items; favorites ratio; duration, source, and time-of-day distributions; tag usage.
  - Date ranges (`7d`, `30d`, `90d`, `1y`, `all`) and optional grouping.
  - Charts and summary panels in the WebUI stats panel, a date-range selector, and image and CSV or JSON export.
  - The server computes analytics; clients only render.
  - Decide whether history is per account.
- **Acceptance criteria**:
  - Each recorded play adds a history row, and retention removes old rows.
  - Analytics come only from server APIs and match across devices for the same range.
  - Date ranges change the aggregates correctly.
  - Exports match the current query.
- **Verification evidence**:
  - Completion evidence must include schema migration tests, history write and retention tests, and aggregate tests per range.

### P9a - Photo Face Detection Baseline

- **Status**: ⏳ Planned
- **Goal**: Deliver reliable face detection for photos with practical UX and performance controls.
- **Scope**:
  - Unscheduled.
  - Establish the face-analysis baseline in core and server: detection jobs, stored results, and API queries for clients.
  - Clients display results and start server jobs; they do not detect locally.
  - This milestone is the first phase of the face-detection rollout, with video in the companion video-detection phase.
  - Choose a .NET-compatible detection stack (OpenCV, ML.NET, or other) for photos.
  - Import-time and on-demand scans.
  - Store bounding boxes, confidence, and a metadata version per item (catalog schema change).
  - Optional bounding box overlays in preview and face-aware filter entry points.
  - Off by default, run in the background, and reuse cached results with a clear invalidation rule.
- **Acceptance criteria**:
  - Face detection results are produced and owned by the server.
  - The WebUI reads face metadata through APIs.
  - Photo detection runs in the background and does not block playback or import.
  - Overlays and filters work for detected photo faces.
  - Performance impact is bounded and documented.
- **Verification evidence**:
  - Completion evidence must include detection job, storage, and query tests on a photo fixture set.

### P9b - Video Face Detection Expansion

- **Status**: ⏳ Planned
- **Goal**: Extend face detection to video with sampling suited to long media.
- **Scope**:
  - Unscheduled. This milestone is the second phase of the face-detection rollout and builds on the photo-detection phase.
  - Define frame sampling (interval, keyframe, or scene-aware).
  - Run detection as background jobs with queueing and concurrency limits.
  - Store timeline-aware results for video items.
  - Timeline overlays or markers and filter hooks matching photo behavior where practical.
  - Recognition or identity only after the detection baseline is stable, and only if separately approved.
- **Acceptance criteria**:
  - Video detection runs within its resource limits and does not disturb playback or transcodes.
  - Results come through server APIs in the same shape as photo results where possible.
  - Long media processing can resume and retry and is visible in the admin section.
- **Verification evidence**:
  - Completion evidence must include sampling, resume, and resource-limit tests.

### P10 - Ordinal Path Identity on Linux

- **Status**: ⏳ Planned
- **Goal**: On Linux, treat paths that differ only by case as different paths in folder import and in refresh, and keep the ignore-case path compare on Windows.
- **Scope**:
  - Unscheduled. Deferred past v0.14.0: Windows enumeration casing has not been measured, an ordinal compare there risks removing and re-adding items, and a v0.14.0 planning query of a real 48,938-item catalog found no case-only path collisions.
  - Folder import and refresh use ordinal path identity on Linux. Windows keeps the ignore-case compare.
  - A case-only rename on Linux rewrites the stored full path, relative path, and file name together. Two files that differ only by case stay two items.
  - Source roots have the same case problem: `/Media` and `/media` can be different directories on Linux and are still compared ignoring case.
  - Path identity is built into the catalog: source and item paths are matched on lowercase `root_path_fold`, `full_path_fold`, and `relative_path_fold` columns, and only those columns are indexed. Ordinal lookups on Linux need matching indexes on the stored paths, or fold columns that keep case on Linux, so this is a catalog schema change with its own migration.
  - This needs a Windows VM pass before the compare changes. Windows enumeration casing was not measured. An ordinal compare there may treat an operating-system casing difference as a removed file plus a new file.
- **Acceptance criteria**:
  - On Linux, importing a case-only rename of an existing file stores the new full path, relative path, and file name, and that full path exists.
  - On Linux, refresh of that rename reports the rename and stores the discovered path. Two files in one folder that differ only by case both remain in the catalog.
  - On Windows, a casing difference between the stored path and the enumerated path does not remove the item or add a second one.
  - Source-root casing is decided in the same change, including two directories that differ only by case on Linux.
  - Path lookups stay indexed after the change.
- **Verification evidence**:
  - Measured on Linux before this backlog item, for both v0.12.0 import and the current import: after `Clip.mp4` is renamed to `clip.mp4`, the stored full path stays `Clip.mp4` while the relative path and file name become `clip.mp4`. Refresh then reports 0 added, 0 removed, 0 renamed, and 0 moved. The thumbnail stage reports 1 missing source. An ignore-case set of a folder that contains both `clip.mp4` and `Clip.mp4` keeps one path; an ordinal set keeps both.
  - Completion evidence must include those Linux cases after the fix, schema migration tests, plus a Windows VM pass for the ignore-case compare.

### P25 - Per-Preset Preset Writes

- **Status**: ⏳ Planned
- **Goal**: Saving, renaming, reordering, or deleting a preset on one device changes only that preset on the server, so two devices editing presets do not overwrite each other.
- **Scope**:
  - Planned for v0.16.0, after the desktop is removed. Depends on: Desktop Client Removal, so only the WebUI moves to per-preset writes and the whole-list replace goes in the same change. Builds on the preset-equality fixture from Remove the Preset Match Route.
  - Found during v0.14.0 planning: the desktop and the WebUI both post the whole preset list to `POST /api/presets`, which replaces the server's preset catalog. The last writer wins, so a preset saved on one client can be lost when the other client saves its older list. This is the same client-held whole-catalog pattern as the tag sync routes removed in v0.13.0. With the WebUI as the only client, two devices still overwrite each other the same way.
  - Add per-preset write routes (save, rename, reorder, delete) and move the WebUI to them. Remove the whole-list replace.
  - Tag rename and delete keep updating presets on the server.
  - Contract change, crossing server, OpenAPI, generated WebUI types, and WebUI.
- **Acceptance criteria**:
  - A preset saved on one device while another device has its preset list open is still present after the other device saves a different preset.
  - Rename, reorder, and delete change only the named preset.
  - Every open WebUI shows the same preset list after any device changes it.
  - The WebUI never posts the whole preset list, and the whole-list replace route is gone.
- **Verification evidence**:
  - Completion evidence must include server tests for each write, a two-session test of concurrent saves, and `npm run verify`.

### P27a - Structured Log Schema, Writer, and Ingestion

- **Status**: ⏳ Planned
- **Goal**: `last.log` is JSON Lines written by one server writer, for server logs and ingested client logs alike, with correlation fields and deterministic rotation.
- **Scope**:
  - First milestone of the structured log foundation release, planned for v0.16.1. Depends on: Server Data Folder Override, whose folder helper resolves the log path.
  - Today `last.log` is free text: server code and `POST /api/logs/client` append bracketed lines through `ServerLogService`, which writes under one process-wide lock and turns line breaks into a literal `\n`; the server's `ILogger` output goes only to the console, client logs arrive through `POST /api/logs/client` as source, level, and message, and startup empties the file. Decide here whether startup still empties it once rotation exists.
  - Schema, one JSON object per line:
    - required on every entry: `ts`, `lvl`, `cat`, `svc`, `comp`, `op`, `msg`, and the writer-assigned `ingestReqId`,
    - `lvl` is one of lowercase `trace|debug|info|warn|error|fatal`,
    - `cat` is the entry's category, separate from `lvl` and `comp`, and one of:
      - `action`: user interactions, such as tag edits, preset changes, playback, favorite and blacklist changes, and settings changes,
      - `access`: pairing, control token, login, and permission outcomes,
      - `job`: refresh, scans, backups, and duplicate scans,
      - `lifecycle`: startup, shutdown, restart, updates, and the tray,
      - `connection`: event streams opening, closing, and resyncing,
      - `general`: everything else. The writer sets `general` when an entry does not give a `cat`,
    - `svc` is one of `server|webui`,
    - optional fields in canonical order: `evt`, `data`, `ingestReqId`, `clientOpId`, `traceId`, `spanId`, `clientId`, `sessionId`, `ver`, `build`, `clientTs`, `srcIp`, `userAgent`; `evt` sits right after `op` and `data` right after `msg`,
    - `evt` is optional, dot-delimited, lowercase, stable, and low-cardinality, used only when it adds something `op` does not,
    - `data` is bounded: safe primitives, short allowlisted strings, and small objects, with no arbitrary object dumps,
    - `ex` is accepted on input only and normalized into `data.error` (`type`, `code`, `messageSafe`, optional bounded stack fingerprint); it is never a top-level field.
    - example: `{"ts":"...","lvl":"info","cat":"general","svc":"webui","comp":"web.library","op":"UpdateLibraryPanel","evt":"web.library.panel.updated","msg":"Library panel updated.","data":{"totalCount":38833,"eligibleCount":163},"ingestReqId":"...","clientOpId":"...","traceId":"...","spanId":"...","clientId":"...","sessionId":"...","ver":"...","build":"...","clientTs":"...","srcIp":"...","userAgent":"..."}`
  - One writer for the server's `ILogger` pipeline (a logging provider) and for `POST /api/logs/client`. The hand-written appends go through it.
  - Minimum level: the writer drops entries below a configurable minimum level, set in the server's core settings and `info` by default, for server and client entries alike. A client entry below the minimum is accepted and not written.
  - Time and correlation:
    - `ts` is the server write time and decides order; `clientTs` is the client's event time, kept for context,
    - `clientOpId` is an optional client operation id, kept when provided,
    - request-scoped HTTP and event stream logs carry W3C `traceId` and `spanId` when trace context is active; background and client-local events may omit them,
    - `srcIp` and `userAgent` are added by the server, never by clients.
  - Strict ingestion at `POST /api/logs/client`: keep valid fields as sent without inferring `lvl`, `cat`, `comp`, or `op` from the message; reject missing required fields other than `cat`, invalid `lvl`, `cat`, or `svc`, invalid or oversized `data`, and unknown fields; return a `400` listing every error with `code`, `field` (dotted path such as `data.error.code`), and `reason`. JSON serialization also escapes the control characters other than line breaks that `ServerLogService` still writes as sent.
  - Rotation: rotate at 25 MB, keep the current file plus 10 uncompressed archives, enforce retention at startup before writing, and define what happens to a single oversized entry and to concurrent appends.
  - Human-readable rendering is a view over the fields (admin section, console), not what is stored.
  - Contract change for `POST /api/logs/client` in OpenAPI and the generated WebUI types.
  - Not included: moving the admin section's log view off its current route, which is Admin Log Viewer.
- **Acceptance criteria**:
  - Every `last.log` line is a JSON object with the required fields and canonical field order.
  - `lvl`, `cat`, and `svc` values are always from their fixed lists, and an entry written without a `cat` gets `general`.
  - Entries below the configured minimum level are not written, and with no setting the minimum is `info`.
  - Server `ILogger` logs and ingested client logs go through the same writer, and every persisted entry has a writer-assigned `ingestReqId`.
  - Client entries keep `clientTs`, `clientOpId`, and trace fields as sent, and `ts` is the write time.
  - Invalid client payloads get a `400` with every error listed and are not written.
  - A client message with line breaks or control characters cannot produce a second log line.
  - Rotation, retention, oversized entries, and concurrent appends behave as documented.
- **Verification evidence**:
  - Completion evidence must include schema and order tests, rejection tests for each invalid case, category default and minimum level tests, correlation and time-field tests, rotation and retention edge-case tests, `dotnet test ReelRoulette.sln`, and `npm run verify:contracts`.
  - Docs evidence must include the schema, ingestion contract, and rotation rules in `docs/api.md` and `docs/architecture.md`.

### P27b - Structured Log API and Privacy Rules

- **Status**: ⏳ Planned
- **Goal**: The WebUI logs through a typed structured API that requires explicit metadata and makes privacy-safe entries the only kind it can emit, and both the WebUI and server code can give each entry a category.
- **Scope**:
  - Last milestone of the structured log foundation release, planned for v0.16.1. Depends on: Structured Log Schema, Writer, and Ingestion.
  - Level-typed methods for the WebUI, each with explicit `comp` and `op`:
    - `LogTrace(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
    - `LogDebug(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
    - `LogInfo(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
    - `LogWarn(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
    - `LogError(comp, op, evt? = null, msg, data? = null, ex? = null, cat? = null, context? = null)`
    - `LogFatal(comp, op, evt? = null, msg, data? = null, ex? = null, cat? = null, context? = null)`
  - `lvl` comes from the method; there is no parsing of `comp` or `op` from the message.
  - Categories: each WebUI method takes an optional `cat` from the schema's category list, and server code can set an entry's `cat` when logging through `ILogger` (how, for example a logging scope or a structured property, is decided here). An entry logged without one is written as `general`, from the WebUI and the server alike.
  - `LogContext = { clientOpId?, traceId?, spanId?, clientId?, sessionId?, ver?, build?, clientTs? }`; `ingestReqId`, `srcIp`, and `userAgent` are never client-supplied.
  - Baseline `comp` names: server `api`, `auth`, `sse`, `playback`, `refresh.pipeline`, `storage`; WebUI `web.app`, `web.player`, `web.library`, `web.api`, `web.sse`.
  - Privacy by construction, enforced by the API rather than by rewriting entries afterwards:
    - `msg` and `data` never carry file names or paths, tag or category names, preset or source names, search text, tokens, cookies, PINs or other secrets, or raw media identifiers that reveal content. The one exception is the one-time first-run setup code from Admin First-Run Setup, which the server logs only while no account exists,
    - prefer fixed templates with counts, booleans, and durations, for example `"Saved preferences."` with `data: { wroteBackup: true }`, or `"API request failed."` with `data: { endpoint: "SetFavorite" }` and no URL,
    - `ex` on `LogError` and `LogFatal` becomes `data.error` with `type`, `code`, `messageSafe`, and an optional fingerprint; raw stack traces, local paths, and payload fragments are not emitted,
    - `data` is checked for size and shape before serialization.
  - Until WebUI Instrumentation, the WebUI status relay keeps working by emitting through the new API as `comp` `legacy`, `op` `unmigrated`, level `info`. This is the only inferred path, and that milestone removes it.
  - Not included: migrating WebUI call sites, which is WebUI Instrumentation.
- **Acceptance criteria**:
  - The WebUI has the level-typed API with explicit `comp` and `op`, optional `evt` and `cat`, and typed context.
  - A WebUI entry and a server `ILogger` entry logged with a category are written with that `cat`, and ones logged without one are written as `general`.
  - `ex` is always written as privacy-safe `data.error`, never as a top-level field.
  - Oversized or arbitrary `data` is rejected before it is written.
  - The legacy path is the only one that emits `comp` `legacy`, and it is documented as temporary.
  - The `comp` baseline and privacy rules are documented.
- **Verification evidence**:
  - Completion evidence must include API tests per level, `ex` normalization tests, context mapping tests, category tests for WebUI and server `ILogger` entries, negative tests that paths, names, and secrets in the shapes above are refused, `dotnet test ReelRoulette.sln`, and `npm run verify`.

### P27d - Server Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The server logs its meaningful decisions and failures as structured entries, not only transport events.
- **Scope**:
  - Planned for v0.18.0. Depends on: Structured Log Schema, Writer, and Ingestion.
  - Structured logs for: API handlers and login and session outcomes, event stream connect and disconnect, refresh pipeline stages and outcomes, catalog open, import, backup, and replace, and settings changes and their errors. Playback decisions are logged by the playback sessions release.
  - Favor state changes, decisions, degradations, and failures over repetitive noise.
  - Move the remaining hand-built server log lines to `ILogger` with structured fields.
- **Acceptance criteria**:
  - Each listed area emits structured entries with `comp`, `op`, and fitting levels.
  - Request-scoped entries carry trace fields when trace context is active, and every entry carries `ingestReqId`; `clientOpId` appears only when a client sent one.
  - Server entries contain no file names, paths, tag names, or secrets.
- **Verification evidence**:
  - Completion evidence must include a captured entry per listed area, correlation checks, and a scan of a captured `last.log` for paths, names, and secrets.

### P27e - WebUI Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The WebUI logs its key flows as structured entries instead of relaying status-line text.
- **Scope**:
  - Planned for v0.18.0. Depends on: Structured Log API and Privacy Rules, and WebUI Login Gate.
  - Today the WebUI logs mainly by relaying each status-line message as free text.
  - Structured logs for app startup and compatibility checks, login, event stream connect and retry, API request failures, and major user actions and error states.
  - Five flows with stable operation names: `BootstrapSession` (startup and compatibility gating), `LoginSession` (account tile, PIN, and session start), `SseLifecycle`, `RandomPickAndPlay`, and `MutateItemState` (favorite, blacklist, and tag-edit apply).
  - Remove the status-line relay and the `legacy` path in the WebUI, with a test that fails if string-only logging or message parsing comes back.
- **Acceptance criteria**:
  - The five flows emit structured entries, with trace linkage on request-scoped steps.
  - `MutateItemState` covers favorite, blacklist, and tag-edit apply.
  - No WebUI string-only logging or `legacy` entry remains.
  - WebUI entries contain no file names, paths, tag names, search text, or PINs.
- **Verification evidence**:
  - Completion evidence must include one captured entry per flow and `MutateItemState` case, the guard test, and `npm run verify`.

### P27f - Admin Log Viewer

- **Status**: ⏳ Planned
- **Goal**: The admin section can filter and page structured logs by field, text, and time without shell access.
- **Scope**:
  - Planned for v0.18.0. Depends on: Structured Log Schema, Writer, and Ingestion, and WebUI Admin Section.
  - Rename **Server Logs** to **Log Viewer** across the admin section, the recovery page, API, tests, and docs, and rename `GET /control/logs/server` to `GET /control/log-viewer` in one step. There is no alias period: the admin section and the recovery page are the route's only callers and ship in the same binary.
  - The route stays read-only; logs are still written directly to `last.log`.
  - Server-side filters: `svc`, `lvl`, `cat`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`, message text, and a time window. `lvl`, `cat`, and `svc` each take several values. Client-side filtering only refines results already fetched.
  - Level, category, and source filters in the view:
    - The level filter is a set of checkboxes, one per `lvl` value, instead of the free-text level box carried over from the Operator page, so several levels can be shown at once.
    - Next to it, a multi-select filter by category, one option per `cat` value.
    - A multi-select filter by source, one option per `svc` value (`server` and `webui`; the desktop client is gone by this release).
  - Newest first by `ts`, tie-broken by `ingestReqId` and then a stable row sequence, with a versioned cursor and defined `from` and `to` bounds, so paging never repeats or skips rows.
  - Read from the end of the file and across rotated archives instead of walking every line on each request (found by the repository audit: `ServerLogService.Read` walks the entire log on every request).
  - Admin section view: controls collapsed by default with active-filter chips, readable rows with expandable raw JSON, and auto-refresh that pauses while scrolled away from the newest rows, with a resume control.
- **Acceptance criteria**:
  - The admin section's Log Viewer filters by every listed field, text, and time window.
  - The level filter is one checkbox per level, not free text, and checking several levels shows entries of exactly those levels.
  - The category and source filters each select several values at once and show entries from exactly those categories or sources.
  - `/control/logs/server` is gone and `/control/log-viewer` is in OpenAPI and `docs/api.md`.
  - The same filters and cursor return the same rows, and paging never repeats or skips a row.
  - A request reads only as much of the log as its page needs.
  - Controls start collapsed and show active filters; rows expand to raw JSON; auto-refresh pauses and resumes as described.
- **Verification evidence**:
  - Completion evidence must include paging tests across page and archive boundaries, replay tests for identical filters, filter tests with several levels, categories, and sources, a read-cost test on a large log, admin section UI tests for the view, and `npm run verify`.

### P27g - Client Log Relay Reliability

- **Status**: ⏳ Planned
- **Goal**: Client log relay never blocks or interrupts user actions, and its retries are bounded and predictable.
- **Scope**:
  - Last milestone of the structured log migration release, planned for v0.18.0.
  - The WebUI relays asynchronously with bounded retries and a bounded queue; a failing log endpoint drops entries after the bound instead of slowing it.
  - Add Release Specific checklist items for a combined trace across the server and the WebUI for one end-to-end flow, and for a simulated log endpoint failure during normal use.
- **Acceptance criteria**:
  - A failing or slow `POST /api/logs/client` does not delay or interrupt any user action in the WebUI.
  - Retry and drop behavior matches its documented bounds.
  - `last.log` holds server and WebUI entries through the same writer.
- **Verification evidence**:
  - Completion evidence must include relay tests with a failing and a slow endpoint in the WebUI, `dotnet test ReelRoulette.sln`, and `npm run verify`. The end-to-end trace and failure simulation are the Release Specific checklist items above.

### P28b - Source Access Policy

- **Status**: ⏳ Planned
- **Goal**: Every path that reads or serves library items asks one server-side source access policy, which allows everything until per-user permissions exist.
- **Scope**:
  - Planned for v0.17.0.
  - Today source enabled state is applied by separate SQL conditions in list query, random selection, and item play, and some paths skip it: `GET /api/media/{idOrToken}` streams any item by its raw id regardless of its source.
  - Add one policy that takes the request's session context and returns the sources it may see, and apply it on every item path: library list query, random selection, item play, `GET /api/media/{idOrToken}` (tokens and raw ids), `GET /api/thumbnail/{itemId}`, `POST /api/library/item`, `POST /api/library-states`, the tag-editor model, auto-tag and duplicate scans, library stats, and `GET /api/sources`.
  - The default policy allows every enabled source, so behavior does not change, except that a raw item id of a disabled source no longer streams.
  - No accounts or permission UI yet.
  - Not included: per-user grants, which is Per-User Source Permissions.
- **Acceptance criteria**:
  - Every listed path goes through the policy, and a test policy that denies a source hides that source's items on every one of them.
  - Current behavior is unchanged with the default policy, except that disabled-source items no longer stream by raw id.
  - Docs separate implemented source state from future per-user access.
- **Verification evidence**:
  - Completion evidence must include a denying-policy test per listed path, a raw-id media test for a disabled source, and `dotnet test ReelRoulette.sln`.

### P28c - Account Store

- **Status**: ⏳ Planned
- **Goal**: Accounts live in their own server store, separate from the library catalog.
- **Scope**:
  - Planned for v0.17.0.
  - Accounts are not stored in `library.db`. Catalog export, import, and backups copy or replace that whole file, so accounts there would ship PIN hashes inside every export and be replaced by every import.
  - Store accounts in their own SQLite database in the server data folder (for example `accounts.db`), resolved through the server data folder helper.
  - What catalog transfer does with accounts:
    - catalog export and the catalog checkpoint do not contain accounts,
    - catalog import replaces the catalog and leaves accounts as they are,
    - catalog backups do not contain accounts; the account store keeps its own backup copies on the catalog backup schedule, in separate files that a catalog restore does not touch.
  - Account records: stable id, name, level (admin or user), and a bcrypt or Argon2 PIN hash. No custom, fast, or reversible PIN storage. Multiple admins are allowed.
  - No default account is seeded. A store with no accounts is the first-run setup state, handled by Admin First-Run Setup.
  - Per-account, per-device failed attempts, with a one-hour lockout after 10 failures.
  - There is no guest account. Localhost connections are trusted as admin without an account session (see PIN Login API and Sessions).
  - Source permissions will reference account ids here and source ids in the catalog, so the schema keeps account identity stable across name and PIN changes.
- **Acceptance criteria**:
  - Accounts persist in their own store with stable id, name, level, and a bcrypt or Argon2 hash, and no plaintext PIN.
  - A new store has no accounts, and no default account or PIN exists.
  - Catalog export contains no account data, catalog import leaves accounts unchanged, and catalog backups contain no account data.
  - The account store has its own backups, and a catalog restore does not touch them.
  - Failed attempts are tracked per account and device, with a deterministic lockout end.
- **Verification evidence**:
  - Completion evidence must include store tests for creation, an empty new store, hashing, levels, lockout, and backups, and tests that a catalog export, import, and backup neither contain nor change accounts.
  - Docs evidence must describe account storage, backups, and the empty first-run state without describing login flows as implemented.

### P28d - PIN Login API and Sessions

- **Status**: ⏳ Planned
- **Goal**: LAN and remote clients log in with an account PIN and get a session; localhost stays trusted.
- **Scope**:
  - Planned for v0.17.0. Depends on: Account Store, and Reverse Proxy and HTTPS Access.
  - Add a login route: the client sends account id, device id, and PIN, and gets a per-client session token on success.
  - Sessions are not persisted; clients log in again after a restart.
  - Enforce lockout on the server and return lockout state and remaining time.
  - Define logout, session invalidation, and how account identity reaches HTTP and event stream handlers.
  - Localhost trust: a direct localhost connection is trusted as admin and needs no PIN. A request through a reverse proxy is not localhost.
  - There is no general auth-off mode once accounts exist: the API `AuthMode` `Off` setting and running without a shared token no longer open the API to LAN clients.
  - Remove pairing and the shared pairing token, with no migration; old pairing cookies and tokens fail. Remove query-string tokens (found by the repository audit: `AllowLegacyTokenAuth` defaults to `true`, accepting tokens via query string).
  - Compare session tokens in constant time (found by the repository audit: non-constant-time comparison of secrets).
- **Acceptance criteria**:
  - A correct PIN returns a session tied to the account, client, and device.
  - Failed PINs count per account and device, lock out for one hour after 10 failures, and return lockout details.
  - Sessions do not survive a server restart.
  - Direct localhost requests work without a session; LAN, remote, and proxied requests need one.
  - No setting turns authentication off for LAN or remote clients.
  - Pairing, the shared pairing token, and query-string tokens are no longer accepted.
- **Verification evidence**:
  - Completion evidence must include server tests for login, wrong PIN, lockout and its expiry, logout, restart, localhost and proxied requests, and rejection of old pairing tokens.
  - Contract evidence must include OpenAPI and `docs/api.md` for the login and session payloads and the lockout error.

### P28e - Auth Cutover for API and Admin

- **Status**: ⏳ Planned
- **Goal**: Every API route, the event stream, the admin section, and the recovery page require an account session from LAN and remote clients, and the separate control token is gone.
- **Scope**:
  - Planned for v0.17.0. Depends on: PIN Login API and Sessions.
  - Require a session on every API and control route and on the event stream for non-localhost requests.
  - The WebUI's files and `/runtime-config.json` stay open without a session, as Reverse Proxy and HTTPS Access left them, so WebUI Login Gate can load before login.
  - The admin section and the recovery page use admin account sessions and no longer accept the control token added in v0.14.0. Remove the control token, its setting, and its prompt, including the `adminAuthMode` field on `/control/settings` and in `core-settings.json`. v0.14.0 kept that field read-only (always `TokenRequired`, posted values ignored) so the contract changes only once.
  - No session or token is accepted as a query parameter. Found while adding the control token: `/api` routes still accept the API pairing token as a `token` query, and `GET /api/pair?token=` pairs with it, which puts the token in URLs and in the default request log. v0.14.0 stopped accepting the control token in a query and made `/control/pair` POST-only, but left `/api` for this cutover.
  - `GET` and `POST /api/web-runtime/settings` become admin-only. Found while adding the control token: the route is on the API plane, so any LAN caller with the API pairing token, which `/runtime-config.json` hands to every browser, can turn WebUI auth off, change the port or remote connections, and read the shared token. The desktop called it from other machines, so v0.14.0 did not move it behind the control token; the desktop is gone by this release.
  - Admin-only operations (control plane, source and item management, catalog transfer, account administration, testing routes) reject user-level accounts. Testing routes use the same check as the rest of the control plane (found by the repository audit: `OperatorTestingService` mutations protected only by middleware policy).
  - Settings reads no longer return secrets (found by the repository audit: auth and secret fields in DTOs encourage credential leakage; `GET /control/settings` returns the admin token today).
  - Remove pairing and control-token flows from clients, docs, and contracts. Found by the repository audit, these go with them:
    - Two pairing secrets that drift apart: `/api/pair` checks `ServerRuntimeOptions.PairingToken`, while the Operator page, and later the admin section, saves `WebRuntimeSettings.SharedToken`, and `src/core/ReelRoulette.ServerApp/Program.cs` starts with `SharedToken ?? PairingToken` and passes that to a restarted server. Editing the shared token has no effect until a restart, then silently changes the pairing token.
    - `WebRuntimeSettings.AuthMode` is saved by `CoreSettingsService.UpdateWebRuntimeSettings` but `ServerPairingAuthMiddleware` reads only `RequireAuth`, which the server sets from `AuthMode` only at startup, so setting it to `Off` changes nothing until a restart.
    - `RestartCoordinator.TryLaunchReplacementProcess` in `Program.cs` passes the token to the child as the `CoreServer__PairingToken` environment variable, which other local users can read from `/proc/<pid>/environ` on Linux. Session secrets that replace it must not be passed this way.
    - The WebUI ships `"pairToken": "reelroulette-dev-token"` in `public/runtime-config.json`, which any browser can fetch, and `src/config/runtimeConfig.ts` parses `pairToken` as a config field. Remove both and the example in the WebUI `README.md`.
    - The same `reelroulette-dev-token` default is in `src/core/ReelRoulette.ServerApp/appsettings.json` and the `-PairingToken` parameter of `tools/scripts/run-server.ps1` and `run-server-rebuild.ps1`.
    - `src/auth/authBootstrap.ts` lets errors from `pairWithToken` and `getVersionJson` throw instead of returning the `{ authorized: false, message }` result it uses elsewhere. The login flow that replaces it returns a typed result on every failure.
  - Not included: external programmatic API access.
- **Acceptance criteria**:
  - LAN and remote requests without a valid session get a deterministic auth error on every API and control route and on the event stream.
  - The admin section and the recovery page use account sessions, and no control token is accepted anywhere.
  - User-level accounts are refused on admin-only operations.
  - LAN and remote requests to web runtime settings without an admin session are refused.
  - No settings response contains a secret.
  - Active docs no longer describe pairing or control tokens.
- **Verification evidence**:
  - Completion evidence must include authorization tests across library, playback, source, event stream, admin, and testing routes for localhost, admin, user, and no session.

### P28f - Admin First-Run Setup

- **Status**: ⏳ Planned
- **Goal**: The first admin account is created in the admin section, from localhost directly or from another machine with a one-time setup code, before any LAN or remote client can log in.
- **Scope**:
  - Planned for v0.17.0. Depends on: Auth Cutover for API and Admin.
  - There is no default account and no default PIN. First-run setup state is an account store with no accounts.
  - In that state, the server generates a random one-time setup code from a cryptographic random source on start, writes it to the server log, and shows it in the admin section opened on localhost. Each start without accounts makes a new code, and the previous one stops working.
  - The setup code is the only secret the server writes to its log, and only while no account exists. The structured log privacy rules carry it as their one documented exception.
  - From localhost, the admin section opens straight into setup and needs no code. From another machine, the admin section shows only a setup code prompt, and only the setup route accepts LAN or remote requests until setup finishes.
  - Setup creates the first admin account with a name and a PIN.
  - The code stops working as soon as the first admin account exists, and the server no longer generates or logs one.
  - Failed code attempts count per device with the same one-hour lockout after 10 failures as PIN login, the code is compared in constant time, and it never appears in a URL.
  - WebUI login from LAN or remote devices is blocked until setup is done, with a message pointing to setup in the admin section. Localhost keeps working.
  - Add a Release Specific checklist item: "On a fresh install, LAN login is blocked until the first admin is created: from localhost without a code, and from another machine only with the setup code from the server log; the code is refused afterwards."
- **Acceptance criteria**:
  - Setup state is detected from the account store and ends when the first admin account exists.
  - On start with no accounts, a new setup code is written to the server log and shown in the admin section on localhost, and the previous code is refused.
  - Localhost setup needs no code. Setup from another machine needs the current code, and wrong codes lock that device out after 10 failures.
  - Once the first admin exists, the code is refused and no new code is generated or logged.
  - LAN and remote WebUI logins report setup-incomplete and are refused until setup finishes.
- **Verification evidence**:
  - Completion evidence must include server tests for code generation, logging, replacement on restart, constant-time comparison, lockout, refusal after the first admin exists, and setup-only access before setup, plus admin section UI tests for setup from localhost and from another machine with the code.

### P28g - Account Administration

- **Status**: ⏳ Planned
- **Goal**: Admins create and maintain accounts in the admin section.
- **Scope**:
  - Planned for v0.17.0. Depends on: Admin First-Run Setup.
  - An admin-only Access Control section: list accounts with name and level, add accounts with name, level, and initial PIN, edit name and level, reset a PIN, and remove accounts.
  - The last admin cannot be removed or demoted.
  - Admins change their own name and PIN through the same self-service flow as users.
- **Acceptance criteria**:
  - Admins can list, add, edit, reset PINs for, and remove accounts.
  - User-level accounts cannot reach account administration.
  - The last admin cannot be deleted or demoted.
  - Changes persist across restart and apply to later logins.
- **Verification evidence**:
  - Completion evidence must include server tests for account changes, last-admin protection, level changes, and PIN resets, and admin section UI tests for the section and its errors.

### P28h - Self-Service PIN Change

- **Status**: ⏳ Planned
- **Goal**: Logged-in users change their own PIN from the WebUI.
- **Scope**:
  - Planned for v0.17.0. Depends on: Account Administration.
  - A PIN change route that needs the old PIN, the new PIN, and a confirmation.
  - The flow in the WebUI Settings tab for admins and users.
  - Reuse server hashing, validation, and lockout, and never return a PIN.
  - Define what happens to the current session after a change.
  - Not included: profile editing beyond name and PIN.
- **Acceptance criteria**:
  - Admins and users can change their own PIN with the old PIN, a new PIN, and a matching confirmation.
  - Wrong old PIN, mismatched confirmation, invalid new PIN, and lockout return clear errors.
  - The next login needs the new PIN.
  - The flow is available in the WebUI without admin rights.
- **Verification evidence**:
  - Completion evidence must include server tests for each success and failure path and client tests for the validation messages.

### P28j - WebUI Login Gate

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for a PIN before any library or player surface when it is not opened from the server machine.
- **Scope**:
  - Planned for v0.17.0. Depends on: Self-Service PIN Change.
  - Opened from localhost, the WebUI is trusted and shows no login.
  - Otherwise, show an account tile grid before the shell, library, player, or random controls: `admin_panel_settings` for admins and `account_circle` for users, names below, and a PIN prompt on selecting a tile. Server-unavailable messages offer a retry.
  - PIN prompt, setup-incomplete message, and no persisted session: log in on every open or reload.
  - API and event stream calls carry the session after login.
  - Add a Release Specific checklist item: "The WebUI from another device needs a PIN on every open and reload, on desktop and phone browsers; from the server machine it does not."
  - Not included: offline PWA login, remember-me sessions, remembered accounts, and biometrics.
- **Acceptance criteria**:
  - From another device, no library, random, or player surface is reachable before login; from localhost, no login is shown.
  - Tiles use the required icons and names at desktop and mobile widths.
  - Failed PINs and lockouts show clear errors, including the remaining lockout time.
  - Reloading or reopening needs a new login.
  - API and event stream traffic uses the logged-in session.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for gating, login, setup incomplete, wrong PIN, lockout, session use, and reload, and `npm run verify`.

### P28k - Per-User Source Permissions

- **Status**: ⏳ Planned
- **Goal**: Admins choose which sources each user sees, and the source access policy enforces it.
- **Scope**:
  - Planned for v0.17.0. Depends on: Source Access Policy, Account Administration, and Admin Source and Item Management.
  - Per-source, per-user access in the admin section's Manage Sources.
  - Grants are stored in the account store against account ids and catalog source ids. A grant for a source id that is not in the catalog (for example after a catalog import) is ignored and shown as stale in the admin section.
  - Enforce denied sources through the source access policy on every path it covers, including `GET /api/media/{idOrToken}`, `GET /api/thumbnail/{itemId}`, and `POST /api/play/{itemId}`.
  - Admins and localhost connections see every source.
  - Not included: groups, invitations, and audit reporting.
- **Acceptance criteria**:
  - Admins can grant or deny each user each source in the admin section.
  - Denied sources and their items are invisible to that user on every policy path.
  - A denied item cannot be streamed, played, or have its thumbnail read, even by a client that knows its id.
  - Permission changes reach active sessions through events or requery.
  - Grants survive account and source renames, and a catalog import leaves grants for missing sources inert.
- **Verification evidence**:
  - Completion evidence must include policy tests for every path with a denied source, direct-id bypass tests, a catalog-import test for stale grants, and admin section UI tests for permission editing.

### P28l - Permission-Aware WebUI

- **Status**: ⏳ Planned
- **Goal**: The WebUI shows only what the server allows the logged-in user, with clear empty and denied states.
- **Scope**:
  - Last milestone of the accounts release, planned for v0.17.0. Depends on: Per-User Source Permissions.
  - WebUI source lists, library browse, random playback, and item playback rely only on what the server returns for the session.
  - The header's admin icon, always visible before accounts, shows only to admins, including localhost, which is trusted as admin. The admin section is reachable only by them.
  - Messages for a user with no visible sources and for an item that becomes inaccessible.
  - Update docs and the testing checklist for per-user source visibility.
  - Add a Release Specific checklist item: "An admin and a user account in the WebUI on two devices see only their allowed sources, and a permission change in the admin section reaches both without a reload."
  - Not included: client requests for source access, approval workflows, and external sharing.
- **Acceptance criteria**:
  - The WebUI never shows denied sources or plays denied items.
  - Permission changes made in the admin section reach open WebUI sessions through events or requery.
  - Client filtering cannot widen what the server returns.
  - Users without admin rights do not see the admin icon and cannot open the admin section.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for hidden sources, inaccessible items, and the admin icon's and admin section's visibility.

---

### P33 - Catalog Corruption Detection Off the Startup Path

- **Status**: ⏳ Planned
- **Goal**: Detect a corrupt `library.db` anywhere in the file without adding to startup time.
- **Scope**:
  - Unscheduled.
  - Startup reads only the schema and the catalog's `revision` row, so corruption confined to item, tag, or preset pages passes the open and surfaces at the first query that reads those pages. A full check on every open reads the whole file and slows startup on large catalogs.
  - Candidate: run a full integrity check when a catalog backup is made, and on failure keep the last good backup, log it, and report it on the admin section's status. Decide whether a failed check also refuses the next startup; if it does, the server runs without a library as it does for a damaged catalog (Catalog Open and Backup Safety).
  - Startup keeps its revision-row read.
- **Acceptance criteria**:
  - A catalog with corrupt item pages is reported without opening it in full at startup.
  - Startup time does not grow with catalog size because of the check.
  - A corrupt catalog is not written over the last good backup.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include a corrupt-item-page test and a startup timing comparison on a large catalog.

---

### P35 - Server Robustness Findings

- **Status**: ⏳ Planned
- **Goal**: Close the server and Core robustness findings that no other milestone owns, so bad input, partial requests, and crashes cannot lose settings or grow memory without bound.
- **Scope**:
  - Unscheduled. Found by the repository audit and the settings persistence investigation, and checked against the code when they were moved here. Each line names the file, the problem, and the fix; split this item if it grows past one milestone.
  - Settings:
    - Partial settings POSTs reset omitted fields: `CoreSettingsService.UpdateRefreshSettings`, `UpdateBackupSettings`, and `UpdateWebRuntimeSettings` assign every field from the posted snapshot, and the contract fields are not nullable, so a POST that leaves out a field writes its default (for example `fingerprintScanMaxDegreeOfParallelism` back to 4). Make those request fields nullable, with an omitted field left unchanged as `devChannelEnabled` already is, and add tests that a partial POST leaves the other fields and the other three sections unchanged on disk. This is an OpenAPI contract change.
    - Non-atomic settings write: `CoreSettingsService.PersistSettings` writes `core-settings.json` in place with `File.WriteAllText`, so a crash mid-write leaves it truncated. Write a temporary file in the same folder and rename it over the original.
    - Silent settings load failure: `CoreSettingsService.LoadSettings` ends in an empty `catch` and falls back to defaults, so an unreadable or corrupt `core-settings.json` looks like a fresh install and the next persist overwrites it. Log a warning, move the unreadable file aside before anything is written, and report it on the admin section's status.
    - Corrupt JSON replaced by defaults: `JsonFileStorageService.Load` (used for `desktop-settings.json`) returns the default object on any read or parse error, and the next `Save` overwrites the file. Tell a missing file from an unreadable one, and move an unreadable file aside before returning defaults.
    - Non-atomic save fallback: when `File.Replace` throws, `JsonFileStorageService.Save` falls back to `File.Copy` over the original and then `File.Delete`, which can leave a truncated file after a crash. Use `File.Move(temp, path, overwrite: true)` as the fallback.
    - The two `JsonFileStorageService` findings above affect only the desktop's `desktop-settings.json`: no server or ServerApp code references the class (measured with `git grep`). Desktop Client Removal deletes the class if it is still unused, which closes them.
  - Paths and processes:
    - Thumbnail path from an unchecked id: `RefreshPipelineService.GetThumbnailPath` builds `Path.Combine(_thumbnailDir, $"{itemId}.jpg")` from the catalog item id, and an imported `library.db` can hold any id, including `..` segments, so a thumbnail write or delete could land outside the thumbnail folder. Accept only the id format the server generates and check that the full path stays under the thumbnail folder.
    - Unread process output: `RefreshPipelineService.VerifyFfmpegAsync` redirects ffmpeg's standard output and error, reads neither, and waits for exit; enough output would fill a pipe and hang the check. Read both streams or stop redirecting them. The other ffmpeg and ffprobe calls already read stderr.
    - Shell launch: on Linux, `RestartCoordinator.TryLaunchReplacementProcess` in `src/core/ReelRoulette.ServerApp/Program.cs` builds one `/bin/bash -lc` script with the process path, assembly path, host, and port interpolated, so a path containing `"` or `\` breaks it. Wait for the port in managed code and start the process with `ProcessStartInfo.ArgumentList`, with no shell.
    - Stuck restart flag: `RestartCoordinator.TryRestartAsync` and `TryStopAsync` set `_restartInProgress` and clear it only when the request is not accepted. If the scheduled stop fails or the process does not exit, every later restart or stop answers "already in progress". Clear the flag when the scheduled stop fails, or track Idle, Pending, Stopping, and Failed states.
    - Autostart entry quoting: `LinuxXdgStartupLaunchService.BuildDesktopEntryContent` writes `Exec="<path>"` without escaping, while the Desktop Entry spec requires `"`, `` ` ``, `$`, and `\` inside a quoted argument to be backslash-escaped and `%` to be written `%%`. Escape the path to the spec.
    - Autostart status: `LinuxXdgStartupLaunchService.GetStatusAsync` reports enabled whenever the file lacks `Hidden=true`, ignoring `X-GNOME-Autostart-enabled=false` and a missing `Exec` target. Parse both keys and check that the `Exec` path exists.
    - Uncancellable hashing: `FileFingerprintService.ComputeFingerprint` hashes the whole file synchronously with no cancellation, and the refresh fingerprint stage calls it, so stopping the server during a large file waits for the hash to finish. Hash asynchronously with a `CancellationToken`.
  - Memory and selection:
    - Unbounded randomization state: `LibraryPlaybackService._clientRandomizationStates` keeps one shuffle state per client and session key and never removes any, and the ids come from requests. Cap the count, evict the least recently used, and limit id length.
    - Weak eligible-set signature: `RandomSelectionEngineCore.ComputeEligibleSignature` uses a 32-bit `HashCode` over the eligible item ids, so two different eligible sets can collide and reuse the wrong shuffle state. Compare the count plus a SHA-256 over the ids in order.
    - Telemetry reads: `ApiTelemetryService.GetIncoming` and `GetOutgoing` call `Reverse()` over the whole queue on every control status poll. Keep a ring buffer that reads newest first.
    - Session list under lock: `ServerSessionStore.GetActiveSessions` filters, sorts, and projects inside the session lock. Copy the records under the lock and sort outside it.
    - Dead write-back: `DynamicCorsOriginRegistry.RebuildAllowedOrigins` writes the rebuilt list back into the shared `ServerRuntimeOptions.CorsAllowedOrigins`, which nothing reads after the registry's constructor. Keep the list only in the registry.
  - Events:
    - Revision reuse after a restart: `ServerStateService` starts its revision counter at zero on every start. A client that reconnects after the restarted server has published past that client's last event ID, but no further than its replay history, gets a partial replay from the new server and no `resyncRequired`. Give each server start an instance id that clients send back with the last event ID, or start revisions from a value that cannot repeat, and send `resyncRequired` on a mismatch. This is a contract change.
  - Decision needed: the audio filter's handling of unscanned videos. `LibraryCatalogListQuery` matches **With audio** on `has_audio = 1` and **Without audio** on `has_audio = 0`, so a video whose audio has not been scanned (`has_audio` NULL) is hidden by both. Decide whether NULL counts as one of them or neither, then align `docs/api.md`, both clients' labels, and tests. This changes what users see, so it needs approval.
- **Acceptance criteria**:
  - A partial settings POST changes only the fields it names, in every section.
  - Killing the server during a settings write leaves the previous or the new file, never a truncated one.
  - An unreadable settings file is kept aside and reported, not overwritten with defaults.
  - A catalog item id that would resolve outside the thumbnail folder is refused.
  - No server process launch goes through a shell.
  - Randomization state stays within its cap under many client and session ids.
  - Each finding above is fixed or explicitly declined with a reason in this entry.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include a test per fixed finding, `dotnet test ReelRoulette.sln`, and `npm run verify` for the settings contract change.

---

### P36 - Client Robustness Findings

- **Status**: ⏳ Planned
- **Goal**: Close the WebUI and dev-script robustness findings that no other milestone owns.
- **Scope**:
  - Unscheduled. Found by the repository audit and the Linux dependency investigation, and checked against the code when they were moved here. Each line names the file, the problem, and the fix.
  - The desktop findings from the same audit (unbounded event payload, ambiguous API results, an undisposed cancellation source, timers after close, plain HTTP to another machine, and undetected black video on Fedora) were dropped, because the desktop is frozen to bug fixes. The startup error markup finding moved to WebUI Preact Migration.
  - WebUI:
    - Overlapping resyncs: `src/events/sseClient.ts` calls `void handleResyncRequired(...)` for every `resyncRequired` event, so several authoritative reloads can run at once and finish out of order. Keep one in flight and coalesce events that arrive meanwhile.
    - Unchecked JSON: `src/api/coreApi.ts` calls `response.json()` for pair, refresh status, version, and random responses without checking the content type or catching parse errors, so an HTML error page from a proxy surfaces as a `SyntaxError`. Read through one helper that checks the content type and reports a clear error.
    - Client and session ids: `src/api/coreApi.ts` keeps the client id in `localStorage` and the session id in `sessionStorage`, and `sseClient.ts` puts both in the event stream URL, where proxy access logs record them. They identify a randomization scope and are not credentials today. Once login sessions exist, decide whether the server derives them from the session instead, and keep them from ever becoming an auth secret.
    - Weak build check: `scripts/verify-build-output.mjs` only checks that `apiBaseUrl` in `dist/runtime-config.json` is a non-empty string, while `parseRuntimeConfig` rejects more. Validate with the same rules the app uses at runtime.
  - Dev scripts:
    - Missing install: `tools/scripts/run-server-rebuild.ps1` runs `npm run build` without installing packages, so a clean clone or a changed lockfile builds stale or fails. Run `npm ci` when `node_modules` is missing or older than `package-lock.json`, with a `-SkipInstall` switch.
- **Acceptance criteria**:
  - Overlapping resync events cause one reload at a time.
  - Each finding above is fixed or explicitly declined with a reason in this entry.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include a test per fixed finding and `npm run verify`.

---

### P48 - Desktop Client Removal

- **Status**: ⏳ Planned
- **Goal**: The desktop client, its packaging, and its tests are gone, and the WebUI is the only client.
- **Scope**:
  - First milestone of the desktop removal release, planned for v0.16.0. Depends on: WebUI Keyboard Shortcuts and Player Controls, WebUI Stats Panel, WebUI Settings Panel, Admin Refresh, Backup, and Duplicate Review, Show in File Manager from the WebUI, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Multi-Select and Bulk Actions, and Browser-Playable Filter.
  - Desktop features this drops without a WebUI equivalent, declined during the desktop parity work because a browser cannot offer them: always-on-top (the closest is picture-in-picture, which the WebUI turns off with `disablepictureinpicture`), desktop self-update, the Linux dependency dialog, application menu registration, and the FFmpeg log window, which has been empty since the server took over refresh.
  - Desktop Settings dialog entries this drops as not useful in the WebUI, decided when the WebUI's settings were planned: the desktop's own dev update channel (the server's is in the admin section), client settings backups (the WebUI's settings are a few values in browser storage), the core server base URL (the WebUI calls the server that served it), Force API playback (the WebUI always plays through `/api/media`), and image scaling (it limits how large the desktop decodes photos, and the browser scales photos to fit by itself).
  - Code and tests slice, measured: remove `ReelRoulette.DesktopApp`, `ReelRoulette.LibraryArchive`, and `ReelRoulette.DesktopApp.Tests` from the solution and the repository, about 30,300 lines of C# and AXAML including 3,267 test lines and 134 tests. Remove Core's `LibraryGridLayout` and its tests, which only the desktop uses, and `JsonFileStorageService` and `CoreStorageServices` if nothing else uses them.
  - Packaging slice: remove the `desktop` component from the `release.yml` matrix, including the Windows LibVLC relocation step, stop publishing the desktop update feed, and remove the desktop references in `set-release-version.ps1` and `verify-linux-packaged-server-smoke.sh`. CI has no desktop job: desktop tests run inside the solution test on the Ubuntu and Windows jobs, so `ci.yml` needs no change.
  - Contract slice: remove routes and fields that no remaining caller uses, each checked against the WebUI and the admin section. Remove the web runtime settings' `enabled` field, which the server has ignored and reported as on since WebUI Admin Section. Candidates: `/api/library-states`, `/api/library/item`, the full path kept in the random and play responses' `id` for the desktop, and `itemTagsChanged.itemIds` and the auto-tag apply response's `changedItemPaths`, which the WebUI no longer reads beside their item id fields. `/api/library/catalog-checkpoint` stays for the admin section's export. OpenAPI and generated WebUI types.
  - Fixture slice: `event-revision.json`, `library-tile-effect.json`, `preset-filter-equality.json`, and `sort-direction-labels.json` lose their C# readers and stay as WebUI test data. `tag-name-order.json` stays, read by Core and the WebUI.
  - Docs slice: `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, `docs/dev-setup.md`, `README.md` (desktop install and the LibVLC prerequisite), the testing checklist's desktop Smoke item and the desktop in-app update item in Release Flow, and `AGENTS.md`: remove the desktop freeze rule and the desktop test-isolation note, and keep the shared-fixture rule for rules implemented in server C# and the WebUI.
  - Add a Release Specific checklist item: "On Linux and Windows, the release publishes only the server, every former desktop workflow works in the WebUI, and an existing desktop install keeps its last version."
  - Not included: rewriting historical `CHANGELOG.md` sections and completed milestones, which keep their desktop references.
- **Acceptance criteria**:
  - The solution has no desktop projects, and `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.
  - A release builds and publishes only server packages and feeds.
  - OpenAPI has no route or field that only the desktop used, including the web runtime settings' `enabled` field.
  - No current-state doc describes the desktop client as current.
  - The four former desktop fixtures are read by WebUI tests.
- **Verification evidence**:
  - Completion evidence must include the build, test, and verify runs, `./tools/scripts/verify-linux-packaged-server-smoke.sh`, a dev-channel release run of `release.yml`, and a search of current-state docs for the desktop client.
