# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. Each release becomes a new `M*` series when it is promoted.

The WebUI becomes the only client on every device. Until the desktop removal release, the desktop client gets no significant changes or new features: bug fixes (crashes, data loss, broken playback, security) and small changes that keep it working with the server, or that match a small server-side change, are allowed. Until then server contract changes only add fields, so the last desktop build keeps working. The native Android client is dropped.

- **v0.15.0 — WebUI overhaul**: Serve the WebUI over HTTPS so it installs as an app, move it to Preact, design the release's UI in one approved mockup, roll out the new logo and icons, give it a responsive layout with a side panel and phone overlays, and give it everything the desktop does: keyboard shortcuts and full keyboard navigation, volume and loudness normalization, stats, settings, an admin section that replaces the Operator page and manages refresh, backups, duplicates, sources, and catalog transfer, Show in File Manager, a browser-playable filter, and multi-select. The desktop still ships as a fallback, and its last build tells users it is retired. M12a, M12b, M12c, M12d, M12e, M12f1, M12f2, M12f3, M12f4, M12f5, M12f6, M12f7, M12g, M12h1, M12h2, M12h3, M12i, M12j, M12k, M12l, M12m, M12n1, M12n2, M12n3, M12n4, M12n5, M12o, M12p, M12q, M12r, M12s1, M12s2, M12t, M12u, M12v.
- **v0.16.0 — Desktop removal**: Remove the desktop client, its packaging, and its tests, then move preset writes to per-preset routes. P48, P25.
- **v0.16.1 — Structured log foundation**: Write `last.log` as structured JSON Lines through one server writer and give the WebUI a typed, privacy-safe log API. P27a, P27b.
- **v0.17.0 — Accounts**: Require an account PIN from LAN and remote clients, with per-user source access. P28b, P28c, P28d, P28e, P28f, P28g, P28h, P28j, P28k, P28l.
- **v0.18.0 — Structured log migration and Log Viewer**: Move every server and WebUI log to the structured API and give the admin section a filterable Log Viewer. P27d, P27e, P27f, P27g.
- **v0.19.0 — Playback sessions**: Let the server choose direct, remux, or transcode playback per session for the WebUI. P2a, P2b, P2c, P2d, P2f, P2g, P2h.
- **Unscheduled backlog**: P1, P4, P5, P6, P9a, P9b, P10, P33, P35, P36, P50.

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
- The Depends on bullet names milestones by their exact titles, which `check-milestones.ps1` enforces, and may end with a condition on starting, as the Entry Format describes.
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

Last milestone completed: M12d

### M12e - Favorite and Blacklist Filter Modes

- **Status**: 🚧 In Progress
- **Goal**: The Favorites and Blacklisted filters each choose only or excluded, in the server and both clients, so a filter such as Favorites excluded or Blacklisted only works the same in browse, random picks, and presets.
- **Depends on**: WebUI Design Mockup, whose mockup approves its look.
- **Design**: `docs/mockups/reelroulette/`, including the filter dialog specimen on its field validation page (`build/validation.src.html`).

#### Decisions

- Each filter is a checkbox with a small dropdown to its right offering only and excluded, and the dropdown is disabled while its checkbox is off. Favorites starts off. Blacklisted starts on and excluded, which is today's Exclude blacklisted.
- Both clients offer the same options, so a preset behaves identically in each.
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
| Server | ⏳ Planned | The new fields in the schema and the parser, applied by browse, its counts, and random selection. |
| Shared client rules | ⏳ Planned | Both clients read the modes by the resolution rule, write the old-field projection, and match presets and patch tiles by resolved modes. |
| Desktop | ⏳ Planned | The filter dialog's dropdowns, the summary line's new names, and no preset posts on header picks or unchanged Applies. |
| WebUI | ⏳ Planned | The filter dialog's two controls, and the mockup updated to match. |

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
- The FilterState schema names the new fields, the Core test that its property names equal the parser's passes, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Shared client rules slice

**Scope**

- Both clients' filter models gain the two modes, read them through the resolution rule, and write the old-field projection: the desktop's `FilterState.cs` and the WebUI's `filterStateModel.ts`. Desktop and WebUI tests read `filter-mode-resolution.json`.
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

**Acceptance**

- The desktop and the WebUI resolve every case in `filter-mode-resolution.json` as the server does, in desktop and WebUI tests.
- Every filter either client sends or saves carries the new fields and the old fields' projection, in desktop filter serialization tests and the WebUI's `filterStateModel.test.ts`.
- Preset matching compares resolved modes, so old and new fields that resolve alike match, and both clients pass `preset-filter-equality.json` with its new cases.
- Both clients pass `library-tile-effect.json` with cases for the new modes.
- The server's filter parser and the WebUI's filter reader read `audioFilter`, `mediaTypeFilter`, and the values of `categoryLocalMatchModes` alike, as names in any case or as integers, and both pass `filter-enum-values.json`.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Desktop slice

**Scope**

- The filter dialog (`FilterDialog.axaml`) replaces its Favorites only and Exclude blacklisted checkboxes with the two checkboxes and their dropdowns, a small change matching the server's, which the desktop's freeze allows.
- `FilterDialog.axaml.cs` copies the new fields in each of the three places it copies fields one by one: the change notifications on preset load, Clear All, and Apply's copy back to the main window.
- The new modes are written as names through a converter on each property, such as `JsonStringEnumMemberName`. A converter on the property also overrides the library query's `JsonStringEnumConverter`, so the desktop sends one form everywhere.
- The filter summary line above the library panel (`UpdateFilterSummaryText` in `MainWindow.axaml.cs`) names "Favorites only", "Favorites excluded", and "Blacklisted only". Blacklisted excluded, the default, isn't named, as in the mockup. Today it shows "Favorites" for Favorites only and never names Blacklisted.
- A header preset pick, None included, posts no presets, and a filter dialog Apply posts presets only when they changed, compared with the preset list comparison in `LibraryPresetSelection`. Before removing the post from header picks, confirm what it does today and report anything besides saving the list that depends on it.

**Traps**

- The desktop reads presets with default JSON options (`ParseCorePresetFilterState` in `MainWindow.axaml.cs`), so an enum written as a name throws, and the catch turns the whole preset into the default filter (measured).
- `SyncPresetsToCoreAsync` posts the desktop's cached preset list to `POST /api/presets`, which replaces the server's whole catalog, on every header preset pick and every Apply, and the cache is refreshed only on connect, reconnect, resync, and filter dialog open. Picking a preset on the desktop therefore deletes any preset the WebUI added since.
- Apart from the server raising its catalog revision, nothing else was found to depend on the post.

**Acceptance**

- The desktop's filter dialog shows a checkbox and an only-or-excluded dropdown for Favorites and for Blacklisted, in desktop filter dialog tests.
- A preset the WebUI saves with each mode loads in the desktop with that mode, in desktop tests.
- A header preset pick posts no presets, and a filter dialog Apply posts presets only when they changed, in desktop tests.
- The filter summary line names Favorites only, Favorites excluded, and Blacklisted only, in desktop tests.
- `dotnet test ReelRoulette.sln` passes, and one quick spot check in the desktop.

#### WebUI slice

**Scope**

- Today's filter dialog gains the two controls. WebUI Responsive Layout and Panels carries them into the Filter tab as the mockup shows.
- The mockup's field validation page (`build/validation.src.html`), whose filter dialog specimen still shows the Favorites only and Exclude blacklisted checkboxes, gets the new controls.

**Acceptance**

- The WebUI's filter dialog shows a checkbox and an only-or-excluded dropdown for Favorites and for Blacklisted, in WebUI filter dialog tests.
- A preset the desktop saves with each mode loads in the WebUI with that mode, in WebUI tests.
- The mockup, including its field validation page, matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check in the WebUI.

#### Release checks

- Agent: The v0.15.0 release notes tell desktop users to update the desktop along with the server.
- Manual: In the WebUI and the desktop, Favorites excluded and Blacklisted only each limit browse and random play as named, and a preset saved in one client shows the same filter in the other.

#### Not included

- Keeping a preset's stored modes when a desktop older than this milestone posts it without the new fields, since desktop and server are updated together for v0.15.0.
- Name matching for the browser-playable field's values, which is Browser-Playable Filter.

### M12f1 - WebUI Field Validation Pattern

- **Status**: ⏳ Planned
- **Goal**: A field that holds a value that is not valid says so as it is typed, through one reusable pattern for the whole WebUI, and typed durations are parsed strictly.
- **Depends on**: WebUI Preact Migration and WebUI Design Mockup.
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
- A held action's label dims and the red icon shows on its right, and pressing it does nothing but move to the first field that holds it, switching the filter dialog's section when needed.
- A filter dialog section with a flagged field shows the red icon after its name, so the field can be found from another section.
- Typed durations are parsed strictly: whole MM:SS or HH:MM:SS with minutes and seconds under 60, or a number of seconds.
- Durations in presets and filters from the server, which can carry fractional seconds from the desktop, such as "00:01:30.5000000", are read as today.
- The pattern replaces today's duration check at Apply: Apply no longer writes either invalid-duration message to the status line or to `last.log`.
- The filter dialog's new preset name is flagged as it is typed, and Add Preset can't proceed while it is empty or taken. The pattern replaces both of Add Preset's status line messages.
- The Edit Tag dialog's emptied tag name is flagged, and Save can't proceed while it is empty. The pattern replaces "Tag name is required.".
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
- While a duration is not valid, Apply can't proceed, including when nothing else changed, and Apply never writes an invalid-duration message to the status line or `last.log`, in WebUI tests of the held action with and without other changes and of the status line and `last.log`.
- A held action shows the red icon on the right of its label. Pressing a held Apply moves to the field that holds it, switching to General when needed, and applies nothing, in WebUI tests of the held action moving to the field.
- A typed duration such as "1:7x", "12abc", or "1:75" is flagged, and a preset whose duration the server sends with fractional seconds, such as "00:01:30.5000000", loads as it does today, in WebUI tests of strict typed durations and of a server preset with fractional seconds.
- A new preset name that is emptied after typing, or that matches a saved preset's name ignoring case, is flagged with the field validation pattern; Add Preset can't proceed while the name is empty or taken; and neither "Enter a preset name." nor "A preset with that name already exists." shows on the status line. Shown by WebUI tests of the pattern on the new preset name.
- An Edit Tag dialog tag name that is emptied is flagged with the field validation pattern, its Save can't proceed while the name is empty, and "Tag name is required." no longer shows, in WebUI tests of the pattern on the Edit Tag name.
- After an unsaved preset change in the filter dialog, Refresh keeps the change and Apply's star, and Apply then saves it, in a WebUI test of Refresh after an unsaved preset change.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Not included

- Turning the filter dialog and the tag editor into the Filter and Tags tabs, which is WebUI Responsive Layout and Panels.
- Fields that later milestones add: each uses the pattern for its own fields that can hold a value that is not valid, starting with WebUI In-App Dialogs.
- The dialog side of the WebUI's message rule, which is WebUI In-App Dialogs.
- The status line side of the WebUI's message rule, which is WebUI Status Line Overhaul.

### M12f2 - WebUI In-App Dialogs

- **Status**: ⏳ Planned
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
- The Edit Category and Edit Preset names use the field validation pattern. They are flagged when emptied, or when another category or preset has the name, ignoring case, and Save can't proceed meanwhile.
- Their tooltips are "Enter a category name." or "Enter a preset name." for an empty name and "Use a name no other category has." or "Use a name no other preset has." for a taken one.
- They replace the alert "Category already exists." and the status message "That name is already in use.".
- The tag editor's two **Discard changes?** confirmations and its new category name move to the component, keeping their wording.
- New category's name uses the field validation pattern: an empty name is flagged in the field as it is typed, and the dialog can't be confirmed with it.
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

#### Acceptance

- The WebUI calls no `prompt`, `confirm`, or `alert`, in a check that no native dialog calls remain.
- Every dialog matches the WebUI's theme and shows and works in fullscreen, in WebUI tests of the dialog component showing in fullscreen.
- A delete confirmation opens stacked above its edit dialog, with Cancel focused and a red Delete. Escape or a click outside closes only the top dialog, and focus returns to where it was. Enter in a dialog's field saves it. Shown by WebUI tests of the dialog component's stacking, Escape and a click outside, Enter, Cancel focus, and focus returning.
- Chips have no delete icon, and category and preset rows have no rename or delete icons. Edit Tag, Edit Category, and Edit Preset each have Delete, which asks first with today's wording, in WebUI tests of the edit dialogs with Delete asking first and canceling.
- An Edit Category or Edit Preset name that is emptied, or that another category or preset has ignoring case, is flagged with the field validation pattern, and its Save can't proceed. Neither "Category already exists." nor "That name is already in use." shows. Shown by WebUI tests of both names with the field validation pattern.
- The tag editor's Close and Refresh confirmations and new category name use the dialog component, keep their wording, and confirming or canceling does what it does today, apart from the name check, in WebUI tests of confirm and cancel on each converted dialog.
- In new category, an empty name is flagged with the field validation pattern as it is typed, and the dialog can't be confirmed until the name is corrected, in WebUI tests of the new category name.
- A notice shows its message in the in-app dialog and is relayed to `last.log` with the text a status message with that wording is relayed with today, in a WebUI test of a notice and its `last.log` line.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check in an installed web app.

#### Release checks

- Manual: Every in-app dialog matches the WebUI's theme and works in an installed web app on desktop and on mobile, including in fullscreen.

#### Not included

- Replacing the category and preset rows' up and down icons with a drag handle beside the Edit button, which is WebUI Drag Reordering.
- Removing the tag editor's Close confirmation once unsaved changes survive closing the panel, which is WebUI Tags and Filter Tabs.
- Sorting today's status line messages by the message rule and moving those that belong in a dialog or a field, which is WebUI Status Line Overhaul.

### M12f3 - WebUI Drag Reordering

- **Status**: ⏳ Planned
- **Goal**: Tag categories and presets reorder by dragging a handle, or with the arrow keys on it, instead of up and down icons.
- **Depends on**: WebUI In-App Dialogs, whose Edit button the drag handle sits beside.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Tag categories and presets reorder by drag and drop instead of up and down arrows, and the rows' up and down icons go.
- Each row has a visible drag handle, the only place a drag starts, so dragging elsewhere on a row still scrolls on a touch screen.
- The up and down arrow keys move a row while its handle has focus, and screen readers hear the new position.
- Uncategorized stays last, as today, and shows its handle dimmed and disabled, so its name lines up with the other categories'.
- A new order stays pending until Save or Apply, as a move does today.

#### Acceptance

- Category and preset rows have no up or down icons, and each has a drag handle beside its Edit button.
- Tag categories and presets reorder by dragging their handle, and with the up and down arrow keys on a focused handle. A drag that starts elsewhere on a row scrolls instead, screen readers hear the new position, and Uncategorized stays last with its handle disabled. Shown by WebUI tests of reordering with the arrow keys and of the drag logic deciding where a dragged row lands.
- A new order stays pending until Save or Apply.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check of dragging on a touch screen.

### M12f4 - WebUI Responsive Layout and Panels

- **Status**: ⏳ Planned
- **Goal**: The WebUI layout adapts to the viewport: on tablets and desktops a side panel beside the player keeps the video in view while browsing, filtering, or tagging, and on phones the panel is a full-screen overlay.
- **Depends on**: WebUI Preact Migration, WebUI Design Mockup, and New Logo and Icons, whose logo the header shows, and Favorite and Blacklist Filter Modes, whose filter controls the Filter tab carries, and WebUI In-App Dialogs, whose dialogs open inside the panel.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The main page is a header bar, the player with its overlay controls, and the footer status line, as today.
- The header holds the logo, which New Logo and Icons puts there in place of the app name, and the current file name.
- The header has no settings icon: the Settings tab is reached from the panel's tab row.
- Photo duration stays in the header.
- The preset dropdown and randomization mode stay in the header.
- The pairing token prompt keeps showing in the header, labeled "Pairing token", when the server asks for pairing.
- Before anything plays, the player says "Tap to play, or open the panel to choose a preset or filter." in place of today's "Click here to play (choose a preset or open Filter…)", and a tap or Play starts a random pick, as today.
- When the server fails the compatibility check, the panel still opens, the Library tab shows the compatibility message in place of the grid, and Play shows its notice.
- A panel host: at most one panel is open at a time.
- Below 800 px of viewport width, or on a touch screen (coarse pointer) below 500 px of viewport height, the panel is a full-screen overlay with the same tabs; otherwise it sits beside the player.
- The breakpoints use viewport size and pointer type, not the user agent.
- Beside the player, the panel sits on the right by default or on the left as a per-device setting.
- A drag handle between the panel and the player sets the panel's width, from 360 px to whatever leaves the player 400 px wide, starting at 420 px. The handle also takes the arrow keys while it has focus.
- The panel has a single row of icon-only tabs: Library, Filter, Tags, Stats, and Settings, each with a tooltip and an accessible name.
- Library, Filter, and Tags keep the icons the player's buttons for them use today (`browse`, `filter_alt`, and `tag`).
- This milestone builds the Library, Filter, and Tags tabs from the library overlay, filter dialog, and tag editor, moved in as they are.
- The player's Library, Filter, and Tags buttons give way to one panel button, which opens the panel on its last tab, Library the first time, and closes the panel when it is open.
- The panel button's icon shows the panel's side and whether it is open (`right_panel_open` and `right_panel_close`, or their left counterparts), and it is orange while the panel is open.
- Favorite and Blacklist stay on the player.
- Choosing a tile in the Library tab plays it in the player beside the panel. As the overlay, choosing a tile plays it and closes the overlay, as the library overlay does today.
- Beside the player, the Filter tab's Apply and Cancel leave the panel open. As the overlay they close it, as the filter dialog does today.
- The Tags tab keeps the tag editor's pause and resume, and the other tabs leave playback going.
- The WebUI remembers its per-device state across a page refresh, as the desktop remembers its own across restarts.
- This milestone adds one per-device store and remembers in it whether the panel is open, its side, width, and last tab.
- The panel and the dialogs stay inside the fullscreen stage, so they work in fullscreen as the overlays do today, including iOS pseudo-fullscreen.
- Phone layouts work in an installed app (standalone display, safe-area insets).
- A phone on its side, by the overlay's short-screen rule (a touch screen below 500 px of viewport height): the header and status line hide and the player fills the screen, as in fullscreen but without the browser's fullscreen mode.
- On a phone on its side, the panel, as the overlay, and the dialogs still open, in layouts that fit a short screen.
- A tablet in landscape, at 500 px or more, keeps the normal layout.
- While the server asks for pairing, the header shows on a phone on its side anyway, so its prompt can be reached.
- While the status line is hidden, on a phone on its side or with WebUI Settings Panel's Show the status line off, a small indicator on the player shows while the connection is lost and reconnecting.

#### Traps

- The tag editor, filter, and library overlays are each `position: fixed; inset: 0` with `z-index: 1000`, so they cover the player while it keeps playing underneath (measured).
- The tag editor pauses playback when it opens and resumes it when it closes (`pauseForTagEditor` and `resumeAfterTagEditor`).
- The stylesheet has two `@media (max-width: 600px)` rules (measured).
- Mobile browsers are detected by user agent (`getClientType` in `src/api/coreApi.ts`) (measured).
- When the server fails the compatibility check, the library overlay doesn't open (`open` in `src/library/library.ts`), and play, pairing, and events stop.
- Browser storage is kept per address, so on one device the WebUI opened at `localhost`, at the LAN address, and through an HTTPS proxy remembers three separate sets of state (inferred).

