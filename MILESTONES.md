# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. Each release becomes a new `M*` series when it is promoted.

The WebUI is the only client on every device from v0.15.0, which removes the desktop client. The native Android client is dropped.

- **v0.15.0 — WebUI overhaul**: Serve the WebUI over HTTPS so it installs as an app, move it to Preact, design the release's UI in one approved mockup, roll out the new logo and icons, give it a responsive layout with a side panel and phone overlays, and give it everything the desktop does: keyboard shortcuts, volume and loudness normalization, stats, settings, an admin section that replaces the Operator page and manages refresh, backups, duplicates, sources, and catalog transfer, Show in File Manager, a browser-playable filter, multi-select, and right-click menus across the app. It also adds 5-star ratings with half stars, which filter and sort, date added and date created filters and sorts, a Randomization tab whose options combine shuffle, folder and tag spread, and favoring less played, new, or higher-rated files in place of the randomization modes, and profiles, chosen from the header, that each show only the sources, tags, and presets picked for them. It removes the desktop client, its packaging, and its tests, and moves preset writes to per-preset routes. M12a, M12b, M12c, M12d, M12e, M12f1, M12f2, M12f3, M12f4, M12f5, M12f6, M12f7, M12f8, M12g, M12h, M12i1, M12i2, M12i3, M12i4, M12i5, M12i6, M12i7, M12i8, M12i9, M12i10, M12j, M12k1, M12k2, M12k3, M12k4, M12k5, M12k6, M12k7, M12l, M12m, M12n1, M12n2, M12n3, M12n4, M12o1, M12o2, M12o3, M12p, M12q, M12r, M12s, M12t.
- **v0.15.1 — Structured log foundation**: Write `last.log` as structured JSON Lines through one server writer and give the WebUI a typed, privacy-safe log API. P27a, P27b.
- **v0.16.0 — Playback sessions**: Let the server choose direct, remux, or transcode playback per session for the WebUI. P2a, P2b, P2c, P2d, P2f, P2g, P2h.
- **v0.17.0 — Structured log migration and Log Viewer**: Move every server and WebUI log to the structured API and give the admin section a filterable Log Viewer. P27d, P27e, P27f, P27g.
- **v0.18.0 — Accounts**: Require an account PIN from LAN and remote clients, with per-user source access, and give each account its own favorites, ratings, history, tags, presets, and profiles. P28b, P28c, P28d, P28e, P28f, P28m, P28g, P28h, P28j, P28n, P28k, P28l.
- **Unscheduled backlog**: P1, P4, P5, P6, P9a, P9b, P10, P33, P35, P36, P50, P51, P52, P53a, P53b, P54, P55, P56, P57, P58.

## Document Purpose

Use this file for:

- milestone status (⏳ Planned | 🚧 In Progress | ✅ Complete),
- scope and acceptance criteria,
- verification evidence.

Do not use this file for detailed architecture explanation or current capability inventory.

## Ownership Boundaries

- `MILESTONES.md`: roadmap, milestone scope, acceptance gates, verification evidence.
- `MILESTONES-COMPLETED.md`: archive of finished milestones.
- `ISSUES.md`: known bugs, until they are fixed.
- `CONTEXT.md`: current implemented capabilities across server/web/operator.
- `AGENTS.md`: agent workflow, boundaries, and doc-discipline rules.
- `docs/domain-inventory.md`: ownership-first implementation surface map.
- `README.md` + `docs/dev-setup.md`: run/setup/verify instructions.
- `docs/api.md` + `shared/api/openapi.yaml`: API behavior and contract source of truth.

## Maintenance Rules

- Keep entries **current-state accurate**: update statuses and evidence as work progresses.
- Keep scope locked to milestone intent.
- Record future work found during a milestone as its own backlog item in `## Planned Milestones`, or as an addition to the existing milestone that will do it. Check existing items first so the work is not recorded twice.
- Known bugs live in `ISSUES.md`, not here. A milestone that fixes one names it by its title in its Scope.
- Record scope boundaries as bullets in the entry's Not included section. When another milestone covers the boundary, name it by its exact title after "which is" (for example `- Rebinding, which is Customizable Keyboard Shortcuts.`), which `check-milestones.ps1` enforces.
- Anything the user wants done later goes into the Scope of the milestone that will do it, an existing related one or a new backlog item, never only into a Not included section. A Not included bullet then names that milestone after "which is".
- Organize milestone sections as:
  - `## Planned Releases`: the release outline at the top of this file; keep it in sync when milestones are added, moved, promoted, completed, or removed.
  - `## Active Milestones`: milestones currently being worked, using `M*` IDs in historical order.
  - `## Planned Milestones`: backlog candidates not yet started, using `P*` IDs in numerical order (for example base phases and lettered sub-slices).
- Finished milestones live in `MILESTONES-COMPLETED.md` under `## Completed Milestones`, newest completions first. These rules apply there too, except that completed entries keep the format they were completed in, including any `Deferrals / Follow-ups` sections, as historical record.
- Keep `## Active Milestones` updated with `Last milestone completed: Mx` so the next `M*` assignment is unambiguous.
- When promoting planned work to active work, assign the next `M*` ID at promotion time and keep planned `P*` IDs stable until then. Promote a planned release as a new `M*` series, with lettered milestones in its outline order.
- When a milestone is completed, move it to the top of `MILESTONES-COMPLETED.md` as-is: keep its body unchanged except final-state corrections, and preserve newest completions first.
- In an entry's body, do not reference milestone IDs; use milestone names/descriptions (or "this milestone"/"this series") so ID reassignment does not require copy edits.
- ID references are allowed only in milestone section headers, the `Last milestone completed: Mx` tracker line, and the `## Planned Releases` outline.
- A planned milestone never names the schema version number of a step that hasn't landed. It says the catalog moves to the next schema version, with its upgrade step from the version before, so reordering milestones doesn't make it wrong. Versions already in the code, such as the shipped 2→3 step, may be named.
- The Depends on bullet names milestones by their exact titles, which `check-milestones.ps1` enforces, and may end with a condition on starting, as the Entry Format describes.
- Depends on names only milestones whose work this one can't be built without, because it uses their routes, schema columns, components, events, or settings. Order preferences, priority, schema-step order, and fitting around another milestone's choices, such as joining its Esc order, are not dependencies. A backlog item's priority goes in a short clause at the end of its Goal, such as "Low priority, after Animations."
- Keep acceptance criteria testable and outcome-focused (avoid implementation-narrative bloat).
- Keep verification evidence concrete:
  - commands/checks run,
  - artifacts/docs updated,
  - waivers explicitly called out.
- Avoid duplicating architecture/runtime detail already owned by `CONTEXT.md` and docs under `docs/`.
- Prefer referencing owning docs instead of copying long explanatory sections into this file.
- Keep historical entries intact except for final-state correction of inaccurate facts.
- If script names/paths/contracts change, update milestone references to avoid stale guidance.

## Entry Format

Every active and planned entry uses this shape. `check-milestones.ps1` enforces its structure in every active and planned entry: the header bullets, the sections and their order, the Slices table and how it matches the slice sections, each slice's parts, and how the statuses agree. The rules it can't check, such as one fact per bullet, each acceptance criterion naming its tests, and the Traps marks, need a read-through. Entries in `MILESTONES-COMPLETED.md` keep the format they were completed in.

- **Header bullets**, one line each, in this order: Status and Goal, then Depends on when the entry depends on other milestones, and Design when it is built to a mockup or design doc. Which release an entry ships in, and in what order, is the Planned Releases outline's job; entries don't repeat it.
  - Depends on names those milestones by their exact titles, joined by commas or "and", each optionally followed by an explanation after ", which", ", whose", or ", so". A condition on starting may close it as a clause after ", and" that starts with a lowercase word, such as ", and it starts only once the new UI has been in daily use". After an explanation, a clause there that starts with a capital letter is read as a milestone title, so it must be one.
- **Decisions**: settled choices that shape more than one slice, each with its reason when it isn't obvious. Write them as settled, without saying where or when they were decided. A choice that shapes only one slice is stated in that slice's Scope.
- **Slices**: a table of each slice, its status, and one line on what it delivers, in the order they land. Each row has a `#### {Slice} slice` section, in the same order, with these parts:
  - **Scope**: what the slice builds, naming the files, routes, and contracts it changes.
  - **Traps**: facts the implementer would otherwise trip on. Mark a fact that was run or measured "(measured)", one measured earlier that promotion couldn't measure again "(measured before promotion)", and one reasoned but not checked "(inferred)"; an unmarked fact was read from the code or docs. Never write "at this edit"; promotion re-checks every fact.
  - **Acceptance**: testable outcomes, each naming the tests or checks that show it. Automated tests plus at most a quick spot check.
  - **Evidence**: added when the slice lands, never while it is planned: what ran and its result, measured figures, docs updated, and waivers.
- A slice's status moves on its own. The entry's Status is ⏳ Planned while every slice is, ✅ Complete only when every slice is, and 🚧 In Progress otherwise.
- An entry without slices has `#### Scope`, `#### Traps`, `#### Acceptance`, and `#### Evidence` sections in place of the table and slice sections, with the same rules.
- **Release checks**: one-line checks for the release's testing pass, as `Agent:` or `Manual:` bullets, as `AGENTS.md` describes. They are added to the Release Specific section of `docs/checklists/testing-checklist.md` when the milestone completes.
- **Not included**: one bullet per scope boundary. When another milestone covers it, name that milestone by its exact title after "which is".
- Every entry has Status and Goal, and every slice, or an entry without slices, has Scope and Acceptance. Decisions, Traps, Release checks, and Not included are left out when there is nothing to put in them, and Evidence is left out until the slice lands.
- One fact, decision, or criterion per bullet. Nest a list only under the bullet it belongs to.

## Milestone Template

### Mx - {Milestone Title}

- **Status**: ⏳ Planned | 🚧 In Progress | ✅ Complete
- **Goal**: {one outcome, in a sentence}
- **Depends on**: {exact milestone titles}, then any condition on starting. Leave out when it depends on none.
- **Design**: {the mockup or design doc it is built to}. Leave out when there is none.

#### Decisions

- {a settled choice that shapes more than one slice, and why}

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| {Name} | ⏳ Planned | {one line} |

#### {Name} slice

**Scope**

- {what this slice builds, and where}

**Traps**

- {a fact that would trip up the implementer} (measured)

**Acceptance**

- {a testable outcome, and the tests that show it}

**Evidence**

- {added when the slice lands}

#### Release checks

- Agent: {a check an agent can verify from the repo, its docs, or the release workflow's runs}
- Manual: {a check that needs a person, real devices, or the Windows VM}

#### Not included

- {a scope boundary}, which is {covering milestone title}. Leave out the "which is" part when no milestone covers it.

---

## Active Milestones

Last milestone completed: M12l

### M12m - WebUI Multi-Select and Bulk Actions

- **Status**: 🚧 In Progress
- **Goal**: The WebUI selects several library items, or every item that matches, and favorites, blacklists, rates, tags, or clears the playback stats of all of them at once, or deletes their files.
- **Depends on**: WebUI Grid Row Reuse and Zoom, which updates a tile in place, so selection marks are tile updates, and WebUI Tags and Filter Tabs, whose Tags tab edits several items, and Item Ratings, whose rating and star control Rate… uses, and Rating Filter and Sort, whose rating change kind in the tile effect rule the bulk rating event goes through.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Select all selects every item that matches the search and filters, loaded or not, and each bulk action applies to all of them.
- Each bulk action acknowledges itself in a Your actions popup: "Added {n} items to favorites.", "Removed {n} items from favorites.", "Blacklisted {n} items.", "Removed {n} items from the blacklist.", "Rated {n} items {rating}.", "Cleared the rating on {n} items.", "Updated tags on {n} items.", and "Cleared playback stats for {n} items.", with "1 item" for one, and {rating} as Item Ratings words it, such as "3.5 stars".
- Removing items from the library always deletes their files from disk, and the action is named for what it does. An item removed with its file left on disk wouldn't stay removed: the refresh's source stage adds every file in a source folder that the catalog doesn't hold as a new item, with no tags, favorite, or play stats and a new date added. Blacklisting covers hiding a file and keeping it.
- A bulk change's {n} is the `count` its route answers and its event carries, the named items in the library, so the device that made the change and other devices say the same number.
- Item ids match exactly as the server generates them, so looking up the items a request names reads the id's primary key index instead of scanning it.
- Selection starts from a tile's check icon, a long press on a touch screen or with a pen, or a Shift, Ctrl, or Cmd+click on a tile, and the Library tab has no Select button.
- Once selection is on, a click, a Ctrl or Cmd+click, or a long press adds or removes a tile.
- A search, filter, or preset change ends selection, so an action never reaches an item the grid doesn't show, and a sort change keeps it.
- Selection lasts while the panel shows another tab or is closed, and Esc ends it only while the Library tab shows, so Esc never ends a selection nobody can see. The Selection actions menu closes when the Library tab hides.
- Items the app removes by deleting their files leave the selection, and selection ends when none are left.
- The selection bar reads, from the left, Select all (`select_all`), Clear selection (`deselect`), and "{n} / {matching} selected", such as "15 / 615 selected", with both numbers grouped as the count line groups them, to match its "{matching} / {total} shown", and at its far right Selection actions, an icon button with `more_vert` and the tooltip "Selection actions", since it opens a menu rather than a dropdown.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ✅ Complete | An ids-only library query, bulk favorite and blacklist with one event, bulk rating with one event, a delete-files route with its event, the tag-count read for a selection, exact id matching, and the WebUI's handling of the bulk and removal events. |
| Selection | ✅ Complete | Selecting tiles by their check icon, a long press, or a Shift, Ctrl, or Cmd+click, the selection bar with Select all and Clear selection, and the Esc order. |
| Library look | ⏳ Planned | The Library tab as the mockup shows it: the selected tile's look, rounded tiles, no border or background, gaps set by the zoom's row height and snapped to device pixels, the zoom from 120 px, the thin scrollbar in the tab's right margin, the count line's "shown", the preset dropdown's "Preset:", and the Filters and Random lines' chevrons. |
| Bulk actions | ⏳ Planned | The Selection actions menu's favorite, blacklist, rate, clear playback stats, and delete actions, the control-token prompt the delete action asks through, clear-stats' resync payload, a resync in place of a bulk event too large to send, and favorite and blacklist answers applied to the item they were for. |
| Context menu | ⏳ Planned | A right-click on a library tile opens an app-styled context menu with the Selection actions menu's options, built as a shared context menu component. |
| Tag edits | ⏳ Planned | Editing several items' tags in the Tags tab. |

#### Contract slice

**Scope**

- `POST /api/library/query-ids` answers the id of every item the library query with the same search and filters matches, with no paging, cap, or order, for Select all.
- `POST /api/bulk/item-state` sets or clears favorite or blacklist on many ids in one write, with the single routes' rule that a favorite clears blacklist and a blacklist clears favorite, and publishes one `bulkItemStateChanged` for the request in place of one `itemStateChanged` per item.
- `POST /api/bulk/rating` sets or clears one rating on many ids in one write and publishes an event of its own, `bulkItemRatingChanged`, for the request, carrying each changed item's previous rating.
- Each bulk event carries what the request set, `count`, the named items in the library, and only the items that changed, with their values before and after, and is published when `count` is above 0. Each bulk route answers that `count`.
- The single favorite, blacklist, and rating routes write through the same Core code with one id, and keep their answers and events.
- `POST /api/library/delete-files` deletes the named items' files from disk, outside the operations lock, and then removes the items whose files it deleted, with their tags, in one write. An item whose file isn't on disk, or can't be deleted, stays and is named in `failedItemIds`.
- Delete files is gated as the `/control` routes are, by their one check (`ServerPairingAuthMiddleware.IsControlRequestAuthorized`): open from the server machine, and from another machine only with a control session or the control token. Any other caller gets 403 with `control_token_required`, not 401, which the WebUI reads as a device that needs pairing.
- Delete files publishes `itemsRemoved` with the removed ids, and every open WebUI reloads its library window, its Stats tab, and the loudness baseline on it.
- Duplicate apply deletes its files through the same code, writes the same `last.log` lines, takes the same check, and publishes `itemsRemoved`.
- Each bulk request writes one `last.log` line with its counts and elapsed time, and a refused delete files or duplicate apply writes a warning with the caller's address.
- The WebUI applies the patch-or-reload rule to each id in a bulk event, the bulk rating event included, and reloads its window at most once.
- The bulk requests send the device's `clientId`, and the bulk events carry it back as `clientId`, as WebUI Notifications does for one item's favorite or blacklist.
- Other devices show one Other devices popup for the batch: "Added {n} items to favorites on another device", "Removed {n} items from favorites on another device", "Blacklisted {n} items on another device", "Removed {n} items from the blacklist on another device", "Rated {n} items {rating} on another device", or "Cleared the rating on {n} items on another device", with "1 item" for one and {n} grouped as the count line is. The device whose `clientId` the event carries shows no Other devices popup.
- Item ids match exactly in every route, so each lookup reads the id's primary key index.
- For a selection of every matching item, the Tags tab's chip states and collapsed counts need each tag's count across the selection, which the WebUI can't work out for items it hasn't loaded. The tag-editor model's `countsOnly` answers `tagCounts`, how many of the items hold each tag, and `itemCount`, how many of them are in the library, in place of each item's tags, as the cheaper read the slice measured.
- OpenAPI and generated WebUI types.

**Traps**

- `POST /api/favorite` and `POST /api/blacklist` take one item id each.
- `POST /api/playback/clear-stats` and `POST /api/tag-editor/apply-item-tags` each take a list of item ids, `itemIds`, so a selection of items that aren't loaded can be cleared. Clear-stats refuses a request that names no ids without `allItems`.
- Every id lookup was case-insensitive (`COLLATE NOCASE` in `ResolveItemId`), which the id's primary key index can't serve, so each lookup scanned the index: about 0.5 ms an id, and about 25 s for a request naming every item, holding the catalog's write lock (measured before promotion).
- The refresh's source stage adds every file in a source folder that the catalog doesn't hold as a new item (`InsertDiscoveredItem` in `RefreshPipelineService.cs`).
- Item Ratings' `POST /api/rating` takes one item, and its `itemRatingChanged` names one item.
- The tag-editor model takes item ids (`TagEditorModelRequest.itemIds`).
- `sseClient.ts` listens only for the event types in its handler map, so an event type `serverConnection.ts` doesn't register is dropped.
- Each reload of the library window aborts the one before, so patching a batch one item at a time sends up to one query an item (measured).

**Acceptance**

- The ids-only query returns every matching id, in server tests for the ids-only query.
- Bulk favorite and blacklist send one request and publish one event, and the WebUI reloads its window at most once for it, in server tests for the bulk route and its one event, and WebUI tests that the bulk event reloads the window at most once.
- The bulk event carries the request's `clientId`, in server tests for the bulk route, and other devices show one Other devices popup for the batch while the device that made the change shows none, in WebUI tests of the bulk event's popups.
- Bulk rating sends one request and publishes one rating event with each item's previous rating and the request's `clientId`, the WebUI reloads its window at most once for it, and its popups follow the same rule, in server tests for bulk rating and its event and WebUI tests of the bulk rating event.
- Delete files deletes the files and removes their items, keeps an item whose file is missing or can't be deleted, and refuses a caller from another machine without the control token with 403, and duplicate apply refuses that caller too and publishes `itemsRemoved`, in server tests of the routes.
- Removing items updates connected WebUI sessions through events and list requery, in WebUI tests for event handling.
- The measurement of the tag-editor model against a counts-only addition on the catalog is recorded, and the cheaper read is used.
- The ids-only query, the bulk route, bulk rating and its event, and the delete-files route and its event are in OpenAPI, and `npm run verify:contracts` passes, in contract tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

**Evidence**

- Measured on a copy of the newest server backup of the developer catalog, 49,466 items, with Python's SQLite 3.53.4 (the server bundles 3.53.3), writes in WAL with synchronous=NORMAL as the server opens the catalog (measured):
  - The tag-editor model for every item: 27.2 s with the case-insensitive lookup, and 0.34 s with exact lookups, answering 3.8 MB of each item's tags. Counts per tag from the same ids: 55 ms, answering 12 KB for the catalog's 283 tags. The counts read is used.
  - Every matching id: 35 ms, answering 1.98 MB.
  - Setting or clearing favorite on every item in one transaction: about 0.5 s. Clearing every item's playback stats: 0.24 s. Deleting the rows of 5,000 items: 0.37 s, and of every item, 5.3 s.
- Every stored id in the catalog is a lowercase 36-character id the server generated (measured).
- `BulkActionRouteTests.cs` covers the ids query past one page with search, filter, and a disabled source; bulk favorite and blacklist setting and clearing with the clearing rule, one write and one event listing only the changed items, `count`, and the request's `clientId`, and no event when no named item is in the library; bulk rating likewise; delete files deleting files, items, and tags, keeping a missing and an undeletable file's items in `failedItemIds`, one `itemsRemoved`, a log line without paths, and the gate for localhost, a LAN caller with and without a control session, and the bearer token; duplicate apply's gate, its `itemsRemoved`, and its log lines; each bulk request's log line, with none for a single favorite or rating, and a warning for each refused delete files or duplicate apply; `countsOnly` across chunks, with tags in different casing counted as one; and each new request, answer, and payload against its OpenAPI schema.
- Tests that named items by an id in another casing now show that such an id names no item (`ApplyItemTags_LeavesAnItemAlone_WhenItsIdIsInAnotherCasing`, the session, list, and playback read tests that used upper-case ids, and the WebUI tag save test that matches item ids exactly), and the other tests that used upper-case ids use the server's lower-case ones. The WebUI's tag save and the duplicate scan compare item ids exactly too.
- WebUI tests show that a bulk favorite or rating batch that calls for a reload sends one query, a patch-only batch sends none and patches every tile it names, a batch that brings an item outside the window into the filter reloads once, `itemsRemoved` sends one query and reloads the Stats tab and the baseline, another device's batch shows one popup with the batch's text while this device's own shows none, and a batch naming the playing item updates its buttons, the item-state cache, and the rating star.
- Each break failed its tests and passed once restored: publishing one bulk event per item, removing delete files' gate or letting the shared `/control` check pass every caller, which also failed four `/control` gate tests, putting the case-insensitive lookup back, patching a batch one item at a time in parallel (five queries where three were expected), dropping the own-device check from the bulk popups, dropping duplicate apply's gate or its `itemsRemoved`, the refusal's warning, or the bulk log lines, and sending the single favorite and rating through the bulk path that logs (measured).
- The single favorite, blacklist, and rating routes write through the bulk Core code with one id, in place of three transactions a change. Their route tests pass unchanged, and the service tests take `SetRating`'s new answer and lower-case ids. Duplicate apply deletes its files through the delete-files code, outside the operations lock, with the same answers, and writes the same `last.log` lines, named `Duplicate apply`, whose test failed before it wrote them (measured).
- Unused code is removed: the WebUI's `parseLibraryProjection`, `parseLibraryProjectionSummary`, and what only they used, the server's `UpdateItemFlag` and `UpdateItem`, `ReadPlaybackItemById`, which `ReadPlaybackItem` replaces, and Core's one-item `SetFavorite`, `SetBlacklist`, and `SetRating`, whose tests call `SetItemsFlag` and `SetItemsRating` with one id. One count helper, `text/countText.ts`, replaces the Filters line's and the kept-source notice's own, and `ApplyItemTags` passes its lists to Core, which trims and dedupes them, in place of doing it twice.
- `shared/api/openapi.yaml`, the generated WebUI types, `docs/api.md`, `docs/architecture.md`, `CONTEXT.md`, and `docs/domain-inventory.md` describe the new routes and events, exact id matching, and the counts read.
- `dotnet build ReelRoulette.sln` passes with no warnings, `dotnet test ReelRoulette.sln` passes with 720 Core and 19 ServerApp tests, SystemChecks passes, and `npm run verify` passes with 2,197 tests in 91 files.

#### Selection slice

**Scope**

- Selection works as Google Photos does, with one icon throughout: a white circle with a check mark at the tile's top left.
  - With a mouse it shows faded while the pointer is over a tile, and on every tile once selection is active.
  - With the pointer on the icon itself it turns bright white, and clicking it selects the tile and starts selection.
  - Selecting a tile turns the same icon filled orange, and the thumbnail shrinks inside the tile so the icon sits on its top-left corner.
  - Hovering dims only the thumbnail, so the icon stays bright.
  - On a touch screen a long press starts selection, and the icons then show on every tile.
  - Its tooltip reads "Select" or "Deselect".
- The grid's text isn't selectable, so Shift+click selects only tiles and doesn't also highlight text across them.
- Hovering dims a tile's thumbnail only on a device that can hover, so a tap no longer leaves a tile dimmed; a pressed tile still dims.
- While selecting, the selection bar shows at the bottom of the Library tab, and the Selection actions menu opens above it, empty until the Bulk actions slice fills it.
- Select all sends the search and filter the grid shows to `POST /api/library/query-ids`.
- Shift+click adds every tile from the last one clicked or long-pressed, whether that selected or deselected it, to the one clicked, or only the one clicked when the last one isn't in the grid.
- Select all only adds, and Shift+click keeps the tile it starts from. Select all is disabled, with the tooltip "Everything is already selected", while the selected count matches the grid's match count.
- A press of Select all while its request is under way does nothing, Clear selection drops its answer, and a failure shows in the in-app notice as "Select all failed: {the server's reason}".
- Deselecting the last tile ends selection.
- Esc closes the Selection actions menu and then selection, after Auto Tag and before the panel, in the order WebUI Keyboard Shortcuts sets.
- Esc's row in the shortcut list reads "Close the top dialog, the notifications list, the rating stars, or the panel, clear selection, or leave fullscreen".
- The selection, the long press, the tiles' marks, the bar, and the Esc step are built in `src/library/` (a selection model, a long-press handler, the tile, its rows and grid, the query session, and `library.ts`), `src/ui/LibraryOverlay.tsx`, `src/ui/Stage.tsx`, and `src/styles.css`, and the mockup shows them as shipped, apart from the Library look slice's look, which it shows ahead of the app.

**Traps**

- The desktop's library grid selected several items with click, Ctrl+click, and Shift+click.
- The WebUI library plays one item per click and has no selection.
- Filled icons take `.material-symbol-icon.is-filled` (FILL 1, weight 700, optical size 20), and icons on a tile take the drop shadow from `.library-grid-tile .material-symbol-icon.is-filled` (`src/styles.css`).
- The WebUI's icon font is the full Material Symbols font and has `select_all` and `deselect` (measured).
- Every tile has the playing icon, which the stylesheet shows only on the tile with `is-playing`, and the grid controller moves that class between the tiles shown without rendering them again (`setPlayingItemId` in `libraryGridController.ts`).
- A second finger landing during a long press starts a pinch, which zooms the grid's rows (`libraryGridZoom.ts`), so it has to cancel the press, as the mockup's grid does on a two-finger touch (`clearTimeout(pressTimer)` in `build/layout.src.html`).

**Acceptance**

- With a mouse, a tile's check icon shows faded on hover and selects the tile when clicked; during selection it shows on every tile, and a long press starts selection on a touch screen. A selected tile's icon is filled orange and its thumbnail shrinks inside the tile, in WebUI tests for selection.
- The Library tab has no Select button, a Shift, Ctrl, or Cmd+click on a tile starts selection, and deselecting the last tile ends selection, in WebUI tests for selection.
- The selection bar shows Select all, Clear selection, "{n} selected", and Selection actions, in that order, with their icons and tooltips, and Select all is disabled with its reason while everything that matches is selected, in WebUI tests for selection.
- Once selection is on, a click or a Ctrl or Cmd+click adds or removes a tile, and Shift+click adds a range without highlighting text, in WebUI tests for selection.
- Select all selects every item that matches the search and filters, including items not loaded, in WebUI tests for Select all over items not loaded.
- A search, filter, or preset change ends selection, and a sort change keeps it, in WebUI tests for selection.
- Esc closes the Selection actions menu, then selection while the Library tab shows, after Auto Tag and before the panel, in WebUI tests for the Esc order.
- The mockup matches what the slice shipped, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

**Evidence**

- `npm run verify` passes with 2,248 tests in 93 files, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `librarySelection.test.ts` covers picking and taking out tiles, selection ending with the last one, Shift+click's range in either direction from a tile picked or taken out, or only the tile clicked without a last tile in the order, Select all's additions, removed items, clearing, and the menu.
- `libraryTilePress.test.ts` covers a finger's and a pen's long press at half a second, none for a mouse, whose right-click keeps the browser's menu, the browser's menu kept off a tile pressed with a finger, the click a long press ends with used up and a tap's left alone, the press cancelled by moving 8 px, a second finger, a `pointercancel`, or lifting first, but not by moving less, and none started by a second finger, which the browser never makes the primary pointer, even when the first finger landed off a tile or its press was cancelled.
- `libraryGridTile.test.ts` and `libraryGridController.test.ts` cover the filled `check_circle` beside the thumbnail, found by its tooltip, the thumbnail's `draggable="false"`, the selected mark changing only the tile's class and the tooltip, and the marks set on the tiles shown in place and on tiles that come into view or are built later.
- `library.test.ts` covers a click playing a tile or, on its check icon or with Shift, Ctrl, or Cmd, selecting it, clicks and long presses during selection, Shift+click over the loaded order, the grid's marks and a grid created again, Select all sending the window's search and filter rather than text still being typed, its disabled state, a second press while one is under way, its answer dropped when selection is cleared even for a new selection, its failure in the notice with its log text, selection ending on a new search or filter and kept through a new sort, removed items leaving it, and the menu closing as the tab hides.
- The page tests in `screens/library.test.ts` cover, with the stylesheet: no Select button; the check icon hidden outside selection, starting selection without a play, every tile's icon shown, faded or bright and orange, the selected thumbnail at `scale(0.86)`, the bar's parts in order with their icons and tooltips, the hover rules only under `@media (hover: hover)`, and a thumbnail that can't be dragged (`-webkit-user-drag: none`); clicks, Ctrl and Cmd+clicks, and a Shift+click range with the grid's text not selectable; each modifier starting selection in the overlay without closing it, a plain click playing, and the last deselect ending selection; Clear selection; Select all over 1,234 items with 200 loaded, its grouped count, and its disabled state; a search, a preset pick, and a sort; removed items; a selection kept across another tab and a closed panel; a long press, its click, a tap, and a long press taking a tile out; the menu opening and closing; and Escape closing the menu, then ending selection, then closing the panel, leaving a selection the tab doesn't show, and going to an open notice first. `screens/tags.test.ts` shows a selection kept through Auto Tag's Escape, and Escape then ending it once the Library tab shows, before the panel.
- Each break failed its tests and passed once restored: removing the Esc step, letting Esc end a selection the tab doesn't show, Shift+click adding only the tile clicked, not using up a long press's click, a second finger not cancelling the press, the browser's menu not blocked, Select all sending the search box's text, Ctrl and Cmd not selecting, the last deselect leaving selection on, tiles coming into view unmarked, a new query keeping selection, a new sort ending it, Select all never disabled, removed items kept, the menu left open as the tab hides, an answer kept after Clear selection, the grid's text selectable, the hover dim outside `@media (hover: hover)`, the selected thumbnail not shrinking, the check icon's tooltip staying "Select", a second finger starting a press when the first started none, and the thumbnail left draggable by the stylesheet or by its `draggable` attribute (measured).
- The Esc row's new text and the tiles' check icons and undraggable thumbnails changed the shortcut reference test and two snapshots, the foundation page's Esc row and the library tiles' markup, and nothing else in them.
- The Selection actions menu opens empty until the Bulk actions slice fills it.
- The mockup shows the bar as Select all, Clear selection, the count, and Selection actions with `more_vert`; a Shift, Ctrl, or Cmd+click starting selection and a Ctrl or Cmd+click toggling during it; Shift+click adding only the tile clicked without a last tile in the grid; Esc ending selection only while the Library tab shows, and the menu closing as the tab hides; a new search or filter ending selection; the grouped count; Select all disabled with its reason; the browser's menu kept off a tile from the start of a finger's press; a long press without a click forgotten at the next press; and the Esc row's new text. Its icon font gained `more_vert` (`build_font.py`, run with the user's approval), and its tiles' and check icons' screen-reader-only names ("Play {name}" and "Select {name}") are gone, since the app has none.
- The mockup shows the Library look slice's look ahead of the app: the selected tile's inset thumbnail, grey background, and black check, rounded tiles, gaps set by the zoom's row height and snapped to device pixels, the zoom from 120 px, no grid border, the scrollbar in the tab's right margin, the count line's "shown", the preset dropdown's "Preset:", and the Filters and Random lines' chevrons. Until that slice lands, the app keeps the orange tint, the shrunk thumbnail, square tiles, 1 px gaps, the zoom from 100 px, the grid's border, the count line without "shown", the preset's plain name, and the lines without chevrons.
- One `Icon` component, `src/ui/Icon.tsx`, replaces the copies in `AutoTag.tsx` and `TagEditor.tsx`.
- The query session alone decides whether a query matches by another search or filter (`changesMatch`), Select all's request takes the generated `LibraryIdsQueryRequest` and its answer goes through `parseLibraryIds`, beside `parseLibraryQueryPage`, and the Library plays a tile only through `clickTile`, whose tests the play tests now are, and neither it nor `requestPlayItem` trims the id or refuses a blank one, which no tile or history step sends.
- `CONTEXT.md`, `docs/domain-inventory.md`, `docs/architecture.md`, and `CHANGELOG.md` describe the selection, Select all, and the Esc order.

