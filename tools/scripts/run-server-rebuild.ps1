#!/usr/bin/env pwsh
param(
    [int]$Port = 45123,
    [switch]$RequireAuth,
    [switch]$BindOnLan,
    [switch]$DisableLocalhostTrust,
    [string]$PairingToken = "reelroulette-dev-token"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet SDK not found in PATH."
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found in PATH."
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path
$webProjectDir = Join-Path $repoRoot "src" "clients" "web" "ReelRoulette.WebUI"
$distPath = Join-Path $webProjectDir "dist"
Push-Location $repoRoot
try {
    Write-Host "Building WebUI for ServerApp static serving..."
    Push-Location $webProjectDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "npm run build failed with code $LASTEXITCODE."
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path $distPath)) {
        Write-Error "WebUI build output was not found at $distPath."
        exit 1
    }

    $env:ServerApp__WebUiStaticRootPath = $distPath
    $framework = if ($IsWindows) { "net10.0-windows" } else { "net10.0" }

    $runServerScript = Join-Path $PSScriptRoot "run-server.ps1"
    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if (-not $pwsh) {
        Write-Error "pwsh was not found in PATH."
        exit 1
    }

    $scriptArgs = @(
        "-NoProfile",
        "-File", $runServerScript,
        "-Port", $Port.ToString(),
        "-Framework", $framework,
        "-PairingToken", $PairingToken
    )
    if ($RequireAuth.IsPresent) { $scriptArgs += "-RequireAuth" }
    if ($BindOnLan.IsPresent) { $scriptArgs += "-BindOnLan" }
    if ($DisableLocalhostTrust.IsPresent) { $scriptArgs += "-DisableLocalhostTrust" }

    & $pwsh @scriptArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "run-server.ps1 exited with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