#### Acceptance

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
- The panel works in fullscreen.
- On a touch screen below 500 px of viewport height, the header and status line hide and the player fills the screen without the browser's fullscreen mode, and the panel and dialogs open in layouts that fit; a tablet in landscape keeps the normal layout. Shown by component tests of the short-screen layout of a phone on its side.
- As an installed app on a phone, the header, the panel, and the player's controls stay clear of the safe-area insets, in component tests of safe-area insets in a standalone display.
- The layout does not depend on the user agent, in panel host tests of the breakpoints by width and by pointer and height.
- Before anything plays, the player shows "Tap to play, or open the panel to choose a preset or filter.", and a tap or Play starts a random pick.
- When the server fails the compatibility check, the panel opens, the Library tab shows the message in place of the grid, and Play shows its notice, in component tests of the compatibility-failure state.
- On a phone on its side the header shows while the server asks for pairing, and while the status line is hidden a reconnecting indicator shows on the player when the connection is lost. Shown by component tests of the short-screen layout and of the reconnecting indicator.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone and a desktop browser.

#### Release checks

- Manual: On a phone, a tablet, and a desktop browser, and as an installed app on Android and iOS, the panel opens beside the player or as an overlay by width, and a phone on its side fills the screen with the player.

#### Not included

- The header's admin icon at its right, which is WebUI Admin Section.
- Moving photo duration from the header into the Settings tab, which is WebUI Settings Panel.
- Moving the preset dropdown and randomization mode from the header into the Library tab, which is WebUI Library Tab.
- Choosing the panel's side in the Settings tab, which is WebUI Settings Panel.
- Reworking the Library tab, which is WebUI Library Tab.
- Reworking the Tags and Filter tabs, which is WebUI Tags and Filter Tabs.
- The Stats tab, which is WebUI Stats Panel.
- The Settings tab, which is WebUI Settings Panel.
- Replacing the tag editor's pause and resume, which is WebUI Auto-Pause and Photo Scrub Bar.
- Per-device state that later milestones add, which each remembers in the same store: WebUI Library Tab, WebUI Tags and Filter Tabs, WebUI Settings Panel, the player milestones, and duplicate review in Admin Refresh, Backup, and Duplicate Review.
- The playing item and its position, which is Resume Position and Session Continuity.
- Admin and duplicate review as panel tabs. They open in a full-page admin view, which is WebUI Admin Section.

### M12f5 - WebUI Library Tab

- **Status**: ⏳ Planned
- **Goal**: The Library tab holds the library's controls above a grid of smaller tiles, laid out like the desktop library panel, with a line that sums up the applied filters.
- **Depends on**: WebUI Responsive Layout and Panels, whose panel holds the tab, and Favorite and Blacklist Filter Modes, whose modes the filter summary line names.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The preset dropdown and randomization mode leave the header for the Library tab.
- The Library tab is laid out like the desktop library panel: above the grid, the preset, then randomization mode, then sort with its direction toggle, then search.
- The preset and randomization dropdowns share one row from a panel width of about 440 px.
- The controls collapse to give the grid more room, together with the filter summary line below, and stay collapsed or open per device.
- The collapse button's tooltip reads "Hide controls & filters" or "Show controls & filters".
- The Library tab's justified rows fit the panel width, 100–240 px high, aiming for 160 px, beside the player and as the overlay.
- When nothing matches the search or the filters, the grid says "Nothing matches the search or filters."; its other messages stay as they are today.
- The favorite and blacklist icons on tiles lose their dark rectangle and become filled icons, by the icon font's FILL axis, with a soft drop shadow, so they stay readable on bright thumbnails.
- The playing tile shows a filled play icon in its middle, modest in size and slightly translucent so the thumbnail shows through, in the same style.
- With a mouse, hovering a tile shows its file name as a tooltip.
- File names keep showing on tiles.
- Filled icons, these and the check icons WebUI Multi-Select and Bulk Actions adds, are plain flat shapes, at the font's FILL 1, weight 700, and optical size 20, as today's badges use (`.library-grid-tile-badge-icon` in `src/styles.css`).
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

#### Not included

- The setting that turns off file names on tiles, which is WebUI Settings Panel.
- The tile check icons, which is WebUI Multi-Select and Bulk Actions.

### M12f6 - WebUI Tags and Filter Tabs

- **Status**: ⏳ Planned
- **Goal**: The Tags tab follows the playing item, unsaved Tags and Filter changes survive closing the panel, tag categories collapse and show what's in use, and Auto Tag opens over the whole page.
- **Depends on**: WebUI Responsive Layout and Panels, whose panel holds the tabs, and WebUI In-App Dialogs, whose dialog Refresh asks in, and WebUI Drag Reordering, whose handle a category header keeps.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The Tags tab edits the playing item's tags and follows the playing item when it changes, unless the tab has unsaved changes to its item's tags.
- With unsaved changes to its item's tags, the Tags tab stays on that item and shows a line naming it, "Editing tags for {file name}", until those changes are saved or discarded (Refresh discards them, asking first), and then follows the playing item.
- Unsaved changes that are not to the item's tags, such as a category reorder or rename, don't hold the Tags tab on its item.
- Unsaved changes survive closing the panel and switching tabs: the Filter tab's until Apply or Cancel, and the Tags tab's until Save, or Refresh, which discards them after asking.
- The tag editor's Close confirmation, which WebUI In-App Dialogs moved to its dialog, goes away.
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
- Auto Tag's Close is disabled while a scan runs, as the tag editor's Refresh and Close are today.
- Auto Tag's Apply sits at the right of its footer with Cancel to its left.
- Auto Tag's Cancel clears the scan and closes Auto Tag, while the X at the top right closes it and keeps the last scan; both wait while a scan runs.
- With View all matches, files that already have the tag show checked and disabled, so they can't be unchecked.
- Each scan starts with nothing checked, as today, and Select all checks everything.
- Auto Tag's results area shows a placeholder before any scan, "Scan to find files whose names contain a tag's name.", and a different one when a scan finds nothing, "No file names contain any tag's name.".
- Auto Tag's Total matched and To be changed counts each line up under their own header, with room between the two columns.
- The Filter tab's message for a library with no tags reads "No tags yet. Add them in the Tags tab." in place of "No tags available. Use Edit tags to create tags.".

#### Traps

- The tag editor takes the item playing when it opens (`open` in `src/tags/tagEditor.ts`), and its pause keeps that item on screen while it is open.
- Closing the tag editor asks "Discard changes?" when it has changes (`close` in `src/tags/tagEditor.ts`).
- Reopening the filter dialog rebuilds its draft from the applied filter and the server's presets, dropping unsaved filter and preset changes (`open` in `src/filter/filterDialog.ts`).
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
- The Filter tab's no-tags message names the Tags tab.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Not included

- Pointing the Tags tab at several selected items, with "Editing tags for {n} items", which is WebUI Multi-Select and Bulk Actions.
- Pausing playback for Auto Tag, which is WebUI Auto-Pause and Photo Scrub Bar.

### M12f7 - WebUI Auto-Pause and Photo Scrub Bar

- **Status**: ⏳ Planned
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
- The mode is fixed at Responsive.
- On a photo, the player's scrub bar stays in its place, so the controls keep their place between photos and videos.
- While a photo's timer runs, with Autoplay on and Loop off, the bar fills as the timer runs, showing when the next item plays, with the time shown as elapsed and photo duration.
- With Autoplay on and Loop off, Play/Pause pauses and resumes the photo's timer, keeping the time left, and dragging the scrub bar moves the timer's position.
- With Autoplay off or Loop on, Play and the scrub bar are disabled on a photo, and the time is blank. Loop on restarts the same photo, so the bar does not fill then.
- Turning Autoplay on starts the photo's full time from that moment, and turning it off clears the timer.
- Auto-Pause still resumes a photo with the time it had left.
- Checkboxes, radio buttons, sliders (the scrub bar and, from WebUI Volume and Enhanced Audio, the volume slider among them), and other native controls use the app's orange accent instead of the browser's default blue, in both themes, set once for the whole WebUI with `accent-color`.
- The overlay's time display stays light in both themes, like the overlay's other controls, since the player stays dark.

#### Traps

- The tag editor's resume restarts a held photo: `resumeAfterTagEditor` in `src/playback/player.ts` calls `playCurrent`, which reloads the photo and starts its full duration.
- `playCurrent` hides the seek row for a photo.
- Play does nothing on a photo (`playOrPause` in `src/playback/player.ts` acts only on a video).
- Nothing sets `accent-color` (`src/styles.css`).
- `--time-display-fg` is `#1a1d21` in the light theme (`src/styles.css`), while the overlay's buttons use `--icon-foreground`, white in both themes, so the time turns dark on the dark player.

#### Acceptance

- With Auto-Pause on Responsive, opening the panel beside the player leaves playback going, opening it as a full-screen overlay pauses it, and an open panel that crosses a breakpoint pauses or resumes as it comes to cover the player or moves beside it, in component tests of Auto-Pause at phone and desktop widths and across a breakpoint.
- With Auto-Pause on Always, opening the panel pauses playback at every width; on Never, opening it never pauses. Shown by component tests of Auto-Pause in each mode at phone and desktop widths.
- Under Always and Responsive, opening Auto Tag pauses playback, in component tests of Auto-Pause with Auto Tag.
- Closing the panel or Auto Tag resumes playback only if Auto-Pause paused it, playback the user paused stays paused, and playing or pausing while the panel is open leaves playback as it is on close, in component tests of Auto-Pause with playback the user paused or resumed.
- Auto-Pause holds a photo's autoplay timer while it pauses, and the photo then resumes with the time it had left, in a component test of a photo resuming with the time it had left.
- The tag editor has no pause of its own, and Auto-Pause is Responsive until the Settings tab can change it.
- On a photo, the scrub bar shows in the place it has on a video. With Autoplay on and Loop off it fills as the photo's timer runs, Play/Pause pauses and resumes the timer with the time left kept, and dragging the bar moves the timer. With Autoplay off or Loop on, Play and the bar are disabled on a photo. Turning Autoplay on starts the photo's full time, and turning it off clears the timer. Shown by component tests of the scrub bar on a photo with Autoplay on and off.
- The overlay's time display is light in both themes, and checkboxes, radio buttons, and sliders use the orange accent in both themes.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Release checks

- Manual: On a phone and a desktop browser, with Auto-Pause on Responsive, playback keeps going on every tab beside the player, and the overlay and Auto Tag pause it and resume it on close.

#### Not included

- Pausing for the admin view, which is WebUI Admin Section.
- The Auto-Pause setting, which is WebUI Settings Panel.

