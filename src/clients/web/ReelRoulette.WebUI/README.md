# ReelRoulette.WebUI

Canonical web client project for M7a (`Vite + TypeScript`).

For M7c deployment, this app is served by `ReelRoulette.WebHost` from immutable versioned artifacts (not directly from the WebUI source tree).

## Runtime Config

The web app resolves API/SSE endpoints at runtime (no compile-time endpoint constants).

Config shape (required):

```json
{
  "apiBaseUrl": "http://localhost:51301/api",
  "sseUrl": "http://localhost:51301/api/events",
  "pairToken": "reelroulette-dev-token"
}
```

Runtime config loading order:

1. `window.__REEL_ROULETTE_RUNTIME_CONFIG` (if set by host before app boot)
2. `/runtime-config.json` (served static file, `no-store` fetch)

`pairToken` is optional, but if provided the app can bootstrap pairing automatically.

## M7b Auth + SSE Notes

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

1. type-check
2. runtime-config schema tests
3. production build
4. build-output verification (`dist` artifacts + runtime-config presence)
