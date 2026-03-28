#!/usr/bin/env pwsh
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
        & (Join-Path $PSScriptRoot "set-release-version.ps1") `
            -Version $Version `
            -UpdateDesktopVersion `
            -RegenerateContracts `
            -RunVerify
    }

    Invoke-Step -Name "Package server portable" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-serverapp-win-portable.ps1") -Version $Version
        }
        elseif ($IsLinux) {
            $scriptPath = Join-Path $PSScriptRoot "package-serverapp-linux-portable.sh"
            & bash @($scriptPath, "-Version", $Version)
        }
        else {
            Write-Host "Skipping server portable packaging (requires Windows or Linux)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package server installer" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-serverapp-win-inno.ps1") -Version $Version
        }
        else {
            Write-Host "Skipping Inno server installer (Windows-only)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package desktop portable" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-desktop-win-portable.ps1") -Version $Version
        }
        elseif ($IsLinux) {
            $scriptPath = Join-Path $PSScriptRoot "package-desktop-linux-portable.sh"
            & bash @($scriptPath, "-Version", $Version)
        }
        else {
            Write-Host "Skipping desktop portable packaging (requires Windows or Linux)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package desktop installer" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-desktop-win-inno.ps1") -Version $Version
        }
        else {
            Write-Host "Skipping Inno desktop installer (Windows-only)."
            $global:LASTEXITCODE = 0
        }
    }

    Write-Host ""
    Write-Host "Full release flow completed for version $Version."
}
finally {
    Pop-Location
}
