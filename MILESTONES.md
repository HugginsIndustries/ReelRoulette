# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. Each release becomes a new `M*` series when it is promoted.

The WebUI becomes the only client on every device. Until the desktop removal release, the desktop client gets no significant changes or new features: bug fixes (crashes, data loss, broken playback, security) and small changes that keep it working with the server, or that match a small server-side change, are allowed. Until then server contract changes only add fields, so the last desktop build keeps working. The native Android client is dropped.

- **v0.15.0 — WebUI overhaul**: Serve the WebUI over HTTPS so it installs as an app, move it to Preact, design the release's UI in one approved mockup, roll out the new logo and icons, give it a responsive layout with a side panel and phone overlays, and give it everything the desktop does: keyboard shortcuts and full keyboard navigation, stats, settings, an admin section that replaces the Operator page and manages refresh, backups, duplicates, sources, and catalog transfer, Show in File Manager, a browser-playable filter, and multi-select. The desktop still ships as a fallback, and its last build tells users it is retired. M12a, M12b, M12c, M12d, M12e, M12f, M12g, M12h, M12i, M12j, M12k, M12l, M12m, M12n, M12o, M12p, M12q, M12r, M12s, M12t, M12u, M12v.
- **v0.16.0 — Desktop removal**: Remove the desktop client, its packaging, and its tests, then move preset writes to per-preset routes. P48, P25.
- **v0.16.1 — Structured log foundation**: Write `last.log` as structured JSON Lines through one server writer and give the WebUI a typed, privacy-safe log API. P27a, P27b.
- **v0.17.0 — Accounts**: Require an account PIN from LAN and remote clients, with per-user source access. P28b, P28c, P28d, P28e, P28f, P28g, P28h, P28j, P28k, P28l.
- **v0.18.0 — Structured log migration and Log Viewer**: Move every server and WebUI log to the structured API and give the admin section a filterable Log Viewer. P27d, P27e, P27f, P27g.
- **v0.19.0 — Playback sessions**: Let the server choose direct, remux, or transcode playback per session for the WebUI. P2a, P2b, P2c, P2d, P2f, P2g, P2h.
- **Unscheduled backlog**: P1, P4, P5, P6, P9a, P9b, P10, P33, P35, P36, P49.

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

Last milestone completed: M12b

### M12c - WebUI Design Mockup

- **Status**: 🚧 In Progress
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
  - Settled with the mockup so far:
    - The panel is a full-screen overlay below 800 px of viewport width, or on a touch screen (coarse pointer) below 500 px of viewport height, which is a phone on its side. Otherwise it sits beside the player, on the right until the Settings tab lets each device choose.
    - Beside the player, the panel's width runs from 360 px to whatever leaves the player 400 px wide, and starts at 420 px. The 800 px breakpoint is those 360 px and 400 px plus the resize handle and the page's padding. These widths may still change with mockup testing.
    - Library tiles are smaller, beside the player and as the overlay: rows 100–240 px high, aiming for 160 px.
    - Each approved decision is recorded in the milestone that builds it: New Logo and Icons, Favorite and Blacklist Filter Modes, WebUI Responsive Layout and Panels, WebUI In-App Dialogs, WebUI Settings Panel, WebUI Admin Section, Admin Refresh, Backup, and Duplicate Review, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Keyboard Shortcuts and Player Controls, Browser-Playable Filter, WebUI Multi-Select and Bulk Actions, WebUI Keyboard Navigation and Focus, WebUI Stats Panel, WebUI Status Line Overhaul, Admin Log Viewer, Desktop Retirement Notice, and Desktop Client Removal. Loudness normalization is declined for v0.15.0 and has its own milestone, WebUI Loudness Normalization.
  - Proposed in the mockup and not approved yet:
    - The Settings tab's sections, and "Advance after" as the timer's name.
    - The volume slider at the end of the seek row.
    - Number keys 1 to 5 for the tabs, T and S as on the desktop, P to show or hide the panel, and the order in which Esc closes things.
    - The Stats tab with the current file first, its `bar_chart` icon, and Show in File Manager or Copy Path beside the file's path.
    - The browser-playable option's label and the format notice's wording.
    - The admin view's layout, the Edit Source dialog, the backup restore list, the import remap dialog, and duplicate review's layout.
    - The desktop retirement notice's wording.
    - With Hide player controls on Timeout: hidden controls can't be pressed, so the first tap or click only shows them; a key press counts as activity and shows them; and keyboard focus on them keeps them shown.
  - Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - Every visible v0.15.0 feature is in the mockup at phone and desktop widths, and the user has approved it.
  - Each decision approved in the mockup, including each UX question a later milestone left to be decided there, is recorded in the milestone that builds it.
  - The mockup's pages open without a network, and its check passes.
- **Verification evidence**:
  - Completion evidence must include `node docs/mockups/webui-panels/build/check.mjs` passing, the user's approval of each screen, and the milestones each decision was recorded in.
  - The mockup in `docs/mockups/webui-panels/` stays in place when this milestone completes.

### M12d - New Logo and Icons

- **Status**: ⏳ Planned
- **Goal**: The server and the WebUI carry the new logo and icons from `assets/logo/` everywhere they show the app's mark, while the desktop client keeps its old icons until it is removed.
- **Scope**:
  - Placed first after the mockup so the milestones after it build on the new marks instead of replacing old ones later: WebUI Responsive Layout and Panels reworks the header, WebUI Admin Section builds the recovery page and renames the tray item, and Desktop Retirement Notice shows the icon in its notice. It is small and independent, so dev releases carry the new icons for the rest of the series.
  - Ships in v0.15.0, right after the WebUI design mockup milestone. Depends on: WebUI Design Mockup, whose mockup approves the header's logo.
  - The files in `assets/logo/`, read from them at this edit: `logo-lockup.svg` (the icon with light text, for the dark theme) and `logo-lockup-dark.svg` (dark text, for the light theme); `logo-icon.svg` (the orange icon alone, on transparency); `logo-icon-tile.svg` (the icon on a rounded orange tile) and `logo-icon-maskable.svg` (on a full-bleed orange square); `app.ico` (16 to 256 px) and `favicon.ico` (16, 32, and 48 px); and in `png/`, the plain icon at 16 to 256 px (`icon-*.png`), the tile at 192 and 512 px (`pwa-*.png`), the maskable square at 192 and 512 px (`pwa-maskable-*.png`), and `apple-touch-icon.png` (180 px, full bleed).
  - WebUI slice. Its copies live in `src/clients/web/ReelRoulette.WebUI/public/`, which the WebUI build copies into its output and `tools/scripts/stage-webui-assets.ps1` stages into the server's web root:
    - The header shows `logo-lockup.svg` in the dark theme and `logo-lockup-dark.svg` in the light theme in place of the "ReelRoulette" text, and `logo-icon.svg` alone on a phone, with "ReelRoulette" as its accessible name (decided in WebUI Design Mockup). Read from code at this edit: the header shows the name as text (`ui/Header.tsx`).
    - The favicon is `favicon.ico`, with `logo-icon.svg` for browsers that take an SVG icon, in place of `/HI.ico` in `index.html`.
    - The manifest's icons are `pwa-192.png` and `pwa-512.png` with purpose `any`, and `pwa-maskable-192.png` and `pwa-maskable-512.png` with purpose `maskable`, in place of `icons/icon-192.png` and `icons/icon-512.png`. The Apple touch icon is `apple-touch-icon.png`.
    - `scripts/sync-shared-icon.mjs`, which runs before dev and build, copies these files. Read from code at this edit: it copies `HI.ico` and resizes `HI-256.png` and `HI-512.png` with `sharp`, its only user, so `sharp` leaves the dev dependencies now that the files come at their sizes. `scripts/verify-build-output.mjs` checks the new files, and the tracked `public/HI.ico` and old `public/icons/` PNGs go.
  - Server slice. Its copies sit next to the executable, copied there by `ReelRoulette.ServerApp.csproj`:
    - The Windows executable icon (`ApplicationIcon`) and the tray icon are `app.ico`, in place of `HI.ico` (`ResolveSharedIconPath` in `Program.cs`, which `AvaloniaTrayHostUi` loads).
    - The Linux desktop entry (`LinuxAppImageRegistrationService`, `reelroulette-server.desktop`) installs `png/icon-256.png` as its 256 px icon and `logo-icon.svg` as its scalable icon, in place of `HI-256.png` and `HI-512.png`, since the new set has no plain 512 px PNG.
      - Trap, inferred: an install that registered the old icons keeps `icons/hicolor/512x512/apps/reelroulette-server.png` in the user's data folder, and a desktop environment may prefer it to the scalable icon, so registration removes it.
    - The Operator page's icon link (`/HI.ico` in `Program.cs`) points at the new favicon until WebUI Admin Section replaces the page.
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
  - The server's executable and tray icon are `app.ico`, its Linux menu entry uses the new icons and leaves no old 512 px icon behind, and its Velopack legs use the new icons while the desktop's keep the old ones.
  - Outside the desktop project and its release legs, nothing refers to `HI.ico`, `HI-256.png`, or `HI-512.png`.
- **Verification evidence**:
  - Completion evidence must include `npm run verify` with `verify-build-output.mjs` checking the new files, a server test that Linux registration installs the new icons and removes the old 512 px one, `dotnet test ReelRoulette.sln`, `./tools/scripts/verify-linux-packaged-server-smoke.sh`, a search showing only the desktop project and its release legs use the old icons, and the Release Specific checklist item for the installed icons.

### M12e - Favorite and Blacklist Filter Modes

- **Status**: ⏳ Planned
- **Goal**: The Favorites and Blacklisted filters each choose only or excluded, in the server and both clients, so a filter such as Favorites excluded or Blacklisted only works the same in browse, random picks, and presets.
- **Scope**:
  - Ships in v0.15.0, after the new logo and icons milestone and before WebUI Responsive Layout and Panels builds the Filter tab. Depends on: WebUI Design Mockup, whose mockup approves its look.
  - Read from code at this edit: the filter state has two booleans, `favoritesOnly` (off by default) and `excludeBlacklisted` (on by default). They are in Core (`FilterState` in `FilteringContracts.cs`), the server's parser (`LibraryListFilterParser`) and list query (`LibraryCatalogListQuery`), the desktop (`FilterState.cs`, and the Favorites only and Exclude blacklisted checkboxes in `FilterDialog.axaml`), and the WebUI (`filterStateModel.ts`). Browse, its counts, and random picks all filter through them.
  - Each filter becomes a checkbox with a small dropdown to its right offering only and excluded, and the dropdown is disabled while its checkbox is off (decided in WebUI Design Mockup). Favorites starts off; Blacklisted starts on and excluded, which is today's Exclude blacklisted. Both clients offer the same options, so a preset behaves identically in each.
  - Contract slice: new fields beside the old ones, a contract change that only adds. A filter that carries only the old fields reads as before: `favoritesOnly` as Favorites only, `excludeBlacklisted` as Blacklisted excluded. Desktop Client Removal drops the old fields. The new fields' names, and what the server writes in the old fields for a client that reads only them, are decided here.
  - Server slice: the list query, its counts, and random selection apply Favorites only or excluded and Blacklisted only or excluded, in any combination.
  - Presets: saved filters carry the new fields, and preset matching compares them, locked to `preset-filter-equality.json` (read from code at this edit: the desktop's `PresetFilterEqualityFixtureTests` and the WebUI's `presetFilterEquality.test.ts` both read it). A preset saved before this milestone reads through its old fields.
  - The patch-or-reload rule, which decides whether a favorite or blacklist change patches a loaded tile or reloads the library window, learns the new modes on both clients, locked to `library-tile-effect.json` (read from code at this edit: the desktop's `LibraryPanelBrowse.cs` and the WebUI's `libraryQuerySession.ts` both follow it). For example, favoriting a loaded tile under Favorites excluded reloads, and so does removing one from the blacklist under Blacklisted only.
  - Desktop slice: the desktop's filter dialog gains the two dropdowns, a small change matching the server's, which the desktop's freeze allows.
  - WebUI slice: today's filter dialog gains the two controls, and WebUI Responsive Layout and Panels carries them into the Filter tab as the mockup shows.
  - Add a Release Specific checklist item: "In the WebUI and the desktop, Favorites excluded and Blacklisted only each limit browse and random play as named, and a preset saved in one client shows the same filter in the other."
- **Acceptance criteria**:
  - For each combination of the two filters, the list query, its counts, and random selection return exactly the matching items, and the defaults give today's results (Favorites off, Blacklisted excluded).
  - A filter or preset with only the old fields gives the same results as before this milestone.
  - Both clients show a checkbox and an only-or-excluded dropdown for Favorites and for Blacklisted, and a preset saved in one shows the same filter in the other.
  - Preset matching compares the new fields, and both clients pass `preset-filter-equality.json` with cases for them.
  - Both clients pass `library-tile-effect.json` with cases for the new modes.
  - The new fields are in OpenAPI, and `npm run verify:contracts` passes.
- **Verification evidence**:
  - Completion evidence must include server tests for each combination in the list query, its counts, and random selection, contract tests, the new cases in both shared fixtures run by both clients, desktop and WebUI filter dialog tests, `dotnet test ReelRoulette.sln`, `npm run verify`, and one quick spot check in each client.

### M12f - WebUI Responsive Layout and Panels

