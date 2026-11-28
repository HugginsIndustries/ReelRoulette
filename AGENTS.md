# Agent Instructions for ReelRoulette

Keep this file short and enforceable. For details, use `CONTEXT.md`, `MILESTONES.md`, and docs under `docs/`.

## Workflow Priorities

- For milestone work, read `CONTEXT.md`, then the milestone's full entry in `MILESTONES.md`.
- Milestone verification is automated tests plus, at most, a quick manual spot check. Longer manual checks, repeated runs, Windows VM passes, and checks that need a release build or a dev release (release workflow steps, installers, in-app updates) go into the Release Specific section of `docs/checklists/testing-checklist.md` as one-line checks, to be run in the pre-release pass: under Agent checks when an agent can verify them from the repo, its docs, or the release workflow's runs, and under Manual checks when they need a person, real devices, or the Windows VM. A milestone lists them in its Release checks section and adds them to the checklist when it completes. Never record them as pending milestone evidence, so completed milestones never need editing afterwards. Manual spot checks, release checks, and what a mockup handover asks the user to look at cover only the main path, on the devices in the pre-release skill's standard environment. Edge cases are left to automated tests, with no manual check for them.
- Mockup changes are checked only by the mockup's smoke check, `node docs/mockups/reelroulette/build/check.mjs`, and approved by the user's review on their devices. They add no checks to it and get no proof that checks fail.
- WebUI tests check behavior: what a control does, what shows in each state, which items a menu or list offers, defaults, what's kept across reloads, and geometry that could break unseen, such as a control overlapping another or clipped. They don't check where things sit, in what order, or how they look, unless the look shows a state, such as orange while on or red when flagged: the mockup and the user's review on devices cover those, and no test snapshots markup. An order is behavior only when the app decides it, such as a sort, an order the user chose, or the order requests go out in. Find elements by name, title, or text, not by position.
- Stay within the requested milestone or task unless the user expands scope. Instead of doing future work, record an improvement in `MILESTONES.md`, as a backlog item or as an addition to the milestone that will do it, and a bug in `ISSUES.md` when the user asks to record it. Scope boundaries go in the entry's Not included section.
- The project has no release deadlines, so code correctness and cleanliness come first by default. Consolidate duplicated code and remove dead code you notice in or around a change, in the same change, unless the user says otherwise.
- Solutions are best-effort. Handle what can realistically happen in normal use; don't add code, tests, or findings for improbable edge cases such as storage corruption, a failing disk, or files damaged by something outside the app. In summaries and reviews, leave such cases out rather than listing them as "noticed but not fixed".
- Block a nonsense combination or sequence in the WebUI instead of supporting it, so neither the WebUI nor the server spends code on cases no one needs, such as renaming a tag in the same unsaved change that adds it. Settings that can't work together use the validation pattern, as Favorites only with Blacklisted only does: the field shows its error with a message, and Apply or Save stays blocked. An action that makes no sense at that moment is a disabled control with a tooltip reason, so the user sees why. The WebUI is the only client, so the server needs no matching refusal. The rule is for such edge cases: where normal app behavior is clearer, such as a menu showing only the items that apply, follow that.
- Before sign-off, verify each acceptance criterion explicitly and call out any that are unmet.

## Architecture Guardrails

- Keep the WebUI as the orchestration and render layer; keep domain logic in `ReelRoulette.Core` and server services.
- Server-backed flows stay API-first: do not add client-local mutation or fallback authority.
- Random selection and playback eligibility are decided by the server.
- Don't change user-facing UX without explicit approval.
- Screen reader support and keyboard navigation aren't goals for this app; the keyboard is for the app's own shortcuts. Don't add screen-reader-only features, wording, or tests (such as `aria-pressed`, `aria-valuetext`, or live-region announcements), or keyboard navigation (Tab order, focus rings, arrow keys inside controls, focus moves). Keep controls' accessible names, which tooltips and tests use, and the browser's own behavior in fields and forms.
- "WebUI" is an internal name, for code, comments, logs, and developer docs. Text users see says "ReelRoulette" instead: labels, settings, admin, notices, dialogs, and release notes. `CHANGELOG.md` keeps "WebUI", since it is developer history.
- Times the user sees use 24-hour time, never AM/PM, and dates shown as values use ISO format, YYYY-MM-DD, or MM-DD where the year isn't shown. Dates worded into a summary on purpose keep their wording.
- A failure the user sees names in plain words what failed, followed by the server's reason when it sends one. It never shows a status code: status codes go only to `last.log`. The server's `error` reasons that a user can meet are full sentences written for users. In the WebUI, word a failed request with `requestFailure` and the helpers beside it in `api/serverRequest.ts`.
- When a rule must behave identically in C# and the WebUI (ordering, comparison, normalization), implement it once per language next to its counterpart and lock both to one shared fixture under `shared/fixtures/`.
- Add `last.log`-based logging where appropriate.
- Fix lints introduced by your changes.

