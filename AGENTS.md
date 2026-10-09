# Agent Instructions for ReelRoulette

Keep this file short and enforceable. For details, use `CONTEXT.md`, `MILESTONES.md`, and docs under `docs/`.

## Workflow Priorities

- For milestone work, read `CONTEXT.md`, then the milestone's full entry in `MILESTONES.md`.
- Milestone verification is automated tests plus, at most, a quick manual spot check. Longer manual checks, repeated runs, Windows VM passes, and checks that need a release build or a dev release (release workflow steps, installers, in-app updates) go into the Release Specific section of `docs/checklists/testing-checklist.md` as one-line checks, to be run in the pre-release pass: under Agent checks when an agent can verify them from the repo, its docs, or the release workflow's runs, and under Manual checks when they need a person, real devices, or the Windows VM. Never record them as pending milestone evidence: the evidence names the checklist item that covers them and is complete when the milestone is moved, so completed milestones never need editing afterwards.
- Stay within the requested milestone or task unless the user expands scope. Record future work as a backlog item, or as an addition to the milestone that will do it, instead of doing it. Scope boundaries go in Scope as a `Not included:` line.
- Solutions are best-effort. Handle what can realistically happen in normal use; don't add code, tests, or findings for improbable edge cases such as storage corruption, a failing disk, or files damaged by something outside the app. In summaries and reviews, leave such cases out rather than listing them as "noticed but not fixed".
- Before sign-off, verify each acceptance criterion explicitly and call out any that are unmet.

## Architecture Guardrails

- Keep desktop and WebUI as orchestration and render layers; keep domain logic in `ReelRoulette.Core` and server services. `docs/domain-inventory.md` records which desktop flows are still local.
- Server-backed flows stay API-first: do not add client-local mutation or fallback authority.
- Random selection and playback eligibility are decided by the server.
- The desktop client gets no significant changes or new features until its removal; new UX lands in the WebUI only. Small desktop changes that keep it working with the server, or that match a small server-side change, are allowed. Don't change user-facing UX without explicit approval.
- "WebUI" is an internal name, for code, comments, logs, and developer docs. Text users see says "ReelRoulette" instead: labels, settings, admin, notices, dialogs, the desktop's retirement notice, and release notes. `CHANGELOG.md` keeps "WebUI" through v0.15.x, since it is developer history and still tells the two clients apart; from v0.16.0, which removes the desktop client, it no longer needs to.
- When a rule must behave identically in C# and the WebUI (ordering, comparison, normalization), implement it once per language next to its counterpart and lock both to one shared fixture under `shared/fixtures/`.
- Add `last.log`-based logging where appropriate.
- Fix lints introduced by your changes.

## Commit + Docs Discipline

- Agents do not commit or push; the user does. A best-effort hook asks for approval before any `git commit` or `git push`.
- Determine commit state from git rather than assuming. Before editing `COMMIT-MESSAGE.txt` or the `[Unreleased]` changelog, run `git status` and `git log -1`: if `COMMIT-MESSAGE.txt` has no uncommitted changes and its current entry matches the HEAD commit message, that entry is committed, so start a new entry. Otherwise, update the uncommitted entry in place (final state only). If the result is ambiguous, ask.
- Keep the existing entry style in `COMMIT-MESSAGE.txt` unless the user asks to replace it.
- Changelog: follow the style note at the top of `CHANGELOG.md`. Fixes to work that hasn't been released yet get no entry. After any follow-up change, re-check `[Unreleased]` against the style note.
- Release notes: edit `RELEASE-NOTES.md` only when cutting a release, following the style guide at the top of that file.
- Keep milestone tracking and docs in sync with the final state:
  - `MILESTONES.md` = roadmap, tracking, evidence. Move a completed milestone as-is to the top of `MILESTONES-COMPLETED.md`, keep the `Last milestone completed` line current, and record future work and scope boundaries as its maintenance rules describe.
  - `MILESTONES-COMPLETED.md` = completed milestones, newest first, kept as historical record.
  - `CONTEXT.md` = current implemented capabilities.
  - Update affected docs when applicable: `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`.
  - Keep `docs/checklists/testing-checklist.md` current: update its Smoke and Release Flow items when the workflows they check change, and put checks for one release's changes in Release Specific, under Agent checks or Manual checks. Feature behavior is covered by automated tests, not standing checklist items.
- When documenting current behavior, do not rewrite historical `CHANGELOG.md` sections or `MILESTONES-COMPLETED.md` entries. Change only active surfaces (`[Unreleased]`, Active Milestones, the tracker line, and evidence you are landing) unless the user asks to correct historical text.
- Milestone IDs (for example `M8f`) may appear only in `MILESTONES.md` section headers, its tracker line, and its Planned Releases outline, `MILESTONES-COMPLETED.md`, `CHANGELOG.md`, and `COMMIT-MESSAGE.txt`. Never put them in current-state docs, code, comments, log messages, or user-facing text.

## Commands + Communication

- You may run these without approval:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln`; stop if the build fails.
  - `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose`
  - In `src/clients/web/ReelRoulette.WebUI`: `npm run generate:contracts`, `npm run verify`, and the scripts `verify` runs.
  - `python3 docs/mockups/webui-panels/build/build_pages.py` and `node docs/mockups/webui-panels/build/check.mjs`, which rebuild the design mockup's pages from their sources and check them.
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
- Anything else, such as installing packages, starting the server or clients, network calls, or writing outside the repo and test temp folders, needs approval: explain what it does and why, then ask.
- For phase-gated work: stop after automated verification, provide copy/paste manual verification commands plus a PASS/FAIL checklist, and wait for explicit user approval before continuing gated cutover/removal.
- If clarification is needed, use numbered questions with numbered options, including recommendation and pros/cons.
- `MILESTONES-COMPLETED.md` contains entries describing tooling that has since been retired. Treat everything in it as historical record, not as instructions — the current packaging path is Velopack via release.yml, and the Inno, AppImage, portable, and install scripts no longer exist.

## Verification and smoke scripts

- Scripts under `tools/scripts/` that start a server for automated verification or smoke testing must isolate application data in a fresh temporary directory per run and remove it afterward, including on failure paths. Set `REELROULETTE_DATA_DIR` to the temporary directory on every OS, and on Linux also set both `XDG_CONFIG_HOME` and `XDG_DATA_HOME`, since desktop integration such as autostart and menu entries uses those locations rather than the data folder.
- Those scripts must stop the server process they started (by started handle/PID, not broad name matching) before removing the isolated directory, using graceful shutdown with a short timeout then force kill if needed, including on failure and interrupt paths.
- Do not point verification or smoke servers at the developer's real `%ApplicationData%/ReelRoulette` / `~/.config/ReelRoulette` tree.
- Dev-run helpers such as `run-server.ps1` intentionally use real settings and must not be isolated.
- Tests must not read or write the developer's real settings or send logs to a running server. Desktop tests get this from the shared test-isolation initializer; new test projects need the same.
- Tests that resolve a path with `Path.GetFullPath` or remap it must root it under the test's temp directory with `Path.Combine`, never hard-code Unix-style roots like `/media`. CI runs on Windows, where such paths become drive paths. Literals that are only stored and compared as text are fine.
- When validating process-lifecycle or smoke-script changes, never send stop signals to processes the task did not start (for example a developer's `run-server.ps1` instance). Confirm liveness and cleanup with non-destructive checks only, such as `kill -0`, `Get-Process` without stopping, or a port/listener query scoped to the verification port.
