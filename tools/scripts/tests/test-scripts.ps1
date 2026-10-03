#!/usr/bin/env pwsh
# Runs check-milestones.ps1 and cut-changelog.ps1 against the fixtures in tests/fixtures.
# Each case works on a copy in a temporary folder that is removed afterward.
$ErrorActionPreference = "Stop"

$scriptsDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$fixturesDir = Join-Path $PSScriptRoot "fixtures"
$checker = Join-Path $scriptsDir "check-milestones.ps1"
$cutter = Join-Path $scriptsDir "cut-changelog.ps1"
$validMilestones = Join-Path $fixturesDir "milestones" "valid.md"
$movedMilestones = Join-Path $fixturesDir "milestones" "moved.md"
$changelogInput = Join-Path $fixturesDir "changelog" "input.md"
$changelogExpected = Join-Path $fixturesDir "changelog" "expected.md"

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) "reelroulette-script-tests-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $workDir | Out-Null

$script:passed = 0
$script:failed = 0

# Copies a fixture into the work folder, applying exact text replacements (each must match once).
function New-FixtureCopy {
    param(
        [string]$Source,
        [string]$Name,
        [object[]]$Replacements = @(),
        [switch]$Crlf
    )

    $text = (Get-Content -Path $Source -Raw) -replace "\r\n", "`n"
    foreach ($pair in $Replacements) {
        $count = ([regex]::Matches($text, [regex]::Escape($pair[0]))).Count
        if ($count -ne 1) {
            throw "Fixture setup for '$Name': expected '$($pair[0])' once in $Source, found $count."
        }
        $text = $text.Replace($pair[0], $pair[1])
    }
    if ($Crlf.IsPresent) {
        $text = $text -replace "`n", "`r`n"
    }
    $path = Join-Path $workDir $Name
    Set-Content -Path $path -Value $text -NoNewline
    return $path
}

function Invoke-Tool {
    param([string]$Script, [hashtable]$Parameters)

    $global:LASTEXITCODE = 0
    try {
        $output = & $Script @Parameters *>&1 | Out-String
        return [pscustomobject]@{ Code = $LASTEXITCODE; Output = $output }
    }
    catch {
        return [pscustomobject]@{ Code = 1; Output = $_.Exception.Message }
    }
}

# Runs a case. $Body returns $null on success or a failure reason.
function Test-Case {
    param([string]$Name, [scriptblock]$Body)

    try {
        $reason = & $Body
    }
    catch {
        $reason = "threw: $($_.Exception.Message)"
    }
    if ($reason) {
        $script:failed++
        Write-Host "FAIL $Name"
        Write-Host "     $($reason -replace "`n", "`n     ")"
    }
    else {
        $script:passed++
        Write-Host "PASS $Name"
    }
}

function Assert-Check {
    param($Result, [int]$Code, [string[]]$Contains = @(), [int]$Problems = -1)

    if ($Result.Code -ne $Code) {
        return "expected exit $Code, got $($Result.Code). Output:`n$($Result.Output.Trim())"
    }
    foreach ($text in $Contains) {
        if (-not $Result.Output.Contains($text)) {
            return "output does not contain '$text'. Output:`n$($Result.Output.Trim())"
        }
    }
    if ($Problems -ge 0 -and -not $Result.Output.Contains("FAIL: $Problems problem(s)")) {
        return "expected exactly $Problems problem(s). Output:`n$($Result.Output.Trim())"
    }
    return $null
}

# Replacements that turn the valid milestones fixture into each failing case.
$newCompletedEntry = "### M1d - Late Fix`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - Planned and completed after the base.`n`n"

