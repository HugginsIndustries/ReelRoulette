# GitHub Release Notes Template
<!-- markdownlint-disable MD024 -->
Use this template for public GitHub releases. Keep tone user-facing, concise, and non-technical.

## Inputs

- Version: `<x.y.z>`
- Release name: `<Initial Release | Update name>`
- Backstory sentence: `<project origin summary>`
- Release focus summary: `<1-2 sentence migration/evolution summary>`
- What’s New bullets: `<5-8 bullets>`
- Included in This Release bullets: `<4-7 bullets>`
- Planned Features bullets: `<5-10 bullets, no milestone IDs>`
- Verification summary: `<single sentence>`
- Closing notes: `<1-2 bullets>`

## Output

## ReelRoulette v`<version>` - `<Release name>`

Welcome to the `<first/latest>` official ReelRoulette release.

`<Backstory sentence.>`

## Release Focus

`<Release focus summary paragraph 1>`

`<Optional paragraph 2>`

## What’s New

- `<bullet>`
- `<bullet>`
- `<bullet>`
- `<bullet>`
- `<bullet>`

## Included in This Release

- `<bullet>`
- `<bullet>`
- `<bullet>`
- `<bullet>`

## Planned Features

- `<feature bullet, no milestone IDs>`
- `<feature bullet, no milestone IDs>`
- `<feature bullet, no milestone IDs>`
- `<feature bullet, no milestone IDs>`

## Verification

`<Build/test/verification summary in plain language.>`

## Notes

- `<note>`
- `<note>`

---

## RELEASE NOTES

---

## Release Title: v0.9.0 - Initial Release

## ReelRoulette v0.9.0 - Initial Release

Welcome to the first official ReelRoulette release.

What started as a simple script to randomly pick a video has grown into a full app experience with desktop and web clients, a dedicated server runtime, operator tools, and release-ready packaging.

## Release Focus

This release brings together the full journey so far:

- the original random-play concept,
- the move from a monolithic desktop app to a more scalable server-centered architecture,
- and a major reliability/operations push to make ReelRoulette practical for real daily use.

In short: this is the first stable baseline that reflects both the original idea and the complete migration work behind it.

## What’s New

- Stronger, more reliable runtime foundation
- Improved consistency between desktop and web experiences
- Better monitoring, diagnostics, and validation tools
- More resilient recovery and error-handling behavior
- Streamlined release workflow and packaging process
- Official Windows release packaging for both Server and Desktop apps
- CI improvements to keep quality checks consistently green

## Included in This Release

- Early product evolution from the original random video picker concept
- Major migration work from monolithic desktop design to the current architecture
- Hardening and release-readiness work completed for v0.9.0
- Packaging and verification workflow improvements
- Planning groundwork for future Linux distribution support

## Planned Features

- Unified logging pipeline across server and clients with improved diagnostics
- Additional UX polish for desktop and web workflows
- More advanced playback session handling and long-form streaming resilience
- Resume-position and playback continuity improvements across clients
- Android client bootstrap on the existing API foundation
- Expanded metadata sync and richer media metadata support
- Customizable desktop keyboard shortcuts
- Playback analytics and visualization dashboards
- Advanced runtime/cache tuning controls
- Face detection capabilities for photos, then video

## Verification

This release passed full build, test, web verification, and deployment smoke checks before sign-off.

## Notes

- `v0.9.0` is the first official baseline release.
- Linux distribution support is planned for a future release.
