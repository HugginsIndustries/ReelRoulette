---
name: pre-release
description: Use only when the user explicitly asks to prepare a release, start the pre-release testing pass, or finish it after their manual checks. Consolidates the changelog, drafts release notes, resets the testing checklist and runs its automated and agent checks; after the user's manual pass, sets the final version, cuts the changelog, removes the release from Planned Releases, and fills in the release notes' verification. Never commits or tags.
---

# Pre-release

Follow `AGENTS.md`. Read `CHANGELOG.md`, `RELEASE-NOTES.md`, and `docs/checklists/testing-checklist.md` in full.

The user starts this skill twice: once to prepare and test (Part 1), and again after their manual pass to finish the release (Part 2). Work out which from what they ask; if unclear, ask. Between the two, the version stays a dev version so fixes can ship as dev builds.

# Part 1: Prepare and test

## Inputs

You need the version being prepared (for example `0.14.0`) and the release name. If the user didn't give a name, propose two or three that follow the release notes style guide and ask. The changelog section title uses the same release name.

## Guard: never wipe an unfinished pass

Before changing anything, check the checklist. If any box is ticked and the Sign-Off section has no overall result marked, a previous pass is unfinished: stop, say what would be lost, and ask before continuing.

## 1. Consolidate `[Unreleased]`

Rewrite `[Unreleased]` to follow the style note at the top of `CHANGELOG.md`: one user-visible outcome per bullet, a few sentences at most, related work combined, no implementation edge cases or internal terms. Keep every user-visible outcome. Before dropping an item as internal or unchanged, check it against the previous release's behavior; anything users would notice stays as a short clause. Do not cut it into a release section yet.

## 2. Draft the release notes

Add the new entry to `RELEASE-NOTES.md`, following the style guide at the top of that file, based on `[Unreleased]`. It's for users: no file paths, project names, or internal terms. The entry's heading is `## v{VERSION} — {Release Name}`, matching the GitHub release title. Check each claim against the changelog and, where unsure, against the code. Leave the Verification section as `<!-- TODO: manual validation -->`; Part 2 fills it in.

## 3. Reset the checklist

First check that `.version`, without any `-dev.N` suffix, is newer than the latest released version in `CHANGELOG.md`. If it isn't, stop and ask the user to set the dev version for the release being prepared; do not reset the checklist.

Run `pwsh ./tools/scripts/reset-checklist.ps1`. It fills Release version from `.version` without the `-dev.N` suffix; check that it names the version being prepared. Fill Tester from `git config user.name`, and Environment with the standard setup below. Show it to the user and ask only whether anything differs this time.

Standard environment: CachyOS desktop (desktop app, server, WebUI in Firefox); CachyOS laptop on home LAN (WebUI in Firefox via .local); Pixel 8 Pro (WebUI in Firefox over Tailscale); iPad Pro 13-inch M4 (WebUI installed from Safari, over Tailscale); Windows 11 VM (desktop and server, Setup.exe install and in-app update from the previous release)

## 4. Automated checks

Run each item in the Automated Checks section, in order. Tick a box only for a check you ran and saw pass. Never tick on assumption or from an earlier run.

- If a check fails, leave it unticked and add a sub-bullet: `Failed:` plus one line saying what failed and where.
- If a check is marked as skipped (for example pending a backlog item), leave it unticked and add `Skipped:` with the reason.
- For docs-review items, do the review. Tick only if you found no problems; otherwise list each problem as a sub-bullet. For `MILESTONES.md`, start from the milestones checker item's result and review the rest by reading. `MILESTONES-COMPLETED.md` is history: the checker guards it, so don't review it for current behavior.

Run the automated checks through `verifier` subagents, and give any audit that spans many files, such as the mockup gap audit, to an `investigator`. Review their reports yourself before writing Part 1's results; everything else in Part 1 stays in this session.

## 5. Release-specific coverage

