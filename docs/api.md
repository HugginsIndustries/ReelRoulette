# API Baseline

## Source of Truth

- API contract lives at `shared/api/openapi.yaml`.
- M6a extends the contract-first worker/server seam with batch-ready tag/category/item-tag mutation APIs shared by desktop and web clients.
- M6b extends the same seam with unified refresh pipeline status/settings APIs and thumbnail retrieval.
- M7a establishes runtime endpoint bootstrap for the independent web client:
  - `apiBaseUrl` and `sseUrl` are read from runtime config (not compile-time constants).
  - config source order: `window.__REEL_ROULETTE_RUNTIME_CONFIG`, then `/runtime-config.json`.
- M7b establishes direct web-to-core auth/event reliability:
  - pair-token bootstrap (`/api/pair`) issues HTTP-only session cookie.
  - credentialed direct web API/SSE calls use that session cookie.
  - `/api/events` supports `Last-Event-ID` header and `lastEventId` query fallback for reconnect.
- M7c adds independent web static hosting/deployment mechanics (outside core API contract):
  - immutable versioned web artifacts under `.web-deploy/versions/{versionId}`
  - atomic active pointer in `.web-deploy/active-manifest.json`
  - split cache policy at the web host layer (`no-store` shell/config, immutable hashed assets)
- M7d completes direct-web cutover and runtime ownership:
  - legacy embedded WebRemote bridge routes are retired.
  - web runtime settings are core-owned and updated via API (`GET/POST /api/web-runtime/settings`).
  - presets/random/source flows are canonical API paths consumed by desktop and web.
- M7e adds contract compatibility guardrails:
  - WebUI TS contracts are generated from OpenAPI and validated in verify gates.
  - `GET /api/version` now carries compatibility/capability metadata used by web startup checks.
- M8a consolidates runtime hosting in `ReelRoulette.ServerApp`:
  - same-origin WebUI/API/SSE/media serving is now the normal runtime path.
  - explicit runtime capability endpoint is available at `GET /api/capabilities`.
  - web-runtime apply semantics are two-step: update persisted settings via `POST /api/web-runtime/settings`, then restart via `POST /control/restart` for listen/auth/WebUI-availability changes to take effect.
  - `WebRuntimeSettingsSnapshot.enabled` controls WebUI route availability only (API/SSE/media remain available when disabled).
- M8b adds control-plane API expansion:
  - control operations are exposed under `/control/*` (`/control/status`, `/control/settings`, `/control/pair`, `/control/restart`, `/control/stop`).
  - localhost access to control-plane routes is always available; LAN control access is only available when runtime LAN bind is enabled.
  - control settings apply returns deterministic apply result metadata (`accepted`, `restartRequired`, `message`, `errors[]`).
  - control status now includes incoming/outgoing API telemetry and connected-client snapshots.
- M8c adds API-first desktop cutover surfaces:
  - source import via `POST /api/sources/import`,
  - duplicate scan/apply via `POST /api/duplicates/scan` and `POST /api/duplicates/apply`,
  - auto-tag scan/apply via `POST /api/autotag/scan` and `POST /api/autotag/apply`,
  - client log ingestion via `POST /api/logs/client` for centralized server-side logging,
  - playback stats clear via `POST /api/playback/clear-stats`.

## Eventing Direction

- Server-sent events (SSE) are now modeled with a stable envelope:
  - `revision`
  - `eventType`
  - `timestamp`
  - `payload`
- M6a adds `itemTagsChanged` and `tagCatalogChanged` for tag-editor synchronization.
- M6b adds `refreshStatusChanged` so clients can project refresh progress/completion state (desktop in M6b; direct web-to-core projection in M7).
- Desktop event consumption now uses a long-lived SSE client with reconnect behavior; payload parsing is case-insensitive to avoid projection drops from JSON casing differences.
- Reconnect/resync contract:
  - Client reconnects to `GET /api/events` with `Last-Event-ID`.
  - Server replays buffered events newer than that revision when available.
  - If the gap exceeds replay retention, server emits `resyncRequired`.
  - Client then re-fetches authoritative state via `POST /api/library-states`.

## Pairing / Auth Primitive (M4)

- Pairing endpoint:
  - `GET /api/pair?token=...`
  - `POST /api/pair` with `{ "token": "..." }`
- Protected endpoint behavior:
  - when auth is required, unpaired requests return `401`
  - localhost requests can be optionally trusted for dev workflows
  - LAN access requires pairing token/cookie when auth is enabled
- M7b session/cookie notes:
  - server now issues generated session-id cookies (not raw pairing token values).
  - cookie controls are runtime-configurable (`PairingCookieSameSite`, `PairingCookieSecureMode`, `PairingSessionDurationHours`).
  - auth middleware validates session cookie first and supports optional legacy bearer/query token fallback when enabled.

## CORS / Cookie Environment Matrix (M7b)

- Runtime policy controls live under `CoreServer` options:
  - `EnableCors`
  - `CorsAllowedOrigins[]`
  - `CorsAllowCredentials`
  - cookie options listed above
