# M2 Domain Inventory

## Pure Domain Logic (centralized in core services)

- Storage abstractions and atomic update semantics:
  - `src/core/ReelRoulette.Core/Abstractions/CoreInterfaces.cs` (`IAtomicUpdateStorageService<T>`, storage contracts).
- JSON-backed storage services:
  - `src/core/ReelRoulette.Core/Storage/JsonFileStorageService.cs` (load/save/update with temp-write/replace safety).
  - `src/core/ReelRoulette.Core/Storage/CoreStorageServices.cs` (typed library/settings storage wrappers).
- Runtime state services:
  - `src/core/ReelRoulette.Core/State/RuntimeStateServices.cs` (randomization scope state, filter session state, playback session primitives).
- Shared verification module:
  - `src/core/ReelRoulette.Core/Verification/CoreVerification.cs` (reusable checks for unit + harness flows).

## IO / Service Adapters (desktop/web integration points)

- Library persistence now routed through core-backed storage adapter:
  - `source/LibraryService.cs` (load/save path delegates to core storage service).
- Settings and dialog-bounds persistence now routed through core-backed storage adapter:
  - `source/MainWindow.axaml.cs` (`LoadSettings`, `SaveSettings`, dialog bounds helpers use core storage service).
- Legacy filter-state persistence path routed through core-backed storage adapter:
  - `source/FilterStateService.cs`.
- Web per-client randomization state ownership routed through core state service:
  - `source/WebRemote/ClientSessionStore.cs`.

## UI Orchestration (desktop-specific)

- Avalonia UI behavior and media rendering remain desktop-owned:
  - `source/MainWindow.axaml.cs` (UI controls, playback rendering, event handling).
- Desktop continues to orchestrate feature flows while delegating state/persistence concerns to core adapters.
