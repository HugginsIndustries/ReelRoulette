# Test Milestones

## Planned Releases

Upcoming releases. v1.0.0 closes the M1 series.

- **v1.0.0 — First**: Ship the widget. M1a, M1b, M1c.
- **v1.1.0 — Second**: Ship sharing. P2a, P2b.
- **Unscheduled backlog**: P3.

## Maintenance Rules

- ID references are allowed only in section headers, the `Last milestone completed: Mx` tracker line, and the outline.
- Use `M*` IDs for active work and `P*` IDs for planned work.

## Milestone Template

### Mx - {Milestone Title}

- **Status**: ⏳ Planned
- **Scope**:
  - Depends on: {milestone title}.

---

## Active Milestones

Last milestone completed: M1a

### M1b - Widget Build

- **Status**: 🚧 In Progress
- **Scope**:
  - Depends on: Lay the Groundwork.
  - Plays MP3 files and talks P2P to other widgets.

### M1c - Polish the Widget

- **Status**: ⏳ Planned
- **Scope**:
  - Depends on: the widget build, which defines the parts this polishes, and `Plan.json` Format Cleanup.

## Planned Milestones

### P2a - Plan.json Format Cleanup

- **Status**: ⏳ Planned
- **Scope**:
  - Planned for v1.1.0.

### P2b - Widget Sharing, Export, and Import

- **Status**: ⏳ Planned
- **Scope**:
  - Planned for v1.1.0. Depends on: Polish the Widget, and Plan.json Format Cleanup.

### P3 - Someday Feature

- **Status**: ⏳ Planned
- **Scope**:
  - Unscheduled. Depends on: Widget Sharing, Export, and Import, so sharing exists first.
