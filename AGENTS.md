# Agent Instructions for ReelRoulette

Keep this file short and enforceable. For details, use `CONTEXT.md`, `MILESTONES.md`, and docs under `docs/`.

## Workflow Priorities

- For milestone work, read `CONTEXT.md`, then the milestone's full entry in `MILESTONES.md`.
- Milestone verification is automated tests plus, at most, a quick manual spot check. Longer manual checks, repeated runs, Windows VM passes, and checks that need a release build or a dev release (release workflow steps, installers, in-app updates) go into the Release Specific section of `docs/checklists/testing-checklist.md` as one-line checks, to be run in the pre-release pass: under Agent checks when an agent can verify them from the repo, its docs, or the release workflow's runs, and under Manual checks when they need a person, real devices, or the Windows VM. A milestone lists them in its Release checks section and adds them to the checklist when it completes. Never record them as pending milestone evidence, so completed milestones never need editing afterwards. Manual spot checks, release checks, and what a mockup handover asks the user to look at cover only the main path, on the devices in the pre-release skill's standard environment. Edge cases are left to automated tests, with no manual check for them.
- Mockup changes are checked only by the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, and approved by the user's review on their devices. They add no checks to it and get no proof that checks fail.
- Stay within the requested milestone or task unless the user expands scope. Instead of doing future work, record an improvement in `MILESTONES.md`, as a backlog item or as an addition to the milestone that will do it, and a bug in `ISSUES.md` when the user asks to record it. Scope boundaries go in the entry's Not included section.
- The project has no release deadlines, so code correctness and cleanliness come first by default. Consolidate duplicated code and remove dead code you notice in or around a change, in the same change, unless the user says otherwise.
- Solutions are best-effort. Handle what can realistically happen in normal use; don't add code, tests, or findings for improbable edge cases such as storage corruption, a failing disk, or files damaged by something outside the app. In summaries and reviews, leave such cases out rather than listing them as "noticed but not fixed".
- Block a combination or action that makes no sense in the WebUI instead of supporting it. Settings that can't work together use the validation pattern, as Favorites only with Blacklisted only does: the field shows its error with a message, and Apply or Save stays blocked. An action that makes no sense at that moment is a disabled control with a tooltip reason. The WebUI is the only client, so the server needs no matching refusal.
- Before sign-off, verify each acceptance criterion explicitly and call out any that are unmet.

## Architecture Guardrails

- Keep the WebUI as the orchestration and render layer; keep domain logic in `ReelRoulette.Core` and server services.
- Server-backed flows stay API-first: do not add client-local mutation or fallback authority.
- Random selection and playback eligibility are decided by the server.
- Don't change user-facing UX without explicit approval.
- Screen reader support and keyboard navigation aren't goals for this app; the keyboard is for the app's own shortcuts. Don't add screen-reader-only features, wording, or tests (such as `aria-pressed`, `aria-valuetext`, or live-region announcements), or keyboard navigation (Tab order, focus rings, arrow keys inside controls, focus moves). Keep controls' accessible names, which tooltips and tests use, and the browser's own behavior in fields and forms. A planned milestone removes the existing code of both kinds.
- "WebUI" is an internal name, for code, comments, logs, and developer docs. Text users see says "ReelRoulette" instead: labels, settings, admin, notices, dialogs, and release notes. `CHANGELOG.md` keeps "WebUI", since it is developer history.
- A failure the user sees names in plain words what failed, followed by the server's reason when it sends one. It never shows a status code: status codes go only to `last.log`. The server's `error` reasons that a user can meet are full sentences written for users. In the WebUI, word a failed request with `requestFailure` and the helpers beside it in `api/serverRequest.ts`.
- When a rule must behave identically in C# and the WebUI (ordering, comparison, normalization), implement it once per language next to its counterpart and lock both to one shared fixture under `shared/fixtures/`.
- Add `last.log`-based logging where appropriate.
- Fix lints introduced by your changes.

