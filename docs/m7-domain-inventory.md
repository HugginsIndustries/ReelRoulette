# M7 Domain Inventory

## M7a - Web Client Foundation and Independent Host Bootstrap

## Pure Domain Logic (runtime config contract + validation behavior)

- Web runtime-config contract and parser:
  - `src/clients/web/ReelRoulette.WebUI/src/config/runtimeConfig.ts`
  - required keys: `apiBaseUrl`, `sseUrl`
  - validation: absolute `http`/`https` URLs, host required, startup failure on invalid shape.
- Runtime config contract tests:
  - `src/clients/web/ReelRoulette.WebUI/src/test/runtimeConfig.test.ts`

## IO / Service Adapters (artifact verification + workflow scripts)

- Web build-output verification:
  - `src/clients/web/ReelRoulette.WebUI/scripts/verify-build-output.mjs`
  - validates `dist/index.html`, `dist/assets/*`, `dist/runtime-config.json`, and runtime-config key presence.
- Cross-platform web verification wrappers:
  - `tools/scripts/verify-web.ps1`
  - `tools/scripts/verify-web.sh`

## UI Orchestration (independent web bootstrap shell)

- Vite + TypeScript app bootstrap and rendering:
  - `src/clients/web/ReelRoulette.WebUI/index.html`
  - `src/clients/web/ReelRoulette.WebUI/src/main.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/app.ts`
  - `src/clients/web/ReelRoulette.WebUI/src/styles.css`
- Runtime config artifact for environment injection:
  - `src/clients/web/ReelRoulette.WebUI/public/runtime-config.json`
