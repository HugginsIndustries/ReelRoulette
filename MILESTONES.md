# ReelRoulette Milestones

This document is the migration planning and verification board for ReelRoulette.
It tracks scope, sequencing, acceptance criteria, and evidence by milestone.

## Planned Releases

An outline of upcoming releases and the milestones each one ships, in order. Each release becomes a new `M*` series when it is promoted.

The WebUI becomes the only client on every device. The desktop client is frozen to bug fixes (crashes, data loss, broken playback, security) until the desktop removal release, and until then server contract changes only add fields, so the last desktop build keeps working. The native Android client is dropped.

- **v0.14.1 — Catalog safety and performance**: Leave a catalog written by a newer build, or a damaged one, untouched with its backups while the server keeps running without a library, make library browse, window reloads, and random selection cheap on large catalogs, update dependencies with matching SkiaSharp natives in the shipped server, cache thumbnails until they change, and identify items by ID in every event and response. M11a, M11b, M11c, M11d, M11e, M11f.
- **v0.15.0 — WebUI overhaul**: Serve the WebUI over HTTPS so it installs as an app, move it to Preact, give it a responsive layout with side panels and phone overlays, and add keyboard shortcuts, stats, settings, an admin section that replaces the Operator page, duplicate review, and Show in File Manager. P28a, P38, P39, P34, P20, P26a, P40, P41, P42, P43, P44, P45, P31.
- **v0.15.1 — Desktop parity**: Give the WebUI everything else the desktop does, including source management, catalog transfer, multi-select, and a browser-playable filter, while the desktop still ships as a fallback. P26b, P26c, P26d, P37, P46, P47.
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

Last milestone completed: M11c

### M11d - Dependency Updates

- **Status**: 🚧 In Progress (slices 1, 2, and 3 complete, slice 4 implemented)
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
    - The Release Specific checklist item "The release run packs and uploads every leg, and an installed v0.14.x server and desktop take the in-app delta update to this release, on Linux and Windows." covers this.
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
  - Slice 3: The Velopack library and `vpk` are both 1.2.161. Every `vpk` command in `release.yml` has been checked against the 1.2.161 release notes and updated where they changed. The release run itself, packing and uploading all legs and the in-app delta update from v0.14.x, is covered by the Release Specific checklist item.
  - Slice 4: The WebUI builds and tests on Vite 8 and Vitest 5 with the same test count as before. `npm audit` reports no dev dependency findings that a fix within these limits can clear, and js-yaml stays on 4.x.
  - Slice 5: Every test project runs the same number of xUnit v2 tests on xunit.runner.visualstudio 4.0.0 as on 3.1.5.
- **Verification evidence**:
  - Completion evidence must include, per slice, `dotnet test ReelRoulette.sln` and a green CI run. Add `npm run verify` for slices 1, 2, and 4, and `./tools/scripts/verify-linux-packaged-server-smoke.sh` for slices 1 and 3. Slice 1 also needs the resolved SkiaSharp packages from ServerApp's `project.assets.json`, and slice 4 the `npm audit` output before and after.
  - Checks that need a release run are Release Specific checklist items: desktop playback and the Windows tray menu after the safe batch, the bundled `ffprobe -version` naming the pinned build for build reproducibility, and the release run packing and uploading every leg with the in-app delta update from v0.14.x for Velopack.
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
    - Release run, upload, and the delta update from v0.14.x: the Release Specific checklist item "The release run packs and uploads every leg, and an installed v0.14.x server and desktop take the in-app delta update to this release, on Linux and Windows."
    - CI run 37518838688 passed on Linux, Windows, and WebUI verify, with the same 383, 269, and 3 tests on both OSes.
  - Slice 4:
    - Vite 8.3.3, the latest stable, and Vitest 5.0.3. The Vite 8 and Vitest 4 and 5 migration guides were read. The WebUI config sets none of the changed options, and its tests use none of the changed APIs. Vitest 5 clearing mock history before each test changed no result.
    - Typecheck failed after the update: five tests import `node:fs` for shared fixtures, and `tsconfig.app.json` loads only `vite/client` types. `tsc --explainFiles` on the old lockfile showed that `@types/node` reached the app typecheck only through Vite 7's Node-side types, which Vite 8 no longer pulls in. `tsconfig.app.json` now excludes `src/test`, a new `tsconfig.test.json` checks `src/test` with Node types, and `npm run typecheck` runs both. The app check lists 92 source files with no tests and no `@types/node`, the test check lists all 20 test files, and an injected type error in a test fails only the test check.
    - `npm audit`: 9 findings before (2 moderate, 5 high, 2 critical: `@redocly/openapi-core`, `@vitest/mocker`, brace-expansion, js-yaml, nanoid, postcss, source-map-js, tinypool, vitest), 0 after. The brace-expansion pin is ^5.0.12 and the js-yaml pin ^4.3.2, which resolve 5.0.12 and 4.3.2. Vite 8 resolves postcss 8.5.29, nanoid 3.3.20, and source-map-js 1.2.2, and Vitest 5 no longer uses tinypool, so `npm audit fix` was not needed.
    - `npm run verify` passed with 232 tests in 20 files before and after. The build keeps the same files: the JS bundle went from 120,395 to 118,200 bytes and the CSS from 23,722 to 24,353 bytes, which the Vite 8 guide attributes to Lightning CSS minification. `pwsh ./tools/scripts/verify-web-deploy.ps1` passed with the new build.
    - `dotnet build ReelRoulette.sln` has no warnings, and `dotnet test ReelRoulette.sln` ran 383, 269, and 3 tests, all passing.
    - The newer default browser targets and the CSS minifier are covered by the Release Specific checklist item "After the Vite 8 build change, the WebUI looks and works as before in a desktop browser and on a phone."
    - CI run: pending.

### M11e - Thumbnail Caching

- **Status**: ⏳ Planned
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

### M11f - Item IDs in the Contract

- **Status**: ⏳ Planned
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
  - A shortcut editor in the WebUI settings panel: list actions and bindings, capture keys with `Ctrl`, `Shift`, and `Alt`, detect conflicts, and reset one or all bindings.
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

