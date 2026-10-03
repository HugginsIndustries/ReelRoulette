---
name: implement
description: Use whenever asked to implement, build, fix, change, or refactor code, or to work on a milestone or tracked item. Plans the change and stops for confirmation before writing any code.
---

# Implement

Read `AGENTS.md` before starting, then any other repo docs relevant to the task. Follow `AGENTS.md`.

The task is either described directly or named as an item in the project's tracker. If it names a tracked item, read that entry in full — it usually records decisions already settled, and re-litigating them wastes the work that settled them.

## Before planning

**Ask about genuine forks, decide the rest.** Something with a defensible answer either way is mine to pick; something with a clear right answer is yours. Say which is which rather than presenting every detail as a question, and do not silently choose on a fork.

**Measure what can be measured.** If the plan rests on an assumption a command could settle — how something currently behaves, what an option actually does, whether two things produce the same output — settle it before planning rather than building on a guess. Reasoning about code is a hypothesis; running it is a finding. If `AGENTS.md` restricts which commands you may run, follow that.

**Check the size.** If the task is large enough that a failure part-way would be hard to untangle, or spans changes that could be verified independently, propose a split and say where the seams are.

When splitting, record the remaining parts in the project's tracker — enough that each could be picked up cold, including any decisions already settled while planning. A split that leaves the later parts only in this conversation loses them. If the project has no tracker, say so in the plan and wait rather than inventing one.

## The plan

Present it in full and stop. Do not write code until I confirm.

Cover what changes and why, anything that will behave differently afterward, what could break, and how each part will be verified. Name anything you are unsure about rather than smoothing over it.

If the work is split, plan only the first part and record the rest in the project's tracker, so nothing depends on remembering this conversation.

If the user provided a plan file, execute that plan as written. Do not edit the plan file.

## During implementation

Follow the plan. If you hit something that makes it wrong — an assumption that does not hold, a conflict with existing behaviour, a fork nobody anticipated — **stop**. Describe the problem, give the options with their costs, recommend one, and wait.

Do not work around a blocker silently. Do not adjust a test, a fixture, or a default to make something pass.

Do not edit `AGENTS.md` unless the user explicitly asks you to. If a rule there blocks the task, report it and stop rather than changing it yourself.

Keep the project's tracker and docs in the state `AGENTS.md` (and any docs it points at) require — complete what this change finishes, record anything deferred, and update current-state docs the project says to keep in sync. Do not invent extra docs.

## Verification

Follow the project's usual verification workflow. Run the tests it uses, and verify the actual behaviour rather than only that the code looks right. Where a change is meant to preserve something, prove it.

A test that would pass whether or not the fix works is not verification. Check that it fails when the thing it guards is broken.

If the project gates later steps (cutover, removal, deploy) on explicit approval, stop after automated verification and wait.

## Final summary

What changed, and what now behaves differently.

**Anything that deviated from the plan, with the reasoning.** This matters more than the rest of the summary.

Anything learned along the way that was not part of the task — a bug found in passing, an assumption that turned out wrong, something adjacent that looks fragile.

The outcome of verification — what was run, what passed, and the measured result where a claim was proven rather than merely tested.
