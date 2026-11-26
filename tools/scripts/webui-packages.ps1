# Installs the WebUI's packages with npm ci when node_modules is missing or package-lock.json changed since the
# last install. Dot-sourced by run-server.ps1 and verify-web-deploy.ps1.

# Returns why the WebUI folder's packages need installing, or $null when the last install is current.
# npm writes node_modules/.package-lock.json at the end of every install, after package-lock.json, so
# package-lock.json is newer only when something, such as a pull, changed it after the last install.
function Get-WebUiPackageInstallReason {
    param([string]$WebUiPath)

    $lockfile = Join-Path $WebUiPath "package-lock.json"
    $installedLockfile = Join-Path $WebUiPath "node_modules" ".package-lock.json"
    if (-not (Test-Path $installedLockfile)) {
        return "no earlier install found"
    }
    if ((Get-Item $lockfile).LastWriteTimeUtc -gt (Get-Item -Force $installedLockfile).LastWriteTimeUtc) {
        return "package-lock.json changed since the last install"
    }
    return $null
}

# Runs npm ci in the WebUI folder when Get-WebUiPackageInstallReason gives a reason, and prints that reason.
function Install-WebUiPackages {
    param([string]$WebUiPath)

    $reason = Get-WebUiPackageInstallReason -WebUiPath $WebUiPath
    if (-not $reason) {
        return
    }

    Write-Host "Installing WebUI packages: $reason..."
    Push-Location $WebUiPath
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
