using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Data.Converters;
using Avalonia.Input;
using Avalonia.Input.Platform;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using LibVLCSharp.Shared;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ReelRoulette.LibraryArchive;
using System.Timers;
using ReelRoulette.Core.Storage;

namespace ReelRoulette
{
    public enum ImageScalingMode
    {
        Off = 0,      // No scaling
        Auto = 1,     // Scale based on screen size
        Fixed = 2     // Scale to fixed maximum dimensions
    }

    public partial class MainWindow : Window, INotifyPropertyChanged, ITagMutationClient
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

        // Randomization mode state (runtime-only, rebuilt as eligible-set changes)
        private readonly RandomizationRuntimeState _desktopRandomizationState = new();
        private readonly object _desktopRandomizationLock = new object();
        private RandomizationMode _randomizationMode = RandomizationMode.SmartShuffle;
        private int _isHandlingEndReached = 0;
        private int _suppressStopForEndReachedTransition = 0;

        // Current video tracking
        private string? _currentVideoPath;
        private string? _currentPlaybackSource;
        private FromType _currentPlaybackSourceType = FromType.FromPath;
        // Store the previous LastPlayedUtc for the current video (before current play) for display purposes
        private DateTime? _previousLastPlayedUtc;
        private bool _isLoopEnabled = true;
        private bool _autoPlayNext = true;
        private bool _forceApiPlayback;
        private DuplicateHandlingDefaultBehavior _duplicateHandlingDefaultBehavior = DuplicateHandlingDefaultBehavior.KeepAll;
        private bool _isMuted = false; // Track mute state for persistence

        // Photo playback
        private System.Timers.Timer? _photoDisplayTimer;
        private bool _isCurrentlyPlayingPhoto = false;
        private int _photoDisplayDurationSeconds = 5; // Default 5 seconds
        
        // Image scaling
        private ImageScalingMode _imageScalingMode = ImageScalingMode.Auto;
        private int _fixedImageMaxWidth = 3840;
        private int _fixedImageMaxHeight = 2160;
        
        // Backup settings
        private bool _backupLibraryEnabled = true;
        private int _minimumBackupGapMinutes = 360;
        private int _numberOfBackups = 8;
        private bool _serverBackupSettingsWritable;
        private bool _backupSettingsEnabled = true;
        private int _minimumSettingsBackupGapMinutes = 15;
        private int _numberOfSettingsBackups = 10;
        
        // Auto-refresh settings
        private bool _autoRefreshSourcesEnabled = true;
        private int _autoRefreshIntervalMinutes = 60;
        private bool _forceRescanLoudnessOnNextRefresh;
        private bool _forceRescanDurationOnNextRefresh;
        private int _fingerprintScanMaxDegreeOfParallelism = 4;

        // Web UI settings
        private bool _webRemoteEnabled = false;
        private int _webRemotePort = 45123;
        private bool _webRemoteBindOnLan = false;
        private string _webRemoteLanHostname = "reel";
        private WebUiAuthMode _webRemoteAuthMode = WebUiAuthMode.TokenRequired;
        private string? _webRemoteSharedToken;
        private string _coreServerBaseUrl = "http://localhost:45123";
        private string _independentWebUiBaseUrl = "http://localhost:51302";
        private string _coreClientId = Guid.NewGuid().ToString("N");
        private readonly string _coreSessionId = Guid.NewGuid().ToString("N");
        private long _coreLastEventRevision;
        private readonly CoreServerApiClient _coreServerApiClient;
        private readonly CoreServerApiClient _coreServerLongRunningApiClient;
        private CancellationTokenSource? _coreEventsCancellationSource;
        private Task? _coreEventsTask;
        private CancellationTokenSource? _coreReconnectLoopCancellationSource;
        private Task? _coreReconnectLoopTask;
        private volatile bool _isCoreApiReachable;
        private bool _coreEventsReconnectPending;
        private DateTimeOffset? _lastCoreReconnectAttemptUtc;
        private string? _lastCoreProbeFailureReason;
        private bool _isApplyingCoreSync;
        private static readonly HttpClient _coreServerHttpClient = new()
        {
            Timeout = TimeSpan.FromSeconds(8)
        };
        private static readonly HttpClient _coreServerLongRunningHttpClient = new()
        {
            Timeout = TimeSpan.FromMinutes(3)
        };
        private static readonly HttpClient _coreServerEventsHttpClient = new()
        {
            Timeout = Timeout.InfiniteTimeSpan
        };
        private const int CoreProbeMaxAttempts = 3;
        private const int DesktopApiVersion = 1;
        private static readonly HashSet<int> SupportedCoreApiVersions = [0, 1];
        private static readonly string[] RequiredCoreCapabilities =
        [
            "auth.sessionCookie",
            "identity.sessionId",
            "events.refreshStatusChanged",
            "events.resyncRequired",
            "api.random.filterState",
            "api.presets.match"
        ];

        // Status message throttling (minimum display window + coalescing)
        private DateTime _lastStatusMessageTime = DateTime.MinValue;
        private CancellationTokenSource? _statusMessageCancellation;
        private readonly object _statusMessageLock = new object();
        private volatile bool _suppressStatusUpdatesForLibraryArchive;
        private Cursor? _libraryArchiveCursorRestore;
        
        // Prevent recursive SaveSettings calls when updating UI from settings
        private bool _isApplyingSettings = false;
        private bool _isSettingsDialogOpen = false;
        private bool _isSettingsApplyInProgress = false;
        private bool _isLoadingSettings = false;
        private bool _isProgrammaticUiSync = false;
        
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
        private readonly FilterService _filterService = new FilterService();
        private LibraryIndex? _libraryIndex;
        private FilterState? _currentFilterState;
        private string? _activePresetName; // Track which preset is currently active for display in library panel
        private List<FilterPreset>? _filterPresets; // Store filter presets
        private bool _isUpdatingPresetComboBox = false; // Flag to suppress SelectionChanged event during programmatic updates
        private bool _isUpdatingRandomizationModeComboBox = false;
        private bool _randomizationModeMigrated = false;

        // Library panel state
        private ObservableCollection<LibraryItem> _libraryItems = new ObservableCollection<LibraryItem>();
        private ObservableCollection<LibraryGridRowViewModel> _libraryGridRows = new ObservableCollection<LibraryGridRowViewModel>();
        private ObservableCollection<LibraryGridRowViewModel> _libraryGridVisibleRows = new ObservableCollection<LibraryGridRowViewModel>();
        private readonly List<double> _libraryGridRowTopOffsets = new();
        private readonly List<double> _libraryGridRowBottomOffsets = new();
        private double _libraryGridTotalExtentHeight = 0d;
        private int _lastLibraryGridVisibleStartIndex = -1;
        private int _lastLibraryGridVisibleEndExclusive = -1;
        private int _lastLoggedLibraryGridVisibleStartIndex = -1;
        private int _lastLoggedLibraryGridVisibleEndExclusive = -1;
        private double _libraryGridTopSpacerHeight = 0d;
        private double _libraryGridBottomSpacerHeight = 0d;
        private double _libraryPanelWidth = 400; // Track panel width independently from Bounds (default matches XAML MinWidth)
        private string _librarySearchText = "";
        private string _librarySortMode = "Name"; // "Name", "LastPlayed", "PlayCount", "Duration"
        private bool _librarySortDescending = false;
        private bool _libraryGridViewEnabled = false;
        private int _libraryGridColumns = 2;
        private DateTime _thumbnailIndexLastWriteUtc = DateTime.MinValue;
        private readonly Dictionary<string, (double Width, double Height)> _thumbnailMetadataByItemId = new(StringComparer.OrdinalIgnoreCase);
        private string? _lastAppliedRefreshCompletionRunId;
        private bool _autoTagScanFullLibrary = true;
        
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
        private int _libraryPanelRefreshGeneration = 0;
        private DispatcherTimer? _libraryGridResizeDebounceTimer;
        private bool _isGridScrollInteracting = false;
        private bool _pendingLibraryPanelRefresh = false;
        private bool _isInitializingLibraryPanel = false; // Flag to suppress events during initialization
        private bool _isUpdatingLibraryItems = false; // Flag to suppress Favorite/Blacklist events during UI updates
        private const double LibraryGridVerticalRowGap = 1d;
        
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

        public int LibraryGridColumns
        {
            get => _libraryGridColumns;
            private set
            {
                var clamped = Math.Clamp(value, 1, 8);
                if (_libraryGridColumns != clamped)
                {
                    _libraryGridColumns = clamped;
                    OnPropertyChanged();
                }
            }
        }

        public ObservableCollection<LibraryGridRowViewModel> LibraryGridVisibleRows => _libraryGridVisibleRows;

        public double LibraryGridTopSpacerHeight
        {
            get => _libraryGridTopSpacerHeight;
            private set
            {
                var clamped = Math.Max(0, value);
                if (Math.Abs(_libraryGridTopSpacerHeight - clamped) > 0.5)
                {
                    _libraryGridTopSpacerHeight = clamped;
                    OnPropertyChanged();
                }
            }
        }

        public double LibraryGridBottomSpacerHeight
        {
            get => _libraryGridBottomSpacerHeight;
            private set
            {
                var clamped = Math.Max(0, value);
                if (Math.Abs(_libraryGridBottomSpacerHeight - clamped) > 0.5)
                {
                    _libraryGridBottomSpacerHeight = clamped;
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

        private sealed record PlaybackTarget(
            string StatsPath,
            string PlaybackSource,
            FromType PlaybackSourceType,
            bool IsLocallyAccessible,
            bool UsedApiPath);

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

        private static bool MediaPlayerNeedsVideoViewAttach(MediaPlayer? mediaPlayer)
        {
            if (mediaPlayer == null) return true;
            if (OperatingSystem.IsWindows()) return mediaPlayer.Hwnd == IntPtr.Zero;
            if (OperatingSystem.IsLinux()) return mediaPlayer.XWindow == 0;
            if (OperatingSystem.IsMacOS()) return mediaPlayer.NsObject == IntPtr.Zero;
            return true;
        }

        private void EnsureVideoViewMediaPlayerAttached()
        {
            if (VideoView == null || _mediaPlayer == null) return;
            if (!MediaPlayerNeedsVideoViewAttach(_mediaPlayer)) return;
            var mp = _mediaPlayer;
            VideoView.MediaPlayer = null;
            VideoView.MediaPlayer = mp;
        }

        public MainWindow()
        {
            try
            {
                Log("MainWindow constructor: Starting...");
                Log("MainWindow constructor: Calling InitializeComponent...");
                InitializeComponent();
                Log("MainWindow constructor: InitializeComponent completed.");
                _coreServerApiClient = new CoreServerApiClient(_coreServerHttpClient);
                _coreServerLongRunningApiClient = new CoreServerApiClient(_coreServerLongRunningHttpClient);
            
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
            
            // Create LibVLC instances (Core.Initialize() called in Program.cs).
            // --intf dummy avoids VLC spawning a separate controller window; embedding uses VideoView's native handle.
            _libVLC = new LibVLC(enableDebugLogs: false, "--intf", "dummy");
            _mediaPlayer = new MediaPlayer(_libVLC);
            VideoView.MediaPlayer = _mediaPlayer;
            VideoView.AttachedToVisualTree += (_, _) => EnsureVideoViewMediaPlayerAttached();

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

            _mediaPlayer.EncounteredError += (s, e) =>
            {
                Dispatcher.UIThread.Post(() =>
                {
                    var message = _isCurrentlyPlayingPhoto ? "Photo file not found." : "Video file not found.";
                    SetStatusMessage(message, 0);
                    Log($"MediaPlayer.EncounteredError: {message} (sourceType={_currentPlaybackSourceType}, source={_currentPlaybackSource ?? "null"})");
                });
            };

            // Initialize library system
            _libraryIndex = new LibraryIndex();

            // Load persisted data (includes FilterState)
            LoadSettings();
            UpdateMuteButtonGlyph();
            
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
                    EnsureVideoViewMediaPlayerAttached();

                    // Initialize library panel first so controls are ready
                    Log("MainWindow Loaded event: Initializing Library panel...");
                    InitializeLibraryPanel();
                    Log("MainWindow Loaded event: Library panel initialized successfully.");
                    
                    // Legacy local tag migration dialog is disabled.
                    
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
                                    if (_libraryGridViewEnabled && _showLibraryPanel)
                                    {
                                        UpdateLibraryPanel();
                                    }
                                }
                            }
                        };
                        Log("MainWindow Loaded event: GridSplitter event handler set up.");
                    }

                    StartCoreReconnectLoop();
                    await EnsureCoreRuntimeAvailableAsync();
                    if (_isCoreApiReachable)
                    {
                        EnsureCoreEventStreamStarted();
                    }

                    _ = SyncRefreshSettingsFromCoreAsync();
                    _ = SyncBackupSettingsFromCoreAsync();
                    _ = SyncWebRuntimeSettingsFromCoreAsync();
                    _ = SyncPresetsFromCoreAsync();
                    _ = SyncSourcesFromCoreAsync();
                    _ = SyncRefreshStatusFromCoreAsync();
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

            _coreEventsCancellationSource?.Cancel();
            StopCoreReconnectLoop();

            // Save data
            SaveSettings();
            Log("OnClosed: Settings save completed");
            
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

            _coreEventsCancellationSource?.Dispose();
            _coreEventsCancellationSource = null;
            _coreReconnectLoopCancellationSource?.Dispose();
            _coreReconnectLoopCancellationSource = null;

            base.OnClosed(e);
        }

