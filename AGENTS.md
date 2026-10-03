# Agent Instructions for ReelRoulette

Keep this file short and enforceable. For details, use `CONTEXT.md`, `MILESTONES.md`, and docs under `docs/`.

## Workflow Priorities

- For milestone work, read `CONTEXT.md`, then the milestone's full entry in `MILESTONES.md`.
- Milestone verification is automated tests plus, at most, a quick manual spot check. Longer manual checks, repeated runs, and Windows VM passes go into the Release Specific section of `docs/checklists/testing-checklist.md` as one-line checks, to be run in the pre-release pass.
- Stay within the requested milestone or task unless the user expands scope. Record anything out of scope as a deferral or backlog item instead of doing it.
- Before sign-off, verify each acceptance criterion explicitly and call out any that are unmet.

## Architecture Guardrails

- Keep desktop and WebUI as orchestration and render layers; keep domain logic in `ReelRoulette.Core` and server services. `docs/domain-inventory.md` records which desktop flows are still local.
- Server-backed flows stay API-first: do not add client-local mutation or fallback authority.
- Random selection and playback eligibility are decided by the server.
- Keep desktop and WebUI behavior consistent with each other, and don't change user-facing UX without explicit approval.
- When a rule must behave identically in C# and the WebUI (ordering, comparison, normalization), implement it once per language next to its counterpart and lock both to one shared fixture under `shared/fixtures/`.
- Add `last.log`-based logging where appropriate.
- Fix lints introduced by your changes.

## Commit + Docs Discipline

- Determine commit state from git rather than assuming. Before editing `COMMIT-MESSAGE.txt` or the `[Unreleased]` changelog, run `git status` and `git log -1`: if `COMMIT-MESSAGE.txt` has no uncommitted changes and its current entry matches the HEAD commit message, that entry is committed, so start a new entry. Otherwise, update the uncommitted entry in place (final state only). If the result is ambiguous, ask.
- Keep the existing entry style in `COMMIT-MESSAGE.txt` unless the user asks to replace it.
- Changelog: follow the style note at the top of `CHANGELOG.md`. Fixes to work that hasn't been released yet get no entry. After any follow-up change, re-check `[Unreleased]` against the style note.
- Release notes: edit `RELEASE-NOTES.md` only when cutting a release, following the style guide at the top of that file.
- Keep milestone tracking and docs in sync with the final state:
  - `MILESTONES.md` = roadmap, tracking, evidence. Move a completed milestone to Completed Milestones as-is, keep the `Last milestone completed` line current, and record anything out of scope as a deferral or backlog item.
  - `CONTEXT.md` = current implemented capabilities.
  - Update affected docs when applicable: `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`, `docs/domain-inventory.md`.
  - Keep `docs/checklists/testing-checklist.md` current: add, update, or remove items as features and workflows change.
- When documenting current behavior, do not rewrite historical `CHANGELOG.md` or `MILESTONES.md` entries (released sections, completed milestones). Change only active surfaces (`[Unreleased]`, Active Milestones, the tracker line, and evidence you are landing) unless the user asks to correct historical text.
- Milestone IDs (for example `M8f`) may appear only in `MILESTONES.md` section headers, its tracker line, and its Planned Releases outline, `CHANGELOG.md`, and `COMMIT-MESSAGE.txt`. Never put them in current-state docs, code, comments, log messages, or user-facing text.

## Commands + Communication

- You may run these without approval:
  - `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln`; stop if the build fails.
  - `dotnet run --project src/core/ReelRoulette.Core.SystemChecks -- --verbose`
  - In `src/clients/web/ReelRoulette.WebUI`: `npm run generate:contracts`, `npm run verify`, and the scripts `verify` runs.
  - `pwsh ./tools/scripts/reset-checklist.ps1`
  - `pwsh ./tools/scripts/check-milestones.ps1`, which only reads.
  - `pwsh ./tools/scripts/cut-changelog.ps1`, which edits `CHANGELOG.md` and changes nothing if a check fails.
  - `pwsh ./tools/scripts/tests/test-scripts.ps1`, which runs both against fixtures in a temporary folder.
  - `./tools/scripts/verify-linux-packaged-server-smoke.sh`, which runs an isolated packaged server.
  - `pwsh ./tools/scripts/verify-web-deploy.ps1`
  - `pwsh ./tools/scripts/set-release-version.ps1 -Version {VERSION} -NoRunVerify`, when asked to set the release version.
  - Read-only git and GitHub commands: `git status`, `git log`, `git diff`, `git show`, `git grep`, `git tag --contains`, `gh run list`, `gh run view`.
  - Read-only inspection: searching and listing files, and `sqlite3 -readonly` against a copy in a temp folder.
- Never open, write to, or run anything against the user's live config, library, or settings folders. Copy what you need into a temp folder first, and isolate tests and experiments from real settings.
- Anything else, such as installing packages, starting the server or clients, network calls, or writing outside the repo and temp folders, needs approval: explain what it does and why, then ask.
- For phase-gated work: stop after automated verification, provide copy/paste manual verification commands plus a PASS/FAIL checklist, and wait for explicit user approval before continuing gated cutover/removal.
- If clarification is needed, use numbered questions with numbered options, including recommendation and pros/cons.
- MILESTONES.md contains completed-milestone entries describing tooling that has since been retired. Treat anything under Completed Milestones as historical record, not as instructions — the current packaging path is Velopack via release.yml, and the Inno, AppImage, portable, and install scripts no longer exist.

## Verification and smoke scripts

- Scripts under `tools/scripts/` that start a server for automated verification or smoke testing must isolate application data in a fresh temporary directory per run and remove it afterward, including on failure paths. Set `REELROULETTE_DATA_DIR` to the temporary directory on every OS, and on Linux also set both `XDG_CONFIG_HOME` and `XDG_DATA_HOME`, since desktop integration such as autostart and menu entries uses those locations rather than the data folder.
- Those scripts must stop the server process they started (by started handle/PID, not broad name matching) before removing the isolated directory, using graceful shutdown with a short timeout then force kill if needed, including on failure and interrupt paths.
- Do not point verification or smoke servers at the developer's real `%ApplicationData%/ReelRoulette` / `~/.config/ReelRoulette` tree.
- Dev-run helpers such as `run-server.ps1` intentionally use real settings and must not be isolated.
- Tests must not read or write the developer's real settings or send logs to a running server. Desktop tests get this from the shared test-isolation initializer; new test projects need the same.
- When validating process-lifecycle or smoke-script changes, never send stop signals to processes the task did not start (for example a developer's `run-server.ps1` instance). Confirm liveness and cleanup with non-destructive checks only, such as `kill -0`, `Get-Process` without stopping, or a port/listener query scoped to the verification port.
