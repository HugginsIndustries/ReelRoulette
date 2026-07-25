#!/usr/bin/env pwsh
param(
    [int]$ServerPort = 51312
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$webUiPath = Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI"
$distPath = Join-Path $webUiPath "dist"
$serverProject = Join-Path $repoRoot "src" "core" "ReelRoulette.ServerApp" "ReelRoulette.ServerApp.csproj"
$serverOutLogPath = Join-Path $repoRoot ".verify-web-deploy-server.out.log"
$serverErrLogPath = Join-Path $repoRoot ".verify-web-deploy-server.err.log"

function Get-TcpListenerProcessId {
    param([int]$Port)

    if ($IsWindows) {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $conn) {
            return $null
        }
        return [int]$conn.OwningProcess
    }

    $ssLines = & ss -tlnp 2>$null
    foreach ($line in $ssLines) {
        if ($line -notmatch ":$Port(\s|\*)") {
            continue
        }
        $match = [regex]::Match($line, 'pid=(\d+)')
        if ($match.Success) {
            return [int]$match.Groups[1].Value
        }
    }
    return $null
}

function Stop-StartedProcessById {
    param(
        [int]$ProcessId,
        [int]$GracefulTimeoutMs = 5000
    )

    if ($ProcessId -le 0) {
        return
    }

    try {
        Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
    }
    catch {
        # Best-effort graceful stop (SIGTERM on Linux, close message on Windows).
    }

    try {
        $proc = [System.Diagnostics.Process]::GetProcessById($ProcessId)
        if ($proc.WaitForExit($GracefulTimeoutMs)) {
            return
        }

        $proc.Kill($true)
        $proc.WaitForExit($GracefulTimeoutMs) | Out-Null
    }
    catch {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Stop-StartedServerProcess {
    param(
        [System.Diagnostics.Process]$Process,
        [int]$ListenProcessId = 0,
        [int]$GracefulTimeoutMs = 5000
    )

    $idsToStop = New-Object System.Collections.Generic.List[int]
    if ($ListenProcessId -gt 0) {
        $idsToStop.Add($ListenProcessId) | Out-Null
    }
    if ($null -ne $Process -and -not $Process.HasExited) {
        if (-not $idsToStop.Contains($Process.Id)) {
            $idsToStop.Add($Process.Id) | Out-Null
        }
    }

    foreach ($processId in $idsToStop) {
        Stop-StartedProcessById -ProcessId $processId -GracefulTimeoutMs $GracefulTimeoutMs
    }
}

# Verification scripts must not read or write the developer's real ApplicationData settings.
# .NET resolves SpecialFolder.ApplicationData from APPDATA (Windows) or XDG_CONFIG_HOME (Linux).
$isolatedConfigHome = Join-Path ([IO.Path]::GetTempPath()) ("reelroulette-verify-web-deploy-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $isolatedConfigHome -Force | Out-Null

$serverProcess = $null
$serverListenProcessId = 0

try {
    Push-Location $webUiPath
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $listenUrl = "http://localhost:$ServerPort"
    $framework = if ($IsWindows) { "net10.0-windows" } else { "net10.0" }
    if (Test-Path $serverOutLogPath) {
        Remove-Item $serverOutLogPath -Force
    }
    if (Test-Path $serverErrLogPath) {
        Remove-Item $serverErrLogPath -Force
    }

    $isolatedEnv = @{}
    if ($IsWindows) {
        $isolatedEnv["APPDATA"] = $isolatedConfigHome
    }
    else {
        $isolatedEnv["XDG_CONFIG_HOME"] = $isolatedConfigHome
    }

    $startProcessArgs = @{
        FilePath         = "dotnet"
        ArgumentList     = @(
            "run",
            "--framework",
            $framework,
            "--project",
            $serverProject,
            "--",
            "--CoreServer:ListenUrl=$listenUrl",
            "--ServerApp:WebUiStaticRootPath=$distPath"
        )
        PassThru         = $true
        RedirectStandardOutput = $serverOutLogPath
        RedirectStandardError  = $serverErrLogPath
        Environment      = $isolatedEnv
    }
    if ($IsWindows) {
        $startProcessArgs.WindowStyle = "Hidden"
    }
    $serverProcess = Start-Process @startProcessArgs

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

        $serverListenProcessId = Get-TcpListenerProcessId -Port $ServerPort

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
    if ($serverListenProcessId -le 0) {
        $serverListenProcessId = Get-TcpListenerProcessId -Port $ServerPort
    }
    if ($null -eq $serverListenProcessId) {
        $serverListenProcessId = 0
    }
    Stop-StartedServerProcess -Process $serverProcess -ListenProcessId $serverListenProcessId
    if (Test-Path $isolatedConfigHome) {
        Remove-Item -Path $isolatedConfigHome -Recurse -Force -ErrorAction SilentlyContinue
    }
}
