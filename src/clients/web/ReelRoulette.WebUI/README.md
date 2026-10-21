# ReelRoulette.WebUI

Canonical web client project (`Vite + TypeScript + Preact`). Screens are Preact components over shared `@preact/signals` state, with their logic in typed modules.

This app is served by `ReelRoulette.ServerApp` as part of the consolidated runtime.

## Runtime Config

The web app resolves API/SSE endpoints at runtime (no compile-time endpoint constants).

Config shape (required):

```json
{
  "apiBaseUrl": "http://localhost:45123",
  "sseUrl": "http://localhost:45123/api/events",
  "pairToken": "reelroulette-dev-token"
}
```

The app loads it from `/runtime-config.json`, which the server builds for each request (`no-store` fetch).

`pairToken` is optional, but if provided the app can bootstrap pairing automatically.

## Auth + SSE Notes

The app and the API share one origin, so the browser sends the pairing cookie with every request and the event stream.

- Pairing flow:
  - Probe `/api/version`.
  - If unauthorized, call `/api/pair` with token and retry version probe.
- SSE flow:
  - Connect directly to `/api/events`.
  - Track last revision and pass reconnect fallback `lastEventId` query.
  - Handle `resyncRequired` by requerying authoritative APIs.

## Web Workflows

From this directory:

```bash
npm install
npm run build
```

The server serves the build from `dist/`; `pwsh ./tools/scripts/run-server.ps1` from the repository root builds the WebUI and runs the server with it.

Additional commands:

```bash
npm run typecheck
npm run test
npm run verify
```

`npm run verify` performs:

1. contract freshness: `src/types/openapi.generated.ts` matches `shared/api/openapi.yaml`
2. type-check: app code with browser types only (`tsconfig.app.json`), and `src/test` with Node types as well (`tsconfig.test.json`)
3. unit tests (Vitest): typed modules under node, and screen tests in `src/test/screens/`, which mount the page in `happy-dom` against a fake server and event stream (`pageHarness.ts`)
4. production build
5. build-output verification (`dist` artifacts)
