# Test Milestones

## Planned Releases

Upcoming releases. v1.0.0 closes the M1 series.

- **v1.0.0 — First**: Ship the widget. M1a, M1b, M1c.
- **v1.0.1 — Themes**: Theme the widget. M1e.
- **v1.1.0 — Second**: Ship sharing. P2a, P2b.
- **v1.2.0 — Search**: Search widgets. P4.
- **Unscheduled backlog**: P3.

## Maintenance Rules

- ID references are allowed only in section headers, the `Last milestone completed: Mx` tracker line, and the outline.
- Use `M*` IDs for active work and `P*` IDs for planned work.

## Milestone Template

### Mx - {Milestone Title}

- **Status**: ⏳ Planned | 🚧 In Progress | ✅ Complete
- **Goal**: {one outcome, in a sentence}
- **Depends on**: {exact milestone titles}. Leave out when it depends on none.
- **Design**: {the mockup or design doc it is built to}. Leave out when there is none.

#### Decisions

- {a settled choice that shapes more than one slice, and why}

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| {Name} | ⏳ Planned | {one line} |

#### {Name} slice

**Scope**

- {what this slice builds, and where}

**Traps**

- {a fact that would trip up the implementer} (measured)

**Acceptance**

- {a testable outcome, and the tests that show it}

**Evidence**

- {added when the slice lands}

#### Release checks

- Agent: {a check an agent can verify from the repo, its docs, or the release workflow's runs}
- Manual: {a check that needs a person, real devices, or the Windows VM}

#### Not included

- {a scope boundary}, which is {covering milestone title}. Leave out the "which is" part when no milestone covers it.

---

## Active Milestones

Last milestone completed: M1b

### M1c - Polish the Widget

- **Status**: ⏳ Planned
- **Goal**: Every part of the widget looks finished.
- **Depends on**: the widget build, which defines the parts this polishes, and `Plan.json` Format Cleanup.

#### Scope

- Tidies the widget's spacing and labels.

#### Acceptance

- The widget's layout matches its mockup, in layout tests.

### M1e - Widget Themes

- **Status**: 🚧 In Progress
- **Goal**: The widget offers light and dark themes, picked in its settings.
- **Depends on**: Widget Build, whose parts the themes restyle.
- **Design**: `docs/mockups/widget/`, including its theme picker page.

#### Decisions

- Themes change colors only, so every theme keeps the same layout.
  - Fonts stay the same in every theme too.
- The server stores the picked theme, so every device shows the same one.

#### Slices

| Slice | Status | Delivers |
| --- | --- | --- |
| Palette | ✅ Complete | The light and dark color sets and the code that applies them. |
| Picker | ⏳ Planned | The theme picker in the widget's settings. |

#### Palette slice

**Scope**

- The two color sets in `palette.json`, applied at startup.

**Traps**

- The widget reads `palette.json` only once, at startup (measured).

**Acceptance**

- Each color set applies in full, in palette tests.

**Evidence**

- The palette tests ran and passed.

#### Picker slice

**Scope**

- A theme picker in the settings dialog that saves the choice on the server.

**Acceptance**

- Picking a theme changes the widget's colors at once, in picker tests.

#### Release checks

- Agent: The release notes name both themes.
- Manual: The dark theme is readable on a real phone.

#### Not included

- Searching by theme, which is Widget Search.
- Themes that change fonts.

## Planned Milestones

### P2a - Plan.json Format Cleanup

- **Status**: ⏳ Planned
- **Goal**: `Plan.json` uses one consistent layout.

#### Scope

- Rewrites `Plan.json` in the cleaned-up layout.

#### Acceptance

- Every sample `Plan.json` loads, in format tests.

#### Not included

- Changes to the groundwork, which is Lay the Groundwork, already complete.

### P2b - Widget Sharing, Export, and Import

- **Status**: ⏳ Planned
- **Goal**: A widget can be shared, exported, and imported.
- **Depends on**: Polish the Widget, and Plan.json Format Cleanup.

#### Scope

- Share, export, and import buttons on each widget.

#### Acceptance

- An exported widget imports unchanged, in sharing tests.

### P3 - Someday Feature

- **Status**: ⏳ Planned
- **Goal**: A feature built on sharing, for later.
- **Depends on**: Widget Sharing, Export, and Import, so sharing exists first.

#### Scope

- A feature that works with shared widgets.

#### Acceptance

- The feature works with a shared widget, in feature tests.

#### Not included

- Sharing changes, which is Widget Sharing, Export, and Import. Sharing ships first.

### P4 - Widget Search

- **Status**: ⏳ Planned
- **Goal**: Find a widget by its name.

#### Scope

- A search box above the widget list that filters it by name.

#### Traps

- The widget list holds every widget at once, so search can filter it in place (inferred).

#### Acceptance

- Typing part of a name shows only the widgets whose names contain it, in search tests.

#### Not included

- Searching inside widgets.
