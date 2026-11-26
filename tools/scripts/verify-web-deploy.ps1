#!/usr/bin/env pwsh
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "webui-packages.ps1")

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$webUiPath = Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI"
$distPath = Join-Path $webUiPath "dist"
$serverProject = Join-Path $repoRoot "src" "core" "ReelRoulette.ServerApp" "ReelRoulette.ServerApp.csproj"
$serverOutLogPath = Join-Path $repoRoot ".verify-web-deploy-server.out.log"
$serverErrLogPath = Join-Path $repoRoot ".verify-web-deploy-server.err.log"

# Asks the OS for a free loopback port, so runs in parallel checkouts don't collide.
function Get-FreeLocalPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return $listener.LocalEndpoint.Port
    }
    finally {
        $listener.Stop()
    }
}

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

# True when the process is the one this script started or its direct child: dotnet run starts the server as its child.
function Test-StartedServerProcess {
    param(
        [int]$ProcessId,
        [System.Diagnostics.Process]$Started
    )

    if ($ProcessId -le 0 -or $null -eq $Started) {
        return $false
    }
    if ($ProcessId -eq $Started.Id) {
        return $true
    }
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    return $null -ne $process -and $null -ne $process.Parent -and $process.Parent.Id -eq $Started.Id
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

# Verification scripts must not read or write the developer's real data folders.
# REELROULETTE_DATA_DIR moves the server's settings, catalog, backups, logs, and thumbnails on every OS.
# On Linux, XDG_CONFIG_HOME and XDG_DATA_HOME also keep anything else the host writes out of ~/.config and ~/.local/share.
$isolatedRoot = Join-Path ([IO.Path]::GetTempPath()) ("reelroulette-verify-web-deploy-" + [Guid]::NewGuid().ToString("N"))
$isolatedDataDir = Join-Path $isolatedRoot "data"
$isolatedConfigHome = Join-Path $isolatedRoot "xdg-config"
$isolatedDataHome = Join-Path $isolatedRoot "xdg-data"
foreach ($dir in @($isolatedDataDir, $isolatedConfigHome, $isolatedDataHome)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$serverPort = 0
$serverProcess = $null
$serverListenProcessId = 0

try {
    Install-WebUiPackages -WebUiPath $webUiPath
    Push-Location $webUiPath
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $serverPort = Get-FreeLocalPort
    $listenUrl = "http://localhost:$serverPort"
    $framework = if ($IsWindows) { "net10.0-windows" } else { "net10.0" }
    if (Test-Path $serverOutLogPath) {
        Remove-Item $serverOutLogPath -Force
    }
    if (Test-Path $serverErrLogPath) {
        Remove-Item $serverErrLogPath -Force
    }

    $isolatedEnv = @{
        REELROULETTE_DATA_DIR = $isolatedDataDir
    }
    if (-not $IsWindows) {
        $isolatedEnv["XDG_CONFIG_HOME"] = $isolatedConfigHome
        $isolatedEnv["XDG_DATA_HOME"] = $isolatedDataHome
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

    # Fail rather than test, and later stop, a server some other run started on this port.
    $listenProcessId = Get-TcpListenerProcessId -Port $serverPort
    if (-not (Test-StartedServerProcess -ProcessId $listenProcessId -Started $serverProcess)) {
        throw "Port $serverPort answered health checks, but the server listening on it is not the one this run started."
    }
    $serverListenProcessId = $listenProcessId

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

    $controlSettings = $controlSettingsGet.Content | ConvertFrom-Json
    if ($controlSettings.adminAuthMode -ne "TokenRequired" -or [string]::IsNullOrWhiteSpace($controlSettings.adminSharedToken)) {
        throw "Expected /control/settings to report TokenRequired and a generated control token."
    }

    $controlSettingsBody = @{ adminAuthMode = "TokenRequired"; adminSharedToken = $controlSettings.adminSharedToken } | ConvertTo-Json -Compress
    $controlSettingsPost = Invoke-WebRequest -Uri "$listenUrl/control/settings" -UseBasicParsing -TimeoutSec 5 -Method Post -ContentType "application/json" -Body $controlSettingsBody
    if ($controlSettingsPost.StatusCode -ne 200) {
        throw "Expected /control/settings POST to return 200."
    }
    if (-not ($controlSettingsPost.Content | ConvertFrom-Json).result.accepted) {
        throw "Expected /control/settings POST with the current control token to be accepted."
    }

    # Localhost is trusted for every control route, including the testing routes.
    $testingReset = Invoke-WebRequest -Uri "$listenUrl/control/testing/reset" -UseBasicParsing -TimeoutSec 5 -Method Post
    if ($testingReset.StatusCode -ne 200) {
        throw "Expected localhost /control/testing/reset to return 200 without the control token."
    }

    if ($serverProcess.HasExited) {
        throw "Server process exited unexpectedly during validation."
    }

    foreach ($expected in @("last.log", "library.db", "core-settings.json")) {
        if (-not (Test-Path (Join-Path $isolatedDataDir $expected))) {
            throw "Expected server data file '$expected' under REELROULETTE_DATA_DIR ($isolatedDataDir)."
        }
    }
    if (-not $IsWindows) {
        foreach ($xdgHome in @($isolatedConfigHome, $isolatedDataHome)) {
            if (Test-Path (Join-Path $xdgHome "ReelRoulette")) {
                throw "Server wrote a ReelRoulette folder under $xdgHome instead of REELROULETTE_DATA_DIR."
            }
        }
    }

    Write-Output "Single-origin and control-plane server smoke verification passed."
}
finally {
    # Stop only the server this run started, whoever else listens on the port.
    if ($serverListenProcessId -le 0 -and $null -ne $serverProcess) {
        $listenProcessId = Get-TcpListenerProcessId -Port $serverPort
        if (Test-StartedServerProcess -ProcessId $listenProcessId -Started $serverProcess) {
            $serverListenProcessId = $listenProcessId
        }
    }
    Stop-StartedServerProcess -Process $serverProcess -ListenProcessId $serverListenProcessId
    if (Test-Path $isolatedRoot) {
        Remove-Item -Path $isolatedRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
