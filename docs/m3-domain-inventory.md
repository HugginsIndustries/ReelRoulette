# M3 Domain Inventory

## Pure Domain Logic (contract-first server seam)

- Server contract models and mapping:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs` (typed query/command/SSE contract models).
  - `src/core/ReelRoulette.Server/Contracts/ApiContractMapper.cs` (contract shaping/mapping helpers).
- Server state/event domain service:
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (in-memory state, revision sequencing, SSE envelope publishing, replay buffer, and state re-fetch projection).
- Contract source of truth:
  - `shared/api/openapi.yaml` (initial M3 query/command endpoints + SSE envelope schema).

## IO / Service Adapters (host + client boundary)

- Thin server endpoint host:
  - `src/core/ReelRoulette.Server/Program.cs` (health/version/presets/random/favorite/blacklist/record-playback/library-states/events endpoint wiring with `Last-Event-ID` replay and gap-triggered `resyncRequired` signaling).
- Desktop local HTTP seam proof:
  - `source/MainWindow.axaml.cs` (local `/api/version` probe to validate client to server contract boundary).

## UI Orchestration (desktop-specific)

- Desktop UI/media logic remains desktop-owned:
  - `source/MainWindow.axaml.cs`.
- Existing embedded WebRemote host remains available during transition:
  - `source/WebRemote/WebRemoteServer.cs` (legacy API path while M3 server seam is introduced).