try {
    Write-Host "check-milestones.ps1"

    Test-Case "valid file passes, including MP3 and P2P in prose and IDs in completed history" {
        Assert-Check (Invoke-Tool $checker @{ Path = $validMilestones }) 0 @("OK: valid.md passed")
    }

    Test-Case "a bare milestone ID in prose fails on its line, and MP3 and P2P beside it are not flagged" {
        $path = New-FixtureCopy $validMilestones "bare-id.md" @(, @("Plays MP3 files and talks P2P", "Plays MP3 files like M1c and talks P2P"))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("bare-id.md:35: milestone ID 'M1c' outside") 1
    }

    Test-Case "an outline ID with no section fails" {
        $path = New-FixtureCopy $validMilestones "outline-orphan.md" @(, @("Ship sharing. P2a, P2b.", "Ship sharing. P2a, P2b, P9."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("'P9' is in the Planned Releases outline but has no milestone section") 1
    }

    Test-Case "a planned section missing from the outline fails" {
        $path = New-FixtureCopy $validMilestones "outline-missing.md" @(, @("**Unscheduled backlog**: P3.", "**Unscheduled backlog**: none."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("'P3 - Someday Feature' is missing from the Planned Releases outline") 1
    }

    Test-Case "an ID listed twice in the outline fails" {
        $path = New-FixtureCopy $validMilestones "outline-twice.md" @(, @("Ship sharing. P2a, P2b.", "Ship sharing. P2a, P2b, M1c."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("'M1c' is listed in the Planned Releases outline more than once") 1
    }

    Test-Case "two sections with the same ID fail" {
        $path = New-FixtureCopy $validMilestones "duplicate-id.md" @(
            @("### P3 - Someday Feature", "### P2b - Someday Feature"),
            @("**Unscheduled backlog**: P3.", "**Unscheduled backlog**: none."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("milestone ID 'P2b' heads more than one section") 1
    }

    Test-Case "a Depends on reference that matches no title fails" {
        $path = New-FixtureCopy $validMilestones "depends-unknown.md" @(, @("Depends on: Lay the Groundwork.", "Depends on: Lay the Foundations."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("depends-unknown.md:34: Depends on: no milestone title matches 'lay the foundations'") 1
    }

    Test-Case "a Depends on title followed by text that is not a list or an explanation fails" {
        $path = New-FixtureCopy $validMilestones "depends-trailing.md" @(, @(", so sharing exists first.", " because sharing exists first."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("unexpected text after a milestone title: ' because sharing exists first'") 1
    }

    Test-Case "the second of two Depends on references is checked too" {
        $path = New-FixtureCopy $validMilestones "depends-second.md" @(, @("Polish the Widget, and Plan.json Format Cleanup.", "Polish the Widget, and Plan Cleanup."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path }) 1 @("no milestone title matches 'plan cleanup'") 1
    }

    Test-Case "full mode: an entry moved from Active to Completed passes" {
        Assert-Check (Invoke-Tool $checker @{ Path = $movedMilestones; BasePath = $validMilestones }) 0 @("OK: moved.md passed")
    }

    Test-Case "full mode: a completed entry that was never active or planned in the base fails" {
        $path = New-FixtureCopy $validMilestones "late-entry.md" @(
            @("### M1a - Lay the Groundwork", "$newCompletedEntry### M1a - Lay the Groundwork"),
            @("Ship the widget. M1a, M1b, M1c.", "Ship the widget. M1a, M1b, M1c, M1d."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones }) 1 @("newly completed milestone 'M1d - Late Fix' was not an active or planned milestone in the base") 1
    }

    Test-Case "release mode: a completed entry planned and completed since the base passes" {
        $path = New-FixtureCopy $validMilestones "late-entry-release.md" @(
            @("### M1a - Lay the Groundwork", "$newCompletedEntry### M1a - Lay the Groundwork"),
            @("Ship the widget. M1a, M1b, M1c.", "Ship the widget. M1a, M1b, M1c, M1d."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones; Release = $true }) 0 @("OK: late-entry-release.md passed")
    }

    Test-Case "release mode: a new completed entry below the existing ones fails" {
        $path = New-FixtureCopy $validMilestones "late-entry-bottom.md" @(, @("  - The first prototype.`n", "  - The first prototype.`n`n$($newCompletedEntry.TrimEnd())`n"))
        Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones; Release = $true }) 1 @("newly completed milestone 'M1d - Late Fix' must go above the existing completed entries") 1
    }

    Test-Case "a changed completed entry fails in both modes" {
        $path = New-FixtureCopy $validMilestones "completed-edited.md" @(, @("The first prototype.", "The first prototype, revised."))
        $full = Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones }) 1 @("completed milestone 'M0z - Prototype' changed") 1
        if ($full) { return "full mode: $full" }
        $release = Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones; Release = $true }) 1 @("completed milestone 'M0z - Prototype' changed") 1
        if ($release) { return "release mode: $release" }
    }

    Test-Case "a removed completed entry fails" {
        $path = New-FixtureCopy $validMilestones "completed-removed.md" @(, @("`n### M0z - Prototype`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - The first prototype.`n", ""))
        Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones }) 1 @("completed milestone 'M0z - Prototype' was removed or renamed") 1
    }

    Test-Case "reordered completed entries fail" {
        $path = New-FixtureCopy $validMilestones "completed-reordered.md" @(
            @("### M1a - Lay the Groundwork`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - Historical text from before the ID rule, mentioning M0z by ID.`n`n", ""),
            @("  - The first prototype.`n", "  - The first prototype.`n`n### M1a - Lay the Groundwork`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - Historical text from before the ID rule, mentioning M0z by ID.`n"))
        Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones }) 1 @("moved out of its original order")
    }

    Test-Case "a changed Completed Milestones introduction fails" {
        $path = New-FixtureCopy $validMilestones "completed-intro.md" @(, @("Newest completions first.", "Newest first."))
        Assert-Check (Invoke-Tool $checker @{ Path = $path; BasePath = $validMilestones }) 1 @("the Completed Milestones introduction changed") 1
    }

    Test-Case "-Release without a base is refused" {
        Assert-Check (Invoke-Tool $checker @{ Path = $validMilestones; Release = $true }) 1 @("-Release needs -BaseRef or -BasePath")
    }

    Write-Host ""
    Write-Host "cut-changelog.ps1"

    Test-Case "a cut matches the expected changelog exactly" {
        $path = New-FixtureCopy $changelogInput "cut.md"
        $result = Invoke-Tool $cutter @{ Path = $path; Version = "v0.3.0"; Name = "Test Release"; Date = "2026-10-03" }
        if ($result.Code -ne 0) { return "exit $($result.Code): $($result.Output)" }
        $expected = (Get-Content -Path $changelogExpected -Raw) -replace "\r\n", "`n"
        $actual = Get-Content -Path $path -Raw
        if ($actual -cne $expected) { return "output differs from expected.md:`n$actual" }
    }

    Test-Case "a CRLF changelog stays CRLF" {
        $path = New-FixtureCopy $changelogInput "cut-crlf.md" -Crlf
        $result = Invoke-Tool $cutter @{ Path = $path; Version = "0.3.0"; Name = "Test Release"; Date = "2026-10-03" }
        if ($result.Code -ne 0) { return "exit $($result.Code): $($result.Output)" }
        $expected = ((Get-Content -Path $changelogExpected -Raw) -replace "\r\n", "`n") -replace "`n", "`r`n"
        $actual = Get-Content -Path $path -Raw
        if ($actual -cne $expected) { return "output differs from expected.md with CRLF line endings" }
    }

    $refusals = @(
        @{ Name = "an empty [Unreleased] is refused"; Replacements = @(
                @("- **New widget:** Adds a widget.`n  - With a nested detail line.`n", ""),
                @("- **Widget crash:** The widget no longer crashes.`n`n- **Second fix:** After a blank line inside the heading.`n", ""))
            Parameters = @{}; Message = "[Unreleased] has no entries to release." },
        @{ Name = "a version that already has a section is refused"; Replacements = @()
            Parameters = @{ Version = "0.2.0" }; Message = "CHANGELOG already has a [0.2.0] section or footer link." },
        @{ Name = "a non-standard heading is refused"; Replacements = @(, @("### Security", "### Misc"))
            Parameters = @{}; Message = "[Unreleased] has a '### Misc' heading." },
        @{ Name = "text before the first heading is refused"; Replacements = @(, @("## [Unreleased]`n", "## [Unreleased]`n`nStray text.`n"))
            Parameters = @{}; Message = "[Unreleased] has text before its first heading" },
        @{ Name = "a missing [Unreleased] footer link is refused"; Replacements = @(, @("[Unreleased]: https://github.com/example/repo/compare/v0.2.0...HEAD`n", ""))
            Parameters = @{}; Message = "No '[Unreleased]: ...' footer link found." },
        @{ Name = "an empty release name is refused"; Replacements = @()
            Parameters = @{ Name = " " }; Message = "-Name is required" },
        @{ Name = "a dev version is refused"; Replacements = @()
            Parameters = @{ Version = "v0.3.0-dev.1" }; Message = "Invalid -Version 'v0.3.0-dev.1'" }
    )
    $caseNumber = 0
    foreach ($refusal in $refusals) {
        $caseNumber++
        Test-Case "$($refusal.Name), and the file is unchanged" {
            $path = New-FixtureCopy $changelogInput "refused-$caseNumber.md" $refusal.Replacements
            $before = Get-Content -Path $path -Raw
            $parameters = @{ Path = $path; Version = "0.3.0"; Name = "Test Release"; Date = "2026-10-03" }
            foreach ($key in $refusal.Parameters.Keys) { $parameters[$key] = $refusal.Parameters[$key] }
            $reason = Assert-Check (Invoke-Tool $cutter $parameters) 1 @($refusal.Message)
            if ($reason) { return $reason }
            if ((Get-Content -Path $path -Raw) -cne $before) { return "the changelog was modified" }
        }
    }
}
finally {
    Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "$($script:passed) passed, $($script:failed) failed"
if ($script:failed -gt 0) {
    exit 1
}
exit 0