### P20 - WebUI Settings Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI has a settings panel for per-device preferences and diagnostics.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Responsive Layout and Panels.
  - A settings panel in the panel layout. The admin section joins it in Admin Section in WebUI Settings.
  - Move the diagnostics information to the settings panel and remove the diagnostics panel from below the main page's status line. That panel is currently shown only on mobile browsers by design; in the v0.13.0 manual regression pass it appeared only on the phone in Firefox.
  - Per-device preferences: photo duration and randomization mode (in the top bar today), autoplay and loop defaults, and an option to remember filter settings across sessions. The option is off by default, so the WebUI keeps opening with default filters unless the user turns it on.
  - Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - The settings panel shows the diagnostics information on desktop and mobile browsers, and the main page no longer shows the diagnostics panel.
  - With the remember option on, filter settings survive closing and reopening the WebUI on that device. With it off, the WebUI opens with default filter settings.
  - Preferences are stored per device and do not change other devices.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for preference storage and the remember option, `npm run verify`, and one quick spot check on a phone.
  - A desktop browser and phone pass, with the remember option checked across a browser restart, is a Release Specific checklist item.

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

### P26a - Admin Section in WebUI Settings

- **Status**: ⏳ Planned
- **Goal**: Everything the Operator page does moves into an admin section of the WebUI settings panel, and the server keeps a minimal recovery page for when the WebUI's files are broken.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Settings Panel, and Catalog Open and Backup Safety, whose library state and message the admin section shows.
  - The Operator page is about 780 lines of HTML, CSS, and JavaScript inside a raw string in `src/core/ReelRoulette.ServerApp/Program.cs`, and no test covers `/operator`.
  - Admin section slice:
    - Move every Operator section into the admin section as Preact screens: server updates, runtime status with restart and stop (including the message when the server runs without a library), web runtime settings, control settings (control token, dev channel, Launch Server on Startup), the testing suite, connected clients, server logs, and incoming and outgoing API events. They call the same control routes, so there is no contract change.
    - The Operator's update download needs two attempts every time: click Download and confirm, and nothing happens; click Download and confirm again, and it downloads. Find the cause before building the admin section's update controls, so they don't inherit it.
    - Gating: localhost is trusted. From another machine, the admin section shows nothing until the control token is entered through `POST /control/pair`. The accounts release replaces the token with admin accounts.
    - Later admin work lands here: refresh, backup, and duplicate review, source and item management, catalog transfer, the Log Viewer, and account administration.
  - Recovery page slice:
    - The server keeps a minimal built-in page with restart, stop, a log tail, and updates, at a fixed path such as `/recovery` (decided here). It does not load the WebUI's files, so it works when they are missing or broken, and it has the same control-token gating.
    - It renders settings and status text without `innerHTML` interpolation (found by the repository audit: Operator HTML page interpolates user input via `innerHTML`).
    - Retire the Operator page: `/operator` redirects to the admin section, the tray's Operator shortcut opens the admin section, and `verify-linux-packaged-server-smoke.sh` checks the recovery page and the admin section entry instead of `/operator`.
- **Acceptance criteria**:
  - The admin section offers every action and setting the Operator page offers today and calls the same routes.
  - In the admin section, one Download click and one confirmation start the update download.
  - From another machine, nothing in the admin section is shown until a valid control token is entered; on localhost it opens without one.
  - With the WebUI's files removed, the recovery page restarts, stops, shows logs, and checks, downloads, and applies updates.
  - The recovery page renders settings, status, and log text without `innerHTML` interpolation.
  - `/operator` reaches the admin section, and the packaged Linux server smoke passes against the recovery page.
- **Verification evidence**:
  - Completion evidence must include admin section UI tests for loading status and settings, saving settings, the testing panel, and control-token gating in `npm run verify`, server tests that the recovery page is served without WebUI assets and keeps control-token gating, `dotnet test ReelRoulette.sln`, and `./tools/scripts/verify-linux-packaged-server-smoke.sh`.
  - Add a Release Specific checklist item: "From another machine, the admin section asks for the control token and works after it is entered; with the WebUI files removed, the recovery page restarts, stops, shows logs, and applies an update, on Linux and Windows."

### P26b - WebUI Source State Sync

- **Status**: ⏳ Planned
- **Goal**: The WebUI updates its library window and filter source list when a source is enabled, disabled, added, or removed elsewhere.
- **Scope**:
  - Planned for v0.15.1.
  - The server already applies source state: list query, random selection, and item play only use enabled sources. The WebUI keeps no source authority of its own; its source checkboxes are a filter choice.
  - What is missing: the WebUI ignores `sourceStateChanged`, and it reads `GET /api/sources` only when the filter dialog opens.
  - On `sourceStateChanged`, reload the loaded library window (keeping the scroll position, as the desktop does) and refresh the filter source list.
  - Source administration is Admin Source and Item Management; this milestone only makes the library window and filter react to it.
- **Acceptance criteria**:
  - Enabling or disabling a source from the admin section or the desktop updates the WebUI library window and filter source list without a reload.
  - A source imported elsewhere appears in the WebUI filter source list.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for `sourceStateChanged` handling and `npm run verify`, plus one quick spot check of an admin section source toggle seen in another WebUI tab.

### P26c - Admin Source and Item Management

- **Status**: ⏳ Planned
- **Goal**: Manage sources and remove library items from the WebUI admin section, with server routes for what no client can do today.
- **Scope**:
  - Planned for v0.15.1. Depends on: Admin Section in WebUI Settings.
  - Gated like the rest of the admin section: localhost, or the control token from other machines. The accounts release later moves this behind admin accounts.
  - Today the desktop Manage Sources dialog shows Rename and Remove buttons and the grid shows Remove from Library, but none of them has a server route; v0.14.0 hides them, and the frozen desktop keeps them hidden.
  - Contract slice: server routes to rename a source, remove a source (its items leave the catalog; files stay on disk), and remove items from the library, with the delete-from-disk option the desktop remove dialog offers. OpenAPI and generated WebUI types.
  - Manage Sources slice: list sources with the statistics the desktop dialog shows (total media, videos, photos, total duration, and videos with and without audio), add a folder, rename, remove, enable and disable, and refresh. Folder import, enable and disable, and refresh routes already exist. Duplicate review is Admin Refresh, Backup, and Duplicate Review.
  - Adding a folder takes a path on the server machine. A browser folder picker returns paths on the browser's machine (inferred), and the desktop's Import Folder has the same flaw today: it sends its own folder picker path to the server (read from code), so it only works on the server machine. Whether the admin section takes a typed path that the server checks, or browses the server's folders through a new admin-only route, is decided here; a browse route is a contract change in its own slice.
  - The item removal route also serves bulk removal in WebUI Multi-Select and Remaining Desktop Features.
  - Source and item changes publish events so connected clients update.
  - Not included: per-user source visibility, which is Per-User Source Permissions.
