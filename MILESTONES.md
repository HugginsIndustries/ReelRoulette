# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. Each release becomes a new `M*` series when it is promoted.

The WebUI is the only client on every device from v0.15.0, which removes the desktop client. The native Android client is dropped.

- **v0.15.0 — WebUI overhaul**: Serve the WebUI over HTTPS so it installs as an app, move it to Preact, design the release's UI in one approved mockup, roll out the new logo and icons, give it a responsive layout with a side panel and phone overlays, and give it everything the desktop does: keyboard shortcuts and full keyboard navigation, volume and loudness normalization, stats, settings, an admin section that replaces the Operator page and manages refresh, backups, duplicates, sources, and catalog transfer, Show in File Manager, a browser-playable filter, and multi-select. It also adds 5-star ratings with half stars, which filter and sort, date added and date created filters and sorts, a Random tab whose options combine shuffle, folder and tag spread, and favoring less played, new, or higher-rated files in place of the randomization modes, and profiles, chosen from the header, that each show only the sources, tags, and presets picked for them. It removes the desktop client, its packaging, and its tests, and moves preset writes to per-preset routes. M12a, M12b, M12c, M12d, M12e, M12f1, M12f2, M12f3, M12f4, M12f5, M12f6, M12f7, M12f8, M12g, M12h, M12i1, M12i2, M12i3, M12i4, M12i5, M12i6, M12i7, M12i8, M12i9, M12i10, M12j, M12k1, M12k2, M12k3, M12k4, M12k5, M12k6, M12l1, M12l2, M12l3, M12m, M12n1, M12n2, M12n3, M12o1, M12o2, M12o3, M12p, M12q, M12r, M12s, M12t, M12u.
- **v0.15.1 — Structured log foundation**: Write `last.log` as structured JSON Lines through one server writer and give the WebUI a typed, privacy-safe log API. P27a, P27b.
- **v0.16.0 — Playback sessions**: Let the server choose direct, remux, or transcode playback per session for the WebUI. P2a, P2b, P2c, P2d, P2f, P2g, P2h.
- **v0.17.0 — Structured log migration and Log Viewer**: Move every server and WebUI log to the structured API and give the admin section a filterable Log Viewer. P27d, P27e, P27f, P27g.
- **v0.18.0 — Accounts**: Require an account PIN from LAN and remote clients, with per-user source access, and give each account its own favorites, ratings, history, tags, presets, and profiles. P28b, P28c, P28d, P28e, P28f, P28m, P28g, P28h, P28j, P28n, P28k, P28l.
- **Unscheduled backlog**: P1, P4, P5, P6, P9a, P9b, P10, P33, P35, P36, P50, P51, P52, P53a, P53b, P54, P55.

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

Last milestone completed: M12k1

### M12k2 - Item Ratings

- **Status**: ⏳ Planned
- **Goal**: Library items have a 5-star rating with half stars, set from the Stats tab's Current file section and shared by every device.
- **Depends on**: WebUI Stats Panel, whose Current file section holds the rating and whose catalog upgrade chain takes its schema step, and WebUI Notifications, whose Your actions and Other devices popups announce a rating change.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- A rating is ½ to 5 stars in half-star steps, or none. The catalog stores it as a whole number of half stars from 1 to 10, with no value for none and never 0, so "0 stars" and "not rated" can't both exist. The API gives it in stars, a multiple of 0.5 from 0.5 to 5.
- Ratings are shared by every device, as favorites and the blacklist are, until accounts exist; then each account has its own, as its favorites and blacklist are.
- A rating is independent of favorite and blacklist: blacklisting an item keeps its rating, and rating an item changes neither flag.
- A rating change publishes its own event, `itemRatingChanged`, with the item's id and path, its rating and previous rating, and the `clientId` of the request that made it. Reusing `itemStateChanged` would show a rating change as a favorite change on other devices.
- The rating has its own line in the Current file section, under the path: the label Rating, five stars, and a Clear button while the item is rated.
  - A mouse over a star previews the value under it, the star's left half meaning half a star less than its right half, and a click sets it.
  - On a touch screen a tap on a star's half sets that value, and a drag along the stars changes the value as it moves and sets it on release.
  - From the keyboard it is one tab stop: the left and down arrows step down half a star, the right and up arrows step up half a star, Home is Not rated, End is 5 stars, and Delete or Backspace clears it.
  - To screen readers it is a slider named Rating, from 0 to 5, whose value text is "3.5 stars", "1 star", or "Not rated".
- The popups are "Rated {rating}" and "Rating cleared" as Your actions, with the file name as the second line, and the same text followed by "on another device" as Other devices, where {rating} reads as the value text does, such as "3.5 stars".

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | The rating in the Stats tab's Current file section, the Rated card, and the rating popups, approved on a desktop browser, the iPad, and an Android phone. |
| Server | ⏳ Planned | The rating column in a new catalog schema step, the shipped 2→3 step's index SQL frozen, setting a rating in the catalog, `rating` on item reads, and the rated count in the stats read. |
| Contract | ⏳ Planned | The rating route and its `itemRatingChanged` event, the rated count in the stats response, and `rating`, `hasAudio`, and the fields the server always sends named in `LibraryProjectionItem`, in OpenAPI and the generated WebUI types. |
| WebUI | ⏳ Planned | The rating control in the Current file section, its popups and event handling, and the Rated card. |

#### Mockup slice

**Scope**

- The rating line in the Stats tab's Current file section, as the Decisions describe, under the path line. It shows only while the stats rows show, so not with nothing playing, for a file the server no longer has, while the server fails the compatibility check, runs without a library, or asks for pairing, or while the item loads.
- A Rated card in the Library cards, after Blacklisted, counting the rated items.
- The Your actions and Other devices rating popups, a Mockup-tab button for a rating from another device beside the favorite one, and the Settings tab's Other devices description naming rating changes.
- `star` and `star_half` in the mockup's icon subset, with `star` also filled.
- The ratings the mockup's items start with come from each item's id.
- Before the app is built, the user approves the rating on a desktop browser, the iPad, and an Android phone, including the size of the stars and how halves are tapped and dragged.

**Traps**

- The mockup's fonts are a subset that `build_font.py` cuts from the WebUI's font, with outlined icons in `ICONS` and filled ones in `FILLED`, written into `icons.json`; neither list has a star.
- `setIcon` in `common.js` shows an icon missing from the subset as codepoint 0xE000, the `error` glyph, and `check.mjs` doesn't check for it (measured).
- `star_half` ignores the font's fill axis: its left half is solid and its right half outlined at every fill (measured).
- A filled `star` is flat only at optical size 20, the size filled icons use; at 48 its fill leaves a ring (measured). Empty and half stars use the outlined icons' size, and full stars the filled icons'.
- `fileStats` in `layout.src.html` builds the Current file section, and `statRow` takes a DOM node as its value.
- Drawing the starting ratings from `statRand` would shift every random value drawn after them (inferred).
- The mockup's path line, like the app's `.stats-path`, also holds Copy Path or Show in File Manager, which Show in File Manager from the WebUI built.
- `#mock-sync` is the Mockup tab's favorite from another device, which sends an Other devices popup with the key `sync:{id}`.
- `check.mjs` runs the pages in happy-dom, with no layout and no pointer drags, so the stars' size and how halves are tapped and dragged can only be judged on the devices.
- At 320 px wide the stats table's value column is about 210 px, too narrow for five 44 px stars and Clear, while the section's full width is about 290 px (inferred).

**Acceptance**

- The mockup shows the rating line, the Rated card, and the rating popups as the user approved them in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.

#### Server slice

**Scope**

- The catalog moves to the next schema version, with its own upgrade step from the version before that adds only a nullable `rating` column to `items`. A new catalog has the column last too.
- The shipped 2→3 step's sort indexes move into their own constant, so a later change to the indexes a new catalog gets can't change a shipped step.
- Setting a rating writes it under the library operations lock, reading the value before and after, as a favorite does, and reports whether it changed.
- Item reads, `POST /api/library/item` and `POST /api/library/query`, send `rating` in stars when the item is rated, from `ToItem`.
- The library stats read counts the rated items in its one pass.

**Traps**

- No schema version after 3 has shipped: v0.14.0 shipped 2 and v0.14.1 shipped 3 (measured). A catalog already at the version before, such as a development server's, would fail `HasRequiredCatalogSchema` and be moved aside as damaged if that version gained the column, so the column takes its own step.
- `UpgradeSchema2To3` runs `SortIndexesSql`, the constant `WriteEmptyDatabase` runs for a new catalog, so adding an index to it would change the shipped step and break upgrading a schema-2 catalog, which doesn't have a newer index's column yet.
- `LibraryCatalogMigrationTests` compares an upgraded catalog with a new one through `CatalogSeedTests.DescribeSchema`, column by column in order and index by index, so the new column is last in the new catalog's table too.
- `OlderSchemaVersions()` covers every version from 2 to the one before current, so `CatalogSeed` needs tables for the version before and for the new version.
- `ListPageSql` and the item readers read columns by position.
- Adding the column costs no space, and rating all 49,000 items of a synthetic catalog added about 0.3 MB (measured).
- `ToItem` leaves `peakDb` out when there is none.
- `ReadStatsGroups` is one `GROUP BY source_id, media_type` pass behind `GET /api/library/stats`.
- Backups of the previous schema version stay in `backups/`, untrimmed, after an upgrade.

**Acceptance**

- A catalog at each older version opens upgraded and imports upgraded with the rating column, and matches a new catalog's schema, in the catalog upgrade tests.
- The 2→3 step runs its own index SQL, not the constant a new catalog runs, checked by reading it, and a schema-2 catalog still upgrades, in the catalog upgrade tests.
- Setting, changing, and clearing a rating stores it, and setting the same value again reports no change, in server tests of setting a rating.
- Item reads send `rating` in stars for a rated item and leave it out for an unrated one, in server tests of both reads.
- Library stats count the rated items, in server tests of library stats.
- `dotnet test ReelRoulette.sln` passes.

#### Contract slice

**Scope**

- `POST /api/rating` takes `itemId`, the item's catalog id as `POST /api/favorite` takes it, `rating`, in stars, or null to clear, and `clientId`.
  - It answers 400 for an empty item id or a rating that isn't a multiple of 0.5 from 0.5 to 5, and 404 for an item that isn't in the library.
  - It answers with the item's id, its rating, and the revision of the event it published, as the favorite route does.
- It publishes `itemRatingChanged` only when the rating changed, with `itemId`, `path`, `rating`, `previousRating`, and the request's `clientId`, no rating being null.
- The library stats response carries the rated count.
- `LibraryProjectionItem` names `rating`, sent only for a rated item, and the fields the server always sends that it doesn't name yet: `fullPath`, `isFavorite`, `isBlacklisted`, `playCount`, `fingerprintAlgorithm`, `fingerprintVersion`, and `tags`.
- `LibraryProjectionItem` also names `hasAudio`, sent once the loudness scan has looked at a video: false for a file without an audio track or one whose track the scan measured as digital silence, and true otherwise.
- OpenAPI, the generated WebUI types, and `docs/api.md`, which describes the event types.

**Traps**

- `PublishItemState` in `ServerHostComposition.cs` publishes `itemStateChanged` for every favorite or blacklist request that finds its item, even when nothing changed, so other devices pop up a change that didn't happen.
- `clientId` comes from the request body, trimmed by `NormalizeOptionalIdentity`, an empty one counting as none.
- `Spec_ListsEveryMappedApiAndControlRoute` fails for a route the server maps that the spec doesn't list, and for one the spec lists that the server doesn't serve.
- `OpenApiSpec.AssertMatchesSchema` needs a payload's fields and its schema's to be the same set, so the event's schema and payload type change together, and so do the stats response's (`GetLibraryStats_ResponseMatchesSpec`).
- `LibraryProjectionItem` allows extra properties, so the fields it doesn't name are missing from the generated WebUI types, and `ItemIdContractTests.LibraryItems_CarryLoudnessAndPeak_AsTheSchemaNamesThem` reads the names it has.
- `npm run verify:contracts` only checks that the generated types match the OpenAPI file.

**Acceptance**

- The route sets, changes, and clears a rating, answers 400 and 404 as described, and publishes `itemRatingChanged` with the previous rating and the trimmed `clientId`, matching its schema, only when the rating changed, in server tests of the rating route.
- The stats response with the rated count matches its schema, in `GetLibraryStats_ResponseMatchesSpec`.
- `LibraryProjectionItem` names `rating`, `hasAudio`, and the fields the server always sends, in a contract test reading its names.
- `npm run verify:contracts` passes, and `docs/api.md` describes the route, the event, and the fields, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- The rating control in the Current file section, as the Decisions describe, on its own line under the path, shown only while the section shows its stats rows.
- A new value shows at once. A click, tap, or drag sends it when it is set; arrow-key steps are sent once the keys pause, when focus leaves the control, or when the item changes, so stepping from 1 to 4 stars sends one request.
- While the control has focus, its keys stay its own, so the left and right arrows change its rating instead of going to the previous or next item.
- A rating goes to the item it was set on, even when another item plays before it is sent.
- A request that fails puts the rating back and shows "Rating update failed: {error}" in the in-app notice, or "Rating update failed ({status})." when the server refuses it, as a favorite's failure does.
- `itemRatingChanged` is registered with the event stream. It updates the control, unless a change made here is still waiting to be sent, and reloads the Stats tab as the favorite event does.
- The rating popups as the Decisions word them: Your actions with the key `rating`, so a second rating replaces the first, and Other devices for an event whose `clientId` isn't this device's, or that has none, with the file name left out of `last.log`.
- The Rated card after Blacklisted, and the Settings tab's Other devices description naming rating changes.

**Traps**

- The Stats tab has no control today. `fileRows()` in `src/stats/statsModel.ts` builds plain-text rows, so the rating needs its own markup in `FileStats` (`src/ui/StatsTab.tsx`).
- In `src/stats/statsTab.ts` the view's `file` is null with nothing playing, and its `rows` are null for a file the server no longer has, while the server is held back or asks for pairing, and until the playing item's read arrives.
- `toggleFlag` in `src/playback/player.ts` changes nothing until the server answers, so nothing in the app yet shows a value before its request lands.
- The `itemStateChanged` handler in `src/playback/player.ts` words its Other devices popup from the favorite and blacklist flags alone, with the key `sync:{itemId}`.
- `src/events/sseClient.ts` listens only to the event types in the handlers `src/state/serverConnection.ts` passes it, and moves the resume revision on only for them.
- The Stats tab reloads through `createCoalescedRefresh` (`src/stats/coalescedRefresh.ts`), 250 ms after the first request of a burst.
- WebUI Keyboard Shortcuts binds Left and Right to the previous and next item.
- The panel's resize handle (`PanelHandle` in `src/ui/Panel.tsx`) takes the arrow keys, Home, and End and gives `aria-valuetext`, and the Settings tab's sliders are named by their label alone, with the value as shown as their value text.
- The WebUI loads the full Material Symbols font, so `star` and `star_half` need no font change, and `.material-symbol-icon.is-filled` uses optical size 20.
- Interactive elements are 44 px on every pointer; on a phone on its side (`short-screen`) text buttons shrink to 38 px and icon buttons keep their size.