## Commit + Docs Discipline

- Commit only on your own `claude/` branch, once the user or the advisor says the work is ready, as the Worktrees section describes. Never merge into main or push; only the advisor commits to main, by squash-merging a finished branch, and only the advisor pushes main. A best-effort hook catches only `git commit` and `git push`: it lets a commit on the session's own `claude/` branch through and asks for approval before any other `git commit` and any `git push`. Other commands that make commits, such as `git merge` without `--no-commit`, `git cherry-pick`, `git revert`, and `git rebase`, get no question from it.
- `COMMIT-MESSAGE.txt` is untracked: it is your worktree's draft of the message the advisor commits your branch's squash merge with, describing the branch's final state as one change. A new worktree has none: start it from your branch's newest commit of its own, `git log -1 --format=%B main..HEAD`, if there is one, and otherwise write a new one. After that, update it in place (final state only). `git diff main...HEAD -- CHANGELOG.md` shows what your branch already added to `[Unreleased]`; update those bullets in place rather than adding new ones.
- Write the draft by `docs/commit-messages.md`, and keep its style unless the user asks to replace it.
- Changelog: follow the style note at the top of `CHANGELOG.md`. Record every change a user would notice since the last release in `[Unreleased]`, however small, so the pre-release pass has the full picture; the pre-release pass and the user decide what to condense or drop. Fixes to work that hasn't been released yet get no entry. After any follow-up change, re-check `[Unreleased]` against the style note.
- Release notes: edit `RELEASE-NOTES.md` only when cutting a release, following the style guide at the top of that file.
- Keep milestone tracking and docs in sync with the final state:
  - `MILESTONES.md` = roadmap, tracking, evidence. Write entries in its Entry Format, whose structure `check-milestones.ps1` enforces. When your branch completes a milestone, mark it ✅ Complete with its evidence and leave it in Active Milestones: after the merge and the user's spot check on main, the advisor records the check's result, moves the entry as-is to the top of `MILESTONES-COMPLETED.md`, and updates the `Last milestone completed` line. Record future work and scope boundaries as its maintenance rules describe.
  - `MILESTONES-COMPLETED.md` = completed milestones, newest first, kept as historical record.
  - `ISSUES.md` = known bugs: things that behave wrong. Add one only when the user asks to record it; otherwise a bug noticed but not fixed, a worker's included, is only reported. A milestone that fixes one names it by its title in its Scope; a fix outside a milestone is a `Bugfix:` commit. Delete an issue when it's fixed; the commit always records the fix, and `CHANGELOG.md` records it only when users would notice it, as its style note says.
  - `CONTEXT.md` = current implemented capabilities.
  - Update affected docs when applicable: `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`.
  - `docs/mockups/reelroulette/` = the design mockup of the whole app, kept matching what ships from v0.15.0 onward. Any change to the app's look or behavior updates the mockup in the same milestone, including deviations found during implementation, and the mockup's smoke check passes. Where the app has to differ from the approved mockup for a technical reason, update the mockup to match what shipped and say so in the milestone's evidence.
  - Keep `docs/checklists/testing-checklist.md` current: update its Smoke and Release Flow items when the workflows they check change, and put checks for one release's changes in Release Specific, under Agent checks or Manual checks. Feature behavior is covered by automated tests, not standing checklist items.
- Write current-state docs (`CONTEXT.md`, `README.md`, and the docs under `docs/`) as short bullets, one behavior each, grouped with sub-bullets, and split a bullet that grows past a few sentences. Don't hard-wrap: each sentence and paragraph stays on one line. `MILESTONES.md` keeps its own one-fact-per-bullet rule, and `CHANGELOG.md` its style note.
- When documenting current behavior, do not rewrite historical `CHANGELOG.md` sections or `MILESTONES-COMPLETED.md` entries. Change only active surfaces (`[Unreleased]`, Active Milestones, the tracker line, and evidence you are landing) unless the user asks to correct historical text.
- Milestone IDs (for example `M8f`) may appear only in `MILESTONES.md` section headers, its tracker line, and its Planned Releases outline, `MILESTONES-COMPLETED.md`, `CHANGELOG.md`, and commit messages, including the `COMMIT-MESSAGE.txt` draft and the examples in `docs/commit-messages.md`. Never put them in current-state docs, code, comments, log messages, or user-facing text.
- In agent-facing instructions (this file, `CLAUDE.md`, skills, and agent definitions), refer to the human only as "the user", never by name or in the first person (I, me, my), and address the agent directly, in the imperative or as "you".