- **Acceptance criteria**:
  - From the admin section, sources can be added by server path, renamed, removed, enabled, disabled, and refreshed, with per-source statistics.
  - Removing a source removes its items from the catalog and leaves its files.
  - The item removal route removes items with and without deleting from disk.
  - Connected WebUI sessions update through events and list requery.
  - New routes are in OpenAPI, and `npm run verify:contracts` passes.
- **Verification evidence**:
  - Completion evidence must include server tests for each new route, admin section UI tests for Manage Sources, `dotnet test ReelRoulette.sln`, and `npm run verify`.
  - Add a Release Specific checklist item: "From the admin section, add, rename, disable, refresh, and remove a source, and other open WebUI sessions update without a reload."

### P26d - Admin Library Catalog Transfer

- **Status**: ⏳ Planned
- **Goal**: Export and import the library from the WebUI admin section, with the server applying the catalog, so catalog transfer does not need the desktop app.
- **Scope**:
  - Planned for v0.15.1. Depends on: Admin Section in WebUI Settings, Remove library.json Library Support, and Catalog Open and Backup Safety, so import can restore a library while the server runs without one.
  - Gated like the rest of the admin section.
  - Today import is desktop-only and needs the server stopped: `LibraryArchiveMigration.ImportDatabase` writes the server's `library.db` from the desktop process (read from code). This is the main blocker for removing the desktop.
  - Move the `library.db` checkpoint transfer onto server operations. The server writes the checkpoint while it has `library.db` open. Settings and backups are not part of the transfer. Presets and thumbnail revision and dimensions travel with `library.db`. JPEG files stay in the local thumbnail directory.
  - Reuse the replace-and-recover protocol already in `LibraryCatalogStore` (incoming file, finished-file rename, recovery), which the desktop import uses today with the server stopped. What is new is replacing the database while the server's catalog session is open.
  - Import runs while the server is up. The previous database stays aside until the new file is in place and opens. A crash between those renames restores the previous file, or promotes the finished temporary file if that is the one that landed. A file that is not a library database is rejected.
  - Import also works while the server runs without a library, and can import one of the server's own backups, which is how the admin section restores a backup.
  - Import keeps the source folder remap the desktop import offers.
  - Add export and import actions to the admin section. Desktop Client Removal removes the desktop's Library Export and Import menus.
  - Trap: measured on the developer's catalog, `library.db` is 70.5 MB for 49,050 items, larger than ASP.NET Core's default request body limit of about 30 MB (the framework default, not tested here). The import upload needs its own limit and should stream to the incoming file rather than buffer in memory.
- **Acceptance criteria**:
  - The admin section can export a server-produced checkpoint and import a `library.db` while the server is running.
  - An interrupted import leaves the previous catalog or the finished incoming file, never a partial database or an empty catalog.
  - Import rejects a file that is not a library database and does not replace the live catalog.
  - Import replaces the catalog, including presets and thumbnail revision and dimensions. Settings and backups stay where they are. JPEG files stay in the local thumbnail directory.
  - Connected clients resync after an import.
- **Verification evidence**:
  - Completion evidence must include server tests for checkpoint export, running-server import, rejection of a file that is not a library database, and interrupted-replace recovery, plus admin section UI tests for export and import, including an upload larger than 30 MB.
  - Add a Release Specific checklist item: "With no desktop app, export the library from the admin section and import it into a fresh server, on Linux and Windows."

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
  - Planned for v0.18.0. Depends on: Structured Log Schema, Writer, and Ingestion, and Admin Section in WebUI Settings.
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

### P28a - Reverse Proxy and HTTPS Access

- **Status**: ⏳ Planned
- **Goal**: The server works correctly behind an HTTPS reverse proxy, and the docs show how to set one up, including `tailscale serve`.
- **Scope**:
  - First milestone of the WebUI overhaul release, planned for v0.15.0, moved there from the accounts release: with the WebUI as the only client on phones, installing it as an app needs HTTPS, and the overhaul is designed and tested as an installed app. It still lands before PIN login, so LAN and remote logins do not send PINs in clear text, and behind a proxy today's pairing token stops crossing the LAN in clear text. The server does not serve HTTPS itself.
  - Document reverse proxy setup in `README.md` and `docs/dev-setup.md`: a general proxy example and `tailscale serve`, with the headers the server needs.
  - Server fixes so it behaves correctly behind a proxy:
    - Honor forwarded headers only from configured proxies. A request that came through a proxy is not a localhost request, even when the proxy runs on the server machine, so localhost trust applies only to direct loopback connections. Check during this milestone which forwarding headers `tailscale serve` sends; if a proxy sends none, document that it must, or how the server is told the proxy address.
    - Treat a missing remote address as not local (found by the repository audit: `RemoteIpAddress == null` treated as local).
    - Merge the two identical localhost checks into one helper that every localhost decision uses: `IsLocalRequest` in `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` and in `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`. Both treat a missing remote address as local, and a request to the server's own LAN address as local. Treating a request to the server's own address as local is intended: it comes from the server machine. Show in File Manager from the WebUI uses the same helper.
    - Mark cookies `Secure` when the original request was HTTPS, and never send `SameSite=None` without `Secure` (found by the repository audit: `SameSite=None` allowed without `Secure`).
    - Accept `https` origins for CORS and build LAN origins with the scheme clients actually use (found by the repository audit: CORS hard-coded to HTTP only).
    - Links the server builds (admin links, runtime config) use the proxied scheme and host.
  - Android PWA install, folded in from the backlog: found in the v0.12.0 manual regression pass on a Google Pixel 8 Pro, Add to Home Screen only creates a shortcut that opens in Chrome. Likely cause, not confirmed on a device: the WebUI registers its service worker only in a secure context, and a plain-HTTP LAN address is not one, so Chrome has no service worker and does not offer Install app. iOS installs from its home-screen meta tags without one. Over HTTPS through a proxy, Install app should open the WebUI standalone; check the manifest fields Chrome requires if it does not.
  - Add Release Specific checklist items: "Behind `tailscale serve` and one other HTTPS proxy, the WebUI and its admin pages connect, pair, browse, and play, and the server treats them as remote," and "On Android Chrome over HTTPS, Install app opens the WebUI standalone with its icon; iOS Add to Home Screen and desktop browser install still open standalone."
