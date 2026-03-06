# M7d Gate B Manual Verification Instructions + User Checklist

Use this guide **after Gate A passes**. Do not continue to Gate C/legacy removal until this checklist is complete and reviewed.

## 1) Prepare Versioned Web Deploy

```powershell
cd "C:\dev\ReelRoulette\ReelRoulette"
```

```powershell
$versionId = "m7d-gateb-" + [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")
```

```powershell
.\tools\scripts\publish-web.ps1 -VersionId $versionId
```

```powershell
.\tools\scripts\activate-web-version.ps1 -VersionId $versionId
```

```powershell
Get-Content ".\.web-deploy\active-manifest.json"
```

## 2) Start Runtime Components

Start Worker/Core in one terminal:

```powershell
dotnet run --project ".\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj" -- --CoreServer:CorsAllowedOrigins:0=http://localhost:51302 --CoreServer:CorsAllowedOrigins:1=http://127.0.0.1:51302 --CoreServer:CorsAllowedOrigins:2=http://localhost:5173 --CoreServer:CorsAllowedOrigins:3=http://127.0.0.1:5173
```

Start WebHost in a second terminal:

```powershell
cd "C:\dev\ReelRoulette\ReelRoulette"
```

```powershell
dotnet run --project .\src\clients\web\ReelRoulette.WebHost\ReelRoulette.WebHost.csproj -- --WebDeployment:ListenUrl=http://localhost:51302 --WebDeployment:DeployRootPath="C:\dev\ReelRoulette\ReelRoulette\.web-deploy"
```

All-in-one: publish WebUI, activate latest version, and run worker.

```powershell
.\tools\scripts\publish-activate-run-worker.ps1
```

## 3) Quick Sanity Checks

```powershell
curl.exe -sSI "http://localhost:51302/" | findstr /I "X-ReelRoulette-Web-Version Cache-Control"
```

```powershell
curl.exe -sS "http://localhost:51301/health"
```

```powershell
curl.exe -sS "http://localhost:51301/api/presets"
```

## 4) User Checklist (PASS/FAIL)

Copy this section and fill it in during testing.

```text
M7d Gate B Manual Verification - User Checklist
Date:
Tester:
Build/Version:
Environment (localhost/LAN, browser, OS):

Section A - WebUI UX Parity (legacy WebRemote -> ReelRoulette.WebUI)
[ ] PASS / [ ] FAIL - A1. Main media player page loads and basic layout matches expected legacy workflow.
Notes:
[ ] PASS / [ ] FAIL - A2. Custom media controls function correctly (play/pause/seek/next/previous/loop/autoplay/fullscreen as applicable).
Notes:
[ ] PASS / [ ] FAIL - A3. Time/progress UI updates correctly during playback and seeking.
Notes:
[ ] PASS / [ ] FAIL - A4. Favorite and blacklist actions work end-to-end and UI reflects updated state.
Notes:
[ ] PASS / [ ] FAIL - A5. Tag editor opens and renders expected category/tag model.
Notes:
[ ] PASS / [ ] FAIL - A6. Tag editor mutations work (add/edit/delete category/tag + apply item tags) and persist via API/core.
Notes:
[ ] PASS / [ ] FAIL - A7. Refresh/status-related UI parity behaviors remain correct during running/failure/completion states.
Notes:

Section B - Direct Web-to-Core Reliability (no legacy bridge dependency)
[ ] PASS / [ ] FAIL - B1. Pair/auth session bootstrap succeeds using expected token/config path.
Notes:
[ ] PASS / [ ] FAIL - B2. Session continuity holds across reload/navigation in expected scenarios.
Notes:
[ ] PASS / [ ] FAIL - B3. SSE connection establishes and reconnect behavior is healthy after temporary disconnect.
Notes:
[ ] PASS / [ ] FAIL - B4. No user-visible dependency on legacy embedded WebRemote routes/endpoints during normal use.
Notes:

Section C - Desktop Settings Continuity
[ ] PASS / [ ] FAIL - C1. Desktop "enable/disable web server" control behaves correctly and predictably.
Notes:
[ ] PASS / [ ] FAIL - C2. LAN bind/access control behavior matches expected semantics.
Notes:
[ ] PASS / [ ] FAIL - C3. Hostname behavior for reel.local is preserved/clearly surfaced as expected.
Notes:
[ ] PASS / [ ] FAIL - C4. Auth/token-related desktop settings remain functional and map correctly to runtime behavior.
Notes:
[ ] PASS / [ ] FAIL - C5. No desktop settings UI regressions/errors introduced by migration.
Notes:

Section D - Regression Sanity
[ ] PASS / [ ] FAIL - D1. Core desktop workflows remain stable while WebUI is active.
Notes:
[ ] PASS / [ ] FAIL - D2. No critical console/log/runtime errors observed during above checks.
Notes:

Overall Gate B Result:
[ ] PASS - All required checks passed.
[ ] FAIL - One or more required checks failed (list blocking items below).

Blocking Items / Follow-ups:
1.
2.
3.
```
