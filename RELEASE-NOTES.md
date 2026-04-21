<!-- markdownlint-disable MD024 -->
# GitHub Release Notes

**Release Notes Style Guide**

Use this document for public GitHub releases. Rules:

- **Write a catchy release title.** A short, creative subtitle that captures the personality of the release — think 2–5 words max, punchy and memorable. It doesn't need to list every feature; it should *feel* like the release. Examples: *"Now Leaving Windows-Only,"* *"Packed and Ready,"* *"Everywhere at Once."* Lead with the version number, follow with the subtitle.
- **Lead with impact, not mechanics.** Open each section with why it matters to the user, not what changed in the code. "Move your library without the headache" beats "zip-based export/import with per-source remapping."
- **Write like a person, not a changelog.** Contractions are fine. Short punchy sentences are good. Dry passive voice is not.
- **The intro should earn attention.** One or two sentences that set the mood for the release — what's the big story? Why does this one matter? Don't just restate the title.
- **Group by user benefit, not code area.** "The WebUI got a serious upgrade" is a section. "WebUI changes" is not.
- **Planned Features should read like a teaser, not a ticket backlog.** No implementation details, no technical jargon — just what the user will eventually be able to do.
- **Keep Notes short and practical.** Only include caveats that will actually trip someone up. No boilerplate.
- **One voice throughout.** Confident, direct, slightly informal. Avoid "this release introduces," "we are pleased to announce," and similar filler.

---

## RELEASE NOTES

---

## ReelRoulette v0.11.0 — Cross-Platform Unlocked

This one's been a long time coming.

v0.11.0 brings ReelRoulette to **Linux** as a first-class citizen, makes the **WebUI** feel much closer to the desktop app, and finally gives you a real way to **move your library** between machines without hand-editing files. There's also a lot of quiet reliability work under the hood — the kind that only shows up when things *don't* break.

## What's New

**Linux is here.** Portable tarballs, AppImages, a one-liner GitHub install script, and a local helper for post-build installs. CI builds and packages automatically. If you've been waiting to run ReelRoulette on Linux, now's the time.

**The WebUI got a serious upgrade.** Full-screen filtering with presets and tags, an Auto Tag option sitting right inside the tag overlay next to Edit Tags, and PWA-style installability when you serve over HTTPS — add it to your home screen and it launches like a native app.

**Move your library without the headache.** Export your whole setup — library, settings, presets, thumbnails — as a zip. Import it somewhere else, remap source paths if they changed, and let the server resync. Cross-platform moves (Windows ↔ Linux) just work now, including some previously messy relative path edge cases.

**Refresh pipeline improvements.** Optional fingerprint scanning for items that need it, one-shot Force Rescan for loudness or duration, and a cleaner single-line refresh summary on both desktop and web.

**Launch at login.** Native startup support on both Windows and Linux, including proper handling for XDG session managers and AppImage installs that survive reboots.

## Also in This Release

- **.NET 10** upgrade across the whole stack, including Avalonia 12 for desktop and tray.
- The desktop now fully defers to the **server** for library state — favorites, tags, stats, and refresh all stay in sync properly.
- Clearer **backup responsibilities**: the server owns library backups, the desktop owns its own settings. No overlap, no confusion.
- **Material Symbols** visual refresh on desktop and web, richer duplicate-review previews, and grid performance improvements for large collections.
- Scripted download and verification of FFmpeg and LibVLC for Windows builds.
- Expanded docs: install paths, HTTPS on a tailnet, and Linux packaging.
- Stability fixes across grid, filter, fullscreen (including iOS), file pickers, path imports, and the Windows tray — caught through real-world testing on both platforms.

## What's Coming

- **Tray and PWA polish:** fixes for the Windows tray and Android standalone install behavior (see notes below).
- Better visibility into what the server is doing, with clearer operational feedback.
- Continued UI polish across desktop, web, and Operator.
- More reliable playback from start to finish, with better session continuity.
- An Android client, built on the same API foundation everything else already uses.
- Deeper media pipeline improvements beyond today's refresh and fingerprint tools.

## Verification

Full build, test, and smoke checks passed. Manual validation covered Linux portable and AppImage packaging alongside continued Windows desktop and server scenarios.

## Notes

- **Linux playback** relies on system VLC/LibVLC where packages don't bundle those runtimes. Windows builds continue to stage bundled tools as documented.
- **Linux AppImage + Launch at Startup:** put the server AppImage where you plan to keep it *before* enabling launch at startup — the saved shortcut uses the path at the time you enable it. If you turned autostart on during a pre-release build, toggle it off and back on once to update the menu entry.
- **Windows tray:** The tray icon is currently non-functional on Windows in this release. The server runs correctly; use the Operator UI directly at `http://localhost:{PORT}/operator` in the meantime.
- **Android PWA install:** Install to Home Screen on Android currently adds a shortcut that opens in the browser rather than a standalone shell. Full PWA behavior is working on iOS.

---

## ReelRoulette v0.10.0 — Out of the Terminal

The command prompt window is gone. The server lives in your tray now, like it always should have.

v0.10.0 is a focused polish release — no sweeping feature additions, just the kind of day-to-day improvements that make running ReelRoulette on Windows feel a lot more intentional.

## What's New

**The server is a proper tray app now.** No more floating terminal window. Quick actions for opening the Operator UI, refreshing the library, restarting, and exiting are all right there in the tray menu.

**Startup is less likely to fight your system.** The default port was changed to avoid common conflicts, so fresh installs just work more often out of the box.

**Groundwork for Linux.** Server runtime paths now cleanly support non-Windows hosts — the foundation that makes the Linux release in v0.11.0 possible.

## Also in This Release

- Packaging and scripting alignment so run, package, and verify flows automatically target the right runtime.
- A checklist reset script for cleaner fresh validation passes.

## What's Coming

- Better visibility into what the server is doing, with clearer operational feedback.
- Continued UI polish across desktop, web, and Operator.
- More reliable playback from start to finish, with better session continuity.
- An Android client, built on the same API foundation everything else already uses.
- Linux — coming in the next release.

## Verification

Full build, test, and smoke checks passed. Manual validation covered the Windows tray baseline and packaged runtime behavior.

---

## ReelRoulette v0.9.0 — It Started as a Script

Every app starts somewhere. For ReelRoulette, it was a simple script that picked a random video. This is how far it's come.

v0.9.0 is the first official release — not just a feature milestone, but the end of a long migration from a one-off experiment to a real server-first app with desktop and web clients, operator tools, and proper release packaging.

## What's New

**A solid foundation.** The original random-play concept is now backed by a dedicated server runtime, a desktop client, a web client, and the tooling to keep it all running reliably day-to-day.

**Desktop and web that actually agree.** Consistency between the two clients has been a focus — what you do in one should feel coherent in the other.

**Built to last.** Better error recovery, monitoring, diagnostics, and a streamlined release workflow mean this isn't just feature-complete — it's maintainable.

**Windows packaging out of the box.** Official installer and portable builds for both the server and desktop apps.

## What's Coming

- Better visibility into what the server is doing, with clearer operational feedback.
- Continued UI polish across desktop, web, and Operator.
- More reliable playback from start to finish, with better session continuity.
- An Android client, built on the same API foundation everything else already uses.
- Richer media metadata and expanded sync support.
- Linux distribution support.

## Verification

Full build, test, web verification, and deployment smoke checks passed before sign-off.

## Notes

- This is the first official baseline. Some rough edges remain — that's what v0.10.0 is for.
- Linux support is coming in a future release.
