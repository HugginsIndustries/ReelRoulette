# ReelRoulette.WebUI

Canonical web client project for M7a (`Vite + TypeScript`).

## Runtime Config

The web app resolves API/SSE endpoints at runtime (no compile-time endpoint constants).

Config shape (required):

```json
{
  "apiBaseUrl": "http://localhost:51301/api",
  "sseUrl": "http://localhost:51301/api/events"
}
```

Runtime config loading order:

1. `window.__REEL_ROULETTE_RUNTIME_CONFIG` (if set by host before app boot)
2. `/runtime-config.json` (served static file, `no-store` fetch)

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
