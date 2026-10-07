# Development Setup

This guide covers local setup, run paths, verification gates, packaging, and release-version workflow for the current ReelRoulette runtime.

## Prerequisites

- .NET SDK 10.0.1xx, 10.0.112 or a later patch, as pinned in `global.json` (verify with `dotnet --version` in the repo; a 10.0.4xx SDK alone does not satisfy it)
- Node.js 24 + npm, matching CI and release (for WebUI build/verify; verify with `node --version` and `npm --version`)
- PowerShell Core (`pwsh`) for repository scripts under `tools/scripts/` (for example `pwsh ./tools/scripts/run-server.ps1`).
  - Windows: install PowerShell 7+ with `winget install Microsoft.PowerShell` so `pwsh` is on your PATH. Built-in Windows PowerShell 5.1 is not enough for scripts that rely on PowerShell 7+; use `pwsh` after install (restart the terminal or Cursor if `pwsh` is not found until PATH refreshes).
  - Linux (Arch Linux, CachyOS, and similar): install from the AUR, for example `paru -S powershell-bin` or `yay -S powershell-bin`; that package provides `pwsh` on your PATH.
- VLC / LibVLC libraries and plugins for desktop video playback when running from source; FFmpeg (with `ffprobe` on `PATH`) on the **server** for library refresh (duration, loudness, thumbnails). Install from your OS on Linux and for local Windows `dotnet run`. **Velopack** Windows server packages bundle FFmpeg/ffprobe; Windows desktop packages bundle LibVLC. Linux AppImages bundle neither—the desktop app resolves **`libvlc.so.5`** via a native loader hook (minimal library/plugin packages on split distros; monolithic **`vlc`** on Arch). If the desktop AppImage is launched without LibVLC, it shows a copy-paste install command for the detected distro family.

## Key Projects

- Desktop app: `src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj`
- Core domain: `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- Server transport: `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`
- Default runtime host: `src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj`
- WebUI client: `src/clients/web/ReelRoulette.WebUI/ReelRoulette.WebUI.csproj`
- Core tests: `src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj`
- Server host tests: `src/core/ReelRoulette.ServerApp.Tests/ReelRoulette.ServerApp.Tests.csproj`
- System-check harness: `src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj`

## Recommended Local Run Paths

### Run ServerApp (default consolidated runtime)

- Direct:
  - Windows (`net10.0-windows`): `dotnet run --framework net10.0-windows --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj`
  - Linux/macOS (`net10.0`): `dotnet run --framework net10.0 --project ./src/core/ReelRoulette.ServerApp/ReelRoulette.ServerApp.csproj` (Avalonia tray when the session supports it; otherwise headless)
- Scripted (from repo root):
  - `pwsh ./tools/scripts/run-server.ps1`

Runtime notes:

- API, SSE, media, and WebUI are served from the same host.
- Operator UI is available at `/operator`.
- Runtime config for WebUI is served at `/runtime-config.json` when WebUI is enabled.
- Default listen URL/port is `http://localhost:45123` unless overridden by runtime settings or script parameters.
- Windows runtime uses tray-hosted ServerApp behavior (no visible command prompt when launched as app binary). On Linux, tray appears when a status notifier/tray is available; otherwise the host runs headless deterministically.
- `Launch Server on Startup` can be toggled from tray and Operator control settings and applies immediately (no restart required).
- **Linux packaged/binary:** XDG autostart writes `reelroulette-server.desktop` with `Exec=`/`Path=` from the stable server path (**`APPIMAGE`** when running an AppImage, so autostart does not capture `/tmp/.mount_*`); ServerApp sets ASP.NET `ContentRootPath` to `AppContext.BaseDirectory` so login autostart still loads `appsettings` and `wwwroot` when cwd is not the install folder.

### Run ServerApp with WebUI rebuild

Use when you want to ensure web assets are freshly rebuilt before startup:

- `pwsh ./tools/scripts/run-server-rebuild.ps1`

### Run Desktop app

- **`dotnet run`** on Windows uses the **VideoLAN.LibVLC.Windows** NuGet copy under **`libvlc/win-x64/`** in the build output. Packaged Windows desktop builds load **`runtimes/win-x64/native/libvlc/`** instead.
- `dotnet run --project ./src/clients/desktop/ReelRoulette.DesktopApp/ReelRoulette.DesktopApp.csproj`

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
  - `/control/startup`
  - `/control/pair`
  - `/control/restart`
  - `/control/stop`
  - `/control/logs/server`
  - `/control/testing`

## Verification Workflow

### Baseline gates

