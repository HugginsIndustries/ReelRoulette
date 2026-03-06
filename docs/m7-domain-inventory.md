# M7 Domain Inventory

## M7a - Web Client Foundation and Independent Host Bootstrap

## Pure Domain Logic (runtime config contract + validation behavior)

- Web runtime-config contract and parser:
  - `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts`
  - required keys: `apiBaseUrl`, `sseUrl`
  - validation: absolute `http`/`https` URLs, host required, startup failure on invalid shape.
- Runtime config contract tests:
  - `src/clients/web/ReelRoulette.WebUI/src/test/runtimeConfig.test.ts`

## IO / Service Adapters (artifact verification + workflow scripts)

- Web build-output verification:
  - `src/clients/web/ReelRoulette.WebUI/scripts/verify-build-output.mjs`
  - validates `dist/index.html`, `dist/assets/*`, `dist/runtime-config.json`, and runtime-config key presence.
- Cross-platform web verification wrappers:
  - `tools/scripts/verify-web.ps1`
  - `tools/scripts/verify-web.sh`

## UI Orchestration (independent web bootstrap shell)

- Vite + TypeScript app bootstrap and rendering:
  - `src/clients/web/ReelRoulette.WebUI/index.html`
  - `src/clients/web/ReelRoulette.WebUI/src/main.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/app.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/styles.css`
- Runtime config artifact for environment injection:
  - `src/clients/web/ReelRoulette.WebUI/public/runtime-config.json`

## M7b - Direct Web-to-Core Auth and SSE Reliability

## Pure Domain Logic (auth/session + reconnect contracts)

- Server runtime policy options and normalization:
  - `src/core/ReelRoulette.Server/Hosting/ServerRuntimeOptions.cs`
  - CORS/cookie/session controls (`EnableCors`, origins/credentials, same-site/secure/session duration).
- Session-id store for pairing-auth middleware:
  - `src/core/ReelRoulette.Server/Auth/ServerSessionStore.cs`
- Reconnect contract adjustment:
  - `/api/events` supports `Last-Event-ID` header and `lastEventId` query fallback in `shared/api/openapi.yaml`.

## IO / Service Adapters (server/web transport wiring)

- Server/worker host transport wiring:
  - `src/core/ReelRoulette.Server/Program.cs`
  - `src/core/ReelRoulette.Worker/Program.cs`
  - `src/core/ReelRoulette.Server/Hosting/ServerHostComposition.cs`
  - `src/core/ReelRoulette.Server/Auth/ServerPairingAuthMiddleware.cs`
- Core runtime defaults for auth/cors/cookies:
  - `src/core/ReelRoulette.Server/appsettings.json`
  - `src/core/ReelRoulette.Worker/appsettings.json`

## UI Orchestration (WebUI direct auth/event projection)

- Web auth bootstrap and API adapters:
  - `src/clients/web/ReelRoulette.WebUI/src/auth/authBootstrap.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/api/coreApi.ts`
- Web SSE reconnect/resync and refresh projection:
  - `src/clients/web/ReelRoulette.WebUI/src/events/sseClient.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/events/eventEnvelope.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/events/refreshStatusProjection.ts`
- Updated app shell and runtime config typing:
  - `src/clients/web/ReelRoulette.WebUI/src/app.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/types/runtimeConfig.ts`

## M7c - Zero-Restart Web Deployment, Caching, and Rollback

## Pure Domain Logic (deployment policy + cache semantics)

- Web deployment policy contracts:
  - immutable version directories (`/versions/{versionId}`)
  - atomic active pointer (`active-manifest.json`)
  - cache split rules for shell/config vs fingerprinted assets
- Host policy helpers:
  - `src/clients/web/ReelRoulette.WebHost/CachePolicyResolver.cs`
  - `src/clients/web/ReelRoulette.WebHost/WebDeploymentOptions.cs`
  - `src/clients/web/ReelRoulette.WebHost/ActiveManifest.cs`
  - `src/clients/web/ReelRoulette.WebHost/ActiveVersionResolver.cs`

## IO / Service Adapters (deploy tooling + host runtime)

- Independent web host process:
  - `src/clients/web/ReelRoulette.WebHost/Program.cs`
  - `src/clients/web/ReelRoulette.WebHost/appsettings.json`
- Deployment orchestration scripts:
  - `tools/scripts/publish-web.ps1`
  - `tools/scripts/publish-web.sh`
  - `tools/scripts/activate-web-version.ps1`
  - `tools/scripts/activate-web-version.sh`
  - `tools/scripts/rollback-web-version.ps1`
  - `tools/scripts/rollback-web-version.sh`
- Deployment smoke verification:
  - `tools/scripts/verify-web-deploy.ps1`
  - `tools/scripts/verify-web-deploy.sh`

## UI Orchestration (consumer behavior)

- WebUI app remains deployment-agnostic and runtime-config-driven; host activation/rollback changes are projected via static-shell fetch behavior and cache headers.

## M7d - Controlled Cutover and Legacy Bridge Retirement

## Pure Domain Logic (core-owned runtime + random/filter parity)

- Core-owned runtime settings service:
  - `src/core/ReelRoulette.Server/Services/CoreSettingsService.cs`
  - owns persisted web runtime settings and publishes change notifications consumed by runtime services.
- Server-owned random/filter eligibility logic:
  - `src/core/ReelRoulette.Server/Services/LibraryPlaybackService.cs`
  - `src/core/ReelRoulette.Core/Filtering/FilterSetBuilder.cs`
  - aligns desktop/web random selection semantics from one server-side filter model.
- Dynamic CORS origin derivation:
  - `src/core/ReelRoulette.Server/Hosting/DynamicCorsOriginRegistry.cs`
  - derives allowed origins from web runtime settings plus active LAN interfaces.

## IO / Service Adapters (worker/webhost orchestration + host-aware serving)

- Worker runtime host ownership:
  - `src/core/ReelRoulette.Worker/WebUiHostSupervisorService.cs`
  - `src/core/ReelRoulette.Worker/WebUiMdnsService.cs`
  - manages WebHost lifecycle and mDNS advertisement from core-owned runtime settings.
- Host-aware runtime config serving:
  - `src/clients/web/ReelRoulette.WebHost/Program.cs`
  - rewrites runtime config API/SSE host targets to match request host for localhost/mDNS/LAN-IP clients.
- Runtime bootstrap helper script:
  - `tools/scripts/publish-activate-run-worker.ps1`

## UI Orchestration (desktop + web parity after legacy retirement)

- Desktop settings and Web UI launch orchestration:
  - `source/MainWindow.axaml.cs`
  - `source/SettingsDialog.axaml(.cs)`
  - desktop controls project to core/worker runtime settings, no embedded WebRemote bridge host ownership.
- Migrated Web UI parity surface:
  - `src/clients/web/ReelRoulette.WebUI/src/legacyApp.js`
  - `src/clients/web/ReelRoulette.WebUI/src/styles.css`
  - parity control/tag/touch behaviors retained on independent WebUI runtime.
- Legacy bridge retirement:
  - embedded `source/WebRemote/*` runtime/resources removed from active runtime and project wiring.
