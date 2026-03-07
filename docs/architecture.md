# Architecture

## Current State (M0 baseline)

```mermaid
flowchart TD
    desktopApp["Desktop App"]
    embeddedWebUi["Embedded Web Remote UI"]
    localJsonState["Local JSON State"]
    desktopApp --> embeddedWebUi
    desktopApp --> localJsonState
```

## Target State

```mermaid
flowchart TD
    windowsClient["Windows Client"]
    webClient["Web Client"]
    androidClient["Android Client"]
    serverApi["Server API"]
    coreDomain["Core Domain"]
    storageServices["Storage Services"]
    windowsClient --> serverApi
    webClient --> serverApi
    androidClient --> serverApi
    serverApi --> coreDomain
    coreDomain --> storageServices
```

## M0/M1 Boundary

- M0 introduces the target repo layout and project stubs without changing runtime behavior.
- M1 extracts pure domain logic into `ReelRoulette.Core` with desktop adapters calling into core.
- Desktop UI remains the shipping runtime while core extraction happens by feature slice.

## M2 Storage-State Layering

```mermaid
flowchart TD
    desktopAdapters["Desktop Adapters"]
    coreState["Core State Services"]
    coreStorage["Core Storage Services"]
    fileAdapters["Desktop File Adapters"]
    persistedJson["library.json / settings.json"]
    dotnetTest["dotnet test gate"]
    systemHarness["System-check harness"]

    desktopAdapters --> coreState
    coreState --> coreStorage
    coreStorage --> fileAdapters
    fileAdapters --> persistedJson
    dotnetTest --> coreState
    dotnetTest --> coreStorage
    systemHarness --> coreState
    systemHarness --> coreStorage
```

- Core state services own randomization/filter/playback session primitives.
- Core storage services own JSON load/save and atomic write semantics.
- Desktop retains UI/media rendering concerns and uses adapters for persistence/state access.

## M3 Contract-First Server Seam

```mermaid
flowchart TD
    desktopClient["Desktop Client"]
    webClient["Web Client"]
    serverHost["ReelRoulette.Server"]
    openApi["OpenAPI Contract"]
    handlers["Thin Endpoint Handlers"]
    coreAndAdapters["Core + Adapter Services"]
    sseStream["SSE Stream"]

    desktopClient --> serverHost
    webClient --> serverHost
    openApi --> serverHost
    serverHost --> handlers
    handlers --> coreAndAdapters
    serverHost --> sseStream
    sseStream --> desktopClient
    sseStream --> webClient
```

- `ReelRoulette.Server` now exposes initial query/command endpoints and an SSE event stream.
- OpenAPI is expanded to document live M3 endpoint contracts and event envelope shape.
- Desktop includes a local HTTP probe (`/api/version`) to prove the M3 integration boundary.
- M3 reconnect semantics are explicit: `Last-Event-ID` replay is attempted first, and clients re-fetch state (`/api/library-states`) when a revision gap exceeds replay retention.

## M4 Worker Runtime + Pairing/Auth

```mermaid
flowchart TD
    desktopClient["Desktop Client"]
    workerHost["ReelRoulette.Worker Console Host"]
    serverComposition["Shared Server Endpoint Composition"]
    authPairing["Pairing/Auth Primitive"]
    coreServices["Core + Adapter Services"]

    desktopClient --> workerHost
    workerHost --> serverComposition
    serverComposition --> authPairing
    serverComposition --> coreServices
```

- `ReelRoulette.Worker` is now the headless runtime host for API/SSE in console-first mode.
- Pairing/auth now exists on the core server seam (`/api/pair` + auth middleware with optional localhost trust).
- Desktop auto-starts core runtime during launch when local probe fails.
- Server-thin guardrail for M4+: keep HTTP/SSE/auth glue in server; avoid introducing new business rules in endpoint handlers.

## M5 Desktop API-Client Migration

```mermaid
flowchart TD
    desktopUi["Desktop UI"]
    desktopApi["Desktop API Client Layer"]
    workerApi["Worker/Server API"]
    sse["SSE Event Stream"]
    uiProjection["Desktop UI Projection State"]

    desktopUi --> desktopApi
    desktopApi --> workerApi
    workerApi --> sse
    sse --> uiProjection
    uiProjection --> desktopUi
```