### M12g - WebUI Settings Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI side panel has a Settings tab for per-device preferences and diagnostics.
- **Depends on**: WebUI Responsive Layout and Panels, WebUI Field Validation Pattern, and WebUI Library Tab, whose tiles Show file names on tiles changes, and WebUI Auto-Pause and Photo Scrub Bar, whose Auto-Pause mode it sets.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The Settings tab joins the side panel's tab row.
- The header has no settings icon, since the tab row reaches the Settings tab. WebUI Responsive Layout and Panels already leaves it out.
- Move the diagnostics information to the Settings tab, and remove the diagnostics panel from below the main page's status line.
- Client settings live in the Settings tab, all kept per device.
- Advance after is today's photo duration, renamed, and it leaves the header. It keeps today's 1–300 seconds.
- The panel's side setting chooses the side the panel opens on, with options reading Left, then Right, matching the sides.
- Auto-Pause offers Never, Always, or Responsive, the default. WebUI Auto-Pause and Photo Scrub Bar describes the modes and keeps Auto-Pause at Responsive until this setting exists.
- Randomization mode is not a Settings tab entry; it is in the Library tab.
- Every client setting survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.
- Remembering is the default, with no option to turn it off.
- The photo duration already stored per device carries over.
- Settings apply as they change; the Settings tab has no Save.
- The Settings tab's layout, in this order:
  - Playback: Autoplay mode, Advance after (today's photo duration, renamed), and Seek step.
  - Audio: Volume step and Enhanced audio, on by default and described as "Processes audio in the app, so in-app volume works on iPhone and iPad."
  - Player controls: Hide player controls, with Hide after and Keep visible while paused under its Timeout choice.
  - Appearance: Theme, Ambient mode with its expandable settings, Show file names on tiles, and Show the status line.
  - Panel: Side and Auto-Pause.
  - Keyboard shortcuts: the shortcut reference, collapsed by default with a chevron, as Ambient mode settings is. `?` opens Settings with it expanded.
  - Diagnostics: the client id, the session id, the client type, the device name, the server's version with its API version, such as "0.15.0 (API 1)", and the app's own version, labeled "ReelRoulette", not "WebUI".
- Below the sections, one line: "Settings apply at once and are kept on this device."
- This milestone fills Playback with Advance after, Appearance with Theme, Show file names on tiles, and Show the status line, Panel, and Diagnostics. The other settings arrive with the milestones that build them, each in its section here.
- The WebUI build reads the app's version from the repository's `.version` file, which `set-release-version.ps1` already sets for each release.
- Hints say only what a label doesn't: no mockup notes, no "as on the desktop" asides, and no key badges in setting labels, since the shortcut reference lists the keys.
- Theme is System (the default, following the system as the WebUI does today), Dark, or Light, kept per device.
- Show file names on tiles is off by default, kept per device. Hovering a tile with a mouse shows its name as a tooltip either way.
- Show the status line is on by default, kept per device. With the status line hidden, WebUI Responsive Layout and Panels' reconnecting indicator shows on the player while the connection is lost.
- Loop, autoplay, and mute are only the player's buttons, with no entry in the Settings tab, and each button's state survives a page refresh.
- Settings fields that can hold a value that is not valid use the field validation pattern, and such a value is not kept. Advance after is one.

#### Traps

- The diagnostics panel is shown only when `isMobileBrowser()` is true, which is by design.
- In the v0.13.0 manual regression pass the diagnostics panel appeared only on the phone in Firefox (measured).
- Photo duration and randomization mode are already kept per device in `localStorage`.
- Autoplay and loop are not kept today and start off.
- Today's diagnostics show the client id, session id, and client type (`MobileDiagnostics` in `src/ui/StatusLine.tsx`).
- `package.json`'s version is 0.1.0, not the release's, and `set-release-version.ps1` doesn't write it.
- Every tile shows its name today.
- The header ignores a photo duration outside 1–300 seconds without saying so.

#### Acceptance

- The Settings tab holds the client settings, including Advance after, the panel's side, and Auto-Pause, and the header no longer shows photo duration, in WebUI tests.
- An Advance after value outside 1–300 seconds is flagged with the field validation pattern as it is typed and is not kept, and the value in use stays as it was, in WebUI tests of Advance after with the field validation pattern.
- Auto-Pause offers Never, Always, and Responsive, starts at Responsive, and the panel pauses as the chosen mode says, in WebUI tests.
- Each setting applies as it changes, with no Save, in WebUI tests.
- Theme offers System, Dark, and Light and starts at System, and turning off Show the status line hides it, in WebUI tests.
- Show file names on tiles starts off, and turning it on shows each tile's name on the tile, in WebUI tests.
- The Settings tab has no loop or autoplay entry, in WebUI tests.
- The Settings tab is in the panel's tab row, and the header has no settings icon, in WebUI tests.
- The Settings tab shows Playback, Appearance, Panel, and Diagnostics, in that order, with room for the sections later milestones add in the places the mockup gives them, and no setting label carries a key badge, in WebUI tests.
- The Settings tab shows the diagnostics information on desktop and mobile browsers, and the main page no longer shows the diagnostics panel, in WebUI tests.
- Diagnostics shows the client and session ids, the client type, the device name, the server's version with its API version, and the app's version from `.version`, labeled "ReelRoulette", in WebUI tests and a build check that the app's version matches `.version`.
- After a page refresh, Advance after, the panel's side, Auto-Pause, the theme, whether file names show on tiles, whether the status line shows, and the autoplay, loop, and mute buttons' state are each as they were, in WebUI tests of a page refresh keeping each setting this milestone adds.
- Preferences are stored per device and do not change other devices, in WebUI tests for preference storage.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check on a phone.

#### Release checks

- Manual: On a desktop browser and a phone, and as an installed app, every remembered setting is kept after a refresh and a browser restart, and the library search starts empty.

#### Not included

- Admin, a full-page view opened from the header's admin icon, which is WebUI Admin Section.
- Moving randomization mode to the Library tab, which is WebUI Library Tab.
- Widening Advance after to 1–3600 seconds, which is WebUI Autoplay Modes.
- The autoplay mode, a Settings tab entry beside Advance after, which is WebUI Autoplay Modes.
- The volume step and Enhanced audio, which is WebUI Volume and Enhanced Audio.
- Loudness normalization's settings in the Audio section and the update to Enhanced audio's description, which is WebUI Loudness Normalization.
- Hide player controls, and Ambient mode (on by default) with its expandable Ambient mode settings section, added with the effect, which is WebUI Player Controls and Ambient Mode.
- The seek step and the shortcut reference, which is WebUI Keyboard Shortcuts.

### M12h1 - WebUI Admin Section

- **Status**: ⏳ Planned
- **Goal**: Everything the Operator page does, apart from its logs, moves into a full-page admin section of the WebUI.
- **Depends on**: WebUI Responsive Layout and Panels, whose header holds the admin icon, and WebUI Auto-Pause and Photo Scrub Bar, whose Auto-Pause the admin view follows, and WebUI In-App Dialogs, whose confirmation the control token change uses, and WebUI Field Validation Pattern, whose pattern its settings fields use, and Catalog Open and Backup Safety, whose library state and message the admin section shows.
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
- The view keeps the Operator page's responsive layout, restyled to match the rest of the WebUI.
- Its layout: a bar with a back arrow ("Back to the player") and the title Admin; a row of jump links to its sections; and cards, each titled with its icon, in this order: Server (`dns`), Web access (`lan`), Control (`key`), Library refresh (`sync`), Library transfer (`swap_vert`), Backups (`storage`), Sources (`folder`), Duplicates (`content_paste`), Testing suite (`bug_report`), Connected clients (`group`), Log Viewer (`article`), and API events (`description`).
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
- On a phone on its side, where the app's header hides, the admin view keeps its own bar, with the back arrow and its title.
- Gating: opening admin from another machine asks for the control token first, through `POST /control/pair`, and shows nothing until it is accepted. On the server machine, which the merged localhost helper decides, it opens directly.

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
- Source and item management, which is Admin Source and Item Management.
- Catalog transfer, which is Admin Library Catalog Transfer.
- The Log Viewer's move to structured entries, which is Admin Log Viewer.
- Account administration, which is Account Administration.
- Replacing the control token with admin accounts, which is Auth Cutover for API and Admin.

### M12h2 - Log Viewer Redesign

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
- It filters by time window; by source (the second bracket: `server`, `webui`, and the desktop's sources, such as `desktop-app` and `desktop-update`); by level, with one checkbox per level found (today `info`, `warn`, and `error`); and by contained text.

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

### M12h3 - Recovery Page and Operator Retirement

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
| Always-on WebUI | ⏳ Planned | The server always serves the WebUI, ignores and reports on the `enabled` setting, and the desktop loses its Enable Web UI switch. |

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

- The server always serves the WebUI from this release, since the admin section lives there, and ignores the web runtime settings' `enabled` field.
- The field stays in the contract, so the last desktop build keeps working, and the server reports it as on.
- The frozen desktop's Settings dialog loses its Enable Web UI switch, which would no longer do anything. This is an approved desktop change outside bug fixes.
- `docs/api.md` and `docs/dev-setup.md` stop describing the WebUI as optional.

**Traps**

- Turned off, the `enabled` field stops the server serving the WebUI's files and `/runtime-config.json` from its next start, leaves the WebUI's origins out of CORS, and stops mDNS advertising.
- Turned off from the admin section, `enabled` would remove the admin section itself, and the recovery page has no way to turn it back on.
- The desktop enables its Open Web UI menu item only when the server reports the WebUI as on, and the button in Desktop Retirement Notice's notice does what that item does.

**Acceptance**

- With the web runtime settings' `enabled` stored or posted as off, the server still serves the WebUI and `/runtime-config.json`, allows the WebUI's CORS origins, and, with remote connections and mDNS on, advertises over mDNS after a restart, and it reports `enabled` as on, in server tests that a stored or posted `enabled` of off is ignored and reported as on.
- Neither the admin section nor the desktop Settings dialog shows an Enable Web UI switch, and `enabled` is still in OpenAPI, in a desktop test that the Settings dialog has no Enable Web UI switch.
- `dotnet test ReelRoulette.sln` passes.

#### Release checks

- Manual: With the WebUI files removed, the recovery page restarts, stops, shows logs, and applies an update, on Linux and Windows.

#### Not included

- Dropping the `enabled` field from the contract, which is Desktop Client Removal.

### M12i - Server Settings Robustness

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
- The change only relaxes what a request must send: the frozen desktop posts every field it knows and is unaffected.
- OpenAPI and the generated WebUI types carry the nullable fields.
- This makes Admin Refresh, Backup, and Duplicate Review's settings saves safe to send in part.

**Traps**

- `CoreSettingsService.UpdateRefreshSettings`, `UpdateBackupSettings`, and `UpdateWebRuntimeSettings` assign every field from the posted snapshot, and the contract fields are not nullable, so a post that leaves out a field writes its default (for example `fingerprintScanMaxDegreeOfParallelism` back to 4).
- The desktop's backup settings save posts its three fields (`MainWindow.axaml.cs`).

**Acceptance**

- A partial post to the refresh, backup, or web runtime settings changes only the fields it names, and leaves the other fields and the other settings sections unchanged on disk, in server tests that a partial post leaves the other fields and sections unchanged on disk.
- A post with every field, as the desktop sends, saves as it does today, in server tests that a full post saves as before.
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

- The server's other robustness findings and the desktop's settings file, which is Server Robustness Findings.

### M12j - Admin Refresh, Backup, and Duplicate Review

- **Status**: ⏳ Planned
- **Goal**: The admin section starts a refresh, edits refresh and backup settings, reviews and applies duplicates, and clears the whole library's playback stats, so none of these needs the desktop.
- **Depends on**: WebUI Admin Section and Server Settings Robustness, so a settings save sends only the fields it changes.
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
| Duplicate review | ⏳ Planned | Scanning for duplicates, reviewing each group, and deleting the files not kept after a confirmation. |

#### Refresh slice

**Scope**

- Refresh Now with the refresh status.
- The refresh settings the desktop Settings dialog shows: auto-refresh and its interval (5–1440 minutes), forced loudness and duration rescans on the next refresh, and fingerprint scan parallelism (1–16).
- Clear playback stats for the whole library, which the desktop offers from its Playback menu through `POST /api/playback/clear-stats`. It is an admin action, in the admin view's library section: a red Clear All Playback Stats… button under Playback stats in the Library refresh card.
- Clear All Playback Stats… asks "Clear the playback stats of every item in the library? Plays and last played go back to none." with a red Clear, and the status line then says "Cleared the library's playback stats.".

**Traps**

- Only the desktop calls `POST /api/refresh/start` and `/api/refresh/settings`. The routes exist, so this needs no contract change (measured).
- The tray can also start a refresh (measured).
- The interval and parallelism ranges are the ones the server already clamps to.
- The WebUI never calls `POST /api/playback/clear-stats` (measured).

**Acceptance**

- Refresh Now starts a refresh, and the status line shows its progress and result, in admin section UI tests.
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

- Only the desktop calls `/api/backup/settings`. The route exists (measured).
- The ranges for the time between backups and the number kept are the ones the server already clamps to.
- The frozen desktop's backup settings save posts only its three fields (`MainWindow.axaml.cs`), so without the rule that a post without the days field keeps the stored value, each desktop save would reset the days.

**Acceptance**

- Backup settings load and save, and saving one field leaves the others as they were on the server, in admin section UI tests.
- Each backup field accepts the range the server enforces, and the days of daily backups accept 0 to 365, where 0, the default, turns daily retention off, in admin section UI tests.
- A backup value outside its range is flagged with the field validation pattern as it is typed, and Save can't proceed until it is corrected, in admin section UI tests of each backup field.
- With the days at 0, rotation keeps and deletes exactly the backups it does today, and a backup settings post without the days field keeps the stored value, in server tests.
- With daily retention set to a number of days, rotation keeps the count limit's newest current-version backups plus the newest backup of each date in that window, current-version or older-version, and deletes older-version backups whose dates fall outside it, in server tests of the window and of older-version backups aging out.
- Newer-version backups and unrecognized files in `backups/` are byte-identical after rotation, with daily retention on or off, in server tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Duplicate review slice

**Scope**

- Scan the whole library or one source.
- Show each group with thumbnails and the comparison details the desktop shows: file name, plays, tags, favorite, and blacklisted.
- Choose Keep All or a file to keep per group.
- Each group starts at Keep All or Select Best, from a per-device preference.
- The preference is chosen in duplicate review rather than the Settings tab, since nothing else uses it. It starts at Keep All, as on the desktop, and survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.
- Apply deletes the files not kept from disk after a plain confirmation that says so and names the groups and files to delete, as the desktop's does, without the desktop's step of typing DELETE.
- Duplicate review opens within the admin section's full-page view, not as a panel tab.
- The Duplicates card has the scan's scope (the whole library or one source), Scan, and the default, labeled "Each group starts at".
- Review replaces the admin view's contents and has its own bar, with a back arrow to admin, the title Duplicate review, and the group count.
- Each group, headed "Group {n} of {total}" with Keep All beside it, shows its files as cards with a thumbnail, the file name, its folder and size, plays with Favorite or Blacklisted, tags, and "Keep this one".
- The kept file's card is outlined green, and the others red with a dimmed thumbnail.
- A footer sums up "{n} files to delete from {n} groups; Keep All groups are left as they are." or "Keep All everywhere: nothing will be deleted.", with Cancel and a red Delete {n} Files, disabled while nothing would be deleted.
- The confirmation says "This permanently deletes the duplicate files you didn't keep from disk.", then "Groups to process: {n}" and "Files to delete: {n}", with a red Delete {n} Files.
- Afterwards the card says "Deleted {n} files." and the status line "Deleted {n} duplicate files.".
- A count of one is singular, such as "Delete 1 File".

**Traps**

- Only the desktop calls `/api/duplicates/scan` and `/api/duplicates/apply`. The routes exist, so this needs no contract change (measured).

**Acceptance**

- Duplicate review opens within the admin section, in admin section UI tests.
- Duplicate apply deletes only the files not kept, from disk, after a confirmation that names the groups and files to delete and asks for nothing to be typed, and Keep All deletes nothing in that group, in admin section UI tests.
- The duplicate default is chosen in duplicate review, starts at Keep All, is kept per device, and survives a page refresh, in admin section UI tests.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check of a duplicate scan.

#### Release checks

- Manual: From the admin section, start a refresh, change refresh and backup settings, scan and apply duplicates with Keep All and with a chosen file, and clear all playback stats, and the library updates.

### M12k - Admin Source and Item Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources and remove library items from the WebUI admin section, with server routes for what no client can do today, and every open WebUI follows source changes without a reload.
- **Depends on**: WebUI Admin Section.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Everything this milestone adds is gated like the rest of the admin section: localhost, or the control token from other machines.
- Adding a folder takes a path on the server machine. The admin section takes a plain typed path, with no autocomplete or folder browser, and the server checks it as it is typed: a folder on the server that is not already a source.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | Server routes to rename and remove a source, remove library items, and check a typed source path, with events for source and item changes, in OpenAPI and the generated WebUI types. |
| Manage Sources | ⏳ Planned | The admin section's source list with statistics, adding by server path, Edit Source with rename and Remove, enable and disable, and one Refresh. |
| WebUI source sync | ⏳ Planned | Every open WebUI reloads its library window and Filter tab source list on a source event, with one resync in flight at a time. |

#### Contract slice

**Scope**

- Server routes to rename a source, remove a source (its items leave the catalog; files stay on disk), and remove items from the library, with the delete-from-disk option the desktop remove dialog offers.
- The item removal route also serves bulk removal in WebUI Multi-Select and Bulk Actions.
- An admin-only route that checks a typed path: a folder on the server that is not already a source. A contract change that only adds.
- Source and item changes publish events so connected clients update. Import gets an event too.
- OpenAPI and generated WebUI types for the new routes.

**Traps**

- The desktop Manage Sources dialog shows Rename and Remove buttons and the grid shows Remove from Library, but none of them has a server route, so v0.14.0 hides them. The routes are still missing and the three controls are still hidden.
- The path check is a new admin-only route, a contract change that only adds (inferred).
- Only enabling or disabling a source publishes an event (`sourceStateChanged`), and `POST /api/sources/import` publishes nothing.

**Acceptance**

- Removing a source removes its items from the catalog and leaves its files, in server tests of the route.
- The item removal route removes items with and without deleting from disk, in server tests of the route.
- The path check route flags a typed path that is not a folder on the server, or is already a source, in server tests of the route.
- Adding, renaming, removing, enabling, and disabling a source each publish an event, in server tests of the event each source change publishes.
- New routes are in OpenAPI, and `npm run verify:contracts` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Manage Sources slice

**Scope**

- List sources with the statistics the desktop dialog shows: total media, videos, photos, total duration, and videos with and without audio.
- Add a folder, rename, remove, enable and disable, and refresh.
- The list has one Refresh for all sources, not one per source, since the refresh route takes no source id.
- Each source row has an enable switch, the source's name, path, and statistics, and an Edit button (`edit_note`, "Edit source").
- Edit opens an Edit Source dialog with the name, built as Edit Tag, Edit Category, and Edit Preset are.
- The name uses the field validation pattern: "Enter a source name." when empty, and "Use a name no other source has." when another source has it, ignoring case.
- Edit Source has **Remove**, not Delete, since the source's files stay on disk. It asks `Remove the source "{name}"? Its items leave the library; its files stay on disk.` in a dialog stacked above, with a red Remove.
- The path field's tooltips read "Enter a folder path on the server." and "That folder is already a source.".
- The status line acknowledges each change: "Source renamed.", "Source added. Importing its files…", "{name} enabled." or "{name} disabled.", and "Source removed.", the last three followed by "ReelRoulette updates the library everywhere it's open.".

**Traps**

- Folder import, enable and disable, and refresh routes already exist.
- The per-source statistics already come from the `sources` list of `GET /api/library/stats`, so they need no contract change.
- The refresh route takes no source id.
- A browser folder picker returns paths on the browser's machine (inferred).
- The desktop's Import Folder sends its own folder picker path to the server, so it only works on the server machine.

**Acceptance**

- From the admin section, sources can be added by server path, renamed, removed, enabled, disabled, and refreshed, with per-source statistics, and one Refresh covers the whole list, in admin section UI tests for Manage Sources.
- A typed path that is not a folder on the server, or is already a source, is flagged with the field validation pattern as it is typed, and adding can't proceed until it is corrected, in admin section UI tests for Manage Sources.
- Edit Source's button and its confirmation's button say Remove, not Delete, in admin section UI tests for Manage Sources.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### WebUI source sync slice

**Scope**

- On a source event, reload the loaded library window, keeping the scroll position as the desktop does, and refresh the Filter tab's source list.
- Overlapping resyncs: keep one in flight and coalesce events that arrive meanwhile, since this milestone adds source events that reload every open WebUI.

**Traps**

- The server already applies source state: the list query, random selection, and item play only use enabled sources.
- The WebUI keeps no source authority of its own; its source checkboxes are a filter choice.
- The WebUI ignores `sourceStateChanged` and reads `GET /api/sources` only when the filter dialog loads its data.
- `src/events/sseClient.ts` calls `void handleResyncRequired(...)` for every `resyncRequired` event, so several authoritative reloads can run at once and finish out of order.

**Acceptance**

- Adding, renaming, removing, enabling, or disabling a source from the admin section or the desktop updates every open WebUI's library window and Filter tab source list without a reload, in WebUI tests for source event handling.
- Removing items updates connected WebUI sessions through events and list requery, in WebUI tests for event handling.
- Overlapping resync events cause one reload at a time, in WebUI tests for overlapping resyncs.
- `npm run verify` passes, and one quick spot check of an admin section source toggle seen in another WebUI tab.

#### Release checks

- Manual: On Linux and Windows, from the admin section, add a source by its server path, then rename, disable, refresh, and remove it, and other open WebUI sessions update without a reload.

#### Not included

- Showing the desktop's Rename, Remove, and Remove from Library controls again; the frozen desktop keeps them hidden.
- Bulk item removal in the WebUI, which is WebUI Multi-Select and Bulk Actions.
- Duplicate review, which is Admin Refresh, Backup, and Duplicate Review.
- Moving source and item management behind admin accounts, which is Auth Cutover for API and Admin.
- Per-user source visibility, which is Per-User Source Permissions.
- Browsing for a source folder, which is Desktop App Shell.

### M12l - Admin Library Catalog Transfer

- **Status**: ⏳ Planned
- **Goal**: Export and import the library from the WebUI admin section, with the server applying the catalog, so catalog transfer does not need the desktop app.
- **Depends on**: WebUI Admin Section, Remove library.json Library Support, and Catalog Open and Backup Safety, so import can restore a library while the server runs without one, and Admin Source and Item Management, whose server path check the remap fields use, and Admin Refresh, Backup, and Duplicate Review, whose daily retention marks the backups the restore list labels daily.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Everything this milestone adds is gated like the rest of the admin section.
- Settings and backups are not part of the transfer. Presets and thumbnail revision and dimensions travel with `library.db`. JPEG files stay in the local thumbnail directory.
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

- List every holder of catalog state and connections in the server, such as the catalog session and its SQLite connection pool, the cached list counts, the random shuffle bag, refresh stages, catalog backups, duplicate and auto-tag scans, and the event revision, and how each is stopped, cleared, or reloaded for a replace.
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
- The status line says "Downloading {file}." as the download starts.
- The library transfer card's hint reads "Export saves the whole library: items, tags, presets, and stats. Import replaces it while the server runs; the current library is kept aside until the new one opens."

**Traps**

- Export is already a server operation: `GET /api/library/catalog-checkpoint` writes a standalone checkpoint while the server has `library.db` open, and the desktop's Library Export saves that file.
- `GET /api/library/catalog-checkpoint` passes `library.db` to `Results.Stream` (`ServerHostComposition.cs`).
- The desktop's Library Export is unaffected: it saves to the path its own save picker returns, which suggests `library.db` (`MainWindow.axaml.cs`).
- A browser doesn't report when a download finishes (inferred).

**Acceptance**

- The admin section can export a server-produced checkpoint, in admin section UI tests for export.
- The export downloads as `library-{date}.db`, dated by the server's local date, in server tests for the export's suggested name.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Import slice

**Scope**

- Import moves onto server operations and runs while the server is up.
- Reuse the replace-and-recover protocol already in `LibraryCatalogStore` (incoming file, finished-file rename, recovery), which the desktop import uses today with the server stopped. What is new is replacing the database while the server's catalog session is open.
- The previous database stays aside until the new file is in place and opens.
- A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed.
- A file that is not a library database is rejected.
- The import upload has its own limit and streams to the incoming file rather than buffering in memory.
- `verify-linux-packaged-server-smoke.sh` uploads a file larger than 30 MB that isn't a library and gets the not-a-library answer, not a refusal for its size.
- Import keeps the source folder remap the desktop import offers. Each remap field checks for a folder on the server, through the path check Admin Source and Item Management adds; left empty, it keeps the old path.
- **Import Library…** in the admin section's library transfer card.
- While an import uploads, a progress bar shows in the library transfer section, with "Uploading {file}: {n}%".
- The file uploads first; the server then reads its source folders for the remap dialog, or rejects a file that isn't a library with the notice "{file} isn't a ReelRoulette library. The library wasn't changed."
- The remap dialog, titled "Import {file}", says "Its source folders were on another machine. Point each one at its folder on this server, or leave it to keep the path.", with one field per source folder labeled with its old path, using the field validation pattern, and Cancel and Import.
- Import then asks "Replace the library with {file}? The current library is kept aside until the new one opens.", with Cancel focused and a red Replace, and the status line says "Imported {file}. Connected clients reload the library."

**Traps**

- Today import is desktop-only and needs the server stopped: `LibraryArchiveMigration.ImportDatabase` writes the server's `library.db` from the desktop process. This is the main blocker for removing the desktop.
- On a copy of the developer's catalog, `library.db` is 92.5 MB (92,520,448 bytes, no free pages) for 49,055 items (measured).
- That is larger than ASP.NET Core's default request body limit of about 30 MB, the framework default (inferred).
- The server raises the multipart form limit (`FormOptions.MultipartBodyLengthLimit`) to 512 MB, left from earlier library import work, but no route reads a form now and the request body limit itself is not raised.
- The limit is Kestrel's, and the server tests call handlers without an HTTP host, so the packaged server smoke script covers it.

**Acceptance**

- The admin section can import a `library.db` while the server is running, in server tests for running-server import and admin section UI tests for import.
- An interrupted import leaves the previous catalog or the finished incoming file, never a partial database or an empty catalog, in server tests for interrupted-replace recovery.
- Import rejects a file that is not a library database and does not replace the live catalog, in server tests for its rejection.
- Import replaces the catalog, including presets and thumbnail revision and dimensions, while settings and backups stay where they are and JPEG files stay in the local thumbnail directory, in server tests for running-server import.
- Connected clients resync after an import, in server tests for running-server import.
- Before an import replaces the library, a catalog backup of the current one is taken, even with server backups off, in server tests for the backup taken before a replace.
- An import while a refresh, backup, or scan runs does what the report decided, and never leaves a partial catalog, in server tests for an import during a refresh.
- Each remap field checks for a folder on the server, and one left empty keeps the old path, in admin section UI tests for the remap fields.
- A file larger than 30 MB uploads to the packaged server without a refusal for its size, in `./tools/scripts/verify-linux-packaged-server-smoke.sh` with its upload larger than 30 MB.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `./tools/scripts/verify-linux-packaged-server-smoke.sh`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.

#### Backup restore slice

**Scope**

- A new route lists the server's backups, a contract change that only adds.
- The Backups card lists the server's backups under Restore, newest first, each named by when it was made, such as "Today 06:00", "Yesterday 18:00", or "3 days ago (daily)", with a Restore… button.
- A backup kept only by daily retention is labeled "(daily)".
- Restore asks "Restore the backup from {when}? The current library is kept aside until the backup opens.", with Cancel focused and a red Restore, and the status line then says "Restored the backup from {when}.".

**Traps**

- No route lists the server's backups.

**Acceptance**

- The Backups card lists the server's backups, and restoring one asks first and then replaces the library with it, in admin section UI tests for restore.
- Before a restore replaces the library, a catalog backup of the current one is taken, even with server backups off, in server tests for the backup taken before a replace.
- The backup taken before an import or a restore shows first in the restore list, labeled "(before import)" or "(before restore)", in admin section UI tests of the safety backup's place and label.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Release checks

- Manual: With no desktop app, export the library from the admin section and import it into a fresh server, on Linux and Windows.

#### Not included

- A Save as dialog for the export, which is Desktop App Shell.
- Removing the desktop's Library Export and Import menus, which is Desktop Client Removal.

### M12m - WebUI Stats Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI shows library and playback statistics and details of the current file in a Stats tab, as the desktop stats panel does.
- **Depends on**: WebUI Responsive Layout and Panels.
- **Design**: `docs/mockups/reelroulette/`.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | `integratedLoudness` and `peakDb` named in the OpenAPI item schema, so the generated WebUI types carry them. |
| Stats tab | ⏳ Planned | The side panel's Stats tab with the current file's and the library's stats, opened from the header's file name, with coalesced refreshes. |

#### Contract slice

**Scope**

- Name `integratedLoudness` and `peakDb` in the OpenAPI item schema, so the generated WebUI types carry them. A contract change that only adds.
- WebUI Loudness Normalization reads `integratedLoudness` too.

**Traps**

- Loudness and peak already come with each list and single-item read as `integratedLoudness` and `peakDb`, but the OpenAPI item schema does not name them (it allows extra properties), so they are untyped in the generated WebUI types (inferred).

**Acceptance**

- `integratedLoudness` and `peakDb` are in the OpenAPI item schema, and `npm run verify:contracts` passes, in contract tests for the two fields.
- `npm run verify` passes.

#### Stats tab slice

**Scope**

- Library and current-file stats live in the side panel's Stats tab, which joins the tab row here. Its icon is `bar_chart`.
- Clicking the current file name in the header opens the panel on the Stats tab. Its tooltip shows the full file name and then "Show stats".
- The current file comes first, since the file name opens the tab: its name, then its full path, then its stats.
- The full path leaves room beside it for Show in File Manager or Copy Path, which Show in File Manager from the WebUI adds.
- With nothing playing, the current file section says "Nothing is playing yet."
- The library stats follow, as a grid of cards, each a value over its label.
- Library stats: total videos, photos, and media, favorites, blacklisted, total plays, unique media played, never played, videos with and without audio, and baseline loudness.
- Current file: file name and full path, plays, last played (the time before this play, or Never), favorite, blacklisted, duration, has audio, loudness, adjustment, peak, and tags.
- Adjustment shows what loudness normalization applies to the current file, as the desktop shows it: the difference between the baseline and the file's loudness, limited by the maximum reduction and boost and signed, such as "+5.0 dB" or "-6.0 dB".
- Adjustment reads "Off" while loudness normalization or Enhanced audio is off, and "N/A" for a file without loudness data, whose Loudness reads "Unknown".
- Neither normalization nor Enhanced audio exists when this milestone ships, so Adjustment reads Off until WebUI Loudness Normalization fills it in.
- Refresh after events and actions is coalesced as the desktop does it: a short wait gathers a burst, one request is in flight at a time, and requests during it get one more.

**Traps**

- The WebUI never calls `GET /api/library/stats`, and its now-playing line shows only the file name and duration (measured).
- The header file name's tooltip shows the full name only today.
- The desktop's current-file loudness display in `MainWindow.axaml.cs` is how the desktop shows Adjustment.

**Acceptance**

- The Stats tab, with the `bar_chart` icon, shows the current file section first and the library stats below it, and says "Nothing is playing yet." while nothing plays, in component tests for both sections.
- Clicking the current file name in the header opens the panel on the Stats tab, in a component test.
- The library stats match the library stats response, in component tests.
- The current file section updates on play, favorite, blacklist, tag, and playback events, in component tests.
- The current file's Adjustment reads "Off", or "N/A" with Loudness "Unknown" for a file without loudness data, until WebUI Loudness Normalization applies an adjustment, in component tests of Adjustment reading Off and of a file without loudness data.
- A burst of events causes one stats request, plus at most one more for events during it, in coalescing tests.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Not included

- Show in File Manager and Copy Path beside the current file's full path, which is Show in File Manager from the WebUI.
- Filling in Adjustment, which is WebUI Loudness Normalization.
- Playback history charts, which is Playback History and Analytics.

### M12n1 - WebUI Volume and Enhanced Audio

- **Status**: ⏳ Planned
- **Goal**: The WebUI has a volume control on every device, by slider, scroll wheel, and two-finger drag, through an Enhanced audio gain stage that also gives iPhone and iPad an in-app volume.
- **Depends on**: WebUI Settings Panel, whose Audio section holds its settings, and WebUI In-App Dialogs, whose notice reports a gain stage that can't start.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The audio spike's report comes first, before the controls are built, since Enhanced audio is on by default, so every device's audio moves to Web Audio in one release, and the mockup tried the path only with a synthesized chord, not a real media element.
- With Enhanced audio on, every device routes the player's audio through a Web Audio gain stage (`createMediaElementSource` into a `GainNode`), so all devices behave the same and WebUI Loudness Normalization adds its stage to a path already in use everywhere.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Audio spike | ⏳ Planned | A report on a real video routed through the gain stage in each target browser and device. |
| Server | ⏳ Planned | Cross-origin headers on media responses, and `crossorigin` on the player's media elements, so media from another origin in development isn't silent through Web Audio. |
| Volume | ⏳ Planned | The Enhanced audio gain stage and setting, the volume slider, scroll wheel and two-finger drag volume, the volume steps, and their per-device settings. |

#### Audio spike slice

**Scope**

- Route a real video through the gain stage (`createMediaElementSource` into a `GainNode`) in a throwaway page under `artifacts/scratch/`, served over the LAN as the mockup is.
- Try it in Safari and Firefox on an iPhone and an iPad, Chrome and Firefox on Android, and Chrome, Firefox, and Safari on a desktop.
- Report silent output, sound drifting from the picture, behavior in iOS pseudo-fullscreen, and resuming after the app was in the background.
- The report decides whether WebUI Loudness Normalization stays in v0.15.0.

**Traps**

- WebKit has had bugs where a media element routed through Web Audio plays silent (inferred).

**Acceptance**

- The audio spike's report names each browser and device tried and what it found, and is written before the Volume slice starts.

#### Server slice

**Scope**

- A small, additive change, for development: media responses carry cross-origin headers for the WebUI's origins, and the player's media elements ask for them (`crossorigin`).
- The slice confirms or adds the header on `/api/media` responses, range responses included.

**Traps**

- In every served setup the WebUI's media comes from the page's own origin, since the runtime config's `apiBaseUrl` is the scheme and host the browser used (`WebRuntimeConfig.Build`), so localhost, the LAN address, the mDNS name, and an HTTPS proxy are all same-origin.
- Only the Vite dev server, whose `public/runtime-config.json` points port 5173 at the server on 51301, plays media from another origin.
- Media from another origin without cross-origin headers plays silent through Web Audio (inferred).
- The CORS policy `ReelRouletteWebClient` is applied to the whole app when CORS is on (`UseCors` in `ServerHostComposition.cs`), for the origins `DynamicCorsOriginRegistry` allows.
- Media responses may therefore already carry the header, which hasn't been checked with a cross-origin media request (inferred).

**Acceptance**

- In the Vite dev server, media from the server's other origin isn't silent through the gain stage, shown by a server test that media responses carry the cross-origin header for the WebUI's origins.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Volume slice

**Scope**

- A volume slider at the end of the seek row. With Enhanced audio on, it sets the gain stage, on every device, which is also how iOS, where Safari makes a media element's volume read-only, gets one.
- The Settings tab offers the desktop's volume steps: 1, 2, or 5 percent, used by the scroll wheel, a two-finger drag, and the [ and ] keys that WebUI Keyboard Shortcuts binds.
- Changing the volume, by the slider or otherwise, writes nothing to the status line.
- The scroll wheel over the player changes the volume by the volume step, one step per notch.
  - A trackpad's small deltas add up into notches, so a light swipe doesn't jump the volume.
  - The mockup counts a line- or page-unit event, or one of at least 50 px, as a whole notch, and otherwise a notch per 100 px.
  - Scrolling counts as activity and shows the controls, so the volume slider is visible while it changes.
  - It does nothing on a photo, and over the player the page never scrolls.
- On a touch screen, dragging up or down with two fingers on the player changes the volume the same way, a step per 30 px in the mockup, and shows the controls.
  - The player claims its touches (`touch-action: none`) and turns away Safari's own pinch gesture, so the browser doesn't zoom there.
- On iOS, the gain stage gives the app its own volume relative to the system volume.
- The gain stage starts on the first tap, since Web Audio needs one. On iOS the volume slider shows once it runs, so the slider, the scroll wheel, and a two-finger drag all work there.
- Enhanced audio, a per-device setting in the Settings tab's Audio section, on by default.
  - Its description names only what it does here: "Processes audio in the app, so in-app volume works on iPhone and iPad."
  - Off, audio plays directly, without the gain stage: WebUI Loudness Normalization's option is disabled, and on iOS the volume controls are hidden, as today.
  - Turning it off plays through a new media element, as the mockup does.
- No silent fallback: if the gain stage can't start, an in-app notice says "Audio processing couldn't start on this device. Turn off Enhanced audio to play sound directly, without in-app volume on iPhone and iPad.", with OK and **Turn off Enhanced audio**, which turns the setting off for this device.
- The gain never jumps, since a jump in level is a click.
  - Each volume change, Mute included, glides to its level over a few tens of milliseconds (`setTargetAtTime` with a time constant of about 15 ms, in the mockup).
  - Play starts from silence and fades in, and pause fades out and pauses the video once it is silent, about 60 ms later in the mockup.
- Enhanced audio, the volume, and the volume step survive a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.

**Traps**

- The WebUI has a mute button and no volume control (measured).
- The mockup tries the gain stage with a stand-in sound, a soft chord it plays with videos through the same path.
- In the mockup, stepping the volume crackled and play and pause popped, on every device (measured).
- An element routed through Web Audio stays routed (inferred).
- iOS suspends the audio context while the page is in the background, so the next tap resumes it (inferred).

**Acceptance**

- The volume slider sits at the end of the seek row and sets the volume, and the Settings tab offers the desktop's volume steps, in WebUI tests.
- The scroll wheel over the player changes the volume by the volume step, one step per notch with a trackpad's small deltas added up, without scrolling the page; on a touch screen a two-finger drag does too, without zooming. Each shows the controls, and none changes anything on a photo. Shown by wheel tests for notches and added-up trackpad deltas, and two-finger drag tests.
- Changing the volume writes nothing to the status line, in WebUI tests.
- With Enhanced audio on, every device plays through the gain stage, which starts on the first tap. On iOS the volume slider shows once it runs, and the slider, scroll wheel, and two-finger drag set the gain. Shown by a test that the gain stage starts on the first tap and the slider then shows.
- The gain glides to each new level and fades in on play and out on pause, so nothing crackles or pops, in tests that the gain only glides and that play and pause fade it in and out.
- With Enhanced audio off, audio plays directly, and on iOS the volume controls hide. If the gain stage can't start, the notice's **Turn off Enhanced audio** turns it off for the device. Shown by tests for Enhanced audio on and off and for the notice when the gain stage can't start.
- After a page refresh, Enhanced audio, the volume, and the volume step are each as they were, in tests for a page refresh keeping each setting this milestone adds.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Release checks

- Manual: With Enhanced audio on, videos play with sound in Chrome, Firefox, and Safari on a desktop and on Android and iOS, including with the WebUI behind an HTTPS proxy, and turning it off plays sound directly.
- Manual: On an iPhone and an iPad, in Safari and Firefox, the volume slider shows after the first tap, and the slider and a two-finger drag change the video's volume relative to the system volume, without crackles, and play and pause don't pop.

#### Not included

- Loudness normalization, which is WebUI Loudness Normalization.
- Enhanced audio's description naming loudness normalization, which is WebUI Loudness Normalization.
- The [ and ] volume keys, which is WebUI Keyboard Shortcuts.

### M12n2 - WebUI Loudness Normalization

- **Status**: ⏳ Planned
- **Goal**: The WebUI evens out loudness between videos, as the desktop's volume normalization does, and it works properly in every browser the WebUI supports.
- **Depends on**: WebUI Volume and Enhanced Audio, whose gain stage it adds a stage to, and WebUI Settings Panel, whose tab holds its settings.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- If the audio spike in WebUI Volume and Enhanced Audio doesn't find the gain stage reliable, including on iOS, this milestone moves to v0.16.0, before Desktop Client Removal, and the desktop's gains for the fixture's cases are captured first, while its code is still in the repository.
- Normalization adds its gain on the gain stage from WebUI Volume and Enhanced Audio, which routes every device's audio. On iOS that stage gives the app its own volume, as that milestone sets out, and its audio spike checks the path on iOS.
- The WebUI reads each item's integrated loudness from the `integratedLoudness` field that WebUI Stats Panel names in OpenAPI, and the automatic baseline from the baseline loudness the server's library stats report.
- The rule is implemented in C# and the WebUI, so both read one shared fixture, `shared/fixtures/loudness-normalization-gain.json`, of loudness, baseline, limits, user volume, and the resulting gain.
- The desktop's formula moves from `MainWindow.axaml.cs` into `LoudnessNormalizationService`, beside its baseline method, so its tests can read the fixture: a small desktop change for the shared-fixture rule.
- Settings in the Settings tab's Audio section, per device, with the desktop's ranges and defaults:
  - A **Loudness normalization** checkbox under Enhanced audio, off by default and disabled while Enhanced audio is off, since audio then plays directly.
  - An expandable "Loudness normalization settings" section, like Ambient mode's, with Maximum reduction (15 dB, from 1 to 30), Maximum boost (5 dB, from 0 to 10), and Baseline, Automatic, showing the library's baseline, or a Manual target (−23 LUFS, from −50 to −10).
  - The fields use the field validation pattern. A value that is not valid is flagged and not kept, and the one in use stays.
  - Each setting survives a page refresh.
- The option's hint is "Evens out loudness between videos.", which reads "Needs Enhanced audio." while it is disabled.
- Automatic's line is "The library's baseline, {n} LUFS."
- The target field shows only while Manual is chosen, as Hide after shows only under Timeout. It takes negative LUFS, so it uses the full keyboard, as the mockup's does.
- A Reset to defaults button, as Ambient mode settings has.
- The mockup's stand-in sound follows each video's loudness while normalization is on.
- The Stats tab's Adjustment, which WebUI Stats Panel shows as Off until this milestone, shows what normalization applies to the current file, as WebUI Stats Panel sets out: the baseline difference limited by the maximum reduction and boost, signed, "Off" while normalization or Enhanced audio is off, and "N/A" for a file without loudness data. It follows the settings as they change.
- Enhanced audio's description becomes "Processes audio in the app, for in-app volume on iPhone and iPad and loudness normalization."

#### Traps

- The desktop's `CalculateNormalizedVolume` in `MainWindow.axaml.cs` takes the baseline, from `LoudnessNormalizationService.GetBaselineLoudness` (the server's library baseline in automatic mode, or the manual target), minus the item's integrated loudness (the item's `IntegratedLoudness`, read into `MeanVolumeDb`).
- It limits that to the maximum boost above and the maximum reduction below, turns it into a linear gain (10^(dB/20)), multiplies the user's volume by it, and clamps the result to LibVLC's 0–200%.
- On the desktop, an item without loudness data plays at the user's volume, and normalization is off by default.
- The server's library stats already report the baseline loudness.
- The shared fixture can lock the WebUI to the desktop's formula only while the desktop is in the repository.
- The server's cross-origin headers on media responses, from WebUI Volume and Enhanced Audio, keep media from another origin in development from playing silent through the gain stage.
- iOS's numeric and decimal keypads have no minus key (inferred).

