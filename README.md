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

## Testing

Default test gate:

```bash
dotnet test ReelRoulette.sln
```

Core verification system checks (verbose mode):

```bash
dotnet run --project .\src\core\ReelRoulette.Core.SystemChecks\ReelRoulette.Core.SystemChecks.csproj -- --verbose
```

## Third-Party Components

This program bundles VLC (VideoLAN) and FFprobe from FFmpeg. They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.
