---
name: review-fix
description: Use when the user asks to fix findings from a review of staged changes, usually in the same session as the review. Applies only the findings the user chose, with their decisions, verifies them, and keeps the commit message and records current. Does not commit.
---

# Review fix

Follow `AGENTS.md`.

The user names which review findings to fix, and may add decisions or changes to the suggested fixes. Fix exactly those, as decided. Leave findings the user accepted or declined alone, unless they asked to record or document them.

## Before changing anything

If a fix turns out larger than the finding described, needs a decision the user didn't give, or would change behavior beyond the finding, stop and say so with options and a recommendation. Otherwise, go ahead without a separate plan; the review already was one.

## Making the fixes

- For a fix that changes behavior, add or adjust a test and show it failing before the fix and passing after.
- For a doc or record fix, change only what the finding names.
- Do not widen scope. Anything new you notice becomes a note in the summary, not an extra fix.

## Keeping records current

- Update the uncommitted `COMMIT-MESSAGE.txt` entry in place if the fixes change what it describes; check commit state from git per `AGENTS.md`.
- Re-check the `[Unreleased]` changelog against the style note at the top of `CHANGELOG.md` if any fix touches it.
- Update milestone evidence in `MILESTONES.md` if the milestone is part of this change.
- When the user asks to record a finding as future work, add it as a backlog item or to the existing milestone that will do it, following the maintenance rules in `MILESTONES.md`.
- Leave the fixes unstaged so the user can see them separately from what was already staged.

## Verification

Re-run the checks the fixes touch: the build and tests for code, `npm run verify` for WebUI or contract changes, SystemChecks for Core changes, and any script a fix changed. For comment-only or doc-only fixes, say that no run was needed and why.

## Summary

For each finding: what changed, with file links, and how it was verified. Then: anything noticed but not fixed, what the user needs to stage, and whether the existing commit message still fits. If the fixes changed code substantially, suggest running the staged review again.
