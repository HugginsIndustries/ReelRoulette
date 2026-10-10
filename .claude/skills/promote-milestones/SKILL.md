---
name: promote-milestones
description: Use when asked to promote the next planned release in MILESTONES.md to Active Milestones. Checks each of its milestones against the current code, reports their status and stops for confirmation before changing anything, then clears the released version's Release Specific checks and promotes. Docs-only.
---

# Promote milestones

Follow `AGENTS.md`. Read the top of `MILESTONES.md` (its maintenance rules and the Planned Releases outline) and the Active Milestones section in full. Follow the file's own rules too; where they disagree with `AGENTS.md`, ask.

## Which release

The next planned release is the first line in the Planned Releases outline whose milestones still have `P*` IDs. Promote that one unless the user names another. If Active Milestones still holds milestones, list them and ask before promoting another release.

## The released version's checks

Both groups of the Release Specific section of `docs/checklists/testing-checklist.md`, Agent checks and Manual checks, still hold the released version's checks, and that release's pass is signed off, so they are cleared before promoting. If any item there is unticked, list it in the report and ask before removing it.

## Check each milestone against the code

Read every milestone in the release in full, and the release's outline line. Old entries drift: later work lands, code moves, and figures go stale. For each milestone:

- **Scope and Traps**: find the code, routes, settings, scripts, and tests the entry names, and confirm they still exist and behave as it says. Check git history since the entry was last changed (`git log` on the files it names, `git log -S` for names it relies on) for later work that did part of it or changed what it touches.
- **Measurements**: measure again every fact marked "(measured)", or labeled "Measured" in an entry not yet converted, and every claim that depends on a number, such as a timing, a size, a count, or a limit; don't carry an old figure forward. Follow `AGENTS.md` for which commands you may run and ask before anything it says needs approval. Throwaway experiments go in a temp folder and change no tracked file. If you can't measure something, say so.
- **Assumptions**: check each thing the entry states as fact, such as what a client reads, what a route returns, or what an earlier milestone delivered. For a completed dependency, check what its entry in `MILESTONES-COMPLETED.md` and the code say actually landed, not what was planned.
- **Dependencies and order**: each `Depends on` milestone is complete or earlier in this release's outline, and each Not included bullet that names a milestone still names one that covers the boundary.

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

1. Remove the released version's items from both groups of the Release Specific section of the testing checklist, keeping the section's note and each group's heading and note. Remove an unticked item only if the user agreed.
2. Convert each entry to the Entry Format in `MILESTONES.md` if it isn't already, and correct it as agreed, following the Writing entries rules in `.claude/skills/plan-from-report/SKILL.md`. Converting drops its `Planned for v…` line, since the Planned Releases outline holds the release, and turns its "Measured:" and "Read from code at this edit:" labels into the Traps marks. Replace stale figures with the new measurements, and mark a measured fact you couldn't measure again "(measured before promotion)".
3. Assign IDs by the promotion rules in `MILESTONES.md`: the release becomes the next `M*` series after the highest one in Active Milestones and `MILESTONES-COMPLETED.md`, with lettered milestones in outline order.
4. Move the entries from Planned Milestones to Active Milestones in outline order, below the `Last milestone completed` line and after any milestone already active. Status stays ⏳ Planned.
5. Update the release's Planned Releases line: replace each `P*` ID with its `M*` ID, and update its summary if a correction changed what the release ships. Move any milestone that left the release to where the user decided, on its new release's line or the backlog line.
6. Run `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef HEAD` and fix everything it reports. It cannot check milestone names mentioned in other prose, so if a title changed, find every mention of the old title with `git grep` and update it. Say what you ran and its result.
7. Start a `Docs:` entry in `COMMIT-MESSAGE.txt`, such as `Docs: Promote the v0.15.0 WebUI overhaul release to active milestones`. Check commit state per `AGENTS.md` first; if an uncommitted entry for other work is there, ask instead of replacing it. One bullet names the milestones and their new IDs, one notes the released version's checklist items removed, then one bullet per substantive correction with its reason. No changelog entry; planning changes nothing user-visible.

End with the IDs assigned, the checklist items removed, each correction made, any figure that was not re-measured and why, the checker result, and the first milestone to start.
