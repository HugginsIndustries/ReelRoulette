param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$Version = "",
    [string]$OutputRoot = "artifacts\packages"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Error "dotnet SDK not found in PATH."
    exit 1
}

function Install-ChocoPackageIfMissing {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageName
    )

    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Error "choco is required to acquire native dependencies when runtimes are not present in the repo."
        exit 1
    }

    $installedOutput = choco list --local-only --exact $PackageName 2>$null
    if ($LASTEXITCODE -eq 0 -and ($installedOutput | Select-String -Pattern "^$PackageName\s")) {
        return
    }

    choco install $PackageName -y --no-progress | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "choco install $PackageName failed with code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

function Get-UniqueNonEmptyPaths {
    param(
        [Parameter(Mandatory = $true)]
        [AllowNull()]
        [AllowEmptyCollection()]
        [object[]]$Paths
    )

    return @($Paths |
        Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } |
        ForEach-Object { [string]$_ } |
        Select-Object -Unique)
}

function Resolve-FFprobeSourcePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $repoPath = Join-Path $RepoRoot "runtimes\win-x64\native\ffprobe.exe"
    if (Test-Path $repoPath) {
        return $repoPath
    }

    Install-ChocoPackageIfMissing -PackageName "ffmpeg"
    $chocoRoot = if ([string]::IsNullOrWhiteSpace($env:ChocolateyInstall)) { "C:\ProgramData\chocolatey" } else { $env:ChocolateyInstall }
    $candidates = @()
    $ffmpegLibRoot = Join-Path $chocoRoot "lib"
    if (Test-Path $ffmpegLibRoot) {
        $candidates += Get-ChildItem -Path $ffmpegLibRoot -Recurse -Filter "ffprobe.exe" -File -ErrorAction SilentlyContinue |
            Sort-Object Length -Descending |
            Select-Object -ExpandProperty FullName
    }
    $candidates += (Join-Path $chocoRoot "bin\ffprobe.exe")

    foreach ($candidate in (Get-UniqueNonEmptyPaths -Paths $candidates)) {
        if (Test-Path -LiteralPath $candidate) {
            return [string]$candidate
        }
    }

    Write-Error "ffprobe.exe could not be resolved from repo runtimes or chocolatey install."
    exit 1
}

function Resolve-LibVlcSourceDir {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $repoDir = Join-Path $RepoRoot "runtimes\win-x64\native\libvlc"
    if (Test-Path (Join-Path $repoDir "libvlc.dll")) {
        return $repoDir
    }

    Install-ChocoPackageIfMissing -PackageName "vlc"
    $chocoRoot = if ([string]::IsNullOrWhiteSpace($env:ChocolateyInstall)) { "C:\ProgramData\chocolatey" } else { $env:ChocolateyInstall }
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $candidates += (Join-Path $env:ProgramFiles "VideoLAN\VLC")
    }
    $programFilesX86 = ${env:ProgramFiles(x86)}
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $candidates += (Join-Path $programFilesX86 "VideoLAN\VLC")
    }
    if (-not [string]::IsNullOrWhiteSpace($chocoRoot)) {
        $candidates += (Join-Path $chocoRoot "lib\vlc\tools\VLC")
    }

    foreach ($candidate in (Get-UniqueNonEmptyPaths -Paths $candidates)) {
        if (Test-Path -LiteralPath (Join-Path $candidate "libvlc.dll")) {
            return [string]$candidate
        }
    }

    Write-Error "VLC native files could not be resolved from repo runtimes or chocolatey install."
    exit 1
}

function Ensure-WinDesktopNativeAssets {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot,
        [Parameter(Mandatory = $true)]
        [string]$PublishDir
    )

    $nativeDir = Join-Path $PublishDir "runtimes\win-x64\native"
    $libVlcTargetDir = Join-Path $nativeDir "libvlc"
    New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
    New-Item -ItemType Directory -Force -Path $libVlcTargetDir | Out-Null

    $ffprobeSourcePath = Resolve-FFprobeSourcePath -RepoRoot $RepoRoot
    if (($ffprobeSourcePath -is [array]) -or [string]::IsNullOrWhiteSpace([string]$ffprobeSourcePath)) {
        Write-Error "ffprobe source path resolved to empty value."
        exit 1
    }
    Copy-Item -Force -LiteralPath ([string]$ffprobeSourcePath) (Join-Path $nativeDir "ffprobe.exe")

    $libVlcSourceDir = Resolve-LibVlcSourceDir -RepoRoot $RepoRoot
    if (($libVlcSourceDir -is [array]) -or [string]::IsNullOrWhiteSpace([string]$libVlcSourceDir)) {
        Write-Error "LibVLC source directory resolved to empty value."
        exit 1
    }
    Copy-Item -Recurse -Force (Join-Path ([string]$libVlcSourceDir) "*") $libVlcTargetDir

    if (-not (Test-Path (Join-Path $nativeDir "ffprobe.exe"))) {
        Write-Error "Desktop package is missing ffprobe.exe after native asset staging."
        exit 1
    }
    if (-not (Test-Path (Join-Path $libVlcTargetDir "libvlc.dll"))) {
        Write-Error "Desktop package is missing libvlc.dll after native asset staging."
        exit 1
    }
    if (-not (Test-Path (Join-Path $libVlcTargetDir "plugins"))) {
        Write-Error "Desktop package is missing libvlc plugins after native asset staging."
        exit 1
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectPath = Join-Path $repoRoot "source\ReelRoulette.csproj"

if ([string]::IsNullOrWhiteSpace($Version)) {
    [xml]$projectXml = Get-Content -Path $projectPath -Raw
    $Version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = "dev"
    }
}

$publishDir = Join-Path $repoRoot "artifacts\publish\desktop-$Runtime"
$packageRoot = Join-Path $repoRoot $OutputRoot
$stagingDir = Join-Path $packageRoot "portable\ReelRoulette-Desktop-$Version-$Runtime"
$zipPath = "$stagingDir.zip"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

Push-Location $repoRoot
try {
    dotnet publish $projectPath `
        -c $Configuration `
        -r $Runtime `
        --self-contained true `
        -p:PublishSingleFile=false `
        -p:PublishTrimmed=false `
        -p:Version=$Version `
        -p:ErrorOnDuplicatePublishOutputFiles=false `
        -o $publishDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "dotnet publish failed with code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    if ($Runtime -eq "win-x64") {
        Ensure-WinDesktopNativeAssets -RepoRoot $repoRoot -PublishDir $publishDir
    }

    Copy-Item -Recurse -Force (Join-Path $publishDir "*") $stagingDir
    @(
        "ReelRoulette Desktop portable package",
        "Version: $Version",
        "Runtime: $Runtime",
        "",
        "Run: ReelRoulette.exe"
    ) | Set-Content -Path (Join-Path $stagingDir "PACKAGE_INFO.txt")

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath
    Write-Host "Portable package created: $zipPath"
}
finally {
    Pop-Location
}
