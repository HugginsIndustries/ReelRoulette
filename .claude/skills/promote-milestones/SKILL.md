---
name: promote-milestones
description: Use when asked to promote the next planned release in MILESTONES.md to Active Milestones. Checks each of its milestones against the current code, reports their status and stops for confirmation before changing anything. Docs-only.
---

# Promote milestones

Follow `AGENTS.md`. Read the top of `MILESTONES.md` (its maintenance rules and the Planned Releases outline) and the Active Milestones section in full. Follow the file's own rules too; where they disagree with `AGENTS.md`, ask.

## Which release

The next planned release is the first line in the Planned Releases outline whose milestones still have `P*` IDs. Promote that one unless the user names another. If Active Milestones still holds milestones, list them and ask before promoting another release.

## Check each milestone against the code

Read every milestone in the release in full, and the release's outline line. Old entries drift: later work lands, code moves, and figures go stale. For each milestone:

- **Scope**: find the code, routes, settings, scripts, and tests the entry names, and confirm they still exist and behave as it says. Check git history since the entry was last changed (`git log` on the files it names, `git log -S` for names it relies on) for later work that did part of it or changed what it touches.
- **Measurements**: where a claim depends on a number, such as a timing, a size, a count, or a limit, measure it again; don't carry an old figure forward. Follow `AGENTS.md` for which commands you may run and ask before anything it says needs approval. Throwaway experiments go in a temp folder and change no tracked file. If you can't measure something, say so.
- **Assumptions**: check each thing the entry states as fact, such as what a client reads, what a route returns, or what an earlier milestone delivered. For a completed dependency, check what its entry in `MILESTONES-COMPLETED.md` and the code say actually landed, not what was planned.
- **Dependencies and order**: each `Depends on` milestone is complete or earlier in this release's outline, and each `Not included` line still names a milestone that covers the boundary.

Reasoning about code is a hypothesis; running it is a finding. Say which of your claims are measured and which are inferred.

## The report

Present it and stop. Do not edit anything until the user confirms.

For each milestone, in outline order, give its status with the evidence behind it: what you measured and the numbers, and what you checked in the code or history. A milestone can have more than one status:

- **Still accurate**: scope, figures, and assumptions hold as written.
- **Already done, in part or whole**: what is done, by which commit or completed milestone, and what is left.
- **Changed by later work**: what changed, and what the entry should say now.
- **Rests on an assumption that no longer holds**: what the entry assumes, what is true now, and what that does to its scope or approach.

Then show the corrections you plan for each entry and the new IDs as a P-to-M table in outline order. Give anything that needs a decision as a numbered question with options and a recommendation, for example whether a milestone already done leaves the release, whether a milestone whose approach no longer works changes approach or moves to a later release, or whether the order changes. Decide the rest yourself and say what you decided.

## After confirmation

1. Correct the entries as agreed, following the template and the Writing entries rules in `.claude/skills/plan-from-report/SKILL.md`. Replace stale figures with the new measurements and say in the entry which figures were re-measured at promotion and which were not. Change each `Planned for v{VERSION}.` line to say where the milestone ships in the series, such as `Ships in v0.15.0, first in the series.`, `after the {title} milestone`, or `last in the series`.
2. Assign IDs by the promotion rules in `MILESTONES.md`: the release becomes the next `M*` series after the highest one in Active Milestones and `MILESTONES-COMPLETED.md`, with lettered milestones in outline order.
3. Move the entries from Planned Milestones to Active Milestones in outline order, below the `Last milestone completed` line and after any milestone already active. Status stays ⏳ Planned.
4. Update the release's Planned Releases line: replace each `P*` ID with its `M*` ID, and update its summary if a correction changed what the release ships. Move any milestone that left the release to where the user decided, on its new release's line or the backlog line.
5. Run `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef HEAD` and fix everything it reports. It cannot check milestone names mentioned in other prose, so if a title changed, find every mention of the old title with `git grep` and update it. Say what you ran and its result.
6. Start a `Docs:` entry in `COMMIT-MESSAGE.txt`, such as `Docs: Promote the v0.15.0 WebUI overhaul release to active milestones`. Check commit state per `AGENTS.md` first; if an uncommitted entry for other work is there, ask instead of replacing it. One bullet names the milestones and their new IDs, then one bullet per substantive correction with its reason. No changelog entry; planning changes nothing user-visible.

End with the IDs assigned, each correction made, any figure that was not re-measured and why, the checker result, and the first milestone to start.