#### Library look slice

**Scope**

- The user approved the mockup's Library tab in their review on their devices, and the slice builds it as the mockup shows it.
- A selected tile's thumbnail is inset 8 px on every side, at every zoom, and cropped to fill the inset, as `object-fit: cover` does, with 4 px corners, so every selected tile has the same margins and the check icon, 4 px from the tile's corner, sits over the thumbnail's top-left corner whatever its shape.
- Around the inset thumbnail, a selected tile is grey, #333333 in the dark theme and #e0e3e8 in the light theme, in place of the orange tint.
- Every tile has rounded 4 px corners, selected or not, as a selected tile's thumbnail has.
- The selected check icon shows its check mark black inside the orange circle in the dark theme and white in the light theme, from a disc of that color behind it, and its drop shadow is drawn around the whole mark, so none of it falls inside the check mark.
- The grid has no border, rounded corners, or background of its own, and keeps the Library tab's margin around it.
- The gap between tiles, across a row and between rows, is set by the row height the zoom sets, the one the rows aim for, not by each row's own height, so every gap on screen is the same: 2 px from 120 to 179 px, 3 px from 180 to 239 px, and 4 px from 240 to 300 px.
- The gap, each row's height, and each tile's edges land on whole device pixels, so every gap draws exactly the same width (`libraryGridLayout.ts`).
- The zoom's smallest row height is 120 px in place of 100 (`MIN_TARGET_ROW_HEIGHT`), and its largest stays 300 px.
- The grid's scrollbar sits in the Library tab's right margin, centered in it, and the tiles keep the same width whether it shows or hides: the grid reaches into the margin, a scrollbar that takes room takes it from the margin, and a padding keeps the tiles' width.
- The grid asks for the browser's thin scrollbar (`scrollbar-width: thin`), which fits the margin, in place of the `::-webkit-scrollbar` size current Chrome ignores.
- The count line reads "{matching} / {total} shown", such as "615 / 49,106 shown".
- The Play count sort's direction reads "Most → Least" and "Least → Most", without "Plays" (`LIBRARY_SORTS` in `libraryBrowseModel.ts`, and `src/test/fixtures/sort-direction-labels.json`).
- The selection bar's count reads "{n} / {matching} selected", such as "15 / 615 selected", with both numbers grouped, to match the count line's "{matching} / {total} shown".
- The Library tab's preset dropdown shows "Preset: {name}" while closed, with "Preset:" drawn inside the field before the chosen name, and its options keep their plain names. A press anywhere in the field still opens it.
  - The dropdown draws the chosen name, its "…", and its arrow itself, and "Preset:" sits in its left padding, inside its border, lined up with the Sort dropdown's and the search field's text.
  - "Preset:" is bold in the name's color, as the Filters line's "Filters:" is.
  - A message the dropdown shows in place of the presets reads the same way, such as "Preset: Loading…", and "Preset:" dims with the disabled dropdown.
  - Its loading message reads "Loading…" in place of "Loading..." (`PRESET_MENU_LOADING` in `appStore.ts`).
- The Filters line and the Random line each end with a small `chevron_right` icon at their right edge, inside their border, with the text cut off with "…" before it, and a subtle hover style, a faint grey tint, on devices that can hover (`@media (hover: hover)`).
- The preset dropdown, the search field, the Sort dropdown, and the sort direction button are the Filters and Random lines' height, 32 px, on a phone on its side too. It is set as a height, on the lines too, which every browser keeps, rather than a minimum, which Safari ignores on a dropdown. Their text stays 16 px, since Safari on iOS can zoom the page when a field with smaller text is focused, and only their padding shrinks.
- The preset dropdown and search share a row only once the Library tab's controls are 520 px wide, a panel about 546 px wide, in place of 414 px, since "Preset:" takes room from the preset's name. Narrower, a phone held upright included, they stack.
- The mockup matches what the slice shipped.

**Traps**

- The app's gap is `TILE_GAP`, 1 px, in `libraryGridLayout.ts`, which `libraryGridController.test.ts` and `screens/library.test.ts` use too, while the stylesheet's `.library-grid-row` sets its own `1px` gap and margin and names `TILE_GAP` only in a comment (`src/styles.css`).
- The justified layout gives rows fractional heights and tiles fractional widths, so a gap can draw a pixel wider where rounding falls. The mockup snaps them to whole device pixels, and its gaps then measured exactly 4 px everywhere at 1x, unselected and selected (measured).
- The grid's virtualizer works out each row's top from the row heights and the gap (`libraryGridVirtualizer.ts`), so snapped heights change its offsets, and its tests' expected positions (inferred).
- `getGridRowMeasuredHeight` and `getTileLeftOffsets` add `TILE_GAP` to one row alone, with no row height the rows aim for to work the gap out from (`libraryGridLayout.ts`).
- While a zoom gesture lasts, the rows scale as one picture, gaps included, so a gap takes its new width in the one reflow when the gesture settles, as the mockup's does.
- A row height a device remembers below 120 px fails `isTargetRowHeight`, so that device's grid starts at 160 px again (`device.read` in `library.ts`), as the mockup's does.
- `CONTEXT.md`, `docs/domain-inventory.md`, and the comments in `libraryGridController.ts` give the zoom as 100 to 300 px, and the first two give the gap as 1 px.
- `CHANGELOG.md`'s `[Unreleased]` zoom entry, Zoom the library grid, still says the row height settles from 100 to 300 px and tiles sit 1 px apart.
- A tile's picture centered by `left: 50%` and `translate(-50%, -50%)` lands a pixel short of an odd-sized tile's edge and shows that pixel of the tile behind it: in the mockup at 1x, 16 of 94 gaps drew 5 px (measured). The app's tile image fills its tile with `object-fit: cover`, which the inset thumbnail keeps, so it needs no such centering.
- In the mockup review, a white check mark looked grey with the drop shadow on the check icon itself, which the shadow falling inside the check mark's cutout explains (inferred).
- The tiles' icons take the drop shadow from `.library-grid-tile .material-symbol-icon.is-filled` (`src/styles.css`), so the selected check icon has to opt out of it to move the shadow onto the whole mark.
- The app's `.themed-scrollbar` sets `scrollbar-color`, and current Chrome ignores `::-webkit-scrollbar` sizes once `scrollbar-width` or `scrollbar-color` is set (inferred).
- A scrollbar that takes room reports its width as the grid's `offsetWidth` less its `clientWidth` while the gutter keeps its room; one that fades over the content reports none, so the mockup assumes 8 px to center it.
- happy-dom lays nothing out, so tests stub the widths the scrollbar's placement reads, as the grid's tests stub `clientWidth`.
- The count line's text comes from `formatBrowseResultSummary` (`libraryBrowseModel.ts`), and `libraryBrowseModel.test.ts`, `libraryQuerySession.test.ts`, `library.test.ts`, `screens/library.test.ts`, and its snapshot expect it without "shown". `CONTEXT.md` gives it as "{matching} / {total}".
- In the mockup review, a dropdown whose own text was transparent, with "Preset: {name}" drawn over it, lost its arrow in Firefox on the desktop and Chrome on Android, which draw the arrow in the text color, and kept it in Safari on the iPad. So the dropdown draws its own name, and only "Preset:" is drawn, in its padding, in a label a press passes through (`pointer-events: none`).
- In the mockup review, Firefox drew a dropdown's text at its padding, lined up with the search field's text, so "Preset:" starts at the dropdown's padding too.
- A padding can't follow another element's width in CSS, and the font decides how wide "Preset:" is, so the mockup measures it with a `ResizeObserver` and sets the dropdown's left padding from it.
- The preset dropdown is styled by `.library-controls select`, whose padding and the search field's are 12 px where the mockup's are 10 px, and sized in its row by `.library-controls-pair > *`, so an element around it takes its place in the row (`src/styles.css`).
- The controls take their height from a 44 px `min-height`: the dropdowns and the search field from `.library-controls select, .library-overlay-search`, with 8 px padding above and below, and the sort direction button from `.library-overlay button`. On a phone on its side, `body.short-screen` sets their `min-height` to 38 px (`src/styles.css`).
- The preset dropdown and search share a row from `@container library-controls (min-width: 414px)` (`src/styles.css`), and `CONTEXT.md` and `docs/domain-inventory.md` say they do from a panel about 440 px wide.
- In the mockup review, Safari on the iPad drew the preset dropdown at the lines' height on its own row while the other controls kept their 44 px minimum, since Safari ignores `min-height` on a dropdown.
- The lines' content is the 18 px chevron, taller than their 13.6 px text, so with 6 px padding and a 1 px border above and below they come to about 32 px, the height the mockup sets on them and the controls (inferred).
- `appStore.test.ts`, `serverConnection.test.ts`, `screens/foundation.test.ts`, and `screens/library.test.ts` expect the preset dropdown's "Loading...", and `CONTEXT.md` names it.
- `library.test.ts` expects the Play count direction's "Most Plays → Least Plays" and "Least Plays → Most Plays".
- The selection bar's text is built from `selection.count` in `LibraryOverlay.tsx`, and the matching number is `matchCount` in `library.ts`, the query's `totalCount`, which Select all's disabled state compares with and `library.ts` doesn't expose yet. `screens/library.test.ts` expects "5 selected" and the grouped 1,234 and 1,233 forms.
- At the panel's 360 px minimum, the selection bar leaves its count 184 px beside its three 44 px buttons, and a 360 px phone 186 px. "49,466 / 49,466 selected", the whole library at 16 px, measures 181 px in Noto Sans, which Firefox uses on the Linux desktop, and 175 px in Roboto, Android's font, so it fits on one line (measured). SF, the iPad's font, wasn't measured, and the count has no cut-off, so it would wrap if it ran wider.
- The Filters and Random lines (`FilterSummary` and `RandomLine` in `LibraryOverlay.tsx`) hold their label and text directly, in a button cut off with `text-overflow: ellipsis` (`.library-overlay button.library-line` in `src/styles.css`), so the text needs an element of its own for "…" to fall before the chevron. `html.theme-light .library-overlay button.library-line` sets their background, and outranks a plain `:hover` rule.
- The app's `Icon` writes the icon's name as its text, so the chevron adds "chevron_right" to each line's `textContent`, which `randomization.test.ts` and `tags.test.ts` read.

**Acceptance**

- A selected tile's thumbnail is inset 8 px on every side at every row height, its image covers the inset, and the tile is grey around it in both themes, and every tile has 4 px corners, in WebUI tests with the stylesheet.
- The selected check icon's disc is black in the dark theme and white in the light theme, and its shadow is on the whole mark, not the icon, in WebUI tests with the stylesheet.
- The grid has no border, corners, or background of its own, in WebUI tests with the stylesheet.
- Every row's height and every tile's edges are whole device pixels at 1x, 2x, and a fractional device pixel ratio, and each row's tiles and gaps add up to its width, in layout tests.
- The gap is 2 px while the rows aim for 120 to 179 px, 3 px for 180 to 239 px, and 4 px for 240 to 300 px, the same in every row whatever its own height, in layout tests.
- The zoom keeps the row height the rows aim for from 120 to 300 px, in the zoom's tests.
- With a scrollbar that takes room and one that doesn't, the scrollbar's middle is at the margin's middle and the tiles keep the same width, in WebUI tests of the grid with stubbed scrollbar widths.
- The count line reads "{matching} / {total} shown", in WebUI tests of the Library tab.
- The Play count sort's direction reads "Most → Least" and "Least → Most", in the direction label tests against `sort-direction-labels.json`.
- The selection bar's count reads "{n} / {matching} selected" with both numbers grouped, in WebUI tests for selection.
- The closed preset dropdown shows a bold "Preset:" in its left padding before the name it draws itself, a message included, its options keep their plain names, a press on "Preset:" reaches the dropdown, and its loading message reads "Loading…", in WebUI tests with the stylesheet.
- The Filters and Random lines end with `chevron_right` after their text, which is cut off with "…", and tint on hover only under `@media (hover: hover)`, in WebUI tests with the stylesheet.
- The preset dropdown, the search field, the Sort dropdown, the sort direction button, and the Filters and Random lines share one `height`, on a phone on its side too, and the controls' text stays 16 px, in WebUI tests with the stylesheet.
- The preset dropdown and search share a row once the controls are 520 px wide and stack narrower, in WebUI tests with the stylesheet.
- The mockup matches what the slice shipped, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Bulk actions slice

**Scope**

- Selection actions opens a menu in three groups: Add to favorites, Remove from favorites, Add to blacklist, and Remove from blacklist; Rate…, Edit tags…, and Clear playback stats…; and the delete action, in red, named for what it does: it deletes the selected items' files from disk and removes them from the library.
- The menu's items are built as the shared context menu's item list in `src/ui/`, which the Context menu slice opens at the pointer and WebUI Context Menus reuses across the app, so every menu has one look.
- An item has a label, may be red for a destructive action, and may be disabled with its reason as its tooltip, and items sit in groups with a divider between them.
- Add to and Remove from favorites and the blacklist send one request to `POST /api/bulk/item-state`, and Clear playback stats sends ids.
- Rate… opens an in-app dialog with Item Ratings' star control, designed in the mockup, which sets the chosen rating on every selected item, or clears it, in one `POST /api/bulk/rating` request.
- Bulk Add to favorites clears each item's blacklisting, and Add to blacklist clears its favorite, as the player's buttons do.
- Clear playback stats… asks "Clear playback stats for {n} items?", with Cancel focused and a red Clear.
- The delete action is an admin action. From another machine it asks for the control token first, in a control-token prompt that this milestone builds on `POST /control/pair`; on the server machine, which the merged localhost helper decides, it asks for none. It then asks to confirm, naming the count, and sends the selection to `POST /api/library/delete-files`.
- WebUI Admin Section's gate reuses the control-token prompt.
- The delete action's confirmation always says the files will be permanently deleted from disk, with no choice to keep them.
- The wording of the delete action:
  - The token prompt is a dialog titled "Control token" that says "This is an admin action. Enter the server's control token.", with the token field under the field validation pattern and Continue.
  - The action's name, its confirmation, its Your actions popup, and what it says when some files couldn't be deleted (`failedItemIds`) are settled in the mockup review, starting from "Remove {n} items from the library and permanently delete their {n} files from disk? This can't be undone." with a red Remove and Delete, and "1 item" and "its file" for one.
- The delete action ends selection.
- Selected items that leave the results other than by the app deleting their files, as a rating under Only unrated or a favorite change under Favorites only takes them out, here or on another device, or a refresh removes them because their files are gone, leave the selection, so an action never reaches an item the grid doesn't show, and "{n} / {matching} selected" and Select all's disabled state count only items that match.
- Each Your actions popup's {n} is the `count` the bulk route answers.
- Clear-stats publishes `resyncRequired` with the `lastEventId` and `currentRevision` its OpenAPI schema requires, in place of a payload with only its reason.
- The slice measures the size of a bulk event that changes every item of the catalog, and a bulk change above the size it settles on publishes `resyncRequired` in place of its bulk event.
- A favorite or blacklist answer applies to the item it was for. The fix is straightforward: cache the answer under its `itemId` and apply it only when that item is still playing.

**Traps**

- The desktop acted on selected items from its context menu: add to or remove from favorites and the blacklist, add or remove tags, clear playback stats, and remove from library.
- The Selection actions menu is an empty container placed by CSS above its button, with no item markup or styles and no clamping to the window (`src/ui/LibraryOverlay.tsx`, `src/styles.css`).
- `toggleFlag` in `src/playback/player.ts` clears the other flag when it sets one.
- `src/playback/player.ts` applies a favorite or blacklist answer to the item playing when the answer arrives, so pressing Next before it does marks the new item locally and caches that state under its id until an event for it corrects it.
- The server's answer carries the changed item's `itemId` and both flags (`LibraryStateResponse`, the answer of `POST /api/favorite` and `POST /api/blacklist`).
- The WebUI's requests read every 401 as a device that needs pairing (`createServerRequester` in `src/api/serverRequest.ts`), so delete files refuses with 403 and `control_token_required`, and the control-token prompt posts `/control/pair` without that handling, as pairing posts `/api/pair` (`serverConnection.ts`).
- Clear-stats publishes `resyncRequired` with only `{ reason: "playbackStatsCleared" }` (`ClearPlaybackStats` in `ServerHostComposition.cs`), so every device does a full resync after a clear, and the WebUI never sent clear-stats before this milestone.
- A bulk event lists every item it changed, about 147 bytes each, so one that changes every item of the 49,466-item catalog is about 7 MB (inferred).
- Every open device gets each event, and the server keeps its last 256 events for replay (`EventHistoryCapacity` in `ServerStateService.cs`).
- Selection drops items only on Clear selection, a deselect, a new search or filter, or `itemsRemoved`, and Select all is disabled while the selected count equals the window's `totalCount` (`allSelected` in `src/library/library.ts`), so a selected item that leaves the results some other way stays selected and counted, and Select all can read "Everything is already selected" while a matching tile isn't selected.
- A refresh removes the items whose files are gone from their source folder and publishes only `refreshCompleted`, which reloads the window; the server publishes `itemsRemoved` only from delete files and duplicate apply (`ServerHostComposition.cs`), so items a refresh removes stay selected.
- The WebUI loads only some pages of the results, so which selected items still match, among those not loaded, needs a read from the server, as `POST /api/library/query-ids` gives (inferred).

**Acceptance**

- The WebUI applies favorite, blacklist, clear stats, and, for admins, the delete action to all selected items, in WebUI tests for each bulk action.
- Each bulk action applies to every item Select all selected, including items not loaded, in WebUI tests for each bulk action.
- The delete action asks to confirm with the count and says the files will be permanently deleted from disk, in WebUI tests for each bulk action.
- From another machine, the delete action asks for the control token in the control-token prompt before its confirmation, and on the server machine it asks for none, in WebUI tests of the control-token prompt.
- Bulk Add to favorites clears blacklisting, and Add to blacklist clears favorite, on each selected item, in WebUI tests for each bulk action.
- Bulk favorite and blacklist send one request for the whole selection, in WebUI tests for each bulk action.
- Rate… sets or clears the rating on every selected item, including items Select all selected that aren't loaded, in one request, and says so in its Your actions popup, in WebUI tests for each bulk action.
- A favorite or blacklist answer that arrives after Next applies to the item it was for, not the item now playing, in WebUI tests for a favorite answer after Next.
- The device that made a bulk change shows only its Your actions popup, with the count the server answered, in WebUI tests for each bulk action.
- Clear-stats' `resyncRequired` carries `lastEventId` and `currentRevision` and matches its OpenAPI schema, in server tests for clear-stats.
- The size of a bulk event that changes every item of the catalog is recorded, and a bulk change above the size settled on publishes `resyncRequired` in place of its bulk event, in server tests for the bulk routes.
- A selected item that a bulk action, a single change, another device's change, or a refresh takes out of the results leaves the selection, loaded or not, and "{n} / {matching} selected" and Select all's disabled state then follow the items that match, in WebUI tests for selection.
- `npm run verify` passes.

#### Context menu slice

**Scope**

- A right-click on a library tile with a mouse opens an app-styled context menu with the Selection actions menu's options.
- Its actions apply to the selection when the tile is in it, and to that tile alone when nothing is selected.
- It is for mouse pointers; touch screens keep the long press and the Selection actions menu.
- Esc and a press outside close it, as they close the Selection actions menu.
- It is built as a shared context menu component in `src/ui/`, showing the Selection actions menu's item list.
- It opens at a point with a list of items, and isn't tied to tiles or to the right-click that opened it, so WebUI Context Menus can open it from other surfaces and from a long press.
- It is placed by script and kept inside the window near its edges, as the bell's list is, and renders inside the fullscreen stage, so it shows in fullscreen and iOS pseudo-fullscreen and the panel doesn't clip it.
- One menu is open at a time: opening one closes any other, the Selection actions menu included.
- It closes when its tile leaves the grid, when the Library tab hides, and before an action's dialog opens.
- A right-click on a tile shows only this menu, never the browser's own.
- Esc's row in the shortcut list reads "Close the top dialog, a menu, the notifications list, the rating stars, or the panel, clear selection, or leave fullscreen".
- Test helpers open a menu at a point, list its items, pick one, and check that it stays inside the window.
- Its look, and what a right-click on a tile outside the selection does during a selection, are settled in its mockup review, which comes first.

**Traps**

- The Selection actions menu closes on a press outside it or Esc through `useLightDismiss` (`src/ui/LightDismiss.ts`), which the bell's list and the rating's popover use too.
- `useLightDismiss` stops the press or Esc that closes a popover with `stopPropagation`, not `stopImmediatePropagation`, so two of its popovers open at once would both close on one Esc (inferred).
- A tile pressed with a finger or a pen blocks the browser's own menu, and a mouse's right-click is left to the browser (`src/library/libraryTilePress.ts`), which `libraryTilePress.test.ts` asserts.
- The bell's list is `position: fixed`, placed by script under the bell, kept 8 px inside the window, and placed again on resize (`NotificationList` in `src/ui/Notifications.tsx`).
- The in-app dialogs and the bell's list render inside `#fullscreen-stage` (`src/ui/Stage.tsx`), and in pseudo-fullscreen the stage is `position: fixed` with `z-index: 9999` (`src/styles.css`).
- The panel hides its overflow and is a size container (`.panel` in `src/styles.css`), so a menu rendered inside it could be clipped or stacked under other parts (inferred).
- The Esc row's text is in `src/keyboard/shortcuts.ts`, and the shortcut reference test checks it.
- happy-dom lays nothing out, so tests stub the sizes a menu's placement reads, as `stubLayoutSize` and `setViewport` in `src/test/screens/pageHarness.ts` do.

**Acceptance**

- A right-click on a tile in the selection opens the context menu, whose actions apply to the selection, and on a tile with no selection, to that tile alone, in WebUI tests of the context menu.
- A long press on a touch screen doesn't open it, in WebUI tests of the context menu.
- The menu opens at the pointer and stays inside the window when opened near an edge, in WebUI tests of the context menu with stubbed sizes.
- The menu renders inside the fullscreen stage, and opening it closes the Selection actions menu, and opening that menu closes it, in WebUI tests of the context menu.
- The menu closes when its tile leaves the grid, when the Library tab hides, and before an action's dialog opens, in WebUI tests of the context menu.
- The context menu and the Selection actions menu show the same items, in WebUI tests of the context menu.
- Esc's row reads "Close the top dialog, a menu, the notifications list, the rating stars, or the panel, clear selection, or leave fullscreen", in the shortcut reference test.
- The mockup matches what the slice shipped, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Tag edits slice

**Scope**

- The WebUI edits several items' tags in the Tags tab, with no dialog.
- Edit tags in Selection actions opens the Tags tab with the line "Editing tags for {n} items", like the line WebUI Tags and Filter Tabs shows for an item that isn't playing.
- While the tab edits several items, a collapsed category's count is how many of its tags the selected items have, and a chip shows green for a tag all of them have and orange for a tag only some have, and Add or Remove applies to all of them. The counts come from the tag-editor model's `countsOnly` read.
- Save applies the changes to every selected item and says "Updated tags on {n} items.".
- The tab edits the selection while selection lasts; if selection ends with unsaved changes, it keeps those items until the changes are saved or discarded.
- Choosing Edit tags while the tab holds unsaved changes to another item's tags asks "Discard changes?" first.

**Traps**

- The desktop's `ItemTagsDialog` added and removed tags across all selected items at once; the WebUI tag editor works on the current item only.

**Acceptance**

- Edit tags opens the Tags tab with "Editing tags for {n} items", with no dialog. Its chips show green for a tag every selected item has and orange for one only some have, and Save applies the changes to every selected item, in WebUI tests for each bulk action.
- Tag add and remove apply to all selected items, in WebUI tests for each bulk action.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Release checks

- Manual: In the WebUI on a desktop browser and a phone, select several items, and every matching item with Select all, apply each bulk action but the delete action, and the tiles update.
- Manual: Copy a throwaway video into a source folder and refresh the library, then in a desktop browser select its tile and delete it with the delete action: the file is gone from the folder and its tile from the grid.
- Manual: On the iPad and the Android phone, a long press on a library tile selects it and starts selection, with no menu or text highlight of the browser's own.
- Manual: On a desktop browser, the iPad, and the Android phone, every gap in the library grid looks the same, unselected and selected, and the grid's scrollbar sits in the tab's right margin.

#### Not included

- The filter summary line, which is WebUI Library Tab.
- Clearing the whole library's playback stats, which is Admin Refresh, Backup, and Duplicate Review.
- Keep Playing, which is WebUI Autoplay Modes, whose Timer mode replaces it.
- Loudness normalization, which is WebUI Loudness Normalization.
- Removing a source with its items, which is Admin Source Management.
- Removing items from the library while keeping their files, since the next refresh would add the files back as new items.
- A context menu anywhere but on library tiles, and turning the browser's own menu off across the app, which is WebUI Context Menus.
- Ctrl+click selection on a Mac, where browsers send Ctrl+click as a right-click.

### M12n1 - WebUI Context Menus

- **Status**: ⏳ Planned
- **Goal**: A right-click, or a long press on a touch screen, opens an app-styled menu of actions on the player, the now-playing name, tags, categories, presets, sources, notifications, and file paths across the WebUI, in place of the browser's own menu.
- **Depends on**: WebUI Multi-Select and Bulk Actions, whose shared context menu, item list, and delete action the menus here use.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The browser's own right-click menu is off across the app, except in text fields, the inputs that take text and textareas, which keep it for copy, paste, and spell check.
- Every menu is the shared context menu WebUI Multi-Select and Bulk Actions builds, with its look and item list.
- A right-click opens a surface's menu anywhere on it, its buttons included, and a right-click where no menu exists opens nothing.
- On a touch screen or with a pen, a long press opens a surface's menu wherever it has one, except on buttons, library tiles, which a long press selects, drag handles, the rating stars, and the panel's resize handle, so buttons stay free for WebUI Tooltips' long press.
- A long press uses up the click it ends with, so it never also presses, toggles, or plays what it opened on.
- Copy items stand in for the browser's Copy on selected text, which goes with its menu: Copy name and Copy path for files, Copy text for notifications, and Copy for the Settings tab's diagnostics IDs.
- Show in File Manager sits wherever Copy path does, shown while the version check lists `api.showInFileManager`, as the Stats tab's button is.
- Menus hold actions on their item, not playback controls.
- An item that can't act at the moment is disabled with its reason as its tooltip.
- A menu item works as the control it repeats does, with the same confirmations, the same wait for Save or Apply, and the same popups.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | Every menu, its items, wording, and order, and the long press, approved in Firefox on the desktop, on the iPad, and on an Android phone. |
| Foundation | ⏳ Planned | The browser's own menu off across the app except in text fields, a long-press opener shared with the library tiles, and menus closing on scroll, resize, and the browser tab hiding. |
| Player | ⏳ Planned | Menus on the player's picture, the header's now-playing name, and the Stats tab's file path, and Copy path and Show in File Manager on library tiles. |
| Tags tab | ⏳ Planned | Menus on the Tags tab's tags and categories and on the Stats tab's tags. |
| Filter tab | ⏳ Planned | Menus on the Filter tab's preset rows and sources. |
| Notifications, Auto Tag, and Settings | ⏳ Planned | Menus on the bell's list entries, the popups, Auto Tag's file rows, and the Settings tab's diagnostics IDs, and the unused notification code removed. |

#### Mockup slice

**Scope**

- The mockup shows every menu of this milestone in the shared menu's look:
  - the player's picture, the header's now-playing name, and the Stats tab's file path;
  - the library tiles' Copy path and Show in File Manager;
  - the Tags tab's tags and categories, and the Stats tab's tags;
  - the Filter tab's preset rows and sources;
  - the bell's list entries and the popups;
  - Auto Tag's file rows and the Settings tab's diagnostics IDs.
- It shows a long press opening them on a touch screen, and a right-click where no menu exists opening nothing.
- The review settles each menu's wording and order, and:
  - what the player's menu does with nothing playing;
  - what the player shows after Delete file removes the playing item;
  - whether Filter by this tag replaces the applied filter or adds the tag to it, and whether it applies at once;
  - whether New tag in this category opens a name dialog or sets the category in the Tags tab's footer;
  - the name Duplicate gives a preset's copy;
  - what Apply on a preset row does while the Filter tab holds unsaved changes;
  - the wording of a tag's Add to item and Remove from item beside the footer's Add tag, which creates a tag.
- Before the app is built, the user approves the design in Firefox on the desktop, on the iPad, and on an Android phone.

**Traps**

- The mockup has no context menu; its only `contextmenu` handler blocks the browser's menu after a touch press on a tile (`build/layout.src.html`).
- The mockup's Selection actions menu is `#bulk-menu.menu`, plain buttons in groups split by `hr.menu-rule`, with `.menu-danger` for the delete action (`build/layout.src.html`).
- `check.mjs` runs the pages in happy-dom with no layout, so where a menu lands and how a long press feels can only be judged on the devices.
- New icons go in `ICONS` in `build_font.py`; one missing from the subset shows as the `error` glyph.

**Acceptance**

- The mockup shows the menus as the user approved them in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.

#### Foundation slice

**Scope**

- A document-level `contextmenu` listener blocks the browser's own menu everywhere but in text fields: `input` elements that take text, and `textarea`.
- The library tiles' long press (`src/library/libraryTilePress.ts`) becomes a shared long-press helper in `src/ui/`, with the same rules: it fires after 500 ms, moving 8 px, a second finger, a scroll the browser takes over, or lifting first cancels it, and the click it ends with is used up.
- The tiles' selection and every menu's long press use that helper.
- A surface with a menu sets `-webkit-touch-callout: none`, so Safari on iOS shows no callout of its own on a long press.
- A menu closes on scroll, resize, and the browser tab hiding, as well as when WebUI Multi-Select and Bulk Actions closes it.

**Traps**

- `takesKeys` in `src/keyboard/shortcuts.ts` is the app's check for a field that takes keys, but it counts `<select>`, so it isn't the text-field test as it is.
- The app's text fields are `type="text"` and `type="search"` inputs, its only `<textarea>` is Copy Path's short-lived fallback field, and it has no `contenteditable`.
- The tiles' long press is tile-specific: it takes a `tileItemId` option and blocks the browser's menu only after a finger or pen press on a tile (`src/library/libraryTilePress.ts`).
- Safari on iOS sends no `contextmenu` on a long press and shows its own callout, so a long press is timed from pointer events, as the tiles' is (inferred).
- Chrome on Android sends `contextmenu` on a long press, so blocking it also stops its image menu and its long-press text selection (inferred).
- Firefox opens its own menu on Shift+right-click whatever the page does (inferred).
- The keyboard's Menu key and Shift+F10 send `contextmenu` from the focused element, often without a pointer position (inferred).
- The browser's menu on the `<video>` offers Loop, which sets the video's `loop` without the app's Loop button following, since the app sets `video.loop` itself (`src/playback/player.ts`) (inferred).

**Acceptance**

- A right-click outside a text field opens no menu of the browser's own, and one in a text or search field leaves the browser's menu, in WebUI tests of the block.
- The library tiles' long press selects as before through the shared helper, in `libraryTilePress.test.ts`'s tests moved to the shared helper.
- The shared helper fires at 500 ms, is cancelled by moving 8 px, a second finger, or lifting first, and uses up the click it ends with, in tests of the shared long-press helper.
- A menu closes on scroll, resize, and the browser tab hiding, in WebUI tests of the context menu.
- The mockup matches what the slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Player slice

**Scope**

- The player's menu opens from its picture, not from its controls, buttons, or scrub bar, and holds the playing item's actions:
  - Add to or Remove from favorites, and Add to or Remove from the blacklist, as the player's buttons do;
  - Rate…, which opens the rating's stars as the star button does;
  - Edit tags, which opens the Tags tab, and Show stats, which opens the Stats tab;
  - Copy name, Copy path, and Show in File Manager;
  - Clear playback stats…, which asks first and sends the item's id to `POST /api/playback/clear-stats`;
  - Delete file…, WebUI Multi-Select and Bulk Actions' delete action for the one item, with its control-token prompt from another machine and its confirmation.
- The player's controls stay shown while its menu is open, as they do for the bell's list and the rating's stars.
- The header's now-playing name has a menu with Show stats, Copy name, Copy path, and Show in File Manager.
- The Stats tab's file path has a menu with Copy name, Copy path, and Show in File Manager.
- A library tile's menu gains Copy path and Show in File Manager, disabled with their reason while several items are selected.
- Copy path works on every device, the server machine included, where the Stats tab shows only Show in File Manager today.
- The now-playing name shortens with "…", as the rest of the app does, in place of "...".

**Traps**