#### Acceptance

- With normalization on, each video plays at the gain the desktop's formula gives for its loudness against the baseline, within the maximum reduction and boost, and both clients pass `loudness-normalization-gain.json`, with the fixture's cases run by the desktop's and the WebUI's tests.
- An item without loudness data plays at the user's volume, in WebUI tests.
- The settings are in the Settings tab's Audio section with the desktop's ranges and defaults, the option is disabled while Enhanced audio is off, a value outside a field's range is flagged with the field validation pattern, and each setting survives a page refresh, in WebUI tests for each setting, the field validation pattern on its fields, and each setting surviving a page refresh.
- Enhanced audio's description names loudness normalization, in WebUI tests.
- The Stats tab's Adjustment shows the adjustment applied to the current file, signed and within the limits, "Off" while normalization or Enhanced audio is off, and "N/A" for a file without loudness data, and it follows the settings as they change, in WebUI tests of the Adjustment in each case.
- With normalization on, the gain stage applies each video's normalization gain, in WebUI audio tests.
- The setting is hidden in a browser where it cannot work, and that browser is named in this entry.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass, and a spot check on the user's own browsers and phone, without the VM: with loudness normalization on, a loud and a quiet video play at similar loudness, and any browser where it can't work is found and named in this entry.

#### Release checks

- Manual: With loudness normalization on, a loud and a quiet video play at similar loudness in Chrome, Firefox, and Safari on a desktop and on Android and iOS.

#### Not included

- Leaving the fixture as WebUI test data once the desktop is gone, which is Desktop Client Removal.

### M12n3 - WebUI Autoplay Modes

- **Status**: ⏳ Planned
- **Goal**: Autoplay has two modes, Normal and Timer, in place of the desktop's Keep Playing, and a looping photo no longer flickers.
- **Depends on**: WebUI Settings Panel, whose Advance after setting both modes use, and WebUI Auto-Pause and Photo Scrub Bar, whose photo timer they drive.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Autoplay gets two modes, replacing the desktop's separate Keep Playing, which plays a random item every N seconds until stopped (Playback → Keep Playing (Timer) and Set Interval):
  - Normal: photos advance after the timer and videos play to the end, as autoplay does today.
  - Timer: every item advances after the timer, including a video that has not finished. With loop on, a video shorter than the timer repeats until the timer advances. Pausing a video holds the timer.
  - With loop on in Normal mode, the current item repeats and autoplay waits, as today.
- Both modes use one timer, Advance after, today's photo duration, which WebUI Settings Panel moves into the Settings tab under that name with today's 1–300 seconds.
- This milestone widens Advance after to the desktop's 1–3600 seconds, so a Keep Playing interval longer than five minutes still fits.
- The mode and the timer sit together in the Settings tab, and the player's autoplay button still turns autoplay on and off.
- Changing the timer while a photo shows keeps the time already shown and changes only the length.
- A looping photo flickers at the end of each loop, because it is restarted by reloading its image, unlike a video, which seeks back. Keep the photo on screen and restart only its timer, both at the end of each loop and when Loop or Autoplay is turned on while a photo shows.
- A looping photo then records one play, as a looping video does, and the Player screen tests that count a play per loop change with it.
- The autoplay mode survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.

#### Traps

- The WebUI's video end handler and photo timer both skip advancing while loop is on.
- Changing the timer while a photo shows restarts the photo today (`photoDurationChanged` in `src/playback/player.ts`).
- The photo timer calls `playCurrent`, which clears the photo's source and hides it, then loads it again, records a play, and relays a new start.
- Turning Loop or Autoplay on while a photo shows goes through the same restart.

#### Acceptance

- In Normal mode, photos advance after the timer and videos play to the end. In Timer mode, every item advances after the timer, including an unfinished video, and a paused video holds it. Shown by autoplay tests for both modes with loop on and off and with a paused video.
- With loop on in Timer mode, a video shorter than the timer repeats until the timer advances. With loop on in Normal mode, the current item repeats and does not advance. Shown by the same autoplay tests.
- A looping photo does not flicker: it stays on screen with its image loaded at the end of each loop, and only its timer restarts, in a test that a looping photo keeps its image shown through each loop.
- Changing the timer while a photo shows keeps the time already shown and changes only the length, in a test that changing the timer keeps the time shown.
- The Settings tab shows the autoplay mode beside Advance after, which accepts 1 to 3600 seconds and starts from the value stored before this milestone, in a test for Advance after's new range.
- After a page refresh, the autoplay mode is as it was, in a test for a page refresh keeping the mode.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Not included

- Moving the photo duration into the Settings tab as Advance after, which is WebUI Settings Panel.

### M12n4 - WebUI Player Controls and Ambient Mode

