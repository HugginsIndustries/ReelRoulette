# M6b Domain Inventory

## Pure Domain Logic (refresh pipeline + settings/status contracts)

- Refresh and thumbnail API contracts:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` (`RefreshStart*`, `RefreshSettingsSnapshot`, `RefreshStatusSnapshot`, `RefreshStageProgress`, `RefreshStatusChangedPayload`).
  - `shared/api/openapi.yaml` (`/api/refresh/start`, `/api/refresh/status`, `/api/refresh/settings`, `/api/thumbnail/{itemId}` and schema surface).
- Core pipeline orchestration:
  - `src/core/ReelRoulette.Server/Services/RefreshPipelineService.cs` (single-run lock, manual/auto run handling, strict stage sequencing, status snapshots, overlap rejection semantics, thumbnail invalidation policy, settings persistence/load, SSE projection publishing).
  - Thumbnail artifacts are generated into local app-data storage with index metadata (`revision`, `width`, `height`, `generatedUtc`) for invalidation and layout projection.
- Server runtime options:
  - `src/core/ReelRoulette.Server/Hosting/ServerRuntimeOptions.cs` (`AutoRefreshEnabled`, `AutoRefreshIntervalMinutes` defaults/clamping).
  - `src/core/ReelRoulette.Server/appsettings.json`, `src/core/ReelRoulette.Worker/appsettings.json` (core refresh defaults).

## IO / Service Adapters (host composition + desktop API client)

- Server endpoint composition + DI wiring:
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (refresh/thumbnail route mapping and service registration).
  - `src/core/ReelRoulette.Server/Program.cs`, `src/core/ReelRoulette.Worker/Program.cs` (runtime options registration + shared host composition use).
- SSE event bridge:
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (`PublishExternal` helper for pipeline-originated event publication).
- Desktop API adapter:
  - `source/CoreServerApiClient.cs` (`StartRefreshAsync`, `GetRefreshStatusAsync`, `GetRefreshSettingsAsync`, `UpdateRefreshSettingsAsync` plus DTOs).

## UI Orchestration (desktop refresh UX + list/grid rendering)

- Manage Sources integration:
  - `source/ManageSourcesDialog.axaml.cs` (refresh button now triggers core refresh start via injected API callback; no local source refresh execution path).
  - `source/MainWindow.axaml.cs` (`RequestCoreRefreshAsync` callback wiring and status projection).
- Refresh SSE/status projection:
  - `source/MainWindow.axaml.cs` (`refreshStatusChanged` handler, status snapshot fetch/projection, refresh settings sync/push to core).
- Grid/list rendering and thumbnails:
  - `source/MainWindow.axaml` (list/grid toggle placement and grid view markup).
  - `source/MainWindow.axaml.cs` (persisted grid mode, justified responsive layout composition, thumbnail path/metadata projection, grid click navigation).
  - `source/LibraryGridRowViewModel.cs`, `source/LibraryGridTileViewModel.cs`, `source/LibraryItem.cs` (`ThumbnailPath` + thumbnail dimension projection properties).