- Desktop command flows (favorite/blacklist/playback/random command) now delegate to the worker/server seam first.
- Desktop subscribes to SSE and applies projected item-state updates for cross-client sync.
- Desktop keeps the SSE stream alive with reconnect behavior and applies case-insensitive payload projection to avoid dropped updates.
- Legacy embedded web-remote mutation calls are contained by delegating through the same API-client path.

## M6a Web Tag Editing + Desktop Tag Migration

```mermaid
flowchart TD
    desktopDialogs["Desktop Tag Dialogs"]
    webTagEditor["Web Full-Screen Tag Editor"]
    tagApiClient["API Tag Mutation Client"]
    tagEndpoints["Tag Editor API Endpoints"]
    coreTagState["Core/Server Tag State + Events"]
    sseTag["SSE Tag Events"]
    desktopProjection["Desktop Tag Projection"]
    webProjection["Web Tag Projection"]

    desktopDialogs --> tagApiClient
    webTagEditor --> tagApiClient
    tagApiClient --> tagEndpoints
    tagEndpoints --> coreTagState
    coreTagState --> sseTag
    sseTag --> desktopProjection
    sseTag --> webProjection
```

- M6a routes migrated tag/category/item-tag mutations through shared API contracts (`itemIds[]` batch-ready).
- Desktop dialogs remain UI orchestration while mutation authority moves to core/server API paths.
- Web tag editing keeps a combined ItemTags/ManageTags full-screen layout with touch-first controls, collapsible categories, and batched apply behavior for staged tag/category operations.
- Desktop seeds core tag catalog state on connect/start (`sync-catalog`) to prevent sparse server tag models and keep web/desktop tag views consistent.
- Desktop hydrates requested item-tag snapshots (`sync-item-tags`) before web model fetches so tag state projections match current item assignments.
- Category deletion no longer deletes tags; migrated flows always reassign category-owned tags to canonical `uncategorized` (fixed ID) for consistent multi-client behavior.

## M6b Grid/Thumbnails + Unified Refresh Pipeline

