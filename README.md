# ReelRoulette

random video player that mostly works

## Building and Running

You need the .NET SDK installed (version compatible with the `TargetFramework` in `source/ReelRoulette.csproj`).

From the repository root:

```bash
cd ReelRoulette
dotnet run --project .\source\ReelRoulette.csproj
```

Or directly from the project folder:

```bash
cd ReelRoulette\source
dotnet run
```

To build without running:

```bash
cd ReelRoulette\source
dotnet build
```

## Third-Party Components

This program bundles VLC (VideoLAN) and FFprobe from FFmpeg. They are licensed under the GNU GPL and LGPL respectively. See the `licenses/` folder for license texts and [https://www.videolan.org](https://www.videolan.org) and [https://ffmpeg.org](https://ffmpeg.org) for source code.
