# Commit Messages

Each worktree keeps the message for its branch in `COMMIT-MESSAGE.txt`, an untracked draft that the advisor commits the branch's squash merge with. `AGENTS.md` says when to start and update it. The file holds only the message: the title, a blank line, and the bullets.

Change these rules only when the user asks.

## Title

- Keep title format as `*: {concise summary}`.
- Use one of these title prefixes based on scope:
  - `Docs: {concise summary}` for docs-only updates outside of milestone work.
  - `{milestone id}: {concise summary}` for milestone implementation work (examples: `M8c: ...`, `M9h: ...`, `M16b: ...`).
  - A milestone's own slices use its milestone-id prefix even when they change only docs. Planning edits that record or reorder milestones are not milestone work, so they use `Docs:`.
  - The advisor's own commits on main use `Docs:` to record a slice's spot check, and the milestone's id to move a completed milestone to `MILESTONES-COMPLETED.md` after its spot check (example: `M12n1: Complete WebUI Developer Settings after the user's spot check`).
  - `Bugfix: {concise summary}` for defect fixes.
  - `Feature: {concise summary}` for net-new feature work outside milestone framing.
  - `Improvement: {concise summary}` for changes users would notice to existing behavior, outside milestone framing, that aren't defect fixes.
  - `Refactor: {concise summary}` for internal code restructuring with no behavior change.
  - `Test: {concise summary}` for test-only additions/updates.
  - `Chore: {concise summary}` for tooling/maintenance updates.
- Keep the summary concise and outcome-focused.

## Body

- Use 1-8 bullet points max in the message body.
- Keep bullets high-level; avoid excessive implementation detail.
- No hard wrapping: each bullet is one line however long.
- Skip anything obvious from the diff. "Added tests" and "updated the README" are not worth a bullet unless something about them is notable.
- Describe only the final state. If a behaviour was introduced and revised on the branch, only the final state exists as far as the log is concerned.
