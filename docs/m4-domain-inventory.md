# M4 Domain Inventory

## Pure Domain Logic (worker runtime + auth boundary)

- Runtime options and host composition contracts:
  - `src/core/ReelRoulette.Server/Hosting/ServerRuntimeOptions.cs` (listen/auth/trust/bind runtime option model).
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (shared endpoint composition used by server and worker hosts).
- Pairing/auth transport policy:
  - `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs` (auth-required flow, localhost trust behavior, token/cookie authorization checks).
- Server state/event projection continuity:
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs` (M4 version signaling + server-thin guardrail comment; existing M3 event/state projection retained).

## IO / Service Adapters (host + desktop lifecycle integration)

- Worker host runtime:
  - `src/core/ReelRoulette.Worker/Program.cs` (headless API/SSE host bootstrapping, lifetime hooks, graceful shutdown path).
  - `src/core/ReelRoulette.Worker/Worker.cs` (`IHostedService` lifecycle logging for start/stop/stopped states).
- Desktop core-runtime lifecycle adapter seam:
  - `source/MainWindow.axaml.cs` (`ProbeCoreServerVersionAsync`, `EnsureCoreRuntimeAvailableAsync`, `TryStartCoreRuntimeAsync`, menu handlers for start/auto-start).
- Script adapters for operator workflow:
  - `tools/scripts/run-core.ps1` and `tools/scripts/run-core.sh` (worker launch + runtime flag wiring + health verification hints).

## UI Orchestration (desktop-specific)

- Desktop command surface for headless-core lifecycle UX:
  - `source/MainWindow.axaml` (`Start Core Runtime`, `Auto-start Core Runtime` menu entries).
- Desktop remains UI/rendering owner while core runtime is moved out-of-process:
  - `source/MainWindow.axaml.cs` (status messaging, menu interaction, startup probe orchestration).