- **Status**: ⏳ Planned
- **Goal**: The WebUI layout adapts to the viewport: on tablets and desktops a side panel beside the player keeps the video playing in view while browsing, filtering, tagging, or viewing stats and settings, and on phones the panel is a full-screen overlay.
- **Scope**:
  - Ships in v0.15.0, after the favorite and blacklist filter modes milestone. Depends on: WebUI Preact Migration, WebUI Design Mockup, and Favorite and Blacklist Filter Modes, whose filter controls the Filter tab carries.
  - Built to the mockup approved in WebUI Design Mockup (`docs/mockups/webui-panels/`). Changes to user-facing UX need approval there.
  - Lands in five parts, each verified on its own, in this order:
    1. The field validation pattern, strict typed durations, and the Filter tab's Refresh, inside today's overlays.
    2. The in-app dialog component and the edit dialogs.
    3. Reordering by drag handle.
    4. The panel host and layout.
    5. The player: Auto-Pause, the photo timer with Play and the scrub bar, the time display's color, and the orange accent on native controls.
  - Measured again at promotion: the tag editor, filter, and library overlays are each `position: fixed; inset: 0` with `z-index: 1000`, so they cover the player while it keeps playing underneath, except that the tag editor pauses playback when it opens and resumes it when it closes (`pauseForTagEditor` and `resumeAfterTagEditor`, read from code when Auto-Pause was planned). The stylesheet has two `@media (max-width: 600px)` rules, and mobile browsers are detected by user agent (`getClientType` in `src/api/coreApi.ts`).
  - The main page is a header bar, the player with its overlay controls, and the footer status line as today. The header holds the logo, which New Logo and Icons puts there in place of the app name, and the current file name, and at the right an admin icon, which arrives with WebUI Admin Section. It has no settings icon: the Settings tab is reached from the panel's tab row. Photo duration stays in the header until WebUI Settings Panel moves it into the Settings tab, and the pairing token prompt keeps showing there, labeled "Pairing token", when the server asks for pairing.
  - Before anything plays, the player says "Tap to play, or open the panel to choose a preset or filter." in place of today's "Click here to play (choose a preset or open Filter…)", and a tap or Play starts a random pick, as today (decided in WebUI Design Mockup).
  - When the server fails the compatibility check, the panel still opens, the Library tab shows the compatibility message in place of the grid, and Play shows its notice (decided in WebUI Design Mockup). Read from code at this edit: today the library overlay doesn't open then (`open` in `src/library/library.ts`), and play, pairing, and events stop.
  - A panel host: at most one panel is open at a time. Below 800 px of viewport width, or on a touch screen (coarse pointer) below 500 px of viewport height, it is a full-screen overlay with the same tabs; otherwise it sits beside the player. The breakpoints use viewport size and pointer type, not the user agent. Beside the player it sits on the right by default or on the left as a per-device setting, and a drag handle between them sets its width, from 360 px to whatever leaves the player 400 px wide, starting at 420 px; the handle also takes the arrow keys while it has focus. The side is chosen in the Settings tab, which WebUI Settings Panel adds.
  - The panel has a single row of icon-only tabs: Library, Filter, Tags, Stats, and Settings, each with a tooltip and an accessible name. Library, Filter, and Tags keep the icons the player's buttons for them use today (`browse`, `filter_alt`, and `tag`). This milestone builds the Library, Filter, and Tags tabs from the library overlay, filter dialog, and tag editor; WebUI Stats Panel and WebUI Settings Panel add the Stats and Settings tabs.
  - The player's Library, Filter, and Tags buttons give way to one panel button, which opens the panel on its last tab, Library the first time, and closes the panel when it is open. Its icon shows the panel's side and whether it is open (`right_panel_open` and `right_panel_close`, or their left counterparts), and it is orange while the panel is open. Favorite and Blacklist stay on the player.
  - Auto-Pause replaces the tag editor's pause and resume. Opening the panel on any tab, or as its full-screen overlay, pauses playback according to an Auto-Pause mode:
    - **Never**: never pauses.
    - **Always**: pauses whenever the panel opens, at any width.
    - **Responsive**, the default: pauses only while the panel covers the player, as the full-screen overlay does on phones. An open panel that crosses a breakpoint pauses when it comes to cover the player and resumes, if Auto-Pause paused it, when it moves beside the player.
    - The admin view, which WebUI Admin Section adds, always covers the player, so it pauses under Always and Responsive.
    - Closing resumes playback only if Auto-Pause paused it; playback the user paused stays paused. Playing or pausing while the panel is open hands playback back to the user, so closing leaves it as it is.
    - Pausing a photo holds its autoplay timer, and the photo then resumes with the time it had left, not its full duration. Read from code at this edit: the tag editor's resume restarts a held photo (`resumeAfterTagEditor` in `src/playback/player.ts` calls `playCurrent`, which reloads the photo and starts its full duration).
    - The mode is fixed at Responsive until WebUI Settings Panel adds the setting. WebUI Preact Migration keeps today's tag editor pause, since that milestone changes nothing visible.
  - On a photo, the player's scrub bar stays in its place, so the controls keep their place between photos and videos. Read from code at this edit: today `playCurrent` hides the seek row for a photo, and Play does nothing on a photo (`playOrPause` in `src/playback/player.ts` acts only on a video). While a photo's timer runs, with Autoplay on and Loop off, the bar fills as the timer runs, showing when the next item plays, with the time shown as elapsed and photo duration. Play/Pause then pauses and resumes the timer, keeping the time left, and dragging the scrub bar moves the timer's position. With Autoplay off or Loop on, Play and the scrub bar are disabled on a photo, and the time is blank; Loop on restarts the same photo, so the bar does not fill then. Turning Autoplay on starts the photo's full time from that moment, and turning it off clears the timer. Auto-Pause still resumes a photo with the time it had left (decided in WebUI Design Mockup).
  - Checkboxes, radio buttons, sliders (the scrub bar and, from WebUI Keyboard Shortcuts and Player Controls, the volume slider among them), and other native controls use the app's orange accent instead of the browser's default blue, in both themes, set once for the whole WebUI with `accent-color` (decided in WebUI Design Mockup). Read from code at this edit: nothing sets `accent-color` (`src/styles.css`).
  - The overlay's time display stays light in both themes, like the overlay's other controls, since the player stays dark (decided in WebUI Design Mockup). Read from code at this edit: `--time-display-fg` is `#1a1d21` in the light theme (`src/styles.css`), while the overlay's buttons use `--icon-foreground`, white in both themes, so the time turns dark on the dark player.
  - The preset dropdown and randomization mode leave the header for the Library tab, laid out like the desktop library panel: above the grid, the preset, then randomization mode, then sort with its direction toggle, then search. The preset and randomization dropdowns share one row from a panel width of about 440 px. The controls collapse to give the grid more room, together with the filter summary line that WebUI Multi-Select and Bulk Actions adds, and stay collapsed or open per device. The collapse button's tooltip reads "Hide controls & filters" or "Show controls & filters".
  - The Library tab fits its column count to the panel width, with rows 100–240 px high, aiming for 160 px, beside the player and as the overlay. Read from code at this edit: today they are 200–400 px, aiming for 300 px (`libraryGridLayout.ts`). Choosing a tile plays it in the player beside the panel. When nothing matches the search or the filters, the grid says "Nothing matches the search or filters."; its other messages stay as they are today (decided in WebUI Design Mockup). As the overlay, choosing a tile plays it and closes the overlay, as the library overlay does today.
  - Library tiles (decided in WebUI Design Mockup): the favorite and blacklist icons lose their dark rectangle and become filled icons, by the icon font's FILL axis, with a soft drop shadow, so they stay readable on bright thumbnails. The playing tile shows a filled play icon in its middle, modest in size and slightly translucent so the thumbnail shows through, in the same style. With a mouse, hovering a tile shows its file name as a tooltip. File names keep showing on tiles until WebUI Settings Panel adds the setting that turns them off. Read from code at this edit: the badges are outlined orange icons on a dark rectangle (`.library-grid-tile-badge` in `src/styles.css`), the grid doesn't mark the playing tile, and every tile shows its name in a bar, which alone carries the tooltip (`renderGridTileHtml` in `src/library/libraryGridTileModel.ts`).
    - Filled icons, these and the check icons WebUI Multi-Select and Bulk Actions adds, are plain flat shapes, at the font's FILL 1, weight 700, and optical size 20, as today's badges use (`.library-grid-tile-badge-icon` in `src/styles.css`). Trap, measured in the mockup with the WebUI's font: a filled glyph draws its outline and its fill as separate shapes, and at weight 700 the fill closes the outline's hole only at optical sizes 20 and 24. From 32 up the fill falls short, so at the optical size 48 the WebUI's other icons use, each filled icon shows as an outline around a filled center with a thin gap between them.
  - Beside the player, the Filter tab's Apply and Cancel leave the panel open. As the overlay they close it, as the filter dialog does today.
  - The Tags tab edits the playing item's tags and follows the playing item when it changes, unless the tab has unsaved changes to its item's tags. Then it stays on that item and shows a line naming it, "Editing tags for {file name}", until those changes are saved or discarded (Refresh discards them, asking first), and then follows the playing item. Unsaved changes that are not to the item's tags, such as a category reorder or rename, don't hold it. WebUI Multi-Select and Bulk Actions points the tab at several selected items the same way, with "Editing tags for {n} items". Read from code at this edit: the tag editor takes the item playing when it opens (`open` in `src/tags/tagEditor.ts`), and today its overlay and pause keep that item on screen while it is open.
  - Unsaved changes survive closing the panel and switching tabs: the Filter tab's until Apply or Cancel, and the Tags tab's until Save, or Refresh, which discards them after asking. The tag editor's close confirmation goes away. While the Filter or Tags tab holds unsaved changes, a small orange dot marks its tab icon, and the player's panel button while either does, so they aren't forgotten when the panel is closed, and their accessible names say so. Read from code at this edit: closing the tag editor asks "Discard changes?" when it has changes (`close` in `src/tags/tagEditor.ts`), and reopening the filter dialog rebuilds its draft from the applied filter and the server's presets, dropping unsaved filter and preset changes (`open` in `src/filter/filterDialog.ts`).
  - The WebUI remembers its per-device state across a page refresh, as the desktop remembers its own across restarts. This milestone adds one per-device store and remembers whether the panel is open, its side, width, and last tab, whether the Library tab's controls are collapsed, the active preset (including None) and applied filter, randomization mode, and sort and direction. WebUI Settings Panel and WebUI Keyboard Shortcuts and Player Controls remember the client settings they add the same way, and so does duplicate review in Admin Refresh, Backup, and Duplicate Review. The search text is not remembered. The randomization mode already stored per device carries over.
  - Presets stay on the server: the WebUI remembers only which preset is active and the filter it applied. A remembered preset, tag, or source that was renamed or deleted on another device in the meantime is handled as it is when that happens while the WebUI is open.
  - Trap, inferred: browser storage is kept per address, so on one device the WebUI opened at `localhost`, at the LAN address, and through an HTTPS proxy remembers three separate sets of state.
  - Not included: the playing item and its position, which is Resume Position and Session Continuity.
  - Auto Tag opens from the Tags tab as an overlay over the whole page, as its tab does today, instead of as a tab of the tag editor, so its file list keeps its width. It covers the player, so it pauses under Always and Responsive. It has its own Apply for its selected changes, which today the tag editor's Save applies, and its Close is disabled while a scan runs, as the tag editor's Refresh and Close are today (decided in WebUI Design Mockup).
  - Auto Tag's footer and results (decided in WebUI Design Mockup):
    - Apply sits at the right of the footer with Cancel to its left. Cancel clears the scan and closes Auto Tag, while the X at the top right closes it and keeps the last scan; both wait while a scan runs.
    - With View all matches, files that already have the tag show checked and disabled, so they can't be unchecked. Read from code at this edit: they show as ordinary checkboxes that start unchecked, and checking one sends the file again (`visibleAutoTagFiles` and `autoTagAssignments` in `src/tags/autoTagModel.ts`).
    - Each scan starts with nothing checked, as today, and Select all checks everything.
    - The results area shows a placeholder before any scan, "Scan to find files whose names contain a tag's name.", and a different one when a scan finds nothing, "No file names contain any tag's name.". Read from code at this edit: it is empty before a scan, and after one that finds nothing it repeats the status line's "Scan complete: no matching tags found." (`autoTagResults` in `src/tags/autoTagModel.ts`).
    - The Total matched and To be changed counts each line up under their own header, with room between the two columns. Read from code at this edit: the header and each row are separate grids whose count columns size to their own content (`.tag-autotag-table-head` and `.tag-autotag-row-main` in `src/styles.css`), so the numbers drift from their headers.
  - The Filter tab's message for a library with no tags reads "No tags yet. Add them in the Tags tab." in place of "No tags available. Use Edit tags to create tags." (decided in WebUI Design Mockup).
  - Not included: admin and duplicate review as panel tabs. They open in a full-page admin view, which is WebUI Admin Section.
  - The panel and the dialogs stay inside the fullscreen stage, so they work in fullscreen as the overlays do today, including iOS pseudo-fullscreen.
  - Phone layouts work in an installed app (standalone display, safe-area insets).
  - A phone on its side, by the overlay's short-screen rule (a touch screen below 500 px of viewport height): the header and status line hide and the player fills the screen, as in fullscreen but without the browser's fullscreen mode. The panel, as the overlay, and the dialogs still open there, in layouts that fit a short screen. A tablet in landscape, at 500 px or more, keeps the normal layout. While the server asks for pairing, the header shows there anyway, so its prompt can be reached (decided in WebUI Design Mockup).
  - While the status line is hidden, on a phone on its side or with WebUI Settings Panel's Show the status line off, a small indicator on the player shows while the connection is lost and reconnecting (decided in WebUI Design Mockup).
  - Tag categories, in the Tags tab and the Filter tab's Tags section, collapse and expand when their header is tapped or clicked, and their expand and collapse arrows go. The drag handle, the Edit button, and the Filter tab's Local match select keep their own actions.
  - In-app dialogs: this milestone builds the WebUI's dialog component and uses it for every dialog it touches, never a browser dialog. The component is themed, shows in fullscreen, and stacks one dialog above another. Escape or a click outside closes only the top dialog, and focus returns to where it was. Enter in a dialog's field saves it. A confirmation opens with Cancel focused, so Enter never confirms it by default, and its confirming button names the action, such as a red Delete.
    - Tags tab: chips lose their delete icon, and category rows lose their up, down, rename, and delete icons for a drag handle and one Edit button. A chip's edit icon opens the Edit Tag dialog. A category's Edit button opens a new Edit Category dialog with the name, in place of today's rename prompt. Both dialogs have Delete, which asks first in a dialog stacked above, with today's wording: `Delete tag "{name}"?` and `Delete category "{name}"? Tags will become Uncategorized.`
    - Filter tab's Manage Presets: preset rows lose their up, down, rename, and delete icons for a drag handle and one Edit button. Edit opens a new Edit Preset dialog with the name and Delete, which asks `Delete preset "{name}"?` in a dialog stacked above. It replaces today's rename prompt.
    - The Edit Category and Edit Preset names use the field validation pattern. They are flagged when emptied, or when another category or preset has the name, ignoring case, and Save can't proceed meanwhile. They replace the alert "Category already exists." and the status message "That name is already in use." (read from code at this edit: `renameCategory` in `src/tags/tagEditor.ts` and `renamePreset` in `src/filter/filterDialog.ts`).
  - Not included: converting the remaining native dialogs (the tag editor's Refresh confirmation, **Discard changes?**, and new category name) and adding a notice, which is WebUI In-App Dialogs.
  - Reordering: tag categories and presets reorder by drag and drop instead of up and down arrows. Each row has a visible drag handle, the only place a drag starts, so dragging elsewhere on a row still scrolls on a touch screen. The up and down arrow keys move a row while its handle has focus, and screen readers hear the new position. Uncategorized stays last, as today, and shows its handle dimmed and disabled, so its name lines up with the other categories' (decided in WebUI Design Mockup). A new order stays pending until Save or Apply, as a move does today.
  - Field validation pattern: one reusable pattern for the whole WebUI, used anywhere a field can hold a value that is not valid. In this milestone the Filter tab's minimum and maximum durations and new preset name, and the Edit Tag, Edit Category, and Edit Preset names, use it. WebUI In-App Dialogs, WebUI Settings Panel, WebUI Admin Section, Admin Refresh, Backup, and Duplicate Review, and WebUI Status Line Overhaul use it for their fields.
    - Field problems use this pattern, never a dialog or the status line. WebUI In-App Dialogs holds the dialog side of the WebUI's message rule, and WebUI Status Line Overhaul the status line side.
    - A value that is not valid is flagged as it is typed, by a red validation icon inside the field on its right side, in the WebUI's existing Material Symbols icon style. A tooltip says what the field expects, shown while the pointer is on the icon, after a tap on it, or while the field has focus. There is never a separate message line. A required field that is still empty is flagged only once the user has typed in it, but the action that uses it can't proceed meanwhile.
    - The tooltips: "Use MM:SS, HH:MM:SS, or seconds." for a duration; "Enter a preset name.", "Enter a tag name.", or "Enter a category name." for an empty name; and "Use a name no other preset has." or "Use a name no other category has." for a taken one.
    - The field is marked invalid for screen readers (`aria-invalid`), and the tooltip's text is its accessible description.
    - Any action that would use a field while it is not valid, such as Apply, can't proceed until the field is corrected, whether or not anything else changed. Its label dims and the red icon shows on its right, and pressing it does nothing but move to the first field that holds it, switching the Filter tab's section when needed. A Filter tab section with a flagged field shows the red icon after its name, so the field can be found from another section.
    - Typed durations are parsed strictly: whole MM:SS or HH:MM:SS with minutes and seconds under 60, or a number of seconds. Read from code at this edit: `parseDurationInputToSeconds` in `src/filter/filterStateModel.ts` uses `parseInt` and `parseFloat`, so it reads "1:7x" as 1:07 and "12abc" as 12 seconds. The same function reads durations in presets and filters from the server (`readDurationFromUnknown`), which can carry fractional seconds from the desktop, such as "00:01:30.5000000"; those are read as today.
    - Today's duration check, read from code at this edit: Apply checks the durations only when it runs (`generalDraftDurationError` in `src/filter/filterDialogModel.ts`, called from `apply` in `src/filter/filterDialog.ts`). One that is not valid stops Apply, switches to General, and writes "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds." or "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds." to the status line through `store.setStatus`, which also relays it to `last.log`. The open dialog covers the status line (`position: fixed; inset: 0`), so the message shows only after the dialog closes. Leaving a field with a duration that is not valid returns Apply to its unmarked state, since the working filter counts it as no duration (seen in the WebUI Preact Migration's filter dialog spot check). The pattern replaces that check: Apply no longer writes either message to the status line or to `last.log`.
    - The Filter tab's new preset name, read from code at this edit: Add Preset writes "Enter a preset name." for an empty name and "A preset with that name already exists." for a saved preset's name, ignoring case, to the status line (`addPreset` in `src/filter/filterDialog.ts`), where the open dialog covers them. The pattern replaces both: the name is flagged as it is typed, and Add Preset can't proceed while it is empty or taken.
    - The Edit Tag dialog's tag name, read from code at this edit: its Save writes "Tag name is required." to the status line for an empty name (`saveEdit` in `src/tags/tagEditor.ts`), where the tag editor covers it. The pattern replaces it: the emptied name is flagged, and Save can't proceed while it is empty.
  - The Filter tab's Refresh and unsaved preset changes, found in the WebUI Preact Migration's filter dialog review and read from code at this edit: Refresh replaces the preset list with the server's but leaves Apply's star (`refresh` in `src/filter/filterDialog.ts` keeps `presetsChanged`), so a preset added, updated, renamed, moved, or deleted since the last Apply disappears while Apply still posts the server's own list. The filter dialog did the same before it moved to Preact. Refresh keeps unsaved preset changes: while the preset list has changes Apply hasn't saved, Refresh reloads sources and tags but keeps the edited list and Apply's star, and Apply then saves it.
  - Add a Release Specific checklist item: "On a phone, a tablet, and a desktop browser, and as an installed app on Android and iOS, the panel opens beside the player on either side or as an overlay by width; with Auto-Pause on Responsive, playback keeps going on every tab beside the player, and the overlay pauses it and resumes it on close."
