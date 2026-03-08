# M8 Domain Inventory

## M8a - ReelRoulette Server App Consolidation (Single Process, Single Origin)

## M8b - Control-Plane UI + API for Runtime Operations

## M8c - Desktop Client Thin-Client Cutover

## M8d - Desktop Playback Policy Compromise

## M8e - WebUI and Mobile Thin-Client Contract Standardization

## API Contract and Server Transport Surfaces (M8e)

- Contract source-of-truth updates:
  - `shared/api/openapi.yaml`
    - optional `sessionId` surfaces added to random/playback/library-state request schemas and playback event payload schema.
    - `/api/events` documentation now includes `clientId`/`sessionId` continuity parameters plus reconnect semantics.
- Server DTO/composition updates:
  - `src/core/ReelRoulette.Server/Contracts/ApiContracts.cs`
    - add `SessionId` on `RandomRequest`, `RecordPlaybackRequest`, `LibraryStatesRequest`, and `PlaybackRecordedPayload`.
  - `src/core/ReelRoulette.Server/Services/ServerStateService.cs`
    - propagate `sessionId` into `playbackRecorded` event payloads.
    - add capability marker `identity.sessionId`.
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`
    - normalize optional identity fields (`clientId`/`sessionId`) on random/playback/library-state request paths.
    - accept optional `clientId`/`sessionId` query parameters on SSE endpoint contract path.

## Desktop Thin-Client Orchestration Updates (M8e)

- `source/MainWindow.axaml.cs`
  - persist stable `CoreClientId` in settings-backed state.
  - generate per-runtime `CoreSessionId` and propagate it on random/playback/SSE operations.
  - track last SSE revision and reconnect with replay hints (`lastEventId`) for deterministic recovery.
  - suppress self-originated playback projections by matching session-aware playback payload identity.
- `source/CoreServerApiClient.cs`
  - add optional `sessionId` propagation for `record-playback`.
  - add `sessionId` + optional `lastEventId` support for SSE connect URL/header construction.
  - update DTOs (`CoreRandomRequest`, `CorePlaybackRecordedPayload`) to include optional `sessionId`.

## WebUI Runtime Alignment (M8e)

- `src/clients/web/ReelRoulette.WebUI/src/legacyApp.js`
  - persist stable `clientId` and per-tab/per-session `sessionId`.
  - propagate both values through random request payloads, SSE URL query, and authoritative requery payloads.
  - require capability `identity.sessionId` in startup compatibility checks.
- `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts`
  - centralize client/session identity helpers used by modular web seams.
  - include `clientId` + `sessionId` in authoritative requery payload.
- `src/clients/web/ReelRoulette.WebUI/src/events/eventEnvelope.ts`
  - extend SSE URL builder to include optional `clientId` and `sessionId` query hints.
- `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts`
  - use shared identity helpers and pass session-aware identity on SSE reconnect URLs.
- `src/clients/web/ReelRoulette.WebUI/src/auth/authBootstrap.ts`
  - include `identity.sessionId` in required capability gate.
- `src/clients/web/ReelRoulette.WebUI/src/types/openapi.generated.ts`
  - regenerated from updated OpenAPI contract.

## Verification and Regression Surfaces (M8e)

- Core tests:
  - `src/core/ReelRoulette.Core.Tests/ServerContractTests.cs`
  - `src/core/ReelRoulette.Core.Tests/ServerStateRegressionTests.cs`
  - `src/core/ReelRoulette.Core.Tests/CoreServerApiClientTests.cs`
- Web tests:
  - `src/clients/web/ReelRoulette.WebUI/src/test/authBootstrap.test.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/test/coreApi.test.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/test/eventsHelpers.test.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/test/sseClient.test.ts`

## Pure Domain Logic (unchanged ownership boundaries)

- Domain and persistence logic remain in core/server services:
  - `src/core/ReelRoulette.Core/*`
  - `src/core/ReelRoulette.Server/Services/*`
- M8a keeps server layer thin while extending metadata exposure (`/api/capabilities`) through existing server composition.
- M8e keeps server thin-client boundaries intact by limiting identity/session updates to transport-contract fields and projection metadata only.

## IO / Service Adapters (runtime-host consolidation)

- New consolidated host project:
  - `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj`
  - `src/core/ReelRoulette.ServerApp/Program.cs`
  - `src/core/ReelRoulette.ServerApp/appsettings.json`
- Existing server composition extension:
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs` (`/api/capabilities` plus M8c source-import/duplicate/autotag/client-log/playback-clear-stats routes)
- New M8c server services:
  - `src/core/ReelRoulette.Server/Services/LibraryOperationsService.cs`
    - source import API execution,
    - duplicate scan/apply APIs,
    - auto-tag scan/apply APIs,
    - playback stats clear API execution,
    - client-log ingest API writing to centralized server `last.log`.
- API contract updates:
  - `shared/api/openapi.yaml`:
    - M8a/M8b control/runtime surfaces,
    - M8c `POST /api/sources/import`,
    - M8c `POST /api/duplicates/scan`, `POST /api/duplicates/apply`,
    - M8c `POST /api/autotag/scan`, `POST /api/autotag/apply`,
    - M8c `POST /api/playback/clear-stats`,
    - M8c `POST /api/logs/client`.
- Worker compatibility host no longer supervises external WebHost runtime:
  - `src/core/ReelRoulette.Worker/Program.cs`

## UI Orchestration (operator and web runtime surfaces)

- Operator UI + controls are now served from the consolidated host:
  - `/operator` status/settings/restart UI in `src/core/ReelRoulette.ServerApp/Program.cs`
  - control-plane API routes:
    - `GET /control/status`
    - `GET/POST /control/settings`
    - `GET/POST /control/pair`
    - `POST /control/restart`
    - `POST /control/stop`
  - settings apply follows explicit two-step semantics (persist, then restart)
  - status panel layout wraps/scrolls long diagnostics without overlapping neighboring controls
  - operator UI now includes dark-theme responsive layout plus incoming/outgoing API telemetry and connected-client visibility panels
  - ServerApp now owns mDNS advertisement for LAN WebUI hostname (`{LanHostname}.local`) when WebUI is enabled and LAN bind is on
- Same-origin WebUI bootstrapping:
  - `/runtime-config.json` generated by server app host
  - static WebUI assets served by server app from configured root path
  - `enabled=false` (after restart) disables WebUI routes (`404`) while keeping API/SSE/media/operator surfaces available
- Desktop orchestration changes in M8c:
  - `source/MainWindow.axaml.cs` no longer launches `run-core.ps1`; core availability is guidance-only.
  - `source/MainWindow.axaml.cs` routes source import + duplicate/autotag + playback-stats-clear operations through API client calls.
  - `source/ManageSourcesDialog.axaml.cs`, `source/DuplicatesDialog.axaml.cs`, `source/AutoTagDialog.axaml.cs` consume duplicate/autotag API orchestration instead of desktop-local authority.
  - desktop log call sites route through `source/ClientLogRelay.cs` to centralized server logging API.
- Desktop playback-orchestration changes in M8d:
  - `source/MainWindow.axaml.cs` adds deterministic playback-target policy resolution (local-first, API fallback, `ForceApiPlayback` override) and source-type aware LibVLC playback handling (`FromPath` vs `FromLocation`).
  - `source/MainWindow.axaml.cs` routes manual library-panel play through stable identity resolution prior to playback-path selection and surfaces explicit guidance when identity mapping is unavailable.
  - `source/MainWindow.axaml.cs` updates random playback target resolution to accept API media URLs and convert relative API media paths to absolute runtime URLs.
  - `source/MainWindow.axaml.cs` persists `ForceApiPlayback` in desktop settings and applies it across manual/random/timeline playback entry points.
  - `source/SettingsDialog.axaml` and `source/SettingsDialog.axaml.cs` add playback-policy toggle UI binding for `ForceApiPlayback`.
  - `src/core/ReelRoulette.Core.Tests/CoreServerApiClientTests.cs` adds random-response media URL preservation coverage used by API playback-path handling.

## Tooling and Verification Surfaces

- Core runtime launch scripts target server app:
  - `tools/scripts/run-core.ps1`
  - `tools/scripts/run-core.sh`
- Single-origin smoke verification:
  - `tools/scripts/verify-web-deploy.ps1`
  - `tools/scripts/verify-web-deploy.sh`
  - scripts validate control-plane status/settings endpoints in addition to M8a single-origin checks
  - PowerShell script fails fast on startup/request timeouts and writes dedicated server stdout/stderr logs for actionable diagnostics
- Compatibility helper retained (name unchanged) but behavior updated:
  - `tools/scripts/publish-activate-run-worker.ps1` now builds WebUI and runs `ReelRoulette.ServerApp`.
