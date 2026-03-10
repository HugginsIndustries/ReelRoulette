param(
    [int]$Port = 51234,
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$distPath = Join-Path $repoRoot "src\clients\web\ReelRoulette.WebUI\dist"
Push-Location $repoRoot
try {
    Write-Host "Building WebUI for ServerApp static serving..."
    Push-Location "src\clients\web\ReelRoulette.WebUI"
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

    $scriptArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $PSScriptRoot "run-server.ps1"),
        "-Port", $Port.ToString(),
        "-PairingToken", $PairingToken
    )
    if ($RequireAuth.IsPresent) { $scriptArgs += "-RequireAuth" }
    if ($BindOnLan.IsPresent) { $scriptArgs += "-BindOnLan" }
    if ($DisableLocalhostTrust.IsPresent) { $scriptArgs += "-DisableLocalhostTrust" }

    & powershell @scriptArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "run-server.ps1 exited with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