- **Acceptance criteria**:
  - The main page shows the header bar with the app name and current file name, the player with its overlay controls, and the footer status line. The header no longer shows the preset dropdown or randomization mode, and it has no settings icon.
  - At most one panel is open at a time.
  - Below 800 px of viewport width, or on a touch screen below 500 px of viewport height, the panel opens as a full-screen overlay with the same tabs, and closing it returns to the player. Otherwise it opens beside the player on the side set for the device.
  - Beside the player, the panel's width stays between 360 px and the width that leaves the player 400 px wide, and starts at 420 px. It changes by dragging the handle or with the arrow keys on it, and is remembered per device. With Auto-Pause on Responsive, the video stays visible and playing.
  - With Auto-Pause on Responsive, opening the panel beside the player leaves playback going, opening it as a full-screen overlay pauses it, and an open panel that crosses a breakpoint pauses or resumes as it comes to cover the player or moves beside it.
  - With Auto-Pause on Always, opening the panel pauses playback at every width; on Never, opening it never pauses.
  - Closing the panel resumes playback only if Auto-Pause paused it, playback the user paused stays paused, and playing or pausing while the panel is open leaves playback as it is on close.
  - Auto-Pause holds a photo's autoplay timer while it pauses, and the photo then resumes with the time it had left.
  - On a photo, the scrub bar shows in the place it has on a video. With Autoplay on and Loop off it fills as the photo's timer runs, Play/Pause pauses and resumes the timer with the time left kept, and dragging the bar moves the timer. With Autoplay off or Loop on, Play and the bar are disabled on a photo. Turning Autoplay on starts the photo's full time, and turning it off clears the timer.
  - The overlay's time display is light in both themes, and checkboxes, radio buttons, and sliders use the orange accent in both themes.
  - The tag editor has no pause of its own, and Auto-Pause is Responsive until the Settings tab can change it.
  - The tabs are one row of icons, each with a tooltip and an accessible name, and the Library, Filter, and Tags tabs use `browse`, `filter_alt`, and `tag`.
  - The player shows one panel button and no Library, Filter, or Tags button. The panel button opens the panel on its last tab and closes an open panel, and Favorite and Blacklist stay on the player.
  - The Library tab shows, above the grid and in this order, the preset dropdown, randomization mode, sort with its direction toggle, and search. The preset and randomization dropdowns share a row from a panel width of about 440 px, and the controls and the filter summary line collapse and expand together.
  - The Library tab fits its column count to the panel width with rows 100–240 px high. Choosing a tile plays it beside the panel, or plays it and closes the overlay.
  - Tile badges are filled icons with a drop shadow and no dark rectangle, only the playing tile shows the playing icon in its middle, and hovering a tile with a mouse shows its file name as a tooltip.
  - Beside the player, the Filter tab's Apply and Cancel leave the panel open; as the overlay, they close it.
  - When the playing item changes, the Tags tab shows the new item's tags, unless it has unsaved changes to its item's tags. Then it stays on its item with an "Editing tags for {file name}" line, and follows the playing item once those changes are saved or discarded.
  - Closing the panel or switching tabs keeps unsaved Filter and Tags changes, the Filter tab's until Apply or Cancel and the Tags tab's until Save or Refresh, and closing never asks "Discard changes?".
  - While the Filter or Tags tab holds unsaved changes, its tab icon shows a dot, and the player's panel button shows one while either does, each with an accessible name that says so. The dots go once the changes are applied, saved, canceled, or discarded.
  - After a page refresh, whether the panel is open, its side, width, and last tab, whether the Library tab's controls are collapsed, the active preset and applied filter, randomization mode, and sort and direction are each as they were, and the search box is empty.
  - After a page refresh, a remembered preset, tag, or source that was renamed or deleted elsewhere is handled as it is when that happens while the WebUI is open.
  - Auto Tag opens from the Tags tab over the whole page.
  - Resizing the window across a breakpoint moves an open panel between side panel and overlay without losing its state.
  - The panel works in fullscreen.
  - On a touch screen below 500 px of viewport height, the header and status line hide and the player fills the screen without the browser's fullscreen mode, and the panel and dialogs open in layouts that fit; a tablet in landscape keeps the normal layout.
  - The layout does not depend on the user agent.
  - Before anything plays, the player shows "Tap to play, or open the panel to choose a preset or filter.", and a tap or Play starts a random pick.
  - When the server fails the compatibility check, the panel opens, the Library tab shows the message in place of the grid, and Play shows its notice.
  - A search or filter with no results shows "Nothing matches the search or filters.", and the Filter tab's no-tags message names the Tags tab.
  - Auto Tag applies its selected changes with its own Apply, and its Close is disabled while a scan runs.
  - Auto Tag's Cancel, left of Apply, clears the scan and closes it, and the X closes it and keeps the last scan. With View all matches, files that already have the tag are checked and disabled. Its results area shows one placeholder before any scan and another when a scan finds nothing, and its two count columns line up under their headers.
  - On a phone on its side the header shows while the server asks for pairing, and while the status line is hidden a reconnecting indicator shows on the player when the connection is lost.
  - Tapping or clicking a tag category's header collapses or expands it, with no arrows. Its drag handle, its Edit button, and the Filter tab's Local select keep their own actions.
  - Every dialog this milestone touches is an in-app dialog in the WebUI's theme, and none of them calls `prompt`, `confirm`, or `alert`. A delete confirmation opens stacked above its edit dialog, with Cancel focused and a red Delete. Escape or a click outside closes only the top dialog, and focus returns to where it was. The dialogs show and work in fullscreen.
  - Chips have no delete icon, and category and preset rows have no up, down, rename, or delete icons. Edit Tag, Edit Category, and Edit Preset each have Delete, which asks first with today's wording.
  - An Edit Category or Edit Preset name that is emptied, or that another category or preset has ignoring case, is flagged with the field validation pattern, and its Save can't proceed. Neither "Category already exists." nor "That name is already in use." shows.
  - Tag categories and presets reorder by dragging their handle, and with the up and down arrow keys on a focused handle. A drag that starts elsewhere on a row scrolls instead, screen readers hear the new position, and Uncategorized stays last with its handle disabled.
  - A Filter tab duration that is not valid is flagged as it is typed by a red validation icon inside the field on its right side, with a tooltip saying what the field expects, and no separate message line shows. The tooltip shows while the pointer is on the icon, after a tap on it, or while the field has focus.
  - A field flagged as not valid has `aria-invalid` set and the tooltip's text as its accessible description, and loses both once corrected.
  - While a duration is not valid, Apply can't proceed, including when nothing else changed, and Apply never writes an invalid-duration message to the status line or `last.log`.
  - A held action shows the red icon on the right of its label. Pressing a held Apply moves to the field that holds it, switching to General when needed, and applies nothing.
  - A typed duration such as "1:7x", "12abc", or "1:75" is flagged, and a preset whose duration the server sends with fractional seconds, such as "00:01:30.5000000", loads as it does today.
  - A new preset name that is emptied after typing, or that matches a saved preset's name ignoring case, is flagged with the field validation pattern; Add Preset can't proceed while the name is empty or taken; and neither "Enter a preset name." nor "A preset with that name already exists." shows.
  - An Edit Tag dialog tag name that is emptied is flagged with the field validation pattern, its Save can't proceed while the name is empty, and "Tag name is required." no longer shows.
  - After an unsaved preset change in the Filter tab, Refresh keeps the change and Apply's star, and Apply then saves it.
- **Verification evidence**:
  - Completion evidence must include component tests for:
    - the panel host: breakpoints by width and by pointer and height, the panel side, width limits and memory, tab selection and the last tab, the tabs' accessible names, and the panel button;
    - the Library tab's control order and column fitting, the dropdowns sharing a line, and the controls collapsing;
    - the short-screen layout of a phone on its side;
    - a page refresh keeping each remembered setting, including whether the panel is open, and clearing the search text;
    - Auto-Pause in each mode at phone and desktop widths, across a breakpoint, with playback the user paused or resumed, and with a photo resuming with the time it had left;
    - the scrub bar on a photo with Autoplay on and off;
    - the dialog component: stacking, Escape and a click outside closing only the top dialog, Enter saving a dialog's field, a confirmation opening with Cancel focused, focus returning, and showing in fullscreen;
    - the edit dialogs, with Delete asking first and canceling, and no native dialog in the flows this milestone touches;
    - reordering with the arrow keys, and the drag logic deciding where a dragged row lands;
    - category headers toggling while their other controls don't;
    - the Tags tab following the playing item, and staying on its item with the "Editing tags for" line while it has unsaved changes to that item's tags;
    - unsaved Filter and Tags changes surviving closing the panel and switching tabs, and the dots on their tabs and the panel button;
    - the field validation pattern on both durations, the new preset name, and the Edit Tag, Edit Category, and Edit Preset names: the icon, tooltip, and `aria-invalid` as a value is typed and corrected, an untouched empty field not flagged, the action held with and without other changes and moving to the field, and no status-line or `last.log` message;
    - strict typed durations, and a server preset with fractional seconds loading as today;
    - the Filter tab's Refresh after an unsaved preset change.

    Plus `npm run verify`, and one quick spot check on a phone and a desktop browser, including dragging on a touch screen.

