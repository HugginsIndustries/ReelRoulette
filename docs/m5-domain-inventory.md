# M5 Domain Inventory

## Pure Domain Logic (API-client migration boundary)

- Server filter-session projection contract/state:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` (`FilterSessionSnapshot`, `FilterPresetSnapshot` DTOs).
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (filter-session snapshot storage + `filterSessionChanged` event publication).
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (`GET/POST /api/filter-session` endpoint mapping).

## IO / Service Adapters (desktop API seam)

- Desktop API client adapter:
  - `source/CoreServerApiClient.cs` (typed HTTP query/command calls and SSE stream parsing for worker/server boundary).
- Desktop API-first flow orchestration:
  - `source/MainWindow.axaml.cs` (API-required favorite/blacklist/playback/random command routing and SSE subscription lifecycle with reconnect behavior).

## UI Orchestration (desktop-specific projection)

- Desktop projection synchronization:
  - `source/MainWindow.axaml.cs` (`ApplyRemoteItemStateProjection`, SSE envelope handling, filter-session sync trigger points from preset/filter flows).
- Legacy mutation containment:
  - `source/MainWindow.axaml.cs` (`IWebRemoteApiServices` mutation methods now delegate through API-first update path instead of directly owning primary mutation writes).