- **Acceptance criteria**:
  - Behind an HTTPS reverse proxy, the WebUI, its admin pages, the event stream, and media range requests work.
  - A request through a proxy on the server machine is not treated as localhost.
  - Cookies are `Secure` for HTTPS clients, and CORS accepts the HTTPS origin.
  - A request with no remote address is not treated as local.
  - Every localhost decision goes through one helper.
  - On Android Chrome over HTTPS, Install app opens the WebUI as a standalone app, and iOS and desktop browser installs still do.
  - The docs give working `tailscale serve` and general proxy setups.
- **Verification evidence**:
  - Completion evidence must include server tests for forwarded-header trust, proxied-localhost handling, missing remote address, the merged localhost helper, cookie flags, and HTTPS CORS origins, plus one quick spot check through `tailscale serve`. The proxy matrix and the Android and iOS install pass are the Release Specific checklist items above.

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
  - The admin section and the recovery page use admin account sessions and no longer accept the control token added in v0.14.0. Remove the control token, its setting, and its prompt, including the `adminAuthMode` field on `/control/settings` and in `core-settings.json`. v0.14.0 kept that field read-only (always `TokenRequired`, posted values ignored) so the contract changes only once.
  - No session or token is accepted as a query parameter. Found while adding the control token: `/api` routes still accept the API pairing token as a `token` query, and `GET /api/pair?token=` pairs with it, which puts the token in URLs and in the default request log. v0.14.0 stopped accepting the control token in a query and made `/control/pair` POST-only, but left `/api` for this cutover.
  - `GET` and `POST /api/web-runtime/settings` become admin-only. Found while adding the control token: the route is on the API plane, so any LAN caller with the API pairing token, which `/runtime-config.json` hands to every browser, can turn WebUI auth off, change the port or LAN binding, and read the shared token. The desktop called it from other machines, so v0.14.0 did not move it behind the control token; the desktop is gone by this release.
  - Admin-only operations (control plane, source and item management, catalog transfer, account administration, testing routes) reject user-level accounts. Testing routes use the same check as the rest of the control plane (found by the repository audit: `OperatorTestingService` mutations protected only by middleware policy).
  - Settings reads no longer return secrets (found by the repository audit: auth and secret fields in DTOs encourage credential leakage; `GET /control/settings` returns the admin token today).
  - Remove pairing and control-token flows from clients, docs, and contracts. Found by the repository audit, these go with them:
    - Two pairing secrets that drift apart: `/api/pair` checks `ServerRuntimeOptions.PairingToken`, while the Operator page, and later the admin section, saves `WebRuntimeSettings.SharedToken`, and `src/core/ReelRoulette.ServerApp/Program.cs` starts with `SharedToken ?? PairingToken` and passes that to a restarted server. Editing the shared token has no effect until a restart, then silently changes the pairing token.
    - `WebRuntimeSettings.AuthMode` is saved by `CoreSettingsService.UpdateWebRuntimeSettings` but `ServerPairingAuthMiddleware` reads only `RequireAuth`, so setting it to `Off` changes nothing.
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
  - The flow in the WebUI settings panel for admins and users.
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
  - The admin section is shown only to admins and localhost.
  - Messages for a user with no visible sources and for an item that becomes inaccessible.
  - Update docs and the testing checklist for per-user source visibility.
  - Add a Release Specific checklist item: "An admin and a user account in the WebUI on two devices see only their allowed sources, and a permission change in the admin section reaches both without a reload."
  - Not included: client requests for source access, approval workflows, and external sharing.
- **Acceptance criteria**:
  - The WebUI never shows denied sources or plays denied items.
  - Permission changes made in the admin section reach open WebUI sessions through events or requery.
  - Client filtering cannot widen what the server returns.
  - Users without admin rights do not see the admin section.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for hidden sources, inaccessible items, and the admin section's visibility.

### P31 - WebUI Grid Rendering

- **Status**: ⏳ Planned
- **Goal**: The WebUI library grid updates only the rows and tiles that change.
- **Scope**:
  - Planned for v0.15.0, last in the release; can be cut if the release runs long. Depends on: WebUI Responsive Layout and Panels, so it is built in the Preact library panel, which the side panel layout resizes often.
  - Found by the efficiency and divergence report from code reading, not measured: each change of visible rows replaces the rows' HTML, which recreates every tile image. Each patch and each appended page rebuilds the layout and virtualizer for every loaded item, so loading a window page by page costs time that grows with the square of its size.
  - Keep row elements that stay visible, add and remove only the rows that enter or leave, update a patched tile in place, and extend the layout for appended items instead of rebuilding it.
  - Grid layout, scrolling, focus, and tile behavior stay as they are.
- **Acceptance criteria**:
  - Scrolling keeps the image elements of rows that stay visible.
  - A favorite, blacklist, playback, or tag patch updates only the affected tile.
  - Appending a page does not lay out the already-loaded items again.
  - Layout results match the current layout for the same items and width.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for row reuse, tile patching, and append layout, before-and-after timings for rendering a large window in a browser, and `npm run verify`.

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

### P34 - WebUI In-App Dialogs

- **Status**: ⏳ Planned
- **Goal**: The WebUI asks for names and confirmations in its own dialogs, styled like the rest of the WebUI, instead of the browser's `prompt`, `confirm`, and `alert`.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Preact Migration, so the dialog is a Preact component the migrated screens use.
  - Found during the post-migration fixes desktop spot checks: preset rename in the WebUI opens the browser's native prompt, which does not match the WebUI's styling and does not suit the WebUI when it runs as an installed web app.
  - `app.js` uses native dialogs in nine places today: preset delete and rename; tag editor category rename, duplicate-name alert, and category delete; tag delete; two **Discard changes?** confirmations; and new category name.
  - One reusable in-app dialog for text input, confirmation, and notice, with keyboard support (Enter confirms, Escape cancels) and focus returning to where it was.
  - Keep each dialog's wording and outcome as it is today; only how it is shown changes. Changes to user-facing UX need explicit approval.