### M12g - WebUI In-App Dialogs

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for names and confirmations, and shows anything the user must notice or act on, in its own dialogs, styled like the rest of the WebUI, instead of the browser's `prompt`, `confirm`, and `alert`.
- **Scope**:
  - Ships in v0.15.0, after the WebUI responsive layout and panels milestone. Depends on: WebUI Preact Migration, so the dialog is a Preact component the migrated screens use, and WebUI Responsive Layout and Panels, whose dialog component and field validation pattern it uses.
  - Found during the post-migration fixes desktop spot checks: preset rename in the WebUI opens the browser's native prompt, which does not match the WebUI's styling and does not suit the WebUI when it runs as an installed web app.
  - Measured again at promotion: the WebUI uses native dialogs in nine places: preset delete and rename; tag editor category rename, duplicate-name alert, and category delete; tag delete; two **Discard changes?** confirmations; and new category name. Since the WebUI Preact Migration they are in `src/filter/filterDialog.ts` and `src/tags/tagEditor.ts`, which take `confirm`, `prompt`, and `alert` as options.
  - WebUI Responsive Layout and Panels builds the dialog component (themed, stacking, inside the fullscreen stage, a confirmation opening with Cancel focused, Escape or a click outside closing the top dialog, and focus returning to where it was) and moves six of those dialogs onto it. Preset rename becomes its Edit Preset dialog, and category rename with its duplicate-name alert becomes its Edit Category dialog. Preset, category, and tag delete each ask in a dialog stacked above their edit dialog. It also removes the tag editor's close confirmation, since unsaved changes now survive closing the panel.
  - This milestone converts the rest to that component: the tag editor's Refresh confirmation, **Discard changes?**, and new category name. It also adds a notice to the component.
  - The WebUI's message rule, dialog side: anything the user needs to notice or act on (an error from their own action, a failure that stops what they asked for, or a confirmation, meaning a prompt that asks before an action, such as Delete or Discard changes) shows in this in-app dialog, never in a browser-native dialog and never on the status line. Field problems use the field validation pattern from WebUI Responsive Layout and Panels instead, and the status line keeps only background information that shouldn't interrupt the user, such as connection state, refresh progress, and sync notices. Work from this milestone on follows the rule; WebUI Status Line Overhaul sorts today's status line messages by it and moves those that belong in a dialog or a field.
  - A notice is relayed to `last.log` as a status message is today, with the same text, which leaves out file and preset names.
  - New category's name uses the field validation pattern from WebUI Responsive Layout and Panels: an empty name is flagged in the field as it is typed, and the dialog can't be confirmed with it. Read from code at this edit: today an empty name in new category does nothing once confirmed.
  - Apart from that name check, keep each dialog's wording and outcome as it is today; only how it is shown changes. Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - The WebUI calls no `prompt`, `confirm`, or `alert`.
  - The tag editor's Refresh confirmation, **Discard changes?**, and new category name use the dialog component from WebUI Responsive Layout and Panels, keep their wording, and confirming or canceling does what it does today, apart from the name check.
  - In new category, an empty name is flagged with the field validation pattern as it is typed, and the dialog can't be confirmed until the name is corrected.
  - The dialogs match the WebUI's theme and work in an installed web app on desktop and mobile.
  - The dialogs show and work in fullscreen.
  - A notice shows its message in the in-app dialog and is relayed to `last.log` with the text a status message with that wording is relayed with today.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include WebUI tests for confirm and cancel on each converted dialog, for a notice and its `last.log` line, and for the new category name check with the field validation pattern, a check that no native dialog calls remain, `npm run verify`, and a spot check in an installed web app.

### M12h - WebUI Settings Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI side panel has a Settings tab for per-device preferences and diagnostics.
- **Scope**:
  - Ships in v0.15.0, after the WebUI in-app dialogs milestone. Depends on: WebUI Responsive Layout and Panels.
  - The Settings tab joins the side panel's tab row. The header has no settings icon: WebUI Responsive Layout and Panels leaves it out, since the tab row reaches the Settings tab.
  - Not included: admin. It opens as a full-page view from the header's admin icon, which is WebUI Admin Section.
  - Checked against the code at promotion: the diagnostics panel is shown only when `isMobileBrowser()` is true. Photo duration and randomization mode are already kept per device in `localStorage`; autoplay and loop are not kept and start off.
  - Move the diagnostics information to the Settings tab and remove the diagnostics panel from below the main page's status line. That panel is currently shown only on mobile browsers by design; in the v0.13.0 manual regression pass it appeared only on the phone in Firefox.
  - Client settings live in the Settings tab, all per device: photo duration, which leaves the header, the side the panel opens on, whose options read Left, then Right, matching the sides (decided in WebUI Design Mockup), and Auto-Pause (Never, Always, or Responsive, the default), which WebUI Responsive Layout and Panels describes and keeps at Responsive until this setting exists. Randomization mode is in the Library tab, which WebUI Responsive Layout and Panels builds.
  - Every client setting survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds. Remembering is the default, with no option to turn it off. The photo duration already stored per device carries over.
  - Settings apply as they change; the Settings tab has no Save.
  - Appearance settings, per device: Theme, which is System (the default, following the system as the WebUI does today), Dark, or Light; Show file names on tiles, off by default (decided in WebUI Design Mockup; read from code at this edit, every tile shows its name today), while hovering a tile with a mouse shows its name as a tooltip either way; and Show the status line, on by default. Ambient mode joins them, on by default, with an expandable Ambient mode settings section beside its toggle, both added with the effect by WebUI Keyboard Shortcuts and Player Controls (decided in WebUI Design Mockup). Hide player controls, with Hide after and Keep visible while paused under its Timeout choice, joins the Playback settings, also added with its behavior by WebUI Keyboard Shortcuts and Player Controls (decided in WebUI Design Mockup). With the status line hidden, WebUI Responsive Layout and Panels' reconnecting indicator shows on the player while the connection is lost.
  - Loop, autoplay, and mute are only the player's buttons, with no entry in the Settings tab, and each button's state survives a page refresh. The autoplay mode and its timer are Settings tab entries, which WebUI Keyboard Shortcuts and Player Controls adds.
  - Settings fields that can hold a value that is not valid use the field validation pattern from WebUI Responsive Layout and Panels, and such a value is not kept. Photo duration is one: read from code at this edit, the header ignores a value outside 1–300 seconds without saying so.
  - Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - The Settings tab holds the client settings, including photo duration, the panel's side, and Auto-Pause, and the header no longer shows photo duration.
  - A photo duration outside 1–300 seconds is flagged with the field validation pattern as it is typed and is not kept, and the photo duration in use stays as it was.
  - Auto-Pause offers Never, Always, and Responsive, starts at Responsive, and the panel pauses as the chosen mode says.
  - Each setting applies as it changes, with no Save.
  - Theme offers System, Dark, and Light and starts at System, and turning off Show the status line hides it.
  - Show file names on tiles starts off, and turning it on shows each tile's name on the tile.
  - The Settings tab has no loop or autoplay entry.
  - The Settings tab is in the panel's tab row, and the header has no settings icon.
  - The Settings tab shows the diagnostics information on desktop and mobile browsers, and the main page no longer shows the diagnostics panel.
  - After a page refresh, photo duration, the panel's side, Auto-Pause, the theme, whether file names show on tiles, whether the status line shows, and the autoplay, loop, and mute buttons' state are each as they were.
  - Preferences are stored per device and do not change other devices.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for preference storage, for a page refresh keeping each setting this milestone adds, and for photo duration with the field validation pattern, `npm run verify`, and one quick spot check on a phone.
  - Add a Release Specific checklist item: "On a desktop browser and a phone, and as an installed app, every remembered setting is kept after a refresh and a browser restart, and the library search starts empty."

### M12i - WebUI Admin Section

- **Status**: ⏳ Planned
- **Goal**: Everything the Operator page does moves into a full-page admin section of the WebUI, and the server keeps a minimal recovery page for when the WebUI's files are broken.
- **Scope**:
  - Ships in v0.15.0, after the WebUI settings panel milestone. Depends on: WebUI Responsive Layout and Panels, whose header holds the admin icon, and Catalog Open and Backup Safety, whose library state and message the admin section shows.
  - Measured again at promotion: the Operator page is 842 lines of HTML, CSS, and JavaScript inside a raw string in `src/core/ReelRoulette.ServerApp/Program.cs`, up from 779 when this entry was written, after the control token, shutdown, and no-library work. No test covers the page's content; the only test that names `/operator` checks that the library route gate leaves it open. The sections listed below match the page, and `verify-linux-packaged-server-smoke.sh` still requests `/operator`.
  - Admin section slice:
    - Admin is a full-page view opened from the header's admin icon, not a panel tab. The icon is always visible. The view keeps the Operator page's responsive layout (a 12-column grid that changes at 620 and 980 px wide, read from code at this edit), restyled to match the rest of the WebUI.
    - The admin view covers the player, so opening it pauses playback under the Always and Responsive Auto-Pause modes, and leaving it resumes playback only if Auto-Pause paused it, as WebUI Responsive Layout and Panels describes.
    - Move every Operator section into the admin section as Preact screens: server updates, runtime status with restart and stop (including the message when the server runs without a library), web runtime settings (port, Allow remote connections, mDNS advertising and LAN hostname, and auth mode and shared token, without Enable Web UI, which the always-on WebUI slice drops), control settings (control token, dev channel, Launch Server on Startup), the testing suite, connected clients, server logs, and incoming and outgoing API events. They call the same control routes, so there is no contract change.
    - Settings fields that can hold a value that is not valid, such as the port, use the field validation pattern from WebUI Responsive Layout and Panels, and their Save can't proceed while one is not valid. The values each field accepts are read from the server's checks when this slice starts.
    - The Operator's Server Logs becomes the **Log Viewer**, redesigned to its final design from Admin Log Viewer rather than moved as it is (decided in WebUI Design Mockup). It is named Log Viewer everywhere the interface names it, in the admin section and the recovery page, from this milestone. Only the route, `GET /control/logs/server`, keeps its name until Admin Log Viewer renames it.
    - Its filters sit in a panel that starts collapsed, with chips for the active ones. A live indicator pauses while the list is scrolled away from the newest lines, with a resume control, and rows expand to the full line.
    - The Operator's Tail lines field goes: the Log Viewer shows the newest matching lines and loads older ones as the list scrolls, up to the route's limit (read from code at this edit: `ServerLogService.Read` returns at most the last 5000 lines).
    - It reads today's line format, `[timestamp] [source] [level] message` (read from code at this edit: `ServerLogService.Append`). It filters by time window, by source (the second bracket: `server`, `webui`, and the desktop's sources, such as `desktop-app` and `desktop-update`), by level, with one checkbox per level found (today `info`, `warn`, and `error`), and by contained text. Category and component filters arrive with Admin Log Viewer.
    - Read from code at this edit: `GET /control/logs/server` filters by one level and contained text, then takes the last 1–5000 lines. Inferred: it also takes several levels, several sources, and a time window, applied before it takes the last lines, as level and text are; a contract change that only adds.
    - Connected clients show each client's id and, where its user agent names one, its operating system, then its type, address, and the time it connected, with counts of API sessions, control sessions, and event streams. They leave out the session id, which the Operator page shows today (decided in WebUI Design Mockup). Read from code at this edit: the server keeps each event stream's client id, user agent, and connection time (`ConnectedClientTracker`), so this needs no contract change.
    - On a phone on its side, where the app's header hides, the admin view keeps its own bar, with the back arrow and its title (decided in WebUI Design Mockup).
    - The Operator's update download needs two attempts every time: click Download and confirm, and nothing happens; click Download and confirm again, and it downloads. Find the cause before building the admin section's update controls, so they don't inherit it. No commit has fixed it (checked at promotion).
    - Gating: opening admin from another machine asks for the control token first, through `POST /control/pair`, and shows nothing until it is accepted. On the server machine, which the merged localhost helper decides, it opens directly. The accounts release replaces the token with admin accounts.
    - Later admin work lands here: refresh, backup, and duplicate review, with duplicate review opening within the admin section, source and item management, catalog transfer, the Log Viewer, and account administration.
  - Recovery page slice:
    - The server keeps a minimal built-in page with restart, stop, a log tail, and updates, at a fixed path such as `/recovery` (decided here). It is plain, in the WebUI's theme colors, and titled "ReelRoulette Recovery", laid out as the mockup's recovery page shows, with `logo-icon.svg` beside its title and as its page icon (decided in WebUI Design Mockup). The icon is built into the page, since the page loads none of the WebUI's files. It does not load the WebUI's files, so it works when they are missing or broken, and it has the same control-token gating.
    - It renders settings and status text without `innerHTML` interpolation (found by the repository audit: Operator HTML page interpolates user input via `innerHTML`).
    - Retire the Operator page: `/operator` redirects to the admin section, the tray's Open Operator UI item becomes **Open ReelRoulette** and opens the WebUI's main page (decided in WebUI Design Mockup; read from code at this edit: `AvaloniaTrayHostUi.cs`), `verify-linux-packaged-server-smoke.sh` checks the recovery page and the admin section entry instead of `/operator`, and the testing checklist's Smoke item checks the admin section instead of the Operator page.
  - Always-on WebUI slice:
    - The server always serves the WebUI from this release, since the admin section lives there, and ignores the web runtime settings' `enabled` field. Read from code at this edit: turned off, that field stops the server serving the WebUI's files and `/runtime-config.json` from its next start, leaves the WebUI's origins out of CORS, and stops mDNS advertising. Turned off from the admin section, it would remove the admin section itself, and the recovery page has no way to turn it back on.
    - The field stays in the contract, so the last desktop build keeps working, and the server reports it as on. Trap, read from code: the desktop enables its Open Web UI menu item only when the server reports the WebUI as on, and Desktop Retirement Notice's notice offers that action. Desktop Client Removal drops the field.
    - The admin section has no Enable Web UI switch, and the frozen desktop's Settings dialog loses its Enable Web UI switch, which would no longer do anything (approved as a desktop change outside bug fixes). `docs/api.md` and `docs/dev-setup.md` stop describing the WebUI as optional.