## Worktrees

- Each session works in its own git worktree under `.claude/worktrees/`, on a `claude/` branch the advisor cut from local main. Change repo files only in your own worktree. The main checkout only receives the advisor's squash merges and the small docs edits the user asks the advisor to make there.
- When a session starts in a new worktree, a hook copies the WebUI's `node_modules` from the main checkout. If it says it couldn't, ask the user before running `npm ci` in `src/clients/web/ReelRoulette.WebUI`.
- Other sessions' work reaches your branch only when you merge main.
- When the user or the advisor says the work is ready, `git add` your changes and commit them with `git commit -F COMMIT-MESSAGE.txt`. Every commit on the branch, a merge from main included, uses the draft this way, so the newest one carries it.
- Commit in a command of its own, run from your worktree's root, with no `cd` or `git -C` in it; if you've moved to another folder, `cd` back in an earlier command. The commit hook asks about any commit that changes folder or points git at another folder.
- When the user or the advisor says main has moved, update from it once your work is committed; if it isn't, say so and wait. Run `git merge --no-commit main` and resolve any conflicts by the rules below. If the merge changed the WebUI's `package-lock.json`, ask the user before running `npm ci` there. Check that `git grep -n -E '^(<<<<<<<|>>>>>>>)'` finds no leftover markers, update the draft if the merge changed what it describes, and re-run your change's checks. Then `git add` the resolved and regenerated files and commit with `git commit -F COMMIT-MESSAGE.txt`.
- Resolving conflicts:
  - `CHANGELOG.md` `[Unreleased]`: keep both sides, main's bullets first. Combine a bullet both sides changed, then re-check the style note.
  - `MILESTONES.md`: take main's file and reapply your changes. If main added a P number your branch also added, renumber yours to the next unused one everywhere it appears.
  - `docs/checklists/testing-checklist.md` and `ISSUES.md`: keep both sides.
  - Generated files: resolve their sources, then regenerate. After `shared/api/openapi.yaml`, run `npm run generate:contracts`. For the mockup's built pages, resolve their sources under `docs/mockups/reelroulette/build/` and run `build_pages.py`.
  - Anything else: keep what both sides meant, and ask the user when that isn't clear.
- A squash-merged branch is finished: commit nothing more to it. The next change starts in a fresh session on a fresh branch.
- The advisor reviews a finished branch with `reviewer` subagents, through review-branch's lenses. The session that built the branch applies the fixes the user chooses, with the review-fix skill, on that same branch.
- The user reviews a mockup branch on their devices before it merges, by serving that worktree's `docs/mockups/reelroulette/` on port 8000, always the same port, one mockup at a time. Give the review command as `python3 -m http.server 8000 --bind 0.0.0.0 --directory <worktree>/docs/mockups/reelroulette`.
- Never run `run-server.ps1` from a worktree. It runs against the user's real data, and a branch that changes the catalog's schema would upgrade their library so main's server refuses it. Manual spot checks on devices happen on main after the squash merge, before the advisor pushes main.

## Commands + Communication

