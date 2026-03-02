# API Baseline

## Source of Truth

- API contract lives at `shared/api/openapi.yaml`.
- M3 establishes initial contract-first query/command/SSE endpoints in `ReelRoulette.Server`.

## Eventing Direction

- Server-sent events (SSE) are now modeled with a stable envelope:
  - `revision`
  - `eventType`
  - `timestamp`
  - `payload`
- Reconnect/resync contract for M3 final state:
  - Client reconnects to `GET /api/events` with `Last-Event-ID`.
  - Server replays buffered events newer than that revision when available.
  - If the gap exceeds replay retention, server emits `resyncRequired`.
  - Client then re-fetches authoritative state via `POST /api/library-states`.

## M3 Initial Endpoint Surface

- `GET /health`
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
