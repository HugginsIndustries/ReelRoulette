---
name: mockup-create
description: Build an interactive, self-contained HTML mockup of a UI before any app code is written, so design decisions can be made by trying things rather than reading plans. Use this whenever the user wants a mockup, prototype, design preview, or wants to "see it before we build it" for a new screen, a redesign, a layout change, or a new app, even if they don't say "mockup". Not for changing an existing mockup in response to feedback; use mockup-iterate for that.
---

# Create an interactive mockup

The goal is a mockup the user can open on every device they care about, click through, and judge by feel. It settles the design before implementation, so implementation work becomes "match the approved mockup". Never write or change app code while using this skill.

## 1. Learn the project first

Before drafting anything, read:

- The project's agent or contributor instructions (AGENTS.md, CLAUDE.md, CONTRIBUTING, or similar), and follow its rules on scratch work, commits, and docs.
- The current UI's code: styles, colors, fonts, icons, wording, and behaviors. The mockup should look like the real app's next version, not a generic template.
- The planning docs (milestones, roadmap, issues, or similar) for the work the mockup covers.

Then list, for the user, what today's UI does that should survive (gestures, fullscreen quirks, error states, connection handling, empty states). These are easy to lose in a redesign. Ask about genuine design forks before building; don't guess at things the user clearly has opinions about.

## 2. Where it lives

- A tracked folder, such as `docs/mockups/<name>/`, never a scratch folder: mockups are kept as a record of the approved design.
- A short README: what the pages show, how to rebuild them, and how to serve them to a phone.
- Any build scripts and the automated check (below) live in the same folder.

## 3. How to build it

- **Self-contained pages.** Each page is one HTML file with CSS and JS inline and every asset embedded (data URIs, a subset of the icon font with only the icons used, the project's own logo files). No network requests of any kind. Pages must work opened from a simple file server.
- **Real behavior, not screenshots.** Buttons, panels, dialogs, drag and drop, keyboard shortcuts, gestures, settings, and validation all actually work. A static picture can't tell the user how something feels.
- **Realistic fake data**, generated to match the app: plenty of items, long and short names, edge cases (many tags, empty lists, huge counts), and every content type the app handles (for example both videos and photos). Use stand-ins for media, such as drawn scenes or a generated test tone, when real media isn't available.
- **Real wording.** Write the actual labels, messages, and confirmations the app would show; they are part of what gets approved.
- **Both themes and both form factors** if the app has them: desktop and phone widths, touch and mouse, light and dark.

## 4. The Mockup tab

Add a small, clearly marked panel (for example a dashed magenta tab on the screen edge, labeled "Mockup") that is obviously not part of the app. Use it for:

- **Open design questions as switches**, so the user can compare options live instead of imagining them.
- **Situations that are hard to reach**: server offline or reconnecting, empty data, errors, permission prompts, a phone held sideways, a read-only capability.
- **Events**: simulate something arriving from elsewhere (a sync from another device, a background job finishing).
- **Tuning controls** (sliders with live values) for anything judged by eye, such as animation timing, blur, or opacity, so the user can dial in values and send back the numbers.
- **"Hide mockup notes"**, which hides every mockup-only note and marker except the tab itself, so screens can be seen exactly as they'd ship.
- **Reset** for any remembered state.

Mockup-only notes in the pages use the same distinct style, so they can never be mistaken for app UI.

## 5. Check it automatically

Write a headless check (for example with happy-dom or jsdom) that loads each page at desktop and phone widths and drives the main interactions. Then prove the checks work: break a few behaviors on purpose and confirm the matching check fails each time. Be explicit with the user about what a headless check can't see: layout, colors, drawing, sound, real touch, and browser quirks. Those are for their eyes on real devices.

## 6. Record decisions as they settle

- Every decision the user approves is written into the planning doc for the work that will build it, not only into the mockup.
- The mockup's own planning entry (or README) keeps a **pending list**: everything shown in the mockup that the user hasn't approved yet. Anything you add beyond what was asked goes on it.
- Follow the project's commit-message and doc conventions. Commit nothing yourself unless the project's rules allow it.

## 7. Report back

End with:

- what the pages show and how to open them (the serve command below);
- the choices you made that the user may want to overrule, numbered;
- open questions, each with your recommendation;
- what the automated check covered and what it can't see.

Serving to a phone on the same network or over a VPN such as Tailscale:

```bash
python3 -m http.server 8000 --directory docs/mockups/<name>
```

Plain HTTP is fine for a mockup.
