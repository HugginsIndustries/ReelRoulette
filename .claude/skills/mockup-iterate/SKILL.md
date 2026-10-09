---
name: mockup-iterate
description: Apply the user's feedback to an existing interactive HTML mockup and record each settled decision in the project's planning docs. Use this whenever the user sends notes, screenshots, approvals, or change requests about a mockup, asks what is still pending in a mockup, wants a gap audit of a mockup against the current code or plans, or wants to finalize a mockup's design, even if they just paste a list of tweaks. For building a new mockup from scratch, use mockup-create.
---

# Iterate on a mockup

Each round turns the user's notes into an updated mockup and an updated plan, and nothing else. Never write or change app code while using this skill.

## 1. Read the round carefully

Sort every item in the user's message into one of:

- **Approval** of something already shown: record it and take it off the pending list.
- **Change**: update the mockup, then record the decision.
- **Bug** in the mockup: fix it (see below).
- **Question**: answer it, with a recommendation.

If an item is ambiguous enough that you'd be guessing at the user's taste, ask before building it. If it conflicts with an earlier recorded decision, point that out rather than silently overriding either.

Re-read the project's agent instructions if you haven't this session, and check the mockup's README and pending list so you know the current state.

## 2. Make the changes

- Match the existing mockup's look and conventions.
- Keep real wording real: if the change affects a label or message, write the actual text.
- Where the user wants to judge something by eye and hasn't settled values, offer tuning controls or a Mockup-tab switch with the options side by side, rather than picking one.
- Don't revert or quietly reinterpret anything already approved. If a request undoes an earlier decision, it replaces that decision in the plan too.

## 3. Fixing bugs

Find the cause before fixing, and explain it in a sentence in the report. Add a check that fails on the bug, confirm it fails before the fix, and passes after. If the same cause can affect other parts of the mockup, say so and fix them only if asked.

## 4. Record decisions

- Write each approved decision into the planning entry for the work that will build it, with acceptance criteria and evidence where the project's plans have them.
- If a decision moves work between planned items, update both.
- If a decision implies something risky in the real app (a contract or API change, data-layer logic, packaging, security, audio, a browser quirk), record it as a trap or caveat in the owning plan, so the implementation doesn't rediscover it.
- Anything you added that the user didn't ask for goes on the pending list, and is listed in the report as a call they may overrule.
- Update the commit message per the project's conventions; start a new entry if the previous one was already committed.

## 5. Check

Rerun the automated check at every width it covers. For each change, add or update checks, and break the behavior on purpose to confirm the check catches it. Report the total, and what a headless check can't see (layout, drawing, sound, real touch) so the user knows what to look at on their devices.

## 6. Report back

Keep it in this order:

1. What changed in the mockup, briefly, item by item.
2. Where each decision was recorded.
3. Calls you made that the user may want to overrule, numbered.
4. Open questions, each with your recommendation.
5. Anything noticed along the way but not changed.
6. Checks run and their results.

## Special requests

- **Pending list:** list everything still pending in the mockup's planning entry, plus anything shown in the mockup that isn't recorded in the plan that builds it.
- **Gap audit:** compare the mockup against (a) today's app behavior that should survive and (b) every planned item that describes something visible. For each gap, say what's missing, where the real behavior lives, and whether it's a simple addition or needs a decision. Change nothing.
- **Finalize:** when nothing is pending and the user approves, mark the mockup's planning entry complete per the project's conventions, and make sure every planned item that builds UI points to the mockup as its design reference. The mockup stays in the repo.
