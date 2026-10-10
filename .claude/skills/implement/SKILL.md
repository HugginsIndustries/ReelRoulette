---
name: implement
description: Use whenever asked to implement, build, fix, change, or refactor code, or to work on a milestone or tracked item. Plans the change and stops for confirmation before writing any code.
---

# Implement

Follow `AGENTS.md`. Read any other repo docs relevant to the task.

The task is either described directly or named as an item in `MILESTONES.md`. If it names a tracked item, read that entry in full — it usually records decisions already settled, and re-litigating them wastes the work that settled them.

## Before planning

**Ask about genuine forks, decide the rest.** A choice with a defensible answer either way is the user's to make; one with a clear right answer is yours. Say which is which rather than presenting every detail as a question, and do not silently choose on a fork.

**Measure what can be measured.** If the plan rests on an assumption a command could settle — how something currently behaves, what an option actually does, whether two things produce the same output — settle it before planning rather than building on a guess. Reasoning about code is a hypothesis; running it is a finding. If `AGENTS.md` restricts which commands you may run, follow that.

**Check the size.** If the task is large enough that a failure part-way would be hard to untangle, or spans changes that could be verified independently, propose a split and say where the seams are.

When splitting, record the remaining parts in `MILESTONES.md` — enough that each could be picked up cold, including any decisions already settled while planning. A split that leaves the later parts only in this conversation loses them.

## The plan

Present it in full and stop. Do not write code until the user confirms.

Cover what changes and why, anything that will behave differently afterward, what could break, and how each part will be verified. Name anything you are unsure about rather than smoothing over it.

If the work is split, plan only the first part and record the rest in `MILESTONES.md`, so nothing depends on remembering this conversation.

If the user provided a plan file, execute that plan as written. Do not edit the plan file.

The plan has a **Delegation** section: which subagents ran during planning and what each settled, or that none ran and why; and for implementation, which parts go to which subagents (each implementer slice with the files it owns, verifier runs, investigators), or that everything stays in this session and why.

## During implementation

Follow the plan. If you hit something that makes it wrong — an assumption that does not hold, a conflict with existing behaviour, a fork nobody anticipated — **stop**. Describe the problem, give the options with their costs, recommend one, and wait.

Do not work around a blocker silently. Do not adjust a test, a fixture, or a default to make something pass.

Do not edit `AGENTS.md` unless the user explicitly asks you to. If a rule there blocks the task, report it and stop rather than changing it yourself.

Keep `MILESTONES.md` and docs in the state `AGENTS.md` (and any docs it points at) require — complete what this change finishes (a completed milestone moves to the top of `MILESTONES-COMPLETED.md`), record future work and scope boundaries as the maintenance rules in `MILESTONES.md` describe, and update current-state docs the project says to keep in sync. Do not invent extra docs.

For milestone work, when a slice lands, set its row in the Slices table to its new status, keep the entry's Status in step with its slices, and add the slice's Evidence part. List a check for the pre-release pass in the entry's Release checks: an `Agent:` bullet when an agent can verify it from the repo, its docs, or the release workflow's runs, and a `Manual:` bullet when it needs a person, real devices, or the Windows VM. When the milestone completes, copy its Release checks into the Release Specific section of the testing checklist, under Agent checks or Manual checks, before moving the entry. Outside a milestone, such a check goes straight into that section.

## Delegating

Delegation never replaces the plan stop: nothing goes to a subagent that writes until I've confirmed the plan.

- Before planning, measurements that don't depend on each other's results go to `investigator` subagents in parallel rather than running one after another in this session. Keep a measurement here only when the next step depends on its result or it's a single quick command.
- After confirmation, parts of the plan that are independent and touch disjoint files may go to `implementer` subagents, each given its slice verbatim, with the milestone entry's Decisions when the work is a milestone, the exact files it owns, and how to verify it. Parallel implementers never share a file. Keep sequential or tightly coupled work, and anything small, in this session.
- An implementer that stops on a problem is a blocker under "During implementation": stop and bring it to me.
- This session alone edits the tracker, changelog, commit message, and docs, and writes the final summary. Read each implementer's report, review its changes in the diff, and carry its deviations into the summary.
- Use `verifier` for verification runs, and check what it reports before fixing anything.

## Verification

Run the checks the change touches: `dotnet build ReelRoulette.sln` and `dotnet test ReelRoulette.sln` for code, `npm run verify` for WebUI or contract changes, and SystemChecks for Core changes. Verify the actual behaviour rather than only that the code looks right. Where a change is meant to preserve something, prove it.

A test that would pass whether or not the fix works is not verification. Check that it fails when the thing it guards is broken.

If the project gates later steps (cutover, removal, deploy) on explicit approval, stop after automated verification and wait.

## Final summary

What changed, and what now behaves differently.

**Anything that deviated from the plan, with the reasoning.** This matters more than the rest of the summary.

Anything learned along the way that was not part of the task — a bug found in passing, an assumption that turned out wrong, something adjacent that looks fragile.

The outcome of verification — what was run, what passed, and the measured result where a claim was proven rather than merely tested.

Which subagents ran and for what, and anything they reported that changed the work.