**Acceptance**

- A click or tap on a star's left or right half sets half a star less or the whole star, a drag sets the value on release, the keys step, clear, and set as described, and Clear clears, with the slider's value and value text following, in Stats screen tests of the rating control.
- The control is absent with nothing playing, for a file the server no longer has, while the server is held back or asks for pairing, and while the item loads, in Stats screen tests of each state.
- Arrow-key steps send one request once they pause or focus leaves, and a rating set before another item plays goes to the item it was set on, in Stats screen tests.
- While the control has focus, the left and right arrows change its rating and don't go to the previous or next item, in keyboard tests of the rating control.
- A failed request puts the rating back and shows its notice, in Stats screen tests.
- A rating change pops up as Your actions on this device and as Other devices for another device's event or one without a client id, and a second rating replaces the first popup, in WebUI tests of the rating popups.
- Another device's rating updates the control, in Stats screen tests.
- The Rated card shows the stats' rated count, in Stats screen tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

#### Release checks

- Manual: On the iPad and an Android phone, setting half-star ratings by tapping each half and by dragging, and clearing one, works, and a second device shows each change with its Other devices popup.
- Manual: In a desktop browser, hovering the stars previews the rating and a click sets it.

#### Not included

- A rating on the player, which is WebUI Player Rating.
- Rating keys, which is WebUI Player Rating.
- Filtering and sorting by rating, which is Rating Filter and Sort.
- Weighting random picks by rating, which is Random Pick Options.
- Ratings on library tiles, which is WebUI Ratings on Tiles.
- Rating several items at once, which is WebUI Multi-Select and Bulk Actions.
- Ratings in duplicate review, which is Admin Refresh, Backup, and Duplicate Review.
- Reading ratings from media files and writing them back, which is File Metadata Sync.
- Ratings kept per account, which is Per-Account Library Data.

### M12k3 - WebUI Player Rating

- **Status**: ⏳ Planned
- **Goal**: The player shows the playing item's rating, and the player and rating keys set it without opening the Stats tab.
- **Depends on**: Item Ratings, whose rating route, event, and star control it uses, and WebUI Keyboard Shortcuts, whose shortcut handling the rating keys use and whose shortcut reference lists them.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The player shows the playing item's rating and sets it by mouse, touch, and keyboard.
- Before the app is built, its design is settled in the mockup and approved on a desktop browser, the iPad, and an Android phone: where it sits on the player, how it shows the rating at a glance, how it sets one by mouse, touch, and keyboard, and how it looks at phone widths and on a phone on its side.
- It sets a rating as Item Ratings' control does, with the same popups.
- It shows and hides with the player's other controls.
- Rating keys set the playing item's rating as Item Ratings' control does, with its popups, and do nothing while nothing plays:
  - Shift+1 to Shift+5 set 1 to 5 stars, and Shift+0 clears the rating.
  - `-` and `=` step the rating down and up by half a star.
  - Shift and a digit are matched by the key's position (`event.code`), since Shift changes the character a digit key gives.
- The shortcut reference lists the rating keys, and the mockup's reference shows them.

#### Traps

- The player's top corners hold the bell at the left, and the panel button, favorite, and blacklist at the right, with the panel button at the left beside the bell while the panel is on the left, each 44 px (`.overlay-btn` in `src/styles.css`).
- The player's indicator sits between them with `max-width: calc(100% - 336px)`, and on a player narrower than 600 px (`NARROW_PLAYER_BELOW_WIDTH` in `src/panel/panelHost.ts`) it drops below them.
- On a 360 px phone about 144 px is left between the two corner groups, which the indicator uses (inferred).
- The swipe gestures skip touches inside `#overlay-controls` (`src/ui/Player.tsx`), so a control there doesn't trigger next or previous.
- The Stats tab is one tap away, through the header's file name.
- With Shift held, a digit key's `event.key` is the shifted character, such as "!" on a US layout (inferred).
- WebUI Keyboard Shortcuts binds 1 to 5 to the panel tabs, so Shift and a digit must not also open a tab (inferred).

#### Acceptance

- The player shows the playing item's rating and sets it as the approved mockup shows, by mouse, touch, and keyboard, with Item Ratings' popups, in Player screen tests.
- The player's rating follows a rating set in the Stats tab or on another device, in Player screen tests.
- It shows and hides with the player's controls, in Player screen tests.
- Shift+1 to Shift+5 set 1 to 5 stars, Shift+0 clears the rating, and `-` and `=` step it by half a star, on the playing item with Item Ratings' popups, and they do nothing while nothing plays, in keyboard tests per binding.
- The shortcut reference lists the rating keys, in the test that the reference lists every binding.
- The mockup shows the player's rating as approved and matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

#### Release checks

- Manual: On the iPad and an Android phone, in both orientations, the player's rating shows the playing item's rating and sets one by touch.

### M12k4 - Rating Filter and Sort

- **Status**: ⏳ Planned
- **Goal**: Browse and random play can be limited to items rated at or above a minimum, and the Library tab sorts by rating.
- **Depends on**: Item Ratings.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The minimum rating keeps items rated at or above it. An Include unrated option, off by default, keeps unrated items too.
- A stored preset without the filter's fields reads them as no minimum and Include unrated off, as Browser-Playable Filter's field reads as off.
- Unrated items sort last in both directions of the rating sort.
- Rating cases for preset matching, the tile effect rule, and the sort direction labels go in `preset-filter-equality.json`, `library-tile-effect.json`, and `sort-direction-labels.json`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | The minimum rating and Include unrated in the FilterState schema, applied by the server in the list query, its counts, and random selection, and a rating sort with its indexes. |
| WebUI | ⏳ Planned | The minimum rating in the Filter tab and the Filters line, saved in presets and compared in preset matching, the rating sort, and rating changes patching or reloading the loaded window. |

#### Contract slice

**Scope**

- `minRating`, in stars or null for no minimum, and `includeUnrated` fields in the FilterState schema, applied by the server in the list query, its counts, and random selection.
- A shared fixture locks how the server's filter parser and the WebUI read `minRating`, such as a number or a string, a value between half steps, one out of range, and null, and Core and WebUI tests read it.
- A Rating sort mode, with unrated items last in both directions.
- The sort's two indexes, one per direction, come with the catalog's move to the next schema version, with its upgrade step from the version before, and go in their own constant.
- OpenAPI and generated WebUI types.

**Traps**

- FilterState goes through `FilterStateModel` (`FilteringContracts.cs`), `LibraryListFilterParser`, and `AppendFilter` in `LibraryCatalogListQuery.cs`, which the list query, its counts, and random selection share.
- `FilterStateSchema_NamesEveryFieldTheParserReads` fails when the parser reads a field the schema doesn't name.
- `items.rating >= {min}` leaves unrated items out by itself (inferred).
- Counts are cached by the WHERE text and its values until the next catalog write.
- `BuildOrderBy` sorts the other modes by `COALESCE({column}, 0)` and then the name key, which would put unrated items first ascending and last descending (measured), so unrated last in both directions needs its own expression for ascending.
- Each sort index's expression must match the ORDER BY. SQLite scans a `COALESCE(rating, 0) DESC, file_name_sort_key` index for that sort, as `EXPLAIN QUERY PLAN` shows (measured).
- A rating sort index cost about 2.4 MB on a synthetic 49,000-item catalog with 40-byte sort keys (measured).
- Item Ratings gives the 2→3 step its own index SQL, so the new indexes go in their own constant, run for a new catalog and by the new step.
- `LibraryListSort` rejects an unknown mode with a message that lists the modes (`LibraryOperationsService.cs`).

**Acceptance**

- With a minimum rating, the list query, its counts, and random selection keep only items rated at or above it, plus unrated items with Include unrated, and without one, results are unchanged, in server tests for the filter in the list query, counts, and random selection.
- A stored preset without the fields filters with no minimum and without Include unrated, in server tests of a stored preset without them.
- The server's parser reads `minRating` as the shared fixture says, in Core tests of the fixture.
- The rating sort orders by rating in both directions with unrated items last and reads its index, in server tests of the sort and its query plan.
- A catalog at each older version opens upgraded and imports upgraded with the sort indexes, in the catalog upgrade tests.
- OpenAPI and the generated WebUI types carry the fields and the sort mode, in contract tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- The minimum rating and Include unrated in the Filter tab's General section, designed in the mockup and approved, saved in presets and compared in preset matching.
- The Filters line names the minimum rating and whether unrated items are included.
- Rating in the Library tab's sort, with its direction labels.
- A rating change kind in the tile effect rule, from `itemRatingChanged`'s rating and previous rating:
  - Under a minimum rating, a loaded tile reloads when its rating falls below the minimum, and an item that isn't loaded reloads when its rating reaches it.
  - Under the rating sort, a rating change reloads.
  - Otherwise a rating change patches.
- The WebUI reads `minRating` as the shared fixture says.

**Traps**

- `serializeFilterStateForApi`, `filterStateFromApiObject`, and `filterStatesEqualForPresetMatch` in `src/filter/filterStateModel.ts` write, read, and compare FilterState, and a field the serializer writes joins preset matching.
- Core's filter comparison, behind the preset routes' refusal of a filter another preset holds, reads `shared/fixtures/preset-filter-equality.json` too, so the rating cases need it to compare the fields.
- `libraryQueryTileEffect` in `src/library/libraryQuerySession.ts` is locked to `library-tile-effect.json`.
- The WebUI remembers its sort per device and checks it against its list of sort modes.

**Acceptance**

- The minimum rating and Include unrated are saved in presets and compared in preset matching, in tests of `preset-filter-equality.json`.
- The Filters line names them, in Library screen tests.
- The rating sort shows its direction labels, in tests of `sort-direction-labels.json`.
- A rating change patches or reloads as the rule says, in tests of `library-tile-effect.json`.
- The WebUI reads `minRating` as the shared fixture says, in WebUI filter model tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Release checks

- Manual: In the WebUI, a minimum rating with and without Include unrated limits browse and random play, the rating sort orders the library, and a preset saved with a minimum rating keeps it.

#### Not included

- Weighting random picks by rating, which is Random Pick Options.

### M12k5 - Date Added and Date Filters

- **Status**: ⏳ Planned
- **Goal**: The catalog records when each file was added, and browse and random play can filter and sort by the date added and the date created.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- A file's date added is when the refresh's source stage or a source import first inserts its row.
- A file already in the catalog when it upgrades takes its modified time as its date added.
- Importing a source gives all its files the same date added, and their date created tells them apart.
- A file's date created is its modified time (`last_write_time_utc`), which is what "created" usually means for media files.
- The API, the WebUI, and the fixtures call it `DateCreated`, and the code's comments say it is the modified time.
- The Library tab's sort offers Date added and Date created: `DateAdded` sorts by the date added, and a new `DateCreated` sorts by the modified time, which `DateAdded` reads today.
- Two filters, Added in and Created in, can be used together. Each is Last 7 days, Last 30 days, Last 90 days, This year, or a custom range of two dates from the device's date picker.
- A filter stores the choice, never resolved dates, so a preset with Last 30 days always means the last 30 days, and preset matching compares the choice.
- The server resolves a range in its own time zone, to whole days: Last {N} days is today and the {N − 1} days before it, This year starts on 1 January, and a custom range covers its first and last days.
- A custom range needs both dates, and one that ends before it starts is flagged with the field validation pattern.
- A file without a date is outside every range of that date.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | Added in and Created in in the Filter tab with the custom range's date picker, their Filters line wording, and Date added and Date created in the sort list, approved on a desktop browser, the iPad, and an Android phone. |
| Server | ⏳ Planned | The date added column in a new catalog schema step with its sort indexes, the modified-time sort indexes renamed for Date created, and the date added written when a row is inserted. |
| Contract | ⏳ Planned | `addedIn` and `createdIn` in the FilterState schema, applied by the server in the list query, its counts, and random selection, the `DateAdded` and `DateCreated` sorts, a shared fixture for reading the fields, OpenAPI, the generated WebUI types, and `docs/api.md`. |
| WebUI | ⏳ Planned | Added in and Created in in the Filter tab and the Filters line, saved in presets and compared in preset matching, and the two date sorts with their direction labels. |

#### Mockup slice

**Scope**

- In `docs/mockups/reelroulette/`, Added in and Created in in the Filter tab, each with its choices and the custom range's From and To from the device's date picker, flagged with the field validation pattern when the range ends before it starts.
- Where they sit in the Filter tab, in the General section or a section of their own, is settled in the mockup.
- The Filters line's wording for each choice is settled in the mockup.
- Date added and Date created in the Library tab's sort list, in place of today's Date added, with their direction labels.
- The mockup's items get a date added and a date created from each item's id, so the filters and sorts work on them.
- Any new icon goes in the mockup's icon subset.
- Before the app is built, the user approves the design on a desktop browser, the iPad, and an Android phone, including the date picker on each.

**Traps**

- The mockup's items have no dates, and its Date added sort uses a key made up for it (`layout.src.html`).
- Drawing the dates from `statRand` would shift every random value drawn after them (inferred).
- No date input exists in the WebUI or the mockup (measured).
- `<input type="date">` opens each platform's own picker, so its look can only be judged on the devices (inferred).
- `check.mjs` runs the pages in happy-dom, with no layout.
- `calendar_today`, `date_range`, `calendar_month`, and `event` aren't in the mockup's icon subset, which `build_font.py` cuts from its `ICONS` list (measured).
- The Filter tab's General section holds Basic Filters, Media Type, Sources, Audio Filter, and Duration Filter, and Browser-Playable Filter and Rating Filter and Sort add to it.
- `renderFilterSummary` builds the mockup's Filters line (`layout.src.html`).

**Acceptance**

- The mockup shows Added in and Created in, their Filters line wording, and both date sorts as the user approved them in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.

#### Server slice

**Scope**

- The catalog moves to the next schema version, with its own upgrade step from the version before that adds a nullable `date_added_utc` column last in `items`, sets it to each item's `last_write_time_utc`, and adds the date added sort indexes, one per direction, on `COALESCE(date_added_utc, 0)` and the name key. A new catalog has the same.
- The step renames the modified-time sort indexes from `idx_items_date_added_asc` and `idx_items_date_added_desc` to `idx_items_date_created_asc` and `idx_items_date_created_desc`.
- The new and renamed indexes go in a constant of their own, run for a new catalog and by the new step.
- `InsertItem` writes the date added, the time the row is inserted, for the refresh's source stage and for source import.

**Traps**

