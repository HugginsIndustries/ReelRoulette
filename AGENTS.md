# Agent Instructions for ReelRoulette

Keep this file short and enforceable. For details, use `CONTEXT.md`, `MILESTONES.md`, and docs under `docs/`.

## Workflow Priorities

- For milestone planning/verification: read `AGENTS.md`, then `CONTEXT.md`, then `MILESTONES.md`.
- Stay within the requested milestone/TODO slice unless the user expands scope.
- If the user provides a plan file, execute it without editing the plan file itself.
- Reuse existing TODO items; do not duplicate. Update status in order (`in_progress` -> `completed`).
- Before sign-off, explicitly verify acceptance criteria and call out any unmet items.

## Architecture Guardrails

- Keep desktop/web as orchestration/render layers; keep domain logic in `ReelRoulette.Core`/server services.
- Maintain API-first behavior for migrated flows; do not add client-local mutation/fallback authority.
- Keep random selection/playback eligibility API-authoritative for migrated clients.
- Preserve WebUI UX parity unless the user explicitly approves UX changes.
- Add `last.log`-based logging where appropriate, and fix lints introduced by your changes.

## Commit + Docs Discipline

- Assume nothing is committed until the user explicitly confirms a commit occurred.
- If no commit yet: update existing `COMMIT_MESSAGE.txt` and `CHANGELOG.md` entries in place (final state only).
- Keep existing `Mx` entry style in `COMMIT_MESSAGE.txt` unless user asks to replace it.
- After a user-confirmed commit: start a new `COMMIT_MESSAGE.txt` entry and new changelog entry.
- Keep milestone/docs synchronized with final state:
  - `MILESTONES.md` = roadmap/tracking/evidence
  - `CONTEXT.md` = current implemented capabilities
  - update affected docs: `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`, and `docs/domain-inventory.md` when applicable
  - keep `docs/checklists/testing-checklist.md` current: add/update/remove checklist sections/items as features and workflows are added, changed, or removed
- Milestone naming hygiene:
  - Do not add milestone IDs/references (for example `M8f`, `M9a`) in current-state docs or code artifacts (scripts, comments, log/status messages, user-facing copy).
  - Milestone references are allowed only in `MILESTONES.md`, `CHANGELOG.md`, `COMMIT_MESSAGE.txt`, and the `## Near-Term Planned Work` section of `CONTEXT.md` unless the user explicitly requests an exception.

## Commands + Communication

- Do not run commands unless explicitly asked.
- If a command is needed, explain what it does and why, then ask the user to run it.
- Exception: you may run
  `dotnet build ReelRoulette.sln; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; dotnet test ReelRoulette.sln`
  without approval.
- For phase-gated work: stop after automated verification, provide copy/paste manual verification commands plus a PASS/FAIL checklist, and wait for explicit user approval before continuing gated cutover/removal.
- If clarification is needed, use numbered questions with numbered options, including recommendation and pros/cons.
