# API Baseline

This document is the practical API integration baseline for ReelRoulette clients and contributors.
It describes current behavior and endpoint surfaces without roadmap/milestone history.

## Source of Truth

- Canonical contract: `shared/api/openapi.yaml`
- If this document and OpenAPI disagree, OpenAPI is authoritative.
- Keep this file focused on integration semantics, not implementation history.

## Contract Principles

- Core/server owns authoritative domain logic and persisted state.
- Desktop and WebUI are API/SSE orchestration and rendering clients.
- Migrated flows must not reintroduce client-local mutation fallbacks.
- API + SSE semantics are shared across clients for behavior parity.

## Version and Capability Contract

`GET /api/version` provides compatibility and capability metadata:

- `appVersion`
- `apiVersion`
- `assetsVersion`
- `minimumCompatibleApiVersion`
- `supportedApiVersions[]`
- `capabilities[]`

Client expectations:

- Clients validate API compatibility before enabling API-required flows.
- Clients validate required capability flags at startup.
- Capability checks are used to gate behavior when server support is missing.

`GET /api/capabilities` exposes explicit runtime capabilities for feature detection.

## Auth and Pairing

Pairing endpoints:

- `GET /api/pair?token=...`
- `POST /api/pair` with `{ "token": "..." }`

Protected-route behavior:

- Unpaired requests return `401` when auth is required.
- Localhost trust can be enabled for local development workflows.
- LAN access requires valid pairing/session when auth is enabled.

Session/cookie behavior:

- Server issues generated session-id cookies (not raw pairing token values).
- Cookie policy is runtime-configurable (same-site, secure mode, session duration).
- Auth middleware validates session cookie first; optional legacy fallback paths can be enabled.

## CORS and Cookie Runtime Policy

Runtime controls include:

- `EnableCors`
- `CorsAllowedOrigins[]`
- `CorsAllowCredentials`
- Pairing cookie policy options

Recommended profiles:

- Localhost dev: allow local web origins; relaxed cookie policy appropriate for local HTTP.
- LAN/prod-style: HTTPS + explicit origins + credentials + secure cookie settings.

## Web Runtime Configuration (WebUI)

Web client bootstraps runtime config from:

1. `window.__REEL_ROULETTE_RUNTIME_CONFIG`
2. `/runtime-config.json`

Required keys:

- `apiBaseUrl` (absolute `http`/`https` API root)
- `sseUrl` (absolute `http`/`https` SSE URL, typically `/api/events`)

Optional keys:

- `pairToken` (dev/local bootstrap only)

Validation behavior:

- Missing required keys or non-http(s) URLs fail startup with explicit config errors.
- URL normalization handles trailing slashes.

## Eventing Contract (SSE)

`GET /api/events` uses a stable envelope shape:

- `revision`
- `eventType`
- `timestamp`
- `payload`

Reconnect/resync behavior:

- Client reconnects with `Last-Event-ID` (or `lastEventId` query fallback).
- Optional `clientId` / `sessionId` hints support continuity and self-event suppression.
- Server replays buffered events newer than last revision when available.
- If replay gap exceeds retention, server emits `resyncRequired`.
- Client must re-fetch authoritative state via `POST /api/library-states`.

## Error and Simulation Semantics

- Deterministic missing-media behavior returns:
  - `404 { "error": "Media not found" }` on `GET /api/media/{idOrToken}`.
- API/version/capability/disconnect simulation controls are exposed via control-plane testing endpoints.
- Simulation behavior is intended to exercise real client error-handling paths.

## Current Endpoint Surface

### Health and pairing

- `GET /health`
- `GET /api/pair`
- `POST /api/pair`

### Compatibility and capability

- `GET /api/version`
- `GET /api/capabilities`

### Library, playback, presets, sources

- `GET /api/presets`
- `POST /api/presets`
- `POST /api/presets/match`
- `POST /api/random`
- `GET /api/sources`
- `POST /api/sources/import`
- `POST /api/sources/{sourceId}/enabled`
- `GET /api/library/projection`
- `POST /api/library-states`
- `POST /api/favorite`
- `POST /api/blacklist`
- `POST /api/record-playback`
- `POST /api/playback/clear-stats`

### Web runtime settings

- `GET /api/web-runtime/settings`
- `POST /api/web-runtime/settings`

### Tag editor

- Item/tag/category operations are API-driven.
- Batch-oriented contracts support multi-item updates.
- Compatibility sync endpoints remain available.

- `POST /api/tag-editor/model`
- `POST /api/tag-editor/apply-item-tags`
- `POST /api/tag-editor/upsert-category`
- `POST /api/tag-editor/upsert-tag`
- `POST /api/tag-editor/rename-tag`
- `POST /api/tag-editor/delete-tag`
- `POST /api/tag-editor/delete-category`
- `POST /api/tag-editor/sync-catalog`
- `POST /api/tag-editor/sync-item-tags`

### Refresh pipeline

- Refresh runs as a unified core-owned pipeline with ordered stages.
- `POST /api/refresh/start` rejects overlap (`409`).
- `GET /api/refresh/status` + SSE events provide projection state.
- Thumbnails are generated by the server pipeline and served via API paths.

- `POST /api/refresh/start`
- `GET /api/refresh/status`
- `GET /api/refresh/settings`
- `POST /api/refresh/settings`

### Duplicates and auto-tag

- `POST /api/duplicates/scan`
- `POST /api/duplicates/apply`
- `POST /api/autotag/scan`
- `POST /api/autotag/apply`

### Media, thumbnail, events, client logs

- `GET /api/media/{idOrToken}`
- `GET /api/thumbnail/{itemId}`
- `GET /api/events`
- `POST /api/logs/client`

### Control plane (operator/runtime)

- `GET /control/status`
- `GET /control/settings`
- `POST /control/settings`
- `GET /control/pair`
- `POST /control/pair`
- `POST /control/restart`
- `POST /control/stop`
- `GET /control/logs/server`
- `GET /control/testing`
- `POST /control/testing/update`
- `POST /control/testing/reset`

## Maintenance Rules

Update this file when:

- endpoint surfaces change,
- request/response semantics change,
- compatibility/capability policy changes,
- runtime auth/CORS/config expectations change.

Keep this document concise and current-state only.
Do not add milestone references or implementation chronology.
