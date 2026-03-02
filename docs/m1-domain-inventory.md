# M1 Domain Inventory

## Pure Domain Logic (migrate into core)

- Randomization engine/state:
  - `source/RandomSelectionEngine.cs` (now adapter over core randomization engine).
- Filter-set construction and tag/category match semantics:
  - `source/FilterService.cs` (now adapter over core filter builder).
- Tag/preset mutation semantics:
  - `source/LibraryService.cs` (`RenameTag`, `DeleteCategory`, `DeleteTag`, preset tag updates) now routed through core tag mutation service.
- Fingerprint utilities:
  - `source/FileFingerprintService.cs` now delegates to core fingerprint service.
  - Duplicate grouping in `source/LibraryService.cs` now uses core fingerprint duplicate helper.

## IO / Service Adapters (remain desktop-side during M1)

- File system access and persistence:
  - `LibraryService` load/save, source refresh, backup management.
- Background queue orchestration:
  - `FingerprintCoordinator` lifecycle and progress events.
- App settings and JSON schema compatibility management.

## UI Orchestration (desktop-specific)

- Avalonia windows/dialogs and playback controls.
- Web remote host wiring currently embedded in desktop project.
