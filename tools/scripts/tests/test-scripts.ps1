#!/usr/bin/env pwsh
# Runs check-milestones.ps1, cut-changelog.ps1, and reset-checklist.ps1 against the fixtures in tests/fixtures.
# Each case works on a copy in a temporary folder that is removed afterward.
$ErrorActionPreference = "Stop"

$scriptsDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$fixturesDir = Join-Path $PSScriptRoot "fixtures"
$checker = Join-Path $scriptsDir "check-milestones.ps1"
$cutter = Join-Path $scriptsDir "cut-changelog.ps1"
$resetter = Join-Path $scriptsDir "reset-checklist.ps1"
$validMilestones = Join-Path $fixturesDir "milestones" "valid.md"
$movedMilestones = Join-Path $fixturesDir "milestones" "moved.md"
$validCompleted = Join-Path $fixturesDir "milestones" "valid-completed.md"
$movedCompleted = Join-Path $fixturesDir "milestones" "moved-completed.md"
$changelogInput = Join-Path $fixturesDir "changelog" "input.md"
$changelogExpected = Join-Path $fixturesDir "changelog" "expected.md"
$checklistInput = Join-Path $fixturesDir "checklist" "input.md"

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

# Replacements that turn the valid milestones fixtures into each failing case.
$newCompletedEntry = "### M1d - Late Fix`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - Planned and completed after the base.`n`n"

# Checker parameters for a MILESTONES.md path, with the valid completed history unless another is given.
function Get-CheckArgs {
    param([string]$Path, [string]$Completed = $validCompleted, [switch]$WithBase, [switch]$Release)

    $parameters = @{ Path = $Path; CompletedPath = $Completed }
    if ($WithBase.IsPresent) {
        $parameters.BasePath = $validMilestones
        $parameters.BaseCompletedPath = $validCompleted
    }
    if ($Release.IsPresent) {
        $parameters.Release = $true
    }
    return $parameters
}

