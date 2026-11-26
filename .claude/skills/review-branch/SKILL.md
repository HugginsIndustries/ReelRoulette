---
name: review-branch
description: Use when the user or the advisor asks for a review of a branch's changes, asks whether a branch is ready to merge, or wants its commit message checked. Reviews everything the branch changed since it left main. Reports findings only, makes no changes.
---

# Review a branch

Follow `AGENTS.md`. Read any other repo docs relevant to the change.

Review everything this branch changed since it left main: `git diff $(git merge-base main HEAD)`, which covers the branch's commits and anything uncommitted. Report only — make no changes.

Read the diff in full before judging any part of it. A change that looks wrong in isolation is often correct in context, and the opposite is also true.

If the diff touches `MILESTONES.md` or `MILESTONES-COMPLETED.md`, run `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef $(git merge-base main HEAD)` and report each problem it prints as a finding.

The branch's message draft is this worktree's `COMMIT-MESSAGE.txt` when it has one, and otherwise the message of the branch's newest commit of its own, `git log -1 --format=%B main..HEAD`. Check it against the diff and `docs/commit-messages.md`.

## Look for

- Behaviour that changed without being part of the intent — especially anything now silently doing something different rather than failing
- Logic duplicated into more than one place instead of the project's existing shared module
- A flag, message, or doc that no longer matches the code, in either direction
- Tests that pass for the wrong reason, or that were deleted along with coverage of something the change did not touch
- Anything violating a rule in `AGENTS.md` or other project docs
- A check or message that assumes something it has not verified — an input kind, a flag's source, or a field that may be absent
- A consumer reading state on a path where that state is not present
- A message draft that misses part of the change, describes something it doesn't do, or doesn't follow `docs/commit-messages.md`

Also check anything the project's own review or architecture docs say to watch for.

## Delegating

For a diff of more than a few files, or one touching anything the project's docs call risky, run `reviewer` subagents in parallel, one lens each:

1. Correctness: behaviour that changed without being intended, tests that pass for the wrong reason, and coverage lost with deleted tests.
2. Architecture and contract: layering, API contract compatibility, callers outside the build, and the project's risky areas.
3. Docs and rules: docs or messages that no longer match the code, `AGENTS.md` rules, and tracker and changelog conventions.

Then read the diff yourself, confirm each finding against it, merge duplicates, drop anything you can't confirm, and number the result as the report format below says. Small diffs are reviewed directly.

## Report format

For each finding: what it is, where, what triggers it, and a recommended fix in one or two sentences. Number them and put the ones that produce wrong output first.

Say plainly if you find nothing. Do not pad the list — a finding you are unsure about is worth reporting as uncertain, but a finding invented to have something to say wastes the review.

## If there are no findings

Say the branch is ready to merge, then show its message draft in a fenced code block, so it can be read without picking it out of prose.
