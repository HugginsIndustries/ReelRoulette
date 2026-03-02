# Development Setup

## Projects

- Existing desktop runtime: `source/ReelRoulette.csproj`
- Core library: `src/core/ReelRoulette.Core/ReelRoulette.Core.csproj`
- Server stub: `src/core/ReelRoulette.Server/ReelRoulette.Server.csproj`
- Worker stub: `src/core/ReelRoulette.Worker/ReelRoulette.Worker.csproj`
- Windows target location: `src/clients/windows/ReelRoulette.WindowsApp/ReelRoulette.WindowsApp.csproj`
- Web target location: `src/clients/web/ReelRoulette.WebUI/ReelRoulette.WebUI.csproj`
- Core test gate: `src/core/ReelRoulette.Core.Tests/ReelRoulette.Core.Tests.csproj`
- Core system-check harness: `src/core/ReelRoulette.Core.SystemChecks/ReelRoulette.Core.SystemChecks.csproj`

## Migration Notes

- During M0/M1, desktop startup/playback continues from the existing `source` project.
- Core logic moves incrementally and is consumed through desktop adapter classes.
- New projects are scaffolded now so later milestones can migrate hosting and clients without repo churn.

## Verification Workflow (M2)

- Default fast gate: `dotnet test ReelRoulette.sln`
- Optional system checks with verbose output:
  - `dotnet run --project .\\src\\core\\ReelRoulette.Core.SystemChecks\\ReelRoulette.Core.SystemChecks.csproj -- --verbose`
- Shared verification logic lives in `src/core/ReelRoulette.Core/Verification/CoreVerification.cs` and is reused by both test and harness flows.

## M3 Reconnect/Resync Notes

- `GET /api/events` supports reconnect using `Last-Event-ID`.
- Server replays retained events newer than the supplied revision.
- If a reconnect misses more history than replay retention, server emits `resyncRequired`.
- Client recovers by calling `POST /api/library-states` to re-fetch authoritative state.
