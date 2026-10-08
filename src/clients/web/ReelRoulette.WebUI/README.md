# ReelRoulette.WebUI

Canonical web client project (`Vite + TypeScript + Preact`). Screens are Preact components over shared `@preact/signals` state, with their logic in typed modules.

This app is served by `ReelRoulette.ServerApp` as part of the consolidated runtime.

## Runtime Config

The web app resolves API/SSE endpoints at runtime (no compile-time endpoint constants).

Config shape (required):

```json
{
  "apiBaseUrl": "http://localhost:51301",
  "sseUrl": "http://localhost:51301/api/events",
  "pairToken": "reelroulette-dev-token"
}
```

Runtime config loading order:

1. `window.__REEL_ROULETTE_RUNTIME_CONFIG` (if set by host before app boot)
2. `/runtime-config.json` (served static file, `no-store` fetch)

`pairToken` is optional, but if provided the app can bootstrap pairing automatically.

## Auth + SSE Notes

- Pairing flow:
  - Probe `/api/version` with credentials.
  - If unauthorized, call `/api/pair` with token and retry version probe.
- SSE flow:
  - Connect directly to `/api/events` with `withCredentials`.
  - Track last revision and pass reconnect fallback `lastEventId` query.
  - Handle `resyncRequired` by requerying authoritative APIs.

## Web Workflows

From this directory:

```bash
npm install
npm run dev
```

Additional commands:

```bash
npm run typecheck
npm run test
npm run build
npm run preview
npm run verify
```

`npm run verify` performs:

1. contract freshness: `src/types/openapi.generated.ts` matches `shared/api/openapi.yaml`
2. type-check: app code with browser types only (`tsconfig.app.json`), and `src/test` with Node types as well (`tsconfig.test.json`)
3. unit tests (Vitest): typed modules under node, and screen tests in `src/test/screens/`, which mount the page in `happy-dom` against a fake server and event stream (`pageHarness.ts`)
4. production build
5. build-output verification (`dist` artifacts + runtime-config presence)