- **Status**: ⏳ Planned
- **Goal**: The player's controls can hide after a time with no activity, and ambient mode fills the black space around the picture with a soft glow of its colors.
- **Depends on**: WebUI Settings Panel, whose Player controls and Appearance sections hold its settings, and WebUI Volume and Enhanced Audio, whose volume slider keeps the controls shown while it is dragged.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- The fullscreen button shows the exit icon (`fullscreen_exit`) while the stage is in fullscreen or pseudo-fullscreen. Today it always shows `fullscreen`.
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
- Hide player controls, a Settings tab entry in its Player controls section, kept per device:
  - Timeout, the default: the controls hide after a set time with no activity. Moving the mouse or tapping shows them and restarts the countdown. They stay visible while the pointer is over them and while the scrub bar or volume is being dragged.
  - While Timeout is chosen, two settings show under it: Hide after, 1 to 30 seconds and 3 by default, using the field validation pattern; and Keep visible while paused, on by default.
  - On click/tap: clicking or tapping the player shows or hides them, as today.
  - Never: the controls stay visible.
  - In every mode, hidden controls can't be pressed, so the first tap or click on them only shows them.
  - With Timeout, a key press counts as activity and shows them, and keyboard focus on a control keeps them shown.
- The player is also clipped by a rounded `clip-path: inset(0 round 8px)`, square in fullscreen and on a phone on its side, as in the mockup, so its corners stay rounded on iOS with ambient mode on.
- Ambient mode and its settings, and Hide player controls and its two settings, survive a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.

#### Traps

- Two layers crossfading by CSS opacity flickered slightly in the mockup (measured).
- The flicker came from the black background showing through whenever a sample arrived before the last fade finished (inferred).
- Drawing a cross-origin video taints the canvas (inferred).
- In every served setup the media is same-origin, so a tainted canvas happens only in development, where the Vite dev server plays media from the server's other origin, as WebUI Volume and Enhanced Audio sets out (inferred).
- Showing a tainted canvas still works, since the effect never reads its pixels back (inferred).
- The controls start visible, and a click or tap on the player toggles them (`controlsVisible` in `src/ui/Player.tsx`, `toggleControls` in `src/playback/mediaGestures.ts`).
- There is no timeout, and hidden controls can still be pressed, since only their container ignores the pointer (`.overlay-controls` in `src/styles.css`).
- In Safari and Firefox on iOS, the player's rounded corners turned square once ambient mode drew, and stayed rounded with it off or on other devices (measured).
- WebKit doesn't clip a layer of its own, such as the blurred ambient canvas, to its parent's rounded corners (inferred).

#### Acceptance

- The fullscreen button shows the exit icon while the stage is in fullscreen or pseudo-fullscreen, in a test of the fullscreen button's icon.
- With ambient mode on, a blurred, dimmed copy of the frame's colors fills the black space around a playing video and crossfades as the picture changes, and a photo gets one from the photo. Sampling stops while the video is paused or the tab is hidden. Off, the space is plain black in both themes. The light theme uses full color at its own strength, and a sample that arrives mid-fade never lets the black background show through. Shown by ambient mode tests for sampling at the update rate while a video plays, holding while it is paused or the tab is hidden, and a photo drawn once.
- The Ambient mode settings section offers each setting with its default and range, shows each value, applies changes as they're made, and Reset to defaults restores the defaults, in ambient mode tests of each of its settings.
- With Hide player controls on Timeout, the controls hide after the Hide after time with no activity, moving the mouse or tapping shows them and restarts the countdown, and they stay while the pointer is over them, while the scrub bar or volume is dragged, and, with Keep visible while paused, while paused. On click/tap toggles them on a click or tap, and Never keeps them visible. Hide after accepts 1 to 30 seconds. Hidden controls can't be pressed. Shown by controls tests for each Hide player controls mode, the countdown, and each thing that keeps the controls shown.
- The player is clipped by the rounded `clip-path`, square in fullscreen and on a phone on its side, in a WebUI test.
- After a page refresh, ambient mode and its settings, and Hide player controls and its two settings, are each as they were, in tests for a page refresh keeping each setting this milestone adds.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and a spot check on the user's own browsers and phone, without the VM, including that with ambient mode on the player's corners stay rounded in Safari on iOS.

#### Release checks

- Manual: On an iPhone and an iPad, in Safari and Firefox, with ambient mode on, the player's corners stay rounded.

### M12n5 - WebUI Keyboard Shortcuts

- **Status**: ⏳ Planned
- **Goal**: The WebUI has the desktop's keyboard shortcuts wherever a browser allows them, plus seek-step and frame-step keys and a shortcut reference.
- **Depends on**: WebUI Settings Panel, WebUI Stats Panel, so every panel tab exists, and WebUI Volume and Enhanced Audio, whose volume its keys step, and WebUI Autoplay Modes, whose autoplay it toggles, and WebUI Player Controls and Ambient Mode, whose controls show on a key press.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Use the desktop keys.
- Ctrl+Q, Ctrl+O, and F11 are not bound, since the browser keeps them.
- Q quit and O import folder have no WebUI equivalent.
- Each panel tab has a shortcut: Library, Filter, Tags, Stats, and Settings.
  - The number keys 1 to 5 open Library, Filter, Tags, Stats, and Settings.
  - T and S open Tags and Settings, as on the desktop.
  - The open tab's key closes the panel.
  - P shows or hides the panel.
- Shift+F enters and leaves fullscreen, since F stays Favorite.
- Space plays or pauses as K does, and pauses and resumes a photo's timer, except while focus is on something Space already activates, such as a button or a library tile.
- [ and ] step the volume by the volume step from WebUI Volume and Enhanced Audio. The desktop steps volume with comma and period, which step frames here instead.
- J and L seek by a seek step preference. The Settings tab offers the desktop's seek steps: 1, 5, or 10 seconds.
- Frame stepping, as YouTube does it: while a video is paused, comma steps one frame back and period one frame forward.
  - It uses the browser's frame timings (`requestVideoFrameCallback`) where the browser provides them, and, where it doesn't, an assumed frame rate that this milestone decides.
  - It replaces the desktop's Frame seek step (Shift and the arrow keys), which LibVLC drives.
- Shortcuts do nothing while focus is in a text field.
- Esc closes the first of these that is open: Auto Tag (not while a scan runs), the panel, and then pseudo-fullscreen. An open dialog takes Esc itself.
- A shortcut reference in the Settings tab's Keyboard shortcuts section, collapsed by default with a chevron. `?`, pressed anywhere outside a text field, opens Settings with it expanded, and the reference lists `?` too.
- The seek step survives a page refresh in the per-device store that WebUI Responsive Layout and Panels adds.

#### Traps

- The WebUI handles only Escape, which closes overlays, and Enter or Space on a focused library tile (measured).
- The desktop binds K play or pause, J and L seek, Left and Right previous and next, R random, F favorite, B blacklist, A autoplay, M mute, comma and period volume, T tags, P player view, S settings, O import folder, Q quit, F11 fullscreen, and 1 to 5 to show or hide parts of the window. It also swallows 6 to 8 and Space, which do nothing (measured).
- The browser keeps Ctrl+Q, Ctrl+O, and F11, for its own fullscreen (inferred).

#### Acceptance

- Each bound shortcut does what the desktop's does, in keyboard tests per binding under `happy-dom`.
- 1 to 5 open the panel on Library, Filter, Tags, Stats, and Settings, T and S on Tags and Settings, and the open tab's key closes the panel; P shows or hides the panel. Shown by keyboard tests per binding.
- Esc closes Auto Tag, the panel, and pseudo-fullscreen, in that order, and leaves Auto Tag open while a scan runs, in tests of the Esc order.
- Shortcuts are ignored while a text field has focus, in keyboard tests per binding.
- [ and ] change the volume by the volume step, and do nothing on a photo, in keyboard tests per binding.
- J and L seek by the seek step, and the Settings tab offers the desktop's seek step choices, in keyboard tests per binding.
- While a video is paused, comma and period step one frame back and forward; while it plays, they do nothing. Shown by frame stepping tests with and without the browser's frame timings.
- Shift+F enters and leaves fullscreen, in keyboard tests per binding.
- Space plays or pauses as K does, and leaves a focused button or tile to its own action, in keyboard tests per binding.
- The shortcut reference matches the bindings, and `?` opens Settings with it expanded, in a test that the reference lists every binding.
- After a page refresh, the seek step is as it was, in a test for a page refresh keeping the seek step.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check.

#### Release checks

- Manual: In Chrome, Firefox, and Safari on a desktop, every listed shortcut works in normal view, with a panel open, and in fullscreen, and does nothing while typing in a text field.

#### Not included

- Rebinding, which is Customizable Keyboard Shortcuts.
- The Actions menu and selection in the Esc order, after Auto Tag and before the panel, which is WebUI Multi-Select and Bulk Actions.

### M12o - Show in File Manager from the WebUI

- **Status**: ⏳ Planned
- **Goal**: A WebUI on the server machine opens the system file manager at the playing file, and elsewhere copies its path.
- **Depends on**: Reverse Proxy and HTTPS Access, WebUI Preact Migration, and WebUI Stats Panel.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The server opens the file manager, since a browser can't do it itself, and the server can when the browser runs on the server machine.
- The action is accepted only from the server machine, meaning a direct connection from loopback or from the server's own address, as the single localhost check that Reverse Proxy and HTTPS Access adds decides.
- A request through a reverse proxy is not localhost, so the action is not offered there, even on the server machine.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | A route that takes an item id and opens the file manager, and a capability that tells the WebUI whether to offer it. |
| Server | ⏳ Planned | The file manager launch on Windows and Linux, without a shell, and the refusals and headless report. |
| WebUI | ⏳ Planned | Show in File Manager or Copy Path beside the file's path in the Stats tab. |

#### Contract slice

**Scope**

- A route that takes an item id, never a path, accepted only from the server machine.
- A capability the WebUI reads to decide whether to offer the action.

**Acceptance**

- The route, which takes an item id, and the capability are in the contract, in contract tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Server slice

**Scope**

- On Windows, `explorer.exe /select,<path>`.
- On Linux, the `org.freedesktop.FileManager1` `ShowItems` D-Bus call, which selects the file, falling back to `xdg-open` on its folder.
- Start processes with `ProcessStartInfo.ArgumentList` and no shell.
- A headless server with no desktop session reports the action as unavailable.

**Traps**

- The desktop's `OpenFileLocation` opens Explorer with the file selected on Windows and opens the folder with `xdg-open` on Linux.
- The tray already launches programs (`AvaloniaTrayHostUi.cs`).

**Acceptance**

- A direct request from loopback or from the server's own address opens the file manager with the file selected, or its folder where selection is not available, in server tests for loopback and the server's own address with the launcher faked.
- Requests from other addresses, proxied requests, and unknown ids are refused, and a headless server reports the action as unavailable, in server tests for another LAN address, proxied, unknown-id, and headless requests with the launcher faked.
- The file manager is started without a shell, in server tests with the launcher faked.
- `dotnet test ReelRoulette.sln` passes.

#### WebUI slice

**Scope**

- A Show in File Manager action for the current file where the server offers it, and Copy Path everywhere else.
- They sit beside the file's path in the Stats tab, Show in File Manager with the `folder_open` icon and Copy Path with `content_copy`.
- The status line then says "Opened in the file manager." or "Path copied."
- Copy Path from another device at the LAN address falls back to copying from a hidden text field with `document.execCommand('copy')`.

**Traps**

- `navigator.clipboard` exists only in a secure context, HTTPS or localhost (inferred).
- The server serves plain HTTP on the LAN.

**Acceptance**

- The WebUI shows the action only when the server offers it, and Copy Path otherwise, in WebUI tests.
- Copy Path copies the path over plain HTTP from another device, where the Clipboard API is missing, as well as over HTTPS, in a WebUI test of Copy Path without the Clipboard API.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick Linux spot check.

#### Release checks

- Manual: On the server machine at `http://localhost`, Show in File Manager opens the file manager at the playing file on Linux and Windows; from another device, Copy Path copies it, at the LAN address and through an HTTPS proxy.

### M12p - WebUI Status Line Overhaul