- `dotnet build ReelRoulette.sln`
- `dotnet test ReelRoulette.sln`
- Desktop tests use a temporary settings folder, removed when the run ends, and do not send log lines to a server, so they leave your desktop settings and a running server alone. Filter dialog tests run the real dialog headlessly with `Avalonia.Headless`.
- Server host tests open the tray menu window Avalonia uses on Windows, headlessly with `Avalonia.Headless`, and check that it shows every menu item.
- Core, server, and server host tests set `REELROULETTE_DATA_DIR` to a temporary folder, removed when the run ends, so server code they run never falls back to your real data folders. On Linux they also point `XDG_CONFIG_HOME` and `XDG_DATA_HOME` at temporary folders.

### WebUI verification

From `src/clients/web/ReelRoulette.WebUI`:

- `npm install` (first run)
- `npm run verify`
- `npm run dev`/`npm run build` auto-sync shared assets into WebUI `public/`:
  - `assets/HI.ico` -> `public/HI.ico`
  - PWA icons: `scripts/sync-shared-icon.mjs` uses **`sharp`** to write `public/icons/icon-192.png` (192×192), `public/icons/icon-512.png` (512×512), and `public/icons/apple-touch-icon.png` (180×180) from `assets/HI-256.png` / `HI-512.png` (manifest `sizes` must match pixel dimensions)
  - PWA service worker: `public/sw.js` (copied to `dist/` root) is registered from `src/main.ts` in secure contexts. Its fetch handler intercepts document navigations only, which satisfies Chromium installability for standalone install on Android Chrome. API calls, the event stream, and media are not intercepted. `ServerApp` sets `Cache-Control: no-store` for `sw.js` when serving WebUI static files.
  - `assets/fonts/MaterialSymbolsOutlined.var.ttf` -> `public/assets/fonts/MaterialSymbolsOutlined.var.ttf`

Optional helper scripts:

- `pwsh ./tools/scripts/verify-web-deploy.ps1` builds the WebUI and starts the server on port 51312 with `REELROULETTE_DATA_DIR` set to a temporary folder on every OS, plus temporary `XDG_CONFIG_HOME` and `XDG_DATA_HOME` on Linux. It checks that the server wrote its log, catalog, and settings there, then stops the server it started and removes that folder. Your real data folders are not touched.

### Optional system checks

- `dotnet run --project ./src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj -- --verbose`

For the pre-release pass, use `docs/checklists/testing-checklist.md` and `pwsh ./tools/scripts/reset-checklist.ps1`.

## Auth, CORS, and Runtime Settings Notes

- Pairing/auth is server enforced via `/api/pair` and runtime policy.
- Control routes trust localhost and need the control token from any other address; see the control-plane auth rules in `docs/api.md`. The token is `controlRuntime.adminSharedToken` in `core-settings.json` under the data folder below, generated on first start when none is set.
- Browser-client CORS and cookie behavior is controlled by `CoreServer` settings.
- Some settings changes require restart to fully apply (for example listen/auth/WebUI availability changes); use `/control/restart` or restart the process.
- `FormOptions.MultipartBodyLengthLimit` is set to **512 MB** in `src/core/ReelRoulette.ServerApp/Program.cs` for any future multipart endpoints; **no shipped API route currently uses multipart uploads**, so this is host-level configuration only for now.

## Logging and Diagnostics

- Server diagnostics are available through `last.log` and `/control/logs/server`.
- Clients can relay logs to server ingestion endpoint:
  - `POST /api/logs/client`
- Every `last.log` line, from the server or relayed by a client, is written by one writer under a process-wide lock, and line breaks in it become a literal `\n`, so each entry stays one line.
- Relayed client lines leave out file paths and names: the desktop redacts paths and media file names before sending, and the WebUI sends no item ids, file or preset names, or media URLs.
- Connected client/session diagnostics are available in Operator UI and `/control/status`.

## User data locations

Per-user data uses .NET `Environment.SpecialFolder` mappings:

- **Linux** (XDG): config / roaming (`ApplicationData`) → `~/.config/ReelRoulette/` (includes `library.db`). Local cache (`LocalApplicationData`) → `~/.local/share/ReelRoulette/` (thumbnails in `thumbnails/`).
- **Windows**: config / roaming (`ApplicationData`) → `%APPDATA%/ReelRoulette/`. Local cache (`LocalApplicationData`) → `%LOCALAPPDATA%/ReelRoulette/` (thumbnails in `thumbnails/`).

**Server data folder override:** Set `REELROULETTE_DATA_DIR` to run the server against another folder on any OS. The server then keeps its settings, catalog, backups, `last.log`, and thumbnails (in `thumbnails/`) under that folder and does not use the folders above. A relative path resolves against the working directory. Setting `APPDATA` does not move anything on Windows, because .NET resolves that folder through the OS. Scripts that start a server for verification or smoke testing set this variable to a fresh temporary folder, stop the server they started, and remove that folder afterward, including on failure. On Linux they also set `XDG_CONFIG_HOME` and `XDG_DATA_HOME`. Dev-run helpers such as `run-server.ps1` use your real data on purpose. The desktop client does not read this variable.

