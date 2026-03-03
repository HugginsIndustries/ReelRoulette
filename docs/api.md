# API Baseline

## Source of Truth

- API contract lives at `shared/api/openapi.yaml`.
- M6a extends the contract-first worker/server seam with batch-ready tag/category/item-tag mutation APIs shared by desktop and web clients.

## Eventing Direction

- Server-sent events (SSE) are now modeled with a stable envelope:
  - `revision`
  - `eventType`
  - `timestamp`
  - `payload`
- M5 adds `filterSessionChanged` when the desktop syncs filter/preset session state via API.
- M6a adds `itemTagsChanged` and `tagCatalogChanged` for tag-editor synchronization.
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

## Current Endpoint Surface

- `GET /health`
- `GET /api/pair`
- `POST /api/pair`
- `GET /api/version`
- `GET /api/presets`
- `POST /api/random`
- `POST /api/favorite`
- `POST /api/blacklist`
- `POST /api/record-playback`
- `POST /api/library-states`
- `GET /api/filter-session`
- `POST /api/filter-session`
- `POST /api/tag-editor/model`
- `POST /api/tag-editor/apply-item-tags`
- `POST /api/tag-editor/upsert-category`
- `POST /api/tag-editor/upsert-tag`
- `POST /api/tag-editor/rename-tag`
- `POST /api/tag-editor/delete-tag`
- `POST /api/tag-editor/delete-category`
- `POST /api/tag-editor/sync-catalog`
- `POST /api/tag-editor/sync-item-tags`
- `GET /api/events` (`text/event-stream`)

## M6a Tag Editing Notes

- Tag editor query + mutation contracts are batch-ready (`itemIds[]`) from day one.
- Desktop and web execute item-tag/tag/category mutations through API commands (no local-only mutation path for migrated flows).
- Desktop synchronizes full local category/tag catalog to core via `POST /api/tag-editor/sync-catalog` after core reconnect/start so server-side tag model remains authoritative for all clients.
- Before web tag-editor model reads for active items, desktop hydrates requested item-tag snapshots to core via `POST /api/tag-editor/sync-item-tags` so current tag-state styling reflects authoritative item tags.
- Deleting a category reassigns its tags to the canonical `uncategorized` category (fixed ID), and `Uncategorized` remains available in category dropdowns.
- Web tag editor uses full-screen UX with touch-friendly controls, collapsible categories, and staged/batched apply semantics for tag/category actions while preserving playback/photo autoplay pause/resume behavior during editing.