- You may run these without approval:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln`; stop if the build fails.
  - `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose`
  - In `src/clients/web/ReelRoulette.WebUI`: `npm run generate:contracts`, `npm run verify`, and the scripts `verify` runs.
  - `python3 docs/mockups/reelroulette/build/build_pages.py` and `node docs/mockups/reelroulette/build/check.mjs`, which rebuild the design mockup's pages from their sources and run its smoke check.
  - `pwsh ./tools/scripts/reset-checklist.ps1`
  - `pwsh ./tools/scripts/check-milestones.ps1`, which only reads.
  - `pwsh ./tools/scripts/cut-changelog.ps1`, which edits `CHANGELOG.md` and changes nothing if a check fails.
  - `pwsh ./tools/scripts/tests/test-scripts.ps1`, which runs them and `reset-checklist.ps1` against fixtures, and checks `webui-packages.ps1`'s install decision, in a temporary folder.
  - `./tools/scripts/verify-linux-packaged-server-smoke.sh`, which runs an isolated packaged server.
  - `pwsh ./tools/scripts/verify-web-deploy.ps1`. It runs `npm ci` first when the WebUI's packages are missing or older than `package-lock.json`, as after the setup hook couldn't copy them or a merge changed `package-lock.json`; then ask the user before running it.
  - `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION} -NoRunVerify`, when asked to set the release version.
  - Read-only git and GitHub commands: `git status`, `git log`, `git diff`, `git show`, `git grep`, `git merge-base`, `git worktree list`, `git tag --contains`, `gh run list`, `gh run view`.
  - `git add`, `git commit`, and `git merge --no-commit main`, only as the Worktrees section says. The hook asks before a `git commit` that isn't on your own `claude/` branch and before any `git push`.
  - Read-only inspection: searching and listing files, and `sqlite3 -readonly` against a copy in `artifacts/scratch/`.
  - Reading and writing the shared side-session notes folder that the Claude app names when it starts a session. It belongs to the Claude app, not to ReelRoulette's settings, so the next rule about the user's live config doesn't cover it.
- Never open, write to, or run anything against the user's live config, library, or settings folders. Copy what you need into `artifacts/scratch/` first, and isolate tests and experiments from real settings.
- Put ad-hoc scratch work (measurement harnesses, copies of catalogs, extracted packages, downloaded tools) under the gitignored `artifacts/scratch/` folder in the repo, not `/tmp`, which is held in memory on the development machine. Delete it when the task is done. Tests keep using their own temp folders, which they clean up themselves.
- To show that a test fails without its fix, break the code by editing it and restore it from a copy under `artifacts/scratch/`. Never use `git stash`, `git checkout`, `git restore`, or `git reset` for this: the stash is shared by every worktree, and the others can throw away uncommitted work.
- Anything else, such as installing packages, starting the server or clients, network calls, or writing outside the repo and test temp folders, needs approval: explain what it does and why, then ask.
- Run a headless browser only with the user's approval for that run, with a throwaway profile under `artifacts/scratch/`, and with networking cut off at the system level, for example with `unshare -rn`. A browser's own offline settings aren't enough: they still let it reach the network.
- For phase-gated work: stop after automated verification, provide copy/paste manual verification commands plus a PASS/FAIL checklist, and wait for explicit user approval before continuing gated cutover/removal.
- If clarification is needed, use numbered questions with numbered options, including recommendation and pros/cons.
- End your turn only when your work is done or when it waits on the user: every turn's end notifies the user and the advisor. While a long command runs (a build, the tests, `npm run verify`, a script), keep your turn and wait for it, in the foreground with a long timeout (the shell tool allows up to 10 minutes) or started in the background and waited on by its PID. Run a subagent whose result you need next in the foreground where the tool lets you choose. Never end a turn just to be woken when a command or subagent finishes.
- Wait on a process you started by its PID (`wait <pid>`, or `tail --pid=<pid> -f /dev/null`), always inside `timeout`, never with a loop like `while pgrep -f …`: `pgrep -f` matches the loop's own command line, so the loop never ends.
- If every `pwsh` run crashes at start with "Stack overflow", pwsh's shared startup cache is corrupt, which can happen when two `pwsh` runs end at the same moment. Ask the user to approve `rm ~/.cache/powershell/StartupProfileData-NonInteractive`; pwsh rebuilds the file at its next start.
- `MILESTONES-COMPLETED.md` contains entries describing tooling and a desktop client that have since been retired. Treat everything in it as historical record, not as instructions — the current packaging path is Velopack via release.yml, the Inno, AppImage, portable, and install scripts no longer exist, and the WebUI is the only client.

## Verification and smoke scripts

- Scripts under `tools/scripts/` that start a server for automated verification or smoke testing must isolate application data in a fresh temporary directory per run and remove it afterward, including on failure paths. Set `REELROULETTE_DATA_DIR` to the temporary directory on every OS, and on Linux also set both `XDG_CONFIG_HOME` and `XDG_DATA_HOME`, since desktop integration such as autostart and menu entries uses those locations rather than the data folder.
- Those scripts must stop the server process they started (by started handle/PID, not broad name matching) before removing the isolated directory, using graceful shutdown with a short timeout then force kill if needed, including on failure and interrupt paths.
- Do not point verification or smoke servers at the user's real `%ApplicationData%/ReelRoulette` / `~/.config/ReelRoulette` tree.
- Dev-run helpers such as `run-server.ps1` intentionally use real settings and must not be isolated.
- Tests must not read or write the user's real settings or send logs to a running server. The Core tests get this from `TestIsolation`'s module initializer, which the ServerApp tests also compile; new test projects need the same.
- Tests that resolve a path with `Path.GetFullPath` or remap it must root it under the test's temp directory with `Path.Combine`, never hard-code Unix-style roots like `/media`. CI runs on Windows, where such paths become drive paths. Literals that are only stored and compared as text are fine.
- When validating process-lifecycle or smoke-script changes, never send stop signals to processes the task did not start (for example the user's `run-server.ps1` instance). Confirm liveness and cleanup with non-destructive checks only, such as `kill -0`, `Get-Process` without stopping, or a port/listener query scoped to the verification port.