- No schema version after 3 has shipped: v0.14.0 shipped 2 and v0.14.1 shipped 3 (measured). A catalog already at the version before, such as a development server's, would fail `HasRequiredCatalogSchema` and be moved aside as damaged if that version gained the column, so the column takes its own step.
- Item Ratings gives the shipped 2→3 step its own index SQL, so a change to the indexes a new catalog gets can't change that step.
- `ItemColumnsBySchemaVersion` needs the column for the new version.
- `OlderSchemaVersions()` covers every version from 2 to the one before current, so `CatalogSeed` needs tables for the version before and for the new version.
- `LibraryCatalogMigrationTests` compares an upgraded catalog with a new one through `CatalogSeedTests.DescribeSchema`, column by column in order and each index's SQL as text, so the column is last in a new catalog's table and each index's SQL is the same in both.
- SQLite can't rename an index, so renaming one drops and creates it.
- On a copy of the developer's 49,228-item catalog the step took about 590 ms in one transaction, and the catalog grew from 94.2 to 100.9 MB, 3.06 MB per new index (measured).
- Every new row goes through `InsertItem` (`LibraryCatalogSession.cs`), which names its columns. The refresh's source stage calls it through `InsertDiscoveredItem` (`RefreshPipelineService.cs`), and source import through `ImportSourceFolder`.
- The refresh keeps a file's row when it moves or is renamed within one source, matched by a ready fingerprint, the same media type and size, and the same fingerprint (`PersistMovedItem` and `UpdateItemIdentity`), so the file keeps its date added.
- A move to another source, or a move of a file whose content also changed, is a delete and an insert, so the file gets a new date added.
- Every item in the developer's catalog has a ready fingerprint (measured).
- Source import inserts rows with no modified time or size and starts no refresh, so an imported file has no date created until the next refresh's fingerprint stage writes it.
- No client calls `POST /api/sources/import` yet, and Admin Source Management is the first.
- Catalog transfer and backup restore upgrade an older catalog through the same steps, so they get the backfill.
- A refresh writes a file's modified time again whenever it changes (`SetLastWriteTime`), so a file's date created moves when the file is modified.
- The developer's modified times cluster on the days batches were copied, 12,042 files on one day in 2018 and 6,161 on one day in June 2026, so after the step a file's date added is often its copy day too (measured).

**Acceptance**

- A catalog at each older version opens upgraded and imports upgraded with the column set to each item's modified time and both pairs of indexes, and matches a new catalog's schema, in the catalog upgrade tests.
- A file the refresh's source stage finds and a file a source import adds get the time they were inserted as their date added, and a file moved within a source keeps its date added, in server tests of the source stage and of source import.
- `dotnet test ReelRoulette.sln` passes.

#### Contract slice

**Scope**

- `addedIn` and `createdIn` in the FilterState schema, each null for no limit, a preset (`last7Days`, `last30Days`, `last90Days`, or `thisYear`), or a custom range of `from` and `to` dates, applied by the server in the list query, its counts, and random selection.
- The server resolves each range as the Decisions describe, with a clock and a time zone that tests can set.
- A date condition is written on `COALESCE({column}, 0)`, the expression its sort index has.
- `DateAdded` sorts by the date added and `DateCreated` by the modified time, each reading its own index in both directions.
- `TryParseSort`'s message for an unknown mode lists `DateCreated`.
- A shared fixture under `shared/fixtures/` locks how the server's filter parser and the WebUI read `addedIn` and `createdIn`: each preset, a custom range, a range that ends before it starts, an unknown preset, a date that isn't one, and null. Core and WebUI tests read it.
- OpenAPI, the generated WebUI types, and `docs/api.md`, which describes the fields, the time zone and whole days, and both sorts.

**Traps**

- FilterState goes through `FilterStateModel` (`FilteringContracts.cs`), `LibraryListFilterParser`, and `AppendFilter` in `LibraryCatalogListQuery.cs`, which the list query, its counts, and random selection share.
- `FilterStateSchema_NamesEveryFieldTheParserReads` finds the fields the parser reads by the text `(element, "name"`, so a field with fields of its own is read through a helper called that way.
- `AppendFilter` is static and has no clock, and `QueryRandomCandidates` builds its own `LibraryListRequest` (`LibraryCatalogSession.cs`), so the clock and the time zone have to reach both (inferred).
- Nothing in the server or the WebUI handles time zones today, and only backup file names and log timestamps use local time (measured).
- A date condition uses an index only when it is written on the index's expression: on the developer's catalog a 30-day count on `COALESCE(items.last_write_time_utc, 0)` took 0.1 ms, and on the plain column, which scans the table, 10.8 ms (measured).
- Random selection with a date condition was never slower than without one (measured).
- The catalog has no `sqlite_stat1`, and without it a play-count sort with a 7-day condition walked the whole play-count index in 21.3 ms, and a name sort with a 365-day condition took 62.3 ms at offset 10,000 (measured).
- Counts are cached by the WHERE text and its values until the next catalog write, 64 entries at most, all dropped when full. A bound that changed with every request would miss on every page and move the range between pages, while a bound at the start of a day stays the same all day (inferred).
- `COALESCE` reads a missing date as 0, so a range leaves out files without that date.
- Of the developer's 49,228 files, 140 were modified in the last 7 days, 475 in the last 30, 1,449 in the last 90, and 10,786 this year (measured).
- `BuildOrderBy` sorts `DateAdded` by `COALESCE(items.last_write_time_utc, 0)` today, with the indexes `idx_items_date_added_asc` and `idx_items_date_added_desc`.
- The sort modes are the `LibraryListSort` names, which `TryParseSort` (`LibraryOperationsService.cs`) matches ignoring case, and its message for an unknown mode lists them by hand.
- A device that remembers the `DateAdded` sort keeps it, and right after the upgrade it orders as before, since the date added starts as the modified time (inferred).
- `npm run verify:contracts` only checks that the generated types match the OpenAPI file.

**Acceptance**

- Each preset and a custom range of Added in and Created in keep only files whose date falls in the range, each alone and both together, and without them results are unchanged, in server tests for the fields in the list query, its counts, and random selection with a set clock and time zone.
- Last {N} days, This year, and a custom range resolve to whole days in the server's time zone, in Core tests of range resolution.
- A stored preset without the fields filters with no date limit, in server tests of a stored preset without them.
- The server's parser reads the fields as the shared fixture says, in Core tests of the fixture.
- `DateAdded` and `DateCreated` order by their dates in both directions and read their indexes, and a date condition reads its index, in server tests of the sorts and their query plans.
- OpenAPI and the generated WebUI types carry the fields and the sorts, in contract tests, and `docs/api.md` describes them, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- Added in and Created in in the Filter tab, as the approved mockup places them, each with None, the four presets, and Custom range, whose From and To take the device's date picker (`<input type="date">`).
- With Custom range chosen, an empty date or a range that ends before it starts is flagged with the field validation pattern and holds Apply, Add Preset, and Update, as a duration that isn't valid does.
- Both are saved in presets and compared in preset matching by the choice, never resolved dates, with cases in `preset-filter-equality.json`.
- The Filters line names each as the mockup words it.
- Date added and Date created in the Library tab's sort, each with "Newest → Oldest" and "Oldest → Newest" in `sort-direction-labels.json`.
- The WebUI reads the fields as the shared fixture says.

**Traps**

- `serializeFilterStateForApi`, `filterStateFromApiObject`, and `filterStatesEqualForPresetMatch` in `src/filter/filterStateModel.ts` write, read, and compare FilterState, and a field the serializer writes joins preset matching.
- Core's filter comparison (`FilterStateComparison.cs`), behind the preset routes' refusal of a filter another preset holds, reads `shared/fixtures/preset-filter-equality.json` too, so the date cases need it to compare the fields.
- The Filter tab's fields with problems go through `filterFieldProblems` and `FilterField` (`src/filter/filterDialogModel.ts`).
- `filterSummaryParts` (`src/filter/filterSummaryModel.ts`) builds the Filters line in an order its comment documents.
- The sort modes are `LIBRARY_SORT_MODES` in `src/library/libraryBrowseModel.ts`, and the sort's options are written out again in `src/ui/LibraryOverlay.tsx`.
- `libraryBrowseModel.test.ts` requires every sort mode in `sort-direction-labels.json` in both directions.
- The WebUI remembers its sort per device and drops a remembered mode that isn't in its list, falling back to Name ascending (`isRememberedSort` in `src/library/library.ts`).
- Dates change only in a refresh, and a finished refresh reloads the loaded window once, so the tile effect rule (`library-tile-effect.json`) needs no date change kind (inferred).
- A rolling range moves with the clock without an event, so a window loaded before midnight keeps its tiles until it next reloads (inferred).

**Acceptance**

- Added in and Created in are saved in presets and compared in preset matching by the choice, so Last 30 days matches Last 30 days and not the same days as a custom range, in tests of `preset-filter-equality.json`.
- A custom range with an empty date, or one that ends before it starts, is flagged and holds Apply, Add Preset, and Update, in Filter screen tests.
- The Filters line names each choice as the mockup words it, in Library screen tests.
- Date added and Date created show their direction labels, in tests of `sort-direction-labels.json`.
- The WebUI reads the fields as the shared fixture says, in WebUI filter model tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check of the date picker on the user's phone.

#### Release checks

- Manual: In the WebUI, Added in and Created in limit browse and random play, a preset saved with Last 30 days keeps it rolling, and Date added and Date created order the library.

#### Not included

- Showing a file's dates in the Stats tab.
- A file's real creation time, from the file system or its metadata.
- Ranges in the device's own time zone.
- Favoring newly added or newly created files in random picks, which is Random Pick Options.

### M12k6 - Random Pick Options

- **Status**: ⏳ Planned
- **Goal**: Random picks combine options, set per device in a new Random tab, in place of the five randomization modes, with the server deciding the picks.
- **Depends on**: Item Ratings, whose rating Favor higher rated reads, Date Added and Date Filters, whose date added Favor newly added reads, WebUI Player Controls, whose Random button gets Random behavior, and WebUI Keyboard Shortcuts, whose panel tab keys it renumbers.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- One Random, with options that combine, replaces the five randomization modes: Shuffle, Spread by folder, Spread by tags, Favor less played, Favor newly added, Favor newly created, and Favor higher rated. With every option off, picks are pure random.
- Each old mode is a combination: Pure random has every option off, Smart shuffle is Shuffle, Weighted random is Favor less played, Spread is Spread by folder, and Weighted with spread is Favor less played with Spread by folder.
- The defaults are Shuffle on and Spread on by folder only.
- The server decides the picks. The WebUI only sets the options, kept per device and not in presets, and sends them with each pick.
- A pick goes in this order: the filter decides the eligible files, Shuffle leaves out the files picked within its memory window, Spread by folder leaves out the files of recently used folders, the Favor options and tag spread weigh the rest, and one weighted roll picks.
- Shuffle: nothing repeats until every eligible file has played, or until its memory window has passed.
- Remember plays for, under Shuffle, is 1 day, 7 days, 30 days (the default), 90 days, or until everything has played. It is rolling: a file can be picked again that long after it was last picked on this device.
- The server keeps in memory, per device by `clientId`, each file picked on that device and when.
- A pick older than the window drops out, and a change to the eligible set or to the options keeps the rest.
- Every random pick goes into the memory, whether Shuffle is on or not, and a server restart clears it.
- When every eligible file has been picked within the window, those files start a new cycle and their picks are cleared, but the most recent pick is never picked again right away.
- Reset now clears this device's shuffle memory at once.
- Spread by folder skips the folders of the last 16 picks, or of half the eligible set's folder count when that is smaller, and every other file is equally likely.
- A folder is the file's immediate parent.
- When the skipped folders hold every file left to pick, the skip is ignored.
- Spread by tags is All tags, where a file sharing tags with recent picks is less likely and rarer tags count for more, or By category, where only the chosen categories' tags count.
- "No tags" counts as a tag of its own, so untagged files are spread too, and under By category a file with none of the chosen categories' tags counts as having no tags.
- The chosen categories are kept by id, so a renamed category stays chosen.
- Favor newly added and Favor newly created each give recently added or created files a fixed share of the picks, newer ones more likely.
- With both on, each takes its own share, and when no such file is left to pick, the pick is as usual.
- Favor less played and Favor higher rated multiply each file's weight: less played by today's Weighted random weighting of play count and last played, and higher rated by the rating, with an unrated file weighted as 2.5 stars.
- The shares, how long a file counts as recent, how strongly less played and the rating pull, and how strongly and over how many picks tag spread pulls are settled in the Mockup slice and recorded here.
- The Random tab sits between the Filter and Tags tabs, with the dice icon (`casino`).
- It holds the cycle card, every option, Spread's folder and tag choices with the category list, Remember plays for, Reset now, and Random behavior.
- Options apply at once, with no Apply, and nothing goes in the Settings tab.
- The cycle card, at the top of the Random tab and styled like the Stats tab's cards, shows this device's current Shuffle cycle: the files picked this cycle, those eligible now under the current filter, those remaining until the cycle restarts, and the memory window.
- Picked this cycle counts the eligible files picked within the window, so picked and remaining add up to eligible.
- The cycle card opens and closes, is open by default, and keeps that state per device.
- Each pick's response carries the cycle card's numbers, and opening the Random tab fetches them once.
- Random behavior decides where a Random pick goes in the history: Jump, the default, adds it at the end, and Insert puts it right after the current item, with the plays ahead kept after it. It applies to the player's Random button and to R, and is kept per device.
- The Library tab's randomization dropdown goes.
- A Random line under the Filters line, in its style, such as "Random: Shuffle · Spread by folder", always shows, opens the Random tab as the Filters line opens the Filter tab, and hides with the Filters line when the controls collapse.
- The panel tab keys are 1 to 6 in tab order: Library, Filter, Random, Tags, Stats, and Settings. T and S still open Tags and Settings.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | The Random tab with the cycle card, every option, Remember plays for, Reset now, and Random behavior, the Random line, the Library tab without the randomization dropdown, the renumbered tab keys, and the settled strengths, approved on a desktop browser, the iPad, and an Android phone. |
| Engine | ⏳ Planned | The options, Shuffle's rolling memory and cycles, folder and tag spread, the Favor shares and weights, and the cycle numbers in Core, with tests whose randomness is seeded or scripted. |
| Contract | ⏳ Planned | The options in place of `randomizationMode` on `POST /api/random`, the cycle numbers in its response, the cycle and reset routes, the candidate read with both dates, the rating, and item tags, state per device, the pick log line, OpenAPI, the generated WebUI types, and `docs/api.md`. |
| WebUI | ⏳ Planned | The Random tab with its cycle card and Random behavior, the Random line, the options kept per device and sent with each pick, the randomization dropdown removed, and the tab keys renumbered. |

#### Mockup slice

**Scope**

- In `docs/mockups/reelroulette/`, the Random tab between Filter and Tags with the `casino` icon, holding the cycle card, Shuffle with Remember plays for and Reset now under it, Spread by folder, Spread by tags with All tags, By category, and the category list, the four Favor options, and Random behavior, as the Decisions describe.
- The cycle card's look, and how it shows while Shuffle is off, are settled in the mockup.
- The Random line under the Filters line, its wording for each combination of options, every option off included, and its opening the Random tab.
- The Library tab without the randomization dropdown, at every width and on a phone on its side.
- The panel tab keys 1 to 6, and the shortcut reference's rows for them.
- `casino` and any other new icon in the mockup's icon subset.
- The mockup's picks stay uniform, since its 72 items are too few to show the options' effect.
- The strengths the Decisions leave open are settled from simulations of each candidate on a copy of the developer's catalog, showing the share of picks each kind of file gets, and recorded in the Decisions.
- Before the app is built, the user approves the design on a desktop browser, the iPad, and an Android phone.

