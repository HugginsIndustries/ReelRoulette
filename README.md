# ReelRoulette

ReelRoulette is a server-first media randomizer with thin desktop and web clients.

## What This Repo Runs

- `ReelRoulette.ServerApp` is the default runtime host.
- The server app serves:
  - API endpoints (`/api/*`)
  - SSE endpoint (`/api/events`)
  - media streaming (`/api/media/{idOrToken}`)
  - WebUI static assets
  - Operator UI (`/operator`)
- Control-plane/admin operations are exposed under `/control/*` (status, settings, pair, restart, stop, testing, logs).
- Desktop and WebUI act as API/SSE clients; server/core owns authoritative domain state.

## Prerequisites

- .NET SDK version compatible with this repo's `TargetFramework` values.
- Node.js and npm (for WebUI build/verify flows).

## Quick Start

From the repository root:

```bash
dotnet build ReelRoulette.sln
```

Run the server app:

```bash
dotnet run --project .\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj
```

Run the desktop client:

```bash
dotnet run --project .\source\ReelRoulette.csproj
```

Run the WebUI dev server:

```bash
cd .\src\clients\web\ReelRoulette.WebUI
npm install
npm run dev
```

`npm run dev` and `npm run build` automatically sync the shared icon from `assets/HI.ico` into WebUI `public/HI.ico`.

## Helper Scripts

Run server app directly:

```bash
.\tools\scripts\run-server.ps1
# or
./tools/scripts/run-server.sh
```

Build WebUI and run server app:

```bash
.\tools\scripts\run-server-rebuild.ps1
# or
./tools/scripts/run-server-rebuild.sh
```

Set release-aligned version surfaces in one step:

```powershell
.\tools\scripts\set-release-version.ps1 -Version 0.9.0 -UpdateDesktopVersion -RegenerateContracts -RunVerify
```

## Verification

Solution test gate:

```bash
dotnet test ReelRoulette.sln
```

WebUI verify gate:

```bash
cd .\src\clients\web\ReelRoulette.WebUI
npm run verify
```

Single-origin server/web deploy smoke verification:

```bash
.\tools\scripts\verify-web-deploy.ps1
# or
./tools/scripts/verify-web-deploy.sh
```

Optional core system checks:

```bash
dotnet run --project .\src\core\ReelRoulette.Core.SystemChecks\ReelRoulette.Core.SystemChecks.csproj -- --verbose
```

Manual test guide:

- `docs/testing-guide.md`

## Packaging (Windows)

- Server portable package: `tools/scripts/package-serverapp-win-portable.ps1`
- Server Inno installer package: `tools/scripts/package-serverapp-win-inno.ps1`
- Desktop portable package: `tools/scripts/package-desktop-win-portable.ps1`
- Desktop Inno installer package: `tools/scripts/package-desktop-win-inno.ps1`
- If `-Version` is omitted:
  - server packaging scripts auto-use `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` `<Version>`,
  - desktop packaging scripts auto-use `source/ReelRoulette.csproj` `<Version>`.
- Server packaging scripts rebuild and bundle WebUI static assets into published output (`wwwroot`), including `/HI.ico`.
- Installer metadata (setup/start-menu/uninstall display) uses shared `assets/HI.ico`.

Simple release flow (example `0.9.0`):

```powershell
.\tools\scripts\full-release.ps1 -Version 0.9.0
```

## Documentation Map

- Current implemented capability inventory: `CONTEXT.md`
- Migration roadmap and milestone verification: `MILESTONES.md`
- API contract and endpoint/event behavior: `docs/api.md`
- Local setup and development workflows: `docs/dev-setup.md`
- Domain-level implementation inventory: `docs/domain-inventory.md`

## Third-Party Components

This program bundles VLC (VideoLAN) and FFprobe from FFmpeg. They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.