- The player handles taps, double-taps, swipes of more than 50 px, and two-finger volume drags (`src/playback/mediaGestures.ts`), and times no hold, so a held touch that ends without moving counts as a tap.
- The click a long press ends with would show or hide the controls or start the double-tap seek window, so the opener has to use it up and clear the tap the gestures noted (`tapX` in `src/playback/mediaGestures.ts`).
- Hidden controls take no pointer events (`pointer-events: none` in `src/styles.css`), so a press where they hide lands on the picture.
- The controls stay shown only while the bell's list or the rating's stars are open (`openFromControls` in `src/state/appServices.ts`).
- The player claims its touches (`touch-action: none` on `.media-container` in `src/styles.css`), which doesn't stop the browser's own long-press callout on the photo (inferred).
- `copyPath` puts its fallback field next to the element it's given (`src/stats/fileLocation.ts`), so a menu item passes its own element.
- The Stats tab shows Show in File Manager while the version check lists `api.showInFileManager`, which the server lists only for a browser on the server machine while it has a desktop, and Copy Path otherwise (`src/ui/StatsTab.tsx`).
- The header's now-playing name is a `<span>` whose click opens the Stats tab, with the full name and "Show stats" as its tooltip (`src/ui/Header.tsx`), and the header sits outside the fullscreen stage.
- The player doesn't handle `itemsRemoved`; only the library window, the Stats tab, and the loudness baseline do (`src/library/library.ts`, `src/stats/statsTab.ts`, `src/stats/libraryBaseline.ts`).
- `POST /api/playback/clear-stats` takes `itemIds`.
- Library tiles carry their file's full path (`fullPath` in `src/library/libraryProjectionModel.ts`).
- The now-playing name shortens with "..." (`src/playback/nowPlaying.ts`).

**Acceptance**

- A right-click or a long press on the player's picture opens its menu, and one on its controls or scrub bar doesn't, in Player screen tests.
- Each of the player menu's items acts on the playing item as the control it repeats does, Clear playback stats and Delete file ask first, and Delete file asks for the control token from another machine, in Player screen tests.
- The click a long press ends with neither shows nor hides the controls nor starts a double-tap seek, and a swipe or a two-finger drag opens no menu, in gesture tests.
- The controls stay shown while the player's menu is open, in player controls tests.
- The now-playing name's, the Stats path's, and a tile's menus copy the name or path and show the file in the file manager while the server lists it, and a tile's are disabled with their reason while several items are selected, in Header, Stats, and library screen tests.
- The now-playing name shortens with "…", in now-playing tests.
- The mockup matches what the slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Tags tab slice

**Scope**

- A tag's menu holds Add to item, Remove from item, Edit…, Delete…, and Filter by this tag.
- A category's menu holds New tag in this category, Edit…, and Delete…, and Uncategorized's holds only New tag in this category.
- Delete… asks first and waits for Save, as the Edit Tag and Edit Category dialogs' Delete does.
- Filter by this tag works through the Filter tab's tag filter, as the mockup review settles.
- The Stats tab's tags each have a menu with Filter by this tag.
- A tag's Add and Remove buttons, disabled while no item is loaded, give their reason as their tooltip, as the menu's items do.

**Traps**

- The tag editor edits one item, the playing one or the one it holds (`src/tags/tagEditor.ts`), and every change waits for Save, deletes included.
- A tag's Add and Remove are disabled while no item is loaded (`canChangeItems` in `src/tags/tagEditorModel.ts`) and keep the tooltips "Add tag" and "Remove tag" without a reason (`src/ui/TagEditor.tsx`).
- A tag's "Add tag" tooltip is also the footer's Add tag, which creates a tag in the catalog.
- A tag's rename, category, and Delete live only in the Edit Tag dialog, and a category's rename and Delete only in the Edit Category dialog, whose Delete moves the category's tags to Uncategorized (`src/tags/tagEditor.ts`).
- The Filter tab's Tags section includes or excludes tags (`src/ui/FilterDialog.tsx`), and nothing in the Tags tab links to it.
- A new tag's category is picked in the footer's dropdown (`src/ui/TagEditor.tsx`).
- A category's drag handle starts a drag only after moving 5 px (`src/reorder/reorder.ts`), and its header notes where a press began without timing a hold (`src/ui/TagCategory.tsx`).
- The Stats tab's tags are plain text (`src/ui/StatsTab.tsx`).

**Acceptance**

- A tag's menu adds the tag to or removes it from the item, opens Edit Tag, deletes the tag after asking, pending until Save, and filters the library by it, in Tags screen tests.
- A category's menu starts a new tag in it, opens Edit Category, and deletes it after asking, pending until Save, and Uncategorized's holds only New tag in this category, in Tags screen tests.
- The Stats tab's tag menu filters the library by the tag, in Stats screen tests.
- A tag's disabled Add and Remove give their reason, in Tags screen tests.
- A long press on a tag or a category's header opens its menu, and one on their buttons or a drag handle doesn't, in Tags screen tests with touch pointers.
- The mockup matches what the slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Filter tab slice

**Scope**

- A preset row in the Presets section's list has a menu with Apply, Load into filter, Update from filter, Duplicate, Edit…, and Delete….
- Apply applies the preset to the library at once, as picking it in the Library tab's preset dropdown does.
- Load into filter and Update from filter do what Load preset and Update preset do for the preset chosen in the section's dropdown.
- Duplicate adds a copy of the preset, pending until Apply as the list's other changes are.
- Delete… asks first, as Edit Preset's Delete does, and waits for Apply.
- A source in the Sources section has a menu with Only this source, which checks it and unchecks the others.
- A disabled source's checkbox and its Only this source give the reason as their tooltip.

**Traps**

- The Presets section's list changes, rename, delete, and reorder, wait for Apply (`src/filter/filterDialog.ts`).
- Load preset and Update preset work on the preset chosen in the section's dropdown (`src/ui/FilterDialog.tsx`).
- Picking a preset in the Library tab's preset dropdown applies it at once (`#preset-select` in `src/ui/LibraryOverlay.tsx`).
- A preset row's drag handle starts a drag on pointer down (`src/ui/Reorder.tsx`).
- `filterWithGeneralDraft` writes an empty source list when every listed source is checked, and an empty list means every source (`src/filter/filterDialogModel.ts`).
- A disabled source's checkbox has no tooltip (`src/ui/FilterDialog.tsx`).
- Source rows are labels around their checkbox, so the click a long press ends with would toggle it unless it is used up (inferred).

**Acceptance**

- Each preset row menu item works as the control it repeats does, Duplicate adds a copy pending until Apply, and Delete asks first, in Filter screen tests.
- Only this source checks only that source, and a disabled source's checkbox and menu item give their reason, in Filter screen tests.
- A long press on a preset row outside its drag handle, or on a source, opens its menu without starting a drag or toggling the source, in Filter screen tests with touch pointers.
- The mockup matches what the slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Notifications, Auto Tag, and Settings slice

**Scope**

- An entry in the bell's list has a menu with Copy text, Dismiss, which removes that entry, Clear all, and Notification settings.
- A menu opened from the bell's list keeps the list open while it is used.
- A popup has a menu with Copy text and Dismiss, and holds its timer while the menu is open, as hovering does.
- An Auto Tag file row has a menu with Copy path, shown inside the Auto Tag dialog, and Escape closes it before the dialog.
- Each of the Settings tab's diagnostics IDs has a menu with Copy.
- The unused `toggleList` and `dismissAll` in `src/notifications/notifications.ts` go, with the test that calls `dismissAll`.

**Traps**

- The bell's list has Clear all, Close, and Notification settings, and no action on one entry (`src/ui/Notifications.tsx`).
- The bell's list closes on a press outside it through `useLightDismiss` (`src/ui/LightDismiss.ts`), so a press in a menu rendered outside the list would close it (inferred).
- Popups close with their Dismiss or a swipe on a touch screen (`touch-action: pan-y`), and hovering pauses their timer (`src/ui/Notifications.tsx`).
- Auto Tag is a modal dialog opened with `showModal()` (`src/ui/Dialog.tsx`), so the rest of the page is inert and a menu for its rows has to render inside it (inferred).
- `useLightDismiss` skips Escape while a dialog is open, and a dialog closes on its own Escape (`src/ui/Dialog.tsx`), so a menu inside one needs its own place before the dialog's.
- Auto Tag's file rows are labels around their checkbox, with the full path as their tooltip (`src/ui/AutoTag.tsx`).
- `toggleList` has no caller, and `dismissAll` is called only from `src/test/screens/notifications.test.ts` (measured).
- The Settings tab's diagnostics IDs are plain text (`src/ui/SettingsTab.tsx`).

**Acceptance**

- An entry's menu copies its text, dismisses only it, clears all, and opens Notification settings, and the list stays open while the menu is used, in notifications screen tests.
- A popup's menu copies its text and dismisses it, and its timer holds while the menu is open, in notifications screen tests.
- An Auto Tag file row's menu shows inside the dialog and copies the path, and Escape closes the menu before the dialog, in Auto Tag screen tests.
- Each diagnostics ID's menu copies it, in Settings screen tests.
- A long press on an entry, a popup, an Auto Tag row, or a diagnostics ID opens its menu without dismissing, swiping, or toggling, in screen tests with touch pointers.
- The mockup matches what the slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Release checks

- Manual: In Firefox on the desktop, right-clicking the player, a tag, a preset, and a notification opens the app's menu, and right-clicking in the library search opens Firefox's own.
- Manual: On the iPad and the Android phone, a long press on the player's picture and on a tag opens the app's menu with no callout or menu of the browser's own, and a long press on a library tile still selects it.

#### Not included

- A context menu on dropdowns, the Library tab's preset dropdown included.
- A log row's menu, which is Log Viewer Redesign.
- A duplicate file card's menu, which is Admin Refresh, Backup, and Duplicate Review.
- A source row's menu in the admin section, which is Admin Source Management.
- A backup row's menu, which is Admin Library Catalog Transfer.
- A menu on the profile picker's rows, which is Library Profiles.
- Collapse all and Expand all for tag categories.
- Resetting a setting or a filter control from a menu.
- Moving the panel to the other side from a menu.
- Frame steps from the player's menu.
- Select all and Select none for sources, and clearing a filter tag or a category's filter tags from a menu.
- Playing a file from Auto Tag's rows.
- Playback controls in the player's menu.
- Copy on selected text outside text fields, which the browser's menu gave; Ctrl+C still copies it.
- Firefox's Shift+right-click, which always opens Firefox's own menu.
- Opening a menu from the keyboard.

### M12n2 - WebUI Loop Range

- **Status**: ⏳ Planned
- **Goal**: With Loop on, the user can set a start and an end marker on a video's scrub bar, and the video repeats between them.
- **Depends on**: WebUI Autoplay Modes, whose Timer mode's repeating stretch the markers define while they are set.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- With Loop on, the user can set a start and an end marker on a video's scrub bar, and the video repeats between them, in Normal and Timer mode and with Autoplay off.
- While markers are set, they define Timer mode's repeating stretch, in place of the stretch that starts where a seek lands and runs for Advance after.
- A repeat between the markers only moves the video's position: nothing loads again, shows Loading…, or records another play, as Loop's other repeats do.
- Before the app is built, the markers are designed in the mockup and approved: how they are set, moved, and cleared with a mouse and on a touch screen, and whether a shortcut sets one at the current position; how they show on the scrub bar beside Timer mode's stretch; whether a video keeps them when it plays again or the page refreshes; and what they do while Loop stops autoplay is off.

#### Traps

- The scrub bar is a native range input that the player sets rather than renders from state, so a re-render never moves it while it is dragged (`seekSlider` in `src/playback/player.ts`). Markers drawn on it must leave the bar its own dragging (inferred).
- WebUI Autoplay Modes wraps the scrub bar in `seek-wrap`, with Timer mode's stretch, `seek-loop`, behind its track, inset by half the thumb's width at each end so it lines up with the thumb.
- WebUI Player Controls keeps the controls shown while the scrub bar or volume is dragged, so dragging a marker has to keep them shown too (inferred).
- The keyboard shortcuts WebUI Keyboard Shortcuts adds, listed in the mockup's shortcut reference, already take most of the keys a marker could use.
- WebUI Context Menus opens the player's menu from its picture, not from its controls, so a right-click or a long press on the scrub bar is free for the markers.

#### Acceptance

- With Loop on and both markers set, a video repeats between them with Autoplay off and in Normal and Timer mode, in player and Player screen tests.
- While markers are set, Timer mode's repeating stretch is the range between them, in a test.
- A repeat between the markers records no other play and keeps the video's source, in a test.
- The markers are set, moved, and cleared as the approved mockup shows, by mouse and touch, and by a shortcut if the approved mockup gives one, in Player screen tests.
- The mockup shows the markers as approved and matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Release checks

- Manual: On the iPad and a desktop browser, setting, moving, and clearing the markers on the scrub bar works by touch and by mouse, and a video repeats between them.

#### Not included

- Markers on a photo, whose scrub bar is its timer.

### M12n3 - Library Profiles

- **Status**: ⏳ Planned
- **Goal**: Each device chooses a profile from a picker in the header, a named view of the library that shows only the sources picked for it.
- **Depends on**: Per-Preset Preset Writes, whose preset ids each profile remembers its preset by, Item Ratings, whose rating event gains the item's source id, Browser-Playable Filter, whose shared tab rule Add Profile and Edit Profile's tabs use, WebUI Multi-Select and Bulk Actions, whose ids-only query, selection, and bulk events follow the active profile, and WebUI Context Menus, whose menu and long press a picker row's menu uses.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- A profile is a view over the library's data. Favorites, the blacklist, ratings, play history, tags, tag categories, and presets aren't copied per profile, and a change made in any profile shows in every profile.
- Until accounts exist, the library is one implicit account with several profiles.
- A profile's sources are all of them, following newly added ones, or a chosen list.
- The default profile always shows everything and can't be deleted. It is listed first, starts as "Main" in the brand orange (`#ef7f22`), takes the name and color the user sets, and its Edit Profile dialog has only the General tab.
- Profiles are stored in `library.db`, since they refer to source ids, tag names, and preset ids that mean something only in one catalog, so they travel with catalog export, import, and backups.
- Each request that lists, counts, or picks items names the active profile in an optional `profileId`. Without one, or with an id the catalog doesn't have, the server uses the default profile, so a device that was offline when its profile was deleted keeps working.
- The server applies the active profile's sources to the library query and its counts, its ids-only option, random picks and their cycle numbers, library stats, and Auto Tag's scan, together with enabled sources and any filter or preset. A filter or preset naming a source the profile hides just leaves it out, and when nothing remains the library shows its usual empty message.
- Item reads, library play, media, and thumbnails name no profile: the playing item, history, and queue carry on across a switch, and only the next random pick uses the new profile.
- The event stream names no profile, and the WebUI applies its profile to the events it receives, since every event goes to every subscriber through one shared history and a stream per profile would have to reconnect on every switch.
- Other devices popups, and the refresh's notice of kept folders, leave out items and folders in sources the active profile hides. The item events carry each item's `sourceId` for this.
- The admin section ignores profiles and covers the whole library.
- Each device remembers its active profile, and each profile remembers its last applied filter or preset on each device.
- Each profile has its own default filter, which None and Clear all load and which the Filter tab's Update changes while Choose Preset is on None.
- A new profile starts with the default profile's default filter.
- Switching while the Filter or Tags tab holds unsaved changes asks "Discard changes?" first.
- The picker hides with the header, in fullscreen and on a phone on its side, where the user turns the phone upright to switch.
- Add Profile and Edit Profile's tabs are text tabs of the shared tab rule that Browser-Playable Filter adds, as the Filter tab's sub-tabs are.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | The whole profiles design, including the tag, category, and preset visibility that Profile Tag and Preset Visibility builds, approved on a desktop browser, the iPad, and an Android phone. |
| Server | ⏳ Planned | Profiles and their sources in a new catalog schema step, the profile store, the profile's sources in the library query, its counts, random picks, library stats, and Auto Tag's scan, library stats without disabled sources, and `profilesChanged`. |
| Contract | ⏳ Planned | The profile routes, `profileId` on the scoped requests, `sourceId` on the item events, and `profilesChanged`, in OpenAPI, the generated WebUI types, and `docs/api.md`. |
| WebUI | ⏳ Planned | The header's profile button and picker, Add and Edit Profile's General and Sources tabs, switching, the per-device memory, the scoped tabs, and the profile rule for popups and notices. |

#### Mockup slice

**Scope**

- The header's profile button, first in its right-hand group, before the admin icon: the active profile's colored circle with its first letter, in white or dark, whichever stays readable on the color.
- Its picker, styled like the bell's list: the default profile first, then the others alphabetically, each with an edit icon, and Add Profile at the bottom.
  - It closes on Escape, a press outside it, a choice, and the panel opening, but only when the panel covers the screen.
  - It hides with the header in fullscreen and on a phone on its side.
  - A row's context menu holds Edit… and Delete…, with Delete… disabled on the default profile and its reason as its tooltip.
- Add Profile and Edit Profile, one tabbed in-app dialog:
  - General: the name, under the field validation pattern, flagged when another profile has it, ignoring case, and the color, from a basic palette or a hex field, random when none is chosen.
  - Sources: all of them, following newly added ones, or a chosen list.
  - Tags: categories with their tags as checkboxes, a category's tags greyed while it is off.
  - Presets: a checkbox for each preset.
  - Edit Profile has a red Delete that asks first. The default profile's Edit Profile has only the General tab and no Delete.
- The visibility design that Profile Tag and Preset Visibility builds: the "Only this profile" or "All profiles" question on creating a tag, category, or preset once a second profile exists, and Show in in Edit Tag, Edit Category, and Edit Preset.
- The Library, Filter, Tags, and Stats tabs in a profile: the Filter tab's sources, the Filters line's source count, and the Stats tab's library cards cover only the profile's sources.
- Switching: "Discard changes?" while the Filter or Tags tab holds unsaved changes, and the picker's place in the Esc order.
- A Mockup-tab button for another device deleting the active profile, after which this device shows the default profile.
- Before the app is built, the user approves the design on a desktop browser, the iPad, and an Android phone.

**Traps**

- The mockup's header ends with a `.top-bar-end` group that holds the admin icon, `#header-admin` (`build/layout.src.html`).
- The mockup's bell list is `initNotifications` in `common.js`, and its `.notify-list` styles in `common.css` can style the picker too.
- No tabbed dialog exists in the app or the mockup; the Filter tab's section strip (`role="tablist"`) is the nearest model.
- Add tag and Add Preset are inline fields, not dialogs, so the creation question is a new dialog with two choices.
- The mockup's dialogs (`openDialog`, `confirmDialog`, and `nameDialog` in `common.js`) offer Cancel and one action, and `nameDialog` takes extra fields through its `extra(form)` hook.
- New icons go in `ICONS` in `build_font.py`; one missing from the subset shows as the `error` glyph.
- `check.mjs` runs the pages in happy-dom with no layout, so the button's size and the picker's place at each width can only be judged on the devices.

**Acceptance**

- The mockup shows the profiles design as the user approved it in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.

#### Server slice

**Scope**

- The catalog moves to the next schema version, with its own upgrade step from the version before that adds `profiles` (id, position, name, its folded form, color, and whether it follows all sources) and `profile_sources` (profile id and source id), and seeds the default profile under a fixed id as "Main" in `#ef7f22`. A new catalog has them too.
- The catalog's required tables go by schema version, as its item columns do.
- The profile store lists, creates, updates, and deletes profiles under the library operations lock.
  - A name another profile has, ignoring case, is refused.
  - The default profile can't be deleted or given a chosen list of sources.
  - Deleting a profile deletes its source rows in the same transaction.
- A profile that follows all sources includes a source added later, and a chosen list doesn't.
- Each profile's own default filter is stored with it in `profiles`, and the profile store reads and writes it, as the Decisions describe.
- The server resolves the request's profile to its sources, and `BuildWhere` adds them as a condition outside the filter, so the library query's page, `totalCount`, `searchBaselineCount`, its ids-only option, random picks, and Random Pick Options' cycle numbers keep only the profile's sources.
- Auto Tag's scan keeps only the profile's sources: a full-library scan reads every item in them, and a scan with no path list their enabled ones.
- Library stats count only enabled sources, as lists, counts, and random picks do: the totals and the baseline loudness leave disabled sources out, while each source's own row in the per-source list still counts its items, which Admin Source Management shows.
- With a profile, the stats' totals count only its sources. The baseline loudness stays library-wide, since it is loudness normalization's target and isn't a count.
- An unknown profile id is read as the default profile, and `last.log` gets one line per unknown id.
- Each profile write publishes `profilesChanged` with the whole profile list and the request's `clientId`.

**Traps**

- No schema version after 3 has shipped: v0.14.0 shipped 2 and v0.14.1 shipped 3 (measured). A catalog already at the version before, such as a development server's, would fail `HasRequiredCatalogSchema` and be moved aside as damaged if that version gained the tables, so they take their own step.
- `HasRequiredCatalogSchema` checks one `CatalogTables` list at every version (`LibraryCatalogStore.cs`), so adding the new tables to it would make a catalog at any older version fail the check and be moved aside to `library.db.refused`.
- `ItemColumnsBySchemaVersion` needs an entry for the new version even though `items` doesn't change, since both schema checks look the version up there.
- `OlderSchemaVersions()` covers every version from 2 to the one before current, so `CatalogSeed` needs tables for the version before and for the new version, and `CatalogSeedTests.DescribeSchema` compares an upgraded catalog with a new one table by table.
- The catalog has no foreign keys.
- `QueryList` calls `BuildWhere` three times and `QueryRandomCandidates` once (`LibraryCatalogListQuery.cs`, `LibraryCatalogSession.cs`), and `searchBaselineCount` is built without the filter, so a source condition inside `AppendFilter` would leave that count covering the whole library.
- `FromClause` joins only enabled sources, and the filter's source list is an OR group inside `AppendFilter`, so a filter limited to a disabled source finds nothing (measured).
- The list counts are cached by the WHERE text and its values until the next catalog write, 64 entries at most, all dropped when full, so each profile's counts are cached apart.
- `ReadStatsGroups` is one `GROUP BY source_id, media_type` pass with no enabled condition, so the totals count a disabled source's items (measured), and `ReadBaselineLoudness` reads every item.
- WebUI Loudness Normalization's Automatic target reads that baseline, so leaving disabled sources out shifts it a little (inferred).
- Item Ratings counts the rated items in that grouped pass, so the rated count follows the profile with the others (inferred).
- Auto Tag's scan has its own SQL, with its own enabled check only for a scan with no path list, and duplicate scan has another (`LibraryCatalogSession.cs`), which the admin section keeps covering the whole library.
- Random Pick Options keeps each device's shuffle memory by `clientId` through changes of the eligible set (`LibraryPlaybackService.cs`, `RandomSelectionEngineCore.cs`), so a switch doesn't start Shuffle over, and the cycle card counts the new profile's eligible files from the next pick (inferred).
- `ImportSourceFolder` gives a new source a new GUID and keeps an existing root's id, and the catalog import's source remap rewrites only paths, so a profile's source ids survive an import.
- Route handlers pass their parameters to the services, and nothing carries per-request data into them.

**Acceptance**

- A catalog at each older version opens upgraded and imports upgraded with the profile tables and the default profile, matches a new catalog's schema, and isn't moved aside, in the catalog upgrade tests.
- Profiles are listed, created, updated, and deleted, a taken name is refused ignoring case, and the default profile can't be deleted or limited, in profile store tests.
- A profile that follows all sources includes a newly imported source, and a chosen list doesn't, in profile store tests.
- The library query's page, both counts, its ids-only option, random picks, and the random cycle numbers keep only the profile's sources, a filter naming only sources it hides finds nothing, and a request without a profile or with an unknown one sees every source, in server tests of the profile's sources.
- Auto Tag's scan keeps only the profile's sources, in server tests of the scan.
- Library stats' totals and baseline leave disabled sources out while each source's row keeps its own counts, and with a profile the totals count only its sources, in server tests of library stats.
- Each profile write publishes `profilesChanged`, in server tests of each write.
- `dotnet test ReelRoulette.sln` passes.

#### Contract slice

**Scope**

- `GET /api/profiles` lists the profiles, and POST routes, like the other write routes, create, update, and delete one.
- An optional `profileId` on `POST /api/library/query`, its ids-only option included, `POST /api/random`, Random Pick Options' cycle route, and `POST /api/autotag/scan`, and as a query parameter on `GET /api/library/stats`.
- `profilesChanged` with the whole profile list and `clientId`.
- `sourceId` on `itemStateChanged` and `itemRatingChanged`, and each item's source id on the bulk favorite and blacklist event and the bulk rating event.
- OpenAPI, the generated WebUI types, and `docs/api.md`, which describes the routes, the field, and the events.

**Traps**

- EventSource can't send headers, so a header naming the profile wouldn't reach the event stream.
- `Spec_ListsEveryMappedApiAndControlRoute` fails for a route the server maps that the spec doesn't list, and for one the spec lists that the server doesn't serve.
- `OpenApiSpec.AssertMatchesSchema` needs a payload's fields and its schema's to be the same set, so each event's schema and payload type change together.
- `npm run verify:contracts` only checks that the generated types match the OpenAPI file.

**Acceptance**

- The profile routes, `profileId`, and the events match their schemas, in contract tests, and `npm run verify:contracts` passes.
- Each request with `profileId` keeps only that profile's sources, in server tests of each request.
- The item events carry each item's source id, in server tests of each event.
- `docs/api.md` describes the routes, `profileId`, and the events, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- The header's profile button and its picker, as the Decisions and the approved mockup describe, first in a right-hand group that the admin icon later joins.
- A picker row has a context menu with Edit…, which opens Edit Profile, and Delete…, which asks first as Edit Profile's Delete does and is disabled on the default profile with its reason.
- Escape closes a picker row's context menu first, then the picker, before the bell's list, the panel, and pseudo-fullscreen.
- Add Profile and Edit Profile with their General and Sources tabs, and Delete. Profile Tag and Preset Visibility adds the Tags and Presets tabs.
- The per-device store keeps the active profile as `profiles.active`, and each profile's applied filter and its preset as `filter.appliedByProfile`, which replaces `filter.applied` with no carry-over.
- Every request the Decisions scope sends the active profile's `profileId`.
- A switch, after "Discard changes?" when the Filter or Tags tab holds unsaved changes:
  - sets the new profile's applied filter and preset together, and applies its remembered preset again as the server has it now;
  - starts the Library tab's query and the Filter tab over, and loads the Stats tab again;
  - clears Auto Tag's kept scan, ends a selection, and closes the picker;
  - leaves the playing item and history as they are.
- A device whose active profile is gone, deleted on another device or removed by a catalog import or a backup restore, falls back to the default profile once `profilesChanged` or the profile list says so.
- The Filter tab lists only the profile's sources, the Filters line counts them out of the profile's sources, and a source list that names none of the profile's sources is not read as every source.
- None and Clear all load the active profile's default filter, and the Filter tab's Update is enabled on None, where it writes the tab's filter into that default filter.
- The Stats tab's library cards come from the profile's stats.
- Other devices popups, the bulk ones included, leave out items in sources the profile hides, and a bulk popup counts only the items it shows. The refresh's kept-folder notice leaves out folders the profile hides.

**Traps**

- The header renders only the logo, the pairing prompt, and now playing (`src/ui/Header.tsx`), with no right-hand group; the admin icon comes with WebUI Admin Section.
- The header sits outside the fullscreen stage, and `body.short-screen .top-bar:not(.is-pairing)` hides it on a phone on its side (`src/styles.css`).
- The bell's list (`NotificationList` in `src/ui/Notifications.tsx`) has its placement under the bell and its focus handling written for the bell alone, and closes on an outside press and Escape through `useLightDismiss` (`src/ui/LightDismiss.ts`), which the rating's popover and WebUI Multi-Select and Bulk Actions' Selection actions menu use too.
- The panel opening closes the bell's list in every mode (`src/state/appServices.ts`), while the picker closes only when the panel covers the screen, which is `panel.mode` `"overlay"` (`src/panel/panelHost.ts`).
- WebUI Context Menus keeps the bell's list open while a menu opened from it is used, which the picker needs too, since a press in a row's menu is outside the picker.
- `filter.applied` holds the filter and its preset, and an effect writes it only once presets have loaded and the record has changed (`src/state/appStore.ts`). A switch that doesn't set the applied filter and the preset in one batch, as `pickHeaderPreset` does, writes the old profile's record under the new profile's key (inferred).
- Applying the remembered preset again as the server has it now runs only on the first preset load (`presetsLoaded` in `src/state/appStore.ts`).
- The Stats tab loads again on events and a new playing item, never on a preset pick (`src/stats/statsTab.ts`), so a switch needs its own trigger.
- `filterWithGeneralDraft` writes an empty source list when every listed source is checked (`src/filter/filterDialogModel.ts`), and an empty list means every source.
- Requests go through `createServerRequester` in `src/state/appApi.ts`, except the library play in `src/api/coreApi.ts`, which names no profile.
- `src/events/sseClient.ts` listens only to the event types registered with it.

**Acceptance**

- The button shows the active profile's circle and first letter in a readable color, the picker lists the default profile first and the others alphabetically, and it closes as the Decisions describe, in Header screen tests.
- Escape closes a picker row's context menu first, then the picker, before the bell's list, the panel, and pseudo-fullscreen, in keyboard tests.
- A picker row's context menu opens Edit Profile and deletes the profile after asking, and its Delete is disabled with its reason on the default profile, in Header screen tests.
- Add Profile and Edit Profile create, change, and delete a profile, a taken name is flagged with the field validation pattern, and the default profile's dialog has only the General tab, in profile dialog tests.
- Each scoped request sends `profileId`, in WebUI tests of each request.
- A switch asks "Discard changes?" while the Filter or Tags tab holds unsaved changes, applies the new profile's remembered filter or preset, loads the Library and Stats tabs again, starts the Filter tab over, ends a selection, and leaves the playing item playing, in WebUI tests of switching.
- After a page refresh, the device is on its active profile with that profile's filter, in a test for a page refresh keeping both.
- A device whose profile is deleted elsewhere falls back to the default profile, in WebUI tests of `profilesChanged`.
- The Filter tab, the Filters line, and the Stats tab cover only the profile's sources, in Filter, Library, and Stats screen tests.
- Other devices popups and the kept-folder notice leave out hidden sources' items and folders, and a bulk popup counts only the items it shows, in WebUI tests of the popups.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

#### Release checks

- Manual: On two devices on two profiles, each one's library, random picks, and Stats tab show only its profile's sources, and an Other devices popup for an item in a source one profile hides doesn't show there.
- Manual: On the iPad and an Android phone, the picker opens, switches profiles, and adds and edits a profile.

#### Not included

- Showing tags, categories, and presets in only some profiles, which is Profile Tag and Preset Visibility.
- Favorites, ratings, history, tags, presets, and profiles kept per account, which is Per-Account Library Data.
- Switching accounts from the picker, which is Account and Profile Picker.
- A shortcut key for the picker.
- Switching profiles on a phone on its side, where the header hides.
- Profiles in the admin section, which covers the whole library.

### M12n4 - Profile Tag and Preset Visibility

- **Status**: ⏳ Planned
- **Goal**: Each profile shows only the tags, categories, and presets chosen for it, and in a profile a filter or preset leaves out its conditions on the tags the profile hides.
- **Depends on**: Library Profiles, Per-Preset Preset Writes, whose preset ids and per-preset routes a preset's visibility and update use, and Random Pick Options, whose tag spread and category list it limits to the profile's tags.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Each tag, category, and preset shows either in every profile, "All profiles", or only in the profiles chosen for it, and a profile can differ from that choice. It is stored as whether new profiles show it and which profiles differ.
- A new profile shows only the tags, categories, and presets marked "All profiles".
- Unchecking an "All profiles" tag, category, or preset in one profile leaves it "All profiles" with that profile left out, so profiles added later still show it.
- Creating a tag, category, or preset asks "Only this profile" or "All profiles", only once a second profile exists. "Only this profile" means that profile and the default, which the question doesn't say.
- Anything created without a profile choice counts as "All profiles", such as a tag Auto Tag applies or a tag added to an item by a new name, and so does a tag whose record a rename merge loses, so it shows everywhere rather than vanishing.
- The default profile shows every tag, category, and preset.
- Hiding a category hides its tags.
- Edit Tag, Edit Category, and Edit Preset get a Show in choice of the non-default profiles, saved with the dialog's other changes by the Tags tab's Save or the Filter tab's Apply.
- Uncategorized has no Edit Category, so it is shown or hidden only from the profile dialog's Tags tab.
- In a profile, a filter or preset leaves out its conditions on hidden tags, and no hidden tag appears in the Filter tab. The server and the WebUI apply this one rule, locked by `shared/fixtures/profile-filter-projection.json`.
- Sources are never left out of a filter this way, since dropping a hidden source's id would turn a list of only hidden sources into every source.
- Updating a preset in a profile keeps its stored conditions on the tags, categories, and sources the profile hides, decided one tag, category, and source at a time. An empty source list, stored or saved, means every source, and a result that names every source is stored as an empty list.
- The "modified" marker ignores the conditions on hidden tags and hidden sources.
- Presets are account-wide: Update changes the preset everywhere it shows.
- Editing an item's tags leaves its hidden tags untouched.
- Auto Tag, the Stats tab, and random picks' tag spread see only the profile's visible tags.
- Reordering categories or presets in a profile moves them only among the places the visible ones held, and hidden ones keep their places.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Server | ⏳ Planned | Visibility in a new catalog schema step, kept through tag, category, preset, and profile writes, hidden tags left out of the library query, its counts, random picks, and Auto Tag's scan, and a preset update that keeps its conditions on what the profile hides. |
| Contract | ⏳ Planned | The creation choice, the visibility writes, each profile's visibility in the profile list, and `profileId` on the preset update, in OpenAPI, the generated WebUI types, and `docs/api.md`. |
| WebUI | ⏳ Planned | Add and Edit Profile's Tags and Presets tabs, the creation question, Show in, hiding in every tab, the modified marker, and reordering in a profile. |

