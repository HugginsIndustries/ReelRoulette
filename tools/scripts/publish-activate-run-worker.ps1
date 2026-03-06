param()

$ErrorActionPreference = "Stop"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet SDK not found in PATH."
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
    $versionId = "reel-webui-" + [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")
    Write-Host "Publishing and activating WebUI version: $versionId"

    .\tools\scripts\publish-web.ps1 -VersionId $versionId
    .\tools\scripts\activate-web-version.ps1 -VersionId $versionId

    Get-Content ".\.web-deploy\active-manifest.json"

    dotnet run --project ".\src\core\ReelRoulette.Worker\ReelRoulette.Worker.csproj" -- --CoreServer:BindOnLan=true
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Worker exited with code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
