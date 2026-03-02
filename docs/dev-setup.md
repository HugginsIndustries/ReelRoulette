# Development Setup

## Projects

- Existing desktop runtime: `source/ReelRoulette.csproj`
- Core library: `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- Server stub: `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`
- Worker stub: `src/core/ReelRoulette.Worker/ReelRoulette.Worker.csproj`
- Windows target location: `src/clients/windows/ReelRoulette.WindowsApp/ReelRoulette.WindowsApp.csproj`
- Web target location: `src/clients/web/ReelRoulette.WebUI/ReelRoulette.WebUI.csproj`

## Migration Notes

- During M0/M1, desktop startup/playback continues from the existing `source` project.
- Core logic moves incrementally and is consumed through desktop adapter classes.
- New projects are scaffolded now so later milestones can migrate hosting and clients without repo churn.
