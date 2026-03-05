param(
    [Parameter(Mandatory = $true)]
    [string]$VersionId,
    [string]$DeployRoot = ""
)

$ErrorActionPreference = "Stop"

function Write-AtomicJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Json
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $tmpPath = "$Path.tmp"
    Set-Content -Path $tmpPath -Value $Json -NoNewline

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Move-Item -Path $tmpPath -Destination $Path -Force
            return
        }
        catch {
            if ($attempt -eq 5) {
                throw
            }

            Start-Sleep -Milliseconds (100 * $attempt)
        }
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($DeployRoot)) {
    $DeployRoot = Join-Path $repoRoot ".web-deploy"
}

$versionDir = Join-Path $DeployRoot "versions\$VersionId"
if (-not (Test-Path $versionDir)) {
    throw "Version '$VersionId' does not exist at '$versionDir'."
}

$manifestPath = Join-Path $DeployRoot "active-manifest.json"
$previousVersion = $null
if (Test-Path $manifestPath) {
    $existing = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
    $previousVersion = $existing.activeVersion
}

$manifest = @{
    activeVersion = $VersionId
    previousVersion = $previousVersion
    activatedUtc = [DateTimeOffset]::UtcNow.ToString("O")
} | ConvertTo-Json -Depth 4

Write-AtomicJson -Path $manifestPath -Json $manifest
Write-Output "Activated web version '$VersionId'."
