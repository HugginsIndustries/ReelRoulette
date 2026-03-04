# Agent Instructions for ReelRoulette

This file contains guidelines and instructions for AI agents working on this codebase.

## Planning and Execution

- When the user provides an attached milestone plan, execute it without editing the plan file itself (agents may edit the plan file to mark milestones as complete)
- Reuse existing plan TODO items and do not create duplicates when TODOs already exist
- Update TODO status in execution order (`in_progress` when starting, `completed` when done)
- Before sign-off, explicitly verify milestone acceptance criteria and call out any unmet items

## Architecture and Code Boundaries

- Follow existing code style/patterns and keep architecture consistent
- Keep desktop/web clients as orchestration/render layers; place domain/business logic in `ReelRoulette.Core`/server paths
- Preserve strict API-first behavior for migrated flows; do not add local-mutation fallback paths once migrated to core/server
- Add logging to new code where appropriate, using the last.log system
- Test changes thoroughly and fix linter errors introduced by changes

## Commit and Documentation Discipline

- Assume no changes have been committed yet until the user explicitly confirms a commit occurred
- Replace `COMMIT_MESSAGE.txt` with only the current diff since the last commit (concise, no historical context)
- If the user says nothing has been committed yet, keep the existing Mx entry style in `COMMIT_MESSAGE.txt` and update/append it in place unless they explicitly ask to replace the whole message
- Update `CHANGELOG.md` for significant changes and reflect only final delta from the previous commit (no intermediate attempts)
- After user-confirmed commit, start a new `COMMIT_MESSAGE.txt` and a new changelog entry for subsequent changes
- Apply the same “final state only” rule to `TODO.md` updates/moves to Completed Features
- Keep `MILESTONES.md` and `TODO.md` links/scope language aligned when milestone scope changes
- Keep affected docs in sync with final milestone state (`README.md`, `docs/architecture.md`, `docs/api.md`, `docs/dev-setup.md`) and automatically add/update `docs/mX-domain-inventory.md` for milestone work

## Commands and Communication

- Do not run commands unless explicitly asked by the user
- If a command is needed, explain what it does and why, then ask the user to run it
- Be proactive with improvements, explain reasoning, and ask clarifying questions when requirements are ambiguous
- When asking the user for clarifications (or when asked to provide clarification choices), always use this exact format: a numbered list of questions with numbered options for each; and for each question include (1) description of the decision, (2) recommendation, (3) reasoning, (4) at least 2-3 alternative choices, and (5) detailed pros/cons of each choice.