**Traps**

- The mockup's randomization dropdown is `#lib-mode` in `.lib-pair` (`layout.src.html`), and the page script restores and saves it, so removing only its markup makes the script throw.
- On a phone on its side, the mockup's Library tab controls are a two-column grid, which the dropdown's removal leaves with three items.
- `showTab` in `layout.src.html` names the five tab pages.
- WebUI Keyboard Shortcuts' mockup binds 1 to 5 (`TAB_KEYS`), and its shortcut reference has 17 rows.
- `renderFilterSummary` builds the mockup's Filters line (`#lib-filters`), which the controls' collapse hides.
- The mockup's `pickRandom` picks uniformly from the filtered items, and its 72 items are `ITEMS` in `layout.src.html`.
- WebUI Player Controls adds `casino` to the mockup's icon subset for its Random button.
- On the developer's library, a boost for new files of ×4 at day 0, halving every 14 days, gave the 184 files under 14 days old 1.3% of picks, while after a 5,000-file import ×4 gave the import 28% of picks on day one and ×10 gave it 49% (measured), so newness takes a fixed share rather than a multiplier.
- Six 44 px tabs and Close need 336 px, and the side panel's 360 px minimum leaves 344 px (inferred from `src/styles.css`).
- `check.mjs` runs the pages in happy-dom with no layout, so the tab row's fit can only be judged on the devices.

**Acceptance**

- The mockup shows the Random tab, the cycle card, the Random line, and the Library tab without the randomization dropdown as the user approved them in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.
- The settled strengths, with the simulations they came from, are recorded in the Decisions, checked by reading them.

#### Engine slice

**Scope**

- In `ReelRoulette.Core`'s randomization, an options type replaces `RandomizationModeValue`, and each pick follows the order the Decisions give.
- Shuffle's memory per device holds each picked file's id and pick time, applies the window on each pick, drops picks past it, starts a new cycle for the eligible files once every one has been picked within the window, and leaves the most recent pick out of the new cycle's first pick.
- Spread by folder with its skip of recent folders, and Spread by tags with All tags, By category, and "no tags" as a tag.
- The Favor shares and weights, with the strengths the Mockup slice settles.
- The cycle numbers: picked this cycle, eligible now, remaining, and the window.
- Each file's folder, its tags, and each tag's rarity are kept per eligible set rather than worked out on every pick.
- Tests set every draw with a seeded or scripted `Random` and test the weights as exact values.

**Traps**

- The modes are PureRandom, WeightedRandom, SmartShuffle, SpreadMode, and WeightedWithSpread (`RandomizationModeValue` in `RandomizationContracts.cs`), dispatched in `SelectItem` (`RandomSelectionEngineCore.cs`).
- `SelectWeighted` weighs each item by `playScore * 0.6 + recency * 0.8`, with a floor of 0.05, where `playScore` is `1 / (1 + plays)` and `recency` grows with the days since the last play, up to 30.
- Today's Spread multiplies the weight of each file in a folder used in the last 16 picks by `1 / (1 + 1.5 × uses)`, so big folders keep their share: in 20,000 simulated picks on the developer's library the biggest folder took 6.5%, against 11.7% at pure random (measured).
- Skipping the last 16 folders with every other file equal gave that folder 4.2% of picks, the ten biggest folders 17.8%, single-file folders 0.3%, and no folder again within 10 picks (measured).
- With Shuffle, skipping recent folders ended a cycle with at most 10 picks in a row from one folder on the developer's presets, except where one folder held most of a preset, 71% or 95%, where every way of spreading ends with a long run from it (measured).
- Smart shuffle's bag is a shuffled queue of every eligible id, built again whenever the eligible ids or the mode change (`EnsureStateForEligibleSet`): on 1,000 items, one item leaving the set after 400 picks brought 236 repeats in the next 600 picks (measured).
- Blacklisting a file under the default filter, a refresh that adds or removes a file, a rolling date filter at midnight, and a profile switch each change the eligible set (inferred).
- At 49,179 eligible items, a Smart shuffle pick took 9.9 ms, since it builds a dictionary of every item, and a Spread pick 16.8 ms, since it works out every file's folder (measured).
- At 49,179 eligible items, every file's folder took 21 ms, grouping by folder 1.4 ms, all four Favor weights 7 ms, leaving out 5,000 picked ids 4.5 ms, tag spread's rarity and penalty 26 ms, a weighted roll 0.13 ms, and the eligible set's signature 1.7 ms (measured).
- A set of picked ids takes 132 KB per 1,000 ids (measured).
- `GetFolderKey` is the lowercased `Path.GetDirectoryName` of the path.
- In the developer's catalog 85% of eligible files have a tag, most just one, the most common tag is on 45.7% of files, and 7,234 files have none, 78% of them in one flat folder (measured).
- With All tags over the last 8 picks and untagged files left out, the untagged share of picks rose from 14.8% to 22.7% and that flat folder's from 11.7% to 17.8% (measured).
- 201 of the developer's 212 People tags have 90% of their files in one folder, so By category on People nearly repeats Spread by folder (measured).
- About 47 files are played a day on the developer's library, so a whole-library cycle would take about 3 years, while a preset's ends in days or weeks (measured).
- Shortening the window drops the older picks, so lengthening it again doesn't bring them back (inferred).
- `RandomSelectionEngineCoreTests` already sets each draw with `ScriptedRandom` and seeds the Smart shuffle tests.

**Acceptance**

- With every option off, every eligible file is equally likely, and each old mode's combination picks as the Decisions describe, in engine tests with a scripted `Random`.
- Shuffle picks no file twice within the window, starts a new cycle once every eligible file has been picked within it without picking the most recent one first, drops a pick past the window, and keeps its memory through a change to the eligible set or the options, in engine tests of Shuffle.
- Spread by folder never picks from a folder of the last 16 picks, or of half the folders when that is smaller, unless those folders hold every file left, in engine tests of folder spread.
- Spread by tags lowers files sharing tags with recent picks, rarer tags more, counts "no tags" as a tag, and counts only the chosen categories under By category, in engine tests of the weights as exact values.
- Favor newly added and Favor newly created take their shares, and Favor less played and Favor higher rated multiply the weights as settled, an unrated file as 2.5 stars, in engine tests of the shares and weights.
- The cycle numbers count the picked, eligible, and remaining files and give the window, in engine tests of the cycle numbers.
- `dotnet test ReelRoulette.sln` passes.

#### Contract slice

**Scope**

- `POST /api/random` takes the options in place of `randomizationMode`: Shuffle with its window in days, 1, 7, 30, or 90, or none for until everything has played; Spread by folder; Spread by tags, off, all tags, or by category with the category ids; and the four Favor options.
- A missing option reads as its default.
- A category id the catalog doesn't have is ignored.
- `POST /api/random`'s response carries the cycle card's numbers, in a response schema of its own, since `POST /api/play/{itemId}` answers with `RandomResponse`.
- A cycle route answers with this device's cycle numbers for a filter and the options, for the Random tab to fetch when it opens.
- A reset route clears this device's shuffle memory.
- `RandomizationModeValue` and `ParseRandomizationMode` go, and the tests that rely on Smart shuffle being the default, `FilterStateTests.PickIds` and the pick log test, follow the new defaults.
- The candidate read adds the date added, the modified time, and the rating, and tag spread reads every `item_tags` row once and keeps the eligible files' tags in memory.
- The server keeps random-pick state per `clientId` in place of the client and session, and drops a device's state once its window has emptied it.
- That fixes "Shuffle states pile up for every client session" in `ISSUES.md`.
- The pick's `last.log` line names the options in place of the mode.
- The service takes its `Random` from its constructor, so tests pass a seeded or scripted one. This replaces `TrySelectRandom_WeightedRandom_PrefersNeverPlayedItemInTheEligibleSet`, which fails about 1 run in 425, with seeded tests.
- OpenAPI, the generated WebUI types, and `docs/api.md`, which describes the options, the cycle numbers, and both routes.

**Traps**

- `RandomRequest.RandomizationMode` is a free string (`ApiContracts.cs`), OpenAPI declares it as a nullable string with no values, and `docs/api.md` never mentions it (measured).
- `ParseRandomizationMode` (`LibraryPlaybackService.cs`) reads an empty or unknown mode as SmartShuffle.
- `LibraryPlaybackService` keeps its states in `_clientRandomizationStates`, keyed by `BuildRandomizationScopeKey(clientId, sessionId)`, and never removes one.
- The WebUI keeps its session id in `sessionStorage`, so each new tab, and each relaunch of the installed app, brings a new session id (inferred for the relaunch).
- Today's Smart shuffle state for the developer's 49,179 eligible items holds 5.0 MB (measured).
- `QueryRandomCandidates` took 54 ms median at 49,179 eligible items, and reading three more columns added 6 to 17 ms (measured).
- Reading every `item_tags` row took 12 to 22 ms, and reading them joined to the candidates 65 to 81 ms (measured).
- Picks use `Random.Shared`. The flaky test gives the never-played item weight 1.4 and the heavily played one the floor of 0.05, and needs 35 wins in 40 picks, so it fails about 0.24% of runs (computed).
- The test that each mode picks every eligible item is unseeded too, and fails about 2 runs in a million for WeightedRandom (computed).
- `ItemIdContractTests` checks the random and play routes' responses against `RandomResponse` with `OpenApiSpec.AssertMatchesSchema`, which needs the fields returned and the schema's to be the same set.
- `Spec_ListsEveryMappedApiAndControlRoute` fails for a route the server maps that the spec doesn't list, and for one the spec lists that the server doesn't serve.
- `npm run verify:contracts` only checks that the generated types match the OpenAPI file.

**Acceptance**

- `POST /api/random` picks with the options it is sent and the defaults for missing ones, and ignores an unknown category id, in server tests of random selection with each option.
- A device's state is kept by `clientId` across session ids and dropped once its window has emptied it, in server tests of the state.
- The response carries the cycle numbers, the cycle route answers them for a filter, and the reset route clears the device's memory, in server tests of each, and the response and routes match their schemas, in contract tests.
- No random test depends on an unseeded `Random`, checked by reading the tests, and `TrySelectRandom_WeightedRandom_PrefersNeverPlayedItemInTheEligibleSet` is gone.
- The pick's `last.log` line names the options, in the pick log test.
- `npm run verify:contracts` passes, and `docs/api.md` describes the options, the cycle numbers, and both routes, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- The Random tab between Filter and Tags with `casino`, as the approved mockup shows it, with the options applying at once.
- The cycle card at its top, open by default with its open state kept per device, updated from each pick's response, and fetched from the cycle route once each time the tab opens and again after Reset now.
- Reset now clears this device's memory through the reset route.
- The category list comes from the shared tag catalog, which the tab loads when none has loaded, as the Stats tab does.
- The options, Remember plays for included, are kept per device under one per-device store key and sent with each pick. `rr_randomizationMode` and `AppStoreOptions.storage` go, with no carry-over.
- Random behavior, Jump or Insert, in the Random tab, kept per device, places the pick of the player's Random button and of R.
- The Library tab's randomization dropdown goes, and its controls are laid out as the mockup shows, on a phone on its side too.
- The Random line under the Filters line, always shown, opening the Random tab, and hidden with the Filters line when the controls collapse.
- The panel tab keys are 1 to 6 in tab order, and the shortcut reference lists them.
- `CONTEXT.md` and `docs/domain-inventory.md` describe the Random tab and the Library tab without the dropdown.

**Traps**

- The randomization mode is kept in `localStorage` under the bare key `rr_randomizationMode`, outside the per-device store, and `AppStoreOptions.storage` exists only for it, with eight test files passing a stub for it (`src/state/appStore.ts`).
- `randomPick.test.ts` checks the request body's keys in order.
- `library.test.ts` checks the exact `localStorage` keys after startup, so the options aren't written without a user action.
- The preset and randomization dropdowns share `.library-controls-pair`, a row from a 414 px container (`src/styles.css`), which a library screen test matches by its text, and on a phone on its side the controls are a two-column grid that the dropdown's removal leaves with three items.
- `FilterSummary` in `src/ui/LibraryOverlay.tsx` builds the Filters line from `filterSummaryParts` (`src/filter/filterSummaryModel.ts`) and opens the Filter tab through `library.openFilterTab()`, and the collapse toggle's `aria-controls` names the Filters line and the controls.
- The panel's tabs are `PANEL_TABS` (`src/panel/panelHost.ts`) and `TABS` (`src/ui/Panel.tsx`), each page has its ref and section, and `connectTabs` takes hooks for every tab.
- The remembered tab is kept by its id (`panel.tab`), so a new tab leaves a remembered one valid.
- Panel screen, Stats screen, and `panelHost` tests list the five tabs.
- Six 44 px tabs and Close need 336 px, and the side panel's 360 px minimum leaves 344 px (inferred from `src/styles.css`).
- WebUI Player Controls' Random adds its pick at the end of the history from anywhere in it, and `pushHistory` in `src/state/appStore.ts` drops every entry after the current one before it adds a pick, so Insert needs a history step of its own (inferred).
- The shared tag catalog (`src/tags/tagCatalog.ts`) feeds the Stats tab, which loads it only when none has loaded.
- The cycle card follows the Stats tab's cards (`src/ui/StatsTab.tsx`).
- WebUI Keyboard Shortcuts binds 1 to 5 to the tabs and T and S to Tags and Settings, and its reference lists every binding.

**Acceptance**

- The Random tab sets each option, Remember plays for, and Random behavior, each applying at once and kept per device after a page refresh, and each pick sends the options, in Random screen tests and tests for a page refresh keeping them.
- The cycle card updates from each pick's response, fetches once when the tab opens and after Reset now, and keeps its open state per device, open by default, in Random screen tests.
- Reset now calls the reset route, in Random screen tests.
- The category list shows the tag catalog's categories and keeps the chosen ones by id, in Random screen tests.
- Random from the middle of the history adds the pick at the end with Jump, and right after the current item with the plays ahead kept after it with Insert, for the Random button and R, in Player screen tests and keyboard tests.
- The Library tab has no randomization dropdown, and the Random line always shows, opens the Random tab, and hides with the Filters line, in Library screen tests.
- 1 to 6 open Library, Filter, Random, Tags, Stats, and Settings, and the shortcut reference lists them, in keyboard tests per binding.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's phone.

#### Release checks

- Manual: On a desktop browser, the iPad, and an Android phone, the Random tab's options change the picks at once, the Random line names them and opens the tab, and they're kept after a page refresh.

#### Not included

- Random options kept per profile.
- Random options saved in presets.
- Shuffle memory that survives a server restart.
- Spreading by a folder other than a file's immediate parent.
- Lasting random-pick totals and other library-wide stats, a possible future addition to the Stats tab.
- Random picks from each account's own data, which is Per-Account Library Data.