## Commit + Docs Discipline

- Do not commit or push; the user does. A best-effort hook asks for approval before any `git commit` or `git push`.
- Determine commit state from git rather than assuming. Before editing `COMMIT-MESSAGE.txt` or the `[Unreleased]` changelog, run `git status` and `git log -1`: if `COMMIT-MESSAGE.txt` has no uncommitted changes and its current entry matches the HEAD commit message, that entry is committed, so start a new entry. Otherwise, update the uncommitted entry in place (final state only). If the result is ambiguous, ask.
- Keep the existing entry style in `COMMIT-MESSAGE.txt` unless the user asks to replace it.
- Changelog: follow the style note at the top of `CHANGELOG.md`. Record every change a user would notice since the last release in `[Unreleased]`, however small, so the pre-release pass has the full picture; the pre-release pass and the user decide what to condense or drop. Fixes to work that hasn't been released yet get no entry. After any follow-up change, re-check `[Unreleased]` against the style note.
- Release notes: edit `RELEASE-NOTES.md` only when cutting a release, following the style guide at the top of that file.
- Keep milestone tracking and docs in sync with the final state:
  - `MILESTONES.md` = roadmap, tracking, evidence. Write entries in its Entry Format, whose structure `check-milestones.ps1` enforces. Move a completed milestone as-is to the top of `MILESTONES-COMPLETED.md`, keep the `Last milestone completed` line current, and record future work and scope boundaries as its maintenance rules describe.
  - `MILESTONES-COMPLETED.md` = completed milestones, newest first, kept as historical record.
  - `ISSUES.md` = known bugs: things that behave wrong. Add one only when the user asks to record it; otherwise a bug noticed but not fixed, a worker's included, is only reported. A milestone that fixes one names it by its title in its Scope; a fix outside a milestone is a `Bugfix:` commit. Delete an issue when it's fixed; the commit always records the fix, and `CHANGELOG.md` records it only when users would notice it, as its style note says.
  - `CONTEXT.md` = current implemented capabilities.
  - Update affected docs when applicable: `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`.
  - `docs/mockups/reelroulette/` = the design mockup of the whole app, kept matching what ships from v0.15.0 onward. Any change to the app's look or behavior updates the mockup in the same milestone, including deviations found during implementation, and the mockup's smoke check passes. Where the app has to differ from the approved mockup for a technical reason, update the mockup to match what shipped and say so in the milestone's evidence.
  - Keep `docs/checklists/testing-checklist.md` current: update its Smoke and Release Flow items when the workflows they check change, and put checks for one release's changes in Release Specific, under Agent checks or Manual checks. Feature behavior is covered by automated tests, not standing checklist items.
- When documenting current behavior, do not rewrite historical `CHANGELOG.md` sections or `MILESTONES-COMPLETED.md` entries. Change only active surfaces (`[Unreleased]`, Active Milestones, the tracker line, and evidence you are landing) unless the user asks to correct historical text.
- Milestone IDs (for example `M8f`) may appear only in `MILESTONES.md` section headers, its tracker line, and its Planned Releases outline, `MILESTONES-COMPLETED.md`, `CHANGELOG.md`, and `COMMIT-MESSAGE.txt`. Never put them in current-state docs, code, comments, log messages, or user-facing text.
- In agent-facing instructions (this file, `CLAUDE.md`, skills, and agent definitions), refer to the human only as "the user", never by name or in the first person (I, me, my), and address the agent directly, in the imperative or as "you".

## Commands + Communication