The server opens `library.db` in that roaming directory at startup (`user_version` 3). A `user_version` 2 catalog, from v0.14.0 or earlier, is migrated in place on that start in one transaction, and `last.log` records how long it took; an interrupted migration leaves the version 2 catalog as it was. After a newer build has opened a data folder, do not run v0.14.0 against it: v0.14.0 moves a catalog it does not recognize aside and then deletes its backups. Presets and thumbnail revision, width, and height live in the catalog. Core settings stay in `core-settings.json`. Desktop export saves a checkpoint of `library.db`, so presets and thumbnail metadata travel with it. Import replaces that database while the server is stopped, including the preset list, migrates a version 2 export as it imports it, and refuses to replace a catalog that a newer version saved. JPEG files stay in `thumbnails/` until the next completed thumbnail stage. Run a refresh after import. Server catalog backups are `library.db.backup.*` files in `backups/`.

When the server cannot use its catalog, it keeps running without a library instead of stopping:

- A `library.db`, `library.db.previous`, or `library.db.incoming` saved by a newer version of ReelRoulette (a higher `user_version`) is left exactly as it is. Updating ReelRoulette opens it.
- One of those files that ReelRoulette cannot open or read at the moment, for example because another program holds or locks it or the folder's permissions block it, is also left exactly as it is, since it cannot be checked.
- A `library.db` that is not a database, is corrupt, or has another schema, including a schema version before 2, is moved aside to `library.db.refused` (or `library.db.refused.1`, and so on).
- A migration from version 2 that cannot run, for example because another program holds the file, leaves `library.db` unchanged, like a file that cannot be read.
- An empty `library.db` is created only on a fresh install: no `library.db`, no `library.db.refused*` file, and no `library.db.backup.*` file in `backups/`.

Without a library, `last.log` has a warning with the reason, the Operator page shows it, and `/control/status` reports it in `libraryState` and `libraryMessage`. Library API routes answer 503 with that message. Catalog backups and refresh do not run, and settings, logs, restart, stop, and in-app update keep working.

Catalog backup rotation deletes only valid current-version backups beyond the backup count, oldest first. Backups at another schema version, such as version 2 backups from before the migration, and files it does not recognize stay in `backups/` until you remove them by hand, and they count toward neither the backup count nor the time between backups.

**Restoring a catalog backup by hand:**

1. Stop the server.
2. In the data folder, move `library.db`, `library.db.previous`, and `library.db.incoming`, each with any `-wal` and `-shm` file beside it, and any `library.db.refused*` files somewhere outside the data folder. Keep them until the restored library looks right.
3. Copy the backup you want from `backups/`, usually the newest `library.db.backup.*` file, into the data folder as `library.db`. A backup saved by a newer version opens only in that version or later. A version 2 backup is migrated when the server starts.
4. Start the server. If the Operator page still shows that there is no library, read the message there and in `last.log`.

To start over with an empty library instead, move `library.db`, `library.db.previous`, and `library.db.incoming` with their `-wal` and `-shm` files, every `library.db.refused*` file, and every `library.db.backup.*` file out of the data folder and `backups/`, then start the server.

## Velopack packaging and release

All shipping packages are produced by **`.github/workflows/release.yml`** (tag push or `workflow_dispatch`). The workflow:

- Validates `.version` against the requested tag.
- Builds **ServerApp** and **DesktopApp** self-contained for `win-x64` and `linux-x64`.
- Stages WebUI via **`stage-webui-assets.ps1`** on server legs.
- Bundles Windows FFmpeg (server) and relocates NuGet LibVLC (desktop) inline on Windows legs.
- Packs with **`vpk`** (Windows skips portable zips) and uploads feeds to Backblaze B2; stable tags also mirror **`Setup.exe`** and **`.AppImage`** to GitHub Releases.

Windows output is a per-user **`Setup.exe`** (no MSI, no portable zip). Linux output is a Velopack **AppImage**-style bundle. Update channels follow `{os}-{component}` for stable and `{os}-{component}-dev` for dev builds.

**Linux AppImage menu integration:** When `APPIMAGE` is set (running the downloaded `.AppImage` file), ServerApp and DesktopApp reconcile a Freedesktop launcher under `$XDG_DATA_HOME/applications/` (default `~/.local/share/applications/`) and hicolor icons on every startup—silent, no first-run flag. `dotnet run` and Windows builds skip registration. Dangling entries after deleting an AppImage are not removed automatically.