#### Server slice

**Scope**

- The catalog moves to the next schema version, with its own upgrade step from the version before that adds whether new profiles show it to `tags`, `categories`, and `presets`, on by default and last in each table, and three tables of the profiles that differ, keyed by the tag's folded name, the category's id, and the preset's id. A new catalog has them too.
- Visibility changes in the same transaction as the write that causes it:
  - a tag rename moves the tag's rows to its new name;
  - a rename that merges into another tag leaves the result "All profiles", with no profile differing;
  - deleting a tag, a category, a preset, or a profile deletes its rows, and a deleted category's tags keep their own.
- After parsing a filter, and before the library query, its counts, and random picks read it, the server leaves out its selected and excluded tags that the profile hides, directly or through their category, and its match modes for hidden categories.
- Auto Tag's scan uses only the profile's visible tags.
- Random picks' tag spread counts only the tags and categories the profile shows, and leaves out a chosen category it hides.
- The per-preset update, given a profile, keeps the stored preset's conditions on what the profile hides, as the Decisions describe.
- Every visibility change publishes `profilesChanged`.
- Core tests read `shared/fixtures/profile-filter-projection.json`.

**Traps**

- No schema version after 3 has shipped: v0.14.1 shipped 3 (measured). So visibility takes its own step, for the reason Library Profiles' Server slice gives.
- Tags are identified by their folded name, `name_fold`, and `item_tags` refers to them by it. Categories have a string id that the client gives, and Uncategorized is seeded with `sort_order` `int.MaxValue` (`LibraryCatalogStore.cs`, `LibraryCatalogSession.cs`).
- `RenameTag` updates the renamed tag's row in place and, when the new name is taken, deletes the other row (`LibraryCatalogSession.cs`).
- `InsertCatalogTagIfMissing` creates tags without a request of their own, from item-tag adds and Auto Tag apply.
- `AppendSelectedTags` groups selected tags by category, with each category's match mode and the global one, and `AppendExcludedTags` leaves out items holding an excluded tag (`LibraryCatalogListQuery.cs`).
- Leaving out a tag changes the WHERE text, so the list counts are cached apart (inferred).
- A preset's filter is stored as the JSON it was saved with, and an empty `includedSourceIds` means every enabled source.
- The WebUI saves an empty source list when every listed source is checked, so keeping hidden sources by joining the two lists would turn every source into only the hidden ones (inferred).

**Acceptance**

- A catalog at each older version opens upgraded and imports upgraded with visibility, every existing tag, category, and preset showing in every profile, and matches a new catalog's schema, in the catalog upgrade tests.
- A tag rename keeps its visibility, a merge leaves it "All profiles", and deleting a tag, category, preset, or profile removes its rows, in server tests of each write.
- In a profile, the library query, its counts, and random picks ignore conditions on hidden tags, directly or through their category, as the shared fixture's cases say, in Core tests of the fixture and server tests of each read.
- Auto Tag's scan uses only visible tags, in server tests of the scan.
- In a profile, tag spread counts only visible tags and categories, in server tests of random selection in a profile.
- A preset updated in a profile keeps its conditions on the tags, categories, and sources the profile hides, empty source lists included, in server tests of the preset update.
- `dotnet test ReelRoulette.sln` passes.

#### Contract slice

**Scope**

- `POST /api/tag-editor/upsert-tag`, `POST /api/tag-editor/upsert-category`, and the per-preset create route take an optional profile, for "Only this profile".
- A route sets a tag's, category's, or preset's visibility: whether new profiles show it and which profiles differ.
- A profile's create and update take which tags, categories, and presets it shows.
- The profile list and `profilesChanged` carry each tag's, category's, and preset's visibility.
- The per-preset update takes an optional `profileId`.
- OpenAPI, the generated WebUI types, and `docs/api.md`.

**Traps**

- `tagCatalogChanged` carries the whole tag and category lists to every client.
- Per-Preset Preset Writes publishes `presetCatalogChanged` with the changed preset's id and the request's `clientId`.
- `Spec_ListsEveryMappedApiAndControlRoute` fails for a route the server maps that the spec doesn't list, and `OpenApiSpec.AssertMatchesSchema` needs a payload's fields and its schema's to be the same set.

**Acceptance**

- The creation choice, the visibility route, and the profile list's visibility match their schemas, in contract tests, and `npm run verify:contracts` passes.
- A tag, category, or preset created with a profile shows only in it and the default profile, in server tests of each create.
- `docs/api.md` describes the creation choice, the visibility route, and `profileId` on the preset update, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- Add and Edit Profile's Tags tab, with categories and their tags as checkboxes and a category's tags greyed while it is off, and its Presets tab, with a checkbox for each preset. Add Profile starts with the "All profiles" ones checked.
- The creation question, a dialog with two choices, after Add tag, New Category, Add Preset, and the context menus' New tag in this category and Duplicate, once a second profile exists.
- Show in in Edit Tag, Edit Category, and Edit Preset.
- In a profile, hidden tags, categories, and presets don't show:
  - in the Filter tab's tags and presets, where conditions on hidden tags stay out of its block of tags the catalog doesn't have;
  - in the Tags tab, an item's hidden tags included;
  - in the Library tab's preset dropdown, where a remembered preset the profile hides shows **None\*** with its filter kept, as a deleted one does, and in the Filters line's tag counts;
  - in Auto Tag and the Stats tab's tag chips;
  - in the Randomization tab's category list and the Library tab's Random line.
- Applying a filter or preset in a profile leaves out its conditions on hidden tags, as the shared fixture says.
- The "modified" marker compares a preset with its conditions on hidden tags and sources left out.
- A new tag, category, or preset name is checked against the whole catalog, hidden ones included, as the approved mockup words it.
- Reordering in a profile, as the Decisions describe.
- WebUI tests read `shared/fixtures/profile-filter-projection.json`.

**Traps**

- The shared tag catalog signal (`src/tags/tagCatalog.ts`) feeds the Stats tab and Random Pick Options' category list and Random line, which names the chosen categories; the Filter and Tags tabs render from their own models, so each one leaves out hidden tags itself.
- The Filter tab lists a selected or excluded tag the catalog doesn't have in an Uncategorized block (`src/filter/filterDialogModel.ts`).
- A category reorder sends each changed category's place in the list shown as its `sortOrder` (`src/library/tagSave.ts`), which would collide with hidden categories' places.
- New tag and category names are checked against what the editor shows (`src/tags/tagEditorModel.ts`), and the server merges a tag given a taken name, so a new tag named like a hidden one would merge into it.
- Edit Tag allows another tag's name on purpose, since the server merges the two.
- The in-app confirmation offers Cancel and one action (`src/dialogs/dialogs.ts`).
- The Tags tab's Save sends adds and removes through `apply-item-tags`, never an item's whole tag list.

**Acceptance**

- The Tags and Presets tabs show and change which tags, categories, and presets a profile shows, with a category's tags greyed while it is off, and Add Profile starts with the "All profiles" ones checked, in profile dialog tests.
- The creation question shows only once a second profile exists, after every way of creating a tag, category, or preset, the context menus' included, and each answer creates the tag, category, or preset as it says, in Tags and Filter screen tests.
- Show in changes a tag's, category's, or preset's profiles with the dialog's Save or Apply, in Tags and Filter screen tests.
- Hidden tags, categories, and presets show in no tab, a filter's conditions on hidden tags stay out of the Filter tab, and a remembered preset the profile hides shows **None\***, in Filter, Tags, Library, Random, and Stats screen tests.
- Applying a filter or preset leaves out conditions on hidden tags as the shared fixture says, in WebUI tests of the fixture.
- The "modified" marker ignores hidden tags and sources, in WebUI preset matching tests.
- A name a hidden tag, category, or preset has is flagged, in Tags and Filter screen tests.
- A reorder in a profile keeps hidden categories and presets in their places, in WebUI tests of reordering.
- Saving an item's tags in a profile leaves its hidden tags on it, in Tags screen tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

#### Release checks

- Manual: In a profile that hides a tag and a preset, neither shows in any tab, a preset updated there keeps its condition on the hidden tag in the default profile, and a tag created "Only this profile" doesn't show in another profile.

#### Not included

- Tags, categories, and presets kept per account, which is Per-Account Library Data.

### M12o1 - WebUI Admin Section

- **Status**: ⏳ Planned
- **Goal**: Everything the Operator page does, apart from its logs, moves into a full-page admin section of the WebUI.
- **Depends on**: WebUI Responsive Layout and Panels, whose header the admin icon joins, and WebUI Auto-Pause and Photo Scrub Bar, whose Auto-Pause the admin view follows, and WebUI In-App Dialogs, whose confirmation the control token change uses, and WebUI Field Validation Pattern, whose pattern its settings fields use, and Catalog Open and Backup Safety, whose library state and message the admin section shows, and WebUI Notifications, whose bell and popups the admin view uses, and WebUI Multi-Select and Bulk Actions, whose control-token prompt its gate reuses, and WebUI Context Menus, whose menus the admin view shows over itself.
- **Design**: `docs/mockups/reelroulette/`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Update download report | ⏳ Planned | The cause of the Operator's two-attempt update download, reported before the admin section's update controls are built. |
| Admin section | ⏳ Planned | A full-page admin view with every Operator section but its Server Logs, as Preact screens on the same control routes. |

#### Update download report slice

**Scope**

- Find and report the cause of the Operator's update download needing two attempts, so the admin section's update controls don't inherit it.

**Traps**

- The Operator's update download needs two attempts every time: click Download and confirm, and nothing happens; click Download and confirm again, and it downloads (measured).
- No commit has fixed it.

**Acceptance**

- The report names the cause of the Operator's two attempts, and is written before the Admin section slice starts.

#### Admin section slice

**Scope**

- Admin is a full-page view opened from the header's admin icon, not a panel tab. The icon is always visible.
- The admin icon sits after the profile button, at the end of the header's right-hand group.
- The admin section ignores profiles: its header shows no profile button, and its requests name no profile, so it covers the whole library.
- The view keeps the Operator page's responsive layout, restyled to match the rest of the WebUI.
- Its layout: a bar with a back arrow ("Back to the player"), the title Admin, and at its right end the notifications bell; a row of jump links to its sections; and cards, each titled with its icon, in this order: Server (`dns`), Web access (`lan`), Control (`key`), Library refresh (`sync`), Library transfer (`swap_vert`), Backups (`storage`), Sources (`folder`), Duplicates (`content_paste`), Testing suite (`bug_report`), Connected clients (`group`), Log Viewer (`article`), and API events (`description`).
- Sources, Duplicates, the Log Viewer, and API events take the full width, and on a wide screen the others take half.
- The cards for refresh, transfer, backups, sources, duplicates, and the Log Viewer arrive with the milestones that build them, in their places.
- The admin view covers the player, so opening it pauses playback under the Always and Responsive Auto-Pause modes, and leaving it resumes playback only if Auto-Pause paused it, as WebUI Auto-Pause and Photo Scrub Bar describes.
- Move every Operator section but its Server Logs into the admin section as Preact screens:
  - server updates;
  - runtime status with restart and stop, including the message when the server runs without a library;
  - web runtime settings: port, Allow remote connections, mDNS advertising and LAN hostname, and auth mode and shared token, without Enable Web UI;
  - control settings: control token, dev channel, Launch Server on Startup;
  - the testing suite;
  - connected clients;
  - incoming and outgoing API events.
- The screens call the same control routes, so there is no contract change.
- The Operator page stays until Recovery Page and Operator Retirement retires it, so its Server Logs stay reachable until Log Viewer Redesign adds the Log Viewer.
- The control token shows hidden, with Show and Copy beside it.
- Saving a changed token asks first, "Change the control token? Other machines will be signed out and need the new token to open admin.", with Cancel focused and a red Change Token. Saving it unchanged asks nothing.
- The control token's hint keeps today's warning: "Other machines need it to open admin. Changing it signs them out."
- Settings fields that can hold a value that is not valid, such as the port, use the field validation pattern, and their Save can't proceed while one is not valid.
- The values each field accepts are read from the server's checks when this slice starts.
- Connected clients show each client's id and, where its user agent names one, its operating system, then its type, address, and the time it connected, with counts of API sessions, control sessions, and event streams.
- Connected clients leave out the session id, which the Operator page shows today.
- On a phone on its side, where the app's header hides, the admin view keeps its own bar, with the back arrow, its title, and the bell.
- The admin view has no status line. Its acknowledgments, such as "Control settings saved.", pop up as Your actions popups, and its bell opens the same list as the player's, whose Now shows the lasting states, since the admin view has no player, as WebUI Notifications sets out.
- Gating: opening admin from another machine asks for the control token first, in the control-token prompt that WebUI Multi-Select and Bulk Actions builds on `POST /control/pair`, and shows nothing until it is accepted. On the server machine, which the merged localhost helper decides, it opens directly.
- The admin view shows the app's context menus over itself, so the row menus the later admin milestones add show there.
- The browser's own menu stays off in the admin view, except in its text fields, as it is across the app.

**Traps**

- The Operator page is 842 lines of HTML, CSS, and JavaScript inside a raw string in `src/core/ReelRoulette.ServerApp/Program.cs` (measured).
- No test covers the Operator page's content; the only test that names `/operator` checks that the library route gate leaves it open (measured).
- The sections listed in Scope match the Operator page (measured).
- `verify-linux-packaged-server-smoke.sh` still requests `/operator` (measured).
- The Operator page's responsive layout is a 12-column grid that changes at 620 and 980 px wide.
- The Operator page shows the control token as plain text and saves a change without asking (`adminSharedToken` in `Program.cs`).
- The server keeps each event stream's client id, user agent, and connection time (`ConnectedClientTracker`), so connected clients need no contract change.
- WebUI Context Menus renders its menus inside the fullscreen stage, which a full-page admin view may cover or replace (inferred).
- The admin mockup's jump links and back arrow are links (`build/admin.src.html`), which lose the browser's Open in new tab with its menu off.

**Acceptance**

- The header's admin icon is always visible and opens the admin section as a full-page view, not a panel tab, in admin section UI tests of the admin icon opening the full-page view.
- Under Always and Responsive, opening the admin section pauses playback and leaving it resumes only playback Auto-Pause paused; under Never, playback keeps going, in admin section UI tests of Auto-Pause on opening and leaving it in each mode.
- The admin section has the mockup's layout, on the Operator page's 12-column grid, at phone and desktop widths, and matches the rest of the WebUI's styling, checked in the spot check.
- The admin section offers every action and setting the Operator page offers today, apart from its Server Logs and Enable Web UI, and calls the same routes, in admin section UI tests of loading status and settings, saving settings, and the testing panel.
- Connected clients show each client's id with its operating system where the user agent names one, its type, address, and connection time, and the three counts, without the session id, in admin section UI tests.
- In the admin section, one Download click and one confirmation start the update download, in admin section UI tests.
- The admin view has no status line, its bar ends with the bell, which opens the list, and its acknowledgments pop up, in admin section UI tests of its notifications.
- The control token shows hidden with Show and Copy, saving a changed token asks first and warns that other machines will be signed out, and saving it unchanged asks nothing, in admin section UI tests of the control token's Show, Copy, and change confirmation.
- An admin settings field with a value the server would not accept, such as the port, is flagged with the field validation pattern as it is typed, and its Save can't proceed until it is corrected, in admin section UI tests of settings fields with the field validation pattern.
- From another machine, opening admin asks for the control token first, and nothing in the admin section is shown until a valid token is entered; on the server machine it opens without one, in admin section UI tests of control-token gating.
- A context menu opened in the admin view shows over it, and a right-click outside its text fields opens no menu of the browser's own, in admin section UI tests.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Release checks

- Manual: From another machine, the admin section asks for the control token and works after it is entered.

#### Not included

- The Log Viewer, which is Log Viewer Redesign.
- The recovery page and retiring the Operator page, which is Recovery Page and Operator Retirement.
- Dropping Enable Web UI, which is Recovery Page and Operator Retirement.
- Refresh, backup, and duplicate review, with duplicate review opening within the admin section, which is Admin Refresh, Backup, and Duplicate Review.
- Source management, which is Admin Source Management.
- Removing library items, which is WebUI Multi-Select and Bulk Actions.
- Catalog transfer, which is Admin Library Catalog Transfer.
- The Log Viewer's move to structured entries, which is Admin Log Viewer.
- Account administration, which is Account Administration.
- Replacing the control token with admin accounts, which is Auth Cutover for API and Admin.

### M12o2 - Log Viewer Redesign

- **Status**: ⏳ Planned
- **Goal**: The admin section's Log Viewer filters today's log by time, source, level, and text, in the design Admin Log Viewer later moves to structured entries.
- **Depends on**: WebUI Admin Section and WebUI Context Menus, whose menu and long press a log row's menu uses.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Only the route, `GET /control/logs/server`, keeps its old name. Everywhere the interface names the logs, it says Log Viewer.
- The route gets no paging parameter. The Log Viewer fetches the newest matching lines once, up to the route's limit, and renders older ones as the list scrolls, as the mockup does, since paging through the route would read the whole file again for each page (see the Contract slice's Traps).

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | `GET /control/logs/server` takes several levels, several sources, and a time window, in OpenAPI and the generated WebUI types. |
| Log Viewer | ⏳ Planned | The Operator's Server Logs redesigned as the admin section's Log Viewer, with filters, chips, a live indicator, and expanding rows. |

#### Contract slice

**Scope**

- `GET /control/logs/server` also takes several levels, several sources, and a time window, applied before it takes the last lines, as level and text are. The change only adds.
- OpenAPI and the generated WebUI types carry the new filters.
- Server tests call the handlers and gating as functions over `DefaultHttpContext`, as the library route gate's tests do. `Microsoft.AspNetCore.TestHost` is not added.

**Traps**

- `GET /control/logs/server` filters by one level and contained text, then takes the last 1–5000 lines.
- `ServerLogService.Read` returns at most the last 5000 lines.
- `ServerLogService.Read` walks the whole file on every request, so paging through the route would read the file again for each page.
- Taking several levels, several sources, and a time window, applied before the last lines are taken, is the route's natural extension (inferred).
- No test project has an HTTP test host.

**Acceptance**

- `GET /control/logs/server` filters by several levels, several sources, and a time window before it takes the last lines, in server tests for the log route's level, source, and time filters.
- The route's new filters are in OpenAPI, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Log Viewer slice

**Scope**

- The Operator's Server Logs becomes the **Log Viewer** in the admin section, redesigned to its final design from Admin Log Viewer rather than moved as it is.
- Its filters sit in a panel that starts collapsed, with chips for the active ones.
- A live indicator pauses while the list is scrolled away from the newest lines, with a resume control.
- Rows expand to the full line.
- The Operator's Tail lines field goes.
- It reads today's line format, `[timestamp] [source] [level] message`.
- It filters by time window; by source (the second bracket: `server` and `webui`); by level, with one checkbox per level found (today `info`, `warn`, and `error`); and by contained text.
- A log row's context menu holds Copy line, which copies the full line.

**Traps**

- `ServerLogService.Append` writes today's line format, `[timestamp] [source] [level] message`.

**Acceptance**

- The interface names the logs section Log Viewer in the admin section, and nowhere Server Logs; the route is still `GET /control/logs/server`, in admin section UI tests.
- The Log Viewer filters by time window, by several sources and several levels, and by contained text, with its filters in a collapsed panel with chips, a live indicator that pauses away from the newest lines, and rows that expand to the full line, in admin section UI tests for the Log Viewer's filters, chips, and live indicator.
- The Log Viewer has no Tail lines field: it fetches the newest matching lines once, up to 5000, and shows older ones as the list scrolls without another request, in admin section UI tests for showing older lines.
- A log row's context menu copies its full line, in admin section UI tests for the Log Viewer.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Not included

- The Log Viewer on the recovery page, which is Recovery Page and Operator Retirement.
- Structured entries, category and component filters, and the route's rename, which is Admin Log Viewer.

### M12o3 - Recovery Page and Operator Retirement

- **Status**: ⏳ Planned
- **Goal**: The server keeps a minimal recovery page for when the WebUI's files are broken, always serves the WebUI, and retires the Operator page.
- **Depends on**: WebUI Admin Section and Log Viewer Redesign, so the Operator page goes only once the admin section offers everything it does.
- **Design**: `docs/mockups/reelroulette/`, including its recovery page.

#### Decisions

- Server tests call the handlers and gating as functions over `DefaultHttpContext`, as the library route gate's tests do. `Microsoft.AspNetCore.TestHost` is not added, and no test project has an HTTP test host.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Recovery page | ⏳ Planned | A minimal built-in recovery page with restart, stop, a Log Viewer, and updates, that works without the WebUI's files. |
| Operator retirement | ⏳ Planned | `/operator` redirects to the admin section, the tray's item opens ReelRoulette, and the smoke script and the checklist's Smoke item check the admin section. |
| Always-on WebUI | ⏳ Planned | The server always serves the WebUI, and the web runtime settings' `enabled` field is gone. |

#### Recovery page slice

**Scope**

- The server keeps a minimal built-in page with restart, stop, a log tail named Log Viewer, and updates, at a fixed path such as `/recovery`.
- It is plain, in the WebUI's theme colors, and titled "ReelRoulette Recovery", laid out as the mockup's recovery page shows.
- `logo-icon.svg` sits beside its title and is its page icon. The icon is built into the page, since the page loads none of the WebUI's files.
- It does not load the WebUI's files, so it works when they are missing or broken.
- It has the same control-token gating.
- It renders settings and status text without `innerHTML` interpolation.

**Traps**

- The Operator HTML page interpolates user input via `innerHTML`.

**Acceptance**

- The recovery page is titled "ReelRoulette Recovery", in server tests.
- The recovery page names its logs Log Viewer, and nowhere Server Logs, in server tests.
- With the WebUI's files removed, the server still serves the recovery page, in server tests that the recovery page is served without WebUI assets.
- The recovery page keeps control-token gating, in server tests.
- The recovery page renders settings, status, and log text without `innerHTML` interpolation, checked by reading the page's source.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` passes.

#### Operator retirement slice

**Scope**

- `/operator` redirects to the admin section.
- The tray's Open Operator UI item becomes **Open ReelRoulette** and opens the WebUI's main page.
- `verify-linux-packaged-server-smoke.sh` checks the recovery page and the admin section entry instead of `/operator`.
- The testing checklist's Smoke item checks the admin section instead of the Operator page.

**Traps**

- The tray's Open Operator UI item is in `AvaloniaTrayHostUi.cs`.

**Acceptance**

- The tray's Open ReelRoulette opens the WebUI's main page, checked by reading `AvaloniaTrayHostUi.cs`.
- `/operator` reaches the admin section, in server tests that `/operator` redirects to the admin section, and the packaged Linux server smoke passes against the recovery page.
- `dotnet test ReelRoulette.sln` and `./tools/scripts/verify-linux-packaged-server-smoke.sh` pass.

#### Always-on WebUI slice

**Scope**

- The server always serves the WebUI from this release, since the admin section lives there.
- The web runtime settings' `enabled` field leaves the contract and the settings, and an `enabled` of off stored in `core-settings.json` is ignored.
- OpenAPI and the generated WebUI types drop the field.
- `docs/api.md` and `docs/dev-setup.md` stop describing the WebUI as optional.

**Traps**

- Turned off, the `enabled` field stops the server serving the WebUI's files and `/runtime-config.json` from its next start, and stops mDNS advertising.
- Turned off from the admin section, `enabled` would remove the admin section itself, and the recovery page has no way to turn it back on.
- The Operator page reads and writes the field, as its `webEnabled` checkbox, until the Operator retirement slice retires it.

**Acceptance**

- With `enabled` stored as off in `core-settings.json`, the server still serves the WebUI and `/runtime-config.json`, and, with remote connections and mDNS on, advertises over mDNS after a restart, in server tests that a stored `enabled` of off is ignored.
- The admin section shows no Enable Web UI switch, and `enabled` is gone from OpenAPI and the web runtime settings, in admin section UI tests and contract tests.
- `dotnet test ReelRoulette.sln` passes.

#### Release checks

- Manual: With the WebUI files removed, the recovery page restarts, stops, shows logs, and applies an update, on Linux and Windows.

### M12p - Server Settings Robustness

- **Status**: ⏳ Planned
- **Goal**: A settings save changes only the fields it sends, a crash mid-write can't truncate the server's settings, and an unreadable settings file is kept aside and reported instead of being replaced with defaults.
- **Depends on**: WebUI Admin Section, whose status shows a settings file that could not be read.
- **Design**: `docs/mockups/reelroulette/`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | Partial settings posts: nullable request fields for the refresh, backup, and web runtime settings, with an omitted field left unchanged. |
| Settings file | ⏳ Planned | An atomic settings write, and an unreadable settings file kept aside, logged, and reported on the admin section's status. |

#### Contract slice

**Scope**

- Make the request fields of the refresh, backup, and web runtime settings posts nullable, with an omitted field left unchanged, as `devChannelEnabled` already is.
- The change only relaxes what a request must send, so a post with every field saves as before.
- OpenAPI and the generated WebUI types carry the nullable fields.
- This makes Admin Refresh, Backup, and Duplicate Review's settings saves safe to send in part.

**Traps**

- `CoreSettingsService.UpdateRefreshSettings`, `UpdateBackupSettings`, and `UpdateWebRuntimeSettings` assign every field from the posted snapshot, and the contract fields are not nullable, so a post that leaves out a field writes its default (for example `fingerprintScanMaxDegreeOfParallelism` back to 4).

**Acceptance**

- A partial post to the refresh, backup, or web runtime settings changes only the fields it names, and leaves the other fields and the other settings sections unchanged on disk, in server tests that a partial post leaves the other fields and sections unchanged on disk.
- A post with every field saves as it does today, in server tests that a full post saves as before.
- The nullable request fields are in OpenAPI, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Settings file slice

**Scope**

- `CoreSettingsService.PersistSettings` writes a temporary file in the same folder and renames it over `core-settings.json`.
- When `CoreSettingsService.LoadSettings` can't read `core-settings.json`, it logs a warning, moves the unreadable file aside before anything is written, and reports it on the admin section's status.
- The report needs a field on `/control/status`, a contract change that only adds, in OpenAPI and the generated WebUI types.
- The admin section's report of an unreadable settings file is added to the mockup, which doesn't show it yet, with its wording approved there.

**Traps**

- `CoreSettingsService.PersistSettings` writes `core-settings.json` in place with `File.WriteAllText`, so a crash mid-write leaves it truncated.
- `CoreSettingsService.LoadSettings` ends in an empty `catch` and falls back to defaults, so an unreadable or corrupt `core-settings.json` looks like a fresh install and the next persist overwrites it.

**Acceptance**

- Killing the server during a settings write leaves the previous or the new file, never a truncated one, in server tests that an interrupted write leaves the previous or the new file.
- An unreadable `core-settings.json` is moved aside before anything is written, a warning is logged, and the admin section's status shows it, in server tests that an unreadable file is kept aside, logged, and reported, and an admin section UI test for the status message.
- The new status field is in OpenAPI, and `npm run verify:contracts` passes.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Not included

- The server's other robustness findings, which is Server Robustness Findings, and its known bugs, which `ISSUES.md` lists.

### M12q - Admin Refresh, Backup, and Duplicate Review

- **Status**: ⏳ Planned
- **Goal**: The admin section starts a refresh, edits refresh and backup settings, reviews and applies duplicates, and clears the whole library's playback stats, so each works from any device.
- **Depends on**: WebUI Admin Section and Server Settings Robustness, so a settings save sends only the fields it changes, and Item Ratings, whose ratings duplicate review shows and Select Best compares, and WebUI Context Menus, whose menu and long press a file card's menu uses.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Everything this milestone adds is gated like the rest of the admin section.
- The refresh and backup fields use the field validation pattern: a value outside the range the server enforces is flagged as it is typed, and Save can't proceed while one is.
- The admin section's refresh and backup settings saves send only the fields that changed. The refresh and backup settings routes assigned every field from the posted snapshot, so a partial post wrote defaults; Server Settings Robustness makes them change only the fields a post sends.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Refresh | ⏳ Planned | Refresh Now with the refresh status, the refresh settings, and clearing the whole library's playback stats from the Library refresh card. |
| Backup | ⏳ Planned | The backup settings, and daily retention in catalog backup rotation with its days setting. |
| Duplicate contract | ⏳ Planned | Each duplicate group file's rating, and its modified time renamed `dateCreatedUtc`, in OpenAPI and the generated WebUI types. |
| Duplicate review | ⏳ Planned | Scanning for duplicates, reviewing each group with each file's rating, Select Best preferring the highest-rated file, and deleting the files not kept after a confirmation. |

#### Refresh slice

**Scope**

- Refresh Now with the refresh status.
- While a refresh runs, the Refresh card shows its stage and progress, and its result pops up as WebUI Notifications' Library refresh popup, a warning when it fails.
- The refresh settings: auto-refresh and its interval (5–1440 minutes), forced loudness and duration rescans on the next refresh, and fingerprint scan parallelism (1–16).
- Clear playback stats for the whole library, which the desktop offered from its Playback menu through `POST /api/playback/clear-stats`. It is an admin action, in the admin view's library section: a red Clear All Playback Stats… button under Playback stats in the Library refresh card.
- Clear All Playback Stats… sends `allItems: true`, since the route refuses a request that names neither `allItems` nor any item id.
- Clear All Playback Stats… asks "Clear the playback stats of every item in the library? Plays and last played go back to none." with a red Clear, and a Your actions popup then says "Cleared the library's playback stats.".

**Traps**

- Desktop Client Removal leaves `POST /api/refresh/start` and `/api/refresh/settings` with no caller. The routes exist, so this needs no contract change (measured before promotion).
- The tray can also start a refresh (measured).
- The interval and parallelism ranges are the ones the server already clamps to.
- Before WebUI Multi-Select and Bulk Actions, which clears a selection's playback stats by ids, the WebUI never called `POST /api/playback/clear-stats` (measured).

**Acceptance**

- Refresh Now starts a refresh, its card shows the refresh's stage and progress, and its result pops up, in admin section UI tests.
- Refresh settings load and save, and saving one field leaves the others as they were on the server, in admin section UI tests.
- Each refresh field accepts the range the server enforces, in admin section UI tests.
- A refresh value outside its range is flagged with the field validation pattern as it is typed, and Save can't proceed until it is corrected, in admin section UI tests of each refresh field.
- The whole library's playback stats can be cleared from the admin view's Library refresh card, after a confirmation, in admin section UI tests of clearing all playback stats.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check of a refresh.

#### Backup slice

**Scope**

- The backup settings: server backups on or off, the time between backups (1–10080 minutes), the number kept (1–100), and the days of daily backups kept (0–365, 0 by default, which turns daily retention off).
- Daily retention: on top of the existing count limit, catalog backup rotation keeps one backup per date for a number of days set in the server's backup settings.
- Daily retention applies to current- and older-version backups alike, so older-version backups, which rotation keeps and does not count today, age out with their dates.
- Newer-version backups and files rotation does not recognize are never touched.
- The days setting adds a field to the backup settings, a contract change that only adds.
- The days setting defaults to 0, which turns daily retention off and keeps today's rotation, so upgrading changes nothing until it is set.
- Like the other settings fields after Server Settings Robustness, the days field is nullable in the request, and a post without it keeps the stored value.

**Traps**

- Desktop Client Removal leaves `/api/backup/settings` with no caller. The route exists (measured before promotion).
- The ranges for the time between backups and the number kept are the ones the server already clamps to.

**Acceptance**

- Backup settings load and save, and saving one field leaves the others as they were on the server, in admin section UI tests.
- Each backup field accepts the range the server enforces, and the days of daily backups accept 0 to 365, where 0, the default, turns daily retention off, in admin section UI tests.
- A backup value outside its range is flagged with the field validation pattern as it is typed, and Save can't proceed until it is corrected, in admin section UI tests of each backup field.
- With the days at 0, rotation keeps and deletes exactly the backups it does today, and a backup settings post without the days field keeps the stored value, in server tests.
- With daily retention set to a number of days, rotation keeps the count limit's newest current-version backups plus the newest backup of each date in that window, current-version or older-version, and deletes older-version backups whose dates fall outside it, in server tests of the window and of older-version backups aging out.
- Newer-version backups and unrecognized files in `backups/` are byte-identical after rotation, with daily retention on or off, in server tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Duplicate contract slice

**Scope**

- Each file in a duplicate group carries its rating, in stars, when it is rated, as library items do.
- `DuplicateGroupItemResponse`'s `LastWriteTimeUtc` is renamed `DateCreatedUtc`, sent as `dateCreatedUtc`, matching the file read.
- OpenAPI and generated WebUI types.

**Traps**

