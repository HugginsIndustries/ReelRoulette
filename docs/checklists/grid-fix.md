# Desktop Library Grid Responsiveness Fix Checklist (Temporary)

This temporary checklist tracks fixes for desktop library panel grid issues:

- grid rows not adapting cleanly to panel width changes (blank space or right-edge cutoff)
- UI updates not appearing until scrolling away/back

## Scope

- Target: `src/clients/desktop/ReelRoulette.DesktopApp/MainWindow.axaml.cs`
- Focus area: grid row layout width calculation, visible-row virtualization refresh, width-change reflow timing

## Implementation Checklist

- [x] Switch library panel list + grid to non-overlay vertical scrollbars first.
  - Apply to both grid (`LibraryGridScrollViewer`) and list (`LibraryListBox` internal `ScrollViewer`) so scrollbar width is always reserved (no hover-expand overlap).
  - Use fixed, non-auto-hide scrollbar behavior/width for deterministic layout.

- [x] Update grid row width calculation to be viewport-driven.
  - Compute row layout width from `LibraryGridScrollViewer.Viewport.Width` when available, with bounds fallback only when viewport is unavailable.
  - Remove the fixed `24px` right-side subtraction after non-overlay scrollbar behavior is in place.

- [x] Make width-change reflow deterministic during panel resize.
  - In `LibraryPanelContainer_SizeChanged`, schedule/debounce rebuild at render-friendly timing.
  - Cancel superseded queued reflows during rapid drag-resize.
  - Rebuild rows from current items using finalized measured width.

- [x] Ensure visible rows refresh even when visible index range is unchanged.
  - Add a force-refresh path for `UpdateLibraryGridVisibleRowsWindow(...)` (or equivalent row-version invalidation).
  - Rebuild `_libraryGridVisibleRows` when row content/widths change, even if start/end indexes are unchanged.

- [x] Keep viewport stability and virtualization performance.
  - Preserve anchor/inset restoration and clamp restored offset to current extent.
  - Keep top/bottom spacer virtualization and overscan behavior.
  - Avoid full panel refresh paths unless required.

## Acceptance Criteria

- [x] Expanding/shrinking library panel width in grid view does not leave large right-side blank space.
- [x] Grid tiles do not clip/cut off at the right edge after width changes.
- [x] Tag/favorite/blacklist/play-state visual updates apply immediately without needing manual scroll nudge.
- [x] No regressions in scroll smoothness or anchor restoration during long-list scrolling.

## Manual Verification

- [x] Open desktop app in library grid view with enough items to scroll.
- [x] Drag library/video splitter narrower and wider repeatedly; confirm rows re-pack cleanly each time.
- [x] Trigger state-changing updates (favorite, blacklist, tag edits) while visible; confirm immediate repaint.
- [x] Scroll deep into library, perform an update, and verify viewport anchor remains stable.
- [x] Verify no new warnings/errors in app logs related to grid virtualization refresh paths.