**Installed runtime:** ServerApp and DesktopApp call **`VelopackApp.Build().Run()`** at startup so Velopack **install/update/uninstall hook** invocations work. **Velopack-installed** builds also check the B2 feed: a background loop is **check-only**; download and apply are confirmed actions in Operator (`/control/update/*`) or Desktop Settings (stable or preview/dev via the dev-channel toggle). Unpackaged `dotnet run` sessions report not-installed and skip apply.

### Packaged-server smoke (Linux)

After local changes that affect server packaging, run:

```bash
./tools/scripts/verify-linux-packaged-server-smoke.sh
```

With no argument, the script publishes and `vpk pack`s a server AppImage (matching the workflow shape), using the workflow's `vpk` version, which it installs once under `artifacts/velopack-smoke/tools/` without touching a global `vpk` (override with `VPK_VERSION`). It then runs the AppImage headlessly with `--appimage-extract-and-run` when FUSE is unavailable. It checks `/health`, `/api/version`, `/control/status`, and `/operator`. It isolates **`XDG_CONFIG_HOME`** and **`XDG_DATA_HOME`** so menu registration and settings do not touch your real `~/.config` or `~/.local/share` tree.

## Release Versioning

Repo-root **`.version`** holds the canonical release version as a single v-prefixed semver2 line (for example `v0.12.0-dev`). Use one command to align release-version surfaces:

- `pwsh ./tools/scripts/set-release-version.ps1 -Version v0.14.1`
- Omit `-Version` to read `.version` and fan out without changing the file.
- By default, the script also updates the desktop app `<Version>`, runs `npm run generate:contracts` in WebUI, runs solution build/test plus WebUI verify and `verify-web-deploy.ps1`, and updates release command examples in `README.md` and `docs/dev-setup.md`.
- Use `-NoDocUpdates` to skip the README/dev-setup example updates.
- Use `-NoUpdateDesktopVersion`, `-NoRegenerateContracts`, and/or `-NoRunVerify` to skip desktop version, contract regeneration, or the verify steps respectively.

This updates:

- `.version` (when `-Version` is supplied)
- OpenAPI `info.version`
- server `assetsVersion` in `/api/version` response
- release-version test fixtures
- server app project `<Version>`
- `ReelRoulette.LibraryArchive` project `<Version>`
- desktop project `<Version>`

GitHub / B2 release flow:

- Run `set-release-version.ps1`, then `pwsh ./tools/scripts/cut-changelog.ps1 -Version {VERSION} -Name "{Release Name}"` to move `[Unreleased]` into the release section and update the footer compare links. It changes nothing if `[Unreleased]` is empty, the version already exists, or a heading is not one of the standard six.
- Commit and push.
- Create/publish the GitHub release notes for the tag.
- Push the **`v*`** tag matching `.version`. **`release.yml`** builds all matrix legs and publishes to B2 (stable also uploads to GitHub).

Reset testing checklist state, including `Failed:` and `Skipped:` notes, for a fresh run. Release version is filled from `.version` without its `-dev.N` suffix:

- `pwsh ./tools/scripts/reset-checklist.ps1`
- `pwsh ./tools/scripts/reset-checklist.ps1 -KeepMetadata`
- `pwsh ./tools/scripts/reset-checklist.ps1 -RemoveWaived`

Check `MILESTONES.md` and `MILESTONES-COMPLETED.md` against their maintenance rules:

- `pwsh ./tools/scripts/check-milestones.ps1` checks that milestone IDs appear only in section headers, the tracker line, and the Planned Releases outline; that the outline and the sections agree; and that every `Depends on`, and every milestone a `Not included` line names after "which is", is an existing milestone title.
- `-BaseRef HEAD` also checks that `MILESTONES-COMPLETED.md` only grew by entries moved in from Active or Planned, newest on top. `-Staged` checks the staged files instead of the working tree.
- `-BaseRef <previous release tag> -Release` does the same across a release, allowing completed entries that were planned after the tag. A base without `MILESTONES-COMPLETED.md` is refused.
- `pwsh ./tools/scripts/tests/test-scripts.ps1` runs the milestones checker, changelog cut script, and checklist reset script against the fixtures in `tools/scripts/tests/fixtures/`.

## Troubleshooting

- WebUI changes not appearing:
  - run `pwsh ./tools/scripts/run-server-rebuild.ps1` to rebuild before run.
- Version/capability startup blocks:
  - check `/api/version` and `/api/capabilities` output against expected client requirements.
- Velopack release workflow failures:
  - confirm `.version` matches the tag; inspect the failing matrix leg log (Windows ffprobe gate, LibVLC presence gate, or pack/upload steps).
- Packaged Linux server smoke failures:
  - re-run `./tools/scripts/verify-linux-packaged-server-smoke.sh` and inspect server stdout/stderr from the script.