### M12l1 - WebUI Grid Row Reuse and Zoom

- **Status**: ⏳ Planned
- **Goal**: The WebUI library grid updates only the rows and tiles that change, so it no longer flickers on an iPad or after a hard refresh, and Ctrl+scroll or a pinch over it changes its row height.
- **Depends on**: WebUI Library Tab, so it is built in the Preact Library tab, whose width changes whenever the side panel is resized.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Ctrl+scroll over the library grid, which a laptop trackpad pinch also sends, and a two-finger pinch on touch screens step the grid's target row height between 100 and 300 px, 160 by default.
- The row height is kept per device.
- The rows' minimum and maximum heights scale with the target row height.
- The tile under the pointer, or under the pinch's center, stays in place as the rows reflow.
- Ctrl+scroll never zooms the page anywhere in the app; Ctrl with + and - still zoom it.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Mockup | ⏳ Planned | Ctrl+scroll and a pinch changing the library grid's row height, approved by the user. |
| Row reuse | ⏳ Planned | Grid rows and tiles kept and updated in place instead of rebuilt through `innerHTML`, so the grid no longer flickers on an iPad or after a hard refresh. |
| Grid zoom | ⏳ Planned | Ctrl+scroll, a trackpad pinch, and a touch pinch stepping the grid's row height, kept per device, and Ctrl+scroll never zooming the page. |

#### Mockup slice

**Scope**

- Ctrl+scroll and a pinch over the library grid step its row height in `docs/mockups/reelroulette/`, keeping the tile under the pointer or the pinch's center in place.
- Ctrl+scroll never zooms the mockup's page.
- The size of a step, for a wheel notch and for a pinch, is settled in the mockup.
- The user approves the design on a desktop browser, the iPad, and an Android phone before the app is built.

**Traps**

- The mockup's grid aims for rows of 160 px, from 100 to 240 (`TILE_SIZE` in `build/layout.src.html`).
- The mockup's design table says "Rows 100–240 px, aiming for 160." (`build/index.src.html`).

**Acceptance**

- The mockup shows Ctrl+scroll and a pinch over the grid stepping its row height from 100 to 300 px with the tile under the pointer held in place, as the user approved it in their review on their devices, and the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, passes.

#### Row reuse slice

**Scope**

- Keep row elements that stay visible, add and remove only the rows that enter or leave, and update a patched tile in place.
- Grid rows stop going through `innerHTML`.
- Apart from that, grid layout, scrolling, focus, and tile behavior stay as they are.

**Traps**

- Each change of visible rows replaces the rows' HTML through `innerHTML`, which recreates every tile image.
- The WebUI Preact Migration's library overlay keeps the grid controller's row HTML.
- Each patch and each appended page rebuilds the layout and virtualizer for every loaded item, so loading a window page by page costs time that grows with the square of its size.
- In Node 24 on the development machine with the layout and virtualizer modules alone (no DOM), one full rebuild takes 0.5 ms for 10,000 items at 1,400 px wide and 1.2 ms at 390 px, and 2.7 to 7.8 ms for 49,000 (measured).
- Loading 10,000 items in 200-item pages spends 13 to 32 ms in total on rebuilds, and 49,000 spends 355 to 953 ms over 245 pages, about 1.5 to 4 ms per page. The growth is real but small (measured).
- Replacing the rows' HTML is the likely cause of the iPad flicker, and was not measured (inferred).
- On an iPad with the WebUI installed as an app, the grid flickers dark each time it re-renders its visible rows while scrolling, about seven times for a screen-height drag in landscape with three to four rows on screen. Desktop browsers and Firefox on Android are fine. Each re-render rebuilds every visible row's HTML, including images that were already showing (measured before promotion).
- In desktop browsers, before and after the WebUI Preact Migration, after a hard refresh (Ctrl+F5), which bypasses the image cache, the grid flickers when it opens and on every scroll, because each row rebuild requests its thumbnails again. Desktop browsers are fine only while the thumbnails are cached (measured).

**Acceptance**

- Scrolling keeps the image elements of rows that stay visible, in WebUI tests for row reuse.
- A favorite, blacklist, playback, or tag patch updates only the affected tile, in WebUI tests for tile patching.
- No grid row is rendered through `innerHTML`, in WebUI tests for row reuse.
- Layout results match the current layout for the same items and width, in WebUI tests.
- Scrolling keeps the rows and image elements that stay visible instead of rebuilding them, which stands in for the flicker on an iPad and after a hard refresh, in WebUI tests for row reuse.
- Before-and-after timings for rendering a large window in a browser are recorded.
- `npm run verify` passes, and a spot check on the user's own iPad and desktop browser, without the VM: on the iPad with the WebUI installed as an app, scrolling the library grid a screen height in landscape shows no flicker, and in the desktop browser, after a hard refresh (Ctrl+F5), opening the library and scrolling the grid shows no flicker.

#### Grid zoom slice

**Scope**

- Ctrl+scroll, a trackpad pinch, and a two-finger pinch over the library grid step its target row height, as the approved mockup shows, in the grid's layout and controller (`src/library/libraryGridLayout.ts`, `src/library/libraryGridController.ts`).
- The row height is kept in the per-device store (`src/state/deviceStore.ts`).
- Ctrl+wheel is cancelled everywhere in the app, so neither Ctrl+scroll nor a trackpad pinch zooms the page, and Ctrl with + and - is left to the browser.

**Traps**

- The target, minimum, and maximum row heights are module constants (`TARGET_ROW_HEIGHT`, `MIN_ROW_HEIGHT`, and `MAX_ROW_HEIGHT` in `src/library/libraryGridLayout.ts`).
- The grid has no wheel or touch handlers and sets no `touch-action`, and the viewport meta in `index.html` allows zoom.
- A pinch over the grid zooms the page (inferred).
- The player cancels every wheel event over the media area, Ctrl+wheel included, and turns away Safari's pinch by cancelling `gesturestart` (`src/ui/Player.tsx`).
- Chrome and Firefox send a trackpad pinch as wheel events with `ctrlKey` set, while Safari on a Mac sends `gesturestart` and `gesturechange` instead (inferred).
- Until the Row reuse slice lands, each row height change replaces every visible row's HTML, which recreates every tile image and would flicker on an iPad at each step (inferred).
- A row height change rebuilds the layout for every loaded item, which takes 2.7 to 7.8 ms for 49,000 items in Node 24 with the layout and virtualizer modules alone (measured).
- Before the WebUI Library Tab set rows of 160 px, from 100 to 240, the grid aimed at 300 px rows, from 200 to 400.
- The server's thumbnails are at most 480 px on their long edge (`ThumbnailMaxEdge` in `RefreshPipelineService.cs`).
- A 16:9 tile at 300 px rows, about 533 px wide, shows its thumbnail slightly scaled up, more on high-density screens (inferred).

**Acceptance**

- Ctrl+wheel over the grid steps the target row height between 100 and 300 px, from 160 by default, with the minimum and maximum scaling with it, in WebUI tests of grid zoom.
- A two-finger pinch over the grid steps the row height, in WebUI tests of grid zoom with touch events.
- The tile under the pointer, or under the pinch's center, keeps its place as the rows reflow, in WebUI tests of grid zoom.
- The row height is kept per device and restored on reload, in WebUI tests of grid zoom with the per-device store.
- Ctrl+wheel is cancelled everywhere in the app, and Ctrl with + and - is not, in WebUI tests of the page zoom guard.
- At 160 px the layout matches the one before this slice for the same items and width, in layout tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check in the desktop browser with Ctrl+scroll and on the iPad with a pinch.

#### Release checks

- Manual: On an iPad with the WebUI installed as an app, scrolling the library grid a screen height in landscape shows no flicker.
- Manual: In a desktop browser, after a hard refresh (Ctrl+F5), opening the library and scrolling the grid shows no flicker.
- Manual: In a desktop browser, Ctrl+scroll over the library grid changes the row height, keeping the tile under the pointer in place, without zooming the page.
- Manual: On the iPad and an Android phone, a pinch over the library grid changes the row height without zooming the page.

#### Not included

- Extending the layout for appended pages instead of rebuilding it, since a rebuild measured a few milliseconds per page.
- Placeholder tiles and loading the page at the scroll position, which is WebUI Grid Scrollbar Seek.
- Zooming into the playing photo or video, which is Player Zoom and Pan.
- Thumbnails larger than 480 px for tall rows, since the 480 px thumbnails are only slightly scaled up at 300 px rows.

### M12l2 - WebUI Ratings on Tiles

- **Status**: ⏳ Planned
- **Goal**: Library tiles show each item's rating.
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

### M12l3 - WebUI Grid Scrollbar Seek

- **Status**: ⏳ Planned
- **Goal**: Dragging the library grid's scrollbar reaches any part of the results without loading every page before it.
- **Depends on**: WebUI Grid Row Reuse and Zoom.
- **Design**: `docs/mockups/reelroulette/`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Design note | ⏳ Planned | A reviewed design note on how the query session and grid work with pages loaded at the scroll position. |
| Scrollbar seek | ⏳ Planned | A grid sized to the full result count with placeholder tiles, loading the page at the scroll position. |

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
- Apart from placeholder tiles and loading the page at the scroll position, grid layout, scrolling, focus, and tile behavior stay as they are.

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

#### Release checks

- Manual: In a desktop browser and on a phone, dragging the library grid's scrollbar to the end of a large library shows its last tiles without loading every page before them.

### M12m - WebUI Multi-Select and Bulk Actions

- **Status**: ⏳ Planned
- **Goal**: The WebUI selects several library items, or every item that matches, and favorites, blacklists, rates, tags, clears the playback stats of, or removes them all at once.
- **Depends on**: WebUI Grid Row Reuse and Zoom, which updates a tile in place, so selection marks are tile updates, and WebUI Tags and Filter Tabs, whose Tags tab edits several items, and Item Ratings, whose rating and star control Rate… uses, and Rating Filter and Sort, whose rating change kind in the tile effect rule the bulk rating event goes through.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Select all selects every item that matches the search and filters, loaded or not, and each bulk action applies to all of them.
- Each bulk action acknowledges itself in a Your actions popup: "Added {n} items to favorites.", "Removed {n} items from favorites.", "Blacklisted {n} items.", "Removed {n} items from the blacklist.", "Rated {n} items {rating}.", "Cleared the rating on {n} items.", "Updated tags on {n} items.", "Cleared playback stats for {n} items.", and "Removed {n} items from the library.", or "Removed {n} items from the library and deleted their files.", with "1 item" for one, and {rating} as Item Ratings words it, such as "3.5 stars".

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | An ids-only library query, a bulk favorite and blacklist route with one event, bulk rating with one event, an item removal route with its event, the tag-count read for a selection, and the WebUI's handling of the bulk and item removal events. |
| Selection | ⏳ Planned | Selecting tiles by their check icon or a long press, the selection bar with Select all, and the Esc order. |
| Bulk actions | ⏳ Planned | The Actions menu's favorite, blacklist, rate, clear playback stats, and remove from library actions, the control-token prompt remove from library asks through, and favorite and blacklist answers applied to the item they were for. |
| Tag edits | ⏳ Planned | Editing several items' tags in the Tags tab. |

#### Contract slice

**Scope**

- The library query gains an ids-only option that returns every matching id in one response, for Select all.
- One bulk route takes many ids and sets or clears favorite or blacklist on all of them in one request, publishing one event for all of them in place of one request and one `itemStateChanged` per item.
- Bulk rating sets or clears one rating on many ids in one request and publishes one rating event for all of them, carrying each item's previous rating. Promotion decides whether it stays its own event or shares the bulk favorite and blacklist event.
- A route removes items from the library, with the delete-from-disk option the desktop remove dialog offered.
- The item removal route is gated as the `/control` routes are: open from the server machine, and from another machine only with the control token.
- Removing items publishes an event so connected clients update, and every open WebUI requeries its library window on it.
- The WebUI applies the patch-or-reload rule to each id in a bulk event, the bulk rating event included, and reloads its window at most once.
- The bulk requests send the device's `clientId`, and the bulk events carry it back as `clientId`, as WebUI Notifications does for one item's favorite or blacklist.
- Other devices show one Other devices popup for the batch: "Added {n} items to favorites on another device", "Removed {n} items from favorites on another device", "Blacklisted {n} items on another device", "Removed {n} items from the blacklist on another device", "Rated {n} items {rating} on another device", or "Cleared the rating on {n} items on another device", with "1 item" for one. The device whose `clientId` the event carries shows only its Your actions popup.
- For a selection of every matching item, the Tags tab's chip states and collapsed counts need each tag's count across the selection, which the WebUI can't work out for items it hasn't loaded. The slice measures the existing tag-editor model, which takes item ids, on the 49,055-item catalog against a counts-only addition, and uses the cheaper one.
- OpenAPI and generated WebUI types.

**Traps**

- `POST /api/favorite` and `POST /api/blacklist` take one item id each.
- `POST /api/playback/clear-stats` and `POST /api/tag-editor/apply-item-tags` each take a list of item ids, `itemIds`, so a selection of items that aren't loaded can be cleared. Clear-stats refuses a request that names no ids without `allItems`.
- No route removes items from the library.
- The ids-only response is about 1.9 MB for the developer catalog's 49,055 items, worked out from 36-character ids (inferred).
- Item Ratings' `POST /api/rating` takes one item, and its `itemRatingChanged` names one item.
- The tag-editor model takes item ids (`TagEditorModelRequest.itemIds`).

**Acceptance**

- The ids-only query returns every matching id, in server tests for the ids-only query.
- Bulk favorite and blacklist send one request and publish one event, and the WebUI reloads its window at most once for it, in server tests for the bulk route and its one event, and WebUI tests that the bulk event reloads the window at most once.
- The bulk event carries the request's `clientId`, in server tests for the bulk route, and other devices show one Other devices popup for the batch while the device that made the change shows only its Your actions popup, in WebUI tests of the bulk event's popups.
- Bulk rating sends one request and publishes one rating event with each item's previous rating and the request's `clientId`, the WebUI reloads its window at most once for it, and its popups follow the same rule, in server tests for bulk rating and its event and WebUI tests of the bulk rating event.
- The item removal route removes items with and without deleting from disk, in server tests of the route.
- Removing items updates connected WebUI sessions through events and list requery, in WebUI tests for event handling.
- The measurement of the tag-editor model against a counts-only addition on the 49,055-item catalog is recorded, and the cheaper read is used.
- The ids-only query, the bulk route, bulk rating and its event, and the item removal route and its event are in OpenAPI, and `npm run verify:contracts` passes, in contract tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Selection slice

**Scope**

