# Development Setup

This guide covers local setup, run paths, verification gates, packaging, and release-version workflow for the current ReelRoulette runtime.

## Prerequisites

- .NET SDK (matching solution target; verify with `dotnet --version`)
- Node.js + npm (for WebUI build/verify; verify with `node --version` and `npm --version`)
- Windows packaging only:
  - Inno Setup 6 (for installer builds)

## Key Projects

- Desktop app: `source/ReelRoulette.csproj`
- Core domain: `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- Server transport: `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`
- Default runtime host: `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj`
- Legacy/compat host project (non-default runtime path): `src/core/ReelRoulette.Worker/ReelRoulette.Worker.csproj`
- WebUI client: `src/clients/web/ReelRoulette.WebUI/ReelRoulette.WebUI.csproj`
- WebHost compat project (non-default runtime path): `src/clients/web/ReelRoulette.WebHost/ReelRoulette.WebHost.csproj`
- Core tests: `src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj`
- System-check harness: `src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj`

## Recommended Local Run Paths

### Run ServerApp (default consolidated runtime)

- Direct:
  - `dotnet run --project .\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj`
- Scripted:
  - `tools/scripts/run-server.ps1`
  - `tools/scripts/run-server.sh`

Runtime notes:

- API, SSE, media, and WebUI are served from the same host.
- Operator UI is available at `/operator`.
- Runtime config for WebUI is served at `/runtime-config.json` when WebUI is enabled.

### Run ServerApp with WebUI rebuild

Use when you want to ensure web assets are freshly rebuilt before startup:

- `tools/scripts/run-server-rebuild.ps1`
- `tools/scripts/run-server-rebuild.sh`

### Run Desktop app

- `dotnet run --project .\source\ReelRoulette.csproj`

Desktop behavior notes:

- Desktop is API/SSE thin-client orchestration for migrated flows.
- Desktop playback can run local-first with API fallback (or force API mode via settings).

## API and Control Surfaces (High-Signal)

- Metadata and compatibility:
  - `/health`
  - `/api/version`
  - `/api/capabilities`
- Core events:
  - `/api/events`
- Operator/control plane:
  - `/operator`
  - `/control/status`
  - `/control/settings`
  - `/control/pair`
  - `/control/restart`
  - `/control/stop`
  - `/control/logs/server`
  - `/control/testing`

## Verification Workflow

### Baseline gates

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`

### WebUI verification

From `src/clients/web/ReelRoulette.WebUI`:

- `npm install` (first run)
- `npm run verify`
- `npm run dev`/`npm run build` auto-sync shared icon from `assets/HI.ico` to WebUI `public/HI.ico`.

Optional helper scripts:

- `tools/scripts/verify-web.ps1`
- `tools/scripts/verify-web.sh`
- `tools/scripts/verify-web-deploy.ps1`
- `tools/scripts/verify-web-deploy.sh`

### Optional system checks

- `dotnet run --project .\src\core\ReelRoulette.Core.SystemChecks\ReelRoulette.Core.SystemChecks.csproj -- --verbose`

## Auth, CORS, and Runtime Settings Notes

- Pairing/auth is server enforced via `/api/pair` and runtime policy.
- Browser-client CORS and cookie behavior is controlled by `CoreServer` settings.
- Some settings changes require restart to fully apply (for example listen/auth/WebUI availability changes); use `/control/restart` or restart the process.

## Logging and Diagnostics

- Server diagnostics are available through `last.log` and `/control/logs/server`.
- Clients can relay logs to server ingestion endpoint:
  - `POST /api/logs/client`
- Connected client/session diagnostics are available in Operator UI and `/control/status`.

## Windows Packaging

### Portable package

- `tools/scripts/package-serverapp-win-portable.ps1`
- `tools/scripts/package-desktop-win-portable.ps1`

### Inno installer package

- `tools/scripts/package-serverapp-win-inno.ps1`
- `tools/scripts/package-desktop-win-inno.ps1`

Packaging notes:

- Server packaging scripts auto-detect version from `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` when `-Version` is not passed.
- Desktop packaging scripts auto-detect version from `source/ReelRoulette.csproj` when `-Version` is not passed.
- Desktop packaging scripts stage native desktop runtime dependencies into publish output (`runtimes/win-x64/native`) at package time.
- Desktop native dependency staging prefers local repo runtimes when available; otherwise scripts acquire dependencies via Chocolatey (`ffmpeg` for `ffprobe.exe`, `vlc` for LibVLC files).
- Server packaging scripts run WebUI build and bundle static assets into ServerApp publish output (`wwwroot`) so packaged runtime includes WebUI and Operator favicon.
- Shared app/installer/web icon source is `assets/HI.ico`.
- Inno script auto-detects `ISCC.exe` from PATH/common install locations/registry.

## Release Versioning

Use one command to align release-version surfaces:

- `tools/scripts/set-release-version.ps1 -Version 0.9.0 -UpdateDesktopVersion -RegenerateContracts -RunVerify`

This updates:

- OpenAPI `info.version`
- server `assetsVersion` in `/api/version` response
- release-version test fixtures
- server app project `<Version>`
- desktop project `<Version>`

Then package server and desktop as needed:

- `tools/scripts/package-serverapp-win-portable.ps1`
- `tools/scripts/package-serverapp-win-inno.ps1`
- `tools/scripts/package-desktop-win-portable.ps1`
- `tools/scripts/package-desktop-win-inno.ps1`
- or run the chained flow:
  - `tools/scripts/full-release.ps1 -Version 0.9.0`

## Troubleshooting

- WebUI changes not appearing:
  - run `tools/scripts/run-server-rebuild.ps1` (or `.sh`) to rebuild before run.
- Version/capability startup blocks:
  - check `/api/version` and `/api/capabilities` output against expected client requirements.
- Installer build fails:
  - confirm Inno Setup 6 is installed; rerun `package-serverapp-win-inno.ps1` or `package-desktop-win-inno.ps1`.
