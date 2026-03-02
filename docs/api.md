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

## M3 Initial Endpoint Surface

- `GET /health`
- `GET /api/version`
- `GET /api/presets`
- `POST /api/random`
- `POST /api/favorite`
- `POST /api/blacklist`
- `POST /api/record-playback`
- `GET /api/events` (`text/event-stream`)

## Near-Term Contract Tracks

- Tag editing flows (query/edit/apply deltas).
- Random selection command/query consistency.
- Refresh pipeline and progress/status projection.
