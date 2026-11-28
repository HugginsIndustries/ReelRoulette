---
name: review-fix
description: Use when the user or the advisor asks to fix findings from a review of a branch, usually in the session that built the branch, after the advisor's review. Applies only the findings chosen, with their decisions, verifies them, keeps the message draft and records current, and commits on this session's branch once the checks pass.
---

# Review fix

Follow `AGENTS.md`.

The user or the advisor names which review findings to fix, and may add decisions or changes to the suggested fixes. Fix exactly those, as decided. Leave findings that were accepted or declined alone, unless recording or documenting them was asked for.

## Before changing anything

If a fix turns out larger than the finding described, needs a decision that wasn't given, or would change behavior beyond the finding, say so with options and a recommendation; in a session the advisor started, keep going as `CLAUDE.md`'s "Other sessions in this repo" section says, and otherwise stop. Otherwise, go ahead without a separate plan; the review already was one.

## Making the fixes

- For a fix that changes behavior, add or adjust a test and show it failing before the fix and passing after.
- For a doc or record fix, change only what the finding names.
- Do not widen scope. Anything new you notice becomes a note in the summary, not an extra fix.

## Keeping records current

- Update this worktree's `COMMIT-MESSAGE.txt` draft, per `AGENTS.md`, if the fixes change what it describes; start it from the branch's newest commit of its own if the worktree has none. The advisor merges this branch with it.
- Re-check the `[Unreleased]` changelog against the style note at the top of `CHANGELOG.md` if any fix touches it.
- Update milestone evidence in `MILESTONES.md` if the milestone is part of this change.
- When the user asks to record a finding, add a bug as an issue in `ISSUES.md`, in that file's format, and an improvement as a backlog item or to the existing milestone that will do it, following the maintenance rules in `MILESTONES.md`.
- When a fix closes an issue in `ISSUES.md`, delete it there.
- Once the checks pass, commit the fixes on this session's branch per `AGENTS.md`.

## Verification

Re-run the checks the fixes touch: the build and tests for code, `npm run verify` for WebUI or contract changes, SystemChecks for Core changes, and any script a fix changed. For comment-only or doc-only fixes, say that no run was needed and why.

## Summary

For each finding: what changed, with file links, and how it was verified. Then: anything noticed but not fixed, and whether the message draft still fits. If the fixes changed code substantially, suggest another review of this branch.