try {
    Write-Host "check-milestones.ps1"

    Test-Case "valid files pass, including MP3 and P2P in prose, IDs in completed history, old- and new-format entries, and the template's sections" {
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones)) 0 @("OK: valid.md and valid-completed.md passed")
    }

    Test-Case "a bare milestone ID in prose fails on its line, and MP3 and P2P beside it are not flagged" {
        $path = New-FixtureCopy $validMilestones "bare-id.md" @(, @("Plays MP3 files and talks P2P", "Plays MP3 files like M1c and talks P2P"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("bare-id.md:75: milestone ID 'M1c' outside") 1
    }

    Test-Case "an outline ID with no section fails" {
        $path = New-FixtureCopy $validMilestones "outline-orphan.md" @(, @("Ship sharing. P2a, P2b.", "Ship sharing. P2a, P2b, P9."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("'P9' is in the Planned Releases outline but has no milestone section") 1
    }

    Test-Case "an outline ID whose section is only in the completed history needs that history" {
        Assert-Check (Invoke-Tool $checker @{ Path = $validMilestones }) 1 @("'M1a' is in the Planned Releases outline but has no milestone section", "no milestone title matches 'lay the groundwork'")
    }

    Test-Case "a planned section missing from the outline fails" {
        $path = New-FixtureCopy $validMilestones "outline-missing.md" @(, @("**Unscheduled backlog**: P3.", "**Unscheduled backlog**: none."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("'P3 - Someday Feature' is missing from the Planned Releases outline") 1
    }

    Test-Case "an ID listed twice in the outline fails" {
        $path = New-FixtureCopy $validMilestones "outline-twice.md" @(, @("Ship sharing. P2a, P2b.", "Ship sharing. P2a, P2b, M1c."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("'M1c' is listed in the Planned Releases outline more than once") 1
    }

    Test-Case "two sections with the same ID fail" {
        $path = New-FixtureCopy $validMilestones "duplicate-id.md" @(
            @("### P3 - Someday Feature", "### P2b - Someday Feature"),
            @("**Unscheduled backlog**: P3.", "**Unscheduled backlog**: none."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("milestone ID 'P2b' heads more than one section") 1
    }

    Test-Case "an ID heading both an active and a completed entry fails" {
        $path = New-FixtureCopy $validMilestones "duplicate-completed.md" @(
            @("### M1b - Widget Build", "### M1a - Widget Build"),
            @("Ship the widget. M1a, M1b, M1c.", "Ship the widget. M1a, M1c."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("valid-completed.md:7: milestone ID 'M1a' heads more than one section (first at duplicate-completed.md:70)") 1
    }

    Test-Case "a Depends on reference that matches no title fails" {
        $path = New-FixtureCopy $validMilestones "depends-unknown.md" @(, @("Depends on: Lay the Groundwork.", "Depends on: Lay the Foundations."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("depends-unknown.md:74: Depends on: no milestone title matches 'lay the foundations'") 1
    }

    Test-Case "a Depends on title followed by text that is not a list or an explanation fails" {
        $path = New-FixtureCopy $validMilestones "depends-trailing.md" @(, @(", so sharing exists first.", " because sharing exists first."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("unexpected text after a milestone title: ' because sharing exists first'") 1
    }

    Test-Case "the second of two Depends on references is checked too" {
        $path = New-FixtureCopy $validMilestones "depends-second.md" @(, @("Polish the Widget, and Plan.json Format Cleanup.", "Polish the Widget, and Plan Cleanup."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("no milestone title matches 'plan cleanup'") 1
    }

    Test-Case "a Not included line naming no milestone after 'which is' fails" {
        $path = New-FixtureCopy $validMilestones "not-included-unknown.md" @(, @("which is Lay the Groundwork,", "which is Lay the Foundations,"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("not-included-unknown.md:148: Not included: no milestone title matches 'lay the foundations") 1
    }

    Test-Case "a Not included title followed by text that is not an explanation fails" {
        $path = New-FixtureCopy $validMilestones "not-included-trailing.md" @(, @("Export, and Import. Sharing", "Export, and Import twice. Sharing"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("not-included-trailing.md:161: Not included: unexpected text after a milestone title: ' twice. sharing ships first'") 1
    }

    Test-Case "a Depends on bullet that matches no title fails" {
        $path = New-FixtureCopy $validMilestones "depends-bullet-unknown.md" @(, @("- **Depends on**: Widget Build,", "- **Depends on**: Widget Assembly,"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("depends-bullet-unknown.md:87: Depends on: no milestone title matches 'widget assembly, whose parts the themes restyle'") 1
    }

    Test-Case "a Not included section bullet naming no milestone after 'which is' fails" {
        $path = New-FixtureCopy $validMilestones "not-included-section-unknown.md" @(, @("which is Widget Search.", "which is Widget Finder."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("not-included-section-unknown.md:138: Not included: no milestone title matches 'widget finder'") 1
    }

    Test-Case "a Not included section bullet that keeps the old 'Not included:' prefix is reported once" {
        $path = New-FixtureCopy $validMilestones "not-included-section-prefix.md" @(, @("- Searching by theme, which is Widget Search.", "- Not included: searching by theme, which is Widget Finder."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("not-included-section-prefix.md:138: Not included: no milestone title matches 'widget finder'") 1
    }

    # Entry Format cases, on the new-format entries M1e (with slices) and P4 (without).
    $formatCases = @(
        @{ Name = "a new-format entry without a Goal bullet fails"
            Replacements = @(, @("- **Goal**: The widget offers light and dark themes, picked in its settings.`n", ""))
            Message = "format-1.md:83: 'M1e - Widget Themes': has no Goal bullet" },
        @{ Name = "header bullets out of order fail"
            Replacements = @(, @("- **Depends on**: Widget Build, whose parts the themes restyle.`n- **Design**: ``docs/mockups/widget/``, including its theme picker page.", "- **Design**: ``docs/mockups/widget/``, including its theme picker page.`n- **Depends on**: Widget Build, whose parts the themes restyle."))
            Message = "format-2.md:88: 'M1e - Widget Themes': the Depends on bullet is out of order; header bullets go Status, Goal, Depends on, Design" },
        @{ Name = "an unknown Status value fails"
            Replacements = @(, @("- **Status**: 🚧 In Progress`n- **Goal**: The widget", "- **Status**: 🚧 Underway`n- **Goal**: The widget"))
            Message = "format-3.md:85: 'M1e - Widget Themes': unknown Status '🚧 Underway'; use ⏳ Planned, 🚧 In Progress, or ✅ Complete" },
        @{ Name = "text between the header bullets and the first section fails"
            Replacements = @(, @("including its theme picker page.`n", "including its theme picker page.`n`nThemes ship one at a time.`n"))
            Message = "format-4.md:90: 'M1e - Widget Themes': only the Status, Goal, Depends on, and Design bullets go before the first section" },
        @{ Name = "an unknown section name fails"
            Replacements = @(, @("#### Decisions`n`n- Themes change", "#### Choices`n`n- Themes change"))
            Message = "format-5.md:90: 'M1e - Widget Themes': unknown section 'Choices'" },
        @{ Name = "sections out of order fail"
            Replacements = @(, @("#### Release checks`n`n- Agent: The release notes name both themes.`n- Manual: The dark theme is readable on a real phone.`n`n#### Not included`n`n- Searching by theme, which is Widget Search.`n- Themes that change fonts.`n", "#### Not included`n`n- Searching by theme, which is Widget Search.`n- Themes that change fonts.`n`n#### Release checks`n`n- Agent: The release notes name both themes.`n- Manual: The dark theme is readable on a real phone.`n"))
            Message = "format-6.md:136: 'M1e - Widget Themes': the 'Release checks' section is out of order" },
        @{ Name = "an empty section fails"
            Replacements = @(, @("- Themes change colors only, so every theme keeps the same layout.`n  - Fonts stay the same in every theme too.`n- The server stores the picked theme, so every device shows the same one.`n", ""))
            Message = "format-7.md:90: 'M1e - Widget Themes': the 'Decisions' section is empty" },
        @{ Name = "a Slices table row with no slice section fails"
            Replacements = @(, @("| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n", "| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n| Sharing | ⏳ Planned | Themes shared between widgets. |`n"))
            Message = "format-8.md:102: 'M1e - Widget Themes': slice 'Sharing' in the Slices table has no 'Sharing slice' section" },
        @{ Name = "a slice section with no Slices table row fails"
            Replacements = @(, @("#### Release checks`n`n- Agent: The release", "#### Sharing slice`n`n**Scope**`n`n- Themes shared between widgets.`n`n**Acceptance**`n`n- A shared theme applies on the other widget.`n`n#### Release checks`n`n- Agent: The release"))
            Message = "format-9.md:131: 'M1e - Widget Themes': the 'Sharing slice' section has no row in the Slices table" },
        @{ Name = "slice sections in a different order from the Slices table fail"
            Replacements = @(, @("| Palette | ✅ Complete | The light and dark color sets and the code that applies them. |`n| Picker | ⏳ Planned | The theme picker in the widget's settings. |", "| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n| Palette | ✅ Complete | The light and dark color sets and the code that applies them. |"))
            Message = "format-10.md:103: 'M1e - Widget Themes': the 'Palette slice' section is out of the Slices table's order, which lists 'Picker' here" },
        @{ Name = "an unknown status in the Slices table fails"
            Replacements = @(, @("| Picker | ⏳ Planned |", "| Picker | Planned |"))
            Message = "format-11.md:101: 'M1e - Widget Themes': slice 'Picker' has unknown status 'Planned' in the Slices table" },
        @{ Name = "a slice without an Acceptance part fails"
            Replacements = @(, @("**Acceptance**`n`n- Picking a theme changes the widget's colors at once, in picker tests.`n", ""))
            Message = "format-12.md:121: 'M1e - Widget Themes': slice 'Picker' has no Acceptance part" },
        @{ Name = "an unknown part in a slice fails"
            Replacements = @(, @("**Acceptance**`n`n- Picking a theme", "**Notes**`n`n- The picker is small.`n`n**Acceptance**`n`n- Picking a theme"))
            Message = "format-13.md:127: 'M1e - Widget Themes': slice 'Picker' has an unknown part 'Notes'" },
        @{ Name = "a complete slice without Evidence fails"
            Replacements = @(, @("**Evidence**`n`n- The palette tests ran and passed.`n`n", ""))
            Message = "format-14.md:103: 'M1e - Widget Themes': slice 'Palette' is ✅ Complete but has no Evidence part" },
        @{ Name = "a planned slice with Evidence fails"
            Replacements = @(, @("in picker tests.`n", "in picker tests.`n`n**Evidence**`n`n- The picker tests passed.`n"))
            Message = "format-15.md:131: 'M1e - Widget Themes': slice 'Picker' is ⏳ Planned but has an Evidence part" },
        @{ Name = "an entry Status that disagrees with its slices fails"
            Replacements = @(, @("- **Status**: 🚧 In Progress`n- **Goal**: The widget", "- **Status**: ⏳ Planned`n- **Goal**: The widget"))
            Message = "format-16.md:85: 'M1e - Widget Themes': Status is ⏳ Planned but its slices make it 🚧 In Progress" },
        @{ Name = "a top-level Scope section in an entry with slices fails"
            Replacements = @(, @("#### Release checks`n`n- Agent: The release", "#### Scope`n`n- Two themes.`n`n#### Release checks`n`n- Agent: The release"))
            Message = "format-17.md:131: 'M1e - Widget Themes': has slices, so its Scope belongs in the slice sections" },
        @{ Name = "an entry without slices and without an Acceptance section fails"
            Replacements = @(, @("#### Acceptance`n`n- Typing part of a name shows only the widgets whose names contain it, in search tests.`n`n", ""))
            Message = "format-18.md:163: 'P4 - Widget Search': has no Slices section, so it needs a top-level Acceptance section" },
        @{ Name = "a Release checks bullet without Agent or Manual fails"
            Replacements = @(, @("- Manual: The dark theme", "- The dark theme"))
            Message = "format-19.md:134: 'M1e - Widget Themes': a Release checks bullet does not start with 'Agent: ' or 'Manual: '" },
        @{ Name = "'at this edit' fails in a new-format entry, in any case, and not in an old-format one"
            Replacements = @(
                @("applied at startup.`n", "applied at startup, as read At This Edit.`n"),
                @("talks P2P to other widgets.", "talks P2P to other widgets, as read at this edit."))
            Message = "format-20.md:107: 'M1e - Widget Themes': 'at this edit' is not allowed; state facts and decisions as settled" },
        @{ Name = "'(decided in' fails in a new-format entry"
            Replacements = @(, @("filters it by name.`n", "filters it by name (decided in the planning report).`n"))
            Message = "format-21.md:170: 'P4 - Widget Search': '(decided in' is not allowed; state facts and decisions as settled" },
        @{ Name = "'(decided while' fails in a new-format entry"
            Replacements = @(, @("- Themes that change fonts.`n", "- Themes that change fonts (decided while planning).`n"))
            Message = "format-22.md:139: 'M1e - Widget Themes': '(decided while' is not allowed; state facts and decisions as settled" },
        @{ Name = "a header bullet that appears twice fails"
            Replacements = @(, @("including its theme picker page.`n", "including its theme picker page.`n- **Goal**: Two themes.`n"))
            Message = "format-23.md:89: 'M1e - Widget Themes': the Goal bullet appears more than once" },
        @{ Name = "an empty header bullet fails"
            Replacements = @(, @("- **Design**: ``docs/mockups/widget/``, including its theme picker page.", "- **Design**:"))
            Message = "format-24.md:88: 'M1e - Widget Themes': the Design bullet is empty" },
        @{ Name = "a section that appears twice fails"
            Replacements = @(, @("#### Not included`n`n- Searching by theme", "#### Release checks`n`n- Agent: The changelog names both themes.`n`n#### Not included`n`n- Searching by theme"))
            Message = "format-25.md:136: 'M1e - Widget Themes': the 'Release checks' section appears more than once" },
        @{ Name = "a complete entry without slices and without an Evidence section fails"
            Replacements = @(, @("- **Status**: ⏳ Planned`n- **Goal**: Find a widget", "- **Status**: ✅ Complete`n- **Goal**: Find a widget"))
            Message = "format-26.md:163: 'P4 - Widget Search': is ✅ Complete but has no Evidence section" },
        @{ Name = "a planned entry without slices and with an Evidence section fails"
            Replacements = @(, @("in search tests.`n`n#### Not included", "in search tests.`n`n#### Evidence`n`n- The search tests passed.`n`n#### Not included"))
            Message = "format-27.md:180: 'P4 - Widget Search': is ⏳ Planned but has an Evidence section" },
        @{ Name = "slice sections without a Slices section fail"
            Replacements = @(, @("#### Slices`n`n| Slice | Status | Delivers |`n| --- | --- | --- |`n| Palette | ✅ Complete | The light and dark color sets and the code that applies them. |`n| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n`n", ""))
            Message = @("format-28.md:96: 'M1e - Widget Themes': the 'Palette slice' section needs a Slices section listing it",
                "format-28.md:114: 'M1e - Widget Themes': the 'Picker slice' section needs a Slices section listing it")
            Problems = 2 },
        @{ Name = "text in the Slices section besides its table fails"
            Replacements = @(, @("| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n", "| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n`nSlices land in table order.`n"))
            Message = "format-29.md:103: 'M1e - Widget Themes': the Slices section holds only its table" },
        @{ Name = "a Slices table with the wrong header fails"
            Replacements = @(, @("| Slice | Status | Delivers |`n| --- | --- | --- |`n| Palette", "| Slice | State | Delivers |`n| --- | --- | --- |`n| Palette"))
            Message = "format-30.md:98: 'M1e - Widget Themes': the Slices table's header must be '| Slice | Status | Delivers |'" },
        @{ Name = "a Slices table without a separator row fails"
            Replacements = @(, @("| --- | --- | --- |`n| Palette", "| Palette"))
            Message = "format-31.md:99: 'M1e - Widget Themes': the Slices table has no separator row under its header" },
        @{ Name = "a Slices table row with the wrong number of cells fails"
            Replacements = @(, @("| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n", "| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n| Sharing | ⏳ Planned |`n"))
            Message = "format-32.md:102: 'M1e - Widget Themes': a Slices table row has 2 cells; rows have Slice, Status, and Delivers cells" },
        @{ Name = "a Slices table row without a slice name fails"
            Replacements = @(, @("| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n", "| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n|  | ⏳ Planned | Themes shared between widgets. |`n"))
            Message = "format-33.md:102: 'M1e - Widget Themes': a Slices table row has no slice name" },
        @{ Name = "a Slices table row without Delivers text fails"
            Replacements = @(, @("| Picker | ⏳ Planned | The theme picker in the widget's settings. |", "| Picker | ⏳ Planned |  |"))
            Message = "format-34.md:101: 'M1e - Widget Themes': slice 'Picker' has no Delivers text in the Slices table" },
        @{ Name = "a slice listed twice in the Slices table fails"
            Replacements = @(, @("| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n", "| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n| Picker | ⏳ Planned | The theme picker, listed again. |`n"))
            Message = "format-35.md:102: 'M1e - Widget Themes': slice 'Picker' is in the Slices table more than once" },
        @{ Name = "a Slices table without rows fails"
            Replacements = @(, @("| Palette | ✅ Complete | The light and dark color sets and the code that applies them. |`n| Picker | ⏳ Planned | The theme picker in the widget's settings. |`n", ""))
            Message = @("format-36.md:96: 'M1e - Widget Themes': the Slices table has no rows",
                "format-36.md:101: 'M1e - Widget Themes': the 'Palette slice' section has no row in the Slices table",
                "format-36.md:119: 'M1e - Widget Themes': the 'Picker slice' section has no row in the Slices table")
            Problems = 3 },
        @{ Name = "a slice part that appears twice fails"
            Replacements = @(, @("- A theme picker in the settings dialog that saves the choice on the server.`n", "- A theme picker in the settings dialog that saves the choice on the server.`n`n**Scope**`n`n- It also previews the theme.`n"))
            Message = "format-37.md:127: 'M1e - Widget Themes': slice 'Picker' has the Scope part more than once" },
        @{ Name = "slice parts out of order fail"
            Replacements = @(, @("in picker tests.`n", "in picker tests.`n`n**Traps**`n`n- The settings dialog is modal.`n"))
            Message = "format-38.md:131: 'M1e - Widget Themes': slice 'Picker' has its Traps part out of order; parts go Scope, Traps, Acceptance, Evidence" },
        @{ Name = "text before a slice's first part fails"
            Replacements = @(, @("#### Picker slice`n`n**Scope**", "#### Picker slice`n`nThe picker is small.`n`n**Scope**"))
            Message = "format-39.md:123: 'M1e - Widget Themes': slice 'Picker' has text before its first part" },
        @{ Name = "an empty slice part fails"
            Replacements = @(, @("**Traps**`n`n- The widget reads ``palette.json`` only once, at startup (measured).`n`n", "**Traps**`n`n"))
            Message = "format-40.md:109: 'M1e - Widget Themes': slice 'Palette' has an empty Traps part" }
    )
    # Each case expects exactly one problem unless it gives Problems, and every message it lists.
    $caseNumber = 0
    foreach ($formatCase in $formatCases) {
        $caseNumber++
        Test-Case $formatCase.Name {
            $path = New-FixtureCopy $validMilestones "format-$caseNumber.md" $formatCase.Replacements
            $expected = if ($formatCase.Problems) { $formatCase.Problems } else { 1 }
            Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @($formatCase.Message) $expected
        }
    }

    Test-Case "a Completed Milestones section left in MILESTONES.md fails" {
        $path = New-FixtureCopy $validMilestones "leftover-section.md" @(, @("Sharing ships first.`n", "Sharing ships first.`n`n## Completed Milestones`n`nNewest completions first.`n"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path)) 1 @("leftover-section.md:163: the Completed Milestones section belongs in MILESTONES-COMPLETED.md")
    }

    Test-Case "a completed history without its section fails" {
        $completed = New-FixtureCopy $validCompleted "no-section-completed.md" @(, @("## Completed Milestones`n", "## Finished`n"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Completed $completed)) 1 @("no-section-completed.md:1: has no '## Completed Milestones' section", "'M1a - Lay the Groundwork' is outside the Completed Milestones section")
    }

    Test-Case "full mode: an entry moved from Active to Completed passes" {
        $parameters = Get-CheckArgs $movedMilestones -Completed $movedCompleted -WithBase
        Assert-Check (Invoke-Tool $checker $parameters) 0 @("OK: moved.md and moved-completed.md passed")
    }

    Test-Case "a base without its completed history is refused" {
        $parameters = @{ Path = $movedMilestones; CompletedPath = $movedCompleted; BasePath = $validMilestones }
        Assert-Check (Invoke-Tool $checker $parameters) 1 @("-BasePath needs -BaseCompletedPath")
    }

    Test-Case "comparing against a base without the completed history is refused" {
        Assert-Check (Invoke-Tool $checker @{ Path = $movedMilestones; BasePath = $validMilestones }) 1 @("pass -CompletedPath with -Path")
    }

    Test-Case "full mode: a completed entry that was never active or planned in the base fails" {
        $path = New-FixtureCopy $validMilestones "late-entry.md" @(, @("Ship the widget. M1a, M1b, M1c.", "Ship the widget. M1a, M1b, M1c, M1d."))
        $completed = New-FixtureCopy $validCompleted "late-entry-completed.md" @(, @("### M1a - Lay the Groundwork", "$newCompletedEntry### M1a - Lay the Groundwork"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path -Completed $completed -WithBase)) 1 @("newly completed milestone 'M1d - Late Fix' was not an active or planned milestone in the base") 1
    }

    Test-Case "release mode: a completed entry planned and completed since the base passes" {
        $path = New-FixtureCopy $validMilestones "late-entry-release.md" @(, @("Ship the widget. M1a, M1b, M1c.", "Ship the widget. M1a, M1b, M1c, M1d."))
        $completed = New-FixtureCopy $validCompleted "late-entry-release-completed.md" @(, @("### M1a - Lay the Groundwork", "$newCompletedEntry### M1a - Lay the Groundwork"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path -Completed $completed -WithBase -Release)) 0 @("OK: late-entry-release.md and late-entry-release-completed.md passed")
    }

    Test-Case "release mode: a new completed entry below the existing ones fails" {
        $path = New-FixtureCopy $validMilestones "late-entry-bottom.md" @(, @("Ship the widget. M1a, M1b, M1c.", "Ship the widget. M1a, M1b, M1c, M1d."))
        $completed = New-FixtureCopy $validCompleted "late-entry-bottom-completed.md" @(, @("  - The first prototype.`n", "  - The first prototype.`n`n$($newCompletedEntry.TrimEnd())`n"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $path -Completed $completed -WithBase -Release)) 1 @("newly completed milestone 'M1d - Late Fix' must go above the existing completed entries") 1
    }

    Test-Case "a changed completed entry fails in both modes" {
        $completed = New-FixtureCopy $validCompleted "completed-edited.md" @(, @("The first prototype.", "The first prototype, revised."))
        $full = Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Completed $completed -WithBase)) 1 @("completed milestone 'M0z - Prototype' changed") 1
        if ($full) { return "full mode: $full" }
        $release = Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Completed $completed -WithBase -Release)) 1 @("completed milestone 'M0z - Prototype' changed") 1
        if ($release) { return "release mode: $release" }
    }

    Test-Case "a removed completed entry fails" {
        $completed = New-FixtureCopy $validCompleted "completed-removed.md" @(, @("`n### M0z - Prototype`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - The first prototype.`n", ""))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Completed $completed -WithBase)) 1 @("completed milestone 'M0z - Prototype' was removed or renamed") 1
    }

    Test-Case "reordered completed entries fail" {
        $completed = New-FixtureCopy $validCompleted "completed-reordered.md" @(
            @("### M1a - Lay the Groundwork`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - Historical text from before the ID rule, mentioning M0z by ID.`n`n", ""),
            @("  - The first prototype.`n", "  - The first prototype.`n`n### M1a - Lay the Groundwork`n`n- **Status**: ✅ Complete`n- **Scope**:`n  - Historical text from before the ID rule, mentioning M0z by ID.`n"))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Completed $completed -WithBase)) 1 @("moved out of its original order")
    }

    Test-Case "a changed Completed Milestones introduction fails" {
        $completed = New-FixtureCopy $validCompleted "completed-intro.md" @(, @("Newest completions first.", "Newest first."))
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Completed $completed -WithBase)) 1 @("the Completed Milestones introduction changed") 1
    }

    Test-Case "-Release without a base is refused" {
        Assert-Check (Invoke-Tool $checker (Get-CheckArgs $validMilestones -Release)) 1 @("-Release needs -BaseRef or -BasePath")
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

    Write-Host ""
    Write-Host "reset-checklist.ps1"

    # Resets a copy of the checklist fixture with the given .version text and returns its release version line.
    function Get-ResetReleaseLine {
        param([string]$Name, [string]$Version)

        $path = New-FixtureCopy $checklistInput "$Name.md"
        $versionPath = Join-Path $workDir "$Name.version"
        Set-Content -Path $versionPath -Value $Version -NoNewline
        $result = Invoke-Tool $resetter @{ Path = $path; VersionPath = $versionPath }
        if ($result.Code -ne 0) { throw "exit $($result.Code): $($result.Output)" }
        return (Get-Content -Path $path | Where-Object { $_ -match '^- Release version:' })
    }

    Test-Case "a dev version fills the release it is building" {
        $line = Get-ResetReleaseLine "reset-dev" "v0.3.0-dev.12`n"
        if ($line -cne "- Release version: v0.3.0") { return "got '$line'" }
    }

    Test-Case "a release version fills as it is" {
        $line = Get-ResetReleaseLine "reset-release" "v0.3.0"
        if ($line -cne "- Release version: v0.3.0") { return "got '$line'" }
    }

    Test-Case "a reset clears checks and notes in every group and keeps waived checks and group headings" {
        $path = New-FixtureCopy $checklistInput "reset-checks.md"
        $versionPath = Join-Path $workDir "reset-checks.version"
        Set-Content -Path $versionPath -Value "v0.3.0" -NoNewline
        $result = Invoke-Tool $resetter @{ Path = $path; VersionPath = $versionPath }
        if ($result.Code -ne 0) { return "exit $($result.Code): $($result.Output)" }
        $text = Get-Content -Path $path -Raw
        if ($text -match '\[x\] (?!.*\(waived\))') { return "a ticked check that is not waived remains:`n$text" }
        if ($text -notmatch '\[x\] A waived check\. \(waived\)') { return "the waived check was not kept:`n$text" }
        if ($text -match '(Failed|Skipped|Pending):') { return "a Failed:, Skipped:, or Pending: note remains:`n$text" }
        foreach ($heading in @("### Agent checks", "### Manual checks")) {
            if (-not $text.Contains($heading)) { return "the '$heading' heading was not kept:`n$text" }
        }
    }

    Test-Case "a version that is neither a release nor a dev build is refused, and the file is unchanged" {
        $path = New-FixtureCopy $checklistInput "reset-invalid.md"
        $before = Get-Content -Path $path -Raw
        $versionPath = Join-Path $workDir "reset-invalid.version"
        Set-Content -Path $versionPath -Value "v0.3.0-preview.1" -NoNewline
        $reason = Assert-Check (Invoke-Tool $resetter @{ Path = $path; VersionPath = $versionPath }) 1 @("Invalid version 'v0.3.0-preview.1'")
        if ($reason) { return $reason }
        if ((Get-Content -Path $path -Raw) -cne $before) { return "the checklist was modified" }
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