- **Acceptance criteria**:
  - The header's admin icon is always visible and opens the admin section as a full-page view, not a panel tab.
  - Under Always and Responsive, opening the admin section pauses playback and leaving it resumes only playback Auto-Pause paused; under Never, playback keeps going.
  - The admin section keeps the Operator page's layout at phone and desktop widths and matches the rest of the WebUI's styling.
  - The admin section offers every action and setting the Operator page offers today and calls the same routes.
  - Connected clients show each client's id with its operating system where the user agent names one, its type, address, and connection time, and the three counts, without the session id.
  - The tray's Open ReelRoulette opens the WebUI's main page, and the recovery page is titled "ReelRoulette Recovery".
  - The interface names the logs section Log Viewer in the admin section and the recovery page, and nowhere Server Logs; the route is still `GET /control/logs/server`.
  - The Log Viewer filters by time window, by several sources and several levels, and by contained text, with its filters in a collapsed panel with chips, a live indicator that pauses away from the newest lines, and rows that expand to the full line.
  - The Log Viewer has no Tail lines field: it shows the newest matching lines and loads older ones as the list scrolls, up to 5000 lines.
  - In the admin section, one Download click and one confirmation start the update download.
  - An admin settings field with a value the server would not accept, such as the port, is flagged with the field validation pattern as it is typed, and its Save can't proceed until it is corrected.
  - From another machine, opening admin asks for the control token first, and nothing in the admin section is shown until a valid token is entered; on the server machine it opens without one.
  - With the WebUI's files removed, the recovery page restarts, stops, shows logs, and checks, downloads, and applies updates.
  - The recovery page renders settings, status, and log text without `innerHTML` interpolation.
  - `/operator` reaches the admin section, and the packaged Linux server smoke passes against the recovery page.
  - With the web runtime settings' `enabled` stored or posted as off, the server still serves the WebUI and `/runtime-config.json`, allows the WebUI's CORS origins, and, with remote connections and mDNS on, advertises over mDNS after a restart, and it reports `enabled` as on.
  - Neither the admin section nor the desktop Settings dialog shows an Enable Web UI switch, and `enabled` is still in OpenAPI.
- **Verification evidence**:
  - Completion evidence must include admin section UI tests for the admin icon opening the full-page view, Auto-Pause on opening and leaving it in each mode, loading status and settings, saving settings, settings fields with the field validation pattern, the testing panel, the Log Viewer's filters and loading older lines, and control-token gating in `npm run verify`, server tests for the log route's level, source, and time filters, server tests that the recovery page is served without WebUI assets and keeps control-token gating, server tests that a stored or posted `enabled` of off is ignored and reported as on, a desktop test that the Settings dialog has no Enable Web UI switch, `dotnet test ReelRoulette.sln`, and `./tools/scripts/verify-linux-packaged-server-smoke.sh`.
  - Server tests call the handlers and gating as functions over `DefaultHttpContext`, as the library route gate's tests do. No test project has an HTTP test host, and `Microsoft.AspNetCore.TestHost` is not added (decided at promotion).
  - Add a Release Specific checklist item: "From another machine, the admin section asks for the control token and works after it is entered; with the WebUI files removed, the recovery page restarts, stops, shows logs, and applies an update, on Linux and Windows."

### M12j - Admin Refresh, Backup, and Duplicate Review

- **Status**: ⏳ Planned
- **Goal**: The admin section starts a refresh, edits refresh and backup settings, and reviews and applies duplicates, so none of these needs the desktop.
- **Scope**:
  - Ships in v0.15.0, after the WebUI admin section milestone. Depends on: WebUI Admin Section.
  - Measured again at promotion: only the desktop calls `POST /api/refresh/start`, `/api/refresh/settings`, `/api/backup/settings`, `/api/duplicates/scan`, and `/api/duplicates/apply`. The routes exist, so this needs no contract change. The tray can also start a refresh.
  - Gated like the rest of the admin section.
  - Refresh slice: Refresh Now with the refresh status, and the refresh settings the desktop Settings dialog shows: auto-refresh and its interval (5–1440 minutes), forced loudness and duration rescans on the next refresh, and fingerprint scan parallelism (1–16). The ranges are the ones the server already clamps to (read from code at this edit).
  - Backup slice: server backups on or off, the time between backups (1–10080 minutes), the number kept (1–100), and the days of daily backups kept (0–365, where 0 keeps none by date). The first two ranges are the server's clamps, as above.
  - Daily retention, in the backup slice: on top of the existing count limit, catalog backup rotation keeps one backup per date for a number of days set in the server's backup settings. It applies to current- and older-version backups alike, so older-version backups, which rotation keeps and does not count today, age out with their dates. Newer-version backups and files rotation does not recognize are never touched. The days setting adds a field to the backup settings, a contract change that only adds.
  - Trap: the refresh and backup settings routes assign every field from the posted snapshot, so a partial post writes defaults (Server Robustness Findings; still the case at promotion). Until that is fixed, the admin section posts the full settings it read.
  - The refresh and backup fields use the field validation pattern from WebUI Responsive Layout and Panels: a value outside the range the server enforces is flagged as it is typed, and Save can't proceed while one is.
  - Duplicate review slice: scan the whole library or one source, show each group with thumbnails and the comparison details the desktop shows (file name, plays, tags, favorite, blacklisted), choose Keep All or a file to keep per group, default to Keep All or Select Best from a per-device preference, and delete the files not kept from disk after a plain confirmation that says so and names the groups and files to delete, as the desktop's does, without the desktop's step of typing DELETE (decided in WebUI Design Mockup). The preference is chosen in duplicate review rather than the Settings tab, since nothing else uses it, starts at Keep All as on the desktop, and survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds. It opens within the admin section's full-page view, not as a panel tab.
  - Add a Release Specific checklist item: "From the admin section, start a refresh, change refresh and backup settings, and scan and apply duplicates with Keep All and with a chosen file, and the library updates."
- **Acceptance criteria**:
  - Refresh Now starts a refresh, and the status line shows its progress and result.
  - Refresh and backup settings load and save, and saving one field leaves the others as they were on the server.
  - Each refresh and backup field accepts the range the server enforces, and the days of daily backups accept 0 to 365, where 0 keeps none by date.
  - A refresh or backup value outside its range is flagged with the field validation pattern as it is typed, and Save can't proceed until it is corrected.
  - With daily retention set to a number of days, rotation keeps the count limit's newest current-version backups plus the newest backup of each date in that window, current-version or older-version, and deletes older-version backups whose dates fall outside it.
  - Newer-version backups and unrecognized files in `backups/` are byte-identical after rotation, with daily retention on or off.
  - Duplicate review opens within the admin section.
  - Duplicate apply deletes only the files not kept, from disk, after a confirmation that names the groups and files to delete and asks for nothing to be typed, and Keep All deletes nothing in that group.
  - The duplicate default is chosen in duplicate review, starts at Keep All, is kept per device, and survives a page refresh.
- **Verification evidence**:
  - Completion evidence must include admin section UI tests for each slice, including the duplicate default surviving a page refresh and each refresh and backup field with the field validation pattern, `npm run verify`, and one quick spot check of a refresh and a duplicate scan.

### M12k - Admin Source and Item Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources and remove library items from the WebUI admin section, with server routes for what no client can do today, and every open WebUI follows source changes without a reload.
- **Scope**:
  - Ships in v0.15.0, after the admin refresh, backup, and duplicate review milestone. Depends on: WebUI Admin Section.
  - Gated like the rest of the admin section: localhost, or the control token from other machines. The accounts release later moves this behind admin accounts.
  - Today the desktop Manage Sources dialog shows Rename and Remove buttons and the grid shows Remove from Library, but none of them has a server route; v0.14.0 hides them, and the frozen desktop keeps them hidden. Checked at promotion: the routes are still missing and the three controls are still hidden.
  - Contract slice: server routes to rename a source, remove a source (its items leave the catalog; files stay on disk), and remove items from the library, with the delete-from-disk option the desktop remove dialog offers. OpenAPI and generated WebUI types.
  - Manage Sources slice: list sources with the statistics the desktop dialog shows (total media, videos, photos, total duration, and videos with and without audio), add a folder, rename, remove, enable and disable, and refresh. Folder import, enable and disable, and refresh routes already exist. Read from code at promotion: the per-source statistics already come from the `sources` list of `GET /api/library/stats`, so they need no contract change, and the refresh route takes no source id. So the list has one Refresh for all sources, not one per source. Duplicate review is Admin Refresh, Backup, and Duplicate Review.
  - Adding a folder takes a path on the server machine. A browser folder picker returns paths on the browser's machine (inferred), and the desktop's Import Folder has the same flaw today: it sends its own folder picker path to the server (read from code), so it only works on the server machine. Decided in WebUI Design Mockup: the admin section takes a plain typed path, with no autocomplete or folder browser, and the server checks it as it is typed: a folder on the server that is not already a source. Inferred: the check is a new admin-only route in the contract slice, a contract change that only adds.
  - The item removal route also serves bulk removal in WebUI Multi-Select and Bulk Actions.
  - Source and item changes publish events so connected clients update. Read from code at promotion: only enabling or disabling a source publishes one (`sourceStateChanged`), and `POST /api/sources/import` publishes nothing, so import gets an event here too.
  - WebUI source sync slice, folded in from WebUI Source State Sync at promotion: the server already applies source state (list query, random selection, and item play only use enabled sources), and the WebUI keeps no source authority of its own; its source checkboxes are a filter choice. Checked at promotion: the WebUI ignores `sourceStateChanged` and reads `GET /api/sources` only when the filter dialog loads its data. On a source event, reload the loaded library window, keeping the scroll position as the desktop does, and refresh the Filter tab's source list.
  - Not included: per-user source visibility, which is Per-User Source Permissions.
- **Acceptance criteria**:
  - From the admin section, sources can be added by server path, renamed, removed, enabled, disabled, and refreshed, with per-source statistics, and one Refresh covers the whole list.
  - A typed path that is not a folder on the server, or is already a source, is flagged with the field validation pattern as it is typed, and adding can't proceed until it is corrected.
  - Removing a source removes its items from the catalog and leaves its files.
  - The item removal route removes items with and without deleting from disk.
  - Adding, renaming, removing, enabling, or disabling a source from the admin section or the desktop updates every open WebUI's library window and Filter tab source list without a reload.
  - Removing items updates connected WebUI sessions through events and list requery.
  - New routes are in OpenAPI, and `npm run verify:contracts` passes.
- **Verification evidence**:
  - Completion evidence must include server tests for each new route and for the event each source change publishes, admin section UI tests for Manage Sources, WebUI tests for source event handling, `dotnet test ReelRoulette.sln`, `npm run verify`, and one quick spot check of an admin section source toggle seen in another WebUI tab.
  - Add a Release Specific checklist item: "From the admin section, add, rename, disable, refresh, and remove a source, and other open WebUI sessions update without a reload."

### M12l - Admin Library Catalog Transfer

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
  - Add **Export Library** and **Import Library…** to the admin section. Export is a plain download in every browser, with no save picker, so it has no ellipsis. While an import uploads, a progress bar shows in the library transfer section. The file uploads first; the server then reads its source folders for the remap dialog, or rejects a file that isn't a library with the notice "{file} isn't a ReelRoulette library. The library wasn't changed." (decided in WebUI Design Mockup). Desktop Client Removal removes the desktop's Library Export and Import menus.
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

### M12m - WebUI Stats Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI shows library and playback statistics and details of the current file in a Stats tab, as the desktop stats panel does.
- **Scope**:
  - Ships in v0.15.0, after the admin library catalog transfer milestone. Depends on: WebUI Responsive Layout and Panels.
  - Measured again at promotion: the WebUI never calls `GET /api/library/stats`, and its now-playing line shows only the file name and duration.
  - Library and current-file stats live in the side panel's Stats tab, which joins the tab row here. Clicking the current file name in the header opens the panel on the Stats tab. Its tooltip shows the full file name and then "Show stats" (decided in WebUI Design Mockup); today it shows the full name only.
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

### M12n - WebUI Keyboard Shortcuts and Player Controls

