namespace ReelRoulette;

public sealed class DesktopAppSettings
{
    // View preferences
    public bool ShowMenu { get; set; } = true;
    public bool ShowStatusLine { get; set; } = true;
    public bool ShowControls { get; set; } = true;
    public bool ShowLibraryPanel { get; set; } = false;
    public bool ShowStatsPanel { get; set; } = false;
    public bool AlwaysOnTop { get; set; } = false;
    public bool IsPlayerViewMode { get; set; } = false;
    public bool RememberLastFolder { get; set; } = true;
    public string? LastFolderPath { get; set; } = null;

    // Window state
    public double? WindowX { get; set; }
    public double? WindowY { get; set; }
    public double? WindowWidth { get; set; }
    public double? WindowHeight { get; set; }
    public int WindowState { get; set; } = 0; // 0=Normal, 1=Minimized, 2=Maximized, 3=FullScreen
    public double? LibraryPanelWidth { get; set; }

    // ItemTagsDialog state
    public double? ItemTagsDialogX { get; set; }
    public double? ItemTagsDialogY { get; set; }
    public double? ItemTagsDialogWidth { get; set; }
    public double? ItemTagsDialogHeight { get; set; }

    // FilterDialog state
    public double? FilterDialogX { get; set; }
    public double? FilterDialogY { get; set; }
    public double? FilterDialogWidth { get; set; }
    public double? FilterDialogHeight { get; set; }

    // Playback settings
    public string? SeekStep { get; set; }
    public int VolumeStep { get; set; } = 5;
    public double? IntervalSeconds { get; set; }
    public bool VolumeNormalizationEnabled { get; set; } = false;
    public double MaxReductionDb { get; set; } = 15.0;
    public double MaxBoostDb { get; set; } = 5.0;
    public bool BaselineAutoMode { get; set; } = true;
    public double BaselineOverrideLUFS { get; set; } = -23.0;
    public AudioFilterMode AudioFilterMode { get; set; } = AudioFilterMode.PlayAll;

    // Playback preferences (now persisted)
    public bool LoopEnabled { get; set; } = true;
    public bool AutoPlayNext { get; set; } = true;
    public bool ForceApiPlayback { get; set; } = false;
    public DuplicateHandlingDefaultBehavior DuplicateHandlingDefaultBehavior { get; set; } = DuplicateHandlingDefaultBehavior.KeepAll;
    public bool IsMuted { get; set; } = false;
    public int VolumeLevel { get; set; } = 100;
    public RandomizationMode RandomizationMode { get; set; } = RandomizationMode.SmartShuffle;
    public bool RandomizationModeMigrated { get; set; } = false;
    public int PhotoDisplayDurationSeconds { get; set; } = 5;

    // Image scaling
    public ImageScalingMode ImageScalingMode { get; set; } = ImageScalingMode.Auto;
    public int FixedImageMaxWidth { get; set; } = 3840;
    public int FixedImageMaxHeight { get; set; } = 2160;

    // Backup settings
    public bool BackupLibraryEnabled { get; set; } = true;
    public int MinimumBackupGapMinutes { get; set; } = 15;
    public int NumberOfBackups { get; set; } = 10;
    public bool BackupSettingsEnabled { get; set; } = true;
    public int MinimumSettingsBackupGapMinutes { get; set; } = 15;
    public int NumberOfSettingsBackups { get; set; } = 10;

    // Library view settings
    public bool LibraryGridViewEnabled { get; set; } = false;

    // Filter state
    public FilterState? FilterState { get; set; }

    public bool AutoTagScanFullLibrary { get; set; } = true;
    public string CoreServerBaseUrl { get; set; } = "http://localhost:45123";
    public string? CoreClientId { get; set; }

    /// <summary>When true, Velopack checks the dev (pre-release) desktop update feed; stable when false.</summary>
    public bool DevChannelEnabled { get; set; } = false;
}
