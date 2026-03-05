param(
    [string]$DeployRoot = "",
    [int]$WebHostPort = 51312
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($DeployRoot)) {
    $DeployRoot = Join-Path $repoRoot ".web-deploy-smoke"
}

if (Test-Path $DeployRoot) {
    Remove-Item -Path $DeployRoot -Recurse -Force
}

$publishScript = Join-Path $PSScriptRoot "publish-web.ps1"
$activateScript = Join-Path $PSScriptRoot "activate-web-version.ps1"
$rollbackScript = Join-Path $PSScriptRoot "rollback-web-version.ps1"
$webHostProject = Join-Path $repoRoot "src\clients\web\ReelRoulette.WebHost\ReelRoulette.WebHost.csproj"

$version1 = "m7c-smoke-v1-" + [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")
$version2 = "m7c-smoke-v2-" + [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")

& $publishScript -VersionId $version1 -DeployRoot $DeployRoot
& $publishScript -VersionId $version2 -DeployRoot $DeployRoot -SkipInstall
& $activateScript -VersionId $version1 -DeployRoot $DeployRoot

$listenUrl = "http://localhost:$WebHostPort"
$webHostProcess = Start-Process dotnet -ArgumentList @(
    "run",
    "--project",
    $webHostProject,
    "--",
    "--WebDeployment:ListenUrl=$listenUrl",
    "--WebDeployment:DeployRootPath=$DeployRoot"
) -PassThru -WindowStyle Hidden

try {
    $healthUrl = "$listenUrl/health"
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $health = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) {
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }

    $indexResponse = Invoke-WebRequest -Uri "$listenUrl/" -UseBasicParsing
    $activeHeaderV1 = $indexResponse.Headers["X-ReelRoulette-Web-Version"]
    if ($activeHeaderV1 -ne $version1) {
        throw "Expected active version header '$version1', got '$activeHeaderV1'."
    }

    $indexCache = $indexResponse.Headers["Cache-Control"]
    if ($indexCache -notlike "*no-store*") {
        throw "Expected index Cache-Control no-store, got '$indexCache'."
    }

    $runtimeConfigResponse = Invoke-WebRequest -Uri "$listenUrl/runtime-config.json" -UseBasicParsing
    $runtimeCache = $runtimeConfigResponse.Headers["Cache-Control"]
    if ($runtimeCache -notlike "*no-store*") {
        throw "Expected runtime-config Cache-Control no-store, got '$runtimeCache'."
    }

    $assetMatch = [regex]::Match($indexResponse.Content, "assets/[^""']+\.(js|css)")
    if (-not $assetMatch.Success) {
        throw "Could not find fingerprinted asset path in index.html."
    }

    $assetPath = $assetMatch.Value
    $assetResponse = Invoke-WebRequest -Uri "$listenUrl/$assetPath" -UseBasicParsing
    $assetCache = $assetResponse.Headers["Cache-Control"]
    if ($assetCache -notlike "*immutable*") {
        throw "Expected asset Cache-Control immutable, got '$assetCache'."
    }

    & $activateScript -VersionId $version2 -DeployRoot $DeployRoot
    Start-Sleep -Milliseconds 400
    $indexV2 = Invoke-WebRequest -Uri "$listenUrl/" -UseBasicParsing
    $activeHeaderV2 = $indexV2.Headers["X-ReelRoulette-Web-Version"]
    if ($activeHeaderV2 -ne $version2) {
        throw "Expected active version header '$version2' after activation, got '$activeHeaderV2'."
    }

    if ($webHostProcess.HasExited) {
        throw "Web host exited unexpectedly during activation switch."
    }

    & $rollbackScript -DeployRoot $DeployRoot
    Start-Sleep -Milliseconds 400
    $indexRollback = Invoke-WebRequest -Uri "$listenUrl/" -UseBasicParsing
    $activeHeaderRollback = $indexRollback.Headers["X-ReelRoulette-Web-Version"]
    if ($activeHeaderRollback -ne $version1) {
        throw "Expected active version header '$version1' after rollback, got '$activeHeaderRollback'."
    }

    if ($webHostProcess.HasExited) {
        throw "Web host exited unexpectedly during rollback switch."
    }

    Write-Output "M7c web deploy smoke verification passed."
}
finally {
    if (-not $webHostProcess.HasExited) {
        Stop-Process -Id $webHostProcess.Id -Force
    }
}
