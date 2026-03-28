#!/usr/bin/env pwsh
param(
    [string]$Version,
    [switch]$NoDocUpdates,
    [switch]$NoUpdateDesktopVersion,
    [switch]$NoRegenerateContracts,
    [switch]$NoRunVerify
)

$ErrorActionPreference = "Stop"

$haveVersion = -not [string]::IsNullOrWhiteSpace($Version)

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
    $packageVersionArgs = @{}
    if ($haveVersion) {
        $packageVersionArgs['Version'] = $Version
    }

    Invoke-Step -Name "Set release version + verify" -Action {
        if (-not $haveVersion) {
            Write-Host "Skipping set-release-version (no -Version): packaging uses `<Version>` from each .csproj."
            if ($NoDocUpdates -or $NoUpdateDesktopVersion -or $NoRegenerateContracts -or $NoRunVerify) {
                Write-Host "Note: -NoDocUpdates / -NoUpdateDesktopVersion / -NoRegenerateContracts / -NoRunVerify apply only when -Version is set."
            }
            $global:LASTEXITCODE = 0
            return
        }

        $srPath = Join-Path $PSScriptRoot "set-release-version.ps1"
        $srArgs = @{
            Version = $Version
        }
        if ($NoDocUpdates) { $srArgs['NoDocUpdates'] = $true }
        if ($NoUpdateDesktopVersion) { $srArgs['NoUpdateDesktopVersion'] = $true }
        if ($NoRegenerateContracts) { $srArgs['NoRegenerateContracts'] = $true }
        if ($NoRunVerify) { $srArgs['NoRunVerify'] = $true }

        & $srPath @srArgs
    }

    Invoke-Step -Name "Package server portable" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-serverapp-win-portable.ps1") @packageVersionArgs
        }
        elseif ($IsLinux) {
            $scriptPath = Join-Path $PSScriptRoot "package-serverapp-linux-portable.sh"
            $bashArgs = @($scriptPath)
            if ($haveVersion) {
                $bashArgs += @("-Version", $Version)
            }
            & bash @bashArgs
        }
        else {
            Write-Host "Skipping server portable packaging (requires Windows or Linux)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package server installer" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-serverapp-win-inno.ps1") @packageVersionArgs
        }
        else {
            Write-Host "Skipping Inno server installer (Windows-only)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package desktop portable" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-desktop-win-portable.ps1") @packageVersionArgs
        }
        elseif ($IsLinux) {
            $scriptPath = Join-Path $PSScriptRoot "package-desktop-linux-portable.sh"
            $bashArgs = @($scriptPath)
            if ($haveVersion) {
                $bashArgs += @("-Version", $Version)
            }
            & bash @bashArgs
        }
        else {
            Write-Host "Skipping desktop portable packaging (requires Windows or Linux)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package desktop installer" -Action {
        if ($IsWindows) {
            & (Join-Path $PSScriptRoot "package-desktop-win-inno.ps1") @packageVersionArgs
        }
        else {
            Write-Host "Skipping Inno desktop installer (Windows-only)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package server AppImage (Linux)" -Action {
        if ($IsLinux) {
            $scriptPath = Join-Path $PSScriptRoot "package-serverapp-linux-appimage.sh"
            $bashArgs = @($scriptPath)
            if ($haveVersion) {
                $bashArgs += @("-Version", $Version)
            }
            & bash @bashArgs
        }
        else {
            Write-Host "Skipping server AppImage packaging (Linux-only)."
            $global:LASTEXITCODE = 0
        }
    }

    Invoke-Step -Name "Package desktop AppImage (Linux)" -Action {
        if ($IsLinux) {
            $scriptPath = Join-Path $PSScriptRoot "package-desktop-linux-appimage.sh"
            $bashArgs = @($scriptPath)
            if ($haveVersion) {
                $bashArgs += @("-Version", $Version)
            }
            & bash @bashArgs
        }
        else {
            Write-Host "Skipping desktop AppImage packaging (Linux-only)."
            $global:LASTEXITCODE = 0
        }
    }

    Write-Host ""
    if ($haveVersion) {
        Write-Host "Full release flow completed for version $Version."
    }
    else {
        Write-Host "Full release flow completed (packaging used project `<Version>` values)."
    }
}
finally {
    Pop-Location
}