- You may run these without approval:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln`; stop if the build fails.
  - `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose`
  - In `src/clients/web/ReelRoulette.WebUI`: `npm run generate:contracts`, `npm run verify`, and the scripts `verify` runs.
  - `python3 docs/mockups/reelroulette/build/build_pages.py` and `node docs/mockups/reelroulette/build/check.mjs`, which rebuild the design mockup's pages from their sources and run its smoke check.
  - `pwsh ./tools/scripts/reset-checklist.ps1`
  - `pwsh ./tools/scripts/check-milestones.ps1`, which only reads.
  - `pwsh ./tools/scripts/cut-changelog.ps1`, which edits `CHANGELOG.md` and changes nothing if a check fails.
  - `pwsh ./tools/scripts/tests/test-scripts.ps1`, which runs them and `reset-checklist.ps1` against fixtures in a temporary folder.
  - `./tools/scripts/verify-linux-packaged-server-smoke.sh`, which runs an isolated packaged server.
  - `pwsh ./tools/scripts/verify-web-deploy.ps1`
  - `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION} -NoRunVerify`, when asked to set the release version.
  - Read-only git and GitHub commands: `git status`, `git log`, `git diff`, `git show`, `git grep`, `git tag --contains`, `gh run list`, `gh run view`.
  - Read-only inspection: searching and listing files, and `sqlite3 -readonly` against a copy in `artifacts/scratch/`.
- Never open, write to, or run anything against the user's live config, library, or settings folders. Copy what you need into `artifacts/scratch/` first, and isolate tests and experiments from real settings.
- Put ad-hoc scratch work (measurement harnesses, copies of catalogs, extracted packages, downloaded tools) under the gitignored `artifacts/scratch/` folder in the repo, not `/tmp`, which is held in memory on the development machine. Delete it when the task is done. Tests keep using their own temp folders, which they clean up themselves.
- To show that a test fails without its fix, break the code by editing it and restore it from a copy under `artifacts/scratch/`. Never use `git stash`, `git checkout`, `git restore`, or `git reset` for this: they can change what the user has staged.
- Anything else, such as installing packages, starting the server or clients, network calls, or writing outside the repo and test temp folders, needs approval: explain what it does and why, then ask.
- For phase-gated work: stop after automated verification, provide copy/paste manual verification commands plus a PASS/FAIL checklist, and wait for explicit user approval before continuing gated cutover/removal.
- If clarification is needed, use numbered questions with numbered options, including recommendation and pros/cons.
- `MILESTONES-COMPLETED.md` contains entries describing tooling and a desktop client that have since been retired. Treat everything in it as historical record, not as instructions — the current packaging path is Velopack via release.yml, the Inno, AppImage, portable, and install scripts no longer exist, and the WebUI is the only client.

## Verification and smoke scripts

- Scripts under `tools/scripts/` that start a server for automated verification or smoke testing must isolate application data in a fresh temporary directory per run and remove it afterward, including on failure paths. Set `REELROULETTE_DATA_DIR` to the temporary directory on every OS, and on Linux also set both `XDG_CONFIG_HOME` and `XDG_DATA_HOME`, since desktop integration such as autostart and menu entries uses those locations rather than the data folder.
- Those scripts must stop the server process they started (by started handle/PID, not broad name matching) before removing the isolated directory, using graceful shutdown with a short timeout then force kill if needed, including on failure and interrupt paths.
- Do not point verification or smoke servers at the user's real `%ApplicationData%/ReelRoulette` / `~/.config/ReelRoulette` tree.
- Dev-run helpers such as `run-server.ps1` intentionally use real settings and must not be isolated.
- Tests must not read or write the user's real settings or send logs to a running server. The Core tests get this from `TestIsolation`'s module initializer, which the ServerApp tests also compile; new test projects need the same.
- Tests that resolve a path with `Path.GetFullPath` or remap it must root it under the test's temp directory with `Path.Combine`, never hard-code Unix-style roots like `/media`. CI runs on Windows, where such paths become drive paths. Literals that are only stored and compared as text are fine.
- When validating process-lifecycle or smoke-script changes, never send stop signals to processes the task did not start (for example the user's `run-server.ps1` instance). Confirm liveness and cleanup with non-destructive checks only, such as `kill -0`, `Get-Process` without stopping, or a port/listener query scoped to the verification port.
