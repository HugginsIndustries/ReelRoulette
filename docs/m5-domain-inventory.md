# M5 Domain Inventory

## Pure Domain Logic (API-client migration boundary)

- Server preset catalog contract/state:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` (`FilterPresetSnapshot` DTO).
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (preset catalog storage + persistence).
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (`GET/POST /api/presets` endpoint mapping).

## IO / Service Adapters (desktop API seam)

- Desktop API client adapter:
  - `source/CoreServerApiClient.cs` (typed HTTP query/command calls and SSE stream parsing for worker/server boundary).
- Desktop API-first flow orchestration:
  - `source/MainWindow.axaml.cs` (API-required favorite/blacklist/playback/random command routing and SSE subscription lifecycle with reconnect behavior).

## UI Orchestration (desktop-specific projection)

- Desktop projection synchronization:
  - `source/MainWindow.axaml.cs` (`ApplyRemoteItemStateProjection`, SSE envelope handling, preset-catalog sync trigger points from preset/filter flows).
- Legacy mutation containment:
  - Legacy embedded `IWebRemoteApiServices` bridge methods were removed during M7d retirement; desktop now uses only API-first command/query orchestration for migrated paths.
