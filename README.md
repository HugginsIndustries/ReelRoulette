# ReelRoulette

random video player that mostly works

## Building and Running

You need the .NET SDK installed (version compatible with the `TargetFramework` in this repo's `.csproj` files).

From the repository root:

```bash
dotnet build ReelRoulette.sln
```

Run the desktop app:

```bash
dotnet run --project .\source\ReelRoulette.csproj
```

Optional: run additional hosts/scaffolds:

```bash
dotnet run --project .\src\core\ReelRoulette.Server\ReelRoulette.Server.csproj
dotnet run --project .\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj
```

Or run worker via helper scripts:

```bash
.\tools\scripts\run-core.ps1
./tools/scripts/run-core.sh
```

M4 runtime notes:

- `ReelRoulette.Worker` hosts the API/SSE runtime using shared server endpoint composition.
- Pairing/auth primitive is available through `/api/pair` with optional localhost trust and token/cookie enforcement for paired clients.
- SSE reconnect supports `Last-Event-ID` replay and `POST /api/library-states` authoritative resync when history gaps are detected.

## Testing

Default test gate:

```bash
dotnet test ReelRoulette.sln
```

Core verification system checks (verbose mode):

```bash
dotnet run --project .\src\core\ReelRoulette.Core.SystemChecks\ReelRoulette.Core.SystemChecks.csproj -- --verbose
```

Worker runtime independence check (desktop close should not stop worker):

```bash
# 1) Start desktop, then use View > Start Core Runtime
# 2) Verify worker health while desktop is open
Invoke-WebRequest -UseBasicParsing http://localhost:51301/health | Select-Object -ExpandProperty Content

# 3) Close desktop, then verify worker still responds
Invoke-WebRequest -UseBasicParsing http://localhost:51301/health | Select-Object -ExpandProperty Content

# 4) Optional stronger check
Invoke-WebRequest -UseBasicParsing http://localhost:51301/api/version | Select-Object -ExpandProperty Content
```

Expected results:

- `/health` returns `{"status":"ok"}` before and after desktop closes.
- `/api/version` remains reachable after desktop closes (worker keeps running independently).

## Third-Party Components

This program bundles VLC (VideoLAN) and FFprobe from FFmpeg. They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.