- **Acceptance criteria**:
  - The WebUI calls no `prompt`, `confirm`, or `alert`.
  - Each replaced dialog keeps its wording, and confirming or canceling does what it does today.
  - The dialogs match the WebUI's theme and work in an installed web app on desktop and mobile.
- **Verification evidence**:
  - Evidence placeholders maintained at planned state; completion evidence must include WebUI tests for confirm and cancel on the shared dialog, a check that no native dialog calls remain, `npm run verify`, and a spot check in an installed web app.

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

### P37 - WebUI Multi-Select and Remaining Desktop Features

- **Status**: ⏳ Planned
- **Goal**: The WebUI gains the remaining desktop features it lacks, and each candidate is built or explicitly declined.
- **Scope**:
  - Planned for v0.15.1. Depends on: Admin Source and Item Management, whose item removal route bulk removal uses, and WebUI Responsive Layout and Panels.
  - From the desktop-versus-web feature comparison and the desktop retirement report, checked against the code. Adding a feature changes user-facing UX and needs approval.
  - Multi-select and bulk actions: the desktop library grid selects several items (click, Ctrl+click, Shift+click) and acts on them from its context menu: add to or remove from favorites and the blacklist, add or remove tags, clear playback stats, and remove from library. The WebUI library plays one item per click and has no selection. How selection works on touch is decided here. Remove from library is an admin action.
  - Tag edits on several items: the desktop `ItemTagsDialog` adds and removes tags across all selected items at once; the WebUI tag editor works on the current item only.
  - Clear playback stats for the whole library, which the desktop offers from its Playback menu through `POST /api/playback/clear-stats` (measured: the WebUI never calls it). Whether it is an admin action is decided here.
  - Build or decline:
    - Keep Playing: the desktop plays a random item every N seconds until stopped.
    - Loudness normalization: the desktop adjusts volume from the server's per-item loudness and the library baseline. The WebUI could apply a gain through the Web Audio API; behavior on iOS is not verified.
    - The desktop's filter summary line, and whether the WebUI shows one.
    - FFmpeg log: the desktop's **Help → Show FFmpeg Logs** opens `FFmpegLogWindow`, which shows FFmpeg output buffered during a refresh and can clear it. Decide whether Admin Log Viewer takes it over.
  - Declined, because a browser cannot do them: always-on-top (the closest is picture-in-picture, which the WebUI turns off today with `disablepictureinpicture`), desktop self-update, and the desktop's Linux dependency dialog and application menu registration.
  - Already covered elsewhere, not part of this item: keyboard shortcuts, volume, and seek (WebUI Keyboard Shortcuts and Player Controls); stats (WebUI Stats Panel); refresh, backup, and duplicates (Admin Refresh, Backup, and Duplicate Review); Show in File Manager (Show in File Manager from the WebUI); sources and item removal (Admin Source and Item Management); catalog transfer (Admin Library Catalog Transfer); files the browser cannot play (Browser-Playable Filter).
- **Acceptance criteria**:
  - The WebUI selects several library items and applies favorite, blacklist, tag add and remove, clear stats, and, for admins, remove from library to all of them.
  - Tag edits apply across all selected items.
  - The whole library's playback stats can be cleared from the WebUI.
  - Each build-or-decline candidate is built or explicitly declined with a reason in this entry.
- **Verification evidence**:
  - Completion evidence must include WebUI tests for selection and each bulk action, and `npm run verify`.
  - Add a Release Specific checklist item: "In the WebUI on a desktop browser and a phone, select several items, apply each bulk action, and the tiles update."

### P38 - WebUI Preact Migration

- **Status**: ⏳ Planned
- **Goal**: The WebUI's screens are Preact components with tests, built on the existing typed modules, with no visible change.
- **Scope**:
  - Planned for v0.15.0.
  - Measured: `src/app.js` is 3,619 lines. `startApp` runs from line 180 to the end as one untyped function with 139 nested functions, and no test imports it. It has 16 `innerHTML` assignments and 9 native dialog calls. The 143 WebUI tests cover only the typed modules, and they run with `environment: "node"`, so there is no DOM to test screens against.
  - Add Preact and `happy-dom` for component tests; installing the packages needs approval when this milestone starts. Model tests keep running as they do.
  - Keep the typed modules (library query session, grid layout and virtualizer, tag save, filter state model, events, API) and call them from the components rather than rewriting them.
  - Migrate screen by screen. Each slice ships with no visible change and removes its code from `app.js`:
    - Foundation: the Preact root, one shared state store, connection, pairing, event stream, status line, and startup error. `renderStartupError` in `src/shell.ts` interpolates the error message into `innerHTML` (found by the repository audit, moved here from Client Robustness Findings); render it as text.
    - Player and overlay controls.
    - Library overlay.
    - Filter dialog.
    - Tag editor and Auto Tag.
  - Delete `app.js` after the last slice.
  - Trap, inferred, not measured: moving a `<video>` element to another place in the page can interrupt or reload playback. The player component owns one video element that is never moved.
- **Acceptance criteria**:
  - After each slice, the migrated screen looks and behaves as before, and the WebUI section of the testing checklist still passes.
  - Component tests for each migrated screen run in `npm run verify` under `happy-dom`.
  - `src/app.js` no longer exists.
  - No screen renders server or config text through `innerHTML`.
  - Playback continues uninterrupted while overlays open and close.
- **Verification evidence**:
  - Completion evidence must include component tests per slice, `npm run verify`, and one quick spot check per slice on a desktop browser and a phone.

### P39 - WebUI Responsive Layout and Panels