- Selection works as Google Photos does, with one icon throughout: a white circle with a check mark at the tile's top left.
  - With a mouse it shows faded while the pointer is over a tile, and on every tile once selection is active.
  - With the pointer on the icon itself it turns bright white, and clicking it selects the tile and starts selection.
  - Selecting a tile turns the same icon filled orange, and the thumbnail shrinks inside the tile so the icon sits on its top-left corner.
  - Hovering dims only the thumbnail, so the icon stays bright.
  - On a touch screen a long press starts selection, and the icons then show on every tile.
  - To screen readers the icon is a checkbox named "Select {file name}", and its tooltip reads "Select" or "Deselect".
- Once selection is on, a click adds or removes a tile, and Shift+click adds the range from the last tile chosen. Ctrl or Cmd+click isn't used.
- The grid's text isn't selectable, so Shift+click selects only tiles and doesn't also highlight text across them.
- While selecting, a bar at the bottom of the Library tab shows Stop selecting (the `deselect` icon), "{n} selected", Select all (an icon-only button with the `select_all` icon and "Select all" as its tooltip), and Actions, whose menu the Bulk actions slice fills.
- Selection starts only from a tile's check icon or, on a touch screen, a long press, and the Library tab has no Select button.
- Deselecting the last tile ends selection.
- Esc closes the Actions menu and then selection, after Auto Tag and before the panel, in the order WebUI Keyboard Shortcuts sets.

**Traps**

- The desktop's library grid selected several items with click, Ctrl+click, and Shift+click.
- The WebUI library plays one item per click and has no selection.
- Filled icons take `.material-symbol-icon.is-filled` (FILL 1, weight 700, optical size 20), and icons on a tile take the drop shadow from `.library-grid-tile .material-symbol-icon.is-filled` (`src/styles.css`).
- The WebUI's icon font is the full Material Symbols font and has `select_all` and `deselect` (measured).
- Every tile has the playing icon, which the stylesheet shows only on the tile with `is-playing`, and the grid controller moves that class between the tiles shown without rendering them again (`setPlayingItemId` in `libraryGridController.ts`).

**Acceptance**

- With a mouse, a tile's check icon shows faded on hover and selects the tile when clicked; during selection it shows on every tile, and a long press starts selection on a touch screen. A selected tile's icon is filled orange and its thumbnail shrinks inside the tile, in WebUI tests for selection.
- The Library tab has no Select button, and deselecting the last tile ends selection, in WebUI tests for selection.
- The selection bar shows Stop selecting with the `deselect` icon and Select all as an icon-only button with the `select_all` icon and its tooltip, in WebUI tests for selection.
- Once selection is on, a click adds or removes a tile and Shift+click adds a range without highlighting text; Ctrl or Cmd+click doesn't select, in WebUI tests for selection.
- Select all selects every item that matches the search and filters, including items not loaded, in WebUI tests for Select all over items not loaded.
- Esc closes the Actions menu, then selection, after Auto Tag and before the panel, in WebUI tests for the Esc order.
- `npm run verify` passes.

#### Bulk actions slice

**Scope**

- Actions is a menu in three groups: Add to favorites, Remove from favorites, Add to blacklist, and Remove from blacklist; Rate…, Edit tags…, and Clear playback stats…; and Remove from library…, in red.
- Add to and Remove from favorites and the blacklist send one request to the bulk route, and Clear playback stats sends ids.
- Rate… opens an in-app dialog with Item Ratings' star control, designed in the mockup, which sets the chosen rating on every selected item, or clears it, in one bulk rating request.
- Bulk Add to favorites clears each item's blacklisting, and Add to blacklist clears its favorite, as the player's buttons do.
- Clear playback stats… asks "Clear playback stats for {n} items?", with Cancel focused and a red Clear.
- Remove from library is an admin action. From another machine it asks for the control token first, in a control-token prompt that this milestone builds on `POST /control/pair`; on the server machine, which the merged localhost helper decides, it asks for none. It then asks to confirm, naming the count, and sends the selection to the item removal route.
- WebUI Admin Section's gate reuses the control-token prompt.
- Deleting the files from disk is an option in Remove from library's confirmation, off by default, and when it is on the question says the files will be permanently deleted from disk.
- The wording of Remove from library:
  - The token prompt is a dialog titled "Control token" that says "This is an admin action. Enter the server's control token.", with the token field under the field validation pattern and Continue.
  - The confirmation asks "Remove {n} items from the library? Their files stay on disk." with a red Remove.
  - With "Also delete the files from disk" checked it asks "Remove {n} items from the library and permanently delete their {n} files from disk? This can't be undone." with a red Remove and Delete.
  - For one item they say "1 item", "Its file stays", and "its file".
- Removing the selected items from the library ends selection.
- A favorite or blacklist answer applies to the item it was for. The fix is straightforward: cache the answer under its `itemId` and apply it only when that item is still playing.

**Traps**

