param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "Version is required."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "=== $Name ==="
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    Invoke-Step -Name "Set release version + verify" -Action {
        & ".\tools\scripts\set-release-version.ps1" `
            -Version $Version `
            -UpdateDesktopVersion `
            -RegenerateContracts `
            -RunVerify
    }

    Invoke-Step -Name "Package server portable" -Action {
        & ".\tools\scripts\package-serverapp-win-portable.ps1" -Version $Version
    }

    Invoke-Step -Name "Package server installer" -Action {
        & ".\tools\scripts\package-serverapp-win-inno.ps1" -Version $Version
    }

    Invoke-Step -Name "Package desktop portable" -Action {
        & ".\tools\scripts\package-desktop-win-portable.ps1" -Version $Version
    }

    Invoke-Step -Name "Package desktop installer" -Action {
        & ".\tools\scripts\package-desktop-win-inno.ps1" -Version $Version
    }

    Write-Host ""
    Write-Host "Full release flow completed for version $Version."
}
finally {
    Pop-Location
}
