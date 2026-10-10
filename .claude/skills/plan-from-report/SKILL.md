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
- Note dependencies and order: if one item must land before another, name the earlier one in the later one's Depends on, and keep them in that order in the Planned Releases outline.

## Writing entries

- Follow the Entry Format and Milestone Template in `MILESTONES.md`: Status, Goal, Depends on, and Design as header bullets; Decisions; a Slices table with a section per slice holding its Scope, Traps, and Acceptance; Release checks; and Not included. Evidence is added when a slice lands, never while planning.
- Write the Depends on bullet as exact milestone titles joined by commas or "and". An explanation may follow a title after ", which", ", whose", or ", so".
- Refer to other milestones by name, never by ID, except in section headers, the tracker line, and the Planned Releases outline.
- Record a settled choice under Decisions when it shapes more than one slice, and in the slice's Scope when it shapes only that one. Write it as settled, without saying where it was decided.
- Carry the report's facts and measured numbers into the Traps of the slice that will hit them, including known traps such as an approach measured to be slow or wrong. Mark them "(measured)" or "(inferred)" as the report does, and leave a fact read from code or docs unmarked.
- Give each slice its own acceptance criteria, each naming the tests that show it. Verification is automated tests plus at most a quick spot check. Longer manual checks, repeated runs, and Windows VM passes become one-line `Agent:` or `Manual:` bullets in the entry's Release checks, not milestone steps.
- Record anything out of scope, never silently: future work as its own backlog item or as an addition to the existing milestone that will do it, after checking existing items so nothing is recorded twice, and scope boundaries as a bullet in Not included, naming the covering milestone by its exact title after "which is".

## IDs and renumbering

Follow the file's rules for P and M IDs and promotion. Renumber only milestones that haven't started, and only when it keeps IDs in the order the work will happen; say so in the plan. Check that a new P number has never been used.

## The plan

Present it and stop. Show: each finding and where it goes (existing item or new entry, with the release), any renumbering as an old-to-new table, every name reference that changes, and any genuine fork as a numbered question with a recommendation. Decide the rest yourself and say what you decided.

## After confirmation

Make the edits, then run `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef HEAD` and fix everything it reports. It checks that milestone IDs appear only in section headers, the tracker line, and the Planned Releases outline; that the outline and the sections agree; that active and planned entries follow the Entry Format's structure; that every Depends on and Not included reference names an existing milestone title; and that `MILESTONES-COMPLETED.md` only grew by entries moved in. It cannot check milestone names mentioned in other prose, or the Entry Format's rules for what entries say: one fact, decision, or criterion per bullet, each acceptance criterion naming its tests, the Traps marks, and decisions written as settled. Check those, and any name reference you added or changed, by reading. Say what you ran and its result.

Start or update the `COMMIT-MESSAGE.txt` entry per `AGENTS.md`. No changelog entry; planning changes nothing user-visible.
