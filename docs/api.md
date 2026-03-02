# API Baseline

## Source of Truth

- API contract lives at `shared/api/openapi.yaml`.
- M0 provides a minimal health endpoint schema.
- M1 keeps API shape minimal while core extraction happens behind desktop adapters.

## Eventing Direction

- Server-sent events (SSE) remain the planned cross-client consistency mechanism.
- Event envelopes are expected to include revision metadata and payload type.

## Near-Term Contract Tracks

- Tag editing flows (query/edit/apply deltas).
- Random selection command/query consistency.
- Refresh pipeline and progress/status projection.
