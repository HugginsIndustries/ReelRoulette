# Temporary Checklist: M8h Remaining Work

This is a temporary implementation tracker for milestone `M8h`.
It captures what appears complete now and what still needs implementation/verification.

## Completion Snapshot

- Date: 2026-03-14
- Milestone status in `MILESTONES.md`: In Progress

## Completed (observed in repo)

- [x] Desktop Material Symbols font asset is present and documented under `assets/fonts/`.
  - Evidence: `assets/fonts/MaterialSymbolsOutlined.var.ttf`
  - Evidence: `assets/fonts/README.md`
- [x] Desktop app wires the Material Symbols font asset into Avalonia resources.
  - Evidence: `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj`
- [x] Shared desktop icon style foundation exists.
  - Evidence: `TextBlock.MaterialSymbolIcon` style in `src/clients/desktop/ReelRoulette.DesktopApp/App.axaml`
  - Evidence: `Button.IconGlyphBase` + `ToggleButton.IconGlyphBase` base styles in `src/clients/desktop/ReelRoulette.DesktopApp/App.axaml`
  - Evidence: `IconGlyphButton` + `IconGlyphToggle` wrapper behavior in `src/clients/desktop/ReelRoulette.DesktopApp/App.axaml`
- [x] Main desktop transport/control icons are migrated to shared Material Symbols styles.
  - Evidence: multiple controls in `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml` use `Classes="IconGlyphBase ..."` + `TextBlock.MaterialSymbolIcon`.
- [x] Desktop tag editor icon controls are migrated to Material Symbols with shared no-box icon styles.
  - Evidence: `src/clients/desktop/ReelRoulette.DesktopApp/ItemTagsDialog.axaml`
  - Evidence: category expand/collapse symbol swapping via `ExpandIconSymbol` in `src/clients/desktop/ReelRoulette.DesktopApp/ItemTagsDialog.axaml.cs`
  - Evidence: rounded category headers and responsive variable-width tag chips with multiline tag wrapping in `src/clients/desktop/ReelRoulette.DesktopApp/ItemTagsDialog.axaml`
- [x] Keep selected desktop emoji/text icon surfaces as-is by UX choice.
  - Confirmed acceptable to leave existing emoji indicators in:
    - `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml` (library context menu/list indicators)
    - `src/clients/desktop/ReelRoulette.DesktopApp/ManageSourcesDialog.axaml`

## Remaining Implementation Work

- [x] Implement Avalonia server tray context-menu system theme parity (light/dark at runtime, Windows where supported).
  - Current state: `src/core/ReelRoulette.ServerApp/Hosting/AvaloniaTrayHostUi.cs` provides the native menu surface; theme parity handling is validated via tray host behavior.

- [x] Migrate WebUI icon system to Material Symbols using the same local font file (no external font links).
  - [x] Add WebUI font asset path using shared repo font:
    - source of truth: `assets/fonts/MaterialSymbolsOutlined.var.ttf`
    - runtime-served path for WebUI should be local (for example `/assets/fonts/MaterialSymbolsOutlined.var.ttf`), not Google Fonts/CDN.
  - [x] Add `@font-face` + shared icon class contract in `src/clients/web/ReelRoulette.WebUI/src/styles.css` (Material Symbols family, size/weight/alignment).
  - [x] Add reusable WebUI icon button styles matching desktop intent (`IconGlyphBase`/momentary/toggle behavior): transparent/no-box baseline, hover/pressed/disabled/active states.
  - [x] Ensure build/dev copies font into WebUI static assets (extend existing sync pattern used by `scripts/sync-shared-icon.mjs`; no remote dependency).

- [x] Migrate WebUI playback overlay controls to desktop-equivalent symbols + style.
  - [x] `#favorite-btn`: `favorite`
  - [x] `#blacklist-btn`: `thumb_down`
  - [x] `#prev-btn`: `skip_previous`
  - [x] `#play-btn`: explicit play/pause swap using `play_arrow` and `pause`
  - [x] `#next-btn`: `skip_next`
  - [x] `#tag-edit-btn`: `tag`
  - [x] `#loop-btn`: `repeat_one`
  - [x] `#autoplay-btn`: `autoplay`
  - [x] `#fullscreen-btn`: `fullscreen`
  - [x] Keep existing aria-label/title behavior unchanged while replacing glyph rendering.

- [x] Migrate WebUI Tag Editor header/footer controls to desktop-equivalent symbols + style.
  - [x] `#tag-editor-add-category-btn`: `add` (icon action)
  - [x] `#tag-editor-refresh-btn`: `refresh`
  - [x] `#tag-editor-close-btn`: `close`
  - [x] `#tag-editor-add-tag-btn`: `add` (icon action)
  - [x] `#tag-editor-apply-btn`: `save`
  - [x] Keep footer layout parity from desktop intent (category action + category select + input + add/apply controls).

- [x] Migrate WebUI Tag Editor category-row controls (dynamic in `src/clients/web/ReelRoulette.WebUI/src/app.js`).
  - [x] expand/collapse toggle: `keyboard_arrow_right` / `keyboard_arrow_down` (swap by collapsed state)
  - [x] category move up: `arrow_drop_up`
  - [x] category move down: `arrow_drop_down`
  - [x] category edit: `edit_note`
  - [x] category delete: `delete`
  - [x] Add desktop-style category header bars/boxes in WebUI tag editor to visually separate each category section (match desktop category row container treatment).

- [x] Migrate WebUI tag-chip action buttons (dynamic in `src/clients/web/ReelRoulette.WebUI/src/app.js`).
  - [x] plus button: `add`
  - [x] minus button: `remove`
  - [x] edit button: `edit_note`
  - [x] delete button: `delete`
  - [x] Keep chip state semantics (`state-all|state-some|state-none`, selected-action styling) unchanged.
  - [x] Match desktop tag-editor color values exactly (not approximate) by defining reusable shared WebUI color tokens for the same palette (`HugginsOrange`, `LimeGreen`, `Violet`, and related state/hover/pressed variants) and applying those tokens across tag-chip/action styles.

- [x] Verify full WebUI icon-surface migration (no remaining emoji icon render paths).
  - [x] `src/clients/web/ReelRoulette.WebUI/src/shell.ts` has no emoji icon literals in control buttons.
  - [x] `src/clients/web/ReelRoulette.WebUI/src/app.js` dynamic icon assignments no longer use emoji.
  - [x] `src/clients/web/ReelRoulette.WebUI/src/styles.css` includes Material Symbols font/class + shared icon button/toggle classes.

## Remaining Verification Evidence

- [x] Run automated verification gates:
  - `dotnet build ReelRoulette.sln`
  - `dotnet test ReelRoulette.sln`
  - `npm run verify` in `src/clients/web/ReelRoulette.WebUI`
- [x] Capture manual evidence artifacts:
  - tray menu in Windows light mode
  - tray menu in Windows dark mode
  - desktop full icon-surface migration in light/dark themes
  - WebUI full icon-surface migration in light/dark themes
  - icon-source evidence referencing `assets/fonts/MaterialSymbolsOutlined.var.ttf`

## Deferred (already called out in milestone)

- Windows tray menu item icons are deferred to a follow-up milestone.
- Linux tray theme/icon parity remains best-effort unless explicitly expanded.
