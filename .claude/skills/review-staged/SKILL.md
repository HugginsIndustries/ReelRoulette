---
name: review-staged
description: Use when the user asks for a review of their staged changes, asks whether staged work is ready to commit, or wants a commit message for what is staged. Reports findings only, makes no changes.
---

# Review staged changes

Follow `AGENTS.md`. Read any other repo docs relevant to the staged change.

Review the staged changes. Report only — make no changes.

Read the diff in full before judging any part of it. A change that looks wrong in isolation is often correct in context, and the opposite is also true.

If `MILESTONES.md` or `MILESTONES-COMPLETED.md` is staged, run `pwsh ./tools/scripts/check-milestones.ps1 -Staged -BaseRef HEAD` and report each problem it prints as a finding.

## Look for

- Behaviour that changed without being part of the intent — especially anything now silently doing something different rather than failing
- Logic duplicated into more than one place instead of the project's existing shared module
- A flag, message, or doc that no longer matches the code, in either direction
- Tests that pass for the wrong reason, or that were deleted along with coverage of something the change did not touch
- Anything violating a rule in `AGENTS.md` or other project docs
- A check or message that assumes something it has not verified — an input kind, a flag's source, or a field that may be absent
- A consumer reading state on a path where that state is not present

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

Say the commit is good to go, then write a commit message for it in a fenced code block, so it can be copied without picking it out of prose.

Follow the Instructions section of `COMMIT-MESSAGE.txt` for the title and bullets. No hard wrapping — each bullet is one line however long. Skip anything obvious from the diff — "added tests" and "updated the README" are not worth a bullet unless something about them is notable.

Do not describe intermediate states the repo never had. If a behaviour was introduced and revised before committing, only the final state exists as far as the log is concerned.