- Recommended profiles:
  - localhost dev: `PairingCookieSameSite=Lax`, `PairingCookieSecureMode=Request`, local Vite origins allowed.
  - LAN/dev-cert + production: use HTTPS with `PairingCookieSameSite=None` and `PairingCookieSecureMode=Always`, explicit allowed origins, credentials enabled.

## Current Endpoint Surface

- `GET /health`
- `GET /api/pair`
- `POST /api/pair`
- `GET /api/version`
- `GET /api/capabilities`
- `GET /api/presets`
- `POST /api/presets`
- `POST /api/presets/match`
- `POST /api/random`
- `GET /api/sources`
- `GET /api/library/projection`
- `POST /api/sources/import`
- `POST /api/sources/{sourceId}/enabled`
- `POST /api/favorite`
- `POST /api/blacklist`
- `POST /api/record-playback`
- `POST /api/playback/clear-stats`
- `POST /api/library-states`
- `GET /api/web-runtime/settings`
- `POST /api/web-runtime/settings`
- `POST /api/tag-editor/model`
- `POST /api/tag-editor/apply-item-tags`
- `POST /api/tag-editor/upsert-category`
- `POST /api/tag-editor/upsert-tag`
- `POST /api/tag-editor/rename-tag`
- `POST /api/tag-editor/delete-tag`
- `POST /api/tag-editor/delete-category`
- `POST /api/tag-editor/sync-catalog`
- `POST /api/tag-editor/sync-item-tags`
- `POST /api/refresh/start`
- `GET /api/refresh/status`
- `GET /api/refresh/settings`
- `POST /api/refresh/settings`
- `POST /api/duplicates/scan`
- `POST /api/duplicates/apply`
- `POST /api/autotag/scan`
- `POST /api/autotag/apply`
- `POST /api/logs/client`
- `GET /api/thumbnail/{itemId}`
- `GET /api/events` (`text/event-stream`)
- `GET /control/status`
- `GET /control/settings`
- `POST /control/settings`
- `GET /control/pair`
- `POST /control/pair`
- `POST /control/restart`
- `POST /control/stop`

## M7e Version/Capability Contract

- `VersionResponse` includes:
  - `appVersion`
  - `apiVersion`
  - `assetsVersion`
  - `minimumCompatibleApiVersion`
  - `supportedApiVersions[]`
  - `capabilities[]`
- Web compatibility policy:
  - WebUI accepts N/N-1 API versions (`1` and `0` in current contract policy).
  - WebUI blocks startup usage when required server capabilities are missing.

## M7a Runtime Config Keys (Web Client)

- Required:
  - `apiBaseUrl` (absolute `http`/`https` URL for API host root; web client appends `/api/...` paths)
  - `sseUrl` (absolute `http`/`https` URL for SSE stream, usually `/api/events`)
- Optional:
  - `pairToken` (startup pairing token for direct web auth bootstrap in local/dev environments)
- Validation behavior:
  - missing keys or non-http(s) URLs fail startup with explicit runtime-config error UI.
  - trailing slash normalization is applied by the web config parser.

## M6a Tag Editing Notes

- Tag editor query + mutation contracts are batch-ready (`itemIds[]`) from day one.
- Desktop and web execute item-tag/tag/category mutations through API commands (no local-only mutation path for migrated flows).
- `POST /api/tag-editor/sync-catalog` and `POST /api/tag-editor/sync-item-tags` remain available compatibility endpoints; current M8c desktop behavior no longer depends on startup-time local-to-core push fallback for authoritative tag state.
- Deleting a category reassigns its tags to the canonical `uncategorized` category (fixed ID), and `Uncategorized` remains available in category dropdowns.
- Web tag editor uses full-screen UX with touch-friendly controls, collapsible categories, and staged/batched apply semantics for tag/category actions while preserving playback/photo autoplay pause/resume behavior during editing.

## M6b Unified Refresh + Grid/Thumbnail Notes

- Unified refresh pipeline runs in core runtime with strict stage order:
  1. `sourceRefresh`
  2. `durationScan`
  3. `loudnessScan` (new/unscanned only)
  4. `thumbnailGeneration`
- Manual refresh entrypoint is `POST /api/refresh/start`; overlap is rejected with `409`.
- Snapshot endpoint `GET /api/refresh/status` complements SSE `refreshStatusChanged` projection events.
- Core-owned refresh settings are managed via `GET/POST /api/refresh/settings` (default enabled, 15-minute interval, no idle-only settings).
- Thumbnail artifacts are fetched via `GET /api/thumbnail/{itemId}` and generated into local app-data thumbnail storage (`%LOCALAPPDATA%\\ReelRoulette\\thumbnails\\{itemId}.jpg`) by core pipeline stages.
- Thumbnail index metadata is persisted per item (`revision`, `width`, `height`, `generatedUtc`) and legacy string entries are backfilled when reused.
