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

$listenHost = if ($BindOnLan.IsPresent) { "0.0.0.0" } else { "localhost" }
$listenUrl = "http://$listenHost`:$Port"
$healthUrl = "http://localhost:$Port/health"
$defaultWebUiDist = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "src\clients\web\ReelRoulette.WebUI\dist"

$env:CoreServer__ListenUrl = $listenUrl
$env:CoreServer__RequireAuth = if ($RequireAuth.IsPresent) { "true" } else { "false" }
$env:CoreServer__BindOnLan = if ($BindOnLan.IsPresent) { "true" } else { "false" }
$env:CoreServer__TrustLocalhost = if ($DisableLocalhostTrust.IsPresent) { "false" } else { "true" }
$env:CoreServer__PairingToken = $PairingToken
if (-not $env:ServerApp__WebUiStaticRootPath) {
    $env:ServerApp__WebUiStaticRootPath = $defaultWebUiDist
}

Write-Host "Starting ReelRoulette.ServerApp..."
Write-Host "  Listen URL: $listenUrl"
Write-Host "  Health URL: $healthUrl"
Write-Host "  WebUI static root: $($env:ServerApp__WebUiStaticRootPath)"
Write-Host "  Require auth: $($RequireAuth.IsPresent)"
Write-Host "  Bind on LAN: $($BindOnLan.IsPresent)"
Write-Host "  Trust localhost: $(-not $DisableLocalhostTrust.IsPresent)"
if ($RequireAuth.IsPresent) {
    Write-Host "  Pairing token: $PairingToken"
}
Write-Host "Verification hint: GET $healthUrl"

dotnet run --project ".\src\core\ReelRoulette.ServerApp\ReelRoulette.ServerApp.csproj"
if ($LASTEXITCODE -ne 0) {
    Write-Error "ServerApp exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}