        private void MediaPlayer_EndReached(object? sender, EventArgs e)
        {
            Log($"MediaPlayer_EndReached: Media playback ended - CurrentVideoPath: {_currentVideoPath ?? "null"}, IsPhoto: {_isCurrentlyPlayingPhoto}");
            // Only handle EndReached for videos - photos use timer
            if (!_isCurrentlyPlayingPhoto)
            {
                if (Interlocked.CompareExchange(ref _isHandlingEndReached, 1, 0) != 0)
                {
                    Log("MediaPlayer_EndReached: EndReached handler already running - skipping duplicate event");
                    return;
                }
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
                            bool advanced = false;
                            await Dispatcher.UIThread.InvokeAsync(() =>
                            {
                                if (_timelineIndex < _playbackTimeline.Count - 1)
                                {
                                    advanced = true;
                                    _isNavigatingTimeline = true;
                                    _timelineIndex++;
                                    var nextVideo = _playbackTimeline[_timelineIndex];
                                    _ = PlayFromPathAsync(nextVideo, addToHistory: false);
                                    PreviousButton.IsEnabled = _timelineIndex > 0;
                                    NextButton.IsEnabled = _playbackTimeline.Count > 0;
                                }
                            });
                            if (!advanced)
                            {
                                Log("PhotoDisplayTimer_Elapsed: Auto-play next enabled - playing random media");
                                await PlayRandomVideoAsync();
                            }
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
                    bool advanced = false;
                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        if (_timelineIndex < _playbackTimeline.Count - 1)
                        {
                            advanced = true;
                            _isNavigatingTimeline = true;
                            _timelineIndex++;
                            var nextVideo = _playbackTimeline[_timelineIndex];
                            _ = PlayFromPathAsync(nextVideo, addToHistory: false);
                            PreviousButton.IsEnabled = _timelineIndex > 0;
                            NextButton.IsEnabled = _playbackTimeline.Count > 0;
                        }
                    });
                    if (!advanced)
                    {
                        Log("HandleEndReachedAsync: Auto-play next enabled - playing random media");
                        Interlocked.Exchange(ref _suppressStopForEndReachedTransition, 1);
                        try
                        {
                            await PlayRandomVideoAsync();
                        }
                        finally
                        {
                            Interlocked.Exchange(ref _suppressStopForEndReachedTransition, 0);
                        }
                    }
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
            finally
            {
                Interlocked.Exchange(ref _isHandlingEndReached, 0);
            }
        }

        #region Favorites System

        private void RefreshLibraryPanelFromServiceState()
        {
            if (!_showLibraryPanel)
            {
                return;
            }

            UpdateLibraryPanel();
        }

        private void ApplyRemoteItemStateProjection(string fullPath, bool isFavorite, bool isBlacklisted, string statusMessage, bool persistLibrary = false)
        {
            if (_libraryIndex == null || string.IsNullOrWhiteSpace(fullPath))
            {
                Log($"CoreEvents: Projection skipped (library unavailable or empty path): '{fullPath ?? "null"}'");
                return;
            }

            var item = _libraryIndex.Items.FirstOrDefault(candidate =>
                string.Equals(candidate.FullPath, fullPath, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                Log($"CoreEvents: Projection skipped (item not found in library): {Path.GetFileName(fullPath)}");
                return;
            }

            _isApplyingCoreSync = true;
            try
            {
                item.IsFavorite = isFavorite;
                item.IsBlacklisted = isBlacklisted;

                // Keep currently bound library-panel item state in sync with canonical projection state.
                // This ensures overlay indicators update immediately even when bound instances differ.
                var boundItem = _libraryItems.FirstOrDefault(listItem =>
                    string.Equals(listItem.FullPath, fullPath, StringComparison.OrdinalIgnoreCase));
                if (boundItem != null && !ReferenceEquals(boundItem, item))
                {
                    boundItem.IsFavorite = isFavorite;
                    boundItem.IsBlacklisted = isBlacklisted;
                }

                var isCurrentItem = string.Equals(_currentVideoPath, fullPath, StringComparison.OrdinalIgnoreCase);
                if (isCurrentItem)
                {
                    FavoriteToggle.IsChecked = isFavorite;
                    BlacklistToggle.IsChecked = isBlacklisted;
                    UpdateCurrentFileStatsUi();
                }

                RefreshLibraryPanelFromServiceState();

                RebuildPlayQueueIfNeeded();
                _ = RefreshGlobalStatsFromCoreAsync();
                StatusTextBlock.Text = statusMessage;
            }
            finally
            {
                _isApplyingCoreSync = false;
            }
        }

        private async void FavoriteToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("FavoriteToggle_Changed: Favorite toggle changed event fired");
            if (_isApplyingCoreSync)
            {
                return;
            }

            if (string.IsNullOrEmpty(_currentVideoPath))
            {
                Log("FavoriteToggle_Changed: No current video path, disabling toggle");
                FavoriteToggle.IsEnabled = false;
                return;
            }

            FavoriteToggle.IsEnabled = true;

            var isFavorite = FavoriteToggle.IsChecked == true;
            Log($"FavoriteToggle_Changed: Setting favorite to {isFavorite} for video: {Path.GetFileName(_currentVideoPath)}");
            var path = _currentVideoPath;
            if (string.IsNullOrWhiteSpace(path))
            {
                return;
            }

            if (_isCoreApiReachable)
            {
                try
                {
                    var state = await _coreServerApiClient.SetFavoriteWithStateAsync(
                        _coreServerBaseUrl,
                        path,
                        isFavorite,
                        _coreClientId,
                        _coreSessionId);
                    if (state == null)
                    {
                        SetStatusMessage("Core runtime rejected favorite update.", 0);
                        return;
                    }

                    ApplyRemoteItemStateProjection(state.Path, state.IsFavorite, state.IsBlacklisted, state.IsFavorite
                        ? $"Added to favorites: {System.IO.Path.GetFileName(path)}"
                        : $"Removed from favorites: {System.IO.Path.GetFileName(path)}");
                    return;
                }
                catch (Exception ex)
                {
                    Log($"FavoriteToggle_Changed: API call failed ({ex.Message})");
                }
            }
            
            SetStatusMessage("Core runtime is required for state changes. Please wait for startup and retry.", 0);
            await EnsureCoreRuntimeAvailableAsync();
            UpdatePerVideoToggleStates();
        }

        #endregion

        #region Blacklist System

        private void BlacklistCurrentVideo()
        {
            // Legacy local-authority path intentionally disabled.
            // Use API-authoritative toggle handlers instead.
        }

        private async Task RemoveFromBlacklistAsync(string videoPath)
        {
            if (_libraryIndex == null || string.IsNullOrWhiteSpace(videoPath))
            {
                return;
            }

            if (_isCoreApiReachable)
            {
                try
                {
                    var state = await _coreServerApiClient.SetBlacklistWithStateAsync(
                        _coreServerBaseUrl,
                        videoPath,
                        false,
                        _coreClientId,
                        _coreSessionId);
                    if (state == null)
                    {
                        SetStatusMessage("Core runtime rejected blacklist update.", 0);
                        return;
                    }

                    ApplyRemoteItemStateProjection(
                        state.Path,
                        state.IsFavorite,
                        state.IsBlacklisted,
                        $"Removed from blacklist: {Path.GetFileName(videoPath)}");
                    return;
                }
                catch (Exception ex)
                {
                    Log($"RemoveFromBlacklist: API call failed ({ex.Message})");
                }
            }
            else
            {
                await EnsureCoreRuntimeAvailableAsync();
            }

            if (!_isCoreApiReachable)
            {
                SetStatusMessage("Core runtime is required for state changes. Please wait for startup and retry.", 0);
                return;
            }
        }

        #endregion

        #region Playback Stats System

        private void RecordPlayback(string path)
        {
            _ = RecordPlaybackViaApiAsync(path);
        }

        private async Task RecordPlaybackViaApiAsync(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return;
            }

            if (_isCoreApiReachable)
            {
                try
                {
                    var success = await _coreServerApiClient.RecordPlaybackAsync(_coreServerBaseUrl, path, _coreClientId, _coreSessionId);
                    if (success)
                    {
                        return;
                    }
                    Log("RecordPlayback: API rejected record-playback request.");
                }
                catch (Exception ex)
                {
                    Log($"RecordPlayback: API call failed ({ex.Message})");
                }
            }
            
            SetStatusMessage("Core runtime is required for playback state updates. Please wait for startup and retry.", 0);
            await EnsureCoreRuntimeAvailableAsync();
        }

        private async Task RecordPlaybackProjectionAsync(string path)
        {
            Log($"RecordPlayback: Starting - path: {path ?? "null"}");
            
            if (string.IsNullOrEmpty(path))
            {
                Log("RecordPlayback: Path is null or empty, returning");
                return;
            }

            if (_libraryIndex != null)
            {
                var item = _libraryIndex.Items.FirstOrDefault(candidate =>
                    string.Equals(candidate.FullPath, path, StringComparison.OrdinalIgnoreCase));
                _previousLastPlayedUtc = item?.LastPlayedUtc;
            }

            await SyncLibraryProjectionFromCoreAsync();
            UpdateCurrentFileStatsUi();
            Log("RecordPlayback: Completed");
        }

        private bool TryApplyPlaybackProjectionFromEvent(CorePlaybackRecordedPayload playback)
        {
            if (_libraryIndex == null || string.IsNullOrWhiteSpace(playback.Path))
            {
                return false;
            }

            var item = _libraryIndex.Items.FirstOrDefault(candidate =>
                string.Equals(candidate.FullPath, playback.Path, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                return false;
            }

            _previousLastPlayedUtc = item.LastPlayedUtc;
            item.PlayCount = Math.Max(0, playback.PlayCount ?? (item.PlayCount + 1));
            item.LastPlayedUtc = playback.LastPlayedUtc?.ToUniversalTime() ?? DateTime.UtcNow;

            UpdateCurrentFileStatsUi();
            _ = RefreshGlobalStatsFromCoreAsync();

            var playbackSensitiveSort = _librarySortMode is "LastPlayed" or "PlayCount" or "Duration";
            if (_showLibraryPanel && ((_currentFilterState?.OnlyNeverPlayed ?? false) || playbackSensitiveSort))
            {
                UpdateLibraryPanel();
            }

            return true;
        }

        private void RecalculateGlobalStats()
        {
            _ = RefreshGlobalStatsFromCoreAsync();
        }

        private async Task RefreshGlobalStatsFromCoreAsync()
        {
            var stats = await FetchLibraryStatsViaCoreAsync();
            await Dispatcher.UIThread.InvokeAsync(() => ApplyGlobalStats(stats));
        }

        private void ApplyGlobalStats(CoreLibraryStatsResponse? stats)
        {
            var global = stats?.Global;
            GlobalTotalVideosKnown = global?.TotalVideos ?? 0;
            GlobalTotalPhotosKnown = global?.TotalPhotos ?? 0;
            GlobalTotalMediaKnown = global?.TotalMedia ?? 0;
            GlobalFavoritesCount = global?.Favorites ?? 0;
            GlobalBlacklistCount = global?.Blacklisted ?? 0;
            GlobalUniqueVideosPlayed = global?.UniquePlayedVideos ?? 0;
            GlobalUniquePhotosPlayed = global?.UniquePlayedPhotos ?? 0;
            GlobalUniqueMediaPlayed = global?.UniquePlayedMedia ?? 0;
            GlobalTotalPlays = global?.TotalPlays ?? 0;
            GlobalNeverPlayedVideosKnown = global?.NeverPlayedVideos ?? 0;
            GlobalNeverPlayedPhotosKnown = global?.NeverPlayedPhotos ?? 0;
            GlobalNeverPlayedMediaKnown = global?.NeverPlayedMedia ?? 0;
            GlobalVideosWithAudio = global?.VideosWithAudio ?? 0;
            GlobalVideosWithoutAudio = global?.VideosWithoutAudio ?? 0;

            if (_volumeNormalizationEnabled && GlobalVideosWithAudio > 0)
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

            Log($"CoreLibraryStats: Applied stats from API - Videos: {GlobalTotalVideosKnown}, Photos: {GlobalTotalPhotosKnown}, Total Media: {GlobalTotalMediaKnown}, Favorites: {GlobalFavoritesCount}, Blacklisted: {GlobalBlacklistCount}, Total Plays: {GlobalTotalPlays}");
            if (stats != null)
            {
                UpdateLibraryInfoText();
            }
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
            if (_currentFilterState.IncludedSourceIds != null && _currentFilterState.IncludedSourceIds.Count > 0)
            {
                var sourceCount = _currentFilterState.IncludedSourceIds.Count;
                if (_libraryIndex != null)
                {
                    var sourceNames = _libraryIndex.Sources
                        .Where(source => _currentFilterState.IncludedSourceIds.Contains(source.Id, StringComparer.OrdinalIgnoreCase))
                        .Select(source => string.IsNullOrWhiteSpace(source.DisplayName) ? source.Id : source.DisplayName)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                    if (sourceNames.Count == 1)
                    {
                        filterParts.Add($"Source: {sourceNames[0]}");
                    }
                    else if (sourceNames.Count > 1)
                    {
                        filterParts.Add($"Sources: {sourceNames.Count}");
                    }
                    else
                    {
                        filterParts.Add($"Sources: {sourceCount}");
                    }
                }
                else
                {
                    filterParts.Add($"Sources: {sourceCount}");
                }
            }
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
                item = FindProjectionItemByPath(path);
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

        #region Library Panel

        private static void Log(string message)
        {
            ClientLogRelay.Log("desktop-main-window", message);
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

                if (LibraryGridItemsControl != null)
                {
                    LibraryGridItemsControl.ItemsSource = _libraryGridVisibleRows;
                }

                if (LibraryGridViewToggle != null)
                {
                    LibraryGridViewToggle.IsChecked = _libraryGridViewEnabled;
                }

                UpdateLibraryViewModeVisibility();
                
                // Set default sort
                Log("  Setting default sort...");
                if (LibrarySortComboBox != null && LibrarySortComboBox.Items.Count > 0)
                {
                    LibrarySortComboBox.SelectedIndex = 0;
                    _librarySortMode = "Name";
                    _librarySortDescending = false;
                    UpdateSortDirectionButton();
                    Log("  Sort set to index 0.");
                }
                else
                {
                    Log($"  WARNING: LibrarySortComboBox is null or empty (null: {LibrarySortComboBox == null}, count: {LibrarySortComboBox?.Items.Count ?? -1})");
                }
                
                // Initialize preset combo box
                Log("  Updating preset combo box...");
                UpdateLibraryPresetComboBox();
                UpdateRandomizationModeComboBox();
                
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
                    
                    // Show startup status based on connection + projection availability.
                    if (!_isCoreApiReachable)
                    {
                        StatusTextBlock.Text = BuildCoreReconnectWaitingStatusText();
                        Log("InitializeLibraryPanel: Waiting for core runtime reconnect.");
                    }
                    else if (_libraryIndex.Items.Count > 0)
                    {
                        StatusTextBlock.Text = "Core runtime connected. Library loaded.";
                        Log("InitializeLibraryPanel: Connected with populated library projection.");
                    }
                    else
                    {
                        StatusTextBlock.Text = "Core runtime connected. No media in server library.";
                        Log("InitializeLibraryPanel: Connected with empty server library projection.");
                    }
                }
                else
                {
                    Log("  WARNING: _libraryIndex is null, skipping UpdateLibraryPanel()");
                    LibraryInfoText = "Library • 🎞️ 0 videos • 📷 0 photos";
                    UpdateFilterSummaryText();
                    StatusTextBlock.Text = BuildCoreReconnectWaitingStatusText();
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

        private void UpdateLibraryPanel()
        {
            var refreshGeneration = Interlocked.Increment(ref _libraryPanelRefreshGeneration);
            if (_libraryGridViewEnabled && _isGridScrollInteracting)
            {
                _pendingLibraryPanelRefresh = true;
                Log($"UpdateLibraryPanel: Deferring refresh during grid scroll interaction (generation={refreshGeneration})");
                return;
            }

            _pendingLibraryPanelRefresh = false;

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
                    var timerGeneration = Volatile.Read(ref _libraryPanelRefreshGeneration);
                    
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
                        await UpdateLibraryPanelInternal(cancellationToken, timerGeneration);
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

        private async Task UpdateLibraryPanelInternal(CancellationToken cancellationToken, int refreshGeneration)
        {
            try
            {
                Log("UpdateLibraryPanel: Starting");
                if (_libraryIndex == null)
                {
                    Log("UpdateLibraryPanel: _libraryIndex is null, returning.");
                    return;
                }

                Log($"UpdateLibraryPanel: Processing {_libraryIndex.Items.Count} items, sort: {_librarySortMode}, descending: {_librarySortDescending}, search: '{_librarySearchText}'");
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

                        // Apply FilterState whenever one is active.
                        bool shouldApplyFilterState = _currentFilterState != null;
                        
                        if (shouldApplyFilterState && _currentFilterState != null)
                        {
                            Log("UpdateLibraryPanel: Applying FilterState...");
                            // Use BuildEligibleSetWithoutFileCheck for performance - file existence will be checked when video is played
                            var eligibleItems = _filterService.BuildEligibleSetWithoutFileCheck(_currentFilterState, _libraryIndex).ToList();
                            Log($"UpdateLibraryPanel: FilterService returned {eligibleItems.Count} eligible items.");
                            var eligiblePaths = new HashSet<string>(
                                eligibleItems.Select(eligible => eligible.FullPath),
                                StringComparer.OrdinalIgnoreCase);
                            items = items.Where(item => eligiblePaths.Contains(item.FullPath)).ToList();
                            Log($"UpdateLibraryPanel: After FilterState: {items.Count} items.");
                        }
                        else
                        {
                            Log("UpdateLibraryPanel: Skipping FilterState (no active filter state)");
                        }

                        // Apply sorting
                        items = ApplySort(items);
                        Log($"UpdateLibraryPanel: After sorting: {items.Count} items. Final count ready for UI.");
                        PopulateThumbnailPaths(items);

                        // Update UI on UI thread
                        Log("UpdateLibraryPanel: Posting to UI thread...");
                        Dispatcher.UIThread.Post(async () =>
                        {
                            try
                            {
                                if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                                {
                                    Log($"UpdateLibraryPanel: Skipping stale UI apply (generation={refreshGeneration}, latest={Volatile.Read(ref _libraryPanelRefreshGeneration)})");
                                    return;
                                }

                                Log($"UpdateLibraryPanel: UI thread callback started, about to add {items.Count} items");

                                // Preserve grid scroll offset across row rebuilds to prevent jumpy drag/scroll behavior.
                                var shouldRestoreGridOffset = _libraryGridViewEnabled && LibraryGridScrollViewer != null && !_isGridScrollInteracting;
                                var shouldRestoreListAnchor = !_libraryGridViewEnabled;
                                var gridOffsetYBeforeUpdate = shouldRestoreGridOffset
                                    ? LibraryGridScrollViewer!.Offset.Y
                                    : 0d;
                                var gridViewportAnchor = shouldRestoreGridOffset
                                    ? CaptureGridViewportAnchor()
                                    : null;
                                
                                // Save scroll position anchor before clearing (first visible item)
                                if (shouldRestoreListAnchor && LibraryListBox != null && _libraryItems.Count > 0)
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
                                    var firstChangedItemIndex = await ApplyLibraryItemsDiffChunkedAsync(items, cancellationToken, refreshGeneration);
                                    if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                                    {
                                        return;
                                    }

                                    await RebuildLibraryGridRowsIncrementalAsync(_libraryItems.ToList(), firstChangedItemIndex, cancellationToken, refreshGeneration);
                                    if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                                    {
                                        return;
                                    }

                                    UpdateLibraryViewModeVisibility();
                                    Log($"UpdateLibraryPanel: UI thread callback completed. _libraryItems now has {_libraryItems.Count} items. LibraryListBox.ItemsSource is set: {LibraryListBox?.ItemsSource != null}, LibraryListBox.IsVisible: {LibraryListBox?.IsVisible}, LibraryPanelContainer.IsVisible: {LibraryPanelContainer?.IsVisible}");

                                    if (shouldRestoreGridOffset)
                                    {
                                        Dispatcher.UIThread.Post(() =>
                                        {
                                            if (LibraryGridScrollViewer == null || _isGridScrollInteracting)
                                            {
                                                return;
                                            }

                                            var maxY = Math.Max(0, LibraryGridScrollViewer.Extent.Height - LibraryGridScrollViewer.Viewport.Height);
                                            var restoredY = gridViewportAnchor != null
                                                ? RestoreGridViewportAnchor(gridViewportAnchor)
                                                : gridOffsetYBeforeUpdate;
                                            var clampedY = Math.Clamp(restoredY, 0, maxY);
                                            LibraryGridScrollViewer.Offset = new Vector(LibraryGridScrollViewer.Offset.X, clampedY);
                                        }, DispatcherPriority.Loaded);
                                    }
                                    
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
                                    if (shouldRestoreListAnchor && _scrollAnchorPath != null && LibraryListBox != null)
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
                                        if (shouldRestoreListAnchor && _scrollAnchorPath != null && LibraryListBox == null)
                                        {
                                            Log($"UpdateLibraryPanel: Scroll anchor exists but LibraryListBox is null - cannot restore scroll position");
                                        }
                                        else if (shouldRestoreListAnchor && _scrollAnchorPath == null)
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
                        }, DispatcherPriority.Background);
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

        private List<LibraryItem> ApplySort(List<LibraryItem> items)
        {
            IEnumerable<LibraryItem> sorted = _librarySortMode switch
            {
                "LastPlayed" => _librarySortDescending
                    ? items.OrderByDescending(item => item.LastPlayedUtc ?? DateTime.MinValue)
                    : items.OrderBy(item => item.LastPlayedUtc ?? DateTime.MinValue),
                "PlayCount" => _librarySortDescending
                    ? items.OrderByDescending(item => item.PlayCount)
                    : items.OrderBy(item => item.PlayCount),
                "Duration" => _librarySortDescending
                    ? items.OrderByDescending(item => item.Duration ?? TimeSpan.Zero)
                    : items.OrderBy(item => item.Duration ?? TimeSpan.Zero),
                _ => _librarySortDescending
                    ? items.OrderByDescending(item => item.FileName, StringComparer.OrdinalIgnoreCase)
                    : items.OrderBy(item => item.FileName, StringComparer.OrdinalIgnoreCase)
            };

            return sorted.ToList();
        }

        private List<LibraryItem> GetSelectedLibraryItems()
        {
            var selectedItems = new List<LibraryItem>();
            foreach (var path in _selectedItemPaths)
            {
                var item = FindProjectionItemByPath(path);
                if (item != null)
                {
                    selectedItems.Add(item);
                }
            }
            return selectedItems;
        }

        private LibraryItem? FindProjectionItemByPath(string? fullPath)
        {
            if (_libraryIndex == null || string.IsNullOrWhiteSpace(fullPath))
            {
                return null;
            }

            return _libraryIndex.Items.FirstOrDefault(item =>
                string.Equals(item.FullPath, fullPath, StringComparison.OrdinalIgnoreCase));
        }

        private List<LibraryItem> GetAutoTagScopeItems(bool scanFullLibrary)
        {
            if (_libraryIndex == null)
            {
                return new List<LibraryItem>();
            }

            if (scanFullLibrary)
            {
                return _libraryIndex.Items.ToList();
            }

            var enabledSourceIds = _libraryIndex.Sources
                .Where(s => s.IsEnabled)
                .Select(s => s.Id)
                .ToHashSet();
            return _libraryIndex.Items
                .Where(item => enabledSourceIds.Contains(item.SourceId))
                .ToList();
        }

        private List<LibraryItem> GetCurrentFilteredLibraryItems()
        {
            if (_libraryIndex == null)
            {
                return new List<LibraryItem>();
            }

            var items = _libraryIndex.Items.ToList();

            // Match library panel behavior for "current filtered/visible items".
            var enabledSourceIds = _libraryIndex.Sources
                .Where(s => s.IsEnabled)
                .Select(s => s.Id)
                .ToHashSet();
            items = items.Where(item => enabledSourceIds.Contains(item.SourceId)).ToList();

            if (!string.IsNullOrWhiteSpace(_librarySearchText))
            {
                var searchLower = _librarySearchText.ToLowerInvariant();
                items = items.Where(item =>
                    item.FileName.ToLowerInvariant().Contains(searchLower) ||
                    item.RelativePath.ToLowerInvariant().Contains(searchLower)
                ).ToList();
            }

            bool shouldApplyFilterState = _currentFilterState != null;

            if (shouldApplyFilterState && _currentFilterState != null)
            {
                var eligibleItems = _filterService.BuildEligibleSetWithoutFileCheck(_currentFilterState, _libraryIndex);
                var eligiblePaths = new HashSet<string>(
                    eligibleItems.Select(i => i.FullPath),
                    StringComparer.OrdinalIgnoreCase);
                items = items.Where(item => eligiblePaths.Contains(item.FullPath)).ToList();
            }

            return ApplySort(items);
        }

        private static bool ContainsTagCaseInsensitive(List<string>? tags, string tagName)
        {
            if (tags == null)
            {
                return false;
            }

            return tags.Any(tag => string.Equals(tag, tagName, StringComparison.OrdinalIgnoreCase));
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

        private void LibraryGridViewToggle_Changed(object? sender, RoutedEventArgs e)
        {
            _libraryGridViewEnabled = LibraryGridViewToggle?.IsChecked == true;
            Log($"UI ACTION: LibraryGridViewToggle changed to: {_libraryGridViewEnabled}");
            UpdateLibraryViewModeVisibility();
            SaveSettings();

            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
        }

        private void LibraryPanelContainer_SizeChanged(object? sender, SizeChangedEventArgs e)
        {
            if (!_libraryGridViewEnabled || !_showLibraryPanel)
            {
                return;
            }

            if (Math.Abs(e.NewSize.Width - e.PreviousSize.Width) < 1)
            {
                return;
            }

            if (_libraryGridResizeDebounceTimer == null)
            {
                _libraryGridResizeDebounceTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromMilliseconds(90)
                };
                _libraryGridResizeDebounceTimer.Tick += (_, _) =>
                {
                    _libraryGridResizeDebounceTimer.Stop();
                    if (!_libraryGridViewEnabled || !_showLibraryPanel)
                    {
                        return;
                    }

                    RebuildLibraryGridRowsFromCurrentItems();
                };
            }

            _libraryGridResizeDebounceTimer.Stop();
            _libraryGridResizeDebounceTimer.Start();
        }

        private void UpdateLibraryViewModeVisibility()
        {
            if (LibraryListBox != null)
            {
                LibraryListBox.IsVisible = !_libraryGridViewEnabled;
            }

            if (LibraryGridScrollViewer != null)
            {
                LibraryGridScrollViewer.IsVisible = _libraryGridViewEnabled;
            }

            if (_libraryGridViewEnabled)
            {
                RebuildLibraryGridOffsetIndex();
                UpdateLibraryGridVisibleRowsWindow(forceRefreshRows: true);
            }
        }

        private bool ShouldAbortLibraryPanelRefresh(CancellationToken cancellationToken, int refreshGeneration)
        {
            if (cancellationToken.IsCancellationRequested ||
                refreshGeneration != Volatile.Read(ref _libraryPanelRefreshGeneration))
            {
                return true;
            }

            if (_libraryGridViewEnabled && _isGridScrollInteracting)
            {
                _pendingLibraryPanelRefresh = true;
                return true;
            }

            return false;
        }

        private sealed class ItemDiffWindow
        {
            public int StartIndex { get; init; }
            public int OldCount { get; init; }
            public int NewCount { get; init; }
            public bool HasChanges { get; init; }
        }

        private sealed class GridViewportAnchorState
        {
            public string AnchorItemKey { get; init; } = string.Empty;
            public double InsetY { get; init; }
            public double RawOffsetY { get; init; }
        }

        private string GetLibraryItemKey(LibraryItem item)
        {
            if (!string.IsNullOrWhiteSpace(item.Id))
            {
                return item.Id;
            }

            return item.FullPath;
        }

        private ItemDiffWindow ComputeLibraryItemDiffWindow(IReadOnlyList<LibraryItem> currentItems, IReadOnlyList<LibraryItem> nextItems)
        {
            var prefix = 0;
            var prefixLimit = Math.Min(currentItems.Count, nextItems.Count);
            while (prefix < prefixLimit &&
                   string.Equals(GetLibraryItemKey(currentItems[prefix]), GetLibraryItemKey(nextItems[prefix]), StringComparison.OrdinalIgnoreCase))
            {
                prefix++;
            }

            if (prefix == currentItems.Count && prefix == nextItems.Count)
            {
                return new ItemDiffWindow
                {
                    HasChanges = false,
                    StartIndex = prefix,
                    OldCount = 0,
                    NewCount = 0
                };
            }

            var currentTail = currentItems.Count - 1;
            var nextTail = nextItems.Count - 1;
            while (currentTail >= prefix &&
                   nextTail >= prefix &&
                   string.Equals(GetLibraryItemKey(currentItems[currentTail]), GetLibraryItemKey(nextItems[nextTail]), StringComparison.OrdinalIgnoreCase))
            {
                currentTail--;
                nextTail--;
            }

            return new ItemDiffWindow
            {
                HasChanges = true,
                StartIndex = prefix,
                OldCount = Math.Max(0, currentTail - prefix + 1),
                NewCount = Math.Max(0, nextTail - prefix + 1)
            };
        }

        private async Task<int> ApplyLibraryItemsDiffChunkedAsync(IReadOnlyList<LibraryItem> items, CancellationToken cancellationToken, int refreshGeneration)
        {
            const int chunkSize = 200;
            var diffWindow = ComputeLibraryItemDiffWindow(_libraryItems, items);
            if (!diffWindow.HasChanges)
            {
                return -1;
            }

            Log($"UpdateLibraryPanel: Applying item diff window start={diffWindow.StartIndex}, oldCount={diffWindow.OldCount}, newCount={diffWindow.NewCount}");

            if (diffWindow.OldCount > 0)
            {
                for (var i = 0; i < diffWindow.OldCount; i++)
                {
                    if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                    {
                        Log($"UpdateLibraryPanel: Cancelled during item removal (scroll anchor preserved: {_scrollAnchorPath ?? "null"})");
                        return -1;
                    }

                    _libraryItems.RemoveAt(diffWindow.StartIndex);
                    if (i > 0 && i % chunkSize == 0)
                    {
                        await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
                    }
                }
            }

            if (diffWindow.NewCount > 0)
            {
                var inserted = 0;
                for (var index = diffWindow.StartIndex; index < diffWindow.StartIndex + diffWindow.NewCount; index++)
                {
                    if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                    {
                        Log($"UpdateLibraryPanel: Cancelled during item insertion (scroll anchor preserved: {_scrollAnchorPath ?? "null"})");
                        return -1;
                    }

                    _libraryItems.Insert(index, items[index]);
                    inserted++;
                    if (inserted % chunkSize == 0)
                    {
                        await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
                    }
                }
            }

            return diffWindow.StartIndex;
        }

        private (List<LibraryGridRowViewModel> Rows, int MaxColumns) BuildGridRowModels(IReadOnlyList<LibraryItem> items, double layoutWidth)
        {
            return BuildGridRowModelsRange(items, 0, items.Count, layoutWidth);
        }

        private (List<LibraryGridRowViewModel> Rows, int MaxColumns) BuildGridRowModelsRange(IReadOnlyList<LibraryItem> items, int startIndex, int endExclusive, double layoutWidth)
        {
            const double targetRowHeight = 300;
            const double minRowHeight = 200;
            const double maxRowHeight = 400;
            const double horizontalGap = 2;
            var maxColumns = 1;
            var rows = new List<LibraryGridRowViewModel>();

            var pendingItems = new List<LibraryItem>();
            var pendingAspects = new List<double>();
            var pendingItemIndexes = new List<int>();
            var pendingAspectSum = 0d;

            void AddRow(bool isLastRow)
            {
                if (pendingItems.Count == 0)
                {
                    return;
                }

                var rowHeight = isLastRow
                    ? targetRowHeight
                    : (layoutWidth - ((pendingItems.Count - 1) * horizontalGap)) / Math.Max(0.01, pendingAspectSum);
                rowHeight = Math.Clamp(rowHeight, minRowHeight, maxRowHeight);

                var row = new LibraryGridRowViewModel();
                var widths = pendingAspects.Select(aspect => Math.Max(1, aspect * rowHeight)).ToList();
                if (!isLastRow)
                {
                    var widthDelta = layoutWidth - ((pendingItems.Count - 1) * horizontalGap) - widths.Sum();
                    widths[widths.Count - 1] = Math.Max(1, widths[^1] + widthDelta);
                }

                for (var i = 0; i < pendingItems.Count; i++)
                {
                    var item = pendingItems[i];
                    var itemIndex = pendingItemIndexes[i];
                    row.Items.Add(new LibraryGridTileViewModel
                    {
                        Item = item,
                        TileWidth = widths[i],
                        TileHeight = rowHeight,
                        ItemIndex = itemIndex,
                        AspectRatioUsed = pendingAspects[i],
                        ItemKey = GetLibraryItemKey(item)
                    });
                }

                row.StartItemIndex = pendingItemIndexes[0];
                row.EndItemIndexExclusive = pendingItemIndexes[^1] + 1;
                row.ItemCount = row.Items.Count;
                row.RowHeight = rowHeight;
                row.RowWidth = widths.Sum() + ((row.Items.Count - 1) * horizontalGap);
                row.FirstItemKey = row.Items[0].ItemKey;
                rows.Add(row);
                maxColumns = Math.Max(maxColumns, row.Items.Count);
                pendingItems.Clear();
                pendingAspects.Clear();
                pendingItemIndexes.Clear();
                pendingAspectSum = 0;
            }

            startIndex = Math.Clamp(startIndex, 0, items.Count);
            endExclusive = Math.Clamp(endExclusive, startIndex, items.Count);

            for (var itemIndex = startIndex; itemIndex < endExclusive; itemIndex++)
            {
                var item = items[itemIndex];
                var aspect = GetThumbnailAspectRatio(item);
                pendingItems.Add(item);
                pendingAspects.Add(aspect);
                pendingItemIndexes.Add(itemIndex);
                pendingAspectSum += aspect;

                var projectedWidth = (pendingAspectSum * targetRowHeight) + ((pendingItems.Count - 1) * horizontalGap);
                if (projectedWidth >= layoutWidth && pendingItems.Count > 0)
                {
                    AddRow(isLastRow: false);
                }
            }

            AddRow(isLastRow: true);
            return (rows, maxColumns);
        }

        private int FindGridRowIndexContainingItemIndex(int itemIndex)
        {
            for (var rowIndex = 0; rowIndex < _libraryGridRows.Count; rowIndex++)
            {
                var row = _libraryGridRows[rowIndex];
                if (row.StartItemIndex <= itemIndex && itemIndex < row.EndItemIndexExclusive)
                {
                    return rowIndex;
                }
            }

            return -1;
        }

        private int FindGridReflowStartRowIndex(int changedItemIndex)
        {
            if (_libraryGridRows.Count == 0)
            {
                return 0;
            }

            var containingRowIndex = FindGridRowIndexContainingItemIndex(changedItemIndex);
            if (containingRowIndex >= 0)
            {
                // If the change lands on a row boundary, the previous row may repack.
                if (_libraryGridRows[containingRowIndex].StartItemIndex == changedItemIndex && containingRowIndex > 0)
                {
                    return containingRowIndex - 1;
                }

                return containingRowIndex;
            }

            // No containing row means insertion/removal at a boundary (or tail). Reflow from the prior row.
            var firstRowStartingAfterChangedIndex = -1;
            for (var rowIndex = 0; rowIndex < _libraryGridRows.Count; rowIndex++)
            {
                if (_libraryGridRows[rowIndex].StartItemIndex > changedItemIndex)
                {
                    firstRowStartingAfterChangedIndex = rowIndex;
                    break;
                }
            }

            if (firstRowStartingAfterChangedIndex <= 0)
            {
                return 0;
            }

            return firstRowStartingAfterChangedIndex - 1;
        }

        private async Task ApplyGridRowSpliceChunkedAsync(int startRowIndex, int replaceCount, IReadOnlyList<LibraryGridRowViewModel> newRows, CancellationToken cancellationToken, int refreshGeneration)
        {
            const int rowChunkSize = 24;

            for (var i = 0; i < replaceCount; i++)
            {
                if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                {
                    return;
                }

                if (startRowIndex < _libraryGridRows.Count)
                {
                    _libraryGridRows.RemoveAt(startRowIndex);
                }

                if (i > 0 && i % rowChunkSize == 0)
                {
                    await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
                }
            }

            if (newRows.Count == 0)
            {
                return;
            }

            for (var i = 0; i < newRows.Count; i++)
            {
                if (ShouldAbortLibraryPanelRefresh(cancellationToken, refreshGeneration))
                {
                    return;
                }

                _libraryGridRows.Insert(startRowIndex + i, newRows[i]);
                if (i > 0 && i % rowChunkSize == 0)
                {
                    await Dispatcher.UIThread.InvokeAsync(() => { }, DispatcherPriority.Background);
                }
            }
        }

        private async Task RebuildLibraryGridRowsIncrementalAsync(IReadOnlyList<LibraryItem> items, int firstChangedItemIndex, CancellationToken cancellationToken, int refreshGeneration)
        {
            if (firstChangedItemIndex < 0)
            {
                RebuildLibraryGridOffsetIndex();
                UpdateLibraryGridVisibleRowsWindow();
                return;
            }

            if (items.Count == 0)
            {
                _libraryGridRows.Clear();
                LibraryGridColumns = 1;
                RebuildLibraryGridOffsetIndex();
                UpdateLibraryGridVisibleRowsWindow(forceRefreshRows: true);
                return;
            }

            var layoutWidth = ComputeLibraryGridAvailableWidth();
            var clampedChangedIndex = Math.Clamp(firstChangedItemIndex, 0, items.Count - 1);
            var startRowIndex = FindGridReflowStartRowIndex(clampedChangedIndex);
            startRowIndex = Math.Clamp(startRowIndex, 0, Math.Max(0, _libraryGridRows.Count - 1));

            var reflowStartItemIndex = clampedChangedIndex;
            if (startRowIndex < _libraryGridRows.Count && _libraryGridRows[startRowIndex].StartItemIndex >= 0)
            {
                reflowStartItemIndex = _libraryGridRows[startRowIndex].StartItemIndex;
            }

            var (reflowRows, _) = BuildGridRowModelsRange(items, reflowStartItemIndex, items.Count, layoutWidth);
            var replaceCount = Math.Max(0, _libraryGridRows.Count - startRowIndex);
            await ApplyGridRowSpliceChunkedAsync(startRowIndex, replaceCount, reflowRows, cancellationToken, refreshGeneration);

            LibraryGridColumns = Math.Clamp(_libraryGridRows.Count == 0 ? 1 : _libraryGridRows.Max(row => Math.Max(1, row.ItemCount)), 1, 12);
            RebuildLibraryGridOffsetIndex(startRowIndex);
            UpdateLibraryGridVisibleRowsWindow(forceRefreshRows: true);
        }

        private GridViewportAnchorState? CaptureGridViewportAnchor()
        {
            if (LibraryGridScrollViewer == null)
            {
                return null;
            }

            var rawOffsetY = LibraryGridScrollViewer.Offset.Y;
            if (_libraryGridRows.Count == 0)
            {
                return new GridViewportAnchorState { RawOffsetY = rawOffsetY };
            }

            var runningTop = 0d;
            foreach (var row in _libraryGridRows)
            {
                var rowHeight = row.RowHeight > 0 ? row.RowHeight : (row.Items.Count > 0 ? row.Items[0].TileHeight : 0d);
                var rowBottom = runningTop + rowHeight + LibraryGridVerticalRowGap;
                if (rawOffsetY <= rowBottom)
                {
                    var anchorKey = row.FirstItemKey;
                    if (string.IsNullOrWhiteSpace(anchorKey) && row.Items.Count > 0)
                    {
                        anchorKey = row.Items[0].ItemKey;
                    }

                    return new GridViewportAnchorState
                    {
                        AnchorItemKey = anchorKey ?? string.Empty,
                        InsetY = Math.Max(0, rawOffsetY - runningTop),
                        RawOffsetY = rawOffsetY
                    };
                }

                runningTop = rowBottom;
            }

            return new GridViewportAnchorState { RawOffsetY = rawOffsetY };
        }

        private double RestoreGridViewportAnchor(GridViewportAnchorState anchorState)
        {
            if (LibraryGridScrollViewer == null)
            {
                return anchorState.RawOffsetY;
            }

            if (string.IsNullOrWhiteSpace(anchorState.AnchorItemKey))
            {
                return anchorState.RawOffsetY;
            }

            var runningTop = 0d;
            foreach (var row in _libraryGridRows)
            {
                var containsAnchor = row.Items.Any(tile => string.Equals(tile.ItemKey, anchorState.AnchorItemKey, StringComparison.OrdinalIgnoreCase));
                var rowHeight = row.RowHeight > 0 ? row.RowHeight : (row.Items.Count > 0 ? row.Items[0].TileHeight : 0d);
                if (containsAnchor)
                {
                    return runningTop + anchorState.InsetY;
                }

                runningTop += rowHeight + LibraryGridVerticalRowGap;
            }

            return anchorState.RawOffsetY;
        }

        private double GetGridRowMeasuredHeight(LibraryGridRowViewModel row)
        {
            var rowHeight = row.RowHeight > 0
                ? row.RowHeight
                : (row.Items.Count > 0 ? row.Items[0].TileHeight : 0d);

            return Math.Max(1d, rowHeight) + LibraryGridVerticalRowGap;
        }

        private void RebuildLibraryGridOffsetIndex(int startRowIndex = 0)
        {
            var sw = Stopwatch.StartNew();
            if (_libraryGridRows.Count == 0)
            {
                _libraryGridRowTopOffsets.Clear();
                _libraryGridRowBottomOffsets.Clear();
                _libraryGridTotalExtentHeight = 0;
                _lastLibraryGridVisibleStartIndex = -1;
                _lastLibraryGridVisibleEndExclusive = -1;
                LibraryGridTopSpacerHeight = 0;
                LibraryGridBottomSpacerHeight = 0;
                _libraryGridVisibleRows.Clear();
                Log("LibraryGridVirtualizer: Cleared row offset index (no rows).");
                return;
            }

            startRowIndex = Math.Clamp(startRowIndex, 0, _libraryGridRows.Count);
            if (startRowIndex == 0 || _libraryGridRowTopOffsets.Count != _libraryGridRows.Count || _libraryGridRowBottomOffsets.Count != _libraryGridRows.Count)
            {
                _libraryGridRowTopOffsets.Clear();
                _libraryGridRowBottomOffsets.Clear();
                _libraryGridRowTopOffsets.Capacity = _libraryGridRows.Count;
                _libraryGridRowBottomOffsets.Capacity = _libraryGridRows.Count;
                var runningTop = 0d;
                foreach (var row in _libraryGridRows)
                {
                    _libraryGridRowTopOffsets.Add(runningTop);
                    runningTop += GetGridRowMeasuredHeight(row);
                    _libraryGridRowBottomOffsets.Add(runningTop);
                }

                _libraryGridTotalExtentHeight = runningTop;
                sw.Stop();
                Log($"LibraryGridVirtualizer: Rebuilt full offset index. rows={_libraryGridRows.Count}, extent={_libraryGridTotalExtentHeight:F0}px, elapsedMs={sw.ElapsedMilliseconds}");
                return;
            }

            var reindexStart = Math.Max(0, startRowIndex);
            var running = reindexStart == 0 ? 0d : _libraryGridRowBottomOffsets[reindexStart - 1];
            for (var rowIndex = reindexStart; rowIndex < _libraryGridRows.Count; rowIndex++)
            {
                _libraryGridRowTopOffsets[rowIndex] = running;
                running += GetGridRowMeasuredHeight(_libraryGridRows[rowIndex]);
                _libraryGridRowBottomOffsets[rowIndex] = running;
            }

            _libraryGridTotalExtentHeight = running;
            sw.Stop();
            Log($"LibraryGridVirtualizer: Reindexed offsets from row {reindexStart}. rows={_libraryGridRows.Count}, extent={_libraryGridTotalExtentHeight:F0}px, elapsedMs={sw.ElapsedMilliseconds}");
        }

        private int FindFirstVisibleGridRowIndexForOffset(double offsetY)
        {
            if (_libraryGridRowBottomOffsets.Count == 0)
            {
                return 0;
            }

            offsetY = Math.Max(0, offsetY);
            var low = 0;
            var high = _libraryGridRowBottomOffsets.Count - 1;
            while (low < high)
            {
                var mid = low + ((high - low) / 2);
                if (_libraryGridRowBottomOffsets[mid] <= offsetY)
                {
                    low = mid + 1;
                }
                else
                {
                    high = mid;
                }
            }

            return Math.Clamp(low, 0, _libraryGridRowBottomOffsets.Count - 1);
        }

        private int FindLastVisibleGridRowIndexForOffset(double bottomOffsetY)
        {
            if (_libraryGridRowTopOffsets.Count == 0)
            {
                return 0;
            }

            bottomOffsetY = Math.Max(0, bottomOffsetY);
            var low = 0;
            var high = _libraryGridRowTopOffsets.Count - 1;
            while (low < high)
            {
                var mid = low + ((high - low + 1) / 2);
                if (_libraryGridRowTopOffsets[mid] < bottomOffsetY)
                {
                    low = mid;
                }
                else
                {
                    high = mid - 1;
                }
            }

            return Math.Clamp(low, 0, _libraryGridRowTopOffsets.Count - 1);
        }

        private void UpdateLibraryGridVisibleRowsWindow(bool forceRefreshRows = false)
        {
            if (!_libraryGridViewEnabled || LibraryGridScrollViewer == null)
            {
                return;
            }

            if (_libraryGridRows.Count == 0 || _libraryGridRowTopOffsets.Count == 0 || _libraryGridRowBottomOffsets.Count == 0)
            {
                if (_libraryGridVisibleRows.Count > 0)
                {
                    _libraryGridVisibleRows.Clear();
                }

                LibraryGridTopSpacerHeight = 0;
                LibraryGridBottomSpacerHeight = 0;
                _lastLibraryGridVisibleStartIndex = -1;
                _lastLibraryGridVisibleEndExclusive = -1;
                return;
            }

            const double overscanPx = 900d;
            var viewportTop = LibraryGridScrollViewer.Offset.Y;
            var viewportBottom = viewportTop + Math.Max(0, LibraryGridScrollViewer.Viewport.Height);
            var startOffset = Math.Max(0, viewportTop - overscanPx);
            var endOffset = Math.Max(startOffset, viewportBottom + overscanPx);

            var firstVisibleRow = FindFirstVisibleGridRowIndexForOffset(startOffset);
            var lastVisibleRow = FindLastVisibleGridRowIndexForOffset(endOffset);
            firstVisibleRow = Math.Clamp(firstVisibleRow, 0, _libraryGridRows.Count - 1);
            lastVisibleRow = Math.Clamp(lastVisibleRow, firstVisibleRow, _libraryGridRows.Count - 1);
            var endExclusive = lastVisibleRow + 1;

            if (!forceRefreshRows &&
                _lastLibraryGridVisibleStartIndex == firstVisibleRow &&
                _lastLibraryGridVisibleEndExclusive == endExclusive)
            {
                return;
            }

            _lastLibraryGridVisibleStartIndex = firstVisibleRow;
            _lastLibraryGridVisibleEndExclusive = endExclusive;

            LibraryGridTopSpacerHeight = _libraryGridRowTopOffsets[firstVisibleRow];
            var bottomBoundary = _libraryGridRowBottomOffsets[lastVisibleRow];
            LibraryGridBottomSpacerHeight = Math.Max(0, _libraryGridTotalExtentHeight - bottomBoundary);

            _libraryGridVisibleRows.Clear();
            for (var i = firstVisibleRow; i < endExclusive; i++)
            {
                _libraryGridVisibleRows.Add(_libraryGridRows[i]);
            }

            if (_lastLoggedLibraryGridVisibleStartIndex != firstVisibleRow ||
                _lastLoggedLibraryGridVisibleEndExclusive != endExclusive)
            {
                _lastLoggedLibraryGridVisibleStartIndex = firstVisibleRow;
                _lastLoggedLibraryGridVisibleEndExclusive = endExclusive;
                Log($"LibraryGridVirtualizer: Visible rows {firstVisibleRow}-{endExclusive - 1} (count={_libraryGridVisibleRows.Count}), topSpacer={LibraryGridTopSpacerHeight:F0}px, bottomSpacer={LibraryGridBottomSpacerHeight:F0}px, offsetY={LibraryGridScrollViewer.Offset.Y:F0}");
            }

            HydrateThumbnailsForVisibleGridItems();
        }

        private void LibraryGridScrollViewer_ScrollChanged(object? sender, ScrollChangedEventArgs e)
        {
            if (!_libraryGridViewEnabled)
            {
                return;
            }

            UpdateLibraryGridVisibleRowsWindow();
        }

        private void PopulateThumbnailPaths(IReadOnlyList<LibraryItem> items)
        {
            var thumbRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette", "thumbnails");
            var metadata = LoadThumbnailMetadata(thumbRoot);
            foreach (var item in items)
            {
                var thumbnailFilePath = string.IsNullOrWhiteSpace(item.Id)
                    ? string.Empty
                    : Path.Combine(thumbRoot, $"{item.Id}.jpg");
                item.ThumbnailPath = !string.IsNullOrWhiteSpace(thumbnailFilePath) && File.Exists(thumbnailFilePath)
                    ? thumbnailFilePath
                    : string.Empty;
                var fallbackAspect = item.MediaType == MediaType.Photo ? (4d / 3d) : (16d / 9d);
                var fallbackHeight = 100d;
                var fallbackWidth = fallbackHeight * fallbackAspect;

                if (!string.IsNullOrWhiteSpace(item.Id) &&
                    metadata.TryGetValue(item.Id, out var dims) &&
                    dims.Width > 0 &&
                    dims.Height > 0)
                {
                    item.ThumbnailWidth = dims.Width;
                    item.ThumbnailHeight = dims.Height;
                }
                else
                {
                    item.ThumbnailWidth = fallbackWidth;
                    item.ThumbnailHeight = fallbackHeight;
                }
            }
        }

        private void HydrateThumbnailsForVisibleGridItems()
        {
            if (!_libraryGridViewEnabled || _libraryGridVisibleRows.Count == 0)
            {
                return;
            }

            var items = new List<LibraryItem>(256);
            foreach (var row in _libraryGridVisibleRows)
            {
                if (row?.Items == null || row.Items.Count == 0)
                {
                    continue;
                }

                foreach (var tile in row.Items)
                {
                    if (tile?.Item != null)
                    {
                        items.Add(tile.Item);
                    }
                }
            }

            if (items.Count == 0)
            {
                return;
            }

            HydrateThumbnailsForItems(items);
        }

        private void HydrateThumbnailsForItems(IReadOnlyList<LibraryItem> items)
        {
            var thumbRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ReelRoulette", "thumbnails");
            var metadata = LoadThumbnailMetadata(thumbRoot);

            for (var i = 0; i < items.Count; i++)
            {
                var item = items[i];
                if (item == null || string.IsNullOrWhiteSpace(item.Id))
                {
                    continue;
                }

                if (string.IsNullOrWhiteSpace(item.ThumbnailPath))
                {
                    var thumbnailFilePath = Path.Combine(thumbRoot, $"{item.Id}.jpg");
                    if (File.Exists(thumbnailFilePath))
                    {
                        item.ThumbnailPath = thumbnailFilePath;
                    }
                }

                if (metadata.TryGetValue(item.Id, out var dims) &&
                    dims.Width > 0 &&
                    dims.Height > 0 &&
                    (item.ThumbnailWidth <= 0 || item.ThumbnailHeight <= 0))
                {
                    item.ThumbnailWidth = dims.Width;
                    item.ThumbnailHeight = dims.Height;
                }
            }
        }

        private void RebuildLibraryGridRowsFromCurrentItems()
        {
            if (!_libraryGridViewEnabled)
            {
                return;
            }

            _ = RebuildLibraryGridRowsIncrementalAsync(_libraryItems.ToList(), 0, CancellationToken.None, Volatile.Read(ref _libraryPanelRefreshGeneration));
        }

        private double ComputeLibraryGridAvailableWidth()
        {
            const double visualRightGutterPx = 8;
            var measuredWidth = LibraryGridScrollViewer?.Viewport.Width > 0
                ? LibraryGridScrollViewer.Viewport.Width
                : (LibraryGridItemsControl?.Bounds.Width > 0
                ? LibraryGridItemsControl.Bounds.Width
                : (LibraryGridScrollViewer?.Bounds.Width > 0
                    ? LibraryGridScrollViewer.Bounds.Width
                    : (LibraryPanelContainer?.Bounds.Width > 0
                        ? LibraryPanelContainer.Bounds.Width
                        : _libraryPanelWidth)));

            return Math.Max(280, measuredWidth - visualRightGutterPx);
        }

        private static double GetThumbnailAspectRatio(LibraryItem item)
        {
            if (item.ThumbnailWidth > 0 && item.ThumbnailHeight > 0)
            {
                return Math.Clamp(item.ThumbnailWidth / item.ThumbnailHeight, 0.25, 4.0);
            }

            return item.MediaType == MediaType.Photo ? (4d / 3d) : (16d / 9d);
        }

        private Dictionary<string, (double Width, double Height)> LoadThumbnailMetadata(string thumbRoot)
        {
            var indexPath = Path.Combine(thumbRoot, "index.json");
            if (!File.Exists(indexPath))
            {
                _thumbnailMetadataByItemId.Clear();
                _thumbnailIndexLastWriteUtc = DateTime.MinValue;
                return _thumbnailMetadataByItemId;
            }

            var writeUtc = File.GetLastWriteTimeUtc(indexPath);
            if (_thumbnailMetadataByItemId.Count > 0 && writeUtc == _thumbnailIndexLastWriteUtc)
            {
                return _thumbnailMetadataByItemId;
            }

            _thumbnailMetadataByItemId.Clear();
            _thumbnailIndexLastWriteUtc = writeUtc;
            try
            {
                var root = JsonNode.Parse(File.ReadAllText(indexPath)) as JsonObject;
                if (root == null)
                {
                    return _thumbnailMetadataByItemId;
                }

                foreach (var entry in root)
                {
                    if (entry.Value is not JsonObject obj)
                    {
                        continue;
                    }

                    var width = obj["width"]?.GetValue<double?>() ?? 0;
                    var height = obj["height"]?.GetValue<double?>() ?? 0;
                    if (width > 0 && height > 0)
                    {
                        _thumbnailMetadataByItemId[entry.Key] = (width, height);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"LoadThumbnailMetadata: Failed to parse thumbnail index metadata - {ex.GetType().Name}: {ex.Message}");
            }

            return _thumbnailMetadataByItemId;
        }

        private void LibraryGridItem_Click(object? sender, RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string fullPath && !string.IsNullOrWhiteSpace(fullPath))
            {
                PlayFromPath(fullPath);
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
                RefreshLibraryPanelFromServiceState();
                StatusTextBlock.Text = "Cleared filter preset";
                _ = Task.Run(async () => await RebuildPlayQueueIfNeededAsync());
                SaveSettings();
                _ = SyncPresetsToCoreAsync();
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
            _ = SyncPresetsToCoreAsync();
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
                _librarySortDescending = IsDefaultDescendingForSortMode(sortMode);
                UpdateSortDirectionButton();
                UpdateLibraryPanel();
            }
        }

        private void LibrarySortDirectionButton_Click(object? sender, RoutedEventArgs e)
        {
            _librarySortDescending = !_librarySortDescending;
            UpdateSortDirectionButton();
            UpdateLibraryPanel();
        }

        private void UpdateSortDirectionButton()
        {
            if (LibrarySortDirectionButton == null)
            {
                return;
            }

            LibrarySortDirectionButton.Content = GetSortDirectionLabel(_librarySortMode, _librarySortDescending);
        }

        private static bool IsDefaultDescendingForSortMode(string sortMode)
        {
            return sortMode is "LastPlayed" or "PlayCount" or "Duration";
        }

        private static string GetSortDirectionLabel(string sortMode, bool descending)
        {
            return sortMode switch
            {
                "LastPlayed" => descending ? "Newest -> Oldest" : "Oldest -> Newest",
                "PlayCount" => descending ? "Most Plays -> Least Plays" : "Least Plays -> Most Plays",
                "Duration" => descending ? "Longest -> Shortest" : "Shortest -> Longest",
                _ => descending ? "Z-A" : "A-Z"
            };
        }

        private void LibraryFilterButton_Click(object? sender, RoutedEventArgs e)
        {
            Log("UI ACTION: LibraryFilterButton clicked");
            FilterMenuItem_Click(sender, e);
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

        private async void LibraryItemFavorite_Changed(object? sender, RoutedEventArgs e)
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
                var libraryItem = FindProjectionItemByPath(item.FullPath);
                if (libraryItem == null)
                {
                    Log($"LibraryItemFavorite_Changed: Item not found in library: {item.FileName}");
                    return;
                }

                Log($"UI ACTION: LibraryItemFavorite toggled for '{item.FileName}' to: {toggleState} (was: {libraryItem.IsFavorite})");
                if (!await EnsureCoreCommandApiAvailableAsync())
                {
                    toggle.IsChecked = libraryItem.IsFavorite;
                    StatusTextBlock.Text = "Core runtime is required for favorite updates.";
                    return;
                }

                var state = await _coreServerApiClient.SetFavoriteWithStateAsync(
                    _coreServerBaseUrl,
                    libraryItem.FullPath,
                    toggleState,
                    _coreClientId,
                    _coreSessionId);
                if (state == null)
                {
                    toggle.IsChecked = libraryItem.IsFavorite;
                    StatusTextBlock.Text = "Favorite update rejected by core runtime.";
                    return;
                }

                ApplyRemoteItemStateProjection(
                    state.Path,
                    state.IsFavorite,
                    state.IsBlacklisted,
                    state.IsFavorite
                        ? $"Added to favorites: {Path.GetFileName(state.Path)}"
                        : $"Removed from favorites: {Path.GetFileName(state.Path)}");
            }
        }

        private async void LibraryItemBlacklist_Changed(object? sender, RoutedEventArgs e)
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
                var libraryItem = FindProjectionItemByPath(item.FullPath);
                if (libraryItem == null)
                {
                    Log($"LibraryItemBlacklist_Changed: Item not found in library: {item.FileName}");
                    return;
                }

                Log($"UI ACTION: LibraryItemBlacklist toggled for '{item.FileName}' to: {toggleState} (was: {libraryItem.IsBlacklisted})");
                if (!await EnsureCoreCommandApiAvailableAsync())
                {
                    toggle.IsChecked = libraryItem.IsBlacklisted;
                    StatusTextBlock.Text = "Core runtime is required for blacklist updates.";
                    return;
                }

                var state = await _coreServerApiClient.SetBlacklistWithStateAsync(
                    _coreServerBaseUrl,
                    libraryItem.FullPath,
                    toggleState,
                    _coreClientId,
                    _coreSessionId);
                if (state == null)
                {
                    toggle.IsChecked = libraryItem.IsBlacklisted;
                    StatusTextBlock.Text = "Blacklist update rejected by core runtime.";
                    return;
                }

                ApplyRemoteItemStateProjection(
                    state.Path,
                    state.IsFavorite,
                    state.IsBlacklisted,
                    state.IsBlacklisted
                        ? $"Blacklisted: {Path.GetFileName(state.Path)}"
                        : $"Removed from blacklist: {Path.GetFileName(state.Path)}");
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

        private void LibraryGridScrollViewer_PointerPressed(object? sender, PointerPressedEventArgs e)
        {
            if (!_libraryGridViewEnabled)
            {
                return;
            }

            var source = e.Source;
            var isScrollbarInteraction = source is ScrollBar or Thumb;
            if (!isScrollbarInteraction)
            {
                return;
            }

            _isGridScrollInteracting = true;
            Log("LibraryGridVirtualizer: Scroll interaction started.");
        }

        private void LibraryGridScrollViewer_PointerReleased(object? sender, PointerReleasedEventArgs e)
        {
            EndGridScrollInteractionAndFlushPendingRefresh();
        }

        private void LibraryGridScrollViewer_PointerCaptureLost(object? sender, PointerCaptureLostEventArgs e)
        {
            EndGridScrollInteractionAndFlushPendingRefresh();
        }

        private void EndGridScrollInteractionAndFlushPendingRefresh()
        {
            if (!_isGridScrollInteracting)
            {
                return;
            }

            _isGridScrollInteracting = false;
            Log($"LibraryGridVirtualizer: Scroll interaction ended. pendingRefresh={_pendingLibraryPanelRefresh}");
            if (_pendingLibraryPanelRefresh)
            {
                _pendingLibraryPanelRefresh = false;
                UpdateLibraryPanel();
            }
        }

        private async void LibraryItemTags_Click(object? sender, RoutedEventArgs e)
        {
            Log("UI ACTION: LibraryItemTags clicked");
            if (sender is Button button && button.Tag is LibraryItem item)
            {
                Log($"LibraryItemTags_Click: Opening tags dialog for: {item.FileName}");
                var dialog = new ItemTagsDialog(new List<LibraryItem> { item }, _libraryIndex, this);
                var result = await dialog.ShowDialog<bool?>(this);
                if (result == true)
                {
                    Log($"LibraryItemTags_Click: Tags updated for: {item.FileName}");
                    // Save filter presets (in case tags were renamed/deleted)
                    SaveSettings();
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
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                StatusTextBlock.Text = "Core runtime is required for favorite updates.";
                return;
            }

            var accepted = 0;
            foreach (var item in selectedItems)
            {
                if (!item.IsFavorite)
                {
                    var success = await _coreServerApiClient.SetFavoriteAsync(_coreServerBaseUrl, item.FullPath, true);
                    if (success)
                    {
                        accepted++;
                    }
                }
            }

            if (accepted > 0)
            {
                await SyncLibraryProjectionFromCoreAsync();
            }

            StatusTextBlock.Text = $"Added {accepted} item(s) to favorites";
            UpdateContextMenuState();
        }

        private async void ContextMenu_RemoveFromFavorites_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_RemoveFromFavorites_Click: Removing {selectedItems.Count} items from favorites");
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                StatusTextBlock.Text = "Core runtime is required for favorite updates.";
                return;
            }

            var accepted = 0;
            foreach (var item in selectedItems)
            {
                if (item.IsFavorite)
                {
                    var success = await _coreServerApiClient.SetFavoriteAsync(_coreServerBaseUrl, item.FullPath, false);
                    if (success)
                    {
                        accepted++;
                    }
                }
            }

            if (accepted > 0)
            {
                await SyncLibraryProjectionFromCoreAsync();
            }

            StatusTextBlock.Text = $"Removed {accepted} item(s) from favorites";
            UpdateContextMenuState();
        }

        private async void ContextMenu_AddToBlacklist_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_AddToBlacklist_Click: Adding {selectedItems.Count} items to blacklist");
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                StatusTextBlock.Text = "Core runtime is required for blacklist updates.";
                return;
            }

            var accepted = 0;
            foreach (var item in selectedItems)
            {
                if (!item.IsBlacklisted)
                {
                    var success = await _coreServerApiClient.SetBlacklistAsync(_coreServerBaseUrl, item.FullPath, true);
                    if (success)
                    {
                        accepted++;
                    }
                }
            }

            if (accepted > 0)
            {
                await SyncLibraryProjectionFromCoreAsync();
            }

            StatusTextBlock.Text = $"Added {accepted} item(s) to blacklist";
            RebuildPlayQueueIfNeeded();
            UpdateContextMenuState();
        }

        private async void ContextMenu_RemoveFromBlacklist_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_RemoveFromBlacklist_Click: Removing {selectedItems.Count} items from blacklist");
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                StatusTextBlock.Text = "Core runtime is required for blacklist updates.";
                return;
            }

            var accepted = 0;
            foreach (var item in selectedItems)
            {
                if (item.IsBlacklisted)
                {
                    var success = await _coreServerApiClient.SetBlacklistAsync(_coreServerBaseUrl, item.FullPath, false);
                    if (success)
                    {
                        accepted++;
                    }
                }
            }

            if (accepted > 0)
            {
                await SyncLibraryProjectionFromCoreAsync();
            }

            StatusTextBlock.Text = $"Removed {accepted} item(s) from blacklist";
            RebuildPlayQueueIfNeeded();
            UpdateContextMenuState();
        }

        private async void ContextMenu_ClearStats_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_ClearStats_Click: Clearing stats for {selectedItems.Count} items");
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                StatusTextBlock.Text = "Core runtime is required for clearing stats.";
                return;
            }

            var response = await _coreServerApiClient.ClearPlaybackStatsAsync(_coreServerBaseUrl, new CoreClearPlaybackStatsRequest
            {
                ItemPaths = selectedItems.Select(item => item.FullPath).ToList()
            });
            if (response == null)
            {
                StatusTextBlock.Text = "Clearing playback stats failed.";
                return;
            }

            await SyncLibraryProjectionFromCoreAsync();
            StatusTextBlock.Text = $"Cleared playback stats for {response.ClearedCount} item(s)";
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
            StatusTextBlock.Text = "Removing items from library is now API-required and not available as a desktop-local operation.";
        }

        private async void ContextMenu_AddTags_Click(object? sender, RoutedEventArgs e)
        {
            var selectedItems = GetSelectedLibraryItems();
            if (selectedItems.Count == 0)
                return;

            Log($"ContextMenu_AddTags_Click: Opening tags dialog for {selectedItems.Count} items");
            
            var dialog = new ItemTagsDialog(selectedItems, _libraryIndex, this);
            var result = await dialog.ShowDialog<bool?>(this);
            if (result == true)
            {
                Log($"ContextMenu_AddTags_Click: Tags updated for {selectedItems.Count} items");
                
                // Save filter presets (in case tags were renamed/deleted)
                SaveSettings();
                
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
            
            var accepted = await ApplyItemTagDeltaAsync(
                selectedItems.Select(item => item.FullPath).ToList(),
                [],
                commonTags.ToList());
            if (!accepted)
            {
                StatusTextBlock.Text = "Tag removal failed (API required).";
                return;
            }

            StatusTextBlock.Text = $"Removed {commonTags.Count} tag(s) from {selectedItems.Count} item(s)";
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

        private async void BlacklistRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: BlacklistRemove clicked for: {Path.GetFileName(path)}");
                await RemoveFromBlacklistAsync(path);
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

        private async void FavoritesRemove_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is Button button && button.Tag is string path)
            {
                Log($"UI ACTION: FavoritesRemove clicked for: {Path.GetFileName(path)}");
                if (!await EnsureCoreCommandApiAvailableAsync())
                {
                    StatusTextBlock.Text = "Core runtime is required for favorites updates.";
                    return;
                }

                var state = await _coreServerApiClient.SetFavoriteWithStateAsync(
                    _coreServerBaseUrl,
                    path,
                    false,
                    _coreClientId,
                    _coreSessionId);
                if (state == null)
                {
                    StatusTextBlock.Text = "Favorite update rejected by core runtime.";
                    return;
                }

                ApplyRemoteItemStateProjection(
                    state.Path,
                    state.IsFavorite,
                    state.IsBlacklisted,
                    $"Removed from favorites: {System.IO.Path.GetFileName(path)}");
                StatusTextBlock.Text = $"Removed from favorites: {System.IO.Path.GetFileName(path)}";
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

        #region Randomization System

        private List<LibraryItem> GetEligibleItems()
        {
            Log("GetEligibleItems: Starting eligible pool calculation");
            try
            {
                if (_libraryIndex == null || _currentFilterState == null)
                {
                    Log($"GetEligibleItems: Library system not available (libraryIndex: {_libraryIndex != null}, filterState: {_currentFilterState != null}), returning empty pool");
                    return new List<LibraryItem>();
                }

                if (_libraryIndex.Items.Count == 0)
                {
                    Log("GetEligibleItems: Library has no items, returning empty pool");
                    return new List<LibraryItem>();
                }

                var eligibleItems = _filterService.BuildEligibleSetWithoutFileCheck(_currentFilterState, _libraryIndex).ToList();
                Log($"GetEligibleItems: FilterService returned {eligibleItems.Count} eligible items after filtering");
                return eligibleItems;
            }
            catch (Exception ex)
            {
                Log($"GetEligibleItems: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"GetEligibleItems: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"GetEligibleItems: ERROR - Inner exception: {ex.InnerException.GetType().Name}, Message: {ex.InnerException.Message}");
                }
                return new List<LibraryItem>();
            }
        }

        private async Task<List<LibraryItem>> GetEligibleItemsAsync()
        {
            return await Task.Run(GetEligibleItems);
        }

        private void RebuildPlayQueueIfNeeded()
        {
            _ = RebuildPlayQueueIfNeededAsync();
        }

        private async Task RebuildPlayQueueIfNeededAsync()
        {
            var eligibleItems = await GetEligibleItemsAsync();
            lock (_desktopRandomizationLock)
            {
                RandomSelectionEngine.RebuildState(_desktopRandomizationState, _randomizationMode, eligibleItems, _rng);
            }
            Log($"Randomization: Rebuilt runtime state for mode '{_randomizationMode}' with {eligibleItems.Count} eligible items");
        }

        private void UpdateRandomizationModeComboBox()
        {
            if (LibraryRandomizationModeComboBox == null)
                return;

            _isUpdatingRandomizationModeComboBox = true;
            try
            {
                foreach (var itemObj in LibraryRandomizationModeComboBox.Items)
                {
                    if (itemObj is ComboBoxItem item
                        && item.Tag is string tag
                        && Enum.TryParse<RandomizationMode>(tag, ignoreCase: true, out var mode)
                        && mode == _randomizationMode)
                    {
                        LibraryRandomizationModeComboBox.SelectedItem = item;
                        return;
                    }
                }
                LibraryRandomizationModeComboBox.SelectedIndex = 2; // SmartShuffle fallback
            }
            finally
            {
                _isUpdatingRandomizationModeComboBox = false;
            }
        }

        private void LibraryRandomizationModeComboBox_SelectionChanged(object? sender, SelectionChangedEventArgs e)
        {
            if (_isUpdatingRandomizationModeComboBox || _isInitializingLibraryPanel)
                return;

            if (LibraryRandomizationModeComboBox?.SelectedItem is not ComboBoxItem item)
                return;

            if (item.Tag is not string tag || !Enum.TryParse<RandomizationMode>(tag, ignoreCase: true, out var selectedMode))
                return;

            if (selectedMode == _randomizationMode)
                return;

            var previous = _randomizationMode;
            _randomizationMode = selectedMode;
            Log($"UI ACTION: Randomization mode changed from {previous} to {_randomizationMode}");
            RebuildPlayQueueIfNeeded();
            SaveSettings();
        }

        #endregion

        #region Video Playback

        private async Task PlayFromPathAsync(string videoPath, bool addToHistory = true)
        {
            Log($"PlayFromPath: Starting - videoPath: {videoPath ?? "null"}");

            if (string.IsNullOrWhiteSpace(videoPath))
            {
                Log("PlayFromPath: ERROR - Path is empty");
                SetStatusMessage("Manual playback unavailable: no media path was provided.");
                _isNavigatingTimeline = false;
                return;
            }

            var manualTarget = ResolveManualPlaybackTarget(videoPath);
            if (manualTarget == null)
            {
                SetStatusMessage("Manual playback unavailable: selected item is missing stable API identity. Refresh sources and retry.");
                Log($"PlayFromPath: ERROR - Could not resolve manual playback target for path '{videoPath}'");
                _isNavigatingTimeline = false;
                return;
            }

            if (!manualTarget.IsLocallyAccessible && !manualTarget.UsedApiPath)
            {
                var extension = Path.GetExtension(videoPath).ToLowerInvariant();
                var isPhoto = _photoExtensions.Contains(extension);
                SetStatusMessage(isPhoto ? "Photo file not found." : "Video file not found.");
                _isNavigatingTimeline = false;
                return;
            }

            Log($"PlayFromPath: Resolved manual playback target (ApiPath={manualTarget.UsedApiPath}, LocalAccessible={manualTarget.IsLocallyAccessible})");
            PlayMedia(manualTarget, addToHistory: addToHistory);
        }

        private PlaybackTarget? ResolveManualPlaybackTarget(string videoPath)
        {
            var item = FindProjectionItemByPath(videoPath);
            if (item == null || string.IsNullOrWhiteSpace(item.Id))
            {
                return null;
            }

            var localAccessible = IsLocalMediaReadable(videoPath);
            var shouldUseApiPath = _forceApiPlayback || !localAccessible;
            if (!shouldUseApiPath)
            {
                return new PlaybackTarget(
                    StatsPath: videoPath,
                    PlaybackSource: videoPath,
                    PlaybackSourceType: FromType.FromPath,
                    IsLocallyAccessible: true,
                    UsedApiPath: false);
            }

            if (!TryBuildApiMediaUrl(item.Id, out var apiMediaUrl))
            {
                return null;
            }

            return new PlaybackTarget(
                StatsPath: videoPath,
                PlaybackSource: apiMediaUrl,
                PlaybackSourceType: FromType.FromLocation,
                IsLocallyAccessible: localAccessible,
                UsedApiPath: true);
        }

        private bool TryBuildApiMediaUrl(string idOrToken, out string apiMediaUrl)
        {
            apiMediaUrl = string.Empty;
            if (string.IsNullOrWhiteSpace(idOrToken))
            {
                return false;
            }

            if (!Uri.TryCreate(_coreServerBaseUrl, UriKind.Absolute, out var baseUri))
            {
                return false;
            }

            var escaped = Uri.EscapeDataString(idOrToken.Trim());
            apiMediaUrl = new Uri(baseUri, $"/api/media/{escaped}").ToString();
            return true;
        }

        private bool IsLocalMediaReadable(string? path)
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                return false;
            }

            try
            {
                using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                return stream.CanRead;
            }
            catch
            {
                return false;
            }
        }

        private void PlayFromPath(string videoPath, bool addToHistory = true)
        {
            // Synchronous wrapper for backward compatibility
            _ = PlayFromPathAsync(videoPath, addToHistory);
        }

        private async Task RemoveLibraryItemAsync(string? path)
        {
            Log($"RemoveLibraryItemAsync: Removing library item: {path ?? "null"}");
            
            if (string.IsNullOrEmpty(path))
            {
                Log("RemoveLibraryItemAsync: Path is null or empty");
                return;
            }
            
            await Avalonia.Threading.Dispatcher.UIThread.InvokeAsync(() =>
            {
                SetStatusMessage("Removing items from library is now API-required and not available as a desktop-local operation.");
            });
        }

        private void SetStatusMessage(string message, int minimumDisplayMilliseconds = 1000)
        {
            if (_suppressStatusUpdatesForLibraryArchive)
            {
                return;
            }

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

                        if (_suppressStatusUpdatesForLibraryArchive)
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

        private void BeginLibraryArchiveOperationUI()
        {
            _suppressStatusUpdatesForLibraryArchive = true;
            LibraryMenuItem.IsEnabled = false;
            _libraryArchiveCursorRestore = Cursor;
            Cursor = new Cursor(StandardCursorType.Wait);
            StatusTextBlock.IsVisible = false;
            StatusLibraryArchiveProgressBar.IsVisible = true;
        }

        private void EndLibraryArchiveOperationUI()
        {
            _suppressStatusUpdatesForLibraryArchive = false;
            LibraryMenuItem.IsEnabled = true;
            Cursor = _libraryArchiveCursorRestore;
            _libraryArchiveCursorRestore = null;
            StatusLibraryArchiveProgressBar.IsVisible = false;
            StatusTextBlock.IsVisible = true;
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

        private void PlayMedia(string videoPath, bool addToHistory = true)
        {
            var localTarget = new PlaybackTarget(
                StatsPath: videoPath,
                PlaybackSource: videoPath,
                PlaybackSourceType: FromType.FromPath,
                IsLocallyAccessible: IsLocalMediaReadable(videoPath),
                UsedApiPath: false);
            PlayMedia(localTarget, addToHistory);
        }

        private void PlayMedia(PlaybackTarget target, bool addToHistory = true)
        {
            var statsPath = target.StatsPath;
            var playbackSource = target.PlaybackSource;
            var playbackSourceType = target.PlaybackSourceType;

            Log($"PlayMedia: Starting - statsPath: {statsPath ?? "null"}, playbackSourceType: {playbackSourceType}, addToHistory: {addToHistory}");
            
            if (_mediaPlayer == null || _libVLC == null)
            {
                Log("PlayMedia: ERROR - MediaPlayer or LibVLC is null");
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
                _currentVideoPath = statsPath;
                _currentPlaybackSource = playbackSource;
                _currentPlaybackSourceType = playbackSourceType;
                Log($"PlayMedia: Current video path set - Previous: {previousPath ?? "null"}, New: {statsPath ?? "null"}");

                // Determine if this is a photo or video
                var extension = Path.GetExtension(statsPath ?? string.Empty).ToLowerInvariant();
                var isPhoto = _photoExtensions.Contains(extension);
                _isCurrentlyPlayingPhoto = isPhoto;
                Log($"PlayMedia: Detected media type - Extension: {extension}, IsPhoto: {isPhoto}");

                if (isPhoto)
                {
                    StatusTextBlock.Text = $"Photo: {System.IO.Path.GetFileName(statsPath)}";
                    Log($"PlayMedia: Setting status text for photo: {System.IO.Path.GetFileName(statsPath)}");
                }
                else
                {
                    StatusTextBlock.Text = $"Playing: {System.IO.Path.GetFileName(statsPath)}";
                    Log($"PlayMedia: Setting status text for video: {System.IO.Path.GetFileName(statsPath)}");
                }

                // Record playback stats
                if (!string.IsNullOrWhiteSpace(statsPath))
                {
                    Log("PlayMedia: Recording playback stats");
                    RecordPlayback(statsPath);
                }

                // Update per-video toggle UI
                Log("PlayMedia: Updating per-video toggle states");
                UpdatePerVideoToggleStates();

                // Dispose previous media
                if (_currentMedia != null)
                {
                    var skipStopForEndReached = Interlocked.CompareExchange(ref _suppressStopForEndReachedTransition, 0, 0) == 1;
                    if (skipStopForEndReached)
                    {
                        Log("PlayMedia: EndReached transition active - skipping MediaPlayer.Stop() before disposing previous media");
                    }
                    else
                    {
                        Log("PlayMedia: Stopping player before disposing previous media");
                        _mediaPlayer.Stop(); // Stop playback cleanly before disposing to prevent audio spikes
                        Log("PlayMedia: MediaPlayer.Stop() completed");
                    }
                    Log("PlayMedia: Disposing previous media");
                    _currentMedia.Dispose();
                    _currentMedia = null;
                    Log("PlayMedia: Previous media disposed");
                }

                // Create and play new media
                if (!string.IsNullOrWhiteSpace(playbackSource))
                {
                    // Store user volume preference before normalization
                    _userVolumePreference = (int)VolumeSlider.Value;
                    Log($"PlayMedia: User volume preference: {_userVolumePreference}");

                    if (isPhoto)
                    {
                        // Photos: Use Avalonia Image control instead of VLC for better performance with large images
                        Log("PlayMedia: This is a photo - loading with Avalonia Image control");
                        
                        // Hide VideoView and show Image control
                        try
                        {
                            if (VideoView != null)
                            {
                                VideoView.IsVisible = false;
                                Log("PlayMedia: VideoView hidden");
                            }
                            if (PhotoImageView != null)
                            {
                                PhotoImageView.IsVisible = true;
                                Log("PlayMedia: PhotoImageView shown");
                            }
                        }
                        catch (Exception ex)
                        {
                            Log($"PlayMedia: ERROR accessing UI elements - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                        }
                        
                        // Stop media player and dispose media to clear VideoView content
                        Log("PlayMedia: Stopping media player for photo");
                        if (_mediaPlayer != null)
                        {
                            try
                            {
                                _mediaPlayer.Stop();
                                Log("PlayMedia: Media player stopped successfully");
                            }
                            catch (Exception ex)
                            {
                                Log($"PlayMedia: ERROR stopping media player - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            }
                        }
                        
                        // Dispose previous photo bitmap and media
                        Log("PlayMedia: Disposing previous photo resources");
                        _currentPhotoBitmap?.Dispose();
                        _currentPhotoBitmap = null;
                        if (_currentMedia != null)
                        {
                            _currentMedia.Dispose();
                            _currentMedia = null;
                        }
                        Log("PlayMedia: Previous photo resources disposed");
                        
                        // Check if file exists before loading
                        // Note: File.Exists on network drives can be slow, but we'll proceed anyway
                        // If the file doesn't exist, we'll catch it during loading
                        Log($"PlayMedia: Checking if photo file exists: {playbackSource}");
                        bool fileExists = false;
                        try
                        {
                            fileExists = File.Exists(playbackSource);
                            Log($"PlayMedia: File exists check completed: {fileExists}");
                        }
                        catch (Exception ex)
                        {
                            Log($"PlayMedia: ERROR checking file existence - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                            // Assume file exists to avoid blocking - we'll catch the error during loading if it doesn't
                            fileExists = true;
                        }
                        
                        if (!fileExists)
                        {
                            Log($"PlayMedia: Photo file not found: {playbackSource}");
                            SetStatusMessage("Photo file not found.");
                            return;
                        }
                        Log("PlayMedia: Photo file exists, proceeding with load");
                        
                        // Load image asynchronously with efficient decoding
                        Log("PlayMedia: Starting Task.Run for photo loading");
                        _ = Task.Run(async () =>
                        {
                            // Declare bitmap at outer scope so it's accessible in catch blocks
                            Avalonia.Media.Imaging.Bitmap? bitmap = null;
                            try
                            {
                                Log($"PlayMedia: Task.Run started - Loading photo: {playbackSource}");
                                
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
                                            Log($"PlayMedia: Could not get screen dimensions, using fixed max: {ex.Message}");
                                        }
                                    }
                                    
                                    Log($"PlayMedia: Decoding image with max dimensions: {maxWidth}x{maxHeight}");
                                }
                                else
                                {
                                    Log("PlayMedia: Image scaling is disabled - loading full resolution");
                                }
                                
                                // Load and decode image efficiently
                                using (var stream = File.OpenRead(playbackSource))
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
                                    Log($"PlayMedia: Image decoded successfully - Size: {bitmap.PixelSize.Width}x{bitmap.PixelSize.Height}");
                                    
                                    // Update UI on UI thread
                                    try
                                    {
                                        await Dispatcher.UIThread.InvokeAsync(() =>
                                        {
                                            try
                                            {
                                                // Validate that this photo is still the current one before updating UI
                                                // Prevents race condition where multiple photo loads complete out of order
                                                if (_currentVideoPath != statsPath)
                                                {
                                                    Log($"PlayMedia: Photo load completed but is no longer current - Current: {_currentVideoPath ?? "null"}, Loaded: {statsPath}");
                                                    bitmap?.Dispose();
                                                    bitmap = null;
                                                    return;
                                                }
                                                
                                                // Update Image control
                                                if (PhotoImageView != null)
                                                {
                                                    _currentPhotoBitmap = bitmap;
                                                    PhotoImageView.Source = bitmap;
                                                    Log("PlayMedia: Photo displayed in Image control");
                                                    
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
                                                    Log($"PlayMedia: Started photo display timer for {_photoDisplayDurationSeconds} seconds");
                                                }
                                                else
                                                {
                                                    bitmap.Dispose();
                                                    bitmap = null; // Prevent double-disposal in outer catch handler
                                                    Log("PlayMedia: ERROR - PhotoImageView is null, disposed bitmap");
                                                }
                                            }
                                            catch (Exception ex)
                                            {
                                                Log($"PlayMedia: ERROR updating UI with photo - Exception: {ex.GetType().Name}, Message: {ex.Message}");
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
                                        Log($"PlayMedia: ERROR during UI thread invocation - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                        bitmap?.Dispose();
                                        bitmap = null; // Prevent double-disposal in outer catch handler
                                        _currentPhotoBitmap = null;
                                        throw; // Re-throw to be caught by outer handler
                                    }
                                }
                                else
                                {
                                    Log("PlayMedia: ERROR - Failed to decode image");
                                }
                            }
                            catch (FileNotFoundException ex)
                            {
                                Log($"PlayMedia: Photo file not found: {ex.Message}");
                                // Only handle missing file if this photo is still current
                                if (_currentVideoPath == statsPath)
                                {
                                    SetStatusMessage("Photo file not found.");
                                }
                                else
                                {
                                    Log($"PlayMedia: Photo file not found but photo is no longer current - Current: {_currentVideoPath ?? "null"}, Missing: {statsPath}");
                                }
                            }
                            catch (Exception ex)
                            {
                                Log($"PlayMedia: ERROR loading photo - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                                Log($"PlayMedia: ERROR - Stack trace: {ex.StackTrace}");
                                
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
                                    if (_currentVideoPath != statsPath)
                                    {
                                        Log($"PlayMedia: Photo error occurred but photo is no longer current - Current: {_currentVideoPath ?? "null"}, Failed: {statsPath}");
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
                            Log("PlayMedia: Transitioning from photo to video - keeping photo visible until video loads");
                            
                            // Stop and clear any previous video to prevent showing old frame
                            if (_mediaPlayer != null)
                            {
                                _mediaPlayer.Stop();
                            }
                            if (_currentMedia != null)
                            {
                                Log("PlayMedia: Disposing previous media before transitioning from photo to video");
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
                        Log($"PlayMedia: Creating new Media object from source ({playbackSourceType})");
                        _currentMedia = new Media(_libVLC, playbackSource, playbackSourceType);
                        
                        // Videos: Use existing logic
                        // Set input-repeat option for seamless looping when loop is enabled
                        if (_isLoopEnabled)
                        {
                            Log("PlayMedia: Loop is enabled - adding input-repeat option");
                            _currentMedia.AddOption(":input-repeat=65535");
                        }
                        
                        // Apply volume normalization (must be called before Parse/Play)
                        Log($"PlayMedia: Applying volume normalization - Enabled: {_volumeNormalizationEnabled}");
                        ApplyVolumeNormalization();
                        
                        // Parse media to get track information (including video dimensions)
                        Log("PlayMedia: Parsing media to get track information");
                        _currentMedia.Parse();
                        
                        // Try to get video aspect ratio from tracks immediately
                        UpdateAspectRatioFromTracks();

                        Log("PlayMedia: Starting playback");
                        EnsureVideoViewMediaPlayerAttached();
                        _mediaPlayer!.Play(_currentMedia!);
                        Log("PlayMedia: Playback started successfully");
                        
                        // Also try again after a short delay in case tracks weren't available immediately
                        // This helps with files where Parse() doesn't immediately populate tracks
                        Task.Delay(100).ContinueWith(_ =>
                        {
                            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                            {
                                if (!_hasValidAspectRatio && _currentMedia != null)
                                {
                                    Log("PlayMedia: Retrying aspect ratio update after delay");
                                    UpdateAspectRatioFromTracks();
                                }
                            });
                        });
                    }
                }
                else
                {
                    Log("PlayMedia: ERROR - playbackSource is null, returning");
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
                        Log($"PlayMedia: Removed {removedCount} entries from timeline after index {_timelineIndex}");
                    }
                    // Add new video to timeline
                    _playbackTimeline.Add(statsPath ?? string.Empty);
                    _timelineIndex = _playbackTimeline.Count - 1;
                    Log($"PlayMedia: Added video to timeline - Index: {_timelineIndex}, Timeline count: {_playbackTimeline.Count}");
                    // Note: UpdateCurrentFileStatsUi() is already called by RecordPlayback()
                }
                else
                {
                    Log($"PlayMedia: Skipping timeline update (navigating) - Index: {_timelineIndex}");
                }
                _isNavigatingTimeline = false;

                // Update Previous/Next button states
                PreviousButton.IsEnabled = _timelineIndex > 0;
                NextButton.IsEnabled = _playbackTimeline.Count > 0;
                Log($"PlayMedia: Previous button enabled: {PreviousButton.IsEnabled}, Next button enabled: {NextButton.IsEnabled}");

                // Initialize volume slider if first video
                if (VolumeSlider.Value == 100 && _mediaPlayer!.Volume == 0)
                {
                    Log("PlayMedia: Initializing volume slider (first video)");
                    _mediaPlayer.Volume = 100;
                    VolumeSlider.Value = 100;
                }

                // Apply saved mute state
                _mediaPlayer!.Mute = _isMuted;
                if (MuteButton != null)
                {
                    MuteButton.IsChecked = _isMuted;
                }
                Log($"PlayMedia: Applied saved mute state: {_isMuted}");

                // History is now tracked via LibraryItem.LastPlayedUtc (updated in RecordPlayback)

                // Note: UpdateCurrentFileStatsUi() is already called by RecordPlayback()
                // No need to call it again here
                
                Log("PlayMedia: Completed successfully");
            }
            catch (Exception ex)
            {
                _isNavigatingTimeline = false;
                Log($"PlayMedia: ERROR - Exception: {ex.GetType().Name}, Message: {ex.Message}");
                Log($"PlayMedia: ERROR - Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Log($"PlayMedia: ERROR - Inner exception: {ex.InnerException.Message}");
                }
                StatusTextBlock.Text = "Failed to play media: " + ex.Message;
            }
        }

        private async void PlayRandomVideo()
        {
            await PlayRandomVideoAsync();
        }

        private async Task PlayRandomVideoAsync()
        {
            Log("PlayRandomVideoAsync: Starting random video selection");
            
            Log("PlayRandomVideoAsync: Requesting random media from core API");

            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                StatusTextBlock.Text = "Finding eligible media...";
            });

            if (!_isCoreApiReachable)
            {
                await Dispatcher.UIThread.InvokeAsync(() => { StatusTextBlock.Text = "Core API unavailable."; });
                return;
            }

            var activePresetName = await MatchPresetNameFromCoreAsync(_currentFilterState);
            if (string.IsNullOrWhiteSpace(activePresetName))
            {
                activePresetName = _activePresetName;
            }

            PlaybackTarget? randomTarget = null;
            try
            {
                var randomResponse = await _coreServerApiClient.RequestRandomAsync(
                    _coreServerBaseUrl,
                    new CoreRandomRequest
                    {
                        PresetId = activePresetName ?? string.Empty,
                        FilterState = _currentFilterState == null ? null : JsonSerializer.SerializeToElement(_currentFilterState),
                        ClientId = _coreClientId,
                        SessionId = _coreSessionId,
                        IncludeVideos = true,
                        IncludePhotos = true,
                        RandomizationMode = _randomizationMode.ToString()
                    });

                if (randomResponse != null)
                {
                    randomTarget = ResolvePlaybackTargetFromApiRandomResponse(randomResponse);
                }
            }
            catch (Exception ex)
            {
                Log($"PlayRandomVideoAsync: API random call failed ({ex.Message}).");
            }

            if (randomTarget == null)
            {
                Log("PlayRandomVideoAsync: API random selection returned no playable target");
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    StatusTextBlock.Text = "No eligible media found from core API. Check preset filters.";
                });
                return;
            }

            Log($"PlayRandomVideoAsync: Selected ({_randomizationMode}) {Path.GetFileName(randomTarget.StatsPath)} (ApiPath={randomTarget.UsedApiPath})");
            await Dispatcher.UIThread.InvokeAsync(() => PlayMedia(randomTarget));
        }

        #endregion

        #region Loop Toggle

        private void LoopToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            // Update the loop flag
            _isLoopEnabled = LoopToggle.IsChecked == true;
            var isUserInitiated = !_isApplyingSettings && !_isLoadingSettings && !_isProgrammaticUiSync;
            Log($"{(isUserInitiated ? "UI ACTION" : "STATE SYNC")}: LoopToggle changed to: {_isLoopEnabled}");
            
            // Persist the setting (unless we're applying settings from dialog)
            if (!_isApplyingSettings && !_isLoadingSettings && !_isProgrammaticUiSync)
            {
                SaveSettings();
            }

            // Photo playback uses desktop timer instead of LibVLC media looping.
            if (_isCurrentlyPlayingPhoto)
            {
                if (_photoDisplayTimer != null)
                {
                    _photoDisplayTimer.Stop();
                    _photoDisplayTimer.Elapsed -= PhotoDisplayTimer_Elapsed;
                    _photoDisplayTimer.Dispose();
                    _photoDisplayTimer = null;
                }

                if (_isLoopEnabled || _autoPlayNext)
                {
                    _photoDisplayTimer = new System.Timers.Timer(_photoDisplayDurationSeconds * 1000);
                    _photoDisplayTimer.Elapsed += PhotoDisplayTimer_Elapsed;
                    _photoDisplayTimer.AutoReset = false;
                    _photoDisplayTimer.Start();
                    Log($"LoopToggle_Changed: Reset photo timer for {_photoDisplayDurationSeconds}s (Loop={_isLoopEnabled}, AutoPlay={_autoPlayNext})");
                }
            }
            
            // If media is currently playing, update the input-repeat option
            // Note: This requires recreating the media, which may cause a brief reset
            if (_currentMedia != null && _mediaPlayer != null && _libVLC != null && !string.IsNullOrWhiteSpace(_currentPlaybackSource))
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
                    _currentMedia = new Media(_libVLC, _currentPlaybackSource!, _currentPlaybackSourceType);
                    
                    if (_isLoopEnabled)
                    {
                        _currentMedia.AddOption(":input-repeat=65535");
                    }
                    
                    // Parse and set media
                    _currentMedia.Parse();
                    UpdateAspectRatioFromTracks();
                    
                    // Set media and restore playback position
                    EnsureVideoViewMediaPlayerAttached();
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

        public async Task<bool> UpsertCategoryAsync(TagCategory category)
        {
            if (category == null || string.IsNullOrWhiteSpace(category.Id) || string.IsNullOrWhiteSpace(category.Name))
            {
                return false;
            }

            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return false;
            }

            var accepted = await _coreServerApiClient.UpsertCategoryAsync(_coreServerBaseUrl, new CoreUpsertCategoryRequest
            {
                Id = category.Id,
                Name = category.Name,
                SortOrder = category.SortOrder
            });
            if (!accepted)
            {
                return false;
            }

            return true;
        }

        public async Task<CoreTagEditorModelResponse?> GetTagEditorModelAsync(List<string> itemIds)
        {
            try
            {
                if (!await EnsureCoreRuntimeAvailableAsync())
                {
                    return null;
                }

                return await _coreServerApiClient.GetTagEditorModelAsync(_coreServerBaseUrl, itemIds ?? []);
            }
            catch (Exception ex)
            {
                Log($"GetTagEditorModelAsync: API delegation failed ({ex.Message})");
                return null;
            }
        }

        public async Task<bool> DeleteCategoryAsync(string categoryId, string? newCategoryId)
        {
            if (string.IsNullOrWhiteSpace(categoryId))
            {
                return false;
            }

            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return false;
            }

            var accepted = await _coreServerApiClient.DeleteCategoryAsync(_coreServerBaseUrl, categoryId, newCategoryId);
            if (!accepted)
            {
                return false;
            }

            return true;
        }

        public async Task<bool> UpsertTagAsync(string tagName, string categoryId)
        {
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return false;
            }

            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return false;
            }

            var accepted = await _coreServerApiClient.UpsertTagAsync(_coreServerBaseUrl, new CoreUpsertTagRequest
            {
                Name = tagName,
                CategoryId = categoryId ?? string.Empty
            });
            if (!accepted)
            {
                return false;
            }

            return true;
        }

        public async Task<bool> RenameTagAsync(string oldTagName, string newTagName, string? newCategoryId)
        {
            if (string.IsNullOrWhiteSpace(oldTagName) || string.IsNullOrWhiteSpace(newTagName))
            {
                return false;
            }

            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return false;
            }

            var accepted = await _coreServerApiClient.RenameTagAsync(_coreServerBaseUrl, new CoreRenameTagRequest
            {
                OldName = oldTagName,
                NewName = newTagName,
                NewCategoryId = newCategoryId
            });
            if (!accepted)
            {
                return false;
            }

            return true;
        }

        public async Task<bool> DeleteTagAsync(string tagName)
        {
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return false;
            }

            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return false;
            }

            var accepted = await _coreServerApiClient.DeleteTagAsync(_coreServerBaseUrl, tagName);
            if (!accepted)
            {
                return false;
            }

            return true;
        }

        public async Task<bool> ApplyItemTagDeltaAsync(List<string> itemIds, List<string> addTags, List<string> removeTags)
        {
            if (itemIds == null || itemIds.Count == 0)
            {
                return false;
            }

            if (!await EnsureCoreRuntimeAvailableAsync())
            {
                return false;
            }

            var accepted = await _coreServerApiClient.ApplyItemTagsAsync(_coreServerBaseUrl, new CoreApplyItemTagsRequest
            {
                ItemIds = itemIds,
                AddTags = addTags ?? [],
                RemoveTags = removeTags ?? []
            });
            if (!accepted)
            {
                return false;
            }

            return true;
        }

        private void ApplyItemTagsProjection(CoreItemTagsChangedPayload payload)
        {
            if (_libraryIndex == null || payload.ItemIds.Count == 0)
            {
                return;
            }

            var identifiers = payload.ItemIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (identifiers.Count == 0)
            {
                return;
            }

            var addTags = (payload.AddedTags ?? [])
                .Where(tag => !string.IsNullOrWhiteSpace(tag))
                .Select(tag => tag.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var removeTags = (payload.RemovedTags ?? [])
                .Where(tag => !string.IsNullOrWhiteSpace(tag))
                .Select(tag => tag.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var byId = _libraryIndex.Items
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .GroupBy(item => item.Id, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
            var byPath = _libraryIndex.Items
                .Where(item => !string.IsNullOrWhiteSpace(item.FullPath))
                .GroupBy(item => item.FullPath, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

            var targetItems = new List<LibraryItem>(identifiers.Count);
            foreach (var identifier in identifiers)
            {
                if (!byId.TryGetValue(identifier, out var item) &&
                    !byPath.TryGetValue(identifier, out item))
                {
                    Log($"CoreEvents: itemTagsChanged fallback to full projection sync (unknown item '{identifier}').");
                    _ = SyncLibraryProjectionFromCoreAsync();
                    return;
                }

                if (!targetItems.Contains(item))
                {
                    targetItems.Add(item);
                }
            }

            foreach (var item in targetItems)
            {
                var updatedTags = (item.Tags ?? [])
                    .Where(tag => !removeTags.Contains(tag))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                foreach (var addTag in addTags)
                {
                    if (!updatedTags.Contains(addTag, StringComparer.OrdinalIgnoreCase))
                    {
                        updatedTags.Add(addTag);
                    }
                }

                item.Tags = updatedTags;
            }

            var hasTagFilters = ((_currentFilterState?.SelectedTags?.Count ?? 0) > 0)
                || ((_currentFilterState?.ExcludedTags?.Count ?? 0) > 0);
            if (_showLibraryPanel && hasTagFilters)
            {
                UpdateLibraryPanel();
            }

            if (_currentVideoPath != null)
            {
                var currentItemUpdated = targetItems.Any(item =>
                    string.Equals(item.FullPath, _currentVideoPath, StringComparison.OrdinalIgnoreCase));
                if (currentItemUpdated)
                {
                    UpdateCurrentFileStatsUi();
                }
            }

            Log($"CoreEvents: itemTagsChanged applied to {targetItems.Count} item(s) via targeted projection update.");
        }

        private void ApplyTagCatalogProjection(CoreTagCatalogChangedPayload payload)
        {
            if (_libraryIndex == null)
            {
                return;
            }

            _libraryIndex.Categories = (payload.Categories ?? [])
                .Where(category => !string.IsNullOrWhiteSpace(category.Name))
                .Select(category => new TagCategory
                {
                    Id = category.Id ?? string.Empty,
                    Name = category.Name ?? string.Empty,
                    SortOrder = category.SortOrder
                })
                .ToList();
            _libraryIndex.Tags = (payload.Tags ?? [])
                .Where(tag => !string.IsNullOrWhiteSpace(tag.Name))
                .Select(tag => new Tag
                {
                    Name = tag.Name ?? string.Empty,
                    CategoryId = tag.CategoryId ?? string.Empty
                })
                .ToList();
            Log($"CoreEvents: tagCatalogChanged applied from server (reason={payload.Reason}).");
        }

        private void ApplySourceStateProjection(CoreSourceStateChangedPayload payload)
        {
            if (_libraryIndex == null || string.IsNullOrWhiteSpace(payload.SourceId))
            {
                return;
            }

            var source = _libraryIndex.Sources.FirstOrDefault(s =>
                string.Equals(s.Id, payload.SourceId, StringComparison.OrdinalIgnoreCase));
            if (source == null)
            {
                return;
            }

            source.IsEnabled = payload.IsEnabled;
            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
            UpdateLibraryInfoText();
        }

        private async Task<bool> ProbeCoreServerVersionAsync(bool updateStatus = false)
        {
            string? lastFailure = null;
            for (var attempt = 1; attempt <= CoreProbeMaxAttempts; attempt++)
            {
                try
                {
                    using var response = await _coreServerHttpClient.GetAsync($"{_coreServerBaseUrl.TrimEnd('/')}/api/version");
                    if (!response.IsSuccessStatusCode)
                    {
                        var snippet = await SafeReadResponseSnippetAsync(response);
                        lastFailure = BuildCoreProbeFailureMessage(response.StatusCode, snippet);
                        Log($"CoreServerProbe: attempt {attempt}/{CoreProbeMaxAttempts} failed ({lastFailure})");
                    }
                    else
                    {
                        await using var stream = await response.Content.ReadAsStreamAsync();
                        var version = await JsonSerializer.DeserializeAsync<CoreVersionResponse>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web)
                        {
                            PropertyNameCaseInsensitive = true
                        });
                        if (version == null)
                        {
                            lastFailure = "Version response was empty.";
                            Log($"CoreServerProbe: attempt {attempt}/{CoreProbeMaxAttempts} failed ({lastFailure})");
                        }
                        else
                        {
                            var compatibilityError = ValidateCoreServerCompatibility(version);
                            if (!string.IsNullOrWhiteSpace(compatibilityError))
                            {
                                lastFailure = compatibilityError;
                                Log($"CoreServerProbe: attempt {attempt}/{CoreProbeMaxAttempts} incompatible ({compatibilityError})");
                                break;
                            }

                            _isCoreApiReachable = true;
                            _lastCoreProbeFailureReason = null;
                            Log($"CoreServerProbe: /api/version success (api={version.ApiVersion}, app={version.AppVersion}, assets={version.AssetsVersion ?? "n/a"})");
                            EnsureCoreEventStreamStarted();
                            if (updateStatus)
                            {
                                SetStatusMessage("Core runtime connected.", 0);
                            }
                            return true;
                        }
                    }
                }
                catch (TaskCanceledException)
                {
                    lastFailure = $"Timed out after {_coreServerHttpClient.Timeout.TotalSeconds:0}s.";
                    Log($"CoreServerProbe: attempt {attempt}/{CoreProbeMaxAttempts} timeout.");
                }
                catch (Exception ex)
                {
                    lastFailure = ex.Message;
                    Log($"CoreServerProbe: attempt {attempt}/{CoreProbeMaxAttempts} unavailable ({ex.Message})");
                }

                if (attempt < CoreProbeMaxAttempts)
                {
                    await Task.Delay(TimeSpan.FromMilliseconds(350 * attempt));
                }
            }

            ApplyDisconnectedProjection();
            _lastCoreProbeFailureReason = lastFailure;
            if (updateStatus)
            {
                var reason = string.IsNullOrWhiteSpace(lastFailure) ? "No response from /api/version." : lastFailure;
                SetStatusMessage($"Core runtime unavailable ({reason}) Start ReelRoulette ServerApp and reconnect. {BuildCoreReconnectWaitingStatusText()}", 0);
            }
            return false;
        }

        private async Task<string> SafeReadResponseSnippetAsync(HttpResponseMessage response)
        {
            try
            {
                var content = await response.Content.ReadAsStringAsync();
                if (string.IsNullOrWhiteSpace(content))
                {
                    return string.Empty;
                }

                var singleLine = content.Replace(Environment.NewLine, " ").Trim();
                return singleLine.Length > 140 ? singleLine[..140] : singleLine;
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string BuildCoreProbeFailureMessage(HttpStatusCode statusCode, string snippet)
        {
            var baseMessage = $"HTTP {(int)statusCode} ({statusCode})";
            if (statusCode == HttpStatusCode.Unauthorized)
            {
                baseMessage += " - API auth required. Pair first (GET /api/pair?token=...).";
            }
            else if (statusCode == HttpStatusCode.Forbidden)
            {
                baseMessage += " - Request forbidden by server policy.";
            }

            if (!string.IsNullOrWhiteSpace(snippet))
            {
                baseMessage += $" Response: {snippet}";
            }

            return baseMessage;
        }

        private static string? ValidateCoreServerCompatibility(CoreVersionResponse version)
        {
            if (!int.TryParse(version.ApiVersion?.Trim(), out var apiVersion) || !SupportedCoreApiVersions.Contains(apiVersion))
            {
                return $"Server API version '{version.ApiVersion}' is not supported by this desktop build.";
            }

            if (int.TryParse(version.MinimumCompatibleApiVersion?.Trim(), out var minimumCompatible) &&
                DesktopApiVersion < minimumCompatible)
            {
                return $"Server requires desktop API version {version.MinimumCompatibleApiVersion} or newer.";
            }

            var capabilitySet = new HashSet<string>((version.Capabilities ?? []).Where(cap => !string.IsNullOrWhiteSpace(cap)), StringComparer.Ordinal);
            var missing = RequiredCoreCapabilities
                .Where(capability => !capabilitySet.Contains(capability))
                .ToList();
            if (missing.Count > 0)
            {
                return $"Server is missing required capabilities: {string.Join(", ", missing)}.";
            }

            return null;
        }

        private void ApplyDisconnectedProjection()
        {
            _isCoreApiReachable = false;
            StopCoreEventStream();
            _libraryIndex = new LibraryIndex();
            Dispatcher.UIThread.Post(() =>
            {
                if (_showLibraryPanel)
                {
                    UpdateLibraryPanel();
                }

                RecalculateGlobalStats();
                UpdateLibraryInfoText();
                UpdateFilterSummaryText();
            });
        }

        private void StartCoreReconnectLoop()
        {
            if (_coreReconnectLoopTask != null && !_coreReconnectLoopTask.IsCompleted)
            {
                return;
            }

            _coreReconnectLoopCancellationSource?.Cancel();
            _coreReconnectLoopCancellationSource?.Dispose();
            _coreReconnectLoopCancellationSource = new CancellationTokenSource();
            var token = _coreReconnectLoopCancellationSource.Token;

            _coreReconnectLoopTask = Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        if (!_isCoreApiReachable)
                        {
                            _lastCoreReconnectAttemptUtc = DateTimeOffset.UtcNow;
                            SetStatusMessage(BuildCoreReconnectWaitingStatusText(), 0);
                            var connected = await ProbeCoreServerVersionAsync(updateStatus: false);
                            if (connected)
                            {
                                var projectionSynced = await SyncLibraryProjectionFromCoreAsync();
                                if (!projectionSynced)
                                {
                                    SetStatusMessage(BuildCoreReconnectWaitingStatusText(), 0);
                                    continue;
                                }
                                _ = SyncPresetsFromCoreAsync();
                                _ = SyncSourcesFromCoreAsync();
                                _ = SyncRefreshSettingsFromCoreAsync();
                                _ = SyncBackupSettingsFromCoreAsync();
                                _ = SyncWebRuntimeSettingsFromCoreAsync();
                                _ = SyncRefreshStatusFromCoreAsync();
                                SetStatusMessage("Core runtime connected.", 0);
                            }
                            else
                            {
                                SetStatusMessage(BuildCoreReconnectWaitingStatusText(), 0);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Log($"CoreReconnect: Background reconnect attempt failed ({ex.Message})");
                    }

                    try
                    {
                        await Task.Delay(TimeSpan.FromSeconds(3), token);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }, token);
        }

        private void StopCoreReconnectLoop()
        {
            _coreReconnectLoopCancellationSource?.Cancel();
            _coreReconnectLoopCancellationSource?.Dispose();
            _coreReconnectLoopCancellationSource = null;
            _coreReconnectLoopTask = null;
        }

        private string BuildCoreReconnectWaitingStatusText()
        {
            var reasonText = string.IsNullOrWhiteSpace(_lastCoreProbeFailureReason)
                ? "Core runtime unavailable."
                : $"Core runtime unavailable ({_lastCoreProbeFailureReason}).";
            var attemptText = _lastCoreReconnectAttemptUtc.HasValue
                ? _lastCoreReconnectAttemptUtc.Value.ToLocalTime().ToString("HH:mm:ss")
                : "not yet";
            return $"{reasonText} Waiting to reconnect... (last attempt {attemptText})";
        }

        private async Task<bool> EnsureCoreRuntimeAvailableAsync()
        {
            var connected = await ProbeCoreServerVersionAsync(updateStatus: true);
            if (connected)
            {
                EnsureCoreEventStreamStarted();
                var projectionSynced = await SyncLibraryProjectionFromCoreAsync();
                if (!projectionSynced)
                {
                    SetStatusMessage("Core runtime is connected but not ready. Waiting for reconnect...", 0);
                    return false;
                }
                _ = SyncPresetsFromCoreAsync();
                _ = SyncSourcesFromCoreAsync();
                _ = SyncRefreshSettingsFromCoreAsync();
                _ = SyncBackupSettingsFromCoreAsync();
                _ = SyncWebRuntimeSettingsFromCoreAsync();
                _ = SyncRefreshStatusFromCoreAsync();
                return true;
            }
            return false;
        }

        private async Task<bool> EnsureCoreCommandApiAvailableAsync()
        {
            var connected = await ProbeCoreServerVersionAsync(updateStatus: true);
            if (connected)
            {
                EnsureCoreEventStreamStarted();
                return true;
            }

            return false;
        }

        private async Task<bool> SyncLibraryProjectionFromCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return false;
            }

            try
            {
                var payload = await _coreServerApiClient.GetLibraryProjectionAsync(_coreServerBaseUrl);
                if (!payload.HasValue)
                {
                    Log("CoreProjection: /api/library/projection returned null payload.");
                    ApplyDisconnectedProjection();
                    return false;
                }

                var projection = JsonSerializer.Deserialize<LibraryIndex>(
                    payload.Value.GetRawText(),
                    new JsonSerializerOptions(JsonSerializerDefaults.Web)
                    {
                        PropertyNameCaseInsensitive = true,
                        // Server emits string enum values (e.g. "Video"/"Photo", "Pending"/"Ready") but the desktop
                        // models use enums with numeric underlying values; accept string + integer forms.
                        Converters =
                        {
                            new JsonStringEnumConverter(allowIntegerValues: true)
                        }
                    });
                if (projection == null)
                {
                    Log("CoreProjection: Failed to deserialize projection payload into LibraryIndex.");
                    ApplyDisconnectedProjection();
                    return false;
                }

                _libraryIndex = projection;

                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }

                    UpdateLibraryInfoText();
                    UpdateFilterSummaryText();
                    RecalculateGlobalStats();
                });
                return true;
            }
            catch (Exception ex)
            {
                Log($"CoreProjection: Failed to sync library projection ({ex.Message})");
                ApplyDisconnectedProjection();
                return false;
            }
        }

        private async Task SyncTagCatalogToCoreAsync()
        {
            // Desktop is API-required and no longer pushes local authoritative tag catalog state.
            await Task.CompletedTask;
        }

        private async Task SyncFilterDialogCatalogFromCoreAsync()
        {
            if (!_isCoreApiReachable || _libraryIndex == null)
            {
                return;
            }

            try
            {
                var model = await _coreServerApiClient.GetTagEditorModelAsync(_coreServerBaseUrl, []);
                if (model == null)
                {
                    return;
                }

                _libraryIndex.Categories = (model.Categories ?? [])
                    .Where(c => !string.IsNullOrWhiteSpace(c.Name))
                    .Select(c => new TagCategory
                    {
                        Id = c.Id ?? string.Empty,
                        Name = c.Name ?? string.Empty,
                        SortOrder = c.SortOrder
                    })
                    .ToList();

                _libraryIndex.Tags = (model.Tags ?? [])
                    .Where(t => !string.IsNullOrWhiteSpace(t.Name))
                    .Select(t => new Tag
                    {
                        Name = t.Name ?? string.Empty,
                        CategoryId = t.CategoryId ?? "uncategorized"
                    })
                    .ToList();
            }
            catch (Exception ex)
            {
                Log($"FilterDialog: Failed to sync tag catalog from core ({ex.Message})");
            }
        }

        private void SyncRequestedItemTagsToCore(IReadOnlyList<string>? itemIds)
        {
            _ = itemIds;
            // Desktop is API-required and no longer pushes local authoritative item-tag state.
        }

        private void EnsureCoreEventStreamStarted()
        {
            if (_coreEventsTask != null && !_coreEventsTask.IsCompleted)
            {
                return;
            }

            _coreEventsCancellationSource?.Cancel();
            _coreEventsCancellationSource?.Dispose();
            _coreEventsCancellationSource = new CancellationTokenSource();
            var token = _coreEventsCancellationSource.Token;
            var sseApiClient = new CoreServerApiClient(_coreServerEventsHttpClient);

            _coreEventsTask = Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    Log($"CoreEvents: Connecting SSE stream (lastEventId={_coreLastEventRevision})...");
                    SetStatusMessage("Core events connecting...", 0);
                    try
                    {
                        await sseApiClient.ListenToEventsAsync(
                            _coreServerBaseUrl,
                            _coreClientId,
                            _coreSessionId,
                            "desktop",
                            Environment.MachineName,
                            _coreLastEventRevision > 0 ? _coreLastEventRevision : null,
                            HandleCoreServerEnvelopeAsync,
                            Log,
                            token);

                        if (token.IsCancellationRequested)
                        {
                            break;
                        }

                        Log("CoreEvents: SSE stream ended; scheduling reconnect.");
                        _isCoreApiReachable = false;
                        _coreEventsReconnectPending = true;
                        SetStatusMessage("Core events disconnected. Reconnecting...", 0);
                    }
                    catch (OperationCanceledException)
                    {
                        Log("CoreEvents: SSE stream cancelled.");
                        break;
                    }
                    catch (Exception ex)
                    {
                        Log($"CoreEvents: SSE stream failed ({ex.Message}); scheduling reconnect.");
                        _isCoreApiReachable = false;
                        _coreEventsReconnectPending = true;
                        SetStatusMessage("Core events disconnected. Reconnecting...", 0);
                    }

                    if (token.IsCancellationRequested)
                    {
                        break;
                    }

                    try
                    {
                        await Task.Delay(TimeSpan.FromSeconds(2), token);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }, token);
        }

        private void StopCoreEventStream()
        {
            _coreEventsCancellationSource?.Cancel();
            _coreEventsTask = null;
        }

        private async Task HandleCoreServerEnvelopeAsync(CoreServerEventEnvelope envelope)
        {
            if (string.IsNullOrWhiteSpace(envelope.EventType))
            {
                return;
            }

            if (_coreEventsReconnectPending)
            {
                _coreEventsReconnectPending = false;
                SetStatusMessage("Core events reconnected.", 0);
            }
            _coreLastEventRevision = Math.Max(_coreLastEventRevision, envelope.Revision);
            var eventPayloadOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            switch (envelope.EventType)
            {
                case "itemStateChanged":
                    CoreItemStateChangedPayload? itemState = null;
                    try
                    {
                        itemState = envelope.Payload.Deserialize<CoreItemStateChangedPayload>(eventPayloadOptions);
                    }
                    catch
                    {
                        // Ignore malformed payloads and keep stream alive.
                    }

                    if (itemState == null || string.IsNullOrWhiteSpace(itemState.Path))
                    {
                        Log("CoreEvents: itemStateChanged payload missing required path.");
                        return;
                    }

                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        ApplyRemoteItemStateProjection(itemState.Path, itemState.IsFavorite, itemState.IsBlacklisted, $"Core sync update: {Path.GetFileName(itemState.Path)}");
                    });
                    break;
                case "playbackRecorded":
                    CorePlaybackRecordedPayload? playback = null;
                    try
                    {
                        playback = envelope.Payload.Deserialize<CorePlaybackRecordedPayload>(eventPayloadOptions);
                    }
                    catch
                    {
                        // Ignore malformed payloads and keep stream alive.
                    }

                    if (playback == null || string.IsNullOrWhiteSpace(playback.Path))
                    {
                        return;
                    }

                    await Dispatcher.UIThread.InvokeAsync(async () =>
                    {
                        if (!TryApplyPlaybackProjectionFromEvent(playback))
                        {
                            await RecordPlaybackProjectionAsync(playback.Path);
                        }
                    });
                    break;
                case "itemTagsChanged":
                    CoreItemTagsChangedPayload? itemTags = null;
                    try
                    {
                        itemTags = envelope.Payload.Deserialize<CoreItemTagsChangedPayload>(eventPayloadOptions);
                    }
                    catch
                    {
                        // Ignore malformed payloads and keep stream alive.
                    }

                    if (itemTags == null)
                    {
                        return;
                    }

                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        ApplyItemTagsProjection(itemTags);
                    });
                    break;
                case "tagCatalogChanged":
                    CoreTagCatalogChangedPayload? tagCatalog = null;
                    try
                    {
                        tagCatalog = envelope.Payload.Deserialize<CoreTagCatalogChangedPayload>(eventPayloadOptions);
                    }
                    catch
                    {
                        // Ignore malformed payloads and keep stream alive.
                    }

                    if (tagCatalog == null)
                    {
                        return;
                    }

                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        ApplyTagCatalogProjection(tagCatalog);
                    });
                    break;
                case "sourceStateChanged":
                    CoreSourceStateChangedPayload? sourceState = null;
                    try
                    {
                        sourceState = envelope.Payload.Deserialize<CoreSourceStateChangedPayload>(eventPayloadOptions);
                    }
                    catch
                    {
                        // Ignore malformed payloads and keep stream alive.
                    }

                    if (sourceState == null || string.IsNullOrWhiteSpace(sourceState.SourceId))
                    {
                        return;
                    }

                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        ApplySourceStateProjection(sourceState);
                    });
                    break;
                case "refreshStatusChanged":
                    CoreRefreshStatusChangedPayload? refreshStatusChanged = null;
                    try
                    {
                        refreshStatusChanged = envelope.Payload.Deserialize<CoreRefreshStatusChangedPayload>(eventPayloadOptions);
                    }
                    catch
                    {
                        // Ignore malformed payloads and keep stream alive.
                    }

                    if (refreshStatusChanged?.Snapshot == null)
                    {
                        return;
                    }

                    await Dispatcher.UIThread.InvokeAsync(() =>
                    {
                        ApplyRefreshStatusProjection(refreshStatusChanged.Snapshot);
                    });
                    break;
                case "resyncRequired":
                    string reason = "event stream gap detected";
                    if (envelope.Payload.ValueKind == JsonValueKind.Object &&
                        envelope.Payload.TryGetProperty("reason", out var reasonProperty))
                    {
                        var parsedReason = reasonProperty.GetString();
                        if (!string.IsNullOrWhiteSpace(parsedReason))
                        {
                            reason = parsedReason;
                        }
                    }

                    SetStatusMessage($"Core events resync requested ({reason}). Reloading projections...", 0);
                    if (_isCoreApiReachable)
                    {
                        var projectionSynced = await SyncLibraryProjectionFromCoreAsync();
                        if (projectionSynced)
                        {
                            _ = SyncPresetsFromCoreAsync();
                            _ = SyncSourcesFromCoreAsync();
                            _ = SyncRefreshSettingsFromCoreAsync();
                            _ = SyncBackupSettingsFromCoreAsync();
                            _ = SyncWebRuntimeSettingsFromCoreAsync();
                            _ = SyncRefreshStatusFromCoreAsync();
                            SetStatusMessage("Core events resync complete.", 0);
                        }
                        else
                        {
                            SetStatusMessage("Core events resync failed. Waiting for reconnect...", 0);
                        }
                    }
                    break;
            }
        }

        private void ApplyRefreshStatusProjection(CoreRefreshStatusSnapshot snapshot)
        {
            if (snapshot.IsRunning)
            {
                var stage = string.IsNullOrWhiteSpace(snapshot.CurrentStage) ? "initializing" : snapshot.CurrentStage;
                var active = snapshot.Stages.FirstOrDefault(s => string.Equals(s.Stage, stage, StringComparison.OrdinalIgnoreCase));
                var percent = active?.Percent ?? 0;
                var message = string.IsNullOrWhiteSpace(active?.Message) ? stage : active!.Message;
                SetStatusMessage($"Core refresh: {message} ({percent}%)", 0);
                return;
            }

            var hasCompleted = snapshot.CompletedUtc.HasValue;
            if (hasCompleted)
            {
                var completionRunId = string.IsNullOrWhiteSpace(snapshot.RunId) ? "__no-run-id__" : snapshot.RunId;
                if (!string.Equals(_lastAppliedRefreshCompletionRunId, completionRunId, StringComparison.Ordinal))
                {
                    _lastAppliedRefreshCompletionRunId = completionRunId;
                    // Do not reload local library.json on refresh completion.
                    _ = SyncLibraryProjectionFromCoreAsync();
                    UpdateLibraryInfoText();
                    UpdateFilterSummaryText();
                    RecalculateGlobalStats();

                    var thumbnailStage = snapshot.Stages.FirstOrDefault(stage =>
                        string.Equals(stage.Stage, "thumbnailGeneration", StringComparison.OrdinalIgnoreCase));
                    if (thumbnailStage?.IsComplete == true && _libraryGridViewEnabled)
                    {
                        Dispatcher.UIThread.Post(HydrateThumbnailsForVisibleGridItems);
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(snapshot.LastError))
            {
                SetStatusMessage($"Core refresh failed: {snapshot.LastError}", 0);
                return;
            }

            if (hasCompleted)
            {
                string? GetStageMessage(string stageName)
                {
                    var stage = snapshot.Stages.FirstOrDefault(s =>
                        string.Equals(s.Stage, stageName, StringComparison.OrdinalIgnoreCase));
                    if (stage == null || string.IsNullOrWhiteSpace(stage.Message))
                    {
                        return null;
                    }

                    return stage.Message.Trim();
                }

                var sourceSummary = BuildSourceRefreshSummary(GetStageMessage("sourceRefresh"));
                var fingerprintSummary = BuildFingerprintScanSummary(GetStageMessage("fingerprintScan"));
                var durationSummary = BuildDurationScanSummary(GetStageMessage("durationScan"));
                var loudnessSummary = BuildLoudnessScanSummary(GetStageMessage("loudnessScan"));
                var thumbnailSummary = BuildThumbnailSummary(GetStageMessage("thumbnailGeneration"));

                var finalMessage =
                    $"Core refresh complete | Source: {sourceSummary} | Fingerprint: {fingerprintSummary} | Duration: {durationSummary} | Loudness: {loudnessSummary} | Thumbnails: {thumbnailSummary}";
                SetStatusMessage(finalMessage, 0);
            }
        }

        private static string BuildSourceRefreshSummary(string? stageMessage)
        {
            if (string.IsNullOrWhiteSpace(stageMessage))
            {
                return "no data";
            }

            if (ContainsUnavailableToken(stageMessage))
            {
                return "unavailable";
            }

            var counts = ParseStageCounts(stageMessage);
            if (counts.Count == 0)
            {
                return "no data";
            }

            var tokens = new List<string>();
            AddNonZeroToken(tokens, "added", GetCount(counts, "added"));
            AddNonZeroToken(tokens, "removed", GetCount(counts, "removed"));
            AddNonZeroToken(tokens, "renamed", GetCount(counts, "renamed"));
            AddNonZeroToken(tokens, "moved", GetCount(counts, "moved"));
            AddNonZeroToken(tokens, "updated", GetCount(counts, "updated"));
            AddNonZeroToken(tokens, "unresolved", GetCount(counts, "unresolved"));

            return tokens.Count == 0
                ? "no changes"
                : string.Join(", ", tokens);
        }

        private static string BuildDurationScanSummary(string? stageMessage)
        {
            if (string.IsNullOrWhiteSpace(stageMessage))
            {
                return "no data";
            }

            if (ContainsUnavailableToken(stageMessage))
            {
                return "unavailable";
            }

            var counts = ParseStageCounts(stageMessage);
            if (!counts.TryGetValue("files", out var files))
            {
                return "no data";
            }

            if (stageMessage.IndexOf("all cached", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return $"files {files}, all cached";
            }

            var updated = GetCount(counts, "updated");
            var forcedSuffix = stageMessage.IndexOf("forced full rescan", StringComparison.OrdinalIgnoreCase) >= 0 ? ", forced" : string.Empty;
            return $"files {files}, updated {updated}{forcedSuffix}";
        }

        private static string BuildLoudnessScanSummary(string? stageMessage)
        {
            if (string.IsNullOrWhiteSpace(stageMessage))
            {
                return "no data";
            }

            if (ContainsUnavailableToken(stageMessage))
            {
                return "unavailable";
            }

            var counts = ParseStageCounts(stageMessage);
            if (!counts.TryGetValue("files", out var files))
            {
                return "no data";
            }

            if (files == 0)
            {
                return "no eligible files";
            }

            if (stageMessage.IndexOf("all scanned", StringComparison.OrdinalIgnoreCase) >= 0 ||
                stageMessage.IndexOf("all cached", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return $"files {files}, all cached";
            }

            var updated = GetCount(counts, "updated");
            var withoutAudio = GetCount(counts, "without audio");
            var errors = GetCount(counts, "errors");
            var tokens = new List<string> { $"files {files}" };
            AddNonZeroToken(tokens, "updated", updated);
            AddNonZeroToken(tokens, "no-audio", withoutAudio);
            AddNonZeroToken(tokens, "errors", errors);
            if (stageMessage.IndexOf("forced full rescan", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                tokens.Add("forced");
            }

            return string.Join(", ", tokens);
        }

        private static string BuildFingerprintScanSummary(string? stageMessage)
        {
            if (string.IsNullOrWhiteSpace(stageMessage))
            {
                return "no data";
            }

            if (ContainsUnavailableToken(stageMessage))
            {
                return "unavailable";
            }

            var counts = ParseStageCounts(stageMessage);
            if (counts.Count == 0)
            {
                return "no data";
            }

            var tokens = new List<string>();
            AddNonZeroToken(tokens, "hashed", GetCount(counts, "hashed"));
            AddNonZeroToken(tokens, "ready", GetCount(counts, "ready"));
            AddNonZeroToken(tokens, "failed", GetCount(counts, "failed"));
            AddNonZeroToken(tokens, "skipped", GetCount(counts, "skipped"));
            return tokens.Count == 0 ? "none" : string.Join(", ", tokens);
        }

        private static string BuildThumbnailSummary(string? stageMessage)
        {
            if (string.IsNullOrWhiteSpace(stageMessage))
            {
                return "no data";
            }

            if (ContainsUnavailableToken(stageMessage))
            {
                return "unavailable";
            }

            var counts = ParseStageCounts(stageMessage);
            if (counts.Count == 0)
            {
                return "no data";
            }

            var tokens = new List<string>();
            AddNonZeroToken(tokens, "generated", GetCount(counts, "generated"));
            AddNonZeroToken(tokens, "regenerated", GetCount(counts, "regenerated"));
            AddNonZeroToken(tokens, "reused", GetCount(counts, "reused"));
            AddNonZeroToken(tokens, "failed", GetCount(counts, "failed"));
            AddNonZeroToken(tokens, "missing", GetCount(counts, "missing source"));
            AddNonZeroToken(tokens, "metadata", GetCount(counts, "metadata updated"));
            AddNonZeroToken(tokens, "stale", GetCount(counts, "stale removed"));
            AddNonZeroToken(tokens, "evicted", GetCount(counts, "evicted"));

            return tokens.Count == 0
                ? "none"
                : string.Join(", ", tokens);
        }

        private static void AddNonZeroToken(List<string> tokens, string label, int value)
        {
            if (value > 0)
            {
                tokens.Add($"{label} {value}");
            }
        }

        private static bool ContainsUnavailableToken(string stageMessage)
        {
            return stageMessage.IndexOf("unavailable", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static Dictionary<string, int> ParseStageCounts(string stageMessage)
        {
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var openParen = stageMessage.IndexOf('(');
            if (openParen < 0)
            {
                return counts;
            }

            var closeParen = stageMessage.IndexOf(')', openParen + 1);
            if (closeParen <= openParen)
            {
                return counts;
            }

            var payload = stageMessage.Substring(openParen + 1, closeParen - openParen - 1);
            var segments = payload.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var segment in segments)
            {
                var labelStart = 0;
                while (labelStart < segment.Length && char.IsWhiteSpace(segment[labelStart]))
                {
                    labelStart++;
                }

                var valueStart = labelStart;
                while (valueStart < segment.Length && char.IsDigit(segment[valueStart]))
                {
                    valueStart++;
                }

                if (valueStart == labelStart)
                {
                    continue;
                }

                if (!int.TryParse(segment.Substring(labelStart, valueStart - labelStart), out var value))
                {
                    continue;
                }

                var label = segment.Substring(valueStart).Trim();
                if (string.IsNullOrWhiteSpace(label))
                {
                    continue;
                }

                counts[label] = value;
            }

            return counts;
        }

        private static int GetCount(Dictionary<string, int> counts, string key)
        {
            return counts.TryGetValue(key, out var value) ? value : 0;
        }

        private async Task<bool> RequestCoreRefreshAsync()
        {
            if (!await EnsureCoreRuntimeAvailableAsync())
            {
                return false;
            }

            try
            {
                var response = await _coreServerApiClient.StartRefreshAsync(_coreServerBaseUrl);
                if (response == null)
                {
                    SetStatusMessage("Core refresh request failed.", 0);
                    return false;
                }

                if (response.Accepted)
                {
                    SetStatusMessage("Core refresh started.", 0);
                    _ = SyncRefreshStatusFromCoreAsync();
                    return true;
                }

                SetStatusMessage("Core refresh already running.", 0);
                return false;
            }
            catch (Exception ex)
            {
                Log($"CoreRefresh: Failed to start ({ex.Message})");
                SetStatusMessage("Core refresh request failed.", 0);
                return false;
            }
        }

        private async Task SyncRefreshStatusFromCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return;
            }

            try
            {
                var snapshot = await _coreServerApiClient.GetRefreshStatusAsync(_coreServerBaseUrl);
                if (snapshot != null)
                {
                    await Dispatcher.UIThread.InvokeAsync(() => ApplyRefreshStatusProjection(snapshot));
                }
            }
            catch (Exception ex)
            {
                Log($"CoreRefresh: Failed to fetch refresh status ({ex.Message})");
            }
        }

        private async Task SyncRefreshSettingsFromCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return;
            }

            try
            {
                var settings = await _coreServerApiClient.GetRefreshSettingsAsync(_coreServerBaseUrl);
                if (settings == null)
                {
                    return;
                }

                _autoRefreshSourcesEnabled = settings.AutoRefreshEnabled;
                _autoRefreshIntervalMinutes = Math.Clamp(settings.AutoRefreshIntervalMinutes, 5, 1440);
                _forceRescanLoudnessOnNextRefresh = settings.ForceRescanLoudness;
                _forceRescanDurationOnNextRefresh = settings.ForceRescanDuration;
                _fingerprintScanMaxDegreeOfParallelism = Math.Clamp(settings.FingerprintScanMaxDegreeOfParallelism, 1, 16);
            }
            catch (Exception ex)
            {
                Log($"CoreRefresh: Failed to fetch refresh settings ({ex.Message})");
            }
        }

        private async Task SyncBackupSettingsFromCoreAsync()
        {
            _serverBackupSettingsWritable = _isCoreApiReachable;
            if (!_isCoreApiReachable)
            {
                return;
            }

            try
            {
                var settings = await _coreServerApiClient.GetBackupSettingsAsync(_coreServerBaseUrl);
                if (settings == null)
                {
                    return;
                }

                _backupLibraryEnabled = settings.Enabled;
                _minimumBackupGapMinutes = Math.Clamp(settings.MinimumBackupGapMinutes, 1, 10080);
                _numberOfBackups = Math.Clamp(settings.NumberOfBackups, 1, 100);
                _serverBackupSettingsWritable = true;
            }
            catch (Exception ex)
            {
                _serverBackupSettingsWritable = false;
                Log($"CoreBackup: Failed to fetch backup settings ({ex.Message})");
            }
        }

        private async Task SyncWebRuntimeSettingsFromCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return;
            }

            try
            {
                var previousEnabled = _webRemoteEnabled;
                var previousPort = _webRemotePort;
                var previousBindOnLan = _webRemoteBindOnLan;
                var previousLanHostname = _webRemoteLanHostname;
                var previousAuthMode = _webRemoteAuthMode;
                var previousSharedToken = _webRemoteSharedToken;

                var settings = await _coreServerApiClient.GetWebRuntimeSettingsAsync(_coreServerBaseUrl);
                if (settings == null)
                {
                    return;
                }

                _webRemoteEnabled = settings.Enabled;
                _webRemotePort = settings.Port > 0 ? settings.Port : 45123;
                _webRemoteBindOnLan = settings.BindOnLan;
                _webRemoteLanHostname = NormalizeWebRemoteLanHostname(settings.LanHostname);
                _webRemoteAuthMode = string.Equals(settings.AuthMode, "Off", StringComparison.OrdinalIgnoreCase)
                    ? WebUiAuthMode.Off
                    : WebUiAuthMode.TokenRequired;
                _webRemoteSharedToken = settings.SharedToken;

                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    if (OpenWebUiMenuItem != null)
                    {
                        OpenWebUiMenuItem.IsEnabled = _webRemoteEnabled;
                    }
                });

                var changed =
                    previousEnabled != _webRemoteEnabled ||
                    previousPort != _webRemotePort ||
                    previousBindOnLan != _webRemoteBindOnLan ||
                    !string.Equals(previousLanHostname, _webRemoteLanHostname, StringComparison.OrdinalIgnoreCase) ||
                    previousAuthMode != _webRemoteAuthMode ||
                    !string.Equals(previousSharedToken ?? string.Empty, _webRemoteSharedToken ?? string.Empty, StringComparison.Ordinal);

                if (changed)
                {
                    Log("CoreRuntimeSettings: Web UI settings changed and are now core-owned; worker runtime applies lifecycle updates.");
                }
            }
            catch (Exception ex)
            {
                Log($"CoreRuntimeSettings: Failed to fetch web runtime settings ({ex.Message})");
            }
        }

        private async Task SyncPresetsFromCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return;
            }

            try
            {
                var presets = await _coreServerApiClient.GetPresetsAsync(_coreServerBaseUrl);
                if (presets == null)
                {
                    return;
                }

                var mapped = presets
                    .Where(p => !string.IsNullOrWhiteSpace(p.Name))
                    .Select(p => new FilterPreset
                    {
                        Name = p.Name.Trim(),
                        FilterState = ParseCorePresetFilterState(p.FilterState)
                    })
                    .GroupBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(group => group.First())
                    .ToList();

                _filterPresets = mapped;
                _activePresetName = await MatchPresetNameFromCoreAsync(_currentFilterState) ??
                                    ResolveMatchingPresetName(_currentFilterState, _filterPresets);
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    UpdateLibraryPresetComboBox();
                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                });
            }
            catch (Exception ex)
            {
                Log($"CorePresetSync: Failed to fetch presets ({ex.Message})");
            }
        }

        private async Task<string?> MatchPresetNameFromCoreAsync(FilterState? filterState)
        {
            if (!_isCoreApiReachable || filterState == null)
            {
                return null;
            }

            try
            {
                var response = await _coreServerApiClient.MatchPresetAsync(_coreServerBaseUrl, new CorePresetMatchRequest
                {
                    FilterState = JsonSerializer.SerializeToElement(filterState)
                });

                if (response?.Matched == true && !string.IsNullOrWhiteSpace(response.PresetName))
                {
                    return response.PresetName.Trim();
                }
            }
            catch (Exception ex)
            {
                Log($"CorePresetSync: Failed to match preset ({ex.Message})");
            }

            return null;
        }

        private static FilterState ParseCorePresetFilterState(JsonElement? filterState)
        {
            if (!filterState.HasValue ||
                filterState.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            {
                return new FilterState();
            }

            try
            {
                var parsed = JsonSerializer.Deserialize<FilterState>(filterState.Value.GetRawText());
                return parsed ?? new FilterState();
            }
            catch
            {
                return new FilterState();
            }
        }

        private static string? ResolveMatchingPresetName(FilterState? currentFilterState, IReadOnlyList<FilterPreset>? presets)
        {
            if (currentFilterState == null || presets == null || presets.Count == 0)
            {
                return null;
            }

            var currentJson = JsonSerializer.Serialize(currentFilterState);
            foreach (var preset in presets)
            {
                if (string.IsNullOrWhiteSpace(preset.Name))
                {
                    continue;
                }

                var presetJson = JsonSerializer.Serialize(preset.FilterState ?? new FilterState());
                if (string.Equals(currentJson, presetJson, StringComparison.Ordinal))
                {
                    return preset.Name.Trim();
                }
            }

            return null;
        }

        private PlaybackTarget? ResolvePlaybackTargetFromApiRandomResponse(CoreRandomResponse response)
        {
            if (response == null)
            {
                return null;
            }

            var statsPath = response.Id?.Trim();
            if (string.IsNullOrWhiteSpace(statsPath))
            {
                return null;
            }

            var localAccessible = IsLocalMediaReadable(statsPath);
            var shouldUseApiPath = _forceApiPlayback || !localAccessible;
            if (!shouldUseApiPath)
            {
                return new PlaybackTarget(
                    StatsPath: statsPath,
                    PlaybackSource: statsPath,
                    PlaybackSourceType: FromType.FromPath,
                    IsLocallyAccessible: true,
                    UsedApiPath: false);
            }

            var absoluteMediaUrl = ResolveAbsoluteMediaUrl(response.MediaUrl);
            if (string.IsNullOrWhiteSpace(absoluteMediaUrl))
            {
                if (!TryBuildApiMediaUrl(statsPath, out var builtApiMediaUrl))
                {
                    return null;
                }

                absoluteMediaUrl = builtApiMediaUrl;
            }

            return new PlaybackTarget(
                StatsPath: statsPath,
                PlaybackSource: absoluteMediaUrl!,
                PlaybackSourceType: FromType.FromLocation,
                IsLocallyAccessible: localAccessible,
                UsedApiPath: true);
        }

        private string? ResolveAbsoluteMediaUrl(string? mediaUrl)
        {
            if (string.IsNullOrWhiteSpace(mediaUrl))
            {
                return null;
            }

            if (Uri.TryCreate(mediaUrl, UriKind.Absolute, out var absolute))
            {
                return absolute.ToString();
            }

            if (!Uri.TryCreate(_coreServerBaseUrl, UriKind.Absolute, out var baseUri))
            {
                return null;
            }

            var normalizedRelative = mediaUrl.StartsWith("/", StringComparison.Ordinal)
                ? mediaUrl
                : "/" + mediaUrl;
            return new Uri(baseUri, normalizedRelative).ToString();
        }

        private async Task SyncPresetsToCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return;
            }

            try
            {
                var presets = (_filterPresets ?? new List<FilterPreset>())
                    .Select(p => new CoreFilterPresetSnapshot
                    {
                        Name = p.Name,
                        FilterState = JsonSerializer.SerializeToElement(p.FilterState)
                    })
                    .ToList();

                await _coreServerApiClient.SyncPresetsAsync(_coreServerBaseUrl, presets);
            }
            catch (Exception ex)
            {
                Log($"CorePresetSync: Failed to sync presets ({ex.Message})");
            }
        }

        private async Task SyncSourcesFromCoreAsync()
        {
            if (!_isCoreApiReachable || _libraryIndex == null)
            {
                return;
            }

            try
            {
                var sources = await _coreServerApiClient.GetSourcesAsync(_coreServerBaseUrl);
                if (sources == null)
                {
                    return;
                }

                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    var sourceById = _libraryIndex.Sources.ToDictionary(s => s.Id, StringComparer.OrdinalIgnoreCase);
                    foreach (var source in sources)
                    {
                        if (string.IsNullOrWhiteSpace(source.Id))
                        {
                            continue;
                        }

                        if (sourceById.TryGetValue(source.Id, out var local))
                        {
                            local.IsEnabled = source.IsEnabled;
                            if (!string.IsNullOrWhiteSpace(source.DisplayName))
                            {
                                local.DisplayName = source.DisplayName;
                            }
                        }
                    }

                    if (_showLibraryPanel)
                    {
                        UpdateLibraryPanel();
                    }
                    UpdateLibraryInfoText();
                });
            }
            catch (Exception ex)
            {
                Log($"CoreSourceSync: Failed to fetch sources ({ex.Message})");
            }
        }

        private async Task<CoreLibraryStatsResponse?> FetchLibraryStatsViaCoreAsync()
        {
            if (!_isCoreApiReachable)
            {
                return null;
            }

            try
            {
                return await _coreServerApiClient.GetLibraryStatsAsync(_coreServerBaseUrl);
            }
            catch (Exception ex)
            {
                Log($"CoreLibraryStats: Failed to fetch library stats ({ex.Message})");
                return null;
            }
        }

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
            public bool ForceApiPlayback { get; set; } = false;
            public DuplicateHandlingDefaultBehavior DuplicateHandlingDefaultBehavior { get; set; } = DuplicateHandlingDefaultBehavior.KeepAll;
            public bool IsMuted { get; set; } = false; // Persist mute state
            public int VolumeLevel { get; set; } = 100; // Persist volume level (0-200)
            public RandomizationMode RandomizationMode { get; set; } = RandomizationMode.SmartShuffle;
            public bool RandomizationModeMigrated { get; set; } = false;
            public int PhotoDisplayDurationSeconds { get; set; } = 5; // Photo display duration
            
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
        }

        private static SettingsStorageService<AppSettings> CreateSettingsStorageService()
        {
            return new SettingsStorageService<AppSettings>(new JsonFileStorageOptions<AppSettings>
            {
                FilePathResolver = AppDataManager.GetSettingsPath,
                CreateDefault = () => new AppSettings(),
                SerializerOptions = new JsonSerializerOptions { WriteIndented = true },
                Logger = Log
            });
        }

        // Static methods for dialog persistence (can be called from dialogs)
        public static void SaveDialogBounds(string dialogName, double x, double y, double width, double height)
        {
            try
            {
                var storage = CreateSettingsStorageService();
                var settings = storage.Load();

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

                storage.Save(settings);
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
                var storage = CreateSettingsStorageService();
                var settings = storage.Load();

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
            _isLoadingSettings = true;
            try
            {
            var settingsStorage = CreateSettingsStorageService();
            var settings = settingsStorage.Load();

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
            _coreClientId = string.IsNullOrWhiteSpace(settings.CoreClientId)
                ? Guid.NewGuid().ToString("N")
                : settings.CoreClientId.Trim();
            
            // Apply playback preferences (now persisted)
            _isLoopEnabled = settings.LoopEnabled;
            _autoPlayNext = settings.AutoPlayNext;
            _forceApiPlayback = settings.ForceApiPlayback;
            _duplicateHandlingDefaultBehavior = settings.DuplicateHandlingDefaultBehavior;
            _isMuted = settings.IsMuted;
            _userVolumePreference = settings.VolumeLevel; // Restore saved volume level
            
            // Initialize _lastNonZeroVolume from saved volume for proper unmute behavior
            if (settings.VolumeLevel > 0)
            {
                _lastNonZeroVolume = settings.VolumeLevel;
            }
            
            // One-time migration rule: force all existing users to SmartShuffle after this update.
            if (!settings.RandomizationModeMigrated)
            {
                _randomizationMode = RandomizationMode.SmartShuffle;
                _randomizationModeMigrated = true;
                settings.RandomizationMode = _randomizationMode;
                settings.RandomizationModeMigrated = true;
                Log("LoadSettings: Applied one-time randomization migration to SmartShuffle");
                try
                {
                    settingsStorage.Save(settings);
                    Log("LoadSettings: Persisted randomization migration marker");
                }
                catch (Exception persistEx)
                {
                    Log($"LoadSettings: Failed to persist randomization migration marker ({persistEx.Message})");
                }
            }
            else
            {
                _randomizationMode = settings.RandomizationMode;
                _randomizationModeMigrated = settings.RandomizationModeMigrated;
            }
            _photoDisplayDurationSeconds = settings.PhotoDisplayDurationSeconds > 0 ? settings.PhotoDisplayDurationSeconds : 5; // Default to 5 if invalid
            Log($"LoadSettings: Restored photo display duration: {_photoDisplayDurationSeconds} seconds");
            
            // Load image scaling settings
            _imageScalingMode = settings.ImageScalingMode;
            _fixedImageMaxWidth = settings.FixedImageMaxWidth > 0 ? settings.FixedImageMaxWidth : 3840;
            _fixedImageMaxHeight = settings.FixedImageMaxHeight > 0 ? settings.FixedImageMaxHeight : 2160;
            Log($"LoadSettings: Restored image scaling - Mode: {_imageScalingMode}, FixedMax: {_fixedImageMaxWidth}x{_fixedImageMaxHeight}");
            
            // Server backup settings are core-owned and loaded via API.
            _backupLibraryEnabled = true;
            _minimumBackupGapMinutes = 360;
            _numberOfBackups = 8;
            _serverBackupSettingsWritable = false;
            _backupSettingsEnabled = settings.BackupSettingsEnabled;
            _minimumSettingsBackupGapMinutes = settings.MinimumSettingsBackupGapMinutes > 0 ? settings.MinimumSettingsBackupGapMinutes : 15;
            _numberOfSettingsBackups = settings.NumberOfSettingsBackups > 0 ? settings.NumberOfSettingsBackups : 10;
            Log($"LoadSettings: Restored backup settings - Server defaults pending core sync, ClientEnabled: {_backupSettingsEnabled}, ClientMinGap: {_minimumSettingsBackupGapMinutes} minutes, ClientCount: {_numberOfSettingsBackups}");
            
            // Refresh settings are core-owned and loaded via API.
            _autoRefreshSourcesEnabled = true;
            _autoRefreshIntervalMinutes = 60;
            _forceRescanLoudnessOnNextRefresh = false;
            _forceRescanDurationOnNextRefresh = false;
            _fingerprintScanMaxDegreeOfParallelism = 4;
            _libraryGridViewEnabled = settings.LibraryGridViewEnabled;
            Log("LoadSettings: Using core-owned refresh settings defaults until API sync.");

            Log("LoadSettings: Web runtime settings are core-owned; desktop will sync them via API.");
            if (OpenWebUiMenuItem != null)
                OpenWebUiMenuItem.IsEnabled = _webRemoteEnabled;

            _coreServerBaseUrl = string.IsNullOrWhiteSpace(settings.CoreServerBaseUrl)
                ? "http://localhost:45123"
                : settings.CoreServerBaseUrl.Trim();
            ClientLogRelay.SetBaseUrl(_coreServerBaseUrl);
            
            // Bug fix: Initialize _lastNonZeroVolume with saved volume level
            // This ensures unmuting restores the correct volume, not the default (100)
            if (_userVolumePreference > 0)
            {
                _lastNonZeroVolume = _userVolumePreference;
            }
            
            // Sync UI controls with loaded settings
            _isProgrammaticUiSync = true;
            try
            {
                if (LoopToggle != null)
                {
                    LoopToggle.IsChecked = _isLoopEnabled;
                }
                if (AutoPlayNextCheckBox != null)
                {
                    AutoPlayNextCheckBox.IsChecked = _autoPlayNext;
                }
                UpdateRandomizationModeComboBox();
            }
            finally
            {
                _isProgrammaticUiSync = false;
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
            
            Log($"LoadSettings: Restored playback preferences - Loop={_isLoopEnabled}, AutoPlay={_autoPlayNext}, ForceApiPlayback={_forceApiPlayback}, DuplicateHandlingDefault={_duplicateHandlingDefaultBehavior}, Muted={_isMuted}, RandomizationMode={_randomizationMode}, CoreClientId={_coreClientId}, CoreSessionId={_coreSessionId}");
            
            // Apply filter state
            var previousFilterState = _currentFilterState;
            _currentFilterState = settings.FilterState ?? new FilterState();
            if (previousFilterState != _currentFilterState)
            {
                Log($"STATE CHANGE: Filter state loaded from settings - FavoritesOnly={_currentFilterState.FavoritesOnly}, ExcludeBlacklisted={_currentFilterState.ExcludeBlacklisted}, AudioFilter={_currentFilterState.AudioFilter}");
            }
            
            // Preset catalog is API-owned; no local preset fallback.
            _filterPresets = [];
            _activePresetName = null;
            _autoTagScanFullLibrary = settings.AutoTagScanFullLibrary;
            Log("LoadSettings: Presets will be loaded from API; active preset will be derived from filter state.");
            
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
            finally
            {
                _isLoadingSettings = false;
            }
        }

        private void SaveSettings()
        {
            if (_isLoadingSettings)
            {
                Log("SaveSettings: Skipped while loading settings");
                return;
            }

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
                var settingsStorage = CreateSettingsStorageService();
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
                var settings = settingsStorage.Load();
                
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
                settings.ForceApiPlayback = _forceApiPlayback;
                settings.DuplicateHandlingDefaultBehavior = _duplicateHandlingDefaultBehavior;
                settings.IsMuted = _isMuted;
                settings.VolumeLevel = _isMuted ? _lastNonZeroVolume : _userVolumePreference;
                settings.RandomizationMode = _randomizationMode;
                settings.RandomizationModeMigrated = _randomizationModeMigrated;
                settings.PhotoDisplayDurationSeconds = _photoDisplayDurationSeconds;
                
                // Image scaling
                settings.ImageScalingMode = _imageScalingMode;
                settings.FixedImageMaxWidth = _fixedImageMaxWidth;
                settings.FixedImageMaxHeight = _fixedImageMaxHeight;
                
                // Client backup settings (desktop-settings.json only)
                settings.BackupSettingsEnabled = _backupSettingsEnabled;
                settings.MinimumSettingsBackupGapMinutes = _minimumSettingsBackupGapMinutes;
                settings.NumberOfSettingsBackups = _numberOfSettingsBackups;
                
                settings.LibraryGridViewEnabled = _libraryGridViewEnabled;

                settings.CoreServerBaseUrl = _coreServerBaseUrl;
                settings.CoreClientId = _coreClientId;

                // Filter state (always save an object, never null)
                settings.FilterState = _currentFilterState ?? new FilterState();
                
                settings.AutoTagScanFullLibrary = _autoTagScanFullLibrary;
                
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

                // Settings backup safety net (separate policy from library backups).
                CreateSettingsBackupIfNeeded(path);
                
                settingsStorage.Save(settings);
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

        private void CreateSettingsBackupIfNeeded(string settingsPath)
        {
            if (!_backupSettingsEnabled)
            {
                return;
            }

            try
            {
                if (!File.Exists(settingsPath))
                {
                    // No settings file yet, so nothing to back up.
                    return;
                }

                var backupDir = AppDataManager.GetBackupDirectoryPath();
                var backupFiles = Directory.GetFiles(backupDir, "desktop-settings.json.backup.*")
                    .Select(f => new FileInfo(f))
                    .OrderBy(BackupFileNaming.GetFileOrderingUtcTimestamp)
                    .ToList();

                var maxBackups = Math.Max(1, _numberOfSettingsBackups);
                var minGapMinutes = Math.Max(1, _minimumSettingsBackupGapMinutes);
                var nowUtc = DateTime.UtcNow;
                var lastBackupTime = backupFiles.Count > 0 ? BackupFileNaming.GetFileOrderingUtcTimestamp(backupFiles[^1]) : DateTime.MinValue;
                var hasLastBackup = backupFiles.Count > 0;
                var timeSinceLastBackup = hasLastBackup ? nowUtc - lastBackupTime : TimeSpan.MaxValue;

                if (backupFiles.Count >= maxBackups)
                {
                    if (hasLastBackup && timeSinceLastBackup.TotalMinutes < minGapMinutes)
                    {
                        var newest = backupFiles[^1];
                        newest.Delete();
                        backupFiles.RemoveAt(backupFiles.Count - 1);
                        Log($"SaveSettings: Deleted most recent settings backup (min gap {minGapMinutes}m): {newest.Name}");
                    }
                    else
                    {
                        var oldest = backupFiles[0];
                        oldest.Delete();
                        backupFiles.RemoveAt(0);
                        Log($"SaveSettings: Deleted oldest settings backup (max {maxBackups}): {oldest.Name}");
                    }
                }

                var timestamp = BackupFileNaming.FormatNowForBackupSuffix();
                var backupPath = Path.Combine(backupDir, $"desktop-settings.json.backup.{timestamp}");
                File.Copy(settingsPath, backupPath, true);
                Log($"SaveSettings: Created settings backup: {Path.GetFileName(backupPath)}");
            }
            catch (Exception ex)
            {
                Log($"SaveSettings: WARNING - Settings backup failed: {ex.Message}");
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
                if (!StoragePickerPath.TryGetLocalFilesystemPath(result[0], out var path) ||
                    string.IsNullOrWhiteSpace(path))
                {
                    StatusTextBlock.Text =
                        "Could not resolve folder path from picker. Try again or check desktop portal settings.";
                    Log("UI ACTION: ImportFolder folder selected but no local path (portal/sandbox picker).");
                    return;
                }

                Log($"UI ACTION: ImportFolder folder selected: {path}");
                try
                {
                    StatusTextBlock.Text = "Importing folder...";

                    if (!await EnsureCoreRuntimeAvailableAsync())
                    {
                        StatusTextBlock.Text = "Core runtime unavailable. Start ReelRoulette ServerApp and retry import.";
                        return;
                    }

                    var folderName = Path.GetFileName(path);
                    var response = await _coreServerApiClient.ImportSourceAsync(_coreServerBaseUrl, new CoreSourceImportRequest
                    {
                        RootPath = path,
                        DisplayName = folderName
                    });
                    if (response == null || !response.Accepted)
                    {
                        StatusTextBlock.Text = "Import request failed (API required).";
                        return;
                    }

                    Log($"UI ACTION: ImportFolder completed via API, imported {response.ImportedCount} items and updated {response.UpdatedCount} items");
                    await SyncSourcesFromCoreAsync();
                    _ = RequestCoreRefreshAsync();
                    StatusTextBlock.Text = $"Imported {response.ImportedCount} files (updated {response.UpdatedCount}) via core API.";
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Error importing folder: {ex.Message}";
                }
            }
        }

        private static string ReadZipEntryText(string zipPath, string entryName)
        {
            using var archive = ZipFile.OpenRead(zipPath);
            var entry = archive.GetEntry(entryName) ?? archive.GetEntry(entryName.Replace('/', '\\'));
            if (entry == null)
            {
                throw new InvalidOperationException($"Missing '{entryName}' in archive.");
            }

            using var reader = new StreamReader(entry.Open(), Encoding.UTF8);
            return reader.ReadToEnd();
        }

        private async void ExportLibraryMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: Export Library clicked");
            try
            {
                var optionsDialog = new LibraryExportOptionsDialog();
                var optionsResult = await optionsDialog.ShowDialog<bool?>(this);
                if (optionsResult != true)
                {
                    return;
                }

                var suggested = $"ReelRoulette-Library-{DateTime.UtcNow:yyyyMMdd-HHmmss}Z.zip";
                var saveTarget = await StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions
                {
                    Title = "Export Library",
                    SuggestedFileName = suggested,
                    DefaultExtension = "zip",
                    ShowOverwritePrompt = true,
                    FileTypeChoices =
                    [
                        new FilePickerFileType("Zip archive")
                        {
                            Patterns = ["*.zip"]
                        }
                    ]
                });

                if (saveTarget == null)
                {
                    return;
                }

                if (!StoragePickerPath.TryGetLocalFilesystemPath(saveTarget, out var outPath) ||
                    string.IsNullOrWhiteSpace(outPath))
                {
                    StatusTextBlock.Text = "Could not resolve export path from picker.";
                    return;
                }

                await Dispatcher.UIThread.InvokeAsync(BeginLibraryArchiveOperationUI);
                try
                {
                    await using (var fileStream = new FileStream(
                                     outPath,
                                     FileMode.Create,
                                     FileAccess.Write,
                                     FileShare.None,
                                     bufferSize: 81920,
                                     FileOptions.Asynchronous))
                    {
                        await LibraryArchiveMigration.WriteExportZipAsync(
                            fileStream,
                            optionsDialog.IncludeThumbnails,
                            optionsDialog.IncludeBackups,
                            CancellationToken.None).ConfigureAwait(true);
                    }
                }
                finally
                {
                    await Dispatcher.UIThread.InvokeAsync(EndLibraryArchiveOperationUI);
                }

                SetStatusMessage("Library export complete.", 0);
            }
            catch (Exception ex)
            {
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    if (_suppressStatusUpdatesForLibraryArchive)
                    {
                        EndLibraryArchiveOperationUI();
                    }
                });
                SetStatusMessage($"Export error: {ex.Message}", 0);
                Log($"ExportLibraryMenuItem_Click: {ex}");
            }
        }

        private async void ImportLibraryMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: Import Library clicked");
            try
            {
                var pick = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
                {
                    Title = "Select library export zip",
                    AllowMultiple = false,
                    FileTypeFilter =
                    [
                        new FilePickerFileType("Zip archive")
                        {
                            Patterns = ["*.zip"]
                        }
                    ]
                });

                if (pick.Count == 0 || pick[0] == null)
                {
                    return;
                }

                if (!StoragePickerPath.TryGetLocalFilesystemPath(pick[0], out var zipPath) ||
                    string.IsNullOrWhiteSpace(zipPath))
                {
                    StatusTextBlock.Text = "Could not resolve zip path from picker.";
                    return;
                }

                string libraryJson;
                try
                {
                    libraryJson = ReadZipEntryText(zipPath, "library.json");
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Could not read library from zip: {ex.Message}";
                    return;
                }

                var libRoot = JsonNode.Parse(libraryJson) as JsonObject;
                if (libRoot == null)
                {
                    StatusTextBlock.Text = "Invalid library.json in zip.";
                    return;
                }

                var roots = LibraryArchiveMigration.CollectUniqueSourceRootPaths(libRoot);
                if (roots.Count == 0)
                {
                    StatusTextBlock.Text = "This export has no source folders to map.";
                    return;
                }

                var remapDialog = new LibraryImportRemapDialog(roots);
                var remapOk = await remapDialog.ShowDialog<bool?>(this);
                if (remapOk != true || string.IsNullOrWhiteSpace(remapDialog.PlanJson))
                {
                    return;
                }

                LibraryImportRemapDialog.LibraryImportPlanPayload? planPayload;
                try
                {
                    planPayload = JsonSerializer.Deserialize<LibraryImportRemapDialog.LibraryImportPlanPayload>(
                        remapDialog.PlanJson!,
                        new JsonSerializerOptions(JsonSerializerDefaults.Web)
                        {
                            PropertyNameCaseInsensitive = true
                        });
                }
                catch (Exception ex)
                {
                    StatusTextBlock.Text = $"Invalid import plan: {ex.Message}";
                    return;
                }

                if (planPayload == null)
                {
                    StatusTextBlock.Text = "Invalid import plan.";
                    return;
                }

                var remap = planPayload.Remap ?? new Dictionary<string, string>(StringComparer.Ordinal);
                var skipped = new HashSet<string>(planPayload.SkippedRoots ?? [], StringComparer.Ordinal);

                var hasExisting = LibraryArchiveMigration.LibraryExistsWithContentOnDisk(AppDataManager.AppDataDirectory);
                var force = false;
                if (hasExisting)
                {
                    var confirm = new LibraryOverwriteConfirmDialog();
                    var replace = await confirm.ShowDialog<bool?>(this);
                    if (replace != true)
                    {
                        return;
                    }

                    force = true;
                }

                string? importErrorStatus = null;
                await Dispatcher.UIThread.InvokeAsync(BeginLibraryArchiveOperationUI);
                try
                {
                    LibraryArchiveImportResult importResult;
                    await using (var zipStream = File.OpenRead(zipPath))
                    {
                        importResult = LibraryArchiveMigration.ImportFromZipStream(zipStream, remap, skipped, force);
                    }

                    if (!importResult.Accepted)
                    {
                        if (importResult.NeedsForceConfirmation)
                        {
                            var confirmRetry = new LibraryOverwriteConfirmDialog();
                            var replace = await confirmRetry.ShowDialog<bool?>(this);
                            if (replace != true)
                            {
                                importErrorStatus = "Import cancelled.";
                            }
                            else
                            {
                                await using var zipRetry = File.OpenRead(zipPath);
                                importResult = LibraryArchiveMigration.ImportFromZipStream(zipRetry, remap, skipped, force: true);
                            }
                        }

                        if (importErrorStatus == null && !importResult.Accepted)
                        {
                            importErrorStatus = $"Import failed: {importResult.Message ?? "unknown error"}";
                        }
                    }

                    if (importErrorStatus == null)
                    {
                        try
                        {
                            var desktopJson = ReadZipEntryText(zipPath, "desktop-settings.json");
                            var dest = AppDataManager.GetSettingsPath();
                            var dir = Path.GetDirectoryName(dest);
                            if (!string.IsNullOrEmpty(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }

                            await File.WriteAllTextAsync(dest, desktopJson).ConfigureAwait(true);
                        }
                        catch (Exception ex)
                        {
                            Log($"ImportLibraryMenuItem_Click: desktop-settings.json not written: {ex.Message}");
                        }

                        if (await EnsureCoreRuntimeAvailableAsync())
                        {
                            await SyncLibraryProjectionFromCoreAsync();
                            _ = SyncSourcesFromCoreAsync();
                            _ = SyncPresetsFromCoreAsync();
                        }
                    }
                }
                finally
                {
                    await Dispatcher.UIThread.InvokeAsync(EndLibraryArchiveOperationUI);
                }

                if (importErrorStatus != null)
                {
                    StatusTextBlock.Text = importErrorStatus;
                    return;
                }

                SetStatusMessage("Library import complete.", 0);
            }
            catch (Exception ex)
            {
                await Dispatcher.UIThread.InvokeAsync(() =>
                {
                    if (_suppressStatusUpdatesForLibraryArchive)
                    {
                        EndLibraryArchiveOperationUI();
                    }
                });
                SetStatusMessage($"Import error: {ex.Message}", 0);
                Log($"ImportLibraryMenuItem_Click: {ex}");
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
                Log("UI ACTION: ClearPlaybackStats confirmed, clearing stats via API");
                if (!await EnsureCoreRuntimeAvailableAsync())
                {
                    StatusTextBlock.Text = "Core runtime unavailable. Start ReelRoulette ServerApp and retry clearing stats.";
                    return;
                }

                var response = await _coreServerApiClient.ClearPlaybackStatsAsync(_coreServerBaseUrl);
                if (response == null)
                {
                    Log("UI ACTION: ClearPlaybackStats failed (API required).");
                    StatusTextBlock.Text = "Clear playback stats failed (API required).";
                    return;
                }

                await SyncLibraryProjectionFromCoreAsync();
                RecalculateGlobalStats();
                UpdateCurrentFileStatsUi();
                Log($"UI ACTION: ClearPlaybackStats completed via API, cleared {response.ClearedCount} items");
                StatusTextBlock.Text = $"Playback stats cleared for {response.ClearedCount} items.";
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

        private async void AutoTagMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: AutoTagMenuItem clicked");

            if (_libraryIndex == null)
            {
                Log("AutoTagMenuItem_Click: Library index is not available");
                StatusTextBlock.Text = "Library is not available.";
                return;
            }

            var dialog = new AutoTagDialog(_libraryIndex, _autoTagScanFullLibrary, GetAutoTagScopeItems, ScanAutoTagViaCoreAsync);
            var result = await dialog.ShowDialog<bool?>(this);
            if (result != true)
            {
                Log("AutoTagMenuItem_Click: Cancelled by user");
                return;
            }

            _autoTagScanFullLibrary = dialog.ScanFullLibrary;
            SaveSettings();

            if (!dialog.ScanHasRun)
            {
                Log("AutoTagMenuItem_Click: OK without scan; setting saved only");
                StatusTextBlock.Text = "Auto Tag setting saved.";
                return;
            }

            var acceptedRows = dialog.GetAcceptedResults();
            if (acceptedRows.Count == 0)
            {
                Log("AutoTagMenuItem_Click: Scan completed but no rows selected; setting saved only");
                StatusTextBlock.Text = "No auto-tag matches selected.";
                return;
            }

            var changedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var assignments = new List<CoreAutoTagAssignment>();

            foreach (var row in acceptedRows)
            {
                var itemPaths = row.SelectedItemPaths
                    .Where(path => !string.IsNullOrWhiteSpace(path))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                if (itemPaths.Count == 0 || string.IsNullOrWhiteSpace(row.TagName))
                {
                    continue;
                }

                assignments.Add(new CoreAutoTagAssignment
                {
                    TagName = row.TagName,
                    ItemPaths = itemPaths
                });
                foreach (var itemPath in itemPaths)
                {
                    changedPaths.Add(itemPath);
                }
            }

            if (assignments.Count == 0)
            {
                StatusTextBlock.Text = "No auto-tag matches selected.";
                return;
            }

            var applyResponse = await ApplyAutoTagViaCoreAsync(assignments);
            if (applyResponse == null)
            {
                StatusTextBlock.Text = "Auto-tag apply failed (API required).";
                return;
            }

            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }

            if (_currentVideoPath != null && changedPaths.Contains(_currentVideoPath))
            {
                UpdateCurrentFileStatsUi();
            }

            Log($"AutoTagMenuItem_Click: Applied {applyResponse.AssignmentsAdded} tag assignments to {applyResponse.ChangedItemPaths.Count} item(s) across {acceptedRows.Count} selected tag row(s)");
            StatusTextBlock.Text = $"Applied {applyResponse.AssignmentsAdded} tags to {applyResponse.ChangedItemPaths.Count} item(s).";
        }

        private async void ManageSourcesMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("UI ACTION: ManageSourcesMenuItem clicked");
            await SyncSourcesFromCoreAsync();
            var dialog = new ManageSourcesDialog(
                FetchLibraryStatsViaCoreAsync,
                RequestCoreRefreshAsync,
                UpdateSourceEnabledViaCoreAsync,
                ScanDuplicatesViaCoreAsync,
                ApplyDuplicatesViaCoreAsync,
                _coreServerBaseUrl,
                _duplicateHandlingDefaultBehavior);
            await dialog.ShowDialog(this);
            
            Log("ManageSourcesMenuItem_Click: Dialog closed, refreshing UI");
            await SyncSourcesFromCoreAsync();
            // Refresh UI after dialog closes
            if (_showLibraryPanel)
            {
                UpdateLibraryPanel();
            }
            RecalculateGlobalStats();
            UpdateLibraryInfoText();
            
            // Rebuild queue to respect any source enable/disable changes
            RebuildPlayQueueIfNeeded();
        }

        private async Task<bool> UpdateSourceEnabledViaCoreAsync(string sourceId, bool isEnabled)
        {
            if (!_isCoreApiReachable || string.IsNullOrWhiteSpace(sourceId))
            {
                return false;
            }

            try
            {
                var updated = await _coreServerApiClient.UpdateSourceEnabledAsync(_coreServerBaseUrl, sourceId, isEnabled);
                return updated != null;
            }
            catch (Exception ex)
            {
                Log($"CoreSourceSync: Failed to update source '{sourceId}' ({ex.Message})");
                return false;
            }
        }

        private async Task<CoreDuplicateScanResponse?> ScanDuplicatesViaCoreAsync(DuplicateScanScope scope, string? sourceId)
        {
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return null;
            }

            var scopeValue = scope switch
            {
                DuplicateScanScope.CurrentSource => "CurrentSource",
                DuplicateScanScope.AllEnabledSources => "AllEnabledSources",
                _ => "AllSources"
            };

            try
            {
                return await _coreServerLongRunningApiClient.ScanDuplicatesAsync(_coreServerBaseUrl, new CoreDuplicateScanRequest
                {
                    Scope = scopeValue,
                    SourceId = sourceId
                });
            }
            catch (Exception ex)
            {
                Log($"CoreDuplicates: Scan failed ({ex.Message})");
                throw new InvalidOperationException(ex.Message, ex);
            }
        }

        private async Task<CoreDuplicateApplyResponse?> ApplyDuplicatesViaCoreAsync(List<CoreDuplicateApplySelection> selections)
        {
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return null;
            }

            try
            {
                return await _coreServerLongRunningApiClient.ApplyDuplicateSelectionAsync(_coreServerBaseUrl, new CoreDuplicateApplyRequest
                {
                    Selections = selections ?? []
                });
            }
            catch (Exception ex)
            {
                Log($"CoreDuplicates: Apply failed ({ex.Message})");
                return null;
            }
        }

        private async Task<CoreAutoTagScanResponse?> ScanAutoTagViaCoreAsync(bool scanFullLibrary, List<string> scopedItemPaths)
        {
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return null;
            }

            try
            {
                return await _coreServerLongRunningApiClient.ScanAutoTagAsync(_coreServerBaseUrl, new CoreAutoTagScanRequest
                {
                    ScanFullLibrary = scanFullLibrary,
                    ItemIds = scopedItemPaths ?? []
                });
            }
            catch (Exception ex)
            {
                Log($"CoreAutoTag: Scan failed ({ex.Message})");
                return null;
            }
        }

        private async Task<CoreAutoTagApplyResponse?> ApplyAutoTagViaCoreAsync(List<CoreAutoTagAssignment> assignments)
        {
            if (!await EnsureCoreCommandApiAvailableAsync())
            {
                return null;
            }

            try
            {
                return await _coreServerLongRunningApiClient.ApplyAutoTagAsync(_coreServerBaseUrl, new CoreAutoTagApplyRequest
                {
                    Assignments = assignments ?? []
                });
            }
            catch (Exception ex)
            {
                Log($"CoreAutoTag: Apply failed ({ex.Message})");
                return null;
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
            if (_isSettingsApplyInProgress)
            {
                Log("Settings: Open request ignored (apply already in progress)");
                SetStatusMessage("Settings are still applying. Please wait...", 0);
                return;
            }

            if (_isSettingsDialogOpen)
            {
                Log("Settings: Open request ignored (dialog already open)");
                return;
            }

            _isSettingsDialogOpen = true;
            Log("Settings: Opening Settings dialog");
            var dialogStopwatch = Stopwatch.StartNew();
            CancellationTokenSource? settingsOpenWatchdogCts = null;

            try
            {
                Log("Settings: Creating dialog instance...");
                var dialog = new SettingsDialog();
                Log("Settings: Dialog instance created.");

                if (_isCoreApiReachable)
                {
                    await SyncRefreshSettingsFromCoreAsync();
                    await SyncBackupSettingsFromCoreAsync();
                }
                else
                {
                    _serverBackupSettingsWritable = false;
                }

                dialog.WindowStartupLocation = WindowStartupLocation.CenterOwner;
                dialog.Topmost = this.Topmost;
                dialog.Opened += (_, __) => Log("Settings: Dialog Opened event fired");
                dialog.Closed += (_, __) => Log($"Settings: Dialog Closed event fired after {dialogStopwatch.ElapsedMilliseconds}ms");
                
                // Load current settings into dialog
                var intervalValue = IntervalNumericUpDown?.Value ?? 300;
                Log("Settings: Loading current values into dialog...");
                dialog.LoadFromSettings(
                    _isLoopEnabled,
                    _autoPlayNext,
                    _forceApiPlayback,
                    _duplicateHandlingDefaultBehavior,
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
                    _backupLibraryEnabled,
                    _minimumBackupGapMinutes,
                    _numberOfBackups,
                    _backupSettingsEnabled,
                    _minimumSettingsBackupGapMinutes,
                    _numberOfSettingsBackups,
                    _serverBackupSettingsWritable,
                    _autoRefreshSourcesEnabled,
                    _autoRefreshIntervalMinutes,
                    _forceRescanLoudnessOnNextRefresh,
                    _forceRescanDurationOnNextRefresh,
                    _fingerprintScanMaxDegreeOfParallelism,
                    _coreServerBaseUrl,
                    _webRemoteEnabled,
                    _webRemotePort,
                    _webRemoteBindOnLan,
                    _webRemoteLanHostname,
                    _webRemoteAuthMode,
                    _webRemoteSharedToken
                );
                Log("Settings: Dialog values loaded.");
                
                settingsOpenWatchdogCts = new CancellationTokenSource();
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await Task.Delay(5000, settingsOpenWatchdogCts.Token);
                        if (!settingsOpenWatchdogCts.IsCancellationRequested)
                        {
                            Log("Settings: ShowDialog is still waiting after 5000ms");
                        }
                    }
                    catch (TaskCanceledException)
                    {
                    }
                });

                Log("Settings: Calling ShowDialog...");
                await dialog.ShowDialog<bool?>(this);
                settingsOpenWatchdogCts.Cancel();
                Log("Settings: ShowDialog returned.");
                Log($"Settings: Dialog closed after {dialogStopwatch.ElapsedMilliseconds}ms (WasApplied={dialog.WasApplied})");
                
                if (dialog.WasApplied)
                {
                    Log("Settings: User clicked Apply, applying settings");
                    var applyStopwatch = Stopwatch.StartNew();
                    
                    // Set flag to prevent recursive SaveSettings calls
                    _isApplyingSettings = true;
                    _isSettingsApplyInProgress = true;
                    
                    try
                    {
                        var oldLoopEnabled = _isLoopEnabled;
                        var oldAutoPlayNext = _autoPlayNext;
                        var oldForceApiPlayback = _forceApiPlayback;
                        var oldDuplicateHandlingDefaultBehavior = _duplicateHandlingDefaultBehavior;
                        var oldRandomizationMode = _randomizationMode;
                        var oldSeekStep = _seekStep;
                        var oldVolumeStep = _volumeStep;
                        var oldVolumeNormalizationEnabled = _volumeNormalizationEnabled;
                        var oldMaxReductionDb = _maxReductionDb;
                        var oldMaxBoostDb = _maxBoostDb;
                        var oldBaselineAutoMode = _baselineAutoMode;
                        var oldBaselineOverrideLufs = _baselineOverrideLUFS;
                        var oldPhotoDuration = _photoDisplayDurationSeconds;
                        var oldScalingMode = _imageScalingMode;
                        var oldFixedWidth = _fixedImageMaxWidth;
                        var oldFixedHeight = _fixedImageMaxHeight;
                        var oldBackupEnabled = _backupLibraryEnabled;
                        var oldMinGap = _minimumBackupGapMinutes;
                        var oldBackupCount = _numberOfBackups;
                        var oldSettingsBackupEnabled = _backupSettingsEnabled;
                        var oldSettingsMinGap = _minimumSettingsBackupGapMinutes;
                        var oldSettingsBackupCount = _numberOfSettingsBackups;
                        var oldAutoRefreshEnabled = _autoRefreshSourcesEnabled;
                        var oldAutoRefreshInterval = _autoRefreshIntervalMinutes;
                        var oldForceLoudnessRescan = _forceRescanLoudnessOnNextRefresh;
                        var oldForceDurationRescan = _forceRescanDurationOnNextRefresh;
                        var oldFingerprintParallelism = _fingerprintScanMaxDegreeOfParallelism;
                        var oldWebRemoteEnabled = _webRemoteEnabled;
                        var oldWebRemotePort = _webRemotePort;
                        var oldWebRemoteBindOnLan = _webRemoteBindOnLan;
                        var oldWebRemoteLanHostname = _webRemoteLanHostname;
                        var oldWebRemoteAuthMode = _webRemoteAuthMode;
                        var oldWebRemoteSharedToken = _webRemoteSharedToken;

                    // Apply settings from dialog
                    _isLoopEnabled = dialog.LoopEnabled;
                    _autoPlayNext = dialog.AutoPlayNext;
                    _forceApiPlayback = dialog.ForceApiPlayback;
                    _duplicateHandlingDefaultBehavior = dialog.GetDuplicateHandlingDefaultBehavior();
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
                    _photoDisplayDurationSeconds = dialog.PhotoDisplayDurationSeconds;
                    Log($"Settings: Photo display duration changed from {oldPhotoDuration} to {_photoDisplayDurationSeconds} seconds");
                    
                    // Update image scaling settings
                    _imageScalingMode = dialog.ImageScalingMode;
                    _fixedImageMaxWidth = dialog.FixedImageMaxWidth;
                    _fixedImageMaxHeight = dialog.FixedImageMaxHeight;
                    Log($"Settings: Image scaling changed - Mode: {_imageScalingMode}, FixedMax: {_fixedImageMaxWidth}x{_fixedImageMaxHeight}");
                    
                    // Update backup settings
                    _backupLibraryEnabled = dialog.GetBackupLibraryEnabled();
                    _minimumBackupGapMinutes = dialog.GetMinimumBackupGapMinutes();
                    _numberOfBackups = dialog.GetNumberOfBackups();
                    _backupSettingsEnabled = dialog.GetBackupSettingsEnabled();
                    _minimumSettingsBackupGapMinutes = dialog.GetMinimumSettingsBackupGapMinutes();
                    _numberOfSettingsBackups = dialog.GetNumberOfSettingsBackups();
                    Log($"Settings: Backup settings changed - ServerEnabled: {oldBackupEnabled} -> {_backupLibraryEnabled}, ServerMinGap: {oldMinGap} -> {_minimumBackupGapMinutes} minutes, ServerCount: {oldBackupCount} -> {_numberOfBackups}, ClientEnabled: {oldSettingsBackupEnabled} -> {_backupSettingsEnabled}, ClientMinGap: {oldSettingsMinGap} -> {_minimumSettingsBackupGapMinutes} minutes, ClientCount: {oldSettingsBackupCount} -> {_numberOfSettingsBackups}");
                    
                    _autoRefreshSourcesEnabled = dialog.GetAutoRefreshSourcesEnabled();
                    _autoRefreshIntervalMinutes = Math.Clamp(dialog.GetAutoRefreshIntervalMinutes(), 5, 1440);
                    _forceRescanLoudnessOnNextRefresh = dialog.GetForceRescanLoudness();
                    _forceRescanDurationOnNextRefresh = dialog.GetForceRescanDuration();
                    _fingerprintScanMaxDegreeOfParallelism = Math.Clamp(dialog.GetFingerprintScanMaxDegreeOfParallelism(), 1, 16);
                    _coreServerBaseUrl = dialog.GetCoreServerBaseUrl();
                    ClientLogRelay.SetBaseUrl(_coreServerBaseUrl);
                    Log($"Settings: Auto-refresh settings changed - Enabled: {oldAutoRefreshEnabled} -> {_autoRefreshSourcesEnabled}, Interval: {oldAutoRefreshInterval} -> {_autoRefreshIntervalMinutes} minutes, ForceLoudness: {oldForceLoudnessRescan} -> {_forceRescanLoudnessOnNextRefresh}, ForceDuration: {oldForceDurationRescan} -> {_forceRescanDurationOnNextRefresh}, FingerprintParallelism: {oldFingerprintParallelism} -> {_fingerprintScanMaxDegreeOfParallelism} (server owns refresh scheduling)");

                    // Update Web UI settings
                    _webRemoteEnabled = dialog.GetWebRemoteEnabled();
                    _webRemotePort = dialog.GetWebRemotePort();
                    _webRemoteBindOnLan = dialog.GetWebRemoteBindOnLan();
                    _webRemoteLanHostname = NormalizeWebRemoteLanHostname(dialog.GetWebRemoteLanHostname());
                    _webRemoteAuthMode = dialog.GetWebRemoteAuthMode();
                    _webRemoteSharedToken = dialog.GetWebRemoteSharedToken();
                    Log($"Settings: Web UI settings changed - Enabled: {_webRemoteEnabled}, Port: {_webRemotePort}, BindOnLan: {_webRemoteBindOnLan}, LanHostname: {_webRemoteLanHostname}, AuthMode: {_webRemoteAuthMode}");

                        var settingsChanged =
                            oldLoopEnabled != _isLoopEnabled ||
                            oldAutoPlayNext != _autoPlayNext ||
                            oldForceApiPlayback != _forceApiPlayback ||
                            oldDuplicateHandlingDefaultBehavior != _duplicateHandlingDefaultBehavior ||
                            oldRandomizationMode != _randomizationMode ||
                            !string.Equals(oldSeekStep, _seekStep, StringComparison.OrdinalIgnoreCase) ||
                            oldVolumeStep != _volumeStep ||
                            oldVolumeNormalizationEnabled != _volumeNormalizationEnabled ||
                            Math.Abs(oldMaxReductionDb - _maxReductionDb) > 0.001 ||
                            Math.Abs(oldMaxBoostDb - _maxBoostDb) > 0.001 ||
                            oldBaselineAutoMode != _baselineAutoMode ||
                            Math.Abs(oldBaselineOverrideLufs - _baselineOverrideLUFS) > 0.001 ||
                            oldPhotoDuration != _photoDisplayDurationSeconds ||
                            oldScalingMode != _imageScalingMode ||
                            oldFixedWidth != _fixedImageMaxWidth ||
                            oldFixedHeight != _fixedImageMaxHeight ||
                            oldSettingsBackupEnabled != _backupSettingsEnabled ||
                            oldSettingsMinGap != _minimumSettingsBackupGapMinutes ||
                            oldSettingsBackupCount != _numberOfSettingsBackups ||
                            oldAutoRefreshEnabled != _autoRefreshSourcesEnabled ||
                            oldAutoRefreshInterval != _autoRefreshIntervalMinutes ||
                            oldForceLoudnessRescan != _forceRescanLoudnessOnNextRefresh ||
                            oldForceDurationRescan != _forceRescanDurationOnNextRefresh ||
                            oldFingerprintParallelism != _fingerprintScanMaxDegreeOfParallelism ||
                            oldWebRemoteEnabled != _webRemoteEnabled ||
                            oldWebRemotePort != _webRemotePort ||
                            oldWebRemoteBindOnLan != _webRemoteBindOnLan ||
                            !string.Equals(oldWebRemoteLanHostname, _webRemoteLanHostname, StringComparison.OrdinalIgnoreCase) ||
                            oldWebRemoteAuthMode != _webRemoteAuthMode ||
                            !string.Equals(oldWebRemoteSharedToken ?? string.Empty, _webRemoteSharedToken ?? string.Empty, StringComparison.Ordinal);

                        var autoRefreshChanged =
                            oldAutoRefreshEnabled != _autoRefreshSourcesEnabled ||
                            oldAutoRefreshInterval != _autoRefreshIntervalMinutes ||
                            oldForceLoudnessRescan != _forceRescanLoudnessOnNextRefresh ||
                            oldForceDurationRescan != _forceRescanDurationOnNextRefresh ||
                            oldFingerprintParallelism != _fingerprintScanMaxDegreeOfParallelism;

                        var backupSettingsChanged =
                            oldBackupEnabled != _backupLibraryEnabled ||
                            oldMinGap != _minimumBackupGapMinutes ||
                            oldBackupCount != _numberOfBackups;

                        var webRemoteChanged =
                            oldWebRemoteEnabled != _webRemoteEnabled ||
                            oldWebRemotePort != _webRemotePort ||
                            oldWebRemoteBindOnLan != _webRemoteBindOnLan ||
                            !string.Equals(oldWebRemoteLanHostname, _webRemoteLanHostname, StringComparison.OrdinalIgnoreCase) ||
                            oldWebRemoteAuthMode != _webRemoteAuthMode ||
                            !string.Equals(oldWebRemoteSharedToken ?? string.Empty, _webRemoteSharedToken ?? string.Empty, StringComparison.Ordinal);
                        var webRuntimeApplyFailed = false;

                        if (backupSettingsChanged)
                        {
                            if (!_isCoreApiReachable)
                            {
                                _backupLibraryEnabled = oldBackupEnabled;
                                _minimumBackupGapMinutes = oldMinGap;
                                _numberOfBackups = oldBackupCount;
                                _serverBackupSettingsWritable = false;
                                SetStatusMessage("Failed to apply server backup settings: core API is unavailable. Changes were reverted.", 0);
                                Log("Settings: Core API unavailable while applying server backup settings. Reverted local values.");
                            }
                            else
                            {
                                try
                                {
                                    using var backupSettingsTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                                    var updated = await _coreServerApiClient.UpdateBackupSettingsAsync(_coreServerBaseUrl, new CoreBackupSettingsSnapshot
                                    {
                                        Enabled = _backupLibraryEnabled,
                                        MinimumBackupGapMinutes = _minimumBackupGapMinutes,
                                        NumberOfBackups = _numberOfBackups
                                    }, backupSettingsTimeoutCts.Token);

                                    if (updated != null)
                                    {
                                        _backupLibraryEnabled = updated.Enabled;
                                        _minimumBackupGapMinutes = Math.Clamp(updated.MinimumBackupGapMinutes, 1, 10080);
                                        _numberOfBackups = Math.Clamp(updated.NumberOfBackups, 1, 100);
                                        _serverBackupSettingsWritable = true;
                                        Log("Settings: Core backup settings updated via API.");
                                    }
                                    else
                                    {
                                        _backupLibraryEnabled = oldBackupEnabled;
                                        _minimumBackupGapMinutes = oldMinGap;
                                        _numberOfBackups = oldBackupCount;
                                        _serverBackupSettingsWritable = false;
                                        SetStatusMessage("Failed to apply server backup settings (empty API response). Changes were reverted.", 0);
                                        Log("Settings: Core backup settings update returned no payload; reverted local values.");
                                    }
                                }
                                catch (Exception ex)
                                {
                                    _backupLibraryEnabled = oldBackupEnabled;
                                    _minimumBackupGapMinutes = oldMinGap;
                                    _numberOfBackups = oldBackupCount;
                                    _serverBackupSettingsWritable = false;
                                    SetStatusMessage("Failed to apply server backup settings. Changes were reverted.", 0);
                                    Log($"Settings: Failed to push core backup settings ({ex.Message}); reverted local values.");
                                }
                            }
                        }

                        if (autoRefreshChanged && _isCoreApiReachable)
                        {
                            try
                            {
                                using var refreshSettingsTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                                var updated = await _coreServerApiClient.UpdateRefreshSettingsAsync(_coreServerBaseUrl, new CoreRefreshSettingsSnapshot
                                {
                                    AutoRefreshEnabled = _autoRefreshSourcesEnabled,
                                    AutoRefreshIntervalMinutes = _autoRefreshIntervalMinutes,
                                    ForceRescanLoudness = _forceRescanLoudnessOnNextRefresh,
                                    ForceRescanDuration = _forceRescanDurationOnNextRefresh,
                                    FingerprintScanMaxDegreeOfParallelism = _fingerprintScanMaxDegreeOfParallelism
                                }, refreshSettingsTimeoutCts.Token);

                                if (updated != null)
                                {
                                    _autoRefreshSourcesEnabled = updated.AutoRefreshEnabled;
                                    _autoRefreshIntervalMinutes = Math.Clamp(updated.AutoRefreshIntervalMinutes, 5, 1440);
                                    _forceRescanLoudnessOnNextRefresh = updated.ForceRescanLoudness;
                                    _forceRescanDurationOnNextRefresh = updated.ForceRescanDuration;
                                    _fingerprintScanMaxDegreeOfParallelism = Math.Clamp(updated.FingerprintScanMaxDegreeOfParallelism, 1, 16);
                                    Log("Settings: Core refresh settings updated via API.");
                                }
                                else
                                {
                                    Log("Settings: Core refresh settings update returned no payload.");
                                }
                            }
                            catch (Exception ex)
                            {
                                Log($"Settings: Failed to push core refresh settings ({ex.Message})");
                            }
                        }

                        if (webRemoteChanged)
                        {
                            if (!_isCoreApiReachable)
                            {
                                webRuntimeApplyFailed = true;
                                _webRemoteEnabled = oldWebRemoteEnabled;
                                _webRemotePort = oldWebRemotePort;
                                _webRemoteBindOnLan = oldWebRemoteBindOnLan;
                                _webRemoteLanHostname = oldWebRemoteLanHostname;
                                _webRemoteAuthMode = oldWebRemoteAuthMode;
                                _webRemoteSharedToken = oldWebRemoteSharedToken;
                                SetStatusMessage("Failed to apply Web UI runtime settings: core API is unavailable. Changes were reverted.", 0);
                                Log("Settings: Core API unavailable while applying Web UI runtime settings. Reverted local values.");
                            }
                            else
                            {
                                try
                                {
                                    using var webRuntimeTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                                    var updated = await _coreServerApiClient.UpdateWebRuntimeSettingsAsync(_coreServerBaseUrl, new CoreWebRuntimeSettingsSnapshot
                                    {
                                        Enabled = _webRemoteEnabled,
                                        Port = _webRemotePort,
                                        BindOnLan = _webRemoteBindOnLan,
                                        LanHostname = _webRemoteLanHostname,
                                        AuthMode = _webRemoteAuthMode == WebUiAuthMode.Off ? "Off" : "TokenRequired",
                                        SharedToken = _webRemoteSharedToken
                                    }, webRuntimeTimeoutCts.Token);

                                    if (updated != null)
                                    {
                                        _webRemoteEnabled = updated.Enabled;
                                        _webRemotePort = updated.Port > 0 ? updated.Port : 45123;
                                        _webRemoteBindOnLan = updated.BindOnLan;
                                        _webRemoteLanHostname = NormalizeWebRemoteLanHostname(updated.LanHostname);
                                        _webRemoteAuthMode = string.Equals(updated.AuthMode, "Off", StringComparison.OrdinalIgnoreCase)
                                            ? WebUiAuthMode.Off
                                            : WebUiAuthMode.TokenRequired;
                                        _webRemoteSharedToken = updated.SharedToken;
                                        Log("Settings: Core web runtime settings updated via API.");
                                    }
                                    else
                                    {
                                        webRuntimeApplyFailed = true;
                                        _webRemoteEnabled = oldWebRemoteEnabled;
                                        _webRemotePort = oldWebRemotePort;
                                        _webRemoteBindOnLan = oldWebRemoteBindOnLan;
                                        _webRemoteLanHostname = oldWebRemoteLanHostname;
                                        _webRemoteAuthMode = oldWebRemoteAuthMode;
                                        _webRemoteSharedToken = oldWebRemoteSharedToken;
                                        SetStatusMessage("Failed to apply Web UI runtime settings (empty API response). Changes were reverted.", 0);
                                        Log("Settings: Core web runtime settings update returned no payload; reverted local values.");
                                    }
                                }
                                catch (Exception ex)
                                {
                                    webRuntimeApplyFailed = true;
                                    _webRemoteEnabled = oldWebRemoteEnabled;
                                    _webRemotePort = oldWebRemotePort;
                                    _webRemoteBindOnLan = oldWebRemoteBindOnLan;
                                    _webRemoteLanHostname = oldWebRemoteLanHostname;
                                    _webRemoteAuthMode = oldWebRemoteAuthMode;
                                    _webRemoteSharedToken = oldWebRemoteSharedToken;
                                    SetStatusMessage("Failed to apply Web UI runtime settings. Changes were reverted.", 0);
                                    Log($"Settings: Failed to push core web runtime settings ({ex.Message}); reverted local values.");
                                }
                            }

                            if (!webRuntimeApplyFailed)
                            {
                                Log("Settings: Web UI runtime update sent to core; worker runtime applies lifecycle updates.");
                                if (_webRemoteBindOnLan && IsLoopbackCoreServerBaseUrl(_coreServerBaseUrl))
                                {
                                    SetStatusMessage("Web UI LAN is enabled, but CoreServerBaseUrl is loopback. Start worker with --CoreServer:BindOnLan=true for LAN device API access.", 0);
                                    Log("Settings: Web UI LAN enabled while CoreServerBaseUrl is loopback; LAN clients may fail to reach API endpoints.");
                                }
                            }
                        }

                        if (OpenWebUiMenuItem != null)
                            OpenWebUiMenuItem.IsEnabled = _webRemoteEnabled;

                        // Update UI controls (these will trigger change handlers, but won't save due to flag)
                        Dispatcher.UIThread.Post(() =>
                        {
                            if (LoopToggle != null) LoopToggle.IsChecked = _isLoopEnabled;
                            if (AutoPlayNextCheckBox != null) AutoPlayNextCheckBox.IsChecked = _autoPlayNext;
                            UpdateRandomizationModeComboBox();
                            if (IntervalNumericUpDown != null) IntervalNumericUpDown.Value = dialog.TimerIntervalSeconds;
                        });
                        
                        // Apply loop setting to current media only when loop changed.
                        if (oldLoopEnabled != _isLoopEnabled &&
                            !string.IsNullOrEmpty(_currentVideoPath) &&
                            _currentMedia != null &&
                            _mediaPlayer != null &&
                            _libVLC != null)
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
                                if (string.IsNullOrWhiteSpace(_currentPlaybackSource))
                                {
                                    throw new InvalidOperationException("Current playback source is unavailable.");
                                }
                                _currentMedia = new Media(_libVLC, _currentPlaybackSource!, _currentPlaybackSourceType);
                                
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
                                EnsureVideoViewMediaPlayerAttached();
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
                        
                        if (settingsChanged)
                        {
                            // Save settings to disk (now that all fields are updated)
                            var saveSettingsStopwatch = Stopwatch.StartNew();
                            SaveSettings();
                            Log($"Settings: SaveSettings completed in {saveSettingsStopwatch.ElapsedMilliseconds}ms");
                            Log($"Settings: Applied and saved - Loop={_isLoopEnabled}, AutoPlay={_autoPlayNext}, ForceApiPlayback={_forceApiPlayback}, DuplicateHandlingDefault={_duplicateHandlingDefaultBehavior}, RandomizationMode={_randomizationMode}, SeekStep={_seekStep}, VolumeStep={_volumeStep}, VolumeNorm={_volumeNormalizationEnabled}");
                        }
                        else
                        {
                            Log("Settings: Apply completed with no effective setting changes");
                        }

                        Log($"Settings: Apply flow completed in {applyStopwatch.ElapsedMilliseconds}ms");
                    }
                    finally
                    {
                        // Always clear the flag
                        _isApplyingSettings = false;
                        _isSettingsApplyInProgress = false;
                    }
                }
                else
                {
                    Log("Settings: User cancelled, no changes applied");
                }
            }
            catch (Exception ex)
            {
                Log($"Settings: ERROR in dialog flow - {ex.GetType().Name}: {ex.Message}");
                Log($"Settings: ERROR stack - {ex.StackTrace}");
            }
            finally
            {
                if (settingsOpenWatchdogCts != null)
                {
                    settingsOpenWatchdogCts.Cancel();
                    settingsOpenWatchdogCts.Dispose();
                }

                _isSettingsDialogOpen = false;
                Log($"Settings: Handler finished in {dialogStopwatch.ElapsedMilliseconds}ms");
            }
        }

        private async void DiagnosticsMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            var diagnosticsText =
                $"Core server base URL: {_coreServerBaseUrl}\n" +
                $"Core client ID: {_coreClientId}\n" +
                $"Core session ID: {_coreSessionId}\n" +
                $"Last SSE revision: {_coreLastEventRevision}\n" +
                $"Core API reachable: {_isCoreApiReachable}";

            var dialog = new Window
            {
                Title = "Diagnostics",
                Width = 540,
                Height = 300,
                CanResize = true,
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            var diagnosticsBox = new TextBox
            {
                Text = diagnosticsText,
                IsReadOnly = true,
                AcceptsReturn = true,
                TextWrapping = Avalonia.Media.TextWrapping.Wrap,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch
            };

            var copy = new Button { Content = "Copy", MinWidth = 80, Margin = new Thickness(0, 0, 8, 0) };
            var close = new Button { Content = "Close", MinWidth = 80 };
            copy.Click += async (_, __) =>
            {
                try
                {
                    var clipboard = TopLevel.GetTopLevel(dialog)?.Clipboard;
                    if (clipboard != null)
                    {
                        await clipboard.SetTextAsync(diagnosticsText);
                        StatusTextBlock.Text = "Diagnostics copied to clipboard.";
                    }
                }
                catch (Exception ex)
                {
                    Log($"Diagnostics: Failed to copy to clipboard ({ex.Message})");
                }
            };
            close.Click += (_, __) => dialog.Close();

            dialog.Content = new StackPanel
            {
                Margin = new Thickness(12),
                Spacing = 8,
                Children =
                {
                    diagnosticsBox,
                    new StackPanel
                    {
                        Orientation = Orientation.Horizontal,
                        HorizontalAlignment = HorizontalAlignment.Right,
                        Children = { copy, close }
                    }
                }
            };

            await dialog.ShowDialog(this);
        }

        private void OpenWebUiMenuItem_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (!_webRemoteEnabled)
            {
                StatusTextBlock.Text = "Enable Web UI in Settings first.";
                return;
            }
            var host = _webRemoteBindOnLan
                ? NormalizeWebRemoteLanHostname(_webRemoteLanHostname) + ".local"
                : "localhost";
            var preferredUrl = BuildPreferredWebUiUrl(host);
            var fallbackUrl = $"http://localhost:{_webRemotePort}/";
            try
            {
                var processInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = preferredUrl,
                    UseShellExecute = true
                };
                System.Diagnostics.Process.Start(processInfo);
                Log($"OpenWebUi: Opened {preferredUrl}");
                if (_webRemoteBindOnLan)
                {
                    var lanHost = NormalizeWebRemoteLanHostname(_webRemoteLanHostname);
                    Log($"OpenWebUi: LAN hostname hint http://{lanHost}.local:{_webRemotePort}/");
                }
            }
            catch (Exception ex)
            {
                Log($"OpenWebUi: Preferred URL open failed ({preferredUrl}) - {ex.Message}; trying fallback {fallbackUrl}.");
                try
                {
                    var fallbackProcessInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = fallbackUrl,
                        UseShellExecute = true
                    };
                    System.Diagnostics.Process.Start(fallbackProcessInfo);
                    Log($"OpenWebUi: Opened fallback {fallbackUrl}");
                }
                catch (Exception fallbackEx)
                {
                    Log($"OpenWebUi: ERROR - {fallbackEx.Message}");
                    StatusTextBlock.Text = $"Could not open browser: {fallbackEx.Message}";
                }
            }
        }

        private string BuildPreferredWebUiUrl(string host)
        {
            if (Uri.TryCreate(_independentWebUiBaseUrl, UriKind.Absolute, out var configured))
            {
                var scheme = string.IsNullOrWhiteSpace(configured.Scheme) ? "http" : configured.Scheme;
                var builder = new UriBuilder(configured)
                {
                    Host = host,
                    Scheme = scheme,
                    Port = _webRemotePort
                };
                return builder.Uri.ToString();
            }

            return $"http://{host}:{_webRemotePort}/";
        }

        private static string NormalizeWebRemoteLanHostname(string? value)
        {
            var raw = string.IsNullOrWhiteSpace(value) ? "reel" : value.Trim().ToLowerInvariant();
            var chars = raw.Where(c => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-').ToArray();
            var normalized = new string(chars).Trim('-');
            if (string.IsNullOrWhiteSpace(normalized))
                return "reel";
            if (normalized.Length > 63)
                normalized = normalized.Substring(0, 63).Trim('-');
            return string.IsNullOrWhiteSpace(normalized) ? "reel" : normalized;
        }

        private static bool IsLoopbackCoreServerBaseUrl(string? baseUrl)
        {
            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
            {
                return true;
            }

            if (uri.IsLoopback)
            {
                return true;
            }

            var host = uri.Host;
            return string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(host, "127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(host, "::1", StringComparison.OrdinalIgnoreCase);
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
            var isUserInitiated = !_isApplyingSettings && !_isLoadingSettings && !_isProgrammaticUiSync;
            Log($"{(isUserInitiated ? "UI ACTION" : "STATE SYNC")}: AutoPlayNext changed to: {_autoPlayNext}");
            
            // Persist the setting (unless we're applying settings from dialog)
            if (!_isApplyingSettings && !_isLoadingSettings && !_isProgrammaticUiSync)
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
            
            Log($"ScanDurations_Click: Delegating duration scan request to core refresh pipeline for folder: {sourceRoots[0]}");
            _ = Task.Run(async () =>
            {
                var accepted = await RequestCoreRefreshAsync();
                if (!accepted)
                {
                    SetStatusMessage("Duration scan request deferred: core refresh unavailable or already running.", 0);
                }
            });
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
            
            Log($"ScanLoudness_Click: Delegating loudness scan request to core refresh pipeline for folder: {sourceRoots[0]}, RescanAll: {rescanAll}");
            _ = Task.Run(async () =>
            {
                var accepted = await RequestCoreRefreshAsync();
                if (!accepted)
                {
                    SetStatusMessage("Loudness scan request deferred: core refresh unavailable or already running.", 0);
                }
            });
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
            KeepPlayingMenuItem.IsChecked = _isKeepPlayingActive;
            // OnlyFavoritesMenuItem removed - now using FilterDialog
            FavoriteToggle.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
            BlacklistToggle.IsEnabled = !string.IsNullOrEmpty(_currentVideoPath);
            ManageTagsButton.IsEnabled = true;
            
            // Audio filter menu items removed - now using FilterDialog
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
            await SyncPresetsFromCoreAsync();
            await SyncFilterDialogCatalogFromCoreAsync();

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
                _activePresetName = await MatchPresetNameFromCoreAsync(_currentFilterState) ??
                                    ResolveMatchingPresetName(_currentFilterState, _filterPresets);
                
                Log($"FilterMenuItem: Saved {_filterPresets?.Count ?? 0} presets, active preset: {_activePresetName ?? "None"}");
                _ = SyncPresetsToCoreAsync();
                
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
                
                // Save filter state on UI thread (SaveSettings reads UI-owned properties).
                Log("  Saving filter state on UI thread...");
                SaveSettingsInternal(intervalValue);
                
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

            if (_libraryIndex == null)
            {
                Log("ManageTagsForCurrentVideo_Click: Library system not available");
                StatusTextBlock.Text = "Library system not available.";
                return;
            }

            var items = new List<LibraryItem>();
            if (!string.IsNullOrEmpty(_currentVideoPath))
            {
                var item = FindProjectionItemByPath(_currentVideoPath);
                if (item == null)
                {
                    Log($"ManageTagsForCurrentVideo_Click: Could not find library item for path: {_currentVideoPath}; opening tag editor with no selected item.");
                }
                else
                {
                    items.Add(item);
                }
            }

            Log(items.Count > 0
                ? $"ManageTagsForCurrentVideo_Click: Opening tags dialog for current video: {items[0].FileName}"
                : "ManageTagsForCurrentVideo_Click: Opening tags dialog with no selected item.");
            var dialog = new ItemTagsDialog(items, _libraryIndex, this);
            var result = await dialog.ShowDialog<bool?>(this);
            
            if (result == true)
            {
                Log(items.Count > 0
                    ? $"ManageTagsForCurrentVideo_Click: Tags updated for: {items[0].FileName}"
                    : "ManageTagsForCurrentVideo_Click: Tag catalog updated (no selected item)");
                // Save filter presets (in case tags were renamed/deleted)
                SaveSettings();
                // Update stats for current video
                UpdateCurrentFileStatsUi();
                StatusTextBlock.Text = items.Count > 0
                    ? $"Tags updated for {Path.GetFileName(_currentVideoPath)}"
                    : "Tag catalog updated.";
            }
        }

        private async void BlacklistToggle_Changed(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            Log("BlacklistToggle_Changed: Blacklist toggle changed event fired");
            if (_isApplyingCoreSync)
            {
                return;
            }

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

            if (_isCoreApiReachable)
            {
                try
                {
                    var state = await _coreServerApiClient.SetBlacklistWithStateAsync(
                        _coreServerBaseUrl,
                        path,
                        isBlacklisted,
                        _coreClientId,
                        _coreSessionId);
                    if (state == null)
                    {
                        SetStatusMessage("Core runtime rejected blacklist update.", 0);
                        return;
                    }

                    ApplyRemoteItemStateProjection(state.Path, state.IsFavorite, state.IsBlacklisted, state.IsBlacklisted
                        ? $"Blacklisted: {System.IO.Path.GetFileName(path)}"
                        : $"Removed from blacklist: {System.IO.Path.GetFileName(path)}");
                    return;
                }
                catch (Exception ex)
                {
                    Log($"BlacklistToggle_Changed: API call failed ({ex.Message})");
                }
            }
            
            SetStatusMessage("Core runtime is required for state changes. Please wait for startup and retry.", 0);
            await EnsureCoreRuntimeAvailableAsync();
            UpdatePerVideoToggleStates();
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
            ManageTagsButton.IsEnabled = true;

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
                var item = _libraryIndex.Items.FirstOrDefault(candidate =>
                    string.Equals(candidate.FullPath, _currentVideoPath, StringComparison.OrdinalIgnoreCase));
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
            _ = PlayFromPathAsync(previousVideo, addToHistory: false);
            PreviousButton.IsEnabled = _timelineIndex > 0;
            NextButton.IsEnabled = true;
        }

        private void NextButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (_playbackTimeline.Count == 0)
            {
                return;
            }

            if (_timelineIndex < _playbackTimeline.Count - 1)
            {
                _isNavigatingTimeline = true;
                _timelineIndex++;
                var nextVideo = _playbackTimeline[_timelineIndex];
                _ = PlayFromPathAsync(nextVideo, addToHistory: false);
                PreviousButton.IsEnabled = _timelineIndex > 0;
                NextButton.IsEnabled = _playbackTimeline.Count > 0;
            }
            else
            {
                PlayRandomVideo();
            }
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
                
            var item = FindProjectionItemByPath(path);
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
                    SetStatusMessage("Volume normalization enabled, but some videos lack loudness data. Run a core refresh for best results.");
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

        private void MuteButton_IsCheckedChanged(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
        {
            if (sender is not ToggleButton tb)
            {
                return;
            }

            if (tb.IsChecked == true)
            {
                MuteButton_Checked(sender, e);
            }
            else
            {
                MuteButton_Unchecked(sender, e);
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

            UpdateMuteButtonGlyph();
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

            UpdateMuteButtonGlyph();
        }

        private void UpdateMuteButtonGlyph()
        {
            if (MuteGlyph == null)
            {
                return;
            }

            var isMuted = MuteButton?.IsChecked == true || _isMuted;
            MuteGlyph.Text = isMuted ? "volume_off" : "volume_up";
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
            if (_playbackTimeline.Count == 0)
            {
                return;
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
                    EnsureVideoViewMediaPlayerAttached();
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