- **Status**: ⏳ Planned
- **Goal**: The WebUI layout adapts to the viewport: side panels on tablets and desktops keep the player playing in view while tagging, browsing, or viewing stats, and phones use overlays.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Preact Migration.
  - This changes user-facing UX: mockups for phone, tablet, and desktop widths are approved before code.
  - Measured today: the tag editor, filter, and library overlays are each `position: fixed; inset: 0` with `z-index: 1000`, so they cover the player while it keeps playing underneath. The stylesheet has two `@media (max-width: 600px)` rules, and mobile browsers are detected by user agent (`isMobileBrowser` in `app.js`).
  - A panel host: the player region plus a resizable side panel at tablet and desktop widths, and full-screen overlays at phone widths. Breakpoints use viewport width and pointer type, not the user agent.
  - The library, filter, and tag editor become panels. Later panels (settings, stats, admin, duplicate review) use the same host.
  - The top-bar controls (preset, randomization mode, photo duration) move into panels or the settings panel.
  - Panels stay inside the fullscreen stage, so they work in fullscreen as the overlays do today, including iOS pseudo-fullscreen.
  - Phone layouts work in an installed app (standalone display, safe-area insets).
  - Add a Release Specific checklist item: "On a phone, a tablet, and a desktop browser, and as an installed app on Android and iOS, panels open beside the player or as overlays by width, and playback keeps going while each is open."
- **Acceptance criteria**:
  - At tablet and desktop widths, the library, filter, and tag editor open beside the player, and the video stays visible and playing.
  - At phone widths, they open as full-screen overlays, and closing one returns to the player without interrupting playback.
  - Resizing the window across a breakpoint moves an open panel between side panel and overlay without losing its state.
  - Panels work in fullscreen.
  - The layout does not depend on the user agent.
- **Verification evidence**:
  - Completion evidence must include component tests for panel host breakpoints and panel state, `npm run verify`, and one quick spot check on a phone and a desktop browser.

### P40 - Admin Refresh, Backup, and Duplicate Review

- **Status**: ⏳ Planned
- **Goal**: The admin section starts a refresh, edits refresh and backup settings, and reviews and applies duplicates, so none of these needs the desktop.
- **Scope**:
  - Planned for v0.15.0. Depends on: Admin Section in WebUI Settings.
  - Measured: only the desktop calls `POST /api/refresh/start`, `/api/refresh/settings`, `/api/backup/settings`, `/api/duplicates/scan`, and `/api/duplicates/apply`. The routes exist, so this needs no contract change. The tray can also start a refresh.
  - Gated like the rest of the admin section.
  - Refresh slice: Refresh Now with the refresh status, and the refresh settings the desktop Settings dialog shows: auto-refresh and its interval, forced loudness and duration rescans on the next refresh, and fingerprint scan parallelism.
  - Backup slice: server backups on or off, the time between backups, the number kept, and the days of daily backups kept.
  - Daily retention, in the backup slice: on top of the existing count limit, catalog backup rotation keeps one backup per date for a number of days set in the server's backup settings. It applies to current- and older-version backups alike, so older-version backups, which rotation keeps and does not count today, age out with their dates. Newer-version backups and files rotation does not recognize are never touched. The days setting adds a field to the backup settings, a contract change that only adds.
  - Trap: the refresh and backup settings routes assign every field from the posted snapshot, so a partial post writes defaults (Server Robustness Findings). Until that is fixed, the admin section posts the full settings it read.
  - Duplicate review slice: scan the whole library or one source, show each group with thumbnails and the comparison details the desktop shows (file name, plays, tags, favorite, blacklisted), choose Keep All or a file to keep per group, default to Keep All or Select Best from a per-device preference, and confirm counts before deleting. It uses the panel layout.
  - Add a Release Specific checklist item: "From the admin section, start a refresh, change refresh and backup settings, and scan and apply duplicates with Keep All and with a chosen file, and the library updates."
- **Acceptance criteria**:
  - Refresh Now starts a refresh, and the status line shows its progress and result.
  - Refresh and backup settings load and save, and saving one field leaves the others as they were on the server.
  - With daily retention set to a number of days, rotation keeps the count limit's newest current-version backups plus the newest backup of each date in that window, current-version or older-version, and deletes older-version backups whose dates fall outside it.
  - Newer-version backups and unrecognized files in `backups/` are byte-identical after rotation, with daily retention on or off.
  - Duplicate apply deletes only the files not kept, after confirming counts, and Keep All deletes nothing in that group.
  - The duplicate default is a per-device preference.
- **Verification evidence**:
  - Completion evidence must include admin section UI tests for each slice, `npm run verify`, and one quick spot check of a refresh and a duplicate scan.

### P41 - WebUI Stats Panel

- **Status**: ⏳ Planned
- **Goal**: The WebUI shows library and playback statistics and details of the current file, as the desktop stats panel does.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Responsive Layout and Panels.
  - Measured: the WebUI never calls `GET /api/library/stats`, and its now-playing line shows only the file name and duration.
  - Library stats: total videos, photos, and media, favorites, blacklisted, total plays, unique media played, never played, videos with and without audio, and baseline loudness.
  - Current file: file name and full path, plays, last played (the time before this play, or Never), favorite, blacklisted, duration, has audio, loudness, adjustment, peak, and tags.
  - Refresh after events and actions is coalesced as the desktop does it: a short wait gathers a burst, one request is in flight at a time, and requests during it get one more.
  - No contract change.
  - Not included: playback history charts, which is Playback History and Analytics.
- **Acceptance criteria**:
  - The library stats match the library stats response.
  - The current file section updates on play, favorite, blacklist, tag, and playback events.
  - A burst of events causes one stats request, plus at most one more for events during it.
- **Verification evidence**:
  - Completion evidence must include component tests for both sections, coalescing tests, `npm run verify`, and one quick spot check.

### P42 - WebUI Keyboard Shortcuts and Player Controls