- **Status**: ⏳ Planned
- **Goal**: The WebUI has the desktop's keyboard shortcuts wherever a browser allows them, plus volume, seek-step, and frame-step controls, two autoplay modes, and ambient mode.
- **Scope**:
  - Ships in v0.15.0, after the WebUI stats panel milestone. Depends on: WebUI Responsive Layout and Panels, WebUI Settings Panel, and WebUI Stats Panel, so every panel tab exists.
  - Measured again at promotion: the WebUI handles only Escape, which closes overlays, and Enter or Space on a focused library tile. It has a mute button and no volume control. The desktop binds K play or pause, J and L seek, Left and Right previous and next, R random, F favorite, B blacklist, A autoplay, M mute, comma and period volume, T tags, P player view, S settings, O import folder, Q quit, F11 fullscreen, and 1 to 5 to show or hide parts of the window; it also swallows 6 to 8 and Space, which do nothing.
  - Use the desktop keys. Keys the browser keeps (Ctrl+Q, Ctrl+O, and F11 for the browser's own fullscreen; inferred) are not bound, and Q quit and O import folder have no WebUI equivalent. Each panel tab has a shortcut: Library, Filter, Tags, Stats, and Settings. Which key opens each tab (the desktop's T for tags and S for settings, or the number keys it uses to show and hide parts of its window) is decided here. Shift+F enters and leaves fullscreen, since F stays Favorite. Space plays or pauses as K does, and pauses and resumes a photo's timer, except while focus is on something Space already activates, such as a button or a library tile (both decided in WebUI Design Mockup).
  - Shortcuts do nothing while focus is in a text field.
  - A shortcut reference in the Settings tab.
  - A volume control where the browser lets a page set volume (not on iOS, where it is read-only; inferred), with [ and ] stepping by a volume step preference. The desktop steps volume with comma and period, which step frames here instead. The Settings tab offers the desktop's volume steps: 1, 2, or 5 percent.
  - J and L seek by a seek step preference. The Settings tab offers the desktop's seek steps: 1, 5, or 10 seconds.
  - The fullscreen button shows the exit icon (`fullscreen_exit`) while the stage is in fullscreen or pseudo-fullscreen; today it always shows `fullscreen`. Changing the volume, by the slider or the keys, writes nothing to the status line. Changing the timer while a photo shows keeps the time already shown and changes only the length; today it restarts the photo (`photoDurationChanged` in `src/playback/player.ts`). All decided in WebUI Design Mockup.
  - Frame stepping, as YouTube does it (decided in WebUI Design Mockup): while a video is paused, comma steps one frame back and period one frame forward. It uses the browser's frame timings (`requestVideoFrameCallback`) where the browser provides them, and an assumed frame rate, decided when this is built, where it doesn't. It replaces the desktop's Frame seek step (Shift and the arrow keys), which LibVLC drives.
  - Autoplay gets two modes, replacing the desktop's separate Keep Playing, which plays a random item every N seconds until stopped (Playback → Keep Playing (Timer) and Set Interval):
    - Normal: photos advance after the timer and videos play to the end, as autoplay does today.
    - Timer: every item advances after the timer, including a video that has not finished. With loop on, a video shorter than the timer repeats until the timer advances. Pausing a video holds the timer.
    - With loop on in Normal mode, the current item repeats and autoplay waits, as today. Read from code at this edit: the WebUI's video end handler and photo timer both skip advancing while loop is on.
    - Both modes use one timer setting, today's photo duration, renamed to fit (for example "Advance after"). Its range widens from the WebUI's 1–300 seconds to the desktop's 1–3600, so a Keep Playing interval longer than five minutes still fits. The mode and the timer sit together in the Settings tab, and the player's autoplay button still turns autoplay on and off.
  - A looping photo flickers at the end of each loop, because it is restarted by reloading its image, unlike a video, which seeks back. Read from code at this edit: the photo timer calls `playCurrent`, which clears the photo's source and hides it, then loads it again, records a play, and relays a new start; turning Loop or Autoplay on while a photo shows goes through the same restart. Keep the photo on screen and restart only its timer, in both cases. A looping photo then records one play, as a looping video does, and the Player screen tests that count a play per loop change with it.
  - Ambient mode, as YouTube's (decided in WebUI Design Mockup): behind the player, a heavily blurred, dimmed copy of the current frame's colors fills the black space around the picture. At the update rate the player draws the frame into a tiny canvas, and the glow fades toward each new copy over the fade time, so the colors drift smoothly. A photo gets the same effect, drawn once from the photo. Sampling pauses while the video is paused or the tab is hidden. The glow sits on the player's dark background in both themes, so the light theme uses full color too, and each theme has its own strength, the same kind of setting in both (decided in WebUI Design Mockup). With ambient mode off, the space is plain black in both themes, as today.
  - Ambient mode's settings ship with it (decided in WebUI Design Mockup): an Ambient mode toggle, on by default, in the Settings tab's Appearance section, and beside it an expandable "Ambient mode settings" section, whose header shows a chevron that points right while it is closed and down while it is open, with plain labels, each showing its value: Update rate (1 per second by default, from 0.25 to 4), Fade time (2 s, from 0.25 to 4 s), Blur (64 px, from 10 to 80 px), Strength in the dark theme (50%), Strength in the light theme (75%), and Saturation (100%, from 0 to 200%), with a Reset to defaults button. They apply as they change and are kept per device.
    - Trap, found in the mockup's first version, with the cause inferred: two layers crossfading by CSS opacity flickered slightly, since the black background showed through whenever a sample arrived before the last fade finished. The shown canvas blends toward each new sample instead, starting from what is on screen, so a sample that arrives mid-fade continues smoothly.
    - Trap, inferred: media URLs come from the runtime config's `apiBaseUrl`, which can be another origin, and drawing a cross-origin video taints the canvas. Showing a tainted canvas still works, since the effect never reads its pixels back, so it must not use `getImageData` or `toDataURL`.
  - Hide player controls, a Settings tab entry in its Playback section, kept per device (decided in WebUI Design Mockup):
    - Timeout, the default: the controls hide after a set time with no activity. Moving the mouse or tapping shows them and restarts the countdown. They stay visible while the pointer is over them and while the scrub bar or volume is being dragged. While Timeout is chosen, two settings show under it: Hide after, 1 to 30 seconds and 3 by default, using the field validation pattern; and Keep visible while paused, on by default.
    - On click/tap: clicking or tapping the player shows or hides them, as today.
    - Never: the controls stay visible.
    - Read from code at this edit: the controls start visible and a click or tap on the player toggles them (`controlsVisible` in `src/ui/Player.tsx`, `toggleControls` in `src/playback/mediaGestures.ts`). There is no timeout, and hidden controls can still be pressed, since only their container ignores the pointer (`.overlay-controls` in `src/styles.css`).
  - The autoplay mode, the timer, ambient mode and its settings, Hide player controls and its two settings, the volume, and the volume and seek steps survive a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.
  - Not included: loudness normalization, declined for v0.15.0 in WebUI Design Mockup, which is WebUI Loudness Normalization.
  - Changes to user-facing UX need approval.
  - Add a Release Specific checklist item: "In Chrome, Firefox, and Safari on a desktop, every listed shortcut works in normal view, with a panel open, and in fullscreen, and does nothing while typing in a text field."
  - Not included: rebinding, which is Customizable Keyboard Shortcuts.
- **Acceptance criteria**:
  - Each bound shortcut does what the desktop's does.
  - Each panel tab's shortcut opens the panel on that tab.
  - Shortcuts are ignored while a text field has focus.
  - The volume control and seek step work, and the Settings tab offers the desktop's volume and seek step choices.
  - [ and ] change the volume by the volume step. While a video is paused, comma and period step one frame back and forward; while it plays, they do nothing.
  - Shift+F enters and leaves fullscreen.
  - Space plays or pauses as K does, and leaves a focused button or tile to its own action.
  - In Normal mode, photos advance after the timer and videos play to the end. In Timer mode, every item advances after the timer, including an unfinished video, and a paused video holds it.
  - With loop on in Timer mode, a video shorter than the timer repeats until the timer advances. With loop on in Normal mode, the current item repeats and does not advance.
  - A looping photo does not flicker: it stays on screen with its image loaded at the end of each loop, and only its timer restarts.
  - The Settings tab shows the autoplay mode and the timer under its new name, the timer accepts 1 to 3600 seconds, and it starts from the photo duration stored before this milestone.
  - With ambient mode on, a blurred, dimmed copy of the frame's colors fills the black space around a playing video and crossfades as the picture changes, and a photo gets one from the photo. Sampling stops while the video is paused or the tab is hidden. Off, the space is plain black in both themes. The light theme uses full color at its own strength, and a sample that arrives mid-fade never lets the black background show through.
  - The Ambient mode settings section offers each setting with its default and range, shows each value, applies changes as they're made, and Reset to defaults restores the defaults.
  - With Hide player controls on Timeout, the controls hide after the Hide after time with no activity, moving the mouse or tapping shows them and restarts the countdown, and they stay while the pointer is over them, while the scrub bar or volume is dragged, and, with Keep visible while paused, while paused. On click/tap toggles them on a click or tap, and Never keeps them visible. Hide after accepts 1 to 30 seconds.
  - After a page refresh, the autoplay mode, the timer, ambient mode and its settings, Hide player controls and its two settings, the volume, and the volume and seek steps are each as they were.
  - The shortcut reference matches the bindings.
- **Verification evidence**:
  - Completion evidence must include keyboard tests per binding under `happy-dom`, autoplay tests for both modes with loop on and off and with a paused video, a test that a looping photo keeps its image shown through each loop, tests for a page refresh keeping each setting this milestone adds, frame stepping tests with and without the browser's frame timings, ambient mode tests for sampling at the update rate while a video plays, holding while it is paused or the tab is hidden, a photo drawn once, and each of its settings, controls tests for each Hide player controls mode, the countdown, and each thing that keeps the controls shown, `npm run verify`, and one quick spot check.

### M12o - Show in File Manager from the WebUI

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

### M12p - WebUI Status Line Overhaul