```mermaid
flowchart TD
    desktopUi["Desktop UI (List/Grid Render)"]
    refreshApi["Refresh API (`/api/refresh/*`)"]
    thumbnailApi["Thumbnail API (`/api/thumbnail/{itemId}`)"]
    refreshSvc["RefreshPipelineService"]
    serverState["ServerStateService (SSE envelope)"]
    sse["SSE `refreshStatusChanged`"]
    libraryJson["library.json"]
    thumbStore["LocalAppData thumbnails/{itemId}.jpg (+index metadata)"]

    desktopUi --> refreshApi
    desktopUi --> thumbnailApi
    refreshApi --> refreshSvc
    refreshSvc --> libraryJson
    refreshSvc --> thumbStore
    refreshSvc --> serverState
    serverState --> sse
    sse --> desktopUi
```

- Core runtime is the execution owner for refresh orchestration and scheduling.
- Desktop no longer exposes standalone duration/loudness scan menu actions; refresh runs through core API.
- Refresh settings ownership moved to core (`appsettings` + API updates), with client-side orchestration/render only.
- Desktop library panel now supports persisted list/grid mode with a justified responsive thumbnail grid (aspect-ratio preserved, variable-size cards) while preserving existing list-mode behavior.

## M7a Web Client Foundation + Independent Bootstrap

```mermaid
flowchart TD
    runtimeConfig["Runtime Config (`window` or `/runtime-config.json`)"]
    webUi["ReelRoulette.WebUI (Vite + TS)"]
    apiBase["Core API Base URL"]
    sseBase["Core SSE URL"]
    independentLoop["Independent dev/build loop"]

    runtimeConfig --> webUi
    webUi --> apiBase
    webUi --> sseBase
    webUi --> independentLoop
```

- Web client now boots as a standalone Vite+TypeScript project under `src/clients/web/ReelRoulette.WebUI`.
- API and SSE endpoints are runtime-configured and validated at startup (no compile-time hardcoded service base URL values).
- Web build/test/typecheck/build-output checks are independent from desktop app restart cycles.

## M7b Direct Web Auth + SSE Reliability

```mermaid
flowchart TD
    webUi[WebUI]
    pairApi["Pair API (/api/pair)"]
    sessionCookie["Session Cookie (HttpOnly)"]
    sseApi["SSE API (/api/events)"]
    replayResync["Replay + resyncRequired"]
    authoritativeRequery["Authoritative Requery (/api/library-states + /api/refresh/status)"]

    webUi --> pairApi
    pairApi --> sessionCookie
    webUi --> sseApi
    sseApi --> replayResync
    replayResync --> authoritativeRequery
    authoritativeRequery --> webUi
```

- Web UI now authenticates directly to core/server via pair-token bootstrap and cookie session continuity.
- Server applies explicit runtime-configurable CORS/cookie policy controls for direct browser clients.
- Web SSE path is direct core/server with reconnect, revision tracking, replay-gap `resyncRequired`, and authoritative recovery queries.

## M7c Zero-Restart Web Deployment + Rollback

```mermaid
flowchart TD
    webUiBuild["WebUI Build Output (dist/)"]
    publishScripts["Publish/Activate/Rollback Scripts"]
    deployRoot["Deployment Root (.web-deploy)"]
    versions["Immutable Versions (/versions/{versionId})"]
    activeManifest["active-manifest.json"]
    webHost["ReelRoulette.WebHost"]
    browserClient["Browser Client"]

    webUiBuild --> publishScripts
    publishScripts --> versions
    publishScripts --> activeManifest
    deployRoot --> versions
    deployRoot --> activeManifest
    webHost --> activeManifest
    webHost --> versions
    browserClient --> webHost
```

- `ReelRoulette.WebHost` is an independent static host process (no desktop/core restart coupling for web deploys).
- Activation/rollback is pointer-based through atomic `active-manifest.json` updates.
- Served cache policy is split:
  - `index.html` and runtime config are always fresh (`no-store`).
  - fingerprinted assets are long-lived immutable for fast repeat loads.

## M7e Contract Compatibility + Final M7 Guardrails

```mermaid
flowchart TD
    openApi["shared/api/openapi.yaml"]
    tsGen["openapi-typescript generation"]
    generatedTs["openapi.generated.ts"]
    webVerify["WebUI verify gate"]
    versionApi["GET /api/version"]
    capabilityGate["WebUI version/capability gate"]
    webRuntime["WebUI runtime flows"]

    openApi --> tsGen
    tsGen --> generatedTs
    generatedTs --> webVerify
    openApi --> webVerify
    versionApi --> capabilityGate
    capabilityGate --> webRuntime
```

- OpenAPI is now the direct source for generated WebUI TS contract models.
- Web verify gate enforces generated-contract freshness to prevent schema drift.
- Server version payload includes compatibility/capability metadata, and WebUI blocks unsupported server contracts before normal execution.

## M8a Server App Consolidation (Single Process, Single Origin)

```mermaid
flowchart TD
    serverApp["ReelRoulette.ServerApp"]
    apiSseMedia["API + SSE + Media Endpoints"]
    webUiStatic["WebUI Static Assets + Runtime Config"]
    operatorUi["Operator UI (/operator)"]
    metadata["Metadata Endpoints (/health, /api/version, /api/capabilities)"]
    clients["Desktop + Web Clients"]

    serverApp --> apiSseMedia
    serverApp --> webUiStatic
    serverApp --> operatorUi
    serverApp --> metadata
    clients --> serverApp
```

- Runtime serving is consolidated into one process and one browser-visible origin.
- `ReelRoulette.WebHost` and `active-manifest` switching are no longer required in the normal runtime path.
- Operator controls (status/settings/restart) are surfaced from the server app, while domain logic remains in `ReelRoulette.Core` and server composition remains in `ReelRoulette.Server`.

## M8b Control-Plane Expansion

- Control-plane APIs are formalized under `/control/*`:
  - status (`/control/status`),
  - settings read/apply (`/control/settings`),
  - control pairing (`/control/pair`),
  - lifecycle operations (`/control/restart`, `/control/stop`).
- Control-plane trust/auth policy is local-first on the shared listener:
  - localhost requests always allowed,
  - LAN control access requires runtime LAN bind exposure and (optionally) admin token pairing auth.
- Operator UI now includes control diagnostics:
  - incoming/outgoing API telemetry feed,
  - connected client/session snapshot,
  - responsive dark-theme layout for desktop/mobile operator usage.
- ServerApp is now responsible for LAN mDNS advertisement (`{LanHostname}.local`) for the consolidated WebUI host when WebUI is enabled and LAN binding is active.
