param(
    [int]$Port = 51301,
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

$env:CoreServer__ListenUrl = $listenUrl
$env:CoreServer__RequireAuth = if ($RequireAuth.IsPresent) { "true" } else { "false" }
$env:CoreServer__BindOnLan = if ($BindOnLan.IsPresent) { "true" } else { "false" }
$env:CoreServer__TrustLocalhost = if ($DisableLocalhostTrust.IsPresent) { "false" } else { "true" }
$env:CoreServer__PairingToken = $PairingToken

Write-Host "Starting ReelRoulette.Worker..."
Write-Host "  Listen URL: $listenUrl"
Write-Host "  Health URL: $healthUrl"
Write-Host "  Require auth: $($RequireAuth.IsPresent)"
Write-Host "  Bind on LAN: $($BindOnLan.IsPresent)"
Write-Host "  Trust localhost: $(-not $DisableLocalhostTrust.IsPresent)"
if ($RequireAuth.IsPresent) {
    Write-Host "  Pairing token: $PairingToken"
}
Write-Host "Verification hint: GET $healthUrl"

dotnet run --project ".\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Worker exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}
