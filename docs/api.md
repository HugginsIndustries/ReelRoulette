# API Baseline

## Source of Truth

- API contract lives at `shared/api/openapi.yaml`.
- M4 runs the contract-first query/command/SSE surface from `ReelRoulette.Worker` using shared `ReelRoulette.Server` endpoint composition.

## Eventing Direction

- Server-sent events (SSE) are now modeled with a stable envelope:
  - `revision`
  - `eventType`
  - `timestamp`
  - `payload`
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
- `GET /api/events` (`text/event-stream`)

## Near-Term Contract Tracks

- Tag editing flows (query/edit/apply deltas).
- Random selection command/query consistency.
- Refresh pipeline and progress/status projection.