- `DuplicateGroupItemResponse` carries each file's item id, full path, source id, favorite, blacklisted, play count, tag count, and last write time, and no rating.
- The duplicate scan's `LibraryOperationsService` sets `LastWriteTimeUtc`, and OpenAPI's `DuplicateGroupItemResponse` doesn't name it.
- Desktop Client Removal leaves `/api/duplicates/scan` with no caller.

**Acceptance**

- A duplicate scan returns each rated file's rating and leaves it out for an unrated one, in server tests of the duplicate scan.
- A duplicate scan sends each file's modified time as `dateCreatedUtc` and no `lastWriteTimeUtc`, in server tests of the duplicate scan.
- OpenAPI and the generated WebUI types carry the rating and `dateCreatedUtc`, in contract tests, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` passes.

#### Duplicate review slice

**Scope**

- Scan the whole library, all enabled sources, or one source.
- Show each group with thumbnails, the comparison details the desktop showed (file name, plays, tags, favorite, and blacklisted), and each file's rating.
- Choose Keep All or a file to keep per group.
- Each group starts at Keep All or Select Best, from a per-device preference.
- Select Best keeps the highest-rated file, an unrated file counting below any rating, then the one with the most plays, then the newest.
- The preference is chosen in duplicate review rather than the Settings tab, since nothing else uses it. It starts at Keep All, as on the desktop, and survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.
- Apply deletes the files not kept from disk after a plain confirmation that says so and names the groups and files to delete, as the desktop's did, without its step of typing DELETE.
- Duplicate review opens within the admin section's full-page view, not as a panel tab.
- The Duplicates card has the scan's scope (the whole library, all enabled sources, or one source), Scan, and the default, labeled "Each group starts at".
- Review replaces the admin view's contents and has its own bar, with a back arrow to admin, the title Duplicate review, and the group count.
- Each group, headed "Group {n} of {total}" with Keep All beside it, shows its files as cards with a thumbnail, the file name, its folder and size, its rating, plays with Favorite or Blacklisted, tags, and "Keep this one".
- The kept file's card is outlined green, and the others red with a dimmed thumbnail.
- A footer sums up "{n} files to delete from {n} groups; Keep All groups are left as they are." or "Keep All everywhere: nothing will be deleted.", with Cancel and a red Delete {n} Files, disabled while nothing would be deleted.
- The confirmation says "This permanently deletes the duplicate files you didn't keep from disk.", then "Groups to process: {n}" and "Files to delete: {n}", with a red Delete {n} Files.
- Afterwards the card says "Deleted {n} files." and a Your actions popup "Deleted {n} duplicate files.".
- A count of one is singular, such as "Delete 1 File".
- A file card's context menu holds Keep this one, Copy path, and Show in File Manager while the version check lists `api.showInFileManager`.

**Traps**

- Desktop Client Removal leaves `/api/duplicates/scan` and `/api/duplicates/apply` with no caller. The routes exist, so this slice needs no contract change beyond the Duplicate contract slice's rating (measured before promotion).
- `POST /api/duplicates/apply` takes the `/control` routes' check, as delete files does: from another machine without a control session it answers 403 with `control_token_required`, not 401. It publishes `itemsRemoved` for the items it removed.
- The scan request's `scope` already takes `CurrentSource`, `AllEnabledSources`, and `AllSources` (`DuplicateScanRequest`) (measured).
- The desktop decided Select Best in `DuplicateGroupViewModel` (`DuplicatesDialog.axaml.cs`, in git history from before Desktop Client Removal): the file with the most plays, then the newest. The server and the WebUI have no keep rule.
- Each group's files carry their `fullPath` (`DuplicateGroupItemResponse` in `shared/api/openapi.yaml`).

**Acceptance**

- Duplicate review opens within the admin section, in admin section UI tests.
- The Duplicates card scans the whole library, all enabled sources, or one source, sending that scope, in admin section UI tests of each scope.
- Duplicate apply deletes only the files not kept, from disk, after a confirmation that names the groups and files to delete and asks for nothing to be typed, and Keep All deletes nothing in that group, in admin section UI tests.
- The duplicate default is chosen in duplicate review, starts at Keep All, is kept per device, and survives a page refresh, in admin section UI tests.
- Each file's card shows its rating, and Select Best keeps the highest-rated file, then the most played, then the newest, with an unrated file below any rating, in admin section UI tests.
- A file card's context menu keeps that file, copies its path, and shows it in the file manager while the server lists it, in admin section UI tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check of a duplicate scan.

#### Release checks

- Manual: From the admin section, start a refresh, change refresh and backup settings, scan and apply duplicates with Keep All and with a chosen file, and clear all playback stats, and the library updates.

### M12r - Admin Source Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources from the WebUI admin section, with server routes for what no client can do today, and every open WebUI follows source changes without a reload.
- **Depends on**: WebUI Admin Section, Browser-Playable Filter, whose Filter tab reload on `sourceStateChanged` the new source events reuse, and WebUI Multi-Select and Bulk Actions, whose Core item removal (`DeleteItems`) and `itemsRemoved` event removing a source reuses, but not its delete-files route, which deletes the files from disk, and Library Profiles, whose profiles' source lists a removed source leaves, and WebUI Context Menus, whose menu and long press a source row's menu uses.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Everything this milestone adds is gated like the rest of the admin section: localhost, or the control token from other machines.
- Adding a folder takes a path on the server machine. The admin section takes a plain typed path, with no autocomplete or folder browser, and the server checks it as it is typed: a folder on the server that is not already a source, inside one, or holding one, since a refresh compares a file only with its own source's files and would give shared files a second row.
- Adding a source only adds it to the source list and starts a refresh at once, so files enter the library only through the refresh pipeline, and `POST /api/sources/import`'s direct insert of files goes.
- Adding a source while a refresh runs cancels that run and starts a new one. Work the canceled run already saved stays, and the canceled run isn't reported as a failure.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | Server routes to rename and remove a source and check a typed source path, adding a source that starts a refresh in place of import, and `POST /api/presets/add` in place of `POST /api/presets/create`, with events for source changes, in OpenAPI and the generated WebUI types. |
| Manage Sources | ⏳ Planned | The admin section's source list with statistics, adding by server path, Edit Source with rename and Remove, enable and disable, and one Refresh. |
| WebUI source sync | ⏳ Planned | Every open WebUI reloads its library window and Filter tab source list on a source event, with one resync in flight at a time. |

#### Contract slice

**Scope**

- Server routes to rename a source and remove a source (its items leave the catalog; files stay on disk).
- An admin-only route that checks a typed path: a folder on the server that is not already a source, inside one, or holding one. A contract change that only adds.
- `POST /api/sources/import` becomes `POST /api/sources/add`, and `POST /api/presets/create` becomes `POST /api/presets/add`, so the API uses one verb for adding.
- Adding a source adds it, enabled, and starts a refresh, keeping import's root normalization, its matching of a root's slash variants, and its display-name default.
- Each refresh run gets a cancellation of its own, linked to the server's shutdown, so adding a source can cancel the run and start a new one once it has stopped, and the canceled run's end never writes over the new run's status.
- `last.log` records each source added and each refresh it canceled.
- `ImportSourceFolder`, the helpers only it uses, the file listing in `LibraryOperationsService` only import uses, import's tests, and its OpenAPI schemas go, and `docs/api.md`, CONTEXT.md, and `docs/domain-inventory.md` stop describing import.
- Source changes publish events so connected clients update, adding a source included.
- Removing a source also removes it from every profile's chosen list of sources in the same transaction, and publishes `profilesChanged` when a profile changed.
- A source added later joins only the profiles that follow all sources, as Library Profiles sets out.
- OpenAPI and generated WebUI types for the new routes.

**Traps**

- No route renames or removes a source.
- The path check is a new admin-only route, a contract change that only adds (inferred).
- Only enabling or disabling a source publishes an event (`sourceStateChanged`), and `POST /api/sources/import` publishes nothing.
- `POST /api/presets/create` is mapped in `ServerHostComposition.cs`, named in OpenAPI and `docs/api.md`, called by the Filter tab's Add Preset (`src/filter/filterDialog.ts`), and answered by the WebUI tests' preset server (`src/test/fakePresetServer.ts`) and the Tags screen tests.
- Library Profiles keeps a profile's chosen sources in `profile_sources`, and the catalog has no foreign keys, so removing a source doesn't remove its rows there by itself.
- `POST /api/sources/import` inserts every media file of the folder in one transaction, with no size or modified time, starts no refresh, and publishes nothing. It looks each path up across all sources and moves a row it finds onto the new source (`ImportSourceFolder`).
- `InsertSource` has no caller but `ImportSourceFolder`, so the add path is the only thing left that creates a source row.
- Only tests, the generated WebUI types, and docs name the import route or `ImportSourceFolder` (measured).
- The only way to stop a refresh is the service-wide `_shutdown` cancellation (`RefreshPipelineService.cs`), and canceling it stops every later run, so a cancel per run is new.
- A manual run starts as a task nobody keeps, an automatic run is awaited inside the background loop, and `TryReserveRun` refuses a new run until the old run's `finally` clears `_isRunLoopActive`, so starting after a cancel needs the old run's task or a pending restart.
- A canceled run's catch writes `IsRunning = false` onto whatever status is current, so a new run reserved before it runs would show as stopped (inferred).
- A run notices a cancel between files and stages, not during a source's folder walk or one file's hash, so on a large NAS source a cancel can lag by a whole walk (inferred).
- A run reads the source list once, at its start, so it never sees a source added while it runs.
- A canceled run already ends with neither `completedUtc` nor `lastError`, which the WebUI shows as idle, with no notice and no `refreshCompleted` reload (`ShutdownCancel_ShouldStopManualRunWithoutRecordingAFailure`), so the rows it saved show once the new run finishes.
- Every refresh write commits on its own, per item, or per 1,000 name sort keys, so a canceled run keeps what it wrote.
- The refresh compares a new path only with its own source's items, and `items.full_path_fold` has no unique index, so a source inside another, or holding one, would get a second row for each shared file (inferred).
- The refresh skips a disabled source, or one whose folder is missing, with no status entry.
- The refresh writes no `last.log` line for its start, end, failure, or cancel; failure and cancel go only to `ILogger`.

**Acceptance**

- Removing a source removes its items from the catalog and leaves its files, in server tests of the route.
- Removing a source removes it from every profile's chosen list and publishes `profilesChanged`, in server tests of the route.
- The path check route flags a typed path that is not a folder on the server, is already a source, is inside one, or holds one, in server tests of the route.
- Adding a source adds it and starts a refresh that brings in its files, and nothing inserts files outside the refresh, in server tests of the add route.
- Adding a source while a refresh runs cancels it and starts a new one, the canceled run's saved rows stay, and it ends with neither a completion nor an error, in refresh pipeline tests.
- Adding, renaming, removing, enabling, and disabling a source each publish an event, in server tests of the event each source change publishes.
- Add Preset creates a preset through `POST /api/presets/add`, in Filter screen tests.
- New routes are in OpenAPI, and neither the import route nor `POST /api/presets/create` is, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Manage Sources slice

**Scope**

- List sources with the statistics the desktop dialog showed: total media, videos, photos, total duration, and videos with and without audio.
- Add a folder, rename, remove, enable and disable, and refresh.
- The list has one Refresh for all sources, not one per source, since the refresh route takes no source id.
- Each source row has an enable switch, the source's name, path, and statistics, and an Edit button (`edit_note`, "Edit source").
- Edit opens an Edit Source dialog with the name, built as Edit Tag, Edit Category, and Edit Preset are.
- The name uses the field validation pattern: a name another source has, ignoring case, is flagged with "Use a name no other source has.", and Save is disabled while the name is taken or empty, as WebUI In-App Dialogs sets out for the fields of a dialog. An empty name is not flagged.
- Edit Source has **Remove**, not Delete, since the source's files stay on disk. It asks `Remove the source "{name}"? Its items leave the library; its files stay on disk.` in a dialog stacked above, with a red Remove.
- The path field uses the field validation pattern. A path that is already a source is flagged with "That folder is already a source.", one inside a source with `That folder is inside the source "{name}".`, and one holding a source with `That folder contains the source "{name}".`. An empty path is not flagged.
- Add Source sits beside the path field, so it is disabled while the path is empty or flagged, with no icon on the button, as WebUI In-App Dialogs sets out for an action whose fields sit right next to it.
- A Your actions popup acknowledges each change: "Source renamed.", "Source added. Refreshing the library…", "{name} enabled." or "{name} disabled.", and "Source removed.", the last three followed by "ReelRoulette updates the library everywhere it's open.".
- A source row's context menu holds Edit…, Enable or Disable, and Remove…, which act as the row's Edit button, its switch, and Edit Source's Remove do.

**Traps**

- Folder import, enable and disable, and refresh routes already exist.
- The per-source statistics already come from the `sources` list of `GET /api/library/stats`, so they need no contract change.
- The refresh route takes no source id.
- A browser folder picker returns paths on the browser's machine (inferred).
- The desktop's Import Folder sent its own folder picker's path to the server, so it only worked on the server machine.

**Acceptance**

- From the admin section, sources can be added by server path, renamed, removed, enabled, disabled, and refreshed, with per-source statistics, and one Refresh covers the whole list, in admin section UI tests for Manage Sources.
- A typed path that is not a folder on the server, is already a source, is inside one, or holds one, is flagged with the field validation pattern as it is typed, and Add Source is disabled without an icon on it until the path is corrected, as it is while the path is empty, in admin section UI tests for Manage Sources.
- An Edit Source name another source has, ignoring case, is flagged with the field validation pattern, and Save is disabled without an icon on it while the name is taken or empty, in admin section UI tests for Manage Sources.
- Edit Source's button and its confirmation's button say Remove, not Delete, in admin section UI tests for Manage Sources.
- A source row's context menu opens Edit Source, enables or disables the source, and removes it after the same confirmation, in admin section UI tests for Manage Sources.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### WebUI source sync slice

**Scope**

- On a source event, reload the loaded library window, keeping the scroll position as the desktop did, and refresh the profile dialog's Sources tab.
- The Filter tab reloads on the new source events as it does on `sourceStateChanged`.
- Overlapping resyncs: keep one in flight and coalesce events that arrive meanwhile, since this milestone adds source events that reload every open WebUI.

**Traps**

- The server already applies source state: the list query, random selection, and item play only use enabled sources.
- The WebUI keeps no source authority of its own; its source checkboxes are a filter choice.
- Browser-Playable Filter has the Filter tab reload on `sourceStateChanged` as opening it does, keeping its unsaved changes, and the rest of the WebUI ignores the event.
- `src/events/sseClient.ts` calls `void handleResyncRequired(...)` for every `resyncRequired` event, so several authoritative reloads can run at once and finish out of order.

**Acceptance**

- Adding, renaming, removing, enabling, or disabling a source from the admin section updates every open WebUI's library window, Filter tab source list, and profile dialog's Sources tab without a reload, in WebUI tests for source event handling.
- Overlapping resync events cause one reload at a time, in WebUI tests for overlapping resyncs.
- `npm run verify` passes, and one quick spot check of an admin section source toggle seen in another WebUI tab.

#### Release checks

- Manual: On Linux and Windows, from the admin section, add a source by its server path, then rename, disable, refresh, and remove it, and other open WebUI sessions update without a reload.

#### Not included

- Deleting items' files and removing those items from the library, which is WebUI Multi-Select and Bulk Actions.
- Duplicate review, which is Admin Refresh, Backup, and Duplicate Review.
- Moving source management behind admin accounts, which is Auth Cutover for API and Admin.
- Per-user source visibility, which is Per-User Source Permissions.
- Browsing for a source folder, which is Desktop App Shell.

### M12s - Admin Library Catalog Transfer

- **Status**: ⏳ Planned
- **Goal**: Export and import the library from the WebUI admin section, with the server applying the catalog while it runs.
- **Depends on**: WebUI Admin Section, Remove library.json Library Support, and Catalog Open and Backup Safety, so import can restore a library while the server runs without one, and Admin Source Management, whose server path check the remap fields use, and Admin Refresh, Backup, and Duplicate Review, whose daily retention marks the backups the restore list labels daily, and WebUI Context Menus, whose menu and long press a backup row's menu uses.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Everything this milestone adds is gated like the rest of the admin section.
- Settings and backups are not part of the transfer. Presets, profiles, and thumbnail revision and dimensions travel with `library.db`. JPEG files stay in the local thumbnail directory.
- Import also works while the server runs without a library, and can import one of the server's own backups, which is how the admin section restores a backup.
- Before it replaces the library, an import or a restore takes a catalog backup of the current one, even with server backups off and whatever the backup gap, so a mistaken import or restore can be undone from the restore list.
- That backup is listed first in the restore list, labeled by when it was made and what it came before, such as "Today 14:32 (before import)" or "Today 14:32 (before restore)".

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Report | ⏳ Planned | A report on every holder of catalog state and connections in the server and how each is handled for a replace, written before the import slice. |
| Export name | ⏳ Planned | The export route's suggested name `library-{date}.db`, and Export Library in the admin section. |
| Import | ⏳ Planned | Import while the server runs, with replace and recovery, the not-a-library check, the upload limit, the remap, and the admin section's Import Library flow. |
| Backup restore | ⏳ Planned | A route listing the server's backups, the Backups card's restore list, and Restore. |

#### Report slice

**Scope**

- List every holder of catalog state and connections in the server, such as the catalog session and its SQLite connection pool, the cached list counts, the random shuffle bag, the profiles, refresh stages, catalog backups, duplicate and auto-tag scans, and the event revision, and how each is stopped, cleared, or reloaded for a replace.
- Include how SQLite connections are closed before the rename on Windows.
- Decide whether an import waits for or refuses a running refresh.

**Traps**

- On Windows, a file that is open can't be renamed (inferred).

**Acceptance**

- The report on catalog state holders is written before the import slice starts. It names every holder of catalog state and connections and how each is stopped, cleared, or reloaded for a replace, how SQLite connections are closed before the rename on Windows, and whether an import waits for or refuses a running refresh.

#### Export name slice

**Scope**

- The export route suggests `library-{date}.db` as the download's name (its `Content-Disposition` file name) in place of `library.db`, dated by the server's local date, such as `library-2026-10-08.db`. Only the suggested name changes.
- **Export Library** in the admin section uses the same route, `GET /api/library/catalog-checkpoint`. Export is a plain download in every browser, with no save picker, so it has no ellipsis.
- A Your actions popup says "Downloading {file}." as the download starts.
- The library transfer card's hint reads "Export saves the whole library: items, tags, presets, profiles, and stats. Import replaces it while the server runs; the current library is kept aside until the new one opens."

**Traps**

- Export is already a server operation: `GET /api/library/catalog-checkpoint` writes a standalone checkpoint while the server has `library.db` open, and the desktop's Library Export saved that file.
- `GET /api/library/catalog-checkpoint` passes `library.db` to `Results.Stream` (`ServerHostComposition.cs`).
- A browser doesn't report when a download finishes (inferred).

**Acceptance**

- The admin section can export a server-produced checkpoint, in admin section UI tests for export.
- The export downloads as `library-{date}.db`, dated by the server's local date, in server tests for the export's suggested name.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Import slice

**Scope**

- Import moves onto server operations and runs while the server is up.
- Reuse the replace-and-recover protocol already in `LibraryCatalogStore` (incoming file, finished-file rename, recovery), which the desktop import used with the server stopped. What is new is replacing the database while the server's catalog session is open.
- The previous database stays aside until the new file is in place and opens.
- A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed.
- A file that is not a library database is rejected.
- The import upload has its own limit and streams to the incoming file rather than buffering in memory.
- `verify-linux-packaged-server-smoke.sh` uploads a file larger than 30 MB that isn't a library and gets the not-a-library answer, not a refusal for its size.
- Import keeps the source folder remap the desktop import offered, through `LibraryCatalogStore.RemapSources`. Each remap field checks for a folder on the server, through the path check Admin Source Management adds; left empty, it keeps the old path.
- **Import Library…** in the admin section's library transfer card.
- While an import uploads, a progress bar shows in the library transfer section, with "Uploading {file}: {n}%".
- The file uploads first; the server then reads its source folders for the remap dialog, or rejects a file that isn't a library with the notice "{file} isn't a ReelRoulette library. The library wasn't changed."
- The remap dialog, titled "Import {file}", says "Its source folders were on another machine. Point each one at its folder on this server, or leave it to keep the path.", with one field per source folder labeled with its old path, using the field validation pattern, and Cancel and Import.
- Import is disabled while a remap field is flagged, with no icon on it, as WebUI In-App Dialogs sets out for the fields of a dialog.
- Import then asks "Replace the library with {file}? The current library is kept aside until the new one opens.", with Cancel focused and a red Replace, and a Your actions popup says "Imported {file}. Connected clients reload the library."

**Traps**

- Since Desktop Client Removal no client imports a catalog. The desktop's `LibraryArchiveMigration.ImportDatabase`, in git history, wrote the server's `library.db` from the desktop process with the server stopped, and only the Core tests call `LibraryCatalogStore`'s import API.
- On a copy of the developer's catalog, `library.db` is 92.5 MB (92,520,448 bytes, no free pages) for 49,055 items (measured).
- That is larger than ASP.NET Core's default request body limit of about 30 MB, the framework default (inferred).
- The server raises the multipart form limit (`FormOptions.MultipartBodyLengthLimit`) to 512 MB, left from earlier library import work, but no route reads a form now and the request body limit itself is not raised.
- The limit is Kestrel's, and the server tests call handlers without an HTTP host, so the packaged server smoke script covers it.

**Acceptance**

- The admin section can import a `library.db` while the server is running, in server tests for running-server import and admin section UI tests for import.
- An interrupted import leaves the previous catalog or the finished incoming file, never a partial database or an empty catalog, in server tests for interrupted-replace recovery.
- Import rejects a file that is not a library database and does not replace the live catalog, in server tests for its rejection.
- Import replaces the catalog, including presets, profiles, and thumbnail revision and dimensions, while settings and backups stay where they are and JPEG files stay in the local thumbnail directory, in server tests for running-server import.
- Connected clients resync after an import, in server tests for running-server import.
- Before an import replaces the library, a catalog backup of the current one is taken, even with server backups off, in server tests for the backup taken before a replace.
- An import while a refresh, backup, or scan runs does what the report decided, and never leaves a partial catalog, in server tests for an import during a refresh.
- Each remap field checks for a folder on the server, Import is disabled without an icon on it while one is flagged, and one left empty keeps the old path, in admin section UI tests for the remap fields.
- A file larger than 30 MB uploads to the packaged server without a refusal for its size, in `./tools/scripts/verify-linux-packaged-server-smoke.sh` with its upload larger than 30 MB.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `./tools/scripts/verify-linux-packaged-server-smoke.sh`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.

#### Backup restore slice

**Scope**

- A new route lists the server's backups, a contract change that only adds.
- The Backups card lists the server's backups under Restore, newest first, each named by when it was made, such as "Today 06:00", "Yesterday 18:00", or "3 days ago (daily)", with a Restore… button.
- A backup kept only by daily retention is labeled "(daily)".
- Restore asks "Restore the backup from {when}? The current library is kept aside until the backup opens.", with Cancel focused and a red Restore, and a Your actions popup then says "Restored the backup from {when}.".
- A backup row's context menu holds Restore…, which asks first, as the row's button does.

**Traps**

- No route lists the server's backups.

**Acceptance**

- The Backups card lists the server's backups, and restoring one asks first and then replaces the library with it, in admin section UI tests for restore.
- A backup row's context menu restores the backup after the same confirmation, in admin section UI tests for restore.
- Before a restore replaces the library, a catalog backup of the current one is taken, even with server backups off, in server tests for the backup taken before a replace.
- The backup taken before an import or a restore shows first in the restore list, labeled "(before import)" or "(before restore)", in admin section UI tests of the safety backup's place and label.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Release checks

- Manual: Export the library from the admin section and import it into a fresh server, on Linux and Windows.

#### Not included

- A Save as dialog for the export, which is Desktop App Shell.

### M12t - Testing Suite Overhaul

- **Status**: ⏳ Planned
- **Goal**: The testing suite produces clear results that match the WebUI's connection and status handling.
- **Depends on**: WebUI Notifications, Server Shutdown Fixes, and WebUI Admin Section.
- **Design**: `docs/mockups/reelroulette/`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Report | ⏳ Planned | A report of what the WebUI shows, and how SSE disconnect closes and reconnects, for each scenario run several times against a running server. |
| Scenarios | ⏳ Planned | The scenarios redesigned against current WebUI behavior, each with its expected WebUI message, checked as part of the suite. |

#### Report slice

**Scope**

- With a running server, which needs the user's approval to start, run each scenario against the WebUI several times.
- Report what the WebUI shows and how SSE disconnect closes and reconnects on each run, so the redesign starts from measured behavior.

**Traps**

- The suite predates the current client connection and status handling and no longer produces clear results.
- With the API unavailable, the WebUI shows "library load failed: HTTP 503" only briefly before settling on "SSE reconnecting..." (measured before promotion).
- WebUI Notifications replaces "SSE reconnecting..." with the indicator's Reconnecting…, and the library keeps its load failure in its body.
- SSE disconnect behaves inconsistently and may need redesigning (measured before promotion).
- The Operator testing suite has five scenario flags: API version mismatch, capability mismatch, API unavailable, missing media, and SSE disconnect.

**Acceptance**

- The report of each scenario's behavior on a running server, naming what the WebUI shows and how SSE disconnect closes and reconnects on each run, is written before the Scenarios slice starts.

#### Scenarios slice

**Scope**

- Redesign the scenarios against current WebUI behavior, define the expected WebUI message for each, and verify the WebUI's behavior as part of the suite.
- The suite runs from the admin section.
- Each scenario shows its expected message under it, labeled "Expected message:": the lasting state the player's indicator shows, or the popup the WebUI sends. The mockup leaves the messages to this milestone, which takes them from WebUI Notifications' per-event messages.
- If the redesign changes the scenarios the testing routes under `/control` take, that is a contract change that doesn't only add, and OpenAPI and the admin section change together.

**Traps**

- Server Shutdown Fixes changed how event streams close.
- Neither client calls the testing routes under `/control`, and the Operator page is retired by then, so the admin section, which ships in the same build, is their only caller.

**Acceptance**

- Each scenario lists the expected WebUI message, and the WebUI shows it while the scenario is active, in automated tests that each scenario's simulated server responses make the WebUI show its expected message.
- SSE disconnect behaves the same way on every run, in automated tests that it closes and reconnects the same way on repeated runs.
- Running and resetting each scenario leaves the WebUI connected and working, in automated tests that each scenario sets and resets the server state it describes.
- If the scenarios change, contract tests cover the testing routes' new shape.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass, and one quick spot check of one scenario.

#### Release checks

- Manual: Every testing suite scenario shows its expected WebUI message, and resetting it leaves the WebUI connected.

## Planned Milestones

### P1 - End-User README and Contributor Dev Documentation

- **Status**: ⏳ Planned
- **Goal**: Make `README.md` the non-technical guide for installing and running ReelRoulette on Windows and Linux, and keep contributor detail in `docs/dev-setup.md` with one complete command and script reference.

#### Scope

- `README.md`, for end users and operators:
  - Installation and day-to-day use only, with a pointer to `docs/dev-setup.md` for building from source.
  - A table of contents after the introduction.
  - Install through the Velopack releases: the Windows per-user `Setup.exe` and the Linux AppImage, first launch, application menu registration on Linux, and in-app updates through the WebUI admin section.
  - Installing the WebUI as an app on phones and desktops over HTTPS.
  - Runtime prerequisites only (FFmpeg with `ffprobe`, FUSE 2 for the AppImage), with package commands for Debian/Ubuntu, Fedora, and Arch-based distributions (CachyOS as the Arch example).
  - A user manual covering playback, library browse, tags, presets, filters, WebUI access, the admin section and the recovery page, account setup and login, reverse proxy access, catalog transfer from the admin section, Launch Server on Startup, and tray versus headless behavior.
  - Troubleshooting: native dependencies, permissions, display and audio, missing tray, autostart conflicts.
  - The Documentation Map and Third-Party Components sections stay.
- `docs/dev-setup.md`, for contributors:
  - Any developer content moves here out of the README.
  - All development prerequisites (.NET SDK, Node, PowerShell) with Debian/Ubuntu, Fedora, and Arch-based install commands.
  - A full list near the top of every `tools/scripts/*` entry point and recurring `dotnet` and `npm` command, with a short explanation each.
- `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, and the testing checklist are brought in line with the README and dev-setup split.

#### Traps

- The accounts release changes first-run setup and how clients connect, which the user manual describes.

#### Acceptance

- `README.md` alone covers installing and running the server on Windows and on each listed Linux family, and reaching the WebUI and its admin section, checked by reading it.
- A contributor can rely on `docs/dev-setup.md` for setup, build, test, and release workflows, checked by reading it, and its script list matches `tools/scripts/`, in a check that every script in `tools/scripts/` is listed in it.
- No current-state doc names retired packaging (Inno Setup, portable archives, install scripts, `appimagetool`), in a search of the current-state docs.

#### Release checks

- Manual: A fresh-install walkthrough on Windows and one Linux distribution, by a non-developer following `README.md` alone, installs and runs the server and reaches the WebUI and its admin section.

### P2a - Playback Session Contracts and Capability Surface

- **Status**: ⏳ Planned
- **Goal**: Establish contract-first playback-session APIs and capability signaling.

#### Scope

- Defines OpenAPI contracts for playback-session create and read and the stream URL.
- The session-create request can say that direct playback of the item failed in this browser.
- Playback-session and transcode capability markers join the capability list served by `/api/version` and `/api/capabilities`.
- The WebUI types are regenerated.

#### Acceptance

- OpenAPI includes the playback-session surfaces and validates, in contract tests.
- The session-create request's field saying direct playback failed is in OpenAPI, in contract tests.
- The WebUI detects a server without playback sessions from the capability list, in a capability check against a server without the feature.
- Generated WebUI types match OpenAPI, and `npm run verify:contracts` passes.

#### Not included

- Checking each stream session against the user's sources once accounts exist, which is Per-User Source Permissions.

### P2b - Server Playback Decision Engine

- **Status**: ⏳ Planned
- **Goal**: Make the server the only place that chooses direct, remux, or transcode playback.

#### Scope

- A playback-session decision service that decides from media probe metadata and client capability hints.
- Probe results are cached by file path and modification time to avoid repeated `ffprobe` runs.
- Decision output: playback mode (`direct`, `remux`, `transcode`), delivery type (`progressive` or `hls-fmp4`), and a reason for troubleshooting.
- A session request that says direct playback failed decides `transcode`, never `remux`, whatever the probe metadata and client hints say, since a file the browser rejected has a container like one it plays.
- A decision is made for its request alone: nothing remembers that a file failed direct playback, so each play of it tries direct playback again before its transcode, which costs under a second.
- Each decision is logged through the structured log API (component, operation, mode, reason), without file names or paths.

#### Traps

- A YouTube VP9 MP4 that Safari on the iPad rejects and one it plays have the same codec string, a byte-identical `vpcC` box, and matching sample tables, and both decode without errors in ffmpeg and libvpx (measured), so probe metadata can't tell which files a browser will reject.
- On iOS and iPadOS, WebKit plays VP9 only through a hardware decoder, with no software fallback, so the iPad's capability hints will say it plays VP9 in MP4 (inferred).
- Safari on the iPad rejects such a file 0.15–0.7 s after its play starts (measured).

#### Acceptance

- The server chooses `direct`, `remux`, or `transcode` for each session request, and the same inputs give the same decision, in decision tests over a fixture of probe results and client hints.
- A request that says direct playback failed decides `transcode` for a file that would otherwise play directly, in decision tests over the same fixture.
- Session responses include the delivery type and a reason, in decision tests over the same fixture.
- Each decision appears in `last.log` as a structured entry without file names or paths.
- A probe result is reused for an unchanged file and probed again for a changed one, in probe-cache tests for unchanged and changed files.

#### Not included

- Remembering per file or browser that direct playback failed.

### P2c - Media Token Lifetime and Direct-Stream Sessions

- **Status**: ⏳ Planned
- **Goal**: Direct-stream URLs are session tokens with a lifetime, and an expired or unknown token cannot stream anything.

#### Scope

- Media tokens get a time to live and a size cap, and are tied to the playback session.
- Expired sessions are cleaned up.
- When the WebUI swaps the playing video to a fresh media URL, as its recovery from a lost token does and expiring tokens will make it do while a video plays, it keeps the last frame on screen until the new source plays, so the picture doesn't cut to black.

#### Traps

- `POST /api/random` and `POST /api/play/{itemId}` already issue a media token, and `GET /api/media/{token}` streams it with range requests.
- `ServerMediaTokenStore` has no expiry or eviction: every play adds a token that is never removed and stays valid until the server stops.
- `GET /api/media/{token}` takes only tokens since Desktop Client Removal.
- The WebUI's history steps, Next and Previous through its history, get a fresh media token through `POST /api/play/{itemId}` before playing, and the player gets one the same way at once when a video that has played fails, and for any other failed media once its range request answers `404`, so an expired token is recovered rather than read as a missing file.
- After a server restart, the WebUI's recovery cuts the picture to black for about half a second while the fresh source loads, 400 to 800 ms by the user's estimate, not measured.

#### Acceptance

- Direct-stream URLs are issued and validated through playback sessions, in a range-request test on a session URL.
- An expired or unknown token returns the same not-found result, and expired sessions are removed, in token expiry and eviction tests.
- The token store size stays bounded under repeated plays, in size-cap tests.
- When the WebUI swaps the playing video to a fresh media URL, the last frame stays on screen until the new source plays, in WebUI tests of the swap.

### P2d - Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline)

- **Status**: ⏳ Planned
- **Goal**: Add compatibility streaming for unsupported formats and long-form playback.

#### Scope

- Remux and transcode with ffmpeg.
- Segmented streaming uses HLS with fMP4 segments as the single baseline profile.
- ffmpeg workers and temporary segment and transcode files are cleaned up.
- Once this lands, the Browser-Playable Filter is revisited: files the server can remux or transcode play in every browser.

#### Acceptance

- With API playback, incompatible media is served through remux or transcode, with no client-side format workarounds, in remux and transcode tests on a small media fixture set.
- Segmented streaming is HLS with fMP4 segments, in the same remux and transcode tests.
- No ffmpeg process or segment or transcode file is left after a session expires or the server stops, in a cleanup test after session expiry and after shutdown.

### P2f - WebUI Playback Cutover and Format Resilience

- **Status**: ⏳ Planned
- **Goal**: WebUI playback starts through playback sessions and handles files the browser cannot play, including ones it claims to support.
- **Depends on**: Playback Session Contracts and Capability Surface, Server Playback Decision Engine, Media Token Lifetime and Direct-Stream Sessions, and Remux/Transcode and Segmented Streaming (HLS fMP4 Baseline).

#### Scope

- WebUI playback start goes through the playback-session API.
- Direct playback is preferred when supported, with a fallback to the HLS fMP4 stream when needed.
- When direct playback fails on a file the server can read, the player retries it once from where it failed, through a new session whose request says direct playback failed.
- The retry takes the place of today's format failure: it follows the range-request probe's `200` or `206`, so a video that had played still gets its fresh media URL first.
- A retry that fails too shows today's format notice, or skips the file during autoplay, Next, Previous, and random picks.
- Best-quality downloads stay as they are: this retry is what makes the YouTube VP9 MP4 files the iPad rejects play there.
- The WebUI's seamless loop stays on both progressive and HLS playback.
- Checks long-form buffering, seek, reconnect, and format edge cases.

#### Traps

- Safari on the iPad rejected 7 of 15 YouTube VP9 MP4 downloads in one session, each 0.15–0.7 s after its play started, before any `playing` event (measured).
- A file it rejects plays in Chrome on Android and Firefox on Linux (measured).
- `videoFailed` in `src/playback/player.ts` doesn't read `video.error`, and `probeMedia` in `src/playback/mediaFailure.ts` reads any `200` or `206` as a format the browser can't play, so a decode failure and a source the browser refused look the same.
- A video that fails at the same point mid-file may get fresh media URLs without end and never reach the probe, which `ISSUES.md` lists as "A video that fails at the same point mid-file may recover without end" (inferred).

#### Acceptance

- WebUI playback starts from server-issued playback sessions, in WebUI tests of session start.
- Formats the browser cannot play are handled by the server pipeline, in WebUI tests of fallback.
- A file whose direct playback fails while the server can read it plays on through a transcode session from where it failed, in WebUI tests of the retry before and after the video has played.
- A retry that fails too shows the format notice, or skips the file during autoplay, in WebUI tests of the retry.
- Looping behaves the same on progressive and HLS playback, in WebUI tests.
- `npm run verify` passes.

#### Release checks

- Manual: Movie-length playback in the WebUI works on the long-form validation set.
- Manual: On the iPad, a YouTube VP9 MP4 that Safari rejects plays through the server's transcode.

### P2g - Resume Position and Session Continuity

- **Status**: ⏳ Planned
- **Goal**: The server remembers playback position for the WebUI on every device and counts only plays that start.

#### Scope

- A server-owned resume-position contract and storage, with throttled writes and clear completion and reset rules.
- Resume-position query and clear APIs.
- Resume settings (on or off, threshold windows, retention) through server settings.
- Loop iterations do not count as plays and do not create resume points.
- A play counts only once its media starts: the WebUI records it through `POST /api/record-playback` once the video first fires `playing` or the photo loads, so a file that fails to load isn't counted.
- No playback start request records a play, so their `recordPlayback` option goes.
- Resume positions are kept per server, shared by every device, until accounts exist.

#### Traps

- `POST /api/play/{itemId}` records a play before the browser loads anything, for a library play and a history step.
- A random pick records its play through `POST /api/record-playback` as its attempt starts (`beginAttempt` in `src/playback/player.ts`).
- Only the recovery of a video that had played and the recheck after a `404` send `recordPlayback: false`.
- A file Safari rejected at load still counted a play: one file's only recorded play was its failed attempt (measured).

#### Acceptance

- Resume position survives reconnects and restarts through server state, in server tests for recording.
- The WebUI resumes from the server's position on every device, in client tests for resume.
- Clearing a resume position works and is visible on every device, in server tests for clearing.
- Resume settings are stored and enforced by the server, and documented, checked by reading the docs.
- A video or photo that fails before it plays or shows records no play, and one that plays or shows records one, in WebUI tests of play recording for a library play, a history step, and a random pick.
- No playback start request records a play, in server tests of the start routes.
- Loop iterations record no play and create no resume point, in server tests for the loop rule.

#### Not included

- Deciding whether resume positions become per account, which is Per-Account Library Data.

### P2h - Playback Concurrency, Diagnostics, and Hardening

- **Status**: ⏳ Planned
- **Goal**: Keep the playback pipeline stable with several clients and make failures diagnosable from the admin section.

#### Scope

- A limit on concurrent transcodes, with a queueing policy, as a server setting with a safe default.
- Admin section diagnostics for active sessions, mode decisions, and failure reasons.

#### Acceptance

- Multi-client playback stays stable when transcode capacity is limited, in concurrency-limit and queueing tests.
- The admin section shows enough to troubleshoot a playback failure.
- After the server stops, no ffmpeg worker remains, and temporary playback and transcode folders are cleaned or expire, in a shutdown cleanup test.

#### Release checks

- Manual: In the multi-client playback matrix on Linux and on Windows, playback stays stable when transcode capacity is limited.

### P4 - File Metadata Sync

- **Status**: ⏳ Planned
- **Goal**: Import tags and metadata from media files and write them back, through the server. It may be dropped rather than built.
- **Depends on**: Item Ratings, whose rating it reads from and writes to media files, and Extended Metadata, whose fields it reads from and writes to media files.

#### Scope

- Metadata sync in core and server services:
  - import tags from supported formats during import and refresh,
  - export tags and metadata to files on demand, with an optional auto-export policy,
  - an explicit, configurable merge policy.
- Metadata sync settings through server settings: auto-import, auto-export, merge strategy, and write confirmation.
- Import and export cover Extended Metadata's fields: title, year, genre, creator or artist, album or series, and comment.
- The rating is Item Ratings' rating, not a new column:
  - Import fills an unrated item's rating from the file's, and the merge policy decides whether a file's rating replaces one already set.
  - A file's rating of 0, XMP's unrated, or −1, XMP's rejected, reads as no rating, and a rejected file isn't blacklisted.
  - Export writes half stars to formats that hold fractions and rounds them for formats that hold whole stars, in a direction this milestone decides.
  - Clearing a rating removes it from the file on export.
- Tags it imports have no profile choice, so they count as "All profiles", as Profile Tag and Preset Visibility sets out.
- Decides whose rating and tags it reads from and writes to a file once each account has its own, as Per-Account Library Data sets out.
- Unsupported formats, read-only or locked files, and network paths are handled, with result summaries and structured logs.

#### Traps

- No metadata library is referenced today.
- Extended Metadata stores a title only when it is edited, and an item without one shows its file's name.
- Item Ratings stores a rating as 1 to 10 half stars, with no value for unrated.
- XMP's `xmp:Rating` is a real number from −1 to 5, where 0 is unrated and −1 rejected; Matroska's RATING tag allows decimals from 0 to 5; and Windows' Rating property is a 1–99 percentage that it shows as whole stars (inferred).

#### Acceptance

- Metadata import and export run only through server APIs.
- The supported formats and field mappings are tested, in format mapping tests, and documented, checked by reading the docs.
- The merge policy gives the same result for the same inputs, in merge-policy tests.
- Ratings import and export by the rules above for each supported format, in format mapping tests.
- Batch operations follow the conflict and error policy and report success and failure counts with reasons.

### P5 - Customizable Keyboard Shortcuts

- **Status**: ⏳ Planned
- **Goal**: Let WebUI users rebind keyboard shortcuts on each device while keeping the defaults.
- **Depends on**: WebUI Keyboard Shortcuts, which adds the default bindings and the shortcut reference.

#### Scope

- A shortcut editor in the WebUI Settings tab: it lists actions and bindings, captures keys with `Ctrl`, `Shift`, and `Alt`, detects conflicts, and resets one or all bindings.
- Bindings are stored per device with the other WebUI preferences.
- Keys resolve through a binding map instead of fixed checks.
- Keys the browser keeps for itself cannot be bound.
- A combination with Ctrl, Alt, or Meta runs its shortcut once bound, and one bound to nothing stays the browser's.

#### Acceptance

- Rebound actions work and survive a reload on that device, in binding-map tests.
- Conflicts cannot leave two actions on one binding, in conflict tests.
- Defaults can be restored, in reset tests.
- Browser-reserved keys cannot be bound.
- `npm run verify` passes.

### P6 - Playback History and Analytics

- **Status**: ⏳ Planned
- **Goal**: Record playback history on the server and show analytics from it in the WebUI.

#### Scope

- A server-owned playback events table (catalog schema change), written when the server records a play, with a retention setting.
- Server analytics queries over that history and library stats: plays per day, week, and month; top-played items; favorites ratio; duration, source, and time-of-day distributions; tag usage.
- Date ranges (`7d`, `30d`, `90d`, `1y`, `all`) and optional grouping.
- Charts and summary panels in the WebUI stats panel, a date-range selector, and image and CSV or JSON export.
- The server computes analytics; clients only render.
- History is kept per account once accounts exist, as Per-Account Library Data sets out.
- Analytics cover the active profile's sources, as the Stats tab's library cards do.

#### Traps

- The catalog keeps only a play count and last-played time per item, so there is no history to chart yet.

#### Acceptance

- Each recorded play adds a history row, and retention removes old rows, in history write and retention tests.
- Analytics come only from server APIs and match across devices for the same range.
- Date ranges change the aggregates correctly, in aggregate tests per range.
- Exports match the current query.
- The catalog migrates to the schema with the playback events table, in schema migration tests.

### P9a - Photo Face Detection Baseline

- **Status**: ⏳ Planned
- **Goal**: Deliver reliable face detection for photos with practical UX and performance controls.

#### Scope

- The face-analysis baseline in core and server: detection jobs, stored results, and API queries for clients.
- Clients display results and start server jobs; they do not detect locally.
- Chooses a .NET-compatible detection stack (OpenCV, ML.NET, or other) for photos.
- Import-time and on-demand scans.
- Bounding boxes, confidence, and a metadata version stored per item (catalog schema change).
- Optional bounding box overlays in preview and face-aware filter entry points.
- Off by default, run in the background, and reuse cached results with a clear invalidation rule.

#### Acceptance

- Face detection results are produced and owned by the server, in detection job and storage tests on a photo fixture set.
- The WebUI reads face metadata through APIs, in query tests on the photo fixture set.
- Photo detection runs in the background and does not block playback or import.
- Overlays and filters work for detected photo faces.
- Performance impact is bounded and documented.

#### Not included

- Video face detection, which is Video Face Detection Expansion.

### P9b - Video Face Detection Expansion

- **Status**: ⏳ Planned
- **Goal**: Extend face detection to video with sampling suited to long media.

#### Scope

- Builds on the photo detection of Photo Face Detection Baseline.
- Defines frame sampling (interval, keyframe, or scene-aware).
- Detection runs as background jobs with queueing and concurrency limits.
- Timeline-aware results are stored for video items.
- Timeline overlays or markers and filter hooks matching photo behavior where practical.

#### Acceptance

- Video detection runs within its resource limits and does not disturb playback or transcodes, in resource-limit tests.
- Results come through server APIs in the same shape as photo results where possible.
- Long media processing can resume and retry, in resume tests, and is visible in the admin section.
- Frames are sampled as the sampling rule defines, in sampling tests.

#### Not included

- Recognition or identity, only after the detection baseline is stable, and only if separately approved.

### P10 - Ordinal Path Identity on Linux

- **Status**: ⏳ Planned
- **Goal**: On Linux, treat paths that differ only by case as different paths in folder import and in refresh, and keep the ignore-case path compare on Windows.

#### Scope

- Folder import and refresh use ordinal path identity on Linux. Windows keeps the ignore-case compare, since an ordinal compare there risks removing and re-adding items.
- A case-only rename on Linux rewrites the stored full path, relative path, and file name together.
- Two files that differ only by case stay two items.
- Decides source-root casing in the same change, including two directories that differ only by case on Linux.
- Ordinal lookups on Linux get matching indexes on the stored paths, or fold columns that keep case on Linux, so this is a catalog schema change with its own migration.

#### Traps

- Windows enumeration casing has not been measured. The v0.15.0 release pass measures it on the Windows VM, as a Manual check in the testing checklist, so promotion starts from the result.
- An ordinal compare on Windows may treat an operating-system casing difference as a removed file plus a new file (inferred).
- Path identity is built into the catalog: source and item paths are matched on lowercase `root_path_fold`, `full_path_fold`, and `relative_path_fold` columns, and only those columns are indexed.
- Source roots have the same case problem: `/Media` and `/media` can be different directories on Linux and are still compared ignoring case.
- On Linux, for both v0.12.0 import and the current import, after `Clip.mp4` is renamed to `clip.mp4`, the stored full path stays `Clip.mp4` while the relative path and file name become `clip.mp4` (measured).
- Refresh of that rename then reports 0 added, 0 removed, 0 renamed, and 0 moved, and the thumbnail stage reports 1 missing source (measured).
- An ignore-case set of a folder that contains both `clip.mp4` and `Clip.mp4` keeps one path; an ordinal set keeps both (measured).
- A query of a real 48,938-item catalog found no case-only path collisions (measured).

#### Acceptance

- On Linux, importing a case-only rename of an existing file stores the new full path, relative path, and file name, and that full path exists, in Linux import tests of the rename.
- On Linux, refresh of that rename reports the rename and stores the discovered path, in Linux refresh tests of the rename.
- On Linux, two files in one folder that differ only by case both remain in the catalog, in Linux tests of the two files.
- On Windows, a casing difference between the stored path and the enumerated path does not remove the item or add a second one, in tests of the Windows ignore-case compare.
- Source-root casing is decided in the same change, including two directories that differ only by case on Linux.
- Path lookups stay indexed after the change.
- The catalog schema change migrates an existing catalog, in schema migration tests.

#### Release checks

- Manual: On the Windows VM, a casing difference between the stored path and the enumerated path does not remove the item or add a second one, in folder import and in refresh.

### P27a - Structured Log Schema, Writer, and Ingestion

- **Status**: ⏳ Planned
- **Goal**: `last.log` is JSON Lines written by one server writer, for server logs and ingested client logs alike, with correlation fields and deterministic rotation.
- **Depends on**: Server Data Folder Override, whose folder helper resolves the log path.

#### Scope

- One writer for the server's `ILogger` pipeline (a logging provider) and for `POST /api/logs/client`. The hand-written appends go through it.
- Schema, one JSON object per line:
  - Required on every entry: `ts`, `lvl`, `cat`, `svc`, `comp`, `op`, `msg`, and the writer-assigned `ingestReqId`.
  - `lvl` is one of lowercase `trace|debug|info|warn|error|fatal`.
  - `cat` is the entry's category, separate from `lvl` and `comp`, and one of:
    - `action`: user interactions, such as tag edits, preset changes, playback, favorite and blacklist changes, and settings changes.
    - `access`: pairing, control token, login, and permission outcomes.
    - `job`: refresh, scans, backups, and duplicate scans.
    - `lifecycle`: startup, shutdown, restart, updates, and the tray.
    - `connection`: event streams opening, closing, and resyncing.
    - `general`: everything else. The writer sets `general` when an entry does not give a `cat`.
  - `svc` is one of `server|webui`.
  - Optional fields in canonical order: `evt`, `data`, `ingestReqId`, `clientOpId`, `traceId`, `spanId`, `clientId`, `sessionId`, `ver`, `build`, `clientTs`, `srcIp`, `userAgent`; `evt` sits right after `op` and `data` right after `msg`.
  - `evt` is optional, dot-delimited, lowercase, stable, and low-cardinality, used only when it adds something `op` does not.
  - `data` is bounded: safe primitives, short allowlisted strings, and small objects, with no arbitrary object dumps.
  - `ex` is accepted on input only and normalized into `data.error` (`type`, `code`, `messageSafe`, optional bounded stack fingerprint); it is never a top-level field.
  - Example: `{"ts":"...","lvl":"info","cat":"general","svc":"webui","comp":"web.library","op":"UpdateLibraryPanel","evt":"web.library.panel.updated","msg":"Library panel updated.","data":{"totalCount":38833,"eligibleCount":163},"ingestReqId":"...","clientOpId":"...","traceId":"...","spanId":"...","clientId":"...","sessionId":"...","ver":"...","build":"...","clientTs":"...","srcIp":"...","userAgent":"..."}`
- Minimum level: the writer drops entries below a configurable minimum level, set in the server's core settings and `info` by default, for server and client entries alike.
- A client entry below the minimum is accepted and not written.
- Time and correlation:
  - `ts` is the server write time and decides order; `clientTs` is the client's event time, kept for context.
  - `clientOpId` is an optional client operation id, kept when provided.
  - Request-scoped HTTP and event stream logs carry W3C `traceId` and `spanId` when trace context is active; background and client-local events may omit them.
  - `srcIp` and `userAgent` are added by the server, never by clients.
- Strict ingestion at `POST /api/logs/client`:
  - Valid fields are kept as sent, without inferring `lvl`, `cat`, `comp`, or `op` from the message.
  - It rejects missing required fields other than `cat`, invalid `lvl`, `cat`, or `svc`, invalid or oversized `data`, and unknown fields.
  - A rejection returns a `400` listing every error with `code`, `field` (dotted path such as `data.error.code`), and `reason`.
  - JSON serialization also escapes the control characters other than line breaks.
- Rotation: rotate at 25 MB, keep the current file plus 10 uncompressed archives, and enforce retention at startup before writing.
- Defines what happens to a single oversized entry and to concurrent appends.
- Startup no longer empties `last.log`: the previous run's entries stay, and rotation and retention bound its size.
- At startup the server writes a `lifecycle` entry with the version, process id, and listen URL, so the kept log shows where each run starts.
- Human-readable rendering in the admin section is a view over the fields, not what is stored.
- Server `ILogger` output:
  - The writer takes entries from loggers outside the app, such as ASP.NET Core's, only at `warn` and above, whatever levels the console uses.
  - An `ILogger` entry that gives no `comp` or `op` gets them from its logger category and event, since the schema requires both. Decides the mapping.
  - Entries from loggers outside the app get `comp` `framework`.
  - An exception logged through `ILogger` is normalized into `data.error` like `ex` on ingestion, without its raw message or stack trace.
  - The `ILogger` calls that pass a path, listed in Traps, leave it out.
  - An event that a call site logs through `ILogger` and also appends by hand is written once, at one level:
    - A catalog backup failure and a checkpoint failure are written as `error`.
    - A tray that fails to start writes one `error` entry, not an error and then a warning.
- Console:
  - The console keeps its own logging provider, separate from the writer, and chooses what it shows by logger category.
  - It shows `Microsoft.Hosting.Lifetime`'s entries, the server's lifecycle entries, warnings, and errors, with their formatted text.
  - The server's lifecycle entries are the startup entry, the shutdown entry, a restart request, and an update being applied. They log under a logger category of their own, apart from the other entries of the classes that write them.
  - Other `info` entries, such as per-request ones, update checks, and tray actions, go to `last.log` only.
- Failures:
  - The writer reports its own write failures on standard error, never through `ILogger`.
  - A startup failure after the writer exists, such as a listen port already in use, is written to `last.log` before the process exits.
- The replacement server that a self-restart starts doesn't write into the console of the run it replaced; its entries go to `last.log`.
- Contract change for `POST /api/logs/client` in OpenAPI and the generated WebUI types.

#### Traps

- `last.log` is free text: server code and `POST /api/logs/client` append bracketed lines through `ServerLogService`.
- `ServerLogService` writes under one process-wide lock.
- `ServerLogService` turns line breaks into a literal `\n` but writes other control characters as sent.
- The server's `ILogger` output goes only to the console.
- Client logs arrive through `POST /api/logs/client` as source, level, and message.
- Startup empties `last.log` (`ResetServerLastLog` in `ServerApp/Program.cs`).
- Because startup empties it, a restart erases what led up to it: a restart at 03:55 removed the previous run's lines, including a Wi-Fi drop and share reconnects at 03:36–03:42 (measured).
- The server writes no startup line to `last.log`; "Opened library catalog" goes to the console only, so a restart shows only as the log starting over.
- ServerApp's `appsettings.json` sets `Microsoft.AspNetCore` to `Warning` and `Microsoft.Hosting.Lifetime` to `Information` under `Logging:LogLevel`, which applies to every provider unless a provider sets its own levels.
- Without that setting, ASP.NET Core logs 3 to 6 entries per request at Information, and they were 143 of a run's 150 console entries (measured).
- `Microsoft.Hosting.Lifetime`'s startup entries include the content root path (measured).
- These `ILogger` calls pass a path:
  - "Opened library catalog" in `ServerHostComposition.cs`.
  - The source read and source enable failures in `ServerStateService.cs`.
  - The item count and eligible query failures in `LibraryPlaybackService.cs`.
  - The backup failure in `LibraryCatalogBackup.cs`.
  - The tray icon warnings in `AvaloniaTrayHostUi.cs`.
  - The autostart enable entry, with its `Exec` path, in `LinuxXdgStartupLaunchService.cs`.
  - The Linux menu registration skip, at Debug, with the install directory, in `LinuxAppImageRegistrationService.cs`.
- An `ILogger` call that passes an exception prints its full stack trace on the console.
- Exception messages can carry paths.
- The startup and shutdown entries log through `app.Logger` in `ServerApp/Program.cs`.
- `RestartCoordinator` in `ServerApp/Program.cs` logs a restart request under the same logger category as a stop request and the replacement server's launch.
- `UpdateService` logs an update being applied under the same logger category as its update checks.
- These events are logged through `ILogger` and also appended by hand, so routing `ILogger` to the writer would write each twice: running without a library, a catalog migration, a catalog backup failure, a checkpoint failure, the tray ending, a tray UI error, and the tray's failure and rejection warnings.
- A catalog backup failure (`LibraryCatalogBackup.cs`) and a checkpoint failure (`LibraryOperationsService.cs`) log `Warning` through `ILogger` and `error` by hand.
- A tray that fails to start logs an error, then a warning that the tray ended, then appends that warning by hand (`AvaloniaTrayHostUi.cs`).
- `ServerLogService` reports its own append failures through `ILogger`, which would loop back into the writer once the writer takes `ILogger` output.
- The shared `ServerLogService` registered in `ServerHostComposition.cs` has no logger, so a failed append of a pairing, proxy, tray, or playback line is dropped without a report.
- The `net10.0-windows` build is a `WinExe` with no console, so output that reaches only the console is lost there (inferred).
- A comment in `ServerApp/Program.cs` notes that a replacement server after a self-restart can exit with "address already in use" on Linux.
- `TryLaunchReplacementProcess` in `ServerApp/Program.cs` starts the replacement server without redirecting its output, so it writes into the terminal of the run it replaced and keeps writing there after a `dotnet run` session's prompt returns (inferred).

#### Acceptance

- Every `last.log` line is a JSON object with the required fields and canonical field order, in schema and order tests.
- `lvl`, `cat`, and `svc` values are always from their fixed lists, and an entry written without a `cat` gets `general`, in schema tests and category default tests.
- Entries below the configured minimum level are not written, and with no setting the minimum is `info`, in minimum level tests.
- Server `ILogger` logs and ingested client logs go through the same writer, and every persisted entry has a writer-assigned `ingestReqId`, in correlation tests.
- Client entries keep `clientTs`, `clientOpId`, and trace fields as sent, and `ts` is the write time, in correlation and time-field tests.
- Invalid client payloads get a `400` with every error listed and are not written, in rejection tests for each invalid case.
- A client message with line breaks or control characters cannot produce a second log line, in server tests.
- Rotation, retention, oversized entries, and concurrent appends behave as documented, in rotation and retention edge-case tests.
- Startup keeps the entries an earlier run wrote, in a startup test with an existing `last.log`.
- Startup writes an entry with the version, process id, and listen URL, shown by a captured entry.
- An API request writes no framework entry to `last.log`, and neither does a normal startup, in writer tests that run each through the host.
- An `ILogger` entry without `comp` or `op` is written with both, and an entry from a logger outside the app with `comp` `framework`, in mapping tests.
- An exception logged through `ILogger` is written as `data.error` without its raw message or stack trace, in exception normalization tests.
- The listed `ILogger` calls write no path, in a startup test that captures the catalog-open entry and a guard test over the other listed messages.
- Each event logged both ways is written once at its one level, in tests for a catalog backup failure, a checkpoint failure, and a tray that fails to start.
- With default settings, the console shows `Microsoft.Hosting.Lifetime`'s entries, the startup entry with the listen URL, the shutdown entry, a restart request, an update being applied, warnings, and errors, and no `info` entry from a request, an update check, or a tray action, in console provider tests.
- A failed write is reported on standard error and logs nothing through `ILogger`, in a writer test with an unwritable log file.
- A server whose listen port is taken writes an error entry to `last.log` before it exits, in a startup test with the port in use.
- A self-restart starts its replacement without the console of the run it replaced, in a test of the replacement's process start settings.
- `docs/api.md` and `docs/architecture.md` describe the schema, the ingestion contract, and the rotation rules, checked by reading them.
- `docs/dev-setup.md` describes what the console shows and what goes only to `last.log`, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify:contracts` pass.

#### Release checks

- Manual: On the Windows VM, an installed server started while another process holds its port leaves an error entry in `last.log`.

#### Not included

- Moving the admin section's log view off its current route, which is Admin Log Viewer.
- Hiding ASP.NET Core's per-request lines on the console; ServerApp's `appsettings.json` already sets them to `Warning`.

### P27b - Structured Log API and Privacy Rules

- **Status**: ⏳ Planned
- **Goal**: The WebUI logs through a typed structured API that requires explicit metadata and makes privacy-safe entries the only kind it can emit, and both the WebUI and server code can give each entry a category.
- **Depends on**: Structured Log Schema, Writer, and Ingestion.

#### Scope

- Level-typed methods for the WebUI, each with explicit `comp` and `op`:
  - `LogTrace(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
  - `LogDebug(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
  - `LogInfo(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
  - `LogWarn(comp, op, evt? = null, msg, data? = null, cat? = null, context? = null)`
  - `LogError(comp, op, evt? = null, msg, data? = null, ex? = null, cat? = null, context? = null)`
  - `LogFatal(comp, op, evt? = null, msg, data? = null, ex? = null, cat? = null, context? = null)`
- `lvl` comes from the method; there is no parsing of `comp` or `op` from the message.
- Each WebUI method takes an optional `cat` from the schema's category list.
- Server code can set an entry's `cat` when logging through `ILogger`. Decides how, for example a logging scope or a structured property.
- An entry logged without a `cat` is written as `general`, from the WebUI and the server alike.
- `LogContext = { clientOpId?, traceId?, spanId?, clientId?, sessionId?, ver?, build?, clientTs? }`.
- `ingestReqId`, `srcIp`, and `userAgent` are never client-supplied.
- Baseline `comp` names:
  - Server: `api`, `auth`, `sse`, `playback`, `refresh.pipeline`, `storage`, and `framework` for entries from loggers outside the app.
  - WebUI: `web.app`, `web.player`, `web.library`, `web.api`, `web.sse`.
- Privacy by construction, enforced by the API rather than by rewriting entries afterwards:
  - `msg` and `data` never carry file names or paths, tag or category names, preset or source names, search text, tokens, cookies, PINs or other secrets, or raw media identifiers that reveal content.
  - The one exception is the one-time first-run setup code from Admin First-Run Setup, which the server logs only while no account exists.
  - Prefer fixed templates with counts, booleans, and durations, for example `"Saved preferences."` with `data: { wroteBackup: true }`, or `"API request failed."` with `data: { endpoint: "SetFavorite" }` and no URL.
  - `ex` on `LogError` and `LogFatal` becomes `data.error` with `type`, `code`, `messageSafe`, and an optional fingerprint; raw stack traces, local paths, and payload fragments are not emitted.
  - `data` is checked for size and shape before serialization.
  - Entries from loggers outside the app, whose text this API doesn't build, are written with their message template as `msg`, its placeholders unfilled, and their exception as `data.error`.
- Until WebUI Instrumentation removes it, the WebUI status relay keeps working by emitting through the new API as `comp` `legacy`, `op` `unmigrated`, level `info`. This is the only inferred path.

#### Traps

- ASP.NET Core's request entries carry the full URL, including the media token in `/api/media/{token}` (measured).
- The static file middleware's entries carry the served file's path on disk (measured).
- The pairing middleware accepts the token as a `?token=` query, so a request URL in an entry can carry it (inferred).

#### Acceptance

- The WebUI has the level-typed API with explicit `comp` and `op`, optional `evt` and `cat`, and typed context, in API tests per level and context mapping tests.
- A WebUI entry and a server `ILogger` entry logged with a category are written with that `cat`, and ones logged without one are written as `general`, in category tests for WebUI and server `ILogger` entries.
- `ex` is always written as privacy-safe `data.error`, never as a top-level field, in `ex` normalization tests.
- Oversized or arbitrary `data` is rejected before it is written, in API tests.
- Paths, names, and secrets in the shapes the privacy rules list are refused, in negative tests.
- An entry from a logger outside the app is written with its unfilled message template and none of the values it logged, in a test that logs a framework warning with a path and a URL.
- The legacy path is the only one that emits `comp` `legacy`, in API tests, and the docs describe it as temporary, checked by reading them.
- The docs describe the `comp` baseline and the privacy rules, checked by reading them.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Not included

- Migrating WebUI call sites and removing the `legacy` path, which is WebUI Instrumentation.

### P27d - Server Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The server logs its meaningful decisions and failures as structured entries, not only transport events.
- **Depends on**: Structured Log Schema, Writer, and Ingestion.

#### Scope

- Structured logs for:
  - Shutdown.
  - API handlers.
  - Event stream connect and disconnect.
  - Refresh pipeline stages and outcomes: each run's start and end, each stage's duration, and each source's walk time.
  - Catalog open, import, backup, and replace.
  - Settings changes and their errors.
  - Each request the pairing middleware rejects, with its method and route.
- A warning when a source's walk or a single file check takes longer than a threshold. Decides the threshold.
- Kestrel's request headers and request body timeouts, as warnings.
- Sources are identified by id, since the privacy rules allow no paths or source names, including in the refresh warning for a folder that lists no media files.
- Favor state changes, decisions, degradations, and failures over repetitive noise.
- Move the remaining hand-built server log lines to `ILogger` with structured fields.

#### Traps

- Refresh writes only its warning for a source whose folder lists no media files to `last.log`; its progress and failures reach the log only as `status=` lines relayed by connected WebUI clients, once per client, and not at all when none is connected (measured).
- On a 49,100-item library, a refresh run takes 3.5–6.5 min, the largest source's walk 8.5–15 s, and the file checks 3.4–4.6 min (measured).
- Kestrel answers `408` only when a request's headers don't finish within 30 s (`RequestHeadersTimeout`) or its body arrives slower than 240 bytes a second after a 5 s grace (`MinRequestBodyDataRate`), in ASP.NET Core 10.0.12's source.
- A body timeout makes a minimal API answer `408` without running its handler, so the request writes no line of its own, in ASP.NET Core 10.0.12's source.
- Kestrel logs both timeouts at Debug, below the writer's default minimum of `info`, in ASP.NET Core 10.0.12's source.
- ServerApp's `appsettings.json` sets `Microsoft.AspNetCore`, which includes Kestrel's categories, to `Warning`, and the writer takes entries from loggers outside the app only at `warn` and above, so Kestrel's Debug timeout entries reach neither the console nor `last.log`.
- Raising or turning off those timeouts would turn a `408` into a request that hangs (inferred).
- The refresh warning for a source whose folder lists no media files names the folder in `last.log`.
- Source import writes the source's root path to `last.log`.
- A written catalog backup writes the backup's path to `last.log`.
- A request the pairing middleware rejects writes no line today, and the WebUI's relay of its 401 line is refused too, since `/api/logs/client` needs pairing as every route but `/api/pair` does (`ServerPairingAuthMiddleware.cs`).

#### Acceptance

- Each listed area emits structured entries with `comp`, `op`, and fitting levels, shown by a captured entry per listed area.
- Request-scoped entries carry trace fields when trace context is active, and every entry carries `ingestReqId`; `clientOpId` appears only when a client sent one, shown by correlation checks.
- Server entries contain no file names, paths, tag names, or secrets, shown by a scan of a captured `last.log` for paths, names, and secrets.
- A refresh run's entries give each stage's duration and each source's walk time, and a source walk or a single file check over the threshold logs a warning, in refresh tests with a slow source and a slow file check.
- A request whose headers or body stop arriving logs a warning, shown by a captured entry for each.
- Per-request entries, such as library queries and random picks, are written to `last.log` and not shown on the console, in console provider tests.

#### Not included

- Logging playback decisions, which is Server Playback Decision Engine.
- Logging login and session outcomes, which is PIN Login API and Sessions.

### P27e - WebUI Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The WebUI logs its key flows as structured entries instead of relaying notification text.
- **Depends on**: Structured Log API and Privacy Rules.

#### Scope

- Structured logs for app startup and compatibility checks, event stream connect and retry, API request failures, and major user actions and error states.
- Four flows with stable operation names:
  - `BootstrapSession`: startup and compatibility gating.
  - `SseLifecycle`.
  - `RandomPickAndPlay`.
  - `MutateItemState`: favorite, blacklist, and tag-edit apply.
- Video error entries carry the media element's error code, and video and photo error entries carry the server's answer when the WebUI asked.
- Remove the notification relay and the `legacy` path in the WebUI.
- A guard test fails if string-only logging or message parsing comes back.

#### Traps

- The WebUI logs mainly by relaying each status-line message as free text.
- WebUI Notifications keeps that relay for its popups, lasting states, and notices.
- `videoFailed` in `src/playback/player.ts` relays `playback=video-onerror` with no error code or status, so a missing file, a format the browser can't play, and a server that can't read the file log the same line.

#### Acceptance

- The four flows emit structured entries, with trace linkage on request-scoped steps, shown by one captured entry per flow.
- `MutateItemState` covers favorite, blacklist, and tag-edit apply, shown by one captured entry per `MutateItemState` case.
- No WebUI string-only logging or `legacy` entry remains, in the guard test.
- WebUI entries contain no file names, paths, tag names, or search text, shown by the captured entries.
- A video error's entry carries its error code, and the server's answer when there was one, shown by a captured entry for a missing file and for one the server can't read.
- `npm run verify` passes.

#### Not included

- Logging the login flow, which is WebUI Login Gate.

### P27f - Admin Log Viewer

- **Status**: ⏳ Planned
- **Goal**: The admin section can filter and page structured logs by field, text, and time without shell access.
- **Depends on**: Structured Log Schema, Writer, and Ingestion, and Log Viewer Redesign.
- **Design**: `docs/mockups/reelroulette/`, whose admin page has the Log Viewer as Log Viewer Redesign builds it on today's line format: collapsed filters for level, source, message, and time, active-filter chips, a live indicator with Resume, and rows that expand to the full line. The category, component, and other field filters, and rows that expand to raw JSON, aren't mocked yet.

#### Scope

- The view keeps the name **Log Viewer**, which Log Viewer Redesign and Recovery Page and Operator Retirement already give it in the admin section and the recovery page; this milestone does not undo it.
- What is left is the route: rename `GET /control/logs/server` to `GET /control/log-viewer`, with the API, tests, and docs that name it, in one step.
- There is no alias period: the admin section and the recovery page are the route's only callers and ship in the same binary.
- The route stays read-only; logs are still written directly to `last.log`.
- Server-side filters: `svc`, `lvl`, `cat`, `clientId`, `sessionId`, `traceId`, `ingestReqId`, `clientOpId`, `comp`, `op`, `evt`, message text, and a time window.
- `lvl`, `cat`, and `svc` each take several values.
- Client-side filtering only refines results already fetched.
- The Log Viewer moves to structured entries:
  - The level checkboxes take one `lvl` value each, so several levels can be shown at once.
  - Next to them, a multi-select filter by category, one option per `cat` value, and a filter by component (`comp`).
  - The source multi-select takes one option per `svc` value (`server` and `webui`).
- Newest first by `ts`, tie-broken by `ingestReqId` and then a stable row sequence, with a versioned cursor and defined `from` and `to` bounds, so paging never repeats or skips rows.
- The route reads from the end of the file and across rotated archives instead of walking every line on each request.
- The admin section view keeps the design Log Viewer Redesign gives it: controls collapsed by default with active-filter chips, and auto-refresh that pauses while scrolled away from the newest rows, with a resume control.
- Its rows expand to raw JSON.

#### Traps

- Log Viewer Redesign already gives the Log Viewer this view's design on today's line format, with level checkboxes, a source multi-select, a text filter, and a time window.
- `ServerLogService.Read` walks the entire log on every request.

#### Acceptance

- The admin section's Log Viewer filters by every listed field, text, and time window, in filter tests.
- The level filter is one checkbox per `lvl` value, and checking several levels shows entries of exactly those levels, in filter tests with several levels.
- The category and source filters each select several values at once and show entries from exactly those categories or sources, and the component filter shows entries from that component, in filter tests with several categories and sources.
- `/control/logs/server` is gone and `/control/log-viewer` is in OpenAPI and `docs/api.md`, checked by reading them.
- The same filters and cursor return the same rows, and paging never repeats or skips a row, in replay tests for identical filters and paging tests across page and archive boundaries.
- A request reads only as much of the log as its page needs, in a read-cost test on a large log.
- Controls start collapsed and show active filters; rows expand to raw JSON; auto-refresh pauses and resumes as described, in admin section UI tests for the view.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

### P27g - Client Log Relay Reliability

- **Status**: ⏳ Planned
- **Goal**: Client log relay never blocks or interrupts user actions, and its retries are bounded and predictable.

#### Scope

- The WebUI relays asynchronously with bounded retries and a bounded queue.
- A failing log endpoint drops entries after the bound instead of slowing the WebUI.

#### Acceptance

- A failing or slow `POST /api/logs/client` does not delay or interrupt any user action in the WebUI, in WebUI relay tests with a failing and a slow endpoint.
- Retry and drop behavior matches its documented bounds, in WebUI relay tests.
- `last.log` holds server and WebUI entries through the same writer, in server tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Release checks

- Manual: One end-to-end flow shows a combined trace across the server and the WebUI.
- Manual: A simulated log endpoint failure during normal use does not delay or interrupt any user action in the WebUI.

### P28b - Source Access Policy

- **Status**: ⏳ Planned
- **Goal**: Every path that reads or serves library items asks one server-side source access policy, which allows everything until per-user permissions exist.
- **Depends on**: Library Profiles, whose source condition in the library query the policy joins.

#### Scope

- One policy takes the request's session context and returns the sources it may see.
- It is applied on every item path: library list query, random selection, item play, `GET /api/media/{token}`, `GET /api/thumbnail/{itemId}`, `POST /api/library/item`, the tag-editor model, auto-tag and duplicate scans, library stats, and `GET /api/sources`.
- The default policy allows every enabled source, so behavior does not change.
- A request's sources are those the policy allows and its profile shows, so a profile can only narrow what the policy allows.

#### Traps

- Source enabled state is applied by separate SQL conditions in list query, random selection, and item play.
- Library Profiles adds the active profile's sources as one condition in `BuildWhere`, outside the filter, which the list query, its counts, and random selection share, and Auto Tag's scan has a copy of it.

#### Acceptance

- Every listed path goes through the policy, and a test policy that denies a source hides that source's items on every one of them, in a denying-policy test per listed path.
- Current behavior is unchanged with the default policy, in the existing tests of each listed path.
- Docs separate implemented source state from future per-user access, checked by reading them.
- `dotnet test ReelRoulette.sln` passes.

#### Not included

- Accounts, which is Account Store.
- Per-user grants and their admin UI, which is Per-User Source Permissions.

### P28c - Account Store

- **Status**: ⏳ Planned
- **Goal**: Accounts live in their own server store, separate from the library catalog.

#### Scope

- Accounts are not stored in `library.db`, since catalog export, import, and backups copy or replace that whole file, so accounts there would ship PIN hashes inside every export and be replaced by every import.
- Accounts are stored in their own SQLite database in the server data folder (for example `accounts.db`), resolved through the server data folder helper.
- What catalog transfer does with accounts:
  - Catalog export and the catalog checkpoint do not contain accounts.
  - Catalog import replaces the catalog and leaves accounts as they are.
  - Catalog backups do not contain accounts.
  - The account store keeps its own backup copies on the catalog backup schedule, in separate files that a catalog restore does not touch.
- The catalog refers to accounts by id, since Per-Account Library Data keeps each account's library data in `library.db`, while account records and PIN hashes stay in this store.
- Account records: stable id, name, color, level (admin or user), and a bcrypt or Argon2 PIN hash.
- No custom, fast, or reversible PIN storage.
- Multiple admins are allowed.
- No default account is seeded. A store with no accounts is the first-run setup state.
- Per-account, per-device failed attempts, with a one-hour lockout after 10 failures.
- There is no guest account.
- The schema keeps account identity stable across name and PIN changes, since source permissions will reference account ids here and source ids in the catalog, and the catalog's per-account data will reference account ids.

#### Acceptance

- Accounts persist in their own store with stable id, name, color, level, and a bcrypt or Argon2 hash, and no plaintext PIN, in store tests for creation, hashing, and levels.
- A new store has no accounts, and no default account or PIN exists, in a store test of an empty new store.
- Catalog export contains no account data, catalog import leaves accounts unchanged, and catalog backups contain no account data, in tests that a catalog export, import, and backup neither contain nor change accounts.
- The account store has its own backups, and a catalog restore does not touch them, in store tests for backups.
- Failed attempts are tracked per account and device, with a deterministic lockout end, in store tests for lockout.
- The docs describe account storage, backups, and the empty first-run state without describing login flows as implemented, checked by reading them.

#### Not included

- Handling the first-run setup state, which is Admin First-Run Setup.
- Trusting localhost connections as admin without an account session, which is PIN Login API and Sessions.

### P28d - PIN Login API and Sessions

- **Status**: ⏳ Planned
- **Goal**: LAN and remote clients log in with an account PIN and get a session; localhost stays trusted.
- **Depends on**: Account Store, and Reverse Proxy and HTTPS Access.

#### Scope

- A login route: the client sends account id, device id, and PIN, and gets a per-client session token on success.
- Sessions are not persisted; clients log in again after a restart.
- The server enforces lockout and returns lockout state and remaining time.
- Defines logout, session invalidation, and how account identity reaches HTTP and event stream handlers.
- Localhost trust: a direct localhost connection is trusted as admin and needs no PIN.
- A request through a reverse proxy is not localhost.
- There is no general auth-off mode once accounts exist: the API `AuthMode` `Off` setting and running without a shared token no longer open the API to LAN clients.
- Remove pairing and the shared pairing token, with no migration; old pairing cookies and tokens fail.
- Remove query-string tokens.
- Compare session tokens in constant time.
- Login, lockout, logout, and session outcomes are logged as structured entries, without the PIN or session token.

#### Traps

- `AllowLegacyTokenAuth` defaults to `true`, accepting tokens via query string.
- Secrets are compared in non-constant time.

#### Acceptance

- A correct PIN returns a session tied to the account, client, and device, in server tests for login.
- Failed PINs count per account and device, lock out for one hour after 10 failures, and return lockout details, in server tests for wrong PIN, lockout, and its expiry.
- Sessions do not survive a server restart, in server tests for restart.
- Direct localhost requests work without a session; LAN, remote, and proxied requests need one, in server tests for localhost and proxied requests.
- No setting turns authentication off for LAN or remote clients, in server tests.
- Pairing, the shared pairing token, and query-string tokens are no longer accepted, in server tests that reject old pairing tokens.
- Logout ends the session, in server tests for logout.
- Login, lockout, logout, and session outcomes each write a structured entry with no PIN or session token, shown by a captured entry for each.
- OpenAPI and `docs/api.md` describe the login and session payloads and the lockout error, checked by reading them.

### P28e - Auth Cutover for API and Admin

- **Status**: ⏳ Planned
- **Goal**: Every API route, the event stream, the admin section, and the recovery page require an account session from LAN and remote clients, and the separate control token is gone.
- **Depends on**: PIN Login API and Sessions.

#### Scope

- Require a session on every API and control route and on the event stream for non-localhost requests.
- The WebUI's files stay open without a session, as Reverse Proxy and HTTPS Access left them, so WebUI Login Gate can load before login.
- The admin section and the recovery page use admin account sessions and no longer accept the control token added in v0.14.0.
- Remove the control token, its setting, and its prompt, including the `adminAuthMode` field on `/control/settings` and in `core-settings.json`.
- No session or token is accepted as a query parameter.
- `GET` and `POST /api/web-runtime/settings` become admin-only.
- Admin-only operations (control plane, source and item management, catalog transfer, account administration, testing routes) reject user-level accounts.
- Testing routes use the same check as the rest of the control plane.
- Settings reads no longer return secrets.
- Remove pairing and control-token flows from clients, docs, and contracts. The pairing and control-token problems listed in Traps go with them.
- The `reelroulette-dev-token` default leaves `appsettings.json` and the `-PairingToken` parameter of `run-server.ps1`.
- Session secrets that replace the pairing token must not be passed to a restarted server as an environment variable.
- Remove `/runtime-config.json`, which without `pairToken` returns only the page's own address: the WebUI calls the API and the event stream on its own origin. The server's endpoint and `WebRuntimeConfig`, the WebUI's `src/config/runtimeConfig.ts`, the startup error screen that reports a config that didn't load, and their tests, docs, mockup screen, the WebUI `README.md`'s example, and `verify-web-deploy.ps1`'s check of the route go with it.
- The login flow that replaces the WebUI's pairing request returns a typed result on every failure.

#### Traps

- v0.14.0 kept the `adminAuthMode` field read-only (always `TokenRequired`, posted values ignored) so the contract changes only once.
- `/api` routes still accept the API pairing token as a `token` query, and `GET /api/pair?token=` pairs with it, which puts the token in URLs and in the default request log.
- v0.14.0 stopped accepting the control token in a query and made `/control/pair` POST-only, but left `/api` for this cutover.
- `/api/web-runtime/settings` is on the API plane, so any LAN caller with the API pairing token, which `/runtime-config.json` gives to every device pairing already accepts, can turn WebUI auth off, change the port or remote connections, and read the shared token.
- `/api/web-runtime/settings` stayed on the API plane because the desktop called it from other machines, and Desktop Client Removal removed the desktop.
- `OperatorTestingService` mutations are protected only by middleware policy.
- `/runtime-config.json` builds `apiBaseUrl` and `sseUrl` from the scheme and host the caller used, which are always the page's own origin, directly or through a proxy, and adds `pairToken` only for a caller that pairing already accepts.
- Auth and secret fields in settings DTOs encourage credential leakage; `GET /control/settings` returns the admin token.
- Pairing and control-token problems that go with those flows:
  - Two pairing secrets drift apart: `/api/pair` checks `ServerRuntimeOptions.PairingToken`, while the Operator page, and later the admin section, saves `WebRuntimeSettings.SharedToken`, and `src/core/ReelRoulette.ServerApp/Program.cs` starts with `SharedToken ?? PairingToken` and passes that to a restarted server. Editing the shared token has no effect until a restart, then silently changes the pairing token.
  - `WebRuntimeSettings.AuthMode` is saved by `CoreSettingsService.UpdateWebRuntimeSettings`, but `ServerPairingAuthMiddleware` reads only `RequireAuth`, which the server sets from `AuthMode` only at startup, so setting it to `Off` changes nothing until a restart.
  - `RestartCoordinator.TryLaunchReplacementProcess` in `Program.cs` passes the token to the child as the `CoreServer__PairingToken` environment variable, which other local users can read from `/proc/<pid>/environ` on Linux.
  - The same `reelroulette-dev-token` default is in `src/core/ReelRoulette.ServerApp/appsettings.json` and the `-PairingToken` parameter of `tools/scripts/run-server.ps1`.
  - The WebUI's pairing request lets a network error reject instead of reporting it in an in-app notice, as the other failed pairing outcomes do.

#### Acceptance

- LAN and remote requests without a valid session get a deterministic auth error on every API and control route and on the event stream, in authorization tests across library, playback, source, event stream, admin, and testing routes for localhost, admin, user, and no session.
- The admin section and the recovery page use account sessions, and no control token is accepted anywhere, in the authorization tests for admin routes.
- User-level accounts are refused on admin-only operations, in the authorization tests for user sessions.
- LAN and remote requests to web runtime settings without an admin session are refused, in the authorization tests.
- No settings response contains a secret, in server tests.
- Active docs no longer describe pairing or control tokens, checked by reading them.
- The WebUI loads and reaches the API and the event stream on its own origin, and the server no longer serves `/runtime-config.json`, in WebUI tests and a server test for the route.

#### Not included

- External programmatic API access.

### P28f - Admin First-Run Setup

- **Status**: ⏳ Planned
- **Goal**: The first admin account is created in the admin section, from localhost directly or from another machine with a one-time setup code, before any LAN or remote client can log in.
- **Depends on**: Auth Cutover for API and Admin.

#### Scope

- There is no default account and no default PIN.
- First-run setup state is an account store with no accounts.
- In that state, the server generates a random one-time setup code from a cryptographic random source on start, writes it to the server log, and shows it in the admin section opened on localhost.
- Each start without accounts makes a new code, and the previous one stops working.
- The setup code is the only secret the server writes to its log, and only while no account exists. The structured log privacy rules carry it as their one documented exception.
- From localhost, the admin section opens straight into setup and needs no code.
- From another machine, the admin section shows only a setup code prompt, and only the setup route accepts LAN or remote requests until setup finishes.
- Setup creates the first admin account with a name and a PIN.
- The code stops working as soon as the first admin account exists, and the server no longer generates or logs one.
- Failed code attempts count per device, with the same one-hour lockout after 10 failures as PIN login.
- The code is compared in constant time, and it never appears in a URL.
- WebUI login from LAN or remote devices is blocked until setup is done, with a message pointing to setup in the admin section. Localhost keeps working.

#### Acceptance

- Setup state is detected from the account store and ends when the first admin account exists, in server tests.
- On start with no accounts, a new setup code is written to the server log and shown in the admin section on localhost, and the previous code is refused, in server tests of code generation, logging, and replacement on restart, and the admin section UI test for setup from localhost.
- Localhost setup needs no code. Setup from another machine needs the current code, and wrong codes lock that device out after 10 failures, in admin section UI tests for setup from localhost and from another machine with the code, and server tests of constant-time comparison and lockout.
- Once the first admin exists, the code is refused and no new code is generated or logged, in server tests of refusal after the first admin exists.
- LAN and remote WebUI logins report setup-incomplete and are refused until setup finishes, in server tests of setup-only access before setup.

#### Release checks

- Manual: On a fresh install, LAN login is blocked until the first admin is created: from localhost without a code, and from another machine only with the setup code from the server log; the code is refused afterwards.

### P28g - Account Administration

- **Status**: ⏳ Planned
- **Goal**: Admins create and maintain accounts in the admin section.
- **Depends on**: Admin First-Run Setup and Per-Account Library Data, whose first account it protects.

#### Scope

- An admin-only Access Control section in the admin section:
  - lists accounts with name and level,
  - adds accounts with name, level, and initial PIN,
  - edits name and level,
  - resets a PIN,
  - removes accounts.
- The last admin cannot be removed or demoted.
- The first account, which owns the library's data from before accounts and which a direct localhost connection uses, cannot be removed or demoted.
- A new account gets a random color.
- Admins change their own PIN through Self-Service PIN Change, and their own name and color through Account and Profile Picker, as users do.

#### Acceptance

- Admins can list, add, edit, reset PINs for, and remove accounts, in server tests of account changes and PIN resets, and admin section UI tests for the section.
- User-level accounts cannot reach account administration, in server tests.
- The last admin cannot be deleted or demoted, in server tests of last-admin protection, and admin section UI tests for its errors.
- The first account cannot be deleted or demoted, in server tests of first-account protection.
- Changes persist across restart and apply to later logins, in server tests of account changes and level changes.

### P28h - Self-Service PIN Change

- **Status**: ⏳ Planned
- **Goal**: Logged-in users change their own PIN from the WebUI.
- **Depends on**: PIN Login API and Sessions, whose sessions and lockout the PIN change uses.

#### Scope

- A PIN change route that needs the old PIN, the new PIN, and a confirmation.
- The flow in the WebUI Settings tab, for admins and users.
- The route reuses server hashing, validation, and lockout.
- The route never returns a PIN.
- Defines what happens to the current session after a change.

#### Acceptance

- Admins and users can change their own PIN with the old PIN, a new PIN, and a matching confirmation, in server tests of each success path.
- Wrong old PIN, mismatched confirmation, invalid new PIN, and lockout return clear errors, in server tests of each failure path and client tests for the validation messages.
- The next login needs the new PIN, in server tests.
- The flow is available in the WebUI without admin rights, in client tests.

#### Not included

- Changing the account's own name and color, which is Account and Profile Picker.

### P28j - WebUI Login Gate

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for a PIN before any library or player surface when it is not opened from the server machine.
- **Depends on**: PIN Login API and Sessions, whose login route, sessions, and lockout it uses, and Admin First-Run Setup, whose setup-incomplete answer it shows.

#### Scope

- Opened from localhost, the WebUI is trusted and shows no login.
- Otherwise, an account tile grid shows before the shell, library, player, or random controls.
- Each tile shows the account's colored circle with its first letter, in white or dark, whichever stays readable, as the profile picker shows a profile, with the account's name below.
- Selecting a tile shows a PIN prompt.
- Server-unavailable messages offer a retry.
- The gate also has a setup-incomplete message.
- No session is persisted: the user logs in on every open or reload.
- API and event stream calls carry the session after login.
- The login flow logs through the structured log API with the stable operation name `LoginSession`: account tile, PIN, and session start, never the PIN itself.

#### Acceptance

- From another device, no library, random, or player surface is reachable before login; from localhost, no login is shown, in WebUI tests for gating.
- Tiles show each account's colored circle, first letter, and name at desktop and mobile widths, in WebUI tests for login.
- Failed PINs and lockouts show clear errors, including the remaining lockout time, in WebUI tests for wrong PIN and lockout.
- Before first-run setup is done, the gate shows the setup-incomplete message, in WebUI tests for setup incomplete.
- Reloading or reopening needs a new login, in WebUI tests for reload.
- API and event stream traffic uses the logged-in session, in WebUI tests for session use.
- The login flow writes structured `LoginSession` entries with no PIN, shown by a captured entry for a login.
- `npm run verify` passes.

#### Release checks

- Manual: The WebUI from another device needs a PIN on every open and reload, on desktop and phone browsers; from the server machine it does not.

#### Not included

- Offline PWA login.
- Remember-me sessions.
- Remembered accounts.
- Biometrics.
- Switching accounts and signing out from the header, which is Account and Profile Picker.

### P28k - Per-User Source Permissions

- **Status**: ⏳ Planned
- **Goal**: Admins choose which sources each user sees, and the source access policy enforces it.
- **Depends on**: Source Access Policy, Account Administration, and Admin Source Management.

#### Scope

- Per-source, per-user access in the admin section's Manage Sources.
- Grants are stored in the account store against account ids and catalog source ids.
- A grant for a source id that is not in the catalog (for example after a catalog import) is ignored and shown as stale in the admin section.
- Denied sources are enforced through the source access policy on every path it covers, including `GET /api/media/{token}`, `GET /api/thumbnail/{itemId}`, and `POST /api/play/{itemId}`.
- The check extends to playback sessions, so a session for an item from a denied source is refused.
- WebUI Notifications' kept-source notice leaves out sources the session's source list doesn't include.
- Admins and localhost connections see every source.
- A profile's sources are cut to the sources its account may see: a source the account loses stays in the profile's chosen list, and the policy hides it.

#### Acceptance

- Admins can grant or deny each user each source in the admin section, in admin section UI tests for permission editing.
- Denied sources and their items are invisible to that user on every policy path, in policy tests for every path with a denied source.
- A denied item cannot be streamed, played, opened in a playback session, or have its thumbnail read, even by a client that knows its id, in direct-id bypass tests.
- The kept-source notice leaves out a kept source missing from the session's source list, in a WebUI test of the notice.
- Permission changes reach active sessions through events or requery, in server tests.
- Grants survive account and source renames, and a catalog import leaves grants for missing sources inert, in server tests, including a catalog-import test for stale grants.
- A profile's library, counts, and random picks leave out a source its account may not see, even when the profile lists it, in policy tests with a profile.

#### Not included

- Groups.
- Invitations.
- Audit reporting.

### P28l - Permission-Aware WebUI

- **Status**: ⏳ Planned
- **Goal**: The WebUI shows only what the server allows the logged-in user, with clear empty and denied states.
- **Depends on**: Per-User Source Permissions.

#### Scope

- WebUI source lists, library browse, random playback, and item playback rely only on what the server returns for the session.
- The profile dialog's Sources tab lists only the sources the server returns for the session.
- The header's admin icon, always visible before accounts, shows only to admins, including localhost, which is trusted as admin.
- The admin section is reachable only by admins.
- Messages for a user with no visible sources and for an item that becomes inaccessible.
- Docs and the testing checklist are updated for per-user source visibility.

#### Acceptance

- The WebUI never shows denied sources or plays denied items, and the profile dialog's Sources tab lists only the session's sources, in WebUI tests for hidden sources and inaccessible items.
- Permission changes made in the admin section reach open WebUI sessions through events or requery, in WebUI tests.
- Client filtering cannot widen what the server returns, in WebUI tests.
- Users without admin rights do not see the admin icon and cannot open the admin section, in WebUI tests for the admin icon's and admin section's visibility.

#### Release checks

- Manual: An admin and a user account in the WebUI on two devices see only their allowed sources, and a permission change in the admin section reaches both without a reload.

#### Not included

- Client requests for source access.
- Approval workflows.
- External sharing.

### P28m - Per-Account Library Data

- **Status**: ⏳ Planned
- **Goal**: Each account has its own favorites, blacklist, ratings, play history, tags, categories, presets, and profiles, and the library's data from before accounts belongs to the first account.
- **Depends on**: Account Store, Auth Cutover for API and Admin, so every request and event stream names its account, Admin First-Run Setup, whose first admin account takes the existing data, Library Profiles, and Profile Tag and Preset Visibility.

#### Scope

- A catalog schema step moves the library's existing favorites, blacklist, ratings, play counts and last played, item tags, tags, categories, presets, and profiles, with their sources and visibility, to the first account.
- Favorites, the blacklist, ratings, play counts, and last played move out of `items` into rows per account and item.
- No global tags or presets remain: each account has its own.
- The catalog refers to accounts by id, and account records and PIN hashes stay in the account store, as Account Store keeps them.
- The step gives the existing data a reserved first-account id, since a catalog upgrades when the server starts, before setup has created any account, and the first admin account that setup creates takes that id.
- The first account is always an admin, and a direct localhost connection, which PIN Login API and Sessions trusts as admin, uses it.
- The first account takes the default profile's name and color, and from then on each account's default profile has the account's name and color.
- A new account starts with no favorites, ratings, history, tags, categories, or presets, and with one default profile.
- Item-state, rating, playback, tag, preset, and profile events, and Other devices popups, go only to the same account's devices.
- Random picks, with every option, library stats, and Auto Tag use the account's own data.
- A profile's sources come from those its account may see.
- Decides what a catalog import or a backup restore does with data for account ids the account store doesn't have.
- Decides whose favorites, ratings, plays, and tags duplicate review shows and Select Best compares.
- Decides whether resume positions, which Resume Position and Session Continuity keeps per server, become per account.

#### Traps

- Favorite, blacklist, play count, and last played are columns of `items`, and Item Ratings adds the rating there too.
- `item_tags` refers to tags by their folded name.
- Every event goes to every subscriber through one shared history of 256 events (`ServerStateService.cs`), so sending events per account needs a filter per subscriber.
- Random Pick Options keeps each device's shuffle memory by `clientId` (`LibraryPlaybackService.cs`), so a device that switches accounts keeps one memory (inferred).
- Account Store keeps accounts out of `library.db`, so catalog export carries no PIN hashes and import doesn't replace accounts.

#### Acceptance

- A catalog from before accounts opens upgraded with all its data under the reserved first-account id, and the first admin account setup creates owns it, in catalog upgrade tests and server tests of setup.
- Two accounts' favorites, blacklist, ratings, history, tags, categories, presets, and profiles stay apart, in server tests for each kind of data.
- A new account starts with only a default profile, in server tests of account creation.
- A direct localhost connection uses the first account, in server tests of localhost requests.
- Events and Other devices popups reach only the same account's devices, in server tests of the event stream and WebUI tests of the popups.
- Random picks and library stats use the account's own play history and ratings, in server tests of random selection and library stats.
- A catalog import or a backup restore handles data for unknown account ids as this entry decides, in server tests of import and restore.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Not included

- Switching accounts from the header, which is Account and Profile Picker.

### P28n - Account and Profile Picker

- **Status**: ⏳ Planned
- **Goal**: The header's profile picker also switches accounts, opening another account with its PIN.
- **Depends on**: Library Profiles, whose picker it extends, Per-Account Library Data, and WebUI Login Gate, whose PIN prompt it opens.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The picker shows the active account at the top with its profiles below, set apart visually, then every other account alphabetically.
- Another account opens with its PIN, at the profile it last used on that device, and its profiles stay hidden until then.
- Sign out sits under the active account.
- The default profile's name and color are the account's, and its Edit Profile's General tab changes them.
- Each device remembers each account's last-used profile.
- Before the app is built, the design is settled in the mockup and approved on a desktop browser, the iPad, and an Android phone.

#### Traps

- Library Profiles' picker lists the default profile first and the others alphabetically, with Add Profile at the bottom.
- WebUI Login Gate keeps no session, so the user logs in on every open and reload.

#### Acceptance

- The picker shows the active account with its profiles, then the other accounts alphabetically, as the approved mockup shows, in Header screen tests.
- Choosing another account asks for its PIN and opens it at its last-used profile on that device, and a wrong PIN or a lockout shows as WebUI Login Gate's do, in WebUI tests of switching accounts.
- Sign out ends the session and shows the login gate, in WebUI tests of signing out.
- The default profile's General tab changes the account's name and color, in profile dialog tests and server tests of the account's name and color.
- The mockup shows the picker as approved and matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Release checks

- Manual: On two devices, switching between two accounts from the picker asks for each PIN and shows only that account's library data and profiles.

---

### P33 - Catalog Corruption Detection Off the Startup Path

- **Status**: ⏳ Planned
- **Goal**: Detect a corrupt `library.db` anywhere in the file without adding to startup time.

#### Scope

- Candidate: run a full integrity check when a catalog backup is made, and on failure keep the last good backup, log it, and report it on the admin section's status.
- Decides whether a failed check also refuses the next startup. If it does, the server runs without a library, as it does for a damaged catalog (Catalog Open and Backup Safety).
- Startup keeps its revision-row read.
- The integrity check also decides how rotation and the restore list treat a backup that fails it, so rotation never deletes the last good backup while it keeps a bad one.

#### Traps

- Startup reads only the schema and the catalog's `revision` row, so corruption confined to item, tag, or preset pages passes the open and surfaces at the first query that reads those pages.
- A full check on every open reads the whole file and slows startup on large catalogs.
- Admin Refresh, Backup, and Duplicate Review adds daily retention, which decides which backups rotation deletes without knowing whether they are good.
- Admin Library Catalog Transfer can restore any listed backup.

#### Acceptance

- A catalog with corrupt item pages is reported without opening it in full at startup, in a corrupt-item-page test.
- Startup time does not grow with catalog size because of the check, in a startup timing comparison on a large catalog.
- A corrupt catalog is not written over the last good backup.

---

### P35 - Server Robustness Findings

- **Status**: ⏳ Planned
- **Goal**: Close the server robustness findings that no other milestone owns, so a stalled drive or share cannot stall a refresh and the server does no needless work.

#### Scope

- Storage:
  - Stalled source: the refresh stops working on a source whose storage stops responding, keeps that source's items as they are, and logs a warning, instead of crawling on. Decides the threshold and whether the rest of the run continues.
  - Two stats per file: the fingerprint stage's check loop stats each file once, or takes each file's size and write time from the walk.
- Needless work:
  - Telemetry reads: `ApiTelemetryService` keeps a ring buffer that reads newest first.
  - Session list under lock: `ServerSessionStore.GetActiveSessions` copies the records under the lock and sorts outside it.

#### Traps

- Storage:
  - Stalled source: the source walk (`EnumerateMediaFiles`, which calls `Directory.EnumerateFiles` with `AllDirectories`) and the fingerprint stage's check loop have no timeout and run synchronously on one thread pool thread.
  - With the media on a soft CIFS mount whose server answered slowly, the largest source's walk took 17 min 48 s against 8.5–15 s normally, the check loop advanced one file every 50–65 s, and the run took 48.5 min against 3.5–6.5 min (measured).
  - `Directory.EnumerateFiles` with `AllDirectories` throws on an I/O error rather than returning a partial list.
  - A source whose folder lists no media files while the library holds items from it already keeps them, with a `last.log` warning.
  - Two stats per file: the check loop calls `File.Exists` and then `new FileInfo` for every item, and on a 49,100-item library on a CIFS share it takes 3.4–4.6 min (measured).
  - On a CIFS mount with a 1 s attribute cache (`actimeo=1`), the second stat is answered from the client's cache, so the share sees about one request per item, about 49,500 a run at 4.2–5.6 ms each (inferred, from the kernel's CIFS operation counters).
  - So statting each file once saves few share requests on such a mount, while reading size and write time in the walk, right after each folder is listed, is answered from the attribute cache the listing fills and spares about one share request per item (inferred).
  - The walk (`EnumerateMediaFiles`) returns only paths and reads no size or write time.
- Needless work:
  - Telemetry reads: `ApiTelemetryService.GetIncoming` and `GetOutgoing` call `Reverse()` over the whole queue on every control status poll.
  - Session list under lock: `ServerSessionStore.GetActiveSessions` filters, sorts, and projects inside the session lock.

#### Acceptance

- A refresh stops working on a source whose storage stops responding, keeps that source's items, and logs a warning, in its finding's tests with a source whose walk stalls and one whose file checks stall.
- The refresh stats each file once, in the walk or in the check loop, in its finding's test.
- Each finding above is fixed or explicitly declined with a reason in this entry.
- Each fixed finding has a test.
- `dotnet test ReelRoulette.sln` passes.

#### Not included

- The server's own settings findings (partial posts, the non-atomic write, and the silent load failure), which is Server Settings Robustness, since the admin section saves server settings from any device.
- Logging slow sources and refresh durations, which is Server Instrumentation.
- The server's known bugs, which `ISSUES.md` lists.

---

### P36 - Client Robustness Findings

- **Status**: ⏳ Planned
- **Goal**: The WebUI's client and session ids never become an auth secret once login sessions exist.

#### Scope

- Client and session ids: once login sessions exist, decides whether the server derives them from the session instead, and keeps them from ever becoming an auth secret.

#### Traps

- `src/api/coreApi.ts` keeps the client id in `localStorage` and the session id in `sessionStorage`, and `sseClient.ts` puts both in the event stream URL, where proxy access logs record them.
- Random Pick Options keys each device's random-pick state by the client id alone, and neither id is a credential today.

#### Acceptance

- The finding above is fixed or explicitly declined with a reason in this entry.
- A fix has a test.
- `npm run verify` passes.

#### Not included

- The startup error markup finding, which is WebUI Preact Migration.
- Overlapping resyncs, which is Admin Source Management, since it already changes that code.
- Unchecked JSON, which is WebUI Notifications, since it already changes that code.
- Favorite and blacklist after Next, which is WebUI Multi-Select and Bulk Actions, since it already changes that code.
- The weak build check, which is New Logo and Icons, since it already changes that code.
- Known bugs in the WebUI and the dev scripts, which `ISSUES.md` lists.

---

### P50 - Desktop App Shell

- **Status**: ⏳ Planned
- **Goal**: An optional desktop app wraps the WebUI as-is and adds the native features a browser can't offer: browsing for a source folder and saving the library export with Save as.
- **Depends on**: Admin Source Management, whose add-folder field gets Browse, and Admin Library Catalog Transfer, whose export gets Save as, and it starts only once the new UI has been in daily use.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- An Electron app that loads the WebUI from the server, unchanged.
- On launch it starts the server on this machine when it isn't already running, or connects to a server on another machine.
- Electron, not Tauri: Electron ships one Chromium engine on every platform, matching what's tested in Chrome. Tauri renders in each OS's own webview (WebKitGTK on Linux, WebView2 on Windows), so the app would render and play media differently on each platform.
- Bridge: a preload script exposes a small API the WebUI detects.
- In a plain browser the bridge is absent and the WebUI works as it does today; each native feature shows only when the bridge offers it.
- Browse for a source folder: a Browse button beside the admin section's add-folder path field opens the OS folder picker and fills in the picked path, which the server then checks as it does a typed one.
- Browse shows only when the app and the server run on the same machine, since a picked path is only meaningful there.
- Save as for exporting the library: in the app, Export Library opens a save dialog that suggests `library-{date}.db` and saves where the user picks.
- Save as works with a server on this machine or another, since the file is saved on the app's machine.
- In the app the Export Library button opens a dialog, so it gets an ellipsis.
- Decides whether the app bundles the server or starts an installed one, and how it is packaged and updated beside the server's Velopack releases.

#### Traps

- Since Desktop Client Removal, `release.yml` builds and publishes only the server.
- Desktops installed before Desktop Client Removal still poll the old desktop feed (`reelroulette/desktop{-dev}` on B2, channel `{os}-desktop{-dev}`, package `ReelRoulette.Desktop`), so an app published under them would reach those installs as an update (inferred).

#### Acceptance

- Launching the app with no server running starts one and opens the WebUI; with a server already running, it opens that one without starting another, in tests of the app.
- The app connects to a server at another address and opens its WebUI, in tests of the app.
- With the app and the server on the same machine, Browse fills the add-folder path with the picked folder; with a server on another machine, or in a plain browser, Browse does not show, in WebUI tests with and without the bridge.
- In the app, Export Library saves to the path picked in its save dialog, with a server on this machine or another; in a plain browser it stays a download, in WebUI tests with and without the bridge.
- In a plain browser the WebUI is unchanged, in WebUI tests without the bridge.
- `npm run verify` passes.

#### Release checks

- Manual: On Linux and Windows, the packaged app starts its own server when none is running, and connects to a server on another machine and works as a browser does.

#### Not included

- Other native features the desktop client had, such as always-on-top; the bridge can offer them later.

### P51 - WebUI Volume Boost

- **Status**: ⏳ Planned
- **Goal**: With Enhanced audio on, the volume slider goes above 100%, so a quiet video can play louder than the device's own volume allows.
- **Depends on**: WebUI Loudness Normalization, whose limiter keeps a boost from clipping, and it starts only once the user has used loudness normalization and Enhanced audio for a while and decides a boost is still needed.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- With Enhanced audio on, the volume slider goes above 100%, through WebUI Volume and Enhanced Audio's gain stage.
- How far it goes is settled in the mockup and approved before the app is built.
- While the volume is above 100%, WebUI Loudness Normalization's limiter is in the chain, so a boost doesn't clip.
- With Enhanced audio off, the slider stops at 100%.
- The volume steps, the scroll wheel, a two-finger drag, and the [ and ] keys go as far as the slider does.

#### Traps

- The desktop's volume slider went to 200% (`MainWindow.axaml`) (measured).
- WebUI Volume and Enhanced Audio's slider stops at 100%.
- A media element's own volume stops at 100%, so only the gain stage can go above it (inferred).
- A gain above 1 can clip a loud video (inferred).
- WebUI Loudness Normalization keeps its limiter in the chain whenever the gain stage runs, before the volume's gain, so a volume above 100% comes after the limiter.

#### Acceptance

- With Enhanced audio on, the slider sets a volume above 100% through the gain stage, up to the approved maximum, and with it off the slider stops at 100%, in WebUI tests of the volume above 100%.
- While the volume is above 100%, the limiter is in the chain, in WebUI tests of the audio chain.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's own devices.

#### Release checks

- Manual: With Enhanced audio on, a quiet video played above 100% is louder without distortion, in Chrome, Firefox, and Safari on a desktop and on Android and iOS.

### P52 - WebUI Tooltips

- **Status**: ⏳ Planned
- **Goal**: The app draws every tooltip itself, in the app's theme, so desktop hover tooltips follow the theme instead of the browser's, and a long press on a touch screen shows the same tip, so icon names and disabled buttons' reasons can be read without a mouse. Low priority, after Animations.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The app draws every tooltip itself, in the app's theme, so desktop hover tooltips follow the theme instead of the browser's, and a long press on a touch screen shows the same tip.
- On a touch screen, long-pressing any element with a tooltip shows it as a tip beside the element, icon names and disabled buttons' reasons alike.
- The tip shows while the press is held and for about 1.5 seconds after release.
- A long press never also presses the button.
- Elements that already use holding or a long press keep their behavior: dragging presets and tag categories, the player's taps, selecting library tiles, and opening context menus.
- The blocked Apply keeps its press-to-show notice.
- The mockup comes first, and the user reviews it in Firefox on the desktop, on the iPad, and on an Android phone before the app is built.

#### Traps

- Tooltips are `title` attributes, which a phone or tablet doesn't show, so the blocked Apply shows its reason in a notice when pressed instead (`blockedReason` on `HeldButton` in `src/ui/FieldValidation.tsx`).
- `HeldButton` gives a disabled or held action's reason as its `title`.
- The app's tooltips are 71 `title` attributes in 14 components under `src/ui/`, and two the library grid sets itself: a tile's file name and its check icon's "Select" or "Deselect" (`libraryGridTile.ts`) (measured).
- A `title` is also an element's accessible name when it has no other, and AGENTS.md keeps controls' accessible names, so an element named only by its `title` needs its name kept another way.
- Tests read tooltips through `title`, with Testing Library's `getByTitle`, `getAttribute("title")`, and `.title`, 71 times in 10 test files, most in `screens/filter.test.ts` (28) and `screens/tags.test.ts` (12), and the filter, foundation, library, and tags screen snapshots hold `title` attributes (measured).
- A disabled button gets no pointer or click events in some browsers, so its long press has to be caught around it (inferred).
- Safari on iOS and Chrome on Android show their own callout, menu, or text selection on a long press (inferred).
- Reordering presets and tag categories starts a drag on pointer down on a row's handle (`src/ui/Reorder.tsx`).
- The player's taps and swipes are handled in `src/playback/mediaGestures.ts`, which ignores the click the browser sends after a swipe or a handled tap.
- WebUI Multi-Select and Bulk Actions starts a selection with a long press on a tile.
- WebUI Context Menus opens a surface's menu on a long press wherever it has one but on buttons, so some elements with a tooltip, such as the header's now-playing name and Auto Tag's file rows, open a menu instead.

#### Acceptance

- On a touch screen, a long press on an element with a tooltip shows its tip beside it while held and for about 1.5 seconds after release, without pressing it, in WebUI tests of long-press tips with touch pointers.
- A long press on a disabled button shows its reason, in WebUI tests of long-press tips on disabled buttons.
- Dragging presets and tag categories, the player's taps, selecting library tiles, opening context menus, and the blocked Apply's notice work as before, in their existing tests and WebUI tests of a long press on each.
- A mouse shows no tip on a long press, in WebUI tests with a mouse pointer.
- On a desktop, hovering an element with a tooltip shows the app's tip in the app's theme, and the browser shows none of its own, in WebUI tests of hover tips.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the iPad and an Android phone.

#### Release checks

- Manual: In Firefox on the desktop, hovering an icon button shows the app's tip in the dark and light themes, and on the iPad and an Android phone, long-pressing an icon button and a disabled button shows the same tip without pressing it.

### P53a - Animations

- **Status**: ⏳ Planned
- **Goal**: The side panel, dialogs, the phone's full-screen overlays, and the bell's list open and close with short animations in one style across devices.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Animations for the side panel opening and closing, dialogs, the phone's full-screen overlays, and the bell's list.
- One style across devices, each animation about 150 to 250 ms.
- The mockup tries both a smooth player resize and a snap beside the panel, for the user to choose.
- The system's reduced-motion setting turns them off.
- Closing has a timeout, so nothing stays open in a background tab.
- The mockup comes first, and the user approves it before the app is built.

#### Traps

- The side panel, dialogs, the phone's full-screen overlays, and the bell's list have no transition or animation in `src/styles.css`, so they open and close at once.
- Popups fade and slide in over 160 ms and field marks fade over 250 ms, and `prefers-reduced-motion` turns both off (`src/styles.css`).
- `useFadeOut` keeps a fading element rendered for `FADE_MS`, 250 ms, on a timer rather than waiting for the animation to end, and removes it at once with reduced motion (`src/ui/FieldValidation.tsx`).
- Browsers hold back animations, and the events that end them, in a background tab, so a close that waits for one can leave the element open (inferred).
- A smooth player resize changes the video's size on every frame, which may stutter on a phone or tablet (inferred).

#### Acceptance

- The side panel, dialogs, the phone's full-screen overlays, and the bell's list open and close with the approved animations, and at once with reduced motion, in WebUI tests of each with and without reduced motion.
- A close finishes at its timeout when its animation never ends, in WebUI tests of a close whose animation doesn't end.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone and iPad.

#### Not included

- Animations for other surfaces, such as collapsing sections and tab switches, which is Animation Settings and More Surfaces.
- Settings that turn animations on or off or adjust them, which is Animation Settings and More Surfaces.

### P53b - Animation Settings and More Surfaces

- **Status**: ⏳ Planned
- **Goal**: Most other surfaces animate in the style Animations sets, and a Settings section turns animations on or off and adjusts them on each device.
- **Depends on**: Animations, whose style these animations follow.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Animations for most other surfaces, such as collapsing sections and tab switches.
- A Settings section, saved per device, turns animations on or off and adjusts them, possibly with a style per device.
- Decides whether the system's reduce-motion setting overrides the user's choice.

#### Traps

- The WebUI keeps per-device settings in `localStorage` through `createDeviceStore` (`src/state/deviceStore.ts`).
- A setting's More chevron already turns over 150 ms, and reduced motion turns that off (`.setting-more-chevron` in `src/styles.css`).

#### Acceptance

- The surfaces it covers animate in the style Animations sets, and with animations off they change at once, in WebUI tests of each.
- The Settings section's choices are kept on the device across a page refresh, in Settings tab tests.
- The system's reduce-motion setting and the user's choice combine as this milestone decides, in WebUI tests of each combination.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

### P54 - Extended Metadata

- **Status**: ⏳ Planned
- **Goal**: Each item can have a title, year, genre, creator or artist, album or series, and comment, stored in the catalog and edited in the app, for one item or several at once. Soon after v0.15.0 ships.
- **Depends on**: WebUI Multi-Select and Bulk Actions, whose selection edits several items at once.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The metadata is stored in the catalog and edited in the app, and editing it never touches media files.
- A title defaults to the file's name: only an edited title is stored, and clearing it goes back to the name.
- Sort by name uses the title, through a stored sort key of the title, or else the file's name, with its index.
- Search matches the title too.
- People stay tags, with no field of their own.
- Year filters by a range and sorts.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | Editing the metadata of one item or several through multi-select, and where titles show, approved by the user. |
| Server | ⏳ Planned | The metadata in a new catalog schema step, the title-or-name sort key and its index, the title in search, the year range filter, the year sort with its indexes, and writes for one item or several. |
| Contract | ⏳ Planned | The metadata on item reads, its writes and their events, the year range in the FilterState schema, and the year sort, in OpenAPI, the generated WebUI types, and `docs/api.md`. |
| WebUI | ⏳ Planned | Editing the metadata of one item or a selection, titles where the mockup shows them, the year range in the Filter tab, and the year sort. |

#### Mockup slice

**Scope**

- Editing the metadata of one item, and of several at once through multi-select, in `docs/mockups/reelroulette/`.
- Where titles show in place of file names.
- The user approves the design before the app is built.

**Traps**

- WebUI Multi-Select and Bulk Actions acts on a selection through its Selection actions menu, and its Select all selects every item that matches the search and filters, loaded or not.

**Acceptance**

- The mockup shows editing one item and several, and where titles show, as the user approved them in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.

#### Server slice

**Scope**

- The metadata columns on `items`, as the catalog moves to the next schema version, with its own upgrade step from the version before.
- Name sort orders by a stored sort key of the title, or else the file's name, with its index.
- Search matches the title as well as the file's name and relative path.
- A year range in the FilterState schema, applied in the list query, its counts, and random selection.
- A stored preset without the year range filters with no year limit.
- A year sort, with its indexes.
- Writes set the metadata of one item, or the same fields on several items at once, and publish an event, one for a write to several items, as WebUI Multi-Select and Bulk Actions' bulk rating does.

**Traps**

- Item Ratings, Rating Filter and Sort, Library Profiles, and Profile Tag and Preset Visibility each move the catalog to a new schema version.
- Per-Account Library Data adds a catalog schema step too, so whichever of the two lands second takes the next version (inferred).
- Name order sorts by the stored `items.file_name_sort_key`, from `LibraryCatalogNameSortKey.Compute`, which orders like OrdinalIgnoreCase, and every other sort's index ties on it (`BuildOrderBy` in `LibraryCatalogListQuery.cs` and `SortIndexesSql` in `LibraryCatalogStore.cs`).
- The refresh pipeline's `nameSortKeys` stage recomputes every stored key when the catalog's `name_sort_key_version` differs from `LibraryCatalogNameSortKey.Version` (`RefreshPipelineService.cs`).
- Search matches the folded file name and relative path with `instr` (`AppendSearch` in `LibraryCatalogListQuery.cs`).
- Every sort has an index, so no sort reads the whole library, and SQLite reads one only when its expression matches the ORDER BY (measured).
- `BuildOrderBy` sorts the other modes by `COALESCE({column}, 0)` and then the name key, which puts items without a value first ascending and last descending (measured).
- Item Ratings gives the 2→3 step its own index SQL, and Rating Filter and Sort puts its sort indexes in their own constant, so this step's indexes go in theirs.
- Library Profiles has the item events carry each item's `sourceId`, so a profile can leave out items in sources it hides.

**Acceptance**

- A catalog at the schema version before opens upgraded and imports upgraded through the new upgrade step, in the upgrade chain's catalog upgrade tests.
- An item without an edited title sorts by its file's name, one with an edited title sorts by the title, and clearing the title goes back to the name, in server tests of the name sort and of title writes.
- The name and year sorts read their indexes, in server tests of the sorts and their query plans.
- Search matches the title, in server tests of search.
- The year range filters the list query, its counts, and random selection, and a stored preset without it filters with no year limit, in server tests of the year range.
- Writes to one item and to several store the fields, publish their event, and leave the media files untouched, in server tests of the writes.
- `dotnet test ReelRoulette.sln` passes.

#### Contract slice

**Scope**

- The metadata on item reads, the writes for one item and several, their events, the year range in the FilterState schema, and the year sort mode, in OpenAPI and the generated WebUI types.
- `docs/api.md` documents the fields, the writes, and the title-or-name sort.

**Traps**

- `LibraryListSort` rejects an unknown mode with a message that lists the modes (`LibraryOperationsService.cs`).

**Acceptance**

- OpenAPI and the generated WebUI types carry the fields, the writes, their events, the year range, and the year sort, in contract tests.
- `docs/api.md` documents them, checked by reading it.
- `npm run verify` passes.

#### WebUI slice

**Scope**

- Editing the metadata of one item, and of several at once through a multi-select selection, as the approved mockup shows.
- Titles show where the mockup shows them, with the file's name for an item without one.
- Every open WebUI follows a metadata change from its event.
- The year range in the Filter tab, saved in presets and compared in preset matching, with its cases in `preset-filter-equality.json`.
- The year sort in the Library tab.

**Traps**

- Preset equality is locked to `shared/fixtures/preset-filter-equality.json`, which Core's filter comparison and the WebUI's both read, so a case for the year range needs both to compare it.
- Select all selects every item that matches the search and filters, loaded or not, so an edit to it reaches items no tile shows.

**Acceptance**

- Editing one item and a selection stores the fields, and clearing a title shows the file's name again, in WebUI tests of metadata editing.
- Titles show in each place the mockup shows them, in screen tests of each place.
- Another device's metadata change shows without a reload, in WebUI tests of the metadata event.
- The year range is saved in presets and compared in preset matching, in WebUI tests for the year range and the shared fixture's cases.
- The year sort orders the Library tab, in Library screen tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

#### Not included

- Reading metadata from media files and writing it back, which is File Metadata Sync.

### P55 - Player Zoom and Pan

- **Status**: ⏳ Planned
- **Goal**: The playing photo or video can be zoomed into and the zoomed view panned, by Ctrl+scroll or a trackpad pinch on a desktop and a pinch on touch screens.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Ctrl+scroll or a trackpad pinch on a desktop, and a two-finger pinch on touch screens, zoom into the playing photo or video.
- The zoomed view can be panned.
- The mockup comes first, and the user reviews it on a desktop browser, the iPad, and an Android phone before the app is built.

#### Traps

- Two fingers dragged up or down over the player change the volume a step per 30 px (`src/playback/mediaGestures.ts`), so a pinch must be told apart from that drag.
- Ctrl+scroll and a trackpad pinch over the player change the volume, since the player's wheel handler passes every wheel event to the volume, Ctrl held or not (`onWheel` in `src/ui/Player.tsx`).
- A swipe left or right over the player plays the next or previous item (`src/playback/mediaGestures.ts`), so panning must not be taken for one.
- WebUI Keyboard Shortcuts adds double-tap seeking on either half of the player, so panning must not clash with it.
- When the zoom resets, such as on the next item, isn't settled.
- The player claims its touches (`touch-action: none` on `.media-container` in `src/styles.css`) and turns away Safari's pinch by cancelling `gesturestart` (`src/ui/Player.tsx`), so a pinch over it never zooms the page.
- WebUI Context Menus opens the player's menu on a long press on its picture, so a pan that starts by holding still would open it (inferred).

#### Acceptance

- Ctrl+scroll, a trackpad pinch, and a touch pinch zoom into the playing photo and video, in WebUI tests of player zoom.
- Panning moves the zoomed view, in WebUI tests of player zoom.
- A pinch is told apart from a two-finger volume drag, and panning from a swipe and a double-tap, in gesture tests.
- The zoom resets as the approved mockup shows, in WebUI tests of player zoom.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check in a desktop browser and on the iPad.

#### Release checks

- Manual: In a desktop browser with Ctrl+scroll and on the iPad with a pinch, zooming into a playing video and panning it works, and a swipe outside a zoomed view still plays the next item.

### P56 - WebUI Ratings on Tiles

- **Status**: ⏳ Planned
- **Goal**: Library tiles show each item's rating. Low priority, since the rating filters and sorts already find files by their rating, and rating badges would clutter the tiles.
- **Depends on**: Item Ratings, WebUI Grid Row Reuse and Zoom, which updates a tile in place, and Rating Filter and Sort, whose rating change kind in the tile effect rule decides whether a rating change patches a tile or reloads the window.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Each tile shows its item's rating, and an unrated item's tile shows none.
- Before the app is built, how a tile shows its rating is settled in the mockup and approved on a desktop browser, the iPad, and an Android phone, such as a badge beside the favorite and blacklist badges or the rating in the file-name bar.
- A rating change updates the tile in place when the tile effect rule says patch.

#### Traps

- Tiles show favorite and blacklist as filled icon badges with a soft drop shadow (`.library-grid-tile .material-symbol-icon.is-filled` in `src/styles.css`).
- The file-name bar shows only while the Settings tab's Show file names on tiles is on, through a class on the Library tab, without rendering the tiles again.
- Query pages carry each item's `rating` from Item Ratings.

#### Acceptance

- Tiles show their item's rating as the approved mockup shows, and an unrated item's tile shows none, in Library screen tests.
- A rating change updates only that tile when the rule says patch, in WebUI tests for tile patching.
- The mockup shows the tile rating as approved and matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

### P57 - WebUI Grid Scrollbar Seek

- **Status**: ⏳ Planned
- **Goal**: Dragging the library grid's scrollbar, or an optional timeline rail of the results' dates, letters, or ratings, reaches any part of the results without loading every page before it. Low priority, since filters, sorts, and search already find files without scrolling far down the grid.
- **Depends on**: WebUI Grid Row Reuse and Zoom, and WebUI Multi-Select and Bulk Actions, whose Library look slice puts the grid's scrollbar in the Library tab's right margin, where the timeline rail goes.
- **Design**: `docs/mockups/reelroulette/`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Design note | ⏳ Planned | A reviewed design note on how the query session and grid work with pages loaded at the scroll position. |
| Scrollbar seek | ⏳ Planned | A grid sized to the full result count with placeholder tiles, loading the page at the scroll position. |
| Timeline rail | ⏳ Planned | An optional Google Photos-style timeline rail in the grid's right margin, with labels that follow the sort, and a custom-drawn scrollbar thumb while it is off. |

#### Design note slice

**Scope**

- A design note that settles how the query session tracks the pages it has loaded.
- It settles what a reload, a patch-or-reload decision, and a resync request do with scattered pages.
- It settles how the grid keeps the tile in view when a page's real thumbnail ratios replace its placeholders' fallback ratios.

**Traps**

- The WebUI's query session holds one contiguous window from the first page. It reloads that window in one request for up to 10,000 tiles, fill-on-scroll appends to it, the patch-or-reload rule (`library-tile-effect.json`) decides for the tiles in it, and `resyncRequired` reloads it. Pages loaded at the scroll position break each of these.
- The row layout depends on each item's thumbnail aspect ratio, so placeholder tiles for items not loaded yet use fallback ratios, and rows can change when their page arrives and shift what is on screen (inferred).

**Acceptance**

- The design note is written and reviewed before the Scrollbar seek slice starts, and names how the session tracks its loaded pages, what a reload, a patch-or-reload decision, and a resync request do with scattered pages, and how the grid keeps the tile in view when a page's real ratios arrive.

#### Scrollbar seek slice

**Scope**

- Size the grid to the full result count with placeholder tiles, and load the page at the scroll position, so dragging the scrollbar far down works without scrolling through every page.
- A reload, a patch-or-reload decision, and a resync request work with scattered loaded pages as the design note sets out.
- No contract change: the library query already takes an offset.
- Apart from placeholder tiles and loading the page at the scroll position, grid layout, scrolling, and tile behavior stay as they are.

**Traps**

- The row layout depends on each item's thumbnail aspect ratio, so placeholder tiles for items not loaded yet use fallback ratios, and rows can change when their page arrives and shift what is on screen (inferred).
- `LibraryQueryRequest.offset` is in OpenAPI.

**Acceptance**

- The grid is sized to the full result count, with placeholder tiles for items not loaded yet, in WebUI tests for loading the page at a scrollbar position.
- Dragging the scrollbar far down loads the page at that position without loading the pages before it, in WebUI tests for loading the page at a scrollbar position.
- A reload, a patch-or-reload decision, and a resync request work with scattered loaded pages as the design note sets out, in WebUI tests for each with scattered pages.
- When a page's real thumbnail ratios replace the fallback ratios, the tile in view stays in view, in WebUI tests for keeping the tile in view when a page arrives.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Timeline rail slice

**Scope**

- An option turns on a timeline rail, as Google Photos has, in place of the scrollbar, down the grid's right margin and with no thumb.
- The rail shows major labels, such as years, and minor dots, such as months, each placed by where its first item falls in the whole filtered set, loaded or not.
- A server read answers where each group starts in the whole filtered set for the current search, filter, and sort, as a new library route or an addition to one, in OpenAPI and the generated WebUI types.
- With the pointer over the rail, a floating label with a line at the pointer names the point, such as "Apr 2026", and a click or drag there jumps the grid to it, loading the page at that position.
- The rail's groups follow the current sort: years and months for Date added, Date created, and Last played, letters for Name, star levels for Rating, and fitting groups for Play count and Duration, which the mockup review settles.
- With the rail off, the grid's scrollbar is a custom-drawn thumb centered in the right margin, about 3 px wide while the pointer is over the grid and 6 px with the pointer over the scrollbar itself, which seeks as the Scrollbar seek slice's scrollbar does.
- Where the option lives, and the rail's look, are settled in the mockup review, which comes first.

**Traps**

- WebUI Multi-Select and Bulk Actions' Library look slice makes the grid's scrollbar the browser's thin one, placed in the Library tab's right margin, so the tiles keep their width as it comes and goes.
- The WebUI loads only some pages of the results, so where each group starts in the whole filtered set needs a read from the server for the current search, filter, and sort (inferred).
- Browsers draw their own scrollbars differently: some take room and some fade over the content, and a fading one's width isn't reported, so a custom-drawn thumb looks the same everywhere and the native one has to be hidden (inferred).

**Acceptance**

- The server read answers where each group starts in the filtered set, for each sort, in server tests for the read.
- The read is in OpenAPI, and `npm run verify:contracts` passes, in contract tests.
- The rail places each group's label or dot where its first item falls in the filtered set, for each sort, in WebUI tests of the timeline rail.
- The pointer's floating label names the point under it, and a click or drag jumps the grid there, loading the page at that position, in WebUI tests of the timeline rail.
- With the rail off, the custom thumb is centered in the right margin, about 3 px wide with the pointer over the grid and 6 px over the scrollbar, and dragging it seeks, in WebUI tests of the custom thumb.
- The mockup matches what this slice shipped, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Release checks

- Manual: In a desktop browser and on a phone, dragging the library grid's scrollbar to the end of a large library shows its last tiles without loading every page before them.
- Manual: In a desktop browser, the timeline rail's labels follow the sort, and dragging along it jumps the grid to that point.

### P58 - Sharper Thumbnails

- **Status**: ⏳ Planned
- **Goal**: Library tiles stay sharp at every zoom level on high-density screens, through larger thumbnails, a sharper photo resize, and one rebuild of every thumbnail.

#### Scope

- Raise the thumbnails' long edge from 480 px (`ThumbnailMaxEdge` in `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs`) to a size chosen when this milestone is planned, from the measured options in Traps.
- Photo thumbnails are scaled with a sharper resize filter than today's linear one.
- A video smaller than the thumbnail size keeps its own size instead of being enlarged.
- A marker in the catalog's meta table makes the next refresh rebuild every thumbnail once, and is set only when the thumbnail stage finishes, so an interrupted rebuild carries on at the next refresh.
- The larger size, the photo filter, and the small-video rule share that one rebuild, so the library is rebuilt only once.

#### Traps

- Thumbnails are made one at a time, as the last stage of a refresh, and only when one is missing or its source's revision changed, so raising the size alone leaves existing thumbnails at 480 px (`RefreshPipelineService.cs`).
- Nothing rebuilds existing thumbnails: no admin action, size marker, or migration does it (measured).
- The catalog's meta table already holds a version marker that rebuilds every item's name sort key when it differs (`SetNameSortKeyVersion` in `src/core/ReelRoulette.Core/Library/LibraryCatalogSession.cs`, `NameSortKeyVersionKey` in `LibraryCatalogStore.cs`), which a thumbnail marker can follow.
- Videos are made with ffmpeg's `scale=480:480:force_original_aspect_ratio=decrease`, which enlarges a smaller source, so a 320×240 video gets a 480×360 thumbnail (measured).
- Photos are decoded whole by SkiaSharp, scaled with linear filtering and linear mipmaps without being enlarged, and saved as JPEG at quality 85 (`RefreshPipelineService.cs`).
- At 100 to 160 px tiles, Skia's linear filter keeps 65 to 90% of a photo's fine detail, where a Lanczos resize to the same 480 px keeps about all of it, for 4 to 10% more bytes (measured).
- A thumbnail's `thumbnailVersion` comes from its file's write time and length, and the WebUI puts it in the thumbnail's URL, so browsers fetch a rebuilt thumbnail without further work.
- While the thumbnail stage rebuilds, its refresh runs long and the next refresh waits for it (inferred).
- The library's 49,466 thumbnails take 1.24 GB as 480 px JPEGs: 430 MB for 17,839 videos and 814 MB for 31,627 photos (measured).
- About 76% of videos and 66% of photos are portrait, and on a 2× screen a portrait tile needs about 2× its height in pixels along its long edge, where a landscape tile needs about 3.6× (measured).
- On an iPad, with the library panel at each width it can have and the grid's layout over the real catalog, these shares of tiles stretch their thumbnail more than 1.1×, slightly soft, and more than 1.3×, clearly soft with under half the fine detail kept (measured):
  - At 480 px: 0 to 6% and none at 160 px rows, 2 to 9% and 0 to 7% at 200, 8 to 27% and 2 to 8% at 240, and 33 to 63% and 8 to 27% at 300.
  - At 720 px: none up to 200 px rows, 0 to 1% and none at 240, and 0 to 8% and 0 to 1% at 300.
  - At 960 px: none up to 300 px rows.
- A larger size adds 0 to 10 ms per video thumbnail and 5 to 15% per photo thumbnail, since seeking and decoding the source take most of the time (measured).
- Thumbnail files grow about 1.8× for videos and 2.0× for photos at 720 px, and 2.6× and 3.4× at 960 px (measured on 18 samples).
- At those rates the library's thumbnails would take about 2.4 GB at 720 px and 3.9 GB at 960 px (inferred).
- A tile's download grows with its file, and at the default 160 px rows a 960 px thumbnail has up to three times the pixels a tile needs along its long edge on a 2× screen (inferred).
- One video thumbnail reads a median of 1.7 MB of its file, and a photo reads its whole file, a median of 2.8 MB (measured).
- A rebuild of every thumbnail takes about 2 to 3 hours, at about 0.2 s per video over the NAS, from six videos in one refresh, and about 0.2 s per photo (inferred).

#### Acceptance

- Thumbnails come out at the chosen long edge, and a smaller video keeps its own size, in thumbnail generation tests.
- Photo thumbnails keep more fine detail than with the linear filter, in thumbnail generation tests.
- The first refresh after the update rebuilds every thumbnail once and carries on after an interruption, and later refreshes rebuild none, in refresh pipeline tests.
- `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` pass.

#### Release checks

- Manual: On the iPad, library tiles at the largest zoom look sharp after the first refresh following the update.
- Agent: The release notes say that the first refresh after updating rebuilds every thumbnail and takes a few hours.
