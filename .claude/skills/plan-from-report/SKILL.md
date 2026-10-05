---
name: plan-from-report
description: Use when asked to turn a report, review, or list of findings into planning changes in MILESTONES.md — new or amended milestones, backlog items, release placement, or Planned Releases changes. Plans the edit and stops for confirmation before changing anything. Docs-only.
---

# Plan from report

Follow `AGENTS.md`. Read the top of `MILESTONES.md` (its maintenance rules and the Planned Releases outline) in full, then the report or findings the user points to. Follow the file's own rules too; where they disagree with `AGENTS.md`, ask.

## Map before adding

For each finding, check whether an existing milestone or backlog item already covers it, fully or partly. Say which one by name. Only findings nothing covers become new entries. Never duplicate an existing item; amend it instead.

## Placement

- Fit each new item to the release whose theme it matches, using the Planned Releases outline. If it fits none, put it in the unscheduled backlog and say why it waits.
- Keep contract changes (OpenAPI and generated client types) in their own slices.
- Group related small items into one milestone with slices, each with its own acceptance criteria, rather than many tiny milestones or one milestone with many unrelated slices.
- Note dependencies and order: if one item must land before another, say so in both.
- Mark items that can be cut if a release runs long.

## Writing entries

- Use the file's template: Status, Goal, Scope (with a `Depends on:` line, and `Not included:` lines for scope boundaries), Acceptance criteria, Verification evidence.
- Write `Depends on:` as exact milestone titles joined by commas or "and". An explanation may follow a title after ", which", ", whose", or ", so".
- Refer to other milestones by name, never by ID, except in section headers, the tracker line, and the Planned Releases outline.
- Carry over the report's measured numbers and evidence, and keep its measured-versus-inferred labels. Record known traps (an approach measured to be slow or wrong) in the entry that will hit them.
- Verification is automated tests plus at most a quick spot check. Longer manual checks, repeated runs, and Windows VM passes become one-line notes for the release's Release Specific checklist, not milestone steps.
- Record anything out of scope, never silently: future work as its own backlog item or as an addition to the existing milestone that will do it, after checking existing items so nothing is recorded twice, and scope boundaries as a `Not included:` line naming the covering milestone by its exact title after "which is".

## IDs and renumbering

Follow the file's rules for P and M IDs and promotion. Renumber only milestones that haven't started, and only when it keeps IDs in the order the work will happen; say so in the plan. Check that a new P number has never been used.

## The plan

Present it and stop. Show: each finding and where it goes (existing item or new entry, with the release), any renumbering as an old-to-new table, every name reference that changes, and any genuine fork as a numbered question with a recommendation. Decide the rest yourself and say what you decided.

## After confirmation

Make the edits, then run `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef HEAD` and fix everything it reports. It checks that milestone IDs appear only in section headers, the tracker line, and the Planned Releases outline; that the outline and the sections agree; that every `Depends on` names an existing milestone title; and that `MILESTONES-COMPLETED.md` only grew by entries moved in. It cannot check milestone names mentioned in other prose, so check any name reference you added or changed by reading. Say what you ran and its result.

Start or update the `COMMIT-MESSAGE.txt` entry per `AGENTS.md`. No changelog entry; planning changes nothing user-visible.