- **Status**: ⏳ Planned
- **Goal**: The WebUI has the desktop's keyboard shortcuts wherever a browser allows them, plus volume and seek-step controls.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Responsive Layout and Panels, and WebUI Settings Panel.
  - Measured: the WebUI handles only Escape, which closes overlays, and Enter or Space on a focused library tile. The desktop binds K play or pause, J and L seek, Left and Right previous and next, R random, F favorite, B blacklist, A autoplay, M mute, comma and period volume, T tags, P player view, S settings, O import folder, Q quit, F11 fullscreen, and 1 to 5 to show or hide parts of the window.
  - Use the desktop keys. Keys the browser keeps (Ctrl+Q, Ctrl+O, and F11 for the browser's own fullscreen; inferred) are not bound, and Q quit and O import folder have no WebUI equivalent. Number keys toggle panels; which panel each opens, and which key enters fullscreen, are decided here.
  - Shortcuts do nothing while focus is in a text field.
  - A shortcut reference in the settings panel.
  - A volume control where the browser lets a page set volume (not on iOS, where it is read-only; inferred), with comma and period stepping by a volume step preference.
  - J and L seek by a seek step preference in seconds. Frame stepping, which the desktop offers through LibVLC, is only approximate in a browser (inferred); build or decline it here.
  - Changes to user-facing UX need approval.
  - Add a Release Specific checklist item: "In Chrome, Firefox, and Safari on a desktop, every listed shortcut works in normal view, with a panel open, and in fullscreen, and does nothing while typing in a text field."
  - Not included: rebinding, which is Customizable Keyboard Shortcuts.
- **Acceptance criteria**:
  - Each bound shortcut does what the desktop's does.
  - Shortcuts are ignored while a text field has focus.
  - The volume control and seek step work and are saved per device.
  - The shortcut reference matches the bindings.
- **Verification evidence**:
  - Completion evidence must include keyboard tests per binding under `happy-dom`, `npm run verify`, and one quick spot check.

### P43 - Show in File Manager from the WebUI

- **Status**: ⏳ Planned
- **Goal**: A WebUI on the server machine opens the system file manager at the playing file, and elsewhere copies its path.
- **Scope**:
  - Planned for v0.15.0. Depends on: Reverse Proxy and HTTPS Access, and WebUI Preact Migration.
  - It uses the single localhost check that Reverse Proxy and HTTPS Access adds.
  - The desktop's `OpenFileLocation` opens Explorer with the file selected on Windows and opens the folder with `xdg-open` on Linux. A browser cannot do this itself; the server can when the browser runs on the server machine, and the tray already launches programs (`AvaloniaTrayHostUi.cs`).
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

### P44 - WebUI Status Line Overhaul

- **Status**: ⏳ Planned
- **Goal**: The WebUI status line shows one stable message per situation.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Responsive Layout and Panels, and Catalog Open and Backup Safety, whose 503 message the status line shows.
  - Can be cut from the release if it runs long; Testing Suite Overhaul is then cut with it.
  - Moved here from v0.14.0 when the desktop was frozen. The desktop half and the shared fixture are dropped, and the status line moves with the panel layout.
  - Observed in the v0.13.0 manual regression pass: with the server stopped, the WebUI shows "library load failed: HTTP 503" only briefly before "SSE reconnecting...". The desktop alternates between "core runtime unavailable" and "core runtime is required to browse the library", and stays as it is.
  - Define one precedence rule for which message wins when several apply, so the status line never alternates.
  - Define the message for each event once: server stopped, API unavailable, the server running without a library (showing the server's message, which says whether the library is from a newer version or damaged), version or capability mismatch, and refresh progress and results.
  - Add a Release Specific checklist item: "With the server stopped, unavailable, or mismatched, and during a refresh, the WebUI settles on one status message."
- **Acceptance criteria**:
  - With the server stopped, unavailable, or mismatched, the status line settles on one message and does not alternate.
  - With the server running without a library, the status line shows the server's message.
  - Refresh status reads the same during and after each refresh.
  - The precedence rule and the per-event messages are documented.
- **Verification evidence**:
  - Completion evidence must include WebUI tests of the precedence rule and the per-event messages, covering the server stopped, the API unavailable, a version or capability mismatch, and refresh progress and results, plus one quick spot check with the server stopped.

### P45 - Testing Suite Overhaul

- **Status**: ⏳ Planned
- **Goal**: The testing suite produces clear results that match the WebUI's connection and status handling.
- **Scope**:
  - Planned for v0.15.0. Depends on: WebUI Status Line Overhaul, Server Shutdown Fixes, and Admin Section in WebUI Settings.
  - The status line overhaul defines the messages these scenarios check, the shutdown fixes change how event streams close, and the suite runs from the admin section. Can be cut from the release if it runs long.
  - Moved here from v0.14.0 when the desktop was frozen; the desktop's expected messages are dropped.
  - The suite predates the current client connection and status handling and no longer produces clear results. Observed in the v0.13.0 manual regression pass: with the API unavailable, the WebUI shows "library load failed: HTTP 503" only briefly before settling on "SSE reconnecting...", and SSE disconnect behaves inconsistently and may need redesigning.
  - Redesign the scenarios against current WebUI behavior, define the expected WebUI message for each, and verify the WebUI's behavior as part of the suite.
  - Add a Release Specific checklist item: "Every testing suite scenario shows its expected WebUI message, and resetting it leaves the WebUI connected."
- **Acceptance criteria**:
  - Each scenario lists the expected WebUI message, and the WebUI shows it while the scenario is active.
  - SSE disconnect behaves the same way on every run.
  - Running and resetting each scenario leaves the WebUI connected and working.
- **Verification evidence**:
  - Completion evidence must include automated tests that each scenario sets and resets the server state it describes, and that SSE disconnect closes and reconnects the same way on repeated runs, plus one quick spot check of one scenario.

### P46 - Browser-Playable Filter

- **Status**: ⏳ Planned
- **Goal**: Browse and random play can be limited to files a browser can play, and a file the browser cannot play says so instead of "not found".
- **Scope**:
  - Planned for v0.15.1. Depends on: WebUI Preact Migration.
  - Accepted gap until playback sessions: browsers cannot play every format LibVLC plays on the desktop. Measured on the developer's catalog of 17,419 videos: 16,607 mp4, 533 mkv (3.1%), 225 avi, and 54 wmv. The codecs inside the files were not measured. Tested by the user: avi and wmv files from that library fail in the WebUI. mkv plays in Chrome and Firefox with common codecs but not in Safari or on iOS (inferred), and counts as browser-playable.
  - The server decides playability from one documented container profile, so browse, random play, and counts agree. The profile lists the playable video containers, starting with mp4, m4v, webm, and mkv; any other video container, including avi and wmv, is not browser-playable. Photos are always playable. Codec-level detection waits for the probe in Server Playback Decision Engine.
  - Contract slice: a browser-playable option in the filter state, applied by the server in the list query, its counts, and random selection. OpenAPI and generated WebUI types; it only adds a field.
  - WebUI slice: the option in the filter General tab and in presets, off by default so current behavior does not change. Turning it on by default needs approval.
  - Error message slice: when the browser cannot play a file, the WebUI says "Video file not found." (`video.onerror` in `app.js`, and "Photo file not found." for photos) whatever the cause, though the file exists (reported by the user). Say that the format is not supported in this browser when that is the cause, and "not found" only when the file is missing.
  - Trap, inferred: a browser reports a missing file (a `404` from `/api/media`) and an unsupported format with the same `MEDIA_ERR_SRC_NOT_SUPPORTED` code, so the error code alone cannot tell them apart. Use the item's container against the profile, or ask the server whether the file exists.
  - Trap, inferred from how presets are saved: until Per-Preset Preset Writes, the desktop posts the whole preset list, and the frozen desktop does not know the new field, so a desktop preset save drops the option from every preset. Decide here whether the server keeps a stored option the desktop did not send, or documents the loss.
  - Preset equality is locked to `preset-filter-equality.json`, which the desktop tests also read. New cases for the option must pass there too, or go in a WebUI-only fixture until the desktop is removed.
  - Add a Release Specific checklist item: "With the browser-playable filter on, browse and random play show no avi or wmv files; with it off, playing one says its format is not supported in this browser, and a deleted file says not found."
- **Acceptance criteria**:
  - With the option on, the list query, its counts, and random selection exclude videos outside the profile; with it off, results are unchanged.
  - The option is saved in presets and compared in preset matching.
  - A file the browser cannot play shows a format-not-supported message, and a missing file shows not found.
  - The profile is documented in `docs/api.md`.
- **Verification evidence**:
  - Completion evidence must include server tests for the option in the list query, counts, and random selection, contract tests, WebUI tests for the option and both error messages, `dotnet test ReelRoulette.sln`, and `npm run verify`.

### P47 - Desktop Retirement Notice

- **Status**: ⏳ Planned
- **Goal**: The last desktop build tells users the desktop app is retired and points them to the WebUI.
- **Scope**:
  - Planned for v0.15.1, last in the release. Can be cut if the release runs long. The only desktop change outside bug fixes.
  - After Desktop Client Removal no desktop update is published, so installed desktops stay on their last version (inferred: the Velopack desktop feed stops getting releases). Later servers stop working with it, starting with the accounts release, which removes pairing.
  - On start, show a notice once per installed version: the desktop app is retired; use the WebUI. It offers the existing Open Web UI action. The wording needs approval.
  - Add a Release Specific checklist item: "After updating, the desktop shows the retirement notice once, and Open Web UI opens the WebUI."
- **Acceptance criteria**:
  - The notice appears on the first start of this version and not again after it is dismissed.
  - Open Web UI from the notice opens the WebUI in the browser.
- **Verification evidence**:
  - Completion evidence must include a headless desktop test that the notice shows once per version, `dotnet test ReelRoulette.sln`, and one quick spot check.

### P48 - Desktop Client Removal

- **Status**: ⏳ Planned
- **Goal**: The desktop client, its packaging, and its tests are gone, and the WebUI is the only client.
- **Scope**:
  - First milestone of the desktop removal release, planned for v0.16.0. Depends on: WebUI Keyboard Shortcuts and Player Controls, WebUI Stats Panel, WebUI Settings Panel, Admin Refresh, Backup, and Duplicate Review, Show in File Manager from the WebUI, Admin Source and Item Management, Admin Library Catalog Transfer, WebUI Multi-Select and Remaining Desktop Features, and Browser-Playable Filter.
  - Code and tests slice, measured: remove `ReelRoulette.DesktopApp`, `ReelRoulette.LibraryArchive`, and `ReelRoulette.DesktopApp.Tests` from the solution and the repository, about 30,300 lines of C# and AXAML including 3,267 test lines and 134 tests. Remove Core's `LibraryGridLayout` and its tests, which only the desktop uses, and `JsonFileStorageService` and `CoreStorageServices` if nothing else uses them.
  - Packaging slice: remove the `desktop` component from the `release.yml` matrix, including the Windows LibVLC relocation step, stop publishing the desktop update feed, and remove the desktop references in `set-release-version.ps1` and `verify-linux-packaged-server-smoke.sh`. CI has no desktop job: desktop tests run inside the solution test on the Ubuntu and Windows jobs, so `ci.yml` needs no change.
  - Contract slice: remove routes and fields that no remaining caller uses, each checked against the WebUI and the admin section. Candidates: `/api/library-states`, `/api/library/item`, `/api/library/catalog-checkpoint` if Admin Library Catalog Transfer replaced it, and the full path kept in the random and play responses' `id` for the desktop. OpenAPI and generated WebUI types.
  - Fixture slice: `event-revision.json`, `library-tile-effect.json`, `preset-filter-equality.json`, and `sort-direction-labels.json` lose their C# readers and stay as WebUI test data. `tag-name-order.json` stays, read by Core and the WebUI.
  - Docs slice: `CONTEXT.md`, `docs/architecture.md`, `docs/domain-inventory.md`, `docs/api.md`, `docs/dev-setup.md`, `README.md` (desktop install and the LibVLC prerequisite), the testing checklist's Desktop and Cross-Client sections and desktop Packaging items, and `AGENTS.md`: remove the desktop freeze rule and the desktop test-isolation note, and keep the shared-fixture rule for rules implemented in server C# and the WebUI.
  - Add a Release Specific checklist item: "On Linux and Windows, the release publishes only the server, every former desktop workflow works in the WebUI, and an existing desktop install keeps its last version."
  - Not included: rewriting historical `CHANGELOG.md` sections and completed milestones, which keep their desktop references.
- **Acceptance criteria**:
  - The solution has no desktop projects, and `dotnet build ReelRoulette.sln`, `dotnet test ReelRoulette.sln`, and `npm run verify` pass.
  - A release builds and publishes only server packages and feeds.
  - OpenAPI has no route or field that only the desktop used.
  - No current-state doc describes the desktop client as current.
  - The four former desktop fixtures are read by WebUI tests.
- **Verification evidence**:
  - Completion evidence must include the build, test, and verify runs, `./tools/scripts/verify-linux-packaged-server-smoke.sh`, a dev-channel release run of `release.yml`, and a search of current-state docs for the desktop client.
