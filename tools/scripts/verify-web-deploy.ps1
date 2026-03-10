param(
    [int]$ServerPort = 51312
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$webUiPath = Join-Path $repoRoot "src\clients\web\ReelRoulette.WebUI"
$distPath = Join-Path $webUiPath "dist"
$serverProject = Join-Path $repoRoot "src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"
$serverOutLogPath = Join-Path $repoRoot ".verify-web-deploy-server.out.log"
$serverErrLogPath = Join-Path $repoRoot ".verify-web-deploy-server.err.log"

Push-Location $webUiPath
try {
    npm install
    npm run build
}
finally {
    Pop-Location
}

$listenUrl = "http://localhost:$ServerPort"
if (Test-Path $serverOutLogPath) {
    Remove-Item $serverOutLogPath -Force
}
if (Test-Path $serverErrLogPath) {
    Remove-Item $serverErrLogPath -Force
}
$serverProcess = Start-Process dotnet -ArgumentList @(
    "run",
    "--project",
    $serverProject,
    "--",
    "--CoreServer:ListenUrl=$listenUrl",
    "--ServerApp:WebUiStaticRootPath=$distPath"
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $serverOutLogPath -RedirectStandardError $serverErrLogPath

try {
    $healthUrl = "$listenUrl/health"
    $healthReady = $false
    for ($i = 0; $i -lt 40; $i++) {
        if ($serverProcess.HasExited) {
            throw "Server process exited before health check completed. See logs: $serverOutLogPath and $serverErrLogPath."
        }

        try {
            $health = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) {
                $healthReady = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }

    if (-not $healthReady) {
        throw "Timed out waiting for health endpoint at $healthUrl. See logs: $serverOutLogPath and $serverErrLogPath."
    }

    $indexResponse = Invoke-WebRequest -Uri "$listenUrl/" -UseBasicParsing -TimeoutSec 5
    if ([string]::IsNullOrWhiteSpace($indexResponse.Content)) {
        throw "Expected non-empty index.html response."
    }

    $runtimeConfigResponse = Invoke-WebRequest -Uri "$listenUrl/runtime-config.json" -UseBasicParsing -TimeoutSec 5
    $runtimeCache = $runtimeConfigResponse.Headers["Cache-Control"]
    if ($runtimeCache -notlike "*no-store*") {
        throw "Expected runtime-config Cache-Control no-store, got '$runtimeCache'."
    }
    $runtimeJson = $runtimeConfigResponse.Content | ConvertFrom-Json
    if ($runtimeJson.apiBaseUrl -ne $listenUrl) {
        throw "Expected apiBaseUrl '$listenUrl', got '$($runtimeJson.apiBaseUrl)'."
    }
    if ($runtimeJson.sseUrl -ne "$listenUrl/api/events") {
        throw "Expected sseUrl '$listenUrl/api/events', got '$($runtimeJson.sseUrl)'."
    }

    $assetMatch = [regex]::Match($indexResponse.Content, "assets/[^""']+\.(js|css)")
    if (-not $assetMatch.Success) {
        throw "Could not find fingerprinted asset path in index.html."
    }

    $assetPath = $assetMatch.Value
    $assetResponse = Invoke-WebRequest -Uri "$listenUrl/$assetPath" -UseBasicParsing -TimeoutSec 5
    $assetCache = $assetResponse.Headers["Cache-Control"]
    if ($assetCache -notlike "*immutable*") {
        throw "Expected asset Cache-Control immutable, got '$assetCache'."
    }

    $capabilitiesResponse = Invoke-WebRequest -Uri "$listenUrl/api/capabilities" -UseBasicParsing -TimeoutSec 5
    if ($capabilitiesResponse.StatusCode -ne 200) {
        throw "Expected /api/capabilities to return 200."
    }

    $controlStatusResponse = Invoke-WebRequest -Uri "$listenUrl/control/status" -UseBasicParsing -TimeoutSec 5
    if ($controlStatusResponse.StatusCode -ne 200) {
        throw "Expected /control/status to return 200."
    }

    $controlSettingsGet = Invoke-WebRequest -Uri "$listenUrl/control/settings" -UseBasicParsing -TimeoutSec 5
    if ($controlSettingsGet.StatusCode -ne 200) {
        throw "Expected /control/settings GET to return 200."
    }

    $controlSettingsPost = Invoke-WebRequest -Uri "$listenUrl/control/settings" -UseBasicParsing -TimeoutSec 5 -Method Post -ContentType "application/json" -Body '{"adminAuthMode":"Off","adminSharedToken":null}'
    if ($controlSettingsPost.StatusCode -ne 200) {
        throw "Expected /control/settings POST to return 200."
    }

    if ($serverProcess.HasExited) {
        throw "Server process exited unexpectedly during validation."
    }

    Write-Output "Single-origin and control-plane server smoke verification passed."
}
finally {
    if (-not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
}
