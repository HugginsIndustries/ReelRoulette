---
name: report
description: Use when the user asks a question about this project — how something works, why it is the way it is, whether an approach would work, or what a change would cost — and wants findings, not changes. Do not use when the user asks for a change to be made.
---

# Report

Read `AGENTS.md` before starting, then any other repo docs relevant to the question. Follow `AGENTS.md`.

Answer the question. **Report only — write no code beyond throwaway experiments needed to establish a fact.** No changes to any tracked file.

## Measure rather than reason

An answer derived from reading code is a hypothesis. An answer derived from running something is a finding. Where a question can be settled by running a command, run it and give the numbers — unless `AGENTS.md` restricts which commands you may run, in which case follow that and say what you could not measure.

Say which of your claims are measured and which are inferred. If you cannot measure something, say so rather than presenting an inference as a fact.

## Shape the answer to the question

Any question about the project is in scope — how something should be done, why it is the way it is, whether an approach would work, what a change would cost, what the tradeoffs are, what a piece of code actually does. The two shapes below cover most of them; use whichever parts fit and ignore the rest.

### When the question is about a decision or an approach

Give the options, including ones I have not suggested. For each: what it costs, what it forecloses, and where it breaks down.

Recommend one, and say what would change your mind.

Flag anything that conflicts with existing behaviour, an invariant in `AGENTS.md`, or a decision already recorded in the project's tracker or other docs.

Say what is genuinely undecided and needs my call rather than picking for me.

### When the question is about why something is as it is

Establish it, do not reconstruct it. Check git history, run the code, read the tests. The code's apparent intent is not evidence of anything.

Distinguish deliberate from incidental. Something can be that way because it was decided, because it was inherited, or because nobody looked — and those have different implications for changing it.

If the answer is "no reason, it just ended up that way", say that. If you cannot tell, say that too.

## Both

Report anything you find along the way that is wrong, even if unrelated to the question.

Keep it proportionate. A small question gets a short answer.