- **Status**: ⏳ Planned
- **Goal**: The WebUI status line shows only background information, one stable message per situation, and what the user must notice or act on moves to an in-app dialog or the field it is about.
- **Scope**:
  - Ships in v0.15.0, after the Show in File Manager from the WebUI milestone. Depends on: WebUI Responsive Layout and Panels, whose field validation pattern the field messages move to, WebUI In-App Dialogs, whose notice the dialog messages move to, and Catalog Open and Backup Safety, whose 503 message the status line shows.
  - Moved here from v0.14.0 when the desktop was frozen. The desktop half and the shared fixture are dropped, and the status line moves with the panel layout.
  - Observed in the v0.13.0 manual regression pass: with the server stopped, the WebUI shows "library load failed: HTTP 503" only briefly before "SSE reconnecting...". The desktop alternates between "core runtime unavailable" and "core runtime is required to browse the library", and stays as it is. Not re-run at promotion, since it needs a running server; the v0.14.1 release notes still list the WebUI status line flipping between messages as a known issue.
  - Read from code at promotion: the WebUI's `fetchJson` throws `HTTP {status}` and drops the response body, so the server's library message in a 503 never reaches the status line.
  - Read from code when random picks got a timeout: the playing video's `playing` event sets the status to "Playing". On a connection where the video keeps buffering, that hides "Loading..." while a random pick waits and "No response from the server. Try again." after one times out. The precedence rule covers both.
  - Define one precedence rule for which message wins when several apply, so the status line never alternates.
  - Define the message for each event once: server stopped, API unavailable, the server running without a library (showing the server's message for each library state: newer, damaged, missing, or unreadable), version or capability mismatch, and refresh progress and results.
  - The WebUI's message rule, status line side: the status line is only for background information that shouldn't interrupt the user, such as connection state, refresh progress, and sync notices. Anything the user needs to notice or act on shows in the in-app dialog, as WebUI In-App Dialogs sets out, and field problems use the field validation pattern from WebUI Responsive Layout and Panels.
  - Every status line message, read from code at this edit (`src/state/serverConnection.ts`, `src/state/serverCompatibility.ts`, `src/events/refreshStatusProjection.ts`, `src/playback/player.ts`, `src/library/library.ts`, `src/library/libraryPlayModel.ts`, `src/library/libraryQuerySession.ts`, `src/filter/filterDialog.ts`, and `src/tags/tagEditor.ts`), sorted by the rule:
    - Background, stays on the status line:
      - Connection: "Ready", "Ready (API {version})", "Ready (API offline)", "SSE connected", "SSE reconnecting...", "Error loading presets: {error}", and a version or capability mismatch: "Unsupported server API version: {version}.", "Server requires client API version {version} or newer.", and "Server missing required capabilities: {list}.".
      - Refresh: "Core refresh: {stage} ({percent}%)", the "Core refresh complete | …" summary, "Core refresh failed: {error}", and "Core refresh idle.".
      - Sync notices: "Synced: Added to favorites: {file}", "Synced: Removed from favorites: {file}", and "Synced: Blacklisted: {file}".
      - Playback progress: "Loading..." and "Playing".
      - The library window: "Library load failed: {error}", which the library also shows in its body, and "Library browse failed. Showing the tiles already loaded.".
      - Acknowledgments of the user's own actions that ask nothing more of them: "Added to favorites", "Removed from favorites", "Blacklisted", "Removed from blacklist", "Filters applied.", "Filter data refreshed.", "Updated preset "{name}" locally — Apply to save.", "Paired.", and "Tag editor changes applied". They are not the rule's confirmations, which are prompts that ask before an action.
    - A dialog, moves to the in-app notice:
      - Playback: "Cannot play: server compatibility check failed.", "No response from the server. Try again.", "Random selection failed ({status}).", "Random selection failed: {error}", "No eligible media for current filters.", "Video file not found.", and "Photo file not found.".
      - Library play: "Playback unavailable: no library item was selected.", "Media not found. The file may have moved or been deleted.", "This item is unavailable.", "This file type is not supported.", the server's error text, "Playback failed.", and "Playback failed: {error}".
      - Favorite and blacklist: "Favorite update failed ({status})." and "Blacklist update failed ({status}).".
      - Filter: "Filter dialog load failed: {error}", "Filter refresh failed: {error}", "Saving presets failed ({status}).", "Saving presets failed: {error}", "Select a preset to update.", and "Preset not found.".
      - Pairing: "Pairing blocked by server compatibility check." and "Pairing failed.".
      - Tags: "Tag editor unavailable: {error}", "Tag refresh failed: {error}", "No tag changes to save.", and a failed tag save: "{step} failed ({status})" for Category update, Category delete, Tag create/update, Tag rename, Tag delete, Tag apply, and Auto-tag apply, "Tag update failed", "Tag apply failed", or the error's text.
    - Field validation, moves to the field validation pattern:
      - Moved by earlier milestones, which this milestone checks are gone from the status line: "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.", "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.", "Enter a preset name.", "A preset with that name already exists.", "Tag name is required.", and "That name is already in use." in WebUI Responsive Layout and Panels.
      - Moved here: "Pair token required.", for the pairing prompt's token field. Pair can't proceed while the field is empty, and the field's tooltip reads "Enter the pairing token." (decided in WebUI Design Mockup).
    - Leaves the status line with nothing in its place: "Unauthorized. Pair first.". A random pick or library play that the server answers with 401 also shows the header's pairing prompt, which is the thing to act on, so the prompt is the only signal (read from code at this edit: `pickRandom` in `player.ts` and `play` in `library.ts` set the prompt just before the message; the 401 case in `mapPlayItemErrorToStatus` is never reached, since `play` handles 401 first). It keeps its `last.log` line.
  - Three wrong Auto Tag and tag save messages, found in the WebUI Preact Migration's tag editor slice, which kept them as they were and locked them with tests marked as recorded here (read from code at this edit):
    - A failed Auto Tag scan shows "Scan complete: no matching tags found." in the panel's status and results, as a scan that found nothing does: `scan` in `src/tags/tagEditor.ts` treats a failure as no rows. Before that slice, `app.js` set "Auto-tag scan failed. Core runtime is unavailable or still recovering." and overwrote it at once. The scan shows its error instead.
    - A scan where every match already has its tag shows "No rows to show." and leaves the panel's status on "Scanning…": `autoTagStatusAfterChange` in `src/tags/autoTagModel.ts` keeps the status while no row shows. The status leaves "Scanning…" when the scan finishes.
    - A tag save that cannot reach the server shows the message of the last step the server refused on the page, or "Tag apply failed" when none was: `lastSaveError` in `src/tags/tagEditor.ts` lasts for the page. The save shows its own error.
  - A message that moves to a dialog keeps its `last.log` line with the same text, as the notice in WebUI In-App Dialogs is relayed. A field message is no longer relayed.
  - Status line messages added by the milestones after this edit follow the rule from the start; this milestone checks them against it too.
  - The precedence rule and the per-event messages above cover the background messages only.
  - Add a Release Specific checklist item: "With the server stopped, unavailable, or mismatched, and during a refresh, the WebUI settles on one status message."
- **Acceptance criteria**:
  - With the server stopped, unavailable, or mismatched, the status line settles on one message and does not alternate.
  - With the server running without a library, the status line shows the server's message.
  - Refresh status reads the same during and after each refresh.
  - The precedence rule and the per-event messages are documented.
  - The status line shows only the messages sorted as background, including those added since this edit.
  - Each message sorted as a dialog shows in the in-app notice with the same wording, not on the status line, and its `last.log` line is unchanged.
  - An empty pairing token is flagged with the field validation pattern once typed in and emptied, Pair can't proceed while it is empty, and "Pair token required." no longer shows; none of the field messages moved by earlier milestones shows on the status line.
  - A random pick or library play answered with 401 shows the header's pairing prompt, shows "Unauthorized. Pair first." neither on the status line nor in a dialog, and relays its `last.log` line as before.
  - A failed Auto Tag scan shows its error instead of "Scan complete: no matching tags found.".
  - A scan where every match already has its tag clears "Scanning…".
  - A tag save that fails on a network error shows that error, not one from an earlier save.
- **Verification evidence**:
  - Completion evidence must include WebUI tests of the precedence rule and the per-event messages, covering the server stopped, the API unavailable, a version or capability mismatch, and refresh progress and results, tests that each screen's dialog messages show in the notice with their `last.log` lines and its background messages stay on the status line, tests of the pairing token field and of a 401 on a random pick and a library play, tests of the three Auto Tag and tag save messages in place of the tests that lock them today, a check of every status line write against the sorted list, and one quick spot check with the server stopped.

### M12q - Testing Suite Overhaul

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

### M12r - Browser-Playable Filter

- **Status**: ⏳ Planned
- **Goal**: Browse and random play can be limited to files a browser can play, and a file the browser cannot play says so instead of "not found".
- **Scope**:
  - Ships in v0.15.0, after the testing suite overhaul milestone. Depends on: WebUI Preact Migration, and WebUI Status Line Overhaul, whose precedence rule the new message follows.
  - Accepted gap until playback sessions: browsers cannot play every format LibVLC plays on the desktop. Re-measured at promotion on a copy of the developer's catalog, by file extension: 17,423 videos, of which 16,611 are mp4, 533 mkv (3.1%), 225 avi, and 54 wmv. The codecs inside the files were not measured. Tested by the user: avi and wmv files from that library fail in the WebUI. mkv plays in Chrome and Firefox with common codecs but not in Safari or on iOS (inferred), and counts as browser-playable.
  - The server decides playability from one documented container profile, so browse, random play, and counts agree. The profile lists the playable video containers, starting with mp4, m4v, webm, and mkv; any other video container, including avi and wmv, is not browser-playable. Photos are always playable. Codec-level detection waits for the probe in Server Playback Decision Engine.
  - Contract slice: a browser-playable option in the filter state, applied by the server in the list query, its counts, and random selection. OpenAPI and generated WebUI types; it only adds a field.
  - WebUI slice: the option in the Filter tab's general filters and in presets, off by default so current behavior does not change. Turning it on by default needs approval.
  - Error message slice: when the browser cannot play a file, the WebUI's status line says "Video file not found." ("Photo file not found." for photos) whatever the cause, though the file exists (reported by the user). Read from code at promotion: both come from the media element's error handlers, now `videoFailed` and `photoFailed` in `src/playback/player.ts`. Say that the format is not supported in this browser when that is the cause, and "not found" only when the file is missing.
  - When autoplay, Next, Previous, or a random pick reaches a file this browser can't play, or one that is missing, the player skips on to the next item in the same direction and says so on the status line, as background information under WebUI Status Line Overhaul's rule, instead of stopping on the message (decided in WebUI Design Mockup). The mockup words them "Skipped a file this browser can't play." and "Skipped a missing file." A file the user chose from the library still shows its message. WebUI Status Line Overhaul moves "Video file not found." and "Photo file not found." to the notice; after this milestone only a file chosen from the library shows it.
  - Trap, inferred: a browser reports a missing file (a `404` from `/api/media`) and an unsupported format with the same `MEDIA_ERR_SRC_NOT_SUPPORTED` code, so the error code alone cannot tell them apart. Use the item's container against the profile, or ask the server whether the file exists.
  - Trap, inferred from how presets are saved: until Per-Preset Preset Writes, the desktop posts the whole preset list, and the frozen desktop does not know the new field, so a desktop preset save drops the option from every preset. Decide here whether the server keeps a stored option the desktop did not send, or documents the loss. Checked at promotion: the desktop still posts the whole list to `POST /api/presets`.
  - Preset equality is locked to `preset-filter-equality.json`, which the desktop tests also read (still the case at promotion). New cases for the option must pass there too, or go in a WebUI-only fixture until the desktop is removed.
  - Add a Release Specific checklist item: "With the browser-playable filter on, browse and random play show no avi or wmv files; with it off, playing one says its format is not supported in this browser, and a deleted file says not found."
- **Acceptance criteria**:
  - With the option on, the list query, its counts, and random selection exclude videos outside the profile; with it off, results are unchanged.
  - The option is saved in presets and compared in preset matching.
  - A file the browser cannot play shows a format-not-supported message, and a missing file shows not found.
  - Autoplay, Next, Previous, and random picks skip a file this browser can't play or one that is missing, and say so on the status line; a file chosen from the library shows its message instead.
  - The profile is documented in `docs/api.md`.
- **Verification evidence**:
  - Completion evidence must include server tests for the option in the list query, counts, and random selection, contract tests, WebUI tests for the option and both error messages, `dotnet test ReelRoulette.sln`, and `npm run verify`.

### M12s - WebUI Grid Rendering

- **Status**: ⏳ Planned
- **Goal**: The WebUI library grid updates only the rows and tiles that change, and dragging the scrollbar reaches any part of the results without loading every page before it.
- **Scope**:
  - Ships in v0.15.0, after the browser-playable filter milestone. Depends on: WebUI Responsive Layout and Panels, so it is built in the Preact Library tab, whose width changes whenever the side panel is resized.
  - Found by the efficiency and divergence report from code reading, and confirmed in the code at promotion: each change of visible rows replaces the rows' HTML through `innerHTML`, which recreates every tile image. Each patch and each appended page rebuilds the layout and virtualizer for every loaded item, so loading a window page by page costs time that grows with the square of its size.
  - Measured at promotion, in Node 24 on the development machine with the layout and virtualizer modules alone (no DOM): one full rebuild takes 0.5 ms for 10,000 items at 1,400 px wide and 1.2 ms at 390 px, and 2.7 to 7.8 ms for 49,000. Loading 10,000 items in 200-item pages spends 13 to 32 ms in total on rebuilds, and 49,000 spends 355 to 953 ms over 245 pages, about 1.5 to 4 ms per page. The growth is real but small. Replacing the rows' HTML, the likely cause of the iPad flicker below, was not measured.
  - Seen on an iPad with the WebUI installed as an app: the grid flickers dark each time it re-renders its visible rows while scrolling, about seven times for a screen-height drag in landscape with three to four rows on screen. Desktop browsers and Firefox on Android are fine. Each re-render rebuilds every visible row's HTML, including images that were already showing. Not re-measured at promotion, since it needs the device.
  - Seen in desktop browsers in the WebUI Preact Migration's library overlay spot check, and the same in the WebUI before that migration: after a hard refresh (Ctrl+F5), which bypasses the image cache, the grid flickers when it opens and on every scroll, because each row rebuild requests its thumbnails again. Desktop browsers are fine only while the thumbnails are cached.
  - Keep row elements that stay visible, add and remove only the rows that enter or leave, and update a patched tile in place. Grid rows stop going through `innerHTML`; the Preact migration's library overlay keeps the grid controller's row HTML until this milestone.
  - Size the grid to the full result count with placeholder tiles, and load the page at the scroll position, so dragging the scrollbar far down works without scrolling through every page.
  - Trap, inferred from code: the row layout depends on each item's thumbnail aspect ratio, so placeholder tiles for items not loaded yet use fallback ratios, and rows can change when their page arrives and shift what is on screen.
  - Apart from placeholder tiles and loading the page at the scroll position, grid layout, scrolling, focus, and tile behavior stay as they are.
  - Not included: extending the layout for appended pages instead of rebuilding it, dropped at promotion because a rebuild measured a few milliseconds per page.
  - Add Release Specific checklist items: "On an iPad with the WebUI installed as an app, scrolling the library grid a screen height in landscape shows no flicker." and "In a desktop browser, after a hard refresh (Ctrl+F5), opening the library and scrolling the grid shows no flicker."
- **Acceptance criteria**:
  - Scrolling keeps the image elements of rows that stay visible.
  - A favorite, blacklist, playback, or tag patch updates only the affected tile.
  - No grid row is rendered through `innerHTML`.
  - Layout results match the current layout for the same items and width.
  - Dragging the scrollbar far down loads the page at that position without loading the pages before it.
  - Scrolling the grid on an iPad with the WebUI installed as an app shows no flicker.
  - After a hard refresh (Ctrl+F5) in a desktop browser, opening the library and scrolling the grid shows no flicker.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for row reuse, tile patching, and loading the page at a scrollbar position, before-and-after timings for rendering a large window in a browser, and `npm run verify`.

### M12t - WebUI Multi-Select and Bulk Actions

- **Status**: ⏳ Planned
- **Goal**: The WebUI selects several library items and applies the desktop's bulk actions to them, and clears playback stats for the whole library.
- **Scope**:
  - Ships in v0.15.0, after the WebUI grid rendering milestone. Depends on: Admin Source and Item Management, whose item removal route bulk removal uses, and WebUI Grid Rendering, which updates a tile in place, so selection marks are tile updates.
  - From the desktop-versus-web feature comparison and the desktop retirement report, checked against the code at promotion. Adding a feature changes user-facing UX and needs approval.
  - Multi-select and bulk actions: the desktop library grid selects several items (click, Ctrl+click, Shift+click) and acts on them from its context menu: add to or remove from favorites and the blacklist, add or remove tags, clear playback stats, and remove from library. The WebUI library plays one item per click and has no selection.
  - Selection works as Google Photos does, with one icon throughout: a white circle with a check mark at the tile's top left (decided in WebUI Design Mockup). With a mouse it shows faded while the pointer is over a tile, and on every tile once selection is active; with the pointer on the icon itself it turns bright white, and clicking it selects the tile and starts selection. Selecting a tile turns the same icon filled orange, and the thumbnail shrinks inside the tile so the icon sits on its top-left corner. Hovering dims only the thumbnail, so the icon stays bright. On a touch screen a long press starts selection, and the icons then show on every tile.
  - Once selection is on, a click adds or removes a tile, and Shift+click adds the range from the last tile chosen. Ctrl or Cmd+click isn't used. The grid's text isn't selectable, so Shift+click selects only tiles and doesn't also highlight text across them. While selecting, a bar at the bottom of the Library tab shows the count, Select all, and Actions, which lists the bulk actions (decided in WebUI Design Mockup).
  - Selection starts only from a tile's check icon or, on a touch screen, a long press, and the Library tab has no Select button. Deselecting the last tile ends selection, and so does removing the selected items from the library (decided in WebUI Design Mockup). Keyboard users reach a tile's check icon with Tab, which WebUI Keyboard Navigation and Focus builds later in v0.15.0; until then keyboard users can't start selection, which is accepted since both ship in v0.15.0 (decided in WebUI Design Mockup).
  - Remove from library is an admin action. From another machine it asks for the control token first, as the admin view does. It then asks to confirm, naming the count. Deleting the files from disk is an option there, off by default, and when it is on the question says the files will be permanently deleted from disk (decided in WebUI Design Mockup).
  - Trap, read from code at promotion: `POST /api/favorite` and `POST /api/blacklist` take one item path each, and the desktop sends one request per selected item, while `POST /api/playback/clear-stats` takes a list of item paths and `POST /api/tag-editor/apply-item-tags` a list of item ids. Decide here whether bulk favorite and blacklist get a route that takes many ids, a contract change in its own slice, or send one request per item as the desktop does.
  - Tag edits on several items: the desktop `ItemTagsDialog` adds and removes tags across all selected items at once; the WebUI tag editor works on the current item only.
  - The WebUI edits several items' tags in the Tags tab, with no dialog (decided in WebUI Design Mockup). Edit tags in Actions opens the Tags tab with the line "Editing tags for {n} items", like the line WebUI Responsive Layout and Panels shows for an item that isn't playing. While the tab edits several items, a chip shows green for a tag all of them have and orange for a tag only some have, and Add or Remove applies to all of them. Save applies the changes to every selected item and says "Updated tags on {n} items.". The tab edits the selection while selection lasts; if selection ends with unsaved changes, it keeps those items until the changes are saved or discarded. Choosing Edit tags while the tab holds unsaved changes to another item's tags asks "Discard changes?" first.
  - Clear playback stats for the whole library, which the desktop offers from its Playback menu through `POST /api/playback/clear-stats` (measured again at promotion: the WebUI never calls it). It is an admin action, in the admin view's library section (decided in WebUI Design Mockup).
  - Each bulk action acknowledges itself on the status line (decided in WebUI Design Mockup): "Added {n} items to favorites.", "Removed {n} items from favorites.", "Blacklisted {n} items.", "Removed {n} items from the blacklist.", "Updated tags on {n} items.", "Cleared playback stats for {n} items.", and "Removed {n} items from the library.", or "Removed {n} items from the library and deleted their files.", with "1 item" for one.
  - Bulk Add to favorites clears each item's blacklisting, and Add to blacklist clears its favorite, as the player's buttons do. Read from code at this edit: `toggleFlag` in `src/playback/player.ts` clears the other flag when it sets one.
  - The desktop's filter summary line is built (decided in WebUI Design Mockup): while a filter applies, the Library tab shows one line above the grid listing the applied filters, as the desktop lists them above its library panel, and tapping or clicking it opens the Filter tab. It collapses with the Library tab's controls, and it names Favorites only or excluded and Blacklisted only, the modes from Favorite and Blacklist Filter Modes. Blacklisted excluded, the default, isn't named, as the desktop's summary doesn't name Exclude blacklisted today (decided in WebUI Design Mockup). The WebUI library's summary today shows only how many items are showing out of how many.
  - Settled at promotion: Keep Playing and loudness normalization moved to WebUI Keyboard Shortcuts and Player Controls, where autoplay's Timer mode has since replaced Keep Playing. The FFmpeg log is declined: nothing has written to the desktop's FFmpeg log buffer since the server took over refresh (read from code), so its window is always empty. The desktop features a browser cannot offer are recorded in Desktop Client Removal.
- **Acceptance criteria**:
  - The WebUI selects several library items and applies favorite, blacklist, tag add and remove, clear stats, and, for admins, remove from library to all of them.
  - With a mouse, a tile's check icon shows faded on hover and selects the tile when clicked; during selection it shows on every tile, and a long press starts selection on a touch screen. A selected tile's icon is filled orange and its thumbnail shrinks inside the tile.
  - The Library tab has no Select button, and deselecting the last tile ends selection.
  - Edit tags opens the Tags tab with "Editing tags for {n} items", with no dialog. Its chips show green for a tag every selected item has and orange for one only some have, and Save applies the changes to every selected item.
  - Once selection is on, a click adds or removes a tile and Shift+click adds a range without highlighting text; Ctrl or Cmd+click doesn't select.
  - The whole library's playback stats can be cleared from the admin view.
  - Remove from library asks to confirm with the count. Deleting files from disk is off by default, and turning it on makes the question say the files will be permanently deleted from disk.
  - Bulk Add to favorites clears blacklisting, and Add to blacklist clears favorite, on each selected item.
  - While a filter applies, the Library tab shows the filter summary line above the grid, and tapping or clicking it opens the Filter tab.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for selection and each bulk action, and `npm run verify`.
  - Add a Release Specific checklist item: "In the WebUI on a desktop browser and a phone, select several items, apply each bulk action, and the tiles update."

### M12u - WebUI Keyboard Navigation and Focus

- **Status**: ⏳ Planned
- **Goal**: Every part of the WebUI works from the keyboard alone, and keyboard focus is always visible, in the brand orange.
- **Scope**:
  - Placed after the milestones that build the screens it covers, the last of which is WebUI Multi-Select and Bulk Actions, whose check icons the grid's keyboard model uses, and before Desktop Retirement Notice, which stays last as the desktop's final build.
  - Ships in v0.15.0, after the WebUI multi-select and bulk actions milestone. Depends on: WebUI Responsive Layout and Panels, WebUI In-App Dialogs, WebUI Settings Panel, WebUI Admin Section, Admin Refresh, Backup, and Duplicate Review, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Stats Panel, WebUI Keyboard Shortcuts and Player Controls, Testing Suite Overhaul, WebUI Grid Rendering, and WebUI Multi-Select and Bulk Actions.
  - Read from code at this edit: only the pairing prompt, the tag editor, the library overlay's buttons, and the grid's tiles style their focus, in blue (`#7aa7ff`, and `#2563eb` for tiles in the light theme, in `src/styles.css`); other controls show the browser's own ring or none. Every grid tile is a tab stop (`tabindex="0"` in `renderGridTileHtml`, `src/library/libraryGridTileModel.ts`), and Enter or Space on one plays it.
  - The focus look (decided in WebUI Design Mockup): keyboard focus shows as one ring in the brand orange at a little transparency, in place of the browser's own, with no extra outline, and a mouse click shows none (`:focus-visible`). In the grid, as Google Photos shows it, a focused tile gets an orange border drawn above its thumbnail, and its focused check icon turns bright white inside a thick orange ring, which starts at the icon's visible edge with no gap, reaches about 22 px from its center, and is cropped by the tile.
    - Trap, found in the mockup: the thumbnail's frame fills the tile and paints over anything the tile itself draws, an outline or an inset shadow alike, so a focused tile's border there is invisible. The border is a layer of its own, after the frame.
  - The grid (decided in WebUI Design Mockup): the grid is one tab stop, and Tab enters it on the last tile focused, or the first. The arrow keys move between tiles, left and right in order and up and down to the nearest tile in the next row, without playing the previous or next item. Tab from a tile reaches its check icon, which shows as hovering shows it, and Space or Enter toggles it, starting selection as a click does, with focus staying on it. Tab again leaves the grid. Enter or Space on a tile still chooses it. Selection updates the tiles in place, as WebUI Grid Rendering patches a tile, so focus is never lost to a redraw.
  - Every other screen works from the keyboard, each control in a sensible Tab order and with an accessible name: the player's controls and seek bar; the panel button and tab row, where the arrow keys, Home, and End move between tabs; the Library controls; the Filter tab and its sections; the Tags tab, its chips, category headers, and drag handles, and Auto Tag; the Stats tab; the Settings tab, including the Ambient mode settings section and its sliders; the in-app dialogs; the admin view, its sections, the Log Viewer, duplicate review, and the control-token gate; and the recovery page.
  - What covers the page keeps Tab inside it while open and returns focus where it was on close: the panel as a full-screen overlay and Auto Tag, as the in-app dialogs already do (decided in WebUI Design Mockup).
  - The keyboard shortcuts stay as WebUI Keyboard Shortcuts and Player Controls binds them. Where the arrow keys have a local job, in the grid, the tab row, sliders, and on a focused drag handle, they keep it instead of playing the previous or next item.
  - Not included: rebinding keys, which is Customizable Keyboard Shortcuts.
  - Add a Release Specific checklist item, under Manual checks: "In Chrome, Firefox, and Safari on a desktop, every screen, including the admin view and the recovery page, works with the keyboard alone, focus always shows in orange, and the Library grid's Tab, arrow, Space, and Enter keys work as described."
- **Acceptance criteria**:
  - Keyboard focus shows as one orange ring on every focusable control, in both themes, and a mouse click shows none.
  - The grid is one tab stop: the arrow keys move between tiles without playing anything, Tab from a tile reaches its check icon, Space or Enter toggles it and starts selection with focus staying on it, and Tab again leaves the grid. A focused tile shows an orange border above its thumbnail, and a focused check icon a thick orange ring, starting at its edge, that the tile crops.
  - Every screen listed above can be operated with the keyboard alone, and the full-screen panel and Auto Tag keep Tab inside them while open and return focus on close.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for the grid's tab stop, arrow keys, check icon toggling and the focus it keeps, the tab row's keys, focus staying inside the full-screen panel and Auto Tag, and a focus style on each kind of control, `npm run verify`, one quick keyboard-only spot check, and the Release Specific checklist item for keyboard use.

### M12v - Desktop Retirement Notice

- **Status**: ⏳ Planned
- **Goal**: The last desktop build tells users the desktop app is retired and points them to the WebUI.
- **Scope**:
  - Ships in v0.15.0, last in the series. With the Enable Web UI switch that WebUI Admin Section removes, the only desktop changes outside bug fixes.
  - After Desktop Client Removal no desktop update is published, so installed desktops stay on their last version (inferred: the Velopack desktop feed stops getting releases). Later servers stop working with it, starting with the accounts release, which removes pairing.
  - On start, show a notice once per installed version: the desktop app is retired; use the WebUI. It offers the existing Open Web UI action. The wording needs approval.
  - The notice shows the new logo's icon beside its title (decided in WebUI Design Mockup), from a PNG in `assets/logo/png/` added to the desktop's resources. The desktop otherwise keeps its old icons, as New Logo and Icons leaves them. Checked at promotion: the desktop's Open Web UI menu item exists, and `release.yml` still packages the desktop.
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
  - WebUI Admin Section already names it **Log Viewer** in the admin section and the recovery page (decided in WebUI Design Mockup, so this milestone keeps that name and does not undo it). What is left is the route: rename `GET /control/logs/server` to `GET /control/log-viewer`, with the API, tests, and docs that name it, in one step. There is no alias period: the admin section and the recovery page are the route's only callers and ship in the same binary.
  - The route stays read-only; logs are still written directly to `last.log`.
  - Server-side filters: `svc`, `lvl`, `cat`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`, message text, and a time window. `lvl`, `cat`, and `svc` each take several values. Client-side filtering only refines results already fetched.
  - WebUI Admin Section already gives the Log Viewer this view's design on today's line format, with level checkboxes, a source multi-select, a text filter, and a time window. This milestone moves it to structured entries:
    - The level checkboxes take one `lvl` value each, so several levels can be shown at once.
    - Next to them, a multi-select filter by category, one option per `cat` value, and a filter by component (`comp`).
    - The source multi-select takes one option per `svc` value (`server` and `webui`; the desktop client is gone by this release).
  - Newest first by `ts`, tie-broken by `ingestReqId` and then a stable row sequence, with a versioned cursor and defined `from` and `to` bounds, so paging never repeats or skips rows.
  - Read from the end of the file and across rotated archives instead of walking every line on each request (found by the repository audit: `ServerLogService.Read` walks the entire log on every request).
  - Admin section view: it keeps the design WebUI Admin Section gives it (controls collapsed by default with active-filter chips, and auto-refresh that pauses while scrolled away from the newest rows, with a resume control), and its rows expand to raw JSON. The admin view in `docs/mockups/webui-panels/` (WebUI Design Mockup) shows the WebUI Admin Section version.
- **Acceptance criteria**:
  - The admin section's Log Viewer filters by every listed field, text, and time window.
  - The level filter is one checkbox per `lvl` value, and checking several levels shows entries of exactly those levels.
  - The category and source filters each select several values at once and show entries from exactly those categories or sources, and the component filter shows entries from that component.
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
    - The WebUI's pairing request lets a network error reject instead of reporting it in the status line, as the other failed pairing outcomes do. The login flow that replaces it returns a typed result on every failure.
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
    - Favorite and blacklist after Next: `src/playback/player.ts` applies a favorite or blacklist answer to the item playing when the answer arrives, so pressing Next before it does marks the new item locally and caches that state under its id until an event for it corrects it. The server's answer carries the changed item's `itemId` and both flags (`LibraryStateResponse`, which `shared/api/openapi.yaml` does not describe yet), so the fix is straightforward: cache the answer under its `itemId` and apply it only when that item is still playing. Found in the WebUI Preact Migration's Player slice, which kept the behavior.
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
  - Packaging slice: remove the `desktop` component from the `release.yml` matrix, including the Windows LibVLC relocation step and its legs' old `--icon`, stop publishing the desktop update feed, and remove the desktop references in `set-release-version.ps1` and `verify-linux-packaged-server-smoke.sh`. CI has no desktop job: desktop tests run inside the solution test on the Ubuntu and Windows jobs, so `ci.yml` needs no change.
  - Contract slice: remove routes and fields that no remaining caller uses, each checked against the WebUI and the admin section. Remove the web runtime settings' `enabled` field, which the server has ignored and reported as on since WebUI Admin Section, and the filter state's old `favoritesOnly` and `excludeBlacklisted` fields, which Favorite and Blacklist Filter Modes keeps beside its new ones. Candidates: `/api/library-states`, `/api/library/item`, the full path kept in the random and play responses' `id` for the desktop, and `itemTagsChanged.itemIds` and the auto-tag apply response's `changedItemPaths`, which the WebUI no longer reads beside their item id fields. `/api/library/catalog-checkpoint` stays for the admin section's export. OpenAPI and generated WebUI types.
  - Icons slice: delete the old icons `assets/HI.ico`, `assets/HI-256.png`, and `assets/HI-512.png` once nothing uses them. After New Logo and Icons only the desktop uses them: its `ApplicationIcon`, window icon (`MainWindow.axaml`), Avalonia resource, Linux menu registration (`LinuxAppImageRegistration.cs`), and its release legs' `--icon`.
  - Fixture slice: `event-revision.json`, `library-tile-effect.json`, `preset-filter-equality.json`, and `sort-direction-labels.json` lose their C# readers and stay as WebUI test data. `tag-name-order.json` stays, read by Core and the WebUI.
  - Docs slice: `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, `docs/dev-setup.md`, `README.md` (desktop install and the LibVLC prerequisite), the testing checklist's desktop Smoke item and the desktop in-app update item in Release Flow, and `AGENTS.md`: remove the desktop freeze rule and the desktop test-isolation note, and keep the shared-fixture rule for rules implemented in server C# and the WebUI.
  - Add a Release Specific checklist item: "On Linux and Windows, the release publishes only the server, every former desktop workflow works in the WebUI, and an existing desktop install keeps its last version."
  - Not included: rewriting historical `CHANGELOG.md` sections and completed milestones, which keep their desktop references.
- **Acceptance criteria**:
  - The solution has no desktop projects, and `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.
  - A release builds and publishes only server packages and feeds.
  - OpenAPI has no route or field that only the desktop used, including the web runtime settings' `enabled` field.
  - No current-state doc describes the desktop client as current.
  - `assets/HI.ico`, `assets/HI-256.png`, and `assets/HI-512.png` are deleted, and nothing refers to them.
  - The four former desktop fixtures are read by WebUI tests.
- **Verification evidence**:
  - Completion evidence must include the build, test, and verify runs, `./tools/scripts/verify-linux-packaged-server-smoke.sh`, a dev-channel release run of `release.yml`, and a search of current-state docs for the desktop client.

### P49 - WebUI Loudness Normalization

- **Status**: ⏳ Planned
- **Goal**: The WebUI evens out loudness between videos, as the desktop's volume normalization does, and it works properly in every browser the WebUI supports.
- **Scope**:
  - Declined for v0.15.0 in WebUI Design Mockup and given its own milestone, so it can be made to work properly. Depends on: WebUI Keyboard Shortcuts and Player Controls, whose volume control it works with, and WebUI Settings Panel, whose tab holds its settings.
  - The desktop adjusts volume from the server's per-item loudness and the library baseline (`LoudnessNormalizationService`, off by default). The WebUI could apply a gain through the Web Audio API next to the volume control; behavior on iOS is not verified (inferred).
  - Settings in the Settings tab, per device, with the desktop's ranges and defaults: on or off (off), maximum reduction (1–30 dB, 15), maximum boost (0–10 dB, 5), and the baseline, automatic or a manual target (−50 to −10 LUFS, −23). The automatic baseline uses the baseline loudness the server's library stats already report (read from code when this was planned). Each survives a page refresh, and fields that can hold a value that is not valid use the field validation pattern.
  - Changes to user-facing UX need approval, mocked in `docs/mockups/webui-panels/`.
- **Acceptance criteria**:
  - With normalization on, each video plays at a gain set by its loudness against the baseline, within the maximum reduction and boost.
  - The settings are in the Settings tab with the desktop's ranges and defaults, and each survives a page refresh.
  - It works in Chrome, Firefox, and Safari on a desktop and on Android and iOS, or the setting is hidden in a browser where it cannot work, and that browser is named in this entry.
- **Verification evidence**:
  - Completion evidence must include tests of the gain against the desktop's for the same loudness, baseline, and limits, tests for each setting surviving a page refresh, `npm run verify`, and a spot check in each browser named above.