Check that the Release Specific section holds only this release's items; `promote-milestones` clears the previous release's when it promotes the next one. List any item from an earlier release and ask about it rather than removing it. Compare the section with the user-visible changes in `[Unreleased]`. For any user-visible change with no matching check, propose a one-line check in the group it belongs to and ask before adding it.

Then verify each item under Agent checks as it describes, from the repo, its docs, or the release workflow's runs for this version's dev builds (`gh run list`, `gh run view`). Tick one only when you verified it and it passed. A failure gets a `Failed:` note as in step 4. One that can't be verified yet, for example because this version has no release run, stays unticked with a `Pending:` sub-bullet that says why; Part 2 verifies it. Do not tick anything under Manual checks, in Smoke, or in Release Flow's in-app update items.

## Part 1 summary

End with: what changed (changelog consolidation, release notes draft), what passed, what failed, what was skipped and why, which agent checks are pending and why, any release-specific gaps, and what is left for the user's manual pass. Remind the user that test builds go out as dev versions (`v{VERSION}-dev.N`) until Part 2. Write a `COMMIT-MESSAGE.txt` entry for the preparation, following `AGENTS.md`.

# Part 2: Finish

Run this after the user says their manual pass is done.

1. Verify each Agent check that has a `Pending:` note, as in Part 1 step 5. When it passes, tick it and remove the note; when it fails, replace the note with `Failed:`. If one still can't be verified, keep the note and say why.
2. Read the checklist as the user left it. List any unticked item that has no `Failed:` or `Skipped:` note, other than the Release Flow items this part ticks, and ask about each before going on.
3. Check that every failure and skip points to a backlog item in `MILESTONES.md`. List any that don't.
4. Re-check `[Unreleased]` against the style note, since fixes made during testing may have added to it, and update the release notes draft to match.
5. Set the final version with `pwsh ./tools/scripts/set-release-version.ps1 -Version v{VERSION} -NoRunVerify`, and show what it changed.
6. Cut the changelog with `pwsh ./tools/scripts/cut-changelog.ps1 -Version {VERSION} -Name "{Release Name}"`. It moves `[Unreleased]` into `## [{VERSION}] — {Release Name} (YYYY-MM-DD)` with today's date, keeping only headings that have entries, leaves a fresh `[Unreleased]` with every heading empty, and updates the footer compare links. If it refuses, fix what it reports and run it again. Show what it changed.
7. Remove the released version's line from the Planned Releases outline in `MILESTONES.md`, then run `pwsh ./tools/scripts/check-milestones.ps1 -BaseRef HEAD` and fix what it reports. If it reports one of this release's milestones missing from the outline, that milestone didn't finish: ask where it goes rather than choosing. Say what you ran and its result.
8. Fill in the release notes' Verification section from the checklist: what was tested and where (from Environment), and any failures or skips users should know about, in plain language. Replace the TODO comment, and check the whole entry against the style guide once more.
9. Tick the Release Flow items you verified: version, changelog cut and fresh headings, footer links, and release notes. Leave the in-app update items; they're the user's. CI is checked after the commit, so it is not a box in this list.
10. Update the `COMMIT-MESSAGE.txt` entry for the final commit, following `AGENTS.md`.
11. Tell the user: commit and push, then check CI passes on that commit on Linux and Windows (offer to check with `gh run list`). Then create the release on GitHub: tag `v{VERSION}` on that commit, title `v{VERSION} — {Release Name}`, and the new `RELEASE-NOTES.md` entry as the body. Creating it tags the commit, runs the release workflow, and attaches the installers. Print the release notes entry in a fenced code block so it can be pasted straight into GitHub.
12. End by naming the next planned release, the first line now in the Planned Releases outline, and pointing to the `promote-milestones` skill to promote it to Active Milestones. If its milestones already have `M*` IDs, it was promoted during this pass: say so instead.

# Rules

- Do not tick manual checks, and do not touch the Sign-Off section; those are the user's.
- Do not commit, tag, or push.
