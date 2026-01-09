using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Data.Converters;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using LibVLCSharp.Shared;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Timers;

namespace ReelRoulette
{
    public enum AudioFilterMode
    {
        PlayAll = 0,           // Default: no audio filtering
        WithAudioOnly = 1,      // Only videos with audio
        WithoutAudioOnly = 2    // Only videos without audio
    }

    public enum ImageScalingMode
    {
        Off = 0,      // No scaling
        Auto = 1,     // Scale based on screen size
        Fixed = 2     // Scale to fixed maximum dimensions
    }

    public enum MissingFileBehavior
    {
        AlwaysShowDialog = 0,      // Always show dialog when file is missing
        AlwaysRemoveFromLibrary = 1 // Always remove from library without showing dialog
    }

    public partial class MainWindow : Window, INotifyPropertyChanged
    {
        private readonly string[] _videoExtensions =
        {
            ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".mpg", ".mpeg"
        };

        private readonly string[] _photoExtensions =
        {
            // Primary formats (VLC native)
            ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
            // Extended formats (bonus support)
            ".tiff", ".tif", ".heic", ".heif", ".avif", ".ico", ".svg", ".raw", ".cr2", ".nef", ".orf", ".sr2"
        };

        private readonly Random _rng = new();
        private System.Timers.Timer? _autoPlayTimer;
        private bool _isKeepPlayingActive = false;

        // LibVLC components
        private LibVLC? _libVLC;
        private MediaPlayer? _mediaPlayer;
        private Media? _currentMedia;


        // Volume normalization settings - New approach: reduce loud, not boost quiet (now configurable)
        private double _maxReductionDb = 15.0;     // Maximum reduction for loud videos
        private double _maxBoostDb = 5.0;          // Maximum boost for quiet videos (conservative to avoid noise)
        private bool _baselineAutoMode = true;     // Auto-calculate baseline or use manual override
        private double _baselineOverrideLUFS = -23.0;  // Manual baseline override value

        // Volume normalization
        private bool _volumeNormalizationEnabled = false;
        private int _userVolumePreference = 100; // User's slider preference (0-200)
        private AudioFilterMode _audioFilterMode = AudioFilterMode.PlayAll;
        
        // Cached baseline loudness for normalization (75th percentile of library)
        private double? _cachedBaselineLoudnessDb = null;
        private bool _hasShownMissingLoudnessWarning = false;

        // Queue system
        private Queue<string> _playQueue = new();
        private bool _noRepeatMode = true;

        // Current video tracking
        private string? _currentVideoPath;
        // Store the previous LastPlayedUtc for the current video (before current play) for display purposes
        private DateTime? _previousLastPlayedUtc;
        private bool _isLoopEnabled = true;
        private bool _autoPlayNext = true;
        private bool _isMuted = false; // Track mute state for persistence

        // Photo playback
        private System.Timers.Timer? _photoDisplayTimer;
        private bool _isCurrentlyPlayingPhoto = false;
        private int _photoDisplayDurationSeconds = 5; // Default 5 seconds
        
        // Image scaling
        private ImageScalingMode _imageScalingMode = ImageScalingMode.Auto;
        private int _fixedImageMaxWidth = 3840;
        private int _fixedImageMaxHeight = 2160;
        
        // Missing file behavior
        private MissingFileBehavior _missingFileBehavior = MissingFileBehavior.AlwaysShowDialog;
        
        // Backup settings
        private bool _backupLibraryEnabled = true;
        private int _minimumBackupGapMinutes = 15;
        private int _numberOfBackups = 10;

        // Duration scanning
        private CancellationTokenSource? _scanCancellationSource;
        private static SemaphoreSlim? _ffprobeSemaphore;
        private static readonly object _ffprobeSemaphoreLock = new object();
        private DateTime _lastDurationStatusUpdate = DateTime.MinValue;
        private readonly object _durationStatusUpdateLock = new object();

        // Loudness scanning
        private static SemaphoreSlim? _ffmpegSemaphore;
        private static readonly object _ffmpegSemaphoreLock = new object();
        private DateTime _lastLoudnessStatusUpdate = DateTime.MinValue;
        private readonly object _loudnessStatusUpdateLock = new object();

        // Status message throttling (minimum display window + coalescing)
        private DateTime _lastStatusMessageTime = DateTime.MinValue;
        private CancellationTokenSource? _statusMessageCancellation;
        private readonly object _statusMessageLock = new object();
        
        // Prevent recursive SaveSettings calls when updating UI from settings
        private bool _isApplyingSettings = false;
        
        // FFmpeg logging
        private readonly List<FFmpegLogEntry> _ffmpegLogs = new();
        private readonly object _ffmpegLogsLock = new object();
        private Window? _ffmpegLogWindow;

        // Window position tracking (Avalonia's Position property doesn't always work correctly)
        private PixelPoint _lastKnownPosition = new PixelPoint(0, 0);
        private DateTime _lastPositionLogTime = DateTime.MinValue;
        
        // View prefs
        private bool _showMenu = true;
        private bool _showStatusLine = true;
        private bool _showControls = true;
        private bool _showLibraryPanel = false;
        private bool _showStatsPanel = false;
        private bool _isFullScreen = false;
        private bool _alwaysOnTop = false;
        private bool _isPlayerViewMode = false;
        private bool _savedShowStatusLine = true;
        private bool _savedShowControls = true;
        private bool _savedShowLibraryPanel = false;
        private bool _savedShowStatsPanel = false;
        private bool _rememberLastFolder = true;
        private string? _lastFolderPath = null;

        // Library system services
        private readonly LibraryService _libraryService = new LibraryService();
        private readonly FilterService _filterService = new FilterService();
        private LibraryIndex? _libraryIndex;
        private FilterState? _currentFilterState;
        private string? _activePresetName; // Track which preset is currently active for display in library panel
        private List<FilterPreset>? _filterPresets; // Store filter presets
        private bool _isUpdatingPresetComboBox = false; // Flag to suppress SelectionChanged event during programmatic updates

        // Library panel state
        private ObservableCollection<LibraryItem> _libraryItems = new ObservableCollection<LibraryItem>();
        private string? _currentViewPreset = null; // null = All videos, or "Favorites", "Blacklisted", "RecentlyPlayed", "NeverPlayed"
        private string? _selectedSourceId = null; // null = All sources
        private double _libraryPanelWidth = 400; // Track panel width independently from Bounds (default matches XAML MinWidth)
        private string _librarySearchText = "";
        private string _librarySortMode = "Name"; // "Name", "LastPlayed", "PlayCount", "Duration"
        
        // Selection tracking for batch operations
        private HashSet<string> _selectedItemPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private int _lastSelectedIndex = -1;
        private bool _isHandlingSelectionChange = false; // Prevent recursive selection change handling
        
        // Scroll position tracking for library panel
        private string? _scrollAnchorPath = null; // First visible item path to restore scroll position
        
        // Debouncing for UpdateLibraryPanel
        private CancellationTokenSource? _updateLibraryPanelCancellationSource;
        private DispatcherTimer? _updateLibraryPanelDebounceTimer;
        private readonly object _updateLibraryPanelLock = new object();
        private bool _isInitializingLibraryPanel = false; // Flag to suppress events during initialization
        private bool _isUpdatingLibraryItems = false; // Flag to suppress Favorite/Blacklist events during UI updates
        
        // Volume slider debouncing
        private DispatcherTimer? _volumeSliderDebounceTimer;
        private int? _pendingVolumeValue;

        // Aspect ratio tracking
        private double _currentVideoAspectRatio = 16.0 / 9.0; // Default 16:9
        private bool _hasValidAspectRatio = false;
        
        // Window size adjustment for aspect ratio locking
        private bool _isAdjustingSize = false;
        private Size _lastWindowSize;


        // Global stats backing fields
        private int _globalTotalPlays;
        private int _globalUniqueVideosPlayed;
        private int _globalUniquePhotosPlayed;
        private int _globalUniqueMediaPlayed;
        private int _globalTotalVideosKnown;
        private int _globalTotalPhotosKnown;
        private int _globalTotalMediaKnown;
        private int _globalNeverPlayedVideosKnown;
        private int _globalNeverPlayedPhotosKnown;
        private int _globalNeverPlayedMediaKnown;
        private int _globalFavoritesCount;
        private int _globalBlacklistCount;

        // Current video stats backing fields
        private string _currentVideoFileName = "";
        private string _currentVideoFullPath = "";
        private int _currentVideoPlayCount;
        private string _currentVideoLastPlayedDisplay = "Never";
        private string _currentVideoIsFavoriteDisplay = "No";
        private string _currentVideoIsBlacklistedDisplay = "No";
        private string _currentVideoDurationDisplay = "Unknown";

        // INotifyPropertyChanged implementation
        // Use explicit interface implementation to avoid conflict with Avalonia's PropertyChanged
        event PropertyChangedEventHandler? INotifyPropertyChanged.PropertyChanged
        {
            add => _propertyChanged += value;
            remove => _propertyChanged -= value;
        }
        private event PropertyChangedEventHandler? _propertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            if (_propertyChanged != null)
            {
                // Ensure PropertyChanged is raised on UI thread
                if (Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
                {
                    try
                    {
                        _propertyChanged.Invoke(this, new PropertyChangedEventArgs(propertyName));
                    }
                    catch (Exception ex)
                    {
                        Log($"OnPropertyChanged: ERROR - Exception in PropertyChanged event for {propertyName} - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"OnPropertyChanged: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"OnPropertyChanged: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                        }
                    }
                }
                else
                {
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        try
                        {
                            _propertyChanged.Invoke(this, new PropertyChangedEventArgs(propertyName));
                        }
                        catch (Exception ex)
                        {
                            Log($"OnPropertyChanged: ERROR - Exception in async PropertyChanged event for {propertyName} - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            Log($"OnPropertyChanged: ERROR - Stack trace: {ex.StackTrace}");
                            if (ex.InnerException != null)
                            {
                                Log($"OnPropertyChanged: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                            }
                        }
                    });
                }
            }
        }

        // Global stats properties
        public int GlobalTotalPlays
        {
            get => _globalTotalPlays;
            private set
            {
                if (_globalTotalPlays != value)
                {
                    _globalTotalPlays = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalUniqueVideosPlayed
        {
            get => _globalUniqueVideosPlayed;
            private set
            {
                if (_globalUniqueVideosPlayed != value)
                {
                    _globalUniqueVideosPlayed = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalUniquePhotosPlayed
        {
            get => _globalUniquePhotosPlayed;
            private set
            {
                if (_globalUniquePhotosPlayed != value)
                {
                    _globalUniquePhotosPlayed = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalUniqueMediaPlayed
        {
            get => _globalUniqueMediaPlayed;
            private set
            {
                if (_globalUniqueMediaPlayed != value)
                {
                    _globalUniqueMediaPlayed = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalTotalVideosKnown
        {
            get => _globalTotalVideosKnown;
            private set
            {
                if (_globalTotalVideosKnown != value)
                {
                    _globalTotalVideosKnown = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalTotalPhotosKnown
        {
            get => _globalTotalPhotosKnown;
            private set
            {
                if (_globalTotalPhotosKnown != value)
                {
                    _globalTotalPhotosKnown = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalTotalMediaKnown
        {
            get => _globalTotalMediaKnown;
            private set
            {
                if (_globalTotalMediaKnown != value)
                {
                    _globalTotalMediaKnown = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalNeverPlayedVideosKnown
        {
            get => _globalNeverPlayedVideosKnown;
            private set
            {
                if (_globalNeverPlayedVideosKnown != value)
                {
                    _globalNeverPlayedVideosKnown = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalNeverPlayedPhotosKnown
        {
            get => _globalNeverPlayedPhotosKnown;
            private set
            {
                if (_globalNeverPlayedPhotosKnown != value)
                {
                    _globalNeverPlayedPhotosKnown = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalNeverPlayedMediaKnown
        {
            get => _globalNeverPlayedMediaKnown;
            private set
            {
                if (_globalNeverPlayedMediaKnown != value)
                {
                    _globalNeverPlayedMediaKnown = value;
                    OnPropertyChanged();
                }
            }
        }

        private int _globalVideosWithAudio = 0;
        private int _globalVideosWithoutAudio = 0;

        public int GlobalVideosWithAudio
        {
            get => _globalVideosWithAudio;
            private set
            {
                if (_globalVideosWithAudio != value)
                {
                    _globalVideosWithAudio = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalVideosWithoutAudio
        {
            get => _globalVideosWithoutAudio;
            private set
            {
                if (_globalVideosWithoutAudio != value)
                {
                    _globalVideosWithoutAudio = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _globalBaselineLoudnessDisplay = "N/A";

        public string GlobalBaselineLoudnessDisplay
        {
            get => _globalBaselineLoudnessDisplay;
            private set
            {
                if (_globalBaselineLoudnessDisplay != value)
                {
                    _globalBaselineLoudnessDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalFavoritesCount
        {
            get => _globalFavoritesCount;
            private set
            {
                if (_globalFavoritesCount != value)
                {
                    _globalFavoritesCount = value;
                    OnPropertyChanged();
                }
            }
        }

        public int GlobalBlacklistCount
        {
            get => _globalBlacklistCount;
            private set
            {
                if (_globalBlacklistCount != value)
                {
                    _globalBlacklistCount = value;
                    OnPropertyChanged();
                }
            }
        }

        // Current video stats properties
        public string CurrentVideoFileName
        {
            get => _currentVideoFileName;
            private set
            {
                if (_currentVideoFileName != value)
                {
                    _currentVideoFileName = value ?? "";
                    OnPropertyChanged();
                }
            }
        }

        public string CurrentVideoFullPath
        {
            get => _currentVideoFullPath;
            private set
            {
                if (_currentVideoFullPath != value)
                {
                    _currentVideoFullPath = value;
                    OnPropertyChanged();
                }
            }
        }

        public int CurrentVideoPlayCount
        {
            get => _currentVideoPlayCount;
            private set
            {
                if (_currentVideoPlayCount != value)
                {
                    _currentVideoPlayCount = value;
                    OnPropertyChanged();
                }
            }
        }

        public string CurrentVideoLastPlayedDisplay
        {
            get => _currentVideoLastPlayedDisplay;
            private set
            {
                if (_currentVideoLastPlayedDisplay != value)
                {
                    _currentVideoLastPlayedDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        public string CurrentVideoIsFavoriteDisplay
        {
            get => _currentVideoIsFavoriteDisplay;
            private set
            {
                if (_currentVideoIsFavoriteDisplay != value)
                {
                    _currentVideoIsFavoriteDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        public string CurrentVideoIsBlacklistedDisplay
        {
            get => _currentVideoIsBlacklistedDisplay;
            private set
            {
                if (_currentVideoIsBlacklistedDisplay != value)
                {
                    _currentVideoIsBlacklistedDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        public string CurrentVideoDurationDisplay
        {
            get => _currentVideoDurationDisplay;
            private set
            {
                if (_currentVideoDurationDisplay != value)
                {
                    _currentVideoDurationDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _currentVideoHasAudioDisplay = "Unknown";
        private string _currentVideoLoudnessDisplay = "Unknown";

        public string CurrentVideoHasAudioDisplay
        {
            get => _currentVideoHasAudioDisplay;
            private set
            {
                if (_currentVideoHasAudioDisplay != value)
                {
                    _currentVideoHasAudioDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        public string CurrentVideoLoudnessDisplay
        {
            get => _currentVideoLoudnessDisplay;
            private set
            {
                if (_currentVideoLoudnessDisplay != value)
                {
                    _currentVideoLoudnessDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _currentVideoLoudnessAdjustmentDisplay = "N/A";

        public string CurrentVideoLoudnessAdjustmentDisplay
        {
            get => _currentVideoLoudnessAdjustmentDisplay;
            private set
            {
                if (_currentVideoLoudnessAdjustmentDisplay != value)
                {
                    _currentVideoLoudnessAdjustmentDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _currentVideoPeakDisplay = "Unknown";

        public string CurrentVideoPeakDisplay
        {
            get => _currentVideoPeakDisplay;
            private set
            {
                if (_currentVideoPeakDisplay != value)
                {
                    _currentVideoPeakDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        private bool _isCurrentFileVideo = true;

        public bool IsCurrentFileVideo
        {
            get => _isCurrentFileVideo;
            private set
            {
                if (_isCurrentFileVideo != value)
                {
                    _isCurrentFileVideo = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _currentVideoTagsDisplay = "None";

        public string CurrentVideoTagsDisplay
        {
            get => _currentVideoTagsDisplay;
            private set
            {
                if (_currentVideoTagsDisplay != value)
                {
                    _currentVideoTagsDisplay = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _libraryInfoText = "🎞️ 0 videos • 📷 0 photos";

        public string LibraryInfoText
        {
            get => _libraryInfoText;
            private set
            {
                if (_libraryInfoText != value)
                {
                    _libraryInfoText = value;
                    OnPropertyChanged();
                }
            }
        }

        private string _filterSummaryText = "Filters: None";

        public string FilterSummaryText
        {
            get => _filterSummaryText;
            private set
            {
                if (_filterSummaryText != value)
                {
                    _filterSummaryText = value;
                    OnPropertyChanged();
                }
            }
        }

        // Playback timeline for Previous/Next navigation
        private List<string> _playbackTimeline = new();
        private int _timelineIndex = -1;
        private bool _isNavigatingTimeline = false; // Flag to prevent adding to timeline when navigating

        // Volume and mute
        private int _lastNonZeroVolume = 100;

        // Seek step and volume step settings
        private string _seekStep = "5s"; // Frame, 1s, 5s, 10s
        private int _volumeStep = 5; // 1, 2, 5

        // Seek bar fields
        private DispatcherTimer? _seekTimer;
        private long _mediaLengthMs = 0;
        private bool _isUserSeeking = false;
        private DateTime _lastSeekScrubTime = DateTime.MinValue;

        // Preview cache (thumbnails disabled - LibVLC window steals focus)
        private Avalonia.Media.Imaging.Bitmap? _cachedPreviewBitmap;
        
        // Current photo bitmap for display
        private Avalonia.Media.Imaging.Bitmap? _currentPhotoBitmap;

        public MainWindow()
        {
            try
            {
                Log("MainWindow constructor: Starting...");
                Log("MainWindow constructor: Calling InitializeComponent...");
                InitializeComponent();
                Log("MainWindow constructor: InitializeComponent completed.");
            
            // Initialize window size tracking for aspect ratio locking
            _lastWindowSize = new Size(this.Width, this.Height);
            this.SizeChanged += Window_SizeChanged;
            
            // Track window position changes (Avalonia's Position property doesn't always update correctly)
            this.PositionChanged += (s, e) =>
            {
                _lastKnownPosition = e.Point;
                
                // Throttle logging to once per second to avoid spam
                var now = DateTime.UtcNow;
                if ((now - _lastPositionLogTime).TotalSeconds >= 1.0)
                {
                    Log($"Window position changed to ({e.Point.X}, {e.Point.Y})");
                    _lastPositionLogTime = now;
                }
            };
            
            // Create LibVLC instances (Core.Initialize() called in Program.cs)
            _libVLC = new LibVLC();
            _mediaPlayer = new MediaPlayer(_libVLC);
            VideoView.MediaPlayer = _mediaPlayer;

            // Initialize seek timer (single source of truth for Media → UI updates)
            _seekTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(200)
            };
            _seekTimer.Tick += SeekTimer_Tick;
            _seekTimer.Start();

            // Hook up end reached event for auto-advance (Phase 2)
            _mediaPlayer.EndReached += MediaPlayer_EndReached;
            
            // Hook up Playing/Paused events to keep button state in sync
            _mediaPlayer.Playing += (s, e) =>
            {
                Dispatcher.UIThread.Post(() =>
                {
                    PlayPauseButton.IsChecked = true;
                    UpdateAspectRatioFromTracks();
                    
                    // If transitioning from photo to video, hide photo and show video now that video is playing
                    if (PhotoImageView != null && PhotoImageView.IsVisible && VideoView != null && !VideoView.IsVisible)
                    {
                        Log("MediaPlayer.Playing: Transitioning from photo to video - hiding photo, showing video");
                        
                        // Keep photo visible during delay, then hide it and show video
                        // This prevents briefly showing the previous video's last frame
                        Task.Delay(50).ContinueWith(_ => // ~50ms delay for first frame to render
                        {
                            Dispatcher.UIThread.Post(() =>
                            {
                                // Hide photo and dispose bitmap
                                if (PhotoImageView != null)
                                {
                                    PhotoImageView.IsVisible = false;
                                    PhotoImageView.Source = null;
                                }
                                _currentPhotoBitmap?.Dispose();
                                _currentPhotoBitmap = null;
                                
                                // Show VideoView now that first frame should be rendered
                                if (VideoView != null)
                                {
                                    VideoView.IsVisible = true;
                                }
                            });
                        });
                    }
                });
            };
            
            _mediaPlayer.Paused += (s, e) =>
            {
                Dispatcher.UIThread.Post(() =>
                {
                    PlayPauseButton.IsChecked = false;
                });
            };
            
            _mediaPlayer.Stopped += (s, e) =>
            {
                Dispatcher.UIThread.Post(() =>
                {
                    PlayPauseButton.IsChecked = false;
                    UpdateStatusTimeDisplay(0);
                });
            };

            // Initialize library system
            _libraryService.LoadLibrary();
            _libraryIndex = _libraryService.LibraryIndex;

            // Load persisted data (includes FilterState)
            LoadSettings();
            
            // Migrate legacy data to library items (one-time migration)
            MigrateLegacyDataToLibrary();

            // Restore last folder if enabled and path exists
            // Folder restoration removed - library system is now the primary method

            // Sync menu/check states with defaults
            SyncMenuStates();
            ApplyViewPreferences();

            // Initialize Library panel after window is loaded (defer to ensure controls are initialized)
            Log("MainWindow constructor: Setting up Loaded event handler...");
            this.Loaded += async (s, e) =>
            {
                try
                {
                    Log("MainWindow Loaded event: Fired!");
                    
                    // Initialize library panel first so controls are ready
                    Log("MainWindow Loaded event: Initializing Library panel...");
                    InitializeLibraryPanel();
                    Log("MainWindow Loaded event: Library panel initialized successfully.");
                    
                    // Check if tag migration is required and show migration dialog
                    if (_libraryService.RequiresTagMigration)
                    {
                        Log("MainWindow Loaded event: Tag migration required, showing migration dialog...");
                        await ShowTagMigrationDialog();
                    }
                    
                    // Apply saved library panel width if panel is visible on startup
                    // This ensures the width is applied after the Grid is fully initialized
                    if (_showLibraryPanel && MainContentGrid?.ColumnDefinitions.Count > 0)
                    {
                        MainContentGrid.ColumnDefinitions[0].MinWidth = 400;
                        MainContentGrid.ColumnDefinitions[0].Width = new GridLength(_libraryPanelWidth);
                        Log($"MainWindow Loaded event: Applied saved library panel width: {_libraryPanelWidth}");
                    }
                    
                    // Set up GridSplitter event handler to track manual resizing
                    if (LibraryVideoSplitter != null)
                    {
                        LibraryVideoSplitter.DragCompleted += (splitterSender, dragArgs) =>
                        {
                            if (MainContentGrid?.ColumnDefinitions.Count > 0)
                            {
                                var currentWidth = MainContentGrid.ColumnDefinitions[0].Width;
                                if (currentWidth.IsAbsolute && currentWidth.Value >= 400)
                                {
                                    _libraryPanelWidth = currentWidth.Value;
                                    Log($"LibraryVideoSplitter DragCompleted: Captured new panel width: {_libraryPanelWidth}");
                                }
                            }
                        };
                        Log("MainWindow Loaded event: GridSplitter event handler set up.");
                    }
                }
                catch (Exception ex)
                {
                    var errorMsg = $"ERROR in Loaded event handler: {ex.GetType().Name}\n" +
                                  $"Message: {ex.Message}\n" +
                                  $"Stack Trace:\n{ex.StackTrace}";
                    if (ex.InnerException != null)
                    {
                        errorMsg += $"\nInner Exception: {ex.InnerException.Message}\n" +
                                   $"Inner Stack Trace:\n{ex.InnerException.StackTrace}";
                    }
                    Log(errorMsg);
                    // Don't re-throw - let the app continue if possible
                }
            };
            Log("MainWindow constructor: Loaded event handler set up.");

            // Initialize stats (after loading all data)
            RecalculateGlobalStats();
            UpdateCurrentFileStatsUi();
            
            // Set DataContext for bindings (after all initialization)
            DataContext = this;
            
            // Initialize volume - but respect loaded mute state from settings
            // Note: LoadSettings() is called before this point in the constructor
            if (_mediaPlayer != null)
            {
                if (_isMuted)
                {
                    // If muted from settings, initialize to 0
                    _mediaPlayer.Volume = 0;
                    VolumeSlider.Value = 0;
                    if (MuteButton != null)
                    {
                        MuteButton.IsChecked = true;
                    }
                }
                else
                {
                    // Restore saved volume level from settings
                    _mediaPlayer.Volume = _userVolumePreference;
                    VolumeSlider.Value = _userVolumePreference;
                }
                UpdateVolumeTooltip();
            }

            // Set up global keyboard shortcuts using tunneling (preview) handler
            // This intercepts events before menus and buttons can see them
            this.AddHandler(KeyDownEvent, OnGlobalKeyDown, 
                RoutingStrategies.Tunnel, 
                handledEventsToo: true);

            // Listen to WindowState changes to keep fullscreen state in sync
            // Note: This subscribes to Avalonia's PropertyChanged (from AvaloniaObject), not INotifyPropertyChanged
            this.PropertyChanged += (s, e) =>
            {
                if (e.Property == Window.WindowStateProperty)
                {
                    var state = this.WindowState;
                    if (state != WindowState.FullScreen && _isFullScreen)
                    {
                        _isFullScreen = false;
                        FullscreenMenuItem.IsChecked = false;
                    }
                    else if (state == WindowState.FullScreen && !_isFullScreen)
                    {
                        _isFullScreen = true;
                        FullscreenMenuItem.IsChecked = true;
                    }
                }
            };

            // FolderTextBox.TextChanged handler removed - library system is now the primary method

            Log("MainWindow constructor: All initialization complete.");
            }
            catch (Exception ex)
            {
                var errorMsg = $"EXCEPTION in MainWindow constructor: {ex.GetType().Name}\n" +
                              $"Message: {ex.Message}\n" +
                              $"Stack Trace:\n{ex.StackTrace}";
                if (ex.InnerException != null)
                {
                    errorMsg += $"\nInner Exception: {ex.InnerException.Message}\n" +
                               $"Inner Stack Trace:\n{ex.InnerException.StackTrace}";
                }
                Log(errorMsg);
                throw;
            }
        }

        protected override void OnClosed(EventArgs e)
        {
            Log("OnClosed: Window closing, saving settings...");
            
            // Cancel any ongoing scan
            _scanCancellationSource?.Cancel();
            _scanCancellationSource?.Dispose();

            // Save data
            SaveSettings();
            Log("OnClosed: Settings save completed");
            
            // Create backup before saving library (if enabled)
            if (_libraryIndex != null)
            {
                try
                {
                    _libraryService.CreateBackupIfNeeded(_backupLibraryEnabled, _minimumBackupGapMinutes, _numberOfBackups);
                }
                catch (Exception ex)
                {
                    Log($"OnClosed: ERROR creating backup - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"OnClosed: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"OnClosed: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                    // Don't throw - backup failures shouldn't prevent library save
                }
            }
            
            // Save library (final save on shutdown - contains all data now)
            if (_libraryIndex != null)
            {
                try
                {
                    _libraryService.SaveLibrary();
                }
                catch (Exception ex)
                {
                    Log($"OnClosed: ERROR saving library on shutdown - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"OnClosed: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"OnClosed: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                }
            }

            // Clean up LibVLC
            if (_mediaPlayer != null)
            {
                _mediaPlayer.Stop();
                _mediaPlayer.EndReached -= MediaPlayer_EndReached;
            }
            _currentMedia?.Dispose();
            _mediaPlayer?.Dispose();
            _libVLC?.Dispose();

            // Clean up seek timer
            if (_seekTimer != null)
            {
                _seekTimer.Stop();
                _seekTimer.Tick -= SeekTimer_Tick;
                _seekTimer = null;
            }

            // Clean up preview resources (preview player disabled, but clean up any cached data)
            _cachedPreviewBitmap?.Dispose();
            _currentPhotoBitmap?.Dispose();

            // Clean up the timer
            if (_autoPlayTimer != null)
            {
                _autoPlayTimer.Stop();
                _autoPlayTimer.Dispose();
                _autoPlayTimer = null;
            }

            // Clean up photo display timer
            if (_photoDisplayTimer != null)
            {
                _photoDisplayTimer.Stop();
                _photoDisplayTimer.Elapsed -= PhotoDisplayTimer_Elapsed;
                _photoDisplayTimer.Dispose();
                _photoDisplayTimer = null;
            }

            base.OnClosed(e);
        }

        private void MediaPlayer_EndReached(object? sender, EventArgs e)
        {
            Log($"MediaPlayer_EndReached: Media playback ended - CurrentVideoPath: {_currentVideoPath ?? "null"}, IsPhoto: {_isCurrentlyPlayingPhoto}");
            // Only handle EndReached for videos - photos use timer
            if (!_isCurrentlyPlayingPhoto)
            {
                // Hand off end-of-media work asynchronously so UI thread stays responsive
                _ = HandleEndReachedAsync();
            }
            else
            {
                Log("MediaPlayer_EndReached: Ignoring EndReached event for photo (using timer instead)");
            }
        }

        private void PhotoDisplayTimer_Elapsed(object? sender, System.Timers.ElapsedEventArgs e)
        {
            Log("PhotoDisplayTimer_Elapsed: Photo display time expired");
            try
            {
                // Stop the timer on timer thread (safe, just stops it from firing again)
                System.Timers.Timer? timerToDispose = null;
                if (_photoDisplayTimer != null)
                {
                    _photoDisplayTimer.Stop();
                    _photoDisplayTimer.Elapsed -= PhotoDisplayTimer_Elapsed;
                    timerToDispose = _photoDisplayTimer;
                    _photoDisplayTimer = null;
                }

                // Use InvokeAsync directly - it properly handles async operations and won't block
                _ = Dispatcher.UIThread.InvokeAsync(async () =>
                {
                    try
                    {
                        // Dispose timer on UI thread
                        timerToDispose?.Dispose();

                        Log($"PhotoDisplayTimer_Elapsed: Loop enabled: {_isLoopEnabled}, AutoPlayNext: {_autoPlayNext}");
                        
                        if (_isLoopEnabled)
                        {
                            Log("PhotoDisplayTimer_Elapsed: Loop is enabled - restarting photo display timer");
                            // Restart the timer to loop the photo
                            _photoDisplayTimer = new System.Timers.Timer(_photoDisplayDurationSeconds * 1000);
                            _photoDisplayTimer.Elapsed += PhotoDisplayTimer_Elapsed;
                            _photoDisplayTimer.AutoReset = false;
                            _photoDisplayTimer.Start();
                        }
                        else if (_autoPlayNext)
                        {
                            Log("PhotoDisplayTimer_Elapsed: Auto-play next enabled - playing random media");
                            await PlayRandomVideoAsync();
                        }
                        else
                        {
                            Log("PhotoDisplayTimer_Elapsed: No auto-play action - photo display ended");
                            PlayPauseButton.IsChecked = false;
                        }
                    }
                    catch (Exception ex)
                    {
                        Log($"PhotoDisplayTimer_Elapsed: ERROR in UI thread - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"PhotoDisplayTimer_Elapsed: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"PhotoDisplayTimer_Elapsed: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                        }
                    }
                }, DispatcherPriority.Normal).ContinueWith(task =>
                {
                    if (task.IsFaulted && task.Exception != null)
                    {
                        Log($"PhotoDisplayTimer_Elapsed: ERROR in InvokeAsync task - Exception: {task.Exception.GetType().Name}");
                        foreach (var innerEx in task.Exception.InnerExceptions)
                        {
                            Log($"PhotoDisplayTimer_Elapsed: ERROR - Inner exception: {innerEx.GetType().Name}, Message: {innerEx.Message}");
                            Log($"PhotoDisplayTimer_Elapsed: ERROR - Stack trace: {innerEx.StackTrace}");
                        }
                    }
                }, TaskContinuationOptions.OnlyOnFaulted);
            }
            catch (Exception ex)
            {
                Log($"PhotoDisplayTimer_Elapsed: ERROR in timer thread - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"PhotoDisplayTimer_Elapsed: ERROR - Stack trace: {ex.StackTrace}");
            }
        }

        private async Task HandleEndReachedAsync()
        {
            Log("HandleEndReachedAsync: Starting end-of-video handling");
            try
            {
                // Ensure play/pause toggle reflects stopped state
                await Dispatcher.UIThread.InvokeAsync(() => PlayPauseButton.IsChecked = false);

                Log($"HandleEndReachedAsync: Loop enabled: {_isLoopEnabled}, AutoPlayNext: {_autoPlayNext}");
                
                if (_isLoopEnabled)
                {
                    Log("HandleEndReachedAsync: Loop is enabled - video will loop seamlessly (LibVLC handles this)");
                    // LibVLC handles looping automatically via input-repeat option
                    // No action needed - the video will loop seamlessly
                    return;
                }
                else if (_autoPlayNext && !_isLoopEnabled)
                {
                    Log("HandleEndReachedAsync: Auto-play next enabled - playing random media");
                    // If loop is off, honor autoplay to move to the next random selection
                    // Call PlayRandomVideoAsync directly - it handles UI thread marshalling internally
                    await PlayRandomVideoAsync();
                }
                else
                {
                    Log("HandleEndReachedAsync: No auto-play action - video ended and stopped");
                }
            }
            catch (Exception ex)
            {
                Log($"HandleEndReachedAsync: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"HandleEndReachedAsync: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"HandleEndReachedAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
                
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    StatusTextBlock.Text = $"Playback error: {ex.Message}";
                });
            }
        }

        #region Favorites System

        private void FavoriteToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("FavoriteToggle_Changed: Favorite toggle changed event fired");
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("FavoriteToggle_Changed: No current video path, disabling toggle");
                FavoriteToggle.IsEnabled = false;
                return;
            }

            FavoriteToggle.IsEnabled = true;

            var isFavorite = FavoriteToggle.IsChecked == true;
            Log($"FavoriteToggle_Changed: Setting favorite to {isFavorite} for video: {Path.GetFileName(_currentVideoPath)}");

            // Update library item
            if (_libraryIndex != null)
            {
                var item = _libraryService.FindItemByPath(_currentVideoPath);
                if (item != null)
                {
                    var oldFavorite = item.IsFavorite;
                    if (oldFavorite == isFavorite)
                    {
                        Log($"FavoriteToggle_Changed: Item already has IsFavorite={isFavorite}, skipping update (likely programmatic change)");
                        return;
                    }
                    
                    item.IsFavorite = isFavorite;
                    
                    // EXCLUSIVE: If adding to favorites, remove from blacklist
                    if (isFavorite && item.IsBlacklisted)
                    {
                        Log($"FavoriteToggle_Changed: Removing from blacklist (exclusive with favorites)");
                        item.IsBlacklisted = false;
                        // Update blacklist toggle UI to reflect change
                        BlacklistToggle.IsChecked = false;
                    }
                    
                    _libraryService.UpdateItem(item);
                    Log($"FavoriteToggle_Changed: Updated library item - IsFavorite: {oldFavorite} -> {isFavorite}");
                    
                    if (isFavorite)
                    {
                        StatusTextBlock.Text = $"Added to favorites: {System.IO.Path.GetFileName(_currentVideoPath)}";
                        Log("FavoriteToggle_Changed: Added to favorites");
                    }
                    else
                    {
                        StatusTextBlock.Text = $"Removed from favorites: {System.IO.Path.GetFileName(_currentVideoPath)}";
                        Log("FavoriteToggle_Changed: Removed from favorites");
                    }
                    
                    // Save library asynchronously to avoid blocking
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            Log("FavoriteToggle_Changed: Saving library asynchronously...");
                            _libraryService.SaveLibrary();
                            Log("FavoriteToggle_Changed: Library saved successfully");
                        }
                        catch (Exception ex)
                        {
                            Log($"FavoriteToggle_Changed: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            Log($"FavoriteToggle_Changed: ERROR - Stack trace: {ex.StackTrace}");
                            if (ex.InnerException != null)
                            {
                                Log($"FavoriteToggle_Changed: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                            }
                        }
                    });
                }
                else
                {
                    Log($"FavoriteToggle_Changed: Library item not found for path: {_currentVideoPath}");
                }
            }
            else
            {
                Log("FavoriteToggle_Changed: Library index is null, cannot update item");
            }

            // Update Library panel if visible
            if (_showLibraryPanel)
            {
                Log("FavoriteToggle_Changed: Updating library panel");
                UpdateLibraryPanel();
            }
            
            // Update stats when favorites change
            Log("FavoriteToggle_Changed: Recalculating global stats");
            RecalculateGlobalStats();
            UpdateCurrentFileStatsUi();
            Log("FavoriteToggle_Changed: Favorite toggle change complete");

            // Queue will be rebuilt when filters change via FilterDialog
        }

        #endregion

        #region Blacklist System

        private void BlacklistCurrentVideo()
        {
            if (string.IsNullOrEmpty(_currentVideoPath))
                return;

            // Update library item
            if (_libraryIndex != null)
            {
                var item = _libraryService.FindItemByPath(_currentVideoPath);
                if (item != null)
                {
                    item.IsBlacklisted = true;
                    _libraryService.UpdateItem(item);
                    
                    // Save library asynchronously
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            _libraryService.SaveLibrary();
                        }
                        catch (Exception ex)
                        {
                            Log($"BlacklistToggle_Changed: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            Log($"BlacklistToggle_Changed: ERROR - Stack trace: {ex.StackTrace}");
                            if (ex.InnerException != null)
                            {
                                Log($"BlacklistToggle_Changed: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                            }
                        }
                    });
                }
            }

            // Remove from queue if present
            var queueList = _playQueue.ToList();
            queueList.Remove(_currentVideoPath);
            _playQueue = new Queue<string>(queueList);

            // Rebuild queue if needed
            RebuildPlayQueueIfNeeded();
            UpdatePerVideoToggleStates();
        }

        private void RemoveFromBlacklist(string videoPath)
        {
            // Update library item
            if (_libraryIndex != null)
            {
                var item = _libraryService.FindItemByPath(videoPath);
                if (item != null)
                {
                    item.IsBlacklisted = false;
                    _libraryService.UpdateItem(item);
                    
                    // Save library asynchronously
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            _libraryService.SaveLibrary();
                        }
                        catch (Exception ex)
                        {
                            Log($"RemoveFromBlacklist: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            Log($"RemoveFromBlacklist: ERROR - Stack trace: {ex.StackTrace}");
                            if (ex.InnerException != null)
                            {
                                Log($"RemoveFromBlacklist: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                            }
                        }
                    });
                }
            }
            
            RebuildPlayQueueIfNeeded();
            UpdatePerVideoToggleStates();
            // Update Library panel if visible
            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
        }

        #endregion

        #region Playback Stats System

        private void RecordPlayback(string path)
        {
            Log($"RecordPlayback: Starting - path: {path ?? "null"}");
            
            if (string.IsNullOrEmpty(path))
            {
                Log("RecordPlayback: Path is null or empty, returning");
                return;
            }

            // Update library item directly
            if (_libraryIndex != null)
            {
                var item = _libraryService.FindItemByPath(path);
                if (item != null)
                {
                    var oldPlayCount = item.PlayCount;
                    var oldLastPlayed = item.LastPlayedUtc;
                    
                    // Capture the previous LastPlayedUtc before updating (for display purposes)
                    // This way "Last played" shows when it was last played BEFORE this current play
                    _previousLastPlayedUtc = item.LastPlayedUtc;

                    item.PlayCount++;
                    item.LastPlayedUtc = DateTime.UtcNow;
                    
                    Log($"RecordPlayback: Updating item - PlayCount: {oldPlayCount} -> {item.PlayCount}, LastPlayedUtc: {oldLastPlayed} -> {item.LastPlayedUtc}");
                    
                    _libraryService.UpdateItem(item);
                    
                    // Save library asynchronously to avoid blocking
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            Log("RecordPlayback: Saving library asynchronously...");
                            _libraryService.SaveLibrary();
                            Log("RecordPlayback: Library saved successfully");
                        }
                        catch (Exception ex)
                        {
                            Log($"RecordPlayback: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            Log($"RecordPlayback: ERROR - Stack trace: {ex.StackTrace}");
                            if (ex.InnerException != null)
                            {
                                Log($"RecordPlayback: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                            }
                        }
                    });
                }
                else
                {
                    Log($"RecordPlayback: Item not found in library for path: {path}");
                }
            }
            else
            {
                Log("RecordPlayback: Library index is null, skipping playback recording");
            }

            // Update UI immediately (we're already on UI thread when called from PlayVideo)
            // Call UpdateCurrentFileStatsUi first to show current file, then recalculate globals
            Log("RecordPlayback: Updating UI stats");
            UpdateCurrentFileStatsUi();
            RecalculateGlobalStats();
            Log("RecordPlayback: Completed");
        }

        private void RecalculateGlobalStats()
        {
            // Ensure we're on UI thread for property updates
            if (!Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => RecalculateGlobalStats());
                return;
            }

            Log("RecalculateGlobalStats: Starting global stats recalculation");

            // Build union of all known video paths
            var knownVideos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Add library items
            if (_libraryIndex != null)
            {
                foreach (var item in _libraryIndex.Items)
                {
                    knownVideos.Add(item.FullPath);
                }
            }

            // Calculate global stats from library items
            if (_libraryIndex != null)
            {
                var videos = _libraryIndex.Items.Where(i => i.MediaType == MediaType.Video).ToList();
                var photos = _libraryIndex.Items.Where(i => i.MediaType == MediaType.Photo).ToList();
                GlobalTotalVideosKnown = videos.Count;
                GlobalTotalPhotosKnown = photos.Count;
                GlobalTotalMediaKnown = videos.Count + photos.Count;
                GlobalFavoritesCount = _libraryIndex.Items.Count(i => i.IsFavorite);
                GlobalBlacklistCount = _libraryIndex.Items.Count(i => i.IsBlacklisted);
                Log($"RecalculateGlobalStats: Library stats - Videos: {GlobalTotalVideosKnown}, Photos: {GlobalTotalPhotosKnown}, Total Media: {GlobalTotalMediaKnown}, Favorites: {GlobalFavoritesCount}, Blacklisted: {GlobalBlacklistCount}");
            }
            else
            {
                GlobalTotalVideosKnown = knownVideos.Count;
                GlobalTotalPhotosKnown = 0;
                GlobalTotalMediaKnown = knownVideos.Count;
                GlobalFavoritesCount = 0;
                GlobalBlacklistCount = 0;
                Log($"RecalculateGlobalStats: No library index, using known videos count: {GlobalTotalVideosKnown}");
            }

            // Calculate stats from library items, distinguishing videos from photos
            int uniqueVideosPlayed = 0;
            int uniquePhotosPlayed = 0;
            int totalPlays = 0;
            int videosWithAudio = 0;
            int videosWithoutAudio = 0;

            if (_libraryIndex != null)
            {
                foreach (var item in _libraryIndex.Items)
                {
                    if (item.PlayCount > 0)
                    {
                        totalPlays += item.PlayCount;
                        
                        // Distinguish between videos and photos
                        if (item.MediaType == MediaType.Video)
                        {
                            uniqueVideosPlayed++;
                        }
                        else if (item.MediaType == MediaType.Photo)
                        {
                            uniquePhotosPlayed++;
                        }
                    }
                    
                    // Audio stats only apply to videos
                    if (item.MediaType == MediaType.Video)
                    {
                        if (item.HasAudio == true)
                        {
                            videosWithAudio++;
                        }
                        else if (item.HasAudio == false)
                        {
                            videosWithoutAudio++;
                        }
                        // If HasAudio == null (unknown), exclude from both counts
                    }
                }
            }

            GlobalUniqueVideosPlayed = uniqueVideosPlayed;
            GlobalUniquePhotosPlayed = uniquePhotosPlayed;
            GlobalUniqueMediaPlayed = uniqueVideosPlayed + uniquePhotosPlayed;
            GlobalTotalPlays = totalPlays;
            GlobalNeverPlayedVideosKnown = Math.Max(0, GlobalTotalVideosKnown - GlobalUniqueVideosPlayed);
            GlobalNeverPlayedPhotosKnown = Math.Max(0, GlobalTotalPhotosKnown - GlobalUniquePhotosPlayed);
            GlobalNeverPlayedMediaKnown = Math.Max(0, GlobalTotalMediaKnown - GlobalUniqueMediaPlayed);
            GlobalVideosWithAudio = videosWithAudio;
            GlobalVideosWithoutAudio = videosWithoutAudio;
            
            // Update baseline loudness display
            if (_volumeNormalizationEnabled && videosWithAudio > 0)
            {
                double baseline = GetLibraryBaselineLoudness();
                string mode = _baselineAutoMode ? " (Auto)" : " (Manual)";
                GlobalBaselineLoudnessDisplay = $"{baseline:F1} LUFS{mode}";
            }
            else if (_volumeNormalizationEnabled)
            {
                GlobalBaselineLoudnessDisplay = "No audio data";
            }
            else
            {
                GlobalBaselineLoudnessDisplay = "Normalization off";
            }
            
            Log($"RecalculateGlobalStats: Playback stats - Unique videos played: {GlobalUniqueVideosPlayed}, Unique photos played: {GlobalUniquePhotosPlayed}, Unique media played: {GlobalUniqueMediaPlayed}, Total plays: {GlobalTotalPlays}");
            Log($"RecalculateGlobalStats: Never played - Videos: {GlobalNeverPlayedVideosKnown}, Photos: {GlobalNeverPlayedPhotosKnown}, Media: {GlobalNeverPlayedMediaKnown}");
            Log($"RecalculateGlobalStats: Audio stats - With audio: {GlobalVideosWithAudio}, Without audio: {GlobalVideosWithoutAudio}");
            Log("RecalculateGlobalStats: Global stats recalculation complete");
            
            // Update library info text
            UpdateLibraryInfoText();
            UpdateFilterSummaryText();
        }

        private void UpdateLibraryInfoText()
        {
            // Update immediately with total count (fast)
            if (_libraryIndex == null)
            {
                LibraryInfoText = "Library • 🎞️ 0 videos • 📷 0 photos";
                return;
            }

            int totalVideos = _libraryIndex.Items.Count(i => i.MediaType == MediaType.Video);
            int totalPhotos = _libraryIndex.Items.Count(i => i.MediaType == MediaType.Photo);

            // Show total
            LibraryInfoText = $"Library • 🎞️ {totalVideos:N0} videos • 📷 {totalPhotos:N0} photos";
            
            // Update filter summary separately
            UpdateFilterSummaryText();
        }

        private void UpdateFilterSummaryText()
        {
            // Always show normal filter summary (preset selection is now in separate dropdown)
            if (_currentFilterState == null)
            {
                FilterSummaryText = "Filters: None";
                return;
            }

            var filterParts = new List<string>();
            if (_currentFilterState.FavoritesOnly)
                filterParts.Add("Favorites");
            if (_currentFilterState.OnlyNeverPlayed)
                filterParts.Add("Never played");
            if (_currentFilterState.MediaTypeFilter == MediaTypeFilter.VideosOnly)
                filterParts.Add("Videos only");
            else if (_currentFilterState.MediaTypeFilter == MediaTypeFilter.PhotosOnly)
                filterParts.Add("Photos only");
            if (_currentFilterState.AudioFilter == AudioFilterMode.WithAudioOnly)
                filterParts.Add("With audio");
            else if (_currentFilterState.AudioFilter == AudioFilterMode.WithoutAudioOnly)
                filterParts.Add("Without audio");
            if (_currentFilterState.MinDuration.HasValue || _currentFilterState.MaxDuration.HasValue)
                filterParts.Add("Duration");
            // Tag inclusion filters
            if (_currentFilterState.SelectedTags != null && _currentFilterState.SelectedTags.Count > 0)
            {
                var matchMode = _currentFilterState.TagMatchMode == TagMatchMode.And ? "all" : "any";
                filterParts.Add($"{_currentFilterState.SelectedTags.Count} tag(s) included ({matchMode})");
            }
            
            // Tag exclusion filters
            if (_currentFilterState.ExcludedTags != null && _currentFilterState.ExcludedTags.Count > 0)
            {
                filterParts.Add($"{_currentFilterState.ExcludedTags.Count} tag(s) excluded");
            }

            if (filterParts.Count > 0)
            {
                FilterSummaryText = "Filters: " + string.Join(", ", filterParts);
            }
            else
            {
                FilterSummaryText = "Filters: None";
            }
        }

        private void UpdateCurrentFileStatsUi()
        {
            // Ensure we're on UI thread for property updates
            if (!Avalonia.Threading.Dispatcher.UIThread.CheckAccess())
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() => UpdateCurrentFileStatsUi());
                return;
            }

            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("UpdateCurrentFileStatsUi: No current file path, clearing stats UI");
                CurrentVideoFileName = "No file playing";
                CurrentVideoFullPath = "";
                CurrentVideoPlayCount = 0;
                CurrentVideoLastPlayedDisplay = "Never";
                CurrentVideoIsFavoriteDisplay = "No";
                CurrentVideoIsBlacklistedDisplay = "No";
                CurrentVideoDurationDisplay = "Unknown";
                CurrentVideoHasAudioDisplay = "Unknown";
                CurrentVideoLoudnessDisplay = "Unknown";
                CurrentVideoLoudnessAdjustmentDisplay = "N/A";
                CurrentVideoPeakDisplay = "Unknown";
                CurrentVideoTagsDisplay = "None";
                IsCurrentFileVideo = true; // Default to video for backward compatibility
                return;
            }

            var path = _currentVideoPath;
            if (path == null)
            {
                Log("UpdateCurrentFileStatsUi: Current file path is null, returning");
                return;
            }

            Log($"UpdateCurrentFileStatsUi: Updating stats UI for file: {Path.GetFileName(path)}");
            CurrentVideoFileName = System.IO.Path.GetFileName(path) ?? "";
            CurrentVideoFullPath = path ?? "";

            // Look up all file info from library item
            int playCount = 0;
            DateTime? lastPlayedUtc = null;
            bool isFavorite = false;
            bool isBlacklisted = false;
            TimeSpan? duration = null;
            bool? hasAudio = null;
            double? integratedLoudness = null;
            double? peakDb = null;
            LibraryItem? item = null;
            
            if (path != null && _libraryIndex != null)
            {
                item = _libraryService.FindItemByPath(path);
                if (item != null)
                {
                    playCount = item.PlayCount;
                    lastPlayedUtc = item.LastPlayedUtc;
                    isFavorite = item.IsFavorite;
                    isBlacklisted = item.IsBlacklisted;
                    duration = item.Duration;
                    hasAudio = item.HasAudio;
                    integratedLoudness = item.IntegratedLoudness;
                    peakDb = item.PeakDb;
                    
                    // Set media type for visibility binding
                    IsCurrentFileVideo = item.MediaType == MediaType.Video;
                    
                    Log($"UpdateCurrentFileStatsUi: Found library item - MediaType: {item.MediaType}, PlayCount: {playCount}, Favorite: {isFavorite}, Blacklisted: {isBlacklisted}, HasAudio: {hasAudio}, Duration: {duration?.TotalSeconds ?? -1}s");
                }
                else
                {
                    Log($"UpdateCurrentFileStatsUi: Library item not found for path: {path}");
                    IsCurrentFileVideo = true; // Default to video for backward compatibility
                }
            }

            CurrentVideoPlayCount = playCount;
            // Show the previous LastPlayedUtc (before current play) if available, otherwise current LastPlayedUtc, otherwise Never
            if (_previousLastPlayedUtc.HasValue)
            {
                CurrentVideoLastPlayedDisplay = _previousLastPlayedUtc.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
            }
            else if (lastPlayedUtc.HasValue)
            {
                CurrentVideoLastPlayedDisplay = lastPlayedUtc.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
            }
            else
            {
                CurrentVideoLastPlayedDisplay = "Never";
            }

            CurrentVideoIsFavoriteDisplay = isFavorite ? "Yes" : "No";
            CurrentVideoIsBlacklistedDisplay = isBlacklisted ? "Yes" : "No";

            // Display duration (only for videos)
            if (IsCurrentFileVideo)
            {
                if (duration.HasValue)
                {
                    if (duration.Value.TotalHours >= 1)
                    {
                        CurrentVideoDurationDisplay = duration.Value.ToString(@"hh\:mm\:ss");
                    }
                    else
                    {
                        CurrentVideoDurationDisplay = duration.Value.ToString(@"mm\:ss");
                    }
                }
                else
                {
                    CurrentVideoDurationDisplay = "Unknown";
                }

                // Display loudness info from library item (only for videos)
                if (hasAudio == true)
                {
                    CurrentVideoHasAudioDisplay = "Yes";
                    if (integratedLoudness.HasValue)
                    {
                        CurrentVideoLoudnessDisplay = $"{integratedLoudness.Value:F1} LUFS";
                        
                        // Calculate and display normalization adjustment if enabled
                        if (_volumeNormalizationEnabled)
                        {
                            double baseline = GetLibraryBaselineLoudness();
                            double adjustment = baseline - integratedLoudness.Value;
                            
                            // Clamp to actual applied limits
                            if (adjustment > 0)
                                adjustment = Math.Min(adjustment, _maxBoostDb);
                            else
                                adjustment = Math.Max(adjustment, -_maxReductionDb);
                            
                            string sign = adjustment >= 0 ? "+" : "";
                            CurrentVideoLoudnessAdjustmentDisplay = $"{sign}{adjustment:F1} dB";
                        }
                        else
                        {
                            CurrentVideoLoudnessAdjustmentDisplay = "Off";
                        }
                    }
                    else
                    {
                        CurrentVideoLoudnessDisplay = "Unknown";
                        CurrentVideoLoudnessAdjustmentDisplay = "N/A";
                    }
                    
                    // Display PeakDb if available
                    if (peakDb.HasValue && peakDb.Value != 0.0)
                    {
                        CurrentVideoPeakDisplay = $"{peakDb.Value:F1} dB";
                    }
                    else
                    {
                        CurrentVideoPeakDisplay = "N/A";
                    }
                }
                else if (hasAudio == false)
                {
                    CurrentVideoHasAudioDisplay = "No";
                    CurrentVideoLoudnessDisplay = "N/A";
                    CurrentVideoLoudnessAdjustmentDisplay = "N/A";
                    CurrentVideoPeakDisplay = "N/A";
                }
                else
                {
                    CurrentVideoHasAudioDisplay = "Unknown";
                    CurrentVideoLoudnessDisplay = "Unknown";
                    CurrentVideoLoudnessAdjustmentDisplay = "N/A";
                    CurrentVideoPeakDisplay = "Unknown";
                }
            }
            else
            {
                // For photos, clear video-specific stats (they'll be hidden via IsVisible binding)
                CurrentVideoDurationDisplay = "";
                CurrentVideoHasAudioDisplay = "";
                CurrentVideoLoudnessDisplay = "";
                CurrentVideoLoudnessAdjustmentDisplay = "";
                CurrentVideoPeakDisplay = "";
            }

            // Display tags grouped by category
            if (item != null && item.Tags != null && item.Tags.Count > 0)
            {
                var categories = _libraryIndex?.Categories ?? new List<TagCategory>();
                var availableTags = _libraryIndex?.Tags ?? new List<Tag>();
                
                // Group item's tags by category
                var tagsByCategory = new List<(int SortOrder, string CategoryName, List<string> Tags)>();
                
                foreach (var category in categories.OrderBy(c => c.SortOrder))
                {
                    var tagsInCategory = item.Tags
                        .Where(tagName => availableTags.Any(t => 
                            string.Equals(t.Name, tagName, StringComparison.OrdinalIgnoreCase) && 
                            t.CategoryId == category.Id))
                        .OrderBy(t => t, StringComparer.OrdinalIgnoreCase)
                        .ToList();
                    
                    if (tagsInCategory.Count > 0)
                    {
                        tagsByCategory.Add((category.SortOrder, category.Name, tagsInCategory));
                    }
                }
                
                // Handle orphaned tags (tags not in any category)
                var processedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var (_, _, tags) in tagsByCategory)
                {
                    foreach (var tag in tags)
                    {
                        processedTags.Add(tag);
                    }
                }
                
                var orphanedTags = item.Tags
                    .Where(t => !processedTags.Contains(t))
                    .OrderBy(t => t, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                
                if (orphanedTags.Count > 0)
                {
                    tagsByCategory.Add((int.MaxValue, "Uncategorized", orphanedTags));
                }
                
                // Format output with each category on its own line
                if (tagsByCategory.Count > 0)
                {
                    CurrentVideoTagsDisplay = string.Join("\n", 
                        tagsByCategory.Select(t => $"{t.CategoryName}: {string.Join(", ", t.Tags)}"));
                }
                else
                {
                    CurrentVideoTagsDisplay = "None";
                }
            }
            else
            {
                CurrentVideoTagsDisplay = "None";
            }

            // Update toggle buttons to reflect current state
            FavoriteToggle.IsChecked = isFavorite;
            BlacklistToggle.IsChecked = isBlacklisted;
            
            Log($"UpdateCurrentFileStatsUi: Stats UI updated - MediaType: {(IsCurrentFileVideo ? "Video" : "Photo")}, Favorite: {CurrentVideoIsFavoriteDisplay}, Blacklisted: {CurrentVideoIsBlacklistedDisplay}, Duration: {CurrentVideoDurationDisplay}, Audio: {CurrentVideoHasAudioDisplay}, Tags: {CurrentVideoTagsDisplay}");
        }

        #endregion

        #region Duration Cache System

        private void StartDurationScan(string rootFolder)
        {
            Log($"StartDurationScan: Starting duration scan for folder: {rootFolder}");
            // Cancel any existing scan
            if (_scanCancellationSource != null)
            {
                Log("StartDurationScan: Already scanning, skipping new scan request");
                return; // Already scanning
            }
                
            _scanCancellationSource?.Cancel();
            _scanCancellationSource?.Dispose();
            _scanCancellationSource = new CancellationTokenSource();

            var token = _scanCancellationSource.Token;
            Log("StartDurationScan: Cancellation token created, starting async scan task");

            // Start async scan on thread pool (not Task.Run to avoid thread pool issues)
            _ = Task.Factory.StartNew(async () =>
            {
                try
                {
                    Log("StartDurationScan: Async scan task started");
                    await ScanDurationsAsync(rootFolder, token);
                    Log("StartDurationScan: Async scan task completed successfully");
                }
                catch (Exception ex)
                {
                    Log($"StartDurationScan: ERROR - Exception in scan task: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"StartDurationScan: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"StartDurationScan: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                    // Log error to UI thread
                    try
                    {
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            StatusTextBlock.Text = $"Scan error: {ex.GetType().Name} - {ex.Message}";
                        });
                    }
                    catch (Exception uiEx)
                    {
                        // UI might be disposed
                        Log($"StartDurationScan: UI thread unavailable for error message - Exception: {uiEx.GetType().Name}, Message: {uiEx.Message}");
                    }
                }
                finally
                {
                    Log("StartDurationScan: Cleaning up cancellation token source");
                    _scanCancellationSource?.Dispose();
                    _scanCancellationSource = null;
                }
            }, token, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        }

        private static async Task<TimeSpan?> GetVideoDurationAsync(string filePath, CancellationToken cancellationToken)
        {
            // Initialize semaphore on first use (thread-safe)
            if (_ffprobeSemaphore == null)
            {
                lock (_ffprobeSemaphoreLock)
                {
                    if (_ffprobeSemaphore == null)
                    {
                        var maxConcurrency = Math.Clamp(Environment.ProcessorCount / 2, 2, 8);
                        _ffprobeSemaphore = new SemaphoreSlim(maxConcurrency, maxConcurrency);
                        Log($"GetVideoDurationAsync: Initialized FFprobe semaphore with max concurrency: {maxConcurrency}");
                    }
                }
            }

            bool semaphoreAcquired = false;
            try
            {
                await _ffprobeSemaphore.WaitAsync(cancellationToken);
                semaphoreAcquired = true;
                Log($"GetVideoDurationAsync: Acquired semaphore for file: {Path.GetFileName(filePath)}");
                // Get FFprobe path (bundled or system)
                var ffprobePath = NativeBinaryHelper.GetFFprobePath();
                if (string.IsNullOrEmpty(ffprobePath))
                {
                    // Fall back to system ffprobe on PATH
                    ffprobePath = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "ffprobe.exe" : "ffprobe";
                    Log($"GetVideoDurationAsync: Using system FFprobe: {ffprobePath}");
                }
                else
                {
                    Log($"GetVideoDurationAsync: Using bundled FFprobe: {ffprobePath}");
                }

                var startInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = ffprobePath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                // Use ArgumentList to safely handle paths with spaces and special characters
                startInfo.ArgumentList.Add("-v");
                startInfo.ArgumentList.Add("error");
                startInfo.ArgumentList.Add("-select_streams");
                startInfo.ArgumentList.Add("v:0");
                startInfo.ArgumentList.Add("-show_entries");
                startInfo.ArgumentList.Add("format=duration,stream=duration");
                startInfo.ArgumentList.Add("-of");
                startInfo.ArgumentList.Add("json");
                startInfo.ArgumentList.Add("-i");
                startInfo.ArgumentList.Add(filePath);

                using var process = new System.Diagnostics.Process { StartInfo = startInfo };
                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

                var outputTask = Task.Run(async () =>
                {
                    try
                    {
                        process.Start();
                        // Read both stdout and stderr to prevent deadlocks
                        var stdoutTask = process.StandardOutput.ReadToEndAsync(linkedCts.Token);
                        var stderrTask = process.StandardError.ReadToEndAsync(linkedCts.Token);
                        await process.WaitForExitAsync(linkedCts.Token);
                        await Task.WhenAll(stdoutTask, stderrTask);
                        return await stdoutTask;
                    }
                    catch (OperationCanceledException)
                    {
                        try
                        {
                            if (!process.HasExited)
                            {
                                process.Kill();
                            }
                        }
                        catch (Exception killEx)
                        {
                            Log($"GetVideoDurationAsync: ERROR killing process after cancellation - Exception: {killEx.GetType().Name}, Message: {killEx.Message}");
                        }
                        throw;
                    }
                }, linkedCts.Token);

                try
                {
                    var output = await outputTask;
                    
                    if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
                    {
                        Log($"GetVideoDurationAsync: FFprobe failed for {Path.GetFileName(filePath)} - Exit code: {process.ExitCode}, Output empty: {string.IsNullOrWhiteSpace(output)}");
                        return null;
                    }

                    // Parse JSON output
                    using var doc = JsonDocument.Parse(output);
                    var root = doc.RootElement;

                    // Prefer format.duration if present and > 0
                    if (root.TryGetProperty("format", out var format) &&
                        format.TryGetProperty("duration", out var formatDuration) &&
                        formatDuration.ValueKind == JsonValueKind.String)
                    {
                        if (double.TryParse(formatDuration.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var durationSeconds) &&
                            durationSeconds > 0)
                        {
                            var duration = TimeSpan.FromSeconds(durationSeconds);
                            Log($"GetVideoDurationAsync: Successfully got duration from format.duration for {Path.GetFileName(filePath)}: {duration.TotalSeconds:F2}s");
                            return duration;
                        }
                    }

                    // Fall back to stream duration
                    if (root.TryGetProperty("streams", out var streams) &&
                        streams.ValueKind == JsonValueKind.Array &&
                        streams.GetArrayLength() > 0)
                    {
                        var firstStream = streams[0];
                        if (firstStream.TryGetProperty("duration", out var streamDuration) &&
                            streamDuration.ValueKind == JsonValueKind.String)
                        {
                            if (double.TryParse(streamDuration.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var durationSeconds) &&
                                durationSeconds > 0)
                            {
                                var duration = TimeSpan.FromSeconds(durationSeconds);
                                Log($"GetVideoDurationAsync: Successfully got duration from stream.duration for {Path.GetFileName(filePath)}: {duration.TotalSeconds:F2}s");
                                return duration;
                            }
                        }
                    }

                    Log($"GetVideoDurationAsync: Could not parse duration from FFprobe output for {Path.GetFileName(filePath)}");
                    return null;
                }
                catch (OperationCanceledException)
                {
                    Log($"GetVideoDurationAsync: Operation cancelled or timed out for {Path.GetFileName(filePath)}");
                    // Timeout or cancellation - ensure process is killed
                    try
                    {
                        if (!process.HasExited)
                        {
                            process.Kill();
                            Log($"GetVideoDurationAsync: Killed FFprobe process for {Path.GetFileName(filePath)}");
                        }
                    }
                    catch (Exception killEx)
                    {
                        Log($"GetVideoDurationAsync: ERROR killing process - {killEx.Message}");
                    }
                    return null;
                }
                catch (JsonException ex)
                {
                    Log($"GetVideoDurationAsync: JSON parse error for {Path.GetFileName(filePath)} - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"GetVideoDurationAsync: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"GetVideoDurationAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                    // Invalid JSON - file might be corrupted or not a video
                    return null;
                }
                catch (Exception ex)
                {
                    Log($"GetVideoDurationAsync: ERROR processing {Path.GetFileName(filePath)} - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"GetVideoDurationAsync: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"GetVideoDurationAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                    // Other errors - return null to skip this file
                    return null;
                }
            }
            finally
            {
                if (semaphoreAcquired)
                {
                    _ffprobeSemaphore.Release();
                    Log($"GetVideoDurationAsync: Released semaphore for {Path.GetFileName(filePath)}");
                }
            }
        }

        private async Task ScanDurationsAsync(string rootFolder, CancellationToken cancellationToken)
        {
            Log($"ScanDurationsAsync: Starting duration scan for folder: {rootFolder}");
            // Get all video files in the folder tree
            string[] allFiles;
            try
            {
                Log($"ScanDurationsAsync: Scanning directory tree for video files...");
                allFiles = Directory.GetFiles(rootFolder, "*.*", SearchOption.AllDirectories)
                    .Where(f => _videoExtensions.Contains(
                        Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
                Log($"ScanDurationsAsync: Found {allFiles.Length} video files in folder tree");
            }
            catch (Exception ex)
            {
                Log($"ScanDurationsAsync: ERROR scanning folder - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"ScanDurationsAsync: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"ScanDurationsAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Error scanning folder: {ex.Message}";
                });
                return;
            }

            // Filter out already-cached files upfront (batch check for performance)
            // Check library items for existing durations
            HashSet<string> filesWithDuration = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (_libraryIndex != null)
            {
                foreach (var item in _libraryIndex.Items)
                {
                    if (item.Duration.HasValue && item.Duration.Value.TotalSeconds > 0)
                    {
                        filesWithDuration.Add(item.FullPath);
                    }
                }
            }
            
            string[] filesToScan = allFiles.Where(f => !filesWithDuration.Contains(f)).ToArray();
            int alreadyCachedCount = allFiles.Length - filesToScan.Length;
            Log($"ScanDurationsAsync: {alreadyCachedCount} files already have duration cached, {filesToScan.Length} files need scanning");

            int total = allFiles.Length;
            int processed = alreadyCachedCount; // Start with already cached count
            var processedLock = new object();

            // Update UI to show scan started
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                if (alreadyCachedCount > 0)
                {
                    SetStatusMessage($"Scanning / indexing… ({alreadyCachedCount} already cached, {filesToScan.Length} to scan)");
                }
                else
                {
                    SetStatusMessage($"Scanning / indexing… (0/{total} files processed)");
                }
            });

            // If all files are already cached, we're done
            if (filesToScan.Length == 0)
            {
                Log($"ScanDurationsAsync: All {total} files already have duration cached, skipping scan");
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    SetStatusMessage($"Ready ({total} files, all cached)");
                });
                return;
            }

            // Log which FFprobe binary is being used (on first scan)
            var ffprobePath = NativeBinaryHelper.GetFFprobePath();
            if (!string.IsNullOrEmpty(ffprobePath))
            {
                Log($"Using bundled FFprobe: {ffprobePath}");
            }
            else
            {
                Log("Using system FFprobe from PATH");
            }

            Log($"ScanDurationsAsync: Starting parallel processing of {filesToScan.Length} files");
            // Process only uncached files with parallel async execution
            var scanTasks = filesToScan.Select(async file =>
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    Log($"ScanDurationsAsync: Scan cancelled, stopping file processing");
                    return;
                }

                // Verify file exists and is accessible
                if (!System.IO.File.Exists(file))
                {
                    Log($"ScanDurationsAsync: File does not exist, skipping: {Path.GetFileName(file)}");
                    lock (processedLock)
                    {
                        processed++;
                    }
                    return;
                }

                // Use FFprobe to get duration
                var duration = await GetVideoDurationAsync(file, cancellationToken);
                
                if (duration.HasValue && duration.Value.TotalSeconds > 0)
                {
                    // Update library item if it exists
                    if (_libraryIndex != null)
                    {
                        var item = _libraryService.FindItemByPath(file);
                        if (item != null && (!item.Duration.HasValue || item.Duration.Value != duration.Value))
                        {
                            var oldDuration = item.Duration;
                            item.Duration = duration.Value;
                            _libraryService.UpdateItem(item);
                            Log($"ScanDurationsAsync: Updated duration for {Path.GetFileName(file)}: {oldDuration?.TotalSeconds ?? -1:F2}s -> {duration.Value.TotalSeconds:F2}s");
                            // Save library asynchronously (batch saves at end of scan)
                        }
                        else if (item == null)
                        {
                            Log($"ScanDurationsAsync: Library item not found for {Path.GetFileName(file)}, duration not saved");
                        }
                    }
                }
                else
                {
                    Log($"ScanDurationsAsync: Could not get duration for {Path.GetFileName(file)}");
                }
                // If duration is null, skip this file (don't write 0 - treat as "Unknown")

                int newProcessed;
                lock (processedLock)
                {
                    processed++;
                    newProcessed = processed;
                }

                // Update UI progress with throttling (every file, but max once per 100ms)
                bool shouldUpdate = false;
                lock (_durationStatusUpdateLock)
                {
                    var now = DateTime.UtcNow;
                    if ((now - _lastDurationStatusUpdate).TotalMilliseconds >= 1000 || newProcessed == total)
                    {
                        _lastDurationStatusUpdate = now;
                        shouldUpdate = true;
                    }
                }

                if (shouldUpdate)
                {
                    // Save library periodically during scan
                    if (_libraryIndex != null)
                    {
                        _ = Task.Run(() =>
                        {
                            try
                            {
                                _libraryService.SaveLibrary();
                            }
                            catch (Exception ex)
                            {
                                Log($"ScanDurationsAsync: ERROR saving library during scan - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                Log($"ScanDurationsAsync: ERROR - Stack trace: {ex.StackTrace}");
                                if (ex.InnerException != null)
                                {
                                    Log($"ScanDurationsAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                                }
                            }
                        });
                    }
                    
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        SetStatusMessage($"Scanning / indexing… ({newProcessed}/{total} files processed)");
                    });
                }
            });

            // Wait for all scan tasks to complete
            Log("ScanDurationsAsync: Waiting for all scan tasks to complete...");
            await Task.WhenAll(scanTasks);
            Log($"ScanDurationsAsync: All scan tasks completed. Processed {processed}/{total} files");

            // Final save library and update UI
            if (_libraryIndex != null)
            {
                Log("ScanDurationsAsync: Performing final library save...");
                _ = Task.Run(() =>
                {
                    try
                    {
                        _libraryService.SaveLibrary();
                        Log("ScanDurationsAsync: Final library save completed successfully");
                    }
                    catch (Exception ex)
                    {
                        Log($"ScanDurationsAsync: ERROR saving library after duration scan - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"ScanDurationsAsync: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"ScanDurationsAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                        }
                    }
                });
            }
            Log("ScanDurationsAsync: Updating UI and stats");
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                RecalculateGlobalStats();
                UpdateCurrentFileStatsUi();
                // Always show scan completion message
                SetStatusMessage($"Duration scan complete ({total} files)");
            });
            Log("ScanDurationsAsync: Duration scan complete");
        }

        private void StartLoudnessScan(string rootFolder, bool rescanAll = false)
        {
            Log($"StartLoudnessScan: Starting loudness scan for folder: {rootFolder}, RescanAll: {rescanAll}");
            // Cancel any existing scan
            if (_scanCancellationSource != null)
            {
                Log("StartLoudnessScan: Already scanning, skipping new scan request");
                return; // Already scanning
            }
                
            _scanCancellationSource?.Cancel();
            _scanCancellationSource?.Dispose();
            _scanCancellationSource = new CancellationTokenSource();

            var token = _scanCancellationSource.Token;
            Log("StartLoudnessScan: Cancellation token created, starting async scan task");

            // Start async scan on thread pool
            _ = Task.Factory.StartNew(async () =>
            {
                try
                {
                    Log("StartLoudnessScan: Async scan task started");
                    await ScanLoudnessAsync(rootFolder, token, rescanAll);
                    Log("StartLoudnessScan: Async scan task completed successfully");
                }
                catch (Exception ex)
                {
                    Log($"StartLoudnessScan: ERROR - Exception in scan task: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"StartLoudnessScan: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"StartLoudnessScan: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                    // Log error to UI thread
                    try
                    {
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        {
                            StatusTextBlock.Text = $"Loudness scan error: {ex.GetType().Name} - {ex.Message}";
                        });
                    }
                    catch (Exception uiEx)
                    {
                        // UI might be disposed
                        Log($"StartLoudnessScan: UI thread unavailable for error message - Exception: {uiEx.GetType().Name}, Message: {uiEx.Message}");
                    }
                }
                finally
                {
                    Log("StartLoudnessScan: Cleaning up cancellation token source");
                    _scanCancellationSource?.Dispose();
                    _scanCancellationSource = null;
                }
            }, token, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        }

        private async Task ScanLoudnessAsync(string rootFolder, CancellationToken cancellationToken, bool rescanAll = false)
        {
            Log($"ScanLoudnessAsync: Starting loudness scan for folder: {rootFolder}, RescanAll: {rescanAll}");
            // FFmpeg presence check: verify that ffmpeg is available
            var ffmpegPath = NativeBinaryHelper.GetFFmpegPath();
            if (string.IsNullOrEmpty(ffmpegPath))
            {
                Log("ScanLoudnessAsync: FFmpeg not found (bundled or system), aborting scan");
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = "Loudness scan unavailable: ffmpeg not found";
                });
                return;
            }
            Log($"ScanLoudnessAsync: Using FFmpeg: {ffmpegPath}");

            // Verify ffmpeg can be executed
            try
            {
                Log("ScanLoudnessAsync: Verifying FFmpeg can be executed...");
                var testStartInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    Arguments = "-version",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                using var testProcess = new System.Diagnostics.Process { StartInfo = testStartInfo };
                testProcess.Start();
                await testProcess.WaitForExitAsync(cancellationToken);
                if (testProcess.ExitCode != 0)
                {
                    Log($"ScanLoudnessAsync: FFmpeg test failed with exit code: {testProcess.ExitCode}");
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        StatusTextBlock.Text = "Loudness scan unavailable: ffmpeg not found";
                    });
                    return;
                }
                Log("ScanLoudnessAsync: FFmpeg verification successful");
            }
            catch (Exception ex)
            {
                Log($"ScanLoudnessAsync: ERROR verifying FFmpeg - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"ScanLoudnessAsync: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"ScanLoudnessAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = "Loudness scan unavailable: ffmpeg not found";
                });
                return;
            }

            // Get all video files in the folder tree
            string[] allFiles;
            try
            {
                Log($"ScanLoudnessAsync: Scanning directory tree for video files...");
                allFiles = Directory.GetFiles(rootFolder, "*.*", SearchOption.AllDirectories)
                    .Where(f => _videoExtensions.Contains(
                        Path.GetExtension(f).ToLowerInvariant()))
                    .ToArray();
                Log($"ScanLoudnessAsync: Found {allFiles.Length} video files in folder tree");
            }
            catch (Exception ex)
            {
                Log($"ScanLoudnessAsync: ERROR scanning folder - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"ScanLoudnessAsync: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"ScanLoudnessAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Error scanning folder: {ex.Message}";
                });
                return;
            }

            // Filter files based on scan mode
            string[] filesToScan;
            int alreadyScannedCount = 0;
            
            if (!rescanAll)
            {
                // Only scan files that don't have loudness data yet
                HashSet<string> filesWithLoudness = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (_libraryIndex != null)
                {
                    foreach (var item in _libraryIndex.Items)
                    {
                        if (item.HasAudio.HasValue || item.IntegratedLoudness.HasValue)
                        {
                            filesWithLoudness.Add(item.FullPath);
                        }
                    }
                }
                
                filesToScan = allFiles.Where(f => !filesWithLoudness.Contains(f)).ToArray();
                alreadyScannedCount = allFiles.Length - filesToScan.Length;
                Log($"ScanLoudnessAsync: Mode: Only New Files - {alreadyScannedCount} files already have loudness data, {filesToScan.Length} files need scanning");
            }
            else
            {
                // Rescan all files (update all loudness data with new filter)
                filesToScan = allFiles;
                Log($"ScanLoudnessAsync: Mode: Rescan All - Scanning all {filesToScan.Length} files with EBU R128");
            }

            int total = allFiles.Length;
            int processed = alreadyScannedCount;
            int noAudioCount = 0;
            int errorCount = 0;
            var processedLock = new object();

            // Update UI to show scan started
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                if (!rescanAll && alreadyScannedCount > 0)
                {
                    SetStatusMessage($"Scanning loudness… ({alreadyScannedCount} already scanned, {filesToScan.Length} to scan)");
                }
                else
                {
                    SetStatusMessage($"Scanning loudness… (0/{total} files processed)");
                }
            });

            // If all files are already scanned (and not rescanning), we're done
            if (!rescanAll && filesToScan.Length == 0)
            {
                Log($"ScanLoudnessAsync: All {total} files already have loudness data, skipping scan");
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    SetStatusMessage($"Ready ({total} files, all scanned)");
                });
                return;
            }

            // Initialize semaphore for concurrency control (max 4 concurrent ffmpeg processes)
            lock (_ffmpegSemaphoreLock)
            {
                if (_ffmpegSemaphore == null)
                {
                    _ffmpegSemaphore = new SemaphoreSlim(4, 4);
                    Log("ScanLoudnessAsync: Initialized FFmpeg semaphore with max concurrency: 4");
                }
            }

            Log($"ScanLoudnessAsync: Starting parallel processing of {filesToScan.Length} files");
            // Process only unscanned files with parallel async execution
            var scanTasks = filesToScan.Select(async file =>
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    Log($"ScanLoudnessAsync: Scan cancelled, stopping file processing");
                    return;
                }

                // CRITICAL: Check file existence first
                if (!File.Exists(file))
                {
                    Log($"ScanLoudnessAsync: File does not exist, skipping: {Path.GetFileName(file)}");
                    lock (processedLock)
                    {
                        processed++;
                    }
                    return;
                }

                bool semaphoreAcquired = false;
                try
                {
                    await _ffmpegSemaphore.WaitAsync(cancellationToken);
                    semaphoreAcquired = true;
                    Log($"ScanLoudnessAsync: Acquired semaphore for {Path.GetFileName(file)}");

                    // Wrap each ffmpeg invocation in try/catch
                    try
                    {
                        var startInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = ffmpegPath,
                            UseShellExecute = false,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            CreateNoWindow = true
                        };

                        // Use ArgumentList to safely handle paths with spaces and special characters
                        startInfo.ArgumentList.Add("-hide_banner");
                        startInfo.ArgumentList.Add("-nostats");
                        startInfo.ArgumentList.Add("-vn");
                        startInfo.ArgumentList.Add("-sn");
                        startInfo.ArgumentList.Add("-i");
                        startInfo.ArgumentList.Add(file);
                        startInfo.ArgumentList.Add("-filter:a");
                        startInfo.ArgumentList.Add("ebur128=framelog=verbose");
                        startInfo.ArgumentList.Add("-f");
                        startInfo.ArgumentList.Add("null");
                        startInfo.ArgumentList.Add("-");

                        using var process = new System.Diagnostics.Process { StartInfo = startInfo };
                        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

                        int exitCode = 0;
                        string output = "";
                        
                        var outputTask = Task.Run(async () =>
                        {
                            try
                            {
                                process.Start();
                                // Read stderr (ffmpeg outputs ebur128 info to stderr)
                                var stderrTask = process.StandardError.ReadToEndAsync(linkedCts.Token);
                                await process.WaitForExitAsync(linkedCts.Token);
                                var exitCodeLocal = process.ExitCode;
                                var outputLocal = await stderrTask;
                                return (outputLocal, exitCodeLocal);
                            }
                            catch
                            {
                                return ("", -1); // Indicate failure
                            }
                        }, linkedCts.Token);

                        var result = await outputTask;
                        output = result.Item1;
                        exitCode = result.Item2;

                        // Parse loudness from output (pass exit code for better detection)
                        var loudnessInfo = ParseLoudnessFromFFmpegOutput(output, exitCode);
                        string logResult;
                        if (loudnessInfo != null)
                        {
                            // Update library item directly
                            if (_libraryIndex != null)
                            {
                                var item = _libraryService.FindItemByPath(file);
                                if (item != null)
                                {
                                    bool itemUpdated = false;
                                    var oldHasAudio = item.HasAudio;
                                    var oldIntegratedLoudness = item.IntegratedLoudness;
                                    var oldPeakDb = item.PeakDb;
                                    
                                    if (item.HasAudio != loudnessInfo.HasAudio)
                                    {
                                        item.HasAudio = loudnessInfo.HasAudio;
                                        itemUpdated = true;
                                    }
                                    // Store MeanVolumeDb as IntegratedLoudness if audio is present
                                    if (loudnessInfo.HasAudio == true && loudnessInfo.MeanVolumeDb != 0.0)
                                    {
                                        if (!item.IntegratedLoudness.HasValue || 
                                            Math.Abs(item.IntegratedLoudness.Value - loudnessInfo.MeanVolumeDb) > 0.1)
                                        {
                                            item.IntegratedLoudness = loudnessInfo.MeanVolumeDb;
                                            itemUpdated = true;
                                        }
                                    }
                                    
                                    // Store PeakDb if available
                                    if (loudnessInfo.HasAudio == true && loudnessInfo.PeakDb != 0.0)
                                    {
                                        if (!item.PeakDb.HasValue || 
                                            Math.Abs(item.PeakDb.Value - loudnessInfo.PeakDb) > 0.1)
                                        {
                                            item.PeakDb = loudnessInfo.PeakDb;
                                            itemUpdated = true;
                                        }
                                    }
                                    else if (loudnessInfo.HasAudio == false)
                                    {
                                        // No audio - clear peak if set
                                        if (item.PeakDb.HasValue)
                                        {
                                            item.PeakDb = null;
                                            itemUpdated = true;
                                        }
                                    }
                                    
                                    if (itemUpdated)
                                    {
                                        _libraryService.UpdateItem(item);
                                        Log($"ScanLoudnessAsync: Updated loudness for {Path.GetFileName(file)} - HasAudio: {oldHasAudio} -> {loudnessInfo.HasAudio}, IntegratedLoudness: {oldIntegratedLoudness?.ToString("F1") ?? "null"} -> {loudnessInfo.MeanVolumeDb:F1} dB, PeakDb: {oldPeakDb?.ToString("F1") ?? "null"} -> {loudnessInfo.PeakDb:F1} dB");
                                        // Save library asynchronously
                                        _ = Task.Run(() =>
                                        {
                                            try
                                            {
                                                _libraryService.SaveLibrary();
                                            }
                                            catch (Exception ex)
                                            {
                                                Log($"ScanLoudnessAsync: ERROR saving library after loudness update - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                                Log($"ScanLoudnessAsync: ERROR - Stack trace: {ex.StackTrace}");
                                                if (ex.InnerException != null)
                                                {
                                                    Log($"ScanLoudnessAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                                                }
                                            }
                                        });
                                    }
                                }
                                else
                                {
                                    Log($"ScanLoudnessAsync: Library item not found for {Path.GetFileName(file)}, loudness data not saved");
                                }
                            }

                            // Track no-audio files separately from errors
                            if (loudnessInfo.HasAudio == false)
                            {
                                lock (processedLock)
                                {
                                    noAudioCount++;
                                }
                                logResult = "No Audio";
                                Log($"ScanLoudnessAsync: File has no audio: {Path.GetFileName(file)}");
                            }
                            else
                            {
                                logResult = "Success";
                                Log($"ScanLoudnessAsync: Successfully processed {Path.GetFileName(file)} - IntegratedLoudness: {loudnessInfo.MeanVolumeDb:F1} dB, PeakDb: {loudnessInfo.PeakDb:F1} dB");
                            }
                        }
                        else
                        {
                            // Parse failed - genuine error (file couldn't be processed)
                            lock (processedLock)
                            {
                                errorCount++;
                            }
                            logResult = "Error";
                            Log($"ScanLoudnessAsync: Failed to parse loudness for {Path.GetFileName(file)} (exit code: {exitCode})");
                        }

                        // Log the FFmpeg execution
                        lock (_ffmpegLogsLock)
                        {
                            _ffmpegLogs.Add(new FFmpegLogEntry
                            {
                                Timestamp = DateTime.Now,
                                FilePath = file,
                                ExitCode = exitCode,
                                Output = output,
                                Result = logResult
                            });
                            // Keep only last 1000 entries to prevent memory issues
                            if (_ffmpegLogs.Count > 1000)
                            {
                                _ffmpegLogs.RemoveAt(0);
                            }
                        }
                        
                        // Update log window if it's open (non-blocking)
                        if (_ffmpegLogWindow is FFmpegLogWindow logWindow && logWindow.IsVisible)
                        {
                            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                            {
                                logWindow.UpdateLogDisplay();
                            }, Avalonia.Threading.DispatcherPriority.Background);
                        }
                    }
                    catch
                    {
                        // Individual file failure - increment error counter but continue
                        lock (processedLock)
                        {
                            errorCount++;
                        }
                    }
                }
                finally
                {
                    if (semaphoreAcquired)
                    {
                        _ffmpegSemaphore.Release();
                        Log($"ScanLoudnessAsync: Released semaphore for {Path.GetFileName(file)}");
                    }
                }

                int newProcessed;
                int currentNoAudio;
                int currentErrors;
                lock (processedLock)
                {
                    processed++;
                    newProcessed = processed;
                    currentNoAudio = noAudioCount;
                    currentErrors = errorCount;
                }

                // Update UI progress with throttling (every file, but max once per 100ms)
                bool shouldUpdate = false;
                lock (_loudnessStatusUpdateLock)
                {
                    var now = DateTime.UtcNow;
                    if ((now - _lastLoudnessStatusUpdate).TotalMilliseconds >= 1000 || newProcessed == total)
                    {
                        _lastLoudnessStatusUpdate = now;
                        shouldUpdate = true;
                    }
                }

                if (shouldUpdate)
                {
                    // Save library periodically during scan
                    if (_libraryIndex != null)
                    {
                        _ = Task.Run(() =>
                        {
                            try
                            {
                                _libraryService.SaveLibrary();
                            }
                            catch (Exception ex)
                            {
                                Log($"ScanLoudnessAsync: ERROR saving library during scan - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                Log($"ScanLoudnessAsync: ERROR - Stack trace: {ex.StackTrace}");
                                if (ex.InnerException != null)
                                {
                                    Log($"ScanLoudnessAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                                }
                            }
                        });
                    }
                    
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        var noAudioText = currentNoAudio > 0 ? $", {currentNoAudio} without audio" : "";
                        var errorText = currentErrors > 0 ? $", {currentErrors} errors" : "";
                        SetStatusMessage($"Scanning loudness… ({newProcessed}/{total} files processed{noAudioText}{errorText})");
                    });
                }
            });

            // Wait for all scan tasks to complete
            Log("ScanLoudnessAsync: Waiting for all scan tasks to complete...");
            await Task.WhenAll(scanTasks);
            Log($"ScanLoudnessAsync: All scan tasks completed. Processed {processed}/{total} files, {noAudioCount} without audio, {errorCount} errors");

            // Final save library and update UI
            if (_libraryIndex != null)
            {
                Log("ScanLoudnessAsync: Performing final library save...");
                _ = Task.Run(() =>
                {
                    try
                    {
                        _libraryService.SaveLibrary();
                        Log("ScanLoudnessAsync: Final library save completed successfully");
                    }
                    catch (Exception ex)
                    {
                        Log($"ScanLoudnessAsync: ERROR saving library after loudness scan - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"ScanLoudnessAsync: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"ScanLoudnessAsync: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                        }
                    }
                });
            }
            Log("ScanLoudnessAsync: Recalculating global stats");
            RecalculateGlobalStats(); // Recalculate stats after scan completes
            
            // Reset cached baseline so next normalization recalculates with new data
            _cachedBaselineLoudnessDb = null;
            Log("ScanLoudnessAsync: Reset cached baseline loudness - will recalculate on next use");
            
            // Reset warning flag so it can be shown again if needed for newly added files
            _hasShownMissingLoudnessWarning = false;
            Log("ScanLoudnessAsync: Reset missing loudness warning flag");
            
            Log("ScanLoudnessAsync: Updating UI");
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                var noAudioText = noAudioCount > 0 ? $", {noAudioCount} without audio" : "";
                var errorText = errorCount > 0 ? $", {errorCount} errors" : "";
                // Always show scan completion message
                SetStatusMessage($"Loudness scan complete ({total} files{noAudioText}{errorText})");
            });
            Log("ScanLoudnessAsync: Loudness scan complete");
        }

        private FileLoudnessInfo? ParseLoudnessFromFFmpegOutput(string output, int exitCode = 0)
        {
            // Parse loudness from ffmpeg stderr output
            // Supports both new ebur128 format and legacy volumedetect format for backward compatibility
            
            double? integratedLoudness = null;
            double? peakDb = null;
            bool hasAudio = false;

            var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            
            // Try to parse ebur128 format first (new, more accurate)
            foreach (var line in lines)
            {
                // Look for integrated loudness: "I:         -23.0 LUFS"
                if (line.Contains("I:") && line.Contains("LUFS"))
                {
                    var parts = line.Split(new[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 2)
                    {
                        var valueStr = parts[1].Replace("LUFS", "").Trim();
                        if (double.TryParse(valueStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var loudness))
                        {
                            integratedLoudness = loudness;
                            hasAudio = true;
                            Log($"ParseLoudnessFromFFmpegOutput: Parsed EBU R128 integrated loudness: {loudness:F2} LUFS");
                        }
                    }
                }
                
                // Look for true peak: "Peak:       -5.2 dBFS" or "True peak:    -5.2 dBFS"
                if ((line.Contains("Peak:") || line.Contains("True peak:")) && line.Contains("dBFS"))
                {
                    var parts = line.Split(new[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 2)
                    {
                        var valueStr = parts[1].Replace("dBFS", "").Trim();
                        if (double.TryParse(valueStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var peak))
                        {
                            peakDb = peak;
                            Log($"ParseLoudnessFromFFmpegOutput: Parsed EBU R128 true peak: {peak:F2} dBFS");
                        }
                    }
                }
            }
            
            // If ebur128 parsing found data, use it
            if (integratedLoudness.HasValue)
            {
                Log($"ParseLoudnessFromFFmpegOutput: Using EBU R128 data - Integrated: {integratedLoudness:F2} LUFS, Peak: {peakDb?.ToString("F2") ?? "N/A"} dBFS");
                return new FileLoudnessInfo
                {
                    HasAudio = true,
                    MeanVolumeDb = integratedLoudness.Value,
                    PeakDb = peakDb ?? -5.0 // Default peak if not found
                };
            }
            
            // Fall back to legacy volumedetect format for backward compatibility
            Log("ParseLoudnessFromFFmpegOutput: EBU R128 data not found, trying legacy volumedetect format");
            
            double? meanVolumeDb = null;
            
            foreach (var line in lines)
            {
                // Look for mean_volume
                var meanIndex = line.IndexOf("mean_volume:", StringComparison.OrdinalIgnoreCase);
                if (meanIndex >= 0)
                {
                    var dbIndex = line.IndexOf("dB", meanIndex, StringComparison.OrdinalIgnoreCase);
                    if (dbIndex > meanIndex)
                    {
                        var valueStr = line.Substring(meanIndex + "mean_volume:".Length, dbIndex - meanIndex - "mean_volume:".Length).Trim();
                        if (double.TryParse(valueStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var meanValue))
                        {
                            meanVolumeDb = meanValue;
                            hasAudio = true;
                        }
                    }
                }

                // Look for max_volume
                var maxIndex = line.IndexOf("max_volume:", StringComparison.OrdinalIgnoreCase);
                if (maxIndex >= 0)
                {
                    var dbIndex = line.IndexOf("dB", maxIndex, StringComparison.OrdinalIgnoreCase);
                    if (dbIndex > maxIndex)
                    {
                        var valueStr = line.Substring(maxIndex + "max_volume:".Length, dbIndex - maxIndex - "max_volume:".Length).Trim();
                        if (double.TryParse(valueStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var maxValue))
                        {
                            peakDb = maxValue;
                        }
                    }
                }
            }

            if (meanVolumeDb.HasValue)
            {
                Log($"ParseLoudnessFromFFmpegOutput: Using legacy volumedetect data - Mean: {meanVolumeDb:F2} dB, Peak: {peakDb?.ToString("F2") ?? "N/A"} dB");
                // Check for -91.0 dB placeholder (no real audio)
                // Mean of -91.0 indicates no audio regardless of whether peak data is available
                if (Math.Abs(meanVolumeDb.Value - (-91.0)) < 0.1 && (!peakDb.HasValue || Math.Abs(peakDb.Value - (-91.0)) < 0.1))
                {
                    Log("ParseLoudnessFromFFmpegOutput: Detected -91.0 dB placeholder - no audio");
                    return new FileLoudnessInfo
                    {
                        MeanVolumeDb = 0.0,
                        PeakDb = 0.0,
                        HasAudio = false
                    };
                }
                
                return new FileLoudnessInfo
                {
                    HasAudio = hasAudio,
                    MeanVolumeDb = meanVolumeDb.Value,
                    PeakDb = peakDb ?? -5.0
                };
            }

            // Check if file was opened successfully
            // With -vn flag, we should still see "Input #0" if the file opened
            bool fileOpenedSuccessfully = output.Contains("Input #0", StringComparison.OrdinalIgnoreCase);
            
            // Check if file has video stream but no audio stream
            // This is the key indicator: we see "Stream #0:" for video but no "Stream #0:" for audio
            bool hasVideoStream = output.Contains("Stream #0:") && output.Contains("Video:", StringComparison.OrdinalIgnoreCase);
            bool hasAudioStream = output.Contains("Stream #0:") && output.Contains("Audio:", StringComparison.OrdinalIgnoreCase);
            
            // Check for "no audio stream" messages - comprehensive detection patterns
            // Common ffmpeg messages when no audio stream exists:
            bool hasExplicitNoAudioMessage = 
                output.Contains("does not contain any audio stream", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("matches no streams", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("no audio stream", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("Stream map '0:a' matches no streams", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("no audio streams found", StringComparison.OrdinalIgnoreCase) ||
                (output.Contains("Could not find codec parameters", StringComparison.OrdinalIgnoreCase) && 
                 output.Contains("audio", StringComparison.OrdinalIgnoreCase));

            // Check for the specific error pattern when -vn is used on a file with no audio:
            // "Output file does not contain any stream" - this happens because there's nothing to output
            // when we suppress video (-vn) and there's no audio to process
            bool hasNoStreamOutputError = output.Contains("Output file does not contain any stream", StringComparison.OrdinalIgnoreCase) ||
                                         (output.Contains("Error opening output file", StringComparison.OrdinalIgnoreCase) && 
                                          output.Contains("Invalid argument", StringComparison.OrdinalIgnoreCase));

            // Check for fatal errors that indicate the file couldn't be processed at all
            // These are errors that mean we couldn't even open/read the file
            // BUT exclude the "no stream" error which is expected for no-audio files with -vn
            bool hasFatalError = 
                (!fileOpenedSuccessfully && output.Length > 0 && exitCode != 0) ||
                output.Contains("Invalid data found", StringComparison.OrdinalIgnoreCase) ||
                (output.Contains("Error opening", StringComparison.OrdinalIgnoreCase) && 
                 !hasNoStreamOutputError && 
                 !output.Contains("output file", StringComparison.OrdinalIgnoreCase)) ||
                output.Contains("Permission denied", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("No such file", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("cannot open", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("does not exist", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("No space left", StringComparison.OrdinalIgnoreCase);

            // Determine if this is a no-audio file (not an error)
            // Key indicators:
            // 1. File opened successfully (Input #0 appears)
            // 2. Has video stream but NO audio stream
            // 3. Exit code might be -22 (EINVAL) or other non-zero when no audio to process
            // 4. Specific error about "Output file does not contain any stream" (expected with -vn and no audio)
            // 5. No loudness data found
            if (hasExplicitNoAudioMessage || 
                (fileOpenedSuccessfully && hasVideoStream && !hasAudioStream && !meanVolumeDb.HasValue && !peakDb.HasValue) ||
                (fileOpenedSuccessfully && hasNoStreamOutputError && !hasFatalError))
            {
                // This is a no-audio file, not an error
                return new FileLoudnessInfo
                {
                    MeanVolumeDb = 0.0,
                    PeakDb = 0.0,
                    HasAudio = false
                };
            }

            // Otherwise, parsing failed and no clear "no audio" message - this is a genuine error
            return null;
        }

        private long? ParseDurationFilter(object? selectedItem)
        {
            if (selectedItem is ComboBoxItem item)
            {
                var content = item.Content?.ToString();
                return ParseDurationFilterString(content);
            }
            else if (selectedItem is string str)
            {
                return ParseDurationFilterString(str);
            }
            return null;
        }

        private long? ParseDurationFilterString(string? value)
        {
            if (string.IsNullOrEmpty(value))
                return null;

            return value switch
            {
                "No Minimum" or "No Maximum" => null,
                "5s" => 5,
                "10s" => 10,
                "30s" => 30,
                "1m" => 60,
                "2m" => 120,
                "5m" => 300,
                "10m" => 600,
                "15m" => 900,
                "30m" => 1800,
                _ => null
            };
        }

        #endregion

        /// <summary>
        /// One-time migration: Syncs legacy data (history, playbackStats, loudnessStats) to library items.
        /// </summary>
        private void MigrateLegacyDataToLibrary()
        {
            Log("MigrateLegacyDataToLibrary: Starting legacy data migration");
            if (_libraryIndex == null || _libraryIndex.Items.Count == 0)
            {
                Log("MigrateLegacyDataToLibrary: Library index is null or empty, skipping migration");
                return;
            }

            Log($"MigrateLegacyDataToLibrary: Library has {_libraryIndex.Items.Count} items to check");
            bool libraryNeedsSaving = false;
            int itemsUpdated = 0;

            // Load and migrate playback stats
            try
            {
                var playbackStatsPath = AppDataManager.GetPlaybackStatsPath();
                Log($"MigrateLegacyDataToLibrary: Checking playback stats at {playbackStatsPath}");
                if (File.Exists(playbackStatsPath))
                {
                    Log("MigrateLegacyDataToLibrary: Loading playback stats file...");
                    var json = File.ReadAllText(playbackStatsPath);
                    var playbackStats = JsonSerializer.Deserialize<Dictionary<string, FilePlaybackStats>>(json) ?? new();
                    Log($"MigrateLegacyDataToLibrary: Loaded {playbackStats.Count} playback stat entries");
                    
                    foreach (var kvp in playbackStats)
                    {
                        var item = _libraryService.FindItemByPath(kvp.Key);
                        if (item != null)
                        {
                            bool updated = false;
                            if (item.PlayCount < kvp.Value.PlayCount)
                            {
                                item.PlayCount = kvp.Value.PlayCount;
                                updated = true;
                            }
                            if (kvp.Value.LastPlayedUtc.HasValue && 
                                (!item.LastPlayedUtc.HasValue || item.LastPlayedUtc < kvp.Value.LastPlayedUtc))
                            {
                                item.LastPlayedUtc = kvp.Value.LastPlayedUtc;
                                updated = true;
                            }
                            if (updated)
                            {
                                _libraryService.UpdateItem(item);
                                libraryNeedsSaving = true;
                                itemsUpdated++;
                            }
                        }
                    }
                    Log($"MigrateLegacyDataToLibrary: Migrated playback stats to {itemsUpdated} items");
                }
                else
                {
                    Log("MigrateLegacyDataToLibrary: Playback stats file not found, skipping");
                }
            }
            catch (Exception ex)
            {
                Log($"MigrateLegacyDataToLibrary: ERROR migrating playback stats - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"MigrateLegacyDataToLibrary: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"MigrateLegacyDataToLibrary: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
            }

            // Load and migrate loudness stats
            int loudnessItemsUpdated = 0;
            try
            {
                var loudnessStatsPath = AppDataManager.GetLoudnessStatsPath();
                Log($"MigrateLegacyDataToLibrary: Checking loudness stats at {loudnessStatsPath}");
                if (File.Exists(loudnessStatsPath))
                {
                    Log("MigrateLegacyDataToLibrary: Loading loudness stats file...");
                    var json = File.ReadAllText(loudnessStatsPath);
                    var loudnessStats = JsonSerializer.Deserialize<Dictionary<string, FileLoudnessInfo>>(json) ?? new();
                    Log($"MigrateLegacyDataToLibrary: Loaded {loudnessStats.Count} loudness stat entries");
                    
                    foreach (var kvp in loudnessStats)
                    {
                        var item = _libraryService.FindItemByPath(kvp.Key);
                        if (item != null)
                        {
                            bool updated = false;
                            var info = kvp.Value;
                            
                            // Fix -91.0 dB placeholder values (these indicate no audio)
                            if (Math.Abs(info.MeanVolumeDb - (-91.0)) < 0.1 && Math.Abs(info.PeakDb - (-91.0)) < 0.1)
                            {
                                info.MeanVolumeDb = 0.0;
                                info.PeakDb = 0.0;
                                info.HasAudio = false;
                            }
                            // Infer HasAudio if missing
                            else if (!info.HasAudio.HasValue)
                            {
                                if (info.MeanVolumeDb != 0.0 || info.PeakDb != 0.0)
                                {
                                    info.HasAudio = true;
                                }
                            }
                            
                            if (item.HasAudio != info.HasAudio)
                            {
                                item.HasAudio = info.HasAudio;
                                updated = true;
                            }
                            
                            // Store MeanVolumeDb as IntegratedLoudness if audio is present
                            if (info.HasAudio == true && info.MeanVolumeDb != 0.0)
                            {
                                if (!item.IntegratedLoudness.HasValue || 
                                    Math.Abs(item.IntegratedLoudness.Value - info.MeanVolumeDb) > 0.1)
                                {
                                    item.IntegratedLoudness = info.MeanVolumeDb;
                                    updated = true;
                                }
                            }
                            
                            // Store PeakDb if available
                            if (info.HasAudio == true && info.PeakDb != 0.0)
                            {
                                if (!item.PeakDb.HasValue || 
                                    Math.Abs(item.PeakDb.Value - info.PeakDb) > 0.1)
                                {
                                    item.PeakDb = info.PeakDb;
                                    updated = true;
                                }
                            }
                            else if (info.HasAudio == false)
                            {
                                // No audio - clear peak if set
                                if (item.PeakDb.HasValue)
                                {
                                    item.PeakDb = null;
                                    updated = true;
                                }
                            }
                            
                            if (updated)
                            {
                                _libraryService.UpdateItem(item);
                                libraryNeedsSaving = true;
                                itemsUpdated++;
                                loudnessItemsUpdated++;
                            }
                        }
                    }
                    Log($"MigrateLegacyDataToLibrary: Migrated loudness stats to {loudnessItemsUpdated} items");
                }
                else
                {
                    Log("MigrateLegacyDataToLibrary: Loudness stats file not found, skipping");
                }
            }
            catch (Exception ex)
            {
                Log($"MigrateLegacyDataToLibrary: ERROR migrating loudness stats - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"MigrateLegacyDataToLibrary: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"MigrateLegacyDataToLibrary: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
            }

            // Load and migrate history (convert to LastPlayedUtc)
            int historyItemsUpdated = 0;
            try
            {
                var historyPath = AppDataManager.GetHistoryPath();
                Log($"MigrateLegacyDataToLibrary: Checking history at {historyPath}");
                if (File.Exists(historyPath))
                {
                    Log("MigrateLegacyDataToLibrary: Loading history file...");
                    var json = File.ReadAllText(historyPath);
                    var history = JsonSerializer.Deserialize<List<HistoryEntry>>(json) ?? new();
                    Log($"MigrateLegacyDataToLibrary: Loaded {history.Count} history entries");
                    
                    foreach (var entry in history)
                    {
                        var item = _libraryService.FindItemByPath(entry.Path);
                        if (item != null)
                        {
                            bool updated = false;
                            // Update LastPlayedUtc if history entry is newer
                            var historyTime = entry.PlayedAt.ToUniversalTime();
                            if (!item.LastPlayedUtc.HasValue || item.LastPlayedUtc < historyTime)
                            {
                                item.LastPlayedUtc = historyTime;
                                updated = true;
                            }
                            // Ensure PlayCount is at least 1 if it was in history
                            if (item.PlayCount == 0)
                            {
                                item.PlayCount = 1;
                                updated = true;
                            }
                            if (updated)
                            {
                                _libraryService.UpdateItem(item);
                                libraryNeedsSaving = true;
                                itemsUpdated++;
                                historyItemsUpdated++;
                            }
                        }
                    }
                    Log($"MigrateLegacyDataToLibrary: Migrated history to {historyItemsUpdated} items");
                }
                else
                {
                    Log("MigrateLegacyDataToLibrary: History file not found, skipping");
                }
            }
            catch (Exception ex)
            {
                Log($"MigrateLegacyDataToLibrary: ERROR migrating history - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"MigrateLegacyDataToLibrary: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"MigrateLegacyDataToLibrary: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
            }

            // Save library if any changes were made
            if (libraryNeedsSaving)
            {
                Log($"MigrateLegacyDataToLibrary: Saving library after migrating {itemsUpdated} items (playback stats, loudness stats, history)");
                _ = Task.Run(() =>
                {
                    try
                    {
                        _libraryService.SaveLibrary();
                        Log($"MigrateLegacyDataToLibrary: Successfully saved library with migrated data");
                    }
                    catch (Exception ex)
                    {
                        Log($"MigrateLegacyDataToLibrary: ERROR saving library after migration - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"MigrateLegacyDataToLibrary: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"MigrateLegacyDataToLibrary: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                        }
                    }
                });
            }
            else
            {
                Log("MigrateLegacyDataToLibrary: No items needed updating, skipping save");
            }
            Log("MigrateLegacyDataToLibrary: Migration complete");
        }

        #region Library Panel

        private static string GetLogPath()
        {
            return Path.Combine(AppDataManager.AppDataDirectory, "last.log");
        }

        private static void Log(string message)
        {
            try
            {
                var logPath = GetLogPath();
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}\n");
            }
            catch { }
        }

        private static void ClearLog()
        {
            try
            {
                var logPath = GetLogPath();
                if (File.Exists(logPath))
                {
                    File.Delete(logPath);
                }
            }
            catch { }
        }

        private void InitializeLibraryPanel()
        {
            try
            {
                _isInitializingLibraryPanel = true; // Suppress event handlers during initialization
                Log("InitializeLibraryPanel: Starting");
                Log("  Setting up LibraryListBox...");
                // Set up Library panel collections and initial state
                if (LibraryListBox != null)
                {
                    LibraryListBox.ItemsSource = _libraryItems;
                    Log($"InitializeLibraryPanel: LibraryListBox.ItemsSource set, collection has {_libraryItems.Count} items");
                }
                else
                {
                    Log("InitializeLibraryPanel: WARNING - LibraryListBox is null!");
                }
                
                // Initialize source combo box
                Log("  Updating source combo box...");
                UpdateLibrarySourceComboBox();
                
                // Set default view preset
                Log("  Setting default view preset...");
                if (LibraryViewPresetComboBox != null && LibraryViewPresetComboBox.Items.Count > 0)
                {
                    // Explicitly set the preset value before setting SelectedIndex
                    if (LibraryViewPresetComboBox.Items[0] is ComboBoxItem firstItem && firstItem.Tag is string presetTag)
                    {
                        _currentViewPreset = presetTag;
                        Log($"  Set _currentViewPreset to: {_currentViewPreset}");
                    }
                    LibraryViewPresetComboBox.SelectedIndex = 0; // "All videos"
                    Log("  View preset set to index 0.");
                }
                else
                {
                    Log($"  WARNING: LibraryViewPresetComboBox is null or empty (null: {LibraryViewPresetComboBox == null}, count: {LibraryViewPresetComboBox?.Items.Count ?? -1})");
                }
                
                // Set default sort
                Log("  Setting default sort...");
                if (LibrarySortComboBox != null && LibrarySortComboBox.Items.Count > 0)
                {
                    LibrarySortComboBox.SelectedIndex = 0; // "Name (A-Z)"
                    Log("  Sort set to index 0.");
                }
                else
                {
                    Log($"  WARNING: LibrarySortComboBox is null or empty (null: {LibrarySortComboBox == null}, count: {LibrarySortComboBox?.Items.Count ?? -1})");
                }
                
                // Initialize preset combo box
                Log("  Updating preset combo box...");
                UpdateLibraryPresetComboBox();
                
                // Update the panel (only if library is loaded)
                Log($"  Checking library index (null: {_libraryIndex == null})...");
                if (_libraryIndex != null)
                {
                    Log($"  Library index has {_libraryIndex.Items.Count} items, {_libraryIndex.Sources.Count} sources");
                    Log("  Updating Library panel...");
                    UpdateLibraryPanel();
                    Log("  Library panel update initiated.");
                    
                    // Update library info text
                    UpdateLibraryInfoText();
                    UpdateFilterSummaryText();
                    
                    // Show startup message
                    if (_libraryIndex.Items.Count > 0)
                    {
                        StatusTextBlock.Text = "Ready: Library loaded.";
                        Log("InitializeLibraryPanel: Library loaded, showing startup message");
                    }
                    else
                    {
                        StatusTextBlock.Text = "Import a folder to get started (Library → Import Folder).";
                        Log("InitializeLibraryPanel: Library is empty, showing import message");
                    }
                }
                else
                {
                    Log("  WARNING: _libraryIndex is null, skipping UpdateLibraryPanel()");
                    LibraryInfoText = "Library • 🎞️ 0 videos • 📷 0 photos";
                    UpdateFilterSummaryText();
                    StatusTextBlock.Text = "Ready: No library loaded.";
                }
                
                _isInitializingLibraryPanel = false; // Re-enable event handlers after initialization
            }
            catch (Exception ex)
            {
                _isInitializingLibraryPanel = false; // Make sure flag is reset even on error
                var errorMsg = $"EXCEPTION in InitializeLibraryPanel: {ex.GetType().Name}\n" +
                              $"Message: {ex.Message}\n" +
                              $"Stack Trace:\n{ex.StackTrace}";
                if (ex.InnerException != null)
                {
                    errorMsg += $"\nInner Exception: {ex.InnerException.Message}\n" +
                               $"Inner Stack Trace:\n{ex.InnerException.StackTrace}";
                }
                Log(errorMsg);
                throw;
            }
        }

        private void UpdateLibrarySourceComboBox()
        {
            try
            {
                if (LibrarySourceComboBox == null)
                {
                    Log("    WARNING: LibrarySourceComboBox is null in UpdateLibrarySourceComboBox");
                    return;
                }
                if (_libraryIndex == null)
                {
                    Log("    WARNING: _libraryIndex is null in UpdateLibrarySourceComboBox");
                    return;
                }

                Log($"    Clearing source combo box (current items: {LibrarySourceComboBox.Items.Count})...");
                LibrarySourceComboBox.Items.Clear();
                
                // Add "All sources" option
                var allSourcesItem = new ComboBoxItem { Content = "All sources", Tag = (string?)null };
                LibrarySourceComboBox.Items.Add(allSourcesItem);
                Log("    Added 'All sources' option.");
                
                // Add each source with checkbox for enable/disable
                Log($"    Adding {_libraryIndex.Sources.Count} sources...");
                foreach (var source in _libraryIndex.Sources)
                {
                    var displayName = !string.IsNullOrEmpty(source.DisplayName) 
                        ? source.DisplayName 
                        : System.IO.Path.GetFileName(source.RootPath);
                    
                    // Get item count for this source
                    var itemCount = _libraryIndex.Items.Count(i => i.SourceId == source.Id);
                    
                    // Create a StackPanel with CheckBox and text
                    var checkBox = new CheckBox
                    {
                        IsChecked = source.IsEnabled,
                        Margin = new Thickness(0, 0, 8, 0),
                        VerticalAlignment = VerticalAlignment.Center,
                        Tag = source.Id
                    };
                    
                    // Handle checkbox changes
                    checkBox.Click += SourceEnableCheckBox_Click;
                    
                    var textBlock = new TextBlock
                    {
                        Text = $"{displayName} ({itemCount} videos)",
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    
                    var panel = new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        Children = { checkBox, textBlock }
                    };
                    
                    var item = new ComboBoxItem 
                    { 
                        Content = panel, 
                        Tag = source.Id 
                    };
                    LibrarySourceComboBox.Items.Add(item);
                }
                
                // Select "All sources" by default (only if we have items)
                if (LibrarySourceComboBox.Items.Count > 0)
                {
                    Log($"    Setting SelectedIndex to 0 (total items: {LibrarySourceComboBox.Items.Count})...");
                    LibrarySourceComboBox.SelectedIndex = 0;
                    Log("    SelectedIndex set successfully.");
                }
                else
                {
                    Log("    WARNING: No items in source combo box, cannot set SelectedIndex");
                }
            }
            catch (Exception ex)
            {
                var errorMsg = $"EXCEPTION in UpdateLibrarySourceComboBox: {ex.GetType().Name}\n" +
                              $"Message: {ex.Message}\n" +
                              $"Stack Trace:\n{ex.StackTrace}";
                Log(errorMsg);
                throw;
            }
        }

        private void SourceEnableCheckBox_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is CheckBox checkBox && checkBox.Tag is string sourceId)
            {
                Log($"SourceEnableCheckBox_Click: Source {sourceId} toggled to {checkBox.IsChecked}");
                
                var source = _libraryIndex?.Sources.FirstOrDefault(s => s.Id == sourceId);
                if (source != null)
                {
                    source.IsEnabled = checkBox.IsChecked ?? true;
                    _libraryService.UpdateSource(source);
                    
                    // Save library asynchronously
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            _libraryService.SaveLibrary();
                            Log($"SourceEnableCheckBox_Click: Library saved successfully");
                        }
                        catch (Exception ex)
                        {
                            Log($"SourceEnableCheckBox_Click: ERROR saving library - {ex.Message}");
                        }
                    });
                    
                    // Update Library panel if visible
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    
                    // Rebuild queue to respect source enable/disable changes
                    RebuildPlayQueueIfNeeded();
                    
                    // Update library info
                    UpdateLibraryInfoText();
                }
            }
            
            // Prevent the ComboBox from closing when clicking the checkbox
            e.Handled = true;
        }

        private void UpdateLibraryPanel()
        {
            // Cancel any in-flight update (but don't dispose yet - let the timer handler do it)
            lock (_updateLibraryPanelLock)
            {
                if (_updateLibraryPanelCancellationSource != null)
                {
                    _updateLibraryPanelCancellationSource.Cancel();
                }
            }

            // Stop and reset debounce timer
            if (_updateLibraryPanelDebounceTimer != null)
            {
                _updateLibraryPanelDebounceTimer.Stop();
            }
            else
            {
                _updateLibraryPanelDebounceTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromMilliseconds(300) // 300ms debounce
                };
                _updateLibraryPanelDebounceTimer.Tick += async (s, e) =>
                {
                    _updateLibraryPanelDebounceTimer.Stop();
                    
                    // Cancel any in-flight update before starting new one
                    lock (_updateLibraryPanelLock)
                    {
                        if (_updateLibraryPanelCancellationSource != null)
                        {
                            Log("UpdateLibraryPanel: Cancelling previous update to start new one");
                            _updateLibraryPanelCancellationSource.Cancel();
                            _updateLibraryPanelCancellationSource.Dispose();
                        }
                        
                        // Create cancellation token for this update
                        _updateLibraryPanelCancellationSource = new CancellationTokenSource();
                    }
                    
                    var cancellationToken = _updateLibraryPanelCancellationSource.Token;
                    
                    try
                    {
                        await UpdateLibraryPanelInternal(cancellationToken);
                    }
                    finally
                    {
                        lock (_updateLibraryPanelLock)
                        {
                            // Only dispose if this is still the current token (wasn't replaced by a newer update)
                            if (_updateLibraryPanelCancellationSource != null && _updateLibraryPanelCancellationSource.Token == cancellationToken)
                            {
                                _updateLibraryPanelCancellationSource.Dispose();
                                _updateLibraryPanelCancellationSource = null;
                            }
                        }
                    }
                };
            }

            // Start/restart debounce timer
            _updateLibraryPanelDebounceTimer.Start();
        }

        private async Task UpdateLibraryPanelInternal(CancellationToken cancellationToken)
        {
            try
            {
                Log("UpdateLibraryPanel: Starting");
                if (_libraryIndex == null)
                {
                    Log("UpdateLibraryPanel: _libraryIndex is null, returning.");
                    return;
                }

                // Capture UI control values on UI thread before entering background thread
                bool respectFilters = LibraryRespectFiltersToggle?.IsChecked == true;
                
                Log($"UpdateLibraryPanel: Processing {_libraryIndex.Items.Count} items, view preset: {_currentViewPreset ?? "null"}, source: {_selectedSourceId ?? "null"}, search: '{_librarySearchText}', respect filters: {respectFilters}");
                // Run filtering and sorting on background thread
                await Task.Run(() =>
                {
                    try
                    {
                        Log("UpdateLibraryPanel: Task.Run started.");
                        var items = _libraryIndex.Items.ToList();
                        Log($"UpdateLibraryPanel: Got {items.Count} items from library.");

                        // Filter out items from disabled sources
                        var enabledSourceIds = _libraryIndex.Sources
                            .Where(s => s.IsEnabled)
                            .Select(s => s.Id)
                            .ToHashSet();
                        items = items.Where(item => enabledSourceIds.Contains(item.SourceId)).ToList();
                        Log($"UpdateLibraryPanel: After disabled source filter: {items.Count} items.");

                        // Apply view preset filters
                        items = ApplyViewPresetFilter(items);
                        Log($"UpdateLibraryPanel: After view preset filter: {items.Count} items.");

                        // Apply source filter
                        if (_selectedSourceId != null)
                        {
                            items = items.Where(item => item.SourceId == _selectedSourceId).ToList();
                            Log($"UpdateLibraryPanel: After source filter: {items.Count} items.");
                        }

                        // Apply search filter
                        if (!string.IsNullOrWhiteSpace(_librarySearchText))
                        {
                            var searchLower = _librarySearchText.ToLowerInvariant();
                            items = items.Where(item =>
                                item.FileName.ToLowerInvariant().Contains(searchLower) ||
                                item.RelativePath.ToLowerInvariant().Contains(searchLower)
                            ).ToList();
                            Log($"UpdateLibraryPanel: After search filter: {items.Count} items.");
                        }

                        // Apply FilterState if "Respect filters" is enabled
                        // But only if we're not in a special view preset that should show everything
                        bool shouldApplyFilterState = respectFilters 
                            && _currentFilterState != null
                            && _currentViewPreset != "Blacklisted"; // Blacklisted view should show all blacklisted items regardless of filter
                        
                        if (shouldApplyFilterState && _currentFilterState != null)
                        {
                            Log("UpdateLibraryPanel: Applying FilterState...");
                            // Use BuildEligibleSetWithoutFileCheck for performance - file existence will be checked when video is played
                            var eligibleItems = _filterService.BuildEligibleSetWithoutFileCheck(_currentFilterState, _libraryIndex).ToList();
                            Log($"UpdateLibraryPanel: FilterService returned {eligibleItems.Count} eligible items.");
                            items = items.Where(item => eligibleItems.Any(eligible => eligible.FullPath == item.FullPath)).ToList();
                            Log($"UpdateLibraryPanel: After FilterState: {items.Count} items.");
                        }
                        else
                        {
                            Log("UpdateLibraryPanel: Skipping FilterState (Respect filters off, or no filter state, or special view preset)");
                        }

                        // Apply sorting
                        items = ApplySort(items);
                        Log($"UpdateLibraryPanel: After sorting: {items.Count} items. Final count ready for UI.");

                        // Update UI on UI thread
                        Log("UpdateLibraryPanel: Posting to UI thread...");
                        Dispatcher.UIThread.Post(() =>
                        {
                            try
                            {
                                Log($"UpdateLibraryPanel: UI thread callback started, about to add {items.Count} items");
                                
                                // Save scroll position anchor before clearing (first visible item)
                                if (LibraryListBox != null && _libraryItems.Count > 0)
                                {
                                    int anchorIndex = -1;
                                    string? strategy = null;
                                    
                                    // Strategy 1: Use SelectedIndex if something is selected (fastest, most reliable when available)
                                    if (LibraryListBox.SelectedIndex >= 0 && LibraryListBox.SelectedIndex < _libraryItems.Count)
                                    {
                                        anchorIndex = LibraryListBox.SelectedIndex;
                                        strategy = "SelectedIndex";
                                        Log($"UpdateLibraryPanel: Saving scroll anchor using SelectedIndex={anchorIndex}, item={_libraryItems[anchorIndex].FileName}");
                                    }
                                    else
                                    {
                                        // Strategy 2: Try to preserve previous anchor (works when scrolling without selection)
                                        // This is the most reliable fallback when SelectedIndex is -1
                                        if (_scrollAnchorPath != null)
                                        {
                                            var existingAnchor = _libraryItems
                                                .Select((item, idx) => new { item, idx })
                                                .FirstOrDefault(x => x.item.FullPath == _scrollAnchorPath);
                                            if (existingAnchor != null)
                                            {
                                                anchorIndex = existingAnchor.idx;
                                                strategy = "PreviousAnchor";
                                                Log($"UpdateLibraryPanel: Saving scroll anchor using previous anchor at index={anchorIndex}, path={_scrollAnchorPath}, item={existingAnchor.item.FileName}");
                                            }
                                            else
                                            {
                                                Log($"UpdateLibraryPanel: Previous scroll anchor path '{_scrollAnchorPath}' not found in current list (item may have been filtered out)");
                                            }
                                        }
                                        else
                                        {
                                            Log($"UpdateLibraryPanel: No scroll anchor to preserve (SelectedIndex={LibraryListBox.SelectedIndex}, _scrollAnchorPath=null) - will start at top");
                                        }
                                    }
                                    
                                    // Save anchor if we found a valid one
                                    if (anchorIndex >= 0 && anchorIndex < _libraryItems.Count)
                                    {
                                        var oldAnchorPath = _scrollAnchorPath;
                                        _scrollAnchorPath = _libraryItems[anchorIndex].FullPath;
                                        Log($"UpdateLibraryPanel: Saved scroll anchor: index={anchorIndex}, path={_scrollAnchorPath}, strategy={strategy}, oldPath={oldAnchorPath ?? "null"}");
                                    }
                                    else
                                    {
                                        // Clear anchor if we couldn't find a valid one
                                        if (_scrollAnchorPath != null)
                                        {
                                            Log($"UpdateLibraryPanel: Clearing scroll anchor (no valid index found, anchorIndex={anchorIndex}, itemCount={_libraryItems.Count})");
                                            _scrollAnchorPath = null;
                                        }
                                    }
                                }
                                else
                                {
                                    if (LibraryListBox == null)
                                    {
                                        Log($"UpdateLibraryPanel: Cannot save scroll anchor - LibraryListBox is null");
                                    }
                                    else if (_libraryItems.Count == 0)
                                    {
                                        Log($"UpdateLibraryPanel: Cannot save scroll anchor - _libraryItems is empty");
                                    }
                                }
                                
                                // Suppress Favorite/Blacklist event handlers during UI update
                                _isUpdatingLibraryItems = true;
                                try
                                {
                                    _libraryItems.Clear();
                                    Log($"UpdateLibraryPanel: Cleared _libraryItems, adding {items.Count} items");
                                    foreach (var item in items)
                                    {
                                        if (cancellationToken.IsCancellationRequested)
                                        {
                                            Log($"UpdateLibraryPanel: Cancelled during item addition (scroll anchor preserved: {_scrollAnchorPath ?? "null"})");
                                            return;
                                        }
                                        _libraryItems.Add(item);
                                    }
                                    Log($"UpdateLibraryPanel: UI thread callback completed. _libraryItems now has {_libraryItems.Count} items. LibraryListBox.ItemsSource is set: {LibraryListBox?.ItemsSource != null}, LibraryListBox.IsVisible: {LibraryListBox?.IsVisible}, LibraryPanelContainer.IsVisible: {LibraryPanelContainer?.IsVisible}");
                                    
                                    // Update filter count display
                                    UpdateFilterCountDisplay(_libraryItems.Count);
                                    
                                    // Restore selection state (only for items that are still in the filtered list)
                                    if (LibraryListBox != null && LibraryListBox.SelectedItems != null && _selectedItemPaths.Count > 0)
                                    {
                                        _isHandlingSelectionChange = true;
                                        try
                                        {
                                            LibraryListBox.SelectedItems.Clear();
                                            foreach (var item in _libraryItems)
                                            {
                                                if (_selectedItemPaths.Contains(item.FullPath))
                                                {
                                                    LibraryListBox.SelectedItems.Add(item);
                                                }
                                            }
                                            // Remove paths that are no longer in the filtered list
                                            var visiblePaths = new HashSet<string>(_libraryItems.Select(i => i.FullPath), StringComparer.OrdinalIgnoreCase);
                                            _selectedItemPaths.RemoveWhere(path => !visiblePaths.Contains(path));
                                        }
                                        finally
                                        {
                                            _isHandlingSelectionChange = false;
                                        }
                                        // Update selection count display after restoration (since SelectionChanged was suppressed)
                                        UpdateSelectionCountDisplay();
                                    }
                                    
                                    // Restore scroll position using anchor item
                                    if (_scrollAnchorPath != null && LibraryListBox != null)
                                    {
                                        var anchorIndex = _libraryItems
                                            .Select((item, index) => new { item, index })
                                            .FirstOrDefault(x => x.item.FullPath == _scrollAnchorPath)?.index ?? -1;
                                        
                                        if (anchorIndex >= 0)
                                        {
                                            Log($"UpdateLibraryPanel: Restoring scroll position to anchor index={anchorIndex}, path={_scrollAnchorPath}, item={_libraryItems[anchorIndex].FileName}");
                                            // Restore scroll position on next render cycle
                                            Dispatcher.UIThread.Post(() =>
                                            {
                                                if (LibraryListBox != null && anchorIndex < _libraryItems.Count)
                                                {
                                                    Log($"UpdateLibraryPanel: Calling ScrollIntoView for index={anchorIndex}, itemCount={_libraryItems.Count}");
                                                    LibraryListBox.ScrollIntoView(anchorIndex);
                                                    Log($"UpdateLibraryPanel: ScrollIntoView completed for index={anchorIndex}");
                                                }
                                                else
                                                {
                                                    Log($"UpdateLibraryPanel: ScrollIntoView skipped - LibraryListBox={LibraryListBox != null}, anchorIndex={anchorIndex}, itemCount={_libraryItems.Count}");
                                                }
                                                _scrollAnchorPath = null; // Reset after restoration
                                            }, DispatcherPriority.Loaded);
                                        }
                                        else
                                        {
                                            Log($"UpdateLibraryPanel: Scroll anchor '{_scrollAnchorPath}' not found in new filtered list (item was filtered out) - resetting to top");
                                            _scrollAnchorPath = null; // Anchor not found, reset
                                        }
                                    }
                                    else
                                    {
                                        if (_scrollAnchorPath != null && LibraryListBox == null)
                                        {
                                            Log($"UpdateLibraryPanel: Scroll anchor exists but LibraryListBox is null - cannot restore scroll position");
                                        }
                                        else if (_scrollAnchorPath == null)
                                        {
                                            Log($"UpdateLibraryPanel: No scroll anchor to restore (_scrollAnchorPath=null)");
                                        }
                                    }
                                }
                                finally
                                {
                                    _isUpdatingLibraryItems = false;
                                }
                            }
                            catch (OperationCanceledException)
                            {
                                Log("UpdateLibraryPanel: Operation cancelled");
                            }
                            catch (Exception ex)
                            {
                                var errorMsg = $"EXCEPTION in UpdateLibraryPanel UI thread callback: {ex.GetType().Name} - {ex.Message}\n{ex.StackTrace}";
                                if (ex.InnerException != null)
                                {
                                    errorMsg += $"\nInner Exception: {ex.InnerException.Message}";
                                }
                                Log(errorMsg);
                            }
                        });
                        Log("UpdateLibraryPanel: Task.Run completed.");
                    }
                    catch (OperationCanceledException)
                    {
                        Log("UpdateLibraryPanel: Task.Run cancelled");
                    }
                    catch (Exception ex)
                    {
                        var errorMsg = $"EXCEPTION in UpdateLibraryPanel Task.Run: {ex.GetType().Name} - {ex.Message}\n{ex.StackTrace}";
                        if (ex.InnerException != null)
                        {
                            errorMsg += $"\nInner Exception: {ex.InnerException.Message}";
                        }
                        Log(errorMsg);
                    }
                }, cancellationToken);
                Log("UpdateLibraryPanel: Completed successfully.");
            }
            catch (OperationCanceledException)
            {
                Log("UpdateLibraryPanel: Operation cancelled");
            }
            catch (Exception ex)
            {
                var errorMsg = $"EXCEPTION in UpdateLibraryPanel: {ex.GetType().Name} - {ex.Message}\n{ex.StackTrace}";
                if (ex.InnerException != null)
                {
                    errorMsg += $"\nInner Exception: {ex.InnerException.Message}\n{ex.InnerException.StackTrace}";
                }
                Log(errorMsg);
            }
        }

        private List<LibraryItem> ApplyViewPresetFilter(List<LibraryItem> items)
        {
            switch (_currentViewPreset)
            {
                case "Favorites":
                    return items.Where(item => item.IsFavorite).ToList();
                
                case "Blacklisted":
                    // Show only blacklisted items (ignore ExcludeBlacklisted setting for this view)
                    return items.Where(item => item.IsBlacklisted).ToList();
                
                case "RecentlyPlayed":
                    // Filter to items with LastPlayedUtc != null, sorted by LastPlayedUtc descending
                    return items.Where(item => item.LastPlayedUtc != null)
                        .OrderByDescending(item => item.LastPlayedUtc)
                        .ToList();
                
                case "NeverPlayed":
                    return items.Where(item => item.PlayCount == 0).ToList();
                
                case "All":
                case null:
                default:
                    return items;
            }
        }

        private List<LibraryItem> ApplySort(List<LibraryItem> items)
        {
            switch (_librarySortMode)
            {
                case "LastPlayed":
                    return items.OrderByDescending(item => item.LastPlayedUtc ?? DateTime.MinValue).ToList();
                
                case "PlayCount":
                    return items.OrderByDescending(item => item.PlayCount).ToList();
                
                case "Duration":
                    return items.OrderByDescending(item => item.Duration ?? TimeSpan.Zero).ToList();
                
                case "Name":
                default:
                    return items.OrderBy(item => item.FileName, StringComparer.OrdinalIgnoreCase).ToList();
            }
        }

        private List<LibraryItem> GetSelectedLibraryItems()
        {
            var selectedItems = new List<LibraryItem>();
            foreach (var path in _selectedItemPaths)
            {
                var item = _libraryService.FindItemByPath(path);
                if (item != null)
                {
                    selectedItems.Add(item);
                }
            }
            return selectedItems;
        }

        private void UpdateSelectionCountDisplay()
        {
            if (LibraryCountTextBlock != null)
            {
                var selectedCount = _selectedItemPaths.Count;
                var filteredCount = _libraryItems.Count;
                LibraryCountTextBlock.Text = $"🎯 {filteredCount} filtered • 📝 {selectedCount} selected";
            }
        }


        private void UpdateFilterCountDisplay(int count)
        {
            if (LibraryCountTextBlock != null)
            {
                var selectedCount = _selectedItemPaths.Count;
                LibraryCountTextBlock.Text = $"🎯 {count} filtered • 📝 {selectedCount} selected";
            }
        }

        private void UpdateContextMenuState()
        {
            if (LibraryListBox == null)
                return;

            var selectedItems = GetSelectedLibraryItems();
            var hasSelection = selectedItems.Count > 0;
            var hasAnyFavorites = selectedItems.Any(item => item.IsFavorite);
            var hasAnyBlacklisted = selectedItems.Any(item => item.IsBlacklisted);

            // Get common tags across all selected items
            var commonTags = new HashSet<string>();
            if (selectedItems.Count > 0)
            {
                commonTags = new HashSet<string>(selectedItems[0].Tags ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                foreach (var item in selectedItems.Skip(1))
                {
                    var itemTags = new HashSet<string>(item.Tags ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                    commonTags.IntersectWith(itemTags);
                }
            }

            // Update menu item enabled states
            if (ContextMenu_RemoveFromFavoritesMenuItem != null)
            {
                ContextMenu_RemoveFromFavoritesMenuItem.IsEnabled = hasSelection && hasAnyFavorites;
            }
            if (ContextMenu_RemoveFromBlacklistMenuItem != null)
            {
                ContextMenu_RemoveFromBlacklistMenuItem.IsEnabled = hasSelection && hasAnyBlacklisted;
            }
            if (ContextMenu_RemoveTagsMenuItem != null)
            {
                ContextMenu_RemoveTagsMenuItem.IsEnabled = hasSelection && commonTags.Count > 0;
            }
        }

        private void LibraryViewPresetComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            if (_isInitializingLibraryPanel) return; // Suppress during initialization
            
            if (LibraryViewPresetComboBox?.SelectedItem is ComboBoxItem item && item.Tag is string preset)
            {
                var oldPreset = _currentViewPreset;
                Log($"UI ACTION: LibraryViewPresetComboBox changed to: {preset ?? "null"} (display: {item.Content})");
                _currentViewPreset = preset;
                if (oldPreset != _currentViewPreset)
                {
                    Log($"STATE CHANGE: View preset changed - Previous: {oldPreset ?? "null"}, New: {_currentViewPreset ?? "null"}");
                }
                UpdateLibraryPanel();
            }
        }

        private void LibrarySourceComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            if (_isInitializingLibraryPanel) return; // Suppress during initialization
            
            if (LibrarySourceComboBox?.SelectedItem is ComboBoxItem item)
            {
                var sourceId = item.Tag as string;
                Log($"UI ACTION: LibrarySourceComboBox changed to: {sourceId ?? "All sources"} (display: {item.Content})");
                _selectedSourceId = sourceId;
                // Clear selection when source changes
                _selectedItemPaths.Clear();
                _lastSelectedIndex = -1;
                UpdateLibraryPanel();
            }
        }

        /// <summary>
        /// Populates and updates the filter preset dropdown in the library panel.
        /// </summary>
        private void UpdateLibraryPresetComboBox()
        {
            if (LibraryPresetComboBox == null) return;
            
            // Suppress SelectionChanged event during programmatic update to prevent double execution
            _isUpdatingPresetComboBox = true;
            
            try
            {
                LibraryPresetComboBox.Items.Clear();
                
                // Always add "None" as first option
                var noneItem = new ComboBoxItem { Content = "None", Tag = "None" };
                LibraryPresetComboBox.Items.Add(noneItem);
                
                // Add all presets
                if (_filterPresets != null)
                {
                    foreach (var preset in _filterPresets)
                    {
                        var item = new ComboBoxItem { Content = preset.Name, Tag = preset.Name };
                        LibraryPresetComboBox.Items.Add(item);
                    }
                }
                
                // Select active preset or "None"
                string selectedTag = _activePresetName ?? "None";
                bool foundMatch = false;
                if (LibraryPresetComboBox.Items != null)
                {
                    foreach (var itemObj in LibraryPresetComboBox.Items)
                    {
                        if (itemObj is ComboBoxItem item && item.Tag?.ToString() == selectedTag)
                        {
                            LibraryPresetComboBox.SelectedItem = item;
                            foundMatch = true;
                            break;
                        }
                    }
                }
                
                // Fallback: If no match found (e.g., preset was deleted or settings corrupted), select "None"
                if (!foundMatch && LibraryPresetComboBox.Items != null && LibraryPresetComboBox.Items.Count > 0)
                {
                    var missingPresetName = _activePresetName; // Capture for logging before clearing
                    LibraryPresetComboBox.SelectedItem = LibraryPresetComboBox.Items[0]; // "None" is always first
                    selectedTag = "None";
                    _activePresetName = null; // Clear active preset name since it no longer exists
                    Log($"UpdateLibraryPresetComboBox: Active preset '{missingPresetName}' not found, selected 'None' as fallback and cleared active preset name");
                }
                
                Log($"UpdateLibraryPresetComboBox: Populated {LibraryPresetComboBox.Items?.Count ?? 0} items, selected: {selectedTag}");
            }
            finally
            {
                _isUpdatingPresetComboBox = false;
            }
        }

        /// <summary>
        /// Event handler for preset selection - loads preset immediately.
        /// </summary>
        private void LibraryPresetComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            // Suppress event handling during programmatic updates to prevent double execution
            if (_isUpdatingPresetComboBox) return;
            
            if (LibraryPresetComboBox?.SelectedItem is not ComboBoxItem selectedItem)
                return;
            
            var selectedPresetName = selectedItem.Tag?.ToString();
            
            // Handle "None" selection
            if (selectedPresetName == "None" || string.IsNullOrEmpty(selectedPresetName))
            {
                Log("LibraryPresetComboBox: Selected 'None' - clearing active preset");
                _activePresetName = null;
                UpdateFilterSummaryText();
                
                // Rebuild queue and update library panel
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
                StatusTextBlock.Text = "Cleared filter preset";
                _ = Task.Run(async () => await RebuildPlayQueueIfNeededAsync());
                SaveSettings();
                return;
            }
            
            // Find and load the preset
            var preset = _filterPresets?.FirstOrDefault(p => p.Name == selectedPresetName);
            if (preset == null)
            {
                Log($"LibraryPresetComboBox: Preset '{selectedPresetName}' not found");
                return;
            }
            
            Log($"LibraryPresetComboBox: Loading preset '{selectedPresetName}' immediately");
            
            // Deep copy preset's FilterState
            var json = JsonSerializer.Serialize(preset.FilterState);
            _currentFilterState = JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
            _activePresetName = selectedPresetName;
            
            // Update filter summary
            UpdateFilterSummaryText();
            
            // Save settings
            SaveSettings();
            
            // Update library panel and rebuild queue
            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
            StatusTextBlock.Text = $"Applied filter preset: {selectedPresetName}";
            _ = Task.Run(async () => await RebuildPlayQueueIfNeededAsync());
        }


        private void LibrarySearchTextBox_TextChanged(object? sender, TextChangedEventArgs e)
        {
            if (sender is TextBox textBox)
            {
                var searchText = textBox.Text ?? "";
                Log($"UI ACTION: LibrarySearchTextBox changed to: '{searchText}'");
                _librarySearchText = searchText;
                UpdateLibraryPanel();
            }
        }

        private void LibrarySortComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            if (_isInitializingLibraryPanel) return; // Suppress during initialization
            
            if (LibrarySortComboBox?.SelectedItem is ComboBoxItem item && item.Tag is string sortMode)
            {
                Log($"UI ACTION: LibrarySortComboBox changed to: {sortMode} (display: {item.Content})");
                _librarySortMode = sortMode;
                UpdateLibraryPanel();
            }
        }

        private void LibraryFilterButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("UI ACTION: LibraryFilterButton clicked");
            FilterMenuItem_Click(sender, e);
        }

        private void LibraryRespectFiltersToggle_Changed(object? sender, RoutedEventArgs e)
        {
            var isChecked = LibraryRespectFiltersToggle?.IsChecked == true;
            Log($"UI ACTION: LibraryRespectFiltersToggle changed to: {isChecked}");
            UpdateLibraryPanel();
        }

        private void LibraryItemPlay_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: LibraryItemPlay clicked for: {System.IO.Path.GetFileName(path)}");
                PlayFromPath(path);
            }
        }

        private void LibraryItemShowInFileManager_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: LibraryItemShowInFileManager clicked for: {System.IO.Path.GetFileName(path)}");
                OpenFileLocation(path);
            }
        }

        private void LibraryItemFavorite_Changed(object? sender, RoutedEventArgs e)
        {
            // Don't process if we're updating the library items UI
            if (_isUpdatingLibraryItems || _isInitializingLibraryPanel)
            {
                Log($"LibraryItemFavorite_Changed: Ignoring - UI update in progress");
                return;
            }
            
            // Only process if it's a user interaction (the toggle button is loaded and user clicks it)
            if (sender is ToggleButton toggle && toggle.Tag is LibraryItem item)
            {
                var toggleState = toggle.IsChecked == true;
                
                // CRITICAL FIX: Get the item from the library index to ensure we have the latest state
                // The bound item might be stale due to virtualization recycling
                var libraryItem = _libraryService.FindItemByPath(item.FullPath);
                if (libraryItem == null)
                {
                    Log($"LibraryItemFavorite_Changed: Item not found in library: {item.FileName}");
                    return;
                }
                
                // CRITICAL FIX: Check if the item reference in Tag matches the library item
                // If they're different objects, this is virtualization recycling the UI element
                // and we should ignore the event to prevent data loss
                if (!ReferenceEquals(item, libraryItem))
                {
                    // The Tag has a stale item reference from virtualization recycling
                    // The binding has updated the toggle based on the new item, but Tag still has the old item
                    // This is NOT a user action - ignore it to prevent incorrect updates
                    Log($"LibraryItemFavorite_Changed: Ignoring virtualization recycling for '{item.FileName}' - Tag item reference doesn't match library item (Tag item IsFavorite={item.IsFavorite}, Library item IsFavorite={libraryItem.IsFavorite}, Toggle={toggleState})");
                    return;
                }
                
                // CRITICAL FIX: Check if the item's state already matches the toggle state
                // If it matches, this is a binding update from virtualization, not a user action
                // This prevents favorites from being incorrectly removed when scrolling
                // When virtualization recycles items, bindings update and fire events even when state matches
                if (libraryItem.IsFavorite == toggleState)
                {
                    // State already matches - this is definitely a binding update, not a user action
                    // This happens when virtualization recycles items and updates bindings during scrolling
                    Log($"LibraryItemFavorite_Changed: Ignoring binding update for '{item.FileName}' - state already matches: {toggleState}");
                    return;
                }
                
                Log($"UI ACTION: LibraryItemFavorite toggled for '{item.FileName}' to: {toggleState} (was: {libraryItem.IsFavorite})");
                libraryItem.IsFavorite = toggleState;
                _libraryService.UpdateItem(libraryItem);
                _ = Task.Run(() => _libraryService.SaveLibrary());
                UpdateLibraryPanel();
            }
        }

        private void LibraryItemBlacklist_Changed(object? sender, RoutedEventArgs e)
        {
            // Don't process if we're updating the library items UI
            if (_isUpdatingLibraryItems || _isInitializingLibraryPanel)
            {
                Log($"LibraryItemBlacklist_Changed: Ignoring - UI update in progress");
                return;
            }
            
            // Only process if it's a user interaction (the toggle button is loaded and user clicks it)
            if (sender is ToggleButton toggle && toggle.Tag is LibraryItem item)
            {
                var toggleState = toggle.IsChecked == true;
                
                // CRITICAL FIX: Get the item from the library index to ensure we have the latest state
                // The bound item might be stale due to virtualization recycling
                var libraryItem = _libraryService.FindItemByPath(item.FullPath);
                if (libraryItem == null)
                {
                    Log($"LibraryItemBlacklist_Changed: Item not found in library: {item.FileName}");
                    return;
                }
                
                // CRITICAL FIX: Check if the item reference in Tag matches the library item
                // If they're different objects, this is virtualization recycling the UI element
                // and we should ignore the event to prevent data loss
                if (!ReferenceEquals(item, libraryItem))
                {
                    // The Tag has a stale item reference from virtualization recycling
                    // The binding has updated the toggle based on the new item, but Tag still has the old item
                    // This is NOT a user action - ignore it to prevent incorrect updates
                    Log($"LibraryItemBlacklist_Changed: Ignoring virtualization recycling for '{item.FileName}' - Tag item reference doesn't match library item (Tag item IsBlacklisted={item.IsBlacklisted}, Library item IsBlacklisted={libraryItem.IsBlacklisted}, Toggle={toggleState})");
                    return;
                }
                
                // CRITICAL FIX: Check if the item's state already matches the toggle state
                // If it matches, this is a binding update from virtualization, not a user action
                // This prevents blacklist state from being incorrectly changed when scrolling
                // When virtualization recycles items, bindings update and fire events even when state matches
                if (libraryItem.IsBlacklisted == toggleState)
                {
                    // State already matches - this is definitely a binding update, not a user action
                    // This happens when virtualization recycles items and updates bindings during scrolling
                    Log($"LibraryItemBlacklist_Changed: Ignoring binding update for '{item.FileName}' - state already matches: {toggleState}");
                    return;
                }
                
                Log($"UI ACTION: LibraryItemBlacklist toggled for '{item.FileName}' to: {toggleState} (was: {libraryItem.IsBlacklisted})");
                libraryItem.IsBlacklisted = toggleState;
                _libraryService.UpdateItem(libraryItem);
                _ = Task.Run(() => _libraryService.SaveLibrary());
                UpdateLibraryPanel();
                // Rebuild queue if item was blacklisted
                if (libraryItem.IsBlacklisted)
                {
                    RebuildPlayQueueIfNeeded();
                }
            }
        }

        private void LibraryListBox_DoubleTapped(object? sender, RoutedEventArgs e)
        {
            if (sender is ListBox listBox && listBox.SelectedItem is LibraryItem item)
            {
                Log($"UI ACTION: LibraryListBox double-tapped for: {System.IO.Path.GetFileName(item.FullPath)}");
                PlayFromPath(item.FullPath);
            }
        }

        private void LibraryListBox_KeyDown(object? sender, KeyEventArgs e)
        {
            if (sender is ListBox listBox && listBox.SelectedItem is LibraryItem item)
            {
                if (e.Key == Key.Enter)
                {
                    Log($"UI ACTION: LibraryListBox Enter key pressed for: {System.IO.Path.GetFileName(item.FullPath)}");
                    PlayFromPath(item.FullPath);
                    e.Handled = true;
                }
            }
        }

        private void LibraryListBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            if (_isHandlingSelectionChange || sender is not ListBox listBox)
                return;

            try
            {
                _isHandlingSelectionChange = true;

                // Update selected paths from current selection
                _selectedItemPaths.Clear();
                if (listBox.SelectedItems != null)
                {
                    foreach (var item in listBox.SelectedItems.Cast<LibraryItem>())
                    {
                        _selectedItemPaths.Add(item.FullPath);
                    }
                }

                // Update last selected index
                if (listBox.SelectedIndex >= 0)
                {
                    _lastSelectedIndex = listBox.SelectedIndex;
                }

                UpdateSelectionCountDisplay();
                UpdateContextMenuState();
            }
            finally
            {
                _isHandlingSelectionChange = false;
            }
        }

        private void LibraryListBox_PointerPressed(object? sender, PointerPressedEventArgs e)
        {
            // Note: Avalonia's ListBox with SelectionMode="Multiple" handles Ctrl+Click and Shift+Click automatically
            // This handler is kept for potential future custom behavior, but currently relies on default behavior
            if (sender is ListBox listBox && listBox.SelectedIndex >= 0)
            {
                _lastSelectedIndex = listBox.SelectedIndex;
            }
        }

        private async void LibraryItemTags_Click(object? sender, RoutedEventArgs e)
        {
            Log("UI ACTION: LibraryItemTags clicked");
            if (sender is Button button && button.Tag is LibraryItem item)
            {
                Log($"LibraryItemTags_Click: Opening tags dialog for: {item.FileName}");
                var dialog = new ItemTagsDialog(new List<LibraryItem> { item }, _libraryIndex, _libraryService, _filterPresets);
                var result = await dialog.ShowDialog<bool?>(this);
                if (result == true)
                {
                    Log($"LibraryItemTags_Click: Tags updated for: {item.FileName}");
                    // Save filter presets (in case tags were renamed/deleted)
                    SaveSettings();
                    // Refresh library index reference
                    _libraryIndex = _libraryService.LibraryIndex;
                    // Update library panel if visible
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    // Update stats if this is the current video
                    if (_currentVideoPath == item.FullPath)
                    {
                        UpdateCurrentFileStatsUi();
                    }
                }
            }
        }

        private async void ContextMenu_AddToFavorites_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_AddToFavorites_Click: Adding {selectedItems.Count} items to favorites");
            
            foreach (var item in selectedItems)
            {
                if (!item.IsFavorite)
                {
                    item.IsFavorite = true;
                    _libraryService.UpdateItem(item);
                }
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            StatusTextBlock.Text = $"Added {selectedItems.Count} item(s) to favorites";
            UpdateLibraryPanel();
            UpdateContextMenuState();
        }

        private async void ContextMenu_RemoveFromFavorites_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_RemoveFromFavorites_Click: Removing {selectedItems.Count} items from favorites");
            
            foreach (var item in selectedItems)
            {
                if (item.IsFavorite)
                {
                    item.IsFavorite = false;
                    _libraryService.UpdateItem(item);
                }
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            StatusTextBlock.Text = $"Removed {selectedItems.Count} item(s) from favorites";
            UpdateLibraryPanel();
            UpdateContextMenuState();
        }

        private async void ContextMenu_AddToBlacklist_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_AddToBlacklist_Click: Adding {selectedItems.Count} items to blacklist");
            
            foreach (var item in selectedItems)
            {
                if (!item.IsBlacklisted)
                {
                    item.IsBlacklisted = true;
                    _libraryService.UpdateItem(item);
                }
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            StatusTextBlock.Text = $"Added {selectedItems.Count} item(s) to blacklist";
            RebuildPlayQueueIfNeeded();
            UpdateLibraryPanel();
            UpdateContextMenuState();
        }

        private async void ContextMenu_RemoveFromBlacklist_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_RemoveFromBlacklist_Click: Removing {selectedItems.Count} items from blacklist");
            
            foreach (var item in selectedItems)
            {
                if (item.IsBlacklisted)
                {
                    item.IsBlacklisted = false;
                    _libraryService.UpdateItem(item);
                }
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            StatusTextBlock.Text = $"Removed {selectedItems.Count} item(s) from blacklist";
            RebuildPlayQueueIfNeeded();
            UpdateLibraryPanel();
            UpdateContextMenuState();
        }

        private async void ContextMenu_ClearStats_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_ClearStats_Click: Clearing stats for {selectedItems.Count} items");
            
            foreach (var item in selectedItems)
            {
                item.PlayCount = 0;
                item.LastPlayedUtc = null;
                _libraryService.UpdateItem(item);
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            StatusTextBlock.Text = $"Cleared playback stats for {selectedItems.Count} item(s)";
            UpdateLibraryPanel();
            if (_currentVideoPath != null && selectedItems.Any(item => item.FullPath == _currentVideoPath))
            {
                UpdateCurrentFileStatsUi();
            }
        }

        private async void ContextMenu_RemoveFromLibrary_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            // Show confirmation dialog
            var confirmDialog = new RemoveItemsDialog(selectedItems.Count);
            var confirmResult = await confirmDialog.ShowDialog<bool?>(this);
            if (confirmResult != true)
            {
                Log($"ContextMenu_RemoveFromLibrary_Click: User cancelled removal of {selectedItems.Count} items");
                return;
            }

            Log($"ContextMenu_RemoveFromLibrary_Click: Removing {selectedItems.Count} items from library");
            
            foreach (var item in selectedItems)
            {
                _libraryService.RemoveItem(item.FullPath);
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            
            // Clear selection
            _selectedItemPaths.Clear();
            if (LibraryListBox != null && LibraryListBox.SelectedItems != null)
            {
                LibraryListBox.SelectedItems.Clear();
            }
            
            // Update library index reference
            _libraryIndex = _libraryService.LibraryIndex;
            
            StatusTextBlock.Text = $"Removed {selectedItems.Count} item(s) from library";
            UpdateLibraryPanel();
            RebuildPlayQueueIfNeeded();
        }

        private async void ContextMenu_AddTags_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_AddTags_Click: Opening tags dialog for {selectedItems.Count} items");
            
            var dialog = new ItemTagsDialog(selectedItems, _libraryIndex, _libraryService, _filterPresets);
            var result = await dialog.ShowDialog<bool?>(this);
            if (result == true)
            {
                Log($"ContextMenu_AddTags_Click: Tags updated for {selectedItems.Count} items");
                
                // Save filter presets (in case tags were renamed/deleted)
                SaveSettings();
                // Refresh library index reference
                _libraryIndex = _libraryService.LibraryIndex;
                
                // Only rebuild library panel if tag filters are active that might affect visibility
                // Tag-only changes don't affect which items are visible unless filters are applied
                bool hasTagFilters = (LibraryRespectFiltersToggle?.IsChecked == true) 
                    && ((_currentFilterState?.SelectedTags?.Count ?? 0) > 0 
                        || (_currentFilterState?.ExcludedTags?.Count ?? 0) > 0);
                
                if (hasTagFilters)
                {
                    UpdateLibraryPanel(); // Rebuild only if tag filters might hide/show items
                }
                // Otherwise, tags are updated in place, no UI rebuild needed
                
                if (_currentVideoPath != null && selectedItems.Any(item => item.FullPath == _currentVideoPath))
                {
                    UpdateCurrentFileStatsUi();
                }
            }
        }

        private async void ContextMenu_RemoveTags_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            // Get common tags
            var commonTags = new HashSet<string>();
            if (selectedItems.Count > 0)
            {
                commonTags = new HashSet<string>(selectedItems[0].Tags ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                foreach (var item in selectedItems.Skip(1))
                {
                    var itemTags = new HashSet<string>(item.Tags ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
                    commonTags.IntersectWith(itemTags);
                }
            }

            if (commonTags.Count == 0)
            {
                StatusTextBlock.Text = "No common tags to remove";
                return;
            }

            Log($"ContextMenu_RemoveTags_Click: Removing tags from {selectedItems.Count} items");
            
            // For now, we'll remove all common tags from all selected items
            // A more sophisticated UI could be added later to select which tags to remove
            foreach (var item in selectedItems)
            {
                if (item.Tags != null)
                {
                    item.Tags.RemoveAll(tag => commonTags.Contains(tag, StringComparer.OrdinalIgnoreCase));
                    _libraryService.UpdateItem(item);
                }
            }
            
            await Task.Run(() => _libraryService.SaveLibrary());
            StatusTextBlock.Text = $"Removed {commonTags.Count} tag(s) from {selectedItems.Count} item(s)";
            UpdateLibraryPanel();
            if (_currentVideoPath != null && selectedItems.Any(item => item.FullPath == _currentVideoPath))
            {
                UpdateCurrentFileStatsUi();
            }
        }

        private void ShowLibraryPanelMenuItem_Click(object? sender, RoutedEventArgs e)
        {
            var showPanel = ShowLibraryPanelMenuItem.IsChecked == true;
            Log($"UI ACTION: ShowLibraryPanelMenuItem clicked, setting show panel to: {showPanel}");
            var oldValue = _showLibraryPanel;
            
            // If hiding the panel, capture current width before applying the change
            if (oldValue && !showPanel && MainContentGrid?.ColumnDefinitions.Count > 0)
            {
                var currentWidth = MainContentGrid.ColumnDefinitions[0].Width;
                if (currentWidth.IsAbsolute && currentWidth.Value >= 400)
                {
                    _libraryPanelWidth = currentWidth.Value;
                    Log($"ShowLibraryPanelMenuItem_Click: Captured library panel width before hiding: {_libraryPanelWidth}");
                }
            }
            
            _showLibraryPanel = showPanel;
            if (oldValue != _showLibraryPanel)
            {
                Log($"STATE CHANGE: Library panel visibility changed - Previous: {oldValue}, New: {_showLibraryPanel}");
            }
            SaveSettings();
            ApplyViewPreferences();
            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
        }

        #endregion

        private void HistoryPlayAgain_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: HistoryPlayAgain clicked for: {Path.GetFileName(path)}");
                PlayFromPath(path);
            }
        }

        private void RecentlyPlayedPlay_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: RecentlyPlayedPlay clicked for: {Path.GetFileName(path)}");
                PlayFromPath(path);
            }
        }

        private void RecentlyPlayedShowInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: RecentlyPlayedShowInFileManager clicked for: {Path.GetFileName(path)}");
                OpenFileLocation(path);
            }
        }

        private void RecentlyPlayedRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // This handler is legacy - recently played items are managed via library items
            // Items cannot be removed from "Recently played" view (they're based on LastPlayedUtc)
            // If user wants to hide them, they should use blacklist instead
        }

        private void BlacklistPlay_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: BlacklistPlay clicked for: {Path.GetFileName(path)}");
                PlayFromPath(path);
            }
        }

        private void BlacklistRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: BlacklistRemove clicked for: {Path.GetFileName(path)}");
                RemoveFromBlacklist(path);
                // Update Library panel if visible
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
                StatusTextBlock.Text = $"Removed from blacklist: {System.IO.Path.GetFileName(path)}";
            }
        }

        private void BlacklistShowInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: BlacklistShowInFileManager clicked for: {Path.GetFileName(path)}");
                OpenFileLocation(path);
            }
        }

        private void FavoritesPlay_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: FavoritesPlay clicked for: {Path.GetFileName(path)}");
                PlayFromPath(path);
            }
        }

        private void FavoritesRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: FavoritesRemove clicked for: {Path.GetFileName(path)}");
                // Update library item
                if (_libraryIndex != null)
                {
                    var item = _libraryService.FindItemByPath(path);
                    if (item != null)
                    {
                        item.IsFavorite = false;
                        _libraryService.UpdateItem(item);
                        
                        // Save library asynchronously
                        _ = Task.Run(() =>
                        {
                            try
                            {
                                _libraryService.SaveLibrary();
                            }
                            catch (Exception ex)
                            {
                                Log($"FavoritesRemove_Click: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                Log($"FavoritesRemove_Click: ERROR - Stack trace: {ex.StackTrace}");
                                if (ex.InnerException != null)
                                {
                                    Log($"FavoritesRemove_Click: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                                }
                            }
                        });
                    }
                }

                // If the removed entry is the current video, update the toggle and status line
                if (path.Equals(_currentVideoPath, StringComparison.OrdinalIgnoreCase))
                {
                    UpdatePerVideoToggleStates();
                }

                // Update Library panel if visible
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
                StatusTextBlock.Text = $"Removed from favorites: {System.IO.Path.GetFileName(path)}";

                // Queue will be rebuilt when filters change via FilterDialog
            }
        }

        private void FavoritesShowInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: FavoritesShowInFileManager clicked for: {Path.GetFileName(path)}");
                OpenFileLocation(path);
            }
        }

        #region Queue System

        private string[] GetEligiblePool()
        {
            Log("GetEligiblePool: Starting eligible pool calculation");
            try
            {
                // Use FilterService with FilterState - this is the only source of truth for filtering
                if (_libraryIndex == null || _currentFilterState == null)
                {
                    Log($"GetEligiblePool: Library system not available (libraryIndex: {_libraryIndex != null}, filterState: {_currentFilterState != null}), returning empty pool");
                    return Array.Empty<string>();
                }

                if (_libraryIndex.Items.Count == 0)
                {
                    Log("GetEligiblePool: Library has no items, returning empty pool");
                    return Array.Empty<string>();
                }

                Log($"GetEligiblePool: Using FilterService with {_libraryIndex.Items.Count} items");
                // Use BuildEligibleSetWithoutFileCheck for performance - file existence will be checked when video is actually played
                var eligibleItems = _filterService.BuildEligibleSetWithoutFileCheck(_currentFilterState, _libraryIndex);
                var result = eligibleItems.Select(item => item.FullPath).ToArray();
                Log($"GetEligiblePool: FilterService returned {result.Length} eligible items after filtering");
                return result;
            }
            catch (Exception ex)
            {
                // Log error but don't crash
                Log($"GetEligiblePool: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"GetEligiblePool: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"GetEligiblePool: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    Log($"GetEligiblePool: ERROR - Inner exception stack trace: {ex.InnerException.StackTrace}");
                }
                return Array.Empty<string>();
            }
        }

        private async Task<string[]> GetEligiblePoolAsync()
        {
            return await Task.Run(() => GetEligiblePool());
        }

        private void RebuildPlayQueueIfNeeded()
        {
            // Fire and forget async version to avoid blocking
            _ = RebuildPlayQueueIfNeededAsync();
        }

        private async Task RebuildPlayQueueIfNeededAsync()
        {
            Log("RebuildPlayQueueIfNeededAsync: Starting queue rebuild check");
            if (!_noRepeatMode)
            {
                Log("RebuildPlayQueueIfNeededAsync: No-repeat mode is off, skipping queue rebuild");
                return;
            }

            Log("RebuildPlayQueueIfNeededAsync: No-repeat mode is on, getting eligible pool...");
            var pool = await GetEligiblePoolAsync();
            Log($"RebuildPlayQueueIfNeededAsync: Eligible pool has {pool.Length} videos");
            
            // Get current queue contents to exclude from rebuild (prevents duplicates)
            var currentQueueItems = await Dispatcher.UIThread.InvokeAsync(() =>
            {
                return new HashSet<string>(_playQueue, StringComparer.OrdinalIgnoreCase);
            });
            Log($"RebuildPlayQueueIfNeededAsync: Current queue has {currentQueueItems.Count} videos that will be excluded from rebuild");
            
            // Exclude videos that are already in the current queue
            var poolSet = new HashSet<string>(pool, StringComparer.OrdinalIgnoreCase);
            poolSet.ExceptWith(currentQueueItems);
            var poolWithoutQueueItems = poolSet.ToArray();
            Log($"RebuildPlayQueueIfNeededAsync: After excluding current queue items, {poolWithoutQueueItems.Length} videos remain");
            
            if (poolWithoutQueueItems.Length == 0)
            {
                // No new videos to add - if queue is empty, we need to cycle through all videos again
                // If queue is not empty, we still need to filter it to remove ineligible items
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    var eligibleSet = new HashSet<string>(pool, StringComparer.OrdinalIgnoreCase);
                    
                    if (_playQueue.Count == 0)
                    {
                        Log("RebuildPlayQueueIfNeededAsync: Queue is empty and no new videos available - rebuilding with all eligible videos to cycle again");
                        // Queue is empty, cycle through all videos again
                        var shuffled = pool.OrderBy(x => _rng.Next()).ToList();
                        _playQueue = new Queue<string>(shuffled);
                        Log($"STATE CHANGE: Queue cycled - New size: {_playQueue.Count}");
                    }
                    else
                    {
                        Log("RebuildPlayQueueIfNeededAsync: No new videos to add, filtering existing queue to remove ineligible items");
                        // Filter existing queue to remove items that are no longer eligible
                        var filteredExistingQueue = new Queue<string>();
                        int removedCount = 0;
                        while (_playQueue.Count > 0)
                        {
                            var item = _playQueue.Dequeue();
                            if (eligibleSet.Contains(item))
                            {
                                filteredExistingQueue.Enqueue(item);
                            }
                            else
                            {
                                removedCount++;
                            }
                        }
                        _playQueue = filteredExistingQueue;
                        Log($"STATE CHANGE: Queue filtered - Removed (no longer eligible): {removedCount}, Remaining: {_playQueue.Count}");
                    }
                    // Clear the status messages
                    if (StatusTextBlock.Text == "Finding eligible media..." || 
                        StatusTextBlock.Text == "Applying filters and rebuilding queue...")
                    {
                        StatusTextBlock.Text = "Ready";
                    }
                });
                return;
            }

            Log($"RebuildPlayQueueIfNeededAsync: Shuffling {poolWithoutQueueItems.Length} videos...");
            // Shuffle using Fisher-Yates (on background thread)
            var shuffled = poolWithoutQueueItems.OrderBy(x => _rng.Next()).ToList();
            Log($"RebuildPlayQueueIfNeededAsync: Shuffling complete, updating queue on UI thread");
            
            // Update queue on UI thread - preserve existing queue items (if still eligible) and append new ones
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                var oldCount = _playQueue.Count;
                var eligibleSet = new HashSet<string>(pool, StringComparer.OrdinalIgnoreCase);
                
                // If queue is empty, replace it entirely. Otherwise, filter existing queue and append new items
                if (_playQueue.Count == 0)
                {
                    _playQueue = new Queue<string>(shuffled);
                    Log($"STATE CHANGE: Queue rebuilt (empty) - New size: {_playQueue.Count}");
                }
                else
                {
                    // Filter existing queue to remove items that are no longer eligible
                    var filteredExistingQueue = new Queue<string>();
                    int removedCount = 0;
                    while (_playQueue.Count > 0)
                    {
                        var item = _playQueue.Dequeue();
                        if (eligibleSet.Contains(item))
                        {
                            filteredExistingQueue.Enqueue(item);
                        }
                        else
                        {
                            removedCount++;
                        }
                    }
                    _playQueue = filteredExistingQueue;
                    
                    // Append new items to filtered existing queue
                    foreach (var item in shuffled)
                    {
                        _playQueue.Enqueue(item);
                    }
                    Log($"STATE CHANGE: Queue rebuilt - Previous size: {oldCount}, Removed (no longer eligible): {removedCount}, Added: {shuffled.Count}, New size: {_playQueue.Count}");
                }
                // Clear the status messages once queue is built
                if (StatusTextBlock.Text == "Finding eligible media..." || 
                    StatusTextBlock.Text == "Applying filters and rebuilding queue...")
                {
                    StatusTextBlock.Text = "Ready";
                }
            });
            Log("RebuildPlayQueueIfNeededAsync: Queue rebuild complete");
        }

        private void NoRepeatToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _noRepeatMode = NoRepeatToggle.IsChecked == true;
            Log($"UI ACTION: NoRepeatToggle changed to: {_noRepeatMode}");
            NoRepeatMenuItem.IsChecked = _noRepeatMode;
            if (_noRepeatMode)
            {
                RebuildPlayQueueIfNeeded();
            }
            else
            {
                var oldCount = _playQueue.Count;
                _playQueue.Clear();
                Log($"STATE CHANGE: Queue cleared (no-repeat mode disabled) - Previous size: {oldCount}, New size: {_playQueue.Count}");
            }
            
            // Persist the setting (unless we're applying settings from dialog)
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        #endregion

        #region Video Playback

        private async Task PlayFromPathAsync(string videoPath)
        {
            Log($"PlayFromPath: Starting - videoPath: {videoPath ?? "null"}");
            
            // Central helper to play a video from any panel
            // Validates path and ensures it's in the current library (or safely handles if not)
            // Sets the current video path selection
            // Starts playback via MediaPlayer
            // Updates history/timeline and stats (if already implemented)
            // Respects existing favorite/blacklist status (no automatic changes)
            if (string.IsNullOrEmpty(videoPath) || !File.Exists(videoPath))
            {
                Log($"PlayFromPath: ERROR - File not found or path is empty. Path: {videoPath ?? "null"}, Exists: {(!string.IsNullOrEmpty(videoPath) && File.Exists(videoPath))}");
                
                // Determine if it's a photo or video based on file extension
                bool isPhoto = false;
                if (!string.IsNullOrEmpty(videoPath))
                {
                    var extension = Path.GetExtension(videoPath).ToLowerInvariant();
                    isPhoto = _photoExtensions.Contains(extension);
                }
                
                // Handle missing file (works for both videos and photos)
                await HandleMissingFileAsync(videoPath, isPhoto: isPhoto);
                return;
            }

            Log($"PlayFromPath: File exists, calling PlayVideo - addToHistory: true");
            PlayVideo(videoPath, addToHistory: true);
        }

        private void PlayFromPath(string videoPath)
        {
            // Synchronous wrapper for backward compatibility
            _ = PlayFromPathAsync(videoPath);
        }

        private async Task<MissingFileDialogResult> ShowMissingFileDialogAsync(string? missingPath)
        {
            Log($"ShowMissingFileDialogAsync: Showing dialog for missing file: {missingPath ?? "null"}");
            
            // Ensure dialog is shown on UI thread
            if (Dispatcher.UIThread.CheckAccess())
            {
                var dialog = new MissingFileDialog(missingPath ?? "");
                var result = await dialog.ShowDialog<MissingFileDialogResult>(this);
                Log($"ShowMissingFileDialogAsync: User selected: {result}");
                return result;
            }
            else
            {
                // Marshal to UI thread - use TaskCompletionSource to properly await the async dialog
                var tcs = new TaskCompletionSource<MissingFileDialogResult>();
                Dispatcher.UIThread.Post(async () =>
                {
                    try
                    {
                        var dialog = new MissingFileDialog(missingPath ?? "");
                        var result = await dialog.ShowDialog<MissingFileDialogResult>(this);
                        Log($"ShowMissingFileDialogAsync: User selected: {result}");
                        tcs.SetResult(result);
                    }
                    catch (Exception ex)
                    {
                        Log($"ShowMissingFileDialogAsync: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        tcs.SetResult(MissingFileDialogResult.Cancel);
                    }
                });
                return await tcs.Task;
            }
        }

        private async Task HandleMissingFileAsync(string? missingPath, bool isPhoto = false)
        {
            Log($"HandleMissingFileAsync: Handling missing file - Path: {missingPath ?? "null"}, IsPhoto: {isPhoto}");
            
            // Marshal to UI thread if needed - use Post with TaskCompletionSource to avoid deadlocks
            if (!Dispatcher.UIThread.CheckAccess())
            {
                var tcs = new TaskCompletionSource<bool>();
                Dispatcher.UIThread.Post(async () =>
                {
                    try
                    {
                        await HandleMissingFileAsync(missingPath, isPhoto);
                        tcs.SetResult(true);
                    }
                    catch (Exception ex)
                    {
                        Log($"HandleMissingFileAsync: ERROR marshaling to UI thread - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        tcs.SetException(ex);
                    }
                });
                await tcs.Task;
                return;
            }
            
            if (string.IsNullOrEmpty(missingPath))
            {
                Log("HandleMissingFileAsync: Path is null or empty");
                SetStatusMessage(isPhoto ? "Photo file not found." : "Video file not found.");
                return;
            }

            MissingFileDialogResult result;
            
            // Check setting for default behavior
            if (_missingFileBehavior == MissingFileBehavior.AlwaysRemoveFromLibrary)
            {
                Log("HandleMissingFileAsync: Setting is AlwaysRemoveFromLibrary - removing from library without dialog");
                result = MissingFileDialogResult.RemoveFromLibrary;
            }
            else
            {
                // Show dialog (we're already on UI thread)
                result = await ShowMissingFileDialogAsync(missingPath);
            }

            if (result == MissingFileDialogResult.RemoveFromLibrary)
            {
                // Remove from library and then continue playback with a new file
                Log("HandleMissingFileAsync: Removing file from library, will continue playback after removal");
                await RemoveLibraryItemAsync(missingPath);
                // Status message is already set by RemoveLibraryItemAsync
                
                // Continue playback with a new random file
                Log("HandleMissingFileAsync: File removed, continuing playback with new random file");
                await PlayRandomVideoAsync();
            }
            else if (result == MissingFileDialogResult.LocateFile)
            {
                var newPath = await HandleLocateFileAsync(missingPath, isPhoto);
                if (!string.IsNullOrEmpty(newPath) && File.Exists(newPath))
                {
                    // Retry playback with new path
                    Log($"HandleMissingFileAsync: File located, retrying playback with new path: {newPath}");
                    PlayVideo(newPath);
                }
                else
                {
                    SetStatusMessage(isPhoto ? "Photo file not located." : "Video file not located.");
                }
            }
            else
            {
                // Cancel - just show status
                SetStatusMessage(isPhoto ? "Photo file not found." : "Video file not found.");
            }
        }

        private async Task<string?> HandleLocateFileAsync(string? oldPath, bool isPhoto = false)
        {
            Log($"HandleLocateFileAsync: Opening file picker for missing file: {oldPath ?? "null"}, IsPhoto: {isPhoto}");
            
            try
            {
                var options = new FilePickerOpenOptions
                {
                    Title = isPhoto ? "Locate Photo File" : "Locate Video File",
                    AllowMultiple = false,
                    FileTypeFilter = isPhoto ? new[]
                    {
                        new FilePickerFileType("Image Files")
                        {
                            Patterns = new[] { "*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.webp", "*.tiff", "*.tif", "*.heic", "*.heif", "*.avif", "*.ico", "*.svg", "*.raw", "*.cr2", "*.nef", "*.orf", "*.sr2" }
                        },
                        new FilePickerFileType("All Files") { Patterns = new[] { "*" } }
                    } : new[]
                    {
                        new FilePickerFileType("Video Files")
                        {
                            Patterns = new[] { "*.mp4", "*.mkv", "*.avi", "*.mov", "*.wmv", "*.mpg", "*.mpeg" }
                        },
                        new FilePickerFileType("All Files") { Patterns = new[] { "*" } }
                    }
                };

                // Try to set initial directory to the old file's directory if it exists
                if (!string.IsNullOrEmpty(oldPath))
                {
                    try
                    {
                        var oldDir = Path.GetDirectoryName(oldPath);
                        if (!string.IsNullOrEmpty(oldDir) && Directory.Exists(oldDir))
                        {
                            var storageFolder = await StorageProvider.TryGetFolderFromPathAsync(oldDir);
                            if (storageFolder != null)
                            {
                                options.SuggestedStartLocation = storageFolder;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Log($"HandleLocateFileAsync: Could not set suggested start location - {ex.Message}");
                    }
                }

                var result = await StorageProvider.OpenFilePickerAsync(options);
                
                if (result.Count > 0 && result[0] != null)
                {
                    var newPath = result[0].Path.LocalPath;
                    Log($"HandleLocateFileAsync: User selected file: {newPath}");
                    
                    // Verify it's a valid file
                    var extension = Path.GetExtension(newPath).ToLowerInvariant();
                    if (isPhoto)
                    {
                        if (!_photoExtensions.Contains(extension))
                        {
                            Log($"HandleLocateFileAsync: Selected file is not a valid photo file: {extension}");
                            SetStatusMessage("Selected file is not a valid photo file.");
                            return null;
                        }
                    }
                    else
                    {
                        if (!_videoExtensions.Contains(extension))
                        {
                            Log($"HandleLocateFileAsync: Selected file is not a valid video file: {extension}");
                            SetStatusMessage("Selected file is not a valid video file.");
                            return null;
                        }
                    }
                    
                    // Update library item with new path
                    if (_libraryIndex != null && !string.IsNullOrEmpty(oldPath))
                    {
                        var item = _libraryService.FindItemByPath(oldPath);
                        if (item != null)
                        {
                            Log($"HandleLocateFileAsync: Updating library item path from {oldPath} to {newPath}");
                            
                            // Check if new path is in an existing source
                            // Use normalized paths with separator validation to prevent false matches
                            // (e.g., C:\VideoRecordings should not match C:\Videos)
                            var newDir = Path.GetDirectoryName(newPath);
                            var matchingSource = _libraryIndex.Sources.FirstOrDefault(s => 
                            {
                                if (string.IsNullOrEmpty(newDir) || string.IsNullOrEmpty(s.RootPath))
                                    return false;
                                
                                // Normalize both paths for comparison
                                var normalizedNewDir = Path.GetFullPath(newDir);
                                var normalizedRoot = Path.GetFullPath(s.RootPath);
                                
                                // Check if newDir is exactly the root, or is a subdirectory of root
                                if (normalizedNewDir.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase))
                                    return true;
                                
                                // Check if newDir starts with root + separator (prevents false matches)
                                var rootWithSeparator = normalizedRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
                                return normalizedNewDir.StartsWith(rootWithSeparator, StringComparison.OrdinalIgnoreCase);
                            });
                            
                            if (matchingSource != null)
                            {
                                item.SourceId = matchingSource.Id;
                                // Calculate relative path
                                var rootUri = new Uri(Path.GetFullPath(matchingSource.RootPath) + Path.DirectorySeparatorChar);
                                var fileUri = new Uri(Path.GetFullPath(newPath));
                                var relativeUri = rootUri.MakeRelativeUri(fileUri);
                                item.RelativePath = Uri.UnescapeDataString(relativeUri.ToString().Replace('/', Path.DirectorySeparatorChar));
                            }
                            else
                            {
                                // File moved outside all sources - clear RelativePath to prevent inconsistency
                                // RelativePath is invalid since file is no longer relative to any source
                                // Keep SourceId as-is to avoid breaking code that expects it, but RelativePath must be cleared
                                item.RelativePath = string.Empty;
                                Log($"HandleLocateFileAsync: New file location is not within any existing source - RelativePath cleared, SourceId unchanged");
                            }
                            
                            item.FullPath = newPath;
                            item.FileName = Path.GetFileName(newPath);
                            
                            _libraryService.UpdateItem(item);
                            
                            // Save library asynchronously (await to ensure save completes before updating UI)
                            await Task.Run(() =>
                            {
                                try
                                {
                                    _libraryService.SaveLibrary();
                                    Log("HandleLocateFileAsync: Library saved successfully");
                                }
                                catch (Exception ex)
                                {
                                    Log($"HandleLocateFileAsync: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                    throw; // Re-throw to be caught by outer try-catch
                                }
                            });
                            
                            // Update library index reference (after save completes)
                            var updatedIndex = _libraryService.LibraryIndex;
                            
                            await Avalonia.Threading.Dispatcher.UIThread.InvokeAsync(() =>
                            {
                                _libraryIndex = updatedIndex;

                                if (_showLibraryPanel)
                                {
                                    UpdateLibraryPanel();
                                }

                                SetStatusMessage($"File path updated: {Path.GetFileName(newPath)}");
                            });
                            return newPath;
                        }
                        else
                        {
                            Log($"HandleLocateFileAsync: Library item not found for old path: {oldPath}");
                            SetStatusMessage("Library item not found.");
                            return null;
                        }
                    }
                    else
                    {
                        Log("HandleLocateFileAsync: Library index is null or old path is empty");
                        return newPath; // Return path even if we can't update library
                    }
                }
                else
                {
                    Log("HandleLocateFileAsync: User cancelled file picker");
                    return null;
                }
            }
            catch (Exception ex)
            {
                Log($"HandleLocateFileAsync: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"HandleLocateFileAsync: ERROR - Stack trace: {ex.StackTrace}");
                StatusTextBlock.Text = $"Error locating file: {ex.Message}";
                return null;
            }
        }

        private async Task RemoveLibraryItemAsync(string? path)
        {
            Log($"RemoveLibraryItemAsync: Removing library item: {path ?? "null"}");
            
            if (string.IsNullOrEmpty(path))
            {
                Log("RemoveLibraryItemAsync: Path is null or empty");
                return;
            }
            
            try
            {
                _libraryService.RemoveItem(path);
                
                // Save library asynchronously
                await Task.Run(() =>
                {
                    try
                    {
                        _libraryService.SaveLibrary();
                        Log("RemoveLibraryItemAsync: Library saved successfully");
                    }
                    catch (Exception ex)
                    {
                        Log($"RemoveLibraryItemAsync: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        throw; // Re-throw to be caught by outer try-catch and displayed to user
                    }
                });
                
                // Update library index reference
                var updatedIndex = _libraryService.LibraryIndex;
                
                await Avalonia.Threading.Dispatcher.UIThread.InvokeAsync(() =>
                {
                    _libraryIndex = updatedIndex;
                    
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    
                    // Recalculate stats
                    RecalculateGlobalStats();
                    
                    // Set success status message
                    SetStatusMessage($"Removed from library: {Path.GetFileName(path)}");
                });
                
                Log($"RemoveLibraryItemAsync: Successfully removed item: {Path.GetFileName(path)}");
            }
            catch (Exception ex)
            {
                Log($"RemoveLibraryItemAsync: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"RemoveLibraryItemAsync: ERROR - Stack trace: {ex.StackTrace}");
                await Avalonia.Threading.Dispatcher.UIThread.InvokeAsync(() =>
                {
                    SetStatusMessage($"Error removing item: {ex.Message}");
                });
            }
        }

        private void SetStatusMessage(string message, int minimumDisplayMilliseconds = 1000)
        {
            CancellationTokenSource? previousCts;
            CancellationTokenSource? newCts;
            double delayMs;

            lock (_statusMessageLock)
            {
                previousCts = _statusMessageCancellation;
                _statusMessageCancellation = new CancellationTokenSource();
                newCts = _statusMessageCancellation;
                
                var now = DateTime.UtcNow;
                var elapsed = (now - _lastStatusMessageTime).TotalMilliseconds;
                delayMs = elapsed >= minimumDisplayMilliseconds
                    ? 0
                    : minimumDisplayMilliseconds - elapsed;
            }

            previousCts?.Cancel();

            if (delayMs > 0)
            {
                Log($"SetStatusMessage: Delaying status update by {(int)delayMs}ms to honor minimum display time");
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    if (delayMs > 0)
                    {
                        await Task.Delay((int)delayMs, newCts!.Token);
                    }

                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    {
                        if (newCts.IsCancellationRequested)
                        {
                            return;
                        }

                        lock (_statusMessageLock)
                        {
                            if (!ReferenceEquals(_statusMessageCancellation, newCts))
                            {
                                return;
                            }

                            StatusTextBlock.Text = message;
                            _lastStatusMessageTime = DateTime.UtcNow;
                        }
                    });
                }
                catch (TaskCanceledException)
                {
                    Log($"SetStatusMessage: Update cancelled for message: {message}");
                }
                catch (Exception ex)
                {
                    Log($"SetStatusMessage: ERROR scheduling status update - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                }
            });
        }

        private void OpenFileLocation(string? path)
        {
            Log($"OpenFileLocation: Opening file location for: {path ?? "null"}");
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                Log($"OpenFileLocation: ERROR - File not found on disk");
                StatusTextBlock.Text = "File not found on disk.";
                return;
            }

            try
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    // Windows: explorer.exe /select,"full-path"
                    var processInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "explorer.exe",
                        Arguments = $"/select,\"{path}\"",
                        UseShellExecute = true
                    };
                    System.Diagnostics.Process.Start(processInfo);
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    // macOS: open -R full-path
                    var processInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "open",
                        Arguments = $"-R \"{path}\"",
                        UseShellExecute = false
                    };
                    System.Diagnostics.Process.Start(processInfo);
                }
                else
                {
                    // Linux: xdg-open with directory
                    var directory = Path.GetDirectoryName(path);
                    Log($"OpenFileLocation: Linux - Getting directory name from path: {path}");
                    if (!string.IsNullOrEmpty(directory))
                    {
                        Log($"OpenFileLocation: Linux - Opening directory: {directory}");
                        var processInfo = new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = "xdg-open",
                            Arguments = $"\"{directory}\"",
                            UseShellExecute = false
                        };
                        System.Diagnostics.Process.Start(processInfo);
                    }
                    else
                    {
                        Log($"OpenFileLocation: Linux - Could not get directory name from path");
                    }
                }
            }
            catch (Exception ex)
            {
                StatusTextBlock.Text = $"Could not open file location: {ex.Message}";
            }
        }

        private void PlayVideo(string videoPath, bool addToHistory = true)
        {
            Log($"PlayVideo: Starting - videoPath: {videoPath ?? "null"}, addToHistory: {addToHistory}");
            
            if (_mediaPlayer == null || _libVLC == null)
            {
                Log("PlayVideo: ERROR - MediaPlayer or LibVLC is null");
                return;
            }

            try
            {
                // Stop photo timer if it's running
                if (_photoDisplayTimer != null)
                {
                    _photoDisplayTimer.Stop();
                    _photoDisplayTimer.Elapsed -= PhotoDisplayTimer_Elapsed;
                    _photoDisplayTimer.Dispose();
                    _photoDisplayTimer = null;
                }
                
                // Save previous photo state before updating (needed for smooth transition)
                bool wasPlayingPhoto = _isCurrentlyPlayingPhoto;
                _isCurrentlyPlayingPhoto = false;

                var previousPath = _currentVideoPath;
                _currentVideoPath = videoPath;
                Log($"PlayVideo: Current video path set - Previous: {previousPath ?? "null"}, New: {videoPath ?? "null"}");

                // Determine if this is a photo or video
                var extension = Path.GetExtension(videoPath ?? "").ToLowerInvariant();
                var isPhoto = _photoExtensions.Contains(extension);
                _isCurrentlyPlayingPhoto = isPhoto;
                Log($"PlayVideo: Detected media type - Extension: {extension}, IsPhoto: {isPhoto}");

                if (isPhoto)
                {
                    StatusTextBlock.Text = $"Photo: {System.IO.Path.GetFileName(videoPath)}";
                    Log($"PlayVideo: Setting status text for photo: {System.IO.Path.GetFileName(videoPath)}");
                }
                else
                {
                    StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(videoPath)}";
                    Log($"PlayVideo: Setting status text for video: {System.IO.Path.GetFileName(videoPath)}");
                }

                // Record playback stats
                if (videoPath != null)
                {
                    Log("PlayVideo: Recording playback stats");
                    RecordPlayback(videoPath);
                }

                // Update per-video toggle UI
                Log("PlayVideo: Updating per-video toggle states");
                UpdatePerVideoToggleStates();

                // Dispose previous media
                if (_currentMedia != null)
                {
                    Log("PlayVideo: Stopping player and disposing previous media");
                    _mediaPlayer.Stop(); // Stop playback cleanly before disposing to prevent audio spikes
                    _currentMedia.Dispose();
                }

                // Create and play new media
                if (videoPath != null)
                {
                    // Store user volume preference before normalization
                    _userVolumePreference = (int)VolumeSlider.Value;
                    Log($"PlayVideo: User volume preference: {_userVolumePreference}");

                    if (isPhoto)
                    {
                        // Photos: Use Avalonia Image control instead of VLC for better performance with large images
                        Log("PlayVideo: This is a photo - loading with Avalonia Image control");
                        
                        // Hide VideoView and show Image control
                        try
                        {
                            if (VideoView != null)
                            {
                                VideoView.IsVisible = false;
                                Log("PlayVideo: VideoView hidden");
                            }
                            if (PhotoImageView != null)
                            {
                                PhotoImageView.IsVisible = true;
                                Log("PlayVideo: PhotoImageView shown");
                            }
                        }
                        catch (Exception ex)
                        {
                            Log($"PlayVideo: ERROR accessing UI elements - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        }
                        
                        // Stop media player and dispose media to clear VideoView content
                        Log("PlayVideo: Stopping media player for photo");
                        if (_mediaPlayer != null)
                        {
                            try
                            {
                                _mediaPlayer.Stop();
                                Log("PlayVideo: Media player stopped successfully");
                            }
                            catch (Exception ex)
                            {
                                Log($"PlayVideo: ERROR stopping media player - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            }
                        }
                        
                        // Dispose previous photo bitmap and media
                        Log("PlayVideo: Disposing previous photo resources");
                        _currentPhotoBitmap?.Dispose();
                        _currentPhotoBitmap = null;
                        if (_currentMedia != null)
                        {
                            _currentMedia.Dispose();
                            _currentMedia = null;
                        }
                        Log("PlayVideo: Previous photo resources disposed");
                        
                        // Check if file exists before loading
                        // Note: File.Exists on network drives can be slow, but we'll proceed anyway
                        // If the file doesn't exist, we'll catch it during loading
                        Log($"PlayVideo: Checking if photo file exists: {videoPath}");
                        bool fileExists = false;
                        try
                        {
                            fileExists = File.Exists(videoPath);
                            Log($"PlayVideo: File exists check completed: {fileExists}");
                        }
                        catch (Exception ex)
                        {
                            Log($"PlayVideo: ERROR checking file existence - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            // Assume file exists to avoid blocking - we'll catch the error during loading if it doesn't
                            fileExists = true;
                        }
                        
                        if (!fileExists)
                        {
                            Log($"PlayVideo: Photo file not found: {videoPath}");
                            _ = HandleMissingFileAsync(videoPath, isPhoto: true);
                            return;
                        }
                        Log("PlayVideo: Photo file exists, proceeding with load");
                        
                        // Load image asynchronously with efficient decoding
                        Log("PlayVideo: Starting Task.Run for photo loading");
                        _ = Task.Run(async () =>
                        {
                            // Declare bitmap at outer scope so it's accessible in catch blocks
                            Avalonia.Media.Imaging.Bitmap? bitmap = null;
                            try
                            {
                                Log($"PlayVideo: Task.Run started - Loading photo: {videoPath}");
                                
                                // Calculate max dimensions based on scaling settings
                                int maxWidth = int.MaxValue;
                                int maxHeight = int.MaxValue;
                                
                                if (_imageScalingMode != ImageScalingMode.Off)
                                {
                                    maxWidth = _fixedImageMaxWidth;
                                    maxHeight = _fixedImageMaxHeight;
                                    
                                    if (_imageScalingMode == ImageScalingMode.Auto)
                                    {
                                        // Calculate max dimensions based on screen size (2x for high DPI)
                                        // Screens.All must be accessed on UI thread
                                        try
                                        {
                                            var screenInfo = await Dispatcher.UIThread.InvokeAsync(() =>
                                            {
                                                var screens = Screens.All;
                                                if (screens != null && screens.Count > 0)
                                                {
                                                    var primaryScreen = screens[0];
                                                    return new { Width = primaryScreen.Bounds.Width, Height = primaryScreen.Bounds.Height };
                                                }
                                                return null;
                                            });
                                            
                                            if (screenInfo != null)
                                            {
                                                // Use 2x screen dimensions to account for high DPI and zoom
                                                maxWidth = Math.Max(maxWidth, (int)(screenInfo.Width * 2));
                                                maxHeight = Math.Max(maxHeight, (int)(screenInfo.Height * 2));
                                            }
                                        }
                                        catch (Exception ex)
                                        {
                                            Log($"PlayVideo: Could not get screen dimensions, using fixed max: {ex.Message}");
                                        }
                                    }
                                    
                                    Log($"PlayVideo: Decoding image with max dimensions: {maxWidth}x{maxHeight}");
                                }
                                else
                                {
                                    Log("PlayVideo: Image scaling is disabled - loading full resolution");
                                }
                                
                                // Load and decode image efficiently
                                using (var stream = File.OpenRead(videoPath))
                                {
                                    if (_imageScalingMode != ImageScalingMode.Off && maxWidth < int.MaxValue && maxHeight < int.MaxValue)
                                    {
                                        // Decode to max width for efficient loading (maintains aspect ratio)
                                        bitmap = Avalonia.Media.Imaging.Bitmap.DecodeToWidth(stream, maxWidth, Avalonia.Media.Imaging.BitmapInterpolationMode.HighQuality);
                                        
                                        // If height exceeds max, decode to height instead
                                        if (bitmap != null && bitmap.PixelSize.Height > maxHeight)
                                        {
                                            bitmap.Dispose();
                                            stream.Position = 0;
                                            bitmap = Avalonia.Media.Imaging.Bitmap.DecodeToHeight(stream, maxHeight, Avalonia.Media.Imaging.BitmapInterpolationMode.HighQuality);
                                        }
                                    }
                                    else
                                    {
                                        // No scaling - decode full resolution
                                        bitmap = new Avalonia.Media.Imaging.Bitmap(stream);
                                    }
                                }
                                
                                if (bitmap != null)
                                {
                                    Log($"PlayVideo: Image decoded successfully - Size: {bitmap.PixelSize.Width}x{bitmap.PixelSize.Height}");
                                    
                                    // Update UI on UI thread
                                    try
                                    {
                                        await Dispatcher.UIThread.InvokeAsync(() =>
                                        {
                                            try
                                            {
                                                // Validate that this photo is still the current one before updating UI
                                                // Prevents race condition where multiple photo loads complete out of order
                                                if (_currentVideoPath != videoPath)
                                                {
                                                    Log($"PlayVideo: Photo load completed but is no longer current - Current: {_currentVideoPath ?? "null"}, Loaded: {videoPath}");
                                                    bitmap?.Dispose();
                                                    bitmap = null;
                                                    return;
                                                }
                                                
                                                // Update Image control
                                                if (PhotoImageView != null)
                                                {
                                                    _currentPhotoBitmap = bitmap;
                                                    PhotoImageView.Source = bitmap;
                                                    Log("PlayVideo: Photo displayed in Image control");
                                                    
                                                    // Start photo display timer
                                                    if (_photoDisplayTimer != null)
                                                    {
                                                        _photoDisplayTimer.Stop();
                                                        _photoDisplayTimer.Dispose();
                                                    }
                                                    
                                                    _photoDisplayTimer = new System.Timers.Timer(_photoDisplayDurationSeconds * 1000);
                                                    _photoDisplayTimer.Elapsed += PhotoDisplayTimer_Elapsed;
                                                    _photoDisplayTimer.AutoReset = false;
                                                    _photoDisplayTimer.Start();
                                                    Log($"PlayVideo: Started photo display timer for {_photoDisplayDurationSeconds} seconds");
                                                }
                                                else
                                                {
                                                    bitmap.Dispose();
                                                    bitmap = null; // Prevent double-disposal in outer catch handler
                                                    Log("PlayVideo: ERROR - PhotoImageView is null, disposed bitmap");
                                                }
                                            }
                                            catch (Exception ex)
                                            {
                                                Log($"PlayVideo: ERROR updating UI with photo - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                                // Clear Image control reference before disposing bitmap
                                                if (PhotoImageView != null)
                                                {
                                                    PhotoImageView.Source = null;
                                                }
                                                bitmap?.Dispose();
                                                bitmap = null; // Prevent double-disposal in outer catch handler
                                                _currentPhotoBitmap = null;
                                            }
                                        });
                                    }
                                    catch (Exception ex)
                                    {
                                        // Exception during InvokeAsync setup - dispose bitmap
                                        Log($"PlayVideo: ERROR during UI thread invocation - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                        bitmap?.Dispose();
                                        bitmap = null; // Prevent double-disposal in outer catch handler
                                        _currentPhotoBitmap = null;
                                        throw; // Re-throw to be caught by outer handler
                                    }
                                }
                                else
                                {
                                    Log("PlayVideo: ERROR - Failed to decode image");
                                }
                            }
                            catch (FileNotFoundException ex)
                            {
                                Log($"PlayVideo: Photo file not found: {ex.Message}");
                                // Only handle missing file if this photo is still current
                                if (_currentVideoPath == videoPath)
                                {
                                    await HandleMissingFileAsync(videoPath, isPhoto: true);
                                }
                                else
                                {
                                    Log($"PlayVideo: Photo file not found but photo is no longer current - Current: {_currentVideoPath ?? "null"}, Missing: {videoPath}");
                                }
                            }
                            catch (Exception ex)
                            {
                                Log($"PlayVideo: ERROR loading photo - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                Log($"PlayVideo: ERROR - Stack trace: {ex.StackTrace}");
                                
                                // Dispose bitmap if it exists (in case exception occurred before InvokeAsync)
                                // Note: bitmap variable is in scope here
                                if (bitmap != null)
                                {
                                    bitmap.Dispose();
                                    _currentPhotoBitmap = null;
                                }
                                
                                // Update UI to show error (only if this photo is still current)
                                await Dispatcher.UIThread.InvokeAsync(() =>
                                {
                                    // Validate that this photo is still the current one before showing error
                                    if (_currentVideoPath != videoPath)
                                    {
                                        Log($"PlayVideo: Photo error occurred but photo is no longer current - Current: {_currentVideoPath ?? "null"}, Failed: {videoPath}");
                                        return;
                                    }
                                    
                                    if (PhotoImageView != null)
                                    {
                                        PhotoImageView.Source = null;
                                    }
                                    SetStatusMessage($"Error loading photo: {ex.Message}");
                                });
                            }
                        });
                    }
                    else
                    {
                        // Videos: Check if we're transitioning from photo to video
                        // (wasPlayingPhoto was saved earlier before _isCurrentlyPlayingPhoto was set to false)
                        
                        if (wasPlayingPhoto)
                        {
                            // Transitioning from photo to video: keep photo visible until video starts playing
                            Log("PlayVideo: Transitioning from photo to video - keeping photo visible until video loads");
                            
                            // Stop and clear any previous video to prevent showing old frame
                            if (_mediaPlayer != null)
                            {
                                _mediaPlayer.Stop();
                            }
                            if (_currentMedia != null)
                            {
                                Log("PlayVideo: Disposing previous media before transitioning from photo to video");
                                _currentMedia.Dispose();
                                _currentMedia = null;
                            }
                            
                            if (VideoView != null)
                            {
                                VideoView.IsVisible = false; // Hide VideoView until video is ready
                            }
                            // PhotoImageView stays visible - will be hidden in MediaPlayer.Playing event
                        }
                        else
                        {
                            // Normal video playback (not transitioning from photo)
                            if (PhotoImageView != null)
                            {
                                PhotoImageView.IsVisible = false;
                                PhotoImageView.Source = null;
                            }
                            if (VideoView != null)
                            {
                                VideoView.IsVisible = true;
                            }
                        }
                        
                        // Dispose photo bitmap if any (but keep PhotoImageView visible if transitioning)
                        if (!wasPlayingPhoto)
                        {
                            _currentPhotoBitmap?.Dispose();
                            _currentPhotoBitmap = null;
                        }
                        
                        // Videos: Create Media object and use VLC
                        Log($"PlayVideo: Creating new Media object from path");
                        _currentMedia = new Media(_libVLC, videoPath, FromType.FromPath);
                        
                        // Videos: Use existing logic
                        // Set input-repeat option for seamless looping when loop is enabled
                        if (_isLoopEnabled)
                        {
                            Log("PlayVideo: Loop is enabled - adding input-repeat option");
                            _currentMedia.AddOption(":input-repeat=65535");
                        }
                        
                        // Apply volume normalization (must be called before Parse/Play)
                        Log($"PlayVideo: Applying volume normalization - Enabled: {_volumeNormalizationEnabled}");
                        ApplyVolumeNormalization();
                        
                        // Parse media to get track information (including video dimensions)
                        Log("PlayVideo: Parsing media to get track information");
                        _currentMedia.Parse();
                        
                        // Try to get video aspect ratio from tracks immediately
                        UpdateAspectRatioFromTracks();
                        
                        Log("PlayVideo: Starting playback");
                        _mediaPlayer!.Play(_currentMedia!);
                        Log("PlayVideo: Playback started successfully");
                        
                        // Also try again after a short delay in case tracks weren't available immediately
                        // This helps with files where Parse() doesn't immediately populate tracks
                        Task.Delay(100).ContinueWith(_ =>
                        {
                            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                            {
                                if (!_hasValidAspectRatio && _currentMedia != null)
                                {
                                    Log("PlayVideo: Retrying aspect ratio update after delay");
                                    UpdateAspectRatioFromTracks();
                                }
                            });
                        });
                    }
                }
                else
                {
                    Log("PlayVideo: ERROR - videoPath is null, returning");
                    return;
                }

                // Update PlayPause button state
                PlayPauseButton.IsChecked = true;

                // Initialize seek bar (resets to 0, disabled for photos or until length known for videos)
                InitializeSeekBar(isPhoto);

                // Preview player disabled - no thumbnail generation
                // Just clear any cached preview data
                _cachedPreviewBitmap?.Dispose();
                _cachedPreviewBitmap = null;
                
                // Clear photo bitmap when playing new media (if switching from photo to video)
                if (!isPhoto)
                {
                    _currentPhotoBitmap?.Dispose();
                    _currentPhotoBitmap = null;
                    if (PhotoImageView != null)
                    {
                        PhotoImageView.Source = null;
                    }
                }

                // Add to timeline if not navigating
                if (!_isNavigatingTimeline)
                {
                    // Remove any entries after current index (if we're not at the end)
                    if (_timelineIndex >= 0 && _timelineIndex < _playbackTimeline.Count - 1)
                    {
                        var removedCount = _playbackTimeline.Count - _timelineIndex - 1;
                        _playbackTimeline.RemoveRange(_timelineIndex + 1, removedCount);
                        Log($"PlayVideo: Removed {removedCount} entries from timeline after index {_timelineIndex}");
                    }
                    // Add new video to timeline
                    _playbackTimeline.Add(videoPath);
                    _timelineIndex = _playbackTimeline.Count - 1;
                    Log($"PlayVideo: Added video to timeline - Index: {_timelineIndex}, Timeline count: {_playbackTimeline.Count}");
                    // Note: UpdateCurrentFileStatsUi() is already called by RecordPlayback()
                }
                else
                {
                    Log($"PlayVideo: Skipping timeline update (navigating) - Index: {_timelineIndex}");
                }
                _isNavigatingTimeline = false;

                // Update Previous/Next button states
                PreviousButton.IsEnabled = _timelineIndex > 0;
                NextButton.IsEnabled = _timelineIndex < _playbackTimeline.Count - 1;
                Log($"PlayVideo: Previous button enabled: {PreviousButton.IsEnabled}, Next button enabled: {NextButton.IsEnabled}");

                // Initialize volume slider if first video
                if (VolumeSlider.Value == 100 && _mediaPlayer!.Volume == 0)
                {
                    Log("PlayVideo: Initializing volume slider (first video)");
                    _mediaPlayer.Volume = 100;
                    VolumeSlider.Value = 100;
                }

                // Apply saved mute state
                _mediaPlayer!.Mute = _isMuted;
                if (MuteButton != null)
                {
                    MuteButton.IsChecked = _isMuted;
                }
                Log($"PlayVideo: Applied saved mute state: {_isMuted}");

                // History is now tracked via LibraryItem.LastPlayedUtc (updated in RecordPlayback)

                // Note: UpdateCurrentFileStatsUi() is already called by RecordPlayback()
                // No need to call it again here
                
                Log("PlayVideo: Completed successfully");
            }
            catch (Exception ex)
            {
                Log($"PlayVideo: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"PlayVideo: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"PlayVideo: ERROR - Inner exception: {ex.InnerException.Message}");
                }
                StatusTextBlock.Text = "Failed to play video: " + ex.Message;
            }
        }

        private async void PlayRandomVideo()
        {
            await PlayRandomVideoAsync();
        }

        private async Task PlayRandomVideoAsync()
        {
            Log("PlayRandomVideoAsync: Starting random video selection");
            
            // Check if library system is available
            if (_libraryIndex == null || _libraryIndex.Items.Count == 0)
            {
                Log("PlayRandomVideoAsync: No library available - prompting user to import folder");
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    StatusTextBlock.Text = "Please import a folder first (Library → Import Folder).";
                });
                return;
            }

            Log($"PlayRandomVideoAsync: Using library system - {_libraryIndex.Items.Count} items available");

            string[] pool;
            bool needsRebuild = false;

            if (_noRepeatMode)
            {
                Log("PlayRandomVideoAsync: No-repeat mode is enabled");
                // Check queue count on UI thread to ensure thread safety
                int queueCount = await Dispatcher.UIThread.InvokeAsync(() => _playQueue.Count);
                Log($"PlayRandomVideoAsync: Current queue count: {queueCount}");

                if (queueCount == 0)
                {
                    needsRebuild = true;
                    Log("PlayRandomVideoAsync: Queue is empty - rebuilding queue");
                    // Show status only when actually rebuilding queue
                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        StatusTextBlock.Text = "Finding eligible media...";
                    });

                    // Rebuild queue asynchronously
                    await RebuildPlayQueueIfNeededAsync();

                    // Check again after rebuild
                    queueCount = await Dispatcher.UIThread.InvokeAsync(() => _playQueue.Count);
                    Log($"PlayRandomVideoAsync: Queue count after rebuild: {queueCount}");
                }

                if (queueCount > 0)
                {
                    // Queue has items - just pick one, no status message needed
                    var pick = await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        var oldCount = _playQueue.Count;
                        var picked = _playQueue.Dequeue();
                        Log($"STATE CHANGE: Queue item dequeued - Previous size: {oldCount}, New size: {_playQueue.Count}, Dequeued: {Path.GetFileName(picked)}");
                        return picked;
                    });
                    Log($"PlayRandomVideoAsync: Selected video from queue: {Path.GetFileName(pick)}");
                    await Dispatcher.UIThread.InvokeAsync(() => PlayVideo(pick));
                    return;
                }

                // Still no queue after rebuild - need to get pool directly (shouldn't happen normally)
                if (needsRebuild)
                {
                    Log("PlayRandomVideoAsync: Still no queue after rebuild - getting eligible pool directly");
                    pool = await GetEligiblePoolAsync();
                    Log($"PlayRandomVideoAsync: Eligible pool size: {pool.Length}");
                    if (pool.Length == 0)
                    {
                        Log("PlayRandomVideoAsync: No eligible media found");
                        await Dispatcher.UIThread.InvokeAsync(() =>
                        {
                            StatusTextBlock.Text = "No eligible media found. Check your filters or import a folder.";
                        });
                        return;
                    }
                    // Fall through to random selection
                }
                else
                {
                    // This shouldn't happen, but handle it
                    Log("PlayRandomVideoAsync: Unexpected state - getting eligible pool");
                    pool = await GetEligiblePoolAsync();
                    Log($"PlayRandomVideoAsync: Eligible pool size: {pool.Length}");
                }
            }
            else
            {
                Log("PlayRandomVideoAsync: No-repeat mode is disabled - getting eligible pool directly");
                // Direct random selection (no repeat mode off) - show status since we need to get pool
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    StatusTextBlock.Text = "Finding eligible media...";
                });
                pool = await GetEligiblePoolAsync();
                Log($"PlayRandomVideoAsync: Eligible pool size: {pool.Length}");
            }

            if (pool.Length == 0)
            {
                        Log("PlayRandomVideoAsync: No eligible media found in pool");
                        await Dispatcher.UIThread.InvokeAsync(() =>
                        {
                            StatusTextBlock.Text = "No eligible media found. Check your filters or import a folder.";
                        });
                return;
            }

            var randomIndex = _rng.Next(pool.Length);
            var randomPick = pool[randomIndex];
            Log($"PlayRandomVideoAsync: Randomly selected video {randomIndex + 1} of {pool.Length}: {Path.GetFileName(randomPick)}");
            await Dispatcher.UIThread.InvokeAsync(() => PlayVideo(randomPick));
        }

        #endregion

        #region Loop Toggle

        private void LoopToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // Update the loop flag
            _isLoopEnabled = LoopToggle.IsChecked == true;
            Log($"UI ACTION: LoopToggle changed to: {_isLoopEnabled}");
            
            // Persist the setting (unless we're applying settings from dialog)
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
            
            // If media is currently playing, update the input-repeat option
            // Note: This requires recreating the media, which may cause a brief reset
            if (_currentMedia != null && _mediaPlayer != null && _libVLC != null && _currentVideoPath != null)
            {
                try
                {
                    var wasPlaying = _mediaPlayer.IsPlaying;
                    var currentTime = _mediaPlayer.Time;
                    
                    // Stop current playback
                    _mediaPlayer.Stop();
                    
                    // Dispose current media
                    var mediaToDispose = _currentMedia;
                    _currentMedia = null;
                    mediaToDispose?.Dispose();
                    
                    // Create new media with updated loop option
                    _currentMedia = new Media(_libVLC, _currentVideoPath, FromType.FromPath);
                    
                    if (_isLoopEnabled)
                    {
                        _currentMedia.AddOption(":input-repeat=65535");
                    }
                    
                    // Parse and set media
                    _currentMedia.Parse();
                    UpdateAspectRatioFromTracks();
                    
                    // Set media and restore playback position
                    _mediaPlayer.Play(_currentMedia);
                    _mediaPlayer.Time = currentTime;
                    
                    // Restore playback state
                    if (wasPlaying)
                    {
                        PlayPauseButton.IsChecked = true;
                    }
                    else
                    {
                        _mediaPlayer.Pause();
                        PlayPauseButton.IsChecked = false;
                    }
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Failed to update loop setting: {ex.Message}";
                }
            }
        }

        #endregion

        #region View Preferences

        private class AppSettings
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
            public bool IsMuted { get; set; } = false; // Persist mute state
            public int VolumeLevel { get; set; } = 100; // Persist volume level (0-200)
            public bool NoRepeatMode { get; set; } = true;
            public int PhotoDisplayDurationSeconds { get; set; } = 5; // Photo display duration
            
            // Image scaling
            public ImageScalingMode ImageScalingMode { get; set; } = ImageScalingMode.Auto;
            public int FixedImageMaxWidth { get; set; } = 3840;
            public int FixedImageMaxHeight { get; set; } = 2160;
            
            // Missing file behavior
            public MissingFileBehavior MissingFileBehavior { get; set; } = MissingFileBehavior.AlwaysShowDialog;
            
            // Backup settings
            public bool BackupLibraryEnabled { get; set; } = true;
            public int MinimumBackupGapMinutes { get; set; } = 15;
            public int NumberOfBackups { get; set; } = 10;
            
            // Filter state
            public FilterState? FilterState { get; set; }
            
            // Filter presets
            public List<FilterPreset>? FilterPresets { get; set; }
            public string? ActivePresetName { get; set; } // Track which preset is currently active
        }

        // Static methods for dialog persistence (can be called from dialogs)
        public static void SaveDialogBounds(string dialogName, double x, double y, double width, double height)
        {
            try
            {
                var path = AppDataManager.GetSettingsPath();
                AppSettings settings;
                string? json;
                
                if (!File.Exists(path))
                {
                    Log($"SaveDialogBounds: Settings file not found at {path}, creating new settings");
                    settings = new AppSettings();
                }
                else
                {
                    json = File.ReadAllText(path);
                    settings = JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
                }

                if (dialogName == "ItemTagsDialog")
                {
                    settings.ItemTagsDialogX = x;
                    settings.ItemTagsDialogY = y;
                    settings.ItemTagsDialogWidth = width;
                    settings.ItemTagsDialogHeight = height;
                }
                else if (dialogName == "FilterDialog")
                {
                    settings.FilterDialogX = x;
                    settings.FilterDialogY = y;
                    settings.FilterDialogWidth = width;
                    settings.FilterDialogHeight = height;
                }

                json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(path, json);
                Log($"SaveDialogBounds: Saved bounds for {dialogName} - X={x}, Y={y}, W={width}, H={height}");
            }
            catch (Exception ex)
            {
                Log($"SaveDialogBounds: ERROR - {ex.Message}");
            }
        }

        public static (double? x, double? y, double? width, double? height) LoadDialogBounds(string dialogName)
        {
            try
            {
                var path = AppDataManager.GetSettingsPath();
                if (!File.Exists(path))
                {
                    Log($"LoadDialogBounds: Settings file not found at {path}");
                    return (null, null, null, null);
                }

                var json = File.ReadAllText(path);
                var settings = JsonSerializer.Deserialize<AppSettings>(json);
                
                if (settings == null)
                {
                    Log($"LoadDialogBounds: Failed to deserialize settings");
                    return (null, null, null, null);
                }

                if (dialogName == "ItemTagsDialog")
                {
                    Log($"LoadDialogBounds: Loaded ItemTagsDialog bounds - X={settings.ItemTagsDialogX}, Y={settings.ItemTagsDialogY}, W={settings.ItemTagsDialogWidth}, H={settings.ItemTagsDialogHeight}");
                    return (settings.ItemTagsDialogX, settings.ItemTagsDialogY, settings.ItemTagsDialogWidth, settings.ItemTagsDialogHeight);
                }
                else if (dialogName == "FilterDialog")
                {
                    Log($"LoadDialogBounds: Loaded FilterDialog bounds - X={settings.FilterDialogX}, Y={settings.FilterDialogY}, W={settings.FilterDialogWidth}, H={settings.FilterDialogHeight}");
                    return (settings.FilterDialogX, settings.FilterDialogY, settings.FilterDialogWidth, settings.FilterDialogHeight);
                }
            }
            catch (Exception ex)
            {
                Log($"LoadDialogBounds: ERROR - {ex.Message}");
            }
            
            return (null, null, null, null);
        }

        private void LoadSettings()
        {
            AppSettings? settings = null;
            
            // Try to load unified settings.json first
            try
            {
                var settingsPath = AppDataManager.GetSettingsPath();
                if (File.Exists(settingsPath))
                {
                    var json = File.ReadAllText(settingsPath);
                    settings = JsonSerializer.Deserialize<AppSettings>(json);
                }
            }
            catch
            {
                // If unified settings fail, try legacy files
            }
            
            // If unified settings don't exist or failed, try loading from legacy files and migrate
            if (settings == null)
            {
                settings = new AppSettings();
                MigrateLegacySettings(settings);
            }
            
            // Apply view preferences from settings
            _showMenu = settings.ShowMenu;
            _showStatusLine = settings.ShowStatusLine;
            _showControls = settings.ShowControls;
            _showLibraryPanel = settings.ShowLibraryPanel;
            _showStatsPanel = settings.ShowStatsPanel;
            _alwaysOnTop = settings.AlwaysOnTop;
            _isPlayerViewMode = settings.IsPlayerViewMode;
            _rememberLastFolder = settings.RememberLastFolder;
            _lastFolderPath = settings.LastFolderPath;
            
            // Set WindowStartupLocation to Manual if we have a saved position
            // This MUST be set before the window is shown
            if (settings.WindowX.HasValue && settings.WindowY.HasValue)
            {
                WindowStartupLocation = WindowStartupLocation.Manual;
                var restoredPosition = new PixelPoint((int)settings.WindowX.Value, (int)settings.WindowY.Value);
                Position = restoredPosition;
                _lastKnownPosition = restoredPosition; // Track it ourselves since Position property doesn't always work
                Log($"LoadSettings: Set WindowStartupLocation to Manual");
                Log($"LoadSettings: Restored position from settings - WindowX={settings.WindowX.Value}, WindowY={settings.WindowY.Value}");
                Log($"LoadSettings: Set Position to ({restoredPosition.X}, {restoredPosition.Y}), tracking as _lastKnownPosition");
            }
            else
            {
                Log($"LoadSettings: No saved position found (WindowX={settings.WindowX}, WindowY={settings.WindowY}), using default positioning");
            }
            
            // Apply window size
            if (settings.WindowWidth.HasValue && settings.WindowHeight.HasValue)
            {
                Width = settings.WindowWidth.Value;
                Height = settings.WindowHeight.Value;
                Log($"LoadSettings: Set window size to {Width}x{Height}");
            }
            
            // Restore window state (normal, minimized, maximized, fullscreen)
            // Note: We intentionally don't restore Minimized state (1) to avoid starting hidden
            if (settings.WindowState == 2) // Maximized
            {
                WindowState = WindowState.Maximized;
                Log("LoadSettings: Set window state to Maximized");
            }
            else if (settings.WindowState == 3) // FullScreen
            {
                WindowState = WindowState.FullScreen;
                Log("LoadSettings: Set window state to FullScreen");
            }
            else // Normal (0) or Minimized (1, but we restore as Normal)
            {
                WindowState = WindowState.Normal;
                Log($"LoadSettings: Set window state to Normal (saved state was {settings.WindowState})");
            }
            
            // Restore library panel width (ApplyViewPreferences will apply it when showing the panel)
            if (settings.LibraryPanelWidth.HasValue && settings.LibraryPanelWidth.Value >= 400)
            {
                _libraryPanelWidth = settings.LibraryPanelWidth.Value;
                Log($"LoadSettings: Initialized library panel width to {_libraryPanelWidth}");
            }
            else
            {
                Log($"LoadSettings: Using default library panel width: {_libraryPanelWidth}");
            }
            
            // Apply playback settings
            _seekStep = settings.SeekStep ?? "5s";
            _volumeStep = settings.VolumeStep != 0 ? settings.VolumeStep : 5;
            if (settings.IntervalSeconds.HasValue && IntervalNumericUpDown != null)
            {
                // Validate interval is within reasonable bounds (1-3600 seconds)
                var interval = settings.IntervalSeconds.Value;
                if (interval >= 1 && interval <= 3600)
                {
                    IntervalNumericUpDown.Value = (int)interval;
                }
            }
            _volumeNormalizationEnabled = settings.VolumeNormalizationEnabled;
            _maxReductionDb = settings.MaxReductionDb;
            _maxBoostDb = settings.MaxBoostDb;
            _baselineAutoMode = settings.BaselineAutoMode;
            _baselineOverrideLUFS = settings.BaselineOverrideLUFS;
            _audioFilterMode = settings.AudioFilterMode;
            
            // Apply playback preferences (now persisted)
            _isLoopEnabled = settings.LoopEnabled;
            _autoPlayNext = settings.AutoPlayNext;
            _isMuted = settings.IsMuted;
            _userVolumePreference = settings.VolumeLevel; // Restore saved volume level
            
            // Initialize _lastNonZeroVolume from saved volume for proper unmute behavior
            if (settings.VolumeLevel > 0)
            {
                _lastNonZeroVolume = settings.VolumeLevel;
            }
            
            _noRepeatMode = settings.NoRepeatMode;
            _photoDisplayDurationSeconds = settings.PhotoDisplayDurationSeconds > 0 ? settings.PhotoDisplayDurationSeconds : 5; // Default to 5 if invalid
            Log($"LoadSettings: Restored photo display duration: {_photoDisplayDurationSeconds} seconds");
            
            // Load image scaling settings
            _imageScalingMode = settings.ImageScalingMode;
            _fixedImageMaxWidth = settings.FixedImageMaxWidth > 0 ? settings.FixedImageMaxWidth : 3840;
            _fixedImageMaxHeight = settings.FixedImageMaxHeight > 0 ? settings.FixedImageMaxHeight : 2160;
            Log($"LoadSettings: Restored image scaling - Mode: {_imageScalingMode}, FixedMax: {_fixedImageMaxWidth}x{_fixedImageMaxHeight}");
            
            // Load missing file behavior setting
            _missingFileBehavior = settings.MissingFileBehavior;
            Log($"LoadSettings: Restored missing file behavior: {_missingFileBehavior}");
            
            // Load backup settings
            _backupLibraryEnabled = settings.BackupLibraryEnabled;
            _minimumBackupGapMinutes = settings.MinimumBackupGapMinutes > 0 ? settings.MinimumBackupGapMinutes : 15;
            _numberOfBackups = settings.NumberOfBackups > 0 ? settings.NumberOfBackups : 10;
            Log($"LoadSettings: Restored backup settings - Enabled: {_backupLibraryEnabled}, MinGap: {_minimumBackupGapMinutes} minutes, Count: {_numberOfBackups}");
            
            // Bug fix: Initialize _lastNonZeroVolume with saved volume level
            // This ensures unmuting restores the correct volume, not the default (100)
            if (_userVolumePreference > 0)
            {
                _lastNonZeroVolume = _userVolumePreference;
            }
            
            // Sync UI controls with loaded settings
            if (LoopToggle != null)
            {
                LoopToggle.IsChecked = _isLoopEnabled;
            }
            if (AutoPlayNextCheckBox != null)
            {
                AutoPlayNextCheckBox.IsChecked = _autoPlayNext;
            }
            if (NoRepeatMenuItem != null)
            {
                NoRepeatMenuItem.IsChecked = _noRepeatMode;
            }
            
            // Apply muted state when media player is ready
            if (_mediaPlayer != null)
            {
                _mediaPlayer.Mute = _isMuted;
                if (MuteButton != null)
                {
                    MuteButton.IsChecked = _isMuted;
                }
            }
            
            Log($"LoadSettings: Restored playback preferences - Loop={_isLoopEnabled}, AutoPlay={_autoPlayNext}, Muted={_isMuted}, NoRepeat={_noRepeatMode}");
            
            // Apply filter state
            var previousFilterState = _currentFilterState;
            _currentFilterState = settings.FilterState ?? new FilterState();
            if (previousFilterState != _currentFilterState)
            {
                Log($"STATE CHANGE: Filter state loaded from settings - FavoritesOnly={_currentFilterState.FavoritesOnly}, ExcludeBlacklisted={_currentFilterState.ExcludeBlacklisted}, AudioFilter={_currentFilterState.AudioFilter}");
            }
            
            // Load filter presets and active preset name
            _filterPresets = settings.FilterPresets;
            _activePresetName = settings.ActivePresetName;
            Log($"LoadSettings: Loaded {_filterPresets?.Count ?? 0} filter presets, active preset name: {_activePresetName ?? "None"}");
            
            // Update filter summary after loading (to show preset name if active)
            UpdateFilterSummaryText();
            
            // Apply always on top after loading
            this.Topmost = _alwaysOnTop;
            if (AlwaysOnTopMenuItem != null)
            {
                AlwaysOnTopMenuItem.IsChecked = _alwaysOnTop;
            }
            
            // Apply menu visibility after loading
            if (MainMenu != null)
            {
                MainMenu.IsVisible = _showMenu && !_isPlayerViewMode;
            }
            if (ShowMenuMenuItem != null)
            {
                ShowMenuMenuItem.IsChecked = _showMenu;
            }
            
            // If player view mode was saved as true, we need to:
            // 1. The loaded _show* values represent the state before entering player view mode
            // 2. Copy them to _saved* fields so we can restore them later
            // 3. Then apply player view mode (which will hide everything)
            if (_isPlayerViewMode)
            {
                _savedShowStatusLine = _showStatusLine;
                _savedShowControls = _showControls;
                _savedShowLibraryPanel = _showLibraryPanel;
                _savedShowStatsPanel = _showStatsPanel;
                // Now ApplyPlayerViewMode will set _show* to false and hide everything
                ApplyPlayerViewMode();
            }
        }
        
        /// <summary>
        /// Migrates legacy settings files (view_prefs.json and playback_settings.json) into the unified settings structure.
        /// </summary>
        private void MigrateLegacySettings(AppSettings settings)
        {
            // Load view preferences from legacy file
            try
            {
                var viewPrefsPath = AppDataManager.GetViewPreferencesPath();
                if (File.Exists(viewPrefsPath))
                {
                    var json = File.ReadAllText(viewPrefsPath);
                    var jsonDoc = JsonDocument.Parse(json);
                    var root = jsonDoc.RootElement;
                    
                    if (root.TryGetProperty("ShowMenu", out var showMenu))
                        settings.ShowMenu = showMenu.GetBoolean();
                    if (root.TryGetProperty("ShowStatusLine", out var showStatus))
                        settings.ShowStatusLine = showStatus.GetBoolean();
                    if (root.TryGetProperty("ShowControls", out var showControls))
                        settings.ShowControls = showControls.GetBoolean();
                    
                    // Handle migration from old panel flags to Library panel
                    bool hasLibraryPanel = root.TryGetProperty("ShowLibraryPanel", out var showLibrary);
                    if (hasLibraryPanel)
                    {
                        settings.ShowLibraryPanel = showLibrary.GetBoolean();
                    }
                    else
                    {
                        // Migrate from old panel flags - if any old panel was shown, show Library panel
                        bool hadOldPanel = false;
                        if (root.TryGetProperty("ShowBlacklistPanel", out var showBlacklist))
                            hadOldPanel = hadOldPanel || showBlacklist.GetBoolean();
                        if (root.TryGetProperty("ShowFavoritesPanel", out var showFavorites))
                            hadOldPanel = hadOldPanel || showFavorites.GetBoolean();
                        if (root.TryGetProperty("ShowRecentlyPlayedPanel", out var showRecent))
                            hadOldPanel = hadOldPanel || showRecent.GetBoolean();
                        settings.ShowLibraryPanel = hadOldPanel;
                    }
                    
                    if (root.TryGetProperty("ShowStatsPanel", out var showStats))
                        settings.ShowStatsPanel = showStats.GetBoolean();
                    if (root.TryGetProperty("AlwaysOnTop", out var alwaysOnTop))
                        settings.AlwaysOnTop = alwaysOnTop.GetBoolean();
                    if (root.TryGetProperty("IsPlayerViewMode", out var playerMode))
                        settings.IsPlayerViewMode = playerMode.GetBoolean();
                    if (root.TryGetProperty("RememberLastFolder", out var remember))
                        settings.RememberLastFolder = remember.GetBoolean();
                    if (root.TryGetProperty("LastFolderPath", out var lastPath))
                        settings.LastFolderPath = lastPath.GetString();
                }
            }
            catch
            {
                // Ignore errors loading legacy view prefs
            }
            
            // Load playback settings from legacy file
            try
            {
                var playbackSettingsPath = AppDataManager.GetPlaybackSettingsPath();
                if (File.Exists(playbackSettingsPath))
                {
                    var json = File.ReadAllText(playbackSettingsPath);
                    var playbackSettings = JsonSerializer.Deserialize<PlaybackSettings>(json);
                    if (playbackSettings != null)
                    {
                        if (!string.IsNullOrEmpty(playbackSettings.SeekStep))
                            settings.SeekStep = playbackSettings.SeekStep;
                        if (playbackSettings.VolumeStep != 0)
                            settings.VolumeStep = playbackSettings.VolumeStep;
                        if (playbackSettings.IntervalSeconds.HasValue)
                            settings.IntervalSeconds = playbackSettings.IntervalSeconds;
                        settings.VolumeNormalizationEnabled = playbackSettings.VolumeNormalizationEnabled;
                        settings.AudioFilterMode = playbackSettings.AudioFilterMode;
                    }
                }
            }
            catch
            {
                // Ignore errors loading legacy playback settings
            }
            
            // Load filter state from legacy file
            try
            {
                var filterStatePath = AppDataManager.GetFilterStatePath();
                if (File.Exists(filterStatePath))
                {
                    var json = File.ReadAllText(filterStatePath);
                    var filterState = JsonSerializer.Deserialize<FilterState>(json);
                    if (filterState != null)
                    {
                        settings.FilterState = filterState;
                    }
                }
            }
            catch
            {
                // Ignore errors loading legacy filter state
            }
            
            // Save unified settings after migration
            try
            {
                var settingsPath = AppDataManager.GetSettingsPath();
                var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(settingsPath, json);
            }
            catch
            {
                // Ignore save errors during migration
            }
        }

        private void SaveSettings()
        {
            // Capture UI value on UI thread
            var intervalValue = IntervalNumericUpDown?.Value;
            SaveSettingsInternal(intervalValue);
        }

        private void SaveSettingsInternal(decimal? intervalValue = null)
        {
            try
            {
                Log("SaveSettings: Starting save operation...");
                var path = AppDataManager.GetSettingsPath();
                Log($"SaveSettings: Path = {path}");
                
                Log($"SaveSettings: Using intervalValue = {intervalValue}");
                
                // Capture current library panel width if visible and resized
                if (_showLibraryPanel && MainContentGrid?.ColumnDefinitions.Count > 0)
                {
                    var currentWidth = MainContentGrid.ColumnDefinitions[0].Width;
                    if (currentWidth.IsAbsolute && currentWidth.Value >= 400)
                    {
                        _libraryPanelWidth = currentWidth.Value;
                        Log($"SaveSettings: Captured current library panel width from column: {_libraryPanelWidth}");
                    }
                }
                
                // Load existing settings to preserve dialog bounds and other fields
                AppSettings settings;
                if (File.Exists(path))
                {
                    try
                    {
                        var existingJson = File.ReadAllText(path);
                        settings = JsonSerializer.Deserialize<AppSettings>(existingJson) ?? new AppSettings();
                        Log("SaveSettings: Loaded existing settings file to preserve dialog bounds");
                    }
                    catch (Exception ex)
                    {
                        Log($"SaveSettings: Failed to load existing settings ({ex.Message}), creating new");
                        settings = new AppSettings();
                    }
                }
                else
                {
                    settings = new AppSettings();
                    Log("SaveSettings: No existing settings file, creating new");
                }
                
                // Update MainWindow-managed fields (preserve dialog bounds from existing settings)
                // View preferences
                settings.ShowMenu = _showMenu;
                settings.ShowStatusLine = _isPlayerViewMode ? _savedShowStatusLine : _showStatusLine;
                settings.ShowControls = _isPlayerViewMode ? _savedShowControls : _showControls;
                settings.ShowLibraryPanel = _isPlayerViewMode ? _savedShowLibraryPanel : _showLibraryPanel;
                settings.ShowStatsPanel = _isPlayerViewMode ? _savedShowStatsPanel : _showStatsPanel;
                settings.AlwaysOnTop = _alwaysOnTop;
                settings.IsPlayerViewMode = _isPlayerViewMode;
                settings.RememberLastFolder = _rememberLastFolder;
                settings.LastFolderPath = _lastFolderPath;
                
                // Window state (use _lastKnownPosition since Position property doesn't always update)
                settings.WindowX = (double)_lastKnownPosition.X;
                settings.WindowY = (double)_lastKnownPosition.Y;
                settings.WindowWidth = Width;
                settings.WindowHeight = Height;
                settings.WindowState = (int)WindowState; // 0=Normal, 1=Minimized, 2=Maximized, 3=FullScreen
                settings.LibraryPanelWidth = _libraryPanelWidth;
                
                // Playback settings
                settings.SeekStep = _seekStep;
                settings.VolumeStep = _volumeStep;
                settings.IntervalSeconds = intervalValue.HasValue ? (double?)intervalValue.Value : null;
                settings.VolumeNormalizationEnabled = _volumeNormalizationEnabled;
                settings.MaxReductionDb = _maxReductionDb;
                settings.MaxBoostDb = _maxBoostDb;
                settings.BaselineAutoMode = _baselineAutoMode;
                settings.BaselineOverrideLUFS = _baselineOverrideLUFS;
                settings.AudioFilterMode = _audioFilterMode;
                
                // Playback preferences (now persisted)
                settings.LoopEnabled = _isLoopEnabled;
                settings.AutoPlayNext = _autoPlayNext;
                settings.IsMuted = _isMuted; // Save our tracked mute state
                settings.VolumeLevel = _isMuted ? _lastNonZeroVolume : _userVolumePreference; // Save last non-zero volume when muted
                settings.NoRepeatMode = _noRepeatMode;
                settings.PhotoDisplayDurationSeconds = _photoDisplayDurationSeconds;
                
                // Image scaling
                settings.ImageScalingMode = _imageScalingMode;
                settings.FixedImageMaxWidth = _fixedImageMaxWidth;
                settings.FixedImageMaxHeight = _fixedImageMaxHeight;
                
                // Missing file behavior
                settings.MissingFileBehavior = _missingFileBehavior;
                
                // Backup settings
                settings.BackupLibraryEnabled = _backupLibraryEnabled;
                settings.MinimumBackupGapMinutes = _minimumBackupGapMinutes;
                settings.NumberOfBackups = _numberOfBackups;
                
                // Filter state (always save an object, never null)
                settings.FilterState = _currentFilterState ?? new FilterState();
                
                // Filter presets
                settings.FilterPresets = _filterPresets;
                settings.ActivePresetName = _activePresetName;
                
                // Dialog bounds are preserved from existing settings (not updated here)
                
                Log($"SaveSettings: Window position - Position.X={Position.X}, _lastKnownPosition=({_lastKnownPosition.X}, {_lastKnownPosition.Y}), saved as WindowX={settings.WindowX}, WindowY={settings.WindowY}");
                Log($"SaveSettings: Window size - Width={Width}, Height={Height}, WindowState={(WindowState)settings.WindowState}");
                Log($"SaveSettings: Library panel width={settings.LibraryPanelWidth}");
                Log($"SaveSettings: Photo display duration: {_photoDisplayDurationSeconds} seconds");
                Log($"SaveSettings: Created AppSettings object. FilterState is null: {settings.FilterState == null}");
                if (settings.FilterState != null)
                {
                    Log($"SaveSettings: FilterState details - FavoritesOnly: {settings.FilterState.FavoritesOnly}, ExcludeBlacklisted: {settings.FilterState.ExcludeBlacklisted}, AudioFilter: {settings.FilterState.AudioFilter}");
                }
                
                Log("SaveSettings: Serializing to JSON...");
                var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                Log($"SaveSettings: JSON length = {json.Length} characters");
                
                Log("SaveSettings: Writing to file...");
                File.WriteAllText(path, json);
                Log($"SaveSettings: Successfully saved settings to {path}");
            }
            catch (Exception ex)
            {
                Log($"SaveSettings: ERROR - Exception type: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"SaveSettings: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"SaveSettings: ERROR - Inner exception: {ex.InnerException.Message}");
                }
            }
        }

        private void ApplyViewPreferences()
        {
            // If player view mode is active, hide everything except video
            if (_isPlayerViewMode)
            {
                // Hide menu bar
                if (MainMenu != null)
                {
                    MainMenu.IsVisible = false;
                }
                
                // Hide all UI elements except video
                StatusLineGrid.IsVisible = false;
                ControlsRow.IsVisible = false;
                
                // Hide all panels
                if (MainContentGrid != null)
                {
                    var columns = MainContentGrid.ColumnDefinitions;
                    if (columns.Count >= 4)
                    {
                        LibraryPanelContainer.IsVisible = false;
                        columns[0].MinWidth = 0;  // Remove MinWidth constraint to allow collapse
                        columns[0].Width = new GridLength(0);
                        LibraryVideoSplitter.IsVisible = false;
                        columns[1].Width = new GridLength(0);
                        // Column 2: Video View (always visible)
                        StatsPanelContainer.IsVisible = false;
                        columns[3].Width = new GridLength(0);
                    }
                }
                
                // Update menu item checked states (but they won't be visible)
                ShowStatusMenuItem.IsChecked = false;
                ShowControlsMenuItem.IsChecked = false;
                ShowLibraryPanelMenuItem.IsChecked = false;
                ShowStatsMenuItem.IsChecked = false;
                
                return; // Exit early, don't apply normal visibility logic
            }
            
            // Normal view mode - show menu bar based on _showMenu
            if (MainMenu != null)
            {
                MainMenu.IsVisible = _showMenu;
            }
            
            StatusLineGrid.IsVisible = _showStatusLine;
            ControlsRow.IsVisible = _showControls;
            
            // Show top border on MainContentGrid only when there's a visible row above it
            if (MainContentGridBorder != null)
            {
                bool hasVisibleRowAbove = _showStatusLine || _showControls;
                MainContentGridBorder.BorderThickness = hasVisibleRowAbove ? new Avalonia.Thickness(0, 1, 0, 0) : new Avalonia.Thickness(0);
            }

            // Update panel visibility
            // Note: We need to set column widths to 0 when panels are hidden to properly collapse columns
            if (MainContentGrid != null)
            {
                var columns = MainContentGrid.ColumnDefinitions;
                if (columns.Count >= 4)
                {
                    // Column 0: Library Panel
                    if (_showLibraryPanel)
                    {
                        // Showing panel - restore saved width and MinWidth constraint
                        LibraryPanelContainer.IsVisible = true;
                        columns[0].MinWidth = 400;
                        columns[0].Width = new GridLength(_libraryPanelWidth);
                    }
                    else
                    {
                        // Hiding panel - first capture current width if it's a valid size
                        if (columns[0].Width.IsAbsolute && columns[0].Width.Value >= 400)
                        {
                            _libraryPanelWidth = columns[0].Width.Value;
                            Log($"ApplyViewPreferences: Captured library panel width before hiding: {_libraryPanelWidth}");
                        }
                        LibraryPanelContainer.IsVisible = false;
                        columns[0].MinWidth = 0;  // Remove MinWidth constraint to allow collapse
                        columns[0].Width = new GridLength(0);
                    }
                    
                    // Column 1: Splitter between Library and Video
                    LibraryVideoSplitter.IsVisible = _showLibraryPanel;
                    columns[1].Width = _showLibraryPanel ? new GridLength(4) : new GridLength(0);

                    // Column 2: Video View (always visible, star sized)
                    // No change needed

                    // Column 3: Stats Panel (fixed width, not resizable)
                    StatsPanelContainer.IsVisible = _showStatsPanel;
                    columns[3].Width = _showStatsPanel ? GridLength.Auto : new GridLength(0);
                }
            }
            
            // Update border visibility
            if (LibraryPanelContainer != null)
            {
                LibraryPanelContainer.BorderThickness = new Avalonia.Thickness(0, 0, 1, 0);
            }
            if (StatsPanelContainer != null)
            {
                StatsPanelContainer.BorderThickness = new Avalonia.Thickness(0);
            }

            // Update menu item checked states
            ShowMenuMenuItem.IsChecked = _showMenu;
            ShowStatusMenuItem.IsChecked = _showStatusLine;
            ShowControlsMenuItem.IsChecked = _showControls;
            ShowLibraryPanelMenuItem.IsChecked = _showLibraryPanel;
            ShowStatsMenuItem.IsChecked = _showStatsPanel;
        }

        private void ApplyPlayerViewMode()
        {
            if (_isPlayerViewMode)
            {
                // Entering player view mode - save current state
                var oldStatusLine = _showStatusLine;
                var oldControls = _showControls;
                var oldLibraryPanel = _showLibraryPanel;
                var oldStatsPanel = _showStatsPanel;
                
                _savedShowStatusLine = _showStatusLine;
                _savedShowControls = _showControls;
                _savedShowLibraryPanel = _showLibraryPanel;
                _savedShowStatsPanel = _showStatsPanel;
                
                // Hide everything (ApplyViewPreferences will handle the actual hiding)
                // But we need to set flags to false so ApplyViewPreferences knows what to do
                _showStatusLine = false;
                _showControls = false;
                _showLibraryPanel = false;
                _showStatsPanel = false;
                
                Log($"STATE CHANGE: Entering player view mode - Saved states: StatusLine={oldStatusLine}, Controls={oldControls}, LibraryPanel={oldLibraryPanel}, StatsPanel={oldStatsPanel}");
                
                // Update window size tracking for aspect ratio locking
                _lastWindowSize = new Size(this.Width, this.Height);
            }
            else
            {
                // Exiting player view mode - restore saved state
                var oldStatusLine = _showStatusLine;
                var oldControls = _showControls;
                var oldLibraryPanel = _showLibraryPanel;
                var oldStatsPanel = _showStatsPanel;
                
                _showStatusLine = _savedShowStatusLine;
                _showControls = _savedShowControls;
                _showLibraryPanel = _savedShowLibraryPanel;
                _showStatsPanel = _savedShowStatsPanel;
                
                Log($"STATE CHANGE: Exiting player view mode - Restored states: StatusLine={oldStatusLine} -> {_showStatusLine}, Controls={oldControls} -> {_showControls}, LibraryPanel={oldLibraryPanel} -> {_showLibraryPanel}, StatsPanel={oldStatsPanel} -> {_showStatsPanel}");
            }
            
            // Apply the visibility changes
            ApplyViewPreferences();
        }

        private void UpdateAspectRatioFromTracks()
        {
            if (_currentMedia == null)
                return;
                
            var tracks = _currentMedia.Tracks;
            if (tracks != null)
            {
                foreach (var track in tracks)
                {
                    if (track.TrackType == TrackType.Video && track.Data.Video.Width > 0 && track.Data.Video.Height > 0)
                    {
                        // Guard against zero height
                        var height = track.Data.Video.Height;
                        if (height > 0)
                        {
                            _currentVideoAspectRatio = (double)track.Data.Video.Width / height;
                            _hasValidAspectRatio = true;
                            return;
                        }
                    }
                }
            }
            // If no valid track found, keep previous aspect ratio (don't reset _hasValidAspectRatio)
        }

        private void Window_SizeChanged(object? sender, SizeChangedEventArgs e)
        {
            // Only enforce aspect ratio in Player view mode when we have valid aspect ratio
            if (!_isPlayerViewMode || _isAdjustingSize || !_hasValidAspectRatio)
                return;
            
            var newSize = e.NewSize;
            var deltaWidth = Math.Abs(newSize.Width - _lastWindowSize.Width);
            var deltaHeight = Math.Abs(newSize.Height - _lastWindowSize.Height);
            
            // Determine which dimension changed more (user's intent)
            double newWidth, newHeight;
            if (deltaWidth >= deltaHeight)
            {
                // Width is driver
                newWidth = newSize.Width;
                newHeight = newWidth / _currentVideoAspectRatio;
            }
            else
            {
                // Height is driver
                newHeight = newSize.Height;
                newWidth = newHeight * _currentVideoAspectRatio;
            }
            
            // Clamp to minimum size (respect existing MinWidth/MinHeight if set, otherwise use 320x180)
            var minWidth = this.MinWidth > 0 ? this.MinWidth : 320.0;
            var minHeight = this.MinHeight > 0 ? this.MinHeight : 180.0;
            
            if (newWidth < minWidth)
            {
                newWidth = minWidth;
                newHeight = newWidth / _currentVideoAspectRatio;
            }
            if (newHeight < minHeight)
            {
                newHeight = minHeight;
                newWidth = newHeight * _currentVideoAspectRatio;
            }
            
            _isAdjustingSize = true;
            this.Width = newWidth;
            this.Height = newHeight;
            _isAdjustingSize = false;
            
            _lastWindowSize = new Size(this.Width, this.Height);
        }

        #endregion

        #region UI Event Handlers

        // Browse_Click method removed - users should use "Library → Import Folder..." menu item instead

        private async void ImportFolderMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ImportFolderMenuItem clicked");
            var options = new FolderPickerOpenOptions
            {
                Title = "Import Folder to Library"
            };

            // Suggest last imported folder or last folder path if available
            if (!string.IsNullOrWhiteSpace(_lastFolderPath) && Directory.Exists(_lastFolderPath))
            {
                try
                {
                    var lastFolder = await StorageProvider.TryGetFolderFromPathAsync(_lastFolderPath);
                    if (lastFolder != null)
                    {
                        options.SuggestedStartLocation = lastFolder;
                    }
                }
                catch (Exception ex)
                {
                    Log($"ImportFolderMenuItem_Click: ERROR getting StorageFolder - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                    Log($"ImportFolderMenuItem_Click: ERROR - Stack trace: {ex.StackTrace}");
                    if (ex.InnerException != null)
                    {
                        Log($"ImportFolderMenuItem_Click: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                    }
                    // If we can't get the folder, just continue without suggested location
                }
            }

            var result = await StorageProvider.OpenFolderPickerAsync(options);
            if (result.Count > 0 && result[0] != null)
            {
                var path = result[0].Path.LocalPath;
                Log($"UI ACTION: ImportFolder folder selected: {path}");
                try
                {
                    StatusTextBlock.Text = "Importing folder...";
                    
                    // Import the folder with folder name as default display name
                    var folderName = Path.GetFileName(path);
                    int importedCount = _libraryService.ImportFolder(path, folderName);
                    Log($"UI ACTION: ImportFolder completed, imported {importedCount} items with source name '{folderName}'");
                    
                    // Save the library
                    _libraryService.SaveLibrary();
                    
                    // Update library index reference
                    _libraryIndex = _libraryService.LibraryIndex;
                    
                    // Update Library panel UI
                    UpdateLibrarySourceComboBox();
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    
                    // Update library info text
                    UpdateLibraryInfoText();
                    
                    // Show success message with source name
                    var source = _libraryIndex?.Sources.FirstOrDefault(s => 
                        string.Equals(s.RootPath, path, StringComparison.OrdinalIgnoreCase));
                    var sourceName = source?.DisplayName ?? Path.GetFileName(path) ?? path;
                    StatusTextBlock.Text = $"Imported {importedCount} files from {sourceName}";
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Error importing folder: {ex.Message}";
                }
            }
        }

        private void PlayRandom_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: PlayRandom button clicked");
            // If Keep Playing is active, reset the timer
            if (_isKeepPlayingActive && _autoPlayTimer != null)
            {
                Log("  Keep Playing is active, resetting timer");
                _autoPlayTimer.Stop();
                var intervalSeconds = (double)(IntervalNumericUpDown.Value ?? 60);
                _autoPlayTimer.Interval = intervalSeconds * 1000;
                _autoPlayTimer.Start();
            }

            PlayRandomVideo();
        }

        private void ShowCurrentVideoInFileManager_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ShowCurrentVideoInFileManager clicked");
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("  No current video path");
                StatusTextBlock.Text = "No video loaded.";
                return;
            }
            OpenFileLocation(_currentVideoPath);
        }

        private void KeepPlaying_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _isKeepPlayingActive = !_isKeepPlayingActive;
            Log($"UI ACTION: KeepPlaying toggled to: {_isKeepPlayingActive}");
            KeepPlayingMenuItem.IsChecked = _isKeepPlayingActive;

            if (_isKeepPlayingActive)
            {
                Log("  Enabling Keep Playing mode");
                // Enable Keep Playing
                KeepPlayingButton.Content = "Stop Playing";
                
                // Disable the interval control while active
                IntervalNumericUpDown.IsEnabled = false;

                // Play a video immediately
                PlayRandomVideo();

                // Start the timer
                var intervalSeconds = (double)(IntervalNumericUpDown.Value ?? 60);
                Log($"  Starting auto-play timer with interval: {intervalSeconds} seconds");
                if (_autoPlayTimer == null)
                {
                    _autoPlayTimer = new System.Timers.Timer(intervalSeconds * 1000);
                    _autoPlayTimer.Elapsed += AutoPlayTimer_Elapsed;
                    _autoPlayTimer.AutoReset = true;
                }
                else
                {
                    _autoPlayTimer.Interval = intervalSeconds * 1000;
                }
                _autoPlayTimer.Start();
            }
            else
            {
                Log("  Disabling Keep Playing mode");
                // Disable Keep Playing
                KeepPlayingButton.Content = "Keep Playing";
                
                // Re-enable the interval control
                IntervalNumericUpDown.IsEnabled = true;

                // Stop the timer
                if (_autoPlayTimer != null)
                {
                    _autoPlayTimer.Stop();
                }
            }
        }

        private void AutoPlayTimer_Elapsed(object? sender, ElapsedEventArgs e)
        {
            if (_isKeepPlayingActive)
            {
                Log("AutoPlayTimer_Elapsed: Timer fired, playing random video");
                // Use Avalonia's dispatcher to ensure UI updates happen on the UI thread
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    PlayRandomVideo();
                });
            }
        }

        private void BlacklistCurrentVideo_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: BlacklistCurrentVideo clicked (delegating to BlacklistToggle)");
            // Toggle button now drives this; keep for safety if invoked elsewhere
            BlacklistToggle.IsChecked = true;
        }


        private void ShowMenuMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showMenu = ShowMenuMenuItem.IsChecked == true;
            Log($"UI ACTION: ShowMenuMenuItem clicked, setting show menu to: {_showMenu}");
            SaveSettings();
            ApplyViewPreferences();
        }


        private void ShowStatusMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showStatusLine = ShowStatusMenuItem.IsChecked == true;
            Log($"UI ACTION: ShowStatusMenuItem clicked, setting show status to: {_showStatusLine}");
            SaveSettings();
            ApplyViewPreferences();
        }

        private void ShowControlsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _showControls = ShowControlsMenuItem.IsChecked == true;
            Log($"UI ACTION: ShowControlsMenuItem clicked, setting show controls to: {_showControls}");
            SaveSettings();
            ApplyViewPreferences();
        }

        // Old panel menu handlers removed - panels are now unified in Library panel

        private void ShowStatsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var oldValue = _showStatsPanel;
            _showStatsPanel = ShowStatsMenuItem.IsChecked == true;
            Log($"UI ACTION: ShowStatsMenuItem clicked, setting show stats to: {_showStatsPanel}");
            if (oldValue != _showStatsPanel)
            {
                Log($"STATE CHANGE: Stats panel visibility changed - Previous: {oldValue}, New: {_showStatsPanel}");
            }
            SaveSettings();
            ApplyViewPreferences();
        }

        private async void ClearPlaybackStats_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ClearPlaybackStats clicked, showing confirmation dialog");
            var dialog = new Window
            {
                Title = "Clear playback stats",
                Width = 400,
                Height = 180,
                CanResize = false,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var message = new TextBlock
            {
                Text = "Clear all playback statistics? This will reset play counts and last-played times for all videos, but will not change favorites, blacklist, history, or duration data.",
                TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                Margin = new Thickness(12)
            };

            var ok = new Button { Content = "OK", MinWidth = 80, Margin = new Thickness(0, 0, 8, 0) };
            var cancel = new Button { Content = "Cancel", MinWidth = 80 };

            ok.Click += (_, __) => dialog.Close(true);
            cancel.Click += (_, __) => dialog.Close(false);

            dialog.Content = new StackPanel
            {
                Margin = new Thickness(12),
                Children =
                {
                    message,
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                        Margin = new Thickness(0, 12, 0, 0),
                        Children = { ok, cancel }
                    }
                }
            };

            var result = await dialog.ShowDialog<bool?>(this);
            if (result == true)
            {
                Log("UI ACTION: ClearPlaybackStats confirmed, clearing stats");
                // Clear playback stats from library items
                if (_libraryIndex != null)
                {
                    int cleared = 0;
                    foreach (var item in _libraryIndex.Items.ToList())
                    {
                        if (item.PlayCount > 0 || item.LastPlayedUtc.HasValue)
                        {
                            item.PlayCount = 0;
                            item.LastPlayedUtc = null;
                            _libraryService.UpdateItem(item);
                            cleared++;
                        }
                    }
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            _libraryService.SaveLibrary();
                        }
                        catch (Exception ex)
                        {
                            Log($"Error saving library after clearing playback stats: {ex.Message}");
                        }
                    });
                    Log($"UI ACTION: ClearPlaybackStats completed, cleared {cleared} items");
                    StatusTextBlock.Text = $"Playback stats cleared for {cleared} items.";
                }
                RecalculateGlobalStats();
                UpdateCurrentFileStatsUi();
            }
            else
            {
                Log("UI ACTION: ClearPlaybackStats cancelled");
            }
        }

        private void FullscreenMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var isFullScreen = FullscreenMenuItem.IsChecked == true;
            Log($"UI ACTION: FullscreenMenuItem clicked, setting fullscreen to: {isFullScreen}");
            IsFullScreen = isFullScreen;
        }

        private async void ManageTagsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ManageTagsMenuItem clicked");
            var dialog = new ManageTagsDialog(_libraryService, _filterPresets);
            var result = await dialog.ShowDialog<bool?>(this);
            if (result == true)
            {
                Log("ManageTagsMenuItem_Click: Tags updated, saving library and refreshing UI");
                
                // Save library to persist tag changes
                _libraryService.SaveLibrary();
                
                // Save filter presets (in case tags were renamed/deleted)
                SaveSettings();
                
                // Refresh library index reference
                _libraryIndex = _libraryService.LibraryIndex;
                
                // Update library panel if visible
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
            }
        }

        private async void ManageSourcesMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ManageSourcesMenuItem clicked");
            var dialog = new ManageSourcesDialog(_libraryService);
            await dialog.ShowDialog(this);
            
            Log("ManageSourcesMenuItem_Click: Dialog closed, refreshing UI");
            // Refresh UI after dialog closes
            UpdateLibrarySourceComboBox();
            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
            RecalculateGlobalStats();
            UpdateLibraryInfoText();
            
            // Rebuild queue to respect any source enable/disable changes
            RebuildPlayQueueIfNeeded();
        }

        private async System.Threading.Tasks.Task ShowTagMigrationDialog()
        {
            Log("ShowTagMigrationDialog: Starting migration process");
            
            // Get the flat tags from the old format
            var flatTags = _libraryIndex?.AvailableTags?.ToList() ?? new List<string>();
            
            if (flatTags.Count == 0)
            {
                Log("ShowTagMigrationDialog: No tags to migrate");
                return;
            }

            Log($"ShowTagMigrationDialog: Found {flatTags.Count} tags to migrate");

            var dialog = new MigrationDialog();
            dialog.Initialize(flatTags);
            
            await dialog.ShowDialog(this);

            if (dialog.WasCompleted)
            {
                Log($"ShowTagMigrationDialog: Migration completed - {dialog.Categories.Count} categories, {dialog.MigratedTags.Count} tags");
                
                // Complete the migration in LibraryService
                _libraryService.CompleteMigration(dialog.Categories, dialog.MigratedTags);
                
                // Refresh the library index reference
                _libraryIndex = _libraryService.LibraryIndex;
                
                // Save the migrated library
                try
                {
                    _libraryService.SaveLibrary();
                    Log("ShowTagMigrationDialog: Migrated library saved successfully");
                }
                catch (Exception ex)
                {
                    Log($"ShowTagMigrationDialog: ERROR saving library - {ex.Message}");
                }
                
                // Refresh UI
                UpdateLibraryPanel();
                RecalculateGlobalStats();
                UpdateLibraryInfoText();
            }
            else
            {
                Log("ShowTagMigrationDialog: Migration cancelled by user - closing application");
                // If user cancels migration, close the application
                // We can't continue with the old format
                Close();
            }
        }

        private void AlwaysOnTopMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _alwaysOnTop = AlwaysOnTopMenuItem.IsChecked == true;
            Log($"UI ACTION: AlwaysOnTopMenuItem clicked, setting always on top to: {_alwaysOnTop}");
            this.Topmost = _alwaysOnTop;
            SaveSettings();
        }

        private void PlayerViewModeMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var oldValue = _isPlayerViewMode;
            _isPlayerViewMode = PlayerViewModeMenuItem.IsChecked == true;
            Log($"UI ACTION: PlayerViewModeMenuItem clicked, setting player view mode to: {_isPlayerViewMode}");
            if (oldValue != _isPlayerViewMode)
            {
                Log($"STATE CHANGE: Player view mode changed - Previous: {oldValue}, New: {_isPlayerViewMode}");
            }
            ApplyPlayerViewMode();
            SaveSettings();
        }

        private async void SettingsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("Settings: Opening Settings dialog");
            
            var dialog = new SettingsDialog();
            
            // Load current settings into dialog
            var intervalValue = IntervalNumericUpDown?.Value ?? 300;
            dialog.LoadFromSettings(
                _isLoopEnabled,
                _autoPlayNext,
                _noRepeatMode,
                (double)intervalValue,
                _seekStep,
                _volumeStep,
                _volumeNormalizationEnabled,
                _maxReductionDb,
                _maxBoostDb,
                _baselineAutoMode,
                _baselineOverrideLUFS,
                _photoDisplayDurationSeconds,
                _imageScalingMode,
                _fixedImageMaxWidth,
                _fixedImageMaxHeight,
                _missingFileBehavior,
                _backupLibraryEnabled,
                _minimumBackupGapMinutes,
                _numberOfBackups
            );
            
            await dialog.ShowDialog<bool?>(this);
            
            if (dialog.WasApplied)
            {
                Log("Settings: User clicked Apply/OK, applying settings");
                
                // Set flag to prevent recursive SaveSettings calls
                _isApplyingSettings = true;
                
                try
                {
                    // Apply settings from dialog
                    _isLoopEnabled = dialog.LoopEnabled;
                    _autoPlayNext = dialog.AutoPlayNext;
                    _noRepeatMode = dialog.NoRepeatMode;
                    _seekStep = dialog.GetSeekStep();
                    _volumeStep = dialog.GetVolumeStep();
                    _volumeNormalizationEnabled = dialog.GetVolumeNormalizationEnabled();
                    _maxReductionDb = dialog.GetMaxReductionDb();
                    _maxBoostDb = dialog.GetMaxBoostDb();
                    _baselineAutoMode = dialog.GetBaselineAutoMode();
                    _baselineOverrideLUFS = dialog.GetBaselineOverrideLUFS();
                    // Reset baseline cache when settings change
                    _cachedBaselineLoudnessDb = null;
                    // Reset warning flag when settings change so it can be shown again if needed
                    _hasShownMissingLoudnessWarning = false;
                    Log($"Settings: Normalization settings updated - MaxReduction: {_maxReductionDb} dB, MaxBoost: {_maxBoostDb} dB, BaselineMode: {(_baselineAutoMode ? "Auto" : $"Manual ({_baselineOverrideLUFS} LUFS)")}");
                    var oldPhotoDuration = _photoDisplayDurationSeconds;
                    _photoDisplayDurationSeconds = dialog.PhotoDisplayDurationSeconds;
                    Log($"Settings: Photo display duration changed from {oldPhotoDuration} to {_photoDisplayDurationSeconds} seconds");
                    
                    // Update image scaling settings
                    var oldScalingMode = _imageScalingMode;
                    _imageScalingMode = dialog.ImageScalingMode;
                    _fixedImageMaxWidth = dialog.FixedImageMaxWidth;
                    _fixedImageMaxHeight = dialog.FixedImageMaxHeight;
                    Log($"Settings: Image scaling changed - Mode: {_imageScalingMode}, FixedMax: {_fixedImageMaxWidth}x{_fixedImageMaxHeight}");
                    
                    // Update missing file behavior setting
                    var oldMissingFileBehavior = _missingFileBehavior;
                    _missingFileBehavior = dialog.MissingFileBehavior;
                    Log($"Settings: Missing file behavior changed from {oldMissingFileBehavior} to {_missingFileBehavior}");
                    
                    // Update backup settings
                    var oldBackupEnabled = _backupLibraryEnabled;
                    var oldMinGap = _minimumBackupGapMinutes;
                    var oldBackupCount = _numberOfBackups;
                    _backupLibraryEnabled = dialog.GetBackupLibraryEnabled();
                    _minimumBackupGapMinutes = dialog.GetMinimumBackupGapMinutes();
                    _numberOfBackups = dialog.GetNumberOfBackups();
                    Log($"Settings: Backup settings changed - Enabled: {oldBackupEnabled} -> {_backupLibraryEnabled}, MinGap: {oldMinGap} -> {_minimumBackupGapMinutes} minutes, Count: {oldBackupCount} -> {_numberOfBackups}");
                    
                    // Update UI controls (these will trigger change handlers, but won't save due to flag)
                    Dispatcher.UIThread.Post(() =>
                    {
                        if (LoopToggle != null) LoopToggle.IsChecked = _isLoopEnabled;
                        if (AutoPlayNextCheckBox != null) AutoPlayNextCheckBox.IsChecked = _autoPlayNext;
                        if (NoRepeatMenuItem != null) NoRepeatMenuItem.IsChecked = _noRepeatMode;
                        if (NoRepeatToggle != null) NoRepeatToggle.IsChecked = _noRepeatMode;
                        if (IntervalNumericUpDown != null) IntervalNumericUpDown.Value = dialog.TimerIntervalSeconds;
                    });
                    
                    // Apply loop setting to current media if playing
                    // Loop setting requires recreating the media, handled by LoopToggle_Changed logic
                    if (!string.IsNullOrEmpty(_currentVideoPath) && _currentMedia != null && _mediaPlayer != null && _libVLC != null)
                    {
                        try
                        {
                            var wasPlaying = _mediaPlayer.IsPlaying;
                            var currentTime = _mediaPlayer.Time;
                            
                            // Stop current playback
                            _mediaPlayer.Stop();
                            
                            // Dispose current media
                            var mediaToDispose = _currentMedia;
                            _currentMedia = null;
                            mediaToDispose?.Dispose();
                            
                            // Create new media with updated loop option
                            _currentMedia = new Media(_libVLC, _currentVideoPath, FromType.FromPath);
                            
                            if (_isLoopEnabled)
                            {
                                _currentMedia.AddOption(":input-repeat=65535");
                            }
                            
                            // Parse and set media (fire and forget, same pattern used elsewhere)
#pragma warning disable CS4014
                            _currentMedia.Parse();
#pragma warning restore CS4014
                            UpdateAspectRatioFromTracks();
                            
                            // Set media and restore playback position
                            _mediaPlayer.Play(_currentMedia);
                            _mediaPlayer.Time = currentTime;
                            
                            // Restore playback state
                            if (wasPlaying)
                            {
                                PlayPauseButton.IsChecked = true;
                            }
                            else
                            {
                                _mediaPlayer.Pause();
                                PlayPauseButton.IsChecked = false;
                            }
                        }
                        catch (Exception ex)
                        {
                            Log($"Settings: ERROR updating loop setting - {ex.Message}");
                        }
                    }
                    
                    // Save settings to disk (now that all fields are updated)
                    SaveSettings();
                    
                    Log($"Settings: Applied and saved - Loop={_isLoopEnabled}, AutoPlay={_autoPlayNext}, NoRepeat={_noRepeatMode}, SeekStep={_seekStep}, VolumeStep={_volumeStep}, VolumeNorm={_volumeNormalizationEnabled}");
                }
                finally
                {
                    // Always clear the flag
                    _isApplyingSettings = false;
                }
            }
            else
            {
                Log("Settings: User cancelled, no changes applied");
            }
        }

        private bool IsFullScreen
        {
            get => _isFullScreen;
            set
            {
                if (_isFullScreen != value)
                {
                    var oldValue = _isFullScreen;
                    _isFullScreen = value;
                    Log($"STATE CHANGE: Fullscreen state changed (from IsFullScreen setter) - Previous: {oldValue}, New: {_isFullScreen}");
                    ToggleFullScreen(_isFullScreen);
                    FullscreenMenuItem.IsChecked = _isFullScreen;
                }
            }
        }

        private void ToggleFullScreen(bool enable)
        {
            var oldState = this.WindowState;
            if (enable)
            {
                // Enter fullscreen
                this.WindowState = WindowState.FullScreen;
                Log($"STATE CHANGE: Window state changed - Previous: {oldState}, New: {this.WindowState} (FullScreen enabled)");
            }
            else
            {
                // Leave fullscreen; restore to normal windowed state
                if (this.WindowState == WindowState.FullScreen)
                {
                    this.WindowState = WindowState.Normal;
                    Log($"STATE CHANGE: Window state changed - Previous: {oldState}, New: {this.WindowState} (FullScreen disabled)");
                }
            }
        }

        private void AutoPlayNext_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _autoPlayNext = AutoPlayNextCheckBox.IsChecked == true;
            Log($"UI ACTION: AutoPlayNext changed to: {_autoPlayNext}");
            
            // Persist the setting (unless we're applying settings from dialog)
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        private void ScanDurations_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ScanDurations button clicked");
            // Scan entire library
            if (_libraryIndex == null || _libraryIndex.Items.Count == 0)
            {
                Log("  ERROR: No library available");
                StatusTextBlock.Text = "No library available. Import a folder first (Library → Import Folder).";
                return;
            }
            
            // Get all unique source root paths from library
            var sourceRoots = _libraryIndex.Sources
                .Where(s => s.IsEnabled && Directory.Exists(s.RootPath))
                .Select(s => s.RootPath)
                .Distinct()
                .ToList();
            
            if (sourceRoots.Count == 0)
            {
                Log("  ERROR: No enabled sources with valid paths found");
                StatusTextBlock.Text = "No valid source folders found in library.";
                return;
            }
            
            Log($"  Starting duration scan for {sourceRoots.Count} source(s) in library");
            StatusTextBlock.Text = $"Starting duration scan for {sourceRoots.Count} source(s)...";
            
            // Start scan for first source (could be enhanced to scan all sources)
            StartDurationScan(sourceRoots[0]);
        }

        private async void ScanLoudness_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ScanLoudness button clicked");
            // Scan entire library
            if (_libraryIndex == null || _libraryIndex.Items.Count == 0)
            {
                Log("  ERROR: No library available");
                StatusTextBlock.Text = "No library available. Import a folder first (Library → Import Folder).";
                return;
            }
            
            // Get all unique source root paths from library
            var sourceRoots = _libraryIndex.Sources
                .Where(s => s.IsEnabled && Directory.Exists(s.RootPath))
                .Select(s => s.RootPath)
                .Distinct()
                .ToList();
            
            if (sourceRoots.Count == 0)
            {
                Log("  ERROR: No enabled sources with valid paths found");
                StatusTextBlock.Text = "No valid source folders found in library.";
                return;
            }
            
            // Show dialog to choose scan mode
            var dialog = new Window
            {
                Title = "Scan Loudness",
                Width = 450,
                Height = 250,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                CanResize = false
            };

            var panel = new StackPanel { Margin = new Thickness(20), Spacing = 15 };
            
            panel.Children.Add(new TextBlock 
            { 
                Text = "Choose scan mode:",
                FontSize = 14,
                FontWeight = Avalonia.Media.FontWeight.SemiBold
            });
            
            var onlyNewRadio = new RadioButton 
            { 
                Content = "Only scan new files (files without loudness data)",
                IsChecked = true,
                GroupName = "ScanMode"
            };
            panel.Children.Add(onlyNewRadio);
            
            var rescanAllRadio = new RadioButton 
            { 
                Content = "Rescan all files (update all loudness data with improved accuracy)",
                GroupName = "ScanMode"
            };
            panel.Children.Add(rescanAllRadio);
            
            panel.Children.Add(new TextBlock
            {
                Text = "Note: Rescanning uses the new EBU R128 standard for more accurate loudness measurement.",
                FontSize = 11,
                Foreground = Avalonia.Media.Brushes.Gray,
                TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                Margin = new Thickness(20, 5, 0, 0)
            });
            
            var buttonPanel = new StackPanel 
            { 
                Orientation = Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                Spacing = 10,
                Margin = new Thickness(0, 20, 0, 0)
            };
            
            var okButton = new Button { Content = "Start Scan", MinWidth = 100 };
            var cancelButton = new Button { Content = "Cancel", MinWidth = 100 };
            
            buttonPanel.Children.Add(okButton);
            buttonPanel.Children.Add(cancelButton);
            panel.Children.Add(buttonPanel);
            
            dialog.Content = panel;
            
            bool? result = null;
            bool rescanAll = false;
            
            EventHandler<Avalonia.Interactivity.RoutedEventArgs>? okHandler = null;
            EventHandler<Avalonia.Interactivity.RoutedEventArgs>? cancelHandler = null;
            
            okHandler = (s, args) => 
            { 
                result = true;
                rescanAll = rescanAllRadio.IsChecked == true;
                dialog.Close();
                // Unsubscribe to allow garbage collection
                if (okHandler != null) okButton.Click -= okHandler;
                if (cancelHandler != null) cancelButton.Click -= cancelHandler;
            };
            cancelHandler = (s, args) => 
            { 
                result = false;
                dialog.Close();
                // Unsubscribe to allow garbage collection
                if (okHandler != null) okButton.Click -= okHandler;
                if (cancelHandler != null) cancelButton.Click -= cancelHandler;
            };
            
            okButton.Click += okHandler;
            cancelButton.Click += cancelHandler;
            
            await dialog.ShowDialog(this);
            
            if (result != true)
            {
                Log("  User cancelled loudness scan");
                return;
            }
            
            Log($"  Starting loudness scan for {sourceRoots.Count} source(s) in library - Mode: {(rescanAll ? "Rescan All" : "Only New Files")}");
            StatusTextBlock.Text = $"Starting loudness scan ({(rescanAll ? "all files" : "new files only")})...";
            
            // Start scan for first source with rescan flag
            StartLoudnessScan(sourceRoots[0], rescanAll);
        }

        // DurationFilter_Changed handler removed - now using FilterDialog

        #endregion

        #region Menu helpers

        public List<FFmpegLogEntry> GetFFmpegLogs()
        {
            lock (_ffmpegLogsLock)
            {
                return new List<FFmpegLogEntry>(_ffmpegLogs);
            }
        }

        public void ClearFFmpegLogs()
        {
            lock (_ffmpegLogsLock)
            {
                _ffmpegLogs.Clear();
            }
        }

        private void ShowFFmpegLogsMenuItem_Click(object? sender, RoutedEventArgs e)
        {
            if (_ffmpegLogWindow == null || !_ffmpegLogWindow.IsVisible)
            {
                _ffmpegLogWindow = new FFmpegLogWindow(this)
                {
                    WindowStartupLocation = WindowStartupLocation.Manual
                };
                // Position near the main window but not on top
                if (this.Position.X != int.MinValue && this.Position.Y != int.MinValue)
                {
                    _ffmpegLogWindow.Position = new PixelPoint(
                        this.Position.X + 50,
                        this.Position.Y + 50
                    );
                }
                _ffmpegLogWindow.Closed += (s, e) => _ffmpegLogWindow = null;
                _ffmpegLogWindow.Show(this); // Show as non-modal
            }
            else
            {
                // Bring to front if already open
                _ffmpegLogWindow.Activate();
                _ffmpegLogWindow.BringIntoView();
            }
            
            // Update logs when window is shown
            if (_ffmpegLogWindow is FFmpegLogWindow logWindow)
            {
                logWindow.UpdateLogDisplay();
            }
        }

        private void SyncMenuStates()
        {
            NoRepeatMenuItem.IsChecked = _noRepeatMode;
            KeepPlayingMenuItem.IsChecked = _isKeepPlayingActive;
            // OnlyFavoritesMenuItem removed - now using FilterDialog
            FavoriteToggle.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
            BlacklistToggle.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
            ManageTagsButton.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
            
            // Audio filter menu items removed - now using FilterDialog
        }

        private void NoRepeatMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            _noRepeatMode = NoRepeatMenuItem.IsChecked == true;
            
            // Sync with toggle button
            if (NoRepeatToggle != null)
            {
                NoRepeatToggle.IsChecked = _noRepeatMode;
            }
            
            Log($"UI ACTION: NoRepeatMenuItem changed to: {_noRepeatMode}");
            
            // Persist the setting (unless we're applying settings from dialog)
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        private void KeepPlayingMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var desired = KeepPlayingMenuItem.IsChecked == true;
            if (desired != _isKeepPlayingActive)
            {
                KeepPlaying_Click(KeepPlayingButton, e);
            }
            KeepPlayingMenuItem.IsChecked = _isKeepPlayingActive;
        }

        private async void SetIntervalMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var dialog = new Window
            {
                Title = "Set interval (seconds)",
                Width = 280,
                Height = 140,
                CanResize = false,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var numeric = new NumericUpDown
            {
                Minimum = 1,
                Maximum = 3600,
                Value = IntervalNumericUpDown.Value ?? 60,
                Margin = new Thickness(0, 0, 0, 8)
            };

            var ok = new Button { Content = "OK", MinWidth = 80, Margin = new Thickness(0, 0, 8, 0) };
            var cancel = new Button { Content = "Cancel", MinWidth = 80 };

            ok.Click += (_, __) =>
            {
                IntervalNumericUpDown.Value = numeric.Value;
                SavePlaybackSettings("Interval");
                dialog.Close(true);
            };
            cancel.Click += (_, __) => dialog.Close(false);

            dialog.Content = new StackPanel
            {
                Margin = new Thickness(12),
                Children =
                {
                    new TextBlock { Text = "Interval (seconds):", Margin = new Thickness(0,0,0,4) },
                    numeric,
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Right,
                        Children = { ok, cancel }
                    }
                }
            };

            await dialog.ShowDialog<bool?>(this);
        }


        // OnlyFavoritesMenuItem removed - now using FilterDialog

        private async void FilterMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: FilterMenuItem/FilterButton clicked - opening FilterDialog");
            if (_currentFilterState == null)
            {
                _currentFilterState = new FilterState();
                Log("  Created new FilterState");
            }

            var dialog = new FilterDialog(_currentFilterState, _libraryIndex, 
                                         _filterPresets ?? new List<FilterPreset>(),
                                         _activePresetName);
            await dialog.ShowDialog<bool?>(this);

            if (dialog.WasApplied)
            {
                Log("UI ACTION: FilterDialog was applied - saving filter state and updating panel");
                
                // Save presets and active preset name to local fields
                _filterPresets = dialog.GetPresets();
                _activePresetName = dialog.GetActivePresetName();
                
                Log($"FilterMenuItem: Saved {_filterPresets?.Count ?? 0} presets, active preset: {_activePresetName ?? "None"}");
                
                // Update preset dropdown in library panel
                UpdateLibraryPresetComboBox();
                var oldFavoritesOnly = _currentFilterState?.FavoritesOnly ?? false;
                var oldExcludeBlacklisted = _currentFilterState?.ExcludeBlacklisted ?? false;
                var oldAudioFilter = _currentFilterState?.AudioFilter ?? AudioFilterMode.PlayAll;
                Log($"  Current FilterState before save: FavoritesOnly={_currentFilterState?.FavoritesOnly}, ExcludeBlacklisted={_currentFilterState?.ExcludeBlacklisted}, AudioFilter={_currentFilterState?.AudioFilter}");
                
                // Log state change if filter values changed
                if (_currentFilterState != null && 
                    (oldFavoritesOnly != _currentFilterState.FavoritesOnly ||
                     oldExcludeBlacklisted != _currentFilterState.ExcludeBlacklisted ||
                     oldAudioFilter != _currentFilterState.AudioFilter))
                {
                    Log($"STATE CHANGE: Filter state updated - FavoritesOnly: {oldFavoritesOnly} -> {_currentFilterState.FavoritesOnly}, ExcludeBlacklisted: {oldExcludeBlacklisted} -> {_currentFilterState.ExcludeBlacklisted}, AudioFilter: {oldAudioFilter} -> {_currentFilterState.AudioFilter}");
                }
                
                // Capture UI values on UI thread before saving
                var intervalValue = IntervalNumericUpDown?.Value;
                Log($"  Captured intervalValue on UI thread: {intervalValue}");
                
                // Save the filter state asynchronously
                Log("  Starting async save operation...");
                _ = Task.Run(() =>
                {
                    try
                    {
                        Log("  Task.Run: Inside task, calling SaveSettings...");
                        // Use captured interval value to avoid UI thread access
                        SaveSettingsInternal(intervalValue);
                        Log("  Task.Run: SaveSettings completed successfully");
                    }
                    catch (Exception ex)
                    {
                        Log($"  Task.Run: ERROR saving filter state - Exception type: {ex.GetType().Name}, Message: {ex.Message}");
                        Log($"  Task.Run: ERROR - Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            Log($"  Task.Run: ERROR - Inner exception: {ex.InnerException.Message}");
                        }
                        Log($"Error saving filter state: {ex.Message}");
                    }
                });
                Log("  Task.Run started (async save initiated)");
                
                // Update Library panel if it's visible and respecting filters
                if (_showLibraryPanel)
                {
                    Log("  Updating Library panel after filter change");
                    UpdateLibraryPanel();
                }
                
                // Update library info text to reflect new filter state
                UpdateLibraryInfoText();
                UpdateFilterSummaryText();
                
                // Show message and rebuild queue to apply new filters
                StatusTextBlock.Text = "Applying filters and rebuilding queue...";
                _ = Task.Run(async () =>
                {
                    await RebuildPlayQueueIfNeededAsync();
                });
            }
        }

        private async void ManageTagsForCurrentVideo_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ManageTagsForCurrentVideo button clicked");
            
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("ManageTagsForCurrentVideo_Click: No current video selected");
                StatusTextBlock.Text = "No video selected.";
                return;
            }

            if (_libraryIndex == null || _libraryService == null)
            {
                Log("ManageTagsForCurrentVideo_Click: Library system not available");
                StatusTextBlock.Text = "Library system not available.";
                return;
            }

            var item = _libraryService.FindItemByPath(_currentVideoPath);
            if (item == null)
            {
                Log($"ManageTagsForCurrentVideo_Click: Could not find library item for path: {_currentVideoPath}");
                StatusTextBlock.Text = "Video not found in library.";
                return;
            }

            Log($"ManageTagsForCurrentVideo_Click: Opening tags dialog for current video: {item.FileName}");
            var dialog = new ItemTagsDialog(new List<LibraryItem> { item }, _libraryIndex, _libraryService, _filterPresets);
            var result = await dialog.ShowDialog<bool?>(this);
            
            if (result == true)
            {
                Log($"ManageTagsForCurrentVideo_Click: Tags updated for: {item.FileName}");
                // Save filter presets (in case tags were renamed/deleted)
                SaveSettings();
                // Refresh library index reference
                _libraryIndex = _libraryService.LibraryIndex;
                // Update library panel if visible
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }
                // Update stats for current video
                UpdateCurrentFileStatsUi();
                StatusTextBlock.Text = $"Tags updated for {Path.GetFileName(_currentVideoPath)}";
            }
        }

        private void BlacklistToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("BlacklistToggle_Changed: Blacklist toggle changed event fired");
            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("BlacklistToggle_Changed: No current video path, disabling toggle");
                BlacklistToggle.IsChecked = false;
                BlacklistToggle.IsEnabled = false;
                return;
            }

            var path = _currentVideoPath;
            var isBlacklisted = BlacklistToggle.IsChecked == true;
            Log($"BlacklistToggle_Changed: Setting blacklisted to {isBlacklisted} for video: {Path.GetFileName(path)}");

            // Update library item
            if (_libraryIndex != null)
            {
                var item = _libraryService.FindItemByPath(path);
                if (item != null)
                {
                    var oldBlacklisted = item.IsBlacklisted;
                    if (oldBlacklisted == isBlacklisted)
                    {
                        Log($"BlacklistToggle_Changed: Item already has IsBlacklisted={isBlacklisted}, skipping update (likely programmatic change)");
                        return;
                    }
                    
                    item.IsBlacklisted = isBlacklisted;
                    
                    // EXCLUSIVE: If adding to blacklist, remove from favorites
                    if (isBlacklisted && item.IsFavorite)
                    {
                        Log($"BlacklistToggle_Changed: Removing from favorites (exclusive with blacklist)");
                        item.IsFavorite = false;
                        // Update favorite toggle UI to reflect change
                        FavoriteToggle.IsChecked = false;
                    }
                    
                    _libraryService.UpdateItem(item);
                    Log($"BlacklistToggle_Changed: Updated library item - IsBlacklisted: {oldBlacklisted} -> {isBlacklisted}");
                    
                    // Save library asynchronously
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            Log("BlacklistToggle_Changed: Saving library asynchronously...");
                            _libraryService.SaveLibrary();
                            Log("BlacklistToggle_Changed: Library saved successfully");
                        }
                        catch (Exception ex)
                        {
                            Log($"BlacklistToggle_Changed: ERROR saving library - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            Log($"BlacklistToggle_Changed: ERROR - Stack trace: {ex.StackTrace}");
                        }
                    });
                }
                else
                {
                    Log($"BlacklistToggle_Changed: Library item not found for path: {path}");
                }
            }
            else
            {
                Log("BlacklistToggle_Changed: Library index is null, cannot update item");
            }

            if (isBlacklisted)
            {
                Log("BlacklistToggle_Changed: Video blacklisted, removing from queue and rebuilding");
                // Remove from queue if present
                var queueList = _playQueue.ToList();
                var beforeCount = queueList.Count;
                queueList.Remove(path);
                var afterCount = queueList.Count;
                _playQueue = new Queue<string>(queueList);
                Log($"BlacklistToggle_Changed: Queue updated - {beforeCount} -> {afterCount} items (removed blacklisted video)");

                RebuildPlayQueueIfNeeded();
                StatusTextBlock.Text = $"Blacklisted: {System.IO.Path.GetFileName(path)}";
            }
            else
            {
                Log("BlacklistToggle_Changed: Video removed from blacklist, rebuilding queue");
                RebuildPlayQueueIfNeeded();
                // Update Library panel if visible
                if (_showLibraryPanel)
                {
                    Log("BlacklistToggle_Changed: Updating library panel");
                    UpdateLibraryPanel();
                }
                StatusTextBlock.Text = $"Removed from blacklist: {System.IO.Path.GetFileName(path)}";
            }

            // Update stats when blacklist changes
            Log("BlacklistToggle_Changed: Recalculating global stats");
            RecalculateGlobalStats();
            UpdateCurrentFileStatsUi();
            Log("BlacklistToggle_Changed: Blacklist toggle change complete");
        }

        // ShowDurationFilterDialogAsync and related duration filter methods removed - now using FilterDialog

        #endregion

        #region UI sync

        private void UpdatePerVideoToggleStates()
        {
            var hasVideo = !string.IsNullOrEmpty(_currentVideoPath);
            FavoriteToggle.IsEnabled = hasVideo;
            BlacklistToggle.IsEnabled = hasVideo;
            ShowInFileManagerButton.IsEnabled = hasVideo;
            ManageTagsButton.IsEnabled = hasVideo;

            if (!hasVideo)
            {
                FavoriteToggle.IsChecked = false;
                BlacklistToggle.IsChecked = false;
                return;
            }

            // Update toggle states from library items
            bool isFavorite = false;
            bool isBlacklisted = false;
            if (_currentVideoPath != null && _libraryIndex != null)
            {
                var item = _libraryService.FindItemByPath(_currentVideoPath);
                if (item != null)
                {
                    isFavorite = item.IsFavorite;
                    isBlacklisted = item.IsBlacklisted;
                }
            }
            FavoriteToggle.IsChecked = isFavorite;
            BlacklistToggle.IsChecked = isBlacklisted;
        }

        #endregion

        #region Player Controls (Previous/Next/PlayPause/Volume)

        private void PreviousButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_playbackTimeline.Count == 0 || _timelineIndex <= 0)
            {
                PreviousButton.IsEnabled = false;
                return;
            }

            _isNavigatingTimeline = true;
            _timelineIndex--;
            var previousVideo = _playbackTimeline[_timelineIndex];
            PlayVideo(previousVideo, addToHistory: false);
            PreviousButton.IsEnabled = _timelineIndex > 0;
            NextButton.IsEnabled = true;
        }

        private void NextButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_playbackTimeline.Count == 0)
            {
                // No timeline, do nothing (button should be disabled)
                return;
            }

            if (_timelineIndex < _playbackTimeline.Count - 1)
            {
                // Navigate forward in timeline
                _isNavigatingTimeline = true;
                _timelineIndex++;
                var nextVideo = _playbackTimeline[_timelineIndex];
                PlayVideo(nextVideo, addToHistory: false);
                PreviousButton.IsEnabled = true;
                NextButton.IsEnabled = _timelineIndex < _playbackTimeline.Count - 1;
            }
            // At end of timeline - do nothing (button is disabled, user can use "R" for random)
        }

        private void PlayPauseButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: PlayPauseButton clicked");
            TogglePlayPause();
        }

        private void UpdateVolumeTooltip()
        {
            if (VolumeSlider != null)
            {
                int volume = (int)Math.Round(VolumeSlider.Value);
                ToolTip.SetTip(VolumeSlider, $"Volume: {volume}");
            }
        }

        /// <summary>
        /// Gets loudness info from library item for the given path, or returns null if not found.
        /// </summary>
        private FileLoudnessInfo? GetLoudnessInfoFromLibrary(string? path)
        {
            if (string.IsNullOrEmpty(path) || _libraryIndex == null)
                return null;
                
            var item = _libraryService.FindItemByPath(path);
            if (item == null || !item.HasAudio.HasValue || item.HasAudio != true)
                return null;
                
            // Only return loudness info if we have IntegratedLoudness data
            if (!item.IntegratedLoudness.HasValue)
                return null;
                
            return new FileLoudnessInfo
            {
                HasAudio = true,
                MeanVolumeDb = item.IntegratedLoudness.Value,
                PeakDb = item.PeakDb ?? 0.0 // Use PeakDb from library if available, otherwise 0.0
            };
        }

        /// <summary>
        /// Calculates normalized volume with improved algorithm including limiter
        /// </summary>
        private double GetLibraryBaselineLoudness()
        {
            // If manual baseline mode is enabled, return the override value
            if (!_baselineAutoMode)
            {
                Log($"GetLibraryBaselineLoudness: Manual mode - using override baseline: {_baselineOverrideLUFS:F2} LUFS");
                return _baselineOverrideLUFS;
            }
            
            // Return cached value if available
            if (_cachedBaselineLoudnessDb.HasValue)
            {
                return _cachedBaselineLoudnessDb.Value;
            }

            Log("GetLibraryBaselineLoudness: Calculating baseline loudness from library");

            // Check if library index is available
            if (_libraryIndex == null)
            {
                Log("GetLibraryBaselineLoudness: Library index is null - using default baseline of -18 dB");
                _cachedBaselineLoudnessDb = -18.0;
                return _cachedBaselineLoudnessDb.Value;
            }

            // Get all videos with loudness data
            var videosWithLoudness = _libraryIndex.Items
                .Where(item => item.MediaType == MediaType.Video && 
                              item.HasAudio == true && 
                              item.IntegratedLoudness.HasValue)
                .Select(item => item.IntegratedLoudness!.Value)
                .OrderBy(loudness => loudness)
                .ToList();

            if (videosWithLoudness.Count == 0)
            {
                Log("GetLibraryBaselineLoudness: No videos with loudness data - using default baseline of -18 dB");
                _cachedBaselineLoudnessDb = -18.0; // Default if no data
                return _cachedBaselineLoudnessDb.Value;
            }

            // Use 75th percentile as baseline (avoids being skewed by very quiet outliers)
            int percentile75Index = (int)Math.Ceiling(videosWithLoudness.Count * 0.75) - 1;
            percentile75Index = Math.Clamp(percentile75Index, 0, videosWithLoudness.Count - 1);
            double baselineLoudness = videosWithLoudness[percentile75Index];

            _cachedBaselineLoudnessDb = baselineLoudness;
            Log($"GetLibraryBaselineLoudness: Baseline calculated - 75th percentile: {baselineLoudness:F2} dB from {videosWithLoudness.Count} videos");
            
            return baselineLoudness;
        }

        private int CalculateNormalizedVolume(FileLoudnessInfo info, int userVolumePreference)
        {
            Log($"CalculateNormalizedVolume: Starting - MeanVolumeDb: {info.MeanVolumeDb:F2}, PeakDb: {info.PeakDb:F2}, UserPreference: {userVolumePreference}");
            
            // Get library baseline
            double baselineLoudness = GetLibraryBaselineLoudness();
            Log($"CalculateNormalizedVolume: Baseline loudness: {baselineLoudness:F2} dB");
            
            // Calculate gain needed relative to baseline
            // Positive diffDb means video is quieter than baseline (needs boost)
            // Negative diffDb means video is louder than baseline (needs reduction)
            var diffDb = baselineLoudness - info.MeanVolumeDb;
            Log($"CalculateNormalizedVolume: Initial gain calculation: {diffDb:F2} dB");
            
            // Apply asymmetric limits: allow more reduction than boost
            var gainBeforeLimits = diffDb;
            if (diffDb > 0)
            {
                // Video is quieter than baseline - apply minimal boost to avoid noise
                diffDb = Math.Min(diffDb, _maxBoostDb);
            }
            else
            {
                // Video is louder than baseline - apply reduction
                diffDb = Math.Max(diffDb, -_maxReductionDb);
            }
            
            if (gainBeforeLimits != diffDb)
            {
                Log($"CalculateNormalizedVolume: Gain clamped by limits: {gainBeforeLimits:F2} -> {diffDb:F2} dB");
            }
            
            // Convert dB gain to linear multiplier
            var gainLinear = Math.Pow(10.0, diffDb / 20.0);
            Log($"CalculateNormalizedVolume: Gain linear multiplier: {gainLinear:F4}");
            
            // Apply user's volume preference (slider 0-200 -> 0.0-2.0)
            var sliderLinear = userVolumePreference / 100.0;
            var normalizedLinear = sliderLinear * gainLinear;
            Log($"CalculateNormalizedVolume: Slider linear: {sliderLinear:F2}, Normalized linear before clamp: {normalizedLinear:F4}");
            
            // Clamp to LibVLC range [0, 200]
            normalizedLinear = Math.Clamp(normalizedLinear, 0.0, 2.0);
            
            // Convert back to volume integer (0-200)
            var finalVolume = (int)Math.Round(normalizedLinear * 100.0);
            finalVolume = Math.Clamp(finalVolume, 0, 200);
            Log($"CalculateNormalizedVolume: Final normalized volume: {finalVolume} (from {userVolumePreference})");
            
            return finalVolume;
        }

        private void ApplyVolumeNormalization()
        {
            Log($"ApplyVolumeNormalization: Starting - Enabled: {_volumeNormalizationEnabled}, UserPreference: {_userVolumePreference}, CurrentVideoPath: {_currentVideoPath ?? "null"}, Muted: {_isMuted}");
            
            if (_currentMedia == null || _mediaPlayer == null || string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("ApplyVolumeNormalization: ERROR - CurrentMedia, MediaPlayer, or CurrentVideoPath is null/empty");
                return;
            }

            // Check if muted - if so, set volume to 0 and mute MediaPlayer
            if (_isMuted || MuteButton?.IsChecked == true)
            {
                Log("ApplyVolumeNormalization: Currently muted - setting volume to 0 and muting MediaPlayer");
                _mediaPlayer.Volume = 0;
                _mediaPlayer.Mute = true;
                return;
            }
            
            // Ensure MediaPlayer is unmuted if we're not in muted state
            if (_mediaPlayer.Mute)
            {
                Log("ApplyVolumeNormalization: Unmuting MediaPlayer");
                _mediaPlayer.Mute = false;
            }

            // If normalization is Off: use slider value directly
            if (!_volumeNormalizationEnabled)
            {
                Log($"ApplyVolumeNormalization: Normalization disabled - using direct volume: {_userVolumePreference}");
                _mediaPlayer.Volume = _userVolumePreference;
                return;
            }

            // Normalization is On: apply per-file gain adjustment based on loudness data
            Log($"ApplyVolumeNormalization: Normalization enabled - getting loudness info from library");
            var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

            if (info != null && info.HasAudio == true)
            {
                Log($"ApplyVolumeNormalization: Loudness info found - HasAudio: {info.HasAudio}, MeanVolumeDb: {info.MeanVolumeDb:F2}, PeakDb: {info.PeakDb:F2}");
                var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                Log($"ApplyVolumeNormalization: Setting normalized volume: {finalVolume}");
                _mediaPlayer.Volume = finalVolume;
            }
            else
            {
                Log($"ApplyVolumeNormalization: No loudness info found - using direct volume: {_userVolumePreference}");
                
                // Show warning once if normalization is enabled but video lacks loudness data
                if (!_hasShownMissingLoudnessWarning)
                {
                    _hasShownMissingLoudnessWarning = true;
                    SetStatusMessage("Volume normalization enabled, but some videos lack loudness data. Run 'Library > Scan Loudness' for best results.");
                }
                
                // Fall back to direct volume if no loudness data
                _mediaPlayer.Volume = _userVolumePreference;
            }
            
            Log($"ApplyVolumeNormalization: Completed - Final volume: {_mediaPlayer.Volume}");
        }

        private void VolumeSlider_ValueChanged(object? sender, Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs e)
        {
            var newVolume = (int)VolumeSlider.Value;
            Log($"UI ACTION: VolumeSlider value changed - New value: {newVolume}, Old value: {e.OldValue}");
            
            if (_mediaPlayer == null)
            {
                Log("VolumeSlider_ValueChanged: ERROR - MediaPlayer is null");
                return;
            }

            // Update user preference immediately for responsiveness
            var oldPreference = _userVolumePreference;
            
            // Save old non-zero preference before transitioning to zero
            if (newVolume == 0 && oldPreference > 0)
            {
                _lastNonZeroVolume = oldPreference;
                Log($"VolumeSlider_ValueChanged: Saving last non-zero volume before muting: {oldPreference}");
            }
            
            _userVolumePreference = newVolume;
            _pendingVolumeValue = newVolume;
            Log($"VolumeSlider_ValueChanged: User volume preference updated: {oldPreference} -> {newVolume}");

            // Update mute button state immediately
            if (newVolume == 0)
            {
                Log("VolumeSlider_ValueChanged: Volume is 0 - muting");
                MuteButton.IsChecked = true;
                _isMuted = true;
                // Set MediaPlayer mute state
                if (_mediaPlayer.Mute != true)
                {
                    _mediaPlayer.Mute = true;
                    Log("VolumeSlider_ValueChanged: Set MediaPlayer.Mute = true");
                }
            }
            else
            {
                Log($"VolumeSlider_ValueChanged: Volume is non-zero - unmuting, saving lastNonZeroVolume: {newVolume}");
                MuteButton.IsChecked = false;
                _isMuted = false;
                _lastNonZeroVolume = newVolume;
                // Unmute MediaPlayer
                if (_mediaPlayer.Mute != false)
                {
                    _mediaPlayer.Mute = false;
                    Log("VolumeSlider_ValueChanged: Set MediaPlayer.Mute = false");
                }
            }
            
            UpdateVolumeTooltip();

            // Debounce the actual volume application to avoid lag during dragging
            // Initialize debounce timer if needed
            if (_volumeSliderDebounceTimer == null)
            {
                _volumeSliderDebounceTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromMilliseconds(150)
                };
                _volumeSliderDebounceTimer.Tick += VolumeSliderDebounceTimer_Tick;
            }

            // Restart the timer - this cancels any pending application
            _volumeSliderDebounceTimer.Stop();
            _volumeSliderDebounceTimer.Start();
        }

        private void VolumeSliderDebounceTimer_Tick(object? sender, EventArgs e)
        {
            // Stop timer
            _volumeSliderDebounceTimer?.Stop();

            // Apply the pending volume change if there is one
            if (_pendingVolumeValue.HasValue)
            {
                ApplyVolumeChange(_pendingVolumeValue.Value);
                _pendingVolumeValue = null; // Clear to prevent duplicate application
            }
        }

        private void ApplyVolumeChange(int newVolume)
        {
            if (_mediaPlayer == null)
            {
                Log("ApplyVolumeChange: ERROR - MediaPlayer is null");
                return;
            }

            Log($"ApplyVolumeChange: Applying volume: {newVolume}");

            // If normalization is enabled and current video exists, recalculate normalized volume
            if (_volumeNormalizationEnabled && !string.IsNullOrEmpty(_currentVideoPath))
            {
                Log($"ApplyVolumeChange: Normalization enabled - getting loudness info");
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null && info.HasAudio == true)
                {
                    // Recalculate normalized volume using current loudness data
                    var finalVolume = CalculateNormalizedVolume(info, newVolume);
                    Log($"ApplyVolumeChange: Setting normalized volume: {finalVolume}");
                    
                    // Check mute state before applying
                    if (!_isMuted && MuteButton?.IsChecked != true)
                    {
                        _mediaPlayer.Volume = finalVolume;
                    }
                    else
                    {
                        Log("ApplyVolumeChange: Muted - not applying volume change");
                    }
                }
                else
                {
                    Log($"ApplyVolumeChange: No loudness info - using direct volume: {newVolume}");
                    // Fall back to direct volume
                    if (!_isMuted && MuteButton?.IsChecked != true)
                    {
                        _mediaPlayer.Volume = newVolume;
                    }
                }
            }
            else
            {
                Log($"ApplyVolumeChange: Direct volume mode - setting volume: {newVolume}");
                // Normalization disabled: set volume directly
                if (!_isMuted && MuteButton?.IsChecked != true)
                {
                    _mediaPlayer.Volume = newVolume;
                }
                else
                {
                    Log("ApplyVolumeChange: Muted - not applying volume change");
                }
            }
            
            // Persist volume level (unless we're applying settings from dialog)
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        private void VolumeSlider_PointerReleased(object? sender, Avalonia.Input.PointerReleasedEventArgs e)
        {
            Log("VolumeSlider_PointerReleased: User released slider - applying volume immediately");
            // Stop debounce timer and apply immediately if there's a pending change
            _volumeSliderDebounceTimer?.Stop();
            if (_pendingVolumeValue.HasValue)
            {
                ApplyVolumeChange(_pendingVolumeValue.Value);
                _pendingVolumeValue = null; // Clear to prevent duplicate application
            }
        }

        private void VolumeSlider_PointerCaptureLost(object? sender, Avalonia.Input.PointerCaptureLostEventArgs e)
        {
            Log("VolumeSlider_PointerCaptureLost: Pointer capture lost - applying volume immediately");
            // Stop debounce timer and apply immediately if there's a pending change
            _volumeSliderDebounceTimer?.Stop();
            if (_pendingVolumeValue.HasValue)
            {
                ApplyVolumeChange(_pendingVolumeValue.Value);
                _pendingVolumeValue = null; // Clear to prevent duplicate application
            }
        }

        private void MuteButton_Checked(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_mediaPlayer == null)
                return;

            // Bug fix: Save user volume preference instead of normalized MediaPlayer volume
            // In normalization modes, _mediaPlayer.Volume contains the normalized value, not the user's preference
            if (_userVolumePreference > 0)
            {
                _lastNonZeroVolume = _userVolumePreference;
            }
            _mediaPlayer.Volume = 0;
            _mediaPlayer.Mute = true; // Set MediaPlayer mute state
            VolumeSlider.Value = 0;
            // Preserve user volume preference when muting
            // _userVolumePreference remains unchanged
            UpdateVolumeTooltip();
            
            // Persist mute state
            _isMuted = true;
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        private void MuteButton_Unchecked(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_mediaPlayer == null)
                return;

            // Unmute: restore last non-zero volume
            // Only restore slider value if it's still at 0 (not already changed by user dragging)
            if (VolumeSlider.Value == 0)
            {
                _userVolumePreference = _lastNonZeroVolume;
                VolumeSlider.Value = _lastNonZeroVolume;
            }
            else
            {
                // User already dragged slider to non-zero - use that value
                _userVolumePreference = (int)VolumeSlider.Value;
                _lastNonZeroVolume = (int)VolumeSlider.Value;
            }
            
            // Unmute MediaPlayer first
            _mediaPlayer.Mute = false;
            
            // Reapply normalization if enabled
            if (_volumeNormalizationEnabled && !string.IsNullOrEmpty(_currentVideoPath))
            {
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null && info.HasAudio == true)
                {
                    var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    _mediaPlayer.Volume = _lastNonZeroVolume;
                }
            }
            else
            {
                _mediaPlayer.Volume = _lastNonZeroVolume;
            }
            
            UpdateVolumeTooltip();
            
            // Persist mute state
            _isMuted = false;
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        #region Seek Bar

        private void InitializeSeekBar(bool isPhoto = false)
        {
            if (SeekSlider == null)
                return;

            _isUserSeeking = false;
            _mediaLengthMs = 0;

            SeekSlider.Minimum = 0;
            SeekSlider.Maximum = 1;
            SeekSlider.Value = 0;
            SeekSlider.IsEnabled = false; // Disabled for photos, or until length known for videos
            
            if (isPhoto)
            {
                UpdateStatusTimeDisplay(0, isPhoto: true);
            }
            else
            {
                UpdateStatusTimeDisplay(0);
            }
        }

        private void SeekTimer_Tick(object? sender, EventArgs e)
        {
            if (_mediaPlayer == null || SeekSlider == null)
                return;

            // Skip seek bar updates for photos
            if (_isCurrentlyPlayingPhoto)
                return;

            // Update media length from MediaPlayer
            var lengthMs = _mediaPlayer.Length;
            if (lengthMs <= 0 && _currentMedia != null)
            {
                lengthMs = _currentMedia.Duration;
            }

            if (lengthMs > 0 && lengthMs != _mediaLengthMs)
            {
                _mediaLengthMs = lengthMs;
                SeekSlider.Minimum = 0;
                SeekSlider.Maximum = _mediaLengthMs;
                SeekSlider.IsEnabled = true;
            }

            // While user is seeking, don't move slider, but update status time from slider value
            if (_isUserSeeking)
            {
                if (SeekSlider.Value >= 0)
                {
                    UpdateStatusTimeDisplay((long)SeekSlider.Value);
                }
                return;
            }

            // Media → UI: Update slider and status time from MediaPlayer
            if (_mediaLengthMs > 0)
            {
                var timeMs = _mediaPlayer.Time;
                if (timeMs >= 0 && timeMs <= _mediaLengthMs)
                {
                    // Update slider value (only if not seeking)
                    if (Math.Abs(SeekSlider.Value - timeMs) > 1)
                    {
                        SeekSlider.Value = timeMs;
                    }

                    // Always update status time from MediaPlayer.Time
                    UpdateStatusTimeDisplay(timeMs);
                }
            }
            else
            {
                // No media loaded - show zero time
                UpdateStatusTimeDisplay(0);
            }
        }

        private string FormatTime(long timeMs)
        {
            var ts = TimeSpan.FromMilliseconds(Math.Max(0, timeMs));
            return $"{(int)ts.TotalHours:00}:{ts.Minutes:00}:{ts.Seconds:00}.{ts.Milliseconds:000}";
        }

        private void UpdateStatusTimeDisplay(long timeMs, bool isPhoto = false)
        {
            if (StatusTimeTextBlock == null)
                return;

            if (isPhoto)
            {
                StatusTimeTextBlock.Text = "Photo";
            }
            else
            {
                StatusTimeTextBlock.Text = FormatTime(timeMs);
            }
        }

        private void SeekSlider_PointerPressed(object? sender, Avalonia.Input.PointerPressedEventArgs e)
        {
            _isUserSeeking = true;
        }

        private void SeekSlider_PointerReleased(object? sender, Avalonia.Input.PointerReleasedEventArgs e)
        {
            if (SeekSlider == null || _mediaPlayer == null || _mediaLengthMs <= 0)
            {
                _isUserSeeking = false;
                return;
            }

            // UI → Media: Set MediaPlayer.Time to final slider position
            var targetMs = (long)Math.Clamp(SeekSlider.Value, 0, _mediaLengthMs);
            _mediaPlayer.Time = targetMs;
            
            // If paused, force frame update
            if (!_mediaPlayer.IsPlaying)
            {
                _mediaPlayer.NextFrame();
            }
            
            UpdateStatusTimeDisplay(targetMs);
            _isUserSeeking = false;
        }

        private void SeekSlider_PointerCaptureLost(object? sender, Avalonia.Input.PointerCaptureLostEventArgs e)
        {
            // Safety: ensure we don't leave the flag stuck
            if (_isUserSeeking && SeekSlider != null && _mediaPlayer != null && _mediaLengthMs > 0)
            {
                var targetMs = (long)Math.Clamp(SeekSlider.Value, 0, _mediaLengthMs);
                _mediaPlayer.Time = targetMs;
                
                if (!_mediaPlayer.IsPlaying)
                {
                    _mediaPlayer.NextFrame();
                }
                
                UpdateStatusTimeDisplay(targetMs);
            }
            _isUserSeeking = false;
        }

        private void SeekSlider_ValueChanged(object? sender, Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs e)
        {
            if (SeekSlider == null || _mediaPlayer == null || _mediaLengthMs <= 0)
                return;

            var newValue = (long)SeekSlider.Value;
            var currentMediaTime = _mediaPlayer.Time;
            var timeDiff = Math.Abs(newValue - currentMediaTime);
            
            // Only process if user is seeking (flag set) OR if this is a significant change from MediaPlayer.Time
            // (which indicates user interaction, even if flag isn't set yet due to event ordering)
            var isSignificantChange = timeDiff > 50; // More than 50ms difference

            if (!_isUserSeeking && !isSignificantChange)
            {
                // This is likely a timer update, ignore it
                return;
            }

            // If this looks like user input but flag isn't set, set it now
            if (!_isUserSeeking && isSignificantChange)
            {
                _isUserSeeking = true;
            }

            // During drag/click: update MediaPlayer.Time to keep VideoView in sync
            var targetMs = (long)Math.Clamp(newValue, 0, _mediaLengthMs);

            // Throttle during continuous dragging, but allow immediate seek for clicks
            var now = DateTime.UtcNow;
            var timeSinceLastSeek = (now - _lastSeekScrubTime).TotalMilliseconds;
            
            // Always seek if:
            // 1. It's been more than 40ms since last seek (throttling), OR
            // 2. This is a large jump (likely a click, not drag), OR
            // 3. Media is paused (we want immediate feedback)
            if (timeSinceLastSeek >= 40 || timeDiff > 500 || !_mediaPlayer.IsPlaying)
            {
                _mediaPlayer.Time = targetMs;
                _lastSeekScrubTime = now;
                
                // If paused, force frame update
                if (!_mediaPlayer.IsPlaying)
                {
                    _mediaPlayer.NextFrame();
                }
            }

            // Always update status time display to show where we're seeking to
            UpdateStatusTimeDisplay(targetMs);
        }

        #endregion

        // Seek step, volume step, and volume normalization handlers removed - now in Settings dialog

        private void VideoView_PointerWheelChanged(object? sender, Avalonia.Input.PointerWheelEventArgs e)
        {
            e.Handled = true;
            AdjustVolumeFromWheel(e.Delta.Y);
        }

        private void VolumeSlider_PointerWheelChanged(object? sender, Avalonia.Input.PointerWheelEventArgs e)
        {
            e.Handled = true;
            AdjustVolumeFromWheel(e.Delta.Y);
        }

        private void AdjustVolumeFromWheel(double deltaY)
        {
            Log($"AdjustVolumeFromWheel: Starting - deltaY: {deltaY:F2}, CurrentPreference: {_userVolumePreference}, VolumeStep: {_volumeStep}");
            
            if (_mediaPlayer == null)
            {
                Log("AdjustVolumeFromWheel: ERROR - MediaPlayer is null");
                return;
            }

            if (deltaY == 0)
            {
                Log("AdjustVolumeFromWheel: deltaY is 0, returning");
                return;
            }

            // Update user preference (slider value)
            var oldPreference = _userVolumePreference;
            var newPreference = _userVolumePreference + (deltaY > 0 ? _volumeStep : -_volumeStep);
            newPreference = Math.Max(0, Math.Min(200, newPreference)); // Clamp to [0, 200]
            
            Log($"AdjustVolumeFromWheel: Volume preference adjusted: {oldPreference} -> {newPreference} (delta: {(deltaY > 0 ? "+" : "-")}{_volumeStep})");
            
            _userVolumePreference = newPreference;
            VolumeSlider.Value = newPreference;

            // Apply normalization if enabled
            if (_volumeNormalizationEnabled && !string.IsNullOrEmpty(_currentVideoPath))
            {
                Log($"AdjustVolumeFromWheel: Normalization enabled - getting loudness info");
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null && info.HasAudio == true)
                {
                    var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                    Log($"AdjustVolumeFromWheel: Setting normalized volume: {finalVolume}");
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    Log($"AdjustVolumeFromWheel: No loudness info - using direct volume: {newPreference}");
                    _mediaPlayer.Volume = newPreference;
                }
            }
            else
            {
                Log($"AdjustVolumeFromWheel: Direct volume mode - setting volume: {newPreference}");
                _mediaPlayer.Volume = newPreference;
            }

            // Update mute button state
            if (newPreference == 0)
            {
                Log("AdjustVolumeFromWheel: Volume is 0 - muting");
                MuteButton.IsChecked = true;
            }
            else
            {
                Log($"AdjustVolumeFromWheel: Volume is non-zero - unmuting, saving lastNonZeroVolume: {newPreference}");
                MuteButton.IsChecked = false;
                _lastNonZeroVolume = newPreference;
            }
            
            UpdateVolumeTooltip();
            
            // Persist volume level (unless we're applying settings from dialog)
            if (!_isApplyingSettings)
            {
                SaveSettings();
            }
        }

        private void OnGlobalKeyDown(object? sender, KeyEventArgs e)
        {
            // Debug: Log all key presses to help diagnose issues
            var sourceName = e.Source?.GetType().Name ?? "null";
            Log($"OnGlobalKeyDown: Key={e.Key}, Source={sourceName}, Handled={e.Handled}");
            
            // F11 should work even when TextBox has focus, so handle it first
            if (e.Key == Key.F11)
            {
                Log($"UI ACTION: Keyboard shortcut F11 pressed - toggling fullscreen");
                IsFullScreen = !IsFullScreen;
                e.Handled = true;
                return;
            }

            // Determine if focus is in a text input; if so, skip shortcuts
            // Check if the source is a TextBox
            if (e.Source is TextBox)
            {
                Log($"OnGlobalKeyDown: Skipping - TextBox has focus");
                // Let TextBox handle everything (space, arrows, etc.)
                return;
            }

            // Check if focus is in a menu; if so, skip shortcuts
            if (e.Source is MenuItem)
            {
                Log($"OnGlobalKeyDown: Skipping - MenuItem has focus");
                return;
            }
            
            // Don't skip on Button or other controls - handle the shortcuts anyway
            Log($"OnGlobalKeyDown: Processing shortcut for Key={e.Key}");

            switch (e.Key)
            {
                case Key.K:
                    // Play/pause (only K, not Space)
                    Log("UI ACTION: Keyboard shortcut K pressed - play/pause");
                    HandlePlayPauseShortcut();
                    e.Handled = true;
                    break;

                case Key.J:
                    Log("UI ACTION: Keyboard shortcut J pressed - seek backward");
                    HandleSeekBackwardShortcut();
                    e.Handled = true;
                    break;

                case Key.L:
                    Log("UI ACTION: Keyboard shortcut L pressed - seek forward");
                    HandleSeekForwardShortcut();
                    e.Handled = true;
                    break;

                case Key.R:
                    Log("UI ACTION: Keyboard shortcut R pressed - random video");
                    HandleRandomShortcut(); // same as 🎲 button
                    e.Handled = true;
                    break;

                case Key.Left:
                    Log("UI ACTION: Keyboard shortcut Left Arrow pressed - previous video");
                    HandlePreviousShortcut(); // same as ⏮ button
                    e.Handled = true;
                    break;

                case Key.Right:
                    Log("UI ACTION: Keyboard shortcut Right Arrow pressed - next video");
                    HandleNextShortcut(); // same as ⏭ button
                    e.Handled = true;
                    break;

                case Key.F:
                    HandleFavoriteShortcut(); // toggle ★
                    e.Handled = true;
                    break;

                case Key.A:
                    HandleAutoPlayNextShortcut(); // toggle ➡️
                    e.Handled = true;
                    break;

                case Key.M:
                    HandleMuteShortcut(); // same as 🔇 button
                    e.Handled = true;
                    break;

                case Key.B:
                    HandleBlacklistShortcut(); // same as 👎 toggle
                    e.Handled = true;
                    break;

                case Key.O:
                    // Allow both O and Ctrl+O for browse
                    if ((e.KeyModifiers & KeyModifiers.Control) != 0 || e.KeyModifiers == KeyModifiers.None)
                    {
                        HandleBrowseShortcut();
                        e.Handled = true;
                    }
                    break;

                case Key.Q:
                    // Allow both Q and Ctrl+Q for quit
                    if ((e.KeyModifiers & KeyModifiers.Control) != 0 || e.KeyModifiers == KeyModifiers.None)
                    {
                        HandleQuitShortcut();
                        e.Handled = true;
                    }
                    break;

                case Key.Space:
                    // IMPORTANT: Space should NOT trigger anything at app level
                    // and should NOT "click last button".
                    // If we are here, focus is NOT in a TextBox, so swallow it:
                    e.Handled = true;
                    break;

                case Key.OemComma:
                    // Comma: Volume down
                    HandleVolumeDownShortcut();
                    e.Handled = true;
                    break;

                case Key.OemPeriod:
                    // Period: Volume up
                    HandleVolumeUpShortcut();
                    e.Handled = true;
                    break;

                case Key.T:
                    HandleManageTagsShortcut(); // same as 🏷️ button
                    e.Handled = true;
                    break;

                case Key.P:
                    // Player view mode toggle
                    _isPlayerViewMode = !_isPlayerViewMode;
                    if (PlayerViewModeMenuItem != null)
                    {
                        PlayerViewModeMenuItem.IsChecked = _isPlayerViewMode;
                    }
                    ApplyPlayerViewMode();
                    SaveSettings();
                    e.Handled = true;
                    break;

                case Key.S:
                    // Open Settings dialog
                    Log("UI ACTION: Keyboard shortcut S pressed - opening Settings");
                    SettingsMenuItem_Click(sender, e);
                    e.Handled = true;
                    break;

                case Key.D1: // Number 1 - Show Menu
                    ToggleViewPreference(ref _showMenu, ShowMenuMenuItem);
                    e.Handled = true;
                    break;

                case Key.D2: // Number 2 - Show Status Line
                    ToggleViewPreference(ref _showStatusLine, ShowStatusMenuItem);
                    e.Handled = true;
                    break;

                case Key.D3: // Number 3 - Show Controls
                    ToggleViewPreference(ref _showControls, ShowControlsMenuItem);
                    e.Handled = true;
                    break;

                case Key.D4: // Number 4 - Show Library Panel
                    ToggleViewPreference(ref _showLibraryPanel, ShowLibraryPanelMenuItem);
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    e.Handled = true;
                    break;

                case Key.D5: // Number 5 - Show Stats Panel
                    ToggleViewPreference(ref _showStatsPanel, ShowStatsMenuItem);
                    e.Handled = true;
                    break;

                case Key.D6: // Number 6 - (removed - was Favorites panel, now use Library panel)
                    e.Handled = true;
                    break;

                case Key.D7: // Number 7 - (removed - was Recently Played panel, now use Library panel)
                    e.Handled = true;
                    break;

                case Key.D8: // Number 8 - (removed - was Stats panel, now D5)
                    e.Handled = true;
                    break;

                default:
                    // Leave other keys alone
                    break;
            }
        }

        // Helper method for toggling view preferences via keyboard shortcuts
        private void ToggleViewPreference(ref bool flag, MenuItem? menuItem)
        {
            // Special case: ShowMenu can be toggled even in player view mode
            // (but menu will remain hidden while player view mode is active)
            bool isShowMenu = (menuItem == ShowMenuMenuItem);
            
            // Don't toggle other view prefs if in player view mode
            if (_isPlayerViewMode && !isShowMenu)
            {
                return;
            }
            
            flag = !flag;
            if (menuItem != null)
            {
                menuItem.IsChecked = flag;
            }
            SaveSettings();
            ApplyViewPreferences();
        }

        // Helper methods for shortcuts - thin wrappers around existing button handlers
        private void HandlePlayPauseShortcut()
        {
            TogglePlayPause();
        }

        private void HandlePreviousShortcut()
        {
            PreviousButton_Click(this, new RoutedEventArgs());
        }

        private void HandleNextShortcut()
        {
            // Only proceed if there's a next video in the timeline (same check as button enabled state)
            if (_playbackTimeline.Count == 0 || _timelineIndex >= _playbackTimeline.Count - 1)
            {
                return; // No next video, do nothing (user can use "R" for random)
            }
            NextButton_Click(this, new RoutedEventArgs());
        }

        private void HandleRandomShortcut()
        {
            PlayRandom_Click(this, new RoutedEventArgs());
        }

        private void HandleFavoriteShortcut()
        {
            if (!string.IsNullOrEmpty(_currentVideoPath))
            {
                FavoriteToggle.IsChecked = !FavoriteToggle.IsChecked;
            }
        }

        private void HandleAutoPlayNextShortcut()
        {
            AutoPlayNextCheckBox.IsChecked = !AutoPlayNextCheckBox.IsChecked;
        }

        private void HandleMuteShortcut()
        {
            MuteButton.IsChecked = !MuteButton.IsChecked;
        }

        private void HandleManageTagsShortcut()
        {
            if (!string.IsNullOrEmpty(_currentVideoPath))
            {
                ManageTagsForCurrentVideo_Click(this, new RoutedEventArgs());
            }
        }

        private void HandleBlacklistShortcut()
        {
            if (!string.IsNullOrEmpty(_currentVideoPath))
            {
                BlacklistToggle.IsChecked = !BlacklistToggle.IsChecked;
            }
        }

        private void HandleBrowseShortcut()
        {
            // Browse functionality removed - use ImportFolderMenuItem_Click instead
            ImportFolderMenuItem_Click(this, new RoutedEventArgs());
        }

        private void HandleQuitShortcut()
        {
            Close();
        }

        private void HandleSeekBackwardShortcut()
        {
            SeekBackward();
        }

        private void HandleSeekForwardShortcut()
        {
            SeekForward();
        }

        private void HandleVolumeDownShortcut()
        {
            if (_mediaPlayer == null)
                return;

            // Update user preference (slider value)
            var newPreference = Math.Max(0, _userVolumePreference - _volumeStep);
            _userVolumePreference = newPreference;
            VolumeSlider.Value = newPreference;

            // Apply normalization if enabled
            if (_volumeNormalizationEnabled && !string.IsNullOrEmpty(_currentVideoPath))
            {
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null && info.HasAudio == true)
                {
                    var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    _mediaPlayer.Volume = newPreference;
                }
            }
            else
            {
                _mediaPlayer.Volume = newPreference;
            }

            // Update mute button state
            if (newPreference == 0)
            {
                MuteButton.IsChecked = true;
            }
            else
            {
                MuteButton.IsChecked = false;
                _lastNonZeroVolume = newPreference;
            }
            
            UpdateVolumeTooltip();
        }

        private void HandleVolumeUpShortcut()
        {
            if (_mediaPlayer == null)
                return;

            // Update user preference (slider value)
            var newPreference = Math.Min(200, _userVolumePreference + _volumeStep);
            _userVolumePreference = newPreference;
            VolumeSlider.Value = newPreference;

            // Apply normalization if enabled
            if (_volumeNormalizationEnabled && !string.IsNullOrEmpty(_currentVideoPath))
            {
                var info = GetLoudnessInfoFromLibrary(_currentVideoPath);

                if (info != null && info.HasAudio == true)
                {
                    var finalVolume = CalculateNormalizedVolume(info, _userVolumePreference);
                    _mediaPlayer.Volume = finalVolume;
                }
                else
                {
                    _mediaPlayer.Volume = newPreference;
                }
            }
            else
            {
                _mediaPlayer.Volume = newPreference;
            }

            // Update mute button state
            if (newPreference == 0)
            {
                MuteButton.IsChecked = true;
            }
            else
            {
                MuteButton.IsChecked = false;
                _lastNonZeroVolume = newPreference;
            }
            
            UpdateVolumeTooltip();
        }

        private void TogglePlayPause()
        {
            Log($"TogglePlayPause: Starting - CurrentVideoPath: {_currentVideoPath ?? "null"}");
            
            if (_mediaPlayer == null)
            {
                Log("TogglePlayPause: ERROR - MediaPlayer is null");
                return;
            }

            // If no media loaded, try to play random
            if (_currentMedia == null)
            {
                Log("TogglePlayPause: No media loaded - playing random video");
                PlayRandomVideo();
                return;
            }

            // Decide based purely on the actual player state
            var wasPlaying = _mediaPlayer.IsPlaying;
            if (wasPlaying)
            {
                Log("TogglePlayPause: Media is playing - pausing");
                _mediaPlayer.Pause();
                Log("TogglePlayPause: Media paused");
            }
            else
            {
                // Only try to play if there is already media loaded
                if (_mediaPlayer.Media != null)
                {
                    Log("TogglePlayPause: Media is paused - playing");
                    _mediaPlayer.Play();
                    Log("TogglePlayPause: Media play command issued");
                }
                else
                {
                    Log("TogglePlayPause: Media player has no media loaded");
                }
            }
            // Note: Button state (IsChecked) is updated by MediaPlayer Playing/Paused/Stopped events
        }

        private void SeekForward()
        {
            Log($"SeekForward: Starting - SeekStep: {_seekStep}");
            
            if (_mediaPlayer == null || _currentMedia == null)
            {
                Log("SeekForward: ERROR - MediaPlayer or CurrentMedia is null");
                return;
            }

            if (_seekStep == "Frame")
            {
                Log("SeekForward: Frame step mode - stepping forward one frame");
                // Frame step forward - pause first if playing, then step frame
                if (_mediaPlayer.IsPlaying)
                {
                    Log("SeekForward: Media is playing - pausing before frame step");
                    _mediaPlayer.Pause();
                    PlayPauseButton.IsChecked = false;
                }
                _mediaPlayer.NextFrame();
                Log("SeekForward: Frame step forward completed");
                // Timer will update slider and status time
            }
            else
            {
                // Time-based seek - works whether playing or paused
                var seconds = ParseSeekStep(_seekStep);
                if (seconds.HasValue)
                {
                    var currentTime = _mediaPlayer.Time;
                    var mediaLength = _currentMedia.Duration;
                    var newTime = currentTime + (long)(seconds.Value * 1000);
                    // Clamp to [0, mediaLength]
                    newTime = Math.Max(0, Math.Min(mediaLength, newTime));
                    
                    Log($"SeekForward: Time-based seek - Current: {currentTime}ms ({currentTime / 1000.0:F2}s), Step: {seconds.Value}s, New: {newTime}ms ({newTime / 1000.0:F2}s), Length: {mediaLength}ms ({mediaLength / 1000.0:F2}s)");
                    
                    _mediaPlayer.Time = newTime;
                    Log("SeekForward: Seek completed");
                    // Timer will update slider and status time
                }
                else
                {
                    Log($"SeekForward: ERROR - Could not parse seek step: {_seekStep}");
                }
            }
        }

        private void SeekBackward()
        {
            Log($"SeekBackward: Starting - SeekStep: {_seekStep}");
            
            if (_mediaPlayer == null || _currentMedia == null)
            {
                Log("SeekBackward: ERROR - MediaPlayer or CurrentMedia is null");
                return;
            }

            if (_seekStep == "Frame")
            {
                Log("SeekBackward: Frame step mode - backward frame stepping not supported by LibVLC, no-op");
                // Frame step backward - LibVLC doesn't support backward frame stepping
                // In Frame mode, backward seek is a no-op
                // Note: LibVLC doesn't have direct backward frame step, so backward seek in Frame mode does nothing
                return;
            }
            else
            {
                // Time-based seek - works whether playing or paused
                var seconds = ParseSeekStep(_seekStep);
                if (seconds.HasValue)
                {
                    var currentTime = _mediaPlayer.Time;
                    var newTime = Math.Max(0, currentTime - (long)(seconds.Value * 1000));
                    
                    Log($"SeekBackward: Time-based seek - Current: {currentTime}ms ({currentTime / 1000.0:F2}s), Step: {seconds.Value}s, New: {newTime}ms ({newTime / 1000.0:F2}s)");
                    
                    _mediaPlayer.Time = newTime;
                    Log("SeekBackward: Seek completed");
                    // Timer will update slider and status time
                }
                else
                {
                    Log($"SeekBackward: ERROR - Could not parse seek step: {_seekStep}");
                }
            }
        }

        private double? ParseSeekStep(string step)
        {
            return step switch
            {
                "1s" => 1.0,
                "5s" => 5.0,
                "10s" => 10.0,
                _ => null
            };
        }


        private void SavePlaybackSettings(params string[] changedSettings)
        {
            var settingsList = changedSettings != null && changedSettings.Length > 0 
                ? string.Join(", ", changedSettings) 
                : null;

            // Save unified settings (synchronous since SaveSettings is already lightweight)
            SaveSettings();
            
            // Show status message if settings were changed
            if (settingsList != null)
            {
                Dispatcher.UIThread.Post(() =>
                {
                    StatusTextBlock.Text = $"Settings updated: {settingsList}";
                });
            }
        }

        #endregion
    }

    // Settings classes for persistence
    public class PlaybackSettings
    {
        public string? SeekStep { get; set; }
        public int VolumeStep { get; set; }
        public string? MinDuration { get; set; }
        public string? MaxDuration { get; set; }
        public double? IntervalSeconds { get; set; }
        public bool VolumeNormalizationEnabled { get; set; } = false;
        public AudioFilterMode AudioFilterMode { get; set; } = AudioFilterMode.PlayAll;
    }

    // Playback stats data model
    public class FilePlaybackStats
    {
        public int PlayCount { get; set; }
        public DateTime? LastPlayedUtc { get; set; }
    }

    // Loudness data model
    public class FileLoudnessInfo
    {
        public double MeanVolumeDb { get; set; }
        public double PeakDb { get; set; }
        public bool? HasAudio { get; set; }  // null = unknown, true = has audio, false = no audio
    }

    // FFmpeg log entry
    public class FFmpegLogEntry
    {
        public DateTime Timestamp { get; set; }
        public string FilePath { get; set; } = "";
        public int ExitCode { get; set; }
        public string Output { get; set; } = "";
        public string Result { get; set; } = ""; // "Success", "No Audio", "Error"
    }

    // Value converter for path to filename
    public class PathToFileNameConverter : IValueConverter
    {
        public static readonly PathToFileNameConverter Instance = new();

        public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        {
            if (value is string path && !string.IsNullOrEmpty(path))
            {
                return System.IO.Path.GetFileName(path);
            }
            return value?.ToString() ?? string.Empty;
        }

        public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}