- The desktop acted on selected items from its context menu: add to or remove from favorites and the blacklist, add or remove tags, clear playback stats, and remove from library.
- `toggleFlag` in `src/playback/player.ts` clears the other flag when it sets one.
- `src/playback/player.ts` applies a favorite or blacklist answer to the item playing when the answer arrives, so pressing Next before it does marks the new item locally and caches that state under its id until an event for it corrects it.
- The server's answer carries the changed item's `itemId` and both flags (`LibraryStateResponse`, which `shared/api/openapi.yaml` names but no route's response refers to).

**Acceptance**

- The WebUI applies favorite, blacklist, clear stats, and, for admins, remove from library to all selected items, in WebUI tests for each bulk action.
- Each bulk action applies to every item Select all selected, including items not loaded, in WebUI tests for each bulk action.
- Remove from library asks to confirm with the count. Deleting files from disk is off by default, and turning it on makes the question say the files will be permanently deleted from disk, in WebUI tests for each bulk action.
- From another machine, Remove from library asks for the control token in the control-token prompt before its confirmation, and on the server machine it asks for none, in WebUI tests of the control-token prompt.
- Bulk Add to favorites clears blacklisting, and Add to blacklist clears favorite, on each selected item, in WebUI tests for each bulk action.
- Bulk favorite and blacklist send one request for the whole selection, in WebUI tests for each bulk action.
- Rate… sets or clears the rating on every selected item, including items Select all selected that aren't loaded, in one request, and says so in its Your actions popup, in WebUI tests for each bulk action.
- A favorite or blacklist answer that arrives after Next applies to the item it was for, not the item now playing, in WebUI tests for a favorite answer after Next.
- `npm run verify` passes.

#### Tag edits slice

**Scope**

- The WebUI edits several items' tags in the Tags tab, with no dialog.
- Edit tags in Actions opens the Tags tab with the line "Editing tags for {n} items", like the line WebUI Tags and Filter Tabs shows for an item that isn't playing.
- While the tab edits several items, a collapsed category's count is how many of its tags the selected items have, and a chip shows green for a tag all of them have and orange for a tag only some have, and Add or Remove applies to all of them. The counts come from the read the Contract slice picks.
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

- Manual: In the WebUI on a desktop browser and a phone, select several items, and every matching item with Select all, apply each bulk action, and the tiles update.

#### Not included

- Reaching a tile's check icon with Tab, which is WebUI Keyboard Navigation and Focus. Until it ships, keyboard users can't start selection, accepted since both ship in the same release.
- The filter summary line, which is WebUI Library Tab.
- Clearing the whole library's playback stats, which is Admin Refresh, Backup, and Duplicate Review.
- Keep Playing, which is WebUI Autoplay Modes, whose Timer mode replaces it.
- Loudness normalization, which is WebUI Loudness Normalization.
- Removing a source with its items, which is Admin Source Management.

### M12n1 - WebUI Loop Range

- **Status**: ⏳ Planned
- **Goal**: With Loop on, the user can set a start and an end marker on a video's scrub bar, and the video repeats between them.
- **Depends on**: WebUI Autoplay Modes, whose Timer mode's repeating stretch the markers define while they are set.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- With Loop on, the user can set a start and an end marker on a video's scrub bar, and the video repeats between them, in Normal and Timer mode and with Autoplay off.
- While markers are set, they define Timer mode's repeating stretch, in place of the stretch that starts where a seek lands and runs for Advance after.
- A repeat between the markers only moves the video's position: nothing loads again, shows Loading…, or records another play, as Loop's other repeats do.
- Before the app is built, the markers are designed in the mockup and approved: how they are set, moved, and cleared with a mouse, on a touch screen, and from the keyboard; how they show on the scrub bar beside Timer mode's stretch; whether a video keeps them when it plays again or the page refreshes; and what they do while Loop stops autoplay is off.

#### Traps

- The scrub bar is a native range input that the player sets rather than renders from state, so a re-render never moves it while it is dragged (`seekSlider` in `src/playback/player.ts`). Markers drawn on it must leave the bar its own dragging (inferred).
- WebUI Autoplay Modes wraps the scrub bar in `seek-wrap`, with Timer mode's stretch, `seek-loop`, behind its track, inset by half the thumb's width at each end so it lines up with the thumb.
- WebUI Player Controls keeps the controls shown while the scrub bar or volume is dragged, so dragging a marker has to keep them shown too (inferred).
- The keyboard shortcuts WebUI Keyboard Shortcuts adds, listed in the mockup's shortcut reference, already take most of the keys a marker could use.

#### Acceptance

- With Loop on and both markers set, a video repeats between them with Autoplay off and in Normal and Timer mode, in player and Player screen tests.
- While markers are set, Timer mode's repeating stretch is the range between them, in a test.
- A repeat between the markers records no other play and keeps the video's source, in a test.
- The markers are set, moved, and cleared as the approved mockup shows, by mouse, touch, and keyboard, in Player screen tests.
- The mockup shows the markers as approved and matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Release checks

- Manual: On the iPad and a desktop browser, setting, moving, and clearing the markers on the scrub bar works by touch and by mouse, and a video repeats between them.

#### Not included

- Markers on a photo, whose scrub bar is its timer.

### M12n2 - Library Profiles

- **Status**: ⏳ Planned
- **Goal**: Each device chooses a profile from a picker in the header, a named view of the library that shows only the sources picked for it.
- **Depends on**: Per-Preset Preset Writes, whose preset ids each profile remembers its preset by, Item Ratings, whose rating event gains the item's source id, WebUI Keyboard Shortcuts, whose shortcut handling the picker's key uses and whose shortcut reference lists it, Browser-Playable Filter, whose shared tab rule Add Profile and Edit Profile's tabs use, and WebUI Multi-Select and Bulk Actions, whose ids-only query, selection, and bulk events follow the active profile.
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
- U opens the picker, and the arrow keys and Enter choose a profile.
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
- Add Profile and Edit Profile, one tabbed in-app dialog:
  - General: the name, under the field validation pattern, flagged when another profile has it, ignoring case, and the color, from a basic palette or a hex field, random when none is chosen.
  - Sources: all of them, following newly added ones, or a chosen list.
  - Tags: categories with their tags as checkboxes, a category's tags greyed while it is off.
  - Presets: a checkbox for each preset.
  - Edit Profile has a red Delete that asks first. The default profile's Edit Profile has only the General tab and no Delete.
- The visibility design that Profile Tag and Preset Visibility builds: the "Only this profile" or "All profiles" question on creating a tag, category, or preset once a second profile exists, and Show in in Edit Tag, Edit Category, and Edit Preset.
- The Library, Filter, Tags, and Stats tabs in a profile: the Filter tab's sources, the Filters line's source count, and the Stats tab's library cards cover only the profile's sources.
- Switching: "Discard changes?" while the Filter or Tags tab holds unsaved changes, U and the arrow keys, the picker's place in the Esc order, and U's row in the shortcut reference.
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

- CORS allows only `Content-Type`, `Authorization`, and `Last-Event-ID` (`Program.cs` in `ReelRoulette.Server` and `ReelRoulette.ServerApp`), and EventSource can't send headers, so a header naming the profile would need a CORS change and still wouldn't reach the event stream.
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
- U opens the picker with focus on the active profile, the arrow keys move between profiles, and Enter chooses one. U does nothing while the header hides or focus is in a text field.
- Escape closes the picker first, before the bell's list, the panel, and pseudo-fullscreen, and gives focus back to the button. The shortcut reference lists U.
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
- The bell's list (`NotificationList` in `src/ui/Notifications.tsx`) has its placement, outside press, Escape, and focus written for the bell alone, and no popover primitive exists in `src/ui`, though WebUI Multi-Select and Bulk Actions' Actions menu may add one (inferred).
- The panel opening closes the bell's list in every mode (`src/state/appServices.ts`), while the picker closes only when the panel covers the screen, which is `panel.mode` `"overlay"` (`src/panel/panelHost.ts`).
- `filter.applied` holds the filter and its preset, and an effect writes it only once presets have loaded and the record has changed (`src/state/appStore.ts`). A switch that doesn't set the applied filter and the preset in one batch, as `pickHeaderPreset` does, writes the old profile's record under the new profile's key (inferred).
- Applying the remembered preset again as the server has it now runs only on the first preset load (`presetsLoaded` in `src/state/appStore.ts`).
- The Stats tab loads again on events and a new playing item, never on a preset pick (`src/stats/statsTab.ts`), so a switch needs its own trigger.
- `filterWithGeneralDraft` writes an empty source list when every listed source is checked (`src/filter/filterDialogModel.ts`), and an empty list means every source.
- Requests go through `createServerRequester` in `src/state/appApi.ts`, except the library play in `src/api/coreApi.ts`, which names no profile.
- `src/events/sseClient.ts` listens only to the event types registered with it.

**Acceptance**

- The button shows the active profile's circle and first letter in a readable color, the picker lists the default profile first and the others alphabetically, and it closes as the Decisions describe, in Header screen tests.
- U opens the picker, the arrow keys and Enter choose, U does nothing while the header hides or in a text field, and Escape closes the picker first, in keyboard tests.
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
- Keyboard focus rings and Tab order for the picker and its dialog, which is WebUI Keyboard Navigation and Focus.
- Switching profiles on a phone on its side, where the header hides.
- Profiles in the admin section, which covers the whole library.

### M12n3 - Profile Tag and Preset Visibility

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
- The creation question, a dialog with two choices, after Add tag, New Category, and Add Preset once a second profile exists.
- Show in in Edit Tag, Edit Category, and Edit Preset.
- In a profile, hidden tags, categories, and presets don't show:
  - in the Filter tab's tags and presets, where conditions on hidden tags stay out of its block of tags the catalog doesn't have;
  - in the Tags tab, an item's hidden tags included;
  - in the Library tab's preset dropdown, where a remembered preset the profile hides shows **None\*** with its filter kept, as a deleted one does, and in the Filters line's tag counts;
  - in Auto Tag and the Stats tab's tag chips;
  - in the Random tab's category list.
- Applying a filter or preset in a profile leaves out its conditions on hidden tags, as the shared fixture says.
- The "modified" marker compares a preset with its conditions on hidden tags and sources left out.
- A new tag, category, or preset name is checked against the whole catalog, hidden ones included, as the approved mockup words it.
- Reordering in a profile, as the Decisions describe.
- WebUI tests read `shared/fixtures/profile-filter-projection.json`.

**Traps**

- The shared tag catalog signal (`src/tags/tagCatalog.ts`) feeds the Stats tab and Random Pick Options' category list; the Filter and Tags tabs render from their own models, so each one leaves out hidden tags itself.
- The Filter tab lists a selected or excluded tag the catalog doesn't have in an Uncategorized block (`src/filter/filterDialogModel.ts`).
- A category reorder sends each changed category's place in the list shown as its `sortOrder` (`src/library/tagSave.ts`), which would collide with hidden categories' places.
- New tag and category names are checked against what the editor shows (`src/tags/tagEditorModel.ts`), and the server merges a tag given a taken name, so a new tag named like a hidden one would merge into it.
- Edit Tag allows another tag's name on purpose, since the server merges the two.
- The in-app confirmation offers Cancel and one action (`src/dialogs/dialogs.ts`).
- The Tags tab's Save sends adds and removes through `apply-item-tags`, never an item's whole tag list.

**Acceptance**

- The Tags and Presets tabs show and change which tags, categories, and presets a profile shows, with a category's tags greyed while it is off, and Add Profile starts with the "All profiles" ones checked, in profile dialog tests.
- The creation question shows only once a second profile exists, and each answer creates the tag, category, or preset as it says, in Tags and Filter screen tests.
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
- **Depends on**: WebUI Responsive Layout and Panels, whose header the admin icon joins, and WebUI Auto-Pause and Photo Scrub Bar, whose Auto-Pause the admin view follows, and WebUI In-App Dialogs, whose confirmation the control token change uses, and WebUI Field Validation Pattern, whose pattern its settings fields use, and Catalog Open and Backup Safety, whose library state and message the admin section shows, and WebUI Notifications, whose bell and popups the admin view uses, and WebUI Multi-Select and Bulk Actions, whose control-token prompt its gate reuses.
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

**Traps**

- The Operator page is 842 lines of HTML, CSS, and JavaScript inside a raw string in `src/core/ReelRoulette.ServerApp/Program.cs` (measured).
- No test covers the Operator page's content; the only test that names `/operator` checks that the library route gate leaves it open (measured).
- The sections listed in Scope match the Operator page (measured).
- `verify-linux-packaged-server-smoke.sh` still requests `/operator` (measured).
- The Operator page's responsive layout is a 12-column grid that changes at 620 and 980 px wide.
- The Operator page shows the control token as plain text and saves a change without asking (`adminSharedToken` in `Program.cs`).
- The server keeps each event stream's client id, user agent, and connection time (`ConnectedClientTracker`), so connected clients need no contract change.

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
- **Depends on**: WebUI Admin Section.
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

**Traps**

- `ServerLogService.Append` writes today's line format, `[timestamp] [source] [level] message`.

**Acceptance**

- The interface names the logs section Log Viewer in the admin section, and nowhere Server Logs; the route is still `GET /control/logs/server`, in admin section UI tests.
- The Log Viewer filters by time window, by several sources and several levels, and by contained text, with its filters in a collapsed panel with chips, a live indicator that pauses away from the newest lines, and rows that expand to the full line, in admin section UI tests for the Log Viewer's filters, chips, and live indicator.
- The Log Viewer has no Tail lines field: it fetches the newest matching lines once, up to 5000, and shows older ones as the list scrolls without another request, in admin section UI tests for showing older lines.
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

- Turned off, the `enabled` field stops the server serving the WebUI's files and `/runtime-config.json` from its next start, leaves the WebUI's origins out of CORS, and stops mDNS advertising.
- Turned off from the admin section, `enabled` would remove the admin section itself, and the recovery page has no way to turn it back on.
- The Operator page reads and writes the field, as its `webEnabled` checkbox, until the Operator retirement slice retires it.

**Acceptance**

- With `enabled` stored as off in `core-settings.json`, the server still serves the WebUI and `/runtime-config.json`, allows the WebUI's CORS origins, and, with remote connections and mDNS on, advertises over mDNS after a restart, in server tests that a stored `enabled` of off is ignored.
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
- **Depends on**: WebUI Admin Section and Server Settings Robustness, so a settings save sends only the fields it changes, and Item Ratings, whose ratings duplicate review shows and Select Best compares.
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
| Duplicate contract | ⏳ Planned | Each duplicate group file's rating, in OpenAPI and the generated WebUI types. |
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
- OpenAPI and generated WebUI types; the change only adds.

**Traps**

- `DuplicateGroupItemResponse` carries each file's item id, full path, source id, favorite, blacklisted, play count, tag count, and last write time, and no rating.
- Desktop Client Removal leaves `/api/duplicates/scan` with no caller.

**Acceptance**

- A duplicate scan returns each rated file's rating and leaves it out for an unrated one, in server tests of the duplicate scan.
- OpenAPI and the generated WebUI types carry the field, in contract tests, and `npm run verify:contracts` passes.
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

**Traps**

- Desktop Client Removal leaves `/api/duplicates/scan` and `/api/duplicates/apply` with no caller. The routes exist, so this slice needs no contract change beyond the Duplicate contract slice's rating (measured before promotion).
- The scan request's `scope` already takes `CurrentSource`, `AllEnabledSources`, and `AllSources` (`DuplicateScanRequest`) (measured).
- The desktop decided Select Best in `DuplicateGroupViewModel` (`DuplicatesDialog.axaml.cs`, in git history from before Desktop Client Removal): the file with the most plays, then the newest. The server and the WebUI have no keep rule.

**Acceptance**

- Duplicate review opens within the admin section, in admin section UI tests.
- The Duplicates card scans the whole library, all enabled sources, or one source, sending that scope, in admin section UI tests of each scope.
- Duplicate apply deletes only the files not kept, from disk, after a confirmation that names the groups and files to delete and asks for nothing to be typed, and Keep All deletes nothing in that group, in admin section UI tests.
- The duplicate default is chosen in duplicate review, starts at Keep All, is kept per device, and survives a page refresh, in admin section UI tests.
- Each file's card shows its rating, and Select Best keeps the highest-rated file, then the most played, then the newest, with an unrated file below any rating, in admin section UI tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check of a duplicate scan.

#### Release checks

- Manual: From the admin section, start a refresh, change refresh and backup settings, scan and apply duplicates with Keep All and with a chosen file, and clear all playback stats, and the library updates.

### M12r - Admin Source Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources from the WebUI admin section, with server routes for what no client can do today, and every open WebUI follows source changes without a reload.
- **Depends on**: WebUI Admin Section, Browser-Playable Filter, whose Filter tab reload on `sourceStateChanged` the new source events reuse, and WebUI Multi-Select and Bulk Actions, whose item removal route it uses, and Library Profiles, whose profiles' source lists a removed source leaves.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Everything this milestone adds is gated like the rest of the admin section: localhost, or the control token from other machines.
- Adding a folder takes a path on the server machine. The admin section takes a plain typed path, with no autocomplete or folder browser, and the server checks it as it is typed: a folder on the server that is not already a source.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | Server routes to rename and remove a source and check a typed source path, with events for source changes, in OpenAPI and the generated WebUI types. |
| Manage Sources | ⏳ Planned | The admin section's source list with statistics, adding by server path, Edit Source with rename and Remove, enable and disable, and one Refresh. |
| WebUI source sync | ⏳ Planned | Every open WebUI reloads its library window and Filter tab source list on a source event, with one resync in flight at a time. |

#### Contract slice

**Scope**

- Server routes to rename a source and remove a source (its items leave the catalog; files stay on disk).
- An admin-only route that checks a typed path: a folder on the server that is not already a source. A contract change that only adds.
- Source changes publish events so connected clients update. Import gets an event too.
- Removing a source also removes it from every profile's chosen list of sources in the same transaction, and publishes `profilesChanged` when a profile changed.
- A source added later joins only the profiles that follow all sources, as Library Profiles sets out.
- OpenAPI and generated WebUI types for the new routes.

**Traps**

- No route renames or removes a source.
- The path check is a new admin-only route, a contract change that only adds (inferred).
- Only enabling or disabling a source publishes an event (`sourceStateChanged`), and `POST /api/sources/import` publishes nothing.
- Library Profiles keeps a profile's chosen sources in `profile_sources`, and the catalog has no foreign keys, so removing a source doesn't remove its rows there by itself.

**Acceptance**

- Removing a source removes its items from the catalog and leaves its files, in server tests of the route.
- Removing a source removes it from every profile's chosen list and publishes `profilesChanged`, in server tests of the route.
- The path check route flags a typed path that is not a folder on the server, or is already a source, in server tests of the route.
- Adding, renaming, removing, enabling, and disabling a source each publish an event, in server tests of the event each source change publishes.
- New routes are in OpenAPI, and `npm run verify:contracts` passes.
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
- The path field uses the field validation pattern, and a path that is already a source is flagged with "That folder is already a source.". An empty path is not flagged.
- Add Source sits beside the path field, so it is disabled while the path is empty or flagged, with no icon on the button, as WebUI In-App Dialogs sets out for an action whose fields sit right next to it.
- A Your actions popup acknowledges each change: "Source renamed.", "Source added. Importing its files…", "{name} enabled." or "{name} disabled.", and "Source removed.", the last three followed by "ReelRoulette updates the library everywhere it's open.".

**Traps**

- Folder import, enable and disable, and refresh routes already exist.
- The per-source statistics already come from the `sources` list of `GET /api/library/stats`, so they need no contract change.
- The refresh route takes no source id.
- A browser folder picker returns paths on the browser's machine (inferred).
- The desktop's Import Folder sent its own folder picker's path to the server, so it only worked on the server machine.

**Acceptance**

- From the admin section, sources can be added by server path, renamed, removed, enabled, disabled, and refreshed, with per-source statistics, and one Refresh covers the whole list, in admin section UI tests for Manage Sources.
- A typed path that is not a folder on the server, or is already a source, is flagged with the field validation pattern as it is typed, and Add Source is disabled without an icon on it until the path is corrected, as it is while the path is empty, in admin section UI tests for Manage Sources.
- An Edit Source name another source has, ignoring case, is flagged with the field validation pattern, and Save is disabled without an icon on it while the name is taken or empty, in admin section UI tests for Manage Sources.
- Edit Source's button and its confirmation's button say Remove, not Delete, in admin section UI tests for Manage Sources.
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

- The item removal route and removing items from the library, which is WebUI Multi-Select and Bulk Actions.
- Duplicate review, which is Admin Refresh, Backup, and Duplicate Review.
- Moving source management behind admin accounts, which is Auth Cutover for API and Admin.
- Per-user source visibility, which is Per-User Source Permissions.
- Browsing for a source folder, which is Desktop App Shell.

### M12s - Admin Library Catalog Transfer

- **Status**: ⏳ Planned
- **Goal**: Export and import the library from the WebUI admin section, with the server applying the catalog while it runs.
- **Depends on**: WebUI Admin Section, Remove library.json Library Support, and Catalog Open and Backup Safety, so import can restore a library while the server runs without one, and Admin Source Management, whose server path check the remap fields use, and Admin Refresh, Backup, and Duplicate Review, whose daily retention marks the backups the restore list labels daily.
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

**Traps**

- No route lists the server's backups.

**Acceptance**

- The Backups card lists the server's backups, and restoring one asks first and then replaces the library with it, in admin section UI tests for restore.
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

### M12u - WebUI Keyboard Navigation and Focus

- **Status**: ⏳ Planned
- **Goal**: Every part of the WebUI works from the keyboard alone, and keyboard focus is always visible, in the brand orange.
- **Depends on**: WebUI In-App Dialogs, WebUI Drag Reordering, WebUI Responsive Layout and Panels, WebUI Library Tab, WebUI Tags and Filter Tabs, WebUI Auto-Pause and Photo Scrub Bar, WebUI Notifications, WebUI Settings Panel, WebUI Admin Section, Log Viewer Redesign, Recovery Page and Operator Retirement, Admin Refresh, Backup, and Duplicate Review, Admin Source Management, Admin Library Catalog Transfer, WebUI Stats Panel, WebUI Ambient Mode, WebUI Volume and Enhanced Audio, WebUI Player Controls, WebUI Keyboard Shortcuts, Testing Suite Overhaul, WebUI Grid Row Reuse and Zoom, WebUI Multi-Select and Bulk Actions, Item Ratings, WebUI Player Rating, Rating Filter and Sort, WebUI Loop Range, whose markers can be set from the keyboard, Library Profiles, whose picker and profile dialog it reaches, and Profile Tag and Preset Visibility, whose Show in and profile dialog tabs it reaches.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The focus look: keyboard focus shows as one ring in the brand orange at a little transparency, in place of the browser's own, with no extra outline, and a mouse click shows none (`:focus-visible`).
  - The ring's color is the brand orange (`#ef7f22`) at 80% opacity in the dark theme and 95% in the light theme, `rgba(239, 127, 34, 0.8)` and `rgba(239, 127, 34, 0.95)`, as the mockup sets it.
  - It is a 2 px solid outline, 2 px outside the control; buttons, fields, icon buttons, panel tabs, and drag handles draw it 1 px outside, and tag category headers 2 px inside their edge.
  - Menu items show focus as their hover highlight instead.
- In the grid, as Google Photos shows it, a focused tile gets an orange border drawn above its thumbnail, and its focused check icon turns bright white inside a thick orange ring, which starts at the icon's visible edge with no gap, reaches about 22 px from its center, and is cropped by the tile.
  - A focused tile's border is 3 px, drawn inside the tile, and a focused check icon's ring is an 11 px outline set 2 px into the icon's box.
  - The focused tile's border is a layer of its own, after the thumbnail's frame.
- The grid is one tab stop, and Tab enters it on the last tile focused, or the first.
- The arrow keys move between tiles, left and right in order and up and down to the nearest tile in the next row, without playing the previous or next item.
- Tab from a tile reaches its check icon, which shows as hovering shows it, and Space or Enter toggles it, starting selection as a click does, with focus staying on it. Tab again leaves the grid.
- Enter or Space on a tile still chooses it.
- Selection updates the tiles in place, as WebUI Grid Row Reuse and Zoom patches a tile, so focus is never lost to a redraw.
- Every other screen works from the keyboard, each control in a sensible Tab order and with an accessible name: the player's controls and seek bar; the notifications bell, its list with Clear, Close, and Notification settings, and the popups' Dismiss; the panel button and tab row, where the arrow keys, Home, and End move between tabs; the header's profile button and its picker, and Add and Edit Profile, whose tab row the arrow keys, Home, and End move along as the panel's do, with its color palette and its Tags and Presets checkboxes, and Show in in Edit Tag, Edit Category, and Edit Preset; the Library controls; the Filter tab and its sections; the Tags tab, its chips, category headers, and drag handles, and Auto Tag; the Stats tab; the Settings tab, including the Ambient mode settings section and its sliders and the Keyboard shortcuts section; the in-app dialogs; the admin view, its sections, the Log Viewer, duplicate review, and the control-token gate; and the recovery page.
- What covers the page keeps Tab inside it while open and returns focus where it was on close: the panel as a full-screen overlay, as Auto Tag and the in-app dialogs already do.
- A button that disables itself when pressed moves focus to a sensible place instead of dropping it to the page: the Filter tab's Discard changes, Clear all filters, and Apply beside the player, and the Tags tab's Save.
- The keyboard shortcuts stay as WebUI Keyboard Shortcuts binds them.
- Revisit where focus goes when Esc closes the panel or the bell's list. WebUI Keyboard Shortcuts leaves it on the page, as for every key that closes the panel, so Space plays or pauses afterwards, where before it went to the panel button or the bell.
- Where the arrow keys have a local job, in the grid, the tab row, sliders, and on a focused drag handle, they keep it instead of playing the previous or next item.

#### Traps

- The pairing prompt, the library overlay's buttons, and the grid's tiles style their focus in blue (`#7aa7ff`, and `#2563eb` for tiles in the light theme, in `src/styles.css`). In the Filter and Tags tabs and Auto Tag, the controls with the shared `.btn`, `.ctl`, and `.icon-btn` classes and the drag handles already show the orange ring 1 px outside, and the tag category headers' toggles 2 px inside; their section tabs, checkboxes, and radio buttons don't. The in-app dialogs' buttons, fields, and selects and the panel's tabs and Close show it 1 px outside too. Other controls show the browser's own ring or none.
- Every grid tile is a tab stop (`tabindex="0"` in `renderGridTileHtml`, `src/library/libraryGridTileModel.ts`), and Enter or Space on one plays it.
- The grid's keyboard model uses WebUI Multi-Select and Bulk Actions' check icons.
- In the mockup, the thumbnail's frame fills the tile and paints over anything the tile itself draws, an outline or an inset shadow alike, so a focused tile's border drawn by the tile is invisible.

#### Acceptance

- Keyboard focus shows as one orange ring on every focusable control, in both themes, and a mouse click shows none, in WebUI tests of a focus style on each kind of control.
- The grid is one tab stop: the arrow keys move between tiles without playing anything, Tab from a tile reaches its check icon, Space or Enter toggles it and starts selection with focus staying on it, and Tab again leaves the grid, in WebUI tests for the grid's tab stop, arrow keys, and check icon toggling and the focus it keeps.
- A focused tile shows an orange border above its thumbnail, and a focused check icon a thick orange ring, starting at its edge, that the tile crops, in WebUI tests of a focus style on each kind of control.
- In the panel's tab row, the arrow keys, Home, and End move between tabs, in WebUI tests of the tab row's keys.
- On every screen listed in Scope, each control is reached by Tab in a sensible order and has an accessible name, in WebUI tests of each screen's Tab order and its controls' accessible names.
- The full-screen panel keeps Tab inside it while open and returns focus on close, in WebUI tests of focus staying inside the full-screen panel.
- Pressing the Filter tab's Discard changes, Clear all filters, or Apply beside the player, or the Tags tab's Save, from the keyboard leaves focus on a control in the tab rather than on the page, in WebUI tests of where focus goes after each of those buttons disables itself.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick keyboard-only spot check.

#### Release checks

- Manual: In Chrome, Firefox, and Safari on a desktop, every screen, including the admin view and the recovery page, works with the keyboard alone, focus always shows in orange, and the Library grid's Tab, arrow, Space, and Enter keys work as described.

#### Not included

- Rebinding keys, which is Customizable Keyboard Shortcuts.

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
- Playback-session and transcode capability markers join the capability list served by `/api/version` and `/api/capabilities`.
- The WebUI types are regenerated.

#### Acceptance

- OpenAPI includes the playback-session surfaces and validates, in contract tests.
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
- Each decision is logged through the structured log API (component, operation, mode, reason), without file names or paths.

#### Acceptance

- The server chooses `direct`, `remux`, or `transcode` for each session request, and the same inputs give the same decision, in decision tests over a fixture of probe results and client hints.
- Session responses include the delivery type and a reason, in decision tests over the same fixture.
- Each decision appears in `last.log` as a structured entry without file names or paths.
- A probe result is reused for an unchanged file and probed again for a changed one, in probe-cache tests for unchanged and changed files.

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
- **Goal**: WebUI playback starts through playback sessions and handles formats the browser cannot play.

#### Scope

- WebUI playback start goes through the playback-session API.
- Direct playback is preferred when supported, with a fallback to the HLS fMP4 stream when needed.
- The WebUI's seamless loop stays on both progressive and HLS playback.
- Checks long-form buffering, seek, reconnect, and format edge cases.

#### Acceptance

- WebUI playback starts from server-issued playback sessions, in WebUI tests of session start.
- Formats the browser cannot play are handled by the server pipeline, in WebUI tests of fallback.
- Looping behaves the same on progressive and HLS playback, in WebUI tests.
- `npm run verify` passes.

#### Release checks

- Manual: Movie-length playback in the WebUI works on the long-form validation set.

### P2g - Resume Position and Session Continuity

- **Status**: ⏳ Planned
- **Goal**: The server remembers playback position for the WebUI on every device.

#### Scope

- A server-owned resume-position contract and storage, with throttled writes and clear completion and reset rules.
- Resume-position query and clear APIs.
- Resume settings (on or off, threshold windows, retention) through server settings.
- Loop iterations do not count as plays and do not create resume points.
- Resume positions are kept per server, shared by every device, until accounts exist.
- WebUI playback recovers when the server restarts mid-video: the player notices the media error, waits for the server to come back, requests a fresh media link for the same item, and continues from the same position.
- Requesting the fresh link does not count as a new play.

#### Traps

- When the server restarts mid-video, the WebUI player does not recover, even when the server is back before the buffered part runs out (measured).
- Media tokens are held only in memory, so a link issued before the restart returns not found afterward.
- The server cuts media downloads still in progress when it starts stopping, so the player's download fails as the stop begins rather than when a timeout runs out.
- `POST /api/play/{itemId}` records a play today.

#### Acceptance

- Resume position survives reconnects and restarts through server state, in server tests for recording.
- The WebUI resumes from the server's position on every device, in client tests for resume.
- Clearing a resume position works and is visible on every device, in server tests for clearing.
- Resume settings are stored and enforced by the server, and documented, checked by reading the docs.
- After a server restart mid-video, the WebUI continues the same item from the same position without recording a new play, in a WebUI test that a media error during a server restart fetches a fresh link and continues from the same position without recording a play.
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
- The WebUI's files and `/runtime-config.json` stay open without a session, as Reverse Proxy and HTTPS Access left them, so WebUI Login Gate can load before login.
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
- Remove `pairToken` from the WebUI's `public/runtime-config.json` and `src/config/runtimeConfig.ts`, and its example from the WebUI `README.md`.
- The login flow that replaces the WebUI's pairing request returns a typed result on every failure.

#### Traps

- v0.14.0 kept the `adminAuthMode` field read-only (always `TokenRequired`, posted values ignored) so the contract changes only once.
- `/api` routes still accept the API pairing token as a `token` query, and `GET /api/pair?token=` pairs with it, which puts the token in URLs and in the default request log.
- v0.14.0 stopped accepting the control token in a query and made `/control/pair` POST-only, but left `/api` for this cutover.
- `/api/web-runtime/settings` is on the API plane, so any LAN caller with the API pairing token, which `/runtime-config.json` hands to every browser, can turn WebUI auth off, change the port or remote connections, and read the shared token.
- `/api/web-runtime/settings` stayed on the API plane because the desktop called it from other machines, and Desktop Client Removal removed the desktop.
- `OperatorTestingService` mutations are protected only by middleware policy.
- Auth and secret fields in settings DTOs encourage credential leakage; `GET /control/settings` returns the admin token.
- Pairing and control-token problems that go with those flows:
  - Two pairing secrets drift apart: `/api/pair` checks `ServerRuntimeOptions.PairingToken`, while the Operator page, and later the admin section, saves `WebRuntimeSettings.SharedToken`, and `src/core/ReelRoulette.ServerApp/Program.cs` starts with `SharedToken ?? PairingToken` and passes that to a restarted server. Editing the shared token has no effect until a restart, then silently changes the pairing token.
  - `WebRuntimeSettings.AuthMode` is saved by `CoreSettingsService.UpdateWebRuntimeSettings`, but `ServerPairingAuthMiddleware` reads only `RequireAuth`, which the server sets from `AuthMode` only at startup, so setting it to `Off` changes nothing until a restart.
  - `RestartCoordinator.TryLaunchReplacementProcess` in `Program.cs` passes the token to the child as the `CoreServer__PairingToken` environment variable, which other local users can read from `/proc/<pid>/environ` on Linux.
  - The WebUI ships `"pairToken": "reelroulette-dev-token"` in `public/runtime-config.json`, which any browser can fetch, and `src/config/runtimeConfig.ts` parses `pairToken` as a config field.
  - The same `reelroulette-dev-token` default is in `src/core/ReelRoulette.ServerApp/appsettings.json` and the `-PairingToken` parameter of `tools/scripts/run-server.ps1`.
  - The WebUI's pairing request lets a network error reject instead of reporting it in an in-app notice, as the other failed pairing outcomes do.

#### Acceptance

- LAN and remote requests without a valid session get a deterministic auth error on every API and control route and on the event stream, in authorization tests across library, playback, source, event stream, admin, and testing routes for localhost, admin, user, and no session.
- The admin section and the recovery page use account sessions, and no control token is accepted anywhere, in the authorization tests for admin routes.
- User-level accounts are refused on admin-only operations, in the authorization tests for user sessions.
- LAN and remote requests to web runtime settings without an admin session are refused, in the authorization tests.
- No settings response contains a secret, in server tests.
- Active docs no longer describe pairing or control tokens, checked by reading them.

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
  - Two stats per file: the fingerprint stage's check loop stats each file once, or reuses the size and write time the walk already read.
- Needless work:
  - Telemetry reads: `ApiTelemetryService` keeps a ring buffer that reads newest first.
  - Session list under lock: `ServerSessionStore.GetActiveSessions` copies the records under the lock and sorts outside it.
  - Dead write-back: `DynamicCorsOriginRegistry` keeps the rebuilt list only in the registry.

#### Traps

- Storage:
  - Stalled source: the source walk (`EnumerateMediaFiles`, which calls `Directory.EnumerateFiles` with `AllDirectories`) and the fingerprint stage's check loop have no timeout and run synchronously on one thread pool thread.
  - With the media on a soft CIFS mount whose server answered slowly, the largest source's walk took 17 min 48 s against 8.5–15 s normally, the check loop advanced one file every 50–65 s, and the run took 48.5 min against 3.5–6.5 min (measured).
  - `Directory.EnumerateFiles` with `AllDirectories` throws on an I/O error rather than returning a partial list.
  - A source whose folder lists no media files while the library holds items from it already keeps them, with a `last.log` warning.
  - Two stats per file: the check loop calls `File.Exists` and then `new FileInfo` for every item, about 98,000 stats on a 49,100-item library, which take 3.4–4.6 min, about 2.1–2.8 ms a stat (measured).
- Needless work:
  - Telemetry reads: `ApiTelemetryService.GetIncoming` and `GetOutgoing` call `Reverse()` over the whole queue on every control status poll.
  - Session list under lock: `ServerSessionStore.GetActiveSessions` filters, sorts, and projects inside the session lock.
  - Dead write-back: `DynamicCorsOriginRegistry.RebuildAllowedOrigins` writes the rebuilt list back into the shared `ServerRuntimeOptions.CorsAllowedOrigins`, which nothing reads after the registry's constructor.

#### Acceptance

- A refresh stops working on a source whose storage stops responding, keeps that source's items, and logs a warning, in its finding's tests with a source whose walk stalls and one whose file checks stall.
- The check loop stats each file once, in its finding's test.
- Each finding above is fixed or explicitly declined with a reason in this entry.
- Each fixed finding has a test.
- `dotnet test ReelRoulette.sln` passes.

#### Not included

- The server's own settings findings (partial posts, the non-atomic write, and the silent load failure), which is Server Settings Robustness, since the admin section saves server settings from any device.
- Logging slow sources and refresh durations, which is Server Instrumentation.
- Telling a file the server can't read from a missing one in the media and play routes, which is Browser-Playable Filter.
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

### P52 - Long-Press Tooltips on Touch Screens

- **Status**: ⏳ Planned
- **Goal**: On a touch screen, long-pressing an element with a tooltip shows the tooltip as a tip beside the element, so icon names and disabled buttons' reasons can be read without a mouse. Low priority, after Animations.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- On a touch screen, long-pressing any element with a tooltip shows it as a tip beside the element, icon names and disabled buttons' reasons alike.
- The tip shows while the press is held and for about 1.5 seconds after release.
- A long press never also presses the button.
- Elements that already use holding or a long press keep their behavior: dragging presets and tag categories, and the player's taps.
- Desktop hover is unchanged.
- The blocked Apply keeps its press-to-show notice.
- The mockup comes first, and the user reviews it on the iPad and an Android phone before the app is built.

#### Traps

- Tooltips are `title` attributes, which a phone or tablet doesn't show, so the blocked Apply shows its reason in a notice when pressed instead (`blockedReason` on `HeldButton` in `src/ui/FieldValidation.tsx`).
- `HeldButton` gives a disabled or held action's reason as its `title` and accessible description.
- A disabled button gets no pointer or click events in some browsers, so its long press has to be caught around it (inferred).
- Safari on iOS and Chrome on Android show their own callout, menu, or text selection on a long press (inferred).
- Reordering presets and tag categories starts a drag on pointer down on a row's handle (`src/ui/Reorder.tsx`).
- The player's taps and swipes are handled in `src/playback/mediaGestures.ts`, which ignores the click the browser sends after a swipe or a handled tap.
- WebUI Multi-Select and Bulk Actions starts a selection with a long press on a tile.

#### Acceptance

- On a touch screen, a long press on an element with a tooltip shows its tip beside it while held and for about 1.5 seconds after release, without pressing it, in WebUI tests of long-press tips with touch pointers.
- A long press on a disabled button shows its reason, in WebUI tests of long-press tips on disabled buttons.
- Dragging presets and tag categories, the player's taps, and the blocked Apply's notice work as before, in their existing tests and WebUI tests of a long press on each.
- A mouse shows no tip on a long press, in WebUI tests with a mouse pointer.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the iPad and an Android phone.

#### Release checks

- Manual: On the iPad and an Android phone, long-pressing an icon button and a disabled button shows its tip without pressing it.

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

- WebUI Multi-Select and Bulk Actions acts on a selection through its Actions menu, and its Select all selects every item that matches the search and filters, loaded or not.

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

#### Acceptance

- Ctrl+scroll, a trackpad pinch, and a touch pinch zoom into the playing photo and video, in WebUI tests of player zoom.
- Panning moves the zoomed view, in WebUI tests of player zoom.
- A pinch is told apart from a two-finger volume drag, and panning from a swipe and a double-tap, in gesture tests.
- The zoom resets as the approved mockup shows, in WebUI tests of player zoom.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check in a desktop browser and on the iPad.

#### Release checks

- Manual: In a desktop browser with Ctrl+scroll and on the iPad with a pinch, zooming into a playing video and panning it works, and a swipe outside a zoomed view still plays the next item.