- **Status**: ⏳ Planned
- **Goal**: The WebUI status line shows only background information, one stable message per situation, and what the user must notice or act on moves to an in-app dialog or the field it is about.
- **Depends on**: WebUI Field Validation Pattern, whose pattern the field messages move to, and WebUI In-App Dialogs, whose notice the dialog messages move to, and Catalog Open and Backup Safety, whose 503 message the status line shows.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Defines one precedence rule for which message wins when several apply, so the status line never alternates.
- The precedence rule also settles the buffering case in Traps, where "Playing" hides "Loading..." while a random pick waits and "No response from the server. Try again." after one times out.
- Defines the message for each event once: server stopped, API unavailable, the server running without a library (showing the server's message for each library state: newer, damaged, missing, or unreadable), version or capability mismatch, and refresh progress and results.
- The precedence rule and the per-event messages cover the background messages only.
- The WebUI's message rule, status line side: the status line is only for background information that shouldn't interrupt the user, such as connection state, refresh progress, and sync notices.
- Anything the user needs to notice or act on shows in the in-app dialog, as WebUI In-App Dialogs sets out, and field problems use the pattern from WebUI Field Validation Pattern.
- Every status line message, from `src/state/serverConnection.ts`, `src/state/serverCompatibility.ts`, `src/events/refreshStatusProjection.ts`, `src/playback/player.ts`, `src/library/library.ts`, `src/library/libraryPlayModel.ts`, `src/library/libraryQuerySession.ts`, `src/filter/filterDialog.ts`, and `src/tags/tagEditor.ts`, sorted by the rule:
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
    - Moved by earlier milestones, which this milestone checks are gone from the status line: "Minimum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.", "Maximum duration is invalid. Use MM:SS, HH:MM:SS, or seconds.", "Enter a preset name.", "A preset with that name already exists.", and "Tag name is required." in WebUI Field Validation Pattern, and "That name is already in use." in WebUI In-App Dialogs.
    - Moved here: "Pair token required.", for the pairing prompt's token field. Pair can't proceed while the field is empty, and the field's tooltip reads "Enter the pairing token.".
  - Leaves the status line with nothing in its place: "Unauthorized. Pair first.". A random pick or library play that the server answers with 401 also shows the header's pairing prompt, which is the thing to act on, so the prompt is the only signal. It keeps its `last.log` line.
- A message that moves to a dialog keeps its `last.log` line with the same text, as the notice in WebUI In-App Dialogs is relayed.
- A field message is no longer relayed.
- Status line messages that other milestones add after the sorted list was read follow the rule from the start, and this milestone checks those already shipped against it.
- A failed Auto Tag scan shows its error.
- The Auto Tag panel's status leaves "Scanning…" when the scan finishes.
- A tag save shows its own error.
- Pair, refresh status, version, and random responses are read through one helper that checks the content type and reports a clear error.

#### Traps

- With the server stopped, the WebUI shows "library load failed: HTTP 503" only briefly before "SSE reconnecting..." (measured before promotion).
- The desktop alternates between "core runtime unavailable" and "core runtime is required to browse the library" with the server stopped (measured before promotion).
- The v0.14.1 release notes still list the WebUI status line flipping between messages as a known issue.
- The WebUI's `fetchJson` throws `HTTP {status}` and drops the response body, so the server's library message in a 503 never reaches the status line.
- The playing video's `playing` event sets the status to "Playing". On a connection where the video keeps buffering, that hides "Loading..." while a random pick waits and "No response from the server. Try again." after one times out.
- `pickRandom` in `player.ts` and `play` in `library.ts` set the pairing prompt just before "Unauthorized. Pair first.". The 401 case in `mapPlayItemErrorToStatus` is never reached, since `play` handles 401 first.
- Tests lock today's three wrong Auto Tag and tag save messages below as they are, marked as recorded in this milestone.
- A failed Auto Tag scan shows "Scan complete: no matching tags found." in the panel's status and results, as a scan that found nothing does: `scan` in `src/tags/tagEditor.ts` treats a failure as no rows.
- Before the WebUI Preact Migration, `app.js` set "Auto-tag scan failed. Core runtime is unavailable or still recovering." and overwrote it at once.
- A scan where every match already has its tag shows "No rows to show." and leaves the panel's status on "Scanning…": `autoTagStatusAfterChange` in `src/tags/autoTagModel.ts` keeps the status while no row shows.
- A tag save that cannot reach the server shows the message of the last step the server refused on the page, or "Tag apply failed" when none was: `lastSaveError` in `src/tags/tagEditor.ts` lasts for the page.
- `src/api/coreApi.ts` calls `response.json()` for pair, refresh status, version, and random responses without checking the content type or catching parse errors, so an HTML error page from a proxy surfaces as a `SyntaxError`.

#### Acceptance

- With the server stopped, unavailable, or mismatched, the status line settles on one message and does not alternate, in WebUI tests of the precedence rule covering the server stopped, the API unavailable, and a version or capability mismatch.
- With the server running without a library, the status line shows the server's message, in WebUI tests of the per-event messages.
- Refresh status reads the same during and after each refresh, in WebUI tests of the refresh progress and result messages.
- The precedence rule and the per-event messages are documented, checked by reading them.
- The status line shows only the messages sorted as background, including those other milestones added after the sorted list was read, checked against the sorted list for every status line write.
- Each message sorted as a dialog shows in the in-app notice with the same wording, not on the status line, and its `last.log` line is unchanged, in tests that each screen's dialog messages show in the notice with their `last.log` lines and its background messages stay on the status line.
- An empty pairing token is flagged with the field validation pattern once typed in and emptied, Pair can't proceed while it is empty, and "Pair token required." no longer shows, in tests of the pairing token field.
- None of the field messages moved by earlier milestones shows on the status line, checked against the sorted list for every status line write.
- A random pick or library play answered with 401 shows the header's pairing prompt, shows "Unauthorized. Pair first." neither on the status line nor in a dialog, and relays its `last.log` line as before, in tests of a 401 on a random pick and a library play.
- A failed Auto Tag scan shows its error instead of "Scan complete: no matching tags found.", in a test that replaces the one locking it today.
- A scan where every match already has its tag clears "Scanning…", in a test that replaces the one locking it today.
- A tag save that fails on a network error shows that error, not one from an earlier save, in a test that replaces the one locking it today.
- A pair, refresh status, version, or random response that isn't JSON, such as a proxy's HTML error page, shows a clear error, not a `SyntaxError`, in tests of a response that isn't JSON for each of the four reads.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick spot check with the server stopped.

#### Release checks

- Manual: With the server stopped, unavailable, or mismatched, and during a refresh, the WebUI settles on one status message.

#### Not included

- The desktop's half of the overhaul and its shared fixture, since the desktop is frozen. The desktop's status messages stay as they are.

### M12q - Testing Suite Overhaul

- **Status**: ⏳ Planned
- **Goal**: The testing suite produces clear results that match the WebUI's connection and status handling.
- **Depends on**: WebUI Status Line Overhaul, Server Shutdown Fixes, and WebUI Admin Section.
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
- SSE disconnect behaves inconsistently and may need redesigning (measured before promotion).
- The Operator testing suite has five scenario flags: API version mismatch, capability mismatch, API unavailable, missing media, and SSE disconnect.

**Acceptance**

- The report of each scenario's behavior on a running server, naming what the WebUI shows and how SSE disconnect closes and reconnects on each run, is written before the Scenarios slice starts.

#### Scenarios slice

**Scope**

- Redesign the scenarios against current WebUI behavior, define the expected WebUI message for each, and verify the WebUI's behavior as part of the suite.
- The suite runs from the admin section.
- Each scenario shows its expected message under it, labeled "Expected message:". The mockup leaves the messages to this milestone, which takes them from WebUI Status Line Overhaul's per-event messages.
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

#### Not included

- The desktop's expected messages, since the desktop is frozen.

### M12r - Browser-Playable Filter

- **Status**: ⏳ Planned
- **Goal**: Browse and random play can be limited to files a browser can play, and a file the browser cannot play says so instead of "not found".
- **Depends on**: WebUI Preact Migration, Favorite and Blacklist Filter Modes, whose FilterState schema it adds its field to, and WebUI Status Line Overhaul, whose precedence rule the new message follows.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- The server decides playability from one documented container profile, so browse, random play, and counts agree.
  - The profile lists the playable video containers, starting with mp4, m4v, webm, and mkv.
  - Any other video container, including avi and wmv, is not browser-playable.
  - Photos are always playable.
- The browser-playable field is nullable, the WebUI always sends it, and a posted preset without it keeps the stored value, matched to the stored preset by name, since a posted preset carries no id. This keeps a desktop preset save from dropping the option (see the Contract slice's Traps).

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | A nullable browser-playable field in the FilterState schema, applied by the server in the list query, its counts, and random selection, and kept when a posted preset leaves it out. |
| WebUI | ⏳ Planned | The "Only files this browser can play" option in the Filter tab, saved in presets and compared in preset matching. |
| Error message | ⏳ Planned | A format-not-supported message for a file the browser can't play, "not found" only for a missing file, and skipping such files during autoplay, Next, Previous, and random picks. |

#### Contract slice

**Scope**

- A nullable browser-playable field in the FilterState schema that Favorite and Blacklist Filter Modes adds, applied by the server in the list query, its counts, and random selection.
- OpenAPI and generated WebUI types; it only adds a field.
- The server keeps a preset's stored value when a posted preset leaves the field out, matching it to the stored preset by name.
- The profile is documented in `docs/api.md`.

**Traps**

- Browsers cannot play every format LibVLC plays on the desktop, a gap accepted until playback sessions.
- A copy of the developer's catalog has 17,423 videos by file extension, of which 16,611 are mp4, 533 mkv (3.1%), 225 avi, and 54 wmv (measured). The codecs inside the files were not measured.
- avi and wmv files from that library fail in the WebUI (measured).
- mkv plays in Chrome and Firefox with common codecs but not in Safari or on iOS (inferred), and counts as browser-playable.
- Until Per-Preset Preset Writes, the desktop posts the whole preset list, and the frozen desktop does not know the new field, so a desktop preset save would drop the option from every preset (inferred).
- The desktop still posts the whole list to `POST /api/presets`.
- The desktop rebuilds every posted preset from its typed filter model, dropping fields it doesn't know (measured).
- The desktop posted its cached list not only on a preset save but on every header preset pick and every filter dialog Apply, with the cache refreshed only on connect, reconnect, resync, and filter dialog open. Favorite and Blacklist Filter Modes limits the post to an Apply that changed presets, so by this milestone a desktop preset save is what drops the option.
- `FilterPresetSnapshot` is `name` and `filterState`, so a posted preset carries no id.
- A preset the desktop renames in the same save loses the option, until Per-Preset Preset Writes (inferred).

**Acceptance**

- With the option on, the list query, its counts, and random selection exclude videos outside the profile, and with it off, results are unchanged, in server tests for the option in the list query, counts, and random selection.
- A preset the desktop saves without the field keeps its stored option, in server tests that a preset posted without the field keeps it.
- OpenAPI and the generated WebUI types carry the nullable field, in contract tests.
- The profile is documented in `docs/api.md`, checked by reading it.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### WebUI slice

**Scope**

- The option, labeled "Only files this browser can play", last in the Filter tab's Basic Filters and saved in presets.
- It is off by default, so current behavior does not change.
- Preset matching compares the option. Its cases go in a WebUI-only fixture until Desktop Client Removal, since the desktop doesn't compare the new field.

**Traps**

- Preset equality is locked to `preset-filter-equality.json`, which the desktop tests also read.

**Acceptance**

- The option is saved in presets and compared in preset matching, in WebUI tests for the option.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Error message slice

**Scope**

- Say that the format is not supported in this browser when that is the cause, and "not found" only when the file is missing.
- The format message reads "This video's format (.{ext}) isn't supported in this browser.".
- The WebUI asks the server whether the file exists, with a one-byte range request to the item's media URL: a `404` means it is missing, and otherwise this browser can't play its format. Comparing the container against the profile instead would call an mkv that Safari can't play missing, since the profile counts mkv as playable.
- When autoplay, Next, Previous, or a random pick reaches a file this browser can't play, or one that is missing, the player skips on to the next item in the same direction and says so on the status line, as background information under WebUI Status Line Overhaul's rule, instead of stopping on the message.
- The mockup words the skip messages "Skipped a file this browser can't play." and "Skipped a missing file."
- A file the user chose from the library still shows its message.
- After ten skips in a row, the player stops on the last file's message, so a filter that matches only files this browser can't play doesn't pick without end.
- WebUI Status Line Overhaul moves "Video file not found." and "Photo file not found." to the notice; after this milestone only a file chosen from the library shows it.

**Traps**

- When the browser cannot play a file, the WebUI's status line says "Video file not found." ("Photo file not found." for photos) whatever the cause, though the file exists (measured).
- Both messages come from the media element's error handlers, `videoFailed` and `photoFailed` in `src/playback/player.ts`.
- A browser reports a missing file (a `404` from `/api/media`) and an unsupported format with the same `MEDIA_ERR_SRC_NOT_SUPPORTED` code, so the error code alone cannot tell them apart (inferred).
- The one-byte range request needs no contract change (inferred).

**Acceptance**

- A file the browser cannot play shows a format-not-supported message, and a missing file shows not found, decided by the server's answer for the file, not by its container, in WebUI tests of both error messages with the server answering found and not found.
- Autoplay, Next, Previous, and random picks skip a file this browser can't play or one that is missing, and say so on the status line, and a file chosen from the library shows its message instead, in WebUI tests.
- After ten skips in a row, the player stops on the last file's message, in WebUI tests of the stop after ten skips.
- The mockup matches what this slice shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes.

#### Release checks

- Manual: With the browser-playable filter on, browse and random play show no avi or wmv files; with it off, playing one says its format is not supported in this browser, and a deleted file says not found.

#### Not included

- Codec-level playability detection, which waits for the probe in Server Playback Decision Engine.
- Playing formats a browser can't, which is WebUI Playback Cutover and Format Resilience.
- Keeping the option on a preset the desktop renames in the same save, which is Per-Preset Preset Writes.

### M12s1 - WebUI Grid Row Reuse

- **Status**: ⏳ Planned
- **Goal**: The WebUI library grid updates only the rows and tiles that change, so it no longer flickers on an iPad or after a hard refresh.
- **Depends on**: WebUI Library Tab, so it is built in the Preact Library tab, whose width changes whenever the side panel is resized.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- Keep row elements that stay visible, add and remove only the rows that enter or leave, and update a patched tile in place.
- Grid rows stop going through `innerHTML`.
- Apart from that, grid layout, scrolling, focus, and tile behavior stay as they are.

#### Traps

- Each change of visible rows replaces the rows' HTML through `innerHTML`, which recreates every tile image.
- The WebUI Preact Migration's library overlay keeps the grid controller's row HTML.
- Each patch and each appended page rebuilds the layout and virtualizer for every loaded item, so loading a window page by page costs time that grows with the square of its size.
- In Node 24 on the development machine with the layout and virtualizer modules alone (no DOM), one full rebuild takes 0.5 ms for 10,000 items at 1,400 px wide and 1.2 ms at 390 px, and 2.7 to 7.8 ms for 49,000 (measured).
- Loading 10,000 items in 200-item pages spends 13 to 32 ms in total on rebuilds, and 49,000 spends 355 to 953 ms over 245 pages, about 1.5 to 4 ms per page. The growth is real but small (measured).
- Replacing the rows' HTML is the likely cause of the iPad flicker, and was not measured (inferred).
- On an iPad with the WebUI installed as an app, the grid flickers dark each time it re-renders its visible rows while scrolling, about seven times for a screen-height drag in landscape with three to four rows on screen. Desktop browsers and Firefox on Android are fine. Each re-render rebuilds every visible row's HTML, including images that were already showing (measured before promotion).
- In desktop browsers, before and after the WebUI Preact Migration, after a hard refresh (Ctrl+F5), which bypasses the image cache, the grid flickers when it opens and on every scroll, because each row rebuild requests its thumbnails again. Desktop browsers are fine only while the thumbnails are cached (measured).

#### Acceptance

- Scrolling keeps the image elements of rows that stay visible, in WebUI tests for row reuse.
- A favorite, blacklist, playback, or tag patch updates only the affected tile, in WebUI tests for tile patching.
- No grid row is rendered through `innerHTML`, in WebUI tests for row reuse.
- Layout results match the current layout for the same items and width, in WebUI tests.
- Scrolling keeps the rows and image elements that stay visible instead of rebuilding them, which stands in for the flicker on an iPad and after a hard refresh, in WebUI tests for row reuse.
- Before-and-after timings for rendering a large window in a browser are recorded.
- `npm run verify` passes, and a spot check on the user's own iPad and desktop browser, without the VM: on the iPad with the WebUI installed as an app, scrolling the library grid a screen height in landscape shows no flicker, and in the desktop browser, after a hard refresh (Ctrl+F5), opening the library and scrolling the grid shows no flicker.

#### Release checks

- Manual: On an iPad with the WebUI installed as an app, scrolling the library grid a screen height in landscape shows no flicker.
- Manual: In a desktop browser, after a hard refresh (Ctrl+F5), opening the library and scrolling the grid shows no flicker.

#### Not included

- Extending the layout for appended pages instead of rebuilding it, since a rebuild measured a few milliseconds per page.
- Placeholder tiles and loading the page at the scroll position, which is WebUI Grid Scrollbar Seek.

### M12s2 - WebUI Grid Scrollbar Seek

- **Status**: ⏳ Planned
- **Goal**: Dragging the library grid's scrollbar reaches any part of the results without loading every page before it.
- **Depends on**: WebUI Grid Row Reuse.
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

### M12t - WebUI Multi-Select and Bulk Actions

- **Status**: ⏳ Planned
- **Goal**: The WebUI selects several library items, or every item that matches, and applies the desktop's bulk actions to them.
- **Depends on**: Admin Source and Item Management, whose item removal route bulk removal uses, and WebUI Grid Row Reuse, which updates a tile in place, so selection marks are tile updates, and WebUI Grid Scrollbar Seek, whose placeholder tiles show selection once their page loads, and WebUI Tags and Filter Tabs, whose Tags tab edits several items, and WebUI Keyboard Shortcuts, whose Esc order it extends.
- **Design**: `docs/mockups/reelroulette/`.

#### Decisions

- Select all selects every item that matches the search and filters, loaded or not, and each bulk action applies to all of them.
- Each bulk action acknowledges itself on the status line: "Added {n} items to favorites.", "Removed {n} items from favorites.", "Blacklisted {n} items.", "Removed {n} items from the blacklist.", "Updated tags on {n} items.", "Cleared playback stats for {n} items.", and "Removed {n} items from the library.", or "Removed {n} items from the library and deleted their files.", with "1 item" for one.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Contract | ⏳ Planned | An ids-only library query, a bulk favorite and blacklist route with one event, clear playback stats by ids, the tag-count read for a selection, and the clients' handling of the bulk event. |
| Selection | ⏳ Planned | Selecting tiles by their check icon or a long press, the selection bar with Select all, and the Esc order. |
| Bulk actions | ⏳ Planned | The Actions menu's favorite, blacklist, clear playback stats, and remove from library actions, and favorite and blacklist answers applied to the item they were for. |
| Tag edits | ⏳ Planned | Editing several items' tags in the Tags tab. |

#### Contract slice

**Scope**

- The contract change only adds.
- The library query gains an ids-only option that returns every matching id in one response, for Select all.
- One bulk route takes many ids and sets or clears favorite or blacklist on all of them in one request, publishing one event for all of them in place of one request and one `itemStateChanged` per item.
- Clear playback stats takes ids beside its paths, so a selection of items that aren't loaded can be cleared.
- The WebUI applies the patch-or-reload rule to each id in the bulk event and reloads its window at most once.
- The desktop reloads its loaded window on the bulk event, a small change matching the server's, which the freeze allows.
- For a selection of every matching item, the Tags tab's chip states and collapsed counts need each tag's count across the selection, which the WebUI can't work out for items it hasn't loaded. The slice measures the existing tag-editor model, which takes item ids, on the 49,055-item catalog against a counts-only addition, and uses the cheaper one.
- OpenAPI and generated WebUI types.

**Traps**

- `POST /api/favorite` and `POST /api/blacklist` take one item path each, and the desktop sends one request per selected item.
- `POST /api/playback/clear-stats` takes a list of item paths, and `POST /api/tag-editor/apply-item-tags` a list of item ids.
- The ids-only response is about 1.9 MB for the developer catalog's 49,055 items, worked out from 36-character ids (inferred).
- The frozen desktop ignores event types it doesn't know: its event switch in `MainWindow.axaml.cs` has no default case.
- The tag-editor model takes item ids (`TagEditorModelRequest.itemIds`).

**Acceptance**

- The ids-only query returns every matching id, in server tests for the ids-only query.
- Bulk favorite and blacklist send one request and publish one event, the WebUI reloads its window at most once for it, and the desktop reloads its loaded window on it, in server tests for the bulk route and its one event and a desktop test that the bulk event reloads the loaded window, and WebUI tests that the bulk event reloads the window at most once.
- Clear playback stats clears items given by id, in server tests for clearing stats by ids.
- The measurement of the tag-editor model against a counts-only addition on the 49,055-item catalog is recorded, and the cheaper read is used.
- The ids-only query, the bulk route, and clear-stats ids are in OpenAPI, and `npm run verify:contracts` passes, in contract tests.
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
- While selecting, a bar at the bottom of the Library tab shows Stop selecting (an X), "{n} selected", Select all, and Actions, whose menu the Bulk actions slice fills.
- Selection starts only from a tile's check icon or, on a touch screen, a long press, and the Library tab has no Select button.
- Deselecting the last tile ends selection.
- Esc closes the Actions menu and then selection, after Auto Tag and before the panel, in the order WebUI Keyboard Shortcuts sets.

**Traps**

- The desktop library grid selects several items (click, Ctrl+click, Shift+click).
- The WebUI library plays one item per click and has no selection.

**Acceptance**

- With a mouse, a tile's check icon shows faded on hover and selects the tile when clicked; during selection it shows on every tile, and a long press starts selection on a touch screen. A selected tile's icon is filled orange and its thumbnail shrinks inside the tile, in WebUI tests for selection.
- The Library tab has no Select button, and deselecting the last tile ends selection, in WebUI tests for selection.
- Once selection is on, a click adds or removes a tile and Shift+click adds a range without highlighting text; Ctrl or Cmd+click doesn't select, in WebUI tests for selection.
- Select all selects every item that matches the search and filters, including items not loaded, in WebUI tests for Select all over items not loaded.
- Esc closes the Actions menu, then selection, after Auto Tag and before the panel, in WebUI tests for the Esc order.
- `npm run verify` passes.

#### Bulk actions slice

**Scope**

- Actions is a menu in three groups: Add to favorites, Remove from favorites, Add to blacklist, and Remove from blacklist; Edit tags… and Clear playback stats…; and Remove from library…, in red.
- Add to and Remove from favorites and the blacklist send one request to the bulk route, and Clear playback stats sends ids.
- Bulk Add to favorites clears each item's blacklisting, and Add to blacklist clears its favorite, as the player's buttons do.
- Clear playback stats… asks "Clear playback stats for {n} items?", with Cancel focused and a red Clear.
- Remove from library is an admin action. From another machine it asks for the control token first, as the admin view does. It then asks to confirm, naming the count.
- Deleting the files from disk is an option in Remove from library's confirmation, off by default, and when it is on the question says the files will be permanently deleted from disk.
- The wording of Remove from library:
  - The token prompt is a dialog titled "Control token" that says "This is an admin action. Enter the server's control token.", with the token field under the field validation pattern and Continue.
  - The confirmation asks "Remove {n} items from the library? Their files stay on disk." with a red Remove.
  - With "Also delete the files from disk" checked it asks "Remove {n} items from the library and permanently delete their {n} files from disk? This can't be undone." with a red Remove and Delete.
  - For one item they say "1 item", "Its file stays", and "its file".
- Removing the selected items from the library ends selection.
- A favorite or blacklist answer applies to the item it was for. The fix is straightforward: cache the answer under its `itemId` and apply it only when that item is still playing.

**Traps**

- The desktop acts on selected items from its context menu: add to or remove from favorites and the blacklist, add or remove tags, clear playback stats, and remove from library.
- `toggleFlag` in `src/playback/player.ts` clears the other flag when it sets one.
- `src/playback/player.ts` applies a favorite or blacklist answer to the item playing when the answer arrives, so pressing Next before it does marks the new item locally and caches that state under its id until an event for it corrects it.
- The server's answer carries the changed item's `itemId` and both flags (`LibraryStateResponse`, which `shared/api/openapi.yaml` does not describe yet).

**Acceptance**

- The WebUI applies favorite, blacklist, clear stats, and, for admins, remove from library to all selected items, in WebUI tests for each bulk action.
- Each bulk action applies to every item Select all selected, including items not loaded, in WebUI tests for each bulk action.
- Remove from library asks to confirm with the count. Deleting files from disk is off by default, and turning it on makes the question say the files will be permanently deleted from disk, in WebUI tests for each bulk action.
- Bulk Add to favorites clears blacklisting, and Add to blacklist clears favorite, on each selected item, in WebUI tests for each bulk action.
- Bulk favorite and blacklist send one request for the whole selection, in WebUI tests for each bulk action.
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

- The desktop `ItemTagsDialog` adds and removes tags across all selected items at once; the WebUI tag editor works on the current item only.

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
- The desktop's FFmpeg log: nothing has written to its buffer since the server took over refresh, so its window is always empty.
- The desktop features a browser cannot offer, which is Desktop Client Removal, where they are recorded.

### M12u - WebUI Keyboard Navigation and Focus

- **Status**: ⏳ Planned
- **Goal**: Every part of the WebUI works from the keyboard alone, and keyboard focus is always visible, in the brand orange.
- **Depends on**: WebUI In-App Dialogs, WebUI Drag Reordering, WebUI Responsive Layout and Panels, WebUI Library Tab, WebUI Tags and Filter Tabs, WebUI Auto-Pause and Photo Scrub Bar, WebUI Settings Panel, WebUI Admin Section, Log Viewer Redesign, Recovery Page and Operator Retirement, Admin Refresh, Backup, and Duplicate Review, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Stats Panel, WebUI Volume and Enhanced Audio, WebUI Player Controls and Ambient Mode, WebUI Keyboard Shortcuts, Testing Suite Overhaul, WebUI Grid Row Reuse, and WebUI Multi-Select and Bulk Actions.
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
- Selection updates the tiles in place, as WebUI Grid Row Reuse patches a tile, so focus is never lost to a redraw.
- Every other screen works from the keyboard, each control in a sensible Tab order and with an accessible name: the player's controls and seek bar; the panel button and tab row, where the arrow keys, Home, and End move between tabs; the Library controls; the Filter tab and its sections; the Tags tab, its chips, category headers, and drag handles, and Auto Tag; the Stats tab; the Settings tab, including the Ambient mode settings section and its sliders and the Keyboard shortcuts section; the in-app dialogs; the admin view, its sections, the Log Viewer, duplicate review, and the control-token gate; and the recovery page.
- What covers the page keeps Tab inside it while open and returns focus where it was on close: the panel as a full-screen overlay and Auto Tag, as the in-app dialogs already do.
- The keyboard shortcuts stay as WebUI Keyboard Shortcuts binds them.
- Where the arrow keys have a local job, in the grid, the tab row, sliders, and on a focused drag handle, they keep it instead of playing the previous or next item.

#### Traps

- Only the pairing prompt, the tag editor, the library overlay's buttons, and the grid's tiles style their focus, in blue (`#7aa7ff`, and `#2563eb` for tiles in the light theme, in `src/styles.css`); other controls show the browser's own ring or none.
- Every grid tile is a tab stop (`tabindex="0"` in `renderGridTileHtml`, `src/library/libraryGridTileModel.ts`), and Enter or Space on one plays it.
- The grid's keyboard model uses WebUI Multi-Select and Bulk Actions' check icons.
- In the mockup, the thumbnail's frame fills the tile and paints over anything the tile itself draws, an outline or an inset shadow alike, so a focused tile's border drawn by the tile is invisible.

#### Acceptance

- Keyboard focus shows as one orange ring on every focusable control, in both themes, and a mouse click shows none, in WebUI tests of a focus style on each kind of control.
- The grid is one tab stop: the arrow keys move between tiles without playing anything, Tab from a tile reaches its check icon, Space or Enter toggles it and starts selection with focus staying on it, and Tab again leaves the grid, in WebUI tests for the grid's tab stop, arrow keys, and check icon toggling and the focus it keeps.
- A focused tile shows an orange border above its thumbnail, and a focused check icon a thick orange ring, starting at its edge, that the tile crops, in WebUI tests of a focus style on each kind of control.
- In the panel's tab row, the arrow keys, Home, and End move between tabs, in WebUI tests of the tab row's keys.
- On every screen listed in Scope, each control is reached by Tab in a sensible order and has an accessible name, in WebUI tests of each screen's Tab order and its controls' accessible names.
- The full-screen panel and Auto Tag keep Tab inside them while open and return focus on close, in WebUI tests of focus staying inside the full-screen panel and Auto Tag.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `npm run verify` passes, and one quick keyboard-only spot check.

#### Release checks

- Manual: In Chrome, Firefox, and Safari on a desktop, every screen, including the admin view and the recovery page, works with the keyboard alone, focus always shows in orange, and the Library grid's Tab, arrow, Space, and Enter keys work as described.

#### Not included

- Rebinding keys, which is Customizable Keyboard Shortcuts.

### M12v - Desktop Retirement Notice

- **Status**: ⏳ Planned
- **Goal**: The last desktop build tells users the desktop app is retired and points them to the WebUI.
- **Depends on**: New Logo and Icons, whose icon the notice shows, and Recovery Page and Operator Retirement, whose always-on WebUI keeps the desktop's Open Web UI item enabled.
- **Design**: `docs/mockups/reelroulette/`.

#### Scope

- On start, show a notice once per installed version, titled "The desktop app is retired".
- Its text: "This is the last version of the ReelRoulette desktop app. It won't get more updates, and later versions of the server won't work with it." and "Use ReelRoulette in your browser instead. It does everything the desktop app did, on this computer and on your other devices, and it can be installed as an app."
- Its buttons are Close and **Open ReelRoulette in your browser**, which does what the existing Open Web UI menu item does, so desktop users know where they're going. Either closes the notice for this version.
- The Open Web UI menu item keeps its name, since the desktop is frozen.
- The notice shows the new logo's icon beside its title, from a PNG in `assets/logo/png/` added to the desktop's resources.
- The desktop otherwise keeps its old icons, as New Logo and Icons leaves them.

#### Traps

- The desktop's other changes in this release, outside bug fixes, are small ones matching server changes: Favorite and Blacklist Filter Modes' filter dropdowns and filter summary line, Recovery Page and Operator Retirement's removal of the Enable Web UI switch, WebUI Loudness Normalization's move of its formula for the shared fixture, and WebUI Multi-Select and Bulk Actions' reload on the bulk event.
- After Desktop Client Removal no desktop update is published, so installed desktops stay on their last version, since the Velopack desktop feed stops getting releases (inferred).
- Later servers stop working with the desktop from Desktop Client Removal in v0.16.0, which removes routes and fields it reads, such as `/api/library/item`, `/api/library-states`, and the filter state's old fields; the accounts release then removes pairing.
- The desktop's Open Web UI menu item exists, and `release.yml` still packages the desktop.

#### Acceptance

- The notice appears on the first start of this version and not again after it is dismissed, in a headless desktop test that the notice shows once per version.
- The notice shows the approved wording, which names ReelRoulette and never the WebUI, in the headless desktop test of the notice.
- The notice's Open ReelRoulette in your browser does what the Open Web UI menu item does, in a headless desktop test that the button runs that item's action.
- The mockup matches what this milestone shipped, including deviations found during implementation, and `node docs/mockups/reelroulette/build/check.mjs` passes.
- `dotnet test ReelRoulette.sln` passes, and one quick spot check.

#### Release checks

- Manual: After updating, the desktop shows the retirement notice once, and Open ReelRoulette in your browser opens ReelRoulette in the browser.

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
- **Depends on**: Per-User Source Permissions, so every stream session is checked against the user's sources from the start.

#### Scope

- Defines OpenAPI contracts for playback-session create and read and the stream URL.
- Playback-session and transcode capability markers join the capability list served by `/api/version` and `/api/capabilities`.
- The WebUI types are regenerated.

#### Acceptance

- OpenAPI includes the playback-session surfaces and validates, in contract tests.
- The WebUI detects a server without playback sessions from the capability list, in a capability check against a server without the feature.
- Generated WebUI types match OpenAPI, and `npm run verify:contracts` passes.

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
- Decides whether `GET /api/media/{idOrToken}` still accepts raw item ids once sessions exist.

#### Traps

- `POST /api/random` and `POST /api/play/{itemId}` already issue a media token, and `GET /api/media/{idOrToken}` streams it with range requests.
- `ServerMediaTokenStore` has no expiry or eviction: every play adds a token that is never removed and stays valid until the server stops.
- `GET /api/media/{idOrToken}` also accepts a raw item id, and the source access policy covers that path.

#### Acceptance

- Direct-stream URLs are issued and validated through playback sessions, in a range-request test on a session URL.
- An expired or unknown token returns the same not-found result, and expired sessions are removed, in token expiry and eviction tests.
- The token store size stays bounded under repeated plays, in size-cap tests.

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
- Decides whether resume positions are per account.
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

### P4 - File Metadata Sync and Extended Metadata

- **Status**: ⏳ Planned
- **Goal**: Import tags and metadata from media files and write them back, through the server.

#### Scope

- A catalog schema change to schema version 4 for the extended metadata columns, with its own migration from schema version 3.
- Metadata sync in core and server services:
  - import tags from supported formats during import and refresh,
  - export tags and metadata to files on demand, with an optional auto-export policy,
  - an explicit, configurable merge policy.
- Metadata sync settings through server settings: auto-import, auto-export, merge strategy, and write confirmation.
- Extended metadata: genre, year, artist or creator, title, album or series, comment, rating.
- Metadata shows in library browse and filters, with batch metadata edit through the API.
- Unsupported formats, read-only or locked files, and network paths are handled, with result summaries and structured logs.

#### Traps

- The catalog is at schema version 3 today.
- No metadata library is referenced today.

#### Acceptance

- Metadata import and export run only through server APIs.
- The supported formats and field mappings are tested, in format mapping tests, and documented, checked by reading the docs.
- The merge policy gives the same result for the same inputs, in merge-policy tests.
- Extended metadata is stored by the server and shown and edited in the WebUI.
- Batch operations follow the conflict and error policy and report success and failure counts with reasons.
- The catalog migrates from schema version 3 to schema version 4, in schema migration tests.

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
- Decides whether history is per account.

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

### P25 - Per-Preset Preset Writes

- **Status**: ⏳ Planned
- **Goal**: Saving, renaming, reordering, or deleting a preset on one device changes only that preset on the server, so two devices editing presets do not overwrite each other.
- **Depends on**: Desktop Client Removal, so only the WebUI moves to per-preset writes and the whole-list replace goes in the same change.

#### Scope

- Per-preset write routes (save, rename, reorder, delete), and the WebUI moves to them.
- The whole-list replace is removed.
- Tag rename and delete keep updating presets on the server.
- A contract change, crossing server, OpenAPI, generated WebUI types, and WebUI.
- Builds on the preset-equality fixture from Remove the Preset Match Route.

#### Traps

- The desktop and the WebUI both post the whole preset list to `POST /api/presets`, which replaces the server's preset catalog.
- The last writer wins, so a preset saved on one client can be lost when the other client saves its older list.
- The desktop posted its cached list not only on a preset save but on every header preset pick and every filter dialog Apply, with the cache refreshed only on connect, reconnect, resync, and filter dialog open, so just picking a preset on the desktop deleted any preset the WebUI had added since.
- Favorite and Blacklist Filter Modes limits the desktop's post to an Apply that changed presets.
- Both clients rebuild every posted preset from their typed filter model, so a field the posting client doesn't know is dropped from every preset.
- On the desktop, that drop was seen with a probe against its build (measured).
- This is the same client-held whole-catalog pattern as the tag sync routes removed in v0.13.0.
- With the WebUI as the only client, two devices still overwrite each other the same way.

#### Acceptance

- A preset saved on one device while another device has its preset list open is still present after the other device saves a different preset, in a two-session test of concurrent saves.
- Rename, reorder, and delete change only the named preset, in server tests for each write.
- Every open WebUI shows the same preset list after any device changes it.
- The WebUI never posts the whole preset list, and the whole-list replace route is gone.
- `npm run verify` passes.

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
- Decides whether startup still empties `last.log` once rotation exists.
- Human-readable rendering is a view over the fields (admin section, console), not what is stored.
- Contract change for `POST /api/logs/client` in OpenAPI and the generated WebUI types.

#### Traps

- `last.log` is free text: server code and `POST /api/logs/client` append bracketed lines through `ServerLogService`.
- `ServerLogService` writes under one process-wide lock.
- `ServerLogService` turns line breaks into a literal `\n` but writes other control characters as sent.
- The server's `ILogger` output goes only to the console.
- Client logs arrive through `POST /api/logs/client` as source, level, and message.
- Startup empties `last.log`.

#### Acceptance

- Every `last.log` line is a JSON object with the required fields and canonical field order, in schema and order tests.
- `lvl`, `cat`, and `svc` values are always from their fixed lists, and an entry written without a `cat` gets `general`, in schema tests and category default tests.
- Entries below the configured minimum level are not written, and with no setting the minimum is `info`, in minimum level tests.
- Server `ILogger` logs and ingested client logs go through the same writer, and every persisted entry has a writer-assigned `ingestReqId`, in correlation tests.
- Client entries keep `clientTs`, `clientOpId`, and trace fields as sent, and `ts` is the write time, in correlation and time-field tests.
- Invalid client payloads get a `400` with every error listed and are not written, in rejection tests for each invalid case.
- A client message with line breaks or control characters cannot produce a second log line, in server tests.
- Rotation, retention, oversized entries, and concurrent appends behave as documented, in rotation and retention edge-case tests.
- `docs/api.md` and `docs/architecture.md` describe the schema, the ingestion contract, and the rotation rules, checked by reading them.
- `dotnet test ReelRoulette.sln` and `npm run verify:contracts` pass.

#### Not included

- Moving the admin section's log view off its current route, which is Admin Log Viewer.

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
  - Server: `api`, `auth`, `sse`, `playback`, `refresh.pipeline`, `storage`.
  - WebUI: `web.app`, `web.player`, `web.library`, `web.api`, `web.sse`.
- Privacy by construction, enforced by the API rather than by rewriting entries afterwards:
  - `msg` and `data` never carry file names or paths, tag or category names, preset or source names, search text, tokens, cookies, PINs or other secrets, or raw media identifiers that reveal content.
  - The one exception is the one-time first-run setup code from Admin First-Run Setup, which the server logs only while no account exists.
  - Prefer fixed templates with counts, booleans, and durations, for example `"Saved preferences."` with `data: { wroteBackup: true }`, or `"API request failed."` with `data: { endpoint: "SetFavorite" }` and no URL.
  - `ex` on `LogError` and `LogFatal` becomes `data.error` with `type`, `code`, `messageSafe`, and an optional fingerprint; raw stack traces, local paths, and payload fragments are not emitted.
  - `data` is checked for size and shape before serialization.
- Until WebUI Instrumentation removes it, the WebUI status relay keeps working by emitting through the new API as `comp` `legacy`, `op` `unmigrated`, level `info`. This is the only inferred path.

#### Acceptance

- The WebUI has the level-typed API with explicit `comp` and `op`, optional `evt` and `cat`, and typed context, in API tests per level and context mapping tests.
- A WebUI entry and a server `ILogger` entry logged with a category are written with that `cat`, and ones logged without one are written as `general`, in category tests for WebUI and server `ILogger` entries.
- `ex` is always written as privacy-safe `data.error`, never as a top-level field, in `ex` normalization tests.
- Oversized or arbitrary `data` is rejected before it is written, in API tests.
- Paths, names, and secrets in the shapes the privacy rules list are refused, in negative tests.
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
  - API handlers, and login and session outcomes.
  - Event stream connect and disconnect.
  - Refresh pipeline stages and outcomes.
  - Catalog open, import, backup, and replace.
  - Settings changes and their errors.
- Favor state changes, decisions, degradations, and failures over repetitive noise.
- Move the remaining hand-built server log lines to `ILogger` with structured fields.

#### Acceptance

- Each listed area emits structured entries with `comp`, `op`, and fitting levels, shown by a captured entry per listed area.
- Request-scoped entries carry trace fields when trace context is active, and every entry carries `ingestReqId`; `clientOpId` appears only when a client sent one, shown by correlation checks.
- Server entries contain no file names, paths, tag names, or secrets, shown by a scan of a captured `last.log` for paths, names, and secrets.

#### Not included

- Logging playback decisions, which is Server Playback Decision Engine.

### P27e - WebUI Instrumentation

- **Status**: ⏳ Planned
- **Goal**: The WebUI logs its key flows as structured entries instead of relaying status-line text.
- **Depends on**: Structured Log API and Privacy Rules, and WebUI Login Gate.

#### Scope

- Structured logs for app startup and compatibility checks, login, event stream connect and retry, API request failures, and major user actions and error states.
- Five flows with stable operation names:
  - `BootstrapSession`: startup and compatibility gating.
  - `LoginSession`: account tile, PIN, and session start.
  - `SseLifecycle`.
  - `RandomPickAndPlay`.
  - `MutateItemState`: favorite, blacklist, and tag-edit apply.
- Remove the status-line relay and the `legacy` path in the WebUI.
- A guard test fails if string-only logging or message parsing comes back.

#### Traps

- The WebUI logs mainly by relaying each status-line message as free text.

#### Acceptance

- The five flows emit structured entries, with trace linkage on request-scoped steps, shown by one captured entry per flow.
- `MutateItemState` covers favorite, blacklist, and tag-edit apply, shown by one captured entry per `MutateItemState` case.
- No WebUI string-only logging or `legacy` entry remains, in the guard test.
- WebUI entries contain no file names, paths, tag names, search text, or PINs, shown by the captured entries.
- `npm run verify` passes.

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
  - The source multi-select takes one option per `svc` value (`server` and `webui`; the desktop client is gone by this release).
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

#### Scope

- One policy takes the request's session context and returns the sources it may see.
- It is applied on every item path: library list query, random selection, item play, `GET /api/media/{idOrToken}` (tokens and raw ids), `GET /api/thumbnail/{itemId}`, `POST /api/library/item`, `POST /api/library-states`, the tag-editor model, auto-tag and duplicate scans, library stats, and `GET /api/sources`.
- The default policy allows every enabled source, so behavior does not change, except that a raw item id of a disabled source no longer streams.

#### Traps

- Source enabled state is applied by separate SQL conditions in list query, random selection, and item play.
- Some paths skip it: `GET /api/media/{idOrToken}` streams any item by its raw id regardless of its source.

#### Acceptance

- Every listed path goes through the policy, and a test policy that denies a source hides that source's items on every one of them, in a denying-policy test per listed path.
- Current behavior is unchanged with the default policy, except that disabled-source items no longer stream by raw id, in a raw-id media test for a disabled source.
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
- Account records: stable id, name, level (admin or user), and a bcrypt or Argon2 PIN hash.
- No custom, fast, or reversible PIN storage.
- Multiple admins are allowed.
- No default account is seeded. A store with no accounts is the first-run setup state.
- Per-account, per-device failed attempts, with a one-hour lockout after 10 failures.
- There is no guest account.
- The schema keeps account identity stable across name and PIN changes, since source permissions will reference account ids here and source ids in the catalog.

#### Acceptance

- Accounts persist in their own store with stable id, name, level, and a bcrypt or Argon2 hash, and no plaintext PIN, in store tests for creation, hashing, and levels.
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
- The `reelroulette-dev-token` default leaves `appsettings.json` and the `-PairingToken` parameter of `run-server.ps1` and `run-server-rebuild.ps1`.
- Session secrets that replace the pairing token must not be passed to a restarted server as an environment variable.
- Remove `pairToken` from the WebUI's `public/runtime-config.json` and `src/config/runtimeConfig.ts`, and its example from the WebUI `README.md`.
- The login flow that replaces the WebUI's pairing request returns a typed result on every failure.

#### Traps

- v0.14.0 kept the `adminAuthMode` field read-only (always `TokenRequired`, posted values ignored) so the contract changes only once.
- `/api` routes still accept the API pairing token as a `token` query, and `GET /api/pair?token=` pairs with it, which puts the token in URLs and in the default request log.
- v0.14.0 stopped accepting the control token in a query and made `/control/pair` POST-only, but left `/api` for this cutover.
- `/api/web-runtime/settings` is on the API plane, so any LAN caller with the API pairing token, which `/runtime-config.json` hands to every browser, can turn WebUI auth off, change the port or remote connections, and read the shared token.
- The desktop called `/api/web-runtime/settings` from other machines, so v0.14.0 did not move it behind the control token; the desktop is gone by this release.
- `OperatorTestingService` mutations are protected only by middleware policy.
- Auth and secret fields in settings DTOs encourage credential leakage; `GET /control/settings` returns the admin token.
- Pairing and control-token problems that go with those flows:
  - Two pairing secrets drift apart: `/api/pair` checks `ServerRuntimeOptions.PairingToken`, while the Operator page, and later the admin section, saves `WebRuntimeSettings.SharedToken`, and `src/core/ReelRoulette.ServerApp/Program.cs` starts with `SharedToken ?? PairingToken` and passes that to a restarted server. Editing the shared token has no effect until a restart, then silently changes the pairing token.
  - `WebRuntimeSettings.AuthMode` is saved by `CoreSettingsService.UpdateWebRuntimeSettings`, but `ServerPairingAuthMiddleware` reads only `RequireAuth`, which the server sets from `AuthMode` only at startup, so setting it to `Off` changes nothing until a restart.
  - `RestartCoordinator.TryLaunchReplacementProcess` in `Program.cs` passes the token to the child as the `CoreServer__PairingToken` environment variable, which other local users can read from `/proc/<pid>/environ` on Linux.
  - The WebUI ships `"pairToken": "reelroulette-dev-token"` in `public/runtime-config.json`, which any browser can fetch, and `src/config/runtimeConfig.ts` parses `pairToken` as a config field.
  - The same `reelroulette-dev-token` default is in `src/core/ReelRoulette.ServerApp/appsettings.json` and the `-PairingToken` parameter of `tools/scripts/run-server.ps1` and `run-server-rebuild.ps1`.
  - The WebUI's pairing request lets a network error reject instead of reporting it in the status line, as the other failed pairing outcomes do.

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
- **Depends on**: Admin First-Run Setup.

#### Scope

- An admin-only Access Control section in the admin section:
  - lists accounts with name and level,
  - adds accounts with name, level, and initial PIN,
  - edits name and level,
  - resets a PIN,
  - removes accounts.
- The last admin cannot be removed or demoted.
- Admins change their own name and PIN through the same self-service flow as users.

#### Acceptance

- Admins can list, add, edit, reset PINs for, and remove accounts, in server tests of account changes and PIN resets, and admin section UI tests for the section.
- User-level accounts cannot reach account administration, in server tests.
- The last admin cannot be deleted or demoted, in server tests of last-admin protection, and admin section UI tests for its errors.
- Changes persist across restart and apply to later logins, in server tests of account changes and level changes.

### P28h - Self-Service PIN Change

- **Status**: ⏳ Planned
- **Goal**: Logged-in users change their own PIN from the WebUI.
- **Depends on**: Account Administration.

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

- Profile editing beyond name and PIN.

### P28j - WebUI Login Gate

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for a PIN before any library or player surface when it is not opened from the server machine.
- **Depends on**: Self-Service PIN Change.

#### Scope

- Opened from localhost, the WebUI is trusted and shows no login.
- Otherwise, an account tile grid shows before the shell, library, player, or random controls.
- Tiles use `admin_panel_settings` for admins and `account_circle` for users, with names below.
- Selecting a tile shows a PIN prompt.
- Server-unavailable messages offer a retry.
- The gate also has a setup-incomplete message.
- No session is persisted: the user logs in on every open or reload.
- API and event stream calls carry the session after login.

#### Acceptance

- From another device, no library, random, or player surface is reachable before login; from localhost, no login is shown, in WebUI tests for gating.
- Tiles use the required icons and names at desktop and mobile widths, in WebUI tests for login.
- Failed PINs and lockouts show clear errors, including the remaining lockout time, in WebUI tests for wrong PIN and lockout.
- Before first-run setup is done, the gate shows the setup-incomplete message, in WebUI tests for setup incomplete.
- Reloading or reopening needs a new login, in WebUI tests for reload.
- API and event stream traffic uses the logged-in session, in WebUI tests for session use.
- `npm run verify` passes.

#### Release checks

- Manual: The WebUI from another device needs a PIN on every open and reload, on desktop and phone browsers; from the server machine it does not.

#### Not included

- Offline PWA login.
- Remember-me sessions.
- Remembered accounts.
- Biometrics.

### P28k - Per-User Source Permissions

- **Status**: ⏳ Planned
- **Goal**: Admins choose which sources each user sees, and the source access policy enforces it.
- **Depends on**: Source Access Policy, Account Administration, and Admin Source and Item Management.

#### Scope

- Per-source, per-user access in the admin section's Manage Sources.
- Grants are stored in the account store against account ids and catalog source ids.
- A grant for a source id that is not in the catalog (for example after a catalog import) is ignored and shown as stale in the admin section.
- Denied sources are enforced through the source access policy on every path it covers, including `GET /api/media/{idOrToken}`, `GET /api/thumbnail/{itemId}`, and `POST /api/play/{itemId}`.
- Admins and localhost connections see every source.

#### Acceptance

- Admins can grant or deny each user each source in the admin section, in admin section UI tests for permission editing.
- Denied sources and their items are invisible to that user on every policy path, in policy tests for every path with a denied source.
- A denied item cannot be streamed, played, or have its thumbnail read, even by a client that knows its id, in direct-id bypass tests.
- Permission changes reach active sessions through events or requery, in server tests.
- Grants survive account and source renames, and a catalog import leaves grants for missing sources inert, in server tests, including a catalog-import test for stale grants.

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
- The header's admin icon, always visible before accounts, shows only to admins, including localhost, which is trusted as admin.
- The admin section is reachable only by admins.
- Messages for a user with no visible sources and for an item that becomes inaccessible.
- Docs and the testing checklist are updated for per-user source visibility.

#### Acceptance

- The WebUI never shows denied sources or plays denied items, in WebUI tests for hidden sources and inaccessible items.
- Permission changes made in the admin section reach open WebUI sessions through events or requery, in WebUI tests.
- Client filtering cannot widen what the server returns, in WebUI tests.
- Users without admin rights do not see the admin icon and cannot open the admin section, in WebUI tests for the admin icon's and admin section's visibility.

#### Release checks

- Manual: An admin and a user account in the WebUI on two devices see only their allowed sources, and a permission change in the admin section reaches both without a reload.

#### Not included

- Client requests for source access.
- Approval workflows.
- External sharing.

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
- **Goal**: Close the server and Core robustness findings that no other milestone owns, so bad input and crashes cannot lose settings or grow memory without bound.

#### Scope

- Settings, for the desktop's settings file:
  - Corrupt JSON replaced by defaults: tell a missing file from an unreadable one in `JsonFileStorageService.Load`, and move an unreadable file aside before returning defaults.
  - Non-atomic save fallback: use `File.Move(temp, path, overwrite: true)` as the fallback in `JsonFileStorageService.Save`.
- Paths and processes:
  - Thumbnail path from an unchecked id: `RefreshPipelineService.GetThumbnailPath` accepts only the id format the server generates and checks that the full path stays under the thumbnail folder.
  - Unread process output: `RefreshPipelineService.VerifyFfmpegAsync` reads both of ffmpeg's streams or stops redirecting them.
  - Shell launch: `RestartCoordinator.TryLaunchReplacementProcess` waits for the port in managed code and starts the process with `ProcessStartInfo.ArgumentList`, with no shell.
  - Stuck restart flag: clear `_restartInProgress` when the scheduled stop fails, or track Idle, Pending, Stopping, and Failed states.
  - Autostart entry quoting: `LinuxXdgStartupLaunchService.BuildDesktopEntryContent` escapes the path to the Desktop Entry spec.
  - Autostart status: `LinuxXdgStartupLaunchService.GetStatusAsync` parses both `Hidden` and `X-GNOME-Autostart-enabled`, and checks that the `Exec` path exists.
  - Uncancellable hashing: `FileFingerprintService.ComputeFingerprint` hashes asynchronously with a `CancellationToken`.
- Memory and selection:
  - Unbounded randomization state: cap the count of `LibraryPlaybackService._clientRandomizationStates`, evict the least recently used, and limit id length.
  - Weak eligible-set signature: `RandomSelectionEngineCore.ComputeEligibleSignature` compares the count plus a SHA-256 over the ids in order.
  - Telemetry reads: `ApiTelemetryService` keeps a ring buffer that reads newest first.
  - Session list under lock: `ServerSessionStore.GetActiveSessions` copies the records under the lock and sorts outside it.
  - Dead write-back: `DynamicCorsOriginRegistry` keeps the rebuilt list only in the registry.
- Events:
  - Revision reuse after a restart: give each server start an instance id that clients send back with the last event ID, or start revisions from a value that cannot repeat, and send `resyncRequired` on a mismatch. This is a contract change.
- The audio filter's handling of unscanned videos: decides whether a NULL `has_audio` counts as **With audio**, **Without audio**, or neither, then aligns `docs/api.md`, both clients' labels, and tests.

#### Traps

- Settings, for the desktop's settings file:
  - Corrupt JSON replaced by defaults: `JsonFileStorageService.Load` (used for `desktop-settings.json`) returns the default object on any read or parse error, and the next `Save` overwrites the file.
  - Non-atomic save fallback: when `File.Replace` throws, `JsonFileStorageService.Save` falls back to `File.Copy` over the original and then `File.Delete`, which can leave a truncated file after a crash.
  - The two `JsonFileStorageService` findings affect only the desktop's `desktop-settings.json`: no server or ServerApp code references the class (measured).
- Paths and processes:
  - Thumbnail path from an unchecked id: `RefreshPipelineService.GetThumbnailPath` builds `Path.Combine(_thumbnailDir, $"{itemId}.jpg")` from the catalog item id, and an imported `library.db` can hold any id, including `..` segments, so a thumbnail write or delete could land outside the thumbnail folder.
  - Unread process output: `RefreshPipelineService.VerifyFfmpegAsync` redirects ffmpeg's standard output and error, reads neither, and waits for exit; enough output would fill a pipe and hang the check. The other ffmpeg and ffprobe calls already read stderr.
  - Shell launch: on Linux, `RestartCoordinator.TryLaunchReplacementProcess` in `src/core/ReelRoulette.ServerApp/Program.cs` builds one `/bin/bash -lc` script with the process path, assembly path, host, and port interpolated, so a path containing `"` or `\` breaks it.
  - Stuck restart flag: `RestartCoordinator.TryRestartAsync` and `TryStopAsync` set `_restartInProgress` and clear it only when the request is not accepted. If the scheduled stop fails or the process does not exit, every later restart or stop answers "already in progress".
  - Autostart entry quoting: `LinuxXdgStartupLaunchService.BuildDesktopEntryContent` writes `Exec="<path>"` without escaping, while the Desktop Entry spec requires `"`, `` ` ``, `$`, and `\` inside a quoted argument to be backslash-escaped and `%` to be written `%%`.
  - Autostart status: `LinuxXdgStartupLaunchService.GetStatusAsync` reports enabled whenever the file lacks `Hidden=true`, ignoring `X-GNOME-Autostart-enabled=false` and a missing `Exec` target.
  - Uncancellable hashing: `FileFingerprintService.ComputeFingerprint` hashes the whole file synchronously with no cancellation, and the refresh fingerprint stage calls it, so stopping the server during a large file waits for the hash to finish.
- Memory and selection:
  - Unbounded randomization state: `LibraryPlaybackService._clientRandomizationStates` keeps one shuffle state per client and session key and never removes any, and the ids come from requests.
  - Weak eligible-set signature: `RandomSelectionEngineCore.ComputeEligibleSignature` uses a 32-bit `HashCode` over the eligible item ids, so two different eligible sets can collide and reuse the wrong shuffle state.
  - Telemetry reads: `ApiTelemetryService.GetIncoming` and `GetOutgoing` call `Reverse()` over the whole queue on every control status poll.
  - Session list under lock: `ServerSessionStore.GetActiveSessions` filters, sorts, and projects inside the session lock.
  - Dead write-back: `DynamicCorsOriginRegistry.RebuildAllowedOrigins` writes the rebuilt list back into the shared `ServerRuntimeOptions.CorsAllowedOrigins`, which nothing reads after the registry's constructor.
- Events:
  - Revision reuse after a restart: `ServerStateService` starts its revision counter at zero on every start. A client that reconnects after the restarted server has published past that client's last event ID, but no further than its replay history, gets a partial replay from the new server and no `resyncRequired`.
- The audio filter's handling of unscanned videos: `LibraryCatalogListQuery` matches **With audio** on `has_audio = 1` and **Without audio** on `has_audio = 0`, so a video whose audio has not been scanned (`has_audio` NULL) is hidden by both.

#### Acceptance

- A catalog item id that would resolve outside the thumbnail folder is refused, in its finding's test.
- No server process launch goes through a shell, in its finding's test.
- Randomization state stays within its cap under many client and session ids, in its finding's test.
- Each finding above is fixed or explicitly declined with a reason in this entry.
- Each fixed finding has a test.
- `dotnet test ReelRoulette.sln` passes.

#### Not included

- The server's own settings findings (partial posts, the non-atomic write, and the silent load failure), which is Server Settings Robustness, since the admin section saves server settings from any device.
- Closing the two desktop settings findings by deleting `JsonFileStorageService` if it is still unused, which is Desktop Client Removal.

---

### P36 - Client Robustness Findings

- **Status**: ⏳ Planned
- **Goal**: Close the WebUI and dev-script robustness findings that no other milestone owns.

#### Scope

- WebUI:
  - Client and session ids: once login sessions exist, decides whether the server derives them from the session instead, and keeps them from ever becoming an auth secret.
- Dev scripts:
  - Missing install: `tools/scripts/run-server-rebuild.ps1` runs `npm ci` when `node_modules` is missing or older than `package-lock.json`, with a `-SkipInstall` switch.

#### Traps

- WebUI:
  - Client and session ids: `src/api/coreApi.ts` keeps the client id in `localStorage` and the session id in `sessionStorage`, and `sseClient.ts` puts both in the event stream URL, where proxy access logs record them.
  - They identify a randomization scope and are not credentials today.
- Dev scripts:
  - Missing install: `tools/scripts/run-server-rebuild.ps1` runs `npm run build` without installing packages, so a clean clone or a changed lockfile builds stale or fails.

#### Acceptance

- Each finding above is fixed or explicitly declined with a reason in this entry.
- Each fixed finding has a test.
- `npm run verify` passes.

#### Not included

- The desktop's findings (unbounded event payload, ambiguous API results, an undisposed cancellation source, timers after close, plain HTTP to another machine, and undetected black video on Fedora), since the desktop is frozen to bug fixes.
- The startup error markup finding, which is WebUI Preact Migration.
- Overlapping resyncs, which is Admin Source and Item Management, since it already changes that code.
- Unchecked JSON, which is WebUI Status Line Overhaul, since it already changes that code.
- Favorite and blacklist after Next, which is WebUI Multi-Select and Bulk Actions, since it already changes that code.
- The weak build check, which is New Logo and Icons, since it already changes that code.

---

### P48 - Desktop Client Removal

- **Status**: ⏳ Planned
- **Goal**: The desktop client, its packaging, and its tests are gone, and the WebUI is the only client.
- **Depends on**: WebUI Volume and Enhanced Audio, WebUI Loudness Normalization, WebUI Autoplay Modes, WebUI Player Controls and Ambient Mode, WebUI Keyboard Shortcuts, WebUI Stats Panel, WebUI Settings Panel, Admin Refresh, Backup, and Duplicate Review, Show in File Manager from the WebUI, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Multi-Select and Bulk Actions, and Browser-Playable Filter.

#### Decisions

- These desktop features are dropped without a WebUI equivalent, because a browser cannot offer them:
  - always-on-top (the closest is picture-in-picture, which the WebUI turns off with `disablepictureinpicture`),
  - desktop self-update,
  - the Linux dependency dialog,
  - application menu registration,
  - the FFmpeg log window, which has been empty since the server took over refresh.
- These desktop Settings dialog entries are dropped as not useful in the WebUI:
  - the desktop's own dev update channel (the server's is in the admin section),
  - client settings backups (the WebUI's settings are a few values in browser storage),
  - the core server base URL (the WebUI calls the server that served it),
  - Force API playback (the WebUI always plays through `/api/media`),
  - image scaling (it limits how large the desktop decodes photos, and the browser scales photos to fit by itself).

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Code and tests | ⏳ Planned | The desktop projects, the Core code only the desktop uses, and their tests removed from the solution and the repository. |
| Packaging | ⏳ Planned | A release that builds and publishes only the server, with no desktop references in the release scripts. |
| Contract | ⏳ Planned | Routes and fields that no remaining caller uses removed, in OpenAPI and the generated WebUI types. |
| Icons | ⏳ Planned | The old icons deleted. |
| Fixture | ⏳ Planned | The former desktop fixtures kept as WebUI test data. |
| Docs | ⏳ Planned | Current-state docs, the testing checklist, and `AGENTS.md` without the desktop client. |

#### Code and tests slice

**Scope**

- Remove `ReelRoulette.DesktopApp`, `ReelRoulette.LibraryArchive`, and `ReelRoulette.DesktopApp.Tests` from the solution and the repository.
- Remove Core's `LibraryGridLayout` and its tests, which only the desktop uses.
- Remove `JsonFileStorageService` and `CoreStorageServices` if nothing else uses them.

**Traps**

- The three projects are about 30,300 lines of C# and AXAML, including 3,267 test lines and 134 tests (measured).

**Acceptance**

- The solution has no desktop projects.
- `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.

#### Packaging slice

**Scope**

- Remove the `desktop` component from the `release.yml` matrix, including the Windows LibVLC relocation step and its legs' old `--icon`.
- Stop publishing the desktop update feed.
- Remove the desktop references in `set-release-version.ps1` and `verify-linux-packaged-server-smoke.sh`.

**Traps**

- CI has no desktop job: desktop tests run inside the solution test on the Ubuntu and Windows jobs, so `ci.yml` needs no change.

**Acceptance**

- `release.yml` builds and publishes only server packages and feeds, checked by reading it.
- `./tools/scripts/verify-linux-packaged-server-smoke.sh` passes.

#### Contract slice

**Scope**

- Remove routes and fields that no remaining caller uses, each checked against the WebUI and the admin section.
- Remove the web runtime settings' `enabled` field, which the server has ignored and reported as on since Recovery Page and Operator Retirement.
- Remove the filter state's old `favoritesOnly` and `excludeBlacklisted` fields, which Favorite and Blacklist Filter Modes keeps beside its new ones.
- Candidates:
  - `PresetResponse.summary`, which the server never fills,
  - `/api/library-states`,
  - `/api/library/item`,
  - the full path kept in the random and play responses' `id` for the desktop,
  - `itemTagsChanged.itemIds` and the auto-tag apply response's `changedItemPaths`, which the WebUI no longer reads beside their item id fields.
- `/api/library/catalog-checkpoint` stays for the admin section's export.
- OpenAPI and the generated WebUI types change with the routes and fields.

**Traps**

- The server keeps each preset's filter state as the JSON it was posted with.
- A preset saved before Favorite and Blacklist Filter Modes and never saved again carries only the old fields, so removing them needs the parser to keep reading them in stored presets, or a catalog migration that writes the new fields into those presets (inferred).

**Acceptance**

- OpenAPI has no route or field that only the desktop used, including the web runtime settings' `enabled` field, checked by reading `shared/api/openapi.yaml`.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Icons slice

**Scope**

- Delete the old icons `assets/HI.ico`, `assets/HI-256.png`, and `assets/HI-512.png` once nothing uses them.

**Traps**

- After New Logo and Icons only the desktop uses them: its `ApplicationIcon`, window icon (`MainWindow.axaml`), Avalonia resource, Linux menu registration (`LinuxAppImageRegistration.cs`), and its release legs' `--icon`.

**Acceptance**

- `assets/HI.ico`, `assets/HI-256.png`, and `assets/HI-512.png` are deleted, and nothing refers to them, checked by a search of the repository.

#### Fixture slice

**Scope**

- `event-revision.json`, `library-tile-effect.json`, `loudness-normalization-gain.json`, `preset-filter-equality.json`, and `sort-direction-labels.json` lose their C# readers and stay as WebUI test data.
- `tag-name-order.json` and `filter-mode-resolution.json` stay, read by Core and the WebUI.

**Acceptance**

- The five former desktop fixtures are read by WebUI tests.
- `dotnet test ReelRoulette.sln` and `npm run verify` pass.

#### Docs slice

**Scope**

- `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, `docs/dev-setup.md`, and `README.md` (desktop install and the LibVLC prerequisite) no longer describe the desktop client.
- The testing checklist loses its desktop Smoke item and the desktop in-app update item in Release Flow.
- `AGENTS.md` loses the desktop freeze rule and the desktop test-isolation note, and keeps the shared-fixture rule for rules implemented in server C# and the WebUI.

**Acceptance**

- No current-state doc describes the desktop client as current, checked by a search of current-state docs for the desktop client.

#### Release checks

- Agent: On Linux and Windows, the release publishes only the server, checked in a dev-channel release run of `release.yml`.
- Manual: On Linux and Windows, every former desktop workflow works in the WebUI, and an existing desktop install keeps its last version.

#### Not included

- Rewriting historical `CHANGELOG.md` sections and completed milestones, which keep their desktop references.

---

### P50 - Desktop App Shell

- **Status**: ⏳ Planned
- **Goal**: An optional desktop app wraps the WebUI as-is and adds the native features a browser can't offer: browsing for a source folder and saving the library export with Save as.
- **Depends on**: Admin Source and Item Management, whose add-folder field gets Browse, and Admin Library Catalog Transfer, whose export gets Save as, and it starts only once the new UI has been in daily use.
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
